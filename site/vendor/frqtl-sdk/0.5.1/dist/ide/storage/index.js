/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/storage — THE StorageProvider seam.
 *
 * This module is the CONTRACT for all persistent storage used by the FraqtlIde
 * author surface.  It defines the interface every provider must implement and
 * exposes the active provider instance chosen at boot time.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The IDE needs project persistence.  Today the active driver is browser
 * localStorage (see local-storage-provider.js).  Tomorrow it may be a
 * server-side REST backend (see lib/server/mounts.js §/api/storage).
 *
 * The seam lives here so the IDE and all tooling import only this module and
 * never depend on localStorage or any backend directly.  Swapping the backend
 * requires changing only which provider is passed to setActiveProvider() —
 * ZERO changes to IDE or AuthorView code.
 *
 * ── The contract (every provider MUST implement) ────────────────────────────
 *
 *   get(namespace, key)            → value (any JSON-serialisable) | null
 *   put(namespace, key, value)     → void
 *   delete(namespace, key)         → void
 *   list(namespace)                → Array<{ key: string, ...metadata }>
 *
 * Rules:
 *   • namespace and key are non-empty strings.  "/" is reserved.
 *   • value must be JSON-serialisable.  Providers are free to stringify it.
 *   • list returns one entry per key in the namespace (order unspecified).
 *     Each entry MUST contain at least { key: string }.  Providers may add
 *     metadata (e.g. updatedAt).
 *   • get on a missing key returns null — never throws.
 *   • delete on a missing key is a no-op — never throws.
 *   • All other contract violations (bad types, absent localStorage, etc.)
 *     MUST throw a descriptive Error — FAIL-LOUD, never silent.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   // During browser app boot, wire the active driver once (the ONE installer):
 *   import { bootLocalStorage } from 'lib/shim/storage/boot.js';
 *   bootLocalStorage();   // → { row: 'installed' | 'already-active' | 'unavailable', detail? }
 *
 *   // Then anywhere in the IDE:
 *   import { getProvider } from 'lib/shim/storage';
 *   const storage = getProvider();
 *   storage.put('projects', 'abc123', { name: 'My project' });
 *   const saved = storage.get('projects', 'abc123');
 *   const all   = storage.list('projects');
 *   storage.delete('projects', 'abc123');
 *
 * ── Contract validation ─────────────────────────────────────────────────────
 *
 *   validateProvider(provider) — throws if provider does not implement the
 *     contract.  Called by setActiveProvider; consumers may also call it.
 *
 * ── Server-side seam ───────────────────────────────────────────────────────
 *
 *   The matching server routes are defined in lib/server/mounts.js under
 *   /api/storage/:namespace        (LIST)
 *   /api/storage/:namespace/:key   (GET / PUT / DELETE)
 *   They are documented as the future-backend seam: when a server-side driver
 *   is ready, a RemoteStorageProvider that calls those routes will slot in here
 *   with no IDE changes.
 */

'use strict';

/** @type {StorageProvider|null} */
var _activeProvider = null;

// ── Contract typedefs ──────────────────────────────────────────────────────

/**
 * @typedef {object} StorageProvider
 *   Every storage driver must implement this interface exactly.
 *
 * @property {function(string, string): any|null}   get
 *   Retrieve a value. Returns null if not found; never throws on missing key.
 *
 * @property {function(string, string, any): void}  put
 *   Write a JSON-serialisable value. Overwrites any existing value.
 *
 * @property {function(string, string): void}       delete
 *   Remove a key. No-op if key does not exist; never throws.
 *
 * @property {function(string): Array<{key: string}>} list
 *   Enumerate all keys in a namespace.  Each entry contains at least
 *   { key: string } and may contain additional metadata fields.
 */

// ── Contract validation ────────────────────────────────────────────────────

var _REQUIRED_METHODS = ['get', 'put', 'delete', 'list'];

/**
 * Assert that provider implements the StorageProvider contract.
 * Throws a descriptive Error on the first violation found — FAIL-LOUD.
 *
 * @param {any} provider
 * @throws {Error}
 */
export function validateProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error(
      '[StorageProvider] provider must be a non-null object; got ' + typeof provider
    );
  }
  for (var i = 0; i < _REQUIRED_METHODS.length; i++) {
    var method = _REQUIRED_METHODS[i];
    if (typeof provider[method] !== 'function') {
      throw new Error(
        '[StorageProvider] provider is missing required method "' + method + '"'
      );
    }
  }
}

// ── Active provider management ─────────────────────────────────────────────

/**
 * Register the active storage driver.  Must be called once at boot before
 * any call to getProvider().
 *
 * @param {StorageProvider} provider
 * @throws {Error} if provider does not implement the contract.
 */
export function setActiveProvider(provider) {
  validateProvider(provider);
  _activeProvider = provider;
}

/**
 * Retrieve the active storage driver.
 * FAIL-LOUD: throws if no provider has been registered.
 *
 * @returns {StorageProvider}
 * @throws {Error}
 */
export function getProvider() {
  if (!_activeProvider) {
    throw new Error(
      '[StorageProvider] no active provider has been set. ' +
      'Call bootLocalStorage() (lib/shim/storage/boot.js) during app boot, or setActiveProvider(<provider>) ' +
      'for a non-browser driver.'
    );
  }
  return _activeProvider;
}

/**
 * Return the active provider, or null if none has been registered.
 * Use this instead of getProvider() when a nil-safe check is appropriate
 * (e.g. during test setup before a provider is wired).
 *
 * @returns {StorageProvider|null}
 */
export function peekProvider() {
  return _activeProvider;
}

/**
 * Reset the active provider to null.  For tests only — do not call in
 * production code.
 */
export function resetProvider() {
  _activeProvider = null;
}
