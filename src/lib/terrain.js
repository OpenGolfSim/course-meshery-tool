import logger from 'electron-log';

const log = logger.scope('TERRAIN');

export const dataCache = new Map();
//   heightMap: undefined,
//   terrainSize: undefined,
//   smoothedMap: undefined
// };

// function setData(key, value) {

// }

export function getTerrain() {
  return dataCache.get('heightMap');
}
// function generateGaussianKernel(radius, sigma) {
//   const kernelSize = radius * 2 + 1; // Kernel is square with side length (2*radius + 1)
//   const kernel = [];
//   let sum = 0;

//   for (let y = -radius; y <= radius; y++) {
//     for (let x = -radius; x <= radius; x++) {
//       // Gaussian function for 2D
//       const weight = (1 / (2 * Math.PI * sigma * sigma)) *
//         Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
//       kernel.push(weight);
//       sum += weight;
//     }
//   }

//   // Normalize kernel weights to ensure the sum is 1
//   return kernel.map(v => v / sum);
// }

// // Step 2: Apply convolution to the terrain
// function applyGaussianBlur(terrain2D, size, kernel, radius) {
//   const blurred = [];
//   const kernelSize = radius * 2 + 1;

//   for (let i = 0; i < size; i++) {
//     const row = [];
//     for (let j = 0; j < size; j++) {
//       let sum = 0;
//       let k = 0;

//       // Apply the kernel matrix
//       for (let ky = -radius; ky <= radius; ky++) {
//         for (let kx = -radius; kx <= radius; kx++, k++) {
//           const ni = i + ky;
//           const nj = j + kx;

//           if (ni >= 0 && ni < size && nj >= 0 && nj < size) {
//             // Multiply the kernel weight by the terrain value
//             sum += terrain2D[ni][nj] * kernel[k];
//           }
//         }
//       }

//       row.push(sum);
//     }
//     blurred.push(row);
//   }

//   return blurred;
// }

// // Utilities: Flatten and reshape the terrain
// function blurTerrainGaussian(terrainArray, size = 4097, sigma = 1, blurRadius = 1) {
//   // Reshape 1D array into 2D grid
//   const terrain2D = [];
//   for (let i = 0; i < size; i++) {
//     terrain2D.push(terrainArray.slice(i * size, (i + 1) * size));
//   }

//   // Generate Gaussian kernel
//   const kernel = generateGaussianKernel(blurRadius, sigma);

//   // Apply blur
//   const blurred2D = applyGaussianBlur(terrain2D, size, kernel, blurRadius);

//   // Flatten back into 1D array
//   return blurred2D.flat();
// }

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


export function smoothTerrainData(heightMap, terrainSize = 4097, terrainSmoothingRadius = 0) {
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