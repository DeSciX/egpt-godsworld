/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupSphereEmitter3D — a spherical "sun" emitter: uniform-DIRECTION emission
 * via ball-rejected integer velocity sampling (the model: speed is
 * ALWAYS 1px/tick (bench M1) — (vx,vy,vz) is
 * DIRECTION ONLY, never a speed knob; only the ratio vx:vy:vz matters,
 * (3,4,0)≡(6,8,0)). Models on `setupConeEmitter3D.js` (same live-knob,
 * host-tick-fn, thin-sugar pattern).
 *
 * ── THE LIFECYCLE CONTRACT (read this first) ─────────────────────────────────
 *
 *   world.init()  FIRST  →  CONSTRUCT parts  →  WIRE (render, ticks)  →  RUN
 *
 * **The world is init'd by the SKETCH. A part constructor never inits.** This
 * factory constructs a PART (an emitter = a host tick-fn that calls
 * `makeLeafFrame`+`injectFrame` N times per tick with ball-rejected directions),
 * so it takes an ALREADY-INIT'D universe and registers itself on it. Construction
 * order among parts is therefore irrelevant, and a second emitter sharing one
 * field is just a second call — no flag. (`skipInit` is DELETED and throws: it was
 * the packaging demanding a flag to TOLERATE the pattern being followed correctly,
 * and the root cause of the boot-order crash class.)
 *
 * The sketch step, when the sketch wants THIS emitter's implied world:
 *
 *   setupSphereEmitter3D.initWorld(universe, opts);   // 1. WORLD (once)
 *   setupSphereEmitter3D(universe, opts);             // 2. PART
 *   setupSphereEmitter3D(universe, opts2);            // 2. another PART, same field
 *
 * `setupSphereEmitter3D.worldCfg(opts)` is the SINGLE SOURCE of that world's physics, as DATA
 * (a world cfg bag) — the ONE authority for the lambda_eff chain. A sketch states the world
 * with it in its co-init call (`exp.createCanvas(w, h, worldCfg(opts))`, or `exp.createScene`
 * for 3D — the METHOD owns the axes and the size). `initWorld` is that bag through
 * `FrqtlWorldInit.initArgs`, the one cfg→init mapping, plus the axes the part's own `is2D`
 * declares, so both spellings build the same world. `FrqtlApp.setup(setupSphereEmitter3D, opts)` runs both steps in order.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * @param {Object} universe
 *   The engine universe instance (WASM compat shim), ALREADY INIT'D by the sketch.
 *   Obtained from `window.EGPTUniverse` via FrqtlApp.
 *
 * @param {Object} [options]
 * @param {number} [options.fundamentalWaveLength=64] - Same wavelengthScale
 *   derivation every other setup factory in this directory uses. A WORLD knob:
 *   it is read by `worldCfg`/`initWorld` (the sketch step), not by the part —
 *   an emitter constructed on a world the sketch init'd differently inherits
 *   THAT world's wavelengthScale.
 * @param {string} [options.stepping] - 'fixed' | 'average'. The wave-walk STEPPING
 *   SAMPLER, a WORLD knob like fundamentalWaveLength: read by `worldCfg`/`initWorld`
 *   and ferried VERBATIM into `universe.init()` (the one validator), never
 *   interpreted or defaulted here. Omitted ⇒ the ENGINE's default sampler.
 * @param {boolean} [options.is2D=false] - Fixed at construction (activeAxes.z
 *   is set at `universe.init()` time and cannot change without a full
 *   restart-in-place — see the experiment page's dimension toggle, which calls
 *   `runner.setup()` again with the opposite flag, the documented
 *   restart-in-place idiom). `is2D=true` ⇒ activeAxes {x:true,y:true,z:false},
 *   velocities sampled as (vx,vy) disk-rejected — the 2D analogue ("spherical"
 *   becomes a uniform DISK).
 * @param {number} [options.R=24] - THE virtual-parent-frame side / velocity
 *   RANGE each of vx,vy,vz is sampled from ([-R,R], integer) AND the
 *   blockiness/resolution knob: R also caps the rejection ball's radius
 *   (|v|<=R). Direction fidelity (angular uniformity, measured via CV) is
 *   ROBUST across R (engine-realized CV stays ~0.04-0.11 for R in [2,40] after
 *   ~10+ ticks of engine motion — see the canonical-bench S4/S5 entries and
 *   the bench README physics note) because the per-tick base-walk step
 *   probability is the RATIO |v_axis|/|v| (frame.rs `l2_walk_probs`), scale-
 *   invariant in R. What R actually controls is the NUMBER OF DISTINCT
 *   INTEGER-LATTICE DIRECTIONS available inside the ball (R=2 -> 26 rays,
 *   R=20 -> ~27800 rays, R=40 -> ~223000 rays) — a real "sun" wants R large
 *   enough that a SINGLE BURST (before engine-tick temporal averaging kicks
 *   in) doesn't itself read lumpy: a static (no-tick) per-burst octant CV is
 *   ~0.16 at R=9, ~0.09 at R=20, ~0.07 at R=24-25, flattening to ~0.05-0.06 by
 *   R=30-40 (host-RNG measurement) — R=24
 *   is the new DEFAULT, comfortably past the R=20 knee with headroom below the
 *   R=40 slider ceiling (so the R=9-ish "lumpy" end of the range stays
 *   explorable too).
 * @param {number} [options.emissionBoxSide=0] - Side (px) of the CUBE emission
 *   region leaves are placed within (uniform per-axis offset from center),
 *   CLAMPED to <= R (a box bigger than the direction-sampling range would be
 *   an incoherent "sun"). 0 (default) ⇒ true point source (a sun); values up
 *   to R ⇒ an extended "light bulb" glow volume. Independent knob from R (a
 *   point-source sun with wide angular spread, or an extended bulb with a
 *   narrow beam, are both valid).
 * @param {'ball'|'shell'} [options.mode='ball'] - 'ball': reject-to-|v|<=R,
 *   the DEFAULT — a filled sphere of directions. 'shell': reject to
 *   0.9R<|v|<=R — a THIN direction band (NOT a speed constraint; speed is
 *   always 1px/tick, M1). Its only effect is marginally BETTER angular
 *   uniformity at small sample counts (measured pure-math octant CV 0.066 vs
 *   ball's 0.082 at R=20,N=4000) because it drops the coarse near-origin
 *   lattice points; optional refinement, not the default.
 * @param {'spherical'|'hemisphere'|'laser'|'drum'|'particle-walk'} [options.preset='spherical'] - Sets the
 *   per-axis velocity RANGES the sampler draws from — the unification:
 *   sun/laser/drum are the SAME sampler with different ranges.
 *     'spherical' (DEFAULT, the sun): vx,vy,vz each in [-R,R] -> full ball ->
 *       uniform spherical direction distribution.
 *     'hemisphere' (FORWARD 180° emission — the directed sun): the SAME ball-
 *       rejected sampler with the FORWARD AXIS' range HALVED — vx in [0,R],
 *       vy,vz in [-R,R]. Conditioning a uniform ball on vx>=0 leaves a uniform
 *       HALF-ball, whose direction marginal is EXACTLY the restriction of
 *       'spherical''s to the forward hemisphere: same physics, pointed one way
 *       (measured over 2x10^6 MC samples, 2026-07-28). BALL
 *       REJECTION IS RETAINED and that is load-bearing — a raw box draw
 *       (vx in [0,R], vy in [-R,R], no magnitude clip) measures 1.83:1
 *       anisotropy with 1.45x peaks at +/-45deg, which is exactly the diagonal
 *       over-weighting the ball correction exists to remove (S4/S5). The
 *       forward axis is +X in BOTH 2D and 3D (like 'particle-walk', unlike
 *       'laser''s is2D branch), so the aim is the emitter's OWN
 *       `orientationDeg` yaw (`rotateVelocity2D`) — rotation is measure-
 *       preserving and applied AFTER sampling, so there is exactly ONE
 *       rotation path and no second aim knob. `is2D` forces vz=0, giving the
 *       uniform half-DISK (the 2D analogue), per bench S1 (2D === 3D minus an
 *       axis). Not a magnitude/speed knob: speed is always 1px/tick (M1) —
 *       only the direction ratio changes.
 *     'laser': collimated beam, forward axis chosen by `is2D` so this preset
 *       reproduces the historical `particle-walk`/`particle-walk-3d` recipe
 *       (a fixed rightward drift + emergent transverse wave-walk) through the
 *       SAME sampler, not a separate mechanism:
 *         - 3D (`is2D=false`): vx,vy narrowed to [-0.15R,0.15R], vz forward-
 *           biased to [0.6R,R] -> mostly +z (view with the 'down-barrel'
 *           camera preset to see it propagate on screen).
 *         - 2D (`is2D=true`): vx forward-biased to [0.6R,R] (the historical
 *           rightward convention), vy narrowed to [-0.15R,0.15R] (vz is
 *           already forced 0 by `is2D` regardless). At small R (2-3) the
 *           narrow band rounds to exactly 0, giving the OLD Particle Walk's
 *           deterministic vx-only drift with pure y-axis wave-walk
 *           oscillation — R alone selects "exact old recipe" vs "spread beam".
 *     'drum' (the old cylinder/disk emitter): vz PINNED to [0,0] -> vx,vy
 *       ball-rejected in the z=0 plane -> a 2D disk of directions, no forward
 *       component (this is the historical concentric-ring-emitter-vs-cone
 *       construction's "collimated cylinder" case generalized: here the
 *       DISK is of DIRECTIONS at the source, not ring positions).
 *     'particle-walk' (a
 *       FAITHFUL reproduction, not just the primitive, GROUND-TRUTHED against
 *       the actual `setupParticleWalk.js`/`setupParticleWalk3D.js` source):
 *       vx PINNED to `[R,R]` (deterministic +X drift, ALWAYS the forward
 *       axis regardless of `is2D` — unlike 'laser'), vy=vz PINNED to `[0,0]`.
 *       The waviness comes ENTIRELY from the transverse wave-walk (a
 *       SEPARATE mechanism from this base-walk velocity — CLAUDE.md
 *       Invariant 1) firing on y (2D) or y+z (3D), never from momentum
 *       divergence — this is the "golden CHARACTER" gap fix vs. 'laser' (a
 *       diverging cone), matching both historical experiments' exact
 *       `vx=1,vy=0` convention. ALSO auto-selects a matching SOURCE SHAPE
 *       (see `options.emissionBox`/`sourceShape` below): a flat vertical LINE
 *       in Y, height `10` — IDENTICAL in 2D and 3D (ground-truthed: BOTH
 *       historical files construct the SAME `[cx,cy,1,10]` sourceRect; there
 *       is no disk anywhere in the historical code — the 3D version's
 *       Z-spread is 100% EMERGENT from the wave-walk over ticks, not from an
 *       initial disk placement — a prior round of this preset wrongly
 *       defaulted 3D to a 'disk' shape; corrected here). Also
 *       ground-truthed: `burstSize` defaults to `20` and `emitEveryTicks` to
 *       `1` (both historical experiments fire `burst_size=20` EVERY tick,
 *       `delay=0`) — this reproduces the measured historical steady-state
 *       density (~5960 alive quanta on a 600x600 canvas, reached by
 *       tick~300 and held thereafter — little's-law: 20/tick x ~298-tick
 *       transit time). A true 'disk' shape and any other burst/rate/size
 *       stay available as explicit opt-ins (`options.sourceShape`,
 *       `options.burstSize`, `options.emitEveryTicks`, `options.
 *       emissionBoxSide`) — these are just no longer this preset's SILENT
 *       defaults.
 *   Any preset can be overridden per-axis after construction via
 *   `control.setAxisRange('vx', lo, hi)` etc. for custom directional shapes.
 * @param {{x:number,y:number,z:number}} [options.emissionBox] - OPT-IN per-axis
 *   emission-position box (extends the scalar `emissionBoxSide` cube into an
 *   independent size per axis). Omitted (default) ->
 *   `emissionBox` is DERIVED from `emissionBoxSide` + the current preset
 *   (uniform cube for spherical/laser/drum — BYTE-IDENTICAL to every
 *   pre-existing caller; the flat line shape above for 'particle-walk',
 *   IDENTICAL in 2D and 3D — ground-truthed, see the preset docs above).
 *   When explicitly provided, it is FIXED (frozen at construction, ignoring
 *   preset/emissionBoxSide changes) — any omitted axis defaults to `0`.
 * @param {'box'|'disk'} [options.sourceShape] - OPT-IN emission-position
 *   SHAPE for the (y,z) pair (x always independent, matching a beam's
 *   forward axis having no positional spread). Omitted (default) -> derived
 *   from preset — `'box'` for EVERY preset including 'particle-walk' (a line
 *   IS a degenerate box, y=size,z=0 — ground-truthed as the historical
 *   convention, both 2D and 3D). `'disk'` is available as an explicit
 *   opt-in (not any preset's silent default): circular-rejects (y,z) to a
 *   radius of `max(emissionBox.y,emissionBox.z)/2` (mirrors `sampleVelocity`'s
 *   own ball-rejection idiom, applied to POSITION instead of direction).
 * @param {number} [options.burstSize=40] - Leaves emitted per burst.
 * @param {number} [options.emitEveryTicks=6] - Ticks between bursts (sustained
 *   emission — a host tick-fn, NOT a native emit-spec; mirrors
 *   `setupConeEmitter3D.js` / Blackbody's thermostat).
 * @param {number} [options.fundamentalDimension] - REINIT-CLASS (like `is2D`
 *   — a WORLD knob, fixed at the sketch's `universe.init()` time via
 *   `worldCfg().dimension`, which reads it as 0 when undeclared; changing it needs
 *   a restart-in-place). The PART step, when neither this nor `leafDimension` is
 *   declared, takes the universe's live `fundamentalDimension`; when only
 *   `leafDimension` is declared it is 0. A positive value (e.g. `2`, matching `setupTunnelLab`/
 *   `setupLightSourceLab`'s own `FUNDAMENTAL_DIMENSION` — "MATCHED CONTROLS ->
 *   MATCHED PHYSICS") raises each emitted leaf's CAPACITY
 *   (`SustainedSource.capacityAtDimension(dim)` = `(2^dim)^2`) so `options.
 *   wavelength` below has room to produce a mass strictly less than capacity —
 *   this is the r0/r1 "unique rational wavelength" demo knob. NOTE: raising
 *   this also raises the leaf's rendered PIXEL FOOTPRINT (width=2^dim per
 *   axis) — an intentional, visible trade for the demo, not a bug.
 * @param {'volume'|'surface'} [options.emissionShell='volume'] - Emission
 *   START-POSITION topology. 'volume' (DEFAULT) seeds WITHIN the emissionBox
 *   area/cube — BYTE-IDENTICAL to every pre-existing caller (no extra draw when
 *   box=0). 'surface' = the old PointSource "ring launch": seed the start pixel ON
 *   a shell of radius `options.innerR`, AT THE ANGLE OF THE LEAF'S OWN VELOCITY —
 *   `start = center + round(innerR × unit(v))` — so the start pixel is COLLINEAR
 *   with the outward trajectory. This gives a single source an EMPTY CENTER and
 *   razor-sharp bands (every particle projects radially outward; none crosses the
 *   inner disk). The position is a DETERMINISTIC function of the already-sampled
 *   velocity — it draws NOTHING and does NOT decouple position from direction (an
 *   independent random start angle would let them diverge and blur the bands).
 *   Single-occupancy forbids many quanta starting on the same pixel, so the ring is
 *   the correct single-source topology. LIVE via `control.setEmissionShell`.
 * @param {number} [options.innerR=0] - Shell radius (px, non-negative integer) for
 *   `emissionShell:'surface'`. 0 collapses the shell to the center point. Ignored
 *   (no draw) in 'volume' mode. For the single-source-interference golden this is a
 *   small integer (~16, matching PointSource's diameter/2 ring radius) — large
 *   enough that a per-tick burst finds distinct start pixels around the ring.
 * @param {'positive'|'negative'|'random'} [options.chargeMode='positive'] -
 *   Per-emitted-leaf CHARGE. 'positive' (DEFAULT) stamps charge 0 on every leaf —
 *   BYTE-IDENTICAL to the pre-existing hardcoded value (no extra RNG draw, so
 *   every sun/laser/drum/particle-walk golden is untouched). 'negative' stamps
 *   charge 1. 'random' draws a per-leaf ± (`universe.random()<0.5?0:1`, the ONE
 *   opt-in extra draw) EXACTLY as PointSource/`emitterProgram.js` does — this is
 *   what makes opposite-charge leaves braid (charge shifts the transverse-spin
 *   quadrant), reproducing the Wave-Interference self-interference look from a
 *   single omni source. LIVE via `control.setChargeMode` (affects the NEXT leaf,
 *   M5). NOTE: charge cannot be delegated as `null` to makeLeafFrame — null
 *   coerces to 0 at the wasm-bindgen ABI, not a random-draw sentinel.
 * @param {number} [options.wavelength] - Per-leaf wavelength arg forwarded
 *   verbatim to `makeLeafFrame`'s 4th positional (mirrors `setupLightSourceLab`/
 *   `setupTunnelLab`'s identical `wavelength` field). Omitted (default) ->
 *   `null` -> engine default `mass=capacity` (fullness=1, shortest/violet
 *   oscillation) — BYTE-IDENTICAL to every pre-existing caller. A number ->
 *   `mass=max(1,capacity/wavelength)`, LIVE (affects the NEXT emitted leaf;
 *   already-emitted leaves keep whatever mass they were stamped with, M5).
 *   Clamped to `[1, MAX_USEFUL_WAVELENGTH]` (=capacity at the CURRENT
 *   `fundamentalDimension`) — beyond that ceiling `mass` saturates at 1 and
 *   the slider's upper half goes dead (`feedback_mass_ceiling_saturation_
 *   wavelength_param.md`). At `fundamentalDimension=0` (capacity=1) ANY
 *   wavelength>=1 forces mass=1 regardless — this knob is a documented NO-OP
 *   until `fundamentalDimension` is raised, exactly the SU1 opt-in-safety
 *   property that keeps the sun/laser/drum presets' default look untouched.
 *
 * @param {[number,number]|[number,number,number]} [options.center] - Emission
 *   SOURCE POSITION in ABSOLUTE canvas px — WHERE this emitter seeds its leaves
 *   (the center `cx0/cy0/cz0` that BOTH the volume box AND the surface ring
 *   launch are measured relative to). Wins over `options.offset` when both are
 *   present. z (3rd element) defaults to 0. Pure sugar: it
 *   ONLY moves the `makeLeafFrame` seed pixel — the velocity-aligned ring launch
 *   (`start = center + innerR×unit(v)`) stays relative to THIS center; zero
 *   engine, no golden moves (SU1). Needed for TWO-SOURCE interference (two
 *   emitters at ±separation/2 in x cannot both sit at the shared center).
 * @param {[number,number]|[number,number,number]} [options.offset] - Emission
 *   SOURCE POSITION RELATIVE to the canvas center (`[dx,dy(,dz)]` px). Used only
 *   when `options.center` is absent. z defaults to 0.
 *   Both OMITTED (default) ⇒ canvas center (`floor(w/2), floor(h/2), 0`) —
 *   BYTE-IDENTICAL to every pre-existing caller. LIVE via `control.setCenter`.
 *
 * @returns {{
 *   sphereEmitterControl: {
 *     setR(v), getR(), setEmissionBoxSide(v), getEmissionBoxSide(),
 *     setMode(v), getMode(), setPreset(v), getPreset(),
 *     setAxisRange(axis, lo, hi), getAxisRange(axis),
 *     setBurstSize(v), setEmitEveryTicks(v), setActive(bool),
 *     setCenter(x,y,z?), getCenter(),
 *     setWavelength(v), getWavelength(), getMaxWavelength(),
 *     getEmissionBox(), getSourceShape(), dispose(),
 *     controls: Array<{id,label,min,max,step,value,fmt,onChange}>
 *   },
 *   largeObjects: []
 * }}
 *   `sphereEmitterControl` is a live sugar handle (the canonical knob pattern
 *   — the blackbody oven's live `setTemperature`, `setupConeEmitter3D`'s
 *   `coneEmitterControl`). `sphereEmitterControl.controls` is the SAME
 *   standardized `runner.experimentControls`-compatible array — declared
 *   ONCE, consumed by both the page's own sliders and the IDE GYM strip.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero new physics (canonical-bench SU1). This composes THREE already-
 * goldened engine behaviors:
 *   - M1/M5: a free leaf's speed is fixed (fundamental leaf, always steps
 *     P=1 per axis when its per-axis base-walk probability fires) and its
 *     velocity is conserved absent collision — a straight-line drift once
 *     emitted.
 *   - `frame.rs::l2_walk_probs` (the S2/S3 cone-emitter's own load-bearing
 *     mechanism): the per-tick base-walk step on each axis fires with
 *     probability |v_axis|/|v| (L2-normalized RATIO) — this is EXACTLY the
 *     standard "sample uniform in a ball, normalize" recipe for generating
 *     uniform-direction unit vectors, realized natively by the engine's own
 *     stepping rule with ZERO extra engine code: an integer lattice point
 *     drawn uniformly inside a ball of radius R, handed to the engine as
 *     (vx,vy,vz), produces a leaf whose stochastic per-tick walk direction
 *     is (in expectation, and empirically after ~10+ ticks) uniform on the
 *     sphere — this IS the physics justification for why ball-rejection is
 *     mandatory (a raw cube sample, uncorrected, is diagonal-biased; bench's
 *     own Monte-Carlo pre-check + this file's S4/S5 canonical-bench entries
 *     confirm the ball correction, not a cube, gives isotropy).
 *   - S1: x, y, z axes run the IDENTICAL update rule — 2D (a disk of
 *     directions) is the same physics as 3D (a ball of directions) with one
 *     fewer axis; `is2D` simply narrows `activeAxes` at init and drops vz
 *     from the sampler.
 *
 * MEASURED engine-realized finding (canonical-bench S4/S5, pkg-node WASM, R=20 N=2000 T=30
 * seed=42, bit-reproducible across runs): angular uniformity (equal-solid-
 * angle octant CV + cos(polar) marginal-flatness CV) is NOT distorted toward
 * axes or diagonals by the ±1px/tick per-axis speed cap — S4 measures
 * octantCV=0.108, cosThetaFlatCV=0.046 (3D ball) and S5 measures
 * sectorCV=0.077 (2D disk), all comfortably isotropic. An independent
 * exploratory sweep (host-side RNG, not the bench's own `un.random()` stream
 * — different draw realization, same qualitative shape) found: a single-tick
 * snapshot (T=1) reads a misleadingly high CV (~0.8) because most leaves
 * haven't taken their first step yet (a sampling-resolution artifact, not a
 * physics bias) — by T=10 the CV has already collapsed to ~0.10, and by
 * T=30+ it is ~0.04-0.11 essentially FLAT across R=2..40, actually TIGHTER
 * than the pure-math ball-sample CV (~0.08 at the same R/N) because the
 * walk's per-tick Bernoulli draws add temporal averaging on top of the
 * initial spatial sample. This confirms R is a "how many distinct rays does
 * a single burst show" (visual/resolution) knob (R=2 -> only 26 distinct
 * integer-lattice directions; R=20 -> ~27800; R=40 -> ~223000), NOT an
 * isotropy-fidelity knob — isotropy is robust even at small R once the
 * emitter has run a few ticks.
 *
 * `fundamentalDimension`/`wavelength` compose Invariant #6's fork (CLAUDE.md
 * §6): a leaf constructed AT the universe's fundamental dimension (which is
 * exactly what happens here — `emitOneLeaf` passes `level=null`, deferring to
 * `universe.init`'s 2nd arg) is "light" and always steps P=1 regardless of its
 * mass (6A) — so raising capacity and setting a sub-capacity mass changes
 * ONLY the transverse oscillation period `wavelength=floor(capacity/mass *
 * WAVELENGTH_CONSTANT)` (6B), never the beam's forward speed. This decoupling
 * is a property of the ALREADY-GOLDENED move-gate rule, not new sugar logic —
 * composing it here (dial mass via the `wavelength` arg, read the resulting
 * oscillation) is exactly the r0/r1 "unique rational wavelength, unchanged
 * speed" demo the intuition guide names.
 *
 * Sustained emission is a HOST TICK-FN pushed to
 * `universe.experimentTickFunctions` (guardrail: no new engine
 * hook, no native emit-spec). Fast-path regime: no
 * `withInterQuantumCollisions`, no `brownianMotion`, no top-down frame-gen
 * auto-spawn ladder. No sink — leaves drift forever (M5) until they exit
 * `universe_rect` (population bounded by the universe edge, per
 * `reference_population_bounded_by_universe_edge_not_only_sink.md`).
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import * as SustainedSource from '../objects/sustainedSource.js';
import { FrqtlWorldInit } from './_worldInit.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────────
    // SustainedSource.capacityAtDimension is the ONE authority for "capacity of
    // a leaf at fundamental dimension N" (setupTunnelLab.js / setupLightSourceLab.js's
    // own MAX_USEFUL_WAVELENGTH derivation — reused here, not re-derived by hand).

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    /**
     * worldCfg — the WORLD this emitter's options imply, as DATA.
     *
     * The one authority for the lambda_eff chain; the sketch decides whether and when to
     * apply it. Returns a world cfg bag (the `cfg` of the co-init call) —
     * NO axes: a sketch's co-init METHOD owns those; `FrqtlWorldInit.initArgs` (objects/setup/_worldInit.js)
     * is the ONE mapping of that bag to the raw `universe.init(fundamentalDimension, options)` call, and
     * `initWorld` below applies it.
     *
     * ── THE lambda_eff CHAIN (the one place it is derived; cite THIS, not a constant) ──
     *   fundamentalWaveLength  (author-facing knob, default 64)
     *     -> wavelengthScale = max(1, floor(fWL / 4))            [this function]
     *     -> universe.init({ wavelengthScale: <that> })   [FrqtlWorldInit.initArgs]
     *          — the universe STORES that as its `wavelengthScale`
     *     -> lambda_eff = (capacity / mass) * wavelengthScale
     *                   = 16 * floor(fWL / 4)     [fundamentalDimension 2, mass 1]
     *                   = 4 * fundamentalWaveLength
     * Three names for three layers of one quantity — author knob, universe field,
     * emergent wavelength — so a reader who sees only one of them can find the others.
     * Confirmed by measurement at both sweep points: fWL 64 -> 256, fWL 32 -> 128
     * (the intuition record r3-radius-stall-shells).
     *
     * ── `stepping` — a WORLD field, PASSED THROUGH ───────────────────────────────
     * The wave-walk STEPPING SAMPLER ('fixed' | 'average') is a per-universe init
     * option, reinit-class exactly like `is2D`/`fundamentalDimension`, so it belongs
     * to the world step rather than to the part. This factory NEITHER validates NOR
     * defaults it: the value is ferried VERBATIM to `universe.init()`, which is the
     * one validator (it throws naming both legal samplers), and the ENGINE's serde
     * default (`Fixed`) is the one default. The key is therefore attached to the
     * returned bag ONLY when the caller declared it — omission keeps every existing
     * caller's cfg bag (and so its `universe.init` options) byte-identical. Stepping is a
     * property of the wave-walk branch (brownianMotion false, frameGenMode 'groundUp').
     *
     * @param {Object} [options] — the SAME options bag `setupSphereEmitter3D` takes.
     * @param {string} [options.stepping] — 'fixed' | 'average'; omitted ⇒ engine default.
     * The AXES are not in the bag: a scene's co-init call owns them (exp.createCanvas ⇒ 2D,
     * exp.createScene ⇒ 3D); `initWorld` (the factory/page path) derives them from `is2D`.
     *
     * @returns {{dimension:number, wavelengthScale:number, stepping?:string}}
     */
    function worldCfg(options) {
        // worldCfg/initWorld are EXPORTED entry points, so a typo in the sketch step
        // (`initWorld(u, {fundamentalWavelength: 64})`) must fail here rather than run
        // silently. They gate on SKETCH_OPTIONS, not OPTIONS: the sketch bag is SHARED
        // with the part step and legitimately carries the facade's own keys (see above).
        options = _assertSetupOptions('setupSphereEmitter3D.worldCfg', options, SKETCH_OPTIONS);
        var desiredWaveLength = options.fundamentalWaveLength !== undefined
            ? options.fundamentalWaveLength : 64;
        var cfg = {
            dimension: options.fundamentalDimension !== undefined ? options.fundamentalDimension : 0,
            wavelengthScale: Math.max(1, Math.floor(desiredWaveLength / 4)),
        };
        // Omit-when-undeclared (the activeAxes/depth discipline one layer down): an
        // undeclared sampler must not even appear as a key, so the bag a pre-existing
        // sketch builds is unchanged, key-for-key.
        if (options.stepping !== undefined && options.stepping !== null) {
            cfg.stepping = options.stepping;
        }
        return cfg;
    }

    /**
     * The ONE cfg→universe.init mapping is `FrqtlWorldInit.initArgs`, owned by the leaf
     * `objects/setup/_worldInit.js` — never a local copy.
     */
    function _worldInitArgs() {
        return FrqtlWorldInit.initArgs;
    }

    /**
     * initWorld — THE SKETCH STEP. Init the world this emitter implies, on a RAW
     * universe, BEFORE constructing any part:
     *
     *   universe.init(...FrqtlWorldInit.initArgs(worldCfg(opts)))
     *
     * i.e. exactly the world a sketch's co-init call with `worldCfg(opts)` builds (2D:
     * createCanvas, 3D: createScene) — one factory, one world,
     * whichever surface the author used (conformance: one-world-per-factory.test.mjs).
     *
     * `universe.init()` is a universe-GLOBAL reset (it clears every frame and fixes the
     * base fundamental, wavelengthScale and activeAxes), which is exactly why it belongs
     * to the sketch and runs ONCE. `FrqtlApp.setup(setupSphereEmitter3D, opts)` runs it
     * before the part step (and `restart()` replays both); a second emitter on the same
     * field just skips this call — that is what deleted `skipInit`.
     *
     * @param {Object} universe — a constructed universe (init'd or not; this re-inits it).
     * @param {Object} [options] — the SAME options bag `setupSphereEmitter3D` takes.
     */
    function initWorld(universe, options) {
        var args = _worldInitArgs()(worldCfg(options));
        // The factory/page path has no co-init call to own the axes, so the part's own
        // `is2D` declares them here (the RAW universe.init options — not a world-cfg key).
        args[1].activeAxes = { x: true, y: true, z: !(options && options.is2D) };
        universe.init.apply(universe, args);
    }
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupSphereEmitter3D.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'R', 'burstSize', 'center', 'chargeMode',
        'emissionBox', 'emissionBoxSide', 'emissionShell', 'emitEveryTicks',
        'fundamentalDimension', 'fundamentalWaveLength', 'innerR', 'is2D',
        'leafDimension', 'mode', 'offset', 'orientationDeg',
        'preset', 'renderColor', 'renderShape', 'sourceShape',
        'stepping', 'wavelength',
    ];

    /**
     * SKETCH_OPTIONS — what `worldCfg`/`initWorld` tolerate, which is a SUPERSET of the
     * part's own vocabulary.
     *
     * The canonical sketch idiom shares ONE bag across both steps:
     *   exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC));   // WORLD (and its canvas)
     *   exp.addObject('SphereEmitter', SRC);                           // PART
     * (the mirror-route scene, 2D and 3D). So the bag reaching `worldCfg` legitimately
     * carries the keys the SphereEmitter FACADE owns and strips before forwarding
     * (`emissionCap`/`gateCounter`) — `worldCfg` projects out the four world knobs and
     * ignores the rest BY DESIGN. Gating it on OPTIONS alone would reject the recipe the
     * STUDIO first-contact rung is built from.
     *
     * `SphereEmitter.FACADE_OPTIONS` is the owner of that extra list, but the arrow runs
     * object → setup, so requiring it here would be a cycle. Instead
     * `setup-factory-option-vocabulary.test.mjs` §4 asserts this list equals
     * `OPTIONS ∪ SphereEmitter.FACADE_OPTIONS` — a drift is a CI failure, not a mirror
     * someone has to remember to update.
     */
    var SKETCH_OPTIONS = OPTIONS.concat(['emissionCap', 'gateCounter']);

    /**
     * PRESETS — the emission presets `applyPreset` knows, exported so the preset control
     * and every conformance test consume ONE list instead of retyping it.
     */
    var PRESETS = ['spherical', 'hemisphere', 'laser', 'drum', 'particle-walk'];

    /**
     * RETIRED_OPTIONS — names this factory claims with its OWN migration message.
     *
     * Exported because a gate now sits ABOVE this call: `ObjectFactory.create` validates
     * prop keys before the builder forwards them here, and a generic "unknown prop key
     * 'skipInit'" would REPLACE the sentence that tells the author what to do instead.
     * ObjectFactory consumes this list so a retired name reaches its owner; it is not
     * a licence to accept the key — the throw below is what happens next.
     */
    var RETIRED_OPTIONS = ['skipInit'];

    /** The world's live base layer, asked of its owner. A universe that cannot answer throws. */
    function _worldFundamentalDimension(universe) {
        var dim = universe.fundamentalDimension;
        if (typeof dim !== 'number' || !isFinite(dim) || dim < 0 || Math.floor(dim) !== dim) {
            throw new Error('setupSphereEmitter3D: the universe did not report its fundamental ' +
                'dimension (universe.fundamentalDimension = ' + String(dim) + '). An emitter that ' +
                'declares no fundamentalDimension/leafDimension mints at the world\'s own layer, read ' +
                'from EGPTUniverse.fundamentalDimension on an init\'d world.');
        }
        return dim;
    }

    function setupSphereEmitter3D(universe, options) {
        options = options || {};
        // ORDER IS LOAD-BEARING (the lesson `a1f1b324` control D pinned one layer down):
        // the RETIRED name is claimed FIRST, so it keeps its specific migration message.
        // Demoted to the generic unknown-key error it would lose the instruction that
        // makes the hand-migration possible. The same reason RETIRED_OPTIONS is EXPORTED:
        // ObjectFactory's prop-key gate sits ABOVE this call and would otherwise reject
        // `skipInit` first, so it lets the retired names through to this message.
        if (RETIRED_OPTIONS.indexOf('skipInit') !== -1 && 'skipInit' in options) {
            throw new Error(
                "setupSphereEmitter3D: 'skipInit' is DELETED. This factory constructs a PART and " +
                'never inits the world — the SKETCH does, once, before any part: ' +
                'setupSphereEmitter3D.initWorld(universe, opts). Remove skipInit; a second emitter ' +
                'on an already-init\'d universe needs no flag.'
            );
        }
        options = _assertSetupOptions('setupSphereEmitter3D', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupSphereEmitter3D universe.universe_rect', canvas_rect);

        var is2D = !!options.is2D;

        // `fundamentalDimension` = the universe's BASE (lowest) dimension the SKETCH
        // init'd the world at (`worldCfg().dimension`). Read here only to resolve
        // `leafDimension` and the capacity clamp — never to init. The WORLD owns this fact:
        // a caller that declares NEITHER dimension gets the universe's live fundamental, so a
        // part dropped into a dimension-2 world mints its leaves at layer 2. A caller that
        // declares either keeps its declaration exactly (an undeclared base beside a declared
        // `leafDimension` stays 0).
        var declaresDimension = options.fundamentalDimension !== undefined ||
            options.leafDimension !== undefined;
        var fundamentalDimension = options.fundamentalDimension !== undefined
            ? options.fundamentalDimension
            : (declaresDimension ? 0 : _worldFundamentalDimension(universe));

        // `leafDimension` = the dimension THIS emitter births its leaves at (per-emitter
        // — the corrected model: dimension is an ADDABLE scale layer, and
        // an emitter creates leaves AT a chosen dimension via makeLeafFrame's explicit
        // `level` + `addDimension` (the SAME pattern the blackbody scene uses: init at a base
        // fundamental, then addDimension for the higher scale layer). Default =
        // fundamentalDimension → BYTE-IDENTICAL to every pre-existing caller (birthing at
        // level=fundamentalDimension is identical to the old level=null, which defers to the
        // universe fundamental; and leafDimension==fundamentalDimension adds no dimension).
        // A leaf born ABOVE the base fundamental is move-gated (Invariant 6A: P=fullness →
        // heavier/slower at fixed mass) AND has larger capacity (→ longer wavelength → redder)
        // — that fullness-driven difference IS the intended per-dimension observable, NOT a
        // bug. Multiple emitters at DIFFERENT leafDimensions coexist on one universe (each its
        // own scale layer). Capacity clamp uses leafDimension (the leaves' ACTUAL capacity).
        var leafDimension = options.leafDimension !== undefined
            ? options.leafDimension : fundamentalDimension;
        var maxWavelength = SustainedSource.capacityAtDimension(leafDimension);

        // ── THE WORLD IS ALREADY INIT'D ─────────────────────────────────────────
        // This factory CONSTRUCTS A PART. It does not init the world — the SKETCH does,
        // BEFORE any part is constructed (world.init() FIRST → CONSTRUCT parts → WIRE →
        // RUN). `setupSphereEmitter3D.initWorld(universe, options)` is the sketch step
        // that derives this emitter's implied world from these same options; a sketch
        // that owns its own world simply never calls it. There is no flag: an author who
        // followed the pattern correctly does nothing extra, and a second emitter on a
        // shared field is just a second constructor call.
        // Declare this emitter's scale layer via addDimension (the Blackbody pattern —
        // per-emitter dimension goes THROUGH addDimension and the ENGINE derives the
        // fundamental). Under dynamic dimensions (merged 2026-07-19) the engine SELF-LOWERS
        // the fundamental to min(allocated) on add_dimension — so declaring a LOWER layer
        // (leafDimension < the init seed) self-lowers the fundamental to it, making those
        // leaves AT-fundamental (light/fast) and re-basing previously-lower-fullness leaves
        // to above-fundamental (slower). We therefore addDimension whenever leafDimension
        // differs from the init seed (idempotent; safe for shared/re-declared layers). Equal
        // to the seed adds nothing (the seed is already the fundamental at init) → BYTE-
        // IDENTICAL to every pre-existing caller (which never passes leafDimension). NEVER
        // re-set the fundamental manually — let add_dimension self-lower it.
        if (leafDimension !== fundamentalDimension) {
            universe.addDimension(leafDimension);
        }

        // ── Emission SOURCE POSITION (per-emitter) ───────────────────────────────
        // cx0/cy0/cz0 = the center this emitter seeds its leaves around (BOTH the
        // volume box AND the surface ring launch are relative to it). Resolved from
        // options.center (ABSOLUTE canvas px, wins) / options.offset (RELATIVE to
        // canvas center); both omitted ⇒ canvas center → BYTE-IDENTICAL to every
        // pre-existing caller (old cx0=floor(w/2), cy0=floor(h/2), cz0=0). Mutable
        // (function-scoped) so control.setCenter can reposition LIVE (M5 — affects
        // the NEXT emitted leaf). Pure sugar: only the makeLeafFrame seed pixel moves.
        var _defCx = Math.floor(canvas_rect.w / 2);
        var _defCy = Math.floor(canvas_rect.h / 2);
        var cx0, cy0, cz0;
        (function resolveCenter(center, offset) {
            if (Array.isArray(center)) {
                cx0 = Math.round(center[0]);
                cy0 = Math.round(center[1]);
                cz0 = (center.length > 2 && center[2] != null) ? Math.round(center[2]) : 0;
            } else if (Array.isArray(offset)) {
                cx0 = _defCx + Math.round(offset[0]);
                cy0 = _defCy + Math.round(offset[1]);
                cz0 = (offset.length > 2 && offset[2] != null) ? Math.round(offset[2]) : 0;
            } else {
                cx0 = _defCx; cy0 = _defCy; cz0 = 0;
            }
        })(options.center, options.offset);

        // ── Live-mutable emission state (canonical live-knob pattern: closure
        //    state read fresh on every emitted leaf — a slider drag changes
        //    the NEXT burst; already-emitted leaves keep drifting on whatever
        //    velocity they were stamped with, M5). ──────────────────────────
        var state = {
            R:              options.R              !== undefined ? options.R              : 24,
            emissionBoxSide: 0,
            mode:           options.mode            !== undefined ? options.mode            : 'ball',
            preset:         options.preset          !== undefined ? options.preset          : 'spherical',
            burstSize:      0, // derived below (preset-aware default) — placeholder here
            // Per-leaf wavelength (mass=capacity/wavelength) — null = engine
            // default mass=capacity, BYTE-IDENTICAL to every pre-existing
            // caller. Clamped to [1,maxWavelength] whenever a number is set
            // (feedback_mass_ceiling_saturation_wavelength_param.md).
            wavelength: (options.wavelength !== undefined && options.wavelength !== null)
                ? clamp(options.wavelength, 1, maxWavelength) : null,
            // Per-leaf CHARGE mode (drives the transverse oscillation quadrant —
            // opposite charges braid, which IS the self-interference structure).
            // 'positive' (DEFAULT) = charge 0, BYTE-IDENTICAL to the pre-existing
            // hardcoded 0 (no extra RNG draw, so every sun/laser/drum/particle-walk
            // golden is untouched); 'negative' = charge 1 (also no draw); 'random'
            // = per-leaf ±, exactly reproducing PointSource/emitterProgram.js's
            // `chargeInt = universe.random() < 0.5 ? 0 : 1` (the ONE opt-in extra
            // draw). Required to reproduce the Wave-Interference look from a single
            // omni source.
            chargeMode: (options.chargeMode === 'random' || options.chargeMode === 'negative'
                || options.chargeMode === 'positive') ? options.chargeMode : 'positive',
            // Emission START-POSITION topology (WHERE a leaf is seeded, independent
            // of its velocity direction). 'volume' (DEFAULT) = seed WITHIN the
            // emissionBox area/cube (the pre-existing behavior — BYTE-IDENTICAL);
            // 'surface' = seed ON THE SURFACE of a shell at radius `innerR` (a
            // CIRCLE in 2D / a SPHERE SHELL in 3D). Surface mode reproduces the old
            // PointSource "ring launch": single-occupancy forbids many quanta from
            // starting on the EXACT same pixel, so PointSource seeds them around a
            // ring — the correct single-source start topology.
            emissionShell: (options.emissionShell === 'surface') ? 'surface' : 'volume',
            // Shell radius (px) for emissionShell:'surface'. Non-negative integer;
            // 0 collapses the shell back to the center point (so 'surface' with
            // innerR 0 == 'volume' with box 0 — a single pixel). Ignored entirely
            // in 'volume' mode (no draw).
            innerR: (options.innerR !== undefined) ? Math.max(0, Math.round(options.innerR)) : 0,
            // Per-leaf RENDER COLOR OVERRIDE (render-intent DATA, NOT physics).
            // null (DEFAULT) → leaves are emitted COLORLESS (byte-identical to every pre-existing
            // caller) so the renderer's colorScheme derives color from fullness (LightColor). An
            // [r,g,b] / [r,g,b,a] array → FORCES that color: it is passed to makeLeafFrame's `color`
            // arg, which the compat layer stamps as `string_map['render.color']` = CSV 'r,g,b,a' on
            // the engine-OPAQUE frame-data bubble (owned by lib/shim/frame-data). The engine carries
            // it verbatim and interprets NOTHING; the renderer deserializes render.color (which takes
            // priority over colorScheme). So this forces the particle color INDEPENDENT of the
            // wavelength→LightColor mapping with ZERO engine field touched. LIVE via
            // control.setRenderColor (affects the NEXT emitted leaf, M5).
            renderColor: Array.isArray(options.renderColor) ? options.renderColor.slice() : null,
            // Per-leaf RENDER SHAPE OVERRIDE (render-intent DATA, NOT physics).
            // null (DEFAULT) → leaves emit with NO render.shape key (byte-identical to every
            // pre-existing caller); the renderer falls back to the render-level "Default Shape"
            // (setRenderOption) then 'ball'. A ball|box|circle|cube|sphere string is stamped as
            // string_map['render.shape'] via makeLeafFrame's render-intent MERGE seam (peer of
            // render.color) — the engine carries it opaque, the renderer deserializes (priority
            // render.shape > opts.shape > default). LIVE via control.setRenderShape (next leaf, M5).
            renderShape: (typeof options.renderShape === 'string' && options.renderShape) ? options.renderShape : null,
            // EMITTER ORIENTATION (B8 pulsar, Collision Lab WAVE 3) — degrees, default 0.
            // Unlike a WALL (whose cone is BAKED at the INITIAL orientation, immune to spin),
            // the emitter tracks its CURRENT orientation: sampleVelocity rotates each sampled
            // (vx,vy) about the z-axis by this angle, so LIVE-spinning a CONSTRAINED (laser)
            // emitter SWEEPS its beam (a pulsar). Omni ('spherical') is rotationally invariant,
            // so its output DISTRIBUTION is unchanged under rotation (isotropy). This is ALSO
            // the AIM knob for the 'hemisphere' preset: that preset's forward axis is +X by
            // construction, and this rotation — measure-preserving, applied AFTER sampling — is
            // the ONE path that points the 180° fan anywhere else. SU1: at 0 the
            // rotation is the identity (round(vx·1−vy·0)=vx), so every pre-existing golden is
            // BYTE-IDENTICAL and NO extra RNG draw is made. LIVE via control.setOrientation.
            orientationDeg: (typeof options.orientationDeg === 'number') ? options.orientationDeg : 0,
            active: true
        };
        // GROUND-TRUTHED against setupParticleWalk.js / setupParticleWalk3D.js
        // (read the actual source, not a
        // paraphrase): both historical experiments use IDENTICAL construction —
        // `sourceRect=[cx,cy,1,10]` (a height-10 vertical LINE, x-width=1, in
        // BOTH 2D and 3D — there is no disk anywhere in the historical code;
        // the earlier iteration's 3D 'disk' default was an unverified
        // elaboration, corrected here), `burst_size=20`, `delay=0` (fires
        // EVERY tick, continuously) — every other preset keeps its byte-
        // identical defaults (box=0 point source, burst=40, rate=6). Measured
        // steady-state density at these EXACT settings (pkg-node, 600x600
        // canvas, wrap=false so quanta die at the far wall): alive count
        // climbs 1000/2000/4000 at ticks 50/100/200 then PLATEAUS at exactly
        // 5960 by tick~300 (little's-law steady state: 20/tick x ~298-tick
        // transit time from x~302 to the x=599 wall) — this IS the
        // "~5960 alive, the fuller sheet/beam" density target, reproduced
        // here by matching the SAME three numbers, not by tuning against the
        // number directly.
        var PARTICLE_WALK_DEFAULT_SOURCE_SIZE = 10; // = old sourceRect height (ground-truthed)
        var PARTICLE_WALK_DEFAULT_BURST_SIZE   = 20; // = old burst_size (ground-truthed)
        var PARTICLE_WALK_DEFAULT_RATE         = 1;  // = old delay=0 -> fires every tick (ground-truthed)
        state.emissionBoxSide = clamp(
            options.emissionBoxSide !== undefined ? options.emissionBoxSide
                : (state.preset === 'particle-walk' ? PARTICLE_WALK_DEFAULT_SOURCE_SIZE : 0),
            0, state.R);
        state.burstSize = options.burstSize !== undefined ? options.burstSize
            : (state.preset === 'particle-walk' ? PARTICLE_WALK_DEFAULT_BURST_SIZE : 40);

        // ── Per-axis emission SOURCE SHAPE
        //    — the "drum emitter" shape: a flat line source, extending the
        //    scalar emissionBoxSide cube into an opt-in per-axis box).
        //    `explicitEmissionBox`/`explicitSourceShape` (options, FROZEN at
        //    construction) take priority over the preset-derived default —
        //    the common/default path (neither given) reduces EXACTLY to
        //    today's uniform cube for every pre-existing preset. ────────────
        var explicitEmissionBox = options.emissionBox || null;
        var explicitSourceShape = options.sourceShape !== undefined ? options.sourceShape : null;
        function clampBox(v) { return clamp(v, 0, state.R); }
        function deriveSourceShape() {
            if (explicitEmissionBox) {
                state.emissionBox = {
                    x: clampBox(explicitEmissionBox.x !== undefined ? explicitEmissionBox.x : 0),
                    y: clampBox(explicitEmissionBox.y !== undefined ? explicitEmissionBox.y : 0),
                    z: clampBox(explicitEmissionBox.z !== undefined ? explicitEmissionBox.z : 0)
                };
                state.sourceShape = explicitSourceShape || 'box';
                return;
            }
            if (state.preset === 'particle-walk') {
                // Flat vertical LINE in Y — x=z=0, IDENTICAL in 2D and 3D
                // (ground-truthed: setupParticleWalk3D.js uses the SAME
                // [cx,cy,1,10] sourceRect as the 2D version — the z-spread it
                // shows is 100% EMERGENT from the wave-walk over ticks, never
                // from an initial disk placement; is2D only toggles whether
                // z's wave-walk fires at all, via activeAxes). A true 'disk'
                // shape stays available as an explicit opt-in
                // (`options.sourceShape:'disk'`) for anyone who wants one —
                // it's just no longer this preset's SILENT default.
                state.emissionBox = { x: 0, y: clampBox(state.emissionBoxSide), z: 0 };
                state.sourceShape = explicitSourceShape || 'box';
            } else {
                // Byte-identical to every pre-existing preset: a uniform cube.
                var b = clampBox(state.emissionBoxSide);
                state.emissionBox = { x: b, y: b, z: b };
                state.sourceShape = explicitSourceShape || 'box';
            }
        }
        deriveSourceShape();

        var emitEveryTicks = options.emitEveryTicks !== undefined ? options.emitEveryTicks
            : (state.preset === 'particle-walk' ? PARTICLE_WALK_DEFAULT_RATE : 6);

        // Per-axis velocity RANGES — the unification: 'spherical'/'laser'/'drum'
        // are the SAME sampler over different ranges, derived from R + preset.
        // A custom range set via control.setAxisRange survives until the next
        // setR()/setPreset() call (which re-derives all three from scratch).
        var ranges = { vx: [0, 0], vy: [0, 0], vz: [0, 0] };
        function applyPreset(name, R) {
            if (name === 'laser') {
                var narrow = Math.max(1, Math.round(R * 0.15));
                var fwd = [Math.round(R * 0.6), R];
                if (is2D) {
                    // 2D: forward axis is +x (the historical particle-walk
                    // rightward convention) — is2D already forces vz=0
                    // unconditionally in sampleVelocity, so vz's range here is
                    // never sampled; set to [0,0] only for internal consistency.
                    ranges.vx = fwd;
                    ranges.vy = [-narrow, narrow];
                    ranges.vz = [0, 0];
                } else {
                    // 3D (unchanged): forward axis is +z (view with the
                    // 'down-barrel' camera preset).
                    ranges.vx = [-narrow, narrow];
                    ranges.vy = [-narrow, narrow];
                    ranges.vz = fwd;
                }
            } else if (name === 'hemisphere') {
                // FORWARD 180° emission (D1) — the ONE line that
                // differs from 'spherical': the forward axis' range is HALVED to
                // [0,R]. Everything else (the ball rejection below, the isotropy
                // correction) is shared, which is the whole point: a uniform ball
                // conditioned on vx>=0 IS a uniform half-ball, so this is the
                // spherical distribution restricted to the forward hemisphere, not
                // a different sampler. Forward axis is +X in 2D AND 3D; aim it with
                // `orientationDeg` (the existing, measure-preserving post-sample
                // rotation) — never a second rotation path.
                ranges.vx = [0, R];
                ranges.vy = [-R, R];
                ranges.vz = [-R, R];
            } else if (name === 'drum') {
                ranges.vx = [-R, R];
                ranges.vy = [-R, R];
                ranges.vz = [0, 0];
            } else if (name === 'particle-walk') {
                // Faithful reproduction: PURE-FORWARD
                // +X momentum, ALWAYS (not is2D-branched like 'laser' — both
                // historical experiments, 2D and 3D, used vx=1,vy=0 literally).
                // vy=vz PINNED to 0 — the waviness comes entirely from the
                // transverse wave-walk (a separate mechanism), never from
                // momentum divergence (the 'laser' preset's diverging-cone gap
                // this preset exists to close).
                ranges.vx = [R, R];
                ranges.vy = [0, 0];
                ranges.vz = [0, 0];
            } else { // 'spherical' (default sun)
                ranges.vx = [-R, R];
                ranges.vy = [-R, R];
                ranges.vz = [-R, R];
            }
        }
        applyPreset(state.preset, state.R);

        // Integer velocity sample from the current per-axis ranges + R (frame.rs's
        // l2_walk_probs normalizes by |v| — the RATIO is all that matters; speed is
        // always 1px/tick, M1). universe.random() is the engine's own deterministic
        // Mulberry32 stream (G-EMIT primitive) — same stream physics draws from, so a
        // fixed seed is fully reproducible.
        //
        // REJECTION IS PRESET-AWARE — the rejection criterion
        // must match each preset's INTENDED SHAPE, not a single one-size ball:
        //   'spherical': reject to the BALL |v|<=R (rounds the sampled cube into a
        //     sphere of directions — the mandatory isotropy correction, S4/S5).
        //   'hemisphere': the SAME ball rejection, applied to the half-range box
        //     (vx in [0,R]) — a uniform ball conditioned on vx>=0 is a uniform
        //     HALF-ball, so the isotropy correction carries over UNCHANGED. Keeping
        //     it here is load-bearing: dropping the clip (i.e. treating this as a
        //     'directional' preset) turns the forward fan into the measured 1.83:1
        //     diagonal-weighted box draw. It is therefore deliberately NOT in the
        //     `isDirectional` set below.
        //   'drum': vz is pinned to [0,0] by applyPreset, so the SAME ball-rejection
        //     test collapses to a DISK rejection in the z=0 plane for free (no
        //     separate branch needed — z contributes 0 to m2 unconditionally).
        //   'laser': its shape IS the narrow forward-biased range itself — vz alone
        //     already sits near R (0.6R..R), so ANY nonzero vx/vy pushes |v| over R
        //     and a ball-rejection test against that SAME R starves the sampler
        //     (near-100% rejection -> the maxTries safety net firing on every draw,
        //     producing a messy, non-uniform "X" instead of a clean beam). A
        //     directional preset's own range bounds are ALREADY its shape — applying
        //     a further ball clip on top is a category error (double-constraining the
        //     same shape with an incompatible radius). FIX: skip magnitude rejection
        //     entirely for 'laser' (and any future purely-directional preset) — only
        //     the "no exact zero vector" resample guard applies. Any custom range set
        //     via setAxisRange while preset stays 'spherical'/'drum' still gets
        //     ball/disk-rejected; switch preset to 'laser' (or add a future directional
        //     preset) to opt a custom shape out of magnitude rejection.
        //   'particle-walk': same category as 'laser' — vx=[R,R] alone already sits
        //     at exactly R, so a ball-rejection test against that SAME R starves the
        //     sampler identically. Directional, no magnitude clip.
        // B8 pulsar: rotate a sampled (vx,vy) about the z-axis by the emitter's CURRENT
        // orientation (2D yaw). Integer-round after rotation (the sampler yields integer
        // components; frame.rs normalizes by |v| so the RATIO is what matters — M1). At
        // orientation 0 this is the IDENTITY (cos0=1, sin0=0 → round(vx)=vx), so the default
        // path is BYTE-IDENTICAL and draws no RNG. vz (3D forward for the 'laser' 3D preset)
        // is untouched — the 2D pulsar sweeps the in-plane beam; a 3D beam yaws about vertical.
        function rotateVelocity2D(v) {
            var deg = state.orientationDeg || 0;
            if (!deg) { return v; }               // identity fast-path (default) — byte-identical
            var rad = deg * Math.PI / 180;
            var c = Math.cos(rad), s = Math.sin(rad);
            return [Math.round(v[0] * c - v[1] * s), Math.round(v[0] * s + v[1] * c), v[2]];
        }
        function sampleVelocity() { return rotateVelocity2D(sampleVelocityCore()); }
        function sampleVelocityCore() {
            var R = state.R;
            var isDirectional = (state.preset === 'laser' || state.preset === 'particle-walk'); // shape = the range itself, not a ball
            var maxTries = 500;
            var vx = 0, vy = 0, vz = 0;
            for (var t = 0; t < maxTries; t++) {
                vx = Math.round(ranges.vx[0] + universe.random() * (ranges.vx[1] - ranges.vx[0]));
                vy = Math.round(ranges.vy[0] + universe.random() * (ranges.vy[1] - ranges.vy[0]));
                vz = is2D ? 0 : Math.round(ranges.vz[0] + universe.random() * (ranges.vz[1] - ranges.vz[0]));
                var m2 = vx * vx + vy * vy + vz * vz;
                if (m2 === 0) continue; // no direction — resample (applies to every preset)
                if (isDirectional) return [vx, vy, vz]; // range IS the shape — no magnitude clip
                if (state.mode === 'shell') {
                    var lo = 0.9 * R;
                    if (m2 <= R * R && m2 >= lo * lo) return [vx, vy, vz];
                } else {
                    if (m2 <= R * R) return [vx, vy, vz];
                }
            }
            return [vx, vy, vz]; // safety net (misconfigured ranges) — best available sample
        }

        // Per-leaf CHARGE (0=+, 1=-) — drives the transverse-oscillation quadrant
        // (compute_spin: `(remainder/(wl/4) + charge) % 4`), so opposite charges
        // braid, which IS the emergent self-interference structure. Reproduces
        // emitterProgram.js/PointSource EXACTLY: 'random' draws ONE universe.random()
        // per leaf (the same G-EMIT draw the composite emitter makes); 'positive'/
        // 'negative' are deterministic (NO draw) so the default 'positive' path is
        // byte-identical to the pre-existing hardcoded 0.
        // MUST draw in JS and pass an integer 0/1 — passing null coerces to 0 at the
        // wasm-bindgen ABI, NOT a random-draw sentinel (reference_wasm_null_charge_
        // coercion_bug.md), so `chargeMode:'random'` cannot be delegated to makeLeafFrame.
        function sampleCharge() {
            if (state.chargeMode === 'random') { return (universe.random() < 0.5) ? 0 : 1; }
            return (state.chargeMode === 'negative') ? 1 : 0;
        }

        function sampleOffsetAxis(boxSide) {
            if (boxSide <= 0) return 0;
            return -boxSide / 2 + universe.random() * boxSide;
        }

        // Circular rejection in the Y-Z plane (the transverse cross-section
        // perpendicular to 'particle-walk''s +X forward axis — the
        // circular disk source (3D)). Mirrors sampleVelocity's own
        // ball-rejection idiom, applied to POSITION instead of direction.
        // Only ever called when state.sourceShape==='disk' (opt-in — never
        // the default path for spherical/laser/drum).
        function sampleDiskOffsetYZ(diameter) {
            var r = diameter / 2;
            if (r <= 0) return [0, 0];
            var maxTries = 200;
            for (var t = 0; t < maxTries; t++) {
                var dy = -r + universe.random() * 2 * r;
                var dz = -r + universe.random() * 2 * r;
                if (dy * dy + dz * dz <= r * r) return [dy, dz];
            }
            return [0, 0]; // safety net (misconfigured box)
        }

        // Emission SHELL SURFACE start-position — VELOCITY-ALIGNED.
        // The old-PointSource "ring launch" seeds each particle ON the ring AT THE
        // ANGLE OF ITS OWN VELOCITY, so its start pixel is COLLINEAR with its outward
        // trajectory (the pixel position is the integer-scaled momentum
        // vector). This is what gives a single source an EMPTY CENTER and razor-
        // sharp bands: every particle projects radially outward and NONE cuts across
        // the inner disk. Draws NOTHING itself — it is a deterministic function of
        // the ALREADY-SAMPLED velocity `v` (which is why emitOneLeaf samples velocity
        // FIRST in surface mode): start = round(innerR × unit(v)). 2D uses (vx,vy);
        // 3D uses the full (vx,vy,vz) on the sphere shell. Degenerate |v|=0 → center
        // (sampleVelocity never returns the zero vector — it resamples m2===0 — so
        // this is only a safety fallback). NOT the old independent-random-angle seed,
        // which let position and velocity diverge and blurred the bands.
        function shellOffsetFromVelocity(v, radius) {
            if (radius <= 0) return [0, 0, 0];
            var vx = v[0], vy = v[1], vz = is2D ? 0 : v[2];
            var mag = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (mag < 1e-9) return [0, 0, 0]; // |v|=0 → center (safety; never hit)
            var s = radius / mag;
            return [Math.round(vx * s), Math.round(vy * s), is2D ? 0 : Math.round(vz * s)];
        }

        // Emission POSITION sampler for the VOLUME modes only ('box' default, per-axis
        // independent, byte-identical to the uniform-cube behavior when all three axes
        // are equal; or 'disk', 'particle-walk' 3D only). Draw order (x, then y/z)
        // matches the pre-per-axis code — same RNG stream. (SURFACE mode does NOT go
        // through here — its position is derived from velocity in emitOneLeaf.)
        function sampleSourcePosition() {
            var box = state.emissionBox;
            var ox = sampleOffsetAxis(box.x);
            if (state.sourceShape === 'disk') {
                var yz = sampleDiskOffsetYZ(Math.max(box.y, box.z));
                return [ox, yz[0], is2D ? 0 : yz[1]];
            }
            var oy = sampleOffsetAxis(box.y);
            var oz = is2D ? 0 : sampleOffsetAxis(box.z);
            return [ox, oy, oz];
        }

        function emitOneLeaf() {
            var v, ox, oy, oz;
            if (state.emissionShell === 'surface') {
                // VELOCITY-ALIGNED ring launch: sample velocity FIRST, then place the
                // start pixel on the shell AT the velocity's own angle (position is a
                // deterministic function of v, drawing nothing). This makes the start
                // pixel collinear with the outward trajectory — empty center, sharp
                // bands. The velocity-first order applies ONLY to surface mode, so the
                // 'volume' path below keeps its exact position-then-velocity draw
                // stream (byte-identical for every pre-existing box>0 caller).
                v = sampleVelocity();
                var spos = shellOffsetFromVelocity(v, state.innerR);
                ox = spos[0]; oy = spos[1]; oz = spos[2];
            } else {
                var pos = sampleSourcePosition();
                ox = pos[0]; oy = pos[1]; oz = pos[2];
                v = sampleVelocity();
            }
            var chg = sampleCharge();
            var lx = cx0 + ox, ly = cy0 + oy, lz = cz0 + oz;
            // level=leafDimension -> birth this leaf AT this emitter's chosen dimension
            // directly (capacity=(2^leafDimension)², confirmed birth-at-dimension, NOT
            // birth-at-fundamental-then-promote). BYTE-IDENTICAL to the old level=null when
            // leafDimension === the universe fundamental (both resolve to the fundamental).
            // wavelength=state.wavelength -- null by default (mass=capacity, byte-identical);
            // a number sets mass=max(1,capacity/wavelength) for the NEXT emitted leaf (M5:
            // already-emitted leaves keep whatever mass they were stamped with).
            // 10th arg = per-leaf render.shape override (null default → no key →
            // byte-identical). Rides the SAME provider render-intent MERGE seam as color.
            var h = universe.makeLeafFrame(lx, ly, leafDimension, state.wavelength, v[0], v[1], false, chg, state.renderColor, state.renderShape);
            if (h === null) { return; } // liveQuantaCap refused the add: no leaf, nothing to stamp
            universe.injectFrame(h);
            var q = universe.getFrameQuantumId(h);
            universe.setFrameProperty(q, 'z', lz);
            universe.setFrameProperty(q, 'vz', v[2]);
            universe.setFrameProperty(q, 'vx', v[0]);
            universe.setFrameProperty(q, 'vy', v[1]);
        }

        function emitBurst() {
            for (var i = 0; i < state.burstSize; i++) { emitOneLeaf(); }
        }

        var _tick = 0;
        var _tickFn = function () {
            if (state.active && (_tick % emitEveryTicks === 0)) { emitBurst(); }
            _tick++;
        };
        universe.experimentTickFunctions.push(_tickFn);

        // ── Live sugar control handle (the canonical knob pattern) ──────────────
        // The Design marker this emitter's facade owns (attachMarker), or null; and the ONE place
        // that derives where it is drawn from the emission centre.
        var marker = null;
        function placeMarker() {
            var D = marker.rect.w;
            marker.setRect([cx0 - D / 2, cy0 - D / 2, cz0 - D / 2, D, D, D]);
        }
        var control = {
            // INVARIANT ("the clamp bug"): emissionBoxSide is
            // NEVER larger than the CURRENT R. Construction clamps it once; setR()
            // is the ONLY runtime path that can widen the gap (R shrinking below an
            // already-set box), so it MUST re-clamp every time — this is the single
            // authority both `sampleOffset` (physics) and the page's box slider (UI,
            // via each control descriptor's `get()`, see below) read back from.
            setR: function (v) {
                state.R = v;
                state.emissionBoxSide = clamp(state.emissionBoxSide, 0, state.R);
                applyPreset(state.preset, state.R);
                deriveSourceShape();
            },
            getR: function () { return state.R; },
            setEmissionBoxSide: function (v) {
                state.emissionBoxSide = clamp(v, 0, state.R);
                deriveSourceShape();
            },
            getEmissionBoxSide: function () { return state.emissionBoxSide; },
            getEmissionBox: function () { return { x: state.emissionBox.x, y: state.emissionBox.y, z: state.emissionBox.z }; },
            getSourceShape: function () { return state.sourceShape; },
            setMode: function (v) { state.mode = (v === 'shell') ? 'shell' : 'ball'; },
            getMode: function () { return state.mode; },
            setPreset: function (v) {
                state.preset = v;
                applyPreset(v, state.R);
                deriveSourceShape();
            },
            getPreset: function () { return state.preset; },
            setAxisRange: function (axis, lo, hi) { ranges[axis] = [lo, hi]; },
            getAxisRange: function (axis) { return ranges[axis].slice(); },
            setBurstSize: function (v) { state.burstSize = Math.max(1, Math.round(v)); },
            getBurstSize: function () { return state.burstSize; },
            setEmitEveryTicks: function (v) { emitEveryTicks = Math.max(1, Math.round(v)); },
            getEmitEveryTicks: function () { return emitEveryTicks; },
            setActive: function (v) { state.active = !!v; },
            getIs2D: function () { return is2D; },
            // Emission SOURCE POSITION — reposition this emitter's
            // center LIVE (affects the NEXT emitted leaf, M5). Absolute canvas px. z
            // optional (retains the current z when omitted). Pure sugar — only the
            // makeLeafFrame seed pixel moves; the ring launch stays relative to it.
            setCenter: function (x, y, z) {
                cx0 = Math.round(x); cy0 = Math.round(y);
                if (z !== undefined && z !== null) { cz0 = Math.round(z); }
                // THE follow: every centre write ends here, so the Design marker (when this
                // emitter owns one) is re-placed here — explicit and z-capable, never by a caller.
                if (marker) { placeMarker(); }
            },
            /**
             * attachMarker(lo) — hand this emitter's Design marker (a z-capable D×D×D NONE-collision
             * LO, D = its own width) to the centre write: from now on every setCenter re-places it
             * at [cx−D/2, cy−D/2, cz−D/2, D, D, D] through its own LargeObject.setRect.
             */
            attachMarker: function (lo) {
                if (!lo || !lo.rect || typeof lo.rect.z !== 'number') {
                    throw new TypeError('[setupSphereEmitter3D.attachMarker] the marker must be a z-capable LO ' +
                        '(constructed with a 6-element rect) — it follows the centre in x, y AND z. (FAIL-LOUD.)');
                }
                marker = lo;
                placeMarker();
            },
            getCenter: function () { return [cx0, cy0, cz0]; },
            // Per-leaf charge mode (LIVE — affects the NEXT emitted leaf, M5).
            // 'positive'|'negative'|'random'; 'random' = per-leaf ± (braiding).
            setChargeMode: function (v) {
                state.chargeMode = (v === 'random' || v === 'negative' || v === 'positive') ? v : state.chargeMode;
            },
            getChargeMode: function () { return state.chargeMode; },
            // Emission START-POSITION topology (LIVE — affects the NEXT leaf, M5).
            setEmissionShell: function (v) { state.emissionShell = (v === 'surface') ? 'surface' : 'volume'; },
            getEmissionShell: function () { return state.emissionShell; },
            setInnerR: function (v) { state.innerR = Math.max(0, Math.round(v)); },
            getInnerR: function () { return state.innerR; },
            // r0/r1 unique-rational-wavelength demo knob (CLAUDE.md §6 fork —
            // see Layer 2 physics note above). v=1 is physically IDENTICAL to
            // the null default (mass=max(1,capacity/1)=capacity either way) —
            // this control operates entirely in explicit-numeric space; there
            // is no semantic loss vs. the true null-default path a caller who
            // never touches this control takes.
            setWavelength: function (v) { state.wavelength = clamp(Math.round(v), 1, maxWavelength); },
            getWavelength: function () { return state.wavelength !== null ? state.wavelength : 1; },
            getMaxWavelength: function () { return maxWavelength; },
            getFundamentalDimension: function () { return fundamentalDimension; },
            // The dimension THIS emitter births leaves at (per-emitter).
            getLeafDimension: function () { return leafDimension; },
            // LIVE "Emit Dimension". Host-side addDimension (idempotent) +
            // closure-var flip: the NEXT emitted leaf is born at the new dimension (M5, exactly
            // like wavelength/charge). Mid-run addDimension is SAFE (cleared 2026-07-22):
            // do_tick snapshots the dim key set fresh each tick, so a between-ticks add is atomic;
            // promotion routes live. SIDE EFFECT (S1): a value BELOW the current fundamental
            // self-lowers the floor UNIVERSE-GLOBALLY and is a ONE-WAY RATCHET (no removeDimension)
            // — the engine re-bases previously-lower-fullness leaves M1→M2 (alive count conserved).
            // maxWavelength (the wavelength clamp) tracks the leaves' ACTUAL capacity, so recompute.
            setLeafDimension: function (n) {
                var v = Math.max(0, Math.round(n));
                if (v === leafDimension) { return leafDimension; }
                // addDimension whenever it differs from the current fundamental (idempotent; the
                // engine self-lowers the fundamental to min(allocated) — the ratchet). Equal to
                // the fundamental adds nothing (already the base).
                if (v !== fundamentalDimension && typeof universe.addDimension === 'function') {
                    universe.addDimension(v);
                }
                leafDimension = v;
                maxWavelength = SustainedSource.capacityAtDimension(leafDimension);
                // Re-clamp any live wavelength to the new capacity ceiling.
                if (state.wavelength !== null) { state.wavelength = clamp(state.wavelength, 1, maxWavelength); }
                return leafDimension;
            },
            // Per-leaf RENDER COLOR OVERRIDE (render-intent, LIVE — affects the NEXT leaf, M5).
            // [r,g,b]/[r,g,b,a] forces string_map['render.color']; null = colorless (scheme-driven).
            setRenderColor: function (rgb) { state.renderColor = Array.isArray(rgb) ? rgb.slice() : null; },
            getRenderColor: function () { return state.renderColor ? state.renderColor.slice() : null; },
            // Per-leaf RENDER SHAPE OVERRIDE (render-intent, LIVE — affects the NEXT leaf, M5).
            // A ball|box|circle|cube|sphere string forces string_map['render.shape']; null =
            // fall back to the render-level "Default Shape" (setRenderOption). Zero physics.
            setRenderShape: function (shape) {
                state.renderShape = (typeof shape === 'string' && shape) ? shape : null;
            },
            getRenderShape: function () { return state.renderShape || null; },
            // B8 pulsar orientation — LIVE (affects the NEXT sampled leaf, M5). Normalized to
            // [0,360). Spinning a constrained (laser) emitter sweeps the beam; omni unaffected.
            setOrientation: function (deg) {
                var d = (typeof deg === 'number' && isFinite(deg)) ? deg : 0;
                state.orientationDeg = ((d % 360) + 360) % 360;
            },
            getOrientation: function () { return state.orientationDeg || 0; },
            dispose: function () {
                var i = universe.experimentTickFunctions.indexOf(_tickFn);
                if (i !== -1) { universe.experimentTickFunctions.splice(i, 1); }
            }
        };

        // Standardized live knobs (runner.experimentControls-compatible — the SAME
        // shape coneEmitterControl.controls uses). Every
        // descriptor carries a `get()` accessor so a page can
        // generically RE-SYNC every slider's displayed value/label from authoritative
        // state after ANY control fires — not just the one the user dragged. This is
        // what makes the emissionBoxSide<=R clamp VISIBLE live: `emissionBoxSide`
        // additionally carries `maxRef:'R'`, telling the page which OTHER control's
        // current value must drive its slider's `max` attribute (so the box slider
        // can never be dragged past the live R in the UI, not just internally).
        control.controls = [
            {
                id: 'R', label: 'R (radius / blockiness)', min: 2, max: 40, step: 1, value: state.R,
                fmt: function (v) { return String(v); },
                get: function () { return control.getR(); },
                onChange: function (v) { control.setR(v); }
            },
            {
                id: 'emissionBoxSide', label: 'emission box', min: 0, max: 40, step: 1, value: state.emissionBoxSide,
                maxRef: 'R', // this slider's live max = the CURRENT value of the 'R' control
                fmt: function (v) { return String(v); },
                get: function () { return control.getEmissionBoxSide(); },
                onChange: function (v) { control.setEmissionBoxSide(v); }
            },
            {
                id: 'preset', label: 'preset', kind: 'select', options: PRESETS.slice(),
                value: state.preset,
                fmt: function (v) { return String(v); },
                get: function () { return control.getPreset(); },
                onChange: function (v) { control.setPreset(v); }
            },
            {
                id: 'mode', label: 'mode', kind: 'select', options: ['ball', 'shell'], value: state.mode,
                fmt: function (v) { return String(v); },
                get: function () { return control.getMode(); },
                onChange: function (v) { control.setMode(v); }
            },
            {
                id: 'burstSize', label: 'burst size', min: 1, max: 200, step: 1, value: state.burstSize,
                fmt: function (v) { return String(v); },
                get: function () { return control.getBurstSize(); },
                onChange: function (v) { control.setBurstSize(v); }
            },
            {
                id: 'emitEveryTicks', label: 'rate (ticks/burst)', min: 1, max: 30, step: 1, value: emitEveryTicks,
                fmt: function (v) { return String(v); },
                get: function () { return control.getEmitEveryTicks(); },
                onChange: function (v) { control.setEmitEveryTicks(v); }
            },
            {
                // r0/r1 demo: dials the NEXT emitted leaf's mass (=capacity/wavelength),
                // hence its transverse oscillation period — SU1 no-op (max=1) until
                // `fundamentalDimension` is raised (see Layer 1/2 docs above).
                id: 'wavelength', label: 'wavelength/mass (λ, capacity=' + maxWavelength + ')',
                min: 1, max: maxWavelength, step: 1, value: control.getWavelength(),
                fmt: function (v) { return String(v); },
                get: function () { return control.getWavelength(); },
                onChange: function (v) { control.setWavelength(v); }
            }
        ];

        return {
            sphereEmitterControl: control,
            largeObjects: [],
            // TOP-LEVEL dispose (STACKING-BUG FIX): FrqtlApp.setup()
            // tears down the PREVIOUS setupResult by calling `setupResult.dispose()` IF it
            // exists (canonical teardown, FrqtlApp.js) — but this factory previously
            // exposed dispose ONLY on `sphereEmitterControl`, so the runner's teardown check
            // found no top-level dispose and the old emitter's host tick-fn was NEVER removed
            // → a dimension change / re-setup STACKED emitters (multiple tick-fns emitting at
            // once). Delegating a top-level dispose to the control's dispose makes the runner's
            // canonical teardown remove this emitter's tick-fn before the next setup registers
            // the new one — no stacking. Idempotent (control.dispose splices by indexOf; a
            // second call no-ops), so removeObject()/double-dispose is safe.
            dispose: function () { control.dispose(); }
        };
    }

    // ONE authority for "which fundamental dimension the r0/r1 wavelength demo
    // uses" — matches setupTunnelLab.FUNDAMENTAL_DIMENSION / setupLightSourceLab
    // .FUNDAMENTAL_DIMENSION's own value (2) exactly ("MATCHED CONTROLS ->
    // MATCHED PHYSICS"). The page reads THIS instead of hand-typing "2".
    setupSphereEmitter3D.WAVELENGTH_DEMO_DIMENSION = 2;

    // The SKETCH step (see the functions above): the world this emitter's options imply,
    // as data (`worldCfg`) and as the init call (`initWorld`). A part never inits.
    setupSphereEmitter3D.worldCfg = worldCfg;
    setupSphereEmitter3D.initWorld = initWorld;

    setupSphereEmitter3D.OPTIONS = OPTIONS;
    setupSphereEmitter3D.PRESETS = PRESETS;
    setupSphereEmitter3D.SKETCH_OPTIONS = SKETCH_OPTIONS;
    setupSphereEmitter3D.RETIRED_OPTIONS = RETIRED_OPTIONS;

    export { setupSphereEmitter3D };

