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

  // --- Find max distance from spine to any polygon vertex (for speed falloff) ---
  let maxDist = 0;
  for (const [px, py] of polygon) {
    const { dist } = closestOnSpine(px, py, segments, vertexTangents);
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

      const { tx, ty, dist } = closestOnSpine(px, py, segments, vertexTangents);

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


/**
 * Find the closest point on the spine polyline, returning the
 * interpolated tangent and perpendicular distance.
 */
function closestOnSpine(px, py, segments, vertexTangents) {
  let bestDist = Infinity;
  let bestTx = 0, bestTy = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Project point onto the line segment
    const apx = px - seg.ax;
    const apy = py - seg.ay;
    let t = seg.len > 0
      ? (apx * seg.dx + apy * seg.dy) / (seg.len * seg.len)
      : 0;
    t = Math.max(0, Math.min(1, t));

    // Distance from point to closest spot on segment
    const closestX = seg.ax + t * seg.dx;
    const closestY = seg.ay + t * seg.dy;
    const dx = px - closestX;
    const dy = py - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < bestDist) {
      bestDist = dist;
      // Interpolate tangent between start and end vertex of this segment
      const startT = vertexTangents[i];
      const endT = vertexTangents[i + 1];
      const lerpTx = startT.tx + t * (endT.tx - startT.tx);
      const lerpTy = startT.ty + t * (endT.ty - startT.ty);
      const len = Math.sqrt(lerpTx * lerpTx + lerpTy * lerpTy) || 1;
      bestTx = lerpTx / len;
      bestTy = lerpTy / len;
    }
  }

  return { tx: bestTx, ty: bestTy, dist: bestDist };
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