# Memory: 1C · Counting Wall (3D) — build

load: GYM scene id `cl1c-counting-wall-3d` · 3D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/counting-wall-3d.js
source sha256 c0c617bdfc8baf3bcc67f0ab24bcd1b0599cb629d27cb72ce4b3365dc2a10f4f · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/counting-wall-3d.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: cl1c's counting screen as a slab with a chart textured into the 3D view. A see-through counter: preset 'transparent-probe'. A thicker slab: predict depth 400 catches more of the ball. The clip (memories/cl1c-counting-wall-3d/clip.mp4, default camera) showed red specks dotted on the green face by 795 ticks and the chart panel as an empty dark box (no bars drawn in that recording).

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1C · Counting Wall (3D)
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1c-counting-wall-3d).
 */

function buildExperiment(exp) {
  // Collision Lab 1C · 3D — a volumetric source into a 3D Detector Screen slab
  // (destroy+count) + a LIVE in-scene chart, textured in three; orbit to view.
  // memo: Width and height; depth in createScene.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: y 200.
  var cy = Math.round(H / 2);
  var SRC = {
    // memo: A ball of directions from (90,200,0).
    preset: 'spherical', is2D: false, center: [Math.round(W * 0.15), cy],
    // memo: ± charges. fundamentalDimension 2 + wavelength 32 is the r4 tuple, so r4's source comment: dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16) [src r4-self-interference]; red in the clip [clip memories/cl1c-counting-wall-3d/clip.mp4]. This scene leaves fundamentalWaveLength unwritten, so its λ in pixels is not stated here.
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    // memo: 24 a tick.
    burstSize: 24, emitEveryTicks: 1
  };
  // memo: THE WORLD, 3D: 600 x 400 x 600.
  exp.createScene(W, H, 600, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  // memo: The source.
  exp.addObject('SphereEmitter', SRC);
  // memo: The detector slab, kept for the chart.
  var screen = exp.addObject('Wall', {
    // memo: rect [360, 0, 20, 400] in x/y, extruded z −80..+80: a box 20 x 400 x 160.
    rect: [Math.round(W * 0.6), 0, 20, H], z: -80, depth: 160,
    // memo: destroy + count, green.
    preset: 'detector-screen', name: 'screen', color: [120, 200, 120]
  });
  // memo: The chart panel, drawn into the 3D scene beside the slab; render only.
  exp.addObject('LiveChart', {
    // memo: Reads the slab's counts.
    source: screen,
    // memo: rect [396, 32, 168, 200].
    rect: [Math.round(W * 0.66), Math.round(H * 0.08), Math.round(W * 0.28), Math.round(H * 0.5)],
    // memo: Bars of count-by-y every 100 ms, navy.
    series: 'bar', label: 'arrivals by y', refreshMs: 100, color: [24, 32, 46]
  });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
