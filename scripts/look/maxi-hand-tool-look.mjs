#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-hand-tool-look.mjs — LOOK at the human's hand: 2D hover/drag on cl1a-mirror (the inventory
 * moves by the dragged amount in WORLD px, expected from the renderer's own screenToWorld), then 3D
 * on cl1a-mirror-3d (reticle, SPACE grab, a camera move carries the wall, SPACE drop).
 *
 *   node scripts/look/maxi-hand-tool-look.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <node_modules> --out .scratch/look-hand
 *
 * Same discipline as maxi-lab-look-r2.mjs: shell bus stubbed in the top window, the browser closed
 * by its handle, the orphan gate counting only chrome-headless-shell processes descended from THIS process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/look-hand'));
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(PW_DIR, 'noop.js'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-hand] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-hand-log.json'), JSON.stringify(log, null, 2));
}
function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: +p[0], ppid: +p[1], comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]); let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    return rows.filter((r) => /chrome-headless-shell/.test(r.comm) && mine.has(r.pid)).map((r) => r.pid);
}

const STUB = () => {
    if (window.top !== window) { return; }
    window.__media = [];
    window.DeSciX = {
        bridge: { version: 'look-stub', ready: true, EVENT: 'descix:bridge-ready', members: () => ['call', 'view'] },
        ready: async () => ({ mode: 'shell', members: ['call', 'view'], version: 'look-stub' }),
        call: async (command, params) => {
            // The shell's command door, stubbed: every footage item lands in __media with the question as its note.
            window.__asks = window.__asks || [];
            window.__asks.push({ command: command, params: params });
            (params.media || []).forEach((m) => window.__media.push({ mime_type: m.mime_type, label: m.label, note: params.user_input, base64Length: m.data ? m.data.length : 0, data: m.data }));
            return { status: 'OK', message: { status: 'OK', response: 'look-stub answer ' + window.__asks.length, interaction_id: 'look-stub-' + window.__asks.length, usage: { media_tokens: 0 } } };
        },
        view: { available: () => false, set: (m) => m }
    };
};

async function hand(page, op, args) {
    return page.evaluate(async ({ op, args }) => {
        try { return { ok: true, result: JSON.parse(await window.DeSciX_Actions[op](args)) }; }
        catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    }, { op, args });
}
async function inv(page) { const r = await hand(page, 'inventory', {}); if (!r.ok) { throw new Error('inventory: ' + r.error); } return r.result; }
function objOf(inventory, name) { const o = inventory.objects.find((r) => r.name === name); if (!o) { throw new Error('no "' + name + '" in inventory ' + JSON.stringify(inventory.objects)); } return o; }
async function ui(page) {
    return page.evaluate(() => ({
        pressed: document.getElementById('btn-hand').getAttribute('aria-pressed'),
        status: document.getElementById('status').textContent,
        error: document.getElementById('error').hidden ? null : document.getElementById('error').textContent,
        hand: window.MaxiLab.hand() && window.MaxiLab.hand().state(),
        outline: (function () {
            const f = document.getElementById('scene-frame');
            const o = f && f.contentDocument.querySelector('[data-role="hand-outline"]');
            return o ? { display: o.style.display, left: o.style.left, top: o.style.top, width: o.style.width, height: o.style.height } : null;
        })(),
        cursor: (function () { const f = document.getElementById('scene-frame'); return f && f.contentWindow.MaxiScene.mount().style.cursor; })()
    }));
}
/** Page coordinates of a world point, through the runner's own world→screen (screenPointOf). */
async function pageXY(page, world) {
    return page.evaluate((world) => {
        const f = document.getElementById('scene-frame');
        const fr = f.getBoundingClientRect();
        const ms = f.contentWindow.MaxiScene;
        const cr = ms.canvas().getBoundingClientRect();
        const sp = ms.runner.screenPointOf(world, cr.width, cr.height);
        if (!sp) { throw new Error('screenPointOf(' + JSON.stringify(world) + ') is null'); }
        return { x: fr.left + cr.left + sp[0], y: fr.top + cr.top + sp[1], css: sp, canvas: { w: cr.width, h: cr.height, left: cr.left, top: cr.top }, frame: { left: fr.left, top: fr.top } };
    }, world);
}
/** The expected world shift for a CSS shift, from the renderer's own screenToWorld (never CSS px = world px). */
async function expectedWorldDx(page, cssFrom, cssDx) {
    return page.evaluate(({ cssFrom, cssDx }) => {
        const f = document.getElementById('scene-frame');
        const ms = f.contentWindow.MaxiScene;
        const cr = ms.canvas().getBoundingClientRect();
        const r = ms.runner.renderer;
        const a = r.screenToWorld(cssFrom[0], cssFrom[1], cr.width, cr.height);
        const b = r.screenToWorld(cssFrom[0] + cssDx, cssFrom[1], cr.width, cr.height);
        return { from: a, to: b, dx: b.x - a.x, dy: b.y - a.y, cssW: cr.width, cssH: cr.height, pose: ms.runner.cameraControl && ms.runner.cameraControl.getOrbit() };
    }, { cssFrom, cssDx });
}

note('orphan gate before launch', { own: ownBrowserPids() });
const browser = await chromium.launch({ headless: true });
note('browser launched', { own: ownBrowserPids() });
let failed = null;
try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(STUB);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(URL_, { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);

    // ── 2D: cl1a-mirror ──
    const ld = await hand(page, 'loadScene', { id: 'cl1a-mirror' });
    if (!ld.ok) { throw new Error('loadScene cl1a-mirror: ' + ld.error); }
    await page.waitForTimeout(1500);
    note('2D opening ui (hand off)', await ui(page));
    await page.click('#btn-hand');
    const on = await ui(page);
    note('hand ON via toolbar', on);
    if (on.pressed !== 'true' || !on.hand.on || on.hand.mode !== '2d') { throw new Error('hand did not enter 2D mode: ' + JSON.stringify(on)); }

    const before = await inv(page);
    const mirror0 = objOf(before, 'mirror');
    const c0 = mirror0.center.slice(0, 2);
    const at = await pageXY(page, c0);
    note('mirror before', { rect: mirror0.rect, centerWorld: c0, pointer: at });
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(400);
    const hov = await ui(page);
    await page.screenshot({ path: path.join(OUT, '01-2d-hover-outline.png') });
    note('hover over mirror', hov);
    if (hov.hand.hover !== 'mirror' || !hov.outline || hov.outline.display !== 'block') { throw new Error('hover did not outline the mirror: ' + JSON.stringify(hov)); }

    const CSS_DX = -100;
    const expect = await expectedWorldDx(page, at.css, CSS_DX);
    note('expected world shift for ' + CSS_DX + ' css px (renderer.screenToWorld)', expect);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(at.x + CSS_DX * i / 10, at.y); await page.waitForTimeout(40); if (i === 5) {
        const mid = await ui(page); const midInv = await inv(page);
        await page.screenshot({ path: path.join(OUT, '02-2d-mid-drag.png') });
        note('mid-drag', { ui: mid, mirror: objOf(midInv, 'mirror').rect });
        if (mid.hand.held !== 'mirror') { throw new Error('mid-drag: nothing held: ' + JSON.stringify(mid)); }
    } }
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await inv(page);
    const mirror1 = objOf(after, 'mirror');
    const movedBy = [mirror1.rect[0] - mirror0.rect[0], mirror1.rect[1] - mirror0.rect[1]];
    const released = await ui(page);
    await page.screenshot({ path: path.join(OUT, '03-2d-after-drop.png') });
    note('after drop', { rectBefore: mirror0.rect, rectAfter: mirror1.rect, movedByWorldPx: movedBy, expectedDx: expect.dx, ui: released });
    if (Math.abs(movedBy[0] - expect.dx) > 1 || Math.abs(movedBy[1] - expect.dy) > 1) { throw new Error('moved by ' + movedBy + ' world px, expected ' + [expect.dx, expect.dy]); }
    if (mirror1.rect[2] !== mirror0.rect[2] || mirror1.rect[3] !== mirror0.rect[3]) { throw new Error('size changed'); }
    if (released.hand.held) { throw new Error('still held after mouseup'); }

    // Zoomed 2D camera (distance 200 = half the world height visible): CSS px are NOT world px here.
    await page.evaluate(() => document.getElementById('scene-frame').contentWindow.MaxiScene.runner.cameraControl.setOrbit({ distance: 200 }));
    await page.waitForTimeout(300);
    const z0 = objOf(await inv(page), 'mirror');
    const zc = z0.center.slice(0, 2);
    const zat = await pageXY(page, zc);
    const zexp = await expectedWorldDx(page, zat.css, CSS_DX);
    note('zoomed: expected world shift for ' + CSS_DX + ' css px', zexp);
    await page.mouse.move(zat.x, zat.y); await page.waitForTimeout(200);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(zat.x + CSS_DX * i / 10, zat.y); await page.waitForTimeout(30); }
    await page.screenshot({ path: path.join(OUT, '03b-2d-zoomed-drag.png') });
    await page.mouse.up(); await page.waitForTimeout(200);
    const z1 = objOf(await inv(page), 'mirror');
    const zmoved = [z1.rect[0] - z0.rect[0], z1.rect[1] - z0.rect[1]];
    note('zoomed: after drop', { rectBefore: z0.rect, rectAfter: z1.rect, movedByWorldPx: zmoved, expected: [zexp.dx, zexp.dy] });
    if (Math.abs(zmoved[0] - zexp.dx) > 1 || Math.abs(zmoved[1] - zexp.dy) > 1) { throw new Error('zoomed: moved by ' + zmoved + ' world px, expected ' + [zexp.dx, zexp.dy]); }
    if (Math.abs(zmoved[0] - CSS_DX) < 1) { throw new Error('zoomed: the move equals the CSS shift — the mapping is not going through the camera'); }

    // Esc leaves.
    await page.keyboard.press('Escape');
    const left = await ui(page);
    note('Esc leaves', left);
    if (left.pressed !== 'false' || left.hand.on) { throw new Error('Esc did not leave hand mode'); }
    // H re-enters (top window), then the toggle button leaves again.
    await page.keyboard.press('h');
    note('H re-enters', (await ui(page)).hand);
    await page.click('#btn-hand');
    note('toolbar leaves', (await ui(page)).hand);

    // ── 3D: cl1a-mirror-3d ──
    const ld3 = await hand(page, 'loadScene', { id: 'cl1a-mirror-3d' });
    if (!ld3.ok) { throw new Error('loadScene cl1a-mirror-3d: ' + ld3.error); }
    await page.waitForTimeout(2500);
    note('3D opening ui (hand off)', await ui(page));
    await page.keyboard.press('h');
    await page.waitForTimeout(300);
    const on3 = await ui(page);
    await page.screenshot({ path: path.join(OUT, '04-3d-hand-on-reticle.png') });
    note('3D hand ON (H)', on3);
    if (on3.hand.mode !== '3d') { throw new Error('hand did not enter 3D mode: ' + JSON.stringify(on3)); }
    const aim0 = await page.evaluate(() => document.getElementById('scene-frame').contentWindow.MaxiScene.runner.getAimState());
    note('aim state after arming', aim0);
    const before3 = await inv(page);
    const m3before = objOf(before3, 'mirror');
    // Focus the scene mount (the package's CameraControls listen on the scene window) and press SPACE.
    await page.evaluate(() => document.getElementById('scene-frame').contentWindow.MaxiScene.mount().focus());
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const grabbed = await ui(page);
    note('SPACE grab', { ui: grabbed, aim: grabbed.hand.aim });
    if (grabbed.hand.grabbed !== 'mirror') { throw new Error('SPACE did not grab the mirror: ' + JSON.stringify(grabbed.hand)); }
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(200);
    const carried = await inv(page);
    await page.screenshot({ path: path.join(OUT, '05-3d-grabbed-carried.png') });
    note('camera strafe carried the wall', { before: m3before.rect, during: objOf(carried, 'mirror').rect, camera: carried.camera, ui: await ui(page) });
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const dropped = await inv(page);
    const d3 = await ui(page);
    await page.screenshot({ path: path.join(OUT, '06-3d-dropped.png') });
    note('SPACE drop', { rectBefore: m3before.rect, rectAfter: objOf(dropped, 'mirror').rect, ui: d3 });
    if (d3.hand.grabbed) { throw new Error('still grabbed after SPACE'); }
    if (JSON.stringify(objOf(dropped, 'mirror').rect) === JSON.stringify(m3before.rect)) { throw new Error('the 3D carry did not move the mirror'); }
    await page.keyboard.press('Escape');
    note('page errors', pageErrors);
    await ctx.close();
} catch (e) {
    failed = e; note('FAILED', String(e && e.stack || e));
} finally {
    await browser.close();
    const own = ownBrowserPids();
    note('orphan gate after close', { own });
    if (own.length) { process.exitCode = 3; }
}
if (failed) { process.exitCode = 1; }
