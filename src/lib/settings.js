const defaultBlend = {
  enabled: false,
  distance: 0,
  spacing: 0.5,
  distance: 0,          // blend zone width in meters
  noiseFreq: 0.5,       // how often the edge wiggles (higher = more jagged)
  noiseAmp: 0.3,        // how far the edge wanders (0-1, multiplied by distance)
  patchy: false,         // true = clumpy patches, false = gradient
};

const defaultDig = {
  enabled: false,
  depth: 0,
  distance: 1,
  curve: 'linear',
  curvePower: 1,
  curvePoints: [[0, 1], [0.25, 1], [0.25, 0], [1, 0]]
};

export const defaultSettings = {
  base: {
    spacing: 5,
    // spacingEdge: 0,
    blend: 0,
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  deep_rough: {
    spacing: 4,
    // spacingEdge: 0,
    blend: 0.5,
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  rough: {
    spacing: 3,
    // spacingEdge: 0,
    blend: 0.5,
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  fairway: {
    spacing: 1,
    // spacingEdge: 0.3,
    blend: 1,
    blending: { ...defaultBlend },
    // blending: { enabled: true, distance: 0.25, spacing: 0.5 },
    dig: { ...defaultDig }
  },
  tee: {
    spacing: 0.3,
    // spacingEdge: 0.2,
    blend: 0.3,
    // blending: { enabled: true, distance: 0.1, spacing: 0.1 },
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  first_cut: {
    spacing: 0.5,
    // spacingEdge: 0.5,
    blend: 0.5,
    // blending: { enabled: true, distance: 0.25, spacing: 0.5 },
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  green: {
    spacing: 0.5,
    // spacingEdge: 0.3,
    blend: 0.5,
    blending: { ...defaultBlend },
    // blending: {
    //   enabled: true,
    //   distance: 1.0,       // narrow blend zone
    //   noiseFreq: 0.9,      // gentle undulation
    //   noiseAmp: 0.4,      // subtle edge wander
    //   lipDarken: 0,
    //   dirtTint: '#5a4a32',
    //   dirtWidth: 0,
    //   dirtStrength: 0,
    //   sandNoiseFreq: 0.15,          // scale of sand color variation
    //   sandVariationStrength: 0.3,    // how much dark patches show (0-1)
    //   sandLowDarken: 0.25,           // how much lower spots darken (0-1)
    //   sandBaseHeight: 0,             // reference height — set to bunker floor Y
    // },    
    dig: { ...defaultDig }
  },
  fringe: {
    spacing: 0.6,
    // spacingEdge: 0.3,
    blend: 0.5,
    // blending: { enabled: true, distance: 0.25, spacing: 0.25 },
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  sand: {
    spacing: 0.1,
    blend: 0.5,
    blending: {
      enabled: true,
      distance: 0.45,       // narrow blend zone
      noiseFreq: 0.8,      // gentle undulation
      noiseAmp: 0.8,      // subtle edge wander
      lipDarken: 0.35,
      dirtTint: '#5a4a32',
      dirtWidth: 0.15,
      dirtStrength: 0.5,
      sandNoiseFreq: 0.15,          // scale of sand color variation
      sandVariationStrength: 0.3,    // how much dark patches show (0-1)
      sandLowDarken: 0.25,           // how much lower spots darken (0-1)
      sandBaseHeight: 0,             // reference height — set to bunker floor Y
    },
    // blending: { ...defaultBlend },
    dig: {
      enabled: true,
      depth: 0.25,
      distance: 0.25,
      curve: 'bezier',
      curvePoints: [[0, 1], [0, 0.75], [0.25, 0], [1, 0]]
    }
  },
  water: {
    spacing: 2.5,
    // spacingEdge: 0.5,
    blend: 0.5,
    // blending: { enabled: true, distance: 0.2, spacing: 0.5 },
    blending: {
      enabled: true,
      distance: 1,       // narrow blend zone
      noiseFreq: 0.8,      // gentle undulation
      noiseAmp: 0.8,      // subtle edge wander
      lipDarken: 0.35,
      dirtTint: '#5a4a32',
      dirtWidth: 0.15,
      dirtStrength: 0.5,
    },
    // blending: { ...defaultBlend },
    dig: { enabled: true, depth: 6, distance: 0.1, curve: 'bezier', curvePoints: [[0, 1], [0.05, 1], [0.5, 0], [1, 0]] }
  },
  river: {
    spacing: 0.2,
    // spacingEdge: 0.25,
    blend: 0.5,
    blending: {
      enabled: true,
      distance: 0.25,       // narrow blend zone
      noiseFreq: 1.1,      // gentle undulation
      noiseAmp: 0.1,      // subtle edge wander
      lipDarken: 0.05,
      dirtTint: '#5a4a32',
      dirtWidth: 0.01,
      dirtStrength: 0.1,
    },
    // blending: { ...defaultBlend },
    dig: { enabled: true, depth: 0.5, distance: 0.25, curve: 'bezier', curvePoints: [[0, 1], [0.05, 1], [0.5, 0], [1, 0]] }
  },
  concrete: {
    spacing: 2,
    // spacingEdge: 2,
    blend: 0,
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  dirt: {
    spacing: 2,
    // spacingEdge: 0.5,
    blend: 0.5,
    // blending: { enabled: true, distance: 0.25, spacing: 0.5 },
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  plane_river: {
    spacing: 1,
    // spacingEdge: 0,
    blend: 0,
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  plane_lake: {
    spacing: 2,
    // spacingEdge: 0,
    blend: 0,
    blending: { ...defaultBlend },
    dig: { ...defaultDig }
  },
  pine_straw: {
    spacing: 1,
    // spacingEdge: 0,
    // blend: 0,
    // blending: { ...defaultBlend },
    blend: 0.5,
    // blending: { ...defaultBlend },
    blending: {
      enabled: true,
      distance: 2.0,       // narrow blend zone
      noiseFreq: 0.8,      // gentle undulation
      noiseAmp: 0.8,      // subtle edge wander
      lipDarken: 0.0,
      dirtTint: '#5a4a32',
      dirtWidth: 0.0,
      dirtStrength: 0.0,
      sandNoiseFreq: 0.15,          // scale of sand color variation
      sandVariationStrength: 0.3,    // how much dark patches show (0-1)
      sandLowDarken: 0.25,           // how much lower spots darken (0-1)
      sandBaseHeight: 0,             // reference height — set to bunker floor Y
    },
    dig: { ...defaultDig }
  }
}