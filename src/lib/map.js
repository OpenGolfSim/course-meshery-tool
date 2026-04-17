import fs from 'fs';
import path from 'path';
import osmtogeojson from 'osmtogeojson';

import { resourceRoot } from "./app";
import { geoJSONToSvgPaths } from './svg';
import { openProject, saveProjectSettings } from './project';


let cachedOverpass = {};

const tags = [
  'green',
  'fairway',
  'tee',
  'bunker',
  'rough',
  'water_hazard',
  // 'lateral_water_hazard',
  // 'cartpath'
];

// const USGS_GEOJSON = 'https://usgs.entwine.io/boundaries/resources.geojson';
const USGS_GEOJSON_PATH = path.join(resourceRoot(), 'extra-resources/usgs.geojson');

const DEFAULT_ENDPOINT = 'overpass-api.de';

const ENDPOINTS = {
  'overpass.private.coffee': 'https://overpass.private.coffee/api/interpreter',
  'overpass-api.de': 'https://overpass-api.de/api/interpreter',
};
// const OSM_OVERPASS = 'https://overpass.private.coffee/api/interpreter';
// const OSM_OVERPASS = 'https://overpass-api.de/api/interpreter';

let usgsData;
export async function lidarSources() {
  if (!usgsData) {
    const raw = await fs.promises.readFile(USGS_GEOJSON_PATH);
    usgsData = JSON.parse(raw.toString());
  }
  return usgsData;
}

export function listEndpoints() {
  return Object.keys(ENDPOINTS);
}

async function turboPassQuery(bbox, endpoint = '') {
  // ~"${tags.join('|')}"
  // ~"^(${tags.join('|')})$"
  // ~"${tags.join('|')}"
  // nwr["golf"="green"];
  
  // if we have searched this exact area before, use the cached results
  const bboxKey = bbox.join(',');
  
  // if our box hasn't changed, use the previous valid results
  if (cachedOverpass.key === bboxKey && !!cachedOverpass.data) {
    return cachedOverpass.data;
  }

  const queryTags = tags.map(tag => {
    return `nwr["golf"="${tag}"]`;
  }).join(';');

  const query = `
    [out:json][timeout:25][bbox:${bboxKey}];
    (${queryTags};);
    out body;
    >;
    out skel qt;
  `.replace(/\s+/g, ' ');
  try {
    // console.log('fetching shapes...', OSM_OVERPASS, query);
    const endpointUrl = ENDPOINTS?.[endpoint] ?? ENDPOINTS[DEFAULT_ENDPOINT];
    const response = await fetch(endpointUrl, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'user-agent': 'OGSMeshery/2.0'}
    });
    if (response.status === 200 && response.headers.get('content-type').startsWith('application/json')) {
      const data = await response.json();
      cachedOverpass = { key: bboxKey, data };
      return data;
    } else {
      const body = await response.text();
      throw { status: response.status, body };
    }
  } catch (error) {
    console.error(`OVERPASS API`, error);
    throw error;
  }  
}


export async function searchShapes(bbox) {
  const results = await turboPassQuery(bbox);

  if (results) {
    const geojson = osmtogeojson(results);
    const coursePaths = geoJSONToSvgPaths(geojson);
    console.log('coursePaths', coursePaths);
    openProject.coursePaths = coursePaths;
    await saveProjectSettings();

    return { coursePaths };
  }
}