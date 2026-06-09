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

function cleanPolygonOutput(polygon, holes, epsilon = 0.01) {
  function clean(ring) {
    // Strip closing point if ring is closed (polygon-clipping outputs closed rings)
    if (ring.length > 1) {
      const [fx, fy] = ring[0];
      const [lx, ly] = ring[ring.length - 1];
      if (Math.abs(fx - lx) < 1e-8 && Math.abs(fy - ly) < 1e-8) {
        ring = ring.slice(0, -1);
      }
    }

    // Remove near-duplicate consecutive points
    const epsSq = epsilon * epsilon;
    let cleaned = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
      const [x, y] = ring[i];
      const [px, py] = cleaned[cleaned.length - 1];
      const dx = x - px, dy = y - py;
      if (dx * dx + dy * dy > epsSq) {
        cleaned.push(ring[i]);
      }
    }

    return cleaned;
  }

  return {
    polygon: clean(polygon),
    holes: holes.map(h => clean(h)).filter(h => h.length >= 3)
  };
}



export function generateCoursePolygons(courseLayers, layerSettings) {
  let meshLayers = [];
  const polygonMap = new Map();
  // convert outer rings to polygons
  let current = 0;

  courseLayers.forEach(layer => {
  // let layers = courseLayers.map((layer) => {
    const { data, matrix, ...restOfLayer } = layer;
    const properties = new svgPathProperties(data);
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
      if (matrix) {
        const transformed = applyToPoint(matrix, { x: pos.x, y: pos.y });
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
    
    meshLayers.push({
      // ...layer,
      ...restOfLayer,
      ...settings
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

  if (!meshLayers?.length) {
    log.error('No valid paths found in course layer');
    throw new Error('No valid paths found in course layer');
  }
  
  // Cut-out any layers above
  meshLayers.forEach((layer, index) => {
    try {
      const layersAbove = (meshLayers.slice(index + 1) || []);
      const layersToCut = layersAbove.map(l => [polygonMap.get(l.id)?.polygon]);
      let polygon = polygonMap.get(layer.id)?.polygon || [];

      let holes = [];
      if (layersToCut.length > 0) {
        // Single combined difference avoids accumulating floating-point errors
        const result = polygonClipping.difference([polygon], ...layersToCut);
        if (result.length > 0) {
          const rings = result[0];
          polygon = rings[0];
          holes = rings.slice(1);
        }
      }

      // Clean geometry before it reaches the mesh worker
      const cleaned = cleanPolygonOutput(polygon, holes);

      polygonMap.set(layer.id, cleaned);
    } catch (error) {
      log.error('Cut error', error);
      layer.error = 'Cut Error: Unable to cut holes in shape';
    }
  });

  // Cut-out any layers above
  // layers = layers.map((layer, index) => {
  // layers.forEach((layer, index) => {
  //   try {
  //     const layersAbove = (layers.slice(index + 1) || []);
  //     const layersToCut = layersAbove.map(l => [polygonMap.get(l.id)?.polygon]);
  //     // let polygon = [...layer.polygon];
  //     let polygon = polygonMap.get(layer.id)?.polygon || [];

  //     let holes = [];
  //     if (layersToCut?.length > 0) {
  //       for (const cl of layersToCut) {
  //         const result = polygonClipping.difference([polygon], [cl]);
  //         const rings = result[0];
  //         polygon = rings[0];
  //         holes = [...holes, ...rings.slice(1)];
  //       }
  //     }
  //     polygonMap.set(layer.id, { polygon, holes });
  //     // return {
  //     //   ...layer,
  //     //   polygon,
  //     //   holes
  //     // }
  //   } catch (error) {
  //     log.error('Cut error', error);
  //     layer.error = 'Cut Error: Unable to cut holes in shape';
  //     // return {
  //     //   ...layer,
  //     //   error: 'Cut Error: Unable to cut holes in shape'
  //     // }
  //   }
  // });

  // adds an extra water plane after cutting
  for (const layer of meshLayers) {
    if (layer.surface === 'water' || layer.surface === 'river') {
      const existingPoly = polygonMap.get(layer.id);
      let newlayer = null;
      if (layer.surface === 'river' && layerSettings?.plane_river) {
        newlayer = {
          ...layerSettings.river_plane,
          id: `plane_river_${layer.id}`,
          riverId: layer.id,
          name: `plane_river_${layer.id}`,
          hidden: false,
          surface: 'plane_river',
          color: '0088AA',
          // data: layer.data,
        };
      } else if (layer.surface === 'water' && layerSettings?.plane_lake) {
        newlayer = {
          ...layerSettings.plane_lake,
          id: `plane_lake_${layer.id}`,
          lakeId: layer.id,
          name: `plane_lake_${layer.id}`,
          hidden: false,
          surface: 'plane_lake',
          color: '0088AA',
          // data: layer.data,
        };
      }
      if (newlayer) {
        meshLayers.push(newlayer);
        polygonMap.set(newlayer.id, { ...existingPoly });
      }
    }
  }

  return { meshLayers, polygonMap };
}

function progress() {
  return Observable.from(progressSubject);
}

expose({ generateCoursePolygons, progress });