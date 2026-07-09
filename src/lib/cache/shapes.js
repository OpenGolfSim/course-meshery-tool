import path from 'node:path';
import fs from 'node:fs';
import v8 from 'node:v8';
import * as _ from 'lodash';
import { CACHE_DIR } from '../../constants';
import { openProject, meshData, saveProjectSettings } from '../project';
import { ensureCacheFolder } from './utils';
import { broadcast } from '../window';

export async function parseShapeCache() {
  if (!openProject?.layerCache?.filePath) {
    return;
  }
  try {
    const raw = await fs.promises.readFile(openProject.layerCache.filePath);
    // const data = JSON.parse(raw.toString());
    const data = v8.deserialize(raw);
    // meshData.layers = data.layers;
    if (data?.layers?.length) {

      openProject._meshes = data.layers;
    }
    // if (data?.shapes) {
    //   meshData.shapes = new Map(data.shapes);
    // }
  } catch (error) {
    console.log(error);
  }
}

export async function buildShapeCache() {
  // const raw = JSON.stringify({
  //   shapes: Array.from(meshData.shapes ? meshData.shapes.entries() : new Map()),
  //   layers: openProject._meshes // .map(l => _.omitBy(l, (value, key) => key.startsWith('_')))
  // });
  const raw = v8.serialize({
    shapes: meshData.shapes ?? new Map(),
    layers: openProject._meshes // .map(l => _.omitBy(l, (value, key) => key.startsWith('_')))
  });


  const cacheFolder = ensureCacheFolder();
  // const filename = 'layer-cache.json';
  const filename = 'layer-cache.bin';
  const cacheOutput = path.join(cacheFolder, filename);

  await fs.promises.writeFile(cacheOutput, raw);

  const layerCache = {
    filename,
    filePath: cacheOutput,
    modifiedAt: Date.now()
  };
  openProject.layerCache = layerCache;
  await saveProjectSettings();
  // broadcast('project.opened', openProject);
  return { layerCache };
}