/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * ask.test.mjs — the question door (site/app-assets/maxi-ask.js): footage reaches Maxi as media[] on
 * the question command the page calls itself, never through the chat pane.
 *
 * Gates (each with its negative control):
 *   1. no chat-attachment path remains: no `sendMedia` and no `delivered` result field in the lab's own
 *      code or the persona (the vendored DeSciXAppSDK.js, the platform's generated file, is not ours);
 *   2. a footage hand's question carries media[] — mime video/mp4, raw base64, the GodsWorld KB, app
 *      egpt-godsworld, user_input = the note + the look question; a door that drops media is RED;
 *   3. ONE thread: the second question carries the first answer's interaction_id; reset() starts fresh;
 *   4. the handbook's limits (8 attachments/turn, 8 MiB each, 16 MiB per turn) and the raw-base64 rule are
 *      refused BY NAME before anything is sent; exactly at the limit passes;
 *   5. a refused call is thrown verbatim (no retry: the door is called once); the answer is read from the
 *      measured body, wrapped or bare, and anything else is refused naming its keys;
 *   6. the persona's HOW YOU ACT teaches the new reality (the page delivers; answer_excerpt), not the chat;
 *   7. the human's teaching words on a Record ride its question verbatim (footageUserInput(note, teaching)); none = the
 *      look alone; a door that drops them is RED; the lab passes them, the node body's door refuses them by name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ASK, MEDIA_LIMITS, LOOK_QUESTION, buildAskParams, readAnswer, createThread, base64Bytes, footageUserInput, plainWords, excerpt
} from '../../site/app-assets/maxi-ask.js';
import { HANDS, HANDS_MARKERS } from '../../site/app-assets/maxi-hands.js';
import { withSketch } from './fake-runner.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── 1. no chat-attachment path ────────────────────────────────────────────────────────────────

/** The lab's own sources: everything under site/app-assets, plus app.html and the persona. */
function ownSources() {
    const dir = path.join(REPO, 'site', 'app-assets');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => 'site/app-assets/' + f);
    return files.concat(['site/app.html', 'assets/system_instructions.md']);
}

export function assertNoChatAttachmentPath(sources) {
    for (const [rel, text] of Object.entries(sources)) {
        assert.ok(!/sendMedia/.test(text), rel + ' still names sendMedia — footage goes to Maxi through the question command (maxi-ask.js), never the chat pane');
        assert.ok(!/\bdelivered\b/.test(text), rel + ' still carries `delivered` — a hand reports {asked, interaction_id, answer_excerpt}');
    }
}

test('no chat-attachment path remains: no sendMedia, no `delivered` (negative control: a planted chat call is red)', () => {
    const sources = Object.fromEntries(ownSources().map((rel) => [rel, read(rel)]));
    assert.ok(Object.keys(sources).includes('site/app-assets/maxi-lab.js') && Object.keys(sources).includes('site/app-assets/maxi-record.js'));
    assertNoChatAttachmentPath(sources);
    const planted = Object.assign({}, sources, { 'site/app-assets/maxi-lab.js': sources['site/app-assets/maxi-lab.js'] + '\nwindow.DeSciX.chat.sendMedia(m, o);\n' });
    assert.throws(() => assertNoChatAttachmentPath(planted), /maxi-lab\.js still names sendMedia/);
    const planted2 = Object.assign({}, sources, { 'site/app-assets/maxi-hands.js': sources['site/app-assets/maxi-hands.js'] + '\n// { delivered: true }\n' });
    assert.throws(() => assertNoChatAttachmentPath(planted2), /maxi-hands\.js still carries `delivered`/);
    // the vendored SDK still documents the shell's own door — that file is the platform's, not ours
    assert.ok(/sendMedia/.test(read('site/DeSciXAppSDK.js')));
});

// ── 2. a footage hand's question carries media[] ─────────────────────────────────────────────

const B64 = Buffer.from('fake mp4 bytes, ftyp isom').toString('base64');

/** The params the page sends for a footage question — the gate the Playwright stub reuses in spirit. */
export function assertFootageParams(params, why) {
    assert.ok(params && Array.isArray(params.media) && params.media.length >= 1, why + ': the question carries no media[]');
    for (const m of params.media) {
        assert.equal(m.mime_type, 'video/mp4', why + ': media mime');
        assert.ok(typeof m.data === 'string' && m.data.length > 0 && !/^data:/.test(m.data), why + ': media data must be raw base64');
        base64Bytes(m.data, why);
    }
    assert.equal(params.app_id, 'egpt-godsworld', why + ': app_id');
    assert.deepEqual(params.knowledgebase_names, ['GodsWorld'], why + ': knowledgebase_names');
    assert.ok(params.user_input.endsWith(LOOK_QUESTION), why + ': user_input must end with the look question');
}

function fakeVideo(n) {
    const frames = []; for (let i = 0; i < n; i++) { frames.push({ tick: 10 + i * 5 }); }
    return { track: { frames }, encoded: { mime: 'video/mp4', codec: 'avc1.42001f', muxer: 'mediabunny', bytes: B64 }, truncated: false };
}

/** A lab whose ask is the REAL thread over a capturing door; the composition mirrors maxi-lab.js ask(). */
function labWithDoor(door) {
    const thread = createThread({ call: door });
    const sc = withSketch({ label: 'fake', runner: { isRunning: true }, tick: () => 10, win: { MaxiScene: { FrqtlVision: { attach: () => ({ record: async () => fakeVideo(51) }) } } } });
    return {
        thread,
        lab: {
            state: { grab: null }, scene: () => sc, current: () => sc,
            ask: (op, q) => thread.ask({ op, note: q.note, userInput: footageUserInput(q.note), media: q.media }),
            fetchMemory: async (op, id) => ({ mime_type: 'video/mp4', data: B64, bytes: 25, url: 'memories/' + id + '/clip.mp4' })
        }
    };
}

function answering(sent) {
    let n = 0;
    return async (command, params) => {
        sent.push({ command, params });
        n += 1;
        return { status: 'OK', message: { status: 'OK', response: 'I see a magenta bar, turn ' + n + '.', interaction_id: 'dsx1.turn' + n, usage: { media_tokens: 300 } } };
    };
}

test('see and showMemory hand media[] to the question command; the result carries {asked, interaction_id, answer_excerpt} (negative control: a door that drops media is red)', async () => {
    const sent = [];
    const { lab } = labWithDoor(answering(sent));
    const seen = await HANDS.see.run(lab, {});
    assert.equal(sent.length, 1);
    assert.equal(sent[0].command, 'ask_question_to_app');
    assertFootageParams(sent[0].params, 'see');
    assert.equal(sent[0].params.media[0].data, B64);
    assert.match(sent[0].params.media[0].label, /^SEE — ticks 10-260, 51 frames$/);
    assert.ok(sent[0].params.user_input.startsWith('Maxi looks: a 51-frame clip of the lab'));
    assert.equal(sent[0].params.previous_interaction_id, undefined, 'the first question starts the thread');
    assert.deepEqual([seen.asked, seen.interaction_id, seen.answer_excerpt], [true, 'dsx1.turn1', 'I see a magenta bar, turn 1.']);
    assert.ok(!('delivered' in seen) && !('disposition' in seen));

    const mem = await HANDS.showMemory.run(lab, { id: 'cl1a-mirror' });
    assertFootageParams(sent[1].params, 'showMemory');
    assert.equal(sent[1].params.media[0].label, 'MEMORY cl1a-mirror');
    assert.equal(sent[1].params.previous_interaction_id, 'dsx1.turn1', 'showMemory continues the lab\'s thread');
    assert.deepEqual([mem.asked, mem.interaction_id], [true, 'dsx1.turn2']);

    // negative control: a door that sends the note as text and drops the footage fails the same gate
    const textOnly = Object.assign({}, sent[0].params); delete textOnly.media;
    assert.throws(() => assertFootageParams(textOnly, 'text-only'), /carries no media\[\]/);
    assert.throws(() => assertFootageParams(Object.assign({}, sent[0].params, { media: [{ mime_type: 'video/mp4', data: 'data:video/mp4;base64,' + B64 }] }), 'data-url'), /raw base64/);
    // and the door itself refuses a footage question with no footage
    assert.throws(() => buildAskParams({ op: 'see', userInput: 'x', media: [] }), /carries media\[\] — none was given/);
});

// ── 3. one thread ────────────────────────────────────────────────────────────────────────────

test('ONE thread: each question continues the last answer\'s interaction_id; reset() starts fresh (negative control)', async () => {
    const sent = [];
    const t = createThread({ call: answering(sent) });
    const media = [{ mime_type: 'video/mp4', data: B64 }];
    await t.ask({ op: 'see', userInput: footageUserInput('a'), media });
    await t.ask({ op: 'dragTo', userInput: footageUserInput('b'), media });
    await t.ask({ op: 'record', userInput: footageUserInput('c'), media });
    assert.deepEqual(sent.map((s) => s.params.previous_interaction_id), [undefined, 'dsx1.turn1', 'dsx1.turn2']);
    assert.equal(t.id, 'dsx1.turn3');
    assert.equal(t.turns, 3);
    t.reset();
    await t.ask({ op: 'see', userInput: footageUserInput('d'), media });
    assert.equal(sent[3].params.previous_interaction_id, undefined, 'after reset() the next question starts a new thread');
});

// ── 4. limits ────────────────────────────────────────────────────────────────────────────────

/** Raw base64 of exactly `bytes` decoded bytes, without allocating them twice. */
function b64OfBytes(bytes) { return Buffer.alloc(bytes, 7).toString('base64'); }

test('the handbook\'s limits are refused by name before sending; exactly at a limit passes', () => {
    const MiB = 1024 * 1024;
    assert.deepEqual([MEDIA_LIMITS.perTurn, MEDIA_LIMITS.eachBytes, MEDIA_LIMITS.turnBytes], [8, 8 * MiB, 16 * MiB]);
    const at = b64OfBytes(8 * MiB);
    assert.equal(base64Bytes(at, 't'), 8 * MiB);
    assert.equal(buildAskParams({ userInput: 'q', media: [{ mime_type: 'video/mp4', data: at }] }).media.length, 1, 'exactly 8 MiB passes');
    assert.throws(() => buildAskParams({ op: 'see', userInput: 'q', media: [{ mime_type: 'video/mp4', data: b64OfBytes(8 * MiB + 1) }] }), /see \(attachment 1\): 8 MiB is over the question command's 8 MiB per attachment/);
    assert.throws(() => buildAskParams({ op: 'record', userInput: 'q', media: [at, at, b64OfBytes(3)].map((d) => ({ mime_type: 'video/mp4', data: d })) }), /record: 16 MiB of footage in one turn is over the question command's 16 MiB per turn/);
    assert.equal(buildAskParams({ userInput: 'q', media: [at, at].map((d) => ({ mime_type: 'video/mp4', data: d })) }).media.length, 2, 'exactly 16 MiB passes');
    const small = { mime_type: 'video/mp4', data: B64 };
    assert.throws(() => buildAskParams({ op: 'record', userInput: 'q', media: Array(9).fill(small) }), /9 attachments in one turn; the question command takes at most 8/);
    assert.equal(buildAskParams({ userInput: 'q', media: Array(8).fill(small) }).media.length, 8);
    assert.throws(() => buildAskParams({ op: 'see', userInput: 'q', media: [{ mime_type: 'image/png', data: B64 }] }), /mime_type "image\/png" — the lab hands Maxi video\/mp4 footage only/);
    assert.throws(() => buildAskParams({ op: 'see', userInput: 'q', media: [{ mime_type: 'video/mp4', data: 'data:video/mp4;base64,' + B64 }] }), /is a data: URL — the question command takes RAW base64/);
    assert.throws(() => buildAskParams({ op: 'see', userInput: 'q', media: [{ mime_type: 'video/mp4', data: 'not base64!' }] }), /is not raw base64/);
});

// ── 5. refusals verbatim, answers by shape ───────────────────────────────────────────────────

test('a refused call is thrown verbatim, once, with no retry; the strip hears the refusal', async () => {
    let calls = 0;
    const turns = [];
    const t = createThread({ call: async () => { calls += 1; throw new Error('Authentication required (NOT_AUTHENTICATED)'); }, onTurn: (x) => turns.push(x.phase) });
    await assert.rejects(t.ask({ op: 'see', userInput: footageUserInput('n'), media: [{ mime_type: 'video/mp4', data: B64 }] }),
        /^Error: see: Maxi was NOT shown the footage — Authentication required \(NOT_AUTHENTICATED\)$/);
    assert.equal(calls, 1, 'no retry');
    assert.deepEqual(turns, ['asking', 'refused']);
    assert.equal(t.id, null, 'a refused first question leaves no thread');
    // a server refusal in the envelope is a refusal too, quoted whole
    const t2 = createThread({ call: async () => ({ status: 'ERROR', error: 'media[0]: 9.1 MiB exceeds 8 MiB' }) });
    await assert.rejects(t2.ask({ op: 'see', userInput: footageUserInput('n'), media: [{ mime_type: 'video/mp4', data: B64 }] }), /the question command refused: \{"status":"ERROR","error":"media\[0\]: 9\.1 MiB exceeds 8 MiB"\}/);
});

test('readAnswer reads the measured body, wrapped or bare; anything else is refused naming its keys', () => {
    const body = { status: 'OK', response: 'words', interaction_id: 'dsx1.x', usage: { media_tokens: 300 }, model_used: 'm' };
    assert.deepEqual(readAnswer({ status: 'OK', auth_status: 'CONNECTED', message: body }), { answer: 'words', interaction_id: 'dsx1.x', usage: { media_tokens: 300 }, model: 'm' });
    assert.equal(readAnswer(body).answer, 'words');
    assert.throws(() => readAnswer({ text: 'words', interaction_id: 'dsx1.x' }, 'see'), /see: the question command answered without \{response, interaction_id\} — keys: \[text, interaction_id\]/);
    assert.throws(() => readAnswer({ status: 'OK', message: { response: 'w' } }, 'see'), /keys: \[response\] \(inside `message`; envelope keys: \[status, message\]\)/);
    assert.throws(() => readAnswer(null, 'see'), /no answer object/);
});

test('the strip shows words: fenced blocks are left out and counted; an excerpt cuts at a word', () => {
    const w = plainWords('I see a bar.\n\n```json:call:see\n{}\n```\n\nIt is magenta.');
    assert.equal(w.fenced, 1);
    assert.ok(!w.text.includes('json:call') && w.text.includes('It is magenta.'));
    assert.equal(plainWords('no fences').fenced, 0);
    const long = 'word '.repeat(300);
    const ex = excerpt(long, 600);
    assert.ok(ex.length <= 602 && ex.endsWith(' …'));
    assert.equal(excerpt('short', 600), 'short');
});

// ── 6. the persona teaches the new reality ───────────────────────────────────────────────────

test('the persona HOW YOU ACT says the page delivers the footage and Maxi answers in the lab (negative control: the old chat prose is red)', () => {
    const text = read('assets/system_instructions.md');
    const block = text.slice(text.indexOf(HANDS_MARKERS.begin), text.indexOf(HANDS_MARKERS.end));
    const check = (b) => {
        assert.ok(/The LAB PAGE delivers the footage/.test(b), 'the block does not say the page delivers the footage');
        assert.ok(/answer_excerpt/.test(b), 'the block does not name answer_excerpt');
        assert.ok(!/delivered:true|puts it in front of\s+you|into the chat/.test(b), 'the block still teaches the chat attachment');
    };
    check(block);
    assert.throws(() => check(block + '\nDescribe only footage that reached you (the result says delivered:true)'), /still teaches the chat attachment/);
    assert.equal(ASK.command, 'ask_question_to_app');
});

// ── 7. the human's teaching words ride the demonstration's question ───────────────────────────

/** The teaching checks on a footageUserInput (the real one or a planted copy); THROWS on the first that does not hold. */
function assertTeachingRides(fui, door) {
    const WORDS = 'Light leaves the mirror at the angle it arrives.\nWatch the beam when I turn it.';
    const note = 'The human pressed Record and made this demonstration in one world:';
    assert.equal(fui(note), note + '\n\n' + LOOK_QUESTION, 'no words: the question is the look alone, as before');
    const q = fui(note, WORDS);
    assert.equal(q, note + '\n\n' + door.TEACHING_HEAD + '\n' + WORDS + '\n\n' + LOOK_QUESTION + '\n' + door.TEACHING_QUESTION, 'the words ride verbatim after the note, then the look, then what they teach');
    assert.ok(q.includes(WORDS), 'the human\'s words are in the user_input');
    assert.throws(() => fui(note, '   '), /^Error: \[ask\] the teaching words are the human's typed words, got "   " — an empty blurb is omitted/);
    assert.throws(() => fui(note, 3), /the teaching words are the human's typed words, got 3/);
}

test('footageUserInput carries the human\'s teaching words verbatim, and a Record with no words asks as before (negative control: a door that drops them is red); the lab passes them, the node door refuses them by name', async () => {
    const door = await import('../../site/app-assets/maxi-ask.js');
    assertTeachingRides(footageUserInput, door);
    const src = read('site/app-assets/maxi-ask.js');
    const RIDES = "return note.trim() + '\\n\\n' + TEACHING_HEAD + '\\n' + teaching.trim() + '\\n\\n' + LOOK_QUESTION + '\\n' + TEACHING_QUESTION;";
    assert.equal(src.split(RIDES).length, 2, 'the plant target moved — the control would measure nothing');
    const planted = await import('data:text/javascript;base64,' + Buffer.from(src.replace(RIDES, "return note.trim() + '\\n\\n' + LOOK_QUESTION;")).toString('base64'));
    assert.throws(() => assertTeachingRides(planted.footageUserInput, planted), /the words ride verbatim/, 'a door that drops the words is RED');
    // the page's one ask passes the words to the one composition, and the turn carries them for the strip
    const lab = read('site/app-assets/maxi-lab.js');
    const ask = lab.slice(lab.indexOf('async function ask('), lab.indexOf('\n}\n', lab.indexOf('async function ask(')));
    assert.ok(ask.includes('userInput: footageUserInput(q.note, q.teaching, q.question)') && ask.includes('teaching: q.teaching'), 'lab.ask must pass q.teaching to footageUserInput and the thread');
    assert.ok(/if \(node && q\.teaching !== undefined\) \{\s*throw new Error\(/.test(ask), 'the node body\'s door carries no teaching words: refused by name, never dropped');
    const turns = [];
    const t = createThread({ call: async () => ({ status: 'OK', response: 'ok', interaction_id: 'i1' }), onTurn: (x) => turns.push(x) });
    await t.ask({ op: 'record', note: 'n', teaching: 'w', userInput: footageUserInput('n', 'w'), media: [{ mime_type: 'video/mp4', data: 'AAAA' }] });
    assert.deepEqual(turns.map((x) => [x.phase, x.teaching]), [['asking', 'w'], ['answered', 'w']], 'the thread\'s turns carry the words for the strip');
});
