import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useMeshery } from '../contexts/Meshery.jsx';
import { useBounds } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import log from 'electron-log/renderer';
import { isPointInPolygon, distanceToPolygonEdge } from '../lib/mesh';

function cubicBezierY(points, t) {
  const y0 = 1 - points[0][1];
  const y1 = 1 - points[1][1];
  const y2 = 1 - points[2][1];
  const y3 = 1 - points[3][1];
  const mt = 1 - t;
  return (
    y0 * mt * mt * mt +
    3 * y1 * mt * mt * t +
    3 * y2 * mt * t * t +
    y3 * t * t * t
  );
}

function digMesh(original, positions, polygon, holes, digOptions) {
  const { curvePower, curve, curvePoints, depth, distance } = digOptions;
  let maxDist = 0;
  const insideList = [];

  for (let i = 0; i < original.length; i += 3) {
    const x = original[i];
    const y = original[i + 1];
    const z = original[i + 2];

    const pt2D = [x, z]; // [x,z] for polygon
    if (isPointInPolygon(pt2D, polygon, holes)) {
      const dist = distanceToPolygonEdge(pt2D, polygon);
      if (dist > maxDist) maxDist = dist;
      insideList.push({ idx: i / 3, dist, point: [x, y, z] });
    }
  }
  const digDistance = distance * maxDist;

  for (const obj of insideList) {
    let t = Math.min(obj.dist / digDistance, 1);
    // let t = maxDist ? obj.dist / maxDist : 0;
    // console.log('draw', t, obj);
    let f;
    switch (curve) {
      case 'linear':
        f = t;
        break;
      case 'pow':
        f = 1 - Math.pow(1 - t, curvePower);
        break; // Inverted!
      case 'sine':
        f = Math.sin(t * Math.PI / 2);
        break;
      case 'bezier':
        // ??
        f = cubicBezierY(curvePoints, t);
        break;
      default:
        f = t * t * (3 - 2 * t);
    }
    const [x, y, z] = obj.point;
    const reduce = (f * depth);
    positions.setXYZ(obj.idx, x, y - reduce, z);
  }
}
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
  
  const [firstLoad, setFirstLoad] = useState(false);
  const { generateMesh, conformMesh, finalHeightMap, settings, updateLayerById } = useMeshery();
  const [material, setMaterial] = useState(new THREE.MeshBasicMaterial({ 
    wireframe: settings.wireframe,
    vertexColors: settings.vertexColors,
    transparent: true,
    opacity: 1
    // opacity: 0.8,
  }))
  // const [meshData, setMeshData] = useState();

  const timer = useRef();
  const delayedAction = useCallback(async () => {
    try {
      const response = await generateMesh(props.layer);
      // if (response.mesh) {
      //   setMeshData(response.mesh);
      // }
      console.log('response', props.layer.id, response);
      updateLayerById(props.layer.id, { mesh: response.mesh });

      // const conformed = await conformMesh(props.layer); // { layer: props.layer, mesh: response.mesh });
      // if (conformed.mesh.points) {
      //   updateLayerById(props.layer.id, { mesh: { ...response.mesh, points: conformed.mesh.points } });
      //   // setMeshData(old => ({ ...old, points: conformed.mesh.points }));
      // }
      
      if (props.onLoaded) {
        props.onLoaded(props.layer);
      }
    } catch (error) {
      log.error('mesh error', error);
    }
  }, [props.layer, props.onLoaded]);


  // useEffect(() => {
  //   clearTimeout(timer.current);
  //   if (props.layer.mesh) {
  //     return;
  //   }
  //   // debounce
  //   // timer.current = setTimeout(delayedAction, 1000);  
  //   // console.log('effect');
  //   delayedAction();
  // }, [props.layer.mesh]);

  const meshPosition = useMemo(() => {
    return [-(settings.svgSize[0]/2), 0, -(settings.svgSize[1]/2)];
  }, [settings.svgSize]);

  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    if (!props.layer.mesh) {
      return geometry;
    }
    const positions = props.layer.mesh.points;
    const indices = props.layer.mesh.triangles;
    const positionAttr = new THREE.Float32BufferAttribute(positions, 3);
    // initial dig
    if (props.layer.dig?.depth) {
      digMesh(
        positions,
        positionAttr,
        props.layer.polygon,
        props.layer.holes,
        props.layer.dig
      );
    }
    geometry.setAttribute('position', positionAttr);
    geometry.setIndex(indices);

    // geometry.setIndex(new Uint32Array(indices));
    geometry.computeVertexNormals();
    if (props.layer.mesh.colors) {
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(props.layer.mesh.colors, 3)
      );    
    }
    
    // geometry.computeBoundingBox();
    // geometry.computeBoundingSphere();
    
    return geometry;
  }, [props.layer.mesh]);


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

  const debounceTimer = useRef();

  // const reConformMesh = useCallback(() => {
  //   console.log('Reconforming mesh', props.layer, settings);
  //   conformMesh(props.layer).then(response => {
  //     // updateLayerById(props.layer.id, { mesh: response.mesh, conformed: true });
  //   }).catch(error => {
  //     console.warn(error);
  //   });
  // }, [settings, props.layer]);

  // useEffect(() => {
  //   if (props.layer.mesh && finalHeightMap) {
  //     clearTimeout(debounceTimer.current);
  //     debounceTimer.current = setTimeout(reConformMesh, 600);
  //   }
  // }, [
  //   // settings.rawFilePath,
  //   finalHeightMap,
  //   settings.heightScale
  // ]);

  // useEffect(() => {
  //   if (props.layer.mesh && !props.layer.conformed) {
  //     console.log('Reconforming mesh', props.layer);
  //     conformMesh(props.layer).then(response => {
  //       updateLayerById(props.layer.id, { mesh: response.mesh, conformed: true });
  //     });
  //   }
  // }, [props.layer.mesh, props.layer.conformed]);
  const customDig = useCallback(() => {
    const positionAttr = geometry.getAttribute('position');
    // const cloned = positionAttr.clone();
    digMesh(
      props.layer.mesh.points,
      positionAttr,
      props.layer.polygon,
      props.layer.holes,
      props.layer.dig
    );
    positionAttr.needsUpdate = true;
  }, [props.layer, geometry]);

  useEffect(() => {
    if (!props.layer.conformed) {
      return;
    }
    if (!props.layer?.dig?.depth) {
      return;
    }
    customDig();
  }, [
    props.layer.dig?.depth,
    props.layer.dig?.distance,
    props.layer.dig?.curve,
    props.layer.dig?.curvePoints
  ]);

  

  useEffect(() => {
    if (!props.layer) {
      return;
    }
    if (!firstLoad) {
      // initial mesh generation is handled in the provider
      setFirstLoad(true);
      return;
    }
    log.info(`Regenerating mesh (${props.layer.id})`);
    generateMesh(props.layer).then(_response => {
      conformMesh({ ...props.layer, mesh: _response.mesh });
    });
  }, [props.layer.spacing]);

  useEffect(() => {
    material.opacity = props.layer.pending || !props.layer.conformed ? 0.3 : 1;
    material.needsUpdate = true;
    setMaterial(material);
  }, [props.layer?.pending, props.layer?.conformed]);

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

  if (!props.layer.mesh) {
    return null;
  }
  return (
    <mesh
      ref={ref}
      visible={props.layer.visible}
      name={props.layer.id}
      geometry={geometry}
      position={meshPosition}
      // onContextMenu={handleMeshClick}
      material={material}
    ></mesh>
  )
}