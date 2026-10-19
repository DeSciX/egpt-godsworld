/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-inventory.test.mjs — the page's window.MaxiLab.inventory() IS the inventory hand.
 *
 * The loop reads THE STAGE through the inventory hand (maxi-hands.js HANDS.inventory: inventoryOf plus the sketch's
 * SKETCH_KEYS, parts and project), and maxi-roles.js stageOf refuses an inventory without `parts`. The page's own door,
 * window.MaxiLab.inventory, is what the LOOKs and the node body read; a second, half inventory under the same name
 * (inventoryOf alone) is a mirror of the hand, and handed to stageOf it stops the LOOK (maxi-loop-look part E, the 3D
 * mirror). The test runs the `inventory` member of the page's own window.MaxiLab literal (read from maxi-lab.js, never
 * re-typed) over a booted 3D mirror on the shared fake runner, the way the loop boots it (loadScene swaps the world in;
 * the inventory is read after), and over a 2D one; its negative control is the same literal with the member planted
 * back to the page's half `inventory` function.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as roles from '../../site/app-assets/maxi-roles.js';
import { HANDS, inventoryOf, SKETCH_KEYS } from '../../site/app-assets/maxi-hands.js';
import { fakeRunner, sdkCameraControl, withSketch } from './fake-runner.mjs';

const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'app-assets', 'maxi-lab.js');
const LAB_SRC = fs.readFileSync(LAB, 'utf8');

/** The expression of the `inventory` member of the page's window.MaxiLab = Object.freeze({ … }) literal. */
function maxiLabInventoryExpr(src) {
    const at = src.indexOf('\nwindow.MaxiLab = Object.freeze({');
    assert.ok(at !== -1, 'maxi-lab.js publishes no window.MaxiLab = Object.freeze({ … })');
    const block = src.slice(at, src.indexOf('\n});\n', at));
    const m = block.match(/(?:^|[\s,])inventory:\s*([^\n]*?)(?:,\s*$|,\s+[a-zA-Z]+:)/m);
    assert.ok(m, 'window.MaxiLab publishes no `inventory` member');
    return m[1].trim();
}

/** The page's module-level function `name` (to its first closing brace at column 0). */
function fnSource(src, name) {
    const at = src.indexOf('\nfunction ' + name + '(');
    assert.ok(at !== -1, 'maxi-lab.js has no function ' + name + '()');
    return src.slice(at + 1, src.indexOf('\n}\n', at) + 2);
}

/** window.MaxiLab.inventory from `src`, bound to the real HANDS and a lab over `sc`. */
function pageInventory(src, lab) {
    const deps = { HANDS, inventoryOf, lab, requireScene: () => lab.scene() };
    const body = fnSource(src, 'inventory') + '\nreturn (' + maxiLabInventoryExpr(src) + ');';
    return new Function(...Object.keys(deps), body)(...Object.values(deps));
}

/** A lab whose loadScene boots the 3D mirror (600 x 400 x 600, the slab z −80..+80) over a 2D double slit, as page-loop's does. */
function bootingLab() {
    function sceneOf(spec) {
        const runner = fakeRunner(spec.objects, { isRunning: true, cameraControl: spec.camera ? sdkCameraControl(spec.camera, spec.world.w, spec.world.h) : null });
        return withSketch({ label: spec.label, id: spec.id, mode: spec.mode, modes: spec.modes, renderer: spec.renderer, runner, recipeContext: { world: spec.world }, tick: () => 10, win: { MaxiScene: {} } });
    }
    const TUNNEL = { label: 'Double Slit (Tunnel, symmetric)', id: 'dse-tunnel-rebuild', mode: '2d', modes: ['3d', '2d'], renderer: 'p5', world: { w: 600, h: 400 },
        objects: [{ name: 'screen', _schemaKind: 'GraphingDetectorWall', rect: { left: 315, top: 0, w: 20, h: 400 } }] };
    const MIRROR_3D = { label: '1A · Mirror (3D)', id: 'cl1a-mirror-3d', mode: null, modes: [], renderer: 'three', world: { w: 600, h: 400, d: 600 }, camera: { azimuth: 45, elevation: 45, distance: 900 },
        objects: [{ name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } }] };
    let sc = sceneOf(TUNNEL);
    const lab = {
        state: { grab: null },
        scene: () => sc,
        current: () => sc,
        loadScene: async (a) => { if (a.id !== 'cl1a-mirror-3d') { throw new Error('the fake lab boots only cl1a-mirror-3d'); } sc = sceneOf(MIRROR_3D); return { id: sc.id }; },
        inventory: () => inventoryOf(sc)
    };
    return lab;
}

test('window.MaxiLab.inventory() is the inventory hand: a booted 3D world (and a 2D one) carries the sketch\'s parts and project, and stageOf takes it (negative control: the half inventory lacks parts)', async () => {
    const lab = bootingLab();
    const inv2 = await pageInventory(LAB_SRC, lab)();
    assert.ok(Object.prototype.hasOwnProperty.call(inv2, SKETCH_KEYS.parts) && inv2.dimensions === 2, '2D: the page\'s inventory carries parts');
    assert.equal(roles.stageOf(inv2).id, 'dse-tunnel-rebuild');

    await HANDS.loadScene.run(lab, { id: 'cl1a-mirror-3d' });   // the Builder's first hand: the loop boots the plan's 3D scene
    const inv3 = await pageInventory(LAB_SRC, lab)();
    const hand = await HANDS.inventory.run(lab);
    assert.equal(inv3.dimensions, 3);
    assert.deepEqual(inv3[SKETCH_KEYS.parts], hand[SKETCH_KEYS.parts], '3D: the page\'s inventory carries the sketch\'s parts block, as the hand does');
    assert.deepEqual(Object.keys(inv3[SKETCH_KEYS.parts]), ['mirror']);
    assert.deepEqual(inv3[SKETCH_KEYS.project], hand[SKETCH_KEYS.project], '3D: and its project');
    assert.match(roles.stageWords(roles.stageOf(inv3)), /scene id cl1a-mirror-3d, no registry modes declared .*3D \(x, y, z\): a world 600 x 400 x 600 with depth/);

    // negative control: the member planted back to the page's half inventory (inventoryOf alone) — stageOf refuses it by name
    const planted = LAB_SRC.replace('\n    inventory: ' + maxiLabInventoryExpr(LAB_SRC) + ',', '\n    inventory: inventory,');
    assert.notEqual(planted, LAB_SRC, 'the plant took');
    const half = await pageInventory(planted, lab)();
    assert.ok(!Object.prototype.hasOwnProperty.call(half, SKETCH_KEYS.parts), 'the planted member is the half inventory');
    assert.throws(() => roles.stageOf(half), /lacks parts \(maxi-hands\.js INVENTORY_KEYS and SKETCH_KEYS\.parts\)/);
});
