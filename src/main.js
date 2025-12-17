const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { parseSVG } = require('./lib/svg');
const { parsePalette } = require('./lib/colors');
const { parseRaw } = require('./lib/heightmap');

let formContext = {
  layers: [],
  svg: null,
  raw: null
};

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
      nodeIntegrationInWorker: true
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
    formContext.palette = await parsePalette();
  } catch (error) {
    console.log(error);
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
ipcMain.handle('state.get', async () => {
  return formContext;
});

ipcMain.handle('svg.select', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select SVG File',
    filters: [
      { name: 'SVG Files', extensions: ['svg'] },
    ]
  });
  const [svgPath] = result.filePaths;
  if (result.canceled || !svgPath) {
    formContext.layers = [];
    formContext.width = null;
    formContext.height = null;
    return formContext;
  }

  // console.log('palette', palette);
  // return palette;
  const { layers, width, height } = await parseSVG(svgPath, formContext.palette);
  formContext = {
    ...formContext,
    layers,
    width,
    height,
    svg: svgPath
  };
  return formContext;
});
ipcMain.handle('svg.clear', async () => {
  formContext = {
    ...formContext,
    layers: [],
    svg: null,
    height: null,
    width: null
  };
  return formContext;
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
    return formContext;
  }
  const heightMap = await parseRaw(rawPath);
  formContext = {
    ...formContext,
    raw: rawPath,
    heightMap
  };
  return formContext;
});

ipcMain.handle('raw.clear', async (event, layer) => {
  formContext = {
    ...formContext,
    raw: null,
    heightMap: null
  };
  return formContext;
});

ipcMain.handle('mesh.export', async (event, meshData) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Meshes',
    defaultPath: 'meshery.obj',
    filters: [{ name: 'OBJ File', extensions: ['obj'] }]
  });
  if (!canceled && filePath) {
    await fs.promises.writeFile(filePath, meshData);
    console.log('File saved!');
  }
});