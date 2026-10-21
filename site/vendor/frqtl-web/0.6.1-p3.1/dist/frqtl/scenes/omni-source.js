/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 3 · Omni Source
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r3-omni-source).
 */

import { SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  source: [SphereEmitter, { preset: 'spherical', is2D: true }],
};

export default function buildExperiment(exp) {
  // Rung 3 — full dispersion: the spherical preset draws (vx,vy) across the whole
  // ball; in 2D the ball-rejected sampler collapses to an even DISK of directions
  // (bench S5). One omni point source = the sun disk.
  exp.createCanvas(600, 400, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
