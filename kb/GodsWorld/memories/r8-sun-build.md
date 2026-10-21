# Memory: A sun — build

load: GYM scene id `r8-sun` · 3D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/sun.js
source sha256 4fb5f837c79b5702fdd8c80dca86865c1712d3629ba57dc4d52d4d8f9f03dc41 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/sun.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: the same sphere emitter as the pool and the omni source, tuned dense: wavelength 1 → mass 16 of capacity 16 (fullness 1), λ 16 px. A cooler, redder, dimmer star: wavelength 4 (fullness 1/4, λ 64) — expect a red core and fewer quanta. A candle: burstSize small and emitEveryTicks 4. Two suns: two addObject calls with their own center. The glow, god rays, heat and sphere shape are NOT in this file: the GYM applies them as render rows on top. The tester's clip (memories/r8-sun/clip.mp4) has none of them: a warm speck cloud growing from a 60 px ball to ≈340 x 240 px on screen by tick 602; the tile still (tile.png) shows the dressed sun.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 8 · Sun
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r8-sun).
 */

// The sun — the 3D omni POINT source at the sun.png panel-visible regime
// (supersedes the bare r-code-a-sun reuse for THIS rung). Panel knobs:
//   dim 2, virtual mass 16 (mass/cap 16/16, fullness 1 — the density driver, ~25012
//   activeQuanta) via wavelength arg 1 (mass = max(1, capacity 16 / 1) = 16, verified
//   vs the factory clamp); λ scale (wavelengthScale) 16 via fundamentalWaveLength 64
//   (waveLengthMultiplier = max(1, floor(64/4)) = 16 → eff λ (16/16)×16 = 16px); emit
//   every 1. force-red OFF (no color), water OFF, source-mesh OFF. FX ride the renderState
//   (values: lib/shim/render/sun-look.js).

import { CameraControls, SphereEmitter } from '@descix/frqtl-web/parts';

export const parts = {
  // memo: The one part.
  source: [SphereEmitter, {
    // memo: preset 'spherical' = every direction; emissionBoxSide 0 = a POINT source (no source line or box); is2D false = a 3D ball of directions.
    // memo: The centre is the world's centre by default; add center: [x, y] to move it.
    preset: 'spherical', emissionBoxSide: 0, is2D: false,
    // memo: chargeMode 'random' = each quantum gets + or −; fundamentalDimension 2 = born on layer 2, capacity 16 (this source comment: mass = max(1, capacity 16 / 1) = 16 [src]).
    chargeMode: 'random', fundamentalDimension: 2,
    // memo: wavelength 1 = capacity/mass → mass 16 = capacity: fullness 1, the natural yellow-white, the densest a frame can be (this is what makes it a sun and not a pool). [src] [card]
    // memo: fundamentalWaveLength 64 → wavelengthScale 16 → λ = 1 × 16 = 16 px: the tight ripple of a dense frame. [src]
    // memo: emitEveryTicks 1 = a burst every tick (burstSize default); the cloud grows about 1 px/tick at its fastest edge.
    wavelength: 1, fundamentalWaveLength: 64, emitEveryTicks: 1
  }],
};

export default function buildExperiment(exp) {
  // Rung 8 (Sun) — the sun.png panel regime: a 3D omni POINT source, virtual mass 16
  // (fullness 1) via wavelength:1, λ scale 16 via fundamentalWaveLength:64, emit every 1.
  // The sphere shape + god-rays + glow FX ride the renderState (three-only capabilities).
  // The sun's yellow is the NATURAL fullness->color (mass=capacity, fullness 1); no forced color.
  // memo: THE WORLD, 3D: 600 x 400 x 600 pixels; the emitter sits at its centre.
  exp.createScene(600, 400, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.declare(parts);
  // memo: Page-only MOVE/LOOK pads; no physics.
  if (typeof document !== 'undefined' && exp.runner) {
    if (exp.runner.controlHost) { CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
```
