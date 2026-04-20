import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useProject } from '../contexts/Project';

export default function CustomMesh(props) {
  const { layer, registerRef } = props;
  const { project } = useProject();
  // const ref = useRef();
  const [meshData, setMeshData] = useState();
  const [material, setMaterial] = useState(new THREE.MeshBasicMaterial({ 
    wireframe: true,
    color: new THREE.Color(`#${props.layer.color}`),
    // wireframe: settings.wireframe,
    // vertexColors: settings.vertexColors,
    transparent: true,
    opacity: 1
  }));

  const setRef = useCallback(
    (node) => registerRef(layer.id, node),
    [layer.id, registerRef]
  );

  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    if (!meshData?.points || !meshData?.triangles) {
      return geometry;
    }
    const positions = meshData.points;
    const indices = meshData.triangles;
    const positionAttr = new THREE.Float32BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionAttr);
    geometry.setIndex(indices);

    // geometry.setIndex(new Uint32Array(indices));
    geometry.computeVertexNormals();
    if (meshData?.colors) {
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(meshData.colors, 3)
      );    
    }
    
    // geometry.computeBoundingBox();
    // geometry.computeBoundingSphere();
    
    return geometry;
  }, [meshData]);

  const meshPosition = useMemo(() => {
    const km = project.settings.distance * 1000;
    return [-(km/2), 0, -(km/2)];
  }, [project.settings.distance]);

  // const toggleColors = useCallback(() => {
  //   material.color = !!settings.vertexColors ? new THREE.Color(1, 1, 1) : new THREE.Color(`#${props.layer.color}`);
  //   material.vertexColors = !!settings.vertexColors;
  //   material.wireframe = !!settings.wireframe;
  //   material.needsUpdate = true;
  //   // Force re-render to update material properties
  //   setMaterial(material);
  // }, [material, settings.vertexColors, settings.wireframe]);

  useEffect(() => {
    if (!props.meshDataState.generated || !props.layer.id) {
      return;
    }
    window.meshery.project.getMeshDataForLayer(props.layer.id).then(data => {
      setMeshData(data.mesh);
    });
  }, [props.meshDataState]);

  
  return (
    <mesh
      ref={setRef}
      visible={props.layer.visible}
      name={props.layer.id}
      geometry={geometry}
      position={meshPosition}
      material={material}
    ></mesh>
  )  
}