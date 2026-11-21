/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render/sun-look.js — the ONE owner of the SUN's look: its render-option bag.
 *
 * The values are the FINAL FX bag EXACTLY as played and captured in an export session
 * (new_sun.png is the primary oracle; sun.png stays the historical dense reference), verbatim from
 * the exported renderState, plus `godrayMode: 'radial'`, the mode chosen for the sun once the modes existed. They are in the write door's shape — a BAG, what
 * `runner.setRenderOptions(bag)` takes — and every key is a capability the three renderer declares.
 *
 *   SunLook.SUN_RENDER   — the sun's whole look (rung r8-sun's render rows).
 *
 * `godrayMode` 'radial' is the sun's own (its rays fan from one light point, the source frames' centroid).
 * The camera is NOT here: a pose is a rung row's view, not a look.
 *
 * Readers: a scene sketch, by its package specifier (`@descix/frqtl-web/shim/render/sun-look.js`). Zero physics: render
 * options are read only by the renderer.
 */


var SUN_RENDER = Object.freeze({
    shape: 'sphere', colorScheme: 'warmcool',
    godrays: 1.08, godrayDensity: 1.085, godrayMode: 'radial',
    glowIntensity: 0.93, heat: 0.35, smoke: 0
});

export { SUN_RENDER };
