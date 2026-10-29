/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1D · Mirror Loop (10-mirror {10/3} star)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1d-mirror-route).
 */

// A CLOSED {10/3} STAR BILLIARD: a 2-particle-wide laser loops
// m1→m2→…→m10→m1 FOREVER. Ten mirrors at the vertices of a regular decagon; each tilt solved
// from its in/out chords so the reflected centre-line hits the next mirror, and the star's
// symmetry closes the tenth leg back into the first. Each mirror tags the beam with its own
// colour (recolor hook) → the beam re-colours every bounce. No detector: the loop has no exit.
// The emitter's DECLARED emission gate (emissionCap/gateCounter — the blackbody pattern as
// captured descriptor DATA) keeps the population bounded so FPS stays healthy, Restart-safe.
//
// ONE MODE-AWARE SOURCE. The mode strip selects the RENDERER the host boots
// (renderState.renderer), and this scene reads it ONCE, inside buildExperiment: `three` ⇒
// exp.createScene (a 600x400x600 world), else exp.createCanvas (600x400). The ring geometry,
// tilts, colours, laser and gate are the SAME in both modes (2D≡3D). `parts` is written in the
// 3D default mode, and flat2D (below) derives the 2D block from it — the scene's own statement of
// two of its deltas:
//   (a) every mirror is a 3D SLAB — a z-slab centred on the beam plane z=0, rendered as a plate;
//   (b) the laser is VOLUMETRIC (is2D:false — it braids in y AND z; the slab depth catches the
//       z-braid; its tilted xy faces reflect by the 2θ law, its near/far z-faces bounce vz).
// `IS3D` guards the rest, in code after exp.declare:
//   (c) two invisible destroy z-collimators flush with the slab z-band;
//   (d) the population counter carries a z-slab covering the WHOLE universe z-band (the emitter's
//       gateCounter names it, so it stays a code declaration);
//   (e) MOVE/LOOK camera joysticks (the OMNI_3D pattern).
// The 3D mode's render intent — the particles hidden so the light field alone shows, strong
// 'field' god-rays computed from the light particles only (godraySource 'leaf'), a soft glow, and
// a face-on camera close enough that the ring spans the canvas height — rides the registry mode's
// renderState (lib/shim/registry/walkthrough.js), its one home.

import { CameraControls, SphereEmitter, Wall } from '@descix/frqtl-web/parts';
import * as FrqtlDisplay from '@descix/frqtl-web/compat/renderer/display-slot.js';

const W = 600, H = 400, WORLD_D = 600;   // THE WORLD this scene states (its co-init call below)
const f = Math.min(W, H) / 600;
// R 225·f: adjacent decagon vertices sit 2R·sin18° ≈ 0.618R apart vs slab
// height ~110·f, so the mirrors separate with clear gaps. Fit: R + rotated-slab half-diagonal
// (≈55·f) stays inside min(W,H)/2 with margin.
const CX = Math.round(W / 2), CY = Math.round(H / 2), R = Math.round(225 * f), HOP = 3, ROT = 12;
// CAP 6400 / burst 8 (brightness retune): a VERY BRIGHT braid. The cap is
// LIVE-controllable off the population counter (select 'population' in Layers → Inspector
// 'Population Gate').
const SW = Math.max(10, Math.round(14 * f)), SH = Math.max(70, Math.round(110 * f)), CAP = 6400;
// SD — the 3D slab z-depth: a 2:1 tile (twice the slab height, z-centred on the beam plane).
// The scene z-collimator clamps ALL quanta to this band, so every mirror provably faces every
// alive quantum.
const SD = 2 * SH;
// Each mirror a DIFFERENT colour = its identity (a red→magenta rainbow); the recolor hook
// stamps that colour onto every particle it reflects (string_map['render.color']).
const PAL = [[255,60,60],[255,140,0],[255,220,0],[150,230,40],[40,210,90],[0,210,190],[0,170,255],[70,90,255],[150,70,235],[235,50,190]];
// Hit-order vertices of the {10/3} star (m1..m10 named IN the order the beam visits them).
const order = []; for (var k = 0; k < 10; k++) { order.push((k * HOP) % 10); }
const D2R = Math.PI / 180;
const vpos = function (v) { var a = (v * 36 + ROT) * D2R; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
const pos = order.map(vpos);
const deg = function (a) { return ((a * 180 / Math.PI) % 360 + 360) % 360; };
const angOf = function (p, q) { return deg(Math.atan2(q[1] - p[1], q[0] - p[0])); };
// Where each mirror belongs: m1..m10 by name, at its star vertex (the centre of the slot in the ring). m4 and m6
// are declared off theirs below; STUDIO's "try it" reads this to know when a dragged mirror is home.
export const starPoints = Object.freeze(Object.fromEntries(pos.map(function (p, i) { return ['m' + (i + 1), Object.freeze(p.slice())]; })));
// Per-mirror IN-PLANE orientation from the in/out chords: ori = (in+out−180)/2, branch chosen
// so the engine reflect law out = 180 + 2·ori − in reproduces the outgoing chord exactly.
// Orientation is z-axis rotation, so the 3D slab depth adds NO new angle.
const ORI = [];
for (var j = 0; j < 10; j++) {
  var pr = pos[(j + 9) % 10], cu = pos[j], nx = pos[(j + 1) % 10];
  var inA = angOf(pr, cu), outA = angOf(cu, nx);
  var o = (((inA + outA - 180) / 2) % 360 + 360) % 360;
  var op = ((180 + 2 * o - inA) % 360 + 360) % 360;
  if (Math.abs(((op - outA + 540) % 360) - 180) > 0.5) { o = (o + 90) % 360; }
  ORI.push(o);
}
// The NARROW STRAIGHT-WALK laser (the exemplar): the SAME emitter as Rung 1
// (Straight Walk) — preset 'particle-walk', every walk-character field INHERITED from the same
// factory defaults (chargeMode 'positive', dim 0 = 'light' P=1, fundamentalWaveLength 64 → the
// λ16 braided transverse ripple) — with ONLY the deliberate loop deltas: (a) a 2px source line
// (emissionBoxSide 2 vs r1's default 10), (b) seated on the m10→m1 leg JUST CLEAR of m10 (70·f
// past its vertex > the rotated-slab half-diagonal ≈55·f) and aimed along the leg (the longest
// clear throw: leg 1.618R ≈ 364·f), (c) a burst of 8/tick, and (d) the DECLARED emission gate.
const pS = pos[9], p0 = pos[0];
const dx = p0[0] - pS[0], dy = p0[1] - pS[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
const emit = [Math.round(pS[0] + 70 * f * ux), Math.round(pS[1] + 70 * f * uy)];
// EMISSION-CAP GATE as DECLARED DATA (the blackbody-thermostat pattern):
// emissionCap + gateCounter compile at CONSTRUCTION into a host tick-fn reading
// Wall.getLiveCount on the background counter named 'population' (placed below — the by-name
// reference resolves lazily on the first tick). The closed loop has NO sink, so the gate pauses
// emission at the cap and resumes below it: the population plateaus. Restart-safe: the parts
// writer keeps the two fields in the entry and the rebuilt emitter recompiles the gate (no free recipe tick-fn).
// is2D: false (the 3D default) opens activeAxes.z — the volumetric laser; flat2D writes it true.
// The parts, written in the 3D default mode (the mode strip's default): the laser, then the ten mirrors at the
// star vertices — each its own colour + the recolor tag, each a 3D SLAB (z-slab -SD/2..SD/2). 2D is derived from
// this block by flat2D below.
export const parts = {
  source: [SphereEmitter, { preset: 'particle-walk', is2D: false, center: emit, orientationDeg: angOf(pS, p0), emissionBoxSide: 2, burstSize: 8, emissionCap: CAP, gateCounter: 'population' }],
  m1: [Wall, { rect: [Math.round(pos[0][0] - SW / 2), Math.round(pos[0][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[0], color: PAL[0], hooks: ['recolor'] }],
  m2: [Wall, { rect: [Math.round(pos[1][0] - SW / 2), Math.round(pos[1][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[1], color: PAL[1], hooks: ['recolor'] }],
  m3: [Wall, { rect: [Math.round(pos[2][0] - SW / 2), Math.round(pos[2][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[2], color: PAL[2], hooks: ['recolor'] }],
  // m4 and m6 stand OFF their star vertices (m4 5 px right, m6 67 px toward the centre): the ring opens broken, so dragging one home is the thing to try.
  m4: [Wall, { rect: [437, 103, SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[3], color: PAL[3], hooks: ['recolor'] }],
  m5: [Wall, { rect: [Math.round(pos[4][0] - SW / 2), Math.round(pos[4][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[4], color: PAL[4], hooks: ['recolor'] }],
  m6: [Wall, { rect: [215, 142, SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[5], color: PAL[5], hooks: ['recolor'] }],
  m7: [Wall, { rect: [Math.round(pos[6][0] - SW / 2), Math.round(pos[6][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[6], color: PAL[6], hooks: ['recolor'] }],
  m8: [Wall, { rect: [Math.round(pos[7][0] - SW / 2), Math.round(pos[7][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[7], color: PAL[7], hooks: ['recolor'] }],
  m9: [Wall, { rect: [Math.round(pos[8][0] - SW / 2), Math.round(pos[8][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[8], color: PAL[8], hooks: ['recolor'] }],
  m10: [Wall, { rect: [Math.round(pos[9][0] - SW / 2), Math.round(pos[9][1] - SH / 2), SW, SH], z: -Math.round(SD / 2), depth: SD, collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[9], color: PAL[9], hooks: ['recolor'] }],
};

/** This scene's 2D delta, stated once: the same keys in the same order, each props copied with its z-slab
 *  (z, depth) dropped and is2D written true where it is spelled. Pure; adds no key. */
function flat2D(parts) {
  const out = {};
  for (const key of Object.keys(parts)) {
    const props = Object.assign({}, parts[key][1]);
    delete props.z;
    delete props.depth;
    if ('is2D' in props) { props.is2D = true; }
    out[key] = [parts[key][0], props];
  }
  return out;
}

export default function buildExperiment(exp) {
  // The booted display (the host's renderState.renderer) decides which world this mode makes.
  var IS3D = FrqtlDisplay.name() === 'three';
  var P = IS3D ? parts : flat2D(parts);
  // THE WORLD — first, then parts: a 3D scene + universe (600x400x600) or a 2D canvas + universe.
  if (IS3D) { exp.createScene(W, H, WORLD_D, SphereEmitter.worldCfg(P.source[1])); }
  else      { exp.createCanvas(W, H, SphereEmitter.worldCfg(P.source[1])); }
  exp.declare(P);
  if (IS3D) {
    // SCENE Z-COLLIMATOR (without it the z lets things pass through instead of
    // reflecting): the legs' z-braid diffuses lap over lap; any quantum beyond the mirrors'
    // z-band would sail BESIDE a plate on the leg line — reading as a beam passing THROUGH the
    // mirror. Two INVISIBLE full-canvas destroy boundaries flush with the slab z-band clamp the
    // scene to the mirror faces (the universe z-edge moved inward — the sanctioned
    // experiment-boundary sink). 40px deep: un-jumpable (max z step ±2/tick).
    exp.addObject('Wall', { rect: [0, 0, W, H], z: Math.round(SD / 2), depth: 40,
      collisionBehavior: 'destroy', name: 'zClipFar', visible: false });
    exp.addObject('Wall', { rect: [0, 0, W, H], z: -Math.round(SD / 2) - 40, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipNear', visible: false });
  }
  // BACKGROUND POPULATION COUNTER (the canonical objects approach): an INVISIBLE
  // full-canvas Wall with collisionBehavior 'nothing' + the count hook. Every live leaf inside its
  // rect collides every tick, so its per-tick collided-frame count (Wall.getLiveCount, bench LO7
  // mechanics) IS the live population — the ONE 'how many live' authority. In 3D it must contain
  // EVERY live leaf: the universe z-band is ±half-width (z-strays DIE at it), so its z-slab is ±W
  // (a strict superset). Counting never moves/kills/recolors a frame: zero physics (SU1).
  exp.addObject('Wall', Object.assign(
    { rect: [0, 0, W, H] }, IS3D ? { z: -W, depth: 2 * W } : {},
    { collisionBehavior: 'nothing', hooks: ['count'], name: 'population', visible: false }));
  // MOVE/LOOK camera joysticks — the OMNI_3D pattern (3D only).
  if (IS3D && typeof document !== 'undefined' && exp.runner) {
    if (exp.runner.controlHost) { CameraControls.attach(exp.runner, exp.runner.controlHost); }
  }
}
