/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * hand-tool.test.mjs — the human's hand shares Maxi's ONE position write.
 *
 * Gates:
 *   1. BEHAVIOUR: attachHandTool driven in node (fake host/runner/renderer) with N pointer moves while
 *      held makes exactly N runner.placeDeclaredAt placements (integer centres), N repaints and ONE end of
 *      act (endAct: the press-to-release written into the sketch, the world's Record row the package's) —
 *      the negative controls are plants of a second write (a bracket-syntax placement; a direct rect
 *      assignment), each loaded as a real module beside a copy of maxi-hands.js and driven the same way:
 *      RED; an inlined placeDeclaredAt is the token gate's (2);
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
import { writePosition } from '../../site/app-assets/maxi-hands.js';
import { fakeRunner } from './fake-runner.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const ASSETS = 'site/app-assets';

// ── 1. behaviour: N moves → N writes, N repaints, one act ───────────────────────────────────

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
        appendChild(n) { n.parentNode = this; },
        removeChild(n) { n.parentNode = null; }
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
 * Drive one 2D drag of N pointer moves through a hand module, counting its ends of act.
 * Returns what the runner and the act seam saw; a throw out of a handler is collected in `errors`.
 */
export async function driveDrag(mods, n) {
    const sc = fakeScene();
    const errors = [];
    let acts = 0;
    try {
        const hand = mods.attachHandTool({ runner: sc.runner, host: sc.host, win: sc.win, endAct: async () => { acts += 1; }, onError: (e) => errors.push(e) });
        hand.set(true);
        const ev = (x, y) => ({ button: 0, pointerId: 7, clientX: x, clientY: y, target: {}, preventDefault() {} });
        sc.host.listeners.pointerdown(ev(220, 200));
        for (let i = 1; i <= n; i++) { sc.host.listeners.pointermove(ev(220 - 7 * i, 200 + 3 * i)); }
        sc.host.listeners.pointerup(ev(220 - 7 * n, 200 + 3 * n));
        await hand.dispose();   // resolves once the act is written
    } catch (e) { errors.push(e); }   // a handler that throws (no try of its own) is a measured failure, not a crash
    return { place: sc.calls.place, repaint: sc.calls.repaint || 0, acts, errors, mirror: sc.mirror };
}

/** The behavioural one-write-path gate. */
export function assertDragIsOneWritePath(r, n) {
    assert.deepEqual(r.errors.map((e) => e.message), [], 'the drag raised errors');
    assert.equal(r.place.length, n, n + ' pointer moves must make exactly ' + n + ' placeDeclaredAt placements, got ' + r.place.length);
    assert.equal(r.repaint, n, 'every drag write must be followed by runner.repaint() (a paused world shows the move), got ' + r.repaint + ' for ' + n);
    assert.equal(r.acts, 1, 'one press-to-release is ONE act: one end of act (one sketch write, one Record row), got exactly ' + r.acts);
    for (let i = 0; i < n; i++) {
        assert.deepEqual(r.place[i].name, 'mirror');
        assert.ok(r.place[i].point.every(Number.isInteger), 'placement ' + i + ' carries a non-integer point ' + JSON.stringify(r.place[i].point));
    }
}

const DRAG_LINE = /writePosition\(runner, st\.held\.obj, \{ center: to \}\);/;
const RELEASE = 'const moved = st.held.moved;\n        st.held = null;';
const RELEASE_WRITE = "if (st.held.last) { writePosition(runner, st.held.obj, { center: st.held.last }); }\n        " + RELEASE;
/** Plants of a second write path in the drag (the verifier's shapes, on the SDK's declared-object write), each kept writing once on release. */
export const HAND_PLANTS = Object.freeze({
    'P1b bracket-syntax placement, writePosition kept on release': (src) => src.replace(DRAG_LINE,
        "runner['placeDeclared' + 'At'](st.held.obj, to); st.held.last = to;").replace(RELEASE, RELEASE_WRITE),
    'P1c direct rect assignment, writePosition kept on release': (src) => src.replace(DRAG_LINE,
        "st.held.obj.rect = { left: to[0], top: to[1], w: 1, h: 1 }; st.held.last = to;").replace(RELEASE, RELEASE_WRITE)
});
/** A second write the behaviour cannot tell from the one (same placements): the token gate (2) is its gate. */
const INLINED = (src) => src.replace(DRAG_LINE, "runner.placeDeclaredAt(st.held.obj, to.map(Math.round));");

/** Load a (planted) hand source as a real module beside its own copy of maxi-hands.js. */
async function loadPlanted(src) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-plant-'));
    fs.copyFileSync(path.join(REPO, ASSETS, 'maxi-ask.js'), path.join(dir, 'maxi-ask.js'));   // maxi-hands.js imports maxi-ask.js
    fs.writeFileSync(path.join(dir, 'maxi-hands.js'), read(ASSETS + '/maxi-hands.js')
        .replace("from './frqtl-web-project.js'", "from '" + pathToFileURL(path.join(REPO, ASSETS, 'frqtl-web-project.js')).href + "'"));   // and the ./project door, where it is
    fs.writeFileSync(path.join(dir, 'maxi-hand-tool.js'), src);
    const tool = await import(pathToFileURL(path.join(dir, 'maxi-hand-tool.js')).href);
    return { mods: { attachHandTool: tool.attachHandTool }, dir };
}

test('BEHAVIOUR: N pointer moves while held = N writes, N repaints, one act (negative controls: the verifier\'s plants are RED)', async () => {
    const N = 6;
    const real = await driveDrag({ attachHandTool }, N);
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
            const r = await driveDrag(mods, N);
            assert.throws(() => assertDragIsOneWritePath(r, N), /exactly|errors|repaint/, label + ' stayed GREEN');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    // and the unplanted copy, loaded the same way, is green (the loader itself measures the real thing)
    const { mods, dir } = await loadPlanted(src);
    try { assertDragIsOneWritePath(await driveDrag(mods, N), N); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
        'maxi-hand-tool.js P1c': HAND_PLANTS['P1c direct rect assignment, writePosition kept on release'](files['maxi-hand-tool.js']),
        'maxi-hand-tool.js inlined': INLINED(files['maxi-hand-tool.js'])
    };
    for (const [label, planted] of Object.entries(plants)) {
        const key = label.split(' ')[0];
        assert.throws(() => assertNoSecondWriter(Object.assign({}, files, { [key]: planted })), /second write path/, label + ' stayed GREEN');
    }
});

test('the toolbar declares the Hand toggle and the lab wires H / Esc through handKeyAction', () => {
    const html = read('site/app.html');
    assert.ok(/<button id="btn-hand"[^>]*><span class="label">Hand<\/span><\/button>/.test(html), 'app.html lacks #btn-hand');
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
        appendChild(n) { n.parentNode = this; },
        removeChild(n) { n.parentNode = null; }
    };
}
const fakeWin = { requestAnimationFrame: () => 1, cancelAnimationFrame() {} };

test('attachHandTool fails loud without a runner, screenToWorld or repaint; reports 2D by the runner\'s own aim rule', () => {
    assert.throws(() => attachHandTool({ runner: null, host: fakeHost(), win: fakeWin, endAct: async () => {}, onError() {} }), /no runner/);
    const deaf = { pickObjectAtScreen() {}, setSelectHighlight() {}, renderer: {}, setAimArmed() {}, isAimArmed: () => false };
    const h = attachHandTool({ runner: deaf, host: fakeHost(), win: fakeWin, endAct: async () => {}, onError() {} });
    assert.throws(() => h.set(true), /screenToWorld/);
    assert.equal(h.enabled, false);
    const noRepaint = { pickObjectAtScreen() {}, setSelectHighlight() {}, renderer: { screenToWorld() { return { x: 0, y: 0 }; } }, setAimArmed() {}, isAimArmed: () => false, screenPointOf() { return null; } };
    const h1 = attachHandTool({ runner: noRepaint, host: fakeHost(), win: fakeWin, endAct: async () => {}, onError() {} });
    assert.throws(() => h1.set(true), /no repaint\(\)/);
    assert.equal(h1.enabled, false);
    const ok = Object.assign({ repaint() {} }, noRepaint);
    const errors = [];
    const h2 = attachHandTool({ runner: ok, host: fakeHost(), win: fakeWin, endAct: async () => {}, onError: (e) => errors.push(e) });
    const st = h2.set(true);
    assert.equal(st.mode, '2d');
    assert.equal(st.text, HAND_STATUS['2d']);
    assert.equal(h2.set(false).text, HAND_STATUS.off);
    assert.deepEqual(errors, []);
    assert.throws(() => attachHandTool({ runner: ok, host: fakeHost(), win: fakeWin }), /onError/);
});

test('Esc while carrying in 3D writes the drop (integer wire) and ends the act BEFORE the hand stops listening', async () => {
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
    const h = attachHandTool({ runner, host: fakeHost(), win: fakeWin, endAct: async () => { order.push('endAct'); }, onError: (e) => { throw e; } });
    assert.equal(h.set(true).mode, '3d');
    aimListener({ state: 'grabbed', grabbed: 'mirror' });                       // SPACE: the runner grabbed it
    mirror.rect = { left: 434.25, top: 80, z: -154.25, w: 20, h: 240, d: 160 };  // the runner's carry: floats
    h.set(false);                                                               // Esc while carrying
    await h.dispose();                                                          // resolves once the act is written
    assert.deepEqual(order, ['setAimArmed(true)', 'write [434,80,-154,20,240,160]', 'unsubscribeAim', 'setAimArmed(false)', 'endAct']);
    // the drop write precedes the unsubscribe (negative control: the pre-fix order disarmed before any drop write)
    const before = order.indexOf('write [434,80,-154,20,240,160]');
    assert.ok(before !== -1 && before < order.indexOf('unsubscribeAim'), 'the drop write must precede the unsubscribe');
});

test('every act ends written into the sketch: a release after a drag calls endAct once, a click without a move does not; a refusal reaches the error bar by name; a part declared in code is not picked up (negative control: no endAct is refused at attach)', async () => {
    const run = async (endAct, moves) => {
        const sc = fakeScene();
        const errors = [];
        const hand = attachHandTool({ runner: sc.runner, host: sc.host, win: sc.win, endAct: endAct, onError: (e) => errors.push(e) });
        hand.set(true);
        const ev = (x, y) => ({ button: 0, pointerId: 7, clientX: x, clientY: y, target: {}, preventDefault() {} });
        sc.host.listeners.pointerdown(ev(220, 200));
        for (let i = 1; i <= moves; i++) { sc.host.listeners.pointermove(ev(220 - 7 * i, 200)); }
        sc.host.listeners.pointerup(ev(220 - 7 * moves, 200));
        await new Promise((r) => setTimeout(r, 0));
        return { errors, hand, sc };
    };
    let ended = 0;
    const one = await run(async () => { ended += 1; }, 3);
    assert.equal(ended, 1, 'a press-move-release is one act: one sketch write');
    assert.deepEqual(one.errors, []);
    ended = 0;
    await run(async () => { ended += 1; }, 0);
    assert.equal(ended, 0, 'a click that moved nothing writes nothing');
    const refused = await run(async () => { throw new Error('the Hand: the sketch text did not take this hand — "mirror" rect (set): planted'); }, 2);
    assert.equal(refused.errors.length, 1, 'the refusal reaches onError');
    assert.match(refused.errors[0].message, /did not take this hand — "mirror" rect \(set\)/);
    assert.match(refused.hand.state().error, /did not take this hand/);
    // a part the scene declares in code: the hand refuses to pick it up, by name, and writes nothing
    const sc = fakeScene();
    Object.defineProperty(sc.mirror, 'inParts', { value: false, configurable: true });
    const errors = [];
    const hand = attachHandTool({ runner: sc.runner, host: sc.host, win: sc.win, endAct: async () => {}, onError: (e) => errors.push(e) });
    hand.set(true);
    sc.host.listeners.pointerdown({ button: 0, pointerId: 7, clientX: 220, clientY: 200, target: {}, preventDefault() {} });
    assert.match(errors.map((e) => e.message).join(' '), /cannot pick up "mirror": "mirror" is declared in the scene's code, not in its `export const parts` block/);
    assert.deepEqual(sc.calls.place, [], 'nothing was written');
    assert.throws(() => attachHandTool({ runner: fakeScene().runner, host: fakeScene().host, win: {}, onError() {} }), /needs endAct\(\)/);
});

/** A 3D runner whose aim grabs by SPACE and releases on a selection that is not the grabbed object (the SDK's rule). */
function aimRunner(objects) {
    let listener = null;
    const aim = { hover: objects[0].name, grabbed: null };
    const state = () => ({ state: aim.grabbed ? 'grabbed' : 'grab-ready', hover: aim.hover, grabbed: aim.grabbed, error: null });
    const runner = fakeRunner(objects, {
        renderer: { screenToWorld: () => ({ x: 0, y: 0 }) }, repaint() {}, pickObjectAtScreen() {}, screenPointOf: () => null,
        armed: false, setAimArmed(on) { this.armed = on; }, isAimArmed() { return this.armed; },
        getAimState: state,
        addAimListener(fn) { listener = fn; return () => { listener = null; }; },
        setSelectHighlight(o) { if (aim.grabbed && (!o || o.name !== aim.grabbed)) { aim.grabbed = null; if (listener) { listener(state()); } } },
        grabToggle() { aim.grabbed = aim.grabbed ? null : aim.hover; if (listener) { listener(state()); } },
        carry(rect) { if (aim.grabbed) { runner.getObjectByName(aim.grabbed).rect = rect; } }   // a camera pose moving the grabbed object
    });
    return { runner, aim };
}

test('3D: a SPACE-grab of a part the scene declares in code is let go inside the grab\'s own notice, by name, before any carry; a part of `parts` carries as before (negative control: the grab path without the owner\'s refusal carries the coded part)', async () => {
    const slab = () => ({ name: 'm10', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } });
    const coded = slab();
    Object.defineProperty(coded, 'inParts', { value: false, configurable: true });
    const { runner, aim } = aimRunner([coded]);
    const errors = [];
    const h = attachHandTool({ runner, host: fakeHost(), win: fakeWin, endAct: async () => {}, onError: (e) => errors.push(e) });
    assert.equal(h.set(true).mode, '3d');
    assert.match(h.state().text, /cannot move: "m10" is declared in the scene's code/, 'the aim names it while it is only hovered');
    runner.grabToggle();                                                   // SPACE
    assert.equal(aim.grabbed, null, 'the runner\'s grab was released inside its own notice');
    runner.carry({ left: 200, top: 80, z: -80, w: 20, h: 240, d: 160 });   // the next camera pose: nothing is held, so nothing moves
    assert.equal(coded.rect.left, 360, 'the code-declared part never moved');
    assert.deepEqual(runner.calls.update, [], 'nothing was written');
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /^\[hand\] cannot pick up "m10": "m10" is declared in the scene's code, not in its `export const parts` block, so the sketch cannot hold a change to it — the grab was let go before anything moved\.$/);
    // a part of the sketch's `parts` block: the grab holds and carries
    const part = slab();
    const ok = aimRunner([part]);
    const errs2 = [];
    const h2 = attachHandTool({ runner: ok.runner, host: fakeHost(), win: fakeWin, endAct: async () => {}, onError: (e) => errs2.push(e) });
    h2.set(true);
    ok.runner.grabToggle();
    assert.equal(ok.aim.grabbed, 'm10', 'a part of `parts` stays grabbed');
    assert.deepEqual(errs2, []);
    // negative control: the planted pre-fix grab path (no refusal) lets the code-declared part be carried
    const src = fs.readFileSync(path.join(REPO, ASSETS, 'maxi-hand-tool.js'), 'utf8');
    const GUARD = 'const why = partRefusal(runner, d);';
    assert.equal(src.split(GUARD).length, 2, 'the plant target moved');
    const { mods, dir } = await loadPlanted(src.replace(GUARD, 'const why = null;   // planted: no refusal at the grab'));
    try {
        const c2 = slab();
        Object.defineProperty(c2, 'inParts', { value: false, configurable: true });
        const bad = aimRunner([c2]);
        const h3 = mods.attachHandTool({ runner: bad.runner, host: fakeHost(), win: fakeWin, endAct: async () => {}, onError: () => {} });
        h3.set(true);
        bad.runner.grabToggle();
        bad.runner.carry({ left: 200, top: 80, z: -80, w: 20, h: 240, d: 160 });
        assert.equal(bad.aim.grabbed, 'm10', 'the planted hand keeps the grab');
        assert.equal(c2.rect.left, 200, 'the planted hand lets the world carry the code-declared part — the gate above is RED on it');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
