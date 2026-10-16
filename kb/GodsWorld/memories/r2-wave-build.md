# Memory: 2 · Wave — build

load: GYM scene id `r2-wave` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/wave.js
source sha256 1eda998b5067870e722c7bbdd97a6de62c911c29d68a74086e7f13d97ef465ad · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/wave.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: r1 with the transverse coin given leverage. Longer wave: predict wavelength 16 → λ = 16 × 16 = 256 px, one period across the right half of a 600 px stage (λ_eff = (capacity/mass) × wavelengthScale, DSE_WORKED_EXAMPLE §The detector leg; the scale 16 is this source comment's 128 px ÷ wavelength 8); shorter: predict wavelength 4 → 64 px. Colour follows fullness = mass/capacity (EXTENDING_FRQTL §1.4; RENDERER_PROVIDER: colour from fullness), and wavelength = capacity/mass (HUMAN_GUIDE invariant 6), so fullness = 1/wavelength on this layer: 8 → orange (seen); predict 4 → yellower, 16 → redder. Predict a bigger swing at wavelength 16 than the ±35 px the clip showed at 8; watch how big. Two waves in step: a second emitter at center [300,100] with the same bag. The clip (memories/r2-wave/clip.mp4) showed one thick orange triangle wave from the centre to the right edge, peaks ≈130 px apart, peaks y≈165, troughs y≈235.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 2 · Wave
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r2-wave).
 */

function buildExperiment(exp) {
  // Rung 2 — Rung 1 + raise the leaf dimension to 2 (WAVELENGTH_DEMO_DIMENSION):
  // wavelength is a NO-OP at dim 0 (capacity=1 saturates mass), so raising the
  // fundamental gives the wavelength arg leverage. wavelength:8 -> mass 2 ->
  // transverse period grows from ~16px (Rung 1) to a visible ~128px snake.
  var SRC = {
    // memo: Same walk as r1: a line along +x, no z; centre of the canvas by default.
    preset: 'particle-walk', is2D: true,
    // memo: fundamentalDimension 2 = the leaves are born on layer 2. Layers nest by powers of two, layer 0 = 1×1, layer 1 = 2×2, layer 2 = 4×4 [HUMAN_GUIDE §Universe, Dimension, Frame, Quantum], and capacity = w·h [VISUAL_CODING_GUIDE: capacity = w·h], so a layer-2 frame has capacity 4 × 4 = 16.
    // memo: wavelength 8 = the frame's capacity ÷ its mass [HUMAN_GUIDE §The six invariants, 6]: mass = 16/8 = 2 (this source comment: wavelength:8 -> mass 2 [src]), fullness = mass/capacity = 2/16 = 1/8 [EXTENDING_FRQTL §1.4: fullness = mass/capacity] → orange, the colour the renderer derives from fullness [RENDERER_PROVIDER: colour from fullness] and the orange the clip showed [clip memories/r2-wave/clip.mp4], and
    // memo: λ (pixels) = wavelength × wavelengthScale = 8 × 16 = 128 px [DSE_WORKED_EXAMPLE §The detector leg] (this source comment: ~128px snake [src]), the peak-to-peak distance the clip showed (≈130). The clip showed peaks near y≈165 and troughs near y≈235 about the beam line y 200, a swing of about ±35 px [clip memories/r2-wave/clip.mp4].
    // memo: This one number sets the wavelength [HUMAN_GUIDE §The six invariants, 6] and the colour [RENDERER_PROVIDER: colour from fullness] together. Predict the swing changes with it too, and watch whether it does [predict].
    fundamentalDimension: 2, wavelength: 8
  };
  // memo: THE WORLD: 600 x 400, 2D, config derived from SRC (so the wavelength scale matches the emitter).
  exp.createCanvas(600, 400, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  // memo: The one part.
  exp.addObject('SphereEmitter', SRC);
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
