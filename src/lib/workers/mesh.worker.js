import { expose } from 'threads/worker';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { Delaunay } from 'd3-delaunay';
import { conformMeshToTerrain, smoothTerrainData } from '../terrain';

const MIN_DISTANCE = 1e-8; // or whatever small threshold

function cubicBezierY(points, t) {
  const y0 = 1 - points[0][1];
  const y1 = 1 - points[1][1];
  const y2 = 1 - points[2][1];
  const y3 = 1 - points[3][1];
  const mt = 1 - t;
  return (
    y0 * mt * mt * mt +
    3 * y1 * mt * mt * t +
    3 * y2 * mt * t * t +
    y3 * t * t * t
  );
}

function digMesh(mesh, shape, layer) {
  const { points } = mesh;
  const { polygon, holes } = shape;
  const { curvePower, curve, curvePoints, depth, distance } = layer.dig;
  let maxDist = 0;
  const insideList = [];
  
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];

    const pt2D = [x, z]; // [x,z] for polygon
    if (isPointInPolygon(pt2D, polygon, holes)) {
      const dist = distanceToPolygonEdge(pt2D, polygon);
      if (dist > maxDist) maxDist = dist;
      insideList.push({ idx: i / 3, dist, point: [x, y, z] });
    }
  }

  const copy = new Float32Array(points); // start with everything untouched
  const digDistance = distance * maxDist;
  for (const obj of insideList) {
    let t = Math.min(obj.dist / digDistance, 1);
    // let t = maxDist ? obj.dist / maxDist : 0;
    // console.log('draw', t, obj);
    let f;
    switch (curve) {
      case 'linear':
        f = t;
        break;
      case 'pow':
        f = 1 - Math.pow(1 - t, curvePower);
        break; // Inverted!
      case 'sine':
        f = Math.sin(t * Math.PI / 2);
        break;
      case 'bezier':
        // ??
        f = cubicBezierY(curvePoints, t);
        break;
      default:
        f = t * t * (3 - 2 * t);
    }
    const [x, y, z] = obj.point;
    const reduce = f * depth;
    const base = obj.idx * 3;
    copy[base]     = x;
    copy[base + 1] = y - reduce;
    copy[base + 2] = z;

    // positions.setXYZ(obj.idx, x, y - reduce, z);
  }

  return {
    ...mesh,
    points: copy
  }
}

function preserveBoundaryAndDedupe(boundaryPts, holePts, extraPts, minDist = 0.02) {
  if (!minDist) minDist = 1e-6;
  const minDistSq = minDist * minDist;

  // Start with boundary and hole points always preserved
  const output = [...boundaryPts, ...holePts];

  for (let i = 0; i < extraPts.length; i++) {
    const [x, y] = extraPts[i];
    let tooClose = false;

    // Check against all preserved points
    for (let j = 0; j < output.length; j++) {
      const [bx, by] = output[j];
      const dx = x - bx, dy = y - by;
      if (dx * dx + dy * dy < minDistSq) {
        tooClose = true;
        break;
      }
    }

    // Also check already accepted added points
    if (!tooClose) {
      output.push(extraPts[i]);
    }
  }
  return output;
}

function computeVertexColors(allPoints, polygon, holes, blendDist = 2) {
  const vertexColors = []; // Flat array: [r,g,b,a, r,g,b,a, ...] or however you need

  for (let i = 0; i < allPoints.length; i++) {
    const [x, z] = allPoints[i];
    const pt = [x, z];
    const distToOuter = distanceToPolygonEdge(pt, polygon);

    // Calculate min distance to any inner hole edge
    let distToInner = Infinity;
    for (const hole of holes) {
      const d = distanceToPolygonEdge(pt, hole);
      if (d < distToInner) distToInner = d;
    }

    // We only care about vertices within blendDist of an edge
    // Start with default: pure white
    let r = 1, g = 1, b = 1;

    // Is this within the outer edge blend zone?
    if (distToOuter <= blendDist && distToOuter <= distToInner) {
      let t = 1 - (distToOuter / blendDist);
      t = Math.max(0, Math.min(1, t));
      r = 1.0;
      g = 1.0 - t;
      b = 1.0 - t;
    }
    // Is this within the inner edge (hole) blend zone?
    else if (distToInner <= blendDist) {
      let t = 1 - (distToInner / blendDist);
      t = Math.max(0, Math.min(1, t));
      r = 1.0 - t; // white (1) to blue (0)
      g = 1.0 - t; // white (1) to blue (0)
      b = 1.0;
    }
    // else remains white
    vertexColors.push(r, g, b);
  }
  return vertexColors;
}

function triCentroid(p1, p2, p3) { return [(p1[0] + p2[0] + p3[0]) / 3, (p1[1] + p2[1] + p3[1]) / 3]; }

function triangleArea2D(p0, p1, p2) {
  // [ [x0, y0], [x1, y1], [x2, y2] ]
  return 0.5 * Math.abs(
    (p1[0] - p0[0]) * (p2[1] - p0[1]) -
    (p2[0] - p0[0]) * (p1[1] - p0[1])
  );
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

function isPointInPolygon(point, ring, holes) {
  if (!pointInRing(point, ring)) return false;
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const xx = x1 + t * dx, yy = y1 + t * dy;
  return Math.hypot(px - xx, py - yy);
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

function getBoundingBox(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  return { minX, minY, maxX, maxY, width, height };
}

function adaptiveMinDistanceFactory(layer, shape, minX, minY) {
  return function adaptiveMinDistance([x, y]) {
    // x, y are in bbox; transform to mesh coords
    const px = x + minX, py = y + minY;

    const distToOuter = distanceToPolygonEdge([px, py], shape.polygon);
    if (distToOuter <= layer.blending.distance) {
      // return min grid size
      return 0;
    }
    let distToInner = Infinity;
    for (const hole of shape.holes) {
      const d = distanceToPolygonEdge([px, py], hole);
      if (d < distToInner) {
        distToInner = d;
      }
      if (distToInner <= layer.blending.distance) {
        return 0;
      }

    }
    // return max grid size
    return 1;
  };
}

export function generateMesh(layer, shape) {
  if (layer.error) {
    return;
  }
  // console.time('diskSample');
  const boundaryPts = shape.polygon;
  const holePts = shape.holes?.flat() || [];
  // const { pts, triangles } = triangulateWithConstraints(layer.polygon, layer.holes || [], spacing);
  const { width, height, minY, minX } = getBoundingBox([shape.polygon, ...shape.holes]);

  let opts = {
    minDistance: layer.spacing
  };
  if (layer.blending?.enabled && layer.blending?.spacing > 0 && layer.blending?.spacing !== layer?.spacing) {
    opts = {
      minDistance: layer.blending.spacing,
      maxDistance: layer.spacing,
      distanceFunction: adaptiveMinDistanceFactory(layer, shape, minX, minY),
    }
  }
  // Sample points with Poisson-disk
  const pds = new PoissonDiskSampling({
    shape: [width, height],
    tries: 30,
    ...opts
  });

  // Optionally seed with boundary/holes points to preserve contour
  shape.polygon.forEach(point => pds.addPoint([point[0] - minX, point[1] - minY]));
  // layer.holes.forEach(h => h.forEach(p => pds.addPoint([p[0] - minX, p[1] - minY])));

  // const pts = pds.fill();
  const samples = pds.fill().map(([x, y]) => [x + minX, y + minY]);
  // console.timeEnd('diskSample');
  const interiorSamples = samples.filter(pt => isPointInPolygon(pt, shape.polygon, shape.holes));


  const allPoints = preserveBoundaryAndDedupe(boundaryPts, holePts, interiorSamples);

  // Delaunay triangulation
  const delaunay = Delaunay.from(allPoints);
  const triangles = Array.from(delaunay.triangles);

  // Filter triangles that fall outside of polygon
  const finalTriangles = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];

    if (a === b || b === c || a === c) continue;
    if (triangleArea2D(allPoints[a], allPoints[b], allPoints[c]) < MIN_DISTANCE) continue;

    const centroid = triCentroid(allPoints[a], allPoints[b], allPoints[c]);
    if (isPointInPolygon(centroid, shape.polygon, shape.holes)) {
      finalTriangles.push(a, b, c); // Use flat output!qss
    }
  }

  // generate flat 3D array of points
  const positions3D = [];
  for (const [x, z] of allPoints) {
    positions3D.push(x, 0, z);
  }

  // fill with white color
  let colors = new Array(allPoints.length * 3).fill(1);
  if (layer.blending?.enabled && layer.blending?.distance > 0) {
    colors = computeVertexColors(allPoints, shape.polygon, shape.holes, layer.blending.distance);
  }

  return {
    triangles: finalTriangles,
    points: new Float32Array(positions3D),
    // points: allPoints,
    colors: new Float32Array(colors)
  };
}

expose({ generateMesh, conformMeshToTerrain, smoothTerrainData, digMesh });