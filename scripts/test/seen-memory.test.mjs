/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * seen-memory.test.mjs — scripts/gen-memories-seen.mjs writes a seen memory from a run's Record folder, and only a
 * COMPLETE Record is published into kb/GodsWorld/memories and site/memories.
 *
 * The fixture is scripts/test/fixtures/record-mmp41d/record/ (its README says what is the trial's and what is not): a
 * two-Record chain whose hand-back Record is complete. Every conformance case drives off the Record owner's exports
 * (site/app-assets/maxi-record-folder.js FILES, RECORD_KEYS, LOOP_LAB_KEYS, OPS, STILLS), so a field the owner adds
 * and the generator does not handle is red here, never a second hand-typed list. The human's teaching note (TEACHING_KEY)
 * is gated on a copy of the fixture whose hand-back lab.json is given the words (the trial itself carried none).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as seen from '../gen-memories-seen.mjs';
import { FILES, RECORD_KEYS, LOOP_LAB_KEYS, OPS, STILLS, UNAVAILABLE, TEACHING_KEY, CARRIED_KEY, START_KEY, changeText, recordFolderFaults, recordPlanFaults } from '../../site/app-assets/maxi-record-folder.js';
import { readRecordFolder } from '../../minimaxi/record-folder.mjs';
import { testTmpDir } from './tmpdir.mjs';

const { readRun, writeSeenMemory, recordLines, recordLinesOf, publishedRecordFaults, lookedFaults, CHANGE_PREFIX } = seen;
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'record-mmp41d', 'record');
const FIXTURE_TURNS = path.join(path.dirname(FIXTURE), 'turns', 'mmp41d');
const HB = 'record-02';
const ID = 'mm-cl1a-mirror-p41d';
const LOOK = { by: 'human', who: 'godsworld-seat-author', stills: 3, account: 'contact: the slab, middle third, x about 295; after: up and to the left; passes: no' };

/** A scratch checkout holding a copy of the fixture run at <root>/minimaxi/out/<run>/record, edited by `edit(handBackDir)`. */
function scratch(edit, run) {
    const root = testTmpDir('seen-memory');
    fs.mkdirSync(path.join(root, 'kb', 'GodsWorld', 'memories'), { recursive: true });
    fs.mkdirSync(path.join(root, 'site', 'memories'), { recursive: true });
    const dir = path.join(root, 'minimaxi', 'out', run || 'mmp41d', 'record');
    fs.cpSync(FIXTURE, dir, { recursive: true });
    fs.cpSync(FIXTURE_TURNS, path.join(root, 'minimaxi', 'out', 'turns', 'mmp41d'), { recursive: true });   // where the Record's threads name them
    if (edit) { edit(path.join(dir, HB)); }
    return { root, dir };
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
const nothingPublished = (root) => fs.readdirSync(path.join(root, 'kb', 'GodsWorld', 'memories')).length === 0 && fs.readdirSync(path.join(root, 'site', 'memories')).length === 0;

test('the fixture is a complete hand-back Record in a chain that holds, and the generator reads the hand-back, not the first Record', () => {
    const run = readRun(FIXTURE);
    assert.deepEqual(run.handBack, { record: HB, clip: 'clip-02.mp4' });
    assert.deepEqual([run.id, run.complete, run.faults], [ID, true, []]);
    assert.deepEqual(run.record.tickRange, [2135, 8529]);
    assert.ok(recordFolderFaults(readRecordFolder(path.join(FIXTURE, 'record-01'))).length > 0, 'record-01 (its clip not kept) is incomplete, and is not the one published');
});

test('a complete Record is published: the whole hand-back folder under site/memories/<id>/, the text under kb/, and both pass the memory gate\'s rules', () => {
    const { root, dir } = scratch();
    const out = writeSeenMemory(dir, LOOK, { root });
    assert.deepEqual(out, { id: ID, complete: true, faults: [], memory: 'kb/GodsWorld/memories/' + ID + '-seen.md', media: 'site/memories/' + ID });
    const src = readRecordFolder(path.join(dir, HB));
    const served = readRecordFolder(path.join(root, out.media));
    const turns = fs.readdirSync(FIXTURE_TURNS).sort().map((n) => 'turns/' + n);
    assert.equal(turns.length, 8, 'the eight answers of the threads\' eight turns');
    assert.deepEqual(Object.keys(served).sort(), Object.keys(src).concat(turns).sort(), 'every file of the hand-back Record is served, and the roles\' answers under turns/');
    turns.forEach((t) => assert.equal(served[t], fs.readFileSync(path.join(FIXTURE_TURNS, t.slice(6)), 'utf8'), t + ' is served byte for byte'));
    Object.keys(src).forEach((f) => assert.ok(Buffer.from(served[f]).equals(Buffer.from(src[f])), f + ' is served byte for byte'));
    STILLS.forEach((s) => assert.ok(s in served, s + ' is served'));
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    assert.match(md, /RECORD, not Maxi's own sighting/);
    assert.match(md, new RegExp('^looked: human godsworld-seat-author on 3 stills of memories/' + ID + '/clip-02\\.mp4 — ', 'm'));
    assert.ok(md.includes('Record record-02 of run mmp41d (chain record-01, record-02)') && md.includes('ticks 2135–8529') && md.includes('memories/' + ID + '/clip-01.mp4 (see, ticks 4266–4516)') && md.includes('memories/' + ID + '/clip-02.mp4 (dragTo, ticks 8229–8529)'));
    assert.ok(md.includes('The project at stop: memories/' + ID + '/project/sketch.js.'));
    assert.ok(!/INCOMPLETE/.test(md));
    // the header names the side the parts diff starts from: this Record carries a start, so it is lab.json start, never parts.before.json
    const header = md.split('\n').filter((l) => l.startsWith('Changes (record.json, one row per act, in order) and the parts diff ('));
    assert.deepEqual(header, ['Changes (record.json, one row per act, in order) and the parts diff (' + FILES.lab + ' ' + START_KEY + ' → ' + FILES.partsAfter + '):'], 'the header names lab.json start as the diff\'s start');
    assert.deepEqual(recordLinesOf(md), [CHANGE_PREFIX + 'tick 2135 · setDeclared (maxi) mirror: {"orientationDeg":45} → {"orientationDeg":30}', CHANGE_PREFIX + 'tick 8378 · move (maxi) mirror: rect [360, 80, 20, 240] → rect [290, 80, 20, 240]',
        'part mirror: ["Wall",{"rect":[360,80,20,240],"collisionBehavior":"bounce","bounceDirection":"reflect","orientationDeg":45,"color":[255,120,0],"hooks":["recolor"]}] → ["Wall",{"rect":[290,80,20,240],"collisionBehavior":"bounce","bounceDirection":"reflect","orientationDeg":30,"color":[255,120,0],"hooks":["recolor"]}]'], 'the trial\'s own two acts and the parts diff they made');
    assert.deepEqual(lookedFaults(md, ID, path.join(root, 'site')), [], 'the looked rule');
    assert.deepEqual(publishedRecordFaults(md, ID, path.join(root, 'site')), [], 'the published-Record rule');
    // a hand edit of a published memo line is red
    assert.match(publishedRecordFaults(md.replace('setDeclared (maxi) mirror', 'setDeclared (human) mirror'), ID, path.join(root, 'site')).join('\n'), /Record lines are not the ones its served Record states/);
    for (const m of md.matchAll(/\bmemories\/[A-Za-z0-9._/-]+\.(?:mp4|png|js)\b/g)) assert.ok(fs.existsSync(path.join(root, 'site', m[0])), 'cited ' + m[0] + ' is served');
    assert.throws(() => writeSeenMemory(dir, LOOK, { root }), /already exists \(.*\) — a memory is never overwritten/);
});

test('every op of the owner\'s OPS becomes one memo line, in order, in the owner\'s changeText; parts that differ become part lines (a draft: an unplanned part and a fork are beyond the plan)', () => {
    const ROW = {   // one §6 row per op; an op the owner adds with no row here is red
        move: { name: 'mirror', from: { rect: [360, 80, 20, 240] }, to: { rect: [300, 80, 20, 240] } },
        setDeclared: { name: 'mirror', from: { orientationDeg: 45 }, to: { orientationDeg: 30 } },
        add: { name: 'block', from: null, to: ['Wall', { rect: [100, 100, 20, 20] }] },
        remove: { name: 'block', from: ['Wall', { rect: [100, 100, 20, 20] }], to: null },
        fork: { name: 'mirror', from: 'Wall', to: { kind: 'TiltWall', file: 'parts/TiltWall.js' } }
    };
    const rows = OPS.map((op, i) => {
        assert.ok(ROW[op], 'no conformance row for the owner\'s op ' + op);
        return Object.assign({ tick: 2703 + i, op, by: i % 2 ? 'human' : 'maxi' }, ROW[op]);
    });
    const { root, dir } = scratch((hb) => {
        const r = readJson(path.join(hb, FILES.record)); r.changes = rows; writeJson(path.join(hb, FILES.record), r);
        const after = readJson(path.join(hb, FILES.partsAfter)); after.mirror[1].orientationDeg = 31; after.block = ['Wall', { rect: [1, 2, 3, 4] }]; writeJson(path.join(hb, FILES.partsAfter), after);
    });
    // a plan names {object, param, value}: rows on a part it never mentions and a fork are beyond it, so this Record is a draft
    assert.throws(() => writeSeenMemory(dir, LOOK, { root }), /is not a complete Record[\s\S]*\(remove of "block"\) is on a part the plan never mentions[\s\S]*\(fork of "mirror"\) acts beyond the plan: fork/);
    assert.ok(nothingPublished(root));
    const out = writeSeenMemory(dir, LOOK, { root, draft: true });
    const md = fs.readFileSync(path.join(root, out.draft), 'utf8');
    const lines = recordLinesOf(md);
    assert.deepEqual(lines.slice(0, rows.length), rows.map((c) => CHANGE_PREFIX + changeText(c)), 'one memo line per row, in order');
    assert.ok(lines[1].startsWith('change: tick 2704 · setDeclared (human) mirror: {"orientationDeg":45} → {"orientationDeg":30}'), lines[1]);
    assert.deepEqual(lines.slice(rows.length).map((l) => l.split(':')[0]), ['part mirror', 'part block']);
    assert.match(md, /its acts are by maxi and human/);
    assert.match(md, /^INCOMPLETE Record, so not published .*plan changes\[0\] \(mirror orientationDeg: 30\): record-02\/parts\.after\.json holds "mirror" orientationDeg at 31, not 30/m, 'the draft\'s INCOMPLETE line names the plan faults');
});

test('the completeness gate: a Record missing any §6 field, or holding one {unavailable}, is refused by name; nothing reaches kb/ or site/', () => {
    // each §6 file of the owner's FILES, removed from the hand-back Record
    for (const k of Object.keys(FILES)) {
        const { root, dir } = scratch((hb) => fs.rmSync(path.join(hb, FILES[k]), { recursive: true }));
        assert.throws(() => writeSeenMemory(dir, LOOK, { root }), (e) => e.message.includes(FILES[k]), 'removing ' + FILES[k] + ' is refused naming it');
        assert.ok(nothingPublished(root), FILES[k]);
    }
    // each record.json key of the owner's RECORD_KEYS, removed
    for (const k of RECORD_KEYS) {
        const { root, dir } = scratch((hb) => { const r = readJson(path.join(hb, FILES.record)); delete r[k]; writeJson(path.join(hb, FILES.record), r); });
        assert.throws(() => writeSeenMemory(dir, LOOK, { root }), (e) => /is not a complete Record|do not chain/.test(e.message) && new RegExp('got \\{(?![^}]*\\b' + k + '\\b)[^}]*\\}').test(e.message), 'record.json without ' + k + ' is refused');
        assert.ok(nothingPublished(root), k);
    }
    // each of the round's own fields (the owner's LOOP_LAB_KEYS), removed from the hand-back lab.json
    for (const k of LOOP_LAB_KEYS) {
        const { root, dir } = scratch((hb) => { const l = readJson(path.join(hb, FILES.lab)); delete l[k]; writeJson(path.join(hb, FILES.lab), l); });
        assert.throws(() => writeSeenMemory(dir, LOOK, { root }), (e) => e.message.includes(k), 'lab.json without ' + k + ' is refused naming it');
        assert.ok(nothingPublished(root), k);
    }
    // a Record whose parts files and project/ hold placeholders ({unavailable}) instead of the sketch's block and text
    const { root, dir } = scratch((hb) => {
        writeJson(path.join(hb, FILES.partsBefore), { [UNAVAILABLE]: 'waits on P1' });
        writeJson(path.join(hb, FILES.partsAfter), { [UNAVAILABLE]: 'waits on P1' });
        fs.rmSync(path.join(hb, FILES.project), { recursive: true });
        fs.mkdirSync(path.join(hb, FILES.project));
        writeJson(path.join(hb, FILES.project, 'UNAVAILABLE.json'), { [UNAVAILABLE]: 'waits on P4' });
    });
    // the union gate names each: the package's half the §6 parts files, the lab's half the placeholder under project/
    assert.throws(() => writeSeenMemory(dir, LOOK, { root }), (e) => ['parts.before.json is the placeholder {unavailable}', 'parts.after.json is the placeholder {unavailable}', 'project/UNAVAILABLE.json: (the whole file) is a placeholder'].every((f) => e.message.includes(f)) && /--draft writes the memory under minimaxi\/out\/mmp41d\/memory\/ only/.test(e.message));
    assert.ok(nothingPublished(root));
    // its draft goes under the run's own folder only, and says it is incomplete
    const d = writeSeenMemory(dir, LOOK, { root, draft: true });
    assert.deepEqual([d.draft, d.complete, d.faults.length], ['minimaxi/out/mmp41d/memory/' + ID + '-seen.md', false, 8], 'two placeholder parts files (each also not an entry), a project/ with no frqtl.json, the placeholder under project/, and the plan\'s two changes the placeholder parts.after.json cannot hold');
    assert.deepEqual(d.faults.slice(6), ['plan changes[0] (mirror orientationDeg: 30): record-02/parts.after.json has no part "mirror"', 'plan changes[1] (mirror center: [300,200]): record-02/parts.after.json has no part "mirror"'], 'the plan faults follow the completeness faults (readRun)');
    const text = fs.readFileSync(path.join(root, d.draft), 'utf8');
    assert.match(text, /^INCOMPLETE Record, so not published/m);
    assert.ok(recordLinesOf(text).includes('part (not stated): parts.after.json is unavailable — the parts diff waits on it'), 'the diff starts from lab.json start, which the Record states; its end is the placeholder');
    assert.ok(nothingPublished(root));
});

test('a draft never lands in kb/ or site/, even when the run folder sits there', () => {
    for (const where of [['site', 'memories', 'x'], ['kb', 'GodsWorld', 'x']]) {
        const root = testTmpDir('seen-memory');
        const dir = path.join(root, ...where, 'record');
        fs.cpSync(FIXTURE, dir, { recursive: true });
        assert.throws(() => writeSeenMemory(dir, LOOK, { root, draft: true }), /a draft is written only under the run's own folder, never into kb\/ or site\//);
    }
});

test('the old seen-draft path is deleted and fails loud by name', () => {
    for (const gone of ['writeSeenDraft', 'renderSeenDraft', 'STILLS']) assert.equal(seen[gone], undefined, gone + ' is deleted (the still names are the Record owner\'s STILLS)');
    const { root } = scratch();
    const old = path.join(root, 'mmp41d.record.json');
    fs.writeFileSync(old, '{}');
    assert.throws(() => readRun(old), /writeSeenDraft and its <run>\.record\.json are deleted; pass the run's Record folder/);
    assert.throws(() => readRun(path.join(root, 'minimaxi', 'out', 'mmp41d', 'record', HB)), /is not a run's Record folder/);
    assert.deepEqual(recordLines(readRecordFolder(path.join(FIXTURE, HB))), [CHANGE_PREFIX + 'tick 2135 · setDeclared (maxi) mirror: {"orientationDeg":45} → {"orientationDeg":30}', CHANGE_PREFIX + 'tick 8378 · move (maxi) mirror: rect [360, 80, 20, 240] → rect [290, 80, 20, 240]',
        'part mirror: ["Wall",{"rect":[360,80,20,240],"collisionBehavior":"bounce","bounceDirection":"reflect","orientationDeg":45,"color":[255,120,0],"hooks":["recolor"]}] → ["Wall",{"rect":[290,80,20,240],"collisionBehavior":"bounce","bounceDirection":"reflect","orientationDeg":30,"color":[255,120,0],"hooks":["recolor"]}]']);
});

test('the memory id is one rule: the run loses a leading mm- or mm, every word is lowercase, never an empty word or a double dash', () => {
    const { memoryId, MEMORY_ID } = seen;
    assert.equal(memoryId('cl1a-mirror', 'mm-r11a'), 'mm-cl1a-mirror-r11a', 'the trial mm-r11a (its id was mm-cl1a-mirror--r11a before this rule)');
    assert.equal(memoryId('cl1a-mirror', 'mmr11a'), 'mm-cl1a-mirror-r11a', 'mm and mm- give one id');
    assert.equal(memoryId('cl1a-mirror', 'mmp41d'), ID, 'the fixture keeps its id');
    assert.equal(memoryId('1A · Mirror', 'MM-R11A'), 'mm-1a-mirror-r11a');
    assert.equal(memoryId('cl1a-mirror', 'mm--x'), 'mm-cl1a-mirror-x');
    for (const [scene, run] of [['cl1a-mirror', 'mm'], ['cl1a-mirror', 'mm-'], ['cl1a-mirror', ''], ['cl1a-mirror', undefined], ['', 'r1'], ['---', 'r1'], [undefined, 'r1']]) {
        assert.throws(() => memoryId(scene, run), /make no memory id: the (scene|run without its leading mm- or mm) leaves no word/, JSON.stringify([scene, run]) + ' is refused by name');
    }
    for (const bad of ['mm-cl1a-mirror--r11a', 'mm-cl1a-mirror-', 'mm--x', 'mm-', 'mm']) assert.ok(!MEMORY_ID.test(bad), bad + ' is not an id');
    const { root, dir } = scratch(null, 'mm-r11a');
    assert.equal(readRun(dir).id, ID, 'a run folder named mm-r11a holding run mmp41d is read by its lab.json run');
    fs.rmSync(root, { recursive: true, force: true });
});

test('several looks write one looked line each, in order, each citing the clip it looked at; a clip outside the Record is refused', () => {
    const SEAT = { by: 'seat', who: 'maxi-memory-curator', stills: 6, account: 'the 30-degree slab, reflection up-left', clip: 'clip-01.mp4' };
    const { root, dir } = scratch();
    const out = writeSeenMemory(dir, [seen.owlLook(readRun(dir), 8), SEAT], { root });
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    assert.deepEqual(seen.parseLooked(md).map((k) => [k.by, k.who, k.clip]), [['local-owl', 'maxi-owl', 'memories/' + ID + '/clip-02.mp4'], ['seat', 'maxi-memory-curator', 'memories/' + ID + '/clip-01.mp4']]);
    assert.deepEqual(lookedFaults(md, ID, path.join(root, 'site')), []);
    const again = scratch();
    assert.throws(() => writeSeenMemory(again.dir, [LOOK, Object.assign({}, LOOK, { clip: 'clip-09.mp4' })], { root: again.root }), /a look at "clip-09\.mp4", which is not one of the Record's clips/);
    assert.throws(() => writeSeenMemory(again.dir, [], { root: again.root }), /no look/);
    assert.ok(nothingPublished(again.root));
});

test('the CLI: each --looked-by opens a look; --stills, --account and --clip belong to the look before them', () => {
    const a = seen.parseCliArgs(['out/x/record', '--looked-by', 'local-owl:maxi-owl', '--stills', '8', '--account', 'owl words', '--looked-by', 'seat:maxi-memory-curator', '--stills', '17', '--account', 'my words', '--clip', 'clip-01.mp4']);
    assert.deepEqual(a, { dir: 'out/x/record', draft: false, looks: [{ by: 'local-owl', who: 'maxi-owl', stills: 8, account: 'owl words' }, { by: 'seat', who: 'maxi-memory-curator', stills: 17, account: 'my words', clip: 'clip-01.mp4' }] });
    assert.deepEqual(seen.parseCliArgs(['d', '--looked-by', 'human:lab-owner', '--stills', '3', '--account', 'x', '--draft']).looks.length, 1, 'the one-look command the loop prints still parses');
    assert.throws(() => seen.parseCliArgs(['d', '--stills', '3', '--looked-by', 'human:lab-owner', '--account', 'x']), /--stills before any --looked-by/);
    assert.throws(() => seen.parseCliArgs(['d', '--looked-by', 'human:lab-owner', '--stills', '3', '--stills', '4', '--account', 'x']), /--stills twice in one look/);
    assert.throws(() => seen.parseCliArgs(['d', '--looked-by', 'human:lab-owner', '--stills', '3', '--account', 'x', '--looked-by', 'platform:mm-owl']), /platform brain/);
    assert.throws(() => seen.parseCliArgs(['d']), /--looked-by is required/);
});

test('the local Owl\'s look has one builder (owlLook, from the Record\'s own words); a hand-typed local-owl account is refused by name', () => {
    const { root, dir } = scratch();
    assert.equal(readJson(path.join(FIXTURE, HB, FILES.lab)).brain, 'local', 'the fixture is a local-brain run');
    const run = readRun(dir);
    const look = seen.owlLook(run, 6, { answeredBy: 'maxi-brain-runner' });
    assert.equal(look.account, 'answered by the maxi-brain-runner agent; answer memories/' + ID + '/turns/08-owl.answer.md; ' + Object.keys(run.lab.owl.seen).map((k) => k + ': ' + run.lab.owl.seen[k].replace(/\s+/g, ' ').trim()).join('; '));
    assert.match(seen.owlLook(run, 6, { draft: true }).account, /^turn file minimaxi\/out\/turns\/mmp41d\/08-owl\.md; contact: /, 'a draft cites the run\'s own turn path');
    const typed = { by: 'local-owl', who: 'maxi-owl', stills: 6, account: 'turn file x; contact: the slab; after: up; passes: no' };
    assert.throws(() => writeSeenMemory(dir, typed, { root }), /a local-owl look whose account is not owlLook\(run, stills\)'s/);
    assert.throws(() => seen.owlLook(run, 6, { answeredBy: 'Ada' }), /named by a role/);
    assert.ok(nothingPublished(root));
    const plat = scratch((hb) => { const l = readJson(path.join(hb, FILES.lab)); l.brain = 'platform'; writeJson(path.join(hb, FILES.lab), l); });
    assert.throws(() => seen.owlLook(readRun(plat.dir), 6), /only a local-brain run has a local Owl/);
    assert.deepEqual(seen.parseCliArgs(['d', '--owl-look', '8', '--answered-by', 'maxi-brain-runner', '--looked-by', 'seat:maxi-memory-curator', '--stills', '3', '--account', 'x']).looks,
        [{ owl: true, stills: 8, answeredBy: 'maxi-brain-runner' }, { by: 'seat', who: 'maxi-memory-curator', stills: 3, account: 'x' }]);
    assert.throws(() => seen.parseCliArgs(['d', '--owl-look', '8', '--account', 'typed']), /does not belong to an --owl-look/);
    assert.throws(() => seen.parseCliArgs(['d', '--looked-by', 'seat:maxi-memory-curator', '--stills', '3', '--account', 'x', '--answered-by', 'maxi-brain-runner']), /belongs only to an --owl-look/);
});

test('a published Record memory serves the roles\' answers and cites them there (never the loop\'s prompts); it says it is a Record memory, never DRAFT; a draft says DRAFT and cites the run\'s paths', () => {
    const { root, dir } = scratch();
    const out = writeSeenMemory(dir, LOOK, { root });
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    assert.ok(md.includes(seen.PUBLISHED_CLAUSE) && !md.includes(seen.DRAFT_CLAUSE));
    const threads = md.split('\n').find((l) => l.startsWith('Threads: '));
    assert.ok(threads.includes('owl local memories/' + ID + '/turns/08-owl.answer.md') && !threads.includes('minimaxi/out'), threads);
    const site = path.join(root, 'site');
    seen.citedUnder(md, ID).forEach((rel) => assert.ok(fs.existsSync(path.join(site, 'memories', ID, rel)), rel + ' is served'));
    assert.ok(seen.citedUnder(md, ID).includes('turns/08-owl.answer.md'));
    assert.deepEqual(fs.readdirSync(path.join(site, 'memories', ID, 'turns')).filter((n) => !n.endsWith(seen.ANSWER_SUFFIX)), [], 'only the answers are served, never a prompt turn');
    // the gate: a DRAFT clause in a published memory, and a cited path the served folder lacks, are red
    assert.match(publishedRecordFaults(md.replace(seen.PUBLISHED_CLAUSE, seen.DRAFT_CLAUSE), ID, site).join('\n'), /never `DRAFT: not in the roster\.`/);
    fs.rmSync(path.join(site, 'memories', ID, 'turns', '08-owl.answer.md'));
    assert.match(publishedRecordFaults(md, ID, site).join('\n'), /cites memories\/mm-cl1a-mirror-p41d\/turns\/08-owl\.answer\.md, which its served Record folder does not hold/);
    // a missing turn file refuses the publish by name
    const gone = scratch();
    fs.rmSync(path.join(gone.root, 'minimaxi', 'out', 'turns', 'mmp41d', '08-owl.answer.md'));
    assert.throws(() => writeSeenMemory(gone.dir, LOOK, { root: gone.root }), /threads name turns whose answers are not there \(minimaxi\/out\/turns\/mmp41d\/08-owl\.answer\.md/);
    assert.ok(nothingPublished(gone.root));
    // the draft
    const d = scratch();
    const dr = writeSeenMemory(d.dir, LOOK, { root: d.root, draft: true });
    const dt = fs.readFileSync(path.join(d.root, dr.draft), 'utf8');
    assert.ok(dt.includes(seen.DRAFT_CLAUSE) && !dt.includes(seen.PUBLISHED_CLAUSE) && dt.includes('owl local minimaxi/out/turns/mmp41d/08-owl.md'));
});

test('the INDEX section of Record memories has one owner (recordIndexSection): one row per published Record memory, its outline from the served lab.json', () => {
    const { root, dir } = scratch();
    const mem = path.join(root, 'kb', 'GodsWorld', 'memories'), site = path.join(root, 'site');
    assert.match(seen.recordIndexSection(mem, site), /\| \(none yet\) \|/);
    writeSeenMemory(dir, LOOK, { root });
    fs.writeFileSync(path.join(mem, 'plain-seen.md'), 'No recording watched yet: there is no clip.\n');
    const sec = seen.recordIndexSection(mem, site);
    const lab = readJson(path.join(FIXTURE, HB, FILES.lab));
    assert.ok(sec.startsWith(seen.RECORD_INDEX_HEADING + '\n'));
    assert.deepEqual(sec.split('\n').filter((l) => l.startsWith('| mm-')), ['| ' + ID + ' | cl1a-mirror | ' + lab.outline.replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|') + ' | ' + ID + '-seen.md | memories/' + ID + '/clip-02.mp4 |']);
});

test('a local-owl account is owlLook\'s exactly: a hand-typed prefix or suffix around the real account is refused by name; answered-by takes only a role', () => {
    const { root, dir } = scratch();
    const run = readRun(dir);
    const real = seen.owlLook(run, 8).account;
    const refuse = (account, why) => assert.throws(() => writeSeenMemory(dir, { by: 'local-owl', who: 'maxi-owl', stills: 8, account }, { root }), /a local-owl look whose account is not owlLook\(run, stills\)'s/, why);
    refuse('I typed this myself and the photons gain momentum; ' + real, 'a typed prefix (the verifier\'s plant)');
    refuse(real + '; and I typed this', 'a typed suffix');
    refuse('answered by the AdaL agent; ' + real, 'answered-by with a name that is not a role token');
    refuse('answered by the maxi-brain-runner agent; x; ' + real, 'answered-by and then typed words');
    assert.ok(nothingPublished(root));
    assert.equal(writeSeenMemory(dir, seen.owlLook(run, 8, { answeredBy: 'maxi-brain-runner' }), { root }).complete, true, 'owlLook\'s own account, with answered-by, passes');
});

test('the published text is held whole: re-rendered from the served Record and its looked lines, so a hand edit of any generated line is red; a human or seat account is the looker\'s own words', () => {
    const { root, dir } = scratch();
    const run = readRun(dir);
    const SEAT = { by: 'seat', who: 'maxi-memory-curator', stills: 6, account: 'the slab, reflection up-left', clip: 'clip-01.mp4' };
    const out = writeSeenMemory(dir, [seen.owlLook(run, 8, { answeredBy: 'maxi-brain-runner' }), SEAT], { root });
    const site = path.join(root, 'site');
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    assert.deepEqual(publishedRecordFaults(md, ID, site), [], 'the generated memory re-renders byte for byte');
    const owlLine = md.split('\n').find((l) => l.startsWith('looked: local-owl '));
    const owlWords = md.split('\n').find((l) => l.startsWith('Seen, the Owl\'s words on the hand-back clip '));
    const red = {
        'the Owl\'s looked line, a word changed': md.replace(owlLine, owlLine.replace('contact: ', 'contact: plainly ')),
        'the Owl\'s looked line, a typed prefix': md.replace(owlLine, owlLine.replace('— answered by', '— I typed this; answered by')),
        'the "Seen, the Owl\'s words" line': md.replace(owlWords, owlWords + ' The photons gain momentum.'),
        'the Builder\'s words': md.replace('Seen, the Builder\'s words on the hand-back clip ' + seen.clipCite('memories/' + ID + '/clip-02.mp4') + ': ', 'Seen, the Builder\'s words on the hand-back clip ' + seen.clipCite('memories/' + ID + '/clip-02.mp4') + ': Clearly, '),
        'the Threads line': md.replace(/^Threads: .*$/m, 'Threads: none.'),
        'the header': md.replace('A fresh Maxi thread has not watched it yet.', 'Maxi watched it.'),
        'a line added': md + 'An extra line.\n'
    };
    for (const [why, text] of Object.entries(red)) assert.ok(publishedRecordFaults(text, ID, site).length > 0, 'must be red: ' + why);
    const seatLine = md.split('\n').find((l) => l.startsWith('looked: seat '));
    assert.deepEqual(publishedRecordFaults(md.replace(seatLine, seatLine.replace('the slab, reflection up-left', 'the slab and the stream up-left')), ID, site), [], 'a seat\'s account is the looker\'s own words: carried by its line, not by the Record');
});

/** Load a planted gen-memories-seen.mjs (its relative imports pinned to this checkout) from a temp dir: the module, and dispose(). */
async function plantedGenerator(src) {
    const dir = testTmpDir('seen-plant');
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const pinned = src.replace(/from '\.\.\/(site|minimaxi)\//g, (m, d) => "from '" + pathToFileURL(path.join(repo, d)).href + '/');
    fs.writeFileSync(path.join(dir, 'gen-memories-seen.mjs'), pinned);
    const m = await import(pathToFileURL(path.join(dir, 'gen-memories-seen.mjs')).href);
    return { m, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** The human's words as typed, a line that would read as a Record line unquoted included. */
const TEACHING = 'Light leaves the mirror at the angle it arrives.\nchange: none of this is a Record line\n  Watch the beam when I turn it.';

/** Publish the fixture with lab.json `teaching` through generator `g`; THROWS when the memory does not state the words verbatim. */
function assertTeachingRendered(g) {
    const { root, dir } = scratch((hb) => { const f = path.join(hb, FILES.lab); writeJson(f, Object.assign(readJson(f), { [TEACHING_KEY]: TEACHING })); });
    const out = g.writeSeenMemory(dir, LOOK, { root });
    assert.deepEqual([out.complete, out.faults], [true, []], 'a Record carrying the human\'s words is complete and published');
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    assert.equal(seen.teachingOfText(md), TEACHING, 'the memory states the human\'s teaching note, verbatim');
    assert.ok(md.includes('\n' + seen.TEACHING_HEADING + '\n' + TEACHING.split('\n').map((l) => seen.TEACHING_QUOTE + l).join('\n') + '\n'), 'every line quoted under the heading');
    return { root, md };
}

test('the human\'s teaching note (lab.json TEACHING_KEY) is rendered in the seen memory verbatim, each line quoted so none reads as a Record line; absent words write no note; a memory with the note dropped is red (negative control: a generator that drops it is red)', async () => {
    const { root, md } = assertTeachingRendered(seen);
    const site = path.join(root, 'site');
    assert.deepEqual(publishedRecordFaults(md, ID, site), [], 'the published memory with its note re-renders byte for byte');
    assert.deepEqual(recordLinesOf(md).filter((l) => l.includes('none of this')), [], 'a line of the human\'s words never reads as a change: line');
    const dropped = md.replace('\n' + seen.TEACHING_HEADING + '\n' + TEACHING.split('\n').map((l) => seen.TEACHING_QUOTE + l).join('\n'), '');
    assert.notEqual(dropped, md);
    assert.match(publishedRecordFaults(dropped, ID, site).join('\n'), /is not the text the generator renders from its served Record/, 'the note dropped from a published memory is RED');
    assert.match(publishedRecordFaults(md.replace('arrives.', 'arrives, roughly.'), ID, site).join('\n'), /is not the text the generator renders/, 'the words edited in a published memory are RED');
    // no words: no note
    const plain = scratch();
    const outPlain = writeSeenMemory(plain.dir, LOOK, { root: plain.root });
    const mdPlain = fs.readFileSync(path.join(plain.root, outPlain.memory), 'utf8');
    assert.deepEqual([seen.teachingOfText(mdPlain), mdPlain.includes(seen.TEACHING_HEADING)], [null, false], 'a Record without words writes no teaching note');
    // the negative control: the generator with its teaching lines planted out
    const src = fs.readFileSync(fileURLToPath(new URL('../gen-memories-seen.mjs', import.meta.url)), 'utf8');
    const RIDES = '], recordLines(run.files), teachingLines(lab), [';
    assert.equal(src.split(RIDES).length, 2, 'the plant target moved — the control would measure nothing');
    const p = await plantedGenerator(src.replace(RIDES, '], recordLines(run.files), ['));
    try { assert.throws(() => assertTeachingRendered(p.m), /the memory states the human's teaching note, verbatim/, 'a generator that drops the note is RED'); } finally { p.dispose(); }
});

test('what the Record carried from before the round (lab.json carried) is rendered under its own heading, never as a change line; the published text holds it whole; a carried row is not the plan\'s (negative control: the carried line dropped is red)', () => {
    // a one-world run: the fixture's hand-back Record as the chain's only Record, carrying its first clip (filmed before the round took the outline)
    const root = testTmpDir('seen-carried');
    fs.mkdirSync(path.join(root, 'kb', 'GodsWorld', 'memories'), { recursive: true });
    fs.mkdirSync(path.join(root, 'site', 'memories'), { recursive: true });
    const dir = path.join(root, 'minimaxi', 'out', 'mmp41d', 'record');
    fs.cpSync(path.join(FIXTURE, HB), path.join(dir, 'record-01'), { recursive: true });
    fs.cpSync(FIXTURE_TURNS, path.join(root, 'minimaxi', 'out', 'turns', 'mmp41d'), { recursive: true });
    const labFile = path.join(dir, 'record-01', FILES.lab);
    const lab = readJson(labFile);
    Object.assign(lab, { chain: { index: 1, records: ['record-01'] }, handBack: { record: 'record-01', clip: 'clip-02.mp4' }, [CARRIED_KEY]: { changes: [], clips: [lab.filmed[0]] } });
    writeJson(labFile, lab);
    const out = writeSeenMemory(dir, LOOK, { root });
    assert.deepEqual([out.complete, out.faults], [true, []]);
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    const at = md.split('\n').indexOf(seen.CARRIED_HEADING);
    assert.ok(at !== -1, 'the carried heading is in the memory');
    assert.equal(md.split('\n')[at + 1], seen.CARRIED_PREFIX + 'clip: memories/' + ID + '/clip-01.mp4 (see, ticks 4266–4516)');
    assert.deepEqual(recordLinesOf(md).filter((l) => l.includes('earlier')), [], 'a carried line never reads as a change: or part: line');
    assert.deepEqual(publishedRecordFaults(md, ID, path.join(root, 'site')), [], 'the published text, carried included, re-renders byte for byte');
    assert.match(publishedRecordFaults(md.replace(seen.CARRIED_PREFIX + 'clip:', seen.CARRIED_PREFIX + 'klip:'), ID, path.join(root, 'site')).join('\n'), /is not the text the generator renders/, 'a hand edit of the carried line is red');
    assert.deepEqual(seen.carriedLines({}), [], 'nothing carried: no heading');
    // a carried row is set aside from the plan: the producer began AFTER the fixture's setDeclared row, so its start already
    // holds the plan's orientationDeg and start → end does not make that change
    const files = readRecordFolder(path.join(FIXTURE, HB));
    const l2 = JSON.parse(files[FILES.lab]);
    const rows = JSON.parse(files[FILES.record]).changes;
    l2[START_KEY].mirror[1].orientationDeg = rows[0].to.orientationDeg;   // where the producer began: the carried row already made
    const carriedPlan = recordPlanFaults(l2.plan, [Object.assign({}, files, { [FILES.lab]: JSON.stringify(Object.assign(l2, { [CARRIED_KEY]: { changes: [rows[0]], clips: [] } })) })]);
    assert.ok(carriedPlan.includes('plan changes[0] (mirror orientationDeg: 30): the start (lab.json start) already holds "mirror" orientationDeg at 30 — start → end does not make this change'), 'the carried row is not the plan\'s: ' + carriedPlan.join(' | '));
    fs.rmSync(root, { recursive: true, force: true });
});

/** Publish, through generator `g`, a one-world copy of the fixture's hand-back Record that CARRIED its first row and first clip
 *  (made before the round took the outline; the plan keeps only the round's own move); THROWS unless the carried row's change:
 *  line carries the mark and the round's own row does not. Returns {root, md, rows}. */
function assertCarriedRowMarked(g) {
    const root = testTmpDir('seen-carried-row');
    fs.mkdirSync(path.join(root, 'kb', 'GodsWorld', 'memories'), { recursive: true });
    fs.mkdirSync(path.join(root, 'site', 'memories'), { recursive: true });
    const dir = path.join(root, 'minimaxi', 'out', 'mmp41d', 'record');
    fs.cpSync(path.join(FIXTURE, HB), path.join(dir, 'record-01'), { recursive: true });
    fs.cpSync(FIXTURE_TURNS, path.join(root, 'minimaxi', 'out', 'turns', 'mmp41d'), { recursive: true });
    const labFile = path.join(dir, 'record-01', FILES.lab);
    const lab = readJson(labFile);
    const rows = readJson(path.join(dir, 'record-01', FILES.record)).changes;
    lab.plan.changes = lab.plan.changes.filter((c) => c.param !== 'orientationDeg');   // the carried setDeclared is not the round's
    lab[START_KEY].mirror[1].orientationDeg = rows[0].to.orientationDeg;               // the producer began after it (THE START)
    Object.assign(lab, { chain: { index: 1, records: ['record-01'] }, handBack: { record: 'record-01', clip: 'clip-02.mp4' }, [CARRIED_KEY]: { changes: [rows[0]], clips: [lab.filmed[0]] } });
    writeJson(labFile, lab);
    const out = g.writeSeenMemory(dir, LOOK, { root });
    assert.deepEqual([out.complete, out.faults], [true, []], 'the one-world carried copy is a complete Record');
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    const changes = recordLinesOf(md).filter((l) => l.startsWith(CHANGE_PREFIX));
    assert.deepEqual(changes, [CHANGE_PREFIX + seen.CARRIED_MARK + changeText(rows[0]), CHANGE_PREFIX + changeText(rows[1])],
        'the memory marks the carried row on its own change: line, and only that row');
    return { root, md, rows };
}

test('a carried row is marked on its own change: line, so the Changes section alone says it is not the round\'s act; the published text holds the mark (negative controls: the mark hand-removed is red; a generator that drops it is red)', async () => {
    const { root, md, rows } = assertCarriedRowMarked(seen);
    const site = path.join(root, 'site');
    assert.deepEqual(publishedRecordFaults(md, ID, site), [], 'the published memory with its marked row re-renders byte for byte');
    assert.match(publishedRecordFaults(md.replace(CHANGE_PREFIX + seen.CARRIED_MARK, CHANGE_PREFIX), ID, site).join('\n'), /its Record lines are not the ones its served Record states/, 'the mark hand-removed from a published memory is RED');
    assert.deepEqual(recordLines(readRecordFolder(path.join(FIXTURE, HB))).filter((l) => l.includes(seen.CARRIED_MARK)), [], 'a Record that carried nothing marks no row');
    assert.ok(rows.length === 2);
    fs.rmSync(root, { recursive: true, force: true });
    const src = fs.readFileSync(fileURLToPath(new URL('../gen-memories-seen.mjs', import.meta.url)), 'utf8');
    const MARKS = "(i < carried ? CARRIED_MARK : '')";
    assert.equal(src.split(MARKS).length, 2, 'the plant target moved — the control would measure nothing');
    const p = await plantedGenerator(src.replace(MARKS, "''"));
    try { assert.throws(() => assertCarriedRowMarked(p.m), /marks the carried row on its own change: line/, 'a generator that drops the mark is RED'); } finally { p.dispose(); }
});

/** Publish the fixture as an approve in round 2 (its first see and its dragTo carrying the Builder's notes) through generator `g`;
 *  THROWS when the memory does not say the Record is the approving round only and give the Builder's note on each hand. */
function assertRoundsRendered(g) {
    const { root, dir } = scratch((hb) => {
        const f = path.join(hb, FILES.lab), lab = readJson(f);
        lab.steps[0].args.note = 'Baseline, from the world round 1 left.';
        lab.steps[4].args.note = 'RE-STAGING: not the plan\'s change.\nchange: none of this is a Record line';
        writeJson(f, Object.assign(lab, { rounds: 2 }));
    });
    const out = g.writeSeenMemory(dir, LOOK, { root });
    const md = fs.readFileSync(path.join(root, out.memory), 'utf8');
    assert.ok(md.includes('\n' + seen.ROUNDS_PREFIX + '2. The Owl approved round 2, and this Record is that round only'), 'the memory says the Record is the approving round only');
    assert.ok(md.includes('opened on the world round 1 left, with round 1\'s acts already in it. So parts.before.json is that world'), 'the memory says the round opened on the world round 1 left');
    assert.ok(md.includes('\n' + seen.HAND_NOTE_PREFIX + '1 see: Baseline, from the world round 1 left.\n'), 'the Builder\'s note on the first hand, verbatim');
    assert.ok(md.includes('\n' + seen.HAND_NOTE_PREFIX + '2 openSketch: (no note)\n'), 'a hand without a note says so');
    assert.ok(md.includes('\n' + seen.HAND_NOTE_PREFIX + '5 dragTo: RE-STAGING: not the plan\'s change. change: none of this is a Record line\n'), 'the Builder\'s note on the re-staging hand, on one line');
    return { root, md };
}

test('an approve after round 1 says the Record is the approving round only, opened on the world the round before left, and gives the Builder\'s note on each hand; a round-1 approve says nothing of rounds (negative controls: the paragraph hand-removed is red; a generator that drops it is red)', async () => {
    const { root, md } = assertRoundsRendered(seen);
    const site = path.join(root, 'site');
    assert.deepEqual(publishedRecordFaults(md, ID, site), [], 'the published memory with its rounds lines re-renders byte for byte');
    assert.deepEqual(recordLinesOf(md).filter((l) => l.includes('none of this')), [], 'a Builder\'s note never reads as a change: line');
    const roundsLine = md.split('\n').find((l) => l.startsWith(seen.ROUNDS_PREFIX));
    assert.match(publishedRecordFaults(md.replace(roundsLine + '\n', ''), ID, site).join('\n'), /is not the text the generator renders/, 'the rounds paragraph dropped from a published memory is RED');
    assert.match(publishedRecordFaults(md.replace('RE-STAGING: not', 'THE PLAN\'S CHANGE: not'), ID, site).join('\n'), /is not the text the generator renders/, 'a Builder\'s note edited in a published memory is RED');
    const plain = scratch();
    const mdPlain = fs.readFileSync(path.join(plain.root, writeSeenMemory(plain.dir, LOOK, { root: plain.root }).memory), 'utf8');
    assert.ok(!mdPlain.includes(seen.ROUNDS_PREFIX) && !mdPlain.includes('\n' + seen.HAND_NOTE_PREFIX), 'a round-1 approve writes no rounds lines');
    const src = fs.readFileSync(fileURLToPath(new URL('../gen-memories-seen.mjs', import.meta.url)), 'utf8');
    const RIDES = 'head.concat(looked, roundsLines(lab), [';
    assert.equal(src.split(RIDES).length, 2, 'the plant target moved — the control would measure nothing');
    const p = await plantedGenerator(src.replace(RIDES, 'head.concat(looked, ['));
    try { assert.throws(() => assertRoundsRendered(p.m), /the memory says the Record is the approving round only/, 'a generator that drops the rounds lines is RED'); } finally { p.dispose(); }
});

/** Publish the fixture through generator `g`; THROWS unless the Builder's prediction and words and the Owl's words each cite the hand-back clip. */
function assertRoleWordsCiteTheClip(g) {
    const { root, dir } = scratch();
    const md = fs.readFileSync(path.join(root, g.writeSeenMemory(dir, LOOK, { root }).memory), 'utf8');
    const cite = seen.clipCite('memories/' + ID + '/clip-02.mp4');
    for (const opening of ['Prediction stated before the hand-back clip ' + cite + ' was filmed (the Builder): ', 'Seen, the Builder\'s words on the hand-back clip ' + cite + ': ', 'Seen, the Owl\'s words on the hand-back clip ' + cite + ': ']) {
        assert.ok(md.split('\n').some((l) => l.startsWith(opening)), 'the role\'s words cite the hand-back clip they were said about: ' + opening);
    }
    return md;
}

test('the roles\' words on the clip cite it by the [clip …] marker, so a role\'s verbatim "measured" names the served clip it was read off (negative control: a generator without the marker is red)', async () => {
    assertRoleWordsCiteTheClip(seen);
    const src = fs.readFileSync(fileURLToPath(new URL('../gen-memories-seen.mjs', import.meta.url)), 'utf8');
    const CITE = 'const hbCite = clipCite(media + run.handBack.clip);';
    assert.equal(src.split(CITE).length, 2, 'the plant target moved — the control would measure nothing');
    const p = await plantedGenerator(src.replace(CITE, 'const hbCite = \'\';'));
    try { assert.throws(() => assertRoleWordsCiteTheClip(p.m), /cite the hand-back clip they were said about/, 'a generator that drops the marker is RED'); } finally { p.dispose(); }
});
