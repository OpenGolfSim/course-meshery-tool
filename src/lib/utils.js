import { app } from 'electron';

export function getDateId() {
  return (new Date()).toISOString()
    .replace('T', '-')
    .replace(/[^0-9\-]/g, '');
}

export function resourceRoot() {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

