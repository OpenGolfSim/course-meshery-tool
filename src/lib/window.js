import path from 'path';
import { app, session, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { openProject } from './project';
import { PROJECT_FILE_PROTOCOL } from '../constants';
import { pathToFileURL } from 'url';

export let mainWindow;

export async function createWindow(preloadUrl, mainUrl) {
  setupProtocolHandler();
  
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadUrl,
      nodeIntegrationInWorker: true
      // nodeIntegration: false, // Recommended practice is to keep false in renderer
      // contextIsolation: true, // Recommended practice is to keep true
      // nodeIntegrationInWorker: true, // This enables Node.js APIs in the worker
      // sandbox: false // Must be false for nodeIntegrationInWorker to work
    },
  });
  // const ses = mainWindow.webContents.session

  // console.log('reactDevToolsPath', reactDevToolsPath);
  // const ext = await mainWindow.webContents.session.extensions.loadExtension(reactDevToolsPath, { allowFileAccess: true });
  // console.log(ext);

  // and load the index.html of the app.
  mainWindow.loadURL(mainUrl);

  if (!app.isPackaged) {
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  }
};

export function broadcast(event, ...args) {
  try {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents?.send(event, ...args);
    }
  } catch (error) {
    log.error(error);
  }
}


export function setupProtocolHandler() {

  // protocol.handle('laz', (request) => {
  //   const url = new URL(request.url);
  //   if (url.hostname !== 'course.laz') {
  //     return new Response('not found', {
  //       status: 404,
  //       headers: { 'content-type': 'text/html' }
  //     });
  //   }
  //   if (!openProject.lidar?.filePath) {
  //     return new Response('no lidar', {
  //       status: 404,
  //       headers: { 'content-type': 'text/html' }
  //     });
  //   }
  //   const fetchFile = pathToFileURL(openProject.lidar.filePath).toString();
  //   console.log(`send file: ${fetchFile}`);
  //   return net.fetch(fetchFile);
  // });

  protocol.handle(PROJECT_FILE_PROTOCOL, (request) => {
    // const GEOTIFF = {
    //   satellite: path.join(app.getAppPath(), 'temp/satellite.tif'),
    //   hillshade: path.join(app.getAppPath(), 'temp/hillshade.tif'),
    // };
    // const url = new URL(request.url);
    const key = request.url.slice(PROJECT_FILE_PROTOCOL.length + 3);
    console.log(`Fetch key: ${key}`);
    if (openProject._workingDir){
      const filePath = path.join(openProject._workingDir, key);
      console.log(`Project file: ${filePath}`);
      const fetchFile = pathToFileURL(filePath).toString();
      console.log(`send file: ${fetchFile}`);
      return net.fetch(fetchFile);
    }
    // if (key === 'satellite') {
    //   const fetchFile = pathToFileURL(GEOTIFF.satellite).toString();
    //   console.log(`send file: ${fetchFile}`);
    //   return net.fetch(fetchFile);
    // }
    return new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/html' }
    });
  });
}