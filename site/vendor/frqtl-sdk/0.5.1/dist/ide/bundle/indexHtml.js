/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/bundle/indexHtml.js — the standalone `index.html` projection of a
 * recipe bundle (ws-experiments-walkthrough Bite 2).
 *
 * A byte-template host that imports `@descix/frqtl-sdk@<pin>` from the CDN and
 * calls `bootRecipe(mountEl, recipeSource, {renderState})`. It hand-injects
 * NOTHING engine/renderer-related and re-derives NO path — ALL script/engine
 * injection is delegated to `bootRecipe` (engineRouter is the one path
 * authority). The `@<pin>` is the passed-in `sdkVersion` (DERIVED at export time
 * from the built SDK's package.json — never a literal here).
 *
 * DRY: `experiment.js` stays the ONE source of truth — this page FETCHES it
 * (`./experiment.js`) rather than embedding a second copy. `renderState` (small,
 * manifest-derived, not the recipe's source of truth) is embedded inline as JSON.
 * FAIL-LOUD if the recipe fetch fails (e.g. opened via `file://` with no server —
 * the page tells the user to serve the folder over http).
 *
 * Layer 2 (physics): none — pure host projection.
 */

'use strict';

function _escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Safe inline-JSON: escape `<` so a `</script>`-like payload can't break out. */
function _inlineJson(obj) {
    return JSON.stringify(obj == null ? null : obj).replace(/</g, '\\u003c');
}

/**
 * Build the standalone `index.html` for a recipe bundle.
 *
 * @param {object} args
 * @param {string} args.name        — project name (page title).
 * @param {string} args.sdkVersion  — the `@descix/frqtl-sdk@<pin>` version (REQUIRED).
 * @param {object} [args.renderState] — normalized renderState bag (inlined as JSON;
 *                                     forwarded to bootRecipe's `{renderState}`).
 * @param {string[]} [args.scripts] — OPAQUE frqtl-relative setup-factory delta
 *                                     (inlined as JSON; forwarded to bootRecipe's
 *                                     `{scripts}` so a factory recipe resolves its
 *                                     window global — DX-3).
 * @param {string} [args.recipeFile='./experiment.js'] — the recipe file to fetch.
 * @returns {string} the complete `index.html`.
 */
export function buildIndexHtml(args) {
    args = args || {};
    if (typeof args.sdkVersion !== 'string' || args.sdkVersion.length === 0) {
        throw new Error('[bundle/indexHtml] buildIndexHtml: args.sdkVersion is REQUIRED (the CDN pin).');
    }
    var name = (typeof args.name === 'string' && args.name.length > 0) ? args.name : 'FRQTL Recipe';
    var recipeFile = (typeof args.recipeFile === 'string' && args.recipeFile.length > 0)
        ? args.recipeFile : './experiment.js';
    var cdnEsm = 'https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@' + args.sdkVersion + '/dist/esm/index.js';
    var renderStateJson = _inlineJson(args.renderState || null);
    var scriptsJson = _inlineJson(Array.isArray(args.scripts) ? args.scripts : []);

    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        '  <title>' + _escapeHtml(name) + ' — FRQTL</title>',
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
        '  <script type="module">',
        '    import { bootRecipe } from ' + JSON.stringify(cdnEsm) + ';',
        '    const RENDER_STATE = ' + renderStateJson + ';',
        '    const SCRIPTS = ' + scriptsJson + ';',
        '    const mount = document.getElementById("frqtl-mount");',
        '    const errBox = document.getElementById("frqtl-err");',
        '    function fail(title, detail){',
        '      errBox.style.display = "block";',
        '      errBox.textContent = title + "\\n\\n" + detail;',
        '    }',
        '    (async () => {',
        '      let src;',
        '      try {',
        '        const res = await fetch(' + JSON.stringify(recipeFile) + ');',
        '        if (!res.ok) throw new Error("HTTP " + res.status);',
        '        src = await res.text();',
        '      } catch (e) {',
        '        fail("Could not load ' + _escapeHtml(recipeFile) + '",',
        '          "Serve this folder over http (e.g. `npx serve`) — a file:// open cannot fetch the recipe.\\n" + (e && e.stack || e));',
        '        return;',
        '      }',
        '      try {',
        '        await bootRecipe(mount, src, { renderState: RENDER_STATE, scripts: SCRIPTS });',
        '      } catch (e) {',
        '        fail("FRQTL recipe boot failed", String(e && e.stack || e));',
        '      }',
        '    })();',
        '  </script>',
        '</body>',
        '</html>',
        ''
    ].join('\n');
}
