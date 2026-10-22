/* Copyright 2023-2026 by Essam Abadir */

/**
 * intro.test.mjs — gates on the lab's run-once walk-through (site/app-assets/maxi-intro.js):
 *   1. INTRO_TEXT is pinned by sha256: it moves only on purpose (a one-character edit is red),
 *      and none of the corrected misspellings is back;
 *   2. EXPLAINERS covers exactly the header's <button>/<select> ids and the conversation's controls in
 *      app.html (a missing row, a row for an id the page lacks, a new control without a row: each red);
 *      a control whose title names a shortcut key has that key named in its row;
 *   3. the entry button's rule buttonLabelFor (login only when the shell publishes powch and nobody is
 *      signed in) and the entry act enterAct (login errors pass through unchanged; full screen only on a
 *      narrow viewport and only when the lab publishes it);
 *   4. the run-once rule introDecision (first visit shows, seen skips, unreadable storage shows,
 *      ?intro=1 / ?intro=0 override);
 *   2b. PADS (the MOVE and LOOK pads 3D scenes draw) agree with the vendored CameraControls part: the side and cap of
 *      each pad, and the keys each row names are the keys the part binds to that pad;
 *   5. app.html loads the stylesheet after its own <style> and maxi-intro.js before maxi-lab.js, and the
 *      module awaits nothing at its top level (the lab keeps booting under the overlay).
 * Every gate is shown red on a planted fault inside its own test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { publishedFiles, isPublishedIn, viewOf } from '../publish-paths.mjs';
import { moduleRows } from '../gen-import-maps.mjs';

import {
    INTRO_TEXT, EXPLAINERS, ENTRY_LABELS, INTRO_SEEN_KEY, PADS, PADS_LEDE,
    buttonLabelFor, introDecision, introParagraphs, enterAct, readSeen
} from '../../site/app-assets/maxi-intro.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── 1. the intro text ────────────────────────────────────────────────────────────────────────

/** sha256 of INTRO_TEXT. Moves only with a deliberate change to the intro text. */
const INTRO_SHA256 = '5d9395d8f5a0e9130d30296e954e50b3c11922f7b15df5c30dc72d78cc0fc9e8';

/** The misspellings corrected when the text was first set; none may come back. */
const CORRECTED = ["LLM's", 'renaisance', "1400's", "1950's", 'highlevel', 'clealy', 'spacial', '  '];

export function assertIntroText(text) {
    const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    assert.equal(sha, INTRO_SHA256, 'INTRO_TEXT moved (sha256 ' + sha + '): the intro text changes only on purpose — re-pin it in the same commit as the change');
    for (const bad of CORRECTED) { assert.ok(!text.includes(bad), 'INTRO_TEXT carries ' + JSON.stringify(bad) + ' again'); }
    assert.equal(introParagraphs(text).length, 2, 'INTRO_TEXT is two paragraphs');
}

test('INTRO_TEXT is pinned by sha256 and carries none of the corrected misspellings (a one-character plant is red)', () => {
    assertIntroText(INTRO_TEXT);
    assert.ok(INTRO_TEXT.startsWith('Welcome to Godsworld, the training ground for Maxi.'));
    assert.ok(INTRO_TEXT.endsWith('and "The Barrier of Meaning."'));
    assert.throws(() => assertIntroText(INTRO_TEXT.replace('toddler', 'todler')), /INTRO_TEXT moved/);
    assert.throws(() => assertIntroText(INTRO_TEXT.replace('\n\n', ' ')), /INTRO_TEXT moved/);
});

/**
 * The walk: every published text file (scripts/publish-paths.mjs publishedFiles; a NUL in the first 8000 bytes is
 * binary) except site/vendor/ (the vendored SDK) and this test file. The text is gated where it ships: a twin-only file
 * (the dated record of the dictated text, the roster that names its exempted phrase) is never published, so a copy there
 * is not this gate's business and is not read.
 */
const SELF = 'scripts/test/intro.test.mjs';
const WALK_EXCEPT = Object.freeze(['site/vendor/', SELF]);
function publishedTextFiles() {
    return publishedFiles(REPO)
        .filter((f) => !WALK_EXCEPT.some((x) => (x.endsWith('/') ? f.startsWith(x) : f === x)))
        .filter((f) => { const b = fs.readFileSync(path.join(REPO, f)); return !b.subarray(0, 8000).includes(0); });
}

/** Words for comparison: lower case, every run of non-letters and non-digits one break (punctuation, quotes, line wraps, indents). */
const wordsOf = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
/** The window: 6 words (5 already meets an ordinary phrase elsewhere in the tree, a book title in a debate log). */
export const WINDOW_WORDS = 6;

/** Every overlapping WINDOW_WORDS-word window of each paragraph of INTRO_TEXT, taken from the text itself. */
export function introWindows(text) {
    const out = new Set();
    for (const p of introParagraphs(text)) { const w = wordsOf(p); for (let i = 0; i + WINDOW_WORDS <= w.length; i++) { out.add(w.slice(i, i + WINDOW_WORDS).join(' ')); } }
    return out;
}

/** The files (of `files`, read by `readOf`) whose text carries any window, with how many windows each carries. */
export function introHolders(files, readOf, windows) {
    const out = {};
    for (const f of files) {
        const w = wordsOf(readOf(f)); const seen = new Set();
        for (let i = 0; i + WINDOW_WORDS <= w.length; i++) { const k = w.slice(i, i + WINDOW_WORDS).join(' '); if (windows.has(k)) { seen.add(k); } }
        if (seen.size) { out[f] = seen.size; }
    }
    return out;
}

test('the intro text has one home: no published text file but maxi-intro.js carries any 6-word window of it (plants are red)', () => {
    const windows = introWindows(INTRO_TEXT);
    const paragraphs = introParagraphs(INTRO_TEXT);
    assert.equal(paragraphs.length, 2);
    for (const p of paragraphs) { assert.ok(wordsOf(p).length > 100, 'a paragraph is too short to probe'); }
    const files = publishedTextFiles();
    for (const need of ['site/share.json', 'site/index.html', 'assets/system_instructions.md']) { assert.ok(files.includes(need), 'the walk lost ' + need); }
    assert.ok(files.some((f) => f.startsWith('kb/')) && files.some((f) => f.startsWith('minimaxi/')), 'the walk must cover the whole published tree');
    assert.ok(!files.some((f) => WALK_EXCEPT.some((x) => f.startsWith(x))), 'the walk read an excepted path');
    assert.ok(files.every(isPublishedIn(viewOf(REPO))), 'the walk read a file that is not published');
    const home = 'site/app-assets/maxi-intro.js';
    const holders = introHolders(files, read, windows);
    assert.deepEqual(Object.keys(holders), [home], 'the intro text is copied outside maxi-intro.js INTRO_TEXT: ' + JSON.stringify(holders));
    assert.equal(holders[home], windows.size, 'maxi-intro.js carries every window of the text');
    // plants: a fragment, a cut-short sentence, a line-wrapped copy; each in a different file, each red
    const secondOf2 = paragraphs[1].split('. ')[1];
    const plants = {
        'kb/GodsWorld/memories/INDEX.md': 'Godsworld, the training ground for Maxi.',
        'site/index.html': '<p>' + secondOf2.split(' ').slice(0, 9).join(' ') + '</p>',
        'docs/concepts/x.md': paragraphs[0].split('. ')[1],
        'site/app-assets/y.js': '// ' + paragraphs[1].split('. ')[0],
        'site/share.json': '"description": "' + paragraphs[0].split('. ')[2].split(' ').join('\n      ') + '"'
    };
    for (const [f, add] of Object.entries(plants)) {
        const readPlanted = (g) => (g === f ? (files.includes(f) ? read(f) : '') + '\n' + add + '\n' : read(g));
        const list = files.includes(f) ? files : files.concat([f]);
        assert.deepEqual(Object.keys(introHolders(list, readPlanted, windows)).sort(), [f, home].sort(), 'the plant in ' + f + ' stayed green: ' + JSON.stringify(add));
    }
});

// ── 2. the explainers against the page ───────────────────────────────────────────────────────

/** The ids of the controls a person sees: header <button>/<select>, and the conversation's <button>/<input>/<select>/<textarea>. */
export function controlsOf(html) {
    const block = (re, what) => { const m = html.match(re); assert.ok(m, 'app.html has no ' + what); return m[1]; };
    const ids = (src, tags) => [...src.matchAll(new RegExp('<(' + tags + ')\\b([^>]*)>', 'g'))].map((m) => {
        const id = m[2].match(/\bid="([^"]+)"/);
        assert.ok(id, 'app.html has a <' + m[1] + '> without an id: ' + m[0]);
        const title = m[2].match(/\btitle="([^"]*)"/);
        return { id: id[1], title: title ? title[1] : null };
    });
    return ids(block(/<header>([\s\S]*?)<\/header>/, '<header>'), 'button|select')
        .concat(ids(block(/<aside id="talk"[^>]*>([\s\S]*?)<\/aside>/, 'aside#talk'), 'button|input|select|textarea'));
}

export function explainerFaults(html, explainers) {
    const faults = [];
    const controls = controlsOf(html);
    const ids = controls.map((c) => c.id);
    for (const c of controls) {
        const row = explainers[c.id];
        if (!row) { faults.push(c.id + ': the page has this control and EXPLAINERS has no row for it'); continue; }
        if (!row.name || !row.says) { faults.push(c.id + ': the row lacks name or says'); }
        const key = c.title && c.title.match(/\(([A-Z])\b/);
        if (key && !new RegExp('\\b' + key[1] + '\\b').test(row.name + ' ' + row.says)) {
            faults.push(c.id + ': its title names the key ' + key[1] + ' and its row does not');
        }
    }
    for (const id of Object.keys(explainers)) {
        if (!ids.includes(id)) { faults.push(id + ': EXPLAINERS has a row for an id the page lacks'); }
    }
    return faults;
}

test('EXPLAINERS covers exactly the header and conversation controls of app.html (drift plants are red)', () => {
    const html = read('site/app.html');
    const ids = controlsOf(html).map((c) => c.id);
    for (const need of ['scene-picker', 'btn-run', 'btn-restart', 'btn-hand', 'btn-record', 'btn-code', 'btn-info', 'talk-new', 'imagine-text']) {
        assert.ok(ids.includes(need), 'the parse lost ' + need);
    }
    assert.deepEqual(explainerFaults(html, EXPLAINERS), []);

    const without = Object.assign({}, EXPLAINERS); delete without['btn-record'];
    assert.deepEqual(explainerFaults(html, without), ['btn-record: the page has this control and EXPLAINERS has no row for it']);
    const noInfo = Object.assign({}, EXPLAINERS); delete noInfo['btn-info'];
    assert.deepEqual(explainerFaults(html, noInfo), ['btn-info: the page has this control and EXPLAINERS has no row for it']);
    const extra = Object.assign({}, EXPLAINERS, { 'btn-gone': { name: 'Gone', says: 'x' } });
    assert.deepEqual(explainerFaults(html, extra), ['btn-gone: EXPLAINERS has a row for an id the page lacks']);
    const newControl = html.replace('<span id="status">', '<button id="btn-new" type="button">New</button>\n  <span id="status">');
    assert.deepEqual(explainerFaults(newControl, EXPLAINERS), ['btn-new: the page has this control and EXPLAINERS has no row for it']);
    const keyless = Object.assign({}, EXPLAINERS, { 'btn-hand': { name: 'Hand', says: 'Lets you pick up a part of the scene and move it.' } });
    assert.deepEqual(explainerFaults(html, keyless), ['btn-hand: its title names the key H and its row does not']);
});

// ── 2b. the pads against the part that draws them ──────────────────────────────────────────────

/** The vendored CameraControls part (the one that draws the pads inside a 3D scene's frame). */
const CAMERA_CONTROLS = (() => {
    const pin = JSON.parse(read('site/vendor/frqtl-web/PINNED.json'));
    return 'site/vendor/frqtl-web/' + pin.version + '/dist/frqtl/parts/CameraControls.js';
})();

/** The text between two anchors of `src`, or a fault naming the missing anchor. */
function between(src, from, to, faults) {
    const a = src.indexOf(from); const b = src.indexOf(to, a + 1);
    if (a === -1 || b === -1) { faults.push('CameraControls.js lacks ' + JSON.stringify(a === -1 ? from : to) + ': the part changed shape'); return ''; }
    return src.slice(a, b);
}

/** What each key does on its pad, as the part binds it (keyMove / keyLook): code → [axis, sign]. */
const PAD_KEYS = { move: { KeyW: 'y += 1', KeyS: 'y -= 1', KeyA: 'x -= 1', KeyD: 'x += 1' }, look: { ArrowUp: 'y += 1', ArrowDown: 'y -= 1', ArrowLeft: 'x -= 1', ArrowRight: 'x += 1' } };

export function padFaults(src, pads) {
    const faults = [];
    if (Object.keys(pads).sort().join() !== 'look,move') { faults.push('PADS rows are ' + Object.keys(pads).join(', ') + ', not move and look'); return faults; }
    const bodies = { move: between(src, 'function keyMove()', 'function keyLook()', faults), look: between(src, 'function keyLook()', 'function anyInputActive()', faults) };
    for (const [id, pad] of Object.entries(pads)) {
        if (!new RegExp("makePad\\('" + pad.side + "',\\s*'" + pad.cap + "', j" + (id === 'move' ? 'Move' : 'Look') + '\\)').test(src)) {
            faults.push(id + ': the part draws no ' + pad.cap + ' pad on the ' + pad.side);
        }
        for (const [code, act] of Object.entries(PAD_KEYS[id])) {
            if (!new RegExp('keys\\.' + code + '\\)\\s*\\{\\s*' + act.replace(/[+=-]/g, (c) => '\\' + c) + ';').test(bodies[id])) { faults.push(id + ': the part does not bind ' + code + ' to ' + act + ' on this pad'); }
        }
        const words = pad.name + ' ' + pad.says;
        if (id === 'move') {
            for (const k of pad.keys) { if (!new RegExp('\\b' + k + '\\b').test(pad.name)) { faults.push(id + ': its name does not name the key ' + k); } }
            if (JSON.stringify(pad.keys) !== JSON.stringify(Object.keys(PAD_KEYS.move).map((c) => c.slice(3)).sort((a, b) => 'WASD'.indexOf(a) - 'WASD'.indexOf(b)))) { faults.push(id + ': keys ' + pad.keys.join(' ') + ' are not W A S D'); }
        } else {
            if (!/arrow keys/i.test(words)) { faults.push(id + ': its row does not name the arrow keys'); }
            if (JSON.stringify([...pad.keys].sort()) !== JSON.stringify(Object.keys(PAD_KEYS.look).sort())) { faults.push(id + ': keys ' + pad.keys.join(' ') + ' are not the four arrows'); }
        }
    }
    return faults;
}

test('PADS agree with the vendored CameraControls part: MOVE left on W A S D, LOOK right on the arrows (plants are red)', () => {
    const src = read(CAMERA_CONTROLS);
    assert.deepEqual(padFaults(src, PADS), []);
    assert.match(PADS_LEDE, /3D scenes/);
    assert.match(PADS_LEDE, /airplane/);
    const swapped = { move: Object.assign({}, PADS.move, { side: 'right' }), look: PADS.look };
    assert.deepEqual(padFaults(src, swapped), ['move: the part draws no MOVE pad on the right']);
    const mislabelled = { move: PADS.move, look: Object.assign({}, PADS.look, { name: 'LOOK', says: 'The stick.' }) };
    assert.deepEqual(padFaults(src, mislabelled), ['look: its row does not name the arrow keys']);
    const flipped = src.replace('if (keys.KeyW) { y += 1; }', 'if (keys.KeyW) { y -= 1; }');
    assert.notEqual(flipped, src, 'the plant applied');
    assert.deepEqual(padFaults(flipped, PADS), ['move: the part does not bind KeyW to y += 1 on this pad']);
    assert.match(padFaults(src.replace('function keyLook()', 'function keyLook2()'), PADS).join(), /lacks "function keyLook\(\)"/);
});

// ── 3. the entry button ──────────────────────────────────────────────────────────────────────

const LABEL_CASES = [
    [{ mode: 'shell', members: ['call', 'view', 'powch'], authenticated: false }, 'login', ENTRY_LABELS.login],
    [{ mode: 'shell', members: ['call', 'view', 'powch'], authenticated: true }, 'enter', ENTRY_LABELS.enter],
    [{ mode: 'shell', members: ['call', 'view'] }, 'enter', ENTRY_LABELS.enter],
    [{ mode: 'standalone', members: [] }, 'enter', ENTRY_LABELS.enter],
    [{ mode: 'embedded-no-bridge' }, 'enter', ENTRY_LABELS.enter]
];

export function assertLabelRule(rule) {
    for (const [bridge, action, label] of LABEL_CASES) {
        assert.deepEqual(rule(bridge), { action, label }, 'buttonLabelFor(' + JSON.stringify(bridge) + ')');
    }
    assert.throws(() => rule({ mode: 'shell', members: ['powch'] }), /isAuthenticated\(\) gave undefined, not a boolean/, 'a powch bridge without an isAuthenticated() answer is refused, never guessed');
    for (const bad of ['false', 0, {}, null, 'true', 1]) {
        assert.throws(() => rule({ mode: 'shell', members: ['powch'], authenticated: bad }), /not a boolean/, 'isAuthenticated() answering ' + JSON.stringify(bad) + ' is refused, never coerced');
    }
    assert.throws(() => rule({ mode: 'shell' }), /without a members array/);
    assert.throws(() => rule(undefined), /needs what DeSciX.ready\(\) resolved/);
}

test('buttonLabelFor: "Login to enter Godsworld" only when the shell publishes powch and nobody is signed in (planted rules are red)', () => {
    assert.equal(ENTRY_LABELS.login, 'Login to enter Godsworld');
    assert.equal(ENTRY_LABELS.enter, 'Enter Godsworld');
    assertLabelRule(buttonLabelFor);
    const ignoresAuth = (b) => (b && b.mode === 'shell' && (b.members || []).includes('powch')
        ? { action: 'login', label: ENTRY_LABELS.login } : buttonLabelFor(b));
    assert.throws(() => assertLabelRule(ignoresAuth), /buttonLabelFor/);
    const guessesAuth = (b) => buttonLabelFor(b && b.mode === 'shell' && b.authenticated === undefined ? Object.assign({}, b, { authenticated: false }) : b);
    assert.throws(() => assertLabelRule(guessesAuth), /refused, never guessed/);
    const onlyUndefined = (b) => (b && b.mode === 'shell' && Array.isArray(b.members) && b.members.includes('powch') && b.authenticated !== undefined
        ? (b.authenticated ? { action: 'enter', label: ENTRY_LABELS.enter } : { action: 'login', label: ENTRY_LABELS.login }) : buttonLabelFor(b));
    assert.throws(() => assertLabelRule(onlyUndefined), /refused, never coerced/);
});

/** A fake MaxiLab full-screen door: mobile() and fullscreenAvailable() as given; fullscreen(on) records its argument. */
function fakeLab(mobile, available, calls, fail) {
    return {
        mobile: () => mobile,
        fullscreenAvailable: () => ({ available, why: available ? null : 'no Fullscreen API here' }),
        fullscreen: (on) => { calls.push(['fullscreen', on]); return fail ? Promise.reject(fail) : Promise.resolve({ fullscreen: true }); }
    };
}

export async function assertEnterAct(act) {
    const calls = [];
    const powch = { login: async () => { calls.push('login'); } };
    await act({ action: 'login', powch, lab: null });
    assert.deepEqual(calls, ['login'], 'login calls powch.login()');
    const refused = new Error('passkey refused'); refused.name = 'NotAllowedError';
    await assert.rejects(act({ action: 'login', powch: { login: async () => { throw refused; } } }), (e) => e === refused, 'a login error passes through unchanged');
    calls.length = 0;
    const pending = act({ action: 'enter', powch: null, lab: fakeLab(true, true, calls) });
    assert.deepEqual(calls, [['fullscreen', true]], 'a mobile Enter calls fullscreen(true) inside the click, before any await');
    await pending;
    calls.length = 0;
    await act({ action: 'enter', powch: null, lab: fakeLab(false, true, calls) });
    assert.deepEqual(calls, [], 'a desktop Enter leaves the screen alone');
    await act({ action: 'enter', powch: null, lab: fakeLab(true, false, calls) });
    assert.deepEqual(calls, [], 'a mobile Enter where full screen is unavailable does not ask for it');
    const noFs = new Error('fullscreen refused');
    await assert.rejects(act({ action: 'enter', lab: fakeLab(true, true, [], noFs) }), (e) => e === noFs, 'a full-screen error passes through');
    await assert.rejects(act({ action: 'enter', lab: undefined }), /window.MaxiLab lacks mobile\(\)/, 'a lab without its full-screen door is refused by name');
    await assert.rejects(act({ action: 'enter', lab: { fullscreen: () => null } }), /window.MaxiLab lacks mobile\(\)/, 'a lab without mobile() is refused by name');
    await assert.rejects(act({ action: 'login', powch: null }), /needs DeSciX.powch.login/);
    await assert.rejects(act({ action: 'jump' }), /unknown action/);
}

test('enterAct: login errors pass through by name; fullscreen(true) only when MaxiLab says mobile and available (planted acts are red)', async () => {
    await assertEnterAct(enterAct);
    const swallows = async (a) => { try { return await enterAct(a); } catch (e) { return undefined; } };
    await assert.rejects(assertEnterAct(swallows), /login error passes through|full-screen error|refused by name|unknown action/);
    const ignoresAvailability = async (a) => enterAct(a.lab && a.lab.fullscreenAvailable ? Object.assign({}, a, { lab: Object.assign({}, a.lab, { fullscreenAvailable: () => ({ available: true }) }) }) : a);
    await assert.rejects(assertEnterAct(ignoresAvailability), /unavailable does not ask for it/);
    const noArgument = async (a) => enterAct(a.lab && a.lab.fullscreen && a.lab.mobile ? Object.assign({}, a, { lab: Object.assign({}, a.lab, { fullscreen: () => a.lab.fullscreen() }) }) : a);
    await assert.rejects(assertEnterAct(noArgument), /calls fullscreen\(true\)/);
    const afterAwait = async (a) => { await null; return enterAct(a); };
    await assert.rejects(assertEnterAct(afterAwait), /inside the click, before any await/);
});

// ── 4. run once ──────────────────────────────────────────────────────────────────────────────

export function assertRunOnce(decide) {
    assert.equal(decide({ search: '', seen: false }), 'show', 'first visit shows');
    assert.equal(decide({ search: '', seen: true }), 'skip', 'a seen browser skips');
    assert.equal(decide({ search: '', seen: null }), 'show', 'unreadable storage shows');
    assert.equal(decide({ search: '?scene=cl1a-mirror&intro=1', seen: true }), 'show', '?intro=1 re-opens');
    assert.equal(decide({ search: '?intro=0', seen: false }), 'skip', '?intro=0 keeps it closed');
    assert.throws(() => decide({ search: '', seen: 'yes' }), /seen must be true, false or null/);
}

test('introDecision: first visit shows, seen skips, unreadable storage shows, ?intro overrides (planted rules are red)', () => {
    assertRunOnce(introDecision);
    assert.throws(() => assertRunOnce((a) => (a.seen === null ? 'skip' : introDecision(a))), /unreadable storage shows/);
    assert.throws(() => assertRunOnce((a) => (a.seen ? 'skip' : introDecision(a))), /\?intro=1 re-opens/);
});

test('readSeen: the stored flag, or null when storage throws (the page still renders)', () => {
    assert.equal(readSeen(() => ({ getItem: (k) => (k === INTRO_SEEN_KEY ? '1' : null) })), true);
    assert.equal(readSeen(() => ({ getItem: () => null })), false);
    const err = console.error; console.error = () => {};
    try {
        assert.equal(readSeen(() => { throw new Error('SecurityError: storage denied'); }), null);
        assert.equal(readSeen(() => ({ getItem: () => { throw new Error('quota'); } })), null);
    } finally { console.error = err; }
});

// ── 5. the page loads it without blocking the lab ────────────────────────────────────────────

/** A page's module-script tag for app-assets/<file>: its src is the generator's row value (scripts/gen-import-maps.mjs moduleRows). */
const moduleScript = (file) => '<script type="module" src="' + moduleRows()['./app-assets/' + file] + '"></script>';

export function pageFaults(html, src) {
    const faults = [];
    const style = html.indexOf('</style>');
    if (html.indexOf('</style>\n<link rel="stylesheet" href="app-assets/maxi-intro.css">') !== style) { faults.push('app.html: the intro stylesheet is not the line after </style>'); }
    const intro = html.indexOf(moduleScript('maxi-intro.js'));
    const lab = html.indexOf(moduleScript('maxi-lab.js'));
    if (intro === -1 || lab === -1 || intro > lab) { faults.push('app.html: maxi-intro.js is not loaded before maxi-lab.js'); }
    const topLevel = src.split('\n').filter((l) => /^\S/.test(l) && /\bawait\b/.test(l));
    if (topLevel.length) { faults.push('maxi-intro.js awaits at its top level (the lab would wait): ' + topLevel[0]); }
    return faults;
}

test('app.html loads the intro stylesheet and module ahead of the lab; the module awaits nothing at top level (plants are red)', () => {
    const html = read('site/app.html');
    const src = read('site/app-assets/maxi-intro.js');
    assert.deepEqual(pageFaults(html, src), []);
    const introTag = moduleScript('maxi-intro.js');
    const swapped = html.replace(introTag + '\n', '').replace('</body>', introTag + '\n</body>');
    assert.deepEqual(pageFaults(swapped, src), ['app.html: maxi-intro.js is not loaded before maxi-lab.js']);
    assert.deepEqual(pageFaults(html, src + '\nawait Promise.resolve();\n'), ['maxi-intro.js awaits at its top level (the lab would wait): await Promise.resolve();']);
    assert.deepEqual(pageFaults(html.replace('<link rel="stylesheet" href="app-assets/maxi-intro.css">\n', ''), src), ['app.html: the intro stylesheet is not the line after </style>']);
});
