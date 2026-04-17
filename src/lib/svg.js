// import fs from 'node:fs';
import * as cheerio from 'cheerio';
import * as martinez from 'martinez-polygon-clipping';
import polygonClipping from 'polygon-clipping';
import log from 'electron-log';
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
import { getColor, parsePalette } from './colors';
import { openProject } from './project';

// const earcut = require('earcut');

const COLOR_MATCH = /fill:\s*#([a-z0-9]+)/i;

// maps OSM shapes to OpenGolfSim surfaces
const SURFACE_MAP = {
  green: 'green',
  fairway: 'fairway',
  tee: 'tee',
  bunker: 'sand',
  rough: 'rough',
  water_hazard: 'water',
};

export function generateSVG() {
  let svgPaths = '';
  const distance = Math.round(openProject.settings.distance * 1000);
  if (openProject.coursePaths && openProject.settings?.bounds) {
    svgPaths = storedPathsToSVG(openProject.coursePaths);
  }

  const trimLength = openProject._workingDir.length + 1;

  const images = [
    openProject.hillShade?.filePath && 
      `<image width="${distance}" height="${distance}" id="HillShade" preserveAspectRatio="none" xlink:href="${openProject.hillShade.filePath.slice(trimLength)}" style="display:inline" />`,

    ...openProject.satellite && Object.values(openProject.satellite).map(satellite => {
      return `<image width="${distance}" height="${distance}" id="Satellite-${satellite.source}" preserveAspectRatio="none" xlink:href="${satellite.filePath.slice(trimLength)}" style="display:inline" />`;
    })

  ].filter(Boolean).join('\n ');

  const svgProps = [
  //  'inkscape:version="1.3 (0e150ed, 2023-07-21)"',
   'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"',
   'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"',
   'xmlns:xlink="http://www.w3.org/1999/xlink"',
   'xmlns="http://www.w3.org/2000/svg"',
   'xmlns:svg="http://www.w3.org/2000/svg"',
  ].join(' ');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<svg ${svgProps} width="${distance}mm" height="${distance}mm" viewBox="0 0 ${distance} ${distance}">`,
    
    '<g id="overlays" inkscape:groupmode="layer">',
      images,
    '</g>',  
  
    '<g id="course" inkscape:groupmode="layer">',
      svgPaths,
    '</g>',

    '</svg>'
  ].filter(Boolean).join('\n');
}

// Signed area via the shoelace formula; we only care about magnitude here.
// const ringArea = (pts) => {
//   let a = 0;
//   for (let i = 0, n = pts.length; i < n; i++) {
//     const [x1, y1] = pts[i];
//     const [x2, y2] = pts[(i + 1) % n];
//     a += x1 * y2 - x2 * y1;
//   }
//   return Math.abs(a) / 2;
// };

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

export function storedPathsToSVG(paths) {
  return paths
    .map((p, idx) => `<path id="${p.surface}-${idx}" d="${p.d}" style="fill:#${p.color ?? '115B13'}" />`)
    .join('\n  ');
}

export function geoJSONToSvgPaths(geojson) {
  const size = Math.round(openProject.settings.distance * 1000);
  const { south: minLat, west: minLon, north: maxLat, east: maxLon } = openProject.settings.bounds;
  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;

  // Linear projection across the bbox. Because you've chosen the bbox to be
  // a square in real-world meters, lonRange != latRange (lon degrees are
  // shorter at lat ~40.5), and stretching each axis independently to `size`
  // gives you the correct equirectangular result for a small area.
  const project = ([lon, lat]) => [
    ((lon - minLon) / lonRange) * size,
    ((maxLat - lat) / latRange) * size,   // flip Y: SVG y grows downward
  ];

  // const ringToPath = (ring) => {
  //   const pts = ring.map(project);
  //   const [x0, y0] = pts[0];
  //   const rest = pts.slice(1)
  //     .map(([x, y]) => `L${x.toFixed(2)} ${y.toFixed(2)}`)
  //     .join(' ');
  //   return `M${x0.toFixed(2)} ${y0.toFixed(2)} ${rest} Z`;
  // };
  const mid = ([x1, y1], [x2, y2]) => [(x1 + x2) / 2, (y1 + y2) / 2];
  const fmt = n => n.toFixed(2);

  // Closed ring -> smoothed path
  const ringToPath = (ring) => {
    const pts = ring.map(project);
    // OSM rings are usually closed (last point == first); drop the duplicate
    // so "next" wraps cleanly.
    if (pts.length > 1 &&
        pts[0][0] === pts[pts.length - 1][0] &&
        pts[0][1] === pts[pts.length - 1][1]) {
      pts.pop();
    }
    if (pts.length < 3) return ringToPathStraight(pts, true);

    const n = pts.length;
    // Start at the midpoint of the edge between the last and first vertex.
    const start = mid(pts[n - 1], pts[0]);
    let d = `M${fmt(start[0])} ${fmt(start[1])}`;

    for (let i = 0; i < n; i++) {
      const ctrl = pts[i];                    // original vertex = control point
      const end  = mid(pts[i], pts[(i + 1) % n]); // midpoint to next vertex
      d += ` Q${fmt(ctrl[0])} ${fmt(ctrl[1])} ${fmt(end[0])} ${fmt(end[1])}`;
    }
    d += ' Z';
    return d;
  };

  // Open line -> smoothed path (keeps the true first/last endpoints sharp)
  const lineToPath = (pts) => {
    if (pts.length < 3) return ringToPathStraight(pts, false);

    let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
    // Line from the first point to the midpoint of edge 0-1, then quadratics
    // through every interior vertex, then a final line into the last point.
    const firstMid = mid(pts[0], pts[1]);
    d += ` L${fmt(firstMid[0])} ${fmt(firstMid[1])}`;

    for (let i = 1; i < pts.length - 1; i++) {
      const ctrl = pts[i];
      const end  = mid(pts[i], pts[i + 1]);
      d += ` Q${fmt(ctrl[0])} ${fmt(ctrl[1])} ${fmt(end[0])} ${fmt(end[1])}`;
    }
    const last = pts[pts.length - 1];
    d += ` L${fmt(last[0])} ${fmt(last[1])}`;
    return d;
  };

  // Fallback for degenerate cases (fewer than 3 points)
  const ringToPathStraight = (pts, close) => {
    if (!pts.length) return '';
    const [x0, y0] = pts[0];
    const rest = pts.slice(1).map(([x, y]) => `L${fmt(x)} ${fmt(y)}`).join(' ');
    return `M${fmt(x0)} ${fmt(y0)} ${rest}${close ? ' Z' : ''}`;
  };  

  const paths = [];

  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    const golf = f.properties?.golf;
    if (!golf) continue;
    const surface = SURFACE_MAP?.[golf] ?? {};
    const color = getColor(surface);

    if (g.type === 'Polygon') {
      // coordinates[0] is the outer ring; coordinates[1..] are holes — skip them
      const ring = g.coordinates[0].map(project);
      paths.push({ golf, d: ringToPath(g.coordinates[0]), surface, color, area: ringArea(ring) });

    } else if (g.type === 'MultiPolygon') {
      // Each member polygon's [0] is its outer ring; ignore inner rings
      for (const poly of g.coordinates) {
        const ring = poly[0].map(project);
        paths.push({ golf, d: ringToPath(poly[0]), surface, color, area: ringArea(ring) });
      }

    } else if (g.type === 'LineString') {
      const pts = g.coordinates.map(project);
      paths.push({ golf, d: lineToPath(pts), surface, color, area: 0 });
      // e.g. a tee mapped as a way without area=yes
      // const pts = g.coordinates.map(project);
      // const d = 'M' + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L');
      // paths.push({ golf, d });
    }
  }

  // largest objects first
  paths.sort((a, b) => b.area - a.area);

  return paths;
}

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


function parseTreeLayers($, treeLayer, palette) {

  // Get all <path> in the layer
  return treeLayer.find('path').map((i, el) => {
    const name = $(el).attr('id');
    const style = $(el).attr('style').toLowerCase() || '';

    const matched = style && style.match(COLOR_MATCH);
    if (!matched) {
      throw new Error(`Unable to match layer (${name}) to a valid surface!`);
    }
    const [, hexColor] = matched;
    const surface = matched ? palette?.[hexColor] : null;
    if (!surface) {
      throw new Error(`Unable to match layer color (${name}, ${hexColor}) to a valid surface!`);
    }

    return {
      name,
      surface,
      hexColor,
    };
  }).get();
}

function parseCourseLayers($, courseLayer, palette) {
  // Get all <path> in the layer
  return courseLayer.find('path').map((i, el) => {
    const data = $(el).attr('d');
    const name = $(el).attr('id');
    const style = $(el).attr('style')?.toLowerCase();

    const matched = style.match(COLOR_MATCH);
    if (!matched) {
      throw new Error(`Unable to match layer (${name}) to a valid surface!`);
    }
    const [, hexColor] = matched;
    const surface = matched ? palette?.[hexColor] : null;
    if (!surface) {
      throw new Error(`Unable to match layer color (${name}, ${hexColor}) to a valid surface!`);
    }

    // let settings = { ...defaultSettings.rough };
    // if (defaultSettings?.[surface]) {
    //   settings = defaultSettings?.[surface];
    // }

    const layer = {
      id: `${surface}_${i}`,
      name,
      visible: true,
      surface,
      color: hexColor,
      data
      // ...settings
    };

    let finalMatrix = fromObject({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

    try {
      const transformString = $(el).attr('transform');
      // Default: Identity matrix (no transform)
      // log.info(`Parsing layer ${i} (${name})`, JSON.stringify(transformString));

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
}


// export function parseSVG(payload) {
export async function parseSVG(svgData, palette = null) {
  // const { svgData, settings: { palette } } = payload;
  if (!palette) {
    palette = await parsePalette();
  }

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

  const courseLayer = $('g#course');
  if (!courseLayer.get(0)) {
    throw new Error('Unable to find layer with ID of course');
  }
  let courseLayers = parseCourseLayers($, courseLayer, palette);

  const treeLayer = $('g#trees');
  let treeLayers = [];
  if (treeLayer.get(0)) {
    treeLayers = parseTreeLayers($, treeLayer, palette);
  }

  if (!courseLayers?.length) {
    throw new Error('No course shapes found in course layer');
  }

  courseLayers.unshift({
    id: 'base',
    name: 'base',
    visible: true,
    surface: 'base',
    color: 'CCCCCC',
    data: `M 0,0 H ${width} V ${height} H 0 Z`
  });

  return {
    treeLayers,
    palette,
    width,
    height,
    layers: courseLayers
  };
}