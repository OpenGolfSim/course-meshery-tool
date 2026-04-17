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