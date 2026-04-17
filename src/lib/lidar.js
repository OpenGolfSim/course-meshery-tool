import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { dialog } from 'electron';
import proj4 from 'proj4';
import { parse } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import logger from 'electron-log';
import { resourceRoot } from './utils.js';
import { openProject, refreshRawData, saveProjectSettings } from './project.js';
import { getBin, getSpawnEnv } from './tools.js';
import { TERRAIN_DIR } from '../constants.js';
import { fillData, generateRAWFile } from './imagery.js';

const log = logger.scope('TERRAIN');

async function fetchMetadata(metadataUri) {
  return fetch(metadataUri).then(res => res.json());
}

// Conversion factors to meters
const UNIT_TO_METERS = {
  'metre': 1.0,
  'meter': 1.0,
  'm': 1.0,
  'foot': 0.3048,                  // international foot
  'ft': 0.3048,
  'foot_us': 1200 / 3937,          // US survey foot ≈ 0.3048006096
  'us survey foot': 1200 / 3937,
  'foot_survey_us': 1200 / 3937,
};

function getUnitFactor(unitString) {
  if (!unitString) return null;
  const normalized = unitString.toLowerCase().trim();
  return UNIT_TO_METERS[normalized] ?? null;
}

async function getHeightStatsInMeters(lazPath) {
  return new Promise((resolve, reject) => {
    // Request both stats AND metadata so we can inspect the SRS
    // const info = spawn('pdal', [
    //   'info',
    //   '--stats',
    //   '--metadata',
    //   '--dimensions', 'Z',
    //   lazPath
    // ]);
    const info = spawn(
      getBin('pdal'),
      [
        'info',
        '--stats',
        '--metadata',
        '--dimensions', 'Z',
        lazPath
      ],
      { env: getSpawnEnv() }
    );

    let out = '';
    let err = '';
    info.stdout.on('data', (d) => out += d);
    info.stderr.on('data', (d) => err += d);

    info.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`pdal info exited ${code}: ${err}`));
      }

      let result;
      try {
        result = JSON.parse(out);
      } catch (e) {
        return reject(new Error(`Failed to parse pdal info output: ${e.message}`));
      }

      // Extract Z stats
      const zStats = result.stats?.statistic?.find((s) => s.name === 'Z');
      if (!zStats) {
        return reject(new Error('No Z dimension stats found'));
      }

      // Determine the vertical unit from the SRS
      const srs = result.metadata?.srs;
      const verticalUnit = srs?.units?.vertical;
      const horizontalUnit = srs?.units?.horizontal;
      const wkt = srs?.wkt || '';

      // Resolution order:
      // 1. Explicit vertical unit from SRS
      // 2. Horizontal unit (most LiDAR uses same unit for H and V)
      // 3. Parse from WKT as last resort
      // 4. Throw — never silently assume
      let factor = getUnitFactor(verticalUnit);
      let source = 'srs.units.vertical';

      if (factor === null) {
        factor = getUnitFactor(horizontalUnit);
        source = 'srs.units.horizontal';
      }

      if (factor === null) {
        // Last resort: look for VERT_CS or UNIT declarations in WKT
        const vertCsMatch = wkt.match(/VERT_CS[^\]]*UNIT\["([^"]+)"/i);
        const unitMatch = wkt.match(/UNIT\["([^"]+)",([\d.]+)/);

        if (vertCsMatch) {
          factor = getUnitFactor(vertCsMatch[1]);
          source = 'wkt.VERT_CS';
        } else if (unitMatch) {
          // Trust the numeric conversion factor directly — it's meters per unit
          factor = parseFloat(unitMatch[2]);
          source = `wkt.UNIT(${unitMatch[1]})`;
        }
      }

      if (factor === null || !Number.isFinite(factor) || factor <= 0) {
        return reject(new Error(
          `Could not determine vertical unit for ${lazPath}. ` +
          `SRS vertical unit: "${verticalUnit}", horizontal: "${horizontalUnit}". ` +
          `Refusing to guess — terrain scaling requires known units.`
        ));
      }

      resolve({
        min: zStats.minimum * factor,
        max: zStats.maximum * factor,
        mean: zStats.average * factor,
        stddev: zStats.stddev * factor,
        relief: (zStats.maximum - zStats.minimum) * factor,
        unit: 'meters',
        _meta: {
          originalUnit: verticalUnit || horizontalUnit || 'unknown',
          conversionFactor: factor,
          detectedVia: source
        }
      });
    });
  });
}
async function getStatsStats(lazPath) {
  return new Promise((resolve, reject) => {
    // const info = spawn('pdal', ['info', '--stats', '--dimensions', 'Z', lazPath]);
    const info = spawn(
      getBin('pdal'),
      [
        'info',
        '--stats',
        // '--dimensions', 'Z',
        lazPath
      ],
      { env: getSpawnEnv() }
    );

    let out = '';
    info.stdout.on('data', (d) => out += d);
    info.on('close', (code) => {
      if (code !== 0) return reject(new Error(`pdal info exited ${code}`));

      const result = JSON.parse(out);
      console.log(result.stats.statistic);
      const zStats = result.stats.statistic.find((s) => s.name === 'Z');
      resolve({
        min: zStats.minimum,
        max: zStats.maximum,
        mean: zStats.average,
        stddev: zStats.stddev
      });
    });
  });
}

export async function downloadCourse(geoJSON, bounds) {

  // if (!openProject.filePath) {
  //   const result = await dialog.showMessageBox({
  //     type: 'question',
  //     buttons: ['Cancel', 'Save Project'],
  //     defaultId: 0,
  //     title: 'Confirm Remove',
  //     message: 'Are you sure you want to remove this shape?'
  //   });
  // }
  // const { canceled, filePath } = await dialog.showSaveDialog({
  //   title: 'Save Course Lidar',
  //   defaultPath: openProject.workingDir ? path.join(openProject.workingDir, defaultFilename) : defaultFilename,
  //   filters: [{ name: 'Lidar File', extensions: ['laz'] }]
  // });
  // if (canceled || !filePath) {
  //   return;
  // }

  // console.log(`save to: ${filePath}`);
  // return filePath;

  if (!openProject._workingDir) {
    throw new Error('No open project to save to');
  }
  const defaultFilename = `course_terrain_${Date.now().toString(16)}`;
  const terrainFolder = path.join(openProject._workingDir, TERRAIN_DIR);
  if (!fs.existsSync(terrainFolder)) {
    fs.mkdirSync(terrainFolder);
  }
  const lazOutput = path.join(terrainFolder, `${defaultFilename}.laz`);
  const metadataOutput = path.join(terrainFolder, `${defaultFilename}_metadata.json`);
  const tiffOutput = path.join(terrainFolder, `${defaultFilename}_dem_temp.tif`);

  return new Promise(async (resolve, reject) => {

    let s3Uri = geoJSON?.properties?.url;
    if (!s3Uri) {
      return reject('No valid S3 URL found on lidar record');
    }
    log.debug(`s3Uri`, s3Uri);
    const metadata = await fetchMetadata(s3Uri);
    const nativeSrs = metadata?.srs?.wkt || metadata?.srs?.horizontal;
    log.debug(`determined nativeSrs`, nativeSrs);
    if (!nativeSrs) {
      return reject('Unable to determine SRS of lidar file');
    }
    log.debug(`bounds`, bounds);

    const transform = proj4('EPSG:4326', nativeSrs);
    const sw = transform.forward([bounds.west, bounds.south]);
    const ne = transform.forward([bounds.east, bounds.north]);

    const pdalBounds = `([${sw[0]}, ${ne[0]}], [${sw[1]}, ${ne[1]}])`;

    // return resolve(filePath);

    // // // Set environment variables so PDAL can find its GIS engines
    
    // s3Uri = s3Uri.replace('https://s3-us-west-2.amazonaws.com/usgs-lidar-public', 's3://usgs-lidar-public')

    // const outputBase = path.parse(lidarFolder);
    // const tiffOutput = path.join(lidarFolder, `${outputBase.name}_dem.tiff`);
    const resolution = 1.0;

    const pipeline = [
      {
        type: 'readers.ept',
        filename: s3Uri,
        tag: 'source_data',
        bounds: pdalBounds,
        // const pdalBounds = `[${bounds.west}, ${bounds.east}], [${bounds.south}, ${bounds.north}]`;
        // bounds: `(${pdalBounds},[-1000, 1000])/EPSG:4326`,
        resolution
        // threads: 8
      },
      {
        type: 'filters.outlier',
        method: 'statistical',
        mean_k: 8,
        multiplier: 3.0,
      },
      {
        type: 'filters.smrf'
      },
      {
        type: 'filters.range',
        // TODO: make this user-configurable
        // Classification 2 = Ground
        // Classification 9 = Water
        // Classification 6 = Building
        // Classification 10 = Rail
        // Classification 11 = Road
        // Source: https://desktop.arcgis.com/en/arcmap/latest/manage-data/las-dataset/lidar-point-classification.htm
        limits: [
          // 'Classification[1:1]', // Unclassified
          'Classification[1.1:2.1]', // Ground
          'Classification[8.1:9.1]', // Water
          'Classification[10.1:11.1]', // Road
        ].join(',')
      },

      {
        type: 'writers.las',
        filename: lazOutput,
        compression: true,
        // The @loaders.gl/las module only supports LAS/lAZ files up to LAS v1.3. It does not support LAS v1.4 files. 
        // https://loaders.gl/docs/modules/las/api-reference/las-loader
        minor_version: 3,
        dataformat_id: 3
      },
      {
        type: 'writers.gdal',
        filename: tiffOutput,
        gdaldriver: 'GTiff',
        // supported values are min, max, mean, idw, count, stdev and all
        output_type: 'idw',
        window_size: 10,
        resolution,
      }
    ];

    // '-v', '8'
    const child = spawn(
      getBin('pdal'),
      [
        'pipeline', '--stdin',
        '-v', '4',
        '--metadata', metadataOutput
      ],
      { env: getSpawnEnv() }
    );

    let output = '';
    child.stderr.on('data', (data) => {
      // log.debug(`stderr: ${data}`);
      output += `${data}`;
    });
    // child.stdout.on('data', (data) => {
    //   log.debug(`stdout: ${data}`);
    // });
    child.on('close', async (code) => {
      log.debug(`code: ${code}`);
      if (code === 0) {
        const stats = fs.statSync(lazOutput);
        
        let points = 0;
        const matched = output.match(/wrote (\d+) points to the LAS file/i);
        if (matched?.[1]) {
          points = parseInt(matched[1], 10);
        }

        // const lazStats = await getStatsStats(lazOutput);
        const lazStats = await getHeightStatsInMeters(lazOutput);
        log.info('lazStats', lazStats);

        const lidar = {
          filePath: lazOutput,
          fileName: path.basename(lazOutput),
          size: stats.size,
          points: points,
          srs: nativeSrs,
          stats: lazStats
        };

        const tiffOutputFinal = await fillData(tiffOutput);
        
        const tiffStats = fs.statSync(tiffOutputFinal);

        const dem = {
          filePath: tiffOutputFinal,
          fileName: path.basename(tiffOutputFinal),
          size: tiffStats.size,
        };
        
        openProject.lidar = lidar;
        openProject.dem = dem;

        const raw = await generateRAWFile();
        openProject.raw = raw;

        
        await saveProjectSettings();
        
        resolve({ lidar, dem, raw });

        refreshRawData(true);
      }
      reject('An error occurred during lidar processing. Please check the logs.');
    });
    
    log.debug(`Running pipeline: ${JSON.stringify(pipeline, null, 1)}`);
    child.stdin.write(JSON.stringify(pipeline));
    child.stdin.end();

  });
}

export async function readOpenFile() {
  if (!openProject.lidar?.filePath) {
    return new Response('no lidar', {
      status: 404,
      headers: { 'content-type': 'text/html' }
    });
  }
  const buffer = await fs.promises.readFile(openProject.lidar.filePath);
  return buffer;
  // // We parse here in the Main process. 
  // // No worker needed because we aren't blocking the UI thread.
  // const data = await parse(buffer, LASLoader, { worker: false });
  // return {
  //   position: data.attributes.POSITION.value,
  //   color: data.attributes.COLOR_0 ? data.attributes.COLOR_0.value : null,
  //   header: data.header
  // };
  // const fetchFile = pathToFileURL(openProject.lidar.filePath).toString();
  // console.log(`send file: ${fetchFile}`);
  // return net.fetch(fetchFile);
}