/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-record-folder.js — the lab's HOST HALF of a Record folder (the sketch-projects design §6).
 *
 * The §6 shape and its one writer are the package's (@descix/frqtl-web ./project, reached through the generated door
 * ./frqtl-web-project.js): a booted world's Record (`exp.startRecord()`) writes its own rows, clock and clips, and
 * `rec.stop()` resolves the folder {files, record, clips}. This module defines no §6 field and writes no §6 file. It owns
 * what the lab adds BESIDE the package's files — lab.json and the stills — and the lab's half of the gate, and it is the one
 * place the lab's producers assemble their Records: the human's Record (maxi-record.js), the page loop's approve
 * (maxi-lab.js) and MiniMaxi's approve (minimaxi/loop.mjs).
 *
 *   record.json, clip-NN.mp4, parts.before.json, parts.after.json, project/   the package's (rec.stop())
 *   lab.json                       the lab's own fields (producer, scene, the clips filmed and by which hand, the chain, the
 *                                  loop's outline/plan/verdict …), never in record.json
 *   early.png mid.png settled.png  stills, a reading aid (node only)
 *
 * THE GATE is the package's recordFolderFaults ∪ this module's hostFolderFaults, under one name (recordFolderFaults): the
 * package checks the §6 files; this module checks lab.json, the text of the project's entry (SKETCH_FORM, entryTextFaults),
 * a placeholder anywhere outside the §6 files (lab.json, project/), MAX_SEGMENTS and STILLS. Nothing is ever written in
 * place of a value; a placeholder (a value under the key `unavailable`) is refused by name.
 */

import {
    RECORD_FILES, RECORD_KEYS, CHANGE_KEYS, OPS, BY, CLIP_NAME, clipName, jsonText, MANIFEST_FILE, parseManifest,
    recordFolderFaults as packageFolderFaults, applyRows
} from './frqtl-web-project.js';
import { centerOfRect } from './maxi-hands.js';

export { RECORD_KEYS, CHANGE_KEYS, OPS, BY, CLIP_NAME, clipName };

// ── the folder's names ────────────────────────────────────────────────────────────────────────
export const SHAPE_OWNER = 'the sketch-projects design §6';
/** The package's §6 paths plus the host's own file. */
export const FILES = Object.freeze(Object.assign({}, RECORD_FILES, { lab: 'lab.json' }));
export const STILLS = Object.freeze(['early.png', 'mid.png', 'settled.png']);
/** The question door takes 8 attachments per turn, so a Record holds at most 8 segments (lab rule): checked before filming and in the gate. */
export const MAX_SEGMENTS = 8;
/** §6's placement op, by name: a placement is `move` whatever hand made it (the package's OPS carries it). */
export const MOVE = 'move';
if (OPS.indexOf(MOVE) === -1) { throw new Error('[record-folder] the package\'s OPS [' + OPS.join(', ') + '] has no "' + MOVE + '" — the lab reads a placement row by that op.'); }
export const PRODUCERS = Object.freeze(['record', 'loop']);
/** The lab.json key of the Designer's plan (maxi-roles.js parsePlan's plan, as-is): one of LOOP_LAB_KEYS, read by planOf. */
export const PLAN_KEY = 'plan';
/** The lab.json keys of a loop Record (the concept doc §3.2), read off the loop's approve as-is. */
export const LOOP_LAB_KEYS = Object.freeze(['outline', PLAN_KEY, 'designerWords', 'steps', 'prediction', 'builderWords', 'owl', 'threads', 'rounds']);
/** The lab.json key naming rows no Record holds (a world's Record that closed refused: rows its footage does not show, read off the refusal's err.record): §6 rows, hand-back Record only, absent when none. */
export const UNHELD_KEY = 'unheld';
/** The lab.json key of the human's teaching words: what they say a demonstration teaches Maxi, typed on the demonstration
 *  card and asked with its clip (maxi-ask.js footageUserInput). A string as the human typed it (ends trimmed), hand-back Record only, ABSENT when
 *  they typed nothing; never a placeholder (teachingFaults). Only the human's Record writes it; it is never an input to the loop. */
export const TEACHING_KEY = 'teaching';
/** The demonstration card's prompt for the teaching words (the textarea's placeholder): the one copy, so it can never be saved as the words. */
export const TEACHING_PROMPT = 'What are you teaching Maxi?';
/** The optional lab.json keys that ride in the hand-back Record of a chain only, absent when there is nothing to say. */
export const HAND_BACK_KEYS = Object.freeze([UNHELD_KEY, TEACHING_KEY]);
/**
 * The lab.json key naming what the producer's FIRST Record held before the producer began (the world's Record could not
 * close when the human pressed Record or the loop took the outline: rows its footage did not show): {changes: [§6 rows, the
 * leading rows of record.json], clips: [{clip, hand, firstTick, lastTick}, the leading clips of record.json]}. Those rows and
 * clips stay in the package's folder (record.json is its writer's, never rewritten here); this key says they are not the
 * producer's. First Record of a chain only, ABSENT when nothing was carried; never empty (carriedFaults).
 */
export const CARRIED_KEY = 'carried';
/**
 * The lab.json key of the producer's START: the parts block (parts.before.json's shape, {name: [Kind, {props}]}) the round's
 * first world held when the round began — the human pressed Record, the loop took the outline, or an Owl's revise began the
 * next round — or when that world booted inside the round (maxi-lab.js THE START). It is read in the page, after any rows the
 * world's Record carried from before, so it is where the round began even when parts.before.json is not (a carried Record,
 * or a hand-back whose world the round booted later). The round's change is judged START → END (recordPlanFaults: the
 * hand-back's parts.after.json against it), and the seen memory's parts diff is that diff. Hand-back Record of a chain only;
 * never a placeholder (partsBlockFaults); when the chain's first Record carried nothing it is that Record's
 * parts.before.json (startOpeningFaults, in the folder gate and the chain gate). Read through startOf, the one reader.
 */
export const START_KEY = 'start';

// ── the placeholder no field holds ────────────────────────────────────────────────────────────
/** The key of a placeholder value: no producer writes one; the gate refuses it anywhere in the folder by name. */
export const UNAVAILABLE = 'unavailable';

// ── a row as the lab reads it (the rows themselves are the package's) ─────────────────────────
function isStrictJson(v) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') { return true; }
    if (typeof v === 'number') { return isFinite(v); }
    if (Array.isArray(v)) { return v.every(isStrictJson); }
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) { return Object.keys(v).every(function (k) { return isStrictJson(v[k]); }); }
    return false;
}
/** A placement's two keys: a part is placed by its centre or by its rect (maxi-hands.js RECT_CONVENTION). */
const PLACEMENT_KEYS = Object.freeze(['center', 'rect']);
function isPlacement(p) {
    if (!p || typeof p !== 'object') { return false; }
    const keys = Object.keys(p);
    return keys.length === 1 && PLACEMENT_KEYS.indexOf(keys[0]) !== -1 && Array.isArray(p[keys[0]]) &&
        p[keys[0]].length >= 2 && p[keys[0]].every(function (n) { return typeof n === 'number' && isFinite(n); });
}
function isEntry(e) {
    return Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && !!e[0] && !!e[1] && typeof e[1] === 'object' && !Array.isArray(e[1]) && isStrictJson(e[1]);
}

/**
 * What keeps a value from being read as a row: [] when it carries exactly the package's CHANGE_KEYS, its op one of OPS, its
 * `by` one of BY and its values strict JSON. The VALUE SHAPES per op are the package's gate on record.json; this is the
 * lab's reading of a row it holds outside any Record (lab.json `unheld`) or prints (changeText).
 */
export function rowFaults(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) { return ['a change is an object {' + CHANGE_KEYS.join(', ') + '}, got ' + JSON.stringify(c)]; }
    const bad = [];
    const keys = Object.keys(c);
    if (keys.length !== CHANGE_KEYS.length || !CHANGE_KEYS.every(function (k) { return keys.indexOf(k) !== -1; })) { bad.push('a change carries exactly {' + CHANGE_KEYS.join(', ') + '}, got {' + keys.join(', ') + '}'); }
    if (!Number.isInteger(c.tick) || c.tick < 0) { bad.push('tick is a whole number ≥ 0, got ' + JSON.stringify(c.tick)); }
    if (OPS.indexOf(c.op) === -1) { bad.push('op ' + JSON.stringify(c.op) + ' is not one of ' + OPS.join('|')); }
    if (BY.indexOf(c.by) === -1) { bad.push('by is one of ' + BY.join('|') + ', got ' + JSON.stringify(c.by)); }
    if (!isStrictJson(c.from === undefined ? 0 : c.from) || !isStrictJson(c.to === undefined ? 0 : c.to)) { bad.push('from/to are strict JSON'); }
    return bad;
}

function valueText(v) {
    if (v === null) { return '(none)'; }
    if (isPlacement(v)) { const k = Object.keys(v)[0]; return k + ' [' + v[k].join(', ') + ']'; }
    if (v && typeof v === 'object' && v[UNAVAILABLE]) { return '(a placeholder)'; }
    return JSON.stringify(v);
}
/** One change as a line a model reads: "tick 123 · move (human) mirror: rect [..] → rect [..]". THROWS on a value that is not a row. */
export function changeText(c) {
    const bad = rowFaults(c);
    if (bad.length) { throw new Error('[record-folder] not a §6 change: ' + bad.join('; ')); }
    return 'tick ' + c.tick + ' · ' + c.op + ' (' + c.by + ') ' + c.name + ': ' + valueText(c.from) + ' → ' + valueText(c.to);
}
export function changesAsText(changes) {
    if (!changes.length) { return '(no declared part was moved, added or removed during this recording)'; }
    return changes.map(changeText).join('\n');
}

/**
 * What keeps a value from being a parts block, the Record's own shape (parts.before.json, parts.after.json, lab.json
 * START_KEY): [] when it is {name: [Kind, {props}]}, each props strict JSON.
 */
export function partsBlockFaults(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { return ['a parts block is {name: [Kind, {props}]}, got ' + JSON.stringify(v)]; }
    return Object.keys(v).filter(function (k) { return !isEntry(v[k]); }).map(function (k) { return 'entry "' + k + '" is not [Kind, {props}]: ' + JSON.stringify(v[k]); });
}

/**
 * The parts a Record changed, as lines a model reads: each part of parts.before.json ∪ parts.after.json whose entry differs
 * ("name: Kind {props} → Kind {props}"), arrived ("name: added, Kind {props}") or left ("name: removed, was Kind {props}"),
 * in the after block's order then the removed ones. The rows (changeText) say what each act did; this says the net state.
 * THROWS on a block that is not {name: [Kind, {props}]}.
 */
export function partsDiffText(before, after) {
    [['parts.before.json', before], ['parts.after.json', after]].forEach(function (b) {
        if (partsBlockFaults(b[1]).length) { throw new Error('[record-folder] ' + b[0] + ' is a parts block {name: [Kind, {props}]}, got ' + JSON.stringify(b[1])); }
    });
    const entryText = function (e) { return e[0] + ' ' + JSON.stringify(e[1]); };
    const lines = [];
    Object.keys(after).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(before, k)) { lines.push(k + ': added, ' + entryText(after[k])); }
        else if (canon(before[k]) !== canon(after[k])) { lines.push(k + ': ' + entryText(before[k]) + ' → ' + entryText(after[k])); }
    });
    Object.keys(before).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(after, k)) { lines.push(k + ': removed, was ' + entryText(before[k])); } });
    return lines.length ? lines.join('\n') : '(the parts block is the same before and after)';
}

/** Whether two parts blocks state the same parts (strict-JSON equal, key order aside). */
export function partsEqual(a, b) { return canon(a) === canon(b); }

/** The words of the refusal of a start that is not where the producer's first Record opened (startOpeningFaults). */
export const START_NOT_OPENING = 'start is not where the round began';

/**
 * THE check of a hand-back's START against the chain's first Record (`first`: its files, `firstName`: its folder name): the
 * start IS where that Record's world stood when the round began. When the Record carried nothing (lab.json CARRIED_KEY
 * absent) it opened as the round began (maxi-lab.js beginChain rotates the world's Record, or a world booted inside the
 * round opens its Record, and THE START is read right then), so the start IS its parts.before.json. When it carried rows,
 * the start was read after them, so it IS parts.before.json with the carried rows applied by the package's applier
 * (applyRows, ./project: the one owner of what a row does to a parts block). A start that disagrees is refused as
 * START_NOT_OPENING, and so is a carried row the applier refuses (its own words, naming the row). A first Record whose
 * files do not parse, or whose carried value has no rows list, is the package's or carriedFaults' to name. → [fault].
 */
function startOpeningFaults(start, first, firstName) {
    let lab, before;
    try { lab = JSON.parse(textOf(first[FILES.lab])); before = JSON.parse(textOf(first[FILES.partsBefore])); } catch (e) { return []; }
    if (!lab || partsBlockFaults(before).length || partsBlockFaults(start).length) { return []; }
    const carried = lab[CARRIED_KEY];
    if (carried === undefined) {
        if (partsEqual(start, before)) { return []; }
        return [START_NOT_OPENING + ': lab.json ' + START_KEY + ' is not ' + firstName + '/' + FILES.partsBefore + ' (' + partsDiffText(before, start).split('\n').join('; ') +
            ') — ' + firstName + ' carried nothing, so it opened as the round began and where it opened is the start'];
    }
    if (!carried || typeof carried !== 'object' || !Array.isArray(carried.changes)) { return []; }
    let opened;
    try { opened = applyRows(before, carried.changes); }
    catch (e) {
        return [START_NOT_OPENING + ': ' + firstName + '/' + FILES.lab + ' ' + CARRIED_KEY + ' rows do not apply to ' + firstName + '/' + FILES.partsBefore +
            ', so where the round began cannot be read — ' + String(e && e.message)];
    }
    if (partsEqual(start, opened)) { return []; }
    return [START_NOT_OPENING + ': lab.json ' + START_KEY + ' is not ' + firstName + '/' + FILES.partsBefore + ' with its ' + carried.changes.length +
        ' carried row(s) applied (applyRows: ' + partsDiffText(opened, start).split('\n').join('; ') + ') — the start is read after the rows ' +
        firstName + ' carried, so it is where those rows left the world'];
}

// ── a closed Record, as the lab hands it to a producer ────────────────────────────────────────
function textOf(v) { return typeof v === 'string' ? v : new TextDecoder('utf-8').decode(v); }

/**
 * THE package's closed-Record folder ({files, record, clips} — rec.stop()'s value, or one that crossed from the scene
 * document or from the page to node) as this realm's values: text stays text, bytes are copied into this realm's
 * Uint8Array, record and clips cross as JSON. A folder from another realm fails the package's own gate here otherwise
 * (`instanceof Uint8Array` and the plain-object check are per realm). THROWS on anything that is not that folder.
 */
export function folderHere(out) {
    if (!out || typeof out !== 'object' || !out.files || typeof out.files !== 'object' || !out.record || !Array.isArray(out.clips)) {
        throw new Error('[record-folder] a closed Record is rec.stop()\'s {files, record, clips}, got ' + JSON.stringify(out && Object.keys(out)) + '.');
    }
    const files = {};
    Object.keys(out.files).forEach(function (f) {
        const v = out.files[f];
        if (typeof v === 'string') { files[f] = v; }
        else if (v && typeof v === 'object' && typeof v.length === 'number' && typeof v.BYTES_PER_ELEMENT === 'number') { files[f] = new Uint8Array(v); }
        else if (v && typeof v === 'object' && typeof v.text === 'string') { files[f] = v.text; }              // crossed as {text}
        else if (v && typeof v === 'object' && typeof v.base64 === 'string') { files[f] = bytesOfBase64(v.base64); }   // crossed as {base64}
        else { throw new Error('[record-folder] the closed Record\'s ' + f + ' is neither text nor bytes.'); }
    });
    return { files: files, record: JSON.parse(JSON.stringify(out.record)), clips: JSON.parse(JSON.stringify(out.clips)) };
}

/**
 * ONE Record folder: the package's closed Record plus the lab's own file (lab.json) and the stills.
 * @param {{producer:'record'|'loop', folder:{files, record, clips:[{file, firstTick, lastTick}]}, filmed:string[],
 *          stills?:Uint8Array[3], lab:object, carried?:{changes, clips:[{hand, firstTick, lastTick}]}|null, start:object|null}} p
 *   folder: what rec.stop() resolved (folderHere); filmed: the hand that filmed each clip, in the order filmed (the lab's own
 *   list for that Record, one per clip of the folder); carried: what the Record held before its producer began (maxi-lab.js
 *   beginChain), written as lab.json CARRIED_KEY with the clips named — THROWS unless it is the folder's leading rows and clips;
 *   start: the producer's START (START_KEY) for the hand-back Record, null for any other Record of the chain — always named,
 *   never left out (THROWS on an absent `start` or one that is not a parts block).
 * @returns {{files, record, lab, faults:string[], complete:boolean}}
 */
export function assembleRecord(p) {
    if (!p || PRODUCERS.indexOf(p.producer) === -1) { throw new Error('[record-folder] a Record names its producer, one of ' + PRODUCERS.join('|') + '.'); }
    const folder = folderHere(p.folder);
    if (!folder.clips.length) { throw new Error('[record-folder] a Record needs at least one clip — nothing was filmed.'); }
    if (folder.clips.length > MAX_SEGMENTS) { throw new Error('[record-folder] a Record holds at most ' + MAX_SEGMENTS + ' segments (the question door\'s attachments per turn), got ' + folder.clips.length + '.'); }
    if (!Array.isArray(p.filmed) || p.filmed.length !== folder.clips.length || !p.filmed.every(function (h) { return typeof h === 'string' && h; })) {
        throw new Error('[record-folder] the lab names the hand that filmed each of the Record\'s ' + folder.clips.length + ' clips, in order; got ' + JSON.stringify(p.filmed) + ' — which hand filmed a clip cannot be guessed.');
    }
    if (p.stills !== undefined && (!Array.isArray(p.stills) || p.stills.length !== STILLS.length || !p.stills.every(function (s) { return s instanceof Uint8Array; }))) { throw new Error('[record-folder] stills are the three ' + STILLS.join(', ') + ' as bytes.'); }
    const lab = Object.assign({ producer: p.producer }, p.lab || {}, {
        filmed: folder.clips.map(function (c, i) { return { clip: c.file, hand: p.filmed[i], firstTick: c.firstTick, lastTick: c.lastTick }; })
    });
    if (!Object.prototype.hasOwnProperty.call(p, 'start') || p.start === undefined) {
        throw new Error('[record-folder] a Record names the producer\'s start (' + START_KEY + ': the parts block its chain began from, for the hand-back Record; null for the others) — the round\'s change is judged start → end, so it is never left out.');
    }
    if (p.start !== null) {
        const bad = partsBlockFaults(p.start);
        if (bad.length) { throw new Error('[record-folder] the producer\'s ' + START_KEY + ' is the parts block its chain began from: ' + bad.join('; ') + '.'); }
        lab[START_KEY] = JSON.parse(JSON.stringify(p.start));
    }
    const carried = p.carried || null;
    if (carried && (carried.changes.length || carried.clips.length)) {
        if (JSON.stringify(carried.changes) !== JSON.stringify(folder.record.changes.slice(0, carried.changes.length))) {
            throw new Error('[record-folder] the carried rows ' + JSON.stringify(carried.changes) + ' are not the leading rows of the Record ' + JSON.stringify(folder.record.changes) + '.');
        }
        lab[CARRIED_KEY] = {
            changes: carried.changes,
            clips: carried.clips.map(function (k, i) {
                const c = folder.clips[i];
                if (!c || c.firstTick !== k.firstTick || c.lastTick !== k.lastTick) { throw new Error('[record-folder] carried clip ' + (i + 1) + ' (ticks ' + k.firstTick + '–' + k.lastTick + ') is not the Record\'s clip ' + (i + 1) + ' ' + JSON.stringify(c) + '.'); }
                return { clip: c.file, hand: p.filmed[i], firstTick: c.firstTick, lastTick: c.lastTick };
            })
        };
    }
    if (!isStrictJson(lab)) { throw new Error('[record-folder] lab.json is strict JSON.'); }
    const files = Object.assign({}, folder.files);
    if (Object.prototype.hasOwnProperty.call(files, FILES.lab)) { throw new Error('[record-folder] the package\'s folder already carries ' + FILES.lab + ' — the host\'s file is never written over.'); }
    files[FILES.lab] = jsonText(lab);
    (p.stills || []).forEach(function (s, i) { files[STILLS[i]] = s; });
    const faults = recordFolderFaults(files);
    return { files: files, record: folder.record, lab: lab, faults: faults, complete: faults.length === 0 };
}

/** The scene facts lab.json carries, from an inventory (maxi-hands.js inventoryOf) or the lab's scene. */
export function sceneFacts(s) { return { label: s.scene !== undefined ? s.scene : s.label, id: s.id, mode: s.mode, renderer: s.renderer }; }

/** THE name of the n-th Record folder of a chain (1-based): one owner of the layout under minimaxi/out/<run>/record/. */
export function recordDirName(n) {
    if (!Number.isInteger(n) || n < 1 || n > 99) { throw new Error('[record-folder] a Record index is 1–99, got ' + JSON.stringify(n)); }
    return 'record-' + String(n).padStart(2, '0');
}
export const RECORD_DIR = /^record-(\d{2})$/;

/**
 * THE chain of one producer's closed Records (the design §6: a Record spans exactly one world; a scene change closes it and
 * the next world's opens): `worlds` = the lab's closed Records in order, [{folder, filmed, …}] (maxi-lab.js endChain; an
 * empty Record has no folder and is never listed). Returns their folder names record-01, …, each Record's `chain`
 * ({index, records}) and the hand-back clip (the last clip of the last Record). THROWS on a chain with no Record.
 */
export function recordChain(worlds, where) {
    where = where || 'of the recording';
    if (!Array.isArray(worlds) || !worlds.length) { throw new Error('[record-folder] no act happened in the worlds ' + where + ' — nothing to record.'); }
    worlds.forEach(function (w, i) {
        if (!w || !w.folder || !Array.isArray(w.folder.clips) || !w.folder.clips.length) { throw new Error('[record-folder] world ' + (i + 1) + ' ' + where + ' carries no closed Record with a clip.'); }
    });
    const names = worlds.map(function (w, i) { return recordDirName(i + 1); });
    const last = worlds[worlds.length - 1].folder.clips;
    return {
        names: names,
        handBack: { record: names[names.length - 1], clip: last[last.length - 1].file },
        chainOf: function (i) { return { index: i + 1, records: names.slice() }; }
    };
}

/**
 * A loop approve (maxi-loop.js createLoop's `last`) → its Records. `host.worlds` are the lab's closed Records of the
 * approving round, in order (maxi-lab.js endChain: one per world the round acted in, its folder the package's); `out.worlds`
 * is the loop's own view of the same worlds ({before, after, changes, clips:[{hand, clip}]}). They must agree — the same
 * acted worlds, each with as many clips and the same rows (after the rows the world's Record already held when the round
 * began, `carried`) — or this THROWS naming the world: the loop never hands back a Record it did not watch being written.
 * Each lab.json chains them (`chain: {index, records}`) and names the hand-back clip; the round's own fields
 * (LOOP_LAB_KEYS) ride in the hand-back Record's lab.json, with the producer's START: the first world's `start` (maxi-lab.js
 * THE START), THROWS when it is not a parts block. `host` = {worlds:[{folder, filmed, carried, start}], unheld?, stills?, run?, brain}.
 * Returns [{name, files, record, lab, faults, complete}], in chain order.
 */
export function assembleLoopRecords(out, host) {
    if (!out || out.verdict !== 'approve') { throw new Error('[record-folder] only an approved loop round is a Record.'); }
    if (!Array.isArray(out.worlds) || !out.worlds.length) { throw new Error('[record-folder] the loop\'s approve carries no worlds — maxi-loop.js keeps the round\'s worlds in order.'); }
    if (!host || !Array.isArray(host.worlds)) { throw new Error('[record-folder] the driver hands the round\'s closed Records (host.worlds: maxi-lab.js endChain) — a loop Record is the package\'s folder.'); }
    if (Array.isArray(host.unheld) && host.unheld.length) {
        throw new Error('[record-folder] ' + host.unheld.length + ' row(s) of the round no Record holds (a world closed with rows its footage does not show: ' +
            host.unheld.map(changeText).join('; ') + ') — maxi-loop.js refuses json:done over an unfilmed change, so this round is not a Record.');
    }
    LOOP_LAB_KEYS.forEach(function (k) { if (out[k] === undefined) { throw new Error('[record-folder] the loop\'s approve lacks `' + k + '` for lab.json.'); } });
    const acted = out.worlds.filter(function (w) { return w.changes.length || w.clips.length; });
    if (acted.length !== host.worlds.length) {
        throw new Error('[record-folder] the loop acted in ' + acted.length + ' world(s), the lab closed ' + host.worlds.length + ' Record(s) for the round — the loop\'s worlds and the Records disagree.');
    }
    const ch = recordChain(host.worlds, 'of the round');
    const start = host.worlds[0].start;
    if (partsBlockFaults(start).length) { throw new Error('[record-folder] the round\'s first world carries no start (' + START_KEY + ': the parts it held when the round began, maxi-lab.js THE START), got ' + JSON.stringify(start) + ' — the round\'s change is judged start → end; nothing was assembled.'); }
    acted.forEach(function (w, i) {
        const folder = folderHere(host.worlds[i].folder);
        if (!w.after) { throw new Error('[record-folder] world ' + (i + 1) + ' of the round carries no inventory at its close' + (w.afterRefused ? ' (the body refused it: ' + w.afterRefused + ')' : '') + ' — a Record needs the scene it recorded; nothing was assembled.'); }
        const carried = host.worlds[i].carried || { changes: [], clips: [] };   // what the Record held before the round began: not the round's
        if (w.clips.length !== folder.clips.length - carried.clips.length) { throw new Error('[record-folder] world ' + (i + 1) + ': the loop filmed ' + w.clips.length + ' clip(s), its Record holds ' + folder.clips.length + (carried.clips.length ? ' (' + carried.clips.length + ' carried from before the round)' : '') + '.'); }
        const rows = JSON.stringify(folder.record.changes.slice(carried.changes.length));
        if (rows !== JSON.stringify(w.changes)) { throw new Error('[record-folder] world ' + (i + 1) + ': the rows the loop heard (' + JSON.stringify(w.changes) + ') are not its Record\'s (' + rows + ').'); }
    });
    const last = acted[acted.length - 1];
    const lastFolder = host.worlds[host.worlds.length - 1].folder;
    if (last.clips[last.clips.length - 1].clip !== out.clip) { throw new Error('[record-folder] the hand-back clip is not the last clip of the round\'s last world — maxi-loop.js refuses json:done after a world it does not show.'); }
    if (!lastFolder.clips.length) { throw new Error('[record-folder] the round\'s last Record holds no clip.'); }
    return acted.map(function (w, i) {
        const lab = { scene: sceneFacts(w.after), brain: host.brain, run: host.run === undefined ? null : host.run,
            chain: ch.chainOf(i), handBack: Object.assign({}, ch.handBack),
            declared: { before: w.before ? w.before.objects : null, after: w.after.objects } };
        if (w === last) { LOOP_LAB_KEYS.forEach(function (k) { lab[k] = out[k]; }); }
        const rec = assembleRecord({ producer: 'loop', folder: host.worlds[i].folder, filmed: host.worlds[i].filmed, carried: host.worlds[i].carried || null, start: w === last ? start : null, stills: w === last ? host.stills : undefined, lab: lab });
        return Object.assign({ name: ch.names[i] }, rec);
    });
}

/**
 * THE gate on a chain of Records (a loop round's, or the human's Record across scene changes) [{name, files}] in folder order: [] when every folder is named in order,
 * every lab.json chains exactly these names with its own index, every one names the same hand-back clip, that clip is the
 * last clip of the last Record, and the round's own fields sit in the hand-back Record only.
 */
export function recordChainFaults(folders) {
    const bad = [];
    if (!Array.isArray(folders) || !folders.length) { return ['a loop round\'s Records are a non-empty list']; }
    const names = folders.map(function (f) { return f.name; });
    names.forEach(function (n, i) { if (n !== recordDirName(i + 1)) { bad.push('folder ' + (i + 1) + ' is ' + JSON.stringify(n) + ', not ' + recordDirName(i + 1) + ' (Records in order)'); } });
    let hb = null;
    folders.forEach(function (f, i) {
        let lab;
        try { lab = parseRecordFolder(f.files).lab; } catch (e) { bad.push(f.name + ': ' + e.message.replace('[record-folder] ', '')); return; }
        const ch = lab.chain;
        if (!ch || ch.index !== i + 1 || JSON.stringify(ch.records) !== JSON.stringify(names)) { bad.push(f.name + '/lab.json chains ' + JSON.stringify(ch) + ', not {index: ' + (i + 1) + ', records: ' + JSON.stringify(names) + '} — the chain is out of order'); }
        if (hb === null) { hb = JSON.stringify(lab.handBack); } else if (JSON.stringify(lab.handBack) !== hb) { bad.push(f.name + '/lab.json names another hand-back clip (' + JSON.stringify(lab.handBack) + ')'); }
        const roundFields = lab.producer === 'loop' ? LOOP_LAB_KEYS.filter(function (k) { return lab[k] !== undefined; }) : [];
        if (lab.producer === 'loop' && i === folders.length - 1 && roundFields.length !== LOOP_LAB_KEYS.length) { bad.push(f.name + '/lab.json lacks the round\'s own fields (' + LOOP_LAB_KEYS.filter(function (k) { return lab[k] === undefined; }).join(', ') + ') — they ride in the hand-back Record'); }
        if (i < folders.length - 1 && roundFields.length) { bad.push(f.name + '/lab.json carries the round\'s own fields (' + roundFields.join(', ') + '), which ride in the hand-back Record only'); }
    });
    const lastFolder = folders[folders.length - 1];
    let lastClips = [];
    try { lastClips = parseRecordFolder(lastFolder.files).record.clips || []; } catch (e) { lastClips = []; }
    const want = JSON.stringify({ record: lastFolder.name, clip: lastClips[lastClips.length - 1] });
    if (hb !== want) { bad.push('the hand-back clip is ' + hb + ', not the last clip of the last Record ' + want); }
    if (folders.length > 1) {   // the hand-back's start against the chain's first Record (hostFolderFaults checks a chain of one)
        let hbLab = null;
        try { hbLab = JSON.parse(textOf(lastFolder.files[FILES.lab])); } catch (e) { hbLab = null; }
        if (hbLab && hbLab[START_KEY] !== undefined) { startOpeningFaults(hbLab[START_KEY], folders[0].files, folders[0].name).forEach(function (f) { bad.push(lastFolder.name + ': ' + f); }); }
    }
    return bad;
}

// ── reading and the completeness gate ─────────────────────────────────────────────────────────
function unavailableAt(v, at, out) {
    if (v && typeof v === 'object') {
        if (!Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, UNAVAILABLE)) { out.push({ at: at || '(the whole file)', reason: String(v[UNAVAILABLE]) }); return out; }
        Object.keys(v).forEach(function (k) { unavailableAt(v[k], at ? at + '.' + k : k, out); });
    }
    return out;
}

/** Every field written {unavailable} in a folder tree's JSON files: [{file, at, reason}]. */
export function unavailableFields(files) {
    const out = [];
    Object.keys(files).filter(function (f) { return /\.json$/.test(f); }).sort().forEach(function (f) {
        let v; try { v = JSON.parse(textOf(files[f])); } catch (e) { return; }
        unavailableAt(v, '', []).forEach(function (u) { out.push({ file: f, at: u.at, reason: u.reason }); });
    });
    return out;
}

/** The parsed JSON files of a folder tree. THROWS naming a missing or unparsable file. */
export function parseRecordFolder(files) {
    const get = function (f) {
        if (!(f in files)) { throw new Error('[record-folder] the folder has no ' + f + ' (' + SHAPE_OWNER + ').'); }
        try { return JSON.parse(textOf(files[f])); } catch (e) { throw new Error('[record-folder] ' + f + ' is not JSON: ' + e.message); }
    };
    return { record: get(FILES.record), lab: get(FILES.lab), partsBefore: get(FILES.partsBefore), partsAfter: get(FILES.partsAfter) };
}

/**
 * THE form of a sketch module: a LINE that starts `export default function buildExperiment(` (the package's own form,
 * link.js SKETCH_FORM). A default export only in a comment or a string is no line start, so it is not the form.
 * scripts/test/memories.test.mjs imports it; nothing else spells it.
 */
export const SKETCH_FORM = /^export default function buildExperiment\s*\(/m;

/** The owner's placeholder key (UNAVAILABLE) used as an object key anywhere in a module text, quoted or bare. */
const PLACEHOLDER_KEY = new RegExp('(^|[{,\\s])[\'"]?' + UNAVAILABLE + '[\'"]?\\s*:', 'm');

/**
 * What is wrong with the text of a project's entry, which must be the sketch module itself: [] when it is. Refused by name:
 * a placeholder in its place (empty, a JSON value, a bare `*`); a placeholder INSIDE it (the owner's placeholder key used
 * as an object key anywhere in the text, as a part's value or bare, default export or not); and a text
 * that is not a sketch module (no line starting SKETCH_FORM). The placeholder is found by its token, not by comparing the
 * text's `parts` block with parts.after.json: this gate is synchronous and DOM-free, and reading the block's values needs
 * the module evaluated through the package's link door.
 */
export function entryTextFaults(text) {
    const t = String(text).trim();
    if (!t) { return ['is empty — the project at stop is the sketch text, never an empty file']; }
    if (t === '*') { return ['is a bare "*" — a placeholder, never the sketch text']; }
    try { JSON.parse(t); return ['parses as JSON (' + t.slice(0, 60) + ') — a placeholder, never the sketch text']; } catch (e) { /* not JSON: a module text */ }
    const bad = [];
    const ph = PLACEHOLDER_KEY.exec(t);
    if (ph) { bad.push('holds a placeholder (`' + UNAVAILABLE + ':` at line ' + t.slice(0, ph.index + ph[1].length).split('\n').length + ') — the sketch text states values, never a placeholder'); }
    if (!SKETCH_FORM.test(t)) { bad.push('is not a sketch module: no line starts `export default function buildExperiment(` (SKETCH_FORM)'); }
    return bad;
}

/**
 * What is wrong with a lab.json `teaching` value: [] when it is the human's words — a string, its ends trimmed, not
 * empty (an empty blurb is ABSENT, never ""), not the card's own prompt (TEACHING_PROMPT), and not a JSON object or
 * list (an {unavailable} placeholder among them).
 */
export function teachingFaults(v) {
    if (typeof v !== 'string') { return [TEACHING_KEY + ' is the human\'s words as a string (absent when they typed none), got ' + JSON.stringify(v)]; }
    const bad = [];
    if (!v.trim()) { bad.push(TEACHING_KEY + ' is empty — an empty blurb is absent from lab.json, never ""'); }
    else if (v !== v.trim()) { bad.push(TEACHING_KEY + ' is stored with its ends trimmed, got ' + JSON.stringify(v.slice(0, 40))); }
    if (v.trim().toLowerCase() === TEACHING_PROMPT.toLowerCase()) { bad.push(TEACHING_KEY + ' is the card\'s prompt ' + JSON.stringify(TEACHING_PROMPT) + ', a placeholder, not the human\'s words'); }
    if (/^\s*[{[]/.test(v)) {
        let parsed = null;
        try { parsed = JSON.parse(v); } catch (e) { parsed = null; }   // words that open with a bracket are words
        if (parsed && typeof parsed === 'object') { bad.push(TEACHING_KEY + ' is JSON' + (Object.prototype.hasOwnProperty.call(parsed, UNAVAILABLE) ? ' holding a placeholder (an `' + UNAVAILABLE + '` key)' : '') + ', not the human\'s words'); }
    }
    return bad;
}

/**
 * THE reader of the card's textarea: the human's words, ends trimmed, or undefined when they typed none (the Record is
 * handed as without a blurb). THROWS by name on a value teachingFaults refuses.
 */
export function teachingOf(text) {
    if (text === undefined || text === null) { return undefined; }
    if (typeof text !== 'string') { throw new Error('[record-folder] the teaching words are a string, got ' + JSON.stringify(text) + ' — nothing was sent.'); }
    const t = text.trim();
    if (!t) { return undefined; }
    const bad = teachingFaults(t);
    if (bad.length) { throw new Error('[record-folder] ' + bad.join('; ') + ' — nothing was sent.'); }
    return t;
}

/** THE one reader of a Record's project entry: project/frqtl.json's `entry` (the package's parseManifest). → {entry} | {fault}. */
export function projectEntryOf(files) {
    const at = FILES.project + MANIFEST_FILE;
    if (!Object.prototype.hasOwnProperty.call(files, at)) { return { fault: 'project/ has no ' + MANIFEST_FILE + ' naming its entry' }; }
    try { return { entry: parseManifest(textOf(files[at])).entry }; }
    catch (e) { return { fault: at + ' is refused: ' + String((e && e.message) || e) }; }
}

/**
 * What is wrong with a lab.json `carried` value against its Record: [] when it is an object {changes, clips}, not both empty,
 * its changes §6 rows that are record.json's LEADING rows, its clips {clip, hand, firstTick, lastTick} that are record.json's
 * leading clips as lab.json `filmed` names them.
 */
export function carriedFaults(v, rec, filmed) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray(v.changes) || !Array.isArray(v.clips)) { return ['is {changes: [rows], clips: [clips]}, got ' + JSON.stringify(v)]; }
    const keys = Object.keys(v).sort().join();
    const bad = [];
    if (keys !== 'changes,clips') { bad.push('carries exactly {changes, clips}, got {' + Object.keys(v).join(', ') + '}'); }
    if (!v.changes.length && !v.clips.length) { bad.push('is empty — nothing carried is ABSENT, never {changes: [], clips: []}'); }
    v.changes.forEach(function (c, i) { rowFaults(c).forEach(function (f) { bad.push('changes[' + i + ']: ' + f); }); });
    const rows = rec && Array.isArray(rec.changes) ? rec.changes : [];
    if (JSON.stringify(v.changes) !== JSON.stringify(rows.slice(0, v.changes.length))) { bad.push('changes are not the leading rows of record.json'); }
    const clips = rec && Array.isArray(rec.clips) ? rec.clips : [];
    v.clips.forEach(function (k, i) {
        const f = Array.isArray(filmed) ? filmed[i] : null;
        if (!k || typeof k !== 'object' || k.clip !== clips[i] || !CLIP_NAME.test(String(k.clip))) { bad.push('clips[' + i + '] is ' + JSON.stringify(k) + ', not record.json clip ' + JSON.stringify(clips[i]) + ' (the carried clips lead the Record)'); return; }
        if (!f || f.hand !== k.hand || f.firstTick !== k.firstTick || f.lastTick !== k.lastTick) { bad.push('clips[' + i + '] (' + k.clip + ') is not the clip lab.json filmed names ' + JSON.stringify(f)); }
    });
    return bad;
}

/**
 * The lab's HALF of the gate (the package's half is its own recordFolderFaults): [] when the host's files are right —
 * no placeholder outside the §6 files (lab.json, project/), the entry's text a sketch module (entryTextFaults), at most
 * MAX_SEGMENTS clips, the stills all three or none, and lab.json: its producer, one `filmed` entry per clip of record.json
 * in order (the clip, the hand that filmed it, its span inside tickRange), what it carried from before its producer began
 * (carriedFaults, first Record only), its unheld rows, the human's teaching words, the producer's start (a parts block,
 * hand-back Record only; where the Record opened when it is its chain's first and carried nothing, startOpeningFaults), the
 * hand-back-only keys and a chained Record's chain and hand-back.
 */
export function hostFolderFaults(files) {
    if (!files || typeof files !== 'object') { return ['a Record folder is a tree of files']; }
    const bad = unavailableFields(files).filter(function (u) { return u.file === FILES.lab || u.file.indexOf(FILES.project) === 0; }).map(function (u) {
        return u.file + ': ' + u.at + ' is a placeholder ({' + UNAVAILABLE + '}: ' + u.reason + ') — a field holds the value or the folder is incomplete';
    });
    const pe = projectEntryOf(files);
    if (pe.entry !== undefined && (FILES.project + pe.entry) in files) { entryTextFaults(textOf(files[FILES.project + pe.entry])).forEach(function (f) { bad.push('project/' + pe.entry + ' ' + f); }); }
    let rec = null;
    try { rec = JSON.parse(textOf(files[FILES.record])); } catch (e) { rec = null; }   // a missing or broken record.json is the package's to name
    const clips = (rec && Array.isArray(rec.clips)) ? rec.clips : [];
    const range = (rec && Array.isArray(rec.tickRange)) ? rec.tickRange : [NaN, NaN];
    if (clips.length > MAX_SEGMENTS) { bad.push('record.json clips lists ' + clips.length + ' segments — a Record holds at most ' + MAX_SEGMENTS + ' (the question door\'s attachments per turn)'); }
    Object.keys(files).filter(function (f) { return STILLS.indexOf(f) !== -1; }).length % STILLS.length === 0 || bad.push('the stills are all three of ' + STILLS.join(', ') + ' or none');
    if (!(FILES.lab in files)) { bad.push('the folder has no ' + FILES.lab + ' (the host\'s file beside the package\'s)'); return bad; }
    let lab;
    try { lab = JSON.parse(textOf(files[FILES.lab])); } catch (e) { bad.push(FILES.lab + ' is not JSON: ' + e.message); return bad; }
    if (!lab || typeof lab !== 'object' || Array.isArray(lab)) { bad.push(FILES.lab + ' is an object'); return bad; }
    if (PRODUCERS.indexOf(lab.producer) === -1) { bad.push('lab.json producer is one of ' + PRODUCERS.join('|') + ', got ' + JSON.stringify(lab.producer)); }
    const filmed = Array.isArray(lab.filmed) ? lab.filmed : null;
    if (!filmed) { bad.push('lab.json names no `filmed` list — which hand filmed which clip cannot be read'); }
    else {
        if (JSON.stringify(filmed.map(function (f) { return f && f.clip; })) !== JSON.stringify(clips)) { bad.push('lab.json filmed names the clips ' + JSON.stringify(filmed.map(function (f) { return f && f.clip; })) + ', not record.json clips ' + JSON.stringify(clips) + ' in the order filmed'); }
        let prev = -Infinity;
        filmed.forEach(function (f, i) {
            if (!f || typeof f.hand !== 'string' || !f.hand) { bad.push('lab.json filmed[' + i + '] names no hand'); return; }
            if (!Number.isInteger(f.firstTick) || !Number.isInteger(f.lastTick) || f.lastTick < f.firstTick || !(f.firstTick >= range[0] && f.lastTick <= range[1])) { bad.push('lab.json filmed[' + i + '] (' + f.clip + ') spans ' + JSON.stringify([f.firstTick, f.lastTick]) + ', not whole ticks inside tickRange ' + JSON.stringify(rec && rec.tickRange)); }
            else if (f.firstTick < prev) { bad.push('lab.json filmed[' + i + '] starts at tick ' + f.firstTick + ', before the clip filmed before it (' + prev + ') — clips in the order filmed'); }
            prev = Number.isInteger(f.firstTick) ? f.firstTick : prev;
        });
    }
    if (lab[CARRIED_KEY] !== undefined) {
        carriedFaults(lab[CARRIED_KEY], rec, filmed).forEach(function (f) { bad.push('lab.json ' + CARRIED_KEY + ' ' + f); });
        if (lab.chain !== undefined && (!lab.chain || lab.chain.index !== 1)) { bad.push('lab.json ' + CARRIED_KEY + ' rides in the first Record of a chain only'); }
    }
    const unheld = lab[UNHELD_KEY];
    if (unheld !== undefined) {   // rows no Record holds (a refused close's err.record)
        if (!Array.isArray(unheld) || !unheld.length) { bad.push('lab.json ' + UNHELD_KEY + ' is a non-empty list of §6 change rows (absent when none), got ' + JSON.stringify(unheld)); }
        else { unheld.forEach(function (c, i) { rowFaults(c).forEach(function (f) { bad.push('lab.json ' + UNHELD_KEY + '[' + i + ']: ' + f); }); }); }
    }
    if (lab[TEACHING_KEY] !== undefined) { teachingFaults(lab[TEACHING_KEY]).forEach(function (f) { bad.push('lab.json ' + f); }); }
    if (lab[START_KEY] !== undefined) { partsBlockFaults(lab[START_KEY]).forEach(function (f) { bad.push('lab.json ' + START_KEY + ': ' + f); }); }
    if (lab[START_KEY] !== undefined && lab.chain && lab.chain.index === 1 && Array.isArray(lab.chain.records) && lab.handBack && lab.handBack.record === lab.chain.records[0]) {
        startOpeningFaults(lab[START_KEY], files, lab.chain.records[0]).forEach(function (f) { bad.push(f); });   // the hand-back is the chain's first Record (recordChainFaults checks a longer chain)
    }
    HAND_BACK_KEYS.concat([START_KEY]).filter(function (k) { return lab[k] !== undefined; }).forEach(function (k) {   // named in the hand-back Record only
        const hbr = lab.handBack, chn = lab.chain;
        if (!hbr || !chn || !Array.isArray(chn.records) || hbr.record !== chn.records[chn.index - 1]) { bad.push('lab.json ' + k + ' rides in the hand-back Record of a chain only'); }
    });
    if (lab.producer === 'loop' || lab.chain !== undefined) {   // a chained Record (both producers)
        const hb = lab.handBack, ch = lab.chain;
        if (!hb || typeof hb.record !== 'string' || !RECORD_DIR.test(hb.record) || typeof hb.clip !== 'string' || !CLIP_NAME.test(hb.clip)) { bad.push('lab.json handBack is ' + JSON.stringify(hb) + ', not {record: "record-NN", clip: "clip-NN.mp4"}'); }
        if (!ch || !Number.isInteger(ch.index) || !Array.isArray(ch.records) || ch.records[ch.index - 1] !== recordDirName(Math.max(1, Math.min(99, ch.index || 1)))) { bad.push('lab.json chain is ' + JSON.stringify(ch) + ', not {index, records: ["record-01", …]} naming this Record at its index'); }
        else if (hb && hb.record === ch.records[ch.index - 1] && hb.clip !== clips[clips.length - 1]) { bad.push('lab.json handBack names ' + hb.clip + ' in this Record, not its last clip ' + clips[clips.length - 1] + ' — the hand-back clip is the last entry of clips[]'); }
    }
    return bad;
}

/**
 * THE gate on a Record folder tree: [] when it is a COMPLETE Record, else every fault by name — the package's half
 * (@descix/frqtl-web recordFolderFaults: the §6 files) then the lab's (hostFolderFaults). One gate, two owners.
 */
export function recordFolderFaults(files) {
    return packageFolderFaults(files).concat(hostFolderFaults(files));
}

// ── the plan against the Record ───────────────────────────────────────────────────────────────

/** The Designer's plan a loop Record carries: lab.json[PLAN_KEY]. THROWS naming a folder that holds none. */
export function planOf(files) {
    const lab = parseRecordFolder(files).lab;
    if (lab.producer !== 'loop' || !lab[PLAN_KEY] || typeof lab[PLAN_KEY] !== 'object') {
        throw new Error('[record-folder] lab.json carries no `' + PLAN_KEY + '` (producer ' + JSON.stringify(lab.producer) + ') — only the hand-back Record of a loop holds the round\'s plan (LOOP_LAB_KEYS).');
    }
    return lab[PLAN_KEY];
}

/**
 * THE one reader of the producer's START a Record carries: lab.json[START_KEY], a parts block. THROWS naming a Record that
 * carries none (it is not the hand-back of a chain, or it was written before Records carried their start) or one that is
 * not a parts block — a start is never stood in for by parts.before.json, which is where this Record's world was when the
 * Record opened, not necessarily where the round began.
 */
export function startOf(files) {
    const lab = parseRecordFolder(files).lab;
    if (!Object.prototype.hasOwnProperty.call(lab, START_KEY)) {
        throw new Error('[record-folder] lab.json carries no `' + START_KEY + '` — the hand-back Record of a chain names the parts its round began from; this Record does not, so its round cannot be judged start → end (parts.before.json is where its world stood when the Record opened, not necessarily where the round began).');
    }
    const bad = partsBlockFaults(lab[START_KEY]);
    if (bad.length) { throw new Error('[record-folder] lab.json ' + START_KEY + ': ' + bad.join('; ')); }
    return lab[START_KEY];
}

/** Strict-JSON equality, key order aside. */
function canon(v) {
    if (Array.isArray(v)) { return '[' + v.map(canon).join(',') + ']'; }
    if (v && typeof v === 'object') { return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}'; }
    return JSON.stringify(v);
}

/** How far a planned centre may sit from a rect's centre, per axis, in world px: an odd-width rect's centre is a half pixel. */
export const RECT_CENTER_SLACK = 0.5;

/**
 * What a props bag holds for a plan's {param}: {value, fromRect?} | {none: why}. `center` on a rect-placed bag is its rect's
 * centre (maxi-hands.js centerOfRect): a move row and parts.after.json state a part in the shape it is DECLARED by.
 */
function heldOf(bag, param) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) { return { none: 'no props' }; }
    if (Object.prototype.hasOwnProperty.call(bag, param)) { return { value: bag[param] }; }
    if (param === PLACEMENT_KEYS[0] && Array.isArray(bag.rect)) {
        try { return { value: centerOfRect(bag.rect), fromRect: bag.rect }; }
        catch (e) { return { none: String(e.message) }; }
    }
    if (param === PLACEMENT_KEYS[1] && Array.isArray(bag.center)) { return { none: 'it is placed by its centre, so it has no rect' }; }
    return { none: 'no `' + param + '`' };
}

/**
 * Does a held value state the planned one? A centre compares on the plan's own axes (a 2D centre's z is 0): exactly against
 * a held centre, within RECT_CENTER_SLACK per axis against a rect's centre. Anything else is strict-JSON equal.
 */
function sameValue(param, planned, h) {
    if (param !== PLACEMENT_KEYS[0]) { return canon(planned) === canon(h.value); }
    const held = h.value;
    if (!Array.isArray(planned) || !Array.isArray(held) || planned.length < 2 || planned.length > 3) { return false; }
    const c = held.length === 2 ? held.concat([0]) : held;
    const slack = h.fromRect ? RECT_CENTER_SLACK : 0;
    return planned.every(function (n, i) { return typeof n === 'number' && Math.abs(n - c[i]) <= slack; });
}

/**
 * The params of a part a row acts on, beyond what its plan names (`planned`: the plan's params for that part): a setDeclared's
 * patched keys the plan does not name; a move when the plan names neither centre nor rect (either names a placement, stated in
 * the declared shape); a remove or a fork, which no plan change can say. An add is the part's arrival: its planned params are
 * checked against its props, the rest of its entry is not an act.
 */
function beyondPlan(row, planned) {
    if (row.op === 'setDeclared') { return Object.keys(row.to || {}).filter(function (k) { return planned.indexOf(k) === -1; }); }
    if (row.op === MOVE) { return PLACEMENT_KEYS.some(function (k) { return planned.indexOf(k) !== -1; }) ? [] : [Object.keys(row.to || {})[0] || MOVE]; }
    if (row.op === 'add') { return []; }
    return [row.op];
}

/** A Record's name in the chain (lab.json chain.records at its index), else its place in the list. */
function chainName(lab, i) {
    const ch = lab && lab.chain;
    return (ch && Array.isArray(ch.records) && typeof ch.records[ch.index - 1] === 'string') ? ch.records[ch.index - 1] : 'records[' + i + ']';
}

/** The words of the round-level refusal: a round that ends where it started changed nothing (recordPlanFaults). */
export const NO_CHANGE = 'no change';

/**
 * THE plan-against-Record check, in code (the Owl never sees the plan: it gets the outline, the prediction and the footage).
 * `plan` is maxi-roles.js parsePlan's plan as the hand-back Record's lab.json holds it (planOf); each change is read as
 * {object, param, value} (its `why` is words). `records` is the round's CHAIN in order, each a Record folder tree (one Record
 * per booted world; the last is the hand-back); a one-Record round is a chain of one, [files]. The round's change is judged
 * START → END: START is the producer's start the hand-back carries (startOf: the parts the round began from), END the
 * hand-back's parts.after.json. No row decides it: a re-staging row and the row that undoes it say nothing
 * about where the round ended. [] when the chain states the plan; else every fault by name:
 *   - the hand-back carries no start (a Record that cannot be judged start → end);
 *   - NO_CHANGE: END equals START — the round ends where it started, whatever its rows did;
 *   - a plan change END does not hold at its value (for a planned centre of a rect-declared part, its rect's centre within
 *     RECT_CENTER_SLACK px per axis);
 *   - a plan change START already holds: start → end does not make it;
 *   - a row, in any Record, on a part the plan never mentions;
 *   - a row on a planned part that acts beyond the plan: a param the plan does not name for that part (beyondPlan).
 * Pure: it reads, never repairs, and never decides whether a fault blocks a memory (the loop does).
 */
export function recordPlanFaults(plan, records) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.changes)) { return ['the plan is maxi-roles.js parsePlan\'s {…, changes: [{object, param, value, why}]}, got ' + JSON.stringify(plan)]; }
    if (!Array.isArray(records) || !records.length) { return ['records is the round\'s chain of Record folder trees in order, the hand-back last ([files] for one Record), got ' + (Array.isArray(records) ? '[]' : typeof records)]; }
    const chain = [];
    for (let i = 0; i < records.length; i++) {
        let parsed;
        try { parsed = parseRecordFolder(records[i]); } catch (e) { return ['records[' + i + ']: ' + e.message.replace('[record-folder] ', '')]; }
        const name = chainName(parsed.lab, i);
        if (!Array.isArray(parsed.record.changes)) { return [name + '/record.json changes is not a list: ' + JSON.stringify(parsed.record.changes)]; }
        const carried = parsed.lab && parsed.lab[CARRIED_KEY] && Array.isArray(parsed.lab[CARRIED_KEY].changes) ? parsed.lab[CARRIED_KEY].changes.length : 0;
        chain.push({ name: name, rows: parsed.record.changes.slice(carried), after: parsed.partsAfter });   // rows carried from before the producer began are not the plan's
    }
    const handBack = chain[chain.length - 1];
    const bad = [];
    let start = null;
    try { start = startOf(records[records.length - 1]); } catch (e) { bad.push(handBack.name + ': ' + e.message.replace('[record-folder] ', '')); }
    const end = handBack.after;
    if (start !== null && partsEqual(start, end)) {
        bad.push(NO_CHANGE + ': ' + handBack.name + '/parts.after.json equals the start (lab.json ' + START_KEY + ') — the round ends where it started' + (handBack.rows.length ? ', whatever its ' + handBack.rows.length + ' row(s) did on the way' : ''));
    }
    const named = {};   // part → the params the plan names for it
    plan.changes.forEach(function (c, i) {
        if (!c || typeof c !== 'object' || typeof c.object !== 'string' || !c.object || typeof c.param !== 'string' || !c.param || !('value' in c)) {
            bad.push('plan changes[' + i + '] is not {object, param, value, why} (maxi-roles.js parsePlan): ' + JSON.stringify(c)); return;
        }
        (named[c.object] = named[c.object] || []).push(c.param);
        const at = 'plan changes[' + i + '] (' + c.object + ' ' + c.param + ': ' + JSON.stringify(c.value) + ')';
        const entry = end && typeof end === 'object' ? end[c.object] : undefined;
        if (!isEntry(entry)) { bad.push(at + ': ' + handBack.name + '/parts.after.json has no part "' + c.object + '"'); return; }
        const h = heldOf(entry[1], c.param);
        if (h.none !== undefined) { bad.push(at + ': ' + handBack.name + '/parts.after.json "' + c.object + '" holds no ' + c.param + ' (' + h.none + ')'); }
        else if (!sameValue(c.param, c.value, h)) {
            bad.push(at + ': ' + handBack.name + '/parts.after.json holds "' + c.object + '" ' + c.param + ' at ' + JSON.stringify(h.value) +
                (h.fromRect ? ' (the centre of its rect ' + JSON.stringify(h.fromRect) + ', ' + RECT_CENTER_SLACK + ' px per axis allowed)' : '') + ', not ' + JSON.stringify(c.value));
        }
        if (start === null) { return; }
        const was = isEntry(start[c.object]) ? heldOf(start[c.object][1], c.param) : { none: 'absent' };
        if (was.none === undefined && sameValue(c.param, c.value, was)) {
            bad.push(at + ': the start (lab.json ' + START_KEY + ') already holds "' + c.object + '" ' + c.param + ' at ' + JSON.stringify(was.value) +
                (was.fromRect ? ' (the centre of its rect ' + JSON.stringify(was.fromRect) + ')' : '') + ' — start → end does not make this change');
        }
    });
    const parts = Object.keys(named);
    chain.forEach(function (r) {
        r.rows.forEach(function (row, i) {
            if (!row) { return; }
            const where = r.name + '/record.json changes[' + i + '] (' + row.op + ' of "' + row.name + '")';
            if (!named[row.name]) { bad.push(where + ' is on a part the plan never mentions (the plan names ' + (parts.length ? parts.map(function (n) { return '"' + n + '"'; }).join(', ') : 'no part') + ')'); return; }
            const beyond = beyondPlan(row, named[row.name]);
            if (beyond.length) { bad.push(where + ' acts beyond the plan: ' + beyond.join(', ') + ' (the plan names ' + named[row.name].join(', ') + ' for "' + row.name + '")'); }
        });
    });
    return bad;
}

/** One line for a human: complete, or its faults by name. */
export function completenessWords(rec) {
    if (rec.complete) { return 'Record folder complete (' + SHAPE_OWNER + ').'; }
    return 'Record folder incomplete — ' + rec.faults.length + ' fault' + (rec.faults.length === 1 ? '' : 's') + ': ' + rec.faults.join(' · ') + '.';
}

/** THROWS listing every fault unless the tree is a complete Record. */
export function assertCompleteRecord(files, where) {
    const bad = recordFolderFaults(files);
    if (bad.length) { throw new Error((where || 'the Record folder') + ' is not a complete Record (' + SHAPE_OWNER + '):\n- ' + bad.join('\n- ')); }
    return files;
}

/** Base64 → bytes (the page's clips travel as base64 media). */
export function bytesOfBase64(b64) {
    if (typeof b64 !== 'string' || !b64) { throw new Error('[record-folder] bytesOfBase64 needs raw base64.'); }
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
}

/** Bytes → base64 (a clip crossing from the page to node; bytesOfBase64 reads it back). */
export function base64OfBytes(bytes) {
    if (!bytes || typeof bytes.length !== 'number' || typeof bytes.BYTES_PER_ELEMENT !== 'number') { throw new Error('[record-folder] base64OfBytes needs bytes.'); }
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) { bin += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 0x8000)); }
    return btoa(bin);
}
