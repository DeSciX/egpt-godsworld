/* Copyright 2023-2026 by Essam Abadir */

/**
 * @file CircuitGate — density-activated gate for circuit experiments.
 *
 * A gate body is a {@link LargeObject} rectangle that sits across a wire
 * channel.  When closed it has collision type `WALL` and blocks quanta; when
 * open it has collision type `NONE` and quanta pass through freely.  Gate
 * state is decided by sampling particle density in one or more control regions
 * via `universe.queryRect()` and applying the gate's Boolean function to the
 * resulting HIGH/LOW signals.
 *
 * Supported gate types: `AND`, `OR`, `NOT`, `XOR`, `BUFFER`.
 *
 * ## What you can drive
 *
 * | Parameter | Default | Observable effect |
 * |-----------|---------|-------------------|
 * | `thresholdHigh` | `2` | Average quanta per tick in a control region required to call that input HIGH.  Raising it demands a denser particle stream before the gate responds. |
 * | `thresholdLow`  | `1` | Average below which a HIGH input reverts to LOW (hysteresis).  Must be < `thresholdHigh`; gap determines stability of the open state under noise. |
 * | `windowTicks`   | `20` | Sliding-window length in ticks for the density average.  Longer windows produce stable gates that are slower to react to input changes; shorter windows react quickly but can chatter. |
 * | `gateType`      | — | Determines which Boolean function is applied to the control-region states.  `XOR` is currently the only type with XOR-specific hysteresis; all others use symmetric thresholding. |
 *
 * **NOT gate:** starts open by default and creates an internal `QuantumEmitter`
 * (`notEmitter`) that fires while the gate is open.  `notEmissionRate` controls
 * its burst size (default 2).
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

import { LargeObject } from '../../parts/LargeObject.js';
import { QuantumEmitter } from './QuantumEmitter.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';
import { registerKind } from '../kinds.js';

    var rectToArray = LargeObject.rectToArray;

    // ── CircuitGate ─────────────────────────────────────────────────────

    /**
     * Density-activated gate for circuit experiments.
     *
     * @param {Object} universe - Engine universe instance (JS or WASM).
     * @param {string} gateType - Gate logic: `'AND'`, `'OR'`, `'NOT'`, `'XOR'`, or `'BUFFER'`.
     * @param {number} x - Gate body center X (pixels).
     * @param {number} y - Gate body center Y (pixels).
     * @param {number} signalWidth - Height (horizontal gate) or width (vertical gate) of the
     *   wire channel the gate body spans.
     * @param {number} gateLength - Length of the gate body along the flow axis.
     * @param {boolean} horizontal - `true` for left-to-right flow (most common); `false`
     *   for top-to-bottom flow.
     * @param {Object} [options]
     * @param {number} [options.thresholdHigh=2] - Density average (quanta/tick over
     *   `windowTicks`) required to declare a control input HIGH.  Raising this requires a
     *   denser particle stream; see the "What you can drive" block in the file JSDoc.
     * @param {number} [options.thresholdLow=1] - Density average below which a HIGH control
     *   input reverts to LOW.  Must be < `thresholdHigh`.
     * @param {number} [options.windowTicks=20] - Sliding-window length in ticks for density
     *   averaging.  Longer windows are more stable but slower to track input changes.
     * @param {number} [options.fundamentalDim=0] - Currently unused (reserved for multi-
     *   dimension addressing).  Has no observable effect.
     * @param {number} [options.notEmissionRate=2] - Burst size of the internal emitter
     *   created for NOT gates.  Unused for all other gate types.
     */
    function CircuitGate(universe, gateType, x, y, signalWidth, gateLength, horizontal, options) {
        signalWidth = (signalWidth !== undefined) ? signalWidth : 6;
        gateLength = (gateLength !== undefined) ? gateLength : 4;
        horizontal = (horizontal !== undefined) ? horizontal : true;
        options = options || {};

        this.universe = universe;
        this._schemaKind = 'CircuitGate';
        this.gateType = gateType.toUpperCase();
        this.x = x;
        this.y = y;
        this.signalWidth = signalWidth;
        this.gateLength = gateLength;
        this.horizontal = horizontal;

        this.thresholdHigh = options.thresholdHigh || 2;
        this.thresholdLow = options.thresholdLow || 1;
        this.windowTicks = options.windowTicks || 20;
        this.fundamentalDim = options.fundamentalDim || 0;
        this.notEmissionRate = options.notEmissionRate || 2;

        this.controlRegions = [];
        this.controlCounts = [];
        this._controlStates = [];
        this.isOpen = (this.gateType === 'NOT');

        // Create gate body LargeObject
        var rect;
        if (horizontal) {
            rect = [x - gateLength / 2, y - signalWidth / 2, gateLength, signalWidth];
        } else {
            rect = [x - signalWidth / 2, y - gateLength / 2, signalWidth, gateLength];
        }

        // G2: Always compile the WALL program into the gate body (actionCompiler compiles
        // WALL eject ops from collision_type=WALL). The gate starts as a wall (WALL program
        // compiled + active). NOT gate then immediately setActive(false) to start open.
        // Toggle uses setActive() — no runtime collision_type change needed.
        var reposition = horizontal ? 'left' : 'top';

        this.gateBody = new LargeObject(
            universe, rect, CollisionTypes.WALL, [], 'gate_' + this.gateType, reposition
        );

        // NOT gate starts open — disable the LO (pass-through).
        if (this.gateType === 'NOT') {
            this.gateBody.setActive(false);
        }

        this.color = (this.gateType === 'NOT') ? [50, 200, 50] : [200, 200, 50];

        // NOT gate creates an internal emitter
        this.notEmitter = null;
        if (this.gateType === 'NOT') {
            this._createNotEmitter(options);
        }

        // THE ONE UP-LINK: the gate composed its body LO and (NOT) its emitter. Zero behavior change.
        this.gateBody._owner = this;
        if (this.notEmitter !== null) { this.notEmitter._owner = this; }
    }

    /**
     * Create the NOT gate's internal emitter that fires when the gate is open.
     * @private
     */
    /**
     * Full teardown of what this gate composed: the NOT emitter (splices its host tick-fn) and
     * the gate body LO. Idempotent (each member guards itself).
     */
    CircuitGate.prototype.dispose = function () {
        if (this.notEmitter) { this.notEmitter.dispose(); }
        this.gateBody.dispose();
    };

    CircuitGate.prototype._createNotEmitter = function (options) {
        var ts = 4;
        var emitX, emitY;
        if (this.horizontal) {
            emitX = this.x + this.gateLength / 2 + ts;
            emitY = this.y;
        } else {
            emitX = this.x;
            emitY = this.y + this.gateLength / 2 + ts;
        }

        this.notEmitter = new QuantumEmitter(
            this.universe,
            [[emitX - ts / 2, emitY - ts / 2, ts, ts]],
            0, 0,                // vx, vy
            this.notEmissionRate, // burst_size
            null,                // charge (random)
            this.isOpen,         // auto_fire (NOT gate defaults open)
            true,                // random_direction
            Infinity,            // quantum_limit
            0                    // delay
        );
    };

    /**
     * Add a control input region.
     * @param {Array|Object} rect - [left, top, w, h] or {left,top,w,h}
     */
    CircuitGate.prototype.addControlRegion = function (rect) {
        var r = rectToArray(rect);
        this.controlRegions.push(r);
        this.controlCounts.push([]);
        this._controlStates.push(false);
    };

    /**
     * Evaluate gate state using density queries. Must be called once per tick.
     */
    CircuitGate.prototype.evaluate = function () {
        var i, r, count, avg;

        // Update control states from density queries
        for (i = 0; i < this.controlRegions.length; i++) {
            r = this.controlRegions[i];
            count = this.universe.queryRect(r[0], r[1], r[2], r[3]);

            this.controlCounts[i].push(count);
            if (this.controlCounts[i].length > this.windowTicks) {
                this.controlCounts[i].shift();
            }

            var sum = 0;
            for (var j = 0; j < this.controlCounts[i].length; j++) {
                sum += this.controlCounts[i][j];
            }
            avg = sum / this.controlCounts[i].length;

            if (this._controlStates[i] && avg < this.thresholdLow) {
                this._controlStates[i] = false;
            } else if (!this._controlStates[i] && avg >= this.thresholdHigh) {
                this._controlStates[i] = true;
            }
        }

        // Evaluate gate logic
        var shouldOpen;
        var states = this._controlStates;

        switch (this.gateType) {
            case 'NOT':
                shouldOpen = states.length > 0 ? !states[0] : true;
                break;
            case 'AND':
                shouldOpen = states.length >= 2 ? (states[0] && states[1]) : false;
                break;
            case 'OR':
                shouldOpen = states.length >= 2 ? (states[0] || states[1]) : false;
                break;
            case 'XOR':
                shouldOpen = states.length >= 2 ? (states[0] !== states[1]) : false;
                break;
            case 'BUFFER':
                shouldOpen = states.length > 0 ? states[0] : false;
                break;
            default:
                shouldOpen = false;
        }

        // Toggle gate body active state if logic state changed.
        // G2: gate uses setActive() instead of setCollisionType() — the WALL eject
        // program is compiled at init time; active=false makes the gate passthrough,
        // active=true re-enables the WALL eject.
        if (shouldOpen !== this.isOpen) {
            this.isOpen = shouldOpen;
            if (this.isOpen) {
                this.gateBody.setActive(false);
                this.color = [50, 200, 50];
            } else {
                this.gateBody.setActive(true);
                this.color = [200, 50, 50];
            }
        }

        // Toggle NOT emitter
        if (this.notEmitter !== null) {
            this.notEmitter.setActive(this.isOpen);
        }
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults, builder ──────────

    /**
     * CircuitGate — Density-activated logic gate for circuit experiments.
     * Constructor: CircuitGate(universe, gateType, x, y, signalWidth, gateLength,
     *                          horizontal, options)
     * options: { thresholdHigh, thresholdLow, windowTicks, fundamentalDim, notEmissionRate }
     * Group wrapper: the inner gateBody LargeObject (and optional notEmitter for NOT gates)
     * are stamped with the ONE up-link `_owner` = <this>.
     */
    var CircuitGateDescriptor = {
        description: 'A density-activated logic gate for quantum circuit experiments. ' +
            'Evaluates gate logic (AND, OR, NOT, XOR, BUFFER) by querying particle density ' +
            'in control regions, then toggles the gate body\'s collision type to open/close. ' +
            'Demonstrates how classical Boolean logic emerges from particle density thresholds. ' +
            'NOT gates include an internal emitter that fires when no input signal is present.',
        fields: [
            {
                name: 'gateType',
                type: 'enum',
                constraint: { values: { AND: 'AND', OR: 'OR', NOT: 'NOT', XOR: 'XOR', BUFFER: 'BUFFER' } },
                engineVisible: false,
                description: 'Gate logic type. AND/OR/XOR use two control regions; NOT/BUFFER use one. ' +
                    'Gate body is WALL (closed/blocking) when logic output is false, NONE (open) when true.'
            },
            {
                name: 'x',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Gate body center X (physics pixels).'
            },
            {
                name: 'y',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Gate body center Y (physics pixels).'
            },
            {
                name: 'signalWidth',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Height/width of the signal channel through the gate (physics pixels, default 6).'
            },
            {
                name: 'gateLength',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Length of the gate body along the flow direction (physics pixels, default 4).'
            },
            {
                name: 'horizontal',
                type: 'boolean',
                engineVisible: true,
                description: 'Flow direction: true = particles flow horizontally (left→right); false = vertically (top→bottom).'
            },
            {
                name: 'thresholdHigh',
                type: 'number',
                constraint: { min: 0, integer: false },
                engineVisible: false,
                description: 'Average density (over windowTicks) above which a control region is considered HIGH (logic 1). Default 2.'
            },
            {
                name: 'thresholdLow',
                type: 'number',
                constraint: { min: 0, integer: false },
                engineVisible: false,
                description: 'Average density below which a control region returns to LOW (logic 0). Default 1. ' +
                    'Hysteresis band = [thresholdLow, thresholdHigh] prevents rapid toggling.'
            },
            {
                name: 'windowTicks',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                description: 'Sliding window size (ticks) for density averaging (default 20). ' +
                    'Larger values smooth burst fluctuations; smaller values make the gate more responsive.'
            },
            {
                name: 'notEmissionRate',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                description: 'Burst size of the NOT gate\'s internal emitter (particles/burst, default 2). Only applies to gateType NOT.'
            }
        ]
    };

    registerKind(CircuitGate, {
        from: import.meta.url,
        descriptor: CircuitGateDescriptor,
        defaults: {
        gateType: 'AND',
        x: 100, y: 100,
        signalWidth: 6,
        gateLength: 4,
        horizontal: true,
        thresholdHigh: 2,
        thresholdLow: 1,
        windowTicks: 20,
        notEmissionRate: 2
        },
        build: function (props, ctx, Class) {
            var CGateCls = Class;   // the class that registered (a composed fork's own class)
            var cg = new CGateCls(
                ctx.runner.universe,
                props.gateType   || 'AND',
                props.x          != null ? props.x         : Math.round(ctx.x),
                props.y          != null ? props.y         : Math.round(ctx.y),
                props.signalWidth || 6,
                props.gateLength  || 4,
                props.horizontal  != null ? props.horizontal  : true,
                {
                    thresholdHigh:   props.thresholdHigh   != null ? props.thresholdHigh   : 2,
                    thresholdLow:    props.thresholdLow    != null ? props.thresholdLow    : 1,
                    windowTicks:     props.windowTicks     != null ? props.windowTicks     : 20,
                    notEmissionRate: props.notEmissionRate != null ? props.notEmissionRate : 2
                }
            );
            cg._schemaKind = Class.name;
            return cg;
        }
    });

    // ── Export ───────────────────────────────────────────────────────────

    export { CircuitGate };

