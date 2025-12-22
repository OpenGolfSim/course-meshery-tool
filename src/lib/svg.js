// import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { svgPathProperties } from 'svg-path-properties';
import * as martinez from 'martinez-polygon-clipping';
import polygonClipping from 'polygon-clipping';
import log from 'electron-log/renderer';
import { parse as parseTransform } from 'svg-transform-parser';
import {
  compose,
  fromObject,
  translate as tmTranslate,
  scale as tmScale,
  rotateDEG as tmRotate, // for rotate in degrees
  skewDEG as tmSkew,
  fromDefinition,
  applyToPoint,
  matrix as tmMatrix
} from 'transformation-matrix';

import { defaultSettings } from './settings';

// const earcut = require('earcut');

const COLOR_MATCH = /fill:\s*#([a-z0-9]+)/i;


function toMatrix(t) {
  if (t.translate) {
    return tmTranslate(t.translate.tx, t.translate.ty || 0);
  }
  if (t.scale) {
    return tmScale(t.scale.sx, t.scale.sy !== undefined ? t.scale.sy : t.scale.sx);
  }
  if (t.rotate) {
    // Center point (cx, cy) may be specified
    if (t.rotate.cx != null && t.rotate.cy != null) {
      // Translate to origin -> rotate -> translate back
      return compose(
        tmTranslate(t.rotate.cx, t.rotate.cy),
        tmRotate(t.rotate.angle),
        tmTranslate(-t.rotate.cx, -t.rotate.cy)
      );
    }
    return tmRotate(t.rotate.angle); // about origin
  }
  if (t.skewX) {
    return tmSkew(t.skewX.angle, 0);
  }
  if (t.skewY) {
    return tmSkew(0, t.skewY.angle);
  }
  if (t.matrix) {
    // SVG matrix(a, b, c, d, e, f)
    return tmMatrix(t.matrix.a, t.matrix.b, t.matrix.c, t.matrix.d, t.matrix.e, t.matrix.f);
  }
  throw new Error("Unknown transform: " + JSON.stringify(t));
}

function snapRingToGrid(ring, gridSize = 1e-3) {
  return ring.map(([x, y]) => [
    Math.round(x / gridSize) * gridSize,
    Math.round(y / gridSize) * gridSize
  ]);
}
function forceClosedRing(points) {
  if (!points?.length) return [];
  points = snapRingToGrid(points);
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  // Use fixed decimal for float compare
  if (Number(x0).toFixed(5) !== Number(xn).toFixed(5) ||
    Number(y0).toFixed(5) !== Number(yn).toFixed(5)) {
    return [...points, [x0, y0]];
  }
  return points;
}

function closeAllRings(multiPoly) {
  if (!Array.isArray(multiPoly)) return [];
  return multiPoly.map(forceClosedRing);
}
function ringArea(ring) {
  // Shoelace formula, for absolute area comparison
  let area = 0;
  for (let i = 0, n = ring?.length; i < n - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    area += (x0 * y1 - x1 * y0);
  }
  return Math.abs(area / 2);
}

function ensureClosed(points, tolerance = 1e-6) {
  if (!points?.length) return points;
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  if (Math.abs(x0 - xn) > tolerance || Math.abs(y0 - yn) > tolerance)
    return [...points, [x0, y0]];
  return points;
}

function cutHolesFromPolygon(polygon, polygonsToCut) {
  let base;
  try {
    base = [ensureClosed(polygon)];
  } catch (error) {
    console.error("ENSURE ERRROR");
    throw error;
  }
  for (const clip of polygonsToCut) {
    base = martinez.diff(base, [ensureClosed(clip)]) || [];
  }
  // Result may be: null | [ [exterior], ...holes ] | [ [ [exterior], ...holes ], ... ]
  if (!base) return { polygon: [], holes: [] };
  // If result is MultiPolygon, pick the largest by area (or accumulate all? your call)
  if (base?.length && Array.isArray(base[0][0])) {
    // MultiPolygon: find largest
    let biggest = base[0];
    let maxA = ringArea(base[0][0]);
    for (const poly of base) {
      const a = ringArea(poly[0]);
      if (a > maxA) {
        biggest = poly;
        maxA = a;
      }
    }
    return {
      polygon: biggest[0],
      holes: biggest.slice(1)
    };
  }
  // Single polygon with holes
  return {
    polygon: base[0],
    holes: base.slice(1)
  };
}

function hasDuplicatePoints(points, tolerance = 1) {
  const n = points.length - 1; // last points are the same

  // Compare each point with every other point
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[j];

      // Calculate the Euclidean distance
      const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (distance <= tolerance) {
        return `[${Math.round(x1)},${Math.round(y1)}],[${Math.round(x2)},${Math.round(y2)}]`;
      }
    }
  }

  return false; // No duplicates were found
}

// Ensure the ring is closed! (first and last points are the same)
function isClosedRing(points, tolerance = 1) {
  if (points.length < 2) {
    return false; // A path with fewer than 2 points cannot be closed
  }

  // Get the first and last point
  const [startX, startY] = points[0];
  const [endX, endY] = points[points.length - 1];

  // Calculate the Euclidean distance
  const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
  // Check if the distance is within the specified tolerance
  return distance <= tolerance;
}

function closeRing(points) {
  if (
    points.length === 0 ||
    (points[0][0] === points[points.length - 1][0] &&
      points[0][2] === points[points.length - 1][2])
  ) {
    return points;
  }
  return points.concat([points[0]]);
}

export function parseSVG(payload) {
  const { svgData, settings: { palette } } = payload;
  // const palette = await parsePalette();

  // const stats = await fs.promises.stat(svgPath);
  // if (stats.size > MAX_FILESIZE) {
  //   throw new Error(`SVG file should not be larger than 1MB. Make sure you link any image layers rather than embedding them.`);
  // }

  // const svg = await fs.promises.readFile(svgPath, 'utf-8');
  const $ = cheerio.load(svgData, { xmlMode: true });

  // Find a layer by id
  const root = $('svg');
  const viewBox = root.attr('viewBox');
  // const widthRaw = root.attr('width');
  // const heightRaw = root.attr('height');

  if (!viewBox) {
    throw new Error('Unable to parse viewBox of SVG file');
  }
  const [xpos, ypos, width, height] = viewBox.split(' ').map(v => parseInt(v, 10));
  if (!width || !height) {
    throw new Error('Unable to parse dimensions of SVG file');
  }

  const layer = $('g#course');
  if (!layer.get(0)) {
    throw new Error('Unable to find layer with ID of course');
  }

  // Get all <path> in the layer
  let layers = layer.find('path').map((i, el) => {
    const data = $(el).attr('d');
    const name = $(el).attr('id');
    const style = $(el).attr('style').toLowerCase();
    log.info(`Parsing layer ${name}`, style);

    const matched = style.match(COLOR_MATCH);
    if (!matched) {
      throw new Error(`Unable to match layer (${name}) to a valid surface!`);
    }
    const [, hexColor] = matched;
    const surface = matched ? palette?.[hexColor] : null;
    if (!surface) {
      throw new Error(`Unable to match layer color (${name}, ${hexColor}) to a valid surface!`);
    }

    let settings = { ...defaultSettings.rough };
    if (defaultSettings?.[surface]) {
      settings = defaultSettings?.[surface];
    }

    const layer = {
      id: `${surface}_${i}`,
      name,
      visible: true,
      surface,
      color: hexColor,
      data,
      ...settings
    };

    let finalMatrix = fromObject({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

    try {
      const transformString = $(el).attr('transform');
      // Default: Identity matrix (no transform)
      log.info(`Parsing layer ${i} (${name})`, JSON.stringify(transformString));

      if (transformString) {
        // Parse into a list of transforms
        const transforms = parseTransform(transformString);
        if (transforms) {
          const matrices = Array.isArray(transforms) ? transforms.map(toMatrix) : [toMatrix(transforms)];
          if (matrices?.length > 0) {
            finalMatrix = compose(...matrices);
          }
        }
      }
      return {
        matrix: finalMatrix,
        ...layer
      }
    } catch (error) {
      log.error(`SVG transform error (${name})`, error);
      throw new Error(`SVG transform error (layer: ${name})`)
    }
  }).get();


  layers = layers.map((layer) => {
    const properties = new svgPathProperties(layer.data);
    const length = properties.getTotalLength();
    // at least 100 points
    // then based on line length (every 2 units)
    const minPoints = 500;
    const maxPoints = 12000;
    const numPoints = Math.min(Math.max(Math.round(length) * 2, minPoints), maxPoints);
    let polygon = [];
    // log.info(`Parsing layer ${i} points: ${numPoints}`);
    for (let i = 0; i <= numPoints; i++) {
      const length = properties.getTotalLength();
      const pct = i / numPoints;
      const pos = properties.getPointAtLength(length * pct);
      if (layer.matrix) {
        const transformed = applyToPoint(layer.matrix, { x: pos.x, y: pos.y });
        polygon.push([transformed.x, transformed.y]);
      } else {
        polygon.push([pos.x, pos.y]);
      }
    }
    // log.info(`Parsing layer ${name}`);
    if (!isClosedRing(polygon, 0.1)) {
      log.error('Unclosed path error', polygon);
      throw new Error(`Detected an unclosed path (${name})`);
    }
    // const duplicatePoints = hasDuplicatePoints(polygon);
    // if (duplicatePoints) {
    //   throw new Error(`Detected duplicate points in the same spot (${name}, ${duplicatePoints})`);
    // }
    // polygon = closeRing(polygon);


    return {
      ...layer,
      // ...settings,
      // data,
      // edge,
      // spacing,
      // dig,
      // blend
      polygon,
      holes: [],
    }
  })

  if (!layers?.length) {
    throw new Error('No valid paths found in course layer');
  }
  // const layersToCut = layers[0].polygon.map(points => [points[0], points[2]]);
  // const layersToCut = layers.map(layer => layer.polygon);

  // cut holes from above layers
  // layers = layers.map((layer, index) => {
  //   // const layersAbove = layers.slice(index + 1).map(l => l.polygon);
  //   const layersAbove = (layers.slice(index + 1) || []);
  //   // console.log('layersAbove', layersAbove);
  //   if (!layersAbove.length) {
  //     return { ...layer, holes: [] };
  //   }
  //   const { polygon, holes } = cutHolesFromPolygon(layer.polygon, layersAbove.map(l => l.polygon));
  //   console.log(`${layer.id} polygon: ${polygon.length}, holes: ${holes.length}`);
  //   return {
  //     ...layer,
  //     polygon,
  //     holes
  //   };
  // });

  layers = layers.map((layer, index) => {
    try {
      const layersAbove = (layers.slice(index + 1) || []);
      const layersToCut = layersAbove.map(layer => [layer.polygon]);
      let polygon = [...layer.polygon];
      let holes = [];
      if (layersToCut?.length > 0) {
        for (const cl of layersToCut) {
          const result = polygonClipping.difference([layer.polygon], [cl]);
          const rings = result[0];
          polygon = rings[0];
          holes = [...holes, ...rings.slice(1)];
          // log.debug('polygon', polygon);
          // log.debug('holes', holes);

          // const m_result = martinez.diff([[layer.polygon]], [[cl]]);
          // console.log('m_result', result);
          // // polygon = result?.[0]?.[0]; // .map(points => [points[0], points[1]]);
          // // holes = [...holes, ...result?.[0]?.slice(1)];
          // const rings = result[0]; // exterior and possible holes
          // // const closedRings = closeAllRings(rings);
          // polygon = rings[0];
          // holes = [...holes, ...rings.slice(1)];
        }
      }
      return {
        ...layer,
        polygon,
        holes
      }
    } catch (error) {
      log.error('Cut error', error);
      // throw new Error(`Error cutting shape: ${layer.name}`);
      return {
        ...layer,
        error: 'Cut Error: Unable to cut holes in shape'
      }
    }
  });

  return {
    palette,
    width,
    height,
    layers
  };
}