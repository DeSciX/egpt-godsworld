/* Copyright 2023-2026 by Essam Abadir */

/**
 * produced-bindings — the PURE derive-the-serializable-binding helper for the
 * realm→kernel binding seam. NO DOM / engine /
 * Runtime / Bus import, so a test exercises it with a fake handle WITHOUT a browser.
 *
 * A DECLARED canvas commits its `produces` binding(s) by DERIVING each value from the
 * live realm-internal runner via the FROZEN handle (`handle.call(produceVia)`), then
 * asserting it serializable before it crosses any authority boundary (the in-app pane
 * commit, the realm-entry `realm:binding` post). It reuses the ONE existing projector
 * (`detectorHistogram`, via `handle.call('detectorHistogram')`) — it invents none.
 *
 *   deriveProducedBindings(handle, produces, produceVia) → [{ name, value }, …]
 *
 * FAIL-LOUD: a missing handle, an empty produces with no names (→ []), a `handle.call`
 * that throws (unknown produceVia / no detector) PROPAGATES (the caller surfaces it as a
 * `realm:error` / pane overlay and commits NOTHING), and a non-serializable derived value
 * THROWS via `assertSerializable` (a live runner/handle/function can never cross the seam).
 */

'use strict';

import { assertSerializable } from './view-handle.js';

var DEFAULT_PRODUCE_VIA = 'detectorHistogram';

/**
 * Derive the serializable `{ name, value }` bindings a declared canvas commits.
 *
 * @param {object} handle — the FROZEN view-handle (must expose `call(fn, args)`).
 * @param {string[]} produces — the declared `produces` binding names (canvas-only).
 * @param {string} [produceVia] — the frozen-handle call name; defaults to `'detectorHistogram'`.
 * @returns {Promise<Array<{name:string, value:*}>>} one entry per produced name (empty when none declared).
 * @throws {Error} FAIL-LOUD on a missing/invalid handle, a throwing `handle.call`, or a
 *   non-serializable derived value (VETO-CLASS #1 — never commit a live ref).
 *
 * ASYNC: the frozen handle is async-shaped (`call()` returns a Promise on every
 * transport). The derived
 * value MUST be AWAITED before `assertSerializable` — otherwise a Promise (never
 * structured-clone-serializable) reaches the seam and FAILS LOUD spuriously.
 */
export async function deriveProducedBindings(handle, produces, produceVia) {
    var names = Array.isArray(produces) ? produces : [];
    if (!names.length) { return []; }
    if (!handle || typeof handle.call !== 'function') {
        throw new Error('[produced-bindings] deriveProducedBindings requires a frozen view-handle ' +
            'with call(). (FAIL-LOUD.)');
    }
    var via = (typeof produceVia === 'string' && produceVia) ? produceVia : DEFAULT_PRODUCE_VIA;
    var out = [];
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        // DERIVE from the live runner via the frozen handle — the SOLE source of the value
        // (truth-in-labeling: the author never hand-writes the histogram). C11: one
        // `produceVia` per canvas, so every name derives from the same call in this WS.
        // AWAIT it: `handle.call` is async-shaped, so the value is a Promise until resolved.
        var value = await handle.call(via, []);
        // VETO-CLASS #1 at the realm boundary: a non-serializable value (a live runner /
        // function / DOM node) FAILS LOUD here — it is never posted/committed (C2).
        assertSerializable(value, 'produces("' + name + '") from realm canvas');
        out.push({ name: name, value: value });
    }
    return out;
}

export { DEFAULT_PRODUCE_VIA };
