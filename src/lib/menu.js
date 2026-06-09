import { app, dialog, Menu, Tray, shell } from 'electron';
import * as project from './project';
import { isInstalled } from './tools';

let appMenu;
let exportRawMenu;

export function buildAppMenu() {
  const isMac = process.platform === 'darwin'

  appMenu = Menu.buildFromTemplate([
    ...(isMac
    ? [{
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }]
    : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project',
          click: () => project.open(),
          enabled: isInstalled(),
          accelerator: 'CommandOrControl+O'
        },
        {
          label: 'Close Project',
          click: () => project.close(),
          enabled: project.isOpen(),
          accelerator: 'CommandOrControl+O'
        },
        // {
        //   label: 'Save Project',
        //   click: project.save,
        //   enabled: isInstalled(),
        //   accelerator: 'CommandOrControl+S'
        // },

        // { type: 'separator' },
        // {
        //   id: 'export-raw',
        //   label: 'Export RAW Terrain',
        //   click: project.save,
        //   accelerator: 'CommandOrControl+S'
        // },
        // {
        //   id: 'export-raw',
        //   label: 'Export Satellite Imagery',
        //   click: project.save,
        //   accelerator: 'CommandOrControl+S'
        // },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        ...!isMac ? [{ role: 'about' }] : [],
        {
          label: 'Join our Discord',
          click: async () => {
            await shell.openExternal('https://help.opengolfsim.com/connect-with-us')
          }
        },
        {
          label: 'Documentation and Support',
          click: async () => {
            await shell.openExternal('https://help.opengolfsim.com/tools/')
          }
        }
      ]
    }
  ]);

  Menu.setApplicationMenu(appMenu);

  exportRawMenu = appMenu.getMenuItemById('export-raw');
  
}
