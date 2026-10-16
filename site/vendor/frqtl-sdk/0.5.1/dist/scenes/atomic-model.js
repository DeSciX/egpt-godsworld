/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Atomic model
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world and the
 * three-level frame hierarchy are built here from the engine's own primitives (leaf frames, parent
 * frames from a rect); the renderer and the engine are includes. Registered by
 * lib/shim/registry/walkthrough.js (rung atomic-model).
 *
 * Physics (zero new — bench H1, A1, A2, M1, M4): 48 one-pixel quarks fill an 8x8 proton frame; the
 * proton and one electron sit in a 64x64 atom frame. There is no force equation. Each parent's
 * compress() pulls its children one pixel toward its centre each tick (A1: a stationary parent
 * CONFINES a child), a parent's motion is carried by its children (A2), a parent's mass is its
 * child count (H1), and its wavelength is capacity/mass (M4) — 64/48 → the proton's oscillation.
 * The atom is stationary: the lab frame. `bonding` (noEscape) traps each quark in its parent's
 * live rect, so the nucleus holds together: binding emerges from compress, not from a law.
 *
 * Order (it seeds the run): world → the three layers → quarks (grid-filled, registered) → proton
 * from its rect → electron (registered) → atom from its rect → electron into the atom.
 */

function buildExperiment(exp) {
  var W = 600, H = 600;          // THE WORLD this scene states (its co-init call below)

  var QUARK_LAYER = 0;        // 1x1 leaves
  var SUBATOMIC_LAYER = 3;    // the proton: 8x8, capacity 64
  var ATOM_LAYER = 6;         // the atom: 64x64, capacity 4096
  var QUARKS_PER_PROTON = 48; // the proton's mass at t=0 → wavelength 64/48

  // ── WORLD — a 2D canvas + universe: quark layer fundamental, λ multiplier 1, quarks confined ──
  exp.createCanvas(W, H, { dimension: QUARK_LAYER, wavelengthScale: 1, bonding: true });
  var u = exp.universe;

  var quarkDim = u.addDimension(QUARK_LAYER);
  var subatomicDim = u.addDimension(SUBATOMIC_LAYER);
  var atomDim = u.addDimension(ATOM_LAYER);
  var subatomicW = subatomicDim.mb_w, atomW = atomDim.mb_w;

  var cx = Math.round(W / 2), cy = Math.round(H / 2);
  var atomRect = new Rectangle(cx, cy, atomW, atomW, null, true);
  var protonRect = new Rectangle(cx, cy, subatomicW, subatomicW, null, true);
  var rect = exp.runner.canvas_rect;

  // ── QUARKS — fill the proton rect column by column ─────────────────────
  var quarkW = Math.max(1, Math.pow(2, QUARK_LAYER));
  var quarks = [];
  for (var x = protonRect.left; x < protonRect.left + protonRect.w && quarks.length < QUARKS_PER_PROTON; x += quarkW) {
    for (var y = protonRect.top; y < protonRect.top + protonRect.h && quarks.length < QUARKS_PER_PROTON; y += quarkW) {
      var q = Frame.makeLeafFrame(x, y, QUARK_LAYER, 1, 0, 0, false, Charge.POSITIVE, rect);
      q.name = 'quark_' + quarks.length;
      quarks.push(q);
    }
  }
  for (var i = 0; i < quarks.length; i++) { quarkDim.addFrame(quarks[i]); }

  // ── PROTON — the parent frame of the quarks ────────────────────────────
  var proton = subatomicDim.createFrameFromRect(protonRect, quarks, 0, 0);
  proton.name = 'proton';

  // ── ELECTRON — one negative leaf, upper-right of the atom ──────────────
  var electron = Frame.makeLeafFrame(atomRect.left + Math.round(atomW * 0.75), atomRect.top + Math.round(atomW * 0.25),
                                     QUARK_LAYER, 1, 0, 0, false, Charge.NEGATIVE, rect);
  electron.name = 'electron';
  quarkDim.addFrame(electron);

  // ── ATOM — stationary parent of the proton; the electron joins directly ─
  var atom = atomDim.createFrameFromRect(atomRect, [proton], 0, 0, true, true);
  atom.name = 'atom';
  atom.insert(electron);

  u.leafQuantaWidth = quarkW;
  u.brownianMotion = true;

  // ── VIEW — frame the atom (render only: the 2D camera's `distance` is the visible physics-px
  //    height). The atom is 64 px in the world; at 1.5x its width it fills two thirds of the view,
  //    so the proton, its quarks and the electron are individually legible. ─────────────────────
  var cam = exp.runner.cameraControl;
  var flat = !(typeof window !== 'undefined' && window.OrbitBag && window.OrbitBag.hasAngularPose(cam));
  if (cam && typeof cam.setOrbit === 'function' && flat) {
    cam.setOrbit({ target: { x: cx, y: cy }, distance: Math.round(atomW * 1.5) });
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
