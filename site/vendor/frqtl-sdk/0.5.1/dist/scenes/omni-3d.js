/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 7 · 3D
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r7-3d).
 */

// The omni source released into 3D (is2D:false) + the reusable camera joysticks.

function buildExperiment(exp) {
  // is2D:false opens the z-axis: the ball-rejected sampler draws a 3D BALL of
  // directions (bench S1). three renderer + perspective camera come from renderState.
  // CameraControls.attach = reusable FAIL-SOFT joystick sugar (no-op in 2D).
  var SRC = { preset: 'spherical', is2D: false };
  exp.createScene(600, 400, 600, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.addObject('SphereEmitter', SRC);
  if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {
    if (exp.runner.controlHost) { window.CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
