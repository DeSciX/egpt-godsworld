/* Copyright 2023-2026 by Essam Abadir */

/**
 * render-boot.js — canonical renderer selection + FAIL-LOUD boot.
 *
 * Shared by every canonical per-experiment page (frqtl/experiments/{id}/index.html).
 * It is the single place that decides which renderer a page runs — mirroring
 * engine-boot.js exactly.
 *
 *   ?renderer=p5     → p5.js 2.x provider (lib/frqtl/compat/renderer/providers/p5-provider.js)
 *   ?renderer=three  → three.js provider (lib/frqtl/compat/renderer/providers/three-provider.js)
 *   ?renderer=custom → BYO (window._egptCustomRenderer must be set before this script)
 *
 * Default renderer is `p5` in the dev tree (a build can inject window._egptDefaultRenderer).
 *
 * THE INVARIANT: a page NEVER silently falls back to a different renderer than the
 * one requested. If ?renderer=three and three.js cannot load (or provider init fails),
 * the page FAILS LOUD — renders an unmissable overlay and leaves
 * window._egptWhenRendererReady unresolvable — so setup() never runs against the
 * wrong renderer.
 *
 * Load order on the page (this script runs AFTER the provider scripts):
 *   1. compat/renderer/providers/p5-provider.js      (window._egptRendererProviders.p5)
 *   2. compat/renderer/providers/three-provider.js   (window._egptRendererProviders.three)
 *   3. compat/renderer/Filters.js                    (window.Filters)
 *   4. THIS FILE
 *
 * window._egptWhenRendererReady(onReady, onError) resolves only when the requested
 * renderer backend is actually live. A page never calls it directly:
 * window._egptStartSketch() (stack-boot.js) composes it with engine-ready and the
 * stack-ready promise, then loads p5 or runs setup().
 *
 * For ?renderer=p5: the promise resolves immediately (p5 provider script already
 * loaded). p5 itself is still deferred until the engine is live and the stack is
 * complete (the engine must be live before p5 setup() runs).
 *
 * For ?renderer=three: the promise resolves after three.js loads successfully.
 * three.js is loaded dynamically from window._egptThreeUrl (default: CDN).
 *
 * window._egptRenderer is set to the selected renderer NAME (the boot authority).
 * The selected PROVIDER INSTANCE is registered into THE DISPLAY SLOT
 * (`compat/renderer/display-slot.js`, `window.FrqtlDisplay`) — the ONE answer to
 * "which provider owns the display", which FrqtlApp reads in its loop. The old bare
 * `window._egptActiveRenderer` global is DELETED: a slot plus a global would be two
 * truths about one fact (RENDERER_CONTRACT §9).
 *
 * window._egptRendererReadyState ('pending'|'ready'|'failed') is a synchronously
 * -readable companion to window._egptRendererReadyPromise, maintained by THIS
 * function only (see "session-clean renderer recovery" below _egptSelectRenderer's
 * resolve/reject closures) — lets a caller that reuses this same page session
 * across multiple boots (the notebook realm) detect a stale, already-failed
 * promise before re-awaiting it, and re-arm via window._egptSelectRenderer
 * (never by touching window._egptRendererReadyPromise directly). It is a
 * RE-ARM TRIGGER ONLY, not a synchronous proceed-gate: renderer readiness is
 * ALWAYS awaited via window._egptRendererReadyPromise (through
 * window._egptWhenRendererReady) — never decided by reading this field.
 *
 * ── RendererProvider BYO contract ────────────────────────────────────────────
 *
 * The contract — the required interface, the OPTIONAL capabilities (camera,
 * screenToWorld, renderCapabilities), the data a renderer consumes, the frozen
 * uniform contract, the filterSpec shape, the layer model and the standing
 * single-source rules — is documented ONCE, at
 * `docs/internal/engine/RENDERER_CONTRACT.md`. This header does not restate it:
 * a second copy of a contract is a copy that drifts, and this file's job is the
 * BOOT, not the contract.
 *
 * What this file DOES own, and what the notes below are about, is the FAIL-LOUD
 * selection behaviour:
 *
 * R-1: if window._egptCustomRenderer is set but is missing required methods,
 * this boot FAILS LOUD naming the missing method — never crashes mid-frame. The
 * `custom` path is the supported BYO entry point; a developer never forks this
 * file to ship a renderer.
 *
 * ── RE-INVOCATION (WS gym-controls-as-sugar Bite 0 fix-loop #4) ─────────────
 *
 * The selection logic below is a NAMED, RE-INVOKABLE function
 * (`window._egptSelectRenderer(overrideRenderer)`), not bare top-level script
 * code, called automatically ONCE at the bottom of this file (module load
 * time) — byte-identical resolution order and FAIL-LOUD behavior to every
 * experiment page as before this refactor.
 *
 * WHY: this file's OWN `<script>` tag is idempotently skipped on a SECOND
 * injection in the same page (`stack-boot.js`'s `_inject`/`graphics-render`'s
 * `_injectScript`, both keyed by exact `src` — confirmed by reading their
 * source: `document.querySelector('script[src="..."]')`). The notebook realm
 * (`GraphicsPane.boot()` via `lib/components/notebook-pane/realm-frqtl.js`)
 * can boot SEVERAL DIFFERENT experiments (2D and 3D) within ONE continuous
 * page session — unlike a canonical experiment page, which is its own
 * document, loaded fresh, exactly once. Without a re-invokable entry point,
 * the SECOND canvas cell's renderer request silently never took effect: this
 * file's selection logic (which ran once per document) never ran again,
 * so every canvas after the first stayed pinned to whichever renderer the
 * FIRST one selected (root cause of the CEO's 2026-07-03 visual finding —
 * 3D notebooks painting flat 2D circles in the notebook while the same
 * factory correctly renders perspective cubes in the GYM, whose iframe is a
 * fresh document per experiment). `bootFrqtlRealm` now calls
 * `window._egptSelectRenderer(wantRenderer)` explicitly when it detects the
 * requested renderer doesn't match `window._egptRenderer` — the SAME
 * selection authority every experiment page's first (and only) boot already
 * uses, never a second implementation.
 *
 * The ENGINE axis (js vs wasm) does NOT get the same re-invocable treatment:
 * unlike the renderer (both p5 AND three providers are ALWAYS loaded
 * unconditionally, so "reselecting" is just pointing at an already-loaded
 * global), which engine is active determines WHICH SCRIPT FILES loaded at all
 * (EGPTfrqtl.js vs wasm-engine.js+wasm-load-browser.js) and which live
 * `universe` object exists underneath a runner — switching it live would mean
 * tearing down and reconstructing engine state, a materially larger and
 * riskier change than swapping a render provider. `bootFrqtlRealm` instead
 * FAILS LOUD on an engine mismatch (never silently uses the wrong one) rather
 * than attempting a live engine swap — see realm-frqtl.js.
 */

(function () {
    'use strict';

    // PageParams contract (WS gym-controls-as-sugar Bite 3 item 0/2): the URL param
    // KEY NAME this file reads (`renderer`) is single-sourced from
    // lib/shim/page-params/index.js, live-imported via window.PageParams (installed
    // early in stack-boot.js's ENGINE array — guaranteed present before render-boot.js
    // is injected, which happens strictly after the ENGINE array + engine-boot.js
    // resolve). Mirrors actionCompiler.js's/OvenBox.js's _getAstSchema() guard: a
    // named FAIL-LOUD error (not a raw TypeError) if the contract script is missing.
    function _getPageParams() {
        if (typeof window !== 'undefined' && window.PageParams) { return window.PageParams; }
        throw new Error(
            '[render-boot] PageParams not available. ' +
            'Ensure lib/shim/page-params/index.js is loaded before render-boot.js ' +
            '(stack-boot.js\'s ENGINE array).'
        );
    }

    // Required method names for a valid RendererProvider (R-1 shape-check)
    var REQUIRED_RENDERER_METHODS = [
        'init', 'renderTick', 'filter', 'removeFilter',
        'setSize', 'start', 'stop', 'destroy', 'raw'
    ];

    /**
     * (Re)select the active renderer. Callable multiple times — each call
     * builds a FRESH `window._egptRendererReadyPromise` (with its own
     * resolve/reject closures) so a later re-selection does not resolve/reject
     * against a stale prior promise a caller may still be awaiting.
     *
     * Renderer resolution order (identical every call, `overrideRenderer` — new
     * in this refactor — takes priority over `?renderer=` when supplied):
     *   0. overrideRenderer   — explicit caller override (re-selection callers
     *      that already know exactly which renderer they need, e.g. the
     *      notebook realm). The automatic first call never passes this.
     *   1. ?renderer=         — explicit URL override (BYO: force p5/three/custom).
     *   2. window._egptDefaultRenderer / 'p5' — the page's own default (a 3D page names
     *      'three'). 3D-ness is NOT a boot flag: the host hands it to the provider's init
     *      (a scene's exp.createScene; a page's `new FrqtlApp({is3D:true})`).
     *
     * @param {string} [overrideRenderer] — 'p5'|'three'|'custom'.
     * @returns {Promise<void>} the fresh window._egptRendererReadyPromise.
     */
    window._egptSelectRenderer = function (overrideRenderer) {
        var params = new URLSearchParams(window.location.search);
        var renderer = overrideRenderer
                    || params.get(_getPageParams().KEYS.RENDERER)
                    || window._egptDefaultRenderer || 'p5';
        window._egptRenderer = renderer;

        /**
         * Register the selected provider into THE DISPLAY SLOT — the ONE answer to "which
         * provider owns the display" (RENDERER_CONTRACT §9: the display provider is
         * boot-fixed, observers are live). This boot is the slot's ONE writer, and it
         * FERRIES `renderer` — the name authority set on the line above — so the slot can
         * never answer differently from `build.renderer`, which derives from that same
         * `window._egptRenderer`. One chain, no second derivation.
         *
         * Resolved through a named FAIL-LOUD guard at CALL time: the slot heads the RENDERER
         * phase (renderer-layer-manifest.js), so its absence is a page configuration error.
         */
        function _registerDisplay(provider) {
            var slot = (typeof window !== 'undefined' && window.FrqtlDisplay) ? window.FrqtlDisplay
                     : ((typeof FrqtlDisplay !== 'undefined') ? FrqtlDisplay : null);
            if (!slot) {
                throw new Error('[render-boot] canonical contract FrqtlDisplay ' +
                    '(lib/frqtl/compat/renderer/display-slot.js) is unreachable — it must load ' +
                    'in the RENDERER phase, before this script. Fail-loud, not a fallback.');
            }
            return slot.set(provider, renderer);
        }

        // ── FAIL-LOUD machinery (mirrors engine-boot.js exactly) ───────────────

        function failLoud(detail) {
            var msg =
                'RENDERER BOOT FAILED — renderer=' + renderer + '\n\n' +
                detail + '\n\n' +
                'This pane is intentionally blank. The requested renderer is unavailable\n' +
                'and the page did NOT fall back to a different renderer.\n\n' +
                'Available renderers: p5 | three | custom\n' +
                'For three.js: ensure three.js is available (CDN or vendor).\n' +
                'For custom: set window._egptCustomRenderer before render-boot.js loads.';

            // ── Host-aware overlay scoping (fix-loop #5) — delegated to the ONE
            // shared painter (fix-loop #6/#7) ───────────────────────────────────
            // A canonical STANDALONE experiment page (or the GYM's per-experiment
            // iframe) genuinely IS the experiment — a full-viewport overlay is
            // correct there (the whole document has nothing else to show). The
            // NOTEBOOK realm is different: ONE document hosts MANY cells, and a
            // fixed inset:0 overlay blanks the ENTIRE IDE (sidebar, other cells,
            // everything) for a failure that is scoped to a SINGLE canvas cell.
            // `bootFrqtlRealm` (lib/components/notebook-pane/realm-frqtl.js) sets
            // `window._egptRendererOverlayHost` to the failing cell's own mount
            // element before booting; the shared painter (engine-boot.js's
            // `window._egptPaintFailOverlay`, which loads BEFORE this file in
            // stack-boot.js's ENGINE-then-RENDERER sequence, so it is always
            // installed by the time a renderer failure can occur) checks this
            // global and paints IN-CELL there instead of the page-wide overlay.
            // Standalone pages never set this global, so they keep the exact
            // pre-existing full-viewport behavior. This file used to carry its
            // OWN duplicate paintScoped/paintFullViewport implementation (a
            // second overlay authority — flagged by the tester as a CASE4
            // regression risk once engine-boot.js also needed host-awareness);
            // it now delegates ALL DOM placement to the ONE shared painter,
            // supplying only its OWN axis-labeled message + its OWN pre-existing
            // marker/id/color scheme (unchanged from fix-loop #5).
            if (typeof window._egptPaintFailOverlay === 'function') {
                window._egptPaintFailOverlay({
                    msg: msg,
                    fullViewportId: 'egpt-renderer-error',
                    scopedMarkerAttr: 'data-egpt-renderer-error',
                    bg: '#000a1a', fg: '#6b9eff', border: '#1640b6'
                });
            } else if (document.body || document.documentElement) {
                // Defensive fallback ONLY — should be unreachable on the canonical
                // stack-boot.js path (engine-boot.js always loads first and installs
                // the shared painter). Kept so this file stays self-sufficient if
                // ever exercised standalone (e.g. a test harness).
                var b = document.createElement('div');
                b.id = 'egpt-renderer-error';
                b.style.cssText =
                    'position:fixed;inset:0;z-index:99998;background:#000a1a;color:#6b9eff;' +
                    'font:13px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:22px;' +
                    'white-space:pre-wrap;overflow:auto;border:2px solid #1640b6;';
                b.textContent = msg;
                if (!document.getElementById('egpt-renderer-error')) {
                    (document.body || document.documentElement).appendChild(b);
                }
            }
            if (window.console && console.error) console.error('[render-boot] ' + detail);
        }
        window._egptRendererFailLoud = failLoud;

        // ── Session-clean renderer recovery (WS gym-controls-as-sugar fix #2,
        // runtime doc §5) ────────────────────────────────────────────────────
        // window._egptRendererReadyState is a SYNCHRONOUSLY-readable companion
        // to window._egptRendererReadyPromise: 'pending' | 'ready' | 'failed'.
        // A Promise's settled state cannot be inspected synchronously, and the
        // notebook realm (bootFrqtlRealm, realm-frqtl.js) needs to detect "the
        // CURRENTLY installed promise already failed" BEFORE re-awaiting it —
        // awaiting an already-rejected promise a second time just re-rejects
        // immediately; it never gives the new caller a fresh attempt. This
        // state is maintained ONLY here, wrapping the SAME resolve/reject
        // closures that already own the promise's lifecycle (below) — it is
        // not a second authority, just a readable mirror of this one.
        //
        // USAGE RULE (architect gate, tighten-on-review): this field is a
        // RE-ARM TRIGGER ONLY, never a synchronous proceed-gate. Its ONLY
        // sanctioned read is "== 'failed' → call window._egptSelectRenderer()
        // again before awaiting" (see bootFrqtlRealm's pre-boot check). A
        // caller must NEVER branch on 'ready'/'pending' to decide whether it is
        // safe to use the renderer NOW — readiness is ALWAYS awaited via
        // window._egptRendererReadyPromise (through window._egptWhenRendererReady),
        // never inferred from this string. The state can (harmlessly) flip
        // to 'ready' asynchronously, after some other code already read
        // 'pending' — treating that read as a synchronous "not ready yet, so
        // don't proceed" signal would be racy by construction.
        window._egptRendererReadyState = 'pending';

        var _readyResolve = null;
        var _readyReject  = null;
        window._egptRendererReadyPromise = new Promise(function (res, rej) {
            _readyResolve = function () { window._egptRendererReadyState = 'ready'; res(); };
            _readyReject  = function (err) { window._egptRendererReadyState = 'failed'; rej(err); };
        });
        window._egptRendererReadyPromise.catch(function () {});  // suppress unhandled

        function rejectBoot(detail) {
            failLoud(detail);
            _readyReject(new Error(detail));
        }

        // (onReady, onError) — WS gym-controls-as-sugar fix-loop #6 Finding A. `onError`
        // is OPTIONAL and NEW: a genuine renderer-boot failure ALWAYS paints the visible
        // failLoud overlay (unchanged), but until this fix-loop nothing told a
        // PROGRAMMATIC caller (GraphicsPane.boot(), which awaits this exact function)
        // that the wait will never succeed — its own Promise chain stayed pending
        // forever, so the notebook cell/badge hung on "running" with no way to recover
        // short of a page reload. Passing `onError` lets such a caller reject its OWN
        // promise deterministically instead of relying on ever-invoking `onReady`.
        window._egptWhenRendererReady = function (onReady, onError) {
            window._egptRendererReadyPromise
                .then(function () { onReady(); })
                .catch(function (err) {
                    if (!document.getElementById('egpt-renderer-error')) {
                        failLoud('renderer not ready: ' + (err && (err.message || err)));
                    }
                    if (typeof onError === 'function') { onError(err); }
                });
        };

        // ── three.js dynamic loader ────────────────────────────────────────────
        //
        // WS gym-controls-as-sugar fix-loop #5 (2026-07-03 tester finding) — the
        // Monaco-AMD / three.js-UMD collision, and why this loader is a SCOPED
        // EVAL rather than a plain <script src> tag:
        //
        // three.js r128 ships a UMD wrapper (see lib/frqtl/assets/vendor/three.min.js,
        // byte 1): `"function"==typeof define&&define.amd?define(["exports"],e):
        // e((t=…globalThis…).THREE={})`. A bare `<script src=three.min.js>` tag
        // executes that wrapper against WHATEVER `define`/`require` happen to be
        // live GLOBALS at that moment. In the notebook realm, Monaco's AMD loader
        // (lib/components/code-editor/index.js `_loadMonaco`/`_configAndRequire`)
        // installs a PERSISTENT global `window.define`/`window.require` the first
        // time ANY CodeEditorPane is constructed — and that global OUTLIVES the
        // pane (module-level `_monacoLoadPromise`/`_monacoAvailable` cache, per
        // that file's own docstring). So inside the notebook document, three's
        // UMD sees `define.amd` truthy and takes the AMD branch: an ANONYMOUS
        // `define(["exports"], e)` call. Monaco's loader.js throws "Can only have
        // one anonymous define call per script file" on this (it is not resolving
        // three.js as one of ITS OWN AMD modules) — `window.THREE` never gets
        // set, and this file's FAIL-LOUD correctly (but uselessly) rejects.
        // Standalone experiment pages never hit this: three.js loads via a
        // static <head> <script> tag BEFORE Monaco (which experiment pages never
        // construct at all) exists — there is no AMD loader alive yet.
        //
        // MECHANISM CHOSEN: scoped evaluation. Fetch three.min.js as TEXT, then
        // evaluate it via `new Function('define','require','module','exports', src)`
        // called with ZERO arguments — inside that function body, `define`/
        // `require`/`module`/`exports` are simply the function's own (unfilled)
        // parameters, so they read `undefined`, LOCAL to that call, and three's
        // UMD wrapper deterministically falls through to its plain-global branch
        // (`e((t=…globalThis…).THREE={})`), exactly as if no module loader were
        // present. `window.THREE` is unmodified real vendored source — nothing is
        // forked or rewritten, only evaluated in a shadowed local scope.
        //
        // Why NOT the alternatives (both considered, both rejected — evidence in
        // the fix-loop #5 report):
        //   (a) vendor an ESM build of three — would change the one vendored
        //       three.min.js artifact + every consumer that expects a UMD/global
        //       script (every standalone experiment page's static <head> tag,
        //       sdk/frqtl-sdk's dist copy, the GYM iframe) for a bug that is
        //       ENTIRELY local to one dynamic-load call site. Rejected: blast
        //       radius far exceeds the actual defect.
        //   (c) statically preload three in the notebook host document — matches
        //       how standalone pages avoid the collision, but loads three.js for
        //       EVERY notebook session even when no cell requests 3D, directly
        //       against this codebase's established "modular self-gating layers"
        //       principle (render-effects R4/R5, mesh-loader opt-in below).
        //       Rejected: pays an unconditional cost to dodge a bug that a local,
        //       zero-blast-radius fix already solves.
        //   NEITHER is rejected because it wouldn't work — both would. They are
        //   rejected because scoped evaluation fixes the actual collision AT ITS
        //   ONE CALL SITE with no change to any other consumer and no cost paid
        //   by sessions that never load three.js.
        //
        // Why NOT `window.define = undefined` around the script tag (the naive,
        // UNSAFE variant of "shadow the UMD check"): that mutates a REAL shared
        // global for the async gap between injecting the script and its onload
        // firing. Monaco's own loader can have an in-flight `require([...])` call
        // pending at ANY time (it is a persistent, cross-pane global) — if that
        // call's callback runs while `window.define` is nulled out, Monaco itself
        // breaks. Scoped evaluation has NO such window: `define`/`require` are
        // shadowed only inside the synchronously-invoked `new Function(...)`
        // call — `window.define`/`window.require` are never read, written, or
        // even glanced at.
        //
        // Note on the mesh-loader UMDs (GLTFLoader.js/DRACOLoader.js, below):
        // verified they do NOT have this problem — both are plain IIFEs with no
        // `typeof define` check at all (`grep -c "define("` → 0 in both files),
        // so they stay on the ordinary <script> injection path unchanged.
        function _loadThree() {
            if (typeof THREE !== 'undefined') {
                // already loaded (e.g. static script tag on the page, or a PRIOR
                // re-selection in this same session already loaded it)
                _initThreeProvider();
                return;
            }

            var threeUrl = window._egptThreeUrl ||
                'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

            fetch(threeUrl)
                .then(function (resp) {
                    if (!resp.ok) {
                        throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
                    }
                    return resp.text();
                })
                .then(function (source) {
                    try {
                        // eslint-disable-next-line no-new-func
                        var evalThree = new Function(
                            'define', 'require', 'module', 'exports',
                            source + '\n//# sourceURL=' + threeUrl
                        );
                        // Called with NO arguments: define/require/module/exports
                        // are the function's own unfilled parameters (=== undefined
                        // inside this call only) — this is the shadow. No global
                        // is ever touched.
                        evalThree();
                    } catch (evalErr) {
                        rejectBoot('three.js evaluation failed (scoped-eval AMD shadow): ' +
                                   (evalErr && (evalErr.message || evalErr)) + '\nURL: ' + threeUrl);
                        return;
                    }
                    if (typeof THREE === 'undefined') {
                        rejectBoot('three.js evaluated but THREE is not defined.\nURL: ' + threeUrl);
                    } else {
                        _loadMeshLoaders(_initThreeProvider);
                    }
                })
                .catch(function (fetchErr) {
                    rejectBoot('three.js failed to load from: ' + threeUrl + '\n' +
                               'Check network connectivity or set window._egptThreeUrl to a local path.\n' +
                               (fetchErr && (fetchErr.message || fetchErr)));
                });
        }

        // ── render.mesh external-geometry loaders (GLTFLoader + DRACOLoader) ──────
        // Loaded ONLY when an experiment opts in via window._egptMeshLoaders (most experiments
        // don't use render.mesh, so they don't pay the ~445KB cost). They are UMD globals that
        // attach to THREE, so they MUST load AFTER three (here) and BEFORE provider init. The
        // base dir is derived through the router's 'assets/vendor/' key (via
        // window._egptResolveFrqtl, published by stack-boot.js) — THIS is the ONE place the
        // base is computed AND published (window._egptMeshLoadersBase); the provider
        // (three-provider.js) only ever READS what is published here, never re-derives it (two
        // defaults for one fact is the mirror this bite closes). No override knob: grepping the
        // tree turns up zero writers of _egptMeshLoadersBase other than this function, so a
        // second input here would be a knob nobody sets (the same no-writer class B1b deleted).
        // FAIL LOUD if a requested loader can't load — a mesh experiment with no loader is a
        // broken experiment, not a silent sprite.
        function _loadMeshLoaders(done) {
            if (!window._egptMeshLoaders) { done(); return; }
            if (typeof window._egptResolveFrqtl !== 'function') {
                rejectBoot('render.mesh loaders requested (window._egptMeshLoaders) but ' +
                           'window._egptResolveFrqtl is unavailable — this page must load through ' +
                           'stack-boot.js, which publishes it.');
                return;
            }
            var base = window._egptResolveFrqtl('assets/vendor/three-loaders');
            window._egptMeshLoadersBase = base;   // publish for the provider's DRACO decoder path
            var scripts = [base + '/GLTFLoader.js', base + '/DRACOLoader.js'];
            (function next(i) {
                if (i >= scripts.length) {
                    if (typeof THREE.GLTFLoader === 'undefined' || typeof THREE.DRACOLoader === 'undefined') {
                        rejectBoot('render.mesh loaders loaded but THREE.GLTFLoader/DRACOLoader undefined.\n' +
                                   'Base: ' + base + ' (router key \'assets/vendor/three-loaders\' — ' +
                                   'run scripts/vendor-three-loaders.mjs to populate the vendored dir).');
                        return;
                    }
                    done();
                    return;
                }
                var ms = document.createElement('script');
                ms.src = scripts[i];
                ms.onload = function () { next(i + 1); };
                ms.onerror = function () {
                    rejectBoot('render.mesh loader failed to load: ' + scripts[i] + '\n' +
                               'Router key \'assets/vendor/three-loaders\' resolved to this base — ' +
                               'run scripts/vendor-three-loaders.mjs to populate the vendored dir.');
                };
                document.head.appendChild(ms);
            })(0);
        }

        function _initThreeProvider() {
            try {
                _registerDisplay(window._egptRendererProviders.three.makeProvider());
                _readyResolve();
            } catch (e) {
                rejectBoot('three provider init failed: ' + (e && (e.message || e)));
            }
        }

        // ── Provider selection ─────────────────────────────────────────────────

        if (renderer === 'custom') {
            // BYO path: the page must set window._egptCustomRenderer to a RendererProvider.
            // R-1: shape-check — fail loud at the boundary, not mid-frame.
            if (!window._egptCustomRenderer) {
                rejectBoot('renderer=custom requested but window._egptCustomRenderer is not set.\n' +
                           'Set it before render-boot.js loads.');
            } else {
                // Verify all required contract methods are present (R-1)
                var missingMethod = null;
                for (var mi = 0; mi < REQUIRED_RENDERER_METHODS.length; mi++) {
                    var methodName = REQUIRED_RENDERER_METHODS[mi];
                    if (typeof window._egptCustomRenderer[methodName] !== 'function') {
                        missingMethod = methodName;
                        break;
                    }
                }
                if (missingMethod) {
                    rejectBoot('custom renderer missing required method: ' + missingMethod + '\n' +
                               'A RendererProvider must implement: ' +
                               REQUIRED_RENDERER_METHODS.join(', ') + '\n' +
                               'See render-boot.js §RendererProvider BYO contract for the full spec.');
                } else {
                    _registerDisplay(window._egptCustomRenderer);
                    _readyResolve();
                }
            }

        } else if (renderer === 'three') {
            // Load three.js dynamically, then init provider.
            if (window._egptRendererProviders && window._egptRendererProviders.three) {
                // Provider script already loaded; three.js itself may still need loading.
                _loadThree();
            } else {
                rejectBoot('three-provider.js not loaded (window._egptRendererProviders.three missing).\n' +
                           'Add three-provider.js script tag before render-boot.js.');
            }

        } else {
            // Default: p5
            if (!window._egptRendererProviders || !window._egptRendererProviders.p5) {
                rejectBoot('p5-provider.js not loaded (window._egptRendererProviders.p5 missing).\n' +
                           'Add p5-provider.js script tag before render-boot.js.');
            } else {
                // p5 provider is ready; the actual p5 instance is created later in setup().
                // FrqtlApp.start() will call provider.init() from setup().
                _registerDisplay(window._egptRendererProviders.p5.makeProvider());
                _readyResolve();
            }
        }

        return window._egptRendererReadyPromise;
    };

    // Automatic first invocation — preserves EXACT current behavior for every
    // experiment page (a single call, at script-load time, no override).
    window._egptSelectRenderer();

})();
