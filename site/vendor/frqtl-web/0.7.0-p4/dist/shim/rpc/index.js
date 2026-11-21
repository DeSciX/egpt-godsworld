/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/rpc — the request/response call() primitive (gym-controls-as-sugar
 * Layer-A follow-up; gate 5 charter —
 * "the reqId/pending/timeout request/response-call()-over-postMessage pattern
 * is promoted to a SHIM PRIMITIVE the moment a second consumer needs it").
 *
 * Peer of `lib/shim/controls`, `lib/shim/frame-data`, `lib/shim/expr/ast-schema`,
 * `lib/shim/page-params` — same layout convention: named ES-module exports, imported by
 * page-context sugar (`lib/frqtl/parts/FrqtlControlsPanel.js`) and the IDE alike.
 *
 * ── API ──────────────────────────────────────────────────────────────────────
 *
 *   makeInAppRpc(dispatch) → { call(fn,args)->Promise, dispose() }
 *     Same-realm (same window) calling — `dispatch` runs directly, wrapped in
 *     a Promise for a uniform caller shape (no postMessage round-trip; there
 *     is no cross-realm boundary to cross).
 *
 *   makeChannelRpc(channel, opts) → { call(fn,args)->Promise, dispose() }
 *     Cross-realm calling over any `{post,subscribe}` channel (same- or
 *     cross-origin — the mechanism does not care which). Builds the
 *     reqId/pending/timeout request/response protocol; rejects on timeout
 *     (`opts.callTimeoutMs`, default 3000) if the other side never replies —
 *     the ONE MUST-HAVE this primitive adds over a bare channel: an
 *     unresponsive/not-yet-booted target must not hang a caller's Promise
 *     forever.
 *
 *   installRpcResponder(channel, dispatch, opts) → unsubscribeFn
 *     The REALM/receiving side's counterpart to `makeChannelRpc`: listens on
 *     `channel` for calls tagged `opts.tag`, invokes `dispatch(fn,args)`
 *     (sync OR Promise-returning — both supported uniformly), replies with
 *     the result or error. `dispatch`'s return value must be plain,
 *     structured-clone-serializable data (this module does not itself assert
 *     that — see the design-note below).
 *
 *   makeWindowPostMessageChannel(targetWindow, opts) → {post,subscribe}
 *     A ready-made `window.postMessage`/`'message'`-event channel targeting
 *     one specific window (an iframe's `contentWindow`, or `window.parent`)
 *     — the shape `makeChannelRpc`/`installRpcResponder` accept.
 *
 * `opts.tag` is REQUIRED on `makeChannelRpc`/`installRpcResponder` — a short
 * string namespacing this RPC user's postMessage traffic so two independent
 * RPC users sharing one `window.postMessage` bus (e.g. this primitive AND
 * the notebook realm's own `__frqtlRealm`-tagged traffic) never collide.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 *
 * `frqtl-controls-panel.js` once built this request/response protocol INLINE; the
 * protocol is a shim primitive so the panel and every later consumer share one
 * reqId/pending/timeout implementation.
 */



/**
 * makeInAppRpc(dispatch) — same-realm (same window) RPC.
 * @param {(fn: string, args: any[]) => *} dispatch — invoked directly; may
 *   return a value or a Promise.
 * @returns {{call: (fn: string, args: any[]) => Promise<*>, dispose: () => void}}
 * @throws {Error} FAIL-LOUD if `dispatch` is not a function.
 */
function makeInAppRpc(dispatch) {
    if (typeof dispatch !== 'function') {
        throw new Error('[shim/rpc] makeInAppRpc requires a dispatch function. (FAIL-LOUD.)');
    }
    return {
        call: function (fn, args) {
            try { return Promise.resolve(dispatch(fn, args)); }
            catch (e) { return Promise.reject(e); }
        },
        dispose: function () {}
    };
}

/**
 * makeChannelRpc(channel, opts) — cross-realm RPC over a `{post,subscribe}`
 * channel (see `makeWindowPostMessageChannel` for a ready-made one).
 * @param {{post: (msg:*) => void, subscribe: (handler:(msg:*)=>void) => (() => void)}} channel
 * @param {object} opts
 * @param {string} opts.tag — REQUIRED: a unique namespace for this RPC's wire traffic.
 * @param {number} [opts.callTimeoutMs=3000] — per-call timeout.
 * @returns {{call: (fn: string, args: any[]) => Promise<*>, dispose: () => void}}
 * @throws {Error} FAIL-LOUD if `channel` lacks post/subscribe, or `opts.tag` is missing.
 */
function makeChannelRpc(channel, opts) {
    opts = opts || {};
    if (!channel || typeof channel.post !== 'function' || typeof channel.subscribe !== 'function') {
        throw new Error('[shim/rpc] makeChannelRpc requires a channel with post/subscribe. (FAIL-LOUD.)');
    }
    var tag = opts.tag;
    if (!tag) {
        throw new Error('[shim/rpc] makeChannelRpc requires opts.tag (a unique namespace so ' +
            'multiple RPC users sharing one postMessage bus never collide). (FAIL-LOUD.)');
    }
    var timeoutMs = (typeof opts.callTimeoutMs === 'number' && opts.callTimeoutMs > 0) ? opts.callTimeoutMs : 3000;
    var pending = Object.create(null);
    var reqCounter = 0;
    var unsub = channel.subscribe(function (msg) {
        if (!msg || msg.__rpcTag !== tag || msg.type !== 'rpc:result') { return; }
        var p = pending[msg.reqId];
        if (!p) { return; }
        delete pending[msg.reqId];
        if (msg.error) { p.reject(new Error('[shim/rpc] remote: ' + msg.error)); }
        else { p.resolve(msg.value); }
    });
    return {
        call: function (fn, args) {
            return new Promise(function (resolve, reject) {
                var reqId = ++reqCounter;
                var timer = setTimeout(function () {
                    if (!pending[reqId]) { return; } // already settled by a real reply
                    delete pending[reqId];
                    reject(new Error('[shim/rpc] "' + fn + '" timed out after ' + timeoutMs +
                        'ms (tag "' + tag + '"). No responder installed on the other side? ' +
                        '(installRpcResponder)'));
                }, timeoutMs);
                pending[reqId] = {
                    resolve: function (v) { clearTimeout(timer); resolve(v); },
                    reject: function (e) { clearTimeout(timer); reject(e); }
                };
                channel.post({ __rpcTag: tag, type: 'rpc:call', reqId: reqId, fn: fn, args: args });
            });
        },
        dispose: function () { if (typeof unsub === 'function') { unsub(); } }
    };
}

/**
 * installRpcResponder(channel, dispatch, opts) — the REALM/receiving side.
 * @param {{post: Function, subscribe: Function}} channel
 * @param {(fn: string, args: any[]) => *} dispatch — may return a value or a Promise.
 * @param {object} opts
 * @param {string} opts.tag — MUST match the caller's `makeChannelRpc` tag.
 * @returns {() => void} unsubscribe function.
 * @throws {Error} FAIL-LOUD if `channel` lacks post/subscribe, or `opts.tag` is missing.
 */
function installRpcResponder(channel, dispatch, opts) {
    opts = opts || {};
    if (!channel || typeof channel.post !== 'function' || typeof channel.subscribe !== 'function') {
        throw new Error('[shim/rpc] installRpcResponder requires a channel with post/subscribe. (FAIL-LOUD.)');
    }
    if (typeof dispatch !== 'function') {
        throw new Error('[shim/rpc] installRpcResponder requires a dispatch function. (FAIL-LOUD.)');
    }
    var tag = opts.tag;
    if (!tag) {
        throw new Error('[shim/rpc] installRpcResponder requires opts.tag. (FAIL-LOUD.)');
    }
    return channel.subscribe(function (msg) {
        if (!msg || msg.__rpcTag !== tag || msg.type !== 'rpc:call') { return; }
        var reqId = msg.reqId;
        Promise.resolve().then(function () {
            return dispatch(msg.fn, msg.args);
        }).then(function (value) {
            channel.post({ __rpcTag: tag, type: 'rpc:result', reqId: reqId, value: value });
        }, function (e) {
            channel.post({
                __rpcTag: tag, type: 'rpc:result', reqId: reqId,
                error: (e && e.message) ? e.message : String(e)
            });
        });
    });
}

/**
 * makeWindowPostMessageChannel(targetWindow, opts) — a ready-made
 * `{post,subscribe}` channel over `window.postMessage`/`'message'` events,
 * scoped to one specific `targetWindow` (an iframe's `contentWindow`, or
 * `window.parent`) — messages from any OTHER source are ignored.
 * @param {Window} targetWindow — the window to post to / accept messages from.
 * @param {object} [opts]
 * @param {Window} [opts.selfWindow] — defaults to the global `window`.
 * @returns {{post: Function, subscribe: Function}}
 * @throws {Error} FAIL-LOUD if `targetWindow` or the self window is missing.
 */
function makeWindowPostMessageChannel(targetWindow, opts) {
    opts = opts || {};
    var selfWindow = opts.selfWindow || (typeof window !== 'undefined' ? window : null);
    if (!targetWindow) {
        throw new Error('[shim/rpc] makeWindowPostMessageChannel requires targetWindow. (FAIL-LOUD.)');
    }
    if (!selfWindow) {
        throw new Error('[shim/rpc] makeWindowPostMessageChannel requires a self window (pass ' +
            'opts.selfWindow outside a browser). (FAIL-LOUD.)');
    }
    return {
        post: function (msg) { targetWindow.postMessage(msg, '*'); },
        subscribe: function (handler) {
            var listener = function (ev) {
                if (ev.source !== targetWindow) { return; }
                handler(ev.data);
            };
            selfWindow.addEventListener('message', listener);
            return function () { selfWindow.removeEventListener('message', listener); };
        }
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    makeInAppRpc,
    makeChannelRpc,
    installRpcResponder,
    makeWindowPostMessageChannel
};
