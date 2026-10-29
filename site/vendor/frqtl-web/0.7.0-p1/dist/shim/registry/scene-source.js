/* Copyright 2023-2026 by Essam Abadir */

/**
 * scene-source.js — the ONE reader of a scene as a PROJECT, in a page AND in node.
 *
 * A scene is ONE sketch file: a module whose default export is `buildExperiment(exp)`, holding the whole scene
 * (world, parts, render intent). A host's roster names each scene's file relative to the roster
 * (roster.js::sceneUrlOf); the Empty Universe is the package's own sketch
 * (lib/frqtl/experiments/_shared/empty-sketch.js), read through the router like any package file.
 *
 *   projectOf(roster, id, { fetch?, mode? })  → Promise<{ manifest, files, renderState }>
 *       files       { 'frqtl.json': serializeManifest(manifestFor({ name: id, entry: 'sketch.js' })),
 *                     'sketch.js': <the scene file's text> } — the folder a host boots
 *       manifest    that frqtl.json's normalized bag
 *       renderState effectiveRenderState(row, mode) — boot facts ride BESIDE the folder, never in frqtl.json
 *   emptyProjectOf({ router, fetch? })        → the same shape for the Empty Universe (name EMPTY_PROJECT_NAME,
 *                                               renderState normalizeSavedRenderState({}))
 *   EMPTY_PROJECT_NAME                        'empty'
 *   EMPTY_SKETCH_PATH                         the Empty Universe's router path (a package builder places that file
 *                                             in every dist this module ships in: sdk/_build/hosts.mjs)
 *
 * The read is lib/shim/project/read-text.js readText (a `file:` URL through node's fs, anything else fetched).
 *
 * FAIL-LOUD: a non-bag roster, an undeclared id or mode, an unknown option, a non-200, an unreadable file or an
 * empty body REJECTS naming the scene and the URL. A blank scene is never a result.
 *
 * Zero physics: this moves text. The scene's physics is whatever its file composes.
 */

'use strict';

import { assertRosterBag, walkthroughById, effectiveRenderState, sceneUrlOf } from './roster.js';
import { normalizeSavedRenderState } from '../render-state/index.js';
import { MANIFEST_FILE, manifestFor, serializeManifest } from '../project/manifest.js';
import { SKETCH_ENTRY } from '../project/link.js';
import { readText } from '../project/read-text.js';

/** The project name of the Empty Universe (its frqtl.json `name`). */
export const EMPTY_PROJECT_NAME = 'empty';

/** The Empty Universe's sketch, a lib-identity path every router profile resolves. */
export const EMPTY_SKETCH_PATH = 'experiments/_shared/empty-sketch.js';

const PROJECT_OF = 'projectOf(roster, id, { fetch, mode })';
const EMPTY_PROJECT_OF = 'emptyProjectOf({ router, fetch })';

function assertOpts(opts, allowed, signature) {
    const o = opts === undefined ? {} : opts;
    if (o === null || typeof o !== 'object' || Array.isArray(o)) {
        throw new Error('[scene-source] ' + signature + ': options are an object (got ' + JSON.stringify(opts) + '). (FAIL-LOUD.)');
    }
    Object.keys(o).forEach((k) => {
        if (allowed.indexOf(k) === -1) {
            throw new Error('[scene-source] ' + signature + ' has no option "' + k + '" — options: ' + allowed.join(', ') +
                (k === 'router' ? '; a roster scene\'s URL is sceneUrlOf(roster, row), not a router path' : '') + '. (FAIL-LOUD.)');
        }
    });
    return o;
}

function folderOf(name, url, label, opts, renderState) {
    return readText(url, { fetch: opts.fetch }).catch((e) => {
        throw new Error('[scene-source] ' + label + ' — ' + ((e && e.message) || e) + '. (FAIL-LOUD.)');
    }).then((t) => {
        if (typeof t !== 'string' || !t.trim()) {
            throw new Error('[scene-source] ' + label + ' — ' + url + ' has an empty body. (FAIL-LOUD.)');
        }
        const manifest = manifestFor({ name, entry: SKETCH_ENTRY });
        const files = {};
        files[MANIFEST_FILE] = serializeManifest(manifest);
        files[SKETCH_ENTRY] = t;
        return { manifest, files, renderState };
    });
}

/**
 * A roster scene as the project folder a host boots, with its renderState beside it.
 * @param {object} roster  a normalized roster bag (roster.js normalizeRoster / roster-link.js loadRoster)
 * @param {string} id      a scene id the roster declares
 * @param {{fetch?: function, mode?: string|null}} [opts]  fetch: injectable for a non-file URL; mode: a declared
 *   mode of the scene (absent: its default) for the renderState
 * @returns {Promise<{manifest: object, files: Object<string,string>, renderState: object}>}
 */
export function projectOf(roster, id, opts) {
    return Promise.resolve().then(() => {
        assertRosterBag(roster, PROJECT_OF);
        const o = assertOpts(opts, ['fetch', 'mode'], PROJECT_OF);
        if (typeof id !== 'string' || id === '') {
            throw new Error('[scene-source] ' + PROJECT_OF + ' takes a scene id string (got ' + JSON.stringify(id) + '). (FAIL-LOUD.)');
        }
        const row = walkthroughById(roster, id);
        if (!row) {
            throw new Error('[scene-source] ' + PROJECT_OF + ': "' + id + '" is not a declared scene — declared: [' +
                roster.rows.map((r) => r.id).join(', ') + ']. (FAIL-LOUD.)');
        }
        const renderState = effectiveRenderState(row, o.mode);   // an undeclared mode rejects before the read
        return folderOf(row.id, sceneUrlOf(roster, row), 'scene "' + row.id + '"', o, renderState);
    });
}

/**
 * The Empty Universe as a project folder: the package sketch read through the host's router.
 * @param {{router: {resolve: function(string): string}, fetch?: function}} opts
 * @returns {Promise<{manifest: object, files: Object<string,string>, renderState: object}>}
 */
export function emptyProjectOf(opts) {
    return Promise.resolve().then(() => {
        const o = assertOpts(opts, ['router', 'fetch'], EMPTY_PROJECT_OF);
        if (!o.router || typeof o.router.resolve !== 'function') {
            throw new Error('[scene-source] ' + EMPTY_PROJECT_OF + ' needs the host\'s engineRouter ' +
                '(lib/shim/engine/router.js) to resolve ' + EMPTY_SKETCH_PATH + '. (FAIL-LOUD.)');
        }
        const url = o.router.resolve(EMPTY_SKETCH_PATH);
        return folderOf(EMPTY_PROJECT_NAME, url, 'the Empty Universe', o, normalizeSavedRenderState({}));
    });
}
