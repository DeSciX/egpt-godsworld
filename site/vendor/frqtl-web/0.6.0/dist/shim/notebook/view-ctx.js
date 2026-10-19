/* Copyright 2023-2026 by Essam Abadir */

/**
 * view-ctx — the SOLE authority that assembles the `view` cell CONTEXT object handed
 * to a user render module's export.
 *
 * Named ESM export. PURE module — NO DOM / engine / Runtime / Bus import. It is a
 * THIN convenience WRAPPER over the EXISTING frozen ViewHandle + the realm→kernel
 * binding seam; it introduces NO new handle shape (the design's hard constraint). It
 * is host-neutral + node-testable: a test passes a FAKE handle + a plain object as
 * the `mount` + fake binding callbacks and asserts the ctx verbs delegate correctly
 * and that `commit` enforces serializability (VETO-CLASS #1) — WITHOUT a DOM.
 *
 * The user render function is invoked as `render(ctx)` where `ctx` is:
 *
 *   {
 *     mount,        // DOM element inside the realm host (the view's render target)
 *     handle,       // the frozen ViewHandle for THIS realm (on/call/start/stop/step/dispose)
 *     on,           // convenience = handle.on  (SAME-CELL local tick stream)
 *     call,         // convenience = handle.call
 *     getBinding,   // (name) → the kernel binding value for an `in` name (data IN)
 *     commit,       // (name, value) → commit a `produces` value (data OUT, serializable-asserted)
 *     imports,      // optional: pre-resolved blessed modules (e.g. { makeChartEnv } for liveChart)
 *   }
 *
 * `mount`/`handle`/`on`/`call` are LIVE refs (the same realm trust zone the canvas
 * builder runs in). `getBinding`/`commit` are the kernel binding seam: `getBinding`
 * reads from a host-supplied resolver (the host pre-resolves `in` bindings before
 * invoking render); `commit` routes a serializable value through a host-supplied
 * commit callback (in-app: kernel.commitViewOutputs),
 * asserting serializability HERE (FAIL-LOUD on a non-serializable commit — the same
 * gate the frozen handle's data plane enforces).
 */

'use strict';

import { assertSerializable } from './view-handle.js';

/**
 * makeViewCtx(opts) → ctx
 *
 * @param {object} opts
 * @param {*} opts.mount — the view's DOM render target (a live element; opaque here).
 * @param {object} opts.handle — the frozen ViewHandle for the booted realm (REQUIRED;
 *   must expose `on` + `call`). The ctx NEVER reshapes it — it is passed through and
 *   its `on`/`call` are surfaced as convenience refs.
 * @param {(name: string) => *} [opts.getBinding] — resolve an `in` binding value by
 *   name. Default: a resolver over `opts.bindings` (a plain `{ name → value }` map);
 *   absent name → `undefined` (the host validated `in` presence before invoking).
 * @param {Object<string,*>} [opts.bindings] — pre-resolved `in` bindings (used by the
 *   default getBinding when no explicit resolver is supplied).
 * @param {(name: string, value: *) => void} [opts.commit] — host commit callback
 *   (in-app: kernel.commitViewOutputs). When absent,
 *   `commit` FAILS LOUD (a view that declares `produces` requires a commit sink).
 * @param {Object<string,*>} [opts.imports] — pre-resolved blessed modules.
 * @returns {object} the view ctx.
 * @throws {Error} FAIL-LOUD if `handle` is missing `on`/`call`.
 */
export function makeViewCtx(opts) {
    opts = opts || {};
    var mount = opts.mount;
    var handle = opts.handle;
    if (!handle || typeof handle.on !== 'function' || typeof handle.call !== 'function') {
        throw new Error('[view-ctx] requires a frozen ViewHandle with on()/call(). (FAIL-LOUD.)');
    }

    var bindings = opts.bindings || {};
    var getBinding = (typeof opts.getBinding === 'function')
        ? opts.getBinding
        : function (name) {
            return Object.prototype.hasOwnProperty.call(bindings, name) ? bindings[name] : undefined;
        };

    var commitSink = (typeof opts.commit === 'function') ? opts.commit : null;
    function commit(name, value) {
        if (typeof name !== 'string' || !name) {
            throw new Error('[view-ctx] commit: name must be a non-empty string. (FAIL-LOUD.)');
        }
        if (!commitSink) {
            throw new Error('[view-ctx] commit("' + name + '"): no commit sink wired for this ' +
                'view (declare a `produces` binding + supply a host commit callback). (FAIL-LOUD.)');
        }
        // VETO-CLASS #1: a committed value MUST be structured-clone-serializable (it
        // crosses into the kernel binding store, which a marshalling host may carry).
        assertSerializable(value, 'view commit("' + name + '") value');
        commitSink(name, value);
    }

    return {
        mount: mount,
        handle: handle,
        // convenience refs over the frozen handle — bind so a destructured `on`/`call`
        // keeps the handle as `this` is irrelevant (the handle methods are closures).
        on: function (event, cb) { return handle.on(event, cb); },
        call: function (fn, args) { return handle.call(fn, args); },
        getBinding: getBinding,
        commit: commit,
        imports: opts.imports || {}
    };
}
