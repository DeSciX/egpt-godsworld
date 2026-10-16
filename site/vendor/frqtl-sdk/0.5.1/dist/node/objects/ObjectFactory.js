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
 *     ctx    — { runner, cw, x, y }
 *              The world size is READ from ctx.runner.canvas_rect — the rect the scene's
 *              co-init call wrote (exp.createCanvas(w, h, cfg) / exp.createScene(w, h, d, cfg));
 *              ctx carries no size of its own.
 *              cw  = iframe contentWindow when called from the parent React tree;
 *                    omit (or pass null) when called from inside the iframe —
 *                    class globals resolve from window in that case.
 *     returns: the DECLARED part (recorded in ctx.runner.declared); THROWS on an
 *              unknown kind, on a part class absent from the construction scope, on
 *              any builder result that is not a handle, and on a member LO whose
 *              `_owner` chain does not end at the part
 *
 *   ObjectFactory.list()   → ObjectSchema.placeableCatalog()
 *   ObjectFactory.kinds()  → array of registered builder keys
 *
 * Class resolution:
 *   Builders resolve engine globals from
 *     (ctx.cw || (typeof window !== 'undefined' ? window : globalThis))
 *   so the factory works BOTH when called from the parent with ctx.cw = iframe
 *   window AND when called from inside the iframe with no cw.
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

(function () {
    'use strict';

    // ── Schema import ─────────────────────────────────────────────────────────

    var ObjectSchema;

    if (typeof module !== 'undefined' && module.exports) {
        ObjectSchema = require('./schema/index').ObjectSchema;
    } else {
        ObjectSchema = window.ObjectSchema;
    }

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
     * @param {object} schemaRef    — ObjectSchema instance (from ctx.cw or module)
     * @returns {object}
     */
    // A "chart source" is any Wall facade exposing a between-tick read method the LiveChart
    // wiring's projectors consume: getCollisionHistogram (detectorHistogram), getAbsorbStats
    // (absorberStats) OR getLiveCount (liveCount). ObjectFactory only needs to know a handle is
    // PLAUSIBLE — the wiring (lib/components/live-chart-wiring PROJECTOR_SPEC, above the shim)
    // owns the projector→method dispatch and surfaces projector/source mismatches at WIRE time
    // (FAIL-LOUD).
    function _isChartSource(obj) {
        return !!obj && (typeof obj.getCollisionHistogram === 'function' ||
                         typeof obj.getAbsorbStats === 'function' ||
                         typeof obj.getLiveCount === 'function');
    }

    /** Resolve a chart source by NAME through the runner's declared registry (the ONE by-name
     *  authority — FrqtlApp.getObjectByName). Null when nothing declared matches; the caller
     *  decides whether that is FAIL-LOUD. */
    function _resolveHistogramSource(runner, name) {
        if (!runner || typeof runner.getObjectByName !== 'function') {
            throw new Error('[ObjectFactory] a named LiveChart source resolves through runner.getObjectByName ' +
                '(the declared-object registry); this runner has none. (FAIL-LOUD.)');
        }
        return runner.getObjectByName(name, _isChartSource);
    }

    // Construction defaults come from ObjectSchema.defaultPropsFor(kind) — the ONE
    // per-kind default bag (schema/index.js KIND_DEFAULT_PROPS). NOT from
    // placeableCatalog(): the palette answers "what can be DROPPED in STUDIO", which
    // is a strictly smaller set (V2 stock only) than "what a recipe can construct".
    //
    // FAIL-LOUD on a schema without the accessor. `create()` resolves schemaRef from
    // gbl.ObjectSchema (the iframe/canvas-frame path), so a version-skewed schema can
    // arrive here lacking `defaultPropsFor`. Duck-typing that away to `{}` would
    // SILENTLY construct every object with no defaults — precisely the default-loss
    // bug this accessor exists to prevent, reintroduced through the skew window. The
    // pre-split code called placeableCatalog() unguarded and threw; this keeps that
    // contract, and names the canonical schema so the skew is diagnosable.
    function _mergeProps(kind, config, schemaRef) {
        if (schemaRef && typeof schemaRef.defaultPropsFor !== 'function') {
            throw new Error('[ObjectFactory] create("' + kind + '"): the resolved ObjectSchema has no ' +
                'defaultPropsFor() — construction defaults have ONE authority ' +
                '(KIND_DEFAULT_PROPS in lib/frqtl/objects/schema/index.js, read through ' +
                'ObjectSchema.defaultPropsFor). This is a stale/skewed schema in the active ' +
                'scope (window.ObjectSchema or ctx.cw.ObjectSchema); reload the canonical one. ' +
                '(Never silently defaulted to {} — that would construct every object bare.)');
        }
        var declared = schemaRef ? schemaRef.defaultPropsFor(kind) : null;
        var defaults = declared ? _deepCopy(declared) : {};
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
        // Codegen round-trip adapters: a PointSource's construction-only opts, which codegen
        // writes back onto its config (lib/features/ide/codegen.js).
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
    // `SphereEmitter.FACADE_OPTIONS` are the owners' exported contracts. Resolved
    // LAZILY (the browser sets these globals as the game layer loads, and requiring
    // SphereEmitter.js from here would invert the object → factory arrow).
    function _forwardedVocabulary(kind, gbl) {
        if (kind !== 'SphereEmitter') { return []; }
        var out = [];
        var f = (gbl && gbl.setupSphereEmitter3D) ||
                (typeof module !== 'undefined' && module.exports
                    ? require('./setup/setupSphereEmitter3D').setupSphereEmitter3D : null);
        var o = (gbl && gbl.SphereEmitter) ||
                (typeof module !== 'undefined' && module.exports
                    ? require('./objects/SphereEmitter').SphereEmitter : null);
        if (f && f.OPTIONS) { out = out.concat(f.OPTIONS); }
        // Retired names pass THROUGH this gate so the owner's specific migration message
        // wins over a generic "unknown prop key" (the a1f1b324 control-D ordering, again).
        if (f && f.RETIRED_OPTIONS) { out = out.concat(f.RETIRED_OPTIONS); }
        if (o && o.FACADE_OPTIONS) { out = out.concat(o.FACADE_OPTIONS); }
        return out;
    }

    /**
     * Throw on a config key that no kind, default, adapter or forwarded vocabulary
     * declares. Every list is DERIVED (from the schema `create()` already resolved, or
     * from an owner's export) — nothing here re-enumerates another module's fields.
     */
    function _assertPropKeys(kind, config, schemaRef, gbl) {
        if (!config) { return; }
        // No schema resolved ⇒ engine-visibility and field lists are unknown; the
        // method's already-documented degraded mode stands rather than being widened
        // into a throw over keys we cannot evaluate.
        if (!schemaRef || typeof schemaRef.get !== 'function') { return; }
        var descriptor = schemaRef.get(kind);
        if (!descriptor || !descriptor.fields) { return; }

        var legal = {};
        descriptor.fields.forEach(function (f) { legal[f.name] = true; });
        Object.keys(schemaRef.defaultPropsFor(kind) || {}).forEach(function (k) { legal[k] = true; });
        CONSTRUCTION_ADAPTERS.forEach(function (k) { legal[k] = true; });
        _forwardedVocabulary(kind, gbl).forEach(function (k) { legal[k] = true; });

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
    function _refuseWriteOnlyKeys(kind, config, schemaRef) {
        if (!config || !schemaRef || typeof schemaRef.get !== 'function') { return; }
        var descriptor = schemaRef.get(kind);
        if (!descriptor || !descriptor.fields) { return; }
        var wo = descriptor.fields.filter(function (fd) { return fd.writeOnly === true && config[fd.name] !== undefined; });
        if (!wo.length) { return; }
        var real = descriptor.fields.filter(function (fd) { return !fd.writeOnly; }).map(function (fd) { return fd.name; });
        throw new Error('[ObjectFactory] create("' + kind + '"): "' + wo[0].name + '" is a write-only reposition ' +
            'adapter (it moves a built ' + kind + '), not a construction key. Declare the position with the ' +
            'fields the part is built from: ' + real.join(', ') + '. (FAIL-LOUD.)');
    }

    // ── V1 → V2 port map (the ONE authority for "what replaced this kind") ────
    //
    // Every removed V1 kind names its V2 composition here, so an unknown-kind
    // throw TELLS the author what to build instead of leaving them to guess.
    // Rulings: docs/internal/engine/V2_PARTS_CLASSIFICATION.md §4.3/§4.4.

    var V1_REPLACEMENTS = {
        DetectorWall:    "Wall{ collisionBehavior:'destroy', hooks:['count'] }  (preset 'detector-screen')",
        SlitScreen:      "Wall{ collisionBehavior:'destroy' } slabs + Tunnel{ mode:'directed', exitCollapse }",
        DSEWall:         "Wall{ collisionBehavior:'destroy' } slabs + one Tunnel{ mode:'directed' } per passage",
        SlitLightSource: "SphereEmitter{ preset:'laser' }",
        QuantumEmitter:  "SphereEmitter",
        PointSource:     "SphereEmitter{ preset:'drum' | 'spherical' }",
        DirectedTunnel:  "Tunnel{ mode:'directed' }",
        LightSource:     "SphereEmitter{ preset:'hemisphere' | 'laser' } + Tunnel",
        Tube:            "Tunnel (with Wall end caps)",
        ChamberEmitter:  "SphereEmitter + Tunnel (with Wall end caps)",
        Gun:             "Tunnel + SphereEmitter, composed at the sketch level",
        Bullet:          "Wall{ collisionBehavior:'bounce' } moved by a sketch tick-fn through setRect",
        Box:             "four Wall{ collisionBehavior:'block' } slabs",
        OvenBox:         "Wall{ collisionBehavior:'absorb' } + SphereEmitter{ emissionCap, gateCounter }",
        CircuitGate:     "LogicGate (the stock V2 gate: Wall{'destroy',['count']} input ammeters + Tunnel{'mirror'} channel + SphereEmitter rail + Wall{'destroy'} shunt valve)",
        CircuitProbe:    "Wall preset 'transparent-probe'",
        LeafField:       "(archived — no V2 successor)",
        EgptFractal:     "(archived — no V2 successor)"
    };

    /**
     * Resolve a part class from the construction scope, or THROW naming it and the
     * game-layer script that publishes it. A missing class never degrades to a null
     * handle or a marker-less emitter: a recipe would build an incomplete scene and
     * report success. Resolve every class a builder needs BEFORE constructing anything,
     * so a throw never leaves a half-built object registered in the world.
     */
    function _requireClass(kind, gbl, name) {
        var Cls = gbl[name];
        if (Cls) { return Cls; }
        throw new Error('[ObjectFactory] create("' + kind + '"): class `' + name + '` is not published ' +
            'on the construction scope (ctx.cw, else window/globalThis). It is published by `' + name +
            '.js`, its GAME_LAYER_SCRIPTS entry (lib/shim/engine/game-layer-manifest.js): in a page the ' +
            'GAME phase of stack-boot loads it before any object is built; in node, require that module ' +
            'and publish the class on globalThis first. (FAIL-LOUD — never a null handle.)');
    }

    // How many objects of `kind` this runner has declared — the ordinal a numbered default name
    // ('emitter N', 'source N') carries.
    function _declaredCount(runner, kind) {
        return runner.declared.filter(function (d) { return d._schemaKind === kind; }).length;
    }

    // ── Per-kind builders ─────────────────────────────────────────────────────
    //
    // Each builder: function(props, ctx, gbl) → handle (create() throws on anything else)
    //   props = merged schema defaultProps + config overrides
    //   ctx   = { runner, cw, x, y }
    //   gbl   = resolved global scope (ctx.cw || window || globalThis)

    var _builders = {};

    // The schema a construction resolves: the one on the construction scope first, so it stays
    // consistent with the engine's own class scope (the iframe path), else this module's.
    function _schemaRef(gbl) {
        return gbl.ObjectSchema || ObjectSchema;
    }

    // The world rect a size-reading builder spans: the runner's canvas_rect, written ONCE by the
    // scene's co-init call, read through THE world-rect normalizer (ObjectSchema.worldRect) —
    // absent or non-positive THROWS naming the co-init. No default, no predicate of its own.
    function _worldRect(kind, ctx, gbl) {
        return _schemaRef(gbl).worldRect(ctx.runner.canvas_rect,
            'ObjectFactory create("' + kind + '") runner.canvas_rect');
    }

    // ── LargeObject ──────────────────────────────────────────────────────────
    _builders['LargeObject'] = function (props, ctx, gbl) {
        var LO = _requireClass('LargeObject', gbl, 'LargeObject');
        _requireClass('LargeObject', gbl, 'CollisionTypes');
        var bw = (props.rect && props.rect.w)    || 70;
        var bh = (props.rect && props.rect.h)    || 70;
        var bl = (props.rect && props.rect.left  != null) ? props.rect.left : Math.round(ctx.x - bw / 2);
        var bt = (props.rect && props.rect.top   != null) ? props.rect.top  : Math.round(ctx.y - bh / 2);
        var ctype = props.collision_type || 'RANDOM_XY';
        var actions = props.actions || [];
        var loName = props.name || ('block ' + (ctx.runner.largeObjects.length + 1));
        var reposition = props.reposition || 'closest';
        var color = props.color || [210, 90, 90];
        // layer → observedDimensions: pass [layer] to scope to a single dimension, null for all.
        var loObsDims = (props.layer != null) ? [props.layer] : null;
        // search_padding (arg #8) is a reserved/unused positional placeholder — the engine ignores
        // it (collision search rect expands by dim.mb_w). Pass 1 to keep `color` (#9) in position.
        var lo = new LO(ctx.runner.universe, [bl, bt, bw, bh], ctype, actions, loName,
                        reposition, loObsDims, 1, color);
        if (props.alpha        != null) { lo.alpha        = props.alpha; }
        if (props.visible      != null) { lo.visible      = props.visible; }
        if (props.drawAsCircle != null) { lo.drawAsCircle = props.drawAsCircle; }
        lo._schemaKind = 'LargeObject';
        return lo;
    };

    // ── QuantumEmitter ───────────────────────────────────────────────────────
    _builders['QuantumEmitter'] = function (props, ctx, gbl) {
        var QE  = _requireClass('QuantumEmitter', gbl, 'QuantumEmitter');
        var LO2 = _requireClass('QuantumEmitter', gbl, 'LargeObject');
        var CT2 = _requireClass('QuantumEmitter', gbl, 'CollisionTypes');
        var ew = 20, eh = 20;
        var er;
        if (props.rect) {
            er = [props.rect.left || 0, props.rect.top || 0,
                  props.rect.w   || ew, props.rect.h   || eh];
        } else if (props.source_rects && props.source_rects.length) {
            var sr0 = props.source_rects[0];
            er = sr0.slice ? sr0.slice() : sr0;
        } else {
            er = [Math.round(ctx.x - ew / 2), Math.round(ctx.y - eh / 2), ew, eh];
        }
        // Bug #1 fix: pass null as raw charge; set chargeMode via the sugar setter AFTER
        // construction so the correct underlying engine handles are registered.
        // The old props.charge path was broken: the schema only captures chargeMode now.
        var qemitter = new QE(
            ctx.runner.universe,
            [er.slice ? er.slice() : er],
            props.vx         != null ? props.vx         : 1,
            props.vy         != null ? props.vy         : 0,
            props.burst_size != null ? props.burst_size : 1,
            null,   // raw charge — overridden immediately below via chargeMode setter
            props.auto_fire  != null ? props.auto_fire  : true,
            props.random_direction != null ? props.random_direction : false,
            props.quantum_limit    != null ? props.quantum_limit    : Infinity,
            props.delay      != null ? props.delay      : 0,
            props.wrap       || false
        );
        qemitter._schemaKind = 'QuantumEmitter';
        // Restore chargeMode via the sugar setter (handles 'random'|'positive'|'negative'|'both').
        if (props.chargeMode) { qemitter.chargeMode = props.chargeMode; }
        if (props.colorOverride) { qemitter.colorOverride = props.colorOverride; }

        // Visual handle (circle LargeObject) so hand tool can drag it.
        // layer → observedDimensions: the visual handle tracks the emitter's layer.
        var qvisObsDims = (props.layer != null) ? [props.layer] : null;
        var qName = props.name || ('emitter ' + _declaredCount(ctx.runner, 'QuantumEmitter'));
        qemitter.name = qName;   // the declared name is the emitter's; its marker wears it
        var qvis = new LO2(ctx.runner.universe,
            [er[0], er[1], er[2] || ew, er[3] || eh],
            CT2.NONE, [],
            qName,
            'closest', qvisObsDims, 1, props.color || [80, 200, 80]);
        qvis.drawAsCircle = true;
        qvis._schemaKind  = 'LargeObject';
        qemitter.attachMarker(qvis);
        return qemitter;
    };

    // ── PointSource ──────────────────────────────────────────────────────────
    //
    // Reconstructs both the PointSource emitter AND a visual circle LargeObject
    // handle (so the restored source is visible and hand-draggable, just like a
    // QuantumEmitter). The marker is the source's x/y/diameter, owned by the source.
    _builders['PointSource'] = function (props, ctx, gbl) {
        var PS  = _requireClass('PointSource', gbl, 'PointSource');
        var LO3 = _requireClass('PointSource', gbl, 'LargeObject');
        var CT3 = _requireClass('PointSource', gbl, 'CollisionTypes');
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
        ps._schemaKind = 'PointSource';
        // Restore chargeMode via the sugar setter (handles 'random'|'positive'|'negative'|'both').
        if (props.chargeMode) { ps.chargeMode = props.chargeMode; }
        if (props.colorOverride) { ps.colorOverride = props.colorOverride; }

        // Visual handle: circle LargeObject at the source position (its x/y/diameter).
        var psVLeft = Math.round(psCx - psDiam / 2), psVTop = Math.round(psCy - psDiam / 2);
        var psVW = psDiam, psVH = psDiam;
        var psName = props.name || ('source ' + _declaredCount(ctx.runner, 'PointSource'));
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
    };

    // ── SphereEmitter ────────────────────────────────────────────────────────
    //
    // The manipulable palette face over setupSphereEmitter3D (Bite 4b). Mirrors the
    // QuantumEmitter/PointSource pattern: build the emitter, then a NONE-collision
    // circle LargeObject "marker" the emitter OWNS (attachMarker), and return the
    // emitter — the declared object STUDIO picks, drags and carries. SU1:
    // the marker is NONE-collision + not a leaf → pure render/control surface, zero
    // physics. The emitter itself is the SphereEmitter facade (pure delegation over
    // setupSphereEmitter3D). It is a PART: it never inits the world — the SKETCH
    // (the recipe's co-init call / a page's setup factory) did that before any object.
    _builders['SphereEmitter'] = function (props, ctx, gbl) {
        var SphereEmitterCls = _requireClass('SphereEmitter', gbl, 'SphereEmitter');

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
        var LO = _requireClass('SphereEmitter', gbl, 'LargeObject');
        var CT = _requireClass('SphereEmitter', gbl, 'CollisionTypes');
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
        // Shell render defaults (Bite 5b R2-3) so the Inspector's Shell section seeds live
        // controls (render-only; no visual change — alpha 255 = opaque, shellRender 'design'
        // = the Bite-4b marker default, shellShape 'circle' = the current drawAsCircle look).
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
    };

    // ── Wall ─────────────────────────────────────────────────────────────────
    //
    // The first-class wall primitive (W1). Builds a Wall facade over ONE
    // engine-registered LargeObject (Wall.js resolves the collision lexicon to an
    // op-program via actionCompiler), adds its inner LO to the render list, and returns
    // the FACADE (so the Inspector sees kind 'Wall' + the lexicon fields). Honors a
    // palette DROP's click point (ctx.x/ctx.y) exactly as the LargeObject builder
    // does: when the recipe/opts do NOT declare placement, center the wall's rect on
    // the click. A recipe passing an explicit rect / left+top still wins (byte-
    // identical addObject path).
    _builders['Wall'] = function (props, ctx, gbl) {
        var WallCls = _requireClass('Wall', gbl, 'Wall');

        var opts = {};
        for (var k in props) {
            if (!Object.prototype.hasOwnProperty.call(props, k)) { continue; }
            opts[k] = props[k];
        }
        // Derive the rect from the drop point when the recipe declared no placement.
        if (opts.rect == null && opts.left == null) {
            var ww = (opts.w != null) ? opts.w : 12;
            var wh = (opts.h != null) ? opts.h : 120;
            opts.left = Math.round(ctx.x - ww / 2);
            opts.top  = Math.round(ctx.y - wh / 2);
            opts.w = ww;
            opts.h = wh;
        }
        // R#101 (2026-09-28) — a palette DROP into a 3D scene is a FULL-SCENE-DEPTH slab
        // by default. A bare 4-element rect reaches the engine as z=0/depth=w (the
        // back-compat promotion) — a ~w-thin plate a directed stream walks around in z
        // (measured: 146/300 crossers in 30 ticks, vs ~0 through a full-depth wall). The
        // z-band is CONSUMED from the runner's ONE bounds read (`FrqtlApp.worldBounds`:
        // the TickData boundary_rect ferry once ticked, the init-time initBounds read-back
        // before) — never hand-typed. An explicit z / d / depth / z-carrying rect wins
        // untouched, and the recipe path (no fromPalette) stays byte-identical.
        // 3D-ness is the WORLD's (its resolved axes), never a boot global.
        var u3 = ctx.runner && ctx.runner.universe;
        if (ctx.fromPalette && u3 && u3.activeAxes && u3.activeAxes.z &&
            opts.z === undefined && opts.d === undefined && opts.depth === undefined &&
            !(opts.rect && (Array.isArray(opts.rect)
                ? opts.rect.length === 6
                : (opts.rect.z !== undefined || opts.rect.d !== undefined)))) {
            var wb = ctx.runner && ctx.runner.worldBounds;
            if (!wb || typeof wb.near !== 'number' || typeof wb.d !== 'number') {
                throw new Error('[ObjectFactory] create("Wall"): a 3D palette drop derives its ' +
                    'z-slab from the scene bounds (runner.worldBounds — the TickData ' +
                    'boundary_rect ferry / init-time initBounds read-back), but the runner ' +
                    'publishes none. (FAIL-LOUD — a depth-less wall in a 3D scene is the ' +
                    'z-leak this default repairs.)');
            }
            opts.z = wb.near;
            opts.depth = wb.d;
        }
        // Palette drops are census-numbered like every other numbered drop ('block N',
        // 'sphere emitter N', 'livechart N'): repeated bare drops otherwise all read
        // "wall" in LAYERS and collide in name-based lookups. Recipe path unchanged
        // (no fromPalette => Wall's own bare default; an explicit name always wins).
        if (ctx.fromPalette && opts.name == null) {
            opts.name = 'wall ' + (ctx.runner.largeObjects.length + 1);
        }
        return new WallCls(ctx.runner.universe, opts);
    };

    // ── GraphingDetectorWall ─────────────────────────────────────────────────
    //
    // A counting detector screen that paints its OWN registered hit heatmap onto
    // its faces (presentation pass Item 1). It EXTENDS Wall, so this builder is
    // the Wall builder's twin: same opts pass-through, same F1 drop idiom.
    _builders['GraphingDetectorWall'] = function (props, ctx, gbl) {
        var GDW = _requireClass('GraphingDetectorWall', gbl, 'GraphingDetectorWall');

        var opts = {};
        for (var k in props) {
            if (!Object.prototype.hasOwnProperty.call(props, k)) { continue; }
            opts[k] = props[k];
        }
        if (opts.rect == null && opts.left == null) {
            var ww = (opts.w != null) ? opts.w : 20;
            var wh = (opts.h != null) ? opts.h : 200;
            opts.left = Math.round(ctx.x - ww / 2);
            opts.top  = Math.round(ctx.y - wh / 2);
            opts.w = ww;
            opts.h = wh;
        }
        return new GDW(ctx.runner.universe, opts);
    };

    // ── DetectorWall ─────────────────────────────────────────────────────────
    _builders['DetectorWall'] = function (props, ctx, gbl) {
        var DW = _requireClass('DetectorWall', gbl, 'DetectorWall');
        var world = _worldRect('DetectorWall', ctx, gbl);
        var pw = world.w;
        var ph = world.h;
        var dw = new DW(
            ctx.runner.universe,
            { w: pw, h: ph },
            props.wallX != null ? props.wallX : Math.round(ctx.x),
            props.wallY != null ? props.wallY : 0,
            props.wallCollisionType || 'NONE',
            props.wallColor  || [120, 200, 120],
            props.wallHeight || ph,
            props.wallWidth  || 20,
            props.wallName   || ('detector ' + Date.now())
        );
        if (!dw.detector_wall) {
            throw new Error('[ObjectFactory] create("DetectorWall"): the DetectorWall was constructed but ' +
                'exposes no `detector_wall` (the registered inner LargeObject this kind hands back) — ' +
                'nothing placeable was built. (FAIL-LOUD.)');
        }
        dw._schemaKind = 'DetectorWall';
        return dw;
    };

    // ── LiveChart ────────────────────────────────────────────────────────────
    //
    // An in-scene live chart of a counting Wall's histogram (the C-workstream visual
    // sugar object). Builds a NONE-collision, render-only LargeObject (zero physics,
    // SU1 — like a backdrop) carrying a `chartSpec` bag + an empty `liveCanvas` ferry
    // slot. The chart is DRAWN by the host wiring (lib/components/live-chart-wiring),
    // which renders Chart.js to an OFFSCREEN canvas and assigns it onto lo.liveCanvas;
    // the providers composite that canvas natively (p5 image / three CanvasTexture).
    // The object imports NO Chart.js — it stays pure sugar below the shim.
    //
    // `source` accepts a direct counting-Wall handle (getCollisionHistogram) OR its
    // name string. A named source is resolved here at build time — MISSING → THROW
    // (FAIL-LOUD build-time). The count-hook validity (a detect/count wall) is surfaced
    // at WIRE time by letting Wall.getCollisionHistogram's own throw propagate.
    _builders['LiveChart'] = function (props, ctx, gbl) {
        var LO = _requireClass('LiveChart', gbl, 'LargeObject');
        var CT = _requireClass('LiveChart', gbl, 'CollisionTypes');

        // Rect: an explicit rect (array [l,t,w,h] / [l,t,z,w,h,d] OR object {left,top,w,h})
        // wins; else center a default panel on the drop point (ctx.x/ctx.y).
        var _r = props.rect;
        var cw, ch, cl, ct;
        if (Array.isArray(_r)) {
            if (_r.length >= 6) { cl = _r[0]; ct = _r[1]; cw = _r[3]; ch = _r[4]; }
            else { cl = _r[0]; ct = _r[1]; cw = _r[2]; ch = _r[3]; }
        } else if (_r && _r.left != null) {
            cl = _r.left; ct = _r.top; cw = _r.w; ch = _r.h;
        } else {
            cw = props.w || 200;
            ch = props.h || 140;
            cl = Math.round(ctx.x - cw / 2);
            ct = Math.round(ctx.y - ch / 2);
        }
        var name  = props.name  || ('livechart ' + (ctx.runner.largeObjects.length + 1));
        var color = props.color || [30, 40, 55];

        var lo = new LO(ctx.runner.universe, [cl, ct, cw, ch], CT.NONE, [], name,
                        'closest', null, 1, color);
        if (props.alpha   != null) { lo.alpha   = props.alpha; }
        if (props.visible != null) { lo.visible = props.visible; }
        lo._schemaKind = 'LiveChart';

        // Resolve the source (handle | name | unbound).
        var source = props.source;
        var sourceHandle = null, sourceName = null;
        if (source && typeof source === 'object' && _isChartSource(source)) {
            sourceHandle = source;
            sourceName   = (typeof source.name === 'string') ? source.name : null;
        } else if (typeof source === 'string' && source) {
            sourceName   = source;
            sourceHandle = _resolveHistogramSource(ctx.runner, source);
            if (!sourceHandle) {
                throw new Error('[ObjectFactory] LiveChart source wall "' + source +
                    '" not found among the registered objects — a LiveChart must be pointed ' +
                    'at an already-added counting/absorbing Wall (by name or handle). (FAIL-LOUD.)');
            }
        } else if (source != null) {
            throw new Error('[ObjectFactory] LiveChart `source` must be a Wall handle ' +
                '(exposing getCollisionHistogram or getAbsorbStats) or its name string; got ' +
                typeof source + '. (FAIL-LOUD.)');
        }
        // source == null → an unbound chart (bare palette drop); the host wiring skips
        // it until a source is set (it draws its empty panel shell meanwhile).

        var projector = props.projector || 'detectorHistogram';
        // Orientation: explicit 0|90 wins; else DEFAULT a detectorHistogram chart to 90 (the
        // GYM detector-aligned horizontal-bar presentation — a detector column-profile stacks
        // along y beside the vertical detector wall), any other projector (e.g. absorberStats,
        // a 3-bar ledger) to 0 (standard vertical bars). CEO ruling 2026-07-24 (Living Log df36a229).
        var orientation;
        if (props.orientation === 90 || props.orientation === '90') { orientation = 90; }
        else if (props.orientation === 0 || props.orientation === '0') { orientation = 0; }
        else { orientation = (projector === 'detectorHistogram') ? 90 : 0; }
        // Mirror onto the LO wrapper as the render-only, Inspector-live field (updateObjectProperty
        // mirror-writes lo.orientation); the wiring reads it live with a chartSpec fallback.
        lo.orientation = String(orientation);

        lo.chartSpec = {
            source:       sourceName,                       // serializable name (or null)
            sourceHandle: sourceHandle,                     // resolved handle (runtime only; or null)
            projector:    projector,
            kind:         (props.series === 'line') ? 'line' : 'bar',
            label:        props.label || sourceName || 'detector',
            refreshMs:    (typeof props.refreshMs === 'number') ? props.refreshMs : 100,
            orientation:  orientation                       // 0 | 90 (numeric default; lo.orientation is the live source)
        };
        // Mirror the SERIALIZABLE chartSpec fields onto the LO under their DESCRIPTOR
        // names (restart-bug fix, 2026-07-25): captureProps(lo, LiveChartDescriptor)
        // reads lo[field.name], so without these mirrors a codegen round-trip (Save /
        // Restart evals the generated module) silently rebuilt every chart UNBOUND
        // with default projector/label ("detector"). The name string — never the live
        // sourceHandle — is the captured source (re-resolved here on rebuild).
        lo.source    = sourceName;
        lo.projector = projector;
        lo.series    = lo.chartSpec.kind;
        lo.label     = lo.chartSpec.label;
        lo.refreshMs = lo.chartSpec.refreshMs;
        lo.liveCanvas = null;   // empty ferry slot — the host wiring assigns the rendered canvas

        return lo;
    };

    // ── SlitScreen ───────────────────────────────────────────────────────────
    _builders['SlitScreen'] = function (props, ctx, gbl) {
        var SS = _requireClass('SlitScreen', gbl, 'SlitScreen');
        var ph = _worldRect('SlitScreen', ctx, gbl).h;
        var screen = new SS(
            ctx.runner.universe,
            props.slit_group_left != null ? props.slit_group_left : Math.round(ctx.x),
            props.slit_width      || 8,
            ph,
            props.wavelength      || 20,
            props.absorbAtSlitWall != null ? props.absorbAtSlitWall : true,
            props.detectAtSlits    != null ? props.detectAtSlits    : 0,
            props.slit_height,
            props.slit_wall_gap_height
        );
        screen._schemaKind = 'SlitScreen';
        return screen;
    };

    // ── SlitLightSource — cannot be built standalone ─────────────────────────
    _builders['SlitLightSource'] = function () {
        throw new Error('[ObjectFactory] create("SlitLightSource"): a SlitLightSource requires a paired ' +
            'SlitScreen and cannot be constructed independently — build it through its setup factory ' +
            '(setupDoubleSlit), or compose ' + V1_REPLACEMENTS.SlitLightSource + '. (FAIL-LOUD.)');
    };

    // ── Box ──────────────────────────────────────────────────────────────────
    _builders['Box'] = function (props, ctx, gbl) {
        var BoxCls = _requireClass('Box', gbl, 'Box');
        var box = new BoxCls(ctx.runner.universe, Object.assign({
            left: props.left != null ? props.left : Math.round(ctx.x - 40),
            top:  props.top  != null ? props.top  : Math.round(ctx.y - 40),
            width: 80, height: 80,
            wallThickness: 10, collisionType: 'BOUNCE', actions: [], color: [120, 120, 120]
        }, props));
        box._schemaKind = 'Box';
        return box;
    };

    // ── Tunnel ─────────────────────────────────────────────────────────────────
    // TWO parallel mirror Walls forming a corridor. A palette drop centers the bore
    // on the click (F1 drop idiom); a recipe supplies explicit left/top. The Tunnel
    // stamps its own members; create() declares the Tunnel. Zero physics (SU1) — two
    // Wall{bounce} mirrors + a bore.
    _builders['Tunnel'] = function (props, ctx, gbl) {
        var TunnelCls = _requireClass('Tunnel', gbl, 'Tunnel');
        var opts = {};
        for (var k in props) {
            if (!Object.prototype.hasOwnProperty.call(props, k)) { continue; }
            opts[k] = props[k];
        }
        var tlen  = (opts.length != null) ? opts.length : 80;
        var tbore = (opts.bore   != null) ? opts.bore   : 24;
        // Derive the bore origin from the drop point when the recipe declared no placement.
        if (opts.left == null) { opts.left = Math.round(ctx.x - tlen / 2); }
        if (opts.top  == null) { opts.top  = Math.round(ctx.y - tbore / 2); }
        opts.length = tlen; opts.bore = tbore;
        var tunnel = new TunnelCls(ctx.runner.universe, opts);
        tunnel._schemaKind = 'Tunnel';
        // mode:'directed' — subscribe the host redirect to the runner's per-tick fan-out.
        // Self-gating + idempotent, so this is called unconditionally (a mirror tunnel
        // no-ops). Wiring it HERE, off the DECLARED `mode` field, is what makes the
        // directed behavior survive codegen → Restart: the rebuilt facade re-subscribes
        // itself, where a recipe-authored tick-fn would be lost.
        if (typeof tunnel.attachToRunner === 'function') { tunnel.attachToRunner(ctx.runner); }
        return tunnel;
    };

    // ── OvenBox ──────────────────────────────────────────────────────────────
    _builders['OvenBox'] = function (props, ctx, gbl) {
        var OvenBoxCls = _requireClass('OvenBox', gbl, 'OvenBox');
        var ovenBox = new OvenBoxCls(ctx.runner.universe, Object.assign({
            left: props.left != null ? props.left : Math.round(ctx.x - 50),
            top:  props.top  != null ? props.top  : Math.round(ctx.y - 60),
            width: 100, height: 120,
            wallThickness: 10, temperature: 300, slitHeight: 60, color: [120, 120, 120]
        }, props));
        ovenBox._schemaKind = 'OvenBox';
        return ovenBox;
    };

    // ── LogicGate ────────────────────────────────────────────────────────────
    _builders['LogicGate'] = function (props, ctx, gbl) {
        var GateCls = _requireClass('LogicGate', gbl, 'LogicGate');
        var opts = Object.assign({}, props);
        var bore = (opts.bore != null) ? opts.bore : 3;
        var wt = (opts.wallThickness != null) ? opts.wallThickness : 3;
        var len = (opts.length != null) ? opts.length : 20;
        // Derive the cell origin from the drop point when the recipe declared no
        // placement (F1 drop idiom — same as Wall/Tunnel). The cell is three lanes
        // tall, so centring means backing off half of 3 x (bore + 2 x wallThickness).
        if (opts.left == null) { opts.left = Math.round(ctx.x - len / 2); }
        if (opts.top == null) { opts.top = Math.round(ctx.y - 1.5 * (bore + 2 * wt)); }
        opts.bore = bore; opts.wallThickness = wt; opts.length = len;
        var gate = new GateCls(ctx.runner.universe, opts);
        gate._schemaKind = 'LogicGate';
        // The comparator is a HOST tick-fn: subscribe it to the runner's per-tick
        // fan-out here, off the DECLARED fields, so the switching survives
        // codegen → Restart (a recipe-authored tick-fn would be lost). Idempotent.
        if (typeof gate.attachToRunner === 'function') { gate.attachToRunner(ctx.runner); }
        return gate;
    };

    // ── CircuitGate ──────────────────────────────────────────────────────────
    _builders['CircuitGate'] = function (props, ctx, gbl) {
        var CGateCls = _requireClass('CircuitGate', gbl, 'CircuitGate');
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
        cg._schemaKind = 'CircuitGate';
        return cg;
    };

    // ── CircuitProbe ─────────────────────────────────────────────────────────
    _builders['CircuitProbe'] = function (props, ctx, gbl) {
        var CProbeCls = _requireClass('CircuitProbe', gbl, 'CircuitProbe');
        var cp = new CProbeCls(
            ctx.runner.universe,
            props.x    != null ? props.x    : Math.round(ctx.x),
            props.y    != null ? props.y    : Math.round(ctx.y),
            props.size || 10,
            props.name || 'probe'
        );
        cp._schemaKind = 'CircuitProbe';
        return cp;
    };

    // ── ObjectFactory ─────────────────────────────────────────────────────────

    var ObjectFactory = {
        /**
         * Construct a placeable object of the given kind and DECLARE it: the part the builder
         * returns (never one of its members) is recorded in `ctx.runner.declared` with the census LOs
         * the build added as its members and the host tick-functions the build pushed
         * (`FrqtlApp.declare` — this is its ONE call site). What a
         * declaring call (`exp.addObject`, a palette drop, a codegen replay) produced is what STUDIO
         * holds; a part's composition is never declared.
         *
         * FAIL-LOUD: an unknown kind THROWS naming the registered kinds and, when
         * the kind is a removed V1 part, its V2 replacement composition. A recipe
         * whose builder no longer exists must never half-run into a scene with
         * missing parts.
         *
         * @param {string} kind
         * @param {object|null} config  — override props (merged over schema defaultProps)
         * @param {object} ctx          — { runner, cw, x, y } (the size is runner.canvas_rect)
         * @returns {object}            — the declared part (a Tunnel, not its plate; a SphereEmitter, not its marker)
         * @throws {Error} on an unknown kind, a ctx without a runner, a part class absent
         *                 from the construction scope, or a builder result that is not a handle
         */
        create: function (kind, config, ctx) {
            if (!ctx || !ctx.runner) {
                throw new Error('[ObjectFactory] create("' + kind + '"): ctx.runner is required — ' +
                    'pass { runner, cw?, x, y }.');
            }
            var gbl = ctx.cw ||
                (typeof window !== 'undefined' ? window : globalThis);

            var schemaRef = _schemaRef(gbl);

            var builder = _builders[kind];
            if (!builder) {
                var msg = '[ObjectFactory] create: unknown kind "' + kind + '". ' +
                    'Registered kinds: ' + Object.keys(_builders).sort().join(', ') + '.';
                if (Object.prototype.hasOwnProperty.call(V1_REPLACEMENTS, kind)) {
                    msg += ' "' + kind + '" was a V1 part and has been deleted — ' +
                        'compose ' + V1_REPLACEMENTS[kind] + ' instead ' +
                        '(docs/internal/engine/V2_PARTS_CLASSIFICATION.md).';
                }
                throw new Error(msg);
            }

            // ORDER IS LOAD-BEARING: the unknown-KIND throw runs first (it names the V1→V2
            // replacement), then the prop-key check, then the merge. Validating props for a
            // kind that does not exist would replace a useful migration message with a
            // confusing field list.
            _assertPropKeys(kind, config, schemaRef, gbl);
            _refuseWriteOnlyKeys(kind, config, schemaRef);

            var props = _mergeProps(kind, config, schemaRef);

            var runner = ctx.runner;
            var before = new Set(runner.largeObjects);
            var tfs = (runner.universe && Array.isArray(runner.universe.experimentTickFunctions))
                ? runner.universe.experimentTickFunctions : null;
            var ticksBefore = new Set(tfs || []);
            var handle = builder(props, ctx, gbl);
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
            // fn, an absorb radiator): behaviour the declaration owns, so codegen may write it down.
            var tfsAfter = (runner.universe && Array.isArray(runner.universe.experimentTickFunctions))
                ? runner.universe.experimentTickFunctions : [];
            var ticks = tfsAfter.filter(function (fn) { return !ticksBefore.has(fn); });
            runner.declare(handle, members, ticks);
            return handle;
        },

        /**
         * Returns the schema-driven palette catalog.
         * Delegates to ObjectSchema.placeableCatalog().
         * @returns {Array}
         */
        list: function () {
            return ObjectSchema ? ObjectSchema.placeableCatalog() : [];
        },

        /**
         * Returns the registered builder kind keys.
         * @returns {string[]}
         */
        kinds: function () {
            return Object.keys(_builders);
        },

        /**
         * The V1 → V2 port map (read-only) — the ONE list of V1 sugar names. A consumer that
         * must recognise a V1 class (the scene sketch gate) reads it here, never a copy.
         */
        V1_REPLACEMENTS: Object.freeze(Object.assign({}, V1_REPLACEMENTS))
    };

    // ── Export ────────────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ObjectFactory: ObjectFactory };
    }
    if (typeof window !== 'undefined') {
        window.ObjectFactory = ObjectFactory;
    }

})();
