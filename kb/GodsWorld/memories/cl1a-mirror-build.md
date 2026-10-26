# Memory: 1A · Mirror — build

load: GYM scene id `cl1a-mirror` · 2D · source site/vendor/frqtl-web/0.6.1-p3.2/dist/frqtl/scenes/mirror.js
source sha256 4e79bda357759969427c496355fd0e42abd2b5589ead4d29e21137b2adeef06e · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.2/dist/frqtl/scenes/mirror.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: a laser and one mirror. Steer the exit: orientationDeg 30 on the mirror → this source comment says 30 -> R(120) exit. The arithmetic, with the reflect law out = 180 + 2·ori − in from cl1d-mirror-route's source comment, in screen degrees (0 = +x, 90 = down, 270 = up; check: ori 45 gives 180 + 90 − 0 = 270, straight up, as the card says): ori 30 gives 180 + 60 − 0 = 240, turned 120° from the incoming +x, so the beam goes up and BACK toward the source side, 30° off vertical (60° above the line on the source side, not forward). Predict that, then watch. 0 → 180 + 0 − 0 = 180, predict straight back at the source; 90 → 180 + 180 − 0 = 360 = 0, predict straight through (predict, then watch). A periscope: a second Wall at rect [360, −20 … ] — any second mirror placed where the orange column goes, tilted 45 the other way, should send the beam right again. A sink instead: collisionBehavior 'absorb' with capacity (cl1b). The clip (memories/cl1a-mirror/clip.mp4) showed the pale beam along y 200 reaching the slab at ≈(370,200) by ≈300 ticks and orange-recoloured quanta rising straight up to the top edge.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1A · Mirror
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1a-mirror).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1A (Mirror) — a collimated LASER aimed at a rotatable Bounce/Reflect
// Wall. LASER TUNING: particle-walk pins PURE +x momentum (the
// tightest constrained-angle the emitter supports — zero angular spread); a SINGLE
// (positive) charge removes the random transverse braiding; wavelength 1 → the
// minimal transverse wiggle; fundamentalWaveLength 4 → wavelengthScale 1 (the
// 256px scale-spread REMOVED — that spray was the 'visually non-sensical' look);
// a TINY burst (2/tick) keeps it a thin beam (frame-rate protection). Rotate the
// mirror to steer the reflected beam: 45 -> straight-up exit, 30 -> R(120) exit.
  // memo: The world's size, named once; every position below is a fraction of it, so the whole scene rescales with these two numbers.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: The beam line: mid-height, y 200.
const cy = Math.round(H / 2);

export const parts = {
  // memo: The source.
  source: [SphereEmitter, {
    // memo: A collimated line along +x from (72,200): W × 0.12 = 72 px in from the left edge, on the beam line.
    preset: 'particle-walk', is2D: true, center: [Math.round(W * 0.12), cy],
    // memo: orientationDeg 0 = fire along +x (90 would fire down). chargeMode 'positive' = one charge only, so no ± braiding (this source comment: a SINGLE (positive) charge removes the random transverse braiding [src]): the thinnest beam.
    // memo: fundamentalDimension 2 is layer 2, 4 × 4 = capacity 16 [HUMAN_GUIDE §Universe, Dimension, Frame, Quantum] [VISUAL_CODING_GUIDE: capacity = w·h]; wavelength = capacity/mass [HUMAN_GUIDE §The six invariants, 6], so wavelength 1 → mass 16, fullness 16/16 = 1, the densest a frame can be; pale in the clip [clip memories/cl1a-mirror/clip.mp4].
    orientationDeg: 0, chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,
    // memo: fundamentalWaveLength 4 → wavelengthScale 1 [src]; with wavelength 1 that is λ = 1 × 1 = 1 px (λ_eff = (capacity/mass) × wavelengthScale [DSE_WORKED_EXAMPLE §The detector leg]): the source's minimal transverse wiggle [src], a true laser. burstSize 2 every tick: a 2-quanta-wide thread.
    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1
  }],
  // memo: The mirror, named 'mirror' so a drag or a later move can find it.
  mirror: [Wall, {
    // memo: rect [360, 80, 20, 240]: left at 0.6 W, top at 0.2 H, 20 px thick, 0.6 H = 240 px tall; its centre (370,200) sits on the beam line, 298 px from the source.
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    // memo: bounce + reflect = the mirror law (angle in = angle out about the drawn face). 'random' instead of 'reflect' would scatter; 'absorb' would make it cl1b's wall; 'destroy' a sink; 'nothing' a counter's ghost.
    collisionBehavior: 'bounce', bounceDirection: 'reflect',
    // memo: orientationDeg 45 = the slab is rotated 45° about its centre, so a beam along +x leaves along −y (straight up): the 2θ law with θ = 45.
    // memo: color [255,120,0] is the orange; hooks ['recolor'] stamps that colour on every quantum it reflects, which is why the rising column is orange and the incoming beam is not.
    orientationDeg: 45, color: [255, 120, 0], hooks: ['recolor']
  }],
};

export default function buildExperiment(exp) {
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
```
