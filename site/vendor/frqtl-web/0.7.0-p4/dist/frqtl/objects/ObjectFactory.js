/* Copyright 2023-2026 by Essam Abadir */

/**
 * ObjectFactory — registry-driven construction of all placeable object kinds.
 *
 * This is the ONE canonical construction path for every IDE-placeable kind.
 * It was extracted from lib/features/ide/project-design.js `buildObject` in
 * Phase 1 of the ObjectFactory refactor so the construction logic lives in
 * the objects layer (engine-agnostic) rather than in the IDE feature layer.
 *
 * API:
 *   ObjectFactory.create(kind, config, ctx)
 *     kind   — placeable kind string (e.g. 'QuantumEmitter', 'SlitScreen')
 *     config — override props (merged over schema defaultProps)
 *     ctx    — { runner, x, y, fromPalette? }
 *              The world size is READ from ctx.runner.canvas_rect — the rect the scene's
 *              co-init call wrote (exp.createCanvas(w, h, cfg) / exp.createScene(w, h, d, cfg));
 *              ctx carries no size of its own.
 *     returns: the DECLARED part (recorded in ctx.runner.declared); THROWS on a kind no
 *              module registered in this realm, on any build result that is not a handle,
 *              and on a member LO whose `_owner` chain does not end at the part
 *
 *   ObjectFactory.list()   → ObjectSchema.placeableCatalog()
 *   ObjectFactory.kinds()  → the registered kinds that carry a build
 *
 * Construction: the kind's registry row (objects/kinds.js — the part module registered its
 * descriptor, defaults and build when it was imported) → the generic checks below → the row's
 * `build(props, ctx)`.
 *
 * Behavior contract:
 *   - Every special case from buildObject is preserved verbatim:
 *       • QuantumEmitter / PointSource / SphereEmitter: the emitter + a visual
 *         LargeObject marker it OWNS (attachMarker); the emitter is returned.
 *       • A builder stamps nothing: each part stamps `_owner` on what it composed,
 *         and create() declares the returned part with the LOs the build added.
 *       • PointSource opts dict re-pass (_wavelength, _optColor, _emergentPhysics).
 *       • layer → observedDimensions=[layer] (null = all dims).
 *       • SlitLightSource: THROWS naming the pairing (needs a paired SlitScreen).
 *       • Unknown kind: THROW naming the registered kinds + the V2 replacement.
 */

import { ObjectSchema } from './schema/index.js';
import { kindOf, registeredKinds, unregisteredKindMessage } from './kinds.js';
import { setupSphereEmitter3D } from './setup/setupSphereEmitter3D.js';
import { SphereEmitter } from '../parts/SphereEmitter.js';
import { V1_REPLACEMENTS } from './v1-replacements.js';

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _deepCopy(obj) {
        if (obj === null || typeof obj !== 'object') { return obj; }
        if (Array.isArray(obj)) { return obj.map(_deepCopy); }
        var out = {};
        for (var k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) { out[k] = _deepCopy(obj[k]); }
        }
        return out;
    }

    /**
     * Merge schema defaultProps with caller overrides and return the merged props.
     * @param {string} kind
     * @param {object|null} config  — override props (caller-supplied)
     * @returns {object}
     */
    // Construction defaults come from ObjectSchema.defaultPropsFor(kind) — the ONE
    // per-kind default bag (the `defaults` the kind registered with, objects/kinds.js). NOT from
    // placeableCatalog(): the palette answers "what can be DROPPED in STUDIO", which
    // is a strictly smaller set (V2 stock only) than "what a recipe can construct".
    //
    function _mergeProps(kind, config) {
        var defaults = _deepCopy(ObjectSchema.defaultPropsFor(kind));
        return Object.assign({}, defaults, config || {});
    }

    // ── CONSTRUCTION_ADAPTERS — ObjectFactory's OWN cross-kind config vocabulary ──
    //
    // `create()` already threw on an unknown KIND with the registered list and the
    // V1→V2 replacement. It never looked at the config's PROP KEYS, so
    // `create('Wall', { collisonBehavior: 'bounce' })` built a wall that ignored the
    // typo and silently used its own default — the same silence the setup-factory gate
    // removes one layer up.
    //
    // The schema descriptor alone is NOT the legal set. These keys are read by the
    // builders (or forwarded verbatim into an object constructor) while being declared
    // by no kind's field list, so validating on the descriptor alone would reject
    // working callers. They are ObjectFactory's own construction API — it owns the call
    // shape — so they are declared HERE, and `objectfactory-prop-keys.test.mjs` asserts
    // each one is genuinely reachable rather than a list someone widened to silence a
    // failure.
    var CONSTRUCTION_ADAPTERS = [
        // Geometry/identity every builder resolves a rect and a name from. `x`/`y` are
        // read by RecipeContext.addObject to build ctx before create() runs.
        'x', 'y', 'w', 'h', 'left', 'top', 'rect', 'layer', 'name',
        // `preset` is expanded by the OBJECT constructor (Wall.expandWallPreset), not by
        // a builder — it reaches the constructor through the forwarded props bag.
        'preset',
        // A PointSource's construction-only opts (its builder reads them; no descriptor field).
        '_wavelength', '_optColor', '_emergentPhysics'
    ];

    // ── FORWARDED — kinds whose config bag is a PART's option bag, not just a descriptor ──
    //
    // A facade kind hands its config to a setup factory, so its legal set includes that
    // factory's vocabulary. Measured: `emissionBoxSide` is a real SphereEmitter option
    // that the descriptor does not declare, and gating on the descriptor alone would
    // reject the walkthrough's own recipes.
    //
    // CONSUMED, never retyped: `setupSphereEmitter3D.OPTIONS` and
    // `SphereEmitter.FACADE_OPTIONS` are the owners' exported contracts.
    function _forwardedVocabulary(kind) {
        if (kind !== 'SphereEmitter') { return []; }
        var out = [];
        var f = setupSphereEmitter3D;
        var o = SphereEmitter;
        if (f.OPTIONS) { out = out.concat(f.OPTIONS); }
        // Retired names pass THROUGH this gate so the owner's specific migration message
        // wins over a generic "unknown prop key" (the a1f1b324 control-D ordering, again).
        if (f.RETIRED_OPTIONS) { out = out.concat(f.RETIRED_OPTIONS); }
        if (o.FACADE_OPTIONS) { out = out.concat(o.FACADE_OPTIONS); }
        return out;
    }

    /**
     * Throw on a config key that no kind, default, adapter or forwarded vocabulary
     * declares. Every list is DERIVED (from the schema `create()` already resolved, or
     * from an owner's export) — nothing here re-enumerates another module's fields.
     */
    function _assertPropKeys(kind, config) {
        if (!config) { return; }
        var descriptor = ObjectSchema.get(kind);
        if (!descriptor || !descriptor.fields) { return; }

        var legal = {};
        descriptor.fields.forEach(function (f) { legal[f.name] = true; });
        Object.keys(ObjectSchema.defaultPropsFor(kind)).forEach(function (k) { legal[k] = true; });
        CONSTRUCTION_ADAPTERS.forEach(function (k) { legal[k] = true; });
        _forwardedVocabulary(kind).forEach(function (k) { legal[k] = true; });

        var unknown = Object.keys(config).filter(function (k) { return !legal[k]; });
        if (!unknown.length) { return; }

        var declaredFields = descriptor.fields.map(function (f) { return f.name; }).sort();
        throw new Error(
            '[ObjectFactory] create("' + kind + '"): unknown prop key' +
            (unknown.length > 1 ? 's' : '') + ' ' + unknown.map(function (k) {
                return '"' + k + '"';
            }).join(', ') + '. The builder reads only declared props, so this would have ' +
            'been merged in, read by nobody, and the object built with ITS OWN default — ' +
            'a different scene than the one you wrote, with no signal. "' + kind +
            '" declares: ' + declaredFields.join(', ') +
            '. Construction adapters: ' + CONSTRUCTION_ADAPTERS.slice().sort().join(', ') + '.'
        );
    }

    /**
     * A `writeOnly` descriptor field is a live reposition ADAPTER (a SphereEmitter's or a Tunnel's
     * `rect`): it moves a built part, and its read getter derives from the part's real position
     * fields. It is never a construction key — the part is built from those real fields — so a
     * config carrying one THROWS here rather than being dropped silently by the builder.
     */
    function _refuseWriteOnlyKeys(kind, config) {
        if (!config) { return; }
        var descriptor = ObjectSchema.get(kind);
        if (!descriptor || !descriptor.fields) { return; }
        var wo = descriptor.fields.filter(function (fd) { return fd.writeOnly === true && config[fd.name] !== undefined; });
        if (!wo.length) { return; }
        var real = descriptor.fields.filter(function (fd) { return !fd.writeOnly; }).map(function (fd) { return fd.name; });
        throw new Error('[ObjectFactory] create("' + kind + '"): "' + wo[0].name + '" is a write-only reposition ' +
            'adapter (it moves a built ' + kind + '), not a construction key. Declare the position with the ' +
            'fields the part is built from: ' + real.join(', ') + '. (FAIL-LOUD.)');
    }


    // How many objects of `kind` this runner has declared — the ordinal a numbered default name
    // ('emitter N', 'source N') carries.
    function declaredCount(runner, kind) {
        return runner.declared.filter(function (d) { return d._schemaKind === kind; }).length;
    }

    // ── ObjectFactory ─────────────────────────────────────────────────────────

    var ObjectFactory = {
        /**
         * Construct a placeable object of the given kind and DECLARE it: the part the builder
         * returns (never one of its members) is recorded in `ctx.runner.declared` with the census LOs
         * the build added as its members and the host tick-functions the build pushed
         * (`FrqtlApp.declare` — this is its ONE call site). What a
         * declaring call (`exp.addObject`, `exp.declare`, a palette drop) produced is what STUDIO
         * holds; a part's composition is never declared.
         *
         * FAIL-LOUD: an unknown kind THROWS naming the registered kinds and, when
         * the kind is a removed V1 part, its V2 replacement composition. A recipe
         * whose builder no longer exists must never half-run into a scene with
         * missing parts.
         *
         * @param {string|Function} kind — the kind name, or its registered class
         * @param {object|null} config  — override props (merged over schema defaultProps)
         * @param {object} ctx          — { runner, x, y, fromPalette? } (the size is runner.canvas_rect)
         * @returns {object}            — the declared part (a Tunnel, not its plate; a SphereEmitter, not its marker)
         * @throws {Error} on a kind no module registered here, a kind registered without a build,
         *                 a ctx without a runner, or a build result that is not a handle
         */
        create: function (kind, config, ctx) {
            if (!ctx || !ctx.runner) {
                throw new Error('[ObjectFactory] create("' + kind + '"): ctx.runner is required — ' +
                    'pass { runner, x, y }.');
            }
            if (typeof kind === 'function') {
                // A kind is named by its class: the class itself is the import-form spelling.
                if (!kindOf(kind)) {
                    throw new Error('[ObjectFactory] create: the class ' + (kind.name || '(anonymous)') + ' is not a ' +
                        'registered kind in this realm — ' + unregisteredKindMessage(kind.name || '?') + '. (FAIL-LOUD.)');
                }
                kind = kind.name;
            }
            var row = kindOf(kind);
            if (!row) {
                var msg = '[ObjectFactory] create: unknown kind "' + kind + '". Registered kinds: ' +
                    ObjectFactory.kinds().slice().sort().join(', ') + '. The ' + unregisteredKindMessage(kind) + '.';
                if (Object.prototype.hasOwnProperty.call(V1_REPLACEMENTS, kind)) {
                    msg += ' "' + kind + '" is a retired V1 part, not a published part — compose ' + V1_REPLACEMENTS[kind] + ' instead.';
                }
                throw new Error(msg + ' (FAIL-LOUD.)');
            }
            if (typeof row.build !== 'function') {
                throw new Error('[ObjectFactory] create: kind "' + kind + '" registers a descriptor only — it is not ' +
                    'constructed by ObjectFactory; construct it with new ' + kind + '(…) (' + row.from + '). (FAIL-LOUD.)');
            }

            // ORDER IS LOAD-BEARING: the unknown-KIND throw runs first (it names the V1→V2
            // replacement), then the prop-key check, then the merge. Validating props for a
            // kind that does not exist would replace a useful migration message with a
            // confusing field list.
            _assertPropKeys(kind, config);
            _refuseWriteOnlyKeys(kind, config);

            var props = _mergeProps(kind, config);

            var runner = ctx.runner;
            var before = new Set(runner.largeObjects);
            var tfs = (runner.universe && Array.isArray(runner.universe.experimentTickFunctions))
                ? runner.universe.experimentTickFunctions : null;
            var ticksBefore = new Set(tfs || []);
            var handle = row.build(props, ctx, row.Class);   // the registry builds the class that registered
            if (handle === null || typeof handle !== 'object') {
                throw new Error('[ObjectFactory] create("' + kind + '"): the builder returned ' +
                    (handle === null ? 'null' : typeof handle) + ', not a handle. Every kind returns ' +
                    'the object it built or throws naming what is missing — a non-handle here is a ' +
                    'part silently absent from the scene. (FAIL-LOUD.)');
            }
            if (typeof runner.declare !== 'function') {
                throw new Error('[ObjectFactory] create("' + kind + '"): ctx.runner has no declare() — the ' +
                    'runner (FrqtlApp) owns the declared-object registry every created part is recorded in. ' +
                    '(FAIL-LOUD.)');
            }
            // THE ONE REGISTRATION SITE: what a declaring call produced is the declared object; its
            // members are exactly the census LOs the build added (each must resolve up `_owner` to it).
            var members = runner.largeObjects.filter(function (lo) { return !before.has(lo); });
            if (!members.length) {
                throw new Error('[ObjectFactory] create("' + kind + '"): the build put nothing in the world — ' +
                    'every part draws at least one LO, so a part with none is silently absent from the ' +
                    'scene. (FAIL-LOUD.)');
            }
            // ... and the host tick-functions it pushed are the declaration's too (an emitter's emit
            // fn, an absorb radiator): behaviour the declaration owns.
            var tfsAfter = (runner.universe && Array.isArray(runner.universe.experimentTickFunctions))
                ? runner.universe.experimentTickFunctions : [];
            var ticks = tfsAfter.filter(function (fn) { return !ticksBefore.has(fn); });
            runner.declare(handle, members, ticks, { kind: kind });
            return handle;
        },

        /**
         * Returns the schema-driven palette catalog.
         * Delegates to ObjectSchema.placeableCatalog().
         * @returns {Array}
         */
        list: function () {
            return ObjectSchema.placeableCatalog();
        },

        /**
         * The registered kinds that carry a build (constructible through create()).
         * @returns {string[]}
         */
        kinds: function () {
            return registeredKinds().filter(function (k) { return typeof kindOf(k).build === 'function'; });
        }
    };

    // ── Export ────────────────────────────────────────────────────────────────

export { ObjectFactory, declaredCount };

