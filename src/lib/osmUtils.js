import * as turf from '@turf/turf';

export const OSM_MAPPING = {
  golf: {
    green: { surface: 'green' },
    fairway: { surface: 'fairway' },
    tee: { surface: 'tee' },
    bunker: { surface: 'sand' },
    rough: { surface: 'rough' },
    water_hazard: { surface: 'water' },
    lateral_water_hazard: { surface: 'water' }
  },
  water: {
    river: { surface: 'river' },
    stream: { surface: 'river' },
    '*': { surface: 'water' }
  },
  waterway: {
    river: { surface: 'river', buffer: 6 },
    stream: { surface: 'river', buffer: 2 },
    '*': { surface: 'water' }
  },
  natural: {
    water: { surface: 'water' }
  },
  highway: {
    track: { surface: 'dirt', buffer: 2 },
    path: { surface: 'concrete', buffer: 1.5 },
    footway: { surface: 'concrete', buffer: 1.5 },
    service: { surface: 'concrete', buffer: 4 },
    residential: { surface: 'concrete', buffer: 5 },
    '*': { surface: 'concrete', buffer: 3 } // Default for other highways
  },
  amenity: {
    parking: { surface: 'concrete' }
  }
};

export function buildOverpassQueryTags() {
  const queries = [];
  for (const [key, values] of Object.entries(OSM_MAPPING)) {
    for (const val of Object.keys(values)) {
      if (val === '*') {
        queries.push(`nwr["${key}"]`);
      } else {
        queries.push(`nwr["${key}"="${val}"]`);
      }
    }
  }
  return queries.join(';');
}

export function getOsmMapping(properties) {
  if (!properties) return null;
  const tagPriority = ['golf', 'waterway', 'water', 'natural', 'amenity', 'highway'];
  for (const tag of tagPriority) {
    if (properties[tag] && OSM_MAPPING[tag]) {
      const value = properties[tag];
      const mapping = OSM_MAPPING[tag][value] || OSM_MAPPING[tag]['*'];
      if (mapping) return mapping;
    }
  }
  return null;
}

export function preprocessOsmGeoJson(geojson, boundsBox) {
  if (!geojson || !geojson.features) return geojson;

  // 1. Map features and strictly crop them to bounds FIRST
  const validFeatures = [];
  for (const feature of geojson.features) {
    const mapping = getOsmMapping(feature.properties);
    if (!mapping) continue;

    let cropped = feature;
    if (boundsBox) {
      try {
        cropped = turf.bboxClip(feature, boundsBox);
      } catch (e) {
        console.warn('Clipping failed for feature, preserving unclipped', e);
      }
    }
    
    // Turf bboxClip might return empty or null geometries if fully outside
    if (cropped && cropped.geometry && cropped.geometry.coordinates && cropped.geometry.coordinates.length > 0) {
      cropped.properties = { ...feature.properties, _mapping: mapping };
      validFeatures.push(cropped);
    }
  }

  // 2. Separate into Areas and Lines
  const areas = validFeatures.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
  const lines = validFeatures.filter(f => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
  
  // Union areas of the same surface type to dissolve shared boundaries
  const finalFeatures = [];
  const groupedAreas = {};
  for (const area of areas) {
    const surface = area.properties._mapping.surface;
    if (!groupedAreas[surface]) {
      groupedAreas[surface] = [];
    }
    groupedAreas[surface].push(area);
  }
  
  for (const [surface, polys] of Object.entries(groupedAreas)) {
    if (polys.length === 1) {
      finalFeatures.push(polys[0]);
      continue;
    }
    try {
      // Use turf.union iteratively to dissolve overlaps
      let unioned = polys[0];
      for (let i = 1; i < polys.length; i++) {
        const nextPoly = polys[i];
        const res = turf.union(turf.featureCollection([unioned, nextPoly]));
        if (res) unioned = res;
      }
      unioned.properties = polys[0].properties;
      finalFeatures.push(unioned);
    } catch (e) {
      console.warn('Union failed for surface', surface, e);
      finalFeatures.push(...polys);
    }
  }

  // 3. Process lines (buffers, and flowline association)
  for (const line of lines) {
    const mapping = line.properties._mapping;
    
    if (mapping.surface === 'river') {
      // Find an existing river area that this centerline belongs to
      const intersectingArea = areas.find(area => {
        return area.properties._mapping.surface === 'river' && turf.booleanIntersects(line, area);
      });

      if (intersectingArea) {
        // If an area already exists, just attach this flow line to it. DO NOT create a duplicate area.
        intersectingArea.properties._flowLineCoords = line.geometry.coordinates;
        continue; // Skip buffering
      }
    }

    // Buffer the line to create a new area
    const bufferMeters = mapping.buffer || 2;
    if (bufferMeters > 0) {
      const buffered = turf.buffer(line, bufferMeters, { units: 'meters' });
      if (buffered) {
        buffered.properties = { ...line.properties };
        // If we buffered a river centerline because no area existed, preserve it as a flow line
        if (mapping.surface === 'river') {
          buffered.properties._flowLineCoords = line.geometry.coordinates;
        }
        
        // Re-crop the newly buffered area so the expansion doesn't bleed outside bounds
        if (boundsBox) {
          try {
            const reCropped = turf.bboxClip(buffered, boundsBox);
            if (reCropped && reCropped.geometry && reCropped.geometry.coordinates.length > 0) {
              finalFeatures.push(reCropped);
            }
          } catch(e) {
            finalFeatures.push(buffered);
          }
        } else {
          finalFeatures.push(buffered);
        }
      }
    }
  }

  return { ...geojson, features: finalFeatures };
}
