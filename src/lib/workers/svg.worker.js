import { expose } from 'threads/worker';
import { Observable, Subject } from 'threads/observable';
import logger from 'electron-log';
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

const progressSubject = new Subject();

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
  let layers = [];
  const polygonMap = new Map();
  // convert outer rings to polygons
  let current = 0;

  courseLayers.forEach(layer => {
  // let layers = courseLayers.map((layer) => {
    const properties = new svgPathProperties(layer.data);
    const length = properties.getTotalLength();
    // at least 100 points
    // then based on line length (every 2 units)
    const minPoints = 500;
    const maxPoints = 10000;
    const numPoints = Math.min(Math.max(Math.round(length), minPoints), maxPoints);
    let polygon = [];

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

    let settings = {
      ...defaultSettings?.[layer.surface] ? defaultSettings?.[layer.surface] : defaultSettings.base
    };

    if (layerSettings?.[layer.surface]) {
      settings = layerSettings?.[layer.surface];
    }

    // layers.push({ ...layer, ...settings });
    // polygons.push({ id: layer.id, ...settings, polygon, holes: [] });
    polygonMap.set(layer.id, { polygon, holes: [] });
    layers.push({
      ...layer,
      ...settings,
      // polygon,
      // holes: [],
    });

    progressSubject.next({
      current,
      total: courseLayers.length,
      progress: (current / courseLayers.length) * 100,
      status: `Processing layer ${current + 1}`,
    });
    current++;

    // return {
    //   ...layer,
    //   ...settings,
    //   polygon,
    //   holes: [],
    // }
  })

  if (!layers?.length) {
    log.error('No valid paths found in course layer');
    throw new Error('No valid paths found in course layer');
  }
  
  // Cut-out any layers above
  // layers = layers.map((layer, index) => {
  layers.forEach((layer, index) => {
    try {
      const layersAbove = (layers.slice(index + 1) || []);
      const layersToCut = layersAbove.map(l => [polygonMap.get(l.id)?.polygon]);
      // let polygon = [...layer.polygon];
      let polygon = polygonMap.get(layer.id)?.polygon || [];

      let holes = [];
      if (layersToCut?.length > 0) {
        for (const cl of layersToCut) {
          const result = polygonClipping.difference([polygon], [cl]);
          const rings = result[0];
          polygon = rings[0];
          holes = [...holes, ...rings.slice(1)];
        }
      }
      polygonMap.set(layer.id, { polygon, holes });
      // return {
      //   ...layer,
      //   polygon,
      //   holes
      // }
    } catch (error) {
      log.error('Cut error', error);
      layer.error = 'Cut Error: Unable to cut holes in shape';
      // return {
      //   ...layer,
      //   error: 'Cut Error: Unable to cut holes in shape'
      // }
    }
  });

  // adds an extra water plane after cutting
  for (const layer of layers) {
    if (layer.surface === 'water') {
      const existingPoly = polygonMap.get(layer.id);
      const newlayer = {
        ...layerSettings && layerSettings?.lake_surface,
        id: `lake_surface_${layer.id}`,
        name: `lake_surface_${layer.id}`,
        hidden: true,
        surface: 'lake_surface',
        color: '0088AA',
        data: layer.data,
        // polygon: layer.polygon,
        // holes: layer.holes
      };
      layers.push(newlayer);
      polygonMap.set(newlayer.id, { ...existingPoly });
    }
  }

  return { layers, polygonMap };
}

function progress() {
  return Observable.from(progressSubject);
}

expose({ generateCoursePolygons, progress });