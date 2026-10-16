# Memory: 1C · Counting Wall — build

load: GYM scene id `cl1c-counting-wall` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/counting-wall.js
source sha256 2432e4da3f333c4282d03fe17067f616c7f709f3a88aa0678e87ecf5fb5a0e5c · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/counting-wall.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: a spray and a screen that counts by destroying. A narrower screen: rect [360, 100, 20, 200] catches only the middle of the spray. A see-through counter: preset 'transparent-probe' (counts without stopping; dse-one-emitter uses it) — then predict the right side filling with red. A second chart on the same wall is one more LiveChart with source: screen. The clip (memories/cl1c-counting-wall/clip.mp4) showed the red field stopping dead at the green wall by ≈400 ticks and the chart panel staying an empty dark box (no bars were drawn in that recording).

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1C · Counting Wall
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1c-counting-wall).
 */

function buildExperiment(exp) {
  // Collision Lab 1C (Counting Wall) — the Detector Screen preset (destroy + count),
  // with a LIVE in-scene LiveChart of the running y-histogram placed beside it.
  // memo: The world's size, named once.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: Mid-height, y 200.
  var cy = Math.round(H / 2);
  var SRC = {
    // memo: The cl1b spray: every direction from (90,200).
    preset: 'spherical', is2D: true, center: [Math.round(W * 0.15), cy],
    // memo: ± charges. fundamentalDimension 2 + wavelength 32 is the r4 tuple, so r4's source comment: dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16) [src r4-self-interference]; red in the clip [clip memories/cl1c-counting-wall/clip.mp4]. This scene leaves fundamentalWaveLength unwritten, so its λ in pixels is not stated here.
    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,
    // memo: 24 a tick.
    burstSize: 24, emitEveryTicks: 1
  };
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  // memo: The source.
  exp.addObject('SphereEmitter', SRC);
  // memo: The detector, kept in a variable so the chart can point at it.
  var screen = exp.addObject('Wall', {
    // memo: rect [360, 0, 20, 400]: full height, 20 px thick, 270 px right of the source; nothing gets past it.
    rect: [Math.round(W * 0.6), 0, 20, H],
    // memo: preset 'detector-screen' = destroy + count: every arrival is removed and tallied by position. Green.
    preset: 'detector-screen', name: 'screen', color: [120, 200, 120]
  });
  // The interactive counting demo: a live chart of the detector's histogram,
  // placed to the RIGHT of the screen (past where the quanta are absorbed).
  // memo: A render-only panel: it reads the screen's histogram and draws it; no physics, drag it anywhere.
  exp.addObject('LiveChart', {
    // memo: Which wall it reads.
    source: screen,
    // memo: rect [396, 32, 168, 200]: right of the screen, 168 px wide, 200 px tall.
    rect: [Math.round(W * 0.66), Math.round(H * 0.08), Math.round(W * 0.28), Math.round(H * 0.5)],
    // memo: Bars of count-by-y, redrawn every 100 ms, on a dark navy panel.
    series: 'bar', label: 'arrivals by y', refreshMs: 100, color: [24, 32, 46]
  });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
