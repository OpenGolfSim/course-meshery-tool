// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron/renderer';

import 'electron-log/preload';

contextBridge.exposeInMainWorld('meshery', {
  selectSVGFile: () => ipcRenderer.invoke('svg.select'),
  clearSVG: () => ipcRenderer.invoke('svg.clear'),
  selectTerrainFile: () => ipcRenderer.invoke('raw.select'),
  clearTerrain: () => ipcRenderer.invoke('raw.clear'),
  exportMeshes: (meshData) => ipcRenderer.invoke('mesh.export', meshData),
  generateTerrain: (options) => ipcRenderer.invoke('raw.generate', options),
  // getCurrentState: () => ipcRenderer.invoke('state.get'),
  openExternalUrl: (href) => ipcRenderer.invoke('url.open', href),
  on: (event, callback) => ipcRenderer.on(event, callback),
  off: (event, callback) => ipcRenderer.off(event, callback),
  // onError: (callback) => ipcRenderer.on('error', callback),
});