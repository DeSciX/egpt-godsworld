/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module view-handle
 * @description
 * The FROZEN host↔realm contract. Produced by `makeViewHandle(impl)`.
 *
 * The frozen handle surface (all async-shaped):
 * ```
 *   inject(name, data)  → Promise<void>           // host → realm data push
 *   call(fn, args)      → Promise<result>          // host → realm invoke + result
 *   on(event, cb)       → unsubFn                  // realm → host event stream
 *   start()             → Promise<void>            // control-plane game-loop verbs
 *   stop()              → Promise<void>
 *   step()              → Promise<tickData|void>
 *   dispose()           → Promise<void>
 * ```
 *
 * Every method is async-shaped so a marshalling host (the hosted-eyes page-evaluate
 * seam, a BYO realm host) sees the same signatures as the in-app direct-scripting
 * transport. Cell code never branches on transport.
 *
 * VETO-CLASS #1: `inject(name, data)` payloads and `on(event, payload)` event
 * payloads MUST be structured-clone-serializable. `assertSerializable` enforces
 * this at the boundary — FAIL-LOUD regardless of transport.
 */

/**
 * @typedef {object} ViewHandle
 * @property {string} transport
 *   DERIVED label from the transport, `'in-app'` today (truth-in-labeling — never hardcoded by a consumer).
 * @property {(name: string, data: *) => Promise<void>} inject
 *   Push a serializable value into the realm environment. VETO-CLASS #1 enforced.
 * @property {(fn: string, args: *[]) => Promise<*>} call
 *   Invoke a named function in the realm and resolve its result.
 * @property {(event: string, cb: Function) => Function} on
 *   Subscribe to a realm event. Returns an unsubscribe function.
 * @property {() => Promise<void>} start  — start the realm game loop.
 * @property {() => Promise<void>} stop   — pause the realm game loop.
 * @property {() => Promise<*>}    step   — advance one tick; resolves with tick data.
 * @property {() => Promise<void>} dispose — tear down the realm.
 */

'use strict';

/* ── structured-clone serializability check (VETO-CLASS #1 enforcement) ───────
 *
 * structuredClone is available in Node 17+ and every modern browser. We attempt a
 * clone and surface a FAIL-LOUD error naming the offending plane on failure. We do
 * NOT keep the clone (the realm impl receives the original by value/marshal); the
 * clone is purely the serializability gate. A function, DOM node, live runner,
 * class instance with methods, etc. throws — exactly the refs a marshalling host (the
 * hosted-eyes page-evaluate seam, a BYO realm host) cannot carry. */

/**
 * Assert that `value` is structured-clone-serializable.
 *
 * Throws a `TypeError` (FAIL-LOUD) if the value cannot be cloned — e.g. a function,
 * DOM node, live runner handle, or class instance with methods. Falls back to a
 * JSON round-trip on runtimes without `structuredClone` (Node < 17 / old browsers).
 *
 * @param {*} value — the data-plane payload to validate.
 * @param {string} [ctx] — context label for the error message (e.g. `'inject("x") payload'`).
 * @returns {*} `value` unchanged (pass-through for inline use).
 * @throws {TypeError} if the value is not structured-clone-serializable.
 */
export function assertSerializable(value, ctx) {
    var label = ctx || 'data-plane payload';
    if (typeof structuredClone !== 'function') {
        // No structuredClone (very old runtime): fall back to a JSON round-trip,
        // which is STRICTER (also rejects functions/undefined) — still FAIL-LOUD,
        // never a silent pass.
        try {
            JSON.parse(JSON.stringify(value));
        } catch (e) {
            throw new TypeError('[view-handle] ' + label + ' is not serializable (JSON fallback): ' +
                (e && e.message ? e.message : String(e)) + ' (VETO-CLASS #1 — the data plane must be ' +
                'structured-clone-serializable so a marshalling host is not a fork.)');
        }
        return value;
    }
    try {
        structuredClone(value);
    } catch (e) {
        throw new TypeError('[view-handle] ' + label + ' is not structured-clone-serializable: ' +
            (e && e.message ? e.message : String(e)) + ' (VETO-CLASS #1 — never pass a live object ' +
            'ref/function/DOM node across the handle data plane; a marshalling host cannot carry it.)');
    }
    return value;
}

/* ── normalize a possibly-sync impl method into a Promise ─────────────────── */
function _toPromise(fn, args) {
    try {
        return Promise.resolve(fn.apply(null, args));
    } catch (e) {
        return Promise.reject(e);
    }
}

/**
 * Wrap a transport-specific implementation into a frozen view handle.
 *
 * The returned handle enforces VETO-CLASS #1 (structured-clone check) on `inject`
 * payloads and on `on(event, cb)` emitted payloads. Every method is async-shaped.
 * The handle is `Object.freeze`d — a cell cannot monkey-patch the contract.
 *
 * @param {object} impl — the transport-specific implementation object.
 * @param {(name: string, data: *) => void|Promise<void>} impl.inject
 * @param {(fn: string, args: *[]) => *|Promise<*>} impl.call
 * @param {(event: string, cb: Function) => Function} impl.on
 * @param {() => void|Promise<void>} [impl.start]
 * @param {() => void|Promise<void>} [impl.stop]
 * @param {() => *|Promise<*>} [impl.step]
 * @param {() => void|Promise<void>} impl.dispose
 * @param {'in-app'} [impl._transport] — DERIVED transport label (truth-in-labeling).
 * @returns {ViewHandle} frozen handle with IDENTICAL API regardless of transport.
 * @throws {Error} if required methods (`inject`, `call`, `on`, `dispose`) are missing.
 *
 * @example
 * // In-app descriptor (same-origin direct scripting):
 * const handle = makeViewHandle({
 *   _transport: 'in-app',
 *   inject: (name, data) => { window._realmEnv[name] = data; },
 *   call:   (fn, args)   => window._realmEnv[fn](...args),
 *   on:     (ev, cb)     => { /* subscribe * / return () => {}; },
 *   start:  ()           => window._realmEnv.start(),
 *   stop:   ()           => window._realmEnv.stop(),
 *   step:   ()           => window._realmEnv.step(),
 *   dispose:()           => { window._realmEnv = null; }
 * });
 */
export function makeViewHandle(impl) {
    if (!impl || typeof impl.inject !== 'function' || typeof impl.call !== 'function' ||
        typeof impl.on !== 'function' || typeof impl.dispose !== 'function') {
        throw new Error('[view-handle] makeViewHandle requires an impl with ' +
            'inject/call/on/dispose (start/stop/step optional but recommended). (FAIL-LOUD.)');
    }

    var handle = {
        // Diagnostic, DERIVED transport label (truth-in-labeling — never hardcoded
        // by a consumer; reflects how this handle actually marshals).
        transport: impl._transport || 'in-app',

        // ── DATA plane (serializability-gated) ──────────────────────────────
        inject: function (name, data) {
            if (typeof name !== 'string' || !name) {
                return Promise.reject(new Error('[view-handle] inject: name must be a non-empty string.'));
            }
            try { assertSerializable(data, 'inject("' + name + '") payload'); }
            catch (e) { return Promise.reject(e); }
            return _toPromise(impl.inject, [name, data]);
        },

        // ── host → realm invoke + result ────────────────────────────────────
        call: function (fn, args) {
            return _toPromise(impl.call, [fn, args]);
        },

        // ── realm → host event stream ───────────────────────────────────────
        // We WRAP the caller's cb so the emitted payload is asserted serializable
        // at the boundary (VETO-CLASS #1 applies to BOTH inject AND on payloads).
        // A non-serializable emit FAILS LOUD via the wrapper's throw — never a
        // silent same-origin-only pass that would break under a marshalling host.
        on: function (event, cb) {
            if (typeof cb !== 'function') {
                throw new Error('[view-handle] on("' + String(event) + '"): cb must be a function.');
            }
            var guarded = function (payload) {
                assertSerializable(payload, 'on("' + String(event) + '") event payload');
                cb(payload);
            };
            var unsub = impl.on(event, guarded);
            return (typeof unsub === 'function') ? unsub : function () {};
        },

        // ── CONTROL plane (exempt from serializability — no rich data) ───────
        start: function () { return impl.start ? _toPromise(impl.start, []) : Promise.resolve(); },
        stop:  function () { return impl.stop  ? _toPromise(impl.stop, [])  : Promise.resolve(); },
        step:  function () { return impl.step  ? _toPromise(impl.step, [])  : Promise.resolve(); },

        // ── teardown ────────────────────────────────────────────────────────
        dispose: function () { return _toPromise(impl.dispose, []); }
    };

    return Object.freeze(handle);
}

/**
 * Duck-type a value as a frozen view handle.
 *
 * Used by the notebook pane to decide whether a cell's `out=`/`bind=` binding
 * value is a realm handle to script vs a plain data binding.
 *
 * @param {*} v
 * @returns {boolean} `true` if `v` has `inject`, `call`, `on`, and `dispose` functions.
 */
export function isViewHandle(v) {
    return !!(v && typeof v === 'object' &&
        typeof v.inject === 'function' && typeof v.call === 'function' &&
        typeof v.on === 'function' && typeof v.dispose === 'function');
}
