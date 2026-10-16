/* Copyright 2023-2026 by Essam Abadir */

/**
 * scene-source.js — the ONE reader of a scene's sketch file, in a page AND in node.
 *
 * A scene is ONE file, `lib/frqtl/scenes/<file>.js`: a dual-mode `buildExperiment(exp)`
 * module holding the whole scene (world, parts, render intent). A registry row carries
 * its frqtl-relative PATH (`source: 'scenes/<file>.js'`), never its text. Every consumer
 * that needs the text (the GYM's rung frame, STUDIO, the hero, a package consumer of
 * `@descix/frqtl-sdk/registry`) asks here, so the id → path → URL → text chain exists once.
 *
 *   scenePath(rung)                → 'scenes/<file>.js'   (THROWS on any other shape)
 *   loadSceneSource(scene, opts?)  → Promise<string>      (the file's text)
 *
 * `scene` is a rung id (resolved by `walkthroughById`; an unknown id REJECTS naming the
 * declared ids) or a row (`{id, source}`, e.g. `EMPTY_SCENE`). The URL comes from a router,
 * the one path authority (lib/shim/engine/router.js, `scenes/` profile key):
 *   - `opts.router` — the host's own (the IDE's engineRouter); a host always passes it.
 *   - absent — the PACKAGE's: the dist layout anchored at the dist root this module ships
 *     in (`PACKAGE_ROOT_FROM_HERE`, dist/ide/registry/ → dist/). This is the
 *     `@descix/frqtl-sdk/registry` door's reader; in the source tree it names a file that
 *     is not there and rejects.
 * The read is a CAPABILITY split on the resolved URL, never a host sniff: a `file:` URL is
 * read through node's fs (`process.getBuiltinModule`), anything else is fetched.
 *
 * FAIL-LOUD: an unknown id, a row without a scenes/ path, a non-200 response, an unreadable
 * file or an empty body REJECTS naming the scene and the URL. A blank scene is never a result.
 *
 * Zero physics: this moves text. The scene's physics is whatever its file composes.
 */

'use strict';

import { WALKTHROUGH, walkthroughById } from './walkthrough.js';
import { engineRouter } from '../engine/router.js';

/** The one path prefix a scene file lives under (the router's `scenes/` profile key). */
export var SCENES_PREFIX = 'scenes/';

/**
 * Where the package's dist root sits relative to this module once shipped: build.js places
 * lib/shim/ at dist/ide/ (sdk/frqtl-sdk/scripts/lib-dist-placement.js), so this file is
 * dist/ide/registry/scene-source.js. verify-publish-surface reads every rung through it on the
 * built dist, so a moved placement fails there.
 */
var PACKAGE_ROOT_FROM_HERE = '../../';

/**
 * The blank world — STUDIO's "Empty Universe" — is itself a scene file (the empty page states no
 * world of its own). A row-shaped handle so it reads through the same `loadSceneSource`.
 */
export var EMPTY_SCENE = Object.freeze({ id: 'empty', source: 'scenes/empty.js' });

var OPT_KEYS = ['router', 'fetch'];

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
        throw new Error('[scene-source] loadSceneSource takes a rung id or a registry row, got ' +
            JSON.stringify(scene) + '. (FAIL-LOUD.)');
    }
    return scene;
}

function _packageRouter() {
    var root = new URL(PACKAGE_ROOT_FROM_HERE, import.meta.url).href.replace(/\/$/, '');
    return engineRouter({ mode: 'cdn', base: root });
}

function _readFileUrl(url, id) {
    var proc = globalThis.process;
    var getBuiltin = proc && proc.getBuiltinModule;
    if (typeof getBuiltin !== 'function') {
        throw new Error('[scene-source] scene "' + id + '" resolves to ' + url + ', a file: URL; reading ' +
            'one needs node\'s process.getBuiltinModule (Node 20.16+ / 22.3+). In a page, serve the ' +
            'package over http. (FAIL-LOUD.)');
    }
    var fs = getBuiltin('node:fs');
    var fileURLToPath = getBuiltin('node:url').fileURLToPath;
    return fs.promises.readFile(fileURLToPath(url), 'utf8').catch(function (e) {
        throw new Error('[scene-source] scene "' + id + '" — reading ' + url + ' failed: ' +
            (e && e.message) + '. (FAIL-LOUD.)');
    });
}

function _fetchText(url, id, fetchImpl) {
    var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!f) {
        throw new Error('[scene-source] no fetch available to load ' + url + '.');
    }
    return Promise.resolve(f(url)).then(function (res) {
        if (!res || !res.ok) {
            throw new Error('[scene-source] scene "' + id + '" — GET ' + url + ' answered ' +
                (res ? res.status : 'nothing') + '. (FAIL-LOUD.)');
        }
        return res.text();
    });
}

/**
 * Read a scene file's text through a router's path authority.
 * @param {string|{id:string, source:string}} scene — a rung id, or a registry row.
 * @param {{router?:{resolve:function(string):string}, fetch?:function}} [opts]
 *   router — the host's engineRouter (absent: the package's own dist root);
 *   fetch  — the fetch used for a non-file URL (defaults to the global; injectable for tests).
 * @returns {Promise<string>}
 */
export function loadSceneSource(scene, opts) {
    return Promise.resolve().then(function () {
        opts = opts || {};
        Object.keys(opts).forEach(function (k) {
            if (OPT_KEYS.indexOf(k) === -1) {
                throw new Error('[scene-source] loadSceneSource has no option "' + k + '" — options: ' +
                    OPT_KEYS.join(', ') + '. (FAIL-LOUD.)');
            }
        });
        var row = _rowOf(scene);
        var rel = scenePath(row);
        var router = opts.router || _packageRouter();
        if (typeof router.resolve !== 'function') {
            throw new Error('[scene-source] opts.router has no resolve() — pass an engineRouter ' +
                '(lib/shim/engine/router.js) to resolve ' + rel + '. (FAIL-LOUD.)');
        }
        var url = router.resolve(rel);
        var text = url.indexOf('file:') === 0
            ? _readFileUrl(url, row.id)
            : _fetchText(url, row.id, opts.fetch);
        return Promise.resolve(text).then(function (t) {
            if (typeof t !== 'string' || !t.trim()) {
                throw new Error('[scene-source] scene "' + row.id + '" — ' + url +
                    ' has an empty body. (FAIL-LOUD.)');
            }
            return t;
        });
    });
}
