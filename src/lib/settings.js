const defaultDig = {
  enabled: false,
  depth: 0,
  distance: 1,
  curve: 'linear',
  curvePower: 1,
  curvePoints: [[0, 1], [0.25, 1], [0.25, 0], [1, 0]]
};

export const defaultSettings = {
  rough: {
    spacing: 4,
    spacingEdge: 0,
    blend: 0.5,
    dig: { ...defaultDig }
  },
  fairway: {
    spacing: 1,
    spacingEdge: 0.3,
    blend: 1,
    dig: { ...defaultDig }
  },
  tee: {
    spacing: 0.4,
    spacingEdge: 0.2,
    blend: 0.3,
    dig: { ...defaultDig }
  },
  first_cut: {
    spacing: 1,
    spacingEdge: 0.5,
    blend: 0.5,
    dig: { ...defaultDig }
  },
  green: {
    spacing: 0.6,
    spacingEdge: 0.3,
    blend: 0.5,
    dig: { ...defaultDig }
  },
  fringe: {
    spacing: 0.6,
    spacingEdge: 0.3,
    blend: 0.5,
    dig: { ...defaultDig }
  },
  sand: {
    spacing: 0.5,
    spacingEdge: 0.25,
    blend: 0.5,
    dig: { enabled: true, depth: 1, distance: 0.5, curve: 'bezier', curvePoints: [[0, 1], [0.25, 1], [0.25, 0], [1, 0]] }
  },
  water: {
    spacing: 3,
    spacingEdge: 0.5,
    blend: 0.5,
    dig: { enabled: true, depth: 4, distance: 1, curve: 'bezier', curvePoints: [[0, 1], [0.05, 1], [0.5, 0], [1, 0]] }
  },
  river: {
    spacing: 0.5,
    spacingEdge: 0.25,
    blend: 0.5,
    dig: { enabled: true, depth: 1, distance: 0.25, curve: 'bezier', curvePoints: [[0, 1], [0.05, 1], [0.5, 0], [1, 0]] }
  },
  concrete: {
    spacing: 2,
    spacingEdge: 2,
    blend: 0,
    dig: { ...defaultDig }
  },
  dirt: {
    spacing: 2,
    spacingEdge: 0.5,
    blend: 0.5,
    dig: { ...defaultDig }
  },
}