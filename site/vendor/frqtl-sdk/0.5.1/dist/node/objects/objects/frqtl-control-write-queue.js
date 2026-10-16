/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-control-write-queue.js — the WRITE-side symmetric primitive to
 * `frqtl-control-sync.js`'s PULL-side coalescing (WS Studio Controls
 * Realignment S4, design §2.3.4 — "add the symmetric primitive: an
 * rAF-coalesced, last-write-wins-per-frame-per-control-id write queue").
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `makeControlWriteQueue(opts) → { write(id, fn), flushSync(), dispose() }`.
 *
 * `write(id, fn)` registers `fn` as the pending write for control `id`. Any
 * number of `write()` calls for the SAME `id` within one animation frame
 * collapse to ONE scheduled flush — the LAST `fn` registered wins (a fast
 * slider drag firing many `input` events per frame does not fire the
 * accessor once per event; it fires it once per frame, with the final
 * value). Writes for DIFFERENT ids in the same frame all flush together
 * (each is independent — one control's write never blocks another's).
 *
 * ── Canonical home (why HERE, beside frqtl-control-sync.js, not inside it) ───
 *
 * The design note explicitly allows either "in frqtl-control-sync.js or a
 * sibling" — a SIBLING file is chosen: pull (`frqtl-control-sync.js`) and
 * write (this file) are symmetric but INDEPENDENT concerns (a page/panel may
 * want one without the other — e.g. a read-only remote observer widget never
 * writes), and keeping them as two single-purpose files matches this
 * directory's existing one-concern-per-file convention (`controlBind.js`
 * execution vs `makeControlsForObject.js` generation vs
 * `frqtl-controls-panel.js` transport). A merged file would force every pull
 * consumer to also carry write-queue machinery it may not use.
 *
 * Loaded into the shared game layer (`lib/shim/engine/game-layer-manifest.js`
 * `OBJECT_SCRIPTS`, alongside `controlBind.js`/`makeControlsForObject.js`/
 * `frqtl-control-slider.js`/`frqtl-controls-panel.js`) — Studio's author
 * iframe (`lib/features/ide/AuthorView.jsx`) can load ANY canonical
 * experiment page, so it needs `cw.FrqtlControlWriteQueue` available
 * regardless of which page is currently loaded, exactly the same "promoted
 * from a per-page opt-in" reasoning as those four siblings (see the
 * manifest's own comment block for the S3 precedent).
 *
 * ── FAIL-LOUD condition (architect, non-negotiable) ─────────────────────────
 *
 * A throwing accessor write mid-drag MUST PROPAGATE — never be silently
 * swallowed under last-write-wins coalescing. `flush()`/`flushSync()` below
 * do NOT wrap the invocation of a pending write in try/catch: if the ONE
 * surviving `fn` for an id throws, the exception propagates OUT of
 * `flush()` (and therefore out of the rAF callback that called it — visible
 * as an uncaught exception, exactly as visible as an uncoalesced synchronous
 * throw would have been). This is NOT the same claim as "no id in a batch
 * ever loses a write" — coalescing DISCARDING an earlier `fn` for the SAME id
 * in favor of a later one is normal, intentional last-write-wins semantics,
 * not error-swallowing. What must never happen is the QUEUE ITSELF catching
 * and discarding the ONE fn that DOES run. (A caller MAY still wrap its own
 * registered `fn` in its own try/catch for its own UX reasons — e.g. Studio's
 * Inspector `commitField` logging a console.error — that is the caller's
 * choice, not this file's; it is not "swallowed by coalescing".)
 *
 * If multiple DIFFERENT ids are pending in the same batch and an earlier id's
 * fn throws, later ids in that SAME flush pass are skipped (the exception
 * unwinds the loop) — mirroring what an uncoalesced synchronous caller doing
 * the same writes back-to-back would also experience (one throw stops the
 * sequence). Each id's write is independently re-attempted on ITS OWN next
 * `write()` call, same as any other write.
 *
 * ── Module format: CLASSIC dual CommonJS/window ─────────────────────────────
 * Same convention as every peer in this directory (frqtl-control-sync.js,
 * controlBind.js, frqtl-controls-panel.js).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * Zero physics. Pure scheduling — coalescing WHEN an accessor write happens
 * (once per animation frame instead of once per input event) never changes
 * WHAT the write does; the applied value is byte-identical to calling the
 * same accessor directly with the same (final) value.
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — see Wall.js, LargeObject.js
//    and 24 more siblings). Every declaration below is PRIVATE to this file; the ONLY
//    thing that reaches the shared browser global scope is the explicit window.<NS>
//    assignment at the bottom. Classic <script> tags share ONE global lexical scope,
//    so an unwrapped top-level 'function _label(...)' here would silently OVERWRITE a
//    same-named helper in a sibling script (and vice-versa) — a collision that is
//    invisible to 'node --test' by construction, because Node gives each file its own
//    module scope. Enforced by lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

function _raf(fn) {
    if (typeof requestAnimationFrame === 'function') { return requestAnimationFrame(fn); }
    // Non-browser (Node test) / older-browser fallback — same ~1-frame cadence
    // as frqtl-control-sync.js's own fallback.
    return setTimeout(fn, 16);
}

function _cancelRaf(token) {
    if (typeof cancelAnimationFrame === 'function') {
        try { cancelAnimationFrame(token); } catch (e) { /* best-effort */ }
    } else {
        try { clearTimeout(token); } catch (e) { /* best-effort */ }
    }
}

/**
 * makeControlWriteQueue(opts) → write-queue handle.
 *
 * @param {object} [opts] — reserved for future options; no required fields today.
 * @returns {{
 *   write: (id:string, fn:Function) => void,
 *   flushSync: () => void,
 *   dispose: () => void
 * }}
 */
function makeControlWriteQueue(opts) {
    opts = opts || {};

    var pending = Object.create(null); // id -> fn (LAST WRITE WINS per id per frame)
    var pendingRaf = null;             // rAF-coalescing token (non-null while a flush is scheduled)
    var disposed = false;

    /**
     * flush() — apply every pending write, one call each, in registration
     * order. See file docstring's FAIL-LOUD condition: no try/catch here.
     */
    function flush() {
        pendingRaf = null;
        if (disposed) { return; }
        var batch = pending;
        pending = Object.create(null);
        var ids = Object.keys(batch);
        for (var i = 0; i < ids.length; i++) {
            batch[ids[i]](); // FAIL-LOUD: a throw here propagates to the caller of flush()/flushSync().
        }
    }

    /**
     * write(id, fn) — register `fn` as the pending write for `id`. Schedules
     * AT MOST one rAF-coalesced flush; any number of calls for ids already
     * pending within the same frame just replace their fn (last-write-wins).
     * @param {string} id — non-empty string, the control id this write targets.
     * @param {Function} fn — zero-arg closure that performs the actual accessor
     *   write (the caller closes over whatever value/target it needs).
     * @throws {Error} FAIL-LOUD — missing/invalid id or fn.
     */
    function write(id, fn) {
        if (disposed) { return; }
        if (typeof id !== 'string' || !id) {
            throw new Error('[frqtl-control-write-queue] write requires a non-empty string id. (FAIL-LOUD.)');
        }
        if (typeof fn !== 'function') {
            throw new Error('[frqtl-control-write-queue] write("' + id + '") requires a function. (FAIL-LOUD.)');
        }
        pending[id] = fn; // last-write-wins-per-frame-per-control-id
        if (pendingRaf !== null) { return; } // already coalesced into a scheduled frame
        pendingRaf = _raf(flush);
    }

    /**
     * flushSync() — apply all pending writes NOW, bypassing the rAF wait.
     * Cancels any already-scheduled rAF/timeout first (avoids a double-flush).
     * Exposed for tests (deterministic, no timer dependency) and for callers
     * that need a guaranteed-applied write before proceeding synchronously
     * (e.g. a Reset action right after a drag).
     */
    function flushSync() {
        if (pendingRaf !== null) { _cancelRaf(pendingRaf); pendingRaf = null; }
        flush();
    }

    /**
     * dispose() — discard all pending writes (they never fire) and cancel any
     * scheduled flush. Idempotent.
     */
    function dispose() {
        if (disposed) { return; }
        disposed = true;
        pending = Object.create(null);
        if (pendingRaf !== null) { _cancelRaf(pendingRaf); pendingRaf = null; }
    }

    return { write: write, flushSync: flushSync, dispose: dispose };
}

// ── Export ────────────────────────────────────────────────────────────────────

var FrqtlControlWriteQueue = { makeControlWriteQueue: makeControlWriteQueue };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrqtlControlWriteQueue;
} else if (typeof window !== 'undefined') {
    window.FrqtlControlWriteQueue = FrqtlControlWriteQueue;
}

})();
