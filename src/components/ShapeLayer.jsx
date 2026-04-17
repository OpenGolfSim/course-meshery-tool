import React, { useEffect, useMemo, useRef } from 'react';
import { Line, useBounds } from '@react-three/drei';

import { svgToTerrain, interpHeight } from '../utils/terrain';
import { useMeshery } from '../contexts/Meshery.jsx';
import { useProject } from '../contexts/Project.jsx';

export default function ShapeLayer({ layer, polygon, layerId, ...props }) {
  const { project } = useProject();
  const { settings } = useMeshery();
  const shapeRef = useRef();

  const svgSize = useMemo(() => {
    return project.settings.distance ? Math.round(project.settings.distance * 1000) : 1000;
  }, [project.settings?.distance]);

  let height = 0;
  const points = useMemo(() => {
    if (!polygon?.length) {
      return [];
    }
    return [
      ...polygon.map(point => {
        const [x, y] = point;
        return [x, height, y];
      })
    ];
  }, [polygon]);

  if (layer.mesh || !polygon) {
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
        position={[-(svgSize/2), 0, -(svgSize/2)]}
        {...props}
      />
      
    </>
  )
}