/* Copyright 2023-2026 by Essam Abadir */

/**
 * WallBehaviors — the ONE authority for the Collision LEXICON v2: the wall
 * vocabulary (`collisionBehavior` × `bounceDirection` × composable hooks × presets)
 * and the structured resolver that turns a wall spec into a compiled op-program.
 *
 * ── Schema-mirror discipline (architect W1(ii)/(iv) guard) ───────────────────
 * The hook table FERRIES the frozen `CollisionActions` constant set BY REFERENCE —
 * it NEVER re-types a SCREAMING_SNAKE string. The vocabulary keys ARE the enum: the
 * `Wall` descriptor's enum fields read these maps (never a hand-listed enum),
 * `Wall.js` reads the resolver, and the conformance/compiler tests drive their
 * expectations off these same tables — so a behavior that works through one wall
 * composite but not another is impossible: they all compile through the SAME
 * `actionCompiler` from the SAME owned constants.
 *
 * ── The behavior axis (all compiled to op-programs by actionCompiler.js) ─────
 *   nothing — pass through (no ops at all).
 *   block   — STOP at the surface: eject to the closest position outside, velocity
 *             KEPT (it parks at the face and keeps pushing).
 *   bounce  — TURN AROUND: eject + a direction response (`bounceDirection`:
 *             reflect = the incidence flip, random = a scatter redraw).
 *   absorb  — the RADIATING absorber: kill + tally the mass into the wall's REAL
 *             backing frame + re-radiate (conserving).
 *   destroy — the plain kill (the mass sink at an experiment boundary).
 * Hooks (`mark`/`count`/`recolor`) compose with ANY behavior.
 */

(function () {

    var CollisionTypes, CollisionActions, _compileWallV2;
    if (typeof module !== 'undefined' && module.exports) {
        CollisionTypes = require('./CollisionTypes').CollisionTypes;
        CollisionActions = require('./CollisionActions').CollisionActions;
        _compileWallV2 = require('../objects/actionCompiler').compileWallV2;
    } else {
        CollisionTypes = window.CollisionTypes;
        CollisionActions = window.CollisionActions;
        // DELIBERATELY NOT captured here: actionCompiler.js publishes `window.compileWallV2`
        // LATER in the game-layer roster than this file, so an eval-time read is always
        // `undefined` — a dead store that reads as if it worked. `_getCompileWallV2()` below
        // already resolves it at CALL time, which is the shape that is actually correct.
        // (Removing the dead store is what keeps the load-order gate exception-free; an
        // allowlist entry here would be a place for a real bug to hide later.)
    }
    function _getCompileWallV2() {
        if (_compileWallV2) { return _compileWallV2; }
        if (typeof window !== 'undefined' && window.compileWallV2) { return window.compileWallV2; }
        throw new Error('[WallBehaviors] compileWallV2 not available — ensure actionCompiler.js is loaded.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Collision LEXICON v2 (CEO 3e2016aa) — the STUDIO/palette surface and the ONLY
    // wall vocabulary. Three ferried vocab tables + a structured resolver that
    // delegates to the ONE compiler authority (compileWallV2 in actionCompiler.js).
    // ═══════════════════════════════════════════════════════════════════════

    // behavior axis (ONE of): nothing | block | bounce | absorb | destroy. Keys ARE the enum.
    // Ordered by escalating response to a hit: pass through → stop → turn → consume → remove.
    //   nothing — pass-through (no ops at all).
    //   block   — STOP the particle AT the surface: reposition it to the closest position
    //             OUTSIDE the wall, velocity UNTOUCHED. Literally `bounce` minus the reflect
    //             ops. MEASURED head-to-head against `bounce` on the canonical WASM engine
    //             (wall x∈[200,220], leaf launched x=150 vx=+1): both stop penetration at
    //             x=199, but `bounce` flips to vx=−1 and has RECEDED to x=158.5 by t=90,
    //             while `block` keeps vx=+1 and PARKS at x=198.5 for every remaining tick.
    //             Same contact tick (45), opposite outcome — so `bounce` is NOT a stand-in
    //             for `block` (the eject-only op-set is the RESISTANCE intuition: a particle
    //             cannot move into occupied space, and nothing gives it a reason to turn).
    //   bounce  — a motion response (see bounceDirection).
    //   absorb  — kill + tally into the wall's REAL backing frame + radiate (conserving).
    //   destroy — plain kill.
    var WALL_BEHAVIORS = { nothing: 'nothing', block: 'block', bounce: 'bounce', absorb: 'absorb', destroy: 'destroy' };
    // bounceDirection (when behavior==bounce): reflect | random.
    var BOUNCE_DIRECTIONS = { reflect: 'reflect', random: 'random' };
    // hooks (composable with ANY behavior) — FERRIED from the frozen CollisionActions set.
    // `mark`/`count` FERRY the frozen engine CollisionActions. `recolor` is a RENDER-INTENT
    // hook (not an engine action — the engine has no color, I1): it stamps the wall's OWN
    // drawn color into the collided frame's opaque string_map['render.color'], which the
    // renderer providers already read. It is MARK's sibling (a string_map write the engine
    // passes through), so it lives in the SAME composable-hooks slot; its value is a plain
    // marker (there is no CollisionActions.RECOLOR to ferry).
    var WALL_HOOKS = { mark: CollisionActions.MARK, count: CollisionActions.COUNT, recolor: 'recolor' };

    function _valuesMap(obj) { var m = {}; Object.keys(obj).forEach(function (k) { m[k] = k; }); return m; }

    /**
     * Resolve the v2 nested wall spec to a compiled op-program + flags via the ONE
     * compiler authority (compileWallV2). FAIL-LOUD on an unknown behavior/direction.
     * @param {Object} props — { collisionBehavior, bounceDirection, angleConstraint,
     *   decoherence, hooks, markTag, color, capacity, emissivity, reposition, orientationDeg }
     * @returns {{ program, collectCollided, radiation, behavior, hooks }}
     */
    function resolveWallSpec(props) {
        props = props || {};
        var behavior = props.collisionBehavior || 'nothing';
        if (!WALL_BEHAVIORS[behavior]) {
            throw new Error('[WallBehaviors] unknown collisionBehavior "' + behavior + '" — must be one of [' +
                Object.keys(WALL_BEHAVIORS).join(', ') + '].');
        }
        if (behavior === 'bounce' && props.bounceDirection && !BOUNCE_DIRECTIONS[props.bounceDirection]) {
            throw new Error('[WallBehaviors] unknown bounceDirection "' + props.bounceDirection + '" — must be one of [' +
                Object.keys(BOUNCE_DIRECTIONS).join(', ') + '].');
        }
        var hooks = Array.isArray(props.hooks) ? props.hooks : [];
        hooks.forEach(function (hk) {
            if (!WALL_HOOKS[hk]) {
                throw new Error('[WallBehaviors] unknown hook "' + hk + '" — must be one of [' +
                    Object.keys(WALL_HOOKS).join(', ') + '].');
            }
        });
        var compiled = _getCompileWallV2()({
            behavior: behavior,
            bounceDirection: props.bounceDirection || 'reflect',
            angleConstraint: props.angleConstraint,
            orientationDeg: props.orientationDeg,
            decoherence: props.decoherence,
            hooks: hooks,
            markTag: props.markTag,
            // The wall's OWN drawn color — the ONE authority the `recolor` hook derives its
            // render.color tag from at compile time (ferried, never a parallel color field).
            color: props.color,
            capacity: props.capacity,
            // ABSORB radiating efficiency (fullness fraction of the emitted leaf). Omitted ⇒
            // absorbRadiation's own default — no second copy of the default lives here.
            emissivity: props.emissivity,
            reposition: props.reposition || 'closest',
            // Z1 — a real z-slab wall reflects/ejects on all six faces (3-axis incidence
            // + closest3d eject). Derived from the caller (Wall.js reads it off the rect);
            // omitted/false ⇒ the 2D path (byte-identical, SU1).
            is3D: props.is3D === true,
            // MIRROR ruling — the TRUE slab dims (Wall reads them off the rect) so a tilted 2D
            // reflect wall can bake the OBB-NORMAL eject (perpendicular to the drawn face) instead
            // of the beam-scattering AABB 'closest'. Omitted ⇒ the AABB eject (byte-identical, SU1).
            slabW: props.slabW,
            slabH: props.slabH,
            // R2AX (CEO two-axis ruling 2026-07-26) — the plate's up/down tilt + z-depth,
            // ferried so a pitched plate compiles the 3-space reflection about SlabFace's
            // plate3.n. Omitted ⇒ byte-identical un-pitched programs (SU1).
            pitchDeg: props.pitchDeg,
            slabD: props.slabD
        });
        return { program: compiled.program, collectCollided: compiled.collectCollided,
                 radiation: compiled.radiation, behavior: behavior, hooks: hooks.slice() };
    }

    // ── Presets (B6) — pure CONSTRUCTION sugar expanding to the v2 descriptor fields.
    // The recipe/codegen round-trips the EXPANDED fields (never the preset name).
    //
    // THE NAMING RULE (CEO ruling, 2026-07-31): a preset's NAME MUST ASSERT ITS BEHAVIOR.
    // `collisionBehavior:'nothing'` (pass-through) belongs ONLY on a preset whose name SAYS
    // it passes through — `transparent-probe` is the one that earns it. A palette entry
    // labelled "Wall" that particles walk through is the same defect class as mistaking
    // `Tunnel{mode:'mirror'}` for a mirror: a name asserting behavior the part does not have.
    // Before `block` existed there was no blocking behavior in the lexicon to point `wall` at,
    // so `wall → nothing` was as honest as the vocabulary allowed — and simultaneously
    // REDUNDANT with `transparent-probe`. `block` removed that reason, so `wall` now blocks.
    // Apply this rule to every preset added here.
    var WALL_PRESETS = {
        'mirror':            { label: 'Mirror',            collisionBehavior: 'bounce',  bounceDirection: 'reflect' },
        'brick':             { label: 'Brick Wall',        collisionBehavior: 'bounce',  bounceDirection: 'random', decoherence: false },
        'detector-screen':   { label: 'Detector Screen',   collisionBehavior: 'destroy', hooks: ['count'], countFilter: 'any' },
        'transparent-probe': { label: 'Transparent Probe', collisionBehavior: 'nothing', hooks: ['mark', 'count'] },
        // A "Wall" is SOLID: it stops the particle at the surface, velocity kept (see `block`
        // above). For a wall-shaped instrument that does NOT stop anything, use
        // `transparent-probe` — that is what its name is for.
        'wall':              { label: 'Wall',              collisionBehavior: 'block' }
    };
    /** Expand a preset key to its v2 descriptor-field bag (FRESH copy). FAIL-LOUD on unknown. */
    function expandWallPreset(key) {
        var p = WALL_PRESETS[key];
        if (!p) {
            throw new Error('[WallBehaviors] unknown wall preset "' + key + '" — must be one of [' +
                Object.keys(WALL_PRESETS).join(', ') + '].');
        }
        var out = {}; Object.keys(p).forEach(function (k) { if (k !== 'label') { out[k] = Array.isArray(p[k]) ? p[k].slice() : p[k]; } });
        return out;
    }

    // ── Export ───────────────────────────────────────────────────────────
    var api = {
        // Collision LEXICON v2 — the ONE wall vocabulary
        WALL_BEHAVIORS: WALL_BEHAVIORS,
        BOUNCE_DIRECTIONS: BOUNCE_DIRECTIONS,
        WALL_HOOKS: WALL_HOOKS,
        wallBehaviorV2ValuesMap: function () { return _valuesMap(WALL_BEHAVIORS); },
        bounceDirectionValuesMap: function () { return _valuesMap(BOUNCE_DIRECTIONS); },
        wallHookValuesMap: function () { return _valuesMap(WALL_HOOKS); },
        resolveWallSpec: resolveWallSpec,
        WALL_PRESETS: WALL_PRESETS,
        expandWallPreset: expandWallPreset
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        window.WALL_BEHAVIORS = WALL_BEHAVIORS;
        window.BOUNCE_DIRECTIONS = BOUNCE_DIRECTIONS;
        window.WALL_HOOKS = WALL_HOOKS;
        window.wallBehaviorV2ValuesMap = api.wallBehaviorV2ValuesMap;
        window.bounceDirectionValuesMap = api.bounceDirectionValuesMap;
        window.wallHookValuesMap = api.wallHookValuesMap;
        window.resolveWallSpec = resolveWallSpec;
        window.WALL_PRESETS = WALL_PRESETS;
        window.expandWallPreset = expandWallPreset;
    }

})();
