/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * hand-tool.test.mjs — the human's hand shares Maxi's ONE position write.
 *
 * Gates:
 *   1. BEHAVIOUR: attachHandTool driven in node (fake host/runner/renderer) with N pointer moves while
 *      held makes exactly N runner.placeDeclaredAt placements, N onWrite notices (integer centres, op
 *      drag, by human) and N repaints — the negative controls are plants of a second write (a
 *      bracket-syntax placement; a direct rect assignment; an inlined placeDeclaredAt), each loaded as
 *      a real module beside a copy of maxi-hands.js and driven the same way: RED;
 *   2. TOKENS: no file in site/app-assets except maxi-hands.js names updateObjectProperty or
 *      placeDeclaredAt, or assigns a .rect/.center — maxi-lab.js included (its negative controls: a
 *      planted write and a planted facade assignment in maxi-lab.js are RED);
 *   3. the toolbar declares the Hand toggle (app.html #btn-hand) and the lab wires it (H / Esc);
 *   4. maxi-scene.js no longer picks or arms the aim — one owner;
 *   5. writePosition rounds a derived tuple to the integer wire and refuses a bag that is neither center nor rect;
 *   6. attachHandTool fails loud without a runner / screenToWorld / repaint, and reports its mode;
 *   7. Esc while carrying in 3D writes the drop (carry3d, integer) BEFORE the hand stops listening.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { attachHandTool, handKeyAction, HAND_KEYS, HAND_STATUS } from '../../site/app-assets/maxi-hand-tool.js';
import { writePosition, onWrite } from '../../site/app-assets/maxi-hands.js';
import { fakeRunner } from './fake-runner.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const ASSETS = 'site/app-assets';

// ── 1. behaviour: N moves → N writes, N notices, N repaints ─────────────────────────────────

/** A scene the hand can drive in node: one named wall, a zoomed 2D camera (CSS px ≠ world px). */
function fakeScene() {
    const mirror = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 100, top: 80, w: 21, h: 240 } };
    const listeners = {};
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }) };
    const host = {
        listeners,
        addEventListener(t, f) { listeners[t] = f; },
        removeEventListener(t) { delete listeners[t]; },
        querySelector: (q) => (q === 'canvas' ? canvas : null),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
        setPointerCapture() {}, releasePointerCapture() {},
        style: {},
        ownerDocument: { createElement: () => ({ style: {}, setAttribute() {}, parentNode: null }) },
        appendChild(n) { n.parentNode = this; }
    };
    const runner = fakeRunner([mirror], {
        renderer: { screenToWorld: (x, y) => ({ x: x * 0.5 + 0.3, y: y * 0.5 }) },   // zoom 2, a fractional world point
        pickObjectAtScreen: () => mirror,
        setAimArmed() {}, isAimArmed: () => false,
        screenPointOf: () => [0, 0],
        repaint() { runner.calls.repaint = (runner.calls.repaint || 0) + 1; }
    });
    const calls = runner.calls;
    const win = { requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
    return { mirror, host, runner, win, calls };
}

/**
 * Drive one 2D drag of N pointer moves through a hand module, hearing its maxi-hands onWrite.
 * Returns what the runner and the write seam saw; a throw out of a handler is collected in `errors`.
 */
export function driveDrag(mods, n) {
    const sc = fakeScene();
    const errors = [];
    const heard = [];
    const off = mods.onWrite((w) => heard.push(w));
    try {
        const hand = mods.attachHandTool({ runner: sc.runner, host: sc.host, win: sc.win, onError: (e) => errors.push(e) });
        hand.set(true);
        const ev = (x, y) => ({ button: 0, pointerId: 7, clientX: x, clientY: y, target: {}, preventDefault() {} });
        sc.host.listeners.pointerdown(ev(220, 200));
        for (let i = 1; i <= n; i++) { sc.host.listeners.pointermove(ev(220 - 7 * i, 200 + 3 * i)); }
        sc.host.listeners.pointerup(ev(220 - 7 * n, 200 + 3 * n));
        hand.set(false);
    } catch (e) { errors.push(e); }   // a handler that throws (no try of its own) is a measured failure, not a crash
    finally { off(); }
    return { place: sc.calls.place, repaint: sc.calls.repaint || 0, heard, errors, mirror: sc.mirror };
}

/** The behavioural one-write-path gate. */
export function assertDragIsOneWritePath(r, n) {
    assert.deepEqual(r.errors.map((e) => e.message), [], 'the drag raised errors');
    assert.equal(r.place.length, n, n + ' pointer moves must make exactly ' + n + ' placeDeclaredAt placements, got ' + r.place.length);
    assert.equal(r.heard.length, n, n + ' pointer moves must make exactly ' + n + ' writePosition notices (the Record change log), got ' + r.heard.length);
    assert.equal(r.repaint, n, 'every drag write must be followed by runner.repaint() (a paused world shows the move), got ' + r.repaint + ' for ' + n);
    for (let i = 0; i < n; i++) {
        const w = r.heard[i];
        assert.deepEqual([w.name, w.op, w.by, w.key], ['mirror', 'drag', 'human', 'center']);
        assert.ok(r.place[i].point.every(Number.isInteger), 'placement ' + i + ' carries a non-integer point ' + JSON.stringify(r.place[i].point));
        assert.deepEqual(w.to.center, r.place[i].point, 'notice ' + i + ' and placement ' + i + ' disagree');
    }
}

const DRAG_LINE = /writePosition\(runner, st\.held\.obj, \{ center: to \}, \{ op: 'drag', by: 'human' \}\);/;
const RELEASE = 'st.held = null;\n        host.style.cursor';
const RELEASE_WRITE = "if (st.held.last) { writePosition(runner, st.held.obj, { center: st.held.last }); }\n        " + RELEASE;
/** Plants of a second write path in the drag (the verifier's shapes, on the SDK's declared-object write), each kept writing once on release. */
export const HAND_PLANTS = Object.freeze({
    'P1b bracket-syntax placement, writePosition kept on release': (src) => src.replace(DRAG_LINE,
        "runner['placeDeclared' + 'At'](st.held.obj, to); st.held.last = to;").replace(RELEASE, RELEASE_WRITE),
    'P1c direct rect assignment, writePosition kept on release': (src) => src.replace(DRAG_LINE,
        "st.held.obj.rect = { left: to[0], top: to[1], w: 1, h: 1 }; st.held.last = to;").replace(RELEASE, RELEASE_WRITE),
    'inlined placeDeclaredAt around the one write': (src) => src.replace(DRAG_LINE,
        "runner.placeDeclaredAt(st.held.obj, to.map(Math.round));")
});

/** Load a (planted) hand source as a real module beside its own copy of maxi-hands.js. */
async function loadPlanted(src) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-plant-'));
    fs.copyFileSync(path.join(REPO, ASSETS, 'maxi-hands.js'), path.join(dir, 'maxi-hands.js'));
    fs.writeFileSync(path.join(dir, 'maxi-hand-tool.js'), src);
    const tool = await import(pathToFileURL(path.join(dir, 'maxi-hand-tool.js')).href);
    const hands = await import(pathToFileURL(path.join(dir, 'maxi-hands.js')).href);
    return { mods: { attachHandTool: tool.attachHandTool, onWrite: hands.onWrite }, dir };
}

test('BEHAVIOUR: N pointer moves while held = N writes, N notices, N repaints (negative controls: the verifier\'s plants are RED)', async () => {
    const N = 6;
    const real = driveDrag({ attachHandTool, onWrite }, N);
    assertDragIsOneWritePath(real, N);
    // the derived centre is rounded ONCE, at the write: drawn centre (110.5, 200) + the pointer's world delta, snapped
    assert.deepEqual(real.place[N - 1].point, [Math.round(110.5 - 3.5 * N), Math.round(200 + 1.5 * N), 0]);
    const src = read(ASSETS + '/maxi-hand-tool.js');
    assert.ok(DRAG_LINE.test(src) && src.includes(RELEASE), 'the plant targets moved — the negative controls would measure nothing');
    for (const [label, plant] of Object.entries(HAND_PLANTS)) {
        const planted = plant(src);
        assert.notEqual(planted, src, label + ': the plant did not change the source');
        const { mods, dir } = await loadPlanted(planted);
        try {
            const r = driveDrag(mods, N);
            assert.throws(() => assertDragIsOneWritePath(r, N), /exactly|errors|repaint/, label + ' stayed GREEN');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    // and the unplanted copy, loaded the same way, is green (the loader itself measures the real thing)
    const { mods, dir } = await loadPlanted(src);
    try { assertDragIsOneWritePath(driveDrag(mods, N), N); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── 2. tokens: nothing in app-assets but maxi-hands.js writes a position ────────────────────

/** files: {name: source}. maxi-hands.js (the owner) is skipped; comments are stripped first. */
export function assertNoSecondWriter(files) {
    for (const [name, src] of Object.entries(files)) {
        if (name === 'maxi-hands.js') { continue; }
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        assert.ok(!/updateObjectProperty/.test(code), name + ' names updateObjectProperty — a second write path (writePosition in maxi-hands.js is the one)');
        assert.ok(!/placeDeclaredAt/.test(code), name + ' names placeDeclaredAt — a second write path (writePosition in maxi-hands.js is the one)');
        assert.ok(!/\[\s*['"`](updateObject|placeDeclared)/.test(code), name + ' reaches a runner write by bracket — a second write path');
        assert.ok(!/\.(rect|center)\s*=(?!=)/.test(code), name + ' assigns a .rect/.center — a second write path around the runner');
    }
}

function assetSources() {
    const out = {};
    for (const f of fs.readdirSync(path.join(REPO, ASSETS)).filter((f) => f.endsWith('.js'))) { out[f] = read(ASSETS + '/' + f); }
    return out;
}

test('TOKENS: no app-assets file but maxi-hands.js writes a position — maxi-lab.js included (negative controls RED)', () => {
    const files = assetSources();
    assert.ok(files['maxi-lab.js'] && files['maxi-record.js'] && files['maxi-hand-tool.js'] && files['maxi-scene.js'], 'the scan must see the lab, the recorder, the hand and the scene');
    assertNoSecondWriter(files);
    const anchor = 'function inventory() {';
    assert.ok(files['maxi-lab.js'].includes(anchor), 'the maxi-lab.js plant anchor moved');
    const plants = {
        'maxi-lab.js direct write': files['maxi-lab.js'].replace(anchor, "function nudge(sc, o) { sc.runner.updateObjectProperty(o, 'rect', [0, 0, 1, 1]); }\n" + anchor),
        'maxi-lab.js facade assignment': files['maxi-lab.js'].replace(anchor, 'function nudge(o) { o._facade.rect = { left: 0 }; }\n' + anchor),
        'maxi-lab.js bracket write': files['maxi-lab.js'].replace(anchor, "function nudge(r, o) { r['updateObject' + 'Property'](o, 'rect', [0, 0, 1, 1]); }\n" + anchor),
        'maxi-lab.js placement': files['maxi-lab.js'].replace(anchor, "function nudge(sc, o) { sc.runner.placeDeclaredAt(o, [0, 0]); }\n" + anchor),
        'maxi-hand-tool.js P1b': HAND_PLANTS['P1b bracket-syntax placement, writePosition kept on release'](files['maxi-hand-tool.js']),
        'maxi-hand-tool.js P1c': HAND_PLANTS['P1c direct rect assignment, writePosition kept on release'](files['maxi-hand-tool.js'])
    };
    for (const [label, planted] of Object.entries(plants)) {
        const key = label.split(' ')[0];
        assert.throws(() => assertNoSecondWriter(Object.assign({}, files, { [key]: planted })), /second write path/, label + ' stayed GREEN');
    }
});

test('the toolbar declares the Hand toggle and the lab wires H / Esc through handKeyAction', () => {
    const html = read('site/app.html');
    assert.ok(/<button id="btn-hand"[^>]*>Hand<\/button>/.test(html), 'app.html lacks #btn-hand');
    const lab = read('site/app-assets/maxi-lab.js');
    assert.ok(lab.includes("document.getElementById('btn-hand')"), 'maxi-lab.js does not read #btn-hand');
    assert.ok(/import\s*\{[^}]*attachHandTool[^}]*\}\s*from\s*'\.\/maxi-hand-tool\.js'/.test(lab), 'maxi-lab.js does not import attachHandTool');
    assert.ok(lab.includes('handKeyAction'), 'maxi-lab.js does not route keys through handKeyAction');
    assert.equal(HAND_KEYS.toggle, 'KeyH');
    assert.equal(HAND_KEYS.leave, 'Escape');
    assert.equal(handKeyAction({ code: 'KeyH', target: { tagName: 'DIV' } }), 'toggle');
    assert.equal(handKeyAction({ code: 'Escape', target: { tagName: 'DIV' } }), 'leave');
    assert.equal(handKeyAction({ code: 'KeyH', target: { tagName: 'INPUT' } }), null, 'typing in a field is not a toggle');
    assert.equal(handKeyAction({ code: 'KeyX', target: { tagName: 'DIV' } }), null);
    assert.ok(/SPACE to grab/.test(HAND_STATUS['3d']) && /drag/.test(HAND_STATUS['2d']));
});

test('maxi-scene.js no longer picks or arms the aim — the hand tool is the one owner', () => {
    const scene = read('site/app-assets/maxi-scene.js');
    assert.ok(!scene.includes('pickObjectAtScreen('), 'maxi-scene.js still picks');
    assert.ok(!scene.includes('setAimArmed('), 'maxi-scene.js still arms the aim');
    assert.ok(scene.includes('CameraControls.attach('), 'maxi-scene.js must still attach the package CameraControls (SPACE rides inside)');
});

test('writePosition rounds a derived tuple to the integer wire and refuses an authority-less bag', () => {
    const o = { name: 'o', _schemaKind: 'Wall', rect: { left: 0, top: 0, w: 3, h: 4 } };
    const runner = fakeRunner([o]);
    writePosition(runner, o, { rect: [1.4, 2.6, 3, 4] });
    writePosition(runner, o, { center: [1.5, 2] });
    assert.deepEqual(runner.calls.update[0], { name: 'o', key: 'rect', tuple: [1, 3, 3, 4] });
    assert.deepEqual(runner.calls.place, [{ name: 'o', point: [2, 2] }]);
    assert.throws(() => writePosition(runner, o, { size: [1, 2] }), /\{center\} or \{rect\}/);
    assert.throws(() => writePosition(runner, o, { center: [1, 2], rect: [1, 2, 3, 4] }), /\{center\} or \{rect\}/);
    // only WHERE is rounded: a rect's extent is written as given (revert restores a scene's own 122.5 exactly)
    writePosition(runner, o, { rect: [96.4, 0, 64, 122.5] });
    assert.deepEqual(runner.calls.update.at(-1).tuple, [96, 0, 64, 122.5]);
    const slab = { name: 'slab', _schemaKind: 'Wall', rect: { left: 0, top: 0, z: 0, w: 3, h: 4, d: 5 } };
    const r3 = fakeRunner([slab]);
    writePosition(r3, slab, { rect: [1.6, 2.4, -3.5, 20, 240.5, 160] });
    assert.deepEqual(r3.calls.update.at(-1).tuple, [2, 2, -3, 20, 240.5, 160]);
});

function fakeHost() {
    return {
        listeners: {},
        addEventListener(t, f) { this.listeners[t] = f; },
        removeEventListener(t) { delete this.listeners[t]; },
        querySelector() { return null; },
        style: {},
        ownerDocument: { createElement: () => ({ style: {}, setAttribute() {}, parentNode: null }) },
        appendChild(n) { n.parentNode = this; }
    };
}
const fakeWin = { requestAnimationFrame: () => 1, cancelAnimationFrame() {} };

test('attachHandTool fails loud without a runner, screenToWorld or repaint; reports 2D by the runner\'s own aim rule', () => {
    assert.throws(() => attachHandTool({ runner: null, host: fakeHost(), win: fakeWin, onError() {} }), /no runner/);
    const deaf = { pickObjectAtScreen() {}, setSelectHighlight() {}, renderer: {}, setAimArmed() {}, isAimArmed: () => false };
    const h = attachHandTool({ runner: deaf, host: fakeHost(), win: fakeWin, onError() {} });
    assert.throws(() => h.set(true), /screenToWorld/);
    assert.equal(h.enabled, false);
    const noRepaint = { pickObjectAtScreen() {}, setSelectHighlight() {}, renderer: { screenToWorld() { return { x: 0, y: 0 }; } }, setAimArmed() {}, isAimArmed: () => false, screenPointOf() { return null; } };
    const h1 = attachHandTool({ runner: noRepaint, host: fakeHost(), win: fakeWin, onError() {} });
    assert.throws(() => h1.set(true), /no repaint\(\)/);
    assert.equal(h1.enabled, false);
    const ok = Object.assign({ repaint() {} }, noRepaint);
    const errors = [];
    const h2 = attachHandTool({ runner: ok, host: fakeHost(), win: fakeWin, onError: (e) => errors.push(e) });
    const st = h2.set(true);
    assert.equal(st.mode, '2d');
    assert.equal(st.text, HAND_STATUS['2d']);
    assert.equal(h2.set(false).text, HAND_STATUS.off);
    assert.deepEqual(errors, []);
    assert.throws(() => attachHandTool({ runner: ok, host: fakeHost(), win: fakeWin }), /onError/);
});

test('Esc while carrying in 3D writes the drop (carry3d, integer wire) BEFORE the hand stops listening', () => {
    const mirror = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } };
    let aimListener = null;
    const order = [];
    const runner = fakeRunner([mirror], {
        renderer: { screenToWorld: () => ({ x: 0, y: 0 }) }, repaint() {}, pickObjectAtScreen() {}, screenPointOf: () => null,
        armed: false, setAimArmed(on) { order.push('setAimArmed(' + on + ')'); this.armed = on; }, isAimArmed() { return this.armed; },
        getAimState: () => ({ state: 'grab-ready', hover: 'mirror', grabbed: null }),
        addAimListener(fn) { aimListener = fn; return () => { order.push('unsubscribeAim'); aimListener = null; }; }
    });
    const write = runner.updateObjectProperty;
    runner.updateObjectProperty = function (d, key, t) { order.push('write ' + JSON.stringify(t)); return write.call(this, d, key, t); };
    const heard = [];
    const off = onWrite((w) => heard.push(w));
    try {
        const h = attachHandTool({ runner, host: fakeHost(), win: fakeWin, onError: (e) => { throw e; } });
        assert.equal(h.set(true).mode, '3d');
        aimListener({ state: 'grabbed', grabbed: 'mirror' });                       // SPACE: the runner grabbed it
        mirror.rect = { left: 434.25, top: 80, z: -154.25, w: 20, h: 240, d: 160 };  // the runner's carry: floats
        h.set(false);                                                               // Esc while carrying
        assert.deepEqual(order, ['setAimArmed(true)', 'write [434,80,-154,20,240,160]', 'unsubscribeAim', 'setAimArmed(false)']);
        assert.equal(heard.length, 1);
        assert.deepEqual([heard[0].op, heard[0].by, heard[0].from, heard[0].to], ['carry3d', 'human', { center: [370, 200, 0] }, { center: [444, 200, -74] }]);
        // negative control: the pre-fix order (unsubscribe + disarm before any drop write) logs nothing
        const before = order.indexOf('write [434,80,-154,20,240,160]');
        assert.ok(before !== -1 && before < order.indexOf('unsubscribeAim'), 'the drop write must precede the unsubscribe');
    } finally { off(); }
});
