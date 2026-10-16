/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 4B · Laser Build-Up
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r4b-laser-buildup).
 */

// LASER BUILD-UP (D4, CEO 2026-07-29: "It will be the build up of a Laser") — the three
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

function buildExperiment(exp) {
  // Laser Build-Up — gain source + resonant bore + output coupler.
  // Geometry and per-leaf creation conditions come from the ONE scene-spec authority,
  // setupTunnelPointExit.sceneSpec(), so this rung and the standalone page cannot drift.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  if (typeof setupTunnelPointExit === 'undefined' || !setupTunnelPointExit.sceneSpec) {
    throw new Error('[laser-buildup] setupTunnelPointExit.js is not loaded (game-layer roster). (FAIL-LOUD.)');
  }
  var spec = setupTunnelPointExit.sceneSpec({
    canvasW: W, canvasH: H,
    tunnelLength: 240,        // REBUILD-class: corridor geometry, re-authored not dragged
    wavelengthScale: 16,      // eff lambda 256px — the self-interference golden's own regime
    exitRecenter: true,       // output coupler collapses the mouth to a point
    exitPhaseReset: false     // coherence OFF by default — turning it ON is the experiment
  });
  // 1. THE GAIN SOURCE — a hemisphere emitter just inside the input mouth, so the whole
  //    burst is aimed down the bore instead of half of it escaping backwards.
  exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(spec.emitter));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.addObject('SphereEmitter', spec.emitter);
  // 2+3. THE BORE AND THE OUTPUT COUPLER — one directed Tunnel carrying the exit gate.
  //    mode 'directed': every wall hit re-emits forward within 180 degrees of the axis.
  //    exitRecenter / exitPhaseReset are the two coupler flags, both live in the Inspector.
  exp.addObject('Tunnel', spec.tunnel);
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
