# Memory: Two Emitters at the Canonical Leg — build

load: GYM scene id `dse-two-emitters` · 2D · source site/scenes/74cf1d4b/dse-two-emitters.js
source sha256 dbedc0bce5635c2522cce58fce46617fdcd0eca406a646c25fd2d8b2bf60dcb8 · every code line below is byte-identical to the scene source; lines beginning `// memo:` are added notes — strip them to diff against site/scenes/74cf1d4b/dse-two-emitters.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: dse-one-emitter with two source entries in parts (source1, source2): two sources λ/2 apart (y 120 and 280), the plate at the same leg D = λ/4. The claim: each source lays a band λ/4 above and below itself, so the two inner bands meet on the midline y 200: a central peak the one-emitter rung lacks, flanked by bands at y 40 and 360. Variants: sep = lamPx × 3/4 (drag the lower source to y 360) → predict the midline peak falling; lamPx 160 → everything halves. The clip (memories/dse-two-emitters/clip.mp4) showed two fans meeting at mid-height and the chart region filling denser than the one-emitter clip; no central peak was readable by eye and no chart line was drawn in that recording.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Two Emitters at the Canonical Leg
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-two-emitters).
 */

// ── H1 AT THE CANONICAL DETECTOR LEG ─────────────────────────────────────────
//
// The competence baseline: the most basic thing, done right, seen with eyes. One
// emitter, then two, with the plate PRE-COMPUTED at the leg the ring formula was
// written for and the count-by-y chart registered to that plate. No barrier, no
// slits, no tunnels — nothing between the source and the plate, so a band on the
// chart can have come from nothing but the walk.
//
// WHY THESE EXIST BESIDE `dse-tunnel-rebuild`. That rung places its plate at
// D = 155 px against λ_eff = 128 px — 4.84× the reference leg — which pushes the
// low orders inside the leg where they never reach the plate at all, so only high-m
// rings can land. These two rungs put the plate ON the reference leg instead.
//
// THE GEOMETRY, and it is not re-derived here. λ is the ONLY length; every other
// length below is a dimensionless constant × λ (the `published/dse/scene.js`
// discipline). The ring ladder quoted in CLAUDE.md,
//
//     r_m = (λ/4)·√((2m+1)² + 1)                       [slant, from the emission point]
//
// is the hypotenuse of a right triangle whose TRANSVERSE leg is ρ_m = (2m+1)·λ/4
// and whose AXIAL leg is λ/4 — the "+1" under the root IS the (λ/4)² axial term.
// Solve for the axial leg order by order and every order returns λ/4, so the leg is
// not fitted per-order: it is the one leg the formula was written for. At that leg
// the on-plate bands are ρ_m = (2m+1)·λ/4 from the source's own y, spacing λ/2.
//
// MEASURED, not assumed. `published/dse/h1/` ran exactly this apparatus (bare
// source, plate at D = λ/4 from the emitter, seed 1, detector 'hits') at λ = 160 /
// 320 / 640 and found a symmetric feature on the plate at |Δy| = λ/4 − 4 px — 36 /
// 76 / 156 px — holding that offset to the pixel across a 4× sweep while moving 120
// px in absolute terms. The raw histogram's shape is: a flat PLATEAU across the
// centre, a sharp MINIMUM just inside ±λ/4, and a PEAK riding immediately outside it
// at ±λ/4. At λ=640, counts by Δy/λ: −0.250 → 1107 | −0.225 → 306 | 0.000 → 1011 |
// +0.225 → 297 | +0.250 → 1125. At λ=320 the same shape, shallower. TWO points on
// the wall at ¼ λ_eff, with a plateau — not a hole — between them.
//
// AND THAT IS WHY λ IS 320 HERE. The dip-to-peak separation is 0.025λ: 16 px at
// λ=640, 8 px at λ=320, 4 px at λ=160 — which is why the λ=160 run reads as a broad
// hump with the feature only recoverable by a windowed search on a smoothed profile.
// Below ~λ=300 this stage cannot resolve the thing it exists to show. So this rung
// shows ONE well-resolved band pair per source rather than three mushy ones. The 4 px
// pedestal does NOT scale with λ (it is engine scale — a quantum steps ≤2 px/axis/
// tick) and no mechanism is offered for it here. The m ≥ 1 rungs of the ladder are
// NOT established: of the H1 runs' 8 predicted positions, 3 matched, and the m=1
// positions carried minima.
//
// THE LEG IS ONE NAMED CONSTANT (`legFrac`), and so is the plate's DETECTOR MODE —
// both so they can be moved deliberately from a one-line edit and the consequence
// re-derived, rather than being literals nobody chose.
//
// The beam is the `dse-tunnel-rebuild` beam and the H1 beam, unchanged: wavelength
// arg 3.2 → mass 5 / capacity 16 → fullness 0.3125, which LightColor renders yellow,
// and λ_eff = 3.2 × wavelengthScale. The leaves are emitted COLOURLESS; the colour
// is DERIVED from fullness, never forced.
//
// 2D ONLY, deliberately. There is no `modes` strip and no `exp.is3D` guard: these
// rungs declare one world each. A second dimensional variant would be a separate
// recipe declaration, not a mode.
// THE PAIR. `dse-one-emitter.js` is the SAME apparatus with ONE source entry. The two files differ ONLY in the
// title lines, this note, and their `source*` entries of `parts` (with the world call naming the first
// of them) — lib/frqtl/scenes/test/scene-files.test.mjs fails if anything else diverges, so the A/B the
// pair exists to make stays an A/B.

import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

  // memo: The world's size.
const CW = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
// ── THE ONLY LENGTH ─────────────────────────────────────────────────────
// lamPx is lambda_eff in pixels. 320 is chosen for RESOLUTION, not for how many
// orders fit: the feature this rung exists to show (the minimum just inside the
// band and the peak riding outside it) is 0.025*lambda wide, which is 8 px at
// lambda 320 and 3 px at lambda 128. A stage that cannot separate them shows a
// smooth hump and leaves you unable to say whether the physics or the sampling
// was at fault. One well-resolved pair beats three mushy ones.
  // memo: λ in PIXELS, the one geometry knob: every distance below is a fraction of it, so change it and the whole apparatus rescales. 320 px on a 600 px stage.
const lamPx  = 320;
  // memo: Far-edge sink 20 px thick.
const sinkW = Math.round(lamPx / 16);     // 20  — far-edge sink thickness

// ── THE DETECTOR LEG — ONE NAMED CONSTANT ───────────────────────────────
// D = legFrac * lambda, measured from the SOURCE (there is no barrier, so the
// emitter itself is the reference point of the ladder). legFrac = 1/4 is the
// leg the ring formula was written for; see the block comment above.
  // memo: The plate stands λ/4 from the source plane: the leg the ring formula r_m = (λ/4)·√((2m+1)²+1) was written for. 1/2 would move it to λ/2 [src] [DSE_WORKED_EXAMPLE §The detector leg].
const legFrac = 1 / 4;
  // memo: D = 80 px.
const D    = Math.round(lamPx * legFrac); // 80
  // memo: The source x = 20 px: a little launch room; the left canvas edge is the back sink.
const srcX = Math.round(lamPx / 16);      // 20 — launch room; the canvas edge is the back sink
  // memo: The plate's FRONT face at x 100 = source + leg.
const detX = srcX + D;                    // 100 — the plate's FRONT FACE
// PLATE THICKNESS IS AN OPTICAL CHOICE UNDER A FLUX DETECTOR, not trim. A flux
// probe counts every tick a quantum overlaps it, so it integrates the density
// ACROSS its thickness — and the ring crest is a CIRCLE about the source, not a
// plane. At the m=0 band the crest's slope is dy/dx = -D/y = -1, so a slab t px
// thick smears the band over ~t px of y. Against an 8 px feature a lambda/8 (40
// px) plate would guarantee mush. lambda/64 = 5 px keeps the smear sub-feature
// and is still unjumpable (a quantum steps at most 2 px/axis/tick). A 'hits'
// plate would not care — it counts at first contact, i.e. at the front face —
// which is exactly why the reference H1 runs could afford a lambda/8 slab.
  // memo: Plate thickness 5 px.
const detW = Math.round(lamPx / 64);      // 5   — plate thickness
// ── THE PLATE — A COUNTING WALL THAT DOES NOT ABSORB ────────────────────
// ONE NAMED CONSTANT, so the reading can be swapped in a single edit and the two
// instruments compared rather than argued about:
//   'transparent-probe' = collisionBehavior 'nothing' + mark/count. FLUX. The
//       quantum is counted on every tick it overlaps the plate and then flies on,
//       so the reading is the OCCUPANCY INTEGRAL at the plate plane — the density
//       at that plane. This is the shipped choice.
//   'detector-screen'   = destroy + count. HITS. Each quantum is counted once, at
//       arrival, and removed: a transit census, the headcount a photographic plate
//       would report. It is what the H1 reference runs used.
// NEITHER ABSORBS. 'absorb' stores the arriving mass and re-radiates it — that is
// the photoelectric experiment, and it saturates.
  // memo: The plate COUNTS WITHOUT ABSORBING: a census at a plane, not a first-arrival caustic. 'detector-screen' would stop everything at the plate.
const detectorPreset = 'transparent-probe';

  // memo: capacity ÷ mass on layer 2 (capacity 16): mass 5, fullness 1/3.2 = 0.3125 → the yellow band. This sets COLOUR; lamPx sets geometry; they are kept independent (this source comment: arg 3.2 → mass 5 / capacity 16 → fullness 0.3125 [src]).
const lamArg = 3.2;                       // capacity/mass -> fullness 1/3.2 = 0.3125 (yellow)
  // memo: fundamentalWaveLength 400 → wavelengthScale floor(400/4) = 100, so λ = lamArg × 100 = 320 px = lamPx. The arithmetic that ties the two knobs together [src].
const fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100
  // memo: 100.
const wlScale = Math.floor(fwl / 4);      // 100
  // memo: y 200, the source plane's midline.
const cy   = Math.round(H / 2);           // 200 — the source plane's midline
// TWO-SOURCE SEPARATION. Two sources reinforce when their separation is a
// multiple of lambda/2, and the coupling falls as (lambda/d)^2, so lambda/2 is
// the strongest case. At this leg it also puts a band of EACH source on the
// midline y = H/2 (source 1's lower band and source 2's upper band coincide
// there) — the doubly-reinforced central peak, equidistant from both emitters,
// exactly where the one-source rung has no peak at all.
  // memo: Source separation 160 px = λ/2: source1 and source2 below sit at y 120 and 280.
const sep  = lamPx / 2;                   // 160 -> sources at y 120 and 280
// ── THE LIGHT SOURCE ────────────────────────────────────────────────────
// preset 'hemisphere' = 180 degrees of FORWARD (+X) emission: the SAME
// ball-rejected sampler as the omni source with the forward axis' range halved,
// so nothing about the walk changes, it is simply pointed at the plate. The
// default emission box is 0 for this preset, so the source is a single PIXEL —
// load-bearing, because any spread at birth blurs every band by that spread.
// NO START WALL: the backward population is empty by construction, and `wrap` is
// false, so the canvas edge kills whatever transverse wiggle out-runs its
// forward component. One sink, not two.
const SRC = {
    // memo: Forward half only (+x), flat, ± charges.
  preset: 'hemisphere', is2D: true, chargeMode: 'random',
    // memo: The colour and λ knobs from above.
  wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,
    // memo: 8 a tick per source.
  burstSize: 8, emitEveryTicks: 1
};

export const parts = {
  // memo: source1 and source2: two emitters, both SRC, at (20, 120) and (20, 280), sep apart and straddling the midline. dse-one-emitter declares one source at (20, 200) here instead; the pair differs only there, in the title lines, the pair note and the world call naming the first source.
  source1: [SphereEmitter, { ...SRC, center: [srcX, Math.round(cy - sep / 2)] }],
  source2: [SphereEmitter, { ...SRC, center: [srcX, Math.round(cy + sep / 2)] }],
  // FAR-EDGE SINK. The plate below counts WITHOUT removing, so quanta fly on past
  // it; this is the experiment-boundary sink downstream of the plate. It is not
  // load-bearing (wrap is false, so the canvas edge would remove them anyway) — it
  // is where the population bound is STATED rather than inferred.
  // memo: far_sink [580, 0, 20, 400]: the experiment boundary; quanta that pass the probe die here so the population stays bounded. Near-transparent (alpha 40).
  far_sink: [Wall, { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',
    color: [120, 120, 120], alpha: 40 }],
  // markTag — the plate's PROVENANCE stamp. The mark hook fires ONLY when the
  // collision trigger does (genuine overlap), whereas the engine buffers every
  // frame inside the LO's mb_w-PADDED search rect whether it triggered or not. So a
  // raw frame count off the buffer is a padded-occupancy reading and the
  // mark-filtered count is the trigger-gated census: two different instruments, and
  // an offline reader needs the tag to tell them apart.
  // memo: screen [100, 0, 5, 400]: full height, 5 px thick, at the leg. markTag 'plate' tags what crosses it.
  screen: [Wall, { rect: [detX, 0, detW, H],
    preset: detectorPreset, markTag: 'plate', color: [120, 200, 120] }],
};

export default function buildExperiment(exp) {
  // memo: FAIL-LOUD: the engine can only make λ = wavelength × floor(fwl/4); a lamPx that is not reachable refuses to build rather than silently drifting [src].
  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {
    throw new Error('[dse-h1] lamPx ' + lamPx + ' is not realisable as lambda_eff: the engine ' +
      'can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');
  }
  // memo: THE WORLD: 600 x 400, 2D.
  exp.createCanvas(CW, H, SphereEmitter.worldCfg(parts.source1[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  const p = exp.declare(parts);
  // ── THE INSTRUMENT — the live count-by-y histogram, REGISTERED TO THE PLATE ──
  // The panel takes the plate's OWN rect y-origin (0) and height (H), so the two
  // are co-extensive on the bin axis at any canvas size, and it starts just past
  // the plate's far face so it reads as sitting behind it. orientation 90 = bars
  // stacked along y; the chart contract reverses the y scale when horizontal, so
  // bin 0 (the SMALLEST y) sits at the TOP, matching the y-DOWN world.
  // HONEST LIMIT (inherited from the shipped 2D block, and it is real): the bin
  // axis is a CATEGORY axis over the bins that actually received hits, not a linear
  // 0..H axis. Registration is exact in ORDER and DIRECTION always, and exact in
  // absolute screen height only insofar as the hits span the wall. Here the plate
  // is a full-height flux probe under a 180-degree source, so the occupied span
  // fills the wall within a few hundred ticks and the axis is very nearly linear —
  // but the ladder positions below must be read off the raw census, never measured
  // with a ruler on the panel.
  // SERIES 'line', NOT 'bar', AND THAT IS A MEASUREMENT NOT A TASTE. The bins are
  // per-pixel y, so a full-height plate produces ~400 categories in a ~240 px plot:
  // each bar is sub-pixel TALL, its 0.55 fill alpha is diluted by the coverage, and
  // the profile collapses into a faint sliver hugging the axis. Measured identically
  // on the shipped 1C Counting Wall rung, so it is the chart contract's behaviour at
  // this bin count and not something these rungs introduced. A line joins the same 400
  // points into one continuous curve, which reads as the profile it is. CAVEAT, stated
  // because it bites: Chart.js does not begin a LINE value axis at zero, so once the
  // profile's floor rises the curve compresses toward the left edge. Read positions off
  // it, not magnitudes; magnitudes come from getCollisionHistogram().
  // memo: The count-by-y chart standing behind the wall, rotated 90 so y runs down its side.
  exp.addObject('LiveChart', {
    // memo: Reads the plate; orientation 90 = the histogram drawn vertically beside the wall.
    source: p.screen, orientation: 90,
    // memo: rect [113, 0, 479, 400]: from just behind the plate to the right edge, full height.
    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],
    // memo: A line, navy panel.
    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225
  });
}
```
