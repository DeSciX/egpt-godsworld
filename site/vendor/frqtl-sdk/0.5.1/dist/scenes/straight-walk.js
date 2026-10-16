/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1 · Straight Walk
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r1-straight-walk).
 */

function buildExperiment(exp) {
  // Rung 1 — deterministic +X drift (particle-walk preset pins vx=[R,R], vy=vz=0)
  // with the tiny always-armed transverse coin. Born AT the fundamental (dim 0)
  // so it is 'light' — steps every tick (fast straight drift).
  var SRC = { preset: 'particle-walk', is2D: true };
  exp.createCanvas(600, 400, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.addObject('SphereEmitter', SRC);
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
