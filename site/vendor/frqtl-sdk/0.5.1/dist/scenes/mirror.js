/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1A · Mirror
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1a-mirror).
 */

function buildExperiment(exp) {
  // Collision Lab 1A (Mirror) — a collimated LASER aimed at a rotatable Bounce/Reflect
  // Wall. LASER TUNING (CEO 2026-07-25): particle-walk pins PURE +x momentum (the
  // tightest constrained-angle the emitter supports — zero angular spread); a SINGLE
  // (positive) charge removes the random transverse braiding; wavelength 1 → the
  // minimal transverse wiggle; fundamentalWaveLength 4 → wavelengthScale 1 (the
  // 256px scale-spread REMOVED — that spray was the 'visually non-sensical' look);
  // a TINY burst (2/tick) keeps it a thin beam (frame-rate protection). Rotate the
  // mirror to steer the reflected beam: 45 -> straight-up exit, 30 -> R(120) exit.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  var cy = Math.round(H / 2);
  var SRC = {
    preset: 'particle-walk', is2D: true, center: [Math.round(W * 0.12), cy],
    orientationDeg: 0, chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,
    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1
  };
  exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.addObject('SphereEmitter', SRC);
  exp.addObject('Wall', {
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    collisionBehavior: 'bounce', bounceDirection: 'reflect',
    orientationDeg: 45, name: 'mirror', color: [255, 120, 0], hooks: ['recolor']
  });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
