
// Surface presets. tileSize is in world units (1 texture repeat per N units).
// Texture paths are URIs relative to the output .gltf file.
export const TEXTURE_MAP = {
  fairway: {
    tileSize: 2.0,
    baseColor: 'gen_fairway_tex.png',
    normal:    'gen_fairway_map.png',
    normalScale: [0.8, 1],
    // orm:       'fairway_orm.png',     // R=AO, G=rough, B=metal
    roughnessFactor: 0.95,
    // tint: 'rgb(255, 247, 214)',
    tint: 'hsl(20, 60%, 83%)',
  },
  first_cut: {
    tileSize: 2.0,
    baseColor: 'gen_fairway_tex.png',
    normal:    'gen_fairway_map.png',
    // tint: 'rgb(240, 233, 204)',
    normalScale: [0.5, 1],
    // orm:       'fairway_orm.png',     // R=AO, G=rough, B=metal
    roughnessFactor: 0.95,
    tint: 'hsl(27, 46%, 78%)',
  },
  green: {
    tileSize: 2.0,
    baseColor: 'gen_green_tex.png',
    normal:    'gen_green_map.png',
    normalScale: [0.3, 0.3],
    roughnessFactor: 0.95,
    // tint:'rgb(248, 255, 238)',
    tint: 'hsl(27, 46%, 85%)',
  },
  fringe: {
    tileSize: 2.5,
    baseColor: 'gen_green_tex.png',
    normal:    'gen_green_map.png',
    tint: 'hsl(27, 44%, 83%)',
    normalScale: [0.7, 0.7],
    roughnessFactor: 0.95,
  },
  tee: {
    tileSize: 1.0,
    baseColor: 'gen_fairway_tex.png',
    normal:    'gen_fairway_map.png',
    normalScale: [0.8, 1],
    // tint:'rgb(220, 234, 199)',
    roughnessFactor: 0.98,
    tint: 'hsl(20, 60%, 83%)',
  },
  rough: {
    tileSize: 3.0,
    baseColor: 'gen_semi_tex.png',
    normal:    'gen_semi_map.png',
    roughnessFactor: 0.98,
    normalScale: [0.7, 0.7],
    tint: 'hsl(20, 60%, 83%)',
  },
  deep_rough: {
    tileSize: 3.0,
    baseColor: 'gen_rough_tex.png',
    normal:    'gen_rough_map.png',
    normalScale: [1, 1],
    roughnessFactor: 0.98,
    tint: 'hsl(20, 60%, 83%)',
  },
  base: {
    tileSize: 3.0,
    baseColor: 'gen_rough_tex.png',
    normal:    'gen_rough_map.png',
    normalScale: [0.2, 0.4],
    roughnessFactor: 0.98,
    tint: 'rgb(212, 181, 156)',
  },
  sand: {
    tileSize: 2.5,
    baseColor: 'gen_sand_tex.png',
    normal:    'gen_sand_map.png',
    roughnessFactor: 1.0,
    tint: 'rgb(214, 197, 163)',
  },
  water: {
    tileSize: 1.5,
    baseColor: 'ground_color_dark.jpg',
    normal:    'ground_normal_gl.jpg',
    roughnessFactor: 1.0,
  },
  river: {
    tileSize: 1.5,
    baseColor: 'ground_color_dark.jpg',
    normal:    'ground_normal_gl.jpg',
    roughnessFactor: 1.0,
  },
  pine_straw: {
    tileSize: 1.5,
    baseColor: 'pine_straw_map.jpg',
    normal:    'pine_straw_normal.jpg',
    roughnessFactor: 1.0,
  },
  // Fallback for layers whose surface isn't textured yet — uses layer.color.
  _default: { tileSize: 2.0, roughnessFactor: 0.9 },
};