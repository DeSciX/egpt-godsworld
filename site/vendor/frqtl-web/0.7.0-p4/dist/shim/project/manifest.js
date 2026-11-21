/* Copyright 2023-2026 by Essam Abadir */

/**
 * manifest.js — THE owner of `frqtl.json`, the one file a host reads first in a project folder.
 *
 *   MANIFEST_FILE                 'frqtl.json' — its path at the project root
 *   MANIFEST_KEYS                 the typed key table, in the order a manifest is written
 *   normalizeManifest(partial)    → the full bag (frozen, keys in MANIFEST_KEYS order; an absent optional key
 *                                   stays absent). THROWS on an unknown key, a missing required key, a value
 *                                   of the wrong type or outside its row's rule — each naming the key.
 *   parseManifest(text)           strict JSON → normalizeManifest. Any valid JSON formatting reads.
 *   serializeManifest(bag)        JSON.stringify(the normalized bag, null, 2) + '\n' — THE writer of every
 *                                   system-made manifest (one-file Import, Save As, projectOf).
 *   manifestFor({ name, entry })  the one constructor of a fresh bag: kind 'scene', no version.
 *
 * A manifest holds what the folder IS — its name, its kind, its entry module, the author's own version
 * string — and nothing about how a host boots it: display, seed, camera and render rows are the HOST's
 * renderState, kept beside the folder, never in this file. `version` is never interpreted.
 *
 * Consumers ferry the normalized bag; none re-lists these keys (gate: lib/shim/project/test/manifest.test.mjs,
 * driven off MANIFEST_KEYS).
 */

import { checkProjectPath } from './identity.js';

/** The manifest's path at the project root. */
export const MANIFEST_FILE = 'frqtl.json';

function _fail(msg) {
    throw new Error('[' + MANIFEST_FILE + '] ' + msg + ' (FAIL-LOUD.)');
}

function _keyList() {
    return MANIFEST_KEYS.map(function (r) { return r.key; }).join(', ');
}

/**
 * THE typed key table. Each row: `key`; `type` (the JSON type of its value); `required`; `rule` (a
 * sentence naming what a legal value is); `check(value)` — throws naming the key when the value breaks
 * the rule (the type is checked first, from `type`).
 * @type {ReadonlyArray<{key: string, type: 'string', required: boolean, rule: string, check: function(*): void}>}
 */
export const MANIFEST_KEYS = Object.freeze([
    Object.freeze({
        key: 'name', type: 'string', required: true,
        rule: 'a non-empty string — the project\'s name',
        check: function (v) {
            if (v.length === 0) { _fail('"name" is empty — a project\'s name is a non-empty string.'); }
        }
    }),
    Object.freeze({
        key: 'kind', type: 'string', required: true,
        rule: '"scene" (a notebook project, "notebook", comes with P5)',
        check: function (v) {
            if (v === 'notebook') {
                _fail('"kind": "notebook" — a notebook project comes with P5 (notebooks on projects); a project ' +
                    'today is "kind": "scene".');
            }
            if (v !== 'scene') {
                _fail('"kind": ' + JSON.stringify(v) + ' is not a project kind — "scene", or "notebook" (P5).');
            }
        }
    }),
    Object.freeze({
        key: 'entry', type: 'string', required: true,
        rule: 'a root-relative project path ending ".js" — the module whose default export is buildExperiment(exp)',
        check: function (v) {
            try { checkProjectPath(v); }
            catch (e) { _fail('"entry": ' + String((e && e.message) || e)); }
            if (!v.endsWith('.js')) {
                _fail('"entry": ' + JSON.stringify(v) + ' does not end ".js" — the entry is the project module whose ' +
                    'default export is buildExperiment(exp).');
            }
        }
    }),
    Object.freeze({
        key: 'version', type: 'string', required: false,
        rule: 'the author\'s own string, never interpreted (optional)',
        check: function () {}
    })
]);

/**
 * @param {object} partial — the manifest's keys (an absent optional key, or one whose value is undefined, is absent)
 * @returns {Readonly<{name: string, kind: 'scene', entry: string, version?: string}>}
 */
export function normalizeManifest(partial) {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
        _fail('a manifest is an object { ' + _keyList() + ' } (got ' +
            (Array.isArray(partial) ? 'an array' : partial === null ? 'null' : typeof partial) + ').');
    }
    const known = MANIFEST_KEYS.map(function (r) { return r.key; });
    const unknown = Object.keys(partial).filter(function (k) { return known.indexOf(k) === -1; });
    if (unknown.length) {
        _fail('unknown key' + (unknown.length > 1 ? 's ' : ' ') + unknown.map(function (k) { return JSON.stringify(k); }).join(', ') +
            ' — a manifest holds exactly MANIFEST_KEYS (lib/shim/project/manifest.js): ' + _keyList() +
            '. How a host boots the folder (display, seed, camera, render rows) is its renderState, kept beside the folder.');
    }
    const bag = {};
    for (const row of MANIFEST_KEYS) {
        const v = partial[row.key];
        if (v === undefined) {
            if (row.required) { _fail('"' + row.key + '" is REQUIRED — ' + row.rule + '.'); }
            continue;
        }
        if (typeof v !== row.type) {
            _fail('"' + row.key + '" is ' + (v === null ? 'null' : typeof v) + ' — ' + row.rule + '.');
        }
        row.check(v);
        bag[row.key] = v;
    }
    return Object.freeze(bag);
}

/**
 * @param {string} text — the bytes of frqtl.json, decoded
 * @returns {Readonly<object>} the normalized bag
 */
export function parseManifest(text) {
    if (typeof text !== 'string') {
        _fail('parseManifest(text): the text of ' + MANIFEST_FILE + ' (got ' + typeof text + ').');
    }
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { _fail('is not valid JSON: ' + String((e && e.message) || e) + '.'); }
    return normalizeManifest(raw);
}

/**
 * @param {object} bag — normalized here first, so the writer never writes a manifest its reader refuses
 * @returns {string}
 */
export function serializeManifest(bag) {
    return JSON.stringify(normalizeManifest(bag), null, 2) + '\n';
}

/**
 * @param {{name: string, entry: string}} spec
 * @returns {Readonly<object>} the normalized bag { name, kind: 'scene', entry }
 */
export function manifestFor(spec) {
    if (!spec || typeof spec !== 'object') {
        _fail('manifestFor({ name, entry }) (got ' + (spec === null ? 'null' : typeof spec) + ').');
    }
    const stray = Object.keys(spec).filter(function (k) { return k !== 'name' && k !== 'entry'; });
    if (stray.length) {
        _fail('manifestFor({ name, entry }) takes the name and the entry only (got ' + stray.join(', ') +
            ') — a fresh project is kind "scene" with no version; any other bag goes through normalizeManifest.');
    }
    return normalizeManifest({ name: spec.name, kind: 'scene', entry: spec.entry });
}
