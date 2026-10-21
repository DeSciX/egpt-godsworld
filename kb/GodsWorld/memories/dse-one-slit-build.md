# Memory: One Slit at the Canonical Leg — build

load: GYM scene id `dse-one-slit` · 2D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/dse-one-slit.js
source sha256 17e2a51e04beb7ac74f82a1ef5c918ccf811d92ce25d0e38097d8cdd5bbb4c8b · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/dse-one-slit.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: dse-two-slits with slit 2 walled off: the one declared difference is the barrier below slit 1, a single segment where wall2 + slit2_channel + wall3 stood. The claim: one source at y 120 still lays bands at y 40, 200 and 360 (its own ladder at ±λ/4, +3λ/4), not one broad lobe. Variants: open slit 2 again = dse-two-slits; move the plate (legFrac 1/2) and predict the crossings; a slit at y 200 instead (slitCY1 = cy) → predict bands at 120 and 280, the one-emitter pair. The clip (memories/dse-one-slit/clip.mp4) showed the yellow ball at the barrier by ≈120 ticks, arcs round the source, a trickle through the one slot and a sparse scatter beyond the plate by 1202, thinner than the two-slit clip; no bands readable by eye, no chart line drawn in that recording.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — One Slit at the Canonical Leg
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-one-slit).
 */

// ── ONE SLIT AT THE CANONICAL LEG ────────────────────────────────────────────
//
// The companion arm to `dse-two-slits`: the IDENTICAL apparatus (same emitter, same
// barrier x-position, same slit-1 aperture at y=120, same leg D, same plate, same
// chart) with slit 2 (the y=280 aperture) WALLED OFF — a single opaque barrier
// segment stands where `wall2` + the slit-2 `Tunnel` + `wall3` stood in
// `dse-two-slits`. Nothing else moves: this rung and `dse-two-slits` differ by
// exactly one declared thing — how many apertures the barrier has.
//
// PRE-FLIGHT PREDICTION (recorded before capture; see the ring ladder in
// the header comment of scenes/dse-one-emitter.js, and `dse-one-emitter`'s use of the same
// ladder off-centre here): a slit's exit is a phase-locked point source at its own
// y (the `dse-tunnel-rebuild` composition), so with ONLY slit 1 open the surviving
// population is governed by ONE point source at y=120, D=lambda_eff/4=80 past the
// exit plane. Its own ladder (y0 +/- lambda/4, +/- 3*lambda/4, ...) places bands at
// y = 120-80=40, 120+80=200, and (the m=1 term) 120+240=360 -- the m=1 LOWER term
// (120-240=-120) falls off the 400px canvas and does not exist.
//   PREDICTED: three bands at y=40, y=200, y=360; a dip/minimum on either side of
//   each; NO claim about height relative to `dse-two-slits` — degree of
//   reinforcement is a different question this scene does not ask. The claim under
//   test is PRESENCE AND POSITION: does structure appear at all with one aperture,
//   and does it land on this specific off-centre ladder rather than smearing into
//   a single broad structureless lobe centred on y=120 (the naive "single-slit
//   diffraction hump" expectation, which this engine's per-source ring mechanism
//   does NOT predict — if that is what appears instead, it is a real null.)

import { SphereEmitter, Tunnel, Wall } from '@descix/frqtl-web/parts';

// One Slit -- the SAME apparatus as dse-two-slits with slit 2 WALLED OFF. Barrier =
// Wall segments (destroy); the surviving slit 1 = a directed Tunnel with the exit
// gate collapsed + phase-reset (identical to dse-two-slits' slit1_channel).
  // memo: The world's size.
const CW = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
// ── THE ONLY LENGTH — IDENTICAL to the canonical-leg pair and dse-two-slits ─────
  // memo: λ in pixels: the one geometry knob.
const lamPx  = 320;
  // memo: Colour: fullness 0.3125 → yellow. [src]
const lamArg = 3.2;                       // fullness 1/3.2 = 0.3125 -> yellow
  // memo: 400 → scale 100 → λ = 320 px.
const fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100
const wlScale = Math.floor(fwl / 4);      // 100
// ── SLIT 1's POSITION — IDENTICAL to dse-two-slits' slit-1 aperture ─────────────
// sep is kept only to DERIVE slitCY1 at the exact same y dse-two-slits used (120) —
// there is no slit 2 in this rung, so it is never used to place a second aperture.
  // memo: The plate λ/4 past the slit exit (this source comment: D=lambda_eff/4 [src]).
const legFrac = 1 / 4;
  // memo: 80 px.
const D    = Math.round(lamPx * legFrac);   // 80 — the SAME leg, measured from the
                                           // (single) slit EXIT plane
  // memo: 160: kept so slit 1 sits exactly where it does in dse-two-slits (y 120).
const sep  = lamPx / 2;                     // 160 — dse-two-slits' source separation,
                                           // reused ONLY to derive slit 1's y below
  // memo: 200.
const cy   = Math.round(H / 2);             // 200
  // memo: The ONE slit's centre, y 120.
const slitCY1 = cy - sep / 2;               // 120 — IDENTICAL y to dse-two-slits' slit 1
// ── THE BARRIER — one opaque plate, ONE slit aperture (slit 2 walled off) ───────
  // memo: Barrier 40 px thick.
const barrierW = Math.round(lamPx / 8);     // 40 — plate thickness
  // memo: Aperture 40 px before liners.
const slitH  = Math.round(lamPx / 8);       // 40 — slit aperture height (before liners)
  // memo: Liners 5 px.
const linerH = Math.round(lamPx / 64);      // 5  — liner thickness (unjumpable: max step 2px/tick)
  // memo: Clear bore 30 px.
const bore   = slitH - 2 * linerH;          // 30 — the clear aperture between the liners
  // memo: The emitter at x 20.
const srcX   = Math.round(lamPx / 16);      // 20 — the emitter, well behind the barrier
  // memo: The barrier's front face at x 180.
const barrierL = srcX + Math.round(lamPx / 2);   // 180 — half a wavelength of travel room
  // memo: Slit 1 spans y 100..140.
const slit1Top = slitCY1 - slitH / 2;       // 100 -- slit 1 spans y 100..140
  // memo: The exit plane x 220.
const exitX  = barrierL + barrierW;         // 220 — the slit EXIT plane (barrier back face)
  // memo: The plate at x 300, the same leg as dse-two-slits.
const detX   = exitX + D;                   // 300 — SAME leg as dse-two-slits
  // memo: Plate 5 px.
const detW   = Math.round(lamPx / 64);      // 5   — plate thickness (flux probe, sub-feature)
  // memo: Sink 20 px.
const sinkW  = Math.round(lamPx / 16);      // 20  — far-edge sink thickness

export const parts = {
  // memo: The source.
  source: [SphereEmitter, {
    // memo: Forward half from (20,200), ± charges: it lights the one slit and the wall.
    preset: 'hemisphere', is2D: true, chargeMode: 'random', center: [srcX, cy],
    // memo: Colour and λ.
    wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,
    // memo: 8 a tick.
    burstSize: 8, emitEveryTicks: 1
  }],
  // Barrier segments — opaque destroy sinks, leaving ONE slit gap (slit 1 only). Where
  // dse-two-slits had wall2 (a short strip between the two slits) + a slit-2 Tunnel +
  // wall3 (below slit 2), this rung has ONE solid wall from slit 1's bottom liner all
  // the way to the far edge — slit 2's aperture is WALLED, not narrowed or moved.
  // memo: wall1 [180, 0, 40, 100]: above the slit.
  wall1: [Wall, { rect: [barrierL, 0, barrierW, slit1Top],
    collisionBehavior: 'destroy', color: [200, 60, 60] }],
  // memo: wall2_blocked_slit2 [180, 140, 40, 260]: ONE segment from the slit's bottom to the canvas bottom, standing where wall2, slit 2 and wall3 stand in dse-two-slits. This line is the whole difference between the two rungs.
  wall2_blocked_slit2: [Wall, { rect: [barrierL, slit1Top + slitH, barrierW, H - (slit1Top + slitH)],
    collisionBehavior: 'destroy', color: [150, 40, 40] }],
  // The one surviving slit channel — directed Tunnel, exit gate COLLAPSED + PHASE-RESET
  // (the dse-tunnel-rebuild composition): its own mouth stands in for a point source at
  // y=120, phase-locked — what a SphereEmitter would do at that pixel.
  slit1_channel: [Tunnel, {
    // memo: slit1_channel at y 105..135, a directed Tunnel with a collapsed, phase-reset exit: a point source at y 120.
    left: barrierL, top: slit1Top + linerH, length: barrierW, bore: bore,
    wallThickness: linerH, axis: 'x', mode: 'directed',
    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,
    color: [80, 140, 220]
  }],
  // FAR-EDGE SINK — the same experiment-boundary sink the canonical-leg pair uses.
  // memo: far_sink [580, 0, 20, 400].
  far_sink: [Wall, { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',
    color: [120, 120, 120], alpha: 40 }],
  // ── THE PLATE — SAME instrument as dse-two-slits: a counting wall that does NOT
  // absorb, at the SAME leg D past the new source plane (the one slit exit).
  // memo: screen [300, 0, 5, 400], transparent-probe.
  screen: [Wall, { rect: [detX, 0, detW, H],
    preset: 'transparent-probe', markTag: 'plate', color: [120, 200, 120] }],
};

export default function buildExperiment(exp) {
  // memo: FAIL-LOUD if λ is not reachable.
  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {
    throw new Error('[dse-one-slit] lamPx ' + lamPx + ' is not realisable as lambda_eff: the ' +
      'engine can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');
  }
  // ── THE LIGHT SOURCE — ONE emitter, behind the barrier, lighting the one slit ───
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(CW, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  exp.addObject('LiveChart', {
    // memo: The count-by-y chart behind the plate, drawn vertically.
    source: p.screen, orientation: 90,
    // memo: rect [313, 0, 279, 400].
    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],
    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225
  });
}
```
