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
 *   exp.addObject(kind, config)   ObjectFactory.create(kind, config, ctx) sugar (a kind by name or class)
 *   exp.declare(parts)            the sketch's `export const parts = { name: [Kind, props] }`, in key order;
 *                                 returns the frozen build-time map { key: handle }
 *   exp.addTickFunction(fn)       universe.experimentTickFunctions.push
 *   exp.render(bag)               runner.setRenderOptions(bag)
 *   exp.build(sketch)             run the recipe WITHOUT starting the loop; `sketch` is a buildExperiment
 *                                 function or linkProject's result (lib/shim/project/link.js) — then the
 *                                 facade HOLDS that project's text
 *   exp.toSketch()                write the hands into the held text's `parts` block → { files, changes, refused }
 *   exp.setDeclared(name, patch)  patch one parts entry and re-run in this document
 *   exp.run(buildFn)              build (if needed) + start the loop
 *
 * THE WRITER CONTRACT. The facade that linked a sketch is the ONE owner of its current text: the text it
 * linked, then every toSketch / setDeclared result.
 *   - exp.declare(parts) calls exp.addObject(Kind, { name: key, ...props }) per own key (zero physics). It
 *     refuses a string Kind (naming the import form), an unregistered class, a props.name (the key IS the
 *     name) and a second call in one build. Each object it declares is an `inParts` row of runner.declared;
 *     its capture right after construction (ObjectSchema.captureProps) is the writer's baseline. It returns
 *     the frozen build-time map { key: handle } (`const p = exp.declare(parts); … p.screen`).
 *   - toSketch is a HOST call at the END of an act (STUDIO: a hand's release; a lab: the end of a hand),
 *     never per placement. It writes, through lib/shim/project/parts-writer.js patchParts, only what a
 *     hand did since the last call (the runner's hand mark): an inParts object's touched writable keys
 *     (`set`), a declared object added since the build (`add`, the last key, plus one import line), an
 *     inParts object no longer live (`remove`). A hand on a code declaration is refused by name. It
 *     adopts its result and resets every baseline, so a second call with no hand between is a no-op.
 *   - setDeclared validates each key against the kind's descriptor (writable, its own validator),
 *     patches the held text and re-runs through the one restart door in THIS document; the seed (the
 *     sketch's own co-init cfg) and the camera pose (its poseFields, re-applied through setOrbit) are kept.
 *   - A hand is a write through runner.updateObjectProperty or runner.placeDeclaredAt; a host that calls a
 *     part's own setter is driving the run, and the writer does not write it. A hand never renames: the key is
 *     the name, so a touched `name` is refused (toSketch) or thrown (setDeclared).
 *   - setDeclared refuses while a hand is unwritten (await exp.toSketch() first); its `kept` lists what it kept.
 *   - restart() of a linked sketch re-links the CURRENT text (the retained replay) and returns a Promise.
 *   exp.runner / .universe        the runner the co-init call built
 *   exp.sceneExports              the named exports of the scene module the last build linked (its module
 *                                 namespace — the module that built this world, never a second evaluation);
 *                                 reading it THROWS when the scene was built from a function, which has none
 *   exp.is3D                      world.renderer === 'three'
 *
 * FAIL-LOUD: every member that needs the world THROWS before the call; a second call in one
 * recipe run THROWS; a call naming a renderer the host did not boot THROWS; a recipe that returns
 * without a world THROWS from build(); `exp.init(cfg)` is DELETED and throws naming the two
 * methods. None degrades to a default size.
 *
 * The page's facade: build()/run() make THIS facade the page's experiment (`pageExperiment()`,
 * read by a host frame through the page door as FrqtlPage.experiment); the runner it built is the
 * page's runner once its loop starts (FrqtlApp `pageRunner()`).
 */

import { FrqtlApp } from './FrqtlApp.js';
import { ObjectFactory } from './ObjectFactory.js';
import { FrqtlWorldInit } from './setup/_worldInit.js';
import * as FrqtlDisplay from '../compat/renderer/display-slot.js';
import { refuseRetiredDoors } from '../compat/engine.js';
import { ObjectSchema } from './schema/index.js';
import { kindOf } from './kinds.js';
import { linkProject } from '../../shim/project/link.js';
import { patchParts, PARTS_EXPORT, entryKeys, entryLiteral } from '../../shim/project/parts-writer.js';
import { spellRect, spellCenter, captureCenter } from '../../shim/project/parts-spelling.js';
import { moduleOfKind, PARTS_SPECIFIER } from '../../shim/project/parts-module.js';
import { forkPartText, FORK_REFUSED } from '../../shim/project/fork.js';
import { readText } from '../../shim/project/read-text.js';
import { packageRoot } from '../compat/package-root.js';
import { MANIFEST_FILE } from '../../shim/project/manifest.js';
import { Record, openRecordOf } from './record/Record.js';

    /** The world-init contract (objects/setup/_worldInit.js). */
    function _worldInit() {
        return FrqtlWorldInit;
    }

    /** The display slot's booted renderer name (FrqtlDisplay — the ONE display owner). */
    function _bootedRenderer() {
        var n = FrqtlDisplay.name();
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
        this._opts   = opts;
        this._runner = null;    // built by the co-init call
        this._world  = null;    // set by the co-init call; reset by build()
        this._built  = false;
        this._buildFn = null;
        this._project = null;   // THE held project text: { files: {path: text}, entry, mint, bare? } (build(linked))
        this._urls    = null;   // the minted URL of each project file, from the last link
        this._module  = null;   // the entry module's namespace, from the last link (exp.sceneExports)
        this._parts   = new Map();   // declared object → { key, baseline } — the objects in `parts`
        this._code    = new Map();   // declared object → baseline — the code declarations at build end
        this._declaredOnce = false;
        this._record  = null;   // the open Record (exp.startRecord), or null
        this._reauthored = null;   // the Record the last re-authoring closed (startRecord checks its close was heard)
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
    /** READ-ONLY: the named exports of the scene module the last build linked (the module that built this world). */
    Object.defineProperty(RecipeContext.prototype, 'sceneExports', {
        get: function () {
            _requireWorld(this);
            if (!this._module) {
                throw new Error('[RecipeContext] sceneExports: this world was built from a buildExperiment function, ' +
                    'not a linked scene module, so it has no module exports to read — build it from its text: ' +
                    'exp.build(await linkProject({ files, entry, mint })) (lib/shim/project/link.js). (FAIL-LOUD.)');
            }
            return this._module;
        }
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
            var ropts = { canvasW: w, canvasH: h, is3D: renderer === 'three' };
            if (renderer === 'three') { ropts.canvasD = d; }
            RUNNER_OPTS.forEach(function (k) { if (self._opts[k] !== undefined) { ropts[k] = self._opts[k]; } });
            self._runner = new FrqtlApp(ropts);
            if (!self._opts.deferCanvas) { self._runner.createCanvas(); }
        }
        // The census maps a declared kind's module against the project files this facade linked (FrqtlApp.declare).
        self._runner._projectUrls = self._urls;
        var u = self._runner.universe;
        var args = W.initArgs(cfg);
        if (renderer === 'three') {
            args[1].activeAxes = { x: true, y: true, z: true };
            args[1].depth = d;
        }
        // A (re-)inited world has no declared objects; the recipe re-declares what it builds.
        self._runner.clearDeclared();
        self._runner.beginWorld();   // a (re-)inited world has not stepped
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

    /** exp.addObject(kind, config) — a kind by name (a host's JSON) or by its class. */
    RecipeContext.prototype.addObject = function (kind, config) {
        _requireWorld(this);
        var x = (config && config.x != null) ? config.x : 0;
        var y = (config && config.y != null) ? config.y : 0;
        var ctx = { runner: this._runner, cw: null, x: x, y: y };
        return ObjectFactory.create(kind, config, ctx);
    };

    // ── the parts block ───────────────────────────────────────────────────────────────

    var IMPORT_FORM = 'import { <Kind> } from \'@descix/frqtl-web/parts\'';

    /** A deep copy of arrays and plain objects (the module-level literal is never shared with a part). */
    function _plain(v) {
        if (v === null || typeof v !== 'object') { return v; }
        if (Array.isArray(v)) { return v.map(_plain); }
        var proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) { return v; }
        var out = {};
        Object.keys(v).forEach(function (k) { out[k] = _plain(v[k]); });
        return out;
    }

    /**
     * exp.declare(parts) — seed the declared parts of `export const parts = { name: [Kind, props], … }`, in key
     * order: `exp.addObject(Kind, { name: key, ...props })` per own key. Packaging, zero physics. Each object
     * declared here is an `inParts` object of the census, and its capture right after construction is the
     * writer's baseline (toSketch diffs against it).
     * RETURNS the build-time map `Object.freeze({ <key>: handle, … })`, in key order — each value the object
     * exp.addObject returned (the same identity as its runner.declared row), so later scene code reads a part
     * as `const p = exp.declare(parts); … p.screen`. A hand add or remove after the build does not update it.
     * REFUSES (throws): a string Kind (name the import form), a Kind that is not a registered class, a
     * `props.name` (the key IS the name), a second declare in one build, an entry not written [Kind, props].
     */
    RecipeContext.prototype.declare = function (parts) {
        _requireWorld(this);
        if (this._declaredOnce) {
            throw new Error('[RecipeContext.declare] exp.declare(parts) runs ONCE per build — the scene\'s one `export const ' +
                PARTS_EXPORT + '` block is its declared parts. (FAIL-LOUD.)');
        }
        if (!parts || typeof parts !== 'object' || Array.isArray(parts)) {
            throw new TypeError('[RecipeContext.declare] exp.declare(parts): parts is the sketch\'s `export const ' + PARTS_EXPORT +
                ' = { name: [Kind, { …props }] }` object. (FAIL-LOUD.)');
        }
        this._declaredOnce = true;
        var self = this;
        var out = {};
        Object.keys(parts).forEach(function (key) {
            var entry = parts[key];
            if (!Array.isArray(entry) || entry.length !== 2 || !entry[1] || typeof entry[1] !== 'object' || Array.isArray(entry[1])) {
                throw new TypeError('[RecipeContext.declare] parts.' + key + ' is not [Kind, { …props }]. (FAIL-LOUD.)');
            }
            var Kind = entry[0], props = entry[1];
            if (typeof Kind === 'string') {
                throw new TypeError('[RecipeContext.declare] parts.' + key + ' names its kind by the string "' + Kind + '" — in ' +
                    '`parts` a kind is the imported class: ' + IMPORT_FORM.replace('<Kind>', Kind) + '. (exp.addObject(name, ' +
                    'props) still takes a string.) (FAIL-LOUD.)');
            }
            if (typeof Kind !== 'function' || !kindOf(Kind)) {
                throw new TypeError('[RecipeContext.declare] parts.' + key + ': ' + (typeof Kind === 'function'
                    ? 'the class ' + (Kind.name || '(anonymous)') + ' is not a registered kind in this realm'
                    : 'the kind is ' + (Kind === null ? 'null' : typeof Kind) + ', not a registered class') +
                    ' — ' + IMPORT_FORM + ', or register a forked part\'s renamed class (@descix/frqtl-web/kinds). (FAIL-LOUD.)');
            }
            if (Object.prototype.hasOwnProperty.call(props, 'name')) {
                throw new TypeError('[RecipeContext.declare] parts.' + key + ' carries name ' + JSON.stringify(props.name) +
                    ' — in `parts` the KEY is the name ("' + key + '"); delete the name prop. (FAIL-LOUD.)');
            }
            var obj = self.addObject(Kind, Object.assign({ name: key }, _plain(props)));
            self._runner._adoptIntoParts(obj);
            self._parts.set(obj, { key: key, baseline: _capture(self, obj), kind: self._runner.kindOf(obj) });
            out[key] = obj;
        });
        return Object.freeze(out);
    };

    function _capture(self, obj) {
        return ObjectSchema.captureProps(obj, self._runner.kindOf(obj));
    }

    /** The fields a hand or setDeclared may write: the descriptor's, minus write-only adapters and readonly reads. */
    function _writable(kind) {
        var d = ObjectSchema.get(kind);
        var out = {};
        ((d && d.fields) || []).forEach(function (f) {
            if (f.writeOnly !== true && f.type !== 'readonly') { out[f.name] = f; }
        });
        return out;
    }

    /** The writable keys whose live value differs from the baseline (JSON-equal = untouched). */
    function _touched(kind, baseline, live) {
        var w = _writable(kind);
        var out = {};
        var lost = [];
        Object.keys(w).forEach(function (k) {
            var a = baseline[k], b = live[k];
            if (JSON.stringify(a) === JSON.stringify(b)) { return; }
            if (b === undefined) { lost.push(k); return; }
            out[k] = b;
        });
        return { props: out, lost: lost };
    }

    var RENAME = FrqtlApp.RENAME_REFUSAL;

    var _JSON = function (v) { return JSON.stringify(v); };

    /**
     * Spell a touched value in the entry's OWN form, reading the form off the held TEXT: the rule is
     * lib/shim/project/parts-spelling.js spellRect / spellCenter (applyRows asks the same rule of a parts block).
     * Each mutates and returns `props`.
     */
    function _spell(text, name, kind, props, baseline) {
        return spellRect(props, { kind: kind, baseline: baseline, entryKeys: function () { return entryKeys(text, name); } });
    }

    function _spellCenter(text, name, props) {
        return spellCenter(props, {
            entryKeys: function () { return entryKeys(text, name); },
            centerLength: function () {
                var r = entryLiteral(text, name, 'center');
                return r.literal ? (Array.isArray(r.value) ? r.value.length : null) : (r.length === undefined ? null : r.length);
            }
        });
    }

    /**
     * The post-patch check: what the patched text now declares for entry `name`, read back (entryLiteral) for every
     * written key and folded with the baseline for every unwritten one, must equal the live capture — `rect` in its
     * capture form, through the descriptor's derivedFrom rows. Each mismatch is a refusal naming the key.
     */
    function _verifyWritten(text, name, kind, written, baseline, live) {
        var refused = [];
        var R4 = ObjectSchema.RECT_TUPLE[4], R6 = ObjectSchema.RECT_TUPLE[6];
        var derived = ObjectSchema.derivedReads(kind);
        var decl = {};
        Object.keys(written).forEach(function (k) {
            var r = entryLiteral(text, name, k);
            decl[k] = r.literal ? r.value : undefined;
            // A two-number center declares z 0: read it in its capture form through the one inverse.
            if (k === 'center' && Array.isArray(decl[k]) && decl[k].length === 2) { decl[k] = captureCenter(decl[k]); }
        });
        function refuse(k, declared, liveV) {
            refused.push({ op: 'set', name: name, key: k, reason: 'the written text declares ' + _JSON(declared) + ' but the live object is ' +
                _JSON(liveV) + ' — the hand is not in the text.' });
        }
        var asDerived = {};
        derived.forEach(function (d) { asDerived[d.name] = d; });
        Object.keys(written).forEach(function (k) {
            if (asDerived[k]) { return; }
            var lv = live[k];
            if (Array.isArray(lv) && lv.length === 6 && derived.some(function (d) { return d.field === k; })) { return; }
            if (_JSON(decl[k]) !== _JSON(lv)) { refuse(k, decl[k], lv); }
        });
        var fields = {};
        derived.forEach(function (d) { fields[d.field] = true; });
        Object.keys(fields).forEach(function (f) {
            var lv = live[f];
            if (!Array.isArray(lv) || lv.length !== 6) { return; }
            var touched = written[f] !== undefined || derived.some(function (d) { return d.field === f && written[d.name] !== undefined; });
            if (!touched) { return; }
            var six = Array.isArray(baseline[f]) && baseline[f].length === 6 ? baseline[f].slice() : null;
            var d0 = decl[f];
            if (Array.isArray(d0) && d0.length === 6) { six = d0.slice(); }
            else if (Array.isArray(d0) && d0.length === 4 && six) { R4.forEach(function (k, i) { six[R6.indexOf(k)] = d0[i]; }); }
            derived.forEach(function (d) {
                if (d.field === f && six && decl[d.name] !== undefined) { six[R6.indexOf(d.key)] = decl[d.name]; }
            });
            if (_JSON(six) !== _JSON(lv)) { refuse(f, six, lv); }
        });
        return refused;
    }

    var OUTSIDE_PARTS = 'this sketch declares its parts outside `parts`; STUDIO can run it but cannot write hand edits ' +
        'into it — declare them in `export const parts` to make it editable.';

    function _requireHeld(self, where) {
        if (!self._project) {
            throw new Error('[RecipeContext.' + where + '] this scene was not built from linked text — the writer writes the ' +
                'text a facade linked: exp.build(await linkProject({ files, entry, mint })) (lib/shim/project/link.js). (FAIL-LOUD.)');
        }
    }

    /**
     * exp.toSketch() → Promise<{ files, changes, refused }> — write the hands into the sketch's `parts` literal.
     * A HOST call at the END of an act (a drop, a drag end, a delete; a lab's end of a hand), never per
     * placement. For each declared object a hand wrote since the last call (the runner's hand mark: a device
     * door — updateObjectProperty, placeDeclaredAt — wrote it; a part the scene's own code moves is the run,
     * not a hand), it diffs the `inParts` object's live capture against its baseline (touched keys only →
     * `set`), writes each declared object added since the build (`add`, as the last key, plus its import line)
     * and each removed `inParts` object (`remove`), through lib/shim/project/parts-writer.js patchParts on the
     * HELD text. A code-declared object a hand touched (or removed) is refused by name. On return the patched
     * text IS the held text and every baseline is the live capture, so a second call with no hand between
     * returns byte-identical files and no changes.
     *   files    { path: text } — the whole project as now held
     *   changes  patchParts' changes (a `literalized` set names the expression it replaced)
     *   refused  every hand not written, { op, name, key?, reason }
     */
    RecipeContext.prototype.toSketch = async function (opts) {
        _requireWorld(this);
        _requireHeld(this, 'toSketch');
        var by = this._record ? Record.requireBy(opts && opts.by, 'RecipeContext.toSketch') : null;
        if (this._record) { this._record._admit('RecipeContext.toSketch'); }
        var self = this;
        var runner = this._runner;
        var declared = runner.declared;
        var edits = [];
        var refused = [];
        var adopted = [];
        var hands = runner._takeHandTouched();
        this._parts.forEach(function (row, obj) {
            if (declared.indexOf(obj) === -1) { edits.push({ op: 'remove', name: row.key, kind: row.kind, baseline: row.baseline }); return; }
            if (!hands.has(obj)) { return; }
            var kind = runner.kindOf(obj);
            var t = _touched(kind, row.baseline, _capture(self, obj));
            if (Object.prototype.hasOwnProperty.call(t.props, 'name')) {
                refused.push({ op: 'set', name: row.key, key: 'name', reason: RENAME });
                delete t.props.name;
            }
            t.lost.forEach(function (k) {
                refused.push({ op: 'set', name: row.key, key: k, reason: 'the live object no longer reports "' + k + '" — there is no value to write.' });
            });
            if (Object.keys(t.props).length) {
                var raw = _plain(t.props);   // the capture form, before the entry's spelling (the Record's row values)
                _spell(self._project.files[self._project.entry], row.key, kind, t.props, row.baseline);
                _spellCenter(self._project.files[self._project.entry], row.key, t.props);
                if (Object.keys(t.props).length) { edits.push({ op: 'set', name: row.key, props: t.props, obj: obj, kind: kind, baseline: row.baseline, raw: raw }); }
            }
        });
        this._code.forEach(function (baseline, obj) {
            var name = obj.name || runner.kindOf(obj);
            if (declared.indexOf(obj) === -1) {
                refused.push({ op: 'remove', name: name, reason: '"' + name + '" is declared in code: ' + OUTSIDE_PARTS });
                return;
            }
            if (!hands.has(obj)) { return; }
            var t = _touched(runner.kindOf(obj), baseline, _capture(self, obj));
            if (Object.keys(t.props).length || t.lost.length) {
                refused.push({ op: 'set', name: name, reason: '"' + name + '" is declared in code: ' + OUTSIDE_PARTS });
            }
        });
        declared.forEach(function (obj) {
            if (self._parts.has(obj) || self._code.has(obj)) { return; }
            var kind = runner.kindOf(obj);
            var row = kindOf(kind);
            var props = _capture(self, obj);
            var w = _writable(kind);
            Object.keys(props).forEach(function (k) { if (!w[k] || k === 'name') { delete props[k]; } });
            edits.push({ op: 'add', name: obj.name || kind, Kind: kind, module: row ? moduleOfKind(row.from, self._urls) : null, props: props });
            adopted.push(obj);
        });
        var entry = this._project.entry;
        var r = patchParts(this._project.files[entry], edits.map(function (e) {
            if (e.op === 'set') { return { op: 'set', name: e.name, props: e.props }; }
            if (e.op === 'remove') { return { op: 'remove', name: e.name }; }
            return { op: 'add', name: e.name, Kind: e.Kind, module: e.module, props: e.props };
        }), { entry: entry });
        // Never decide it succeeded without asking: read the patched text back against each moved object.
        edits.forEach(function (e) {
            if (e.op !== 'set') { return; }
            if (r.refused.some(function (x) { return x.op === 'set' && x.name === e.name; })) { return; }
            refused.push.apply(refused, _verifyWritten(r.text, e.name, e.kind, e.props, e.baseline, _capture(self, e.obj)));
        });
        var refusedAdd = {};
        r.refused.forEach(function (x) { if (x.op === 'add') { refusedAdd[x.name] = true; } });
        var files = Object.assign({}, this._project.files);
        files[entry] = r.text;
        this._project = Object.assign({}, this._project, { files: files });
        // Adopt: the written text is held; baselines follow the live objects.
        var removedRefused = {};
        r.refused.forEach(function (x) { if (x.op === 'remove') { removedRefused[x.name] = true; } });
        this._parts.forEach(function (row, obj) {
            if (declared.indexOf(obj) === -1) { if (!removedRefused[row.key]) { self._parts.delete(obj); } return; }
            row.baseline = _capture(self, obj);
        });
        adopted.forEach(function (obj) {
            var key = obj.name || runner.kindOf(obj);
            if (refusedAdd[key]) { return; }
            runner._adoptIntoParts(obj);
            self._parts.set(obj, { key: key, baseline: _capture(self, obj), kind: runner.kindOf(obj) });
        });
        var allRefused = refused.concat(r.refused);
        if (this._record) { _recordRows(this, edits, allRefused, by); }
        return { files: Object.assign({}, files), changes: r.changes, refused: allRefused };
    };

    /**
     * The Record's rows for one toSketch, from the writer's own edits as WRITTEN (a refused edit, or a refused key
     * of one, makes no row), in edit order (R3). A `set` whose touched keys include the part's position authority
     * (runner._placementAuthority: `center`, or `rect` with its derivedFrom reads) is a `move` with that ONE key in
     * its capture form; its other touched keys are one `setDeclared` row. `add` → [kind, props as written];
     * `remove` → [kind, the baseline's writable props].
     */
    function _recordRows(self, edits, refused, by) {
        var runner = self._runner;
        var rec = self._record;
        function refusedKeys(name, op) {
            var keys = {};
            var all = false;
            refused.forEach(function (x) {
                if (x.name !== name || x.op !== op) { return; }
                if (x.key === undefined) { all = true; } else { keys[x.key] = true; }
            });
            return all ? null : keys;
        }
        function writableProps(kind, bag) {
            var w = _writable(kind);
            var out = {};
            Object.keys(bag).forEach(function (k) { if (w[k] && k !== 'name') { out[k] = _plain(bag[k]); } });
            return out;
        }
        edits.forEach(function (e) {
            if (e.op === 'add') {
                if (refusedKeys(e.name, 'add') === null) { return; }
                rec._row({ name: e.name, op: 'add', by: by, from: null, to: [e.Kind, _plain(e.props)] });
                return;
            }
            if (e.op === 'remove') {
                if (refusedKeys(e.name, 'remove') === null) { return; }
                rec._row({ name: e.name, op: 'remove', by: by, from: [e.kind, writableProps(e.kind, e.baseline)], to: null });
                return;
            }
            var bad = refusedKeys(e.name, 'set');
            if (bad === null) { return; }
            var raw = e.raw;
            var auth = (raw.center !== undefined || raw.rect !== undefined) ? runner._placementAuthority(e.obj) : null;
            var authReads = {};
            if (auth) {
                authReads[auth] = true;
                ObjectSchema.derivedReads(e.kind).forEach(function (d) { if (d.field === auth) { authReads[d.name] = true; } });
            }
            var moveRefused = Object.keys(bad).some(function (k) { return authReads[k]; });
            if (auth && raw[auth] !== undefined && !moveRefused) {
                var from = {}, to = {};
                from[auth] = _plain(e.baseline[auth]);
                to[auth] = _plain(raw[auth]);
                rec._row({ name: e.name, op: 'move', by: by, from: from, to: to });
            }
            var pf = {}, pt = {}, any = false;
            Object.keys(raw).forEach(function (k) {
                if (k === auth || bad[k]) { return; }
                pf[k] = e.baseline[k] === undefined ? null : _plain(e.baseline[k]);
                pt[k] = _plain(raw[k]);
                any = true;
            });
            if (any) { rec._row({ name: e.name, op: 'setDeclared', by: by, from: pf, to: pt }); }
        });
    }

    /** The names of declared objects a hand marked whose live capture differs from their baseline (not yet written). */
    function _unwrittenHands(self) {
        var runner = self._runner;
        var marks = runner._handTouched;
        if (!marks || !marks.size) { return []; }
        var out = [];
        marks.forEach(function (obj) {
            if (runner.declared.indexOf(obj) === -1) { return; }
            var row = self._parts.get(obj);
            var baseline = row ? row.baseline : self._code.get(obj);
            if (!baseline) { return; }
            var t = _touched(runner.kindOf(obj), baseline, _capture(self, obj));
            if (Object.keys(t.props).length || t.lost.length) { out.push(row ? row.key : (obj.name || runner.kindOf(obj))); }
        });
        return out;
    }

    /** The camera pose the runner's camera declares (poseFields), or null with no camera. */
    function _cameraPose(runner) {
        var cam = runner.cameraControl;
        if (!cam || typeof cam.getOrbit !== 'function' || !Array.isArray(cam.poseFields)) { return null; }
        var orbit = cam.getOrbit() || {};
        var pose = {};
        cam.poseFields.forEach(function (f) { if (orbit[f.name] !== undefined) { pose[f.name] = _plain(orbit[f.name]); } });
        return pose;
    }

    /**
     * exp.setDeclared(name, patch) → Promise<{ set, from, to, tick: 0, kept, files }> — change
     * an `inParts` object's declaration and re-run the scene IN THIS DOCUMENT. `patch` keys must be writable fields
     * of the kind's descriptor and each value must pass the descriptor's own validator (ObjectSchema.normalizeValue);
     * otherwise it refuses (throws) naming the key. The held text is patched (patchParts `set`), then the one restart
     * door (runner.restart → the retained replay re-links the held text) re-runs it: the seed (the sketch's own
     * createScene/createCanvas) and the camera pose (captured through the camera's poseFields, re-applied through
     * setOrbit) are kept; `kept` lists 'cameraPose' only when a pose was captured and re-applied. A `rect` /
     * `center` patch sets where the entry STARTS. The loop's run state is kept. REFUSES (throws) while a hand
     * made since the last toSketch is unwritten (write it first: await exp.toSketch()), and a `name` patch (the
     * key is the name). `from` and `to` are the patched keys' capture (ObjectSchema.captureProps) before and after the
     * re-run — one form on both sides (a z-slab wall's rect is 6 numbers even when the patch typed 4). The patch is
     * written in the entry's own spelling (a rect beside `z`/`depth` as 4 numbers plus those keys; a `center` in the
     * arity the entry spells, three numbers when z is not 0), as a hand's is. With a Record open, its `setDeclared` row carries the same `from`/`to`, written after the re-run.
     */
    RecipeContext.prototype.setDeclared = async function (name, patch, opts) {
        _requireWorld(this);
        _requireHeld(this, 'setDeclared');
        var by = this._record ? Record.requireBy(opts && opts.by, 'RecipeContext.setDeclared') : null;
        if (this._record) { this._record._admit('RecipeContext.setDeclared'); }
        var runner = this._runner;
        var obj = null;
        this._parts.forEach(function (row, o) { if (row.key === name) { obj = o; } });
        if (!obj || runner.declared.indexOf(obj) === -1) {
            throw new Error('[RecipeContext.setDeclared] "' + name + '" is not an object of this sketch\'s `parts` block' +
                (this._code.size ? ' (code declarations: ' + Array.from(this._code.keys()).map(function (o) { return o.name; }).join(', ') +
                    ' — ' + OUTSIDE_PARTS + ')' : '') + '. (FAIL-LOUD.)');
        }
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) {
            throw new TypeError('[RecipeContext.setDeclared] patch is { <field>: value, … } with at least one field. (FAIL-LOUD.)');
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
            throw new TypeError('[RecipeContext.setDeclared] "name": ' + RENAME + ' (FAIL-LOUD.)');
        }
        // A hand made since the last toSketch is not in the held text, and the re-run would drop it without a
        // word: refuse, naming the object, until the host writes it (a placement and a setDeclared are two changes).
        var unwritten = _unwrittenHands(this);
        if (unwritten.length) {
            throw new Error('[RecipeContext.setDeclared] "' + unwritten.join('", "') + '" carries a hand the sketch text does ' +
                'not hold yet — write the hand first: await exp.toSketch(). (FAIL-LOUD.)');
        }
        var kind = runner.kindOf(obj);
        var w = _writable(kind);
        var live = _capture(this, obj);
        var from = {};
        Object.keys(patch).forEach(function (k) {
            if (!w[k]) {
                throw new TypeError('[RecipeContext.setDeclared] "' + k + '" is not a writable field of ' + kind + ' (writable: ' +
                    Object.keys(w).join(', ') + '). (FAIL-LOUD.)');
            }
            try { ObjectSchema.normalizeValue(w[k], patch[k], kind); }
            catch (err) {
                throw new TypeError('[RecipeContext.setDeclared] "' + k + '": ' + String((err && err.message) || err) + ' (FAIL-LOUD.)');
            }
            from[k] = live[k] === undefined ? null : live[k];
        });
        var entry = this._project.entry;
        // The patch is written in the entry's own spelling, as a hand's is (toSketch's order: rect, then center).
        var spelled = _spell(this._project.files[entry], name, kind, _plain(patch), live);
        if (Array.isArray(spelled.center)) { spelled.center = captureCenter(spelled.center); }
        _spellCenter(this._project.files[entry], name, spelled);
        var r = patchParts(this._project.files[entry], [{ op: 'set', name: name, props: spelled }], { entry: entry });
        if (r.refused.length) {
            throw new Error('[RecipeContext.setDeclared] the sketch text refused the patch: ' +
                r.refused.map(function (x) { return (x.key ? x.key + ': ' : '') + x.reason; }).join('; ') + ' (FAIL-LOUD.)');
        }
        var files = Object.assign({}, this._project.files);
        files[entry] = r.text;
        this._project = Object.assign({}, this._project, { files: files });
        var pose = _cameraPose(runner);
        var wasRunning = !!runner._isLooping;
        await runner.restart();
        if (!wasRunning) { runner.stop(); }
        // `kept` is what WAS kept: the seed by construction (the sketch's own co-init cfg); the camera pose only
        // when one was captured and re-applied (a 2D scene with no pose camera has none).
        var kept = ['seed'];
        if (pose && runner.cameraControl && typeof runner.cameraControl.setOrbit === 'function') {
            runner.cameraControl.setOrbit(pose);
            kept.push('cameraPose');
        }
        // `to` is what the re-run declared, in the capture form `from` is in (the text holds the entry's spelling).
        var rebuilt = null;
        this._parts.forEach(function (row, o) { if (row.key === name) { rebuilt = o; } });
        if (!rebuilt) {
            throw new Error('[RecipeContext.setDeclared] the re-run declared no "' + name + '" — the patched text dropped the entry. (FAIL-LOUD.)');
        }
        var after = _capture(this, rebuilt);
        var to = {};
        Object.keys(patch).forEach(function (k) { to[k] = after[k] === undefined ? null : _plain(after[k]); });
        if (this._record) { this._record._row({ name: name, op: 'setDeclared', by: by, from: _plain(from), to: _plain(to) }); }
        return { set: name, from: from, to: to, tick: 0, kept: kept, files: Object.assign({}, files) };
    };

    /**
     * exp.fork(name, NewKind[, { by }]) → Promise<{ fork, file, from, files }> — copy the part file of `inParts` object
     * `name`'s kind into the project as `parts/<NewKind>.js` (lib/shim/project/fork.js forkPartText: the class renamed,
     * its imports rewritten to package specifiers, every other byte the source's), point the entry at the fork (the
     * parts writer's `kind` edit: the Kind identifier and one import line), and re-run the scene IN THIS DOCUMENT
     * through the one restart door, as setDeclared does: the seed and the camera pose are kept, the loop's run state
     * is kept. The source text is the exact bytes the kind's `from` names: a package part's file (read through
     * read-text.js readText), or a project fork's held file. The held project is updated BEFORE the re-run, so an open
     * Record stays open; with one open, `by` is required and its `fork` row ({ from: <kind>, to: { kind, file } }) is
     * written after the re-run. REFUSES (throws, the held text unchanged): a name that is not an `inParts` object, a
     * hand made since the last toSketch that is unwritten, a kind with no file a fork can copy, every forkPartText
     * refusal, a writer refusal, and a re-run whose entry is not the fork.
     */
    /**
     * The fork's plan for `inParts` object `name`, before any read: { obj, from, row, module }. THROWS the refusal
     * fork() and forkRefusal() both name: not an `inParts` object, an unwritten hand, a kind FORK_REFUSED names
     * (lib/shim/project/fork.js, the census reason), a kind with no part file a fork can copy.
     */
    function _forkPlan(self, name) {
        var runner = self._runner;
        var obj = null;
        self._parts.forEach(function (row, o) { if (row.key === name) { obj = o; } });
        if (!obj || runner.declared.indexOf(obj) === -1) {
            throw new Error('[RecipeContext.fork] "' + name + '" is not an object of this sketch\'s `parts` block' +
                (self._code.size ? ' (code declarations: ' + Array.from(self._code.keys()).map(function (o) { return o.name; }).join(', ') +
                    ' — ' + OUTSIDE_PARTS + ')' : '') + '. (FAIL-LOUD.)');
        }
        var unwritten = _unwrittenHands(self);
        if (unwritten.length) {
            throw new Error('[RecipeContext.fork] "' + unwritten.join('", "') + '" carries a hand the sketch text does ' +
                'not hold yet — write the hand first: await exp.toSketch(). (FAIL-LOUD.)');
        }
        var from = runner.kindOf(obj);
        if (Object.prototype.hasOwnProperty.call(FORK_REFUSED, from)) {
            throw new Error('[RecipeContext.fork] ' + from + ' (the kind of "' + name + '") is not forkable — ' + FORK_REFUSED[from] + '. (FAIL-LOUD.)');
        }
        var row = kindOf(from);
        var module = row ? moduleOfKind(row.from, self._urls) : null;
        if (module !== PARTS_SPECIFIER && !(module && Object.prototype.hasOwnProperty.call(self._project.files, module))) {
            throw new Error('[RecipeContext.fork] ' + from + ' (the kind of "' + name + '") has no part file a fork can copy — a fork ' +
                'copies a part of @descix/frqtl-web/parts or a part file of this project. (FAIL-LOUD.)');
        }
        return { obj: obj, from: from, row: row, module: module };
    }

    /**
     * exp.forkRefusal(name) → null when exp.fork(name, …) may run, else the refusal it would throw (one sentence). A
     * host's "Fork into project" control reads it for its disabled state and title; fork() runs the same plan.
     */
    RecipeContext.prototype.forkRefusal = function (name) {
        _requireWorld(this);
        _requireHeld(this, 'forkRefusal');
        try { _forkPlan(this, name); return null; }
        catch (err) { return String(err && err.message).replace(/^\[RecipeContext\.fork\] /, '').replace(/ \(FAIL-LOUD\.\)$/, ''); }
    };

    RecipeContext.prototype.fork = async function (name, NewKind, opts) {
        _requireWorld(this);
        _requireHeld(this, 'fork');
        var by = this._record ? Record.requireBy(opts && opts.by, 'RecipeContext.fork') : null;
        if (this._record) { this._record._admit('RecipeContext.fork'); }
        var runner = this._runner;
        var plan = _forkPlan(this, name);
        var from = plan.from, row = plan.row, module = plan.module;
        var text, libPath;
        if (module === PARTS_SPECIFIER) {
            libPath = row.from.slice(packageRoot().length);
            try { text = await readText(row.from); }
            catch (err) { throw new Error('[RecipeContext.fork] the part file of ' + from + ': ' + ((err && err.message) || err) + '. (FAIL-LOUD.)'); }
        } else {
            libPath = module;
            text = this._project.files[module];
        }
        var forked = forkPartText(text, { from: from, to: NewKind, libPath: libPath, files: this._project.files });
        var file = 'parts/' + NewKind + '.js';
        var entry = this._project.entry;
        var r = patchParts(this._project.files[entry], [{ op: 'kind', name: name, Kind: NewKind, module: file }], { entry: entry });
        if (r.refused.length) {
            throw new Error('[RecipeContext.fork] the sketch text refused the fork: ' +
                r.refused.map(function (x) { return x.reason; }).join('; ') + ' (FAIL-LOUD.)');
        }
        var files = Object.assign({}, this._project.files);
        files[file] = forked.text;
        files[entry] = r.text;
        this._project = Object.assign({}, this._project, { files: files });
        var pose = _cameraPose(runner);
        var wasRunning = !!runner._isLooping;
        await runner.restart();
        if (!wasRunning) { runner.stop(); }
        if (pose && runner.cameraControl && typeof runner.cameraControl.setOrbit === 'function') { runner.cameraControl.setOrbit(pose); }
        var rebuilt = null;
        this._parts.forEach(function (row2, o) { if (row2.key === name) { rebuilt = o; } });
        if (!rebuilt || runner.kindOf(rebuilt) !== NewKind) {
            throw new Error('[RecipeContext.fork] the re-run declared "' + name + '" as ' + (rebuilt ? runner.kindOf(rebuilt) : 'nothing') +
                ', not the fork ' + NewKind + '. (FAIL-LOUD.)');
        }
        if (this._record) { this._record._row({ name: name, op: 'fork', by: by, from: from, to: { kind: NewKind, file: file } }); }
        return { fork: NewKind, file: file, from: from, files: Object.assign({}, files) };
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
    RecipeContext.prototype.build = function (sketch) {
        var linked = null;
        if (sketch && typeof sketch === 'object' && typeof sketch.buildExperiment === 'function') {
            if (!sketch.project || typeof sketch.project !== 'object' || !sketch.project.files || typeof sketch.project.entry !== 'string') {
                throw new TypeError('[RecipeContext.build] build(linked): linked is linkProject\'s result (its contract: ' +
                    'lib/shim/project/link.js). (FAIL-LOUD.)');
            }
            linked = sketch;
            sketch = linked.buildExperiment;
        } else if (sketch !== undefined && sketch !== null && typeof sketch !== 'function') {
            throw new TypeError('[RecipeContext.build] build(sketch): sketch is the scene\'s buildExperiment(exp) function or ' +
                'linkProject\'s result (got ' + typeof sketch + '). (FAIL-LOUD.)');
        }
        if (typeof sketch === 'function') {
            // ONE Record per booted world: a build of text that is not the held text re-authors it, and closes the
            // open Record with the world before (a rebuild of the same text — restart, setDeclared's re-run — does not).
            if (this._record && !(linked && this._project && _sameFiles(linked.project.files, this._project.files))) {
                this._reauthored = this._record;
                this._record._closeOnReauthor(this._project);
            }
            this._buildFn = sketch;
            this._project = linked ? linked.project : null;
            this._urls = linked ? (linked.urls || null) : null;
            this._module = linked ? linked.module : null;
            if (this._runner) { _teardownSceneForRebuild(this); }
            this._world = null;
            this._parts = new Map();
            this._code = new Map();
            this._declaredOnce = false;
            sketch(this);
            if (!this._world) {
                throw new Error('[RecipeContext.build] the scene never created its world — its first statement ' +
                    'must be ' + COINIT + '. (FAIL-LOUD.)');
            }
            this._built = true;
            var self = this;
            this._runner.declared.forEach(function (obj) {
                if (!self._parts.has(obj)) { self._code.set(obj, _capture(self, obj)); }
            });
            this._runner.retainSceneReplay(this._project
                ? function () { return linkProject(self._project).then(function (l) { return self.build(l); }); }
                : function () { return self.build(self._buildFn); });
        }
        setPageExperiment(this);
        return this;
    };

    /** Two file maps hold the same paths with byte-equal text. */
    function _sameFiles(a, b) {
        var ka = Object.keys(a), kb = Object.keys(b);
        if (ka.length !== kb.length) { return false; }
        return ka.every(function (k) { return Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]; });
    }

    /**
     * exp.startRecord() → Promise<Record> — open a Record (lib/frqtl/objects/record/Record.js) on this facade's world.
     * REFUSES (rejects): a second open Record (one per facade, one per runner); a held project with no frqtl.json
     * (a Record snapshots a folder); a hand the sketch text does not hold yet (as setDeclared). While it is open,
     * toSketch({ by }) and setDeclared(name, patch, { by }) name who acted.
     */
    RecipeContext.prototype.startRecord = async function () {
        _requireWorld(this);
        _requireHeld(this, 'startRecord');
        if (this._record) {
            throw new Error('[RecipeContext.startRecord] a Record is already open on this facade (one per booted world) — ' +
                'await rec.stop() first. (FAIL-LOUD.)');
        }
        // A re-authoring closed the previous Record; if that close was REFUSED and nobody read it, its rows would be lost
        // without a word: refuse until the host reads `rec.closed` (the rejection carries err.record).
        var last = this._reauthored;
        if (last) {
            await last._settled;
            if (last._refused && !last._closedRead) {
                var err = new Error('[RecipeContext.startRecord] the previous Record of this facade was closed by a re-authoring and ' +
                    'REFUSED (' + last._refused.message + ') — nobody read rec.closed, so its ' + last._refused.record.changes.length +
                    ' row(s) would be lost: read rec.closed (its rejection carries err.record = { changes, clips }) first. (FAIL-LOUD.)');
                err.record = last._refused.record;
                throw err;
            }
            this._reauthored = null;
        }
        if (openRecordOf(this._runner)) {
            throw new Error('[RecipeContext.startRecord] another facade holds an open Record on this runner. (FAIL-LOUD.)');
        }
        if (!Object.prototype.hasOwnProperty.call(this._project.files, MANIFEST_FILE)) {
            throw new Error('[RecipeContext.startRecord] a Record snapshots a folder; boot it as one — the held project carries ' +
                'no ' + MANIFEST_FILE + ': add files[\'' + MANIFEST_FILE + '\'] = serializeManifest(manifestFor({ name, entry: SKETCH_ENTRY })) ' +
                '(all from ./project) to the files you boot. (FAIL-LOUD.)');
        }
        var unwritten = _unwrittenHands(this);
        if (unwritten.length) {
            throw new Error('[RecipeContext.startRecord] "' + unwritten.join('", "') + '" carries a hand the sketch text does ' +
                'not hold yet — write the hand first: await exp.toSketch(). (FAIL-LOUD.)');
        }
        var rec = new Record(this);
        this._record = rec;
        try { await rec._ready(this._project); }
        catch (e) { rec._detach(); throw e; }
        return rec;
    };

    RecipeContext.prototype.run = function (buildFn) {
        if (buildFn && typeof buildFn === 'function' && !this._built) { this.build(buildFn); }
        _requireWorld(this);
        setPageExperiment(this);
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

    /** Retired facade members → the message reading one throws (compat/engine.js refuseRetiredDoors). */
    var RETIRED_RECIPE_DOORS = Object.freeze({
        buildSource: '[RecipeContext] exp.buildSource(src) is retired — a sketch held as text is a project: boot it ' +
            'with bootProject(mount, { files: { "sketch.js": src }, entry: "sketch.js" }) (@descix/frqtl-web/boot), or ' +
            're-scene a booted facade with exp.build(await linkProject({ files, entry, mint })) ' +
            '(lib/shim/project/link.js). (FAIL-LOUD.)'
    });
    refuseRetiredDoors(RecipeContext.prototype, RETIRED_RECIPE_DOORS);

    // ── The page's experiment ─────────────────────────────────────────────────
    // The facade a page built its scene through (or, on the empty page, the sizeless facade it
    // constructed for hosts to apply scenes against). The page door (experiments/_shared/page-door.js)
    // reads it as FrqtlPage.experiment — this is its ONE store.
    var _pageExperiment = null;
    /** @param {RecipeContext} exp */
    function setPageExperiment(exp) {
        if (!(exp instanceof RecipeContext)) {
            throw new TypeError('[RecipeContext] setPageExperiment(exp): expected a RecipeContext. (FAIL-LOUD.)');
        }
        _pageExperiment = exp;
    }
    /** @returns {RecipeContext|null} */
    function pageExperiment() { return _pageExperiment; }

    export { RecipeContext, RETIRED_RECIPE_DOORS, setPageExperiment, pageExperiment };

