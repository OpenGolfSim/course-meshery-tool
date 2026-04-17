import { parse } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';

const classificationColors = {
  // Never classified
  0: [1, 0, 0],
  // Unassigned
  1: [0.6, 0.6, 0.6],
  // Ground
  2: [0.5, 0.35, 0.2],
  // Low Vegetation
  3: [0.2, 1, 0.2],
  // Medium Vegetation
  4: [0.1, 1, 0.1],
  // High Vegetation
  5: [0.0, 1, 0.0],
  // Building
  6: [1, 1, 1],
  // Low Point
  7: [0.4, 0.4, 0.4],
  // Reserved
  // 8: [0.5, 0.5, 0.5],
  // Water
  9: [0, 0, 1],
  // // Rail
  // 10: [],
  // // Road Surface
  // 11: [0.2, 0.2, 0.2],
  // // Reserved
  // 12: [],
  // // Wire - Guard (Shield)
  // 13: [],
  // // Wire - Conductor (Phase)
  // 14: [],
  // // Transmission Tower
  // 15: [],
  // // Wire-Structure Connector (Insulator)
  // 16: [],
  // // Bridge Deck
  // 17: [],
  // // High Noise  
  // 18: [],
};

self.onmessage = async (event) => {
  const { arrayBuffer, classificationFilter } = event.data;

  try {
    // We tell loaders.gl NOT to spawn its own workers, 
    // because WE are already inside a background worker thread!
    const data = await parse(arrayBuffer, LASLoader, { worker: false });

    // Extract the raw typed arrays
    const positions = data.attributes.POSITION.value;
    const rawColors = data.attributes.COLOR_0?.value;
    const classifications = data.attributes.classification?.value;

    // Inside the onmessage loop
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i+1];
      const z = positions[i+2];

      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    // // Calculate the dimensions of the "real" footprint
    // const worldWidth = maxX - minX;
    // const worldHeight = maxY - minY;

    // // Normalize the positions so they fit in a 0 to 1 range
    // for (let i = 0; i < positions.length; i += 3) {
    //   // We divide by worldWidth for both X and Y to maintain the aspect ratio
    //   positions[i] = (positions[i] - minX) / worldWidth;
    //   positions[i+1] = (positions[i+1] - minY) / worldWidth; 
    //   // Z is usually kept in meters, but shifted so the lowest point is 0
    //   positions[i+2] = positions[i+2] - minZ;
    // }

    // const colors = data.attributes.COLOR_0 ? data.attributes.COLOR_0.value : null;
    
    const numPoints = positions.length / 3;
    const colors = new Float32Array(numPoints * 3);
    for (let i = 0; i < numPoints; i++) {
      const cls = classifications?.[i];
      
      if (cls >= 3 || cls <= 5) {
        colors[i * 3] = 0; // classificationColors[cls][0];
        colors[i * 3 + 1] = 1; // classificationColors[cls][1];
        colors[i * 3 + 2] = 0; // classificationColors[cls][2];
      } else {
        colors[i * 3] = 0; // classificationColors[cls][0];
        colors[i * 3 + 1] = 0; // classificationColors[cls][1];
        colors[i * 3 + 2] = 0; // classificationColors[cls][2];
      }
    }

    // 1. Check if we actually have valid color data
    // const hasRealColors = rawColors && rawColors.some(c => c > 0);

    let filteredPositions;
    let filteredColors;

    if (classificationFilter) {
      filteredPositions = [];
      filteredColors = [];
      for (let i = 0; i < classifications.length; i++) {
        // Check if this point's class is in our "allowed" list
        if (classificationFilter.includes(classifications[i])) {
          
          // Push X, Y, Z
          filteredPositions.push(
            positions[i * 3], 
            positions[i * 3 + 1], 
            positions[i * 3 + 2]
          );
  
          // Push R, G, B (Normalizing to 0-1 and fixing the RGBA shift)
          // if (rawColors) {
            filteredColors.push(
              colors[i * 3], 
              colors[i * 3 + 1], 
              colors[i * 3 + 2]
            );
          // }
        }
      }
    } else {
      filteredPositions = positions;
      filteredColors = colors;
    }

    //   // if (hasRealColors) {
    //   //   // Use existing RGBA -> RGB logic
    //   //   colors[i * 3]     = rawColors[i * 4]     / 255;
    //   //   colors[i * 3 + 1] = rawColors[i * 4 + 1] / 255;
    //   //   colors[i * 3 + 2] = rawColors[i * 4 + 2] / 255;
    //   // } else 
      
    //   if (classifications) {
    //   //   // 2. Fallback: Color by Classification (Standard ASPRS colors)
    //     const cls = classifications[i];

    //     if (cls === 2) { // Ground
    //       colors[i * 3] = 1;
    //       colors[i * 3 + 1] = 0;
    //       colors[i * 3 + 2] = 0;
    //     } else if (cls >= 3 && cls <= 5) { // Vegetation
    //       colors[i * 3] = 0;
    //       colors[i * 3 + 1] = 1;
    //       colors[i * 3 + 2] = 0;
    //     } else if (cls === 6) { // Building
    //       colors[i * 3] = 0;
    //       colors[i * 3 + 1] = 0;
    //       colors[i * 3 + 2] = 1; // Red
    //     } else { // Unclassified/Default
    //       colors[i * 3] = 0.5;
    //       colors[i * 3 + 1] = 0.5;
    //       colors[i * 3 + 2] = 0.5; // Grey
    //     }
    //   //   if (classificationFilter.length && classificationFilter.includes(clas)) {
    //   //     filteredPoints.push();
    //   //   }
    //   } else {
    //     // 3. Last Resort: Color by Elevation (Z)
    //     // Normalize Z to a 0.0 - 1.0 range (simple blue-to-red ramp)
    //     // const z = positions[i * 3 + 2];
    //     colors[i * 3] = 1; // Constant red tint
    //     colors[i * 3 + 1] = 0; // Constant green tint
    //     colors[i * 3 + 2] = 0; // Constant blue tint
    //   }
    // }

    self.postMessage(
      {
        type: 'SUCCESS',
        positions: filteredPositions,
        colors: filteredColors,
        classifications,
        // stats: { minX, maxX, minY, maxY, minZ, maxZ, worldWidth, worldHeight }
      }, 
      [positions.buffer, colors.buffer]
    );

  } catch (error) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};