/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/storage/modules.js — Experiment module (.js text) storage helpers.
 *
 * Defines the Module envelope shape and CRUD helpers that operate on top of
 * any StorageProvider (lib/shim/storage/index.js) using the "files" namespace.
 *
 * ── Module envelope ────────────────────────────────────────────────────────
 *
 *   {
 *     id:            string               — unique identifier (newModuleId())
 *     name:          string               — human-readable module name
 *     language:      'javascript'
 *     source:        string               — the .js module text
 *     templateId:    string|null          — origin experiment id or null if blank
 *     kind:          'frqtl' | 'math'     — which SDK the recipe targets (v2+)
 *     createdAt:     string               — ISO-8601 creation timestamp
 *     updatedAt:     string               — ISO-8601 last-updated timestamp
 *     schemaVersion: number               — integer version (see MODULE_SCHEMA_VERSION,
 *                    the authority; currently 4)
 *     scripts:       string[]             — v4+. OPAQUE frqtl-relative setup-factory
 *                    delta the load path injects (engineRouter.resolve) BEFORE
 *                    eval, so a ferried recipe whose source calls a setup factory
 *                    (a walk-through rung) resolves that window global. `[]`/absent
 *                    for an ordinary saved project (DX-3, the rung-source ferry).
 *     renderState:   object|null          — v3+. Studio's Save realignment
 *                    (WS Studio Controls Realignment §2.6) capture bag —
 *                    everything the .js recipe itself does NOT round-trip:
 *                    renderer/seed (load-time), render capability
 *                    values + camera + backdrop visibility + bind-backed
 *                    page-level control values (runtime replay). Shape owned
 *                    by `lib/features/ide/save-state.js`'s
 *                    `normalizeSavedRenderState` — this module does NOT
 *                    re-validate its internal shape (an optional, best-effort
 *                    replay bag, never load-bearing for the recipe itself);
 *                    `null`/absent is the pre-S6 legacy state and stays
 *                    perfectly valid (R6 discipline extended to v3).
 *   }
 *
 * ── Schema migration ────────────────────────────────────────────────────────
 *
 *   v1 → v2: `kind` field added.  Legacy v1 envelopes (no `kind` field) are
 *   read without error and default to `kind:'frqtl'` (R6 binding: must never
 *   throw on legacy envelopes).  The `kind` field is the ONLY new field (AM-2).
 *
 *   v2 → v3: `renderState` field added (WS Studio Controls Realignment §2.6,
 *   Bite S6). Legacy v1/v2 envelopes (no `renderState` field) are read without
 *   error and default to `renderState: null` (R6 extended) — a saved project
 *   from before this bite simply replays with NO render/camera/page-control
 *   state (byte-identical to its own pre-S6 behavior), never a throw.
 *
 * ── Namespace ──────────────────────────────────────────────────────────────
 *
 *   All helpers use the "files" namespace.  Keys are module ids.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   import { newModuleId, saveModule, loadModule,
 *            listModules, deleteModule } from 'lib/shim/storage/modules.js';
 *   import { getProvider } from 'lib/shim/storage';
 *
 *   const provider = getProvider();
 *
 *   const id = newModuleId();
 *   const mod = {
 *     id,
 *     name: 'My wave experiment',
 *     language: 'javascript',
 *     source: 'function buildExperiment(exp) { ... }',
 *     templateId: 'double-slit',
 *     kind: 'frqtl',          // or 'math' for EGPTMath recipes
 *     createdAt: new Date().toISOString(),
 *     updatedAt: new Date().toISOString(),
 *     schemaVersion: 2,
 *   };
 *   saveModule(provider, mod);
 *
 *   const loaded = loadModule(provider, id);
 *   const all    = listModules(provider);
 *   deleteModule(provider, id);
 */

'use strict';

import { makeNamespaceStore } from './make-namespace-store.js';

/** @type {string} The storage namespace for all module records. */
export var MODULES_NAMESPACE = 'files';

/** @type {number} Current schema version.  Increment on breaking envelope changes. */
export var MODULE_SCHEMA_VERSION = 4;

// ── Envelope validation ────────────────────────────────────────────────────

function _validateModule(mod) {
  if (!mod || typeof mod !== 'object') {
    throw new Error('[modules] module must be a non-null object');
  }
  if (typeof mod.id !== 'string' || mod.id.length === 0) {
    throw new Error('[modules] module.id must be a non-empty string');
  }
  if (typeof mod.name !== 'string' || mod.name.length === 0) {
    throw new Error('[modules] module.name must be a non-empty string');
  }
  if (typeof mod.source !== 'string') {
    throw new Error('[modules] module.source must be a string');
  }
  if (mod.source.length === 0) {
    throw new Error('[modules] module.source must not be empty');
  }
  if (mod.templateId !== null && typeof mod.templateId !== 'string') {
    throw new Error('[modules] module.templateId must be a string or null');
  }
  if (mod.kind !== 'frqtl' && mod.kind !== 'math') {
    throw new Error('[modules] module.kind must be "frqtl" or "math"');
  }
  if (typeof mod.schemaVersion !== 'number') {
    throw new Error('[modules] module.schemaVersion must be a number');
  }
  // renderState (v3+) is OPTIONAL and best-effort (see envelope doc above) —
  // the only shape check here is "object or null/undefined", never a deep
  // validation of its internal fields (that tolerance lives in save-state.js's
  // own normalizeSavedRenderState, applied at REPLAY time, not at save time).
  if (mod.renderState !== undefined && mod.renderState !== null &&
      (typeof mod.renderState !== 'object' || Array.isArray(mod.renderState))) {
    throw new Error('[modules] module.renderState must be an object, null, or omitted');
  }
  // scripts (v4+) is OPTIONAL — an OPAQUE frqtl-relative setup-factory delta the
  // load path injects (engineRouter.resolve) BEFORE eval, so a recipe whose source
  // calls a setup factory (e.g. a ferried walk-through rung) resolves that global.
  // Shape check only: an array of strings, or omitted. The loaders own the
  // resolution + FAIL-LOUD injection, not this schema.
  if (mod.scripts !== undefined && mod.scripts !== null) {
    if (!Array.isArray(mod.scripts) || !mod.scripts.every(function (s) { return typeof s === 'string'; })) {
      throw new Error('[modules] module.scripts must be an array of strings, null, or omitted');
    }
  }
}

// ── v1 → v2 migration ─────────────────────────────────────────────────────

/**
 * Migrate a raw stored envelope to the current schema version.
 * Safe to call on already-current envelopes (idempotent).
 *
 * v1 → v2: default `kind` to `'frqtl'` when the field is absent.
 *   R6 (binding): this must NEVER throw on legacy v1 envelopes.
 *
 * v2 → v3: default `renderState` to `null` when the field is absent (WS
 *   Studio Controls Realignment §2.6, Bite S6). R6 extended: never throw on
 *   a legacy v1/v2 envelope with no `renderState` field.
 *
 * v3 → v4: default `scripts` to `[]` when the field is absent (ws-experiments-
 *   walkthrough DX-3 — the rung-source ferry). R6 extended again: never throw on
 *   a legacy envelope with no `scripts` field (an ordinary saved project has none).
 *
 * @param {object} mod  Raw object from storage.
 * @returns {object}    Envelope at the current schema version.
 */
function _migrate(mod) {
  if (!mod || typeof mod !== 'object') { return mod; }
  var patch = {};
  if (mod.kind === undefined || mod.kind === null) { patch.kind = 'frqtl'; }
  if (mod.renderState === undefined) { patch.renderState = null; }
  if (mod.scripts === undefined) { patch.scripts = []; }
  if (Object.keys(patch).length === 0) { return mod; }
  return Object.assign({}, mod, patch);
}

// ── kind filter ────────────────────────────────────────────────────────────

function _kindFilter(mod, opts) {
  var kindFilter = (opts && opts.kind) ? opts.kind : null;
  if (kindFilter !== null && mod.kind !== kindFilter) { return false; }
  return true;
}

// ── Summary projection ─────────────────────────────────────────────────────

function _summaryFields(mod) {
  // Skip malformed records that are missing required summary fields.
  if (typeof mod.name !== 'string') { return null; }
  return {
    id:         mod.id,
    name:       mod.name,
    kind:       mod.kind,
    templateId: mod.templateId || null,
    updatedAt:  mod.updatedAt  || '',
  };
}

// ── Store instance ─────────────────────────────────────────────────────────

var _store = makeNamespaceStore({
  namespace:     MODULES_NAMESPACE,
  schemaVersion: MODULE_SCHEMA_VERSION,
  idPrefix:      'mod_',
  validate:      _validateModule,
  summaryFields: _summaryFields,
  migrate:       _migrate,
  listFilter:    _kindFilter,
});

// ── Public API (names and signatures unchanged) ────────────────────────────

/**
 * Generate a new unique module id.
 * @returns {string}  e.g. "mod_lxyz0abc1234"
 */
export var newModuleId = _store.newId;

/**
 * Save (create or update) a module.
 * @param {import('./index.js').StorageProvider} provider
 * @param {object} mod
 * @throws {Error} on validation failure or provider write failure.
 */
export var saveModule = _store.save;

/**
 * Load a module by id.
 * Legacy v1 envelopes (no `kind` field) are migrated transparently (R6).
 * @param {import('./index.js').StorageProvider} provider
 * @param {string} id
 * @returns {object|null}
 */
export var loadModule = _store.load;

/**
 * List modules, returning summary objects suitable for a module picker.
 *
 * Returns an array of { id, name, kind, templateId, updatedAt } objects.
 * Sorted by updatedAt descending.
 * AM-2 (binding): filtering via opts.kind — pass to restrict, omit for all.
 *
 * @param {import('./index.js').StorageProvider} provider
 * @param {object}  [opts]
 * @param {'frqtl'|'math'|undefined} [opts.kind]
 * @returns {Array<{id: string, name: string, kind: string, templateId: string|null, updatedAt: string}>}
 */
export var listModules = _store.list;

/**
 * Delete a module by id.  No-op if absent.
 * @param {import('./index.js').StorageProvider} provider
 * @param {string} id
 */
export var deleteModule = _store['delete'];
