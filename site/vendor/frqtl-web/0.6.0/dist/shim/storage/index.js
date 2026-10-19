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
 *   storage.put('explainers', 'gym', { seen: true });
 *   const saved = storage.get('explainers', 'gym');
 *   const all   = storage.list('explainers');
 *   storage.delete('explainers', 'gym');
 *
 * ── Contract validation ─────────────────────────────────────────────────────
 *
 *   validateProvider(provider) — throws if provider does not implement the
 *     contract.  Called by setActiveProvider; consumers may also call it.
 *
 * ── Retired namespaces ──────────────────────────────────────────────────────
 *
 *   RETIRED_NAMESPACES — the namespaces of the retired save formats ('files': the v4 module
 *     envelope STUDIO and ROSETTA wrote; 'projects': the opaque design envelope). The project
 *     folder (folders.js) and the codec chain (codec-chains.js) replaced them. The active provider
 *     (getProvider) REFUSES a write into one, naming the replacement; reads, lists and deletes go
 *     through, so the retired-saves strip can name them and delete exactly them (folders.js
 *     retiredSaves / deleteRetiredSaves). Nothing reads or converts their rows.
 *   checkStorageKey(key, what) — THE key rule of a store keyed by a name (a project folder's
 *     frqtl.json name, a codec chain's name): a non-empty string with no "/" (reserved).
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
/** @type {StorageProvider|null} the active provider behind the retired-namespace write guard */
var _activeGuard = null;

/** The namespaces of the retired save formats — written by nothing (see the header). */
export var RETIRED_NAMESPACES = Object.freeze(['files', 'projects']);

var _RETIRED_BY = Object.freeze({
  files:    'the project folder (lib/shim/storage/folders.js, namespace "project-folders") for a STUDIO save, ' +
            'the codec chain (lib/shim/storage/codec-chains.js, namespace "codec-chains") for a ROSETTA save',
  projects: 'the project folder (lib/shim/storage/folders.js, namespace "project-folders")'
});

/**
 * THE key rule of a store keyed by a name: a non-empty string with no "/" (reserved by the contract).
 * @param {*} key
 * @param {string} what — the store's noun, for the message (e.g. 'a project folder name')
 * @throws {Error}
 */
export function checkStorageKey(key, what) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('[StorageProvider] ' + what + ' is a non-empty string (got ' + JSON.stringify(key) + '). (FAIL-LOUD.)');
  }
  if (key.indexOf('/') !== -1) {
    throw new Error('[StorageProvider] ' + what + ' ' + JSON.stringify(key) + ' contains "/" — "/" is reserved ' +
      'in a storage key; name it without one. (FAIL-LOUD.)');
  }
}

function _guarded(provider) {
  return Object.freeze({
    get: function (namespace, key) { return provider.get(namespace, key); },
    put: function (namespace, key, value) {
      if (RETIRED_NAMESPACES.indexOf(namespace) !== -1) {
        throw new Error('[StorageProvider] a write into the retired namespace "' + namespace + '" (key ' +
          JSON.stringify(key) + ') is refused — that save format is retired; ' + _RETIRED_BY[namespace] +
          ' replaced it. (FAIL-LOUD.)');
      }
      return provider.put(namespace, key, value);
    },
    'delete': function (namespace, key) { return provider['delete'](namespace, key); },
    list: function (namespace) { return provider.list(namespace); }
  });
}

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
  _activeGuard = _guarded(provider);
}

/**
 * Retrieve the active storage driver, behind the retired-namespace write guard (RETIRED_NAMESPACES).
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
  return _activeGuard;
}

/**
 * Return the active provider (behind the same guard), or null if none has been registered.
 * Use this instead of getProvider() when a nil-safe check is appropriate
 * (e.g. during test setup before a provider is wired).
 *
 * @returns {StorageProvider|null}
 */
export function peekProvider() {
  return _activeGuard;
}

/**
 * Reset the active provider to null.  For tests only — do not call in
 * production code.
 */
export function resetProvider() {
  _activeProvider = null;
  _activeGuard = null;
}
