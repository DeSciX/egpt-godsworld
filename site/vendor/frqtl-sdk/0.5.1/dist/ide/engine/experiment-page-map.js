/* Copyright 2023-2026 by Essam Abadir */

/**
 * experiment-page-map.js — the ONE `window._egptEnginePathMap` injection contract
 * (ws-stackboot-dev-map architect review, egpt-frqtl-notes/architect-review-stackboot.md
 * Q1).
 *
 * `lib/frqtl/experiments/_shared/stack-boot.js`'s `_resolve()` REQUIRES
 * `window._egptEnginePathMap` to already be set before it runs (a missing map THROWS,
 * naming both injector paths below) — so every host that serves a classic experiment
 * page owes it that injection BEFORE the page's `stack-boot.js` `<script>` tag executes.
 * Two hosts owe it:
 *   - dist/static (build time):  sdk/frqtl-sdk/build.js's rewriteExperimentHtml.
 *   - dev-core (request time):   lib/server/frqtl-experiment-path-map.js's express handler.
 *
 * Both call THIS module's {@link spliceEnginePathMap} — the injection CONTRACT (find the
 * `<script>window._egptWasmPkgUrl` anchor, splice `window._egptEnginePathMap = <json>;`
 * immediately before it) lives in exactly one place, same discipline as
 * {@link buildBrowserPathMap} (the PROJECTION, router.js) already having exactly one home.
 * Two copies of the anchor regex + emitted tag is the failure mode this file closes: rename
 * the anchor in the pages and ONE host would silently stop injecting — the same page
 * breaking in one consumer and not another.
 *
 * Precedent: lib/shim/engine/artifact-shell.js — pure HTML-generation owned by the shim,
 * consumed by build.js via the SAME dynamic-ESM-import pattern (build.js is CJS).
 */

import { buildBrowserPathMap } from './router.js';

// The anchor every canonical experiment page carries BEFORE its stack-boot.js <script>
// tag — see lib/frqtl/experiments/_shared/stack-boot.js's own USAGE docstring. Exported
// so the conformance test (lib/shim/engine/test/experiment-page-map.test.mjs) selects its
// subject set and asserts the anchor off THESE regexes, never a re-declared local copy
// (the fixture-mirror anti-pattern — two copies drift the moment one is edited here).
export const WASM_PKG_URL_ANCHOR = /(<script>\s*window\._egptWasmPkgUrl)/;

// A page that loads _shared/stack-boot.js (any relative depth) REQUIRES the anchor —
// stack-boot.js's _resolve() throws without the map this anchor is the splice point for.
// A page with no such <script> tag (e.g. lib/frqtl/experiments/collision-matrix/
// panel-demo.html, a plain iframe host) never runs stack-boot.js and needs no map.
export const STACK_BOOT_SCRIPT_TAG = /<script\b[^>]*\bsrc=["'][^"']*_shared\/stack-boot\.js["'][^>]*>/;

/**
 * Splice `window._egptEnginePathMap = <json>;` into an experiment page's HTML,
 * immediately before its `<script>window._egptWasmPkgUrl` anchor tag.
 *
 * - A page that does NOT load `_shared/stack-boot.js` is returned UNCHANGED (pass-through
 *   — never a blanket rewrite).
 * - A page that DOES load `_shared/stack-boot.js` but carries no anchor THROWS: it would
 *   ship/serve with no map, and stack-boot.js throws on it in the browser anyway — this
 *   surfaces the same defect at build/serve time, at the actual authoring mistake, instead
 *   of leaving a `html.replace` silent no-op to 404 later in a consumer's browser.
 * - `opts.defaultEngine`, when supplied, adds `window._egptDefaultEngine = "<value>";` on
 *   the SAME injected `<script>` tag, ahead of the map assignment (the dist build's own
 *   `window._egptDefaultEngine = "wasm";` line — a named option here, not a second splice).
 *
 * @param {string} html     raw experiment-page HTML.
 * @param {object} profile  a router profile object (DEV_CORE_PROFILE, DIST_PROFILE, ...).
 * @param {{defaultEngine?: string}} [opts]
 * @returns {string} html with the map spliced in (or unchanged if the page never loads stack-boot.js).
 * @throws {Error} when the page loads stack-boot.js but carries no `window._egptWasmPkgUrl` anchor.
 */
export function spliceEnginePathMap(html, profile, opts) {
    opts = opts || {};
    if (!STACK_BOOT_SCRIPT_TAG.test(html)) {
        return html;
    }
    if (!WASM_PKG_URL_ANCHOR.test(html)) {
        throw new Error(
            '[experiment-page-map] this page loads _shared/stack-boot.js but has no ' +
            '`<script>window._egptWasmPkgUrl` anchor tag — window._egptEnginePathMap cannot ' +
            'be injected before stack-boot.js runs, and stack-boot.js THROWS at runtime ' +
            'without the map. Add the anchor BEFORE the stack-boot.js <script> tag (see any ' +
            'canonical page, e.g. lib/frqtl/experiments/empty/index.html):\n' +
            '  <script>window._egptWasmPkgUrl = new URL("../../../fat/pkg-web/egpt_wasm.js", document.baseURI).href;</script>'
        );
    }
    const pathMapJson = JSON.stringify(buildBrowserPathMap(profile));
    const defaultEngineLine = opts.defaultEngine
        ? 'window._egptDefaultEngine = ' + JSON.stringify(opts.defaultEngine) + ';\n    '
        : '';
    return html.replace(WASM_PKG_URL_ANCHOR, function (_m, g1) {
        return '<script>' + defaultEngineLine + 'window._egptEnginePathMap = ' + pathMapJson + ';</script>\n    ' + g1;
    });
}
