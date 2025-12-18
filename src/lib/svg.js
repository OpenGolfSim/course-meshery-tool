const fs = require('node:fs');
const cheerio = require('cheerio');
const { svgPathProperties } = require('svg-path-properties');
const martinez = require('martinez-polygon-clipping');

// const earcut = require('earcut');

const COLOR_MATCH = /fill:\s*#([a-z0-9]+)/i;
const MAX_FILESIZE = 1e6; // Anything over 1 MB probably has images in it


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

export async function parseSVG(svgPath, palette) {

  const stats = await fs.promises.stat(svgPath);
  if (stats.size > MAX_FILESIZE) {
    throw new Error(`SVG file should not be larger than 1MB. Make sure you link any image layers rather than embedding them.`);
  }

  const svg = await fs.promises.readFile(svgPath, 'utf-8');
  const $ = cheerio.load(svg, { xmlMode: true });

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
  let layers = layer.find('path').map(
    (i, el) => {

      const data = $(el).attr('d');
      const properties = new svgPathProperties(data);

      const length = properties.getTotalLength();
      // at least 100 points
      // then based on line length (every 2 units)
      const minPoints = 500;
      const maxPoints = 15000;
      const numPoints = Math.min(Math.max(Math.round(length) * 2, minPoints), maxPoints);
      let polygon = [];
      for (let i = 0; i <= numPoints; i++) {
        const length = properties.getTotalLength();
        const pct = i / numPoints;
        const pos = properties.getPointAtLength(length * pct);
        polygon.push([pos.x, pos.y]);
      }
      const name = $(el).attr('id');
      if (!isClosedRing(polygon)) {
        throw new Error(`Detected an unclosed path (${name})`);
      }
      // const duplicatePoints = hasDuplicatePoints(polygon);
      // if (duplicatePoints) {
      //   throw new Error(`Detected duplicate points in the same spot (${name}, ${duplicatePoints})`);
      // }
      // polygon = closeRing(polygon);

      const style = $(el).attr('style').toLowerCase();
      const [, hexColor] = style.match(COLOR_MATCH);
      const surface = palette?.[hexColor];

      // console.log(`surface: ${surface}, length: ${length}, numPoints: ${numPoints}`);

      let spacing = 3;
      let blend = 0;

      const edge = {
        edgeBlend: 0,
        // Lower means denser near edges (minimum allowed sample distance)
        edgeDensity: 2,
        // How far from edge to add extra points (same units as your blendDist)
        threshold: 10
      }
      if (['fringe', 'first_cut'].includes(surface)) {
        spacing = 0.4;
        blend = 0.5;
      } else if (['green', 'sand'].includes(surface)) {
        spacing = 0.5;
        blend = 0.5;
        edge.edgeBlend = 0.5;
        edge.edgeDensity = 0.25;
        edge.threshold = 1;
      } else if (['fairway', 'tee', 'water'].includes(surface)) {
        spacing = 1;
        blend = 1;
        edge.edgeBlend = 0.5;
        edge.edgeDensity = 0.5;
        edge.threshold = 4;
      }

      // default dig settings
      let dig = null;
      if (surface === 'sand') {
        dig = { depth: 1.25, curve: 'pow', curvePower: 3 };
      } else if (surface === 'water') {
        dig = { depth: 4, curve: 'sine' };
      }
      return {
        id: `${surface}_${i}`,
        data,
        edge,
        color: hexColor,
        surface,
        spacing,
        dig,
        polygon,
        blend
      }
    }
  ).get();

  if (!layers.length) {
    throw new Error('No valid paths found in course layer');
  }
  // const layersToCut = layers[0].polygon.map(points => [points[0], points[2]]);
  const layersToCut = layers.map(layer => layer.polygon);

  // cut holes from above layers
  layers = layers.map((layer, index) => {
    const layersAbove = (layersToCut.slice(index + 1) || []);
    // const points = layer.polygon; // .map(points => [points[0], points[1]]);
    let polygon = [...layer.polygon];
    let holes = [];
    if (layersAbove.length > 0) {
      for (const cl of layersAbove) {
        // console.log('points:', JSON.stringify([[points.slice(0, 3)]]));
        // console.log('cl:', JSON.stringify([[cl.slice(0, 3)]]));
        const result = martinez.diff([[layer.polygon]], [[cl]]);
        // console.log('result', result?.[0]?.[0]);
        polygon = result?.[0]?.[0]; // .map(points => [points[0], points[1]]);
        holes = [...holes, ...result?.[0]?.slice(1)];
      }
    }
    // console.log('polygon', polygon);
    return {
      ...layer,
      polygon,
      holes
    }
  });

  return {
    width,
    height,
    layers
  };
}