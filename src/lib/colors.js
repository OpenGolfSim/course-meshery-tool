let colorCache = null;

export const surfaceMap = new Map();
export const colorMap = new Map();
export const idMap = new Map();

export const SurfacePalette = {
  base: {
    hex: '#627566',
    id: 0,
  },
  fairway: {
    hex: '#00C423',
    id: 1,
  },
  first_cut: {
    hex: '#478f54',
    id: 2,
  },
  rough: {
    hex: '#115B13',
    id: 3,
  },
  deep_rough: {
    hex: '#003000',
    id: 4,
  },
  fringe: {
    hex: '#82DDA0',
    id: 5,
  },
  green: {
    hex: '#8EFEB4',
    id: 6,
  },
  tee: {
    hex: '#86B59A',
    id: 7,
  },
  sand: {
    hex: '#E5DBA7',
    id: 8,
  },
  concrete: {
    hex: '#BABABA',
    id: 9,
  },
  dirt: {
    hex: '#574c3a',
    id: 10,
  },
  pine_straw: {
    hex: '#6b4224',
    id: 11,
  },
  water: {
    hex: '#2967D5',
    id: 12,
  },
  river: {
    hex: '#00ccff',
    id: 13,
  },
  river_flow: {
    hex: '#5900ff',
    id: 14,
  },
};

Object.entries(SurfacePalette).forEach(([surface, props]) => {
  const { hex, id } = props;
  // colors[hex] = surface;
  const hexId = getHexId(hex);
  surfaceMap.set(surface, hexId);
  colorMap.set(hexId, surface);
  idMap.set(hexId, id);
});

export function generateInkscapePalette() {
  const content = Object.entries(SurfacePalette)
  // skip base color (only used as fallback)
  .filter(([surface]) => surface !== 'base')
  .map(([surface, attr]) => {
    const rgb = hexToRgb(attr.hex);
    return [
      rgb.r.toString().padStart(3, ' '),
      rgb.g.toString().padStart(3, ' '),
      rgb.b.toString().padStart(3, ' '),
      attr.hex.toUpperCase(),
      `#${surface}`
    ].join(' ');
  });

  const lines = [
    'GIMP Palette',
    `Name: OpenGolfSim Surfaces v5`,
    '#',
    ...content
  ];
  return lines.join('\n');
}

function hexToRgb(hex) {
  // Remove the hash if it exists
  let cleanHex = hex.replace('#', '');

  // Handle shorthand format (like "F3F") by expanding it to "FF33FF"
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }

  // Parse the hexadecimal strings into integers
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  return { r, g, b };
}


/**
 * Takes a hex color code and normalizes to lowercase unique hex ID
 * @param {string} hex The input hex color
 * @returns 
 */
export function getHexId(hex) {
  return hex.toLowerCase().replace(/#/g, '');
}

export function getColor(surface) {
  return surfaceMap.get(surface);
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