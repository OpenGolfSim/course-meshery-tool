import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import logger from 'electron-log';
import { IMAGERY_DIR, MAP_SRS, PROJECT_FILE_PROTOCOL, TERRAIN_DIR, TIFF_SIZE } from '../constants.js';
import { getBin, getSpawnEnv } from './tools.js';
import { resourceRoot } from './app.js';
import { openProject, saveProjectSettings } from './project.js';
import { broadcast } from './window.js';

const log = logger.scope('GDAL');

const WMS_FOLDER = path.join(resourceRoot(), 'extra-resources/wms');


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
    '-t_srs', openProject.lidar.srs,
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