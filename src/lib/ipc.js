import { app, session, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as lidar from './lidar';
import * as map from './map';
import * as project from './project';
import * as imagery from './imagery';
import * as tools from './tools';
import { getRecentProjects } from './app';


ipcMain.handle('app.exit', async (_event, options) => {
  app.quit();
});

ipcMain.handle('dialog.confirm', async (_event, options) => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Cancel', 'Confirm'],
    defaultId: 0,
    title: 'Confirmation',
    message: 'Are you sure?',
    ...options
  });
  return result.response;
});

ipcMain.handle('project.getOpenProject', (_event) => project.getOpenProject());
ipcMain.handle('project.createProject', (_event) => project.createProject());
ipcMain.handle('project.openExisting', (_event) => project.openExisting());
ipcMain.handle('project.saveSVG', (_event) => project.saveSVG());
ipcMain.handle('project.openRecent', (_event, p) => project.openRecent(p));
ipcMain.handle('project.storeSettings', (_event, settings) => project.storeSettings(settings));
ipcMain.handle('project.getSettings', (_event) => project.getSettings());
ipcMain.handle('project.recent', (_event) => getRecentProjects());
// ipcMain.handle('project.reloadSVG', (_event) => project.reloadSVG());
// ipcMain.handle('project.saveWrite', (_event, settings) => project.saveWrite(settings));

ipcMain.handle('svg.refresh', (_event) => project.refreshSVG());
ipcMain.handle('svg.getMeshLayers', (_event) => project.getMeshLayers());

ipcMain.handle('map.lidarSources', (_event) => map.lidarSources());
ipcMain.handle('map.searchShapes', (_event, coords) => map.searchShapes(coords));
ipcMain.handle('map.listEndpoints', (_event) => map.listEndpoints());

ipcMain.handle('lidar.downloadCourse', (_event, lidarGeoJson, courseBounds) => lidar.downloadCourse(lidarGeoJson, courseBounds));
ipcMain.handle('lidar.readOpenFile', (_event) => lidar.readOpenFile());

ipcMain.handle('imagery.raw', (_event) => imagery.generateRAWFile());
ipcMain.handle('imagery.hillShade', (_event) => imagery.generateHillShade());
ipcMain.handle('imagery.satellite', (_event, wmsSource) => imagery.generateSatelliteImage(wmsSource));


ipcMain.handle('tools.checkInstallState', () => tools.checkInstallState());
ipcMain.handle('tools.installStart', () => tools.installStart());
ipcMain.handle('tools.installCancel', () => tools.installCancel());