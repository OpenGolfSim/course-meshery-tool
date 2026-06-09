import * as THREE from 'three';
import React, { useEffect, useRef, useMemo } from 'react';
import { extend } from '@react-three/fiber';
import { SandShaderMaterial } from '@opengolfsim/fuse';


extend({ SandShaderMaterial });

export default function SandMaterial({ baseMaterialParams, options, wireframe, visible }) {
  const ref = useRef();

  // Build a throwaway MeshStandardMaterial so SandShaderMaterial
  // can pull map/normalMap/roughness from it, matching your existing API
  const baseMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial(baseMaterialParams);
    m.map?.clone();           // ensure we don't mutate cached textures
    return m;
  }, [baseMaterialParams]);

  // Rebuild the shader when the base material changes
  const shaderMat = useMemo(() => {
    return new SandShaderMaterial(baseMaterial, options);
  }, [baseMaterial, options]);

  // Push live-editable uniforms every frame (or via useEffect)
  useEffect(() => {
    if (!ref.current) return;
    ref.current.edgeColor = options.edgeColor ?? ref.current.edgeColor;
    ref.current.tintStrength = options.tintStrength ?? ref.current.tintStrength;
    ref.current.exposure = options.exposure ?? ref.current.exposure;
    ref.current.transparent = !visible;
    ref.current.opacity = visible ? 1.0 : 0.0;
    ref.current.needsUpdate = true;
  }, [options, visible]);

  return <primitive ref={ref} object={shaderMat} attach="material" />;
}