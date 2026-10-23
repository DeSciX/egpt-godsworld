/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"   (a bare `node --test scripts` is a module path on Node 25)

/**
 * hands.test.mjs
 *
 * Gates:
 *   1. window.DeSciX_Actions is built from HANDS and covers it exactly (a hand-typed table is red);
 *   2. the persona's HANDS block equals the generator's output (skips LOUDLY until the markers exist);
 *   3. the pages import the vendored @descix/frqtl-web by specifier only: app.html and scene.html carry the import map
 *      scripts/gen-import-maps.mjs renders from the pin, and no site module spells a vendored path;
 *   4. the adapter returns JSON text and relays a hand's throw verbatim;
 *   5. the package's registry barrel is importable here (node), through the site's own map;
 *   6. the declared scene graph is read off the runner (declared + kindOf + positionAuthorityOf +
 *      centerOf + envelopeOf), never re-derived; the one write routes a centre through
 *      placeDeclaredAt and a rect through updateObjectProperty.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    HANDS, HANDS_MARKERS, buildAdapter, assertAdapterCoversHands, renderHandsMarkdown, placementOf, inventoryObjects,
    publishHands, inventoryOf, viewerOf, spansOf, centerOfRect, worldShape, INVENTORY_KEYS, CLIP_SECONDS, SEE_DEFAULTS, DRAG_DEFAULTS, plannedFrames, assertClipSeconds, writePosition, RECT_CONVENTION, SKETCH_KEYS, partsNowOf
} from '../../site/app-assets/maxi-hands.js';
import { PAGES, renderPage, siteImportMap, SITE_ROOT, PROJECT_DOOR, renderProjectDoor } from '../gen-import-maps.mjs';
import { SKETCH_FORM } from '../../site/app-assets/maxi-record-folder.js';   // the one definition of the sketch module form
import { PINNED, SITE_DIST, distUrl, exportFile } from '../frqtl-web-pin.mjs';
import './site-import-map.mjs';
import { fakeRunner, sdkCameraControl, withSketch } from './fake-runner.mjs';
import { testTmpDir } from './tmpdir.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function fakeLab(overrides) {
    return Object.assign({
        host: () => 'standalone',
        scene: (op) => { throw new Error(op + ': no scene is loaded — loadScene{id} or openSketch{source} first.'); },
        state: { grab: null, scene: { source: 'export default function buildExperiment(exp) {}\n' } },
        loadScene: async (a) => ({ scene: 'fake', id: a.id, mode: a.mode || null }),
        sceneSource: async (a) => ({ id: a.id, path: 'scenes/fake.js', source: 'function buildExperiment(exp) {}' }),
        openSketch: async (a) => ({ scene: 'sketch', renderer: a.renderer || 'p5' }),
        restart: async () => ({ scene: 'fake' }),
        inventory: () => ({ tick: 0, objects: [] }),
        ask: async (op) => { throw new Error(op + ': no command door in the fake lab'); },
        say: () => {},
        current() { try { return this.scene('current'); } catch (e) { return null; } }   // the fake's loaded scene, as the lab's state.scene
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

test('the pages carry the generated import map, and no site module spells a vendored path', () => {
    for (const page of PAGES) {
        const r = renderPage(read('site/' + page), 'site/' + page);
        assert.equal(r.stale, false, 'site/' + page + ' carries a stale import map — run node scripts/gen-import-maps.mjs --write');
        const at = read('site/' + page);
        const firstModule = at.search(/<script[^>]*type="module"/);
        assert.ok(at.indexOf('<script type="importmap">') !== -1 && (firstModule === -1 || at.indexOf('<script type="importmap">') < firstModule),
            'site/' + page + ': the import map must precede every module script (a later map is ignored by the browser)');
    }
    const map = siteImportMap().imports;
    for (const [spec, target] of Object.entries(map)) {
        assert.ok(target.startsWith('./' + SITE_DIST + '/'), spec + ' maps outside the pinned dist, or by a bare path the browser ignores (an import-map value is a URL or starts with /, ./ or ../): ' + target);
        if (!spec.endsWith('/')) { assert.ok(fs.existsSync(path.join(REPO, 'site', target)), spec + ' → ' + target + ' is not vendored'); }
    }
    const spelled = [];
    const door = path.join(REPO, 'site', PROJECT_DOOR);
    assert.equal(fs.readFileSync(door, 'utf8'), renderProjectDoor(), 'site/' + PROJECT_DOOR + ' is the generator\'s text — run node scripts/gen-import-maps.mjs --write');
    for (const f of siteSources()) {
        const text = fs.readFileSync(f, 'utf8');
        const rel = path.relative(REPO, f);
        if (f === door) { continue; }   // the ONE generated module that reaches the vendored ./project by path (held equal to its generator above)
        if (/vendor\/frqtl-(sdk|web)\//.test(text.replace(/<!-- IMPORT-MAP:BEGIN[\s\S]*?<!-- IMPORT-MAP:END -->/g, ''))) { spelled.push(rel); }
        if (/frqtl-sdk\.js|@descix\/frqtl-sdk\b/.test(text)) { spelled.push(rel + ' (names the retired @descix/frqtl-sdk)'); }
    }
    assert.deepEqual(spelled, [], 'a site file spells the vendored path or the retired package outside the generated map (import by @descix/frqtl-web/... specifier)');
    assert.ok(!fs.existsSync(path.join(REPO, 'site', 'app-assets', 'frqtl-sdk.js')), 'the retired loader app-assets/frqtl-sdk.js is back');
});

/** The specifiers a sketch text imports that are not rows of the package's own table (libPathOf, its one reader), plus a parse failure. */
export async function sketchImportFaults(source) {
    const { libPathOf } = await import(distUrl(exportFile('./project')));
    const faults = [];
    for (const m of source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
        try { libPathOf(m[1]); } catch (e) { faults.push(m[1] + ': ' + e.message.split(' — ')[0]); }
    }
    if (!SKETCH_FORM.test(source)) { faults.push('no `export default function buildExperiment(`'); }
    const { spawnSync } = await import('node:child_process');
    const dir = testTmpDir('hands-sketch');
    try {
        fs.writeFileSync(path.join(dir, 'sketch.mjs'), source);
        const r = spawnSync(process.execPath, ['--check', path.join(dir, 'sketch.mjs')], { encoding: 'utf8' });
        if (r.status !== 0) { faults.push('does not parse as an ES module: ' + r.stderr.trim().split('\n').find((l) => /Error/.test(l))); }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    return faults;
}

test('the openSketch example is a sketch module importing only rows of the package\'s specifier table (an unknown specifier is red)', async () => {
    const src = HANDS.openSketch.example.source;
    assert.deepEqual(await sketchImportFaults(src), []);
    assert.equal((await sketchImportFaults(src.replace("'@descix/frqtl-web/parts'", "'@descix/frqtl-web/objects/Wall.js'"))).length, 1, 'a specifier outside the table must be refused');
    assert.equal((await sketchImportFaults(src.replace('export default function', 'function'))).length, 1, 'a sketch without its default export must be refused');
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

test('the package registry barrel imports in node through the site map, at the pinned version', async (t) => {
    const reg = await import('@descix/frqtl-web/registry');
    const manifest = JSON.parse(read('site/' + SITE_ROOT + 'dist-manifest.json'));   // no manifest row: read from the map's root, as maxi-lab.js does
    assert.equal(manifest.version, PINNED.version, 'the dist-manifest at the map\'s root names ' + manifest.version + ', the pin ' + PINNED.version);
    assert.ok(Array.isArray(reg.WALKTHROUGH) && reg.WALKTHROUGH.length > 0);
    assert.equal(reg.EXHIBITS.length, 9, 'EXHIBITS has ' + reg.EXHIBITS.length + ' rows');
    assert.equal(reg.loadSceneSource, undefined, 'loadSceneSource is gone: projectOf reads a rung as its project folder');
    const p = await reg.projectOf('dse-tunnel-rebuild');
    assert.deepEqual(Object.keys(p.files).sort(), ['frqtl.json', p.manifest.entry].sort(), 'the folder a host boots: its frqtl.json and its entry');
    assert.ok(SKETCH_FORM.test(p.files[p.manifest.entry]), 'projectOf read no sketch module');
    t.diagnostic('node import OK: ' + reg.WALKTHROUGH.length + ' rungs, ' + reg.EXHIBITS.length + ' exhibits, dse-tunnel-rebuild ' + p.files[p.manifest.entry].length + ' chars');
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
    assert.deepEqual(topLevelAwaits(lab), [], 'maxi-lab.js holds its module at a top-level await, so the hands and window.MaxiLab publish after the page\'s load (the body and the look read them right after it): read it inside main(), which `ready` awaits');
    assert.deepEqual(topLevelAwaits(lab.replace('const sdk = { version: null };', 'const sdk = { version: null };\nawait SDK_MANIFEST_PLANT;')), ['await SDK_MANIFEST_PLANT;'], 'negative control: a planted top-level await is seen');
});

/** Statements at column 0 of a module that await (a top-level await holds the module's evaluation). */
function topLevelAwaits(src) {
    return src.split('\n').filter((l) => /^[^\s/*}]/.test(l) && /(^|[=(\s])await\s/.test(l) && !/^(async )?function\b/.test(l));
}

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
    assert.deepEqual(centerOfRect([360, 80, 20, 240]), [370, 200]);
    assert.deepEqual(centerOfRect([360, 80, -80, 21, 240, 160]), [370.5, 200, 0]);
    assert.throws(() => centerOfRect([1, 2, 3]), /spansOf: a rect is \[left, top, w, h\]/);
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
    const sc = { tick: () => 100, win: { MaxiScene: { FrqtlVision: { attach: () => ({ record: (o) => { recorded.push(o); throw new Error('recorder reached'); } }) } } },
        runner: { isRunning: true, cameraControl: {}, declared: [], getObjectByName: () => ({ inParts: true, rect: { left: 0, top: 0, w: 10, h: 10 } }), setSelectHighlight() {}, addTickListener: () => () => {} } };
    withSketch(sc);
    const adapter = buildAdapter(HANDS, fakeLab({ scene: () => sc }));
    await assert.rejects(adapter.see({ stopAt: { ticks: 10 } }), /outside the 5–10 s/);
    await assert.rejects(adapter.see({ stopAt: { ticks: 2000 }, maxFrames: 500 }), /outside the 5–10 s/);
    await assert.rejects(adapter.dragTo({ name: 'w', to: [50, 50], ticks: 20, settle: 5 }), /outside the 5–10 s/);
    await assert.rejects(adapter.dragTo({ name: 'w', to: [50, 50], ticks: 300, settle: 0 }), /`settle` 0 is less than everyTicks 5 — the drag is written into the sketch \(and its row into the Record\) on arrival/);
    await assert.rejects(adapter.dragTo({ name: 'w', to: [50, 50], ticks: 900 }), /outside the 5–10 s/);
    await assert.rejects(adapter.record({ waypoints: [{ atTick: 0, pose: {} }, { atTick: 100, pose: {} }] }), /outside the 5–10 s/);
    assert.equal(recorded.length, 0, 'an out-of-band request must be refused before filming');
});

// ── the integer wire ──────────────────────────────────────────────────────────────────────────

test('2D vs 3D has ONE owner: dragTo asks worldShape (a 3D `to` passes on a world with depth, is refused on a flat one); no other site/ or minimaxi/ module reads the world\'s depth', async () => {
    const mk = (world) => {
        const w = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } };
        const runner = fakeRunner([w], { isRunning: true });
        return withSketch({ tick: () => 0, win: {}, recipeContext: { world }, runner });
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
    const sc = withSketch({ tick: () => 0, win: {}, recipeContext: { world: { w: 600, h: 400 } }, runner });
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

// ── the sketch: every hand ends written into it (exp.toSketch); setDeclared; the inventory's block ─────────

/** The mirror scene on the fake runner with the sketch side (fake-runner.mjs withSketch); `opts` reaches withSketch. */
function sketchLab(opts) {
    const mirror = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, w: 20, h: 240 }, props: { orientationDeg: 45 } };
    const runner = fakeRunner([mirror], { isRunning: true, stop() {}, start() {} });
    const sc = withSketch({ label: '1A · Mirror', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', tick: () => 7, win: {}, recipeContext: { world: { w: 600, h: 400 } }, runner }, opts);
    const lab = fakeLab({ scene: () => sc, inventory: () => inventoryOf(sc) });
    return { sc, lab, runner, mirror, adapter: buildAdapter(HANDS, lab) };
}

test('partsNowOf (a round\'s start) reads the sketch\'s block through the one sketch reader and writes nothing: a read that wrote a row, a sketch with no block and a world with no open Record are refused by name', async () => {
    const ok = sketchLab();
    ok.sc.record = { changes: [] };
    assert.deepEqual(await partsNowOf(ok.sc, 'the start'), { mirror: ['Wall', { orientationDeg: 45, rect: [360, 80, 20, 240] }] });
    assert.deepEqual(ok.sc.sketchCalls.map((c) => c.op), ['toSketch', 'partsOf'], 'read through sketchOf: the write, then the block');
    // a read whose write lands a row: the world held an act its sketch did not say (negative control below: the same read without the row check resolves)
    const wrote = sketchLab();
    wrote.sc.record = { changes: [] };
    const toSketch = wrote.sc.recipeContext.toSketch;
    wrote.sc.recipeContext.toSketch = async (o) => { wrote.sc.record.changes.push({ tick: 7, name: 'mirror', op: 'move', by: o.by, from: { rect: [1, 2, 3, 4] }, to: { rect: [360, 80, 20, 240] } }); return toSketch(o); };
    await assert.rejects(partsNowOf(wrote.sc, 'the start'), /^Error: the start: reading where the world starts wrote 1 row\(s\) into its Record .* — the world held an act its sketch did not say, so the start cannot be told\.$/);
    await assert.rejects(partsNowOf(sketchLab().sc, 'x'), /^Error: x: the world holds no open Record/, 'no open Record: refused by name');
    const noBlock = sketchLab({ noBlock: true }); noBlock.sc.record = { changes: [] };
    await assert.rejects(partsNowOf(noBlock.sc, 'the start'), /^Error: the start: the sketch declares its parts in code, so it has no `parts` block to start from\.$/);
    const src = read('site/app-assets/maxi-hands.js');
    const CHECK = '    if (rec.changes.length !== n) {';
    assert.equal(src.split(CHECK).length, 2, 'the plant target moved');
    const dir = testTmpDir('hands-start');
    try {
        const planted = src.replace(CHECK, '    if (false) {').replace(/from '\.\/([a-z-]+)\.js'/g, (m, f) => "from '" + pathToFileURL(path.join(REPO, 'site/app-assets', f + '.js')).href + "'");
        fs.writeFileSync(path.join(dir, 'maxi-hands.mjs'), planted);
        const m = await import(pathToFileURL(path.join(dir, 'maxi-hands.mjs')).href);
        const again = sketchLab(); again.sc.record = { changes: [] };
        const t2 = again.sc.recipeContext.toSketch;
        again.sc.recipeContext.toSketch = async (o) => { again.sc.record.changes.push({ tick: 7, name: 'mirror', op: 'move', by: o.by, from: null, to: null }); return t2(o); };
        await assert.doesNotReject(m.partsNowOf(again.sc, 'the start'), 'planted away, the read that wrote a row resolves (RED under the check above)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('every hand on a scene ends with exp.toSketch(), and a refusal is the hand\'s error by part and key, never swallowed (negative control: the adapter without the write resolves)', async () => {
    const ok = sketchLab();
    await ok.adapter.moveObject({ name: 'mirror', rect: [300, 80, 20, 240] });
    await ok.adapter.pause({});
    assert.deepEqual(ok.sc.sketchCalls.map((c) => c.op), ['toSketch', 'toSketch'], 'one sketch write at the end of each hand');
    assert.deepEqual((await buildAdapter(HANDS, fakeLab()).say({ text: 'x' }).then(JSON.parse)), { said: 'x' }, 'no scene loaded: nothing to write, the hand still answers');
    const refusal = [{ op: 'set', name: 'mirror', key: 'rect', reason: 'the written text declares [1,2] but the live object is [3,4] — the hand is not in the text.' }];
    const bad = sketchLab({ refused: refusal });
    await assert.rejects(bad.adapter.moveObject({ name: 'mirror', rect: [300, 80, 20, 240] }),
        /^Error: moveObject: the sketch text did not take this hand — "mirror" rect \(set\): the written text declares \[1,2\] but the live object is \[3,4\] — the hand is not in the text\.\. The world changed, but the sketch does not say so\.$/);
    // negative control: the same hand through a planted maxi-hands.js whose adapter skips the write resolves as a success
    const src = read('site/app-assets/maxi-hands.js');
    const WRITE = 'if (sc) { await writeSketch(sc, op, MAXI); }';
    assert.equal(src.split(WRITE).length, 2, 'the plant target moved');
    const dir = testTmpDir('hands-plant');
    try {
        fs.writeFileSync(path.join(dir, 'maxi-hands.js'), src.replace(WRITE, '/* planted: no end-of-hand write */')
            .replace("from './frqtl-web-project.js'", "from '" + pathToFileURL(path.join(REPO, 'site/app-assets/frqtl-web-project.js')).href + "'"));   // the door, where it is
        fs.copyFileSync(path.join(REPO, 'site/app-assets/maxi-ask.js'), path.join(dir, 'maxi-ask.js'));   // maxi-hands.js's own import
        const pm = await import(pathToFileURL(path.join(dir, 'maxi-hands.js')).href);
        const planted = sketchLab({ refused: refusal });
        const out = JSON.parse(await pm.buildAdapter(pm.HANDS, planted.lab).moveObject({ name: 'mirror', rect: [300, 80, 20, 240] }));
        assert.equal(out.moved, 'mirror', 'the planted adapter reports the refused hand as a success — the gate above is RED on it');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('setDeclared: the package\'s exp.setDeclared(name, patch) → {set, from, to, tick, kept}; a rename is the package\'s refusal verbatim; a part outside `parts` is refused by name before anything runs; the grab is let go', async () => {
    const s = sketchLab();
    s.lab.state.grab = { name: 'mirror' };
    const r = JSON.parse(await s.adapter.setDeclared({ name: 'mirror', patch: { orientationDeg: 30 } }));
    assert.deepEqual(r, { set: 'mirror', from: { orientationDeg: 45 }, to: { orientationDeg: 30 }, tick: 0, kept: ['seed'] });
    assert.equal(s.lab.state.grab, null, 'the scene ran again: the old handle is let go');
    assert.deepEqual(s.sc.sketchCalls.map((c) => c.op), ['toSketch', 'setDeclared', 'toSketch'], 'an unwritten hand is written first; the hand ends written');
    await assert.rejects(s.adapter.setDeclared({ name: 'mirror', patch: { name: 'mirror2' } }), /\[RecipeContext\.setDeclared\] "name": the key is the name/);
    await assert.rejects(s.adapter.setDeclared({ name: 'mirror' }), /setDeclared: `patch` \(object\) is required/);
    await assert.rejects(s.adapter.setDeclared({ name: 'mirror', patch: {} }), /setDeclared: `patch` \(object\) is required/);
    const coded = { name: 'source', _schemaKind: 'SphereEmitter', center: [72, 200, 0] };
    Object.defineProperty(coded, 'inParts', { value: false, enumerable: false });
    s.runner.declared.push(coded);
    const asked = s.sc.sketchCalls.filter((c) => c.op === 'setDeclared').length;
    await assert.rejects(s.adapter.setDeclared({ name: 'source', patch: { burstSize: 4 } }), /setDeclared: "source" is declared in the scene's code, not in its `export const parts` block, so the sketch cannot hold a change to it — nothing moved\. Parts a hand can change: \[mirror\]\.$/);
    assert.equal(s.sc.sketchCalls.filter((c) => c.op === 'setDeclared').length, asked, 'refused before the package was asked');
    assert.ok(HANDS.setDeclared.example && HANDS.setDeclared.args.patch.includes('a rename is a new part'), 'the persona states the rename rule');
});

test('the inventory carries the sketch: its `parts` block and the project as written; tick is the Record\'s clock', async () => {
    const s = sketchLab();
    const inv = JSON.parse(await s.adapter.inventory({}));
    assert.deepEqual(inv.parts, { mirror: ['Wall', { orientationDeg: 45, rect: [360, 80, 20, 240] }] });
    assert.deepEqual(Object.keys(inv.project), ['entry', 'files']);
    assert.equal(inv.project.entry, 'sketch.js');
    assert.equal(typeof inv.project.files['sketch.js'], 'string');
    assert.deepEqual(Object.keys(SKETCH_KEYS).map((k) => SKETCH_KEYS[k]).filter((k) => !(k in inv)), [], 'the inventory carries every SKETCH_KEYS key');
    const none = sketchLab({ noBlock: true });
    assert.equal(JSON.parse(await none.adapter.inventory({})).parts, null, 'a sketch with no parts block says so (null), never an invented block');
});

/** The tree's text, through a reader a plant can replace. */
const treeRead = (rel) => read(rel);

/**
 * The dist root is read through the package's HOST table (FRQTL_WEB_HOST_SPECIFIERS, 0.6.0-p4.1 P2): maxi-lab.js resolves a host
 * row of the page's own map, and the import-map generator counts the host rows from the table, never as the map's rows
 * minus the sketch rows. → [] or every fault by name.
 */
export function hostTableFaults(readFn) {
    const bad = [];
    const lab = readFn('site/app-assets/maxi-lab.js');
    const root = lab.slice(lab.indexOf('function frqtlWebRoot()'), lab.indexOf('\n}\n', lab.indexOf('function frqtlWebRoot()')));
    if (!/const row = FRQTL_WEB_HOST_SPECIFIERS\[0\];/.test(root)) { bad.push('maxi-lab.js frqtlWebRoot does not read its row from FRQTL_WEB_HOST_SPECIFIERS'); }
    if (/\bFRQTL_WEB_SPECIFIERS\b/.test(lab)) { bad.push('maxi-lab.js names the sketch table FRQTL_WEB_SPECIFIERS (the dist root is a host row\'s)'); }
    const gen = readFn('scripts/gen-import-maps.mjs');
    if (!/const HOST_COUNT = FRQTL_WEB_HOST_SPECIFIERS\.length;/.test(gen)) { bad.push('gen-import-maps.mjs counts the host rows some other way than FRQTL_WEB_HOST_SPECIFIERS.length'); }
    return bad;
}

test('the dist root and the host rows are the package\'s host table (FRQTL_WEB_HOST_SPECIFIERS) (negative controls: the sketch table planted back, a derived host count, are red)', async () => {
    const project = await import(distUrl(exportFile('./project')));
    assert.ok(Array.isArray(project.FRQTL_WEB_HOST_SPECIFIERS) && project.FRQTL_WEB_HOST_SPECIFIERS.length > 0, PINNED.name + '@' + PINNED.version + ' ./project exports the host table');
    assert.deepEqual(hostTableFaults(treeRead), []);
    const plant = (file, from, to) => (rel) => { const t = read(rel); if (rel !== file) { return t; } assert.ok(t.includes(from), 'the plant target moved: ' + from); return t.replace(from, to); };
    assert.deepEqual(hostTableFaults(plant('site/app-assets/maxi-lab.js', 'const row = FRQTL_WEB_HOST_SPECIFIERS[0];', 'const row = FRQTL_WEB_SPECIFIERS[0];')),
        ['maxi-lab.js frqtlWebRoot does not read its row from FRQTL_WEB_HOST_SPECIFIERS', 'maxi-lab.js names the sketch table FRQTL_WEB_SPECIFIERS (the dist root is a host row\'s)']);
    assert.deepEqual(hostTableFaults(plant('scripts/gen-import-maps.mjs', 'const HOST_COUNT = FRQTL_WEB_HOST_SPECIFIERS.length;', 'const HOST_COUNT = Object.keys(siteImportMap().imports).length - SPECIFIER_COUNT;')),
        ['gen-import-maps.mjs counts the host rows some other way than FRQTL_WEB_HOST_SPECIFIERS.length']);
});

/** What the vendored linkProject returns for a one-file sketch, linked in node with a data: mint (keys only). */
async function linkResultKeys() {
    const project = await import(distUrl(exportFile('./project')));
    const mint = (text) => ({ url: 'data:text/javascript,' + encodeURIComponent(text), release() {} });
    const r = await project.linkProject({ files: { 'sketch.js': 'export const parts = {};\nexport default function buildExperiment(exp) {}\n' }, entry: 'sketch.js', mint });
    return Object.keys(r);
}

/** maxi-scene.js partsOf reads `parts` off the link result's module (P2): no import of its own of a minted URL. → [] or faults. */
export function partsOfFaults(scene) {
    const body = scene.slice(scene.indexOf('async function partsOf('), scene.indexOf('\n}\n', scene.indexOf('async function partsOf(')));
    const bad = [];
    if (!/linked\.module\.parts/.test(body)) { bad.push('partsOf does not read `parts` off the link result\'s module'); }
    if (/import\(/.test(body)) { bad.push('partsOf imports a module of its own'); }
    return bad;
}

test('the parts block is read off the link result\'s module (linkProject returns `module`) (negative control: an import of the minted entry planted back is red)', async () => {
    assert.ok((await linkResultKeys()).includes('module'), PINNED.name + '@' + PINNED.version + ' linkProject returns `module`');
    const scene = read('site/app-assets/maxi-scene.js');
    assert.deepEqual(partsOfFaults(scene), []);
    const FROM = '        if (linked.module.parts === undefined) { return null; }\n        const block = linked.module.parts;';
    assert.ok(scene.includes(FROM), 'the plant target moved');
    assert.deepEqual(partsOfFaults(scene.replace(FROM, '        const ns = await import(linked.urls[project.entry]);\n        if (ns.parts === undefined) { return null; }\n        const block = ns.parts;')),
        ['partsOf does not read `parts` off the link result\'s module', 'partsOf imports a module of its own']);
});

/**
 * THE P4 SWAP, landed: what the package's Record door (./project RECORD_FILES, recordFolderFaults, CLIP_SECONDS; the Record of
 * exp.startRecord) took over is GONE from the tree (`gone`: text that must not be in `file`) and read from the package where
 * it is used (`uses`: text that must be in `at`); what stays the lab's is still here (`stays`).
 */
const P4_DOOR = Object.freeze(['RECORD_FILES', 'RECORD_KEYS', 'CHANGE_KEYS', 'OPS', 'BY', 'CLIP_NAME', 'clipName', 'CLIP_SECONDS', 'jsonText', 'recordFolderFaults', 'MANIFEST_FILE', 'parseManifest']);
const RF = 'site/app-assets/maxi-record-folder.js';
const P4_SWAP = Object.freeze({
    moved: Object.freeze([
        { item: 'serializeFolder (the §6 files come from rec.stop())', file: RF, gone: 'export function serializeFolder(', at: 'site/app-assets/maxi-lab.js', uses: 'out = await rec.stop();' },
        { item: 'tickRangeOf (the package computes it)', file: RF, gone: 'export function tickRangeOf(' },
        { item: 'the §6 half of recordFolderFaults: the gate is theirs ∪ ours', file: RF, gone: 'record.json carries exactly {', at: RF, uses: 'return packageFolderFaults(files).concat(hostFolderFaults(files));' },
        { item: 'changeOf (the rows are the package writer\'s)', file: RF, gone: 'export function changeOf(' },
        { item: 'foldActs (one row per act is the package\'s)', file: RF, gone: 'export function foldActs(' },
        { item: 'collectWrites (a hand\'s rows are rec.changes.slice(n))', file: RF, gone: 'export async function collectWrites(', at: 'site/app-assets/maxi-lab.js', uses: 'const rows = (rec ? rec.changes.slice(n) : [])' },
        { item: 'the write log (onWrite / announce / acts)', file: 'site/app-assets/maxi-hands.js', gone: 'export function onWrite(' },
        { item: 'the node writeRecordFolder (the package\'s @descix/frqtl-node/eyes writer)', file: 'minimaxi/record-folder.mjs', gone: 'export function writeRecordFolder(', at: 'minimaxi/record-folder.mjs', uses: "('@descix/frqtl-node/eyes')" },
        { item: 'maxi-hands.js CLIP_SECONDS (the package\'s)', file: 'site/app-assets/maxi-hands.js', gone: 'export const CLIP_SECONDS', at: 'site/app-assets/maxi-hands.js', uses: "import { CLIP_SECONDS, BY } from './frqtl-web-project.js';" },
        { item: '§6 FILES minus lab (RECORD_FILES)', file: RF, gone: "record: 'record.json', lab: 'lab.json'", at: RF, uses: "export const FILES = Object.freeze(Object.assign({}, RECORD_FILES, { lab: 'lab.json' }));" },
        { item: '§6 RECORD_KEYS', file: RF, gone: 'export const RECORD_KEYS =' },
        { item: '§6 CHANGE_KEYS', file: RF, gone: 'export const CHANGE_KEYS =' },
        { item: '§6 OPS', file: RF, gone: 'export const OPS =' },
        { item: '§6 BY', file: RF, gone: 'export const BY =' },
        { item: '§6 CLIP_NAME', file: RF, gone: 'export const CLIP_NAME =' },
        { item: '§6 clipName', file: RF, gone: 'export function clipName(' },
        { item: 'the world clock (the open Record\'s tick is THE clock)', file: 'site/app-assets/maxi-scene.js', gone: 'function clockAt(', at: 'site/app-assets/maxi-lab.js', uses: "tick: function () { return recordOf(sc, 'the tick').tick; }" },
        { item: 'the close on restart (one Record spans a restart)', file: 'site/app-assets/maxi-lab.js', gone: 'a restart boots a new world at tick 0: its Record closes too' },
        { item: 'lab.json project.entry (project/frqtl.json names the entry)', file: RF, gone: 'project: { entry: pr.entry },', at: RF, uses: 'return { entry: parseManifest(textOf(files[at])).entry };' },
        { item: 'loadSceneSource (the registry\'s projectOf reads a rung as its project folder)', file: 'site/app-assets/maxi-lab.js', gone: 'loadSceneSource', at: 'site/app-assets/maxi-lab.js', uses: 'await projectOf(row, { mode: modeId })' },
        { item: 'the node body\'s loadSceneSource', file: 'minimaxi/body.mjs', gone: 'loadSceneSource', at: 'minimaxi/body.mjs', uses: 'await projectOf(row, { mode: mode })' }
    ]),
    stays: Object.freeze([
        { item: 'recordChain', file: RF, mark: 'export function recordChain(' },
        { item: 'recordChainFaults', file: RF, mark: 'export function recordChainFaults(' },
        { item: 'recordDirName', file: RF, mark: 'export function recordDirName(' },
        { item: 'RECORD_DIR', file: RF, mark: 'export const RECORD_DIR =' },
        { item: 'assembleLoopRecords (the host half)', file: RF, mark: 'export function assembleLoopRecords(' },
        { item: 'the lab\'s half of the gate (lab.json, the entry text, placeholders outside §6, MAX_SEGMENTS, STILLS)', file: RF, mark: 'export function hostFolderFaults(' },
        { item: 'LOOP_LAB_KEYS', file: RF, mark: 'export const LOOP_LAB_KEYS =' },
        { item: 'PLAN_KEY', file: RF, mark: "export const PLAN_KEY = 'plan';" },
        { item: 'SKETCH_FORM', file: RF, mark: 'export const SKETCH_FORM =' },
        { item: 'entryTextFaults', file: RF, mark: 'export function entryTextFaults(' },
        { item: 'MAX_SEGMENTS', file: RF, mark: 'export const MAX_SEGMENTS' },
        { item: 'STILLS', file: RF, mark: 'export const STILLS' },
        { item: 'UNHELD_KEY', file: RF, mark: 'export const UNHELD_KEY' },
        { item: 'TEACHING_KEY', file: RF, mark: 'export const TEACHING_KEY' },
        { item: 'recordPlanFaults', file: RF, mark: 'export function recordPlanFaults(' },
        { item: 'completenessWords', file: RF, mark: 'export function completenessWords(' },
        { item: 'bytesOfBase64', file: RF, mark: 'export function bytesOfBase64(' }
    ])
});

/** [] when the swap holds in the tree read by `readFn`, else every row that does not, by name. */
export function p4SwapFaults(readFn) {
    const bad = [];
    P4_SWAP.moved.forEach((r) => {
        if (readFn(r.file).includes(r.gone)) { bad.push(r.file + ' still holds ' + JSON.stringify(r.gone) + ': ' + r.item); }
        if (r.at && !readFn(r.at).includes(r.uses)) { bad.push(r.at + ' no longer reads ' + JSON.stringify(r.uses) + ': ' + r.item); }
    });
    P4_SWAP.stays.forEach((r) => { if (!readFn(r.file).includes(r.mark)) { bad.push(r.file + ' lost ' + r.item); } });
    return bad;
}

test('the P4 swap: the Record\'s §6 half is the package\'s and the lab\'s half stays (negative controls: a deleted path planted back, the union gate cut to ours, a stay removed — each red by name)', async () => {
    const project = await import(distUrl(exportFile('./project')));
    assert.deepEqual(P4_DOOR.filter((k) => project[k] === undefined), [], PINNED.name + '@' + PINNED.version + ' ./project exports the Record door');
    const door = await import('../../site/app-assets/frqtl-web-project.js');
    assert.deepEqual(P4_DOOR.filter((k) => door[k] !== project[k]), [], 'the site\'s ./project door hands on the package\'s own bindings');
    assert.deepEqual(p4SwapFaults(treeRead), []);
    const plant = (file, from, to) => (rel) => { const t = read(rel); if (rel !== file) { return t; } assert.ok(t.includes(from), 'the plant target moved: ' + from); return t.replace(from, to); };
    assert.deepEqual(p4SwapFaults(plant(RF, 'export function recordDirName(', 'export function serializeFolder(p) {}\nexport function recordDirName(')),
        [RF + ' still holds "export function serializeFolder(": serializeFolder (the §6 files come from rec.stop())']);
    assert.deepEqual(p4SwapFaults(plant(RF, 'return packageFolderFaults(files).concat(hostFolderFaults(files));', 'return hostFolderFaults(files);')),
        [RF + ' no longer reads "return packageFolderFaults(files).concat(hostFolderFaults(files));": the §6 half of recordFolderFaults: the gate is theirs ∪ ours']);
    assert.deepEqual(p4SwapFaults(plant(RF, 'export const MAX_SEGMENTS', 'const MAX_SEGMENTS')), [RF + ' lost MAX_SEGMENTS']);
});

/** A scene whose recorder drives the runner's tick listeners while it films (the drag rides them), noting when each sketch write lands. */
function draggingLab() {
    const mirror = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, w: 20, h: 240 } };
    const listeners = [];
    const runner = fakeRunner([mirror], { isRunning: true, addTickListener: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i !== -1) { listeners.splice(i, 1); } }; } });
    const writesDuringClip = { n: null };
    const sc = withSketch({ label: 'm', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', runner, recipeContext: { world: { w: 600, h: 400 } }, tick: () => 0, win: { MaxiScene: { FrqtlVision: { attach: () => ({
        record: async (o) => {
            const frames = [];
            for (let t = 1; t <= o.stopAt.ticks; t++) { listeners.slice().forEach((fn) => fn()); if ((t - 1) % o.everyTicks === 0) { frames.push({ tick: t }); } }
            await new Promise((r) => setTimeout(r, 0));   // the act's write (async) settles while the clip is still being finished
            writesDuringClip.n = sc.sketchCalls.filter((c) => c.op === 'toSketch').length;
            return { track: { frames }, encoded: { mime: 'video/mp4', codec: 'avc1', muxer: 'm', bytes: 'AAAA' }, truncated: false };
        } }) } } } });
    const lab = fakeLab({ scene: () => sc, current: () => sc, ask: async () => ({ asked: false, interaction_id: null, answer_excerpt: null }) });
    return { sc, lab, writesDuringClip };
}

test('dragTo writes the drag into the sketch ON ARRIVAL, while its clip still films, so the Record\'s row lies inside the footage (negative control: the arrival write planted away writes only after the clip)', async () => {
    const d = draggingLab();
    const out = JSON.parse(await buildAdapter(HANDS, d.lab).dragTo({ name: 'mirror', to: [300, 200], ticks: 150, settle: 150 }));
    assert.equal(out.dragged, 'mirror');
    assert.equal(d.writesDuringClip.n, 1, 'one sketch write (Maxi\'s act) landed before the clip was finished');
    assert.deepEqual(d.sc.sketchCalls.filter((c) => c.op === 'toSketch').map((c) => c.by), ['maxi', 'maxi'], 'the arrival write, then the adapter\'s end-of-hand write (a no-op in the package: nothing new)');
    const src = read('site/app-assets/maxi-hands.js');
    const ARRIVE = "                else if (n >= ticks && !arrived) { arrived = writeSketch(sc, 'dragTo', MAXI); arrived.catch(function () {}); }\n";
    assert.equal(src.split(ARRIVE).length, 2, 'the plant target moved');
    const dir = testTmpDir('hands-drag-plant');
    try {
        fs.writeFileSync(path.join(dir, 'maxi-hands.js'), src.replace(ARRIVE, '').replace("if (!arrived) { throw new Error('dragTo: the clip ended before", "if (false) { throw new Error('dragTo: the clip ended before").replace('await arrived;   //', '//')
            .replace("from './frqtl-web-project.js'", "from '" + pathToFileURL(path.join(REPO, 'site/app-assets/frqtl-web-project.js')).href + "'"));
        fs.copyFileSync(path.join(REPO, 'site/app-assets/maxi-ask.js'), path.join(dir, 'maxi-ask.js'));
        const pm = await import(pathToFileURL(path.join(dir, 'maxi-hands.js')).href);
        const p = draggingLab();
        await pm.buildAdapter(pm.HANDS, p.lab).dragTo({ name: 'mirror', to: [300, 200], ticks: 150, settle: 150 });
        assert.equal(p.writesDuringClip.n, 0, 'the planted hand writes only after the clip — its row would lie after the footage: the gate above is RED on it');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** The bindings a lab module hands on from the package must BE the package's (identity), never a local copy under the same name. */
const P4_REEXPORTS = Object.freeze({ 'site/app-assets/maxi-record-folder.js': ['RECORD_KEYS', 'CHANGE_KEYS', 'OPS', 'BY', 'CLIP_NAME', 'clipName'], 'site/app-assets/maxi-hands.js': ['CLIP_SECONDS'] });
export function reexportFaults(mods, project) {
    const bad = [];
    Object.keys(P4_REEXPORTS).forEach((f) => P4_REEXPORTS[f].forEach((k) => { if (mods[f][k] !== project[k]) { bad.push(f + ' ' + k + ' is not the package\'s own binding'); } }));
    return bad;
}
/** Load a planted copy of a site module from a temp dir, its relative imports pinned to this checkout. */
async function plantedSite(rel, src) {
    const dir = testTmpDir('site-plant');
    fs.writeFileSync(path.join(dir, path.basename(rel)), src.replace(/from '\.\/([\w-]+\.js)'/g, (m, f) => "from '" + pathToFileURL(path.join(REPO, 'site/app-assets', f)).href + "'"));
    try { return await import(pathToFileURL(path.join(dir, path.basename(rel))).href); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('every binding the lab hands on from the package IS the package\'s (negative controls: a local OPS, a reordered BY, a local CLIP_SECONDS — each red)', async () => {
    const project = await import(distUrl(exportFile('./project')));
    const mods = {};
    for (const f of Object.keys(P4_REEXPORTS)) { mods[f] = await import(pathToFileURL(path.join(REPO, f)).href); }
    assert.deepEqual(reexportFaults(mods, project), []);
    const rf = read('site/app-assets/maxi-record-folder.js');
    const RE = 'export { RECORD_KEYS, CHANGE_KEYS, OPS, BY, CLIP_NAME, clipName };';
    assert.equal(rf.split(RE).length, 2, 'the plant target moved');
    for (const [label, planted, want] of [
        ['a local OPS', rf.replace(RE, "export { RECORD_KEYS, CHANGE_KEYS, BY, CLIP_NAME, clipName };\nconst OPS_LOCAL = Object.freeze(['move', 'setDeclared', 'add', 'remove', 'fork']);\nexport { OPS_LOCAL as OPS };"), 'OPS'],
        ['a reordered BY', rf.replace(RE, "export { RECORD_KEYS, CHANGE_KEYS, OPS, CLIP_NAME, clipName };\nconst BY_LOCAL = Object.freeze(['maxi', 'human']);\nexport { BY_LOCAL as BY };"), 'BY']]) {
        const pm = await plantedSite('site/app-assets/maxi-record-folder.js', planted);
        assert.deepEqual(reexportFaults(Object.assign({}, mods, { 'site/app-assets/maxi-record-folder.js': pm }), project), ['site/app-assets/maxi-record-folder.js ' + want + ' is not the package\'s own binding'], label + ' is RED');
    }
    const hs = read('site/app-assets/maxi-hands.js');
    const CS = 'export { CLIP_SECONDS };';
    assert.equal(hs.split(CS).length, 2, 'the plant target moved');
    const ph = await plantedSite('site/app-assets/maxi-hands.js', hs.replace(CS, 'export const CLIP_SECONDS_LOCAL = Object.freeze({ min: 5, max: 10 }); export { CLIP_SECONDS_LOCAL as CLIP_SECONDS };'));
    assert.deepEqual(reexportFaults(Object.assign({}, mods, { 'site/app-assets/maxi-hands.js': ph }), project), ['site/app-assets/maxi-hands.js CLIP_SECONDS is not the package\'s own binding'], 'a local CLIP_SECONDS is RED');
});

test('the loop\'s page body refuses a lab with no actRows by name: a hand\'s rows are the world\'s Record\'s (negative control: the guard planted away is red)', async () => {
    const { labBody } = await import('../../site/app-assets/maxi-loop.js');
    assert.throws(() => labBody({ hands: HANDS, lab: {} }), /labBody's lab publishes no actRows\(act\) — a hand's rows are read off the world's Record/);
    const src = read('site/app-assets/maxi-loop.js');
    const GUARD = "    if (typeof spec.lab.actRows !== 'function') { throw new Error('[loop] labBody\\'s lab publishes no actRows(act) — a hand\\'s rows are read off the world\\'s Record (maxi-lab.js).'); }\n";
    assert.equal(src.split(GUARD).length, 2, 'the plant target moved');
    const pm = await plantedSite('site/app-assets/maxi-loop.js', src.replace(GUARD, ''));
    assert.doesNotThrow(() => pm.labBody({ hands: HANDS, lab: {} }), 'the planted body takes a lab with no actRows — the gate above is RED on it');
});
