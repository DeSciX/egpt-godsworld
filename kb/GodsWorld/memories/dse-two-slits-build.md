# Memory: Two Slits at the Canonical Leg — build

load: GYM scene id `dse-two-slits` · 2D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/dse-two-slits.js
source sha256 cdc040572354134f3f4d1952cd43d570c5efb1679c22cfa523a3f6ffd4dd0d1d · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/dse-two-slits.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: one emitter behind a barrier with two slit channels, the see-through plate λ/4 past the slit exits. The claim: the same picture as dse-two-emitters (central peak at y 200, bands at 40 and 360), because a collapsed, phase-reset slit exit IS a point source. A third slit: a third Tunnel between the others (make wall2 two pieces around a new aperture at y 200), predict a denser midline. Closing slit 2 (wall3 dragged up 40 px, or dse-one-slit as a file) predict bands at 40, 200, 360 (dse-one-slit's card states that as the prediction under test). A wider slit: slitH = lamPx/4 (80 px). The clip (memories/dse-two-slits/clip.mp4) showed the yellow ball reaching the barrier by ≈120 ticks, ring-like arcs round the source, dots through both slots and a sparse scatter beyond the plate by 1202; no bands readable by eye and no chart line drawn in that recording.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Two Slits at the Canonical Leg
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-two-slits).
 */

// ── TWO SLITS AT THE CANONICAL LEG ───────────────────────────────────────────
//
// The SAME apparatus as `dse-two-emitters` — same λ, same separation, same leg,
// same detector, same chart — but the two point sources are now SLIT EXITS in
// an opaque barrier rather than two free emitters. ONE emitter sits behind the
// barrier and feeds BOTH slit channels; each channel is a `directed` Tunnel
// with the exit gate COLLAPSED + PHASE-RESET, exactly the composition
// `dse-tunnel-rebuild` already uses to make a slit's own mouth stand in for a
// point source ("THE TUNNEL IS A CONFIGURED EMITTER", see that
// rung's source comment for the flag-by-flag mapping). Composed only: Wall +
// Tunnel, zero new parts, zero engine code.
//
// WHY THE NUMBERS ARE THE SAME AS `dse-two-emitters`. That rung places its two
// SOURCES at y = cy∓sep/2 (120, 280) and its plate at D = λ_eff/4 past the
// SOURCE plane (srcX). Here the slit CENTRES sit at the identical y = 120, 280
// (`sep` unchanged), and the plate sits at the identical D = λ_eff/4 — now
// measured past the SLIT EXIT plane (the barrier's back face), which is this
// apparatus's new "source plane". If the exit gate's point-source claim holds,
// the two apparatuses must draw the SAME picture: a central peak at y = 200
// (source 1's lower band and source 2's upper band coincide there) flanked by
// the outer bands at y = 40 and y = 360 — because nothing about the DERIVATION
// of those positions used "free emitter" anywhere; it only used "point source
// at (x0, y0), phase-locked, λ_eff". A slit exit under `exitPhaseReset` is
// exactly that.
//
// λ_eff, the leg, and the plate/instrument are the scenes/dse-one-emitter.js numbers,
// copied rather than referenced because this rung's body is shaped completely
// differently (a barrier + two Tunnels stand where two bare SphereEmitters
// stood) — there is no shared statement to factor without re-introducing the
// exact config-mirror risk the emitter pair's line-diff test guards elsewhere.
// The bare numbers (320 / 3.2 / 400 / 80 / 160) are the SAME numbers, and the
// fail-loud realisability check is repeated verbatim so a future λ edit here
// cannot silently drift from the pair it must match.

import { SphereEmitter, Tunnel, Wall } from '@descix/frqtl-web/parts';

// Two Slits — reproduces dse-two-emitters' picture with the two point sources built
// as SLIT EXITS in a barrier instead of two free emitters. Barrier = Wall segments
// (destroy); each slit = a directed Tunnel with the exit gate collapsed + phase-reset
// (the dse-tunnel-rebuild composition) so the mouth is a phase-locked point source.
  // memo: The world's size.
const CW = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
// ── THE ONLY LENGTH — IDENTICAL to the canonical-leg pair ───────────────
  // memo: λ in pixels: the one geometry knob (every size below is a fraction of it).
const lamPx  = 320;
  // memo: capacity/mass → fullness 0.3125 → yellow. Colour only. [src]
const lamArg = 3.2;                       // fullness 1/3.2 = 0.3125 -> yellow
  // memo: fundamentalWaveLength 400 → scale 100 → λ = 3.2 × 100 = 320 px.
const fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100
const wlScale = Math.floor(fwl / 4);      // 100
// ── SLIT SEPARATION — IDENTICAL to dse-two-emitters' source separation ──
  // memo: The plate stands λ/4 past the slit EXIT plane (this apparatus's source plane) [src].
const legFrac = 1 / 4;
  // memo: 80 px.
const D    = Math.round(lamPx * legFrac);   // 80 — the SAME leg, now measured from the
                                           // slit EXIT plane, this apparatus's source plane
  // memo: Slit centres 160 px = λ/2 apart: y 120 and 280, the same y the two free emitters use.
const sep  = lamPx / 2;                     // 160 -> slit centres at y 120 and 280 — the
                                           // EXACT y positions dse-two-emitters used
  // memo: 200.
const cy   = Math.round(H / 2);             // 200
  // memo: 120 and 280.
const slitCY1 = cy - sep / 2, slitCY2 = cy + sep / 2;   // 120, 280
// ── THE BARRIER — one opaque plate, two slit apertures ──────────────────
  // memo: The barrier (and each channel) is 40 px thick.
const barrierW = Math.round(lamPx / 8);     // 40 — plate thickness (dimensionless x lamPx,
                                           // an independent dial from the transverse
                                           // wavelength, same discipline as dse-tunnel-rebuild)
  // memo: Each slit aperture is 40 px tall before its liners.
const slitH  = Math.round(lamPx / 8);       // 40 — slit aperture height (before liners)
  // memo: Channel liner walls 5 px: a step is at most 2 px/tick, so a liner cannot be jumped.
const linerH = Math.round(lamPx / 64);      // 5  — liner thickness (unjumpable: max step 2px/tick)
  // memo: The clear aperture between liners: 30 px.
const bore   = slitH - 2 * linerH;          // 30 — the clear aperture between the liners
  // memo: The one emitter at x 20.
const srcX   = Math.round(lamPx / 16);      // 20 — the emitter, well behind the barrier
  // memo: The barrier's front face at x 180: half a wavelength of travel room from the source.
const barrierL = srcX + Math.round(lamPx / 2);   // 180 — half a wavelength of travel room
  // memo: Slit tops at y 100 and 260.
const slit1Top = slitCY1 - slitH / 2, slit2Top = slitCY2 - slitH / 2;   // 100, 260
  // memo: The slit EXIT plane: the barrier's back face, x 220.
const exitX  = barrierL + barrierW;         // 220 — the slit EXIT plane (barrier back face)
  // memo: The plate's front face at x 300: the same leg as dse-two-emitters, measured from the exits.
const detX   = exitX + D;                   // 300 — SAME leg as dse-two-emitters, now
                                           // measured from the slit exits
  // memo: Plate 5 px thick.
const detW   = Math.round(lamPx / 64);      // 5   — plate thickness (flux probe, sub-feature)
  // memo: Far sink 20 px.
const sinkW  = Math.round(lamPx / 16);      // 20  — far-edge sink thickness

export const parts = {
  // memo: The one source.
  source: [SphereEmitter, {
    // memo: Forward half only, from (20,200), ± charges: it lights BOTH slits.
    preset: 'hemisphere', is2D: true, chargeMode: 'random', center: [srcX, cy],
    // memo: Colour and λ from the knobs above.
    wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,
    // memo: 8 a tick.
    burstSize: 8, emitEveryTicks: 1
  }],
  // Barrier segments — opaque destroy sinks, leaving the two slit gaps.
  // memo: wall1 [180, 0, 40, 100]: the barrier above slit 1; destroy = an opaque sink.
  wall1: [Wall, { rect: [barrierL, 0, barrierW, slit1Top],
    collisionBehavior: 'destroy', color: [200, 60, 60] }],
  // memo: wall2 [180, 140, 40, 120]: the barrier between the slits (darker red).
  wall2: [Wall, { rect: [barrierL, slit1Top + slitH, barrierW, slit2Top - (slit1Top + slitH)],
    collisionBehavior: 'destroy', color: [150, 40, 40] }],
  // memo: wall3 [180, 300, 40, 100]: the barrier below slit 2. Drag it up 40 px and it covers slit 2.
  wall3: [Wall, { rect: [barrierL, slit2Top + slitH, barrierW, H - (slit2Top + slitH)],
    collisionBehavior: 'destroy', color: [200, 60, 60] }],
  // The two slit channels — directed Tunnels, exit gate COLLAPSED + PHASE-RESET (the
  // dse-tunnel-rebuild composition): each channel's own mouth stands in for a point
  // source at the slit's own y, phase-locked — what a SphereEmitter would do at that pixel.
  slit1_channel: [Tunnel, {
    // memo: slit1_channel: a Tunnel through the barrier at y 105..135 (liners at 100 and 135), 40 long, bore 30, along x.
    left: barrierL, top: slit1Top + linerH, length: barrierW, bore: bore,
    // memo: mode 'directed' = a wall hit inside the channel re-emits the quantum in a random direction within 180° of the corridor axis: the slit acts as a semicircular emitter (a mirror channel would only project the beam it was given).
    wallThickness: linerH, axis: 'x', mode: 'directed',
    // memo: The exit gate: collapse + recenter = every quantum leaves from the bore's mid-line (a POINT source); phaseReset = all with the same phase. This is what makes the slit exit a phase-locked point source at its own y.
    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,
    // memo: Blue liners.
    color: [80, 140, 220]
  }],
  slit2_channel: [Tunnel, {
    // memo: slit2_channel: the same channel at y 265..295.
    left: barrierL, top: slit2Top + linerH, length: barrierW, bore: bore,
    wallThickness: linerH, axis: 'x', mode: 'directed',
    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,
    color: [80, 140, 220]
  }],
  // FAR-EDGE SINK — the same experiment-boundary sink the canonical-leg pair uses.
  // memo: far_sink [580, 0, 20, 400]: the boundary where quanta that pass the probe die.
  far_sink: [Wall, { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',
    color: [120, 120, 120], alpha: 40 }],
  // ── THE PLATE — SAME instrument as the canonical-leg pair: a counting wall that does
  // NOT absorb, at the SAME leg D past the new source plane (the slit exits).
  // memo: screen [300, 0, 5, 400]: transparent-probe, counts without absorbing, tags what crosses with 'plate'.
  screen: [Wall, { rect: [detX, 0, detW, H],
    preset: 'transparent-probe', markTag: 'plate', color: [120, 200, 120] }],
};

export default function buildExperiment(exp) {
  // memo: FAIL-LOUD if lamPx is not reachable by the engine's wavelength arithmetic. [src]
  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {
    throw new Error('[dse-two-slits] lamPx ' + lamPx + ' is not realisable as lambda_eff: the ' +
      'engine can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');
  }
  // ── THE LIGHT SOURCE — ONE emitter, behind the barrier, lighting BOTH slits ──
  // preset 'hemisphere': 180 degrees of FORWARD emission, aimed at the barrier — the
  // same walk-character (chargeMode/wavelength/fundamentalWaveLength) the slit exits must
  // carry through so the exit's phase-locked point source is at the SAME λ_eff.
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(CW, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  // memo: The count-by-y chart behind the plate.
  exp.addObject('LiveChart', {
    // memo: Reads the plate; drawn vertically.
    source: p.screen, orientation: 90,
    // memo: rect [313, 0, 279, 400]: from behind the plate to the right edge.
    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],
    // memo: A line on a navy panel.
    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225
  });
}
```
