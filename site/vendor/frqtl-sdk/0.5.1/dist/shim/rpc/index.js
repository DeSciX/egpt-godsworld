/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/rpc — the request/response call() primitive (WS gym-controls-as-sugar
 * Bite 3 Stage 2, Layer-A follow-up fix-loop; architect gate 5 charter —
 * "the reqId/pending/timeout request/response-call()-over-postMessage pattern
 * is promoted to a SHIM PRIMITIVE the moment a second consumer needs it").
 *
 * Peer of `lib/shim/controls`, `lib/shim/frame-data`, `lib/shim/expr/ast-schema`,
 * `lib/shim/page-params` — same file/export layout convention: a dual
 * CommonJS/`window` module, so both Node tests and plain `<script>`-loaded
 * experiment pages can consume it. UNLIKE those files, this one is consumed
 * from PAGE-CONTEXT sugar (`lib/frqtl/objects/objects/frqtl-controls-panel.js`)
 * — the exact reason it has **zero internal `import`/`export` syntax** (see
 * "Why this module exists" below for the concrete bug this fixes).
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
 * ── Why this module exists (the concrete bug it fixes) ──────────────────────
 *
 * `frqtl-controls-panel.js` (Layer A, WS gym-controls-as-sugar) originally
 * built this exact request/response protocol INLINE, importing
 * `lib/shim/notebook/` modules via real ES `import` statements — which
 * REQUIRED the panel file itself to become a genuine ES module (`.mjs`),
 * since a file with any `export`/`import` syntax cannot ALSO be a classic
 * `<script src>` or `require()`'d CommonJS (the Bite-3 fix-loop lesson).
 *
 * That worked in `node --test` (module resolution is filesystem-relative) but
 * 404'd in the REAL browser (tester round 6, verified via network capture):
 * an experiment page loads the panel under the `/frqtl` mount, which aliases
 * `lib/frqtl/` ONLY (`lib/server/mounts.js`) — `lib/shim/` has its OWN
 * separate `/lib/shim` mount. `../../../shim/notebook/realm-transport.js`
 * (correct as a DISK-relative path from `lib/frqtl/objects/objects/`) resolves
 * to `/shim/notebook/realm-transport.js` as a URL-relative path from
 * `/frqtl/objects/objects/frqtl-controls-panel.js` — a genuine 404, fatal to
 * the whole ES module graph (`window.FrqtlControlsPanel` never got defined).
 *
 * The fix is structural, not a path correction: PAGE-CONTEXT sugar living
 * under the `/frqtl` mount can NEVER ES-module-import anything under the
 * `/lib/shim` mount by a relative specifier (there is no relative path that
 * is correct on BOTH the filesystem, where Node resolves it, AND the served
 * URL namespace, where the browser resolves it — the two DIVERGE at the
 * mount boundary). The established, working mechanism for page-context sugar
 * to consume a shim contract is the ONE this module now also uses: a dual
 * CommonJS/`window` module with NO internal ES import/export syntax,
 * script-tag-loaded (`/lib/shim/rpc/index.js`, absolute path, off the SAME
 * `/lib/shim` mount every host shares), consumed via a named FAIL-LOUD
 * `_getShimRpc()`-style guard — exactly the `page-params`/`controls`
 * precedent. `frqtl-controls-panel.js` now consumes THIS module that way
 * (see its own file docstring) and imports NOTHING from `lib/shim` via ES
 * `import` — killing the entire bug class, not just this one instance of it.
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — the same wrapper every
//    game-layer object and renderer authority carries). This file loads in the
//    browser as a classic <script> from stack-boot.js, and classic scripts share ONE
//    global lexical environment: an unwrapped top-level `function _fail(...)` here
//    silently OVERWRITES a same-named helper in a sibling script (last loaded wins),
//    which is invisible to `node --test` by construction because Node gives each
//    require()d file its own module scope. Everything below is PRIVATE; the only
//    things that reach the shared scope are the explicit `module.exports` (CJS) /
//    `window.<Namespace>` (browser) assignments at the bottom — the file's dual-mode
//    export layout is unchanged. Enforced by
//    lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

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

var ShimRpc = {
    makeInAppRpc: makeInAppRpc,
    makeChannelRpc: makeChannelRpc,
    installRpcResponder: installRpcResponder,
    makeWindowPostMessageChannel: makeWindowPostMessageChannel
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShimRpc;
} else if (typeof window !== 'undefined') {
    window.ShimRpc = ShimRpc;
}

})();
