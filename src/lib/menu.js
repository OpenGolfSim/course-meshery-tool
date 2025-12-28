import { app, dialog, Menu, Tray, shell } from 'electron';

let appMenu;

export function buildAppMenu() {

  appMenu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'About Meshery',
          role: 'about'
        },
        {
          label: 'Settings',
          click: async () => {

          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Meshery' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [

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
}