/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1C · Counting Wall (3D)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1c-counting-wall-3d).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1C · 3D — a volumetric source into a 3D Detector Screen slab
// (destroy+count) + a LIVE in-scene chart, textured in three; orbit to view.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const cy = Math.round(H / 2);

export const parts = {
  source: [SphereEmitter, {
    preset: 'spherical', is2D: false, center: [Math.round(W * 0.15), cy],
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    burstSize: 24, emitEveryTicks: 1
  }],
  screen: [Wall, {
    rect: [Math.round(W * 0.6), 0, 20, H], z: -80, depth: 160,
    preset: 'detector-screen', color: [120, 200, 120]
  }],
};

export default function buildExperiment(exp) {
  exp.createScene(W, H, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  const p = exp.declare(parts);
  exp.addObject('LiveChart', {
    source: p.screen,
    rect: [Math.round(W * 0.66), Math.round(H * 0.08), Math.round(W * 0.28), Math.round(H * 0.5)],
    series: 'bar', label: 'arrivals by y', refreshMs: 100, color: [24, 32, 46]
  });
}
