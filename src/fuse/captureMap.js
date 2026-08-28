import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

// Post chain for the editor viewport AND captures, so they can't drift.
// Same structure as FUSE's setupPostProcessing, but bloom values come from
// project scene settings (main guarantees the key exists — the load path
// deep-merges saved projects with defaultProjectTemplate). The runtime will
// eventually read the same values from the course file.
export function buildPostPipeline(fuseRenderer, scene, camera, bloomSettings) {
  const pipeline = new THREE.RenderPipeline(fuseRenderer.renderer);
  const scenePass = pass(scene, camera, { samples: 4 });
  const scenePassColor = scenePass.getTextureNode('output');
  if (bloomSettings?.enabled) {
    pipeline.outputNode = scenePassColor.add(
      bloom(scenePassColor, bloomSettings.strength, bloomSettings.radius, bloomSettings.threshold)
    );
  } else {
    pipeline.outputNode = scenePassColor;
  }
  return pipeline;
}

export async function captureMap(renderer, scene, worldSize, hiddenObjects = [], materialSwaps = [], size = 512, planter = null) {

  const half = worldSize / 2;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
  cam.position.set(half, 500, half);
  cam.rotation.set(-Math.PI / 2, 0, 0);
  cam.updateMatrixWorld();

  const rt = new THREE.RenderTarget(size, size, {
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
  });

  // Editor camera has culled/billboarded distant trees — show all at full
  // detail so the course map includes every tree. currentLevel reset means
  // the next editor LOD pass restores normal state automatically.
  forceTreesLOD0(planter);

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

export async function captureLightmap(renderer, scene, worldSize, sunDirection, hiddenObjects = [], size = 4096, planter = null) {
  const half = worldSize / 2;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
  cam.position.set(half, 500, half);
  cam.rotation.set(-Math.PI / 2, 0, 0);
  cam.updateMatrixWorld();

  // const rt = new THREE.RenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const ss = 2; // bake-time supersample; output stays `size`
  const rt = new THREE.RenderTarget(size * ss, size * ss, { colorSpace: THREE.SRGBColorSpace });
  // ── Save state ──
  const prevFog = scene.fog;
  const disabledLights = [];
  const wasVisible = hiddenObjects.map(o => o.visible);
  const overrides = [];
  const prevShadowEnabled = renderer.shadowMap?.enabled;
  const prevShadowType = renderer.shadowMap?.type;
  const prevToneMapping = renderer.toneMapping;

  const dir = new THREE.Vector3(...sunDirection).normalize();
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const fill = new THREE.AmbientLight(0xffffff, 0.1);

  try {
    forceTreesLOD0(planter);
    scene.fog = null;
    scene.traverse((obj) => {
      if (obj.isLight && obj.visible) { obj.visible = false; disabledLights.push(obj); }
    });
    hiddenObjects.forEach(o => { o.visible = false; });

    // White-out materials, preserving leaf alpha cutouts
    scene.traverse((o) => {
      if (!o.isMesh && !o.isBatchedMesh) return;
      if (hiddenObjects.includes(o)) return;
      overrides.push({ o, mat: o.material, cast: o.castShadow, recv: o.receiveShadow });
      // Trees (BatchedMesh) are shadow-only: colorWrite/depthWrite off means
      // the camera sees THROUGH them to the shadowed ground — otherwise the
      // lit canopy top paints white over its own shadow and no silhouette
      // survives. `map` (not alphaMap — that reads the green channel) gives
      // the shadow pass correct leaf cutouts AND keeps trunks casting.
      const isTree = o.isBatchedMesh;
      const makeWhite = (src) => {
        const m = new THREE.MeshLambertMaterial({
          color: 0xffffff,
          map: isTree ? (src?.map ?? null) : null,
          alphaTest: (src?.alphaTest > 0 || src?.alphaToCoverage) ? 0.5 : 0,
          side: src?.side ?? THREE.FrontSide,
        });
        if (isTree) {
          m.colorWrite = false;
          m.depthWrite = false;
        }
        return m;
      };

      o.material = Array.isArray(o.material) ? o.material.map(makeWhite) : makeWhite(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    });

    // Sun at the course's bake angle
    sun.position.set(half, 0, half).addScaledVector(dir, -800);
    sun.target.position.set(half, 0, half);
    sun.castShadow = true;
    sun.shadow.mapSize.set(8192, 8192);
    // Frustum big enough for the course from any sun angle (diagonal + height)
    // const r = Math.sqrt(2) * half + 100;
    const r = half + 150; // course bounds + slack; diagonal padding wasted ~40% of texels

    sun.shadow.camera.left = -r; sun.shadow.camera.right = r;
    sun.shadow.camera.top = r;   sun.shadow.camera.bottom = -r;
    sun.shadow.camera.near = 1;  sun.shadow.camera.far = 2000;
    // sun.shadow.bias = -0.0005;
    sun.shadow.bias = -0.0002;
    // sun.shadow.normalBias = 0.3;
    sun.shadow.normalBias = 0.05; 
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun, sun.target, fill);

    if (renderer.shadowMap) renderer.shadowMap.enabled = true;
    if (renderer.shadowMap) renderer.shadowMap.type = THREE.BasicShadowMap;

    renderer.toneMapping = THREE.NoToneMapping;

    renderer.setRenderTarget(rt);
    renderer.setClearColor(0xffffff, 1);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);

    const rs = size * ss;
    const pixels = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, rs, rs);

    const canvas = document.createElement('canvas');
    // canvas.width = size; canvas.height = size;
    canvas.width = rs;
    canvas.height = rs;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(rs, rs);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);

    const out = document.createElement('canvas');
    out.width = size; out.height = size;
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, 0, 0, size, size);
    return out.toDataURL('image/png');
    // // return canvas.toDataURL('image/png');
    // // Soften: leaf-cutout shadows at this texel density read as noise.
    // // A 1-texel blur ≈ 0.25m penumbra at 4096/1000m — crisp but not aliased.
    // const blurred = document.createElement('canvas');
    // blurred.width = size; blurred.height = size;
    // const bctx = blurred.getContext('2d');
    // bctx.filter = `blur(${size / 4096}px)`;
    // bctx.drawImage(canvas, 0, 0);
    // return blurred.toDataURL('image/png');

  } finally {
    // ── Restore everything, even on error ──
    for (const { o, mat, cast, recv } of overrides) {
      const cur = o.material;
      (Array.isArray(cur) ? cur : [cur]).forEach(m => m?.dispose?.());
      o.material = mat;
      o.castShadow = cast;
      o.receiveShadow = recv;
    }
    scene.remove(sun, sun.target, fill);
    sun.dispose(); fill.dispose();
    disabledLights.forEach(l => { l.visible = true; });
    hiddenObjects.forEach((o, i) => { o.visible = wasVisible[i]; });
    scene.fog = prevFog;
    if (renderer.shadowMap) renderer.shadowMap.enabled = prevShadowEnabled;
    if (renderer.shadowMap) renderer.shadowMap.type = prevShadowType;
    renderer.toneMapping = prevToneMapping;
    renderer.setRenderTarget(null);
    rt.dispose();
  }
}

// Force every tree to LOD0 for the bake — the editor camera has most
// instances culled or billboarded. Mirrors TreePlanter's own swap logic.
function forceTreesLOD0(planter) {
  if (!planter) return;
  for (const entry of planter.lodEntries) {
    const { batches, currentLevel } = entry;
    for (let i = 0; i < currentLevel.length; i++) {
      currentLevel[i] = 0; // next editor LOD pass self-corrects from this
      for (const batch of batches) {
        const id = batch.instanceIds[i];
        const geoId = batch.lodGeometryIds[0] ?? -1;
        if (geoId === -1) {
          batch.mesh.setVisibleAt(id, false); // billboard-only batch stays hidden at LOD0
        } else {
          batch.mesh.setGeometryIdAt(id, geoId);
          batch.mesh.setVisibleAt(id, true);
        }
      }
    }
  }
}


// Snapshot of the current editor view: same scene, same camera, minus
// editor overlays (layer 3). Rendered to an offscreen target because the
// WebGPU canvas drawing buffer isn't reliably readable after present.
// Takes the FuseRenderer so the editor's own post chain (bloom at high
// quality) applies — a parallel pipeline here would silently drift from
// what's on screen.
export async function captureView(fuseRenderer, scene, camera, width, height, bloomSettings) {
  const { renderer } = fuseRenderer;
  // const rt = new THREE.RenderTarget(width, height, {
  //   colorSpace: THREE.SRGBColorSpace,
  //   samples: 4,
  // });
  // Post chain outputs already-encoded sRGB values — store them verbatim.
  // (An SRGBColorSpace target would encode again = washed/bright.)
  const rt = new THREE.RenderTarget(width, height);

  const prevMask = camera.layers.mask;
  camera.layers.disable(3); // hide selection wireframe/box
  // Scene passes size from the renderer's drawing buffer, not the bound RT —
  // resize so a 2x capture actually renders at 2x instead of upscaling.
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);
  const prevPixelRatio = renderer.getPixelRatio();

  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setRenderTarget(rt);
    // Fresh pipeline per capture — a shared pipeline's scene pass updates
    // only once per animation frame, so reusing the viewport's composites
    // the LAST frame's texture (stale size, editor overlays baked in).
    const post = buildPostPipeline(fuseRenderer, scene, camera, bloomSettings);
    post.render();
    post.dispose?.();

    renderer.setRenderTarget(null);
    // Restore size before the async readback so any animation-loop frame
    // that interleaves renders at the correct canvas size
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);

    const pixels = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    // imageData.data.set(pixels);
    const rowBytes = width * 4;
    if (pixels.length === rowBytes * height) {
      imageData.data.set(pixels);
    } else {
      // Padded rows (WebGPU 256-byte row alignment) — copy row by row
      const stride = Math.ceil(rowBytes / 256) * 256;
      for (let y = 0; y < height; y++) {
        imageData.data.set(pixels.subarray(y * stride, y * stride + rowBytes), y * rowBytes);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    camera.layers.mask = prevMask;
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
    renderer.setRenderTarget(null);
    rt.dispose();
  }
}