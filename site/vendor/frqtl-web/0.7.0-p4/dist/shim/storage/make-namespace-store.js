/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/storage/make-namespace-store.js — Generic namespace-CRUD factory.
 *
 * The id-keyed record store lib/shim/notebook/store.js is a thin config call
 * over. (A project folder and a codec chain are keyed by NAME and have their
 * own owners: folders.js, codec-chains.js.)
 *
 * ── Signature ──────────────────────────────────────────────────────────────
 *
 *   makeNamespaceStore(config) → { newId, save, load, list, delete: del }
 *
 * ── Config ─────────────────────────────────────────────────────────────────
 *
 *   namespace      {string}    — StorageProvider namespace key (e.g. 'notebooks').
 *   schemaVersion  {number}    — Current schema version integer (stamped on save
 *                                by callers; used here only in the returned
 *                                constant — actual stamping is the caller's job,
 *                                as in the originals).
 *   idPrefix       {string}    — Prefix for generated ids (e.g. 'nb_').
 *   validate       {function}  — validate(record): throws on invalid envelope.
 *   summaryFields  {function}  — summaryFields(record) → summary object, or
 *                                returns null to silently skip the record.
 *   migrate        {function?} — Optional. migrate(raw) → migrated record.
 *                                Applied in load() and list() after provider.get().
 *   listFilter     {function?} — Optional. listFilter(record, opts) → boolean.
 *                                Applied after migration. When absent, all
 *                                non-null summaryFields results are included.
 *
 * ── Returned surface ───────────────────────────────────────────────────────
 *
 *   newId()                 → string
 *   save(provider, record)  → void         (FAIL-LOUD; validate then put)
 *   load(provider, id)      → object|null  (migrate applied; FAIL-LOUD on bad id)
 *   list(provider, opts?)   → Array        (skip-malformed; sort updatedAt desc)
 *   del(provider, id)       → void         (no-op if absent; FAIL-LOUD on bad id)
 *
 * ── Arrows ─────────────────────────────────────────────────────────────────
 *
 *   lib/shim → lib/shim (legal).
 *   lib/shim/notebook/store.js imports via ../storage/make-namespace-store.js.
 */

'use strict';

/**
 * @param {{
 *   namespace:     string,
 *   schemaVersion: number,
 *   idPrefix:      string,
 *   validate:      function,
 *   summaryFields: function,
 *   migrate?:      function,
 *   listFilter?:   function,
 * }} config
 * @returns {{ newId: function, save: function, load: function, list: function, delete: function }}
 */
export function makeNamespaceStore(config) {
  var namespace     = config.namespace;
  var idPrefix      = config.idPrefix;
  var validate      = config.validate;
  var summaryFields = config.summaryFields;
  var migrate       = config.migrate   || null;
  var listFilter    = config.listFilter || null;

  // ── newId ──────────────────────────────────────────────────────────────────

  function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return idPrefix + crypto.randomUUID().replace(/-/g, '');
    }
    // Fallback: timestamp (base-36) + random bits (base-36)
    var ts  = Date.now().toString(36);
    var rnd = Math.random().toString(36).slice(2, 10);
    return idPrefix + ts + rnd;
  }

  // ── save ───────────────────────────────────────────────────────────────────

  function save(provider, record) {
    validate(record);
    provider.put(namespace, record.id, record);
  }

  // ── load ───────────────────────────────────────────────────────────────────

  function load(provider, id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('[' + namespace + '] load: id must be a non-empty string');
    }
    var raw = provider.get(namespace, id);
    if (raw === null || raw === undefined) { return null; }
    return migrate ? migrate(raw) : raw;
  }

  // ── list ───────────────────────────────────────────────────────────────────

  function list(provider, opts) {
    var entries   = provider.list(namespace);
    var summaries = [];
    for (var i = 0; i < entries.length; i++) {
      var raw = provider.get(namespace, entries[i].key);
      if (!raw || typeof raw.id !== 'string') {
        continue; // silently skip malformed entries
      }
      var record = migrate ? migrate(raw) : raw;
      if (listFilter && !listFilter(record, opts)) { continue; }
      var summary = summaryFields(record);
      if (summary === null || summary === undefined) { continue; }
      summaries.push(summary);
    }
    // Sort most-recently-modified first.
    summaries.sort(function (a, b) {
      if (a.updatedAt < b.updatedAt) { return  1; }
      if (a.updatedAt > b.updatedAt) { return -1; }
      return 0;
    });
    return summaries;
  }

  // ── delete ─────────────────────────────────────────────────────────────────

  function del(provider, id) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('[' + namespace + '] delete: id must be a non-empty string');
    }
    provider.delete(namespace, id);
  }

  return { newId: newId, save: save, load: load, list: list, 'delete': del };
}
