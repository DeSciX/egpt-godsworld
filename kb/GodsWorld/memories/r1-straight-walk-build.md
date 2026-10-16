# Memory: 1 · Straight Walk — build

load: GYM scene id `r1-straight-walk` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/straight-walk.js
source sha256 5b2428dc33b54dcdca2bd92381d65525a8769b73e6af13949a18264b666a3bc6 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/straight-walk.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: the simplest scene: one emitter, one bag. Two beams: add a second exp.addObject('SphereEmitter', {...SRC, center: [300, 100]}) and a third at [300, 300]; expect three parallel bands, each 1 px/tick. A beam the other way: orientationDeg: 180. A visible wave instead of a ripple: r2-wave's two extra fields (fundamentalDimension: 2, wavelength: 8) give peak-to-peak ≈128 px. A spray instead of a beam: preset 'spherical' (r3). The clip (memories/r1-straight-walk/clip.mp4) showed one thin yellow band growing right from the centre at about 1 px per tick with a few px of ripple.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1 · Straight Walk
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r1-straight-walk).
 */

function buildExperiment(exp) {
  // Rung 1 — deterministic +X drift (particle-walk preset pins vx=[R,R], vy=vz=0)
  // with the tiny always-armed transverse coin. Born AT the fundamental (dim 0)
  // so it is 'light' — steps every tick (fast straight drift).
  // memo: SRC is the emitter's whole bag; every field not written here is the factory default.
  // memo: preset 'particle-walk' = a collimated line of quanta along +x (orientationDeg 0), the tightest emission the emitter has.
  // memo: is2D true = the quanta never get a z velocity; this is a flat scene.
  // memo: Defaults in force: center = the canvas centre (300,200); a 10 px source line (emissionBoxSide 10); one quantum per tick (burstSize 1, emitEveryTicks 1);
  // memo: The ripple's length is the card's λ = 16 px [card]. It comes from factory defaults this scene leaves unwritten (SRC sets no wavelength and no fundamentalWaveLength), so read it off the card or the clip, not off this line. The clip showed a few px of up-and-down ripple along the band [clip memories/r1-straight-walk/clip.mp4]. Predict: adding fundamentalWaveLength: 128 to SRC lengthens the ripple; watch its length and its height [predict].
  // memo: To move the source add center: [x, y] in pixels from the canvas top-left; to fire down add orientationDeg: 90; to braid ± charges add chargeMode: 'random' (r4's source comment: chargeMode 'random' -> per-leaf +/- braiding [src r4-self-interference]).
  var SRC = { preset: 'particle-walk', is2D: true };
  // memo: THE WORLD, first: 600 px wide, 400 px high, 2D. worldCfg(SRC) derives the universe config (fundamental layer, wavelength scale) from the same bag, so emitter and world agree.
  // memo: Resize the stage by changing these two numbers only; nothing else in the scene refers to them. The physics is unitless: a universe-level scale factor maps a pixel to whatever length you choose, and the engine counts only ticks, pixels and occupancy [HUMAN_GUIDE §The three axioms].
  exp.createCanvas(600, 400, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  // memo: The one part. Adding a second emitter is one more line with its own bag (give it a center so they do not coincide).
  exp.addObject('SphereEmitter', SRC);
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
