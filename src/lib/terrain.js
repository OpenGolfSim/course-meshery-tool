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

export function conformMeshToTerrain(layer, mesh, project) {
  let svgSize = Math.round(project.settings.distance * 1000);
  let heightScale = project?.stats?.relief || 1;
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
  const isLakeSurface = layer.surface === 'plane_lake';
  const isRiverSurface = layer.surface === 'plane_river';

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
  // Pre-pass for rivers: find boundary vertices and their terrain heights
  // so interior vertices can interpolate from the banks
  let boundaryVerts = null;
  let boundaryHeights = null;
  if (isRiverSurface) {
    const edgeCount = new Map();
    for (let t = 0; t < mesh.triangles.length; t += 3) {
      const tri = [mesh.triangles[t], mesh.triangles[t+1], mesh.triangles[t+2]];
      for (let e = 0; e < 3; e++) {
        const a = Math.min(tri[e], tri[(e+1)%3]);
        const b = Math.max(tri[e], tri[(e+1)%3]);
        const key = `${a},${b}`;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      }
    }

    boundaryVerts = new Set();
    for (const [key, count] of edgeCount) {
      if (count === 1) {
        const [a, b] = key.split(',').map(Number);
        boundaryVerts.add(a);
        boundaryVerts.add(b);
      }
    }

    boundaryHeights = [];
    for (const vi of boundaryVerts) {
      const bx = mesh.points[vi * 3];
      const bz = mesh.points[vi * 3 + 2];
      const [tx, tz] = svgToTerrain(bx, bz, svgSize, heightSize);
      const by = (interpHeight(heightData, tx, tz, heightSize) / 65535) * heightScale;
      boundaryHeights.push({ x: bx, z: bz, y: by });
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
    } else if (isRiverSurface) {
      const vi = index / 3;
      if (boundaryVerts.has(vi)) {
        const [tx, tz] = svgToTerrain(x, z, svgSize, heightSize);
        y = (interpHeight(heightData, tx, tz, heightSize) / 65535) * heightScale;
      } else {
        let weightSum = 0, heightSum = 0;
        for (const bv of boundaryHeights) {
          const dx = x - bv.x;
          const dz = z - bv.z;
          const w = 1 / (dx * dx + dz * dz + 0.001);
          weightSum += w;
          heightSum += w * bv.y;
        }
        y = heightSum / weightSum;
      }
    // } else if (isRiverSurface) {
    //   const [tx, tz] = svgToTerrain(x, z, svgSize, heightSize);
    //   const sampleRadius = 4;
    //   const r2 = sampleRadius * sampleRadius;

    //   let sum = 0, count = 0;
    //   for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
    //     for (let dz = -sampleRadius; dz <= dz <= sampleRadius; dz++) {
    //       if (dx * dx + dz * dz <= r2) {
    //         const sx = Math.max(0, Math.min(heightSize - 1, tx + dx));
    //         const sz = Math.max(0, Math.min(heightSize - 1, tz + dz));
    //         sum += interpHeight(heightData, sx, sz, heightSize);
    //         count++;
    //       }
    //     }
    //   }

    //   y = ((sum / count) / 65535) * heightScale;
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

  const points = new Float32Array(positions);
  const normals = computeSmoothNormals(points, mesh.triangles);

  return {
    ...mesh,
    normals,
    points
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

