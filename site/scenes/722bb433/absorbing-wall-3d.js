/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1B · Absorbing Wall (3D)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1b-absorbing-wall-3d).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1B · 3D — a volumetric (spherical) source into a 3D ABSORB wall
// slab (z-slab centered on 0 so the 3D spray collides); orbit the camera to view.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const cy = Math.round(H / 2);

export const parts = {
  source: [SphereEmitter, {
    preset: 'spherical', is2D: false, center: [Math.round(W * 0.15), cy],
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    burstSize: 24, emitEveryTicks: 1
  }],
  absorber: [Wall, {
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    z: -80, depth: 160,
    collisionBehavior: 'absorb', capacity: 64,
    color: [150, 90, 210]
  }],
};

export default function buildExperiment(exp) {
  exp.createScene(W, H, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.declare(parts);
}
