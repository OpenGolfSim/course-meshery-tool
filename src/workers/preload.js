import { contextBridge, ipcRenderer } from 'electron/renderer';
import 'electron-log/preload';

contextBridge.exposeInMainWorld('ogs_worker', {
  onStartJob: (callback) => ipcRenderer.on('job', callback),
  onResults: (data) => ipcRenderer.send('results', data)
});
