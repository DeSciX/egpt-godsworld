/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 7 · 3D
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r7-3d).
 */

// The omni source released into 3D (is2D:false) + the reusable camera joysticks.

import { CameraControls, SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  source: [SphereEmitter, { preset: 'spherical', is2D: false }],
};

export default function buildExperiment(exp) {
  // is2D:false opens the z-axis: the ball-rejected sampler draws a 3D BALL of
  // directions (bench S1). three renderer + perspective camera come from renderState.
  // CameraControls.attach = reusable FAIL-SOFT joystick sugar (no-op in 2D).
  exp.createScene(600, 400, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.declare(parts);
  if (typeof document !== 'undefined' && exp.runner) {
    if (exp.runner.controlHost) { CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
