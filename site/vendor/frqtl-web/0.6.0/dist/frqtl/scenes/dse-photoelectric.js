/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Photoelectric
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-photoelectric).
 */

// ── DSE Lab
//    — the photoelectric experiment + THE double-slit, built on the full new
//    component set (SphereEmitter chargeMode random, v2 Walls + presets, in-scene
//    LiveChart). The single canonical double-slit is 2C (on the Tunnel object); the
//    old Light-Lab r9 and DSE 2A double-slit rungs were retired.
// 2B — the photoelectric effect on the new component set (the CURRENT absorb/radiate
// drip, NO workFunction threshold).
// An incoming light stream charges an ABSORBING Wall (ABSORB v2 real backing-frame mass:
// fills to capacity, then per-tick radiates lower-dimension leaves out its back with
// p=1/capacity, mass conserved). A LiveChart on the absorber's absorb-stats series shows
// stored/absorbed/radiated as the wall charges; a second Detector Screen BEHIND the wall
// counts the RADIATED quanta (the photoelectron detector) — and its own live arrivals chart
// shows them being counted. SU1 — the LO5 absorb/radiate golden, composed, zero new physics.

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// 2B (Photoelectric) — light stream → ABSORB wall (charges + radiates) → a Detector
// Screen BEHIND counting the radiated photoelectrons. Two live charts: the wall's
// charge ledger (absorberStats) and the rear detector's arrivals.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const cy = Math.round(H / 2);

export const parts = {
  source: [SphereEmitter, {
    preset: 'particle-walk', is2D: true, center: [Math.round(W * 0.1), cy],
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    burstSize: 1, emitEveryTicks: 2
  }],
  // The absorbing wall (ABSORB v2): charges up to capacity, then radiates lower-dim
  // leaves out its back (mass conserved) — the photocathode.
  absorber: [Wall, {
    rect: [Math.round(W * 0.45), Math.round(H * 0.25), 20, Math.round(H * 0.5)],
    collisionBehavior: 'absorb', capacity: 64, color: [150, 90, 210]
  }],
  // The photoelectron detector: a Detector Screen (destroy + count) BEHIND the absorber,
  // counting the radiated quanta that emerge past it.
  photodetector: [Wall, {
    rect: [Math.round(W * 0.72), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    preset: 'detector-screen', color: [120, 200, 120]
  }],
};

export default function buildExperiment(exp) {
  // The incoming light stream: a thin +x beam of oppositely-charged dim-2 leaves. A
  // SPARSE flux (1 leaf / 2 ticks) keeps the slow absorb/radiate drip radiation-dominated
  // (a dense beam saturates the wall, which then leaks past it — the deferred emergent-
  // probability threshold would gate that; see 2B prose).
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  // The wall's charge ledger (stored / absorbed / radiated) — the absorb-stats series.
  exp.addObject('LiveChart', {
    source: p.absorber, projector: 'absorberStats',
    rect: [Math.round(W * 0.04), Math.round(H * 0.03), Math.round(W * 0.32), Math.round(H * 0.28)],
    series: 'bar', label: 'wall charge (stored/absorbed/radiated)', refreshMs: 100, color: [30, 22, 44], alpha: 230
  });
  // The photoelectron count beyond the wall — the rear detector's live arrivals.
  exp.addObject('LiveChart', {
    source: p.photodetector,
    rect: [Math.round(W * 0.63), Math.round(H * 0.03), Math.round(W * 0.32), Math.round(H * 0.28)],
    series: 'bar', label: 'photoelectrons counted', refreshMs: 100, color: [22, 40, 30], alpha: 230
  });
}
