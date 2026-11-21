/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupTraceCircuit — the smallest complete circuit on this floor: SOURCE → TRACE → GROUND.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * Composes THREE already-committed pieces and adds no physics of its own (SU1):
 *   1. a `SphereEmitter` on the `'laser'` preset — the VOLTAGE source, parked just
 *      inside the Trace's inlet and aimed down the first leg, so the whole burst is
 *      fed into the bore instead of sprayed at the inlet walls;
 *   2. a `Trace` — the WIRE (mirror `Tunnel` runs + directed `Tunnel` corners);
 *   3. that Trace's own `ground:true` terminal — the SINK, which also tallies delivery.
 *
 * @param {Object} universe - a constructed, NOT-yet-init'd EGPTUniverse. This factory
 *   IS the sketch: it inits the world FIRST and then constructs parts (world.init()
 *   FIRST → CONSTRUCT parts → WIRE → RUN), so part construction order is irrelevant.
 *   Runs the FAST PATH
 *   (`withInterQuantumCollisions:false`): that is the lossless-waveguide regime the
 *   Trace datasheet is quoted in. Turning inter-quantum collisions ON is RESISTANCE and
 *   makes this a different, current-limited component.
 * @param {Object} [options]
 * @param {Array<Array<number>>} [options.path] - the Trace route (cardinal waypoints).
 *   Default: a straight 400px run across the middle of the canvas.
 * @param {number} [options.bore=12] @param {number} [options.wallThickness=6]
 * @param {number} [options.voltage=6] - emitter burst per tick. LIVE. Measured Ohmic:
 *   delivered current is a straight multiple of this with no knee (see Layer 2).
 * @param {boolean} [options.active=true]
 * @param {number} [options.lanes=1] - build N PARALLEL Traces at the published pitch,
 *   sharing rails, with only lane 0 energised. This is the miniaturization demo: the
 *   dark lanes are the crosstalk measurement.
 *
 * @returns {{ trace, traces, emitterControl, traceControl, largeObjects, onTick, dispose }}
 *   `traceControl` is the live sugar handle (the canonical knob pattern):
 *   `setVoltage/getVoltage`, `setActive`, `getDelivered`, `getCurrent`,
 *   `getConductance`, `getCrosstalk`, `controls`.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * Zero new physics. What the two knobs do to the running scene:
 *
 *   `voltage` (emitter burst/tick) — the current is LINEAR in it with no ceiling in
 *   this regime: the Trace is a lossless waveguide, so whatever the source pushes in
 *   arrives. Conductance (delivered/tick ÷ emitted/tick) measured 1.00 ± 0.02 on a
 *   straight run against 0.29 for the same source and ground with the Trace REMOVED.
 *
 *   `lanes` — stacks independent parallel Traces wall-against-wall at
 *   `Trace.lanePitch(bore, wallThickness)`. Only lane 0 is fed; the readout on the dark
 *   lanes IS the crosstalk measurement — 0.98 % into the immediately adjacent lane at
 *   bore 3 / wall 3 (9px pitch), and EXACTLY zero into every lane beyond it. This is the
 *   picture that shows the part shrinks: four 3px-bore lanes inside a 36px band with the
 *   energised lane still at G = 0.98.
 *
 * The full datasheet — bore, length, wall-thickness floor, corner throughput — lives in
 * `Trace.js`'s Layer 2. It is quoted there once and not restated here.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { Trace } from '../../parts/Trace.js';
import { setupSphereEmitter3D } from './setupSphereEmitter3D.js';

    /** Degrees → the emitter yaw that aims a burst down the Trace's first leg. */
    function _aimDeg(path) {
        var dx = path[1][0] - path[0][0], dy = path[1][1] - path[0][1];
        if (dx > 0) { return 0; }
        if (dx < 0) { return 180; }
        return dy > 0 ? 90 : 270;
    }
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupTraceCircuit.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'active', 'bore', 'lanes', 'path',
        'runner', 'voltage', 'wallThickness',
    ];

    function setupTraceCircuit(universe, options) {
        options = _assertSetupOptions('setupTraceCircuit', options, OPTIONS);
        var TraceCls = Trace;
        var emitterFactory = setupSphereEmitter3D;

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var world = _requireWorldRect('setupTraceCircuit universe.universe_rect', universe.universe_rect);
        var W = world.w, H = world.h;
        var bore = options.bore !== undefined ? options.bore : 12;
        var wallThickness = options.wallThickness !== undefined ? options.wallThickness : 6;
        var voltage = options.voltage !== undefined ? options.voltage : 6;
        var lanes = Math.max(1, options.lanes !== undefined ? options.lanes : 1);
        var active = options.active !== undefined ? !!options.active : true;

        // Independent Traces stack wall-against-wall. NOT bore+wallThickness: that would
        // put each pair of neighbours' mirrors on the SAME pixels, which measured 31 %
        // crosstalk while the energised lane still read G = 0.98 (a silent failure).
        var pitch = TraceCls.lanePitch(bore, wallThickness);
        var midY = Math.round(H / 2) - Math.round((lanes - 1) * pitch / 2);
        var basePath = options.path || [[40, midY], [Math.max(140, W - 60), midY]];

        // ══ STEP 1 — THE WORLD ══════════════════════════════════════════════
        // This factory IS the sketch: it inits the world FIRST, before any part.
        // Everything below is part construction, and construction ORDER among parts
        // no longer matters (the old "source first, walls second" idiom existed only
        // because the emitter factory owned init; it does not any more).
        var aim = _aimDeg(basePath);
        var inPort = basePath[0];
        var inset = 4;
        var emitterOpts = {
            preset: 'laser', is2D: true, R: 24,
            center: [
                inPort[0] + (aim === 0 ? inset : aim === 180 ? -inset : 0),
                inPort[1] + (aim === 90 ? inset : aim === 270 ? -inset : 0)
            ],
            orientationDeg: aim,
            emissionBoxSide: 0, fundamentalDimension: 0,
            burstSize: voltage, emitEveryTicks: 1,
            chargeMode: 'random'
        };
        emitterFactory.initWorld(universe, emitterOpts);

        // ══ STEP 2 — THE PARTS ══════════════════════════════════════════════
        var emitterResult = emitterFactory(universe, emitterOpts);
        var emitterControl = emitterResult.sphereEmitterControl;
        emitterControl.setActive(active);

        // Lane 0 carries the authored route; extra lanes are that route offset by the
        // pitch, so exactly one wall of separation sits between neighbours (the measured
        // stacking geometry).
        var traces = [];
        for (var i = 0; i < lanes; i++) {
            var lanePath = basePath.map(function (p) { return [p[0], p[1] + i * pitch]; });
            traces.push(new TraceCls(universe, {
                path: lanePath, bore: bore, wallThickness: wallThickness,
                ground: true, name: 'trace' + i,
                color: i === 0 ? [90, 120, 200] : [70, 80, 110]
            }));
        }
        var trace = traces[0];

        var control = {
            setVoltage: function (v) {
                voltage = Math.max(0, Math.round(v));
                emitterControl.setBurstSize(voltage);
                return voltage;
            },
            getVoltage: function () { return voltage; },
            setActive: function (v) { emitterControl.setActive(!!v); },
            getDelivered: function () { return trace.getDelivered(); },
            getCurrent: function () { return trace.getCurrent(); },
            /** delivered/tick ÷ emitted/tick — 1.0 is a perfect conductor. */
            getConductance: function () { return voltage ? trace.getCurrent() / voltage : 0; },
            /** Fraction of lane 0's current appearing in the dark lanes (0 with lanes=1). */
            getCrosstalk: function () {
                if (traces.length < 2) { return 0; }
                var lead = trace.getCurrent();
                if (!lead) { return 0; }
                var dark = 0;
                for (var k = 1; k < traces.length; k++) { dark += traces[k].getCurrent(); }
                return dark / lead;
            },
            getPitch: function () { return pitch; },
            getLanes: function () { return traces.length; }
        };

        // The standardized descriptor array — declared ONCE, consumed by both the page's
        // own sliders and any host control strip (the established `controls` idiom).
        control.controls = [
            {
                id: 'voltage', label: 'voltage (burst/tick)',
                min: 0, max: 32, step: 1, value: voltage,
                fmt: function (v) { return String(v) + ' q/tick'; },
                get: function () { return control.getVoltage(); },
                onChange: function (v) { control.setVoltage(v); }
            },
            {
                // REBUILD-class: bore is wall geometry, so the page re-runs setup().
                id: 'bore', label: 'bore (rebuild)',
                min: 1, max: 40, step: 1, value: bore, rebuild: true,
                fmt: function (v) { return String(v) + 'px'; },
                get: function () { return bore; },
                onChange: function () { /* the page owns the rebuild — see `rebuild:true` */ }
            },
            {
                id: 'lanes', label: 'parallel lanes (rebuild)',
                min: 1, max: 8, step: 1, value: lanes, rebuild: true,
                fmt: function (v) { return String(v) + ' @ ' + pitch + 'px pitch'; },
                get: function () { return control.getLanes(); },
                onChange: function () { /* rebuild */ }
            }
        ];

        var result = {
            trace: trace,
            traces: traces,
            emitterControl: emitterControl,
            traceControl: control,
            // FrqtlApp.setup() auto-wires this for rendering.
            largeObjects: traces.reduce(function (acc, t) { return acc.concat(t.largeObjects); }, []),
            /**
             * The ONE per-tick call — drives every lane's junctions + ground sampling.
             * `attachToRunner` below wires it for you; this stays public for a harness
             * that ticks the universe directly with no runner.
             */
            onTick: function (tickData) {
                for (var k = 0; k < traces.length; k++) { traces[k].onTick(tickData); }
            },
            /**
             * Subscribe every lane to the runner's per-tick fan-out. REQUIRED: nothing in
             * `FrqtlApp` calls a setupResult's `onTick`, so without this the corner
             * junctions never redirect and `getDelivered()`/`getCurrent()` read 0 forever —
             * which looks exactly like "the wire doesn't conduct" (QA hit precisely that).
             * Uses `addTickListener`, the multi-subscriber peer of the page's single `onTick`
             * slot, so it never steals the page's own hook. Idempotent per lane.
             * @param {Object} runner - an FrqtlApp.
             */
            attachToRunner: function (runner) {
                for (var k = 0; k < traces.length; k++) { traces[k].attachToRunner(runner); }
                return result;
            },
            // CANONICAL TEARDOWN — the runner calls this before installing the next
            // setupResult, so a rebuild never stacks emitters or walls. Each Trace's own
            // dispose drops its tick subscription too.
            dispose: function () {
                if (emitterResult && typeof emitterResult.dispose === 'function') { emitterResult.dispose(); }
                traces.forEach(function (t) { t.dispose(); });
            }
        };

        // Auto-wire when the caller hands us the runner (the page idiom below). Optional:
        // a caller without a runner calls `result.attachToRunner(runner)` after setup, or
        // drives `result.onTick(tickData)` itself.
        if (options.runner) { result.attachToRunner(options.runner); }
        return result;
    }

    setupTraceCircuit.OPTIONS = OPTIONS;

    export { setupTraceCircuit };

