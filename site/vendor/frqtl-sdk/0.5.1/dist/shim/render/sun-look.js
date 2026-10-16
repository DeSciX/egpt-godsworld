/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render/sun-look.js — the ONE owner of the SUN's look: its render-option bag.
 *
 * The values are the FINAL FX bag EXACTLY as the CEO played and captured it in his export session
 * (new_sun.png is the primary oracle; sun.png stays the historical dense reference), verbatim from
 * his exported renderState. They are in the write door's shape — a BAG, what
 * `runner.setRenderOptions(bag)` takes — and every key is a capability the three renderer declares.
 *
 *   SunLook.SUN_RENDER   — the sun's whole look (rung r8-sun's render rows).
 *   SunLook.SUN_GODRAYS  — the god-ray pair, PICKED from SUN_RENDER: what another scene lights up
 *                          "at the sun's settings" with (the mirror's 3D mode, the 3D DSE's switch).
 *
 * `godraySource` is NOT here: what the rays are computed from is each borrower's declared choice.
 * The camera is NOT here: a pose is a rung row's view, not a look.
 *
 * Readers: `lib/shim/registry/walkthrough.js` (ESM — a side-effect import, then the global) and a
 * scene sketch (`window.SunLook`). Zero physics: render options are read only by the renderer.
 *
 * Publish form: read at LOAD by an ESM module in four load modes (node CJS, Vite module, classic
 * script, esbuild-wrapped CJS in the sdk bundle where `module` exists), so it sets
 * `globalThis.SunLook` in EVERY mode and ALSO `module.exports` when `module` exists — one frozen object.
 */

(function () {
'use strict';

var SUN_RENDER = Object.freeze({
    shape: 'sphere', colorScheme: 'warmcool',
    godrays: 1.08, godrayDensity: 1.085,
    glowIntensity: 0.93, heat: 0.35, smoke: 0
});

// The pair other scenes light up "at the sun's settings" with — PICKED from SUN_RENDER, never re-typed.
var SUN_GODRAYS = Object.freeze({ godrays: SUN_RENDER.godrays, godrayDensity: SUN_RENDER.godrayDensity });

var SunLook = Object.freeze({ SUN_RENDER: SUN_RENDER, SUN_GODRAYS: SUN_GODRAYS });

globalThis.SunLook = SunLook;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SunLook;
}

})();
