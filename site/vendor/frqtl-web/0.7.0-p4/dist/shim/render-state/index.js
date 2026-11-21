/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render-state/index.js — the ESM door to the renderState contract.
 *
 * The contract and the APPLY procedure have ONE home: `lib/shim/render-state/apply.js`, an ES module
 * the page (through experiments/_shared/boot.js), the parent realm and the sdk bundle all import.
 * This module re-exports its namespace and members by name, so importers (STUDIO's save-state, the
 * bundle codec, the walkthrough registry, the sdk esm entry) read the same object — never a copy.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 *   RenderState                        — the owner object: RenderState.apply(runner, bag, env).
 *   RENDER_STATE_KEYS, RENDER_STATE_VERSION — the bag's key table and its one version.
 *   normalizeSavedRenderState(raw)     — a bag or null → the full bag; THROWS on a key outside the table, another
 *                                        version, page controls, or a non-bag.
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

// The one owner of the renderState contract and its apply procedure.
import * as RenderState from './apply.js';
import { RENDER_STATE_KEYS, RENDER_STATE_VERSION, normalizeSavedRenderState, pickCameraReplay, partitionRenderRows, renderRowsFromBag } from './apply.js';

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
    RENDER_STATE_KEYS,
    RENDER_STATE_VERSION,
    RenderState,
    normalizeSavedRenderState,
    pickCameraReplay,
    applySavedUrlOverrides,
    partitionRenderRows,
    renderRowsFromBag
};
