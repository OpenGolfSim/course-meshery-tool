import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useMeshery } from '../contexts/Meshery.jsx';
import { useBounds } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
// import path from 'node:path';

// import { svgToTerrain, interpHeight } from '../utils/terrain';

// const workerPath = './workers/mesh.js';
// console.log('make a worker: ', workerPath);
// const worker = new Worker(workerPath);
// const workerPath = new URL('../workers/mesh.js', import.meta.url);
// console.log('workerPath: ', workerPath);

// const worker = new Worker(workerPath);
// console.log('made a worker: ', worker);

export default function MeshLayer(props) {
  const ref = useRef();

  const { generateMesh, settings } = useMeshery();
  const [material, setMaterial] = useState(new THREE.MeshBasicMaterial({ 
    wireframe: settings.wireframe,
    vertexColors: settings.vertexColors
    // transparent: true,
    // opacity: 0.8,
  }))
  const [meshData, setMeshData] = useState();

  const timer = useRef();
  const delayedAction = useCallback(() => {
    generateMesh({
      layer: props.layer
      // heightScale: props.heightScale,
      // terrainSize: props.terrainSize,
    }).then(response => {
      if (response.mesh) {
        setMeshData(response.mesh);
      }
      if (props.onLoaded) {
        props.onLoaded(props.layer);
      }
    }).catch(error => {
      console.error('mesh error', error);
    });
  }, [props.layer, props.onLoaded]);


  useEffect(() => {
    clearTimeout(timer.current);
    if (props.layer.mesh) {
      return;
    }
    // debounce
    // timer.current = setTimeout(delayedAction, 1000);  
    // console.log('effect');
    delayedAction();
  }, [props.layer.mesh]);

  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    if (!meshData) {
      return geometry;
    }
    const positions = meshData.points;
    const indices = meshData.triangles;

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);

    // geometry.setIndex(new Uint32Array(indices));
    geometry.computeVertexNormals();
    if (meshData.colors) {
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(meshData.colors, 3)
      );    
    }
    
    // geometry.computeBoundingBox();
    // geometry.computeBoundingSphere();
    
    return geometry;
  }, [meshData?.points, meshData?.triangles, meshData?.colors]);


  const toggleColors = useCallback(() => {
    material.color = !!settings.vertexColors ? new THREE.Color(1, 1, 1) : new THREE.Color(`#${props.layer.color}`);
    material.vertexColors = !!settings.vertexColors;
    material.wireframe = !!settings.wireframe;
    material.needsUpdate = true;
    // Force re-render to update material properties
    setMaterial(material);
  }, [material, settings.vertexColors, settings.wireframe]);

  // Update the geometry colors if needed (e.g., on interaction)
  // For this example, we're just toggling the material, but you'd update `colors.needsUpdate = true` here.
  useFrame(() => {
    if (ref.current && geometry.colorsNeedUpdate) {
      geometry.colorsNeedUpdate = false; // Reset flag
    }
  });

  useEffect(() => {
    if (geometry) {
      toggleColors();
    }
  }, [geometry, settings.vertexColors, settings.wireframe]);

  const handleMeshClick = (event) => {
    console.log('event', event, props.layer);
    if (props.onClick) {
      props.onClick(props.layer);
    }
  }

  useEffect(() => {
    if (!props.layer.zoom) {
      return;
    }
    
    const box = new THREE.Box3().setFromObject(ref.current);
    const center = new THREE.Vector3();
    box.getCenter(center);  // center in world coordinates

    // Move above the object center
    props.controlsRef?.current?.setLookAt(
      center.x, center.y + 20, center.z,     // camera position
      center.x, center.y, center.z,          // look at this position
      true                                   // animate: true/false as needed
    );
    props.controlsRef?.current?.fitToBox(ref.current, true);

    // bounds.refresh(new THREE.Box3()).clip().fit()
    if (props.onZoomComplete) {
      props.onZoomComplete(props.layer);
    }
  }, [props.layer.zoom]);

  if (!meshData || !props.layer.mesh) {
    return null;
  }
  return (
    <mesh
      ref={ref}
      name={props.layer.id}
      geometry={geometry}
      position={[-(settings.svgSize[0]/2), 0, -(settings.svgSize[0]/2)]}
      onClick={handleMeshClick}
      material={material}
    >
      {/* <meshStandardMaterial
        wireframe={settings.wireframe}
        // color={!settings.vertexColors ? `#${props.layer.color}` : undefined}
        vertexColors={settings.vertexColors}
      /> */}
    </mesh>
  )
}