import React, { useEffect, useMemo, useRef } from 'react';
import { Line, useBounds } from '@react-three/drei';

import { svgToTerrain, interpHeight } from '../utils/terrain';
import { useMeshery } from '../contexts/Meshery.jsx';

export default function ShapeLayer({ layer, polygon, layerId, ...props }) {
  const { settings } = useMeshery();
  const shapeRef = useRef();

  let height = 0;
  const points = useMemo(() => {
    return [
      ...polygon.map(point => {
        const [x, y] = point;
        return [x, height, y];
      })
    ];
  }, [polygon]);

  if (layer.mesh) {
    return null;
  }

  return (
    <>
      <Line
        ref={shapeRef}
        name={layerId || layer.id}
        visible={layer.visible}
        points={points}
        lineWidth={1}
        color={`#${layer.color}`}
        position={[-(settings.svgSize[0]/2), 0, -(settings.svgSize[1]/2)]}
        {...props}
      />
      
    </>
  )
}