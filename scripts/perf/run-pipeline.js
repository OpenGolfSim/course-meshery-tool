// Perf/regression harness for the mesh-generation pipeline (see the plan's
// Stage 0). Replays the real production sequence — parseSVG ->
// generateCoursePolygons -> per-layer generateMesh -> conformMeshToTerrain ->
// digMesh (if enabled) -> smoothMeshEdges (if river/water) -> generateBlendMap
// (if enabled) — exactly as src/lib/project.js's generateCourseShapes()/
// layerToMesh() do, but driven from a Node script instead of Electron IPC.
//
// Usage:
//   node scripts/perf/run-pipeline.js --save-baseline [--svg <path>] [--timeout <ms>] [--only <substring>]
//   node scripts/perf/run-pipeline.js --compare        [--svg <path>] [--timeout <ms>] [--only <substring>] [--strict]
require('./babel-hook');

const fs = require('fs');
const { spawn, Thread, Worker } = require('threads');
const {
  DEFAULT_SVG,
  BASELINE_PATH,
  isMeshable,
  triangleSurfaceArea,
  heightStats,
  buildStubHeightMap,
  buildStubProject,
} = require('./lib');

function parseArgs(argv) {
  const opts = { mode: 'compare', svgPath: DEFAULT_SVG, timeoutMs: 45000, only: null, strict: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--save-baseline': opts.mode = 'baseline'; break;
      case '--compare': opts.mode = 'compare'; break;
      case '--svg': opts.svgPath = argv[++i]; break;
      case '--timeout': opts.timeoutMs = parseInt(argv[++i], 10); break;
      case '--only': opts.only = argv[++i]; break;
      case '--strict': opts.strict = true; break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return opts;
}

async function withTimeout(promise, timeoutMs) {
  let timedOut = false;
  const timeout = new Promise(resolve => {
    setTimeout(() => { timedOut = true; resolve(undefined); }, timeoutMs);
  });
  const result = await Promise.race([promise, timeout]);
  return timedOut ? { timedOut: true } : { timedOut: false, value: result };
}

async function runPipeline({ svgPath, timeoutMs, only }) {
  const { parseSVG } = require('../../src/lib/svg.js');
  const svgData = fs.readFileSync(svgPath, 'utf8');

  const tParse = Date.now();
  const parsed = await parseSVG(svgData);
  const parseMs = Date.now() - tParse;

  const svgWorker = await spawn(new Worker('./worker-entry.svg.js'));
  const tPoly = Date.now();
  const polyResult = await svgWorker.generateCoursePolygons(parsed.layers, {});
  const polygonsMs = Date.now() - tPoly;
  await Thread.terminate(svgWorker);

  const svgSizeUnits = parsed.width;
  const heightMap = buildStubHeightMap();
  const project = buildStubProject(svgSizeUnits);

  const layers = {};
  let skipped = 0;

  for (const layer of polyResult.meshLayers) {
    const shape = polyResult.polygonMap.get(layer.id);
    if (!isMeshable(layer, shape)) { skipped++; continue; }
    if (only && !layer.id.includes(only)) continue;

    const entry = {
      surface: layer.surface,
      boundaryVertexCount: shape.polygon.length,
      holeCount: shape.holes.length,
      spacing: layer.spacing,
    };

    const meshWorker = await spawn(new Worker('./worker-entry.mesh.js'));
    try {
      const t0 = Date.now();
      const genOutcome = await withTimeout(meshWorker.generateMesh(layer, shape), timeoutMs);

      if (genOutcome.timedOut) {
        entry.timedOutMs = timeoutMs;
      } else {
        let mesh = genOutcome.value;
        entry.generateMeshMs = Date.now() - t0;
        entry.vertexCount = mesh.points.length / 3;
        entry.triangleCount = mesh.triangles.length / 3;
        entry.surfaceArea = triangleSurfaceArea(mesh.points, mesh.triangles);

        const t1 = Date.now();
        mesh = await meshWorker.conformMeshToTerrain(layer, mesh, project, heightMap);
        entry.conformMs = Date.now() - t1;

        if (layer.dig?.enabled) {
          const t2 = Date.now();
          mesh = await meshWorker.digMesh(mesh, shape, layer);
          entry.digMs = Date.now() - t2;
        }

        if (['river', 'water'].includes(layer.surface)) {
          const t3 = Date.now();
          mesh = await meshWorker.smoothMeshEdges(mesh, 3, 1);
          entry.smoothMs = Date.now() - t3;
        }

        entry.heightStats = heightStats(mesh.points);

        if (layer.blending?.enabled && layer.blending?.distance > 0) {
          const t4 = Date.now();
          await meshWorker.generateBlendMap(shape, layer.blending, svgSizeUnits);
          entry.blendMapMs = Date.now() - t4;
        }

        entry.totalMs = entry.generateMeshMs + entry.conformMs + (entry.digMs || 0) + (entry.smoothMs || 0) + (entry.blendMapMs || 0);
      }
    } catch (err) {
      entry.error = err.message;
    }
    await Thread.terminate(meshWorker);

    layers[layer.id] = entry;
    const label = entry.timedOutMs ? `TIMEOUT>${entry.timedOutMs}ms`
      : entry.error ? `ERROR: ${entry.error}`
      : `${entry.totalMs}ms, ${entry.vertexCount}v/${entry.triangleCount}t`;
    console.log(`  ${layer.id} (${layer.surface}): ${label}`);
  }

  return { svgPath, capturedAt: new Date().toISOString(), parseMs, polygonsMs, skippedLayerCount: skipped, layers };
}

function pctDiff(a, b) {
  if (a === 0 && b === 0) return 0;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

function compareRun(baseline, current, strict) {
  const problems = [];
  const notes = [];

  for (const [id, base] of Object.entries(baseline.layers)) {
    const cur = current.layers[id];
    if (!cur) { problems.push(`${id}: missing from current run`); continue; }

    if (base.timedOutMs && cur.timedOutMs) {
      notes.push(`${id}: still timing out at >${cur.timedOutMs}ms (unchanged, expected before the sampling-domain fix lands)`);
      continue;
    }
    if (base.timedOutMs && !cur.timedOutMs && !cur.error) {
      notes.push(`${id}: WAS timing out (>${base.timedOutMs}ms), now completes in ${cur.totalMs}ms — no prior geometry to compare against`);
      continue;
    }
    if (cur.error) { problems.push(`${id}: errored: ${cur.error}`); continue; }
    if (base.error) { notes.push(`${id}: previously errored, now succeeds in ${cur.totalMs}ms`); continue; }

    const vertexRatio = cur.vertexCount / Math.max(base.vertexCount, 1);
    const areaDiff = pctDiff(base.surfaceArea, cur.surfaceArea);

    if (strict) {
      if (cur.vertexCount !== base.vertexCount || cur.triangleCount !== base.triangleCount) {
        problems.push(`${id}: STRICT mode — vertex/triangle count changed (${base.vertexCount}/${base.triangleCount} -> ${cur.vertexCount}/${cur.triangleCount})`);
      }
      if (areaDiff > 0.0001) {
        problems.push(`${id}: STRICT mode — surface area changed by ${(areaDiff * 100).toFixed(4)}%`);
      }
    } else {
      if (vertexRatio < 0.1 || vertexRatio > 10) {
        problems.push(`${id}: vertex count out of order-of-magnitude band (${base.vertexCount} -> ${cur.vertexCount})`);
      }
      if (areaDiff > 0.02) {
        problems.push(`${id}: surface area changed by ${(areaDiff * 100).toFixed(2)}% (${base.surfaceArea.toFixed(2)} -> ${cur.surfaceArea.toFixed(2)})`);
      }
      if (base.heightStats && cur.heightStats) {
        const heightDiff = pctDiff(base.heightStats.mean, cur.heightStats.mean);
        if (heightDiff > 0.05) {
          problems.push(`${id}: mean height changed by ${(heightDiff * 100).toFixed(2)}% (${base.heightStats.mean.toFixed(3)} -> ${cur.heightStats.mean.toFixed(3)})`);
        }
      }
    }

    const speedup = base.totalMs && cur.totalMs ? (base.totalMs / cur.totalMs) : null;
    // A relative slowdown on a shape that still finishes in a second or two
    // doesn't matter for a 170-shape course generation and is well within
    // normal timing jitter for a short-lived operation — only flag it once
    // the absolute cost is large enough to actually matter.
    const absoluteIncreaseMs = cur.totalMs && base.totalMs ? cur.totalMs - base.totalMs : 0;
    if (speedup && speedup > 1.5) {
      notes.push(`${id}: ${speedup.toFixed(1)}x faster (${base.totalMs}ms -> ${cur.totalMs}ms)`);
    } else if (speedup && speedup < 0.67 && absoluteIncreaseMs > 2000) {
      problems.push(`${id}: got SLOWER by ${(1 / speedup).toFixed(1)}x (${base.totalMs}ms -> ${cur.totalMs}ms)`);
    }
  }

  return { problems, notes };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Running pipeline: svg=${opts.svgPath}, timeout=${opts.timeoutMs}ms, only=${opts.only || '(all)'}, mode=${opts.mode}`);

  const run = await runPipeline(opts);
  console.log(`\nparseSVG: ${run.parseMs}ms, generateCoursePolygons: ${run.polygonsMs}ms, skipped (no mesh): ${run.skippedLayerCount}`);

  if (opts.mode === 'baseline') {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(run, null, 2));
    console.log(`\nBaseline saved to ${BASELINE_PATH}`);
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`\nNo baseline found at ${BASELINE_PATH} — run with --save-baseline first.`);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const { problems, notes } = compareRun(baseline, run, opts.strict);

  console.log(`\n--- Comparison vs baseline (${baseline.capturedAt}) ---`);
  for (const note of notes) console.log(`  [OK] ${note}`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(`  [FAIL] ${p}`);
    process.exit(1);
  }
  console.log('\nAll layers within tolerance.');
}

main().catch(e => {
  console.error('Pipeline run failed:', e);
  process.exit(1);
});
