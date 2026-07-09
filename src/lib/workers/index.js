import { app, session, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'path';
import pMap from 'p-map';
import { spawn, Thread, Worker, Pool } from 'threads';
import { Transfer } from 'threads/worker';
import { _heightMapCache } from '../project';
import { EXTRA_RESOURCE_PATH } from '../app';

function getWorker(workerFilename) {
  return spawn(new Worker(path.join(__dirname, workerFilename)));
}

export async function buildCourseCDT(polygonMap, project, heightMap) {
  const meshWorker = await getWorker('mesh.worker.js');

  let courseSize = Math.round(project.settings.distance * 1000);
  let heightScale = project?.stats?.heightScale || project?.stats?.relief || 1;

  const cdtData = await meshWorker.buildCDTData(polygonMap, project._meshes, courseSize, heightMap, heightScale);
  await Thread.terminate(meshWorker);
  console.log(`CDT mesh built: ${cdtData.triangleCount} triangles`);
  return cdtData;
}

export async function svgToCourseLayers(data, onProgress) {
  // console.log('job', job);
  // console.log('data', data);
  const { layers, layerSettings } = data;
  const svg = await getWorker('svg.worker.js');
  // const workerPath = path.resolve(__dirname, 'svg.worker.js');
  // console.log("workerPath:", workerPath)
  // const svg = await spawn(new Worker(workerPath));

  const subscription = svg.progress().subscribe(p => {
    if (onProgress) onProgress(p);
    // or forward to renderer via IPC:
    // mainWindow.webContents.send('svg-progress', p);
  });

  const result = await svg.generateCoursePolygons(layers, layerSettings);
  
  subscription.unsubscribe();
  await Thread.terminate(svg);
  console.log(`Generated ${result.meshLayers.length} course layers from svg`);
  return result;
}

export async function layerToMesh(layer, shape, project, heightMap) {
  const meshWorker = await getWorker('mesh.worker.js');

  let mesh = await meshWorker.generateMesh(layer, shape);
  if (!mesh.points.length || !mesh.triangles.length) {
    console.log(`No points or triangles generated for ${layer.id}`);
  }
  mesh = await meshWorker.conformMeshToTerrain(layer, mesh, project, heightMap);

  if (layer.dig?.enabled) {
    mesh = await meshWorker.digMesh(mesh, shape, layer);
  }

  if (['river', 'water'].includes(layer.surface)) {
    mesh = await meshWorker.smoothMeshEdges(mesh, 3, 1);
  }

  // Generate blend map if blending is enabled for this surface
  if (layer.blending?.enabled && layer.blending?.distance > 0) {
    const svgSize = Math.round(project.settings.distance * 1000);
    console.log(`Generating blend map for: ${layer.id}`);
    mesh.blendMap = await meshWorker.generateBlendMap(shape, layer.blending, svgSize);
  }

  await Thread.terminate(meshWorker);
  // console.log(`Generated mesh from layer`);
  return mesh;
}

export async function smoothTerrain(heightMapData, smoothingRadius, project) {
  const smoothWorker = await getWorker('terrain.worker.js');
  const smoothed = await smoothWorker.smoothTerrainData(heightMapData, smoothingRadius);
  await Thread.terminate(smoothWorker);
  return smoothed;
}

export async function smoothLakeShores(heightMapData, project, lakeShapes = []) {
  const smoothWorker = await getWorker('terrain.worker.js');
  if (!_heightMapCache?.size || !project.settings.distance) {
    throw new Error('Invalid or missing heightMap data or course size!');
  }
  const svgSize = Math.round(project.settings.distance * 1000);
  const smoothed = await smoothWorker.smoothLakeShores(heightMapData, _heightMapCache?.size, svgSize, lakeShapes)
  await Thread.terminate(smoothWorker);
  return smoothed;
}

export async function smoothRiverBeds(heightMapData, project, riverShapes = []) {
  const smoothWorker = await getWorker('terrain.worker.js');
  if (!_heightMapCache?.size || !project.settings.distance) {
    throw new Error('Invalid or missing heightMap data or course size!');
  }
  const svgSize = Math.round(project.settings.distance * 1000);
  console.log(`Smoothing river bed: size:${_heightMapCache?.size}, svgSize:${svgSize}, shapes:${riverShapes.length}`);
  const smoothed = await smoothWorker.smoothRiverBeds(heightMapData, _heightMapCache?.size, svgSize, riverShapes)
  await Thread.terminate(smoothWorker);
  console.log(`Done smoothing river`);
  return smoothed;
}

// export async function conformMesh(layer, mesh, project, heightMap) {
//   const conformWorker = await getWorker('mesh.worker.js');
//   const conformed = await conformWorker.conformMeshToTerrain(layer, mesh, project, heightMap);
//   await Thread.terminate(conformWorker);
//   return conformed;
//   // console.log(`Mesh ${finished} of ${courseLayers.length} (triangles:${mesh.triangles.length}, points:${mesh.points.length})`);  
// }

export let workerWindow;
export async function createWorkerWindow(preloadUrl, mainUrl) {
  // Create the window
  // workerWindow = new BrowserWindow({
  //   show: false,
  //   width: 400,
  //   height: 400,
  //   webPreferences: {
  //     preload: preloadUrl,
  //     nodeIntegrationInWorker: true
  //     // nodeIntegration: false, // Recommended practice is to keep false in renderer
  //     // contextIsolation: true, // Recommended practice is to keep true
  //     // nodeIntegrationInWorker: true, // This enables Node.js APIs in the worker
  //     // sandbox: false // Must be false for nodeIntegrationInWorker to work
  //   },
  // });
  
  // workerWindow.loadURL(mainUrl);

  // if (!app.isPackaged) {
  //   workerWindow.webContents.openDevTools();
  // }
}

export async function exportTreePackage(inputFiles, outputFile) {
  const exportWorker = await getWorker('export.worker.js'); 
  await exportWorker.exportTreePackage(inputFiles, outputFile, {
    wasmUrl: path.join(EXTRA_RESOURCE_PATH, 'basis/basis_encoder.wasm'),    
  });
}

export async function generateFlowMapPNG(polygon, spine) {
  const exportWorker = await getWorker('export.worker.js'); 
  return exportWorker.generateFlowMapPNG(polygon, spine);
}

// export async function compressTextures(uncompressedGlb, ktx2Options = {}, onProgress = () => {}) {
//   const exportWorker = await getWorker('export.worker.js'); 
//   return exportWorker.compressTextures(Transfer(uncompressedGlb.buffer), ktx2Options);
// }

export async function compressTextures(doc, onProgress = () => {}) {
  // const pool = Pool(() => spawn(new Worker(path.join(__dirname, 'export.worker.js'))), 4);
  const pool = Pool(() => getWorker('export.worker.js'), 4);

  const textures = doc.getRoot().listTextures()
    .filter(t => t.getMimeType() !== 'image/ktx2');
  const total = textures.length;
  let completed = 0;

  await pMap(textures, async (texture) => {
    const rawImage = texture.getImage();

    const ktx2Buffer = await pool.queue(worker =>
      worker.compressTexture(Transfer(rawImage.buffer), {
        wasmUrl: path.join(EXTRA_RESOURCE_PATH, 'basis/basis_encoder.wasm'), 
      })
    );

    texture.setImage(new Uint8Array(ktx2Buffer));
    texture.setMimeType('image/ktx2');
    onProgress({ current: ++completed, total });
  }, { concurrency: 4 });

  await pool.terminate();
}
