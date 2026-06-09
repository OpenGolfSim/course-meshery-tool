// WaterMesh.jsx
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WaterSurface } from '@opengolfsim/fuse';
import { Water } from 'three/addons/objects/Water';

export default function WaterMesh({ geometry, options = {} }) {
  const [surface, setSurface] = useState(null);

  useEffect(() => {
    if (!geometry?.attributes?.position) return;

    const dummy = new THREE.Mesh(geometry);
    const ws = new WaterSurface(dummy);
    console.log(ws);
    setSurface(ws);

    return () => {
      ws.water.geometry.dispose();
      ws.water.material.dispose();
    };
  }, [geometry]);

  useFrame(() => {
    surface?.update();
  });

  if (!surface?.water) return null;
  return <primitive object={surface.water} />;
}