/* Copyright 2023-2026 by Essam Abadir */

/**
 * OvenBox — Engine-agnostic thermostat box for blackbody experiments.
 *
 * Creates a [`Box`](./Box.js) with four inward-firing wall emitters, eject
 * op-programs on every wall (§10.3 — bit-identical to native BOUNCE/WALL, proven
 * EP21–EP28), and a configurable thermostat that holds the cavity at a target
 * quanta count.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 *
 * ## Walls — op-programs, not native CollisionTypes.WALL
 *
 * Every wall is registered as `collision_type: NONE` with an `on:'collision'`
 * op-program that implements block (L3) + velocity-flip (L4) via pure Bin/Ref/Lit
 * AST expressions.  This is §10.3 expressiveness proof (conformance EP21–EP28):
 * the op-program output is **bit-identical** to the native WALL eject on both
 * JS and WASM engines.  No native `CollisionType.WALL` / `CollisionActions` are
 * used on the walls themselves.
 *
 * The slit opening (the radiation aperture) is preserved exactly as before — the
 * Box helper creates the top/bottom slit liner segments in the usual way, each
 * getting the same eject+velocity-flip program as the solid walls.
 *
 * Pass `options.layer3 = false` to disable eject op-programs (L1/L2 test mode —
 * all walls become pass-through NONE without any program).  Pass
 * `options.layer4 = false` to apply L3 block only without the velocity flip.
 *
 * ## Thermostat — configurable count source
 *
 * The thermostat has two count sources, selected by `options.countSource`:
 *
 * ### `countSource: 'active-quanta'` (default — config a)
 *
 * `getTemperatureTickFunction()` returns a tick function that reads
 * `universe.activeQuanta` each tick and directly CRUDs the four emitters.
 * Push this into `universe.experimentTickFunctions` as scenes/blackbody.js already
 * does — no other wiring needed.
 *
 * ### `countSource: 'oven-rect'` (config b — the "better oven")
 *
 * OvenBox internally builds an **oven-interior counter-LO** as a `Wall`
 * (the Tunnel exit-gate / Tube open-end-sink shape — a physics-only region
 * that is genuinely in the world, not a headless-only raw registration):
 *   - rect = the cavity interior  (innerLeft, innerTop, innerW, innerH)
 *   - `collisionBehavior: 'nothing'`, `visible: false` — collides with
 *     nothing and is never drawn (a box over the cavity would read as an
 *     obstruction that is not there)
 *   - on:'collision' op-program attached after construction, through the
 *     same `applyProgramTrigger` authority Tunnel's `_applyExitGateProgram`
 *     uses: `set self.count = self.count + 1`
 *
 * The op-program counts cavity occupancy natively in-tick, bit-identical
 * across JS↔WASM.  `this.ovenHandle` stores the counter Wall's LO handle.
 *
 * `thermostatStep(tickData)` is the between-tick controller:
 *   a. Reset `count` = 0 via `updateObjectProperty` (so next tick starts fresh).
 *   b. Read `cavityCount = tickData.objects[ovenHandle].count`.
 *   c. Compute burst per emitter.
 *   d. Drive the emitters via their own setters (`setBurstSize`/`setActive`) —
 *      `QuantumEmitter` is sugar that owns its `emState`; there is no provider
 *      emitter ABI to route a `updateObjectProperty` write to.
 *
 * Call `thermostatStep(tickData)` after every `doTick()` call in your harness.
 * `getTemperatureTickFunction()` is NOT applicable for this count source — it
 * throws an explicit error if called with countSource='oven-rect'.
 *
 * ## What you can drive
 *
 * - **`options.temperature`** is the thermostat set-point. Call
 *   `setTemperature(n)` to change it live.
 * - **`options.slitHeight`** controls the slit aperture in the slit wall.
 * - **`options.slitWall`** picks which wall face ('right' | 'left' | 'top' |
 *   'bottom') carries the slit. Default: `'right'`.
 *
 * OBSERVED (seed 42, tick 600, engine=js): temperature 300–4000 transitions
 * the cavity from sparse leaf dots to near-saturated compound-frame packing.
 */

import { Box } from '../objects/objects/Box.js';
import { QuantumEmitter } from '../objects/objects/QuantumEmitter.js';
import { LargeObject } from './LargeObject.js';
import { CollisionTypes } from './CollisionTypes.js';
import { CollisionActions } from './CollisionActions.js';
import { Wall } from './Wall.js';
import * as AstSchema from '../../shim/expr/ast-schema.js';
import * as ActionCompiler from '../objects/objects/actionCompiler.js';
import { registerKind } from '../objects/kinds.js';

    // ── Eject op-program builder (§10.3) ─────────────────────────────────

    /**
     * Build the collision op-program for a wall.
     *
     * L3 (block): repositions the frame just outside the wall via a set-expression
     * on frame.left or frame.top.  Bit-identical to native WALL eject (EP22–EP25).
     *
     * L4 (bounce): appends a velocity-flip op (0 - vx or 0 - vy depending on wall
     * axis).  Bit-identical to native BOUNCE (EP27–EP28).
     *
     * @param {string} reposition - 'left' | 'right' | 'top' | 'bottom' | 'closest'
     * @param {string} wallName   - Wall identifier, e.g. 'TOP', 'RIGHT_T', 'LEFT_B'
     * @param {boolean} withBounce - true = L4 (eject + velocity flip); false = L3 only
     * @returns {{ on: 'collision', ops: Array }|null}  null when reposition='closest'
     */
    function makeEjectProgram(reposition, wallName, withBounce) {
        var ast = AstSchema;
        var Lit          = ast.Lit;
        var Ref          = ast.Ref;
        var Bin          = ast.Bin;
        var Cmp          = ast.Cmp;
        var Cond         = ast.Cond;
        var Fn           = ast.Fn;
        var HANDLE_FRAME = ast.HANDLE_FRAME;   // 0
        var HANDLE_SELF  = ast.HANDLE_SELF;    // 1

        var ops = [];
        var ejectFlip = ActionCompiler;

        // ── L3: reposition (eject) op ────────────────────────────────────
        // Q-L1-4 DRY: formulas now come from the shared actionCompiler authority
        // (bit-identical output — same Bin/Ref AST this function used to build inline).
        var ejectOps = ejectFlip.buildEjectOps(reposition, HANDLE_FRAME, HANDLE_SELF, Lit, Ref, Bin, Cmp, Cond, Fn);
        if (!ejectOps) {
            // 'closest' or unknown — no eject program
            return null;
        }
        for (var ei = 0; ei < ejectOps.length; ei++) ops.push(ejectOps[ei]);

        // ── L4: velocity-flip op ─────────────────────────────────────────
        // Q-L1-4 DRY: shared authority (native BOUNCE flip formula).
        if (withBounce) {
            var flipOp = ejectFlip.buildVelocityFlipOp(wallName, HANDLE_FRAME, Lit, Ref, Bin);
            if (flipOp) ops.push(flipOp);
        }

        if (ops.length === 0) return null;

        // G2b: attach the program-level trigger (single authority: actionCompiler).
        // The trigger is evaluated ONCE in run_op_program_with_frame BEFORE any ops modify
        // the scope. This prevents the per-op Cond bug where the eject op's scope write
        // caused the bounce op's intersects check to return false (G2b per-op Cond bug,
        // 2026-06-25).
        //
        // OvenBox walls use withPastEdge=true because in G2 the native is_frame_past_wall()
        // check fired on any LO whose name matched 'LEFT'/'RIGHT'/'TOP'/'BOTTOM' (which
        // OvenBox walls do via Box.js naming).  That check caught frames that slipped THROUGH
        // the wall in one tick (current position past the wall exterior face).  Without this,
        // a frame that passes through the RIGHT wall exits the box and the thermostat does
        // not account for it → divergence from the golden (blackbody tick=69: +1 total_mass).
        var helpers = ActionCompiler;
        var trigger = helpers.buildTriggerExpr(
            reposition, true,
            HANDLE_FRAME, HANDLE_SELF,
            Lit, Ref, Cmp, Cond, Fn
        );
        var program = { on: 'collision', ops: ops };
        helpers.applyProgramTrigger(program, trigger);
        return program;
    }

    // ── OvenBox ─────────────────────────────────────────────────────────

    /**
     * Thermostat box with wall op-programs and configurable thermostat for blackbody
     * radiation experiments.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM).
     * @param {Object} options - Configuration.
     * @param {number} options.left - Inner box left X (physics pixels).
     * @param {number} options.top - Inner box top Y (physics pixels).
     * @param {number} options.width - Inner box width (physics pixels).
     * @param {number} options.height - Inner box height (physics pixels).
     * @param {number} [options.wallThickness=10] - Wall thickness (pixels).
     * @param {number} [options.temperature=300] - Initial thermostat target (quanta
     *   count). Change live via `setTemperature(n)`.
     * @param {number} [options.slitHeight=60] - Slit aperture height on the slit
     *   wall (pixels). Affects how many frames can escape per tick.
     * @param {string} [options.slitWall='right'] - Wall face for the slit:
     *   `'right'` | `'left'` | `'top'` | `'bottom'`.
     * @param {Array<number>} [options.color=[120,120,120]] - Wall color `[r,g,b]`.
     * @param {string} [options.name='oven'] - The oven's name (its declared-object row).
     * @param {string} [options.countSource='active-quanta'] - Thermostat count source:
     *   `'active-quanta'` reads `universe.activeQuanta` each tick (config a —
     *   original behaviour, compatible with `getTemperatureTickFunction()`);
     *   `'oven-rect'` registers an interior counter-LO and uses the collision count
     *   from `tickData.objects[ovenHandle].count` (config b — the "better oven";
     *   use `thermostatStep(tickData)` instead of `getTemperatureTickFunction()`).
     * @param {boolean} [options.layer3=true] - Attach eject op-programs to walls
     *   (L3 block).  Set false for L1/L2 test isolation (walls become pass-through).
     * @param {boolean} [options.layer4=true] - Append velocity-flip to eject
     *   op-programs (L4 bounce = L3 + flip).  Requires layer3=true; ignored if
     *   layer3=false.
     *
     * @deprecated V1 sugar, kept for byte-identical scenes (blackbody). V2 direction: Wall{ collisionBehavior:'absorb' } + SphereEmitter{ emissionCap, gateCounter }.
     */
    function OvenBox(universe, options) {
        options = options || {};

        this.universe = universe;
        this._schemaKind = this.constructor.name;
        this.name = options.name || 'oven';   // its declared name (the Tunnel/LogicGate idiom)
        this.temperature = options.temperature || 300;

        var wt        = options.wallThickness || 10;
        var slitHeight = options.slitHeight   || 60;
        var slitWall   = options.slitWall     || 'right';
        var USE_L3    = options.layer3 !== undefined ? options.layer3 : true;
        var USE_L4    = USE_L3 && (options.layer4 !== undefined ? options.layer4 : true);

        // ── Box: walls as NONE (op-programs carry the physics) ──────────
        // Walls are registered with collision_type=NONE so the engine does NOT
        // run its native eject/bounce logic.  The op-programs below provide
        // the equivalent behavior as pure set-expressions (§10.3, EP21–EP28).
        this.box = new Box(universe, {
            left: options.left,
            top: options.top,
            width: options.width,
            height: options.height,
            wallThickness: wt,
            collisionType: CollisionTypes.NONE,
            actions: [],
            color: options.color || [120, 120, 120],
            slit: { wall: slitWall, height: slitHeight }
        });

        // Expose walls from the box
        this.walls = this.box.walls;

        var innerLeft = options.left;
        var innerTop  = options.top;
        var innerW    = options.width;
        var innerH    = options.height;

        // ── L3/L4: attach eject op-programs to all walls ─────────────────
        // Each wall carries a collision op-program that repositions overlapping
        // frames via pure set-expressions (L3 block) plus a velocity flip
        // (L4 bounce).  wall.reposition and wall.name are set by Box.js.
        // universe.updateObjectProperty routes through the schema and the engine's
        // native program registration — no engine-sniffing here.
        if (USE_L3) {
            for (var wi = 0; wi < this.walls.length; wi++) {
                var wall   = this.walls[wi];
                var ejProg = makeEjectProgram(wall.reposition, wall.name, USE_L4);
                if (ejProg) {
                    universe.updateObjectProperty(
                        wall.handle, 'LargeObject', 'program', ejProg
                    );
                }
            }
        }

        // ── Emitters (4 inward-firing wall emitters) ─────────────────────
        // Outer rect edges — walls extend outward from the inner box by wt.
        var outerLeft = innerLeft - wt;
        var outerTop  = innerTop  - wt;
        var outerW    = innerW    + 2 * wt;
        var outerH    = innerH    + 2 * wt;

        // auto_fire=false — the thermostat controls emission each tick.
        this.emitters = [];

        // Left wall emitter (shoots right)
        this.emitters.push(new QuantumEmitter(
            universe,
            [[outerLeft + wt + 4, outerTop + 2, 1, outerH - 4]],
            1, 0,
            1, null, false, false, Infinity, 0
        ));

        // Right wall emitter (shoots left)
        this.emitters.push(new QuantumEmitter(
            universe,
            [[outerLeft + outerW - wt - 4, outerTop + 2, 1, outerH - 4]],
            -1, 0,
            1, null, false, false, Infinity, 0
        ));

        // Top wall emitter (shoots down)
        this.emitters.push(new QuantumEmitter(
            universe,
            [[outerLeft + 2 * wt + 2, outerTop + wt + 5, outerW - 2 * wt - 4, 1]],
            0, 1,
            1, null, false, false, Infinity, 0
        ));

        // Bottom wall emitter (shoots up)
        this.emitters.push(new QuantumEmitter(
            universe,
            [[outerLeft + 2 * wt + 2, outerTop + outerH - wt - 2, outerW - 2 * wt - 4, 1]],
            0, -1,
            1, null, false, false, Infinity, 0
        ));

        // THE ONE UP-LINK: the oven stamps exactly what IT composed — its Box (which stamps its own
        // walls) and its four emitters. The counter wall (oven-rect) is stamped where it is built.
        this.box._owner = this;
        for (var _oi = 0; _oi < this.emitters.length; _oi++) { this.emitters[_oi]._owner = this; }

        // ── Count source: oven-rect counter-LO (config b) ────────────────
        // When countSource='oven-rect', register an interior LO whose
        // on:'collision' op-program counts frames inside the cavity IN-TICK.
        // The between-tick controller reads tickData.objects[ovenHandle].count,
        // resets count to 0, and CRUDs emitters (as-intended §2.1).
        //
        // This is the ONE config line that distinguishes (a) from (b):
        //   config b passes countSource: 'oven-rect'
        //
        // The ovenHandle and thermostatStep method are only set up when countSource
        // is 'oven-rect'.  For 'active-quanta' (the default), getTemperatureTickFunction()
        // is the entry point instead.

        var countSource = options.countSource || 'active-quanta';
        this._countSource = countSource;
        this.ovenHandle = null; // set below for 'oven-rect'
        this._counterWall = null; // the oven-rect counter Wall, when built (disposed with the oven)

        if (countSource === 'oven-rect') {
            // Construct the interior counter-LO through the Wall facade — the SAME
            // shape Tunnel's exit gate uses (collisionBehavior:'nothing', visible:false,
            // a custom op-program attached AFTER construction through the actionCompiler
            // authority). The raw `universe.registerLargeObject(spec)` path this used to
            // take registers with the ENGINE only, not the world's render census — an
            // invisible-by-construction instrument region is exactly the "physics-
            // registered, render-invisible" case FrqtlApp._assertRenderCensus refuses
            // (FAIL-LOUD, e8b579e). A Wall with visible:false is the sanctioned way to
            // build a physics-only region that IS in the census on purpose — the
            // Tunnel/Tube precedent, not a design choice made here.
            var ovenCounterWall = new Wall(universe, {
                rect: [innerLeft, innerTop, innerW, innerH],
                collisionBehavior: 'nothing',
                visible: false,
                name: 'oven_counter'
            });
            ovenCounterWall._owner = this;
            this._counterWall = ovenCounterWall;

            // op-program: set self.count = self.count + 1  (on:'collision')
            // G2b: Add intersects trigger so only frames overlapping the oven rect are counted.
            // Without a trigger, the engine runs this program for EVERY frame in the
            // search_rect (search_rect = lo_rect + 1px padding). Frames in the 1px padding
            // zone would be counted as "inside" → thermostat fires fewer emitters →
            // different emission schedule from G2 (which had the native overlaps gate).
            var _ast2 = AstSchema;
            var _Lit2 = _ast2.Lit, _Ref2 = _ast2.Ref, _Bin2 = _ast2.Bin, _Fn2 = _ast2.Fn;
            var _HF2  = _ast2.HANDLE_FRAME;
            var _HS2  = _ast2.HANDLE_SELF;
            var _triggerHelpers2 = ActionCompiler;
            var _ovenTrigger = _triggerHelpers2.buildTriggerExpr(
                null, false,          // no eject direction; intersects-only
                _HF2, _HS2,
                _Lit2, _Ref2,
                function(op,a,b){return{kind:'Cmp',op:op,a:a,b:b};},
                function(t,th,el){return{kind:'Cond',test:t,then:th,else:el};},
                _Fn2
            );
            var ovenCounterProgram = {
                on: 'collision',
                ops: [
                    { set: _HS2 + '.count',
                      to: _Bin2('+', _Ref2(_HS2, 'count'), _Lit2(1)) }
                ]
            };
            // Attach the trigger through the SAME authority Tunnel's own
            // _applyExitGateProgram uses (actionCompiler's applyProgramTrigger — a plain
            // `program.trigger = trigger` setter), then push through the SAME live path
            // as the Wall's own construction-time program push (lo.program + the
            // 'LargeObject'/'program' updateObjectProperty write). Op-program DATA is
            // byte-identical to before; only the JS wrapper (and therefore the census) changes.
            _triggerHelpers2.applyProgramTrigger(ovenCounterProgram, _ovenTrigger);
            ovenCounterWall.lo.program = ovenCounterProgram;
            if (universe && typeof universe.updateObjectProperty === 'function') {
                universe.updateObjectProperty(ovenCounterWall.lo.handle, 'LargeObject', 'program', ovenCounterProgram);
            }

            this.ovenHandle = ovenCounterWall.lo.handle;

            // Between-tick thermostat (as-intended §2.1, Dispatch C2):
            //   a. Reset count to 0 so next tick starts fresh.
            //   b. Read cavityCount from tickData.objects[ovenHandle].count (B5.1).
            //   c. Compute burst per emitter.
            //   d. Drive the emitters through their own setters (see below).
            var self = this;
            this.thermostatStep = function (tickData) {
                // a. Reset oven counter for the next tick.
                universe.updateObjectProperty(
                    self.ovenHandle, 'LargeObject', 'count', 0
                );

                // b. Read cavity occupancy — ONE read authority (B5.1, B2.1).
                var cavityCount = 0;
                if (tickData && tickData.objects &&
                    tickData.objects[self.ovenHandle] !== undefined) {
                    cavityCount = tickData.objects[self.ovenHandle].count || 0;
                }

                // c. Burst per emitter.
                var burst = 0;
                if (cavityCount < self.temperature) {
                    burst = Math.max(1, Math.floor(
                        (self.temperature - cavityCount) / self.emitters.length
                    ));
                }

                // d. Drive the emitters DIRECTLY through their own setters.
                //    QuantumEmitter is engine-agnostic SUGAR: the real state lives in
                //    its emState bags and there is NO provider emitter ABI, so
                //    `universe.updateObjectProperty(handle,'QuantumEmitter',...)` has
                //    nothing to route to.  It used to be called here and silently
                //    vanished (the whole oven-rect thermostat was therefore dead);
                //    since 5cecffea it throws.  `getTemperatureTickFunction()` — the
                //    'active-quanta' twin of this loop — has always driven the setters
                //    directly; this is the same discipline, one count source over.
                //    setBurstSize BEFORE setActive: setActive(true) may register a new
                //    emState off _specTemplate, which setBurstSize has just updated.
                for (var i = 0; i < self.emitters.length; i++) {
                    if (burst > 0) { self.emitters[i].setBurstSize(burst); }
                    self.emitters[i].setActive(burst > 0);
                }
            };
        }
    }

    /**
     * Get the thermostat tick function for `countSource: 'active-quanta'` (config a).
     *
     * Push this onto `universe.experimentTickFunctions` for automatic temperature
     * control.  The tick function runs each tick BEFORE Phase A (emitter injection):
     * - If `activeQuanta >= temperature`: silence all four emitters.
     * - Otherwise: set each emitter's burst size to
     *   `max(1, floor((temperature - activeQuanta) / 4))` and activate them.
     *
     * This is the ORIGINAL thermostat behavior — identical to the pre-convergence
     * OvenBox and compatible with scenes/blackbody.js (which calls this method
     * without arguments).
     *
     * NOT applicable when `countSource: 'oven-rect'` — use `thermostatStep(tickData)`
     * instead.  Calling this method with countSource='oven-rect' throws FAIL-LOUD.
     *
     * @returns {Function} Tick function for `universe.experimentTickFunctions`.
     */
    OvenBox.prototype.getTemperatureTickFunction = function () {
        if (this._countSource === 'oven-rect') {
            throw new Error(
                '[OvenBox] getTemperatureTickFunction() is not applicable when ' +
                'countSource=\'oven-rect\'. Use thermostatStep(tickData) instead — ' +
                'call it after every doTick() in your harness.'
            );
        }
        var self = this;
        return function () {
            var activeQuanta = typeof self.universe.activeQuanta === 'function'
                ? self.universe.activeQuanta()
                : self.universe.activeQuanta;
            var remainingBurst = Math.floor(self.temperature - activeQuanta);

            if (remainingBurst <= 0) {
                for (var i = 0; i < self.emitters.length; i++) {
                    self.emitters[i].setActive(false);
                }
                return [];
            }

            var burstPerEmitter = Math.max(1, Math.floor(remainingBurst / self.emitters.length));
            for (var i = 0; i < self.emitters.length; i++) {
                self.emitters[i].setBurstSize(burstPerEmitter);
                self.emitters[i].setActive(true);
            }
            return [];
        };
    };

    /**
     * Set the target temperature (quanta count).
     * Works for both count sources.  For 'oven-rect', the thermostatStep closure
     * reads `this.temperature` directly — no AST rebuild needed.
     * @param {number} temp
     */
    OvenBox.prototype.setTemperature = function (temp) {
        this.temperature = temp;
    };

    /**
     * Get the current target temperature.
     * @returns {number}
     */
    OvenBox.prototype.getTemperature = function () {
        return this.temperature;
    };

    /**
     * Full teardown of what this oven composed: the four emitters (each splices its own host
     * tick-fn), the Box (its walls), and the oven-rect counter wall when present. Idempotent
     * (every member guards itself).
     */
    OvenBox.prototype.dispose = function () {
        for (var i = 0; i < this.emitters.length; i++) { this.emitters[i].dispose(); }
        this.box.dispose();
        if (this._counterWall) { this._counterWall.dispose(); }
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults, builder ──────────

    /**
     * OvenBox — Thermostat box with wall emitters for blackbody experiments.
     * Constructor: OvenBox(universe, options)
     * options: { left, top, width, height, wallThickness, temperature, slitHeight, slitWall, color }
     * Group wrapper: its Box (which stamps its own walls) and 4 QuantumEmitter sub-objects are
     * stamped with the ONE up-link `_owner` = <this>.
     */
    var OvenBoxDescriptor = {
        description: 'A thermostat-controlled cavity for blackbody radiation experiments. ' +
            'Builds a Box with a slit on one wall and installs 4 inward-firing wall emitters ' +
            '(top, bottom, left, right). A tick function adjusts emitter burst sizes to maintain ' +
            'the target quanta count (temperature). Demonstrates how energy equilibrium emerges ' +
            'from local emitter control rather than a global energy equation.',
        fields: [
            {
                name: 'left',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Inner box left X position (physics pixels).'
            },
            {
                name: 'top',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Inner box top Y position (physics pixels).'
            },
            {
                name: 'width',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Inner box width (physics pixels).'
            },
            {
                name: 'height',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Inner box height (physics pixels).'
            },
            {
                name: 'wallThickness',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Wall thickness in physics pixels (default 10).'
            },
            {
                name: 'temperature',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                widgetConfig: { max: 3000, step: 50 },   // slider range (constraint has no max)
                description: 'Target quanta count inside the cavity (the "temperature"). ' +
                    'The thermostat tick function increases emission until this count is reached, ' +
                    'then stops all emitters. Higher = more particles = higher "temperature".'
            },
            {
                name: 'slitHeight',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Height of the slit opening on the exit wall (physics pixels, default 60). ' +
                    'Particles leak through this slit to the outside for blackbody spectrum measurement.'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Render color [r, g, b] for the box walls (render-only). A live edit fans ' +
                    'out to every wall the group owns (the `_owner` fan-out in updateObjectProperty).'
            }
        ]
    };

    registerKind(OvenBox, {
        from: import.meta.url,
        descriptor: OvenBoxDescriptor,
        defaults: {
        left: 60, top: 40,
        width: 100, height: 120,
        wallThickness: 10,
        temperature: 300,
        slitHeight: 60,
        color: [120, 120, 120]
        },
        build: function (props, ctx, Class) {
            var OvenBoxCls = Class;   // the class that registered (a composed fork's own class)
            var ovenBox = new OvenBoxCls(ctx.runner.universe, Object.assign({
                left: props.left != null ? props.left : Math.round(ctx.x - 50),
                top:  props.top  != null ? props.top  : Math.round(ctx.y - 60),
                width: 100, height: 120,
                wallThickness: 10, temperature: 300, slitHeight: 60, color: [120, 120, 120]
            }, props));
            ovenBox._schemaKind = Class.name;
            return ovenBox;
        }
    });

    // ── Export ───────────────────────────────────────────────────────────

    export { OvenBox };

