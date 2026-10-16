/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-control-slider.js — the SINGLE scalar-control widget
 * (WS gym-controls-as-sugar Bite 3 Stage 2, Layer B).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `mount(hostEl, opts) → { dispose() }` renders ONE slider+label+value row
 * (appended into `hostEl`, a parent container — multiple sliders may share
 * one `hostEl`, each disposable independently) from a normalized `kind:
 * 'scalar'` descriptor's DISPLAY shape (`{id,label,min,max,step,value,
 * valueText}` — the SAME serializable shape `lib/shim/rpc`'s dispatch and
 * `frqtl-controls-panel.js`'s `listControls`/`setControlValue` already
 * produce). Dragging the slider calls back into the caller, which decides
 * HOW the value gets applied:
 *
 *   `opts.descriptor` — a LIVE, normalized descriptor object
 *     (`{id,label,min,max,step,value,fmt,onChange}`) in the SAME window.
 *     The STANDALONE in-app path: the widget mutates `descriptor.value` and
 *     calls `descriptor.onChange(value)` DIRECTLY — no transport, no RPC,
 *     the same-realm case.
 *
 *   `opts.initial` + `opts.onInput` — the DECOUPLED path: `opts.initial` is
 *     the display-shape descriptor above; `opts.onInput(value)` is called on
 *     drag and may return a plain `{value,valueText}` OR a
 *     `Promise<{value,valueText}>` — the widget awaits either uniformly and
 *     refreshes the displayed value/text from whatever settles. This is the
 *     REMOTE path: the caller supplies an `onInput` that dispatches however
 *     it needs to (e.g. `frqtl-controls-panel.js` passes
 *     `function(v){ return handle.call('setControlValue',[name,d.id,v]); }`,
 *     reusing its OWN `lib/shim/rpc`-backed transport handle) — this widget
 *     itself knows NOTHING about registries, RPC, or transports; it is
 *     PURELY the rendering/wiring widget (the architectural point of this
 *     layer: "panel = collection host + transport plumbing; control lib =
 *     the widget").
 *
 * Exactly one of `opts.descriptor` OR (`opts.initial` + `opts.onInput`) is
 * required — FAIL-LOUD otherwise.
 *
 * ── DRY discipline (the architectural point of Layer B) ──────────────────────
 *
 * Before this layer, `frqtl-controls-panel.js` built slider+label+value DOM
 * internally (one implementation). This file is now THE ONE slider-rendering
 * implementation; `frqtl-controls-panel.js` REFACTORED to call `mount()` here
 * once per `kind:'scalar'` descriptor instead of building rows itself — see
 * that file's own `renderRows` for the (now much smaller) call site. No
 * behavior change to the panel's public API or its two demo placements.
 *
 * ── Module format: CLASSIC dual CommonJS/window ─────────────────────────────
 *
 * Same convention as every other file in this directory (Tube.js,
 * Tube.js, `frqtl-controls-panel.js`) — no `import`/`export` syntax, so it
 * loads via a plain `<script src>` tag AND via Node `require()`. This file
 * has NO dependency on `lib/shim` at all (it does not touch registries,
 * `ShimRpc`, or any contract module) — it is pure DOM plumbing over caller-
 * supplied data, so the mount-boundary class of bug (`lib/frqtl` under
 * `/frqtl` cannot relatively ES-import `lib/shim` under `/lib/shim` — see
 * `frqtl-controls-panel.js`'s own file docstring) does not even arise here.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * This file adds ZERO physics — pure UI plumbing over a caller-supplied
 * descriptor/callback. Moving this slider produces the IDENTICAL simulation
 * effect as moving any other consumer of the same declared-once control
 * (proven by the Layer-B Rule-0 oracle: collision-matrix's `angle` control
 * driven simultaneously by its own page slider, the panel's slider, and a
 * standalone `frqtl-control-slider` instance — all three the SAME CONTROLS
 * array entry).
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

/**
 * mount(hostEl, opts) — render one slider+label+value row into `hostEl`.
 *
 * @param {HTMLElement} hostEl — parent container to append the row into.
 * @param {object} opts
 * @param {object} [opts.descriptor] — a LIVE, normalized descriptor
 *   `{id,label,min,max,step,value,fmt,onChange}` — the in-app direct path.
 * @param {{id:string,label:string,min:number,max:number,step:number,
 *   value:number,valueText:string}} [opts.initial] — REQUIRED when
 *   `opts.descriptor` is absent: the initial serializable display state.
 * @param {(value:number) => (*|Promise<{value:number,valueText:string}>)} [opts.onInput] —
 *   REQUIRED when `opts.descriptor` is absent: called with the new numeric
 *   value on drag; its (possibly-Promised) return refreshes the displayed
 *   value/text.
 * @returns {{dispose: () => void, setValue: (value:number, valueText?:string) => void}}
 *   `setValue` (WS gym-controls-as-sugar FULL CONVERGENCE build, Stage ii item 5
 *   — the `ControlSync` reconciliation target) is DISPLAY-ONLY: it writes the
 *   slider's `.value` DOM property and the value label directly and NEVER
 *   fires `onInput`/`onChange` (setting an `<input>`'s `.value` property does
 *   not dispatch a synthetic `input` event — only genuine user interaction
 *   does; hard-tested via a spy in `frqtl-control-slider.test.mjs`). This is
 *   what makes N concurrent widgets reconcilable without an echo/feedback
 *   loop: `ControlSync` calls `setValue()` to REFLECT canonical state, which
 *   can never itself re-trigger a write.
 * @throws {Error} FAIL-LOUD on a missing host element, or when neither
 *   `opts.descriptor` nor both of `opts.initial`/`opts.onInput` are supplied.
 */
function mount(hostEl, opts) {
    opts = opts || {};
    if (!hostEl) {
        throw new Error('[frqtl-control-slider] mount requires a host element. (FAIL-LOUD.)');
    }

    var initial, onInput;
    if (opts.descriptor) {
        var d = opts.descriptor;
        if (!d.id || typeof d.min !== 'number' || typeof d.max !== 'number' || typeof d.step !== 'number') {
            throw new Error('[frqtl-control-slider] mount({descriptor}) requires a normalized ' +
                'scalar descriptor with id/min/max/step. (FAIL-LOUD.)');
        }
        // A bind-only descriptor (no onChange) has NO write path this widget can
        // execute — this file deliberately has zero dependency on registries/
        // controlBind.js (Layer B: "the widget knows nothing about transports").
        // Dragging it would otherwise silently do nothing (the exact class of
        // bug WS gym-controls-as-sugar FULL CONVERGENCE fixed in the panel).
        // Route a bind-only descriptor through frqtl-controls-panel.js instead
        // (mode:'in-app'/'iframe', which DOES resolve bind execution), or mount
        // this widget via the opts.initial/onInput decoupled path with onInput
        // calling the panel's dispatch/RPC directly.
        if (typeof d.onChange !== 'function' && d.bind) {
            throw new Error('[frqtl-control-slider] mount({descriptor}) was given a bind-only ' +
                'descriptor (id "' + d.id + '", no onChange) — the standalone opts.descriptor path ' +
                'has no bind-execution context and cannot write it. Use frqtl-controls-panel.js\'s ' +
                'mount() instead, or mount this widget via opts.initial + opts.onInput with onInput ' +
                'calling the panel\'s dispatch/RPC. (FAIL-LOUD — never a silent no-op on drag.)');
        }
        initial = {
            id: d.id, label: d.label, min: d.min, max: d.max, step: d.step, value: d.value,
            valueText: (typeof d.fmt === 'function') ? d.fmt(d.value) : String(d.value)
        };
        onInput = function (v) {
            d.value = v;
            if (typeof d.onChange === 'function') { d.onChange(v); }
            return { value: v, valueText: (typeof d.fmt === 'function') ? d.fmt(v) : String(v) };
        };
    } else {
        if (!opts.initial || typeof opts.onInput !== 'function') {
            throw new Error('[frqtl-control-slider] mount requires EITHER opts.descriptor OR ' +
                'BOTH opts.initial and opts.onInput. (FAIL-LOUD.)');
        }
        initial = opts.initial;
        onInput = opts.onInput;
    }

    var row = document.createElement('div');
    row.className = 'frqtl-control-slider-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;font:12px sans-serif;color:#ccc;';

    var labelEl = document.createElement('span');
    labelEl.textContent = initial.label + ':';
    labelEl.style.cssText = 'min-width:56px;';

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = initial.min; slider.max = initial.max; slider.step = initial.step; slider.value = initial.value;
    slider.setAttribute('data-frqtl-control-id', initial.id);

    var valEl = document.createElement('span');
    valEl.textContent = initial.valueText;
    valEl.style.cssText = 'min-width:32px;text-align:right;color:#ffb450;';

    slider.addEventListener('input', function () {
        var v = parseFloat(slider.value);
        Promise.resolve(onInput(v)).then(function (result) {
            if (result && result.valueText !== undefined) { valEl.textContent = result.valueText; }
        }).catch(function (e) {
            valEl.textContent = 'ERR';
            if (typeof console !== 'undefined' && console.error) {
                console.error('[frqtl-control-slider] onInput failed:', e);
            }
        });
    });

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(valEl);
    hostEl.appendChild(row);

    // Fallback formatter for setValue()'s optional valueText: the descriptor
    // path still has a live `d.fmt`; the decoupled (opts.initial/onInput) path
    // has no formatter at all (only the ORIGINAL initial.valueText), so
    // setValue() callers on that path should pass valueText explicitly —
    // String(v) is the honest default, never a fabricated format.
    var formatFallback = (opts.descriptor && typeof opts.descriptor.fmt === 'function')
        ? opts.descriptor.fmt
        : function (v) { return String(v); };

    return {
        dispose: function () {
            if (row.parentNode) { row.parentNode.removeChild(row); }
        },
        // Display-only reconciliation write — see the @returns docstring above
        // for the no-loop invariant this depends on.
        setValue: function (value, valueText) {
            slider.value = value;
            valEl.textContent = (valueText !== undefined) ? valueText : formatFallback(value);
        }
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

var FrqtlControlSlider = { mount: mount };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrqtlControlSlider;
} else if (typeof window !== 'undefined') {
    window.FrqtlControlSlider = FrqtlControlSlider;
}

})();
