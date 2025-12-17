// --- Dig/Basin logic: modifies vertex heights in-place ---
export function digMesh(points, polygon, holes, depth = 2, curve = 'smooth', curvePower = 2) {
  // Calculate edge distances for points inside the area
  let maxDist = 0;
  const insideList = [];
  for (let i = 0; i < points.length; ++i) {
    const pt = points[i];
    if (isPointInPolygon(pt, polygon, holes)) {
      const dist = distanceToPolygonEdge(pt, polygon);
      if (dist > maxDist) maxDist = dist;
      insideList.push({ idx: i, dist });
    }
  }
  // Lower the heights based on normalized distance to edge, using a curve
  for (const obj of insideList) {
    const t = maxDist ? obj.dist / maxDist : 0;
    let f;
    switch (curve) {
      case 'linear': f = t; break;
      case 'pow': f = Math.pow(t, curvePower); break;
      case 'sine': f = Math.sin(t * Math.PI / 2); break;
      default: f = t * t * (3 - 2 * t); // smoothstep
    }
    // For your format, we want points as [x, y], and y is flat
    // For 3D, we'd use [x, y, z], with z height. Here y is height.
    points[obj.idx][1] -= f * depth;
  }
}
function distanceToPolygonEdge(pt, ring) {
  let min = Infinity, n = ring.length;
  for (let i = 0; i < n; ++i) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    const d = pointToSegmentDist(pt[0], pt[1], x1, y1, x2, y2);
    if (d < min) min = d;
  }
  return min;
}
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const xx = x1 + t * dx, yy = y1 + t * dy;
  return Math.hypot(px - xx, py - yy);
}

export function svgToTerrain(x, z, svgSize, terrainSize = 4097) {
  // Clamp/limit to prevent overflow on edges
  const tx = Math.max(0, Math.min(terrainSize - 1, (x / svgSize) * (terrainSize - 1)));
  const tz = Math.max(0, Math.min(terrainSize - 1, (z / svgSize) * (terrainSize - 1)));
  return [tx, tz];
}

export function interpHeight(heights, tx, tz, terrainSize) {

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