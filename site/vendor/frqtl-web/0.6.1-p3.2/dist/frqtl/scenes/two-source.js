/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 6A · Two Sources / 6B · Two Fountains / 6C · Plasma Fusion
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rungs r6a-two-source, r6b-two-fountains, r6c-plasma-fusion).
 */

// Two self-interference sources ±32px apart (the classic config called TWICE — one
// world, two parts). Reused VERBATIM by Rung 6B (Two Fountains) + 6C (Plasma Fusion)
// — render deltas only.

import { SphereEmitter } from '@descix/frqtl-web/parts';

// The classic self-interference config called TWICE, centered ±32px from canvas
// center (64px apart = 1×fundamentalWaveLength, i.e. λ_eff/4 since λ_eff = 4×fWL).
// The world is init'd ONCE, then TWO parts are constructed on it — no flag, no
// re-init, no stacking. The
// lattice BETWEEN the two visible sources is EMERGENT density superposition (SU1).
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
const CFG = {
  is2D: true, preset: 'spherical',
  emissionShell: 'surface', innerR: 16,
  fundamentalDimension: 2, wavelength: 32,
  chargeMode: 'random', fundamentalWaveLength: 64,
  burstSize: 72, emitEveryTicks: 1
};

export const parts = {
  left: [SphereEmitter, { ...CFG, center: [cx - 32, cy] }],
  right: [SphereEmitter, { ...CFG, center: [cx + 32, cy] }],
};

export default function buildExperiment(exp) {
  exp.createCanvas(W, H, SphereEmitter.worldCfg(CFG));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
