require('./babel-hook');

// mesh.worker.js's triangulatePiece() uses `poisson-disk-sampling` without
// passing it a seeded RNG, so it falls back to Math.random() internally.
// That's fine for the real app, but makes sampling non-reproducible run to
// run, which defeats the harness's before/after comparisons.
//
// The first approach here monkey-patched the global Math.random — that
// turned out to be fragile: poisson-disk-sampling's output is sensitive to
// the exact *count* of Math.random() calls made anywhere earlier in the
// process, so something as unrelated as adding an unused import shifted
// the sampled points. mesh.worker.js now exposes __setTestRngFactory(), a
// harness-only hook (a no-op for the real app, which never calls it) that
// passes an explicit per-instance seeded RNG straight into each
// `new PoissonDiskSampling(options, rng)` call — immune to unrelated
// Math.random() calls anywhere else, since it never touches the global.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const meshWorker = require('../../src/lib/workers/mesh.worker.js');
// A fresh, independently-seeded generator per PoissonDiskSampling instance
// (each call to the factory), so results don't depend on how many PDS
// instances a shape needed (e.g. how many tiles Stage 3 visited) - only on
// the fixed base seed.
let pdsInstanceCount = 0;
meshWorker.__setTestRngFactory(() => mulberry32(0xc0ffee + (pdsInstanceCount++)));
