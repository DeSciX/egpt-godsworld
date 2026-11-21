// Copyright 2023-2026 by Essam Abadir
// lib/shim/notebook/vendor-importmap.js — the ONE pure import-map generator.
//
// Phase 2a (§2a.3). Maps the committed vendor manifest
// (lib/frqtl/assets/vendor/manifest.json) → a browser `<script type="importmap">`
// payload `{ imports: { <spec>: <url> } }`, so a realm cell's builder/view module
// can `import * as d3 from 'd3'` and the realm's native module loader resolves the
// bare specifier to a PLACED /vendor artifact.
//
// PURE: no DOM, no Runtime, no engine import. Node-testable.
//
// PATH AUTHORITY (the canonical-stack DRY rule): `vendorBase` is supplied by the
// caller from `router.vendorBase` (the single path authority — DEV_CORE_PROFILE /
// DIST_PROFILE `__vendorBase`). This module NEVER hardcodes a `/vendor` literal; it
// only joins the caller-provided base with each manifest entry.
//
// FAIL-LOUD (the slit-objects-hardcoded-list bug class): a malformed manifest (no
// `.libs`, or a lib without `.entry`) THROWS — never silently drops a lib.

import { buildFrqtlSetupsImportMap } from './frqtl-setups-importmap.js';
import { importMapFor } from '../project/specifiers.js';

/**
 * @typedef {object} VendorManifest
 * @property {number} [version]
 * @property {Object<string, { entry: string }>} libs
 *   bare-specifier → { entry: path RELATIVE TO THE VENDOR ROOT }.
 */

/**
 * Build a browser import-map from the vendor manifest.
 *
 * @param {VendorManifest} manifest  parsed manifest.json (`{ libs: { spec: { entry } } }`).
 * @param {string} vendorBase        router.vendorBase, e.g. `'/vendor'` (no trailing slash needed).
 * @returns {{ imports: Object<string, string> }}
 *   `{ imports: { <spec>: <vendorBase>/<entry> } }`.
 * @throws {Error} FAIL-LOUD on a malformed manifest or a missing vendorBase.
 *
 * @example
 *   buildImportMap({ libs: { d3: { entry: 'd3/dist/d3.min.js' } } }, '/vendor')
 *   // → { imports: { d3: '/vendor/d3/dist/d3.min.js' } }
 */
export function buildImportMap(manifest, vendorBase) {
    if (!manifest || typeof manifest !== 'object' || !manifest.libs || typeof manifest.libs !== 'object') {
        throw new Error('[vendor-importmap] malformed manifest: missing `.libs` object (FAIL-LOUD).');
    }
    if (typeof vendorBase !== 'string' || vendorBase.length === 0) {
        throw new Error('[vendor-importmap] vendorBase is required (read it from router.vendorBase) (FAIL-LOUD).');
    }
    // Normalise the base: strip a single trailing slash so the join is unambiguous.
    var base = vendorBase.replace(/\/+$/, '');
    var imports = {};
    var specs = Object.keys(manifest.libs);
    for (var i = 0; i < specs.length; i++) {
        var spec = specs[i];
        var rec = manifest.libs[spec];
        if (!rec || typeof rec.entry !== 'string' || rec.entry.length === 0) {
            throw new Error('[vendor-importmap] manifest lib "' + spec + '" has no `.entry` (FAIL-LOUD — a lib is never silently dropped).');
        }
        // entry is relative to the vendor root; strip any leading slash so the join is clean.
        var entry = rec.entry.replace(/^\/+/, '');
        imports[spec] = base + '/' + entry;
    }
    return { imports: imports };
}

/**
 * The lib-identity root, as the document sees it, for a router: where `frqtl/parts/index.js` is
 * placed, minus that path (every profile places the game layer at its lib/-relative path).
 *
 * @param {{resolve:Function}} router
 * @returns {string} ending in '/'
 * @throws {Error} FAIL-LOUD when the profile does not place the parts at their lib/-relative path.
 */
export function libRootOf(router) {
    var parts = router.resolve('parts/index.js');
    var tail = 'frqtl/parts/index.js';
    if (parts.slice(-tail.length) !== tail) {
        throw new Error('[vendor-importmap] the router places parts/index.js at "' + parts + '", not at its ' +
            'lib/-relative placement (…/' + tail + ') — the document\'s lib root cannot be located (FAIL-LOUD).');
    }
    var root = parts.slice(0, -tail.length);
    return root === '' ? './' : root;
}

/**
 * The REALM import map — the ONE merged `{imports}` every host injects into a document:
 * the vendor libs (`buildImportMap(manifest, router.vendorBase)`), the canonical
 * setup-factory bare specifiers (`buildFrqtlSetupsImportMap(router)`) and the sketch's
 * `@descix/frqtl-web/...` specifiers (lib/shim/project/specifiers.js importMapFor, at this
 * router's lib root). A document may carry only ONE import map, so the fragments always travel
 * together, resolved through the SAME router (never a vendor base from one profile and module
 * URLs from another).
 *
 * @param {VendorManifest} manifest
 * @param {{resolve:Function, vendorBase:string}} router  an engineRouter() instance.
 * @returns {{ imports: Object<string, string> }}
 * @throws {Error} FAIL-LOUD on a malformed manifest or a missing router.
 */
export function buildRealmImportMap(manifest, router) {
    if (!router || typeof router.resolve !== 'function') {
        throw new Error('[vendor-importmap] buildRealmImportMap(manifest, router) requires an engineRouter() instance (FAIL-LOUD).');
    }
    var vendorMap = buildImportMap(manifest, router.vendorBase);
    var setupsMap = buildFrqtlSetupsImportMap(router);
    var webMap = importMapFor(libRootOf(router));
    return { imports: Object.assign({}, vendorMap.imports, setupsMap.imports, webMap.imports) };
}

/**
 * Splice the realm import map into an HTML document as
 * `<script type="importmap" data-frqtl-vendor-importmap>`, immediately BEFORE the first
 * `<script type="module"` (a map added after module loading starts is ignored), else
 * before `</head>`, else prepended. Idempotent: a document already carrying the
 * `data-frqtl-vendor-importmap` tag is returned unchanged.
 *
 * The ONE splice for every host: the dev serve-time splice
 * (lib/server/realm-html.js) and the static build-time bake (apps/ide/vite.config.js).
 *
 * @param {string} html
 * @param {VendorManifest} manifest
 * @param {{resolve:Function, vendorBase:string}} router  the host's engineRouter() instance.
 * @returns {string}
 */
export function spliceRealmImportMap(html, manifest, router) {
    if (/data-frqtl-vendor-importmap/.test(html)) { return html; }   // idempotent
    var body = JSON.stringify(buildRealmImportMap(manifest, router));
    var tag = '<script type="importmap" data-frqtl-vendor-importmap>' + body + '</script>\n    ';
    var moduleIdx = html.search(/<script\s+type=["']module["']/i);
    if (moduleIdx !== -1) { return html.slice(0, moduleIdx) + tag + html.slice(moduleIdx); }
    var headIdx = html.search(/<\/head>/i);
    if (headIdx !== -1) { return html.slice(0, headIdx) + '  ' + tag + html.slice(headIdx); }
    return tag + html;
}
