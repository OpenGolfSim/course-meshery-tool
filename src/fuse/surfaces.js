// src/fuse/surfaces.js
//
// Pure (non-React) surface material/geometry builders for CourseScene.
// No module-level mutable project state: everything project-dependent
// arrives via a `ctx` object passed by the caller:
//
//   ctx.surfaces — resolved surface configs (project._surfaces)
//   ctx.sun      — { elevation, azimuth } (project.scene.sun)
//
import * as THREE from 'three/webgpu';
import {
  LakeSurface,
  RiverSurface,
  GrassBlades,
  GrassSurface,
  BlendMaterial,
} from '@opengolfsim/fuse';
import perlinNoise from '@opengolfsim/fuse/src/images/perlinnoise.webp';
import grainNoise from '@opengolfsim/fuse/src/images/grainnoise.png';
import { RESOURCES_FILE_PROTOCOL } from '../constants';
import { TEXTURE_MAP } from '../lib/textures';

// ─── Shared textures ─────────────────────────────────────────────────
const textureCache = new Map();
const textureLoader = new THREE.TextureLoader();

let noiseTexturePromise = null;
export function getNoiseTexture() {
  if (!noiseTexturePromise) {
    noiseTexturePromise = new Promise((resolve) => {
      const tex = new THREE.TextureLoader().load(perlinNoise, () => resolve(tex));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
    });
  }
  return noiseTexturePromise;
}

let grainTexturePromise = null;
export function getGrainTexture() {
  if (!grainTexturePromise) {
    grainTexturePromise = new Promise((resolve) => {
      const tex = new THREE.TextureLoader().load(grainNoise, () => resolve(tex));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
    });
  }
  return grainTexturePromise;
}

export function loadTexture(url, colorSpace = THREE.NoColorSpace) {
  // Custom textures arrive as full protocol URLs; built-ins as bare filenames
  const fullUrl = url.includes('://') ? url : `${RESOURCES_FILE_PROTOCOL}://textures/${url}`;

  if (textureCache.has(fullUrl)) return textureCache.get(fullUrl);
  const tex = textureLoader.load(fullUrl);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (colorSpace !== THREE.NoColorSpace) tex.colorSpace = colorSpace;
  textureCache.set(fullUrl, tex);
  return tex;
}

// ─── Config resolution ───────────────────────────────────────────────
const cfgFor = (ctx, surfaceName) =>
  ctx?.surfaces?.[surfaceName] ?? TEXTURE_MAP[surfaceName];

// ─── Builders ────────────────────────────────────────────────────────
export function buildSurfaceMaterial(surfaceName, fallbackHex, grainTex, ctx) {
  const cfg = cfgFor(ctx, surfaceName);

  let mat = new THREE.MeshStandardMaterial();
  mat.userData.surface = surfaceName; // for live override updates
  mat.roughness = cfg?.roughnessFactor ?? 0.9;
  mat.side = THREE.DoubleSide;

  if (cfg?.baseColor) {
    const tex = loadTexture(cfg.baseColor, THREE.SRGBColorSpace);
    mat.map = tex;
    mat.userData.appliedMap = cfg.baseColor;
    if (cfg?.tint) {
      mat.color = new THREE.Color(cfg.tint);
    }
  } else {
    // Textureless surface: tint IS the color (falls back to the layer's hex).
    // Assign userData properties — replacing the object would wipe the
    // `surface` tag the live-update effect keys on.
    const c = cfg?.tint ? new THREE.Color(cfg.tint) : new THREE.Color(`#${fallbackHex}`);
    mat.userData.tint = cfg?.tint ? new THREE.Color(cfg.tint) : null;
    mat.color = c;
  }

  if (cfg?.normal) {
    const normalMap = loadTexture(cfg.normal);
    mat.normalMap = normalMap;
    mat.userData.appliedNormal = cfg.normal;
    if (cfg?.normalScale) mat.normalScale = new THREE.Vector2(...cfg.normalScale);
  }
  if (cfg?.roughnessFactor) {
    mat.roughness = cfg.roughnessFactor;
  }

  // Fairway-only while GrassSurface integration is validated.
  // GrassSurface requires a base texture map — never wrap textureless mats.
  // if (surfaceName === 'fairway' && grainTex && mat.map) {
  const grass = cfg?.grass;
  if (grass?.enabled && grainTex && mat.map) {
    const base = mat;
    const { enabled, ...opts } = grass;
    mat = new GrassSurface(base, {
      ...opts,
      shading: opts.shading && {
        ...opts.shading,
        elevation: ctx.sun.elevation,
        azimuth: ctx.sun.azimuth,
      },
      // noiseTexture is a runtime asset, injected here — config stays JSON-safe
      distantDetail: opts.distantDetail && {
        ...opts.distantDetail, noiseTexture: grainTex
      },
    });
    // GrassSurface doesn't copy userData — restore the surface tag the
    // live-update effect and texture-swap paths key on
    mat.userData = { ...base.userData };
    base.dispose(); // textures survive; only the wrapper material is dropped
  }
  // Snapshot for change detection by the live-update effect. Tint is baked
  // into the GrassSurface shader, so wrapped materials must also rebuild on
  // tint change; plain materials update tint live via mat.color.
  mat.userData.appliedGrass = JSON.stringify({
    grass: cfg?.grass ?? null,
    tint: mat.isMeshStandardNodeMaterial ? (cfg?.tint ?? null) : null,
  });

  return mat;
}

export function buildLayerGeometry(meshData, surfaceName, ctx) {
  const geo = new THREE.BufferGeometry();
  if (!meshData?.points || !meshData?.triangles) return geo;

  const points = meshData.points;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setIndex(meshData.triangles);

  // Override-aware, but hardened: any non-positive/non-numeric stored value
  // falls back to the TEXTURE_MAP default instead of producing Infinity UVs.
  let tile = Number(cfgFor(ctx, surfaceName)?.tileSize);
  if (!(tile > 0)) tile = Number(TEXTURE_MAP[surfaceName]?.tileSize) || 2.0;

  const uvs = new Float32Array((points.length / 3) * 2);
  for (let i = 0, j = 0; i < points.length; i += 3, j += 2) {
    uvs[j]     = points[i]     / tile;
    uvs[j + 1] = points[i + 2] / tile;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.userData.appliedTileSize = tile;

  if (meshData.normals) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.normals, 3));
  }

  geo.computeBoundingSphere();
  return geo;
}

// Material-only rebuild for blend meshes (tint changed). Mirrors the
// initial build in buildSingleLayer; caller owns cancellation/debounce
// and updating userData.appliedTints + the surfaces registry.
export function rebuildBlendMaterial(obj, rb, noiseTex, ctx) {
  obj.material.dispose();
  obj.material = buildSurfaceMaterial(rb.layer.surface, rb.layer.color, null, ctx);
  const neighborSurface = rb.layer.neighbor || 'rough';
  const neighborMaterial = buildSurfaceMaterial(neighborSurface, rb.layer.color, null, ctx);
  new BlendMaterial(obj, noiseTex, rb.blendMap, {
    texture: neighborMaterial.map,
    tint: neighborMaterial.color,
    tileSize: obj.userData.tileSize,
  }, rb.layer.blending || { noiseFreq: 0.3, noiseAmp: 0.15, patchy: false });
  neighborMaterial.dispose();
}

export async function buildSingleLayer(layer, scene, refs, fuseRenderer, ctx) {
  const data = await window.meshery.project.getMeshDataForLayer(layer.id);
  if (!data?.mesh) return null;

  const geometry = buildLayerGeometry(data.mesh, layer.surface, ctx);
  const isRough = layer.surface.startsWith('rough');
  const isDeepRough = ['base', 'deep_rough'].includes(layer.surface);
  const isLake = layer.surface.startsWith('plane_lake');
  const isRiver = layer.surface.startsWith('plane_river');
  const isSand = layer.surface === 'sand';
  const noiseTex = await getNoiseTexture();
  const grainTex = await getGrainTexture();

  if (isLake || isRiver) {
    const baseMesh = new THREE.Mesh(geometry);
    const surface = isRiver ? new RiverSurface(baseMesh, layer.flowMap) : new LakeSurface(baseMesh);
    // Render before other transparent meshes (grass/trees) so they blend over the water
    surface.water.renderOrder = -1;

    surface.water.name = layer.id;
    scene.add(surface.water);
    refs.water.push(surface);
    if (fuseRenderer.environment) {
      surface.updateEnvironment(fuseRenderer.environment);
    }
    return { mesh: surface.water, geometry, material: surface.material };

  } else if (data.mesh.blendMap) {
    const baseMaterial = buildSurfaceMaterial(layer.surface, layer.color, null, ctx);
    const mesh = new THREE.Mesh(geometry, baseMaterial);
    const tileSize = geometry.userData.appliedTileSize || TEXTURE_MAP[layer.surface]?.tileSize || 2.5;

    mesh.userData.tileSize = tileSize;
    mesh.receiveShadow = true;

    const neighborSurface = layer.neighbor || 'rough';
    const neighborMaterial = buildSurfaceMaterial(neighborSurface, layer.color, null, ctx);

    const neighbor = {
      texture: neighborMaterial.map,
      tint: neighborMaterial.color,
      tileSize,
    };
    new BlendMaterial(mesh, noiseTex, data.mesh.blendMap, neighbor, layer.blending || { noiseFreq: 0.3, noiseAmp: 0.15, patchy: false });
    // Everything needed to rebuild just the material when tints change
    mesh.userData.blendRebuild = { blendMap: data.mesh.blendMap, layer };
    mesh.userData.appliedTints = {
      base: cfgFor(ctx, layer.surface)?.tint,
      neighbor: cfgFor(ctx, neighborSurface)?.tint,
    };

    neighborMaterial.dispose();

    mesh.name = layer.id;
    mesh.visible = layer.visible !== false;
    scene.add(mesh);
    return { mesh, geometry, material: mesh.material };

  } else if (isRough) {
    const material = buildSurfaceMaterial(layer.surface, layer.color, grainTex, ctx);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = layer.id;
    mesh.visible = layer.visible !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (refs.grassAssets) {
      const grass = new GrassBlades(mesh, refs.grassAssets, {
        density: 11, renderDistance: 25, cellSize: 5, lean: 0.01,
        heightVariation: 0.5, maxNewCellsPerFrame: 10,
        scaleXZ: 0.6, scaleY: 0.65, layer: 2,
      });
      grass.surface = layer.surface; // for live tint updates
      scene.add(grass.mesh);
      refs.grass.push(grass);
    }
    return { mesh, geometry, material };
  } else if (isDeepRough) {
    const material = buildSurfaceMaterial(layer.surface, layer.color, grainTex, ctx);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = layer.id;
    mesh.visible = layer.visible !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (refs.grassAssets) {
      const grass = new GrassBlades(mesh, refs.grassAssets, {
        density: 11,
        renderDistance: 25,
        cellSize: 5,
        lean: 0.01,
        heightVariation: 0.5,
        maxNewCellsPerFrame: 10,
        scaleXZ: 0.6,
        scaleY: 0.65,
        layer: 2,
      });
      grass.surface = layer.surface; // for live tint updates
      scene.add(grass.mesh);
      refs.grass.push(grass);
    }
    return { mesh, geometry, material };
  } else {
    const material = buildSurfaceMaterial(layer.surface, layer.color, grainTex, ctx);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = layer.id;
    mesh.visible = layer.visible !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, geometry, material };
  }
}