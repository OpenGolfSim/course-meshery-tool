const { app, shell, BrowserWindow, ipcMain, dialog } = require('electron');
const log = require('electron-log');
const path = require('node:path');
const fs = require('node:fs');
const { parseSVG } = require('./lib/svg');
const { parsePalette } = require('./lib/colors');
const { parseRaw } = require('./lib/heightmap');

// let formContext = {
//   layers: [],
//   svg: null,
//   raw: null
// };
let palette;

log.initialize();

// let svgState = { layers: [], svg: null };
// let rawState = { raw: null };

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      // nodeIntegrationInWorker: true
      nodeIntegration: false, // Recommended practice is to keep false in renderer
      contextIsolation: true, // Recommended practice is to keep true
      nodeIntegrationInWorker: true, // This enables Node.js APIs in the worker
      sandbox: false // Must be false for nodeIntegrationInWorker to work
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  try {
    palette = await parsePalette();
  } catch (error) {
    log.error(error);
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

// ipcMain.handle('svg.clear', async () => {
//   formContext = {
//     ...formContext,
//     layers: [],
//     svg: null,
//     height: null,
//     width: null
//   };
//   return formContext;
// });

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
  const heightMap = await parseRaw(rawPath);

  return {
    // ...formContext,
    raw: rawPath,
    heightMap
  };
  // return formContext;
});

// ipcMain.handle('raw.clear', async (event, layer) => {
//   formContext = {
//     ...formContext,
//     raw: null,
//     heightMap: null
//   };
//   return formContext;
// });

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
    } catch (error) {
      log.error('Unable to save file!', error);
    }
  }
});