import { expose } from 'threads/worker';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { Delaunay } from 'd3-delaunay';
import poly2tri from 'poly2tri';
import { lerp, smootherstep, smoothstep } from '../utils';

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
  const vertexColors = []; // Flat array: [r,g,b, r,g,b, ...]
  const bufferDist = blendDist * 0.85; // stop the blending just before the denser grid ends

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
    if (distToOuter <= bufferDist && distToOuter <= distToInner) {
      let t = 1 - (distToOuter / bufferDist);
      t = Math.max(0, Math.min(1, t));
      r = 1.0;
      g = 1.0 - t;
      b = 1.0 - t;
    }
    // Is this within the inner edge (hole) blend zone?
    else if (distToInner <= bufferDist) {
      let t = 1 - (distToInner / bufferDist);
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

/**
 * Generate points inset from polygon/hole edges so that Delaunay always has
 * nearby interior vertices to form well-shaped triangles along boundaries,
 * even when grid spacing is large.
 */
// function generateEdgeBufferPoints(polygon, holes, spacing) {
//   const buffer = [];
//   const inset = spacing * 0.4;
//   const step = spacing * 0.5;

//   function addBufferForRing(ring) {
//     for (let i = 0; i < ring.length; i++) {
//       const [x1, y1] = ring[i];
//       const [x2, y2] = ring[(i + 1) % ring.length];
//       const dx = x2 - x1, dy = y2 - y1;
//       const len = Math.hypot(dx, dy);
//       if (len < 1e-9) continue;
//       // Inward-pointing normal (assumes CCW winding for outer, CW for holes)
//       const nx = -dy / len, ny = dx / len;
//       const steps = Math.max(1, Math.floor(len / step));
//       for (let s = 0; s <= steps; s++) {
//         const t = s / steps;
//         buffer.push([
//           x1 + t * dx + nx * inset,
//           y1 + t * dy + ny * inset
//         ]);
//       }
//     }
//   }

//   addBufferForRing(polygon);
//   for (const hole of holes) {
//     addBufferForRing(hole);
//   }
//   return buffer;
// }


/**
 * Run Delaunay triangulation and filter to triangles inside the polygon.
 */
function triangulateAndFilter(allPoints, polygon, holes) {
  const delaunay = Delaunay.from(allPoints);
  const triangles = Array.from(delaunay.triangles);

  const result = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i];
    const b = triangles[i + 1];
    const c = triangles[i + 2];

    if (a === b || b === c || a === c) continue;
    if (triangleArea2D(allPoints[a], allPoints[b], allPoints[c]) < MIN_DISTANCE) continue;

    const centroid = triCentroid(allPoints[a], allPoints[b], allPoints[c]);
    if (isPointInPolygon(centroid, polygon, holes)) {
      result.push(a, b, c);
    }
  }
  return result;
}


/**
 * Find boundary/hole edges missing from the triangulation.
 * Returns repair points offset inward from each uncovered edge midpoint.
 */
function findRepairPoints(shape, allPoints, finalTriangles) {
  const edgeSet = new Set();
  for (let i = 0; i < finalTriangles.length; i += 3) {
    const a = finalTriangles[i];
    const b = finalTriangles[i + 1];
    const c = finalTriangles[i + 2];
    edgeSet.add(`${Math.min(a, b)}_${Math.max(a, b)}`);
    edgeSet.add(`${Math.min(b, c)}_${Math.max(b, c)}`);
    edgeSet.add(`${Math.min(a, c)}_${Math.max(a, c)}`);
  }

  const repairs = [];

  function checkRing(ring, startIndex) {
    for (let i = 0; i < ring.length; i++) {
      const ai = startIndex + i;
      const bi = startIndex + ((i + 1) % ring.length);
      const key = `${Math.min(ai, bi)}_${Math.max(ai, bi)}`;

      if (!edgeSet.has(key)) {
        const [x1, y1] = allPoints[ai];
        const [x2, y2] = allPoints[bi];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;

        const nx = -dy / len, ny = dx / len;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const inset = Math.max(len * 0.4, 0.5);

        // Try both normal directions — winding differs between outer and holes
        const candidate1 = [mx + nx * inset, my + ny * inset];
        const candidate2 = [mx - nx * inset, my - ny * inset];

        if (isPointInPolygon(candidate1, shape.polygon, shape.holes)) {
          repairs.push(candidate1);
        } else if (isPointInPolygon(candidate2, shape.polygon, shape.holes)) {
          repairs.push(candidate2);
        }
      }
    }
  }

  checkRing(shape.polygon, 0);
  let offset = shape.polygon.length;
  for (const hole of shape.holes) {
    checkRing(hole, offset);
    offset += hole.length;
  }

  return repairs;
}

function generateEdgeBufferPoints(polygon, holes, spacing) {
  const buffer = [];
  const step = spacing * 0.33;
  const numLayers = 4;

  function addForRing(ring) {
    let perimeter = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      perimeter += Math.hypot(x2 - x1, y2 - y1);
    }

    const numSamples = Math.max(1, Math.floor(perimeter / step));

    for (let s = 0; s < numSamples; s++) {
      const targetDist = (s / numSamples) * perimeter;
      let accumulated = 0;

      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        const dx = x2 - x1, dy = y2 - y1;
        const edgeLen = Math.hypot(dx, dy);
        if (edgeLen < 1e-9) continue;

        if (accumulated + edgeLen >= targetDist) {
          const t = (targetDist - accumulated) / edgeLen;
          const px = x1 + t * dx;
          const py = y1 + t * dy;
          // const nx = -dy / edgeLen, ny = dx / edgeLen;
          const nx = dy / edgeLen, ny = -dx / edgeLen;

          for (let layer = 1; layer <= numLayers; layer++) {
            buffer.push([
              px + nx * step * layer + (Math.random() - 0.5) * 1e-4,
              py + ny * step * layer + (Math.random() - 0.5) * 1e-4
            ]);
          }
          break;
        }
        accumulated += edgeLen;
      }
    }
  }

  addForRing(polygon);
  for (const hole of holes) {
    addForRing(hole);
  }
  return buffer;
}

export function generateMesh(layer, shape) {
  if (layer.error) {
    return;
  }

  const boundaryPts = shape.polygon;
  const holePts = shape.holes?.flat() || [];
  const { width, height, minY, minX } = getBoundingBox([shape.polygon, ...shape.holes]);

  // PDS sampling — completely unchanged
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

  const pds = new PoissonDiskSampling({
    shape: [width, height],
    tries: 30,
    ...opts
  });

  shape.polygon.forEach(point => pds.addPoint([point[0] - minX, point[1] - minY]));

  const samples = pds.fill().map(([x, y]) => [x + minX, y + minY]);
  const interiorSamples = samples.filter(pt => isPointInPolygon(pt, shape.polygon, shape.holes));

  // Add buffer points near edges for large-spacing meshes to prevent spike triangles
  let extraPts = interiorSamples;
  // if (layer.spacing > 1) {
  //   const bufferPts = generateEdgeBufferPoints(shape.polygon, shape.holes, layer.spacing)
  //     .filter(pt => isPointInPolygon(pt, shape.polygon, shape.holes));
  //   console.log(`Buffer: ${bufferPts.length} survived filtering out of pre-filter total`);
  //   extraPts = [...bufferPts, ...interiorSamples];
  // }

  const minDist = 0.04;
  const allPoints = preserveBoundaryAndDedupe(boundaryPts, holePts, extraPts, minDist);

  // const allPoints = preserveBoundaryAndDedupe(boundaryPts, holePts, interiorSamples);

  // --- poly2tri triangulation ---
  // Create Point objects with back-references to allPoints indices
  const p2tPoints = allPoints.map(([x, y], i) => {
    const p = new poly2tri.Point(x, y);
    p._idx = i;
    return p;
  });

  // Contour = boundary points (first boundaryPts.length entries in allPoints)
  const contour = p2tPoints.slice(0, boundaryPts.length);
  const ctx = new poly2tri.SweepContext(contour);

  // Add holes using their index ranges in allPoints
  let offset = boundaryPts.length;
  for (const hole of shape.holes) {
    ctx.addHole(p2tPoints.slice(offset, offset + hole.length));
    offset += hole.length;
  }

  // Everything after boundary+hole points are interior Steiner points
  for (let i = offset; i < p2tPoints.length; i++) {
    ctx.addPoint(p2tPoints[i]);
  }

  ctx.triangulate();
  const p2tTriangles = ctx.getTriangles();

  // Map back to flat index array using the _idx we attached
  const finalTriangles = [];
  for (const tri of p2tTriangles) {
    const pts = tri.getPoints();
    // swap so rendering is on top
    finalTriangles.push(pts[0]._idx, pts[2]._idx, pts[1]._idx);
  }

  // --- Everything below is unchanged ---

  // Generate flat 3D array of points
  const positions3D = [];
  for (const [x, z] of allPoints) {
    positions3D.push(x, 0, z);
  }

  // Fill with white color
  let colors = new Array(allPoints.length * 3).fill(1);
  if (layer.blending?.enabled && layer.blending?.distance > 0) {
    colors = computeVertexColors(allPoints, shape.polygon, shape.holes, layer.blending.distance);
  }

  return {
    triangles: finalTriangles,
    points: new Float32Array(positions3D),
    colors: new Float32Array(colors)
  };
}

/**
 * Smooth/level the terrain around a lake shore to remove lidar ridges and
 * unnatural rim artifacts.
 *
 */
function smoothLakeShore(mesh, shape, options = {}) {
  const {
    outerRadius = 4.0,   // meters outside lake edge to blend
    innerRadius = 2.0,   // meters inside lake edge to flatten toward water level
    waterLevel = null,    // explicit water elevation; null = auto-detect from rim
    rimSampleWidth = 1.5, // width of the band used to auto-detect water level
    smoothPower = 2,      // 1 = smoothstep, 2 = smootherstep (C² continuity)
  } = options;

  const { points } = mesh;
  const { polygon, holes } = shape;

  // --- Phase 1: Compute signed distance + classify every vertex ---
  const vertexInfo = [];
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    const pt2D = [x, z];

    const distOuter = distanceToPolygonEdge(pt2D, polygon);

    // Min distance to any hole edge (holes are islands inside the lake shape)
    let distHole = Infinity;
    for (const hole of holes) {
      distHole = Math.min(distHole, distanceToPolygonEdge(pt2D, hole));
    }

    const inside = isPointInPolygon(pt2D, polygon, holes);
    // Signed distance: negative inside, positive outside
    const signedDist = inside ? -Math.min(distOuter, distHole) : distOuter;

    vertexInfo.push({ idx: i, signedDist, y });
  }

  // --- Phase 2: Determine water level from the rim ---
  let targetWaterLevel = waterLevel;
  if (targetWaterLevel === null) {
    // Sample heights of vertices in a narrow band just outside the edge
    const rimHeights = vertexInfo
      .filter(v => v.signedDist > 0 && v.signedDist < rimSampleWidth)
      .map(v => v.y);

    if (rimHeights.length > 2) {
      // Use a low percentile rather than median — the "natural" shore height
      // is the low side of the rim, not the ridgeline
      rimHeights.sort((a, b) => a - b);
      const pIdx = Math.floor(rimHeights.length * 0.25);
      targetWaterLevel = rimHeights[pIdx];
    } else {
      // Fallback: grab the lowest inside-edge vertex
      const insideNearEdge = vertexInfo
        .filter(v => v.signedDist < 0 && v.signedDist > -innerRadius);
      targetWaterLevel = insideNearEdge.length
        ? Math.min(...insideNearEdge.map(v => v.y))
        : 0;
    }
  }

  // --- Phase 3: Blend heights ---
  const copy = new Float32Array(points);

  for (const v of vertexInfo) {
    const d = v.signedDist;

    if (d >= outerRadius || d <= -innerRadius) {
      // Outside the influence zone — no change
      continue;
    }

    let blendedY;

    if (d >= 0) {
      // OUTSIDE the lake, within outerRadius of the edge
      // t: 0 at edge → 1 at outerRadius
      const t = smoothFalloff(d / outerRadius, smoothPower);
      // At edge (t≈0): pull toward waterLevel
      // At outerRadius (t≈1): keep original height
      blendedY = lerp(targetWaterLevel, v.y, t);
    } else {
      // INSIDE the lake, within innerRadius of the edge
      // t: 0 at edge → 1 at innerRadius depth
      const t = smoothFalloff(-d / innerRadius, smoothPower);
      // At edge (t≈0): should be at waterLevel
      // At innerRadius (t≈1): keep whatever dig/conform gave it
      blendedY = lerp(targetWaterLevel, v.y, t);
    }

    copy[v.idx + 1] = blendedY;
  }

  return { ...mesh, points: copy };
}

function smoothFalloff(x, power = 1) {
  if (power === 1) {
    return smoothstep(x);
  }
  return smootherstep(x);
}

export function conformMeshToTerrain(layer, mesh, project, heightMap) {
  let svgSize = Math.round(project.settings.distance * 1000);
  let heightScale = project?.stats?.heightScale || project?.stats?.relief || 1;
  if (!(svgSize > 0)) {
    throw new Error('SVG size is invalid');
  }
  if (!heightMap) {
    throw new Error('heightMap is missing or invalid');
  }
  const positions = [];
  const heightData = heightMap?.data;
  const heightSize = heightMap?.size;

  if (!heightData) {
    throw new Error('No heightmap data');
  } else if (!heightSize) {
    throw new Error('No heightmap size');
  }

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

expose({ generateMesh, digMesh, conformMeshToTerrain });