/* Copyright 2023-2026 by Essam Abadir */

/**
 * valueNormalizer.js — the DECLARED-TYPE write gate for object properties.
 *
 * The sibling of `schema/index.js` inside the ONE descriptor owner
 * (`lib/frqtl/objects/schema/`): index.js declares WHAT type each field is, this file
 * states what that declaration MEANS at a write. Its single public entry point is
 * re-exported as `ObjectSchema.normalizeValue` — consumers call it through ObjectSchema
 * and never import this file directly, so there is exactly one public surface.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *   normalizeValue(fieldDef, value, kind?) -> normalized value | THROW
 *   TYPES                                  -> the row keys (asserted === FIELD_TYPES by
 *                                             schema/index.js at load time)
 *   RECT_TUPLE                             -> THE order of the rect write tuple, by length
 *   rectTupleText(n)                       -> that order as text, '[left, top, z, w, h, d]'
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * None. A type gate on the write path — no engine state, no RNG draw. It REJECTS values
 * the engine would otherwise have been handed as NaN geometry or a wrong wire type.
 * Bench goldens cannot move (SU1).
 *
 * An ES module; objects/schema/index.js imports it.
 */


// ── Declared-type VALUE normalization (the write-time gate) ───────────────
//
// ONE entry point, exported by the descriptor owner:
//
//     ObjectSchema.normalizeValue(fieldDef, value, kind?) → normalized value | THROW
//
// A field descriptor DECLARES a type; this is where that declaration is ENFORCED at
// the write. Throw-or-apply: the call either returns the value in the declared type's
// canonical form, or throws naming kind/field/expected type. Never a silent accept —
// a wrong-typed value that is merely STORED poisons every later reader (a non-array
// `color` reaching the renderer throws `s.color.join is not a function` on every
// frame, far from the write that caused it), which is the same failure class as a
// silently no-op write.
//
// Consumers FERRY this; they never re-implement a per-type predicate:
//   - lib/frqtl/objects/FrqtlApp.js `updateObjectProperty` — the write gate,
//     calls it ONCE after the readonly check (this is also where the `boolean` 0/1
//     coercion lives now; it used to be hand-inlined there as the first row of this
//     table).
//   - lib/frqtl/objects/objects/makeControlsForObject.js `_rgbHandler` — the READ-side
//     "is this a valid rgb value" probe.
//
// Rows are keyed by the ONE field-type vocabulary (lib/shim/field-descriptor's
// FIELD_TYPES); `schema/index.js` asserts the row keys ARE that list at load time, so a
// 13th type added at that owner without a row here FAILS LOUD at boot rather than
// silently passing an unvalidated value through.
//
// Per-type contract:
//   number     — a finite JS number. A numeric STRING is NOT a number (the caller
//                parses). `constraint.integer` ROUNDS (canonical form, the same
//                normalization spirit as boolean 0/1 → false/true);
//                `constraint.min`/`max` are ENFORCED (out of the declared range
//                throws — a clamp would silently store something the caller never
//                asked for).
//   boolean    — true | false | 0 | 1, stored as the boolean (generic controls carry
//                booleans as a 0/1 scalar, and every consumer tests IDENTITY: a stored
//                0 reads as "still visible"). Anything else throws — `'false'` is truthy
//                and would silently store `true`.
//   string     — a JS string (empty allowed).
//   enum       — a declared member: a KEY or a VALUE of `constraint.values` (that map
//                is identity for every enum but SlitScreen.detectAtSlits, whose
//                values are the numeric wire codes). A field declaring NO vocabulary
//                validates the primitive shape only (string|number).
//   enum-set   — an ARRAY whose every element is a declared member (copy returned).
//   rgb        — STRICTLY an array of exactly 3 finite numbers (copy returned). CSV
//                and hex are NOT accepted: the CSV 'r,g,b,a' form is the frame-data
//                `string_map['render.color']` WIRE format owned by lib/shim/frame-data,
//                and parsing it here would mint a second interpreter of that wire
//                outside its owner. A caller holding CSV/hex converts at the format
//                owner BEFORE the write.
//   rect       — the WRITE wire form: an array of 4 or 6 finite numbers in the order
//                RECT_TUPLE names (below). Not the `{left,top,w,h}` READ shape —
//                `updateObjectProperty` indexes the value positionally.
//   rect-array — an array of rect-shaped arrays (deep copy returned).
//   readonly   — every write throws (derived/computed: inspectable, not editable).
//   forbidden  — every write throws (engine-owned topology).
//   object     — any non-null object, arrays included (op-program bags, `center`
//                [x,y,z], a `region`). Returned by REFERENCE — these bags are live.
//   writable   — passthrough: a Frame-kind ACCESS-LEVEL tag, not a value type (the
//                actual type is inferred from the live read).
//
// `null`/`undefined` pass through UNCHANGED for every type except readonly/forbidden:
// "unset" is a DECLARED, type-agnostic value across this schema — `layer: null` means
// all layers, a null LIVE override (SphereEmitter.renderShape / renderColor) means
// "scheme default". It is a legitimate write, not a type error.

function _describeValue(v) {
    if (v === null) { return 'null'; }
    if (v === undefined) { return 'undefined'; }
    if (Array.isArray(v)) { return 'array(length ' + v.length + ')'; }
    return typeof v;
}

function _previewValue(v) {
    var s;
    try { s = JSON.stringify(v); } catch (e) { s = String(v); }
    if (s === undefined) { s = String(v); }
    return (s.length > 60) ? (s.slice(0, 60) + '…') : s;
}

function _valueFail(kind, field, expected, value) {
    throw new TypeError('[lib/frqtl/objects/schema] normalizeValue: ' +
        (kind || '<kind>') + '.' + (field && field.name ? field.name : '<field>') +
        ' is declared type "' + (field && field.type) + '" and expects ' + expected +
        '; got ' + _describeValue(value) + ' ' + _previewValue(value) +
        '. (FAIL-LOUD — throw-or-apply, never a silently accepted wrong type.)');
}

function _isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

// ── THE rect write-tuple ORDER — one owner ────────────────────────────────
//
// The positional order of a `type:'rect'` write, keyed by tuple length. Every decode of a
// rect tuple (FrqtlApp.updateObjectProperty → Wall.setRect / LargeObject.setRect, the
// LargeObject constructor, LoDrawnCenter.rectAtCenter, worldRect below, and the engine's
// Rectangle::from_top_left(left, top, near, w, h, d) behind the WASM ABI) indexes in this
// order; `objects/test/rect-tuple-order.test.mjs` feeds each a tuple built BY NAME from this table and
// reads every field back by name. Every descriptor description that spells a tuple
// DERIVES its text from rectTupleText — never a hand-typed list.
var RECT_TUPLE = Object.freeze({
    4: Object.freeze(['left', 'top', 'w', 'h']),
    6: Object.freeze(['left', 'top', 'z', 'w', 'h', 'd'])
});

/** rectTupleText(n) → the order of the n-element rect tuple as text, e.g. '[left, top, z, w, h, d]'. */
function rectTupleText(n) {
    if (!Object.prototype.hasOwnProperty.call(RECT_TUPLE, n)) {
        throw new TypeError('[lib/frqtl/objects/schema] rectTupleText(' + _previewValue(n) +
            '): a rect tuple has ' + Object.keys(RECT_TUPLE).join(' or ') + ' elements. (FAIL-LOUD.)');
    }
    return '[' + RECT_TUPLE[n].join(', ') + ']';
}

/**
 * The declared members of an enum/enum-set field: the KEYS of constraint.values plus
 * their VALUES (identical for every identity map; distinct for the numeric-wire-code
 * map). Returns null when the field declares no vocabulary — the caller then validates
 * the primitive shape only.
 */
function _enumMembers(field) {
    var values = (field.constraint && field.constraint.values) || null;
    if (!values || typeof values !== 'object') { return null; }
    var keys = Object.keys(values);
    if (keys.length === 0) { return null; }
    var members = keys.slice();
    for (var i = 0; i < keys.length; i++) {
        if (members.indexOf(values[keys[i]]) === -1) { members.push(values[keys[i]]); }
    }
    return members;
}

function _normalizeEnumMember(field, value, kind) {
    var members = _enumMembers(field);
    if (!members) {
        if (typeof value !== 'string' && typeof value !== 'number') {
            _valueFail(kind, field, 'a string or number (this field declares no ' +
                'constraint.values vocabulary to check against)', value);
        }
        return value;
    }
    if (members.indexOf(value) === -1) {
        _valueFail(kind, field, 'one of [' + members.join(', ') + ']', value);
    }
    return value;
}

function _normalizeRectTuple(field, value, kind, what) {
    if (!Array.isArray(value) || (value.length !== 4 && value.length !== 6) ||
        !value.every(_isFiniteNumber)) {
        _valueFail(kind, field, what, value);
    }
    return value.slice();
}

/**
 * worldRect(r, where?) → { w, h[, left, top][, z, d] } — THE world-rect shape normalizer.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────
 * THROW-OR-APPLY on a world/canvas rect handed to a part or factory. Accepts the
 * canonical `{left, top, w, h}` bag (a `Rectangle` is one, structurally) or the rect
 * tuple this file already owns (RECT_TUPLE).
 * THROWS when `r` is absent or `w`/`h` is missing, non-numeric or non-positive — a
 * zero-high detector counts nothing and would report it as physics. `{width, height}`
 * is not a rect spelling and throws like any other missing dimension. The origin
 * (`left`/`top`) and the z pair are FERRIED when present and never defaulted.
 *
 * The world rect has ONE writer — the co-init call (`EGPTUniverse.create({rect})` ←
 * `new FrqtlApp({canvasW, canvasH})` / `exp.createCanvas(w, h, cfg)`); this only reads.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────
 * None. No engine state, no RNG draw.
 *
 * @param {Object|Array} r
 * @param {string} [where] — the reading site, quoted in the error.
 * @returns {{w:number, h:number, left?:number, top?:number, z?:number, d?:number}}
 */
function worldRect(r, where) {
    var site = where || 'worldRect(r)';
    function fail(why) {
        throw new TypeError('[lib/frqtl/objects/schema] ' + site + ': ' + why + '; got ' +
            _describeValue(r) + ' ' + _previewValue(r) + '. A world rect is { left, top, w, h } ' +
            '(or the ' + rectTupleText(4) + ' / ' + rectTupleText(6) + ' tuple) with positive w and h, ' +
            'written ONCE by the co-init call — EGPTUniverse.create({ rect }) ← new FrqtlApp({ ' +
            'canvasW, canvasH }) / exp.createCanvas(w, h, cfg). There is no default world size. ' +
            '(FAIL-LOUD.)');
    }
    if (r === null || r === undefined || typeof r !== 'object') { fail('no world rect'); }
    var out;
    if (Array.isArray(r)) {
        if ((r.length !== 4 && r.length !== 6) || !r.every(_isFiniteNumber)) {
            fail('a rect tuple must be 4 or 6 finite numbers');
        }
        out = (r.length === 4)
            ? { left: r[0], top: r[1], w: r[2], h: r[3] }
            : { left: r[0], top: r[1], z: r[2], w: r[3], h: r[4], d: r[5] };
    } else {
        out = { w: r.w, h: r.h };
        ['left', 'top', 'z', 'd'].forEach(function (k) {
            if (r[k] === undefined || r[k] === null) { return; }
            if (!_isFiniteNumber(r[k])) { fail('"' + k + '" must be a finite number'); }
            out[k] = r[k];
        });
    }
    if (!_isFiniteNumber(out.w) || !(out.w > 0)) { fail('w must be a positive finite number'); }
    if (!_isFiniteNumber(out.h) || !(out.h > 0)) { fail('h must be a positive finite number'); }
    return out;
}

var VALUE_NORMALIZERS = {
    number: function (field, value, kind) {
        if (!_isFiniteNumber(value)) {
            _valueFail(kind, field, 'a finite number (a numeric STRING is not a ' +
                'number — parse it at the caller)', value);
        }
        var c = field.constraint || {};
        var out = (c.integer === true) ? Math.round(value) : value;
        if (typeof c.min === 'number' && out < c.min) {
            _valueFail(kind, field, 'a value >= the declared min ' + c.min, value);
        }
        if (typeof c.max === 'number' && out > c.max) {
            _valueFail(kind, field, 'a value <= the declared max ' + c.max, value);
        }
        return out;
    },
    boolean: function (field, value, kind) {
        if (value === true || value === 1) { return true; }
        if (value === false || value === 0) { return false; }
        _valueFail(kind, field, 'true, false, 0 or 1', value);
    },
    string: function (field, value, kind) {
        if (typeof value !== 'string') { _valueFail(kind, field, 'a string', value); }
        return value;
    },
    'enum': function (field, value, kind) {
        return _normalizeEnumMember(field, value, kind);
    },
    'enum-set': function (field, value, kind) {
        if (!Array.isArray(value)) {
            _valueFail(kind, field, 'an array of declared members', value);
        }
        for (var i = 0; i < value.length; i++) { _normalizeEnumMember(field, value[i], kind); }
        return value.slice();
    },
    rgb: function (field, value, kind) {
        if (!Array.isArray(value) || value.length !== 3 || !value.every(_isFiniteNumber)) {
            _valueFail(kind, field, 'an array of exactly 3 finite numbers [r, g, b] ' +
                '(a CSV "r,g,b,a" string is the frame-data render wire, not this ' +
                'field — convert at lib/shim/frame-data before the write)', value);
        }
        return value.slice();
    },
    rect: function (field, value, kind) {
        return _normalizeRectTuple(field, value, kind,
            'an array of 4 finite numbers ' + rectTupleText(4) + ' or the 6-element ' +
            'explicit z/depth form ' + rectTupleText(6));
    },
    'rect-array': function (field, value, kind) {
        if (!Array.isArray(value)) {
            _valueFail(kind, field, 'an array of rect tuples', value);
        }
        var out = [];
        for (var i = 0; i < value.length; i++) {
            out.push(_normalizeRectTuple(field, value[i], kind,
                'every entry to be an array of 4 finite numbers ' + rectTupleText(4) +
                ' (or 6, ' + rectTupleText(6) + '); entry ' + i + ' is not'));
        }
        return out;
    },
    readonly: function (field, value, kind) {
        _valueFail(kind, field, 'NO write at all — a readonly field is derived/' +
            'computed and inspectable only', value);
    },
    forbidden: function (field, value, kind) {
        _valueFail(kind, field, 'NO write at all — this property is engine-owned ' +
            'topology', value);
    },
    object: function (field, value, kind) {
        if (typeof value !== 'object') {
            _valueFail(kind, field, 'a structured object (arrays included)', value);
        }
        return value;   // by REFERENCE — op-program / region / center bags are live
    },
    writable: function (field, value) { return value; }
};

/**
 * normalizeValue(fieldDef, value, kind) → the value in its declared canonical form.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────
 * THROW-OR-APPLY. `fieldDef` is a descriptor field object (`ObjectSchema.get(kind)
 * .fields[i]`); `kind` is optional context that only sharpens the error message.
 * Throws a TypeError naming kind/field/declared-type/expected-form when the value
 * cannot be accepted. See the per-type contract table above.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────
 * None. This is a type gate on the write path — it changes no engine state, draws no
 * RNG, and rejects values the engine would otherwise have been handed as NaN
 * geometry or a wrong wire type. Bench goldens cannot move (SU1).
 *
 * @param {{name:string, type:string, constraint?:object}} fieldDef
 * @param {*} value
 * @param {string} [kind] — the object kind, for the error message.
 * @returns {*} the normalized value.
 * @throws {TypeError} FAIL-LOUD on a wrong type / undeclared enum member / declared-
 *   constraint violation / any write to a readonly or forbidden field.
 */
function normalizeValue(fieldDef, value, kind) {
    if (!fieldDef || typeof fieldDef !== 'object' || typeof fieldDef.type !== 'string') {
        throw new TypeError('[lib/frqtl/objects/schema] normalizeValue requires a field ' +
            'descriptor carrying a "type"; got ' + _describeValue(fieldDef) +
            '. (FAIL-LOUD.)');
    }
    if (!Object.prototype.hasOwnProperty.call(VALUE_NORMALIZERS, fieldDef.type)) {
        throw new TypeError('[lib/frqtl/objects/schema] normalizeValue: field "' +
            fieldDef.name + '" declares type "' + fieldDef.type + '", which has no ' +
            'normalizer row. Field types are owned by lib/shim/field-descriptor ' +
            '(FIELD_TYPES) — add the type THERE and a row in VALUE_NORMALIZERS here. ' +
            '(FAIL-LOUD.)');
    }
    var row = VALUE_NORMALIZERS[fieldDef.type];
    // readonly/forbidden reject EVERY write, the unset sentinel included.
    if (fieldDef.type === 'readonly' || fieldDef.type === 'forbidden') {
        return row(fieldDef, value, kind);
    }
    // The unset sentinel — a DECLARED, type-agnostic value here (layer:null = all
    // layers; a null LIVE override = scheme default). A legitimate write, not a type
    // error.
    if (value === null || value === undefined) { return value; }
    return row(fieldDef, value, kind);
}

// ── Export ────────────────────────────────────────────────────────────────────

// The row keys — schema/index.js asserts these are EXACTLY lib/shim/field-descriptor's FIELD_TYPES at
// load time (the type vocabulary has ONE owner; this is the drift gate, never a second vocabulary).
const TYPES = Object.freeze(Object.keys(VALUE_NORMALIZERS));

// RECT_TUPLE + rectTupleText: THE rect write-tuple order and its text form.
export { normalizeValue, worldRect, RECT_TUPLE, rectTupleText, TYPES };
