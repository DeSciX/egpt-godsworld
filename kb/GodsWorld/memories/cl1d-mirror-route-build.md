# Memory: Infinite mirror — build

load: GYM scene id `cl1d-mirror-route` (mode `2d`, also `3d`; the GYM tile opens in `3d`) · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/mirror-route.js
source sha256 c02471db2c8f5412e2d9e491953c10ffdbb552c6ea1c9cf42ea5d82d0bdf9ed7 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/mirror-route.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: ten mirrors on a decagon, a laser looping forever. Fewer mirrors: a {5/2} star needs order with 5 vertices (angles 72° apart) and the same tilt solve; the solve below works for any closed star where in/out chords are known. A dimmer loop: burstSize 2, CAP 1600. A smaller ring: R = 180·f instead of the source's R = round(225·f). At f = min(600,400)/600 = 2/3 that is R 120 px instead of 150; adjacent vertices then sit 2R·sin 18° ≈ 74 px apart against slabs SH = max(70, round(110·f)) = 73 px tall, so predict the slabs nearly touch; keep R + 55·f inside min(W,H)/2. Predict one mirror dragged 20 px outward breaks the loop; watch it in the -seen file's drag 1. The 2D clip (memories/cl1d-mirror-route/clip.mp4) showed the thin yellow beam leaving near m10 for m1 by ≈120 ticks and, by 1202, streams along every chord coloured yellow → orange → green → red in hit order, with some quanta leaking out past m1 and at lower left; the GYM tile still (tile.png, 3D table-top with god rays) shows the full band circling a dark centre.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1D · Mirror Loop (10-mirror {10/3} star)
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1d-mirror-route).
 */

// A CLOSED {10/3} STAR BILLIARD (CEO 2026-07-25): a 2-particle-wide laser loops
// m1→m2→…→m10→m1 FOREVER. Ten mirrors at the vertices of a regular decagon; each tilt solved
// from its in/out chords so the reflected centre-line hits the next mirror, and the star's
// symmetry closes the tenth leg back into the first. Each mirror tags the beam with its own
// colour (recolor hook) → the beam re-colours every bounce. No detector: the loop has no exit.
// The emitter's DECLARED emission gate (emissionCap/gateCounter — the blackbody pattern as
// captured descriptor DATA) keeps the population bounded so FPS stays healthy, Restart-safe.
//
// ONE MODE-AWARE SOURCE. The mode strip selects the RENDERER the host boots
// (renderState.renderer), and this scene reads it ONCE, before its world: `three` ⇒
// exp.createScene (a 600x400x600 world), else exp.createCanvas (600x400). The ring geometry,
// tilts, colours, laser and gate are the SAME in both modes (2D≡3D); `IS3D` guards exactly
// these deltas:
//   (a) every mirror is a 3D SLAB — a z-slab centred on the beam plane z=0, rendered as a plate;
//   (b) the laser is VOLUMETRIC (is2D:false — it braids in y AND z; the slab depth catches the
//       z-braid; its tilted xy faces reflect by the 2θ law, its near/far z-faces bounce vz);
//   (c) two invisible destroy z-collimators flush with the slab z-band;
//   (d) the population counter carries a z-slab covering the WHOLE universe z-band;
//   (e) MOVE/LOOK camera joysticks (the OMNI_3D pattern).
// The 3D mode's render intent — god-rays at the sun's settings, computed from the light
// particles only (godraySource 'leaf'), and the 'table-top' camera — rides the registry mode's
// renderState (lib/shim/registry/walkthrough.js), whose god-ray VALUES are the sun's, owned by
// lib/shim/render/sun-look.js.

function buildExperiment(exp) {
  // The booted display (the host's renderState.renderer) decides which world this mode makes.
  // memo: Read the booted display once: 'three' → the 3D world and the z deltas below; otherwise the flat star.
  var IS3D = (typeof window !== 'undefined' && window.FrqtlDisplay && window.FrqtlDisplay.name() === 'three');
  // memo: Width, height, and the depth used only in 3D.
  var W = 600, H = 400, WORLD_D = 600;   // THE WORLD this scene states (its co-init call below)
  // memo: A scale factor from the stage's shorter side: 400/600 = 0.667 here, so every size below shrinks with it (a 600 x 600 stage gives f = 1).
  var f = Math.min(W, H) / 600;
  // R 225·f (CEO 2026-07-25): adjacent decagon vertices sit 2R·sin18° ≈ 0.618R apart vs slab
  // height ~110·f, so the mirrors separate with clear gaps. Fit: R + rotated-slab half-diagonal
  // (≈55·f) stays inside min(W,H)/2 with margin.
  // memo: The ring's centre (300,200) and radius 150 px; HOP 3 = the beam visits every third vertex ({10/3} star); ROT 12 = the whole star turned 12°.
  var CX = Math.round(W / 2), CY = Math.round(H / 2), R = Math.round(225 * f), HOP = 3, ROT = 12;
  // CAP 6400 / burst 8 (CEO 2026-07-25 brightness retune): a VERY BRIGHT braid. The cap is
  // LIVE-controllable off the population counter (select 'population' in Layers → Inspector
  // 'Population Gate').
  // memo: Each mirror 10 px wide, 73 px tall; CAP 6400 = the most quanta alive at once (the emission gate below).
  var SW = Math.max(10, Math.round(14 * f)), SH = Math.max(70, Math.round(110 * f)), CAP = 6400;
  // SD — the 3D slab z-depth: a 2:1 tile (twice the slab height, z-centred on the beam plane).
  // The scene z-collimator clamps ALL quanta to this band, so every mirror provably faces every
  // alive quantum (CEO drive ruling 2026-07-26).
  // memo: 3D only: each slab is 146 px deep in z, centred on the beam plane.
  var SD = 2 * SH;
  // Each mirror a DIFFERENT colour = its identity (a red→magenta rainbow); the recolor hook
  // stamps that colour onto every particle it reflects (string_map['render.color']).
  // memo: Ten colours, red → magenta, one per mirror in hit order; a mirror stamps its colour on what it reflects, so a quantum's colour IS its last bounce.
  var PAL = [[255,60,60],[255,140,0],[255,220,0],[150,230,40],[40,210,90],[0,210,190],[0,170,255],[70,90,255],[150,70,235],[235,50,190]];
  // Hit-order vertices of the {10/3} star (m1..m10 named IN the order the beam visits them).
  // memo: Hit order of the vertices: 0, 3, 6, 9, 2, 5, 8, 1, 4, 7.
  var order = []; for (var k = 0; k < 10; k++) { order.push((k * HOP) % 10); }
  var D2R = Math.PI / 180;
  // memo: Vertex v sits at angle 36·v + 12 degrees on the circle of radius R: m1 ≈ (447,231), m2 (225,330), m3 (200,89), m4 (437,139), m5 (316,349), m6 (153,169), m7 (375,70), m8 (400,311), m9 (163,261), m10 (284,51).
  var vpos = function (v) { var a = (v * 36 + ROT) * D2R; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
  // memo: The ten mirror centres in hit order.
  var pos = order.map(vpos);
  var deg = function (a) { return ((a * 180 / Math.PI) % 360 + 360) % 360; };
  var angOf = function (p, q) { return deg(Math.atan2(q[1] - p[1], q[0] - p[0])); };
  // Per-mirror IN-PLANE orientation from the in/out chords: ori = (in+out−180)/2, branch chosen
  // so the engine reflect law out = 180 + 2·ori − in reproduces the outgoing chord exactly.
  // Orientation is z-axis rotation, so the 3D slab depth adds NO new angle.
  // memo: Per mirror, the in-plane tilt solved from its incoming and outgoing chords so the reflected centre-line hits the next mirror exactly; the branch test below picks the tilt the engine's reflect law reproduces. [src]
  var ORI = [];
  for (var j = 0; j < 10; j++) {
    var pr = pos[(j + 9) % 10], cu = pos[j], nx = pos[(j + 1) % 10];
    var inA = angOf(pr, cu), outA = angOf(cu, nx);
    var o = (((inA + outA - 180) / 2) % 360 + 360) % 360;
    var op = ((180 + 2 * o - inA) % 360 + 360) % 360;
    if (Math.abs(((op - outA + 540) % 360) - 180) > 0.5) { o = (o + 90) % 360; }
    ORI.push(o);
  }
  // The NARROW STRAIGHT-WALK laser (CEO 2026-07-25 exemplar ruling): the SAME emitter as Rung 1
  // (Straight Walk) — preset 'particle-walk', every walk-character field INHERITED from the same
  // factory defaults (chargeMode 'positive', dim 0 = 'light' P=1, fundamentalWaveLength 64 → the
  // λ16 braided transverse ripple) — with ONLY the deliberate loop deltas: (a) a 2px source line
  // (emissionBoxSide 2 vs r1's default 10), (b) seated on the m10→m1 leg JUST CLEAR of m10 (70·f
  // past its vertex > the rotated-slab half-diagonal ≈55·f) and aimed along the leg (the longest
  // clear throw: leg 1.618R ≈ 364·f), (c) a burst of 8/tick, and (d) the DECLARED emission gate.
  // memo: The emitter sits on the m10 → m1 leg (the longest clear throw, ≈1.618 R).
  var pS = pos[9], p0 = pos[0];
  var dx = p0[0] - pS[0], dy = p0[1] - pS[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  // memo: 47 px past m10's centre toward m1 (clear of the rotated slab's half-diagonal ≈37 px): ≈(315,86).
  var emit = [Math.round(pS[0] + 70 * f * ux), Math.round(pS[1] + 70 * f * uy)];
  // EMISSION-CAP GATE as DECLARED DATA (CEO ruling 05c98e1f — the blackbody-thermostat pattern):
  // emissionCap + gateCounter compile at CONSTRUCTION into a host tick-fn reading
  // Wall.getLiveCount on the background counter named 'population' (placed below — the by-name
  // reference resolves lazily on the first tick). The closed loop has NO sink, so the gate pauses
  // emission at the cap and resumes below it: the population plateaus. Restart-safe: codegen
  // captures the two fields and the rebuilt emitter recompiles the gate (no free recipe tick-fn).
  // is2D:!IS3D opens activeAxes.z in 3D — the volumetric laser.
  var SRC = {
    // memo: The r1 laser (λ 16 ripple, single charge), aimed along the leg; volumetric in 3D. [src]
    preset: 'particle-walk', is2D: !IS3D, center: emit, orientationDeg: angOf(pS, p0),
    // memo: A 2 px source line (r1's is 10), 8 quanta a tick: a very bright braid (this source comment [src]).
    emissionBoxSide: 2, burstSize: 8,
    // memo: The emission GATE as data: pause emitting when the wall named 'population' counts CAP alive, resume below it. The loop has no sink, so this is what keeps the population on a plateau (and the frame rate healthy).
    emissionCap: CAP, gateCounter: 'population'
  };
  // THE WORLD — first, then parts: a 3D scene + universe (600x400x600) or a 2D canvas + universe.
  // memo: THE WORLD, 3D: 600 x 400 x 600 …
  if (IS3D) { exp.createScene(W, H, WORLD_D, setupSphereEmitter3D.worldCfg(SRC)); }
  // memo: … or 2D: 600 x 400.
  else      { exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC)); }
  // memo: The laser.
  exp.addObject('SphereEmitter', SRC);
  // The ten mirrors at the star vertices — each its own colour + the recolor tag. In 3D each is a
  // SLAB (z-slab −SD/2..SD/2); in 2D the bag is EMPTY, so the wall is the flat mirror.
  // memo: In 3D every mirror gets a z-slab of ±73 px; in 2D the bag is empty.
  var ZSLAB = IS3D ? { z: -Math.round(SD / 2), depth: SD } : {};
  // memo: The ten mirrors, m1..m10 in hit order.
  for (var i = 0; i < 10; i++) {
    var p = pos[i];
    exp.addObject('Wall', Object.assign(
      // memo: Each rect is centred on its vertex: left = x − 5, top = y − 36, 10 x 73 px.
      { rect: [Math.round(p[0] - SW / 2), Math.round(p[1] - SH / 2), SW, SH] }, ZSLAB,
      // memo: The mirror law at the solved tilt.
      { collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[i],
        // memo: Named m1..m10, its own colour, and it recolours what it reflects.
        name: 'm' + (i + 1), color: PAL[i], hooks: ['recolor'] }));
  }
  if (IS3D) {
    // SCENE Z-COLLIMATOR (CEO drive ruling 2026-07-26 — 'the z is letting things pass through,
    // not reflect'): the legs' z-braid diffuses lap over lap; any quantum beyond the mirrors'
    // z-band would sail BESIDE a plate on the leg line — reading as a beam passing THROUGH the
    // mirror. Two INVISIBLE full-canvas destroy boundaries flush with the slab z-band clamp the
    // scene to the mirror faces (the universe z-edge moved inward — the sanctioned
    // experiment-boundary sink). 40px deep: un-jumpable (max z step ±2/tick).
    // memo: 3D only: an invisible destroy slab just beyond the mirrors' z band (far side) …
    exp.addObject('Wall', { rect: [0, 0, W, H], z: Math.round(SD / 2), depth: 40,
      collisionBehavior: 'destroy', name: 'zClipFar', visible: false });
    // memo: … and its twin on the near side, so no quantum can sail BESIDE a plate and read as passing through it.
    exp.addObject('Wall', { rect: [0, 0, W, H], z: -Math.round(SD / 2) - 40, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipNear', visible: false });
  }
  // BACKGROUND POPULATION COUNTER (CEO 2026-07-25 — the canonical objects approach): an INVISIBLE
  // full-canvas Wall with collisionBehavior 'nothing' + the count hook. Every live leaf inside its
  // rect collides every tick, so its per-tick collided-frame count (Wall.getLiveCount, bench LO7
  // mechanics) IS the live population — the ONE 'how many live' authority. In 3D it must contain
  // EVERY live leaf: the universe z-band is ±half-width (z-strays DIE at it), so its z-slab is ±W
  // (a strict superset). Counting never moves/kills/recolors a frame: zero physics (SU1).
  exp.addObject('Wall', Object.assign(
    // memo: The population counter: an invisible full-canvas wall (in 3D a z-slab wider than the world) …
    { rect: [0, 0, W, H] }, IS3D ? { z: -W, depth: 2 * W } : {},
    // memo: … with collisionBehavior 'nothing' and the count hook: every live quantum collides with it each tick without being touched, so its per-tick count IS the live population the emitter's gate reads. Zero physics.
    { collisionBehavior: 'nothing', hooks: ['count'], name: 'population', visible: false }));
  // MOVE/LOOK camera joysticks — the OMNI_3D pattern (3D only).
  // memo: 3D, page-only: the MOVE/LOOK pads.
  if (IS3D && typeof document !== 'undefined' && window.CameraControls && exp.runner) {
    if (exp.runner.controlHost) { window.CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
