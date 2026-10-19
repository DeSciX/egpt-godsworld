/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1 · Straight Walk
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r1-straight-walk).
 */

import { SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  source: [SphereEmitter, { preset: 'particle-walk', is2D: true }],
};

export default function buildExperiment(exp) {
  // Rung 1 — deterministic +X drift (particle-walk preset pins vx=[R,R], vy=vz=0)
  // with the tiny always-armed transverse coin. Born AT the fundamental (dim 0)
  // so it is 'light' — steps every tick (fast straight drift).
  exp.createCanvas(600, 400, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
