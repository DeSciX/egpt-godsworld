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
const CW = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
// ── THE ONLY LENGTH — IDENTICAL to the canonical-leg pair ───────────────
const lamPx  = 320;
const lamArg = 3.2;                       // fullness 1/3.2 = 0.3125 -> yellow
const fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100
const wlScale = Math.floor(fwl / 4);      // 100
// ── SLIT SEPARATION — IDENTICAL to dse-two-emitters' source separation ──
const legFrac = 1 / 4;
const D    = Math.round(lamPx * legFrac);   // 80 — the SAME leg, now measured from the
                                           // slit EXIT plane, this apparatus's source plane
const sep  = lamPx / 2;                     // 160 -> slit centres at y 120 and 280 — the
                                           // EXACT y positions dse-two-emitters used
const cy   = Math.round(H / 2);             // 200
const slitCY1 = cy - sep / 2, slitCY2 = cy + sep / 2;   // 120, 280
// ── THE BARRIER — one opaque plate, two slit apertures ──────────────────
const barrierW = Math.round(lamPx / 8);     // 40 — plate thickness (dimensionless x lamPx,
                                           // an independent dial from the transverse
                                           // wavelength, same discipline as dse-tunnel-rebuild)
const slitH  = Math.round(lamPx / 8);       // 40 — slit aperture height (before liners)
const linerH = Math.round(lamPx / 64);      // 5  — liner thickness (unjumpable: max step 2px/tick)
const bore   = slitH - 2 * linerH;          // 30 — the clear aperture between the liners
const srcX   = Math.round(lamPx / 16);      // 20 — the emitter, well behind the barrier
const barrierL = srcX + Math.round(lamPx / 2);   // 180 — half a wavelength of travel room
const slit1Top = slitCY1 - slitH / 2, slit2Top = slitCY2 - slitH / 2;   // 100, 260
const exitX  = barrierL + barrierW;         // 220 — the slit EXIT plane (barrier back face)
const detX   = exitX + D;                   // 300 — SAME leg as dse-two-emitters, now
                                           // measured from the slit exits
const detW   = Math.round(lamPx / 64);      // 5   — plate thickness (flux probe, sub-feature)
const sinkW  = Math.round(lamPx / 16);      // 20  — far-edge sink thickness

export const parts = {
  source: [SphereEmitter, {
    preset: 'hemisphere', is2D: true, chargeMode: 'random', center: [srcX, cy],
    wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,
    burstSize: 8, emitEveryTicks: 1
  }],
  // Barrier segments — opaque destroy sinks, leaving the two slit gaps.
  wall1: [Wall, { rect: [barrierL, 0, barrierW, slit1Top],
    collisionBehavior: 'destroy', color: [200, 60, 60] }],
  wall2: [Wall, { rect: [barrierL, slit1Top + slitH, barrierW, slit2Top - (slit1Top + slitH)],
    collisionBehavior: 'destroy', color: [150, 40, 40] }],
  wall3: [Wall, { rect: [barrierL, slit2Top + slitH, barrierW, H - (slit2Top + slitH)],
    collisionBehavior: 'destroy', color: [200, 60, 60] }],
  // The two slit channels — directed Tunnels, exit gate COLLAPSED + PHASE-RESET (the
  // dse-tunnel-rebuild composition): each channel's own mouth stands in for a point
  // source at the slit's own y, phase-locked — what a SphereEmitter would do at that pixel.
  slit1_channel: [Tunnel, {
    left: barrierL, top: slit1Top + linerH, length: barrierW, bore: bore,
    wallThickness: linerH, axis: 'x', mode: 'directed',
    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,
    color: [80, 140, 220]
  }],
  slit2_channel: [Tunnel, {
    left: barrierL, top: slit2Top + linerH, length: barrierW, bore: bore,
    wallThickness: linerH, axis: 'x', mode: 'directed',
    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,
    color: [80, 140, 220]
  }],
  // FAR-EDGE SINK — the same experiment-boundary sink the canonical-leg pair uses.
  far_sink: [Wall, { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',
    color: [120, 120, 120], alpha: 40 }],
  // ── THE PLATE — SAME instrument as the canonical-leg pair: a counting wall that does
  // NOT absorb, at the SAME leg D past the new source plane (the slit exits).
  screen: [Wall, { rect: [detX, 0, detW, H],
    preset: 'transparent-probe', markTag: 'plate', color: [120, 200, 120] }],
};

export default function buildExperiment(exp) {
  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {
    throw new Error('[dse-two-slits] lamPx ' + lamPx + ' is not realisable as lambda_eff: the ' +
      'engine can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');
  }
  // ── THE LIGHT SOURCE — ONE emitter, behind the barrier, lighting BOTH slits ──
  // preset 'hemisphere': 180 degrees of FORWARD emission, aimed at the barrier — the
  // same walk-character (chargeMode/wavelength/fundamentalWaveLength) the slit exits must
  // carry through so the exit's phase-locked point source is at the SAME λ_eff.
  exp.createCanvas(CW, H, SphereEmitter.worldCfg(parts.source[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  exp.addObject('LiveChart', {
    source: p.screen, orientation: 90,
    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],
    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225
  });
}
