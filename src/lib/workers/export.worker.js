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
import BASIS from 'ktx2-basis';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

import fs from "node:fs";
import path from "node:path";
import { dedup, prune } from "@gltf-transform/functions";
import { addOBJ } from "../../trees/lib/obj.js";
import { addGLB } from "../../trees/lib/gltf.js";
import { generateFlowMap } from '../flowmap.js';


function decodeImage(data) {
  const buf = Buffer.from(data);
  // JPEG magic bytes: 0xFF 0xD8
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    const { width, height, data: pixels } = jpeg.decode(buf, { useTArray: true });
    return { width, height, data: new Uint8Array(pixels) };
  }
  const png = PNG.sync.read(buf);
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
  const decoded = decodeImage(rawImageData);
  const encoder = new basis.BasisEncoder();
  try {
    encoder.setUASTC(true);
    encoder.setCreateKTX2File(true);
    encoder.setKTX2SRGBTransferFunc(true);
    encoder.setKTX2UASTCSupercompression(true);
    encoder.setMipGen(true);
    encoder.setSliceSourceImage(0, new Uint8Array(decoded.data), decoded.width, decoded.height, 0);
    const resultData = new Uint8Array(1024 * 1024 * 10);
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


export async function exportTreePackage(inputFiles, outputFile, ktx2Options = {}) {
  if (inputFiles.length < 1 || !outputFile?.endsWith(".glb")) {
    throw new Error('Invalid input or output files');
  }
  
  const io = new NodeIO().registerExtensions(EXTENSIONS);
  
  const doc = new Document();
  for (const Ext of EXTENSIONS) {
    doc.createExtension(Ext);
  }
  
  const buffer = doc.createBuffer();
  const scene = doc.createScene("OGSTree");
  const root = doc.createNode("Tree").setExtras({ lod_count: inputFiles.length });
  scene.addChild(root);
  
  for (let i = 0; i < inputFiles.length; i++) {
    const ext = path.extname(inputFiles[i]).toLowerCase();
    const name = `LOD${i}`;
    const lodNode = doc.createNode(name).setExtras({ lod_level: i });
    switch (ext) {
      case '.obj':
        addOBJ(doc, inputFiles[i], lodNode, name, buffer);
        break;
      case '.glb':
        await addGLB(doc, inputFiles[i], lodNode, name, io);
        break;
      default:
        throw new Error(`Unsupported input type: ${ext}`);
  
    }
    root.addChild(lodNode);   // attach the LOD to the Tree
  }
  
  // Each merged GLB brought its own buffer; GLB needs exactly one binary chunk.
  // Repoint every accessor at the original buffer, then prune the now-unused
  // buffers/orphan nodes and dedupe textures shared across LODs.
  for (const a of doc.getRoot().listAccessors()) a.setBuffer(buffer);
  await doc.transform(dedup(), prune());
  
  for (const texture of doc.getRoot().listTextures()) {
    if (texture.getMimeType() === 'image/ktx2') continue;
    const image = texture.getImage();
    if (!image) continue;
    texture.setImage(await encodeTexture(image, ktx2Options));
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