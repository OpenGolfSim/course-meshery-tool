import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useProject } from '../contexts/Project';
import { TEXTURE_MAP } from '../lib/textures';
import { RESOURCES_FILE_PROTOCOL } from '../constants';
import { WireframeOverlay } from './WireframeOverlay';
import SandMaterial from '../shaders/SandMaterial';
import WaterMesh from '../shaders/Water';

// --- Module-scope caches (shared across all CustomMesh instances) ---
const textureCache = new Map();
const materialCache = new Map();
const textureLoader = new THREE.TextureLoader();

function loadTexture(url, colorSpace = THREE.NoColorSpace) {
  const fullUrl = `${RESOURCES_FILE_PROTOCOL}://textures/${url}`;
  if (textureCache.has(fullUrl)) return textureCache.get(fullUrl);
  const tex = textureLoader.load(fullUrl);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (colorSpace !== THREE.NoColorSpace) tex.colorSpace = colorSpace;
  textureCache.set(fullUrl, tex);
  return tex;
}

function getSurfaceMaterial(surfaceName, fallbackHex) {
  const cfg = TEXTURE_MAP[surfaceName];
  const key = cfg ? `s:${surfaceName}` : `c:${fallbackHex}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const params = { metalness: 0, roughness: cfg?.roughnessFactor ?? 0.9 };
  if (cfg?.baseColor) {
    params.map = loadTexture(cfg.baseColor, THREE.SRGBColorSpace);
    params.map.colorSpace = THREE.SRGBColorSpace;
  } else {
    params.color = new THREE.Color(`#${fallbackHex}`);
  }
  if (cfg?.tint) {
    params.color = new THREE.Color(cfg.tint);
  }  
  if (cfg?.normalScale?.length) {
    params.normalScale = new THREE.Vector2(params.normalScale);
  }
  // normalMap.colorSpace = THREE.LinearSRGBColorSpace;
  // roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;

  materialCache.set(key, params);
  return params;
}



function SelectedBox({ geometry }) {
  const box = useMemo(() => {
    geometry.computeBoundingBox();
    return geometry.boundingBox;
  }, [geometry]);

  const size = useMemo(() => box.getSize(new THREE.Vector3()), [box]);
  const center = useMemo(() => box.getCenter(new THREE.Vector3()), [box]);
  
  return (
    <lineSegments position={center}>
      <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
      <lineBasicMaterial color="cyan" depthTest={false} />
    </lineSegments>
  );
}



export default function CustomMesh(props) {
  const {
    layer,
    registerRef,
    renderSettings,
    onClick,
    onDoubleClick,
    selectedLayer,
    visible
  } = props;
  const { project } = useProject();
  // const ref = useRef();
  const [meshData, setMeshData] = useState();

  const isSand = layer.surface === 'sand';
  const isWater = layer.surface.startsWith('plane_');

  // Standard material params (used for both paths)
  const baseMaterialParams = useMemo(() => {
    return getSurfaceMaterial(layer.surface, layer.color);
  }, [layer.surface, layer.color]);

  // For non-sand surfaces, keep your existing MeshStandardMaterial
  const standardMaterial = useMemo(() => {
    // if (isSand) return null;
    const m = new THREE.MeshStandardMaterial({
      ...baseMaterialParams,
      metalness: 0,
      roughness: 1,
      wireframe: renderSettings.wireframe,
      vertexColors: renderSettings.vertex,
      transparent: !visible,
      opacity: visible ? 1 : 0,
    });
    return m;
  }, [isSand, baseMaterialParams, renderSettings, visible]);

  // Sand shader options — these are what you expose to the UI
  const [sandOptions, setSandOptions] = useState({
    edgeColor: new THREE.Color('#372813'),
    tintStrength: 0.5,
    exposure: 1.08,
  });
  
  const isSelected = useMemo(() => {
    return selectedLayer && layer.id === selectedLayer.layer?.id;
  }, [layer, selectedLayer]);

  const setRef = useCallback(
    (node) => {
      return registerRef(layer.id, node);
    },
    [layer.id, registerRef]
  );

  
  const geometry = useMemo(() => {
    let geo = new THREE.BufferGeometry();
    if (!meshData?.points || !meshData?.triangles) return geo;
    const points = meshData.points;
    
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geo.setIndex(meshData.triangles);

    const tile = TEXTURE_MAP[layer.surface]?.tileSize ?? 2.0;
    const uvs = new Float32Array((points.length / 3) * 2);
    for (let i = 0, j = 0; i < points.length; i += 3, j += 2) {
      uvs[j]     = points[i]     / tile;
      uvs[j + 1] = points[i + 2] / tile;
    }
    geo.setAttribute('uv',  new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('uv2', new THREE.Float32BufferAttribute(uvs, 2));


    if (meshData?.colors) {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(meshData.colors, 3));
    }
    if (meshData?.normals) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.normals, 3));
    } else {
      geo.computeVertexNormals();
    }
    // geo = mergeVertices(geo, 1e-4);
    // geo.computeVertexNormals();

    return geo;
  }, [meshData, layer.surface]);

  const meshPosition = useMemo(() => {
    const km = project.settings.distance * 1000;
    return [-(km/2), 0, -(km/2)];
  }, [project.settings.distance]);

  useEffect(() => {
    if (!props.meshDataState.generated || !props.layer.id) {
      return;
    }
    window.meshery.project.getMeshDataForLayer(props.layer.id).then(data => {
      if (data?.mesh) {
        setMeshData(data.mesh);
      }
    });
  }, [props.meshDataState]);

  
  return (
    <mesh
      ref={setRef}
      visible={props.layer.visible}
      name={props.layer.id}
      geometry={geometry}
      position={[0, 0, 0]}
      material={standardMaterial}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {isWater && geometry.attributes.position && (
        <WaterMesh geometry={geometry} />
      )}

      {/* {isSand && (
        <SandMaterial
          baseMaterialParams={baseMaterialParams}
          options={sandOptions}
          visible={visible}
        />
      )} */}
      {isSelected ? <WireframeOverlay geometry={geometry} /> : null}
      {isSelected ? <SelectedBox geometry={geometry} /> : null}
    </mesh>
  )  
}