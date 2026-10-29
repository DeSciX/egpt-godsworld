/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Double Slit (Tunnel, symmetric)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-tunnel-rebuild).
 */

// The double slit built on the TUNNEL OBJECT at physical DSE proportions. The two
// slit channels are Tunnels — TWO parallel MIRROR walls (guarded bounce, zero leak) — so
// the slit reflects the beam; the barriers + screen are v2 Walls (destroy / detector-screen
// preset), declared in `parts` so a hand edit is a code edit. GEOMETRY: SYMMETRIC —
// emitter->front of the slit wall equals back of the slit wall->detector. The near-field
// result is a balanced, central-dominant three-lobe double-slit interference pattern (a
// stochastic near-field walk; the ray-optics λL/d Fraunhofer regime needs L >> d²/λ ≈ 580px,
// larger than a 600px canvas allows).
//
// ONE MODE-AWARE SOURCE (S3/W2). The mode strip
// selects the RENDERER the host boots (renderState.renderer), and this scene reads it ONCE,
// before its world: `three` ⇒ exp.createScene (a 3D world), else exp.createCanvas (2D).
// `parts` is written in the DEFAULT mode, 3D; in 2D the scene declares flat2D(parts), the
// scene's own statement of its 2D delta — there is NO second (`-3d`) source file:
//   * the emitter opens the z-axis   (is2D:!IS3D → activeAxes.z, a 3D ball of directions);
//   * every barrier / tunnel / detector gains the SAME z-slab (z/depth → a 6-element rect),
//     so the slit wall is a real SLOT-in-a-PLATE and what you SEE is what collides;
//   * two invisible `destroy` z-collimators sit flush OUTSIDE the plate z-band (the
//     cl1a-mirror-3d pattern — the universe z-edge moved inward, the sanctioned
//     experiment-boundary sink), so no quantum can sail BESIDE a plate and read as
//     pass-through, and every alive quantum provably faces the barrier;
//   * 3D makes the detector a GraphingDetectorWall that paints its hits over its OWN
//     face (y,z), spatially registered — the fringes read as BANDS on the plate, in the
//     place the physics put them. In 2D the screen is a plain counting Wall.
// The 3D physics is the SAME engine physics (2D≡3D, bench H2a/H2b) — zero new physics.
//
// COLOUR: the beam is YELLOW because it IS a yellow-band beam — the leaves are emitted
// COLOURLESS and the renderer derives their colour from LightColor at their fullness
// (= mass/capacity = 1/wavelength). See the emitter block in the source for the two
// independent dials (band vs pixel wavelength) and why the fringe geometry is unchanged.

import { CameraControls, FrqtlControlOverlay, FrqtlControlsPanel, GraphingDetectorWall, SphereEmitter, Tunnel, Wall } from '@descix/frqtl-web/parts';
import * as ControlRegistry from '@descix/frqtl-web/shim/controls/registry.js';
import * as FrqtlDisplay from '@descix/frqtl-web/compat/renderer/display-slot.js';

const CW = 600, H = 400, WORLD_D = 600;   // THE WORLD this scene states (its co-init call below)
// GEOMETRY and WAVELENGTH are two INDEPENDENT dials, and they are kept apart on
// purpose: `wl` sizes the PLATE (slit height, gap, wall placement) and nothing else,
// while `lamPx` is the transverse wavelength in pixels. Doubling lambda must NOT move
// the slit wall — if one variable drove both, the aperture would silently walk every
// time the beam was re-tuned and no two runs would be comparable.
const wl = 64, sh = Math.floor(wl * 0.8), gap = Math.floor(wl * 0.8);   // 51, 51
const lamPx = 128;                          // the TRANSVERSE wavelength, in pixels
const groupH = sh + gap + sh;               // 153
const gcY = H / 2;                          // 300 @ H=600
const s1Top = gcY - groupH / 2;             // 223.5
const gapTop = s1Top + sh;                  // 274.5
const s2Bot = gcY + groupH / 2;             // 376.5
const s2Top = s2Bot - sh;                   // 325.5
const srcX = 20;                            // source x (left, near the slit wall)
const L = wl * 1.5, W = wl;                 // slit-group left 96, width 64 (wall front..back = [96,160])
// THE DETECTOR LEG, DERIVED FROM THE RING LADDER (zero free parameters).
// A phase-locked POINT source lays down density rings at r_m = (lambda/4)*sqrt((2m+1)^2+1)
// measured from the emission point (guide row r3-radius-stall-shells). Each slit exit below
// IS such a source, so the plate should be placed where
// a NAMED ring crosses it rather than at a symmetric figure. Put the MIDLINE on ring m=2
// of BOTH slits: with the exits at +/-halfSep from the midline, that needs a leg of
//     D = sqrt(r_2^2 - halfSep^2) = sqrt(163.2^2 - 51^2) = 155
// so the two ring-2 circles intersect exactly on the axis and the centre is DOUBLY
// reinforced. Rings inside D (m=0 at 45.3, m=1 at 101.2) never reach the plate and
// contribute no band — a measured property of the ladder, not an assumption.
// This REPLACES the old symmetric-leg figure, whose own comment made it conditional on
// the slits becoming directed emitters; the exit gates below are that condition.
const ringR = function (m) { return (lamPx / 4) * Math.sqrt((2 * m + 1) * (2 * m + 1) + 1); };
const slitCY1 = s1Top + sh / 2, slitCY2 = s2Top + sh / 2;   // 249, 351 — the bore midlines
const halfSep = gcY - slitCY1;              // 51
const detW = 20;                            // the detector plate's own thickness
const D = Math.round(Math.sqrt(ringR(2) * ringR(2) - halfSep * halfSep));   // 155
const detX = (L + W) + D;                   // 315
const linerH = Math.min(10, Math.floor(sh * 0.2)), bore = sh - 2 * linerH;   // 10, 31
// THE 3D DELTA: the plate z-band. Every barrier / tunnel liner / detector in `parts`
// carries the SAME z-slab (z: -zHalf, depth: 2 * zHalf), so the slit wall is a genuine SLOT
// IN A PLATE standing in space (the slits are slots long in z — the 2D figure extruded).
// flat2D (below) deletes the slab, so the 2D scene is the flat figure.
const zHalf = Math.round(groupH / 2);                                   // 77 @ wl 64
// THE BEAM'S COLOUR — its own frequency band, never a forced recolor. The emitter
// emits COLOURLESS leaves (no renderColor arg ⇒ no string_map['render.color']), so the
// renderer derives the colour from the ONE authority, LightColor, at the leaf's
// fullness. TWO INDEPENDENT dials produce it, both on the emitter:
//   fullness  = mass/capacity = 1 / wavelength      -> the spectral BAND (LightColor)
//   lambda_px = wavelength x wavelengthScale        -> the transverse wave, in PIXELS
// (wavelengthScale = floor(fundamentalWaveLength / 4)). So the band is chosen by
// scaling fundamentalWaveLength INVERSELY with the wavelength arg — lambda_px (the
// fringe geometry) is untouched. 1/3.2 = 0.3125 sits in the YELLOW band; the rung's
// renderState declares the spectrally correct 'roygbiv' ramp, so the beam renders
// [255,243,0]. lambda_px = 3.2 x 40 = 128, INDEPENDENT of the 64-derived plate.
// THIS BEAM IS LIGHT, so the band is free: these leaves are born AT the universe's
// fundamental dimension (leafDimension == fundamentalDimension == 2), and a leaf at the
// fundamental ALWAYS steps, P=1, whatever its fullness (bench M1) — the fullness
// move-gate (bench M2) simply does not apply, and P=1 draws no RNG. Measured on the
// live detector: the fringe histogram is bin-for-bin the SAME as the (64, 16) tuple
// (t=30s, 16px profile: 11260 vs 11262 hits, every bin within 1, COM 201.7 both).
const lamArg = 3.2;                         // fullness 1/3.2 = 0.3125 -> yellow
const fwl    = 4 * (lamPx / lamArg);        // 160 -> wavelengthScale 40 -> lambda_px = 128

// The light source — the current SphereEmitter sugar (braided walk), placed at the
// original source pixel (srcX, gap-center = H/2).
// is2D:!IS3D opens activeAxes.z — the ball-rejected sampler then draws a 3D BALL of
// directions (bench S1/S5) instead of the 2D disk.
// preset 'hemisphere' = 180 degrees of FORWARD emission (D1): the SAME ball-rejected
// sampler with the forward axis' range halved to [0,R], i.e. the spherical distribution
// RESTRICTED to the forward half — same physics, pointed one way, so nothing about the
// walk changes. Forward is +X, which is where the slit wall stands (orientationDeg stays
// 0), so the half of the burst that used to fly LEFT into the back-scatter sink now goes
// toward the slits: the same burst size illuminates the aperture roughly twice as hard.
export const parts = {
  source: [SphereEmitter, {
    preset: 'hemisphere', is2D: false, center: [srcX, Math.round(gcY)],
    chargeMode: 'random', wavelength: lamArg, burstSize: 8, emitEveryTicks: 1,
    fundamentalDimension: 2, fundamentalWaveLength: fwl
  }],
  // Start wall — a plain sink (collisionBehavior:'destroy', [set is_alive=0]) at the
  // left edge, catching back-scatter. It is TRANSPARENT (alpha 40 of 255): the default
  // camera stands BEHIND the emitter, so an opaque slab here would be the first thing in
  // frame and would hide the whole experiment. alpha is a DECLARED Wall field, so the parts block
  // carries it and Restart rebuilds the wall just as sheer. Physics is untouched — the
  // sink still destroys every back-scattered quantum (render-only, SU1).
  start_wall: [Wall, { rect: [0, 0, 10, H], z: -zHalf, depth: 2 * zHalf, collisionBehavior: 'destroy', color: [120, 120, 120], alpha: 40 }],
  // Barrier segments — opaque plain sinks (destroy) leaving the two slit gaps.
  wall1: [Wall, { rect: [L, 0, W, s1Top - 1], z: -zHalf, depth: 2 * zHalf, collisionBehavior: 'destroy', color: [200, 60, 60] }],
  wall2: [Wall, { rect: [L, gapTop, W, gap - 1], z: -zHalf, depth: 2 * zHalf, collisionBehavior: 'destroy', color: [150, 40, 40] }],
  wall3: [Wall, { rect: [L, s2Bot, W, (H - s2Bot) - 1], z: -zHalf, depth: 2 * zHalf, collisionBehavior: 'destroy', color: [200, 60, 60] }],
  // The two slit channels as TUNNELS — walls land at the EXACT original liner positions
  // ([L,s1Top,W,10] & [L,s1Top+sh-10,W,10]); the bore is the clear aperture between them.
  // The Tunnel ferries z/depth onto BOTH walls, so a 3D channel is a real corridor.
  // mode 'directed' (D2): the channel walls are no longer mirrors — a wall hit ejects the
  // quantum back into the bore and RE-EMITS it in a uniformly random direction within 180°
  // of the corridor axis (+x here, derived from axis:'x'). That is what makes the slit
  // itself behave as a semi-circular emitter, which is the classical picture of what a
  // slit does to a wavefront — and it supersedes the mirror mode FOR THIS RUNG: a
  // collimating mirror channel preserves the incoming direction, so the two slits could
  // only ever project two beams. Re-emission is what gives each slit its own angular
  // spread to interfere with. Mirror mode stays available on the object (mode:'mirror',
  // still the default) for the waveguide/light-pipe case it was built for.
  // THE TUNNEL IS A CONFIGURED EMITTER. The exit gate's flags are not
  // plumbing details — they ARE the emitter vocabulary, one-to-one:
  //   exitRecenter ON  + exitPhaseReset ON  -> a POINT SOURCE (every quantum leaves the
  //        same pixel with the same phase) — what this rung uses, and what makes the ring
  //        ladder sharp: any spread at birth blurs every ring by exactly that spread.
  //   exitRecenter OFF + exitPhaseReset ON  -> an EXTENDED LOCKED APERTURE, the
  //        plane-wave analog (phase-flat across a finite mouth).
  //   mode 'directed' spread                -> the ANGULAR PRESET (here 180 deg about the
  //        corridor axis — the hemisphere preset, expressed at a slit).
  // In 3D the recenter pins the TRANSVERSE axis only, so the slot stays extended in z:
  // each slit is a LINE source and the bands extrude along z — the plate picture.
  // Unifying this with the SphereEmitter preset vocabulary (one owner, ferried — never a
  // second preset list) is an open contract design;
  // this rung uses the existing flags and documents the mapping.
  slit1_channel: [Tunnel, { left: L, top: s1Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x', z: -zHalf, depth: 2 * zHalf, mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, color: [80, 140, 220] }],
  slit2_channel: [Tunnel, { left: L, top: s2Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x', z: -zHalf, depth: 2 * zHalf, mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, color: [80, 140, 220] }],
  // The detector SCREEN — a NON-ABSORBING COUNTING wall ('transparent-probe':
  // collisionBehavior 'nothing' + the count hook) in BOTH modes. This is the
  // |psi|^2-faithful screen: an ABSORBING plate removes each quantum at first contact,
  // so the reading becomes a first-arrival caustic that drifts with the leg D and lands
  // at the WRONG radii; counting WITHOUT absorbing reproduces the ring ladder exactly,
  // because the census at a plane IS the density at that plane. The far-edge sink above bounds the
  // population that now flies past. The KIND follows the detector's dimensionality. In 2D it is a plain Wall.
  // In 3D the detector is a PLATE, so it
  // is a GraphingDetectorWall: it paints its OWN hit grid onto its own faces, spatially
  // REGISTERED (a hot cell sits exactly where the collisions landed) — the wall is the
  // axis, so there is no chart chrome in the scene. Both broad faces carry the map, so it
  // never disappears as you orbit (the back reads as the through-the-window mirror).
  // NOTE: a wall's collided-frame buffer may be drained by ONE consumer per tick — the
  // heatmap painter IS that consumer in 3D.
  // FAR-EDGE SINK. The screen below COUNTS WITHOUT ABSORBING, so quanta fly on past it;
  // this destroy wall at the right edge is the experiment-boundary sink that keeps the
  // population bounded (Invariant 5/7 — only an experiment boundary may destroy).
  far_sink: [Wall, { rect: [CW - 10, 0, 10, H], z: -zHalf, depth: 2 * zHalf, collisionBehavior: 'destroy', color: [120, 120, 120], alpha: 40 }],
  screen: [GraphingDetectorWall, { rect: [detX, 0, detW, H], z: -zHalf, depth: 2 * zHalf, preset: 'transparent-probe', color: [120, 200, 120], alpha: 220, binPx: 12 }],
};

/**
 * flat2D(parts) — THE 2D MODE of this scene, derived from its 3D `parts`: the same keys in the same order,
 * each entry's props copied with the z-slab (z, depth) deleted, is2D set true (by assignment, so the key
 * keeps its position), and the GraphingDetectorWall plate a plain counting Wall without its paint
 * (alpha, binPx). Pure: it reads only its argument. A hand-added entry flattens by the same rule.
 */
function flat2D(parts) {
  var out = {};
  Object.keys(parts).forEach(function (key) {
    var K = parts[key][0];
    var props = Object.assign({}, parts[key][1]);
    delete props.z;
    delete props.depth;
    if ('is2D' in props) { props.is2D = true; }
    if (K === GraphingDetectorWall) { K = Wall; delete props.alpha; delete props.binPx; }
    out[key] = [K, props];
  });
  return out;
}

export default function buildExperiment(exp) {
  // Double Slit (Tunnel) — the two slit channels are MIRROR TUNNELS (guarded
  // bounce, zero-leak); the detector sits at the SYMMETRIC distance (emitter->front ==
  // back->detector). X placements are wl-derived (canvas-width-independent); Y is
  // centered on H (groupCenterY = H/2).
  // The booted display (the host's renderState.renderer) decides which world this mode makes.
  var IS3D = FrqtlDisplay.name() === 'three';
  var P = IS3D ? parts : flat2D(parts);
  // THE WORLD — first, then parts: a 3D scene + universe (600x400x600) or a 2D canvas + universe.
  if (IS3D) { exp.createScene(CW, H, WORLD_D, SphereEmitter.worldCfg(P.source[1])); }
  else      { exp.createCanvas(CW, H, SphereEmitter.worldCfg(P.source[1])); }
  exp.declare(P);
  if (IS3D) {
    // SCENE Z-COLLIMATORS — two INVISIBLE full-canvas destroy boundaries flush OUTSIDE
    // the plate z-band (the cl1a-mirror-3d pattern): the emitted ball's z-tail diffuses,
    // and any quantum beyond the plate band would sail BESIDE the barrier and read as
    // pass-through. Clamping the scene to the plate band makes the barrier provably face
    // EVERY alive quantum. 40px deep: un-jumpable (max z step is +/-2/tick).
    exp.addObject('Wall', { rect: [0, 0, CW, H], z: zHalf, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipFar', visible: false });
    exp.addObject('Wall', { rect: [0, 0, CW, H], z: -zHalf - 40, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipNear', visible: false });
    // PACING (wall-clock only, never the ticks): 240 ticks/s, four times the 1:1 lock on a
    // 60 Hz display, so the interference bands build up four times sooner in real time.
    exp.runner.setRateLimits({ tpsLimit: 240 });
    // THE SWITCH: this scene's god-ray look, computed from the light particles only (godraySource
    // 'leaf') with the 'field' pass (each pixel marches along the local direction of travel), and the
    // per-layer glow under it. The numbers are this scene's own, set by eye against a reference
    // STUDIO picture (godrays 2.2 of [0, 3], godrayDensity 1.5 = the top of [0.2, 1.5],
    // glowIntensity 0.66 of [0, 3]); the renderer declares the keys and their ranges and refuses any
    // other. Default ON: the scene writes ON once at build, through the same function the knob calls.
    // OFF restores EXACTLY what was live before the last ON (a host row, a STUDIO slider), through
    // the same declared door. The knob shows its last written value (a render write has no
    // read-back). The picture changes at the next drawn tick, so in a paused (Design) view it shows
    // once the scene runs.
    var RAYS_ON = { godrays: 2.2, godrayDensity: 1.5, godrayMode: 'field', godraySource: 'leaf', glowIntensity: 0.66 };
    var RAYS_DEFAULT = 1;
    var raysPrior = null;   // the live values of RAYS_ON's keys captured at ON; written back at OFF
    function setRays(v) {
      if (v) {
        // Capture only on the OFF -> ON edge: an ON pressed while already ON keeps the pre-ON state.
        if (!raysPrior) {
          raysPrior = {};
          Object.keys(RAYS_ON).forEach(function (k) { raysPrior[k] = exp.runner.getRenderOption(k); });
        }
        exp.runner.setRenderOptions(RAYS_ON);
      } else if (raysPrior) {
        exp.runner.setRenderOptions(raysPrior);
        raysPrior = null;
      }
      // OFF with nothing captured: nothing was written by this switch — no write.
    }
    var knobs = ControlRegistry.makeControlRegistry();
    knobs.registerControls('dse-tunnel-rebuild', [
      { kind: 'scalar', id: 'godrays', label: 'god rays', channel: 'render', widget: 'toggle',
        min: 0, max: 1, step: 1, value: RAYS_DEFAULT,
        fmt: function (v) { return v ? 'on' : 'off'; },
        onChange: setRays,
        place: { x: 0.02, y: 0.04 } }
    ]);
    setRays(RAYS_DEFAULT);
    // Chrome (a page only): expose the knob to a host frame, and mount the overlay through the
    // runner's ONE door (runner.controlHost) — before a canvas is mounted (a notebook pane) there is
    // none, so the knob stays in the exposed registry only.
    FrqtlControlsPanel.exposeRegistry(knobs, { runner: exp.runner });
    if (exp.runner.controlHost) { FrqtlControlOverlay.mount(exp.runner, { registry: knobs, name: 'dse-tunnel-rebuild' }); }
    // THE 3D INSTRUMENT IS THE DETECTOR ITSELF (the GraphingDetectorWall above): the
    // hits are binned over the detector FACE (y,z) and painted where they landed, so the
    // interference structure reads as BANDS on the plate, in the place the physics put
    // them. No free-floating chart panel.
    // MOVE/LOOK camera joysticks — the OMNI_3D pattern (FAIL-SOFT no-op in 2D).
    if (typeof document !== 'undefined' && exp.runner) {
      if (exp.runner.controlHost) { CameraControls.attach(exp.runner, exp.runner.controlHost); }
    }
  }
}
