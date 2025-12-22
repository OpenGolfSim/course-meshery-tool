import Delaunator from 'delaunator';
import PoissonDiskSampling from 'poisson-disk-sampling';
// const PolygonOffset = require("polygon-offset");
import { Delaunay } from 'd3-delaunay';
import logger from 'electron-log/renderer';
import { smoothTerrainData } from '../lib/terrain';
import { distanceToPolygonEdge, isPointInPolygon } from '../lib/mesh';
import { parseSVG } from '../lib/svg';

const EPSILON = 1e-8; // or whatever small threshold

const log = logger.scope('WORKER');


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
  // const edgeMin = layer.edge?.edgeDensity ?? layer.spacing;
  // const edgeThreshold = layer.edge?.threshold ?? 0;
  // const baseSpacing = layer.spacing;

  return function adaptiveMinDistance([x, y]) {
    // x, y are in bbox; transform to mesh coords
    const px = x + minX, py = y + minY;

    const distToOuter = distanceToPolygonEdge([px, py], layer.polygon);
    if (distToOuter <= layer.blend) {
      // return min grid size
      return 0;
    }
    let distToInner = Infinity;
    for (const hole of layer.holes) {
      const d = distanceToPolygonEdge([px, py], hole);
      if (d < distToInner) {
        distToInner = d;
      }
      if (distToInner <= layer.blend) {
        return 0;
      }

    }
    // return max grid size
    return 1;
    // const minDistToEdge = Math.min(distToOuter, distToInner);

    // if (layer.edge && edgeThreshold > 0 && minDistToEdge <= edgeThreshold) {
    //   // Linear interpolation: closest to edge = edgeMin, fades up to baseSpacing
    //   return edgeMin + (baseSpacing - edgeMin) * (minDistToEdge / edgeThreshold);
    // } else {
    //   return baseSpacing;
    // }
  };
}

function computeVertexColors(allPoints, polygon, holes, blendDist = 2) {
  const vertexColors = []; // Flat array: [r,g,b,a, r,g,b,a, ...] or however you need

  // const blendDist = 10; // Or your chosen X value
  for (let i = 0; i < allPoints.length; i++) {
    const [x, z] = allPoints[i];
    // for (let i = 0; i < allPoints.length; i += 2) {
    //   const x = allPoints[i];
    //   const z = allPoints[i + 1];
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

function generateMesh({
  layer,
  settings
  // heightMap,
  // settings: { svgSize, terrainSize, heightScale }
}) {
  if (layer.error) {
    return;
  }
  // console.time('diskSample');
  const boundaryPts = layer.polygon;
  const holePts = layer.holes?.flat() || [];
  // const { pts, triangles } = triangulateWithConstraints(layer.polygon, layer.holes || [], spacing);
  const { width, height, minY, minX } = getBoundingBox([layer.polygon, ...layer.holes]);

  let opts = {
    minDistance: layer.spacing
  };
  if (layer.spacingEdge > 0) {
    opts = {
      minDistance: layer.spacingEdge,
      maxDistance: layer.spacing,
      distanceFunction: adaptiveMinDistanceFactory(layer, minX, minY),
    }
  }
  // Sample points with Poisson-disk
  const pds = new PoissonDiskSampling({
    // shape: [width, height], // use polygon bbox
    shape: [width, height], // use polygon bbox
    tries: 30,
    ...opts
    // minDistance: layer.spacingEdge || 0.5,   // controls "edge length" of triangles
    // maxDistance: layer.spacing || 2,   // controls "edge length" of triangles
    // // distanceFunction: ([x, y]) => {
    // //   // const distToOuter = distanceToPolygonEdge([x, y], layer.polygon);
    // //   log.debug('distToOuter', x, y);
    // //   return 1;
    // //   // return layer.spacing;
    // // },
    // distanceFunction: adaptiveMinDistanceFactory(layer, minX, minY),
    // // minDistance: ({ x, y }) => adaptiveMinDistance(layer, [x + minX, y + minY]),
    // // minDistance: ({ x, y }) => getAdaptiveMinDistance([x + minX, y + minY], layer.polygon, layer.holes, layer.spacing),

  });

  // Optionally seed with boundary/holes points to preserve contour
  layer.polygon.forEach(point => pds.addPoint([point[0] - minX, point[1] - minY]));
  // layer.holes.forEach(h => h.forEach(p => pds.addPoint([p[0] - minX, p[1] - minY])));

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
  // const allPoints = [...boundaryPts, ...holePts, ...interiorSamples];

  // // Delaunay triangulation
  const delaunay = Delaunay.from(allPoints);
  // const triangles = Array.from(delaunay.triangles); // grouped as [i0, i1, i2,...]

  // console.log('allPoints', allPoints);
  // const delaunay = new Delaunator([...boundaryPts, ...holePts].flat());
  const triangles = Array.from(delaunay.triangles);
  // console.log('boundaryPts', JSON.stringify(boundaryPts.slice(0, 6)));
  // console.log('allPoints', JSON.stringify(allPoints.slice(0, 6)));
  // console.log('holePts', JSON.stringify(holePts.slice(0, 6)));
  // let triangles = cdt2d(allPoints, layer.holes, { exterior: false });
  // console.log('triangles', triangles.slice(0, 6));

  // Filter triangles that fall outside of polygon
  const finalTriangles = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];

    if (a === b || b === c || a === c) continue;
    if (triangleArea2D(allPoints[a], allPoints[b], allPoints[c]) < EPSILON) continue;

    const centroid = triCentroid(allPoints[a], allPoints[b], allPoints[c]);
    if (isPointInPolygon(centroid, layer.polygon, layer.holes)) {
      finalTriangles.push(a, b, c); // Use flat output!qss
    }
  }


  // const positions = [];
  // // const heightMap = getTerrain();
  // if (!heightMap) {
  //   log.warn('No heightmap data');
  // }

  // for (const [x, z] of allPoints) {
  //   let y = 0;

  //   if (heightMap) {
  //     const [tx, tz] = svgToTerrain(x, z, svgSize[0], terrainSize);
  //     // Get/interpolate terrain height
  //     y = interpHeight(heightMap, tx, tz, terrainSize);

  //     // If Unity height range is [0, 65535], you might want to scale to meters
  //     // For example, if your terrain in Unity is 600m tall, scale = 600/65535
  //     // If not, just use the raw value.

  //     // Example: scale height (adjust as needed)
  //     y = (y / 65535) * heightScale;
  //   }
  //   positions.push(x, y, z);
  // }

  // if (layer.dig?.depth) {
  //   digMesh(positions, layer.polygon, layer.holes, layer.dig.depth, layer.dig.curve, layer.dig.curvePower);
  // }

  // generate flat 3D array of points
  const positions3D = [];
  // for (let i = 0; i < allPoints.length; i += 2) {
  //   const x = allPoints[i];
  //   const z = allPoints[i + 1];
  for (const [x, z] of allPoints) {
    positions3D.push(x, 0, z);
  }

  // fill with white color
  let colors = new Array(allPoints.length * 3).fill(1);
  if (layer.blend && layer.blend > 0) {
    colors = computeVertexColors(allPoints, layer.polygon, layer.holes, layer.blend);
  }

  return {
    triangles: finalTriangles,
    points: new Float32Array(positions3D),
    // points: allPoints,
    colors: new Float32Array(colors)
  };
}


function conformTerrain({
  layer,
  heightMap,
  settings
}) {
  const {
    // heightMap,
    heightScale,
    svgSize,
    terrainSize
  } = settings;
  if (!(svgSize?.[0] > 0)) {
    throw new Error('SVG size is invalid');
  }

  const positions = [];
  if (!heightMap) {
    log.warn('No heightmap data');
  }
  if (!terrainSize) {
    throw new Error('Terrain Size is invalid');
  }
  const mesh = layer.mesh;
  for (let index = 0; index < mesh.points.length; index += 3) {
    // for (const [x, z] of points) {
    // let y = 0;
    const x = mesh.points[index];
    let y = mesh.points[index + 1];
    const z = mesh.points[index + 2];

    if (heightMap) {
      const [tx, tz] = svgToTerrain(x, z, svgSize[0], terrainSize);
      // Get/interpolate terrain height
      y = interpHeight(heightMap, tx, tz, terrainSize);

      // If Unity height range is [0, 65535], you might want to scale to meters
      // For example, if your terrain in Unity is 600m tall, scale = 600/65535
      // If not, just use the raw value.

      // Example: scale height (adjust as needed)
      y = (y / 65535) * heightScale;
    }
    positions.push(x, y, z);
  }

  // if (layer.dig?.depth) {
  //   digMesh(positions, layer.polygon, layer.holes, layer.dig.depth, layer.dig.curve, layer.dig.curvePower);
  // }


  return {
    ...mesh,
    points: new Float32Array(positions)
  }
}

function smoothTerrain({ heightMap, settings }) {
  const { terrainSize, terrainSmoothingRadius } = settings;
  return smoothTerrainData(heightMap, terrainSize, terrainSmoothingRadius);
}

self.onerror = function (event) {
  log.error('worker-error:', event);
  true;
}

self.onmessage = (event) => {
  if (!event.data) {
    return;
  }
  const { jobId, type } = event.data;
  try {
    if (type === 'mesh') {
      log.info(`Starting mesh worker job: ${jobId}`);
      const result = generateMesh(event.data);
      log.info(`Finished mesh worker job: ${jobId}`);
      postMessage({ jobId, mesh: result });
    } else if (type === 'conform') {
      log.info(`Starting conform worker job: ${jobId}`);
      const result = conformTerrain(event.data);
      log.info(`Finished conform worker job: ${jobId}`);
      postMessage({ jobId, mesh: result });
    } else if (type === 'terrain') {
      log.info(`Starting terrain worker job`);
      const result = smoothTerrain(event.data);
      log.info(`Finished terrain worker job`);
      postMessage({ jobId, type: 'terrain', heightMap: result });
    } else if (type === 'svg') {
      log.info(`Starting svg worker job`);
      const result = parseSVG(event.data);
      postMessage({ jobId, type: 'svg', ...result });
      log.info(`Finished svg worker job`);
      // parseSVG(event.data).then(result => {
      //   log.info(`Finished svg worker job`);
      //   postMessage({ jobId, type: 'svg', ...result });
      // }).catch(error => {
      //   throw error;
      // });
    }
  } catch (error) {
    log.error('ERROR', error);
    postMessage({ jobId, type: 'error', error: error.message, ...event.data });
  }
};