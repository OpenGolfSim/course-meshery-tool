
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const xx = x1 + t * dx, yy = y1 + t * dy;
  return Math.hypot(px - xx, py - yy);
}

export function distanceToPolygonEdge(pt, ring) {
  let min = Infinity, n = ring.length;
  for (let i = 0; i < n; ++i) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    const d = pointToSegmentDist(pt[0], pt[1], x1, y1, x2, y2);
    if (d < min) min = d;
  }
  return min;
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > y) !== (yj > y)) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInPolygon(point, ring, holes) {
  if (!pointInRing(point, ring)) return false;
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}
