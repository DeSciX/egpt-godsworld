/* Copyright 2023-2026 by Essam Abadir */

/**
 * EXPERIMENTS — canonical experiment registry.
 *
 * Single ESM named export. Replaces the dual window.EXPERIMENTS + CommonJS export.
 * Consumed by lib/features/ide via import; SimPane reads experiments from the prop.
 *
 * id      : the directory name under frqtl/experiments/{id}/index.html
 * title   : human-readable label
 * cat     : category label
 * jsOnly  : true if the experiment requires JS-engine-only APIs
 *
 * Ordering (G1 — WS-IMPOSSIBLE-GALLERY):
 *   Experiments listed in the exhibit manifest appear FIRST, in manifest order.
 *   Remaining experiments follow in their original declaration order.
 *   This ordering is consumed by SimPane's dropdown via the existing prop path
 *   (zero SimPane changes required).
 *
 * The manifest import is done lazily via a factory to avoid circular dependency
 * (exhibits.js imports EXPERIMENTS from here; we cannot import exhibits.js at
 * the top level of this file). The ordered list is computed once on first access.
 */

/**
 * EXPERIMENT_TIERS — the tier vocabulary and what each tier means for PUBLIC
 * SURFACING. This table is the contract; consumers never hardcode a tier string.
 *
 *   - A row with NO `tier` is public (absence = public; there is deliberately no
 *     `tier:'public'` literal to maintain on every row).
 *   - A row whose tier resolves `public:false` is dropped from the public
 *     experiment choosers by `isPublicExperiment()` / `publicExperiments()`.
 *   - An UNKNOWN tier value FAILS LOUD (`isPublicExperiment` throws) — a typo'd
 *     tier must never silently publish a lab.
 *   - Tier gates the CURATED public chooser (STUDIO Templates). The GYM lists
 *     `internalExperiments()` instead — see that function's doc.
 *
 * Visibility only: a non-public tier NEVER affects loadability, deep-linking,
 * ordering, `is3D`, or the label lookup. Those all read the full EXPERIMENTS list
 * / `experimentById()`. `sdk/frqtl-sdk/build.js` ships `publicExperiments()` +
 * the named infra ids: a dev-tier page is absent from the npm/CDN package, but
 * present in the GYM (both the dev IDE and the shipped static deploy).
 *
 * ── The public set is the NEW-SUGAR content ONLY (CEO 2026-07-27) ────────────
 * EVERY row below is `tier:'dev'`: none of these pages has been rebuilt on the
 * current sugar objects (SphereEmitter / v2 `Wall` / `Tunnel` / LiveChart /
 * GraphingDetectorWall), so none is public and none ships. The PUBLIC gallery
 * content is the WALK-THROUGH rung registry (`./walkthrough.js`), which is built
 * entirely on those objects; `sdk/frqtl-sdk/src/index.html` is its dist surface.
 * An unmigrated page FAILING LOUD in a dist context is the DESIRED signal — it is
 * the list of what remains to migrate. A row returns to the public set by being
 * REBUILT on the new objects and having its `tier` dropped — never by exception.
 *
 * @type {Readonly<Record<string, Readonly<{id:string, public:boolean, label:string}>>>}
 */
export const EXPERIMENT_TIERS = Object.freeze({
    dev: Object.freeze({
        id:     'dev',
        public: false,
        label:  'Developer isolation lab / demo',
    }),
});

/** @type {Array<{id:string, title:string, cat:string, jsOnly?:boolean, wasmOnly?:boolean, is3D?:boolean, tier?:string}>}
 *  jsOnly  : requires JS-engine-only APIs (no WASM build) — filtered out of Compare.
 *  tier    : a key of EXPERIMENT_TIERS (above). `tier:'dev'` marks a DEVELOPER-tier
 *            isolation lab / demo: fully registered and BOOTABLE by id (direct
 *            experiment-page URL + STUDIO deep link — the dev surface), HIDDEN from
 *            the PUBLIC experiment chooser (STUDIO Templates). It stays LISTED in
 *            the GYM (reads `internalExperiments()`), which is what driving these
 *            labs is for. Omit `tier` for a public experiment.
 *  wasmOnly: 3D experiment; the JS reference is a frozen 2D fixture, so Compare runs
 *            WASM-only (JS-reference pane disabled). See CompareView filter.
 *  is3D    : the ONE mount-time 3D-render authority (E-W0a, CEO 2026-07-23). TRUE iff
 *            the experiment page unconditionally boots a 3D display — its runner is
 *            `new FrqtlApp({ is3D: true, … })` on the three display — the ground-truth
 *            signal, NOT wasmOnly (orthogonal: collision-matrix is wasmOnly+2D). STUDIO
 *            reads THIS field pre-boot to light up the camera strip + MOVE/LOOK drive for a
 *            template-loaded 3D experiment. A gate test (experiment-is3d-agreement.test.mjs)
 *            asserts THIS field ↔ the page's runner `is3D: true` — a hand-typed drift is a
 *            CI failure (mirror kill). A page that switches 3D only via a `?renderer=three`
 *            reinit toggle (single-source-interference) is 2D-DEFAULT → is3D omitted/false. */
const _EXPERIMENTS_BASE = [
    { id: 'g1-lo-race',        title: 'G1: LO races a quantum',     cat: 'Engine Tests', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'g2-lo-sweep',       title: 'G2: moving LO sweeps a field', cat: 'Engine Tests', wasmOnly: true, tier: 'dev' },
    { id: 'g3-lo-collide',     title: 'G3: Collision Lab (box-of-balls)', cat: 'Engine Tests', wasmOnly: true, tier: 'dev' },
    { id: 'collision-matrix',    title: 'Collision Matrix (density sweep)',    cat: 'Engine Tests', wasmOnly: true, tier: 'dev' },
    { id: 'tunnel-lab',          title: 'Tunnel Lab (DirectedTunnel isolation)', cat: 'Engine Tests', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'lightsource-lab',     title: 'LightSource Lab (LightSource isolation)', cat: 'Engine Tests', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'mesh-demo',           title: 'render.mesh demo (external glTF)',    cat: 'Render Effects', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'cone-emitter-3d',   title: 'Cone Emitter 3D (laser ↔ flashlight)', cat: 'Wave Mechanics', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'sphere-emitter-3d', title: 'Sphere Emitter 3D (sun / laser / drum)', cat: 'Wave Mechanics', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'single-source-interference', title: 'Single-Source Self-Interference (omni, 2D)', cat: 'Wave Mechanics', wasmOnly: true, tier: 'dev' },
    { id: 'tunnel-point-exit',   title: 'Tunnel Point-Exit (collapsed mouth, 2D)', cat: 'Wave Mechanics', wasmOnly: true, tier: 'dev' },
    { id: 'fx-glow',           title: 'FX: Glow',                   cat: 'Render Effects', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'fx-godrays',        title: 'FX: God-rays',               cat: 'Render Effects', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'fx-smoke',          title: 'FX: Smoke',                  cat: 'Render Effects', wasmOnly: true, is3D: true, tier: 'dev' },
    { id: 'blackbody-substrate',    title: 'Blackbody Substrate (L1+L2+L3+L4)', cat: 'Thermodynamics', tier: 'dev' },
    { id: 'circuit-basic',     title: 'Circuit: Series Resistor',   cat: 'Computing',          tier: 'dev' },
    { id: 'trace-circuit',     title: 'Trace: the wire part',       cat: 'Computing', wasmOnly: true, tier: 'dev' },
    { id: 'oscillator',        title: 'Quantum Oscillator',         cat: 'Structure & Forces', tier: 'dev' }
];

/**
 * The flat experiment list, in declaration order. (The showcase roster — the front-page tiles — is
 * scene files, lib/shim/registry/exhibits.js; no experiment page is a tile.)
 *
 * @type {Array<{id:string, title:string, cat:string, jsOnly?:boolean, wasmOnly?:boolean}>}
 */
export const EXPERIMENTS = _EXPERIMENTS_BASE;

/**
 * isPublicExperiment(entry) — THE tier-visibility predicate. Resolves an entry's
 * `tier` against the EXPERIMENT_TIERS contract: no tier ⇒ public; a known tier ⇒
 * that tier's `public` flag; an unknown tier ⇒ THROWS (fail loud — a typo must
 * never silently publish a dev lab).
 *
 * This is the ONE place the tier→visibility rule lives. Any surface that lists
 * experiments to the public FERRIES this predicate (or `publicExperiments()`
 * below) — re-writing `e.tier !== 'dev'` in a consumer is the schema-mirror
 * anti-pattern and will drift the moment a second non-public tier is added.
 *
 * @param {{id?:string, tier?:string}} entry — an EXPERIMENTS row.
 * @returns {boolean} true if the entry belongs in a public experiment chooser.
 * @throws {Error} if `entry.tier` is not a key of EXPERIMENT_TIERS.
 */
export function isPublicExperiment(entry) {
    if (!entry || !entry.tier) { return true; }
    var tier = EXPERIMENT_TIERS[entry.tier];
    if (!tier) {
        throw new Error(
            '[experiments] unknown tier "' + entry.tier + '" on experiment "' +
            (entry.id || '?') + '". Known tiers: ' +
            Object.keys(EXPERIMENT_TIERS).join(', ') + ' (omit `tier` for public).'
        );
    }
    return tier.public === true;
}

/**
 * publicExperiments() — the EXPERIMENTS a PUBLIC chooser should list, filtered by
 * `isPublicExperiment`. The single filtered view both public experiment-chooser
 * surfaces (STUDIO Templates via ExperimentDropdown, the GYM/Compare select)
 * consume, so the dev-tier hide is declared ONCE. Non-public experiments remain
 * registered and bootable by id (direct experiment-page URL, STUDIO deep link) —
 * they are only hidden from these curated lists.
 *
 * @returns {Array<{id:string, title:string, cat:string}>}
 */
export function publicExperiments() {
    return EXPERIMENTS.filter(isPublicExperiment);
}

/**
 * internalExperiments() — the roster an INTERNAL-ONLY experiment chooser lists.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * Every registered row, tier-independent, in registry order. This is the peer of
 * `publicExperiments()`, and the split is by SURFACE AUDIENCE, not by taste:
 *
 *   - `publicExperiments()` — for a chooser a STRANGER can reach (STUDIO
 *     Templates). Tier gates it, because tier means "has this page been rebuilt
 *     on the current sugar and is it fit to publish".
 *   - `internalExperiments()` — for the GYM (`preset='compare'`), which drives
 *     dev-tier isolation labs directly by id and so needs the full roster
 *     regardless of tier.
 *
 * WHY THIS EXISTS (2026-07-28): with the whole legacy roster moved to `tier:'dev'`,
 * `publicExperiments()` is legitimately EMPTY. A surface that lists it therefore
 * offers nothing — which is correct for a public chooser (the public content set
 * is the WALK-THROUGH registry) and wrong for the maintainer's driving
 * instrument. Passing the audience question through the tier table was the
 * conflation; naming the two rosters separately is the fix.
 *
 * A consumer picks the roster that matches ITS audience and derives everything
 * else (its default selection included) from that ONE list — never a second
 * hardcoded id.
 *
 * @returns {Array<{id:string, title:string, cat:string}>} registry rows BY REFERENCE.
 */
export function internalExperiments() {
    return EXPERIMENTS.slice();
}

/**
 * experimentById(id) — THE id→entry resolution for the registry. Reads the FULL
 * EXPERIMENTS list, tier-independent: a dev-tier experiment resolves exactly like
 * a public one, which is what keeps it reachable by direct URL / deep link while
 * hidden from the public choosers.
 *
 * @param {string} id — an experiment id (directory name under experiments/).
 * @returns {{id:string, title:string, cat:string}|null} the entry, or null if unknown.
 */
export function experimentById(id) {
    for (var i = 0; i < EXPERIMENTS.length; i++) {
        if (EXPERIMENTS[i].id === id) { return EXPERIMENTS[i]; }
    }
    return null;
}

/**
 * experimentIs3D(id) — the ONE mount-time 3D-render predicate for a gallery
 * experiment (E-W0a). Reads the declarative `is3D` field off the registry entry
 * (the single authority; see the `is3D` doc on `_EXPERIMENTS_BASE`). Returns
 * false for an unknown id or a 2D-default experiment. STUDIO consults this pre-boot
 * for a template-loaded experiment — the axis the walkthrough path derives from
 * `renderState.renderer`. Never sniffs a page or a runner: 3D-ness is DATA here.
 *
 * @param {string} id — an experiment id (directory name under experiments/).
 * @returns {boolean}
 */
export function experimentIs3D(id) {
    var entry = experimentById(id);
    return !!entry && entry.is3D === true;
}
