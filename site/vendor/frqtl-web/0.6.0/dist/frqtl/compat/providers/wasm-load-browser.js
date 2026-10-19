/* Copyright 2023-2026 by Essam Abadir */

/**
 * wasm-load-browser.js — the BROWSER loader for the WASM engine (an ES module).
 *
 * Imports the wasm-pack --target web glue located BESIDE this tree —
 * `new URL('../../../fat/pkg-web/egpt_wasm.js', import.meta.url)` — and returns the resolved
 * WasmUniverse constructor so wasm-engine.js stays env-agnostic. The boot door hands this
 * loader to `bootEngine` (compat/engine.js); nothing here publishes a global or a ready promise.
 *
 * A host serves the engine at its lib/-relative placement (frqtl/compat/… beside fat/pkg-web/…),
 * so the glue's location is a fact of this file's own URL — there is no override global and no
 * probe list (a probe list is a silent search). `load(glueUrl)` takes an explicit URL only for a
 * test that must cache-bust the glue.
 *
 * Artifact-safe init:
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

/** The glue's URL: a fact of this module's own placement. */
export const GLUE_URL = new URL('../../../fat/pkg-web/egpt_wasm.js', import.meta.url).href;

/** sha256 hex of the last binary this loader instantiated; null before any load. */
let _loadedWasmSha256 = null;

/**
 * sha256 hex of `bytes` via `crypto.subtle`, or null where the page has none (a
 * non-secure origin). Null there cannot mint a false identity: `RenderStages.sceneHash`
 * refuses to hash without the same `crypto.subtle`, so no scene id exists in that page.
 */
async function _sha256Hex(bytes) {
    const subtle = (typeof crypto !== 'undefined') ? crypto.subtle : null;
    if (!subtle || typeof subtle.digest !== 'function') { return null; }
    const view = new Uint8Array(await subtle.digest('SHA-256', bytes));
    let hex = '';
    for (let i = 0; i < view.length; i++) {
        hex += (view[i] < 16 ? '0' : '') + view[i].toString(16);
    }
    return hex;
}

/** @returns {string|null} sha256 hex of the instantiated `.wasm`, or null. */
export function loadedWasmSha256() {
    return _loadedWasmSha256;
}

/**
 * Load the WASM web bundle and return the WasmUniverse constructor.
 *
 * @param {string} [glueUrl] - the glue URL (default GLUE_URL); a test passes a cache-busted one.
 * @returns {Promise<{WasmUniverse: Function}>}
 */
export async function load(glueUrl) {
    const pkgUrl = glueUrl || GLUE_URL;
    let wasmModule;
    try {
        wasmModule = await import(pkgUrl);
    } catch (e) {
        throw new Error(
            '[wasm-load-browser] the WASM package glue did not load from ' + pkgUrl + ' (' +
            (e && e.message ? e.message : String(e)) + ').\n' +
            'Build it with:\n' +
            '  wasm-pack build fat/crates/egpt_wasm --target web --out-dir fat/pkg-web'
        );
    }

    // wasm-pack --target web generates an init() default export that,
    // called bare, builds its OWN `new URL('egpt_wasm_bg.wasm', import.meta.url)`
    // and does `fetch(thatUrlObject)` internally (verified against
    // fat/pkg-web/egpt_wasm.js's own __wbg_init/__wbg_load source).
    //
    // ARTIFACT-SAFE INIT: a claude.ai
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
    // <- `load` <- the ESM entry's boot (lib/frqtl/experiments/_shared/doors.js)).
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
    let wasmSha256 = null;   // no self-fetched bytes (no init export) ⇒ honestly unknown
    if (typeof wasmModule.default === 'function') {
        const wasmBgUrl = new URL('egpt_wasm_bg.wasm', pkgUrl).href;
        const wasmResponse = await fetch(String(wasmBgUrl));
        if (!wasmResponse.ok) {
            throw new Error(
                '[wasm-load-browser] failed to fetch WASM binary: ' +
                wasmResponse.status + ' ' + wasmResponse.statusText + ' (' + wasmBgUrl + ')'
            );
        }
        const wasmBytes = await wasmResponse.arrayBuffer();
        wasmSha256 = await _sha256Hex(wasmBytes);
        await wasmModule.default({ module_or_path: wasmBytes });
    }

    const WasmUniverse = wasmModule.WasmUniverse;
    if (!WasmUniverse) {
        throw new Error('[wasm-load-browser] WasmUniverse not found in loaded WASM module.');
    }
    _loadedWasmSha256 = wasmSha256;

    return { WasmUniverse: WasmUniverse };
}

/** The loader the browser door hands to bootEngine. */
export const browserWasmLoader = Object.freeze({ env: 'browser', load: function () { return load(); } });
