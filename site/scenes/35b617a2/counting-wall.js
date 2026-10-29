/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1C · Counting Wall
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1c-counting-wall).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1C (Counting Wall) — the Detector Screen preset (destroy + count),
// with a LIVE in-scene LiveChart of the running y-histogram placed beside it.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const cy = Math.round(H / 2);

export const parts = {
  source: [SphereEmitter, {
    preset: 'spherical', is2D: true, center: [Math.round(W * 0.15), cy],
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    burstSize: 24, emitEveryTicks: 1
  }],
  screen: [Wall, {
    rect: [Math.round(W * 0.6), 0, 20, H],
    preset: 'detector-screen', color: [120, 200, 120]
  }],
};

export default function buildExperiment(exp) {
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  // The interactive counting demo: a live chart of the detector's histogram,
  // placed to the RIGHT of the screen (past where the quanta are absorbed).
  exp.addObject('LiveChart', {
    source: p.screen,
    rect: [Math.round(W * 0.66), Math.round(H * 0.08), Math.round(W * 0.28), Math.round(H * 0.5)],
    series: 'bar', label: 'arrivals by y', refreshMs: 100, color: [24, 32, 46]
  });
}
