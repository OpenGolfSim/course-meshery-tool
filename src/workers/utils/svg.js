
import logger from 'electron-log/renderer';
import { svgPathProperties } from 'svg-path-properties';
import polygonClipping from 'polygon-clipping';
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
import { defaultSettings } from '../../lib/settings';

const log = logger.scope('SVG_WORKER');


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

export function generateCoursePolygons(courseLayers, layerSettings) {
  log.info('generateCoursePolygons', data);
  // const { layers: courseLayers, layerSettings } = data;
  let layers = courseLayers.map((layer) => {
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
      throw new Error(`Detected an unclosed path (${layer.name})`);
    }
    // const duplicatePoints = hasDuplicatePoints(polygon);
    // if (duplicatePoints) {
    //   throw new Error(`Detected duplicate points in the same spot (${name}, ${duplicatePoints})`);
    // }
    // polygon = closeRing(polygon);

    let settings = {
      ...defaultSettings?.[layer.surface] ? defaultSettings?.[layer.surface] : defaultSettings.base
    };

    if (layerSettings?.[layer.surface]) {
      settings = layerSettings?.[layer.surface];
    }
    return {
      ...layer,
      ...settings,
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
    log.error('No valid paths found in course layer');
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

  // add water planes after cutting

  for (const layer of layers) {
    if (layer.surface === 'water') {
      layers.push({
        ...layerSettings && layerSettings?.lake_surface,
        id: `lake_surface_${layer.id}`,
        name: `lake_surface_${layer.id}`,
        hidden: true,
        surface: 'lake_surface',
        color: '0088AA',
        data: layer.data,
        polygon: layer.polygon,
        holes: layer.holes
      });
    }
  }

  return {
    layers
  }
}
