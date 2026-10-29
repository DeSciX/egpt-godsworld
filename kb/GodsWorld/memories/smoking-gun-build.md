# Memory: Smoking Gun — build

load: GYM scene id `smoking-gun` · 3D · source site/scenes/d130fdcb/smoking-gun.js
source sha256 d005f5e53627138023ca300400ea2cec4567cb999ff344966af4a7ee64ce9551 · every code line below is byte-identical to the scene source; lines beginning `// memo:` are added notes — strip them to diff against site/scenes/d130fdcb/smoking-gun.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: from the sketch's own header and constants [src]. A 600 x 600 x 600 3D world; a SphereEmitter muzzle at the centre fires a 1 x 10 slit of leaves with the particle-walk preset (+X momentum), BURST 20 a tick; brownian motion and inter-quantum collisions are on, and dimensions 4, 8 and 12 are declared (the smoke ladder). The burst holds until RAMP_START 180, falls linearly to zero at RAMP_END 600, and the muzzle is cut once it rounds to zero. The bullet is a declared Wall named "bullet" (bounce, reflect), a 10 px cube that its own tick function steps +1 px every second tick until the far wall; the gun body is a painted LargeObject built with `new` (not declared, no collision). Variations to predict before running: RAMP_END 300 → a shorter puff; BURST 40 → denser smoke; BULLET_SIDE 20 → a bigger cube and a taller slit (the slit height is the bullet's edge). The bullet is stepped by the sketch every second tick, so a hand that moves it is overwritten on the next step. No clip has been watched yet.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Smoking Gun
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The 3D world, the
 * muzzle, its wind-down, the bullet and its flight, and the painted gun body are all here; the
 * sugar objects (SphereEmitter, Wall, LargeObject), the renderer and the engine are imports.
 * Registered by lib/shim/registry/walkthrough.js (rung smoking-gun); the look and the camera ride
 * that row's renderState.
 *
 * Composition (zero new physics): a 1×10 slit at the muzzle emits at-fundamental leaves with the
 * particle-walk preset (+X momentum); brownian motion and inter-quantum collisions are on; the
 * declared dimensions are 4, 8 and 12. The bullet is a Wall{bounce, reflect} cube that a tick-fn
 * steps +1 px every second tick through Wall.setRect. A second tick-fn ramps the burst from 20 at
 * tick 180 toward 0 at tick 600 and cuts the muzzle once when it rounds to 0.
 *
 * Order (it seeds the run): world → brownian/collision flags → the smoke ladder → the muzzle →
 * the wind-down tick-fn → the bullet → its flight tick-fn → the gun body.
 *
 * Card text (this scene's what / why / how, verbatim; the scene is not on the
 * showcase roster, lib/shim/registry/exhibits.js, so no front-page tile or GYM card shows it):
 *   What you are seeing:
 *     Explore how you can create CGI-like effects out of emergent physics - if you are a ThreeJS
 *     developer, this is your opportunity to shine! Presently, a gun fires, seen from the side. A
 *     slit at the muzzle, one pixel wide and ten tall, releases twenty quanta per tick heading down
 *     the barrel. The bullet is currently a ten-pixel reflecting cube (quanta bounce off it).
 *   Why it is impossible the usual way:
 *     Look into how you can use the collisions from the 3D Collisions Lab and the collision
 *     experiments to make the bullet self-propelled. You'll need an intuitive understanding of what
 *     the standard collisions in the model end up doing and possibly how Large Objects allow you to
 *     define your own custom hooks and collision behaviors. The goal is that the collisions of the
 *     smaller light quanta accumulate into bullet momentum instead of the currently scripted one
 *     pixel every second tick.
 *   How FRQTL gets it:
 *     Currently, the quanta jostle and collide with one another, and they promote into ever larger
 *     frames, from the fundamental layer through dimensions 4, 8 and 12. That climb is the smoke.
 *     After three seconds the muzzle winds down, and by ten seconds it is cut, leaving the plume to
 *     drift and spread on its own. No fluid dynamics, no gas law, no particle system scripted to
 *     look like smoke.
 *
 * Facts to help you out:
 *   - Muzzle: a 1×10 px slit, particle-walk preset (pure +X), 20 quanta per tick, at-fundamental leaves.
 *   - Brownian motion and inter-quantum collisions are on. Declared dimensions are 4, 8 and 12 (the
 *     scene's "smoke ladder": leaves promote 0 → 4 → 8 → 12).
 *   - The bullet's motion is scripted: a tick function steps it +1 px every second tick. The quanta
 *     do NOT push it.
 *   - Bullet: a 10 px cube Wall, collisionBehavior bounce/reflect, so quanta reflect off it.
 *   - Wind-down: full burst until tick 180, linear fall to zero at tick 600, then the muzzle is cut.
 *     The rate is capped at 60 ticks per second, so that is 3 s and 10 s.
 *   - The gun body is a painted shape with no collision, so it has no physical role.
 *   - Look: side profile (barrel reads left to right), glow 0.6, god rays 0.5 from the fundamental
 *     layer, heat 0.2, smoke render effect 0. The visible "smoke" is therefore the frames themselves,
 *     not a render effect.
 */

import { CameraControls, CollisionTypes, LargeObject, SphereEmitter } from '@descix/frqtl-web/parts';

const W = 600, H = 600, D = 600;          // THE WORLD this scene states (its co-init call below)
const BURST = 20;                          // quanta per tick at the muzzle, before the wind-down
const BULLET_SIDE = 10;                    // the bullet cube's edge = the muzzle slit's height (px)
const MUZZLE_X = Math.floor(W / 2), MUZZLE_Y = Math.floor(H / 2);

export const parts = {
  muzzle: [SphereEmitter, {
    preset: 'particle-walk', is2D: false,             // pure +X momentum in 2D and 3D
    center: [MUZZLE_X, MUZZLE_Y, 0],
    emissionBox: { x: 0, y: BULLET_SIDE, z: 0 },      // the 1×10 slit
    chargeMode: 'negative', burstSize: BURST, emitEveryTicks: 1,
    fundamentalDimension: 0, fundamentalWaveLength: 64   // λ scale floor(64/4) = 16
  }],
};

export default function buildExperiment(exp) {
  var RAMP_START = 180, RAMP_END = 600;    // the wind-down: full burst until RAMP_START, zero at RAMP_END
  var GUN_W = 150, GUN_H = 84;             // the painted gun body (px); its right edge is the muzzle

  // ── WORLD — a 3D scene + universe W×H×D, fundamental layer 0, λ multiplier 16 ──
  exp.createScene(W, H, D, SphereEmitter.worldCfg(parts.muzzle[1]));
  var u = exp.universe;
  u.brownianMotion = true;
  u.withInterQuantumCollisions = true;
  u.addDimension(4);                       // the smoke ladder: leaves promote 0 → 4 → 8 → 12
  u.addDimension(8);
  u.addDimension(12);
  exp.runner.setRateLimits({ tpsLimit: 60 });   // pacing only: 60 ticks = 1 s of wall-clock

  // ── THE MUZZLE ──
  const p = exp.declare(parts);
  var muzzle = p.muzzle;

  // ── THE WIND-DOWN — the burst falls linearly from BURST at RAMP_START to zero at RAMP_END ──
  // The burst setter's floor is one quantum per tick, so zero is the muzzle's cut, issued once.
  var rampTick = 0, muzzleCut = false;
  exp.addTickFunction(function () {
    rampTick++;
    if (muzzleCut || rampTick < RAMP_START) { return; }
    var n = Math.round(BURST * Math.max(0, 1 - (rampTick - RAMP_START) / (RAMP_END - RAMP_START)));
    if (n >= 1) { muzzle.setBurstSize(n); } else { muzzle.setActive(false); muzzleCut = true; }
  });

  // ── THE BULLET — a reflecting wall cube at the muzzle, stepped +1 px every second tick ──
  var bulletLeft = MUZZLE_X, bulletTop = MUZZLE_Y - BULLET_SIDE / 2;
  var bullet = exp.addObject('Wall', {
    rect: [bulletLeft, bulletTop, -BULLET_SIDE / 2, BULLET_SIDE, BULLET_SIDE, BULLET_SIDE],
    collisionBehavior: 'bounce', bounceDirection: 'reflect', shellShape: 'box',
    color: [235, 205, 150], name: 'bullet'
  });
  var flightTick = 0;
  exp.addTickFunction(function () {
    flightTick++;
    if (flightTick % 2 !== 0 || bulletLeft + BULLET_SIDE >= W) { return; }   // stops at the far wall
    bulletLeft += 1;
    bullet.setRect([bulletLeft, bulletTop, BULLET_SIDE, BULLET_SIDE]);      // planar: z and depth kept
  });

  // ── THE GUN BODY — a painted occluder (no collision); the renderer paints the 'gun' hint ──
  var gun = new LargeObject(u, [MUZZLE_X - GUN_W + 12, MUZZLE_Y - GUN_H / 2, GUN_W, GUN_H],
                            CollisionTypes.NONE, [], 'gun', 'closest', null, 1, [46, 46, 52]);
  gun.renderHint = 'gun';

  // ── MOVE/LOOK pads ──
  if (typeof document !== 'undefined' && exp.runner.controlHost) {
    CameraControls.attach(exp.runner, exp.runner.controlHost);
  }
}
```
