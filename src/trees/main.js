import path from 'path';
import fs from 'fs';
import { app, dialog, ipcMain, BrowserWindow, net, protocol, shell } from 'electron';
import { randomUUID } from 'crypto';
import { TREE_MAKER_FILE_PROTOCOL } from '../constants';
import { pathToFileURL } from 'url';
import { exportTreePackage } from '../lib/workers/index';
import { PLANT_CACHE } from '../lib/cache/plants';
import { cachePlant } from '../lib/app';

let treeMakerScope = new Map();
export let treeWindow;



export function handleTreeMakerProtocol(request) {
  const key = request.url.slice(TREE_MAKER_FILE_PROTOCOL.length + 3).toString(); // removes the extra "://"
  console.log('tree-key', key);
  const matches = key.match(/tree\/lod([0-9]+)\/preview/i);
  if (matches?.[1]) {
    const treeId = parseInt(matches[1], 10);
    const tree = treeMakerScope.get(treeId);
    if (tree?.path) {
      return net.fetch(pathToFileURL(tree.path).toString());
    }
  }
  return new Response('not found', {
    status: 404,
    headers: { 'content-type': 'text/html' }
  });  
}

export function getTreeById(lodNum) {
  return treeMakerScope.get(lodNum);
}
export function clearTrees() {
  treeMakerScope.clear();
}

export function createTreeMakerWindow() {
  if (treeWindow) {
    if (treeWindow.isMinimized()) treeWindow.restore();
    treeWindow.focus();
    return;
  }
  treeWindow = new BrowserWindow({
    width: 800,
    height: 500,
    backgroundColor: '#000',
    webPreferences: {
      preload: TREE_WINDOW_PRELOAD_WEBPACK_ENTRY
    },
  });
  treeWindow.on('closed', () => {
    treeWindow = null;
    clearTrees();
  });
  treeWindow.loadURL(TREE_WINDOW_WEBPACK_ENTRY);
  treeWindow.show();
}

ipcMain.handle('treeMaker.export', async (event, thumbnailUri, plantOptions = {}) => {
  const thumbnailRaw = thumbnailUri.split('base64,')?.[1];
  if (!thumbnailRaw?.length) {
    throw new Error('Missing thumbnail data');
  }

  // const result = await dialog.showSaveDialog({
  //   defaultPath: 'TreePack'
  //   // filters: [{ extensions: ['.glb'] }]
  // });
  // if (result.canceled || !result.filePath?.length) {
  //   return;
  // }

  const treeId = randomUUID();
  const filename = `custom-${treeId}.glb`;
  const filenamePNG = `custom-${treeId}.png`;
  const outputFileGLB = path.join(PLANT_CACHE, filename);
  const outputFilePNG = path.join(PLANT_CACHE, filenamePNG);


  const inputFiles = [...treeMakerScope.values()]
    .sort((a, b) => a.lod < b.lod ? -1 : 1)
    .map(tree => tree.path);
  
  // const outputFile = filePath;
  // const outputFileGLB = `${outputFile}.glb`;
  // const outputFilePNG = `${outputFile}.png`;
  console.log('inputFiles', inputFiles);
  console.log('outputFileGLB', outputFileGLB);
  console.log('outputFilePNG', outputFilePNG);
  
  await fs.promises.writeFile(outputFilePNG, Buffer.from(thumbnailRaw, 'base64'));

  // can take a while for compressing textures...
  await exportTreePackage(inputFiles, outputFileGLB);

  cachePlant({
    id: treeId,
    key: treeId,
    type: 'custom',
    title: plantOptions.title ?? 'Custom Plant',
    addedAt: new Date(),
    thumbnail: outputFilePNG,
    filePath: outputFileGLB,
  });

  // shell.showItemInFolder(outputFileGLB);

});

ipcMain.handle('treeMaker.get', () => {
  return Object.fromEntries(treeMakerScope);
  // return [...treeMakerScope.values()];
});

ipcMain.handle('treeMaker.select', async (event, lodNum) => {
  const result = await dialog.showOpenDialog({
    filters: [{ extensions: ['.glb'] }]
  });
  if (!result.canceled && result.filePaths?.length) {
    // const treeId = randomUUID();
    treeMakerScope.set(lodNum, {
      // id: treeId,
      lod: lodNum,
      name: path.basename(result.filePaths[0]),
      path: result.filePaths[0],
      uri: `${TREE_MAKER_FILE_PROTOCOL}://tree/lod${lodNum}/preview.glb`
    });
  }
  
  return Object.fromEntries(treeMakerScope);
  // return [...treeMakerScope.values()].sort((a, b) => a.lod < b.lod ? -1 : 1)

});


app.on('ready', () => {
  console.log('HANDLE PROTOCOL!');
  protocol.handle(TREE_MAKER_FILE_PROTOCOL, handleTreeMakerProtocol);
});
