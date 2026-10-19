# Memory: A pool — build

load: GYM scene id `r5-fountain-pool` · 2D · source site/vendor/frqtl-web/0.6.0/dist/frqtl/scenes/self-interference.js
source sha256 14a8739ac4e62f3fc3d75a1ce6a13cca796c5fa8125b2532496acf9c6d3ea4ef · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.0/dist/frqtl/scenes/self-interference.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: the SAME sketch as r4-self-interference, seen through the water lens (the GYM hides the particles and turns the water shader on; that is a render row, not a line here). A wider pool: fundamentalWaveLength 128 → λ 512 px, the ripple ring about twice as far out. Two fountains: r6b. Rougher water: burstSize 144. The tester's clip (memories/r5-fountain-pool/clip.mp4) is the r4 picture (no water shader was carried); the tile still (tile.png) shows the water: dark teal, white glints, the same faint ring round the dark centre.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 4 · Self-Interference / 5 · Fountain Pool
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rungs r4-self-interference, r5-fountain-pool).
 */

// ── Shared physics recipe SOURCES (ONE authority per physics setup) ──────────
// The render-variant rungs REFERENCE these consts (never copy-paste) and express
// ONLY a renderState delta — so a future change to a base tuple flows to its
// variants automatically (no config mirror).
// The classic self-interference field (Rung 4). Reused VERBATIM by Rung 5
// (Fountain Pool) with only a water renderState delta.

import { SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  // memo: The one part. r5-fountain-pool is THIS file unchanged; only the GYM's render rows differ (particles hidden, water shader on).
  source: [SphereEmitter, {
    // memo: Flat scene, every direction. The centre is the canvas centre (300,200) by default.
    is2D: true, preset: 'spherical',
    // memo: emissionShell 'surface' + innerR 16 = the quanta are launched from the RIM of a circle of radius 16 px, not from the centre: that is the black hole ≈30 px across (radius ≈15) the clip showed at the middle [clip memories/r5-fountain-pool/clip.mp4].
    // memo: Predict: innerR 0 (or no shell) fills the centre, and innerR 40 makes a hole about 80 px across (innerR is a radius) [predict].
    emissionShell: 'surface', innerR: 16,
    // memo: fundamentalDimension 2 = capacity 16; wavelength 32 is more than the capacity so it clamps to 16: mass 1, fullness 1/16 → the deep red the renderer derives (the lowest band) [src].
    // memo: Predict: a smaller wavelength (8) gives mass 16/8 = 2 [HUMAN_GUIDE §The six invariants, 6], fullness 1/8 → orange (as r2-wave showed [clip memories/r2-wave/clip.mp4]), and a shorter λ [predict].
    fundamentalDimension: 2, wavelength: 32,
    // memo: chargeMode 'random' = + and − quanta mixed; their walks braid (this source: per-leaf +/- braiding (THE interference) [src]; the r4 card: the overlapping charged walks braid into radial bands [card r4-self-interference]): an interference pattern with no wave equation.
    // memo: fundamentalWaveLength 64 → wavelengthScale 16 → λ = 16 × 16 = 256 px (the clamped wavelength 16 times the scale) [src]. The one bright ring the clip showed stood at r≈100 px [clip memories/r5-fountain-pool/clip.mp4].
    chargeMode: 'random', fundamentalWaveLength: 64,
    // memo: 72 quanta every tick: a dense field that reaches every edge of the 600 x 400 stage by ≈400 ticks. Halve it for a sparser, slower fill.
    burstSize: 72, emitEveryTicks: 1
  }],
};

export default function buildExperiment(exp) {
  // The classic self-interference tuple (matches self-interference-preset.png):
  //   dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16);
  //   fundamentalWaveLength 64 -> wavelengthScale floor(64/4)=16 -> effective lambda 256px;
  //   chargeMode 'random' -> per-leaf +/- braiding (THE interference);
  //   emissionShell 'surface' + innerR 16 -> RING launch (empty center, sharp bands);
  //   burst 72/tick. Red is DERIVED from fullness 1/16 (ROYGBIV low end), not forced.
  //   Pattern = radial BRAIDED BANDS (not concentric rings).
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(600, 400, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
```
