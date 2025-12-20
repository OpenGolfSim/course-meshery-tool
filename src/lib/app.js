import { app } from 'electron';

export function resourceRoot() {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}
