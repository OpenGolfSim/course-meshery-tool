// src/fuse/CourseScene.jsx
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three/webgpu';
import { vec3, float, texture as tslTexture, uv } from 'three/tsl';
import CameraControls from 'camera-controls';
import pMap from 'p-map';
import {
  CourseLight,
  TreePlanter,
  MeshLoader,
  LakeSurface,
  RiverSurface,
  FuseRenderer,
  VolumetricClouds,
  GrassShader,
  SandMaterial
} from '@opengolfsim/fuse';
import perlinNoise from '@opengolfsim/fuse/src/images/perlinnoise.webp'
import { positionsToMaskData, heightmapToMesh } from '../utils/treeMask';
import { useProject } from '../contexts/Project';
import { RESOURCES_FILE_PROTOCOL } from '../constants.js';
import { TEXTURE_MAP } from '../lib/textures.js';
import { captureMap } from './captureMap';

// Shared noise texture — loaded once, used by all blended surfaces
let noiseTexturePromise = null;
function getNoiseTexture() {
  if (!noiseTexturePromise) {
    noiseTexturePromise = new Promise((resolve) => {
      const tex = new THREE.TextureLoader().load(perlinNoise, () => resolve(tex));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
    });
  }
  return noiseTexturePromise;
}

CameraControls.install({ THREE });

// ─── Material / geometry helpers ─────────────────────────────────────
const textureCache = new Map();
const textureLoader = new THREE.TextureLoader();

function loadTexture(url, colorSpace = THREE.NoColorSpace) {
  const fullUrl = `${RESOURCES_FILE_PROTOCOL}://textures/${url}`;
  if (textureCache.has(fullUrl)) return textureCache.get(fullUrl);
  const tex = textureLoader.load(fullUrl);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (colorSpace !== THREE.NoColorSpace) tex.colorSpace = colorSpace;
  textureCache.set(fullUrl, tex);
  return tex;
}

function buildSurfaceMaterial(surfaceName, fallbackHex) {
  const cfg = TEXTURE_MAP[surfaceName];
  // const mat = new THREE.MeshStandardNodeMaterial();
  const mat = new THREE.MeshStandardMaterial();
  mat.roughness = cfg?.roughnessFactor ?? 0.9;

  if (cfg?.baseColor) {
    const tex = loadTexture(cfg.baseColor, THREE.SRGBColorSpace);
    mat.map = tex;
    
    // let colorNode = tslTexture(tex, uv());
    if (cfg?.tint) {
      // const t = new THREE.Color(cfg.tint);
      // colorNode = colorNode.mul(vec3(t.r, t.g, t.b));
      mat.color = new THREE.Color(cfg.tint);
    }
    // mat.colorNode = colorNode;
  } else {
    const c = new THREE.Color(`#${fallbackHex}`);
    // mat.colorNode = vec3(c.r, c.g, c.b);
    mat.userData = { baseTexture: tex, tint: cfg.tint ? new THREE.Color(cfg.tint) : null };
    mat.color = c;
  }

  if (cfg?.normal) {
    const normalMap = loadTexture(cfg.normal, THREE.SRGBColorSpace);
    mat.normalMap = normalMap;
    if (cfg?.normalScale) mat.normalScale = new THREE.Vector2(...cfg.normalScale);
  }
  if (cfg.roughnessFactor) {
    mat.roughness = cfg.roughnessFactor;
  }

  return mat;
}

function buildLayerGeometry(meshData, surfaceName) {
  const geo = new THREE.BufferGeometry();
  if (!meshData?.points || !meshData?.triangles) return geo;

  const points = meshData.points;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setIndex(meshData.triangles);

  const tile = TEXTURE_MAP[surfaceName]?.tileSize ?? 2.0;
  const uvs = new Float32Array((points.length / 3) * 2);
  for (let i = 0, j = 0; i < points.length; i += 3, j += 2) {
    uvs[j]     = points[i]     / tile;
    uvs[j + 1] = points[i + 2] / tile;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  if (meshData.normals) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.normals, 3));
  }

  geo.computeBoundingSphere();
  return geo;
}


async function buildSingleLayer(layer, scene, refs, fuseRenderer) {
  const data = await window.meshery.project.getMeshDataForLayer(layer.id);
  if (!data?.mesh) return null;

  const geometry = buildLayerGeometry(data.mesh, layer.surface);
  const isRough = layer.surface.startsWith('rough');
  const isLake = layer.surface.startsWith('plane_lake');
  const isRiver = layer.surface.startsWith('plane_river');
  const isSand = layer.surface === 'sand';
  const noiseTex = await getNoiseTexture();

  if (isLake || isRiver) {
    const baseMesh = new THREE.Mesh(geometry);
    const surface = isRiver ? new RiverSurface(baseMesh, layer.flowMap) : new LakeSurface(baseMesh);
    surface.water.name = layer.id;
    scene.add(surface.water);
    refs.water.push(surface);
    if (fuseRenderer.environment) {
      surface.updateEnvironment(fuseRenderer.environment);
    }
    return { mesh: surface.water, geometry, material: surface.material };

  } else if (data.mesh.blendMap) {
    const baseMaterial = buildSurfaceMaterial(layer.surface, layer.color);
    const mesh = new THREE.Mesh(geometry, baseMaterial);
    mesh.userData.tileSize = TEXTURE_MAP[layer.surface]?.tileSize || 2.5;

    const neighborSurface = layer.neighbor || 'rough';
    const neighborMaterial = buildSurfaceMaterial(neighborSurface, layer.color);
    const neighborMesh = new THREE.Mesh(new THREE.BufferGeometry(), neighborMaterial);
    neighborMesh.userData.tileSize = TEXTURE_MAP[neighborSurface]?.tileSize || 2.0;

    new SandMaterial(mesh, noiseTex, data.mesh.blendMap, neighborMesh,
      layer.blending || { noiseFreq: 0.3, noiseAmp: 0.15, patchy: false });

    neighborMesh.geometry.dispose();
    neighborMaterial.dispose();

    mesh.name = layer.id;
    mesh.visible = layer.visible !== false;
    scene.add(mesh);
    return { mesh, geometry, material: mesh.material };

  } else if (isRough) {
    const material = buildSurfaceMaterial(layer.surface, layer.color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = layer.id;
    mesh.visible = layer.visible !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (refs.grassAssets) {
      const grass = new GrassShader(mesh, refs.grassAssets, {
        density: 11, renderDistance: 25, cellSize: 5, lean: 0.01,
        heightVariation: 0.5, maxNewCellsPerFrame: 10,
        scaleXZ: 0.6, scaleY: 0.65, layer: 2,
      });
      scene.add(grass.mesh);
      refs.grass.push(grass);
    }
    return { mesh, geometry, material };

  } else {
    const material = buildSurfaceMaterial(layer.surface, layer.color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = layer.id;
    mesh.visible = layer.visible !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, geometry, material };
  }
}

// ─── Component ───────────────────────────────────────────────────────

// const yieldToMain = () => new Promise(r => setTimeout(r, 0));
const yieldToMain = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

const qualityLevel = 2;

export default function CourseScene({
  ref,
  meshDataState,
  heightMap,
  skySettings,
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
  const planterRef = useRef(null);
  const grassAssets = useRef();
  const surfacesRef = useRef([]);    // [{ mesh, geometry, material }] for cleanup
  const waterRef = useRef([]);
  const grassRef = useRef([]);
  const [rendererReady, setRendererReady] = useState(false);
  const [surfacesLoaded, setSurfacesLoaded] = useState(false);
  const [treesLoaded, setTreesLoaded] = useState(false);
  const [surfaceVersion, setSurfaceVersion] = useState(0);
  const cloudsRef     = useRef(null);
  const selectionRef  = useRef(null);   // { wireframe, box } meshes
  const raycasterRef  = useRef(new THREE.Raycaster());
  const pointerRef    = useRef(new THREE.Vector2());


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

      return captureMap(fuseRenderer.renderer, scene, worldSize, toHide, waterSwaps, size);
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
      }, fuseRenderer);

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
  }, [project._meshes]);

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
  }, [project._meshes]);


  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !rendererReady || !skySettings) return;
    const { scene, camera } = ctx;
    console.log("SKY SETTINGS CHANGED");
    // Update background
    scene.background = new THREE.Color(skySettings.clouds.skyColor);

    // Recreate clouds with new settings
    if (cloudsRef.current) {
      scene.remove(cloudsRef.current.object);
    }

    const clouds = new VolumetricClouds(camera, {
      radius: 800,
      skyColor: new THREE.Color(skySettings.clouds.skyColor),
      cloudColor: new THREE.Color(skySettings.clouds.cloudColor),
      fogColor: new THREE.Color(skySettings.clouds.fogColor),
      density: skySettings.clouds.density,
      scale: 4,
    });
    scene.add(clouds.object);
    cloudsRef.current = clouds;
  }, [skySettings, rendererReady]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    canvasRef.current = canvas;
    
    const fuseRenderer = new FuseRenderer({
     canvas,
     container,
     antialias: true,
     renderMode: 'webgpu',
     qualityLevel,
   });

    // renderer.renderer.setPixelRatio(window.devicePixelRatio);
    // renderer.renderer.setSize(container.clientWidth, container.clientHeight);
    // container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(skySettings.clouds.skyColor);

    const camera = new THREE.PerspectiveCamera(
      50, container.clientWidth / container.clientHeight, 0.5, 3000
    );
    cameraRef.current = camera;
    // camera.position.set(worldSize / 2, 100, worldSize / 2);
    // camera.lookAt(worldSize / 2, 0, worldSize / 2);
    camera.layers.enable(2);
    
    fuseRenderer.setupPostProcessing(scene, camera);

    const controls = new CameraControls(camera, canvas);

    controls.infinityDolly = true;
    controls.dollyToCursor = true;
    controlsRef.current = controls;

    // const center = new THREE.Vector3(worldSize / 2, 0, worldSize / 2);
    // const size = new THREE.Vector3(worldSize, 10, worldSize);
    // const maxDim = Math.max(size.x, size.z);
    // controls.maxZoom = 10; 
    // controls.maxDistance = 500; 
    const center = worldSize / 2;
    controls.setLookAt(
      center + 50,
      30,
      center + 50,
      center, 5, center,
      false
    );
    
    // controlsRef.current.setLookAt(worldSize / 2, 0, worldSize / 2);

    const dirLight = new CourseLight({ qualityLevel });
    scene.add(dirLight);
    
    // scene.add(new THREE.GridHelper(1500, 150, 0x444444, 0x222222));

    // console.dir('VolumetricClouds', VolumetricClouds);
    // const clouds = new VolumetricClouds(camera, {
    //   radius: 800,
    //   skyColor: new THREE.Color(skySettings.clouds.skyColor),
    //   cloudColor: new THREE.Color(skySettings.clouds.cloudColor),
    //   density: skySettings.clouds.density,
    //   scale: 4,
    //   // position: new THREE.Vector3(worldSize / 2, 200, worldSize / 2),
    // });
    // scene.add(clouds.object);
    // cloudsRef.current = clouds;

    sceneRef.current = { fuseRenderer, scene, camera, controls, meshLoader: null };

    console.log(`${Date.now()} - Init renderer`);
    fuseRenderer.init().then(async () => {
      console.log(`${Date.now()} - Render initialized`);

      grassAssets.current = await GrassShader.loadAssets({
        // modelPath: grassBladesModel,
        noisePath: perlinNoise
      });
      const ktx2Path = `${RESOURCES_FILE_PROTOCOL}://basis/`;
      const meshLoader = new MeshLoader(fuseRenderer, undefined, { ktx2Path });
      sceneRef.current.meshLoader = meshLoader;
      console.log(`${Date.now()} - MeshLoader created, starting compileAsync`);

      // await renderer.compileAsync(scene, camera);
      // console.log(`${Date.now()} - compileAsync done`);

      setRendererReady(true);
      console.log(`${Date.now()} - setRendererReady called`);
      setTimeout(() => console.log(`${Date.now()} - event loop unblocked`), 0);
    });

    const obs = new ResizeObserver(() => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    });
    obs.observe(container);


    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dblclick', onCanvasDblClick);

    return () => {
      fuseRenderer.renderer.setAnimationLoop(null);
      fuseRenderer.renderer.dispose();
      controls.dispose();
      obs.disconnect();
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('dblclick', onCanvasDblClick);
      container.removeChild(canvas);
    };
  }, []);

  // ─── Animation loop — deferred until content is ready ──────────────
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !surfacesLoaded) return;

    const hasTrees = project.trees?.length > 0 && heightMap?.data;
    if (hasTrees && !treesLoaded) return;

    const { fuseRenderer, scene, camera, controls } = ctx;
    const timer = new THREE.Timer();

    fuseRenderer.renderer.setAnimationLoop(() => {
      // controls.update(clock.getDelta());
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
      fuseRenderer.render(scene, camera);
    });

    return () => fuseRenderer.renderer.setAnimationLoop(null);

  }, [surfacesLoaded, treesLoaded]);

  // ─── Selection overlay ─────────────────────────────────────────────
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

    // Wireframe overlay
    // const wireMat = new THREE.MeshBasicMaterial({
    //   color: 'yellow',
    //   wireframe: true,
    //   transparent: true,
    //   opacity: 0.15,
    //   // depthTest: false,
    // });
    // const wireMat = new THREE.MeshBasicNodeMaterial({
    //   transparent: true,
    //   depthTest: false,
    //   wireframe: true,
    // });
    // wireMat.colorNode = vec3(1, 1, 0);
    // wireMat.opacityNode = float(0.15);

    // const wireframe = new THREE.Mesh(entry.geometry, wireMat);
    // wireframe.position.y = 0.01;

    const wireGeo = new THREE.WireframeGeometry(entry.geometry);
    const wireMat = new THREE.LineBasicNodeMaterial({ transparent: true, depthTest: true });
    wireMat.colorNode = vec3(1, 1, 0);
    wireMat.opacityNode = float(0.05);
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    wireframe.position.y = 0.01;

    wireframe.raycast = () => {};
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

  // ─── Surface meshes (replaces CustomMesh R3F components) ───────────

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

        // const layer = layers[i];
        const data = await window.meshery.project.getMeshDataForLayer(layer.id);
        if (!data?.mesh || cancelled) return;

        // const geometry = buildLayerGeometry(data.mesh);
        // const material = buildSurfaceMaterial(layer.color);
        const geometry = buildLayerGeometry(data.mesh, layer.surface);

        const isRough = layer.surface.startsWith('rough');
        const isLake = layer.surface.startsWith('plane_lake');
        const isRiver = layer.surface.startsWith('plane_river');
        const isLakeOrRiverBed = layer.surface.startsWith('river') || layer.surface.startsWith('water');
        const isSand = layer.surface === 'sand';
        const noiseTex = await getNoiseTexture();

        if (isLake || isRiver) {
          // Water classes create their own material + mesh internally
          const baseMesh = new THREE.Mesh(geometry);
          const surface = isRiver ? new RiverSurface(baseMesh, layer.flowMap) : new LakeSurface(baseMesh);
          surface.water.name = layer.id;
          scene.add(surface.water);
          waterRef.current.push(surface);

          surface.updateEnvironment(fuseRenderer.environment);

          surfacesRef.current.push({ mesh: surface.water, geometry, material: surface.material });
        } else if (data.mesh.blendMap) {
          console.log('LAKE BLEND', data);

          const baseMaterial = buildSurfaceMaterial(layer.surface, layer.color);
          const mesh = new THREE.Mesh(geometry, baseMaterial);
          mesh.userData.tileSize = TEXTURE_MAP[layer.surface]?.tileSize || 2.5;

          // Build neighbor mesh (temporary — just carries the material info)
          const neighborSurface = layer.neighbor || 'rough';
          const neighborMaterial = buildSurfaceMaterial(neighborSurface, layer.color);
          const neighborMesh = new THREE.Mesh(new THREE.BufferGeometry(), neighborMaterial);
          neighborMesh.userData.tileSize = TEXTURE_MAP[neighborSurface]?.tileSize || 2.0;

          mesh.receiveShadow = true;

          // SandMaterial reads from both meshes and replaces the material
          new SandMaterial(
            mesh,
            noiseTex,
            data.mesh.blendMap,
            neighborMesh,
            layer.blending || { noiseFreq: 0.3, noiseAmp: 0.15, patchy: false },
          );

          // Clean up temp neighbor mesh
          neighborMesh.geometry.dispose();
          neighborMaterial.dispose();

          mesh.name = layer.id;
          mesh.visible = layer.visible !== false;
          // mesh.renderOrder = 10; // render after grass surfaces so transparency works
          scene.add(mesh);
          surfacesRef.current.push({ mesh, geometry, material: mesh.material });
        } else if (isRough) {
          const material = buildSurfaceMaterial(layer.surface, layer.color);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = layer.id;
          mesh.visible = layer.visible !== false;
          scene.add(mesh);
          surfacesRef.current.push({ mesh, geometry, material });

          const grassOptions = {
            density: 11,
            renderDistance: 25,
            cellSize: 5,
            lean: 0.01,
            heightVariation: 0.5,
            maxNewCellsPerFrame: 10,
            scaleXZ: 0.6,
            scaleY: 0.65,
            layer: 2,
            // baseColor: new THREE.Color('#ffffff'),
            // tipColor1: new THREE.Color('#5c7c2e'),
            // tipColor2: new THREE.Color('#ffffff'),
          };
          
          const baseMesh = new THREE.Mesh(geometry);          
          // const grass = new GrassShader(baseMesh, grassAssets.current, grassOptions);
          mesh.receiveShadow = true;
          const grass = new GrassShader(mesh, grassAssets.current, grassOptions);
          scene.add(grass.mesh);
          grassRef.current.push(grass);
          // surfacesRef.current.push({ mesh: grass.mesh, geometry, material: grass._material });          
          // surfacesRef.current.push(child.uuid, grass);          
        } else {
         const material = buildSurfaceMaterial(layer.surface, layer.color);
         const mesh = new THREE.Mesh(geometry, material);
         mesh.name = layer.id;
         mesh.visible = layer.visible !== false;
         mesh.receiveShadow = true;
         console.log(`Add base texture ${layer.surface}`, layer.id);
         scene.add(mesh);
         surfacesRef.current.push({ mesh, geometry, material });
       }

        onLoadingChange?.({ phase: 'surfaces', loaded: i + 1, total: layers.length });
        await yieldToMain();
      // }
      }, { concurrency: 10 });      

      console.log(`${Date.now()} - Finished loading meshes`);

      if (!cancelled) {
        setSurfacesLoaded(true);
        onLoadingChange?.({ phase: 'ready', loaded: layers.length, total: layers.length });
      }
    })();

    return () => {
      cancelled = true;
      console.log(`${Date.now()} - Mesh loading cancelled`);
      waterRef.current = [];
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
  // ─── Tree planting ─────────────────────────────────────────────────

  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx?.meshLoader || !rendererReady) return;
    console.log(`${Date.now()} - Tree planting useEffect`);
    const { scene, meshLoader } = ctx;
    const treeLayers = project.trees;
    const heightScale = project.stats?.heightScale ?? project.stats?.relief ?? 10;

    // if (!heightMap?.data || !treeLayers?.length) return;
    if (!treeLayers?.length) return;



    let cancelled = false;

    (async () => {
      const heightMap = await window.meshery.project.getHeightMap();
      if (!heightMap?.data || cancelled) return;
      onLoadingChange?.({ phase: 'trees', loaded: 0, total: treeLayers.length });

      const groundMesh = heightmapToMesh(
        heightMap.data, heightMap.size, worldSize, 64, heightScale
      );
      scene.add(groundMesh);

      const planter = new TreePlanter({
        scene,
        worldSize,
        groundMeshes: groundMesh,
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

        const maskData = positionsToMaskData(layer.positions);
        planter.plantFromMask(configs, maskData, layer.randomSeed ?? 12345);

        onLoadingChange?.({ phase: 'trees', loaded: i + 1, total: treeLayers.length });
        await yieldToMain();
      }

      if (cancelled) return;

      scene.remove(groundMesh);
      groundMesh.geometry.dispose();
      groundMesh.material.dispose();
      
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
  }, [project.trees, heightMap, worldSize, rendererReady]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}