const Module = require('module');
const path = require('path');

require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/],
});

// src/lib/svg.js imports `openProject` from src/lib/project.js purely for two
// functions the harness never calls (generateSVG/geoJSONToSvgPaths). Loading
// the real project.js pulls in Electron (dialog/ipcMain/shell) and a long
// chain of Electron-only modules that can't run outside a real Electron
// process, so redirect that one module to a harmless stub before anything
// requires it. Resolved-path comparison (not string matching on `request`)
// keeps this from misfiring on an unrelated "./project" import elsewhere.
const REAL_PROJECT_PATH = path.join(__dirname, '..', '..', 'src', 'lib', 'project.js');
const PROJECT_STUB_PATH = path.join(__dirname, 'stubs', 'project.js');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const resolved = originalResolveFilename.call(this, request, ...rest);
  return resolved === REAL_PROJECT_PATH ? PROJECT_STUB_PATH : resolved;
};
