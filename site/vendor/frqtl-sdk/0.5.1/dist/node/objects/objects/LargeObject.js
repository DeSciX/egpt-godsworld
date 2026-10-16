/* Copyright 2023-2026 by Essam Abadir */

/**
 * LargeObject — Engine-agnostic large object (wall, boundary, detector).
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 *
 * Uses handle-based API: calls universe.registerLargeObject(spec) and stores
 * the opaque handle for subsequent mutations.
 *
 * Emits the CANONICAL spec in JS-native vocabulary:
 *   - collision_type: SCREAMING_SNAKE string
 *   - actions: SCREAMING_SNAKE array
 *   - reposition: literal string including 'closest'
 * All engine-specific wire-format translation lives in the shim providers
 * (compat/providers/js-engine.js and compat/providers/wasm-engine.js).
 * No engine-sniffing above the shim (WS-A §2 invariant).
 */

(function () {

    // ── Imports (Node.js) or globals (browser) ──────────────────────────

    var CollisionTypes, CollisionActions, _compileActions;

    // PR-1 (Rectangle everywhere): resolve the canonical Rectangle CLASS so this.rect is a
    // REAL Rectangle instance (center↔left/top auto-recompute), not a hand-rolled {left,top,w,h}
    // bag. Node → the objects-layer copy (arrow-legal within lib/frqtl/objects); browser →
    // window.Rectangle (quadtree.js's class, loaded first in stack-boot; geometry/Rectangle.js
    // is the dormant browser dup). Both are the SAME auto-recompute contract.
    var _Rectangle = null;
    if (typeof module !== 'undefined' && module.exports) {
        var ct = require('../constants/CollisionTypes');
        CollisionTypes = ct.CollisionTypes;
        var ca = require('../constants/CollisionActions');
        CollisionActions = ca.CollisionActions;
        // Sugar compiler — single authority for actions[] → op-program translation.
        // Legal downward arrow: lib/frqtl/objects/ is the caller.
        _compileActions = require('./actionCompiler').compileActions;
        _Rectangle = require('../geometry/Rectangle').Rectangle;
    } else {
        CollisionTypes = window.CollisionTypes;
        CollisionActions = window.CollisionActions;
        // Resolved at construction time (browser: game layer loads before data-page-scripts)
        _compileActions = null; // resolved lazily below
        _Rectangle = (typeof window !== 'undefined') ? window.Rectangle : null;
    }

    /**
     * Build a LargeObject `.rect` for the 2D (4-element) case: a REAL Rectangle instance
     * (is_centered=false) so a center write (`.x`/`.y`) auto-recomputes left/top and vice
     * versa (PR-1 — audit item 3). A non-enumerable `toJSON` is attached so JSON-serializing
     * consumers (codegen `_jsonCopy`, bundle export, save-state) still produce the SAME plain
     * `{left,top,w,h}` shape they always did — the Rectangle's own enumerable fields are
     * `_left/_x/...`, which WOULD drift; `toJSON` pins the wire shape. (`left/top/w/h` are read
     * via getters by every direct consumer, so those are unaffected.) 6-element z/d rects are
     * handled by the caller (a 2D Rectangle cannot carry z/d — see the constructor).
     */
    function _makeLoRect(left, top, w, h) {
        if (typeof _Rectangle !== 'function') {
            // Fail-soft: no Rectangle class in scope (degenerate env) → the legacy bare bag.
            return { left: left, top: top, w: w, h: h };
        }
        var r = new _Rectangle(left, top, w, h, null, false);   // is_centered=false → (left,top) corner
        Object.defineProperty(r, 'toJSON', {
            value: function () { return { left: this.left, top: this.top, w: this.w, h: this.h }; },
            enumerable: false
        });
        return r;
    }

    function _getCompileActions() {
        if (_compileActions) return _compileActions;
        if (typeof window !== 'undefined' && window.compileActions) return window.compileActions;
        throw new Error(
            '[LargeObject] compileActions not available. ' +
            'In the browser, ensure actionCompiler.js is loaded in data-page-scripts.'
        );
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /**
     * Normalize a rect to array form: legacy [left, top, w, h] (4 elements), or the
     * explicit-z/depth [left, top, z, w, h, d] (6 elements — FRQTL-MAINT 2026-07-01,
     * MIRRORS the engine's Rectangle::from_top_left(l,t,z,w,h,d) argument order; see
     * egpt_wasm/src/lib.rs rect_to_z_capable_rectangle). Accepts: [l,t,w,h],
     * [l,t,z,w,h,d], {left,top,w,h}, {left,top,w,h,z,d}, or Rectangle instances.
     * Pure shape coercion — no engine knowledge.
     */
    function rectToArray(rect) {
        if (!rect) return null;
        if (Array.isArray(rect)) return rect;
        if (rect.left !== undefined) {
            if (rect.z !== undefined || rect.d !== undefined) {
                return [
                    rect.left, rect.top,
                    rect.z !== undefined ? rect.z : 0,
                    rect.w, rect.h,
                    rect.d !== undefined ? rect.d : rect.w,
                ];
            }
            return [rect.left, rect.top, rect.w, rect.h];
        }
        if (rect.x !== undefined && rect.width !== undefined) return [rect.x, rect.y, rect.width, rect.height];
        return rect;
    }

    // ── LargeObject ─────────────────────────────────────────────────────

    /**
     * Engine-agnostic large object wrapper.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM)
     * @param {Array|Object} rect - Bounding rectangle [left, top, w, h], {left,top,w,h},
     *   or — FRQTL-MAINT (2026-07-01), explicit z/depth — [left, top, z, w, h, d] /
     *   {left, top, w, h, z, d}. MIRRORS the engine's Rectangle::from_top_left(l,t,z,w,h,d)
     *   argument order (egpt_wasm/src/lib.rs rect_to_z_capable_rectangle). Omitting z/d
     *   is back-compat: the engine defaults z=0, d=w (bit-identical to the pre-fix
     *   hardcoded behavior) — WASM-only (the frozen JS reference engine is 2D-only and
     *   ignores any elements past index 3).
     *   IMPORTANT: always pass [left, top, w, h] (is_centered=false convention).
     *   The engine constructs Rectangle(left,top,w,h,null,false) internally.
     *   Never pass a center-based coordinate here — see Rectangle class (quadtree.js)
     *   where is_centered defaults to TRUE, a common footgun.
     * @param {string} collision_type - CollisionTypes value (SCREAMING_SNAKE)
     * @param {Array<string>} actions - CollisionActions values (SCREAMING_SNAKE)
     * @param {string} name - Identifier
     * @param {string} reposition - Eject direction: 'top','bottom','left','right','closest'
     * @param {Array|null} observedDimensions - Dimension layers to observe (legacy param;
     *   prefer passing a single layer number via the `layer` property after construction,
     *   or pass [layer] here). null = object is visible to all dimensions.
     * @param {number} search_padding - RESERVED / UNUSED positional placeholder. The engine no
     *   longer reads it: the collision search rect expands by the dimension's `mb_w`
     *   (EGPTfrqtl.js::update). Kept as positional arg #8 so `color` (#9) stays in place for the
     *   ~50 positional callers. Do not wire new behavior to it.
     * @param {Array} color - RGB color [r, g, b]
     * @param {boolean} [collectCollided=false] - G1: when true, the engine accumulates a
     *   point-in-time FrameData copy for each collided frame into a per-LO buffer
     *   (cleared at the start of each tick). Marshalled out in Phase D as
     *   `tickData.objects[handle].frames` (no per-LO collision query).
     */
    function LargeObject(universe, rect, collision_type, actions, name, reposition, observedDimensions, search_padding, color, collectCollided) {
        // Defaults
        actions = actions || [];
        name = name || '';
        reposition = reposition || 'closest';
        observedDimensions = observedDimensions || null;
        search_padding = (search_padding !== undefined) ? search_padding : 1;
        color = color || [120, 120, 120];
        collectCollided = collectCollided || false;

        this.universe = universe;
        this._schemaKind = 'LargeObject';
        // rect is [left, top, w, h] (legacy) or [left, top, z, w, h, d] (FRQTL-MAINT
        // 2026-07-01, explicit z/depth) — is_centered=false convention either way.
        var ra = rectToArray(rect);
        this.rect = (ra.length === 6)
            // 3D z/d rect — the canonical Rectangle is 2D (x,y,left,top,right,bottom); it
            // cannot carry z/d. Keep the explicit bare bag for WASM-only 3D LOs (Tube
            // slabs — box-vs-plane derivation reads rect.d). PR-1 flag: a z-capable Rectangle is
            // a separate, larger change; out of this pass's scope (see the build report).
            ? { left: ra[0], top: ra[1], z: ra[2], w: ra[3], h: ra[4], d: ra[5] }
            // 2D rect — a REAL Rectangle instance (PR-1): center↔left/top auto-recompute.
            : _makeLoRect(ra[0], ra[1], ra[2], ra[3]);
        this.color = color;
        this.alpha = 255;
        this.visible = true;
        this.drawAsCircle = false;
        this.name = name;
        this.collision_type = collision_type;
        this.reposition = reposition;
        this.search_padding = search_padding;
        // G1: mirror collect_collided flag on JS-side wrapper.
        this.collect_collided = collectCollided;
        // this.actions is set after compilation (see compilation block below)

        // layer: the single dimension index this object is scoped to (null = all).
        // Derived from observedDimensions: if observedDimensions is [n], layer = n.
        // Settable directly as lo.layer = n; the schema field reads/writes this.
        this.layer = (Array.isArray(observedDimensions) && observedDimensions.length === 1)
            ? observedDimensions[0]
            : null;

        // ── Action → op-program compilation (the ONLY execution path) ───────
        // Every action and the collision_type velocity response are lowered to an
        // op-program here, BEFORE registerLargeObject(), so the engine receives the
        // behaviour atomically with the registration. There is no native dispatch to
        // fall back to, so there is nothing to catch: a compiler that will not load, or
        // an action that will not compile, is a bug that must surface at construction —
        // swallowing it registers a wall that silently does nothing.
        var _compile = _getCompileActions();
        var compiled = _compile(actions, name, reposition, collision_type);
        var compiledProgram = compiled.program;
        // A compiled program owns ALL behaviour, so the spec's collision_type goes to
        // NONE — the engine must never be handed a second, competing description.
        var nativeCollisionType = (compiledProgram !== null) ? CollisionTypes.NONE : collision_type;

        // Mirror the DECLARED actions on the JS-side wrapper: they are what the inspector
        // shows and what serializeDesign must round-trip to rebuild this object. (This
        // used to mirror the compiler's leftovers, which were always empty — so a saved
        // design lost its actions.)
        this.actions = actions.slice();

        // Mirror the compiled op-program so the schema inspector / conformance suite
        // can read it from the JS-side wrapper. null if nothing compiled.
        this.program = compiledProgram;

        // Emit the WIRE spec — and ONLY what the engine actually has. A LargeObject is
        // {rect, name, observed_dimensions, program, collect_collided, region}; there is no
        // collision_type, actions or reposition field on the ABI, so sending them describes
        // a configuration nothing listens to. Those three stay on the JS wrapper above,
        // where the inspector and serializeDesign read them.
        void nativeCollisionType;
        var spec = {
            rect: ra,
            name: name,
            observed_dimensions: observedDimensions || [],
        };

        // Attach the compiled op-program atomically (if any).
        // Both JS and WASM engines accept program in the registerLargeObject spec.
        if (compiledProgram !== null) {
            spec.program = compiledProgram;
        }

        // G1: attach collect_collided to spec when requested.
        // Only include when true to keep the wire-format clean (false is the default).
        if (collectCollided) {
            spec.collect_collided = true;
        }

        this.handle = universe.registerLargeObject(spec);

        // ── SELF-REGISTER INTO THE WORLD'S WRAPPER CENSUS ────────────────────
        // CONSTRUCTED = IN THE WORLD = ON SCREEN. This is the ONE wrapper construction
        // seam, so this is where THE_MINIMAL_SIM's own sentence ("LARGE OBJECTS …
        // self-registers") becomes true for RENDER as well as physics. Before this, a
        // second `runner.addLargeObject(lo)` call was required to be seen at all — a
        // shadow census whose divergence from the engine registry produced an object that
        // collided and counted correctly and was invisible in every picture, silently.
        //
        // The census lives on the WORLD (not on a host runner) because the primitive
        // surface must be reachable with no host at all: a headless rig constructs walls on
        // a bare universe, and coupling the constructor to an ambient runner would break
        // the split's first law. The renderer DERIVES its draw list from here.
        //
        // The array is created on demand so ANY universe object carries a census — there is
        // one code path, not a "if the universe supports it" fork.
        if (!Array.isArray(universe.largeObjects)) { universe.largeObjects = []; }
        universe.largeObjects.push(this);
    }

    /**
     * setRect(rect) — move/resize THIS LO: the JS wrapper's drawn rect AND the engine's
     * registered rect, in ONE call (the same pair a Wall's setRect keeps in step). `rect` is the
     * write wire in the LO's OWN form: `[l,t,w,h]` for a 2D LO, `[l,t,z,w,h,d]` for a z-capable
     * one — a mismatched form THROWS (an LO's z-capability is fixed at construction). A part
     * moving a member it owns (an emitter's Design marker) calls this. Zero physics: placement.
     * @param {number[]} rect @returns {LargeObject} this
     */
    LargeObject.prototype.setRect = function (rect) {
        var deep = (typeof this.rect.z === 'number');
        if (!Array.isArray(rect) || rect.length !== (deep ? 6 : 4) ||
            !rect.every(function (v) { return typeof v === 'number' && isFinite(v); })) {
            throw new TypeError('[LargeObject.setRect] "' + this.name + '" is a ' + (deep ? 'z-capable' : '2D') +
                ' LO and takes ' + (deep ? '[l,t,z,w,h,d]' : '[l,t,w,h]') + ' of finite numbers; got ' +
                JSON.stringify(rect) + '. (FAIL-LOUD.)');
        }
        var r = this.rect;
        if (deep) {
            r.left = rect[0]; r.top = rect[1]; r.z = rect[2]; r.w = rect[3]; r.h = rect[4]; r.d = rect[5];
        } else {
            // w/h first, then the linked left/top setters (they read the new w/h).
            r.w = rect[2]; r.h = rect[3]; r.left = rect[0]; r.top = rect[1];
        }
        if (this.universe && typeof this.universe.updateObjectProperty === 'function') {
            this.universe.updateObjectProperty(this.handle, 'LargeObject', 'rect', rect.slice());
        }
        return this;
    };

    /**
     * Change collision type at runtime (e.g. gate open/close).
     * @param {string} ct - CollisionTypes value (SCREAMING_SNAKE)
     */
    LargeObject.prototype.setCollisionType = function (ct) {
        this.collision_type = ct;
        // Pass canonical SCREAMING_SNAKE; provider translates for target engine.
        this.universe.setLargeObjectCollisionType(this.handle, ct);
    };

    /**
     * Enable/disable this large object.
     * @param {boolean} active
     */
    LargeObject.prototype.setActive = function (active) {
        this.universe.setLargeObjectActive(this.handle, active);
    };

    /**
     * Recompile this LargeObject's collision op-program from a NEW
     * collision_type/actions pair and PUSH it to the running engine (WS Studio
     * Controls Realignment S4, design §2.3.5 / CEO-ratified §4 call #7 —
     * "flipping a wall into a detector mid-run is exactly the live-drive
     * wonder"). `collision_type`/`actions` are compile-ONCE sugar inputs
     * (actionCompiler.js lowers them to an op-program at REGISTRATION,
     * `engineVisible:false` — see the schema field docs) — a bare
     * `updateObjectProperty` mirror-write to either field updates ONLY this JS
     * wrapper's display value, never the running op-program
     * (`makeControlsForObject.js` scope note #5's "mirror-only" gap). This
     * helper composes the SAME two primitives the constructor used at
     * registration time — `actionCompiler.compileActions()` +
     * `universe.updateObjectProperty(handle, 'LargeObject', 'program', …)` —
     * so a live edit actually retargets the running behavior.
     *
     * `FrqtlApp.updateObjectProperty` calls this automatically when
     * `prop` is `'collision_type'` or `'actions'` for a LargeObject/backdrop —
     * callers do not need to call this directly under normal use.
     *
     * @param {Object} [opts]
     * @param {string} [opts.collisionType] - new CollisionTypes value (SCREAMING_SNAKE).
     *   Defaults to this.collision_type (the current USER-FACING value — never
     *   the internal NONE the engine received when a program was compiled).
     * @param {Array<string>} [opts.actions] - new CollisionActions[] (SCREAMING_SNAKE).
     *   Defaults to this.actions (the currently declared actions).
     */
    LargeObject.prototype.recompileActions = function (opts) {
        opts = opts || {};
        var newCollisionType = (opts.collisionType !== undefined) ? opts.collisionType : this.collision_type;
        var newActions = (opts.actions !== undefined) ? opts.actions : this.actions;

        var compile = _getCompileActions();
        var compiled = compile(newActions, this.name, this.reposition, newCollisionType);

        var nativeCollisionType = newCollisionType;
        if (compiled.program !== null) {
            // Same G2 rule as the constructor: a compiled program takes over ALL
            // velocity behavior, so the engine's native collision_type must be NONE.
            nativeCollisionType = CollisionTypes.NONE;
        }

        // Mirror the USER-FACING values on the wrapper (inspector/serialize source of
        // truth) — collision_type stays the semantic value (e.g. 'WALL'), not the
        // internal NONE sent below (matches the constructor's own this.collision_type
        // assignment, which happens BEFORE compilation).
        this.collision_type = newCollisionType;
        this.actions = newActions.slice();
        this.program = compiled.program;

        if (this.universe && typeof this.universe.updateObjectProperty === 'function') {
            this.universe.updateObjectProperty(this.handle, 'LargeObject', 'program', compiled.program);
        }
    };

    /**
     * Full teardown (WS Studio Controls Realignment S4, design item 1): unregister
     * this LargeObject engine-side, removing its compiled collision op-program
     * (actionCompiler.js's output) and its collision registration from the
     * RUNNING engine — not just this JS wrapper's render-list membership.
     * A render-list splice alone would leave the engine registration; without
     * this call the engine keeps evaluating collisions against a "deleted"
     * object forever. Idempotent — a second call (double-delete / teardown race)
     * is a safe no-op.
     *
     * ONE call leaves BOTH censuses: `unregisterLargeObject` drops the engine
     * registration AND splices this wrapper out of the world's wrapper census (which
     * the renderer derives its draw list from), so a disposed object cannot keep
     * drawing a body that no longer collides. A universe with no unregister seam (a
     * bare stub) still loses its census entry here — the wrapper is gone either way.
     */
    LargeObject.prototype.dispose = function () {
        if (this._disposed) { return; }
        this._disposed = true;
        if (this.universe && typeof this.universe.unregisterLargeObject === 'function') {
            this.universe.unregisterLargeObject(this.handle);
        } else if (this.universe && Array.isArray(this.universe.largeObjects)) {
            var i = this.universe.largeObjects.indexOf(this);
            if (i !== -1) { this.universe.largeObjects.splice(i, 1); }
        }
    };

    // ── Statics ─────────────────────────────────────────────────────────
    // rectToArray is a pure shape helper (no engine knowledge).
    // Re-exported for consumers that need to normalize rects (e.g. CircuitGate).
    LargeObject.rectToArray = rectToArray;

    // ── Export ───────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { LargeObject };
    } else {
        window.LargeObject = LargeObject;
    }

})();
