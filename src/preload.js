// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('meshery', {
  selectSVGFile: () => ipcRenderer.invoke('svg.select'),
  clearSVG: () => ipcRenderer.invoke('svg.clear'),
  selectTerrainFile: () => ipcRenderer.invoke('raw.select'),
  clearTerrain: () => ipcRenderer.invoke('raw.clear'),
  generateMesh: (layer, heightScale) => ipcRenderer.invoke('mesh.generate', layer, heightScale),
  exportMeshes: (meshData) => ipcRenderer.invoke('mesh.export', meshData),
  getCurrentState: () => ipcRenderer.invoke('state.get'),
});