import { app, session, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'path';
import { spawn, Thread, Worker } from 'threads';

export async function svgToCourseLayers(data) {
  // console.log('job', job);
  // console.log('data', data);
  const { layers, settings } = data;
  const workerPath = path.resolve(__dirname, 'svg.worker.js');
  console.log("workerPath:", workerPath)
  const svg = await spawn(new Worker(workerPath));
  const courseLayers = await svg.generateCoursePolygons(layers, settings);
  await Thread.terminate(svg);
  console.log(`Generated ${courseLayers.length} course layers from svg`);
  return courseLayers;
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
