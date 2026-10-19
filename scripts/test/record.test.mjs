/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * record.test.mjs — the human's Record button.
 *
 * The Record itself is the package's (the world's exp.startRecord(), held by the lab: maxi-lab.js THE WORLD'S RECORD); the
 * recorder films its segments into it and assembles the chain the lab hands back. Here the lab is a stand-in over that
 * contract (recordLab: beginChain / endChain / abandonChain / chainState, each world's Record keeping the clips its scene
 * noted and the rows its acts wrote, closed by the package's own writer).
 *
 * Gates:
 *   1. the recorder keeps no change log of its own — the rows are the Record's (a planted tick-listener logger is red);
 *   2. a Record with zero changes still carries its clip; it is the package's folder plus lab.json, COMPLETE; a chain with no
 *      Record is refused by name;
 *   3. the toolbar declares Record (app.html #btn-record), the lab wires R, the segment is the band's maximum of frames;
 *   4. Stop on a paused world REFUSES by name and keeps recording (also when paused mid-finish);
 *   5. a scene change finishes the rolling segment and the lab closes the world's Record into the chain; filming resumes in
 *      the next world: two Records chained (a resume that films nothing planted in is red); dispose() is deleted; a paused
 *      world refuses the change by name; the lab's order (refusal, hand, segment, Record) is held in its source;
 *   6. a carry the hand drops as the world changes is written before the segment ends, so its row lies in the footage
 *      (the order reversed loses it to `unheld`);
 *   7. rows a closing Record's footage does not show are named at Stop (lab.json unheld, the question's note), never lost;
 *   8. Stop holds the demonstration for the card's Send to Maxi (#demo: textarea + button): Send is ONE question carrying
 *      the clip and the human's words (none = as before), which the hand-back lab.json keeps as `teaching`; a refusal keeps
 *      it waiting; the card's prompt is never the words; a send that drops them is RED;
 *   9. one hand-off: a second Send while the question is open is refused; Record while a demonstration waits is refused
 *      until Send or the card's × discards it by name (each guard planted out is RED).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { recordsOf, segmentTicks, recordKeyAction, RECORD_KEYS, attachRecorder, SEGMENT_HAND, demonstrationNote, demonstrationMedia } from '../../site/app-assets/maxi-record.js';
import { changesAsText, changeText, recordChainFaults, recordFolderFaults, FILES, UNHELD_KEY, MAX_SEGMENTS } from '../../site/app-assets/maxi-record-folder.js';
import { CLIP_SECONDS, RECORD_DEFAULTS } from '../../site/app-assets/maxi-hands.js';
import { manifestFor, serializeManifest } from '../../site/app-assets/frqtl-web-project.js';
import { withSketch } from './fake-runner.mjs';
import { distUrl } from '../frqtl-web-pin.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
/** The package's one writer of a Record folder (what the Record's stop() runs). */
const { serializeRecordFolder } = await import(distUrl('shim/project/record-format.js'));

const PARTS = { mirror: ['Wall', { rect: [360, 80, 20, 240] }] };
const PROJECT = { 'frqtl.json': serializeManifest(manifestFor({ name: 'mirror', entry: 'sketch.js' })), 'sketch.js': 'export const parts = {};\nexport default function buildExperiment(exp) { exp.declare(parts); }\n' };
const bytes = (s) => new TextEncoder().encode(s);

function fakeClip(first, n) {
    const frames = []; for (let i = 0; i < n; i++) { frames.push({ tick: first + i * RECORD_DEFAULTS.everyTicks }); }
    return { video: { track: { frames }, encoded: { mime: 'video/mp4', codec: 'avc1.42001f', muxer: 'mediabunny@x', bytes: 'AAAA' }, truncated: false }, first, last: frames[n - 1].tick, frames };
}

/** A running scene whose recorder settles only on abort — `abortWith` decides how (a clip from `start` to now, or a codec rejection). */
function liveScene(abortWith, label) {
    let tick = 0;
    const runner = { isRunning: true };
    const vision = {
        record: (o) => new Promise((resolve, reject) => {
            const start = tick;
            o.signal.addEventListener('abort', () => {
                if (abortWith === 'codec') { reject(new Error("Failed to execute 'flush' on 'VideoEncoder': Cannot call 'flush' on a closed codec.")); }
                else { resolve(fakeClip(start, Math.max(1, Math.floor((tick - start) / RECORD_DEFAULTS.everyTicks) + 1)).video); }
            }, { once: true });
        })
    };
    const sc = withSketch({ label: label || '1A · Mirror', id: 'cl1a-mirror', mode: null, renderer: 'p5', runner, tick: () => tick, win: { MaxiScene: { FrqtlVision: { attach: () => vision } } } });
    sc.record = { rows: [] };
    return { sc, runner, setTick: (t) => { tick = t; } };
}

/**
 * The lab's world Record over fake scenes (the contract maxi-lab.js holds): each scene's Record keeps the clips its scene noted
 * (sc.filmed) and the rows its acts wrote (sc.record.rows); closing it runs the package's writer, and a refusal (rows after the
 * last clip) gives the rows to the chain's `unheld`. `act(row)` is an act's row in the current world.
 */
function recordLab(first, ask) {
    const L = { cur: first, chain: null, sent: [] };
    function close(sc, into) {
        const clips = sc.filmed.map((f, i) => ({ bytes: bytes('clip-' + sc.label + '-' + i), firstTick: f.span.first, lastTick: f.span.last }));
        let out;
        try { out = serializeRecordFolder({ changes: sc.record.rows, clips: clips, partsBefore: PARTS, partsAfter: PARTS, project: PROJECT }); }
        catch (e) { if (into) { into.unheld.push.apply(into.unheld, sc.record.rows); } return { refused: e.message }; }
        const filmed = sc.filmed.map((f) => f.hand);
        sc.record = { rows: [] }; sc.filmed.length = 0;
        if (!out.empty && into) { into.worlds.push({ folder: out, filmed: filmed, carried: 0, scene: { label: sc.label, id: sc.id, mode: sc.mode, renderer: sc.renderer } }); }
        return out;
    }
    L.lab = {
        scene: () => L.cur.sc,
        ask: ask || (async (op, q) => { L.sent.push(q); return { asked: true, interaction_id: 'thread-1', answer_excerpt: 'seen' }; }),
        beginChain: async (producer) => { if (L.chain) { throw new Error(producer + ': the ' + L.chain.producer + ' is recording now'); } close(L.cur.sc, null); L.chain = { producer, worlds: [], unheld: [] }; },
        endChain: async () => { const ch = L.chain; close(L.cur.sc, ch); L.chain = null; return { producer: ch.producer, worlds: ch.worlds, unheld: ch.unheld }; },
        abandonChain: () => { L.chain = null; },
        chainState: () => (L.chain ? { records: L.chain.worlds.length + 1, rows: L.chain.worlds.reduce((n, w) => n + w.folder.record.changes.length, 0) + L.cur.sc.record.rows.length } : { records: 0, rows: 0 })
    };
    L.act = (row) => { L.cur.sc.record.rows.push(Object.assign({ tick: L.cur.sc.tick() }, row)); };
    /** The lab's scene change: the segment finished, the world's Record closed into the chain, the swap, filming resumed. */
    L.change = async (rec, next) => { rec.assertCanFinish(); await rec.finishSegment(); close(L.cur.sc, L.chain); L.cur = next; return rec.resumeFilming(); };
    return L;
}
const ROW = (x0, x1, by) => ({ name: 'mirror', op: 'move', by: by || 'human', from: { rect: [x0, 80, 20, 240] }, to: { rect: [x1, 80, 20, 240] } });

/** The no-own-log check: the recorder takes no change notices and writes no row; its counts are the lab's (chainState). */
export function assertNoOwnLog(src) {
    assert.ok(!/addTickListener\s*\(/.test(src), 'maxi-record.js polls the runner per tick — a logger of its own');
    assert.ok(!/updateObjectProperty\s*\(|placeDeclaredAt\s*\(/.test(src), 'maxi-record.js writes positions itself — a second write path');
    assert.ok(!/\bonWrite\b|changes\.push\s*\(/.test(src), 'maxi-record.js keeps a change log of its own — the rows are the Record\'s');
    assert.ok(/lab\.chainState\(\)/.test(src), 'maxi-record.js counts the rows through the lab (chainState), the Record\'s own');
}

test('the recorder keeps no change log of its own: the rows are the world\'s Record\'s (negative control: a tick-listener logger is red)', () => {
    const src = read('site/app-assets/maxi-record.js');
    assertNoOwnLog(src);
    const second = src.replace('st.on = true;', "st.on = true;\n            sc.runner.addTickListener(function () { st.changes.push({ tick: sc.tick(), name: '?', op: 'poll' }); });");
    assert.notEqual(second, src, 'the negative control did not change the source');
    assert.throws(() => assertNoOwnLog(second), /logger of its own|change log of its own/);
});

test('a Record with zero changes still carries its clip; it is the package\'s folder plus lab.json, complete; a chain with no Record is refused', () => {
    const folder = serializeRecordFolder({ changes: [], clips: [{ bytes: bytes('c'), firstTick: 100, lastTick: 395 }], partsBefore: PARTS, partsAfter: PARTS, project: PROJECT });
    const scene = { label: '1A · Mirror', id: 'cl1a-mirror', mode: null, renderer: 'p5' };
    const [rec] = recordsOf([{ folder, filmed: [SEGMENT_HAND], scene }], null, []);
    assert.deepEqual(rec.record, { tickRange: [100, 395], clips: ['clip-01.mp4'], changes: [] });
    assert.deepEqual(rec.lab, { producer: 'record', scene, asked: null, chain: { index: 1, records: ['record-01'] }, handBack: { record: 'record-01', clip: 'clip-01.mp4' },
        filmed: [{ clip: 'clip-01.mp4', hand: 'record', firstTick: 100, lastTick: 395 }] }, 'lab.json names every segment filmed, by its hand, at the package\'s span');
    assert.deepEqual([rec.faults, rec.complete], [[], true]);
    assert.throws(() => recordsOf([], null, []), /no act happened in the worlds of the recording — nothing to record/);
    assert.ok(/tick 12 · move \(human\) mirror: rect \[1, 2, 3, 4\] → rect \[5, 2, 3, 4\]/.test(changesAsText([{ tick: 12, name: 'mirror', op: 'move', by: 'human', from: { rect: [1, 2, 3, 4] }, to: { rect: [5, 2, 3, 4] } }])));
    assert.ok(/no declared part was moved/.test(changesAsText([])));
    assert.throws(() => changesAsText([{ tick: 1, name: 'mirror', op: 'drag', by: 'human', from: null, to: { rect: [1, 2, 3, 4] } }]), /not a §6 change: op "drag" is not one of move\|setDeclared\|add\|remove\|fork/, 'a hand name is never a row, never printed as one');
});

test('the toolbar declares Record, the lab wires R, and a segment is the band\'s maximum of frames', () => {
    const html = read('site/app.html');
    assert.ok(/<button id="btn-record"[^>]*><span class="label">Record<\/span><\/button>/.test(html), 'app.html lacks #btn-record');
    assert.ok(html.includes('id="demo"') && html.includes('id="demo-clip"') && html.includes('id="demo-changes"'), 'app.html lacks the demonstration card');
    const lab = read('site/app-assets/maxi-lab.js');
    assert.ok(/import\s*\{[^}]*attachRecorder[^}]*\}\s*from\s*'\.\/maxi-record\.js'/.test(lab), 'maxi-lab.js does not import attachRecorder');
    assert.ok(lab.includes('recordKeyAction'), 'maxi-lab.js does not route R through recordKeyAction');
    assert.equal(RECORD_KEYS.toggle, 'KeyR');
    assert.equal(recordKeyAction({ code: 'KeyR', target: { tagName: 'DIV' } }), 'toggle');
    assert.equal(recordKeyAction({ code: 'KeyR', target: { tagName: 'TEXTAREA' } }), null);
    const b = segmentTicks();
    assert.deepEqual(b, { frames: CLIP_SECONDS.max * RECORD_DEFAULTS.fps, max: (CLIP_SECONDS.max * RECORD_DEFAULTS.fps - 1) * RECORD_DEFAULTS.everyTicks, min: CLIP_SECONDS.min * RECORD_DEFAULTS.fps * RECORD_DEFAULTS.everyTicks });
    assert.equal(b.frames / RECORD_DEFAULTS.fps, CLIP_SECONDS.max, 'a full segment is the band\'s maximum, never over it (the open Record refuses a clip over CLIP_SECONDS.max)');
    assert.equal(Math.floor(b.max / RECORD_DEFAULTS.everyTicks) + 1, b.frames, 'its stop tick ends it on its last frame');
});

test('attachRecorder fails loud: no lab, no chain doors, no onError, a paused world, stop without start', async () => {
    assert.throws(() => attachRecorder({ lab: {}, onError() {} }), /needs the lab/);
    const { sc, runner } = liveScene('clip');
    const L = recordLab({ sc });
    assert.throws(() => attachRecorder({ lab: { scene: L.lab.scene, ask: L.lab.ask }, onError() {} }), /needs the lab's beginChain\(\)/);
    assert.throws(() => attachRecorder({ lab: L.lab }), /onError/);
    const rec = attachRecorder({ lab: L.lab, onError() {} });
    runner.isRunning = false;
    await assert.rejects(rec.start(), /paused/);
    assert.equal(L.chain, null, 'a paused world is refused before anything closes');
    await assert.rejects(rec.stop(), /not recording/);
    assert.equal(rec.state().text, 'record off (R)');
});

test('Stop on a paused world refuses by name and keeps recording — also when paused while finishing the minimum', async () => {
    const { sc, runner, setTick } = liveScene('clip');
    const L = recordLab({ sc });
    const errors = [];
    const rec = attachRecorder({ lab: L.lab, onError: (e) => errors.push(e) });
    await rec.start();
    setTick(30);
    runner.isRunning = false;                                   // Pause
    await assert.rejects(rec.stop(), /the world is paused, so Stop cannot finish the recording — a recording samples by TICK.*0\.6 s of the 5 s minimum\. Resume, then press Stop\. Still recording\./);
    assert.equal(rec.recording, true, 'a refused Stop keeps recording');
    assert.equal(rec.state().stopping, false);
    runner.isRunning = true;                                    // paused WHILE Stop waits for the minimum: the same refusal, not a hang
    const p = rec.stop();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(rec.state().stopping, true);
    runner.isRunning = false;
    await assert.rejects(p, /the world is paused, so Stop cannot finish/);
    assert.equal(rec.recording, true);
    assert.equal(rec.state().stopping, false);
    runner.isRunning = true;                                    // resumed and past the minimum: Stop finishes; the demonstration waits for Send
    setTick(260);
    const stopped = await rec.stop();
    assert.deepEqual([stopped.length, stopped[0].lab.asked, L.sent.length, rec.state().waiting], [1, null, 0, true], 'Stop assembles the Record and asks nothing until Send');
    const recs = await rec.send('');
    assert.equal(recs.length, 1, 'one world, one Record');
    assert.equal(recs[0].record.clips.length, 1);
    assert.equal(L.sent.length, 1, 'one Record is ONE question');
    assert.equal(L.sent[0].teaching, undefined, 'an empty blurb sends no teaching words');
    assert.equal(recs[0].lab.teaching, undefined, 'an empty blurb is absent from lab.json');
    await assert.rejects(rec.send('again'), /^Error: record: no demonstration waits to be sent — press Record \(R\), demonstrate, then Stop/);
    assert.deepEqual([L.sent[0].media.length, L.sent[0].media[0].mime_type], [1, 'video/mp4']);
    assert.deepEqual(recs[0].lab.asked, { interaction_id: 'thread-1', answer_excerpt: 'seen' });
    assert.deepEqual(errors, []);
});

test('the live REC status counts the Record\'s rows (one per act, the lab\'s chainState)', async () => {
    const { sc, setTick } = liveScene('clip');
    const L = recordLab({ sc });
    const rec = attachRecorder({ lab: L.lab, onError() {} });
    await rec.start();
    L.act(ROW(360, 330));
    assert.equal(rec.state().changes, 1, 'one act, one row');
    assert.match(rec.state().text, / · 1 change$/);
    setTick(300);
    await rec.stop();
});

/** Load a planted maxi-record.js as a real module (its imports pinned to this checkout): {attachRecorder, dispose()}. */
async function plantedRecord(src) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-plant-'));
    fs.writeFileSync(path.join(dir, 'maxi-record.js'), src.replace(/from '\.\/(maxi-hands|maxi-record-folder)\.js'/g, (m, f) => "from '" + pathToFileURL(path.join(REPO, 'site/app-assets', f + '.js')).href + "'"));
    const pr = await import(pathToFileURL(path.join(dir, 'maxi-record.js')).href);
    return { attachRecorder: pr.attachRecorder, demonstrationNote: pr.demonstrationNote, dispose: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** A recording across a scene change through `m` (the real module or a planted copy): an act in world A, the lab's change, an act in B, Stop, Send. */
async function recordAcrossSceneChange(m) {
    const A = liveScene('clip'), B = liveScene('clip', 'sketch (Maxi)');
    B.sc.id = null;
    const L = recordLab(A);
    const errors = [];
    const rec = m.attachRecorder({ lab: L.lab, onError: (e) => errors.push(e) });
    await rec.start();
    A.setTick(10); L.act(ROW(360, 340));
    A.setTick(300);
    const resumed = await L.change(rec, B);
    B.setTick(20); L.act(ROW(100, 120));
    B.setTick(400);
    await rec.stop();
    return { records: await rec.send(''), sent: L.sent, errors, resumed };
}

test('a scene change finishes the segment and closes the world\'s Record into the chain; filming resumes in the next world: two chained Records (negative control: a resume that films nothing is red)', async () => {
    const real = await recordAcrossSceneChange({ attachRecorder });
    const recs = real.records;
    assert.deepEqual(real.resumed, { filming: true });
    assert.deepEqual(recs.map((r) => r.name), ['record-01', 'record-02'], 'one Record per booted world');
    assert.deepEqual(recs.map((r) => r.lab.scene.label), ['1A · Mirror', 'sketch (Maxi)']);
    assert.deepEqual(recs.map((r) => r.record.changes.map((c) => [c.tick, c.op, c.by, c.to.rect[0]])), [[[10, 'move', 'human', 340]], [[20, 'move', 'human', 120]]], 'each world keeps its own row');
    assert.deepEqual(recs.map((r) => r.lab.filmed.map((f) => f.hand)), [[SEGMENT_HAND], [SEGMENT_HAND]]);
    assert.deepEqual(recs.map((r) => r.lab.chain), [{ index: 1, records: ['record-01', 'record-02'] }, { index: 2, records: ['record-01', 'record-02'] }]);
    assert.deepEqual(recs.map((r) => r.lab.handBack), [{ record: 'record-02', clip: 'clip-01.mp4' }, { record: 'record-02', clip: 'clip-01.mp4' }]);
    assert.deepEqual(recordChainFaults(recs), [], 'the folder\'s chain gate passes the human chain');
    assert.deepEqual(recs.map((r) => r.faults), [[], []], 'each world\'s Record is complete');
    assert.deepEqual(recs.map((r) => r.lab.asked), [null, { interaction_id: 'thread-1', answer_excerpt: 'seen' }], 'Maxi\'s answer rides in the hand-back Record');
    assert.equal(real.sent.length, 1, 'the whole chain is ONE question');
    assert.deepEqual(real.sent[0].media.map((x) => x.label.split(' — ')[0]), ['DEMONSTRATION Record 1/2 1A · Mirror', 'DEMONSTRATION Record 2/2 sketch (Maxi)'], 'both worlds\' footage rides');
    assert.match(real.sent[0].note, /across 2 worlds[\s\S]*Record 1 — 1A · Mirror[\s\S]*Record 2 — sketch \(Maxi\)/);
    assert.deepEqual(real.errors, []);
    const src = read('site/app-assets/maxi-record.js');
    const RESUME = "        film(lab.scene('record'));\n        onChange(state());\n        return { filming: true };";
    assert.equal(src.split(RESUME).length, 2, 'the plant target moved — the negative control would measure nothing');
    const pm = await plantedRecord(src.replace(RESUME, "        st.filming = true;\n        onChange(state());\n        return { filming: true };"));
    try {
        const planted = await recordAcrossSceneChange(pm).catch((e) => ({ error: e.message }));
        assert.ok(planted.error || planted.records.length !== 2, 'the plant films nothing in world 2 (else this control measures nothing): ' + JSON.stringify(planted.error || planted.records.map((r) => r.name)));
    } finally { pm.dispose(); }
});

test('dispose() is deleted; a paused world refuses the scene change by name, still recording; a codec failure is painted; the lab finishes filming before every swap and restart, and closes the Record before a swap only', async () => {
    const { sc, runner, setTick } = liveScene('clip');
    const L = recordLab({ sc });
    const rec = attachRecorder({ lab: L.lab, onError() {} });
    assert.throws(() => rec.dispose(), /^Error: record: dispose\(\) is deleted — a scene change never drops a recording: the lab finishes its segment \(finishSegment\) and closes the world's Record into the chain, and filming resumes \(resumeFilming\)\.$/);
    assert.deepEqual(await rec.finishSegment(), { finished: false }, 'Record off: nothing to finish');
    assert.deepEqual(rec.resumeFilming(), { filming: false });
    await rec.start();
    assert.throws(() => rec.resumeFilming(), /resumeFilming\(\) while a segment still rolls — finishSegment\(\) first/);
    runner.isRunning = false;
    assert.throws(() => rec.assertCanFinish(), /^Error: record: the world is paused, so the scene cannot change or restart while Record is on .* Resume, then change the scene\. Still recording\.$/);
    await assert.rejects(rec.finishSegment(), /the world is paused/);
    assert.deepEqual([rec.recording, rec.state().filming], [true, true]);
    runner.isRunning = true; setTick(300);
    await rec.stop();
    const live = liveScene('codec');
    const errs = [];
    const L2 = recordLab(live);
    const rec2 = attachRecorder({ lab: L2.lab, onError: (e) => errs.push(e) });
    await rec2.start();
    live.setTick(300);
    await assert.rejects(rec2.finishSegment(), /the recording failed before the scene change finished it — .*closed codec/);
    assert.equal(errs.length, 1);
    assert.equal(L2.chain, null, 'a failed recording lets its chain go (said by name), never a chain left open');
    const lab = read('site/app-assets/maxi-lab.js');
    assertLeaveOrder(lab);
    assert.ok(/await leaveWorld\(\);\n\s*if \(state\.frame\) \{ state\.frame\.remove\(\); \}/.test(lab), 'mountScene leaves the world before the old scene document goes');
    assert.ok(/await openWorldRecord\(sc\);\n\s*state\.scene = sc;\n\s*attachHand\(ms, win\);\n\s*resumeRecorder\(\);/.test(lab), 'mountScene opens the world\'s Record, then the hand, then filming resumes');
    const restart = lab.slice(lab.indexOf('async function restartUnguarded('), lab.indexOf('\n}\n', lab.indexOf('async function restartUnguarded(')));
    assert.ok(/await stopFilming\(\);[\s\S]*await sc\.runner\.restart\(\);[\s\S]*attachHand\(sc\.win\.MaxiScene, sc\.win\);\n\s*resumeRecorder\(\);/.test(restart), 'restart stops filming, restarts, then filming resumes');
    assert.ok(!/leaveWorld|closeWorldRecord|stop\(\)/.test(restart), 'a restart never closes the world\'s Record (one Record spans it)');
    assert.equal((lab.match(/\.dispose\(\)/g) || []).length, 1, 'the hand is disposed in ONE place (stopFilming)');
});

/** THE order of leaving a world in the lab: the paused refusal, the hand (its last act written), the segment, then the Record. */
export function assertLeaveOrder(lab) {
    const stop = lab.slice(lab.indexOf('async function stopFilming('), lab.indexOf('\n}\n', lab.indexOf('async function stopFilming(')));
    const at = (re) => { const m = re.exec(stop); assert.ok(m, 'stopFilming lacks ' + re); return m.index; };
    const refuse = at(/state\.recorder\.assertCanFinish\(\)/), hand = at(/await h\.dispose\(\)/), seg = at(/await state\.recorder\.finishSegment\(\)/);
    assert.ok(refuse < hand, 'the paused refusal must come before the hand is disposed (a refused swap keeps the hand)');
    assert.ok(hand < seg, 'the hand must be disposed, its last act written, BEFORE the segment ends: a live carry it drops is a row its footage must show');
    const leave = lab.slice(lab.indexOf('async function leaveWorld('), lab.indexOf('\n}\n', lab.indexOf('async function leaveWorld(')));
    assert.ok(/await stopFilming\(\);\n\s*if \(state\.scene && state\.scene\.record\) \{ await closeWorldRecord\(state\.scene\); \}/.test(leave), 'leaveWorld stops filming, then closes the world\'s Record');
}

test('a carry the hand drops as the world changes lies inside the closing world\'s footage: the hand goes before the segment ends (negative control: the segment first leaves its row unfilmed — named unheld, in no Record)', async () => {
    assertLeaveOrder(read('site/app-assets/maxi-lab.js'));
    const run = async (handFirst) => {
        const A = liveScene('clip'), B = liveScene('clip', 'sketch (Maxi)');
        const L = recordLab(A);
        const rec = attachRecorder({ lab: L.lab, onError() {} });
        await rec.start();
        A.setTick(300);
        rec.assertCanFinish();
        if (handFirst) { L.act(ROW(360, 300)); await rec.finishSegment(); }            // the lab's order: the hand, then the segment
        else { await rec.finishSegment(); A.setTick(310); L.act(ROW(360, 300)); }       // reversed: the drop lands after the last clip
        await L.change(rec, B);
        B.setTick(300);
        return rec.stop();
    };
    const ok = await run(true);
    assert.deepEqual(ok.map((r) => r.record.changes.map((c) => c.by + ':' + c.to.rect[0])), [['human:300'], []], 'the dropped carry is world 1\'s row, inside its footage');
    assert.equal(ok[1].lab[UNHELD_KEY], undefined);
    const bad = await run(false);
    assert.deepEqual(bad.map((r) => [r.lab.scene.label, r.record.changes.length]), [['sketch (Maxi)', 0]], 'the segment first: world 1\'s Record cannot close with a row after its last clip, so no Record holds it');
    assert.deepEqual(bad[0].lab[UNHELD_KEY].map((c) => c.tick), [310], 'and it is named, unheld, in the hand-back Record');
    // the plant: stopFilming with the segment ahead of the hand is RED under the order check
    const lab = read('site/app-assets/maxi-lab.js');
    const HAND = '    if (state.hand) { const h = state.hand; state.hand = null; await h.dispose(); }\n';
    const SEG = '    try { await state.recorder.finishSegment(); }\n';
    assert.ok(lab.includes(HAND) && lab.includes(SEG), 'the order plant targets moved — the control would measure nothing');
    const planted = lab.replace(HAND, '').replace(SEG, SEG + HAND);
    assert.throws(() => assertLeaveOrder(planted), /disposed, its last act written, BEFORE the segment ends/);
});

test('rows a closing Record\'s footage does not show are named at Stop — lab.json unheld in the hand-back Record and the question\'s note — never lost, never a sticky error', async () => {
    const A = liveScene('clip'), B = liveScene('clip', 'sketch (Maxi)');
    const L = recordLab(A);
    const errors = [];
    const rec = attachRecorder({ lab: L.lab, onError: (e) => errors.push(e.message) });
    await rec.start();
    A.setTick(300);
    await rec.finishSegment();
    A.setTick(320); L.act(ROW(360, 300));                    // a row after the world's last clip: its Record cannot close with it
    await L.change(rec, B);
    B.setTick(300);
    await rec.stop();
    const records = await rec.send('');
    assert.deepEqual(errors, []);
    assert.deepEqual(records.map((x) => [x.name, x.lab.scene.label]), [['record-01', 'sketch (Maxi)']], 'world 1\'s Record could not close: the chain is the world that could');
    const hb = records[records.length - 1];
    const UNHELD = Object.assign({ tick: 320 }, ROW(360, 300));
    assert.deepEqual(hb.lab[UNHELD_KEY], [UNHELD], 'the hand-back lab.json names the row, the package\'s own');
    assert.ok(!hb.faults.some((f) => f.includes(UNHELD_KEY)), 'the owner\'s check passes its own rows: ' + hb.faults.join(' | '));
    assert.ok(L.sent[0].note.includes('Changes no Record holds') && L.sent[0].note.includes(changeText(UNHELD)), 'the question names it in the owner\'s words (changeText)');
    const files = Object.assign({}, hb.files);
    const lab = JSON.parse(files[FILES.lab]);
    lab[UNHELD_KEY][0].op = 'carry3d';
    files[FILES.lab] = JSON.stringify(lab);
    assert.ok(recordFolderFaults(files).some((f) => /^lab\.json unheld\[0\]: op "carry3d" is not one of move\|/.test(f)), 'a hand-name op in unheld is RED under the owner\'s check');
});

/** Stop, then the card's Send with `words`, through `m` (the real module or a planted copy): {stopped, records, sent, state, errors}. */
async function sendWithWords(m, words, refuse) {
    const { sc, setTick } = liveScene('clip');
    const sent = [], errors = [];
    const L = recordLab({ sc }, async (op, q) => { sent.push(q); if (refuse) { throw new Error('refused: ' + refuse); } return { asked: true, interaction_id: 'thread-1', answer_excerpt: 'seen' }; });
    const rec = m.attachRecorder({ lab: L.lab, onError: (e) => errors.push(e.message) });
    await rec.start();
    setTick(300);
    const stopped = await rec.stop();
    let records = null, sendError = null;
    try { records = await rec.send(words); } catch (e) { sendError = e.message; }
    return { stopped, records, sent, errors, sendError, state: rec.state(), last: rec.last() };
}

test('the demonstration card: a textarea and Send to Maxi on #demo; Stop waits for Send, which hands the clip over WITH the human\'s words in the same question and keeps them in the hand-back lab.json (negative control: a send that drops them is red)', async () => {
    const html = read('site/app.html');
    const demo = html.slice(html.indexOf('<div id="demo" hidden>'), html.indexOf('</div>\n  </div>', html.indexOf('<div id="demo" hidden>')));
    assert.ok(/<form id="demo-teach"[^>]*hidden>/.test(demo) && /<textarea id="demo-teach-text"[^>]*>/.test(demo) && /<button id="demo-send" type="submit">Send to Maxi<\/button>/.test(demo), 'the #demo card lacks its teaching textarea and Send to Maxi');
    assert.ok(!/<textarea id="demo-teach-text"[^>]*placeholder=/.test(demo), 'the prompt is the owner\'s TEACHING_PROMPT, set by paintCard — never a second copy in app.html');
    assert.ok(/Maxi reads this with the clip\./.test(demo), 'the one line of help');
    const lab = read('site/app-assets/maxi-lab.js');
    assert.ok(/el\.demoTeach\.addEventListener\('submit', function \(ev\) \{\s*ev\.preventDefault\(\);\s*sendDemonstration\(el\.demoTeachText\.value\)/.test(lab), 'the card\'s Send hands off the textarea\'s words through sendDemonstration');
    assert.ok(lab.includes('p = state.recorder.send(words);'), 'sendDemonstration hands off through the recorder\'s one send');
    assert.ok(/paintCard\(demoCard, \{/.test(lab), 'the loop\'s card is the same demoCard object Record paints (so its teaching form is hidden)');
    const WORDS = 'Light leaves the mirror at the angle it arrives.';
    const ok = await sendWithWords({ attachRecorder }, '  ' + WORDS + '\n');
    assert.deepEqual([ok.stopped[0].lab.asked, ok.stopped[0].lab.teaching], [null, undefined], 'Stop holds the Record unasked, without words');
    assert.equal(ok.sent.length, 1, 'Send is ONE question');
    assert.equal(ok.sent[0].teaching, WORDS, 'the human\'s words ride the same question as the clip, ends trimmed');
    assert.equal(ok.sent[0].media.length, 1);
    assert.deepEqual([ok.records[0].lab.teaching, ok.records[0].lab.asked, ok.records[0].faults], [WORDS, { interaction_id: 'thread-1', answer_excerpt: 'seen' }, []]);
    assert.deepEqual([ok.state.waiting, ok.sendError, ok.errors], [false, null, []]);
    const no = await sendWithWords({ attachRecorder }, WORDS, 'standalone');
    assert.match(no.sendError, /refused: standalone/);
    assert.deepEqual([no.sent[0].teaching, no.last[0].lab.teaching, no.last[0].lab.asked, no.state.waiting], [WORDS, WORDS, null, true]);
    const ph = await sendWithWords({ attachRecorder }, 'What are you teaching Maxi?');
    assert.match(ph.sendError, /teaching is the card's prompt .* — nothing was sent\.$/);
    assert.deepEqual([ph.sent.length, ph.state.waiting], [0, true]);
    const src = read('site/app-assets/maxi-record.js');
    const RIDE = "{ note: demonstrationNote(w.worlds, w.unheld), teaching: teaching, media: demonstrationMedia(w.worlds) }";
    assert.equal(src.split(RIDE).length, 2, 'the plant target moved — the control would measure nothing');
    const pm = await plantedRecord(src.replace(RIDE, '{ note: demonstrationNote(w.worlds, w.unheld), media: demonstrationMedia(w.worlds) }'));
    try {
        const bad = await sendWithWords(pm, WORDS);
        assert.equal(bad.sent[0].teaching, undefined, 'the plant must drop the words (else this control measures nothing)');
        assert.throws(() => assert.equal(bad.sent[0].teaching, WORDS), undefined, 'a send that drops the words is RED under the same check');
    } finally { pm.dispose(); }
});

/** Stop, then two Sends while the first question is still open, through `m`: {asks, second (its refusal message or null)}. */
async function doubleSend(m) {
    const { sc, setTick } = liveScene('clip');
    const releases = [];
    const asks = [];
    const L = recordLab({ sc }, (op, q) => { asks.push(q); return new Promise((r) => { releases.push(() => r({ asked: true, interaction_id: 't', answer_excerpt: 's' })); }); });
    const rec = m.attachRecorder({ lab: L.lab, onError() {} });
    await rec.start(); setTick(300);
    await rec.stop();
    const first = rec.send('first words');
    let second = null;
    const p2 = rec.send('second words').then(() => null, (e) => { second = e.message; });
    await new Promise((r) => setTimeout(r, 20));
    const asked = asks.length;
    releases.forEach((f) => f());
    await Promise.all([first.catch(() => null), p2]);
    return { asks: asked, second };
}

/** Stop, then Record again with the demonstration unsent, then the card's close (×) and Record, through `m`. */
async function recordWhileWaiting(m) {
    const { sc, setTick } = liveScene('clip');
    const L = recordLab({ sc });
    const rec = m.attachRecorder({ lab: L.lab, onError() {} });
    await rec.start(); setTick(300);
    await rec.stop();
    let refused = null;
    try { await rec.toggle(); } catch (e) { refused = e.message; }
    const kept = [rec.recording, rec.state().waiting];
    const dismissed = rec.dismiss();
    const after = [rec.state().waiting, rec.dismiss()];
    await rec.start();
    const restarted = rec.recording;
    setTick(600); await rec.stop();
    return { refused, kept, dismissed, after, restarted, sent: L.sent.length };
}

test('a demonstration is handed over once: a second Send while the first question is open is refused by name, one question sent; Record while a demonstration waits is REFUSED (never a silent discard) until Send or the card\'s close (×) discards it by name (negative controls: each guard planted out is red)', async () => {
    const d = await doubleSend({ attachRecorder });
    assert.deepEqual(d, { asks: 1, second: 'record: this demonstration is already being handed to Maxi — wait for his answer on the strip.' });
    const w = await recordWhileWaiting({ attachRecorder });
    assert.equal(w.refused, 'record: the last demonstration has not been sent — press Send to Maxi on its card, or close the card (×) to discard it, then press Record (R).');
    assert.deepEqual([w.kept, w.dismissed, w.after, w.restarted, w.sent], [[false, true], { discarded: true }, [false, { discarded: false }], true, 0], 'refused and still waiting; × discards it; then Record starts');
    const lab = read('site/app-assets/maxi-lab.js');
    assert.ok(lab.includes("el.demoClose.addEventListener('click', closeDemonstration);"), 'the card\'s × is the dismissal');
    const close = lab.slice(lab.indexOf('function closeDemonstration('), lab.indexOf('\n}\n', lab.indexOf('function closeDemonstration(')));
    assert.ok(close.includes('state.recorder.dismiss()') && close.includes('the demonstration was discarded unsent'), 'closing a waiting card says by name that it was discarded unsent');
    const src = read('site/app-assets/maxi-record.js');
    const SENDING = "        if (st.sending) { throw new Error('record: this demonstration is already being handed to Maxi — wait for his answer on the strip.'); }\n";
    const WAITING = '        if (st.waiting) { throw waitingError(); }   // an unsent demonstration is never thrown away by a new recording\n';
    for (const [label, from, run, isRed] of [
        ['the double-send guard', SENDING, doubleSend, (x) => x.asks === 2 && x.second === null],
        ['the waiting guard', WAITING, recordWhileWaiting, (x) => x.refused === null]
    ]) {
        assert.equal(src.split(from).length, 2, label + ': the plant target moved — the control would measure nothing');
        const pm = await plantedRecord(src.replace(from, ''));
        try {
            const x = await run(pm);
            assert.ok(isRed(x), label + ' planted out must exhibit the failure: ' + JSON.stringify(x));
            assert.throws(() => assert.deepEqual(x, run === doubleSend ? d : w), undefined, label + ' planted out is RED under the same check');
        } finally { pm.dispose(); }
    }
});

test('what the world\'s Record carried from before Record was pressed is set aside: the demonstration\'s note, media and card hold only the human\'s; lab.json carried names the rest (negative control: the set-aside planted away puts Maxi\'s act in the demonstration)', async () => {
    const maxiMove = { tick: 331, name: 'mirror', op: 'move', by: 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: [290, 80, 20, 240] } };
    const maxiSet = { tick: 489, name: 'mirror', op: 'setDeclared', by: 'maxi', from: { orientationDeg: 45 }, to: { orientationDeg: 30 } };
    const folder = serializeRecordFolder({ changes: [maxiMove, maxiSet], clips: [{ bytes: bytes('maxi'), firstTick: 182, lastTick: 482 }, { bytes: bytes('human'), firstTick: 490, lastTick: 790 }], partsBefore: PARTS, partsAfter: PARTS, project: PROJECT });
    const worlds = [{ folder, filmed: ['dragTo', SEGMENT_HAND], scene: { label: '1A · Mirror', id: 'cl1a-mirror', mode: null, renderer: 'p5' },
        carried: { changes: [maxiMove, maxiSet], clips: [{ hand: 'dragTo', firstTick: 182, lastTick: 482 }] } }];
    const [rec] = recordsOf(worlds, null, []);
    assert.deepEqual(rec.faults, []);
    assert.deepEqual(rec.lab.carried, { changes: [maxiMove, maxiSet], clips: [{ clip: 'clip-01.mp4', hand: 'dragTo', firstTick: 182, lastTick: 482 }] });
    const note = demonstrationNote(worlds, []);
    assert.ok(/one clip, ticks 490 to 790/.test(note) && /no declared part was moved/.test(note), 'the demonstration is the human\'s one clip and no act of theirs: ' + note);
    assert.ok(!note.includes('setDeclared (maxi)') && !note.includes('move (maxi)'), 'none of Maxi\'s earlier acts is in the demonstration');
    assert.ok(note.includes('2 earlier acts and 1 clip by Maxi were set aside, not part of this demonstration'), note);
    assert.deepEqual(demonstrationMedia(worlds).map((m) => m.label.split(' — ')[1]), ['clip-02.mp4 (1/1), ticks 490-790'], 'only the human\'s clip rides');
    const src = read('site/app-assets/maxi-record.js');
    const OWN = 'function ownClips(w) { return w.folder.clips.slice(carriedOf(w).clips.length); }';
    assert.equal(src.split(OWN).length, 2, 'the plant target moved');
    const pm = await plantedRecord(src.replace(OWN, 'function ownClips(w) { return w.folder.clips; }').replace('function ownRows(w) { return w.folder.record.changes.slice(carriedOf(w).changes.length); }', 'function ownRows(w) { return w.folder.record.changes; }'));
    try {
        const bad = pm.demonstrationNote(worlds, []);
        assert.ok(bad.includes('setDeclared (maxi)'), 'the plant must put Maxi\'s act in the demonstration (else this control measures nothing)');
        assert.throws(() => assert.ok(!bad.includes('setDeclared (maxi)') && !bad.includes('move (maxi)')), undefined, 'RED under the same check');
    } finally { pm.dispose(); }
});
