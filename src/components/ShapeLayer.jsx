import React, { useEffect, useRef } from 'react';
import { Line, useBounds } from '@react-three/drei';

import { svgToTerrain, interpHeight } from '../utils/terrain';

export default function ShapeLayer(props) {
  const api = useBounds();
  const shapeRef = useRef();
  const points = props.layer.polygon.map(point => {
    let height = 0;
    const [x, y] = point;
    if (props.terrainData) {
      const [tx, tz] = svgToTerrain(x, y, props.viewBox[0], props.terrainSize);
      // Get/interpolate terrain height
      height = interpHeight(props.terrainData, tx, tz, 4097);

      // If Unity height range is [0, 65535], you might want to scale to meters
      // For example, if your terrain in Unity is 600m tall, scale = 600/65535
      // If not, just use the raw value.


      // Example: scale height (adjust as needed)
      height = (height / 65535) * props.heightScale;
    }
    return [x, height, y];
  });

  // useEffect(() => {
  //   if (props.layer.zoom) {
  //     // api.fit(shapeRef.current);
  //     // api.moveTo([0, 10, 10]).lookAt({ target: [5, 5, 0], up: [0, 0, 0] })
  //     api.refresh(shapeRef.current).clip().fit()
  //     // bounds.refresh(new THREE.Box3()).clip().fit()
  //   }
  // }, [props.layer.zoom]);

  if (props.layer.mesh) {
    return null;
  }

  return (
    <Line
      ref={shapeRef}
      name={props.layer.id}
      points={points}
      lineWidth={1}
      color={`#${props.layer.color}`}
      position={[-(props.viewBox[0]/2), 0, -(props.viewBox[0]/2)]}
    />
  )
}