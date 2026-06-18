import fs from 'node:fs';
import path from 'node:path';
import { Color } from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { mergeDocuments, dedup } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import {
  // KHRDracoMeshCompression,
  KHRMaterialsUnlit,
  KHRMeshQuantization,
  KHRTextureBasisu,
  KHRTextureTransform,
  KHRMaterialsSpecular,
  KHRMaterialsClearcoat,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
  KHRMaterialsIOR,
  EXTMeshGPUInstancing,
} from '@gltf-transform/extensions';
import { PNG } from 'pngjs';

import { hexToRGB01 } from '../colors';
import { TEXTURE_MAP } from '../textures';
import { TEXTURES_PATH } from '../app';
import { CACHE_DIR, PROJECT_FILE_PROTOCOL, RESOURCES_FILE_PROTOCOL } from '../../constants';
import { openProject, saveProjectSettings } from '../project';
import { broadcast } from '../window';
import { compressTextures } from '../workers';


const EXTENSIONS = [
  // KHRDracoMeshCompression,
  KHRMaterialsUnlit,
  KHRMeshQuantization,
  KHRTextureBasisu,
  KHRTextureTransform,
  KHRMaterialsSpecular,
  KHRMaterialsClearcoat,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
  KHRMaterialsIOR,
  EXTMeshGPUInstancing,
];


function positionsToPngBuffer(positions, size = 512) {
  const png = new PNG({ width: size, height: size, colorType: 0 }); // grayscale

  // pngjs grayscale: 2 bytes per pixel (value + alpha)
  // data is initialized to 0, so we only need to write painted pixels
  for (const { i, val } of positions) {
    const ci = i * 4;
    png.data[ci] = val;
    png.data[ci + 1] = val;
    png.data[ci + 2] = val;
    png.data[ci + 3] = 255;
    // png.data[i * 2] = val;
    // png.data[i * 2 + 1] = 255;
  }

  return PNG.sync.write(png);
}

// Read a PNG from disk and attach it under a relative URI. gltf-transform
// will write the bytes to that URI alongside the .gltf when writing.
function loadTexture(doc, sourceDir, uriPath, name) {
  const ext = path.extname(uriPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return doc.createTexture(name)
    .setImage(fs.readFileSync(path.join(sourceDir, uriPath)))
    .setMimeType(mime)
    .setURI(uriPath);
}

// World-space planar UVs from XZ. Y is up.
function generateUVs(points, tileSize) {
  const uvs = new Float32Array((points.length / 3) * 2);
  for (let i = 0, j = 0; i < points.length; i += 3, j += 2) {
    uvs[j]     = points[i]     / tileSize; // u from x
    uvs[j + 1] = points[i + 2] / tileSize; // v from z
  }
  return uvs;
}

function createSurfaceMaterial(doc, surface, fallbackHex) {
  const cfg = TEXTURE_MAP[surface] ?? TEXTURE_MAP._default;
  const mat = doc.createMaterial(`surface_${surface}`)
    .setMetallicFactor(0.0)
    .setRoughnessFactor(cfg.roughnessFactor ?? 1.0);

  if (cfg.baseColor) {
    mat.setBaseColorTexture(loadTexture(doc, TEXTURES_PATH, cfg.baseColor, `${surface}_albedo`));
    if (cfg?.tint) {
      mat.setBaseColorFactor(hexToRGB01(new Color(cfg.tint).getHexString()));
    }
  } else if (fallbackHex) {
    mat.setBaseColorFactor(hexToRGB01(fallbackHex));
  }
  if (cfg.normal) {
    mat.setNormalTexture(loadTexture(doc, TEXTURES_PATH, cfg.normal, `${surface}_normal`));
  }
  if (cfg.orm) {
    const tex = loadTexture(doc, TEXTURES_PATH, cfg.orm, `${surface}_orm`);
    mat.setOcclusionTexture(tex);
    mat.setMetallicRoughnessTexture(tex);
  }
  return mat;
}




export function meshNodeForLayer(doc, buffer, layer, mesh, cfg = {}, material) {
  const { points, triangles, normals, colors } = mesh;

  const positions = doc.createAccessor()
    .setType('VEC3')
    .setArray(points instanceof Float32Array ? points : new Float32Array(points))
    .setBuffer(buffer);


  const indices = doc.createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array(triangles))
    .setBuffer(buffer);

  const normalAccessor = doc.createAccessor()
    .setType('VEC3')
    .setArray(normals)
    .setBuffer(buffer);

  // Add vertex colors
  const colorAccessor = doc.createAccessor()
    .setType('VEC3')
    .setArray(colors instanceof Float32Array ? colors : new Float32Array(colors))
    .setBuffer(buffer);

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', positions)
    .setAttribute('NORMAL', normalAccessor)
    // .setAttribute('TEXCOORD_0', uvs)
    .setAttribute('COLOR_0', colorAccessor)
    .setIndices(indices);
    // .setMaterial(material);

  if (material && cfg?.tileSize) {
    const uvs = doc.createAccessor()
      .setType('VEC2')
      .setArray(generateUVs(points, cfg.tileSize))
      .setBuffer(buffer);

    prim.setAttribute('TEXCOORD_0', uvs);
    prim.setMaterial(material);
  }

  const finalMesh = doc.createMesh(layer.id).addPrimitive(prim);

  return doc.createNode(layer.id)
    .setExtras({
      type: 'course',
      surface: layer.surface,
      name: layer.name,
      id: layer.id
    })
    .setMesh(finalMesh);
  
}

async function embedModel(io, doc, scene, { filePath, name, extras }) {
  const modelDoc = await io.read(filePath);
  const scenesBefore = doc.getRoot().listScenes().length;

  mergeDocuments(doc, modelDoc);

  const importedScenes = doc.getRoot().listScenes().slice(scenesBefore);
  const node = doc.createNode(name).setExtras(extras);

  for (const imported of importedScenes) {
    for (const child of imported.listChildren()) {
      node.addChild(child);
    }
    imported.dispose();
  }

  scene.addChild(node);
  return node;
}

function consolidateBuffers(doc) {
  const buffers = doc.getRoot().listBuffers();
  if (buffers.length <= 1) return;
  const main = buffers[0];
  for (const buf of buffers.slice(1)) {
    for (const acc of doc.getRoot().listAccessors()) {
      if (acc.getBuffer() === buf) acc.setBuffer(main);
    }
    buf.dispose();
  }
}

export async function write(filePath, project, meshData, imageData) {
  const io = new NodeIO().registerExtensions(EXTENSIONS);
  const doc = new Document();

  for (const Ext of EXTENSIONS) {
    doc.createExtension(Ext);
  }

  const buffer = doc.createBuffer();
  const scene = doc.createScene('root');

  let materialMap = new Map();

  for (const layer of project._meshes) {
    const mesh = meshData.meshes.get(layer.id)?.mesh;
    if (!mesh) {
      console.log('Missing meshData record');
      return;
    }
    // const { points, triangles, normals, colors } = meshData.meshes.get(layer.id)?.mesh;

    const surface = layer.surface ?? '_default';
    const cfg = TEXTURE_MAP[surface] ?? TEXTURE_MAP._default;
    const matKey = TEXTURE_MAP[surface] ? surface : `_default:${layer.color}`;

    console.log(`Exporting layer: ${layer.id}`);

    let material = materialMap.get(matKey);
    if (!material) {
      material = createSurfaceMaterial(doc, surface, layer.color);
      materialMap.set(matKey, material);
    }
    
    const meshNode = meshNodeForLayer(doc, buffer, layer, mesh, cfg, material);
    scene.addChild(meshNode);
  }

  
  const holesOutput = [...project.holes?.values()].filter(Boolean);
  if (holesOutput?.length > 0) {
    for (const hole of holesOutput) {
      const holeNode = doc.createNode(`hole_${hole.number}`).setExtras({
        type: 'hole_group',
        holeNum: hole.number,
        par: hole.par
      });
  
      // add each hole's waypoints
      const waypoints = [
        hole.tee && { type: 'tee', ...hole.tee },
        hole.aim && { type: 'aim', ...hole.aim },
        hole.pin && { type: 'pin', ...hole.pin }
      ].filter(Boolean);
      waypoints.forEach((wp, i) => {
        const wpNode = doc.createNode(`hole_${hole.number}_${wp.type}_${i}`)
          .setExtras({
            type: 'waypoint',
            waypoint: wp.type,
            holeNum: hole.number,
            order: i,
            mapX: wp.position.x,
            mapY: wp.position.y,
          });
        holeNode.addChild(wpNode);
      });
  
      scene.addChild(holeNode);
    }
  }

  if (project.trees?.length) {
    
    for (const tree of project.trees) {
      for (const config of tree.treeConfigs ?? []) {
        const templateId = `${tree.id}_${config.id}`;
        const node = await embedModel(io, doc, scene, {
          filePath: config.filePath,
          name: `tree_${config.id}`,
          extras: {
            type: 'tree_template',
            treeLayerId: tree.id,
            configId: config.id,
            density: config.density,
            randomSeed: config.randomSeed,
            scaleRange: config.scaleRange,
          }
        });
        // Hidden — only used as a source for instancing at runtime
        node.setScale([0, 0, 0]);
      }
    }
  }



  // Deduplicate any identical textures/materials/meshes
  await doc.transform(dedup());


  const { sky } = openProject.scene;
  
  let sceneSettings = { sky: { type: sky.type } };
  
  // TODO: add support for sky-boxes
  if (sky.type === 'clouds') {
    sceneSettings.sky.clouds = sky.clouds;
  }

  doc.getRoot().setExtras({
    exportedBy: 'OGS-Meshery',
    createdAt: (new Date()).toISOString(),
    courseName: openProject.name,
    courseSize: openProject.settings.distance * 1000,
    sceneSettings
  });

  consolidateBuffers(doc);

  const uncompressedGlb = await io.writeBinary(doc);
  // const worker = await spawn(new Worker('./compress-worker.js'));
  // const compressedGlb = await worker.compress(Transfer(uncompressedGlb.buffer));
  const compressedGlb = await compressTextures(uncompressedGlb, (progress) => {
    console.log('compress-progress', progress);
  });

  const finalDoc = await io.readBinary(new Uint8Array(compressedGlb));

  if (project.trees?.length) {
    for (const tree of project.trees) {
      const pngBuffer = positionsToPngBuffer(tree.positions);
      const texture = finalDoc.createTexture(tree.id)
        .setMimeType('image/png')
        .setImage(new Uint8Array(pngBuffer))
        .setExtras({
          type: 'tree_mask',
          id: tree.id,
          name: tree.name
        });
    }
  }
  // add course map
  if (imageData.mapImage) {
    const mapImage = Buffer.from(imageData.mapImage.split('base64,')[1], 'base64');
    const texture = finalDoc.createTexture('course_map')
      .setMimeType('image/jpeg')
      .setImage(new Uint8Array(mapImage))
      .setExtras({ type: 'course_map' });
  }
    
  await io.write(filePath, finalDoc);
}
