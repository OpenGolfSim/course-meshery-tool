import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import * as _ from 'lodash';
import { cachePlant, getPlantCache } from '../app';
import { RESOURCES_FILE_PROTOCOL } from '../../constants';
import { downloadAsset } from '../download.js';
import { saveTreeConfig } from '../project.js';
import { randomUUID } from 'crypto';

export const PLANT_CACHE = path.join(app.getPath('userData'), 'plant_cache');


const TREES = [
  {
    id: 'fir-large-v2',
    type: 'tree',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/batched/fir_large/fir_large_v3.png',
    asset: 'https://coursedata.opengolfsim.com/assets/batched/fir_large/fir_large_v3.glb',
    title: 'Fir Tree Large',
  },
  {
    id: 'oak-med-v2',
    type: 'tree',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/batched/oaktree_med/oaktree_med_v3.png',
    asset: 'https://coursedata.opengolfsim.com/assets/batched/oaktree_med/oaktree_med_v3.glb',
    title: 'Oak Tree Medium',
  },
];

let abortSignal;

export function ensurePlantCacheFolder() {
  if (!fs.existsSync(PLANT_CACHE)) {
    console.log(`Creating plant-cache at: ${PLANT_CACHE}`);
    fs.mkdirSync(PLANT_CACHE);
  } else {
    console.log(`The plant-cache folder already exists at: ${PLANT_CACHE}`);
  }
}

export async function downloadPlantAsset(plant, layerId) {
  const filename = `${plant.id}.glb`;
  const filePath = path.join(PLANT_CACHE, filename);

  console.log(`Download plant asset to cache: `, plant);
  await ensurePlantCacheFolder();
  
  abortSignal = new AbortController();

  console.log(`Download: ${plant.asset}`);
  console.log(`      to: ${filePath}`);
  
  await downloadAsset(plant.asset, filePath, abortSignal.signal, (update) => {
    console.log('Plant progress', { progress: update.progress, status: update.status });
  });

  const cachedPlant = _.omitBy(plant, (value, key) => key.startsWith('_'));

  cachePlant({
    ...cachedPlant,
    addedAt: new Date(),
    key: plant.id,
    filePath,
  });


  return getAvailablePlants();
}

export async function importPlantAsset(layerId, plant) {
  const id = randomUUID();
  return saveTreeConfig(layerId, {
    url: `${RESOURCES_FILE_PROTOCOL}://plant-cache/${path.basename(plant._cache.filePath)}`,
    filePath: plant._cache.filePath,
    name: plant.title,
    id,
    randomSeed: 12345,
    scaleRange: { min: 0.6, max: 1.8 },
    density: 0.2,
  });
}

export function getAvailablePlants(tree) {
  const plantCache = getPlantCache();
  console.log('Found cached plants', plantCache);
  return {
    custom: Object.values(plantCache).filter(p => p.type === 'custom').map(p => {
      return {
        ...p,
        thumbnail: `${RESOURCES_FILE_PROTOCOL}://plant-cache/${path.basename(p.thumbnail)}`,
        _cache: {
          ...p,
          _fileExists: true
        }
      }
    }),
    trees: TREES.map(plant => {
      const cache = plantCache?.[plant.id];
      let url;
      let exists = false;
      // TODO: remove from cache store when file is removed
      if (cache) {
        cache._fileExists = fs.existsSync(cache.filePath);
        // cache._url = `${RESOURCES_FILE_PROTOCOL}://plant-cache/${cache.filename}`;
      }
      return {
        ...plant,
        _cache: cache
      }
    })
  }
}