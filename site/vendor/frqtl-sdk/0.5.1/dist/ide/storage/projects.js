/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/storage/projects.js — Project-envelope helpers.
 *
 * Defines the Project envelope shape and CRUD helpers that operate on top of
 * any StorageProvider (lib/shim/storage/index.js) using the "projects"
 * namespace.
 *
 * ── Project envelope ───────────────────────────────────────────────────────
 *
 *   {
 *     id:            string    — UUID-style unique identifier (newProjectId())
 *     name:          string    — human-readable project name
 *     templateId:    string|null — origin experiment id ("double-slit",
 *                                  "blackbody", etc.) or null if blank
 *     createdAt:     string    — ISO-8601 creation timestamp
 *     updatedAt:     string    — ISO-8601 last-updated timestamp
 *     schemaVersion: number    — integer version; currently 1
 *     design:        object    — opaque JSON authored by AuthorView
 *                                (do NOT interpret here — that is the
 *                                 AuthorView workstream's responsibility)
 *   }
 *
 * ── Namespace ──────────────────────────────────────────────────────────────
 *
 *   All helpers use the "projects" namespace.  Keys are project ids.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   import { newProjectId, saveProject, loadProject,
 *            listProjects, deleteProject } from 'lib/shim/storage/projects.js';
 *   import { getProvider } from 'lib/shim/storage';
 *
 *   const provider = getProvider();
 *
 *   const id = newProjectId();
 *   const project = {
 *     id,
 *     name: 'My first project',
 *     templateId: 'double-slit',
 *     createdAt: new Date().toISOString(),
 *     updatedAt: new Date().toISOString(),
 *     schemaVersion: 1,
 *     design: {},
 *   };
 *   saveProject(provider, project);
 *
 *   const loaded = loadProject(provider, id);
 *   const all    = listProjects(provider);
 *   deleteProject(provider, id);
 */

'use strict';

import { makeNamespaceStore } from './make-namespace-store.js';

/** @type {string} The storage namespace for all project records. */
export var PROJECTS_NAMESPACE = 'projects';

/** @type {number} Current schema version.  Increment on breaking envelope changes. */
export var PROJECT_SCHEMA_VERSION = 1;

// ── Envelope validation ────────────────────────────────────────────────────

function _validateProject(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('[projects] project must be a non-null object');
  }
  if (typeof project.id !== 'string' || project.id.length === 0) {
    throw new Error('[projects] project.id must be a non-empty string');
  }
  if (typeof project.name !== 'string' || project.name.length === 0) {
    throw new Error('[projects] project.name must be a non-empty string');
  }
  if (project.templateId !== null && typeof project.templateId !== 'string') {
    throw new Error('[projects] project.templateId must be a string or null');
  }
  if (typeof project.schemaVersion !== 'number') {
    throw new Error('[projects] project.schemaVersion must be a number');
  }
  if (typeof project.design !== 'object' || project.design === null) {
    throw new Error('[projects] project.design must be a non-null object');
  }
}

// ── Summary projection ─────────────────────────────────────────────────────

function _summaryFields(project) {
  // Skip malformed records that are missing required summary fields.
  if (typeof project.name !== 'string') { return null; }
  return {
    id:         project.id,
    name:       project.name,
    templateId: project.templateId || null,
    updatedAt:  project.updatedAt  || '',
  };
}

// ── Store instance ─────────────────────────────────────────────────────────

var _store = makeNamespaceStore({
  namespace:     PROJECTS_NAMESPACE,
  schemaVersion: PROJECT_SCHEMA_VERSION,
  idPrefix:      'proj_',
  validate:      _validateProject,
  summaryFields: _summaryFields,
});

// ── Public API (names and signatures unchanged) ────────────────────────────

/**
 * Generate a new unique project id.
 * @returns {string}  e.g. "proj_lxyz0abc1234"
 */
export var newProjectId = _store.newId;

/**
 * Save (create or update) a project.
 * @param {import('./index.js').StorageProvider} provider
 * @param {object} project
 * @throws {Error} on validation failure or provider write failure.
 */
export var saveProject = _store.save;

/**
 * Load a project by id.
 * @param {import('./index.js').StorageProvider} provider
 * @param {string} id
 * @returns {object|null}
 */
export var loadProject = _store.load;

/**
 * List all projects, returning summary objects suitable for a project picker.
 *
 * Returns an array of { id, name, templateId, updatedAt } objects.
 * Sorted by updatedAt descending.
 *
 * @param {import('./index.js').StorageProvider} provider
 * @returns {Array<{id: string, name: string, templateId: string|null, updatedAt: string}>}
 */
export var listProjects = _store.list;

/**
 * Delete a project by id.  No-op if absent.
 * @param {import('./index.js').StorageProvider} provider
 * @param {string} id
 */
export var deleteProject = _store['delete'];
