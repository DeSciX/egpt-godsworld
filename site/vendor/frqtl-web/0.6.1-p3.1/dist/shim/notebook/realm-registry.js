/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module realm-registry
 * @description
 * The ONE authority for notebook webview-realm pre-loads.
 *
 * A notebook webview output cell is a managed scriptable *realm*. `frqtl canvas`,
 * `chart`, and BYO realms are NOT different cell TYPES — they are different PRE-LOADS
 * of the SAME realm primitive. Adding a new realm = registering a pre-load descriptor,
 * NEVER a new cell type (VETO-CLASS #2).
 *
 * A pre-load descriptor shape:
 * ```js
 * { boot(hostEl, transport) → ViewHandle | Promise<ViewHandle> }
 * ```
 *
 * The registry is module-level (process-global like `MathBackendRegistry`). Blessed
 * pre-loads (`frqtl`, `chart`) self-register when their descriptor module is imported.
 * A BYO realm must call `register('my-realm', descriptor)` before a notebook
 * referencing it loads.
 *
 * @example
 * import { register, get, has } from 'lib/shim/notebook/realm-registry.js';
 *
 * // Register a BYO realm pre-load:
 * register('my-realm', {
 *   boot(hostEl, transport) {
 *     // set up the realm DOM, return a ViewHandle
 *     return makeViewHandle({ ... });
 *   }
 * });
 *
 * // Resolve at notebook-pane mount time:
 * const descriptor = get('my-realm'); // FAIL-LOUD if not registered
 * const handle = await descriptor.boot(containerEl, transport);
 */

'use strict';

// Realm-name → pre-load descriptor. Module-level (the realm catalog is one
// process-global authority — mirrors MathBackendRegistry's single-instance shape).
var _realms = Object.create(null);

function _isValidName(name) {
    return typeof name === 'string' && name.length > 0 && /^[a-z][a-z0-9-]*$/.test(name);
}

/**
 * Add a realm pre-load descriptor to the catalog.
 *
 * @param {string} name
 *   Realm name (lowercase kebab; e.g. `'frqtl'`, `'chart'`, `'my-realm'`).
 * @param {{ boot: (hostEl: HTMLElement, transport: object) => (ViewHandle|Promise<ViewHandle>) }} descriptor
 *   A pre-load descriptor whose `boot(hostEl, transport)` returns (or resolves to)
 *   a frozen `ViewHandle`. FAIL-LOUD if `boot` is not a function or `name` is invalid.
 * @returns {void}
 * @throws {Error} on an invalid name or a descriptor without `boot`.
 *
 * @example
 * register('my-realm', {
 *   boot(hostEl, transport) {
 *     // mount the realm into hostEl, return/resolve a ViewHandle
 *     return makeViewHandle({ ... });
 *   }
 * });
 */
export function register(name, descriptor) {
    if (!_isValidName(name)) {
        throw new Error('[realm-registry] register: invalid realm name "' + String(name) +
            '" (expect lowercase-kebab, e.g. "frqtl"). (FAIL-LOUD.)');
    }
    if (!descriptor || typeof descriptor.boot !== 'function') {
        throw new Error('[realm-registry] register("' + name + '"): descriptor must have a ' +
            'boot(hostEl, transport) function. (FAIL-LOUD.)');
    }
    _realms[name] = descriptor;
}

/**
 * Resolve a registered pre-load descriptor.
 *
 * FAIL-LOUD on an unknown name: a cell referencing an unregistered realm surfaces
 * the error, never renders empty.
 *
 * @param {string} name — realm name (must match a prior `register()` call).
 * @returns {{ boot: Function }} the pre-load descriptor.
 * @throws {Error} if no descriptor is registered for `name`.
 *
 * @example
 * const descriptor = get('frqtl');        // throws if frqtl pre-load not imported
 * const handle = await descriptor.boot(el, transport);
 */
export function get(name) {
    var d = _realms[name];
    if (!d) {
        throw new Error('[realm-registry] get: no realm registered for "' + String(name) +
            '". Registered: [' + names().join(', ') + ']. ' +
            '(Blessed realms register at import; a BYO realm must register() first.) (FAIL-LOUD.)');
    }
    return d;
}

/** has(name) — non-throwing presence check. */
export function has(name) {
    return !!_realms[name];
}

/** names() — the registered realm names (diagnostics / docs). */
export function names() {
    return Object.keys(_realms);
}

/**
 * _resetForTest() — clear the catalog (test isolation ONLY; not part of the
 * runtime contract). The module-level catalog is process-global, so a test that
 * exercises register/get FAIL-LOUD must be able to start from empty.
 */
export function _resetForTest() {
    _realms = Object.create(null);
}
