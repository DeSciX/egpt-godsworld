/* Copyright 2023-2026 by Essam Abadir */

/**
 * SphereEmitter — a p5/three-familiar OBJECT-CONSTRUCTOR facing over the
 * existing `setupSphereEmitter3D` setup factory (ws-emitter-wave "Option B",
 * CEO-approved 2026-07-20). It exists so a programmer can write the object idiom
 *
 *     var sun = new SphereEmitter([x, y], opts).addTo(universe);
 *     sun.setCenter([x2, y2]);       // reposition live
 *     sun.setWavelength(200);        // dial the next leaf's mass
 *     sun.dispose();
 *
 * — hold the returned object, and have the emitter emit relative to its OWN
 * position — WITHOUT forking a single line of the factory.
 *
 * ── DRY / PURE DELEGATION SHELL (the whole point) ────────────────────────────
 * `setupSphereEmitter3D(universe, opts)` stays the ONE implementation of the
 * sphere emitter (sampling, positioning, the host emit tick-fn, the live control
 * handle, dispose). `SphereEmitter` adds ZERO sampling / positioning / emit /
 * physics logic — `.addTo(universe)` simply calls the factory with
 * `{ center:[x,y], ...opts }` and then WEARS the factory's returned
 * `sphereEmitterControl` as an object face: every live method (`setCenter`,
 * `setWavelength`, `setEmitEveryTicks`, `setActive`, `setPreset`, `setR`,
 * `dispose`, …) is a straight pass-through to that control. There is NO second
 * emit loop, NO re-implemented sampler, NO engine, NO physics here (canonical-
 * bench SU1 — a delegation shell moves no golden). If you ever find yourself
 * copying logic OUT of `setupSphereEmitter3D` into this file, stop and call the
 * factory instead.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `new SphereEmitter(position?, opts?)`
 *   @param {[number,number]|[number,number,number]|Object} [position] — emission
 *     SOURCE POSITION in ABSOLUTE canvas px (`[x,y]` or `[x,y,z]`), the center
 *     this emitter seeds its leaves around. Forwarded verbatim to the factory's
 *     `options.center`. If the FIRST argument is a plain options object (not an
 *     array), it is treated as `opts` and the position defaults to the canvas
 *     center (byte-identical to a factory call with no `center`) — so
 *     `new SphereEmitter()` and `new SphereEmitter({ preset:'laser' })` both work.
 *   @param {Object} [opts] — the SAME options `setupSphereEmitter3D` takes
 *     (`preset`, `emissionBoxSide`, `fundamentalDimension`, `leafDimension`,
 *     `wavelength`, `chargeMode`, `emissionShell`, `innerR`, `burstSize`,
 *     `emitEveryTicks`, `is2D`, `mode`, `R`, `renderColor`, …).
 *     Stored as-is; the universe is NOT touched until `.addTo()`. An explicit
 *     `position` argument WINS over `opts.center` (the position arg IS the
 *     source position — that is the object's whole purpose).
 *
 * `.addTo(universe) → this`
 *   Calls `setupSphereEmitter3D(universe, { center:position, ...opts })`, stores
 *   the returned `sphereEmitterControl`, generically forwards its every method
 *   onto this object (pure pass-through), and returns `this`. Now the emitter is
 *   LIVE (its host tick-fn is registered on `universe.experimentTickFunctions`)
 *   and the caller holds the object. Throws if called twice on one instance, or
 *   if `setupSphereEmitter3D` isn't loaded (FAIL-LOUD — never a silent no-op).
 *
 * Delegated live handle methods (identical signatures + behavior to the
 * factory's control, since they ARE the factory's control functions):
 *   `setCenter(xOrArray, y?, z?)` — accepts EITHER the p5-familiar array
 *       (`setCenter([x,y])` / `[x,y,z]`) OR the factory's scalar form
 *       (`setCenter(x, y, z)`); both spread to the ONE `control.setCenter`.
 *   `getCenter() → [x,y,z]`, `setWavelength(v)`, `getWavelength()`,
 *   `getMaxWavelength()`, `setEmitEveryTicks(v)`, `getEmitEveryTicks()`,
 *   `setActive(bool)`, `setPreset(v)`, `getPreset()`, `setR(v)`, `getR()`,
 *   `setBurstSize(v)`, `getBurstSize()`, `setMode(v)`, `getMode()`,
 *   `setChargeMode(v)`, `getChargeMode()`, `setEmissionShell(v)`,
 *   `getEmissionShell()`, `setInnerR(v)`, `getInnerR()`, `setEmissionBoxSide(v)`,
 *   `getEmissionBoxSide()`, `setRenderColor(rgb)`, `getRenderColor()`,
 *   `setAxisRange(axis,lo,hi)`, `getAxisRange(axis)`, `getIs2D()`,
 *   `getLeafDimension()`, `getFundamentalDimension()`, `dispose()`, … — every
 *   function the control exposes is auto-forwarded (future-proof: a new control
 *   method is a new facade method with zero edits here).
 *
 * Convenience getters:
 *   `emitter.center` → `getCenter()` (or the pre-`addTo` staged position).
 *   `emitter.active` → the last `setActive` value (true until set false).
 *   `emitter.control` → the underlying `sphereEmitterControl` (escape hatch for
 *       `control.controls` / anything not surfaced as a method).
 *   `emitter.controls` → the standardized `runner.experimentControls`-compatible
 *       descriptor array (a straight ref to `control.controls`).
 *
 * `.dispose()` — removes this emitter's host tick-fn (idempotent — the factory's
 *   control.dispose splices by indexOf, so a double-dispose is a safe no-op).
 *
 * ── ESTIMATION BEFORE RUNNING: how long until there is something to see? ─────
 *
 * A reader must be able to ESTIMATE settle time BEFORE the first run — the dogfood that
 * produced this section spent its first attempt on `{"total":0}` at 300 ticks with a
 * detector 350 px away, and had no way to know that was simply too early rather than
 * broken. THE HEURISTIC:
 *
 *     ticks ≈ FLIGHT DISTANCE (px)  ÷  the preset's EFFECTIVE FORWARD SPEED (px/tick)
 *
 * A quantum always MOVES at ~1 px/tick — but only a `particle-walk` beam spends all of
 * that going forward. Every other preset spreads its directions, so the mean progress
 * ALONG THE AXIS YOU CARE ABOUT is a FRACTION of the speed, and that fraction is what the
 * heuristic divides by. **Effective forward speed, per preset** (MEASURED on the WASM
 * engine: one 400-leaf burst at the preset defaults, free flight for 300 ticks, seed 42;
 * the mean displacement per tick along the preset's own forward axis, and the mean radial
 * displacement per tick):
 *
 *   | preset          | forward axis   | forward px/tick | radial px/tick |
 *   |-----------------|----------------|-----------------|----------------|
 *   | `particle-walk` | +x (2D and 3D) | 1.00            | 1.00           |
 *   | `laser`         | +x 2D / +z 3D  | 0.99 / 0.98     | 1.00           |
 *   | `hemisphere`    | +x (2D and 3D) | 0.65 / 0.49     | 1.00           |
 *   | `spherical`     | — (isotropic)  | ~0 (no drift)   | 1.00           |
 *   | `drum`          | — (in-plane)   | ~0 (no drift)   | 1.00           |
 *
 * For the two ISOTROPIC presets there is no forward axis: the front of the emission
 * expands radially at ~1 px/tick, so a detector at distance d first sees arrivals at
 * roughly d ticks whatever direction it is in. For a DIRECTED preset use the forward
 * column — e.g. the walkthrough's `hemisphere` source in 3D with a plate 350 px downrange:
 * 350 ÷ 0.49 ≈ **700 ticks** before the MEAN of the population reaches it. At 300 ticks
 * the mean has covered ~150 px, which is exactly why that run counted zero.
 *
 * Read these as a random walk's MEAN, never a wavefront: the spread grows with distance,
 * so the earliest arrivals land well before the estimate and the bulk lands well after.
 * The estimate is for "roughly when is there something to look at", which is the question
 * a reader actually has. `orientationDeg` rotates the forward axis without changing the
 * fraction (a measure-preserving rotation), and `emitEveryTicks`/`burstSize` change HOW
 * MANY arrive, never how fast they cross.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * ZERO physics (canonical-bench SU1). Every emergent behavior — uniform-
 * direction ball-rejection sampling, the ±1px/tick move-gate, the transverse
 * wave-walk, `wavelength=capacity/mass`, per-emitter `leafDimension`, the
 * velocity-aligned surface ring launch, opposite-charge braiding — is REALIZED
 * ENTIRELY by `setupSphereEmitter3D` + the engine it composes. This object is a
 * naming/ergonomics face only; it cannot and does not change any golden. See
 * `setupSphereEmitter3D.js`'s Layer 2 for the physics.
 */

(function () {

    /**
     * FACADE_OPTIONS — the option keys THIS OBJECT owns and the factory beneath it does
     * not: they are extracted here, never forwarded (`addTo` strips them by driving off
     * this list, so the strip and the declaration cannot drift).
     *
     * It is exported because a SECOND surface needs it. The canonical sketch idiom shares
     * ONE bag across the world step and the part step —
     *   `exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC)); exp.addObject('SphereEmitter', SRC);`
     * (walkthrough.js cl1d and its 3D twin) — so `worldCfg` is handed a SUPERSET of the
     * factory's own vocabulary and must tolerate exactly these keys. The factory cannot
     * require this file (the arrow runs object → setup; a back-require is a cycle), so it
     * declares `SKETCH_OPTIONS` and `setup-factory-option-vocabulary.test.mjs` §4 asserts
     * that list equals `setupSphereEmitter3D.OPTIONS ∪ SphereEmitter.FACADE_OPTIONS` —
     * the drift is a CI failure rather than a hand-kept mirror.
     */
    var FACADE_OPTIONS = ['emissionCap', 'gateCounter'];

    // ── Resolve the ONE implementation (dual environment) ───────────────────
    var setupSphereEmitter3D;
    function _resolveFactory() {
        if (setupSphereEmitter3D) { return setupSphereEmitter3D; }
        if (typeof module !== 'undefined' && module.exports) {
            setupSphereEmitter3D = require('../setup/setupSphereEmitter3D').setupSphereEmitter3D;
        } else {
            setupSphereEmitter3D = window.setupSphereEmitter3D;
        }
        return setupSphereEmitter3D;
    }

    /**
     * @param {[number,number]|[number,number,number]|Object} [position]
     * @param {Object} [opts]
     */
    function SphereEmitter(position, opts) {
        this._schemaKind = 'SphereEmitter';
        // First-arg overload: an array is a position; a plain object is opts
        // (position defaults to canvas center → byte-identical factory default).
        if (Array.isArray(position)) {
            this._center = position.slice();
        } else if (position && typeof position === 'object' && opts === undefined) {
            opts = position;
            this._center = null;
        } else {
            this._center = null;
        }
        this._opts = (opts && typeof opts === 'object') ? opts : {};
        this._control = null;      // set by addTo — the factory's sphereEmitterControl
        this._setupResult = null;  // the factory's full return (top-level dispose lives here)
        this.universe = null;
        this._active = true;       // mirror of control state (control exposes no getActive)

        // ── Declared EMISSION GATE (emissionCap/gateCounter — CEO ruling 05c98e1f,
        //    architect circulation-emission-gate-contract §2) ──────────────────────
        // The Blackbody-thermostat pattern as DECLARED DATA: `emissionCap` is a
        // self-throttle target — the emitter deactivates when the live population
        // measured by the counting Wall NAMED by `gateCounter` reaches the cap, and
        // reactivates below it. Compiled at CONSTRUCTION into a host tick-fn (see
        // _installEmissionGate in addTo) so the gate is codegen-round-trippable and
        // Restart-safe (the Restart-safe host-tick-fn rule — the gate is a
        // construction side effect of captured descriptor fields, exactly like the
        // ABSORB radiator, NEVER free recipe JS). Validation is throw-or-apply:
        // a cap without a resolvable counter NAME can never work → THROW here.
        // Zero physics (SU1) — pure emission regulation.
        this._emissionCap = undefined;
        this._gateCounter = undefined;
        this._gateTickFn  = null;
        this._runner      = null;  // threaded by the ObjectFactory builder (by-name resolution seam)
        if (this._opts.emissionCap != null) {
            this._emissionCap = _validateEmissionCap(this._opts.emissionCap);
            if (typeof this._opts.gateCounter !== 'string' || !this._opts.gateCounter) {
                throw new Error('[SphereEmitter] emissionCap requires gateCounter — the NAME of the ' +
                    'counting Wall (collisionBehavior "nothing" + count hook) whose getLiveCount() is ' +
                    'the cap\'s population authority. An unresolved gate silently running uncapped is ' +
                    'the FAIL-LOUD violation this contract closes.');
            }
        }
        if (this._opts.gateCounter != null) {
            if (typeof this._opts.gateCounter !== 'string' || !this._opts.gateCounter) {
                throw new Error('[SphereEmitter] gateCounter must be a non-empty string (the counting Wall\'s name).');
            }
            this._gateCounter = this._opts.gateCounter;
        }
    }

    /**
     * Throw-or-apply validation for emissionCap (schema constraint {min:1, integer:true}).
     * @param {*} v
     * @returns {number}
     */
    function _validateEmissionCap(v) {
        if (typeof v !== 'number' || !isFinite(v) || v < 1 || Math.floor(v) !== v) {
            throw new Error('[SphereEmitter] emissionCap must be an integer >= 1; got ' + JSON.stringify(v) +
                '. (Throw-or-apply — never a silently ignored cap.)');
        }
        return v;
    }

    /**
     * Register this emitter on `universe` via the ONE factory and wear its
     * control as an object face. Pure delegation — no physics, no second loop.
     * @param {Object} universe - an EGPTUniverse (JS or WASM compat shim).
     * @returns {SphereEmitter} this (for chaining, p5/three-style).
     */
    SphereEmitter.prototype.addTo = function (universe) {
        if (this._control) {
            throw new Error('[SphereEmitter] addTo() called twice — one SphereEmitter maps to one live emitter. Construct a new SphereEmitter for a second source.');
        }
        var factory = _resolveFactory();
        if (typeof factory !== 'function') {
            throw new Error('[SphereEmitter] setupSphereEmitter3D is not loaded — cannot addTo(). (Browser: ensure the game layer / stack-boot loaded objects/setup/setupSphereEmitter3D.js; Node: require path ../setup/setupSphereEmitter3D.)');
        }

        // Build the factory options: the SAME opts, with the object's position
        // as `center` (the position arg WINS over any opts.center). The declared
        // emission-gate fields (emissionCap/gateCounter) are FACADE-owned regulation
        // data — extracted in the constructor, never forwarded to the factory (the
        // factory's emit contract is untouched; SU1).
        var factoryOpts = {};
        for (var k in this._opts) {
            if (!Object.prototype.hasOwnProperty.call(this._opts, k)) { continue; }
            if (FACADE_OPTIONS.indexOf(k) !== -1) { continue; }
            factoryOpts[k] = this._opts[k];
        }
        if (Array.isArray(this._center)) { factoryOpts.center = this._center.slice(); }

        var res = factory(universe, factoryOpts);
        this.universe = universe;
        this._setupResult = res;
        this._control = res.sphereEmitterControl;

        // Generic pure pass-through: forward EVERY control method onto this
        // object (future-proof — a new control method needs no edit here).
        // Methods ALREADY defined on the prototype (setCenter's array overload,
        // setActive's _active mirror, dispose) are skipped so their adaptations win.
        var control = this._control;
        var self = this;
        Object.keys(control).forEach(function (key) {
            if (typeof control[key] === 'function' && typeof self[key] === 'undefined') {
                self[key] = function () { return control[key].apply(control, arguments); };
            }
        });

        // Compile the declared emission gate into a host tick-fn (construction-time
        // side effect of the captured emissionCap/gateCounter fields — Restart-safe).
        if (this._emissionCap != null) { this._installEmissionGate(universe); }
        return this;
    };

    /**
     * ── The compiled EMISSION-GATE host tick-fn (architect §3/§4 firm rulings) ───
     *
     * Layer 1 (API): registered on `universe.experimentTickFunctions` (the Phase-A
     * `fn(universe)` seam — the SAME seam as the emit tick-fn, the blackbody
     * thermostat, and the ABSORB radiator). Each tick it:
     *   1. LAZILY resolves the counting Wall by NAME on the FIRST tick (handles are
     *      registration-fresh and never survive codegen — the name is the reference;
     *      lazy resolution makes emitter/counter construction order irrelevant).
     *      Unresolved after the first tick → THROW (never a silent uncapped run).
     *   2. Reads the live population through `counter.getLiveCount(universe._lastTickData)`
     *      — the ONE population authority (loop-polish B). It never re-scans
     *      tickData.objects[...] inline and never reads a host activeQuanta list; the
     *      count-hook guard is REUSED by calling getLiveCount (which throws on a
     *      non-counting wall), never re-implemented. `_lastTickData` is the documented
     *      one-tick-lag cache the ABSORB radiator also samples (Phase A runs pre-tick).
     *   3. Self-throttles via the emitter's OWN setActive: active while live < cap.
     *      The cap is re-read from `this._emissionCap` each tick, so a LIVE edit
     *      (Inspector → applyProp('emissionCap', v)) applies on the next tick; a cap
     *      cleared to null idles the gate (no setActive writes — no re-fighting a
     *      manual toggle).
     *
     * Layer 2 (physics): ZERO physics (SU1) — pure emission regulation, exactly the
     * blackbody-thermostat pattern. The population dynamics it regulates are the
     * engine's own.
     *
     * @param {Object} universe
     */
    SphereEmitter.prototype._installEmissionGate = function (universe) {
        var self = this;
        var counter = null;   // resolved lazily on the first tick, cached after
        var gateFn = function emissionGateTick(u) {
            var cap = self._emissionCap;
            if (cap == null) { return; }   // cap cleared live → the gate idles
            if (!counter) {
                var runner = self._runner;
                if (!runner || typeof runner.getObjectByName !== 'function') {
                    throw new Error('[SphereEmitter] emissionCap gate cannot resolve gateCounter "' +
                        self._gateCounter + '" — no runner with getObjectByName() is attached (construct ' +
                        'via ObjectFactory/addObject, which threads the runner). FAIL-LOUD, never a ' +
                        'silent uncapped run.');
                }
                var target = runner.getObjectByName(self._gateCounter);
                if (!target) {
                    throw new Error('[SphereEmitter] emissionCap gate: gateCounter "' + self._gateCounter +
                        '" names no live object on the runner — place a counting Wall (collisionBehavior ' +
                        '"nothing" + hooks [\'count\']) with that name. FAIL-LOUD, never a silent uncapped run.');
                }
                if (typeof target.getLiveCount !== 'function') {
                    throw new Error('[SphereEmitter] emissionCap gate: "' + self._gateCounter +
                        '" is not a counting Wall (no getLiveCount). FAIL-LOUD, never a silent uncapped run.');
                }
                counter = target;
            }
            // The count-hook guard is getLiveCount's OWN throw (reused, not re-implemented);
            // _lastTickData is null before the first completed tick → last-sample 0 → active.
            var uni = (u && u.experimentTickFunctions) ? u : self.universe;
            var alive = counter.getLiveCount(uni ? uni._lastTickData : null);
            self.setActive(alive < cap);
        };
        gateFn._emissionGate = true;   // countable marker (dispose-parity / no-stack tests)
        universe.experimentTickFunctions.push(gateFn);
        this._gateTickFn = gateFn;
    };

    function _requireLive(self) {
        if (!self._control) {
            throw new Error('[SphereEmitter] not added yet — call .addTo(universe) before driving the emitter.');
        }
        return self._control;
    }

    /**
     * Reposition the emission SOURCE CENTER live (affects the NEXT emitted leaf).
     * Accepts the p5-familiar array form `setCenter([x,y])` / `[x,y,z]` OR the
     * factory's scalar form `setCenter(x, y, z)` — both spread to the ONE
     * `control.setCenter`. Pure pass-through (the factory does the work).
     */
    SphereEmitter.prototype.setCenter = function (xOrArray, y, z) {
        var control = _requireLive(this);
        if (Array.isArray(xOrArray)) {
            control.setCenter(xOrArray[0], xOrArray[1], xOrArray.length > 2 ? xOrArray[2] : undefined);
        } else {
            control.setCenter(xOrArray, y, z);
        }
        return this;
    };

    /**
     * Toggle emission on/off (delegates to control.setActive; mirrors `_active`
     * locally so the `active` getter can read it — the control exposes no getter).
     */
    SphereEmitter.prototype.setActive = function (v) {
        var control = _requireLive(this);
        this._active = !!v;
        control.setActive(this._active);
        return this;
    };

    /**
     * LIVE emission-cap setter (the applyProp write path). Throw-or-apply: an
     * invalid value THROWS; null/undefined CLEARS the cap (the gate tick-fn idles —
     * it stops writing setActive rather than re-fighting a manual toggle). The gate
     * tick-fn re-reads the cap each tick, so the new threshold applies next tick.
     * NOTE: setting a cap live on an emitter constructed WITHOUT one does not build
     * a gate (the gate is a CONSTRUCTION-time compile of the declared field —
     * reconstruct with emissionCap to gain one); the value still captures for
     * round-trip, and the rebuilt emitter gates.
     * @param {number|null} v
     * @returns {SphereEmitter} this
     */
    SphereEmitter.prototype.setEmissionCap = function (v) {
        this._emissionCap = (v == null) ? undefined : _validateEmissionCap(v);
        return this;
    };

    /**
     * Remove this emitter's host tick-fns — the compiled emission gate (dispose
     * PARITY with its construction-time push, the anti-stack rule the ABSORB
     * radiator's dispose is the template for: without the splice every reinit
     * STACKS a second gate) and the factory's emit tick-fn (control.dispose).
     * Idempotent (indexOf splice — a second call no-ops). Safe pre-addTo (no-op).
     */
    SphereEmitter.prototype.dispose = function () {
        if (this._gateTickFn && this.universe && Array.isArray(this.universe.experimentTickFunctions)) {
            var i = this.universe.experimentTickFunctions.indexOf(this._gateTickFn);
            if (i !== -1) { this.universe.experimentTickFunctions.splice(i, 1); }
        }
        this._gateTickFn = null;
        if (this._control) { this._control.dispose(); }
        // The marker is this emitter's (attachMarker): it leaves the world with it.
        if (this._marker && typeof this._marker.dispose === 'function') { this._marker.dispose(); }
    };

    /**
     * attachMarker(lo) — take ownership of the Design-mode MARKER (the NONE-collision circle
     * LargeObject STUDIO draws at the emission centre). Called ONCE, by the ObjectFactory
     * SphereEmitter builder after `addTo`. The emitter stamps the ONE up-link on it
     * (`lo._owner = this` — so a pick or an aim that lands on the disc resolves to THIS
     * emitter) and keeps the one down-link (`_marker`) it needs to move it and dispose it.
     * Zero physics: the marker carries no frames and collides with nothing.
     * @param {LargeObject} lo @returns {SphereEmitter} this
     */
    SphereEmitter.prototype.attachMarker = function (lo) {
        if (!lo || typeof lo !== 'object') {
            throw new TypeError('[SphereEmitter.attachMarker] needs the marker LargeObject. (FAIL-LOUD.)');
        }
        if (this._marker) {
            throw new Error('[SphereEmitter.attachMarker] this emitter already owns a marker — one emitter, ' +
                'one marker. (FAIL-LOUD.)');
        }
        this._marker = lo;
        lo._owner = this;
        if (!this._control) {
            throw new Error('[SphereEmitter.attachMarker] addTo() first — the marker follows the live control\'s ' +
                'centre write. (FAIL-LOUD.)');
        }
        this._control.attachMarker(lo);   // the follow hangs on the ONE centre write
        return this;
    };

    // Convenience getters (the object face — no logic, read-through only).
    Object.defineProperty(SphereEmitter.prototype, 'center', {
        get: function () { return this._control ? this._control.getCenter() : (this._center ? this._center.slice() : null); }
    });
    Object.defineProperty(SphereEmitter.prototype, 'active', {
        get: function () { return this._active; }
    });
    Object.defineProperty(SphereEmitter.prototype, 'control', {
        get: function () { return this._control; }
    });
    Object.defineProperty(SphereEmitter.prototype, 'controls', {
        get: function () { return this._control ? this._control.controls : null; }
    });

    // ── Descriptor-field GETTERS (Bite 4b — captureProps read surface) ───────
    // captureProps(sphereObj, SphereEmitterDescriptor) reads `sphereObj[field.name]`
    // DIRECTLY for every descriptor field (a getter satisfies it). These expose the
    // LIVE resolved value (from the factory's control) so a dragged/edited emitter
    // Saves at its current state — the codegen round-trip authority. Boot-level fields
    // (fundamentalWaveLength) that the control doesn't surface read from the
    // construction opts (they cannot change live). `rect` is a WRITE-ONLY reposition
    // adapter: its getter is deliberately `undefined` so captureProps SKIPS it —
    // `center` is the single captured position authority (do NOT "fix" this to a value).
    function _liveGetter(readFn) {
        return { get: function () { return this._control ? readFn(this._control, this) : undefined; } };
    }
    Object.defineProperty(SphereEmitter.prototype, 'rect', {
        // PR-1 item iii: a REAL `.rect` getter DERIVED from the live emission center (was
        // hardwired undefined). computeEntityBboxForDesign reads this fresh each paint, so a
        // center-only write (carry / drive / programmatic move) no longer leaves a stale Design
        // bbox — rect DERIVES from the one authority (center), never parallel state. D=24 mirrors
        // the ObjectFactory marker diameter + makeControlsForObject's rect-seed. captureProps no
        // longer trips on this: the descriptor's rect field is `writeOnly:true`, so captureProps
        // SKIPS it by the descriptor flag (not by the getter being undefined) — `center` stays the
        // single captured position authority (codegen round-trip unchanged). The write path
        // (rect → setCenter) is still the applyProp adapter (updateObjectProperty).
        get: function () {
            var c = (this._control && typeof this._control.getCenter === 'function')
                ? this._control.getCenter() : null;
            if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') { return undefined; }
            var D = SphereEmitter.MARKER_D, cz = (typeof c[2] === 'number') ? c[2] : 0;
            return { left: c[0] - D / 2, top: c[1] - D / 2, z: cz - D / 2, w: D, h: D, d: D };
        }
    });
    Object.defineProperty(SphereEmitter.prototype, 'preset',         _liveGetter(function (c) { return c.getPreset(); }));
    Object.defineProperty(SphereEmitter.prototype, 'chargeMode',     _liveGetter(function (c) { return c.getChargeMode(); }));
    Object.defineProperty(SphereEmitter.prototype, 'burstSize',      _liveGetter(function (c) { return c.getBurstSize(); }));
    Object.defineProperty(SphereEmitter.prototype, 'emitEveryTicks', _liveGetter(function (c) { return c.getEmitEveryTicks(); }));
    Object.defineProperty(SphereEmitter.prototype, 'wavelength',     _liveGetter(function (c) { return c.getWavelength(); }));
    Object.defineProperty(SphereEmitter.prototype, 'emissionShell',  _liveGetter(function (c) { return c.getEmissionShell(); }));
    Object.defineProperty(SphereEmitter.prototype, 'innerR',         _liveGetter(function (c) { return c.getInnerR(); }));
    Object.defineProperty(SphereEmitter.prototype, 'renderColor',    _liveGetter(function (c) { return c.getRenderColor(); }));
    Object.defineProperty(SphereEmitter.prototype, 'renderShape',    _liveGetter(function (c) { return c.getRenderShape(); }));
    Object.defineProperty(SphereEmitter.prototype, 'fundamentalDimension', _liveGetter(function (c) { return c.getFundamentalDimension(); }));
    Object.defineProperty(SphereEmitter.prototype, 'leafDimension',  _liveGetter(function (c) { return c.getLeafDimension(); }));
    Object.defineProperty(SphereEmitter.prototype, 'is2D',           _liveGetter(function (c) { return c.getIs2D(); }));
    Object.defineProperty(SphereEmitter.prototype, 'orientationDeg', _liveGetter(function (c) { return c.getOrientation(); }));
    Object.defineProperty(SphereEmitter.prototype, 'emissionBox',    _liveGetter(function (c) { return c.getEmissionBox(); }));
    // Declared emission-gate fields (captured for codegen round-trip; undefined
    // when uncapped → captureProps SKIPS them → byte-identical legacy scenes).
    Object.defineProperty(SphereEmitter.prototype, 'emissionCap', {
        get: function () { return this._emissionCap; }
    });
    Object.defineProperty(SphereEmitter.prototype, 'gateCounter', {
        get: function () { return this._gateCounter; }
    });
    // Boot-level, not surfaced by the control — read from the construction opts.
    Object.defineProperty(SphereEmitter.prototype, 'fundamentalWaveLength', {
        get: function () { return (this._opts && this._opts.fundamentalWaveLength !== undefined) ? this._opts.fundamentalWaveLength : 64; }
    });
    // ── Live-edit WRITE ROUTER (Bite 4b — FrqtlApp.updateObjectProperty) ─
    /**
     * Route ONE schema-prop write to the matching factory-control setter (the
     * mechanism-A write path — the Inspector / coupled-move calls this via
     * FrqtlApp.updateObjectProperty, never resolveBind). `rect` is the
     * reposition adapter: a rect write maps rect-CENTER → the emission center.
     * Boot-level/derived fields have NO live setter (reload to change) — a write
     * is a deliberate no-op on the running emitter (never a stale-mirror mutation).
     * @param {string} prop  — a SphereEmitter descriptor field name
     * @param {*}      value — the new value
     * @returns {SphereEmitter} this
     */
    SphereEmitter.prototype.applyProp = function (prop, value) {
        var c = this._control;
        if (!c) { return this; }
        switch (prop) {
            case 'rect':
                // Input adapter: rect-centre → the ONE centre write (a 6-element rect carries z).
                if (Array.isArray(value) && value.length === 6) {
                    c.setCenter(value[0] + value[3] / 2, value[1] + value[4] / 2, value[2] + value[5] / 2);
                } else if (Array.isArray(value) && value.length === 4) {
                    c.setCenter(value[0] + value[2] / 2, value[1] + value[3] / 2);
                }
                break;
            case 'center':
                if (Array.isArray(value)) { c.setCenter(value[0], value[1], value.length > 2 ? value[2] : undefined); }
                break;
            case 'preset':          c.setPreset(value); break;
            case 'chargeMode':      c.setChargeMode(value); break;
            case 'burstSize':       c.setBurstSize(value); break;
            case 'emitEveryTicks':  c.setEmitEveryTicks(value); break;
            case 'wavelength':      c.setWavelength(value); break;
            case 'emissionShell':   c.setEmissionShell(value); break;
            case 'innerR':          c.setInnerR(value); break;
            case 'renderColor':     c.setRenderColor(value); break;
            case 'renderShape':     c.setRenderShape(value); break;
            // LIVE "Emit Dimension" (Bite 5b A2) — host-side addDimension + closure flip;
            // next emitted leaf is born at the new per-emitter dimension (M5). See
            // setupSphereEmitter3D.setLeafDimension for the ratchet side effect (S1).
            case 'leafDimension':   c.setLeafDimension(value); break;
            // B8 pulsar orientation (deg) — LIVE; sweeps a constrained beam, omni invariant.
            case 'orientationDeg':  c.setOrientation(value); break;
            // Emission gate: the cap is LIVE (throw-or-apply; the gate tick-fn re-reads
            // it next tick — truth-in-labeling readers see the new value immediately).
            case 'emissionCap':     this.setEmissionCap(value); break;
            // gateCounter is boot-level (live:false — the gate resolves it once on the
            // first tick; captured for round-trip). A write is a deliberate no-op.
            case 'gateCounter':     break;
            // Boot-level / derived — no live setter (reload to change). No-op.
            case 'fundamentalWaveLength': case 'fundamentalDimension':
            case 'is2D': case 'emissionBox':
                break;
            default: break;
        }
        return this;
    };

    // ── Export ───────────────────────────────────────────────────────────
    SphereEmitter.FACADE_OPTIONS = FACADE_OPTIONS;
    /** The Design marker's edge, px (a D×D×D cube about the emission centre): the ONE constant the
     *  ObjectFactory builder constructs it with and the `rect` getter derives from. */
    SphereEmitter.MARKER_D = 24;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SphereEmitter: SphereEmitter };
    } else {
        window.SphereEmitter = SphereEmitter;
    }

})();
