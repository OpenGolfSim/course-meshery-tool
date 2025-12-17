const fs = require('node:fs');
const cheerio = require('cheerio');
const { svgPathProperties } = require('svg-path-properties');
const martinez = require('martinez-polygon-clipping');

// const earcut = require('earcut');

const COLOR_MATCH = /fill:\s*#([a-z0-9]+)/i;

// Ensure the ring is closed! (first and last points are the same)
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

  const layer = $('g#course');
  if (!layer) {
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
      const numPoints = Math.max(Math.round(length) * 1.5, 100);
      let polygon = [];
      for (let i = 0; i <= numPoints; i++) {
        const length = properties.getTotalLength();
        const pct = i / numPoints;
        const pos = properties.getPointAtLength(length * pct);
        polygon.push([pos.x, pos.y]);
      }
      polygon = closeRing(polygon);

      const style = $(el).attr('style').toLowerCase();
      const [, hexColor] = style.match(COLOR_MATCH);
      const surface = palette?.[hexColor];

      // console.log(`surface: ${surface}, length: ${length}, numPoints: ${numPoints}`);

      let spacing = 4;
      let blend = 1;
      if (['fringe', 'first_cut'].includes(surface)) {
        spacing = 0.3;
        blend = 0.5;
      } else if (['green', 'sand'].includes(surface)) {
        spacing = 0.5;
        blend = 0.5;
      } else if (['fairway', 'tee', 'water'].includes(surface)) {
        spacing = 1;
        blend = 1;
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
        color: hexColor,
        surface,
        spacing,
        dig,
        polygon,
        blend
      }
    }
  ).get();

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