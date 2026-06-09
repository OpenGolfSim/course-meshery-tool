import { Document, NodeIO } from "@gltf-transform/core";
import { dedup, prune } from "@gltf-transform/functions";
import fs from "node:fs";
import path from "node:path";
import { addOBJ } from "./obj.js";
import { addGLB } from "./gltf.js";

const inputFiles = process.argv.slice(2, -1);
const output = process.argv.at(-1);

if (inputFiles.length < 1 || !output?.endsWith(".glb")) {
  console.log("Usage: node generate-tree.js LOD0.obj [LOD1.obj ...] output.glb");
  process.exit(1);
}

const io = new NodeIO();
const doc = new Document();
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

await io.write(output, doc);
const mb = (fs.statSync(output).size / 1024 / 1024).toFixed(2);
console.log(`\nWrote ${output} (${mb} MB)`);