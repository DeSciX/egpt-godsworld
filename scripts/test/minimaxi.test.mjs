/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * minimaxi.test.mjs — MiniMaxi's body (minimaxi/): the bridge, the node question door, the stills.
 *
 * Gates (each with its negative control):
 *   1. the bridge runs only hands of the HANDS table: an unknown op is refused BY NAME and nothing runs
 *      (control: a table hand does run); one hand at a time; `ask` is refused under --brain none;
 *   2. the door builds its params through maxi-ask.js only: what reaches the CLI equals buildAskParams'
 *      own output (footageUserInput, the thread's KB list, previous_interaction_id chained PER THREAD),
 *      threads.json is {<thread>: {interaction_id, turns, media_tokens_total}}; and ask-door.mjs spells no
 *      field of the command (a planted `app_id` / `previous_interaction_id` / command name is red);
 *   3. stills are sampled: every Nth frame, at most `stills`, from a real MP4 (ffmpeg-made) — a zero
 *      budget is refused;
 *   4. a forbidden port and a busy port are refused (control: the same port passes once freed);
 *   5. the CLI's output is read by shape and its PROD origin line is required (stderr or stdout);
 *   6. footage merges never overwrite a hand's keys; a door answer without a boolean `asked` throws;
 *   7. maxi-ask: a words-only turn has no media key; [] media is refused; [] KBs pass; resume is checked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { HANDS } from '../../site/app-assets/maxi-hands.js';
import { ASK, buildAskParams, createThread, footageUserInput } from '../../site/app-assets/maxi-ask.js';
import { createAskDoor, askThread, sampleIndices, writeStills, parseCliOutput, readThreads } from '../../minimaxi/ask-door.mjs';
import { bridgeHandler, assertHand, assertPortFree, withFootage, FORBIDDEN_PORTS } from '../../minimaxi/body.mjs';
import { parseArgs, requestOf } from '../../minimaxi/hand.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'minimaxi-test-'));

/** A tiny real MP4 (ffmpeg testsrc), `n` frames. */
function makeMp4(dir, n) {
    const f = path.join(dir, 'clip.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x48:rate=10', '-frames:v', String(n), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', f]);
    return f;
}

/** An in-memory request/response pair for the bridge handler — no socket, no port. */
async function call(handler, method, url, body) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method; req.url = url;
    let status = null; let text = '';
    const res = { writeHead(s) { status = s; }, end(t) { text = t; } };
    await handler(req, res);
    return { status: status, body: JSON.parse(text) };
}

// ── 1. the bridge ─────────────────────────────────────────────────────────────────────────────

test('the bridge refuses a hand not in HANDS by name, runs a table hand, and serialises', async () => {
    const ran = [];
    let release;
    const body = { brain: 'none', stills: 8, current: null, runHand: async (h, a) => { ran.push(h); if (h === 'see') { await new Promise((r) => { release = r; }); } return { ok: { hand: h, args: a } }; } };
    const h = bridgeHandler(body);

    const bad = await call(h, 'POST', '/bridge/hand', { hand: 'fly', args: {} });
    assert.equal(bad.status, 404);
    assert.match(bad.body.error, /^unknown hand "fly" — not in the HANDS table/);
    assert.ok(Object.keys(HANDS).every((k) => bad.body.error.includes(k)), 'the refusal lists the table');
    assert.deepEqual(ran, [], 'a refused op runs nothing');
    assert.throws(() => assertHand('toString'), /unknown hand "toString"/, 'an inherited property is not a hand');

    // control: a table hand runs, with its args
    const ok = await call(h, 'POST', '/bridge/hand', { hand: 'inventory' });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.result, { hand: 'inventory', args: {} });

    // one at a time
    const first = call(h, 'POST', '/bridge/hand', { hand: 'see', args: {} });
    await new Promise((r) => setImmediate(r));
    const second = await call(h, 'POST', '/bridge/hand', { hand: 'pause' });
    assert.equal(second.status, 409);
    assert.match(second.body.error, /busy: hand "see" is still running/);
    release();
    assert.equal((await first).status, 200);

    const asked = await call(h, 'POST', '/bridge/ask', { thread: 't', user_input: 'x' });
    assert.equal(asked.status, 409);
    assert.match(asked.body.error, /--brain none — a question needs --brain platform/);

    const hands = await call(h, 'GET', '/bridge/hands');
    assert.deepEqual(hands.body.hands, Object.keys(HANDS));
});

test('hand.mjs: `ask` goes to /bridge/ask, a hand to /bridge/hand with its flags; HANDS has no hand named ask', () => {
    assert.ok(!Object.prototype.hasOwnProperty.call(HANDS, 'ask'), 'a hand named `ask` would be shadowed by hand.mjs ask');
    const a = requestOf(parseArgs(['--bridge', 'http://x/bridge', '--thread', 'builder', '--kb', 'GodsWorld,Other', '--no-ask', 'see', '{"fps":10}']));
    assert.deepEqual(a, { route: '/hand', body: { hand: 'see', args: { fps: 10 }, thread: 'builder', knowledgebase_names: ['GodsWorld', 'Other'], ask: false } });
    assert.deepEqual(requestOf(parseArgs(['--bridge', 'u', '--kb', '', 'see'])).body.knowledgebase_names, []);
    assert.deepEqual(requestOf(parseArgs(['--bridge', 'u', 'ask', '{"thread":"owl","user_input":"hi"}'])), { route: '/ask', body: { thread: 'owl', user_input: 'hi' } });
    assert.throws(() => parseArgs(['--bridge', 'u', 'see', '{bad']), /not JSON/);
});

// ── 2. the door builds through maxi-ask only ──────────────────────────────────────────────────

test('the platform door sends exactly maxi-ask\'s params, chained per thread, and keeps threads.json', async () => {
    const dir = tmp();
    const mp4 = makeMp4(dir, 12);
    const data = fs.readFileSync(mp4).toString('base64');
    const sent = [];
    let n = 0;
    const run = async (params) => { sent.push(params); n += 1; return { status: 'OK', message: { status: 'OK', response: 'I saw ' + n, interaction_id: 'id-' + n, usage: { media_tokens: 100 * n } } }; };
    const out = path.join(dir, 'out');
    const door = createAskDoor({ brain: 'platform', outDir: out, run: run });
    const q = (note) => ({ op: 'see', note: note, media: [{ mime_type: 'video/mp4', data: data, label: 'SEE' }] });

    const r1 = await door(q('one'), { hand: 'see', stamp: 's1', stills: 4, thread: 'builder', knowledgebase_names: ['GodsWorld'] });
    const r2 = await door(q('two'), { hand: 'see', stamp: 's2', stills: 4, thread: 'owl', knowledgebase_names: [] });
    const r3 = await door(q('three'), { hand: 'see', stamp: 's3', stills: 4, thread: 'builder', knowledgebase_names: ['GodsWorld'] });

    const want = (note, kbs, prev) => buildAskParams({ op: 'see', userInput: footageUserInput(note), media: q(note).media, knowledgebaseNames: kbs, previousInteractionId: prev });
    assert.deepEqual(sent[0], want('one', ['GodsWorld'], null));
    assert.deepEqual(sent[1], want('two', [], null), 'a new thread starts fresh');
    assert.deepEqual(sent[2], want('three', ['GodsWorld'], 'id-1'), 'the builder thread continues from ITS last answer, not the owl\'s');
    assert.equal(r1.asked, true); assert.equal(r3.interaction_id, 'id-3'); assert.equal(r2.media_tokens, 200);
    assert.ok(fs.existsSync(r1.clip) && r1.frames.length >= 1 && r1.frames.every((f) => fs.existsSync(f)));
    assert.deepEqual(readThreads(path.join(out, 'threads.json')), {
        builder: { interaction_id: 'id-3', turns: 2, media_tokens_total: 400 },
        owl: { interaction_id: 'id-2', turns: 1, media_tokens_total: 200 }
    });

    // a words-only turn on the same thread: no media key reaches the CLI
    await askThread({ outDir: out, run: run, thread: 'builder', knowledgebase_names: ['GodsWorld'], user_input: 'plan it' });
    assert.ok(!('media' in sent[3]));
    assert.equal(sent[3].previous_interaction_id, 'id-3');

    // a refusal leaves threads.json alone, and names the kept clip
    const refusing = createAskDoor({ brain: 'platform', outDir: out, run: async () => ({ status: 'ERROR', message: 'expired' }) });
    await assert.rejects(refusing(q('four'), { hand: 'see', stamp: 's4', stills: 2, thread: 'builder' }), /Maxi was NOT shown the footage — .*refused.*the clip is kept: /);
    assert.equal(readThreads(path.join(out, 'threads.json')).builder.turns, 3);

    // no thread under platform → refused by name (unless ask:false)
    await assert.rejects(door(q('five'), { hand: 'see', stamp: 's5', stills: 2 }), /asks on a NAMED thread — give hand.mjs --thread <name>, or --no-ask/);
    const kept = await door(q('six'), { hand: 'see', stamp: 's6', stills: 2, ask: false });
    assert.deepEqual(Object.keys(kept).sort(), ['asked', 'clip', 'frames']);
    assert.equal(kept.asked, false);
    assert.equal(sent.length, 4, 'neither the refusal nor the no-ask hand reached the CLI');

    // --brain none: films and keeps, never calls
    const none = createAskDoor({ brain: 'none', outDir: out, run: () => { throw new Error('called'); } });
    const r = await none(q('seven'), { hand: 'dragTo', stamp: 's7', stills: 3, thread: 'builder' });
    assert.equal(r.asked, false); assert.ok(r.clip.endsWith('s7-dragTo.mp4'));
});

/** THROWS naming every spelling of the question command's own fields in a source text. */
export function assertNoRetypedParams(text, where) {
    const bad = ['app_id', 'previous_interaction_id', "'" + ASK.command + "'", '"' + ASK.command + '"'].filter((k) => text.includes(k));
    assert.deepEqual(bad, [], where + ' spells the question command\'s own fields/name — build them through maxi-ask.js');
}

test('ask-door.mjs and body.mjs spell none of the question command\'s fields (planted spellings are red)', () => {
    for (const rel of ['minimaxi/ask-door.mjs', 'minimaxi/body.mjs', 'minimaxi/hand.mjs']) {
        assertNoRetypedParams(fs.readFileSync(path.join(REPO, rel), 'utf8'), rel);
    }
    assert.throws(() => assertNoRetypedParams('const p = { app_id: "egpt-godsworld" };', 'planted'), /spells/);
    assert.throws(() => assertNoRetypedParams('p.previous_interaction_id = id;', 'planted'), /spells/);
    assert.throws(() => assertNoRetypedParams("call('ask_question_to_app', p)", 'planted'), /spells/);
});

// ── 3. stills ─────────────────────────────────────────────────────────────────────────────────

test('stills: every Nth frame, at most `stills`, written from a real MP4', () => {
    assert.deepEqual(sampleIndices(51, 8), [0, 7, 14, 21, 28, 35, 42, 49]);
    assert.deepEqual(sampleIndices(61, 8), [0, 8, 16, 24, 32, 40, 48, 56]);
    assert.deepEqual(sampleIndices(5, 8), [0, 1, 2, 3, 4], 'never more stills than frames');
    assert.throws(() => sampleIndices(10, 0), /`stills` must be a whole number ≥ 1/);
    assert.throws(() => sampleIndices(0, 8), /nothing to sample/);

    const dir = tmp();
    const mp4 = makeMp4(dir, 20);
    const files = writeStills(mp4, path.join(dir, 'stills'), 8);
    assert.deepEqual(files.map((f) => path.basename(f)), ['frame-00.png', 'frame-03.png', 'frame-06.png', 'frame-09.png', 'frame-12.png', 'frame-15.png', 'frame-18.png']);
    files.forEach((f) => assert.equal(fs.readFileSync(f).subarray(1, 4).toString(), 'PNG'));
});

// ── 4. ports ──────────────────────────────────────────────────────────────────────────────────

test('a forbidden or busy port is refused; the same port passes once freed', async () => {
    for (const p of FORBIDDEN_PORTS) { await assert.rejects(assertPortFree(p), /is forbidden/); }
    await assert.rejects(assertPortFree(80), /1024–65535/);
    const srv = net.createServer();
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    await assert.rejects(assertPortFree(port), new RegExp('--port ' + port + ' is busy \\(something listens on 127\\.0\\.0\\.1'));
    await new Promise((r) => srv.close(r));
    assert.equal(await assertPortFree(port), port);
});

// ── 5. the CLI's output ───────────────────────────────────────────────────────────────────────

test('the CLI output is read by shape and needs the PROD origin line', () => {
    const json = '{\n "status": "OK",\n "message": {"status":"OK","response":"r","interaction_id":"i"}\n}\n';
    const origin = 'env: prod (.descix/workspace.json env.apiUrl) https://descix.net\nExecuting ask_question_to_app...\n';
    assert.equal(parseCliOutput(json, origin).message.interaction_id, 'i', 'measured: --json piped puts the origin on stderr');
    assert.equal(parseCliOutput(origin + json, '').status, 'OK', 'origin on stdout, JSON sliced from the first {');
    assert.throws(() => parseCliOutput(json, ''), /printed no `env: prod/);
    assert.throws(() => parseCliOutput(json, 'env: dev (.descix/workspace.json env.apiUrl) https://dev.descix.net\n'), /printed no `env: prod/);
    assert.throws(() => parseCliOutput('', origin), /no JSON object/);
});

// ── 6. merges and the asked flag ──────────────────────────────────────────────────────────────

test('footage never overwrites a hand\'s keys; a door answer needs a boolean `asked`', async () => {
    assert.deepEqual(withFootage({ frames: 51, mime: 'video/mp4' }, { clip: 'c.mp4', frames: ['f0.png'], thread: null }),
        { mime: 'video/mp4', frameCount: 51, clip: 'c.mp4', frames: ['f0.png'] });
    assert.deepEqual(withFootage({ frames: 3 }, { clip: 'c', frames: [], thread: 'probe', media_tokens: 300 }),
        { frameCount: 3, clip: 'c', frames: [], thread: 'probe', media_tokens: 300 });
    assert.throws(() => withFootage({ clip: 'mine' }, { clip: 'c', frames: [] }), /already carries \[clip\]/);
    assert.throws(() => withFootage({ frames: 3, frameCount: 9 }, { clip: 'c', frames: [] }), /already carries \[frameCount\]/);

    const lab = (answer) => ({
        fetchMemory: async () => ({ mime_type: 'video/mp4', data: 'AAAA', bytes: 3, url: 'u' }),
        ask: async () => answer
    });
    const shown = await HANDS.showMemory.run(lab({ asked: false }), { id: 'm' });
    assert.equal(shown.asked, false, 'asked:false passes through — never forced true');
    await assert.rejects(HANDS.showMemory.run(lab({ interaction_id: 'x' }), { id: 'm' }), /without a boolean `asked`/);
});

// ── 7. maxi-ask's new options ─────────────────────────────────────────────────────────────────

test('maxi-ask: words-only turns, explicit [] media refused, per-thread KBs, resume checked', async () => {
    const p = buildAskParams({ op: 'designer', userInput: 'plan' });
    assert.deepEqual(Object.keys(p).sort(), ['app_id', 'knowledgebase_names', 'user_input']);
    assert.deepEqual(p.knowledgebase_names, ASK.knowledgebase_names.slice());
    assert.throws(() => buildAskParams({ op: 'see', userInput: 'x', media: [] }), /Omit `media` for a words-only turn/);
    assert.deepEqual(buildAskParams({ userInput: 'x', knowledgebaseNames: [] }).knowledgebase_names, []);
    assert.throws(() => buildAskParams({ userInput: 'x', knowledgebaseNames: [''] }), /array of KB names/);
    assert.throws(() => buildAskParams({ userInput: 'x', knowledgebaseNames: 'GodsWorld' }), /array of KB names/);

    const seen = [];
    const t = createThread({ call: async (c, params) => { seen.push(params); return { status: 'OK', response: 'ok', interaction_id: 'next' }; }, knowledgebaseNames: ['K'], resume: { interaction_id: 'kept', turns: 4 } });
    await t.ask({ op: 'builder', userInput: 'go' });
    assert.equal(seen[0].previous_interaction_id, 'kept');
    assert.deepEqual(seen[0].knowledgebase_names, ['K']);
    assert.equal(t.turns, 5);
    assert.throws(() => createThread({ call: () => {}, resume: { interaction_id: '', turns: 1 } }), /resume must be/);

    const refused = createThread({ call: async () => { throw new Error('no'); } });
    await assert.rejects(refused.ask({ op: 'designer', userInput: 'plan' }), /^Error: designer: the question was NOT answered — no$/);
});

// ── 8. playwright is declared, pinned EQUAL to the eyes' own dependency ───────────────────────

/** THROWS unless minimaxi declares playwright at exactly the version the eyes package depends on. */
export function assertPlaywrightPinMatchesEyes(pkg, lock) {
    const eyes = lock && lock.packages && lock.packages['node_modules/@descix/frqtl-sdk'];
    assert.ok(eyes && eyes.dependencies && typeof eyes.dependencies.playwright === 'string', 'package-lock.json records no playwright dependency of @descix/frqtl-sdk');
    const ours = pkg.dependencies && pkg.dependencies.playwright;
    assert.equal(ours, eyes.dependencies.playwright, 'minimaxi/package.json must declare playwright EXACTLY at the eyes\' own pin (@descix/frqtl-sdk ' + eyes.version + ' depends on playwright ' + eyes.dependencies.playwright + '), got ' + JSON.stringify(ours));
    return ours;
}

test('minimaxi declares playwright at exactly the eyes package\'s own pin (a wrong pin is red)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'minimaxi', 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'minimaxi', 'package-lock.json'), 'utf8'));
    assert.equal(assertPlaywrightPinMatchesEyes(pkg, lock), '1.61.0');
    assert.throws(() => assertPlaywrightPinMatchesEyes({ dependencies: { playwright: '^1.61.0' } }, lock), /EXACTLY at the eyes' own pin/);
    assert.throws(() => assertPlaywrightPinMatchesEyes({ dependencies: {} }, lock), /EXACTLY at the eyes' own pin/);
});
