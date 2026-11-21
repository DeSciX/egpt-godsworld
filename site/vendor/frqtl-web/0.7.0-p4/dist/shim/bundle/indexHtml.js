/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/bundle/indexHtml.js — the generated `index.html` of an exported project folder: the HOST PAGE,
 * and the ONE writer + ONE parser of the boot bag it carries.
 *
 *   buildIndexHtml({ name, sdkVersion, renderState }) → the page text
 *   readBootBag(html)                                  → the renderState it carries (the import's one reader)
 *   BOOT_BAG_ID                                        'frqtl-boot' — the bag's element id
 *
 * The page boots the folder it sits in as a SERVED PROJECT: `bootProject(mount, { url: './' }, { renderState })`
 * from `@descix/frqtl-web@<pin>` on the CDN. `frqtl.json` names the entry (P2a: the linker reads it first), so
 * the page names no file. The import map is the ONE table's (`pageImportMapFor(<the pinned dist root>/)`,
 * lib/shim/project/specifiers.js), so a sketch's `@descix/frqtl-web/...` imports resolve to the same module URLs
 * the boot loads. The pinned dist root is the router's one spelling (`cdnDistBaseFor`); the pin is the passed-in
 * `sdkVersion` (derived at export time, never a literal here).
 *
 * The boot bag — the host's renderState, which never enters frqtl.json or the project identity — is embedded as
 * `<script type="application/json" id="frqtl-boot">`, `<` escaped so no payload closes the element. The page reads
 * it from that element; an Import reads it back with readBootBag and drops the page. A page opened via `file://`
 * cannot fetch the folder: it says to serve the folder over http.
 *
 * Layer 2 (physics): none — pure host projection.
 */

'use strict';

import { pageImportMapFor, FRQTL_WEB_BOOT } from '../project/specifiers.js';
import { cdnDistBaseFor } from '../engine/router.js';

/** The boot bag's element id. */
export var BOOT_BAG_ID = 'frqtl-boot';

var _BAG_OPEN = '<script type="application/json" id="' + BOOT_BAG_ID + '">';
var _BAG_CLOSE = '</script>';

function _escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Safe inline JSON: `<` escaped so a `</script>`-like payload cannot break out. */
function _inlineJson(obj) {
    return JSON.stringify(obj == null ? null : obj).replace(/</g, '\\u003c');
}

/**
 * @param {object} args
 * @param {string} args.name        — the project's name (frqtl.json `name`; the page title)
 * @param {string} args.sdkVersion  — the `@descix/frqtl-web@<pin>` version (REQUIRED)
 * @param {object|null} args.renderState — the normalized boot bag (null boots with the page's defaults)
 * @returns {string} the complete `index.html`
 */
export function buildIndexHtml(args) {
    args = args || {};
    if (typeof args.sdkVersion !== 'string' || args.sdkVersion.length === 0) {
        throw new Error('[bundle/indexHtml] buildIndexHtml: args.sdkVersion is REQUIRED (the CDN pin). (FAIL-LOUD.)');
    }
    if (typeof args.name !== 'string' || args.name.length === 0) {
        throw new Error('[bundle/indexHtml] buildIndexHtml: args.name is the project\'s frqtl.json name. (FAIL-LOUD.)');
    }
    var importMapJson = _inlineJson(pageImportMapFor(cdnDistBaseFor(args.sdkVersion) + '/'));

    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        '  <title>' + _escapeHtml(args.name) + ' — FRQTL</title>',
        '  <style>',
        '    html,body{margin:0;height:100%;background:#0b0b0f;color:#ddd;',
        '      font:14px/1.5 ui-sans-serif,system-ui,sans-serif;}',
        '    #frqtl-mount{position:relative;width:100vw;height:100vh;}',
        '    #frqtl-err{position:absolute;inset:0;padding:16px;white-space:pre-wrap;',
        '      font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#ff6b6b;',
        '      background:#1a0000;display:none;overflow:auto;}',
        '  </style>',
        '</head>',
        '<body>',
        '  <div id="frqtl-mount"></div>',
        '  <pre id="frqtl-err"></pre>',
        '  ' + _BAG_OPEN + _inlineJson(args.renderState) + _BAG_CLOSE,
        '  <script type="importmap">' + importMapJson + '</script>',
        '  <script type="module">',
        '    import { bootProject } from ' + JSON.stringify(FRQTL_WEB_BOOT.specifier) + ';',
        '    const renderState = JSON.parse(document.getElementById(' + JSON.stringify(BOOT_BAG_ID) + ').textContent);',
        '    const mount = document.getElementById("frqtl-mount");',
        '    const errBox = document.getElementById("frqtl-err");',
        '    function fail(title, detail){',
        '      errBox.style.display = "block";',
        '      errBox.textContent = title + "\\n\\n" + detail;',
        '    }',
        '    if (location.protocol === "file:") {',
        '      fail("Serve this folder over http", "e.g. `npx serve` — a file:// page cannot fetch the project files.");',
        '    } else {',
        '      bootProject(mount, { url: new URL("./", location.href).href }, { renderState: renderState })',
        '        .catch((e) => fail("FRQTL project boot failed", String(e && e.stack || e)));',
        '    }',
        '  </script>',
        '</body>',
        '</html>',
        ''
    ].join('\n');
}

/**
 * THE parser of the boot bag: the renderState an exported page carries (null when it carries none).
 * THROWS when the page holds no bag element, or more than one, or one that is not JSON.
 * @param {string} html
 * @returns {object|null}
 */
export function readBootBag(html) {
    if (typeof html !== 'string') {
        throw new Error('[bundle/indexHtml] readBootBag(html): the page text (got ' + typeof html + '). (FAIL-LOUD.)');
    }
    var at = html.indexOf(_BAG_OPEN);
    if (at === -1) {
        throw new Error('[bundle/indexHtml] the index.html carries no boot bag (<script type="application/json" id="' +
            BOOT_BAG_ID + '">) — it is not the page an Export writes. (FAIL-LOUD.)');
    }
    if (html.indexOf(_BAG_OPEN, at + 1) !== -1) {
        throw new Error('[bundle/indexHtml] the index.html carries two boot bags — an Export writes one. (FAIL-LOUD.)');
    }
    var start = at + _BAG_OPEN.length;
    var end = html.indexOf(_BAG_CLOSE, start);
    if (end === -1) {
        throw new Error('[bundle/indexHtml] the boot bag element is not closed. (FAIL-LOUD.)');
    }
    try { return JSON.parse(html.slice(start, end)); }
    catch (e) {
        throw new Error('[bundle/indexHtml] the boot bag is not valid JSON: ' + ((e && e.message) || e) + '. (FAIL-LOUD.)');
    }
}
