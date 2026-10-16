/* Copyright 2023-2026 by Essam Abadir */

/**
 * slitLinerScatter.js — the ONE authority for the double-slit edge-diffraction
 * liner's collision op-program (behavior × resetLocalTime, ORTHOGONAL).
 *
 * DSE LAB (2026-07-13, CEO-chartered systematic controls): "behavior × reset are
 * ORTHOGONAL controls" — this file composes the velocity-tail (`behavior`) and the
 * `local_time=0` reset independently, so every (behavior, resetLocalTime) combo is
 * reachable, INCLUDING combos that had no name before (`bounce`+reset,
 * `ejectY`+reset, `ejectYReflect`+reset). The pre-existing compound `slitScatter`
 * variants (EXPERIMENT LOOP 2026-07-12 + MATRIX EXTENSION) map onto specific combos
 * — see `LEGACY_VARIANT_MAP` — proven byte-identical by
 * `slit-liner-scatter.test.mjs`'s composed-vs-legacy equality tests.
 *
 * ONE AUTHORITY, NO FORK: both `SlitScreen.js` (construction-time, via the legacy
 * `linerScatter` string) and the `dse-lab` experiment page (LIVE, via explicit
 * `{behavior, resetLocalTime}`) call `buildLinerProgram`/`applyLinerScatter` here —
 * neither re-derives the op shapes.
 *
 * ## Ground-truth (pkg-node instrumentation, EXPERIMENT LOOP delivery report)
 * The liner's compiled `RANDOM_XY` op DOES fire; its OWN writes are `vx=random()`
 * (ALWAYS non-negative) and `vy=random()*2-1` (already symmetric) — the sign bias
 * the CEO's original hypothesis named (vy) was actually in `vx`, which the engine's
 * 2D diagonal wave-kick (`frame.rs` `axy` branch, `dy_perp=(vx>0?+1:-1)*is_heads`)
 * keys its transverse-Y sign off; `is_heads` is coherently biased by the SAME
 * `local_time=0` phase-lock mechanism (`compute_spin`) the theorist found driving
 * the separately-escalated 3D z-asymmetry. `local_time=0` is deliberate — it is
 * what CREATES the y-interference fringes for the un-amended collision — hence
 * this file's variants for visual/statistical A/B comparison, not a "fix."
 *
 * ## The FIVE composable BEHAVIORS (velocity-tail + eject-prefix + charge-draw?)
 * - `randomXY`   — generic BLOCK eject prefix + `vx=random()` (always +), `vy` symmetric; charge redrawn.
 * - `symmetric`  — generic BLOCK eject prefix + `vx` ALSO symmetric (fixes the actual bias found); charge redrawn.
 * - `bounce`     — generic BLOCK eject prefix + `vy=-vy` only (elastic reflection); no charge redraw.
 * - `ejectY`     — EXPLICIT Y-into-cavity eject prefix (not generic 'closest' — see
 *                  `buildLinerProgram`'s docstring for why); NO velocity writes at all; no charge redraw.
 * - `ejectYReflect` — `ejectY`'s prefix PLUS `vy=-vy`; no charge redraw.
 *
 * `resetLocalTime` (boolean, independent axis): when true, appends `set frame.local_time = 0`
 * AFTER the velocity-tail and BEFORE any charge-draw (matching the ORIGINAL native
 * RANDOM_XY/RANDOM_Y op order this file's `randomXY`+reset=true combo reproduces
 * byte-for-byte).
 */

(function () {

    // ── Imports (Node.js) or globals (browser) ──────────────────────────

    var _compileActions, _buildEjectOpsFn, _buildTriggerExprFn, _applyProgramTriggerFn, _astSchema, CollisionTypes;

    if (typeof module !== 'undefined' && module.exports) {
        _compileActions = require('./actionCompiler').compileActions;
        _buildEjectOpsFn = require('./actionCompiler').buildEjectOps;
        _buildTriggerExprFn = require('./actionCompiler').buildTriggerExpr;
        _applyProgramTriggerFn = require('./actionCompiler').applyProgramTrigger;
        _astSchema = require('../../../shim/expr/ast-schema.js');
        CollisionTypes = require('../constants/CollisionTypes').CollisionTypes;
    } else {
        _compileActions = null; // resolved lazily below (game-layer load order)
        _buildEjectOpsFn = null;
        _buildTriggerExprFn = null;
        _applyProgramTriggerFn = null;
        _astSchema = null;
        CollisionTypes = window.CollisionTypes;
    }

    function _getCompileActions() {
        if (_compileActions) return _compileActions;
        if (typeof window !== 'undefined' && window.compileActions) return window.compileActions;
        throw new Error('[slitLinerScatter] compileActions not available. In the browser, ensure actionCompiler.js is loaded in data-page-scripts.');
    }
    function _getBuildEjectOps() {
        if (_buildEjectOpsFn) return _buildEjectOpsFn;
        if (typeof window !== 'undefined' && window.buildEjectOps) return window.buildEjectOps;
        throw new Error('[slitLinerScatter] buildEjectOps not available. In the browser, ensure actionCompiler.js is loaded in data-page-scripts.');
    }
    function _getBuildTriggerExpr() {
        if (_buildTriggerExprFn) return _buildTriggerExprFn;
        if (typeof window !== 'undefined' && window.buildTriggerExpr) return window.buildTriggerExpr;
        throw new Error('[slitLinerScatter] buildTriggerExpr not available. In the browser, ensure actionCompiler.js is loaded in data-page-scripts.');
    }
    function _getApplyProgramTrigger() {
        if (_applyProgramTriggerFn) return _applyProgramTriggerFn;
        if (typeof window !== 'undefined' && window.applyProgramTrigger) return window.applyProgramTrigger;
        throw new Error('[slitLinerScatter] applyProgramTrigger not available. In the browser, ensure actionCompiler.js is loaded in data-page-scripts.');
    }
    function _getAstSchema() {
        if (_astSchema) return _astSchema;
        if (typeof window !== 'undefined' && window.AstSchema) return window.AstSchema;
        throw new Error('[slitLinerScatter] AstSchema not available. In the browser, ensure ast-schema.js is loaded in data-page-scripts.');
    }

    /** The five composable behaviors (see module docstring). */
    var BEHAVIORS = ['randomXY', 'symmetric', 'bounce', 'ejectY', 'ejectYReflect'];

    /**
     * LEGACY_VARIANT_MAP — the pre-existing compound `slitScatter` string ->
     * {behavior, resetLocalTime} this composable builder reproduces byte-for-byte.
     * `'current'` maps to `null` — the SPECIAL no-op sentinel (construction leaves
     * the LO's own naturally-compiled `RANDOM_XY` program untouched, ZERO
     * `updateObjectProperty` calls — verified by test). `'current'` the STRING is
     * therefore NOT the same as calling this builder with `{behavior:'randomXY',
     * resetLocalTime:true}` (which WOULD produce an identical-shaped program, but
     * via an explicit push — the two are proven ops-equal by test, but only the
     * string sentinel gets the "untouched, zero side effects" default-path contract).
     */
    var LEGACY_VARIANT_MAP = {
        current:       null,
        noreset:       { behavior: 'randomXY',      resetLocalTime: false },
        symmetric:     { behavior: 'symmetric',     resetLocalTime: true  },
        combined:      { behavior: 'symmetric',     resetLocalTime: false },
        bounce:        { behavior: 'bounce',        resetLocalTime: false },
        ejectY:        { behavior: 'ejectY',         resetLocalTime: false },
        ejectYReflect: { behavior: 'ejectYReflect',  resetLocalTime: false },
    };

    /**
     * Resolve a legacy `slitScatter` string to `{behavior, resetLocalTime}`, or
     * `null` for `'current'`/omitted (the no-op sentinel). Throws on an unknown
     * string (fail-loud, never silent).
     * @param {string|undefined|null} slitScatterString
     * @returns {{behavior:string, resetLocalTime:boolean}|null}
     */
    function resolveLegacyVariant(slitScatterString) {
        if (slitScatterString === undefined || slitScatterString === null) return null;
        if (!Object.prototype.hasOwnProperty.call(LEGACY_VARIANT_MAP, slitScatterString)) {
            throw new Error('[slitLinerScatter] unknown slitScatter legacy variant: ' + slitScatterString);
        }
        return LEGACY_VARIANT_MAP[slitScatterString];
    }

    /**
     * THE composable builder: `behavior` (velocity-tail + its own eject-prefix
     * choice + whether it redraws charge) × `resetLocalTime` (an independent
     * boolean — appends `local_time=0` after the tail, before any charge-draw).
     *
     * WHY `ejectY`/`ejectYReflect` use an EXPLICIT `intoCavityDir` instead of the
     * generic `'closest'` nearest-face eject every other behavior reuses: the
     * liner is a WIDE, THIN strip (much wider in x than tall in y) sitting at one
     * edge of a slit's cavity — `'closest'` could pick a side (L/R) face for some
     * approach angles/positions, ejecting the particle OUT of the cavity or back
     * the way it came, the opposite of "lands between the slits" (ground-truthed,
     * MATRIX EXTENSION delivery report). A `_top`-positioned liner always ejects
     * `'bottom'` (deeper into the cavity below it); a `_bottom`-positioned liner
     * always ejects `'top'` — the caller supplies which via `intoCavityDir`.
     *
     * @param {'randomXY'|'symmetric'|'bounce'|'ejectY'|'ejectYReflect'} behavior
     * @param {boolean} resetLocalTime - independent reset axis (see module docstring).
     * @param {Object} ast - the ast-schema module (Lit/Bin/Cond/Cmp/Fn/Ref/HANDLE_FRAME/HANDLE_SELF).
     * @param {Function} buildEjectOpsFn - `actionCompiler.js`'s exported `buildEjectOps`.
     * @param {Function} compileActionsFn - `actionCompiler.js`'s exported `compileActions`
     *   (used ONLY by randomXY/symmetric/bounce to derive the generic BLOCK/'closest'
     *   eject prefix — the SAME helper the liner's own constructor uses).
     * @param {string} loName - the liner LO's name (passed to compileActionsFn for the
     *   generic-eject-prefix behaviors; irrelevant to ejectY/ejectYReflect).
     * @param {string} reposition - the liner LO's `.reposition` (normally 'closest');
     *   passed through to compileActionsFn for the generic-eject-prefix behaviors.
     * @param {'top'|'bottom'|'left'|'right'|'near'|'far'} [intoCavityDir] - REQUIRED for
     *   ejectY/ejectYReflect only. It is forwarded VERBATIM to `_buildEjectOps`, whose named-
     *   direction domain is all six faces — so this is the eject NORMAL, not a Y-only knob.
     *   The `ejectY` NAME is historical (the DSE liner is a horizontal strip that always ejects
     *   on Y); a vertical corridor (`Tunnel` axis 'y') passes 'left'/'right' through the SAME
     *   builder. Documenting the true domain, not widening it — no code change.
     * @param {boolean} [hasRealDepth=false] - ws-dse-3d AC2 (CEO drive #2 round-2
     *   ruling: "It is immediately obvious that the reflections on one of the
     *   axes is missing... immediately obvious that we are not using the same
     *   objects with the same contracts"): when true, `randomXY`/`symmetric`
     *   (the two SCATTER behaviors — a wall-normal-agnostic velocity redraw, not
     *   a physical y-wall reflection) ALSO append `set frame.vz = random()*2-1`
     *   — the SAME `randomSigned()` term already used for `vy` — so a scatter
     *   event on a real-depth-armed tunnel redraws all 3 axes, not just 2.
     *   `bounce` (a genuine y-NORMAL wall reflection) and `ejectY`/`ejectYReflect`
     *   (Y-specific by design, the DSE liner's own cavity-eject convention) are
     *   UNCHANGED regardless of this flag — reflecting vz off a Y-normal wall
     *   would be physically wrong (this is a TOP/BOTTOM face; NEAR/FAR is
     *   handled correctly already by native BOUNCE, see the round-1 deliverable).
     *   Default `false` — byte-identical for every existing caller (`SlitScreen.js`'s
     *   own 2D liner construction, which never passes this).
     * @returns {Array<Object>} the FULL composed ops array (eject-prefix + tail +
     *   [reset] + [charge-draw]) — ready to wrap as `{on:'collision', ops}`.
     */
    function buildLinerProgram(behavior, resetLocalTime, ast, buildEjectOpsFn, compileActionsFn, loName, reposition, intoCavityDir, hasRealDepth) {
        var Lit = ast.Lit, Bin = ast.Bin, Cond = ast.Cond, Cmp = ast.Cmp, Fn = ast.Fn, Ref = ast.Ref;
        var HF = ast.HANDLE_FRAME, HS = ast.HANDLE_SELF;
        var randomSigned = function () { return Bin('-', Bin('*', Fn('random', []), Lit(2)), Lit(1)); }; // random()*2-1
        var chargeDraw = function () { return Cond(Cmp('<', Fn('random', []), Lit(0.5)), Lit(0), Lit(1)); };

        var ejectPrefix, velocityTail, includesCharge;

        if (behavior === 'ejectY' || behavior === 'ejectYReflect') {
            ejectPrefix = buildEjectOpsFn(intoCavityDir, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn) || [];
            velocityTail = (behavior === 'ejectYReflect')
                ? [{ set: HF + '.vy', to: Bin('*', Ref(HF, 'vy'), Lit(-1)) }]
                : [];
            includesCharge = false;
        } else if (behavior === 'randomXY') {
            var ejectOnlyRX = compileActionsFn(['BLOCK'], loName, reposition, CollisionTypes.NONE);
            ejectPrefix = ejectOnlyRX.program ? ejectOnlyRX.program.ops : [];
            velocityTail = [
                { set: HF + '.vx', to: Fn('random', []) },
                { set: HF + '.vy', to: randomSigned() },
            ];
            if (hasRealDepth) { velocityTail.push({ set: HF + '.vz', to: randomSigned() }); }
            includesCharge = true;
        } else if (behavior === 'symmetric') {
            var ejectOnlySym = compileActionsFn(['BLOCK'], loName, reposition, CollisionTypes.NONE);
            ejectPrefix = ejectOnlySym.program ? ejectOnlySym.program.ops : [];
            velocityTail = [
                { set: HF + '.vx', to: randomSigned() },
                { set: HF + '.vy', to: randomSigned() },
            ];
            if (hasRealDepth) { velocityTail.push({ set: HF + '.vz', to: randomSigned() }); }
            includesCharge = true;
        } else if (behavior === 'bounce') {
            var ejectOnlyBounce = compileActionsFn(['BLOCK'], loName, reposition, CollisionTypes.NONE);
            ejectPrefix = ejectOnlyBounce.program ? ejectOnlyBounce.program.ops : [];
            velocityTail = [{ set: HF + '.vy', to: Bin('*', Ref(HF, 'vy'), Lit(-1)) }];
            includesCharge = false;
        } else {
            throw new Error('[slitLinerScatter] unknown behavior: ' + behavior);
        }

        var ops = ejectPrefix.concat(velocityTail);
        if (resetLocalTime) { ops = ops.concat([{ set: HF + '.local_time', to: Lit(0) }]); }
        if (includesCharge) { ops = ops.concat([{ set: HF + '.charge', to: chargeDraw() }]); }
        return ops;
    }

    /**
     * Apply a scatter/behavior combo to an already-constructed liner LO — pushes
     * the composed op-program LIVE via `universe.updateObjectProperty` (the SAME
     * mechanism `LargeObject.prototype.recompileActions` uses for its own live
     * collision-type edits). Accepts EITHER a legacy `slitScatter` string (used by
     * `SlitScreen`'s constructor) OR an explicit `{behavior, resetLocalTime}` pair
     * (used LIVE by the `dse-lab` page's controls) — ONE authority, no fork.
     *
     * `'current'`/omitted (legacy string) is the SPECIAL no-op sentinel: the LO
     * keeps its own naturally-compiled program, ZERO `updateObjectProperty` calls.
     *
     * @param {Object} linerLO - the liner LargeObject instance (has `.handle`,
     *   `.name`, `.reposition`, `.program`).
     * @param {Object} universe
     * @param {'top'|'bottom'} intoCavityDir - REQUIRED for ejectY/ejectYReflect only.
     * @param {Object} [opts]
     * @param {string} [opts.slitScatter] - legacy compound variant string (mutually
     *   exclusive with opts.behavior/opts.resetLocalTime).
     * @param {string} [opts.behavior] - explicit composable behavior (LIVE controls).
     * @param {boolean} [opts.resetLocalTime] - explicit composable reset (LIVE controls).
     * @param {boolean} [opts.hasRealDepth=false] - ws-dse-3d AC2 — see
     *   `buildLinerProgram`'s own param doc. Default false — byte-identical for
     *   every existing caller.
     */
    function applyLinerScatter(linerLO, universe, intoCavityDir, opts) {
        opts = opts || {};
        var resolved;
        if (opts.behavior !== undefined) {
            resolved = { behavior: opts.behavior, resetLocalTime: !!opts.resetLocalTime };
        } else {
            resolved = resolveLegacyVariant(opts.slitScatter);
        }
        if (resolved === null) return; // 'current'/omitted — no-op sentinel, LO untouched.

        var ast = _getAstSchema();
        var ops = buildLinerProgram(
            resolved.behavior, resolved.resetLocalTime, ast,
            _getBuildEjectOps(), _getCompileActions(),
            linerLO.name, linerLO.reposition, intoCavityDir, !!opts.hasRealDepth
        );
        var newProgram = { on: 'collision', ops: ops };

        // O4b FIX (tester Rule-0 finding, 2026-07-13): every liner is FIRST
        // constructed via `new LargeObject(..., CollisionTypes.RANDOM_XY,
        // [CollisionActions.BLOCK], ...)`, whose NATIVE `compileActions` compilation
        // attaches a program-level `trigger` (`Fn('intersects',[HANDLE_FRAME,
        // HANDLE_SELF])` — see actionCompiler.js's G2b design: "if trigger==0, ALL
        // ops are skipped atomically"). This function's REPLACEMENT program was
        // missing that `trigger` entirely — pkg-node isolation proved this ALONE
        // (re-pushing an AST-IDENTICAL ops array onto an already-'current'-
        // constructed liner, with no other change) regressed detector total
        // 103->10, i.e. every push-based variant (every non-'current' legacy
        // string, AND every LIVE composable combo) has been running with a
        // missing/no-op trigger since this mechanism existed — not a behavior- or
        // reset-specific effect. All liner collision types here are BLOCK-style
        // overlap-only (never WALL), so `withPastEdge=false` always; reuse the
        // SAME builder+attacher `compileActions` itself uses (one authority).
        var trigger = _getBuildTriggerExpr()(
            linerLO.reposition || null, false,
            ast.HANDLE_FRAME, ast.HANDLE_SELF,
            ast.Lit, ast.Ref, ast.Cmp, ast.Cond, ast.Fn
        );
        _getApplyProgramTrigger()(newProgram, trigger);

        linerLO.program = newProgram; // mirror on the JS wrapper (inspector/serialize source of truth)
        if (universe && typeof universe.updateObjectProperty === 'function') {
            universe.updateObjectProperty(linerLO.handle, 'LargeObject', 'program', newProgram);
        }
    }

    // ── Export ───────────────────────────────────────────────────────────

    var api = {
        BEHAVIORS: BEHAVIORS,
        LEGACY_VARIANT_MAP: LEGACY_VARIANT_MAP,
        resolveLegacyVariant: resolveLegacyVariant,
        buildLinerProgram: buildLinerProgram,
        applyLinerScatter: applyLinerScatter,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        window.SlitLinerScatter = api;
    }

})();
