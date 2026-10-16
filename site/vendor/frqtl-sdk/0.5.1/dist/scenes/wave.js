/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 2 · Wave
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r2-wave).
 */

function buildExperiment(exp) {
  // Rung 2 — Rung 1 + raise the leaf dimension to 2 (WAVELENGTH_DEMO_DIMENSION):
  // wavelength is a NO-OP at dim 0 (capacity=1 saturates mass), so raising the
  // fundamental gives the wavelength arg leverage. wavelength:8 -> mass 2 ->
  // transverse period grows from ~16px (Rung 1) to a visible ~128px snake.
  var SRC = {
    preset: 'particle-walk', is2D: true,
    fundamentalDimension: 2, wavelength: 8
  };
  exp.createCanvas(600, 400, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.addObject('SphereEmitter', SRC);
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
