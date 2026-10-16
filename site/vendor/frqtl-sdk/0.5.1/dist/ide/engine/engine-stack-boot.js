/* Copyright 2023-2026 by Essam Abadir */

/**
 * ensureEngineStack — boot the canonical engine + game layer so that the engine
 * globals a builder cell needs (window.FrqtlApp, window.EGPTUniverse,
 * LargeObject, QuantumEmitter, …) are installed.
 *
 * Named ESM export. Lives in lib/shim so the runtime builtin `frqtl.ensureEngine`
 * can boot the engine WITHOUT importing GraphicsPane (the upward-arrow veto) and
 * WITHOUT importing lib/frqtl/objects (the cross-arrow veto). It injects the SAME
 * canonical loader GraphicsPane.boot() injects — `experiments/_shared/stack-boot.js`
 * — via the caller's router resolve (the one path authority), then awaits BOTH of
 * stack-boot's published signals: the `_egptWhenEngineReady` hook (engine + WASM) AND
 * `window._egptStackReadyPromise` (the loader's LAST phase — the whole GAME_LAYER_SCRIPTS
 * roster, then any data-page-scripts; a tag this module injects carries none). ONE
 * engine-boot authority (stack-boot.js); no second loader.
 *
 * ── WHAT THE RETURNED PROMISE PROMISES (FRAQTL #73) ─────────────────────────
 *
 * Resolving means EVERY game-layer global the roster installs is reachable — not
 * one sampled global. It used to mean only `window.FrqtlApp`, polled. But
 * `objects/FrqtlApp.js` is not the LAST roster entry (`RecipeContext.js`
 * follows it) and stack-boot loads the roster strictly
 * sequentially, so the sentinel went true while later entries were still in
 * flight. A synthesized recipe builder reads `window.RecipeContext` on the line
 * AFTER the awaited ensureEngine() (lib/shim/notebook/setup-builder.js
 * `shape="recipe"`), so it intermittently got nothing. The fix is not a longer
 * poll: the roster's OWNER (stack-boot.js) publishes when the roster is complete
 * and this module awaits that fact.
 *
 * Why the runtime needs this: in the builder+canvas split, the builder js cell
 * (the producer) runs BEFORE the canvas cell (the consumer) — but the builder
 * calls frqtl.FrqtlApp, which needs window.FrqtlApp already
 * installed. GraphicsPane installs it only when the canvas cell boots, which is
 * too late. So frqtl.ensureEngine boots the engine stack first. We wait for the stack
 * (engine + game layer) — NOT p5, which is the canvas cell's GraphicsPane concern.
 *
 * Idempotent + cached: stack-boot.js's own <script> idempotency plus a cached
 * promise here mean repeated builder cells (and the StrictMode double-run) boot
 * the stack exactly once. FAIL-LOUD: if engine-boot never installs the ready hook
 * or the WASM ready promise rejects, the returned promise rejects — never a
 * silent half-boot.
 *
 * R1 (ws-stackboot-dev-map SEAM RULING): this is a PROGRAMMATIC host — it injects
 * stack-boot.js into a page it owns, so it must set window._egptEnginePathMap from
 * its OWN router BEFORE the tag executes (router.ensureBrowserPathMap()), the same
 * precondition discipline GraphicsPane.boot() applies. That is why this function
 * takes the whole router (not a bare resolve function): the path authority IS the
 * natural argument.
 */

'use strict';

// This module owns its own idempotent <script> injector to load the engine STACK.
// (The former setup-factory <script> loader, setup-resolver.js, was retired in
// WS-NOTEBOOK-FACTORY-RETIRE — setups now load via the explicit-import builder path.)

var _bootPromise = null;

function _injectScript(src) {
    return new Promise(function (resolve, reject) {
        if (!src) { resolve(); return; }
        if (typeof document === 'undefined') {
            reject(new Error('[engine-stack-boot] no document — the engine can only boot in a browser.'));
            return;
        }
        var existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
            if (existing.getAttribute('data-egpt-loaded') === '1') { resolve(); }
            else if (existing.getAttribute('data-egpt-failed') === '1') { reject(new Error('Failed to load script: ' + src)); }
            else {
                existing.addEventListener('load',  function () { resolve(); });
                existing.addEventListener('error', function () { reject(new Error('Failed to load script: ' + src)); });
            }
            return;
        }
        var s = document.createElement('script');
        s.src = src;
        s.onload  = function () { s.setAttribute('data-egpt-loaded', '1'); resolve(); };
        s.onerror = function () { s.setAttribute('data-egpt-failed', '1'); reject(new Error('Failed to load script: ' + src)); };
        document.body.appendChild(s);
    });
}

// THE ONE COMPOSED WAIT — the whole meaning of the promise ensureEngineStack returns.
// Both branches below end here; they differ ONLY in whether stack-boot.js still has to be
// injected. Engine-ready and the GAME roster settle far apart (stack-boot starts the
// RENDERER and GAME phases right after injecting engine-boot.js, while WASM is still
// instantiating), so neither alone is the contract:
//   1. engine-ready — `_egptWhenEngineReady(onReady, onError)`, the queue-safe hook that
//      stack-boot shims and engine-boot.js replaces. The onError argument is what carries
//      a WASM failure: at injection time `_wasmReadyPromise` does not exist yet, so a
//      synchronous capture of it alone could never see the later rejection.
//   2. THEN the stack — `window._egptStackReadyPromise`, published by stack-boot.js,
//      settling after its LAST phase (FRAQTL #73/#74: never a probe of one global such as
//      window.FrqtlApp, which is two entries before the end of the GAME roster).
// `_wasmReadyPromise` is ALSO mirrored for the case where it already exists (a page whose
// engine has already failed when this caller arrives).
function _awaitStack() {
    return new Promise(function (resolve, reject) {
        if (typeof window === 'undefined' || typeof window._egptWhenEngineReady !== 'function') {
            reject(new Error(
                '[engine-stack-boot] engine-boot.js did not install _egptWhenEngineReady. (FAIL-LOUD.)'
            ));
            return;
        }
        window._egptWhenEngineReady(function () {
            if (!window._egptStackReadyPromise) {
                reject(new Error(
                    '[engine-stack-boot] stack-boot.js did not publish ' +
                    'window._egptStackReadyPromise — the stack-ready contract ' +
                    'is missing (lib/frqtl/experiments/_shared/stack-boot.js). (FAIL-LOUD.)'
                ));
                return;
            }
            window._egptStackReadyPromise.then(function () { resolve(); }, reject);
        }, reject);
        (window._wasmReadyPromise || Promise.resolve()).catch(reject);
    });
}

/**
 * ensureEngineStack(router) → Promise<void>
 * Resolves once the engine is ready AND stack-boot's stack-ready promise has settled
 * (see the module docstring — never a single-global probe).
 *
 * @param {import('./router.js').EngineRouter} router — an engineRouter() instance
 *   (its `.resolve` locates stack-boot.js; its `.ensureBrowserPathMap()` sets the
 *   page's window._egptEnginePathMap precondition BEFORE the tag runs — R1).
 */
export function ensureEngineStack(router) {
    if (_bootPromise) { return _bootPromise; }
    var injected;
    if (typeof window !== 'undefined' && window._egptStackReadyPromise) {
        // stack-boot.js already EXECUTED on this page (a canvas cell's GraphicsPane.boot(),
        // an experiment page's own tag). Skip only the INJECTION — never the wait: the
        // stack promise existing (or even having settled) says nothing about WASM.
        injected = Promise.resolve();
    } else {
        if (!router || typeof router.resolve !== 'function') {
            return Promise.reject(new Error(
                '[engine-stack-boot] ensureEngineStack requires a router (an engineRouter() ' +
                'instance, not a bare resolve function). (FAIL-LOUD.)'
            ));
        }
        // R1: set the page's window._egptEnginePathMap from THIS router BEFORE injecting the
        // tag — stack-boot.js throws without it. Throws here (never a silent stale map) if a
        // DIFFERENT map is already on the page (two routers/injectors is a host bug).
        try {
            router.ensureBrowserPathMap();
        } catch (mapErr) {
            return Promise.reject(mapErr);
        }
        injected = _injectScript(router.resolve('experiments/_shared/stack-boot.js'));
    }
    _bootPromise = injected.then(_awaitStack);
    // On failure, clear the cache so a later retry can re-attempt rather than
    // forever resolving the rejected promise.
    _bootPromise.catch(function () { _bootPromise = null; });
    return _bootPromise;
}
