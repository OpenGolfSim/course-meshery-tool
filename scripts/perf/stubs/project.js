// Perf-harness stub for src/lib/project.js.
//
// project.js transitively pulls in Electron (dialog/ipcMain/shell) and a long
// chain of Electron-coupled modules (window.js, app.js, workers/index.js, ...)
// that can't load outside a real Electron process. The harness only needs
// src/lib/svg.js's parseSVG()/parseCourseLayers(), which read `openProject`
// only inside generateSVG()/geoJSONToSvgPaths() (not used here) — so an empty
// stub is safe. See scripts/perf/babel-hook.js for the require-time redirect.
module.exports = { openProject: {} };
