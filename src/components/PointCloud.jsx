import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import LasWorker from '../workers/las.webworker.js';

export const CLASSIFICATION_CODES = [
  { code: 0, label: 'Unclassified' },
  { code: 1, label: 'Default' },
  { code: 2, label: 'Ground' },
  { code: 3, label: 'Low Vegetation' },
  { code: 4, label: 'Medium Vegetation' },
  { code: 5, label: 'High Vegetation' },
  { code: 6, label: 'Building' },
  { code: 7, label: 'Low Point' },
  // { code: 8, label: 'Low Noise' },
  { code: 9, label: 'Water' },
  { code: 10, label: 'Rail' },
  { code: 11, label: 'Road' }
];

function toArrayBuffer(buf) {
  if (buf instanceof ArrayBuffer) return buf;
  if (ArrayBuffer.isView(buf)) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  return new Uint8Array(buf).buffer;
}

export default function PointCloud({ arrayBuffer, viewBoxSize }) {
  const [geometry, setGeometry] = useState(null);
  const [stats, setStats] = useState(null);

  const workerRef = useRef();

  const handleMessage = (event) => {
    const { type, positions, colors, error, classifications, stats } = event.data;
    console.log('lidar classifications...', classifications);
    console.log('lidar positions...', positions);
    console.log('lidar colors...', colors);

    if (type === 'ERROR') {
      console.error("Worker Parsing Failed:", error);
      return;
    }
    
    // 1. DATA CENTERING (Critical)
    // We use the very first X, Y, Z as our anchor
    const centerX = positions[0];
    const centerY = positions[1];
    const centerZ = positions[2];

    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= centerX;
      positions[i + 1] -= centerY;
      positions[i + 2] -= centerZ;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 2. COLOR FIX
    // If colors are black [0,0,0], ignore them and use a fixed material color
    // or generate a mock color attribute (e.g., white)
    // const hasValidColors = colors && colors.some(c => c > 0);
    
    // if (hasValidColors) {
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    // }

    // 3. FRUSTUM CULLING FIX
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    console.log('Points centered at 0,0,0. Original anchor:', centerX, centerY, centerZ);
    
    // Crucial: Compute the bounding sphere so Three.js knows the object is large
    geom.computeBoundingSphere();
    
    setStats(stats);    
    setGeometry(geom);
    // Terminate worker when done to free up memory
    workerRef.current.terminate(); 
  };

  useEffect(() => {
    if (!arrayBuffer) {
      return;
    }
    // 1. Initialize our custom Web Worker using standard Webpack 5 syntax
    workerRef.current = new LasWorker();
    workerRef.current.onmessage = handleMessage;
    // By passing the buffer in the second array, we "transfer" ownership, 
    // preventing a heavy memory copy.
    
    const pureBuffer = toArrayBuffer(arrayBuffer);
    // worker.postMessage({ arrayBuffer }, [arrayBuffer]);
    workerRef.current.postMessage({ arrayBuffer: pureBuffer }, [pureBuffer]);    

    // Cleanup if component unmounts early
    return () => workerRef.current.terminate();
  }, [arrayBuffer]);

  if (!geometry) return null;

  return (
    <group
      // 1. Move the [0,0] corner of the point cloud to the [bottom-left] of your box
      position={[-viewBoxSize / 2, -viewBoxSize / 2, 0]} 
      // 2. Scale the 0-1 points up to the viewBoxSize
      // scale={[viewBoxSize, 1, viewBoxSize]}
    >
      <points geometry={geometry}>
        <pointsMaterial 
          size={1}
          sizeAttenuation={true} 
          // color={0x00ffaa} // Bright green if no colors
          color={0xFFFF00} // Bright green if no colors
          vertexColors={true} 
          transparent={false}
        />
      </points>
    </group>
  );
}
