/**
 * Usage:
 * 
 * 
 * We recommend creating trees with LODs and billboards in SpeedTree, exporting as OBJ, and then using the below script to convert to a single GLB that can be used with Meshery tree planting.
 *
 * Usage:
 * 
 * npm run generate-tree -- \
 * /path/to/tree/Oak_LOD1.obj \
 * /path/to/tree/Oak_LOD2.obj \
 * /path/to/tree/Oak_LOD3.obj \
 * /output/OakTree.glb
 
*/
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { dedup, prune } from "@gltf-transform/functions";
import { KHRTextureBasisu } from "@gltf-transform/extensions";
import { ktx2 } from "ktx2-encoder/gltf-transform";
import sharp from "sharp";
import { addOBJ } from "../src/trees/lib/obj.js";
import { addGLB } from "../src/trees/lib/gltf.js";

const inputFiles = process.argv.slice(2, -1);
const output = process.argv.at(-1);

if (inputFiles.length < 1 || !output?.endsWith(".glb")) {
  console.log("Usage: node generate-tree.js LOD0.obj [LOD1.obj ...] output.glb");
  process.exit(1);
}

const io = new NodeIO().registerExtensions([KHRTextureBasisu]);

const doc = new Document();
doc.createExtension(KHRTextureBasisu);

const buffer = doc.createBuffer();
const scene = doc.createScene("SpeedTree");
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
    imageDecoder: async (data) => {
      const { info, data: raw } = await sharp(Buffer.from(data))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(raw.length);
      pixels.set(raw);
      return { width: info.width, height: info.height, data: pixels };
    }
  })
);

await io.write(output, doc);
const mb = (fs.statSync(output).size / 1024 / 1024).toFixed(2);
console.log(`\nWrote ${output} (${mb} MB)`);