# Memory: 1B · Absorbing Wall — build

load: GYM scene id `cl1b-absorbing-wall` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/absorbing-wall.js
source sha256 369ba99c15f78021668ff8c78e9a7b17ec201ff84ebd04c4a85feec3f04d60b4 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/absorbing-wall.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: a spray and a wall that stores it. capacity 64 is how much mass the wall can hold before it stops absorbing and starts radiating; predict: capacity 8 fills within a few ticks and radiates sooner (more cyan specks behind it, earlier); 1024 swallows for a long time with nothing behind it. 'destroy' instead of 'absorb' makes a sink that never radiates. Move the wall nearer (rect left 200) and predict it fills sooner. The clip (memories/cl1b-absorbing-wall/clip.mp4) showed the red spray reaching the purple wall by ≈400 ticks, red dots on its face, and only a handful of cyan specks (the radiated leaves) behind it by 795.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1B · Absorbing Wall
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1b-absorbing-wall).
 */

function buildExperiment(exp) {
  // Collision Lab 1B (Absorbing Wall) — ABSORB v2 (Track A): the wall LO is backed by
  // a REAL leaf frame; a host tick-fn tallies the killed masses into it + radiates.
  // memo: The world's size, named once; positions below are fractions of it.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: Mid-height, y 200.
  var cy = Math.round(H / 2);
  var SRC = {
    // memo: Every direction, flat, from (90,200): 0.15 W in from the left edge.
    preset: 'spherical', is2D: true, center: [Math.round(W * 0.15), cy],
    // memo: ± charges. fundamentalDimension 2 + wavelength 32 is the r4 tuple, so r4's source comment: dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16) [src r4-self-interference]; red in the clip [clip memories/cl1b-absorbing-wall/clip.mp4]. This scene leaves fundamentalWaveLength unwritten, so its λ in pixels is not stated here.
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    // memo: 24 quanta a tick: a dense ball (the clip showed a ring of radius ≈90 round the source by 795 ticks).
    burstSize: 24, emitEveryTicks: 1
  };
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  // memo: The source.
  exp.addObject('SphereEmitter', SRC);
  // memo: The absorbing wall, named 'absorber'.
  exp.addObject('Wall', {
    // memo: rect [360, 80, 20, 240]: 270 px right of the source, 20 px thick, 240 px tall, centred on the beam line.
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    // memo: absorb = a quantum that arrives is taken into the wall's own mass; capacity 64 = the mass it can hold; at capacity it stops taking and radiates stored mass back out as lower-dimension leaves (the cyan specks), mass conserved. [card]
    collisionBehavior: 'absorb', capacity: 64,
    // memo: The purple; the name is what a drag or a chart would point at.
    name: 'absorber', color: [150, 90, 210]
  });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
