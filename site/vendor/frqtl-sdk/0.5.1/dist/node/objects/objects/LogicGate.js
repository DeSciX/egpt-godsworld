/* Copyright 2023-2026 by Essam Abadir */

/**
 * LogicGate — THE SWITCHING PART. Two current-sensing input terminals, one
 * powered output terminal, assembled entirely from stock: a `Wall{destroy,count}`
 * ammeter per input, a mirror `Tunnel` output channel, a `SphereEmitter` supply
 * rail, and a `Wall{destroy}` SHUNT VALVE across the outlet.
 *
 *     var g = new LogicGate(universe, { logic: 'AND', left: 200, top: 120, bore: 3 });
 *     g.inPortA;  // [200, 126] — route a Trace here
 *     g.inPortB;  // [200, 168]
 *     g.outPort;  // [248, 147] — route the next Trace from here
 *     g.onTick(tickData);   // once per tick — sense, decide, actuate
 *     g.getState();         // { a, b, out, currentA, currentB }
 *
 * ── THE PACKAGED MECHANISM, IN ONE SENTENCE ─────────────────────────────────
 * A `LogicGate` is a HOST TICK-FN that (1) reads each input terminal's collected
 * collision count out of this tick's TickData, (2) thresholds the two windowed
 * currents into booleans with hysteresis, and (3) writes ONE property — the
 * shunt valve's active flag — so the always-on supply either reaches the outlet
 * or is dumped to ground. Sense with a counting Wall; decide between ticks;
 * actuate with `setActive`. That is the documented control loop
 * (`INTERPRETER_ARCHITECTURE.md`), not a new engine concept.
 *
 * ── WHY A POWERED (VALVE) GATE AND NOT A CURRENT-SUMMING ONE ────────────────
 * Both were measured (`docs/internal/physics-lab/logic-gate-bench/`). Currents DO
 * add at a directed junction, so a wired threshold gate is buildable — but its
 * output level is a multiple of its INPUT level, so levels decay down a chain and
 * a two-deep circuit needs re-tuned thresholds at every stage. The valve gate's
 * output is its OWN supply rail, so every gate emits the same HIGH level no matter
 * what its inputs did: levels are RESTORED and gates cascade unchanged. A
 * half-adder is two gates deep, so this is not a preference — it is the reason the
 * part works at all. The merge measurement is kept in the bench README as the
 * fan-in datum, not as a second gate family.
 *
 * ── PURE COMPOSITION — zero engine, zero new physics (canonical-bench SU1) ───
 * A LogicGate adds NO collision logic. Every piece is a part already on the floor:
 *   INPUT TERMINAL → `Wall{ collisionBehavior:'destroy', hooks:['count'] }`
 *                    — the ammeter; identical to a `Trace`'s own ground, and it
 *                      uses `Trace.GROUND_COUNTS_PER_ARRIVAL` for calibration
 *                      rather than re-deriving it (ONE authority).
 *   OUTPUT CHANNEL → `Tunnel{ mode:'mirror' }` — the same insulation a Trace run
 *                    is made of, so the gate shrinks on the same rules.
 *   SUPPLY RAIL    → `SphereEmitter{ preset:'laser' }` — voltage = burst/tick.
 *   SHUNT VALVE    → `Wall{ collisionBehavior:'destroy' }` + `lo.setActive()`.
 *   SUPPLY CAP     → `Wall{ collisionBehavior:'destroy' }` closing the inlet.
 * The comparator is arithmetic on collected data BETWEEN ticks. If building a gate
 * ever seems to need engine or provider code, STOP: it is walls, a tunnel and an
 * emitter.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `new LogicGate(universe, opts)` — builds + engine-registers every sub-part. It
 *   does NOT add itself to a runner render list; the caller iterates
 *   `gate.largeObjects` (or `runner.setup()` auto-wires them).
 *
 *   ORDERING PRECONDITION — `universe.init()` MUST already have run (a gate
 *   registers LargeObjects in its constructor and the engine throws on
 *   registration against a fresh universe). The sketch order is always
 *   world.init() FIRST → CONSTRUCT parts → WIRE → RUN.
 *
 *   @param {Object} universe — an EGPTUniverse (JS or WASM compat shim).
 *   @param {Object} opts
 *   @param {string} opts.logic — REQUIRED. A key of `LogicGate.TRUTH`:
 *     AND | OR | XOR | NAND | NOR | XNOR. FAIL-LOUD on anything else. The logic is
 *     a comparator ROW, not a geometry — every value builds the identical hardware,
 *     which is why an inverting gate costs exactly what a non-inverting one costs
 *     here (unlike silicon).
 *   @param {number} opts.left, opts.top — the gate cell's top-left corner, px.
 *   @param {number} [opts.bore=3] — the lane aperture, px. Sets the lane pitch
 *     (`bore + 2*wallThickness`) and therefore the whole footprint.
 *   @param {number} [opts.wallThickness=6] — lane insulation, px. This is the knob
 *     that sets the shrink floor — see Layer 2 and the `Trace` datasheet.
 *   @param {number} [opts.length=48] — the output channel's x extent, px. The floor
 *     is `LogicGate.MIN_LENGTH` (20 px — below it the supply inlet and the shunt
 *     valve would overlap), and 20 px is also the length the shipped minimal cell
 *     uses. FAIL-LOUD below the floor.
 *   @param {number} [opts.supplyVoltage=6] — the rail: emitter burst per tick, and
 *     therefore the gate's HIGH output level in q/tick. LIVE (`setSupplyVoltage`).
 *   @param {number} [opts.thresholdHigh] — input current (q/tick) at or above which
 *     an input is called HIGH. DEFAULT `0.5 * supplyVoltage` — referenced to the
 *     rail so a gate driven by another gate switches at half that gate's own HIGH
 *     level, which is what makes a chain work without per-stage tuning.
 *   @param {number} [opts.thresholdLow] — current below which a HIGH input reverts
 *     to LOW (hysteresis). DEFAULT `0.25 * supplyVoltage`. Must be < thresholdHigh.
 *   @param {number} [opts.windowTicks=20] — sliding window for the current average.
 *     Sets BOTH the noise (sd ~ sqrt(I/W)) and half the switching delay.
 *   @param {'x'} [opts.axis='x'] — flow axis. Only +x is built and measured;
 *     FAIL-LOUD on anything else rather than shipping an unmeasured orientation.
 *   @param {Array} [opts.color] — RGB for the channel mirrors.
 *   @param {string} [opts.name='gate'] — identifier prefix.
 *
 * @property {Array} inPortA, inPortB — `[x,y]` input terminal faces. Route a
 *   `Trace` so its `outPort` lands exactly here (gap 0 — the terminal slab starts
 *   at the port).
 * @property {Array} outPort — `[x,y]` the powered outlet. Route the next `Trace`'s
 *   `inPort` here.
 * @property {Array} footprint — `[left, top, w, h]` the gate cell's full extent.
 * @property {Array<Wall>} terminals — `[ammeterA, ammeterB]`.
 * @property {Wall} valve, supplyCap — the shunt valve and the inlet cap.
 * @property {Tunnel} channel — the output channel.
 * @property {Array<LargeObject>} largeObjects — every inner engine LO (render wiring).
 *
 * Methods:
 *   `onTick(tickData)` — THE ONE per-tick call: sense → decide → actuate.
 *   `attachToRunner(runner)` — subscribe `onTick` to the runner's tick fan-out.
 *   `getState()` → `{ a, b, out, currentA, currentB }` — the two input booleans,
 *     the output boolean, and the two windowed currents in q/tick.
 *   `getOutputLevel()` → the nominal HIGH level in q/tick (0 when the output is LOW).
 *   `setSupplyVoltage(v)` / `getSupplyVoltage()` — LIVE rail knob. Re-derives the
 *     two thresholds only if the caller never pinned them explicitly.
 *   `setLogic(name)` / `getLogic()` — LIVE comparator row swap (no rebuild: the
 *     hardware is identical for every row).
 *   `footprintArea()` → px² — the miniaturization figure of merit.
 *   `dispose()` — tears down every sub-part (idempotent).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * ZERO physics of its own (SU1). Everything below is the emergent behaviour of the
 * stock parts, MEASURED on this construction (WASM engine, 2D, fundamental dim 0,
 * inter-quantum collisions OFF, 3 seeds; the rigs are
 * `docs/internal/physics-lab/logic-gate-bench/characterize.cjs` and
 * `gate-acceptance.cjs`, and the numbers are quoted from `LogicGate.MEASURED`):
 *
 *   THE INPUT IS AN AMMETER AND IT IS LINEAR. A `Wall{destroy,count}` terminal
 *   reads I = G·V with G = 1.01 ± 0.01 and no knee from V = 1 to V = 16, and reads
 *   EXACTLY 0.00 with no source. That linearity is why a threshold can be quoted
 *   as a FRACTION OF THE RAIL and still mean the same thing at every voltage.
 *
 *   THE VALVE IS A HARD ZERO. Closed (the destroy slab active) the outlet delivers
 *   0.000 q/tick — not "small", zero: `destroy` is a plain kill (bench LO6) and
 *   nothing gets past it. So the ON/OFF ratio is not a finite number, and the LOW
 *   output level is not a level at all. All of a gate's noise lives on the INPUT
 *   side.
 *
 *   THE SWITCHING THRESHOLD AND ITS TOLERANCE. The terminal current is a counting
 *   process: the sd of a W-tick sliding mean goes as ~0.75·sqrt(I/W), so at the
 *   default rail (6 q/tick) and W = 20 the input reads 6.05 ± 0.42 — a 7.2 sd
 *   margin to the 3.0 threshold, and 5.7 sd even at a rail of 4. Shrinking W speeds
 *   the gate up and narrows the margin as 1/sqrt(W); the shipped default is the
 *   last W at which every rail from 4 up clears 4 sd.
 *
 *   …AND THE ASYMMETRY THAT COMES WITH HYSTERESIS. The comparator rises on the
 *   FIRST EXCURSION above `thresholdHigh` and is then LATCHED by `thresholdLow`, so
 *   the EFFECTIVE switching point sits about half a standard deviation BELOW the
 *   nominal threshold: a drive whose terminal MEAN measured 2.86 q/tick — under the
 *   3.0 threshold — read HIGH on every seed, and never chattered (zero output
 *   transitions were measured anywhere in the drive sweep). The rule that follows:
 *   an input is reliably LOW only while it stays ~4 sd BELOW `thresholdHigh`, which
 *   at the shipped defaults means under about a THIRD of the rail, not merely under
 *   half of it. The asymmetry is in the safe direction (a marginal input latches
 *   rather than oscillating), but it is not what "threshold = half the rail" reads
 *   like, so design to the 4 sd rule, not to the nominal number.
 *
 *   PROPAGATION DELAY: ~8 TICKS OF GATE, THE REST IS WIRE. Measured end-to-end at
 *   268 ticks from an input source switching on to the output boolean following —
 *   of which 260 ticks are the current FLYING the 260 px input trace at 1 px/tick
 *   (bench M1) and only ~8 are the comparator crossing its threshold. The output
 *   CURRENT then needs the outlet-to-load flight on top (measured 529 ticks total
 *   over a further 240 px). So the part's own latency is ~8 ticks and everything
 *   else in a circuit's settling time is LAYOUT: place a gate near its source and
 *   it responds almost immediately; a chain's settling time is the sum of its
 *   wires, not of its gates.
 *
 *   LANE CROSSTALK IS A NON-ISSUE, AND HERE IS THE ARITHMETIC. The three lanes sit
 *   at `Trace.lanePitch` — wall against wall, never sharing mirror pixels (two
 *   coincident mirrors leak badly; that is in the Trace datasheet). At the tightest
 *   shipped geometry the published lane-to-lane crosstalk is 0.98 % and it reaches
 *   ONLY the immediately adjacent lane, so at a rail of 6 the output lane puts
 *   ~0.06 q/tick onto an input terminal — about 25x below `thresholdLow`. Widen the
 *   insulation and it measures exactly zero. The output lane is deliberately in the
 *   MIDDLE so both inputs see the identical (tiny) coupling.
 *
 *   IT SHRINKS, BUT IT HAS ITS OWN FLOOR — LOWER THAN THE WIRE'S. A `Trace` still
 *   conducts at bore 1 (G = 0.987 with 10 px of insulation). A GATE at bore 1 does
 *   NOT: it measured 0.14 q/tick and failed its truth table outright, because a gate
 *   is not just a run — it puts a 4 px inlet cap and a 4 px shunt valve across the
 *   bore and parks the supply 8 px inside it, and that machinery does not fit a 1 px
 *   aperture. Expecting the wire's floor to be the gate's floor was WRONG; the
 *   measured floor is bore 2-3.
 *
 *   AND "IT RETURNS THE RIGHT ANSWER" IS NOT THE ACCEPTANCE TEST. bore 2 / wall 3
 *   (a 480 px² cell) holds all sixteen truth-table rows — on a conductor leaking
 *   ~23 %, delivering only 4.65 q/tick against a 6 q/tick rail. The BOOLEAN is right
 *   and the part is still not shippable, because the HIGH level is what the NEXT
 *   gate thresholds against and level restoration is the property the cascade rests
 *   on. Acceptance is therefore two conditions — table correct AND HIGH ≥ 90 % of
 *   the rail — which makes the shipped minimum `LogicGate.MINIMAL`: bore 3 / wall 3
 *   / length 20, a 20 × 27 = 540 px² cell delivering 6.04 ± 0.12 q/tick.
 *
 *   A too-thin mirror does not degrade gracefully — it goes transparent, so a
 *   sub-floor gate reads DEAD (no output on any row), not noisy.
 *
 *   QUIESCENT CURRENT. The rail runs whether the output is HIGH or LOW (a LOW
 *   output is the supply being dumped into the valve), so a gate always draws
 *   `supplyVoltage` q/tick. This is static logic; there is no idle state.
 */

(function () {

    // ── Imports (Node) or CALL-TIME globals (browser) ────────────────────────
    // Browser resolution is at CALL time, never module-eval time: these are classic
    // scripts in a roster and an eval-time capture would make correctness a latent
    // property of list position (the realm failure Tunnel.js documents at length).
    var _Tunnel = null, _Wall = null, _Trace = null, _SphereEmitter = null;
    if (typeof module !== 'undefined' && module.exports) {
        _Tunnel = require('./Tunnel').Tunnel;
        _Wall = require('./Wall').Wall;
        _Trace = require('./Trace').Trace;
        _SphereEmitter = require('./SphereEmitter').SphereEmitter;
    }
    function _get(local, name) {
        return local || (typeof window !== 'undefined' && window[name]) || null;
    }

    /**
     * The comparator rows. DATA, not geometry: every row builds the identical
     * hardware and differs only in this one function, which is why NAND costs
     * exactly what AND costs on this floor.
     */
    var TRUTH = {
        AND: function (a, b) { return a && b; },
        OR: function (a, b) { return a || b; },
        XOR: function (a, b) { return a !== b; },
        NAND: function (a, b) { return !(a && b); },
        NOR: function (a, b) { return !(a || b); },
        XNOR: function (a, b) { return a === b; }
    };

    function LogicGate(universe, opts) {
        opts = opts || {};
        this.universe = universe;
        this._schemaKind = 'LogicGate';

        var TunnelCls = _get(_Tunnel, 'Tunnel');
        var WallCls = _get(_Wall, 'Wall');
        var TraceCls = _get(_Trace, 'Trace');
        var EmitterCls = _get(_SphereEmitter, 'SphereEmitter');
        if (!TunnelCls || !WallCls || !TraceCls || !EmitterCls) {
            throw new Error('[LogicGate] Tunnel.js + Wall.js + Trace.js + SphereEmitter.js are not ' +
                'loaded (game-layer roster). (FAIL-LOUD.)');
        }

        var logic = String(opts.logic || '').toUpperCase();
        if (!TRUTH[logic]) {
            throw new Error('[LogicGate] opts.logic must be one of ' + Object.keys(TRUTH).join(', ') +
                ' — got ' + JSON.stringify(opts.logic) + '. (FAIL-LOUD.)');
        }
        var axis = opts.axis || 'x';
        if (axis !== 'x') {
            throw new Error('[LogicGate] only axis "x" (+x flow) is built and MEASURED. A rotated ' +
                'gate would be an unmeasured part wearing a measured datasheet. Rotate the layout ' +
                'instead. (FAIL-LOUD.)');
        }

        var left = opts.left, top = opts.top;
        if (typeof left !== 'number' || typeof top !== 'number') {
            throw new Error('[LogicGate] opts.left and opts.top are required (px). (FAIL-LOUD.)');
        }
        var bore = (opts.bore !== undefined && opts.bore !== null) ? opts.bore : 3;
        var wallThickness = (opts.wallThickness !== undefined && opts.wallThickness !== null)
            ? opts.wallThickness : 6;
        if (!(bore > 0) || !(wallThickness > 0)) {
            throw new Error('[LogicGate] bore and wallThickness must both be positive. (FAIL-LOUD.)');
        }
        var length = (opts.length !== undefined) ? opts.length : 48;
        if (length < LogicGate.MIN_LENGTH) {
            throw new Error('[LogicGate] opts.length ' + length + ' is below the measured minimum ' +
                LogicGate.MIN_LENGTH + 'px (the supply inlet and the shunt valve would overlap). ' +
                '(FAIL-LOUD.)');
        }

        var supplyVoltage = (opts.supplyVoltage !== undefined) ? opts.supplyVoltage : 6;
        this._pinnedHigh = (opts.thresholdHigh !== undefined);
        this._pinnedLow = (opts.thresholdLow !== undefined);
        var thresholdHigh = this._pinnedHigh ? opts.thresholdHigh : LogicGate.THRESHOLD_HIGH_FRACTION * supplyVoltage;
        var thresholdLow = this._pinnedLow ? opts.thresholdLow : LogicGate.THRESHOLD_LOW_FRACTION * supplyVoltage;
        if (!(thresholdLow < thresholdHigh)) {
            throw new Error('[LogicGate] thresholdLow (' + thresholdLow + ') must be BELOW ' +
                'thresholdHigh (' + thresholdHigh + ') — the gap IS the hysteresis. (FAIL-LOUD.)');
        }

        var name = opts.name || 'gate';
        var color = opts.color || [200, 170, 70];
        var pitch = TraceCls.lanePitch(bore, wallThickness);

        this.logic = logic;
        this.left = left; this.top = top;
        this.bore = bore; this.wallThickness = wallThickness; this.length = length;
        this.pitch = pitch;
        this.supplyVoltage = supplyVoltage;
        this.thresholdHigh = thresholdHigh;
        this.thresholdLow = thresholdLow;
        this.windowTicks = (opts.windowTicks !== undefined) ? opts.windowTicks : 20;
        this.name = name;
        this.color = color;

        // ── THE THREE LANES ──────────────────────────────────────────────────
        // Input A on top, the powered output in the MIDDLE (equidistant from both
        // inputs, so the two crosstalk paths are identical), input B on the bottom.
        // Lanes sit at Trace's published pitch — wall against wall, never sharing
        // mirror pixels (the coincident-mirror leak in the Trace datasheet).
        var yA = top + pitch / 2;
        var yO = top + pitch * 1.5;
        var yB = top + pitch * 2.5;
        this.inPortA = [left, yA];
        this.inPortB = [left, yB];
        this.outPort = [left + length, yO];
        this.footprint = [left, top, length, pitch * 3];

        var T = LogicGate.TERMINAL_THICKNESS;

        // ── INPUT TERMINALS: the ammeters. Identical to a Trace's own ground. ─
        this.terminals = [
            new WallCls(universe, {
                rect: [left, yA - pitch / 2, T, pitch],
                collisionBehavior: 'destroy', hooks: ['count'],
                name: name + '_inA', color: [60, 60, 255]
            }),
            new WallCls(universe, {
                rect: [left, yB - pitch / 2, T, pitch],
                collisionBehavior: 'destroy', hooks: ['count'],
                name: name + '_inB', color: [60, 60, 255]
            })
        ];

        // ── OUTPUT CHANNEL: a mirror Tunnel — the same insulation as a Trace run.
        this.channel = new TunnelCls(universe, {
            left: left, top: yO - bore / 2, length: length, bore: bore,
            wallThickness: wallThickness, axis: 'x', mode: 'mirror',
            name: name + '_channel', color: color
        });

        // ── SUPPLY CAP: closes the inlet so the rail cannot spray backwards out
        //    of the cell. A destroy slab, not a mirror — a mirror would send the
        //    backward fraction forward again and inflate the HIGH level.
        this.supplyCap = new WallCls(universe, {
            rect: [left, yO - pitch / 2, T, pitch],
            collisionBehavior: 'destroy',
            name: name + '_cap', color: [70, 70, 90]
        });

        // ── SHUNT VALVE: the ONE property this gate ever writes. ──────────────
        this.valve = new WallCls(universe, {
            rect: [left + length - LogicGate.VALVE_INSET, yO - pitch / 2, T, pitch],
            collisionBehavior: 'destroy',
            name: name + '_valve', color: [220, 90, 90]
        });

        // ── SUPPLY RAIL: voltage = burst per tick, aimed down the channel. ────
        this.supply = new EmitterCls([left + LogicGate.SUPPLY_INSET, yO], {
            preset: 'laser', is2D: true, R: 24, orientationDeg: 0,
            emissionBoxSide: 0, fundamentalDimension: 0,
            burstSize: Math.max(1, supplyVoltage), emitEveryTicks: 1,
            chargeMode: 'random', renderColor: [255, 120, 60]
        }).addTo(universe);

        // ── Roll up every sub-part for render wiring. ─────────────────────────
        var parts = this.terminals.concat(this.channel.walls, [this.supplyCap, this.valve]);
        this.walls = parts;
        this.largeObjects = [];
        var self = this;
        parts.forEach(function (w) {
            if (w && w.lo) {
                self.largeObjects.push(w.lo);
            }
        });
        // THE ONE UP-LINK: the gate stamps exactly what IT composed — the terminals, the channel
        // (a Tunnel, which stamps its own plates), the cap, the valve and the supply rail.
        this.terminals.concat([this.channel, this.supplyCap, this.valve, this.supply]).forEach(function (p) {
            if (p) { p._owner = self; }
        });

        // ── Comparator state ─────────────────────────────────────────────────
        this._counts = [[], []];       // raw cumulative ground counts, per terminal
        this._current = [0, 0];        // windowed q/tick, per terminal
        this._states = [false, false];
        this._out = null;
        this._unsub = null;
        this._disposed = false;
        this._applyOutput(TRUTH[logic](false, false));
    }

    /** Terminal / valve / cap slab thickness, px. */
    LogicGate.TERMINAL_THICKNESS = 4;
    /** Supply emitter inset from the channel inlet, px (clear of the inlet cap). */
    LogicGate.SUPPLY_INSET = 8;
    /** Valve inset from the outlet, px. Shorter ⇒ faster fall, less stored current. */
    LogicGate.VALVE_INSET = 8;
    /** Shortest channel that still fits the supply inlet and the valve, px. */
    LogicGate.MIN_LENGTH = LogicGate.SUPPLY_INSET + LogicGate.VALVE_INSET + LogicGate.TERMINAL_THICKNESS;
    /** Default switching thresholds AS A FRACTION OF THE RAIL (see Layer 2). */
    LogicGate.THRESHOLD_HIGH_FRACTION = 0.5;
    LogicGate.THRESHOLD_LOW_FRACTION = 0.25;

    LogicGate.TRUTH = TRUTH;
    /** The logic rows this part realizes — the ONE vocabulary (schema ferries it). */
    LogicGate.LOGICS = Object.keys(TRUTH);

    /**
     * The measured datasheet AS DATA, so a circuit (or a half-adder) can budget
     * levels, margins and settling time without re-running the bench. Every figure
     * is from `docs/internal/physics-lab/logic-gate-bench/` (pkg-node WASM, 2D,
     * fundamental dim 0, inter-quantum collisions OFF, 3 seeds); the README there
     * carries the prediction each one was measured against.
     */
    LogicGate.MEASURED = {
        /** Terminal current vs source voltage: I = inputGain * V, no knee, I(0)=0 exactly. */
        inputGain: 1.011, inputGainSpread: 0.024,
        /** HIGH output level as a fraction of the rail, and its seed spread (q/tick at rail 6). */
        outputLevelFraction: 1.001, outputLevelSd: 0.036,
        /** LOW output. Not a level — the valve is a destroy slab. */
        outputLowLevel: 0,
        /** sd of the W-tick windowed terminal current ~ noiseCoefficient * sqrt(I/W). */
        noiseCoefficient: 0.75,
        /** Margin in sd from the rail to the threshold, at windowTicks 20, rail 4 / 6 / 8. */
        thresholdMarginSd: { 4: 5.67, 6: 7.21, 8: 8.87 },
        /**
         * How far BELOW `thresholdHigh` an input must stay to be reliably LOW, in sd.
         * The comparator rises on the FIRST excursion and then latches, so the
         * effective switch point is below nominal — design to this, not to 0.5*rail.
         */
        reliableLowMarginSd: 4,
        /** The part's own latency, ticks. Everything else in a circuit is wire flight. */
        gateLatencyTicks: 8,
        /** Wire flight, px per tick (bench M1) — the other term in any settling budget. */
        flightPxPerTick: 1,
        /** Output level spread across a 2.7x range of INPUT level (level restoration). */
        levelRestorationSd: 0.018,
        /** Output transitions measured across the whole drive sweep. */
        chatterTransitions: 0
    };

    /**
     * The smallest cell MEASURED to hold the full truth table (both logics, all
     * four input rows, every seed) — the miniaturization acceptance result, and the
     * palette default. Acceptance is TWO conditions — the table correct AND the HIGH
     * level restored to >= 90% of the rail — because a smaller cell (bore 2 / wall 3,
     * 480 px^2) returns every correct boolean while delivering only 77% of the rail,
     * which is out of margin the moment it drives another gate. Below bore 2 the gate
     * fails outright even where a Trace still conducts: the inlet cap, the shunt valve
     * and the supply do not fit a 1px aperture. A too-thin wall does not degrade — the
     * mirrors go transparent and the gate reads DEAD.
     */
    LogicGate.MINIMAL = { bore: 3, wallThickness: 3, length: 20, w: 20, h: 27, area: 540 };

    /**
     * THE ONE per-tick call — SENSE, DECIDE, ACTUATE.
     * Reads each terminal's collected collisions out of THIS tick's TickData
     * (each TickData must be consumed exactly once — the Wall guard enforces it),
     * windows them into a current, thresholds with hysteresis, and writes the
     * valve's active flag when — and only when — the output boolean changes.
     * @param {Object} tickData — this tick's TickData (from `universe.doTick()`).
     */
    LogicGate.prototype.onTick = function (tickData) {
        var TraceCls = _get(_Trace, 'Trace');
        var perArrival = TraceCls.GROUND_COUNTS_PER_ARRIVAL;
        for (var i = 0; i < 2; i++) {
            var raw = this.terminals[i].getCollisionHistogram(tickData).total;
            var w = this._counts[i];
            w.push(raw);
            if (w.length > this.windowTicks + 1) { w.shift(); }
            var span = w.length - 1;
            this._current[i] = span > 0 ? ((w[span] - w[0]) / perArrival) / span : 0;
            // Hysteresis: the gap between the two thresholds is what stops a gate
            // sitting on its threshold from chattering on shot noise.
            if (this._states[i] && this._current[i] < this.thresholdLow) { this._states[i] = false; }
            else if (!this._states[i] && this._current[i] >= this.thresholdHigh) { this._states[i] = true; }
        }
        this._applyOutput(TRUTH[this.logic](this._states[0], this._states[1]));
    };

    /**
     * Write the valve. HIGH ⇒ the valve is INACTIVE (the rail reaches the outlet);
     * LOW ⇒ ACTIVE (the rail is dumped into the destroy slab). Idempotent — the
     * engine write happens only on a transition.
     * @private
     */
    LogicGate.prototype._applyOutput = function (out) {
        if (out === this._out) { return; }
        this._out = out;
        this.valve.lo.setActive(!out);
    };

    /** Subscribe `onTick` to a runner's per-tick fan-out. Idempotent. */
    LogicGate.prototype.attachToRunner = function (runner) {
        if (this._unsub || !runner || typeof runner.addTickListener !== 'function') { return this._unsub || null; }
        var self = this;
        this._unsub = runner.addTickListener(function (td) { self.onTick(td); });
        return this._unsub;
    };

    /**
     * The gate's live readout.
     * @returns {{a:boolean, b:boolean, out:boolean, currentA:number, currentB:number}}
     */
    LogicGate.prototype.getState = function () {
        return {
            a: this._states[0], b: this._states[1], out: !!this._out,
            currentA: this._current[0], currentB: this._current[1]
        };
    };

    /** The nominal output level in q/tick: the rail when HIGH, exactly 0 when LOW. */
    LogicGate.prototype.getOutputLevel = function () {
        return this._out ? this.supplyVoltage : 0;
    };

    /**
     * LIVE rail knob. Re-derives the two thresholds from the new rail UNLESS the
     * caller pinned them at construction — a pinned threshold is an explicit
     * design decision and is never silently moved.
     * @param {number} v — burst per tick.
     */
    LogicGate.prototype.setSupplyVoltage = function (v) {
        this.supplyVoltage = Math.max(0, Math.round(v));
        this.supply.setBurstSize(Math.max(1, this.supplyVoltage));
        this.supply.setActive(this.supplyVoltage > 0);
        if (!this._pinnedHigh) { this.thresholdHigh = LogicGate.THRESHOLD_HIGH_FRACTION * this.supplyVoltage; }
        if (!this._pinnedLow) { this.thresholdLow = LogicGate.THRESHOLD_LOW_FRACTION * this.supplyVoltage; }
        return this.supplyVoltage;
    };
    LogicGate.prototype.getSupplyVoltage = function () { return this.supplyVoltage; };

    /** LIVE comparator-row swap. The hardware is identical for every row. */
    LogicGate.prototype.setLogic = function (nameIn) {
        var next = String(nameIn || '').toUpperCase();
        if (!TRUTH[next]) {
            throw new Error('[LogicGate.setLogic] unknown logic ' + JSON.stringify(nameIn) +
                ' — expected one of ' + LogicGate.LOGICS.join(', ') + '. (FAIL-LOUD.)');
        }
        this.logic = next;
        this._applyOutput(TRUTH[next](this._states[0], this._states[1]));
        return next;
    };
    LogicGate.prototype.getLogic = function () { return this.logic; };

    /** The miniaturization figure of merit: the cell's area in px². */
    LogicGate.prototype.footprintArea = function () {
        return this.footprint[2] * this.footprint[3];
    };

    /** Full teardown; delegates to each sub-part's own dispose. Idempotent. */
    LogicGate.prototype.dispose = function () {
        if (this._disposed) { return; }
        this._disposed = true;
        if (this._unsub) { this._unsub(); this._unsub = null; }
        this.terminals.forEach(function (w) { w.dispose(); });
        this.channel.dispose();
        this.supplyCap.dispose();
        this.valve.dispose();
        if (this.supply && typeof this.supply.dispose === 'function') { this.supply.dispose(); }
    };

    /**
     * Cell size for a given lane geometry, WITHOUT constructing anything — so a
     * layout tool (or a half-adder) can place gates before it builds them.
     * @param {number} bore @param {number} wallThickness @param {number} [length=48]
     * @returns {{w:number, h:number, pitch:number, area:number}}
     */
    LogicGate.cellSize = function (bore, wallThickness, length) {
        var TraceCls = _get(_Trace, 'Trace');
        var pitch = TraceCls.lanePitch(bore, wallThickness);
        var len = (length !== undefined) ? length : 48;
        return { w: len, h: pitch * 3, pitch: pitch, area: len * pitch * 3 };
    };

    // ── Export ───────────────────────────────────────────────────────────────
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { LogicGate: LogicGate };
    } else {
        window.LogicGate = LogicGate;
    }

})();
