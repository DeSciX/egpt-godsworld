/* Copyright 2023-2026 by Essam Abadir */

/**
 * QuantumEmitter — Engine-agnostic emitter wrapper.
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 *
 * SUGAR: builds an emState bag and pushes the shared engine-agnostic emit-loop
 * (emitterProgram.buildEmitterTickFn) onto universe.experimentTickFunctions, then mutates the
 * emState directly (active/velocity/burst/source-rects). There is NO provider emitter ABI —
 * the emit-loop is composed entirely from the generic primitives universe.random / makeLeafFrame /
 * injectFrame, identical on both engines.
 *
 * Emits the CANONICAL spec: charge in raw form (0/1/'POSITIVE'/'NEGATIVE'/null).
 * All charge translation (numeric↔string) lives in the shim providers
 * (compat/providers/js-engine.js and compat/providers/wasm-engine.js).
 * No engine-sniffing above the shim (WS-A §2 invariant).
 *
 * chargeMode / random_direction (sugar-layer modes, WS emitter-modes-sugar):
 *   chargeMode ∈ 'random' | 'positive' | 'negative' | 'both'
 *   random_direction ∈ boolean
 *
 *   The sugar layer manages a SET of underlying emitter handle-programs keyed by
 *   (charge, random_direction), lazily built via buildEmitterTickFn (a host tick-fn).
 *   The chargeMode / random_direction setters toggle the active flag on the right
 *   emState handles — the engine itself is NEVER changed.
 *
 *   'both' = two co-located underlying emitters (POSITIVE + NEGATIVE), both active.
 *
 *   Back-compat: the legacy `charge` constructor param maps onto chargeMode:
 *     null         → 'random'
 *     'POSITIVE'   → 'positive'
 *     'NEGATIVE'   → 'negative'
 *   Existing experiments keep working unchanged.
 */

(function () {

    // ── Imports ─────────────────────────────────────────────────────────

    var rectToArray;
    var buildEmitterTickFn;

    if (typeof module !== 'undefined' && module.exports) {
        var lo = require('./LargeObject');
        rectToArray = lo.LargeObject.rectToArray;
        buildEmitterTickFn = require('./emitterProgram').buildEmitterTickFn;
    } else {
        rectToArray = window.LargeObject.rectToArray;
        buildEmitterTickFn = window.EmitterProgram.buildEmitterTickFn;
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Map a legacy charge constructor param to a chargeMode string.
     * @param {*} charge - null | 'POSITIVE' | 'NEGATIVE' | 0 | 1 | 'Positive' | 'Negative'
     * @returns {'random'|'positive'|'negative'}
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
     * Map a chargeMode string to the canonical charge value expected by the emitter handle-program.
     * 'both' is never passed directly here — callers handle it by building two emitters.
     * @param {'random'|'positive'|'negative'} mode
     * @returns {null|'POSITIVE'|'NEGATIVE'}
     */
    function _modeToCharge(mode) {
        if (mode === 'positive') return 'POSITIVE';
        if (mode === 'negative') return 'NEGATIVE';
        return null; // 'random'
    }

    /**
     * Build the canonical key used to look up a handle in _emitterMap.
     * @param {null|'POSITIVE'|'NEGATIVE'} charge
     * @param {boolean} random_direction
     * @returns {string}
     */
    function _handleKey(charge, random_direction) {
        return String(charge) + ':' + String(!!random_direction);
    }

    // ── QuantumEmitter ──────────────────────────────────────────────────

    /**
     * Engine-agnostic emitter wrapper with chargeMode/random_direction modes.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM)
     * @param {Array<Array|Object>} source_rects - Emission regions
     * @param {number} vx - Initial X velocity (voltage direction)
     * @param {number} vy - Initial Y velocity
     * @param {number} burst_size - Particles per fire (amperage)
     * @param {*} charge - 0/1/'POSITIVE'/'NEGATIVE'/null(random)  [back-compat; maps to chargeMode]
     * @param {boolean} auto_fire - Whether to auto-fire each tick
     * @param {boolean} random_direction - Randomize emission direction
     * @param {number} quantum_limit - Max quanta to emit (Infinity = unlimited)
     * @param {number} delay - Ticks between bursts
     * @param {boolean} wrap - Wrap emitted particles at canvas boundaries.
     * @param {Object} [opts] - ws-dse-3d AC1 (CEO drive #2 round-2 ruling, "the
     *   emitter source mode consumes the SAME normalized SOURCE_SPEC bag"):
     *   `{ wavelength, zMin, zDepth, zIsotropy }` — the SAME trailing-`opts`
     *   idiom + the SAME field names/semantics `PointSource`'s own constructor
     *   already established for this EXACT emState contract (`emitterProgram.js`
     *   already reads `em.wavelength`/`em.zMin`/`em.zDepth`; QuantumEmitter
     *   simply never wired them). Every field OMITTED (default) — byte-identical
     *   for every existing caller (none pass a 12th arg).
     * @param {number|null} [opts.wavelength=null] - Per-emitted-particle
     *   wavelength override (Engine Invariant #6 `mass=max(1,capacity/wavelength)`).
     *   `null` (default) = engine default (`mass=capacity`). LIVE via
     *   `setWavelength()`.
     * @param {number|null} [opts.zMin=null] - When provided (with `opts.zDepth`),
     *   every emitted leaf's `z` is drawn uniformly from `[zMin, zMin+zDepth)`
     *   (one extra `random()` draw, opt-in only — see `emitterProgram.js`'s
     *   DRAW-ORDER CONTRACT). `null` (default) = no z ever written.
     * @param {number|null} [opts.zDepth=null] - Depth of the uniform z-spread
     *   (paired with `opts.zMin`). Ignored if `opts.zMin` is omitted.
     * @param {boolean} [opts.zIsotropy=false] - When BOTH this AND
     *   `random_direction` are true: the random-direction draw becomes a full
     *   3D unit-sphere direction (azimuth + polar angle) instead of a 2D-plane
     *   circle, and the drawn `vz` is written via `setFrameProperty` — the
     *   "velocity z-symmetry consistent with its profile" half of AC1 (a
     *   DIRECTED emitter, `random_direction:false`, stays `vz=0` deliberately —
     *   collimation is unaffected regardless of this flag, matching
     *   `sustainedSource.js`'s own `'beam'` profile). Default `false` — zero
     *   extra draws for every existing `random_direction:true` caller.
     *
     * @deprecated V1 sugar, kept for byte-identical scenes (blackbody's OvenBox). V2 direction: SphereEmitter (needs an opt-in fixed-velocity line source that draws nothing for velocity).
     */
    function QuantumEmitter(universe, source_rects, vx, vy, burst_size, charge, auto_fire, random_direction, quantum_limit, delay, wrap, opts) {
        // Defaults
        burst_size = (burst_size !== undefined) ? burst_size : 1;
        if (charge === undefined) charge = null;
        auto_fire = (auto_fire !== undefined) ? auto_fire : true;
        random_direction = (random_direction !== undefined) ? random_direction : false;
        quantum_limit = (quantum_limit !== undefined) ? quantum_limit : Infinity;
        delay = (delay !== undefined) ? delay : 0;
        wrap = (wrap !== undefined) ? wrap : false;
        opts = opts || {};
        var wavelength = opts.wavelength !== undefined ? opts.wavelength : null;
        var zMin = opts.zMin !== undefined ? opts.zMin : null;
        var zDepth = opts.zDepth !== undefined ? opts.zDepth : null;
        var zIsotropy = !!opts.zIsotropy;

        this.universe = universe;
        this._schemaKind = 'QuantumEmitter';
        this.vx = vx;
        this.vy = vy;
        this.burst_size = burst_size;
        this.auto_fire = auto_fire;
        // colorOverride: render-only attribute for emitted particle color.
        // Set via updateObjectProperty(lo, 'colorOverride', [r,g,b]) from the IDE.
        this.colorOverride = null;
        // renderShape / renderOutline (Bite 5b R3-1): render-only per-emitted-frame overrides,
        // peers of colorOverride — the same per-frame reach SphereEmitter3D has. null default →
        // no key stamped (byte-identical). Threaded through the em spec → emitterProgram → the
        // makeLeafFrame WASM string_map merge stamp (render.shape / render.outline).
        this.renderShape = null;
        this.renderOutline = null;
        // ws-dse-3d AC1: exposed for reads (round-trip save/restore, inspector) —
        // mutate via setWavelength(), never a bare assignment (mirrors vx/vy's
        // own setVelocity()-only-mutation discipline).
        this.wavelength = wavelength;

        // Direct properties exposed so serializeDesign/_captureProps can read them for
        // round-trip save/restore. Kept in sync with _specTemplate via setBurstSize etc.
        this.quantum_limit = (quantum_limit === Infinity) ? null : quantum_limit;
        this.delay = delay;
        this.wrap = wrap;
        // source_rects: normalized copy so the schema field is readable by the inspector.
        this.source_rects = (source_rects || []).map(function (r) { return rectToArray(r); });

        // Sugar-layer mode state (backing stores for the getters/setters below).
        this._chargeMode = _chargeToMode(charge);
        this._random_direction = !!random_direction;

        // Shared spec template used when lazily registering underlying emitters.
        this._specTemplate = {
            source_rects: this.source_rects,
            vx: vx,
            vy: vy,
            burst_size: burst_size,
            auto_fire: auto_fire,
            quantum_limit: this.quantum_limit,
            delay: delay,
            wrap: wrap,
            wavelength: wavelength,
            zMin: zMin,
            zDepth: zDepth,
            zIsotropy: zIsotropy
        };

        // Map of handleKey → engine handle (lazily populated).
        this._emitterMap = {};

        // Register the initial set of engine emitters for the starting mode.
        this._ensureAndActivate(this._chargeMode, this._random_direction);

        // Back-compat: expose a single .handle for callers that reference it directly.
        // For 'both', this points to the POSITIVE handle (first registered).
        this.handle = this._primaryHandle();
    }

    /**
     * Register an underlying emitter for a given charge + random_direction combo
     * if it does not yet exist. Returns the handle.
     * @param {null|'POSITIVE'|'NEGATIVE'} charge
     * @param {boolean} random_direction
     * @returns {*} handle
     */
    QuantumEmitter.prototype._ensureHandle = function (charge, random_direction) {
        var key = _handleKey(charge, random_direction);
        if (this._emitterMap[key] !== undefined) return this._emitterMap[key];

        // G-EMIT-2: build the emitter as an engine-agnostic handle-program. The sugar OWNS the
        // emState; buildEmitterTickFn composes universe.random/makeLeafFrame/injectFrame. No
        // provider registerEmitter — the tick-fn is pushed straight onto experimentTickFunctions.
        var tmpl = this._specTemplate;
        var em = {
            sourceRects: (tmpl.source_rects || []).map(function (r) {
                return Array.isArray(r) ? r : [r.left, r.top, r.w, r.h];
            }),
            vx: tmpl.vx || 0,
            vy: tmpl.vy || 0,
            burstSize: tmpl.burst_size || 1,
            charge: charge,                          // null | 'POSITIVE' | 'NEGATIVE'
            randomDirection: !!random_direction,
            quantumLimit: (tmpl.quantum_limit !== undefined && tmpl.quantum_limit !== null) ? tmpl.quantum_limit : Infinity,
            remainingQuanta: (tmpl.quantum_limit !== undefined && tmpl.quantum_limit !== null) ? tmpl.quantum_limit : Infinity,
            delay: tmpl.delay || 0,
            remainingDelay: tmpl.delay || 0,
            active: (tmpl.auto_fire !== undefined) ? tmpl.auto_fire : true,
            tombstoned: false,
            color: this.colorOverride || null,
            renderShape: this.renderShape || null,     // R3-1 per-frame render.shape reach
            renderOutline: (this.renderOutline != null) ? this.renderOutline : null,  // R3-1 per-frame render.outline reach
            wrap: !!tmpl.wrap,
            wavelength: tmpl.wavelength || null,
            fundamentalDim: null,   // null → engine uses the universe's fundamental-dim as the leaf level
            // ws-dse-3d AC1: the SAME em.zMin/em.zDepth fields PointSource already
            // wires (emitterProgram.js's existing opt-in z-spread mechanism) +
            // em.zIsotropy (NEW field, this bite — gates the 3D unit-sphere
            // random-direction draw). null/false (default) — byte-identical.
            zMin: (tmpl.zMin !== undefined && tmpl.zMin !== null) ? tmpl.zMin : null,
            zDepth: (tmpl.zDepth !== undefined && tmpl.zDepth !== null) ? tmpl.zDepth : null,
            zIsotropy: !!tmpl.zIsotropy,
        };
        var tickFn = buildEmitterTickFn(this.universe, em);
        // Back-reference so dispose() (WS Studio Controls Realignment S4) can find
        // and splice OUT exactly the tick-fn(s) belonging to this emitter, without
        // needing a separate id→fn registry. Harmless extra property on a function.
        tickFn._emState = em;
        this.universe.experimentTickFunctions.push(tickFn);
        this._emitterMap[key] = em;               // the emState IS the "handle" now
        return em;
    };

    /**
     * Ensure the handles required by `mode` + `random_direction` are registered,
     * then activate them and deactivate all others.
     * @param {'random'|'positive'|'negative'|'both'} mode
     * @param {boolean} random_direction
     */
    QuantumEmitter.prototype._ensureAndActivate = function (mode, random_direction) {
        var rd = !!random_direction;
        var self = this;

        // Build the list of (charge, rd) combos the new mode requires.
        var required = [];
        if (mode === 'both') {
            required.push({ charge: 'POSITIVE', rd: rd });
            required.push({ charge: 'NEGATIVE', rd: rd });
        } else {
            required.push({ charge: _modeToCharge(mode), rd: rd });
        }

        // Ensure all required handles are registered.
        for (var i = 0; i < required.length; i++) {
            self._ensureHandle(required[i].charge, required[i].rd);
        }

        // Build a lookup of which keys should be active.
        var activeKeys = {};
        for (var j = 0; j < required.length; j++) {
            activeKeys[_handleKey(required[j].charge, required[j].rd)] = true;
        }

        // Activate / deactivate all known emitters by mutating the sugar-owned emState directly
        // (no provider setEmitterActive — the tick-fn closes over em.active).
        var allKeys = Object.keys(self._emitterMap);
        for (var k = 0; k < allKeys.length; k++) {
            var key = allKeys[k];
            self._emitterMap[key].active = !!activeKeys[key];
        }
    };

    /**
     * Return the "primary" handle used for back-compat .handle access.
     * For 'both', returns the POSITIVE handle (first registered).
     * @returns {*}
     */
    QuantumEmitter.prototype._primaryHandle = function () {
        var rd = this._random_direction;
        var mode = this._chargeMode;
        var candidateKey;

        if (mode === 'both' || mode === 'positive') {
            candidateKey = _handleKey('POSITIVE', rd);
            if (this._emitterMap[candidateKey] !== undefined) return this._emitterMap[candidateKey];
        }
        if (mode === 'negative') {
            candidateKey = _handleKey('NEGATIVE', rd);
            if (this._emitterMap[candidateKey] !== undefined) return this._emitterMap[candidateKey];
        }
        // 'random'
        candidateKey = _handleKey(null, rd);
        if (this._emitterMap[candidateKey] !== undefined) return this._emitterMap[candidateKey];

        // Fallback: first registered handle.
        var allKeys = Object.keys(this._emitterMap);
        return allKeys.length > 0 ? this._emitterMap[allKeys[0]] : null;
    };

    /**
     * DSE LAB (2026-07-13): iterate EVERY registered emState (ALL (charge,
     * random_direction) groups, active or not) — mirrors `PointSource.prototype.
     * forEachHandle` exactly (SAME need: a caller-supplied field, e.g.
     * `em.everyNTicks`, must apply even after a LATER chargeMode switch activates
     * a currently-inactive group). Lets a control (e.g. the Lab's firing-rate
     * slider) work IDENTICALLY whether the active source is a `PointSource` or a
     * `QuantumEmitter` — one shared method name, no source-type branching at the
     * call site.
     * @param {Function} fn - called once per registered emState.
     */
    QuantumEmitter.prototype.forEachHandle = function (fn) {
        var allKeys = Object.keys(this._emitterMap);
        for (var i = 0; i < allKeys.length; i++) {
            fn(this._emitterMap[allKeys[i]]);
        }
    };

    /**
     * DSE LAB (2026-07-13): return the flat array of emStates in currently-ACTIVE
     * groups — mirrors `PointSource.prototype._activeHandles` exactly (SAME need:
     * a manual "FIRE" trigger must only fire handles the user has actually
     * activated, not every registered-but-inactive group). Lets a control (e.g.
     * the Lab's FIRE button) work IDENTICALLY whether the active source is a
     * `PointSource` or a `QuantumEmitter`.
     * @returns {Array}
     */
    QuantumEmitter.prototype._activeHandles = function () {
        var allKeys = Object.keys(this._emitterMap);
        var result = [];
        for (var i = 0; i < allKeys.length; i++) {
            var em = this._emitterMap[allKeys[i]];
            if (em.active) { result.push(em); }
        }
        return result;
    };

    // ── chargeMode getter/setter ──────────────────────────────────────────

    /**
     * chargeMode getter/setter.
     *
     * Setter is the sugar-layer reconfigure trigger:
     *   emitter.chargeMode = 'both'   → activates POSITIVE + NEGATIVE underlying emitters
     *   emitter.chargeMode = 'random' → activates the null-charge underlying emitter
     *   etc.
     *
     * Because updateObjectProperty routes engineVisible:false props as `lo[prop] = value`,
     * this setter fires automatically when the IDE calls:
     *   runner.updateObjectProperty(emitter, 'chargeMode', 'both')
     */
    Object.defineProperty(QuantumEmitter.prototype, 'chargeMode', {
        get: function () { return this._chargeMode; },
        set: function (mode) {
            var validModes = { random: true, positive: true, negative: true, both: true };
            if (!validModes[mode]) {
                throw new TypeError(
                    '[QuantumEmitter] Invalid chargeMode "' + mode +
                    '". Expected: random | positive | negative | both'
                );
            }
            this._chargeMode = mode;
            this._ensureAndActivate(mode, this._random_direction);
            this.handle = this._primaryHandle();
        },
        enumerable: true,
        configurable: true
    });

    // ── random_direction getter/setter ───────────────────────────────────

    /**
     * random_direction getter/setter.
     *
     * Switching random_direction mid-run ensures handles for the new
     * (charge, random_direction) combos are registered and activated while
     * old (charge, old_rd) handles are deactivated.
     */
    Object.defineProperty(QuantumEmitter.prototype, 'random_direction', {
        get: function () { return this._random_direction; },
        set: function (rd) {
            var brd = !!rd;
            this._random_direction = brd;
            this._ensureAndActivate(this._chargeMode, brd);
            this.handle = this._primaryHandle();
        },
        enumerable: true,
        configurable: true
    });

    // ── Public API ────────────────────────────────────────────────────────

    /**
     * Enable/disable this emitter.
     * Respects chargeMode — deactivating deactivates ALL underlying handles.
     * @param {boolean} active
     */
    QuantumEmitter.prototype.setActive = function (active) {
        this.auto_fire = active;
        var self = this;
        if (active) {
            // Reactivate only the emitters required by the current mode.
            this._ensureAndActivate(this._chargeMode, this._random_direction);
        } else {
            // Deactivate all underlying emitters (mutate emState directly).
            var allKeys = Object.keys(this._emitterMap);
            for (var i = 0; i < allKeys.length; i++) {
                self._emitterMap[allKeys[i]].active = false;
            }
        }
    };

    /**
     * Change emission velocity (voltage change).
     * Applied to ALL underlying engine handles.
     * @param {number} vx
     * @param {number} vy
     */
    QuantumEmitter.prototype.setVelocity = function (vx, vy) {
        this.vx = vx;
        this.vy = vy;
        this._specTemplate.vx = vx;
        this._specTemplate.vy = vy;
        var allKeys = Object.keys(this._emitterMap);
        for (var i = 0; i < allKeys.length; i++) {
            this._emitterMap[allKeys[i]].vx = vx;
            this._emitterMap[allKeys[i]].vy = vy;
        }
    };

    /**
     * Change burst size (amperage change).
     * Applied to ALL underlying engine handles.
     * @param {number} size
     */
    QuantumEmitter.prototype.setBurstSize = function (size) {
        this.burst_size = size;
        this._specTemplate.burst_size = size;
        var allKeys = Object.keys(this._emitterMap);
        for (var i = 0; i < allKeys.length; i++) {
            this._emitterMap[allKeys[i]].burstSize = size;
        }
    };

    /**
     * ws-dse-3d AC1 (CEO drive #2 round-2 ruling, "the emitter source mode
     * consumes the SAME normalized SOURCE_SPEC bag"): change per-emitted-particle
     * wavelength (Engine Invariant #6 `mass=max(1,capacity/wavelength)`) LIVE —
     * mirrors `setVelocity`/`setBurstSize`'s own "write every handle" discipline
     * exactly (real state lives in `emState`, mutated ONLY by a dedicated setter
     * — memory `reference_quantumemitter_no_generic_write_path`). A setup
     * factory's `sourceState.wavelength` accessor (see `setupLightSourceLab.js`)
     * wraps this so a page's wavelength slider works identically whether the
     * live source is a `sustainedSource` (particleWalk) or this emitter.
     * @param {number|null} wavelength
     */
    QuantumEmitter.prototype.setWavelength = function (wavelength) {
        this.wavelength = wavelength;
        this._specTemplate.wavelength = wavelength;
        var allKeys = Object.keys(this._emitterMap);
        for (var i = 0; i < allKeys.length; i++) {
            this._emitterMap[allKeys[i]].wavelength = wavelength;
        }
    };

    /**
     * Reposition the emitter's single canonical source rect (WS Studio Controls
     * Realignment S4, design §2.2/§2.5.5 — the "composite emitter move"
     * accessor). One path: mutates `source_rects` on the wrapper (inspector/
     * serializeDesign source of truth) AND every underlying emState's
     * `sourceRects` (the sugar's real, engine-facing state — mirrors
     * setVelocity/setBurstSize's own "write every handle" discipline). There is
     * no provider ABI here (G-EMIT-2 retired `updateEmitterSourceRects` — the
     * emitter is a host tick-fn, not an engine object); this IS the engine-facing
     * write.
     *
     * Called by `FrqtlApp.updateObjectProperty` when
     * `kind === 'QuantumEmitter'`/`prop === 'rect'` — mirrors PointSource's own
     * `repositionToRect` dispatch convention.
     *
     * @param {Array} rectArr - [left, top, w, h]
     */
    QuantumEmitter.prototype.setSourceRect = function (rectArr) {
        var r = (rectArr && rectArr.slice) ? rectArr.slice() : rectArr;
        // The marker this emitter owns follows its ONE position write (it is drawn on the source rect).
        if (this._marker) { this._marker.setRect([r[0], r[1], r[2], r[3]]); }
        this.source_rects = [r];
        this._specTemplate.source_rects = this.source_rects;
        var allKeys = Object.keys(this._emitterMap);
        for (var i = 0; i < allKeys.length; i++) {
            this._emitterMap[allKeys[i]].sourceRects = [r.slice()];
        }
    };

    /**
     * Full teardown (WS Studio Controls Realignment S4, design item 1 — the
     * CEO-found "delete leaves the emitter tick-fn running" defect). Stops this
     * emitter for good:
     *   1. Tombstones every underlying emState — `emitterProgram.js`'s
     *      `buildEmitterTickFn` checks `em.tombstoned` FIRST and returns `[]`
     *      immediately, so emission stops on the very next tick even before
     *      step 2 below completes (defense in depth: correct even if the splice
     *      somehow misses an entry).
     *   2. Physically removes this emitter's host tick-fn(s) from
     *      `universe.experimentTickFunctions` (via the `_emState` back-reference
     *      stashed in `_ensureHandle`) so a repeatedly placed-and-deleted emitter
     *      does not accumulate dead closures in that array forever.
     * Idempotent — a second call (double-delete / teardown race) is a safe no-op.
     */
    QuantumEmitter.prototype.dispose = function () {
        if (this._disposed) { return; }
        this._disposed = true;

        var allKeys = Object.keys(this._emitterMap);
        var mine = [];
        for (var i = 0; i < allKeys.length; i++) {
            var em = this._emitterMap[allKeys[i]];
            em.tombstoned = true;
            em.active = false;
            mine.push(em);
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
     * @param {LargeObject} lo @returns {QuantumEmitter} this
     */
    QuantumEmitter.prototype.attachMarker = function (lo) {
        if (!lo || typeof lo !== 'object') {
            throw new TypeError('[QuantumEmitter.attachMarker] needs the marker LargeObject. (FAIL-LOUD.)');
        }
        if (this._marker) {
            throw new Error('[QuantumEmitter.attachMarker] this emitter already owns a marker. (FAIL-LOUD.)');
        }
        this._marker = lo;
        lo._owner = this;
        return this;
    };

    // ── Export ───────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { QuantumEmitter };
    } else {
        window.QuantumEmitter = QuantumEmitter;
    }

})();
