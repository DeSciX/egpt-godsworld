/* Copyright 2023-2026 by Essam Abadir */

/**
 * record-format.js — THE owner of the Record folder's shape (the sketch-projects design §6), and its ONE writer.
 *
 * A Record is its own folder, and it contains the project it recorded:
 *
 *   record.json          { tickRange: [first, last], clips: ['clip-01.mp4', …], changes: [{tick, name, op, by, from, to}] }
 *   clip-01.mp4 …        the FrqtlVision footage, one file per CLIP_SECONDS segment, in the order filmed
 *   parts.before.json    { "<name>": ["<registered kind name>", {props}] } at Record start, in key order
 *   parts.after.json     the same at stop; their diff IS the code change
 *   project/…            the project's files at stop (frqtl.json, sketch.js, parts/*, README), replayable
 *                        through bootProject
 *
 * A host's own files (a lab's lab.json) may sit beside these; this module never reads or checks them.
 *
 *   RECORD_FILES         the folder's §6 paths (record, partsBefore, partsAfter, project)
 *   RECORD_KEYS          record.json's keys, exactly — there is no record-level who
 *   CHANGE_KEYS          one change row's keys, exactly
 *   OPS                  the change ops: a placement is `move` whatever hand made it
 *   BY                   who acted, per row
 *   CLIP_SECONDS         { min, max } — the length of one clip, in seconds of playback
 *   CLIP_NAME            the clip file pattern; clipName(n) → 'clip-NN.mp4' (n from 1)
 *   jsonText(v)          JSON.stringify(v, null, 2) + '\n' — every JSON file of the folder
 *   rowFaults(row, at?) → string[]   [] for a valid change row, every fault by name otherwise — THE one shape check of
 *                        a row (its keys, tick, name, by, op in OPS, from/to per op); recordFolderFaults, applyRows and
 *                        serializeRecordFolder ask it, so a host checking a row before it writes or applies one asks it too
 *   recordFolderFaults(files) → string[]   [] for a complete §6 folder, every fault by name otherwise
 *   serializeRecordFolder(parts) → { files, record, clips } | { empty: true }   THE writer (Record.js calls it;
 *                        it runs recordFolderFaults on its own output and THROWS on any fault)
 *   applyRows(partsBlock, rows) → partsBlock   THE applier: a parts block with change rows applied in order (a new
 *                        block; the input is never mutated)
 *
 * `files` is a tree { path → string | Uint8Array }: JSON and project text as strings (or UTF-8 bytes), clips
 * as bytes. Values in §6 files are strict JSON, in record.json's own vocabulary; a placeholder ("*",
 * {unavailable}) never sits in a §6 field.
 */

import { MANIFEST_FILE } from './manifest.js';
import { entryOf } from './link.js';
import { spellRect, spellCenter } from './parts-spelling.js';

/** The folder's §6 paths. */
export const RECORD_FILES = Object.freeze({
    record: 'record.json',
    partsBefore: 'parts.before.json',
    partsAfter: 'parts.after.json',
    project: 'project/'
});

/** record.json's keys, exactly. */
export const RECORD_KEYS = Object.freeze(['tickRange', 'clips', 'changes']);

/** One change row's keys, exactly. */
export const CHANGE_KEYS = Object.freeze(['tick', 'name', 'op', 'by', 'from', 'to']);

/** The change ops. */
export const OPS = Object.freeze(['move', 'setDeclared', 'add', 'remove', 'fork']);

/** Who acted (each row's `by`). */
export const BY = Object.freeze(['human', 'maxi']);

/** The length of one clip, in seconds of playback (frames / fps). */
export const CLIP_SECONDS = Object.freeze({ min: 5, max: 10 });

/** The clip file pattern. */
export const CLIP_NAME = /^clip-(\d{2})\.mp4$/;

/** @param {number} n 1-based @returns {string} 'clip-NN.mp4' */
export function clipName(n) {
    if (!Number.isInteger(n) || n < 1 || n > 99) {
        throw new Error('[record-format] a clip number is a whole number 1–99, got ' + JSON.stringify(n) + '. (FAIL-LOUD.)');
    }
    return 'clip-' + String(n).padStart(2, '0') + '.mp4';
}

/** THE text of every JSON file of a Record folder. */
export function jsonText(v) {
    return JSON.stringify(v, null, 2) + '\n';
}

// ── value shapes ────────────────────────────────────────────────────────────────

const POSITION_KEYS = Object.freeze({ center: [3], rect: [4, 6] });
const FORK_FILE = /^parts\/[^/]+\.js$/;

function _isPlain(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) &&
        (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}

/** The first path inside `v` that is not strict JSON (a function, NaN, undefined, a class instance …), else null. */
function _strictJsonFault(v, at) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') { return null; }
    if (typeof v === 'number') { return Number.isFinite(v) ? null : at + ' is ' + String(v); }
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) { const f = _strictJsonFault(v[i], at + '[' + i + ']'); if (f) { return f; } }
        return null;
    }
    if (_isPlain(v)) {
        for (const k of Object.keys(v)) { const f = _strictJsonFault(v[k], at + '.' + k); if (f) { return f; } }
        return null;
    }
    return at + ' is ' + (v === undefined ? 'undefined' : typeof v === 'object' ? 'a ' + ((v.constructor && v.constructor.name) || 'class') + ' instance' : 'a ' + typeof v);
}

/** Every placeholder inside `v`: an {unavailable} object or a "*" string. */
function _placeholders(v, at, out) {
    if (v === '*') { out.push(at + ' is the placeholder "*"'); return out; }
    if (Array.isArray(v)) { v.forEach(function (x, i) { _placeholders(x, at + '[' + i + ']', out); }); return out; }
    if (v && typeof v === 'object') {
        if (Object.prototype.hasOwnProperty.call(v, 'unavailable')) { out.push(at + ' is the placeholder {unavailable}'); return out; }
        Object.keys(v).forEach(function (k) { _placeholders(v[k], at + '.' + k, out); });
    }
    return out;
}

function _isEntry(e) {
    return Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && e[0].length > 0 && _isPlain(e[1]) && !_strictJsonFault(e[1], '');
}

/** { key, length } of a move value `{center: [3]}` / `{rect: [4|6]}`, else null. */
function _placement(v) {
    if (!_isPlain(v)) { return null; }
    const ks = Object.keys(v);
    if (ks.length !== 1 || !POSITION_KEYS[ks[0]]) { return null; }
    const a = v[ks[0]];
    if (!Array.isArray(a) || POSITION_KEYS[ks[0]].indexOf(a.length) === -1 || !a.every(function (n) { return typeof n === 'number' && Number.isFinite(n); })) { return null; }
    return { key: ks[0], length: a.length };
}

const MOVE_SHAPE = 'move carries from/to as ONE key, {center: [x, y, z]} or {rect: [4 numbers flat | 6 with a z-extent]}, the same key and length in both';

/**
 * rowFaults(row, at?) → string[] — THE shape check of one change row: [] when valid, otherwise every fault by name.
 * Checks the keys (exactly CHANGE_KEYS), `tick` (a whole tick ≥ 0), `name` (the declared name), `by` (one of BY),
 * `op` (one of OPS) and `from`/`to` (strict JSON, in that op's shape; a move that moves nothing is a fault).
 * A row alone carries no folder facts: tickRange, tick order and one shape per name's moves are recordFolderFaults'.
 * @param {*} c the row
 * @param {string} [at='row'] the row's label at the head of each fault (e.g. 'changes[3]')
 * @returns {string[]}
 */
export function rowFaults(c, at) {
    if (at === undefined) { at = 'row'; }
    const bad = [];
    if (!_isPlain(c)) { return [at + ' is not a change {' + CHANGE_KEYS.join(', ') + '}']; }
    const keys = Object.keys(c);
    if (keys.length !== CHANGE_KEYS.length || !CHANGE_KEYS.every(function (k) { return keys.indexOf(k) !== -1; })) {
        bad.push(at + ' carries exactly {' + CHANGE_KEYS.join(', ') + '}, got {' + keys.join(', ') + '}');
    }
    if (!Number.isInteger(c.tick) || c.tick < 0) { bad.push(at + '.tick is a whole tick ≥ 0, got ' + JSON.stringify(c.tick)); }
    if (typeof c.name !== 'string' || !c.name) { bad.push(at + '.name is the declared name, got ' + JSON.stringify(c.name)); }
    if (BY.indexOf(c.by) === -1) { bad.push(at + '.by is one of ' + BY.join('|') + ', got ' + JSON.stringify(c.by)); }
    ['from', 'to'].forEach(function (k) {
        const f = _strictJsonFault(c[k], at + '.' + k);
        if (f) { bad.push(f + ' — from/to are strict JSON'); }
    });
    if (c.op === 'move') {
        const a = _placement(c.from), b = _placement(c.to);
        if (!a || !b || a.key !== b.key || a.length !== b.length) { bad.push(at + ': ' + MOVE_SHAPE + ', got ' + JSON.stringify([c.from, c.to])); }
        else if (JSON.stringify(c.from) === JSON.stringify(c.to)) { bad.push(at + ' is a zero move of "' + c.name + '" — an act that moved nothing writes no row'); }
    } else if (c.op === 'setDeclared') {
        if (!_isPlain(c.from) || !_isPlain(c.to) || !Object.keys(c.to).length ||
            JSON.stringify(Object.keys(c.from).sort()) !== JSON.stringify(Object.keys(c.to).sort())) {
            bad.push(at + ': setDeclared carries from/to as {key: value} of the patched keys, the same keys before and after, got ' + JSON.stringify([c.from, c.to]));
        }
    } else if (c.op === 'add') {
        if (c.from !== null || !_isEntry(c.to)) { bad.push(at + ': add carries from: null and to: ["<registered kind name>", {props}], got ' + JSON.stringify([c.from, c.to])); }
    } else if (c.op === 'remove') {
        if (c.to !== null || !_isEntry(c.from)) { bad.push(at + ': remove carries from: ["<registered kind name>", {props}] and to: null, got ' + JSON.stringify([c.from, c.to])); }
    } else if (c.op === 'fork') {
        const ok = typeof c.from === 'string' && c.from.length > 0 && _isPlain(c.to) &&
            JSON.stringify(Object.keys(c.to).sort()) === '["file","kind"]' &&
            typeof c.to.kind === 'string' && c.to.kind.length > 0 && typeof c.to.file === 'string' && FORK_FILE.test(c.to.file);
        if (!ok) { bad.push(at + ': fork carries from: "<source kind name>" and to: {"kind": "<new kind name>", "file": "parts/<File>.js"}, got ' + JSON.stringify([c.from, c.to])); }
    } else {
        bad.push(at + '.op ' + JSON.stringify(c.op) + ' is not one of ' + OPS.join('|') + ' (a placement is "move" whatever hand made it)');
    }
    return bad;
}

function _text(v) {
    return typeof v === 'string' ? v : new TextDecoder('utf-8', { fatal: true }).decode(v);
}

function _isBytes(v) { return v instanceof Uint8Array; }

/** Parse a JSON file of the tree: { value } | { fault }. */
function _json(files, path) {
    if (!Object.prototype.hasOwnProperty.call(files, path)) { return { fault: 'the folder has no ' + path }; }
    try { return { value: JSON.parse(_text(files[path])) }; }
    catch (e) { return { fault: path + ' is not JSON: ' + ((e && e.message) || String(e)) }; }
}

/**
 * recordFolderFaults(files) → string[] — [] for a COMPLETE §6 Record folder, otherwise every fault by name.
 * §6 checks only: record.json's keys and value shapes; each row against its op (the fork shape included);
 * ticks inside tickRange and never decreasing; no zero move; one shape per name's moves; `clips` equal to the
 * clip files present, in order; the parts.*.json entries; `project/frqtl.json` naming an entry present under
 * project/. A host's own files (lab.json …) are never read.
 * @param {Object<string, string|Uint8Array>} files
 * @returns {string[]}
 */
export function recordFolderFaults(files) {
    if (!_isPlain(files)) { return ['a Record folder is a tree { path: string | Uint8Array }']; }
    const bad = [];
    Object.keys(files).forEach(function (p) {
        if (typeof files[p] !== 'string' && !_isBytes(files[p])) { bad.push(p + ' is neither text nor bytes'); }
    });
    // record.json
    const r = _json(files, RECORD_FILES.record);
    if (r.fault) { bad.push(r.fault); }
    const rec = r.value;
    let range = null;
    let clips = [];
    if (rec !== undefined) {
        if (!_isPlain(rec)) { bad.push(RECORD_FILES.record + ' is an object {' + RECORD_KEYS.join(', ') + '}'); }
        else {
            const keys = Object.keys(rec);
            if (keys.length !== RECORD_KEYS.length || !RECORD_KEYS.every(function (k) { return keys.indexOf(k) !== -1; })) {
                bad.push(RECORD_FILES.record + ' carries exactly {' + RECORD_KEYS.join(', ') + '} (no record-level who: each change names its `by`), got {' + keys.join(', ') + '}');
            }
            _placeholders(rec, RECORD_FILES.record, []).forEach(function (f) { bad.push(f + ' — a placeholder never sits in a §6 field'); });
            const tr = rec.tickRange;
            if (!Array.isArray(tr) || tr.length !== 2 || !tr.every(function (t) { return Number.isInteger(t) && t >= 0; }) || tr[1] < tr[0]) {
                bad.push(RECORD_FILES.record + ' tickRange is [first, last] whole ticks, first ≤ last, got ' + JSON.stringify(tr));
            } else { range = tr; }
            if (!Array.isArray(rec.clips)) { bad.push(RECORD_FILES.record + ' clips is the list of clip files, got ' + JSON.stringify(rec.clips)); }
            else {
                clips = rec.clips;
                clips.forEach(function (c, i) {
                    const want = clipName(i + 1);
                    if (c !== want) { bad.push(RECORD_FILES.record + ' clips[' + i + '] is ' + JSON.stringify(c) + ', not ' + want + ' (clips in the order filmed)'); }
                    else if (!_isBytes(files[c]) || !files[c].length) { bad.push(c + ' is listed in ' + RECORD_FILES.record + ' clips but is not in the folder as bytes'); }
                });
            }
            if (!Array.isArray(rec.changes)) { bad.push(RECORD_FILES.record + ' changes is the list of change rows, got ' + JSON.stringify(rec.changes)); }
            else {
                const shapeOf = {};
                let last = -Infinity;
                rec.changes.forEach(function (c, i) {
                    const at = RECORD_FILES.record + ' changes[' + i + ']';
                    rowFaults(c, at).forEach(function (f) { bad.push(f); });
                    if (!_isPlain(c)) { return; }
                    if (Number.isInteger(c.tick)) {
                        if (range && (c.tick < range[0] || c.tick > range[1])) { bad.push(at + ' at tick ' + c.tick + ' lies outside tickRange ' + JSON.stringify(range)); }
                        if (c.tick < last) { bad.push(at + ' at tick ' + c.tick + ' comes after a row at tick ' + last + ' — rows are in the order acted, so ticks only climb'); }
                        last = Math.max(last, c.tick);
                    }
                    if (c.op === 'move') {
                        const p = _placement(c.from);
                        if (p) {
                            const s = p.key + '/' + p.length;
                            if (shapeOf[c.name] && shapeOf[c.name] !== s) {
                                bad.push(at + ' moves "' + c.name + '" as {' + p.key + ': ' + p.length + ' numbers} after a row that moved it as {' +
                                    shapeOf[c.name].replace('/', ': ') + ' numbers} — one part moves in the one shape of its position authority');
                            }
                            shapeOf[c.name] = shapeOf[c.name] || s;
                        }
                    }
                });
            }
        }
    }
    Object.keys(files).filter(function (f) { return CLIP_NAME.test(f) && clips.indexOf(f) === -1; }).sort().forEach(function (f) {
        bad.push(f + ' is in the folder but not listed in ' + RECORD_FILES.record + ' clips');
    });
    // parts.before.json / parts.after.json
    [RECORD_FILES.partsBefore, RECORD_FILES.partsAfter].forEach(function (p) {
        const j = _json(files, p);
        if (j.fault) { bad.push(j.fault); return; }
        if (!_isPlain(j.value)) { bad.push(p + ' is {"<name>": ["<registered kind name>", {props}]}, got ' + JSON.stringify(j.value)); return; }
        _placeholders(j.value, p, []).forEach(function (f) { bad.push(f + ' — a placeholder never sits in a §6 field'); });
        Object.keys(j.value).forEach(function (n) {
            if (!_isEntry(j.value[n])) { bad.push(p + ' "' + n + '" is not ["<registered kind name>", {props}]: ' + JSON.stringify(j.value[n])); }
        });
    });
    // project/
    const mp = RECORD_FILES.project + MANIFEST_FILE;
    if (!Object.prototype.hasOwnProperty.call(files, mp)) { bad.push('project/ has no ' + MANIFEST_FILE + ' naming its entry (a Record snapshots a project folder)'); }
    else {
        let entry = null;
        try { entry = entryOf({ [MANIFEST_FILE]: _text(files[mp]) }); }
        catch (e) { bad.push(mp + ' is refused by the entry rule (link.js entryOf): ' + ((e && e.message) || String(e))); }
        if (entry !== null && !Object.prototype.hasOwnProperty.call(files, RECORD_FILES.project + entry)) {
            bad.push('project/ has no ' + entry + ' (the entry ' + MANIFEST_FILE + ' names)');
        }
    }
    return bad;
}

// ── the writer ──────────────────────────────────────────────────────────────────

/** A parts block → its §6 JSON value, refusing a value that is not strict JSON by name. */
function _partsValue(block, which) {
    if (!_isPlain(block)) { throw new TypeError('[record-format] ' + which + ' is { "<name>": ["<registered kind name>", {props}] }. (FAIL-LOUD.)'); }
    const out = {};
    Object.keys(block).forEach(function (n) {
        const e = block[n];
        if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || !e[0] || !_isPlain(e[1])) {
            throw new TypeError('[record-format] ' + which + ' "' + n + '" is not ["<registered kind name>", {props}]. (FAIL-LOUD.)');
        }
        const f = _strictJsonFault(e[1], n);
        if (f) {
            throw new TypeError('[record-format] ' + which + ': ' + f + ' — a Record writes props as strict JSON; declare that value ' +
                'as a literal in `parts`. (FAIL-LOUD.)');
        }
        out[n] = [e[0], JSON.parse(JSON.stringify(e[1]))];
    });
    return out;
}

export const FILM_AFTER_LAST_CHANGE = 'film after your last change: the footage must show every change';

/**
 * serializeRecordFolder({ changes, clips, partsBefore, partsAfter, project }) — THE writer of a Record folder.
 *   changes      the rows, in the order acted
 *   clips        [{ bytes: Uint8Array, firstTick, lastTick }], in the order filmed (Record ticks)
 *   partsBefore / partsAfter   { name: [registered kind name, props] }
 *   project      { path: text } — the held files at stop
 * → { empty: true } when there is no change and no clip (a state, with no folder);
 * → { files, record, clips: [{ file, firstTick, lastTick }] } otherwise.
 * REFUSES (throws): a change and no clip, or a change after the last clip ends (FILM_AFTER_LAST_CHANGE); a
 * props value that is not strict JSON (naming its key); and any recordFolderFaults of its own output.
 */
export function serializeRecordFolder(p) {
    const changes = p.changes, clips = p.clips;
    if (!changes.length && !clips.length) { return { empty: true }; }
    if (!clips.length) {
        throw new Error('[record-format] this Record has ' + changes.length + ' change(s) and no clip — ' + FILM_AFTER_LAST_CHANGE + '. (FAIL-LOUD.)');
    }
    const end = clips[clips.length - 1].lastTick;
    const late = changes.filter(function (c) { return c.tick > end; });
    if (late.length) {
        throw new Error('[record-format] ' + late.length + ' change(s) after the last clip ends (Record tick ' + end + '): ' +
            late.map(function (c) { return c.op + ' ' + c.name + ' at tick ' + c.tick; }).join('; ') + ' — ' + FILM_AFTER_LAST_CHANGE + '. (FAIL-LOUD.)');
    }
    const first = changes.reduce(function (m, c) { return Math.min(m, c.tick); }, clips[0].firstTick);
    const record = {
        tickRange: [first, end],
        clips: clips.map(function (c, i) { return clipName(i + 1); }),
        changes: changes.map(function (c) { const o = {}; CHANGE_KEYS.forEach(function (k) { o[k] = c[k]; }); return o; })
    };
    // Check the rows as HELD, before any text: JSON.stringify writes NaN/Infinity as null and drops an undefined key,
    // so a check of the written text would read a different value from the one the Record held.
    const held = [];
    record.changes.forEach(function (c, i) { held.push.apply(held, rowFaults(c, 'changes[' + i + ']')); });
    if (held.length) { throw new Error('[record-format] a change row is not strict JSON: ' + held.join('; ') + ' (FAIL-LOUD.)'); }
    const files = {};
    files[RECORD_FILES.record] = jsonText(record);
    clips.forEach(function (c, i) { files[clipName(i + 1)] = c.bytes; });
    files[RECORD_FILES.partsBefore] = jsonText(_partsValue(p.partsBefore, RECORD_FILES.partsBefore));
    files[RECORD_FILES.partsAfter] = jsonText(_partsValue(p.partsAfter, RECORD_FILES.partsAfter));
    Object.keys(p.project).sort().forEach(function (f) { files[RECORD_FILES.project + f] = p.project[f]; });
    const faults = recordFolderFaults(files);
    if (faults.length) {
        throw new Error('[record-format] the Record folder this producer wrote is not a complete §6 Record:\n- ' + faults.join('\n- ') + '\n(FAIL-LOUD.)');
    }
    return { files: files, record: record, clips: clips.map(function (c, i) { return { file: clipName(i + 1), firstTick: c.firstTick, lastTick: c.lastTick }; }) };
}

// ── the applier ─────────────────────────────────────────────────────────────────

function _applyFail(i, msg) {
    throw new Error('[record-format] applyRows: rows[' + i + '] ' + msg + '. (FAIL-LOUD.)');
}

/** The element count an entry's `center` value spells, or null. */
function _centerLength(props) {
    return Array.isArray(props.center) ? props.center.length : null;
}

/**
 * applyRows(partsBlock, rows) → partsBlock — THE applier of §6 change rows to a parts block
 * ({ "<name>": ["<registered kind name>", {props}] }, the parts.before.json / parts.after.json value), in order. Pure:
 * returns a NEW block; neither argument is mutated. Per op (OPS):
 *   move          entry `name` takes `to`'s one position key, spelled in the entry's own form
 *   setDeclared   entry `name` takes each key of `to`, spelled in the entry's own form
 *   add           `to` becomes entry `name`, as the LAST key
 *   remove        entry `name` is dropped
 *   fork          entry `name`'s kind becomes `to.kind` (its props are unchanged)
 * The spelling is the writer's own rule (parts-spelling.js spellRect / spellCenter: a 6-number rect beside spelled
 * `z`/`depth` keys, a two-number center), read off the block, so a block a hand changed and the rows that change
 * wrote agree: applyRows(parts.before, record.changes) is parts.after. A 6-number rect row asks its kind's descriptor
 * (ObjectSchema.derivedReads): the ./project entry (index.js) imports the parts roster, so every published kind is
 * registered wherever ./project is loaded, and a scene page has registered them by its boot's modules phase; a
 * project's own kind (a fork's parts/<Kind>.js) is registered when its module is imported. This module itself imports
 * no part: the scene page reaches it statically (RecipeContext → Record.js), and a static barrel import here would load
 * every part with the page module, ahead of the boot record (a failed part would then leave no boot banner).
 * THROWS, naming the row index and the offending value: a block that is not { name: [kind name, {props}] }; rows
 * that are not an array; a row rowFaults names (an op that is not one of OPS, its keys, its from/to shape — the
 * faults in the error); a 6-number rect row on a kind no imported module registered; a name the block does not
 * hold (move, setDeclared, remove, fork) or already holds (add); a fork whose `from` is not the entry's kind.
 * @param {Object<string, [string, object]>} partsBlock
 * @param {object[]} rows
 * @returns {Object<string, [string, object]>}
 */
export function applyRows(partsBlock, rows) {
    const block = _partsValue(partsBlock, 'applyRows partsBlock');
    if (!Array.isArray(rows)) {
        throw new TypeError('[record-format] applyRows(partsBlock, rows): rows is the list of change rows (record.json changes), got ' +
            JSON.stringify(rows) + '. (FAIL-LOUD.)');
    }
    rows.forEach(function (row, i) {
        const faults = rowFaults(row, 'rows[' + i + ']');
        if (faults.length) { _applyFail(i, 'is not a change row: ' + faults.join('; ')); }
        const name = row.name;
        const has = Object.prototype.hasOwnProperty.call(block, name);
        if (row.op === 'add') {
            if (has) { _applyFail(i, 'adds "' + name + '", which the block already holds as ' + JSON.stringify(block[name])); }
            block[name] = JSON.parse(JSON.stringify(row.to));
            return;
        }
        if (!has) {
            _applyFail(i, '(' + row.op + ') names the part "' + name + '", which the block does not hold (parts: ' +
                Object.keys(block).join(', ') + ')');
        }
        const entry = block[name];
        if (row.op === 'remove') { delete block[name]; return; }
        if (row.op === 'fork') {
            if (entry[0] !== row.from) {
                _applyFail(i, 'forks "' + name + '" from the kind ' + JSON.stringify(row.from) + ', but the block declares it as ' + JSON.stringify(entry[0]));
            }
            block[name] = [row.to.kind, entry[1]];
            return;
        }
        // move / setDeclared: the row's capture-form values, spelled in the entry's own form.
        const props = JSON.parse(JSON.stringify(row.to));
        const own = entry[1];
        try {
            spellRect(props, { kind: entry[0], baseline: row.from, entryKeys: function () { return Object.keys(own); } });
            spellCenter(props, { entryKeys: function () { return Object.keys(own); }, centerLength: function () { return _centerLength(own); } });
        } catch (e) { throw new Error('[record-format] applyRows: rows[' + i + '] (' + row.op + ') of "' + name + '": ' + ((e && e.message) || String(e))); }
        block[name] = [entry[0], Object.assign({}, own, props)];
    });
    return block;
}
