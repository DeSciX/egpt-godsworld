/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1A · Mirror (3D)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1a-mirror-3d).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1A · 3D — a collimated LASER (particle-walk pins PURE +x in 2D AND
// 3D) into a 3D mirror SLAB (depth → z-slab containing z=0), rendered as a box;
// orbit to view. Same LASER tuning as the 2D 1A: single positive
// charge, wavelength 1, wavelengthScale 1 (fundamentalWaveLength 4), tiny burst.
// FACE-ON default: orientation 0 presents the full
// drawn face to the beam → retro-reflection (beam straight back, recolored) — the
// one mirror visual that reads correctly from EVERY camera azimuth. (A tilted
// default's L-shaped 2th exit is correct optics but its mirror-flipped projection
// reads as pass-through from presets that view the xy-plane from behind — measured:
// zero leaves ever behind the face; the read was projection handedness, not physics.)
// Rotate the orientation slider to steer: 45 -> straight up, 30 -> R(120), etc.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const cy = Math.round(H / 2);

export const parts = {
  source: [SphereEmitter, {
    preset: 'particle-walk', is2D: false, center: [Math.round(W * 0.15), cy],
    chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,
    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1
  }],
  mirror: [Wall, {
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    z: -80, depth: 160,
    collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: 0,
    color: [255, 120, 0], hooks: ['recolor']
  }],
  // SCENE Z-COLLIMATOR (without it the z lets things pass through instead of
  // reflecting): the beam's z-tail DIFFUSES over time (measured:
  // |z| at the wall trending 68 of the 80 rim within seconds), and any quantum
  // beyond the plate's z-band would sail BESIDE the plate — reading as pass-
  // through from rooftop. Two INVISIBLE full-canvas destroy boundaries flush with
  // the plate's z-band clamp the scene to the mirror's face: the universe z-edge
  // moved inward (the sanctioned experiment-boundary sink, same as 2D strays
  // dying at the canvas edge) — so the mirror provably faces EVERY alive quantum
  // and nothing can ever appear past the plate. 40px deep: un-jumpable (max z
  // step is ±2/tick).
  zClipFar: [Wall, { rect: [0, 0, W, H], z: 80, depth: 40,
    collisionBehavior: 'destroy', visible: false }],
  zClipNear: [Wall, { rect: [0, 0, W, H], z: -120, depth: 40,
    collisionBehavior: 'destroy', visible: false }],
};

export default function buildExperiment(exp) {
  exp.createScene(W, H, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.declare(parts);
}
