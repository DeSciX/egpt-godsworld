/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-record.test.mjs — the lab's own close path of the world's Record (maxi-lab.js THE WORLD'S RECORD), run from the page's
 * source (never re-typed) over a stand-in scene whose Record answers as the package's does.
 *
 * Gates (each planted away, red):
 *   1. a close the package REFUSES (rows no clip shows; err.record carries them) names the producer's rows in the chain's
 *      `unheld`; rows the Record carried from before the producer began are not the producer's;
 *   2. the lab's note of which hand filmed which clip must match the Record's clips: a count that differs, and a span a
 *      hand read that differs from the Record's, THROW by name;
 *   3. a producer that finds the world's Record unclosable carries what it held — rows AND clips, each with its hand — into
 *      its first Record's chain entry (lab.json carried), never as its own;
 *   4. THE START: each world joins the chain with the parts it held when the round began in it (beginChain — also when an
 *      Owl's revise begins the next round, beginNextRound) or when it booted inside the chain (readStart); a world with no
 *      start is refused by name at its close.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { folderHere, sceneFacts } from '../../site/app-assets/maxi-record-folder.js';

const LAB_SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'app-assets', 'maxi-lab.js'), 'utf8');
const NAMES = ['recordOf', 'openWorldRecord', 'stopWorldRecord', 'closeWorldRecord', 'readStart', 'beginChain', 'endChain', 'abandonChain', 'beginNextRound'];

/** One top-level function of maxi-lab.js, by name, to its first closing brace at column 0. */
function fnSource(src, name) {
    const at = src.search(new RegExp('\\n(async )?function ' + name + '\\('));
    assert.ok(at !== -1, 'maxi-lab.js has no function ' + name + '()');
    return src.slice(at + 1, src.indexOf('\n}\n', at) + 2);
}

/** The page's Record functions from `src`, bound to a stand-in scene `sc` and the lab's state. */
function labRecord(src, sc) {
    const state = { chain: null, scene: sc, chainTurn: null };
    const body = NAMES.map((n) => fnSource(src, n)).join('\n') + '\nreturn { ' + NAMES.join(', ') + ' };';
    // the hands' sketch reader stands in as the scene's own parts now (maxi-hands.js partsNowOf reads the sketch's block)
    const partsNowOf = async (w) => JSON.parse(JSON.stringify(w.parts || {}));
    const fns = new Function('state', 'requireScene', 'folderHere', 'sceneFacts', 'partsNowOf', 'showError', body)(state, () => state.scene, folderHere, sceneFacts, partsNowOf, () => {});
    return Object.assign({ state }, fns);
}

const ROW = (tick, by) => ({ tick, name: 'mirror', op: 'move', by: by || 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: [300, 80, 20, 240] } });
/** A stand-in Record: `stop()` answers `next()` — a folder, {empty}, or a refusal carrying err.record. */
function fakeRecord(next) { return { tick: 0, get changes() { return []; }, stop: async () => next() }; }
const refusal = (rows, clips) => () => { const e = new Error('[record-format] ' + rows.length + ' change(s) after the last clip ends'); e.record = { changes: rows, clips: clips || [] }; throw e; };
const folder = (clips) => () => ({ files: { 'record.json': '{}' }, record: { tickRange: [0, 1], clips: clips.map((c) => c.file), changes: [] }, clips });
function scene(stops) {
    const sc = { label: 'm', id: 'cl1a-mirror', mode: null, renderer: 'p5', filmed: [], record: null, recipeContext: { startRecord: async () => fakeRecord(stops.shift() || folder([])) } };
    sc.record = fakeRecord(stops.shift());
    return sc;
}

/** The refused close inside a chain: [unheld rows]. */
async function refusedClose(src) {
    const sc = scene([refusal([ROW(5, 'maxi')])]);
    const L = labRecord(src, sc);
    L.state.chain = { producer: 'record', worlds: [], unheld: [], carriedRecord: null, carried: null };
    const closed = await L.closeWorldRecord(sc);
    return { closed, unheld: L.state.chain.unheld, worlds: L.state.chain.worlds };
}

test('a refused close names its rows in the chain\'s unheld, never drops them (negative control: the unheld push planted away is red)', async () => {
    const r = await refusedClose(LAB_SRC);
    assert.equal(r.closed.refused.includes('after the last clip ends'), true);
    assert.deepEqual([r.unheld, r.worlds], [[ROW(5, 'maxi')], []], 'the producer\'s row is unheld; no Record holds it');
    const PUSH = '        Array.prototype.push.apply(ch.unheld, closed.rows.slice(rec === ch.carriedRecord && ch.carried ? ch.carried.changes.length : 0));\n';
    assert.equal(LAB_SRC.split(PUSH).length, 2, 'the plant target moved');
    const bad = await refusedClose(LAB_SRC.replace(PUSH, ''));
    assert.deepEqual(bad.unheld, [], 'the plant must lose the row (else this control measures nothing)');
    assert.throws(() => assert.deepEqual(bad.unheld, [ROW(5, 'maxi')]), undefined, 'RED under the same check');
});

/** stopWorldRecord over a Record holding `clips`, with the lab's note `filmed`: its answer, or the thrown message. */
async function stopWith(src, clips, filmed) {
    const sc = scene([folder(clips)]);
    sc.filmed = filmed;
    try { return { out: await labRecord(src, sc).stopWorldRecord(sc) }; } catch (e) { return { error: e.message }; }
}

test('the lab\'s note of who filmed what must match the Record\'s clips: a count that differs and a span a hand read that differs throw by name (negative controls: each check planted away is red)', async () => {
    const C1 = { file: 'clip-01.mp4', firstTick: 10, lastTick: 260 }, C2 = { file: 'clip-02.mp4', firstTick: 300, lastTick: 560 };
    const ok = await stopWith(LAB_SRC, [C1, C2], [{ hand: 'see', span: { first: 10, last: 260 } }, { hand: 'record', span: null }]);
    assert.deepEqual(ok.out.filmed, ['see', 'record'], 'the note matches: the hands ride on');
    const count = await stopWith(LAB_SRC, [C1, C2], [{ hand: 'see', span: { first: 10, last: 260 } }]);
    assert.match(count.error, /the world's Record holds 2 clip\(s\), the lab noted 1 filmed \(see\) — which hand filmed which clip cannot be said/);
    const span = await stopWith(LAB_SRC, [C1], [{ hand: 'see', span: { first: 11, last: 260 } }]);
    assert.match(span.error, /see read its clip as ticks 11–260, the Record holds clip-01\.mp4 as 10–260 — the hand's span is not the Record's/);
    const COUNT = '    if (filmed.length !== folder.clips.length) {';
    const SPAN = '        if (s && (s.first !== c.firstTick || s.last !== c.lastTick)) {';
    for (const [label, from, run, named] of [
        ['the count check', COUNT, () => stopWith(LAB_SRC.replace(COUNT, '    if (false) {'), [C1, C2], [{ hand: 'see', span: { first: 10, last: 260 } }]), /the lab noted 1 filmed/],
        ['the span check', SPAN, () => stopWith(LAB_SRC.replace(SPAN, '        if (false) {'), [C1], [{ hand: 'see', span: { first: 11, last: 260 } }]), /the hand's span is not the Record's/]]) {
        assert.equal(LAB_SRC.split(from).length, 2, label + ': the plant target moved');
        const x = await run();
        assert.ok(!named.test(x.error || ''), label + ' planted away: the mismatch is no longer refused by name (got ' + JSON.stringify(x.error || x.out) + ') — RED under the check above');
    }
});

/** A producer begins on a world whose Record cannot close, acts, and ends: {begun, carried in the chain entry, unheld}. */
async function carriedChain(src, endRefused) {
    const carriedRows = [ROW(331, 'maxi'), { tick: 489, name: 'mirror', op: 'setDeclared', by: 'maxi', from: { orientationDeg: 45 }, to: { orientationDeg: 30 } }];
    const sc = scene([refusal(carriedRows, [{ firstTick: 182, lastTick: 482 }])]);
    sc.filmed = [{ hand: 'dragTo', span: { first: 182, last: 482 } }];
    const L = labRecord(src, sc);
    const begun = await L.beginChain('record');
    sc.filmed.push({ hand: 'record', span: null });
    const human = ROW(600, 'human');
    sc.record.stop = endRefused ? refusal(carriedRows.concat([human]), [{ firstTick: 182, lastTick: 482 }, { firstTick: 490, lastTick: 790 }])
        : folder([{ file: 'clip-01.mp4', firstTick: 182, lastTick: 482 }, { file: 'clip-02.mp4', firstTick: 490, lastTick: 790 }]);
    const ch = await L.endChain();
    return { begun, ch, carriedRows, human };
}

test('a producer that finds the world\'s Record unclosable carries its rows AND clips (with their hands) into its first Record\'s entry, never as its own; a later refused close names only the producer\'s rows', async () => {
    const r = await carriedChain(LAB_SRC, false);
    assert.deepEqual(r.begun, { carried: { changes: 2, clips: 1 } });
    assert.deepEqual(r.ch.worlds[0].carried, { changes: r.carriedRows, clips: [{ hand: 'dragTo', firstTick: 182, lastTick: 482 }] }, 'the rows and the clip, its hand named');
    assert.deepEqual(r.ch.worlds[0].filmed, ['dragTo', 'record']);
    const refused = await carriedChain(LAB_SRC, true);
    assert.deepEqual([refused.ch.worlds, refused.ch.unheld], [[], [refused.human]], 'the carried rows are not the producer\'s unheld; its own row is');
    const CLIPS = "        clips: closed.clips.map(function (c, i) { return { hand: sc.filmed[i] ? sc.filmed[i].hand : null, firstTick: c.firstTick, lastTick: c.lastTick }; })\n";
    assert.equal(LAB_SRC.split(CLIPS).length, 2, 'the plant target moved');
    const bad = await carriedChain(LAB_SRC.replace(CLIPS, '        clips: []\n'), false);
    assert.throws(() => assert.deepEqual(bad.ch.worlds[0].carried.clips, r.ch.worlds[0].carried.clips), undefined, 'a carried that forgets its clips is RED');
});

/** A loop's two rounds on one world, the Owl's revise between: round 1 moves the screen S → T, round 2 re-stages it to S and
 *  drags it to U. → the chain the lab hands back at the end (each world with its `start`). */
async function revisedRounds(src) {
    const at = (x) => ({ screen: ['Wall', { rect: [x, 0, -77, 20, 400, 154] }] });
    const S = at(315), T = at(355), U = at(395);
    const sc = scene([folder([]), folder([]), folder([])]);
    sc.parts = S;
    const L = labRecord(src, sc);
    await L.beginChain('loop');
    sc.parts = T;                       // round 1's drag
    L.beginNextRound();                 // the Owl sent it back
    await L.state.chainTurn;
    sc.parts = S; sc.parts = U;         // round 2: re-staged to the stock place, then dragged on
    const ch = await L.endChain();
    return { ch, S, T, U };
}

test('THE START: each round names the parts it began from (an Owl\'s revise begins the next round where the world stands); a world booted inside the chain starts at its boot; a world with no start is refused at its close (negative controls: each planted away is red)', async () => {
    const r = await revisedRounds(LAB_SRC);
    assert.equal(r.ch.worlds.length, 1);
    assert.deepEqual(r.ch.worlds[0].start, r.T, 'round 2 began where round 1 left the screen: its start is T, never round 1\'s start S nor its own end U');
    // planted: one map of starts for the whole run (the producer's first start kept across the revise) → S (RED)
    const MAP = '    const st = new Map();\n';
    assert.equal(LAB_SRC.split(MAP).length, 2, 'the plant target moved');
    const kept = await revisedRounds(LAB_SRC.replace(MAP, '    const st = (state.runStarts = state.runStarts || new Map());\n'));
    assert.deepEqual(kept.ch.worlds[0].start, kept.S, 'the plant must keep round 1\'s start (else this control measures nothing)');
    assert.throws(() => assert.deepEqual(kept.ch.worlds[0].start, r.T), undefined, 'RED under the same check');

    // a world booted inside the chain: its start is its parts at boot, read once (a later read keeps it)
    const sc = scene([folder([]), folder([])]);
    sc.parts = r.S;
    const L = labRecord(LAB_SRC, sc);
    await L.beginChain('loop');
    const booted = { label: 'b', id: 'x', mode: null, renderer: 'p5', filmed: [], parts: r.T, record: { stop: async () => folder([])() } };
    await L.readStart(booted, 'boot', L.state.chain.starts);
    booted.parts = r.U;
    await L.readStart(booted, 'boot', L.state.chain.starts);
    assert.deepEqual(L.state.chain.starts.get(booted), r.T, 'the boot read stands; a second read keeps it');
    await L.closeWorldRecord(booted);
    assert.deepEqual(L.state.chain.worlds.map((w) => w.start), [r.T]);
    // a world the chain never read: refused by name at its close, never joined without a start
    const stray = { label: 'stray', id: 'y', mode: null, renderer: 'p5', filmed: [], record: { stop: async () => folder([])() } };
    await assert.rejects(L.closeWorldRecord(stray), /the world "stray" closed into the loop's chain with no start/);
    const BEGIN = '    await readStart(sc, producer, st);\n';
    assert.equal(LAB_SRC.split(BEGIN).length, 2, 'the plant target moved');
    await assert.rejects(revisedRounds(LAB_SRC.replace(BEGIN, '')), /closed into the loop's chain with no start/, 'a chain that reads no start is refused at the close');
});
