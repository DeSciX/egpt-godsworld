/* Copyright 2023-2026 by Essam Abadir */

/**
 * warmup — the PURE warm-up-before-derive helper for the realm→kernel binding seam
 * (WS-NOTEBOOK-BASELINE FIX B). NO DOM / engine / Runtime / Bus import, so a test
 * exercises it with a fake handle WITHOUT a browser.
 *
 * THE PROBLEM IT SOLVES: a DECLARED canvas that `produces` a binding mounts its
 * realm-internal runner at tick ~0. Deriving the produced value immediately (via
 * `deriveProducedBindings`) reads the detector histogram BEFORE any particle has
 * crossed the stage — an EMPTY `{}`. The chart then faithfully renders nothing.
 *
 * THE BASELINE FIX (one-shot, static): step the realm a DETERMINISTIC number of ticks
 * through the FROZEN handle's control-plane `step()` so the detector accumulates, THEN
 * derive + commit. The warmup count is DECLARED on the canvas (`produceAfter="N"`,
 * parsed by format.js); when omitted it falls back to `defaultTicks`.
 *
 *   warmUpRealm(handle, produceAfter, defaultTicks, maxTicks) → Promise<number>
 *
 * Returns the number of ticks actually stepped (for the host to log / a test to assert).
 *
 * FAIL-LOUD: a missing handle or a `handle.step` that throws PROPAGATES (the caller
 * surfaces it as a pane overlay and commits NOTHING). A NEGATIVE / non-integer
 * `produceAfter` (a malformed authored attr) FAILS LOUD here — never silently
 * clamped-to-zero, which would re-introduce the empty-histogram bug under a typo.
 *
 * FOLLOW-UP (CEO interactive review): the live `on('tick')` same-cell chart and
 * arbitrary-import path supersede this static one-shot warmup. This module is the
 * baseline only.
 */

'use strict';

/**
 * Default warmup tick count when a `produces`-declaring canvas omits `produceAfter`.
 * 600 is sized for the canonical double-slit stage (480x480): the SlitLightSource emits
 * at x=20, the DetectorWall sits at x≈352 (wavelength=64), and a particle covers ≤1px/tick
 * relative to its parent — so the leading edge needs ≥332 ticks to reach the detector, and
 * 600 gives a comfortable margin for a clearly non-empty histogram.
 *
 * SINGLE SOURCE OF TRUTH: imported by notebook-pane/index.js (the in-app host), so no
 * consumer duplicates the literal.
 */
export var DEFAULT_PRODUCE_AFTER_TICKS = 600;

/**
 * Hard cap on warmup ticks. Defends against an absurd authored `produceAfter` value that
 * would starve the event loop. Imported alongside DEFAULT_PRODUCE_AFTER_TICKS.
 */
export var MAX_PRODUCE_AFTER_TICKS = 100000;

/**
 * Resolve the declared `produceAfter` attribute (a verbatim string from format.js) to an
 * integer tick count, FAIL-LOUD on a malformed value. Empty / undefined → `defaultTicks`.
 *
 * @param {string|number|undefined} produceAfter — the canvas `produceAfter` attribute.
 * @param {number} defaultTicks — fallback when the attribute is empty/absent.
 * @returns {number} a non-negative integer tick count.
 * @throws {Error} FAIL-LOUD when the attribute is present but not a non-negative integer.
 */
export function resolveWarmupTicks(produceAfter, defaultTicks) {
    if (produceAfter === undefined || produceAfter === null || produceAfter === '') {
        return defaultTicks;
    }
    // Accept a number or an integer-string; reject anything else FAIL-LOUD (a typo'd
    // attribute must not silently become 0 — that re-introduces the empty histogram).
    var n = (typeof produceAfter === 'number') ? produceAfter : Number(String(produceAfter).trim());
    if (!Number.isInteger(n) || n < 0) {
        throw new Error('[warmup] produceAfter must be a non-negative integer tick count; got "' +
            produceAfter + '". (FAIL-LOUD — a malformed warmup count would silently empty the ' +
            'produced histogram.)');
    }
    return n;
}

/**
 * Warm up the realm a deterministic number of ticks before its produced binding is derived.
 *
 * @param {object} handle — the FROZEN view-handle (must expose `step()`).
 * @param {string|number|undefined} produceAfter — the declared warmup tick count (canvas attr).
 * @param {number} [defaultTicks=0] — fallback warmup when `produceAfter` is empty.
 * @param {number} [maxTicks=Infinity] — hard cap (defends against an absurd authored N).
 * @returns {Promise<number>} the number of ticks actually stepped.
 * @throws {Error} FAIL-LOUD on a missing handle / a non-stepping handle / a malformed
 *   `produceAfter` / a `handle.step()` that throws.
 *
 * The handle's `step()` is async-shaped (Promise) on both transports — each step is
 * AWAITED so the realm advances one engine tick per iteration deterministically.
 */
export async function warmUpRealm(handle, produceAfter, defaultTicks, maxTicks) {
    if (!handle || typeof handle.step !== 'function') {
        throw new Error('[warmup] warmUpRealm requires a frozen view-handle with step(). (FAIL-LOUD.)');
    }
    var want = resolveWarmupTicks(produceAfter, (typeof defaultTicks === 'number') ? defaultTicks : 0);
    var cap = (typeof maxTicks === 'number' && isFinite(maxTicks)) ? maxTicks : Infinity;
    var ticks = Math.min(want, cap);
    for (var i = 0; i < ticks; i++) {
        // CONTROL-plane step (exempt from serializability). One engine tick per await.
        await handle.step();
    }
    return ticks;
}
