/* Copyright 2023-2026 by Essam Abadir */

/**
 * engine-boot.js — canonical engine selection + FAIL-LOUD WASM boot.
 *
 * Shared by every canonical per-experiment page (frqtl/experiments/{id}/index.html)
 * AND by the built pub dist. It is the single place that boots the physics engine.
 *
 * FRQTL physics is WASM-only — the compiled Rust engine (frqtl/crates/egpt_wasm →
 * fat/pkg-web). An explicit ?engine=js FAILS LOUD (the JS reference engine is archived
 * as a frozen historical fixture, not a runtime backend).
 *
 * THE INVARIANT: a page NEVER silently boots a different engine than requested. If WASM
 * cannot load, the page FAILS LOUD — renders an unmissable overlay and leaves
 * window._wasmReadyPromise REJECTED so the deferred p5 boot never runs setup() against
 * a broken engine.
 *
 * Load order on the page (this script runs AFTER the engine + compat scripts):
 *   1. objects/geometry/Rectangle.js       (window.Rectangle — the sole rect authority)
 *   2. compat/providers/wasm-engine.js     (window._WasmEngineProvider)
 *   3. compat/providers/wasm-load-browser.js
 *   4. compat/egpt-engine.js               (window.EGPTEngine)
 *   5. THIS FILE
 *
 * FrqtlApp constructs via window.EGPTUniverse, which this module sets to the
 * WASM wrapper.
 *
 * window._egptWhenEngineReady(onReady, onError) resolves only when WASM is actually live,
 * and fails loud otherwise. A page never calls it directly: window._egptStartSketch()
 * (stack-boot.js) composes it with renderer-ready and the stack-ready promise.
 */
(function () {
    'use strict';

    // PageParams contract (WS gym-controls-as-sugar Bite 3 item 0/2): the URL param
    // KEY NAME this file reads (`engine`) is single-sourced from
    // lib/shim/page-params/index.js, live-imported via window.PageParams (installed
    // early in stack-boot.js's ENGINE array — guaranteed present before engine-boot.js
    // is injected, which happens strictly after the ENGINE array resolves). Mirrors
    // actionCompiler.js's/OvenBox.js's _getAstSchema() guard: a named FAIL-LOUD error
    // (not a raw TypeError) if the contract script is missing. `engine` is
    // forward:false in the contract (never forwarded host->iframe) but its KEY NAME
    // is still live-imported here — load order allows it (verified: page-params
    // loads within the SAME ENGINE array this file is injected strictly AFTER).
    function _getPageParams() {
        if (typeof window !== 'undefined' && window.PageParams) { return window.PageParams; }
        throw new Error(
            '[engine-boot] PageParams not available. ' +
            'Ensure lib/shim/page-params/index.js is loaded before engine-boot.js ' +
            '(stack-boot.js\'s ENGINE array).'
        );
    }

    var params = new URLSearchParams(window.location.search);
    // ?engine= wins; else a page/build-injected default; else 'wasm' (the only FRQTL
    // physics engine). An explicit ?engine=js FAILS LOUD below (archived).
    var engine = params.get(_getPageParams().KEYS.ENGINE) || window._egptDefaultEngine || 'wasm';
    window._egptEngine = engine;

    // ── window._egptPaintFailOverlay — THE ONE host-aware boot-failure overlay
    // painter (WS gym-controls-as-sugar fix-loop #7) ───────────────────────────
    //
    // Lives here (not render-boot.js) because engine-boot.js loads FIRST in
    // stack-boot.js's canonical sequence (ENGINE phase, before RENDERER) — it is
    // GUARANTEED installed before any engine- or renderer-axis failure can occur.
    // Both engine-boot.js's OWN `failLoud` (below) and render-boot.js's `failLoud`
    // build their OWN axis-labeled message text ("ENGINE BOOT FAILED" vs
    // "RENDERER BOOT FAILED" — TRUTH-IN-LABELING) and delegate ALL DOM placement
    // to this ONE function — as does stack-boot.js's phase-labeled "STACK BOOT FAILED"
    // for a script the host did not serve — none re-implements paintScoped/paintFullViewport
    // (fix-loop #6's tester finding: a second, non-host-aware overlay
    // implementation — engine-boot.js's own — was exactly the CASE4 regression).
    //
    // Host-aware exactly like fix-loop #5's render-boot.js mechanism:
    // `window._egptRendererOverlayHost` (set by `bootFrqtlRealm` to the failing
    // cell's own mount element — the name is a fix-loop-#5 historical artifact;
    // the mechanism generalizes cleanly to ANY boot-failure axis, not only the
    // renderer) → paint IN-CELL; absent (a standalone experiment page IS the
    // experiment) → paint full-viewport, UNCHANGED pre-existing behavior.
    //
    // `fullViewportId`/`scopedMarkerAttr`/`bg`/`fg`/`border` are caller-supplied so
    // EACH axis keeps its OWN pre-existing, externally-consumed marker AND its OWN
    // pre-existing color scheme (Playwright specs check `#egpt-engine-error`/
    // `#egpt-renderer-error` by exact id; `pane-host.css` styles `#egpt-engine-error`;
    // `three-provider.js`/`FrqtlApp.js` also reference `#egpt-renderer-error`;
    // render-boot.js's overlay has always been blue (`#000a1a`/`#6b9eff`) vs
    // engine-boot.js's red (`#1a0000`/`#ff6b6b`) — none of these are renamed or
    // re-colored by this fix-loop). Every painted box ALSO carries the axis-neutral
    // `data-egpt-boot-error="1"` marker — the ONE thing a host-aware CONSUMER (the
    // notebook realm's error-recovery render, see notebook-pane/index.js) needs to
    // check for, regardless of which axis actually failed.
    function paintFailOverlay(opts) {
        var msg = opts.msg;
        var fullViewportId = opts.fullViewportId;
        var scopedMarkerAttr = opts.scopedMarkerAttr;
        var bg = opts.bg || '#1a0000';
        var fg = opts.fg || '#ff6b6b';
        var border = opts.border || '#b6161c';
        var overlayHost = window._egptRendererOverlayHost;

        function paintScoped(hostEl) {
            if (hostEl.querySelector && hostEl.querySelector('[' + scopedMarkerAttr + ']')) return;
            var b = document.createElement('div');
            b.setAttribute(scopedMarkerAttr, '1');
            b.setAttribute('data-egpt-boot-error', '1');
            b.style.cssText =
                'position:absolute;inset:0;z-index:9998;background:' + bg + ';color:' + fg + ';' +
                'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:14px;' +
                'white-space:pre-wrap;overflow:auto;border:2px solid ' + border + ';';
            b.textContent = msg;
            // position:absolute needs an anchor — force it if the host is static
            // (a plain mount div usually is), so the overlay never escapes into
            // surrounding notebook chrome.
            if (hostEl.style) {
                var cs = window.getComputedStyle ? window.getComputedStyle(hostEl) : null;
                if (!cs || cs.position === 'static') hostEl.style.position = 'relative';
            }
            hostEl.appendChild(b);
        }

        function paintFullViewport() {
            if (document.getElementById(fullViewportId)) return;
            var b = document.createElement('div');
            b.id = fullViewportId;
            b.setAttribute('data-egpt-boot-error', '1');
            b.style.cssText =
                'position:fixed;inset:0;z-index:99999;background:' + bg + ';color:' + fg + ';' +
                'font:13px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:22px;' +
                'white-space:pre-wrap;overflow:auto;border:2px solid ' + border + ';';
            b.textContent = msg;
            (document.body || document.documentElement).appendChild(b);
        }

        function paint() {
            try {
                if (overlayHost) paintScoped(overlayHost);
                else paintFullViewport();
            } catch (e) { /* nothing more we can do */ }
        }
        if (document.body) paint();
        else window.addEventListener('DOMContentLoaded', paint);
    }
    window._egptPaintFailOverlay = paintFailOverlay;

    function failLoud(detail) {
        var msg =
            'ENGINE BOOT FAILED — engine=' + engine + '\n\n' +
            detail + '\n\n' +
            'This pane is intentionally blank. The requested engine is unavailable and the\n' +
            'page did NOT fall back to a different engine (that would make a JS↔WASM\n' +
            'comparison meaningless).\n\n' +
            'To build the canonical Rust/WASM engine:\n' +
            '  cd frqtl && wasm-pack build crates/egpt_wasm --target web --out-dir ../fat/pkg-web';
        paintFailOverlay({
            msg: msg,
            fullViewportId: 'egpt-engine-error',
            scopedMarkerAttr: 'data-egpt-engine-error'
            // bg/fg/border omitted — defaults are engine-boot's own pre-existing
            // red scheme (see paintFailOverlay's defaults above), unchanged.
        });
        if (window.console && console.error) console.error('[engine-boot] ' + detail);
    }
    window._egptFailLoud = failLoud;

    function reject(detail) {
        failLoud(detail);
        window._wasmReadyPromise = Promise.reject(new Error(detail));
        window._wasmReadyPromise.catch(function () {});
    }

    if (engine !== 'wasm') {
        // FRQTL physics is WASM-only. The JS reference engine is archived as a frozen
        // historical fixture (internal/archive/frqtl-js-reference/), not a runtime backend.
        reject('JS reference engine archived — FRQTL is WASM-only. Remove ?engine=js ' +
            '(requested engine="' + engine + '"); the only FRQTL physics engine is ' +
            'the compiled Rust/WASM engine.');
    } else if (!window._WasmEngineProvider || !window.EGPTEngine) {
        reject('WASM compat layer missing (window._WasmEngineProvider / window.EGPTEngine not installed).');
    } else {
        // Install the WASM wrapper's window.EGPTUniverse (dummy ctor until the real
        // module loads). FrqtlApp constructs via window.EGPTUniverse.
        var pre = window._WasmEngineProvider.makeProvider(function DummyWasm() {});
        window.EGPTUniverse = pre.EGPTUniverse;
        window.Charge = pre.Charge;
        // window.LightColor is owned by objects/constants/LightColor.js — do NOT overwrite.
        window.TickData = pre.TickData;
        window.FrameData = pre.FrameData;
        // create() sets window._wasmReadyPromise (rejects on load failure); surface loudly.
        window.EGPTEngine.create({ backend: 'wasm' }).catch(function (err) {
            failLoud('WASM module failed to load: ' + (err && (err.message || err)));
        });
    }

    // (onReady, onError) — WS gym-controls-as-sugar fix-loop #6 Finding A companion
    // hardening. `onError` is OPTIONAL and NEW, symmetric with render-boot.js's own
    // `_egptWhenRendererReady` upgrade: a genuine engine-boot failure ALWAYS paints
    // the visible failLoud overlay (unchanged), and now ALSO invokes `onError` (when
    // a caller supplies one) so a programmatic caller (GraphicsPane.boot()) can
    // reject its own promise deterministically rather than depending on `onReady`
    // ever firing. Existing single-argument callers are unaffected — `onError` is
    // simply `undefined` and this guard never invokes it.
    window._egptWhenEngineReady = function (onReady, onError) {
        (window._wasmReadyPromise || Promise.resolve())
            .then(function () { onReady(); })
            .catch(function (err) {
                if (!document.getElementById('egpt-engine-error')) {
                    failLoud('engine not ready: ' + (err && (err.message || err)));
                }
                if (typeof onError === 'function') { onError(err); }
            });
    };
})();
