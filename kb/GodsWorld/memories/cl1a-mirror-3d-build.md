# Memory: 1A · Mirror (3D) — build

load: GYM scene id `cl1a-mirror-3d` · 3D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/mirror-3d.js
source sha256 c11869c40ea34d83531866c9421b66a861c78a95fd469f209049bc2e80df85d4 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/mirror-3d.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: the cl1a mirror as a slab in a 3D world, hit square on. orientationDeg 45 on the mirror sends the beam up as in 2D (the 2θ law); 0, as here, sends it straight back. predict: depth 40 instead of 160 with z −80 unchanged spans z −80 to −40 (the slab is z −80, depth 160 → −80 to +80 now), so it no longer contains z 0 where the beam runs; predict most of the beam passes it unless z moves to −20 as well; watch. is2D true on the emitter would flatten the beam to the z 0 plane. The clip (memories/cl1a-mirror-3d/clip.mp4, default camera, looking back along x) showed one pale-to-orange stream between the slab's face and the emitter side: the beam in and the recoloured beam out on one line, nothing past the plate.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1A · Mirror (3D)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1a-mirror-3d).
 */

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// Collision Lab 1A · 3D — a collimated LASER (particle-walk pins PURE +x in 2D AND
// 3D) into a 3D mirror SLAB (depth → z-slab containing z=0), rendered as a box;
// orbit to view. Same LASER tuning as the 2D 1A: single positive
// charge, wavelength 1, wavelengthScale 1 (fundamentalWaveLength 4), tiny burst.
// FACE-ON default: orientation 0 presents the full
// drawn face to the beam → retro-reflection (beam straight back, recolored) — the
// one mirror visual that reads correctly from EVERY camera azimuth. (A tilted
// default's L-shaped 2th exit is correct optics but its mirror-flipped projection
// reads as pass-through from presets that view the xy-plane from behind — measured:
// zero leaves ever behind the face; the read was projection handedness, not physics.)
// Rotate the orientation slider to steer: 45 -> straight up, 30 -> R(120), etc.
  // memo: Width and height; the depth is written in createScene below.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: The beam line, y 200.
const cy = Math.round(H / 2);

export const parts = {
  // memo: The source.
  source: [SphereEmitter, {
    // memo: The cl1a laser from (90,200), is2D false: predict it spreads in z as well as y (this source: the beam's z-tail DIFFUSES [src]; the cl1d card: the volumetric laser braids in y AND z [card cl1d-mirror-route]), which is why the slab needs depth.
    preset: 'particle-walk', is2D: false, center: [Math.round(W * 0.15), cy],
    // memo: Single charge, fullness 1 as cl1a (cl1a-mirror-build's memo on this line); pale-to-orange in the clip [clip memories/cl1a-mirror-3d/clip.mp4].
    chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,
    // memo: λ 1 px (wavelength 1 × wavelengthScale 1 [src]; λ_eff [DSE_WORKED_EXAMPLE §The detector leg]): the minimal transverse wiggle [src cl1a-mirror]. Two a tick.
    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1
  }],
  // memo: The mirror slab, named 'mirror'.
  mirror: [Wall, {
    // memo: rect [360, 80, 20, 240] in x/y, as in 2D.
    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],
    // memo: z −80 with depth 160 = a slab from z −80 to +80, centred on the beam plane: the 2D rectangle extruded 160 px. Without z/depth the wall is a flat sheet at z 0 that a volumetric beam mostly misses.
    z: -80, depth: 160,
    // memo: Mirror law; orientationDeg 0 = face-on to the beam, so the reflection comes straight back (retro-reflection).
    collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: 0,
    // memo: Orange, and it stamps its colour on what it reflects.
    color: [255, 120, 0], hooks: ['recolor']
  }],
  // SCENE Z-COLLIMATOR (without it the z lets things pass through instead of
  // reflecting): the beam's z-tail DIFFUSES over time (measured:
  // |z| at the wall trending 68 of the 80 rim within seconds), and any quantum
  // beyond the plate's z-band would sail BESIDE the plate — reading as pass-
  // through from rooftop. Two INVISIBLE full-canvas destroy boundaries flush with
  // the plate's z-band clamp the scene to the mirror's face: the universe z-edge
  // moved inward (the sanctioned experiment-boundary sink, same as 2D strays
  // dying at the canvas edge) — so the mirror provably faces EVERY alive quantum
  // and nothing can ever appear past the plate. 40px deep: un-jumpable (max z
  // step is ±2/tick).
  // memo: An invisible full-canvas destroy slab from z 80 to 120: anything that strays beyond the mirror's z band dies here instead of sailing past beside the plate. 40 px deep because a step is at most ±2 px per tick in z, so it cannot be jumped.
  zClipFar: [Wall, { rect: [0, 0, W, H], z: 80, depth: 40,
    collisionBehavior: 'destroy', visible: false }],
  // memo: Its twin on the near side, z −120 to −80. Together they clamp the whole scene to the slab's z band.
  zClipNear: [Wall, { rect: [0, 0, W, H], z: -120, depth: 40,
    collisionBehavior: 'destroy', visible: false }],
};

export default function buildExperiment(exp) {
  // memo: THE WORLD, 3D: 600 x 400 x 600; z runs −300..+300 about the beam plane z 0.
  exp.createScene(W, H, 600, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.declare(parts);
}
```
