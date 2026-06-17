import { app, session, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'path';
import { spawn, Thread, Worker } from 'threads';
import { Transfer } from 'threads/worker';
import { _heightMapCache } from '../project';

function getWorker(workerFilename) {
  return spawn(new Worker(path.join(__dirname, workerFilename)));
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
  await Thread.terminate(meshWorker);
  // console.log(`Generated mesh from layer`);
  return mesh;
}

export async function smoothTerrain(heightMapData, smoothingRadius, project, lakeShapes = []) {
  const smoothWorker = await getWorker('terrain.worker.js');
  
  let smoothed = await smoothWorker.smoothTerrainData(heightMapData, smoothingRadius);

  if (!_heightMapCache) {
    throw new Error('Invalid or missing heightMap data!');
  }
  const heightSize = _heightMapCache?.size;
  const svgSize = Math.round(project.settings.distance * 1000);
  // const lakeShapes = project.

  smoothed = await smoothWorker.smoothLakeShores(smoothed, heightSize, svgSize, lakeShapes)

  await Thread.terminate(smoothWorker);

  return smoothed;
  // console.log(`Mesh ${finished} of ${courseLayers.length} (triangles:${mesh.triangles.length}, points:${mesh.points.length})`);  
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
  await exportWorker.exportTreePackage(inputFiles, outputFile);
}

export async function compressTextures(uncompressedGlb, onProgress = () => {}) {
  const exportWorker = await getWorker('export.worker.js'); 
  let compressedBuffer;
  return exportWorker.compressTextures(Transfer(uncompressedGlb.buffer));
  // return new Promise((resolve, reject) => {
  //   exportWorker.compressTextures(Transfer(uncompressedGlb.buffer)).subscribe({
  //     next(status) {
  //       if (status.type === 'progress') {
  //         console.log('export-progress', status);
  //         onProgress(status.progress);
  //       } else if (status.type === 'complete') {
  //         console.log('export-done');
  //         compressedBuffer = status.buffer;
  //       }
  //     },
  //     complete() {
  //       console.log('export-done');
  //       resolve(compressedBuffer);
  //       Thread.terminate(exportWorker);
  //     },
  //     error(err) {
  //       console.log('export-error', err.message);
  //       Thread.terminate(exportWorker);
  //     }
  //   });
  // });
}