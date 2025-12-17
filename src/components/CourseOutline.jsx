import React from 'react';
import { Line } from '@react-three/drei';

export default function CourseOutline(props) {
  return (
    <Line
      points={[
        [0,0,0],
        [props.viewBox[0],0,0],
        [props.viewBox[0],0,props.viewBox[1]],
        [0,0,props.viewBox[1]],
        [0,0,0],
      ]}
      lineWidth={4}
      color={props.color || 0x00ffaa}
      position={[-(props.viewBox[0]/2), 0, -(props.viewBox[0]/2)]}
    />
  );
}