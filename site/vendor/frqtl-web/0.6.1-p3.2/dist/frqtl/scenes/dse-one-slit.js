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
const CW = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
// ── THE ONLY LENGTH — IDENTICAL to the canonical-leg pair and dse-two-slits ─────
const lamPx  = 320;
const lamArg = 3.2;                       // fullness 1/3.2 = 0.3125 -> yellow
const fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100
const wlScale = Math.floor(fwl / 4);      // 100
// ── SLIT 1's POSITION — IDENTICAL to dse-two-slits' slit-1 aperture ─────────────
// sep is kept only to DERIVE slitCY1 at the exact same y dse-two-slits used (120) —
// there is no slit 2 in this rung, so it is never used to place a second aperture.
const legFrac = 1 / 4;
const D    = Math.round(lamPx * legFrac);   // 80 — the SAME leg, measured from the
                                           // (single) slit EXIT plane
const sep  = lamPx / 2;                     // 160 — dse-two-slits' source separation,
                                           // reused ONLY to derive slit 1's y below
const cy   = Math.round(H / 2);             // 200
const slitCY1 = cy - sep / 2;               // 120 — IDENTICAL y to dse-two-slits' slit 1
// ── THE BARRIER — one opaque plate, ONE slit aperture (slit 2 walled off) ───────
const barrierW = Math.round(lamPx / 8);     // 40 — plate thickness
const slitH  = Math.round(lamPx / 8);       // 40 — slit aperture height (before liners)
const linerH = Math.round(lamPx / 64);      // 5  — liner thickness (unjumpable: max step 2px/tick)
const bore   = slitH - 2 * linerH;          // 30 — the clear aperture between the liners
const srcX   = Math.round(lamPx / 16);      // 20 — the emitter, well behind the barrier
const barrierL = srcX + Math.round(lamPx / 2);   // 180 — half a wavelength of travel room
const slit1Top = slitCY1 - slitH / 2;       // 100 -- slit 1 spans y 100..140
const exitX  = barrierL + barrierW;         // 220 — the slit EXIT plane (barrier back face)
const detX   = exitX + D;                   // 300 — SAME leg as dse-two-slits
const detW   = Math.round(lamPx / 64);      // 5   — plate thickness (flux probe, sub-feature)
const sinkW  = Math.round(lamPx / 16);      // 20  — far-edge sink thickness

export const parts = {
  source: [SphereEmitter, {
    preset: 'hemisphere', is2D: true, chargeMode: 'random', center: [srcX, cy],
    wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,
    burstSize: 8, emitEveryTicks: 1
  }],
  // Barrier segments — opaque destroy sinks, leaving ONE slit gap (slit 1 only). Where
  // dse-two-slits had wall2 (a short strip between the two slits) + a slit-2 Tunnel +
  // wall3 (below slit 2), this rung has ONE solid wall from slit 1's bottom liner all
  // the way to the far edge — slit 2's aperture is WALLED, not narrowed or moved.
  wall1: [Wall, { rect: [barrierL, 0, barrierW, slit1Top],
    collisionBehavior: 'destroy', color: [200, 60, 60] }],
  wall2_blocked_slit2: [Wall, { rect: [barrierL, slit1Top + slitH, barrierW, H - (slit1Top + slitH)],
    collisionBehavior: 'destroy', color: [150, 40, 40] }],
  // The one surviving slit channel — directed Tunnel, exit gate COLLAPSED + PHASE-RESET
  // (the dse-tunnel-rebuild composition): its own mouth stands in for a point source at
  // y=120, phase-locked — what a SphereEmitter would do at that pixel.
  slit1_channel: [Tunnel, {
    left: barrierL, top: slit1Top + linerH, length: barrierW, bore: bore,
    wallThickness: linerH, axis: 'x', mode: 'directed',
    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,
    color: [80, 140, 220]
  }],
  // FAR-EDGE SINK — the same experiment-boundary sink the canonical-leg pair uses.
  far_sink: [Wall, { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',
    color: [120, 120, 120], alpha: 40 }],
  // ── THE PLATE — SAME instrument as dse-two-slits: a counting wall that does NOT
  // absorb, at the SAME leg D past the new source plane (the one slit exit).
  screen: [Wall, { rect: [detX, 0, detW, H],
    preset: 'transparent-probe', markTag: 'plate', color: [120, 200, 120] }],
};

export default function buildExperiment(exp) {
  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {
    throw new Error('[dse-one-slit] lamPx ' + lamPx + ' is not realisable as lambda_eff: the ' +
      'engine can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');
  }
  // ── THE LIGHT SOURCE — ONE emitter, behind the barrier, lighting the one slit ───
  exp.createCanvas(CW, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  exp.addObject('LiveChart', {
    source: p.screen, orientation: 90,
    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],
    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225
  });
}
