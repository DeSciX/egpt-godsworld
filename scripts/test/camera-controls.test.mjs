/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * camera-controls.test.mjs — ONE drawer of the MOVE/LOOK pads: the runner's control door.
 *
 * The package's CameraControls draws the 3D camera pads and is idempotent PER ELEMENT. A scene may attach
 * them itself through `runner.controlHost` (cl1d-mirror-route, omni-3d, sun, …); the lab attaches them for
 * every scene (maxi-scene.js::attachHumanControls) so a scene that does not still gets them. Both must
 * name the SAME element — the runner's controlHost — or the page carries two pairs.
 *
 * Driven in node with the SERVED CameraControls (the vendored js/game copy) over a minimal DOM:
 *   1. 3D, the scene attached its own pads, then the lab attaches: exactly one MOVE and one LOOK, under
 *      runner.controlHost (negative control: the lab attaching on its own mount → two pairs, RED);
 *   2. 3D, the scene attached nothing: the lab's attach alone gives one MOVE and one LOOK;
 *   3. 2D (no angular pose): no pad anywhere;
 *   4. a runner with no controlHost fails loud, naming the door.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SDK_DIST } from '../../site/app-assets/frqtl-sdk.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CameraControls = createRequire(import.meta.url)(path.join(REPO, 'site', SDK_DIST, 'js/game/objects/CameraControls.js'));

// ── a minimal DOM: what CameraControls and the lab touch, nothing more ──────────────────────
function makeDoc() {
    const doc = {
        activeElement: null,
        createElement: function (tag) { return makeEl(doc, tag); },
        addEventListener: function () {}, removeEventListener: function () {}
    };
    return doc;
}
function makeEl(doc, tag) {
    const attrs = {};
    const el = {
        tagName: String(tag).toUpperCase(), ownerDocument: doc, parentNode: null, children: [], style: {}, tabIndex: -1, textContent: '',
        setAttribute: function (k, v) { attrs[k] = String(v); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
        removeAttribute: function (k) { delete attrs[k]; },
        appendChild: function (c) { c.parentNode = el; el.children.push(c); return c; },
        removeChild: function (c) { el.children.splice(el.children.indexOf(c), 1); c.parentNode = null; return c; },
        addEventListener: function () {}, removeEventListener: function () {},
        focus: function () { doc.activeElement = el; },
        getBoundingClientRect: function () { return { left: 0, top: 0, width: 96, height: 96 }; }
    };
    return el;
}
function pads(root) {
    const out = [];
    (function walk(el) {
        if (el.getAttribute('data-role') === 'camera-joystick') { out.push({ stick: el.getAttribute('data-stick'), host: el.parentNode.parentNode }); }
        el.children.forEach(walk);
    })(root);
    return out;
}

/** The page the lab frames: #canvas-wrapper (the lab's mount) → the runner's control host → the canvas. */
function stage(is3d) {
    const doc = makeDoc();
    const mount = makeEl(doc, 'div'); mount.id = 'canvas-wrapper';
    doc.getElementById = function (id) { return id === mount.id ? mount : null; };   // the scene page's own mount, as scene.html declares it
    const controlHost = makeEl(doc, 'div'); controlHost.id = 'frqtl-recipe-canvas-test';
    mount.appendChild(controlHost);
    controlHost.appendChild(makeEl(doc, 'canvas'));
    let orbit = is3d ? { azimuth: 45, elevation: 45, distance: 900, roll: 0, target: null } : { distance: 400, target: null };
    const cameraControl = {
        poseFields: is3d ? [{ name: 'azimuth' }, { name: 'elevation' }, { name: 'distance' }, { name: 'roll' }] : [{ name: 'distance' }],
        getOrbit: function () { return Object.assign({}, orbit); },
        setOrbit: function (o) { orbit = Object.assign({}, orbit, o); },
        look: function () {}, move: function () {}
    };
    const runner = { controlHost: controlHost, cameraControl: cameraControl, isRunning: true };
    return { doc, mount, controlHost, runner };
}

async function sceneModule(doc) {
    globalThis.window = { CameraControls: CameraControls, getComputedStyle: function (el) { return { position: el.style.position || 'static' }; } };
    globalThis.document = doc;
    return import('../../site/app-assets/maxi-scene.js?' + Math.random());
}

test('3D: a scene that attached its own pads and the lab attach through ONE door — one MOVE, one LOOK', async () => {
    const s = stage(true);
    const { attachHumanControls } = await sceneModule(s.doc);
    CameraControls.attach(s.runner, s.runner.controlHost);           // the scene's own attach (cl1d-mirror-route's shape)
    attachHumanControls(s.runner);                            // the lab's
    const all = pads(s.mount);
    assert.deepEqual(all.map((p) => p.stick).sort(), ['look', 'move'], 'the page carries ' + all.length + ' pads: ' + JSON.stringify(all.map((p) => p.stick + '@' + p.host.id)));
    assert.ok(all.every((p) => p.host === s.controlHost), 'the pads hang off the runner\'s controlHost, never the lab mount');
});

test('3D: a scene that attached nothing still gets one MOVE and one LOOK from the lab', async () => {
    const s = stage(true);
    const { attachHumanControls } = await sceneModule(s.doc);
    attachHumanControls(s.runner);
    const all = pads(s.mount);
    assert.deepEqual(all.map((p) => p.stick).sort(), ['look', 'move']);
    assert.ok(all.every((p) => p.host === s.controlHost));
});

test('2D: no camera pads anywhere', async () => {
    const s = stage(false);
    const { attachHumanControls } = await sceneModule(s.doc);
    CameraControls.attach(s.runner, s.runner.controlHost);
    attachHumanControls(s.runner);
    assert.equal(pads(s.mount).length, 0);
});

test('a runner with no control host fails loud, naming the door', async () => {
    const s = stage(true);
    const { attachHumanControls } = await sceneModule(s.doc);
    s.runner.controlHost = null;
    assert.throws(() => attachHumanControls(s.runner), /controlHost/);
});
