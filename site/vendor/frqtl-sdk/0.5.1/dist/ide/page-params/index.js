/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/page-params — the URL-param routing-table contract for canonical
 * experiment pages (WS gym-controls-as-sugar Bite 3 item 0 — "the CEO ruled the
 * param contract gets designed properly now and built WITH Bite 3", FINAL
 * design circulated + converged).
 *
 * Peer of `lib/shim/frame-data`, `lib/shim/expr/ast-schema`, `lib/shim/controls` —
 * same file/export layout convention: a closed vocabulary + dual CommonJS/`window`
 * export (`window.PageParams`), so both Node tests and plain `<script>`-loaded
 * experiment pages can consume it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Four shared page-side files independently read `window.location.search` for
 * their OWN URL param, each with a hand-typed literal key string:
 *   - `lib/frqtl/experiments/_shared/fx-experiment.js` reads `seed`.
 *   - `lib/frqtl/experiments/_shared/render-boot.js` reads `renderer`.
 *   - `lib/frqtl/experiments/_shared/engine-boot.js` reads `engine`.
 * Plus one HOST-COMPOSITION token read INLINE (not by a downstream reader
 * module) by `lib/frqtl/experiments/_shared/stack-boot.js`'s own synchronous
 * `_applyChrome()` IIFE: `chrome`.
 *
 * A `reader` need not be a `_shared` boot file: `stepping` (ws-walk-unification
 * Bite 1) is read by ONE experiment page's own inline sketch, because it is a
 * per-universe PHYSICS option that page ferries into its own `universe.init()`
 * — the registry's job is that the KEY NAME has exactly one owner, wherever the
 * single reader lives (see that entry's own note for the hoist rule when a
 * second page wants it).
 *
 * This module codifies that vocabulary as ONE table (`PAGE_PARAMS`) plus a
 * sibling table for the host-token (`HOST_TOKENS`) — converged design decision:
 * `chrome` differs in KIND from the other four (see HOST_TOKENS doc below), so
 * it does NOT belong in PAGE_PARAMS even though it is also page-URL-driven.
 *
 * ── Delivery: live import via stack-boot's ENGINE array ─────────────────────
 *
 * This file is loaded as an EARLY entry in `stack-boot.js`'s `ENGINE` array —
 * exact precedent: `/lib/shim/expr/ast-schema.js` and `/lib/shim/frame-data/
 * index.js` already load this way (absolute path, static `<script>` tag, served
 * by the SAME `/lib/shim` mount every host shares — `lib/server/mounts.js`).
 * `stack-boot.js`'s ENGINE phase executes in list order and ends with `engine-boot.js`,
 * and `render-boot.js` ends the RENDERER phase that starts only after it resolves, so
 * `window.PageParams` is set before either boot script runs and before any
 * `data-page-scripts` entry (`fx-experiment.js`) runs (GAME phase, later still).
 * `engine-boot.js`, `render-boot.js`, and `fx-experiment.js` therefore live-import
 * their key names from `window.PageParams.KEYS` (a named FAIL-LOUD guard,
 * mirroring `lib/frqtl/objects/objects/actionCompiler.js`'s `_getAstSchema()`
 * pattern) instead of a bare string literal.
 *
 * `chrome` CANNOT live-import: `stack-boot.js`'s `_applyChrome()` runs
 * synchronously at the very top of stack-boot.js's OWN execution, before ANY
 * `<script>` tag (including this one) has been injected — by design (it sets
 * `data-chrome="canvas"` on `<html>` immediately so CSS can suppress chrome
 * elements before first paint; deferring it to await an async script load would
 * reintroduce the FOUC it exists to prevent). `chrome`'s key name therefore stays
 * a LITERAL in stack-boot.js, held to the contract via a parity test (mirrors the
 * GAME array's own literal-copy + `game-layer-manifest.test.mjs` parity-test
 * precedent) — not a live import.
 *
 * ── page-params is a STATIC ROUTING REGISTRY, not a control schema ──────────
 *
 * Unlike `lib/shim/controls` (live, runtime-mutable descriptors with a
 * throw-or-apply `normalize()`), page-params is LOAD-TIME-ONLY: every entry is
 * read exactly once, at page boot, from the URL. There is deliberately NO
 * `normalize()` here — the tables are frozen static data, not runtime input to
 * validate. The two contracts are ADJACENT (both are consumed by the same
 * experiment pages, and Bite-3's controls-panel work will touch both) but are
 * NEVER unified into one schema/kind-union.
 *
 * Usage:
 *   const { KEYS, PAGE_PARAMS, HOST_TOKENS, FORWARDABLE_PARAMS } =
 *       require('lib/shim/page-params');
 *   // page-side (browser <script>, dual-mode):
 *   var seed = new URLSearchParams(window.location.search).get(window.PageParams.KEYS.SEED);
 *   // host-side (features/apps, forwarding a deep link into an embedded iframe):
 *   FORWARDABLE_PARAMS.forEach(function (key) { ... });
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — the same wrapper every
//    game-layer object and renderer authority carries). This file loads in the
//    browser as a classic <script> from stack-boot.js, and classic scripts share ONE
//    global lexical environment: an unwrapped top-level `function _fail(...)` here
//    silently OVERWRITES a same-named helper in a sibling script (last loaded wins),
//    which is invisible to `node --test` by construction because Node gives each
//    require()d file its own module scope. Everything below is PRIVATE; the only
//    things that reach the shared scope are the explicit `module.exports` (CJS) /
//    `window.<Namespace>` (browser) assignments at the bottom — the file's dual-mode
//    export layout is unchanged. Enforced by
//    lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

/**
 * KEYS — the canonical URL param key strings, named for ergonomic/live-import
 * access (`window.PageParams.KEYS.SEED` reads better at a call site than
 * `window.PageParams.PAGE_PARAMS[0].key`). Every `PAGE_PARAMS` entry's `key`
 * field references one of these — same value, same reference — so `KEYS` and
 * `PAGE_PARAMS` can never drift apart.
 */
var KEYS = Object.freeze({
    SEED:               'seed',
    RENDERER:           'renderer',
    ENGINE:             'engine',
    STEPPING:           'stepping'
});

/**
 * PAGE_PARAMS — every URL param a canonical experiment page's SHARED reader
 * modules accept, `{ key, reader, forward, why? }`:
 *   key     — one of KEYS.
 *   reader  — a repo-root-relative path to the file that reads this key. The
 *             conformance test derives its per-key source-file assertion FROM
 *             this field — never a test-side hand map (schema-mirror-drift
 *             discipline: the owner exports the reader location, consumers/
 *             tests ferry it).
 *   forward — true: a HOST embedding the page in an iframe (the GYM, a future
 *             control panel, …) may forward this key from its own URL.
 *             false: never forward (see `why`).
 *   why     — REQUIRED when forward is false (conformance-checked).
 */
var PAGE_PARAMS = Object.freeze([
    Object.freeze({
        key:     KEYS.SEED,
        reader:  'lib/frqtl/experiments/_shared/fx-experiment.js',
        forward: true
    }),
    Object.freeze({
        key:     KEYS.RENDERER,
        reader:  'lib/frqtl/experiments/_shared/render-boot.js',
        forward: true
    }),
    Object.freeze({
        key:     KEYS.STEPPING,
        reader:  'lib/frqtl/experiments/single-source-interference/index.html',
        forward: true
        // ws-walk-unification Bite 1 (architect circulation ruling §2). `stepping`
        // selects the WAVE-WALK STEPPING SAMPLER for one universe —
        // 'fixed' (deterministic error-accumulator walk, the engine's serde default)
        // vs 'average' (the historic per-axis Bernoulli walk). It is a PER-UNIVERSE
        // PHYSICS option, so it is read at the PAGE plane and ferried RAW into that
        // page's own `universe.init(..., { stepping })` options — deliberately NOT by
        // engine-boot.js, which selects the BACKEND (`?engine=`, forward:false). Putting
        // a physics knob in engine-boot would conflate the two axes.
        //
        // forward:true — unlike `?engine=`, no host owns a competing stepping authority,
        // and a host embedding this page for an A/B (the GYM Compare shape) forwarding
        // its own `?stepping=` is exactly the intended use (the `?renderer=`/`?seed=`
        // precedent). The value is NEVER validated or defaulted page-side: an absent
        // param means the key is omitted from the init bag so the ENGINE's default
        // (the Rust `Stepping` serde enum, `Fixed`) is the ONE authority for it, and a
        // garbage value rides through to `universe.init()`, which throws naming both
        // legal samplers (one validator, zero second interpreters).
        //
        // SCALING (pre-registered, not built): a PAGE_PARAMS entry names ONE reader.
        // When a SECOND page consumes `?stepping=`, HOIST the read into one shared
        // reader module and repoint this entry — never a second entry for the same
        // key, never a copy-pasted inline read.
    }),
    Object.freeze({
        key:     KEYS.ENGINE,
        reader:  'lib/frqtl/experiments/_shared/engine-boot.js',
        forward: false,
        why: 'the host\'s own physics-engine selector (e.g. the GYM\'s Benchmark/' +
             'Compare engine dropdown) is the SOLE authority for this axis; ' +
             'forwarding an outer ?engine= would let it silently override an ' +
             'explicit host choice, which is exactly the engine-sniffing-from-' +
             'above-the-shim class of bug this codebase forbids elsewhere'
    })
]);

/**
 * HOST_TOKENS — host-composition tokens applied INLINE by a script's own
 * synchronous top-level code — NEVER read by a downstream "reader module" the
 * way PAGE_PARAMS entries are, so the `{key, reader, forward, why}` shape does
 * not fit them: `{ key, appliedBy, forward, why, acceptedValues }`.
 *   appliedBy      — a short label naming the inline mechanism (not a file
 *                    path — there is no separate reader file to point at).
 *   acceptedValues — the CLOSED set of legal values for this token (frozen
 *                    array). The single canonical vocabulary — never
 *                    hand-duplicated by a consumer (e.g.
 *                    `lib/features/ide/presets.js`'s `withHostChrome` reads
 *                    THIS list to validate a token at construction time,
 *                    rather than re-listing `['canvas']` itself); `stack-
 *                    boot.js`'s own `_applyChrome()` IIFE stays a literal
 *                    (cannot live-import, see `why` below) but is held to
 *                    this SAME list via the parity test.
 *
 * ── WHEN should a host set `chrome=canvas`? (the criterion, canonical home) ──
 *
 * A host sets `chrome=canvas` IFF its own chrome REPLICATES-OR-SUPERSETS the
 * embedded experiment page's own control surface — i.e. the host provides an
 * equivalent (or richer) way to reach every knob the experiment's own
 * `.experiment-controls`/metrics chrome would otherwise show, so showing the
 * page's raw chrome bar inside the host's viewport would be pure redundancy,
 * never a loss of capability. Two worked, OPPOSITE applications of this ONE
 * rule (read them side by side — this is not "some hosts hide chrome,
 * others don't" as a per-host preference; it is one test with two different
 * answers):
 *   - The GYM (`CompareView.jsx`, WS gym-controls-as-sugar Bite 2 ruling):
 *     OMITS `chrome=` entirely (full chrome renders in-iframe). The GYM's own
 *     host chrome is deliberately minimal (Run/Pause/camera/rates only) — it
 *     does NOT replicate the physics-parametric controls (temperature,
 *     wavelength, density sweeps, …) every experiment declares, so hiding the
 *     experiment's own chrome would strictly REMOVE capability from the GYM
 *     user with no host-side equivalent to fall back on.
 *   - Studio (`AuthorView.jsx`, Bite 4 "Studio adoption"): SETS
 *     `chrome=canvas`. Studio's own chrome already replicates-or-supersets
 *     the experiment's control surface for its purposes: a Design/Run/Pause
 *     topbar, an Effects palette (backdrop/water toggles), and a fully
 *     generic per-object schema Inspector that can edit ANY field of ANY
 *     authored object — a SUPERSET of what any single experiment's own
 *     control bar could show. Showing the raw chrome bar too would be
 *     redundant and cramped inside Studio's constrained canvas pane, exactly
 *     the "gallery-tile-style, host-chrome-owns-everything" case this token
 *     was built for.
 * A future host applies the SAME test: does my own chrome already cover
 * (or exceed) what the embedded page's chrome offers? If yes → `chrome=
 * canvas`. If no (the host chrome is thinner than the experiment's own) →
 * omit `chrome=` and let the experiment's own chrome render.
 */
var HOST_TOKENS = Object.freeze([
    Object.freeze({
        key:            'chrome',
        appliedBy:      'stack-boot-iife',
        forward:        false,
        acceptedValues: Object.freeze(['canvas']),
        why: 'chrome is a HOST-COMPOSITION decision (whether the experiment\'s own ' +
             'control chrome DOM renders), never a per-experiment physics/render ' +
             'parameter; forwarding it from an outer host URL into an embedded ' +
             'iframe would reintroduce the hidden-experiment-chrome bug fixed in ' +
             'WS gym-controls-as-sugar Bite 2 (the GYM must always show the ' +
             'experiment\'s own full chrome, never chrome=canvas — see the ' +
             '"WHEN should a host set chrome=canvas" doc above for the general ' +
             'criterion, not just the GYM\'s specific answer to it). Read+applied ' +
             'synchronously by stack-boot.js\'s _applyChrome() IIFE BEFORE any ' +
             '<script> tag (including this contract module) has loaded, so it ' +
             'cannot live-import the key name either — literal + parity-test-' +
             'bound (mirrors the GAME array vs. game-layer-manifest.js precedent)'
    })
]);

/**
 * FORWARDABLE_PARAMS — derived: every PAGE_PARAMS key with forward:true, in
 * table order. THE ONLY list a host may use to forward params into an embedded
 * experiment-page iframe (`lib/features/ide/presets.js` `buildExperimentFrameSrc`
 * consumes this — no host re-derives its own hand list).
 */
var FORWARDABLE_PARAMS = Object.freeze(
    PAGE_PARAMS.filter(function (p) { return p.forward; }).map(function (p) { return p.key; })
);

// ── Export ────────────────────────────────────────────────────────────────────

var PageParams = {
    KEYS:               KEYS,
    PAGE_PARAMS:        PAGE_PARAMS,
    HOST_TOKENS:        HOST_TOKENS,
    FORWARDABLE_PARAMS: FORWARDABLE_PARAMS
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PageParams;
} else if (typeof window !== 'undefined') {
    window.PageParams = PageParams;
}

})();
