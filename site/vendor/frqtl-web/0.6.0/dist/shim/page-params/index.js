/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/page-params — the URL-param routing-table contract for canonical
 * experiment pages (gym-controls-as-sugar item 0 — the param contract designed
 * properly and built with the controls).
 *
 * Peer of `lib/shim/frame-data`, `lib/shim/expr/ast-schema`, `lib/shim/controls` —
 * same layout convention: a closed vocabulary exported as named ES-module exports,
 * imported by node tests, the boot module and the IDE alike.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Page-side readers each read their OWN URL param from the page URL; the key
 * string is never a hand-typed literal at the reader:
 *   - `lib/frqtl/experiments/_shared/fx-experiment.js` reads `seed`.
 *   - `lib/frqtl/experiments/_shared/boot.js` reads `renderer`, `engine` and the
 *     HOST-COMPOSITION token `chrome`.
 *
 * A `reader` need not be a `_shared` boot file: `stepping`
 * is read by ONE experiment page's own inline sketch, because it is a
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
 * ── Delivery: an ES-module import ───────────────────────────────────────────
 *
 * Every reader imports `KEYS` (or a table) from this module — `boot.js` statically,
 * so the key names are bound before the page's boot runs; no reader carries a
 * literal copy of a key.
 *
 * ── page-params is a STATIC ROUTING REGISTRY, not a control schema ──────────
 *
 * Unlike `lib/shim/controls` (live, runtime-mutable descriptors with a
 * throw-or-apply `normalize()`), page-params is LOAD-TIME-ONLY: every entry is
 * read exactly once, at page boot, from the URL. There is deliberately NO
 * `normalize()` here — the tables are frozen static data, not runtime input to
 * validate. The two contracts are ADJACENT (both are consumed by the same
 * experiment pages, and the controls-panel work touches both) but are
 * NEVER unified into one schema/kind-union.
 *
 * Usage:
 *   import { KEYS, PAGE_PARAMS, HOST_TOKENS, FORWARDABLE_PARAMS } from 'lib/shim/page-params/index.js';
 *   var seed = new URLSearchParams(location.search).get(KEYS.SEED);
 *   // host-side (features/apps, forwarding a deep link into an embedded iframe):
 *   FORWARDABLE_PARAMS.forEach(function (key) { ... });
 */



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
    ENGINE:             'engine'
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
        reader:  'lib/frqtl/experiments/empty/index.html',
        forward: true
    }),
    Object.freeze({
        key:     KEYS.RENDERER,
        reader:  'lib/frqtl/experiments/_shared/boot.js',
        forward: true
    }),
    Object.freeze({
        key:     KEYS.ENGINE,
        reader:  'lib/frqtl/experiments/_shared/boot.js',
        forward: false,
        why: 'the host\'s own physics-engine selector (e.g. the GYM\'s Benchmark/' +
             'Compare engine dropdown) is the SOLE authority for this axis; ' +
             'forwarding an outer ?engine= would let it silently override an ' +
             'explicit host choice, which is exactly the engine-sniffing-from-' +
             'above-the-shim class of bug this codebase forbids elsewhere'
    })
]);

/**
 * HOST_TOKENS — host-composition tokens: they change what the PAGE's own chrome
 * renders, never a physics or render parameter, so the `{key, reader, forward,
 * why}` shape does not fit them: `{ key, appliedBy, forward, why, acceptedValues }`.
 *   appliedBy      — the file that applies the token.
 *   acceptedValues — the CLOSED set of legal values for this token (frozen
 *                    array). The single canonical vocabulary — never
 *                    hand-duplicated by a consumer (`lib/features/ide/presets.js`'s
 *                    `withHostChrome` and `boot.js`'s `applyChrome` both read
 *                    THIS list).
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
 *   - The GYM (`CompareView.jsx`):
 *     OMITS `chrome=` entirely (full chrome renders in-iframe). The GYM's own
 *     host chrome is deliberately minimal (Run/Pause/camera/rates only) — it
 *     does NOT replicate the physics-parametric controls (temperature,
 *     wavelength, density sweeps, …) every experiment declares, so hiding the
 *     experiment's own chrome would strictly REMOVE capability from the GYM
 *     user with no host-side equivalent to fall back on.
 *   - Studio (`AuthorView.jsx`, "Studio adoption"): SETS
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
        appliedBy:      'lib/frqtl/experiments/_shared/boot.js',
        forward:        false,
        acceptedValues: Object.freeze(['canvas']),
        why: 'chrome is a HOST-COMPOSITION decision (whether the experiment\'s own ' +
             'control chrome DOM renders), never a per-experiment physics/render ' +
             'parameter; forwarding it from an outer host URL into an embedded ' +
             'iframe would reintroduce the hidden-experiment-chrome bug (the GYM ' +
             'must always show the ' +
             'experiment\'s own full chrome, never chrome=canvas — see the ' +
             '"WHEN should a host set chrome=canvas" doc above for the general ' +
             'criterion, not just the GYM\'s specific answer to it)'
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

export {
    KEYS,
    PAGE_PARAMS,
    HOST_TOKENS,
    FORWARDABLE_PARAMS
};
