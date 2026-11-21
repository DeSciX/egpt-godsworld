/* Copyright 2023-2026 by Essam Abadir */

/**
 * SphereEmitter — a p5/three-familiar OBJECT-CONSTRUCTOR facing over the
 * existing `setupSphereEmitter3D` setup factory ("Option B"). It exists so a
 * programmer can write the object idiom
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

import { setupSphereEmitter3D } from '../objects/setup/setupSphereEmitter3D.js';
import { registerKind } from '../objects/kinds.js';
import { LargeObject } from './LargeObject.js';
import { CollisionTypes } from './CollisionTypes.js';

    /**
     * FACADE_OPTIONS — the option keys THIS OBJECT owns and the factory beneath it does
     * not: they are extracted here, never forwarded (`addTo` strips them by driving off
     * this list, so the strip and the declaration cannot drift).
     *
     * It is exported because a SECOND surface needs it. The canonical sketch idiom shares
     * ONE bag across the world step and the part step —
     *   `exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC)); exp.addObject('SphereEmitter', SRC);`
     * (the mirror-route scene, 2D and 3D) — so `worldCfg` is handed a SUPERSET of the
     * factory's own vocabulary and must tolerate exactly these keys. The factory cannot
     * require this file (the arrow runs object → setup; a back-require is a cycle), so it
     * declares `SKETCH_OPTIONS` and `setup-factory-option-vocabulary.test.mjs` §4 asserts
     * that list equals `setupSphereEmitter3D.OPTIONS ∪ SphereEmitter.FACADE_OPTIONS` —
     * the drift is a CI failure rather than a hand-kept mirror.
     */
    var FACADE_OPTIONS = ['emissionCap', 'gateCounter'];

    /**
     * @param {[number,number]|[number,number,number]|Object} [position]
     * @param {Object} [opts]
     */
    function SphereEmitter(position, opts) {
        this._schemaKind = this.constructor.name;
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

        // ── Declared EMISSION GATE (emissionCap/gateCounter —
        //    circulation-emission-gate-contract §2) ──────────────────────────────────
        // The Blackbody-thermostat pattern as DECLARED DATA: `emissionCap` is a
        // self-throttle target — the emitter deactivates when the live population
        // measured by the counting Wall NAMED by `gateCounter` reaches the cap, and
        // reactivates below it. Compiled at CONSTRUCTION into a host tick-fn (see
        // _installEmissionGate in addTo) so the gate is captured by the parts writer and
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
        var factory = setupSphereEmitter3D;

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
     * ── The compiled EMISSION-GATE host tick-fn (contract §3/§4) ──────────────────
     *
     * Layer 1 (API): registered on `universe.experimentTickFunctions` (the Phase-A
     * `fn(universe)` seam — the SAME seam as the emit tick-fn, the blackbody
     * thermostat, and the ABSORB radiator). Each tick it:
     *   1. LAZILY resolves the counting Wall by NAME on the FIRST tick (handles are
     *      registration-fresh and never survive a rebuild — the name is the reference;
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

    // ── Descriptor-field GETTERS (captureProps read surface) ─────────────────
    // captureProps(sphereObj, SphereEmitterDescriptor) reads `sphereObj[field.name]`
    // DIRECTLY for every descriptor field (a getter satisfies it). These expose the
    // LIVE resolved value (from the factory's control) so a dragged/edited emitter
    // Saves at its current state — what the parts writer captures. Boot-level fields
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
        // single captured position authority. The write path
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
    // Declared emission-gate fields (captured by the parts writer; undefined
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
    // ── Live-edit WRITE ROUTER (FrqtlApp.updateObjectProperty) ───────────
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
            // LIVE "Emit Dimension" — host-side addDimension + closure flip;
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

    /**
     * SphereEmitter.worldCfg(opts) → the world cfg this emitter's physics needs (its wave-walk
     * scale, fundamental dimension, …) for the sketch's co-init call:
     *
     *     exp.createCanvas(W, H, SphereEmitter.worldCfg(SRC)); exp.addObject('SphereEmitter', SRC);
     *
     * PURE DELEGATION to the ONE function, setupSphereEmitter3D.worldCfg — byte-identical to calling
     * it (sphere-emitter-facade.test asserts the identity). The setup factory is machinery, not a
     * part, so this static is the published path to it.
     */
    SphereEmitter.worldCfg = function worldCfg(opts) {
        return setupSphereEmitter3D.worldCfg(opts);
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults, palette, builder ──────────

    /**
     * SphereEmitter — the manipulable palette face over the setupSphereEmitter3D
     * setup factory. A SUGAR kind (peer of
     * QuantumEmitter/PointSource — NOT a new engine kind): the ObjectFactory
     * builder composes a LargeObject-visual marker + the factory's host emit
     * tick-fn (SU1 — the visual LO is NONE-collision, non-leaf, zero physics).
     *
     * This descriptor is the SINGLE field authority: captureProps (the parts writer),
     * makeControlsForObject (the Inspector), and FrqtlApp.updateObjectProperty
     * (the live-edit write path) ALL drive off it — no hand-list anywhere.
     *
     * Per-field `live` attribute (consumed by makeControlsForObject):
     *   live:true  → a LIVE Inspector control; the write goes through
     *                updateObjectProperty(sphereObj, prop, v) → the control setter
     *                (mechanism A — NOT resolveBind; the SphereEmitter kind is
     *                deliberately outside controlBind's bind-executable allowlist).
     *   live:false → a read-only DISPLAY row (boot-level / derived fields that
     *                need a reload to change — same class as the renderer-swap
     *                reload rule). captureProps STILL captures its VALUE for
     *                round-trip; the Inspector just renders it read-only.
     *
     * FIELD SET is COMPLETE w.r.t. every scene-affecting setupSphereEmitter3D opt
     * (a missing opt = a lossy capture). `emissionBoxSide` is subsumed by the
     * captured derived `emissionBox`. There is no init flag: the SKETCH inits the
     * world once (setupSphereEmitter3D.initWorld / the co-init call), so a second emitter on
     * one universe (6A/6B/6C) is simply a second object.
     */
    var SphereEmitterDescriptor = {
        description: 'A spherical/omni "sun" emitter — uniform-direction ball-rejected emission ' +
            '(preset spherical/laser/drum/particle-walk). The manipulable palette face over the ' +
            'setupSphereEmitter3D setup factory: pure sugar (a NONE-collision visual marker + a host ' +
            'emit tick-fn), zero physics of its own. Drag the marker to move the emission center live; ' +
            'edit burst/rate/wavelength/charge/preset/shell live; dimension/is2D are boot-level (reload).',
        // ── STUDIO UX presentation contract ───────────────────────────────────
        // A sugar object DECLARES its own STUDIO UX.
        // The vocab is owned once at lib/shim/field-descriptor (UX_HANDLE_ZONES /
        // UX_DRAGGABLE_MODES / UX_SHELL_RENDER); this block is read via
        // ObjectSchema.ux('SphereEmitter'). resizable:false — a SphereEmitter has
        // TWO radii (inner+outer); a single-box resize gesture is ambiguous, so
        // it is NOT resizable (individually, per object). handles: ['move'] — the
        // Hand only moves it (2D and 3D), never scales it.
        // shellRender:'design' — the marker paints only while authoring (the
        // default; the "red light bulb" flips a per-instance shellRender override).
        ux: {
            resizable: false,
            draggable: { '2d': true },
            handles: ['move'],
            shellRender: 'design'
        },
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: false,
                live: true,
                // PR-1 item iii: the facade's `.rect` getter now returns a REAL rect DERIVED from
                // the live center (so computeEntityBboxForDesign reads fresh — no stale bbox). To
                // keep `center` the SINGLE captured position authority, this
                // field is `writeOnly:true` → captureProps SKIPS it BY THE FLAG (not by the getter
                // being undefined). The WRITE path is unchanged: a rect write maps rect-CENTER →
                // the emission center (control.setCenter, via applyProp).
                writeOnly: true,
                description: 'WRITE-ONLY reposition ADAPTER (drag handle). A rect write — from the visual ' +
                    'marker\'s coupled-move or a rect edit — maps rect-CENTER → the emission center ' +
                    '(control.setCenter). Its READ getter DERIVES a fresh rect from `center` (PR-1 item ' +
                    'iii, for the Design bbox); captureProps SKIPS it via writeOnly:true so `center` stays ' +
                    'the single captured position authority. Inspector seeds the vector control from ' +
                    '`center` via a FIELD_VALUE_OVERRIDE.'
            },
            {
                name: 'center',
                type: 'object',
                engineVisible: false,
                live: false,
                description: 'Emission SOURCE POSITION in absolute canvas px as [x,y,z] (the captured ' +
                    'position authority — the parts writer writes this, not rect). Edited live via the rect ' +
                    'adapter / the visual marker drag; shown read-only here.'
            },
            {
                name: 'preset',
                type: 'enum',
                constraint: { values: { spherical: 'spherical', hemisphere: 'hemisphere', laser: 'laser', drum: 'drum', 'particle-walk': 'particle-walk' } },
                engineVisible: false,
                live: true,
                description: 'Velocity-range preset: spherical (full ball / the sun), hemisphere (the SAME ' +
                    'ball-rejected sampler with the forward axis halved to [0,R] — 180° forward emission, ' +
                    'aimed by orientationDeg), laser (collimated beam), drum (z=0 disk), particle-walk ' +
                    '(deterministic +X drift). LIVE (next burst).'
            },
            {
                name: 'chargeMode',
                type: 'enum',
                constraint: { values: { positive: 'positive', negative: 'negative', random: 'random' } },
                engineVisible: false,
                live: true,
                description: 'Per-emitted-leaf charge: positive (0), negative (1), or random (per-leaf ±, ' +
                    'the braiding that makes self-interference structure). LIVE (affects the next leaf).'
            },
            {
                name: 'burstSize',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                description: 'Leaves emitted per burst (flux). LIVE (affects the next burst).'
            },
            {
                name: 'emitEveryTicks',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                unit: 'ticks',
                description: 'Ticks between bursts (sustained-emission cadence). LIVE (affects the next burst).'
            },
            {
                // ── Declared EMISSION GATE (the Blackbody-thermostat
                //    pattern; circulation-emission-gate-contract §2 field shapes).
                //    Sensor = a placeable counting Wall (name in gateCounter); regulation =
                //    emitter-side sugar compiled at CONSTRUCTION into a host tick-fn (the
                //    Restart-safe host-tick-fn rule — the parts writer captures these two fields and
                //    the reconstructed emitter's constructor rebuilds the gate).
                name: 'emissionCap',
                type: 'number',
                label: 'Population Limit',
                constraint: { min: 1, integer: true },
                widgetConfig: { max: 12800, step: 1 },   // stable slider range (constraint has no max); 2x the cl1d default 6400
                engineVisible: false,
                live: true,
                description: 'Self-throttle target: the emitter deactivates when the live population ' +
                    'measured by gateCounter reaches this value and reactivates when it drops below. ' +
                    'null/omitted = uncapped (byte-identical to today). LIVE (next tick). Zero physics ' +
                    '(SU1) — pure emission regulation, like the blackbody thermostat.'
            },
            {
                name: 'gateCounter',
                type: 'string',
                engineVisible: false,
                live: false,
                visibleWhen: { field: 'emissionCap', present: true },
                description: 'The NAME of the counting Wall (collisionBehavior:"nothing" + count hook) ' +
                    'whose getLiveCount() is this cap\'s population authority. Resolved lazily by name ' +
                    'at tick time (construction-order independent). FAIL-LOUD if absent once ' +
                    'emissionCap is set.'
            },
            {
                name: 'wavelength',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                description: 'Per-leaf wavelength arg → mass=max(1,capacity/wavelength), hence the transverse ' +
                    'oscillation period (CLAUDE.md §6 fork). A NO-OP until fundamentalDimension is raised ' +
                    '(capacity 1 saturates mass). LIVE (affects the next leaf).'
            },
            {
                name: 'emissionShell',
                type: 'enum',
                constraint: { values: { volume: 'volume', surface: 'surface' } },
                engineVisible: false,
                live: true,
                description: 'Emission start topology: volume (seed within the box) or surface (velocity-' +
                    'aligned ring launch at innerR — empty center, sharp bands). LIVE (affects the next leaf).'
            },
            {
                name: 'innerR',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                live: true,
                unit: 'px',
                description: 'Shell radius for emissionShell:surface (0 collapses to the center point; ' +
                    'ignored in volume mode). LIVE (affects the next leaf).'
            },
            {
                name: 'renderColor',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Per-leaf render color override [r,g,b] (render-intent data, zero physics); ' +
                    'null = colorless (scheme-driven fullness→ROYGBIV). LIVE (affects the next leaf).'
            },
            {
                name: 'renderShape',
                type: 'enum',
                constraint: { values: { ball: 'ball', box: 'box', circle: 'circle', cube: 'cube', sphere: 'sphere' } },
                engineVisible: false,
                live: true,
                description: 'Per-leaf render.shape override (render-intent data, zero physics) — peer of ' +
                    'renderColor. Stamped into string_map[\'render.shape\'] on each emitted leaf via the ' +
                    'provider render-intent MERGE seam. Overrides the render-level "Default Shape" ' +
                    '(setRenderOption). null/omitted = fall back to the default. LIVE (affects the next leaf).'
            },
            {
                // EMITTER ORIENTATION (B8 pulsar) — the CURRENT orientation the velocity sampler
                // rotates each sampled (vx,vy) about z by. Spinning a constrained (laser) emitter
                // sweeps the beam (a pulsar); omni ('spherical') is rotationally invariant. Also the
                // LOOK-drive rotation target. SU1: at 0 the rotation is the identity (byte-identical).
                name: 'orientationDeg',
                type: 'number',
                constraint: { min: 0, max: 360 },
                engineVisible: false,
                live: true,
                widgetHint: 'slider',
                description: 'Emitter orientation in degrees (default 0). The velocity sampler rotates ' +
                    'each emitted (vx,vy) by this angle (M5: affects the NEXT leaf), so spinning a ' +
                    'constrained/laser emitter sweeps its beam (pulsar); an omni emitter is unaffected. ' +
                    'LIVE via control.setOrientation; the LOOK-drive rotation target.'
            },
            {
                name: 'fundamentalWaveLength',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: false,
                description: 'Init-time wavelengthScale seed (waveLengthMultiplier=floor(fwl/4)); boot-level ' +
                    '(set at universe.init — reload to change). Captured for round-trip.'
            },
            {
                name: 'fundamentalDimension',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                live: false,
                description: 'The universe base dimension this emitter inits at; boot-level (reload to change). ' +
                    'Raises leaf capacity so the wavelength knob gains leverage. Captured for round-trip.'
            },
            {
                name: 'leafDimension',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                live: true,
                // Field NAME stays `leafDimension` (the capture key; a rename = round-trip
                // break + a second name = schema mirror — Q-A2). The Inspector shows
                // the display LABEL "Emit Dimension"; the write routes through applyProp →
                // control.setLeafDimension (host-side addDimension + closure var flip; the NEXT
                // emitted leaf is born at the new dimension). Mid-run addDimension is
                // SAFE (cleared 2026-07-22). SIDE EFFECT (S1): a value BELOW the current
                // fundamental floor self-lowers the floor UNIVERSE-GLOBALLY and is a ONE-WAY
                // RATCHET (no removeDimension) — the Inspector surfaces a hint when crossing below
                // floor. fundamentalDimension stays display-only (universe base = reinit-class).
                label: 'Emit Dimension',
                // R2-2: rendered as a SCROLLER LIST (a <select> showing the current dimension +
                // choices), NOT a slider — via the resolveWidget 'dimension-select' widget. The
                // option list is dynamic runtime state sourced from the emitter (fundamental +
                // current leafDimension), so the descriptor stays the single FIELD authority while
                // the candidate values come from the world (not a schema mirror).
                widgetHint: 'dimension-select',
                description: 'The per-emitter dimension leaves are born at (default = fundamentalDimension). ' +
                    'LIVE (host-side addDimension + closure flip; next emitted leaf). A leaf born ABOVE ' +
                    'the fundamental is move-gated (Invariant 6A) — slower/larger/redder, the per-dimension ' +
                    'observable. A value BELOW the current fundamental self-lowers the floor universe-globally ' +
                    '(a one-way ratchet). Captured for round-trip.'
            },
            {
                name: 'is2D',
                type: 'boolean',
                engineVisible: false,
                live: false,
                description: 'Whether the z-axis is inactive (2D disk of directions vs 3D ball); boot-level ' +
                    '(set at init via activeAxes — reload to change). Captured for round-trip.'
            },
            {
                name: 'emissionBox',
                type: 'object',
                engineVisible: false,
                live: false,
                description: 'Derived per-axis emission-position box {x,y,z} (subsumes the scalar ' +
                    'emissionBoxSide input). Captured for round-trip; frozen when re-passed on reload.'
            }
        ]
    };

    //
    // The manipulable palette face over setupSphereEmitter3D. Mirrors the
    // QuantumEmitter/PointSource pattern: build the emitter, then a NONE-collision
    // circle LargeObject "marker" the emitter OWNS (attachMarker), and return the
    // emitter — the declared object STUDIO picks, drags and carries. SU1:
    // the marker is NONE-collision + not a leaf → pure render/control surface, zero
    // physics. The emitter itself is the SphereEmitter facade (pure delegation over
    // setupSphereEmitter3D). It is a PART: it never inits the world — the SKETCH
    // (the recipe's co-init call / a page's setup factory) did that before any object.
    registerKind(SphereEmitter, {
        from: import.meta.url,
        descriptor: SphereEmitterDescriptor,
        defaults: {
        preset: 'spherical',
        is2D: true
        },
        palette: { displayName: 'Sphere Emitter', category: 'emitter', iconHint: 'emitter', rank: 0 },
        build: function (props, ctx, Class) {
            var SphereEmitterCls = Class;   // the class that registered (a composed fork's own class)

            // Forward the config VERBATIM to the factory (via the facade) — MINUS the declared
            // `name` (the facade's own construction fact). (The write-only `rect` adapter never
            // reaches a builder: create() refuses it as a construction key.) This verbatim forward
            // is the opts-identity guarantee: the emitter sees exactly what the recipe
            // declared (the walkthrough intercept test asserts this tuple-for-tuple).
            var opts = {};
            for (var k in props) {
                if (!Object.prototype.hasOwnProperty.call(props, k)) { continue; }
                if (k === 'name') { continue; }
                opts[k] = props[k];
            }
            // F1 (tester V2 FAIL, 2026-07-23): an interactive palette DROP carries the
            // click-projected world point in ctx.x/ctx.y (buildObject sets fromPalette:true).
            // Thread it into the emitter's `center` (ABSOLUTE canvas px) so the drop lands at
            // the click, mirroring what the LargeObject/QuantumEmitter builders already do —
            // the emitter otherwise self-inits at its default canvas center and the projected
            // point is silently discarded (every drop landed at [300,300,0]). GUARD: only for
            // a real palette drop (fromPalette) AND only when the recipe/opts did NOT already
            // declare placement (center/offset) — so the recipe/rung path (addObject, no
            // fromPalette, relies on the default center) stays BYTE-IDENTICAL and an explicit
            // recipe center/offset still wins (the opts-identity guarantee).
            if (ctx.fromPalette && opts.center == null && opts.offset == null &&
                typeof ctx.x === 'number' && typeof ctx.y === 'number') {
                opts.center = [ctx.x, ctx.y];
            }
            // Construction validates the option bag (its owner's migration messages win) and
            // registers nothing; the marker classes are resolved before addTo registers the
            // emitter, so a missing class never leaves a marker-less emitter in the world.
            var sphere = new SphereEmitterCls(opts);
            sphere._schemaKind = Class.name;
            var LO = LargeObject;
            var CT = CollisionTypes;
            // Thread the runner BEFORE addTo (which compiles the declared emission gate):
            // the gate's lazy by-name gateCounter resolution goes through the runner's
            // canonical resolver (FrqtlApp.getObjectByName) on its first tick.
            sphere._runner = ctx.runner;
            sphere.addTo(ctx.runner.universe);

            // Visual marker (circle LargeObject, NONE collision) — the drag/inspect handle.
            var center = (typeof sphere.getCenter === 'function') ? sphere.getCenter() : [ctx.x, ctx.y, 0];
            // The marker is z-capable from the start (a D×D×D cube about the centre, d STATED): the
            // emitter re-places it at every centre write (attachMarker), x, y AND z.
            var D = SphereEmitterCls.MARKER_D;
            var cz = (typeof center[2] === 'number') ? center[2] : 0;
            var vRect = [Math.round(center[0] - D / 2), Math.round(center[1] - D / 2), cz - D / 2, D, D, D];
            // The declared NAME is the emitter's own construction fact; its marker wears it.
            sphere.name = props.name || ('sphere emitter ' + (ctx.runner.largeObjects.length));
            var vis = new LO(ctx.runner.universe,
                vRect,
                CT.NONE, [],
                sphere.name,
                'closest', null, 1,
                [240, 200, 80]);
            vis.drawAsCircle   = true;
            // Shell render defaults (R2-3) so the Inspector's Shell section seeds live
            // controls (render-only; no visual change — alpha 255 = opaque, shellRender 'design'
            // = the marker default, shellShape 'circle' = the current drawAsCircle look).
            vis.alpha          = 255;
            vis.shellRender    = 'design';
            vis.shellShape     = 'circle';
            vis._schemaKind    = 'LargeObject';
            // STUDIO Design-mode-ONLY marker — the renderer suppresses it during Run and
            // in pure-output/standalone bundles (a render toggle at the output boundary,
            // zero physics). AuthorView flips a Design-mode signal; see the renderer.
            vis._designMarker  = true;
            sphere.attachMarker(vis);
            return sphere;
        }
    });

    export { SphereEmitter };

