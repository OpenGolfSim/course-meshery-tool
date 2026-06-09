import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import logger from 'electron-log';
import { IMAGERY_DIR, MAP_SRS, PROJECT_FILE_PROTOCOL, TERRAIN_DIR, TIFF_SIZE } from '../constants.js';
import { getBin, getSpawnEnv } from './tools.js';
import { resourceRoot } from './app.js';
import { openProject, refreshRawData, saveProjectSettings } from './project.js';
import { broadcast } from './window.js';
import { getCopernicusTilePaths } from './elevation-models/dem.js';

const log = logger.scope('GDAL');

const WMS_FOLDER = path.join(resourceRoot(), 'extra-resources/wms');
const MAX_DEM_TILES = 100;

function runGDALCommand(binaryName, options, onProgress) {
  log.debug(`Running ${binaryName} with options`, options);
  const binaryPath = getBin(binaryName);  
  let stderr = '';
  let stdout = '';
  let progress = 0;
  if (onProgress) onProgress({ progress });
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, options, { env: getSpawnEnv() });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      log.debug(`stderr: ${data}`);
    });
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (/^\d+$/.test(data)) {
        progress = parseInt(data, 10);
        if (onProgress) onProgress({ progress });
      }
      log.debug(`stdout (${progress}%): ${data}`);
    });
    child.on('close', (code) => {
      log.debug(`code: ${code}`);
      if (code === 0) {
        return resolve({ stderr, stdout });
      }
      reject(`Exited with code: ${code}`);
    });
  });
}


async function getElevationRange(tifPath) {
  const output = await runGDALCommand('gdalinfo', ['-stats', '-json', tifPath]);

  // const info = JSON.parse(output.stdout);
  // const [min, max] = info.bands[0].computedMin !== undefined
  //   ? [info.bands[0].computedMin, info.bands[0].computedMax]
  //   : info.bands[0].metadata[''].STATISTICS_MINIMUM
  //     ? [parseFloat(info.bands[0].metadata[''].STATISTICS_MINIMUM),
  //        parseFloat(info.bands[0].metadata[''].STATISTICS_MAXIMUM)]
  //     : [null, null];
  // const relief = max - min;
  // return { min, max, relief };

  const info = JSON.parse(output.stdout);
  const stats = info.bands[0].metadata[''];

  const mean = parseFloat(stats.STATISTICS_MEAN);
  const stddev = parseFloat(stats.STATISTICS_STDDEV);
  const rawMin = parseFloat(stats.STATISTICS_MINIMUM);
  const rawMax = parseFloat(stats.STATISTICS_MAXIMUM);

  // For a 1km area, real terrain should be within ~3 stddevs of the mean.
  // Water artifacts are huge outliers that blow out the raw min.
  const clampedMin = Math.max(rawMin, mean - 3 * stddev);
  const clampedMax = Math.min(rawMax, mean + 3 * stddev);
  const relief = clampedMax - clampedMin;

  return {
    min: clampedMin,
    max: clampedMax,
    mean,
    relief,
    stddev,
  };
}

/**
 * Convert lat/lon to tile coordinates at a given zoom level
 */
function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/**
 * Get all Mapzen terrain tile paths that intersect a bounding box
 */
function getMapzenTilePaths(bounds, zoom = 14) {
  const min = latLonToTile(bounds.south, bounds.west, zoom);
  const max = latLonToTile(bounds.north, bounds.east, zoom);

  // Note: tile Y is inverted — north has lower Y values
  const yMin = Math.min(min.y, max.y);
  const yMax = Math.max(min.y, max.y);
  const xMin = Math.min(min.x, max.x);
  const xMax = Math.max(min.x, max.x);
  
  const tileCount = (xMax - xMin + 1) * (yMax - yMin + 1);
  if (tileCount > MAX_DEM_TILES) {
    throw new Error(
      `Area too large: ${tileCount} tiles at zoom ${zoom} (max ${MAX_DEM_TILES}). ` +
      `Reduce the bounds or lower the zoom level.`
    );
  }

  const tiles = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push(
        `/vsis3/elevation-tiles-prod/geotiff/${zoom}/${x}/${y}.tif`
      );
    }
  }

  return tiles;
}

export async function downloadCourseDEM(bounds) {
  const imageryFolder = path.join(openProject._workingDir, IMAGERY_DIR);
  const fileId = Date.now().toString(16);
  const generatedFileTIFFp1 = `dsm_p1${fileId}.tif`;
  const outputTIFFp1 = path.join(imageryFolder, generatedFileTIFFp1);
  const generatedFileTIFFp2 = `dsm_p2${fileId}.tif`;
  const outputTIFFp2 = path.join(imageryFolder, generatedFileTIFFp2);
  const generatedFileTIFFp3 = `dsm_p3${fileId}.tif`;
  const outputTIFFp3 = path.join(imageryFolder, generatedFileTIFFp3);

  log.info('Generating DEM with bounds:', bounds);
  const tilePaths = getMapzenTilePaths(bounds);
  // const tilePaths = getCopernicusTilePaths(bounds);
  if (!tilePaths.length) {
    throw new Error('Empty tile set');
  }
  log.info(`Generating DEM from ${tilePaths.length} tiles`, tilePaths);

  if (!fs.existsSync(imageryFolder)) {
    log.info(`Creating imagery project directory...`);
    await fs.promises.mkdir(imageryFolder);
  }
  // MAP_SRS=EPSG:4326
  await runGDALCommand('gdalwarp', [
    ...tilePaths,
    '-te', `${bounds.west}`, `${bounds.south}`, `${bounds.east}`, `${bounds.north}`,
    '-te_srs', MAP_SRS,      // CRS of the bounding box coords
    '-t_srs', MAP_SRS,         // reproject output back to 4326

    '-srcnodata', '-32768',    // "treat any -32768 pixels in the source as empty"
    '-dstnodata', '-9999',     // "write -9999 into those pixels in the output"

    '--config', 'AWS_NO_SIGN_REQUEST', 'YES',
    outputTIFFp1
  ], (update) => {
    // console.log('imagery.progress', update);
    // broadcast('imagery.progress', { progress: update.progress * 100 });
  });

  const statsRaw = await getElevationRange(outputTIFFp1);
  const floor = Math.round(statsRaw.mean - 3 * statsRaw.stddev);

  // Perform a second pass on the data to remove super negative water/ocean values
  // set anything 500m below sea-level to nodata
  log.info('Finding values below real world minimum');
  await runGDALCommand('gdal_calc', [
    '-A', outputTIFFp1,
    `--outfile=${outputTIFFp2}`,
    `--calc=numpy.where(A > ${floor}, A, -9999)`,
    '--NoDataValue=-9999',
  ]);
  log.info('Filling missing data...');
  await runGDALCommand('gdal_fillnodata', [
    outputTIFFp2,
    outputTIFFp3
  ]);

  // fs.unlinkSync(outputTIFFp1);
  // fs.unlinkSync(outputTIFFp2);

  const stats = await getElevationRange(outputTIFFp3);

  const fileStats = fs.statSync(outputTIFFp3);
  const dem = {
    filePath: outputTIFFp3,
    fileName: generatedFileTIFFp3,
    size: fileStats.size
  };

  // openProject.lidar = { stats };
  openProject.dem = dem;
  openProject.stats = stats;

  const raw = await generateRAWFile();
  openProject.raw = raw;

  await saveProjectSettings();
  refreshRawData(true);
  broadcast('project.opened', openProject); 

  return { dem, raw };
}
export async function generateSatelliteImage(wmsSource) {
  // const { lidarSRS, bounds, wmsSource, outputFile } = options;
  const wmsPath = path.join(WMS_FOLDER, `${wmsSource || 'google'}.xml`);

  const bounds = openProject.settings.bounds;
  const generatedFileTIFF = `satellite_${wmsSource}_${Date.now().toString(16)}.tif`;
  const generatedFileJPEG = `satellite_${wmsSource}_${Date.now().toString(16)}.jpg`;

  const imageryFolder = path.join(openProject._workingDir, IMAGERY_DIR);
  const outputTIFF = path.join(imageryFolder, generatedFileTIFF);
  const outputJPEG = path.join(imageryFolder, generatedFileJPEG);
  log.debug(`outputTiff: ${outputTIFF}`);

  if (!fs.existsSync(imageryFolder)) {
    fs.mkdirSync(imageryFolder);
  }

  // const transform = proj4('EPSG:4326', openProject.lidar.srs);
  // const sw = transform.forward([bounds.west, openProject.settings.bounds.south]);
  // const ne = transform.forward([bounds.east, bounds.north]);

  let currentProgress = 0;
  const steps = 2;
  const totalProgress = steps * 100;

  await runGDALCommand('gdalwarp', [
    '-te', `${bounds.west}`, `${bounds.south}`, `${bounds.east}`, `${bounds.north}`,
    '-te_srs', MAP_SRS,      // CRS of the bounding box coords
    ...(openProject.lidar?.srs ? ['-t_srs', openProject.lidar?.srs ] : []),
    '-ts', `${TIFF_SIZE}`, `${TIFF_SIZE}`,
    '-r', 'bilinear',             // resampling method (better than nearest for imagery)
    '-of', 'GTiff',               // output format
    // '-co', 'COMPRESS=JPEG',       // compress — satellite imagery is huge at 8192x8192
    // '-co', 'JPEG_QUALITY=95',
    wmsPath,
    outputTIFF
  ], (update) => {
    currentProgress = update.progress;
    broadcast('imagery.progress', { progress: (currentProgress / totalProgress) * 100 });
  });

    // generate lower-res jpg
  await runGDALCommand('gdal_translate', [
    // '-if', 'JPEG',
    '-of', 'JPEG',
    '-r', 'cubic',
    '-co', 'QUALITY=95',
    '-outsize', `${TIFF_SIZE}`, `${TIFF_SIZE}`,
    outputTIFF,
    outputJPEG
  ], (update) => {
    currentProgress = 100 + update.progress;
    broadcast('imagery.progress', { progress: (currentProgress / totalProgress) * 100 });
  });

  const asset = {
    filePath: outputTIFF,
    filePathJPEG: outputJPEG,
    fileName: path.basename(outputTIFF),
    source: wmsSource,
    uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(IMAGERY_DIR, generatedFileJPEG)}`
  };

  const satellite = {
    ...openProject?.satellite || {},
    [wmsSource]: asset
  };
  
  openProject.satellite = satellite;

  await saveProjectSettings();
  broadcast('project.opened', openProject); 
  
  return { satellite };
}

export async function fillData(filePath) {
  if (!filePath) {
    throw new Error('Elevation TIF file missing!');
  }
  const terrainFolder = path.join(openProject._workingDir, TERRAIN_DIR);
  const generatedFile = `dem_${Date.now().toString(16)}.tif`;
  const outputTiff = path.join(terrainFolder, generatedFile);

  await runGDALCommand('gdal_fillnodata', [
    '-md', '1000', '-si', '2', filePath, outputTiff
  ]);
  return outputTiff;
}

export async function generateHillShade() {
  // const { lidarSRS, bounds, rawTiff, outputFile } = options;
  if (!openProject?.dem?.filePath) {
    throw new Error('Elevation TIF file missing!');
  }
  const generatedFile = `hillshade_${Date.now().toString(16)}.tif`;
  const generatedJPEG = `hillshade_${Date.now().toString(16)}.jpg`;

  const imageryFolder = path.join(openProject._workingDir, IMAGERY_DIR);
  const outputTiff = path.join(imageryFolder, generatedFile);
  const outputJPEG = path.join(imageryFolder, generatedJPEG);
  log.debug(`outputTiff: ${outputTiff}`);
  log.debug(`outputTiffLowRes: ${outputJPEG}`);

  if (!fs.existsSync(imageryFolder)) {
    fs.mkdirSync(imageryFolder);
  }

  // generate high res hill shade GeoTIFF
  await runGDALCommand('gdaldem', [
    'hillshade',
    openProject.dem.filePath,
    outputTiff,
    '-az', '315',          // sun azimuth (315 = northwest, cartographic standard)
    '-alt', '45',          // sun altitude in degrees
    '-z', '1.0',           // vertical exaggeration factor (raise to dramatize terrain)
    '-compute_edges',      // avoids black border artifacts at DEM edges
    // '-outsize', '8192', '8192',
    '-of', 'GTiff',
    '-co', 'COMPRESS=DEFLATE'
    // outputFile
  ]);

  // generate lower-res jpg
  await runGDALCommand('gdal_translate', [
    '-of', 'JPEG',
    '-r', 'cubic',
    '-co', 'QUALITY=95',
    '-outsize', '8192', '8192',
    outputTiff,
    outputJPEG
  ]);

  const hillShade = {
    filePath: outputTiff,
    filePathJPEG: outputJPEG,
    // filePathLowRes: outputTiffLowRes,
    uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(IMAGERY_DIR, generatedJPEG)}`
  };

  openProject.hillShade = hillShade;
  await saveProjectSettings();
  broadcast('project.opened', openProject); 

  return { hillShade };
}

export async function generateRAWFile() {
  // const { lidarSRS, bounds, rawTiff, outputFile } = options;
  if (!openProject?.dem?.filePath) {
    throw new Error('Elevation TIF file missing!');
  }
  if (!openProject?.stats) {
    throw new Error('Missing elevation stats!');
  }
  // const gdal_translate = getBin('gdal_translate');
  // log.debug(`gdalwarp: ${gdalwarp}`);
  const generatedFile = `terrain_${Date.now().toString(16)}.raw`;

  const imageryFolder = path.join(openProject._workingDir, TERRAIN_DIR);
  const outputRaw = path.join(imageryFolder, generatedFile);
  log.debug(`outputRaw: ${outputRaw}`);

  if (!fs.existsSync(imageryFolder)) {
    fs.mkdirSync(imageryFolder);
  }
  const options = [
    '-of', 'ENVI', '-ot', 'UInt16',
    '-scale', openProject.stats.min, openProject.stats.max, '0', '65535',
    '-outsize', '4097', '4097',
    '-r', 'bilinear',
    openProject.dem.filePath,
    outputRaw,
  ];
  log.debug('options', options);

  await runGDALCommand('gdal_translate', options);

  const raw = {
    filePath: outputRaw,
    uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(TERRAIN_DIR, generatedFile)}`
  };

  openProject.raw = raw;
  await saveProjectSettings();
  broadcast('project.opened', openProject); 

  return raw;
}

// export function generateRawFile() {
//         '-of', 'ENVI', '-ot', 'UInt16',
//       '-scale', stats.min, stats.max, '0', '65535',
//       '-outsize', '4097', '4097',
//       '-r', 'bilinear',
// }