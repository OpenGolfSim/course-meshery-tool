import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useProject } from '../contexts/Project';

export default function CourseOutline(props) {
  const { project } = useProject();
  const viewBoxSize = useMemo(() => {
    return project.settings.distance * 1000;
  }, [project.settings.distance]);
  return (
    <Line
      points={[
        [0,0,0],
        [viewBoxSize,0,0],
        [viewBoxSize,0,viewBoxSize],
        [0,0,viewBoxSize],
        [0,0,0],
      ]}
      lineWidth={4}
      color={props.color || 0x00ffaa}
      position={[-(viewBoxSize/2), 0, -(viewBoxSize/2)]}
    />
  );
}