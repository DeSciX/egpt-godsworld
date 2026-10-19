/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * record-folder.test.mjs — the lab's HOST HALF of a Record folder (site/app-assets/maxi-record-folder.js): lab.json and the
 * stills beside the package's closed Record (@descix/frqtl-web ./project; its one writer serializeRecordFolder, reached here
 * from the vendored dist to make the fixtures the package itself would write), and the one gate, theirs ∪ ours.
 *
 * Gates:
 *   1. no producer writes a placeholder: the Record owner exports no placeholder constructor and no lab or MiniMaxi
 *      source builds an {unavailable} value (a planted one is red);
 *   2. THE UNION GATE: a complete folder passes; every planted fault is refused BY NAME, by the half that owns it — the
 *      package's (rows out of tick order, a 2D centre, a 5-number rect, setDeclared key sets, no frqtl.json, …) and the
 *      lab's (a placeholder under project/, the entry not a sketch module, lab.json, 9 clips, two stills, …); each half is
 *      green on the other's plants, so neither holds a copy of the other's checks;
 *   3. assembleRecord adds lab.json (the hand of every clip, the package's spans) and refuses what it cannot state;
 *      folderHere brings a folder from another realm (the scene document) or from the page (text/base64) into this one;
 *   4. the folder round-trips through the package's node writer byte for byte and is never overwritten;
 *   5. a loop approve's Records are the lab's closed Records, checked against the loop's own view of the same worlds;
 *   6. the human's teaching words (TEACHING_KEY): in the hand-back lab.json only, verbatim, absent when empty; an empty,
 *      untrimmed, prompt-text, JSON or non-string value is refused by name (the check and the hand-back rule planted out are red).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    assembleRecord, assembleLoopRecords, recordChainFaults, recordDirName, recordFolderFaults, hostFolderFaults, assertCompleteRecord, unavailableFields,
    folderHere, base64OfBytes, MAX_SEGMENTS, FILES, STILLS
} from '../../site/app-assets/maxi-record-folder.js';
import * as recordFolder from '../../site/app-assets/maxi-record-folder.js';
import { recordFolderFaults as packageFolderFaults, manifestFor, serializeManifest } from '../../site/app-assets/frqtl-web-project.js';
import { writeRecordFolder, readRecordFolder } from '../../minimaxi/record-folder.mjs';
import { recordsOf } from '../../site/app-assets/maxi-record.js';
import { distUrl } from '../frqtl-web-pin.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The package's one writer of a Record folder (internal to ./project; the Record calls it at stop): the fixtures are its output. */
const { serializeRecordFolder } = await import(distUrl('shim/project/record-format.js'));

/** Lab and MiniMaxi sources that build a placeholder value (an {unavailable: …} literal or a constructor call). */
export function placeholderWriters(sources) {
    return Object.keys(sources).filter((f) => /\{\s*\[?\s*(UNAVAILABLE|['"]?unavailable['"]?)\s*\]?\s*:|\bunavailable\s*\(|\bWAITS_ON\b/.test(sources[f]));
}

test('no producer writes a placeholder: the Record owner exports no placeholder constructor, and no lab or MiniMaxi source builds one (negative control: a planted one is red)', () => {
    assert.equal(recordFolder.unavailable, undefined, 'maxi-record-folder.js exports unavailable() — a producer could write a placeholder into a field');
    assert.equal(recordFolder.WAITS_ON, undefined, 'maxi-record-folder.js exports WAITS_ON');
    const sources = {};
    for (const d of ['site/app-assets', 'minimaxi']) {
        for (const f of fs.readdirSync(path.join(REPO, d)).filter((x) => /\.m?js$/.test(x))) { sources[d + '/' + f] = fs.readFileSync(path.join(REPO, d, f), 'utf8'); }
    }
    assert.ok(Object.keys(sources).includes('site/app-assets/maxi-record.js') && Object.keys(sources).includes('minimaxi/loop.mjs'));
    assert.deepEqual(placeholderWriters(sources), []);
    const planted = Object.assign({}, sources, { 'site/app-assets/maxi-record.js': sources['site/app-assets/maxi-record.js'] + "\nconst p = { unavailable: 'waits on P4' };\n" });
    assert.deepEqual(placeholderWriters(planted), ['site/app-assets/maxi-record.js']);
});

// ── the package's folder, and the lab's beside it ────────────────────────────────────────────
const bytes = (s) => new TextEncoder().encode(s);
const PARTS_BEFORE = { mirror: ['Wall', { rect: [360, 80, 20, 240], collisionBehavior: 'bounce' }] };
const PARTS_AFTER = { mirror: ['Wall', { rect: [300, 80, 20, 240], collisionBehavior: 'bounce' }] };
const SKETCH = "import { Wall } from '@descix/frqtl-web/parts';\n\nexport const parts = {\n  mirror: [Wall, { rect: [300, 80, 20, 240], collisionBehavior: 'bounce' }],\n};\n\nexport default function buildExperiment(exp) {\n  exp.createCanvas(600, 400, {});\n  exp.declare(parts);\n}\n";
const PROJECT = { 'frqtl.json': serializeManifest(manifestFor({ name: 'mirror', entry: 'sketch.js' })), 'sketch.js': SKETCH };
const MOVE = { tick: 7, name: 'mirror', op: 'move', by: 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: [300, 80, 20, 240] } };
const clip = (n, first, last) => ({ bytes: bytes('mp4-' + n), firstTick: first, lastTick: last });

/** What the package's Record resolves at stop: serializeRecordFolder over `over` (changes, clips, parts, project). */
function packageFolder(over) {
    return serializeRecordFolder(Object.assign({ changes: [MOVE], clips: [clip(1, 10, 260)], partsBefore: PARTS_BEFORE, partsAfter: PARTS_AFTER, project: PROJECT }, over || {}));
}
/** A one-world loop Record: the package's folder + lab.json, chained to itself, its hand-back its own last clip. */
function complete(over) {
    over = over || {};
    const folder = over.folder || packageFolder(over.pkg);
    return assembleRecord({
        producer: over.producer || 'loop', folder: folder, filmed: over.filmed || folder.clips.map(() => 'see'), stills: over.stills,
        lab: Object.assign({ outline: 'o', chain: { index: 1, records: ['record-01'] }, handBack: { record: 'record-01', clip: folder.clips[folder.clips.length - 1].file } }, over.lab || {})
    });
}
const edit = (files, f, fn) => { const out = Object.assign({}, files); out[f] = JSON.stringify(fn(JSON.parse(out[f]))); return out; };
const without = (files, f) => { const o = Object.assign({}, files); delete o[f]; return o; };

test('the union gate: a complete Record passes; every planted fault is refused by name, by the half that owns it, and the other half is green on it', () => {
    const ok = complete();
    assert.deepEqual(ok.faults, [], 'the green control');
    assert.equal(ok.complete, true);
    assert.deepEqual(Object.keys(ok.files).sort(), ['clip-01.mp4', 'lab.json', 'parts.after.json', 'parts.before.json', 'project/frqtl.json', 'project/sketch.js', 'record.json']);
    assert.deepEqual([packageFolderFaults(ok.files), hostFolderFaults(ok.files)], [[], []], 'both halves green');
    const lab = JSON.parse(ok.files['lab.json']);
    assert.deepEqual(lab.filmed, [{ clip: 'clip-01.mp4', hand: 'see', firstTick: 10, lastTick: 260 }], 'lab.json names the hand of every clip at the package\'s span');
    assert.equal(lab.project, undefined, 'no lab.json project.entry: project/frqtl.json names the entry');
    assert.doesNotThrow(() => assertCompleteRecord(ok.files));
    const f = ok.files;
    // nine clips: the package writes such a folder; assembleRecord refuses it (below), so its lab.json is written here
    const nineFolder = packageFolder({ clips: Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => clip(i + 1, 10 + i * 300, 260 + i * 300)) });
    const nine = { files: Object.assign({}, nineFolder.files, { 'lab.json': JSON.stringify(Object.assign(JSON.parse(f['lab.json']), {
        handBack: { record: 'record-01', clip: 'clip-09.mp4' }, filmed: nineFolder.clips.map((c) => ({ clip: c.file, hand: 'see', firstTick: c.firstTick, lastTick: c.lastTick })) })) }) };
    const theirs = {   // the package's half (§6): the lab's half holds no copy of these
        'rows out of tick order': [edit(f, FILES.record, (r) => { r.changes.push(Object.assign({}, MOVE, { tick: 5, from: { rect: [300, 80, 20, 240] }, to: { rect: [250, 80, 20, 240] } })); return r; }), /changes\[1\] at tick 5 comes after a row at tick 7 — rows are in the order acted, so ticks only climb/],
        'a 2D centre in a move row': [edit(f, FILES.record, (r) => { r.changes = [{ tick: 7, name: 'source', op: 'move', by: 'maxi', from: { center: [72, 200] }, to: { center: [100, 210] } }]; return r; }), /move carries from\/to as ONE key, \{center: \[x, y, z\]\}/],
        'a rect of 5 numbers': [edit(f, FILES.record, (r) => { r.changes[0].to = { rect: [300, 80, 20, 240, 1] }; return r; }), /move carries from\/to as ONE key/],
        'setDeclared with different key sets': [edit(f, FILES.record, (r) => { r.changes.push({ tick: 9, name: 'mirror', op: 'setDeclared', by: 'maxi', from: { orientationDeg: 45 }, to: { bounce: 'x' } }); return r; }), /setDeclared carries from\/to as \{key: value\} of the patched keys, the same keys before and after/],
        'no frqtl.json': [without(f, 'project/frqtl.json'), /project\/ has no frqtl\.json naming its entry/],
        'parts.after.json missing': [without(f, FILES.partsAfter), /the folder has no parts\.after\.json/],
        'a listed clip missing': [without(f, 'clip-01.mp4'), /clip-01\.mp4 is listed in record\.json clips but is not in the folder as bytes/],
        'an unlisted clip': [Object.assign({}, f, { 'clip-02.mp4': bytes('x') }), /clip-02\.mp4 is in the folder but not listed in record\.json clips/],
        'a record-level who': [edit(f, FILES.record, (r) => Object.assign(r, { by: 'maxi' })), /record\.json carries exactly \{tickRange, clips, changes\}/],
        'a hand name as op (dragTo)': [edit(f, FILES.record, (r) => { r.changes[0].op = 'dragTo'; return r; }), /\.op "dragTo" is not one of move\|setDeclared\|add\|remove\|fork/],
        'a zero move': [edit(f, FILES.record, (r) => { r.changes[0].to = r.changes[0].from; return r; }), /is a zero move of "mirror"/],
        'a placeholder in record.json': [edit(f, FILES.record, (r) => { r.changes[0].from = { unavailable: 'x' }; return r; }), /is the placeholder \{unavailable\} — a placeholder never sits in a §6 field/],
        'a fork outside parts/': [edit(f, FILES.record, (r) => { r.changes = [{ tick: 9, name: 'm', op: 'fork', by: 'maxi', from: 'Wall', to: { kind: 'Mine', file: 'Mine.js' } }]; return r; }), /fork carries from: "<source kind name>" and to:/],
        'a change outside tickRange': [edit(f, FILES.record, (r) => { r.changes[0].tick = 300; return r; }), /at tick 300 lies outside tickRange \[7,260\]/]
    };
    const ours = {   // the lab's half: the package's half is green on these
        'a placeholder JSON file under project/': [Object.assign({}, f, { 'project/UNAVAILABLE.json': JSON.stringify({ unavailable: 'waits on P4' }) }), /^project\/UNAVAILABLE\.json: \(the whole file\) is a placeholder \(\{unavailable\}: waits on P4\)/],
        'a placeholder inside the sketch text': [Object.assign({}, f, { 'project/sketch.js': SKETCH.replace("collisionBehavior: 'bounce'", "collisionBehavior: { unavailable: 'waits on P4' }") }), /^project\/sketch\.js holds a placeholder \(`unavailable:` at line 4\)/],
        'the entry not a sketch module (SKETCH_FORM)': [Object.assign({}, f, { 'project/sketch.js': '// export default function buildExperiment(exp) {}\nexport const parts = {};\n' }), /^project\/sketch\.js is not a sketch module: no line starts `export default function buildExperiment\(` \(SKETCH_FORM\)$/],
        'an empty entry': [Object.assign({}, f, { 'project/sketch.js': '' }), /^project\/sketch\.js is empty/],
        'a bare "*" entry': [Object.assign({}, f, { 'project/sketch.js': '*\n' }), /^project\/sketch\.js is a bare "\*"/],
        'a JSON entry': [Object.assign({}, f, { 'project/sketch.js': JSON.stringify({ unavailable: 'x' }) }), /^project\/sketch\.js parses as JSON/],
        'no lab.json': [without(f, FILES.lab), /the folder has no lab\.json/],
        'an unknown producer': [edit(f, FILES.lab, (l) => Object.assign(l, { producer: 'studio' })), /lab\.json producer is one of record\|loop/],
        'no filmed list': [edit(f, FILES.lab, (l) => { delete l.filmed; return l; }), /lab\.json names no `filmed` list/],
        'a filmed entry with no hand': [edit(f, FILES.lab, (l) => { delete l.filmed[0].hand; return l; }), /lab\.json filmed\[0\] names no hand/],
        'filmed out of tickRange': [edit(f, FILES.lab, (l) => { l.filmed[0].lastTick = 900; return l; }), /lab\.json filmed\[0\] \(clip-01\.mp4\) spans \[10,900\], not whole ticks inside tickRange/],
        'a hand-back not in the record-NN/clip-NN shape': [edit(f, FILES.lab, (l) => Object.assign(l, { handBack: 'clip-01.mp4' })), /lab\.json handBack is "clip-01\.mp4", not \{record: "record-NN"/],
        'a loop Record with no chain': [edit(f, FILES.lab, (l) => { delete l.chain; return l; }), /lab\.json chain is undefined, not \{index, records/],
        'a placeholder nested in lab.json': [edit(f, FILES.lab, (l) => Object.assign(l, { scene: { unavailable: 'x' } })), /^lab\.json: scene is a placeholder \(\{unavailable\}: x\)/],
        'unheld rows that are not rows': [edit(f, FILES.lab, (l) => Object.assign(l, { unheld: [{ tick: 3, name: 'mirror', op: 'drag', by: 'maxi', from: null, to: null }] })), /lab\.json unheld\[0\]: op "drag" is not one of move\|setDeclared\|add\|remove\|fork/],
        'carried: "garbage"': [edit(f, FILES.lab, (l) => Object.assign(l, { carried: 'garbage' })), /^lab\.json carried is \{changes: \[rows\], clips: \[clips\]\}, got "garbage"$/],
        'carried with an empty body': [edit(f, FILES.lab, (l) => Object.assign(l, { carried: { changes: [], clips: [] } })), /^lab\.json carried is empty — nothing carried is ABSENT/],
        'carried rows that are not change rows': [edit(f, FILES.lab, (l) => Object.assign(l, { carried: { changes: [{ tick: 1, name: 'mirror', op: 'drag', by: 'maxi', from: null, to: null }], clips: [] } })), /^lab\.json carried changes\[0\]: op "drag" is not one of/],
        'carried rows that are not record.json\'s leading rows': [edit(f, FILES.lab, (l) => Object.assign(l, { carried: { changes: [Object.assign({}, MOVE, { tick: 3 })], clips: [] } })), /^lab\.json carried changes are not the leading rows of record\.json$/],
        'carried clips that are not clip names': [edit(f, FILES.lab, (l) => Object.assign(l, { carried: { changes: [], clips: [{ clip: 'early.mp4', hand: 'see', firstTick: 10, lastTick: 260 }] } })), /^lab\.json carried clips\[0\] is .*not record\.json clip "clip-01\.mp4"/],
        'carried clips whose spans are not filmed\'s': [edit(f, FILES.lab, (l) => Object.assign(l, { carried: { changes: [], clips: [{ clip: 'clip-01.mp4', hand: 'see', firstTick: 11, lastTick: 260 }] } })), /^lab\.json carried clips\[0\] \(clip-01\.mp4\) is not the clip lab\.json filmed names/],
        'carried outside the first Record of a chain': [edit(f, FILES.lab, (l) => Object.assign(l, { chain: { index: 2, records: ['record-01', 'record-02'] }, handBack: { record: 'record-02', clip: 'clip-01.mp4' }, carried: { changes: [MOVE], clips: [] } })), /^lab\.json carried rides in the first Record of a chain only$/],
        '9 clips': [nine.files, /record\.json clips lists 9 segments — a Record holds at most 8/],
        'two stills': [Object.assign({}, f, { 'early.png': bytes('p'), 'mid.png': bytes('p') }), /the stills are all three of early\.png, mid\.png, settled\.png or none/]
    };
    for (const [why, [files, re]] of Object.entries(theirs)) {
        assert.ok(packageFolderFaults(files).some((b) => re.test(b)), 'the package\'s half must name it (' + why + '): got\n' + packageFolderFaults(files).join('\n'));
        assert.deepEqual(hostFolderFaults(files).filter((b) => re.test(b)), [], 'the lab\'s half holds no copy of the package\'s check (' + why + ')');
        assert.ok(recordFolderFaults(files).some((b) => re.test(b)), 'the union names it (' + why + ')');
        assert.throws(() => assertCompleteRecord(files), /is not a complete Record \(the sketch-projects design §6\)/);
    }
    for (const [why, [files, re]] of Object.entries(ours)) {
        assert.ok(hostFolderFaults(files).some((b) => re.test(b)), 'the lab\'s half must name it (' + why + '): got\n' + hostFolderFaults(files).join('\n'));
        assert.deepEqual(packageFolderFaults(files).filter((b) => re.test(b)), [], 'the package\'s half does not (' + why + ')');
        assert.ok(recordFolderFaults(files).some((b) => re.test(b)), 'the union names it (' + why + ')');
    }
    // a well-formed carried (the leading row and clip, as filmed names it) passes both halves
    const okCarried = edit(f, FILES.lab, (l) => Object.assign(l, { carried: { changes: [MOVE], clips: [l.filmed[0]] } }));
    assert.deepEqual([packageFolderFaults(okCarried), hostFolderFaults(okCarried)], [[], []], 'a carried that names the Record\'s leading row and clip is right');
    // the package's half is green on a folder only the lab's half refuses: theirs alone is not the gate
    assert.deepEqual(packageFolderFaults(ours['a placeholder JSON file under project/'][0]), []);
    assert.deepEqual(packageFolderFaults(nine.files), [], '9 clips is a §6 folder; MAX_SEGMENTS is the lab\'s rule');
});

test('assembleRecord adds lab.json beside the package\'s files and refuses what it cannot state; folderHere brings a folder into this realm', () => {
    assert.throws(() => complete({ producer: 'x' }), /names its producer/);
    assert.throws(() => complete({ filmed: [] }), /names the hand that filmed each of the Record's 1 clips/);
    assert.throws(() => complete({ filmed: [''] }), /names the hand that filmed each/);
    assert.throws(() => complete({ stills: [bytes('a')] }), /stills are the three early\.png, mid\.png, settled\.png as bytes/);
    assert.throws(() => complete({ pkg: { clips: Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => clip(i + 1, 10 + i * 300, 260 + i * 300)) }, filmed: Array(MAX_SEGMENTS + 1).fill('see') }), /at most 8 segments/);
    assert.throws(() => assembleRecord({ producer: 'loop', folder: { empty: true }, filmed: [] }), /a closed Record is rec\.stop\(\)'s \{files, record, clips\}/);
    const withLab = packageFolder(); withLab.files['lab.json'] = '{}';
    assert.throws(() => complete({ folder: withLab }), /already carries lab\.json — the host's file is never written over/);
    const st = complete({ stills: STILLS.map(() => bytes('png')) });
    assert.deepEqual([st.faults, STILLS.every((s) => s in st.files)], [[], true], 'the stills ride beside');
    // another realm's folder (the scene document's): the package's own gate here refuses it until it crosses
    const pf = packageFolder();
    const foreign = vm.runInNewContext('({ files: {}, record: null, clips: null })');
    Object.keys(pf.files).forEach((k) => { const v = pf.files[k]; foreign.files[k] = typeof v === 'string' ? v : vm.runInNewContext('new Uint8Array(' + JSON.stringify(Array.from(v)) + ')'); });
    foreign.record = vm.runInNewContext('(' + JSON.stringify(pf.record) + ')'); foreign.clips = vm.runInNewContext('(' + JSON.stringify(pf.clips) + ')');
    assert.ok(packageFolderFaults(foreign.files).length > 0, 'a folder from another realm fails the package\'s gate in this one (the negative control the crossing answers)');
    assert.deepEqual(packageFolderFaults(folderHere(foreign).files), [], 'folderHere: the same folder in this realm passes');
    // the page → node crossing: each file {text} or {base64}
    const wire = { files: {}, record: pf.record, clips: pf.clips };
    Object.keys(pf.files).forEach((k) => { const v = pf.files[k]; wire.files[k] = typeof v === 'string' ? { text: v } : { base64: base64OfBytes(v) }; });
    const back = folderHere(JSON.parse(JSON.stringify(wire)));
    assert.deepEqual(Object.keys(back.files).sort(), Object.keys(pf.files).sort());
    assert.deepEqual(Array.from(back.files['clip-01.mp4']), Array.from(pf.files['clip-01.mp4']));
    assert.throws(() => folderHere({ files: { 'x.json': 42 }, record: {}, clips: [] }), /x\.json is neither text nor bytes/);
});

test('a folder round-trips through the package\'s node writer byte for byte and is never overwritten', () => {
    const ok = complete();
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rec-folder-')), 'record');
    writeRecordFolder({ files: ok.files }, dir);
    const back = readRecordFolder(dir);
    assert.deepEqual(Object.keys(back).sort(), Object.keys(ok.files).sort());
    assert.deepEqual(Array.from(back['clip-01.mp4']), Array.from(ok.files['clip-01.mp4']));
    assert.equal(back['record.json'], ok.files['record.json']);
    assert.deepEqual(recordFolderFaults(back), []);
    assert.throws(() => writeRecordFolder({ files: ok.files }, dir), /exists and is not empty — a Record is never written over another/);
    assert.throws(() => writeRecordFolder({ files: { '../x.json': '{}' } }, dir + '-2'), /is not inside the folder/);
});

// ── the loop's Records ────────────────────────────────────────────────────────────────────────
test('a loop approve\'s Records are the lab\'s closed Records, chained; the loop\'s own view of each world must agree with its Record', () => {
    const c1 = { firstTick: 3669, lastTick: 3919, name: 'first' }, c2 = { firstTick: 300, lastTick: 560, name: 'second' };
    const inv = (id) => ({ scene: id, id: id, mode: null, renderer: 'p5', objects: [] });
    const round = { verdict: 'approve', outline: 'o', plan: {}, designerWords: 'w', steps: [], prediction: 'p', builderWords: 'b', owl: { verdict: 'approve' }, threads: {}, rounds: 1, clip: c2,
        worlds: [{ before: inv('cl1a-mirror'), after: inv('cl1a-mirror'), changes: [], clips: [{ hand: 'see', clip: c1 }] },
                 { before: inv('sketch'), after: null, afterRefused: 'inventory: no scene is loaded', changes: [MOVE], clips: [{ hand: 'dragTo', clip: c2 }] }] };
    const w1 = { folder: packageFolder({ changes: [], clips: [clip(1, 3669, 3919)] }), filmed: ['see'], carried: 0 };
    const w2 = { folder: packageFolder({ clips: [clip(2, 300, 560)] }), filmed: ['dragTo'], carried: 0 };
    const host = { worlds: [w1, w2], unheld: [], brain: 'local', run: 'mmx' };
    assert.throws(() => assembleLoopRecords(round, host), /world 2 of the round carries no inventory at its close \(the body refused it: inventory: no scene is loaded\)/);
    round.worlds[1].after = inv('sketch');
    const recs = assembleLoopRecords(round, host);
    assert.deepEqual(recs.map((r) => r.name), ['record-01', 'record-02']);
    assert.deepEqual(recs.map((r) => [r.record.tickRange, r.record.clips]), [[[3669, 3919], ['clip-01.mp4']], [[7, 560], ['clip-01.mp4']]], 'each Record counts its own clock');
    assert.deepEqual(recs.map((r) => [r.lab.chain, r.lab.handBack]), [[{ index: 1, records: ['record-01', 'record-02'] }, { record: 'record-02', clip: 'clip-01.mp4' }], [{ index: 2, records: ['record-01', 'record-02'] }, { record: 'record-02', clip: 'clip-01.mp4' }]]);
    assert.deepEqual([recs[0].lab.outline, recs[1].lab.outline], [undefined, 'o'], 'the round\'s own fields ride in the hand-back Record');
    assert.deepEqual(recs.map((r) => r.lab.filmed.map((x) => x.hand)), [['see'], ['dragTo']]);
    assert.deepEqual(recordChainFaults(recs), [], 'the green control');
    assert.deepEqual(recs.map((r) => r.faults), [[], []]);
    assert.deepEqual(unavailableFields(recs[1].files), []);
    // the loop's view and the Records disagree: refused by name
    assert.throws(() => assembleLoopRecords(round, Object.assign({}, host, { worlds: [w2] })), /the loop acted in 2 world\(s\), the lab closed 1 Record\(s\)/);
    const rowsOff = Object.assign({}, round, { worlds: [round.worlds[0], Object.assign({}, round.worlds[1], { changes: [] })] });
    assert.throws(() => assembleLoopRecords(rowsOff, host), /world 2: the rows the loop heard \(\[\]\) are not its Record's/);
    const clipsOff = Object.assign({}, round, { worlds: [Object.assign({}, round.worlds[0], { clips: [] , changes: [MOVE] })].concat([round.worlds[1]]) });
    assert.throws(() => assembleLoopRecords(clipsOff, host), /world 1: the loop filmed 0 clip\(s\), its Record holds 1/);
    // rows the Record carried from before the round sit before the loop's: the loop's rows are the rest
    const pre = { tick: 2, name: 'mirror', op: 'move', by: 'human', from: { rect: [380, 80, 20, 240] }, to: { rect: [360, 80, 20, 240] } };
    // what the Record held before the round began (a row and Maxi's earlier clip): carried, sliced off, named in lab.json
    const earlier = { firstTick: 100, lastTick: 250 };
    const carried = { folder: packageFolder({ changes: [pre, MOVE], clips: [clip(9, 100, 250), clip(2, 300, 560)] }), filmed: ['see', 'dragTo'], carried: { changes: [pre], clips: [Object.assign({ hand: 'see' }, earlier)] } };
    const one = Object.assign({}, round, { worlds: [round.worlds[1]] });   // the round acted in one world, the one whose Record carried
    const withCarried = assembleLoopRecords(one, Object.assign({}, host, { worlds: [carried] }));
    assert.deepEqual(withCarried[0].lab.carried, { changes: [pre], clips: [{ clip: 'clip-01.mp4', hand: 'see', firstTick: 100, lastTick: 250 }] }, 'lab.json carried names the earlier row and clip');
    assert.deepEqual([withCarried[0].faults, withCarried[0].lab.handBack.clip, withCarried[0].lab.filmed.map((f) => f.hand)], [[], 'clip-02.mp4', ['see', 'dragTo']], 'complete; the hand-back is the round\'s own last clip');
    assert.throws(() => assembleLoopRecords(one, Object.assign({}, host, { worlds: [Object.assign({}, carried, { carried: null })] })), /world 1: the loop filmed 1 clip\(s\), its Record holds 2/);
    assert.throws(() => assembleLoopRecords(one, Object.assign({}, host, { worlds: [Object.assign({}, carried, { carried: { changes: [], clips: carried.carried.clips } })] })), /world 1: the rows the loop heard/);
    assert.throws(() => assembleLoopRecords(round, Object.assign({}, host, { unheld: [MOVE] })), /1 row\(s\) of the round no Record holds/);
    // the chain gate: out of order, another hand-back, the round's fields misplaced
    const swapped = [Object.assign({}, recs[1], { name: 'record-01' }), Object.assign({}, recs[0], { name: 'record-02' })];
    assert.ok(recordChainFaults(swapped).some((x) => /record-01\/lab\.json chains \{"index":2,.*the chain is out of order/.test(x)), recordChainFaults(swapped).join('\n'));
    assert.ok(recordChainFaults([recs[1], recs[0]]).some((x) => /folder 1 is "record-02", not record-01 \(Records in order\)/.test(x)));
    const moved = recs.map((r, i) => i === 0 ? Object.assign({}, r, { files: edit(r.files, FILES.lab, (l) => Object.assign(l, { handBack: { record: 'record-01', clip: 'clip-01.mp4' } })) }) : r);
    assert.ok(recordChainFaults(moved).some((x) => /record-02\/lab\.json names another hand-back clip/.test(x)));
    const misplaced = recs.map((r, i) => i === 0 ? Object.assign({}, r, { files: edit(r.files, FILES.lab, (l) => Object.assign(l, { outline: 'o' })) }) : r);
    assert.ok(recordChainFaults(misplaced).some((x) => /record-01\/lab\.json carries the round's own fields \(outline\)/.test(x)));
    assert.throws(() => assembleLoopRecords(Object.assign({}, round, { clip: c1 }), host), /the hand-back clip is not the last clip of the round's last world/);
    assert.throws(() => assembleLoopRecords(round, { brain: 'local' }), /the driver hands the round's closed Records/);
    assert.equal(recordDirName(3), 'record-03');
    delete round.rounds;
    assert.throws(() => assembleLoopRecords(round, host), /lacks `rounds` for lab\.json/);
});

// ── the human's teaching words: lab.json TEACHING_KEY, owned here ─────────────────────────────────
/** Load a planted maxi-record-folder.js (its imports pinned to this checkout): the planted module, and dispose(). */
async function plantedFolder(src) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-plant-'));
    const pin = (s) => s.replace(/from '\.\/(frqtl-web-project|maxi-hands)\.js'/g, (m, f) => "from '" + pathToFileURL(path.join(REPO, 'site/app-assets', f + '.js')).href + "'");
    fs.writeFileSync(path.join(dir, 'maxi-record-folder.js'), pin(src));
    const m = await import(pathToFileURL(path.join(dir, 'maxi-record-folder.js')).href);
    return { m, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** A two-world human Record chain from the real recorder's assembly (maxi-record.js recordsOf), with `teaching`. */
function humanChain(teaching) {
    const world = (label, first) => ({ scene: { label, id: null, mode: null, renderer: 'p5' }, folder: packageFolder({ changes: [], clips: [clip(1, first, first + 495)] }), filmed: ['record'] });
    return recordsOf([world('A', 0), world('B', 400)], null, [], teaching);
}

/** The teaching gate's checks on folder `m` (the real owner or a planted copy); THROWS on the first that does not hold. */
function assertTeachingGate(m) {
    const WORDS = 'Light leaves the mirror at the angle it arrives.\nWatch the slab: rotate it, the beam follows.';
    const recs = humanChain(WORDS);
    assert.deepEqual(recs.map((r) => r.lab[m.TEACHING_KEY]), [undefined, WORDS], 'the words ride in the hand-back Record only, verbatim');
    assert.deepEqual(recs.map((r) => r.faults), [[], []], 'a Record with teaching words is complete');
    assert.deepEqual(recordChainFaults(recs), []);
    assert.deepEqual(humanChain(undefined).map((r) => Object.prototype.hasOwnProperty.call(r.lab, m.TEACHING_KEY)), [false, false], 'no words: the key is absent');
    const hb = recs[1].files;
    const set = (v) => edit(hb, FILES.lab, (lab) => Object.assign(lab, { [m.TEACHING_KEY]: v }));
    for (const [v, re] of [
        ['', /^lab\.json teaching is empty — an empty blurb is absent from lab\.json, never ""$/],
        ['  padded ', /^lab\.json teaching is stored with its ends trimmed/],
        [m.TEACHING_PROMPT, /^lab\.json teaching is the card's prompt "What are you teaching Maxi\?", a placeholder, not the human's words$/],
        ['what are you teaching maxi?', /^lab\.json teaching is the card's prompt/],
        ['{"unavailable":"waits on the human"}', /^lab\.json teaching is JSON holding a placeholder \(an `unavailable` key\), not the human's words$/],
        ['["a","b"]', /^lab\.json teaching is JSON, not the human's words$/],
        [{ unavailable: 'x' }, /^lab\.json teaching is the human's words as a string/],
        [42, /^lab\.json teaching is the human's words as a string \(absent when they typed none\), got 42$/]
    ]) {
        const faults = m.recordFolderFaults(set(v));
        assert.ok(faults.some((f) => re.test(f)), JSON.stringify(v) + ' is refused by name, got:\n' + faults.join('\n'));
    }
    assert.deepEqual(m.recordFolderFaults(set('[the slab] turns, the beam follows')), [], 'words that open with a bracket are words');
    const early = edit(recs[0].files, FILES.lab, (lab) => Object.assign(lab, { [m.TEACHING_KEY]: WORDS }));
    assert.ok(m.recordFolderFaults(early).includes('lab.json teaching rides in the hand-back Record of a chain only'), 'teaching outside the hand-back Record is refused');
    assert.deepEqual(m.HAND_BACK_KEYS, ['unheld', 'teaching']);
    assert.equal(m.teachingOf('  ' + WORDS + '\n'), WORDS, 'the card\'s reader trims the ends and keeps the words');
    assert.equal(m.teachingOf('   \n '), undefined, 'a blank textarea is no words');
    assert.throws(() => m.teachingOf(m.TEACHING_PROMPT), /teaching is the card's prompt .* — nothing was sent\.$/);
}

test('the human\'s teaching words: one owner key (TEACHING_KEY) in the hand-back lab.json, absent when empty, never a placeholder, named by the gate (negative controls: the check or the hand-back rule planted out is red)', async () => {
    assertTeachingGate(recordFolder);
    const src = fs.readFileSync(path.join(REPO, 'site/app-assets/maxi-record-folder.js'), 'utf8');
    const CHECK = "    if (lab[TEACHING_KEY] !== undefined) { teachingFaults(lab[TEACHING_KEY]).forEach(function (f) { bad.push('lab.json ' + f); }); }\n";
    const HB_KEYS = 'export const HAND_BACK_KEYS = Object.freeze([UNHELD_KEY, TEACHING_KEY]);';
    const JSON_ARM = 'if (/^\\s*[{[]/.test(v)) {';
    for (const [label, from, to] of [['the teaching check', CHECK, ''], ['the hand-back rule', HB_KEYS, 'export const HAND_BACK_KEYS = Object.freeze([UNHELD_KEY]);'],
        ['the JSON-list arm (a list let through)', JSON_ARM, 'if (/^\\s*[{]/.test(v)) {']]) {
        assert.equal(src.split(from).length, 2, label + ': the plant target moved — the control would measure nothing');
        const p = await plantedFolder(src.replace(from, to));
        try { assert.throws(() => assertTeachingGate(p.m), undefined, label + ' planted out is RED'); } finally { p.dispose(); }
    }
    // and the unplanted copy, loaded the same way, is green (the loader measures the real thing)
    const p = await plantedFolder(src);
    try { assertTeachingGate(p.m); } finally { p.dispose(); }
});
