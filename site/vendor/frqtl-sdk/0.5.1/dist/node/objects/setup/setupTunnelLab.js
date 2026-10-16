/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupTunnelLab — DirectedTunnel ISOLATION (I1, the directed-tunnel composition model
 * §3): ONE `DirectedTunnel`, gun-chamber mechanics (fill / escape / dispersion) at a
 * live-tunable scale — the visual half of the scale-sweep measurement
 * (`docs/internal/physics-lab/directed-tunnel-scale-sweep/`), same methodology, same source shape.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * @param {Object} universe - WASM universe (not yet init'd — this factory calls init()).
 *   NOTE ON DETERMINISTIC SEEDING: same convention as every other setup factory
 *   (`setupGunChamber.js`) — `universe` arrives ALREADY
 *   CONSTRUCTED with its seed fixed by `FrqtlApp`; there is no `opts.seed` here.
 * @param {Object} [opts]
 * @param {number} [opts.bore=40] - Tunnel bore (interior height/cross-section), pixels.
 *   REINIT-CLASS (changing it needs a fresh `runner.setup()` — matches the sweep's own
 *   per-cell tunnel construction; the tunnel geometry is not a live-resizable rect).
 * @param {number} [opts.length=240] - Tunnel length (interior width), pixels. REINIT-CLASS.
 * @param {number} [opts.wavelength=64] - Per-frame wavelength override for EVERY hand-
 *   placed source quantum (the SAME `makeLeafFrame` per-frame override the sweep uses —
 *   `QuantumEmitter` has no wavelength field, which is exactly why this factory hand-
 *   places quanta via a local host tick-fn instead of `DirectedTunnel`'s `options.emitter`
 *   — see the Layer 2 note below). LIVE (`setupResult.sourceState.wavelength`).
 *   **CEILING (CEO drive #2, 2026-07-14 — "the wavelength slider has no effect"
 *   root cause):** Engine Invariant #6 is `mass = max(1, capacity/wavelength)` —
 *   at this factory's `FUNDAMENTAL_DIMENSION=2`, `capacity = (2^2)^2 = 16`
 *   (`setupTunnelLab.CAPACITY`, exported below), so ANY `wavelength >= capacity`
 *   (16) saturates `mass` at its floor (1) and therefore ALSO saturates the
 *   DERIVED wavelength (`capacity/mass`) at exactly `capacity` (16) — `wavelength:
 *   64`, `128`, or `1000000` are ALL physically IDENTICAL to `wavelength: 16`
 *   (same mass, same transverse-oscillation period). This was NOT a collision-
 *   reset bug (verified: `mass` survives every wall behavior — option1/option2/
 *   composable — unchanged across ticks, pkg-node probe) — it is a genuine
 *   ceiling in the formula. Only `wavelength` values in `(0, capacity]` (i.e.
 *   `(0, 16]` here) produce DISTINCT mass/oscillation-period values; `tunnel-lab
 *   /index.html`'s own wavelength slider is clamped to `setupTunnelLab.
 *   MAX_USEFUL_WAVELENGTH` (= `CAPACITY`) for exactly this reason — one
 *   authority, no hand-typed "16" duplicate in the page.
 * @param {string} [opts.wallBehavior='option2'] - Initial `DirectedTunnel.behavior`
 *   (`DirectedTunnel.BEHAVIORS` — option1 | option2 | any `SlitLinerScatter` composable
 *   name). LIVE — `setupResult.tunnel.updateBehavior(newBehavior)`.
 * @param {number} [opts.sourceDensity=5] - Quanta hand-placed per burst. LIVE
 *   (`setupResult.sourceState.density`). NOTE: this is the FACTORY's own
 *   omitted-opt default (unchanged, for any headless caller) — `tunnel-lab
 *   /index.html`'s own UI default is 10 (CEO drive #2, 2026-07-14
 *   population-density fix: the page ALWAYS passes an explicit value read
 *   from its own `<input>` default, so this factory default is never
 *   actually reached by the page — see that file's own docstring for the
 *   pkg-node-measured TPS/alive-count calibration against `setupGunChamber
 *   .js`'s own 20/tick emission rate).
 * @param {number} [opts.sourceRate=10] - Ticks between bursts (an `everyNTicks`-style
 *   cadence, mirroring `emitterProgram.js`'s own live cadence knob). LIVE
 *   (`setupResult.sourceState.rate`). NOTE: same as `sourceDensity` above —
 *   the factory default (unchanged) vs. the page's own UI default (1) diverge
 *   for the same reason.
 * @param {boolean} [opts.sourceActive=true] - Master on/off for the burst source. LIVE
 *   (`setupResult.sourceState.active`).
 * @param {number} [opts.depth] - CEO drive #2 (2026-07-14) 3D toggle. OMITTED
 *   (default) -> 2D (byte-identical to every pre-existing caller). A positive
 *   value -> real z-containment (`activeAxes:{x,y,z}` on `universe.init()`,
 *   `DirectedTunnel`'s own `depth`/`z=-depth/2`, hand-placed quanta z-centred)
 *   — the standard `options.depth` recipe. REINIT-CLASS
 *   (only meaningful at construction, like bore/length).
 * @param {'spray'|'beam'} [opts.velocityProfile='spray'] - ws-dse-3d AC3 (CEO
 *   drive #2 round-2 ruling, "tunnel-lab gains the source-profile selection off
 *   the shared surface"): the SAME `SustainedSource.SOURCE_SPEC_FIELDS.
 *   velocityProfile` axis `LightSource`'s own `particleWalk` burst always uses
 *   (`'beam'`, hardcoded there) — exposed here so tunnel-lab can be set to
 *   `'beam'` and produce a directly comparable collimated source to
 *   lightsource-lab's default particleWalk mode at matched bore/length/
 *   wavelength/wallBehavior ("same settings -> same visuals"). Default `'spray'`
 *   — byte-identical to every pre-existing caller (this factory's own original
 *   hardcoded biased-fan shape, unchanged). LIVE (`setupResult.sourceState.
 *   velocityProfile` — `placeSourceQuanta` reads it fresh every burst, no reinit).
 *
 * @returns {{
 *   tunnel: DirectedTunnel, sourceState: {density:number, rate:number, wavelength:number,
 *   active:boolean}, largeObjects: LargeObject[]
 * }}
 * `largeObjects` (= `tunnel.largeObjects`) is the canonical key `FrqtlApp.setup()`
 * auto-wires for rendering (matches every other setup factory).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * **Zero new physics (canonical-bench SU1)** — this factory only WIRES existing
 * primitives: `DirectedTunnel` (itself zero new physics over `Tube`), and a burst source
 * built from the SAME `makeLeafFrame`+`injectFrame`+`universe.random()` primitives the
 * scale-sweep script and every hand-placed-quantum experiment already use. The source is
 * a LOCAL host tick-fn (NOT `QuantumEmitter`) because `QuantumEmitter`'s constructor has
 * no wavelength field — the isolation lab needs the SAME per-frame wavelength override
 * the scale sweep uses so the page visually demonstrates EXACTLY what the sweep
 * measured, not a physically-different (unmodifiable-wavelength) source. Pushed onto
 * `universe.experimentTickFunctions` (Phase A, matching `emitterProgram.js`'s own
 * registration point) — legitimate here because, unlike `DirectedTunnel`'s `option1`
 * redirect (which needs Phase-D `tickData`), injection is a pre-tick primitive with no
 * such timing constraint.
 *
 * **Gun-chamber convention**: `capNegX:true, capPosX:false` — a CLOSED breech (source
 * fires INTO the bore, quanta bounce/fill) and an OPEN muzzle (quanta escape, then
 * disperse freely with no walls) — the CEO's own Gun-Chamber model ("particles ping-pong
 * in a tube, escape the open end, spread comes from dispersion AFTER escape").
 *
 * **Fundamental dimension = 2** (matches `setupDoubleSlit.js`'s default AND the scale-
 * sweep's own convention — see `docs/internal/physics-lab/directed-tunnel-scale-sweep/README.md`'s
 * "level 0 pins wavelength to a no-op" note): a level-0 leaf has `capacity=1`, so
 * `mass=max(1,capacity/wavelength)` is PINNED at 1 for any `wavelength>=2` — the
 * wavelength slider would be a silent no-op at level 0.
 *
 * **Biased entrance (bunched near the TOP wall)** — the SAME shape the scale sweep uses,
 * because a symmetric/spread entrance is already balanced and shows no washout effect at
 * all (the scale sweep's own finding); bunching is what makes
 * "uniformizes vs transmits unmodified" visually OBSERVABLE as the population fills the
 * bore over time.
 */

(function () {

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.
    var _assertSetupOptions;
    var _requireWorldRect;   // _setupOptions.js — the world rect, never a default size
    if (typeof module !== 'undefined' && module.exports) {
        _assertSetupOptions = require('./_setupOptions').assertSetupOptions;
        _requireWorldRect = require('./_setupOptions').requireWorldRect;
    } else {
        _assertSetupOptions = function (n, o, k) { return window.assertSetupOptions(n, o, k); };
        _requireWorldRect = function (w, r) { return window.requireWorldRect(w, r); };
    }

    // ── Imports ─────────────────────────────────────────────────────────────

    var DirectedTunnel, SustainedSource;

    if (typeof module !== 'undefined' && module.exports) {
        DirectedTunnel = require('../objects/DirectedTunnel').DirectedTunnel;
        SustainedSource = require('../objects/sustainedSource');
    } else {
        DirectedTunnel = window.DirectedTunnel;
        SustainedSource = window.SustainedSource;
    }

    var FUNDAMENTAL_DIMENSION = 2; // matches setupDoubleSlit.js + the scale-sweep script

    // CEO drive #2 (2026-07-14) — the ONE authority for "what's the largest
    // wavelength value that still produces a DISTINCT mass from any larger one"
    // at this factory's FUNDAMENTAL_DIMENSION. Engine Invariant #6:
    // `mass = max(1, capacity/wavelength)` — the floor (mass=1) is reached
    // exactly at `wavelength === capacity`; every wavelength beyond that is
    // indistinguishable. `tunnel-lab/index.html` reads this (never a hand-typed
    // "16" literal) to clamp its wavelength slider's max to the achievable range.
    // ws-dse-3d: derived from `SustainedSource.capacityAtDimension` — the SAME
    // authority `setupLightSourceLab.js` now also derives its own
    // MAX_USEFUL_WAVELENGTH from (AC4: "same MAX_USEFUL_WAVELENGTH clamp
    // authority" for both labs).
    var TUNNEL_LAB_CAPACITY = SustainedSource.capacityAtDimension(FUNDAMENTAL_DIMENSION); // 16 at FUNDAMENTAL_DIMENSION=2
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupTunnelLab.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'bore', 'depth',
        'length', 'sourceActive', 'sourceDensity', 'sourceRate',
        'velocityProfile', 'wallBehavior', 'wavelength',
    ];


    function setupTunnelLab(universe, opts) {
        opts = _assertSetupOptions('setupTunnelLab', opts, OPTIONS);
        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvasRect = universe.universe_rect;
        var world = _requireWorldRect('setupTunnelLab universe.universe_rect', canvasRect);
        var cw = world.w, ch = world.h;

        var bore = opts.bore !== undefined ? opts.bore : 40;
        var length = opts.length !== undefined ? opts.length : 240;
        var wavelength = opts.wavelength !== undefined ? opts.wavelength : 64;
        var wallBehavior = opts.wallBehavior !== undefined ? opts.wallBehavior : 'option2';
        var sourceDensity = opts.sourceDensity !== undefined ? opts.sourceDensity : 5;
        var sourceRate = opts.sourceRate !== undefined ? opts.sourceRate : 10;
        var sourceActive = opts.sourceActive !== undefined ? !!opts.sourceActive : true;
        // CEO drive #2 item 1 (2026-07-14) — OPT-IN 3D, OMISSION-preserves-2D
        // (the "before adding a creation-method parameter" discipline): mirrors
        // the standard `options.depth` recipe — omitted/null ->
        // 2D (zContain:false, byte-identical to every existing caller); a
        // positive value -> real z-containment (Tube/DirectedTunnel heritage —
        // `options.depth` already existed on DirectedTunnel, T1; this factory
        // simply now forwards it + arms activeAxes).
        var depth = (opts.depth !== undefined && opts.depth !== null) ? opts.depth : null;
        // ws-dse-3d AC3 — default 'spray' is byte-identical to every pre-existing
        // caller (this factory's own original hardcoded value below).
        var velocityProfile = opts.velocityProfile !== undefined ? opts.velocityProfile : 'spray';

        var initOpts = {};
        if (depth !== null) { initOpts.activeAxes = { x: true, y: true, z: true }; }
        universe.init(FUNDAMENTAL_DIMENSION, initOpts);

        var left = Math.round(cw * 0.1);
        var top = Math.round(ch / 2 - bore / 2);

        var tunnelOpts = {
            left: left, top: top, length: length, width: bore,
            capNegX: true, capPosX: false, // closed breech, open muzzle — Gun-Chamber convention
            behavior: wallBehavior,
        };
        if (depth !== null) { tunnelOpts.depth = depth; tunnelOpts.z = -depth / 2; }
        var tunnel = new DirectedTunnel(universe, tunnelOpts);

        // ws-dse-3d (CEO ruling 2026-07-14, "one source surface"): the recurring
        // burst injector now routes through `sustainedSource.js`'s ONE
        // `buildSustainedSource` authority — the SAME surface
        // `setupLightSourceLab.js` (via `LightSource`'s own opt-in
        // `options.sustain`) now also consumes. `velocityProfile:'spray'` +
        // `entranceBias:'top'` reproduce this factory's PRE-EXISTING biased-
        // random-fan shape EXACTLY (the "uniformization visible" demo shape —
        // see the module docstring's "Biased entrance" note); `zIsotropy:true`
        // (the default) is the 3D-SYMMETRIC EMISSION fix (ws-dse-3d, theorist §4
        // option (a)) — when `depth` is armed, every burst now ALSO draws a `vz`
        // symmetric to the `vy` spread, instead of pinning z-momentum at zero
        // forever (the tester-measured z/y=0.23 flatness root cause).
        var src = SustainedSource.buildSustainedSource(universe, tunnel.innerRect, true /* capNegX (Gun-Chamber closed breech) */, depth !== null, {
            wavelength: wavelength,
            velocityProfile: velocityProfile,
            entranceBias: 'top',
            zIsotropy: true,
            density: sourceDensity,
            rate: sourceRate,
            active: sourceActive,
        });
        var sourceState = src.sourceState;

        return {
            tunnel: tunnel,
            sourceState: sourceState,
            // FrqtlApp.setup() (FrqtlApp.js:528) auto-wires
            // the render list; today the world's own census carries them by construction.
            largeObjects: tunnel.largeObjects,
            // CANONICAL TEARDOWN (CEO drive #2, 2026-07-14 — the reinit-
            // compounding fix): `FrqtlApp.prototype.setup()` calls THIS
            // automatically before installing the NEXT setupResult. Delegates to
            // `src.dispose()` (the ONE `sustainedSource.js` teardown mechanism)
            // rather than re-deriving the tag-then-splice idiom a second time.
            dispose: src.dispose,
        };
    }

    // ONE authority for the achievable wavelength ceiling at this factory's
    // FUNDAMENTAL_DIMENSION (see the TUNNEL_LAB_CAPACITY comment above) — the
    // page reads this instead of hand-typing "16".
    setupTunnelLab.FUNDAMENTAL_DIMENSION = FUNDAMENTAL_DIMENSION;
    setupTunnelLab.CAPACITY = TUNNEL_LAB_CAPACITY;
    setupTunnelLab.MAX_USEFUL_WAVELENGTH = TUNNEL_LAB_CAPACITY;

    setupTunnelLab.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupTunnelLab: setupTunnelLab };
    } else {
        window.setupTunnelLab = setupTunnelLab;
    }

})();
