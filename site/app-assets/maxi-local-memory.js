/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-local-memory.js — LOCAL MEMORIES: a human's Record, kept in THIS browser.
 *
 * When a human's Record demonstration COMPLETES (Stop assembled it and its card appears: maxi-record.js onComplete) the lab
 * keeps it here, in the browser's IndexedDB; Send to Maxi keeps it again with the words and his answer; closing its card (×)
 * removes it. It is stored nowhere else, never written to Maxi's knowledge base and never seen by another visitor; Maxi sees
 * it only when it is sent or discussed. Promoting one to a published memory is not this module's door.
 *
 * The ONE owner of:
 *   - the key rule (memoryKey): the hand-back Record's scene (id, and its mode when it has one) and its record.json tickRange;
 *   - the entry: {key, savedAt, records: [{name, files}]} — `records` is the human's Record chain as maxi-record.js recordsOf
 *     assembles it, each `files` EXACTLY the Record folder's files (maxi-record-folder.js FILES, the clips, the stills when there
 *     are any), text as text and bytes (clip-NN.mp4, the stills) as Blobs. No field of the folder is copied out: the scene, the
 *     teaching words and Maxi's answer are read off lab.json, so the folder is the only schema;
 *   - reading an entry back (entryHere): the Blobs made bytes, then THE gate on it — the Record owner's recordFolderFaults on
 *     every Record and recordChainFaults on the chain, the producer the human's, the key the key rule's. A corrupt entry is
 *     listed with its faults and refused by name when it is opened; it is never repaired;
 *   - the store (openMemories: save, list, load, remove): the ONLY module of the site that touches IndexedDB
 *     (scripts/test/local-memory.test.mjs fails a second writer). A refusal by the browser (its storage full: QuotaExceededError)
 *     is thrown by name, never dropped;
 *   - the facts a remembered Record is discussed with (memoryNote, memoryMedia): maxi-record.js demonstrationNote and
 *     demonstrationMedia over the stored Records, the parts diff (partsDiffText) and Maxi's answer then. The question itself is
 *     maxi-ask.js footageUserInput's, with the visitor's words as its `question`.
 */

import {
    FILES, STILLS, CLIP_NAME, TEACHING_KEY, UNHELD_KEY, CARRIED_KEY,
    recordFolderFaults, recordChainFaults, parseRecordFolder, partsDiffText
} from './maxi-record-folder.js';
import { demonstrationNote, demonstrationMedia } from './maxi-record.js';

/** The browser database and its one object store. */
export const DB_NAME = 'egpt-godsworld:maxi-local-memory';
export const DB_VERSION = 1;
export const STORE = 'memories';
/** An entry's keys, exactly. */
export const ENTRY_KEYS = Object.freeze(['key', 'savedAt', 'records']);
/** The producer a local memory holds: the human's Record (maxi-record-folder.js PRODUCERS); Maxi writes no local memory. */
export const PRODUCER = 'record';
/** The scene part of a key for a sketch Maxi wrote (no registry id). */
export const SKETCH_SCENE = 'sketch';
/** The mime of a stored file's bytes, by its name: a clip, a still. */
const CLIP_MIME = 'video/mp4';
const STILL_MIME = 'image/png';

function isBytes(v) { return !!v && typeof v === 'object' && typeof v.length === 'number' && typeof v.BYTES_PER_ELEMENT === 'number'; }
function isBlob(v) { return !!v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.size === 'number' && typeof v.type === 'string'; }
function mimeOf(file) { return CLIP_NAME.test(file) ? CLIP_MIME : STILLS.indexOf(file) !== -1 ? STILL_MIME : null; }

/**
 * THE key of a local memory: "<scene id>[#<mode>]@<first>-<last>" off the hand-back (last) Record of the chain — its lab.json
 * scene (a sketch Maxi wrote has no id: SKETCH_SCENE) and its record.json tickRange. THROWS on a chain whose hand-back
 * Record cannot be read.
 */
export function memoryKey(records) {
    if (!Array.isArray(records) || !records.length) { throw new Error('[local-memory] a local memory is a non-empty chain of Records [{name, files}].'); }
    const hb = parseRecordFolder(records[records.length - 1].files);
    const sc = hb.lab && hb.lab.scene;
    const range = hb.record && hb.record.tickRange;
    if (!sc || typeof sc !== 'object') { throw new Error('[local-memory] the hand-back Record\'s lab.json names no scene — a local memory is keyed by its scene.'); }
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger)) { throw new Error('[local-memory] the hand-back Record\'s record.json tickRange is ' + JSON.stringify(range) + ', not [first, last] whole ticks.'); }
    const id = (typeof sc.id === 'string' && sc.id) ? sc.id : SKETCH_SCENE;
    return id + (typeof sc.mode === 'string' && sc.mode ? '#' + sc.mode : '') + '@' + range[0] + '-' + range[1];
}

/** What keeps a chain from being kept: the gate on every Record and on the chain, and the producer. [] when none. */
function chainFaults(records) {
    const bad = [];
    records.forEach(function (r, i) {
        const name = (r && typeof r.name === 'string') ? r.name : 'records[' + i + ']';
        if (!r || !r.files || typeof r.files !== 'object') { bad.push(name + ': no files'); return; }
        recordFolderFaults(r.files).forEach(function (f) { bad.push(name + ': ' + f); });
        let lab = null;
        try { lab = parseRecordFolder(r.files).lab; } catch (e) { return; }   // a missing or broken file is the gate's to name (above)
        if (!lab || lab.producer !== PRODUCER) { bad.push(name + '/lab.json producer is ' + JSON.stringify(lab && lab.producer) + ' — a local memory holds the human\'s Record (' + PRODUCER + ') only'); }
    });
    if (!bad.length) { recordChainFaults(records).forEach(function (f) { bad.push(f); }); }
    return bad;
}

/**
 * The entry kept for a human's Record chain (maxi-record.js recordsOf: [{name, files, …}]): {key, savedAt, records:
 * [{name, files}]}, every file of every Record as it is (text), its bytes as a Blob of the file's type. THROWS listing every
 * fault when the chain is not complete Records of the human (nothing incomplete is ever kept).
 */
export function entryOf(records, savedAt) {
    if (!Array.isArray(records) || !records.length) { throw new Error('[local-memory] a local memory is a non-empty chain of Records [{name, files}].'); }
    const bad = chainFaults(records);
    if (bad.length) { throw new Error('[local-memory] this demonstration is not complete Records, so it is not kept:\n- ' + bad.join('\n- ')); }
    if (typeof savedAt !== 'string' || isNaN(Date.parse(savedAt))) { throw new Error('[local-memory] savedAt is an ISO date string, got ' + JSON.stringify(savedAt)); }
    return {
        key: memoryKey(records), savedAt: savedAt,
        records: records.map(function (r) {
            const files = {};
            Object.keys(r.files).forEach(function (f) {
                const v = r.files[f];
                if (typeof v === 'string') { files[f] = v; return; }
                const mime = mimeOf(f);
                if (!isBytes(v) || !mime) { throw new Error('[local-memory] ' + r.name + '/' + f + ' is neither text nor a clip or still\'s bytes.'); }
                files[f] = new Blob([v], { type: mime });
            });
            return { name: r.name, files: files };
        })
    };
}

/**
 * An entry as IndexedDB gives it back → {key, savedAt, records: [{name, files}], faults}: every Blob read back as bytes, then
 * THE gate — the entry's own keys, each file text or a Blob of its file's type, chainFaults (recordFolderFaults on every
 * Record, recordChainFaults, the producer) and the key the key rule gives. Never throws on a corrupt entry: its faults say why.
 */
export async function entryHere(raw) {
    const bad = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return { key: null, savedAt: null, records: [], faults: ['the entry is ' + JSON.stringify(raw) + ', not {' + ENTRY_KEYS.join(', ') + '}'] }; }
    const keys = Object.keys(raw);
    if (keys.length !== ENTRY_KEYS.length || !ENTRY_KEYS.every(function (k) { return keys.indexOf(k) !== -1; })) { bad.push('the entry carries {' + keys.join(', ') + '}, not exactly {' + ENTRY_KEYS.join(', ') + '}'); }
    const key = typeof raw.key === 'string' ? raw.key : null;
    if (!key) { bad.push('the entry\'s key is ' + JSON.stringify(raw.key) + ', not a string'); }
    const savedAt = (typeof raw.savedAt === 'string' && !isNaN(Date.parse(raw.savedAt))) ? raw.savedAt : null;
    if (!savedAt) { bad.push('savedAt is ' + JSON.stringify(raw.savedAt) + ', not an ISO date'); }
    if (!Array.isArray(raw.records) || !raw.records.length) { bad.push('records is ' + JSON.stringify(raw.records) + ', not a non-empty chain of Records'); return { key: key, savedAt: savedAt, records: [], faults: bad }; }
    const records = [];
    for (let i = 0; i < raw.records.length; i++) {
        const r = raw.records[i];
        const name = (r && typeof r.name === 'string') ? r.name : 'records[' + i + ']';
        if (!r || !r.files || typeof r.files !== 'object' || Array.isArray(r.files)) { bad.push(name + ': no files'); records.push({ name: name, files: {} }); continue; }
        const files = {};
        for (const f of Object.keys(r.files)) {
            const v = r.files[f];
            if (typeof v === 'string') { files[f] = v; }
            else if (isBlob(v) && mimeOf(f) && v.type === mimeOf(f)) { files[f] = new Uint8Array(await v.arrayBuffer()); }
            else { bad.push(name + '/' + f + ' is ' + (isBlob(v) ? 'a ' + JSON.stringify(v.type) + ' Blob' : typeof v) + ', not ' + (mimeOf(f) ? 'a ' + mimeOf(f) + ' Blob' : 'text')); }
        }
        records.push({ name: name, files: files });
    }
    chainFaults(records).forEach(function (f) { bad.push(f); });
    if (key) {
        let want = null;
        try { want = memoryKey(records); } catch (e) { want = null; }
        if (want !== null && want !== key) { bad.push('the entry is kept as ' + JSON.stringify(key) + ', and its Records key as ' + JSON.stringify(want) + ' (the scene and tick range of the hand-back Record)'); }
    }
    return { key: key, savedAt: savedAt, records: records, faults: bad };
}

/** What the pane lists for an entry read back (entryHere): the folder's own facts, read off its hand-back lab.json. */
export function summaryOf(e) {
    const s = { key: e.key, savedAt: e.savedAt, records: e.records.length, scene: null, teaching: null, answered: null, changes: null, faults: e.faults };
    if (e.faults.length) { return s; }
    const hb = parseRecordFolder(e.records[e.records.length - 1].files);
    s.scene = hb.lab.scene;
    s.teaching = hb.lab[TEACHING_KEY] === undefined ? null : hb.lab[TEACHING_KEY];
    s.answered = hb.lab.asked ? hb.lab.asked.answer_excerpt : null;
    s.changes = e.records.reduce(function (n, r) {
        const p = parseRecordFolder(r.files);
        return n + p.record.changes.length - (p.lab[CARRIED_KEY] ? p.lab[CARRIED_KEY].changes.length : 0);
    }, 0);
    return s;
}

function sameBytes(a, b) {
    if (typeof a === 'string' || typeof b === 'string') { return typeof a === 'string' && typeof b === 'string' && a === b; }
    if (!isBytes(a) || !isBytes(b) || a.length !== b.length) { return false; }
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { return false; } }
    return true;
}

/**
 * Why `next` is not the Record already kept (`kept`, read back): [] when it is the SAME Record — the same Records by name,
 * each with the same files, every file but lab.json the same text or bytes (lab.json may gain the words and Maxi's answer).
 */
export function sameRecordFaults(kept, next) {
    if (kept.length !== next.length) { return ['the kept chain has ' + kept.length + ' Record(s), this one ' + next.length]; }
    const bad = [];
    kept.forEach(function (r, i) {
        const n = next[i];
        if (r.name !== n.name) { bad.push('Record ' + (i + 1) + ' is ' + r.name + ' there, ' + n.name + ' here'); return; }
        const names = Array.from(new Set(Object.keys(r.files).concat(Object.keys(n.files)))).sort();
        names.forEach(function (f) {
            if (f === FILES.lab) { return; }
            if (!(f in r.files) || !(f in n.files)) { bad.push(r.name + '/' + f + ' is in only one of them'); }
            else if (!sameBytes(r.files[f], n.files[f])) { bad.push(r.name + '/' + f + ' differs'); }
        });
    });
    return bad;
}

/** A refusal by the browser's store, by name: what it was doing, the browser's own error, what it means. */
function storeError(op, err) {
    const name = (err && err.name) || 'Error';
    const msg = (err && err.message) || String(err);
    return new Error('[local-memory] ' + op + ': this browser refused (' + name + ': ' + msg + ')' +
        (name === 'QuotaExceededError' ? ' — its storage for this site is full; delete a memory in Your memories to make room.' : '.') +
        (op === 'save' ? ' Nothing was saved.' : ''));
}

function request(r, op) {
    return new Promise(function (resolve, reject) {
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(storeError(op, r.error)); };
    });
}

/** One transaction on the store: resolves `act(store)`'s value when the transaction COMPLETES; a failed or aborted one rejects by name. */
function transact(db, mode, op, act) {
    return new Promise(function (resolve, reject) {
        let tx;
        try { tx = db.transaction(STORE, mode); } catch (err) { reject(storeError(op, err)); return; }
        let value;
        let failed = null;
        tx.oncomplete = function () { if (failed) { reject(failed); } else { resolve(value); } };
        tx.onerror = function () { failed = failed || storeError(op, tx.error); };
        tx.onabort = function () { reject(failed || storeError(op, tx.error || new Error('the transaction was aborted'))); };
        Promise.resolve().then(function () { return act(tx.objectStore(STORE)); }).then(function (v) { value = v; }, function (err) { failed = err; try { tx.abort(); } catch (e) { reject(err); } });
    });
}

/**
 * THE store of local memories: {save(records), list(), load(key), remove(key)}. `spec.indexedDB` is the browser's (the default)
 * or a test's; a browser that offers none is refused by name at the first call. The database opens once, on first use.
 *   save(records)  — keeps the human's Record chain (entryOf) under its key; the SAME Record kept again (sameRecordFaults: every
 *                    file but lab.json unchanged, e.g. now with the words and Maxi's answer) replaces it and keeps its first
 *                    savedAt; anything else under the same key is refused by name (never written over). → {key, savedAt, replaced}
 *   list()         — every entry, newest first, as summaryOf reads it (a corrupt one with its faults).
 *   load(key)      — the entry's Records [{name, files}] read back; THROWS by name when there is none or it is corrupt.
 *   remove(key)    — deletes it. → {removed: key, existed}
 */
export function openMemories(spec) {
    spec = spec || {};
    const idb = spec.indexedDB !== undefined ? spec.indexedDB : globalThis.indexedDB;
    const now = typeof spec.now === 'function' ? spec.now : function () { return new Date().toISOString(); };
    let dbp = null;
    function db() {
        if (!idb || typeof idb.open !== 'function') { return Promise.reject(new Error('[local-memory] this browser offers no IndexedDB to the lab, so no local memory can be kept or read here.')); }
        if (!dbp) {
            dbp = new Promise(function (resolve, reject) {
                const r = idb.open(DB_NAME, DB_VERSION);
                r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) { r.result.createObjectStore(STORE, { keyPath: 'key' }); } };
                r.onsuccess = function () { resolve(r.result); };
                r.onerror = function () { reject(storeError('open', r.error)); };
                r.onblocked = function () { reject(new Error('[local-memory] open: another tab holds an older version of the memories database open — close it and try again.')); };
            });
            dbp.catch(function () { dbp = null; });
        }
        return dbp;
    }
    async function rawOf(key) {
        if (typeof key !== 'string' || !key) { throw new Error('[local-memory] a local memory is named by its key (a string), got ' + JSON.stringify(key)); }
        return transact(await db(), 'readonly', 'load', function (s) { return request(s.get(key), 'load'); });
    }
    return {
        save: async function (records) {
            const fresh = entryOf(records, now());
            const d = await db();
            // two transactions: reading the kept entry back awaits its Blobs, and a transaction that waits on anything but its
            // own requests commits by itself
            const had = await transact(d, 'readonly', 'save', function (s) { return request(s.get(fresh.key), 'save'); });
            let savedAt = fresh.savedAt;
            if (had !== undefined) {
                const old = await entryHere(had);
                const differ = old.faults.length ? [] : sameRecordFaults(old.records, records);
                if (old.faults.length || differ.length) {
                    throw new Error('[local-memory] save: another demonstration is already kept as ' + JSON.stringify(fresh.key) + ' (the same scene and ticks)' +
                        (old.faults.length ? ', and it is corrupt (' + old.faults.join('; ') + ')' : ': ' + differ.join('; ')) + ' — delete it in Your memories, then save again. Nothing was saved.');
                }
                savedAt = old.savedAt;
            }
            const entry = { key: fresh.key, savedAt: savedAt, records: fresh.records };
            await transact(d, 'readwrite', 'save', function (s) { return request(s.put(entry), 'save'); });
            return { key: fresh.key, savedAt: savedAt, replaced: had !== undefined };
        },
        list: async function () {
            const all = await transact(await db(), 'readonly', 'list', function (s) { return request(s.getAll(), 'list'); });
            const out = [];
            for (const raw of all) { out.push(summaryOf(await entryHere(raw))); }
            return out.sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); });
        },
        load: async function (key) {
            const raw = await rawOf(key);
            if (raw === undefined) { throw new Error('[local-memory] no local memory is kept as ' + JSON.stringify(key) + ' in this browser.'); }
            const e = await entryHere(raw);
            if (e.faults.length) { throw new Error('[local-memory] the memory ' + JSON.stringify(key) + ' is refused — it is not a complete Record:\n- ' + e.faults.join('\n- ')); }
            return { key: e.key, savedAt: e.savedAt, records: e.records };
        },
        remove: async function (key) {
            const raw = await rawOf(key);
            await transact(await db(), 'readwrite', 'remove', function (s) { return request(s.delete(key), 'remove'); });
            return { removed: key, existed: raw !== undefined };
        }
    };
}

// ── a remembered Record, as Maxi is asked about it ─────────────────────────────────────────────

/** The world entries maxi-record.js composes a demonstration from, read back off the stored Records' own files. */
function worldsOf(records) {
    return records.map(function (r) {
        const p = parseRecordFolder(r.files);
        return {
            folder: { files: r.files, record: p.record, clips: p.lab.filmed.map(function (f) { return { file: f.clip, firstTick: f.firstTick, lastTick: f.lastTick }; }) },
            filmed: p.lab.filmed.map(function (f) { return f.hand; }), carried: p.lab[CARRIED_KEY] || null, scene: p.lab.scene
        };
    });
}

/** How the note of a remembered demonstration opens. */
export const LOCAL_MEMORY_HEAD = 'This is a LOCAL MEMORY: a demonstration the visitor recorded and kept in their own browser; it is not in your memories.';

/**
 * The note a remembered demonstration is asked about with (memory = load()'s {savedAt, records}): LOCAL_MEMORY_HEAD and the
 * date, the demonstration as maxi-record.js demonstrationNote writes it (scenes, clips, change rows, rows set aside or unheld),
 * the parts diff of each Record (partsDiffText), and Maxi's answer when it was handed to him.
 */
export function memoryNote(memory) {
    const worlds = worldsOf(memory.records);
    const hb = parseRecordFolder(memory.records[memory.records.length - 1].files);
    const diff = memory.records.map(function (r, i) {
        const p = parseRecordFolder(r.files);
        return (memory.records.length > 1 ? 'Record ' + (i + 1) + ' — ' : '') + 'parts before → after:\n' + partsDiffText(p.partsBefore, p.partsAfter);
    }).join('\n');
    return LOCAL_MEMORY_HEAD + ' Kept on ' + memory.savedAt + '.\n' + demonstrationNote(worlds, hb.lab[UNHELD_KEY] || []) + '\n' + diff +
        (hb.lab.asked ? '\nWhen it was handed to you, you answered (its first lines): ' + hb.lab.asked.answer_excerpt : '');
}

/** The remembered demonstration's footage: its clips as media[] (maxi-record.js demonstrationMedia), in filming order. */
export function memoryMedia(memory) { return demonstrationMedia(worldsOf(memory.records)); }

/** The human's teaching words a remembered demonstration carries (its hand-back lab.json), or undefined. */
export function memoryTeaching(memory) {
    const t = parseRecordFolder(memory.records[memory.records.length - 1].files).lab[TEACHING_KEY];
    return t === undefined ? undefined : t;
}
