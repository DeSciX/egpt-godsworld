/* Copyright 2023-2026 by Essam Abadir */

/**
 * parts-spelling.js — THE rule for spelling a written value in a `parts` entry's OWN form. A hand's value and a Record
 * row's value are the CAPTURE form (ObjectSchema.captureProps); the entry keeps the form its author wrote. Two
 * consumers ask it, so the text and the block agree by construction:
 *   - the writer (RecipeContext toSketch / setDeclared), reading the entry's form off the sketch TEXT;
 *   - applyRows (record-format.js), reading it off a parts BLOCK ({ name: [kind name, props] }).
 *
 *   spellRect(props, { kind, entryKeys, baseline }) — a 6-tuple of a field whose descriptor derives reads from it
 *       (ObjectSchema.derivedReads: Wall `z`, `depth`) is written as the 4-tuple plus each derived key whose value
 *       changed, when the entry spells any of those keys as plain properties; otherwise the 6-tuple stands. A
 *       4-tuple equal to the baseline's is not written (no literalizing an untouched expression).
 *   spellCenter(props, { entryKeys, centerLength }) — a `center` [x, y, 0] is written as two numbers when the entry
 *       spells two; otherwise the [x, y, z] stands.
 *   captureCenter(v) — the inverse: a spelled `center` in its capture form. [x, y] → [x, y, 0] (an omitted z is 0,
 *       the reading placeDeclaredAt gives it); [x, y, z] stands. THROWS on anything else.
 *
 * `entryKeys()` → the keys the entry spells; `centerLength()` → the element count its `center` spells, or null.
 * Both are asked lazily (only when a value needs them). Each function mutates and returns `props`.
 */

import { ObjectSchema } from '../../frqtl/objects/schema/index.js';

const _JSON = function (v) { return JSON.stringify(v); };

function _hasSix(props) {
    return Object.keys(props).some(function (f) { return Array.isArray(props[f]) && props[f].length === 6; });
}

/** @param {object} props @param {{ kind: string, entryKeys: function(): string[], baseline: object }} o */
export function spellRect(props, o) {
    if (!_hasSix(props)) { return props; }
    const derived = ObjectSchema.derivedReads(o.kind);
    if (!derived.length) { return props; }
    const spelled = o.entryKeys();
    const baseline = o.baseline || {};
    const R4 = ObjectSchema.RECT_TUPLE[4], R6 = ObjectSchema.RECT_TUPLE[6];
    Object.keys(props).forEach(function (f) {
        const v = props[f];
        const rows = derived.filter(function (d) { return d.field === f && d.tuple === 6 && spelled.indexOf(d.name) !== -1; });
        if (!rows.length || !Array.isArray(v) || v.length !== 6) { return; }
        const b = Array.isArray(baseline[f]) && baseline[f].length === 6 ? baseline[f] : null;
        const four = R4.map(function (k) { return v[R6.indexOf(k)]; });
        if (b && _JSON(four) === _JSON(R4.map(function (k) { return b[R6.indexOf(k)]; }))) { delete props[f]; }
        else { props[f] = four; }
        rows.forEach(function (d) {
            const nv = v[R6.indexOf(d.key)];
            if (!b || nv !== b[R6.indexOf(d.key)]) { props[d.name] = nv; }
        });
    });
    return props;
}

/** @param {number[]} v a spelled center @returns {number[]} its capture form [x, y, z] (a new array) */
export function captureCenter(v) {
    if (!Array.isArray(v) || (v.length !== 2 && v.length !== 3) || !v.every(function (n) { return typeof n === 'number'; })) {
        throw new TypeError('[parts-spelling] captureCenter: a center is [x, y] or [x, y, z] numbers, got ' + JSON.stringify(v) + '. (FAIL-LOUD.)');
    }
    return v.length === 2 ? [v[0], v[1], 0] : v.slice();
}

/** @param {object} props @param {{ entryKeys: function(): string[], centerLength: function(): (number|null) }} o */
export function spellCenter(props, o) {
    const v = props.center;
    if (!Array.isArray(v) || v.length !== 3 || v[2] !== 0) { return props; }
    if (o.entryKeys().indexOf('center') === -1) { return props; }
    if (o.centerLength() === 2) { props.center = [v[0], v[1]]; }
    return props;
}
