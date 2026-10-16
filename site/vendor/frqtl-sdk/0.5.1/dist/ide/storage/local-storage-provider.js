/* Copyright 2023-2026 by Essam Abadir */

/**
 * LocalStorageProvider — THE active storage driver (browser localStorage).
 *
 * Implements the StorageProvider contract defined in lib/shim/storage/index.js.
 *
 * ── Key format ─────────────────────────────────────────────────────────────
 *
 *   frqtl:<namespace>:<key>
 *
 *   e.g. "frqtl:projects:abc123"
 *
 * ── Serialisation ──────────────────────────────────────────────────────────
 *
 *   Values are stored as JSON strings.  Non-serialisable values (functions,
 *   circular references, etc.) FAIL-LOUD — the error surfaces immediately so
 *   the caller knows the write did not persist, rather than silently losing data.
 *
 * ── Namespace enumeration ──────────────────────────────────────────────────
 *
 *   list() iterates all localStorage keys, collects those with the prefix
 *   "frqtl:<namespace>:", and parses the stored JSON to extract any metadata
 *   fields that were stored alongside the value.
 *
 *   list() always returns plain-object entries of the form
 *   { key: string, ...any metadata from the stored envelope }.
 *   It never throws on individual malformed entries — those are skipped and
 *   a console.warn is emitted so the problem is visible without crashing the
 *   list view.
 *
 * ── Absent localStorage ─────────────────────────────────────────────────────
 *
 *   The constructor FAIL-LOUDs with a clear message if window.localStorage is
 *   not available (e.g. in a sandboxed iframe with storage blocked, or in a
 *   non-browser environment).  Use a different provider in those contexts.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   Constructed in ONE place: lib/shim/storage/boot.js bootLocalStorage(), which a browser
 *   surface calls at boot (gated by test/boot.test.mjs). Never construct it elsewhere.
 */

'use strict';

var _PREFIX = 'frqtl';

/**
 * Build the localStorage key for a given namespace + key pair — the ONE owner of the
 * key format (exported so a harness that seeds storage never re-types it).
 * @param {string} namespace
 * @param {string} key
 * @returns {string}
 */
export function storageKeyOf(namespace, key) {
  return _PREFIX + ':' + namespace + ':' + key;
}

/**
 * Build the namespace prefix used to enumerate all keys in a namespace.
 * @param {string} namespace
 * @returns {string}
 */
function _namespacePrefix(namespace) {
  return _PREFIX + ':' + namespace + ':';
}

/**
 * Assert that a string argument is a valid namespace or key.
 * FAIL-LOUD.
 *
 * @param {string} value
 * @param {string} argName  — used in the error message
 */
function _assertNonEmptyString(value, argName) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      '[LocalStorageProvider] ' + argName + ' must be a non-empty string; got: ' + JSON.stringify(value)
    );
  }
  if (value.indexOf('/') !== -1) {
    throw new Error(
      '[LocalStorageProvider] ' + argName + ' must not contain "/"; got: ' + JSON.stringify(value)
    );
  }
}

export class LocalStorageProvider {
  /**
   * @throws {Error} if window.localStorage is not available.
   */
  constructor() {
    // FAIL-LOUD if localStorage is not available.
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined' || window.localStorage === null) {
      throw new Error(
        '[LocalStorageProvider] window.localStorage is not available in this environment. ' +
        'Use a different StorageProvider (e.g. a server-backed RemoteStorageProvider) ' +
        'or ensure the page is served in a context where localStorage is permitted.'
      );
    }
    // Probe with a write+delete to detect private/blocked storage.
    try {
      var _probe = '__frqtl_storage_probe__';
      window.localStorage.setItem(_probe, '1');
      window.localStorage.removeItem(_probe);
    } catch (e) {
      throw new Error(
        '[LocalStorageProvider] window.localStorage is present but write-blocked (private ' +
        'browsing with strict storage restrictions?). Error: ' + (e && e.message ? e.message : String(e))
      );
    }
    /** @type {Storage} */
    this._ls = window.localStorage;
  }

  /**
   * Retrieve a stored value.
   *
   * @param {string} namespace
   * @param {string} key
   * @returns {any|null}  Parsed JSON value, or null if not found.
   */
  get(namespace, key) {
    _assertNonEmptyString(namespace, 'namespace');
    _assertNonEmptyString(key, 'key');
    var raw = this._ls.getItem(storageKeyOf(namespace, key));
    if (raw === null) { return null; }
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(
        '[LocalStorageProvider] stored value for "' + namespace + '/' + key +
        '" is not valid JSON.  Storage may be corrupted. Error: ' +
        (e && e.message ? e.message : String(e))
      );
    }
  }

  /**
   * Write a value.  Overwrites any existing value.
   *
   * @param {string} namespace
   * @param {string} key
   * @param {any} value   Must be JSON-serialisable — FAIL-LOUD if not.
   */
  put(namespace, key, value) {
    _assertNonEmptyString(namespace, 'namespace');
    _assertNonEmptyString(key, 'key');
    var serialised;
    try {
      serialised = JSON.stringify(value);
    } catch (e) {
      throw new Error(
        '[LocalStorageProvider] value for "' + namespace + '/' + key +
        '" is not JSON-serialisable: ' + (e && e.message ? e.message : String(e))
      );
    }
    try {
      this._ls.setItem(storageKeyOf(namespace, key), serialised);
    } catch (e) {
      throw new Error(
        '[LocalStorageProvider] localStorage.setItem failed for "' + namespace + '/' + key +
        '" — storage may be full (QuotaExceededError) or blocked. Error: ' +
        (e && e.message ? e.message : String(e))
      );
    }
  }

  /**
   * Remove a key.  No-op if key does not exist.
   *
   * @param {string} namespace
   * @param {string} key
   */
  delete(namespace, key) {
    _assertNonEmptyString(namespace, 'namespace');
    _assertNonEmptyString(key, 'key');
    this._ls.removeItem(storageKeyOf(namespace, key));
  }

  /**
   * List all entries in a namespace.
   *
   * Each entry contains at minimum { key: string }.  If the stored value is
   * an object with additional metadata fields (e.g. id, name, updatedAt),
   * those are spread into the entry.
   *
   * Malformed entries (unparseable JSON, unexpected shapes) are skipped with a
   * console.warn — the list call itself never throws.
   *
   * @param {string} namespace
   * @returns {Array<{key: string}>}
   */
  list(namespace) {
    _assertNonEmptyString(namespace, 'namespace');
    var prefix = _namespacePrefix(namespace);
    var results = [];
    var ls = this._ls;
    var len = ls.length;
    for (var i = 0; i < len; i++) {
      var storageKey = ls.key(i);
      if (storageKey === null) { continue; }
      if (storageKey.indexOf(prefix) !== 0) { continue; }
      // Extract the user-facing key from the storage key.
      var userKey = storageKey.slice(prefix.length);
      var raw = ls.getItem(storageKey);
      var parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        console.warn(
          '[LocalStorageProvider] skipping malformed entry "' + storageKey + '": ' +
          (e && e.message ? e.message : String(e))
        );
        continue;
      }
      // If the stored value is an object, spread its fields as metadata.
      var entry = { key: userKey };
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (var field in parsed) {
          if (Object.prototype.hasOwnProperty.call(parsed, field) && field !== 'key') {
            entry[field] = parsed[field];
          }
        }
      }
      results.push(entry);
    }
    return results;
  }
}
