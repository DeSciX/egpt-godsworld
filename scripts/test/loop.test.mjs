/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * loop.test.mjs — minimaxi/loop.mjs routed against a FAKE body (a stand-in hand.mjs that plays scripted
 * role answers and returns a clip of real files), so the routing is gated without a browser or the CLI.
 *
 * Gates:
 *   1. approve path: Designer → plan, Builder → hands → clip on its NEXT turn as media → done, Owl on a
 *      fresh thread sees outline + prediction + the clip and nothing of the plan → on the platform brain NO
 *      memory, only the command for a look on the run's Record folder; scripts/gen-memories-seen.mjs refuses it
 *      without --looked-by (and a platform looker), refuses to publish an incomplete Record by name (here a refused
 *      hand's row moves the mirror in the other shape), and with --draft writes the memory under the run's folder only,
 *      with a human's look in the gate's format; the Record carries the sketch's block and project (no placeholder);
 *   2. a malformed Builder answer stops the loop loudly (exit path, report says STOPPED, no memory);
 *   3. json:done before any clip stops loudly; json:done after a change (or a new world) no clip shows is refused back
 *      to the Builder, the refusal verbatim as its next prompt; a reply to a refused hand with no words stops loudly;
 *   4. revise → back to the Builder with the Owl's reasons; a revise on every round stops at max rounds;
 *   5. the local brain writes the turn file with the sampled frame paths and reads the answer file; its
 *      approve on a COMPLETE Record that states its plan publishes the memory (into the test's own root) with the local
 *      Owl's looked line;
 *   6. the plan check (the generator's readRun, recordPlanFaults after the chain check): an act beyond the plan drafts the
 *      memory, its INCOMPLETE line and the run report naming the fault; nothing reaches kb/ or site/;
 *   7. a refused json:done is EMITTED (builder:done-refused, the refusal verbatim) and kept in the run report.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runLoop, parseArgs, sampleFrames, handBackState, USAGE, ARG_DEFAULTS, ghostMemories, kbFiles } from '../../minimaxi/loop.mjs';
import { parseLooked, ANSWER_SUFFIX } from '../gen-memories-seen.mjs';
import { LOOP_LIMITS } from '../../site/app-assets/maxi-loop.js';
import { distUrl } from '../frqtl-web-pin.mjs';

/** The package's one writer of a Record folder, for the fake body's world Record (what rec.stop() runs in the page). */
const RECORD_FORMAT_URL = distUrl('shim/project/record-format.js');

const fence = (tag, body) => '```' + tag + '\n' + body + '\n```';
const PLAN = { scene: 'cl1a-mirror', changes: [{ object: 'mirror', param: 'orientationDeg', value: 30, why: 'asked' }], hands: ['sceneSource', 'openSketch', 'see'], prediction: 'the beam leaves at 60 degrees' };
const DESIGNER = 'THIS IS: an outline\nTony, from the mirror memory.\n' + fence('json:plan', JSON.stringify(PLAN));
const B_SEE = 'PREDICTION: the beam turns up-right\n' + fence('json:call:see', '{}');
const B_DONE = 'The clip shows the beam leaving up and to the right.\n' + fence('json:done', '{}');
/** The plan's own act: the mirror set to 30 degrees (setDeclared), which the fake body writes and its inventory then holds. */
const setTo = (patch) => 'PREDICTION: the mirror turns to 30 degrees\n' + fence('json:call:setDeclared', JSON.stringify({ name: 'mirror', patch: patch }));
const B_SET = setTo({ orientationDeg: 30 });
const APPROVE = 'A beam meets a tilted bar.\n' + fence('json:verdict', '{"seen":{"contact":"mirror, middle third","after":"up and to the left","passes":"no"},"verdict":"approve","reasons":["the mirror is tilted at 30 degrees"],"change":null}');
const REVISE = fence('json:verdict', '{"seen":{"contact":"mirror, middle third","after":"up and to the left","passes":"no"},"verdict":"revise","reasons":["the mirror is at 45 degrees"],"change":"set the mirror to 30 degrees"}');

/** A fake checkout: a fake hand.mjs that answers from a script and logs every call. */
function fakeRoot(script) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-loop-'));
    fs.mkdirSync(path.join(root, 'kb', 'GodsWorld', 'memories'), { recursive: true });
    fs.mkdirSync(path.join(root, 'site', 'memories'), { recursive: true });
    const clipDir = path.join(root, 'out', 'clips', 'c1');
    fs.mkdirSync(clipDir, { recursive: true });
    fs.writeFileSync(path.join(clipDir, 'clip.mp4'), 'not really an mp4');
    for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(clipDir, 'f' + i + '.png'), 'png' + i);
    fs.writeFileSync(path.join(root, 'script.json'), JSON.stringify(script));
    // the fake body: each hand's result and rows, and the page's world Record (hand.mjs record begin|next|end|abandon): every
    // row and clip of the world joins its Record; a re-authoring closes it into the loop's chain; `end` closes the last one
    // with the PACKAGE's own writer (serializeRecordFolder) and hands the chain back, files as {text}|{base64}
    fs.writeFileSync(path.join(root, 'hand.mjs'), `
import fs from 'node:fs'; import path from 'node:path';
const { serializeRecordFolder } = await import(${JSON.stringify(RECORD_FORMAT_URL)});
const root = ${JSON.stringify(root)};
const raw = process.argv.slice(2); const noAsk = raw.includes('--no-ask'); const argv = raw.filter((x) => x !== '--no-ask'); const op = argv[2];
const args = op === 'record' ? argv[3] : JSON.parse(argv[3]);
if (op !== 'ask' && op !== 'record' && !noAsk) { console.log(op + ': under --brain platform a footage hand needs --thread or --no-ask'); process.exit(1); }
if (op === 'ask' && noAsk) { console.log('ask with --no-ask'); process.exit(1); }
const log = path.join(root, 'calls.jsonl'); fs.appendFileSync(log, JSON.stringify({ op, args }) + '\\n');
const script = JSON.parse(fs.readFileSync(path.join(root, 'script.json'), 'utf8'));
const stF = path.join(root, 'state.json'); const st = fs.existsSync(stF) ? JSON.parse(fs.readFileSync(stF, 'utf8')) : {};
st.rec = st.rec || { rows: [], clips: [] };
const save = () => fs.writeFileSync(stF, JSON.stringify(st));
const PROPS = () => Object.assign({ rect: [360, 80, 20, 240] }, st.mirror || { orientationDeg: 45, collisionBehavior: 'bounce' });
const PROJECT = { 'frqtl.json': JSON.stringify({ name: 'cl1a-mirror', kind: 'scene', entry: 'sketch.js' }), 'sketch.js': 'export const parts = {};\\nexport default function buildExperiment(exp) { exp.declare(parts); }\\n' };
function closeWorld() {
  const w = st.rec; st.rec = { rows: [], clips: [] };
  if (!st.chain) { return; }
  if (!w.start) { throw new Error('fake body: a world closed into the chain with no start'); }
  let out;
  try { out = serializeRecordFolder({ changes: w.rows, clips: w.clips.map((c) => ({ bytes: new Uint8Array(fs.readFileSync(c.file)), firstTick: c.firstTick, lastTick: c.lastTick })), partsBefore: { mirror: ['Wall', w.before || PROPS()] }, partsAfter: { mirror: ['Wall', PROPS()] }, project: PROJECT }); }
  catch (e) { st.chain.unheld.push(...w.rows); return; }
  if (out.empty) { return; }
  const files = {}; Object.keys(out.files).forEach((k) => { const v = out.files[k]; files[k] = typeof v === 'string' ? { text: v } : { base64: Buffer.from(v).toString('base64') }; });
  st.chain.worlds.push({ folder: { files, record: out.record, clips: out.clips }, filmed: w.clips.map((c) => c.hand), carried: 0, start: { mirror: ['Wall', w.start] }, scene: { label: '1A · Mirror', id: 'cl1a-mirror', mode: null, renderer: 'p5' } });
}
const emit = (o) => { (o.changes || []).forEach((c) => st.rec.rows.push(c)); save(); console.log(JSON.stringify(o)); };
if (op === 'record') {
  if (args === 'begin' || args === 'next') { st.rec = { rows: [], clips: [], before: PROPS(), start: PROPS() }; st.chain = { worlds: [], unheld: [] }; save(); console.log(JSON.stringify({ begun: true })); }   // THE START: read where each round begins
  else if (args === 'abandon') { st.chain = null; save(); console.log(JSON.stringify({ abandoned: true })); }
  else if (args === 'end') { closeWorld(); const ch = st.chain; st.chain = null; save(); console.log(JSON.stringify({ producer: 'loop', worlds: ch.worlds, unheld: ch.unheld })); }
} else if (op === 'ask') {
  const role = /-designer$/.test(args.thread) ? 'designer' : /-builder$/.test(args.thread) ? 'builder' : 'owl';
  st[role] = (st[role] || 0) + 1; save();
  const answer = script[role][st[role] - 1];
  if (answer === undefined) { console.log('ask refused: script ran out for ' + role); process.exit(1); }
  console.log(JSON.stringify({ answer, interaction_id: 'iid-' + args.thread + '-' + st[role], usage: { input_tokens: 100, output_tokens: 10, media_tokens: args.media ? 300 : 0, total_tokens: 110 }, model: 'fake' }));
} else if (op === 'see') {
  const d = path.join(root, 'out', 'clips', 'c1');
  st.see = (st.see || 0) + 1;
  const t0 = 1 + 300 * (st.see - 1);   // one world's ticks only climb: each clip starts where the last one left off
  st.rec.clips.push({ file: path.join(d, 'clip.mp4'), firstTick: t0, lastTick: t0 + 250, hand: 'see' });
  emit({ mime: 'video/mp4', frames: Array.from({ length: 10 }, (_, i) => path.join(d, 'f' + i + '.png')), clip: path.join(d, 'clip.mp4'), seconds: 5.1, firstTick: t0, lastTick: t0 + 250, label: 'SEE — ticks 1-251, 51 frames', asked: false, changes: [] });
} else if (op === 'moveObject') {
  emit({ moved: args.name, rect: args.rect, changes: [{ tick: 7, name: args.name, op: 'move', by: 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: args.rect } }] });
} else if (op === 'dragTo') {
  process.stderr.write('dragTo: [FrqtlApp.placeDeclaredAt] the point is outside the world\\n');
  st.rec.rows.push({ tick: 9, name: 'mirror', op: 'move', by: 'maxi', from: { rect: [300, 80, 20, 240] }, to: { rect: [310, 80, 20, 240] } }); save();
  console.log(JSON.stringify({ changes: [{ tick: 9, name: 'mirror', op: 'move', by: 'maxi', from: { rect: [300, 80, 20, 240] }, to: { rect: [310, 80, 20, 240] } }] })); process.exit(1);
} else if (op === 'setDeclared') {
  const was = st.mirror || { orientationDeg: 45, collisionBehavior: 'bounce' }; const from = {}; Object.keys(args.patch).forEach((k) => { from[k] = was[k]; });
  st.mirror = Object.assign({}, was, args.patch);
  emit({ set: args.name, changes: [{ tick: 3, name: args.name, op: 'setDeclared', by: 'maxi', from: from, to: args.patch }] });
} else if (op === 'inventory') {
  console.log(JSON.stringify({ tick: 5, scene: '1A · Mirror', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', dimensions: 2, canvas: [600, 400], camera: null, viewer: null, objects: [{ name: 'mirror', kind: 'Wall', authority: 'rect', center: [370, 200, 0], rect: [360, 80, 20, 240] }], parts: { mirror: ['Wall', PROPS()] }, project: { entry: 'sketch.js', files: PROJECT }, changes: [] }));
} else if (op === 'openSketch' && args.source === 'bad') { console.log('openSketch: SyntaxError: Unexpected token'); process.exit(1); }
else if (op === 'openSketch' || op === 'loadScene') { closeWorld(); st.rec.before = PROPS(); st.rec.start = PROPS(); emit({ ok: op, changes: [] }); }
else { console.log(JSON.stringify({ ok: op, changes: [] })); }
`);
    return { root, env: { root, out: path.join(root, 'out'), handCli: path.join(root, 'hand.mjs') } };
}
const calls = (root) => fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const args = (extra) => parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'a laser hitting a mirror at 30 degrees', '--run', 'mmtest'].concat(extra || []));

const GEN_SEEN = new URL('../gen-memories-seen.mjs', import.meta.url).pathname;
/** The generator CLI (it only refuses here: a refusal exits 2 before writing anything). */
const genCli = (argv) => spawnSync(process.execPath, [GEN_SEEN].concat(argv), { encoding: 'utf8' });

test('approve on the platform brain: three threads, the clip rides on the Builder\'s next turn and to a fresh Owl; no memory without a look', async () => {
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: ['PREDICTION: the sketch text\n' + fence('json:call:sceneSource', '{"id":"cl1a-mirror"}'),
        'PREDICTION: the mirror moves\n' + fence('json:call:moveObject', '{"name":"mirror","rect":[300,80,20,240]}'),
        'PREDICTION: refused\n' + fence('json:call:dragTo', '{"name":"mirror","to":[9999,200]}'), 'The dragTo of "mirror" was refused: [9999, 200] is outside the world.\n' + B_SEE, B_DONE], owl: [APPROVE] });
    const rep = await runLoop(args(), env);
    // the approve's Record folder (the sketch-projects design §6): the package's closed Record, complete as §6; the memory is still
    // not published, because the Record does not state its plan (judged start → end: the mirror ends where it started, and
    // the plan's orientationDeg is not what parts.after.json holds)
    assert.equal(rep.record.folder, 'out/mmtest/record');
    assert.deepEqual(rep.record.records.map((r) => r.name), ['record-01'], 'one world, one Record');
    rep.record.files = rep.record.records[0].files; rep.record.unavailable = rep.record.records[0].unavailable;
    assert.deepEqual(rep.record.files, ['clip-01.mp4', 'early.png', 'lab.json', 'mid.png', 'parts.after.json', 'parts.before.json', 'project/frqtl.json', 'project/sketch.js', 'record.json', 'settled.png']);
    assert.equal(rep.record.handBackComplete, false, 'the generator\'s measure: the hand-back Record is incomplete');
    assert.ok(rep.record.planFaults.includes('plan changes[0] (mirror orientationDeg: 30): record-01/parts.after.json holds "mirror" orientationDeg at 45, not 30'), 'the plan faults ride in the run report: ' + rep.record.planFaults);
    assert.ok(rep.record.planFaults.some((f) => /^no change: record-01\/parts\.after\.json equals the start \(lab\.json start\) — the round ends where it started, whatever its 2 row\(s\) did on the way$/.test(f)), 'two moves that end on the start are no change');
    assert.match(rep.outcome, /\(the Record does not state its plan: no change: record-01/, 'and in its outcome');
    assert.deepEqual(rep.record.records[0].faults, [], 'the Record itself is complete (§6 and the lab\'s half): only the plan check stops the publish');
    assert.equal(rep.record.complete, undefined, 'no second, chain-wide derivation of publishable');
    assert.deepEqual(rep.record.unavailable, [], 'no placeholder: the block and the project come from the body\'s inventory');
    const folder = path.join(root, rep.record.folder, 'record-01');
    const record = JSON.parse(fs.readFileSync(path.join(folder, 'record.json'), 'utf8'));
    assert.deepEqual(record, { tickRange: [1, 251], clips: ['clip-01.mp4'], changes: [
        { tick: 7, name: 'mirror', op: 'move', by: 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: [300, 80, 20, 240] } },
        { tick: 9, name: 'mirror', op: 'move', by: 'maxi', from: { rect: [300, 80, 20, 240] }, to: { rect: [310, 80, 20, 240] } }] }, 'a refused hand\'s rows are in the Record too, in the shape its part is declared by');
    const labFile = JSON.parse(fs.readFileSync(path.join(folder, 'lab.json'), 'utf8'));
    assert.deepEqual([labFile.producer, labFile.scene.id, labFile.run, labFile.owl.verdict, labFile.steps.length], ['loop', 'cl1a-mirror', 'mmtest', 'approve', 4]);
    assert.equal(fs.readFileSync(path.join(folder, 'clip-01.mp4'), 'utf8'), 'not really an mp4', 'the hand-back clip, byte for byte');
    const builderTexts = calls(root).filter((c) => c.op === 'ask' && /builder/.test(c.args.thread)).map((c) => c.args.user_input).join('\n');
    assert.ok(!/"by": ?"maxi"/.test(builderTexts), 'the writes ride to the Record, never into the Builder\'s turn');
    assert.match(builderTexts, /REFUSED, verbatim:\ndragTo: \[FrqtlApp\.placeDeclaredAt\] the point is outside the world/);
    assert.deepEqual(Object.keys(rep.threads), ['mmtest-designer', 'mmtest-builder', 'mmtest-owl-r1']);
    const asks = calls(root).filter((c) => c.op === 'ask');
    assert.deepEqual(asks.map((c) => c.args.knowledgebase_names), [['GodsWorld'], ['GodsWorld'], ['GodsWorld'], ['GodsWorld'], ['GodsWorld'], ['GodsWorld'], ['General']]);
    assert.deepEqual(asks.map((c) => !!c.args.media), [false, false, false, false, false, true, true], 'the clip rides on the turn after see, and to the Owl');
    assert.ok(!/clip\.mp4|f\d\.png/.test(asks[5].args.user_input), 'the body\'s clip and still paths (FOOTAGE_KEYS) ride as media, never in the Builder\'s turn text');
    const owl = asks[6].args;
    assert.ok(!/orientationDeg|sceneSource|cl1a-mirror/.test(owl.user_input), 'the Owl sees nothing of the plan or the build');
    assert.match(owl.user_input, /THE BUILDER'S PREDICTION: the beam turns up-right/);
    assert.equal(rep.threads['mmtest-builder'].usage.media_tokens, 300);
    assert.equal(rep.memory, undefined, 'the platform Owl\'s approve writes no memory');
    assert.ok(!fs.existsSync(path.join(root, 'kb', 'GodsWorld', 'memories', 'mm-cl1a-mirror-test-seen.md')));
    assert.ok(!fs.existsSync(path.join(root, 'site', 'memories', 'mm-cl1a-mirror-test')));
    assert.match(rep.outcome, /^approved in round 1 by the platform Owl: no memory written until a human or the seat looks at the stills/);
    assert.equal(rep.awaitingLook.stills.length, 10);
    assert.match(rep.awaitingLook.command, /^node scripts\/gen-memories-seen\.mjs out\/mmtest\/record --looked-by <human\|seat>:<role> .* --draft$/, 'the command names the run\'s Record folder, and --draft while the Record is incomplete');
    const recDir = path.join(root, rep.awaitingLook.record);
    // the generator refuses the Record folder without a look, and with the platform brain as the looker; nothing is written
    for (const [argv, why] of [[[recDir], /--looked-by is required/], [[recDir, '--looked-by', 'platform:mmtest-owl-r1', '--stills', '8', '--account', 'contact: x'], /platform brain/],
        [[recDir, '--looked-by', 'local-owl:gemini-3.8-flash', '--stills', '8', '--account', 'contact: x'], /platform brain/], [[recDir, '--looked-by', 'human:someone', '--account', 'contact: x'], /how many stills/],
        [[recDir, '--looked-by', 'human:Sam', '--stills', '3', '--account', 'contact: x'], /never a person's name/]]) {
        const r = genCli(argv);
        assert.equal(r.status, 2, 'refused: ' + argv.join(' '));
        assert.match(r.stderr, why);
    }
    // a human look on an incomplete Record: publishing is refused by name (exit 1), kb/ and site/ untouched; --draft writes under the run
    const look = ['--looked-by', 'human:the-seat-owner', '--stills', '10', '--account', 'contact: mirror middle; after: up-right; passes: no'];
    // in-process with the scratch root (the CLI's root is the checkout: a broken gate must never write into it)
    const { writeSeenMemory } = await import('../gen-memories-seen.mjs');
    let refused = null;
    try { writeSeenMemory(recDir, { by: 'human', who: 'the-seat-owner', stills: 10, account: 'contact: mirror middle; after: up-right; passes: no' }, { root }); } catch (e) { refused = e; }
    assert.ok(refused, 'publishing the incomplete Record is refused');
    assert.match(refused.message, /is not a complete Record[\s\S]*no change: record-01\/parts\.after\.json equals the start[\s\S]*plan changes\[0\] \(mirror orientationDeg: 30\): record-01\/parts\.after\.json holds "mirror" orientationDeg at 45, not 30[\s\S]*--draft writes the memory under \S*out\/mmtest\/memory\/ only/);
    assert.ok(!fs.existsSync(path.join(root, 'kb', 'GodsWorld', 'memories', 'mm-cl1a-mirror-test-seen.md')) && !fs.existsSync(path.join(root, 'site', 'memories', 'mm-cl1a-mirror-test')), 'a refusal writes nothing');
    const drafted = genCli([recDir].concat(look, ['--draft']));
    assert.equal(drafted.status, 0, drafted.stderr);
    assert.equal(JSON.parse(drafted.stdout).draft, path.join(root, 'out', 'mmtest', 'memory', 'mm-cl1a-mirror-test-seen.md'), 'outside the checkout the CLI names the draft by its absolute path');
    const md = fs.readFileSync(path.join(root, 'out', 'mmtest', 'memory', 'mm-cl1a-mirror-test-seen.md'), 'utf8');
    assert.match(md, /^looked: human the-seat-owner on 10 stills of memories\/mm-cl1a-mirror-test\/clip-01\.mp4 — contact: mirror middle; after: up-right; passes: no$/m);
    assert.match(md, /RECORD, not Maxi's own sighting/);
    assert.match(md, /^INCOMPLETE Record, so not published/m);
    assert.match(md, /^change: tick 7 · move \(maxi\) mirror: rect \[360, 80, 20, 240\] → rect \[300, 80, 20, 240\]$/m, 'the change rows are the memo lines, in the §6 vocabulary');
    assert.match(md, /^change: tick 9 · move \(maxi\) mirror: rect \[300, 80, 20, 240\] → rect \[310, 80, 20, 240\]$/m);
    assert.ok(!fs.existsSync(path.join(root, 'kb', 'GodsWorld', 'memories', 'mm-cl1a-mirror-test-seen.md')) && !fs.existsSync(path.join(root, 'site', 'memories', 'mm-cl1a-mirror-test')), 'a draft never reaches kb/ or site/');
    assert.match(md, /Seen, the Builder's words on the hand-back clip \[clip memories\/mm-cl1a-mirror-test\/clip-01\.mp4\]: The clip shows the beam leaving up and to the right\./);
    assert.match(md, /The Owl's account \(from the pixels, before its verdict\): contact — mirror, middle third; after — up and to the left; passes — no\./);
    assert.match(md, /Threads: designer iid-mmtest-designer-1 · builder iid-mmtest-builder-5 · owl iid-mmtest-owl-r1-1\./);
    const usage = genCli([]).stderr;
    assert.ok(usage.includes('--looked-by <kind>:<role>') && usage.includes('looked: <human|local-owl|seat> <role> on <N> stills'), 'the usage quotes LOOKED_SHAPE, built from LOOKERS: ' + usage);
});

test('a malformed Builder answer stops the loop loudly', async () => {
    const { env } = fakeRoot({ designer: [DESIGNER], builder: ['I would now look at it: {"see": {}}'], owl: [] });
    await assert.rejects(runLoop(args(), env), /\[builder → hand-off\]: expected exactly ONE json:call:<hand> or json:done block, found 0/);
    const rep = JSON.parse(fs.readFileSync(path.join(env.out, 'runs', 'mmtest.json'), 'utf8'));
    assert.match(rep.outcome, /^STOPPED: /);
    assert.equal(rep.memory, undefined);
});

test('json:done before any clip stops loudly; a refused hand goes back to the Builder verbatim', async () => {
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: ['PREDICTION: boots\n' + fence('json:call:openSketch', '{"source":"bad"}'), B_DONE], owl: [] });
    await assert.rejects(runLoop(args(), env), /json:done before filming any clip/);
    const builderAsks = calls(root).filter((c) => c.op === 'ask' && /builder/.test(c.args.thread));
    assert.match(builderAsks[1].args.user_input, /REFUSED, verbatim:\nopenSketch: SyntaxError: Unexpected token/);
});

test('revise goes back to the Builder with the Owl\'s reasons; revise every round stops at max rounds', async () => {
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, B_DONE, B_SEE, B_DONE], owl: [REVISE, REVISE] });
    await assert.rejects(runLoop(args(['--max-rounds', '2']), env), /sent it back 2 times \(max rounds\)/);
    const builderAsks = calls(root).filter((c) => c.op === 'ask' && /builder/.test(c.args.thread));
    assert.match(builderAsks[2].args.user_input, /THE OWL SENT IT BACK \(revise\)[\s\S]*the mirror is at 45 degrees[\s\S]*set the mirror to 30 degrees/);
    const owls = calls(root).filter((c) => c.op === 'ask' && /owl/.test(c.args.thread)).map((c) => c.args.thread);
    assert.deepEqual(owls, ['mmtest-owl-r1', 'mmtest-owl-r2'], 'a fresh Owl thread per verdict');
});

test('the Record is the approving ROUND: a revised round\'s changes are not in it, and its start state is re-read', async () => {
    const MOVE = 'PREDICTION: the mirror moves\n' + fence('json:call:moveObject', '{"name":"mirror","rect":[300,80,20,240]}');
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: [MOVE, B_SEE, B_DONE, B_SEE, B_DONE], owl: [REVISE, APPROVE] });
    const rep = await runLoop(args(), env);
    const record = JSON.parse(fs.readFileSync(path.join(root, rep.record.folder, 'record-01', 'record.json'), 'utf8'));
    assert.deepEqual(record, { tickRange: [301, 551], clips: ['clip-01.mp4'], changes: [] }, 'round 1\'s move and clip belong to the revised round, not to the Record (round 2 filmed ticks 301–551)');
    assert.equal(calls(root).filter((c) => c.op === 'inventory').length, 3, 'the stage, round 2\'s start, and the after state');
});

test('json:done after a write the last clip does not show is refused BACK TO THE BUILDER verbatim (never after the Owl approved); filming it then hands back; a run name with a Record folder is refused up front', async () => {
    const MOVE = 'PREDICTION: the mirror moves\n' + fence('json:call:moveObject', '{"name":"mirror","rect":[300,80,20,240]}');
    const SAID = 'The clip shows the beam leaving up and to the right.\n';
    // the Builder can repair it: its next prompt is the refusal itself, and a clip after the move then hands back (negative control below: never filmed → the round's limit)
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, SAID + MOVE, fence('json:done', '{}'), 'PREDICTION: the moved mirror\n' + fence('json:call:see', '{}'), B_DONE], owl: [APPROVE] });
    const rep = await runLoop(args(), env);
    assert.equal(rep.outcome, 'approved in round 1 by the platform Owl: no memory written until a human or the seat looks at the stills (' + rep.awaitingLook.command + ') (the Record does not state its plan: ' + rep.record.planFaults.join(' · ') + ')', 'a move the plan never names: a draft command');
    assert.match(rep.awaitingLook.command, / --draft$/);
    const bAsks = calls(root).filter((c) => c.op === 'ask' && /builder/.test(c.args.thread)).map((c) => c.args.user_input);
    assert.equal(bAsks[3], 'YOUR json:done WAS REFUSED, verbatim:\njson:done after 1 change(s) your last clip does not show (the first: move of mirror) — a Record\'s changes lie inside its footage; film again after the last change.\n' +
        'Film it (see, or dragTo for a move), say what the clip shows, and end with json:done when your last clip shows every change.', 'the refusal text is the Builder\'s next prompt, not a generic retry');
    const REFUSAL = 'json:done after 1 change(s) your last clip does not show (the first: move of mirror) — a Record\'s changes lie inside its footage; film again after the last change.';
    assert.deepEqual(rep.rounds[0].doneRefused, [{ words: '', refusal: REFUSAL }], 'the loop EMITS the refused json:done (builder:done-refused), the refusal verbatim, and the run report keeps it');
    assert.ok(bAsks[3].includes(REFUSAL), 'the emitted refusal is the one the Builder was handed');
    const owlAsks = calls(root).filter((c) => c.op === 'ask' && /owl/.test(c.args.thread));
    assert.equal(owlAsks.length, 1, 'the Owl is asked once, after the clip that shows the move');
    const record = JSON.parse(fs.readFileSync(path.join(root, rep.record.folder, 'record-01', 'record.json'), 'utf8'));
    assert.deepEqual([record.changes.map((c) => c.op), record.clips], [['move'], ['clip-01.mp4', 'clip-02.mp4']], 'the move lies inside the Record\'s footage');
    // a Builder that never films the change: every json:done is refused back, until the round's reply limit stops the loop; the Owl is never asked
    const r2 = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, SAID + MOVE, fence('json:done', '{}'), 'Done.\n' + fence('json:done', '{}')], owl: [APPROVE] });
    await assert.rejects(runLoop(args(['--max-steps', '4']), r2.env), /did not hand back \(json:done\) within 4 replies in round 1/);
    assert.equal(calls(r2.root).filter((c) => c.op === 'ask' && /owl/.test(c.args.thread)).length, 0, 'the Owl is never asked');
    fs.mkdirSync(path.join(env.out, 'mmtest', 'record'), { recursive: true });
    await assert.rejects(runLoop(args(), env), /run mmtest already has a Record folder/);
});

test('the Record lists EVERY clip the approving round filmed, in order, the hand-back last; lab.json names it', async () => {
    const SAID = 'The clip shows the beam leaving up and to the right.\n';
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: [B_SET, B_SEE, SAID + 'PREDICTION: again\n' + fence('json:call:see', '{}'), B_DONE], owl: [APPROVE] });
    const rep = await runLoop(args(), env);
    const folder = path.join(root, rep.record.folder, 'record-01');
    const record = JSON.parse(fs.readFileSync(path.join(folder, 'record.json'), 'utf8'));
    const labFile = JSON.parse(fs.readFileSync(path.join(folder, 'lab.json'), 'utf8'));
    assert.deepEqual([record.clips, record.tickRange], [['clip-01.mp4', 'clip-02.mp4'], [1, 551]], 'both see clips of the one world, in order, one tick span');
    assert.deepEqual(rep.record.planFaults, [], 'the plan\'s one act, filmed: the Record states its plan');
    assert.deepEqual([labFile.handBack, labFile.filmed.map((f) => f.hand)], [{ record: 'record-01', clip: 'clip-02.mp4' }, ['see', 'see']]);
    assert.ok(fs.existsSync(path.join(folder, 'clip-02.mp4')) && rep.record.handBackComplete === true, 'two clips after the plan\'s act: a complete Record');
});

test('a Record spans ONE world: see; openSketch; see is TWO Records, chained in lab.json, the hand-back the second\'s clip', async () => {
    const SAID = 'The clip shows the beam leaving up and to the right.\n';
    const OPEN = SAID + 'PREDICTION: the turned mirror boots\n' + fence('json:call:openSketch', JSON.stringify({ source: 'export default function buildExperiment(exp) { /* 30 */ }\n' }));
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, OPEN, 'PREDICTION: the turned mirror\n' + fence('json:call:see', '{}'), B_DONE], owl: [APPROVE] });
    const rep = await runLoop(args(), env);
    assert.deepEqual([rep.record.records.map((r) => r.name), rep.record.handBack], [['record-01', 'record-02'], { record: 'record-02', clip: 'clip-01.mp4' }]);
    const read = (n, f) => JSON.parse(fs.readFileSync(path.join(root, rep.record.folder, n, f), 'utf8'));
    assert.deepEqual([read('record-01', 'record.json').clips, read('record-02', 'record.json').clips], [['clip-01.mp4'], ['clip-01.mp4']], 'each world keeps its own clips');
    assert.ok(![read('record-01', 'record.json'), read('record-02', 'record.json')].some((r) => r.changes.some((c) => c.op === 'sketch')), 'no sketch row anywhere');
    assert.deepEqual([read('record-01', 'lab.json').chain, read('record-02', 'lab.json').chain], [{ index: 1, records: ['record-01', 'record-02'] }, { index: 2, records: ['record-01', 'record-02'] }]);
    assert.equal(read('record-02', 'lab.json').outline, 'a laser hitting a mirror at 30 degrees', 'the round\'s own fields ride in the hand-back Record');
    assert.equal(calls(root).filter((c) => c.op === 'inventory').length, 4, 'the stage, the world as openSketch finds it, the new world, the close after the approve');
    // json:done right after a re-authoring, with no clip of the new world, is refused back to the Builder before the Owl is asked
    const r2 = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, OPEN, 'The sketch booted.\n' + fence('json:done', '{}')], owl: [APPROVE] });
    await assert.rejects(runLoop(args(['--max-steps', '3']), r2.env), /within 3 replies/);
    const told = calls(r2.root).filter((c) => c.op === 'ask' && /builder/.test(c.args.thread)).map((c) => c.args.user_input);
    assert.equal(told.length, 3);
    assert.equal(calls(r2.root).filter((c) => c.op === 'ask' && /owl/.test(c.args.thread)).length, 0, 'the Owl is never asked');
});

test('a Builder that answers a refusal with no words stops loudly; one that names the refused part goes on (negative control)', async () => {
    const DRAG = 'PREDICTION: the mirror slides\n' + fence('json:call:dragTo', '{"name":"mirror","to":[9999,200]}');
    // the silent retry: only a PREDICTION line before the same hand again
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: [DRAG, DRAG], owl: [APPROVE] });
    await assert.rejects(runLoop(args(), env), /the Builder answered the refusal of its dragTo with no words before its next block — it must say which part and key were refused and why, never retry silently/);
    assert.equal(calls(root).filter((c) => c.op === 'dragTo').length, 1, 'the silent retry never ran');
    const told = calls(root).filter((c) => c.op === 'ask' && /builder/.test(c.args.thread))[1].args.user_input;
    assert.ok(told.includes('REFUSED, verbatim:\ndragTo: [FrqtlApp.placeDeclaredAt] the point is outside the world\nBefore your next block, say in words which part and which key it refused'), told);
    assert.doesNotMatch(told, /Nothing moved/);
    // negative control: the same reply with words naming the refusal goes on to film and hand back
    const ok = fakeRoot({ designer: [DESIGNER], builder: [DRAG, 'The dragTo of "mirror" was refused: the point [9999, 200] is outside the world.\n' + B_SEE, B_DONE], owl: [APPROVE] });
    const rep = await runLoop(args(), ok.env);
    assert.match(rep.outcome, /^approved in round 1/);
});

test('a Builder that hands back without describing its clip stops loudly', async () => {
    const { env } = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, fence('json:done', '{}')], owl: [APPROVE] });
    await assert.rejects(runLoop(args(), env), /did not say what its clip shows/);
});

test('a revise needs a new clip: done right after a revise stops', async () => {
    const { env } = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, B_DONE, B_DONE], owl: [REVISE] });
    await assert.rejects(runLoop(args(), env), /json:done before filming any clip/);
});

/** A local-brain run: the "agents" answer each turn file as it appears (a child process, since the loop blocks this thread). */
async function localRun(run, answers) {
    const { env } = fakeRoot({});
    const a = parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'local', '--outline', 'a laser hitting a mirror at 30 degrees', '--run', run, '--frames', '4', '--answer-timeout', '20']);
    const dir = path.join(env.out, 'turns', run);
    const { spawn } = await import('node:child_process');
    const agent = spawn(process.execPath, ['-e', `
const fs=require('fs'),path=require('path');const dir=${JSON.stringify(dir)};const ans=${JSON.stringify(answers)};const SUF=${JSON.stringify(ANSWER_SUFFIX)};
const t=setInterval(()=>{for(const k of Object.keys(ans)){const f=path.join(dir,k+'.md');const o=path.join(dir,k+SUF);if(fs.existsSync(f)&&!fs.existsSync(o)){fs.writeFileSync(o,ans[k]);delete ans[k];}}if(!Object.keys(ans).length)clearInterval(t);},200);setTimeout(()=>process.exit(0),20000);`]);
    try { return { env, dir, rep: await runLoop(a, env) }; } finally { agent.kill(); }
}
const published = (root) => fs.readdirSync(path.join(root, 'kb', 'GodsWorld', 'memories')).concat(fs.readdirSync(path.join(root, 'site', 'memories')));

test('local brain: turn files carry the sampled frames; answers are read from the answer files', async () => {
    const { env, dir, rep } = await localRun('mmlocal', { '01-designer': DESIGNER, '02-builder': B_SET, '03-builder': B_SEE, '04-builder': B_DONE, '05-owl': APPROVE });
    const owlTurn = fs.readFileSync(path.join(dir, '05-owl.md'), 'utf8');
    const listed = owlTurn.match(/^- .*f\d\.png$/gm);
    assert.equal(listed.length, 4, 'four sampled frames');
    assert.match(listed[0], /f0\.png$/); assert.match(listed[3], /f9\.png$/);
    assert.ok(!/orientationDeg/.test(owlTurn));
    assert.equal(rep.outcome, 'approved in round 1', 'a complete Record that states its plan: the memory is published, not drafted');
    assert.deepEqual(rep.record.planFaults, []);
    assert.deepEqual([rep.memory.complete, rep.memory.faults, rep.memory.memory, rep.memory.media], [true, [], 'kb/GodsWorld/memories/mm-cl1a-mirror-local-seen.md', 'site/memories/mm-cl1a-mirror-local'], 'published into the test\'s own root');
    const md = fs.readFileSync(path.join(env.root, rep.memory.memory), 'utf8');
    assert.match(md, /^looked: local-owl maxi-owl on 4 stills of memories\/mm-cl1a-mirror-local\/clip-01\.mp4 — answer memories\/mm-cl1a-mirror-local\/turns\/05-owl\.answer\.md; contact: mirror, middle third; after: up and to the left; passes: no$/m);
    assert.ok(fs.existsSync(path.join(env.root, 'site', 'memories', 'mm-cl1a-mirror-local', 'turns', '05-owl' + ANSWER_SUFFIX)), 'the Owl\'s answer is served where the look cites it');
    assert.match(md, /^Threads: designer local memories\/mm-cl1a-mirror-local\/turns\/01-designer\.answer\.md · /m, 'the loop\'s local thread id is the generator\'s LOCAL_THREAD format: the generator reads it back');
    assert.deepEqual(parseLooked(md).map((k) => k.malformed || k.by), ['local-owl'], 'the local Owl\'s look, in the gate\'s shape');
    assert.ok(fs.statSync(path.join(env.root, 'site', 'memories', 'mm-cl1a-mirror-local')).isDirectory(), 'its media folder is published beside it');
    assert.deepEqual(sampleFrames(['a', 'b'], 8), ['a', 'b']);
});

test('a Builder act beyond the plan DRAFTS the memory: the INCOMPLETE line and the run report name the plan fault; nothing reaches kb/ or site/ (negative control: the clean run above publishes)', async () => {
    const { env, rep } = await localRun('mmbeyond', { '01-designer': DESIGNER, '02-builder': setTo({ orientationDeg: 30, collisionBehavior: 'absorb' }), '03-builder': B_SEE, '04-builder': B_DONE, '05-owl': APPROVE });
    const FAULT = 'record-01/record.json changes[0] (setDeclared of "mirror") acts beyond the plan: collisionBehavior (the plan names orientationDeg for "mirror")';
    assert.deepEqual(rep.record.records.map((r) => [r.name, r.complete]), [['record-01', true]], 'the Record itself is complete (§6): only the plan check stops the publish');
    assert.deepEqual([rep.record.handBackComplete, rep.record.planFaults], [false, [FAULT]], 'the run report names the plan fault');
    assert.equal(rep.outcome, 'approved in round 1; the Record is incomplete, so the memory is a draft under out/mmbeyond/memory/ (the Record does not state its plan: ' + FAULT + ')');
    assert.deepEqual([rep.memory.complete, rep.memory.faults, rep.memory.draft], [false, [FAULT], 'out/mmbeyond/memory/mm-cl1a-mirror-beyond-seen.md']);
    const md = fs.readFileSync(path.join(env.root, rep.memory.draft), 'utf8');
    assert.ok(md.split('\n').includes('INCOMPLETE Record, so not published (only a complete Record is published into kb/GodsWorld/memories and site/memories; the paths above name where it would be served): ' + FAULT), 'the draft\'s INCOMPLETE line names the plan fault');
    assert.match(md, /DRAFT: not in the roster\./);
    assert.deepEqual(published(env.root), [], 'nothing in kb/ or site/');
});

test('the approve decides nothing about the plan itself (the generator\'s readRun does), and the thread format is the generator\'s', () => {
    const src = fs.readFileSync(new URL('../../minimaxi/loop.mjs', import.meta.url), 'utf8');
    assert.ok(!/\brecordPlanFaults\s*[(,}]|\bplanOf\s*[(,}]/.test(src.replace(/^\s*\*.*$/gm, '')), 'the loop imports or calls no plan check of its own: the generator\'s readRun runs recordPlanFaults');
    assert.ok(!/'local '|\.answer\.md'/.test(src), 'the thread format is the generator\'s LOCAL_THREAD and ANSWER_SUFFIX, never a literal copy');
});

test('the usage text and the defaults come from the loop\'s LOOP_LIMITS (negative control: a hand-typed default in loop.mjs is red)', () => {
    assert.deepEqual([ARG_DEFAULTS.maxRounds, ARG_DEFAULTS.maxSteps], [LOOP_LIMITS.rounds, LOOP_LIMITS.builderTurns]);
    assert.ok(USAGE.includes('[--max-rounds ' + LOOP_LIMITS.rounds + ']') && USAGE.includes('[--max-steps ' + LOOP_LIMITS.builderTurns + ']'), USAGE);
    assert.throws(() => parseArgs(['--nope']), (e) => e.message === 'loop: unknown argument --nope — usage: ' + USAGE);
    const a = parseArgs(['--bridge', 'http://x/bridge', '--brain', 'local', '--outline', 'o']);
    assert.equal(a.maxRounds, LOOP_LIMITS.rounds);
    const src = fs.readFileSync(new URL('../../minimaxi/loop.mjs', import.meta.url), 'utf8');
    assert.ok(!/--max-(rounds|steps) \d/.test(src), 'minimaxi/loop.mjs hand-types a limit in its usage text');
});

test('publish or draft is the generator\'s call: on a chain whose first Record is incomplete and whose hand-back is complete, the loop publishes', () => {
    const fixture = new URL('./fixtures/record-mmp41d/record', import.meta.url).pathname;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-loop-mode-'));
    const dir = path.join(root, 'out', 'mmp41d', 'record');
    fs.cpSync(fixture, dir, { recursive: true });
    assert.equal(fs.existsSync(path.join(dir, 'record-01', 'clip-01.mp4')), false, 'the fixture\'s record-01 is incomplete (its clip not kept)');
    assert.deepEqual([handBackState(dir).complete, handBackState(dir).planFaults], [true, []], 'the loop asks the generator, which measures the hand-back Record and its plan against the chain');
});

const Q_ANSWER = 'THIS IS: a question\nFrom dse-tunnel-rebuild-card.md: the card calls it impossible to explain classically; that is its claim.\n' + fence('json:answer', '{"memories": ["dse-tunnel-rebuild-card.md"]}');

test('a QUESTION on MiniMaxi: the Designer\'s answer is the run — the report keeps it and its memory files; no Builder, no Owl, no hand beyond the stage\'s inventory, no Record, no memory (negative control: the same words read as an outline stop the loop, nothing built)', async () => {
    const { root, env } = fakeRoot({ designer: [Q_ANSWER], builder: [], owl: [] });
    fs.writeFileSync(path.join(root, 'kb', 'GodsWorld', 'memories', 'dse-tunnel-rebuild-card.md'), '# Memory: Double slit — card\n');   // the file the answer names exists
    const rep = await runLoop(parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'why is the double slit thought to be classically impossible?', '--run', 'mmq']), env);
    assert.deepEqual(calls(root).map((c) => c.op === 'ask' ? 'ask:' + c.args.thread : c.op === 'record' ? 'record ' + c.args : c.op), ['record begin', 'inventory', 'ask:mmq-designer', 'record abandon'], 'the stage is read, the Designer asked, and nothing else (the round\'s Record chain begun and let go)');
    assert.deepEqual(rep.answer, { reading: 'question', words: 'From dse-tunnel-rebuild-card.md: the card calls it impossible to explain classically; that is its claim.', memories: ['dse-tunnel-rebuild-card.md'], unnamed: [] });
    assert.equal(rep.outcome, 'answered in words (question), drawing on dse-tunnel-rebuild-card.md: no build, no Record');
    assert.equal(rep.record, undefined); assert.equal(rep.memory, undefined); assert.deepEqual(rep.rounds, []);
    assert.ok(!fs.existsSync(path.join(env.out, 'mmq')), 'no Record folder and no memory draft');
    assert.deepEqual(published(root), ['dse-tunnel-rebuild-card.md'], 'nothing reaches kb/ or site/ beyond the card the test put there');
    const saved = JSON.parse(fs.readFileSync(path.join(env.out, 'runs', 'mmq.json'), 'utf8'));
    assert.deepEqual(saved.answer.memories, ['dse-tunnel-rebuild-card.md'], 'the run report on disk keeps the answer');
    // negative control: the reading forced to an outline — the loop stops loudly and builds nothing
    const forced = fakeRoot({ designer: [Q_ANSWER.replace(/^THIS IS: a question/, 'THIS IS: an outline')], builder: [], owl: [] });
    await assert.rejects(runLoop(parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'why?', '--run', 'mmqf']), forced.env), /\[designer → outline\]: "THIS IS: an outline" ends with no json:answer block and ONE json:plan block, found 1 json:answer and 0 json:plan/);
    assert.deepEqual(calls(forced.root).map((c) => c.op === 'record' ? 'record ' + c.args : c.op), ['record begin', 'inventory', 'ask', 'record abandon'], 'nothing built; the chain begun is let go');
});

test('MiniMaxi refuses an answer naming a memory file that is not in kb/GodsWorld, listed once per run (negative control: the same answer passes once the file exists, by bare name or KB path)', async () => {
    const ghost = 'THIS IS: a question\nFrom r9-ghost-card.md: a card I remember.\n' + fence('json:answer', '{"memories": ["r9-ghost-card.md"]}');
    const g = fakeRoot({ designer: [ghost], builder: [], owl: [] });
    await assert.rejects(runLoop(parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'why?', '--run', 'mmqg']), g.env),
        /Maxi stopped: the Designer's answer names r9-ghost-card\.md, which is not in kb\/GodsWorld — an answer draws only on memories that exist\./);
    assert.deepEqual(calls(g.root).map((c) => c.op === 'record' ? 'record ' + c.args : c.op), ['record begin', 'inventory', 'ask', 'record abandon'], 'nothing acts after the refused answer (the chain is let go)');
    assert.match(JSON.parse(fs.readFileSync(path.join(g.env.out, 'runs', 'mmqg.json'), 'utf8')).outcome, /^STOPPED: Maxi stopped: the Designer's answer names r9-ghost-card\.md/);
    // the KB listing: bare names anywhere under kb/GodsWorld, paths relative to it (with or without the kb/GodsWorld/ prefix)
    const files = ['memories/dse-tunnel-rebuild-card.md', 'robotic-imagination.md'];
    assert.deepEqual(ghostMemories(['dse-tunnel-rebuild-card.md', 'robotic-imagination.md', 'kb/GodsWorld/robotic-imagination.md', 'memories/dse-tunnel-rebuild-card.md'], files), []);
    assert.deepEqual(ghostMemories(['r9-ghost-card.md', 'kb/GodsWorld/memories/robotic-imagination.md', 'memories/x.md'], files), ['r9-ghost-card.md', 'kb/GodsWorld/memories/robotic-imagination.md', 'memories/x.md']);
    // negative control: with the file in the KB the same answer is the run
    const ok = fakeRoot({ designer: [ghost], builder: [], owl: [] });
    fs.writeFileSync(path.join(ok.root, 'kb', 'GodsWorld', 'memories', 'r9-ghost-card.md'), 'x\n');
    assert.match((await runLoop(parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'why?', '--run', 'mmqh']), ok.env)).outcome, /^answered in words \(question\), drawing on r9-ghost-card\.md/);
    assert.deepEqual(kbFiles(ok.root).sort(), ['memories/r9-ghost-card.md']);
});

test('a MiniMaxi trial still refuses an answer whose words never name a listed memory, as the parser refused it before (negative control: the trial\'s refusal planted out lets it through as answered)', async () => {
    const reply = 'THIS IS: a question\nThe card calls it impossible to explain classically.\n' + fence('json:answer', '{"memories": ["dse-tunnel-rebuild-card.md"]}');
    const { root, env } = fakeRoot({ designer: [reply], builder: [], owl: [] });
    fs.writeFileSync(path.join(root, 'kb', 'GodsWorld', 'memories', 'dse-tunnel-rebuild-card.md'), '# Memory: Double slit — card\n');
    await assert.rejects(runLoop(parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'why?', '--run', 'mmu']), env),
        /^Error: Maxi stopped: \[designer → answer\]: the answer's words never name dse-tunnel-rebuild-card\.md — a memory an answer draws on is named in its words\.$/);
    const saved = JSON.parse(fs.readFileSync(path.join(env.out, 'runs', 'mmu.json'), 'utf8'));
    assert.deepEqual(saved.answer.unnamed, ['dse-tunnel-rebuild-card.md'], 'the report keeps the fault');
    assert.match(saved.outcome, /^STOPPED: Maxi stopped: \[designer → answer\]: the answer's words never name/, 'reported stopped, never answered');
    // the plant: minimaxi/loop.mjs without its refusal, imported from a copy beside the original
    const src = fs.readFileSync(new URL('../../minimaxi/loop.mjs', import.meta.url), 'utf8');
    const planted = src.replace(/\n {12}if \(e\.unnamed\.length\) \{ throw [^\n]*/, '')
        .replace(/from '\.\.\//g, "from '" + new URL('../../', import.meta.url).href).replace(/from '\.\//g, "from '" + new URL('../../minimaxi/', import.meta.url).href);
    assert.notEqual(planted, src, 'the plant must remove the refusal');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-planted-'));   // the copy never sits in the tree
    const copy = path.join(dir, 'loop.mjs');
    fs.writeFileSync(copy, planted);
    try {
        const p = await import(pathToFileURL(copy).href);
        const f = fakeRoot({ designer: [reply], builder: [], owl: [] });
        fs.writeFileSync(path.join(f.root, 'kb', 'GodsWorld', 'memories', 'dse-tunnel-rebuild-card.md'), '# Memory: Double slit — card\n');
        const rep = await p.runLoop(p.parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'why?', '--run', 'mmup']), f.env);
        assert.match(rep.outcome, /^answered in words/, 'negative control: without the refusal the trial passes it as answered');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
