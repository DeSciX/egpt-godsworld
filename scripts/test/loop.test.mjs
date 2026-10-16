/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * loop.test.mjs — minimaxi/loop.mjs routed against a FAKE body (a stand-in hand.mjs that plays scripted
 * role answers and returns a clip of real files), so the routing is gated without a browser or the CLI.
 *
 * Gates:
 *   1. approve path: Designer → plan, Builder → hands → clip on its NEXT turn as media → done, Owl on a
 *      fresh thread sees outline + prediction + the clip and nothing of the plan → on the platform brain NO
 *      memory, only the record and the command for a look; scripts/gen-memories-seen.mjs refuses that record
 *      without --looked-by (and a platform looker), and writes the draft with a human's look in the gate's format;
 *   2. a malformed Builder answer stops the loop loudly (exit path, report says STOPPED, no memory);
 *   3. json:done before any clip stops loudly;
 *   4. revise → back to the Builder with the Owl's reasons; a revise on every round stops at max rounds;
 *   5. the local brain writes the turn file with the sampled frame paths and reads the answer file; its
 *      approve writes the draft with the local Owl's looked line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runLoop, parseArgs, sampleFrames, USAGE, ARG_DEFAULTS } from '../../minimaxi/loop.mjs';
import { lookedFaults } from '../gen-memories-seen.mjs';
import { LOOP_LIMITS } from '../../site/app-assets/maxi-loop.js';

const fence = (tag, body) => '```' + tag + '\n' + body + '\n```';
const PLAN = { scene: 'cl1a-mirror', changes: [{ object: 'mirror', param: 'orientationDeg', value: 30, why: 'asked' }], hands: ['sceneSource', 'openSketch', 'see'], prediction: 'the beam leaves at 60 degrees' };
const DESIGNER = 'Tony, from the mirror memory.\n' + fence('json:plan', JSON.stringify(PLAN));
const B_SEE = 'PREDICTION: the beam turns up-right\n' + fence('json:call:see', '{}');
const B_DONE = 'The clip shows the beam leaving up and to the right.\n' + fence('json:done', '{}');
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
    fs.writeFileSync(path.join(root, 'hand.mjs'), `
import fs from 'node:fs'; import path from 'node:path';
const root = ${JSON.stringify(root)};
const raw = process.argv.slice(2); const noAsk = raw.includes('--no-ask'); const argv = raw.filter((x) => x !== '--no-ask'); const op = argv[2]; const args = JSON.parse(argv[3]);
if (op !== 'ask' && !noAsk) { console.log(op + ': under --brain platform a footage hand needs --thread or --no-ask'); process.exit(1); }
if (op === 'ask' && noAsk) { console.log('ask with --no-ask'); process.exit(1); }
const log = path.join(root, 'calls.jsonl'); fs.appendFileSync(log, JSON.stringify({ op, args }) + '\\n');
const script = JSON.parse(fs.readFileSync(path.join(root, 'script.json'), 'utf8'));
const stF = path.join(root, 'state.json'); const st = fs.existsSync(stF) ? JSON.parse(fs.readFileSync(stF, 'utf8')) : {};
if (op === 'ask') {
  const role = /-designer$/.test(args.thread) ? 'designer' : /-builder$/.test(args.thread) ? 'builder' : 'owl';
  st[role] = (st[role] || 0) + 1; fs.writeFileSync(stF, JSON.stringify(st));
  const answer = script[role][st[role] - 1];
  if (answer === undefined) { console.log('ask refused: script ran out for ' + role); process.exit(1); }
  console.log(JSON.stringify({ answer, interaction_id: 'iid-' + args.thread + '-' + st[role], usage: { input_tokens: 100, output_tokens: 10, media_tokens: args.media ? 300 : 0, total_tokens: 110 }, model: 'fake' }));
} else if (op === 'see') {
  const d = path.join(root, 'out', 'clips', 'c1');
  console.log(JSON.stringify({ mime: 'video/mp4', frames: Array.from({ length: 10 }, (_, i) => path.join(d, 'f' + i + '.png')), clip: path.join(d, 'clip.mp4'), seconds: 5.1, label: 'SEE — ticks 1-251, 51 frames', asked: false }));
} else if (op === 'inventory') {
  console.log(JSON.stringify({ tick: 5, scene: '1A · Mirror', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', dimensions: 2, canvas: [600, 400], camera: null, viewer: null, objects: [{ name: 'mirror', kind: 'Wall', authority: 'rect', center: [370, 200, 0], rect: [360, 80, 20, 240] }] }));
} else if (op === 'openSketch' && args.source === 'bad') { console.log('openSketch: SyntaxError: Unexpected token'); process.exit(1); }
else { console.log(JSON.stringify({ ok: op })); }
`);
    return { root, env: { root, out: path.join(root, 'out'), handCli: path.join(root, 'hand.mjs') } };
}
const calls = (root) => fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const args = (extra) => parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'platform', '--outline', 'a laser hitting a mirror at 30 degrees', '--run', 'mmtest'].concat(extra || []));

const GEN_SEEN = new URL('../gen-memories-seen.mjs', import.meta.url).pathname;
/** The generator CLI (it only refuses here: a refusal exits 2 before writing anything). */
const genCli = (argv) => spawnSync(process.execPath, [GEN_SEEN].concat(argv), { encoding: 'utf8' });

test('approve on the platform brain: three threads, the clip rides on the Builder\'s next turn and to a fresh Owl; no memory without a look', async () => {
    const { root, env } = fakeRoot({ designer: [DESIGNER], builder: ['PREDICTION: the sketch text\n' + fence('json:call:sceneSource', '{"id":"cl1a-mirror"}'), B_SEE, B_DONE], owl: [APPROVE] });
    const rep = await runLoop(args(), env);
    assert.deepEqual(Object.keys(rep.threads), ['mmtest-designer', 'mmtest-builder', 'mmtest-owl-r1']);
    const asks = calls(root).filter((c) => c.op === 'ask');
    assert.deepEqual(asks.map((c) => c.args.knowledgebase_names), [['GodsWorld'], ['GodsWorld'], ['GodsWorld'], ['GodsWorld'], ['General']]);
    assert.deepEqual(asks.map((c) => !!c.args.media), [false, false, false, true, true], 'the clip rides on the turn after see, and to the Owl');
    assert.ok(!/clip\.mp4|f\d\.png/.test(asks[3].args.user_input), 'the body\'s clip and still paths (FOOTAGE_KEYS) ride as media, never in the Builder\'s turn text');
    const owl = asks[4].args;
    assert.ok(!/orientationDeg|sceneSource|cl1a-mirror/.test(owl.user_input), 'the Owl sees nothing of the plan or the build');
    assert.match(owl.user_input, /THE BUILDER'S PREDICTION: the beam turns up-right/);
    assert.equal(rep.threads['mmtest-builder'].usage.media_tokens, 300);
    assert.equal(rep.memory, undefined, 'the platform Owl\'s approve writes no memory');
    assert.ok(!fs.existsSync(path.join(root, 'kb', 'GodsWorld', 'memories', 'mm-cl1a-mirror-test-seen.md')));
    assert.ok(!fs.existsSync(path.join(root, 'site', 'memories', 'mm-cl1a-mirror-test')));
    assert.match(rep.outcome, /^approved in round 1 by the platform Owl: no memory written until a human or the seat looks at the stills/);
    assert.equal(rep.awaitingLook.stills.length, 10);
    assert.match(rep.awaitingLook.command, /^node scripts\/gen-memories-seen\.mjs out\/runs\/mmtest\.record\.json --looked-by <human\|seat>:<role>/);
    const recFile = path.join(root, rep.awaitingLook.record);
    // the generator refuses the record without a look, and with the platform brain as the looker; nothing is written
    for (const [argv, why] of [[[recFile], /--looked-by is required/], [[recFile, '--looked-by', 'platform:mmtest-owl-r1', '--stills', '8', '--account', 'contact: x'], /platform brain/],
        [[recFile, '--looked-by', 'local-owl:gemini-3.8-flash', '--stills', '8', '--account', 'contact: x'], /platform brain/], [[recFile, '--looked-by', 'human:someone', '--account', 'contact: x'], /how many stills/],
        [[recFile, '--looked-by', 'human:Sam', '--stills', '3', '--account', 'contact: x'], /never a person's name/]]) {
        const r = genCli(argv);
        assert.equal(r.status, 2, 'refused: ' + argv.join(' '));
        assert.match(r.stderr, why);
    }
    assert.ok(!fs.existsSync(path.join(root, 'kb', 'GodsWorld', 'memories', 'mm-cl1a-mirror-test-seen.md')), 'a refusal writes nothing');
    const rec = JSON.parse(fs.readFileSync(recFile, 'utf8'));
    const { writeSeenDraft } = await import('../gen-memories-seen.mjs');
    assert.throws(() => writeSeenDraft(rec, undefined, root), /no look/);
    assert.throws(() => writeSeenDraft(rec, { by: 'local-owl', who: 'x.md', stills: 8, account: 'a' }, root), /only a local-brain run has a local Owl/);
    const written = writeSeenDraft(rec, { by: 'human', who: 'the-seat-owner', stills: 10, account: 'contact: mirror middle; after: up-right; passes: no' }, root);
    const md = fs.readFileSync(path.join(root, written.memory), 'utf8');
    assert.match(md, /^looked: human the-seat-owner on 10 stills of memories\/mm-cl1a-mirror-test\/clip\.mp4 — contact: mirror middle; after: up-right; passes: no$/m);
    assert.deepEqual(lookedFaults(md, 'mm-cl1a-mirror-test', path.join(root, 'site')), [], 'the gate passes the human-looked draft');
    assert.match(md, /RECORD, not Maxi's own sighting/);
    assert.match(md, /memories\/mm-cl1a-mirror-test\/clip\.mp4/);
    for (const f of ['clip.mp4', 'early.png', 'mid.png', 'settled.png']) assert.ok(fs.existsSync(path.join(root, 'site', 'memories', 'mm-cl1a-mirror-test', f)), f);
    assert.match(md, /Seen, the Builder's words on the clip: The clip shows the beam leaving up and to the right\./);
    assert.match(md, /The Owl's account \(from the pixels, before its verdict\): contact — mirror, middle third; after — up and to the left; passes — no\./);
    assert.match(md, /Threads: designer iid-mmtest-designer-1 · builder iid-mmtest-builder-3 · owl iid-mmtest-owl-r1-1\./);
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

test('a Builder that hands back without describing its clip stops loudly', async () => {
    const { env } = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, fence('json:done', '{}')], owl: [APPROVE] });
    await assert.rejects(runLoop(args(), env), /did not say what its clip shows/);
});

test('a revise needs a new clip: done right after a revise stops', async () => {
    const { env } = fakeRoot({ designer: [DESIGNER], builder: [B_SEE, B_DONE, B_DONE], owl: [REVISE] });
    await assert.rejects(runLoop(args(), env), /json:done before filming any clip/);
});

test('local brain: turn files carry the sampled frames; answers are read from the answer files', async () => {
    const { env } = fakeRoot({});
    const a = parseArgs(['--bridge', 'http://fake/bridge', '--brain', 'local', '--outline', 'a laser hitting a mirror at 30 degrees', '--run', 'mmlocal', '--frames', '4', '--answer-timeout', '20']);
    const dir = path.join(env.out, 'turns', 'mmlocal');
    const answers = { '01-designer': DESIGNER, '02-builder': B_SEE, '03-builder': B_DONE, '04-owl': APPROVE };
    // the "agents": answer each turn file as it appears (a child process, since the loop blocks this thread)
    const { spawn } = await import('node:child_process');
    const agent = spawn(process.execPath, ['-e', `
const fs=require('fs'),path=require('path');const dir=${JSON.stringify(dir)};const ans=${JSON.stringify(answers)};
const t=setInterval(()=>{for(const k of Object.keys(ans)){const f=path.join(dir,k+'.md');const o=path.join(dir,k+'.answer.md');if(fs.existsSync(f)&&!fs.existsSync(o)){fs.writeFileSync(o,ans[k]);delete ans[k];}}if(!Object.keys(ans).length)clearInterval(t);},200);setTimeout(()=>process.exit(0),20000);`]);
    const rep = await runLoop(a, env);
    agent.kill();
    assert.equal(rep.outcome, 'approved in round 1');
    const owlTurn = fs.readFileSync(path.join(dir, '04-owl.md'), 'utf8');
    const listed = owlTurn.match(/^- .*f\d\.png$/gm);
    assert.equal(listed.length, 4, 'four sampled frames');
    assert.match(listed[0], /f0\.png$/); assert.match(listed[3], /f9\.png$/);
    assert.ok(!/orientationDeg/.test(owlTurn));
    const md = fs.readFileSync(path.join(env.root, rep.memory.memory), 'utf8');
    assert.match(md, /^looked: local-owl maxi-owl on 4 stills of memories\/mm-cl1a-mirror-local\/clip\.mp4 — turn file out\/turns\/mmlocal\/04-owl\.md; contact: mirror, middle third; after: up and to the left; passes: no$/m);
    assert.deepEqual(lookedFaults(md, 'mm-cl1a-mirror-local', path.join(env.root, 'site')), []);
    assert.deepEqual(sampleFrames(['a', 'b'], 8), ['a', 'b']);
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
