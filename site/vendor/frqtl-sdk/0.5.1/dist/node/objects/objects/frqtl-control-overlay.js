/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-control-overlay.js — THE canvas control overlay (presentation pass Item 2).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `FrqtlControlOverlay.mount(runner, opts)` →
 *      `{ dispose(), refresh(), controls: string[] }`
 *
 *   runner         — the scene's runner. The overlay mounts through its ONE door,
 *                    `runner.controlHost` (the canvas wrapper by default; an element a
 *                    hosting pane owns above its own overlays when one is set — and it
 *                    MOVES there when a host is set later). Its nodes are created in that
 *                    host's ownerDocument. A scene never names a DOM id.
 *   opts.registry  — the SAME `makeControlRegistry()` instance the page passed to
 *                    `FrqtlControlsPanel.exposeRegistry` (REQUIRED).
 *   opts.name      — the registry instance name the controls were registered under.
 *
 * Only descriptors carrying a `place: {x,y,anchor}` are drawn (the shim owns that
 * shape). Everything else stays panel-only, so adding an overlay to a page never
 * changes what its panels show.
 *
 * ── One write path, one widget table, one placement authority ───────────────
 *
 * Every write routes through `FrqtlControlsPanel.dispatch` — the exported single
 * dispatch point (this overlay is its FOURTH consumer, after the in-app path, the
 * RPC responder and frqtl-control-sync). There is NO second binding path here:
 * a value write is `setControlValue`, an action is `runControlAction`, exactly as
 * the panel does. Widgets come from the ONE widget table
 * (`frqtl-control-widgets.js`), and live-state reconciliation from
 * `frqtl-control-sync.js` — so a placed toggle's checked state DERIVES from live
 * state (truth-in-labelling) instead of drifting after a change made elsewhere.
 *
 * ── An HTML overlay is the ONE mechanism for BOTH renderers ─────────────────
 *
 * p5's DOM helpers (createButton/createSlider) are deliberately NOT used: a
 * p5-only convenience would be a per-renderer fork of the control surface (three
 * has no equivalent) — i.e. renderer-sniffing above the shim. One absolutely-
 * positioned `<div>` over the canvas parent works identically under both
 * providers and under any BYO renderer, because it never touches the canvas.
 *
 * ── Layer 2: physics behaviour ──────────────────────────────────────────────
 *
 * ZERO physics. The overlay is screen-space DOM over an already-declared control
 * array; driving a control here produces the IDENTICAL simulation effect as
 * driving the same declared control from the page's own slider or the GYM panel
 * (the declare-once oracle).
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

var _ControlsPanelNode = (typeof module !== 'undefined' && module.exports) ? require('./frqtl-controls-panel.js') : null;
var _ControlWidgetsNode = (typeof module !== 'undefined' && module.exports) ? require('./frqtl-control-widgets.js') : null;
var _ControlSyncNode = (typeof module !== 'undefined' && module.exports) ? require('./frqtl-control-sync.js') : null;

function _contract(nodeVal, windowKey, hint) {
    if (nodeVal) { return nodeVal; }
    if (typeof window !== 'undefined' && window[windowKey]) { return window[windowKey]; }
    throw new Error('[frqtl-control-overlay] window.' + windowKey + ' not available. ' + hint);
}
function _getPanel() {
    return _contract(_ControlsPanelNode, 'FrqtlControlsPanel',
        'Ensure lib/frqtl/objects/objects/frqtl-controls-panel.js is loaded before this overlay.');
}
function _getWidgets() {
    return _contract(_ControlWidgetsNode, 'FrqtlControlWidgets',
        'Ensure lib/frqtl/objects/objects/frqtl-control-widgets.js is loaded before this overlay.');
}
function _getSync() {
    return _contract(_ControlSyncNode, 'FrqtlControlSync',
        'Ensure lib/frqtl/objects/objects/frqtl-control-sync.js is loaded before this overlay.');
}

/** Translate a normalized `place` into absolute CSS on the overlay child. */
function _applyPlace(el, place) {
    var xPct = (place.x * 100) + '%';
    var yPct = (place.y * 100) + '%';
    var anchor = place.anchor || 'top-left';
    el.style.position = 'absolute';
    if (anchor === 'top-left')     { el.style.left = xPct;  el.style.top = yPct; }
    if (anchor === 'top-right')    { el.style.right = xPct; el.style.top = yPct; }
    if (anchor === 'bottom-left')  { el.style.left = xPct;  el.style.bottom = yPct; }
    if (anchor === 'bottom-right') { el.style.right = xPct; el.style.bottom = yPct; }
}

/**
 * mount(runner, opts) — draw every PLACE-bearing control over the canvas, through
 * `runner.controlHost`.
 * @returns {{dispose:Function, refresh:Function, controls:string[]}}
 * @throws {Error} FAIL-LOUD on a non-runner, a runner with no control host yet, a missing
 *   registry or name.
 */
function mount(runner, opts) {
    opts = opts || {};
    if (!runner || typeof runner.addControlChrome !== 'function' || !('controlHost' in runner)) {
        throw new Error('[frqtl-control-overlay] mount(runner, opts) takes the scene\'s RUNNER — the overlay ' +
            'mounts through its one door, runner.controlHost (a scene never names a DOM id). (FAIL-LOUD.)');
    }
    var canvasParentEl = runner.controlHost;
    if (!canvasParentEl) {
        throw new Error('[frqtl-control-overlay] runner.controlHost is null — the scene canvas is not mounted ' +
            'and no hosting pane set a host (check runner.controlHost before mounting). (FAIL-LOUD.)');
    }
    if (!opts.registry || typeof opts.registry.getControls !== 'function') {
        throw new Error('[frqtl-control-overlay] mount requires opts.registry — the SAME ' +
            'makeControlRegistry() instance the page exposed. (FAIL-LOUD.)');
    }
    if (!opts.name) {
        throw new Error('[frqtl-control-overlay] mount requires opts.name (the registry instance ' +
            'name the controls were registered under). (FAIL-LOUD.)');
    }

    var Panel = _getPanel();
    var Widgets = _getWidgets();
    var registry = opts.registry;
    var name = opts.name;

    // The overlay root: pointer-events NONE so the canvas keeps its own mouse/drag
    // handling everywhere except directly on a widget (which re-enables them).
    var doc = canvasParentEl.ownerDocument;   // nodes live in the HOST's document
    var root = doc.createElement('div');
    root.className = 'frqtl-control-overlay';
    root.setAttribute('data-role', 'frqtl-control-overlay');
    root.style.cssText = 'position:absolute;pointer-events:none;z-index:12;';
    // The parent must establish a positioning context for the absolute children.
    var prevPos = canvasParentEl.style.position;
    if (!prevPos || prevPos === 'static') { canvasParentEl.style.position = 'relative'; }
    canvasParentEl.appendChild(root);

    /**
     * Size the root to the CANVAS box, not the parent's. `place` is defined as
     * fractions OF THE CANVAS, so the overlay must match the drawing surface — a
     * parent with padding/toolbars is taller, which pushed a y:0.03 control above
     * the canvas top edge (measured in the realm). Falls back to filling the parent
     * when no canvas exists yet (the renderer creates it asynchronously); re-sync
     * happens on resize and on every refresh().
     */
    function sizeToCanvas() {
        var cv = (typeof canvasParentEl.querySelector === 'function')
            ? canvasParentEl.querySelector('canvas') : null;
        if (cv) {
            root.style.left   = cv.offsetLeft + 'px';
            root.style.top    = cv.offsetTop + 'px';
            root.style.width  = cv.offsetWidth + 'px';
            root.style.height = cv.offsetHeight + 'px';
        } else {
            root.style.left = '0'; root.style.top = '0';
            root.style.width = '100%'; root.style.height = '100%';
        }
    }
    sizeToCanvas();
    var onResize = function () { sizeToCanvas(); };
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', onResize);
    }

    // Live-state reconciliation: a placed widget REFLECTS canonical state (a pause
    // toggle flipped from the page's own button updates here too).
    var sync = _getSync().makeControlSync({ name: name, registry: registry, trigger: 'manual' });

    var mounted = [];   // [{ id, widget, cell }]

    function clear() {
        mounted.forEach(function (m) { m.widget.dispose(); if (m.cell.parentNode) { m.cell.parentNode.removeChild(m.cell); } });
        mounted = [];
    }

    /** (Re)build the overlay from the CURRENT descriptor list. */
    function refresh() {
        clear();
        sizeToCanvas();
        // The wire rows come from the ONE dispatch point (never a direct registry
        // read), so the overlay sees exactly what every other host sees.
        var rows = Panel.dispatch(registry, 'listControls', [name]);
        rows.forEach(function (row) {
            if (!row.place) { return; }   // panel-only descriptor — not ours to draw
            var cell = doc.createElement('div');
            cell.className = 'frqtl-control-overlay-cell';
            cell.setAttribute('data-frqtl-overlay-control', row.id);
            cell.style.cssText = 'pointer-events:auto;background:rgba(12,18,28,0.72);border:1px solid #33405a;' +
                'border-radius:4px;padding:2px 8px;backdrop-filter:blur(2px);';
            _applyPlace(cell, row.place);
            root.appendChild(cell);
            var w = Widgets.mountWidget(cell, {
                initial: row,
                onInput:  function (v) { return Panel.dispatch(registry, 'setControlValue', [name, row.id, v]); },
                onAction: function () {
                    var r = Panel.dispatch(registry, 'runControlAction', [name, row.id]);
                    // A run-loop verb can change other controls' live state (a restart
                    // resets a paused toggle) — reconcile right after.
                    sync.pull();
                    return r;
                }
            });
            sync.register(row.id, w);
            mounted.push({ id: row.id, widget: w, cell: cell });
        });
        return mounted.map(function (m) { return m.id; });
    }

    var ids = refresh();

    // Through the door: a host set LATER (a hosting pane) moves this overlay above its overlays.
    var unhost = runner.addControlChrome({
        rehost: function (el) {
            if (el === canvasParentEl) { return; }
            unhost();
            if (root.parentNode) { root.parentNode.removeChild(root); }
            canvasParentEl.style.position = prevPos;
            canvasParentEl = el;
            doc = el.ownerDocument;
            prevPos = el.style.position;
            if (!prevPos || prevPos === 'static') { el.style.position = 'relative'; }
            el.appendChild(root);
            sizeToCanvas();
        }
    });

    return {
        controls: ids,
        refresh: refresh,
        /** Pull live state into every placed widget (truth-in-labelling). */
        sync: function () { return sync.pull(); },
        dispose: function () {
            clear();
            sync.dispose();
            if (typeof window !== 'undefined' && window.removeEventListener) {
                window.removeEventListener('resize', onResize);
            }
            if (root.parentNode) { root.parentNode.removeChild(root); }
            canvasParentEl.style.position = prevPos;
        }
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

var FrqtlControlOverlay = { mount: mount };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrqtlControlOverlay;
} else if (typeof window !== 'undefined') {
    window.FrqtlControlOverlay = FrqtlControlOverlay;
}

})();
