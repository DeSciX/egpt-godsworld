/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/bundle/index.js — Export and Import of a project folder.
 *
 * A project is a folder (the stored row's owner is
 * lib/shim/storage/folders.js). The Export IS the folder, zipped, plus the host page that boots it:
 *
 *   exportFolder(files, renderState, { sdkVersion }) → zipBytes
 *       the zip holds EXACTLY the folder's files plus a generated `index.html` (indexHtml.js: bootProject over the
 *       served folder, frqtl.json naming the entry, the boot bag inlined by its one writer).
 *   importArchive(bytes, fileName) → { files, renderState }   (a normalized folder row)
 *       a zip      → its files minus `index.html`, whose boot bag (indexHtml.js readBootBag) becomes renderState;
 *                    it must carry frqtl.json at its root (an archive with no index.html imports with
 *                    renderState null)
 *       one `.js`  → the one-file project { 'sketch.js': text, 'frqtl.json': manifestFor({ name: <basename>,
 *                    entry: 'sketch.js' }) }, renderState null — a 3D sketch then fails loud at boot on the
 *                    renderer (the existing named refusal); nothing guesses a display
 *       REFUSED, naming the migration: a zip carrying `experiment.js` or `manifest.json`, or a JSON v4 module
 *       envelope — the retired export format. REFUSED by rule: a one-file `.mjs` (frqtl.json's entry rule admits a
 *       `.js` entry only), anything else.
 *
 * PURE + DOM-free (Uint8Array in and out). The browser download and file read are lib/features/ide/bundle-export.js.
 * zip.js (the STORE zip) is imported by the Record too; its API is frozen. Layer 2 (physics): none.
 */

'use strict';

import { zipStore, unzipStore, textBytes } from './zip.js';
import { buildIndexHtml, readBootBag } from './indexHtml.js';
import { normalizeFolderRow, EXPORT_PAGE } from '../storage/folders.js';
import { MANIFEST_FILE, MANIFEST_KEYS, parseManifest, serializeManifest, manifestFor } from '../project/manifest.js';

/** The files of the retired export format (the v4 envelope's bundle). */
export var RETIRED_ARCHIVE_FILES = Object.freeze(['experiment.js', 'manifest.json']);

var RETIRED = 'this is the retired export format; the project folder replaced it (frqtl.json + sketch.js)';
var SKETCH = 'sketch.js';

var _strict = new TextDecoder('utf-8', { fatal: true });

function _fail(msg) {
    throw new Error('[bundle] ' + msg + ' (FAIL-LOUD.)');
}

/**
 * @param {Object<string,string>} files — the folder (frqtl.json + its files)
 * @param {object|null} renderState — the host's boot bag (normalized by its owner through the folder row)
 * @param {{sdkVersion: string}} opts — the `@descix/frqtl-web` pin the page imports (derived, never a literal)
 * @returns {Uint8Array} the zip
 */
export function exportFolder(files, renderState, opts) {
    var row = normalizeFolderRow({ files: files, renderState: renderState });
    var sdkVersion = opts && opts.sdkVersion;
    var name = parseManifest(row.files[MANIFEST_FILE]).name;
    var entries = Object.keys(row.files).map(function (p) { return { name: p, bytes: textBytes(row.files[p]) }; });
    entries.push({ name: EXPORT_PAGE, bytes: textBytes(buildIndexHtml({ name: name, sdkVersion: sdkVersion, renderState: row.renderState })) });
    return zipStore(entries);
}

function _isZip(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
        ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06));
}

function _text(bytes, what) {
    try { return _strict.decode(bytes); }
    catch (e) { _fail(what + ' is not UTF-8 text — a project folder holds text files only.'); }
}

function _baseName(fileName) {
    var base = String(fileName).split(/[\\/]/).pop();
    return base;
}

function _fromZip(bytes) {
    var entries = unzipStore(bytes).filter(function (e) { return !/\/$/.test(e.name); });
    var names = entries.map(function (e) { return e.name; });
    var retired = RETIRED_ARCHIVE_FILES.filter(function (f) { return names.indexOf(f) !== -1; });
    if (retired.length) {
        _fail('the archive carries ' + retired.join(' and ') + ': ' + RETIRED + '.');
    }
    if (names.indexOf(MANIFEST_FILE) === -1) {
        var tops = names.map(function (n) { return n.split('/')[0]; }).filter(function (t, i, a) { return a.indexOf(t) === i; });
        if (tops.length === 1 && names.indexOf(tops[0] + '/' + MANIFEST_FILE) !== -1 &&
            names.every(function (n) { return n.indexOf(tops[0] + '/') === 0; })) {
            _fail('the archive carries no ' + MANIFEST_FILE + ' at its root — the archive holds the folder `' + tops[0] + '/` rather ' +
                'than its contents — zip the folder\'s CONTENTS (' + MANIFEST_FILE + ' at the root), as an Export writes it.');
        }
        _fail('the archive carries no ' + MANIFEST_FILE + ' at its root — a project archive is the folder zipped ' +
            '(frqtl.json + sketch.js + …), as an Export writes it.');
    }
    var files = {};
    var renderState = null;
    entries.forEach(function (e) {
        var text = _text(e.bytes, '"' + e.name + '"');
        if (e.name === EXPORT_PAGE) { renderState = readBootBag(text); return; }
        files[e.name] = text;
    });
    return normalizeFolderRow({ files: files, renderState: renderState });
}

function _fromJson(text) {
    var raw;
    try { raw = JSON.parse(text); }
    catch (e) { _fail('the file is neither a project archive (.zip) nor a sketch (.js), and not valid JSON either.'); }
    if (raw && typeof raw === 'object' && ('schemaVersion' in raw || 'scripts' in raw) && 'source' in raw) {
        _fail('the file is a v4 module envelope: ' + RETIRED + '.');
    }
    _fail('the JSON file is not a project — Import takes a project archive (.zip) or one sketch (.js).');
}

function _fromSketch(text, fileName) {
    var base = _baseName(fileName);
    var name = base.replace(/\.js$/, '');
    if (!name) { _fail('the sketch file "' + base + '" has no name before ".js".'); }
    var files = {};
    files[MANIFEST_FILE] = serializeManifest(manifestFor({ name: name, entry: SKETCH }));
    files[SKETCH] = text;
    return normalizeFolderRow({ files: files, renderState: null });
}

/**
 * @param {Uint8Array} bytes
 * @param {string} fileName — the imported file's name (a one-file sketch's basename is its project name)
 * @returns {Readonly<{files: Object<string,string>, renderState: object}>}
 */
export function importArchive(bytes, fileName) {
    if (!(bytes instanceof Uint8Array)) { _fail('importArchive(bytes, fileName): bytes is a Uint8Array.'); }
    if (typeof fileName !== 'string' || fileName.length === 0) { _fail('importArchive(bytes, fileName): the file\'s name.'); }
    if (_isZip(bytes)) { return _fromZip(bytes); }
    var base = _baseName(fileName);
    if (/\.mjs$/i.test(base)) {
        var entryRule = MANIFEST_KEYS.filter(function (r) { return r.key === 'entry'; })[0].rule;
        _fail('"' + base + '" is a .mjs module — a one-file Import takes a .js sketch, because a project\'s entry is ' +
            entryRule + ' (frqtl.json, lib/shim/project/manifest.js MANIFEST_KEYS). Rename it to .js and import it again.');
    }
    var text = _text(bytes, '"' + base + '"');
    if (/\.js$/.test(base)) { return _fromSketch(text, base); }
    if (/\.json$/i.test(base) || /^\s*\{/.test(text)) { return _fromJson(text); }
    _fail('"' + base + '" is not a project — Import takes a project archive (.zip, as an Export writes it) or one ' +
        'sketch (.js).');
}
