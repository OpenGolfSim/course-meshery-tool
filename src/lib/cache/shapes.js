import path from 'node:path';
import fs from 'node:fs';
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
    const data = JSON.parse(raw.toString());
    // meshData.layers = data.layers;
    if (data?.layers?.length) {

      openProject._meshes = data.layers;
    }
    if (data?.shapes) {
      meshData.shapes = new Map(data.shapes);
    }
  } catch (error) {
    console.log(error);
  }
}

export async function buildShapeCache() {
  const raw = JSON.stringify({
    shapes: Array.from(meshData.shapes ? meshData.shapes.entries() : new Map()),
    layers: openProject._meshes // .map(l => _.omitBy(l, (value, key) => key.startsWith('_')))
  });

  const cacheFolder = ensureCacheFolder();
  const filename = 'layer-cache.json';
  const cacheOutput = path.join(cacheFolder, filename);

  await fs.promises.writeFile(cacheOutput, raw);

  openProject.layerCache = {
    filename,
    filePath: cacheOutput,
    modifiedAt: Date.now()
  };
  await saveProjectSettings();
  broadcast('project.opened', openProject);
  
}