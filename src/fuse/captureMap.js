import * as THREE from 'three/webgpu';

export async function captureMap(renderer, scene, worldSize, hiddenObjects = [], materialSwaps = [], size = 512) {

  const half = worldSize / 2;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
  cam.position.set(half, 500, half);
  cam.rotation.set(-Math.PI / 2, 0, 0);
  cam.updateMatrixWorld();

  const rt = new THREE.RenderTarget(size, size, {
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
  });

  // Disable fog and existing lights
  const prevFog = scene.fog;
  scene.fog = null;

  const disabledLights = [];
  scene.traverse((obj) => {
    if (obj.isLight && obj.visible) {
      obj.visible = false;
      disabledLights.push(obj);
    }
  });

  // Hide specified objects (clouds, grass, etc.)
  const wasVisible = hiddenObjects.map(obj => obj.visible);
  hiddenObjects.forEach(obj => { obj.visible = false; });

  // Flat, even lighting
  const topLight = new THREE.DirectionalLight(0xffffff, 1);
  topLight.position.set(0, 500, 0);
  scene.add(topLight);

  const fill = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(fill);

  const prevShadow = renderer.shadowMap?.enabled;
  if (renderer.shadowMap) renderer.shadowMap.enabled = false;

  renderer.setRenderTarget(rt);

  // Swap water/custom materials for solid colors during capture
  const originalMaterials = materialSwaps.map(({ mesh }) => mesh.material);
  materialSwaps.forEach(({ mesh, color }) => {
    mesh.material = new THREE.MeshBasicMaterial({ color });
  });
  
  renderer.setClearColor(scene.background || new THREE.Color('#eb87da'), 1);

  renderer.render(scene, cam);

  // Restore original materials and dispose temp ones
  materialSwaps.forEach(({ mesh }, i) => {
    mesh.material.dispose();
    mesh.material = originalMaterials[i];
  });


  renderer.setRenderTarget(null);

  if (renderer.shadowMap) renderer.shadowMap.enabled = prevShadow;

  // Restore scene
  scene.remove(topLight);
  scene.remove(fill);
  topLight.dispose();
  fill.dispose();
  disabledLights.forEach(l => { l.visible = true; });
  hiddenObjects.forEach((obj, i) => { obj.visible = wasVisible[i]; });
  scene.fog = prevFog;

  // Read pixels (async for WebGPU)
  const pixels = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, size, size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);

  // for (let y = 0; y < size; y++) {
  //   const src = (size - y - 1) * size * 4;
  //   const dst = y * size * 4;
  //   imageData.data.set(pixels.subarray(src, src + size * 4), dst);
  // }
  imageData.data.set(pixels);

  ctx.putImageData(imageData, 0, 0);
  rt.dispose();

  return canvas.toDataURL('image/jpeg', 0.9);
}