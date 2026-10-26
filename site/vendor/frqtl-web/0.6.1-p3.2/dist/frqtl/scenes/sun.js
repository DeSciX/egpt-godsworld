/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 8 · Sun
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r8-sun).
 */

// The sun — the 3D omni POINT source at the sun.png panel-visible regime
// (supersedes the bare r-code-a-sun reuse for THIS rung). Panel knobs:
//   dim 2, virtual mass 16 (mass/cap 16/16, fullness 1 — the density driver, ~25012
//   activeQuanta) via wavelength arg 1 (mass = max(1, capacity 16 / 1) = 16, verified
//   vs the factory clamp); λ scale (wavelengthScale) 16 via fundamentalWaveLength 64
//   (waveLengthMultiplier = max(1, floor(64/4)) = 16 → eff λ (16/16)×16 = 16px); emit
//   every 1. force-red OFF (no color), water OFF, source-mesh OFF. FX ride the renderState
//   (values: lib/shim/render/sun-look.js).

import { CameraControls, SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  source: [SphereEmitter, {
    preset: 'spherical', emissionBoxSide: 0, is2D: false,
    chargeMode: 'random', fundamentalDimension: 2,
    wavelength: 1, fundamentalWaveLength: 64, emitEveryTicks: 1
  }],
};

export default function buildExperiment(exp) {
  // Rung 8 (Sun) — the sun.png panel regime: a 3D omni POINT source, virtual mass 16
  // (fullness 1) via wavelength:1, λ scale 16 via fundamentalWaveLength:64, emit every 1.
  // The sphere shape + god-rays + glow FX ride the renderState (three-only capabilities).
  // The sun's yellow is the NATURAL fullness->color (mass=capacity, fullness 1); no forced color.
  exp.createScene(600, 400, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.declare(parts);
  if (typeof document !== 'undefined' && exp.runner) {
    if (exp.runner.controlHost) { CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
