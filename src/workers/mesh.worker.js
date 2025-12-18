const PoissonDiskSampling = require('poisson-disk-sampling');
const PolygonOffset = require("polygon-offset");
const { Delaunay } = require('d3-delaunay');
const logger = require('electron-log/renderer');

const EPSILON = 1e-8; // or whatever small threshold

const log = logger.scope('WORKER');

function smoothHeightMap(heights, terrainSize, radius = 1, passes = 1) {
  if (!heights || terrainSize < 2 || radius < 1) return heights;
  let input = heights.slice();
  let output = new Float32Array(heights.length);

  for (let pass = 0; pass < passes; pass++) {
    for (let z = 0; z < terrainSize; z++) {
      for (let x = 0; x < terrainSize; x++) {
        let sum = 0, count = 0;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, nz = z + dz;
            if (nx >= 0 && nx < terrainSize && nz >= 0 && nz < terrainSize) {
              sum += input[nz * terrainSize + nx];
              count++;
            }
          }
        }
        output[z * terrainSize + x] = sum / count;
      }
    }
    // Swap buffers for next pass if more
    [input, output] = [output, input];
  }
  // If odd number of passes, result is in input, else in output
  return (passes % 2 === 1)
    ? Float32Array.from(input)
    : Float32Array.from(output);
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

function sampleAlongRing(ring, edgeDensity) {
  let points = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nDivs = Math.max(1, Math.ceil(dist / edgeDensity));
    for (let t = 0; t < nDivs; t++) {
      points.push([
        a[0] + (b[0] - a[0]) * (t / nDivs),
        a[1] + (b[1] - a[1]) * (t / nDivs)
      ]);
    }
  }
  return points;
}

function adaptiveMinDistanceFactory(layer, minX, minY) {
  // Edge settings, fallback to spacing
  const edgeMin = layer.edge?.edgeDensity ?? layer.spacing;
  const edgeThreshold = layer.edge?.threshold ?? 0;
  const baseSpacing = layer.spacing;

  return function adaptiveMinDistance({ x, y }) {
    // x, y are in bbox; transform to mesh coords
    const px = x + minX, py = y + minY;

    const distToOuter = distanceToPolygonEdge([px, py], layer.polygon);
    let distToInner = Infinity;
    for (const hole of layer.holes) {
      const d = distanceToPolygonEdge([px, py], hole);
      if (d < distToInner) distToInner = d;
    }
    const minDistToEdge = Math.min(distToOuter, distToInner);

    if (layer.edge && edgeThreshold > 0 && minDistToEdge <= edgeThreshold) {
      // Linear interpolation: closest to edge = edgeMin, fades up to baseSpacing
      return edgeMin + (baseSpacing - edgeMin) * (minDistToEdge / edgeThreshold);
    } else {
      return baseSpacing;
    }
  };
}

function computeVertexColors(allPoints, polygon, holes, blendDist = 2) {
  const vertexColors = []; // Flat array: [r,g,b,a, r,g,b,a, ...] or however you need

  // const blendDist = 10; // Or your chosen X value
  for (let i = 0; i < allPoints.length; i++) {
    const [x, z] = allPoints[i];
    const pt = [x, z];
    const distToOuter = distanceToPolygonEdge(pt, polygon);

    // Compute 2D distance to outer edge (polygon, not holes)
    // const distToOuter = distanceToPolygonEdge([x, z], polygon);

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

    // if (distToOuter <= blendDist) {
    //   // Outer edge is RED (using RGB: 1,0,0)
    //   const t = Math.max(0, Math.min(1, distToOuter / blendDist));
    //   const r = 1;
    //   const g = 1 - t;
    //   const b = 1 - t;
    //   vertexColors.push(r, g, b); // red fade out to white
    // } else {
    //   // Default: WHITE
    //   vertexColors.push(1.0, 1.0, 1.0);
    // }
  }
  return vertexColors;
}

function digMesh(positions, polygon, holes, depth = 2, curve = 'smooth', curvePower = 2) {
  let maxDist = 0;
  const insideList = [];
  for (let i = 0; i < positions.length; i += 3) {
    // const pos = positions[i];
    const x = positions[i];
    // const y = positions[i + 1];
    const z = positions[i + 2];

    const pt2D = [x, z]; // [x,z] for polygon
    if (isPointInPolygon(pt2D, polygon, holes)) {
      const dist = distanceToPolygonEdge(pt2D, polygon);
      if (dist > maxDist) maxDist = dist;
      insideList.push({ idx: i + 1, dist });
    }
  }
  for (const obj of insideList) {
    const t = maxDist ? obj.dist / maxDist : 0;
    let f;
    switch (curve) {
      case 'linear': f = t; break;
      case 'pow': f = 1 - Math.pow(1 - t, curvePower); break; // Inverted!
      case 'sine': f = Math.sin(t * Math.PI / 2); break;
      default: f = t * t * (3 - 2 * t);
    }
    // Lower the y (height) value
    positions[obj.idx] -= f * depth;
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

function isPointInPolygon(point, ring, holes) {
  if (!pointInRing(point, ring)) return false;
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
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


function getBoundingBox(rings) {
  let xs = [], ys = [];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      xs.push(x); ys.push(y);
    }
  }
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const width = maxX - minX;
  const height = maxY - minY;

  return { minX, minY, maxX, maxY, width, height };
}

function triCentroid(p1, p2, p3) { return [(p1[0] + p2[0] + p3[0]) / 3, (p1[1] + p2[1] + p3[1]) / 3]; }

function triangleArea2D(p0, p1, p2) {
  // [ [x0, y0], [x1, y1], [x2, y2] ]
  return 0.5 * Math.abs(
    (p1[0] - p0[0]) * (p2[1] - p0[1]) -
    (p2[0] - p0[0]) * (p1[1] - p0[1])
  );
}

function distanceWeight(dist, maxDist) {
  return dist >= maxDist ? 0 : dist <= 0 ? 1 : 1 - dist / maxDist;
}

function generateMesh({ layer, settings: { heightMap, svgSize, terrainSize, heightScale } }) {
  // console.time('diskSample');
  const boundaryPts = layer.polygon;
  const holePts = layer.holes.flat();
  // const { pts, triangles } = triangulateWithConstraints(layer.polygon, layer.holes || [], spacing);
  const { width, height, minY, minX } = getBoundingBox([layer.polygon, ...layer.holes]);

  // TODO: move to setting on layer
  const edgeInfluenceRange = 5;

  // Sample points with Poisson-disk
  const pds = new PoissonDiskSampling({
    shape: [width, height], // use polygon bbox
    minDistance: layer.spacing,   // controls "edge length" of triangles
    // minDistance: adaptiveMinDistanceFactory(layer, minX, minY),
    // minDistance: ({ x, y }) => adaptiveMinDistance(layer, [x + minX, y + minY]),
    // minDistance: ({ x, y }) => getAdaptiveMinDistance([x + minX, y + minY], layer.polygon, layer.holes, layer.spacing),
    tries: 30
  });

  // Optionally seed with boundary/holes points to preserve contour
  layer.polygon.forEach(point => pds.addPoint(point));
  layer.holes.forEach(h => h.forEach(p => pds.addPoint(p)));

  // const pts = pds.fill();
  const samples = pds.fill().map(([x, y]) => [x + minX, y + minY]);
  // console.timeEnd('diskSample');
  const interiorSamples = samples.filter(pt => isPointInPolygon(pt, layer.polygon, layer.holes));

  // if (layer.edge?.edgeDensity && layer.edge.threshold > 0) {
  //   const offset = new PolygonOffset();
  //   // How many rings inward to cover threshold?
  //   const nRings = 1; // Math.ceil(layer.edge.threshold / layer.edge.edgeDensity);

  //   for (let r = 1; r <= nRings; r++) {
  //     const distance = -r * layer.edge.edgeDensity;
  //     let offsetPoly = offset.data(layer.polygon).offset(distance)[0];

  //     // Defensive: skip empty, degenerate, or self-intersecting rings
  //     if (!offsetPoly) continue;
  //     if (offsetPoly.length < 3) continue;

  //     // Optionally, remove points closer than a certain threshold within the ring itself
  //     let filteredRing = [];
  //     for (let pt of offsetPoly) {
  //       if (!filteredRing.some(p => Math.hypot(p[0] - pt[0], p[1] - pt[1]) < 1e-6)) {
  //         filteredRing.push(pt);
  //       }
  //     }
  //     if (filteredRing.length < 3) continue;

  //     edgeRingPoints.push(...sampleAlongRing(filteredRing, layer.edge.edgeDensity));
  //   }

  //   // for (let r = 1; r <= nRings; r++) {
  //   //   const distance = -r * layer.edge.edgeDensity; // Negative for inward offset
  //   //   const offsetPoly = offset.data(layer.polygon).offset(distance)[0];
  //   //   if (!offsetPoly) break; // Sometimes polygon vanishes if too much inset
  //   //   edgeRingPoints.push(...sampleAlongRing(offsetPoly, layer.edge.edgeDensity));
  //   // }
  //   // Optionally: Also process holes, outwards, in similar fashion
  // }

  const allPoints = preserveBoundaryAndDedupe(boundaryPts, holePts, interiorSamples);

  // console.time('triangulation');
  // Delaunay triangulation
  const delaunay = Delaunay.from(allPoints);
  const triangles = Array.from(delaunay.triangles); // grouped as [i0, i1, i2,...]

  // Filter triangles that fall outside of polygon
  const finalTriangles = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];

    if (a === b || b === c || a === c) continue;
    // if (triangleArea2D(allPoints[a], allPoints[b], allPoints[c]) < EPSILON) continue;

    const centroid = triCentroid(allPoints[a], allPoints[b], allPoints[c]);
    if (isPointInPolygon(centroid, layer.polygon, layer.holes)) {
      finalTriangles.push(a, b, c); // Use flat output!qss
    }
  }


  const positions = [];
  let finalHeightMap = heightMap;
  finalHeightMap = smoothHeightMap(heightMap, terrainSize, 2);

  for (const [x, z] of allPoints) {
    let y = 0;
    if (heightMap) {
      const [tx, tz] = svgToTerrain(x, z, svgSize[0], terrainSize);
      // Get/interpolate terrain height
      y = interpHeight(finalHeightMap, tx, tz, terrainSize);

      // If Unity height range is [0, 65535], you might want to scale to meters
      // For example, if your terrain in Unity is 600m tall, scale = 600/65535
      // If not, just use the raw value.

      // Example: scale height (adjust as needed)
      y = (y / 65535) * heightScale;
    }
    positions.push(x, y, z);
  }

  if (layer.dig?.depth) {
    digMesh(positions, layer.polygon, layer.holes, layer.dig.depth, layer.dig.curve, layer.dig.curvePower);
  }

  // fill with white
  let colors = new Array(allPoints.length * 3).fill(1);
  if (layer.blend && layer.blend > 0) {
    colors = computeVertexColors(allPoints, layer.polygon, layer.holes, layer.blend);
  }

  return {
    triangles: finalTriangles,
    points: positions,
    colors
  };

}


self.onmessage = (event) => {
  if (event.data) {
    log.info(`Starting mesh worker job: ${event.data.layer.id}`);
    const result = generateMesh(event.data);
    postMessage({ ...event.data, mesh: result });
  }
};