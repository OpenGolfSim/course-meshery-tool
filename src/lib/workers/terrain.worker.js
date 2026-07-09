import { expose } from 'threads/worker';
import { lerp, smootherstep } from './utils';

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
  const terrainSize = Math.sqrt(heightMap.length);
  if (terrainSmoothingRadius) {
    console.log(`Smoothing terrain data (radius: ${terrainSmoothingRadius}, size: ${terrainSize})`);
    const blurred = applyBoxBlur(heightMap, terrainSize, terrainSmoothingRadius);
    return blurred;
  }
  console.log('Skipping smoothing');
  return heightMap;
}


/**
 * Modify the raw heightmap around lake boundaries so both the lake mesh
 * and the surrounding grass mesh pick up a smooth, natural shoreline.
 *
 *
 * @param {Uint16Array|Float32Array} heightData - the heightmap (mutated in place or copied)
 * @param {number} terrainSize - e.g. 4097
 * @param {number} svgSize     - project.settings.distance * 1000 (world units)
 * @param {Array}  lakeShapes  - array of { polygon: [[x,z],...], holes: [[[x,z],...]] }
 * @param {object} options
 * @returns {Uint16Array|Float32Array} modified heightmap
 */
export function smoothLakeShores(heightData, terrainSize, svgSize, lakeShapes, options = {}) {
  const {
    outerRadius   = 5.0,   // SVG-space meters outside lake edge to blend
    innerRadius   = 3.0,   // SVG-space meters inside lake edge to blend
    rimSampleBand = 1.5,   // band width for auto-detecting water level
    waterLevel    = null,   // explicit 0-65535 value; null = auto per lake
  } = options;

  // Work on a copy so the original stays intact
  const out = new Float32Array(heightData.length);
  for (let i = 0; i < heightData.length; i++) out[i] = heightData[i];

  // Pixel size in SVG units
  const pxToSvg = svgSize / (terrainSize - 1);
  const svgToPx = (terrainSize - 1) / svgSize;

  for (const shape of lakeShapes) {
    const { polygon, holes = [] } = shape;

    // Convert polygon + holes to pixel space for the distance/containment checks
    const polyPx  = polygon.map(([x, z]) => [x * svgToPx, z * svgToPx]);
    const holesPx = holes.map(h => h.map(([x, z]) => [x * svgToPx, z * svgToPx]));

    // All boundary segments in pixel space (outer + holes)
    const allSegments = extractSegments(polyPx, holesPx);

    // Bounding box in pixel coords, expanded by the blend radius
    const radiusPx = Math.max(outerRadius, innerRadius) * svgToPx;
    const bbox = getSegmentsBBox(polyPx, holesPx, radiusPx, terrainSize);

    // --- Phase 1: Auto-detect water level for this lake ---
    let targetH = waterLevel;
    if (targetH === null) {
      const rimBandPx = rimSampleBand * svgToPx;
      const rimHeights = [];

      for (let row = bbox.minRow; row <= bbox.maxRow; row++) {
        for (let col = bbox.minCol; col <= bbox.maxCol; col++) {
          const pt = [col, row];
          const dist = distToSegments(pt, allSegments);
          const inside = pointInPolygonWithHoles(pt, polyPx, holesPx);

          // Narrow band just outside the lake edge
          if (!inside && dist <= rimBandPx) {
            rimHeights.push(out[row * terrainSize + col]);
          }
        }
      }

      if (rimHeights.length > 2) {
        rimHeights.sort((a, b) => a - b);
        // 25th percentile — the natural ground plane, not the ridge tops
        targetH = rimHeights[Math.floor(rimHeights.length * 0.25)];
      } else {
        // Fallback: lowest value inside the lake
        let minH = Infinity;
        for (let row = bbox.minRow; row <= bbox.maxRow; row++) {
          for (let col = bbox.minCol; col <= bbox.maxCol; col++) {
            if (pointInPolygonWithHoles([col, row], polyPx, holesPx)) {
              minH = Math.min(minH, out[row * terrainSize + col]);
            }
          }
        }
        targetH = minH === Infinity ? 0 : minH;
      }
    }

    // --- Phase 2: Blend heights in the transition zone ---
    const outerPx = outerRadius * svgToPx;
    const innerPx = innerRadius * svgToPx;

    for (let row = bbox.minRow; row <= bbox.maxRow; row++) {
      for (let col = bbox.minCol; col <= bbox.maxCol; col++) {
        const pt = [col, row];
        const dist = distToSegments(pt, allSegments);
        const inside = pointInPolygonWithHoles(pt, polyPx, holesPx);
        const idx = row * terrainSize + col;
        const original = out[idx];

        if (inside && dist >= innerPx) {
          // Deep inside — leave for digMesh to handle
          continue;
        }

        if (!inside && dist >= outerPx) {
          // Far outside — untouched
          continue;
        }

        let blended;
        if (!inside) {
          // Outside, within outer band
          const t = smootherstep(dist / outerPx);
          // t=0 at edge → waterLevel;  t=1 at outerRadius → original
          // blended = lerp(targetH, original, t);
          blended = Math.min(original, lerp(targetH, original, t));
        } else {
          // Inside, within inner band
          const t = smootherstep(dist / innerPx);
          // t=0 at edge → waterLevel;  t=1 at innerRadius → original
          // blended = lerp(targetH, original, t);
          blended = Math.min(original, lerp(targetH, original, t));
        }

        // out[idx] = blended;
        out[idx] = Math.min(out[idx], blended);
      }
    }
  }

  // Convert back to Uint16 if the input was Uint16
  if (heightData instanceof Uint16Array) {
    const u16 = new Uint16Array(out.length);
    for (let i = 0; i < out.length; i++) {
      u16[i] = Math.max(0, Math.min(65535, Math.round(out[i])));
    }
    return u16;
  }
  return out;
}

function extractSegments(polyPx, holesPx) {
  const segs = [];
  function addRing(ring) {
    for (let i = 0; i < ring.length; i++) {
      segs.push([ring[i], ring[(i + 1) % ring.length]]);
    }
  }
  addRing(polyPx);
  for (const hole of holesPx) addRing(hole);
  return segs;
}

function distToSegments(pt, segments) {
  let min = Infinity;
  for (const [a, b] of segments) {
    const d = pointToSegDist(pt[0], pt[1], a[0], a[1], b[0], b[1]);
    if (d < min) min = d;
  }
  return min;
}

function pointToSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function getSegmentsBBox(polyPx, holesPx, radiusPx, terrainSize) {
  let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
  function scan(ring) {
    for (const [c, r] of ring) {
      if (c < minC) minC = c;
      if (r < minR) minR = r;
      if (c > maxC) maxC = c;
      if (r > maxR) maxR = r;
    }
  }
  scan(polyPx);
  for (const h of holesPx) scan(h);
  return {
    minCol: Math.max(0, Math.floor(minC - radiusPx)),
    minRow: Math.max(0, Math.floor(minR - radiusPx)),
    maxCol: Math.min(terrainSize - 1, Math.ceil(maxC + radiusPx)),
    maxRow: Math.min(terrainSize - 1, Math.ceil(maxR + radiusPx)),
  };
}

function pointInRingPx(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > py) !== (yj > py)) &&
        px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonWithHoles(pt, polyPx, holesPx) {
  if (!pointInRingPx(pt[0], pt[1], polyPx)) return false;
  for (const hole of holesPx) {
    if (pointInRingPx(pt[0], pt[1], hole)) return false;
  }
  return true;
}

/**
 * Smooth terrain along river paths so the river follows a natural downhill grade.
 * Samples the spine elevation from the heightmap, smooths it into a gentle slope,
 * then flattens the terrain to match.
 *
 * @param {Uint16Array|Float32Array} heightData - the heightmap (mutated copy)
 * @param {number} terrainSize - e.g. 4097
 * @param {number} svgSize     - project.settings.distance * 1000 (world units)
 * @param {Array}  riverShapes  - array of { polygon, spine, holes }
 *   polygon: [[x,z],...] river boundary
 *   spine: [[x,z],...] flow line points, upstream → downstream
 *   holes: optional [[[x,z],...]]
 * @param {object} options
 * @returns {Uint16Array|Float32Array} modified heightmap
 */
export function smoothRiverBeds(heightData, terrainSize, svgSize, riverShapes, options = {}) {
  const {
    outerRadius  = 6.0,   // SVG-space meters outside river edge to blend
    innerRadius  = 3.0,   // SVG-space meters inside river edge to blend
    digDepth     = 2.0,   // how far below the smoothed spine to dig the bed (SVG units mapped to height)
    spineSmoothPasses = 5, // how many times to smooth the spine elevation profile
  } = options;

  const out = new Float32Array(heightData.length);
  for (let i = 0; i < heightData.length; i++) out[i] = heightData[i];

  const pxToSvg = svgSize / (terrainSize - 1);
  const svgToPx = (terrainSize - 1) / svgSize;

  for (const shape of riverShapes) {
    const { polygon, flowPoints, holes = [] } = shape;

    const polyPx  = polygon.map(([x, z]) => [x * svgToPx, z * svgToPx]);
    const holesPx = holes.map(h => h.map(([x, z]) => [x * svgToPx, z * svgToPx]));
    const allSegments = extractSegments(polyPx, holesPx);

    if (!flowPoints?.length) {
      continue;
    }
    // --- Phase 1: Sample heightmap along the spine and smooth it ---
    const spineElevations = flowPoints.map(([x, z]) => {
      const col = Math.round(x * svgToPx);
      const row = Math.round(z * svgToPx);
      const clamped_col = Math.max(0, Math.min(terrainSize - 1, col));
      const clamped_row = Math.max(0, Math.min(terrainSize - 1, row));
      return out[clamped_row * terrainSize + clamped_col];
    });

    // Smooth the elevation profile so it's a gentle gradient
    // Also enforce monotonically non-increasing (river flows downhill)
    let smoothed = Float32Array.from(spineElevations);
    for (let pass = 0; pass < spineSmoothPasses; pass++) {
      const temp = Float32Array.from(smoothed);
      for (let i = 1; i < smoothed.length - 1; i++) {
        temp[i] = smoothed[i - 1] * 0.25 + smoothed[i] * 0.5 + smoothed[i + 1] * 0.25;
      }
      smoothed = temp;
    }

    // Enforce downhill: each point can't be higher than the previous
    for (let i = 1; i < smoothed.length; i++) {
      if (smoothed[i] > smoothed[i - 1]) {
        smoothed[i] = smoothed[i - 1];
      }
    }

    // Build spine segments in pixel space for nearest-point lookup
    const spineSegsPx = [];
    for (let i = 0; i < flowPoints.length - 1; i++) {
      const [ax, az] = flowPoints[i];
      const [bx, bz] = flowPoints[i + 1];
      spineSegsPx.push({
        ax: ax * svgToPx, ay: az * svgToPx,
        bx: bx * svgToPx, by: bz * svgToPx,
        dx: (bx - ax) * svgToPx, dy: (bz - az) * svgToPx,
        len: Math.sqrt(((bx - ax) * svgToPx) ** 2 + ((bz - az) * svgToPx) ** 2),
        startElev: smoothed[i],
        endElev: smoothed[i + 1],
      });
    }

    // --- Phase 2: Modify terrain ---
    const radiusPx = Math.max(outerRadius, innerRadius) * svgToPx;
    const bbox = getSegmentsBBox(polyPx, holesPx, radiusPx, terrainSize);
    const outerPx = outerRadius * svgToPx;
    const innerPx = innerRadius * svgToPx;

    for (let row = bbox.minRow; row <= bbox.maxRow; row++) {
      for (let col = bbox.minCol; col <= bbox.maxCol; col++) {
        const pt = [col, row];
        const dist = distToSegments(pt, allSegments);
        const inside = pointInPolygonWithHoles(pt, polyPx, holesPx);
        const idx = row * terrainSize + col;
        const original = out[idx];

        if (!inside && dist >= outerPx) continue;

        // Find target elevation from nearest spine point
        const { elev: targetH, t: spineT } = nearestSpineElevation(pt, spineSegsPx);
        const bedH = targetH - digDepth;

        if (inside) {
          if (dist >= innerPx) {
            // Deep inside river — set to bed height
            // out[idx] = bedH;
            // For idempotency (prevent going lower than the initial dig depth)
            out[idx] = Math.min(out[idx], bedH);
          } else {
            // Near inner edge — blend from bed to edge
            const t = smootherstep(dist / innerPx);
            // out[idx] = lerp(targetH, bedH, t);
            // For idempotency (prevent going lower than the initial dig depth)
            out[idx] = Math.min(out[idx], lerp(targetH, bedH, t));
          }
        } else {
          // Outside, within outer band — blend from targetH to original
          const t = smootherstep(dist / outerPx);
          // out[idx] = lerp(targetH, original, t);
          // For idempotency (prevent going lower than the initial dig depth)
          out[idx] = Math.min(out[idx], lerp(targetH, original, t));
        }
      }
    }
    
  }
  

  if (heightData instanceof Uint16Array) {
    const u16 = new Uint16Array(out.length);
    for (let i = 0; i < out.length; i++) {
      u16[i] = Math.max(0, Math.min(65535, Math.round(out[i])));
    }
    return u16;
  }
  return out;
}

/**
 * Find the nearest point on the spine and return the interpolated elevation.
 */
function nearestSpineElevation(pt, spineSegs) {
  let bestDist = Infinity;
  let bestElev = 0;
  let bestT = 0;

  for (const seg of spineSegs) {
    const apx = pt[0] - seg.ax;
    const apy = pt[1] - seg.ay;
    let t = seg.len > 0
      ? (apx * seg.dx + apy * seg.dy) / (seg.len * seg.len)
      : 0;
    t = Math.max(0, Math.min(1, t));

    const closestX = seg.ax + t * seg.dx;
    const closestY = seg.ay + t * seg.dy;
    const dx = pt[0] - closestX;
    const dy = pt[1] - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < bestDist) {
      bestDist = dist;
      bestElev = seg.startElev + t * (seg.endElev - seg.startElev);
    }
  }

  return { elev: bestElev, dist: bestDist };
}


expose({ smoothTerrainData, smoothLakeShores, smoothRiverBeds });