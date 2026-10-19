# Memory: 3D Collisions Lab — build

load: GYM scene id `collision-matrix-3d` · 3D · source site/vendor/frqtl-web/0.6.0/dist/frqtl/scenes/collision-matrix-3d.js
source sha256 70cc8255394e41ffd6dfe4897392d92dd7dfaffda64811d200922fb3b716d607 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.0/dist/frqtl/scenes/collision-matrix-3d.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: seven head-on pairs at seven densities. The lab is the density table: lanesTable.LANE_DENSITIES (the collisionMatrixLanes import) maps lane k to a mass; laneMassesForCapacity scales it to the capacity the engine reports for a 64 px body. Variants: LEVEL 5 (32 px bodies, capacity 1024) → predict smaller balls. offset 16 (the knob): seat() puts A at cy + offset and B at cy − offset, so the two lane centres sit 2 × 16 = 32 px apart, not 16 (the source comment's 'miss by that much' undercounts by half); with 64 px bodies they still overlap by 64 − 32 = 32 px, so predict a glancing hit, not a miss. angle 0.5 → vy = −0.5·vx: predict oblique hits. ax0/bx0 ± 1.5 voxels = 96 px either side of centre, so the facing edges start 192 − 64 = 128 px apart and first contact comes after 96 − 32 = 64 px of travel each; predict about tick 64 at speed_prob 1 (1 px per tick). The clip (memories/collision-matrix-3d/clip.mp4, default camera) showed the pairs close at the start, parted left and right by ≈400 ticks, and about sixteen balls scattered mid-frame by 795.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 3D Collisions Lab
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The 3D world, the
 * seven head-on lanes of equal-mass voxel pairs, their live knobs and the look are all here; the
 * lane density table (`collisionMatrixLanes`), the renderer and the engine are imports.
 * Registered by lib/shim/registry/walkthrough.js (rung collision-matrix-3d).
 *
 * Physics (zero new — bench C2, C3, C5, SU1): each lane fires two equal bodies at each other at
 * speed_prob 1 along x; a lane's density (mass / capacity) sets how hard the bodies are — rigid
 * bodies bounce cleanly, soft ones press into each other before parting. The lanes sit on a 3x3
 * y/z grid, so the same contact happens at seven depths: collision is identical on any axis
 * (2D ≡ 3D). The same engine that makes light makes mechanics — no second physics.
 *
 * Order (it seeds the run): world → collisions on → the voxel layer →
 * per lane, body A then body B (engine-built, capacity read back once) → seat every body.
 */

import { CameraControls, FrqtlControlOverlay, FrqtlControlsPanel } from '@descix/frqtl-web/parts';
import * as ControlRegistry from '@descix/frqtl-web/shim/controls/registry.js';
import { collisionMatrixLanes } from '@descix/frqtl-web/objects/setup/_collisionMatrixLanes.js';

export const parts = {};

export default function buildExperiment(exp) {
  // memo: A 700 x 700 x 700 world.
  var W = 700, H = 700, D = 700;    // THE WORLD this scene states (its co-init call below)
  // memo: The voxel layer: 2^6 = 64 px bodies, capacity 4096 (read back from the engine below, never assumed). [src]
  var LEVEL = 6;                    // the voxel layer: 64 px bodies, capacity 4096

  // ── WORLD — a 3D scene + universe W×H×D, fundamental layer 0, λ multiplier 1 ──
  // memo: THE WORLD, 3D, written directly (no emitter).
  exp.createScene(W, H, D, { dimension: 0, wavelengthScale: 1 });
  exp.declare(parts);
  var u = exp.universe;
  // memo: Bodies that meet collide (bench C2/C3/C5): without this they would pass through each other [HUMAN_GUIDE Part 3, withInterQuantumCollisions].
  u.withInterQuantumCollisions = true;
  // memo: Open the voxel layer.
  u.addDimension(LEVEL);
  // memo: Wall-clock pacing only (240 ticks/s max): never the physics.
  exp.runner.setRateLimits({ tpsLimit: 240 });   // pacing only: wall-clock, never the ticks

  // memo: The ONE density table, the collisionMatrixLanes import from '@descix/frqtl-web/objects/setup/_collisionMatrixLanes.js' (top of the file): seven densities from feather-light to rigid.
  var lanesTable = collisionMatrixLanes;   // the ONE lane density table (imported)
  // memo: 64 and 32 px.
  var voxel = Math.pow(2, LEVEL), half = voxel / 2;
  // memo: 350: the meeting line.
  var midX = Math.floor(W * 0.5);
  // memo: Body A's centre x = 350 − 96 = 254 (its rect left 222), moving +x.
  var ax0 = midX - Math.floor(1.5 * voxel);       // body A, left of centre
  // memo: Body B's centre x = 446 (rect left 414), moving −x. 192 px apart, first contact after 64 px each.
  var bx0 = midX + Math.floor(1.5 * voxel);       // body B, right of centre
  // memo: 7 lanes.
  var N = lanesTable.LANE_DENSITIES.length;       // 7 lanes
  // memo: 175 px between lane rows and columns.
  var spacing = Math.round(H / 4);
  var laneYs = [], laneZs = [];
  // memo: Lane centres on a 3 x 3 y/z grid: y = 175, 350 or 525 (row = floor(k/3) − 1), z = −175, 0 or +175 (col = k mod 3 − 1); seven of the nine cells used [src].
  for (var k = 0; k < N; k++) {
    laneYs.push(Math.round(H / 2 + (Math.floor(k / 3) - 1) * spacing));   // rows 0,0,0,1,1,1,2
    laneZs.push(((k % 3) - 1) * spacing);                                 // cols 0,1,2,…
  }

  // The live knobs: an offset (the bodies miss by that much) and an angle (vy against vx).
  // memo: The two live knobs: a y offset (seat() moves A by +offset and B by −offset [src], so their lane centres sit 2 × offset apart, twice what the source comment above says) and a vy/vx ratio (an oblique hit).
  var offsetPx = 0, angleVy = 0;
  // memo: Place one body by its quantum id: position, velocity (vx = ±1 along the lane, vy from the angle knob, vz 0), its lane MASS, and speed_prob 1 (it steps every tick: speed_prob overrides the fullness-set step rate [VISUAL_CODING_GUIDE Movement row]).
  function seat(qid, cx, cy, cz, dirX, mass) {
    u.setFrameProperty(qid, 'x', cx);
    u.setFrameProperty(qid, 'y', cy + dirX * offsetPx);
    u.setFrameProperty(qid, 'z', cz);
    u.setFrameProperty(qid, 'vx', dirX);
    u.setFrameProperty(qid, 'vy', -dirX * angleVy);
    u.setFrameProperty(qid, 'vz', 0);
    u.setFrameProperty(qid, 'mass', mass);
    u.setFrameProperty(qid, 'speed_prob', 1.0);
  }

  // ── THE BODIES — A then B per lane; the capacity is read back from the engine, never assumed ──
  var built = [], capacity = null;
  for (var i = 0; i < N; i++) {
    // memo: Body A: a layer-6 leaf made by the engine. The signature is makeLeafFrame(left, top, level, wavelength, vx, vy, …) [EXTENDING_FRQTL §2] [THE_MINIMAL_SIM]; here level LEVEL, wavelength null (as THE_MINIMAL_SIM's examples pass it; EXTENDING_FRQTL §2: wavelength 0 means derive it), vx 1, vy 0. injectFrame puts it in the world, getFrameQuantumId gives the handle, and seat() then sets its lane mass.
    var a = u.makeLeafFrame(ax0 - half, laneYs[i] - half, LEVEL, null, 1, 0, true, 0, null);
    u.injectFrame(a);
    var aQid = u.getFrameQuantumId(a);
    var b = u.makeLeafFrame(bx0 - half, laneYs[i] - half, LEVEL, null, -1, 0, true, 0, null);
    u.injectFrame(b);
    var bQid = u.getFrameQuantumId(b);
    // memo: Read the capacity back from the first body the engine built, once: the density table scales to it. [src]
    if (capacity === null) { capacity = u.getFrameProperty(aQid, 'mass'); }
    built.push({ aQid: aQid, bQid: bQid });
  }
  // memo: Lane k's mass = density_k × capacity: how FULL each body is, which is how hard it is (rigid bodies bounce cleanly, soft ones press in). [src]
  var masses = lanesTable.laneMassesForCapacity(capacity);
  var lanes = built.map(function (q, i) {
    return { aQid: q.aQid, bQid: q.bQid, mass: masses[i], laneY: laneYs[i], laneZ: laneZs[i] };
  });
  // memo: Put every pair back on its marks with the current knobs; the knobs call this live.
  function reseatAll() {
    lanes.forEach(function (l) {
      seat(l.aQid, ax0, l.laneY, l.laneZ, 1, l.mass);
      seat(l.bQid, bx0, l.laneY, l.laneZ, -1, l.mass);
    });
  }
  reseatAll();

  // ── THE LOOK — lit spheres, coloured by fullness (sparse red → dense violet) ──
  // memo: Render intent: lit spheres, coloured by fullness on the roygbiv ramp (sparse red → dense violet). No physics. [src]
  exp.render({ shape: 'sphere', colorScheme: 'roygbiv' });

  // ── THE KNOBS (on the canvas) + MOVE/LOOK pads ──
  // memo: Page-only knobs: offset 0..48 px (step 4) and angle 0..1 (step 0.1), each re-seating all pairs; plus the MOVE/LOOK pads.
  var registry = ControlRegistry.makeControlRegistry();
  registry.registerControls('collision-matrix-3d', [
    { kind: 'scalar', id: 'offset', label: 'offset', min: 0, max: 48, step: 4, value: 0,
      fmt: function (v) { return String(v); }, onChange: function (v) { offsetPx = v; reseatAll(); },
      place: { x: 0.02, y: 0.03 } },
    { kind: 'scalar', id: 'angle', label: 'angle', min: 0, max: 1, step: 0.1, value: 0,
      fmt: function (v) { return v.toFixed(1); }, onChange: function (v) { angleVy = v; reseatAll(); },
      place: { x: 0.02, y: 0.12 } }
  ]);
  // Chrome (a page only): expose the knobs to a host frame, and mount the overlay through the
  // runner's ONE door (runner.controlHost) — before a canvas is mounted (a notebook pane) there is
  // none, so the knobs stay in the exposed registry only.
  FrqtlControlsPanel.exposeRegistry(registry, { runner: exp.runner });
  if (exp.runner.controlHost) { FrqtlControlOverlay.mount(exp.runner, { registry: registry, name: 'collision-matrix-3d' }); }
  if (typeof document !== 'undefined') {
    if (exp.runner.controlHost) { CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
```
