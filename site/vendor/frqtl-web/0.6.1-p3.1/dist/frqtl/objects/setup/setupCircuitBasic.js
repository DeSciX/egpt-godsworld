/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupCircuitBasic — Engine-agnostic basic circuit experiment factory.
 * Battery -> wire -> probe A -> resistor -> probe B -> sink.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { LargeObject } from '../../parts/LargeObject.js';
import { QuantumEmitter } from '../objects/QuantumEmitter.js';
import { CircuitProbe } from '../objects/CircuitProbe.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';
import { CollisionActions } from '../../parts/CollisionActions.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────

    // ── Helpers ──────────────────────────────────────────────────────────

    /**
     * Create a horizontal or vertical wire (two parallel walls).
     * Returns array of LargeObject instances.
     */
    function createWire(universe, x1, y1, x2, y2, width, wallThickness, color) {
        color = color || [80, 80, 80];
        var walls = [];
        var dx = x2 - x1;
        var dy = y2 - y1;
        var isHorizontal = Math.abs(dx) >= Math.abs(dy);

        if (isHorizontal) {
            var left = Math.min(x1, x2);
            var right = Math.max(x1, x2);
            var centerY = (y1 + y2) / 2;
            var segLen = right - left;

            // Top wall
            walls.push(new LargeObject(
                universe,
                [left, centerY - width / 2 - wallThickness, segLen, wallThickness],
                CollisionTypes.WALL, [], 'TOP', 'bottom', null, 1, color
            ));
            // Bottom wall
            walls.push(new LargeObject(
                universe,
                [left, centerY + width / 2, segLen, wallThickness],
                CollisionTypes.WALL, [], 'BOTTOM', 'top', null, 1, color
            ));
        } else {
            var top = Math.min(y1, y2);
            var bottom = Math.max(y1, y2);
            var centerX = (x1 + x2) / 2;
            var segLen2 = bottom - top;

            // Left wall
            walls.push(new LargeObject(
                universe,
                [centerX - width / 2 - wallThickness, top, wallThickness, segLen2],
                CollisionTypes.WALL, [], 'LEFT', 'right', null, 1, color
            ));
            // Right wall
            walls.push(new LargeObject(
                universe,
                [centerX + width / 2, top, wallThickness, segLen2],
                CollisionTypes.WALL, [], 'RIGHT', 'left', null, 1, color
            ));
        }
        return walls;
    }

    /**
     * Create a battery (source emitter + sink absorber + seal walls).
     * Returns { emitter, sink, sourceMarker, sealWalls, setAmperage, setVoltage, setEnabled, isEnabled }.
     */
    function createBattery(universe, sourceX, sourceY, sinkX, sinkY, amperage, terminalSize, fundamentalDim, voltage, channelWidth, wallThickness) {
        var sourceColor = [255, 60, 60];
        var sinkColor = [60, 60, 255];
        var wallColor = [80, 80, 80];

        // Compute velocity direction
        var dx = sinkX - sourceX;
        var dy = sinkY - sourceY;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var vx = (dx / dist) * voltage;
        var vy = (dy / dist) * voltage;

        // Source emitter
        var sourceRect = [
            sourceX - terminalSize / 2, sourceY - terminalSize / 2,
            terminalSize, terminalSize
        ];

        var emitter = new QuantumEmitter(
            universe,
            [sourceRect],
            vx, vy,
            amperage,
            null,    // random charge
            true,    // auto_fire
            false,   // directional, not random
            Infinity,
            0
        );

        // Sink (absorber) — must span the FULL sealed channel cross-section.
        // A terminal-sized (8px) absorber inside a 10px channel let edge quanta
        // slip past it into the end-cap wall behind it and bounce back, filling
        // the right of the wire and building back-pressure across the resistor.
        // Sizing the absorber across the whole channel (oriented perpendicular to
        // flow) guarantees every quantum that reaches the terminal is removed.
        var sinkIsHorizontal = Math.abs(dx) >= Math.abs(dy);
        var sinkCross = channelWidth > 0 ? channelWidth + 2 * wallThickness : terminalSize;
        var sinkRect = sinkIsHorizontal
            ? [sinkX - terminalSize / 2, sinkY - sinkCross / 2, terminalSize, sinkCross]
            : [sinkX - sinkCross / 2, sinkY - terminalSize / 2, sinkCross, terminalSize];
        var sink = new LargeObject(
            universe,
            sinkRect,
            CollisionTypes.NONE, [CollisionActions.ABSORB], 'battery_sink', 'closest', null, 1, sinkColor
        );

        // Source visual marker
        var sourceMarker = new LargeObject(
            universe,
            [sourceX - terminalSize / 2, sourceY - terminalSize / 2, terminalSize, terminalSize],
            CollisionTypes.NONE, [], 'battery_source_marker', 'closest', null, 1, sourceColor
        );

        // Seal walls
        var sealWalls = [];
        if (channelWidth > 0) {
            var isHorizontal = Math.abs(dx) >= Math.abs(dy);
            var cw = channelWidth;
            var wt = wallThickness;
            var ts = terminalSize;

            if (isHorizontal) {
                var flowRight = dx > 0;

                // Source end-cap
                var capX = flowRight ? sourceX - ts / 2 - wt : sourceX + ts / 2;
                sealWalls.push(new LargeObject(
                    universe,
                    [capX, sourceY - cw / 2 - wt, wt, cw + 2 * wt],
                    CollisionTypes.WALL, [], flowRight ? 'LEFT' : 'RIGHT', flowRight ? 'right' : 'left', null, 1, wallColor
                ));

                // Source top/bottom walls
                var zoneLeft = sourceX - ts / 2;
                sealWalls.push(new LargeObject(
                    universe, [zoneLeft, sourceY - cw / 2 - wt, ts, wt],
                    CollisionTypes.WALL, [], 'TOP', 'bottom', null, 1, wallColor
                ));
                sealWalls.push(new LargeObject(
                    universe, [zoneLeft, sourceY + cw / 2, ts, wt],
                    CollisionTypes.WALL, [], 'BOTTOM', 'top', null, 1, wallColor
                ));

                // Sink end-cap
                var sinkCapX = flowRight ? sinkX + ts / 2 : sinkX - ts / 2 - wt;
                sealWalls.push(new LargeObject(
                    universe,
                    [sinkCapX, sinkY - cw / 2 - wt, wt, cw + 2 * wt],
                    CollisionTypes.WALL, [], flowRight ? 'RIGHT' : 'LEFT', flowRight ? 'left' : 'right', null, 1, wallColor
                ));

                // Sink top/bottom walls
                var sinkZoneLeft = sinkX - ts / 2;
                sealWalls.push(new LargeObject(
                    universe, [sinkZoneLeft, sinkY - cw / 2 - wt, ts, wt],
                    CollisionTypes.WALL, [], 'TOP', 'bottom', null, 1, wallColor
                ));
                sealWalls.push(new LargeObject(
                    universe, [sinkZoneLeft, sinkY + cw / 2, ts, wt],
                    CollisionTypes.WALL, [], 'BOTTOM', 'top', null, 1, wallColor
                ));
            } else {
                var flowDown = dy > 0;

                // Source end-cap
                var capY = flowDown ? sourceY - ts / 2 - wt : sourceY + ts / 2;
                sealWalls.push(new LargeObject(
                    universe,
                    [sourceX - cw / 2 - wt, capY, cw + 2 * wt, wt],
                    CollisionTypes.WALL, [], flowDown ? 'TOP' : 'BOTTOM', flowDown ? 'bottom' : 'top', null, 1, wallColor
                ));

                // Source left/right walls
                var zoneTop = sourceY - ts / 2;
                sealWalls.push(new LargeObject(
                    universe, [sourceX - cw / 2 - wt, zoneTop, wt, ts],
                    CollisionTypes.WALL, [], 'LEFT', 'right', null, 1, wallColor
                ));
                sealWalls.push(new LargeObject(
                    universe, [sourceX + cw / 2, zoneTop, wt, ts],
                    CollisionTypes.WALL, [], 'RIGHT', 'left', null, 1, wallColor
                ));

                // Sink end-cap
                var sinkCapY = flowDown ? sinkY + ts / 2 : sinkY - ts / 2 - wt;
                sealWalls.push(new LargeObject(
                    universe,
                    [sourceX - cw / 2 - wt, sinkCapY, cw + 2 * wt, wt],
                    CollisionTypes.WALL, [], flowDown ? 'BOTTOM' : 'TOP', flowDown ? 'top' : 'bottom', null, 1, wallColor
                ));

                // Sink left/right walls
                var sinkZoneTop = sinkY - ts / 2;
                sealWalls.push(new LargeObject(
                    universe, [sinkX - cw / 2 - wt, sinkZoneTop, wt, ts],
                    CollisionTypes.WALL, [], 'LEFT', 'right', null, 1, wallColor
                ));
                sealWalls.push(new LargeObject(
                    universe, [sinkX + cw / 2, sinkZoneTop, wt, ts],
                    CollisionTypes.WALL, [], 'RIGHT', 'left', null, 1, wallColor
                ));
            }
        }

        var currentAmperage = amperage;
        var currentVoltage = voltage;
        var enabled = true;

        var batteryObj = {
            emitter: emitter,
            sink: sink,
            sourceMarker: sourceMarker,
            sealWalls: sealWalls,
            enabled: enabled,
            setAmperage: function (amp) {
                currentAmperage = amp;
                emitter.setBurstSize(amp);
            },
            setVoltage: function (v) {
                currentVoltage = v;
                var ndx = sinkX - sourceX;
                var ndy = sinkY - sourceY;
                var ndist = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
                emitter.setVelocity((ndx / ndist) * v, (ndy / ndist) * v);
            },
            setEnabled: function (en) {
                enabled = en;
                batteryObj.enabled = en;
                emitter.setActive(en);
            },
            isEnabled: function () { return enabled; }
        };
        return batteryObj;
    }

    /**
     * Create a resistor (constriction walls).
     */
    function createResistor(universe, x, y, length, channelWidth, outerWidth, horizontal, wallThickness, color) {
        color = color || [140, 100, 50];
        var walls = [];
        if (horizontal) {
            var left = x - length / 2;
            var topWallH = (outerWidth - channelWidth) / 2;
            walls.push(new LargeObject(
                universe,
                [left, y - outerWidth / 2, length, topWallH],
                CollisionTypes.WALL, [], 'TOP', 'bottom', null, 1, color
            ));
            walls.push(new LargeObject(
                universe,
                [left, y + channelWidth / 2, length, topWallH],
                CollisionTypes.WALL, [], 'BOTTOM', 'top', null, 1, color
            ));
        } else {
            var top2 = y - length / 2;
            var leftWallW = (outerWidth - channelWidth) / 2;
            walls.push(new LargeObject(
                universe,
                [x - outerWidth / 2, top2, leftWallW, length],
                CollisionTypes.WALL, [], 'LEFT', 'right', null, 1, color
            ));
            walls.push(new LargeObject(
                universe,
                [x + channelWidth / 2, top2, leftWallW, length],
                CollisionTypes.WALL, [], 'RIGHT', 'left', null, 1, color
            ));
        }
        return walls;
    }

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create a basic circuit experiment: battery -> wire -> probeA -> resistor -> probeB -> sink.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM), not yet init'd
     * @param {Object} [options] - Configuration overrides
     * @param {number} [options.wireWidth=10] - Wire channel width
     * @param {number} [options.amperage=1] - Emission rate (particles per tick)
     * @param {number} [options.voltage=10] - Emission velocity
     * @param {number} [options.resistorWidth=4] - Resistor channel width
     * @returns {Object} { battery, probes, largeObjects }
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupCircuitBasic.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'amperage', 'emissionRate', 'resistorWidth', 'voltage',
        'wireWidth',
    ];

    function setupCircuitBasic(universe, options) {
        options = _assertSetupOptions('setupCircuitBasic', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupCircuitBasic universe.universe_rect', canvas_rect);

        var wireWidth = options.wireWidth || 10;
        // 1 amp now means 10 quanta/tick (was 1). More emitted current → real
        // crowding/back-pressure at the resistor gap instead of a thin trickle.
        var QUANTA_PER_AMP = 10;
        var amperage = (options.amperage || options.emissionRate || 1) * QUANTA_PER_AMP;
        var voltage = options.voltage || 10;
        var resistorWidth = options.resistorWidth || 4;
        var fundamentalDim = 0;
        var wallThickness = 3;

        // Init universe: ground-up mode with brownian motion
        universe.init(fundamentalDim, { wavelengthScale: 1 });
        universe.brownianMotion = true;
        universe.withInterQuantumCollisions = true;

        // Layout constants (matching WASM adapter exactly)
        var margin = 40;
        var centerY = Math.round(canvas_rect.h / 2);
        var wireLeft = margin;
        var wireRight = canvas_rect.w - margin;
        var wireLen = wireRight - wireLeft;

        var batSourceX = wireLeft + 10;
        var probeAX = wireLeft + Math.round(wireLen * 0.3);
        var resistorX = wireLeft + Math.round(wireLen * 0.5);
        var probeBX = wireLeft + Math.round(wireLen * 0.7);
        var batSinkX = wireRight - 10;

        // Main wire tube
        var wireWalls = createWire(universe, wireLeft, centerY, wireRight, centerY, wireWidth, wallThickness);

        // Battery
        var battery = createBattery(
            universe,
            batSourceX, centerY,
            batSinkX, centerY,
            amperage,
            wireWidth - 2,
            fundamentalDim,
            voltage,
            wireWidth,
            wallThickness
        );

        // Probes
        var probeA = new CircuitProbe(universe, probeAX, centerY, wireWidth, 'before_resistor');
        var probeB = new CircuitProbe(universe, probeBX, centerY, wireWidth, 'after_resistor');

        // Resistor
        var resistorWalls = createResistor(
            universe, resistorX, centerY, 20, resistorWidth, wireWidth, true, wallThickness
        );

        // Right-end drain (absorber). Quanta that have crossed the resistor are
        // removed at the RIGHT END of the wire (full channel cross-section,
        // extending to the true wire end past the terminal) rather than bouncing
        // off the terminator and back-filling the wire. Registered for collisions
        // but intentionally NOT rendered (kept invisible).
        var drainLeft = wireLeft + Math.round(wireLen * 0.88);
        var drainRight = wireRight;
        var drainW = Math.max(1, drainRight - drainLeft);
        var drain = new LargeObject(
            universe,
            [drainLeft, centerY - (wireWidth / 2 + wallThickness), drainW, wireWidth + 2 * wallThickness],
            CollisionTypes.NONE, [CollisionActions.ABSORB], 'RIGHT_drain', 'closest', null, 1, [40, 40, 70]
        );

        // Evaluation tick function: sample probes each tick
        universe.experimentTickFunctions.push(function () {
            probeA.queryDensity();
            probeB.queryDensity();
            return [];
        });

        var gateThreshold = 3;

        // Collect all large objects for rendering
        var largeObjects = [];
        largeObjects.push.apply(largeObjects, wireWalls);
        largeObjects.push(battery.sink);
        largeObjects.push(battery.sourceMarker);
        largeObjects.push.apply(largeObjects, battery.sealWalls);
        largeObjects.push.apply(largeObjects, resistorWalls);
        largeObjects.push(probeA.marker);
        largeObjects.push(probeB.marker);

        return {
            battery: battery,
            drain: drain,
            probes: { before_resistor: probeA, after_resistor: probeB },
            wireWalls: wireWalls,
            resistorWalls: resistorWalls,
            setBatteryAmperage: function (amp) { battery.setAmperage(amp); },
            setBatteryVoltage: function (v) { battery.setVoltage(v); },
            getCircuitState: function () {
                var state = {};
                var probeMap = { before_resistor: probeA, after_resistor: probeB };
                for (var name in probeMap) {
                    if (probeMap.hasOwnProperty(name)) {
                        var probe = probeMap[name];
                        state[name] = {
                            flowRate: probe.getFlowRate(),
                            lastCount: probe.getLastCount(),
                            isHigh: probe.isHigh(gateThreshold)
                        };
                    }
                }
                return state;
            },
            largeObjects: largeObjects
        };
    }

    // ── Statics (reusable helpers) ──────────────────────────────────────

    setupCircuitBasic.createWire = createWire;
    setupCircuitBasic.createBattery = createBattery;
    setupCircuitBasic.createResistor = createResistor;

    // ── Export ───────────────────────────────────────────────────────────

    setupCircuitBasic.OPTIONS = OPTIONS;

    export { setupCircuitBasic, createWire, createBattery, createResistor };

