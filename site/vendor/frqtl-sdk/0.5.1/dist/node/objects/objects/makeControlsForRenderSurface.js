/* Copyright 2023-2026 by Essam Abadir */

/**
 * makeControlsForRenderSurface.js — the RENDER-side factory twin of
 * `makeControlsForObject.js` (WS Studio Controls Realignment, Bite S5a).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `makeControlsForRenderSurface({runner})` → `{ controls }`.
 *
 * Walks the ACTIVE renderer provider's OPTIONAL `renderCapabilities()` method
 * (`lib/frqtl/compat/renderer/providers/{p5,three}-provider.js` — the
 * `getCameraControl()` optional-capability precedent: absent ⇒ no render
 * controls, never an error) and mechanically emits ONE `channel:'render'`
 * contract control descriptor per declared capability — never a hand-mirrored
 * per-page control array (this is exactly what retires `_egptFx.controls`,
 * `fx-experiment.js`'s bespoke `{key,label,min,max,step}` vocabulary — see
 * that file's own updated docstring).
 *
 * Each renderCapabilities() entry is a `lib/shim/field-descriptor`-shaped
 * field descriptor (`{name, type, constraint, unit, default, description}` —
 * §7 r2 CEO call C1's shared vocabulary): `type:'number'` → a `scalar`
 * control; `type:'enum'` → an `enum` control; a render-only `type:'boolean'`
 * → a 0/1 `scalar`; `type:'string'` (an OPEN-ID asset id) → no control. The
 * conversions REUSE `makeControlsForObject.js`'s OWN handlers (exposed as
 * `RENDER_TYPE_HANDLERS`) rather than re-deriving bounds/label/format logic.
 *
 * Every generated control binds `{object:'render', prop:capability.name}`, and
 * `controlBind.js`'s render branch ferries it to `runner.setRenderOption` /
 * `runner.getRenderOption` — the ONE render-option gate (declared key, valid
 * value, and the `filter.<name>` toggle routing all live there).
 *
 * @param {object} opts
 * @param {object} opts.runner — the FrqtlApp (REQUIRED — the only way
 *   to reach the active provider's `renderCapabilities()`/read the runner's
 *   own universal render options).
 * @returns {{controls: object[]}} `controls` are ALREADY normalized
 *   (`lib/shim/controls` `normalizeControlDescriptor` has already run —
 *   fail-fast: a factory bug throws HERE, at generation time).
 * @throws {Error} FAIL-LOUD — missing `opts.runner`, a capability descriptor
 *   whose `type` is not `RENDER_TYPE_HANDLERS`-dispatchable (see
 *   `makeControlsForObject.js`'s own docstring for why the remaining
 *   ObjectSchema field types are NOT reused here), or a malformed capability
 *   descriptor (`lib/shim/field-descriptor`'s own `normalizeFieldDescriptor`
 *   validates the envelope before conversion).
 *
 * ── Arrow legality ────────────────────────────────────────────────────────
 *
 * Same precedent as `makeControlsForObject.js`'s own "Arrow legality" note:
 * this file `require`s `lib/shim/controls/index.js` and
 * `lib/shim/field-descriptor/index.js` directly (an `objects → shim` schema-
 * contract edge, NOT an engine dependency) — `lib/frqtl/objects` is annotated
 * in `scripts/verify-arrows.mjs` as "user-space sugar — NOT a violation."
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero physics — render is output-boundary only (root CLAUDE.md §Object
 * architecture: "render never feeds physics"). Generating a control changes
 * NOTHING about the rendered scene until a host actually calls the generated
 * control's `bind` through `resolveBind`, which itself calls
 * `setRenderOption`/`filter()` — the IDENTICAL effect as calling those
 * directly by hand.
 *
 * ── Module format: CLASSIC dual CommonJS/window (matches its sibling
 *    makeControlsForObject.js, controlBind.js, Tube.js) ─────────────────────
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

// ── Imports (lazy-guarded, mirrors makeControlsForObject.js's own precedent) ─

var _ControlsSchemaNode = null;
var _FieldDescriptorSchemaNode = null;
var _MakeControlsForObjectNode = null;

if (typeof module !== 'undefined' && module.exports) {
    var path = require('path');
    _ControlsSchemaNode = require(path.resolve(__dirname, '../../../shim/controls/index.js'));
    _FieldDescriptorSchemaNode = require(path.resolve(__dirname, '../../../shim/field-descriptor/index.js'));
    _MakeControlsForObjectNode = require(path.resolve(__dirname, './makeControlsForObject.js'));
}

function _getControlsSchema() {
    if (_ControlsSchemaNode) { return _ControlsSchemaNode; }
    if (typeof window !== 'undefined' && window.ControlsSchema) { return window.ControlsSchema; }
    throw new Error('[makeControlsForRenderSurface] ControlsSchema not available. In the browser, ' +
        'ensure lib/shim/controls/index.js is loaded before this file. (FAIL-LOUD.)');
}

function _getFieldDescriptorSchema() {
    if (_FieldDescriptorSchemaNode) { return _FieldDescriptorSchemaNode; }
    if (typeof window !== 'undefined' && window.FieldDescriptorSchema) { return window.FieldDescriptorSchema; }
    throw new Error('[makeControlsForRenderSurface] FieldDescriptorSchema not available. In the ' +
        'browser, ensure lib/shim/field-descriptor/index.js is loaded before this file. (FAIL-LOUD.)');
}

function _getMakeControlsForObject() {
    if (_MakeControlsForObjectNode) { return _MakeControlsForObjectNode; }
    if (typeof window !== 'undefined' && window.MakeControlsForObject) { return window.MakeControlsForObject; }
    throw new Error('[makeControlsForRenderSurface] MakeControlsForObject not available. In the ' +
        'browser, ensure lib/frqtl/objects/objects/makeControlsForObject.js is loaded before this ' +
        'file. (FAIL-LOUD.)');
}

/**
 * Resolve a capability's CURRENT live value (to seed the generated control) through
 * `runner.getRenderOption` — the one read path (it answers `filter.<name>` too). Falls back
 * to `field.default` while the option has never been written.
 */
function _resolveCapabilityValue(runner, field) {
    var live = runner.getRenderOption(field.name);
    return (live !== undefined) ? live : field.default;
}

/** A synthetic single-field wrapper — see file docstring: `_numberHandler`/
 *  `_enumHandler` fall through to their generic `wrapper[propName]` read for
 *  any `env.kind` outside {'Frame','Universe'}, so this is all `env.wrapper`
 *  needs to be for them to work UNMODIFIED. */
function _singleFieldWrapper(name, value) {
    var w = {};
    w[name] = value;
    return w;
}

/**
 * @see file docstring for the full contract.
 */
function makeControlsForRenderSurface(opts) {
    opts = opts || {};
    var runner = opts.runner;
    if (!runner) {
        throw new Error('[makeControlsForRenderSurface] requires opts.runner (an FrqtlApp). ' +
            '(FAIL-LOUD.)');
    }

    var normalizeControlDescriptor = _getControlsSchema().normalizeControlDescriptor;
    var normalizeFieldDescriptor = _getFieldDescriptorSchema().normalizeFieldDescriptor;
    var RENDER_TYPE_HANDLERS = _getMakeControlsForObject().RENDER_TYPE_HANDLERS;

    // Optional capability (the getCameraControl() precedent) — absent
    // renderCapabilities() ⇒ empty output, never an error.
    var rawCaps = (typeof runner.renderCapabilities === 'function') ? runner.renderCapabilities() : null;
    if (!Array.isArray(rawCaps)) { rawCaps = []; }

    var controls = [];

    for (var i = 0; i < rawCaps.length; i++) {
        // Fail-fast: a provider's malformed renderCapabilities() entry throws
        // HERE, at generation time — never silently skipped.
        var field = normalizeFieldDescriptor(rawCaps[i]);

        var handler = RENDER_TYPE_HANDLERS[field.type];
        if (!handler) {
            throw new Error('[makeControlsForRenderSurface] capability "' + field.name + '" declares ' +
                'type "' + field.type + '" — only ' + Object.keys(RENDER_TYPE_HANDLERS).join(', ') +
                ' are dispatchable render-capability types today (the ones real render capabilities ' +
                'use). (FAIL-LOUD — never a silent drop.)');
        }

        var value = _resolveCapabilityValue(runner, field);
        var env = {
            kind: 'RenderSurface',
            wrapper: _singleFieldWrapper(field.name, value),
            ctx: {},
            opts: {},
            objectName: 'render'
        };
        var result = handler(field, env);
        if (!result || result.kind !== 'control') { continue; } // defined skip — no live value to seed a control

        var descriptor = result.descriptor;
        descriptor.channel = 'render'; // override the physics default — this IS a render-channel control
        controls.push(normalizeControlDescriptor(descriptor));
    }

    return { controls: controls };
}

// ── Export ────────────────────────────────────────────────────────────────────

var MakeControlsForRenderSurface = {
    makeControlsForRenderSurface: makeControlsForRenderSurface
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MakeControlsForRenderSurface;
} else if (typeof window !== 'undefined') {
    window.MakeControlsForRenderSurface = MakeControlsForRenderSurface;
}

})();
