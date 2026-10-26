/* Copyright 2023-2026 by Essam Abadir */

/**
 * scene-source.js — the ONE reader of a registry scene as a PROJECT, in a page AND in node.
 *
 * A scene is ONE sketch file, `lib/frqtl/scenes/<file>.js`: a module whose default export is
 * `buildExperiment(exp)`, holding the whole scene (world, parts, render intent). A registry row carries
 * its frqtl-relative PATH (`source: 'scenes/<file>.js'`), never its text. Every consumer that needs the
 * scene (the GYM's rung frame, STUDIO, the hero, a package consumer of `@descix/frqtl-web/registry`) asks
 * here, so the id → path → URL → project chain exists once.
 *
 *   scenePath(rung)                         → 'scenes/<file>.js'   (THROWS on any other shape)
 *   projectOf(scene, { router?, fetch?, mode? })
 *                                           → Promise<{ manifest, files, renderState }>
 *       files       { 'frqtl.json': serializeManifest(manifestFor({ name: row.id, entry: 'sketch.js' })),
 *                     'sketch.js': <the scene file's text> } — the folder a host boots
 *                     (bootProject(mount, { files, mint }, { renderState }), no entry needed)
 *       manifest    that frqtl.json's normalized bag
 *       renderState effectiveRenderState(row, mode) — the registry's one derivation, ferried BESIDE the folder
 *                   (boot facts never enter frqtl.json or the project identity)
 *
 * `scene` is a rung id (resolved by `walkthroughById`; an unknown id REJECTS naming the declared ids) or a
 * row (`{id, source}`, e.g. `EMPTY_SCENE`). The URL comes from a router, the one path authority
 * (lib/shim/engine/router.js, `scenes/` profile key):
 *   - `opts.router` — the host's own (the IDE's engineRouter); a host always passes it.
 *   - absent — the PACKAGE's: the dist layout anchored at the dist root this module ships in
 *     (`PACKAGE_ROOT_FROM_HERE`, dist/shim/registry/ → dist/). This is the `@descix/frqtl-web/registry`
 *     door's reader; in the source tree it names a file that is not there and rejects.
 * The read is lib/shim/project/read-text.js readText (a capability split on the resolved URL: a `file:` URL
 * through node's fs, anything else fetched).
 *
 * FAIL-LOUD: an unknown id, a row without a scenes/ path, an undeclared mode, a non-200 response, an
 * unreadable file or an empty body REJECTS naming the scene and the URL. A blank scene is never a result.
 *
 * Zero physics: this moves text. The scene's physics is whatever its file composes.
 */

'use strict';

import { WALKTHROUGH, walkthroughById, effectiveRenderState } from './walkthrough.js';
import { engineRouter } from '../engine/router.js';
import { MANIFEST_FILE, manifestFor, serializeManifest } from '../project/manifest.js';
import { SKETCH_ENTRY } from '../project/link.js';
import { readText } from '../project/read-text.js';

/** The one path prefix a scene file lives under (the router's `scenes/` profile key). */
export var SCENES_PREFIX = 'scenes/';

/**
 * Where the package's dist root sits relative to this module once shipped: build.js places
 * lib/shim/ at dist/shim/ (sdk/_build/lib-dist-placement.cjs), so this file is
 * dist/shim/registry/scene-source.js. verify-publish-surface reads every rung through it on the
 * built dist, so a moved placement fails there.
 */
var PACKAGE_ROOT_FROM_HERE = '../../';

/**
 * The blank world — STUDIO's "Empty Universe" — is itself a scene file (the empty page states no
 * world of its own). A row-shaped handle so it reads through the same `projectOf`.
 */
export var EMPTY_SCENE = Object.freeze({ id: 'empty', source: 'scenes/empty.js' });

var OPT_KEYS = ['router', 'fetch', 'mode'];

/**
 * @param {{id?:string, source?:string}} rung — a registry row.
 * @returns {string} the frqtl-relative scene path.
 */
export function scenePath(rung) {
    var src = rung && rung.source;
    if (typeof src !== 'string' || src.indexOf(SCENES_PREFIX) !== 0 || !/\.js$/.test(src)) {
        throw new Error('[scene-source] rung "' + (rung && rung.id) + '" declares source ' +
            JSON.stringify(src) + ' — a scene row carries the path of its sketch file, ' +
            "'scenes/<file>.js' (lib/frqtl/scenes/). (FAIL-LOUD.)");
    }
    return src;
}

function _rowOf(scene) {
    if (typeof scene === 'string') {
        var rung = walkthroughById(scene);
        if (!rung) {
            throw new Error('[scene-source] unknown rung id "' + scene + '" — declared ids: [' +
                WALKTHROUGH.map(function (r) { return r.id; }).join(', ') + ']. (FAIL-LOUD.)');
        }
        return rung;
    }
    if (!scene || typeof scene !== 'object') {
        throw new Error('[scene-source] projectOf takes a rung id or a registry row, got ' +
            JSON.stringify(scene) + '. (FAIL-LOUD.)');
    }
    return scene;
}

function _packageRouter() {
    var root = new URL(PACKAGE_ROOT_FROM_HERE, import.meta.url).href.replace(/\/$/, '');
    return engineRouter({ mode: 'cdn', base: root });
}

/**
 * A registry scene as the project folder a host boots, with the host's boot bag beside it.
 * @param {string|{id:string, source:string}} scene — a rung id, or a registry row.
 * @param {{router?:{resolve:function(string):string}, fetch?:function, mode?:string|null}} [opts]
 *   router — the host's engineRouter (absent: the package's own dist root);
 *   fetch  — the fetch used for a non-file URL (defaults to the global; injectable for tests);
 *   mode   — a declared walk-through mode (absent: the rung's default) for the renderState.
 * @returns {Promise<{manifest: object, files: Object<string,string>, renderState: object}>}
 */
export function projectOf(scene, opts) {
    return Promise.resolve().then(function () {
        opts = opts || {};
        Object.keys(opts).forEach(function (k) {
            if (OPT_KEYS.indexOf(k) === -1) {
                throw new Error('[scene-source] projectOf has no option "' + k + '" — options: ' +
                    OPT_KEYS.join(', ') + '. (FAIL-LOUD.)');
            }
        });
        var row = _rowOf(scene);
        var rel = scenePath(row);
        var renderState = effectiveRenderState(row, opts.mode);   // an undeclared mode rejects before the read
        var router = opts.router || _packageRouter();
        if (typeof router.resolve !== 'function') {
            throw new Error('[scene-source] opts.router has no resolve() — pass an engineRouter ' +
                '(lib/shim/engine/router.js) to resolve ' + rel + '. (FAIL-LOUD.)');
        }
        var url = router.resolve(rel);
        return readText(url, { fetch: opts.fetch }).catch(function (e) {
            throw new Error('[scene-source] scene "' + row.id + '" — ' + ((e && e.message) || e) + '. (FAIL-LOUD.)');
        }).then(function (t) {
            if (typeof t !== 'string' || !t.trim()) {
                throw new Error('[scene-source] scene "' + row.id + '" — ' + url +
                    ' has an empty body. (FAIL-LOUD.)');
            }
            var manifest = manifestFor({ name: row.id, entry: SKETCH_ENTRY });
            var files = {};
            files[MANIFEST_FILE] = serializeManifest(manifest);
            files[SKETCH_ENTRY] = t;
            return { manifest: manifest, files: files, renderState: renderState };
        });
    });
}
