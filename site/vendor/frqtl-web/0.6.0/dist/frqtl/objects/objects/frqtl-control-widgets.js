/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-control-widgets.js — THE widget table (presentation pass Item 2).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `resolveWidget(row)` → a widget NAME, from the kind-orthogonal `widget` seam
 *   the schema owns (`ControlsSchema.WIDGETS`), falling back to the kind's
 *   natural widget. This is the ONE place that decision is made.
 *
 * `mountWidget(hostEl, opts)` → `{ dispose(), setValue(value, valueText?) }`
 *   — renders ONE control row, dispatching on `resolveWidget`. Every host (the
 *   collection PANEL, the canvas OVERLAY) calls THIS; there is no second
 *   widget-resolution authority anywhere.
 *
 *   opts.initial  — the serializable display row `{id,label,kind,widget,value,
 *                   valueText,min,max,step,action,values}` (exactly what
 *                   `FrqtlControlsPanel.dispatch(…, 'listControls', …)` returns).
 *   opts.onInput  — `(value) => *|Promise<{value,valueText}>` for value widgets.
 *   opts.onAction — `(actionName) => *|Promise<*>` for the `button` widget.
 *
 * ── DRY: the slider is DELEGATED, never re-implemented ───────────────────────
 *
 * `slider` hands straight to `frqtl-control-slider.js` — the ONE slider-rendering
 * implementation, unchanged. This table adds only the widgets that did not exist:
 * toggle/checkbox (a scalar 0/1 rendered as a switch — NOT a new kind, per the
 * schema's rule), text (the string kind), and button (the action kind).
 * `frqtl-controls-panel.js`'s renderRows consults THIS table instead of hardcoding
 * the slider, so a second resolution authority never comes into existence.
 *
 * ── Layer 2: physics behaviour ──────────────────────────────────────────────
 *
 * ZERO physics — pure DOM plumbing over a caller-supplied row + callback. Driving
 * a control through any widget in this table produces the IDENTICAL simulation
 * effect as driving the same declared control anywhere else.
 */

import * as _ControlsSchemaNode from '../../../shim/controls/index.js';
import { FrqtlControlSlider as _ControlSliderNode } from './frqtl-control-slider.js';





/**
 * WIDGET_BY_KIND — each control kind's NATURAL widget, used when a descriptor
 * declares no explicit `widget`. Kinds with their own bespoke host UI
 * (camera/matrix/loop) have no row: they are not rendered by this table.
 */
var WIDGET_BY_KIND = Object.freeze({
    scalar: 'slider',
    text:   'text',
    action: 'button'
});

/**
 * resolveWidget(row) — the ONE widget decision. An explicit `widget` (validated
 * against ControlsSchema.WIDGETS by the schema owner) wins; otherwise the kind's
 * natural widget; otherwise 'slider' (the historical default — every pre-Item-2
 * row the panel rendered was a scalar slider, so this keeps them byte-identical).
 * @param {object} row
 * @returns {string} a ControlsSchema.WIDGETS member.
 */
function resolveWidget(row) {
    var WIDGETS = _ControlsSchemaNode.WIDGETS;
    if (row && row.widget) {
        if (WIDGETS.indexOf(row.widget) === -1) {
            throw new Error('[frqtl-control-widgets] unknown widget "' + row.widget + '" on control "' +
                (row.id || '?') + '" — must be one of [' + WIDGETS.join(', ') + ']. (FAIL-LOUD.)');
        }
        return row.widget;
    }
    return (row && WIDGET_BY_KIND[row.kind]) || 'slider';
}

// ── Row chrome shared by the non-slider widgets ─────────────────────────────

function _row() {
    var el = document.createElement('div');
    el.className = 'frqtl-control-widget-row';
    el.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;font:12px sans-serif;color:#ccc;';
    return el;
}
function _label(text) {
    var el = document.createElement('span');
    el.textContent = text;
    el.style.cssText = 'min-width:56px;';
    return el;
}
function _settle(promiseLike, onValue, onError) {
    Promise.resolve(promiseLike).then(onValue).catch(function (e) {
        if (onError) { onError(e); }
        if (typeof console !== 'undefined' && console.error) {
            console.error('[frqtl-control-widgets] control dispatch failed:', e);
        }
    });
}

/** A checkbox over a SCALAR 0/1 (the schema's "a toggle IS a scalar" rule). */
function _mountToggle(hostEl, initial, onInput, styleAsSwitch) {
    var row = _row();
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!Number(initial.value);
    box.setAttribute('data-frqtl-control-id', initial.id);
    if (styleAsSwitch) { box.style.cssText = 'width:16px;height:16px;accent-color:#ffb450;'; }
    var val = document.createElement('span');
    val.textContent = initial.valueText !== undefined ? initial.valueText : String(initial.value);
    val.style.cssText = 'min-width:32px;text-align:right;color:#ffb450;';
    box.addEventListener('change', function () {
        _settle(onInput(box.checked ? 1 : 0), function (res) {
            if (res && res.valueText !== undefined) { val.textContent = res.valueText; }
        }, function () { val.textContent = 'ERR'; });
    });
    row.appendChild(_label(initial.label + ':'));
    row.appendChild(box);
    row.appendChild(val);
    hostEl.appendChild(row);
    return {
        dispose: function () { if (row.parentNode) { row.parentNode.removeChild(row); } },
        setValue: function (value, valueText) {
            box.checked = !!Number(value);
            val.textContent = (valueText !== undefined) ? valueText : String(value);
        }
    };
}

/** A free-text input over the `text` kind. */
function _mountText(hostEl, initial, onInput) {
    var row = _row();
    var input = document.createElement('input');
    input.type = 'text';
    input.value = (initial.value !== undefined && initial.value !== null) ? String(initial.value) : '';
    input.setAttribute('data-frqtl-control-id', initial.id);
    input.style.cssText = 'flex:1;min-width:80px;background:#1b2330;color:#ddd;border:1px solid #33405a;' +
        'border-radius:3px;padding:2px 4px;font:12px sans-serif;';
    input.addEventListener('change', function () { _settle(onInput(input.value), function () {}); });
    row.appendChild(_label(initial.label + ':'));
    row.appendChild(input);
    hostEl.appendChild(row);
    return {
        dispose: function () { if (row.parentNode) { row.parentNode.removeChild(row); } },
        setValue: function (value) { input.value = (value === undefined || value === null) ? '' : String(value); }
    };
}

/** A momentary button over the `action` kind. */
function _mountButton(hostEl, initial, onAction) {
    var row = _row();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = initial.label;
    btn.setAttribute('data-frqtl-control-id', initial.id);
    btn.setAttribute('data-frqtl-control-action', initial.action || '');
    btn.style.cssText = 'background:#26324a;color:#e6edf7;border:1px solid #3d4d6b;border-radius:3px;' +
        'padding:3px 10px;font:12px sans-serif;cursor:pointer;';
    btn.addEventListener('click', function () {
        _settle(onAction(initial.action), function () {});
    });
    row.appendChild(btn);
    hostEl.appendChild(row);
    return {
        dispose: function () { if (row.parentNode) { row.parentNode.removeChild(row); } },
        // An action is stateless — reconciliation has nothing to write. Present so
        // every widget shares ONE handle shape (ControlSync registers uniformly).
        setValue: function () {}
    };
}

/**
 * mountWidget(hostEl, opts) — render one control row through the resolved widget.
 * @param {HTMLElement} hostEl
 * @param {object} opts — { initial, onInput?, onAction? }
 * @returns {{dispose:Function, setValue:Function}}
 * @throws {Error} FAIL-LOUD on a missing host, a missing row, an unknown widget,
 *   or a widget whose required callback was not supplied.
 */
function mountWidget(hostEl, opts) {
    opts = opts || {};
    if (!hostEl) { throw new Error('[frqtl-control-widgets] mountWidget requires a host element. (FAIL-LOUD.)'); }
    var initial = opts.initial;
    if (!initial) { throw new Error('[frqtl-control-widgets] mountWidget requires opts.initial. (FAIL-LOUD.)'); }
    var widget = resolveWidget(initial);

    if (widget === 'button') {
        if (typeof opts.onAction !== 'function') {
            throw new Error('[frqtl-control-widgets] the "button" widget (control "' + initial.id +
                '") requires opts.onAction. (FAIL-LOUD — never a dead button.)');
        }
        return _mountButton(hostEl, initial, opts.onAction);
    }
    if (typeof opts.onInput !== 'function') {
        throw new Error('[frqtl-control-widgets] the "' + widget + '" widget (control "' + initial.id +
            '") requires opts.onInput. (FAIL-LOUD.)');
    }
    if (widget === 'slider') {
        // DELEGATED — the ONE slider implementation, not re-rendered here.
        return _ControlSliderNode.mount(hostEl, { initial: initial, onInput: opts.onInput });
    }
    if (widget === 'toggle' || widget === 'checkbox') {
        return _mountToggle(hostEl, initial, opts.onInput, widget === 'toggle');
    }
    if (widget === 'text') {
        return _mountText(hostEl, initial, opts.onInput);
    }
    throw new Error('[frqtl-control-widgets] no renderer for widget "' + widget + '". (FAIL-LOUD.)');
}

// ── Export ────────────────────────────────────────────────────────────────────

var FrqtlControlWidgets = {
    WIDGET_BY_KIND: WIDGET_BY_KIND,
    resolveWidget: resolveWidget,
    mountWidget: mountWidget
};

export { FrqtlControlWidgets };

