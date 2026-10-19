/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupConeEmitter3D — the smallest GYM-visible 3D surface for the
 * concentric-ring cone-vs-cylinder construction (canonical-bench S2/S3),
 * driven by ONE live SPREAD knob.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * @param {Object} universe
 *   The engine universe instance (JS or WASM compat shim), not yet init'd.
 *   Obtained from `window.EGPTUniverse` via FrqtlApp.
 *
 * @param {Object} [options]
 * @param {number} [options.fundamentalWaveLength=64] - Desired wavelength of
 *   emitted quanta (px) — same `wavelengthScale` derivation every other
 *   setup factory in this directory uses (`setupParticleWalk3D.js`,
 *   `setupSphereEmitter3D.js`).
 * @param {number} [options.spread=0.6] - v_radial MAGNITUDE (px/tick) each ring
 *   leaf's (vx,vy) is scaled to, pointing along its own outward radial unit
 *   vector. `spread=0` ⇒ every leaf's (vx,vy)=(0,0) — the LITERAL S2
 *   construction (collimated cylinder/laser). `spread>0` ⇒ the S3 construction
 *   (diverging cone/flashlight); the emergent half-angle is `atan(spread/vz)`
 *   (bench S3 law, measured within ~0.3° across 5 vz values).
 * @param {number} [options.vz=1] - Constant forward velocity (px/tick) every
 *   ring leaf is stamped with, along the engine's z axis (bench's S2/S3 axis
 *   convention — z towards the viewer).
 * @param {number} [options.ringCount=4] - Concentric rings per emission burst,
 *   radii evenly spaced from `ringRadius/ringCount` to `ringRadius`.
 * @param {number} [options.ringRadius=40] - Outer ring radius (px).
 * @param {number} [options.leavesPerRing=20] - Leaves placed per ring (evenly
 *   spaced in theta).
 * @param {number} [options.emitEveryTicks=6] - Ticks between successive ring
 *   bursts (sustained emission — a host tick-fn, NOT a native emit-spec; see
 *   the Layer 2 note below). A shorter period gives a denser, more continuous
 *   beam at higher per-tick leaf-creation cost.
 *
 * @returns {{
 *   coneEmitterControl: {
 *     setSpread(v), getSpread(): number,
 *     setVz(v),     getVz(): number,
 *     setActive(bool),
 *     setRingCount(v), setRingRadius(v),
 *     controls: Array<{id,label,min,max,step,value,fmt,onChange}>
 *   },
 *   largeObjects: []
 * }}
 *   `coneEmitterControl` is a live sugar handle (the canonical knob pattern —
 *   the blackbody scene's temperature knob → `oven.setTemperature`, `g3-lo-collide`'s `ctl`): a page
 *   wires a slider's `input` event straight to `setSpread`/`setVz`, live, no
 *   reload. `coneEmitterControl.controls` is the SAME standardized
 *   `runner.experimentControls`-compatible array `SphereEmitter.controls`
 *   already established — declared ONCE, consumed by both the page's own
 *   sliders and the IDE GYM control strip.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero new physics (canonical-bench SU1) — this is a pure composition of two
 * already-goldened engine behaviors: M5 (velocity is conserved absent
 * collision/attraction — a free leaf drifts in a dead-straight line) and S1
 * (x, y, and z axes run the IDENTICAL update — 2D and 3D are the same physics
 * with more axes). Every emitted leaf is placed on a ring in the x,y plane via
 * `makeLeafFrame` + `injectFrame`, then stamped via `setFrameProperty` with a
 * constant forward `vz` and a radial (vx,vy) scaled by the live `spread` knob
 * — the SAME `leafV`/`ringLeaves` construction verified as canonical-bench
 * `S2`/`S3` (re-applying vx/vy/vz AFTER inject is the documented safe idiom,
 * `feedback_pkgnode_verification_script_gotchas.md` — omitting it silently
 * no-ops the velocity write on some engine builds).
 *
 * `spread=0` reproduces S2 exactly: radial extent stays bounded near the
 * ring's own starting radius while z travels the full 1px/tick speed limit
 * (bench M1) — `atan(radial/z-travel)` SHRINKS toward 0 as z grows, i.e. a
 * COLLIMATED CYLINDER (laser), not a cone. `spread>0` reproduces S3: radial
 * extent now grows in lockstep with z-travel, and the half-angle converges to
 * `atan(spread/vz)` — a genuine diverging CONE (flashlight). No engine change
 * is implicated anywhere in this file — it is purely which velocity a
 * scene-builder hands each leaf.
 *
 * Sustained emission is a HOST TICK-FN pushed to
 * `universe.experimentTickFunctions` — the SAME framework hook
 * Blackbody's thermostat already uses
 * (guardrail R1: no new engine hook, no native emit-spec). Because
 * each successive ring burst is younger (has traveled less z), a running scene
 * shows a series of receding ring-shells at increasing z-depth — a solid-
 * looking collimated tube (spread=0) or an opening flashlight cone (spread>0).
 *
 * Fast-path regime (task-specified): no `withInterQuantumCollisions`, no
 * `brownianMotion`, no top-down auto-spawn ladder — `activeAxes`
 * `{x:true,y:true,z:true}` only. Leaves drift forever once emitted (M5); there
 * is no sink here, so `quantum_limit`-style population bounding is left to the
 * page/GYM run duration, matching `particle-walk-3d`'s own precedent (no sink,
 * `wrap:false`-equivalent — leaves simply exit `universe_rect` and stop
 * appearing, per `reference_population_bounded_by_universe_edge_not_only_sink.md`).
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupConeEmitter3D.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'emitEveryTicks', 'fundamentalWaveLength', 'leavesPerRing', 'ringCount',
        'ringRadius', 'spread', 'vz',
    ];

    function setupConeEmitter3D(universe, options) {
        options = _assertSetupOptions('setupConeEmitter3D', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupConeEmitter3D universe.universe_rect', canvas_rect);

        var desiredWaveLength = options.fundamentalWaveLength !== undefined
            ? options.fundamentalWaveLength : 64;
        var waveLengthMultiplier = Math.max(1, Math.floor(desiredWaveLength / 4));

        // ── Universe init: 3D, fast-path (no collisions/brownian/top-down frame-gen) ──
        universe.init(0, {
            wavelengthScale: waveLengthMultiplier,
            brownianMotion: false,
            activeAxes: { x: true, y: true, z: true }
        });

        var cx0 = Math.floor(canvas_rect.w / 2);
        var cy0 = Math.floor(canvas_rect.h / 2);
        var cz0 = 0;

        // ── Live-mutable emission state (closed over by the tick-fn AND the
        //    returned control handle — the canonical live-knob pattern:
        //    the blackbody scene's knob calls OvenBox.setTemperature, which sets the
        //    target the thermostat tick-fn reads on its NEXT evaluation, never the engine
        //    directly). Values here are read fresh on every emitted ring, so a
        //    slider drag changes the NEXT burst's leaves — already-emitted
        //    leaves keep drifting on whatever velocity they were stamped with
        //    (M5: velocity is conserved — there is no retroactive rewrite). ──
        var state = {
            spread:        options.spread        !== undefined ? options.spread        : 0.6,
            vz:            options.vz            !== undefined ? options.vz            : 1,
            ringCount:     options.ringCount     !== undefined ? options.ringCount     : 4,
            ringRadius:    options.ringRadius    !== undefined ? options.ringRadius    : 40,
            leavesPerRing: options.leavesPerRing !== undefined ? options.leavesPerRing : 20,
            active: true
        };
        var emitEveryTicks = options.emitEveryTicks !== undefined ? options.emitEveryTicks : 6;

        // Mirrors bench.cjs's leafV()/ringLeaves() exactly (canonical-bench S2/S3) —
        // re-applying vx/vy/vz AFTER injectFrame is the documented safe idiom.
        function emitOneRing(radiusPx) {
            var N = state.leavesPerRing;
            for (var i = 0; i < N; i++) {
                // HALF-STEP ANGULAR OFFSET (i + 0.5), not i: keep EVERY leaf off the
                // exact cardinal axes. At the bare theta=2πi/N sampling, i=0 lands at
                // theta=0 (vx=spread, vy=EXACTLY 0) and i=N/4,N/2,3N/4 land with a
                // ~1e-16 float residual on their off-axis component — and the engine's
                // move_frame classifies the propagation axis by a BIT-EXACT vx!=0.0 /
                // vy!=0.0 test, so those degenerate leaves get NO transverse wave on the
                // (bit-)zero axis and stay plane-confined, projecting as sharp bright
                // axis-aligned LINES. The +0.5 offset gives
                // every leaf a meaningfully-nonzero (vx,vy) pair so it fans into the cone
                // VOLUME instead of a plane. |v_radial|=spread is unchanged by a pure
                // angular rotation, so the S3 half-angle law atan(spread/vz) is preserved.
                // Pure SUGAR fix (canonical-bench SU1) — zero engine change; the raw-engine
                // S2/S3 goldens in bench.cjs keep their own 2πi/N sampling untouched.
                var theta = (2 * Math.PI * (i + 0.5)) / N;
                var lx = cx0 + radiusPx * Math.cos(theta);
                var ly = cy0 + radiusPx * Math.sin(theta);
                var vx = state.spread * Math.cos(theta);
                var vy = state.spread * Math.sin(theta);
                var h = universe.makeLeafFrame(lx, ly, 0, null, vx, vy, false, 0, null);
                universe.injectFrame(h);
                var q = universe.getFrameQuantumId(h);
                universe.setFrameProperty(q, 'z', cz0);
                universe.setFrameProperty(q, 'vz', state.vz);
                universe.setFrameProperty(q, 'vx', vx);
                universe.setFrameProperty(q, 'vy', vy);
            }
        }

        function emitBurst() {
            for (var r = 1; r <= state.ringCount; r++) {
                emitOneRing(state.ringRadius * r / state.ringCount);
            }
        }

        var _tick = 0;
        var _tickFn = function () {
            if (state.active && (_tick % emitEveryTicks === 0)) { emitBurst(); }
            _tick++;
        };
        universe.experimentTickFunctions.push(_tickFn);

        // ── Live sugar control handle (the canonical knob pattern) ──────────────
        var control = {
            setSpread:     function (v) { state.spread = v; },
            getSpread:     function () { return state.spread; },
            setVz:         function (v) { state.vz = v; },
            getVz:         function () { return state.vz; },
            setRingCount:  function (v) { state.ringCount = Math.max(1, Math.round(v)); },
            getRingCount:  function () { return state.ringCount; },
            setRingRadius: function (v) { state.ringRadius = v; },
            getRingRadius: function () { return state.ringRadius; },
            setActive:     function (v) { state.active = !!v; },
            dispose: function () {
                var i = universe.experimentTickFunctions.indexOf(_tickFn);
                if (i !== -1) { universe.experimentTickFunctions.splice(i, 1); }
            }
        };

        // Standardized live knobs (runner.experimentControls-compatible — the SAME
        // shape SphereEmitter.controls / g3-lo-collide's CONTROLS array use).
        control.controls = [
            {
                id: 'spread', label: 'spread', min: 0, max: 2, step: 0.05, value: state.spread,
                fmt: function (v) { return v.toFixed(2); },
                onChange: function (v) { control.setSpread(v); }
            },
            {
                id: 'vz', label: 'vz (forward)', min: 0.1, max: 4, step: 0.1, value: state.vz,
                fmt: function (v) { return v.toFixed(1); },
                onChange: function (v) { control.setVz(v); }
            },
            {
                id: 'ringRadius', label: 'ring radius', min: 10, max: 120, step: 5, value: state.ringRadius,
                fmt: function (v) { return String(v); },
                onChange: function (v) { control.setRingRadius(v); }
            },
            {
                id: 'ringCount', label: 'rings', min: 1, max: 10, step: 1, value: state.ringCount,
                fmt: function (v) { return String(v); },
                onChange: function (v) { control.setRingCount(v); }
            }
        ];

        return {
            coneEmitterControl: control,
            largeObjects: []
        };
    }

    setupConeEmitter3D.OPTIONS = OPTIONS;

    export { setupConeEmitter3D };

