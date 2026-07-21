import { app, dialog, Menu, Tray, shell } from 'electron';
import fs from 'fs';
import * as project from './project';
import { isInstalled } from './tools';
import { createTreeMakerWindow } from '../trees/main';
import { generateInkscapePalette } from './colors';

let appMenu;
let exportRawMenu;

async function generatePaletteFile() {
  const result = await dialog.showSaveDialog({
    title: 'Save Inkscape Palette',
    defaultPath: 'OpenGolfSimPalette.gpl', 
  });
  if (!result.canceled && result.filePath) {
    const data = generateInkscapePalette();
    console.log('write data:', data);
    console.log(' to ->', result.filePath);
    await fs.promises.writeFile(result.filePath, data);
  }
}

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
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Tree Maker',
          click: () => createTreeMakerWindow()
        },
        {
          label: 'Generate Inkscape Palette',
          click: () => generatePaletteFile()
        },
      ]
    },
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
