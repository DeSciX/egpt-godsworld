# Memory: 1B · Absorbing Wall (3D) — build

load: GYM scene id `cl1b-absorbing-wall-3d` · 3D · source site/scenes/722bb433/absorbing-wall-3d.js
source sha256 335fbaa8be167eff5507010ae062d21b2343237165e6e63e250ef2ed4d4222a8 · every code line below is byte-identical to the scene source; lines beginning `// memo:` are added notes — strip them to diff against site/scenes/722bb433/absorbing-wall-3d.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: cl1b's absorbing wall as a slab with a 3D spray. predict: capacity 8 fills fast and radiates sooner; depth 400 catches more of the ball (the slab spans more z); is2D true on the emitter flattens the spray to the z 0 plane, where the slab catches the part of the disk aimed at it (not all of it: most directions of a disk miss the slab). The clip (memories/cl1b-absorbing-wall-3d/clip.mp4, default camera) showed only a faint dark-red haze right of the purple slab: a ball of 24 a tick spread through 600 px of depth is thin on any one plane.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1B · Absorbing Wall (3D)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1b-absorbing-wall-3d).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1B · 3D — a volumetric (spherical) source into a 3D ABSORB wall
// slab (z-slab centered on 0 so the 3D spray collides); orbit the camera to view.
  // memo: Width and height; depth in createScene.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: y 200.
const cy = Math.round(H / 2);

export const parts = {
  // memo: The source.
  source: [SphereEmitter, {
    // memo: A BALL of directions from (90,200,0).
    preset: 'spherical', is2D: false, center: [Math.round(W * 0.15), cy],
    // memo: ± charges. fundamentalDimension 2 + wavelength 32 is the r4 tuple, so r4's source comment: dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16) [src r4-self-interference]; dark red in the clip [clip memories/cl1b-absorbing-wall-3d/clip.mp4]. This scene leaves fundamentalWaveLength unwritten, so its λ in pixels is not stated here.
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    // memo: 24 a tick, now spread over a sphere instead of a disk.
    burstSize: 24, emitEveryTicks: 1
  }],
  // memo: The absorbing slab, named 'absorber'.
  absorber: [Wall, {
    // memo: rect [360, 80, 20, 240] in x/y.
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    // memo: A slab from z −80 to +80 about the beam plane.
    z: -80, depth: 160,
    // memo: Absorb into its own mass up to 64, then radiate leaves back out. [card]
    collisionBehavior: 'absorb', capacity: 64,
    // memo: Purple.
    color: [150, 90, 210]
  }],
};

export default function buildExperiment(exp) {
  // memo: THE WORLD, 3D: 600 x 400 x 600.
  exp.createScene(W, H, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.declare(parts);
}
```
