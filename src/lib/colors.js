const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const MATCHER = /#([0-9a-z]+)\s#([\w]+)/i;

const PALETTE_PATH = path.join(app.getAppPath(), 'data/palette.gpl');

console.log('PALETTE_PATH', PALETTE_PATH);

export async function parsePalette() {
  const paletteData = await fs.promises.readFile(PALETTE_PATH);

  const paletteLines = paletteData.toString('utf-8').toLowerCase().split('\n');
  const colors = {};
  for (const line of paletteLines) {
    const matches = line.match(MATCHER);
    console.log(matches);
    if (matches) {
      const [, hex, surface] = matches;
      console.log(hex, surface);
      if (hex && surface) {
        colors[hex] = surface;
      }
    }
  }
  return colors;
}