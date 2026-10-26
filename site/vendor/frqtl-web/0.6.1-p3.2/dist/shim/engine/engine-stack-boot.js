/* Copyright 2023-2026 by Essam Abadir */

/**
 * ensureEngineStack — boot the canonical engine + game layer in THIS realm and hand back the realm's
 * own module instances a builder cell needs (the parts, FrqtlApp, RecipeContext, the engine accessor).
 *
 * Named ESM export. Lives in lib/shim so the runtime builtin `frqtl.ensureEngine` can boot the engine
 * WITHOUT importing GraphicsPane (the upward-arrow veto) and WITHOUT importing lib/frqtl (the
 * cross-arrow veto). It imports THE boot module (`experiments/_shared/boot.js`) from the served tree
 * through the caller's router — the same module instance GraphicsPane.boot() and every experiment page
 * boot through — awaits `bootRealm()`, then imports each REALM_MODULES row through the SAME router, so
 * every module is the instance the boot loaded (one module, one URL). ONE boot authority; no second
 * loader.
 *
 *   REALM_MODULES                 key → router-relative module path (the one table of what a realm hands out)
 *   ensureEngineStack(router) → Promise<Object<key, namespace>>   frozen; latched by the boot module for
 *       the document, so a later call returns the same instances, and a failed engine boot stays failed:
 *       recovering from one takes a fresh document.
 *
 * @param {object} router — an engineRouter() instance (needs .resolve)
 */

'use strict';

/** The realm's module instances a builder cell reads, by router-relative path. */
export const REALM_MODULES = Object.freeze({
    parts:          'parts/index.js',
    app:            'objects/FrqtlApp.js',
    recipe:         'objects/RecipeContext.js',
    engine:         'compat/engine.js',
    display:        'compat/renderer/display-slot.js',
    QuantumEmitter: 'objects/objects/QuantumEmitter.js',
    Box:            'objects/objects/Box.js',
    CircuitGate:    'objects/objects/CircuitGate.js',
    CircuitProbe:   'objects/objects/CircuitProbe.js'
});

export function ensureEngineStack(router) {
    if (!router || typeof router.resolve !== 'function') {
        return Promise.reject(new Error(
            '[engine-stack-boot] ensureEngineStack requires a router (an engineRouter() instance with ' +
            '.resolve, not a bare resolve function). (FAIL-LOUD.)'
        ));
    }
    function url(rel) { return new URL(router.resolve(rel), document.baseURI).href; }
    return Promise.all([import(/* @vite-ignore */ url('experiments/_shared/boot.js')),
        import(/* @vite-ignore */ url('experiments/_shared/page-door.js'))]).then(function (mods) {
        mods[1].refuseRetiredGlobals();   // an in-tree realm: a retired page global throws its repoint
        return mods[0].bootRealm();
    }).then(function () {
        var keys = Object.keys(REALM_MODULES);
        return Promise.all(keys.map(function (k) { return import(/* @vite-ignore */ url(REALM_MODULES[k])); }))
            .then(function (mods) {
                var out = {};
                keys.forEach(function (k, i) { out[k] = mods[i]; });
                return Object.freeze(out);
            });
    });
}
