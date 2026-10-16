/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module engineRouter
 * @description
 * The single source of truth for engine path routing.
 *
 * Four named profiles:
 *  - `DEV_CORE_PROFILE` — in-core dev mount (`lib/server` plugin serves `/frqtl`, `/fat`).
 *  - `DIST_PROFILE` — flat dist layout, same-origin RELATIVE paths (`sdk/frqtl-sdk/dist`;
 *    baked into the dist pages at build time by `sdk/frqtl-sdk/build.js`).
 *  - `CDN_PROFILE` — the SAME dist layout, resolved to ABSOLUTE jsdelivr URLs
 *    (`https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@<ver>/dist/...`) for static hosting
 *    with no server process at all (ws-artifact-showcase, CEO 2026-07-10). CDN_PROFILE is
 *    a DISTINCT profile object, not a DIST_PROFILE parameterization (locked ruling —
 *    docs/design/frqtl-artifact-showcase-scoping-2026-07-10.md §5.2): DIST_PROFILE's
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
 * // router.engineScripts() → [{src, attrs?}] ordered list
 * // router.gameScripts()   → [{src}] ordered list
 * // router.bootSrc()       → string (engine-boot.js URL)
 * // router.p5Src()         → string (p5.min.js URL)
 * // router.resolve(relPath)→ string (absolute URL for a frqtl-relative path)
 */

'use strict';

import { GAME_LAYER_SCRIPTS } from './game-layer-manifest.js';

// ── Path profiles ────────────────────────────────────────────────────────────
//
// Each profile maps a frqtl-relative prefix → URL prefix.
// The FIRST matching prefix wins (insertion order).
//
// DEV_CORE_PROFILE uses the lib/server plugin's in-process mounts:
//   /frqtl → lib/frqtl      /fat → lib/fat
//
// DIST_PROFILE uses the flat dist layout inside sdk/frqtl-sdk/dist/
// (mirrors what build.js:254-271 used to hand-synthesize into the html).

var DEV_CORE_PROFILE = {
    'assets/vendor/':         '/frqtl/assets/vendor/',
    'assets/render/':         '/frqtl/assets/render/',
    // External-geometry fixtures (lib/frqtl/assets/models/, e.g. flamingo-draco.glb) —
    // a DISTINCT prefix from assets/vendor/ (a vendored LIBRARY dir) because it is asset
    // DATA a page's own render.mesh call resolves, never library code. Added B4b so the
    // mesh-demo / single-source-interference pages resolve it through the router instead
    // of a hardcoded '/frqtl/assets/models/...' literal (the ONE path authority — see
    // module docstring).
    'assets/models/':         '/frqtl/assets/models/',
    // 'compat/providers/' MUST be listed BEFORE the general 'compat/' key below —
    // resolve() takes the FIRST matching prefix in insertion order, and a more
    // specific prefix must win over a broader one (ws-artifact-showcase Bite A2
    // architect gate 2026-07-10: see CDN_PROFILE's matching key for the full
    // rationale — dev-core's own value here is actually REDUNDANT with falling
    // through to 'compat/' below, since dev serves lib/frqtl/ as a 1:1 tree with
    // no flattening, but it is listed explicitly for 3-way profile-key parity
    // and so this prefix can never silently diverge from 'compat/' by accident).
    'compat/providers/':      '/frqtl/compat/providers/',
    'compat/':                '/frqtl/compat/',
    'objects/':               '/frqtl/objects/',
    'experiments/_shared/':   '/frqtl/experiments/_shared/',
    // General experiments/ key — MUST be listed AFTER 'experiments/_shared/'
    // (first-match-wins: the more specific _shared prefix must win). Without it,
    // resolve('experiments/{id}/index.html') fell through to the '/frqtl/'+relPath
    // default (correct in dev-core by accident, WRONG in dist/cdn/static). Added so
    // every profile can resolve a general experiment-page path, not just _shared/.
    'experiments/':           '/frqtl/experiments/',
    // Scene sketch files (lib/frqtl/scenes/<file>.js) — one readable file per scene,
    // fetched by lib/shim/registry/scene-source.js. Four-way parity.
    'scenes/':                '/frqtl/scenes/',
    // WASM pkg served from /fat/pkg-web (lib/fat full-dir mount)
    '__wasmPkgUrl':           '/fat/pkg-web/egpt_wasm.js',
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
    // STABLE root-level /vendor alias mounts.js exposes (WS-NOTEBOOK-VENDOR §2a.1).
    // A realm cell's bare-specifier import (`import * as d3 from 'd3'`) resolves via
    // a manifest-generated import-map whose base is THIS value (vendor-importmap.js).
    // Single path authority for the vendor URL space — surfaces NEVER derive '/vendor'
    // themselves; they read router.vendorBase (same discipline as __notebookBase).
    '__vendorBase':           '/vendor',
    // lib/shim contract scripts (ast-schema.js, frame-data/index.js, ...) — mounted
    // at the SAME /lib/shim root every dev-core surface already uses. Added
    // ws-artifact-showcase Bite A2 so the artifact-showcase ESM boot (and any future
    // consumer) can resolve these through the router instead of a hand-derived
    // literal (stack-boot.js still hardcodes '/lib/shim/...' directly — pre-existing,
    // out of scope here; this key exists so NEW consumers never repeat that pattern).
    'shim/':                  '/lib/shim/'
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
        'assets/vendor/':         base + '/js/lib/',
        'assets/render/':         base + '/js/consumers/',
        // External-geometry fixtures — own dist subdir (js/models/), a peer of js/lib
        // (vendor libraries) and js/consumers (renderers): build.js ships
        // lib/frqtl/assets/models/ there verbatim (§4-way parity companion below).
        'assets/models/':         base + '/js/models/',
        // 'compat/providers/' MUST precede the general 'compat/' key (first-match-wins
        // prefix order). build.js FLATTENS lib/frqtl/compat/providers/{wasm-engine,
        // wasm-load-browser}.js straight into dist/js/compat/, so this key's target is the
        // IDENTICAL base + '/js/compat/' as 'compat/' itself.
        'compat/providers/':      base + '/js/compat/',
        'compat/':                base + '/js/compat/',
        'objects/':               base + '/js/game/',
        'experiments/_shared/':   base + '/experiments/_shared/',
        // General experiments/ key — AFTER 'experiments/_shared/' (first-match-wins).
        // From dist/experiments/{id}/index.html, base + '/experiments/' == dist/experiments/.
        // Four-way parity companion to DEV_CORE/CDN/STATIC 'experiments/' below.
        'experiments/':           base + '/experiments/',
        // Scene sketch files — dist/scenes/ (build.js ships lib/frqtl/scenes/). Four-way parity.
        'scenes/':                base + '/scenes/',
        // WASM pkg — the dist's own fat/pkg-web glue (window._egptWasmPkgUrl still overrides
        // FIRST, rule 5). build.js's experiment-page writer emits each page's
        // window._egptWasmPkgUrl line from this key.
        '__wasmPkgUrl':           base + '/fat/pkg-web/egpt_wasm.js',
        // Math SDK path relative to dist/experiments/{id}/ (the page this '../..' base is for).
        // sdk/frqtl-sdk/dist/experiments/{id}/ → ../../../egpt-math-sdk/index.js
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
        // __mathSdkUrl (sdk/frqtl-sdk/dist/experiments/{id}/ → ../../../egpt-math-sdk/notebooks/).
        // The sdk build copies lib/notebooks/ → dist/notebooks/ (build.mjs copyDirFromAbs).
        '__notebookBase':         base + '/../egpt-math-sdk/notebooks',
        // Placed vendor libs in dist — same dist-relative shape as __notebookBase
        // (sdk/frqtl-sdk/dist/experiments/{id}/ → ../../../egpt-math-sdk/vendor). The sdk build
        // copies the manifest-listed vendor entries into the dist (2a-tail follow-up,
        // §8.1); the LIVE consumer is dev (apps/ide).
        '__vendorBase':           base + '/../egpt-math-sdk/vendor',
        // lib/shim contract scripts, relative to dist/experiments/{id}/ (2 levels up to
        // dist/, then into ide/ — copyCommon() copies lib/shim/ → dist/ide/ verbatim).
        // See CDN_PROFILE/DEV_CORE_PROFILE 'shim/' for the parity companions.
        'shim/':                  base + '/ide/'
    };
}

var DIST_PROFILE = buildDistProfile('../..');

// ── CDN_PROFILE (jsdelivr static hosting — ws-artifact-showcase Bite A1) ────────
//
// Pinned-version constants — the "one constant" the packet's absolute jsdelivr
// bases resolve from (docs/design/frqtl-artifact-showcase-scoping-2026-07-10.md
// §3b). These are hardcoded (not read from package.json — this module runs in
// the browser, no fs access) and MUST be bumped alongside each npm publish;
// lib/shim/engine/test/router.test.mjs asserts them against the two
// package.json#version fields so a forgotten bump fails `make verify`, not a
// silent stale-CDN-URL bug.
var CDN_SDK_VERSION = '0.5.1';       // sdk/frqtl-sdk/package.json#version — bound by router.test.mjs; bumped with each npm publish (0.5.1: the live-quanta cap in the shim's one leaf door, empty-parent slot reclaim, Blackbody and Circuit SAT declare their parts)
var CDN_MATH_SDK_VERSION = '0.3.2';  // sdk/egpt-math-sdk/package.json#version — bound by router.test.mjs; bumped with each npm publish

var CDN_BASE = 'https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@' + CDN_SDK_VERSION + '/dist';
var CDN_MATH_BASE = 'https://cdn.jsdelivr.net/npm/@descix/egpt-math-sdk@' + CDN_MATH_SDK_VERSION + '/dist';

// CDN_PROFILE mirrors DIST_PROFILE's internal dist-relative targets (both profiles
// resolve into the SAME published sdk/frqtl-sdk/dist/ tree — see build.js) but
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
// published jsdelivr copy). With one, it is the SELF-HOSTED form (eabadir/fraqtl#165 GAP 6, CEO
// approved at 4321684c item 9): any URL serving an UNMODIFIED copy of the package's dist/ tree —
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
            'dist/ directory, with no trailing slash (e.g. "https://example.org/vendor/frqtl-sdk/dist"); got ' +
            JSON.stringify(base) + '. From a page: new URL(\'./vendor/frqtl-sdk/dist\', location.href).href. (FAIL-LOUD.)');
    }
    return base;
}

function buildCdnProfile(base) {
    assertDistBase(base);
    return {
        'assets/vendor/':         base + '/js/lib/',
        'assets/render/':         base + '/js/consumers/',
        // External-geometry fixtures — same dist subdir as DIST_PROFILE (js/models/),
        // just resolved via this profile's `base`.
        'assets/models/':         base + '/js/models/',
        // 'compat/providers/' MUST precede the general 'compat/' key below —
        // resolve() takes the FIRST matching prefix in insertion order (architect
        // gate, ws-artifact-showcase Bite A2, 2026-07-10 — tester found this
        // 404ing from a real jsdelivr-shaped mirror:
        // router.resolve('compat/providers/wasm-engine.js') naively appended the
        // tail onto the general 'compat/' base, producing
        // '<base>/js/compat/providers/wasm-engine.js' — a path nothing in dist
        // serves). build.js FLATTENS lib/frqtl/compat/providers/{wasm-engine,
        // wasm-load-browser}.js straight into dist/js/compat/ (the
        // 'providers/' segment is dropped — see build.js step 1), landing them
        // alongside egpt-engine.js — so this key's target is the IDENTICAL
        // base + '/js/compat/' as 'compat/' itself, not a nested
        // '.../js/compat/providers/' a naive single-prefix resolve would produce.
        'compat/providers/':      base + '/js/compat/',
        'compat/':                base + '/js/compat/',
        'objects/':               base + '/js/game/',
        'experiments/_shared/':   base + '/experiments/_shared/',
        // General experiments/ key — AFTER 'experiments/_shared/' (first-match-wins).
        // Four-way parity companion to DEV_CORE/DIST/STATIC 'experiments/'.
        'experiments/':           base + '/experiments/',
        // Scene sketch files — dist/scenes/ (build.js ships lib/frqtl/scenes/). Four-way parity.
        'scenes/':                base + '/scenes/',
        // WASM pkg URL — absolute jsdelivr URL to the compiled Rust engine + glue.
        // window._egptWasmPkgUrl still overrides FIRST (wasm-load-browser.js:42-43);
        // this is the profile DEFAULT for a host page that sets nothing itself.
        '__wasmPkgUrl':           base + '/fat/pkg-web/egpt_wasm.js',
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
        // Vendor import-map root — frqtl-sdk's OWN dist/vendor/ (manifest-driven
        // copy, build.js copyVendorManifestToDist()). Unlike DIST_PROFILE.__vendorBase
        // (which points at the egpt-math-sdk SIBLING dist, co-served same-origin),
        // a CDN host cannot assume a sibling package is co-published
        // — frqtl-sdk must be self-sufficient for its own realm-import-map vendor
        // libs (packet §3b). Uses `base` — THIS package's own dist/vendor/.
        '__vendorBase':           base + '/vendor',
        // lib/shim contract scripts — base + '/ide/...' (copyCommon() copies
        // lib/shim/ → dist/ide/ verbatim; the CDN just serves that same sub-path
        // from jsdelivr instead of a same-origin dist mount). ws-artifact-showcase
        // Bite A2: the artifact ESM boot resolves ast-schema.js / frame-data/
        // index.js through this key rather than hand-deriving a jsdelivr URL.
        'shim/':                  base + '/ide/'
    };
}

// The default CDN profile — the SAME factory, called with the module constant.
// Every existing consumer (the parity assertion below, router.test.mjs,
// build.js's imports) gets a byte-identical object to before this refactor.
var CDN_PROFILE = buildCdnProfile(CDN_BASE);

// ── The static site profile (self-contained same-origin static host — ws-egpt-frqtl-site-deploy) ──
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
// THE DELIBERATE DIVERGENCE FROM CDN_PROFILE (architect design §A.3 / §E flag 4):
// CDN_PROFILE's math + notebook bases are hardwired CROSS-ORIGIN at CDN_MATH_BASE; the
// static-site semantic is "everything self-contained under ONE origin prefix": the math SDK
// is co-served at graphBase + '/egpt-math-sdk/...' and the curated notebooks ride the
// frqtl-sdk dist's OWN copy at graphBase + '/notebooks'. A DISTINCT profile here is the
// correct DRY call — the SAME justification that keeps CDN_PROFILE distinct from DIST_PROFILE.
//
// buildStaticProfile(graphBase, entryBase) — every GRAPH key anchors at `graphBase`; the
// general 'experiments/' key (the experiment ENTRY pages STUDIO/GYM frame) anchors at
// `entryBase`. Both are required: a host whose entries and graph share one directory passes
// the same base twice.
function buildStaticProfile(graphBase, entryBase) {
    if (!graphBase || !entryBase) {
        throw new Error('[engineRouter] buildStaticProfile(graphBase, entryBase) needs both bases (got ' +
            JSON.stringify(graphBase) + ', ' + JSON.stringify(entryBase) + ') — the graph and the entry ' +
            'pages are anchored separately; a co-served host passes the same base twice.');
    }
    return {
        'assets/vendor/':         graphBase + '/js/lib/',
        'assets/render/':         graphBase + '/js/consumers/',
        // External-geometry fixtures — same dist subdir as DIST_PROFILE (js/models/).
        'assets/models/':         graphBase + '/js/models/',
        // 'compat/providers/' MUST precede the general 'compat/' key (first-match-wins
        // prefix order) — SAME flattening as DIST/CDN: build.js drops the 'providers/'
        // segment, landing wasm-engine/wasm-load-browser alongside
        // egpt-engine.js in dist/js/compat/. Target is the IDENTICAL graphBase + '/js/compat/'.
        'compat/providers/':      graphBase + '/js/compat/',
        'compat/':                graphBase + '/js/compat/',
        'objects/':               graphBase + '/js/game/',
        'experiments/_shared/':   graphBase + '/experiments/_shared/',
        // General experiments/ key — AFTER 'experiments/_shared/' (first-match-wins). The
        // experiment pages are ENTRIES: resolve('experiments/{id}/index.html') is the fixed
        // page, which itself points into the graph.
        'experiments/':           entryBase + '/experiments/',
        // Scene sketch files are GRAPH content (immutable per build), not entries.
        'scenes/':                graphBase + '/scenes/',
        // WASM pkg — into the co-served frqtl-sdk dist.
        // window._egptWasmPkgUrl still overrides FIRST (wasm-load-browser.js).
        '__wasmPkgUrl':           graphBase + '/fat/pkg-web/egpt_wasm.js',
        // Math + notebook lanes anchored SAME-ORIGIN into the co-served payload —
        // the deliberate divergence from CDN_PROFILE. See the factory docstring.
        '__mathSdkUrl':           graphBase + '/egpt-math-sdk/index.js',
        '__mathWasmUrl':          graphBase + '/egpt-math-sdk/wasm/egpt_math_sdk_wasm_bg.wasm',
        '__mathWasmModuleUrl':    graphBase + '/egpt-math-sdk/wasm/egpt_math_sdk_wasm.js',
        '__mathBackend':          'wasm-math',
        // Notebooks come from the frqtl-sdk dist's OWN copy (build.js copyDir
        // lib/notebooks → dist/notebooks) — NOT under egpt-math-sdk (architect §A.3/§B.1).
        '__notebookBase':         graphBase + '/notebooks',
        // Vendor import-map root — frqtl-sdk's OWN dist/vendor/ (same as CDN, self-
        // sufficient), just same-origin instead of jsdelivr.
        '__vendorBase':           graphBase + '/vendor',
        // lib/shim contract scripts — copyCommon() copies lib/shim/ → dist/ide/ verbatim.
        'shim/':                  graphBase + '/ide/'
    };
}

// The static site's sdk directory, relative to the site's document. The ONLY place it is
// spelled; the entries sit directly in it, the graph under its build-stamped child.
var STATIC_SDK_DIR = './pub';

// The <html> attribute carrying the static site's build id — the cross-repo contract
// (egpt-frqtl scripts/refresh-site.sh reads it). Every reader and writer names it through here.
var SITE_BUILD_ATTR = 'data-frqtl-site-build';
// A build id: the 8-hex-digit short sha of the commit the bundle was built from.
var SITE_BUILD_ID_RE = /^[0-9a-f]{8}$/;

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

// The static IDE bundle's entry document, beside its front page. The bundle ships THIS name and no
// index.html: a site's index.html is the publisher's front page (host-view.js::HOST_FRONT_PAGE),
// which the IDE brand links home to.
var STATIC_APP_PAGE = 'app.html';

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
    // profile can never half-define it (WS-NOTEBOOK-VENDOR §2a.4).
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
 *   Map a frqtl-relative path (e.g. `'compat/egpt-engine.js'`) to an absolute URL
 *   according to the active profile. Returns `''` for paths omitted in dist (rule 5).
 * @property {'wasm'} engine
 *   The physics engine — always 'wasm' (FRQTL is WASM-only). Consumers read this;
 *   never hardcode an engine id above the shim.
 * @property {() => Array<{src:string, attrs?:Object}>} engineScripts
 *   Ordered engine-load script list (chroma → Rectangle → compat).
 * @property {() => Array<{src:string}>} gameScripts
 *   Ordered game-layer script list (object sugar + FrqtlApp).
 * @property {() => string} bootSrc    — URL of `engine-boot.js`.
 * @property {() => string} p5Src      — URL of `p5.min.js`.
 * @property {string} wasmPkgUrl       — WASM package URL (overridable via `window._egptWasmPkgUrl`).
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
 *   `'dist'` uses the flat `sdk/frqtl-sdk/dist` layout, same-origin RELATIVE paths.
 *   `'cdn'` uses the SAME dist layout resolved to ABSOLUTE jsdelivr URLs (static
 *   hosting with no server — ws-artifact-showcase).
 *   `'static'` uses the SAME dist layout resolved to ABSOLUTE URLs under the site's
 *   build-stamped `./pub/<build>` directory (experiment entries at `./pub/experiments/`),
 *   anchored at the document (`opts.documentBaseURI`, default `document.baseURI`), with the
 *   math + notebook lanes co-served in the same tree — so the site works under any path
 *   prefix. `opts.base` THROWS in this mode: the static base is derived, never supplied.
 * @param {'wasm'} [opts.engine='wasm']
 *   Physics engine. FRQTL is WASM-only; an explicit `'js'` throws (archived).
 * @param {string} [opts.wasmPkgUrl]
 *   Override the WASM pkg URL (all modes). Falls back to `window._egptWasmPkgUrl`
 *   then the profile default.
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
 *   `'ab12cd34'` → `'https://h/prod/app/site/pub/ab12cd34/js/lib/monaco/vs'`.
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
 * // Dist mode (used by sdk/frqtl-sdk/build.js for the packaged shell):
 * const distRouter = engineRouter({ mode: 'dist', engine: 'wasm' });
 * console.log(distRouter.resolve('compat/egpt-engine.js')); // '../../js/compat/egpt-engine.js'
 *
 * // CDN mode (static hosting — the artifact host shell has no server, no page anchor):
 * const cdnRouter = engineRouter({ mode: 'cdn', engine: 'wasm' });
 * console.log(cdnRouter.wasmPkgUrl);
 * // 'https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@0.1.0/dist/fat/pkg-web/egpt_wasm.js'
 *
 * // CDN mode, self-hosted: a copy of dist/ served from the consumer's own origin:
 * const selfHosted = engineRouter({ mode: 'cdn', engine: 'wasm', base: 'https://example.org/vendor/frqtl-sdk/dist' });
 * console.log(selfHosted.wasmPkgUrl);
 * // 'https://example.org/vendor/frqtl-sdk/dist/fat/pkg-web/egpt_wasm.js'
 * console.log(selfHosted.distBase);   // 'https://example.org/vendor/frqtl-sdk/dist'
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
 * Map a frqtl-relative path through a profile's FIRST matching public prefix (insertion order).
 * Returns null when no prefix matches — the caller decides what an unmapped path means.
 * @param {object} profile
 * @param {string} relPath
 * @returns {string|null}
 */
export function resolveInProfile(profile, relPath) {
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
    // reference engine is archived (internal/archive/frqtl-js-reference/), not a runtime backend.
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

    // Resolve the WASM pkg URL.
    var wasmPkgUrl = opts.wasmPkgUrl
        || (typeof window !== 'undefined' && window._egptWasmPkgUrl)
        || profile.__wasmPkgUrl;

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

    function engineScripts() {
        return [
            { src: resolve('assets/vendor/chroma.min.js') },
            // Rectangle — the sole spatial-rect authority, loaded in the ENGINE phase
            // because the WASM provider wrapper's createUniverse needs window.Rectangle
            // before the game layer runs.
            { src: resolve('objects/geometry/Rectangle.js') },
            { src: resolve('compat/providers/wasm-engine.js') },
            { src: resolve('compat/providers/wasm-load-browser.js') },
            { src: resolve('compat/egpt-engine.js') }
        ];
    }

    function bootSrc() {
        return resolve('experiments/_shared/engine-boot.js');
    }

    function gameScripts() {
        /* Derived from the single authority: lib/shim/engine/game-layer-manifest.js
           GAME_LAYER_SCRIPTS. Setup factories (objects/setup/*.js) are per-surface
           and are NOT loaded globally — each experiment/surface loads only the
           setups it needs via data-page-scripts or an explicit import. */
        return GAME_LAYER_SCRIPTS.map(function (p) { return { src: resolve(p) }; });
    }

    function p5Src() {
        return resolve('assets/vendor/p5.min.js');
    }

    // The browser projection of THIS router's profile — the SAME shape
    // spliceEnginePathMap (lib/shim/engine/experiment-page-map.js) bakes/injects into a
    // served page's window._egptEnginePathMap. One accessor, no profile leak: nothing
    // outside router.js ever touches a raw profile object (ws-stackboot-dev-map SEAM
    // RULING R1).
    function browserPathMap() {
        return buildBrowserPathMap(profile);
    }

    // Idempotent, cross-injector-safe precondition setter for a PROGRAMMATIC host that
    // injects stack-boot.js into a page it already owns (GraphicsPane.boot(),
    // ensureEngineStack()) — the third host class (stack-boot.js's own docstring).
    // Such a host must set window._egptEnginePathMap from ITS OWN router BEFORE the tag
    // executes, same precondition discipline it already applies to
    // _egptWasmPkgUrl/_egptDefaultEngine. Two routers on one page is a HOST BUG, not a
    // silent merge: present + byte-identical → no-op; present + DIFFERENT → throw
    // (naming both this router's mode and the map already on the page); absent → set.
    // Never set-if-absent-only — a stale map from an earlier/different host is exactly
    // the silent-fallback class this whole bite exists to close.
    //
    // The same call installs the map's FUNCTION FORM, the in-page path door
    // window._egptResolveFrqtl = this router's resolve (the name is a page contract,
    // lib/shim/experiment-frame/index.js EXPERIMENT_PAGE_MARKERS; readers: FrqtlVision.record,
    // render-boot). Map-equal ⇒ door-equal, so it inherits the map's idempotence and throw:
    // this is the ONE ESM-side publisher (every esm boot and the browser parity core call it);
    // stack-boot.js is the classic-realm publisher, reading the same map.
    function ensureBrowserPathMap() {
        if (typeof window === 'undefined') {
            throw new Error('[engineRouter] ensureBrowserPathMap() runs only in a browser (no window here).');
        }
        var map = browserPathMap();
        var json = JSON.stringify(map);
        var existing = window._egptEnginePathMap;
        if (existing !== undefined) {
            if (JSON.stringify(existing) === json) {                 // equal → no new map
                window._egptResolveFrqtl = resolve;
                return map;
            }
            throw new Error(
                '[engineRouter] window._egptEnginePathMap is already set to a DIFFERENT map than ' +
                'mode:"' + mode + '" projects (existing=' + JSON.stringify(existing) + ', this router=' +
                json + '). Two routers/injectors on one page is a host bug — only ONE host may set ' +
                'this page\'s engine path map.'
            );
        }
        window._egptEnginePathMap = map;   // absent → set
        window._egptResolveFrqtl = resolve;
        return map;
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
        // The physics engine — always 'wasm' (FRQTL is WASM-only). Consumers
        // (e.g. the notebook realm-frqtl descriptor) READ this instead of hardcoding
        // an engine or sniffing an audience flag (the dependency-map rule: never an
        // `if (audience) engine='wasm'` branch above the shim).
        engine:            engine,
        engineScripts:     engineScripts,
        gameScripts:       gameScripts,
        bootSrc:           bootSrc,
        p5Src:             p5Src,
        wasmPkgUrl:        wasmPkgUrl,
        mathSdkUrl:        mathSdkUrl,
        mathWasmUrl:       mathWasmUrl,
        mathWasmModuleUrl: mathWasmModuleUrl,
        mathBackend:       mathBackend,
        notebookBase:      notebookBase,
        vendorBase:        vendorBase,
        // mode:'cdn' only: the absolute dist root this router anchors at (opts.base, else
        // CDN_BASE) — what a boot names when that root serves nothing. null in every other mode.
        distBase:          mode === 'cdn' ? (opts.base || CDN_BASE) : null,
        browserPathMap:       browserPathMap,
        ensureBrowserPathMap: ensureBrowserPathMap
    };
}

/**
 * Project a router profile to the browser `window._egptEnginePathMap` contract: the
 * PUBLIC (non-`__`) prefix→replacement keys ONLY, in the profile's own insertion order
 * (first-match-wins is order-sensitive — `compat/providers/` MUST precede `compat/`,
 * `experiments/_shared/` MUST precede `experiments/`, and `shim/` MUST be present so
 * stack-boot's `_u('shim/...')` routes correctly).
 *
 * This is the ONE projection every host that serves a classic experiment page consumes —
 * `sdk/frqtl-sdk/build.js` (DIST_PROFILE, baked into the built page at build time) and
 * `lib/server/mounts.js` (DEV_CORE_PROFILE, spliced into the served page at request time,
 * ws-stackboot-dev-map). Both call THIS function on the profile object router.js already
 * owns — never a hand-written literal map — so dev/dist/cdn/static can never drift from
 * the profiles above by a second derivation (the schema-mirror-drift anti-pattern).
 *
 * `lib/frqtl/experiments/_shared/stack-boot.js` `_resolve()` and
 * `lib/components/graphics-render/index.js` `_url()` are the two `window._egptEnginePathMap`
 * READERS; this is the one WRITER-shape they both consume.
 *
 * @param {object} profile - a router profile object (e.g. DEV_CORE_PROFILE, DIST_PROFILE).
 * @returns {object} plain prefix→replacement object (private `__` keys omitted).
 */
export function buildBrowserPathMap(profile) {
    const map = {};
    for (const k of Object.keys(profile)) {
        if (k.indexOf('__') === 0) continue;   // omit private (__wasmPkgUrl, __distOmit, __math*, ...)
        map[k] = profile[k];
    }
    return map;
}

// Export profiles for the sdk build to consume.
export { DEV_CORE_PROFILE, DIST_PROFILE, CDN_PROFILE, STATIC_SDK_DIR, STATIC_APP_PAGE, STATIC_APP_ASSETS_DIR, STATIC_HOST_VIEW_ENTRY, SITE_BUILD_ATTR, SITE_BUILD_ID_RE, CDN_SDK_VERSION, CDN_MATH_SDK_VERSION, CDN_BASE, CDN_MATH_BASE, buildCdnProfile, buildDistProfile, buildStaticProfile, staticGraphDir, staticSdkBase, staticEntryBase };
