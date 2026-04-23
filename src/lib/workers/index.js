import { app, session, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'path';
import { spawn, Thread, Worker } from 'threads';

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
  console.log(`Generated ${result.layers.length} course layers from svg`);
  return result;
}

export async function layerToMesh(layer, shape, project) {
  const meshWorker = await getWorker('mesh.worker.js');
  let mesh = await meshWorker.generateMesh(layer, shape);

  mesh = await meshWorker.conformMeshToTerrain(layer, mesh, project);
  if (layer.dig?.enabled) {
    mesh = await meshWorker.digMesh(mesh, shape, layer);
  }
  await Thread.terminate(meshWorker);
  // console.log(`Generated mesh from layer`);
  return mesh;
}

export async function smoothTerrain(heightMapData, smoothingRadius) {
  const smoothWorker = await getWorker('mesh.worker.js');
  const smoothed = await smoothWorker.smoothTerrainData(heightMapData, smoothingRadius);
  await Thread.terminate(smoothWorker);
  return smoothed;
  // console.log(`Mesh ${finished} of ${courseLayers.length} (triangles:${mesh.triangles.length}, points:${mesh.points.length})`);  
}

export async function conformMesh(layer, mesh, project) {
  const conformWorker = await getWorker('mesh.worker.js');
  const conformed = await conformWorker.conformMeshToTerrain(layer, mesh, project);
  await Thread.terminate(conformWorker);
  return conformed;
  // console.log(`Mesh ${finished} of ${courseLayers.length} (triangles:${mesh.triangles.length}, points:${mesh.points.length})`);  
}
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
