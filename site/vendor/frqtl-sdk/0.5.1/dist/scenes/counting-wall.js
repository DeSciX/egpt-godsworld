/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1C · Counting Wall
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1c-counting-wall).
 */

function buildExperiment(exp) {
  // Collision Lab 1C (Counting Wall) — the Detector Screen preset (destroy + count),
  // with a LIVE in-scene LiveChart of the running y-histogram placed beside it.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  var cy = Math.round(H / 2);
  var SRC = {
    preset: 'spherical', is2D: true, center: [Math.round(W * 0.15), cy],
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    burstSize: 24, emitEveryTicks: 1
  };
  exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.addObject('SphereEmitter', SRC);
  var screen = exp.addObject('Wall', {
    rect: [Math.round(W * 0.6), 0, 20, H],
    preset: 'detector-screen', name: 'screen', color: [120, 200, 120]
  });
  // The interactive counting demo: a live chart of the detector's histogram,
  // placed to the RIGHT of the screen (past where the quanta are absorbed).
  exp.addObject('LiveChart', {
    source: screen,
    rect: [Math.round(W * 0.66), Math.round(H * 0.08), Math.round(W * 0.28), Math.round(H * 0.5)],
    series: 'bar', label: 'arrivals by y', refreshMs: 100, color: [24, 32, 46]
  });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
