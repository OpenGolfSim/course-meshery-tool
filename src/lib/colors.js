const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const log = require('electron-log');
const { resourceRoot } = require('./app');

const MATCHER = /#([0-9a-z]+)\s#([\w]+)/i;

const PALETTE_PATH = path.join(resourceRoot(), 'extra-resources/palette.gpl');

let colorCache = null;

export async function parsePalette() {
  if (colorCache) {
    return colorCache;
  }
  const paletteData = await fs.promises.readFile(PALETTE_PATH);

  const paletteLines = paletteData.toString('utf-8').toLowerCase().split('\n');

  const colors = {};
  for (const line of paletteLines) {
    const matches = line.match(MATCHER);
    if (matches) {
      const [, hex, surface] = matches;
      if (hex && surface) {
        colors[hex] = surface;
      }
    }
  }
  colorCache = colors;
  return colors;
}