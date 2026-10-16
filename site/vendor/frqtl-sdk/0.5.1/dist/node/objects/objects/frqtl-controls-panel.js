/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-controls-panel.js — a placeable host for control collections
 * (WS gym-controls-as-sugar Bite 3 Stage 2, Layer A — the panel itself).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `exposeRegistry(registry, opts)` — REALM side. Call this on the experiment
 * page, once, after registering the page's OWN control descriptors into a
 * `makeControlRegistry()` instance (`lib/shim/controls/registry.js`, Bite 1).
 * Makes that registry (a) directly reachable in-app (`window._frqtlControlsRegistry`)
 * and (b) remotely drivable from a parent frame via `postMessage` (unless
 * `opts.crossFrame === false`).
 *
 * `mount(hostEl, opts)` — PANEL side. Renders one widget row per registered
 * control descriptor into `hostEl`, wired so driving a widget drives the
 * REAL registered control — either in the SAME window (`opts.mode:'in-app'`,
 * `opts.registry` a live registry instance) or across an `<iframe>`
 * (`opts.mode:'iframe'`, `opts.frame` the iframe element). Returns
 * `{ dispose(), ready }`.
 *
 * The panel is a COLLECTION HOST + transport plumbing — it renders no widget
 * itself: each row is handed to `frqtl-control-widgets.js`'s `mountWidget()`,
 * the ONE widget-resolution authority (which itself DELEGATES the slider to
 * `frqtl-control-slider.js`, the ONE slider implementation). The canvas overlay
 * consults the SAME table, so a widget decision is never made twice. The panel
 * supplies only transport-aware callbacks over its OWN handle
 * (`setControlValue` for a value write, `runControlAction` for an action verb)
 * — the widget lib knows nothing about registries, RPC, or transports.
 *
 * `mount` NEVER rebuilds or re-declares the target's controls — it is an
 * ADDITIONAL consumer of whatever was already registered via `exposeRegistry`
 * (the "declare once, consume everywhere" rule). The panel does not know or
 * care whether a descriptor's `onChange` writes through a capability/property
 * accessor (physics channel) or `runner.setRenderOption` (render channel) —
 * that distinction is baked into the descriptor's OWN `onChange` closure by
 * whoever declared it; the panel treats every descriptor uniformly (calls
 * `onChange`), which is exactly how the channel discriminator is "respected"
 * here — as authored metadata, never as a panel-side dispatch branch.
 *
 * ── Module format: CLASSIC dual CommonJS/window (matches its objects/objects/
 *    peers — Tube.js, LightSource.js, …), NOT a real ES module ─────────────
 *
 * This file was briefly a real ES module (`.mjs`) importing `lib/shim/
 * notebook/` modules directly — that WORKED in `node --test` (filesystem-relative resolution)
 * but 404'd in the real browser (tester round 6, verified via network
 * capture): the page loads this file under the `/frqtl` mount, which aliases
 * `lib/frqtl/` ONLY (`lib/server/mounts.js`) — `lib/shim/` has its OWN
 * separate `/lib/shim` mount. A relative specifier from
 * `lib/frqtl/objects/objects/` (correct on DISK) resolves to a DIFFERENT,
 * WRONG url when served under `/frqtl/objects/objects/` — there is no
 * relative path that is correct in BOTH namespaces at once. **Page-context
 * sugar living under a mount can never ES-module-import across a DIFFERENT
 * mount by a relative specifier — full stop.**
 *
 * The fix is structural: this file no longer imports ANYTHING from
 * `lib/shim` via ES `import`. It consumes the extracted RPC primitive
 * (`lib/shim/rpc/index.js`, itself a dual CommonJS/window module with ZERO
 * internal `import`/`export` syntax) the SAME way `fx-experiment.js`/
 * `render-boot.js`/`engine-boot.js` consume `lib/shim/page-params` and the
 * SAME way this directory's OTHER files consume `lib/shim/controls`: a named
 * FAIL-LOUD guard (`_getShimRpc()` below, mirroring `_getPageParams()`/
 * `_getControlsSchema()`) that resolves `window.ShimRpc` in the browser or
 * `require()`s the module directly in Node — never a relative ES import.
 * Being import/export-free again also means this file is back to being a
 * classic `<script src>` AND `require()`-able, matching every other file in
 * this directory — simpler for both the demo pages and the test suite than
 * the ESM detour ever needed to be.
 *
 * ── Transport wiring (the §2 ruling, applied via lib/shim/rpc) ──────────────
 *
 * Same-page (in-app) placement: `ShimRpc.makeInAppRpc(dispatch)` — direct
 * scripting, no postMessage marshaling (both sides are the SAME window).
 * Iframe placement (same- or cross-origin — the mechanism does not care
 * which): `ShimRpc.makeWindowPostMessageChannel` + `ShimRpc.makeChannelRpc`/
 * `installRpcResponder`. BOTH produce the SAME `{call(fn,args)->Promise,
 * dispose()}` shape — the render/wiring code below calls ONLY `handle.call
 * (fn, args)` and NEVER branches on which transport backs it (the
 * serializability discipline stays intact: `listControls`/`setControlValue`'s
 * wire payloads are plain id/label/min/max/step/value/valueText data, never a
 * live closure).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * This file adds ZERO physics. It is pure UI plumbing over an
 * ALREADY-DECLARED control array; moving a panel slider produces the
 * IDENTICAL simulation effect as moving the experiment page's own slider for
 * the same control id (proven by the Layer-A Rule-0 oracle: the
 * collision-matrix density/offset/angle sliders, driven from a panel beside
 * the canvas AND from a panel in a separate host page targeting an iframe).
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

// ── Node-side eager resolves (mirror lib/shim/controls/registry.js's
// _ControlsSchemaNode precedent) + a shared lazy FAIL-LOUD accessor —
// _getShimRpc() crosses the /frqtl↔/lib/shim mount boundary (require() is
// filesystem-only, so this carries none of the relative-ES-import risk);
// the widget-table/bind/action resolves are SAME-DIRECTORY siblings (no mount
// boundary at all, guarded only for a consistent named error). ──
var _ShimRpcNode = (typeof module !== 'undefined' && module.exports) ? require('../../../shim/rpc/index.js') : null;
var _ControlWidgetsNode = (typeof module !== 'undefined' && module.exports) ? require('./frqtl-control-widgets.js') : null;
var _ControlBindNode = (typeof module !== 'undefined' && module.exports) ? require('./controlBind.js') : null;
var _ControlActionNode = (typeof module !== 'undefined' && module.exports) ? require('./controlAction.js') : null;

function _getContract(nodeVal, windowKey, hint) {
    if (nodeVal) { return nodeVal; }
    if (typeof window !== 'undefined' && window[windowKey]) { return window[windowKey]; }
    throw new Error('[frqtl-controls-panel] window.' + windowKey + ' not available. ' + hint);
}
function _getShimRpc() {
    return _getContract(_ShimRpcNode, 'ShimRpc',
        'Ensure lib/shim/rpc/index.js is loaded before this panel (stack-boot.js\'s ENGINE array).');
}
function _getControlWidgets() {
    return _getContract(_ControlWidgetsNode, 'FrqtlControlWidgets',
        'Ensure lib/frqtl/objects/objects/frqtl-control-widgets.js is loaded before this panel.');
}
function _getControlAction() {
    return _getContract(_ControlActionNode, 'ControlAction',
        'Ensure lib/frqtl/objects/objects/controlAction.js is loaded before this panel.');
}
function _getControlBind() {
    return _getContract(_ControlBindNode, 'ControlBind',
        'Ensure lib/frqtl/objects/objects/controlBind.js is loaded before this panel.');
}

// Namespaces this panel's RPC traffic so it never collides with another RPC
// user sharing the same postMessage bus (lib/shim/rpc's opts.tag contract).
var RPC_TAG = 'frqtl-controls-panel';

/**
 * The SINGLE dispatch point for a controls-panel verb against a registry —
 * used IDENTICALLY by the in-app direct path and the RPC responder (DRY: one
 * implementation, not two that could drift).
 *
 * Verbs:
 *   listControls(name)             → Array<{id,label,min,max,step,value,valueText}>
 *   setControlValue(name,id,value) → {value, valueText}
 *
 * @param {object} registry — a makeControlRegistry() instance. Bind execution
 *   reads its bind context off `registry._controlBindCtx` (attached by
 *   `exposeRegistry`'s `opts.universe`/`opts.runner`/`opts.readSnapshot` —
 *   WS gym-controls-as-sugar FULL CONVERGENCE build) — attaching it to the
 *   registry itself (rather than threading a second parameter through here)
 *   means the in-app dispatch path (`_buildInAppHandle`, which is handed this
 *   SAME registry instance by `mount({mode:'in-app'})`) sees it for free,
 *   with no second signature change needed on `mount`/`_buildInAppHandle`.
 * @param {string} fn — 'listControls' | 'setControlValue'.
 * @param {Array} args — verb-specific positional args (name first, always).
 * @returns {*} plain, structured-clone-serializable data.
 * @throws {Error} FAIL-LOUD — unknown instance name (registry.getControls's
 *   own guard), unknown control id, an unrecognized verb, or (setControlValue)
 *   a descriptor with neither `onChange` nor `bind` reachable (structurally
 *   should not happen post-normalize — lib/shim/controls requires at least
 *   one — but dispatch never silently no-ops if it somehow does).
 */
function _dispatchControlsCall(registry, fn, args) {
    args = args || [];
    if (fn === 'listControls') {
        var name = args[0];
        var descs = registry.getControls(name); // FAIL-LOUD on unknown name
        var bindCtx0 = registry._controlBindCtx;
        return descs.map(function (d) {
            // Bind-based descriptors refresh from LIVE state before serializing —
            // this is what makes listControls a genuine PULL/reconciliation source
            // (frqtl-control-sync.js, WS gym-controls-as-sugar FULL CONVERGENCE
            // Stage ii) rather than a stale cache of the last WRITE. Per the
            // declared non-uniform get() contract (controlBind.js): Frame binds
            // read live; LargeObject/backdrop binds read the last TickData
            // snapshot (only if exposeRegistry's opts.readSnapshot was supplied);
            // render binds and onChange-only descriptors have NO read — a
            // `get()` of `undefined` is a DEFINED SKIP, so `d.value` (the last
            // known value) is kept, never overwritten with a fabricated read.
            // A get()-side wiring gap (e.g. ctx.universe present for writes but
            // missing the read accessor) degrades this ONE descriptor's refresh
            // to a no-op (keep the cached value) rather than failing the WHOLE
            // listing — logged, never silently swallowed. Structural bind
            // MISDECLARATION (bad bind.object/prop shape) still throws through
            // setControlValue's write path; this is a READ-side resilience
            // allowance only.
            if (d.bind && bindCtx0) {
                var ControlBind0 = _getControlBind();
                try {
                    var live = ControlBind0.resolveBind(d.bind, bindCtx0, d.channel).get();
                    if (live !== undefined) { d.value = live; }
                } catch (getErr) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[frqtl-controls-panel] listControls: live refresh failed for "' +
                            d.id + '" (kept cached value):', getErr);
                    }
                }
            }
            // The wire row carries the DECLARED presentation vocabulary too
            // (kind/widget/place/action) — all plain, structured-clone-serializable
            // data. Without it a host could not know a descriptor is a toggle, a
            // button, or canvas-PLACED, and would have to re-derive it (the
            // second-authority bug). Absent keys stay absent (a scalar slider row
            // is byte-identical to before).
            var row = {
                id: d.id, label: d.label, min: d.min, max: d.max, step: d.step,
                value: d.value,
                valueText: (typeof d.fmt === 'function') ? d.fmt(d.value) : String(d.value)
            };
            if (d.kind    !== undefined) { row.kind    = d.kind; }
            if (d.widget  !== undefined) { row.widget  = d.widget; }
            if (d.action  !== undefined) { row.action  = d.action; }
            if (d.values  !== undefined) { row.values  = d.values; }
            if (d.place   !== undefined) { row.place   = d.place; }
            return row;
        });
    }
    if (fn === 'runControlAction') {
        // The ACTION verb (presentation pass Item 2): resolve the descriptor by id,
        // then run it through the ONE objects-side executor (controlAction.js), which
        // maps the blessed action NAME to a live runner method. The dispatch point
        // stays single — every host (page button, panel, canvas overlay) arrives here.
        var nameA = args[0], idA = args[1];
        var descsA = registry.getControls(nameA);   // FAIL-LOUD on unknown name
        var hit = null;
        for (var a = 0; a < descsA.length; a++) { if (descsA[a].id === idA) { hit = descsA[a]; break; } }
        if (!hit) {
            throw new Error('[frqtl-controls-panel] runControlAction: unknown control id "' + idA +
                '" in "' + nameA + '" (registered: [' +
                descsA.map(function (c) { return c.id; }).join(', ') + ']). (FAIL-LOUD.)');
        }
        if (hit.kind !== 'action') {
            throw new Error('[frqtl-controls-panel] runControlAction("' + idA + '"): descriptor kind is "' +
                hit.kind + '", not "action". (FAIL-LOUD.)');
        }
        var ctxA = registry._controlBindCtx || {};
        _getControlAction().resolveAction(hit.action, { runner: ctxA.runner }).run();
        return { action: hit.action };
    }
    if (fn === 'setControlValue') {
        var name2 = args[0], id = args[1], value = args[2];
        var descs2 = registry.getControls(name2); // FAIL-LOUD on unknown name
        var match = null;
        for (var i = 0; i < descs2.length; i++) { if (descs2[i].id === id) { match = descs2[i]; break; } }
        if (!match) {
            throw new Error('[frqtl-controls-panel] setControlValue: unknown control id "' + id +
                '" in "' + name2 + '" (registered: [' +
                descs2.map(function (c) { return c.id; }).join(', ') + ']). (FAIL-LOUD.)');
        }
        match.value = value;
        // Write-authority dispatch (§5 converged ruling — "at least one of
        // {onChange, bind}", never neither): onChange wins if present (it may
        // coexist with a READ-only bind); otherwise bind.set() executes via
        // controlBind.js, routed through the universe/runner exposeRegistry
        // threaded in; a descriptor reaching here with NEITHER is a dead
        // control that should have been caught at normalize time — dispatch
        // THROWS rather than silently no-op (the bug this build fixes).
        if (typeof match.onChange === 'function') {
            match.onChange(value);
        } else if (match.bind) {
            var bindCtx = registry._controlBindCtx || {};
            var ControlBind = _getControlBind();
            var bound = ControlBind.resolveBind(match.bind, bindCtx, match.channel);
            bound.set(value);
        } else {
            throw new Error('[frqtl-controls-panel] setControlValue("' + id + '" in "' + name2 +
                '"): descriptor has neither "onChange" nor "bind" — this should be structurally ' +
                'impossible post-normalize (lib/shim/controls requires at least one). (FAIL-LOUD — ' +
                'never a silent no-op.)');
        }
        return { value: value, valueText: (typeof match.fmt === 'function') ? match.fmt(value) : String(value) };
    }
    throw new Error('[frqtl-controls-panel] unrecognized verb "' + String(fn) +
        '" (expected "listControls", "setControlValue" or "runControlAction"). (FAIL-LOUD.)');
}

/**
 * exposeRegistry(registry, opts) — REALM side (call on the experiment page).
 *
 * @param {object} registry — a makeControlRegistry() instance with its
 *   controls already registered (registerControls already called).
 * @param {object} [opts]
 * @param {boolean} [opts.crossFrame=true] — install the RPC responder so a
 *   parent frame's panel (mode:'iframe') can drive this page. Set false to
 *   expose in-app access only (e.g. a page with no host frame expected).
 * @param {object} [opts.universe] — the live EGPTUniverse (WS gym-controls-as-sugar
 *   FULL CONVERGENCE build, signature change): threaded into `controlBind.js`'s
 *   `resolveBind` ctx so a `bind`-only descriptor's `setControlValue` can route
 *   through `setFrameProperty`/`updateObjectProperty`. Required only if the
 *   page registers any bind-only (no `onChange`) physics-channel control.
 * @param {object} [opts.runner] — the FrqtlApp. Required only if the
 *   page registers any bind-only render-channel control (`runner.setRenderOption`).
 * @param {function} [opts.readSnapshot] — `(handle, kind, prop) => *|undefined`,
 *   the LargeObject/backdrop bind READ path (last `TickData.objects[handle]`
 *   snapshot) — see `controlBind.js`'s own docstring. Omitting it makes those
 *   binds' `get()` a defined skip (`undefined`), never a fabricated read.
 * @throws {Error} FAIL-LOUD if `registry` is not a registry instance.
 */
function exposeRegistry(registry, opts) {
    opts = opts || {};
    if (!registry || typeof registry.getControls !== 'function') {
        throw new Error('[frqtl-controls-panel] exposeRegistry requires a makeControlRegistry() ' +
            'instance (missing getControls). (FAIL-LOUD.)');
    }
    if (typeof window === 'undefined') {
        throw new Error('[frqtl-controls-panel] exposeRegistry requires a browser window. (FAIL-LOUD.)');
    }
    // In-app direct access point — a same-window panel (mode:'in-app') is
    // handed this SAME registry instance by the caller; this global is a
    // diagnostic/discovery convenience, not itself part of the call path.
    window._frqtlControlsRegistry = registry;

    // Bind-execution context (WS gym-controls-as-sugar FULL CONVERGENCE build):
    // attached to the registry INSTANCE (not a fresh object, not a second
    // parameter threaded through mount()/_buildInAppHandle) so BOTH dispatch
    // paths — the in-app direct call (which is handed this SAME registry
    // instance by mount({mode:'in-app'})) and the cross-frame RPC responder
    // below — resolve the identical universe/runner/readSnapshot via
    // `registry._controlBindCtx` inside `_dispatchControlsCall`. `registry`
    // itself doubles as `controlBind.js`'s `ctx.registry` (the SAME
    // makeControlRegistry() instance unifies the objects catalog
    // getObject/getObjectKind with the controls catalog — no second registry
    // object needed).
    registry._controlBindCtx = {
        registry: registry,
        universe: opts.universe,
        runner: opts.runner,
        readSnapshot: opts.readSnapshot
    };

    if (opts.crossFrame === false) { return; }
    if (!window.parent || window.parent === window) { return; } // not framed — nothing to respond to

    var ShimRpc = _getShimRpc();
    var channel = ShimRpc.makeWindowPostMessageChannel(window.parent, { selfWindow: window });
    ShimRpc.installRpcResponder(channel, function (fn, args) {
        return _dispatchControlsCall(registry, fn, args);
    }, { tag: RPC_TAG });
}

/** Build the in-app RPC handle: `call()` dispatches directly, no round-trip. */
function _buildInAppHandle(registry) {
    return _getShimRpc().makeInAppRpc(function (fn, args) { return _dispatchControlsCall(registry, fn, args); });
}

/**
 * Build the iframe RPC handle: `call()` marshals over postMessage.
 * @param {HTMLIFrameElement} frame
 * @param {number} [callTimeoutMs] — override for tests only (production
 *   callers use lib/shim/rpc's own 3s default; see `mount`'s `opts.callTimeoutMs`).
 */
function _buildIframeHandle(frame, callTimeoutMs) {
    if (!frame || !frame.contentWindow) {
        throw new Error('[frqtl-controls-panel] mount({mode:"iframe"}) requires opts.frame — an ' +
            '<iframe> element with a live contentWindow. (FAIL-LOUD — missing transport.)');
    }
    var ShimRpc = _getShimRpc();
    var channel = ShimRpc.makeWindowPostMessageChannel(frame.contentWindow);
    var rpcOpts = { tag: RPC_TAG };
    if (typeof callTimeoutMs === 'number' && callTimeoutMs > 0) { rpcOpts.callTimeoutMs = callTimeoutMs; }
    return ShimRpc.makeChannelRpc(channel, rpcOpts);
}

/**
 * mount(hostEl, opts) — PANEL side.
 *
 * @param {HTMLElement} hostEl — the div to render controls into.
 * @param {object} opts
 * @param {'in-app'|'iframe'} opts.mode
 * @param {string} opts.name — the registry instance name `exposeRegistry`'s
 *   registry registered its controls under (e.g. 'collision-matrix').
 * @param {object} [opts.registry] — REQUIRED for `mode:'in-app'`: the SAME
 *   registry instance the target page's `exposeRegistry(registry)` call used
 *   (same window — read via `window._frqtlControlsRegistry` if the caller
 *   does not already hold a reference).
 * @param {HTMLIFrameElement} [opts.frame] — REQUIRED for `mode:'iframe'`.
 * @param {number} [opts.callTimeoutMs] — `mode:'iframe'` only: override the
 *   default 3s per-call timeout (tests only; production callers should not
 *   need this).
 * @returns {{dispose: () => void, ready: Promise<void>}} `ready` resolves once
 *   the initial control list has rendered, or rejects if the target was not
 *   yet reachable (e.g. an iframe target still booting) — a caller MAY
 *   `dispose()` and retry `mount()` on rejection (Layer A has no built-in
 *   readiness handshake/retry).
 * @throws {Error} FAIL-LOUD on a missing host element, missing `opts.name`,
 *   an unrecognized `opts.mode`, or a missing transport target
 *   (`opts.registry`/`opts.frame` per mode).
 */
function mount(hostEl, opts) {
    opts = opts || {};
    if (!hostEl) {
        throw new Error('[frqtl-controls-panel] mount requires a host element. (FAIL-LOUD.)');
    }
    if (!opts.name) {
        throw new Error('[frqtl-controls-panel] mount requires opts.name (the registry instance ' +
            'name registered via exposeRegistry). (FAIL-LOUD.)');
    }

    var handle;
    if (opts.mode === 'in-app') {
        if (!opts.registry) {
            throw new Error('[frqtl-controls-panel] mount({mode:"in-app"}) requires opts.registry ' +
                '(the SAME registry instance exposeRegistry() was called with). (FAIL-LOUD.)');
        }
        handle = _buildInAppHandle(opts.registry);
    } else if (opts.mode === 'iframe') {
        handle = _buildIframeHandle(opts.frame, opts.callTimeoutMs);
    } else {
        throw new Error('[frqtl-controls-panel] mount: opts.mode must be "in-app" or "iframe"; got ' +
            JSON.stringify(opts.mode) + '. (FAIL-LOUD.)');
    }

    var name = opts.name;
    hostEl.classList.add('frqtl-controls-panel');

    // Rendering is delegated ENTIRELY to frqtl-control-slider.js (Bite 3
    // Stage 2 Layer B: "panel = collection host + transport plumbing;
    // control lib = the widget") — this closure supplies ONLY the
    // transport-aware onInput, reusing the SAME `handle.call(...)` this
    // file already builds for either placement mode.
    function renderRows(descs) {
        hostEl.innerHTML = '';
        var Widgets = _getControlWidgets();
        descs.forEach(function (d) {
            Widgets.mountWidget(hostEl, {
                initial: d,
                onInput:  function (v) { return handle.call('setControlValue', [name, d.id, v]); },
                onAction: function () { return handle.call('runControlAction', [name, d.id]); }
            });
        });
    }

    // `ready` lets a host (e.g. an iframe-mode caller mounting before the
    // target page has finished booting its engine/renderer and reached its
    // own exposeRegistry() call — there is no built-in readiness handshake
    // in Layer A) detect a failed initial fetch and retry by disposing this
    // handle and calling mount() again. Rejecting here does NOT throw
    // synchronously — mount() itself never fails merely because the target
    // isn't ready yet; only a genuinely malformed call (FAIL-LOUD above)
    // throws synchronously.
    var ready = handle.call('listControls', [name]).then(function (descs) {
        renderRows(descs);
    }).catch(function (e) {
        hostEl.textContent = '[frqtl-controls-panel] failed to load "' + name + '": ' +
            (e && e.message ? e.message : String(e));
        if (typeof console !== 'undefined' && console.error) { console.error(e); }
        throw e;
    });

    return {
        ready: ready,
        dispose: function () {
            handle.dispose();
            hostEl.innerHTML = '';
        }
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

// `dispatch` publicly exposes the SAME single dispatch point the in-app path
// and the RPC responder already share (WS gym-controls-as-sugar FULL
// CONVERGENCE build) — its THIRD consumer is `frqtl-control-sync.js`'s in-app
// pull path (`registry` mode), which reuses `dispatch(registry, 'listControls',
// [name])` rather than re-deriving a parallel listing implementation, and its
// FOURTH is `frqtl-control-overlay.js` (the canvas overlay, presentation pass
// Item 2) — every overlay write and every overlay action verb routes through
// THIS function, so the overlay adds no parallel write authority.
var FrqtlControlsPanel = { exposeRegistry: exposeRegistry, mount: mount, dispatch: _dispatchControlsCall };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrqtlControlsPanel;
} else if (typeof window !== 'undefined') {
    window.FrqtlControlsPanel = FrqtlControlsPanel;
}

})();
