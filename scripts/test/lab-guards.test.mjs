/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-guards.test.mjs — the lab's human tools while Maxi works, and the life of its clip URLs.
 *
 * Gates, each with its negative control:
 *   1. refuseWhileWorking (maxi-loop.js) throws naming the tool while the loop runs, and is silent before
 *      and after; the page routes Record (R) and taking the Hand (H) through it, painted in the error bar;
 *   2. the loop refuses to START while the human's Record (attachRecorder over the fake runner) is
 *      recording — the Designer is never asked — and starts once Record is off;
 *   3. the scene picker: refused by name while Maxi works (the picker goes back to the running scene); a
 *      switch outside it hides the card and adds a Lab row; the change handler goes through pickScene, never
 *      a bare loadScene; the shell's Run goes through the same guard (shellGate);
 *   4. clip object URLs: the conversation's ledger frees every inline clip when New conversation clears the
 *      strip; paintCard frees the card's clip when a later clip replaces it (Node's real Blob URLs).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveObjectURL } from 'node:buffer';
import { fileURLToPath } from 'node:url';

import * as roles from '../../site/app-assets/maxi-roles.js';
import { createLoop, refuseWhileWorking } from '../../site/app-assets/maxi-loop.js';
import { attachRecorder, clipUrlLedger, paintCard, recordKeyAction, RECORD_KEYS } from '../../site/app-assets/maxi-record.js';
import { handKeyAction, HAND_KEYS } from '../../site/app-assets/maxi-hand-tool.js';
import { fakeRunner, withSketch } from './fake-runner.mjs';
import { manifestFor, serializeManifest } from '../../site/app-assets/frqtl-web-project.js';
import { distUrl } from '../frqtl-web-pin.mjs';

/** The package's one writer of a Record folder (what a world's Record runs at stop). */
const { serializeRecordFolder } = await import(distUrl('shim/project/record-format.js'));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB_SRC = fs.readFileSync(path.join(HERE, '..', '..', 'site', 'app-assets', 'maxi-lab.js'), 'utf8');
const B64 = Buffer.from('fake mp4 bytes, ftyp isom').toString('base64');
const alive = (url) => resolveObjectURL(url) !== undefined;

const INVENTORY = { tick: 1, scene: '1A · Mirror', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', dimensions: 2, canvas: [600, 400], camera: null, viewer: null, objects: [], parts: {} };   // the inventory HAND's shape: INVENTORY_KEYS plus the sketch's parts block (SKETCH_KEYS)

/** A loop whose Designer answers only when the test says so: `answer(text)` settles the pending turn. */
function heldLoop(extra) {
    const events = [];
    let release = null;
    const asked = [];
    const brain = { thread: (role) => ({ id: 'held-' + role, turns: 0, ask: (text) => { asked.push(role); return new Promise((r) => { release = r; }); } }) };
    const loop = createLoop(Object.assign({ roles, brain, body: { run: async (hand) => ({ ok: true, result: hand === 'inventory' ? INVENTORY : {}, clip: null }), omit: [], reauthors: () => false }, onEvent: (e) => events.push(e) }, extra || {}));
    return { loop, events, asked, answer: (t) => release(t) };
}

/** The body of a top-level function of maxi-lab.js (to its first closing brace at column 0). */
function fnBody(name) {
    const plain = LAB_SRC.indexOf('\nfunction ' + name + '(');
    const at = plain !== -1 ? plain : LAB_SRC.indexOf('\nasync function ' + name + '(');
    assert.ok(at !== -1, 'maxi-lab.js has no function ' + name + '()');
    return LAB_SRC.slice(at, LAB_SRC.indexOf('\n}\n', at));
}

test('refuseWhileWorking names the tool while Maxi works and is silent otherwise (negative controls: no loop, an idle loop, the loop after it stops)', async () => {
    assert.doesNotThrow(() => refuseWhileWorking(null, 'Record (R)'), 'no loop made yet: nothing to refuse');
    const h = heldLoop();
    assert.doesNotThrow(() => refuseWhileWorking(h.loop, 'Record (R)'), 'an idle loop refuses nothing');
    const run = h.loop.imagine('a laser hitting a mirror');
    await new Promise((r) => setImmediate(r));
    assert.equal(h.loop.running, true);
    assert.throws(() => refuseWhileWorking(h.loop, 'Record (R)'), /^Error: Record \(R\) is refused while Maxi is working — the Builder is driving the stage and filming; wait until he stops\.$/);
    assert.throws(() => refuseWhileWorking(h.loop, 'the Hand (H)'), /^Error: the Hand \(H\) is refused while Maxi is working/);
    assert.throws(() => refuseWhileWorking(h.loop), /needs the tool's name/);
    h.answer('no plan here');
    await assert.rejects(run, /Maxi stopped:/);
    assert.equal(h.loop.running, false);
    assert.doesNotThrow(() => refuseWhileWorking(h.loop, 'Record (R)'), 'the guard lifts when the loop stops');
});

test('the page routes Record and taking the Hand through the loop\'s guard, into the error bar (negative control: setHand itself stays unguarded for a reload\'s re-arm)', () => {
    assert.ok(/import\s*\{[^}]*refuseWhileWorking[^}]*\}\s*from\s*'\.\/maxi-loop\.js'/.test(LAB_SRC), 'maxi-lab.js does not import refuseWhileWorking');
    const guard = fnBody('guardBusy');
    assert.ok(guard.includes('refuseWhileWorking(state.loop, tool)') && guard.includes("showError(err, 'loop')"), 'guardBusy must call the loop\'s guard and paint the refusal in the error bar');
    assert.ok(fnBody('toggleRecord').includes("guardBusy('Record (R)')"), 'toggleRecord is not guarded');
    assert.ok(/if \(on\) \{ guardBusy\('the Hand \(H\)'\); \}/.test(fnBody('humanSetHand')), 'humanSetHand must refuse TAKING the hand (leaving is never refused)');
    assert.ok(fnBody('onHandKey').includes('humanSetHand(!state.hand.enabled)'), 'the H key bypasses the guard');
    assert.ok(fnBody('wireUi').includes('humanSetHand(!(state.hand && state.hand.enabled))'), 'the Hand button bypasses the guard');
    assert.ok(!fnBody('setHand').includes('guardBusy'), 'setHand is also attachHand\'s re-arm when the Builder loads a scene — guarding it would refuse Maxi\'s own scene load');
    assert.ok(fnBody('theLoop').includes('recorder: state.recorder'), 'the page loop is not given the human\'s Record');
});

test('the scene picker goes through pickScene: refused by name while Maxi works and put back; a switch hides the card and says what is loaded (negative control: a bare loadScene handler is red)', async () => {
    const wire = fnBody('wireUi');
    const change = wire.slice(wire.indexOf("el.picker.addEventListener('change'"), wire.indexOf('});', wire.indexOf("el.picker.addEventListener('change'")));
    assert.ok(change.includes('pickScene({ id: o.dataset.id, mode: o.dataset.mode })') && !/\bloadScene\(/.test(change), 'the picker must switch through pickScene (guarded), never a bare loadScene');
    const bare = wire.replace('pickScene({ id: o.dataset.id, mode: o.dataset.mode })', 'loadScene({ id: o.dataset.id, mode: o.dataset.mode })');
    const bareChange = bare.slice(bare.indexOf("el.picker.addEventListener('change'"), bare.indexOf('});', bare.indexOf("el.picker.addEventListener('change'")));
    assert.ok(/\bloadScene\(/.test(bareChange), 'negative control: the planted bare handler is seen');
    const pick = fnBody('pickScene');
    assert.ok(/try \{ guardBusy\('the scene picker'\); \}\s*catch \(err\) \{ syncPicker\(\); throw err; \}/.test(pick), 'pickScene must refuse by name while Maxi works and put the picker back');
    assert.ok(pick.indexOf("guardBusy('the scene picker')") < pick.indexOf('await loadScene(a)'), 'the guard runs before the load');
    assert.ok(pick.includes('el.demo.hidden = true') && /talkLine\('Lab', 'scene switched — now loaded: '/.test(pick), 'a switch hides the card and says what is loaded');
    assert.ok(!pick.includes('newThread') && !pick.includes('.reset()'), 'a switch keeps the conversation and Maxi\'s Designer thread');
    const h = heldLoop();
    const run = h.loop.imagine('a laser hitting a mirror');
    await new Promise((r) => setImmediate(r));
    assert.throws(() => refuseWhileWorking(h.loop, 'the scene picker'), /^Error: the scene picker is refused while Maxi is working/);
    h.answer('no plan here');
    await assert.rejects(run, /Maxi stopped:/);
    assert.doesNotThrow(() => refuseWhileWorking(h.loop, 'the scene picker'));
});

/** The page's onHandKey and guardBusy (their own source, `src` for a plant) over a lab whose world is booting: no scene, no hand. */
function bootingKeys(src, loop) {
    const bodyOf = (name) => { const at = src.indexOf('\nfunction ' + name + '('); assert.ok(at !== -1, 'maxi-lab.js has no function ' + name + '()'); return src.slice(at + 1, src.indexOf('\n}\n', at) + 2); };
    const painted = [];
    const toggled = [];
    const deps = {
        state: { scene: null, hand: null, loop }, refuseWhileWorking, recordKeyAction, handKeyAction,
        showError: (err, owner) => painted.push({ text: err ? String(err.message || err) : null, owner }),
        toggleRecord: () => { toggled.push('record'); return Promise.resolve(); }, humanSetHand: () => toggled.push('hand'), setHand: () => toggled.push('setHand'),
        console: { error: () => {} }
    };
    const fn = new Function(...Object.keys(deps), bodyOf('guardBusy') + bodyOf('onHandKey') + '\nreturn onHandKey;')(...Object.values(deps));
    const key = (code) => { const ev = { code, target: null, prevented: false, preventDefault() { ev.prevented = true; } }; fn(ev); return ev; };
    return { key, painted, toggled };
}

test('R and H pressed while a world boots inside Maxi\'s work (the Builder\'s loadScene / openSketch: no scene, no hand) are refused by name, never dropped (negative controls: an idle lab stays silent; the planted early return drops them)', async () => {
    const h = heldLoop();
    const run = h.loop.imagine('a laser hitting a mirror');
    await new Promise((r) => setImmediate(r));
    const b = bootingKeys(LAB_SRC, h.loop);
    assert.ok(b.key(RECORD_KEYS.toggle).prevented && b.key(HAND_KEYS.toggle).prevented);
    assert.deepEqual(b.painted.map((p) => p.owner), ['loop', 'loop']);
    assert.match(b.painted[0].text, /^Record \(R\) is refused while Maxi is working/);
    assert.match(b.painted[1].text, /^the Hand \(H\) is refused while Maxi is working/);
    assert.ok(!b.key(HAND_KEYS.leave).prevented && b.painted.length === 2, 'leaving the hand is never refused (and there is none to leave)');
    assert.deepEqual(b.toggled, [], 'nothing toggles while the world boots');
    // negative control: the page's old first line (no scene → return) drops both keys in silence
    const planted = LAB_SRC.replace('function onHandKey(ev) {\n', 'function onHandKey(ev) {\n    if (!state.scene) { return; }\n');
    assert.notEqual(planted, LAB_SRC, 'the plant took');
    const d = bootingKeys(planted, h.loop);
    d.key(RECORD_KEYS.toggle); d.key(HAND_KEYS.toggle);
    assert.deepEqual(d.painted, [], 'the planted early return drops R and H unrefused');
    h.answer('no plan here');
    await assert.rejects(run, /Maxi stopped:/);
    // an idle lab mid-boot: nothing to refuse, nothing toggles
    const idle = bootingKeys(LAB_SRC, h.loop);
    idle.key(RECORD_KEYS.toggle); idle.key(HAND_KEYS.toggle);
    assert.deepEqual(idle.painted, []);
    assert.deepEqual(idle.toggled, []);
});

/** A running scene on the fake runner whose recorder films until it is aborted. */
function recordingLab() {
    const runner = fakeRunner([{ name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, w: 20, h: 240 } }], { isRunning: true });
    const vision = {
        record: (o) => new Promise((resolve) => {
            o.signal.addEventListener('abort', () => resolve({ track: { frames: [{ tick: 1 }, { tick: 2 }] }, encoded: { mime: 'video/mp4', bytes: B64 }, truncated: false }), { once: true });
        })
    };
    let tick = 0;   // climbs on every read, so Stop finishes the band's minimum at once
    const sc = withSketch({ label: 'mirror', id: 'cl1a-mirror', mode: null, renderer: 'p5', runner, tick: () => (tick += 100), win: { MaxiScene: { FrqtlVision: { attach: () => vision } } } });
    sc.record = { tick: 0 };
    let chain = null;
    const close = () => {   // the world's Record closed by the package's own writer, over the clips the scene noted
        const out = serializeRecordFolder({ changes: [], clips: sc.filmed.map((f, i) => ({ bytes: Buffer.from('clip' + i), firstTick: f.span.first, lastTick: f.span.last })),
            partsBefore: {}, partsAfter: {}, project: { 'frqtl.json': serializeManifest(manifestFor({ name: 'mirror', entry: 'sketch.js' })), 'sketch.js': 'export default function buildExperiment(exp) {}\n' } });
        const filmed = sc.filmed.map((f) => f.hand); sc.filmed.length = 0;
        return out.empty ? null : { folder: out, filmed: filmed, carried: 0, start: {}, scene: { label: sc.label, id: sc.id, mode: sc.mode, renderer: sc.renderer } };
    };
    return {
        scene: () => sc, ask: async () => ({ asked: true, interaction_id: 't', answer_excerpt: 'x' }),
        beginChain: async (p) => { close(); chain = { producer: p, worlds: [], unheld: [] }; },
        endChain: async () => { const w = close(); const ch = chain; chain = null; return { producer: ch.producer, worlds: w ? [w] : [], unheld: [] }; },
        abandonChain: () => { chain = null; },
        chainState: () => ({ records: chain ? 1 : 0, rows: 0 })
    };
}

test('the loop refuses to start while a Record segment is open; the Designer is never asked (negative control: Record off, it starts)', async () => {
    const rec = attachRecorder({ lab: recordingLab(), onError() {} });
    const h = heldLoop({ recorder: rec });
    await rec.start();
    assert.equal(rec.recording, true);
    const refused = h.loop.imagine('a laser hitting a mirror');
    refused.catch(() => {});   // asserted below, after a wrongly started loop is settled
    await new Promise((r) => setImmediate(r));
    if (h.asked.length) { h.answer('no plan here'); }   // a loop that wrongly started settles (red below), never hangs
    await assert.rejects(refused, /^Error: Maxi did not start on "a laser hitting a mirror": Record is on \(a segment is rolling\) — press Stop \(R\) first/);
    assert.deepEqual(h.asked, [], 'the Designer was asked while Record was on');
    assert.equal(h.loop.running, false);
    assert.deepEqual(h.events.map((e) => e.role + ':' + e.kind), ['loop:refused'], 'the refusal is shown in the conversation, nothing else');
    await rec.stop();
    assert.equal(rec.recording, false);
    const run = h.loop.imagine('a laser hitting a mirror');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(h.asked, ['designer'], 'with Record off the loop starts');
    h.answer('no plan here');
    await assert.rejects(run, /Maxi stopped:/);
    assert.throws(() => createLoop({ roles, brain: { thread() {} }, body: { run() {}, omit: [], reauthors() { return false; } }, onEvent() {}, recorder: {} }), /recorder must be the human's Record/);
    assert.throws(() => createLoop({ roles, brain: { thread() {} }, body: { run() {}, omit: [] }, onEvent() {} }), /createLoop needs a body \{run\(hand, args\), omit\[\], reauthors\(hand\)\}/, 'a body that cannot say which hands boot a new world could not close a Record');
});

test('the loop refuses to start while the human\'s Hand is on, by name; the outline is not taken (negative controls: Hand off starts; Hand and Record both named)', async () => {
    const view = { enabled: true };
    const h = heldLoop({ hand: view });
    const refused = h.loop.imagine('a laser hitting a mirror');
    refused.catch(() => {});
    await new Promise((r) => setImmediate(r));
    if (h.asked.length) { h.answer('no plan here'); }   // a loop that wrongly started settles (red below), never hangs
    await assert.rejects(refused, /^Error: Maxi did not start on "a laser hitting a mirror": the Hand is on — put it down \(H or Esc\) first; a human drag must never land in the Builder's footage\.$/);
    assert.deepEqual(h.asked, [], 'the Designer was asked while the Hand was on');
    assert.deepEqual(h.events.map((e) => e.role + ':' + e.kind), ['loop:refused'], 'no tony event: the outline was not taken, so the page keeps it in the box');
    const rec = attachRecorder({ lab: recordingLab(), onError() {} });
    const both = heldLoop({ hand: { enabled: true }, recorder: rec });
    await rec.start();
    await assert.rejects(both.loop.imagine('x'), /Record is on \(a segment is rolling\).*; and the Hand is on/);
    await rec.stop();
    view.enabled = false;   // the page passes a LIVE view: putting the hand down lifts the refusal
    const run = h.loop.imagine('a laser hitting a mirror');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(h.asked, ['designer'], 'with the Hand down the loop starts');
    assert.equal(h.events[1].role + ':' + h.events[1].kind, 'tony:said', 'a started loop takes the outline');
    h.answer('no plan here');
    await assert.rejects(run, /Maxi stopped:/);
    assert.throws(() => createLoop({ roles, brain: { thread() {} }, body: { run() {}, omit: [], reauthors() { return false; } }, onEvent() {}, hand: {} }), /hand must be a live view of the human's Hand tool/);
});

test('the page empties the Imagine box only when the loop takes the outline — a refused outline stays (negative control: the submit handler clears nothing)', () => {
    assert.ok(/if \(e\.role === 'tony'\) \{ el\.imagineText\.value = '';/.test(fnBody('renderLoop')), 'the box must empty on the loop\'s tony event');
    const wire = fnBody('wireUi');
    const submit = wire.slice(wire.indexOf("el.imagine.addEventListener('submit'"), wire.indexOf('});', wire.indexOf("el.imagine.addEventListener('submit'")));
    assert.ok(submit.length > 0 && !submit.includes('imagineText.value ='), 'the submit handler clears the box before the loop takes the outline');
    assert.equal((LAB_SRC.match(/imagineText\.value = ''/g) || []).length, 1, 'one place empties the box');
    assert.deepEqual(LAB_SRC.match(/imagineText\.value = (?!'')[^;]*/g), ['imagineText.value = outline'], 'the only other write puts a question the platform refused for sign-in back in the box');
    assert.match(fnBody('imagine'), /if \(isSignInRefusal\([^\n]*\n\s*if \(!el\.imagineText\.value\.trim\(\)\) \{ el\.imagineText\.value = outline; \}/, 'the box is refilled only on the sign-in refusal, and only when empty');
    assert.ok(/hand: \{ get enabled\(\) \{ return !!\(state\.hand && state\.hand\.enabled\); \} \}/.test(fnBody('theLoop')), 'the page loop is not given a LIVE view of the Hand');
});

test('inline clip URLs are freed when New conversation clears the strip; a card\'s clip is freed when a later clip replaces it (negative control: unrevoked URLs stay alive)', () => {
    const ledger = clipUrlLedger();
    const a = ledger.make('video/mp4', B64), b = ledger.make('video/mp4', B64);
    assert.equal(ledger.size, 2);
    assert.ok(alive(a) && alive(b), 'a clip shown in the strip stays playable until the strip is cleared');
    assert.equal(ledger.revokeAll(), 2);
    assert.ok(!alive(a) && !alive(b), 'revokeAll left a clip URL alive');
    assert.equal(ledger.size, 0);
    assert.equal(ledger.revokeAll(), 0);

    const newThread = fnBody('newThread');
    assert.ok(newThread.includes('inlineUrls.revokeAll()') && newThread.includes("el.talkLines.textContent = ''"), 'New conversation must clear the strip and free its clips');
    assert.ok(fnBody('inlineClip').includes('inlineUrls.make('), 'an inline clip must take its URL from the ledger');
    assert.ok(!LAB_SRC.includes('clipObjectUrl'), 'maxi-lab.js makes a clip URL outside the ledger');

    const card = { root: { hidden: true }, video: { dataset: {}, src: '' }, title: {}, lines: {}, teach: { hidden: true }, teachText: {}, send: {} };
    paintCard(card, { mime: 'video/mp4', base64: B64, title: 'one', lines: 'l' });
    const first = card.video.src;
    assert.ok(alive(first));
    paintCard(card, { mime: 'video/mp4', base64: B64, title: 'two', lines: 'l' });
    assert.ok(!alive(first), 'the replaced card clip is still alive');
    assert.ok(alive(card.video.src) && card.video.src === card.video.dataset.url, 'the card shows its new clip');
    URL.revokeObjectURL(card.video.src);
});
