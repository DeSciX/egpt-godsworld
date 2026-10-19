/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1A · Mirror
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1a-mirror).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1A (Mirror) — a collimated LASER aimed at a rotatable Bounce/Reflect
// Wall. LASER TUNING: particle-walk pins PURE +x momentum (the
// tightest constrained-angle the emitter supports — zero angular spread); a SINGLE
// (positive) charge removes the random transverse braiding; wavelength 1 → the
// minimal transverse wiggle; fundamentalWaveLength 4 → wavelengthScale 1 (the
// 256px scale-spread REMOVED — that spray was the 'visually non-sensical' look);
// a TINY burst (2/tick) keeps it a thin beam (frame-rate protection). Rotate the
// mirror to steer the reflected beam: 45 -> straight-up exit, 30 -> R(120) exit.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const cy = Math.round(H / 2);

export const parts = {
  source: [SphereEmitter, {
    preset: 'particle-walk', is2D: true, center: [Math.round(W * 0.12), cy],
    orientationDeg: 0, chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,
    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1
  }],
  mirror: [Wall, {
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    collisionBehavior: 'bounce', bounceDirection: 'reflect',
    orientationDeg: 45, color: [255, 120, 0], hooks: ['recolor']
  }],
};

export default function buildExperiment(exp) {
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
