import logger from 'electron-log';

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


export function smoothTerrainData(heightMap, terrainSmoothingRadius = 0, terrainSize = 4097) {
  // const sigma = 2;   // Higher sigma = more blurring
  // const radius = 3;  // Kernel radius, controls range of neighbors
  // return heightMap;
  // dataCache.smoothedMap = dataCache.heightMap;
  // const heightMap = dataCache.get('heightMap');
  // if (!heightMap.length) {
  //   throw new Error('The heightMap is not set');
  // }
  // log.info('Smoothing terrain data', { terrainSmoothingStrength, terrainSmoothingRadius });
  if (terrainSmoothingRadius) {
    log.info(`Smoothing terrain data (radius: ${terrainSmoothingRadius})`);
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

export function conformMeshToTerrain(layer, mesh, project) {
  let svgSize = Math.round(project.settings.distance * 1000);
  let heightScale = project.lidar?.stats?.relief || 1;
  if (!(svgSize > 0)) {
    throw new Error('SVG size is invalid');
  }
  const positions = [];
  const heightData = project._heightMap?.smoothData || project._heightMap?.data;
  const heightSize = project._heightMap?.size;

  if (!heightData) {
    throw new Error('No heightmap data');
  } else if (!heightSize) {
    throw new Error('No heightmap size');
  }

  // const hasHeightMap = !!(project._heightMap?.data && project._heightMap?.size);
  const isLakeSurface = layer.surface === 'lake_surface';
  // Pre-pass for lakes: find the lowest terrain height across the shape so
  // the whole surface can sit flat at that elevation.
  let lakeY = 0;
  if (isLakeSurface) {
    let minRaw = Infinity;
    for (let index = 0; index < mesh.points.length; index += 3) {
      const x = mesh.points[index];
      const z = mesh.points[index + 2];
      const [tx, tz] = svgToTerrain(x, z, svgSize, heightSize);
      const h = interpHeight(heightData, tx, tz, heightSize);
      if (h < minRaw) minRaw = h;
    }
    if (minRaw !== Infinity) {
      lakeY = (minRaw / 65535) * heightScale;
    }
  }

  // const mesh = layer.mesh;
  for (let index = 0; index < mesh.points.length; index += 3) {
    const x = mesh.points[index];
    let y = 0; // mesh.points[index + 1];
    const z = mesh.points[index + 2];
    
    if (isLakeSurface) {
      // make lake surface mesh flat, but at lowest point of terrain data for this area?
      y = lakeY;
    } else {
      const [tx, tz] = svgToTerrain(x, z, svgSize, heightSize);
      // Get/interpolate terrain height
      y = interpHeight(heightData, tx, tz, heightSize);

      // If Unity height range is [0, 65535], you might want to scale to meters
      // For example, if your terrain in Unity is 600m tall, scale = 600/65535
      // If not, just use the raw value.
      y = (y / 65535) * heightScale;
    }
  
    positions.push(x, y, z);
  }

  return {
    ...mesh,
    points: new Float32Array(positions)
  }
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