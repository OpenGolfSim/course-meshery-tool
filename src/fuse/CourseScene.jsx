// src/fuse/CourseScene.jsx
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { vec3, float, texture as tslTexture, uv } from 'three/tsl';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import CameraControls from 'camera-controls';
import pMap from 'p-map';
import {
  CourseLight,
  TreePlanter,
  MeshLoader,
  FuseRenderer,
  VolumetricClouds,
  GrassBlades,
  FlagStick,
  SkyBox,
  OceanSurface
} from '@opengolfsim/fuse';
import perlinNoise from '@opengolfsim/fuse/src/images/perlinnoise.webp'
import { loadTexture, getNoiseTexture, getGrainTexture, buildSingleLayer, buildSurfaceMaterial, rebuildBlendMaterial } from './surfaces';
import { positionsToMaskData, heightmapToMesh, maskSizeOf } from '../utils/treeMask';
import { useProject } from '../contexts/Project';
import { RESOURCES_FILE_PROTOCOL } from '../constants';
import { TEXTURE_MAP } from '../lib/textures';
import { captureLightmap, captureMap, captureView, buildPostPipeline } from './captureMap';
import { sunDirectionFromAngles } from '../utils/sun';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

CameraControls.install({ THREE });

// ─── Component ───────────────────────────────────────────────────────

// const yieldToMain = () => new Promise(r => setTimeout(r, 0));
const yieldToMain = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

const qualityLevel = 2;

export default function CourseScene({
  ref,
  meshDataState,
  heightMap,
  sunSettings,
  skySettings,
  oceanSettings,
  worldSize = 1000,
  onSelect,
  selectedLayer,
  onLoadingChange
}) {
  const { project } = useProject();
  const containerRef  = useRef();
  const canvasRef  = useRef();
  const cameraRef = useRef();
  const controlsRef = useRef();
  const sceneRef = useRef();      // { renderer, scene, camera, controls, meshLoader }
  const lightRef = useRef();      // { renderer, scene, camera, controls, meshLoader }
  const planterRef = useRef(null);
  const grassAssets = useRef();
  const surfacesRef = useRef([]);    // [{ mesh, geometry, material }] for cleanup
  const waterRef = useRef([]);
  const grassRef = useRef([]);
  const oceanRef = useRef(null);
  const flagsRef = useRef([]);
  const [rendererReady, setRendererReady] = useState(false);
  const [surfacesLoaded, setSurfacesLoaded] = useState(false);
  const [treesLoaded, setTreesLoaded] = useState(false);
  const [surfaceVersion, setSurfaceVersion] = useState(0);
  const cloudsRef     = useRef(null);
  const selectionRef  = useRef(null);   // { wireframuseImperativeHandlee, box } meshes
  const raycasterRef  = useRef(new THREE.Raycaster());
  const pointerRef    = useRef(new THREE.Vector2());
  const lightmapPreviewRef = useRef(null); // THREE.Texture while preview active
  const bakingRef = useRef(false);         // suppress editor frames mid-bake
  const blendRebuildTimer = useRef(null);
  const grassRebuildTimer = useRef(null);
  // const envTextureRef = useRef(null);
  const skyboxRef = useRef(null);
  const hdriParamsRef = useRef({ intensity: 1, rotation: 0 });

  // Project-derived config for surface builders — ref so imperative
  // handles (refreshLayer) always read current values
  const surfaceCtxRef = useRef({ surfaces: {}, sun: {} });

  useEffect(() => {
    surfaceCtxRef.current = {
      surfaces: project?._surfaces || {},
      sun: project?.scene?.sun || {},
    };
  }, [project?._surfaces, project?.scene?.sun]);

  const runLightmapBake = useCallback(async (size = 2048) => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { fuseRenderer, scene } = ctx;

    const { elevation = 40, azimuth = 225 } = project.scene?.sun ?? {};
    const sunDirection = sunDirectionFromAngles(elevation, azimuth);
    const toHide = [
      cloudsRef.current?.object,
      ...grassRef.current.map(g => g.object),
      ...waterRef.current.map(s => s.water),
    ].filter(Boolean);

    bakingRef.current = true;
    try {
      const dataUrl = await captureLightmap(
        fuseRenderer.renderer, scene, worldSize, sunDirection, toHide, size, planterRef.current
      );
      if (!dataUrl) return;

      // Clear previous preview, swap in new texture
      for (const { mesh } of surfacesRef.current) {
        if (mesh.material?.aoMap) { mesh.material.aoMap = null; mesh.material.needsUpdate = true; }
      }
      lightmapPreviewRef.current?.dispose();

      const tex = await new THREE.TextureLoader().loadAsync(dataUrl);
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.channel = 1;
      tex.flipY = false; // match FUSE's createImageBitmap path
      tex.needsUpdate = true;
      lightmapPreviewRef.current = tex;

      for (const { mesh } of surfacesRef.current) {
        const pos = mesh.geometry?.attributes.position;
        if (!pos || !mesh.material?.isMeshStandardMaterial) continue;
        const uv1 = new Float32Array(pos.count * 2);
        for (let i = 0, j = 0; i < pos.count; i++, j += 2) {
          uv1[j] = pos.getX(i) / worldSize;
          uv1[j + 1] = pos.getZ(i) / worldSize; // mirror any flip you settled on in FUSE
        }
        mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
        mesh.material.aoMap = tex;
        mesh.material.aoMapIntensity = 1.0;
        mesh.material.needsUpdate = true;
      }
    } finally {
      bakingRef.current = false;
    }
  }, [worldSize, project.scene?.sun]);

  useImperativeHandle(ref, () => ({
    async capture(size = 512) {
      const ctx = sceneRef.current;
      if (!ctx) return null;
      const { fuseRenderer, scene } = ctx;

      const toHide = [
        cloudsRef.current?.object,
        ...grassRef.current.map(g => g.object),
      ].filter(Boolean);

      const waterSwaps = waterRef.current.map(surface => ({
        mesh: surface.water,
        color: '#1a3534',
      }));
      if (oceanRef.current) {
        waterSwaps.push({ mesh: oceanRef.current.water, color: '#042a34' });
      }
      return captureMap(fuseRenderer.renderer, scene, worldSize, toHide, waterSwaps, size, planterRef.current);
    },
    async captureView(scale = 2) {
      const ctx = sceneRef.current;
      if (!ctx) return null;
      const { fuseRenderer, scene, camera } = ctx;
      // const w = Math.round(canvasRef.current.clientWidth * scale);
      // WebGPU readback rows pad to 256 bytes — keep width a multiple of 64
      const w = Math.round(canvasRef.current.clientWidth * scale) & ~63;
      const h = Math.round(canvasRef.current.clientHeight * scale);
      return captureView(fuseRenderer, scene, camera, w, h, project?.scene?.bloom);
    },    
    async captureLightmap(size = 4096) {
      const ctx = sceneRef.current;
      if (!ctx) return null;
      const { fuseRenderer, scene } = ctx;

      const { elevation = 40, azimuth = 225 } = project.scene?.sun ?? {};
      const sunDirection = sunDirectionFromAngles(elevation, azimuth);

      // Hide non-shadow-relevant objects: clouds, grass blades, water
      const toHide = [
        cloudsRef.current?.object,
        ...grassRef.current.map(g => g.object),
        ...waterRef.current.map(s => s.water),
      ].filter(Boolean);

      return captureLightmap(fuseRenderer.renderer, scene, worldSize, sunDirection, toHide, size, planterRef.current);
    },
    async refreshLayer(layerId) {
      const ctx = sceneRef.current;
      if (!ctx) return;
      const { scene, fuseRenderer } = ctx;

      const layer = project._meshes?.find(l => l.id === layerId);
      if (!layer) return;

      // Remove old entry
      const idx = surfacesRef.current.findIndex(e => e.mesh.name === layerId);
      if (idx !== -1) {
        const old = surfacesRef.current[idx];
        scene.remove(old.mesh);
        old.geometry.dispose();
        old.material.dispose();
        surfacesRef.current.splice(idx, 1);
      }

      // Remove old water surface if it was one
      const waterIdx = waterRef.current.findIndex(s => s.water.name === layerId);
      if (waterIdx !== -1) waterRef.current.splice(waterIdx, 1);

      // Remove old grass if it was rough
      const grassIdx = grassRef.current.findIndex(g => {
        const match = g.object?.parent === scene;
        return match;
      });
      // (grass cleanup is tricky — for now, rough layers do a full rebuild)

      // Build replacement
      const entry = await buildSingleLayer(layer, scene, {
        water: waterRef.current,
        grass: grassRef.current,
        grassAssets: grassAssets.current,
      }, fuseRenderer, surfaceCtxRef.current);

      if (entry) {
        surfacesRef.current.push(entry);
      }
      setSurfaceVersion(v => v + 1);
    },
  }), [worldSize]);

  const onCanvasClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    pointerRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);
    const meshes = surfacesRef.current.map(s => s.mesh);
    const hits = raycasterRef.current.intersectObjects(meshes, false);
    console.log(hits);
    const layer = hits.length > 0 ? project._meshes.find(l => l.id === hits[0].object.name) : null;
    if (onSelect) onSelect(layer);
  }, [project._meshes, onSelect]);

  const onCanvasDblClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    pointerRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);
    const meshes = surfacesRef.current.map(s => s.mesh);
    const hits = raycasterRef.current.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const layer = project._meshes?.find(l => l.id === hits[0].object.name);
      if (onSelect) onSelect(layer);

      const bbox = new THREE.Box3().setFromObject(hits[0].object);
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.z);
      controlsRef.current.setLookAt(
        center.x + maxDim * 0.5,
        center.y + maxDim * 0.7,
        center.z + maxDim * 0.5,
        center.x, center.y, center.z,
        true
      );

      // controls.fitToBox(new THREE.Box3().setFromObject(hits[0].object), true);
    }
  }, [project._meshes, onSelect]);

  const removeClouds = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx || !cloudsRef.current) return;
    ctx.scene.remove(cloudsRef.current.object);
    cloudsRef.current.object.geometry.dispose();
    cloudsRef.current.material.dispose();
    cloudsRef.current = null;
  }, []);  

  const rebuildClouds = useCallback((cloudSettings) => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(cloudSettings.skyColor);
    removeClouds();
    const clouds = new VolumetricClouds(camera, {
      radius: 800,
      skyColor: new THREE.Color(cloudSettings.skyColor),
      cloudColor: new THREE.Color(cloudSettings.cloudColor),
      fogColor: new THREE.Color(cloudSettings.fogColor),
      density: cloudSettings.density,
      scale: 4,
    });
    scene.add(clouds.object);
    cloudsRef.current = clouds;
  }, [removeClouds]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !rendererReady || !skySettings) {
      console.log('Sky not ready yet');
      return;
    }
    const { scene, camera } = ctx;
    
    if (lightRef.current) {
      scene.remove(lightRef.current);
    }
    scene.environment = null;
    skyboxRef.current?.dispose();   // removes mesh, clears scene.environment, disposes texture
    skyboxRef.current = null;

    let lightSettings = {
      color: sunSettings?.color,
      qualityLevel,
      ambient: { enabled: true },
      directional: { enabled: true },
    }
    let cancelled = false;

    if (skySettings.type === 'clouds') {
      rebuildClouds(skySettings.clouds);
    } else if (skySettings.type === 'hdri' && skySettings.hdri?.url) {
      removeClouds();
      fetch(skySettings.hdri.url)
        .then(res => res.arrayBuffer())
        .then(async (buffer) => {
          if (cancelled) return;
          const skyBox = new SkyBox();
          await skyBox.load(scene, buffer, {
            rotation: hdriParamsRef.current.rotation ?? 0,
            environmentIntensity: hdriParamsRef.current.environmentIntensity ?? 0.15,
            backgroundIntensity: hdriParamsRef.current.backgroundIntensity ?? 1,
          });
          if (cancelled) { skyBox.dispose(); return; }
          skyboxRef.current = skyBox;
        });

    } else {
      console.warn('Unknown sky type...', skySettings);
    }

    lightRef.current = new CourseLight(lightSettings);
    scene.add(lightRef.current);
    return () => { cancelled = true; };

  }, [
    skySettings.type,
    skySettings.hdri?.url,
    worldSize,
    sunSettings?.color,
    rendererReady,
    rebuildClouds,
    removeClouds
  ]);

  // Cheap param updates — no texture reload
  useEffect(() => {
    hdriParamsRef.current = {
      intensity: skySettings?.hdri?.intensity,
      rotation: skySettings?.hdri?.rotation,
    };

    if (skySettings?.type !== 'hdri' || !skyboxRef.current) return;
    skyboxRef.current.setRotation(skySettings.hdri.rotation);
    skyboxRef.current.setEnvironmentIntensity(skySettings.hdri.environmentIntensity);
    skyboxRef.current.setBackgroundIntensity(skySettings.hdri.backgroundIntensity);

  }, [
    skySettings?.hdri?.environmentIntensity,
    skySettings?.hdri?.backgroundIntensity,
    skySettings?.hdri?.rotation,
    skySettings?.type
  ]);

  // Projection rebuild — reuses decoded texture, debounced
  useEffect(() => {
    if (skySettings?.type !== 'hdri' || !skyboxRef.current) return;
    const t = setTimeout(() => {
      skyboxRef.current?.buildProjection({
        height: skySettings.hdri?.height ?? 10,
        radius: skySettings.hdri?.radius ?? worldSize * 2.5,
        center: { x: worldSize / 2, z: worldSize / 2 },
      });
    }, 250);
    return () => clearTimeout(t);
  }, [skySettings?.type, skySettings?.hdri?.height, skySettings?.hdri?.radius, worldSize]);

  // Rebuild clouds when cloud values change — debounced, clouds only
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !rendererReady || skySettings?.type !== 'clouds') return;

    const t = setTimeout(() => {
      rebuildClouds(skySettings.clouds);

    }, 250);

    return () => clearTimeout(t);
  }, [skySettings.type, skySettings.clouds, rendererReady, rebuildClouds]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    canvasRef.current = canvas;
    
    const fuseRenderer = new FuseRenderer({
     canvas,
     container,
     adaptive: false,
    //  antialias: true,
     renderMode: 'webgpu',
     qualityLevel,
   });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(skySettings.clouds.skyColor);

    const camera = new THREE.PerspectiveCamera(
      30, container.clientWidth / container.clientHeight, 0.5, 5000
    );
    cameraRef.current = camera;
    camera.layers.enable(2);
    camera.layers.enable(3); // editor overlays (selection wireframe/box)
    // fuseRenderer.setupPostProcessing(scene, camera);
    // Editor-built post chain: same structure as FUSE's setupPostProcessing
    // but bloom comes from project scene settings. Assigned to the
    // renderer's public pipeline slot so fuseRenderer.render() uses it.
    fuseRenderer.pipeline = buildPostPipeline(fuseRenderer, scene, camera, project?.scene?.bloom);
    const controls = new CameraControls(camera, canvas);

    controls.infinityDolly = true;
    controls.dollyToCursor = true;
    controlsRef.current = controls;

    const center = worldSize / 2;
    controls.setLookAt(
      center + 50,
      30,
      center + 50,
      center, 5, center,
      false
    );

    // const outerGeometry = new THREE.PlaneGeometry(10000, 10000, 1, 1);
    // // const map = loadTexture(TEXTURE_MAP.base.baseColor, THREE.SRGBColorSpace);
    // const map = loadTexture(TEXTURE_MAP.base.baseColor, THREE.SRGBColorSpace).clone();
    // map.wrapS = THREE.RepeatWrapping;
    // map.wrapT = THREE.RepeatWrapping;
    // map.repeat.set(500, 500);
    // map.needsUpdate = true;
    // const outerMaterial = new THREE.MeshStandardMaterial({ color: TEXTURE_MAP.base.tint ?? 0x353f17, map });


    // const plane = new THREE.Mesh(outerGeometry, outerMaterial);
    // plane.rotation.x = -Math.PI / 2;
    // plane.position.set(0, -5, 0);
    // scene.add(plane);


  
    sceneRef.current = { fuseRenderer, scene, camera, controls, meshLoader: null };

    console.log(`${Date.now()} - Init renderer`);
    fuseRenderer.init().then(async () => {
      console.log(`${Date.now()} - Render initialized`);

      grassAssets.current = await GrassBlades.loadAssets({
        // modelPath: grassBladesModel,
        noisePath: perlinNoise
      });
      const ktx2Path = `${RESOURCES_FILE_PROTOCOL}://basis/`;
      const meshLoader = new MeshLoader(fuseRenderer, undefined, { ktx2Path });
      sceneRef.current.meshLoader = meshLoader;
      console.log(`${Date.now()} - MeshLoader created, starting compileAsync`);

      setRendererReady(true);
      console.log(`${Date.now()} - setRendererReady called`);
      setTimeout(() => console.log(`${Date.now()} - event loop unblocked`), 0);
    });

    const obs = new ResizeObserver(() => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    });
    obs.observe(container);

    // // if ocean in scene settings...
    // oceanRef.current = new OceanSurface({
    //   size: 4000,
    //   uvTiling: [2, 2],
    //   yOffset: -15,
    //   depthRange: 0.1,
    //   envMapIntensity: 0.1,
    //   opacity: 0.99,
    //   shallowColor: new THREE.Color('#185f57'),
    //   deepColor: new THREE.Color('#042a34'),
    // });
    // scene.add(oceanRef.current.water);

    return () => {
      fuseRenderer.renderer.setAnimationLoop(null);
      fuseRenderer.renderer.dispose();
      controls.dispose();
      obs.disconnect();
      container.removeChild(canvas);
    };
  }, []);

  // ─── Infinite ocean: add/remove per scene setting ──────────────────
  const removeOcean = useCallback(() => {
    const ctx = sceneRef.current;
    const ocean = oceanRef.current;
    if (!ctx || !ocean) return;
    ctx.scene.remove(ocean.water);
    ocean.water.geometry.dispose();
    ocean.material.dispose();
    oceanRef.current = null;
  }, []);

   // Build/remove on the enabled flag only
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !rendererReady) return;

    if (!oceanSettings?.enabled) {
      removeOcean();
      return;
    }
    if (oceanRef.current) return; // already built
    const ocean = new OceanSurface({
      size: 4000,
      uvTiling: [2, 2],
      yOffset: oceanSettings.yOffset ?? -15,
      depthRange: 0.1,
      envMapIntensity: 0.1,
      opacity: 0.99,
      shallowColor: new THREE.Color('#185f57'),
      deepColor: new THREE.Color('#042a34'),
    });
    ctx.scene.add(ocean.water);
    if (ctx.fuseRenderer.environment) {
      ocean.updateEnvironment(ctx.fuseRenderer.environment);
    }
    oceanRef.current = ocean;
  }, [oceanSettings?.enabled, rendererReady, removeOcean]);

  // Cheap yOffset update — no rebuild (mirrors constructor's sign handling)
  useEffect(() => {
    const ocean = oceanRef.current;
    if (!ocean || !oceanSettings?.enabled) return;
    ocean.water.position.y = -(oceanSettings.yOffset ?? 0);
  }, [oceanSettings?.yOffset, oceanSettings?.enabled]);
  //   // Debounced rebuild while dragging yOffset
  //   const t = setTimeout(() => {
  //     removeOcean();
  //     const ocean = new OceanSurface({
  //       size: 4000,
  //       uvTiling: [2, 2],
  //       yOffset: oceanSettings.yOffset ?? -15,
  //       depthRange: 0.1,
  //       envMapIntensity: 0.1,
  //       opacity: 0.99,
  //       shallowColor: new THREE.Color('#185f57'),
  //       deepColor: new THREE.Color('#042a34'),
  //     });
  //     ocean.water.renderOrder = -1; // blend under grass/trees, same as lakes
  //     ctx.scene.add(ocean.water);
  //     if (ctx.fuseRenderer.environment) {
  //       ocean.updateEnvironment(ctx.fuseRenderer.environment);
  //     }
  //     oceanRef.current = ocean;
  //   }, 250);

  //   return () => clearTimeout(t);
  // }, [oceanSettings?.enabled, oceanSettings?.yOffset, rendererReady, removeOcean]);  

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dblclick', onCanvasDblClick);
    return () => {
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('dblclick', onCanvasDblClick);
    };
  }, [onCanvasClick, onCanvasDblClick]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !surfacesLoaded) return;

    const hasTrees = project.trees?.length > 0 && heightMap?.data;
    if (hasTrees && !treesLoaded) return;

    const { fuseRenderer, scene, camera, controls } = ctx;
    const timer = new THREE.Timer();

    fuseRenderer.renderer.setAnimationLoop(() => {
      if (bakingRef.current) return; // don't draw white-out/LOD0 bake state
      timer.update();
      const delta = timer.getDelta();
      controls.update(delta);

      planterRef.current?.update(camera, false);
      cloudsRef.current?.update();
      for (const surface of waterRef.current) {
        surface.update();
      }
      for (const surface of grassRef.current) {
        surface.update(delta, camera);
      }
      for (const flag of flagsRef.current) {
        flag.update(delta);
      }
      oceanRef.current?.update();
      fuseRenderer.render(scene, camera);
    });

    return () => fuseRenderer.renderer.setAnimationLoop(null);

  }, [surfacesLoaded, treesLoaded]);

  // ─── Lightmap preview bake: on load and whenever the scene changes ──
  useEffect(() => {
    if (!surfacesLoaded) return;
    const hasTrees = project.trees?.length > 0 && heightMap?.data;
    if (hasTrees && !treesLoaded) return;

    // Debounce: refreshLayer bumps surfaceVersion per edit — coalesce bursts.
    const t = setTimeout(async () => {
      onLoadingChange?.({ phase: 'lightmap' });
      try {
        await runLightmapBake(2048);
      } finally {
        onLoadingChange?.({ phase: 'ready' });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [surfacesLoaded, treesLoaded, surfaceVersion, runLightmapBake]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const { scene } = ctx;

    // Clear previous
    const prev = selectionRef.current;
    if (prev) {
      scene.remove(prev.wireframe);
      scene.remove(prev.box);
      prev.wireframe.material.dispose();
      prev.box.geometry.dispose();
      prev.box.material.dispose();
      selectionRef.current = null;
    }

    console.log('GRID selectedLayer?.id', selectedLayer);
    if (!selectedLayer?.layer?.id) return;

    const entry = surfacesRef.current.find(s => s.mesh.name === selectedLayer.layer.id);
    if (!entry) {
      console.warn('No layer entry found!');
      return;
    }

    const wireGeo = new THREE.WireframeGeometry(entry.geometry);
    const wireMat = new THREE.LineBasicNodeMaterial({ transparent: true, depthTest: true });
    wireMat.colorNode = vec3(1, 1, 0);
    wireMat.opacityNode = float(0.05);
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    wireframe.position.y = 0.01;

    wireframe.raycast = () => {};
    wireframe.layers.set(3); // editor-overlay layer: invisible to capture cameras
    scene.add(wireframe);

    // Bounding box
    entry.geometry.computeBoundingBox();
    const bbox = entry.geometry.boundingBox;
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
    const boxMat = new THREE.LineBasicMaterial({ color: 'cyan', depthTest: false });
    const box = new THREE.LineSegments(boxGeo, boxMat);
    box.position.copy(center);
    box.raycast = () => {};
    box.layers.set(3); // editor-overlay layer: invisible to capture cameras
    scene.add(box);

    selectionRef.current = { wireframe, box };

    return () => {
      scene.remove(wireframe);
      scene.remove(box);
      wireMat.dispose();
      wireGeo.dispose();
      boxGeo.dispose();
      boxMat.dispose();
      selectionRef.current = null;
    };
  }, [selectedLayer, surfacesLoaded, surfaceVersion]);

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !rendererReady) return;
    if (!meshDataState?.generated) return;

    const { scene, fuseRenderer } = ctx;
    const layers = project._meshes;
    if (!layers?.length) return;

    let cancelled = false;
    console.log(`${Date.now()} - surface meshes useEffect called`);

    (async () => {
      onLoadingChange?.({ phase: 'surfaces', loaded: 0, total: layers.length });
      console.log(`${Date.now()} - Start loading meshes`);
      fuseRenderer.generateEnvironment(scene);

      await pMap(layers, async (layer, i) => {
      // for (let i = 0; i < layers.length; i++) {
        if (cancelled) return;

        const entry = await buildSingleLayer(layer, scene, {
          water: waterRef.current,
          grass: grassRef.current,
          grassAssets: grassAssets.current,
        }, fuseRenderer, surfaceCtxRef.current);
        if (!entry) return;

        if (cancelled) {
          // Built after teardown started — dispose immediately
          scene.remove(entry.mesh);
          entry.geometry.dispose();
          entry.material.dispose();
          return;
        }
        surfacesRef.current.push(entry);

        onLoadingChange?.({ phase: 'surfaces', loaded: i + 1, total: layers.length });
        await yieldToMain();

      }, { concurrency: 12 });

      console.log(`${Date.now()} - Finished loading meshes`);
      
      oceanRef.current?.updateEnvironment(fuseRenderer.environment);
      // Flag sticks — static per course; created once terrain exists,
      // torn down with the meshes below
      console.log('FLAGS', JSON.stringify(project.holes.entries()));
      if (!cancelled && project.holes) {
        const waterMeshes = new Set(waterRef.current.map((w) => w.water));
        const groundMeshes = surfacesRef.current
          .map((s) => s.mesh)
          .filter((m) => !waterMeshes.has(m));
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        for (const hole of project.holes.values()) {
          const pin = hole?.pin?.position;
          if (!pin) continue;
          // pin.y is world Z (map coords); elevation from terrain raycast —
          // same convention as FUSE's runtime loader
          raycaster.set(new THREE.Vector3(pin.x, 5000, pin.y), down);
          const hits = raycaster.intersectObjects(groundMeshes);
          const position = new THREE.Vector3(pin.x, 10, pin.y);
          let surfaceNormal;
          if (hits.length > 0) {
            position.y = hits[0].point.y;
            surfaceNormal = hits[0].face
              ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld)
              : undefined;
          }
          const flag = new FlagStick(position, `${hole.number}`, undefined, surfaceNormal);
          scene.add(flag.object);
          flagsRef.current.push(flag);
        }
      }

      if (!cancelled) {
        setSurfacesLoaded(true);
        onLoadingChange?.({ phase: 'ready', loaded: layers.length, total: layers.length });
      }
    })();

    return () => {
      cancelled = true;
      console.log(`${Date.now()} - Mesh loading cancelled`);
      waterRef.current = [];
      for (const flag of flagsRef.current) {
        scene.remove(flag.object);
        flag.flag.geometry.dispose();
        flag.flag.material.dispose();
        flag.stick.geometry.dispose();
        flag.stick.material.dispose();
      }
      flagsRef.current = [];

      for (const { mesh, geometry, material } of surfacesRef.current) {
        scene.remove(mesh);
        geometry.dispose();
        material.dispose();
      }
      surfacesRef.current = [];
    };
  }, [meshDataState, project._meshes, rendererReady]);

  useEffect(() => {
    console.log('[state] project._meshes changed!', project._meshes);
  }, [project._meshes]);

  useEffect(() => {
    console.log('[state] meshDataState changed!', project._meshes);
  }, [meshDataState]);

  // Live-apply resolved surface configs (currently: tint) to built materials.
  // Newly built materials read surfaceMap at build time.
  useEffect(() => {
    const surfaces = project?._surfaces || {};
    const scene = sceneRef.current?.scene;
    if (!scene) return;
    const blendRebuilds = [];
    const grassRebuilds = [];
    scene.traverse((obj) => {
      // Blend meshes bake tints into the shader; collect the ones whose
      // effective tints changed for a material-only rebuild below.
      const rb = obj.userData?.blendRebuild;
      if (rb) {
        const nSurface = rb.layer.neighbor || 'rough';
        // const base = (surfaceMap[rb.layer.surface] ?? TEXTURE_MAP[rb.layer.surface])?.tint;
        // const nTint = (surfaceMap[nSurface] ?? TEXTURE_MAP[nSurface])?.tint;
        const base = (surfaces[rb.layer.surface] ?? TEXTURE_MAP[rb.layer.surface])?.tint;
        const nTint = (surfaces[nSurface] ?? TEXTURE_MAP[nSurface])?.tint;        
        if (obj.userData.appliedTints?.base !== base || obj.userData.appliedTints?.neighbor !== nTint) {
          blendRebuilds.push({ obj, rb, nSurface, base, nTint });
        }
        return;
      }

      const mat = obj.material;
      const surface = mat?.userData?.surface;
      if (!surface) return;
      // const cfg = surfaceMap[surface];
      const cfg = surfaces[surface];
      // Grass shader params are baked at construction — config change
      // requires a material rebuild (debounced below)
      const wantGrass = JSON.stringify(cfg?.grass ?? null);
      if (mat.userData.appliedGrass !== undefined && mat.userData.appliedGrass !== wantGrass) {
        grassRebuilds.push({ obj, surface });
      }

      if (cfg?.tint) {
        mat.color.set(cfg.tint);
        mat.userData.tint = new THREE.Color(cfg.tint);
      }

      // Live tile-size: rescale baked UVs in place (sanitized same as build)
      const tile = Number(cfg?.tileSize);
      const geo = obj.geometry;
      const applied = geo?.userData?.appliedTileSize;
      if (tile > 0 && applied > 0 && applied !== tile) {
        const uvAttr = geo.getAttribute('uv');
        if (uvAttr) {
          const scale = applied / tile;
          for (let i = 0; i < uvAttr.count; i++) {
            uvAttr.setXY(i, uvAttr.getX(i) * scale, uvAttr.getY(i) * scale);
          }
          uvAttr.needsUpdate = true;
        }
        geo.userData.appliedTileSize = tile;
        if (obj.userData.tileSize) obj.userData.tileSize = tile;
      }
      // Live texture swap (custom textures selected/cleared)
      if (cfg?.baseColor && mat.userData.appliedMap !== cfg.baseColor) {
        mat.map = loadTexture(cfg.baseColor, THREE.SRGBColorSpace);
        mat.userData.appliedMap = cfg.baseColor;
        mat.needsUpdate = true;
      }
      if (cfg?.normal && mat.userData.appliedNormal !== cfg.normal) {
        mat.normalMap = loadTexture(cfg.normal);
        mat.userData.appliedNormal = cfg.normal;
        mat.needsUpdate = true;
      }

    });

    // Grass blades sample the ground tint via a uniform — update in place
    for (const grass of grassRef.current) {
      const tint = surfaces[grass.surface]?.tint;
      if (tint) grass.terrainTint = tint;
    }
    if (grassRebuilds.length) {
      clearTimeout(grassRebuildTimer.current);
      grassRebuildTimer.current = setTimeout(async () => {
        const grainTex = await getGrainTexture();
        for (const { obj, surface } of grassRebuilds) {
          const layer = project._meshes?.find((l) => l.id === obj.name);
          const old = obj.material;
          obj.material = buildSurfaceMaterial(surface, layer?.color, grainTex, surfaceCtxRef.current);
          // Preserve lightmap preview across the swap
          obj.material.aoMap = old.aoMap;
          obj.material.aoMapIntensity = old.aoMapIntensity;
          old.dispose();
          const rec = surfacesRef.current?.find((r) => r.mesh === obj);
          if (rec) rec.material = obj.material;
        }
      }, 300);
    }
    if (!blendRebuilds.length) return;
    let canceled = false;

    // Debounced: shader recompiles are too heavy for per-drag-tick rebuilds
    clearTimeout(blendRebuildTimer.current);
    blendRebuildTimer.current = setTimeout(async () => {

      const noiseTex = await getNoiseTexture();
      if (canceled) return;
      for (const { obj, rb, nSurface, base, nTint } of blendRebuilds) {
        rebuildBlendMaterial(obj, rb, noiseTex, surfaceCtxRef.current);
        obj.userData.appliedTints = { base, neighbor: nTint };
        // Keep the cleanup registry pointing at the live material
        const rec = surfacesRef.current?.find((r) => r.mesh === obj);
        if (rec) rec.material = obj.material;
      }

    }, 300);
    return () => { canceled = true; };
  }, [project?._surfaces]);


  // ─── Tree planting ─────────────────────────────────────────────────
  useEffect(() => {
    const ctx = sceneRef.current;
    // if (!ctx?.meshLoader || !rendererReady) return;
    if (!ctx?.meshLoader || !rendererReady || !surfacesLoaded) return;
    console.log(`${Date.now()} - Tree planting useEffect`);
    const { scene, meshLoader } = ctx;
    const treeLayers = project.trees;
    // const heightScale = project.stats?.heightScale ?? project.stats?.relief ?? 10;

    if (!treeLayers?.length) return;

    let cancelled = false;

    (async () => {
      onLoadingChange?.({ phase: 'trees', loaded: 0, total: treeLayers.length });

      // Raycast against the actual course geometry, not a heightmap proxy.
      // Exclude water surfaces so trees don't plant on lakes/rivers.
      const waterMeshes = new Set(waterRef.current.map((w) => w.water));
      const groundMeshes = surfacesRef.current
        .map((s) => s.mesh)
        .filter((m) => !waterMeshes.has(m));
      // One-time BVH build per geometry; makes per-tree raycasts ~log(n)
      for (const m of groundMeshes) {
        if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();
      }
      const planter = new TreePlanter({
        scene,
        worldSize,
        groundMeshes,
      });

      for (let i = 0; i < treeLayers.length; i++) {
        if (cancelled) return;
        const layer = treeLayers[i];
        if (!layer.treeConfigs?.length || !layer.positions?.length) continue;

        // Load models one at a time, yielding between each
        const configs = [];
        for (const t of layer.treeConfigs) {
          if (cancelled) return;
          const treeScene = await meshLoader.load(t.url);
          const meshGroup = TreePlanter.loadTree(treeScene);
          configs.push({
            ...t,
            lodDistances: t.lodDistances ?? [80, 160],
            meshGroup,
          });
          await yieldToMain();
        }

        const maskData = positionsToMaskData(layer.positions, maskSizeOf(layer));
        planter.plantFromMask(configs, maskData, layer.randomSeed ?? 12345);

        onLoadingChange?.({ phase: 'trees', loaded: i + 1, total: treeLayers.length });
        await yieldToMain();
      }

      if (cancelled) return;

      // scene.remove(groundMesh);
      // groundMesh.geometry.dispose();
      // groundMesh.material.dispose();
      
      console.log(`${Date.now()} - Tree planting done`);
      planterRef.current = planter;
      setTreesLoaded(true);

      onLoadingChange?.({ phase: 'ready' });
    })();

    return () => {
      cancelled = true;
      setTreesLoaded(false);
      const planter = planterRef.current;
      if (planter) {
        planter.clear();
        planter.treeGroup.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            child.material?.dispose();
          }
        });
        scene.remove(planter.treeGroup);
        planterRef.current = null;
      }
    };
  // }, [project.trees, heightMap, worldSize, rendererReady]);
  }, [project.trees, worldSize, rendererReady, surfacesLoaded]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}