/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/controls — The control-descriptor schema contract.
 *
 * Single authority for "what shape is a live control knob" (WS gym-controls-as-sugar
 * Bite 1 ratified decisions).
 * Peer of `lib/shim/frame-data` (the data-bubble schema) and `lib/shim/expr/ast-schema`
 * (the op-program AST schema) — same file/export layout convention (a closed vocabulary
 * + a throw-or-apply `normalize`, dual CommonJS/`window` export so both Node tests and
 * plain `<script>`-loaded experiment pages can consume it).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Every FRQTL experiment that wants a live, no-reload knob has independently invented
 * its OWN capability-object shape, each proven correct in the field but never codified
 * in one place:
 *   - `runner.experimentControls`  — the SCALAR slider/toggle shape, first standardized
 *     by `SphereEmitter.controls` (`lib/frqtl/objects/objects/SphereEmitter.js`), then
 *     reused verbatim by `collision-matrix-3d` and `g3-lo-collide`.
 *   - `runner.cameraControl`       — the CAMERA orbit handle, from
 *     `three-provider.js getCameraControl()`.
 *   - `runner.loopControl`         — the LOOP periodic-reset control, from
 *     `fx-experiment.js _buildLoopControl()`.
 *
 * This module does NOT invent new shapes — it CODIFIES these three already-shipped,
 * already-battle-tested shapes as a closed kind union, so a NEW sugar object can
 * `normalizeControlDescriptor({kind:'scalar', ...})` and get the SAME throw-or-apply
 * guarantee every future host (a control panel, the GYM, Studio) can rely on, instead
 * of every consumer re-deriving "does this look like a camera control?" by hand
 * (the schema-mirror-drift anti-pattern root `CLAUDE.md` calls out).
 *
 * ── Scope (Bite 1 — contract only) ───────────────────────────────────────────
 *
 * This module ships the SCHEMA + normalize. It does NOT:
 *   - render any UI panel (that is Bite 3's `frqtl-control-*.js` family),
 *   - touch the GYM/CompareView.jsx (Bite 2 — still duck-types these capabilities
 *     ad hoc; migrating it to `normalizeControlDescriptor` is a later bite's job),
 *   - migrate any existing experiment page's `CONTROLS = [...]` literal onto this
 *     module (byte-identical arrays remain valid input to `normalizeControlDescriptor`
 *     — normalizing is OPT-IN for a new consumer, not a retrofit requirement).
 *
 * Usage:
 *   const { KINDS, CHANNELS, normalizeControlDescriptor } = require('lib/shim/controls');
 *   const bag = normalizeControlDescriptor({
 *       kind: 'scalar', id: 'chamberFlow', label: 'flow',
 *       min: 0, max: 1, step: 1, value: 1,
 *       fmt: (v) => (v ? 'on' : 'off'),
 *       onChange: (v) => self.setActive(!!v)
 *   });
 *   // bag.channel === 'physics' (the scalar default — see CHANNELS below)
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

// ── Kind union (closed) ─────────────────────────────────────────────────────────
//
// Conformance iterates this list — adding a kind here MUST be accompanied by a
// REQUIRED_KEYS_BY_KIND entry + a validator branch in normalizeControlDescriptor
// + a conformance scenario (mirrors ast-schema.js NODE_KINDS discipline: "closed at N,
// do not add without updating the iteration surface").
//
//   scalar — a single numeric slider/toggle knob. THE PROVEN SphereEmitter.controls
//            shape: {id,label,min,max,step,value,fmt,onChange}. A toggle is a scalar
//            with min:0,max:1,step:1 — NOT a separate kind (closed-union discipline).
//   camera — an orbit-camera handle. THE PROVEN three-provider.js getCameraControl()
//            shape: {presets,setOrbit,getOrbit,setPreset}.
//   loop   — a periodic runner.setup() re-run control. THE PROVEN fx-experiment.js
//            _buildLoopControl() shape: {enabled,ticks,setEnabled,setTicks}.
//
// The three kinds below are NEW (WS Studio Controls Realignment S1, design §2.2 /
// gap-census #1,#4,#6,#10 — architect-ratified: "only these three are genuinely new
// value-shapes"):
//
//   enum   — select-one from a closed candidate set. Covers Studio's
//            collision_type/gateType/reposition Inspector fields (census #6).
//            Shape: {id,label,values,value,fmt,onChange,bind}. `value` MUST be a
//            member of `values` (both single-select semantics enforced here).
//   flags  — multi-select from a closed candidate set. Covers Studio's `actions`
//            (schema type 'enum-set') Inspector field. Shape:
//            {id,label,values,value,fmt,onChange,bind}. `value` is an ARRAY, each
//            element MUST be a member of `values`.
//   vector — an ordered numeric tuple, written WHOLE (never a torn per-component
//            write). THE placement/drag answer (census #4/#5, Transport Fit §2):
//            covers x/y(/z), the 2D rect [l,t,w,h], the 3D 6-tuple
//            [l,t,z,w,h,d] (LargeObject.rect already documents z/d — see
//            reference_lo_z_depth_wire_contract), and rgb [r,g,b]. Length is
//            FREE (not fixed at construction) — a 2-tuple, 4-tuple, and 6-tuple
//            are all the same kind, just different `value.length`. Shape:
//            {id,label,value,min,max,step,fmt,onChange,bind} — `min`/`max`/`step`
//            are each EITHER one shared number (applies to every component) OR
//            an array the SAME LENGTH as `value` (a per-component bound, e.g. a
//            rect's `w`/`h` needing a different range than `left`/`top`).
//
// The two kinds below are NEW (presentation pass Item 2, CEO-ratified E-P2a) —
// the two value shapes no existing kind holds:
//
//   text   — a STRING-valued control: {id,label,value,fmt,onChange} (+ optional
//            `bind`). Every other kind's `value` is a number, a number tuple, or
//            a member/subset of a closed candidate set; a free string is none of
//            those.
//   action — a MOMENTARY verb: {id,label,action} where `action` is a member of
//            the closed ACTIONS vocabulary below. Stateless (no `value`, no
//            read-back) and serializable by NAME, so a declared array of them
//            round-trips through codegen with no new machinery. Actions are
//            deliberately NOT expressed as a `bind` — a bind is a property
//            read/write pair, and `get()` of "restart" is meaningless.
//
// Deliberately NOT separate kinds (architect ruling, closed-union discipline —
// do not propose adding these):
//   - `bool`/`toggle`  — a toggle IS a `scalar` with min:0,max:1,step:1 (matches
//     the pre-existing scalar-toggle convention above; no shape distinction).
//   - `color`/`rgb`    — an RGB color IS a `vector` of length 3 (`[r,g,b]`) with
//     a color-picker WIDGET override via the kind-orthogonal `resolveWidget`
//     seam (a rendering/widget-selection choice, not a value-shape difference —
//     `normalizeControlDescriptor` never picks widgets, only validates shape).
var KINDS = Object.freeze(['scalar', 'camera', 'loop', 'enum', 'flags', 'vector',
                           'text', 'action']);

// ── Game-layer ACTION vocabulary (closed) ───────────────────────────────────────
//
// The names an `action` descriptor may carry. The shim owns the NAME LIST (the
// data shape); EXECUTION is objects-side — `lib/frqtl/objects/objects/controlAction.js`
// maps each name to a live FrqtlApp method. This is the SAME arrow split
// the `bind` contract already uses (shim owns the shape, objects owns execution),
// and it is why no page ever re-implements pause/restart plumbing.
//
//   pause   — stop the run loop            resume  — start it again
//   toggle  — flip play/pause              restart — replay the retained setup
//                                                    factory in-place (tick 0,
//                                                    no page reload)
var ACTIONS = Object.freeze(['pause', 'resume', 'toggle', 'restart']);

// ── Placement (optional, any kind) ─────────────────────────────────────────────
//
// `place: {x, y, anchor}` marks a descriptor as drawable OVER THE CANVAS by a
// host overlay (lib/frqtl/objects/objects/frqtl-control-overlay.js). x/y are
// FRACTIONS of the canvas (0..1) so a placement survives a resize; `anchor` picks
// which corner they are measured from. A descriptor WITHOUT `place` behaves
// exactly as before (panel hosts only) — this module validates the SHAPE only and
// never positions anything itself.
var PLACE_KEYS = Object.freeze(['x', 'y', 'anchor']);
var PLACE_ANCHORS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
var DEFAULT_PLACE_ANCHOR = 'top-left';

// ── Widget seam (optional, kind-ORTHOGONAL) ────────────────────────────────────
//
// The schema's standing ruling above ("a toggle IS a scalar 0/1"; "a color IS a
// vector-3") requires a place to say WHICH widget renders a given descriptor
// without inventing a kind for it. `widget` is that seam: a closed name list,
// validated here, resolved to an actual renderer by the ONE widget table
// (lib/frqtl/objects/objects/frqtl-control-widgets.js). `toggle`/`checkbox` are
// widgets over a scalar 0/1; `button` is the action kind's widget.
var WIDGETS = Object.freeze(['slider', 'toggle', 'checkbox', 'text', 'button']);

// ── Channel discriminator (closed, ratified §2) ─────────────────────────────────
//
// Separates render-knob writes (a control whose onChange ultimately calls
// runner.setRenderOption(key,value) — a VISUAL/render-intent write) from
// physics-knob writes (a control whose onChange calls a capability/property
// accessor on a sugar object or Frame/LargeObject — a PHYSICS-parametric write).
// This is metadata for future host tooling (e.g. a control panel choosing an icon
// or a batching strategy) — normalizeControlDescriptor never calls onChange itself
// and never inspects its closure body; `channel` is a DECLARED tag the descriptor's
// AUTHOR supplies, not something inferred.
//
// ── Channel-semantics clarification (design §2.2, corrects a natural misreading) ──
// `channel` discriminates the WRITE PRIMITIVE, NOT `engineVisible`:
//   - 'physics' → the write goes through an OBJECT-PROP accessor
//     (`runner.updateObjectProperty` / `setFrameProperty` / `setUniverseProperty`).
//     This includes every per-object prop, EVEN an `engineVisible:false` one
//     (color, alpha, collision_type, actions, name) — those are still
//     'physics'-channel OBJECT BINDS, they just happen to be render-only at the
//     engine-ABI level (mutate the JS wrapper, never cross into the engine).
//   - 'render'  → the write goes through the PAGE-LEVEL `runner.setRenderOption`
//     (godrays, glow, colorScheme, shape) — a render-INTENT knob with no
//     per-object identity at all.
// A schema field's `engineVisible` flag is an ORTHOGONAL fact about whether the
// engine reads that field back — it does NOT determine `channel`. (An earlier,
// REJECTED proposal to map `engineVisible → channel` directly is wrong: every
// per-object field, `engineVisible` or not, is a 'physics'-channel object bind.)
//
// channel applies most meaningfully to 'scalar'/'enum'/'flags'/'vector' (the
// kinds whose onChange is a bare function, otherwise indistinguishable from
// either use). It is OPTIONAL, but VALIDATED IF PRESENT, on
// 'camera'/'loop' — their own kind-specific methods
// (setOrbit/setEnabled) are already self-describing capability
// surfaces, so this schema does not force a channel value onto them.
var CHANNELS = Object.freeze(['physics', 'render']);

/**
 * DEFAULT_CHANNEL — applied to a descriptor of a DEFAULT_CHANNEL_KINDS member
 * that omits `channel`.
 * 'physics' matches EVERY existing scalar consumer byte-for-byte (SphereEmitter,
 * collision-matrix-3d and g3-lo-collide both drive capability/property
 * accessors, never setRenderOption, and none of them declare `channel` today) —
 * this default keeps every existing `CONTROLS = [...]` array a valid, unchanged
 * normalizeControlDescriptor input with no source-file migration required.
 */
var DEFAULT_CHANNEL = 'physics';

/**
 * DEFAULT_CHANNEL_KINDS — the kinds whose omitted `channel` resolves to
 * DEFAULT_CHANNEL (S1: extended from 'scalar'-only to every bare-onChange kind
 * — 'enum'/'flags'/'vector' share the exact same ambiguity `scalar` has: their
 * onChange is a plain function, otherwise indistinguishable between a physics
 * write and a render write). 'camera'/'loop' are NOT members — their
 * own kind-specific methods are already self-describing capability surfaces.
 */
var DEFAULT_CHANNEL_KINDS = Object.freeze(['scalar', 'enum', 'flags', 'vector', 'text']);

// ── Per-kind required-key tables ─────────────────────────────────────────────────
//
// Conformance iterates REQUIRED_KEYS_BY_KIND[kind] for each kind in KINDS — never a
// hand-copied per-kind list in the test file (the schema-mirror-drift discipline).

/** SCALAR — {id,label,min,max,step,value,fmt,onChange}. `id` is validated separately
 *  (every kind requires it, for registry addressing) — SCALAR_KEYS lists the
 *  kind-SPECIFIC fields beyond the common `{kind,id}` envelope. */
var SCALAR_KEYS = Object.freeze(['label', 'min', 'max', 'step', 'value', 'fmt', 'onChange']);

/** CAMERA — {presets,setOrbit,getOrbit,setPreset}, the exact getCameraControl() shape. */
var CAMERA_KEYS = Object.freeze(['presets', 'setOrbit', 'getOrbit', 'setPreset']);

/** LOOP — {enabled,ticks,setEnabled,setTicks}, the exact _buildLoopControl() state shape. */
var LOOP_KEYS = Object.freeze(['enabled', 'ticks', 'setEnabled', 'setTicks']);

/** ENUM — select-one from a closed candidate set (design §2.2 — census #6:
 *  collision_type/gateType/reposition). {id,label,values,value,fmt,onChange,bind}.
 *  `value` MUST be a member of `values` — enforced by `_validateEnum`, not listed
 *  here (this table is the REQUIRED-KEY list, membership is a separate check). */
var ENUM_KEYS = Object.freeze(['label', 'values', 'value', 'fmt', 'onChange']);

/** FLAGS — multi-select from a closed candidate set (design §2.2 — census #6:
 *  the `actions` enum-set field). {id,label,values,value,fmt,onChange,bind}.
 *  `value` is an ARRAY; every element MUST be a member of `values` — enforced
 *  by `_validateFlags`. */
var FLAGS_KEYS = Object.freeze(['label', 'values', 'value', 'fmt', 'onChange']);

/** VECTOR — an ordered numeric tuple written WHOLE (design §2.2 — census #4/#5:
 *  placement/drag, rgb). {id,label,value,min,max,step,fmt,onChange,bind}.
 *  `min`/`max`/`step` are each a shared number OR a per-component array the
 *  SAME LENGTH as `value` — enforced by `_validateVector`. */
var VECTOR_KEYS = Object.freeze(['label', 'value', 'min', 'max', 'step', 'fmt', 'onChange']);

/** TEXT — a string-valued control (Item 2). {id,label,value,fmt,onChange,bind}. */
var TEXT_KEYS = Object.freeze(['label', 'value', 'fmt', 'onChange']);

/** ACTION — a momentary verb (Item 2). {id,label,action}; `action` ∈ ACTIONS.
 *  Stateless: no `value`, no `fmt`, no write-authority pair (the verb IS the write). */
var ACTION_KEYS = Object.freeze(['label', 'action']);

/**
 * REQUIRED_KEYS_BY_KIND — kind name → its kind-specific required-key list.
 * The SINGLE map the conformance test drives off (iterates KINDS, looks this up —
 * never a parallel switch/if-chain re-deriving which keys belong to which kind).
 */
var REQUIRED_KEYS_BY_KIND = Object.freeze({
    scalar: SCALAR_KEYS,
    camera: CAMERA_KEYS,
    loop:   LOOP_KEYS,
    enum:   ENUM_KEYS,
    flags:  FLAGS_KEYS,
    vector: VECTOR_KEYS,
    text:   TEXT_KEYS,
    action: ACTION_KEYS
});

/**
 * BIND_KEYS — required keys on a scalar/enum/flags/vector descriptor's optional
 * `bind` object (WS gym-controls-as-sugar binds+ControlSync FINAL design,
 * converged 2026-07-04: "Declarative binds + triggered sync"; extended to
 * enum/flags/vector by S1 — bind's DATA SHAPE is the SAME `{object, prop}` pair regardless
 * of kind, e.g. a `vector` bind on a LargeObject's `rect` writes the WHOLE
 * tuple in one accessor call, never a torn per-component write). `bind:
 * {object, prop}` is the DATA-SHAPE half of the contract — this module
 * validates the shape ONLY (both non-empty strings); it does NOT resolve
 * `object` or execute `prop` against any accessor. Execution (deriving
 * `get()`/`set()` through the property-accessor substrate, per-channel/per-
 * handle-kind dispatch) is OBJECTS-SIDE — it lives with the sugar that
 * already has the registry/accessor references
 * (`lib/frqtl/objects/objects/frqtl-controls-panel.js`, `controlBind.js`, and
 * `frqtl-control-sync.js`), never here (arrow ruling: shim owns the DATA
 * shape only). Bind's DATA SHAPE is uniform across channels AND kinds —
 * `channel` is a SIBLING field on the descriptor, already validated above; a
 * render-channel bind still carries `{object, prop}` here, even though the
 * render channel has no read-back (objects-side execution detail, not a shape
 * distinction — see the runtime doc's "non-uniform get()" ruling).
 */
var BIND_KEYS = Object.freeze(['object', 'prop']);

// ── Validation helpers ───────────────────────────────────────────────────────────

function _isFn(v)  { return typeof v === 'function'; }
function _isNum(v) { return typeof v === 'number' && isFinite(v); }
function _isStr(v) { return typeof v === 'string' && v.length > 0; }
function _isArr(v) { return Array.isArray(v); }
function _isBool(v) { return typeof v === 'boolean'; }

function _fail(id, kind, msg) {
    throw new Error('[lib/shim/controls] normalizeControlDescriptor(id="' + String(id) +
        '", kind="' + String(kind) + '"): ' + msg + ' (FAIL-LOUD — throw-or-apply, never ' +
        'silently dropped/defaulted-around).');
}

/**
 * Validate a descriptor's optional `bind: {object, prop}` — iterates the
 * exported `BIND_KEYS` table (never a hand-copied `if (!bind.object) … if
 * (!bind.prop) …` pair) so a future key added to the bind shape extends this
 * validator automatically. Shared by every bind-capable kind (scalar, enum,
 * flags, vector — S1: generalized from a scalar-only helper, same shape).
 */
function _validateBind(id, kind, bind) {
    if (!bind || typeof bind !== 'object') {
        _fail(id, kind, '"bind" must be an object {' + BIND_KEYS.join(', ') + '} when present.');
    }
    for (var i = 0; i < BIND_KEYS.length; i++) {
        var key = BIND_KEYS[i];
        if (!_isStr(bind[key])) {
            _fail(id, kind, '"bind.' + key + '" must be a non-empty string.');
        }
    }
}

/**
 * Validate the write-authority rule shared by scalar/enum/flags/vector
 * (converged 2026-07-04, XOR retracted on the 0/9 census of shipped CONTROLS
 * arrays — every one needed a computed onChange, so a bind-replaces-onChange
 * XOR would have made `bind` unusable everywhere): at least ONE of
 * `onChange`/`bind` is required; BOTH may coexist (bind then supplies `get()`
 * for ControlSync even on a control that keeps its computed `onChange` as the
 * mutation path); NEITHER present is a dead control — FAIL-LOUD.
 */
function _validateWriteAuthority(id, kind, d) {
    var hasOnChange = d.onChange !== undefined;
    var hasBind = d.bind !== undefined;
    if (!hasOnChange && !hasBind) {
        _fail(id, kind, '"onChange" or "bind" is required — at least ONE write path must be ' +
            'declared (a control with neither is a dead control). Supply onChange (a function) ' +
            'and/or bind ({object,prop}).');
    }
    if (hasOnChange && !_isFn(d.onChange)) {
        _fail(id, kind, '"onChange", when present, must be a function(value)->void.');
    }
    if (hasBind) { _validateBind(id, kind, d.bind); }
}

/**
 * Validate a 'scalar' descriptor's kind-specific fields.
 */
function _validateScalar(id, d) {
    if (!_isStr(d.label))      { _fail(id, 'scalar', '"label" must be a non-empty string.'); }
    if (!_isNum(d.min))        { _fail(id, 'scalar', '"min" must be a finite number.'); }
    if (!_isNum(d.max))        { _fail(id, 'scalar', '"max" must be a finite number.'); }
    if (!_isNum(d.step))       { _fail(id, 'scalar', '"step" must be a finite number.'); }
    if (typeof d.value !== 'number' || !isFinite(d.value)) {
        _fail(id, 'scalar', '"value" must be a finite number.');
    }
    if (!_isFn(d.fmt))         { _fail(id, 'scalar', '"fmt" must be a function(value)->string.'); }
    _validateWriteAuthority(id, 'scalar', d);
}

/**
 * Validate an 'enum' descriptor's kind-specific fields — select-ONE from a
 * closed candidate set (design §2.2 — census #6: collision_type/gateType/
 * reposition). `value` MUST be a member of `values`.
 */
function _validateEnum(id, d) {
    if (!_isStr(d.label))  { _fail(id, 'enum', '"label" must be a non-empty string.'); }
    if (!_isArr(d.values) || d.values.length === 0 || !d.values.every(_isStr)) {
        _fail(id, 'enum', '"values" must be a non-empty array of non-empty strings.');
    }
    if (!_isStr(d.value))  { _fail(id, 'enum', '"value" must be a non-empty string.'); }
    if (d.values.indexOf(d.value) === -1) {
        _fail(id, 'enum', '"value" ("' + d.value + '") must be a member of "values" ([' +
            d.values.join(', ') + ']) — enum is select-ONE from a closed candidate set.');
    }
    if (!_isFn(d.fmt))     { _fail(id, 'enum', '"fmt" must be a function(value)->string.'); }
    _validateWriteAuthority(id, 'enum', d);
}

/**
 * Validate a 'flags' descriptor's kind-specific fields — multi-select from a
 * closed candidate set (design §2.2 — census #6: the `actions` enum-set
 * field). `value` is an ARRAY; every element MUST be a member of `values`.
 */
function _validateFlags(id, d) {
    if (!_isStr(d.label))  { _fail(id, 'flags', '"label" must be a non-empty string.'); }
    if (!_isArr(d.values) || d.values.length === 0 || !d.values.every(_isStr)) {
        _fail(id, 'flags', '"values" must be a non-empty array of non-empty strings.');
    }
    if (!_isArr(d.value) || !d.value.every(_isStr)) {
        _fail(id, 'flags', '"value" must be an array of non-empty strings (may be empty — zero flags set).');
    }
    for (var i = 0; i < d.value.length; i++) {
        if (d.values.indexOf(d.value[i]) === -1) {
            _fail(id, 'flags', '"value[' + i + ']" ("' + d.value[i] + '") must be a member of "values" ([' +
                d.values.join(', ') + ']) — flags is a SUBSET of the closed candidate set.');
        }
    }
    if (!_isFn(d.fmt))     { _fail(id, 'flags', '"fmt" must be a function(value)->string.'); }
    _validateWriteAuthority(id, 'flags', d);
}

/**
 * Validate one min/max/step field of a 'vector' descriptor: either a SHARED
 * finite number (applies to every component) or an array of finite numbers
 * the SAME LENGTH as `value` (a per-component bound).
 */
function _validateVectorBound(id, key, v, valueLength) {
    if (_isNum(v)) { return; }
    if (_isArr(v) && v.length === valueLength && v.every(_isNum)) { return; }
    _fail(id, 'vector', '"' + key + '" must be a finite number (shared across every component) or an ' +
        'array of ' + valueLength + ' finite number(s) (one per component of "value") — got ' +
        JSON.stringify(v) + '.');
}

/**
 * Validate a 'vector' descriptor's kind-specific fields — an ordered numeric
 * tuple written WHOLE (design §2.2 — census #4/#5: placement/drag, rgb).
 * Length is FREE: `value` may be any non-empty array of finite numbers (a
 * 2-tuple x/y, a 4-tuple rect, a 6-tuple 3D rect, a 3-tuple rgb — all the same
 * kind, differing only in `value.length`).
 */
function _validateVector(id, d) {
    if (!_isStr(d.label)) { _fail(id, 'vector', '"label" must be a non-empty string.'); }
    if (!_isArr(d.value) || d.value.length === 0 || !d.value.every(_isNum)) {
        _fail(id, 'vector', '"value" must be a non-empty array of finite numbers.');
    }
    _validateVectorBound(id, 'min', d.min, d.value.length);
    _validateVectorBound(id, 'max', d.max, d.value.length);
    _validateVectorBound(id, 'step', d.step, d.value.length);
    if (!_isFn(d.fmt))    { _fail(id, 'vector', '"fmt" must be a function(value)->string.'); }
    _validateWriteAuthority(id, 'vector', d);
}

/**
 * Validate a 'text' descriptor's kind-specific fields — a STRING-valued control
 * (Item 2). Same write-authority rule as every other bare-onChange kind.
 */
function _validateText(id, d) {
    if (!_isStr(d.label)) { _fail(id, 'text', '"label" must be a non-empty string.'); }
    if (typeof d.value !== 'string') {
        _fail(id, 'text', '"value" must be a string (a text control\'s value; may be empty).');
    }
    if (!_isFn(d.fmt))    { _fail(id, 'text', '"fmt" must be a function(value)->string.'); }
    _validateWriteAuthority(id, 'text', d);
}

/**
 * Validate an 'action' descriptor — a momentary verb naming a member of the
 * closed ACTIONS vocabulary. NO write-authority pair: the verb IS the write, and
 * its execution lives objects-side (controlAction.js), never in a closure here.
 */
function _validateAction(id, d) {
    if (!_isStr(d.label)) { _fail(id, 'action', '"label" must be a non-empty string.'); }
    if (!_isStr(d.action) || ACTIONS.indexOf(d.action) === -1) {
        _fail(id, 'action', '"action" must be one of [' + ACTIONS.join(', ') + ']; got ' +
            JSON.stringify(d.action) + '.');
    }
    if (d.bind !== undefined) {
        _fail(id, 'action', 'an action descriptor must NOT declare "bind" — an action is a VERB, ' +
            'not a property read/write pair (a get() of "' + d.action + '" is meaningless). ' +
            'Execution is objects-side, by action NAME.');
    }
}

/**
 * Validate an optional `place: {x, y, anchor}` — iterates the exported PLACE_KEYS
 * (never a hand-copied per-key if-chain), the SAME discipline as _validateBind.
 * `anchor` is optional here; normalizeControlDescriptor resolves the default.
 */
function _validatePlace(id, kind, place) {
    if (!place || typeof place !== 'object' || _isArr(place)) {
        _fail(id, kind, '"place" must be an object {' + PLACE_KEYS.join(', ') + '} when present.');
    }
    for (var i = 0; i < PLACE_KEYS.length; i++) {
        var key = PLACE_KEYS[i];
        var v = place[key];
        if (key === 'anchor') {
            if (v !== undefined && PLACE_ANCHORS.indexOf(v) === -1) {
                _fail(id, kind, '"place.anchor" must be one of [' + PLACE_ANCHORS.join(', ') +
                    '] when present; got ' + JSON.stringify(v) + '.');
            }
            continue;
        }
        if (!_isNum(v) || v < 0 || v > 1) {
            _fail(id, kind, '"place.' + key + '" must be a number in [0,1] — a FRACTION of the ' +
                'canvas (resize-stable), not a pixel offset; got ' + JSON.stringify(v) + '.');
        }
    }
}

/** Validate a 'camera' descriptor's kind-specific fields. */
function _validateCamera(id, d) {
    if (!_isArr(d.presets) || !d.presets.every(_isStr)) {
        _fail(id, 'camera', '"presets" must be an array of non-empty strings.');
    }
    if (!_isFn(d.setOrbit))  { _fail(id, 'camera', '"setOrbit" must be a function(spec)->void.'); }
    if (!_isFn(d.getOrbit))  { _fail(id, 'camera', '"getOrbit" must be a function()->{azimuth,elevation,distance}.'); }
    if (!_isFn(d.setPreset)) { _fail(id, 'camera', '"setPreset" must be a function(name)->void.'); }
}

/** Validate a 'loop' descriptor's kind-specific fields. */
function _validateLoop(id, d) {
    if (!_isBool(d.enabled)) { _fail(id, 'loop', '"enabled" must be a boolean.'); }
    if (!_isNum(d.ticks) || d.ticks <= 0) { _fail(id, 'loop', '"ticks" must be a positive finite number.'); }
    if (!_isFn(d.setEnabled)) { _fail(id, 'loop', '"setEnabled" must be a function(boolean)->void.'); }
    if (!_isFn(d.setTicks))   { _fail(id, 'loop', '"setTicks" must be a function(number)->void.'); }
}

var _VALIDATORS_BY_KIND = {
    scalar: _validateScalar,
    camera: _validateCamera,
    loop:   _validateLoop,
    enum:   _validateEnum,
    flags:  _validateFlags,
    vector: _validateVector,
    text:   _validateText,
    action: _validateAction
};

/**
 * normalizeControlDescriptor(partial) → full bag.
 *
 * THROW-OR-APPLY (ratified §2 "Normalize semantics"): a malformed descriptor throws
 * here — it is NEVER silently dropped, defaulted-around, or coerced into a
 * different kind. A caller that wants a control MUST supply one that already
 * conforms; there is no "best effort" partial-acceptance path.
 *
 * @param {object} partial — a candidate control descriptor. Must carry:
 *   - `kind`    — one of KINDS (required).
 *   - `id`      — non-empty string (required on EVERY kind — the registry
 *                 addressing key; see lib/shim/controls/registry.js).
 *   - `channel` — one of CHANNELS (optional; defaults to DEFAULT_CHANNEL on
 *                 DEFAULT_CHANNEL_KINDS members ONLY — see the CHANNELS doc
 *                 comment above).
 *   - the kind-specific fields in REQUIRED_KEYS_BY_KIND[kind].
 * @returns {object} a NEW object (the input is never mutated) carrying every
 *   input key verbatim plus a resolved `channel`.
 * @throws {Error} FAIL-LOUD on a missing/unrecognized `kind`, a missing/empty
 *   `id`, a bad `channel`, or any missing/mistyped kind-specific field.
 */
function normalizeControlDescriptor(partial) {
    if (!partial || typeof partial !== 'object') {
        throw new Error('[lib/shim/controls] normalizeControlDescriptor requires a descriptor ' +
            'object; got ' + (partial === null ? 'null' : typeof partial) + '. (FAIL-LOUD.)');
    }
    var kind = partial.kind;
    if (KINDS.indexOf(kind) === -1) {
        throw new Error('[lib/shim/controls] normalizeControlDescriptor: unknown kind "' +
            String(kind) + '" (expect one of [' + KINDS.join(', ') + ']). (FAIL-LOUD.)');
    }
    var id = partial.id;
    if (!_isStr(id)) {
        _fail(id, kind, '"id" must be a non-empty string (every kind requires one — the ' +
            'registry addressing key).');
    }
    var channel = partial.channel;
    if (channel !== undefined && CHANNELS.indexOf(channel) === -1) {
        _fail(id, kind, '"channel" must be one of [' + CHANNELS.join(', ') + '] when present; got "' +
            String(channel) + '".');
    }

    // Kind-ORTHOGONAL optional fields (Item 2): a widget override and a canvas
    // placement. Validated for EVERY kind, here, exactly once.
    if (partial.widget !== undefined && WIDGETS.indexOf(partial.widget) === -1) {
        _fail(id, kind, '"widget" must be one of [' + WIDGETS.join(', ') + '] when present; got ' +
            JSON.stringify(partial.widget) + '. (widget is kind-ORTHOGONAL — a toggle is a scalar ' +
            '0/1 with widget:"toggle", never a new kind.)');
    }
    if (partial.place !== undefined) { _validatePlace(id, kind, partial.place); }

    _VALIDATORS_BY_KIND[kind](id, partial);

    // Build a FRESH bag — never mutate the caller's object (mirrors
    // frame-data's normalizeDataBubble / normalizeRenderIntent convention).
    var bag = {};
    for (var k in partial) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) { bag[k] = partial[k]; }
    }
    bag.kind = kind;
    bag.id = id;
    // channel resolution: DEFAULT_CHANNEL applies ONLY to DEFAULT_CHANNEL_KINDS
    // members when omitted; camera/loop carry whatever was declared (or
    // remain undefined — channel is optional metadata for them, never forced,
    // per the doc comment).
    if (channel === undefined) {
        bag.channel = (DEFAULT_CHANNEL_KINDS.indexOf(kind) !== -1) ? DEFAULT_CHANNEL : undefined;
    } else {
        bag.channel = channel;
    }
    // place: carried as a FRESH object with the anchor default resolved, so every
    // host reads a complete placement (no per-host default re-derivation).
    if (partial.place !== undefined) {
        bag.place = {
            x: partial.place.x,
            y: partial.place.y,
            anchor: (partial.place.anchor !== undefined) ? partial.place.anchor : DEFAULT_PLACE_ANCHOR
        };
    }
    return bag;
}

// ── Export ────────────────────────────────────────────────────────────────────

var ControlsSchema = {
    KINDS:                     KINDS,
    CHANNELS:                  CHANNELS,
    ACTIONS:                   ACTIONS,
    PLACE_KEYS:                PLACE_KEYS,
    PLACE_ANCHORS:             PLACE_ANCHORS,
    DEFAULT_PLACE_ANCHOR:      DEFAULT_PLACE_ANCHOR,
    WIDGETS:                   WIDGETS,
    TEXT_KEYS:                 TEXT_KEYS,
    ACTION_KEYS:               ACTION_KEYS,
    DEFAULT_CHANNEL:           DEFAULT_CHANNEL,
    DEFAULT_CHANNEL_KINDS:     DEFAULT_CHANNEL_KINDS,
    SCALAR_KEYS:               SCALAR_KEYS,
    CAMERA_KEYS:               CAMERA_KEYS,
    LOOP_KEYS:                 LOOP_KEYS,
    ENUM_KEYS:                 ENUM_KEYS,
    FLAGS_KEYS:                FLAGS_KEYS,
    VECTOR_KEYS:               VECTOR_KEYS,
    REQUIRED_KEYS_BY_KIND:     REQUIRED_KEYS_BY_KIND,
    BIND_KEYS:                 BIND_KEYS,
    normalizeControlDescriptor: normalizeControlDescriptor
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlsSchema;
} else if (typeof window !== 'undefined') {
    window.ControlsSchema = ControlsSchema;
}

})();
