// Fetches public raster data (canopy height, forest-type land cover) for
// tree-mask generation, following this codebase's established GDAL-CLI-only
// convention for external raster data (see src/lib/imagery.js,
// src/lib/elevation-models/dem.js) - there is deliberately no JS
// GeoTIFF/COG-reading library used anywhere in this codebase's main process.
import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import { runGDALCommand } from '../imagery.js';
import { MAP_SRS, IMAGERY_DIR } from '../../constants.js';
import { openProject } from '../project.js';

// Meta/WRI Global Canopy Height (CC-BY 4.0, 1m resolution), hosted as
// public (no-sign-required) S3 GeoTIFF tiles. Unlike Copernicus DEM's
// predictable 1-degree tile naming, this dataset's tiling is irregular and
// must be resolved via its own spatial index (tiles.geojson) - verified
// directly against the live bucket: each feature has a `tile` id (9-digit
// quadkey-style string) and a lon/lat bounding polygon, and
// chm/<tile>.tif exists at that exact path and supports HTTP range
// requests (Accept-Ranges: bytes), so GDAL's /vsis3/ driver can read a
// small crop without downloading the whole tile.
const META_CHM_BUCKET = 'dataforgood-fb-data/forests/v1/alsgedi_global_v6_float';
const META_TILES_INDEX_URL = 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/tiles.geojson';

// Copernicus Global Land Cover (CGLS-LC100) Forest-Type layer, epoch 2019 -
// verified to be a single fixed global GeoTIFF (~1GB, not tiled), hosted on
// Zenodo. Confirmed reachable via GDAL's /vsicurl/ driver: plain HTTPS,
// range requests honored (HTTP 206 with Accept-Ranges: bytes). No
// tile-index lookup needed here, unlike the Meta dataset above - always the
// same URL. Zenodo does rate-limit its file API, so this should be fetched
// at most once per generation run (it is: fetchLandCoverGrid resamples
// straight to mask resolution in one gdalwarp call).
const CGLS_FOREST_TYPE_URL = 'https://zenodo.org/api/records/3939050/files/PROBAV_LC100_global_v3.0.1_2019-nrt_Forest-Type-layer_EPSG-4326.tif/content';

let cachedTilesIndex = null;

async function loadMetaTilesIndex() {
  if (cachedTilesIndex) return cachedTilesIndex;
  const response = await fetch(META_TILES_INDEX_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Meta canopy-height tile index: ${response.status}`);
  }
  cachedTilesIndex = await response.json();
  return cachedTilesIndex;
}

// Resolves which Meta canopy-height tile(s) cover the given bounds
// ({west,south,east,north}), returning their /vsis3/ GDAL virtual paths.
export async function resolveCanopyHeightTiles(bounds) {
  const index = await loadMetaTilesIndex();
  const bboxPoly = turf.bboxPolygon([bounds.west, bounds.south, bounds.east, bounds.north]);
  const matches = index.features.filter((feature) => {
    try {
      return turf.booleanIntersects(feature, bboxPoly);
    } catch (e) {
      return false;
    }
  });
  return matches.map((feature) => `/vsis3/${META_CHM_BUCKET}/chm/${feature.properties.tile}.tif`);
}

// The forest-type land-cover layer is a single global file - no per-bbox
// tile resolution needed, unlike canopy height.
export function resolveLandCoverPath() {
  return `/vsicurl/${CGLS_FOREST_TYPE_URL}`;
}

async function ensureWorkingSubdir(name) {
  const dir = path.join(openProject._workingDir, name);
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  return dir;
}

// One gdalwarp call: reprojects + resamples + resizes straight to the
// mask's exact resolution in a single pass, matching downloadCourseDEM's/
// generateSatelliteImage's idiom (-te/-t_srs/-ts/-r together instead of a
// separate resample step).
async function warpToMaskGrid(tilePaths, bounds, maskSize, resampler, outputTif) {
  if (!tilePaths.length) return false;
  await runGDALCommand('gdalwarp', [
    ...tilePaths,
    '-te', bounds.west, bounds.south, bounds.east, bounds.north,
    '-te_srs', MAP_SRS, '-t_srs', MAP_SRS,
    '-ts', `${maskSize}`, `${maskSize}`,
    '-r', resampler,
    '--config', 'AWS_NO_SIGN_REQUEST', 'YES',
    '-of', 'GTiff',
    outputTif,
  ]);
  return true;
}

// Reads a warped GeoTIFF's pixel values into a flat TypedArray via the
// gdal_translate-to-ENVI-raw idiom already proven in imagery.js's
// generateRAWFile(): a flat row-major binary dump with no header to parse.
async function readRasterAsArray(tifPath, maskSize, dtype) {
  const rawPath = tifPath.replace(/\.tif$/, '.raw');
  await runGDALCommand('gdal_translate', [
    '-of', 'ENVI', '-ot', dtype,
    '-outsize', `${maskSize}`, `${maskSize}`,
    tifPath, rawPath,
  ]);
  const buf = await fs.promises.readFile(rawPath);
  if (dtype === 'Float32') {
    return new Float32Array(buf.buffer, buf.byteOffset, maskSize * maskSize);
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, maskSize * maskSize);
}

// Canopy height in meters, resampled to the mask's resolution. Returns null
// if no Meta tile covers these bounds (the dataset has near-global coverage
// but isn't perfectly complete everywhere).
export async function fetchCanopyHeightGrid(bounds, maskSize) {
  const tiles = await resolveCanopyHeightTiles(bounds);
  if (!tiles.length) return null;

  const dir = await ensureWorkingSubdir(IMAGERY_DIR);
  const tif = path.join(dir, `canopy_${Date.now().toString(16)}.tif`);
  const ok = await warpToMaskGrid(tiles, bounds, maskSize, 'average', tif);
  return ok ? readRasterAsArray(tif, maskSize, 'Float32') : null;
}

// CGLS-LC100 forest-type class code per mask pixel. `near` resampling is
// required here - these are discrete class codes, never blend them.
export async function fetchLandCoverGrid(bounds, maskSize) {
  const dir = await ensureWorkingSubdir(IMAGERY_DIR);
  const tif = path.join(dir, `landcover_${Date.now().toString(16)}.tif`);
  const ok = await warpToMaskGrid([resolveLandCoverPath()], bounds, maskSize, 'near', tif);
  return ok ? readRasterAsArray(tif, maskSize, 'Byte') : null;
}
