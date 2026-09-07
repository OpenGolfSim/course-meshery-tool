import { expose, Transfer } from 'threads/worker';
import { Observable } from "observable-fns"

import { Document, NodeIO } from '@gltf-transform/core';
import {
  KHRMaterialsUnlit,
  KHRMeshQuantization,
  KHRTextureBasisu,
  KHRTextureTransform,
  KHRMaterialsSpecular,
  KHRMaterialsClearcoat,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
  KHRMaterialsIOR,
  EXTMeshGPUInstancing,
} from '@gltf-transform/extensions';
import { dedup, prune, normals } from "@gltf-transform/functions";
import BASIS from 'ktx2-basis';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import pica from 'pica';

import fs from "node:fs";
import path from "node:path";
import { addOBJ } from "../../trees/lib/obj.js";
import { addGLB } from "../../trees/lib/gltf.js";
import { generateFlowMap } from '../flowmap.js';

const KEEP = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0']);
// tree package format: all textures use this size
const TREE_TEXTURE_SIZE = 1024;
const resizer = pica();

async function resizeTexture(decoded, targetWidth, targetHeight) {
  const { data, width, height } = decoded;

  // 1. Premultiply: fold alpha into RGB so invisible pixels can't tint edges
  const pre = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    pre[i] = data[i] * a;
    pre[i + 1] = data[i + 1] * a;
    pre[i + 2] = data[i + 2] * a;
    pre[i + 3] = data[i + 3];
  }

  // 2. Resize (Lanczos)
  const out = await resizer.resizeBuffer({
    src: pre, width, height,
    toWidth: targetWidth, toHeight: targetHeight,
  });

  // 3. Un-premultiply: restore normal RGBA for the encoder
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a > 0) {
      out[i] = Math.min(255, (out[i] * 255) / a);
      out[i + 1] = Math.min(255, (out[i + 1] * 255) / a);
      out[i + 2] = Math.min(255, (out[i + 2] * 255) / a);
      out[i + 3] = a;
    }
  }

  return { width: targetWidth, height: targetHeight, data: out };
}


function decodeImage(data) {
  const buf = Buffer.from(data);
  
  console.log('[decode] magic:', buf.subarray(0, 4).toString('hex'), buf.subarray(8, 12).toString('ascii'));

  // JPEG magic bytes: 0xFF 0xD8
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    const { width, height, data: pixels } = jpeg.decode(buf, { useTArray: true });
    return { width, height, data: new Uint8Array(pixels) };
  }

  // Some exporters leave junk after the PNG IEND chunk; pngjs is strict — truncate there
  const iend = buf.indexOf('IEND');
  const pngBuf = iend !== -1 ? buf.subarray(0, iend + 8) : buf; // IEND(4) + CRC(4)
  const png = PNG.sync.read(pngBuf);

  // const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

const EXTENSIONS = [
  KHRMaterialsUnlit,
  KHRMeshQuantization,
  KHRTextureBasisu,
  KHRTextureTransform,
  KHRMaterialsSpecular,
  KHRMaterialsClearcoat,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
  KHRMaterialsIOR,
  EXTMeshGPUInstancing,
];


let basisPromise = null;

function initBasis(wasmPath) {
  if (!basisPromise) {
    const wasmBinary = fs.readFileSync(wasmPath);
    basisPromise = BASIS({ wasmBinary: new Uint8Array(wasmBinary) })
      .then(basis => { basis.initializeBasis(); return basis; });
  }
  return basisPromise;
}

async function encodeTexture(rawImageData, ktx2Options = {}) {
  const basis = await initBasis(ktx2Options.wasmPath);
  let decoded = decodeImage(rawImageData);
  const size = ktx2Options.textureSize;
  
  let targetW = decoded.width;
  let targetH = decoded.height;

  if (size) {
    targetW = size;
    targetH = size;
  } else {
    // Basis requires dimensions to be multiples of 4
    if (targetW % 4 !== 0) targetW += (4 - (targetW % 4));
    if (targetH % 4 !== 0) targetH += (4 - (targetH % 4));
  }

  if (decoded.width !== targetW || decoded.height !== targetH) {
    decoded = await resizeTexture(decoded, targetW, targetH);
  }

  const encoder = new basis.BasisEncoder();
  try {
    encoder.setUASTC(true);
    encoder.setCreateKTX2File(true);
    // encoder.setKTX2SRGBTransferFunc(true);
    encoder.setKTX2SRGBTransferFunc(ktx2Options.srgb !== false);
    encoder.setKTX2UASTCSupercompression(true);
    encoder.setMipGen(true);
    encoder.setSliceSourceImage(0, new Uint8Array(decoded.data), decoded.width, decoded.height, 0);
    
    // UASTC is ~1 byte per pixel. Mipmaps add ~33%. 2 bytes per pixel is extremely safe.
    const estimatedSize = Math.max(1024 * 1024 * 10, decoded.width * decoded.height * 2 + 1024);
    const resultData = new Uint8Array(estimatedSize);
    
    const resultSize = encoder.encode(resultData);
    if (resultSize === 0) throw new Error('KTX2 encode failed');
    // return new Uint8Array(resultData.buffer, 0, resultSize);
    return resultData.slice(0, resultSize);
  } finally {
    encoder.delete();
  }
}

async function compressTexture(rawImageBuffer, ktx2Options = {}) {
  const result = await encodeTexture(Buffer.from(rawImageBuffer), ktx2Options);
  return Transfer(result.buffer);
}


export async function exportTreePackage(inputFiles, outputFile, treeOptions = {}, ktx2Options = {}) {
  if (inputFiles.length < 1 || !outputFile?.endsWith(".glb")) {
    throw new Error('Invalid input or output files');
  }

  // Auto-generated billboard arrives as an ArrayBuffer; append as the last LOD input
  const inputs = inputFiles.map((p) => ({ path: p }));
  if (treeOptions.generatedBillboard) {
    inputs.push({ binary: new Uint8Array(treeOptions.generatedBillboard) });
  }
  
  const io = new NodeIO().registerExtensions(EXTENSIONS);
  
  const doc = new Document();
  for (const Ext of EXTENSIONS) {
    doc.createExtension(Ext);
  }
  
  const buffer = doc.createBuffer();
  const scene = doc.createScene("OGSTree");
  
  const root = doc.createNode("Tree").setExtras({
    // lod_count: inputFiles.length,
    lod_count: inputs.length,
    texture_size: TREE_TEXTURE_SIZE,
    format_version: 1,
  });

  scene.addChild(root);
  
  // for (let i = 0; i < inputFiles.length; i++) {
    // const ext = path.extname(inputFiles[i]).toLowerCase();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const ext = input.binary ? '.glb' : path.extname(input.path).toLowerCase();

    const name = `LOD${i}`;
    const lodNode = doc.createNode(name).setExtras({ lod_level: i });
    switch (ext) {
      case '.obj':
        addOBJ(doc, input.path, lodNode, name, buffer);
        // addOBJ(doc, inputFiles[i], lodNode, name, buffer);
        break;
      case '.glb':
        await addGLB(doc, input.binary ?? input.path, lodNode, name, io);
        // await addGLB(doc, inputFiles[i], lodNode, name, io);
        break;
      default:
        throw new Error(`Unsupported input type: ${ext}`);
    }
    if (treeOptions.scale) {
      const [x, y, z] = lodNode.getScale();
      lodNode.setScale([x * treeOptions.scale, y * treeOptions.scale, z * treeOptions.scale]);
    }

    root.addChild(lodNode);
  }
  
  // Each merged GLB brought its own buffer; GLB needs exactly one binary chunk.
  // Repoint every accessor at the original buffer, then prune the now-unused
  // buffers/orphan nodes and dedupe textures shared across LODs.
  for (const a of doc.getRoot().listAccessors()) {
    a.setBuffer(buffer);
  }
  await doc.transform(dedup(), prune());
  
  // Batching requires every geometry to have the same channel set
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) {
        if (!KEEP.has(semantic)) {
          console.warn(`Stripping ${semantic} from "${mesh.getName()}"`);
          prim.setAttribute(semantic, null);
        }
      }
    }
  }
  await doc.transform(prune());

  // Some source models ship without normals — compute them, never overwrite existing
  await doc.transform(normals({ overwrite: false }));

  // Tag how each material must be drawn: solid (trunk) or alpha-cutout (foliage)
  for (const mat of doc.getRoot().listMaterials()) {
    const cutout = mat.getAlphaMode() !== 'OPAQUE' || mat.getDoubleSided();
    mat.setExtras({ ...mat.getExtras(), batch: cutout ? 'foliage' : 'trunk' });
  }


  for (const texture of doc.getRoot().listTextures()) {
    console.log('Texture type: ', texture.getMimeType());
    if (texture.getMimeType() === 'image/ktx2') continue;
    const image = texture.getImage();
    if (!image) continue;
    // texture.setImage(await encodeTexture(image, ktx2Options));
    texture.setImage(await encodeTexture(image, { ...ktx2Options, textureSize: TREE_TEXTURE_SIZE }));
    texture.setMimeType('image/ktx2');
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);  
  
  await io.write(outputFile, doc);
  const mb = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2);
  console.log(`\nWrote ${outputFile} (${mb} MB)`);

}

export async function generateFlowMapPNG(polygon, spine) {
  const flowMapData = await generateFlowMap(polygon, spine);
  const { data, width, height } = flowMapData;
  const png = new PNG({ width, height, colorType: 6 }); // 6 = RGBA
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

expose({ compressTexture, exportTreePackage, generateFlowMapPNG });