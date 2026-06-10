import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import Store from 'electron-store';

const store = new Store({
  defaults: {
    toolsPath: getDefaultInstallPath()
  }
});

const APP_NAME = 'ogs-meshery';
export const EXTRA_RESOURCE_PATH = path.join(resourceRoot(), 'extra-resources');
export const TEXTURES_PATH = path.join(EXTRA_RESOURCE_PATH, 'textures');

export function resourceRoot() {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

function getDefaultInstallPath() {

  switch (process.platform) {
    case 'win32':
      return path.join(app.getPath('home'), `.${APP_NAME}`, 'tools');
    case 'darwin':
      return path.join(app.getPath('home'), APP_NAME, 'tools');
    case 'linux':
      const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
      return path.join(dataHome, APP_NAME, 'tools');
    default:
      throw new Error('Unsupported platform');
  }
}

export async function changeToolsPath() {
  const result = await dialog.showOpenDialog({
    properties: [ 'openDirectory', 'showHiddenFiles', 'createDirectory' ],
    message: 'Select the folder to install required tools',
    defaultPath: app.getPath('home')
  });
  if (result?.canceled || !result?.filePaths?.length) {
    return;
  }
  const [filePath] = result.filePaths;
  store.set('toolsPath', filePath);
  return filePath;
}

export function getToolsPath() {
  // const legacyPath = path.join(resourceRoot(), 'python', 'tools');
  // if (fs.existsSync(legacyPath)) {
  //   return legacyPath;
  // }
  const existing = store.get('toolsPath');
  if (existing) {
    return existing;
  }
  const defaultPath = getDefaultInstallPath();
  if (defaultPath) {
    store.set('toolsPath', defaultPath);
  }
  return defaultPath;
}

export function setInstallPath(newPath) {
  store.set('toolsPath', newPath);
}

export function getRecentProjects() {
  const projects = store.get('recentProjects', []);
  const filtered = sortByOpened(filterRemoved(projects));
  console.log('filtered', filtered);
  store.set('recentProjects', [...filtered]);
  return filtered;
}

function sortByOpened(projects) {
  return projects.sort((a, b) => a.lastOpened > b.lastOpened ? -1 : 1);
}

function filterRemoved(projects) {
  return projects.filter(project => project._filePath && fs.existsSync(project._filePath));
}

export function ensureRecent(project) {
  const { name, _filePath } = project;
  const recentProjects = store.get('recentProjects', []);

  let record = { name, _filePath, lastOpened: Date.now() };
  const existingIndex = recentProjects.findIndex(r => {
    return r._filePath === _filePath;
  });

  if (existingIndex > -1) {
    recentProjects.splice(existingIndex, 1);
  }

  // cap recent projects
  const copy = sortByOpened([record, ...recentProjects]);
  store.set('recentProjects', copy.slice(0, 10));
}