/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module engineRouter
 * @description
 * The single source of truth for engine path routing.
 *
 * Four named profiles:
 *  - `DEV_CORE_PROFILE` — in-core dev mount (`lib/server` plugin serves `/frqtl`, `/fat`).
 *  - `DIST_PROFILE` — flat dist layout, same-origin RELATIVE paths (`sdk/frqtl-web/dist`;
 *    baked into the dist pages at build time by `sdk/frqtl-web/build.js`).
 *  - `CDN_PROFILE` — the SAME dist layout, resolved to ABSOLUTE jsdelivr URLs
 *    (`https://cdn.jsdelivr.net/npm/@descix/frqtl-web@<ver>/dist/...`) for static hosting
 *    with no server process at all. CDN_PROFILE is
 *    a DISTINCT profile object, not a DIST_PROFILE parameterization: DIST_PROFILE's
 *    relative bases are meaningless outside the exact dist/experiments/{id}/ page
 *    context they were computed for, whereas CDN_PROFILE's
 *    absolute bases resolve correctly from ANY host page (a claude.ai Artifact iframe has
 *    no such anchor point in the dist tree at all).
 *  - the static profile (`buildStaticProfile(graphBase, entryBase)`) — the SAME dist layout,
 *    its graph under the site's build-stamped `./pub/<build>` directory and its experiment
 *    entry pages at the fixed `./pub/experiments/`, RELATIVE TO THE DOCUMENT, with the math +
 *    notebook lanes co-served in the same tree (self-contained no-backend site served under
 *    ANY path prefix — the DeSciX platform serves it at /<env>/<app_id>/site/). Like
 *    CDN_PROFILE it is a DISTINCT profile (its math/notebook bases point SAME-ORIGIN).
 *
 * Profile parity is asserted at module load time: all four profiles MUST cover the same
 * non-private path keys or an error is thrown (prevents dev/dist/cdn/static divergence).
 *
 * @example
 * import { engineRouter } from 'lib/shim';
 * const router = engineRouter({ mode: 'dev-core', engine: 'wasm' });
 * // router.resolve(relPath)→ string (URL of a frqtl-relative path, e.g. 'experiments/_shared/boot.js')
 */

'use strict';

// The static site's shape (graph dir, build stamp, build id, entry page, package placements) — owned by site-graph.js,
// imported from there by every consumer; the router uses them and does not re-export them.
import { SITE_GRAPH_DIR, SITE_BUILD_ATTR, SITE_BUILD_ID_RE, STATIC_APP_PAGE, SITE_PLACEMENTS } from './site-graph.js';

// ── Path profiles ────────────────────────────────────────────────────────────
//
// Each profile maps a frqtl-relative prefix → URL prefix.
// The FIRST matching prefix wins (insertion order).
//
// DEV_CORE_PROFILE uses the lib/server plugin's in-process mounts:
//   /frqtl → lib/frqtl      /fat → lib/fat
//
// DIST_PROFILE uses the flat dist layout inside sdk/frqtl-web/dist/
// (mirrors what build.js:254-271 used to hand-synthesize into the html).

var DEV_CORE_PROFILE = {
    // THE package root (lib/server/mounts.js serves lib/ as lib-identity siblings: /frqtl, /shim, /fat).
    // Every game-layer path (LIB_IDENTITY_PREFIXES) resolves under it; this is the one game-layer fact.
    '__frqtlRoot':            '/',
    // External-geometry fixtures (lib/frqtl/assets/models/) — asset DATA a page's own render.mesh call
    // resolves; the dists place it outside the lib-identity tree (js/models/).
    'assets/models/':         '/frqtl/assets/models/',
    // The experiment ENTRY pages (a general experiments/<id>/ path; experiments/_shared/ is lib identity).
    'experiments/':           '/frqtl/experiments/',
    // M1: Math SDK served from SOURCE via vite's transform pipeline (dependency
    // map rule 2: dev consumes source — a /pub_sdk dist route here is the
    // "dev-core route pointing at a dist artifact" anti-pattern).
    // /egpt-src/index.js is a virtual module resolved by fraqtlServe's
    // resolveId/load hooks to sdk/egpt-math-sdk/src/browser/sdk-entry.js;
    // '#egpt-math-canonical' resolves via the config() alias to lib/egpt source.
    // MathView._deriveSdkBase: '/egpt-src/index.js' ends with '/index.js' ✓ —
    // catalog loads from /egpt-src/editor/ (scoped static mounts in mounts.js).
    '__mathSdkUrl':           '/egpt-src/index.js',
    // M4 fix: WASM math bridge served from SOURCE via the scoped /egpt-src/wasm
    // static mount (mounts.js ← egpt-paths.js mathWasmSrcDir, the single path
    // authority). Artifacts are the wasm-pack output of `npm run build:wasm-bridge`
    // (sdk/egpt-math-sdk): glue module + binary. Empty strings here were the M4
    // verification failure — no browser surface could ever register wasm-math.
    // If the bridge isn't built the mount 404s and wasm-math SELECTION fails
    // loud (Runtime._applyBackendSelection names the build command).
    '__mathWasmUrl':          '/egpt-src/wasm/egpt_math_sdk_wasm_bg.wasm',
    '__mathWasmModuleUrl':    '/egpt-src/wasm/egpt_math_sdk_wasm.js',
    // M4: Math backend selection authority — the single source of truth for which
    // MathBackendProvider id is selected at startup. Runtime.ensureMath().then
    // calls MathBackendRegistry.select(mathBackend) if non-empty.
    // Dev consumes source, so its default is 'js-reference' (registered by the dev
    // math SDK entry). Every distribution profile defaults to 'wasm-math' — compute
    // is WASM in every distribution, and js-reference is not registrable there.
    // Normalisation: 'wasm' → 'wasm-math' (same alias as ?mathBackend=wasm URL param).
    '__mathBackend':          'js-reference',
    // Curated native notebooks (lib/notebooks/) — dev is the lib/server static
    // mount at /notebooks (mounts.js). The notebook surfaces NEVER derive this
    // base themselves; they receive router.notebookBase threaded in as a prop
    // (same discipline as __mathSdkUrl / monacoBaseUrl). This is the single path
    // authority for the notebook URL space — it closes the N3 carry that had
    // presets.js hardcoding a '/notebooks/' literal (dev-only, 404s in dist).
    '__notebookBase':         '/notebooks',
    // Placed vendor libs (lib/frqtl/assets/vendor/, gitignored artifacts) — the
    // STABLE root-level /vendor alias mounts.js exposes (§2a.1).
    // A realm cell's bare-specifier import (`import * as d3 from 'd3'`) resolves via
    // a manifest-generated import-map whose base is THIS value (vendor-importmap.js).
    // Single path authority for the vendor URL space — surfaces NEVER derive '/vendor'
    // themselves; they read router.vendorBase (same discipline as __notebookBase).
    '__vendorBase':           '/vendor'
};

// buildDistProfile(base) — the flat dist layout, every target RELATIVE to a page whose
// dist root is `base` ('../..' for a page at dist/experiments/{id}/ — DIST_PROFILE below;
// '../../<build>' for the static site's fixed experiment entry at pub/experiments/{id}/,
// whose graph sits under the build-stamped pub/<build>/). The math / notebook / vendor
// private keys sit one level ABOVE the dist root (the egpt-math-sdk dist co-served as a sibling).
function buildDistProfile(base) {
    if (typeof base !== 'string' || !base || /\/$/.test(base)) {
        throw new Error('[engineRouter] buildDistProfile(base) takes a relative dist-root path with no ' +
            'trailing slash (e.g. "../.."), got ' + JSON.stringify(base) + '.');
    }
    return {
        // THE package root: the game layer and lib/shim sit at their lib-identity placement under the dist
        // root (dist/frqtl/…, dist/shim/…, dist/fat/…), so every relative import resolves as in lib/.
        '__frqtlRoot':            base + '/',
        // External-geometry fixtures — own dist subdir (js/models/).
        'assets/models/':         base + '/js/models/',
        // The experiment entry pages: from dist/experiments/{id}/index.html, base + '/experiments/'.
        'experiments/':           base + '/experiments/',
        // Math SDK path relative to dist/experiments/{id}/ (the page this '../..' base is for).
        // sdk/frqtl-web/dist/experiments/{id}/ → ../../../egpt-math-sdk/index.js
        '__mathSdkUrl':           base + '/../egpt-math-sdk/index.js',
        // M4 fix: dist-relative shape matching sdk/egpt-math-sdk/dist/wasm/ (built by
        // scripts/build.mjs), same base as __mathSdkUrl (relative to dist/experiments/{id}/).
        // wasm-loader normalizes relative URLs against document.baseURI in the browser
        // so the dynamic import resolves page-relative, not bundle-relative.
        '__mathWasmUrl':          base + '/../egpt-math-sdk/wasm/egpt_math_sdk_wasm_bg.wasm',
        '__mathWasmModuleUrl':    base + '/../egpt-math-sdk/wasm/egpt_math_sdk_wasm.js',
        // M4: Math backend default for dist — WASM (a distribution carries no JS math core).
        '__mathBackend':          'wasm-math',
        // Curated native notebooks relative to dist/experiments/{id}/ — same base shape as
        // __mathSdkUrl (sdk/frqtl-web/dist/experiments/{id}/ → ../../../egpt-math-sdk/notebooks/).
        // The sdk build copies lib/notebooks/ → dist/notebooks/ (build.mjs copyDirFromAbs).
        '__notebookBase':         base + '/../egpt-math-sdk/notebooks',
        // Placed vendor libs in dist — same dist-relative shape as __notebookBase
        // (sdk/frqtl-web/dist/experiments/{id}/ → ../../../egpt-math-sdk/vendor). The sdk build
        // copies the manifest-listed vendor entries into the dist (2a-tail follow-up,
        // §8.1); the LIVE consumer is dev (apps/ide).
        '__vendorBase':           base + '/../egpt-math-sdk/vendor'
    };
}

var DIST_PROFILE = buildDistProfile('../..');

// ── CDN_PROFILE (jsdelivr static hosting) ───────────────────────────────────────
//
// Pinned-version constants — the "one constant" the packet's absolute jsdelivr
// bases resolve from. These are hardcoded (not read from package.json — this module runs in
// the browser, no fs access) and MUST be bumped alongside each npm publish;
// lib/shim/engine/test/router.test.mjs asserts them against the two
// package.json#version fields so a forgotten bump fails `make verify`, not a
// silent stale-CDN-URL bug.
var CDN_SDK_VERSION = '0.6.1-p3.2';  // sdk/frqtl-web/package.json#version (the ONE version owner) — bound by router.test.mjs
var CDN_MATH_SDK_VERSION = '0.3.3-p2.1';  // sdk/egpt-math-sdk/package.json#version — bound by router.test.mjs; bumped with each npm publish

/**
 * The jsdelivr dist root of @descix/frqtl-web at `version` — the ONE spelling of the package's CDN URL.
 * @param {string} version
 * @returns {string} no trailing slash
 */
function cdnDistBaseFor(version) {
    if (typeof version !== 'string' || !version) {
        throw new Error('[engineRouter] cdnDistBaseFor(version): a published @descix/frqtl-web version (got ' + JSON.stringify(version) + ').');
    }
    return 'https://cdn.jsdelivr.net/npm/@descix/frqtl-web@' + version + '/dist';
}
var CDN_BASE = cdnDistBaseFor(CDN_SDK_VERSION);
var CDN_MATH_BASE = 'https://cdn.jsdelivr.net/npm/@descix/egpt-math-sdk@' + CDN_MATH_SDK_VERSION + '/dist';

// CDN_PROFILE mirrors DIST_PROFILE's internal dist-relative targets (both profiles
// resolve into the SAME published sdk/frqtl-web/dist/ tree — see build.js) but
// expresses each target as an absolute URL anchored at a base (CDN_BASE by
// default) instead of a page-relative '../../' navigation. A non-private key
// here MUST resolve to the identical dist sub-path DIST_PROFILE's matching key
// resolves to (both are the same physical file on disk, served two different
// ways) — the parity test also asserts this dist-subpath equivalence, not just
// key-name parity.
//
// buildCdnProfile(base) — a FACTORY over `base`, so one base re-anchors EVERY URL the router
// resolves (engine, renderer, game layer, vendor, shim), never just an entry module.
// `CDN_MATH_BASE` (the sibling egpt-math-sdk package) is deliberately not parameterized: it is a
// different published package.
//
// `base` anchors the dist layout at an absolute dist root. With no base it is CDN_BASE (the
// published jsdelivr copy). With one, it is the SELF-HOSTED form: any URL serving an
// UNMODIFIED copy of the package's dist/ tree —
// every file dist/dist-manifest.json lists, byte for byte, at its relative path. A hand-picked
// subset is not supported: the profile below addresses every subtree of the dist, and which files
// a scene reaches is the game layer's business, not the host's. Callers: bootScene/bootRecipe
// `opts.base` (a consumer's own site), the browser parity core and the dist's own pages (their own
// dist root, derived from import.meta), and the registry door's scene reader
// (lib/shim/registry/scene-source.js). `assertDistBase` is the shape gate. The math lane stays on CDN_MATH_BASE (see
// below), so a self-hosted base re-anchors this package only.

// The shape gate for a cdn-mode base: an ABSOLUTE URL (parsable with no document) with no
// trailing slash. A relative base would resolve against the document for <script> tags but
// against the importing MODULE for the engine's dynamic import(), so one base would name two
// places; a trailing slash doubles every joined path. Both are refused, naming the base.
function assertDistBase(base) {
    var ok = typeof base === 'string' && base !== '' && !/\/$/.test(base);
    if (ok) { try { new URL(base); } catch (_) { ok = false; } }
    if (!ok) {
        throw new Error('[engineRouter] mode:"cdn" opts.base must be the absolute URL of a copy of the package\'s ' +
            'dist/ directory, with no trailing slash (e.g. "https://example.org/vendor/frqtl-web/dist"); got ' +
            JSON.stringify(base) + '. From a page: new URL(\'./vendor/frqtl-web/dist\', location.href).href. (FAIL-LOUD.)');
    }
    return base;
}

function buildCdnProfile(base) {
    assertDistBase(base);
    return {
        // THE package root (the same lib-identity dist tree as DIST_PROFILE, absolute at `base`).
        '__frqtlRoot':            base + '/',
        'assets/models/':         base + '/js/models/',
        'experiments/':           base + '/experiments/',
        // Math SDK / math lane — INTENTIONALLY still anchored at CDN_MATH_BASE
        // (the closed-over module constant), never `base` — see the factory
        // docstring above: this is a different, sibling published package.
        // Wired identically to DIST_PROFILE's shape. DEFERRED (packet §3b): not
        // exercised by the double-slit showcase, but present so a future
        // math-notebook artifact needs no new profile keys, only a version bump
        // once egpt-math-sdk is published.
        '__mathSdkUrl':           CDN_MATH_BASE + '/index.js',
        '__mathWasmUrl':          CDN_MATH_BASE + '/wasm/egpt_math_sdk_wasm_bg.wasm',
        '__mathWasmModuleUrl':    CDN_MATH_BASE + '/wasm/egpt_math_sdk_wasm.js',
        '__mathBackend':          'wasm-math',
        '__notebookBase':         CDN_MATH_BASE + '/notebooks',
        // Vendor import-map root — frqtl-web's OWN dist/vendor/ (manifest-driven
        // copy, build.js copyVendorManifestToDist()). Unlike DIST_PROFILE.__vendorBase
        // (which points at the egpt-math-sdk SIBLING dist, co-served same-origin),
        // a CDN host cannot assume a sibling package is co-published
        // — frqtl-web must be self-sufficient for its own realm-import-map vendor
        // libs (packet §3b). Uses `base` — THIS package's own dist/vendor/.
        '__vendorBase':           base + '/vendor'
    };
}

// The default CDN profile — the SAME factory, called with the module constant.
// Every existing consumer (the parity assertion below, router.test.mjs,
// build.js's imports) gets a byte-identical object to before this refactor.
var CDN_PROFILE = buildCdnProfile(CDN_BASE);

// ── The static site profile (self-contained same-origin static host) ──────────────────────────────
//
// The React FraqtlIde deployed as a dumb-static, no-backend, WASM-only site (DeSciX
// CodeSite / any GCS-backed host — no fraqtlServe, no lib/server/server.js). The host serves the
// site under a path PREFIX it chooses (/<env>/<app_id>/site/ on the platform, /p/<app_id>/
// under `descix serve`), so every location is known only RELATIVE TO THE DOCUMENT.
//
// ENTRIES vs GRAPH. The site's HTML entries (the IDE document, pub/index.html, pub/sdk.html,
// pub/artifact/*.html, pub/experiments/{id}/index.html) sit at FIXED URLs — `*.html` is
// no-store on the platform (app-developer runbook §8.1). Everything those entries LOAD (the
// sdk payload: JS, WASM, CSS, JSON, notebooks) is the GRAPH and sits under the build-stamped
// directory STATIC_SDK_DIR/<build>/, so a browser holding a file from an earlier build never
// has it addressed by new HTML. `staticGraphDir(build)` is the ONE spelling of that directory.
// The build id is read off the document's own <html SITE_BUILD_ATTR> (written by the static
// build, apps/ide/vite.config.js), never guessed.
//
//   - engineRouter({mode:'static'}) = buildStaticProfile(staticSdkBase(document.baseURI, build),
//     staticEntryBase(document.baseURI)) — ABSOLUTE at runtime, because a relative URL handed to
//     import(), an iframe inside an experiment page, or Monaco's loader would resolve against
//     the wrong anchor (the importing module, not the document).
//   - engineRouter({mode:'static', documentRelative:true, build}) = the same profile with
//     DOCUMENT-RELATIVE values, for a BUILD-TIME consumer whose output the document resolves
//     (the import map baked into index.html).
//
// THE DELIBERATE DIVERGENCE FROM CDN_PROFILE (design §A.3 / §E flag 4):
// CDN_PROFILE's math + notebook bases are hardwired CROSS-ORIGIN at CDN_MATH_BASE; the
// static-site semantic is "everything self-contained under ONE origin prefix": the math SDK
// is co-served at its SITE_PLACEMENTS directory under graphBase and the curated notebooks ride the
// frqtl-web dist's OWN copy at '<its placement>/notebooks'. A DISTINCT profile here is the
// correct DRY call — the SAME justification that keeps CDN_PROFILE distinct from DIST_PROFILE.
//
// buildStaticProfile(graphBase, entryBase) — every GRAPH key anchors at its package's placement
// under `graphBase` (site-graph.js::SITE_PLACEMENTS — the directory fact; the router stays the URL
// authority); the general 'experiments/' key (the experiment ENTRY pages STUDIO/GYM frame) anchors
// at `entryBase`. Both are required: a host whose entries and graph share one directory passes
// the same base twice.

// The two packages the static profile places (site-graph.js::SITE_PLACEMENTS rows); router.test.mjs binds them to the
// sdk/*/package.json names and to the CDN bases above. The CDN URLs stay literal: G-PIN (scripts/test/cdn-pins.test.mjs)
// reads them as text.
var FRQTL_WEB_PACKAGE_NAME = '@descix/frqtl-web';
var MATH_SDK_PACKAGE = '@descix/egpt-math-sdk';

/**
 * The URL of `pkg`'s placement under `graphBase` (no trailing slash). THROWS for a package no
 * SITE_PLACEMENTS row places.
 * @param {string} graphBase
 * @param {string} pkg
 * @returns {string}
 */
function placedBase(graphBase, pkg) {
    var row = SITE_PLACEMENTS.find(function (r) { return r.package === pkg; });
    if (!row) {
        throw new Error('[engineRouter] no site-graph.js::SITE_PLACEMENTS row places ' + pkg + ' (rows: ' +
            SITE_PLACEMENTS.map(function (r) { return r.package; }).join(', ') + ').');
    }
    return row.dir ? graphBase + '/' + row.dir : graphBase;
}

function buildStaticProfile(graphBase, entryBase) {
    if (!graphBase || !entryBase) {
        throw new Error('[engineRouter] buildStaticProfile(graphBase, entryBase) needs both bases (got ' +
            JSON.stringify(graphBase) + ', ' + JSON.stringify(entryBase) + ') — the graph and the entry ' +
            'pages are anchored separately; a co-served host passes the same base twice.');
    }
    var webBase = placedBase(graphBase, FRQTL_WEB_PACKAGE_NAME);
    var mathBase = placedBase(graphBase, MATH_SDK_PACKAGE);
    return {
        // THE package root: the GRAPH (immutable per build) at its lib-identity placement.
        '__frqtlRoot':            webBase + '/',
        'assets/models/':         webBase + '/js/models/',
        // The experiment pages are ENTRIES: resolve('experiments/{id}/index.html') is the fixed page,
        // which itself points into the graph.
        'experiments/':           entryBase + '/experiments/',
        // Math + notebook lanes anchored SAME-ORIGIN into the co-served payload —
        // the deliberate divergence from CDN_PROFILE. See the factory docstring.
        '__mathSdkUrl':           mathBase + '/index.js',
        '__mathWasmUrl':          mathBase + '/wasm/egpt_math_sdk_wasm_bg.wasm',
        '__mathWasmModuleUrl':    mathBase + '/wasm/egpt_math_sdk_wasm.js',
        '__mathBackend':          'wasm-math',
        // Notebooks come from the frqtl-web dist's OWN copy (build.js copyDir
        // lib/notebooks → dist/notebooks) — NOT under egpt-math-sdk (design §A.3/§B.1).
        '__notebookBase':         webBase + '/notebooks',
        // Vendor import-map root — frqtl-web's OWN dist/vendor/ (same as CDN, self-
        // sufficient), just same-origin instead of jsdelivr.
        '__vendorBase':           webBase + '/vendor'
    };
}

// The static site's sdk directory, relative to the site's document (site-graph.js::SITE_GRAPH_DIR);
// the entries sit directly in it, the graph under its build-stamped child.
var STATIC_SDK_DIR = './' + SITE_GRAPH_DIR;

/**
 * The validated build id, or a thrown error naming what was supplied.
 * @param {string} build
 * @returns {string}
 */
function assertSiteBuildId(build) {
    if (typeof build !== 'string' || !SITE_BUILD_ID_RE.test(build)) {
        throw new Error('[engineRouter] the static site build id must match ' + SITE_BUILD_ID_RE +
            ' (the bundle\'s <html ' + SITE_BUILD_ATTR + '>), got ' + JSON.stringify(build) + '.');
    }
    return build;
}

/**
 * The build-stamped graph directory, relative to the document — './pub/<build>'. The ONE
 * spelling of the stamped prefix.
 * @param {string} build
 * @returns {string}
 */
function staticGraphDir(build) {
    return STATIC_SDK_DIR + '/' + assertSiteBuildId(build);
}

function _requireDocumentBase(documentBaseURI) {
    if (!documentBaseURI) {
        throw new Error('[engineRouter] mode:"static" resolves against the document — no document.baseURI here. ' +
            'Outside a browser pass opts.documentBaseURI (the URL of the directory serving the static site).');
    }
    return documentBaseURI;
}

/**
 * The static GRAPH's absolute base for a document: staticGraphDir(build) resolved against the
 * document's base URI (e.g. 'https://h/prod/app/site/index.html?preset=author', 'ab12cd34' →
 * 'https://h/prod/app/site/pub/ab12cd34'). FAILS LOUD without a base URI or a valid build id.
 * @param {string} documentBaseURI
 * @param {string} build
 * @returns {string}
 */
function staticSdkBase(documentBaseURI, build) {
    return new URL(staticGraphDir(build), _requireDocumentBase(documentBaseURI)).href;
}

/**
 * The static ENTRY directory's absolute base for a document (e.g. 'https://h/prod/app/site/pub')
 * — where the fixed HTML entries live.
 * @param {string} documentBaseURI
 * @returns {string}
 */
function staticEntryBase(documentBaseURI) {
    return new URL(STATIC_SDK_DIR, _requireDocumentBase(documentBaseURI)).href;
}

/**
 * The build id a static document carries on <html SITE_BUILD_ATTR>. THROWS when absent.
 * @returns {string}
 */
function documentSiteBuild() {
    var attr = (typeof document !== 'undefined' && document.documentElement &&
        typeof document.documentElement.getAttribute === 'function')
        ? document.documentElement.getAttribute(SITE_BUILD_ATTR) : null;
    if (!attr) {
        throw new Error('[engineRouter] mode:"static": this document carries no build stamp (<html ' +
            SITE_BUILD_ATTR + '>) — only the assembled bundle\'s pages can resolve the stamped graph ' +
            '(make static-deploy).');
    }
    return assertSiteBuildId(attr);
}

// The static IDE bundle's own chunk directory (vite assetsDir), relative to the document. Not
// `assets/`: the DeSciX platform routes `/assets/` on an app subdomain to app MEDIA, not the site.
var STATIC_APP_ASSETS_DIR = 'app-assets';
// The ONE stable-named (unhashed) static entry: the host-view declarer, which a publisher's
// front page beside the IDE loads by name. apps/ide/vite.config.js emits it here and the static
// URL gate asserts it is served (and that it imports nothing a release can delete).
var STATIC_HOST_VIEW_ENTRY = STATIC_APP_ASSETS_DIR + '/host-view.js';

// Parity assertion: all FOUR profiles must cover identical non-private keys.
// Private keys begin with '__'. The static profile is a factory; a sample instance is checked.
var _assertProfileParity = (function () {
    var STATIC_SAMPLE = buildStaticProfile(staticGraphDir('00000000'), STATIC_SDK_DIR);
    var devKeys    = Object.keys(DEV_CORE_PROFILE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    var distKeys   = Object.keys(DIST_PROFILE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    var cdnKeys    = Object.keys(CDN_PROFILE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    var staticKeys = Object.keys(STATIC_SAMPLE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    if (devKeys.join(',') !== distKeys.join(',') ||
        devKeys.join(',') !== cdnKeys.join(',') ||
        devKeys.join(',') !== staticKeys.join(',')) {
        throw new Error('[engineRouter] Profile parity FAIL: dev/dist/cdn/static profiles have different path keys.\n' +
            'dev:    ' + devKeys.join(', ') + '\n' +
            'dist:   ' + distKeys.join(', ') + '\n' +
            'cdn:    ' + cdnKeys.join(', ') + '\n' +
            'static: ' + staticKeys.join(', '));
    }
    // The vendor base (__vendorBase) is a PRIVATE key but it MUST exist in ALL
    // FOUR profiles (the single path authority for the /vendor URL space — every
    // host resolves a realm import-map base through it). Assert it explicitly so a
    // profile can never half-define it (§2a.4).
    if (!DEV_CORE_PROFILE.__vendorBase || !DIST_PROFILE.__vendorBase ||
        !CDN_PROFILE.__vendorBase || !STATIC_SAMPLE.__vendorBase) {
        throw new Error('[engineRouter] Profile parity FAIL: __vendorBase must be defined in ALL FOUR profiles.');
    }
    return true;
})();

// ── engineRouter factory ─────────────────────────────────────────────────────

/**
 * @typedef {object} EngineRouter
 * @property {(relPath: string) => string} resolve
 *   Map a frqtl-relative path (e.g. `'experiments/_shared/boot.js'`) to an absolute URL
 *   according to the active profile. Returns `''` for paths omitted in dist (rule 5).
 * @property {'wasm'} engine
 *   The physics engine — always 'wasm' (FRQTL is WASM-only). Consumers read this;
 *   never hardcode an engine id above the shim.
 * @property {string} mathSdkUrl       — egpt-math-sdk bundle URL.
 * @property {string} mathWasmUrl      — WASM math bridge binary URL.
 * @property {string} mathWasmModuleUrl — WASM math bridge glue module URL.
 * @property {string} mathBackend      — active math backend id (`'js-reference'` | `'wasm-math'`).
 * @property {string} notebookBase     — curated-notebook URL base (dev: `/notebooks`).
 * @property {string} vendorBase       — placed-vendor URL base (dev: `/vendor`); the
 *   import-map base for realm bare-specifier imports (vendor-importmap.buildImportMap).
 */

/**
 * Create an engine router for the given mode and engine.
 *
 * @param {object} [opts]
 * @param {'dev-core'|'dist'|'cdn'|'static'} [opts.mode='dev-core']
 *   `'dev-core'` uses the `lib/server` plugin mounts (`/frqtl`, `/fat`).
 *   `'dist'` uses the flat `sdk/frqtl-web/dist` layout, same-origin RELATIVE paths.
 *   `'cdn'` uses the SAME dist layout resolved to ABSOLUTE jsdelivr URLs (static
 *   hosting with no server).
 *   `'static'` uses the SAME dist layout resolved to ABSOLUTE URLs under the site's
 *   build-stamped `./pub/<build>` directory (experiment entries at `./pub/experiments/`),
 *   anchored at the document (`opts.documentBaseURI`, default `document.baseURI`), with the
 *   math + notebook lanes co-served in the same tree — so the site works under any path
 *   prefix. `opts.base` THROWS in this mode: the static base is derived, never supplied.
 * @param {'wasm'} [opts.engine='wasm']
 *   Physics engine. FRQTL is WASM-only; an explicit `'js'` throws (archived).
 * @param {string} [opts.mathSdkUrl]
 *   Override the egpt-math-sdk URL. Falls back to `window._egptMathSdkUrl` then
 *   the profile default.
 * @param {string} [opts.mathWasmUrl]
 *   Override the WASM math bridge binary URL.
 * @param {string} [opts.mathWasmModuleUrl]
 *   Override the WASM math bridge glue module URL.
 * @param {string} [opts.mathBackend]
 *   Override the math backend id. `'wasm'` is normalized to `'wasm-math'`. Falls
 *   back to `?mathBackend=` URL param then the profile default (`__mathBackend`:
 *   `'js-reference'` for DEV_CORE_PROFILE, `'wasm-math'` for every distribution profile).
 * @param {boolean} [opts.documentRelative]
 *   **`mode:'static'` ONLY.** Resolve to DOCUMENT-RELATIVE values (`./pub/<build>/...`)
 *   instead of anchoring at a document — for a build-time consumer whose output the document
 *   itself resolves (the static import map baked into index.html). Requires `opts.build`.
 *   Throws with any other mode, or together with `opts.documentBaseURI`.
 * @param {string} [opts.build]
 *   **`mode:'static'` ONLY.** The site build id (`SITE_BUILD_ID_RE`). In a browser it is READ
 *   from the document's `<html SITE_BUILD_ATTR>` and must not be supplied; outside a browser
 *   (`documentBaseURI` / `documentRelative` — the build, the assembler, tests) it is required.
 * @param {string} [opts.documentBaseURI]
 *   **`mode:'static'` ONLY.** The document URL the static site is served from (default
 *   `document.baseURI`). Supplied only outside a browser (the deploy assembler, tests) —
 *   e.g. `resolve('assets/vendor/monaco/vs')` with `'https://h/prod/app/site/'` and build
 *   `'ab12cd34'` → `'https://h/prod/app/site/pub/ab12cd34/frqtl/assets/vendor/monaco/vs'`.
 * @param {string} [opts.base]
 *   **`mode:'cdn'` ONLY.** The absolute URL of the dist root every resolved URL is anchored at.
 *   Omitted: `CDN_BASE`, the published jsdelivr copy of this version. Supplied: the SELF-HOSTED
 *   form — a URL serving an UNMODIFIED copy of the package's `dist/` tree (every file
 *   `dist/dist-manifest.json` lists, byte for byte, at its relative path; a subset is
 *   unsupported). It must be absolute with no trailing slash, else this THROWS naming it
 *   (`assertDistBase`). The math lane (`mathSdkUrl`, `notebookBase`) is NOT re-anchored: it is
 *   the sibling package's CDN copy. Ignored for `mode:'dev-core'|'dist'`; throws for `'static'`.
 *   Consumer guide: docs/public/frqtl-sdk/COMPOSE_AND_CAPTURE.md, "Self-hosting the SDK".
 * @returns {EngineRouter}
 *
 * @example
 * import { engineRouter } from 'lib/shim';
 *
 * // Dev mode (used by apps/ide during `vite dev`):
 * const devRouter = engineRouter({ mode: 'dev-core', engine: 'wasm' });
 * console.log(devRouter.mathSdkUrl); // '/egpt-src/index.js'
 *
 * // Dist mode (used by sdk/frqtl-web/build.js for the packaged shell):
 * const distRouter = engineRouter({ mode: 'dist', engine: 'wasm' });
 * console.log(distRouter.resolve('experiments/_shared/boot.js')); // '../../frqtl/experiments/_shared/boot.js'
 *
 * // CDN mode (static hosting — the artifact host shell has no server, no page anchor):
 * const cdnRouter = engineRouter({ mode: 'cdn', engine: 'wasm' });
 * console.log(cdnRouter.resolve('compat/engine.js'));
 * // 'https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.1-p3.2/dist/frqtl/compat/engine.js'
 *
 * // CDN mode, self-hosted: a copy of dist/ served from the consumer's own origin:
 * const selfHosted = engineRouter({ mode: 'cdn', engine: 'wasm', base: 'https://example.org/vendor/frqtl-web/dist' });
 * console.log(selfHosted.resolve('compat/engine.js'));
 * // 'https://example.org/vendor/frqtl-web/dist/frqtl/compat/engine.js'
 * console.log(selfHosted.distBase);   // 'https://example.org/vendor/frqtl-web/dist'
 */
// The static profile for engineRouter's opts — the build id read from the document in a
// browser, supplied outside one; never both, never neither.
function _staticProfileFor(opts) {
    var offDocument = !!(opts.documentRelative || opts.documentBaseURI);
    if (offDocument && opts.build === undefined) {
        throw new Error('[engineRouter] mode:"static" outside a browser needs opts.build — the site build id ' +
            'the stamped graph directory is named by (scripts/site-build.mjs siteBuildId()).');
    }
    if (!offDocument && opts.build !== undefined) {
        throw new Error('[engineRouter] mode:"static" in a browser reads the build from <html ' + SITE_BUILD_ATTR +
            '>; remove opts.build:' + JSON.stringify(opts.build) + '.');
    }
    if (opts.documentRelative) {
        return buildStaticProfile(staticGraphDir(opts.build), STATIC_SDK_DIR);
    }
    var doc = _requireDocumentBase(opts.documentBaseURI || (typeof document !== 'undefined' ? document.baseURI : ''));
    var build = offDocument ? opts.build : documentSiteBuild();
    return buildStaticProfile(staticSdkBase(doc, build), staticEntryBase(doc));
}

/**
 * The game layer's lib-identity prefixes (router-relative): every path under one resolves under the
 * profile's package root (`__frqtlRoot`) at its lib path — 'shim/…' as itself, everything else under
 * 'frqtl/'. The module graph needs nothing more: a module locates its imports relative to itself.
 */
var LIB_IDENTITY_PREFIXES = Object.freeze(['assets/vendor/', 'compat/', 'objects/', 'parts/', 'experiments/_shared/', 'scenes/', 'shim/']);

/**
 * Map a frqtl-relative path through a profile: a lib-identity path under the package root, else the
 * FIRST matching public prefix (insertion order). Returns null when nothing matches — the caller decides
 * what an unmapped path means.
 * @param {object} profile
 * @param {string} relPath
 * @returns {string|null}
 */
export function resolveInProfile(profile, relPath) {
    for (var j = 0; j < LIB_IDENTITY_PREFIXES.length; j++) {
        if (relPath.indexOf(LIB_IDENTITY_PREFIXES[j]) === 0) {
            return profile.__frqtlRoot + (relPath.indexOf('shim/') === 0 ? relPath : 'frqtl/' + relPath);
        }
    }
    var keys = Object.keys(profile).filter(function (k) { return k.indexOf('__') !== 0; });
    for (var i = 0; i < keys.length; i++) {
        var prefix = keys[i];
        if (relPath === prefix || relPath.indexOf(prefix) === 0) {
            return profile[prefix] + relPath.slice(prefix.length);
        }
    }
    return null;
}

export function engineRouter(opts) {
    opts = opts || {};
    var mode     = opts.mode     || 'dev-core';
    var engine   = opts.engine   || 'wasm';
    // FRQTL physics is WASM-only. An explicit 'js' request FAILS LOUD — the JS
    // reference engine is archived, not a runtime backend.
    if (engine === 'js') {
        throw new Error('[engineRouter] JS reference engine archived — FRQTL is WASM-only. ' +
            'Remove engine:"js"; the only FRQTL physics engine is the compiled Rust/WASM engine.');
    }
    if (mode === 'static' && opts.base) {
        throw new Error('[engineRouter] mode:"static" takes no opts.base — the static base is derived from the ' +
            'document (STATIC_SDK_DIR against document.baseURI). Remove base:' + JSON.stringify(opts.base) + '.');
    }
    if (opts.documentRelative && mode !== 'static') {
        throw new Error('[engineRouter] opts.documentRelative applies only to mode:"static" (got mode:"' + mode + '").');
    }
    if (opts.documentRelative && opts.documentBaseURI) {
        throw new Error('[engineRouter] opts.documentRelative and opts.documentBaseURI are exclusive — a ' +
            'document-relative router is anchored at no document.');
    }
    if (opts.build !== undefined && mode !== 'static') {
        throw new Error('[engineRouter] opts.build applies only to mode:"static" (got mode:"' + mode + '").');
    }
    var profile  = mode === 'dist'
        ? DIST_PROFILE
        : (mode === 'cdn'
            ? (opts.base !== undefined ? buildCdnProfile(opts.base) : CDN_PROFILE)
            : (mode === 'static'
                ? _staticProfileFor(opts)
                : DEV_CORE_PROFILE));

    function resolve(relPath) {
        // Check the __distOmit list first: files omitted in dist return '' (signal to skip).
        var omitList = profile.__distOmit;
        if (omitList && Array.isArray(omitList)) {
            for (var oi = 0; oi < omitList.length; oi++) {
                if (relPath === omitList[oi]) { return ''; }
            }
        }
        var mapped = resolveInProfile(profile, relPath);
        if (mapped !== null) { return mapped; }
        // Fallback: the dev-core /frqtl mount serves lib/frqtl 1:1. Every other profile maps a
        // FLATTENED or re-anchored tree, where a root-absolute '/frqtl/' guess is a silent 404
        // — so an unmapped path there fails loud and names the profile key to add.
        if (profile !== DEV_CORE_PROFILE) {
            throw new Error('[engineRouter] mode:"' + mode + '" has no profile prefix for "' + relPath + '". ' +
                'Add the prefix to every profile in lib/shim/engine/router.js (profile parity).');
        }
        return '/frqtl/' + relPath;
    }

    // Resolve the math SDK URL:
    // 1. Caller-supplied explicit override always wins.
    // 2. window._egptMathSdkUrl (runtime injection used by dist shell).
    // 3. Profile __mathSdkUrl entry (authoritative default per environment).
    var mathSdkUrl = opts.mathSdkUrl
        || (typeof window !== 'undefined' && window._egptMathSdkUrl)
        || profile.__mathSdkUrl
        || '';

    var mathWasmUrl = opts.mathWasmUrl
        || (typeof window !== 'undefined' && window._egptMathWasmUrl)
        || profile.__mathWasmUrl
        || '';

    var mathWasmModuleUrl = opts.mathWasmModuleUrl
        || (typeof window !== 'undefined' && window._egptMathWasmModuleUrl)
        || profile.__mathWasmModuleUrl
        || '';

    // Resolve the math backend id.
    // URL param ?mathBackend=wasm|js-reference|wasm-math takes the lowest priority
    // (can be overridden by the caller).  'wasm' is a friendly alias for 'wasm-math'.
    // Profile __mathBackend is the environment default; caller opts.mathBackend wins.
    var _urlMathBackend = '';
    if (typeof window !== 'undefined' && typeof URLSearchParams !== 'undefined') {
        try {
            _urlMathBackend = new URLSearchParams(window.location.search).get('mathBackend') || '';
        } catch (_) { /* ignore in non-browser */ }
    }
    var mathBackend = opts.mathBackend
        || _urlMathBackend
        || profile.__mathBackend;
    // Normalise friendly alias: 'wasm' → 'wasm-math'.
    if (mathBackend === 'wasm') { mathBackend = 'wasm-math'; }

    // Notebook URL base (dev=/notebooks, dist=../../../egpt-math-sdk/notebooks).
    // Single path authority for the curated-notebook URL space — surfaces never
    // derive it; FraqtlIde threads it into the notebook browser/pane as a prop.
    var notebookBase = profile.__notebookBase || '/notebooks';

    // Vendor URL base (dev=/vendor, dist=../../../egpt-math-sdk/vendor). Single path
    // authority for the placed-vendor URL space — the notebook surfaces NEVER derive
    // '/vendor'; the dev serve-time splice and the static bake build the import-map base from
    // THIS (vendor-importmap.buildImportMap(manifest, router.vendorBase)).
    var vendorBase = profile.__vendorBase || '/vendor';

    return {
        resolve:           resolve,
        // THE game-layer fact of this profile: the lib-identity package root (ends in '/').
        frqtlRoot:         function () { return profile.__frqtlRoot; },
        // The physics engine — always 'wasm' (FRQTL is WASM-only). Consumers
        // (e.g. the notebook realm-frqtl descriptor) READ this instead of hardcoding
        // an engine or sniffing an audience flag (the dependency-map rule: never an
        // `if (audience) engine='wasm'` branch above the shim).
        engine:            engine,
        mathSdkUrl:        mathSdkUrl,
        mathWasmUrl:       mathWasmUrl,
        mathWasmModuleUrl: mathWasmModuleUrl,
        mathBackend:       mathBackend,
        notebookBase:      notebookBase,
        vendorBase:        vendorBase,
        // mode:'cdn' only: the absolute dist root this router anchors at (opts.base, else
        // CDN_BASE) — what a boot names when that root serves nothing. null in every other mode.
        distBase:          mode === 'cdn' ? (opts.base || CDN_BASE) : null
    };
}


// Export profiles for the sdk build to consume.
export { LIB_IDENTITY_PREFIXES, DEV_CORE_PROFILE, DIST_PROFILE, CDN_PROFILE, STATIC_SDK_DIR, STATIC_APP_ASSETS_DIR, STATIC_HOST_VIEW_ENTRY, CDN_SDK_VERSION, CDN_MATH_SDK_VERSION, CDN_BASE, cdnDistBaseFor, CDN_MATH_BASE, buildCdnProfile, buildDistProfile, buildStaticProfile, staticGraphDir, staticSdkBase, staticEntryBase };
