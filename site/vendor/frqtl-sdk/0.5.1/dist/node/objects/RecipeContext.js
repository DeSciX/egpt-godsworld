/* Copyright 2023-2026 by Essam Abadir */

/**
 * RecipeContext — the recipe facade (`exp`) a scene's buildExperiment(exp) is evaluated against.
 *
 * A scene's FIRST statement co-initializes its display and its universe — one call, one rect,
 * named by the renderer it initializes (the Pixi `new Application({width, height})` / p5
 * `createCanvas(w, h)` line of a FRQTL sketch):
 *
 *   exp.createCanvas(w, h, worldCfg)       p5:    a 2D canvas AND a 2D universe of exactly w×h
 *   exp.createScene(w, h, d, worldCfg)     three: a 3D scene AND a 3D universe w×h×d
 *
 * That call is the ONLY place a world size is written: the facade is constructed SIZELESS
 * (`{canvasParentId, seed, onTick, …}`) and builds its runner INSIDE the call
 * (`new FrqtlApp({canvasW: w, canvasH: h, …})` → `runner.createCanvas()` →
 * `universe.init(...FrqtlWorldInit.initArgs(cfg))`). `worldCfg` is the world
 * vocabulary minus what the call owns (`FrqtlWorldInit.INIT_CFG`; a size, `activeAxes` or
 * `depth` in it THROWS naming this call). 2D ⇒ the engine's {x,y} default; 3D ⇒ {x,y,z} and the
 * explicit depth d.
 *
 *   exp.world                     the ONE readable answer: frozen {renderer, w, h, d, cfg}
 *   exp.addObject(kind, config)   ObjectFactory.create(kind, config, ctx) sugar
 *   exp.addTickFunction(fn)       universe.experimentTickFunctions.push
 *   exp.render(bag)               runner.setRenderOptions(bag)
 *   exp.build(buildFn)            run the recipe WITHOUT starting the loop
 *   exp.buildSource(src)          the same, for the recipe as module TEXT (the one eval site)
 *   exp.run(buildFn)              build (if needed) + start the loop
 *   exp.runner / .universe        the runner the co-init call built
 *   exp.is3D                      world.renderer === 'three'
 *
 * FAIL-LOUD: every member that needs the world THROWS before the call; a second call in one
 * recipe run THROWS; a call naming a renderer the host did not boot THROWS; a recipe that returns
 * without a world THROWS from build(); `exp.init(cfg)` is DELETED and throws naming the two
 * methods. None degrades to a default size.
 *
 * Classic-script module: a browser global and a Node CJS module (`window` resolution mirrors the
 * setup factories). IDE compatibility: `window._frqtlApp` is set by FrqtlApp.start(); `window.
 * _egptExperiment` is set by build()/run() to THIS facade.
 */

(function () {
    'use strict';

    var _gbl = typeof window !== 'undefined' ? window : globalThis;
    var _node = (typeof module !== 'undefined' && module.exports);

    function _resolve(name) { return _gbl[name] || null; }

    /** The world-init contract (objects/setup/_worldInit.js), resolved at call time. */
    function _worldInit() {
        var W = _node ? require('./setup/_worldInit.js') : _gbl.FrqtlWorldInit;
        if (!W || typeof W.initArgs !== 'function' || typeof W.assertInitCfg !== 'function') {
            throw new Error('[RecipeContext] FrqtlWorldInit is not loaded: objects/setup/_worldInit.js ' +
                'OWNS the world-cfg vocabulary and its universe.init mapping, and ships in the ' +
                'game-layer roster (lib/shim/engine/game-layer-manifest.js) ahead of objects/setup/ — load it.');
        }
        return W;
    }

    /** The display slot's booted renderer name (FrqtlDisplay — the ONE display owner). */
    function _bootedRenderer() {
        var D = _gbl.FrqtlDisplay || (_node ? require('../compat/renderer/display-slot.js') : null);
        var n = (D && typeof D.name === 'function') ? D.name() : null;
        if (!n) {
            throw new Error('[RecipeContext] no display is booted (FrqtlDisplay.name() is empty): the host ' +
                'boots the renderer the scene\'s registry row names (renderState.renderer) before the ' +
                'scene runs. (FAIL-LOUD.)');
        }
        return n;
    }

    var COINIT = 'exp.createCanvas(w, h, cfg) (p5, 2D) or exp.createScene(w, h, d, cfg) (three, 3D)';
    var NO_WORLD = '[RecipeContext] the scene has not created its world — its first statement is ' + COINIT + '.';

    // The ctor options a SIZELESS facade forwards to the runner it builds (everything but a size).
    var RUNNER_OPTS = ['canvasParentId', 'seed', 'tickHz', 'drawHz', 'stepsPerFrame', 'onTick', 'onReady', 'engine'];
    var FACADE_OPTS = RUNNER_OPTS.concat(['deferCanvas']);

    /**
     * @param {Object} [opts] — `{canvasParentId, seed, onTick, onReady, tickHz, drawHz, stepsPerFrame,
     *   engine, deferCanvas}`. NO size and NO 3D flag: the scene's co-init call states both.
     *   `deferCanvas:true` leaves `runner.createCanvas()` to a host mount seam (the notebook realm).
     */
    function RecipeContext(opts) {
        opts = opts || {};
        Object.keys(opts).forEach(function (k) {
            if (FACADE_OPTS.indexOf(k) === -1) {
                throw new Error('[RecipeContext] unknown option "' + k + '" — the facade is SIZELESS: it takes ' +
                    FACADE_OPTS.join(', ') + '. A world size (canvasW/canvasH) or 3D-ness is the scene\'s, ' +
                    'stated by ' + COINIT + '. (FAIL-LOUD.)');
            }
        });
        if (!_resolve('FrqtlApp') && !_node) {
            throw new Error('[RecipeContext] FrqtlApp not loaded — stack-boot.js must run first');
        }
        this._opts   = opts;
        this._runner = null;    // built by the co-init call
        this._world  = null;    // set by the co-init call; reset by build()
        this._built  = false;
        this._buildFn = null;
    }

    function _requireWorld(self) {
        if (!self._world) { throw new Error(NO_WORLD); }
    }

    Object.defineProperty(RecipeContext.prototype, 'world', { get: function () { return this._world; } });
    Object.defineProperty(RecipeContext.prototype, 'runner', {
        get: function () { _requireWorld(this); return this._runner; }
    });
    Object.defineProperty(RecipeContext.prototype, 'universe', {
        get: function () { _requireWorld(this); return this._runner.universe; }
    });
    /** READ-ONLY: did THIS scene make a 3D world? The method it called answers (three ⇔ 3D). */
    Object.defineProperty(RecipeContext.prototype, 'is3D', {
        get: function () { _requireWorld(this); return this._world.renderer === 'three'; }
    });

    // ── the co-init call ─────────────────────────────────────────────────────────────

    function _coinit(self, method, renderer, w, h, d, cfg) {
        var where = 'RecipeContext.' + method;
        if (self._world) {
            throw new Error('[' + where + '] one world per scene: this recipe already created ' +
                JSON.stringify({ renderer: self._world.renderer, w: self._world.w, h: self._world.h, d: self._world.d }) +
                '. (FAIL-LOUD.)');
        }
        [['w', w], ['h', h]].concat(renderer === 'three' ? [['d', d]] : []).forEach(function (p) {
            if (typeof p[1] !== 'number' || !(p[1] > 0)) {
                throw new Error('[' + where + '] ' + p[0] + ' must be a positive number (got ' + JSON.stringify(p[1]) +
                    ') — every scene states its whole world' + (p[0] === 'd' ? '; the engine\'s cube default is not relied on' : '') +
                    '. (FAIL-LOUD.)');
            }
        });
        cfg = cfg || {};
        var W = _worldInit();
        W.assertInitCfg(where + '(…, cfg)', cfg, null);
        var booted = _bootedRenderer();
        if (booted !== renderer) {
            var err = new Error('[' + where + '] the scene calls ' + method + ' (' + renderer + ') but the host ' +
                'booted "' + booted + '" — the host\'s display (a registry row\'s renderState.renderer, bootScene\'s ' +
                'opts.renderer) and the scene disagree. (FAIL-LOUD.)');
            err.frqtlRequiredRenderer = renderer;
            err.frqtlBootedRenderer = booted;
            throw err;
        }
        if (self._runner) {
            // Restart on the same page replays the same single call: the runner (and its canvas)
            // already ARE that world. A different world needs a fresh page.
            var r = self._runner.canvas_rect;
            if (r.w !== w || r.h !== h || self._runner._depth !== (renderer === 'three' ? d : null) ||
                self._runner._is3D !== (renderer === 'three')) {
                throw new Error('[' + where + '] this page already holds a ' + r.w + 'x' + r.h + ' world; a scene ' +
                    'with a different world needs a fresh page. (FAIL-LOUD.)');
            }
        } else {
            var FrqtlApp = _resolve('FrqtlApp') || (_node ? require('./FrqtlApp.js').FrqtlApp : null);
            var ropts = { canvasW: w, canvasH: h, is3D: renderer === 'three' };
            if (renderer === 'three') { ropts.canvasD = d; }
            RUNNER_OPTS.forEach(function (k) { if (self._opts[k] !== undefined) { ropts[k] = self._opts[k]; } });
            self._runner = new FrqtlApp(ropts);
            if (!self._opts.deferCanvas) { self._runner.createCanvas(); }
        }
        var u = self._runner.universe;
        var args = W.initArgs(cfg);
        if (renderer === 'three') {
            args[1].activeAxes = { x: true, y: true, z: true };
            args[1].depth = d;
        }
        // A (re-)inited world has no declared objects; the recipe re-declares what it builds.
        self._runner.clearDeclared();
        W.applyPreInit(cfg, u);   // pre-init world keys (iframeIntervalSeconds) — the engine reads them at init
        u.init.apply(u, args);
        self._world = Object.freeze({ renderer: renderer, w: w, h: h, d: renderer === 'three' ? d : null,
                                      cfg: Object.freeze(Object.assign({}, cfg)) });
        return self;
    }

    /** p5: a 2D canvas AND a 2D universe of exactly w×h. */
    RecipeContext.prototype.createCanvas = function (w, h, cfg) {
        if (arguments.length > 3) {
            throw new Error('[RecipeContext.createCanvas] takes (w, h, cfg) — a 2D world has no depth; a 3D ' +
                'world is exp.createScene(w, h, d, cfg). (FAIL-LOUD.)');
        }
        return _coinit(this, 'createCanvas', 'p5', w, h, null, cfg);
    };

    /** three: a 3D scene AND a 3D universe w×h×d (d REQUIRED). */
    RecipeContext.prototype.createScene = function (w, h, d, cfg) {
        return _coinit(this, 'createScene', 'three', w, h, d, cfg);
    };

    // ── deleted: init(cfg) / initCfg ─────────────────────────────────────────────────
    RecipeContext.prototype.init = function () {
        throw new Error('[RecipeContext] exp.init(cfg) is DELETED — a scene states its world, size included, ' +
            'with ' + COINIT + '. (FAIL-LOUD: a saved module carrying exp.init( must be re-saved.)');
    };
    Object.defineProperty(RecipeContext.prototype, 'initCfg', {
        get: function () {
            throw new Error('[RecipeContext] exp.initCfg is DELETED — read exp.world ({renderer, w, h, d, cfg}). (FAIL-LOUD.)');
        }
    });

    // ── parts, tick-fns, render ──────────────────────────────────────────────────────

    RecipeContext.prototype.addObject = function (kind, config) {
        _requireWorld(this);
        var ObjectFactory = _resolve('ObjectFactory');
        if (!ObjectFactory) { throw new Error('[RecipeContext.addObject] ObjectFactory not loaded'); }
        var x = (config && config.x != null) ? config.x : 0;
        var y = (config && config.y != null) ? config.y : 0;
        var ctx = { runner: this._runner, cw: null, x: x, y: y };
        return ObjectFactory.create(kind, config, ctx);
    };

    RecipeContext.prototype.addTickFunction = function (fn) {
        _requireWorld(this);
        var fns = this._runner.universe.experimentTickFunctions;
        fns.push(fn);
        return fns.length - 1;
    };

    /** Name the recipe's LOOK in one call — a pure ferry to `runner.setRenderOptions(bag)`. */
    RecipeContext.prototype.render = function (bag) {
        _requireWorld(this);
        this._runner.setRenderOptions(bag);
        return this;
    };

    // ── build / run ──────────────────────────────────────────────────────────────────

    /**
     * Tear down the scene a previous build put on THIS runner, before a same-runner rebuild
     * (`restart()`, a re-applied module on a live page): FAIL-LOUD, never a sweep.
     *
     * OWNERSHIP: `universe.experimentTickFunctions` is the SCENE's (primitive #3) — rebuilt by the
     * replay, so the old scene's entries must all be gone first. `runner.addTickListener` is the
     * HOST's (a recorder, a live chart, a per-tick lerp) and SURVIVES the rebuild untouched.
     *
     *   1. stop the loop;
     *   2. read the scene's UNDECLARED tick-fns (`exp.addTickFunction`) while the registry still
     *      says which fns the declared parts own;
     *   3. remove every declared object through `runner.removeObject` — the one per-part path
     *      (registry drop → its own dispose() → census check, which THROWS naming a part whose
     *      dispose() left a tick-fn or an LO behind);
     *   4. splice the undeclared fns read at step 2;
     *   5. ASSERT the list is empty — a survivor is a tick-fn nothing owned, never cleared for it.
     */
    function _teardownSceneForRebuild(self) {
        var runner = self._runner;
        runner.stop();
        var fns = runner.universe.experimentTickFunctions;
        var undeclared = runner.undeclaredTickFunctions();
        var declared = runner.declared.slice();
        for (var i = declared.length - 1; i >= 0; i--) { runner.removeObject(declared[i]); }
        for (var j = 0; j < undeclared.length; j++) {
            var at = fns.indexOf(undeclared[j]);
            if (at !== -1) { fns.splice(at, 1); }
        }
        if (fns.length) {
            throw new Error('[RecipeContext.build] rebuilding on the same runner: ' + fns.length + ' tick-function(s) ' +
                'of the previous scene survived its teardown (' + fns.map(function (fn, k) {
                    return fn.name ? fn.name : '<anonymous #' + k + '>'; }).join(', ') + ') — no declared part ' +
                'owned them and the scene did not add them (exp.addTickFunction). Host per-tick work belongs ' +
                'on runner.addTickListener, which survives a rebuild. (FAIL-LOUD.)');
        }
    }

    /**
     * Run a recipe WITHOUT starting the loop. Resets `world` first, so a re-run replays the same
     * single co-init call; a recipe that returns without creating its world THROWS. On a runner a
     * previous build already holds, the previous scene is torn down first (_teardownSceneForRebuild:
     * the scene's tick-fns go, the host's tick listeners stay). A successful build RETAINS its
     * replay on the runner (`runner.retainSceneReplay`), so `runner.restart()` — and a sketch's
     * declared `restart` control — replays this build on the same runner and canvas.
     */
    RecipeContext.prototype.build = function (buildFn) {
        if (buildFn && typeof buildFn === 'function') {
            this._buildFn = buildFn;
            if (this._runner) { _teardownSceneForRebuild(this); }
            this._world = null;
            buildFn(this);
            if (!this._world) {
                throw new Error('[RecipeContext.build] the scene never created its world — its first statement ' +
                    'must be ' + COINIT + '. (FAIL-LOUD.)');
            }
            this._built = true;
            var self = this;
            this._runner.retainSceneReplay(function () { return self.build(self._buildFn); });
        }
        if (typeof window !== 'undefined') { window._egptExperiment = this; }
        return this;
    };

    /**
     * Build a scene held as SOURCE TEXT — the ONE source→scene door: evaluate the module text
     * (global scope, same origin), require that it defined `buildExperiment(exp)`, then `build()`
     * it, so the same-runner teardown and the retained replay apply exactly as for a function.
     * The empty page's `FrqtlPage.applyModuleSource` and the ESM `bootRecipe` both call this; on
     * a booted document it is also the in-document re-scene door (same runner, same canvas).
     * A `buildExperiment` left by an earlier source never satisfies the check: the global is
     * cleared before the text runs.
     *
     * FAIL-LOUD: an empty source, a source that throws, or one that defines no
     * `buildExperiment` THROWS; so does everything `build()` throws.
     *
     * @param {string} src - the `buildExperiment(exp)` module source
     * @returns {RecipeContext} this
     */
    RecipeContext.prototype.buildSource = function (src) {
        if (typeof src !== 'string' || !src.trim()) {
            throw new Error('[RecipeContext.buildSource] no scene source — pass the buildExperiment(exp) module ' +
                'text (the blank universe is itself a scene, scenes/empty.js). (FAIL-LOUD.)');
        }
        _gbl.buildExperiment = undefined;
        (0, eval)(src);
        if (typeof _gbl.buildExperiment !== 'function') {
            throw new Error('[RecipeContext.buildSource] the scene source did not define buildExperiment(exp) — ' +
                'its classic tail sets window.buildExperiment. (FAIL-LOUD.)');
        }
        return this.build(_gbl.buildExperiment);
    };

    RecipeContext.prototype.run = function (buildFn) {
        if (buildFn && typeof buildFn === 'function' && !this._built) { this.build(buildFn); }
        _requireWorld(this);
        if (typeof window !== 'undefined') { window._egptExperiment = this; }
        this._runner.start();
    };

    // The world-init contract is NOT a RecipeContext static: reading one of its names THROWS.
    ['INIT_CFG', 'assertInitCfg', 'initArgs'].forEach(function (name) {
        Object.defineProperty(RecipeContext, name, {
            get: function () {
                throw new Error('RecipeContext.' + name + ' does not exist: the world-cfg contract is ' +
                    'FrqtlWorldInit.' + name + ' (objects/setup/_worldInit.js).');
            }
        });
    });

    if (_node) {
        module.exports = { RecipeContext: RecipeContext };
    } else {
        window.RecipeContext = RecipeContext;
    }

})();
