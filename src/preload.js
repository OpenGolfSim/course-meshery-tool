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
  
  dialog: {
    confirm: (options) => ipcRenderer.invoke('dialog.confirm', options)
  },
  project: {
    createProject: () => ipcRenderer.invoke('project.createProject'),
    openExisting: () => ipcRenderer.invoke('project.openExisting'),
    openRecent: (project) => ipcRenderer.invoke('project.openRecent', project),
    getOpenProject: () => ipcRenderer.invoke('project.getOpenProject'),
    save: () => ipcRenderer.invoke('project.save'),
    saveAs: () => ipcRenderer.invoke('project.saveAs'),
    storeSettings: (settings) => ipcRenderer.invoke('project.storeSettings', settings),
    getSettings: () => ipcRenderer.invoke('project.getSettings'),
    recent: () => ipcRenderer.invoke('project.recent'),
    saveSVG: () => ipcRenderer.invoke('project.saveSVG'),
    // saveWrite: (settings) => ipcRenderer.invoke('project.saveWrite', settings),
  },
  terrain: {
    getToken: () => ipcRenderer.invoke('terrain.token')
  },
  imagery: {
    hillShade: () => ipcRenderer.invoke('imagery.hillShade'),
    satellite: (wmsSource) => ipcRenderer.invoke('imagery.satellite', wmsSource),
  },
  svg: {
    export: () => ipcRenderer.invoke('svg.export'),
    refresh: () => ipcRenderer.invoke('svg.refresh'),
    getMeshLayers: () => ipcRenderer.invoke('svg.getMeshLayers'),
  },
  map: {
    searchShapes: (bounds) => ipcRenderer.invoke('map.searchShapes', bounds),
    lidarSources: () => ipcRenderer.invoke('map.lidarSources'),
    listEndpoints: () => ipcRenderer.invoke('map.listEndpoints'),
    // lidarCrop: (lidarGeoJSON, bounds) => ipcRenderer.invoke('map.lidarCrop', lidarGeoJSON, bounds)
  },
  lidar: {
    downloadCourse: (lidarGeoJSON, bounds) => ipcRenderer.invoke('lidar.downloadCourse', lidarGeoJSON, bounds),
    readOpenFile: () => ipcRenderer.invoke('lidar.readOpenFile')
  },
  tools: {
    checkInstallState: () => ipcRenderer.invoke('tools.checkInstallState'),
    installStart: () => ipcRenderer.invoke('tools.installStart'),
  }
});