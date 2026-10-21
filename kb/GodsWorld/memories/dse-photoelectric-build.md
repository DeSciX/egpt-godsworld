# Memory: Photoelectric — build

load: GYM scene id `dse-photoelectric` · 2D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/dse-photoelectric.js
source sha256 f3315771f50324b3d252047f697488f584c13cc99aab37b747b763d08c9ecd21 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/dse-photoelectric.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: light charging a wall that then radiates. predict: capacity 16 on the absorber fills within a few hundred ticks at one quantum every two ticks, the cyan specks (radiated leaves) appear sooner and the stored bar plateaus early [predict]. emitEveryTicks 1 and burstSize 4 is a brighter light: more charge, more radiated. Move the photodetector nearer (rect left 320) to catch more of what the wall radiates. The clip (memories/dse-photoelectric/clip.mp4) showed sparse red dots in crossing diagonals (predict: the zig-zag the r5-fountain-pool card names, every particle zig-zags as it travels, drawn by few quanta) between emitter and wall, a few red dots on the purple wall, two or three cyan specks behind it, and both chart panels empty (no bars drawn in that recording).

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Photoelectric
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-photoelectric).
 */

// ── DSE Lab
//    — the photoelectric experiment + THE double-slit, built on the full new
//    component set (SphereEmitter chargeMode random, v2 Walls + presets, in-scene
//    LiveChart). The single canonical double-slit is 2C (on the Tunnel object); the
//    old Light-Lab r9 and DSE 2A double-slit rungs were retired.
// 2B — the photoelectric effect on the new component set (the CURRENT absorb/radiate
// drip, NO workFunction threshold).
// An incoming light stream charges an ABSORBING Wall (ABSORB v2 real backing-frame mass:
// fills to capacity, then per-tick radiates lower-dimension leaves out its back with
// p=1/capacity, mass conserved). A LiveChart on the absorber's absorb-stats series shows
// stored/absorbed/radiated as the wall charges; a second Detector Screen BEHIND the wall
// counts the RADIATED quanta (the photoelectron detector) — and its own live arrivals chart
// shows them being counted. SU1 — the LO5 absorb/radiate golden, composed, zero new physics.

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// 2B (Photoelectric) — light stream → ABSORB wall (charges + radiates) → a Detector
// Screen BEHIND counting the radiated photoelectrons. Two live charts: the wall's
// charge ledger (absorberStats) and the rear detector's arrivals.
  // memo: The world's size; positions below are fractions of it.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: y 200.
const cy = Math.round(H / 2);

export const parts = {
  // memo: The light.
  source: [SphereEmitter, {
    // memo: A line along +x from (60,200).
    preset: 'particle-walk', is2D: true, center: [Math.round(W * 0.1), cy],
    // memo: ± charges. fundamentalDimension 2 + wavelength 32 is the r4 tuple, so r4's source comment: dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16) [src r4-self-interference]; red in the clip [clip memories/dse-photoelectric/clip.mp4]. The clip showed single quanta drawing crossing diagonals. Predict those are the zig-zag the r5 card names (every particle zig-zags as it travels [card r5-fountain-pool]) drawn by few quanta; follow one quantum to check [predict].
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    // memo: ONE quantum every TWO ticks: a dim light, so the wall charges slowly and every quantum's path can be followed.
    burstSize: 1, emitEveryTicks: 2
  }],
  // The absorbing wall (ABSORB v2): charges up to capacity, then radiates lower-dim
  // leaves out its back (mass conserved) — the photocathode.
  // memo: The metal: an absorbing wall; its chart reads it as p.absorber.
  absorber: [Wall, {
    // memo: rect [270, 100, 20, 200]: 210 px right of the light, 20 thick, 200 tall, centred on the beam line.
    rect: [Math.round(W * 0.45), Math.round(H * 0.25), 20, Math.round(H * 0.5)],
    // memo: Absorb into its own mass up to 64, then radiate lower-dimension leaves out its back (the photoelectrons). Purple. [src]
    collisionBehavior: 'absorb', capacity: 64, color: [150, 90, 210]
  }],
  // The photoelectron detector: a Detector Screen (destroy + count) BEHIND the absorber,
  // counting the radiated quanta that emerge past it.
  // memo: The counter behind the metal.
  photodetector: [Wall, {
    // memo: rect [432, 80, 20, 240]: 142 px behind the absorber's back face, taller than it so it catches what spreads.
    rect: [Math.round(W * 0.72), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    // memo: destroy + count: it counts the radiated quanta that reach it. Green.
    preset: 'detector-screen', color: [120, 200, 120]
  }],
};

export default function buildExperiment(exp) {
  // The incoming light stream: a thin +x beam of oppositely-charged dim-2 leaves. A
  // SPARSE flux (1 leaf / 2 ticks) keeps the slow absorb/radiate drip radiation-dominated
  // (a dense beam saturates the wall, which then leaks past it — the deferred emergent-
  // probability threshold would gate that; see 2B prose).
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  // The wall's charge ledger (stored / absorbed / radiated) — the absorb-stats series.
  exp.addObject('LiveChart', {
    // memo: This chart reads the absorber's ledger (stored / absorbed / radiated) rather than a position histogram.
    source: p.absorber, projector: 'absorberStats',
    // memo: rect [24, 12, 192, 112]: top left.
    rect: [Math.round(W * 0.04), Math.round(H * 0.03), Math.round(W * 0.32), Math.round(H * 0.28)],
    // memo: Three bars, dark purple panel.
    series: 'bar', label: 'wall charge (stored/absorbed/radiated)', refreshMs: 100, color: [30, 22, 44], alpha: 230
  });
  // The photoelectron count beyond the wall — the rear detector's live arrivals.
  exp.addObject('LiveChart', {
    // memo: The second chart reads the photodetector's counts.
    source: p.photodetector,
    // memo: rect [378, 12, 192, 112]: top right.
    rect: [Math.round(W * 0.63), Math.round(H * 0.03), Math.round(W * 0.32), Math.round(H * 0.28)],
    // memo: Dark green panel.
    series: 'bar', label: 'photoelectrons counted', refreshMs: 100, color: [22, 40, 30], alpha: 230
  });
}
```
