import path from 'path';
import { app, screen, session, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { findTreeConfigById, openProject } from './project';
import { EXTRA_RESOURCE_PATH, TEXTURES_PATH } from './app';
import { PROJECT_FILE_PROTOCOL, RESOURCES_FILE_PROTOCOL, TREE_IMPORT_PREFIX } from '../constants';
import { pathToFileURL } from 'url';

export let mainWindow;

export async function createWindow(preloadUrl, mainUrl) {
  setupProtocolHandler();
  
  const size = screen.getPrimaryDisplay().bounds;
  const width = Math.min(Math.round(size.width * 0.8), 1280);
  const height = Math.min(Math.round(size.height * 0.8), 720);

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width,
    height,
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

  protocol.handle(RESOURCES_FILE_PROTOCOL, (request) => {
    const key = request.url.slice(RESOURCES_FILE_PROTOCOL.length + 3); // removes the extra "://"
    const filePath = path.join(EXTRA_RESOURCE_PATH, key);
    const fetchFile = pathToFileURL(filePath).toString();
    return net.fetch(fetchFile);
  });

  protocol.handle(PROJECT_FILE_PROTOCOL, (request) => {
    const key = request.url.slice(PROJECT_FILE_PROTOCOL.length + 3);
    if (key.includes(TREE_IMPORT_PREFIX)) {
      console.log(`Tree import: ${key}`);
      const treeId = key.slice(TREE_IMPORT_PREFIX.length + 1, -4);
      console.log(`Tree id: ${treeId}`);
      const asset = findTreeConfigById(treeId);
      console.log(`Asset id`, asset);
      if (asset?.filePath) {
        const fetchFile = pathToFileURL(asset.filePath).toString();
        return net.fetch(fetchFile);
      }
    }

    if (openProject._workingDir){
      const filePath = path.join(openProject._workingDir, key);
      const fetchFile = pathToFileURL(filePath).toString();
      return net.fetch(fetchFile);
    }
    return new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/html' }
    });
  });
}