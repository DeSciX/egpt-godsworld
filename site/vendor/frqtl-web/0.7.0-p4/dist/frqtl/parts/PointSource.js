/* Copyright 2023-2026 by Essam Abadir */

/**
 * PointSource — Engine-agnostic radial emitter.
 * Creates one emitter per emission angle to preserve the deterministic
 * angle pattern. Each angle gets its own emitter with fixed velocity
 * vx=radius*cos(a), vy=radius*sin(a).
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 * Emits raw canonical charge; providers translate to engine wire-format.
 * No engine-sniffing above the shim (§2 invariant).
 *
 * chargeMode / random_direction (sugar-layer modes, emitter-modes-sugar):
 *   chargeMode ∈ 'random' | 'positive' | 'negative' | 'both'
 *   random_direction ∈ boolean
 *
 *   For PointSource, chargeMode operates on GROUPS of per-angle handles.
 *   Each (charge, random_direction) combo has its own full set of N per-angle handles.
 *   Switching chargeMode registers the needed group(s) lazily and activates/deactivates.
 *
 *   'both' = two per-angle handle groups (POSITIVE + NEGATIVE), both active → 2N handles.
 *
 *   Back-compat: legacy `charge` constructor param maps to chargeMode:
 *     null         → 'random'
 *     'POSITIVE'   → 'positive'
 *     'NEGATIVE'   → 'negative'
 */

import * as EmitterProgram from '../objects/objects/emitterProgram.js';
import { registerKind } from '../objects/kinds.js';
import { LargeObject } from './LargeObject.js';
import { CollisionTypes } from './CollisionTypes.js';
import * as ValueNormalizer from '../objects/schema/valueNormalizer.js';
import { declaredCount } from '../objects/ObjectFactory.js';

    // G-EMIT-2: the emitter is engine-agnostic sugar (emitterProgram.js).
    var buildEmitterTickFn;
    buildEmitterTickFn = EmitterProgram.buildEmitterTickFn;

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Map a legacy charge constructor param to a chargeMode string.
     */
    function _chargeToMode(charge) {
        if (charge === null || charge === undefined) return 'random';
        if (typeof charge === 'string') {
            var u = charge.toUpperCase();
            if (u === 'POSITIVE' || charge === 'Positive' || charge === '+') return 'positive';
            if (u === 'NEGATIVE' || charge === 'Negative' || charge === '-') return 'negative';
        }
        if (charge === 0) return 'positive';
        if (charge === 1) return 'negative';
        return 'random';
    }

    /**
     * Map chargeMode string to canonical charge value for the emitter handle-program.
     * 'both' callers build POSITIVE and NEGATIVE emitters separately.
     */
    function _modeToCharge(mode) {
        if (mode === 'positive') return 'POSITIVE';
        if (mode === 'negative') return 'NEGATIVE';
        return null; // 'random'
    }

    /**
     * Canonical key for a handle group: identifies the (charge, random_direction) combo.
     */
    function _groupKey(charge, random_direction) {
        return String(charge) + ':' + String(!!random_direction);
    }

    /**
     * Build the list of emission radii (max → min in steps of 2).
     */
    function _buildRadii(radius, minRadius) {
        var radii = [];
        if (minRadius !== null && minRadius !== undefined) {
            var maxR = Math.max(minRadius, radius);
            for (var r = maxR; r >= minRadius; r -= 2) {
                radii.push(r);
            }
        } else {
            radii.push(radius);
        }
        return radii;
    }

    // ── PointSource ─────────────────────────────────────────────────────

    /**
     * Radial emitter that fires particles outward from the surface of a circle.
     *
     * It registers one fixed-direction emitter per emission angle (so the radial
     * pattern is deterministic), each firing 1px/tick leaf Frames. There is no
     * wave equation — interference is emergent from where these particle streams
     * overlap.
     *
     * ## Physics you can drive (and what changes on screen)
     * - **`opts.wavelength`** sets each emitted particle's **mass**
     *   (`mass = capacity / wavelength`). Mass feeds the per-Frame oscillation that
     *   produces wave behavior. In the wave-interference setup `wavelength = 32`
     *   yields leaf mass ≈ 1 — the clean-fringe regime that also matches the WASM
     *   engine. This is DISTINCT from the universe `wavelengthScale` (below).
     * - **Fringe spacing** is governed by the universe `wavelengthScale`
     *   (`EGPTfrqtl` / `universe.init(...)`), NOT by this constructor:
     *   `wavelength = floor((capacity / mass) × WAVELENGTH_CONSTANT)`. OBSERVED
     *   (seed 42): raising it 2 → 32 widens the fringes from a near-uniform dense
     *   cloud to sparse, widely-separated radial spokes.
     * - **`angle_increment`** sets the number of emission rays = `floor(360 / inc)`
     *   (5° → 72 rays). Smaller increment = denser angular coverage = a smoother
     *   radial field; larger = visible discrete spokes.
     * - **`charge`** (`null` = random ±) drives the oscillation quadrant per
     *   particle; with mixed charge the two streams produce the canonical fringes.
     * - **`quantum_limit`** caps how many quanta each angle emits before stopping
     *   (the steady-state density ceiling); `Infinity` = unlimited.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM).
     * @param {number} x - Center X of the point source (physics pixels).
     * @param {number} y - Center Y of the point source (physics pixels).
     * @param {number} diameter - Diameter of the source circle. Emission radius =
     *   `diameter / 2`; this radius ALSO sets the emission velocity (see `speed`).
     * @param {number} speed - CURRENTLY UNUSED. It is stored as `this.speed` but
     *   emission velocity is derived from the source radius (`diameter / 2`), not
     *   this value (`_ensureGroup`: `vx = emitR·cos θ`, `vy = emitR·sin θ`). The
     *   wave-interference setup passes `diameter/2` here, which coincidentally
     *   equals the radius, masking that it is ignored. Flagged for review — do not
     *   rely on this parameter to change speed.
     * @param {*} charge - `0`/`1`/`'POSITIVE'`/`'NEGATIVE'`/`null`(random per
     *   particle). Back-compat; maps to `chargeMode`.
     * @param {boolean} [auto_fire=true] - Whether the emitters fire automatically.
     * @param {number} [quantum_limit=Infinity] - Max quanta per angle.
     * @param {number} [delay=0] - Ticks between bursts.
     * @param {number} [angle_increment=5] - Degrees between emission angles →
     *   `floor(360/angle_increment)` rays.
     * @param {Object} [opts] - `{ wavelength, color, minRadius, emergentPhysics, zMin, zDepth }`.
     * @param {number} [opts.wavelength] - Per-emitter wavelength → particle mass
     *   (see Physics, above). Omitted → engine default leaf mass.
     * @param {number} [opts.zMin] - when provided (with `opts.zDepth`), every
     *   emitted leaf's z is drawn UNIFORMLY from `[zMin, zMin+zDepth)` (one extra `random()` draw
     *   per leaf, opt-in only — see `emitterProgram.js`'s DRAW-ORDER CONTRACT). Omitted (default)
     *   → no z is ever written, byte-identical to pre-3D behavior. The caller (e.g.
     *   `setupWaveInterference`'s `depth` option) decides centering — PointSource just forwards.
     * @param {number} [opts.zDepth] - Depth of the uniform z-spread (paired with `opts.zMin`).
     *   Ignored if `opts.zMin` is omitted.
     *
     * @deprecated V1 sugar, kept for byte-identical scenes (big-bang). V2 direction: SphereEmitter{ preset:'drum' | 'spherical' } (needs an opt-in deterministic zero-momentum ring mode to reproduce this emission).
     */
    function PointSource(universe, x, y, diameter, speed, charge, auto_fire, quantum_limit, delay, angle_increment, opts) {
        // Defaults
        if (charge === undefined) charge = null;
        auto_fire = (auto_fire !== undefined) ? auto_fire : true;
        quantum_limit = (quantum_limit !== undefined) ? quantum_limit : Infinity;
        delay = (delay !== undefined) ? delay : 0;
        angle_increment = (angle_increment !== undefined) ? angle_increment : 5;
        opts = opts || {};

        // When emergentPhysics=true (e.g. Big Bang), particles get no initial velocity
        var emergentPhysics = opts.emergentPhysics || false;
        // minRadius: emit at multiple radii from maxRadius down to minRadius (step 2)
        var minRadius = opts.minRadius !== undefined ? opts.minRadius : null;
        // Optional color override for emitted particles (e.g. [0, 255, 0] for green)
        var color = opts.color || null;
        // Optional wavelength for mass computation (affects wave behavior at dim > 0)
        var wavelength = opts.wavelength || null;
        // Optional uniform z-spread (opt-in; null = no z ever written).
        var zMin = opts.zMin !== undefined ? opts.zMin : null;
        var zDepth = opts.zDepth !== undefined ? opts.zDepth : null;

        this.universe = universe;
        this._schemaKind = this.constructor.name;
        this.x = x;
        this.y = y;
        this.diameter = diameter;
        this.speed = speed;
        this.angle_increment = angle_increment;
        this.auto_fire = auto_fire;
        // colorOverride: render-only attribute for emitted particle color.
        // Set via updateObjectProperty(lo, 'colorOverride', [r,g,b]) from the IDE.
        this.colorOverride = color || null;
        // renderShape / renderOutline (R3-1): render-only per-emitted-frame overrides,
        // peers of colorOverride (same per-frame reach SphereEmitter3D has). null → no key stamped.
        this.renderShape = null;
        this.renderOutline = null;

        // Sugar-layer mode state.
        this._chargeMode = _chargeToMode(charge);
        this._random_direction = false; // PointSource default: directed emission

        // Store construction params needed for lazy handle group registration.
        this._emergentPhysics = emergentPhysics;
        this._color = color;
        this._wavelength = wavelength;
        this._quantum_limit = quantum_limit;
        this._delay = delay;
        this._zMin = zMin;
        this._zDepth = zDepth;

        // Pre-compute the list of emission radii (stored for lazy re-use by _ensureGroup).
        this._radii = _buildRadii(diameter / 2, minRadius);

        // Map of groupKey → Array of per-angle handles (one per (radius, angle) pair).
        // Each group is a full complement of N×M handles (N angles × M radii).
        this._handleGroups = {};

        // Register the initial handle group for the starting mode.
        this._ensureAndActivate(this._chargeMode, this._random_direction);

        // Back-compat: emitterHandles points to the active group's handles.
        this.emitterHandles = this._activeHandles();
    }

    /**
     * Register all per-angle handles for a given (charge, random_direction) group
     * if that group does not yet exist. Returns the handles array.
     * @param {null|'POSITIVE'|'NEGATIVE'} charge
     * @param {boolean} random_direction
     * @returns {Array} handles
     */
    PointSource.prototype._ensureGroup = function (charge, random_direction) {
        var key = _groupKey(charge, random_direction);
        if (this._handleGroups[key] !== undefined) return this._handleGroups[key];

        var handles = [];
        var universe = this.universe;
        var x = this.x;
        var y = this.y;
        var angle_increment = this.angle_increment;
        var numAngles = Math.floor(360 / angle_increment);
        var emergentPhysics = this._emergentPhysics;
        var color = this._color;
        var renderShape = this.renderShape;       // R3-1 per-frame render.shape reach
        var renderOutline = this.renderOutline;   // R3-1 per-frame render.outline reach
        var wavelength = this._wavelength;
        var quantum_limit = this._quantum_limit;
        var delay = this._delay;
        var radii = this._radii;
        var rd = !!random_direction;
        var auto_fire = this.auto_fire;
        var zMin = this._zMin;
        var zDepth = this._zDepth;

        for (var ri = 0; ri < radii.length; ri++) {
            var emitR = radii[ri];
            for (var i = 0; i < numAngles; i++) {
                var angleDeg = i * angle_increment;
                var angleRad = angleDeg * Math.PI / 180;

                var emitX = x + emitR * Math.cos(angleRad);
                var emitY = y + emitR * Math.sin(angleRad);

                var vx, vy;
                if (emergentPhysics) {
                    vx = 0;
                    vy = 0;
                } else {
                    vx = emitR * Math.cos(angleRad);
                    vy = emitR * Math.sin(angleRad);
                }

                var sourceRect = [Math.round(emitX), Math.round(emitY), 1, 1];

                // G-EMIT-2: build a per-angle emState + push the shared emitter handle-program;
                // the sugar OWNS the emState (the emState IS the "handle"). No registerEmitter.
                var em = {
                    sourceRects: [sourceRect],
                    vx: vx,
                    vy: vy,
                    burstSize: 1,
                    charge: charge,                          // null | 'POSITIVE' | 'NEGATIVE'
                    randomDirection: rd,
                    quantumLimit: (quantum_limit === Infinity || quantum_limit == null) ? Infinity : quantum_limit,
                    remainingQuanta: (quantum_limit === Infinity || quantum_limit == null) ? Infinity : quantum_limit,
                    delay: delay || 0,
                    remainingDelay: delay || 0,
                    active: auto_fire,
                    tombstoned: false,
                    color: color || null,
                    renderShape: renderShape || null,     // R3-1 per-frame render.shape reach
                    renderOutline: (renderOutline != null) ? renderOutline : null,  // R3-1 render.outline reach
                    wrap: false,
                    wavelength: wavelength || null,
                    fundamentalDim: null,   // null → engine uses the universe's fundamental-dim as the leaf level
                    zMin: zMin,             // null (default) → no z draw/write at all
                    zDepth: zDepth,
                };
                var tickFn = buildEmitterTickFn(universe, em);
                // Back-reference so dispose() (Studio Controls Realignment S4) can
                // find and splice OUT exactly the tick-fn(s) belonging to this
                // PointSource, mirroring QuantumEmitter's own `_emState` convention.
                tickFn._emState = em;
                universe.experimentTickFunctions.push(tickFn);
                handles.push(em);
            }
        }

        this._handleGroups[key] = handles;
        return handles;
    };

    /**
     * Ensure the handle groups required by `mode` + `random_direction` are registered,
     * then activate them and deactivate all others.
     * @param {'random'|'positive'|'negative'|'both'} mode
     * @param {boolean} random_direction
     */
    PointSource.prototype._ensureAndActivate = function (mode, random_direction) {
        var rd = !!random_direction;
        var self = this;

        // Determine which (charge, rd) combos the new mode requires.
        var required = [];
        if (mode === 'both') {
            required.push({ charge: 'POSITIVE', rd: rd });
            required.push({ charge: 'NEGATIVE', rd: rd });
        } else {
            required.push({ charge: _modeToCharge(mode), rd: rd });
        }

        // Ensure all required groups are registered.
        for (var i = 0; i < required.length; i++) {
            self._ensureGroup(required[i].charge, required[i].rd);
        }

        // Build a lookup of which group keys should be active.
        var activeKeys = {};
        for (var j = 0; j < required.length; j++) {
            activeKeys[_groupKey(required[j].charge, required[j].rd)] = true;
        }

        // Activate / deactivate handles in all registered groups.
        var allGroupKeys = Object.keys(self._handleGroups);
        for (var k = 0; k < allGroupKeys.length; k++) {
            var key = allGroupKeys[k];
            var groupHandles = self._handleGroups[key];
            var shouldBeActive = !!activeKeys[key];
            for (var h = 0; h < groupHandles.length; h++) {
                groupHandles[h].active = shouldBeActive;   // mutate sugar-owned emState
            }
        }
    };

    /**
     * Return the flat array of handles for all currently active groups.
     * Used to keep this.emitterHandles in sync (back-compat for repositionToRect).
     * @returns {Array}
     */
    PointSource.prototype._activeHandles = function () {
        var mode = this._chargeMode;
        var rd = this._random_direction;
        var result = [];

        var activeKeys = {};
        if (mode === 'both') {
            activeKeys[_groupKey('POSITIVE', rd)] = true;
            activeKeys[_groupKey('NEGATIVE', rd)] = true;
        } else {
            activeKeys[_groupKey(_modeToCharge(mode), rd)] = true;
        }

        var allGroupKeys = Object.keys(this._handleGroups);
        for (var i = 0; i < allGroupKeys.length; i++) {
            if (activeKeys[allGroupKeys[i]]) {
                var groupHandles = this._handleGroups[allGroupKeys[i]];
                for (var j = 0; j < groupHandles.length; j++) {
                    result.push(groupHandles[j]);
                }
            }
        }
        return result;
    };

    /**
     * DSE LAB (2026-07-13): iterate EVERY registered emState (ALL (charge,
     * random_direction) groups — active or not, so a field set here still applies
     * after a LATER `chargeMode` switch activates a currently-inactive group).
     * The clean, public way to mutate a per-emission field (e.g. `em.everyNTicks`,
     * the firing-rate cadence) on every handle this PointSource owns, without a
     * caller reaching into the private `_handleGroups` map directly.
     * @param {function(Object):void} fn - called once per emState.
     */
    PointSource.prototype.forEachHandle = function (fn) {
        var allGroupKeys = Object.keys(this._handleGroups);
        for (var i = 0; i < allGroupKeys.length; i++) {
            var groupHandles = this._handleGroups[allGroupKeys[i]];
            for (var j = 0; j < groupHandles.length; j++) {
                fn(groupHandles[j]);
            }
        }
    };

    // ── chargeMode getter/setter ──────────────────────────────────────────

    /**
     * chargeMode getter/setter (sugar-layer, engine-not-touched).
     *
     * Because updateObjectProperty routes engineVisible:false props as `lo[prop] = value`,
     * this setter fires automatically when the IDE calls:
     *   runner.updateObjectProperty(pointSource, 'chargeMode', 'both')
     */
    Object.defineProperty(PointSource.prototype, 'chargeMode', {
        get: function () { return this._chargeMode; },
        set: function (mode) {
            var validModes = { random: true, positive: true, negative: true, both: true };
            if (!validModes[mode]) {
                throw new TypeError(
                    '[PointSource] Invalid chargeMode "' + mode +
                    '". Expected: random | positive | negative | both'
                );
            }
            this._chargeMode = mode;
            this._ensureAndActivate(mode, this._random_direction);
            this.emitterHandles = this._activeHandles();
        },
        enumerable: true,
        configurable: true
    });

    // ── random_direction getter/setter ───────────────────────────────────

    /**
     * random_direction getter/setter.
     *
     * Note: PointSource normally uses directed emission (false). Enabling
     * random_direction registers a new group of angle emitters with rd=true.
     */
    Object.defineProperty(PointSource.prototype, 'random_direction', {
        get: function () { return this._random_direction; },
        set: function (rd) {
            var brd = !!rd;
            this._random_direction = brd;
            this._ensureAndActivate(this._chargeMode, brd);
            this.emitterHandles = this._activeHandles();
        },
        enumerable: true,
        configurable: true
    });

    // ── Public API ────────────────────────────────────────────────────────

    /**
     * Enable/disable all angle emitters.
     * @param {boolean} active
     */
    PointSource.prototype.setActive = function (active) {
        this.auto_fire = active;
        var self = this;
        if (active) {
            this._ensureAndActivate(this._chargeMode, this._random_direction);
        } else {
            // Deactivate all handles in all groups.
            var allGroupKeys = Object.keys(self._handleGroups);
            for (var i = 0; i < allGroupKeys.length; i++) {
                var groupHandles = self._handleGroups[allGroupKeys[i]];
                for (var j = 0; j < groupHandles.length; j++) {
                    groupHandles[j].active = false;   // mutate sugar-owned emState
                }
            }
        }
    };

    /**
     * Reposition the PointSource to a new [l, t, w, h] rect.
     *
     * This is the canonical ONE-PATH reposition for PointSource:
     *   1. Compute new center (cx = l + w/2, cy = t + h/2).
     *   2. Update this.x / this.y (kept in sync so schema inspector reads the live values).
     *   3. Recompute the 1×1 source rect for each handle in ALL registered groups.
     *   4. Call universe.updateEmitterSourceRects for each handle (engine-concurrence path).
     *
     * Called by FrqtlApp.updateObjectProperty when kind='PointSource', prop='rect'.
     * Routes through universe.updateEmitterSourceRects — no second path, no engine-sniffing.
     *
     * For 'both' mode: both the POSITIVE and NEGATIVE groups are repositioned.
     * The N angle emitters per group are recomputed identically (co-located).
     *
     * @param {number} l - New left edge (physics pixels)
     * @param {number} t - New top edge (physics pixels)
     * @param {number} w - New bounding width (physics pixels)
     * @param {number} h - New bounding height (physics pixels)
     * @param {Object} [universe] - Engine universe (defaults to this.universe)
     */
    PointSource.prototype.repositionToRect = function (l, t, w, h, universe) {
        var u = universe || this.universe;
        var cx = l + w / 2;
        var cy = t + h / 2;
        var radius = this.diameter / 2;
        var angle_increment = this.angle_increment;
        var numAngles = Math.floor(360 / angle_increment);

        // Update stored center so inspector reads current values.
        this.x = cx;
        this.y = cy;
        // The marker this source owns follows its ONE position write (a diameter disc at the centre).
        if (this._marker) {
            this._marker.setRect([Math.round(cx - this.diameter / 2), Math.round(cy - this.diameter / 2),
                this.diameter, this.diameter]);
        }

        // Build the angle-indexed source rects (same for all groups — co-located).
        var newRects = [];
        for (var i = 0; i < numAngles; i++) {
            var angleDeg = i * angle_increment;
            var angleRad = angleDeg * Math.PI / 180;
            var emitX = Math.round(cx + radius * Math.cos(angleRad));
            var emitY = Math.round(cy + radius * Math.sin(angleRad));
            newRects.push([emitX, emitY, 1, 1]);
        }

        // Update handles in ALL registered groups (active and inactive alike —
        // inactive groups must stay positioned correctly for when they are re-activated).
        var allGroupKeys = Object.keys(this._handleGroups);
        for (var gi = 0; gi < allGroupKeys.length; gi++) {
            var groupHandles = this._handleGroups[allGroupKeys[gi]];
            for (var hi = 0; hi < groupHandles.length; hi++) {
                // groupHandles is ordered angle0..angleN-1 (same order as newRects).
                var angleIdx = hi % numAngles;
                groupHandles[hi].sourceRects = [newRects[angleIdx]];   // mutate sugar-owned emState

            }
        }
    };

    /**
     * Full teardown (Studio Controls Realignment S4, design item 1 — the
     * SAME "delete leaves the tick-fn running" defect class found on
     * QuantumEmitter, closed here too for the sibling composite emitter type).
     * Tombstones + deactivates every emState across ALL registered (charge, rd)
     * groups (active or not — a re-activated inactive group must not resurrect),
     * then physically splices this PointSource's host tick-fn(s) out of
     * `universe.experimentTickFunctions` via the `_emState` back-reference
     * stashed in `_ensureGroup`. Idempotent — a second call is a safe no-op.
     */
    PointSource.prototype.dispose = function () {
        if (this._disposed) { return; }
        this._disposed = true;

        var mine = [];
        var allGroupKeys = Object.keys(this._handleGroups);
        for (var gi = 0; gi < allGroupKeys.length; gi++) {
            var groupHandles = this._handleGroups[allGroupKeys[gi]];
            for (var hi = 0; hi < groupHandles.length; hi++) {
                groupHandles[hi].tombstoned = true;
                groupHandles[hi].active = false;
                mine.push(groupHandles[hi]);
            }
        }

        if (this.universe && Array.isArray(this.universe.experimentTickFunctions)) {
            var fns = this.universe.experimentTickFunctions;
            for (var j = fns.length - 1; j >= 0; j--) {
                if (fns[j]._emState && mine.indexOf(fns[j]._emState) !== -1) {
                    fns.splice(j, 1);
                }
            }
        }
        // The marker is this emitter's (attachMarker): it leaves the world with it.
        if (this._marker && typeof this._marker.dispose === 'function') { this._marker.dispose(); }
    };

    /**
     * attachMarker(lo) — take ownership of the Design marker (the NONE-collision circle LargeObject
     * the ObjectFactory builder draws at this emitter). Called ONCE, by that builder. Stamps the ONE
     * up-link (`lo._owner = this`, so a pick on the disc resolves to THIS emitter) and keeps the one
     * down-link (`_marker`) this emitter moves it and disposes it through. Zero physics.
     * @param {LargeObject} lo @returns {PointSource} this
     */
    PointSource.prototype.attachMarker = function (lo) {
        if (!lo || typeof lo !== 'object') {
            throw new TypeError('[PointSource.attachMarker] needs the marker LargeObject. (FAIL-LOUD.)');
        }
        if (this._marker) {
            throw new Error('[PointSource.attachMarker] this emitter already owns a marker. (FAIL-LOUD.)');
        }
        this._marker = lo;
        lo._owner = this;
        return this;
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults, builder ──────────

    /**
     * PointSource — Radial emitter (one engine emitter handle per angle).
     * Constructor: PointSource(universe, x, y, diameter, speed, charge,
     *                          auto_fire, quantum_limit, delay, angle_increment, opts)
     * opts fields: { emergentPhysics, minRadius, color, wavelength }
     */
    var PointSourceDescriptor = {
        description: 'A radial point emitter that fires particles outward from the surface ' +
            'of a circle at regular angular intervals. Each angle gets its own engine emitter ' +
            'handle so the angular pattern is deterministic. Produces wave fronts, interference ' +
            'patterns, and Big Bang-style expansions depending on configuration.',
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: true,
                description: 'Canonical bounding rect ' + ValueNormalizer.rectTupleText(4) + ' — repositions center (cx=left+w/2, cy=top+h/2) and recomputes all angle source rects (one-path via repositionToRect)'
            },
            {
                name: 'x',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Center X of the point source (physics pixels)'
            },
            {
                name: 'y',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Center Y of the point source (physics pixels)'
            },
            {
                name: 'diameter',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Diameter of the emission circle (physics pixels)'
            },
            {
                name: 'speed',
                type: 'number',
                constraint: { min: 0, integer: false },
                engineVisible: true,
                unit: 'px/tick',
                description: 'Velocity magnitude for emitted particles (pixels/tick)'
            },
            {
                name: 'auto_fire',
                type: 'boolean',
                engineVisible: true,
                description: 'Whether all angle emitters fire automatically'
            },
            {
                name: 'quantum_limit',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Max quanta per angle emitter (null = Infinity)'
            },
            {
                name: 'delay',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                description: 'Ticks between bursts for each angle emitter'
            },
            {
                name: 'angle_increment',
                type: 'number',
                constraint: { min: 1, max: 360, integer: false },
                engineVisible: true,
                description: 'Degrees between emission angles. Fewer degrees = more angles = denser wave front. ' +
                    '5° gives 72 directions; 10° gives 36; 45° gives 8 (coarser).'
            },
            {
                name: 'colorOverride',
                type: 'rgb',
                engineVisible: false,
                description: 'Override render color for emitted particles [r, g, b] (render-only; stored on the emitter wrapper).'
            },
            {
                name: 'chargeMode',
                type: 'enum',
                constraint: { values: { random: 'random', positive: 'positive', negative: 'negative', both: 'both' } },
                engineVisible: false,
                description: 'High-level charge mode (sugar layer). "both" creates two per-angle handle groups ' +
                    '(POSITIVE + NEGATIVE), doubling the emission count. Toggles the handle active flag — no engine ABI change.'
            },
            {
                name: 'random_direction',
                type: 'boolean',
                engineVisible: false,
                description: 'Whether emitted particles have randomized direction (sugar layer). ' +
                    'PointSource normally uses directed emission; enabling this registers a new handle group with rd=true.'
            },
            {
                name: 'layer',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                description: 'Dimension layer this emitter targets (0 = fundamental; null = default). Stored on the emitter wrapper; no engine ABI change required.'
            }
        ]
    };

    //
    // Reconstructs both the PointSource emitter AND a visual circle LargeObject
    // handle (so the restored source is visible and hand-draggable, just like a
    // QuantumEmitter). The marker is the source's x/y/diameter, owned by the source.
    registerKind(PointSource, {
        from: import.meta.url,
        descriptor: PointSourceDescriptor,
        defaults: {
        x: 50, y: 100,
        diameter: 16,
        speed: 1,
        chargeMode: 'random',
        auto_fire: true,
        quantum_limit: null,
        delay: 0,
        angle_increment: 10
        },
        build: function (props, ctx, Class) {
            var PS = Class;   // the class that registered (a composed fork's own class)
            var LO3 = LargeObject;
            var CT3 = CollisionTypes;
            var psCx = props.x != null ? props.x : Math.round(ctx.x);
            var psCy = props.y != null ? props.y : Math.round(ctx.y);
            var psDiam = props.diameter || 16;
            // Bug #1 fix: pass null as raw charge; set chargeMode via the sugar setter AFTER
            // construction. The schema only captures chargeMode (not raw charge) now.
            var ps = new PS(
                ctx.runner.universe,
                psCx,
                psCy,
                psDiam,
                props.speed       != null ? props.speed       : 1,
                null,   // raw charge — overridden immediately below via chargeMode setter
                props.auto_fire   != null ? props.auto_fire   : true,
                props.quantum_limit != null ? props.quantum_limit : Infinity,
                props.delay       != null ? props.delay       : 0,
                props.angle_increment || 10,
                {
                    // Re-pass the construction opts captured by serializeDesign so the
                    // rebuilt emitter keeps its wavelength (→ correct leaf mass / particle
                    // size + color), particle color, and emergent-physics mode.
                    wavelength:      props._wavelength != null ? props._wavelength : null,
                    color:           props._optColor || null,
                    emergentPhysics: props._emergentPhysics || false
                }
            );
            ps._schemaKind = Class.name;
            // Restore chargeMode via the sugar setter (handles 'random'|'positive'|'negative'|'both').
            if (props.chargeMode) { ps.chargeMode = props.chargeMode; }
            if (props.colorOverride) { ps.colorOverride = props.colorOverride; }

            // Visual handle: circle LargeObject at the source position (its x/y/diameter).
            var psVLeft = Math.round(psCx - psDiam / 2), psVTop = Math.round(psCy - psDiam / 2);
            var psVW = psDiam, psVH = psDiam;
            var psName = props.name || ('source ' + declaredCount(ctx.runner, 'PointSource'));
            ps.name = psName;   // the declared name is the source's; its marker wears it
            var psVis = new LO3(ctx.runner.universe,
                [psVLeft, psVTop, psVW, psVH],
                CT3.NONE, [],
                psName,
                'closest', null, 1,
                [0, 0, 0]);
            psVis.drawAsCircle = true;
            psVis._schemaKind  = 'LargeObject';
            ps.attachMarker(psVis);
            return ps;
        }
    });

    // ── Export ───────────────────────────────────────────────────────────

    export { PointSource };

