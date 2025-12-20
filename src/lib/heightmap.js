import fs from 'node:fs';

export async function parseRaw(filePath, terrainSize = 4097) {
  const raw = await fs.promises.readFile(filePath);
  // Node.js Buffer → TypedArray
  return new Uint16Array(raw.buffer, raw.byteOffset, raw.length / 2);
}
