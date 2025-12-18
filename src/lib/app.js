const { app } = require('electron');

function resourceRoot() {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

module.exports = { resourceRoot };