# Memory: 6A · Two Sources — build

load: GYM scene id `r6a-two-source` · 2D · source site/scenes/1444a0e5/two-source.js
source sha256 3bffe76607939c69ed56a01c82f2caa79a14631ad6cb1762ee2436a5a10ea997 · every code line below is byte-identical to the scene source; lines beginning `// memo:` are added notes — strip them to diff against site/scenes/1444a0e5/two-source.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: two r4 sources 64 px apart. Further apart: center [cx − 64, cy] and [cx + 64, cy] (128 px = λ/2); predict a stronger lattice between them, and watch whether the one ring round both splits into two. Three sources: a third addObject at [cx, cy − 64]. Unequal: give one burstSize 36. The clip (memories/r6a-two-source/clip.mp4) showed two overlapping red disks with two holes at ≈(270,203) and (333,203), one faint ring of radius ≈105 round the pair by ≈400 ticks, and a denser lattice between the holes.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 6A · Two Sources / 6B · Two Fountains / 6C · Plasma Fusion
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rungs r6a-two-source, r6b-two-fountains, r6c-plasma-fusion).
 */

// Two self-interference sources ±32px apart (the classic config called TWICE — one
// world, two parts). Reused VERBATIM by Rung 6B (Two Fountains) + 6C (Plasma Fusion)
// — render deltas only.

import { SphereEmitter } from '@descix/frqtl-web/parts';

// The classic self-interference config called TWICE, centered ±32px from canvas
// center (64px apart = 1×fundamentalWaveLength, i.e. λ_eff/4 since λ_eff = 4×fWL).
// The world is init'd ONCE, then TWO parts are constructed on it — no flag, no
// re-init, no stacking. The
// lattice BETWEEN the two visible sources is EMERGENT density superposition (SU1).
  // memo: The world's size, named once so the two centres below can be derived from it.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: The canvas centre (300,200): the two sources straddle it.
const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
const CFG = {
    // memo: The r4 tuple, shared by both sources: flat, every direction.
  is2D: true, preset: 'spherical',
    // memo: Ring launch of radius 16 px → each source has its own black hole ≈30 px across (radius ≈15), by eye; dots from the other source cross the holes [clip memories/r6a-two-source/clip.mp4].
  emissionShell: 'surface', innerR: 16,
    // memo: fundamentalDimension 2 + wavelength 32 is the r4 tuple, so r4's source comment: dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16) [src r4-self-interference]; red in the clip [clip memories/r6a-two-source/clip.mp4].
  fundamentalDimension: 2, wavelength: 32,
    // memo: ± charges braid (r4's source comment: per-leaf +/- braiding [src r4-self-interference]); λ = 16 × 16 = 256 px (this source comment: λ_eff = 4×fWL = 4 × 64 [src]).
  chargeMode: 'random', fundamentalWaveLength: 64,
    // memo: 72 quanta per tick PER source: 144 a tick in all.
  burstSize: 72, emitEveryTicks: 1
};

export const parts = {
  // memo: Source 1 at (268,200): 32 px left of centre. The pair is 64 px apart = λ/4 at λ 256 (this source comment: 64px apart = 1×fundamentalWaveLength, i.e. λ_eff/4 [src]).
  // memo: The spread { ...CFG, center } copies the tuple and adds a center, so both sources share one physics statement and differ only in place.
  left: [SphereEmitter, { ...CFG, center: [cx - 32, cy] }],
  // memo: Source 2 at (332,200): 32 px right of centre. Change ±32 to ±64 for a λ/2 separation (the DSE rungs say two sources reinforce at multiples of λ/2).
  right: [SphereEmitter, { ...CFG, center: [cx + 32, cy] }],
};

export default function buildExperiment(exp) {
  // memo: THE WORLD: 600 x 400, 2D, config derived from the shared tuple.
  exp.createCanvas(W, H, SphereEmitter.worldCfg(CFG));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
```
