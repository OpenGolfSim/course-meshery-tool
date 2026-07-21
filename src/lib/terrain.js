import fs from 'fs';
import path from 'path';
import { dialog } from 'electron';
import logger from 'electron-log';
import { _heightMapCache, openProject, saveProjectSettings } from './project';
import { PROJECT_FILE_PROTOCOL, TERRAIN_DIR } from '../constants';
import { broadcast } from './window';
import { getLidarSummary } from './lidar';
import { getGeoTIFFSummary } from './imagery';

const log = logger.scope('TERRAIN');

export const dataCache = new Map();

export function getTerrain() {
  return dataCache.get('heightMap');
}

function generate1DGaussianKernel(radius, sigma) {
  const kernel = [];
  let sum = 0;

  for (let x = -radius; x <= radius; x++) {
    const weight = Math.exp(-(x * x) / (2 * sigma * sigma)) / (Math.sqrt(2 * Math.PI) * sigma);
    kernel.push(weight);
    sum += weight;
  }

  // Normalize kernel weights
  return kernel.map(v => v / sum);
}

function apply1DGaussianBlur(array, size, kernel, direction) {
  // Performs 1D blur on rows or columns based on direction
  const result = new Float32Array(size * size);
  const radius = Math.floor(kernel.length / 2);

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let sum = 0;

      for (let k = -radius; k <= radius; k++) {
        let x, y;

        // Horizontal or vertical direction
        if (direction === 'horizontal') {
          x = i;
          y = j + k;
        } else {
          x = i + k;
          y = j;
        }

        // Boundary check
        if (x >= 0 && x < size && y >= 0 && y < size) {
          sum += array[x * size + y] * kernel[radius + k];
        }
      }

      result[i * size + j] = sum;
    }
  }

  return result;
}

function blurTerrainFast(terrainArray, size, sigma, radius) {
  // Generate 1D Gaussian kernel
  const kernel = generate1DGaussianKernel(radius, sigma);

  // Horizontal pass
  const blurredHorizontal = apply1DGaussianBlur(terrainArray, size, kernel, 'horizontal');

  // Vertical pass
  return apply1DGaussianBlur(blurredHorizontal, size, kernel, 'vertical');
}

function applyBoxBlur(array, size, radius) {
  const result = new Float32Array(size * size);
  const boxSize = radius * 2 + 1;

  // Pre-compute row sums to optimize
  const rowSum = new Float32Array(size * size);

  for (let i = 0; i < size; i++) {
    let sum = 0;

    // Initialize first window
    for (let k = -radius; k <= radius; k++) {
      const j = Math.max(0, Math.min(size - 1, k));
      sum += array[i * size + j];
    }

    rowSum[i * size] = sum;

    for (let j = 1; j < size; j++) {
      const right = Math.min(size - 1, j + radius);
      const left = Math.max(0, j - radius - 1);

      sum += array[i * size + right] - array[i * size + left];
      rowSum[i * size + j] = sum;
    }
  }

  // Compute column sums based on row sums
  for (let j = 0; j < size; j++) {
    let sum = 0;

    for (let k = -radius; k <= radius; k++) {
      const i = Math.max(0, Math.min(size - 1, k));
      sum += rowSum[i * size + j];
    }

    result[j] = sum / (boxSize * boxSize);

    for (let i = 1; i < size; i++) {
      const bottom = Math.min(size - 1, i + radius);
      const top = Math.max(0, i - radius - 1);

      sum += rowSum[bottom * size + j] - rowSum[top * size + j];
      result[i * size + j] = sum / (boxSize * boxSize);
    }
  }

  return result;
}


export function smoothTerrainData(heightMap, terrainSmoothingRadius = 0) {
  // const sigma = 2;   // Higher sigma = more blurring
  // const radius = 3;  // Kernel radius, controls range of neighbors
  // return heightMap;
  // dataCache.smoothedMap = dataCache.heightMap;
  // const heightMap = dataCache.get('heightMap');
  // if (!heightMap.length) {
  //   throw new Error('The heightMap is not set');
  // }
  // log.info('Smoothing terrain data', { terrainSmoothingStrength, terrainSmoothingRadius });
  const terrainSize = Math.sqrt(heightMap.length);
  if (terrainSmoothingRadius) {
    log.info(`Smoothing terrain data (radius: ${terrainSmoothingRadius}, size: ${terrainSize})`);
    // return blurTerrainGaussian(heightMap, terrainSize, terrainSmoothingStrength, terrainSmoothingRadius);
    // console.time('FastGaussianBlur');
    // const blurred = blurTerrainFast(heightMap, terrainSize, terrainSmoothingStrength, terrainSmoothingRadius);
    // console.timeEnd('FastGaussianBlur');
    // console.time('BoxBlur');
    const blurred = applyBoxBlur(heightMap, terrainSize, terrainSmoothingRadius);
    // console.timeEnd('BoxBlur');
    return blurred;
  }
  log.info('Skipping smoothing');
  return heightMap;
}

function computeSmoothNormals(points, triangles) {
  const count = points.length / 3;
  const norms = new Float32Array(count * 3);

  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i+1], c = triangles[i+2];
    const ax = points[a*3], ay = points[a*3+1], az = points[a*3+2];
    const bx = points[b*3], by = points[b*3+1], bz = points[b*3+2];
    const cx = points[c*3], cy = points[c*3+1], cz = points[c*3+2];
    const ux = bx-ax, uy = by-ay, uz = bz-az;
    const vx = cx-ax, vy = cy-ay, vz = cz-az;
    const nx = uy*vz - uz*vy;
    const ny = uz*vx - ux*vz;
    const nz = ux*vy - uy*vx;
    for (const idx of [a, b, c]) {
      norms[idx*3]   += nx;
      norms[idx*3+1] += ny;
      norms[idx*3+2] += nz;
    }
  }

  for (let i = 0; i < count; i++) {
    const x = norms[i*3], y = norms[i*3+1], z = norms[i*3+2];
    const len = Math.sqrt(x*x + y*y + z*z) || 1;
    norms[i*3] = x/len; norms[i*3+1] = y/len; norms[i*3+2] = z/len;
  }
  return norms;
}


function svgToTerrain(x, z, svgSize, terrainSize = 4097) {
  // Clamp/limit to prevent overflow on edges
  const tx = Math.max(0, Math.min(terrainSize - 1, (x / svgSize) * (terrainSize - 1)));
  const tz = Math.max(0, Math.min(terrainSize - 1, (z / svgSize) * (terrainSize - 1)));
  return [tx, tz];
}

function interpHeight(heights, tx, tz, terrainSize = 4097) {

  const x0 = Math.floor(tx);
  const x1 = Math.min(terrainSize - 1, x0 + 1);
  const z0 = Math.floor(tz);
  const z1 = Math.min(terrainSize - 1, z0 + 1);

  const fx = tx - x0;
  const fz = tz - z0;

  // 4 corners of the cell
  const h00 = heights[z0 * terrainSize + x0];
  const h10 = heights[z0 * terrainSize + x1];
  const h01 = heights[z1 * terrainSize + x0];
  const h11 = heights[z1 * terrainSize + x1];

  // Bilinear interpolation
  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fz) + h1 * fz;
}

export function getHeightMapStats(heightMapData, heightScale) {
  const len = heightMapData.length;
  let min = 65535;
  let max = 0;
  let sum = 0;

  for (let i = 0; i < len; i++) {
    const v = heightMapData[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }

  const toMeters = (v) => (v / 65535) * heightScale;

  const meanRaw = sum / len;

  // Second pass for stddev
  let sqDiffSum = 0;
  for (let i = 0; i < len; i++) {
    const diff = heightMapData[i] - meanRaw;
    sqDiffSum += diff * diff;
  }

  return {
    min: toMeters(min),
    max: toMeters(max),
    mean: toMeters(meanRaw),
    heightScale,
    relief: toMeters(max - min),
    stddev: toMeters(Math.sqrt(sqDiffSum / len)),
  };
}

export async function importTerrainData() {
  const files = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [ { extensions: ['laz', 'las', 'tiff', 'tif'], name: 'Elevation Data' }]
  });
  if (files.canceled) {
    return;
  }
  let results = [];
  for (const filePath of files.filePaths) {
    let item = { filePath };
    try {
      const ext = path.extname(filePath).toLowerCase();
      const isLidar = ['.laz', '.las'].includes(ext);
      const isTiff = ['.tif', '.tiff'].includes(ext);
      if (isLidar) {
        item.type = 'laz';
        const details = await getLidarSummary(filePath);
        item.details = details;
        item.updateCourseBounds = false;
      } else if (isTiff) {
        const details = await getGeoTIFFSummary(filePath);
        item.details = details;
        item.updateCourseBounds = true;
      } else {
        throw new Error('Unable to handle file type');
      }
    } catch (error) {
      item.error = error.message;
    } finally {
      results.push(item);
    }
  }
  return results;
}

export async function generateTerrain() {
  const height = 0;
  const size = 4096;
  const heightmap = new Uint16Array(size * size);
  heightmap.fill(height);

  const generatedFile = `gen_${Date.now().toString(16)}.raw`;
  const imageryFolder = path.join(openProject._workingDir, TERRAIN_DIR);

  if (!fs.existsSync(imageryFolder)) {
    fs.mkdirSync(imageryFolder);
  }

  const outputRaw = path.join(imageryFolder, generatedFile);

  await fs.promises.writeFile(outputRaw, Buffer.from(heightmap.buffer));

  const raw = {
    filePath: outputRaw,
    uri: `${PROJECT_FILE_PROTOCOL}:///${path.join(TERRAIN_DIR, generatedFile)}`
  };
  const stats = {
    min: 0,
    max: 0,
    mean: 0,
    heightScale: 100,
    relief: 0,
    stddev: 0,
  };
  openProject.raw = raw;
  openProject.stats = stats;
  
  await saveProjectSettings();

  return { raw, stats };
  // broadcast('project.opened', openProject);
}