import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useMemo } from 'react';
import * as THREE from 'three';

export default function CourseMapCapture({ worldSize, captureRef }) {
  const { gl, scene } = useThree();

  const camera = useMemo(() => {
    const half = worldSize / 2;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
    cam.position.set(half, 500, half);
    cam.rotation.set(-Math.PI / 2, 0, 0);
    cam.updateMatrixWorld();
    return cam;
  }, [worldSize]);

  useImperativeHandle(captureRef, () => ({
    capture(size = 512) {
      camera.updateMatrixWorld();

      const rt = new THREE.WebGLRenderTarget(size, size, {
        colorSpace: THREE.SRGBColorSpace,
      });

      const prevFog = scene.fog;
      scene.fog = null;

      // Disable all existing lights
      const disabledLights = [];
      scene.traverse((obj) => {
        if (obj.isLight && obj.visible) {
          obj.visible = false;
          disabledLights.push(obj);
        }
      });

      // Add flat, even lighting
      const topLight = new THREE.DirectionalLight(0xffffff, 1);
      topLight.position.set(0, 500, 0);
      scene.add(topLight);

      const fill = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(fill);

      gl.setRenderTarget(rt);

      const prevShadowMap = gl.shadowMap.enabled;
      gl.shadowMap.enabled = false;

      gl.render(scene, camera);

      gl.shadowMap.enabled = prevShadowMap;
      gl.setRenderTarget(null);

      // Restore everything
      scene.remove(topLight);
      scene.remove(fill);
      topLight.dispose();
      fill.dispose();
      disabledLights.forEach((light) => { light.visible = true; });
      scene.fog = prevFog;


      const pixels = new Uint8Array(size * size * 4);
      gl.readRenderTargetPixels(rt, 0, 0, size, size, pixels);

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(size, size);

      for (let y = 0; y < size; y++) {
        const src = (size - y - 1) * size * 4;
        const dst = y * size * 4;
        imageData.data.set(pixels.subarray(src, src + size * 4), dst);
      }

      ctx.putImageData(imageData, 0, 0);
      rt.dispose();

      return canvas.toDataURL('image/jpeg', 90);
    }
  }), [gl, scene, camera]);

  return null;
}