import { expose, Transfer } from 'threads/worker';
import { Observable } from "observable-fns"

import { Document, NodeIO } from '@gltf-transform/core';
// import { KHRTextureBasisu } from '@gltf-transform/extensions';
import {
  // KHRDracoMeshCompression,
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
import { ktx2 } from 'ktx2-encoder/gltf-transform';
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

async function compressTextures(glbBuffer) {
  // return new Observable(async observer => {

    const io = new NodeIO().registerExtensions(EXTENSIONS);
    const doc = await io.readBinary(new Uint8Array(glbBuffer));

    let textureCount = 0;
    let totalTextures = 0;

    // Count first
    doc.getRoot().listTextures().forEach(t => {
      totalTextures++;
      console.log(t.getName());
    });

    await doc.transform(
      ktx2({
        isUASTC: true,
        generateMipmap: true,
        imageDecoder: decodeImage
        // imageDecoder: async (data) => {
          // return decodeImage(data);
          // const { info, data: raw } = await sharp(Buffer.from(data))
          //   .ensureAlpha()
          //   .raw()
          //   .toBuffer({ resolveWithObject: true });
          // const pixels = new Uint8Array(raw.length);
          // pixels.set(raw);

          // observer.next({
          //   type: 'progress',
          //   progress: {
          //     total: totalTextures,
          //     current: ++textureCount
          //   }
          // });
          // return { width: info.width, height: info.height, data: pixels };
        // }
      })
    );

    const result = await io.writeBinary(doc);
    return Transfer(result.buffer);
    // observer.next({
    //   type: 'complete',
    //   buffer: Transfer(result.buffer)
    // });
    // observer.complete();
  // });
}

export async function exportTreePackage(inputFiles, outputFile) {

  // const inputFiles = process.argv.slice(2, -1);
  // const output = process.argv.at(-1);
  
  if (inputFiles.length < 1 || !outputFile?.endsWith(".glb")) {
    throw new Error('Invalid input or output files');
    // console.log("Usage: node generate-tree.js LOD0.obj [LOD1.obj ...] output.glb");
    // process.exit(1);
  }
  
  const io = new NodeIO().registerExtensions(EXTENSIONS);
  
  const doc = new Document();
  for (const Ext of EXTENSIONS) {
    doc.createExtension(Ext);
  }
  // doc.createExtension(KHRTextureBasisu);
  
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
  
  await doc.transform(
    dedup(),
    prune(),
    ktx2({
      isUASTC: true,
      generateMipmap: true,
      imageDecoder: decodeImage
      // imageDecoder: async (data) => {
        // const { info, data: raw } = await sharp(Buffer.from(data))
        //   .ensureAlpha()
        //   .raw()
        //   .toBuffer({ resolveWithObject: true });
        // const pixels = new Uint8Array(raw.length);
        // pixels.set(raw);
        // return { width: info.width, height: info.height, data: pixels };
      // }
    })
  );
  
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

expose({ compressTextures, exportTreePackage, generateFlowMapPNG });