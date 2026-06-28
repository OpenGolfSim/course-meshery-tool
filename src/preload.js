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
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard.copy', text),
  on: (event, callback) => ipcRenderer.on(event, callback),
  off: (event, callback) => ipcRenderer.off(event, callback),
  // onError: (callback) => ipcRenderer.on('error', callback),
  
  app: {
    exit: () => ipcRenderer.invoke('app.exit')
  },
  colors: {
    palette: () => ipcRenderer.invoke('colors.palette')
  },
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
    saveSVG: (options) => ipcRenderer.invoke('project.saveSVG', options),
    // meshes
    generateMeshes: (layerSettings, terrainSettings) => ipcRenderer.invoke('project.generateMeshes', layerSettings, terrainSettings),
    getMeshDataState: () => ipcRenderer.invoke('project.getMeshDataState'),
    getMeshDataForLayer: (layerId) => ipcRenderer.invoke('project.getMeshDataForLayer', layerId),
    updateLayerById: (layerId, update) => ipcRenderer.invoke('project.updateLayerById', layerId, update),
    exportMeshes: (exportSettings, data) => ipcRenderer.invoke('project.exportMeshes', exportSettings, data),
    updateTrees: (trees) => ipcRenderer.invoke('project.updateTrees', trees),
    updateHoleByNumber: (holeNumber, update) => ipcRenderer.invoke('project.updateHoleByNumber', holeNumber, update),

    updateScene: (update) => ipcRenderer.invoke('project.updateScene', update),
    getHeightMap: () => ipcRenderer.invoke('project.getHeightMap'),
    // saveWrite: (settings) => ipcRenderer.invoke('project.saveWrite', settings),

    // saveProject: (trees) => ipcRenderer.invoke('project.updateTrees', trees)
  },
  trees: {
    import: (treeLayerId) => ipcRenderer.invoke('trees.import', treeLayerId),
    // postImport: (treeLayerId, treeConfigId, imageData) => ipcRenderer.invoke('trees.postImport', treeLayerId, treeConfigId, imageData),
    remove: (treeLayerId, treeConfigId) => ipcRenderer.invoke('trees.remove', treeLayerId, treeConfigId),

    addLayer: () => ipcRenderer.invoke('trees.addLayer'),
    updateLayer: (layerId, layerUpdate) => ipcRenderer.invoke('trees.updateLayer', layerId, layerUpdate),
    removeLayer: (layerId) => ipcRenderer.invoke('trees.removeLayer', layerId)

  },
  terrain: {
    getToken: () => ipcRenderer.invoke('terrain.token'),
    applySmoothing: (data, radius) => ipcRenderer.invoke('terrain.applySmoothing', data, radius),
    saveHeightMap: (data, heightScale) => ipcRenderer.invoke('terrain.saveHeightMap', data, heightScale),
    generate: (type) => ipcRenderer.invoke('terrain.generate', type),
  },
  imagery: {
    hillShade: () => ipcRenderer.invoke('imagery.hillShade'),
    satellite: (wmsSource) => ipcRenderer.invoke('imagery.satellite', wmsSource),
    downloadDEM: (bounds) => ipcRenderer.invoke('imagery.downloadDEM', bounds)
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
    getToolsPath: () => ipcRenderer.invoke('tools.getToolsPath'),
    changeToolsPath: () => ipcRenderer.invoke('tools.changeToolsPath'),
    checkInstallState: () => ipcRenderer.invoke('tools.checkInstallState'),
    installStart: () => ipcRenderer.invoke('tools.installStart'),
    installCancel: () => ipcRenderer.invoke('tools.installCancel'),
  },
});