import React, { useMemo, useEffect, useRef } from 'react';

import { VolumetricClouds } from '@opengolfsim/fuse';
import * as THREE from 'three';
import { useThree, useLoader, useFrame } from '@react-three/fiber';

export default function SkyPreview({
  density = 0.4,
  opacity = 0.8,
  scale = 5.0,
  radius = 800,
  position = [0, 0, 0],
  fogColor = '#fffeee',
  skyColor = '#00ffff',
  cloudColor = '#ffffff',
  // fogColor = [0.75, 0.82, 0.92],
  // skyColor = [0.75, 0.82, 0.92],
  // cloudColor = [0.75, 0.82, 0.92],
}) {
  const camera = useThree((state) => state.camera)

  // always-fresh props for the frame loop
  const propsRef = useRef({ density, opacity, scale, fogColor, skyColor, cloudColor })
  propsRef.current = { density, opacity, scale, fogColor, skyColor, cloudColor }

  const clouds = useMemo(() => {
    return new VolumetricClouds(camera, {
      density,
      opacity,
      scale,
      radius,
      position: new THREE.Vector3(...position),
      fogColor: new THREE.Color(fogColor),
      skyColor: new THREE.Color(skyColor),
      cloudColor: new THREE.Color(cloudColor),
    })
  }, [camera, radius]) // radius changes geometry → must recreate

  // update position without full reconstruction
  useEffect(() => {
    clouds.object.position.set(...position)
  }, [clouds, position[0], position[1], position[2]])

  useFrame(() => {
    const { density, opacity, scale, fogColor, skyColor, cloudColor } = propsRef.current
    const u = clouds.cloudMaterial.uniforms
    u.densityThreshold.value = density
    u.opacity.value = opacity
    u.scale.value = scale
    // console.log('skyColor', skyColor);
    // u.fogColor.value.set(...fogColor)
    u.fogColor.value.set(fogColor)
    u.skyColor.value.set(skyColor)
    u.cloudColor.value.set(cloudColor)
    clouds.update()
  })

  // cleanup on reconstruction
  useEffect(() => {
    return () => {
      clouds.object.geometry.dispose()
      clouds.cloudMaterial.dispose()
    }
  }, [clouds])

  return <primitive object={clouds.object} />
}