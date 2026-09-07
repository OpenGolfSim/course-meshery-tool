const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_SVG = path.join(REPO_ROOT, 'course.20260904.svg');
const BASELINE_PATH = path.join(__dirname, 'baseline.json');

// Layers that intentionally don't get a mesh (background rectangle, or fully
// covered by layers above it) — real, expected, not something to flag.
function isMeshable(layer, shape) {
  return layer.id !== 'base' && !!shape?.polygon?.length;
}

function triangleSurfaceArea(points, triangles) {
  let total = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3;
    const ax = points[a], az = points[a + 2];
    const bx = points[b], bz = points[b + 2];
    const cx = points[c], cz = points[c + 2];
    total += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  return total;
}

function heightStats(points) {
  let min = Infinity, max = -Infinity, sum = 0;
  const n = points.length / 3;
  for (let i = 0; i < points.length; i += 3) {
    const y = points[i + 1];
    if (y < min) min = y;
    if (y > max) max = y;
    sum += y;
  }
  return n ? { min, max, mean: sum / n } : { min: 0, max: 0, mean: 0 };
}

// A flat, synthetic heightmap stands in for a real DEM/LIDAR import — good
// enough to exercise conformMeshToTerrain/digMesh without needing terrain data.
function buildStubHeightMap(size = 513, value = 32768) {
  return { size, data: new Uint16Array(size * size).fill(value) };
}

function buildStubProject(svgSizeUnits) {
  return {
    settings: { distance: svgSizeUnits / 1000 },
    stats: { heightScale: 1 },
  };
}

module.exports = {
  REPO_ROOT,
  DEFAULT_SVG,
  BASELINE_PATH,
  isMeshable,
  triangleSurfaceArea,
  heightStats,
  buildStubHeightMap,
  buildStubProject,
};
