# Memory: 7 · 3D — build

load: GYM scene id `r7-3d` · 3D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/omni-3d.js
source sha256 4e2e3392fd657d155852212b115c5793302dbce8252cc7f547fa14364fcc55ff · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/omni-3d.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: the omni source with a z axis. The sun (r8) is this emitter made dense (wavelength 1 → fullness 1) and dressed by the GYM's render rows (sphere shape, glow, god rays). A wider world: createScene(900, 600, 900, ...). A hemisphere in 3D: preset 'hemisphere' with is2D false — a half-ball of directions (dse-tunnel-rebuild's 3D mode uses it). The clip (memories/r7-3d/clip.mp4, default camera) showed a cloud of specks growing from a 50 px ball to about 330 x 230 px on screen, densest at the centre.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 7 · 3D
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r7-3d).
 */

// The omni source released into 3D (is2D:false) + the reusable camera joysticks.

function buildExperiment(exp) {
  // is2D:false opens the z-axis: the ball-rejected sampler draws a 3D BALL of
  // directions (bench S1). three renderer + perspective camera come from renderState.
  // CameraControls.attach = reusable FAIL-SOFT joystick sugar (no-op in 2D).
  // memo: is2D false opens the z axis: the sampler draws a BALL of directions, not a disk. Defaults otherwise as r3; the centre of the 3D world is (300,200,0).
  var SRC = { preset: 'spherical', is2D: false };
  // memo: THE WORLD, 3D: 600 wide (x), 400 high (y), 600 deep (z, from −300 to +300 about the beam plane z 0). createScene instead of createCanvas is the only difference between a 2D and a 3D world.
  exp.createScene(600, 400, 600, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  // memo: The one part.
  exp.addObject('SphereEmitter', SRC);
  // memo: Page-only: attaches the MOVE/LOOK joystick pads to the running canvas so a person can orbit; no physics, nothing in node.
  if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {
    if (exp.runner.controlHost) { window.CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
