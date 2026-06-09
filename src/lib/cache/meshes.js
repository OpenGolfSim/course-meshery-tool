import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { openProject, meshData, saveProjectSettings } from '../project';
import { ensureCacheFolder } from './utils';
import { meshNodeForLayer } from '../export/gltf';
import { broadcast } from '../window';
import { CACHE_DIR, PROJECT_FILE_PROTOCOL } from '../../constants';

export async function parseMeshCache() {
  if (!openProject?.meshCache?.filePath) {
    return;
  }
  const io = new NodeIO();
  const document = await io.read(openProject.meshCache.filePath);
  const root = document.getRoot();
  const meshes = new Map();

  let count = 0;
  for (const node of root.listNodes()) {
    const extras = node.getExtras();
    const type = extras?.type;
    const id = extras?.id;
    if (type !== 'course' || !id) continue;

    const mesh = node.getMesh();
    if (!mesh) continue;

    // You only add one primitive per mesh, so grab the first
    const prim = mesh.listPrimitives()[0];
    if (!prim) continue;

    const points    = prim.getAttribute('POSITION')?.getArray();   // Float32Array
    const normals   = prim.getAttribute('NORMAL')?.getArray();     // Float32Array
    const colors    = prim.getAttribute('COLOR_0')?.getArray();    // Float32Array
    const triangles = [...prim.getIndices()?.getArray() || []];               // Uint32Array

    meshes.set(id, {
      mesh: { points, triangles, normals, colors },
      name: extras.name || extras.id,
      // surface: extras.surface,
    });
    count++;
  }
  meshData.meshes = meshes;

  meshData.state.error = undefined;
  meshData.state.generated = count;
  meshData.state.lastGenerated = Date.now();

}

export async function buildMeshCache() {
  const cacheFolder = ensureCacheFolder();
  const filename = 'mesh-cache.glb';
  const cacheOutput = path.join(cacheFolder, filename);
  
  // stash mesh data in a GLB file
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('root');

  for (const layer of openProject._meshes) {
    const mesh = meshData.meshes.get(layer.id)?.mesh;
    if (!mesh) {
      console.log('Missing meshData record');
      return;
    }
    const meshNode = meshNodeForLayer(doc, buffer, layer, mesh);
    scene.addChild(meshNode);
  }

  doc.getRoot().setExtras({ exportedBy: 'OGS-Meshery' });

  await new NodeIO().write(cacheOutput, doc);

  openProject.meshCache = {
    filePath: cacheOutput,
    url: `${PROJECT_FILE_PROTOCOL}://${CACHE_DIR}/${filename}`,
    modifiedAt: Date.now()
  };
  await saveProjectSettings();
}