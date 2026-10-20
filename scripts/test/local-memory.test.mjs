/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * local-memory.test.mjs — LOCAL MEMORIES (site/app-assets/maxi-local-memory.js): a human's Record kept in the browser.
 *
 * Gates, each shown red on a planted fault:
 *   1. the key rule: scene id (#mode) @ the hand-back Record's tickRange; an entry kept under another key is refused by name;
 *   2. the entry IS the Record folder: exactly its files, round-tripped through the store byte for byte (the clips as Blobs),
 *      and the gate on it is the Record owner's recordFolderFaults ∪ recordChainFaults (an owner copy without it is red);
 *   3. the owner is the only writer: no other published site file names IndexedDB or the database, and the lab keeps
 *      memories through ONE call of the store's save (a planted second writer of either kind is red);
 *   4. a corrupt entry is listed with its faults and refused by name at load (six plants);
 *   5. a refusal by the browser's store (its storage full: QuotaExceededError) surfaces by name and keeps nothing (an owner
 *      copy that resolves an aborted transaction is red);
 *   6. the same Record kept again replaces itself and keeps its first date; another Record under the same key is refused;
 *   7. Discuss: the visitor's question rides the ONE composition (maxi-ask.js footageUserInput) after the memory's facts, and
 *      the lab asks it through its one door, lab.ask (a planted second prompt builder in the page is red).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as memory from '../../site/app-assets/maxi-local-memory.js';
import { FILES, TEACHING_KEY, TEACHING_PROMPT, recordFolderFaults, changeText } from '../../site/app-assets/maxi-record-folder.js';
import * as folder from '../../site/app-assets/maxi-record-folder.js';
import { recordsOf, SEGMENT_HAND } from '../../site/app-assets/maxi-record.js';
import { footageUserInput, DISCUSS_HEAD, DISCUSS_QUESTION, TEACHING_HEAD, LOOK_QUESTION } from '../../site/app-assets/maxi-ask.js';
import { manifestFor, serializeManifest } from '../../site/app-assets/frqtl-web-project.js';
import { publishedFiles } from '../publish-paths.mjs';
import { distUrl } from '../frqtl-web-pin.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OWNER = 'site/app-assets/maxi-local-memory.js';
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { serializeRecordFolder } = await import(distUrl('shim/project/record-format.js'));

// ── a fake IndexedDB: requests answer on a later task; a transaction commits by itself once no request is pending ──
/** `opts.quotaBytes`: a transaction whose puts hold more bytes aborts with QuotaExceededError, as a full origin does. */
export function fakeIndexedDB(opts) {
    opts = opts || {};
    const dbs = {};
    const later = (fn) => setTimeout(fn, 0);
    const sizeOf = (v) => (v && typeof v === 'object') ? (typeof v.size === 'number' && typeof v.arrayBuffer === 'function' ? v.size : Object.keys(v).reduce((n, k) => n + sizeOf(v[k]), 0)) : (typeof v === 'string' ? v.length : 8);
    const clone = (v) => (v && typeof v === 'object') ? ((typeof v.arrayBuffer === 'function') ? v : Array.isArray(v) ? v.map(clone) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))) : v;
    function transaction(st, mode) {
        const snapshot = new Map(st.rows);
        const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
        let pending = 0, done = false, bytes = 0;
        const settle = () => later(() => {
            if (done || pending) { return; }
            done = true;
            if (opts.quotaBytes !== undefined && bytes > opts.quotaBytes) {
                st.rows = snapshot;
                tx.error = { name: 'QuotaExceededError', message: 'The quota has been exceeded.' };
                if (tx.onabort) { tx.onabort(); }
                return;
            }
            if (tx.oncomplete) { tx.oncomplete(); }
        });
        const req = (fn) => {
            if (done) { const e = new Error('The transaction has finished.'); e.name = 'TransactionInactiveError'; throw e; }
            const r = { result: undefined, error: null, onsuccess: null, onerror: null };
            pending += 1;
            later(() => { r.result = fn(); pending -= 1; if (r.onsuccess) { r.onsuccess(); } settle(); });
            return r;
        };
        const store = {
            get: (k) => req(() => clone(st.rows.get(k))),
            getAll: () => req(() => Array.from(st.rows.values()).map(clone)),
            put: (v) => { if (mode !== 'readwrite') { throw new Error('ReadOnlyError'); } return req(() => { bytes += sizeOf(v); st.rows.set(v[st.keyPath], clone(v)); return v[st.keyPath]; }); },
            delete: (k) => { if (mode !== 'readwrite') { throw new Error('ReadOnlyError'); } return req(() => { st.rows.delete(k); return undefined; }); }
        };
        tx.objectStore = () => store;
        tx.abort = () => { if (done) { return; } done = true; st.rows = snapshot; later(() => { if (tx.onabort) { tx.onabort(); } }); };
        settle();
        return tx;
    }
    return {
        _rows: (name, store) => dbs[name].stores[store].rows,
        open(name, version) {
            const r = { result: null, error: null };
            later(() => {
                const d = dbs[name] || (dbs[name] = { version: 0, stores: {} });
                r.result = {
                    objectStoreNames: { contains: (n) => n in d.stores },
                    createObjectStore: (n, o) => { d.stores[n] = { keyPath: o.keyPath, rows: new Map() }; },
                    transaction: (n, mode) => transaction(d.stores[n], mode)
                };
                if (d.version < version) { d.version = version; if (r.onupgradeneeded) { r.onupgradeneeded(); } }
                if (r.onsuccess) { r.onsuccess(); }
            });
            return r;
        }
    };
}

// ── the human's Record, as the recorder assembles it ──────────────────────────────────────────
const bytes = (s) => new TextEncoder().encode(s);
const BEFORE = { wire: ['Wall', { rect: [200, 150, 16, 100], collisionBehavior: 'block' }] };
const AFTER = { wire: ['Wall', { rect: [240, 150, 16, 100], collisionBehavior: 'block' }] };
const SKETCH = "import { Wall } from '@descix/frqtl-web/parts';\n\nexport const parts = {\n  wire: [Wall, { rect: [240, 150, 16, 100], collisionBehavior: 'block' }],\n};\n\nexport default function buildExperiment(exp) {\n  exp.createCanvas(760, 520, {});\n  exp.declare(parts);\n}\n";
const PROJECT = { 'frqtl.json': serializeManifest(manifestFor({ name: 'circuit-sat', entry: 'sketch.js' })), 'sketch.js': SKETCH };
const MOVE = { tick: 40, name: 'wire', op: 'move', by: 'human', from: { rect: [200, 150, 16, 100] }, to: { rect: [240, 150, 16, 100] } };
const WORDS = 'this wire feeds the bulb';
const SCENE = { label: 'Circuit satisfiability', id: 'circuit-sat', mode: null, renderer: 'p5' };

function chain(over) {
    over = over || {};
    const folder = serializeRecordFolder({ changes: [MOVE], clips: [{ bytes: bytes('mp4-' + (over.first || 10)), firstTick: over.first || 10, lastTick: (over.first || 10) + 495 }], partsBefore: BEFORE, partsAfter: AFTER, project: PROJECT });
    return recordsOf([{ folder, filmed: [SEGMENT_HAND], start: BEFORE, scene: over.scene || SCENE }], over.asked || null, [], over.teaching === undefined ? WORDS : over.teaching);
}
const store = (opts) => { const idb = fakeIndexedDB(opts); let t = 0; return { idb, m: memory.openMemories({ indexedDB: idb, now: () => new Date(Date.UTC(2026, 9, 19, 12, 0, t++)).toISOString() }) }; };
const rows = (idb) => idb._rows(memory.DB_NAME, memory.STORE);

/** Load a planted copy of the owner (its imports pinned to this checkout): the module, and dispose(). */
async function plantedOwner(src) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-memory-plant-'));
    const pinned = src.replace(/from '\.\/([a-z-]+)\.js'/g, (m, f) => "from '" + pathToFileURL(path.join(REPO, 'site/app-assets', f + '.js')).href + "'");
    fs.writeFileSync(path.join(dir, 'maxi-local-memory.js'), pinned);
    const m = await import(pathToFileURL(path.join(dir, 'maxi-local-memory.js')).href);
    return { m, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
function plant(src, from, to) { assert.ok(src.includes(from), 'the plant applies: ' + from.slice(0, 60)); return src.replace(from, to); }

// ── 1. the key ────────────────────────────────────────────────────────────────────────────────
test('the key rule: the hand-back Record\'s scene id (#mode) @ its tickRange; another key for the same Records is refused by name', async () => {
    assert.equal(memory.memoryKey(chain()), 'circuit-sat@10-505');
    assert.equal(memory.memoryKey(chain({ scene: Object.assign({}, SCENE, { id: 'dse-tunnel-rebuild', mode: '3d' }) })), 'dse-tunnel-rebuild#3d@10-505');
    assert.equal(memory.memoryKey(chain({ scene: { label: 'sketch (Maxi)', id: null, mode: null, renderer: 'p5' } })), memory.SKETCH_SCENE + '@10-505');
    assert.notEqual(memory.memoryKey(chain({ first: 600 })), memory.memoryKey(chain()), 'another Record in the same scene at other ticks is another memory');
    const { idb, m } = store();
    const k = await m.save(chain());
    assert.deepEqual(k, { key: 'circuit-sat@10-505', savedAt: '2026-10-19T12:00:00.000Z', replaced: false });
    const raw = rows(idb).get(k.key);
    rows(idb).set('circuit-sat@0-1', Object.assign({}, raw, { key: 'circuit-sat@0-1' }));   // the same Records under a key the rule does not give
    const listed = (await m.list()).find((x) => x.key === 'circuit-sat@0-1');
    assert.match(listed.faults.join(), /the entry is kept as "circuit-sat@0-1", and its Records key as "circuit-sat@10-505"/);
    await assert.rejects(m.load('circuit-sat@0-1'), /^Error: \[local-memory\] the memory "circuit-sat@0-1" is refused — it is not a complete Record:\n- the entry is kept as/);
    // plant: the key check removed from the owner → the mis-keyed entry loads (RED under the check above)
    const p = await plantedOwner(plant(read(OWNER), 'if (want !== null && want !== key) {', 'if (false) {'));
    try {
        const planted = p.m.openMemories({ indexedDB: idb });
        await assert.doesNotReject(planted.load('circuit-sat@0-1'), 'planted: the mis-keyed entry is no longer refused');
    } finally { p.dispose(); }
});

// ── 2. the entry is the Record folder ─────────────────────────────────────────────────────────
test('the entry IS the Record folder: exactly its files, the clips as Blobs, read back byte for byte and passing the Record owner\'s gate', async () => {
    const recs = chain();
    const e = memory.entryOf(recs, '2026-10-19T12:00:00.000Z');
    assert.deepEqual(Object.keys(e).sort(), [...memory.ENTRY_KEYS].sort());
    assert.deepEqual(e.records.map((r) => Object.keys(r.files).sort()), recs.map((r) => Object.keys(r.files).sort()), 'the entry carries exactly the folder\'s files');
    assert.deepEqual(Object.keys(e.records[0].files).sort(), ['clip-01.mp4', FILES.lab, FILES.partsAfter, FILES.partsBefore, 'project/frqtl.json', 'project/sketch.js', FILES.record].sort());
    assert.ok(e.records[0].files['clip-01.mp4'] instanceof Blob && e.records[0].files['clip-01.mp4'].type === 'video/mp4', 'the clip is kept as a video/mp4 Blob');
    const { m } = store();
    await m.save(recs);
    const back = await m.load('circuit-sat@10-505');
    assert.equal(back.records.length, 1);
    for (const f of Object.keys(recs[0].files)) {
        const a = recs[0].files[f], b = back.records[0].files[f];
        assert.ok(typeof a === 'string' ? a === b : Buffer.from(a).equals(Buffer.from(b)), f + ' reads back as it was kept');
    }
    assert.deepEqual(recordFolderFaults(back.records[0].files), [], 'the entry as read back is a complete Record');
    const list = await m.list();
    assert.deepEqual(list.map((x) => [x.key, x.scene.id, x.teaching, x.changes, x.faults]), [['circuit-sat@10-505', 'circuit-sat', WORDS, 1, []]], 'the pane reads the scene and words off lab.json');
    // nothing incomplete is kept: a Record the gate refuses is never saved
    const broken = chain(); delete broken[0].files[FILES.partsAfter];
    await assert.rejects(m.save(broken), /this demonstration is not complete Records, so it is not kept:\n- record-01: the folder has no parts\.after\.json/);
    const loop = chain(); loop[0].files[FILES.lab] = loop[0].files[FILES.lab].replace('"producer": "record"', '"producer": "loop"');
    assert.notEqual(loop[0].files[FILES.lab], chain()[0].files[FILES.lab], 'the producer plant applied');
    assert.throws(() => memory.entryOf(loop, '2026-10-19T12:00:00.000Z'), /a local memory holds the human's Record \(record\) only/);
    const prompt = chain(); prompt[0].files[FILES.lab] = JSON.stringify(Object.assign(JSON.parse(prompt[0].files[FILES.lab]), { [TEACHING_KEY]: TEACHING_PROMPT }));
    assert.throws(() => memory.entryOf(prompt, '2026-10-19T12:00:00.000Z'), /record-01: lab\.json teaching is the card's prompt/, 'the host half of the Record gate holds');
    // plant: the owner's gate without the Record owner's recordFolderFaults → a lab.json the Record owner refuses is kept (RED)
    const p = await plantedOwner(plant(read(OWNER), 'recordFolderFaults(r.files).forEach(function (f) { bad.push(name + \': \' + f); });', ''));
    try { assert.doesNotThrow(() => p.m.entryOf(prompt, '2026-10-19T12:00:00.000Z'), 'planted: a folder the Record owner refuses is kept'); } finally { p.dispose(); }
});

// ── 3. one writer, by reference ───────────────────────────────────────────────────────────────
/** The one page module that holds the store (maxi-lab.js) and the store calls it may make, each one `state.memories.<door>(`. */
const STORE_CALLER = 'site/app-assets/maxi-lab.js';
const STORE_DOORS = ['save', 'list', 'load', 'remove'];
/** The owner module named in code: a string literal holding its name (an import, a dynamic import, a script src, a URL). */
const MODULE_LITERAL = /(['"`])[^'"`\n]*maxi-local-memory[^'"`\n]*\1/;
/** A dynamic import, however its specifier is built (a literal, a template, a concatenation, a variable). */
const DYNAMIC_IMPORT = /(^|[^.\w$])import\s*\(/gm;
/** The one dynamic import in the published page and body files, by file and exact text: the body's registry import. */
const DYNAMIC_IMPORTS_ALLOWED = { 'minimaxi/body.mjs': "await import(distUrl(exportFile('./registry')))" };

/**
 * The store's second writers in published page and body files, by REFERENCE, over these spellings: any file but the owner
 * and STORE_CALLER that names the owner module in a string (an import, a script src, a URL) or IndexedDB or the database;
 * any dynamic import( but DYNAMIC_IMPORTS_ALLOWED's one (so a specifier built by template or concatenation is red too);
 * a global read by a computed name (`self|window|globalThis` then `[` or `?.[`), any `Reflect.`, and a name bound to
 * self|window|globalThis (an alias that a computed read could follow). In STORE_CALLER: ONE import of the owner, ONE
 * openMemories() (the state's store), no `state[` or `state?.`, and every other reference to the store a
 * `state.memories.<door>(` call, with one `state.memories.save(` (keepRecords). A global handed to a function as an
 * argument and indexed by a computed key inside it is a spelling this does not read.
 */
export function writerFaults(sources) {
    const faults = [];
    for (const [f, src] of Object.entries(sources)) {
        if (f === OWNER) { continue; }
        if (f !== STORE_CALLER && MODULE_LITERAL.test(src)) { faults.push(f + ' names the store module maxi-local-memory.js — only ' + STORE_CALLER + ' holds the store'); }
        if (/indexeddb|idbfactory|idbdatabase|idbobjectstore/i.test(src)) { faults.push(f + ' names IndexedDB: only ' + OWNER + ' keeps local memories'); }
        if (src.includes(memory.DB_NAME)) { faults.push(f + ' names the memories database ' + JSON.stringify(memory.DB_NAME)); }
        if (/(^|[^.\w$])(self|window|globalThis)\s*(\?\.\s*)?\[/m.test(src)) { faults.push(f + ' reads a global by a computed name (self|window|globalThis[…] or ?.[…]) — a reference no gate can read'); }
        if (/(^|[^.\w$])Reflect\s*(\?\.|\.)/m.test(src)) { faults.push(f + ' uses Reflect — a computed property read no gate can read'); }
        if (/(^|[^.\w$])[\w$]+\s*=\s*(self|window|globalThis)\s*($|[;,)}])/m.test(src)) { faults.push(f + ' binds a name to self|window|globalThis — an alias a computed read could follow'); }
        const dyn = (src.match(DYNAMIC_IMPORT) || []).length;
        const allowed = DYNAMIC_IMPORTS_ALLOWED[f];
        if (dyn !== (allowed ? 1 : 0) || (allowed && !src.includes(allowed))) { faults.push(f + ' has ' + dyn + ' dynamic import( — the only one in site/ and minimaxi/ is minimaxi/body.mjs\'s ' + DYNAMIC_IMPORTS_ALLOWED['minimaxi/body.mjs']); }
    }
    for (const f of Object.keys(DYNAMIC_IMPORTS_ALLOWED)) { if (!(f in sources)) { faults.push('the allowed dynamic import\'s file ' + f + ' is not in the walk'); } }
    const lab = sources[STORE_CALLER] || '';
    const imports = lab.match(new RegExp(MODULE_LITERAL.source, 'g')) || [];
    if (imports.length !== 1) { faults.push(STORE_CALLER + ' names maxi-local-memory ' + imports.length + ' times — ONE import'); }
    const opens = lab.match(/\bopenMemories\b/g) || [];
    if (opens.length !== 2 || !/\n {4}memories: openMemories\(\),/.test(lab)) { faults.push(STORE_CALLER + ' uses openMemories other than the import and the state\'s one store (' + opens.length + ' mentions)'); }
    lab.replace(/\bstate\.memories\b(.{0,12})/g, (m, after) => {
        const door = /^\.([A-Za-z]+)\(/.exec(after);
        if (!door || STORE_DOORS.indexOf(door[1]) === -1) { faults.push(STORE_CALLER + ': "' + m.trim() + '" is not a state.memories.<' + STORE_DOORS.join('|') + '>( call'); }
        return m;
    });
    if (/[^.\w]memories\s*(\[|\.\s*(save|list|load|remove)\b)/.test(lab.replace(/\bstate\.memories\b/g, 'STATE_MEMORIES').replace(/\bMaxiLab\b[\s\S]*$/, ''))) { faults.push(STORE_CALLER + ' reaches the store through another name than state.memories'); }
    if (/=\s*state\.memories\s*[;,)]/.test(lab)) { faults.push(STORE_CALLER + ' aliases the store'); }
    if (/\bstate\s*(\?\.\s*)?\[/.test(lab)) { faults.push(STORE_CALLER + ' reads state by a computed name (state[…]) — the store is reached as state.memories only'); }
    if (/\bstate\s*\?\./.test(lab)) { faults.push(STORE_CALLER + ' reads state through ?. — the store is reached as state.memories only'); }
    const saves = lab.match(/\bstate\.memories\.save\(/g) || [];
    if (saves.length !== 1) { faults.push(STORE_CALLER + ' keeps memories through ' + saves.length + ' calls of state.memories.save( — ONE (keepRecords) is the lab\'s writer'); }
    return faults;
}
function siteSources() {
    const out = {};
    for (const f of publishedFiles(REPO).filter((x) => /^(site|minimaxi)\//.test(x) && !/^site\/vendor\//.test(x) && /\.(m?js|html)$/.test(x))) { out[f] = read(f); }
    return out;
}

test('the owner is the only writer of local memories, by reference: one importer holds the store and calls only its doors; a second writer in any spelling is red', () => {
    const src = siteSources();
    assert.ok(src[OWNER] && src[STORE_CALLER] && src['site/app.html'] && src['site/app-assets/maxi-record.js'], 'the walk covers the owner, the lab, the recorder and the page');
    assert.deepEqual(writerFaults(src), []);
    const add = (f, text) => Object.assign({}, src, { [f]: src[f] + text });
    for (const [label, planted, re] of [
        ['the verifier\'s: a second importer writing through the owner', add('site/app-assets/maxi-record.js', "\nimport { openMemories as __om } from './maxi-local-memory.js';\n__om().save(x);\n"), /maxi-record\.js names the store module/],
        ['the verifier\'s: a bracket save in the lab', add(STORE_CALLER, '\nfunction alsoKeep(r) { return state.memories[\'save\'](r); }\n'), /"state\.memories\['save'\][^"]*" is not a state\.memories\.<save\|list\|load\|remove>\( call/],
        ['the verifier\'s: a concatenated global', add(STORE_CALLER, "\nconst db = self['index' + 'edDB'];\n"), /reads a global by a computed name/],
        ['a dynamic import elsewhere', add('site/app-assets/maxi-hands.js', "\nimport('./maxi-local-memory.js').then((m) => m.openMemories());\n"), /maxi-hands\.js names the store module/],
        ['a second store in the lab', add(STORE_CALLER, '\nconst mine = openMemories();\n'), /uses openMemories other than the import/],
        ['an alias of the store', add(STORE_CALLER, '\nconst s = state.memories;\n'), /is not a state\.memories|aliases the store/],
        ['a second save', add(STORE_CALLER, '\nfunction alsoKeep(r) { return state.memories.save(r); }\n'), /2 calls of state\.memories\.save\(/],
        ['window.indexedDB', add(STORE_CALLER, "\nwindow.indexedDB.open('x', 1);\n"), /maxi-lab\.js names IndexedDB/],
        ['the database by name', add('site/app-assets/maxi-record.js', "\nconst n = '" + memory.DB_NAME + "';\n"), /names the memories database/],
        ['a page script', Object.assign({}, src, { 'site/app.html': src['site/app.html'].replace('</body>', '<script>indexedDB.deleteDatabase("x")</script></body>') }), /site\/app\.html names IndexedDB/],
        ['the verifier\'s r2: a template-literal dynamic import', add('site/app-assets/maxi-hands.js', "\nimport(`./maxi-local-${'memory'}.js`).then((m) => m.openMemories().save(x));\n"), /maxi-hands\.js has 1 dynamic import\(/],
        ['the verifier\'s r2: a concatenated dynamic import', add('site/app-assets/maxi-hands.js', "\nimport('./maxi-local-' + 'memory.js').then((m) => m.openMemories().save(x));\n"), /maxi-hands\.js has 1 dynamic import\(/],
        ['the verifier\'s r2: an alias of globalThis, then a computed read', add(STORE_CALLER, "\nconst g = globalThis; const db = g['indexed'+'DB'];\n"), /maxi-lab\.js binds a name to self\|window\|globalThis/],
        ['the verifier\'s r2: Reflect.get(globalThis, …)', add(STORE_CALLER, "\nconst db = Reflect.get(globalThis, 'indexed' + 'DB');\n"), /maxi-lab\.js uses Reflect/],
        ['the verifier\'s r2: window?.[…]', add(STORE_CALLER, "\nconst db = window?.['indexed'+'DB'];\n"), /maxi-lab\.js reads a global by a computed name/],
        ['the verifier\'s r2: a second save through state[\'memories\']', add(STORE_CALLER, "\nfunction alsoKeep(r) { return state['memories'].save(r); }\n"), /maxi-lab\.js reads state by a computed name/],
        ['a second dynamic import in the body', add('minimaxi/body.mjs', "\nconst x = await import('./hand.mjs');\n"), /minimaxi\/body\.mjs has 2 dynamic import\(/],
        ['the body\'s registry import respelled', Object.assign({}, src, { 'minimaxi/body.mjs': src['minimaxi/body.mjs'].replace("await import(distUrl(exportFile('./registry')))", "await import(distUrl(exportFile('./registr' + 'y')))") }), /minimaxi\/body\.mjs has 1 dynamic import\(/],
        ['state?.memories', add(STORE_CALLER, "\nfunction alsoKeep(r) { return state?.memories.save(r); }\n"), /maxi-lab\.js reads state through \?\./]
    ]) {
        assert.match(writerFaults(planted).join('\n'), re, label + ' is RED');
    }
});

// ── 4. a corrupt entry ────────────────────────────────────────────────────────────────────────
test('a corrupt entry is listed with its faults and refused by name at load; nothing repairs it', async () => {
    const { idb, m } = store();
    await m.save(chain());
    const good = rows(idb).get('circuit-sat@10-505');
    const withFile = (f, v) => ({ key: good.key, savedAt: good.savedAt, records: [{ name: 'record-01', files: Object.assign({}, good.records[0].files, { [f]: v }) }] });
    const lab = JSON.parse(good.records[0].files[FILES.lab]);
    const plants = {
        'lab.json teaching is the card prompt': [withFile(FILES.lab, JSON.stringify(Object.assign({}, lab, { [TEACHING_KEY]: TEACHING_PROMPT }))), /record-01: lab\.json teaching is the card's prompt/],
        'a clip kept as text/plain': [withFile('clip-01.mp4', new Blob(['x'], { type: 'text/plain' })), /record-01\/clip-01\.mp4 is a "text\/plain" Blob, not a video\/mp4 Blob/],
        'record.json gone': [(() => { const e = withFile('x', 'y'); delete e.records[0].files.x; delete e.records[0].files[FILES.record]; return e; })(), /record-01: the folder has no record\.json/],
        'parts.after.json not JSON': [withFile(FILES.partsAfter, '{"wire": ['), /parts\.after\.json/],
        'an extra entry key': [Object.assign({}, good, { owner: 'someone' }), /the entry carries \{key, savedAt, records, owner\}, not exactly \{key, savedAt, records\}/],
        'no records': [{ key: good.key, savedAt: good.savedAt, records: [] }, /records is \[\], not a non-empty chain of Records/]
    };
    for (const [label, [entry, re]] of Object.entries(plants)) {
        rows(idb).set(entry.key, entry);
        const listed = (await m.list()).find((x) => x.key === entry.key);
        assert.ok(listed.faults.length && re.test(listed.faults.join('\n')), label + ': listed with its fault by name, got ' + JSON.stringify(listed.faults));
        assert.equal(listed.scene, null, label + ': a refused entry shows no facts');
        await assert.rejects(m.load(entry.key), (err) => re.test(err.message) && /is refused — it is not a complete Record/.test(err.message), label + ': load refuses it by name');
    }
    assert.deepEqual(rows(idb).get(good.key).records, [], 'the last plant is still there: nothing was repaired');
    // plant: load that does not refuse a faulted entry → the corrupt entry opens (RED)
    const p = await plantedOwner(plant(read(OWNER), 'if (e.faults.length) { throw new Error(\'[local-memory] the memory \'', 'if (false) { throw new Error(\'[local-memory] the memory \''));
    try { await assert.doesNotReject(p.m.openMemories({ indexedDB: idb }).load(good.key), 'planted: a corrupt entry opens'); } finally { p.dispose(); }
});

// ── 5. the browser refuses ────────────────────────────────────────────────────────────────────
test('a full browser store (QuotaExceededError) is refused by name and keeps nothing; no IndexedDB at all is refused by name', async () => {
    const { idb, m } = store({ quotaBytes: 100 });
    await assert.rejects(m.save(chain()), /^Error: \[local-memory\] save: this browser refused \(QuotaExceededError: The quota has been exceeded\.\) — its storage for this site is full; delete a memory in Your memories to make room\. Nothing was saved\.$/);
    assert.equal(rows(idb).size, 0, 'nothing was kept');
    assert.deepEqual(await m.list(), []);
    await assert.rejects(memory.openMemories({ indexedDB: null }).list(), /this browser offers no IndexedDB to the lab, so no local memory can be kept or read here/);
    // plant: an aborted transaction resolved as done → save claims a memory that was not kept (RED)
    const p = await plantedOwner(plant(read(OWNER), "tx.onabort = function () { reject(failed || storeError(op, tx.error || new Error('the transaction was aborted'))); };", 'tx.onabort = function () { resolve(value); };'));
    try {
        const q = fakeIndexedDB({ quotaBytes: 100 });
        await assert.doesNotReject(p.m.openMemories({ indexedDB: q }).save(chain()), 'planted: the refusal is dropped');
        assert.equal(q._rows(memory.DB_NAME, memory.STORE).size, 0, 'and nothing was kept, silently');
    } finally { p.dispose(); }
});

// ── 6. kept again ─────────────────────────────────────────────────────────────────────────────
test('the same Record kept again (now with Maxi\'s answer) replaces itself and keeps its first date; another Record under the same key is refused by name', async () => {
    const { idb, m } = store();
    const first = await m.save(chain({ teaching: undefined }));
    const asked = { interaction_id: 'i-1', answer_excerpt: 'The wire closes the loop to the bulb.' };
    const again = await m.save(chain({ asked }));
    assert.deepEqual([again.key, again.savedAt, again.replaced], [first.key, first.savedAt, true]);
    const [s] = await m.list();
    assert.deepEqual([s.teaching, s.answered], [WORDS, asked.answer_excerpt], 'the words and Maxi\'s answer are the hand-back lab.json\'s');
    const other = chain(); other[0].files[FILES.record] = other[0].files[FILES.record].replace('"tick": 40', '"tick": 41');
    assert.notEqual(other[0].files[FILES.record], chain()[0].files[FILES.record], 'the plant applied');
    await assert.rejects(m.save(other), /save: another demonstration is already kept as "circuit-sat@10-505" \(the same scene and ticks\): record-01\/record\.json differs — delete it in Your memories, then save again\. Nothing was saved\./);
    const clipB = chain(); clipB[0].files['clip-01.mp4'] = bytes('mp4-B-different');   // the same record.json, another clip
    await assert.rejects(m.save(clipB), /already kept as "circuit-sat@10-505" \(the same scene and ticks\): record-01\/clip-01\.mp4 differs/);
    assert.equal(Buffer.from((await m.load(first.key)).records[0].files['clip-01.mp4']).toString(), 'mp4-10', 'the kept clip is untouched');
    assert.equal(rows(idb).size, 1);
    // plant: identity by record.json alone → the other clip silently replaces the kept one (RED)
    const p = await plantedOwner(plant(read(OWNER), "else if (!sameBytes(r.files[f], n.files[f])) { bad.push(r.name + '/' + f + ' differs'); }", "else if (f === FILES.record && !sameBytes(r.files[f], n.files[f])) { bad.push(r.name + '/' + f + ' differs'); }"));
    try { await assert.doesNotReject(p.m.openMemories({ indexedDB: idb }).save(clipB), 'planted: a different clip replaces the kept one'); } finally { p.dispose(); }
    assert.deepEqual(await m.remove(first.key), { removed: first.key, existed: true });
    assert.deepEqual(await m.list(), []);
    await assert.rejects(m.load(first.key), /no local memory is kept as "circuit-sat@10-505" in this browser/);
});

// ── 7. Discuss ────────────────────────────────────────────────────────────────────────────────
test('Discuss: the memory\'s facts, the words and the visitor\'s question ride the one composition; the lab asks through lab.ask only (a second prompt builder is red)', async () => {
    const { m } = store();
    await m.save(chain({ asked: { interaction_id: 'i-1', answer_excerpt: 'The wire closes the loop.' } }));
    const mem = await m.load('circuit-sat@10-505');
    const note = memory.memoryNote(mem);
    assert.ok(note.startsWith(memory.LOCAL_MEMORY_HEAD + ' Kept on 2026-10-19T12:00:00.000Z.\nThe human pressed Record'), 'the note opens with what a local memory is');
    assert.ok(note.includes(changeText(MOVE)), 'the change row rides');
    assert.ok(note.includes('wire: Wall {"rect":[200,150,16,100],"collisionBehavior":"block"} → Wall {"rect":[240,150,16,100],"collisionBehavior":"block"}'), 'the parts diff rides');
    assert.ok(note.endsWith('you answered (its first lines): The wire closes the loop.'), 'Maxi\'s answer then rides');
    assert.equal(memory.memoryTeaching(mem), WORDS);
    const media = memory.memoryMedia(mem);
    assert.deepEqual(media.map((x) => [x.mime_type, Buffer.from(x.data, 'base64').toString()]), [['video/mp4', 'mp4-10']], 'the kept clip is the footage');
    const Q = 'why does the bulb light when I close the loop?';
    const ui = footageUserInput(note, WORDS, Q);
    assert.equal(ui, note + '\n\n' + TEACHING_HEAD + '\n' + WORDS + '\n\n' + DISCUSS_HEAD + '\n' + Q + '\n\n' + DISCUSS_QUESTION);
    assert.ok(!ui.includes(LOOK_QUESTION), 'the visitor\'s question takes the place of the look');
    assert.equal(footageUserInput(note, undefined, Q), note + '\n\n' + DISCUSS_HEAD + '\n' + Q + '\n\n' + DISCUSS_QUESTION, 'no words: the question alone');
    assert.throws(() => footageUserInput(note, WORDS, '   '), /a question about a remembered demonstration carries the visitor's own words/);
    assert.equal(footageUserInput('n'), 'n\n\n' + LOOK_QUESTION, 'no question: the look, as before');
    // the page: discussMemory asks through lab.ask with the owner's facts; nothing else in the page spells the question's heads
    const lab = read('site/app-assets/maxi-lab.js');
    const faults = (src) => {
        const out = [];
        const fn = src.slice(src.indexOf('async function discussMemory('), src.indexOf('\n}\n', src.indexOf('async function discussMemory(')));
        if (!/await ask\(MEMORY_OP, \{ note: memoryNote\(m\), teaching: memoryTeaching\(m\), question: question\.trim\(\), media: memoryMedia\(m\) \}\)/.test(fn)) { out.push('discussMemory does not ask through lab.ask with the owner\'s facts'); }
        for (const [name, text] of [['DISCUSS_HEAD', DISCUSS_HEAD], ['DISCUSS_QUESTION', DISCUSS_QUESTION], ['TEACHING_HEAD', TEACHING_HEAD], ['LOCAL_MEMORY_HEAD', memory.LOCAL_MEMORY_HEAD]]) {
            if (src.includes(text.slice(0, 32))) { out.push('maxi-lab.js spells ' + name + ' — a second prompt builder'); }
        }
        if ((src.match(/footageUserInput\(/g) || []).length !== 1) { out.push('maxi-lab.js calls footageUserInput more than once'); }
        return out;
    };
    assert.deepEqual(faults(lab), []);
    assert.match(faults(lab + "\nconst q = 'The visitor asks about this remembered demonstration, in their own words:\\n' + x;\n").join(), /spells DISCUSS_HEAD/, 'a planted prompt builder is RED');
    assert.match(faults(lab.replace('await ask(MEMORY_OP, {', 'await window.DeSciX.call(\'ask_question_to_app\', {')).join(), /does not ask through lab\.ask/, 'a planted side door is RED');
    assert.match(faults(lab + '\nfootageUserInput(a, b, c);\n').join(), /more than once/, 'a second composition call is RED');
});

// ── 8. the chain gate on read-back ────────────────────────────────────────────────────────────
test('read-back runs recordChainFaults: a Record stored under another chain name is refused by name (the chain arm removed is red)', async () => {
    const { idb, m } = store();
    await m.save(chain());
    const good = rows(idb).get('circuit-sat@10-505');
    rows(idb).set(good.key, { key: good.key, savedAt: good.savedAt, records: [{ name: 'record-02', files: good.records[0].files }] });
    await assert.rejects(m.load(good.key), /folder 1 is "record-02", not record-01/);
    const p = await plantedOwner(plant(read(OWNER), 'if (!bad.length) { recordChainFaults(records).forEach(function (f) { bad.push(f); }); }', ''));
    try { await assert.doesNotReject(p.m.openMemories({ indexedDB: idb }).load(good.key), 'planted: the misnamed chain loads'); } finally { p.dispose(); }
});

// ── the page's own functions, run over stand-ins ──────────────────────────────────────────────
const LAB_SRC = read(STORE_CALLER);
/** A function of maxi-lab.js by its own source (from its `function name(` line to its closing brace), bound to `deps`. */
function pageFn(src, name, deps) {
    const at = src.search(new RegExp('\\n(async )?function ' + name + '\\('));
    assert.ok(at !== -1, 'maxi-lab.js has ' + name + '()');
    const body = src.slice(at, src.indexOf('\n}\n', at) + 3);
    return new Function(...Object.keys(deps), body + '\nreturn ' + name + ';')(...Object.values(deps));
}
async function reloadHarness(over) {
    const { m } = store();
    await m.save(chain());
    const mounted = [], painted = [];
    const deps = Object.assign({
        state: { recorder: { recording: false, state: () => ({ waiting: false }) }, memories: m, scene: {} },
        guardBusy: () => {}, parseRecordFolder: folder.parseRecordFolder, projectEntryOf: folder.projectEntryOf, FILES, CARRIED_KEY: folder.CARRIED_KEY,
        TEACHING_KEY, partsEqual: folder.partsEqual, changesAsText: folder.changesAsText, base64OfBytes: folder.base64OfBytes,
        walkthroughById: (id) => ({ id, title: 'Circuit SAT' }), WALKTHROUGH: [], projectOf: async () => ({ renderState: {} }), walkthroughModes: () => [], scenePath: () => 'scenes/circuit-sat.js',
        el: { demo: { hidden: true }, demoClip: { play: () => Promise.resolve() } }, mountScene: async (spec) => { mounted.push(spec); },
        HANDS: { inventory: { run: async () => ({ parts: (over && over.parts) || AFTER }) } }, lab: {}, paintCard: (c, d) => painted.push(d), demoCard: {},
        showError: () => {}, clearError: () => {}, memoriesSay: () => {}, talkLine: () => {}, summary: () => ({}), memoriesFailed: (err) => { throw err; }
    }, (over && over.deps) || {});
    if (over && over.recorder) { Object.assign(deps.state.recorder, over.recorder); }
    return { deps, mounted, painted };
}

test('Reload over the page\'s own reloadMemory: refused by name while Record is on and while a demonstration waits; refused when the scene does not hold parts.after (each check removed is red)', async () => {
    const run = (src, h) => pageFn(src, 'reloadMemory', h.deps)('circuit-sat@10-505');
    let h = await reloadHarness();
    const ok = await run(LAB_SRC, h);
    assert.equal(ok.key, 'circuit-sat@10-505');
    assert.deepEqual([h.mounted.length, h.mounted[0].files['sketch.js'] === SKETCH, h.painted.length], [1, true, 1], 'the green control: mounted from project/, card painted');
    const cases = [
        ['while a demonstration waits', { recorder: { state: () => ({ waiting: true }) } }, /a demonstration waits on the card — Send it to Maxi or close the card \(×\) first; Reload would cover it\. Nothing was reloaded\./,
            "        if (state.recorder && state.recorder.state().waiting) { throw new Error('memories: a demonstration waits on the card"],
        ['while Record is on', { recorder: { recording: true } }, /Record is on — stop it first; the memory's scene would become a second Record inside the running demonstration\. Nothing was reloaded\./,
            "        if (state.recorder && state.recorder.recording) { throw new Error('memories: Record is on"],
        ['a scene not at parts.after', { parts: BEFORE }, /circuit-sat@10-505 reloaded, but the scene holds parts .* not the memory's parts\.after\.json/,
            "        if (!partsEqual(now.parts, p.partsAfter)) {"]
    ];
    for (const [label, over, re, line] of cases) {
        h = await reloadHarness(over);
        await assert.rejects(run(LAB_SRC, h), re, label + ': refused by name');
        if (label !== 'a scene not at parts.after') { assert.equal(h.mounted.length, 0, label + ': nothing was mounted'); }
        assert.equal(h.painted.length, 0, label + ': no card painted');
        assert.ok(LAB_SRC.includes(line), label + ': the plant applies');
        const planted = LAB_SRC.replace(line, line.replace(/if \(/, 'if (false && '));
        h = await reloadHarness(over);
        await assert.doesNotReject(run(planted, h), label + ': with the check removed it goes through (RED)');
    }
});

test('the card\'s × removes the memory its completion kept, and only after that keep succeeded; the lab keeps on completion (each removed is red)', async () => {
    const recs = chain();
    const harness = (keeping, discarded) => {
        const removed = [];
        const deps = {
            state: { recorder: { last: () => recs, dismiss: () => ({ discarded }) }, completed: keeping, memories: { remove: async (k) => { removed.push(k); return { removed: k }; } } },
            el: { demo: { hidden: false } }, clearError: () => {}, renderStatus: () => {}, talkLine: () => {}, showError: () => {},
            memoryKey: memory.memoryKey, renderMemories: async () => [], memoriesFailed: (err) => { throw err; }
        };
        return { deps, removed };
    };
    let h = harness(Promise.resolve({ key: 'circuit-sat@10-505' }), true);
    assert.deepEqual(await pageFn(LAB_SRC, 'closeDemonstration', h.deps)(), { discarded: true, removed: 'circuit-sat@10-505' });
    assert.deepEqual(h.removed, ['circuit-sat@10-505'], '× removes the just-kept memory');
    h = harness(Promise.reject(new Error('another demonstration is already kept')), true);
    assert.deepEqual(await pageFn(LAB_SRC, 'closeDemonstration', h.deps)(), { discarded: true, removed: null });
    assert.deepEqual(h.removed, [], 'a refused keep stored nothing: the other memory under that key stays');
    h = harness(Promise.resolve({ key: 'circuit-sat@10-505' }), false);
    await pageFn(LAB_SRC, 'closeDemonstration', h.deps)();
    assert.deepEqual(h.removed, [], 'closing a sent card removes nothing');
    const line = "            return state.memories.remove(k.key).then(function (r) {";
    assert.ok(LAB_SRC.includes(line), 'the plant applies');
    h = harness(Promise.resolve({ key: 'circuit-sat@10-505' }), true);
    await pageFn(LAB_SRC.replace(line, "            return Promise.resolve({ removed: null }).then(function (r) {"), 'closeDemonstration', h.deps)();
    assert.deepEqual(h.removed, [], 'planted: × no longer removes it (RED under the first check)');
    // the moment: the recorder's onComplete is the lab's keepCompleted, the one keep of a completed demonstration
    const wired = (src) => /attachRecorder\(\{[\s\S]*?onComplete: keepCompleted,[\s\S]*?\}\);/.test(src) && /function keepCompleted\(records\) \{\n {4}state\.completed = keepRecords\(records\);/.test(src);
    assert.ok(wired(LAB_SRC), 'the lab keeps a demonstration when it completes');
    assert.ok(!wired(LAB_SRC.replace('        onComplete: keepCompleted,\n', '')), 'planted: no keep on completion (RED)');
});
