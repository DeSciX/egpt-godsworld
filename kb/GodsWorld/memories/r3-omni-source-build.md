# Memory: 3 · Omni Source — build

load: GYM scene id `r3-omni-source` · 2D · source site/vendor/frqtl-web/0.6.0/dist/frqtl/scenes/omni-source.js
source sha256 a57f945ba7d5999fa53513f6c4610d676f2fae727c566dff259a00b7f3dc8c5a · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.0/dist/frqtl/scenes/omni-source.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: the walk in every direction. Forward half only: preset 'hemisphere' (a fan to +x; rotate it with orientationDeg). Denser spray: burstSize 24 (cl1b uses that). Braided ± charges: chargeMode 'random' (the self-interference field of r4 adds a ring launch and a longer λ). Move it: center [x, y]. The clip (memories/r3-omni-source/clip.mp4) showed a bright point at the centre with faint concentric dot-rings close in and sparse specks reaching every edge by ≈300 ticks.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 3 · Omni Source
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r3-omni-source).
 */

import { SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  // memo: preset 'spherical' = every direction at once, an even disk of directions (in 2D). Defaults: centre of the canvas (300,200), one quantum per tick, λ 16 px, single charge.
  // memo: The clip showed faint rings a few px apart close to the source [clip memories/r3-omni-source/clip.mp4]. Neither this source nor the card says what draws them. Predict: they re-centre on the source when it moves (the -seen drag 1); watch [predict].
  // memo: The one part. preset 'hemisphere' instead of 'spherical' keeps only the forward half (the DSE scenes use it so nothing flies backward).
  source: [SphereEmitter, { preset: 'spherical', is2D: true }],
};

export default function buildExperiment(exp) {
  // Rung 3 — full dispersion: the spherical preset draws (vx,vy) across the whole
  // ball; in 2D the ball-rejected sampler collapses to an even DISK of directions
  // (bench S5). One omni point source = the sun disk.
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(600, 400, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
```
