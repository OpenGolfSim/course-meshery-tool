// import * as THREE from 'three';

/**
 * Generates a flow map texture from a river polygon and a flow spine.
 *
 * @param {number[][]} polygon  - [[x,y], ...] closed ring of the river shape
 * @param {number[][]} spine    - [[x,y], ...] open path, ordered upstream → downstream
 * @param {number}     resolution - texture size (default 256)
 */
export function generateFlowMap(polygon, spine, maxResolution = 512) {

  // --- Bounding box ---
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  // // Small pad so edges aren't right on the boundary
  // const pad = Math.max(maxX - minX, maxY - minY) * 0.02;
  // minX -= pad; minY -= pad;
  // maxX += pad; maxY += pad;

  // --- Build spine segments with direction and length ---
  const segments = [];
  for (let i = 0; i < spine.length - 1; i++) {
    const [ax, ay] = spine[i];
    const [bx, by] = spine[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push({
      ax, ay, dx, dy, len,
      // Normalized direction (tangent) of this segment
      tx: len > 0 ? dx / len : 0,
      ty: len > 0 ? dy / len : 0,
    });
  }

  // --- Per-vertex tangents for smooth interpolation at joints ---
  // Each spine vertex gets the average direction of its two adjacent segments.
  // This prevents hard snaps in flow direction at bends.
  const vertexTangents = spine.map((_, i) => {
    let tx = 0, ty = 0;
    if (i > 0) {
      tx += segments[i - 1].tx;
      ty += segments[i - 1].ty;
    }
    if (i < segments.length) {
      tx += segments[i].tx;
      ty += segments[i].ty;
    }
    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    return { tx: tx / len, ty: ty / len };
  });

  // Indexes spine segments by grid cell so closestOnSpine doesn't scan every
  // segment for every query — previously O((polygonVertices + w*h) *
  // spineSegments), with polygon vertices up to ~10,000 and w*h up to
  // 512*512 raster pixels. Building the grid (and the per-query cell-hash
  // lookups) has its own overhead, which only pays off once there are
  // enough segments to make a full scan actually expensive — below the
  // threshold, a plain scan measured faster.
  const SEGMENT_INDEX_THRESHOLD = 500;
  let findClosest;
  if (segments.length > SEGMENT_INDEX_THRESHOLD) {
    let spineMinX = Infinity, spineMinY = Infinity, spineMaxX = -Infinity, spineMaxY = -Infinity;
    for (const [x, y] of spine) {
      if (x < spineMinX) spineMinX = x;
      if (y < spineMinY) spineMinY = y;
      if (x > spineMaxX) spineMaxX = x;
      if (y > spineMaxY) spineMaxY = y;
    }
    const spineBBoxDiagonal = Math.hypot(spineMaxX - spineMinX, spineMaxY - spineMinY);
    const avgSegLen = segments.reduce((sum, s) => sum + s.len, 0) / segments.length;
    const cellSize = Math.max(avgSegLen, 1e-6);
    const segmentGrid = buildSegmentGrid(segments, cellSize);
    findClosest = (px, py) => closestOnSpineIndexed(px, py, segments, vertexTangents, segmentGrid, cellSize, spineBBoxDiagonal);
  } else {
    findClosest = (px, py) => closestOnSpineBruteForce(px, py, segments, vertexTangents);
  }

  // --- Find max distance from spine to any polygon vertex (for speed falloff) ---
  let maxDist = 0;
  for (const [px, py] of polygon) {
    const { dist } = findClosest(px, py);
    maxDist = Math.max(maxDist, dist);
  }
  if (maxDist === 0) maxDist = 1; // safety

  // --- Rasterize the flow map ---
  // const w = resolution, h = resolution;
  const aspect = (maxX - minX) / (maxY - minY);
  let w, h;
  if (aspect > 1) {
    w = maxResolution;
    h = Math.max(32, Math.round(maxResolution / aspect));
  } else {
    h = maxResolution;
    w = Math.max(32, Math.round(maxResolution * aspect));
  }

  const scaleX = (maxX - minX) / w;
  const scaleY = (maxY - minY) / h;
  const data = new Uint8Array(w * h * 4);
  
  // fill line with neutral flow values
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 128; // neutral X
    data[i + 1] = 128; // neutral Y
    data[i + 2] = 0;   // no speed
    data[i + 3] = 255;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = minX + (x + 0.5) * scaleX;
      const py = minY + (y + 0.5) * scaleY;

      // if (!pointInPolygon(px, py, polygon)) continue;

      const { tx, ty, dist } = findClosest(px, py);

      // Parabolic speed falloff: fastest at center, zero at banks
      // const bankFactor = Math.max(0, 1 - (dist / maxDist));
      // const speed = bankFactor * bankFactor;
      // const speed = 1.0;

      const bankFactor = Math.max(0, 1 - (dist / maxDist));
      // const speed = Math.max(0.3, bankFactor * bankFactor);

      // const inside = pointInPolygon(px, py, polygon);
      // // const speed = inside ? Math.max(0.3, bankFactor * bankFactor) : 0;
      // const speed = inside ? 0.7 + 0.3 * bankFactor : 0;
      const speed = 0.7 + 0.3 * bankFactor;

      const i = (y * w + x) * 4;
      data[i]     = Math.round((tx * 0.5 + 0.5) * 255); // R = flow X
      data[i + 1] = Math.round((ty * 0.5 + 0.5) * 255); // G = flow Y
      // data[i + 1] = Math.round((-ty * 0.5 + 0.5) * 255); // G = flow Y (negated for SVG→3D)
      data[i + 2] = Math.round(speed * 255);              // B = speed
      data[i + 3] = 255;
    }
  }

  return { data, width: w, height: h, bounds: { minX, minY, maxX, maxY } };
  
}


// Distance + projection param from a point to one segment, without the
// tangent interpolation (that only needs to happen once, for the winning
// segment) — shared by the brute-force and indexed closest-point search.
function projectOntoSegment(px, py, seg) {
  const apx = px - seg.ax;
  const apy = py - seg.ay;
  let t = seg.len > 0
    ? (apx * seg.dx + apy * seg.dy) / (seg.len * seg.len)
    : 0;
  t = Math.max(0, Math.min(1, t));
  const closestX = seg.ax + t * seg.dx;
  const closestY = seg.ay + t * seg.dy;
  const dx = px - closestX;
  const dy = py - closestY;
  return { t, dist: Math.sqrt(dx * dx + dy * dy) };
}

function tangentAt(segIndex, t, vertexTangents) {
  const startT = vertexTangents[segIndex];
  const endT = vertexTangents[segIndex + 1];
  const lerpTx = startT.tx + t * (endT.tx - startT.tx);
  const lerpTy = startT.ty + t * (endT.ty - startT.ty);
  const len = Math.sqrt(lerpTx * lerpTx + lerpTy * lerpTy) || 1;
  return { tx: lerpTx / len, ty: lerpTy / len };
}

// Plain O(segments) scan — used directly (no grid) below
// SEGMENT_INDEX_THRESHOLD, where building and querying a grid costs more
// than it saves.
function closestOnSpineBruteForce(px, py, segments, vertexTangents) {
  let bestDist = Infinity, bestIdx = -1, bestT = 0;
  for (let i = 0; i < segments.length; i++) {
    const { t, dist } = projectOntoSegment(px, py, segments[i]);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; bestT = t; }
  }
  if (bestIdx === -1) return { tx: 0, ty: 0, dist: Infinity };
  const { tx, ty } = tangentAt(bestIdx, bestT, vertexTangents);
  return { tx, ty, dist: bestDist };
}

// Buckets each segment into every grid cell its bounding box overlaps, for
// closestOnSpineIndexed's expanding-shell search.
function buildSegmentGrid(segments, cellSize) {
  const grid = new Map();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const bx2 = seg.ax + seg.dx, by2 = seg.ay + seg.dy;
    const minCx = Math.floor(Math.min(seg.ax, bx2) / cellSize);
    const maxCx = Math.floor(Math.max(seg.ax, bx2) / cellSize);
    const minCy = Math.floor(Math.min(seg.ay, by2) / cellSize);
    const maxCy = Math.floor(Math.max(seg.ay, by2) / cellSize);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = cx + ',' + cy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    }
  }
  return grid;
}

// Same contract as closestOnSpine, accelerated with an expanding grid
// search (same shape as spatialIndex.js's RingIndex#distanceToEdge) capped
// at 16 cells before falling back to the brute-force scan below — bounded
// cost regardless of how far a query point is from the spine.
function closestOnSpineIndexed(px, py, segments, vertexTangents, grid, cellSize, bboxDiagonal) {
  if (segments.length === 0) return { tx: 0, ty: 0, dist: Infinity };

  let bestDist = Infinity, bestIdx = -1, bestT = 0;
  const maxRadius = Math.min(16, Math.ceil(bboxDiagonal / cellSize) + 1);
  const cx0 = Math.floor(px / cellSize);
  const cy0 = Math.floor(py / cellSize);

  const visitCell = (cx, cy) => {
    const idxs = grid.get(cx + ',' + cy);
    if (!idxs) return;
    for (const i of idxs) {
      const { t, dist } = projectOntoSegment(px, py, segments[i]);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; bestT = t; }
    }
  };

  for (let radius = 0; radius <= maxRadius; radius++) {
    if (radius === 0) {
      visitCell(cx0, cy0);
    } else {
      for (let dx = -radius; dx <= radius; dx++) {
        visitCell(cx0 + dx, cy0 - radius);
        visitCell(cx0 + dx, cy0 + radius);
      }
      for (let dy = -radius + 1; dy <= radius - 1; dy++) {
        visitCell(cx0 - radius, cy0 + dy);
        visitCell(cx0 + radius, cy0 + dy);
      }
    }
    if (bestIdx !== -1 && bestDist <= radius * cellSize) break;
  }

  if (bestIdx === -1 || bestDist > maxRadius * cellSize) {
    for (let i = 0; i < segments.length; i++) {
      const { t, dist } = projectOntoSegment(px, py, segments[i]);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; bestT = t; }
    }
  }

  const { tx, ty } = tangentAt(bestIdx, bestT, vertexTangents);
  return { tx, ty, dist: bestDist };
}

/**
 * Standard ray-casting point-in-polygon test.
 */
function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) &&
        x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}