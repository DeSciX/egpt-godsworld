/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render/sun-look.js — the ONE owner of the SUN's look: its render-option bag.
 *
 * The values are the FINAL FX bag EXACTLY as played and captured in an export session
 * (new_sun.png is the primary oracle; sun.png stays the historical dense reference), verbatim from
 * the exported renderState. They are in the write door's shape — a BAG, what
 * `runner.setRenderOptions(bag)` takes — and every key is a capability the three renderer declares.
 *
 *   SunLook.SUN_RENDER   — the sun's whole look (rung r8-sun's render rows).
 *   SunLook.SUN_GODRAYS  — the god-ray pair, PICKED from SUN_RENDER: what another scene lights up
 *                          "at the sun's settings" with (the mirror's 3D mode, the 3D DSE's switch).
 *
 * `godraySource` is NOT here: what the rays are computed from is each borrower's declared choice.
 * The camera is NOT here: a pose is a rung row's view, not a look.
 *
 * Readers: `lib/shim/registry/walkthrough.js` (a named import) and a scene sketch (`SunLook`, the
 * bridge's publication of this module until the game layer imports it). Zero physics: render
 * options are read only by the renderer.
 */


var SUN_RENDER = Object.freeze({
    shape: 'sphere', colorScheme: 'warmcool',
    godrays: 1.08, godrayDensity: 1.085,
    glowIntensity: 0.93, heat: 0.35, smoke: 0
});

// The pair other scenes light up "at the sun's settings" with — PICKED from SUN_RENDER, never re-typed.
var SUN_GODRAYS = Object.freeze({ godrays: SUN_RENDER.godrays, godrayDensity: SUN_RENDER.godrayDensity });

export { SUN_RENDER, SUN_GODRAYS };
