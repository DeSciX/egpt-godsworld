# Memory: Atomic model — build

load: GYM scene id `atomic-model` · 2D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/atomic-model.js
source sha256 25d5336471c3aace925b5e502594d7834b9cd05b0a445d912ad9cfc45c91623f · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/atomic-model.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: three nested layers: quarks in a proton, proton and electron in an atom. More quarks: QUARKS_PER_PROTON 64 fills the 8 x 8 proton (fullness 1, a different oscillation: wavelength = capacity/mass = 1). A bigger atom: ATOM_LAYER 7 (128 px). Two electrons: a second makeLeafFrame at another corner and atom.insert it. A helium-like nucleus would be a second proton frame in the atom. No clip has been watched yet (memories/atomic-model/ holds only the tile still): the card says the quarks stay bound and the electron keeps its place with no force law; the drag to try is the electron pulled off and watched for whether it is drawn back a pixel per tick.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Atomic model
 *
 * A sketch file: the WHOLE scene as one `export default function buildExperiment(exp)` module. The
 * world and the three-level frame hierarchy are built here from the engine's own primitives (leaf
 * frames — `engine().Frame`, read when the scene builds — and parent frames from a rect). Registered by
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

import { Rectangle } from '@descix/frqtl-web/parts';
import * as OrbitBag from '@descix/frqtl-web/compat/renderer/orbit-bag.js';
import { engine } from '@descix/frqtl-web/compat/engine.js';

export const parts = {};

export default function buildExperiment(exp) {
  // memo: A square 600 x 600 world.
  var W = 600, H = 600;          // THE WORLD this scene states (its co-init call below)

  // memo: Quarks are 1 x 1 leaves on layer 0.
  var QUARK_LAYER = 0;        // 1x1 leaves
  // memo: The proton is a layer-3 frame: 8 x 8 px, capacity 64. [src]
  var SUBATOMIC_LAYER = 3;    // the proton: 8x8, capacity 64
  // memo: The atom is a layer-6 frame: 64 x 64 px, capacity 4096. Layers nest by powers of two. [src] [HUMAN_GUIDE §Universe, Dimension, Frame, Quantum]
  var ATOM_LAYER = 6;         // the atom: 64x64, capacity 4096
  // memo: The proton's mass at t = 0 is its child count: 48 of 64 → fullness 3/4, wavelength 64/48 = 1.33: its oscillation. [src]
  var QUARKS_PER_PROTON = 48; // the proton's mass at t=0 → wavelength 64/48

  // ── WORLD — a 2D canvas + universe: quark layer fundamental, λ multiplier 1, quarks confined ──
  // memo: THE WORLD: 600 x 600, 2D, fundamental layer 0; bonding true = a child cannot escape its parent's live rect (noEscape), so the nucleus holds.
  exp.createCanvas(W, H, { dimension: QUARK_LAYER, wavelengthScale: 1, bonding: true });
  exp.declare(parts);
  var u = exp.universe;

  // memo: Open the three layers. addDimension returns the layer object; its mb_w is the frame width on that layer (8 for layer 3, 64 for layer 6).
  var quarkDim = u.addDimension(QUARK_LAYER);
  var subatomicDim = u.addDimension(SUBATOMIC_LAYER);
  var atomDim = u.addDimension(ATOM_LAYER);
  var subatomicW = subatomicDim.mb_w, atomW = atomDim.mb_w;

  var Frame = engine().Frame, Charge = engine().Charge;   // the engine's own frame primitive + charge ABI
  var cx = Math.round(W / 2), cy = Math.round(H / 2);
  // memo: The atom's rect, 64 x 64 centred on (300,300): [268, 268, 64, 64].
  var atomRect = new Rectangle(cx, cy, atomW, atomW, null, true);
  // memo: The proton's rect, 8 x 8 at the same centre: [296, 296, 8, 8].
  var protonRect = new Rectangle(cx, cy, subatomicW, subatomicW, null, true);
  var rect = exp.runner.canvas_rect;

  // ── QUARKS — fill the proton rect column by column ─────────────────────
  var quarkW = Math.max(1, Math.pow(2, QUARK_LAYER));
  var quarks = [];
  // memo: Fill the proton rect column by column with positive 1-px leaves until 48 are placed (6 of the 8 columns). The call is Frame.makeLeafFrame(x, y, QUARK_LAYER, 1, 0, 0, false, Charge.POSITIVE, rect) [src]; the public universe.makeLeafFrame names its fourth argument wavelength (left, top, level, wavelength, vx, vy, …) [EXTENDING_FRQTL §2]; predict this 1 means the same. At QUARK_LAYER 0 a leaf's capacity is 1, so it is mass 1 either way [predict]. The later arguments (false, Charge.POSITIVE, rect) differ from the universe form; read them from this call.
  for (var x = protonRect.left; x < protonRect.left + protonRect.w && quarks.length < QUARKS_PER_PROTON; x += quarkW) {
    for (var y = protonRect.top; y < protonRect.top + protonRect.h && quarks.length < QUARKS_PER_PROTON; y += quarkW) {
      var q = Frame.makeLeafFrame(x, y, QUARK_LAYER, 1, 0, 0, false, Charge.POSITIVE, rect);
      q.name = 'quark_' + quarks.length;
      quarks.push(q);
    }
  }
  for (var i = 0; i < quarks.length; i++) { quarkDim.addFrame(quarks[i]); }

  // ── PROTON — the parent frame of the quarks ────────────────────────────
  // memo: The proton: a parent frame made from its rect WITH the quarks as children; each tick its compress() pulls them one pixel toward its centre.
  var proton = subatomicDim.createFrameFromRect(protonRect, quarks, 0, 0);
  proton.name = 'proton';

  // ── ELECTRON — one negative leaf, upper-right of the atom ──────────────
  // memo: One NEGATIVE leaf at (316, 284): three quarters across and a quarter down the atom's rect, upper right of the proton.
  var electron = Frame.makeLeafFrame(atomRect.left + Math.round(atomW * 0.75), atomRect.top + Math.round(atomW * 0.25),
                                     QUARK_LAYER, 1, 0, 0, false, Charge.NEGATIVE, rect);
  electron.name = 'electron';
  quarkDim.addFrame(electron);

  // ── ATOM — stationary parent of the proton; the electron joins directly ─
  // memo: The atom: a STATIONARY parent (the two trailing trues) holding the proton; the lab frame.
  var atom = atomDim.createFrameFromRect(atomRect, [proton], 0, 0, true, true);
  atom.name = 'atom';
  // memo: The electron joins the atom directly as a second child; the atom's compress now pulls it too.
  atom.insert(electron);

  // memo: Leaves are drawn 1 px wide.
  u.leafQuantaWidth = quarkW;
  // memo: The quarks jostle; binding is what survives the jostle.
  u.brownianMotion = true;

  // ── VIEW — frame the atom (render only: the 2D camera's `distance` is the visible physics-px
  //    height). The atom is 64 px in the world; at 1.5x its width it fills two thirds of the view,
  //    so the proton, its quarks and the electron are individually legible. ─────────────────────
  var cam = exp.runner.cameraControl;
  var flat = !OrbitBag.hasAngularPose(cam);
  // memo: Render only: aim the 2D camera at the atom and zoom to 1.5 x its width (96 px visible height) so quarks, proton and electron are each legible.
  if (cam && typeof cam.setOrbit === 'function' && flat) {
    cam.setOrbit({ target: { x: cx, y: cy }, distance: Math.round(atomW * 1.5) });
  }
}
```
