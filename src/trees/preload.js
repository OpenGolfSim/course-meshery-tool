// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron/renderer';
import 'electron-log/preload';

contextBridge.exposeInMainWorld('trees', {
  getTrees: () => ipcRenderer.invoke('treeMaker.get'),
  selectTree: (lodNum) => ipcRenderer.invoke('treeMaker.select', lodNum),
  export: (thumbnail) => ipcRenderer.invoke('treeMaker.export', thumbnail),
});