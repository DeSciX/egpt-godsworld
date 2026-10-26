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
  var W = 700, H = 700, D = 700;    // THE WORLD this scene states (its co-init call below)
  var LEVEL = 6;                    // the voxel layer: 64 px bodies, capacity 4096

  // ── WORLD — a 3D scene + universe W×H×D, fundamental layer 0, λ multiplier 1 ──
  exp.createScene(W, H, D, { dimension: 0, wavelengthScale: 1 });
  exp.declare(parts);
  var u = exp.universe;
  u.withInterQuantumCollisions = true;
  u.addDimension(LEVEL);
  exp.runner.setRateLimits({ tpsLimit: 240 });   // pacing only: wall-clock, never the ticks

  var lanesTable = collisionMatrixLanes;   // the ONE lane density table (imported)
  var voxel = Math.pow(2, LEVEL), half = voxel / 2;
  var midX = Math.floor(W * 0.5);
  var ax0 = midX - Math.floor(1.5 * voxel);       // body A, left of centre
  var bx0 = midX + Math.floor(1.5 * voxel);       // body B, right of centre
  var N = lanesTable.LANE_DENSITIES.length;       // 7 lanes
  var spacing = Math.round(H / 4);
  var laneYs = [], laneZs = [];
  for (var k = 0; k < N; k++) {
    laneYs.push(Math.round(H / 2 + (Math.floor(k / 3) - 1) * spacing));   // rows 0,0,0,1,1,1,2
    laneZs.push(((k % 3) - 1) * spacing);                                 // cols 0,1,2,…
  }

  // The live knobs: an offset (the bodies miss by that much) and an angle (vy against vx).
  var offsetPx = 0, angleVy = 0;
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
    var a = u.makeLeafFrame(ax0 - half, laneYs[i] - half, LEVEL, null, 1, 0, true, 0, null);
    u.injectFrame(a);
    var aQid = u.getFrameQuantumId(a);
    var b = u.makeLeafFrame(bx0 - half, laneYs[i] - half, LEVEL, null, -1, 0, true, 0, null);
    u.injectFrame(b);
    var bQid = u.getFrameQuantumId(b);
    if (capacity === null) { capacity = u.getFrameProperty(aQid, 'mass'); }
    built.push({ aQid: aQid, bQid: bQid });
  }
  var masses = lanesTable.laneMassesForCapacity(capacity);
  var lanes = built.map(function (q, i) {
    return { aQid: q.aQid, bQid: q.bQid, mass: masses[i], laneY: laneYs[i], laneZ: laneZs[i] };
  });
  function reseatAll() {
    lanes.forEach(function (l) {
      seat(l.aQid, ax0, l.laneY, l.laneZ, 1, l.mass);
      seat(l.bQid, bx0, l.laneY, l.laneZ, -1, l.mass);
    });
  }
  reseatAll();

  // ── THE LOOK — lit spheres, coloured by fullness (sparse red → dense violet) ──
  exp.render({ shape: 'sphere', colorScheme: 'roygbiv' });

  // ── THE KNOBS (on the canvas) + MOVE/LOOK pads ──
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
