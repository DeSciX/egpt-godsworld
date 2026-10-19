/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/notebook/store.js — NotebookDocumentStore.
 *
 * Thin CRUD helpers that persist a serialized <frqtl-notebook> document on top
 * of any StorageProvider (lib/shim/storage/index.js) using the "notebooks"
 * namespace, through the shared namespace-CRUD factory
 * (lib/shim/storage/make-namespace-store.js).
 *
 * ── Why this lives in lib/shim ──────────────────────────────────────────────
 *
 * The serialized text is owned by format.serialize (lib/shim/notebook/format.js)
 * and the storage seam is owned by StorageProvider (lib/shim/storage/index.js).
 * Both are host-neutral shim contracts.  The notebook-pane (lib/components)
 * consumes this module and does not re-implement the store helpers.  Arrow is legal: lib/shim → lib/shim.
 *
 * ── Notebook envelope ────────────────────────────────────────────────────────
 *
 *   {
 *     id:            string    — unique identifier (newNotebookId())
 *     title:         string    — human-readable title (mirrors notebook.title)
 *     html:          string    — the serialized <frqtl-notebook>…</frqtl-notebook>
 *                                text produced by format.serialize().  The value
 *                                the pane writes is the CANONICAL writer's output —
 *                                never hand-assembled markup.
 *     createdAt:     string    — ISO-8601 creation timestamp
 *     updatedAt:     string    — ISO-8601 last-updated timestamp
 *     schemaVersion: number    — integer version; currently 1
 *   }
 *
 * ── Namespace ──────────────────────────────────────────────────────────────
 *
 *   All helpers use the "notebooks" namespace.  Keys are notebook ids.
 *
 * ── The ONE persistence contract (§2.4 of the spec) ────────────────────────
 *
 *   The web IDE drives:
 *     provider.put('notebooks', id, { html: format.serialize(nb), … })
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   import { newNotebookId, saveNotebook, loadNotebook,
 *            listNotebooks, deleteNotebook } from 'lib/shim/notebook/store.js';
 *   import { getProvider } from 'lib/shim/storage';
 *
 *   const provider = getProvider();
 *
 *   const id  = newNotebookId();
 *   const html = serialize(notebook);           // format.serialize — sole writer
 *   saveNotebook(provider, { id, title: 'My notebook', html,
 *                             createdAt: now, updatedAt: now, schemaVersion: 1 });
 *
 *   const record = loadNotebook(provider, id);  // { id, title, html, … } | null
 *   const all    = listNotebooks(provider);     // [{ id, title, updatedAt }]
 *   deleteNotebook(provider, id);
 */

'use strict';

import { makeNamespaceStore } from '../storage/make-namespace-store.js';

/** @type {string} The storage namespace for all notebook records. */
export var NOTEBOOKS_NAMESPACE = 'notebooks';

/** @type {number} Current schema version.  Increment on breaking envelope changes. */
export var NOTEBOOK_SCHEMA_VERSION = 1;

// ── Envelope validation ──────────────────────────────────────────────────────

function _validateRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('[notebook/store] record must be a non-null object');
  }
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new Error('[notebook/store] record.id must be a non-empty string');
  }
  if (typeof record.title !== 'string') {
    throw new Error('[notebook/store] record.title must be a string');
  }
  if (typeof record.html !== 'string' || record.html.length === 0) {
    throw new Error('[notebook/store] record.html must be a non-empty string; use format.serialize() to produce it');
  }
  if (typeof record.schemaVersion !== 'number') {
    throw new Error('[notebook/store] record.schemaVersion must be a number');
  }
}

// ── Summary projection ────────────────────────────────────────────────────────

function _summaryFields(record) {
  return {
    id:        record.id,
    title:     record.title || '',
    updatedAt: record.updatedAt || '',
  };
}

// ── Store instance ────────────────────────────────────────────────────────────

var _store = makeNamespaceStore({
  namespace:     NOTEBOOKS_NAMESPACE,
  schemaVersion: NOTEBOOK_SCHEMA_VERSION,
  idPrefix:      'nb_',
  validate:      _validateRecord,
  summaryFields: _summaryFields,
});

// ── Public API (names and signatures unchanged) ───────────────────────────────

/**
 * Generate a new unique notebook id.
 * @returns {string}  e.g. "nb_lxyz0abc1234"
 */
export var newNotebookId = _store.newId;

/**
 * Save (create or update) a notebook record.
 *
 * The `html` field MUST be the output of `format.serialize()` — the single
 * canonical writer.  This function does NOT call serialize itself; callers are
 * responsible for producing the text first.
 *
 * `updatedAt` is NOT automatically set — callers must set it before passing.
 *
 * @param {import('../storage/index.js').StorageProvider} provider
 * @param {object} record
 * @throws {Error} on validation failure or provider write failure.
 */
export var saveNotebook = _store.save;

/**
 * Load a notebook record by id.
 * @param {import('../storage/index.js').StorageProvider} provider
 * @param {string} id
 * @returns {object|null}  The Notebook envelope, or null if not found.
 */
export var loadNotebook = _store.load;

/**
 * List all notebooks, returning lightweight summary objects.
 *
 * Returns an array of { id, title, updatedAt } objects suitable for a notebook
 * picker.  Records with a missing or malformed id are silently skipped.
 * Sorted by updatedAt descending.
 *
 * @param {import('../storage/index.js').StorageProvider} provider
 * @returns {Array<{id: string, title: string, updatedAt: string}>}
 */
export var listNotebooks = _store.list;

/**
 * Delete a notebook record by id.
 * No-op if the record does not exist.
 * @param {import('../storage/index.js').StorageProvider} provider
 * @param {string} id
 */
export var deleteNotebook = _store['delete'];
