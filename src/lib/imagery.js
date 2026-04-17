import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import logger from 'electron-log';
import { IMAGERY_DIR, MAP_SRS, PROJECT_FILE_PROTOCOL, TERRAIN_DIR, TIFF_SIZE } from '../constants.js';
import { getBin, getSpawnEnv } from './tools.js';
import { resourceRoot } from './app.js';
import { openProject, saveProjectSettings } from './project.js';

const log = logger.scope('GDAL');

const WMS_FOLDER = path.join(resourceRoot(), 'extra-resources/wms');


function runGDALCommand(binaryName, options) {
  log.debug(`Running ${binaryName} with options`, options);
  const binaryPath = getBin(binaryName);  
  let stderr = '';
  let stdout = '';
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, options, { env: getSpawnEnv() });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      log.debug(`stderr: ${data}`);
    });
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      log.debug(`stdout: ${data}`);
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

export async function generateSatelliteImage(wmsSource) {
  // const { lidarSRS, bounds, wmsSource, outputFile } = options;
  const wmsPath = path.join(WMS_FOLDER, `${wmsSource || 'google'}.xml`);

  const bounds = openProject.settings.bounds;
  const generatedFile = `satellite_${wmsSource}_${Date.now().toString(16)}.tif`;

  const imageryFolder = path.join(openProject._workingDir, IMAGERY_DIR);
  const outputTiff = path.join(imageryFolder, generatedFile);
  log.debug(`outputTiff: ${outputTiff}`);

  if (!fs.existsSync(imageryFolder)) {
    fs.mkdirSync(imageryFolder);
  }

  // const transform = proj4('EPSG:4326', openProject.lidar.srs);
  // const sw = transform.forward([bounds.west, openProject.settings.bounds.south]);
  // const ne = transform.forward([bounds.east, bounds.north]);

  const gdalOptions = [
    '-te', `${bounds.west}`, `${bounds.south}`, `${bounds.east}`, `${bounds.north}`,
    '-te_srs', MAP_SRS,      // CRS of the bounding box coords
    '-t_srs', openProject.lidar.srs,
    '-ts', `${TIFF_SIZE}`, `${TIFF_SIZE}`,
    '-r', 'bilinear',             // resampling method (better than nearest for imagery)
    '-of', 'GTiff',               // output format
    '-co', 'COMPRESS=JPEG',       // compress — satellite imagery is huge at 8192x8192
    '-co', 'JPEG_QUALITY=90',
    wmsPath,
    outputTiff
  ];
  log.debug('gdalOptions', gdalOptions);
  await runGDALCommand('gdalwarp', gdalOptions);
  
  const asset = {
    filePath: outputTiff,
    fileName: path.basename(outputTiff),
    source: wmsSource,
    uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(IMAGERY_DIR, generatedFile)}`
  };

  const satellite = {
    ...openProject?.satellite || {},
    [wmsSource]: asset
  };
  
  openProject.satellite = satellite;

  await saveProjectSettings();
  
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

  const imageryFolder = path.join(openProject._workingDir, IMAGERY_DIR);
  const outputTiff = path.join(imageryFolder, generatedFile);
  log.debug(`outputTiff: ${outputTiff}`);

  if (!fs.existsSync(imageryFolder)) {
    fs.mkdirSync(imageryFolder);
  }

  const options = [
    'hillshade',
    openProject.dem.filePath,
    outputTiff,
    '-az', '315',          // sun azimuth (315 = northwest, cartographic standard)
    '-alt', '45',          // sun altitude in degrees
    '-z', '1.0',           // vertical exaggeration factor (raise to dramatize terrain)
    '-compute_edges',      // avoids black border artifacts at DEM edges
    '-of', 'GTiff',
    '-co', 'COMPRESS=DEFLATE'
    // outputFile
  ];
  log.debug('options', options);

  await runGDALCommand('gdaldem', options);

  const hillShade = {
    filePath: outputTiff,
    uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(IMAGERY_DIR, generatedFile)}`
  };

  openProject.hillShade = hillShade;
  await saveProjectSettings();

  return { hillShade };
}

export async function generateRAWFile() {
  // const { lidarSRS, bounds, rawTiff, outputFile } = options;
  if (!openProject?.dem?.filePath) {
    throw new Error('Elevation TIF file missing!');
  }
  if (!openProject?.lidar?.stats) {
    throw new Error('Missing lidar stats!');
  }
  const stats = openProject.lidar.stats;
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
    '-scale', stats.min, stats.max, '0', '65535',
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

  return raw;
}

// export function generateRawFile() {
//         '-of', 'ENVI', '-ot', 'UInt16',
//       '-scale', stats.min, stats.max, '0', '65535',
//       '-outsize', '4097', '4097',
//       '-r', 'bilinear',
// }