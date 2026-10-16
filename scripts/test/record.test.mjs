/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * record.test.mjs — the human's Record button.
 *
 * Gates:
 *   1. the change log is written by writePosition's own listener seam (onWrite): maxi-record.js
 *      imports onWrite and keeps NO logger of its own — the negative control (a tick-listener
 *      logger added to the same source) is RED under the same check;
 *   2. writePosition notifies {name, op, by, from, to} — one write, one notice; an unsubscribed
 *      listener hears nothing;
 *   3. a demonstration with zero changes still carries its clip; no clip is refused by name;
 *      sketchDiff is null and says why (no invented diff);
 *   4. the toolbar declares Record (app.html #btn-record), the lab wires R, the segment budget is
 *      the hands' band × the recorder defaults;
 *   5. Stop on a paused world REFUSES by name and keeps recording (also when paused mid-finish);
 *   6. dispose() (a scene swap) settles the segment and raises NO error after disposal — the
 *      codec's closed-flush rejection travels to dispose()'s result, never to onError; the lab paints
 *      RECORD_DROPPED under its own owner, which the hand's re-arm does not clear;
 *   7. a change with no position is refused by name, never printed as "?".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDemonstration, changesAsText, segmentTicks, recordKeyAction, RECORD_KEYS, SKETCH_DIFF_UNAVAILABLE, RECORD_DROPPED, attachRecorder } from '../../site/app-assets/maxi-record.js';
import { writePosition, onWrite, CLIP_SECONDS, RECORD_DEFAULTS } from '../../site/app-assets/maxi-hands.js';
import { fakeRunner } from './fake-runner.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const PINNED_VERSION = JSON.parse(read('site/vendor/frqtl-sdk/PINNED.json')).version;

/** The one-logger check: changes are pushed only inside the onWrite callback. */
export function assertOneLogger(src) {
    const imp = /import\s*\{([^}]*)\}\s*from\s*'\.\/maxi-hands\.js'/.exec(src);
    assert.ok(imp && imp[1].split(',').map((s) => s.trim()).includes('onWrite'), 'maxi-record.js must take its change notices from maxi-hands.js onWrite');
    assert.ok(!/addTickListener\s*\(/.test(src), 'maxi-record.js polls the runner per tick — a second logger');
    assert.ok(!/updateObjectProperty\s*\(/.test(src), 'maxi-record.js writes positions itself — a second write path');
    assert.ok(!/getAuthoredObjects\s*\(|inventoryObjects\s*\(/.test(src), 'maxi-record.js diffs the scene graph itself — a second logger');
    const pushes = src.match(/st\.changes\.push\s*\(/g) || [];
    assert.equal(pushes.length, 1, 'exactly one place appends to the change log, got ' + pushes.length);
    const i = src.indexOf('st.changes.push(');
    const before = src.slice(Math.max(0, i - 200), i);
    assert.ok(/onWrite\s*\(\s*function/.test(before), 'the one append must sit inside the onWrite callback');
}

test('the change log has one writer — writePosition\'s onWrite seam (negative control: a tick-listener logger is red)', () => {
    const src = read('site/app-assets/maxi-record.js');
    assertOneLogger(src);
    const second = src.replace(
        'st.on = true;',
        "st.on = true;\n        sc.runner.addTickListener(function () { st.changes.push({ tick: sc.tick(), name: '?', op: 'poll', by: 'record', from: null, to: null }); });"
    );
    assert.notEqual(second, src, 'the negative control did not change the source');
    assert.throws(() => assertOneLogger(second), /second logger|exactly one place/);
});

test('writePosition notifies one {name, op, by, from, to} per write; an unsubscribed listener hears nothing', () => {
    const obj = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 10, top: 20, w: 30, h: 40 } };
    const runner = fakeRunner([obj]);
    const writes = runner.calls.update;
    const heard = [];
    const off = onWrite((w) => heard.push(w));
    writePosition(runner, obj, { rect: [100.4, 20, 30, 40] }, { op: 'drag', by: 'human' });
    assert.deepEqual(writes, [{ name: 'mirror', key: 'rect', tuple: [100, 20, 30, 40] }]);
    assert.equal(heard.length, 1);
    assert.deepEqual({ name: heard[0].name, op: heard[0].op, by: heard[0].by, from: heard[0].from, to: heard[0].to },
        { name: 'mirror', op: 'drag', by: 'human', from: { rect: [10, 20, 30, 40] }, to: { rect: [100, 20, 30, 40] } });
    off();
    writePosition(runner, obj, { rect: [1, 2, 30, 40] });
    assert.equal(heard.length, 1, 'an unsubscribed listener must not hear the second write');
    assert.equal(writes.length, 2);
    assert.equal(writes[1].key, 'rect');
    // a centre write is announced in the centre key, its `to` the SDK's re-read of where the object is now
    const heardC = [];
    const offC = onWrite((w) => heardC.push(w));
    writePosition(runner, obj, { center: [50.4, 60] }, { op: 'dragTo', by: 'maxi' });
    offC();
    assert.deepEqual([heardC[0].key, heardC[0].from, heardC[0].to], ['center', { center: [16, 22, 0] }, { center: [50, 60, 0] }]);
    // default provenance when a caller gives no meta
    const again = [];
    const off2 = onWrite((w) => again.push(w));
    writePosition(runner, obj, { rect: [3, 4, 30, 40] });
    off2();
    assert.deepEqual([again[0].op, again[0].by], ['write', 'maxi']);
});

function fakeClip(first, n) {
    const frames = []; for (let i = 0; i < n; i++) { frames.push({ tick: first + i * RECORD_DEFAULTS.everyTicks }); }
    return { video: { track: { frames }, encoded: { mime: 'video/mp4', codec: 'avc1.42001f', muxer: 'mediabunny@x', bytes: 'AAAA' }, truncated: false }, first, last: frames[n - 1].tick, frames };
}
const scene = { label: '1A · Mirror', id: 'cl1a-mirror', mode: null, renderer: 'p5' };

test('the "no sketch serializer" reason is a measurement of the vendored dist, not a remembered fact', () => {
    const dist = path.join(REPO, 'site', 'vendor', 'frqtl-sdk', PINNED_VERSION, 'dist');
    const files = fs.readdirSync(dist, { recursive: true }).filter((f) => /\.(m?js|d\.ts)$/.test(f));
    assert.ok(files.length > 100, 'the vendored dist is there to measure (' + files.length + ' js files under ' + dist + ')');
    const hits = files.filter((f) => /\b(toSketch|exportSketch|sketchOf)\s*\(|\btoSource\s*\(/.test(fs.readFileSync(path.join(dist, f), 'utf8')));
    assert.deepEqual(hits, [], '@descix/frqtl-sdk ' + PINNED_VERSION + ' ships a sketch serializer — SKETCH_DIFF_UNAVAILABLE is now false: wire sketchDiff');
});

test('a demonstration with zero changes still carries its clip; no clip is refused; sketchDiff is null and says why', () => {
    const demo = buildDemonstration(scene, [fakeClip(100, 60)], []);
    assert.equal(demo.clips.length, 1);
    assert.deepEqual(demo.changes, []);
    assert.equal(demo.clips[0].seconds, 6);
    assert.equal(demo.sketchDiff, null);
    assert.equal(demo.sketchDiffReason, SKETCH_DIFF_UNAVAILABLE);
    assert.ok(demo.sketchDiffReason.startsWith('no sketch serializer in @descix/frqtl-sdk ' + PINNED_VERSION + '; recipeContext.toSketch() lands in 0.6.0'), 'the reason names the vendored SDK version');
    assert.throws(() => buildDemonstration(scene, [], []), /at least one clip/);
    const two = buildDemonstration(scene, [fakeClip(0, 100), fakeClip(500, 50)], [{ tick: 12, name: 'mirror', op: 'drag', by: 'human', from: { rect: [1, 2, 3, 4] }, to: { rect: [5, 2, 3, 4] } }]);
    assert.deepEqual(two.clips.map((c) => c.segment), [1, 2]);
    assert.ok(/tick 12 · drag \(human\) mirror: rect \[1, 2, 3, 4\] → rect \[5, 2, 3, 4\]/.test(changesAsText(two.changes)));
    assert.ok(/no object was moved/.test(changesAsText([])));
});

test('the toolbar declares Record, the lab wires R, and the segment budget is the hands\' band', () => {
    const html = read('site/app.html');
    assert.ok(/<button id="btn-record"[^>]*>Record<\/button>/.test(html), 'app.html lacks #btn-record');
    assert.ok(html.includes('id="demo"') && html.includes('id="demo-clip"') && html.includes('id="demo-changes"'), 'app.html lacks the demonstration card');
    const lab = read('site/app-assets/maxi-lab.js');
    assert.ok(/import\s*\{[^}]*attachRecorder[^}]*\}\s*from\s*'\.\/maxi-record\.js'/.test(lab), 'maxi-lab.js does not import attachRecorder');
    assert.ok(lab.includes('recordKeyAction'), 'maxi-lab.js does not route R through recordKeyAction');
    assert.equal(RECORD_KEYS.toggle, 'KeyR');
    assert.equal(recordKeyAction({ code: 'KeyR', target: { tagName: 'DIV' } }), 'toggle');
    assert.equal(recordKeyAction({ code: 'KeyR', target: { tagName: 'TEXTAREA' } }), null);
    assert.deepEqual(segmentTicks(), { max: CLIP_SECONDS.max * RECORD_DEFAULTS.fps * RECORD_DEFAULTS.everyTicks, min: CLIP_SECONDS.min * RECORD_DEFAULTS.fps * RECORD_DEFAULTS.everyTicks });
});

test('attachRecorder fails loud: no lab, no onError, a paused world, stop without start', async () => {
    assert.throws(() => attachRecorder({ lab: {} , onError() {} }), /needs the lab/);
    const lab = { scene: () => ({ label: 'x', win: { FrqtlVision: { attach: () => ({}) } }, runner: { isRunning: false }, tick: () => 0 }), ask: async () => ({ asked: true, interaction_id: 'thread-1', answer_excerpt: 'seen' }) };
    assert.throws(() => attachRecorder({ lab }), /onError/);
    const rec = attachRecorder({ lab, onError() {} });
    assert.throws(() => rec.start(), /paused/);
    await assert.rejects(rec.stop(), /not recording/);
    assert.equal(rec.state().text, 'record off (R)');
});

/** A running scene whose recorder settles only on abort — `abortWith` decides how (clip, or a codec rejection). */
function liveScene(abortWith) {
    let tick = 0;
    const runner = { isRunning: true };
    const vision = {
        record: (o) => new Promise((resolve, reject) => {
            o.signal.addEventListener('abort', () => {
                if (abortWith === 'codec') { reject(new Error("Failed to execute 'flush' on 'VideoEncoder': Cannot call 'flush' on a closed codec.")); }
                else { resolve(fakeClip(tick, 3).video); }
            }, { once: true });
        })
    };
    const sc = { label: '1A · Mirror', id: 'cl1a-mirror', mode: null, renderer: 'p5', runner, tick: () => tick, win: { FrqtlVision: { attach: () => vision } } };
    return { sc, runner, setTick: (t) => { tick = t; } };
}

test('Stop on a paused world refuses by name and keeps recording — also when paused while finishing the minimum', async () => {
    const { sc, runner, setTick } = liveScene('clip');
    const errors = [];
    const sent = [];
    const rec = attachRecorder({ lab: { scene: () => sc, ask: async (op, q) => { sent.push(q); return { asked: true, interaction_id: 'thread-1', answer_excerpt: 'seen' }; } }, onError: (e) => errors.push(e) });
    rec.start();
    setTick(30);
    runner.isRunning = false;                                   // Pause
    await assert.rejects(rec.stop(), /the world is paused, so Stop cannot finish the recording — a recording samples by TICK.*0\.6 s of the 5 s minimum\. Resume, then press Stop\. Still recording\./);
    assert.equal(rec.recording, true, 'a refused Stop keeps recording');
    assert.equal(rec.state().stopping, false);
    // paused WHILE Stop waits for the minimum: the same refusal, not a hang
    runner.isRunning = true;
    const p = rec.stop();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(rec.state().stopping, true);
    runner.isRunning = false;
    await assert.rejects(p, /the world is paused, so Stop cannot finish/);
    assert.equal(rec.recording, true);
    assert.equal(rec.state().stopping, false);
    // resumed and past the minimum: Stop finishes and sends
    runner.isRunning = true;
    setTick(260);
    const demo = await rec.stop();
    assert.equal(demo.clips.length, 1);
    assert.equal(sent.length, 1, 'one demonstration is ONE question');
    assert.equal(sent[0].media.length, 1);
    assert.equal(sent[0].media[0].mime_type, 'video/mp4');
    assert.deepEqual([demo.asked, demo.interaction_id, demo.answer_excerpt], [true, 'thread-1', 'seen']);
    assert.deepEqual(errors, []);
});

test('a scene swap: dispose() settles the segment, no codec error reaches onError after disposal; the drop has its own named message', async () => {
    const { sc } = liveScene('codec');
    const errors = [];
    const sent = [];
    const rec = attachRecorder({ lab: { scene: () => sc, ask: async (op, q) => { sent.push(q); return { asked: true, interaction_id: 'thread-1', answer_excerpt: 'seen' }; } }, onError: (e) => errors.push(e) });
    rec.start();
    const drop = await rec.dispose();
    assert.equal(drop.dropped, true);
    assert.match(drop.settled, /closed codec/, 'the closed-codec rejection travels to dispose()\'s result');
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(errors.map((e) => e.message), [], 'no error may reach the error bar after disposal');
    assert.equal(rec.recording, false);
    assert.equal(sent.length, 0, 'a dropped recording is never sent');
    assert.equal(RECORD_DROPPED, '[record] that recording was dropped: scene changed — no demonstration was built or sent.');
    assert.deepEqual(await rec.dispose(), { dropped: false, settled: null }, 'disposing an idle recorder drops nothing');
    // negative control: the same rejection WITHOUT a dispose is a real failure and is painted
    const live = liveScene('codec');
    const errs2 = [];
    const rec2 = attachRecorder({ lab: { scene: () => live.sc, ask: async () => ({ asked: true, interaction_id: 'thread-1', answer_excerpt: 'seen' }) }, onError: (e) => errs2.push(e) });
    rec2.start();
    live.setTick(300);
    await assert.rejects(rec2.stop(), /closed codec/);
    assert.equal(errs2.length, 1);
    // the lab: the drop message has its own owner; the hand clears only what it painted
    const lab = read('site/app-assets/maxi-lab.js');
    const dropFn = lab.slice(lab.indexOf('async function dropRecording('), lab.indexOf('// EVERY load failure'));
    assert.ok(/const drop = await state\.recorder\.dispose\(\);[\s\S]{0,200}showError\(new Error\(RECORD_DROPPED\), 'record-drop'\);/.test(dropFn),
        'dropRecording must AWAIT dispose and paint RECORD_DROPPED');
    assert.ok(/await dropRecording\('a scene swap'\);\s*if \(state\.frame\) \{ state\.frame\.remove\(\); \}/.test(lab),
        'the lab must drop a running recording before removing the old scene document');
    assert.ok(/await dropRecording\('a restart'\);[\s\S]{0,80}sc\.runner\.restart\(\);/.test(lab),
        'the lab must drop a running recording before the runner restarts the scene it films');
    const setHand = lab.slice(lab.indexOf('function setHand('), lab.indexOf('function onHandKey('));
    assert.ok(setHand.includes("clearError('hand')") && !/showError\(null\)/.test(setHand), 'setHand must clear only the hand\'s own message');
});

test('a change with no position is refused by name — never a "?" in the change log', () => {
    assert.throws(() => changesAsText([{ tick: 1, name: 'mirror', op: 'drag', by: 'human', from: null, to: { rect: [1, 2, 3, 4] } }]), /carries no position null/);
});
