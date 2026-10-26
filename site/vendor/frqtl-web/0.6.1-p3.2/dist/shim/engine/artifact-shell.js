/* Copyright 2023-2026 by Essam Abadir */

/**
 * artifact-shell.js — pure generator for the claude.ai Artifact host shell.
 *
 * The "artifact host shell" is a SINGLE self-contained HTML file a user pastes
 * into a claude.ai chat as an Artifact. It has no server, no build step, no
 * relative-file dependencies of its own — every asset it needs is fetched from
 * `cdn.jsdelivr.net/npm/` (the ONLY non-`self` script-src origin this shell
 * needs; see §1 of the design doc for the full captured CSP).
 *
 * This module is PURE (no DOM, no browser globals) and node-testable. It has
 * exactly two responsibilities, kept separate so the "never hand-drifted"
 * requirement is mechanically enforced rather than asserted in prose:
 *
 *   buildArtifactImportMap()   — the ONE import-map entry the shell embeds,
 *                                 derived from router.js's CDN_BASE (the single
 *                                 CDN path authority — never a second hand-typed
 *                                 jsdelivr URL literal).
 *   renderArtifactShellHtml()  — the full HTML document text, calling
 *                                 buildArtifactImportMap() internally (so the
 *                                 embedded `<script type="importmap">` can never
 *                                 drift from the generator — a conformance test
 *                                 asserts this by construction, see
 *                                 lib/shim/engine/test/artifact-shell.test.mjs).
 *
 * WHAT the import map holds (and why it never lists engine/renderer files): the shell's inline
 * `<script type="module">` imports `bootScene` from `'@descix/frqtl-web/boot'` (the package's scene doors,
 * lib/frqtl/experiments/_shared/doors.js) — everything the boot loads (engine, renderer, game layer)
 * resolves relative to that module's own URL — and the embedded scene imports its parts by the
 * published self-reference. Both come from the ONE specifier table (`pageImportMapFor`). Growing this
 * map by hand per script would re-enumerate the module graph by hand — the schema-mirror-drift
 * anti-pattern.
 *
 * CSP notes baked into the generated HTML (never re-derive elsewhere):
 *   - NO `blob:` module imports (forbidden by the captured CSP's script-src).
 *   - NO script/style/font origin outside the allowlist in the design doc §1
 *     (jsdelivr/npm, cdnjs, claudeusercontent, tailwindcss CDN, jquery CDN) —
 *     this shell in fact uses ONLY jsdelivr/npm plus inline scripts/styles
 *     ('unsafe-inline' is granted), so it is a strict subset of the allowlist.
 *   - The inline `<script type="module">` and the `<script type="importmap">`
 *     are both confirmed-PASS under this exact CSP (Step 0, design doc §1).
 */

'use strict';

import { CDN_BASE } from './router.js';
import { pageImportMapFor, FRQTL_WEB_BOOT } from '../project/specifiers.js';

/**
 * The bare-specifier import map the artifact shell embeds: the ONE table, `pageImportMapFor(<the dist
 * root>/)` (lib/shim/project/specifiers.js) — the scene doors (`@descix/frqtl-web/boot`) and the sketch's
 * self-reference rows, at their lib-identity paths under the dist root, so the embedded scene's imports
 * resolve to the SAME module URLs the boot loads.
 *
 * @param {object} [opts]
 * @param {string} [opts.base] - The dist base (default `CDN_BASE` from router.js): the absolute URL
 *   (no trailing slash) of an unmodified copy of the package's dist/ tree. The PUBLISHED shell
 *   (`sdk/frqtl-web/build.js`) never passes it; the local mirror
 *   (`sdk/frqtl-web/scripts/serve-local-cdn-mirror.mjs`) does.
 * @returns {{imports: Object<string,string>}}
 */
export function buildArtifactImportMap(opts) {
    opts = opts || {};
    var base = opts.base !== undefined ? opts.base : CDN_BASE;
    return pageImportMapFor(base + '/');
}

/**
 * The scene the artifact shell boots — a frqtl-relative scene file (lib/frqtl/<ARTIFACT_SCENE>).
 * The generator is pure: its caller reads this file and hands the TEXT in (`opts.sceneSource`),
 * and the page embeds it verbatim. The scene is its one home; its constants are its knobs.
 */
export var ARTIFACT_SCENE = 'scenes/double-slit.js';

/**
 * The bounded wait an artifact page gives its boot before it FAILS LOUD. An SDK entry that never
 * loads (a 404, an unreachable CDN, an unpublished pin) runs NO code, so nothing inside the module
 * can report it — without this deadline the page sits on "booting FRQTL…" forever. The authored
 * sdk/frqtl-web/src/artifact/sun.html carries BOOT_DEADLINE_MARKER, where the build splices
 * bootDeadlineScript() — one script, one number.
 */
export var ARTIFACT_BOOT_DEADLINE_MS = 30000;

/** Where an AUTHORED artifact page (sun.html) takes the deadline script: the build splices it here. */
export var BOOT_DEADLINE_MARKER = '<!-- FRQTL:BOOT-DEADLINE -->';

/**
 * The classic deadline script (runs whether or not the module ever loads). On expiry with no live
 * boot it stamps `data-egpt-boot-timeout="1"` on #frqtl-status, names the entry the page boots from
 * (the import map's `@descix/frqtl-web/boot` row, else the frqtl-web.min.js <script>), and logs it. The module sets `window.__frqtlLive = true` once the boot resolves.
 * @returns {string} a `<script>…</script>` element
 */
export function bootDeadlineScript() {
    return (
'<script>\n' +
'  /* BOOT DEADLINE — lib/shim/engine/artifact-shell.js ARTIFACT_BOOT_DEADLINE_MS. */\n' +
'  setTimeout(function () {\n' +
'    if (window.__frqtlLive) { return; }\n' +
'    var map = document.querySelector(\'script[type="importmap"]\');\n' +
'    var min = document.querySelector(\'script[src$="frqtl-web.min.js"]\');\n' +
'    var entry = min ? min.src : \'(no import map)\';\n' +
'    try { if (map) { entry = new URL(JSON.parse(map.textContent).imports[\'' + FRQTL_WEB_BOOT.specifier + '\'], document.baseURI).href; } } catch (e) { /* the message names the absence */ }\n' +
'    var msg = \'FRQTL BOOT TIMEOUT — not live after \' + (' + ARTIFACT_BOOT_DEADLINE_MS + ' / 1000) + \' s: the SDK entry \' + entry +\n' +
'      \' did not load, or its boot never reached a first tick.\';\n' +
'    var el = document.getElementById(\'frqtl-status\');\n' +
'    if (el) { el.textContent = msg; el.setAttribute(\'data-egpt-boot-timeout\', \'1\'); }\n' +
'    if (window.console && console.error) { console.error(\'[frqtl-artifact]\', msg); }\n' +
'  }, ' + ARTIFACT_BOOT_DEADLINE_MS + ');\n' +
'</script>\n'
    );
}

/**
 * Render the complete, self-contained artifact host shell HTML.
 *
 * The document boots the scene file's sketch (ARTIFACT_SCENE, embedded VERBATIM) via
 * `bootScene()` — the scene doors (lib/frqtl/experiments/_shared/doors.js) — into a mount div.
 * FAIL-LOUD: `bootScene`'s own promise rejection is caught here and surfaced in the status
 * line; `bootScene` itself paints a detailed error overlay inside the mount div on any
 * load/compile/engine failure (never a silent blank canvas).
 *
 * The shell writes NO size: the mount is `width:fit-content`, sized by the canvas the scene's
 * co-init call creates.
 *
 * WHERE THE PACKAGE COMES FROM (`opts.host`):
 *   'cdn'  (default) — the import map is the jsdelivr pin (buildArtifactImportMap; `opts.base`
 *          re-anchors it): the self-contained page a user pastes into a claude.ai Artifact.
 *   'dist' — the import map is page-relative, `pageImportMapFor('../')` (placed by the build like
 *          sun.html's): the page the package ships boots against WHATEVER dist serves it.
 * Either way the doors locate every file they load relative to their own URL, and the page carries a
 * bounded boot DEADLINE (bootDeadlineScript): a silent hang fails loud.
 *
 * @param {object} opts
 * @param {string} opts.sceneSource     - REQUIRED: the text of lib/frqtl/<ARTIFACT_SCENE>, a sketch
 *   module (`export default function buildExperiment(exp)`), inlined into the page's module script —
 *   its imports resolve through the page's import map. Missing, or defining no buildExperiment, THROWS.
 * @param {number} [opts.seed=42]        - RNG seed.
 * @param {string} [opts.base]           - Forwarded to `buildArtifactImportMap` (a 'cdn' page re-anchored
 *   at a self-hosted dist root). Omitted by the published shell.
 * @returns {string} the full `<!DOCTYPE html>...</html>` document text.
 */
export function renderArtifactShellHtml(opts) {
    opts = opts || {};
    var sceneSource = opts.sceneSource;
    if (typeof sceneSource !== 'string' || !sceneSource.trim()) {
        throw new Error('[artifact-shell] renderArtifactShellHtml needs opts.sceneSource — the text of lib/frqtl/' +
            ARTIFACT_SCENE + ' (the caller reads the file; this generator is pure). (FAIL-LOUD.)');
    }
    if (!/function buildExperiment\s*\(/.test(sceneSource)) {
        throw new Error('[artifact-shell] opts.sceneSource defines no `function buildExperiment(exp)` — it must be the ' +
            'scene file ' + ARTIFACT_SCENE + '. (FAIL-LOUD.)');
    }
    var seed       = opts.seed !== undefined ? opts.seed : 42;
    var host = opts.host === undefined ? 'cdn' : opts.host;
    if (host !== 'cdn' && host !== 'dist') {
        throw new Error('[artifact-shell] opts.host must be "cdn" or "dist" (got ' + JSON.stringify(host) + '). (FAIL-LOUD.)');
    }
    if (host === 'dist' && opts.base) {
        throw new Error('[artifact-shell] opts.base re-anchors the CDN pin; a "dist" page anchors at its own entry. (FAIL-LOUD.)');
    }
    var importMapJson = JSON.stringify(host === 'dist' ? pageImportMapFor('../') : buildArtifactImportMap(opts));

    return (
'<!DOCTYPE html>\n' +
'<!-- Copyright 2023-2026 by Essam Abadir -->\n' +
'<!-- FRQTL — claude.ai Artifact host shell.\n' +
'     Generated by lib/shim/engine/artifact-shell.js — DO NOT hand-edit.\n' +
'     Paste this ENTIRE file into a claude.ai chat as an Artifact (type: HTML). -->\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>FRQTL — Double-Slit (live)</title>\n' +
'<style>\n' +
'  html,body{margin:0;padding:0;background:#0b0b0b;color:#c9c9c9;font-family:ui-monospace,Menlo,Consolas,monospace;}\n' +
'  #frqtl-status{text-align:center;font-size:12px;color:#888;padding:10px 0 4px;}\n' +
'  #frqtl-mount{width:fit-content;margin:0 auto 24px;position:relative;}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div id="frqtl-status" data-role="frqtl-artifact-status">booting FRQTL…</div>\n' +
'<div id="frqtl-mount" data-role="frqtl-artifact-mount"></div>\n' +
'<script type="importmap">' + importMapJson + '</script>\n' +
bootDeadlineScript() +
'<script type="module">\n' +
'  import { bootScene } from \'' + FRQTL_WEB_BOOT.specifier + '\';\n' +
'  var statusEl = document.getElementById(\'frqtl-status\');\n' +
'  var tickCount = 0;\n' +
sceneSource.replace(/\s*$/, '') + '\n' +
'  bootScene(\'frqtl-mount\', buildExperiment, {\n' +
'    seed: ' + seed + ',\n' +
'    onTick: function () {\n' +
'      tickCount++;\n' +
'      if (tickCount % 20 === 0) {\n' +
'        statusEl.textContent = \'FRQTL double-slit — live — tick \' + tickCount;\n' +
'      }\n' +
'    }\n' +
'  }).then(function () {\n' +
'    window.__frqtlLive = true;\n' +
'    statusEl.textContent = \'FRQTL double-slit — live\';\n' +
'  }).catch(function (err) {\n' +
'    window.__frqtlLive = true;   // failed LOUDLY already — the deadline has nothing to add\n' +
'    statusEl.textContent = \'FRQTL boot FAILED — see overlay below.\';\n' +
'    if (window.console && console.error) { console.error(\'[frqtl-artifact]\', err); }\n' +
'  });\n' +
'</script>\n' +
'</body>\n' +
'</html>\n'
    );
}
