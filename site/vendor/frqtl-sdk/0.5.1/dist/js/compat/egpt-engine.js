/* Copyright 2023-2026 by Essam Abadir */

/**
 * egpt-engine.js — Unified engine factory façade.
 *
 * ONE entry point for every env. FRQTL physics is WASM-only — the compiled Rust
 * engine (frqtl/crates/egpt_engine → fat/pkg-web). An explicit `js` request
 * (?engine=js / --engine js / EGPT_ENGINE=js / create({backend:'js'})) FAILS LOUD;
 * it never silently degrades to WASM.
 *
 * Load two ways — NO bundler required:
 *
 *   Browser <script>:
 *     <script src=".../compat/egpt-engine.js"></script>
 *     <!-- Providers are loaded lazily from the same dir -->
 *     Installs → window.EGPTEngine
 *
 *   Node CommonJS:
 *     const EGPTEngine = require('.../frqtl/compat/egpt-engine.js');
 *
 * ── Public API ──────────────────────────────────────────────────────────
 *
 *   EGPTEngine.create({ backend?, env?, wasmPkgUrl?, seed?, ...opts })
 *     → Promise<EngineHandle>
 *
 *   EGPTEngine.detectBackend()  → 'wasm'
 *     Reads ?engine= URL param (browser) | --engine / --wasm argv | EGPT_ENGINE env var.
 *     Returns 'wasm'; an explicit 'js' request throws (archived).
 *
 *   EGPTEngine.detectEnv()  → 'browser' | 'node'
 *
 * ── EngineHandle shape ───────────────────────────────────────────────────
 *
 *   {
 *     backend:        'wasm',
 *     env:            'browser' | 'node',
 *     EGPTUniverse,            // the class; BUILD WITH EGPTUniverse.create(config) —
 *                              // the ONE construction authority (bare `new` throws)
 *     Rectangle, Charge, LightColor,
 *     TickData, FrameData, DimensionData, UniverseData,
 *   }
 *
 * ── env selection ────────────────────────────────────────────────────────
 *
 *   The façade detects env automatically (browser vs node) and never passes
 *   the selection decision into providers. Providers receive a pre-resolved
 *   WasmUniverse ctor (browser) or do their own require() (node).
 *
 * ── WASM deferred-p5 contract ────────────────────────────────────────────
 *
 *   For the browser WASM path, window._wasmReadyPromise is set by
 *   wasm-load-browser.js before the WASM binary fetch begins. engine-boot.js's
 *   window._egptWhenEngineReady settles on it; an experiment page reaches it only
 *   through window._egptStartSketch() (stack-boot.js), which defers p5 until then.
 *
 * ── Classic-script + CommonJS dual-mode ─────────────────────────────────
 *
 *   No ES-module syntax in this file.  The only dynamic import() is inside
 *   wasm-load-browser.js (dynamic fetch of the wasm-pack --target web bundle).
 *
 * ── Provider paths (relative to THIS file) ──────────────────────────────
 *
 *   frqtl/compat/egpt-engine.js
 *     providers/wasm-engine.js       (WASM adapter, env-agnostic)
 *     providers/wasm-load-browser.js (browser WASM load shim)
 *     providers/wasm-load-node.js    (node WASM load shim)
 */
(function () {
    'use strict';

    var isBrowser = (typeof window !== 'undefined');
    var isNode    = (typeof process !== 'undefined' && process.versions && process.versions.node);

    // ── Provider paths ───────────────────────────────────────────────────
    //
    // In Node, require() paths are resolved from __dirname.
    // In browser, provider scripts must be loaded as additional <script> tags,
    // OR the façade loads them via the _loadScript helper below.
    // For simplicity and consistency, the façade uses require() in node and
    // expects co-located provider globals in the browser (set by their own
    // IIFE dual-mode tails on window).

    var _path;
    var _providersDir;
    if (isNode) {
        _path = require('path');
        _providersDir = _path.resolve(__dirname, 'providers');
    }

    // ── detectEnv / detectBackend ────────────────────────────────────────

    /**
     * Detect the current runtime environment.
     * @returns {'browser'|'node'}
     */
    function detectEnv() {
        if (isBrowser) return 'browser';
        return 'node';
    }

    // The one FAIL-LOUD message for any explicit JS-engine request. FRQTL physics
    // is WASM-only; the JS reference engine is archived as a frozen historical
    // fixture (internal/archive/frqtl-js-reference/), not a runtime backend.
    var JS_ARCHIVED_MSG =
        '[egpt-engine] JS reference engine archived — FRQTL is WASM-only. ' +
        'Remove ?engine=js / --engine js / EGPT_ENGINE=js / create({backend:"js"}); ' +
        'the only FRQTL physics engine is the compiled Rust/WASM engine ' +
        '(frqtl/crates/egpt_engine → fat/pkg-web).';

    /**
     * Detect the engine backend from environment signals.
     * FRQTL physics is WASM-only: this returns 'wasm'. An explicit 'js' request
     * (?engine=js browser | --engine js / EGPT_ENGINE=js node) THROWS — it never
     * silently degrades to WASM. Backend selection lives IN the compat layer
     * (below the shim), so this does not reintroduce engine-sniffing above the shim.
     * @returns {'wasm'}
     */
    function detectBackend() {
        if (isBrowser) {
            var engine = null;
            try { engine = new URLSearchParams(window.location.search).get('engine'); }
            catch (e) { /* non-browser-like env */ }
            if (engine === 'js') { throw new Error(JS_ARCHIVED_MSG); }
            return 'wasm';
        }
        if (isNode) {
            var args = process.argv;
            for (var i = 0; i < args.length; i++) {
                if (args[i] === '--engine' && i + 1 < args.length && args[i + 1] === 'js') {
                    throw new Error(JS_ARCHIVED_MSG);
                }
            }
            if (process.env.EGPT_ENGINE === 'js') { throw new Error(JS_ARCHIVED_MSG); }
            return 'wasm';
        }
        return 'wasm';
    }

    // ── Provider loading ─────────────────────────────────────────────────

    /**
     * In Node, require() the provider module from the providers/ dir.
     * In browser, read it from the window global set by the provider's IIFE tail.
     */
    function _requireProvider(name, browserGlobal) {
        if (isNode) {
            return require(_path.join(_providersDir, name));
        }
        // Browser: provider must have been loaded as a <script> already, or we
        // attempt a synchronous XHR load (not supported for async init — the façade
        // itself is loaded as a classic script and providers are co-located).
        // Providers install themselves on window under _WasmEngineProvider,
        // _WasmLoadBrowser, _WasmLoadNode.
        var g = window[browserGlobal];
        if (!g) {
            throw new Error(
                '[egpt-engine] Provider "' + name + '" not found on window.' + browserGlobal + '. ' +
                'Add a <script src=".../compat/providers/' + name + '"> before egpt-engine.js.'
            );
        }
        return g;
    }

    // ── create() ────────────────────────────────────────────────────────

    /**
     * Create an EngineHandle. FRQTL physics is WASM-only; an explicit
     * `backend:'js'` throws (archived).
     *
     * @param {object} [opts]
     * @param {'wasm'} [opts.backend]           - Optional; only 'wasm' is valid.
     * @param {'browser'|'node'} [opts.env]     - Rarely needed; auto-detected.
     * @param {string} [opts.wasmPkgUrl]        - WASM pkg URL override (browser) or
     *                                            absolute path (node).
     * @returns {Promise<object>} EngineHandle
     *
     * NOTE: creating a handle is LOADING THE ENGINE — it carries no world settings.
     * `seed`, `fps` and every other universe knob belong to the ONE construction
     * authority, `handle.EGPTUniverse.create(config)`.
     */
    function create(opts) {
        opts = opts || {};
        if (opts.backend === 'js') { throw new Error(JS_ARCHIVED_MSG); }
        // detectBackend() throws on an explicit js request; otherwise 'wasm'.
        var backend = opts.backend || detectBackend();
        var env     = opts.env     || detectEnv();
        return _createWasm(env, opts);
    }

    // ── WASM backend ────────────────────────────────────────────────────

    function _createWasm(env, opts) {
        var wasmEngine = _requireProvider('wasm-engine.js', '_WasmEngineProvider');

        if (env === 'node') {
            var wasmLoadNode = _requireProvider('wasm-load-node.js', '_WasmLoadNode');
            return wasmLoadNode.load(opts.wasmPkgUrl).then(function (loaded) {
                var handle = wasmEngine.makeProvider(loaded.WasmUniverse, loaded.Rectangle);
                handle.env = 'node';
                // Expose Rectangle (the sole spatial-rect class) on the handle.
                handle.Rectangle = loaded.Rectangle;
                return handle;
            });
        }

        // Browser
        var wasmLoadBrowser = _requireProvider('wasm-load-browser.js', '_WasmLoadBrowser');
        return wasmLoadBrowser.loadAndSetReadyPromise(opts.wasmPkgUrl).then(function (loaded) {
            var handle = wasmEngine.makeProvider(loaded.WasmUniverse);
            handle.env = 'browser';
            // Rectangle is a browser global (set by quadtree.js <script>)
            if (typeof Rectangle !== 'undefined') {
                handle.Rectangle = Rectangle;
            }
            // Install engine globals for browser consumers (matches old browser adapter behavior)
            window.EGPTUniverse = handle.EGPTUniverse;
            window.Charge       = handle.Charge;
            // window.LightColor is owned by objects/constants/LightColor.js (the canonical
            // single color source) — do NOT overwrite it from the engine handle.
            window.TickData     = handle.TickData;
            window.FrameData    = handle.FrameData;
            // Expose the boundary Frame class so experiment code using
            // Frame.makeLeafFrame / dimension.addFrame / dimension.createFrameFromRect
            // gets the WASM boundary object (log+null) rather than a crash.
            if (handle.Frame) {
                window.Frame = handle.Frame;
            }
            return handle;
        });
    }

    // ── Public API ───────────────────────────────────────────────────────

    var EGPTEngine = {
        create:        create,
        detectBackend: detectBackend,
        detectEnv:     detectEnv,
    };

    // ── Dual-mode publish ────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EGPTEngine;
    }
    if (isBrowser) {
        window.EGPTEngine = EGPTEngine;
    }

})();
