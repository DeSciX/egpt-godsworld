/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"   (a bare `node --test scripts` is a module path on Node 25)

/**
 * hands.test.mjs
 *
 * Gates:
 *   1. window.DeSciX_Actions is built from HANDS and covers it exactly (a hand-typed table is red);
 *   2. the persona's HANDS block equals the generator's output (skips LOUDLY until the markers exist);
 *   3. app-assets/frqtl-sdk.js spells the vendored dist through the package's two browser doors (esm boot,
 *      registry barrel), under SDK_DIST, at PINNED.json's version;
 *   4. the adapter returns JSON text and relays a hand's throw verbatim;
 *   5. the package's registry barrel is importable here (node), at the path the pin names;
 *   6. the declared scene graph is read off the runner (declared + kindOf + positionAuthorityOf +
 *      centerOf + envelopeOf), never re-derived; the one write routes a centre through
 *      placeDeclaredAt and a rect through updateObjectProperty.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    HANDS, HANDS_MARKERS, buildAdapter, assertAdapterCoversHands, renderHandsMarkdown, placementOf, inventoryObjects,
    publishHands, inventoryOf, viewerOf, spansOf, worldShape, INVENTORY_KEYS, CLIP_SECONDS, SEE_DEFAULTS, DRAG_DEFAULTS, plannedFrames, assertClipSeconds, writePosition, RECT_CONVENTION
} from '../../site/app-assets/maxi-hands.js';
import * as SDK from '../../site/app-assets/frqtl-sdk.js';
import { fakeRunner, sdkCameraControl } from './fake-runner.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function fakeLab(overrides) {
    return Object.assign({
        host: () => 'standalone',
        scene: (op) => { throw new Error(op + ': no scene is loaded — loadScene{id} or openSketch{source} first.'); },
        state: { grab: null },
        loadScene: async (a) => ({ scene: 'fake', id: a.id, mode: a.mode || null }),
        sceneSource: async (a) => ({ id: a.id, path: 'scenes/fake.js', source: 'function buildExperiment(exp) {}' }),
        openSketch: async (a) => ({ scene: 'sketch', renderer: a.renderer || 'p5' }),
        restart: async () => ({ scene: 'fake' }),
        inventory: () => ({ tick: 0, objects: [] }),
        ask: async (op) => { throw new Error(op + ': no command door in the fake lab'); },
        say: () => {}
    }, overrides || {});
}

test('every HANDS op is a key of the adapter, and nothing else is', () => {
    const adapter = buildAdapter(HANDS, fakeLab());
    assert.deepEqual(Object.keys(adapter).sort(), Object.keys(HANDS).sort());
    assert.equal(assertAdapterCoversHands(adapter, HANDS), true);
    for (const op of Object.keys(HANDS)) {
        assert.equal(typeof HANDS[op].run, 'function', op + '.run');
        assert.equal(typeof HANDS[op].returns, 'string', op + '.returns');
        assert.equal(typeof HANDS[op].args, 'object', op + '.args');
    }
});

test('negative control: a hand-typed key table is refused by name', () => {
    const adapter = buildAdapter(HANDS, fakeLab());
    const missingOne = Object.assign({}, adapter);
    delete missingOne.see;
    assert.throws(() => assertAdapterCoversHands(missingOne, HANDS), /missing: \[see\]/);
    const extraOne = Object.assign({}, adapter, { glance: async () => '{}' });
    assert.throws(() => assertAdapterCoversHands(extraOne, HANDS), /extra: \[glance\]/);
});

// The persona file: $MAXI_PERSONA when set, else THIS repo's assets/system_instructions.md (after the
// maxi-memories merge the persona lives here). Absent file or absent markers is a FAILURE, never a skip.
const PERSONA = process.env.MAXI_PERSONA ? path.resolve(process.env.MAXI_PERSONA) : path.join(REPO, 'assets', 'system_instructions.md');

test('the persona HANDS block is the generated block (how-to prose, table, worked examples)', () => {
    assert.ok(fs.existsSync(PERSONA), 'persona file missing: ' + PERSONA);
    const text = fs.readFileSync(PERSONA, 'utf8');
    const b = text.indexOf(HANDS_MARKERS.begin);
    const e = text.indexOf(HANDS_MARKERS.end);
    assert.ok(b !== -1 && e > b, PERSONA + ' carries no HANDS block — put `' + HANDS_MARKERS.begin + '` and `' +
        HANDS_MARKERS.end + '` where the hands section goes, then `node scripts/gen-hands-section.mjs --write ' + PERSONA + '`.');
    const inFile = text.slice(b, e + HANDS_MARKERS.end.length);
    assert.equal(inFile.trimEnd(), renderHandsMarkdown(HANDS).trimEnd(),
        'STALE persona hands in ' + PERSONA + ' — regenerate: node scripts/gen-hands-section.mjs --write ' + PERSONA);
});

test('the generated block carries the invocation mechanics, the table and one example per hand', () => {
    const block = renderHandsMarkdown(HANDS);
    assert.ok(block.startsWith(HANDS_MARKERS.begin) && block.trimEnd().endsWith(HANDS_MARKERS.end));
    assert.ok(block.includes('json:call:<hand>') && block.includes('Run') && block.includes('strict-JSON'), 'the how-to prose is missing');
    for (const op of Object.keys(HANDS)) {
        assert.ok(block.includes('| `' + op + '` |'), 'table row missing for ' + op);
        assert.ok(block.includes('```json:call:' + op + '\n'), 'worked example missing for ' + op);
        JSON.parse(JSON.stringify(HANDS[op].example));   // every example is strict JSON
    }
});

test('frqtl-sdk.js spells the vendored dist through the two browser doors, at the pinned version', async () => {
    const src = read('site/app-assets/frqtl-sdk.js');
    const sdk = SDK;   // a static import: a broken module fails the whole file, it cannot skip
    const pinned = JSON.parse(read('site/vendor/frqtl-sdk/PINNED.json'));
    const specifiers = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    const expectDist = 'vendor/frqtl-sdk/' + pinned.version + '/dist';
    assert.deepEqual(specifiers, ['../' + expectDist + '/esm/index.js', '../' + expectDist + '/ide/registry/index.js'],
        'frqtl-sdk.js imports the boot (esm/index.js) and the registry barrel (ide/registry/index.js), nothing deeper');
    assert.ok(src.includes("SDK_VERSION = '" + pinned.version + "'"), 'SDK_VERSION must equal PINNED.json version ' + pinned.version);
    assert.ok(fs.existsSync(path.join(REPO, 'site', expectDist, 'esm', 'index.js')), 'vendored esm entry missing');
    assert.equal(sdk.SDK_DIST, expectDist);
});

test('the site manifest uploads every file the lab needs', () => {
    const m = JSON.parse(read('.descix/manifests/site.json'));
    const include = m.sources[0].include;
    for (const need of ['app.html', 'scene.html', 'app-assets/**', 'vendor/**', 'DeSciXAppSDK.js']) {
        assert.ok(include.includes(need), 'site.json include lacks ' + need + ' (an unlisted file is silently not uploaded)');
    }
});

test('the adapter returns JSON text and relays a throw verbatim', async () => {
    const adapter = buildAdapter(HANDS, fakeLab());
    assert.equal(await adapter.say({ text: 'hello' }), JSON.stringify({ said: 'hello' }));
    await assert.rejects(adapter.moveObject({ name: 'mirror', rect: [1, 2, 3, 4] }), /moveObject: no scene is loaded/);
    await assert.rejects(adapter.see({}), /see: no scene is loaded/);
    await assert.rejects(adapter.addObject({ kind: 'Wall', opts: {} }), /opts\.name/);
    await assert.rejects(adapter.loadScene('not-an-object-but-a-string'), /ONE JSON object/);
    await assert.rejects(adapter.dragTo({ to: [1, 2] }), /no scene is loaded/);
    await assert.rejects(adapter.showMemory({}), /`id` \(string\) is required/);
});

test('placementOf and inventoryObjects read the runner\'s declared registry; nothing undeclared is listed', () => {
    const wall = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 10, top: 20, w: 30, h: 40 } };
    const slab = { name: 'slab', _schemaKind: 'Wall', rect: { left: 1, top: 2, z: -5, w: 3, h: 4, d: 6 } };
    const sun = { name: 'sun', _schemaKind: 'SphereEmitter', center: [70, 200, 0] };
    const chart = { name: 'chart', _schemaKind: 'LiveChart' };
    const runner = fakeRunner([wall, slab, sun, chart]);
    assert.deepEqual(placementOf(runner, wall), { center: [25, 40, 0], rect: [10, 20, 30, 40] });
    assert.deepEqual(placementOf(runner, slab), { center: [2.5, 4, -2], rect: [1, 2, -5, 3, 4, 6] });
    assert.deepEqual(placementOf(runner, sun), { center: [70, 200, 0] });
    assert.throws(() => placementOf(runner, chart), /has no position authority/);
    // the envelope the SDK hands back may be the object's own live rect: the hands report a COPY
    const p = placementOf(runner, wall); p.rect[0] = 999;
    assert.equal(wall.rect.left, 10, 'placementOf must not hand out the live rect');
    assert.deepEqual(inventoryObjects(runner), [
        { name: 'mirror', kind: 'Wall', authority: 'rect', center: [25, 40, 0], rect: [10, 20, 30, 40] },
        { name: 'slab', kind: 'Wall', authority: 'rect', center: [2.5, 4, -2], rect: [1, 2, -5, 3, 4, 6] },
        { name: 'sun', kind: 'SphereEmitter', authority: 'center', center: [70, 200, 0] },
        { name: 'chart', kind: 'LiveChart', authority: null }
    ]);
    // an undeclared object is refused by the runner's own read, verbatim
    assert.throws(() => placementOf(runner, { name: 'ghost', _schemaKind: 'Wall', rect: { left: 0, top: 0, w: 1, h: 1 } }), /not a declared object/);
    // a runner without the declared registry is not this SDK
    assert.throws(() => inventoryObjects({ getAuthoredObjects: () => [] }), /no declared registry/);
});

test('writePosition: a centre goes through placeDeclaredAt, a rect through updateObjectProperty; the wrong key for the authority is refused', () => {
    const wall = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 10, top: 20, w: 30, h: 40 } };
    const sun = { name: 'sun', _schemaKind: 'SphereEmitter', center: [70, 200, 0] };
    const runner = fakeRunner([wall, sun]);
    assert.deepEqual(writePosition(runner, wall, { center: [100.4, 200.6] }), { center: [100, 201, 0], zHeld: false });
    assert.deepEqual(runner.calls.place, [{ name: 'mirror', point: [100, 201] }]);
    assert.deepEqual(writePosition(runner, wall, { rect: [5, 6, 30, 40] }), { rect: [5, 6, 30, 40] });
    assert.deepEqual(runner.calls.update.at(-1), { name: 'mirror', key: 'rect', tuple: [5, 6, 30, 40] });
    assert.throws(() => writePosition(runner, sun, { rect: [1, 2, 3, 4] }), /placed by its center, so a rect write is refused/);
    assert.throws(() => writePosition(runner, wall, { center: [700, 10] }), /outside the universe cube/);
    assert.equal(runner.calls.update.length, 2, 'a refused write writes nothing');
});

test('the package registry barrel imports in node at the pinned version', async (t) => {
    const pinned = JSON.parse(read('site/vendor/frqtl-sdk/PINNED.json'));
    const reg = await import('../../site/vendor/frqtl-sdk/' + pinned.version + '/dist/ide/registry/index.js');
    assert.ok(Array.isArray(reg.WALKTHROUGH) && reg.WALKTHROUGH.length > 0);
    assert.equal(reg.EXHIBITS.length, 9, 'EXHIBITS has ' + reg.EXHIBITS.length + ' rows');
    const src = await reg.loadSceneSource('dse-tunnel-rebuild');
    assert.ok(/function buildExperiment\s*\(/.test(src), 'loadSceneSource read no sketch');
    t.diagnostic('node import OK: ' + reg.WALKTHROUGH.length + ' rungs, ' + reg.EXHIBITS.length + ' exhibits, dse-tunnel-rebuild ' + src.length + ' chars');
});

// ── the PUBLISHED global ──────────────────────────────────────────────────────────────────────

// Every JS file the site serves as its own code (the vendored SDK is the SDK's).
function siteSources() {
    const out = [];
    (function walk(dir) {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const f = path.join(dir, ent.name);
            if (ent.isDirectory()) { if (ent.name !== 'vendor') { walk(f); } }
            else if (/\.(m?js|html)$/.test(ent.name)) { out.push(f); }
        }
    })(path.join(REPO, 'site'));
    return out;
}

test('window.DeSciX_Actions is published ONLY by publishHands, and the page calls it', () => {
    const assigns = [];
    for (const f of siteSources()) {
        fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
            if (/DeSciX_Actions\s*=[^=]/.test(line)) { assigns.push(path.relative(REPO, f) + ':' + (i + 1) + ': ' + line.trim()); }
        });
    }
    assert.deepEqual(assigns, ['site/app-assets/maxi-hands.js:' + (read('site/app-assets/maxi-hands.js').split('\n').findIndex((l) => /win\.DeSciX_Actions = adapter;/.test(l)) + 1) + ': win.DeSciX_Actions = adapter;'],
        'DeSciX_Actions must be assigned in exactly one place, publishHands — found:\n' + assigns.join('\n'));
    const lab = read('site/app-assets/maxi-lab.js');
    assert.match(lab, /^publishHands\(window, lab, shellGate\);$/m, 'maxi-lab.js must publish the hands with publishHands(window, lab, shellGate)');
    assert.match(lab, /^function shellGate\(op\) \{ guardBusy\('the shell\\'s ' \+ op \+ ' \(Run\)'\); \}$/m, 'the shell\'s gate is the lab\'s busy guard, naming the hand');
    assert.match(lab, /^assertAdapterCoversHands\(window\.DeSciX_Actions, HANDS\);$/m, 'maxi-lab.js must keep the runtime check on the published global');
    assert.ok(lab.indexOf('publishHands(window, lab, shellGate);') < lab.indexOf('assertAdapterCoversHands(window.DeSciX_Actions, HANDS);'));
});

test('publishHands puts exactly the HANDS keys on the window it is given; its gate refuses before a hand runs (negative control: an open gate runs it)', async () => {
    const win = {};
    let shut = false;
    const ran = [];
    const lab = fakeLab({ loadScene: async (a) => { ran.push(a.id); return { scene: 'fake', id: a.id }; } });
    const adapter = publishHands(win, lab, (op) => { if (shut) { throw new Error('the shell\'s ' + op + ' (Run) is refused while Maxi is working'); } });
    assert.equal(win.DeSciX_Actions, adapter);
    assert.deepEqual(Object.keys(win.DeSciX_Actions).sort(), Object.keys(HANDS).sort());
    assert.equal(await win.DeSciX_Actions.say({ text: 'x' }), JSON.stringify({ said: 'x' }));
    await win.DeSciX_Actions.loadScene({ id: 'r7-3d' });
    assert.deepEqual(ran, ['r7-3d'], 'an open gate runs the hand');
    shut = true;
    await assert.rejects(win.DeSciX_Actions.loadScene({ id: 'cl1a-mirror-3d' }), /^Error: the shell's loadScene \(Run\) is refused while Maxi is working$/);
    assert.deepEqual(ran, ['r7-3d'], 'a shut gate refuses BEFORE the hand runs: nothing loaded');
    assert.throws(() => publishHands({}, lab), /needs gate\(op\)/, 'the shell\'s adapter cannot be published without its gate');
    assert.throws(() => buildAdapter(HANDS, lab, 'no'), /`gate` is a function gate\(op\)/);
    await buildAdapter(HANDS, lab).loadScene({ id: 'r8-sun' });
    assert.deepEqual(ran, ['r7-3d', 'r8-sun'], 'an adapter built without a gate (the loop\'s own body) is never gated');
});

test('inventoryOf: INVENTORY_KEYS exactly, 3D canvas [w, h, d] and the camera pose; 2D canvas [w, h]; dimensions from the booted world, modes from the registry', () => {
    const wall = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } };
    const runner = fakeRunner([wall], { cameraControl: sdkCameraControl({ azimuth: 45, elevation: 45, distance: 900 }, 600, 400) });
    const sc3 = { label: '1A · Mirror (3D)', id: 'cl1a-mirror-3d', mode: null, modes: [], renderer: 'three', runner, recipeContext: { world: { w: 600, h: 400, d: 600 } }, tick: () => 7 };
    const inv = inventoryOf(sc3);
    assert.deepEqual(Object.keys(inv), [...INVENTORY_KEYS]);
    assert.deepEqual([inv.canvas, inv.dimensions, inv.modes, inv.mode], [[600, 400, 600], 3, [], null], 'the 3D mirror: a world with depth, no registry modes');
    assert.equal(inv.camera.azimuth, 45);
    assert.deepEqual(inv.viewer, { toward: '+z', away: '-z' }, 'the 3D inventory carries which way is toward the viewer');
    assert.deepEqual(inv.objects, [{ name: 'mirror', kind: 'Wall', authority: 'rect', center: [370, 200, 0], rect: [360, 80, -80, 20, 240, 160] }]);
    const inv2 = inventoryOf(Object.assign({}, sc3, { renderer: 'p5', runner: fakeRunner([]), recipeContext: { world: { w: 600, h: 400 } } }));
    assert.deepEqual([inv2.canvas, inv2.camera, inv2.viewer, inv2.dimensions], [[600, 400], null, null, 2]);
    // a registry row's declared modes ride through as declared — and never decide the dimensions
    const tunnel = inventoryOf(Object.assign({}, sc3, { id: 'dse-tunnel-rebuild', mode: '2d', modes: ['2d', '3d'], renderer: 'p5', runner: fakeRunner([]), recipeContext: { world: { w: 600, h: 400 } } }));
    assert.deepEqual([tunnel.mode, tunnel.modes, tunnel.dimensions], ['2d', ['2d', '3d'], 2]);
    assert.deepEqual(worldShape({ recipeContext: { world: { w: 6, h: 4, d: 8 } } }), { canvas: [6, 4, 8], dimensions: 3 });
    // negative controls: a scene without its declared-modes list, or without a world, is refused by name
    assert.throws(() => inventoryOf(Object.assign({}, sc3, { modes: undefined })), /no declared-modes list/);
    assert.throws(() => worldShape({ recipeContext: {} }), /worldShape: the loaded scene's recipeContext\.world is not/);
});

test('viewerOf: which z direction is toward the viewer comes off the SDK camera (measured on the 3D mirror: az 45 el 45 → +z nearer); a mirrored pose flips it; side-on is null; no camera handle is refused', () => {
    const at = (azimuth, elevation) => viewerOf(sdkCameraControl({ azimuth: azimuth, elevation: elevation, distance: 900 }, 600, 400), 3);
    // the default pose of cl1a-mirror-3d (inventory on the body, 2026-10-15): +z is the NEAR side — the slab dragged to
    // z +170 grew on screen (7009 px vs 5297 at z 0) and to z -170 shrank (4113 px), whatever its walls are named
    assert.deepEqual(at(45, 45), { toward: '+z', away: '-z' });
    // the planted MIRRORED pose (the camera across the world, az 225: measured 6963 px at z -170 vs 4109 at z +170) flips it
    assert.deepEqual(at(225, 45), { toward: '-z', away: '+z' }, 'a mirrored camera must flip the viewer axis');
    assert.deepEqual(at(0, 0), { toward: '+z', away: '-z' }, 'the SDK default pose sits on +z');
    assert.deepEqual(at(180, 30), { toward: '-z', away: '+z' });
    // a target or a roll never changes which way the camera looks
    assert.deepEqual(viewerOf(sdkCameraControl({ azimuth: 45, elevation: 45, distance: 900, roll: 90, target: { x: 10, y: 10, z: -150 } }, 600, 400), 3), { toward: '+z', away: '-z' });
    // side-on (az 90: looking along -x; el 90: straight down) — neither z direction is nearer
    assert.deepEqual(at(90, 20), { toward: null, away: null });
    assert.deepEqual(at(0, 90), { toward: null, away: null });
    // 2D has no depth; a 3D scene whose camera handle cannot answer is refused by name
    assert.equal(viewerOf(null, 2), null);
    assert.throws(() => viewerOf(null, 3), /publishes no camera handle with cameraOffsetFromWorld/);
    assert.throws(() => viewerOf({ getOrbit: () => ({}) }, 3), /publishes no camera handle with cameraOffsetFromWorld/);
    assert.throws(() => viewerOf({ cameraOffsetFromWorld: () => ({ forward: NaN }) }, 3), /no finite \{forward\} depth/);
    // the extent the stage line states is read off the tuple's owner (boxTuple's inverse), 2D and 3D; a malformed tuple is refused
    assert.deepEqual(spansOf([360, 80, -80, 20, 240, 160]), { x: [360, 380], y: [80, 320], z: [-80, 80] });
    assert.deepEqual(spansOf([360, 80, 20, 240]), { x: [360, 380], y: [80, 320] });
    assert.throws(() => spansOf([1, 2, 3]), /spansOf: a rect is \[left, top, w, h\]/);
});

// ── the 5–10 s clip band ──────────────────────────────────────────────────────────────────────

test('every default clip lies in 5–10 s, and the band is stated in the persona block', () => {
    assert.deepEqual(CLIP_SECONDS, { min: 5, max: 10 });
    const see = plannedFrames(SEE_DEFAULTS.stopAt.ticks, SEE_DEFAULTS.everyTicks, SEE_DEFAULTS.maxFrames, false) / SEE_DEFAULTS.fps;
    const drag = plannedFrames(DRAG_DEFAULTS.ticks + DRAG_DEFAULTS.settle, DRAG_DEFAULTS.everyTicks, Infinity, false) / DRAG_DEFAULTS.fps;
    const rec = HANDS.record.example.waypoints.at(-1).atTick;
    const recSec = plannedFrames(rec, 5, Infinity, true) / 10;
    for (const [what, sec] of [['see', see], ['dragTo', drag], ['record example', recSec]]) {
        assert.ok(sec >= 5 && sec <= 10, what + ' default is ' + sec + ' s');
    }
    const block = renderHandsMarkdown(HANDS);
    assert.ok(block.includes('5–10 s'), 'the generated persona block must state the 5–10 s band');
});

test('a seeing hand refuses a clip outside 5–10 s, naming the band', async () => {
    assert.throws(() => assertClipSeconds('see', 3, 10, 'x'), /0\.3 s|outside the 5–10 s/);
    assert.throws(() => assertClipSeconds('see', 101, 10, 'x'), /10\.1 s, outside the 5–10 s/);
    assert.equal(assertClipSeconds('see', 51, 10, 'x'), 5.1);
    // through the hands, on a fake running scene whose recorder must never be reached
    const recorded = [];
    const sc = { tick: () => 100, win: { FrqtlVision: { attach: () => ({ record: (o) => { recorded.push(o); throw new Error('recorder reached'); } }) } },
        runner: { isRunning: true, cameraControl: {}, getObjectByName: () => ({ rect: { left: 0, top: 0, w: 10, h: 10 } }), setSelectHighlight() {}, addTickListener: () => () => {} } };
    const adapter = buildAdapter(HANDS, fakeLab({ scene: () => sc }));
    await assert.rejects(adapter.see({ stopAt: { ticks: 10 } }), /outside the 5–10 s/);
    await assert.rejects(adapter.see({ stopAt: { ticks: 2000 }, maxFrames: 500 }), /outside the 5–10 s/);
    await assert.rejects(adapter.dragTo({ name: 'w', to: [50, 50], ticks: 20, settle: 0 }), /outside the 5–10 s/);
    await assert.rejects(adapter.dragTo({ name: 'w', to: [50, 50], ticks: 900 }), /outside the 5–10 s/);
    await assert.rejects(adapter.record({ waypoints: [{ atTick: 0, pose: {} }, { atTick: 100, pose: {} }] }), /outside the 5–10 s/);
    assert.equal(recorded.length, 0, 'an out-of-band request must be refused before filming');
});

// ── the integer wire ──────────────────────────────────────────────────────────────────────────

test('2D vs 3D has ONE owner: dragTo asks worldShape (a 3D `to` passes on a world with depth, is refused on a flat one); no other site/ or minimaxi/ module reads the world\'s depth', async () => {
    const mk = (world) => {
        const w = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } };
        const runner = fakeRunner([w], { isRunning: true });
        return { tick: () => 0, win: {}, recipeContext: { world }, runner };
    };
    const deep = mk({ w: 600, h: 400, d: 600 });
    assert.equal(worldShape(deep).dimensions, 3);
    // a world with depth: the 2D refusal must NOT fire (the drag fails later, on the fake lab's missing eyes)
    const r3 = await buildAdapter(HANDS, fakeLab({ scene: () => deep })).dragTo({ name: 'mirror', to: [370, 200, 120] }).then(() => null, (e) => e);
    assert.ok(!r3 || !/2D world/.test(r3.message), 'dragTo refused a 3D `to` on a world with depth: ' + (r3 && r3.message));
    await assert.rejects(buildAdapter(HANDS, fakeLab({ scene: () => mk({ w: 600, h: 400 }) })).dragTo({ name: 'mirror', to: [370, 200, 120] }), /dragTo: this scene is a 2D world — give `to` as \[x, y\]/);
    // source gate: the booted world's depth is read in worldShape only
    const files = ['site/app-assets', 'minimaxi'].flatMap((d) => fs.readdirSync(path.join(REPO, d)).filter((f) => /\.(m?js)$/.test(f)).map((f) => d + '/' + f));
    const hits = [];
    for (const f of files) {
        read(f).split('\n').forEach((line, i) => { if (/\bworld\.d\b/.test(line)) { hits.push(f + ':' + (i + 1) + ': ' + line.trim()); } });
    }
    const owner = read('site/app-assets/maxi-hands.js').split('export function worldShape')[1].split('\n}\n')[0];
    const outside = hits.filter((h) => !(h.startsWith('site/app-assets/maxi-hands.js') && owner.includes(h.split(': ').slice(1).join(': '))));
    assert.deepEqual(outside, [], 'the world\'s depth is read outside maxi-hands.js worldShape');
});

test('hand-supplied tuples must be integers: moveObject{rect}, resize{size}, dragTo{to} refuse a fraction by name; nothing is written', async () => {
    const w = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 300, top: 80, w: 20, h: 240 } };
    const runner = fakeRunner([w], { isRunning: true });
    const writes = runner.calls.update;
    const sc = { tick: () => 0, win: {}, recipeContext: { world: { w: 600, h: 400 } }, runner };
    const adapter = buildAdapter(HANDS, fakeLab({ scene: () => sc }));
    await assert.rejects(adapter.moveObject({ name: 'mirror', rect: [300.4, 80, 20, 240] }), /moveObject: `rect` must be whole world pixels \(the wire is integer\), got \[300\.4,80,20,240\] — element 0 is 300\.4/);
    await assert.rejects(adapter.resize({ name: 'mirror', size: [20, 120.5] }), /resize: `size` must be whole world pixels .* element 1 is 120\.5/);
    await assert.rejects(adapter.dragTo({ name: 'mirror', to: [310.5, 200] }), /dragTo: `to` must be whole world pixels .* element 0 is 310\.5/);
    assert.deepEqual(writes, [], 'a refused tuple writes nothing');
    assert.equal(JSON.parse(await adapter.moveObject({ name: 'mirror', rect: [301, 80, 20, 240] })).rect.join(), '301,80,20,240');
    await assert.rejects(adapter.dragTo({ name: 'mirror', to: [310, 200, 5] }), /2D world — give \`to\` as \[x, y\]/);
    assert.ok(/hand-supplied tuples must be integers/.test(RECT_CONVENTION) && /derived positions .* are rounded to the integer wire once, at the write/.test(RECT_CONVENTION));
    const block = renderHandsMarkdown(HANDS);
    assert.ok(block.includes('hand-supplied tuples must be integers'), 'the persona block states the integer wire');
    const src = read('site/app-assets/maxi-hands.js');
    assert.equal((src.match(/Math\.round\(/g) || []).filter((m, i, a) => true).length, 2, 'Math.round appears once in writePosition (+1 in the seconds display) — derived positions are rounded once');
});

test('writePosition: a failed read of the starting position throws naming the object and the read; nothing is written', () => {
    const probe = { name: 'ghost', _schemaKind: 'Probe' };
    const runner = fakeRunner([probe]);
    assert.throws(() => writePosition(runner, probe, { rect: [1, 2, 3, 4] }, { op: 'drag', by: 'human' }),
        /writePosition: cannot read where "ghost" is before moving it \("ghost" \(Probe\) has no position authority/);
    assert.throws(() => writePosition(runner, { name: 'stranger', _schemaKind: 'Wall', rect: { left: 0, top: 0, w: 1, h: 1 } }, { center: [1, 2] }),
        /cannot read where "stranger" is before moving it \(\[FrqtlApp\.centerOf\] "stranger" is not a declared object/);
    assert.deepEqual(runner.calls.update, []);
});
