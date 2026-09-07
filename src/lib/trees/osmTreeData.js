// Fetches OpenStreetMap tree data (individual `natural=tree` points and
// `natural=wood`/`landuse=forest` polygons) for tree-mask generation.
//
// Deliberately separate from src/lib/osmUtils.js's OSM_MAPPING: that table
// drives course-*surface* generation (feeds geoJSONToSvgPaths -> mesh
// layers). Tree masks are a different consumer entirely (raster density
// masks, no mesh geometry), so this keeps its own small tag mapping/query
// rather than overloading that one.
import osmtogeojson from 'osmtogeojson';
import * as turf from '@turf/turf';
import { projectLonLatToCourseMM } from '../svg.js';

const TREE_OSM_MAPPING = {
  natural: { tree: 'point', wood: 'area' },
  landuse: { forest: 'area' },
};

// Same default Overpass endpoint as src/lib/map.js's turboPassQuery.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export function buildTreeOverpassQueryTags() {
  const queries = [];
  for (const [key, values] of Object.entries(TREE_OSM_MAPPING)) {
    for (const val of Object.keys(values)) {
      queries.push(`nwr["${key}"="${val}"]`);
    }
  }
  return queries.join(';');
}

let cachedTreeOverpass = {};

// bbox: [south, west, north, east], matching Overpass's [bbox:...] filter
// order (same convention as map.js's turboPassQuery/searchShapes).
async function fetchTreeOverpassData(bbox) {
  const bboxKey = bbox.join(',');
  if (cachedTreeOverpass.key === bboxKey && cachedTreeOverpass.data) {
    return cachedTreeOverpass.data;
  }

  const queryTags = buildTreeOverpassQueryTags();
  const query = `
    [out:json][timeout:25][bbox:${bboxKey}];
    (${queryTags};);
    out body;
    >;
    out skel qt;
  `.replace(/\s+/g, ' ');

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'user-agent': 'OGSMeshery/2.0' },
  });

  if (!(response.status === 200 && response.headers.get('content-type')?.startsWith('application/json'))) {
    const body = await response.text();
    throw { status: response.status, body };
  }

  const data = await response.json();
  cachedTreeOverpass = { key: bboxKey, data };
  return data;
}

// Returns { points, woods }: raw (unprojected, lon/lat) GeoJSON features.
export async function fetchTreeOsmData(bbox) {
  const overpassData = await fetchTreeOverpassData(bbox);
  const geojson = osmtogeojson(overpassData);

  const points = [];
  const woods = [];
  for (const feature of geojson.features) {
    const g = feature.geometry;
    if (!g) continue;
    const props = feature.properties || {};

    if (props.natural === 'tree' && g.type === 'Point') {
      points.push(feature);
    } else if (
      (props.natural === 'wood' || props.landuse === 'forest') &&
      (g.type === 'Polygon' || g.type === 'MultiPolygon')
    ) {
      woods.push(feature);
    }
  }
  return { points, woods };
}

// Projects OSM tree points into mask-pixel space: [{ px, py }].
export function projectTreePointsToMask(points, bounds, size, maskSize) {
  const scale = maskSize / size;
  return points.map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const [mmX, mmY] = projectLonLatToCourseMM(lon, lat, bounds, size);
    return { px: mmX * scale, py: mmY * scale };
  });
}

// Crops wood/forest polygons to the course bounds and projects them into
// mask-pixel-space rings: [{ outerRing: [[x,y],...], holeRings: [[...],...] }].
export function projectWoodPolygonsToMask(woods, bounds, size, maskSize) {
  const scale = maskSize / size;
  const boundsBox = [bounds.west, bounds.south, bounds.east, bounds.north];
  const projectRing = (ring) => ring.map(([lon, lat]) => {
    const [mmX, mmY] = projectLonLatToCourseMM(lon, lat, bounds, size);
    return [mmX * scale, mmY * scale];
  });

  const polygons = [];
  for (const feature of woods) {
    let cropped;
    try {
      cropped = turf.bboxClip(feature, boundsBox);
    } catch (e) {
      console.warn('Clipping failed for wood/forest feature, skipping', e);
      continue;
    }
    const g = cropped?.geometry;
    if (!g || !g.coordinates || g.coordinates.length === 0) continue;

    const polygonRingSets = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polygonRingSets) {
      if (!rings.length) continue;
      const projectedRings = rings.map(projectRing);
      polygons.push({ outerRing: projectedRings[0], holeRings: projectedRings.slice(1) });
    }
  }
  return polygons;
}
