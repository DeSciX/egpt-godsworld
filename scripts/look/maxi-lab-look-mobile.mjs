#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab-look-mobile.mjs — LOOK at Maxi's Lab on a phone and on a desktop, standalone (no shell).
 *
 *   node scripts/look/maxi-lab-look-mobile.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright /path/to/node_modules --out .scratch/mobile-look
 *
 *   A. desktop 1360x820: the lab opens on the 3D double slit; Send sits beside the Imagine box; no Full screen button.
 *   B. phone 390x844 (Chromium, isMobile): the header is ONE row; the stage takes the height above the conversation
 *      strip; Send is beside the box and enabled with it; with the keyboard up (the viewport shrunk to 390x480) Send is
 *      still inside the viewport; the Full screen button shows and window.MaxiLab.fullscreen() enters and leaves full
 *      screen from a click.
 *   D. phone in landscape 844x390 (Chromium, isMobile, coarse pointer): mobile too — one header row, the conversation beside
 *      the stage, the Full screen button present and working; a short DESKTOP window of the same size keeps the desktop layout.
 *   C. phone 390 (WebKit, iPhone 13 profile): no element Fullscreen API, so the Full screen button stays hidden and
 *      window.MaxiLab.fullscreen() is refused by name.
 * Exit 1 on any failed check. Browser discipline: launched and closed by Playwright's handle; the orphan gate counts
 * browser processes descended from THIS process only, before and after.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { INTRO_SEEN_KEY } from '../../site/app-assets/maxi-intro.js';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/mobile-look'));
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'));
const pw = require('playwright');

const failures = [];
function note(line, data) { console.log('[mobile-look] ' + line + (data === undefined ? '' : ' ' + JSON.stringify(data))); }
function check(ok, what, data) { note((ok ? 'PASS ' : 'FAIL ') + what, data); if (!ok) { failures.push(what); } }
function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: Number(p[0]), ppid: Number(p[1]), comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]);
    let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    mine.delete(process.pid);
    return { own: rows.filter((r) => mine.has(r.pid) && !/^(ps|pgrep)$/.test(path.basename(r.comm))).map((r) => r.pid + ':' + path.basename(r.comm)), total: rows.filter((r) => /chrome-headless-shell|ms-playwright/.test(r.comm)).length };
}

/** Layout facts of the lab page: rects of the header, its buttons, the stage, the Imagination drawer's ticker under it, the conversation strip, the box and Send. */
const layout = () => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) { return null; } const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), shown: getComputedStyle(e).display !== 'none' && !e.hidden }; };
    const head = Array.from(document.querySelectorAll('header > *')).filter((e) => getComputedStyle(e).display !== 'none');
    const mids = head.map((e) => { const b = e.getBoundingClientRect(); return b.top + b.height / 2; });
    const lastRight = Math.max.apply(null, head.map((e) => e.getBoundingClientRect().right));
    return { vw: innerWidth, vh: innerHeight, header: r('header'), headerRight: Math.round(lastRight), headerRows: (Math.max.apply(null, mids) - Math.min.apply(null, mids)) <= 4 ? 1 : 2, headerFits: lastRight <= innerWidth,
        stage: r('#stage'), drawer: r('#imagination'), talk: r('#talk'), box: r('#imagine-text'), send: r('#imagine-send'), fs: r('#btn-fullscreen'),
        sendDisabled: document.getElementById('imagine-send').disabled, boxDisabled: document.getElementById('imagine-text').disabled,
        scene: window.MaxiLab.state.scene && { id: window.MaxiLab.state.scene.id, mode: window.MaxiLab.state.scene.mode, renderer: window.MaxiLab.state.scene.renderer } };
};
async function open(browser, ctxOpts) {
    const ctx = await browser.newContext(ctxOpts);
    await ctx.addInitScript((key) => { try { localStorage.setItem(key, '1'); } catch (e) { /* storage refused: the look then meets the walk-through */ } }, INTRO_SEEN_KEY);   // this look clicks the lab, not the walk-through
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 20, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    return { ctx, page, errors };
}

const gate0 = ownBrowserPids();
note('orphan gate before launch', gate0);
try {
    // A + B: Chromium
    const chromium = await pw.chromium.launch({ headless: true });
    try {
        const a = await open(chromium, { viewport: { width: 1360, height: 820 } });
        const la = await a.page.evaluate(layout);
        await a.page.screenshot({ path: path.join(OUT, 'A-desktop.png') });
        check(la.scene.id === 'dse-tunnel-rebuild' && la.scene.mode === '3d' && la.scene.renderer === 'three', 'A: desktop opens on the 3D double slit', la.scene);
        check(la.send.shown && !la.sendDisabled && la.send.y === la.box.y && la.send.x > la.box.x + la.box.w, 'A: Send sits beside the Imagine box, enabled with it', { box: la.box, send: la.send, sendDisabled: la.sendDisabled });
        check(!la.fs.shown, 'A: no Full screen button on a desktop', la.fs);
        await a.ctx.close();

        const b = await open(chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
        const lb = await b.page.evaluate(layout);
        await b.page.screenshot({ path: path.join(OUT, 'B1-phone-390.png') });
        check(lb.headerRows === 1 && lb.header.h <= 44 && lb.headerFits, 'B: the header is one compact row and every control in it is inside 390 px', { rows: lb.headerRows, fits: lb.headerFits, right: lb.headerRight, header: lb.header });
        check(lb.stage.y === lb.header.y + lb.header.h && lb.stage.y + lb.stage.h === lb.drawer.y && lb.drawer.y + lb.drawer.h === lb.talk.y && lb.drawer.h <= 32 && lb.talk.y + lb.talk.h <= lb.vh && lb.stage.h >= 0.5 * lb.vh,
            'B: the stage takes the viewport above the conversation strip, the Imagination drawer\'s one-line ticker between them', { vh: lb.vh, header: lb.header, stage: lb.stage, drawer: lb.drawer, talk: lb.talk });
        check(lb.send.shown && lb.send.y === lb.box.y && lb.send.x + lb.send.w <= lb.vw && lb.box.w >= 200 && !lb.sendDisabled && !lb.boxDisabled, 'B: Send is beside the box inside 390 px, both enabled', { box: lb.box, send: lb.send });
        await b.page.click('#imagine-text');
        await b.page.setViewportSize({ width: 390, height: 480 });   // the keyboard takes the bottom ~364 px
        await b.page.waitForTimeout(500);
        const lk = await b.page.evaluate(layout);
        await b.page.screenshot({ path: path.join(OUT, 'B2-phone-keyboard-up.png') });
        check(lk.send.y >= 0 && lk.send.y + lk.send.h <= lk.vh && lk.send.x + lk.send.w <= lk.vw, 'B: with the keyboard up (390x480) Send is still inside the viewport', { vh: lk.vh, send: lk.send, box: lk.box });
        await b.page.setViewportSize({ width: 390, height: 844 });
        check(lb.fs.shown && lb.fs.x >= 0 && lb.fs.x + lb.fs.w <= lb.vw, 'B: the Full screen button shows, inside the viewport, on a phone where full screen is available', lb.fs);
        await b.page.click('#btn-fullscreen');
        await b.page.waitForTimeout(800);
        const inFs = await b.page.evaluate(() => ({ el: document.fullscreenElement && document.fullscreenElement.tagName, label: document.getElementById('btn-fullscreen').getAttribute('aria-label'), pressed: document.getElementById('btn-fullscreen').getAttribute('aria-pressed') }));
        const lf = await b.page.evaluate(layout);
        check(lf.headerRows === 1 && lf.headerFits && lf.vh === 844, 'B: in full screen the header is still one row inside 390 px', { rows: lf.headerRows, fits: lf.headerFits, right: lf.headerRight, vh: lf.vh });
        await b.page.screenshot({ path: path.join(OUT, 'B3-phone-fullscreen.png') });
        check(inFs.el === 'HTML' && inFs.label === 'Exit full screen' && inFs.pressed === 'true', 'B: the button puts the lab in full screen', inFs);
        await b.page.click('#btn-fullscreen');
        await b.page.waitForTimeout(800);
        const outFs = await b.page.evaluate(() => ({ el: document.fullscreenElement, label: document.getElementById('btn-fullscreen').getAttribute('aria-label'), bar: document.getElementById('error').hidden ? null : document.getElementById('error').textContent }));
        check(outFs.el === null && outFs.label === 'Full screen' && outFs.bar === null, 'B: and leaves it cleanly', outFs);
        check(b.errors.length === 0, 'B: no page errors', b.errors);
        await b.ctx.close();

        const d = await open(chromium, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
        const ld = await d.page.evaluate(layout);
        const dm = await d.page.evaluate(() => ({ mobile: window.MaxiLab.mobile(), can: window.MaxiLab.fullscreenAvailable() }));
        await d.page.screenshot({ path: path.join(OUT, 'D1-phone-landscape-844x390.png') });
        check(dm.mobile === true && ld.headerRows === 1 && ld.headerFits && ld.header.h <= 44, 'D: a landscape phone (844x390) is mobile: one header row inside the width', { mobile: dm.mobile, rows: ld.headerRows, fits: ld.headerFits, header: ld.header });
        check(dm.can.available && ld.fs.shown && ld.fs.x >= 0 && ld.fs.x + ld.fs.w <= ld.vw, 'D: the Full screen button is present on the landscape phone', ld.fs);
        check(ld.talk.x >= ld.stage.x + ld.stage.w && ld.stage.h + ld.drawer.h === ld.vh - ld.header.h && ld.drawer.y === ld.stage.y + ld.stage.h && ld.drawer.h <= 32 && ld.stage.w >= 0.5 * ld.vw && ld.send.y + ld.send.h <= ld.vh && ld.send.x + ld.send.w <= ld.vw,
            'D: landscape puts the conversation beside the stage, which with the drawer\'s ticker under it takes the full height under the header; Send inside the viewport', { stage: ld.stage, drawer: ld.drawer, talk: ld.talk, send: ld.send, vh: ld.vh });
        await d.page.click('#btn-fullscreen');
        await d.page.waitForTimeout(800);
        const dfs = await d.page.evaluate(() => !!document.fullscreenElement);
        await d.page.screenshot({ path: path.join(OUT, 'D2-phone-landscape-fullscreen.png') });
        await d.page.click('#btn-fullscreen');
        await d.page.waitForTimeout(800);
        const dout = await d.page.evaluate(() => !document.fullscreenElement);
        check(dfs && dout, 'D: the landscape button enters and leaves full screen', { entered: dfs, left: dout });
        const desk = await (await chromium.newContext({ viewport: { width: 844, height: 390 } })).newPage();
        await desk.goto(URL_, { waitUntil: 'load' });
        await desk.waitForFunction(() => window.MaxiLab && window.MaxiLab.state.scene, null, { timeout: 90000 });
        const dk = await desk.evaluate(() => ({ mobile: window.MaxiLab.mobile(), fs: getComputedStyle(document.getElementById('btn-fullscreen')).display }));
        check(dk.mobile === false && dk.fs === 'none', 'D: a short desktop window (844x390, fine pointer) keeps the desktop layout', dk);
        await desk.context().close();
        check(d.errors.length === 0, 'D: no page errors', d.errors);
        await d.ctx.close();
    } finally { await chromium.close(); }

    // C: WebKit, iPhone profile
    const webkit = await pw.webkit.launch({ headless: true });
    try {
        const c = await open(webkit, Object.assign({}, pw.devices['iPhone 13']));
        const lc = await c.page.evaluate(layout);
        await c.page.screenshot({ path: path.join(OUT, 'C1-iphone-webkit.png') });
        const door = await c.page.evaluate(async () => { const can = window.MaxiLab.fullscreenAvailable(); try { await window.MaxiLab.fullscreen(); return { can, ran: true }; } catch (e) { return { can, error: String(e.message || e) }; } });
        check(!lc.fs.shown && door.can.available === false && /^fullscreen: refused — this browser offers no element Fullscreen API/.test(door.error || ''), 'C: iPhone WebKit: no Full screen button, the door refused by name', { fs: lc.fs, door });
        check(lc.headerRows === 1 && lc.headerFits && lc.send.shown && lc.send.x + lc.send.w <= lc.vw, 'C: iPhone WebKit: one header row, Send inside the viewport', { rows: lc.headerRows, send: lc.send, vw: lc.vw, vh: lc.vh });
        await c.ctx.close();
    } finally { await webkit.close(); }
} finally {
    const gate1 = ownBrowserPids();
    note('orphan gate after close', gate1);
    if (gate1.own.length) { failures.push('orphan browser processes: ' + gate1.own.join(',')); }
}
if (failures.length) { note('FAILED', failures); process.exit(1); }
note('ALL PASS');
