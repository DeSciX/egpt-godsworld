/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module Runtime
 * @description
 * Runtime — CONTRACT-RUNTIME (frozen Phase 0).
 *
 * Named ESM export. A missing import is a hard FAIL-LOUD error.
 * Replaces the ambient window.CommonRuntime global.
 *
 * THE UNIFIED RUNTIME OBJECT SURFACE.
 *
 * Exposes four parallel first-class objects to authored IDE code.
 * All four run on the MAIN THREAD (no Worker in v1).
 *
 * Four first-class runtime objects:
 *   - `frqtl`   — physics engine + game objects (the `caps.frqtl` sugar surface).
 *   - `math`    — EGPT Math SDK object surface (lazy-initialized via ensureMath).
 *   - `console` — output sink object (routes through Bus console:write events).
 *   - `render`  — graphics surface object (routes through Bus render:frame events).
 *
 * @example
 * // Typical initialization inside FraqtlIde (lib/features/ide):
 * import { Runtime, engineRouter } from 'lib/shim';
 * const router = engineRouter({ mode: 'dev-core', engine: 'wasm' });
 * await Runtime.init({
 *   engine: 'wasm',
 *   _routerMathSdkUrl:     router.mathSdkUrl,
 *   _routerMathWasmUrl:    router.mathWasmUrl,
 *   _routerMathWasmModuleUrl: router.mathWasmModuleUrl,
 *   _routerMathBackend:    router.mathBackend,
 *   _router:               router
 * });
 */

import { Bus } from '../bus.js';
import { MathBackendRegistry, MathBackendNotAvailableError } from '../../egpt/js/model/backend/MathBackendRegistry.js';
import { ensureEngineStack } from '../engine/engine-stack-boot.js';
import { validateAndMap as validateKnob } from '../notebook/knob.js';
import {
    hasImport as _cellHasImport,
    buildModuleClosure as buildNotebookModuleClosure,
    compileEntryModuleSource as compileNotebookEntryModuleSource
} from '../notebook/module-resolver.js';

'use strict';

/* ── Internal state ─────────────────────────────────────────────────── */
var _initialized = false;
// The realm's math sdk — set ONLY once its provider registered AND the requested
// backend was selected, so a cached sdk always runs the backend that was asked for.
var _mathSdk     = null;
// The ONE math-SDK load of the realm. Concurrent callers (init's eager load racing a
// view's ensureMath) share it, so a realm builds exactly one sdk — and registers
// exactly one provider object per id (MathBackendRegistry.register throws on a
// second). A load that was ATTEMPTED and failed stays here, rejected: every later
// caller gets the same loud error (a reload clears it). Retrying a deterministic
// failure would build a second provider object and trip the identity guard with a
// misleading "two bundles" message.
var _mathSdkLoad = null;
var _mathSdkUrl  = '';
var _mathWasmUrl = '';
var _mathWasmModuleUrl = '';
var _engine      = 'js';
var _mathBackend = null;  // M4: router-resolved backend id (the router profile owns the default)
// E2a: the engineRouter INSTANCE threaded in by Runtime.init (FraqtlIde passes
// `router`). frqtl.ensureEngine passes it straight to ensureEngineStack(router), which
// `.resolve`s the boot module and the realm's module instances (REALM_MODULES) — the runtime
// itself never imports a router or lib/frqtl/objects, it only carries the instance FraqtlIde built.
var _router = null;
// The realm's module instances, set when ensureEngine resolves (engine-stack-boot.js REALM_MODULES).
var _realm = null;

// Single-executor guard (P1).
// Runtime.init() may be called multiple times (StrictMode double-mount,
// remounts, preset switches).  The Bus 'run:request' executor
// must be registered EXACTLY ONCE — extra registrations multiply execution count.
// _runRequestHandler stores the one handler reference so Bus.off() can remove a
// stale listener and Bus.on() re-registers only the current one (idempotent).
var _runRequestHandler = null;

/* ── console runtime object ─────────────────────────────────────────── */
var _consoleObj = {
    log:   function (level, text) {
        Bus.emit('console:write', { level: level || 'info', text: String(text) });
    },
    print: function (text) {
        Bus.emit('console:write', { level: 'info', text: String(text) });
    },
    warn: function (text) {
        Bus.emit('console:write', { level: 'warn', text: String(text) });
    },
    error: function (text) {
        Bus.emit('console:write', { level: 'error', text: String(text) });
    },
    clear: function () {
        Bus.emit('console:clear', {});
    }
};

/* ── render runtime object ──────────────────────────────────────────── */
var _renderObj = {
    frame: function (universeOrTickData) {
        Bus.emit('render:frame', {
            universe: universeOrTickData,
            tickData: universeOrTickData
        });
    },
    start: function () {
        Bus.emit('render:frame', { cmd: 'start' });
    },
    stop: function () {
        Bus.emit('render:frame', { cmd: 'stop' });
    }
};

/* ── frqtl runtime object ───────────────────────────────────────────────────
 *
 * The `frqtl` capability a builder cell sees (caps.frqtl). It exposes:
 *   - FrqtlApp / Universe — the engine entry points;
 *   - ensureEngine() — boot the engine + game layer so the SUGAR getters and
 *     FrqtlApp are live (the builder runs BEFORE the canvas cell that
 *     would otherwise boot the engine);
 *   - knob() — the single driving-knob authority;
 *   - SUGAR GETTERS (PointSource, LargeObject, CollisionTypes, …) — the library
 *     sugar objects, reached HERE so a user-code setup MODULE never imports
 *     `lib/frqtl/objects` (cross-arrow veto) and never reads window.* itself
 *     (B1; build-gate B). The module takes
 *     this object as a passed `frqtl` param and destructures the sugar from it.
 *
 * EVERY member that reads a game-layer global goes through `_sugar(name)` — the ONE
 * reader — so reading one before ensureEngine() has booted the stack FAILS LOUD,
 * naming the global and the gate, rather than yielding undefined or null. A soft
 * return is exactly what turns a boot-ordering defect into an opaque
 * property-access TypeError one frame later ("Cannot read properties of null
 * (reading 'build')"); the throw names what was unavailable instead.
 * That covers the constructor members (`FrqtlApp`, `RecipeContext`) and every getter generated from
 * the member table (CAPS_FRQTL_MEMBERS): there is no soft residual.
 *
 * The boot gate is `ensureEngine()` — the MANDATORY FAIL-LOUD entry point (it
 * rejects if Runtime.init did not thread a router resolve). Every gallery builder
 * cell `await`s it before touching ANY caps.frqtl member, so on the gallery paths
 * nothing is read pre-boot.
 */
// THE caps.frqtl member table, keyed by the EXPOSED name: what each member reads — [REALM_MODULES key,
// export name], or an ENGINE value read through the realm's engine accessor (compat/engine.js engine())
// at the call. Every row is exposed: the two constructor members (FrqtlApp, RecipeContext) are functions
// over their rows below; every other row is a getter generated from this table (no hand list).
var _SUGAR = Object.freeze({
    FrqtlApp: ['app', 'FrqtlApp'], RecipeContext: ['recipe', 'RecipeContext'],
    PointSource: ['parts', 'PointSource'], LargeObject: ['parts', 'LargeObject'], Wall: ['parts', 'Wall'],
    SlitScreen: ['parts', 'SlitScreen'], SlitLightSource: ['parts', 'SlitLightSource'],
    DetectorWall: ['parts', 'DetectorWall'], OvenBox: ['parts', 'OvenBox'], Rectangle: ['parts', 'Rectangle'],
    CollisionTypes: ['parts', 'CollisionTypes'], CollisionActions: ['parts', 'CollisionActions'],
    QuantumEmitter: ['QuantumEmitter', 'QuantumEmitter'], Box: ['Box', 'Box'],
    CircuitGate: ['CircuitGate', 'CircuitGate'], CircuitProbe: ['CircuitProbe', 'CircuitProbe'],
    Frame: ['engine', 'Frame'], Charge: ['engine', 'Charge'], Universe: ['engine', 'EGPTUniverse']
});
/** The caps.frqtl member table (exposed name → [REALM_MODULES key | 'engine', export name]) — exported so a
 *  conformance test drives off it (lib/shim/runtime/test/caps-frqtl-failloud.test.mjs). */
export var CAPS_FRQTL_MEMBERS = _SUGAR;
// The ONE reader behind caps.frqtl — the generated getters AND the constructor members (FrqtlApp,
// RecipeContext). Names the missing member and the gate; never returns undefined/null for a
// caller to trip over later.
function _sugar(name) {
    var row = _SUGAR[name];
    if (!row) { throw new Error('[frqtl] caps.frqtl has no member "' + name + '". (FAIL-LOUD.)'); }
    if (!_realm) {
        throw new Error(
            '[frqtl] "' + name + '" is not available — the engine/game layer is not booted yet. A builder ' +
            'cell must `await frqtl.ensureEngine()` before it reads caps.frqtl (or before it calls a setup ' +
            'module that does). (FAIL-LOUD.)'
        );
    }
    var v = row[0] === 'engine' ? _realm.engine.engine()[row[1]] : _realm[row[0]][row[1]];
    if (v === undefined || v === null) {
        throw new Error('[frqtl] the realm module for "' + name + '" exports no ' + row[1] + '. (FAIL-LOUD.)');
    }
    return v;
}

var _frqtlObj = {
    FrqtlApp: function (opts) {
        return new (_sugar('FrqtlApp'))(opts);
    },
    // FrqtlApp.carryFactoryStatics — the setup-builder FACTORY template wraps the module
    // export in an arrow and carries its factory statics (FrqtlApp.FACTORY_STATICS) onto it,
    // so runner.setup() sees what the bare factory declares. Owner: FrqtlApp.
    carryFactoryStatics: function (wrapper, factory) {
        return _sugar('FrqtlApp').carryFactoryStatics(wrapper, factory);
    },
    // The frozen recipe-facade (lib/frqtl/objects/RecipeContext.js) a saved
    // project's `buildExperiment(exp)` recipe is evaluated against — exposed here so
    // a notebook RECIPE-shape canvas cell (setup-builder.js `shape:'recipe'`) can
    // build the SAME co-init + `addObject()` recipe the STUDIO blank page + the
    // walkthrough rungs run, instead of the `(frqtl,universe,options)` setup-factory
    // form. Read from the realm ensureEngine() booted; FAIL-LOUD through _sugar exactly like
    // FrqtlApp above.
    RecipeContext: function (opts) {
        return new (_sugar('RecipeContext'))(opts);
    },
    // Boot the engine + game layer (so FrqtlApp + the sugar getters are
    // live) WITHOUT importing GraphicsPane (upward-arrow veto) or lib/frqtl/objects
    // (cross-arrow veto). Same canonical boot module GraphicsPane boots through,
    // via the router threaded by Runtime.init. The builder cell awaits this before
    // constructing the runner / calling its setup module. FAIL-LOUD if init never
    // threaded a router. Idempotent + cached (ensureEngineStack).
    ensureEngine: function () {
        if (!_router) {
            return Promise.reject(new Error(
                '[frqtl] ensureEngine unavailable: Runtime.init did not thread a router (_router). (FAIL-LOUD.)'
            ));
        }
        return ensureEngineStack(_router).then(function (realm) { _realm = realm; });
    },
    // E2c: validate + map a driving-knob assignment against the SINGLE knob
    // authority (lib/shim/notebook/knob.js), returning the setup-factory option
    // object to thread into runner.setup(setupFn, opts). The builder cell calls it
    // so the knob stays VISIBLE/EDITABLE while still FAIL-LOUD on an unknown key /
    // out-of-range value (delegates — no second validator). `spec` is the factory
    // name (or comma-spec); `optsMap` is {param: value} ({} → {}). Synchronous —
    // the builder cell composes it inline with frqtl.FrqtlApp.setup.
    knob: function (spec, optsMap) {
        return validateKnob(spec, optsMap || {});
    }
};
// ── SUGAR GETTERS (B1) — the library sugar objects via caps.frqtl, one per table row ──────────────
// A user-code setup module receives this object and destructures what it needs. It NEVER imports
// lib/frqtl/objects and NEVER reads window.* directly.
Object.keys(_SUGAR).forEach(function (name) {
    if (Object.prototype.hasOwnProperty.call(_frqtlObj, name)) { return; }   // a constructor member, above
    Object.defineProperty(_frqtlObj, name, { enumerable: true, get: function () { return _sugar(name); } });
});

/* ── init ───────────────────────────────────────────────────────────── */

/**
 * Initialize the Runtime. Should be called once per mount (idempotent for the
 * engine-ready listener; duplicates are removed via the P1 dedup guard).
 *
 * @param {object} [opts]
 * @param {string} [opts.engine='js']
 *   Physics engine to use ('wasm'; 'js' is archived). Stored internally and forwarded to
 *   the engine boot (frqtl.ensureEngine).
 * @param {string} [opts.mathSdkUrl]
 *   Explicit URL for the egpt-math-sdk bundle. Wins over all other sources.
 * @param {string} [opts.mathWasmUrl]
 *   URL for the WASM math bridge binary (`.wasm` file). Used by wasm-math provider.
 * @param {string} [opts.mathWasmModuleUrl]
 *   URL for the WASM math bridge glue module (`.js` file). Drives provider registration.
 * @param {string} [opts._routerMathSdkUrl]
 *   Router-resolved math SDK URL (threaded by FraqtlIde; caller wins over this).
 * @param {string} [opts._routerMathWasmUrl]
 *   Router-resolved WASM binary URL.
 * @param {string} [opts._routerMathWasmModuleUrl]
 *   Router-resolved WASM glue module URL.
 * @param {string} [opts._routerMathBackend]
 *   Router-resolved backend id ('js-reference' | 'wasm-math'). Normalized
 *   'wasm' → 'wasm-math' internally.
 * @param {import('../engine/router.js').EngineRouter} [opts._router]
 *   The engineRouter() INSTANCE itself, threaded so `frqtl.ensureEngine` boots the
 *   stack and reads the realm's module instances via the single path authority (`.resolve`)
 *   without importing the router directly.
 * @returns {Promise<void>} Resolves when the runtime is wired (and the eagerly requested math
 *   backend selected). Rejects (FAIL-LOUD) on a math selection failure.
 *
 * @example
 * // Standard initialization (FraqtlIde wires this):
 * await Runtime.init({
 *   engine: 'wasm',
 *   _routerMathSdkUrl:        router.mathSdkUrl,
 *   _routerMathWasmUrl:       router.mathWasmUrl,
 *   _routerMathWasmModuleUrl: router.mathWasmModuleUrl,
 *   _routerMathBackend:       router.mathBackend,
 *   _router:                  router
 * });
 */
function init(opts) {
    opts = opts || {};
    // Math SDK URL resolution (V2):
    //   1. Caller-supplied explicit opt always wins.
    //   2. window._egptMathSdkUrl (runtime injection used by dist shell).
    //   3. Router profile __mathSdkUrl entry (the one path authority).
    // The hardcoded default literal is gone — profile is the sole fallback.
    _mathSdkUrl        = opts.mathSdkUrl        || (typeof window !== 'undefined' && window._egptMathSdkUrl) || (opts._routerMathSdkUrl || '');
    _mathWasmUrl       = opts.mathWasmUrl        || (opts._routerMathWasmUrl || '');
    _mathWasmModuleUrl = opts.mathWasmModuleUrl  || (opts._routerMathWasmModuleUrl || '');
    _engine            = opts.engine             || 'js';
    // M4: router passes the requested backend id; normalise 'wasm'→'wasm-math'.
    // No default here — the router profile (`__mathBackend`) is the one default
    // authority. With no id at all, the registry's first registrant stays active.
    var _requestedBackend = opts.mathBackend || opts._routerMathBackend || null;
    if (_requestedBackend === 'wasm') { _requestedBackend = 'wasm-math'; }
    _mathBackend = _requestedBackend;
    // E2a: thread the engineRouter INSTANCE so frqtl.ensureEngine boots the engine
    // stack via the one path authority — FraqtlIde passes the whole `router` object it built.
    if (opts._router && typeof opts._router.resolve === 'function') { _router = opts._router; }

    // M4 fix: a view's ensureMath() may have ALREADY created the SDK before init
    // ran (child effects fire before parent effects — the ?preset=codec deep-link
    // race). The cached-sdk early return in _ensureMathSdk means selection would
    // otherwise never be applied for this init's backend. Apply it now; a failure
    // rejects init's promise (FAIL-LOUD), never a silent js-reference fallback.
    var _lateSelectionError = null;
    var _eagerMath = null;
    if (_mathSdk) {
        try { _applyBackendSelection(_mathSdk); } catch (e) { _failMathRealm(e); _lateSelectionError = e; }
    } else if (_mathBackend && _mathBackend !== 'js-reference') {
        // M4 fix: eager-load the math SDK so the requested backend registers AND
        // selects at startup (badges/bench chips derive from MathBackendRegistry, so
        // they read correctly without a first Run). js-reference is excluded ONLY so
        // a dev STUDIO session does not pull the JS reference core at boot; a
        // js-reference request that this realm cannot serve still fails loud, at
        // the first math use.
        // FAIL-LOUD: init's promise settles only after this load, and REJECTS with
        // its error (_applyBackendSelection's precise diagnosis, incl. the
        // `npm run build:wasm-bridge` hint, also lands in the console pane) —
        // never a console line alone, never a silent js-reference fallback.
        _eagerMath = _ensureMathSdk();
    }

    // P1: dedup the run:request executor.
    // If a previous handler is registered (e.g. StrictMode double-mount or a
    // remount), remove it first so there is
    // always EXACTLY ONE executor on this event — never two.
    if (_runRequestHandler) { Bus.off('run:request', _runRequestHandler); }
    _runRequestHandler = function (payload) {
        run({ source: payload.source, code: payload.code, fileId: payload.fileId, sourceUrl: payload.sourceUrl || null });
    };
    Bus.on('run:request', _runRequestHandler);

    // The physics engine is NOT booted here: it boots on demand, through the ONE boot module, when
    // a surface needs it (GraphicsPane.boot(), frqtl.ensureEngine → ensureEngineStack). init settles
    // once the math realm (when eagerly requested) is ready.
    var _engineReady = _lateSelectionError ? Promise.reject(_lateSelectionError) : Promise.resolve();
    _initialized = true;
    if (!_eagerMath) { return _engineReady; }
    return Promise.all([_engineReady, _eagerMath.catch(function (e) {
        console.error('[Runtime] eager math SDK load for backend "' + _mathBackend + '" failed:', e);
        throw e;
    })]).then(function () {});
}

/* ── run ────────────────────────────────────────────────────────────── */

/**
 * Fire-and-forget cell execution (the legacy code-editor run path). Emits
 * `run:result` on the Bus when complete. NOT the notebook execution path — use
 * `runCell` for value-returning, binding-aware execution.
 *
 * @param {object} [opts]
 * @param {'frqtl'|'math'} [opts.source='frqtl'] — selects the execution lane.
 * @param {string} [opts.code=''] — the cell body to evaluate.
 * @param {string} [opts.fileId='_editor'] — display label in the console header.
 * @param {string} [opts.sourceUrl] — absolute URL of the source file (math module path resolution).
 * @returns {void}
 */
function run(opts) {
    opts = opts || {};
    var source    = opts.source    || 'frqtl';
    var code      = opts.code      || '';
    var fileId    = opts.fileId    || '_editor';
    var sourceUrl = opts.sourceUrl || null;   // absolute URL of the source file (optional)

    _consoleObj.clear();
    _consoleObj.log('info', '--- run:' + source + ' (' + fileId + ') ---');

    if (source === 'math') {
        _runMath(code, fileId, sourceUrl);
    } else {
        _logBackendHeader();
        _runFrqtl(code, fileId);
    }
}

// P2: one derived backend header per run. Shows WHICH math
// backend executes — derived from MathBackendRegistry, never hardcoded — emitted
// ONCE per run:request execution so duplicate-execution bugs are immediately
// visible (N headers = N executions). The math lane emits it after ensureMath
// settles, so it names the backend the run actually uses, not the pre-load state.
function _logBackendHeader() {
    var label;
    try { label = MathBackendRegistry.active().id; } catch (_) { label = 'none'; }
    _consoleObj.log('info', 'backend: ' + label);
}

function _runFrqtl(code, fileId) {
    try {
        var fn = new Function('frqtl', 'math', 'console', 'render', code); // eslint-disable-line no-new-func
        fn(_frqtlObj, _mathSdk, _consoleObj, _renderObj);
        Bus.emit('run:result', { source: 'frqtl', ok: true });
    } catch (e) {
        var msg = (e && e.message ? e.message : String(e));
        _consoleObj.error(msg);
        Bus.emit('run:result', { source: 'frqtl', ok: false, error: msg });
    }
}

function _runMath(code, fileId, sourceUrl) {
    _ensureMathSdk().then(function (sdk) {
        _logBackendHeader();
        // The math example suites are authored as ES modules with the contract
        // `export async function run(sdk)` — the SAME contract the sdk editor's
        // test-runner-worker executes. new Function cannot parse module syntax
        // ("Unexpected token 'export'"), so module sources take the dynamic-import
        // path; plain scripts keep the legacy function path.
        if (_isModuleSource(code)) {
            return _runMathModule(code, sdk, sourceUrl).then(function () {
                Bus.emit('run:result', { source: 'math', ok: true });
            }).catch(function (e) {
                var msg = (e && e.message ? e.message : String(e));
                _consoleObj.error(msg);
                Bus.emit('run:result', { source: 'math', ok: false, error: msg });
            });
        }
        try {
            var fn = new Function('frqtl', 'math', 'console', 'render', code); // eslint-disable-line no-new-func
            fn(_frqtlObj, sdk, _consoleObj, _renderObj);
            Bus.emit('run:result', { source: 'math', ok: true });
        } catch (e) {
            var msg = (e && e.message ? e.message : String(e));
            _consoleObj.error(msg);
            Bus.emit('run:result', { source: 'math', ok: false, error: msg });
        }
    }, function (e) {
        _logBackendHeader();
        var msg = 'Math SDK init failed: ' + (e && e.message ? e.message : String(e));
        _consoleObj.error(msg);
        Bus.emit('run:result', { source: 'math', ok: false, error: msg });
    }).finally(function () {
        // THIS lane's run unit is the whole buffer: nothing the user can name
        // outlives it, so the buffer IS the math scope and it ends here.
        resetMathScope();
    });
}

/**
 * End the active math backend's value scope and begin a fresh one.
 *
 * For `wasm-math` this drains the WASM arena and increments its epoch, so EVERY
 * handle minted before the call is dead — a later use throws
 * `arena:stale-handle`. For `js-reference` it is a no-op.
 *
 * THE SCOPE RULE: a math scope is one RUN, and the caller
 * that knows what a run is owns the boundary. Two run units exist, each stated
 * once: the `run()` lane's unit is one code buffer (it calls this in its own
 * `finally`); a notebook's unit is one notebook run, so `NotebookKernel` calls
 * this where its binding store's lifetime begins and ends. A CELL is NOT a run —
 * a cell's declared outputs are committed into the kernel's binding store and
 * must outlive the cell, which is why `runCell()` deliberately does not call it.
 *
 * Runtime is the SOLE owner of the `MathBackendRegistry.resetScope()` call above
 * the shim (providers must never subscribe to Bus to reset themselves —
 * inverted-arrow VETO); this method is the contract consumers call instead.
 *
 * @returns {void}
 *
 * @example
 * // A host that owns its own run unit brackets it:
 * Runtime.resetMathScope();          // fresh scope — prior values are now dead
 * await Runtime.runCell({ ... });    // values minted here survive
 * await Runtime.runCell({ ... });    // ...and are usable here
 */
function resetMathScope() {
    MathBackendRegistry.resetScope();
}

/* ── ES-module math execution (mirrors sdk editor test-runner-worker.js) ──
 *
 * The catalog suites import from '../../index.js' (and friends) relative to
 * <sdk>/editor/examples/. A blob: module has no hierarchical base URL, so all
 * specifiers are rewritten to ABSOLUTE URLs first — core/barrel imports map to
 * the one sdk bundle (_mathSdkUrl, the engineRouter-resolved authority), node
 * shims map to the sdk's editor/shims/, everything else resolves against the
 * sdk's editor/ base.
 *
 * When sourceUrl is provided (e.g. for catalog entries fetched from theorems/),
 * same-directory relative imports (./foo.js) resolve against the ENTRY's
 * directory, not editorBase. This fixes TraceReport.js imports from theorems/.
 *
 * FAIL-LOUD: unresolvable specifiers throw at import time.
 */

function _isModuleSource(code) {
    return /^\s*(import|export)\s/m.test(code);
}

function _rewriteModuleSpecifiers(source, sdkUrl, editorBase, entryBase) {
    return source.replace(/from\s+(['"])([^'"]+)\1/g, function (match, quote, specifier) {
        if (/^(https?:|blob:|data:)/.test(specifier)) { return match; }
        if (specifier === 'node:test')   { return "from '" + new URL('./shims/node-test.js', editorBase).toString() + "'"; }
        if (specifier === 'node:assert') { return "from '" + new URL('./shims/node-assert.js', editorBase).toString() + "'"; }
        if (specifier === './EGPTTestSuite.js') { return "from '" + new URL('./shims/test-framework.js', editorBase).toString() + "'"; }
        if (specifier.indexOf('/core/') !== -1 ||
            specifier.indexOf('/stat/') !== -1 ||
            specifier.indexOf('/spaces/log/') !== -1 ||
            specifier.indexOf('/translators/') !== -1 ||
            /\/index\.js$/.test(specifier)) {
            return "from '" + sdkUrl + "'";
        }
        // Same-directory relative import (./foo.js): resolve against the entry's
        // actual directory when available — NOT editorBase, which only works for
        // entries inside editor/examples/ (not theorems/ or other siblings).
        if (specifier.indexOf('./') === 0 && entryBase) {
            return "from '" + new URL(specifier, entryBase).toString() + "'";
        }
        return "from '" + new URL(specifier, editorBase).toString() + "'";
    });
}

function _runMathModule(code, sdk, sourceUrl) {
    var sdkUrl     = new URL(_mathSdkUrl, window.location.href).toString();
    var editorBase = new URL(_mathSdkUrl.replace(/\/index\.js$/, '/editor/'), window.location.href).toString();
    // Derive the entry's directory base for resolving same-dir imports (./foo.js).
    // This lets theorems/ entries import siblings like ./TraceReport.js correctly
    // instead of resolving against editorBase (which only covers editor/examples/).
    var entryBase  = sourceUrl ? new URL('./', new URL(sourceUrl, window.location.href)).toString() : null;
    var src  = _rewriteModuleSpecifiers(code, sdkUrl, editorBase, entryBase);
    var blob = new Blob([src], { type: 'application/javascript' });
    var url  = URL.createObjectURL(blob);

    // Tee console.log into the IDE console pane for the duration of the run —
    // the suites log through console.log, exactly as the sdk worker captures it.
    // Reentrancy guard: a console:write Bus handler (e.g. ConsolePane) may itself
    // call console.log; without the guard that recurses tee→Bus→tee to overflow.
    var origLog = console.log;
    var _inTee  = false;
    console.log = function () {
        if (_inTee) { origLog.apply(console, arguments); return; }
        _inTee = true;
        try {
            var parts = Array.prototype.map.call(arguments, function (a) {
                try { return (typeof a === 'object') ? JSON.stringify(a) : String(a); }
                catch (e) { return String(a); }
            });
            _consoleObj.print(parts.join(' '));
        } finally {
            _inTee = false;
        }
        origLog.apply(console, arguments);
    };

    return import(/* @vite-ignore */ url).then(function (mod) {
        if (typeof mod.run !== 'function') {
            // Legacy suite: executed at import time (same convention the worker's
            // injectLegacyRunExport covers). Import already ran its top level.
            _consoleObj.print('(module executed on import — no run(sdk) export)');
            return undefined;
        }
        return mod.run(sdk);
    }).then(function (result) {
        if (result !== undefined) {
            _consoleObj.print(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
        }
    }).finally(function () {
        console.log = origLog;
        URL.revokeObjectURL(url);
    });
}

/* ── runCell — value-returning cell execution (notebook kernel) ──────────
 *
 * THE NOTEBOOK CONTRACT (UNIFIED_NOTEBOOK_DESIGN §3.2; O1 gate veto #1).
 *
 *   Runtime.runCell({ lane, code, id, inputs, declaredOutputs })
 *     → Promise<{ outputs, ok, error }>
 *
 * This is a DIRECT ASYNC CALL — NOT routed through run()/_runRequestHandler,
 * and it adds ZERO Bus listeners. It emits NO `cell:run`/`cell:result` events.
 * That is THE constraint (binding veto #1) that keeps it clear of the
 * The stacked-handler bug: the single `run:request` executor
 * registered in init() is the only Bus execution path; runCell sits beside it
 * as a plain callable the kernel invokes per cell.
 *
 * It REUSES the same machinery as the fire-and-forget lane (no duplication):
 *   - _ensureMathSdk()                          (resolved SDK + backend select)
 *   - the stashed-console tee (the 7cc5520 lesson — observers never re-emit)
 *
 * It does NOT end the math scope: a cell is not a run. Its
 * declared outputs are committed into the caller's binding store and must stay
 * usable in later cells, so the scope boundary belongs to whoever owns that
 * store — see `resetMathScope()`.
 *
 * Unlike the fire-and-forget lane, a cell body is wrapped as
 *   `async (caps, inputs) => { <body> }`
 * so it can `await` and `return { … }` its declared outputs. The cell author
 * writes plain statements + a `return { name: value, … }`; resolved `inputs`
 * are injected as a named object and as `caps`.
 *
 * CELL-AS-MODULE (B2): when the cell body has a top-level
 * `import`, it is instead compiled as a blob ES module whose relative `./x.js`
 * specifiers resolve to the notebook's OWN user-code module cells via the IN-MEMORY
 * blob closure (`spec.modules` = { name → source }, threaded by the kernel). The
 * entry module exports `default async (caps, inputs) => {…}` so caps/inputs STAY
 * INJECTED (they are NOT imports). The resolver NEVER fetches a relative sibling
 * from a scoped HTTP mount (VETO-CLASS #1). Bare specifiers → host loader.
 *
 * Output contract (design §3.4 / §5.2, veto #4): the returned object's keys
 * MUST be a SUPERSET of `declaredOutputs`. A declared output the cell did not
 * return → FAIL-LOUD throw naming the cell + the missing key. We NEVER write
 * `undefined` into a binding silently.
 *
 * lane === 'math'  → caps = { math, console, display, inputs }
 * lane === 'frqtl' → caps = { frqtl, render, math, console, display, inputs }
 */

function _validateOutputs(id, returned, declaredOutputs) {
    var outputs = {};
    if (!declaredOutputs || !declaredOutputs.length) { return outputs; }
    var bag = (returned && typeof returned === 'object') ? returned : {};
    for (var i = 0; i < declaredOutputs.length; i++) {
        var key = declaredOutputs[i];
        if (!Object.prototype.hasOwnProperty.call(bag, key)) {
            // FAIL-LOUD: a declared output was never returned. Naming cell+key.
            throw new Error(
                '[Runtime.runCell] cell "' + id + '" declares output "' + key +
                '" but its returned object does not contain that key. ' +
                'A js cell must `return { ' + key + ': …, … }` for every declared out — ' +
                'never silently write undefined into a binding (FAIL-LOUD).'
            );
        }
        outputs[key] = bag[key];
    }
    return outputs;
}

// Build the math/console/display + (frqtl) caps object for a cell execution.
// `display` is a structured-output sink that prints through the stashed console
// tee — the notebook pane reads console:write to populate the cell's output
// region. (Lightweight in A1; A2's pane may enrich the display target.)
function _cellCaps(lane, sdk, displayFn) {
    var display = displayFn || function (value) {
        try {
            _consoleObj.print(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
        } catch (e) { _consoleObj.print(String(value)); }
    };
    if (lane === 'frqtl') {
        return { frqtl: _frqtlObj, render: _renderObj, math: sdk, console: _consoleObj, display: display };
    }
    return { math: sdk, console: _consoleObj, display: display };
}

// Tee console.log/warn/error into the IDE console pane for the duration of a cell
// run. A notebook js cell's console.log/warn/error must all reach the cell's rich
// ConsolePane, each at its OWN level — log→info, warn→warn,
// error→error — so the ConsolePane's level filters/badges are meaningful.
//
// Reentrancy guard (SHARED across all three teed methods) mirrors _runMathModule:
// a console:write Bus handler (e.g. ConsolePane.log) may itself call a native
// console method via its module-stashed mirror; without the guard that recurses
// tee→Bus→handler→tee. The stash in console-output/code-editor binds the GENUINE
// natives at module load (before any tee), so their mirror never re-enters this
// tee — but a guard is still the belt-and-suspenders that makes a re-entry a
// straight passthrough. Returns a restore function the caller MUST call in finally.
function _installConsoleTee() {
    var orig    = { log: console.log, warn: console.warn, error: console.error };
    var _inTee  = false;
    function _fmt(args) {
        return Array.prototype.map.call(args, function (a) {
            try { return (typeof a === 'object') ? JSON.stringify(a) : String(a); }
            catch (e) { return String(a); }
        }).join(' ');
    }
    function _tee(nativeName, sink) {
        return function () {
            if (_inTee) { orig[nativeName].apply(console, arguments); return; }
            _inTee = true;
            try { sink(_fmt(arguments)); } finally { _inTee = false; }
            orig[nativeName].apply(console, arguments);
        };
    }
    console.log   = _tee('log',   function (t) { _consoleObj.print(t); });
    console.warn  = _tee('warn',  function (t) { _consoleObj.warn(t); });
    console.error = _tee('error', function (t) { _consoleObj.error(t); });
    return function restore() {
        console.log = orig.log; console.warn = orig.warn; console.error = orig.error;
    };
}

/* ── cell-as-module: the notebook-local in-memory blob resolver (B2) ──────────
 *
 * THE LOAD-BEARING CHANGE (build-gate C +
 * VETO-CLASS constraint #1). When a cell body contains an `import`, it cannot run
 * through `new Function` (module syntax is illegal there). It is compiled as a
 * blob ES module instead. The PURE closure logic (path math, specifier rewrite,
 * topological in-memory closure) lives host-neutral in
 * `lib/shim/notebook/module-resolver.js` (no DOM/Runtime/engine deps — node-test-
 * able, and it must NOT assume a pane exists). This function is only the BROWSER
 * GLUE: it injects the blob-URL minter + dynamic-import. The resolver NEVER fetches
 * a relative sibling from a scoped HTTP mount (VETO-CLASS #1 — the Phase-A 404 trap).
 *
 * `_runCellAsModule(code, id, modules, caps, inputs)` → Promise<returned>. The
 * entry module exports `default async (caps, inputs) => {…}` so caps/inputs stay
 * INJECTED (they are NOT imports); we invoke that default with the injected objects.
 */
function _mintBlobUrl(source) {
    var blob = new Blob([source], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
}

function _runCellAsModule(code, id, modules, caps, inputs) {
    var closure = buildNotebookModuleClosure(modules, _mintBlobUrl);
    // The entry (builder cell) lives at the NOTEBOOK ROOT — a single path segment,
    // so its directory is root and `./setups/x.js` resolves to `setups/x.js` (the
    // module-set key form). A multi-segment synthetic name would add a phantom dir.
    var entryName = '__cell__-' + id + '.js';
    var entrySrc  = compileNotebookEntryModuleSource(code, entryName, closure.blobUrlByKey);
    var entryUrl  = _mintBlobUrl(entrySrc);
    var allUrls   = closure.created.concat([entryUrl]);
    function _revokeAll() { for (var i = 0; i < allUrls.length; i++) { try { URL.revokeObjectURL(allUrls[i]); } catch (e) {} } }
    return import(/* @vite-ignore */ entryUrl).then(function (mod) {
        if (typeof mod.default !== 'function') {
            throw new Error(
                '[Runtime.runCell] cell-as-module: compiled entry for cell "' + id +
                '" has no default export wrapper (internal). (FAIL-LOUD.)'
            );
        }
        return mod.default(caps, inputs);
    }).finally(_revokeAll);
}

/**
 * @typedef {object} RunCellSpec
 * @property {'math'|'frqtl'} [lane='math']
 *   Execution lane. `math` caps = `{ math, console, display, inputs }`;
 *   `frqtl` caps = `{ frqtl, render, math, console, display, inputs }`.
 * @property {string} [code=''] — the cell body (plain statements + `return { … }`).
 * @property {string} [id='_cell'] — stable cell identity (used in FAIL-LOUD messages).
 * @property {Object<string,*>} [inputs={}] — resolved binding values keyed by name.
 * @property {string[]} [declaredOutputs=[]]
 *   Names the cell MUST return. A missing key → FAIL-LOUD throw.
 * @property {Object<string,string>} [modules={}]
 *   In-memory module set `{ name → source }` from `type="module"` cells. Used by
 *   the cell-as-module resolver when the cell body has a top-level `import`.
 * @property {Function} [display] — structured-output sink (pane-supplied DOM writer).
 * @property {boolean} [forceModulePath=false]
 *   Force the cell-as-module (blob) routing regardless of what the `hasImport`
 *   text-sniff would decide (C15).
 *   The synthesis authorities that KNOW their own template needs the module path
 *   (`setup-builder.js`'s synthesized builder, whose module reference is now a
 *   body-level DYNAMIC `import(...)` the line-start sniff cannot see) set this
 *   explicitly (`synth.usesModulePath`) rather than have the runtime re-derive
 *   the routing decision via regex on text it did not author. Widening the sniff
 *   itself (matching `import(` anywhere) was REJECTED — a coincidental `import(`
 *   substring inside an unrelated cell's string/comment would route it through
 *   the module-blob path, where `rewriteRelativeToSiblingBlobs` could spuriously
 *   FAIL-LOUD or, worse, silently rewrite text inside a string literal. Leave
 *   `false` for ordinary cells — `hasImport`'s existing sniff is unchanged and
 *   still correct for hand-authored module cells and the `view-builder.js`
 *   template (both use real static top-level imports).
 */

/**
 * @typedef {object} RunCellResult
 * @property {Object<string,*>} outputs — resolved declared outputs (may be `{}`).
 * @property {boolean} ok — `true` if the cell completed without error.
 * @property {string|null} error — error message string if `ok` is `false`.
 */

/**
 * Value-returning cell execution (the notebook kernel path).
 *
 * A DIRECT ASYNC CALL — adds ZERO Bus listeners, emits NO `cell:*` events.
 * Keeps `runCell` clear of the single-executor bug (`run:request` is the only Bus
 * execution path; this sits beside it as a plain callable the kernel invokes).
 *
 * The cell body is wrapped as `async (caps, inputs) => { <body> }` so it can
 * `await` and `return { … }` its declared outputs.
 *
 * Output contract: the returned object's keys MUST be a SUPERSET of `declaredOutputs`.
 * A declared output the cell did not return → FAIL-LOUD throw naming the cell + key.
 *
 * @param {RunCellSpec} [spec]
 * @returns {Promise<RunCellResult>}
 *
 * @example
 * // A math lane cell that produces a histogram:
 * const result = await Runtime.runCell({
 *   lane: 'math',
 *   code: 'const hist = math.EGPTStat.histogram([1,2,2,3]); return { hist };',
 *   id: 'c-stat-01',
 *   inputs: {},
 *   declaredOutputs: ['hist'],
 *   modules: {}
 * });
 * // result.ok === true; result.outputs.hist is the histogram object.
 */
function runCell(spec) {
    spec = spec || {};
    var lane            = spec.lane || 'math';
    var code            = spec.code || '';
    var id              = spec.id   || '_cell';
    var inputs          = spec.inputs || {};
    var declaredOutputs = spec.declaredOutputs || [];
    var displayFn       = spec.display || null;
    // B2: the notebook's in-memory user-code module set { name → source } the
    // kernel threads per run (fresh — never cached Runtime state). Drives the
    // cell-as-module closure when the cell body imports a notebook-local module.
    var modules         = spec.modules || {};
    // C15: an explicit signal from
    // a synthesis authority that ALREADY KNOWS its template needs the module-blob
    // path — bypasses the hasImport() text-sniff entirely for this call. See the
    // RunCellSpec.forceModulePath doc above for why the sniff itself is NOT widened.
    var forceModulePath = !!spec.forceModulePath;

    // Resolve the SDK first (math lane needs it; frqtl lane gets it too for
    // cross-lane parity — a frqtl cell may still call math). FAIL-LOUD if the
    // math SDK is unavailable and required: _ensureMathSdk rejects, surfaced as
    // { ok:false, error } below.
    return _ensureMathSdk().then(function (sdk) {
        var restoreTee = _installConsoleTee();
        return Promise.resolve().then(function () {
            var caps = _cellCaps(lane, sdk, displayFn);
            // CELL-AS-MODULE (B2): a body with a top-level `import` cannot run via
            // new Function (module syntax). Compile it as a blob ES module whose
            // relative imports resolve to the notebook's OWN module cells via the
            // IN-MEMORY blob closure (VETO-CLASS #1 — never an HTTP sibling fetch).
            // caps/inputs stay INJECTED: the entry module exports
            // `default async (caps, inputs) => {…}`, which _runCellAsModule invokes.
            // forceModulePath (C15) short-circuits this to true WITHOUT sniffing —
            // the authority declared it, never re-derived from text.
            if (forceModulePath || _cellHasImport(code)) {
                return _runCellAsModule(code, id, modules, caps, inputs);
            }
            // Fast path: no import → the existing new Function wrap (same trust
            // model as the run() lane — the cell body IS user code, a Monaco buffer).
            var bodySrc = 'return (async (caps, inputs) => {\n' + code + '\n})(caps, inputs);';
            var factory = new Function('caps', 'inputs', bodySrc); // eslint-disable-line no-new-func
            return factory(caps, inputs);
        }).then(function (returned) {
            var outputs = _validateOutputs(id, returned, declaredOutputs);
            return { outputs: outputs, ok: true, error: null };
        }).catch(function (e) {
            var msg = (e && e.message ? e.message : String(e));
            _consoleObj.error(msg);
            return { outputs: {}, ok: false, error: msg };
        }).finally(function () {
            restoreTee();
            // NO math-scope reset here. A cell is not a run: the values this cell
            // just returned are about to be committed into the caller's binding
            // store, and draining the arena would make every one of them a stale
            // handle before the next cell could read it. The
            // scope boundary is the binding store's — see resetMathScope().
        });
    }).catch(function (e) {
        // _ensureMathSdk rejection (math SDK unavailable). FAIL-LOUD as a
        // structured error result — the kernel surfaces it on the cell.
        var msg = 'Math SDK init failed: ' + (e && e.message ? e.message : String(e));
        _consoleObj.error(msg);
        return { outputs: {}, ok: false, error: msg };
    });
}

function _ensureMathSdk(opts) {
    opts = opts || {};
    if (_mathSdk) { return Promise.resolve(_mathSdk); }
    // A surface may pass its router-resolved mathSdkUrl explicitly. This closes a
    // first-render race: a ?preset=codec deep link mounts CodecView, whose effect
    // calls ensureMath BEFORE the parent FraqtlIde effect calls Runtime.init
    // (child effects fire before parent effects in React). The value is the SAME
    // single authority (FraqtlIde's engineRouter profile) threaded as a prop —
    // never a second hardcoded literal. init()'s value wins once set.
    if (!_mathSdkUrl && opts.mathSdkUrl) { _mathSdkUrl = opts.mathSdkUrl; }
    // M4 fix: thread the wasm bridge URLs + backend through the SAME early-call
    // seam. Without these, a deep-linked view's ensureMath would build the SDK
    // with no wasm URLs (wasm-math never registered) and cache it — ?mathBackend=wasm
    // would then fail even though the router profile is correct. Values come from
    // the same single authority (the view's engineRouter props); init()'s win once set.
    if (!_mathWasmUrl && opts.mathWasmUrl)             { _mathWasmUrl = opts.mathWasmUrl; }
    if (!_mathWasmModuleUrl && opts.mathWasmModuleUrl) { _mathWasmModuleUrl = opts.mathWasmModuleUrl; }
    if (!_mathSdk && opts.mathBackend) {
        var _b = opts.mathBackend;
        if (_b === 'wasm') { _b = 'wasm-math'; }
        _mathBackend = _b;
    }
    if (_mathSdkLoad) { return _mathSdkLoad; }
    if (!_mathSdkUrl && (typeof window === 'undefined' || !window.createEgptMathSdk)) {
        // V2/AM-C2-3 (R3 binding): FAIL-LOUD — a null SDK silently produces wrong results.
        // The URL must come from the engineRouter profile (mathSdkUrl in DEV_CORE_PROFILE /
        // DIST_PROFILE) — no hardcoded literal fallback exists.  Code running with
        // source:'math' against a null SDK is not a degraded experience — it is a broken run.
        // Reject so the error surfaces in the console/run:result.
        return Promise.reject(new Error(
            '[Runtime] Math SDK unavailable: no mathSdkUrl resolved from engineRouter profile ' +
            'or window._egptMathSdkUrl, and no window.createEgptMathSdk. ' +
            'Ensure Runtime.init() is called with a router that defines __mathSdkUrl.'
        ));
    }
    var built = (typeof window !== 'undefined' && window.createEgptMathSdk)
        ? window.createEgptMathSdk({
            wasmUrl:       _mathWasmUrl || undefined,
            wasmModuleUrl: _mathWasmModuleUrl || undefined
        })
        : import(_mathSdkUrl).then(function (mod) {
            var factory = mod.createEgptMathSdk;
            if (typeof factory !== 'function') { throw new Error('createEgptMathSdk not exported from ' + _mathSdkUrl); }
            return factory({
                wasmUrl:       _mathWasmUrl || undefined,
                wasmModuleUrl: _mathWasmModuleUrl || undefined
            });
        });
    _mathSdkLoad = built.then(function (sdk) {
        _registerSdkProvider(sdk);
        _applyBackendSelection(sdk);
        _mathSdk = sdk;
        return sdk;
    });
    return _mathSdkLoad;
}

/* A selection that failed AFTER the sdk was cached (a later init requesting a
 * backend this realm cannot select) poisons the realm the same way a failed load
 * does: drop the cached sdk and pin the rejection, so no later caller resolves on
 * the previously selected backend. */
function _failMathRealm(err) {
    _mathSdk = null;
    _mathSdkLoad = Promise.reject(err);
    _mathSdkLoad.catch(function () {});   // observed by every later caller, not unhandled here
}

/* ── provider registration (static/dist twin-registry fix) ──────────────────
 * Register the resolved SDK's OWN math-backend provider into the Runtime's
 * MathBackendRegistry BEFORE selecting it.
 *
 * WHY (root cause of the static/public wasm-math failure): the WASM-only PUBLISH
 * entry (sdk/egpt-math-sdk `dist-entry.js`, served at the site's
 * `./pub/<build>/egpt-math-sdk/index.js` in the static build) registers its wasm provider ONLY into its private facade
 * slot (`wasm-facade.js` `_setActiveWasmProvider`). To keep the JS math core OUT
 * of the published bundle (the WASM-only publish rule) it deliberately
 * NEVER imports `lib/egpt/js/model/backend/*`, so it CANNOT register into the registry
 * this Runtime uses — and in a built app its bundled registry copy would be a
 * DIFFERENT module instance across the dynamic-import boundary anyway. Result:
 * `_applyBackendSelection` → `MathBackendRegistry.select('wasm-math')` threw
 * "'wasm-math' is not registered", rejecting the eager load so the notebook pane
 * never mounted. (The DEV source entry `sdk-entry.js` registers into the SAME
 * shared source-instance itself, which is why dev never hit this — the dist IDE
 * shell was dead until the static site exercised this path.)
 *
 * FIX: the sdk EXPOSES its provider (`sdk.mathBackendProvider`, a plain
 * contract-conformant object); the Runtime — the SOLE owner of
 * MathBackendRegistry above the shim — registers it here (owner-exposes-contract,
 * consumer-registers). This makes select() succeed, the badge/header derive
 * 'wasm-math' truthfully from the registry (truth-in-labeling, not a hardcoded
 * label), and `resetScope()` reach the wasm arena.
 *
 * The DEV entry (`sdk-entry.js`) exposes its js-reference provider the same way.
 * It shares this registry instance (the dev server), so the SAME object already
 * self-registered through the reference barrel, and `register()` is a no-op for it.
 *
 * `register()` owns provider identity: the same object again is a no-op, a
 * DIFFERENT object under a taken id throws (two provider bundles in one realm), and
 * a malformed provider throws. Each surfaces as the ensureMath rejection.
 */
function _registerSdkProvider(sdk) {
    var provider = sdk && sdk.mathBackendProvider;
    if (!provider || typeof provider !== 'object' || typeof provider.id !== 'string') { return; }
    MathBackendRegistry.register(provider);
}

/* ── backend selection ──────────────────────────────────────────────── */
// M4: called once after the SDK resolves (the sdk's provider is registered by
// that point). FAIL-LOUD: if the requested backend isn't registered,
// MathBackendRegistry.select() throws MathBackendNotAvailableError. js-reference is
// a provider like any other — it exists only where a source graph registered it
// (the dev sdk entry), so requesting it from a distribution throws here.
function _applyBackendSelection(sdk) {
    var id = _mathBackend;
    if (!id) {
        // No backend requested: the registry's first registrant stays active.
        return;
    }
    try {
        MathBackendRegistry.select(id);
        console.log('[Runtime] Math backend selected: ' + id);
    } catch (err) {
        // FAIL-LOUD with a PRECISE diagnosis. A bridge that was named but did not load
        // already rejected createEgptMathSdk (loadEgptMathWasm throws), so the one way
        // wasm-math is missing here is that no bridge URL reached the sdk.
        var detail = '';
        if (id === 'wasm-math' && !_mathWasmModuleUrl) {
            detail = ' No wasmModuleUrl was configured — the engineRouter profile ' +
                '__mathWasmModuleUrl is empty or was not threaded into Runtime.';
        }
        var msg = '[Runtime] Math backend selection FAILED for id="' + id + '": ' +
            (err && err.message ? err.message : String(err)) + '.' + detail +
            ' Never falls back silently to js-reference (FAIL-LOUD).';
        _consoleObj.error(msg);
        // Re-throw so the calling .then chain rejects and the error surfaces. The
        // registry's own error rides as `cause` (e.g. MathBackendNotAvailableError).
        throw new Error(msg, { cause: err });
    }
}

/* ── export ─────────────────────────────────────────────────────────── */

/**
 * The singleton Runtime object.
 *
 * @type {object}
 * @property {typeof init}       init       — Initialize the runtime (once per mount).
 * @property {typeof run}        run        — Fire-and-forget lane execution (code-editor path).
 * @property {typeof runCell}    runCell    — Value-returning cell execution (notebook kernel path).
 * @property {typeof resetMathScope} resetMathScope — End the math value scope and begin a fresh
 *   one. Called by whoever owns a run unit (the `run()` lane owns its own; `NotebookKernel` owns
 *   the notebook's). See the method doc for the scope rule.
 * @property {Function}          ensureMath — `() => Promise<sdk>`. Lazy-loads the math SDK.
 *   CodecView and any surface needing the codec runtime calls this; the result is cached.
 * @property {object}            frqtl      — The `caps.frqtl` sugar object (see module doc).
 * @property {object|null}       math       — The cached math SDK object, or `null` if not yet loaded.
 * @property {object}            console    — The console sink object (`log/print/warn/error/clear`).
 * @property {object}            render     — The render surface object (`frame/start/stop`).
 */
export const Runtime = {
    init:    init,
    run:     run,
    runCell: runCell,
    resetMathScope: resetMathScope,
    ensureMath: _ensureMathSdk,
    get frqtl()   { return _frqtlObj;   },
    get math()    { return _mathSdk;     },
    get console() { return _consoleObj;  },
    get render()  { return _renderObj;   }
};
