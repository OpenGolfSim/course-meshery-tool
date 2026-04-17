import fs from 'fs';
import { app } from 'electron';
import Store from 'electron-store';

const store = new Store();

export function resourceRoot() {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

export function getRecentProjects() {
  const projects = store.get('recentProjects', []);
  const filtered = projects.filter(project => {
    return project._filePath && fs.existsSync(project._filePath);
  });
  store.set('recentProjects', [...filtered]);
  return filtered;
}

export function addToRecent(project) {
  const { name, _filePath } = project;
  const recent = getRecentProjects();
  // cap recent projects
  store.set('recentProjects', [
    { name, _filePath },
    ...recent.slice(0, 5)
  ]);
}