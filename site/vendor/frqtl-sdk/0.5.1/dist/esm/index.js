/* Copyright 2023-2026 by Essam Abadir */

/**
 * esm/index.js — the ESM bare-specifier entry for `@descix/frqtl-sdk`
 * (ws-artifact-showcase Bite A2).
 *
 * Ships at `dist/esm/index.js` (copied verbatim by `sdk/frqtl-sdk/build.js` —
 * see its "ESM entry" step). This is the ONLY file in the SDK distribution
 * written as a genuine ES module (`export`) — every other shipped script
 * (engine, renderer, game layer) is a classic dual-mode (CJS/window) script,
 * per the canonical stack's existing discipline (root CLAUDE.md rule 5 /
 * `lib/frqtl/experiments/_shared/stack-boot.js`). Rather than duplicating that
 * discipline as a second implementation, this module ORCHESTRATES it: it
 * injects the SAME classic `<script>` tags — resolved through `engineRouter`,
 * never hand-derived — in the SAME canonical order stack-boot.js uses, drawn
 * from the manifest owners (`lib/shim/engine/{shim-contract,renderer-layer,
 * game-layer}-manifest.js`), then exposes ONE promise-returning function per
 * showcased experiment.
 *
 * WHY THIS SHAPE (not a "real" ESM rewrite of the engine/game layer):
 *   - A new op-program behavior is data, never new engine code (root CLAUDE.md
 *     §Object architecture) — this file adds ZERO physics; it is packaging.
 *   - The classic dual-mode scripts (window.SlitScreen, window.LargeObject, ...)
 *     ARE the canonical single-source implementations; re-exporting them as a
 *     second genuine-ESM copy would fork a second implementation — the
 *     non-redundancy anti-pattern root CLAUDE.md's Gate-2 flags on sight.
 *   - The claude.ai Artifact CSP forbids `blob:` module imports but ALLOWS
 *     classic `<script>` injection from the SAME jsdelivr origin the shell's
 *     import map already trusts (docs/design/frqtl-artifact-showcase-scoping
 *     -2026-07-10.md §1 — the captured CSP; §3a "showcase shortcut").
 *   - This entry never touches `stack-boot.js` (confirmed dist-incompatible —
 *     see `.claude/agent-memory/frqtl-impl-server/CANONICAL.md` §CRITICAL) —
 *     it injects the same manifest-owned lists itself, resolved through
 *     `engineRouter({mode:'cdn'})`: the published jsdelivr copy by default, or a consumer's own
 *     copy of the dist through `opts.base` (the self-hosted form).
 *
 * Exports:
 *   bootScene(mountEl, sketch, opts?) → Promise<{ runner, recipeContext }>
 *     Boots a SKETCH — a `buildExperiment(exp)` function — into `mountEl`. The
 *     sketch's own co-init call (`exp.createCanvas(w, h, cfg)` on p5,
 *     `exp.createScene(w, h, d, cfg)` on three) states the world, size included;
 *     the entry takes none. Injects the FULL canonical stack (`buildScriptLists`),
 *     so every sugar object is in scope.
 *
 *   bootRecipe(mountEl, recipeSource, opts?) → Promise<{ runner, recipeContext, retainedRenderRows }>
 *     The same sketch path for a sketch held as SOURCE TEXT (STUDIO codegen
 *     output = a bundle's `experiment.js`), applying a saved renderState bag
 *     through the shim owner `RenderState.apply` (lib/shim/render-state/apply.js). A
 *     recipe bundle's `index.html` calls exactly this.
 *
 *   Both end in the ONE sketch path `runSketch` (sizeless RecipeContext →
 *   exp.build / exp.buildSource → engine init gate → start → resolve on the
 *   runner's first tick). FAIL-LOUD: any load/compile/engine/sketch failure
 *   paints a visible overlay inside `mountEl` and the returned promise REJECTS.
 *
 *   ONE BOOT PER DOCUMENT. The stack is document-scoped and there is no
 *   dispose(): a second bootScene/bootRecipe in the same document THROWS
 *   (claimDocument), describing the first boot's state: IN PROGRESS (await its
 *   promise), FAILED (open a fresh document), or booted — naming the re-scene door, the first boot's
 *   `recipeContext.buildSource(text)` / `recipeContext.build(fn)`, same runner and
 *   canvas, which `runner.restart()` then replays. A different world size needs
 *   a fresh document.
 *
 *   Every boot publishes the page's path authority through its router
 *   (`router.ensureBrowserPathMap()`: `window._egptEnginePathMap` and
 *   `window._egptResolveFrqtl`), so `FrqtlVision.record` works after either boot.
 */

import { engineRouter } from '../ide/engine/router.js';
import { ENGINE_SHIM_CONTRACT_SCRIPTS } from '../ide/engine/shim-contract-manifest.js';
import { GAME_LAYER_SCRIPTS } from '../ide/engine/game-layer-manifest.js';
// The RENDERER-phase authority (sibling of the GAME manifest above). Hand-copying
// this list is what silently dropped RenderFamily.js from the dist and blanked
// every 3D scene while dev was fine — derive, never re-type.
import { RENDERER_LAYER_SCRIPTS } from '../ide/engine/renderer-layer-manifest.js';
// The ONE renderState owner (lib/shim/render-state/apply.js) — bootRecipe reads the bag's
// load-time half off its normalizer and hands the bag to RenderState.apply; it restates nothing.
import { RenderState, normalizeSavedRenderState } from '../ide/render-state/index.js';
// The one classic-script sequencer (bootstrapped once below) and the boot-phase vocabulary its
// record is written in.
import { BOOT_SEQUENCER_SCRIPT } from '../ide/engine/shim-contract-manifest.js';
import { BOOT_PHASE_IDS } from '../ide/engine/boot-phases.js';

// ── THE ONE SEQUENCER (lib/shim/engine/script-sequencer.js) ─────────────────
//
// Every classic script this entry injects goes through window.FrqtlScriptSequencer — the same
// owner stack-boot.js uses: a whole list appended at once with async=false (parallel fetch,
// list-order execution), idempotent per URL, rejecting with `err.src` on the first failure.
// This module bootstraps it EXACTLY ONCE (bootstrapSequencer, one tag, no chain) at
// BOOT_SEQUENCER_SCRIPT, resolved through the caller's router.

var _sequencer = null;

function bootstrapSequencer(router) {
    if (_sequencer) { return _sequencer; }
    _sequencer = new Promise(function (resolve, reject) {
        if (window.FrqtlScriptSequencer) { resolve(window.FrqtlScriptSequencer); return; }
        var src = router.resolve(BOOT_SEQUENCER_SCRIPT);
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () {
            if (!window.FrqtlScriptSequencer) {
                reject(new Error('[frqtl-sdk esm] ' + src + ' loaded but did not install window.FrqtlScriptSequencer.'));
                return;
            }
            resolve(window.FrqtlScriptSequencer);
        };
        // The sequencer is the FIRST file every boot loads from the dist base, so a base that
        // serves nothing fails here: name the base and what it must hold, not just a script URL.
        s.onerror = function () {
            var err = new Error('[frqtl-sdk esm] the dist base "' + router.distBase + '" did not serve ' + src +
                ', the first file a boot loads from it. The base must be the URL of an unmodified copy of ' +
                'the package\'s dist/ directory (every file dist/dist-manifest.json lists, at its relative ' +
                'path). (FAIL-LOUD.)');
            err.src = src;
            reject(err);
        };
        document.head.appendChild(s);
    });
    // A failed bootstrap is retried by the next call rather than cached as a permanent rejection.
    _sequencer.catch(function () { _sequencer = null; });
    return _sequencer;
}

/**
 * Inject a script list through THE sequencer (exported for the browser parity core,
 * src/browser/parity-boot.js — one injector, never a third copy).
 * @param {EngineRouter} router
 * @param {Array<{src:string}>} list
 * @param {(done:number,total:number,src:string)=>void} [onLoaded]
 * @returns {Promise<void>}
 */
export function injectScriptList(router, list, onLoaded) {
    return bootstrapSequencer(router).then(function (sq) {
        return sq.page.injectInOrder(list, { label: 'frqtl-sdk esm', onLoaded: onLoaded });
    });
}

/* The boot record for one boot of this entry: every phase's total set up front. `pageCount` is
   the number of scripts the entry injects after the GAME list (a setup factory, a recipe's
   scripts[] delta). Returned with the sequencer so each phase runs through runPhase. */
function startBootRecord(router, lists, pageCount) {
    return bootstrapSequencer(router).then(function (sq) {
        var rec = sq.createBootRecord(document, BOOT_PHASE_IDS);
        rec.begin('engine-scripts', sq.page.scriptCount(lists.ENGINE));
        rec.begin('engine-ready', 1);
        rec.begin('renderer', sq.page.scriptCount(lists.RENDERER));
        rec.begin('game', sq.page.scriptCount(lists.GAME));
        rec.begin('page', pageCount);
        rec.begin('sketch', 1);
        return rec;
    });
}

/* One recorded phase: a list through the sequencer (one step per loaded script), or — with
   `work` a function — a promise-valued step (engine-ready). Failure tags the phase first. */
function runPhase(router, rec, phase, listOrWork) {
    var p = (typeof listOrWork === 'function')
        ? Promise.resolve().then(listOrWork)
        : injectScriptList(router, listOrWork, function () { rec.step(phase); });
    return p.then(function (v) { rec.complete(phase); return v; },
        function (err) { rec.fail(phase); throw err; });
}

// ── FAIL-LOUD overlay, scoped to the mount element ──────────────────────────
//
// Never full-viewport: this shell is embedded inside a claude.ai Artifact
// iframe (or any other host page), not a standalone canonical experiment page
// — root CLAUDE.md's "host-aware overlay scoping" discipline (engine-boot.js /
// render-boot.js precedent), applied at the one scope this entry ever has.

function paintError(mountEl, title, detail) {
    var box = document.createElement('div');
    box.setAttribute('data-egpt-artifact-error', '1');
    box.style.cssText =
        'position:absolute;inset:0;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;' +
        'white-space:pre-wrap;background:#1a0000;color:#ff6b6b;border:2px solid #b6161c;' +
        'padding:14px;overflow:auto;z-index:9998;';
    box.textContent = title + '\n\n' + detail;
    mountEl.innerHTML = '';
    if (mountEl.style && (!mountEl.style.position || mountEl.style.position === 'static')) {
        mountEl.style.position = 'relative';
    }
    mountEl.appendChild(box);
}

function resolveMount(mountEl) {
    if (typeof mountEl === 'string') {
        var el = document.getElementById(mountEl);
        if (!el) { throw new Error('[frqtl-sdk esm] mount element id "' + mountEl + '" not found.'); }
        return el;
    }
    if (!mountEl || typeof mountEl.appendChild !== 'function') {
        throw new Error('[frqtl-sdk esm] mountEl must be a DOM element or its id.');
    }
    return mountEl;
}

// ── The canonical script lists — stack-boot.js's full canonical order, drawn
// from the manifest owners. Every URL is resolved through engineRouter — NEVER
// hand-derived. ─────────────────────────────────────────────────────────────

// lib/shim contract scripts (ast-schema, frame-data, page-params,
// field-descriptor, controls x2, rpc) — the CANONICAL list is
// shim-contract-manifest.js's ENGINE_SHIM_CONTRACT_SCRIPTS (the same list
// stack-boot.js's own ENGINE array is a literal copy of, parity-tested by
// lib/shim/engine/test/shim-contract-manifest.test.mjs). Consumed here IN
// FULL — never a hand-picked subset of a canonical list — by stripping each
// entry's '/lib/shim/' prefix and re-resolving through router.resolve('shim/...')
// (the router's 'shim/' path-authority prefix, added alongside this entry).
var SHIM_ABS_PREFIX = '/lib/shim/';

function buildShimContractScripts(router) {
    return ENGINE_SHIM_CONTRACT_SCRIPTS.map(function (absPath) {
        if (absPath.indexOf(SHIM_ABS_PREFIX) !== 0) {
            throw new Error('[frqtl-sdk esm] unexpected shim-contract path shape: ' + absPath);
        }
        return { src: router.resolve('shim/' + absPath.slice(SHIM_ABS_PREFIX.length)) };
    });
}

/**
 * The FULL canonical stack `bootScene` and `bootRecipe` inject, so ANY sketch works
 * (2D or 3D, p5 or three, with shapes / FX / water):
 *
 *   ENGINE   — chroma → Rectangle → WASM compat + the FULL shim-contract list
 *              (ast-schema / frame-data are needed by actionCompiler and by
 *              RenderShape/RenderMesh at module-eval time; page-params /
 *              field-descriptor / controls / rpc ride along — loading the
 *              canonical list IN FULL means a manifest addition is picked up
 *              with no matching edit here). Scene-independent.
 *   RENDERER — the FULL renderer stack: RENDERER_LAYER_SCRIPTS from
 *              lib/shim/engine/renderer-layer-manifest.js (the SAME single
 *              authority stack-boot.js's RENDERER phase mirrors — never a
 *              hand-copied list; a hand copy is what dropped RenderFamily.js
 *              from the dist and blanked every 3D scene). It carries the color
 *              source, the shape/mesh/family decode authorities, the render-tier
 *              table, FieldBuilder, renderCapabilities-common, BOTH providers
 *              (p5 AND three) and Filters.
 *   GAME     — the FULL canonical game roster: GAME_LAYER_SCRIPTS from
 *              lib/shim/engine/game-layer-manifest.js (the SAME single authority
 *              stack-boot.js + router.gameScripts() consume — never a hand-copied
 *              list): OBJECT_SCRIPTS + RUNNER_SCRIPTS, which carry every sugar
 *              object and the shared setup helpers a sketch calls
 *              (`setupSphereEmitter3D.worldCfg`, …).
 *
 * Every URL is resolved through the SAME `router` — never hand-derived. EXPORTED
 * so the conformance test (lib/shim/engine/test/router.test.mjs) can assert every
 * URL these three sequences inject resolves to a real dist file — checking the
 * SAME data `bootScene` injects, never a parallel hand-typed list.
 *
 * NOTE: the three.js runtime (`assets/vendor/three.min.js`) is NOT in this list —
 * it is loaded lazily ONLY when the three renderer is selected
 * (most 2D scenes never pay for it), mirroring render-boot.js's lazy three load.
 *
 * @param {import('../ide/engine/router.js').EngineRouter} router
 * @returns {{ENGINE: Array<{src:string}>, RENDERER: Array<{src:string}>, GAME: Array<{src:string}>}}
 */
export function buildScriptLists(router) {
    var ENGINE = [
        { src: router.resolve('assets/vendor/chroma.min.js') },
        { src: router.resolve('objects/geometry/Rectangle.js') },
        { src: router.resolve('compat/providers/wasm-engine.js') },
        { src: router.resolve('compat/providers/wasm-load-browser.js') },
        { src: router.resolve('compat/egpt-engine.js') }
    ].concat(buildShimContractScripts(router));

    // FULL renderer stack from the ONE manifest authority (never a hand-copied
    // list — lib/shim/engine/renderer-layer-manifest.js owns the phase and its
    // load-order constraints: RenderShape/RenderMesh before RenderFamily, and
    // RenderFamily/renderCapabilities-common before both providers).
    var RENDERER = RENDERER_LAYER_SCRIPTS.map(function (p) { return { src: router.resolve(p) }; });

    // FULL game roster from the ONE manifest authority (never a hand-copied list).
    var GAME = GAME_LAYER_SCRIPTS.map(function (p) { return { src: router.resolve(p) }; });

    return { ENGINE: ENGINE, RENDERER: RENDERER, GAME: GAME };
}

// ── Engine boot (WASM-only — this artifact never offers a JS-engine option;
// the JS reference engine is a dev/debug fixture, never distributed — rule 5).
// Mirrors engine-boot.js's WASM branch, minus the PageParams/`?engine=`
// machinery this fixed-engine artifact does not need. ──────────────────────

function bootEngine(router) {
    window._egptWasmPkgUrl = router.wasmPkgUrl;
    if (!window._WasmEngineProvider || !window.EGPTEngine) {
        return Promise.reject(new Error(
            '[frqtl-sdk esm] WASM compat layer missing (window._WasmEngineProvider / ' +
            'window.EGPTEngine not installed — did compat/egpt-engine.js fail to load?).'
        ));
    }
    // EGPTEngine.create() installs window.EGPTUniverse (+ Charge/TickData/FrameData)
    // once the real WASM module resolves, and sets window._wasmReadyPromise itself
    // (compat/providers/wasm-load-browser.js `loadAndSetReadyPromise`).
    return window.EGPTEngine.create({ backend: 'wasm', wasmPkgUrl: router.wasmPkgUrl });
}

// ── THE DISPLAY SLOT — shared by both renderer boots below. ───────────────

/**
 * Register the booted provider into THE DISPLAY SLOT — the ONE answer to "which provider
 * owns the display" (RENDERER_CONTRACT §9; `lib/frqtl/compat/renderer/display-slot.js`,
 * loaded at the head of the RENDERER phase by the same manifest this boot maps). It FERRIES
 * `window._egptRenderer`, the name authority set by the caller, so the slot can never answer
 * differently from `build.renderer`. The bare `window._egptActiveRenderer` global this
 * replaced is DELETED — a slot plus a global would be two truths about one fact.
 */
function registerDisplay(provider) {
    if (!window.FrqtlDisplay) {
        throw new Error('[frqtl-sdk esm] display-slot.js did not install window.FrqtlDisplay ' +
            '(it heads the RENDERER script list). FAIL-LOUD, not a fallback.');
    }
    return window.FrqtlDisplay.set(provider, window._egptRenderer);
}

// ── p5 global-mode boot (the same "defer p5 until engine+renderer are live"
// rule every experiment page gets from window._egptStartSketch — see stack-boot.js's
// docstring §THE ONE BOOT DANCE). ───────────────────────────────────────────

function bootP5(router, onSetup) {
    window.setup = onSetup;
    return injectScriptList(router, [{ src: router.p5Src() }]);
}

// ── THE ONE SKETCH PATH — bootScene and bootRecipe both end here ─────────────
//
// A scene is a SKETCH: `buildExperiment(exp)` (docs/internal/engine/THE_MINIMAL_SIM.md).
// Its first statement is the co-init call — `exp.createCanvas(w, h, cfg)` (p5) or
// `exp.createScene(w, h, d, cfg)` (three) — the ONE place the world, size included, is
// stated. So this path constructs a SIZELESS RecipeContext and runs the sketch through
// `exp.build`; it owns no size, no 3D flag, no factory bag. Then: start → resolve on the
// runner's FIRST TICK.
//
// READINESS IS THE RUNNER'S, NEVER THIS FILE'S SAY-SO. The promise resolves from
// `runner.firstTick(...)` — FrqtlApp's own promise for its first DELIVERED tick, whose
// deadline runs only while the document is visible (the tick clock is
// requestAnimationFrame, which a hidden document suspends). Before start, the engine's
// own gate is asked: reading `universe.fundamentalDimension` goes through
// EGPTUniverse._ensureInit, so a sketch that left its world un-init'd throws HERE —
// overlay + rejection — instead of uncaught on every frame.

var FIRST_TICK_DEADLINE_MS = 15000;

/**
 * @param {object} spec
 * @param {HTMLElement} spec.host - the mount (overlay target).
 * @param {HTMLElement} spec.canvasHost - the canvas parent created by the entry.
 * @param {EngineRouter} spec.router
 * @param {string} spec.label - 'SCENE' | 'RECIPE' — the overlay title stem.
 * @param {function(object):void} spec.build - runs the scene on the sizeless facade:
 *   `exp.build(sketch)` (bootScene) or `exp.buildSource(text)` (bootRecipe — the one eval site).
 * @param {number} spec.seed
 * @param {Function} spec.onTick
 * @param {object} spec.record - the boot record (startBootRecord); its `sketch` phase
 *   completes once `exp.build` has run the sketch.
 * @param {function(object, object):object} spec.afterStart - `(runner, exp) → extra` result
 *   fields, run after start in the same task (render options, saved-state replay).
 * @returns {Promise<object>} `{runner, recipeContext, …extra}`
 */
function runSketch(spec) {
    var host = spec.host;
    var label = spec.label;
    return new Promise(function (resolve, reject) {
        // p5 global-mode is the boot trigger for BOTH renderers (the canonical
        // experiment-page pattern): p5 auto-invokes window.setup once loaded; under
        // three, the co-init call delegates the canvas to the three provider (p5's own
        // canvas is never created) and the runner owns its own RAF loop.
        bootP5(spec.router, function () {
            var exp;
            try {
                if (typeof window.RecipeContext !== 'function') {
                    throw new Error('[frqtl-sdk esm] window.RecipeContext missing (the game layer did not inject RecipeContext.js).');
                }
                exp = new window.RecipeContext({ canvasParentId: spec.canvasHost.id, seed: spec.seed, onTick: spec.onTick });
                spec.build(exp);                                // the sketch: its co-init call, then its parts
                void exp.runner.universe.fundamentalDimension;  // the ENGINE's init gate
                spec.record.complete('sketch');
            } catch (err) {
                spec.record.fail('sketch');
                paintError(host, 'FRQTL ' + label + ' SETUP FAILED', String((err && err.stack) || err));
                reject(err);
                return;
            }
            var runner = exp.runner;
            var extra;
            try {
                runner.start();
                extra = spec.afterStart(runner, exp) || {};
            } catch (err) {
                runner.stop();
                paintError(host, 'FRQTL ' + label + ' SETUP FAILED', String((err && err.stack) || err));
                reject(err);
                return;
            }
            // LIVE = the runner's first tick, awaited AFTER start() succeeded, in the SAME
            // task: requestAnimationFrame never runs a callback synchronously, so no tick
            // can be delivered before this listener exists.
            runner.firstTick({ deadlineMs: FIRST_TICK_DEADLINE_MS }).then(function () {
                var out = { runner: runner, recipeContext: exp };
                Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
                resolve(out);
            }, function (err) {
                var named = new Error('[frqtl-sdk esm] ' + label.toLowerCase() + ': FIRST_TICK_DEADLINE_MS = ' +
                    FIRST_TICK_DEADLINE_MS + ' ms — ' + String((err && err.message) || err));
                paintError(host, 'FRQTL ' + label + ' NEVER TICKED', String(named.stack || named));
                reject(named);
            });
        }).catch(function (err) {
            spec.record.fail('sketch');
            paintError(host, 'FRQTL ' + label + ' BOOT FAILED (p5)', String((err && err.stack) || err));
            reject(err);
        });
    });
}

/** Mount the entry's canvas parent inside `mountEl` (cleared first). */
function mountCanvasHost(mountEl, role) {
    var host = resolveMount(mountEl);
    host.innerHTML = '';
    var canvasHost = document.createElement('div');
    canvasHost.setAttribute('data-role', role);
    canvasHost.id = role + '-' + Math.random().toString(36).slice(2);
    host.appendChild(canvasHost);
    return { host: host, canvasHost: canvasHost };
}

/**
 * Boot the stack through the GAME phase, with the chosen renderer (p5 | three) installed.
 * First, THIS boot's router publishes the page's path authority — `window._egptEnginePathMap`
 * and its function form `window._egptResolveFrqtl` (router.ensureBrowserPathMap: the ESM-side
 * publisher; a different router already on the page THROWS) — so every in-page reader
 * (FrqtlVision.record's lazily loaded encoder, render-boot) resolves through the same router.
 */
async function bootStack(router, lists, rec, renderer) {
    router.ensureBrowserPathMap();
    await runPhase(router, rec, 'engine-scripts', lists.ENGINE);
    await runPhase(router, rec, 'engine-ready', function () { return bootEngine(router); });
    await runPhase(router, rec, 'renderer', lists.RENDERER);
    if (renderer === 'three') {
        await bootThreeRenderer(router);
    } else {
        bootP5Renderer(router);
    }
    await runPhase(router, rec, 'game', lists.GAME);
}

function assertRenderer(where, r) {
    if (r !== 'p5' && r !== 'three') {
        throw new Error('[frqtl-sdk esm] ' + where + ': renderer "' + r + '" is invalid (expected "p5" | "three").');
    }
    return r;
}

// ── Renderer boot (p5 OR three), shared by bootScene and bootRecipe. Mirrors render-boot.js's provider
// selection MINUS the PageParams/`?renderer=` URL machinery this
// fixed-selection ESM entry does not need. p5 is synchronously ready once its
// provider script has loaded; three needs its runtime fetched first. ─────────

/**
 * Boot the p5 provider (mirrors render-boot.js's default branch).
 * @param {EngineRouter} router
 */
function bootP5Renderer(router) {
    if (!window._egptRendererProviders || !window._egptRendererProviders.p5) {
        throw new Error('[frqtl-sdk esm] p5-provider.js did not install window._egptRendererProviders.p5.');
    }
    window._egptRenderer = 'p5';
    registerDisplay(window._egptRendererProviders.p5.makeProvider());
}

/**
 * Boot the three.js provider (mirrors render-boot.js's three branch): load the
 * three runtime from the VENDORED asset (router-resolved — never cdnjs, so the
 * scene boots offline against the local dist / real jsdelivr uniformly), then
 * activate the three RendererProvider. 3D-ness is not a global: the sketch's
 * `exp.createScene(w, h, d, cfg)` hands `{is3D, depth}` to the provider's `init`.
 *
 * three.min.js r128 ships a UMD wrapper; in a self-contained artifact/scene page
 * there is NO AMD loader alive (unlike the notebook realm's Monaco — the reason
 * render-boot.js uses a scoped eval), so a plain classic `<script>` injection is
 * safe here: the UMD's `typeof define` check reads the real (absent) global and
 * falls through to its plain-global branch, setting `window.THREE`.
 * @param {EngineRouter} router
 * @returns {Promise<void>}
 */
function bootThreeRenderer(router) {
    if (!window._egptRendererProviders || !window._egptRendererProviders.three) {
        throw new Error('[frqtl-sdk esm] three-provider.js did not install window._egptRendererProviders.three.');
    }
    window._egptRenderer = 'three';
    var threeUrl = router.resolve('assets/vendor/three.min.js');
    window._egptThreeUrl = threeUrl;       // agree with render-boot.js's lazy-load global
    var ready = (typeof THREE !== 'undefined')
        ? Promise.resolve()
        : injectScriptList(router, [{ src: threeUrl }]);
    return ready.then(function () {
        if (typeof THREE === 'undefined') {
            throw new Error('[frqtl-sdk esm] three.min.js loaded but window.THREE is undefined (URL: ' + threeUrl + ').');
        }
        registerDisplay(window._egptRendererProviders.three.makeProvider());
    });
}


// ── ONE BOOT PER DOCUMENT ───────────────────────────────────────────────────
//
// The engine stack is document-scoped (classic globals, window.EGPTUniverse, the display slot,
// p5 global mode, whose window.setup fires once), so there is no dispose(): nothing could
// unload it. A second bootScene/bootRecipe in a document that already booted THROWS here,
// before touching its mount — a re-boot would detach the first canvas and wait forever on a
// p5 setup that never fires again. A different scene goes through the first boot's facade.
// The latch records the attempt AND its state — 'pending' | 'booted' | 'failed' — and the refusal
// describes the state at the moment it is thrown: in flight there is no facade yet (only the
// promise), after a FAILED boot there never will be one, after a booted one there is.

var _documentBoot = null;   // { door, state }

function claimDocument(door) {
    var prior = _documentBoot;
    if (prior && prior.state === 'pending') {
        throw new Error('[frqtl-sdk esm] ' + door + ': a boot through ' + prior.door + ' is IN PROGRESS in this ' +
            'document; await its promise. When it resolves, show another scene through the facade it returns ' +
            '(recipeContext.buildSource / .build); if it rejects, this document cannot host a second attempt. ' +
            '(FAIL-LOUD.)');
    }
    if (prior && prior.state === 'failed') {
        throw new Error('[frqtl-sdk esm] ' + door + ': a boot through ' + prior.door + ' was attempted in this ' +
            'document and FAILED; the stack cannot be re-booted in the same document — open a fresh document. ' +
            '(FAIL-LOUD.)');
    }
    if (prior) {
        throw new Error('[frqtl-sdk esm] ' + door + ': this document already booted the FRQTL stack (through ' +
            prior.door + '). One engine stack per document — there is no dispose(). To show another ' +
            'scene, use the facade the first boot returned: recipeContext.buildSource(sourceText) or ' +
            'recipeContext.build(buildExperiment) (same runner, same canvas); a different world size needs a ' +
            'fresh document. (FAIL-LOUD.)');
    }
    var claim = { door: door, state: 'pending' };
    _documentBoot = claim;
    return function settle(bootPromise) {
        return bootPromise.then(function (result) { claim.state = 'booted'; return result; },
            function (err) { claim.state = 'failed'; throw err; });
    };
}

/** The keys `bootScene` accepts. Any other key THROWS — a key accepted and dropped is the silent-drop class. */
export var BOOT_SCENE_OPTS = Object.freeze(['base', 'renderer', 'seed', 'onTick', 'render']);

/**
 * Boot a SKETCH — `buildExperiment(exp)` — into `mountEl`.
 *
 * The sketch's first statement is its co-init call: `exp.createCanvas(w, h, cfg)` for a 2D
 * world drawn by p5, `exp.createScene(w, h, d, cfg)` for a 3D world drawn by three. That call
 * is the only place the world's size is written; this entry takes none. The full canonical
 * stack is injected first (engine + BOTH renderer providers + FX + the whole game layer), so
 * the sketch's sugar (`SphereEmitter`, `Wall`, `LargeObject`, `setupSphereEmitter3D.worldCfg`,
 * …) is in scope as globals.
 *
 * @param {HTMLElement|string} mountEl - A DOM element (or its id) to mount into. Cleared first.
 * @param {function(object):void} sketch - `buildExperiment(exp)`.
 * @param {object} [opts]
 * @param {'p5'|'three'} [opts.renderer='p5'] - The display this page boots. It must agree with
 *   the sketch's call (`createScene` needs 'three'); a mismatch rejects naming both.
 * @param {number} [opts.seed=42] - RNG seed.
 * @param {(tickData:object, setupResult:object)=>void} [opts.onTick] - Per-tick callback.
 * @param {object} [opts.render] - One `runner.setRenderOptions(render)` batch after start
 *   (e.g. `shape:'sphere'`, `godrays:0.8`). Every key must be a capability the renderer
 *   declares (`runner.renderCapabilities()`), or the boot rejects.
 * @param {string} [opts.base] - SELF-HOSTING: the absolute URL (no trailing slash) where this
 *   page's origin serves an UNMODIFIED copy of the package's `dist/` tree, e.g.
 *   `new URL('./vendor/frqtl-sdk/dist', location.href).href`. Every injected URL (engine,
 *   renderers, game layer, vendor) is resolved under it through `engineRouter({mode:'cdn', base})`.
 *   Omitted: the published jsdelivr copy of this version. A base that is relative or ends in
 *   '/' rejects naming it; a base that does not serve the dist rejects naming it at the first
 *   file. A copy is checked against `dist/dist-manifest.json`. Consumer guide:
 *   COMPOSE_AND_CAPTURE.md, "Self-hosting the SDK".
 * @returns {Promise<{runner:object, recipeContext:object}>}
 * @throws {Error} FAIL-LOUD — paints an overlay in `mountEl` and rejects on any
 *   load/compile/engine/renderer/sketch failure, and on an unknown opts key. A second
 *   boot in a document that already booted rejects BEFORE touching `mountEl` (no overlay:
 *   the first boot's canvas stays), naming `recipeContext.buildSource` / `.build` — or, when
 *   the first boot is still in flight or FAILED, saying that instead.
 *
 * @example
 *   import { bootScene } from '@descix/frqtl-sdk/boot';
 *   await bootScene('mount', function (exp) {
 *     exp.createCanvas(480, 400, { dimension: 0, wavelengthScale: 1 });
 *     var u = exp.universe;
 *     u.experimentTickFunctions.push(function (uni) {
 *       uni.injectFrame(uni.makeLeafFrame(20, 200, 0, null, 1, 0));
 *     });
 *   });
 */
export function bootScene(mountEl, sketch, opts) {
    var settle;
    try { settle = claimDocument('bootScene'); } catch (err) { return Promise.reject(err); }
    return settle(bootSceneClaimed(mountEl, sketch, opts));
}

async function bootSceneClaimed(mountEl, sketch, opts) {
    var m = mountCanvasHost(mountEl, 'frqtl-scene-canvas');
    var host = m.host;
    opts = opts || {};
    var router;
    var rec;
    var renderer;
    try {
        if (typeof sketch !== 'function') {
            throw new Error('[frqtl-sdk esm] bootScene(mountEl, sketch, opts): `sketch` must be the scene\'s ' +
                'buildExperiment(exp) function — its first statement exp.createCanvas(w, h, cfg) or ' +
                'exp.createScene(w, h, d, cfg). (got ' + typeof sketch + ')');
        }
        var stray = Object.keys(opts).filter(function (k) { return BOOT_SCENE_OPTS.indexOf(k) === -1; });
        if (stray.length) {
            throw new Error('[frqtl-sdk esm] bootScene: unknown option(s) ' + stray.join(', ') + ' (accepted: ' +
                BOOT_SCENE_OPTS.join(', ') + '). The world — its size, 3D-ness and physics — is the sketch\'s ' +
                'own co-init call, never a boot option.');
        }
        renderer = assertRenderer('bootScene', opts.renderer === undefined ? 'p5' : opts.renderer);
        router = engineRouter({ mode: 'cdn', engine: 'wasm', base: opts.base });
        var lists = buildScriptLists(router);
        rec = await startBootRecord(router, lists, 0);
        await bootStack(router, lists, rec, renderer);
        rec.complete('page');
    } catch (err) {
        paintError(host, 'FRQTL SCENE BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }
    window._egptDefaultRenderer = renderer;
    return runSketch({
        host: host, canvasHost: m.canvasHost, router: router, label: 'SCENE', record: rec,
        build: function (exp) { exp.build(sketch); },
        seed: opts.seed !== undefined ? opts.seed : 42,
        onTick: typeof opts.onTick === 'function' ? opts.onTick : function () {},
        afterStart: function (runner) {
            if (opts.render !== undefined) { runner.setRenderOptions(opts.render); }
        }
    });
}

// ── bootRecipe — the standalone-bundle counterpart of bootScene ──────────────
//
// Where bootScene boots a NAMED setup factory, bootRecipe boots a RECIPE: a
// `buildExperiment(exp)` source (STUDIO's codegen output = a bundle's
// experiment.js) evaluated against a RecipeContext (the Bite-1 recipe facade,
// resolved as the window global the injected game layer provides). The renderState
// bag's load-time half (renderer/seed, off normalizeSavedRenderState) chooses the boot
// path; after start the whole bag goes to RenderState.apply. Same FAIL-LOUD discipline
// as bootScene (overlay + reject).

/**
 * Boot a `buildExperiment(exp)` RECIPE into `mountEl` — the standalone-bundle
 * entry (a bundle's `index.html` calls exactly this).
 *
 * @param {HTMLElement|string} mountEl - A DOM element (or its id) to mount into.
 *   Its existing contents are cleared.
 * @param {string} recipeSource - The `buildExperiment(exp)` module source (the
 *   bundle's `experiment.js`). Built through `RecipeContext.buildSource` (the one
 *   eval site): it must define `buildExperiment` (its dual-mode tail sets
 *   `window.buildExperiment`). FAIL-LOUD if it does not.
 * @param {object} [opts]
 * @param {string[]} [opts.scripts] - OPAQUE frqtl-relative setup-factory delta
 *   (e.g. ['objects/setup/setupSphereEmitter3D.js']) injected via engineRouter.resolve
 *   BEFORE the recipe is eval'd, so a recipe whose source calls a setup factory
 *   resolves that window global. FAIL-LOUD if a script fails to load. (DX-3.)
 * @param {object} [opts.renderState] - A saved renderState bag (raw or normalized);
 *   its renderer/seed pick the boot path, and after start the bag is applied through
 *   `RenderState.apply` (render rows, camera, backdrop). The WORLD (size, 3D-ness)
 *   is never an option: the recipe's own `exp.createCanvas` / `exp.createScene` states it.
 * @param {number} [opts.seed] - RNG seed override (else renderState.seed, else 42).
 * @param {(tickData:object, setupResult:object)=>void} [opts.onTick] - Per-tick callback.
 * @param {string} [opts.base] - SELF-HOSTING: the absolute URL of this origin's unmodified
 *   copy of the package's `dist/` tree; the same contract as bootScene's `opts.base`.
 * @returns {Promise<{runner:object, recipeContext:object, retainedRenderRows:{key:string, value:*}[]}>}
 *   `retainedRenderRows` — saved render rows another registered renderer declares but this
 *   one does not (not applied; RenderState.apply's `retained`).
 * @throws {Error} FAIL-LOUD — paints an overlay in mountEl and rejects on any
 *   load/compile/engine/renderer/recipe failure, a render row no renderer declares, or a
 *   camera preset the booted camera does not offer. A second boot in a document that
 *   already booted rejects BEFORE touching `mountEl`, as bootScene's does.
 *
 * @example
 *   import { bootRecipe } from '@descix/frqtl-sdk/boot';
 *   const src = await (await fetch('./experiment.js')).text();
 *   await bootRecipe('frqtl-mount', src, { renderState });
 */
export function bootRecipe(mountEl, recipeSource, opts) {
    if (typeof recipeSource !== 'string' || recipeSource.length === 0) {
        return Promise.reject(new Error('[frqtl-sdk esm] bootRecipe(mountEl, recipeSource, opts): recipeSource ' +
            'must be a non-empty string.'));
    }
    var settle;
    try { settle = claimDocument('bootRecipe'); } catch (err) { return Promise.reject(err); }
    return settle(bootRecipeClaimed(mountEl, recipeSource, opts || {}));
}

async function bootRecipeClaimed(mountEl, recipeSource, opts) {
    var m = mountCanvasHost(mountEl, 'frqtl-recipe-canvas');
    var host = m.host;

    // The bag's load-time half, off the owner's normalizer.
    var rs = normalizeSavedRenderState(opts.renderState || null);
    var renderer = assertRenderer('bootRecipe', rs.renderer || 'p5');

    var router = engineRouter({ mode: 'cdn', engine: 'wasm', base: opts.base });
    var lists = buildScriptLists(router);

    var _recipeScripts = (Array.isArray(opts.scripts) ? opts.scripts : []).filter(function (p) {
        return typeof p === 'string' && p;
    });
    var rec;
    try {
        rec = await startBootRecord(router, lists, _recipeScripts.length);
        await bootStack(router, lists, rec, renderer);

        // DX-3: inject the recipe's per-recipe script DELTA (opts.scripts, frqtl-relative
        // paths) BEFORE eval, resolved through the SAME engineRouter path authority the game
        // layer uses. FAIL-LOUD: the sequencer rejects on any load failure → the catch below.
        await runPhase(router, rec, 'page', _recipeScripts.map(function (p) { return { src: router.resolve(p) }; }));
    } catch (err) {
        paintError(host, 'FRQTL RECIPE BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }

    window._egptDefaultRenderer = renderer;
    return runSketch({
        host: host, canvasHost: m.canvasHost, router: router, label: 'RECIPE', record: rec,
        build: function (exp) { exp.buildSource(recipeSource); },
        seed: (opts.seed !== undefined) ? opts.seed : (rs.seed != null ? Number(rs.seed) : 42),
        onTick: typeof opts.onTick === 'function' ? opts.onTick : function () {},
        afterStart: function (runner) {
            if (!window.RenderCapabilitiesCommon) {
                throw new Error('[frqtl-sdk esm] bootRecipe: window.RenderCapabilitiesCommon missing (the renderer ' +
                    'layer did not inject renderCapabilities-common.js).');
            }
            var r = RenderState.apply(runner, rs, {
                knownNames: window.RenderCapabilitiesCommon.knownRenderCapabilityNames(window._egptRendererProviders)
            });
            if (r.camera === 'retained') {
                throw new Error('[frqtl-sdk esm] bootRecipe: renderState camera preset "' + r.preset +
                    '" is not offered by the booted camera (cameraControl.presets). (FAIL-LOUD.)');
            }
            return { retainedRenderRows: r.retained };
        }
    });
}
