/* Copyright 2023-2026 by Essam Abadir */

/**
 * wasm-load-browser.js — Browser env shim for the WASM engine.
 *
 * Dynamically import()s the wasm-pack --target web glue at fat/pkg-web/egpt_wasm.js,
 * honoring window._egptWasmPkgUrl override and the multi-path URL probe fallback.
 *
 * Returns the resolved WasmUniverse constructor so wasm-engine.js can remain
 * env-agnostic.
 *
 * Sets window._wasmReadyPromise for the deferred-p5 contract (the pub
 * build shim awaits this before calling setup()).
 *
 * Classic-script-safe IIFE — no top-level await, no ES module syntax.
 * The only import() is the dynamic fetch of the wasm-pack --target web bundle.
 *
 * Path resolution note:
 *   This file lives at frqtl/compat/providers/wasm-load-browser.js.
 *   When loaded as a <script> tag in the browser, relative URL resolution is
 *   against the PAGE URL, not this file's location.  The probe list therefore
 *   uses new URL('..', window.location.href) to anchor relative to the page
 *   and reach fat/pkg-web.
 *
 * Artifact-safe init (ws-artifact-showcase Bite A5):
 *   We NEVER call the wasm-pack glue's `default()`/`__wbg_init()` bare (no
 *   args) — bare, it builds its own `new URL('egpt_wasm_bg.wasm', import.meta.url)`
 *   and does `fetch(urlObject)` internally, which throws `DataCloneError`
 *   inside a claude.ai Artifact iframe (its `window.fetch` is proxied to the
 *   parent via `postMessage`, and a URL object is not structured-clonable).
 *   Instead we self-fetch the .wasm bytes with a plain STRING url (strings
 *   clone fine) and hand the glue raw bytes — see the inline comment at the
 *   `wasmModule.default(...)` call site for the full trace. Regression test:
 *   wasm-load-browser.test.mjs.
 *
 * Package content identity:
 *   The self-fetched bytes ARE the executing binary, so this is where its identity is
 *   taken: `loadedWasmSha256()` is the sha256 hex of the `.wasm` instantiated — the same
 *   definition `published/<id>/PINNED.json` records as `engine.wasmSha256`. The capture
 *   instrument pins it as `build.wasmSha256`; the serving URL is never identity (the same
 *   bytes from two origins regenerate one scene). Gate: scene-identity-origin.test.mjs.
 */
(function () {
    'use strict';

    /** sha256 hex of the last binary this loader instantiated; null before any load. */
    var _loadedWasmSha256 = null;

    /**
     * sha256 hex of `bytes` via `crypto.subtle`, or null where the page has none (a
     * non-secure origin). Null there cannot mint a false identity: `RenderStages.sceneHash`
     * refuses to hash without the same `crypto.subtle`, so no scene id exists in that page.
     */
    async function _sha256Hex(bytes) {
        var subtle = (typeof globalThis !== 'undefined' && globalThis.crypto)
            ? globalThis.crypto.subtle : null;
        if (!subtle || typeof subtle.digest !== 'function') { return null; }
        var view = new Uint8Array(await subtle.digest('SHA-256', bytes));
        var hex = '';
        for (var i = 0; i < view.length; i++) {
            hex += (view[i] < 16 ? '0' : '') + view[i].toString(16);
        }
        return hex;
    }

    /** @returns {string|null} sha256 hex of the instantiated `.wasm`, or null. */
    function loadedWasmSha256() {
        return _loadedWasmSha256;
    }

    /**
     * Load the WASM web bundle and return the WasmUniverse constructor.
     *
     * @param {string} [wasmPkgUrl] - Optional explicit URL (overrides window._egptWasmPkgUrl).
     * @returns {Promise<{WasmUniverse: Function}>}
     */
    async function load(wasmPkgUrl) {
        // Resolve URL to try.  Priority:
        //   1. Explicit arg (programmatic override, e.g. from EGPTEngine.create({wasmPkgUrl}))
        //   2. window._egptWasmPkgUrl (page-level override — how the pub SDK sets the path)
        //   3. Probe list relative to the current page URL (dev-tree paths + legacy fallbacks)
        var pkgPaths;
        if (wasmPkgUrl) {
            pkgPaths = [wasmPkgUrl];
        } else if (window._egptWasmPkgUrl) {
            pkgPaths = [window._egptWasmPkgUrl];
        } else {
            // Anchored to one level up from window.location.href so that pages
            // served from anywhere under the repo (sim/index.html, experiments, etc.)
            // all resolve the same fat/pkg-web path.
            // Probe one and two levels up: a page at <root>/sim/ resolves
            // fat/pkg-web one level up, while <root>/frqtl/sim/ (repo-root
            // serving) needs two. Tried in order; the first that imports wins.
            var up1 = new URL('..', window.location.href).href;
            var up2 = new URL('../..', window.location.href).href;
            pkgPaths = [
                up1 + 'fat/pkg-web/egpt_wasm.js',
                up2 + 'fat/pkg-web/egpt_wasm.js',
                up1 + 'fat/pkg/egpt_wasm.js',
                up2 + 'fat/pkg/egpt_wasm.js',
            ];
        }

        var wasmModule = null;
        var resolvedPkgUrl = null;
        for (var i = 0; i < pkgPaths.length; i++) {
            try {
                wasmModule = await import(pkgPaths[i]);
                resolvedPkgUrl = pkgPaths[i];
                break;
            } catch (e) {
                // Try next path
            }
        }

        if (!wasmModule) {
            throw new Error(
                '[wasm-load-browser] WASM package not found after probing paths.\n' +
                'Build with:\n' +
                '  wasm-pack build fat/crates/egpt_wasm --target web --out-dir fat/pkg-web'
            );
        }

        // Normalize resolvedPkgUrl to a FULLY-QUALIFIED absolute URL before it is used
        // as a `new URL(rel, base)` base below (line ~120). A dynamic `import()` accepts a
        // ROOT-RELATIVE specifier (e.g. `/fat/pkg-web/egpt_wasm.js` — the DEV_CORE_PROFILE
        // __wasmPkgUrl the IDE threads through window._egptWasmPkgUrl) because the browser
        // resolves it against the document origin; but the WHATWG URL constructor REQUIRES
        // its `base` argument to be a fully-qualified absolute URL (scheme + host) — a bare
        // root-relative path is not parseable standalone and throws
        // `TypeError: Failed to construct 'URL': Invalid base URL`. This mirrors exactly
        // how the experiments' engine-boot resolves the same value
        // (`new URL("../../../fat/pkg-web/egpt_wasm.js", document.baseURI).href` in
        // stack-boot.js) — the WHATWG URL constructor IS the resolution mechanism; there is
        // no second resolver. Idempotent: an already-absolute resolvedPkgUrl (the probe
        // branch's up1/up2, or an artifact's absolute CDN pkg URL) passes through unchanged
        // (a base is ignored when the first arg is already absolute).
        if (typeof window !== 'undefined' && window.location && window.location.href) {
            resolvedPkgUrl = new URL(resolvedPkgUrl, window.location.href).href;
        }

        // wasm-pack --target web generates an init() default export that,
        // called bare, builds its OWN `new URL('egpt_wasm_bg.wasm', import.meta.url)`
        // and does `fetch(thatUrlObject)` internally (verified against
        // fat/pkg-web/egpt_wasm.js's own __wbg_init/__wbg_load source).
        //
        // ARTIFACT-SAFE INIT (ws-artifact-showcase Bite A5): a claude.ai
        // Artifact runs inside a sandboxed iframe whose `window.fetch` is not
        // a direct network fetch — it is PROXIED to the parent frame via
        // `postMessage`, and every postMessage argument must be structured-
        // clonable (the HTML Structured Clone Algorithm). A `URL` object is
        // NOT clonable (confirmed identical via the platform's own global
        // `structuredClone()` — throws `DataCloneError`), so the glue's bare
        // `fetch(urlObject)` call throws inside an Artifact — this is the
        // EXACT defect from the real claude.ai paste (`DataCloneError:
        // Failed to execute 'postMessage' on 'Window': URL object could not
        // be cloned` at `window.fetch (about:srcdoc:109)` <- `Module.__wbg_init`
        // <- `load` <- the ESM entry's boot (sdk/frqtl-sdk/src/esm/index.js)).
        //
        // Fix: we fetch the .wasm bytes OURSELVES with a plain STRING url
        // (strings clone fine everywhere, including through a postMessage
        // proxy) and hand the glue raw bytes instead. wasm-bindgen's
        // `__wbg_init()` takes a BufferSource straight to
        // `WebAssembly.instantiate(bytes, imports)` — it never touches
        // `fetch()` again once it has bytes in hand. We pass the bytes via
        // the glue's non-deprecated `{module_or_path: bytes}` calling
        // convention (a bare positional BufferSource also works, but trips
        // the glue's own "using deprecated parameters" console.warn).
        var wasmSha256 = null;   // no self-fetched bytes (no init export) ⇒ honestly unknown
        if (typeof wasmModule.default === 'function') {
            var wasmBgUrl = new URL('egpt_wasm_bg.wasm', resolvedPkgUrl).href;
            var wasmResponse = await fetch(String(wasmBgUrl));
            if (!wasmResponse.ok) {
                throw new Error(
                    '[wasm-load-browser] failed to fetch WASM binary: ' +
                    wasmResponse.status + ' ' + wasmResponse.statusText + ' (' + wasmBgUrl + ')'
                );
            }
            var wasmBytes = await wasmResponse.arrayBuffer();
            wasmSha256 = await _sha256Hex(wasmBytes);
            await wasmModule.default({ module_or_path: wasmBytes });
        }

        var WasmUniverse = wasmModule.WasmUniverse;
        if (!WasmUniverse) {
            throw new Error('[wasm-load-browser] WasmUniverse not found in loaded WASM module.');
        }
        _loadedWasmSha256 = wasmSha256;

        return { WasmUniverse: WasmUniverse };
    }

    /**
     * load() wrapper that also manages window._wasmReadyPromise for the
     * deferred-p5 contract.  Called by the browser WASM path in egpt-engine.js.
     *
     * @param {string} [wasmPkgUrl]
     * @returns {Promise<{WasmUniverse: Function}>}
     */
    function loadAndSetReadyPromise(wasmPkgUrl) {
        // No banner of its own: the boot that called this paints the ONE failure overlay
        // (engine-boot.js on a page, esm/index.js's paintError in a mount) with the remedy.
        var p = load(wasmPkgUrl);
        // Expose for deferred-p5 shim (pub build script awaits this before setup())
        window._wasmReadyPromise = p;
        return p;
    }

    // ── Dual-mode publish ────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { load: load, loadAndSetReadyPromise: loadAndSetReadyPromise,
                           loadedWasmSha256: loadedWasmSha256 };
    }
    if (typeof window !== 'undefined') {
        window._WasmLoadBrowser = { load: load, loadAndSetReadyPromise: loadAndSetReadyPromise,
                                    loadedWasmSha256: loadedWasmSha256 };
    }

})();
