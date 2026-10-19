/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 4B · Laser Build-Up
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r4b-laser-buildup).
 */

// LASER BUILD-UP (D4) — the three
// components of a laser assembled one at a time on top of the earlier Light Lab rungs:
//   1. a GAIN SOURCE   — the hemisphere emitter (rung 3's omni source, restricted forward)
//   2. a RESONANT BORE — the directed corridor, which re-aims every wall hit forward
//   3. an OUTPUT COUPLER — the exit gate, optionally collapsing the mouth to a point and
//      optionally re-phase-locking what leaves it
// The two exit flags are INDEPENDENT and both live, which is what lets the rung separate
// "does the point source matter?" from "does coherence matter?".
//
// SINGLE AUTHORITY: the emitter + tunnel configs come from `setupTunnelPointExit.sceneSpec()`
// — the SAME pure function the standalone `tunnel-point-exit` page's factory consumes. The
// rung is the addObject form (so STUDIO can select and edit the objects); the page is the
// slider-driven form. They share the numbers rather than each hand-carrying a copy.

import { SphereEmitter, Tunnel } from '@descix/frqtl-web/parts';

// Laser Build-Up — gain source + resonant bore + output coupler.
// Geometry and per-leaf creation conditions come from the ONE scene-spec authority,
// Tunnel.pointExitSpec() (setupTunnelPointExit.sceneSpec), so this rung and the standalone page cannot drift.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
const SPEC = Tunnel.pointExitSpec({
  canvasW: W, canvasH: H,
  tunnelLength: 240,        // REBUILD-class: corridor geometry, re-authored not dragged
  wavelengthScale: 16,      // eff lambda 256px — the self-interference golden's own regime
  exitRecenter: true,       // output coupler collapses the mouth to a point
  exitPhaseReset: false     // coherence OFF by default — turning it ON is the experiment
});
// The spec names its tunnel; in `parts` the key is the name.
const { name: _tunnelName, ...TUNNEL } = SPEC.tunnel;

export const parts = {
  // 1. THE GAIN SOURCE — a hemisphere emitter just inside the input mouth, so the whole
  //    burst is aimed down the bore instead of half of it escaping backwards.
  emitter: [SphereEmitter, { ...SPEC.emitter }],
  // 2+3. THE BORE AND THE OUTPUT COUPLER — one directed Tunnel carrying the exit gate.
  //    mode 'directed': every wall hit re-emits forward within 180 degrees of the axis.
  //    exitRecenter / exitPhaseReset are the two coupler flags, both live in the Inspector.
  point_exit_tunnel: [Tunnel, { ...TUNNEL }],
};

export default function buildExperiment(exp) {
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.emitter[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
