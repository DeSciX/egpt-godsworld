/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1A · Mirror (3D)
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1a-mirror-3d).
 */

function buildExperiment(exp) {
  // Collision Lab 1A · 3D — a collimated LASER (particle-walk pins PURE +x in 2D AND
  // 3D) into a 3D mirror SLAB (depth → z-slab containing z=0), rendered as a box;
  // orbit to view. Same LASER tuning as the 2D 1A (CEO 2026-07-25): single positive
  // charge, wavelength 1, wavelengthScale 1 (fundamentalWaveLength 4), tiny burst.
  // FACE-ON default (CEO drive ruling 2026-07-26): orientation 0 presents the full
  // drawn face to the beam → retro-reflection (beam straight back, recolored) — the
  // one mirror visual that reads correctly from EVERY camera azimuth. (A tilted
  // default's L-shaped 2th exit is correct optics but its mirror-flipped projection
  // reads as pass-through from presets that view the xy-plane from behind — measured:
  // zero leaves ever behind the face; the read was projection handedness, not physics.)
  // Rotate the orientation slider to steer: 45 -> straight up, 30 -> R(120), etc.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  var cy = Math.round(H / 2);
  var SRC = {
    preset: 'particle-walk', is2D: false, center: [Math.round(W * 0.15), cy],
    chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,
    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1
  };
  exp.createScene(W, H, 600, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.addObject('SphereEmitter', SRC);
  exp.addObject('Wall', {
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    z: -80, depth: 160,
    collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: 0,
    name: 'mirror', color: [255, 120, 0], hooks: ['recolor']
  });
  // SCENE Z-COLLIMATOR (CEO drive ruling 2026-07-26 — 'the z is letting things
  // pass through, not reflect'): the beam's z-tail DIFFUSES over time (measured:
  // |z| at the wall trending 68 of the 80 rim within seconds), and any quantum
  // beyond the plate's z-band would sail BESIDE the plate — reading as pass-
  // through from rooftop. Two INVISIBLE full-canvas destroy boundaries flush with
  // the plate's z-band clamp the scene to the mirror's face: the universe z-edge
  // moved inward (the sanctioned experiment-boundary sink, same as 2D strays
  // dying at the canvas edge) — so the mirror provably faces EVERY alive quantum
  // and nothing can ever appear past the plate. 40px deep: un-jumpable (max z
  // step is ±2/tick).
  exp.addObject('Wall', { rect: [0, 0, W, H], z: 80, depth: 40,
    collisionBehavior: 'destroy', name: 'zClipFar', visible: false });
  exp.addObject('Wall', { rect: [0, 0, W, H], z: -120, depth: 40,
    collisionBehavior: 'destroy', name: 'zClipNear', visible: false });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
