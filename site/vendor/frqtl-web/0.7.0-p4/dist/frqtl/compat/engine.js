/* Copyright 2023-2026 by Essam Abadir */

/**
 * compat/engine.js — THE engine door: boot the WASM engine once per realm, then read it.
 *
 *   bootEngine(loader, opts) → Promise<EngineHandle>
 *       loader — the host's WASM loader: `browserWasmLoader` (providers/wasm-load-browser.js) or
 *                `nodeWasmLoader` (providers/wasm-load-node.js). The loader is INJECTED by the door
 *                that knows its host; this file never sniffs the environment.
 *       opts   — { engine } — the requested backend (a page's `?engine=`). Only 'wasm' exists: any
 *                other value REJECTS naming the archive (FRQTL physics is WASM-only).
 *       Latched per realm: the first call owns the boot; later calls return the SAME promise
 *       (booting, booted or failed — a failed boot stays failed, never retried behind a caller's
 *       back). A second call with a DIFFERENT loader throws — one engine per realm.
 *
 *   engine() → EngineHandle — THROWS until bootEngine resolved, naming the door.
 *   engineState() → 'unbooted' | 'booting' | 'booted' | 'failed'
 *   refuseRetiredDoors(bag, table) → bag   every name in `table` ({ name: message }) becomes a
 *       non-enumerable accessor on `bag` that THROWS its message (a retired door errors loudly; it
 *       never works and never reads as undefined). THE one refusal mechanism: RecipeContext installs its
 *       retired members, the page door the retired page globals — each from its owner's table. (A
 *       retired ES-module export is simply absent: a named import of it fails at link.)
 *
 * EngineHandle (wasm-engine.js `makeProvider`): { backend:'wasm', env, EGPTUniverse, Rectangle,
 * Frame, TickData, FrameData, DimensionData, UniverseData, LightColor, Charge }. Build a world with
 * `engine().EGPTUniverse.create(config)` — the ONE construction authority; a create() before the
 * boot resolved throws naming this door.
 *
 * No module reads an engine value at evaluation time and nothing here awaits at top level, so
 * importing any part never boots WASM (and `require(esm)` / the IIFE build stay open). Gate:
 * lib/frqtl/compat/test/engine-door.test.mjs.
 */

import { makeProvider } from './providers/wasm-engine.js';

export const JS_ARCHIVED_MSG =
    '[engine] JS reference engine archived — FRQTL is WASM-only. Remove ?engine=js / --engine js / ' +
    'EGPT_ENGINE=js; the only FRQTL physics engine is the compiled Rust/WASM engine ' +
    '(frqtl/crates/egpt_engine → fat/pkg-web).';

/**
 * @param {object} bag — a published symbol bag (before it is frozen), a prototype, or a window
 * @param {Object<string, string>} table — retired name → the message reading it throws
 * @returns {object} the same bag
 */
export function refuseRetiredDoors(bag, table) {
    const rows = table;
    if (!rows || typeof rows !== 'object') {
        throw new TypeError('[engine] refuseRetiredDoors(bag, table): the owner\'s table of retired names is required. (FAIL-LOUD.)');
    }
    for (const name of Object.keys(rows)) {
        if (typeof rows[name] !== 'string' || !rows[name]) {
            throw new TypeError('[engine] refuseRetiredDoors: the retirement message for "' + name + '" must be ' +
                'a non-empty string (it is the replacement\'s one home). (FAIL-LOUD.)');
        }
        const prior = Object.getOwnPropertyDescriptor(bag, name);
        if (prior && !prior.configurable) {
            throw new Error('[engine] this page already holds a global "' + name + '" (a `var` or function declaration ' +
                'in a classic script), and that name is a retired FRQTL door: ' + rows[name] + ' Keep the page\'s own ' +
                'binding off the global object — declare it inside a function or a block (const/let), or import it ' +
                'from the ES module doors. (FAIL-LOUD.)');
        }
        Object.defineProperty(bag, name, {
            enumerable: false,
            configurable: false,
            get: function () { throw new Error(rows[name]); },
            set: function () { throw new Error(rows[name]); }
        });
    }
    return bag;
}

let _loader = null;
let _promise = null;
let _handle = null;
let _state = 'unbooted';

/**
 * @param {{env: string, load: function(): Promise<{WasmUniverse: Function}>}} loader
 * @param {{engine?: string}} [opts]
 * @returns {Promise<object>} the EngineHandle
 */
export function bootEngine(loader, opts) {
    if (!loader || typeof loader.load !== 'function' || typeof loader.env !== 'string') {
        throw new TypeError('[engine] bootEngine(loader): loader must be a WASM loader — browserWasmLoader ' +
            '(compat/providers/wasm-load-browser.js) or nodeWasmLoader (compat/providers/wasm-load-node.js). (FAIL-LOUD.)');
    }
    if (_promise) {
        if (loader !== _loader) {
            throw new Error('[engine] bootEngine: this realm already booted its engine with the "' + _loader.env +
                '" loader — one engine per realm; a second loader is refused. (FAIL-LOUD.)');
        }
        return _promise;
    }
    _loader = loader;
    const requested = opts && opts.engine;
    if (requested !== undefined && requested !== null && requested !== 'wasm') {
        _state = 'failed';
        _promise = Promise.reject(new Error(JS_ARCHIVED_MSG + ' (requested engine="' + requested + '")'));
        return _promise;
    }
    _state = 'booting';
    _promise = loader.load().then(function (loaded) {
        const handle = makeProvider(loaded.WasmUniverse);
        handle.env = loader.env;
        _handle = handle;
        _state = 'booted';
        return handle;
    }, function (err) {
        _state = 'failed';
        throw err;
    });
    return _promise;
}

/** @returns {object} the EngineHandle. THROWS until bootEngine resolved. */
export function engine() {
    if (_handle) { return _handle; }
    throw new Error('[engine] the engine is not booted (state: ' + _state + ') — boot it through a door first: ' +
        'await bootEngine(loader) (lib/frqtl/compat/engine.js), which the boot module ' +
        '(experiments/_shared/boot.js) and the node door call for you. (FAIL-LOUD.)');
}

/** @returns {'unbooted'|'booting'|'booted'|'failed'} */
export function engineState() {
    return _state;
}
