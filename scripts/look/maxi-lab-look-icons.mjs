#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab-look-icons.mjs — LOOK at the header's icons and the Info button's scene card.
 *
 *   node scripts/look/maxi-lab-look-icons.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <absolute node_modules holding playwright> --out .scratch/icons-look [--ffmpeg]
 *
 * A. desktop 1232x720 (the shell frame's size): every header button draws its icon (an inline <svg> with one shape) beside
 *    its visible words, its aria-label naming it; Pause turns to Resume (the play icon) and back; Record turns to a red Stop
 *    and back; Info opens the card for the 3D double slit, and the panel's text IS the lab roster's card and row fields (read
 *    again in the page through '@descix/frqtl-web/registry' off its roster link); a scene with no card says so and shows its row prose; Info closes it.
 * B. 390x844: icons only (the words hidden, every aria-label kept), the header's buttons inside the screen; Info opens the
 *    card over the stage.
 * A video of A is kept (Playwright's recording; --ffmpeg converts it to MP4 and samples a still from it).
 * The intro is marked seen before each goto (INTRO_SEEN_KEY). Browsers close by handle; the orphan gate counts only
 * chrome-headless-shell processes descended from THIS process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { INTRO_SEEN_KEY } from '../../site/app-assets/maxi-intro.js';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/icons-look'));
const FFMPEG = process.argv.includes('--ffmpeg');
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-icons] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-icons-log.json'), JSON.stringify(log, null, 2));
}
function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: +p[0], ppid: +p[1], comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]); let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    return rows.filter((r) => /chrome-headless-shell/.test(r.comm) && mine.has(r.pid)).map((r) => r.pid);
}
function check(cond, what, data) { if (!cond) { note('FAILED: ' + what, data); throw new Error('LOOK check failed: ' + what); } note('ok: ' + what, data); }

async function open(browser, viewport, video, device) {
    const ctx = await browser.newContext(Object.assign({ viewport }, device || {}, video ? { recordVideo: { dir: OUT, size: viewport } } : {}));
    await ctx.addInitScript((key) => { try { localStorage.setItem(key, '1'); } catch (e) { /* the look reads the page either way */ } }, INTRO_SEEN_KEY);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') { errors.push('console: ' + m.text()); } });
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 30, null, { timeout: 60000 });
    return { ctx, page, errors };
}
const shot = async (page, name, opts) => { const p = path.join(OUT, name); await page.screenshot(Object.assign({ path: p }, opts || {})); note('still', p); };

/** Every header button: its id, icon role, svg shape, words, aria-label, whether the words show, and its box. */
const readHeader = (page) => page.evaluate(() => Array.from(document.querySelectorAll('header button')).filter((b) => getComputedStyle(b).display !== 'none').map((b) => {
    const svg = b.querySelector(':scope > svg.icon'); const label = b.querySelector(':scope > .label'); const r = b.getBoundingClientRect();
    return { id: b.id, icon: b.dataset.icon || null, shape: svg ? svg.firstElementChild && svg.firstElementChild.tagName : null, svgW: svg ? svg.getBoundingClientRect().width : 0,
        words: label ? label.textContent : null, wordsShown: !!label && getComputedStyle(label).display !== 'none', aria: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'),
        fill: svg ? getComputedStyle(svg).fill : null, border: getComputedStyle(b).borderColor, x: r.left, right: r.right, top: r.top };
}));

/** Every shown header button on one row: their tops within 2 px. */
const oneRow = (h) => h.length > 0 && Math.max(...h.map((b) => b.top)) - Math.min(...h.map((b) => b.top)) <= 2;

/** The panel's lines, and the lines the lab's roster gives for the loaded scene (read again in the page, off its roster link, through its import map). */
const readCard = (page) => page.evaluate(async () => {
    const reg = await import('@descix/frqtl-web/registry');
    const roster = await reg.loadRoster(reg.rosterHrefOf(document));
    const sc = window.MaxiLab.state.scene;
    const rung = reg.walkthroughById(roster, sc.id);
    const tile = (roster.showcase ? roster.showcase.rows : []).find((e) => e.id === sc.id) || null;
    const want = [tile ? tile.title : rung.title];
    if (tile) { want.push(tile.tile); for (const k of ['what', 'why', 'how', 'controls']) { if (tile[k]) { want.push(tile[k]); } } }
    want.push(rung.prose);
    const pane = document.getElementById('info');
    const got = [document.getElementById('info-title').textContent].concat(Array.from(document.querySelectorAll('#info-body p:not(.info-absent)')).map((p) => p.textContent));
    return { id: sc.id, hidden: pane.hidden, width: pane.getBoundingClientRect().width, got, want, labels: Array.from(document.querySelectorAll('#info-body h3')).map((h) => h.textContent),
        absent: (document.querySelector('#info-body .info-absent') || {}).textContent || null, tile: !!tile };
});

note('orphan gate before launch', { own: ownBrowserPids() });
const browser = await chromium.launch({ headless: true });
let failed = null;
let video = null;
try {
    // ── A. desktop ──
    {
        const { ctx, page, errors } = await open(browser, { width: 1232, height: 720 }, true);
        video = page.video();
        const h = await readHeader(page);
        note('header (desktop)', h);
        check(h.map((b) => b.id).join() === 'btn-run,btn-restart,btn-hand,btn-record,btn-code,btn-info,btn-memories', 'A: the desktop header shows Run, Restart, Hand, Record, Scene code, Info, Memories (Full screen hidden)');
        check(oneRow(h), 'A: at the shell frame\'s 1232x720 every header button sits on ONE row (no button wraps onto the status line)', h.map((b) => [b.id, b.top, b.right]));
        check(h.every((b) => b.icon && b.shape && b.svgW >= 14 && b.wordsShown && b.words && b.aria === b.words), 'A: every button draws its icon beside its visible words, its aria-label naming it');
        const roles = Object.fromEntries(h.map((b) => [b.id, b.icon]));
        check(roles['btn-run'] === 'pause' && roles['btn-restart'] === 'restart' && roles['btn-hand'] === 'hand' && roles['btn-record'] === 'record' && roles['btn-code'] === 'code' && roles['btn-info'] === 'info', 'A: each button has its icon', roles);
        check(h.find((b) => b.id === 'btn-record').fill === 'rgb(255, 107, 107)', 'A: the record dot is red');
        await shot(page, 'A1-desktop-header.png', { clip: { x: 0, y: 0, width: 1232, height: 60 } });
        await page.click('#btn-run');
        await page.waitForFunction(() => document.getElementById('btn-run').dataset.icon === 'play');
        const paused = (await readHeader(page)).find((b) => b.id === 'btn-run');
        check(paused.aria === 'Resume' && paused.words === 'Resume' && !(await page.evaluate(() => window.MaxiLab.state.scene.runner.isRunning)), 'A: Pause stops the clock and the button turns to the play icon, "Resume"', paused);
        await page.click('#btn-run');
        await page.waitForFunction(() => document.getElementById('btn-run').dataset.icon === 'pause');
        await page.click('#btn-record');
        await page.waitForFunction(() => document.getElementById('btn-record').dataset.icon === 'stop', null, { timeout: 5000 });
        const rec = (await readHeader(page)).find((b) => b.id === 'btn-record');
        check(rec.pressed === 'true' && rec.words === 'Stop' && rec.aria === 'Stop' && rec.border === 'rgb(255, 107, 107)' && rec.fill === 'rgb(255, 107, 107)', 'A: recording, the button is a red Stop (border and icon red, aria-pressed true)', rec);
        await shot(page, 'A2-desktop-recording.png', { clip: { x: 0, y: 0, width: 1232, height: 60 } });
        await page.click('#btn-record');
        await page.waitForFunction(() => document.getElementById('btn-record').dataset.icon === 'record', null, { timeout: 15000 });
        await page.evaluate(() => { document.getElementById('demo').hidden = true; });
        // one side-pane slot: Info opened after Scene code closes Scene code; the stage stays wide and its pads in view
        await page.click('#btn-code');
        await page.click('#btn-info');
        await page.waitForTimeout(400);
        const slot = await page.evaluate(() => {
            const fr = document.getElementById('scene-frame'); const pads = Array.from(fr.contentDocument.querySelectorAll('[data-role="camera-joystick"]')).map((p) => p.getBoundingClientRect());
            const frw = fr.getBoundingClientRect().width;
            return { codeHidden: document.getElementById('code').hidden, codePressed: document.getElementById('btn-code').getAttribute('aria-pressed'), infoHidden: document.getElementById('info').hidden,
                infoPressed: document.getElementById('btn-info').getAttribute('aria-pressed'), stage: document.getElementById('stage').getBoundingClientRect().width, frame: frw,
                pads: pads.map((r) => ({ left: Math.round(r.left), right: Math.round(r.right), w: r.width })) };
        });
        note('Scene code then Info', slot);
        check(slot.codeHidden && slot.codePressed === 'false' && !slot.infoHidden && slot.infoPressed === 'true', 'A: Info opened after Scene code closes Scene code (its aria-pressed false)', slot);
        check(slot.stage >= 400 && slot.pads.length === 2 && slot.pads.every((r) => r.w > 0 && r.left >= 0 && r.right <= slot.frame), 'A: the stage stays wide (' + Math.round(slot.stage) + ' px) and both pads are in view', slot);
        await shot(page, 'A2b-desktop-code-then-info.png');
        await page.click('#btn-info');
        // the Info card on the 3D double slit
        check((await readCard(page)).hidden, 'A: the Info panel starts closed');
        await page.click('#btn-info');
        const card = await readCard(page);
        note('card (3D double slit)', card);
        check(!card.hidden && card.width > 300 && (await page.getAttribute('#btn-info', 'aria-pressed')) === 'true', 'A: Info opens the panel beside the stage, aria-pressed true');
        check(card.id === 'dse-tunnel-rebuild' && card.tile && JSON.stringify(card.got) === JSON.stringify(card.want), 'A: the panel\'s text IS the lab roster\'s card and row fields for the loaded scene');
        check(card.labels.slice(0, 3).join('|') === 'What you are seeing|Why it is impossible the usual way|How FRQTL gets it' && /^Rung /.test(card.labels[card.labels.length - 1]), 'A: the card memory\'s labels', card.labels);
        await page.waitForTimeout(600);
        await shot(page, 'A3-desktop-info-double-slit.png');
        await page.$eval('#info-body', (b) => { b.scrollTop = b.scrollHeight; });
        await shot(page, 'A3b-desktop-info-scrolled.png');
        // a scene with no tile row
        await page.evaluate(() => window.MaxiLab.loadScene({ id: 'r1-straight-walk' }));
        const bare = await readCard(page);
        note('card (no tile row)', bare);
        check(!bare.tile && /no tile card/.test(bare.absent || '') && JSON.stringify(bare.got) === JSON.stringify(bare.want), 'A: on scene change the panel follows; a scene with no tile row says so and shows its rung prose');
        await shot(page, 'A4-desktop-info-no-tile.png');
        await page.click('#btn-info');
        check((await readCard(page)).hidden && (await page.getAttribute('#btn-info', 'aria-pressed')) === 'false', 'A: Info closes it');
        note('A page errors', errors);
        // standalone, a Record's hand-off to Maxi is refused by name (no shell above the page): that one error is expected
        const unexpected = errors.filter((e) => !/^console: \[maxi-lab\] record[^\n]*Error: record: Maxi was NOT shown the footage [^\n]*running standalone/.test(e));
        check(unexpected.length === 0, 'A: no page errors beyond the named standalone Record refusal', errors);
        await ctx.close();
    }
    // ── B. 390 px ──
    {
        const { ctx, page, errors } = await open(browser, { width: 390, height: 844 }, false);
        const h = await readHeader(page);
        note('header (390)', h);
        check(h.every((b) => b.icon && b.svgW >= 16 && !b.wordsShown && b.aria), 'B: icons only at 390 px, every button still named by its aria-label');
        const fit = await page.evaluate(() => { const hd = document.querySelector('header'); return { scroll: hd.scrollWidth, client: hd.clientWidth }; });
        check(h.every((b) => b.x >= 0 && b.right <= 390) && fit.scroll <= fit.client, 'B: every header button sits inside the 390 px screen without scrolling the header', fit);
        check(oneRow(h) && h.some((b) => b.id === 'btn-memories'), 'B: at 390 px the header, Memories included, is ONE row', h.map((b) => [b.id, b.top]));
        await shot(page, 'B1-390-header.png', { clip: { x: 0, y: 0, width: 390, height: 60 } });
        await shot(page, 'B2-390-lab.png');
        await page.click('#btn-info');
        const card = await readCard(page);
        check(!card.hidden && JSON.stringify(card.got) === JSON.stringify(card.want), 'B: Info opens the card at 390 px, the roster\'s text');
        const reach = await page.evaluate(() => { const b = document.getElementById('btn-info').getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { top: document.getElementById('info').getBoundingClientRect().top, header: document.querySelector('header').getBoundingClientRect().bottom, hit: hit && hit.closest('button') ? hit.closest('button').id : null }; });
        check(reach.top >= reach.header - 1 && reach.hit === 'btn-info', 'B: the open card sits below the header, so Info stays reachable to close it', reach);
        await page.click('#btn-info');
        check((await readCard(page)).hidden, 'B: Info closes it at 390 px');
        await page.click('#btn-info');
        await page.waitForTimeout(400);
        await shot(page, 'B3-390-info.png');
        note('B page errors', errors);
        check(errors.length === 0, 'B: no page errors', errors);
        await ctx.close();
    }
    // ── C. a phone in landscape (844x390): the mobile layout's header is one row too ──
    {
        const { ctx, page } = await open(browser, { width: 844, height: 390 }, false, { isMobile: true, hasTouch: true });
        const h = await readHeader(page);
        note('header (844x390)', h);
        const fit = await page.evaluate(() => { const hd = document.querySelector('header'); return { scroll: hd.scrollWidth, client: hd.clientWidth }; });
        check(oneRow(h) && h.some((b) => b.id === 'btn-memories') && h.every((b) => b.x >= 0 && b.right <= 844) && fit.scroll <= fit.client, 'C: at 844x390 the header, Memories included, is ONE row inside the screen', fit);
        await shot(page, 'C1-844x390-header.png', { clip: { x: 0, y: 0, width: 844, height: 60 } });
        await ctx.close();
    }
} catch (err) {
    failed = err;
    note('FAILED', String(err && err.stack || err));
} finally {
    await browser.close();
    note('orphan gate after close', { own: ownBrowserPids() });
}
if (video && FFMPEG) {
    const webm = await video.path();
    const mp4 = path.join(OUT, 'A-desktop.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4]);
    const secs = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString().trim());
    note('clip', { mp4, seconds: secs });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-1.5', '-i', mp4, '-frames:v', '1', path.join(OUT, 'A-clip-last.png')]);
    note('still from the clip', path.join(OUT, 'A-clip-last.png'));
}
if (failed) { process.exit(1); }
