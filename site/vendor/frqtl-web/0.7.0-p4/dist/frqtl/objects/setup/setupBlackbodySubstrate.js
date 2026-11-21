/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupBlackbodySubstrate — Blackbody experiment reconstructed under the
 * as-intended control loop.
 *
 * ## One-line OvenBox difference from the blackbody showcase scene (config a vs config b)
 *
 * Both configs use the SAME revised OvenBox sugar (walls = NONE + eject op-programs,
 * emitters, slit preserved).  Apart from the `temperature` VALUE (the scene's
 * TEMPERATURE = 1500, this factory's default 300), the ONLY OvenBox option that differs
 * is the thermostat count source:
 *
 *   config a (the blackbody scene) : OvenBox default   → countSource = 'active-quanta'
 *   config b (THIS FILE)           : ONE extra option  → countSource = 'oven-rect'
 *
 * Outside the OvenBox: the scene seats its sink at the canvas edge (30 px); this factory
 * seats it flush against the outer wall unless `radiationSinkDepth` is given.
 *
 * With `countSource:'oven-rect'`, OvenBox internally registers an oven-interior
 * counter-LO whose `on:'collision'` op-program increments `self.count` for every
 * frame inside the cavity each tick.  The between-tick `thermostatStep(tickData)`
 * method reads the count, resets it, and CRUDs emitters (as-intended §2.1).
 *
 * ## Layer flags (test isolation)
 *
 * These flags are forwarded to OvenBox and control which op-programs are applied:
 *
 * - **`options.layer3=true`** (default): cavity walls carry eject op-programs
 *   (L3 block — §10.3 expressiveness proof, conformance EP22–EP25).
 * - **`options.layer4=true`** (default, implies layer3): adds velocity-flip ops
 *   (L4 bounce = L3 eject + flip, conformance EP27–EP28).
 * - **`options.layer5=true`** (default): enables `universe.withInterQuantumCollisions=true`
 *   — as the blackbody showcase scene sets it.  ENGINE physics; no new
 *   op-programs.  Expected JS↔WASM divergence on parent-frame count (deferred §6).
 *
 * Set any flag to `false` only for progressive test isolation (L1/L2/L3 runs).  The default (all true) runs the
 * scene's flags (brownian on, inter-quantum collisions on).
 *
 * ## Thermostat control loop (as-intended §2.1, Dispatch C2)
 *
 * ① IN-TICK (native, collision-driven):
 *   OvenBox registers an oven-interior LargeObject (rect = cavity interior,
 *   collision_type NONE) with on:'collision' op-program:
 *     set self.count = self.count + 1
 *   This counts cavity occupancy IN-TICK, bit-identical across JS↔WASM.
 *
 * ② doTick() MARSHALS: TickData.objects[ovenHandle].count = frames-in-cavity.
 *
 * ③ BETWEEN TICKS (user-space, single-source — OvenBox.thermostatStep):
 *   a. Reset count = 0 via updateObjectProperty.
 *   b. Read cavityCount = tickData.objects[ovenHandle].count (B5.1, B2.1).
 *   c. burst = cavityCount < target ? max(1, floor((target-cavityCount)/N)) : 0
 *   d. CRUD emitters via updateObjectProperty.
 *
 * ④ Loop.
 *
 * B2.1: cavityCount is read ONLY from tickData.objects[ovenHandle].count.
 * getLargeObjectCount is DELETED (see wasm-engine.js) — no parallel read path.
 *
 * @param {Object} universe - The engine universe instance (JS or WASM).
 * @param {Object} [options]
 * @param {number} [options.temperature=300] - Target cavity quanta count.
 * @param {number} [options.boxFraction=1/3]
 * @param {number} [options.wallThickness=10]
 * @param {number} [options.slitHeight=60]
 * @param {string} [options.slitWall='right']
 * @param {number} [options.radiationSinkDepth] - If provided, places sink at canvas
 *   edge at this depth.  If omitted, sink is placed flush against the outer box wall
 *   for immediate absorption of escaped radiation (ratio → 1.0).
 * @param {number} [options.fundamental_dim=0]
 * @param {number} [options.quantum_dim=4]
 * @param {boolean} [options.layer3=true] - Eject op-programs on walls (L3 block).
 * @param {boolean} [options.layer4=true] - Velocity-flip ops (L4 bounce, implies L3).
 * @param {boolean} [options.layer5=true] - Enable withInterQuantumCollisions=true.
 *
 * @returns {{
 *   box:           OvenBox,
 *   emitters:      QuantumEmitter[],
 *   ovenHandle:    number,
 *   target:        number,
 *   thermostatStep: function(tickData:object):void,
 *   setTemperature: function(n:number):void,
 *   getTemperature: function():number,
 *   radiationSink: LargeObject|null,
 *   largeObjects:  LargeObject[]
 * }}
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { OvenBox } from '../../parts/OvenBox.js';
import { Rectangle } from '../../parts/Rectangle.js';
import { LargeObject } from '../../parts/LargeObject.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';
import { CollisionActions } from '../../parts/CollisionActions.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────

    // ── Setup Factory ───────────────────────────────────────────────────
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupBlackbodySubstrate.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'boxFraction', 'fundamental_dim', 'layer3', 'layer4',
        'layer5', 'quantum_dim', 'radiationSinkDepth', 'slitHeight',
        'slitWall', 'temperature', 'wallThickness',
    ];

    function setupBlackbodySubstrate(universe, options) {
        options = _assertSetupOptions('setupBlackbodySubstrate', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupBlackbodySubstrate universe.universe_rect', canvas_rect);

        var fundamental_dim = options.fundamental_dim !== undefined ? options.fundamental_dim : 0;
        var quantum_dim     = options.quantum_dim     !== undefined ? options.quantum_dim     : 4;
        var temperature     = options.temperature     !== undefined ? options.temperature     : 300;
        var boxFraction     = options.boxFraction     !== undefined ? options.boxFraction     : 1 / 3;
        var wallThickness   = options.wallThickness   !== undefined ? options.wallThickness   : 10;
        var slitHeight      = options.slitHeight      !== undefined ? options.slitHeight      : 60;
        var slitWall        = options.slitWall        !== undefined ? options.slitWall        : 'right';

        // ── L5: parenting / promotion flag ──────────────────────────────
        // L5 is on by default (matching the blackbody scene). Set layer5:false
        // to run without inter-quantum collisions (L1/L2/L3/L4 only).
        var USE_L5 = options.layer5 !== undefined ? options.layer5 : true;

        // ── Universe init ─────────────────────────────────────────────────
        universe.init(fundamental_dim, { wavelengthScale: 1 });
        universe.brownianMotion = true;
        // L5: enable inter-quantum collisions → merge → promotion (compound/parent frames).
        // Matches the blackbody scene. Diverges JS↔WASM on parent count
        // — expected (deferred quadtree/promotion workstream, handoff §6).
        universe.withInterQuantumCollisions = USE_L5 ? true : false;

        if (quantum_dim && quantum_dim > fundamental_dim) {
            universe.addDimension(quantum_dim);
        }

        var screenCenterX = Math.round(canvas_rect.w / 2);
        var screenCenterY = Math.round(canvas_rect.h / 2);
        var boxW = Math.round(canvas_rect.w * boxFraction);
        var boxH = Math.round(canvas_rect.h * boxFraction);

        var outerRect  = new Rectangle(screenCenterX, screenCenterY, boxW, boxH, null, true);
        var innerLeft  = outerRect.left + wallThickness;
        var innerTop   = outerRect.top  + wallThickness;
        var innerW     = outerRect.w    - 2 * wallThickness;
        var innerH     = outerRect.h    - 2 * wallThickness;

        // ── OvenBox (config b — the ONE distinguishing config line) ──────────
        //
        // countSource: 'oven-rect' is the ONLY difference from config a.
        // Config a (the blackbody scene) passes no countSource → OvenBox defaults
        // to 'active-quanta'.  Config b passes countSource: 'oven-rect'.
        //
        // OvenBox handles internally:
        //   - walls: NONE + eject op-programs (L3/L4 per layer3/layer4 flags)
        //   - emitters: 4 inward-firing (auto_fire=false)
        //   - oven-rect counter-LO registration (countSource='oven-rect')
        //   - thermostatStep(tickData) method (countSource='oven-rect')
        var oven = new OvenBox(universe, {
            left:          innerLeft,
            top:           innerTop,
            width:         innerW,
            height:        innerH,
            wallThickness: wallThickness,
            temperature:   temperature,
            slitHeight:    slitHeight,
            slitWall:      slitWall,
            color:         [120, 120, 120],
            countSource:   'oven-rect',          // ← the ONE config line (b vs a)
            layer3:        options.layer3 !== undefined ? options.layer3 : true,
            layer4:        options.layer4 !== undefined ? options.layer4 : true
        });

        // ── Radiation sink ─────────────────────────────────────────────────
        // Absorb escaped quanta to prevent them inflating activeQuanta without bound.
        //
        // Sink is placed flush against the outer box wall (not at the canvas edge) so
        // that escaped frames are absorbed within 1 tick, keeping aq ≈ cavity count
        // (ratio → 1.0). Default: flush against outer wall.  Callers may override via
        // options.radiationSinkDepth (places sink at canvas edge at given depth).
        var radiationSink = null;
        var sinkRect = null;
        if (slitWall === 'right') {
            var sinkLeft = options.radiationSinkDepth !== undefined
                ? canvas_rect.w - options.radiationSinkDepth
                : outerRect.right;
            sinkRect = [sinkLeft, 0, canvas_rect.w - sinkLeft, canvas_rect.h];
        } else if (slitWall === 'left') {
            var sinkRight = options.radiationSinkDepth !== undefined
                ? options.radiationSinkDepth
                : outerRect.left;
            sinkRect = [0, 0, sinkRight, canvas_rect.h];
        } else if (slitWall === 'top') {
            var sinkBottom = options.radiationSinkDepth !== undefined
                ? options.radiationSinkDepth
                : outerRect.top;
            sinkRect = [0, 0, canvas_rect.w, sinkBottom];
        } else if (slitWall === 'bottom') {
            var sinkTop = options.radiationSinkDepth !== undefined
                ? canvas_rect.h - options.radiationSinkDepth
                : outerRect.bottom;
            sinkRect = [0, sinkTop, canvas_rect.w, canvas_rect.h - sinkTop];
        }
        if (sinkRect && LargeObject && CollisionTypes && CollisionActions) {
            radiationSink = new LargeObject(
                universe, sinkRect,
                CollisionTypes.NONE, [CollisionActions.ABSORB],
                'radiation_sink', 'closest', null, 1, [0, 0, 0]
            );
        }

        return {
            box:            oven,
            emitters:       oven.emitters,
            ovenHandle:     oven.ovenHandle,
            target:         temperature,
            thermostatStep: oven.thermostatStep,
            setTemperature: function (newTarget) { oven.setTemperature(newTarget); },
            getTemperature: function ()           { return oven.getTemperature(); },
            radiationSink:  radiationSink,
            largeObjects:   oven.walls
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupBlackbodySubstrate.OPTIONS = OPTIONS;

    export { setupBlackbodySubstrate };

