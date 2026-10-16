/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render-state/index.js — the ESM door to the renderState contract.
 *
 * The contract and the APPLY procedure have ONE home: `lib/shim/render-state/apply.js`, a classic
 * shim script (ENGINE_SHIM_CONTRACT_SCRIPTS) publishing `globalThis.RenderState`, so the procedure
 * runs in the page, in the parent realm and in the sdk bundle alike. This module side-effect
 * imports it and re-exports its members by name, so ESM importers (STUDIO's save-state, the bundle
 * codec, the walkthrough registry, the sdk esm entry) read the same object — never a copy.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 *   RenderState                        — the owner object: RenderState.apply(runner, bag, env).
 *   normalizeSavedRenderState(raw)     — tolerant normalizer for a LOADED bag (never throws).
 *   pickCameraReplay(saved)            — pure decision: named preset over raw orbit.
 *   partitionRenderRows(rows, declared, known)
 *                                      — resolve render rows against the TARGET renderer.
 *   renderRowsFromBag(bag)             — a { key: value } bag as ordered [{ key, value }] rows.
 *   applySavedUrlOverrides(src, over)  — pure URL-string mutation for the load-TIME
 *                                        renderer/seed query params (lives here: the page never
 *                                        builds its own iframe src).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero physics — data shaping over a renderState bag.
 */

'use strict';

// The one owner: a classic script that publishes globalThis.RenderState in every load mode.
import './apply.js';

function _requireRenderState() {
    if (globalThis.RenderState && typeof globalThis.RenderState.apply === 'function') { return globalThis.RenderState; }
    throw new Error('[render-state] RenderState is not available on globalThis. lib/shim/render-state/apply.js ' +
        "publishes it — keep the side-effect `import './apply.js'` above. (FAIL-LOUD.)");
}
var RenderState = _requireRenderState();
var normalizeSavedRenderState = RenderState.normalizeSavedRenderState;
var pickCameraReplay = RenderState.pickCameraReplay;
var partitionRenderRows = RenderState.partitionRenderRows;
var renderRowsFromBag = RenderState.renderRowsFromBag;

// ── applySavedUrlOverrides ───────────────────────────────────────────────────

/**
 * Set (or leave untouched) the `renderer`/`seed` query params on an
 * experiment iframe `src` — the load-TIME axis of a saved render-state bag.
 *
 * @param {string} src — an iframe `src` (with or without an existing `?query`).
 * @param {{renderer?:string|null, seed?:number|string|null}} [overrides]
 * @returns {string} `src` with the requested overrides applied. Identical to
 *   `src` when `overrides` is absent or every field is falsy/undefined.
 */
function applySavedUrlOverrides(src, overrides) {
    if (typeof src !== 'string' || !overrides) { return src; }
    if (Object.prototype.hasOwnProperty.call(overrides, 'egpt3D')) {
        throw new Error('[render-state] applySavedUrlOverrides: `egpt3D` is DELETED — 3D-ness is the scene\'s ' +
            'co-init call (exp.createScene), and the display is `renderer` (three IS the 3D display). (FAIL-LOUD.)');
    }
    var qIdx = src.indexOf('?');
    var base = qIdx === -1 ? src : src.slice(0, qIdx);
    var qs   = qIdx === -1 ? '' : src.slice(qIdx + 1);
    var params = new URLSearchParams(qs);

    if (overrides.renderer) { params.set('renderer', overrides.renderer); }
    if (overrides.seed !== undefined && overrides.seed !== null && overrides.seed !== '') {
        params.set('seed', String(overrides.seed));
    }

    var qsOut = params.toString();
    return qsOut ? (base + '?' + qsOut) : base;
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    RenderState,
    normalizeSavedRenderState,
    pickCameraReplay,
    applySavedUrlOverrides,
    partitionRenderRows,
    renderRowsFromBag
};
