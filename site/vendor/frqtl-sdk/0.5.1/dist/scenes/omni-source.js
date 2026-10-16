/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 3 · Omni Source
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r3-omni-source).
 */

function buildExperiment(exp) {
  // Rung 3 — full dispersion: the spherical preset draws (vx,vy) across the whole
  // ball; in 2D the ball-rejected sampler collapses to an even DISK of directions
  // (bench S5). One omni point source = the sun disk.
  var SRC = { preset: 'spherical', is2D: true };
  exp.createCanvas(600, 400, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.addObject('SphereEmitter', SRC);
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
