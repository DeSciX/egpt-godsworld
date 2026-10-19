/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Big Bang
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world and the
 * point source are built here; the sugar (PointSource — deprecated V1 sugar, byte-identical), the
 * renderer and the engine are imports. Registered by lib/shim/registry/walkthrough.js (rung big-bang).
 *
 * Physics (zero new — bench M1, H1, H2a-c): one radial burst at the canvas centre — 72 rays (5°) at
 * radii 32 → 2 — of leaves with NO initial momentum (emergentPhysics). The world generates parent
 * frames top-down (by how many frames an area can parent, brownian on), so a uniform field clumps into
 * filaments and voids with no gravity law and no cosmological constant. The source shuts off after
 * 20 s of ticks (1200).
 *
 * Order (it seeds the run): world (with its parent-generation interval) → source → the shut-off tick-fn.
 */

import { PointSource } from '@descix/frqtl-web/parts';

export const parts = {};

export default function buildExperiment(exp) {
  var W = 600, H = 600;          // THE WORLD this scene states (its co-init call below)

  var SOURCE_DIAMETER = 64;     // emission radii 32 → 2 (step 2)
  var ANGLE_STEP = 5;           // degrees between rays → 72 rays
  var EMIT_TICKS = 20 * 60;     // the source fires for 1200 ticks

  // ── WORLD — a 2D canvas + universe: fundamental layer 0, λ multiplier 1, parents top-down ──
  // iframeIntervalSeconds 1/60: parents are generated EVERY tick (the engine freezes the interval at
  // init, so it rides the world cfg — at the default 1 s, Phase B ran every 60 ticks).
  exp.createCanvas(W, H, { dimension: 0, wavelengthScale: 1, frames: true, iframeIntervalSeconds: 1 / 60 });
  exp.declare(parts);
  var u = exp.universe;

  // ── THE SOURCE — at the centre, no initial momentum, random charge ──────
  var source = new PointSource(u, Math.floor(W / 2), Math.floor(H / 2), SOURCE_DIAMETER,
                               0, null, true, Infinity, 0, ANGLE_STEP,
                               { emergentPhysics: true, minRadius: 2 });

  // ── SHUT-OFF — the bang is one burst era, then the field evolves on its own ──
  var t = 0;
  exp.addTickFunction(function () {
    t++;
    if (t >= EMIT_TICKS) { source.setActive(false); }
    return [];
  });
}
