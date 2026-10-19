/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 4 · Self-Interference / 5 · Fountain Pool
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rungs r4-self-interference, r5-fountain-pool).
 */

// ── Shared physics recipe SOURCES (ONE authority per physics setup) ──────────
// The render-variant rungs REFERENCE these consts (never copy-paste) and express
// ONLY a renderState delta — so a future change to a base tuple flows to its
// variants automatically (no config mirror).
// The classic self-interference field (Rung 4). Reused VERBATIM by Rung 5
// (Fountain Pool) with only a water renderState delta.

import { SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  source: [SphereEmitter, {
    is2D: true, preset: 'spherical',
    emissionShell: 'surface', innerR: 16,
    fundamentalDimension: 2, wavelength: 32,
    chargeMode: 'random', fundamentalWaveLength: 64,
    burstSize: 72, emitEveryTicks: 1
  }],
};

export default function buildExperiment(exp) {
  // The classic self-interference tuple (matches self-interference-preset.png):
  //   dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16);
  //   fundamentalWaveLength 64 -> wavelengthScale floor(64/4)=16 -> effective lambda 256px;
  //   chargeMode 'random' -> per-leaf +/- braiding (THE interference);
  //   emissionShell 'surface' + innerR 16 -> RING launch (empty center, sharp bands);
  //   burst 72/tick. Red is DERIVED from fullness 1/16 (ROYGBIV low end), not forced.
  //   Pattern = radial BRAIDED BANDS (not concentric rings).
  exp.createCanvas(600, 400, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
