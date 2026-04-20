import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import logger from 'electron-log';
import { resourceRoot } from './app';

const MATCHER = /#([0-9a-z]+)\s#([\w]+)/i;
const PALETTE_PATH = path.join(resourceRoot(), 'extra-resources/palette.gpl');

const log = logger.scope('PALETTE');

let colorCache = null;
let surfaceMap = new Map();
let colorMap = new Map();

export function getColor(surface) {
  return surfaceMap.get(surface);
}

export async function parsePalette() {
  if (colorCache) {
    return colorCache;
  }
  log.info(`Loading color palette from: ${PALETTE_PATH}`);
  const paletteData = await fs.promises.readFile(PALETTE_PATH);

  const paletteLines = paletteData.toString('utf-8').toLowerCase().split('\n');

  surfaceMap = new Map();
  colorMap = new Map();
  const colors = {};
  for (const line of paletteLines) {
    const matches = line.match(MATCHER);
    if (matches) {
      const [, hex, surface] = matches;
      if (hex && surface) {
        colors[hex] = surface;
        surfaceMap.set(surface, hex);
        colorMap.set(hex, surface);
      }
    }
  }
  console.log('surfaceMap', [...surfaceMap.entries()]);
  colorCache = colors;
  return colors;
}

export function hexToRGB01(hex) {
  // Remove the hash if it exists
  hex = hex.replace(/^#/, '');

  // Parse the hex strings to decimal integers (0-255)
  const rInt = parseInt(hex.substring(0, 2), 16);
  const gInt = parseInt(hex.substring(2, 4), 16);
  const bInt = parseInt(hex.substring(4, 6), 16);

  // Normalize to 0-1 range by dividing by 255
  return [
    +(rInt / 255).toFixed(3),
    +(gInt / 255).toFixed(3),
    +(bInt / 255).toFixed(3),
    1
  ];
}