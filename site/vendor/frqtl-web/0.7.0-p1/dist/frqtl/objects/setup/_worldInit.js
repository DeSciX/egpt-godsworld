/* Copyright 2023-2026 by Essam Abadir */

/**
 * _worldInit — the ONE world-init contract: the world-cfg vocabulary (`INIT_CFG`) a scene
 * hands its co-init call (`exp.createCanvas(w, h, cfg)` / `exp.createScene(w, h, d, cfg)`),
 * its validator (`assertInitCfg`) and its mapping onto `universe.init(fundamentalDimension, options)`
 * (`initArgs`). The SIZE and the AXES are not in it: the co-init call owns both (2D ⇒ the
 * engine's {x,y} default, 3D ⇒ {x,y,z} + depth).
 *
 * A LEAF contract module, the `_setupOptions.js` class: it depends on nothing but the
 * universe it is handed; a setup factory imports it. Consumers:
 * `RecipeContext.createCanvas/createScene`, `setupSphereEmitter3D.initWorld`.
 *
 * An ES module: `export { FrqtlWorldInit }`.
 */

    /**
     * INIT_CFG — every key a world cfg accepts (the `cfg` of `exp.createCanvas(w, h, cfg)` /
     * `exp.createScene(w, h, d, cfg)`), and what each one does.
     *
     * THE contract, exported as `FrqtlWorldInit.INIT_CFG` so no consumer re-enumerates
     * it — RecipeContext and the setup factories' world steps both read it.
     *
     * The list is derived from what `initArgs()` below ACTUALLY reads. `interQuantumCollisions`
     * is in it because it is still ACCEPTED (inert — it fed a removed positional slot) and
     * saved scenes carry it: dropping it from the vocabulary would make them throw.
     *
     * @type {Array<{key:string, effect:string}>}
     */
    var INIT_CFG = [
        { key: 'dimension',              effect: 'the fundamental (base) dimension layer — universe.init()\'s 1st argument. default 2.' },
        { key: 'wavelengthScale',        effect: '→ universe.init options.wavelengthScale — the GLOBAL λ multiplier. default 8.' },
        { key: 'interQuantumCollisions', effect: 'ACCEPTED BUT INERT — it fed a removed positional slot the engine never read.' },
        { key: 'bonding',                effect: '→ universe.init options.noEscape (the names do NOT line up 1:1). default false.' },
        { key: 'frames',                 effect: "BOOLEAN → universe.init options.frameGenMode: true → 'topDown', false → 'groundUp'. default false." },
        { key: 'stepping',               effect: "'fixed' | 'average' — the wave-walk sampler, ferried VERBATIM (never validated or defaulted here). Omitted ⇒ the engine's default." },
        { key: 'iframeIntervalSeconds',  effect: "the parent-generation interval (s) — applied through the universe's own PRE-INIT setter (`universe.iframe_interval_seconds`) by applyPreInit(), immediately before universe.init; the engine freezes it at init. Omitted ⇒ untouched (the engine's default)." },
    ];

    function _initCfgKeyList() {
        return INIT_CFG.map(function (r) { return r.key; }).join(', ');
    }

    /**
     * THROW-OR-APPLY on the cfg bag. An unknown key is a hard error naming the legal
     * vocabulary — never a silent drop.
     *
     * `universe.init()` throws on retired names, but a recipe bag must fail HERE, before
     * the mapping could drop a key it does not know.
     *
     * RETIREMENT ENRICHMENT: the universe's own class publishes the retirement ledger
     * (`EGPTUniverse.RETIRED_CONFIG_KEYS`), so a retired name gets the SAME migration
     * sentence the engine throws — one ledger, never a second copy here. The THROW is
     * unconditional; only the extra sentence depends on the ledger being reachable (a
     * bare test double may not publish it), so a missing ledger can never weaken the gate.
     *
     * @param {string} where — the call shape to quote back ('RecipeContext.init(cfg)')
     * @param {Object} cfg
     * @param {Object} universe — the live universe, for its class's retirement ledger
     */
    // Keys the co-init call owns: a cfg carrying one is a SECOND declaration of a fact the
    // call already states (the size, the axes) — it throws naming the owner.
    var OWNED_BY_COINIT = {
        activeAxes: 'the axes are the method: exp.createCanvas(w, h, cfg) is 2D, exp.createScene(w, h, d, cfg) is 3D',
        depth:      'the depth is exp.createScene(w, h, d, cfg)\'s d',
        canvasW:    'the size is the co-init call\'s w, h (exp.createCanvas(w, h, cfg) / exp.createScene(w, h, d, cfg))',
        canvasH:    'the size is the co-init call\'s w, h (exp.createCanvas(w, h, cfg) / exp.createScene(w, h, d, cfg))',
        stage:      'the size is the co-init call\'s w, h (exp.createCanvas(w, h, cfg) / exp.createScene(w, h, d, cfg))'
    };

    function assertInitCfg(where, cfg, universe) {
        Object.keys(cfg).forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(OWNED_BY_COINIT, k)) {
                throw new Error(where + ": '" + k + "' is not a world-cfg key — " + OWNED_BY_COINIT[k] +
                    '. (FAIL-LOUD: one declaration per fact.)');
            }
        });
        var Ctor    = universe ? universe.constructor : null;
        var retired = (Ctor && Ctor.RETIRED_CONFIG_KEYS && typeof Ctor.RETIRED_CONFIG_KEYS === 'object')
            ? Ctor.RETIRED_CONFIG_KEYS : null;
        Object.keys(cfg).forEach(function (k) {
            var known = INIT_CFG.some(function (r) { return r.key === k; });
            if (known) { return; }
            var msg = where + ": unknown option '" + k + "'. Legal options: " + _initCfgKeyList() + '.';
            if (retired && Object.prototype.hasOwnProperty.call(retired, k)) {
                msg += " That name is RETIRED at the engine — '" + k + "' " + retired[k] +
                    '. Note this is the RECIPE vocabulary, not the engine option list: ' +
                    'migrate to one of the legal options above.';
            }
            throw new Error(msg);
        });
    }

    /**
     * initArgs(cfg) — THE cfg-bag → `universe.init(fundamentalDimension, options)` mapping,
     * as a pure function returning the argument list. The ONE owner: the RecipeContext co-init
     * call and every setup factory's world step (`setupSphereEmitter3D.initWorld`) apply it, so one cfg bag boots one world whichever surface the author used.
     *
     * The cfg key names predate the engine option names and do NOT line up 1:1:
     *   cfg.dimension       → universe.init()'s 1st argument (default 2)
     *   cfg.wavelengthScale → options.wavelengthScale (default 8)
     *   cfg.bonding         → options.noEscape (default false)
     *   cfg.frames          → options.frameGenMode  (true → 'topDown', false → 'groundUp')
         *   cfg.stepping        → options.stepping    (1:1, attached ONLY when declared)
     *   cfg.interQuantumCollisions is accepted but inert (it fed a removed positional slot).
     *
     * Omit-when-undeclared keeps the ENGINE the one authority for those defaults (serde
     * `active_axes` {x,y}, `stepping` 'fixed'); `stepping` is ferried VERBATIM so
     * `universe.init()` is its one validator. `brownianMotion` is never sent: under
     * frameGenMode 'groundUp' the engine resolves it to false (`universe.rs`, GroundUp ⇒
     * `brownian_motion.unwrap_or(false)`), and 'topDown' forces it true.
     *
     * No rect: the world rect is `EGPTUniverse.create({ rect })`'s, and `universe.init` reads it.
     *
     * THROW-OR-APPLY: an unknown cfg key throws naming the vocabulary (INIT_CFG); a second
     * argument is the deleted rect parameter and throws naming the signature.
     *
     * @param {Object} cfg — a world cfg bag (INIT_CFG keys)
     * @returns {Array} [dimension, options] — spread into `universe.init`
     */
    function initArgs(cfg) {
        if (arguments.length > 1) {
            throw new Error('FrqtlWorldInit.initArgs(cfg) takes no rect — the world rect is written ONCE, ' +
                'by EGPTUniverse.create({ rect, seed, … }), and universe.init(fundamentalDimension, options) ' +
                'reads it. (FAIL-LOUD.)');
        }
        cfg = cfg || {};
        assertInitCfg('FrqtlWorldInit.initArgs(cfg)', cfg, null);
        var dimension = cfg.dimension !== undefined ? cfg.dimension : 2;
        var options = {
            wavelengthScale: cfg.wavelengthScale !== undefined ? cfg.wavelengthScale : 8,
            noEscape: cfg.bonding !== undefined ? cfg.bonding : false,
            // cfg.frames is a BOOLEAN in the recipe vocabulary; the engine option is the
            // ENUM frameGenMode. The translation lives here, once.
            frameGenMode: (cfg.frames !== undefined ? cfg.frames : false) ? 'topDown' : 'groundUp',
        };
        if (cfg.stepping !== undefined && cfg.stepping !== null) {
            options.stepping = cfg.stepping;
        }
        return [dimension, options];
    }

    /**
     * applyPreInit(cfg, universe) — the cfg keys that must reach the universe BEFORE
     * `universe.init` (the engine reads them while initializing and freezes them): today
     * `iframeIntervalSeconds`, through the universe's own pre-init setter. Omitted ⇒ nothing is
     * written. Every world step that calls `universe.init(...initArgs(cfg))` calls this
     * first.
     * @param {Object} cfg
     * @param {Object} universe
     */
    function applyPreInit(cfg, universe) {
        if (cfg && cfg.iframeIntervalSeconds !== undefined && cfg.iframeIntervalSeconds !== null) {
            universe.iframe_interval_seconds = cfg.iframeIntervalSeconds;
        }
    }

    var FrqtlWorldInit = { INIT_CFG: INIT_CFG, assertInitCfg: assertInitCfg, initArgs: initArgs, applyPreInit: applyPreInit };

    export { FrqtlWorldInit };

