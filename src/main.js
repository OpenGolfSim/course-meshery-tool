import { app, session, shell, BrowserWindow, ipcMain, dialog } from 'electron';
import log from 'electron-log';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { parseSVG } from './lib/svg';
import { parsePalette } from './lib/colors';
import { parseRaw } from './lib/heightmap';
import { resourceRoot } from './lib/app';
import { dataCache, smoothTerrainData } from './lib/terrain';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // nodeIntegrationInWorker: true
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
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

app.whenReady().then(async () => {

  if (process.env.REACT_DEVTOOLS) {
    const ext = await session.defaultSession.extensions.loadExtension(
      process.env.REACT_DEVTOOLS, { allowFileAccess: true }
    );
    if (ext?.version) {
      log.info(`Loaded dev tools extension: ${ext?.version}`);
    }
  }

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
// ipcMain.handle('state.get', async () => {
//   return formContext;
// });

ipcMain.handle('svg.select', async (event) => {
  const result = await dialog.showOpenDialog({
    title: 'Select SVG File',
    filters: [
      { name: 'SVG Files', extensions: ['svg'] },
    ]
  });

  const [svgPath] = result.filePaths;
  if (result.canceled || !svgPath) {
    return;
  }

  try {
    const palette = await parsePalette();

    log.info(`Parsing SVG (${svgPath})`);
    const { layers, width, height } = await parseSVG(svgPath, palette);

    return {
      palette,
      layers,
      width,
      height,
      svg: svgPath
    };
  } catch (error) {
    log.error('SVG error', error);
    event.sender.send('error', error.message);
  }
});

ipcMain.handle('url.open', async (_, href) => {
  log.debug(`Opening url: ${href}`);
  if (href) {
    shell.openExternal(href);
  }
});

ipcMain.handle('raw.select', async (event, layer) => {
  const result = await dialog.showOpenDialog({
    title: 'Select RAW File',
    filters: [
      { name: 'RAW Files', extensions: ['raw'] },
    ]
  });
  const [rawPath] = result.filePaths;
  if (result.canceled || !rawPath) {
    return;
  }

  try {
    log.info(`Parsing RAW file (${rawPath})`);
    const heightMap = await parseRaw(rawPath);
    if (!heightMap?.length) {
      throw new Error('The raw height map file appears to be empty')
    }
    const terrainSize = Math.sqrt(heightMap.length);
    log.info(`Height map returned ${heightMap.length} points (size: ${terrainSize})`);
    // dataCache.set('heightMap', heightMap);
    // dataCache.set('terrainSize', terrainSize);
    // console.log('dataCache', dataCache);

    return {
      raw: rawPath,
      heightMap,
      terrainSize
    };
  } catch (error) {
    log.error('RAW error', error);
    event.sender.send('error', error.message);
  }

});

ipcMain.handle('raw.generate', async (event, options) => {
  log.info('Generating terrain with options', options);
  const { terrainSize, terrainSmoothingStrength, terrainSmoothingRadius } = options;
  const smoothed = smoothTerrainData(terrainSize, terrainSmoothingStrength, terrainSmoothingRadius);
  log.info('Finished generating terrain');
  return smoothed;
});

ipcMain.handle('raw.clear', async (_event) => {
  dataCache.delete('heightMap');
  dataCache.delete('smoothedMap');
  dataCache.delete('terrainSize');
});

ipcMain.handle('mesh.export', async (event, meshData) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Meshes',
    defaultPath: 'meshery.obj',
    filters: [{ name: 'OBJ File', extensions: ['obj'] }]
  });
  if (!canceled && filePath) {
    try {
      await fs.promises.writeFile(filePath, meshData);
      log.info(`File saved: ${filePath}`);
      shell.showItemInFolder(filePath);
    } catch (error) {
      log.error('Unable to save file!', error);
    }
  }
});