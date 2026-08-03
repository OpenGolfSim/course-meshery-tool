import * as THREE from 'three';

export function sunDirectionFromAngles(elevationDeg = 40, azimuthDeg = 225) {
  const el = THREE.MathUtils.degToRad(elevationDeg);  // 90 = noon overhead, 20 = late afternoon
  const az = THREE.MathUtils.degToRad(azimuthDeg);    // compass direction the light comes FROM
  return [
    -Math.cos(el) * Math.sin(az),
    -Math.sin(el),
    -Math.cos(el) * Math.cos(az),
  ];
}