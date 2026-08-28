
// Surface presets. tileSize is in world units (1 texture repeat per N units).
// Texture paths are URIs relative to the output .gltf file.
export const TEXTURE_MAP = {
  fairway: {
    tileSize: 4,
    baseColor: 'gen_fairway_tex.png',
    normal:    'gen_fairway_map.png',
    // normalScale: [0.2, 0.5],
    // orm:       'fairway_orm.png',     // R=AO, G=rough, B=metal
    roughnessFactor: 1,
    tint: 'hsl(20, 60%, 83%)',
    // tint: 'rgb(255, 247, 214)',
    // tint: 'hsl(21, 42%, 84%)',
    grass: {
      enabled: true,
      fadeStart: 40,
      fadeEnd: 120,
      shading: {
        elevation: 40,
        azimuth: 225,
        contrast: 5.0,
        slopeTint: 0.5,
      },
      mowLines: {
        direction: 45,
        width: 4,
        strength: 0.08,
        wobble: 0.3,
        fadeVariation: 0.4,
      },
      distantDetail: {
        scale: 40,
        strength: 0.4,
        rampStart: 40,
        rampEnd: 100,
      },      
    },
  },
  first_cut: {
    tileSize: 4.5,
    baseColor: 'gen_fairway_tex.png',
    normal:    'gen_fairway_map.png',
    // tint: 'rgb(240, 233, 204)',
    // normalScale: [0.1, 0.8],
    // orm:       'fairway_orm.png',     // R=AO, G=rough, B=metal
    roughnessFactor: 1,
    tint: 'hsl(20, 50%, 80%)',
    grass: {
      enabled: true,
      fadeStart: 40,
      fadeEnd: 120,
      shading: {
        elevation: 40,
        azimuth: 225,
        contrast: 5.0,
        slopeTint: 0.5,
      },
      distantDetail: {
        scale: 40,
        strength: 0.4,
        rampStart: 40,
        rampEnd: 100,
      },      
    },
  },
  green: {
    tileSize: 4,
    baseColor: 'gen_green_tex.png',
    normal:    'gen_green_map.png',
    normalScale: [0.2, 0.3],
    roughnessFactor: 1,
    // tint:'rgb(248, 255, 238)',
    tint: 'hsl(27, 46%, 85%)',
    grass: {
      enabled: true,
      fadeStart: 40,
      fadeEnd: 120,
      mowLines: {
        direction: 60,
        width: 0.5,
        strength: 0.05,
        wobble: 0.01,
        fadeVariation: 1.2,
      },
      shading: {
        elevation: 40,
        azimuth: 225,
        contrast: 20.0,
        slopeTint: 0.5
      },
      distantDetail: {
        scale: 40,
        strength: 0.4,
        rampStart: 50,
        rampEnd: 100,
      },
    },
  },
  fringe: {
    tileSize: 3.5,
    baseColor: 'gen_green_tex.png',
    normal:    'gen_green_map.png',
    tint: 'hsl(27, 30%, 82%)',
    // normalScale: [0.1, 0.4],
    roughnessFactor: 1,
    grass: {
      enabled: true,
      fadeStart: 40,
      fadeEnd: 120,
      shading: {
        elevation: 40,
        azimuth: 225,
        contrast: 20.0,
        slopeTint: 0.5
      },
      distantDetail: {
        scale: 40,
        strength: 0.4,
        rampStart: 50,
        rampEnd: 100,
      },
    },
  },
  tee: {
    tileSize: 3.0,
    baseColor: 'gen_fairway_tex.png',
    normal:    'gen_fairway_map.png',
    // normalScale: [0.8, 1],
    // tint:'rgb(220, 234, 199)',
    roughnessFactor: 1.0,
    tint: 'hsl(19, 83%, 88%)',
  },
  rough: {
    tileSize: 3.0,
    baseColor: 'gen_rough_tex.png',
    normal:    'gen_rough_map.png',
    roughnessFactor: 1.0,
    // normalScale: [0.7, 0.7],
    tint: 'hsl(20, 60%, 83%)',
    grass: {
      enabled: true,
      fadeStart: 40,
      fadeEnd: 120,
      shading: {
        elevation: 40,
        azimuth: 225,
        contrast: 5.0,
        slopeTint: 0.5
      },
      distantDetail: {
        scale: 40,
        strength: 0.4,
        rampStart: 50,
        rampEnd: 100,
      },
    },
  },
  deep_rough: {
    tileSize: 3.0,
    baseColor: 'gen_rough_tex.png',
    normal:    'gen_rough_map.png',
    // normalScale: [1, 1],
    roughnessFactor: 1.0,
    tint: 'hsl(20, 60%, 83%)',
  },
  base: {
    tileSize: 3.0,
    baseColor: 'gen_rough_tex.png',
    normal:    'gen_rough_map.png',
    normalScale: [0.2, 0.4],
    roughnessFactor: 1.0,
    tint: 'rgb(212, 181, 156)',
  },
  sand: {
    tileSize: 2.5,
    baseColor: 'gen_sand_tex.png',
    normal:    'gen_sand_map.png',
    roughnessFactor: 1.0,
    tint: 'rgb(214, 197, 163)',
    grass: {
      enabled: true,
      fadeStart: 40,
      fadeEnd: 120,
      shading: {
        contrast: 16.0,
        slopeTint: 0.8
      },
      distantDetail: {
        scale: 40,
        strength: 0.2,
        rampStart: 50,
        rampEnd: 100,
      },
    }
  },
  water: {
    tileSize: 2.5,
    baseColor: 'ground_color.png',
    normal:    'ground_normal_gl.png',
    roughnessFactor: 0.8,
    tint: 'hsl(68, 27%, 63%)',
  },
  river: {
    tileSize: 2.5,
    baseColor: 'ground_color.png',
    normal:    'ground_normal_gl.png',
    roughnessFactor: 0.8,
    tint: 'hsl(68, 27%, 63%)',
  },
  pine_straw: {
    tileSize: 2.5,
    baseColor: 'pine_straw_map.png',
    normal:    'pine_straw_normal.png',
    roughnessFactor: 1.0,
    tint: 'hsl(68, 27%, 63%)',
  },
  concrete: {
    tileSize: 2.5,
    baseColor: 'concrete_tex.png',
    normal:    'concrete_normal.png',
    roughnessFactor: 1.0,
    tint: 'hsl(67, 30%, 83%)',
  },
  custom1: {
    tileSize: 2.5,
    roughnessFactor: 1.0,
    tint: 'hsl(318, 80%, 56%)',
  },
  custom2: {
    tileSize: 2.5,
    roughnessFactor: 1.0,
    tint: 'hsl(126, 80%, 56%)',
  },
  custom3: {
    tileSize: 2.5,
    roughnessFactor: 1.0,
    tint: 'hsl(245, 80%, 56%)',
  },
  // Fallback for layers whose surface isn't textured yet — uses layer.color.
  _default: { tileSize: 2.0, roughnessFactor: 0.9 },
};