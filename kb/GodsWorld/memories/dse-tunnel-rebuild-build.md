# Memory: Double slit — build

load: GYM scene id `dse-tunnel-rebuild` (mode `2d`, also `3d`; the GYM tile opens in `3d`) · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/dse-tunnel-rebuild.js
source sha256 a45665ce52423b23fbe763feaec514acc3ddf429899a931faea1c620fdfc5d91 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/dse-tunnel-rebuild.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: THE double slit, one dual-mode file: the booted renderer decides 2D (createCanvas) or 3D (createScene) and IS3D guards every z delta. The geometry hangs off wl (64 px: slit height and gap 51, the wall 64 thick at x 96) and the beam's transverse λ hangs off lamPx (128) separately, so retuning the beam never moves the aperture. The leg D (155 px) is derived from the ring ladder so ring m = 2 of both slits meets on the axis. A third slit: a third Tunnel with its own aperture, re-deriving halfSep. A wider slit: sh = wl. A longer leg: legFrac-style change of D. Switch the slits to mode 'mirror' and expect two beams, not a pattern. The 2D clip (memories/dse-tunnel-rebuild/clip.mp4) showed the spray at (20,200) hitting the barrier, dots through both slots and past the green screen with no banding by 1502 ticks; the GYM tile still (tile.png, tick 7200, 3D) shows the plate glowing along a central band.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Double Slit (Tunnel, symmetric)
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-tunnel-rebuild).
 */

// The double slit built on the TUNNEL OBJECT at physical DSE proportions. The two
// slit channels are Tunnels — TWO parallel MIRROR walls (guarded bounce, zero leak) — so
// the slit reflects the beam; the barriers + screen are v2 Walls (destroy / detector-screen
// preset) so the scene round-trips through codegen on Restart. GEOMETRY: SYMMETRIC —
// emitter->front of the slit wall equals back of the slit wall->detector. The near-field
// result is a balanced, central-dominant three-lobe double-slit interference pattern (a
// stochastic near-field walk; the ray-optics λL/d Fraunhofer regime needs L >> d²/λ ≈ 580px,
// larger than a 600px canvas allows).
//
// ONE MODE-AWARE SOURCE (S3/W2, CEO-ratified 2026-07-26; CEO Q21 2026-10-12). The mode strip
// selects the RENDERER the host boots (renderState.renderer), and this scene reads it ONCE,
// before its world: `three` ⇒ exp.createScene (a 3D world), else exp.createCanvas (2D). `IS3D`
// then guards the dimensional deltas — there is NO second (`-3d`) source file:
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

function buildExperiment(exp) {
  // Double Slit (Tunnel) — the two slit channels are MIRROR TUNNELS (guarded
  // bounce, zero-leak); the detector sits at the SYMMETRIC distance (emitter->front ==
  // back->detector). X placements are wl-derived (canvas-width-independent); Y is
  // centered on H (groupCenterY = H/2).
  // The booted display (the host's renderState.renderer) decides which world this mode makes.
  // memo: Read the booted display ONCE: 'three' means the 3D world below; anything else the 2D canvas. The mode strip in the GYM sets this; the file never has two sources.
  var IS3D = (typeof window !== 'undefined' && window.FrqtlDisplay && window.FrqtlDisplay.name() === 'three');
  // memo: Width, height, and the depth used only in 3D.
  var CW = 600, H = 400, WORLD_D = 600;   // THE WORLD this scene states (its co-init call below)
  // GEOMETRY and WAVELENGTH are two INDEPENDENT dials, and they are kept apart on
  // purpose: `wl` sizes the PLATE (slit height, gap, wall placement) and nothing else,
  // while `lamPx` is the transverse wavelength in pixels. Doubling lambda must NOT move
  // the slit wall — if one variable drove both, the aperture would silently walk every
  // time the beam was re-tuned and no two runs would be comparable.
  // memo: wl = the PLATE's unit (64 px): slit height sh = 51, gap between slits = 51. This dial sizes the barrier and nothing else.
  var wl = 64, sh = Math.floor(wl * 0.8), gap = Math.floor(wl * 0.8);   // 51, 51
  // memo: The beam's TRANSVERSE wavelength in pixels. Independent of wl on purpose: doubling it must not move the slit wall. [src]
  var lamPx = 128;                          // the TRANSVERSE wavelength, in pixels
  // memo: The two slits plus the gap: 153 px tall.
  var groupH = sh + gap + sh;               // 153
  // memo: The group is centred on mid-height: 200.
  var gcY = H / 2;                          // 300 @ H=600
  // memo: Slit 1's top: 123.5.
  var s1Top = gcY - groupH / 2;             // 223.5
  // memo: The gap's top: 174.5.
  var gapTop = s1Top + sh;                  // 274.5
  // memo: Slit 2's bottom: 276.5.
  var s2Bot = gcY + groupH / 2;             // 376.5
  // memo: Slit 2's top: 225.5.
  var s2Top = s2Bot - sh;                   // 325.5
  // memo: The source x: 20 px in from the left edge.
  var srcX = 20;                            // source x (left, near the slit wall)
  // memo: The slit wall's left face at 96 (1.5 wl from the edge) and its thickness 64: the wall spans x 96..160.
  var L = wl * 1.5, W = wl;                 // slit-group left 96, width 64 (wall front..back = [96,160])
  // THE DETECTOR LEG, DERIVED FROM THE RING LADDER (zero free parameters).
  // A phase-locked POINT source lays down density rings at r_m = (lambda/4)*sqrt((2m+1)^2+1)
  // measured from the emission point (guide row r3-radius-stall-shells;
  // docs/internal/records/2026-07-30-dse-ring-campaign.md). Each slit exit below
  // IS such a source, so the plate should be placed where
  // a NAMED ring crosses it rather than at a symmetric figure. Put the MIDLINE on ring m=2
  // of BOTH slits: with the exits at +/-halfSep from the midline, that needs a leg of
  //     D = sqrt(r_2^2 - halfSep^2) = sqrt(163.2^2 - 51^2) = 155
  // so the two ring-2 circles intersect exactly on the axis and the centre is DOUBLY
  // reinforced. Rings inside D (m=0 at 45.3, m=1 at 101.2) never reach the plate and
  // contribute no band — a measured property of the ladder, not an assumption.
  // This REPLACES the old symmetric-leg figure, whose own comment made it conditional on
  // the slits becoming directed emitters; the exit gates below are that condition.
  // memo: The ring ladder: a phase-locked point source lays density rings at these radii (m = 0: 45, m = 1: 101, m = 2: 163 px at λ 128).
  var ringR = function (m) { return (lamPx / 4) * Math.sqrt((2 * m + 1) * (2 * m + 1) + 1); };
  // memo: The two bore midlines: y 149 and 251.
  var slitCY1 = s1Top + sh / 2, slitCY2 = s2Top + sh / 2;   // 249, 351 — the bore midlines
  // memo: Half the slit separation: 51 px.
  var halfSep = gcY - slitCY1;              // 51
  // memo: The detector plate is 20 px thick.
  var detW = 20;                            // the detector plate's own thickness
  // memo: The leg: 155 px, so that ring 2 of BOTH slits crosses the axis at the plate (doubly reinforced centre). Zero free parameters.
  var D = Math.round(Math.sqrt(ringR(2) * ringR(2) - halfSep * halfSep));   // 155
  // memo: The plate's front face at x 315: the wall's back face (160) plus the leg.
  var detX = (L + W) + D;                   // 315
  // memo: Channel liners 10 px, clear bore 31 px.
  var linerH = Math.min(10, Math.floor(sh * 0.2)), bore = sh - 2 * linerH;   // 10, 31
  // THE 3D DELTA, in ONE place: the plate z-band. Every barrier / tunnel liner / detector
  // carries the SAME z-slab, so the slit wall is a genuine SLOT IN A PLATE standing in
  // space (the slits are slots long in z — the 2D figure extruded). In 2D the bag is
  // EMPTY, so every Object.assign below is byte-identical to the flat scene.
  // memo: 3D only: the plate z band is ±77 px about the beam plane (half the slit group's height).
  var zHalf = Math.round(groupH / 2);                                   // 77 @ wl 64
  // memo: The ONE 3D delta: every wall, tunnel and detector gets this same z-slab in 3D; in 2D the bag is empty and every Object.assign below is the flat scene byte for byte.
  var Z3 = IS3D ? { z: -zHalf, depth: 2 * zHalf } : {};
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
  // memo: fullness 1/3.2 = 0.3125 → yellow (the colour dial). [src]
  var lamArg = 3.2;                         // fullness 1/3.2 = 0.3125 -> yellow
  // memo: 160 → wavelengthScale 40 → λ = 3.2 × 40 = 128 px = lamPx (the geometry dial), independent of the plate's 64. [src]
  var fwl    = 4 * (lamPx / lamArg);        // 160 -> wavelengthScale 40 -> lambda_px = 128
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
  var SRC = {
    // memo: Forward half only (+x, toward the wall), from (20,200); in 3D a half-BALL of directions.
    preset: 'hemisphere', is2D: !IS3D, center: [srcX, Math.round(gcY)],
    // memo: ± charges, the colour dial, 8 a tick.
    chargeMode: 'random', wavelength: lamArg, burstSize: 8, emitEveryTicks: 1,
    // memo: Layer 2 (4 × 4, capacity 16 [HUMAN_GUIDE §Universe, Dimension, Frame, Quantum] [VISUAL_CODING_GUIDE: capacity = w·h]) and the λ dial.
    fundamentalDimension: 2, fundamentalWaveLength: fwl
  };
  // THE WORLD — first, then parts: a 3D scene + universe (600x400x600) or a 2D canvas + universe.
  // memo: THE WORLD, 3D: 600 x 400 x 600 …
  if (IS3D) { exp.createScene(CW, H, WORLD_D, setupSphereEmitter3D.worldCfg(SRC)); }
  // memo: … or 2D: 600 x 400. One of the two, first, then parts.
  else      { exp.createCanvas(CW, H, setupSphereEmitter3D.worldCfg(SRC)); }
  // memo: The source.
  exp.addObject('SphereEmitter', SRC);
  // Start wall — a plain sink (collisionBehavior:'destroy', [set is_alive=0]) at the
  // left edge, catching back-scatter. It is TRANSPARENT (alpha 40 of 255): the default
  // camera stands BEHIND the emitter, so an opaque slab here would be the first thing in
  // frame and would hide the whole experiment. alpha is a DECLARED Wall field, so codegen
  // captures it and Restart rebuilds the wall just as sheer. Physics is untouched — the
  // sink still destroys every back-scattered quantum (render-only, SU1).
  // memo: start_wall [0, 0, 10, 400]: a near-transparent sink at the left edge catching back-scatter (alpha 40 so the camera behind the emitter sees through it).
  exp.addObject('Wall', Object.assign({ rect: [0, 0, 10, H] }, Z3, { collisionBehavior: 'destroy', name: 'start_wall', color: [120, 120, 120], alpha: 40 }));
  // Barrier segments — opaque plain sinks (destroy) leaving the two slit gaps.
  // memo: wall1 [96, 0, 64, 122]: the barrier above slit 1.
  exp.addObject('Wall', Object.assign({ rect: [L, 0, W, s1Top - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall1', color: [200, 60, 60] }));
  // memo: wall2 [96, 174, 64, 50]: the barrier between the slits (darker red).
  exp.addObject('Wall', Object.assign({ rect: [L, gapTop, W, gap - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall2', color: [150, 40, 40] }));
  // memo: wall3 [96, 276, 64, 123]: the barrier below slit 2. Drag it up 50 px and it covers slit 2.
  exp.addObject('Wall', Object.assign({ rect: [L, s2Bot, W, (H - s2Bot) - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall3', color: [200, 60, 60] }));
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
  // THE TUNNEL IS A CONFIGURED EMITTER (CEO 2026-07-30). The exit gate's flags are not
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
  // second preset list) is a contract design flagged for architect + CEO ratification;
  // this rung uses the existing flags and documents the mapping.
  // memo: slit1_channel: a Tunnel through the wall at y ≈133..164, bore 31. mode 'directed' re-emits a wall hit randomly within 180° of +x (the slit as a semicircular emitter); collapse + recenter + phaseReset make its exit a phase-locked POINT source.
  exp.addObject('Tunnel', Object.assign({ left: L, top: s1Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x' }, Z3, { mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, name: 'slit1_channel', color: [80, 140, 220] }));
  // memo: slit2_channel: the same at y ≈235..266.
  exp.addObject('Tunnel', Object.assign({ left: L, top: s2Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x' }, Z3, { mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, name: 'slit2_channel', color: [80, 140, 220] }));
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
  // memo: far_sink [590, 0, 10, 400]: the boundary where quanta that pass the counting screen die.
  exp.addObject('Wall', Object.assign({ rect: [CW - 10, 0, 10, H] }, Z3, { collisionBehavior: 'destroy', name: 'far_sink', color: [120, 120, 120], alpha: 40 }));
  // memo: screen [315, 0, 20, 400]: counts WITHOUT absorbing (transparent-probe). In 2D a plain counting Wall; in 3D a GraphingDetectorWall that paints its own hit map on its faces in 12 px bins: the bands appear on the plate itself.
  exp.addObject(IS3D ? 'GraphingDetectorWall' : 'Wall', Object.assign({ rect: [detX, 0, detW, H] }, Z3, { preset: 'transparent-probe', name: 'screen', color: [120, 200, 120] }, IS3D ? { alpha: 220, binPx: 12 } : {}));
  if (IS3D) {
    // SCENE Z-COLLIMATORS — two INVISIBLE full-canvas destroy boundaries flush OUTSIDE
    // the plate z-band (the cl1a-mirror-3d pattern): the emitted ball's z-tail diffuses,
    // and any quantum beyond the plate band would sail BESIDE the barrier and read as
    // pass-through. Clamping the scene to the plate band makes the barrier provably face
    // EVERY alive quantum. 40px deep: un-jumpable (max z step is +/-2/tick).
    // memo: 3D only: an invisible destroy slab just outside the plate band (z 77..117) so nothing sails beside the barrier.
    exp.addObject('Wall', { rect: [0, 0, CW, H], z: zHalf, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipFar', visible: false });
    // memo: Its twin on the near side (z −117..−77).
    exp.addObject('Wall', { rect: [0, 0, CW, H], z: -zHalf - 40, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipNear', visible: false });
    // THE SWITCH (CEO 2026-10-13): god-rays computed from the light particles only (godraySource
    // 'leaf'), at the sun's settings — the ONE owner of those numbers is lib/shim/render/sun-look.js
    // (window.SunLook); this file types none of them. Default OFF (the first-contact picture is
    // unchanged). OFF restores EXACTLY what was live before the last ON (a host row, a STUDIO
    // slider), through the same declared door; a value the renderer does not declare THROWS there.
    // The knob shows its last written value (a render write has no read-back). The picture changes
    // at the next drawn tick, so in a paused (Design) view it shows once the scene runs.
    // memo: 3D, page-only: a 'god rays' toggle that writes the sun's god-ray render rows (owned elsewhere) and restores the prior values when switched off. Render only.
    if (window.ControlRegistry && window.FrqtlControlsPanel && window.SunLook) {
      var RAYS_ON = Object.assign({}, window.SunLook.SUN_GODRAYS, { godraySource: 'leaf' });
      var raysPrior = null;   // the three live values captured at ON; written back at OFF
      var knobs = window.ControlRegistry.makeControlRegistry();
      knobs.registerControls('dse-tunnel-rebuild', [
        { kind: 'scalar', id: 'godrays', label: 'god rays', channel: 'render', widget: 'toggle',
          min: 0, max: 1, step: 1, value: 0,
          fmt: function (v) { return v ? 'on' : 'off'; },
          onChange: function (v) {
            if (v) {
              raysPrior = {};
              Object.keys(RAYS_ON).forEach(function (k) { raysPrior[k] = exp.runner.getRenderOption(k); });
              exp.runner.setRenderOptions(RAYS_ON);
            } else if (raysPrior) {
              exp.runner.setRenderOptions(raysPrior);
              raysPrior = null;
            }
            // OFF with nothing captured: the control is at its initial OFF and has written nothing — no write.
          },
          place: { x: 0.02, y: 0.04 } }
      ]);
      window.FrqtlControlsPanel.exposeRegistry(knobs, { runner: exp.runner });
      // The overlay mounts through the runner's ONE door (runner.controlHost); before a canvas is mounted
      // (a notebook pane) there is none, so the knob stays in the exposed registry only.
      if (typeof document !== 'undefined' && window.FrqtlControlOverlay) {
        if (exp.runner.controlHost) { window.FrqtlControlOverlay.mount(exp.runner, { registry: knobs, name: 'dse-tunnel-rebuild' }); }
      }
    }
    // THE 3D INSTRUMENT IS THE DETECTOR ITSELF (the GraphingDetectorWall above): the
    // hits are binned over the detector FACE (y,z) and painted where they landed, so the
    // interference structure reads as BANDS on the plate, in the place the physics put
    // them. No free-floating chart panel.
    // MOVE/LOOK camera joysticks — the OMNI_3D pattern (FAIL-SOFT no-op in 2D).
    // memo: 3D, page-only: the MOVE/LOOK pads.
    if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {
      if (exp.runner.controlHost) { window.CameraControls.attach(exp.runner, exp.runner.controlHost); }
    }
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
