/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/field-descriptor — the shared FIELD-SHAPE vocabulary contract.
 *
 * Studio Controls Realignment §7 r2, C1: a single FIELD shape — `{name, type, constraint, unit,
 * description, engineVisible, widgetHint, widgetConfig, default}` — and its
 * closed TYPE vocabulary were about to be re-derived THREE times (physics
 * object schema, the new render-capability descriptors, and a future Rosetta
 * `paramsSchema`) instead of owned once. This module is that ONE owner — the
 * peer of `lib/shim/controls` (which owns the CONTROL-descriptor shape one
 * layer up) and `lib/shim/frame-data` (which owns the data-bubble shape) —
 * same layout convention (closed vocabulary + a throw-or-apply `normalize`,
 * named ES-module exports).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * `lib/frqtl/objects/schema/index.js` (`ObjectSchema`) already declares
 * ~200 fields across 16 kinds using EXACTLY this shape, documented only as a
 * comment block (`type:'rect' → …`, `type:'rgb' → …`, …). Separately,
 * `lib/frqtl/objects/objects/makeControlsForObject.js`'s `TYPE_DISPATCH` map
 * independently enumerates the SAME 12 field types as its object keys — two
 * hand-written lists that happen to agree today but have no shared owner
 * enforcing that they always will (the exact schema-mirror-drift class root
 * `CLAUDE.md` §Engineering Culture calls out: "the same data breaks in one
 * consumer but not another"). `renderCapabilities()` (S5a item 2,
 * `lib/frqtl/compat/renderer/providers/{p5,three}-provider.js`) needed the
 * SAME field shape for a THIRD surface — the trigger for this extraction.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 *
 * This module owns:
 *   - `FIELD_TYPES`          — the closed field-TYPE vocabulary (12 members,
 *     mechanically identical to `ObjectSchema`'s documented comment list AND
 *     `makeControlsForObject.js`'s `TYPE_DISPATCH` keys — see the drift test).
 *   - `FIELD_ENVELOPE_KEYS`  — the field-SHAPE envelope key list (documentation/
 *     introspection use — NOT a required-keys gate; most fields omit most of
 *     these optional keys, only `name`/`type`/`description` are mandatory).
 *   - `normalizeFieldDescriptor(partial)` — throw-or-apply validation of ONE
 *     field descriptor's envelope (name/type/description required; constraint/
 *     unit/engineVisible/widgetHint/widgetConfig/default validated IF present).
 *
 * This module does NOT:
 *   - Re-list or replace `ObjectSchema`'s ~200 existing per-kind field arrays —
 *     those stay EXACTLY as authored (byte-identical); `ObjectSchema` merely
 *     IMPORTS `FIELD_TYPES` from here to assert (at load time) that every field
 *     it declares uses a member of the ONE vocabulary, instead of hand-copying
 *     the type list into its own comment block as the only enforcement.
 *   - Replace `lib/shim/controls`'s CONTROL-descriptor shape (`{kind, id, label,
 *     min, max, step, value, fmt, onChange, bind, channel}`) — that is a
 *     DIFFERENT, downstream shape (a UI/live-knob descriptor), consumed by a
 *     factory that READS field descriptors of THIS shape and EMITS control
 *     descriptors of THAT shape. The two are peers, not the same contract.
 *
 * Usage:
 *   import { FIELD_TYPES, normalizeFieldDescriptor } from 'lib/shim/field-descriptor/index.js';
 *   var f = normalizeFieldDescriptor({
 *       name: 'godrays', type: 'number', unit: 'intensity',
 *       constraint: { min: 0, max: 3 }, default: 0,
 *       description: 'God-rays post-process intensity (render-only).'
 *   });
 */



// ── Field type vocabulary (closed, 12 members) ──────────────────────────────
//
// Mechanically identical to the set actually used across ObjectSchema's field
// declarations (lib/frqtl/objects/schema/index.js) and
// makeControlsForObject.js's TYPE_DISPATCH keys — verified exhaustively by
// lib/shim/field-descriptor/test/field-descriptor.test.mjs's drift assertion.
// Adding a 13th type is a THREE-PLACE change (here, TYPE_DISPATCH, and any
// descriptor that uses it) — the drift test makes forgetting one of the three
// a CI failure rather than a silent runtime gap.
//
//   number     — numeric scalar; constraint: { min?, max?, integer? }
//   boolean    — true | false
//   string     — free string
//   enum       — one value from constraint.values object
//   enum-set   — array of zero or more values from constraint.values object
//   rgb        — [r, g, b] (0-255 integers)
//   rect       — { left, top, w, h } (+ optional z, d — WASM-only)
//   rect-array — array of rect-shaped tuples
//   readonly   — derived/computed: inspectable but not editable
//   forbidden  — engine-owned topology: any write attempt throws
//   object     — an arbitrary structured bag (e.g. an op-program)
//   writable   — Frame-kind-only ACCESS-LEVEL tag (the actual value type is
//                inferred from the live read — number/boolean/string/object)
var FIELD_TYPES = Object.freeze([
    'number', 'boolean', 'string', 'enum', 'enum-set',
    'rgb', 'rect', 'rect-array', 'readonly', 'forbidden',
    'object', 'writable'
]);

// ── Field envelope keys (documentation/introspection — NOT a required list) ─
//
// Every field descriptor MAY carry these keys; only name/type/description are
// mandatory (validated by normalizeFieldDescriptor below). `default` is the
// C1 addition renderCapabilities() descriptors need (a physics ObjectSchema
// field's live value comes from the constructed object instead — `default`
// was rarely populated there and stays optional here for that reason).
var FIELD_ENVELOPE_KEYS = Object.freeze([
    'name', 'type', 'constraint', 'unit', 'description',
    'engineVisible', 'widgetHint', 'widgetConfig', 'default'
]);

function _isStr(v) { return typeof v === 'string' && v.length > 0; }
function _isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function _fail(name, msg) {
    throw new Error('[lib/shim/field-descriptor] normalizeFieldDescriptor(name="' + String(name) +
        '"): ' + msg + ' (FAIL-LOUD — throw-or-apply, never silently dropped/defaulted-around.)');
}

/**
 * normalizeFieldDescriptor(partial) → full bag.
 *
 * THROW-OR-APPLY: a malformed field descriptor throws here — never silently
 * dropped or coerced. Mandatory: `name` (non-empty string), `type` (member of
 * FIELD_TYPES), `description` (non-empty string — every ObjectSchema field
 * already carries one; see schema.test.mjs assertion (a)). Optional, validated
 * IF present: `unit` (string), `constraint`/`widgetConfig` (plain object),
 * `engineVisible` (boolean), `widgetHint` (string). `default` accepts ANY
 * value (its shape depends on `type` — a number, a string, an array for rgb/
 * rect, …) so it is NOT type-checked here.
 *
 * @param {object} partial
 * @returns {object} a NEW object (input never mutated) carrying every input
 *   key verbatim.
 * @throws {Error} FAIL-LOUD on a missing/empty `name`, an unrecognized `type`,
 *   a missing/empty `description`, or a mistyped optional key.
 */
function normalizeFieldDescriptor(partial) {
    if (!partial || typeof partial !== 'object') {
        throw new Error('[lib/shim/field-descriptor] normalizeFieldDescriptor requires a field ' +
            'descriptor object; got ' + (partial === null ? 'null' : typeof partial) +
            '. (FAIL-LOUD.)');
    }
    var name = partial.name;
    if (!_isStr(name)) {
        _fail(name, '"name" must be a non-empty string.');
    }
    var type = partial.type;
    if (FIELD_TYPES.indexOf(type) === -1) {
        _fail(name, '"type" must be one of [' + FIELD_TYPES.join(', ') + ']; got "' + String(type) + '".');
    }
    if (!_isStr(partial.description)) {
        _fail(name, '"description" must be a non-empty string.');
    }
    if (partial.unit !== undefined && !_isStr(partial.unit)) {
        _fail(name, '"unit", when present, must be a non-empty string.');
    }
    if (partial.constraint !== undefined && !_isPlainObject(partial.constraint)) {
        _fail(name, '"constraint", when present, must be a plain object.');
    }
    if (partial.engineVisible !== undefined && typeof partial.engineVisible !== 'boolean') {
        _fail(name, '"engineVisible", when present, must be a boolean.');
    }
    if (partial.widgetHint !== undefined && !_isStr(partial.widgetHint)) {
        _fail(name, '"widgetHint", when present, must be a non-empty string.');
    }
    if (partial.widgetConfig !== undefined && !_isPlainObject(partial.widgetConfig)) {
        _fail(name, '"widgetConfig", when present, must be a plain object.');
    }

    // Fresh bag — never mutate the caller's object (mirrors frame-data's
    // normalizeDataBubble / controls' normalizeControlDescriptor convention).
    var bag = {};
    for (var k in partial) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) { bag[k] = partial[k]; }
    }
    bag.name = name;
    bag.type = type;
    return bag;
}

// ── UX presentation vocabulary ──────────────────────────────────────────────
//
// A per-KIND `ux:{}` block rides ON the ObjectSchema descriptor (peer of `fields`
// — a presentation contract, NOT a parallel `UxSchema`; Q-A0). Its
// closed value vocabularies live HERE, the PEER of FIELD_TYPES, so STUDIO's
// overlay AND a headless game consume ONE list (the SAME hooks a game uses
// programmatically). The vocab is READ DOWNWARD ONLY (shim → objects/
// features); no lib/frqtl/objects file re-lists these strings, and
// author-bbox-overlay.js (lib/features) FERRIES `UX_HANDLE_ZONES` (asserting its
// own returned zone names are members) instead of being a second owner.
//
// R6 legacy tolerance: a descriptor with NO `ux` block ⇒ `normalizeUx(undefined)`
// ⇒ today's behavior (resizable everywhere, 2D-draggable, all handle zones live,
// marker shell design-only).
// normalizeUx NEVER throws on an absent block — only on an INVALID member.

// The bbox interaction zones hitBboxZone (author-bbox-overlay.js) can classify a
// pointer into. 'move' = interior drag; 'scale-*' = a corner/edge resize handle.
// This is the ONE owner; author-bbox-overlay.js ferries it (drift = load-time throw).
var UX_HANDLE_ZONES = Object.freeze([
    'move',
    'scale-tl', 'scale-tr', 'scale-bl', 'scale-br',
    'scale-t', 'scale-b', 'scale-l', 'scale-r'
]);

// The render modes a part may be cursor-dragged in. Only 2D: a 3D scene never cursor-drags
// (reposition is the aim + SPACE carry), so there is no per-object 3D knob to declare.
var UX_DRAGGABLE_MODES = Object.freeze(['2d']);

// When a manipulable object's visual shell renders (generalizes the
// `_designMarker` boolean at the ONE _visibleLargeObjects authority):
//   design — only while authoring (Design mode). The marker default.
//   run    — always visible (the "red light bulb" opt-in).
//   never  — never drawn.
var UX_SHELL_RENDER = Object.freeze(['design', 'run', 'never']);

// The `ux` envelope keys (documentation/introspection — NOT a required list; a
// partial ux block fills the rest from the legacy defaults below).
var UX_ENVELOPE_KEYS = Object.freeze([
    'resizable', 'draggable', 'handles', 'shellRender'
]);

// Keys a ux block may NOT carry any more, each with what replaced it (FAIL-LOUD on use).
var UX_DELETED_KEYS = Object.freeze({
    inspectorSections: 'the Inspector shows a DECLARED object through its own descriptor (no per-role section list)'
});

function _uxFail(msg) {
    throw new Error('[lib/shim/field-descriptor] normalizeUx: ' + msg +
        ' (FAIL-LOUD — throw-or-apply, never silently dropped/defaulted-around.)');
}

/**
 * normalizeUx(partial) → full ux bag.
 *
 * THROW-OR-APPLY: an INVALID member throws here; an ABSENT block (undefined/null)
 * yields the legacy defaults (today's behavior, R6). Every field is optional; a
 * partial block fills the rest from the defaults.
 *
 *   resizable         — boolean (default true). false ⇒ scale handles are never
 *                       offered even for the SELECTED object (its corners never
 *                       resize; the first-and-every interaction is select/move).
 *   draggable         — { '2d':boolean } (default true). false disables the 2D
 *                       cursor-drag. (A 3D scene never cursor-drags; '3d' is not a key.)
 *   handles           — string[] ⊆ UX_HANDLE_ZONES (default = ALL zones). The
 *                       live interaction zones; a zone NOT listed is downgraded
 *                       to 'move' by the overlay (never a resize on the selecting
 *                       click). `resizable:false` is the ergonomic shorthand for
 *                       handles:['move'].
 *   shellRender       — one of UX_SHELL_RENDER (default 'design'). When the
 *                       object's visual shell/marker paints.
 *
 * @param {object|null|undefined} partial
 * @returns {{resizable:boolean, draggable:{'2d':boolean}, handles:string[], shellRender:string}}
 */
function normalizeUx(partial) {
    var bag = {
        resizable: true,
        draggable: { '2d': true },
        handles: UX_HANDLE_ZONES.slice(),
        shellRender: 'design'
    };
    if (partial === null || partial === undefined) { return bag; }
    if (typeof partial !== 'object' || Array.isArray(partial)) {
        _uxFail('a ux block must be a plain object; got ' +
            (Array.isArray(partial) ? 'array' : typeof partial) + '.');
    }
    Object.keys(UX_DELETED_KEYS).forEach(function (k) {
        if (partial[k] !== undefined) { _uxFail('"' + k + '" is DELETED — ' + UX_DELETED_KEYS[k] + '.'); }
    });
    if (partial.resizable !== undefined) {
        if (typeof partial.resizable !== 'boolean') { _uxFail('"resizable" must be a boolean.'); }
        bag.resizable = partial.resizable;
    }
    if (partial.draggable !== undefined) {
        if (!_isPlainObject(partial.draggable)) { _uxFail('"draggable" must be a { "2d" } object.'); }
        Object.keys(partial.draggable).forEach(function (k) {
            if (UX_DRAGGABLE_MODES.indexOf(k) === -1) {
                _uxFail('"draggable.' + k + '" is not a draggable mode ([' + UX_DRAGGABLE_MODES.join(', ') +
                    ']) — a 3D scene never cursor-drags.');
            }
        });
        var dr = { '2d': true };
        for (var m = 0; m < UX_DRAGGABLE_MODES.length; m++) {
            var mode = UX_DRAGGABLE_MODES[m];
            if (partial.draggable[mode] !== undefined) {
                if (typeof partial.draggable[mode] !== 'boolean') {
                    _uxFail('"draggable.' + mode + '" must be a boolean.');
                }
                dr[mode] = partial.draggable[mode];
            }
        }
        bag.draggable = dr;
    }
    if (partial.handles !== undefined) {
        if (!Array.isArray(partial.handles)) { _uxFail('"handles" must be an array of zone names.'); }
        for (var h = 0; h < partial.handles.length; h++) {
            if (UX_HANDLE_ZONES.indexOf(partial.handles[h]) === -1) {
                _uxFail('"handles" entry "' + String(partial.handles[h]) + '" is not a member of ' +
                    'UX_HANDLE_ZONES ([' + UX_HANDLE_ZONES.join(', ') + ']).');
            }
        }
        bag.handles = partial.handles.slice();
    } else if (partial.resizable === false) {
        // Ergonomic shorthand: an explicitly non-resizable object offers ONLY move.
        bag.handles = ['move'];
    }
    if (partial.shellRender !== undefined) {
        if (UX_SHELL_RENDER.indexOf(partial.shellRender) === -1) {
            _uxFail('"shellRender" must be one of [' + UX_SHELL_RENDER.join(', ') + ']; got "' +
                String(partial.shellRender) + '".');
        }
        bag.shellRender = partial.shellRender;
    }
    return bag;
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    FIELD_TYPES,
    FIELD_ENVELOPE_KEYS,
    normalizeFieldDescriptor,
    UX_HANDLE_ZONES,
    UX_DRAGGABLE_MODES,
    UX_SHELL_RENDER,
    UX_ENVELOPE_KEYS,
    normalizeUx
};
