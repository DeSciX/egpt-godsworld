/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupTunnelPointExit — the TUNNEL POINT-EXIT LAB (D3).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * Composes THREE already-committed pieces and adds no physics of its own (SU1):
 *   1. a `SphereEmitter` on the `'hemisphere'` preset (D1), parked JUST INSIDE the
 *      corridor's input mouth and aimed down the bore, so the whole burst is fed into
 *      the tunnel instead of half of it flying back out of the entrance;
 *   2. a `Tunnel` in `mode:'directed'` (D2) — each wall hit ejects the quantum back into
 *      the bore and re-emits it in a uniformly random direction within 180° of the axis;
 *   3. that Tunnel's `exitCollapse` gate (D3) — every quantum crossing the output mouth is
 *      pinned to the bore mid-line, so the mouth becomes a one-pixel POINT SOURCE.
 *
 * The question the lab exists to answer VISUALLY: does a point source fed by tunnel
 * transit produce the same semicircular banded self-interference as a fresh point emitter?
 * Graded against the Single-Source Self-Interference experiment as the named exemplar.
 *
 * @param {Object} universe - an EGPTUniverse (not yet init'd; the emitter inits it).
 * @param {Object} [options]
 * @param {number} [options.tunnelLength=240] - corridor travel-axis extent, px. REBUILD-class
 *   (it is wall geometry): the page re-runs `runner.setup()` to change it — the documented
 *   restart-in-place idiom, not a live knob. Deliberately NOT faked as live.
 * @param {number} [options.bore=40] - clear aperture between the corridor walls, px.
 * @param {number} [options.wavelengthScale=16] - the universe's GLOBAL `wavelengthScale`.
 *   LIVE (`universe.wavelengthScale`, consumed fresh each tick). Leaves are born at
 *   dimension 2 (capacity 16) with a `wavelength:32` arg (mass 1), so capacity/mass = 16 and
 *   the EFFECTIVE per-leaf transverse wavelength is `16 × scale` px. 16 ⇒ eff λ 256, the
 *   exemplar's own golden.
 * @param {boolean} [options.exitPhaseReset=false] - arm the exit gate's phase reset. LIVE.
 * @param {number} [options.burstSize=6] @param {number} [options.emitEveryTicks=1]
 * @param {boolean} [options.active=true]
 *
 * @returns {{ tunnel, emitterControl, largeObjects, pointExitControl, dispose }}
 *   `pointExitControl` is the live sugar handle (the canonical knob pattern):
 *   `setWavelengthScale/getWavelengthScale/getEffectiveWavelength`,
 *   `setExitPhaseReset/getExitPhaseReset`, `setActive`, `getTunnelLength`, `controls`.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero new physics. The banding in the exemplar comes from equal-radius quanta sharing a
 * spin phase: births at `local_time=0` are phase-locked, fundamental leaves step P=1 so AGE
 * = RADIUS (bench M1), and the λ coin adds a transverse kick whose bias flips per spin
 * quadrant — every ray snakes with period λ_eff and the ensemble reads as concentric bands.
 * The exit collapse supplies the "one origin" half of that mechanism.
 *
 * It does NOT supply the phase half, and that is the whole point of the lab. Quanta arriving
 * at the mouth have different transit histories, so their phases are spread (measured on this
 * construction: within-same-crossing-tick `local_time` std ≈ 45 ticks). Against a spin period
 * of λ_eff that spread is either negligible or dominant:
 *
 *   | wavelengthScale | eff λ | spin period | expected picture, phase reset OFF |
 *   |---|---|---|---|
 *   | 16 | 256 | 256 ≫ 45 | ~90% phase-aligned for free — BANDED |
 *   | ≤ 8 | ≤ 128 | ≤ 128 | phase-flat (8-bin CV ≈ 0.09) — SMOOTH, un-banded |
 *
 * With the reset ON the mouth is phase-locked at any λ, so the fan should band in both
 * regimes. Sweeping λ against the toggle IS the experiment — nothing here is tuned to make
 * the two regimes agree.
 *
 * Runs the fast path (`withInterQuantumCollisions:false`, no brownian). That is a hard
 * precondition of the collapse, enforced FAIL-LOUD inside `Tunnel`: with collisions ON the
 * collapse pixel serializes one frame per tick and kills contended quanta, so the scene would
 * measure contention rather than a point source.
 *
 * The emitter's start pixel carries ZERO jitter, matching the exemplar: a SphereEmitter burst
 * with emission box 0 starts every quantum on the SAME pixel and co-location is inert on this
 * path. A transverse random jitter is exactly what an earlier self-interference seed did
 * before it was replaced for blurring the bands.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { setupSphereEmitter3D } from './setupSphereEmitter3D.js';
import { kindNamed } from '../kinds.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.



    // Leaves are born HERE (capacity = (2^2)² = 16) with a wavelength arg of 32 → mass 1, so
    // capacity/mass = 16 and the global scale has real leverage. Both numbers are the
    // Single-Source Self-Interference exemplar's own — parity of the per-leaf creation
    // conditions is what makes the two pictures comparable at all.
    var FUNDAMENTAL_DIMENSION = 2;
    var LEAF_WAVELENGTH_ARG = 32;
    var CAPACITY_OVER_MASS = 16;   // (2^FUNDAMENTAL_DIMENSION)² / mass(=1)

    /**
     * THE ONE SCENE-SPEC AUTHORITY (D4). Pure function: options → the exact `SphereEmitter`
     * and `Tunnel` construction configs for this scene, plus the derived geometry a readout
     * wants. It draws nothing and touches no universe.
     *
     * It exists because this scene has TWO surfaces — the standalone page (which runs the
     * factory below) and the Light Lab rung (which must be an `addObject` recipe so STUDIO can
     * select and edit the objects). Without a shared authority those two would each hand-carry
     * the same ten numbers and drift apart, which is the anti-pattern this repo keeps paying
     * for. Both consume THIS; neither re-derives it.
     *
     * @param {Object} spec - `setupTunnelPointExit`'s own options (same names) PLUS the
     *   REQUIRED world size `canvasW`/`canvasH` — the caller ferries the size its co-init
     *   call declared (the rung: the sketch's own `W, H`). Absent THROWS; never a default.
     * @returns {{emitter:Object, tunnel:Object, geom:Object}} the two addObject-ready configs.
     */
    function sceneSpec(spec) {
        // sceneSpec is EXPORTED (the Light Lab rung consumes it so the rung and the
        // standalone page cannot drift), and it reads the SAME bag the factory does plus
        // the world size — so it takes the SAME gate, widened by exactly those two keys.
        spec = _assertSetupOptions('setupTunnelPointExit.sceneSpec', spec, SCENE_SPEC_OPTIONS);
        return _sceneGeometry(spec, _requireWorldRect('setupTunnelPointExit.sceneSpec canvasW/canvasH',
            { w: spec.canvasW, h: spec.canvasH }));
    }

    // The geometry itself, from an options bag and the world rect. The factory calls this
    // with `universe.universe_rect`, the rung (through sceneSpec) with its declared W, H.
    function _sceneGeometry(o, world) {
        var cw = world.w;
        var ch = world.h;
        var tunnelLength = o.tunnelLength !== undefined ? o.tunnelLength : 240;
        var bore = o.bore !== undefined ? o.bore : 40;
        var wallThickness = o.wallThickness !== undefined ? o.wallThickness : 10;
        var wavelengthScale = o.wavelengthScale !== undefined ? o.wavelengthScale : 16;
        var exitRecenter = (o.exitRecenter !== undefined) ? !!o.exitRecenter : true;
        var exitPhaseReset = !!o.exitPhaseReset;
        var burstSize = o.burstSize !== undefined ? o.burstSize : 6;
        var emitEveryTicks = o.emitEveryTicks !== undefined ? o.emitEveryTicks : 1;

        // The corridor sits in the LEFT portion so the exit mouth has open canvas to its right
        // for the fan to develop — the fan is the observable, so it gets the room.
        var left = Math.round(cw * 0.08);
        var midY = Math.round(ch / 2);
        var top = midY - Math.round(bore / 2);
        var emitterX = left + Math.max(2, Math.round(wallThickness / 2));  // a few px inside the mouth

        return {
            emitter: {
                preset: 'hemisphere',       // D1 — forward 180°, so the whole burst enters the bore
                is2D: true,
                center: [emitterX, midY],
                emissionBoxSide: 0,         // a literal one-pixel source — no jitter
                chargeMode: 'random',       // braiding — the self-interference exemplar's setting
                fundamentalDimension: FUNDAMENTAL_DIMENSION,
                wavelength: LEAF_WAVELENGTH_ARG,
                fundamentalWaveLength: 4 * wavelengthScale,  // → waveLengthMultiplier = wavelengthScale
                burstSize: burstSize,
                emitEveryTicks: emitEveryTicks
            },
            tunnel: {
                left: left, top: top, length: tunnelLength, bore: bore,
                wallThickness: wallThickness, axis: 'x',
                mode: 'directed',           // D2 — 180° forward re-emission on every wall hit
                exitCollapse: true,         // D3 — the gate at the output mouth
                exitRecenter: exitRecenter, // D4 — the point-source collapse (default ON)
                exitPhaseReset: exitPhaseReset,
                name: 'point_exit_tunnel', color: [90, 120, 200]
            },
            geom: {
                left: left, top: top, midY: midY, bore: bore,
                exitX: left + tunnelLength, tunnelLength: tunnelLength,
                wavelengthScale: wavelengthScale,
                effectiveWavelength: Math.floor(CAPACITY_OVER_MASS * wavelengthScale)
            }
        };
    }
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupTunnelPointExit.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'active', 'bore', 'burstSize',
        'emitEveryTicks', 'exitPhaseReset', 'exitRecenter',
        'tunnelLength', 'wallThickness', 'wavelengthScale',
    ];
    // sceneSpec's vocabulary: the factory's own, plus the world size it cannot read off a
    // universe (it touches none). Composed from OPTIONS, never retyped.
    var SCENE_SPEC_OPTIONS = OPTIONS.concat(['canvasH', 'canvasW']);

    function setupTunnelPointExit(universe, options) {
        options = _assertSetupOptions('setupTunnelPointExit', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var spec = _sceneGeometry(options, _requireWorldRect(
            'setupTunnelPointExit universe.universe_rect', universe.universe_rect));
        var tunnelLength = spec.geom.tunnelLength;
        var bore = spec.geom.bore;
        var wavelengthScale = spec.geom.wavelengthScale;
        var midY = spec.geom.midY;
        var exitX = spec.geom.exitX;
        var active = options.active !== undefined ? !!options.active : true;

        var emitterFactory = setupSphereEmitter3D;
        // The corridor part by its kind: Tunnel's own module imports this file (its
        // `Tunnel.pointExitSpec` facade delegates to sceneSpec), so an import back would be a cycle.
        var TunnelCls = kindNamed('Tunnel');

        // ── (0) THE WORLD — this factory IS the sketch: init FIRST, then parts ──
        // (fast path, 2D, derived from the emitter spec). Part construction ORDER is
        // irrelevant once the world is up.
        emitterFactory.initWorld(universe, spec.emitter);

        // ── (1) The feeder: a hemisphere emitter JUST INSIDE the input mouth ──
        var emitterResult = emitterFactory(universe, spec.emitter);
        var emitterControl = emitterResult.sphereEmitterControl;
        emitterControl.setActive(active);

        // ── (2)+(3) The directed corridor WITH the point-exit gate ───────────
        var tunnel = new TunnelCls(universe, spec.tunnel);

        // The global λ multiplier is a LIVE universe property (consumed fresh each tick),
        // the same knob the self-interference page drives.
        universe.wavelengthScale = wavelengthScale;

        var control = {
            // λ — LIVE. Effective per-leaf transverse wavelength = (capacity/mass) × scale.
            setWavelengthScale: function (v) {
                var s = Math.max(1, Math.round(v));
                wavelengthScale = s;
                universe.wavelengthScale = s;
                return s;
            },
            getWavelengthScale: function () { return wavelengthScale; },
            getEffectiveWavelength: function () { return Math.floor(CAPACITY_OVER_MASS * wavelengthScale); },
            // The two exit flags — both LIVE (each recompiles + pushes the gate's op-program).
            setExitPhaseReset: function (on) { return tunnel.setExitPhaseReset(on); },
            getExitPhaseReset: function () { return !!tunnel.exitPhaseReset; },
            setExitRecenter: function (on) { return tunnel.setExitRecenter(on); },
            getExitRecenter: function () { return !!tunnel.exitRecenter; },
            // True when the gate currently carries at least one op. With BOTH flags off the
            // gate is a registered but DISARMED collector (no program at all).
            isExitGateArmed: function () { return tunnel.isExitGateArmed(); },
            setActive: function (v) { emitterControl.setActive(!!v); },
            // REBUILD-class — exposed as a getter so the page can show it and re-run setup()
            // with a new value. There is no live setter BY DESIGN: the corridor length is wall
            // geometry, and pretending otherwise would be a lie in the control surface.
            getTunnelLength: function () { return tunnelLength; },
            getBore: function () { return bore; },
            getExitX: function () { return exitX; },
            getMidY: function () { return midY; }
        };

        // The standardized descriptor array — declared ONCE and consumed by both the page's
        // own sliders and any host control strip (the established `controls` idiom).
        control.controls = [
            {
                id: 'wavelengthScale', label: 'λ scale (eff λ = 16 × scale)',
                min: 1, max: 24, step: 1, value: wavelengthScale,
                fmt: function (v) { return String(v) + '  (eff λ ' + Math.floor(CAPACITY_OVER_MASS * v) + 'px)'; },
                get: function () { return control.getWavelengthScale(); },
                onChange: function (v) { control.setWavelengthScale(v); }
            },
            {
                id: 'exitRecenter', label: 'recenter at exit', kind: 'checkbox',
                value: spec.tunnel.exitRecenter,
                fmt: function (v) { return v ? 'on' : 'off'; },
                get: function () { return control.getExitRecenter(); },
                onChange: function (v) { control.setExitRecenter(v); }
            },
            {
                id: 'exitPhaseReset', label: 'phase reset at exit', kind: 'checkbox',
                value: spec.tunnel.exitPhaseReset,
                fmt: function (v) { return v ? 'on' : 'off'; },
                get: function () { return control.getExitPhaseReset(); },
                onChange: function (v) { control.setExitPhaseReset(v); }
            },
            {
                // REBUILD-class: the page re-runs setup() on change (restart-in-place).
                id: 'tunnelLength', label: 'tunnel length (rebuild)',
                min: 60, max: 420, step: 20, value: tunnelLength, rebuild: true,
                fmt: function (v) { return String(v) + 'px'; },
                get: function () { return control.getTunnelLength(); },
                onChange: function () { /* the page owns the rebuild — see `rebuild:true` */ }
            }
        ];

        return {
            tunnel: tunnel,
            emitterControl: emitterControl,
            pointExitControl: control,
            // FrqtlApp.setup() auto-wires this for rendering.
            largeObjects: tunnel.largeObjects,
            // CANONICAL TEARDOWN — the runner calls this before installing the next
            // setupResult, so a rebuild (the length knob) never stacks emitters or walls.
            dispose: function () {
                if (emitterResult && typeof emitterResult.dispose === 'function') { emitterResult.dispose(); }
                if (tunnel && typeof tunnel.dispose === 'function') { tunnel.dispose(); }
            }
        };
    }

    // ONE authority for the per-leaf creation constants the page/readouts quote, and for the
    // SCENE SPEC both surfaces (this factory + the Light Lab rung recipe) consume.
    setupTunnelPointExit.sceneSpec = sceneSpec;
    setupTunnelPointExit.FUNDAMENTAL_DIMENSION = FUNDAMENTAL_DIMENSION;
    setupTunnelPointExit.LEAF_WAVELENGTH_ARG = LEAF_WAVELENGTH_ARG;
    setupTunnelPointExit.CAPACITY_OVER_MASS = CAPACITY_OVER_MASS;

    setupTunnelPointExit.OPTIONS = OPTIONS;
    setupTunnelPointExit.SCENE_SPEC_OPTIONS = SCENE_SPEC_OPTIONS;

    export { setupTunnelPointExit };

