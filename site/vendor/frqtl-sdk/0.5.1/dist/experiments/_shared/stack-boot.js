/* Copyright 2023-2026 by Essam Abadir */

/**
 * stack-boot.js — canonical ONE-ORDER shared loader for experiment pages.
 *
 * The canonical injection order for the game layer is defined in the ESM
 * manifest at lib/shim/engine/game-layer-manifest.js (GAME_LAYER_SCRIPTS).
 * Because stack-boot is a classic browser-injected script (not ESM) it cannot
 * import that module, so the GAME array below is a literal copy. The parity
 * test lib/shim/engine/test/game-layer-manifest.test.mjs enforces 1:1 order
 * equality between this literal and GAME_LAYER_SCRIPTS — drift is a CI failure.
 *
 * USAGE on each experiment page:
 *
 *   <!-- 1. WASM pkg URL (required, must be before this tag) -->
 *   <script>window._egptWasmPkgUrl = new URL("../../../fat/pkg-web/egpt_wasm.js",
 *       document.baseURI).href;</script>
 *   <!-- 2. Shared loader — lists page-specific extras in data-page-scripts -->
 *   <script src="../_shared/stack-boot.js"
 *       data-page-scripts="
 *           ../../objects/setup/setupParticleWalk.js,
 *           ../_shared/experiment-metrics.js
 *       "></script>
 *
 * data-page-scripts: comma-separated list of URLs to inject IN ORDER after the
 * game layer (FrqtlApp). Use paths relative to the experiment page.
 * These are injected BEFORE the sketch script runs (they appear here in the
 * HTML just before the sketch <script>). Because they are loaded by stack-boot
 * (not as static <script> tags), window.LargeObject / window.QuantumEmitter /
 * etc. are guaranteed to be available when each file executes.
 *
 * After this tag the page keeps ONLY:
 *   - Its experiment sketch <script> block (defines window.setup, then calls
 *     window._egptStartSketch() — the one boot dance, see below)
 *   - Its controls/layout markup
 *   - Any vendor extras placed BEFORE this tag that must load first (idempotent)
 *
 * ── CANONICAL INJECTION ORDER ───────────────────────────────────────────────
 *
 *   ENGINE:
 *     chroma.min.js            — color mapping (must precede LightColor)
 *     objects/geometry/Rectangle.js — the sole spatial-rect authority (window.Rectangle)
 *     wasm-engine.js           — WASM engine provider
 *     wasm-load-browser.js     — WASM loader
 *     egpt-engine.js           — unified compat layer
 *     /lib/shim/expr/ast-schema.js       — op-program AST node-kind vocabulary
 *     /lib/shim/frame-data/index.js      — data-bubble + render-intent VALUE contract
 *     /lib/shim/page-params/index.js     — URL-param routing-table contract (Bite 3)
 *     /lib/shim/field-descriptor/index.js — field-shape vocabulary contract (§7 r2 C1)
 *     /lib/shim/controls/index.js        — control-descriptor schema contract (Bite 1)
 *     /lib/shim/controls/registry.js     — runtime instance registry (AFTER index.js)
 *     engine-boot.js           — FAIL-LOUD engine selection
 *
 *   RENDERER:
 *     LightColor.js            — single color source
 *     FieldBuilder.js          — height-field builder (before providers)
 *     renderCapabilities-common.js — shared universal-knob + filter-loop owner
 *       (WS Studio Controls Realignment S5b) — MUST load before providers
 *       (their renderCapabilities() resolves window.RenderCapabilitiesCommon
 *       at call time)
 *     captureStill-common.js   — shared pixel-readback + still-bag owner for the
 *       OPTIONAL captureStill() capability — MUST load before providers (they
 *       resolve window.CaptureStillCommon at call time)
 *     p5-provider.js           — p5 2.x RendererProvider
 *     three-provider.js        — three.js RendererProvider
 *     Filters.js               — built-in shader filter specs
 *     render-boot.js           — FAIL-LOUD renderer selection
 *
 *   GAME LAYER (canonical order from game-layer-manifest.js GAME_LAYER_SCRIPTS):
 *     CollisionTypes.js, CollisionActions.js, Charge.js, Rectangle.js
 *     LargeObject.js, QuantumEmitter.js, PointSource.js
 *     DetectorWall.js, slitLinerScatter.js, SlitScreen.js, SlitLightSource.js
 *     EgptFractal.js, Box.js (BEFORE OvenBox — eval-time dep), OvenBox.js
 *     CircuitGate.js, CircuitProbe.js
 *     Tube.js, directedRedirectProgram.js, DirectedTunnel.js (DIRECTED TUNNEL
 *       BUILD, 2026-07-13 — DirectedTunnel extends Tube; needs Tube.js +
 *       slitLinerScatter.js, both loaded earlier)
 *     controlBind.js, makeControlsForObject.js, makeControlsForRenderSurface.js
 *       (§7 r2, Bite S5a — the render-side factory twin), frqtl-control-slider.js,
 *       frqtl-controls-panel.js (WS Studio Controls Realignment S3 — SAME
 *       promotion move: Studio's author iframe needs these available
 *       regardless of which page is loaded)
 *     frqtl-control-write-queue.js (WS Studio Controls Realignment S4 —
 *       SAME promotion move; the rAF-coalesced write-side symmetric
 *       primitive to frqtl-control-sync.js's pull side)
 *     schema/index.js, ObjectFactory.js, instruments/capture.js (the tap
 *       MECHANISM), FrqtlApp.js, RecipeContext.js
 *
 *   PAGE SCRIPTS (data-page-scripts):
 *     — per-page objects, setup factories, and _shared helpers
 *       guaranteed to run AFTER the whole GAME roster is in the global scope
 *
 * ── THE ONE BOOT DANCE (deferred p5) ───────────────────────────────────────
 *
 *   p5 is NOT injected by the sequence. A page's sketch ends with ONE call:
 *
 *     window._egptStartSketch();                 // p5 on the p5 renderer, else setup()
 *     window._egptStartSketch({ p5: 'always' }); // p5 whatever the renderer
 *
 *   which waits for engine ready, renderer ready AND the stack-complete promise
 *   (below), then injects p5 (whose load calls window.setup) or calls
 *   window.setup() itself. No page polls a global or re-implements the dance.
 *
 * ── EARLY SHIMS ────────────────────────────────────────────────────────────
 *
 *   stack-boot.js installs synchronous queue-shims for both
 *   window._egptWhenEngineReady and window._egptWhenRendererReady so the
 *   sketch <script> block (which executes after this <script> tag is parsed
 *   but BEFORE the async chain completes) can register callbacks immediately.
 *   The shims drain their queues once engine-boot.js and render-boot.js have
 *   run and replaced the shims with real implementations.
 *
 * ── STACK READY ────────────────────────────────────────────────────────────
 *
 *   window._egptStackReadyPromise resolves when this loader's LAST phase has
 *   loaded — the whole GAME roster AND every data-page-scripts entry, in order —
 *   and rejects with the boot error if the sequence stopped. This loader owns the
 *   phases, so it publishes "the stack is complete" rather than leaving a consumer
 *   to watch one global and infer the rest: `_egptWhenEngineReady` fires long
 *   BEFORE the GAME phase (it drains right after engine-boot.js), so engine-ready
 *   alone never implies a loaded stack, and stack-complete says nothing about WASM.
 *   lib/shim/engine/engine-stack-boot.js and GraphicsPane.boot() await both;
 *   window._egptStartSketch() composes both for a page.
 *
 * ── IDEMPOTENT / FAIL-LOUD ─────────────────────────────────────────────────
 *
 *   Each src is injected at most once. Any load failure surfaces as a visible
 *   overlay — no silent fallback.
 */

(function () {
    'use strict';

    /* ── Capture currentScript synchronously (invalid after parse) ──────── */
    var _tag = document.currentScript;

    /* ── Page-specific scripts from data-page-scripts attribute ─────────── */
    var _pageScripts = (function () {
        var raw = _tag && _tag.getAttribute('data-page-scripts');
        if (!raw) { return []; }
        return raw.split(',').map(function (s) {
            var trimmed = s.trim();
            if (!trimmed) { return null; }
            /* data-page-scripts paths are relative to the experiment page.
               We resolve them from the page's base URL.                    */
            if (trimmed.indexOf('http') === 0 || trimmed.indexOf('/') === 0) {
                return { src: trimmed, entry: trimmed };
            }
            /* Relative path — resolve from document.baseURI which is the page URL */
            try {
                return { src: new URL(trimmed, document.baseURI).href, entry: trimmed };
            } catch (e) {
                return { src: trimmed, entry: trimmed };
            }
        }).filter(Boolean);
    })();

    /* resolved src → the frqtl-relative entry it was resolved from, recorded by _u so a
       failed load names its manifest entry instead of re-deriving it from the URL. */
    var _entryOf = {};

    /* ── Path resolution — router-driven, ONE branch (RED TEAM BLOCKER 2,
       ws-egpt-frqtl-site-deploy; collapsed to a single always-required branch,
       ws-stackboot-dev-map) ──────────────────────────────────────────────────
       Consult the router's SINGLE browser projection window._egptEnginePathMap — the
       SAME omit/remap map lib/components/graphics-render/index.js _url() reads, built
       by buildBrowserPathMap() (lib/shim/engine/router.js, the ONE path authority).
       First matching prefix wins in insertion order; a '' replacement is the router's
       __distOmit signal → returns '' so the sequencer SKIPS the tag, exactly like
       engineScripts()/_injectScript skip empty resolves.

       THREE host classes inject the map before this <script> tag runs:
         - dev-core:     lib/server/mounts.js's experiment-page path-map handler
                          (buildBrowserPathMap(DEV_CORE_PROFILE), spliced at request time,
                          via lib/shim/engine/experiment-page-map.js's spliceEnginePathMap —
                          the ONE injection-contract authority both this class and the next
                          share).
         - dist/static:  sdk/frqtl-sdk/build.js's rewriteExperimentHtml
                          (buildBrowserPathMap(DIST_PROFILE), baked at build time, via the
                          SAME spliceEnginePathMap).
         - programmatic:  a host that INJECTS this tag into a page it already owns (not one
                          of the two above, which SERVE an already-authored page) — sets the
                          map itself, from its OWN engineRouter() instance, BEFORE injecting
                          the tag: router.ensureBrowserPathMap() (lib/shim/engine/router.js).
                          The two are: GraphicsPane.prototype.boot()
                          (lib/components/graphics-render/index.js — the notebook canvas
                          cell, and the static bundle's CODE canvas) and ensureEngineStack()
                          (lib/shim/engine/engine-stack-boot.js — the builder cell's
                          frqtl.ensureEngine). Two routers on one page is a HOST BUG, not a
                          silent merge — ensureBrowserPathMap() throws if a DIFFERENT map is
                          already present, no-ops if it is byte-identical, sets it if absent.
       A missing map is a HOST BUG, not a state _u() papers over with a guessed dev
       literal — it FAILS LOUD naming the two SERVING injectors (the programmatic class
       fails loud earlier still, at router.ensureBrowserPathMap() itself, before this tag
       even runs). */
    function _u(rel) {
        var src = _resolve(rel);
        if (src) { _entryOf[src] = rel; }
        return src;
    }

    function _resolve(rel) {
        var map = window._egptEnginePathMap;
        if (!map || typeof map !== 'object') {
            throw new Error(
                '[stack-boot] window._egptEnginePathMap is missing — refusing to guess a path for "' +
                rel + '". Every host serving this page must inject it (buildBrowserPathMap(<profile>), ' +
                'lib/shim/engine/router.js) BEFORE this <script> tag: dev-core via ' +
                'lib/server/mounts.js\'s experiment-page path-map handler; dist/static via ' +
                'sdk/frqtl-sdk/build.js\'s rewriteExperimentHtml.'
            );
        }
        var keys = Object.keys(map);
        for (var i = 0; i < keys.length; i++) {
            var prefix = keys[i];
            if (rel === prefix || rel.indexOf(prefix) === 0) {
                return map[prefix] + rel.slice(prefix.length);
            }
        }
        throw new Error(
            '[stack-boot] window._egptEnginePathMap has no prefix entry for "' + rel + '". ' +
            'Add the prefix to every profile in lib/shim/engine/router.js (profile parity).'
        );
    }

    /* ── chrome=canvas mode ───────────────────────────────────────────────
       ?chrome=canvas: hide all control/metric chrome so the canvas fills the
       viewport. Used by gallery tiles and the landing splash.

       Implementation: set data-chrome="canvas" on <html> immediately so CSS
       can suppress chrome elements before they paint. The consumer (experiment-
       layout.css) uses structural selectors — no per-experiment fork needed.

       FAIL-LOUD: any non-empty value other than "canvas" renders an error
       overlay via the shared stack-boot style and does NOT throw (so the
       overlay itself remains visible).

       Known value:
         canvas — hide chrome panels; canvas/histogram rows fill the viewport.
    */
    (function _applyChrome() {
        var params;
        try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
        var chrome = params.get('chrome');
        if (!chrome) { return; }
        if (chrome === 'canvas') {
            document.documentElement.setAttribute('data-chrome', 'canvas');
            window._egptChromeMode = 'canvas';
            return;
        }
        /* Unknown value — FAIL-LOUD */
        var msg = '[stack-boot] Unknown ?chrome= value: "' + chrome + '". ' +
            'Accepted value: "canvas". Remove the param to use full chrome.';
        if (window.console && console.error) { console.error(msg); }
        /* Render visible overlay using the shared stack-boot error style.
           Do NOT throw — let the page boot so the overlay remains readable. */
        var b = document.createElement('div');
        b.id = 'egpt-chrome-error';
        b.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a0000;' +
            'color:#ff6b6b;font:13px/1.55 ui-monospace,monospace;padding:22px;' +
            'white-space:pre-wrap;overflow:auto;border:2px solid #b6161c;';
        b.textContent = msg;
        (document.body || document.documentElement).appendChild(b);
    }());

    /* ── EARLY SHIM: window._egptWhenEngineReady ───────────────────────────
       Installs a queue-shim synchronously so the sketch <script> can call
       _egptWhenEngineReady immediately (before engine-boot.js loads).
       engine-boot.js will replace this with the real implementation; we
       drain the queue immediately after injecting engine-boot.js.
       (onReady, onError) — WS gym-controls-as-sugar fix-loop #6 Finding A:
       an OPTIONAL second callback fired if the engine fails to boot. Queued
       as a PAIR (not a bare fn) so the drain below can forward BOTH to the
       real implementation once it replaces this shim — a caller that only
       ever passed one argument (every existing call site except
       GraphicsPane.boot()'s new one) is unaffected: `onError` is simply
       `undefined` and the real implementation's `typeof onError ===
       'function'` guard (engine-boot.js) never invokes it.               */
    /* `_engineTarget` is what the shim FORWARDS to once its queue has been drained (the real
       implementation, or the failure reporter). A caller may have CAPTURED the shim before the
       drain (GraphicsPane.boot() does, for the renderer) and call it after; without the forward
       that call would queue onto an array nothing drains again — a hang, reachable whenever the
       other axis settles after the drain. */
    var _engineShim = null;
    var _engineTarget = null;
    if (typeof window._egptWhenEngineReady !== 'function') {
        var _engineQueue = [];
        _engineShim = window._egptWhenEngineReady = function (onReady, onError) {
            if (_engineTarget) { _engineTarget(onReady, onError); return; }
            _engineQueue.push({ onReady: onReady, onError: onError });
        };
        window._egptStackBootEngineQueue = _engineQueue;
    }

    /* ── EARLY SHIM: window._egptWhenRendererReady ─────────────────────────
       Same pattern for the renderer (fix-loop #6 Finding A — see above).    */
    var _rendererShim = null;
    var _rendererTarget = null;   // same forward as _engineTarget above
    if (typeof window._egptWhenRendererReady !== 'function') {
        var _rendererQueue = [];
        _rendererShim = window._egptWhenRendererReady = function (onReady, onError) {
            if (_rendererTarget) { _rendererTarget(onReady, onError); return; }
            _rendererQueue.push({ onReady: onReady, onError: onError });
        };
        window._egptStackBootRendererQueue = _rendererQueue;
    }

    /* ── THE ONE SEQUENCER (lib/shim/engine/script-sequencer.js) ─────────────
       Every list below is injected through window.FrqtlScriptSequencer.page.injectInOrder:
       all tags of a phase appended at once with async=false — fetched in parallel, executed in
       document order — so each manifest's load order is unchanged and only the fetch stops
       waiting on the previous onload. Idempotence per URL and per-entry failure naming
       (err.src) are the owner's. This file bootstraps it EXACTLY ONCE (_bootstrapSequencer,
       one tag, no chain); the router-relative path is a literal copy of
       shim-contract-manifest.js::BOOT_SEQUENCER_SCRIPT (parity: sequencer-owner-tombstone.test.mjs). */
    var _SEQUENCER_SCRIPT = 'shim/engine/script-sequencer.js';
    var _sequencerReady = null;

    function _bootstrapSequencer() {
        if (_sequencerReady) { return _sequencerReady; }
        _sequencerReady = new Promise(function (res, rej) {
            if (window.FrqtlScriptSequencer) { res(window.FrqtlScriptSequencer); return; }
            var src = _u(_SEQUENCER_SCRIPT);
            var s = document.createElement('script');
            s.src = src;
            s.onload = function () {
                if (!window.FrqtlScriptSequencer) {
                    var e = new Error('[stack-boot] ' + src + ' loaded but did not install window.FrqtlScriptSequencer');
                    e.src = src;
                    rej(e);
                    return;
                }
                res(window.FrqtlScriptSequencer);
            };
            s.onerror = function () {
                var err = new Error('[stack-boot] load failed: ' + src);
                err.src = src;
                rej(err);
            };
            (document.body || document.head).appendChild(s);
        });
        return _sequencerReady;
    }

    /* Inject one phase's list through the owner. `phase` (a BOOT_PHASE id) gets one record step
       per loaded script. */
    function _seqPhase(list, phase) {
        return _bootstrapSequencer().then(function (sq) {
            return sq.page.injectInOrder(list, {
                label: 'stack-boot',
                onLoaded: function () { if (_record && phase) { _record.step(phase); } }
            });
        });
    }

    /* Expose the engineRouter-backed resolver (`_u`, the ONE path authority via
       window._egptEnginePathMap) + the FAIL-LOUD idempotent injector so a load-by-eval page
       (empty/index.html's walkthrough hook) can inject a per-rung setup-factory DELTA BEFORE
       eval — never a hand-derived '../../' path (ws-experiments-walkthrough Bite 3a, architect
       ruling C). _egptInjectScript returns a Promise that REJECTS on load failure (surfaced
       FAIL-LOUD by the hook). */
    window._egptResolveFrqtl = _u;
    window._egptInjectScript = function (relPath) {
        try { return _seqPhase([{ src: _u(relPath) }], null); } catch (e) { return Promise.reject(e); }
    };

    /* ── THE BOOT RECORD — phases × real counts ────────────────────────────────
       Literal copy of lib/shim/engine/boot-phases.js::BOOT_PHASE_IDS (a classic script cannot
       import it); parity: lib/shim/engine/test/boot-phases.test.mjs. Written through the
       sequencer's createBootRecord — the one writer of <html data-egpt-boot-*> and of the
       frqtl:boot-phase event. Every list phase's total is set up front from its list. */
    var _BOOT_PHASE_IDS = ['engine-scripts', 'engine-ready', 'renderer', 'game', 'page', 'sketch'];
    var _record = null;

    /* Tag the first failure with the phase it happened in, then keep rejecting. */
    function _failIn(phase) {
        return function (err) {
            if (_record) { _record.fail(phase); }
            throw err;
        };
    }

    /* ── Canonical script lists — LAZY (R2, ws-stackboot-dev-map SEAM RULING) ──
       Each list is built by a FUNCTION, called only from inside the boot chain
       below (not at IIFE top level). Every entry calls _u(), which THROWS when
       window._egptEnginePathMap is missing/incomplete — building these as plain
       top-level `var` array literals made that throw happen at SCRIPT-PARSE time,
       before the promise chain (and its one .catch → painter) existed, so the
       page went blank with only a console witness. Calling the builder INSIDE a
       .then() turns that same throw into a promise REJECTION that flows into the
       existing .catch → _bootFailureMessage → painter — no second painter. */

    function _engineList() { return [
        { src: _u('assets/vendor/chroma.min.js') },
        // Rectangle — the sole spatial-rect authority (objects/geometry/Rectangle.js).
        // Loaded here in the ENGINE phase because the WASM provider wrapper's createUniverse
        // needs window.Rectangle before the GAME layer runs; the GAME array re-lists it
        // (idempotent — the sequencer dedups by src).
        { src: _u('objects/geometry/Rectangle.js') },
        { src: _u('compat/providers/wasm-engine.js') },
        { src: _u('compat/providers/wasm-load-browser.js') },
        { src: _u('compat/egpt-engine.js') },
        // ── lib/shim contract scripts — router-driven via _u('shim/...') ──────
        // These 7 entries were previously HARDCODED absolute '/lib/shim/...' literals
        // (correct on the dev /lib mount, but 404 on a dumb static host that has no
        // /lib mount). Now routed through the router's 'shim/' key: dev-core (no map)
        // → '/lib/shim/...' (byte-identical, via _u()'s shim fallback); dist/static
        // (projected DIST_PROFILE map) → the copied dist/ide/... tree (copyCommon()
        // copies lib/shim/ → dist/ide/). Same 'shim/' key graphics-render/_url() and
        // the artifact-showcase ESM entry consume — the one path authority (router.js).
        //
        // AstSchema: expression-AST node-kind vocabulary (lib/shim/expr/ast-schema.js).
        // Required by actionCompiler.js (inside the GAME layer) to compile CollisionActions
        // to op-programs. Loaded here (ENGINE phase) so it is available before LargeObject
        // construction.
        { src: _u('shim/expr/ast-schema.js') },
        // FrameDataSchema: the data-bubble + render-intent VALUE contract (lib/shim/frame-data).
        // The CANONICAL OWNER of RENDER_INTENT_KEYS/VALUES (architect ruling 2026-06-30) — publishes
        // window.FrameDataSchema. MUST load before RenderShape/providers/objects-schema, which now
        // FERRY the render.shape value set from it (no second source). Foundational cross-engine contract.
        { src: _u('shim/frame-data/index.js') },
        // PageParams: the URL-param routing-table contract (lib/shim/page-params) — WS
        // gym-controls-as-sugar Bite 3 item 0/2. Publishes window.PageParams. MUST load
        // before engine-boot.js/render-boot.js (injected right after this ENGINE array
        // resolves) and before fx-experiment.js (a data-page-scripts entry, loaded even
        // later) — all three live-import their URL-param KEY NAMES from
        // window.PageParams.KEYS instead of a bare string literal.
        { src: _u('shim/page-params/index.js') },
        // FieldDescriptorSchema: the shared field-SHAPE vocabulary contract
        // (lib/shim/field-descriptor — WS Studio Controls Realignment §7 r2 CEO
        // call C1). Publishes window.FieldDescriptorSchema. MUST load before
        // objects/schema/index.js (a GAME-layer file, loaded LATER) — that file's
        // own load-time drift assertion reads FieldDescriptorSchema.FIELD_TYPES
        // eval-time, at require()/script-execution. (p5/three-provider.js's
        // renderCapabilities() and three-provider.js's getCameraControl() — whose
        // `poseFields` are normalized field descriptors — also consume it, but only
        // LAZILY at call time, and the whole ENGINE array resolves before RENDERER,
        // so those impose no eval-time ordering constraint.)
        { src: _u('shim/field-descriptor/index.js') },
        // ControlsSchema + the runtime instance registry (lib/shim/controls) — WS
        // gym-controls-as-sugar Bite 1's control-descriptor contract, browser-wired here
        // as an explicit Bite-3 prerequisite. Publishes window.ControlsSchema then
        // window.ControlRegistry — ORDER MATTERS: registry.js's _getControlsSchema()
        // reads window.ControlsSchema, so index.js MUST precede it (mirrors the
        // Box-before-OvenBox constraint documented in game-layer-manifest.js).
        { src: _u('shim/controls/index.js') },
        { src: _u('shim/controls/registry.js') },
        // ShimRpc: the request/response call() primitive (lib/shim/rpc) — WS
        // gym-controls-as-sugar Bite 3 Stage 2 fix-loop (architect gate-5 charter:
        // "promote the reqId/pending/timeout request/response-call()-over-postMessage
        // pattern to a SHIM PRIMITIVE"). Publishes window.ShimRpc. Consumed by
        // page-context sugar (lib/frqtl/objects/objects/frqtl-controls-panel.js) via
        // a named FAIL-LOUD guard, never a relative ES import. No ordering dependency
        // on the other shim entries above; placed here to keep the block together.
        { src: _u('shim/rpc/index.js') },
        // HeatColormap: the ONE count→intensity heat ramp (lib/shim/render/heat-colormap.js).
        // Publishes window.HeatColormap. Consumed BELOW the shim by the GraphingDetectorWall
        // heat painter (a GAME-layer classic script, loaded later) through a named FAIL-LOUD
        // guard, and ABOVE it by lib/components/notebook-pane/realm-chart.js (side-effect
        // import + the same window read) — one ramp, so the in-scene wall heatmap and the DOM
        // topology chart can never drift apart on the same grid data. No ordering dependency
        // on the other shim entries.
        { src: _u('shim/render/heat-colormap.js') },
        // RenderStages: the ORDERED render-pipeline stage vocabulary + the tap-result bag
        // normalizer (lib/shim/render/render-stages.js). Publishes window.RenderStages.
        // The peer of frame-data's RENDER_INTENT_KEYS — the shim owns the cross-layer
        // vocabulary and consumers FERRY it. Consumed BELOW the shim by
        // objects/instruments/capture.js (the capture(stage) tap MECHANISM) and
        // objects/objects/FrqtlVision.js (the sugar), both GAME-layer classic scripts
        // loaded later, both through a named FAIL-LOUD guard at CALL time — so no
        // eval-time ordering dependency on the other shim entries.
        { src: _u('shim/render/render-stages.js') },
        // CaptureEnvelope: the TRANSPORT contract of a capture (lib/shim/render/capture-envelope.js).
        // Publishes window.CaptureEnvelope — the video shape FrqtlVision.record returns. Resolves
        // RenderStages at CALL time; no eval-time ordering dependency.
        { src: _u('shim/render/capture-envelope.js') },
        // SunLook: the ONE owner of the sun's render-option bag (lib/shim/render/sun-look.js).
        // Publishes globalThis.SunLook — read by the walkthrough registry (side-effect import) and
        // by a sketch borrowing the sun's god-rays (window.SunLook). No ordering dependency.
        { src: _u('shim/render/sun-look.js') },
        // RenderState: the renderState contract + its ONE apply procedure (lib/shim/render-state/
        // apply.js). Publishes globalThis.RenderState — called in the page by the blank page's door
        // FrqtlPage.applyRenderState (GYM, STUDIO, hosted eyes) and by the sdk bundle's bootRecipe;
        // read by lib/shim/render-state/index.js (side-effect import). No ordering dependency.
        { src: _u('shim/render-state/apply.js') }
    ]; }

    /* RENDERER — literal copy of lib/shim/engine/renderer-layer-manifest.js
       RENDERER_LAYER_SCRIPTS (same discipline as the GAME array below: stack-boot
       is a classic injected script and cannot import the ESM manifest). Parity is
       enforced by lib/shim/engine/test/renderer-layer-manifest.test.mjs.
       Do NOT edit here without updating the manifest (and vice versa). LAZY — see
       the _engineList() comment above; called only from inside the boot chain. */
    function _rendererList() { return [
        /* THE DISPLAY SLOT — the one "which provider owns the display" authority.
           Heads the phase: render-boot.js (next) is its one writer. */
        { src: _u('compat/renderer/display-slot.js') },
        { src: _u('objects/constants/LightColor.js') },
        { src: _u('compat/renderer/RenderShape.js') },   // shape authority — MUST load before providers
        { src: _u('compat/renderer/RenderMesh.js') },    // render.mesh resolver — before providers
        { src: _u('compat/renderer/RenderFamily.js') },  // per-frame render-family decode (composes Shape+Mesh) — AFTER both, before providers
        { src: _u('compat/renderer/FieldBuilder.js') },
        // renderer-provider-contract.js: the CODE OWNER of the RendererProvider
        // method lists (the required/optional split + validateRendererProvider).
        // A dependency, not a provider — it only installs its tables on window —
        // so it loads with the other shared owners, before both providers.
        { src: _u('compat/renderer/renderer-provider-contract.js') },
        // renderCapabilities-common.js: the shared universal-knob + filter-loop
        // owner (WS Studio Controls Realignment S5b DRY tidy) BOTH providers'
        // renderCapabilities() resolve via window.RenderCapabilitiesCommon at
        // CALL time — MUST load before providers, same precedent as RenderShape.js
        // immediately above (tester-found regression, S5b fix-loop: this entry
        // was missing entirely, so every page whose onReady synchronously calls
        // makeControlsForRenderSurface — every fx-family page — hit a FAIL-LOUD
        // "RenderCapabilitiesCommon is unreachable" the instant renderCapabilities()
        // was first invoked; the fail-loud overlay behavior itself is correct,
        // the wiring was the bug).
        { src: _u('compat/renderer/renderCapabilities-common.js') },
        // captureStill-common.js: the shared pixel-readback + still-bag owner for the
        // OPTIONAL captureStill() capability (the `composite` stage tap of the
        // RENDER_STAGES contract). BOTH providers resolve window.CaptureStillCommon
        // at CALL time — MUST load before providers, exactly like the entry above
        // (same class of load-order bug: a page that captures in onReady would hit a
        // FAIL-LOUD "CaptureStillCommon is unreachable" with the wiring, not the
        // fail-loud, being the bug).
        { src: _u('compat/renderer/captureStill-common.js') },
        // camera2d-geometry.js: THE 2D camera map (pan/zoom) — the affine2d projection's one
        // authority, consumed by p5-provider (draw transform, screenToWorld, the camera
        // handle) and by unprojectStill (the offline map). Must precede both consumers.
        { src: _u('compat/renderer/camera2d-geometry.js') },
        // orbit-bag.js: THE point-shape authority for the pose bag ({x,y,z} AND [x,y,z],
        // one identical throw under every provider). BOTH camera handles ferry every
        // point-valued field through it — must precede both providers.
        { src: _u('compat/renderer/orbit-bag.js') },
        // lo-drawn-center.js: THE LO drawn-center authority (where an LO rect's box is drawn).
        // three-provider places meshes through it and FrqtlApp aims its pick at it.
        { src: _u('compat/renderer/lo-drawn-center.js') },
        { src: _u('compat/renderer/providers/p5-provider.js') },
        // unprojectStill.js: THE pixel→universe mapping authority for a captured still
        // (RENDERER_CONTRACT §10.5). Ferries window.ThreeCameraGeometry lazily for the
        // perspective branch, so no eval-time ordering constraint — but it must follow
        // the geometry authority, and it keeps the one-mapping-authority block together.
        { src: _u('compat/renderer/unprojectStill.js') },
        // three-camera-contract.js: the three camera's DECLARATIVE contract (the
        // view-preset table + the pose-axis field descriptors getCameraControl()
        // publishes). three-provider.js resolves window.ThreeCameraContract
        // FAIL-LOUD while building the handle — MUST precede it.
        { src: _u('compat/renderer/providers/three-camera-contract.js') },
        // three-camera-geometry.js: the three camera's PURE GEOMETRY authority
        // (orbit bag ⇄ camera basis + the screen-relative rotate/translate
        // primitives + the picking-ray math). three-provider.js resolves
        // window.ThreeCameraGeometry FAIL-LOUD from _applyOrbit onward — MUST
        // precede it.
        { src: _u('compat/renderer/providers/three-camera-geometry.js') },
        // godrays-layer.js: the god-rays layer (source rule + march passes). three-provider.js
        // resolves window.GodraysLayer FAIL-LOUD — MUST precede it.
        { src: _u('compat/renderer/providers/godrays-layer.js') },
        { src: _u('compat/renderer/providers/three-provider.js') },
        { src: _u('compat/renderer/Filters.js') }
    ]; }

    /* GAME — literal copy of lib/shim/engine/game-layer-manifest.js GAME_LAYER_SCRIPTS.
       Parity is enforced by lib/shim/engine/test/game-layer-manifest.test.mjs.
       Do NOT edit here without updating the manifest (and vice versa). LAZY — see
       the _engineList() comment above; called only from inside the boot chain. */
    function _gameList() { return [
        { src: _u('objects/constants/CollisionTypes.js') },
        { src: _u('objects/constants/CollisionActions.js') },
        { src: _u('objects/constants/WallBehaviors.js') },
        { src: _u('objects/constants/Charge.js') },
        { src: _u('objects/geometry/Rectangle.js') },
        { src: _u('objects/geometry/SlabFace.js') },
        { src: _u('objects/objects/tagger.js') },
        { src: _u('objects/objects/actionCompiler.js') },
        { src: _u('objects/objects/absorbRadiation.js') },
        { src: _u('objects/objects/emitterProgram.js') },
        { src: _u('objects/objects/LargeObject.js') },
        { src: _u('objects/objects/Wall.js') },
        { src: _u('objects/objects/GraphingDetectorWall.js') },
        { src: _u('objects/objects/QuantumEmitter.js') },
        { src: _u('objects/objects/PointSource.js') },
        { src: _u('objects/objects/DetectorWall.js') },
        { src: _u('objects/objects/slitLinerScatter.js') },
        { src: _u('objects/objects/SlitScreen.js') },
        { src: _u('objects/objects/SlitLightSource.js') },
        { src: _u('objects/objects/EgptFractal.js') },
        { src: _u('objects/objects/Box.js') },
        { src: _u('objects/objects/Tunnel.js') },
        // Trace (THE WIRE PART) — composes Tunnel + Wall; both resolve at CALL time, so
        // roster position is not load-bearing (the load-order gate holds it to that).
        { src: _u('objects/objects/Trace.js') },
        // LogicGate (THE SWITCHING PART) — composes Tunnel + Wall + Trace + SphereEmitter;
        // all resolve at CALL time, so roster position is not load-bearing.
        { src: _u('objects/objects/LogicGate.js') },
        { src: _u('objects/objects/OvenBox.js') },
        { src: _u('objects/objects/CircuitGate.js') },
        { src: _u('objects/objects/CircuitProbe.js') },
        { src: _u('objects/objects/Tube.js') },
        { src: _u('objects/objects/sustainedSource.js') },
        { src: _u('objects/objects/directedRedirectProgram.js') },
        { src: _u('objects/objects/DirectedTunnel.js') },
        { src: _u('objects/objects/LightSource.js') },
        { src: _u('objects/objects/controlBind.js') },
        { src: _u('objects/objects/controlAction.js') },
        { src: _u('objects/objects/makeControlsForObject.js') },
        { src: _u('objects/objects/makeControlsForRenderSurface.js') },
        { src: _u('objects/objects/frqtl-control-slider.js') },
        { src: _u('objects/objects/frqtl-control-widgets.js') },
        { src: _u('objects/objects/frqtl-controls-panel.js') },
        { src: _u('objects/objects/frqtl-control-sync.js') },
        { src: _u('objects/objects/frqtl-control-overlay.js') },
        { src: _u('objects/objects/frqtl-control-write-queue.js') },
        { src: _u('objects/objects/CameraControls.js') },
        { src: _u('objects/objects/FrqtlVision.js') },
        { src: _u('objects/objects/CameraPath.js') },
        /* The schema trio — owner before consumer: ObjectSchema.worldRect is the rect
           contract _setupOptions.requireWorldRect and every objects/setup/ factory consume.
           schema/index.js FAILS LOUD without its two siblings, so they load just before it. */
        { src: _u('objects/schema/valueNormalizer.js') },
        { src: _u('objects/schema/engine-scopes.js') },
        { src: _u('objects/schema/index.js') },
        { src: _u('objects/setup/_setupOptions.js') },
        { src: _u('objects/setup/_worldInit.js') },
        { src: _u('objects/setup/_collisionMatrixLanes.js') },
        { src: _u('objects/setup/setupSphereEmitter3D.js') },
        { src: _u('objects/objects/SphereEmitter.js') },
        { src: _u('objects/setup/setupTunnelPointExit.js') },
        { src: _u('objects/setup/setupTraceCircuit.js') },
        { src: _u('objects/ObjectFactory.js') },
        /* instruments/capture.js — the render-pipeline TAP MECHANISM (THE_MINIMAL_SIM §4).
           Publishes window.FrqtlCapture; FrqtlApp constructs it and forwards
           capture/captureStill/sceneRecord/setSourceRef to it. */
        { src: _u('objects/instruments/capture.js') },
        { src: _u('objects/FrqtlApp.js') },
        { src: _u('objects/RecipeContext.js') }
    ]; }

    /* ── Boot failure text — derived from the phase that failed ───────────
       Each phase's list is a literal copy of the manifest named here, so a failed
       load names the manifest ENTRY the host did not serve and that entry's owner.
       No phase of this sequence loads the WASM module (engine-boot.js does, and paints
       its own ENGINE banner with the build remedy), so no text here offers one. */
    var _MANIFEST_OF = {
        GAME: 'GAME_LAYER_SCRIPTS (lib/shim/engine/game-layer-manifest.js)',
        RENDERER: 'RENDERER_LAYER_SCRIPTS (lib/shim/engine/renderer-layer-manifest.js)',
        SHIM: 'ENGINE_SHIM_CONTRACT_SCRIPTS (lib/shim/engine/shim-contract-manifest.js)'
    };
    /* The deferred p5 load _egptStartSketch performs — a RENDERER-axis script this loader
       injects outside the three phase lists. */
    var _P5_ENTRY = 'assets/vendor/p5.min.js';
    var _BOOT_SCRIPT_PHASE = {
        'experiments/_shared/engine-boot.js': 'ENGINE',
        'experiments/_shared/render-boot.js': 'RENDERER',
        'shim/engine/script-sequencer.js': 'ENGINE'
    };

    function _listed(list, src) {
        for (var i = 0; i < list.length; i++) { if (list[i].src === src) { return list[i]; } }
        return null;
    }

    function _bootFailureMessage(err) {
        var detail = '[stack-boot] ' + String(err && err.message ? err.message : err)
            .replace(/^\[stack-boot\]\s*/, '');
        var src = err && err.src;
        var entry = src ? _entryOf[src] : null;
        var phase = null, owner = null;
        var page = src ? _listed(_pageScripts, src) : null;
        // Recomputing a list here (_engineList() etc.) is safe and cheap: `src` is only
        // truthy for a script that already resolved successfully once (the map is
        // proven present/complete by that point), so re-calling the builder can never
        // re-throw the map-missing error these lists exist to surface — it just re-runs
        // the same _u() lookups against the same, already-set window._egptEnginePathMap.
        if (src && _listed(_engineList(), src)) {
            phase = 'ENGINE';
            // No absolute-URL literal here: the resolved `src` (printed by the message
            // template below) already names where the host actually tried to fetch it —
            // hardcoding a dev-only '/lib/shim/...' guess here would be the SAME
            // duplicated-path-authority bug this ENGINE list's own router-driven _u()
            // resolution was fixed to stop making (ws-stackboot-dev-map).
            owner = entry.indexOf('shim/') === 0
                ? '`' + entry + '`, its ' + _MANIFEST_OF.SHIM + ' entry'
                : '`' + entry + '`, an entry of stack-boot.js\'s own ENGINE list ' +
                  '(lib/frqtl/experiments/_shared/stack-boot.js)';
        } else if (src && _listed(_rendererList(), src)) {
            phase = 'RENDERER';
            owner = '`' + entry + '`, its ' + _MANIFEST_OF.RENDERER + ' entry';
        } else if (src && _listed(_gameList(), src)) {
            phase = 'GAME';
            owner = '`' + entry + '`, its ' + _MANIFEST_OF.GAME + ' entry';
        } else if (page) {
            phase = 'PAGE';
            owner = '`' + page.entry + '`, its data-page-scripts entry on this experiment page';
        } else if (entry === _P5_ENTRY) {
            phase = 'RENDERER';
            owner = '`' + entry + '`, the deferred p5 load window._egptStartSketch() performs ' +
                '(lib/frqtl/experiments/_shared/stack-boot.js)';
        } else if (entry && _BOOT_SCRIPT_PHASE[entry]) {
            phase = _BOOT_SCRIPT_PHASE[entry];
            owner = '`' + entry + '`, the ' + phase + ' phase\'s boot script in stack-boot.js';
        }
        if (!phase) {
            return 'STACK BOOT FAILED\n\n' + detail + '\n\n' +
                'The failure is not a script load, so no manifest entry owns it; the ' +
                'boot sequence stopped here and nothing after it ran.';
        }
        return 'STACK BOOT FAILED — ' + phase + ' phase\n\n' + detail + '\n\n' +
            'The host did not serve ' + owner + '.\n' +
            'Each phase is fetched in parallel; the boot stops at the phase that failed and no later phase was requested.\n\n' +
            'Remedy: make the host serve ' + src + ' — the file is missing from this tree,\n' +
            'or a built host\'s build did not copy it.';
    }

    /* The boot-failure painter — console + overlay, one text owner (_bootFailureMessage). */
    function _paintBootFailure(err) {
        var msg = _bootFailureMessage(err);
        if (window.console && console.error) { console.error(msg); }
        /* The ONE boot-failure painter (engine-boot.js) when it is installed — it is
           not when the ENGINE phase itself failed, since engine-boot.js loads last in
           that phase. stack-boot writes its OWN phase-labeled text: engine-boot's
           failLoud is the ENGINE banner and carries the WASM build remedy, which is the
           wrong remedy for a script the host did not serve. */
        if (typeof window._egptPaintFailOverlay === 'function') {
            window._egptPaintFailOverlay({
                msg: msg,
                fullViewportId: 'egpt-engine-error',
                scopedMarkerAttr: 'data-egpt-engine-error'
            });
        } else if (!document.getElementById('egpt-engine-error')) {
            var b = document.createElement('div');
            b.id = 'egpt-engine-error';
            b.setAttribute('data-egpt-boot-error', '1');
            b.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a0000;' +
                'color:#ff6b6b;font:13px/1.55 ui-monospace,monospace;padding:22px;' +
                'white-space:pre-wrap;overflow:auto;border:2px solid #b6161c;';
            b.textContent = msg;
            (document.body || document.documentElement).appendChild(b);
        }
    }

    /* Default renderer unless already set by page or build */
    if (!window._egptDefaultRenderer) { window._egptDefaultRenderer = 'p5'; }

    /* ── The boot: phases in order, each phase fetched in parallel ──────────
       R2 (ws-stackboot-dev-map SEAM RULING): every list is built INSIDE the chain, never as a
       top-level `var`. A missing/incomplete map makes _u() throw while a list is built — that
       throw REJECTS this .then() instead of throwing at script-parse time (before any .catch
       existed to see it). All lists are built in the FIRST link so every phase's total is
       known before the first script loads. */
    var _lists = null;
    var _engineLive = null;
    var _throughGameLayer = _bootstrapSequencer()
        .then(function (sq) {
            _lists = {
                engine: _engineList().concat([{ src: _u('experiments/_shared/engine-boot.js') }]),
                renderer: _rendererList().concat([{ src: _u('experiments/_shared/render-boot.js') }]),
                game: _gameList()
            };
            _record = sq.createBootRecord(document, _BOOT_PHASE_IDS);
            _record.begin('engine-scripts', sq.page.scriptCount(_lists.engine));
            _record.begin('engine-ready', 1);
            _record.begin('renderer', sq.page.scriptCount(_lists.renderer));
            _record.begin('game', sq.page.scriptCount(_lists.game));
            _record.begin('page', sq.page.scriptCount(_pageScripts));
            _record.begin('sketch', 1);
            /* engine-ready (0/1) settles on WASM's own clock: registered here through the
               early shim (drained into the real implementation after engine-boot.js). The GAME
               phase waits for it (_engineLive, below). */
            _engineLive = new Promise(function (res, rej) {
                window._egptWhenEngineReady(
                    function () { _record.complete('engine-ready'); res(); },
                    function (err) {
                        _record.fail('engine-ready');
                        /* engine-boot.js painted this failure with its own remedy; the stack's
                           catch must not paint over it. */
                        var e = (err instanceof Error) ? err : new Error(String(err));
                        e.egptEngineAxis = true;
                        rej(e);
                    }
                );
            });
            _engineLive.catch(function () {});
        }, _failIn('engine-scripts'))
        /* ENGINE then engine-boot.js: one parallel phase. Execution order is list order, so
           engine-boot.js still runs after every ENGINE script. */
        .then(function () { return _seqPhase(_lists.engine, 'engine-scripts'); })
        .then(function () { _record.complete('engine-scripts'); }, _failIn('engine-scripts'))
        .then(function () {
            /* Drain the early-shim engine queue into the real _egptWhenEngineReady.
               engine-boot.js has now run and installed the real function. Each
               queued entry is a { onReady, onError } pair (fix-loop #6 Finding A) —
               forward BOTH so a caller that registered an error callback while the
               shim was still active (the common case: this ALWAYS runs before
               engine-boot.js loads) still gets it wired to the real promise.      */
            /* Only into the REAL implementation: draining into the shim itself (engine-boot.js
               loaded but installed nothing) would re-queue each entry onto the array being
               drained — an unbounded loop. The queue then stays for the failure path below. */
            var q = window._egptStackBootEngineQueue;
            /* Even an EMPTY queue sets the forward: a caller holding the shim may call it
               only later (GraphicsPane.boot() waits on the renderer inside its engine
               callback), and that late call must reach the real implementation. */
            if (q && typeof window._egptWhenEngineReady === 'function' &&
                window._egptWhenEngineReady !== _engineShim) {
                var fn = _engineTarget = window._egptWhenEngineReady;
                for (var i = 0; i < q.length; i++) { fn(q[i].onReady, q[i].onError); }
                window._egptStackBootEngineQueue = null;
            }
        })
        .then(function () { return _seqPhase(_lists.renderer, 'renderer'); })
        .then(function () { _record.complete('renderer'); }, _failIn('renderer'))
        .then(function () {
            /* Drain the renderer queue into the real _egptWhenRendererReady
               (fix-loop #6 Finding A — same { onReady, onError } pair forwarding
               as the engine drain above). */
            var q = window._egptStackBootRendererQueue;
            /* Even an EMPTY queue sets the forward: a caller holding the shim may call it
               only later (GraphicsPane.boot() waits on the renderer inside its engine
               callback), and that late call must reach the real implementation. */
            if (q && typeof window._egptWhenRendererReady === 'function' &&
                window._egptWhenRendererReady !== _rendererShim) {
                var fn = _rendererTarget = window._egptWhenRendererReady;
                for (var i = 0; i < q.length; i++) { fn(q[i].onReady, q[i].onError); }
                window._egptStackBootRendererQueue = null;
            }
        })
        /* GAME waits for the ENGINE. Game-layer scripts bind engine globals at LOAD time
           (EgptFractal.js captures window.Frame/Charge in its IIFE), and
           engine-boot.js installs placeholders that the WASM instantiation replaces. The serial
           chain always finished WASM first; a parallel one from a warm cache does not. The
           RENDERER phase above still overlaps the WASM load. */
        .then(function () { return _engineLive; })
        .then(function () { return _seqPhase(_lists.game, 'game'); })
        .then(function () { _record.complete('game'); }, _failIn('game'));

    /* ── THE STACK-READY CONTRACT (FRAQTL #73, #74) ──────────────────────────
       window._egptStackReadyPromise settles when this loader's LAST phase has loaded —
       ENGINE, RENDERER, the whole GAME roster, then every data-page-scripts entry, in
       order — and REJECTS with the boot error if the sequence stopped. This loader is the
       only thing that knows when the stack is complete, so it publishes that one fact
       rather than leaving each consumer to guess a sentinel global: a page sketch reads its
       own page-script globals (a setup factory, ExperimentMetrics), which load AFTER the
       GAME phase, and a programmatic host (engine-stack-boot.js, GraphicsPane.boot) reads
       game-layer globals such as window.RecipeContext, the roster's final entry.

       It says nothing about WASM: engine-ready (`_egptWhenEngineReady`) settles on its own
       clock, so a consumer composes both — `_egptStartSketch` below is that composition
       for a page.

       `.catch` here marks the promise HANDLED so a page that never consumes it produces
       no unhandled-rejection noise; the rejection still reaches any consumer's own
       .then/.catch (the same idiom engine-boot.js uses for window._wasmReadyPromise). */
    var _stackReady = _throughGameLayer
        /* Page-specific scripts (data-page-scripts attr) after the game layer. */
        .then(function () { return _seqPhase(_pageScripts, 'page'); })
        .then(function () { _record.complete('page'); }, function (err) {
            /* A failure that already named its phase keeps it; a page-script failure is 'page'. */
            if (_record && !_record.snapshot().failed) { _record.fail('page'); }
            throw err;
        });
    window._egptStackReadyPromise = _stackReady;
    _stackReady.catch(function () {});

    /* The game-layer promise is DELETED: it settled before the page scripts, which is the
       #74 race. Any reader or publisher of the old name fails loud naming the replacement. */
    function _deletedGameLayerPromise() {
        throw new Error('[stack-boot] window._egptGameLayerReadyPromise is deleted — it settled ' +
            'before the page scripts loaded (FRAQTL #74). Await window._egptStackReadyPromise, ' +
            'which settles after the LAST phase, or call window._egptStartSketch() on a page.');
    }
    Object.defineProperty(window, '_egptGameLayerReadyPromise', {
        configurable: true,
        get: _deletedGameLayerPromise,
        set: _deletedGameLayerPromise
    });

    /* ── THE ONE PAGE BOOT DANCE ────────────────────────────────────────────
       window._egptStartSketch(opts) — engine ready → renderer ready → stack complete →
       then EITHER inject p5 (whose load calls window.setup) OR call window.setup()
       directly (the three.js path: vendored and already live, nothing else will call it).

         opts.p5 === 'always'   inject p5 whatever the resolved renderer (a page whose
                                sketch is p5-driven on every renderer)
         default                inject p5 only when the resolved renderer is 'p5'
         opts.sketch === 'deferred'
                                the page's setup() does NOT complete the `sketch` boot phase:
                                the page builds its scene LATER (the empty page: a host applies
                                one) and calls window._egptCompleteSketch() after that scene's
                                exp.build, or window._egptFailSketch(err) when it throws
         default                the `sketch` phase completes when setup() has run

       Failures: engine/renderer/stack failures are already painted by their owners
       (engine-boot.js, render-boot.js, this loader's catch below), so this dance only
       stops. A p5 load failure is painted here through the same boot-failure painter. A
       throw inside window.setup() is NOT caught — it surfaces as the page's own error. */
    var _sketchDeferred = false;
    window._egptStartSketch = function (opts) {
        var alwaysP5 = !!(opts && opts.p5 === 'always');
        if (opts && opts.sketch !== undefined && opts.sketch !== 'deferred') {
            throw new Error('[stack-boot] _egptStartSketch: unknown sketch mode ' + JSON.stringify(opts.sketch) +
                " — the one mode is { sketch: 'deferred' }. (FAIL-LOUD.)");
        }
        _sketchDeferred = !!(opts && opts.sketch === 'deferred');
        window._egptWhenEngineReady(function () {
            window._egptWhenRendererReady(function () {
                _stackReady.then(function () {
                    var r = window._egptRenderer || 'p5';
                    var onP5 = alwaysP5 || r === 'p5';
                    if (!onP5 && typeof window.setup !== 'function') {
                        throw new Error('[stack-boot] _egptStartSketch: the page defines no ' +
                            'window.setup() to run on the ' + r + ' renderer. (FAIL-LOUD.)');
                    }
                    /* The sketch phase (0/1) completes when setup() has RUN — wrapped here,
                       so p5 (which calls window.setup on load) and the direct call below
                       both pass through it. A throw inside setup() records nothing. */
                    var pageSetup = window.setup;
                    if (typeof pageSetup === 'function') {
                        window.setup = function () {
                            var out = pageSetup.apply(this, arguments);
                            if (!_sketchDeferred) { _record.complete('sketch'); }
                            return out;
                        };
                    }
                    if (onP5) {
                        _seqPhase([{ src: _u(_P5_ENTRY) }], null).catch(function (err) {
                            _record.fail('sketch');
                            _paintBootFailure(err);
                        });
                        return;
                    }
                    window.setup();
                }, function () { /* painted by this loader's boot-failure catch */ });
            });
        });
    };

    /* The DEFERRED sketch's two ends (`_egptStartSketch({ sketch: 'deferred' })`): the page calls
       one of these once its scene's exp.build has run. Calling either on a page that did not
       defer is a second, conflicting owner of the phase — it throws. */
    function _requireDeferred(name) {
        if (!_sketchDeferred) {
            throw new Error('[stack-boot] ' + name + ': this page did not defer its sketch — only a page that ' +
                "boots with _egptStartSketch({ sketch: 'deferred' }) completes the sketch phase itself. (FAIL-LOUD.)");
        }
    }
    window._egptCompleteSketch = function () {
        _requireDeferred('_egptCompleteSketch');
        _record.complete('sketch');
    };
    window._egptFailSketch = function (err) {
        _requireDeferred('_egptFailSketch');
        _record.fail('sketch', err);
    };

    _stackReady
        .catch(function (err) {
            if (!(err && err.egptEngineAxis)) { _paintBootFailure(err); }
            /* R2 (ws-stackboot-dev-map SEAM RULING): REJECT the early-shim queues too —
               painting the overlay is not enough. A caller that already registered via
               the QUEUE-BASED shim (window._egptWhenEngineReady/_egptWhenRendererReady,
               installed above BEFORE engine-boot.js/render-boot.js can replace them) is
               left with a promise that never settles unless its onError fires here — this
               is exactly why a notebook canvas cell used to HANG at "running"/"Booting
               engine…" forever instead of flipping to an error badge: the overlay painted
               (console-loud) but nothing ever told the waiting caller. Only the phase(s)
               that never got as far as installing their REAL implementation still have a
               non-null queue here (a phase that succeeded already nulled its own queue in
               the .then() above) — drain exactly those, then replace the shim itself so a
               caller that calls IN AFTER this failure is told immediately too, rather than
               queuing into an array nothing will ever drain again. */
            var eq = window._egptStackBootEngineQueue;
            if (eq) {
                for (var ei = 0; ei < eq.length; ei++) {
                    if (typeof eq[ei].onError === 'function') { eq[ei].onError(err); }
                }
                window._egptStackBootEngineQueue = null;
                _engineTarget = window._egptWhenEngineReady = function (onReady, onError) {
                    if (typeof onError === 'function') { onError(err); }
                };
            }
            var rq = window._egptStackBootRendererQueue;
            if (rq) {
                for (var ri = 0; ri < rq.length; ri++) {
                    if (typeof rq[ri].onError === 'function') { rq[ri].onError(err); }
                }
                window._egptStackBootRendererQueue = null;
                _rendererTarget = window._egptWhenRendererReady = function (onReady, onError) {
                    if (typeof onError === 'function') { onError(err); }
                };
            }
        });

})();
