import React, { useMemo } from 'react';
import * as THREE from 'three';

export function WireframeOverlay({ geometry, color = 'yellow', opacity = 0.15 }) {
  return (
    <mesh position={[0, 0.01, 0]} geometry={geometry} layers={1}>
      <meshBasicMaterial color={color} depthTest={false} transparent={true} wireframe={true} opacity={opacity} />
    </mesh>
  );
}