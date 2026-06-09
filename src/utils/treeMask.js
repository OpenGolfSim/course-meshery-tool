export const SIZE = 512;

export function positionsToMaskData(posMap, size = SIZE) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (const entry of posMap) {
    const i   = Array.isArray(entry) ? entry[0] : entry.i;
    const val = Array.isArray(entry) ? entry[1] : entry.val;
    const ci = i * 4;
    data[ci] = val;
    data[ci + 1] = val;
    data[ci + 2] = val;
    data[ci + 3] = val > 0 ? 255 : 0;
  }
  return { data, width: size, height: size };
}