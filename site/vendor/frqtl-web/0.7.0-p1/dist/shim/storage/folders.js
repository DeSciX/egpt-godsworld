/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/storage/folders.js — THE owner of a project saved in browser storage: one project = one folder.
 *
 * A project is a folder of files: `frqtl.json` (its owner is
 * lib/shim/project/manifest.js), the entry sketch it names, and whatever else the author keeps beside them.
 * The stored ROW is the folder plus the host's boot bag, and nothing else:
 *
 *   FOLDER_ROW_KEYS = ['files', 'renderState']
 *     files        { path: text } — text only (a binary value is refused by name); every path through
 *                  lib/shim/project/identity.js checkProjectPath, the one path rule; a root `index.html` is
 *                  refused (EXPORT_PAGE: the Export writes it); `frqtl.json` is required and read by its owner.
 *     renderState  the host's boot bag (STUDIO's capture, a rung's effectiveRenderState), normalized by its one
 *                  owner (lib/shim/render-state normalizeSavedRenderState) and ferried — never re-listed here.
 *                  Boot facts live beside the folder, never in frqtl.json.
 *
 * The key is the manifest `name`, in FOLDERS_NAMESPACE. Exports:
 *
 *   normalizeFolderRow(row)                    → the frozen row (the one validation every reader and writer uses)
 *   folderNameOf(row)                          → its frqtl.json name
 *   saveFolder(provider, row)                  → name   Save: write the folder under its own name (overwrites)
 *   saveFolderAs(provider, row, newName)       → newName Save As: frqtl.json's name rewritten through
 *                                                serializeManifest; REFUSED when newName is taken
 *   copyFolder(provider, name, newName)        → newName a stored folder copied (saveFolderAs over loadFolder)
 *   loadFolder(provider, name)                 → row | null
 *   listFolders(provider)                      → [{ name }] in ascending name order
 *   deleteFolder(provider, name)
 *
 * Retired saves (DESCIX IS NOT LIVE; there is no migration tool): the namespaces RETIRED_NAMESPACES (owned by
 * the storage seam, index.js, which refuses a write into one) held the v4 module envelope and the design
 * envelope. They are never read and never converted:
 *
 *   retiredSaves(provider)                     → [{ namespace, key }] — every key in a retired namespace
 *   deleteRetiredSaves(provider, saves)        → the count deleted — EXACTLY the listed keys (each must be in a
 *                                                retired namespace); nothing else is touched
 *
 * FAIL-LOUD: every refusal names the rule it applies. Layer 2 (physics): none — this stores text.
 */

'use strict';

import { RETIRED_NAMESPACES, checkStorageKey } from './index.js';
import { checkProjectPath } from '../project/identity.js';
import { MANIFEST_FILE, parseManifest, serializeManifest } from '../project/manifest.js';
import { normalizeSavedRenderState } from '../render-state/index.js';

export { RETIRED_NAMESPACES };

/** The storage namespace every project folder is saved under. */
export var FOLDERS_NAMESPACE = 'project-folders';

/** The stored row's keys — the folder and the host's boot bag. */
export var FOLDER_ROW_KEYS = Object.freeze(['files', 'renderState']);

/** The root page the Export generates (lib/shim/bundle) — reserved, so a folder never holds one. */
export var EXPORT_PAGE = 'index.html';

function _fail(msg) {
    throw new Error('[folders] ' + msg + ' (FAIL-LOUD.)');
}

function _isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

/**
 * @param {{files: Object<string,string>, renderState?: object|null}} row
 * @returns {Readonly<{files: Readonly<Object<string,string>>, renderState: object}>}
 */
export function normalizeFolderRow(row) {
    if (!_isPlainObject(row)) {
        _fail('a project folder row is { ' + FOLDER_ROW_KEYS.join(', ') + ' } (got ' +
            (row === null ? 'null' : Array.isArray(row) ? 'an array' : typeof row) + ').');
    }
    var unknown = Object.keys(row).filter(function (k) { return FOLDER_ROW_KEYS.indexOf(k) === -1; });
    if (unknown.length) {
        _fail('unknown key ' + unknown.map(function (k) { return JSON.stringify(k); }).join(', ') +
            ' — a project folder row holds exactly FOLDER_ROW_KEYS (lib/shim/storage/folders.js): ' +
            FOLDER_ROW_KEYS.join(', ') + '.');
    }
    var files = row.files;
    if (!_isPlainObject(files) || Object.keys(files).length === 0) {
        _fail('"files" is the folder { path: text } with at least ' + MANIFEST_FILE + ' (got ' +
            (_isPlainObject(files) ? 'an empty map' : typeof files) + ').');
    }
    var out = {};
    Object.keys(files).forEach(function (p) {
        checkProjectPath(p);
        if (p === EXPORT_PAGE) {
            _fail('"' + EXPORT_PAGE + '" at the folder root is reserved — the Export generates it (the host page ' +
                'that carries the boot bag); a project folder never holds one.');
        }
        if (typeof files[p] !== 'string') {
            _fail('"' + p + '" is not text (got ' + (files[p] instanceof Uint8Array ? 'bytes' : typeof files[p]) +
                ') — a project folder holds text files only.');
        }
        out[p] = files[p];
    });
    if (typeof out[MANIFEST_FILE] !== 'string') {
        _fail('the folder carries no ' + MANIFEST_FILE + ' — a project folder is named and entered by its manifest ' +
            '(lib/shim/project/manifest.js manifestFor({ name, entry }) writes one).');
    }
    var name = parseManifest(out[MANIFEST_FILE]).name;
    checkStorageKey(name, 'a project folder name (frqtl.json "name")');
    return Object.freeze({ files: Object.freeze(out), renderState: normalizeSavedRenderState(row.renderState) });
}

/** @param {object} row @returns {string} the folder's frqtl.json name */
export function folderNameOf(row) {
    return parseManifest(normalizeFolderRow(row).files[MANIFEST_FILE]).name;
}

function _stored(row) {
    return { files: Object.assign({}, row.files), renderState: row.renderState };
}

/**
 * Save: write the folder under its own frqtl.json name, overwriting that name's folder.
 * @returns {string} the name
 */
export function saveFolder(provider, row) {
    var n = normalizeFolderRow(row);
    var name = parseManifest(n.files[MANIFEST_FILE]).name;
    provider.put(FOLDERS_NAMESPACE, name, _stored(n));
    return name;
}

/**
 * Save As: the folder under `newName` — frqtl.json's name rewritten through serializeManifest (the one writer).
 * REFUSED when a folder named `newName` is already saved.
 * @returns {string} newName
 */
export function saveFolderAs(provider, row, newName) {
    checkStorageKey(newName, 'a project folder name');
    var n = normalizeFolderRow(row);
    if (provider.get(FOLDERS_NAMESPACE, newName) !== null) {
        _fail('a project named "' + newName + '" is already saved — Save As takes a name no saved project has ' +
            '(choose another, or delete the saved one first).');
    }
    var files = Object.assign({}, n.files);
    files[MANIFEST_FILE] = serializeManifest(Object.assign({}, parseManifest(n.files[MANIFEST_FILE]), { name: newName }));
    var renamed = normalizeFolderRow({ files: files, renderState: n.renderState });
    provider.put(FOLDERS_NAMESPACE, newName, _stored(renamed));
    return newName;
}

/** A stored folder copied under `newName` (frqtl.json's name rewritten); refuses a taken name or a missing source. */
export function copyFolder(provider, name, newName) {
    var row = loadFolder(provider, name);
    if (!row) { _fail('no saved project named "' + name + '" to copy.'); }
    return saveFolderAs(provider, row, newName);
}

/** @returns {Readonly<object>|null} the normalized row, or null when no folder has that name */
export function loadFolder(provider, name) {
    checkStorageKey(name, 'a project folder name');
    var raw = provider.get(FOLDERS_NAMESPACE, name);
    if (raw === null || raw === undefined) { return null; }
    var row;
    try { row = normalizeFolderRow(raw); }
    catch (e) { _fail('the saved project "' + name + '" is not a project folder row: ' + ((e && e.message) || e)); }
    var stored = parseManifest(row.files[MANIFEST_FILE]).name;
    if (stored !== name) {
        _fail('the saved project under "' + name + '" names itself "' + stored + '" in ' + MANIFEST_FILE +
            ' — a folder is keyed by its manifest name.');
    }
    return row;
}

/** @returns {Array<{name: string}>} every saved folder, ascending by name */
export function listFolders(provider) {
    return provider.list(FOLDERS_NAMESPACE).map(function (e) { return e.key; }).sort().map(function (k) {
        return { name: k };
    });
}

export function deleteFolder(provider, name) {
    checkStorageKey(name, 'a project folder name');
    provider['delete'](FOLDERS_NAMESPACE, name);
}

/** @returns {Array<{namespace: string, key: string}>} every key in a retired namespace (never read) */
export function retiredSaves(provider) {
    var out = [];
    RETIRED_NAMESPACES.forEach(function (ns) {
        provider.list(ns).forEach(function (e) { out.push({ namespace: ns, key: e.key }); });
    });
    return out;
}

/**
 * Delete exactly `saves` (retiredSaves' rows); a row outside a retired namespace is refused before anything
 * is deleted.
 * @returns {number} the count deleted
 */
export function deleteRetiredSaves(provider, saves) {
    if (!Array.isArray(saves)) { _fail('deleteRetiredSaves(provider, saves): saves is retiredSaves(provider)\'s list.'); }
    saves.forEach(function (s) {
        if (!s || RETIRED_NAMESPACES.indexOf(s.namespace) === -1 || typeof s.key !== 'string') {
            _fail('deleteRetiredSaves deletes only retired saves ({ namespace in [' + RETIRED_NAMESPACES.join(', ') +
                '], key }) — got ' + JSON.stringify(s) + '.');
        }
    });
    saves.forEach(function (s) { provider['delete'](s.namespace, s.key); });
    return saves.length;
}
