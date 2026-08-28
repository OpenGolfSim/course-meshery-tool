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
    id: 'ash-v1',
    type: 'tree',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/trees/ash-v1/ash-v1.png',
    asset: 'https://coursedata.opengolfsim.com/assets/trees/ash-v1/ash-v1.glb',
    title: 'Ash Tree',
  },
  {
    id: 'pine-v1',
    type: 'tree',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/trees/pine-v1/pine-1.png',
    asset: 'https://coursedata.opengolfsim.com/assets/trees/pine-v1/pine-1.glb',
    title: 'Pine Tree',
  },
  {
    id: 'willow-v1',
    type: 'tree',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/trees/willow-v1/willow-1.png',
    asset: 'https://coursedata.opengolfsim.com/assets/trees/willow-v1/willow-1.glb',
    title: 'Willow Tree',
  },
  {
    id: 'aspen-v1',
    type: 'tree',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/trees/aspen-v1/aspen-1.png',
    asset: 'https://coursedata.opengolfsim.com/assets/trees/aspen-v1/aspen-1.glb',
    title: 'Green Aspen Tree',
  },  
  {
    id: 'palm-v1',
    type: 'tree',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/trees/palm-v1/palm-1.png',
    asset: 'https://coursedata.opengolfsim.com/assets/trees/palm-v1/palm-1.glb',
    title: 'Palm Tree',
  },
  {
    id: 'tallgrass-v1',
    type: 'grasses',
    thumbnail: 'https://coursedata.opengolfsim.com/assets/trees/tallgrass-v1/tallgrass-1.png',
    asset: 'https://coursedata.opengolfsim.com/assets/trees/tallgrass-v1/tallgrass-1.glb',
    title: 'Tall Grass',
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
    minDistance: 5,
    density: 0.2,
  });
}

function mapPlant(plant, plantCache) {
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
    trees: TREES.filter(item => item.type === 'tree').map(plant => mapPlant(plant, plantCache)),
    grasses: TREES.filter(item => item.type === 'grasses').map(plant => mapPlant(plant, plantCache)),
  }
}