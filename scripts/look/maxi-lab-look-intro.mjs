#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab-look-intro.mjs — LOOK at the run-once walk-through (site/app-assets/maxi-intro.js) over the lab.
 *
 *   node scripts/look/maxi-lab-look-intro.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <absolute node_modules holding playwright> --out .scratch/intro-look
 *
 * A. desktop 1232x720 (the shell frame at a 1280x800 window) under a stubbed shell whose powch says nobody is signed in: step 1 (the intro text), step 2
 *    (the explainers and the rings on the controls, the MOVE and LOOK pads drawn after them), the entry button's label, 15 Tabs that stay in the overlay,
 *    H after tabbing (the hand stays off), a login that throws (shown by name), Esc, H and R working after close, the lab booted underneath, the reload that
 *    skips (run once), the "What is this?" button that re-opens it;
 * B. 390x844 standalone: both steps, a tapped row peeking at its control, the entry button reachable, Enter, the lab;
 * C. localStorage that throws: the walk-through shows and the lab still boots;
 * D. 844x390 landscape, touch (coarse pointer): the Full screen control is ringed, Enter goes full screen.
 * Browsers close by handle; the orphan gate counts only chrome-headless-shell processes descended from THIS process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

import { EXPLAINERS } from '../../site/app-assets/maxi-intro.js';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/intro-look'));
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-intro] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-intro-log.json'), JSON.stringify(log, null, 2));
}
function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: +p[0], ppid: +p[1], comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]); let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    return rows.filter((r) => /chrome-headless-shell/.test(r.comm) && mine.has(r.pid)).map((r) => r.pid);
}
function check(cond, what) { if (!cond) { throw new Error('LOOK check failed: ' + what); } note('ok: ' + what); }

/** A shell bus in the top window whose powch says nobody is signed in; login throws when window.__loginThrows. */
const SHELL_UNSIGNED = () => {
    if (window.top !== window) { return; }
    const members = ['call', 'view', 'powch'];
    window.DeSciX = {
        bridge: { version: 'look-stub', ready: true, EVENT: 'descix:bridge-ready', members: () => members },
        ready: async () => ({ mode: 'shell', members, version: 'look-stub' }),
        call: async () => ({ status: 'OK', message: { status: 'OK', response: 'look-stub', interaction_id: 'look-stub' } }),
        view: { available: () => false, set: (m) => m },
        powch: {
            isAuthenticated: () => false,
            getAddress: () => null,
            login: async () => {
                window.__logins = (window.__logins || 0) + 1;
                if (window.__loginThrows) { const e = new Error('The passkey ceremony was cancelled (look stub)'); e.name = 'NotAllowedError'; throw e; }
            }
        }
    };
};
const STORAGE_THROWS = () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('storage denied (look stub)', 'SecurityError'); } });
};

async function open(browser, viewport, inits, device) {
    const ctx = await browser.newContext(Object.assign({ viewport }, device || {}));
    for (const f of inits) { await ctx.addInitScript(f); }
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') { errors.push('console: ' + m.text()); } });
    return { ctx, page, errors };
}
const shot = async (page, name) => { const p = path.join(OUT, name); await page.screenshot({ path: p }); note('still', p); };
/** The lab booted after a navigation: a scene ticking. A navigation that cuts a boot short aborts its fetches, so each one waits for this. */
const booted = (page) => page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 5, null, { timeout: 60000 });
const visible = (page) => page.evaluate(() => !document.getElementById('intro').hidden);

note('orphan gate before launch', { own: ownBrowserPids() });
const browser = await chromium.launch({ headless: true });
let failed = null;
try {
    // ── A. desktop, shell, nobody signed in ──
    {
        // the lab frame's size inside the shell at a 1280x800 window (measured): ten rows make the panel scroll
        const { ctx, page, errors } = await open(browser, { width: 1232, height: 720 }, [SHELL_UNSIGNED]);
        await page.goto(URL_, { waitUntil: 'load' });
        await page.waitForSelector('#intro:not([hidden])');
        await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 30, null, { timeout: 30000 });
        check(await visible(page), 'A: the walk-through is open on a first visit while the lab boots underneath (tick > 30)');
        const focusAtBoot = await page.evaluate(() => { const a = document.activeElement; return a && a.closest('#intro') ? 'intro' : (a ? a.id || a.tagName : 'null'); });
        check(focusAtBoot === 'intro', 'A: after the lab boots, focus is still in the walk-through (read: ' + focusAtBoot + ')');
        await shot(page, 'A1-desktop-step1.png');
        const onStage = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 40, r.top + r.height / 2); return e && (e.closest('#intro') ? '#intro' : e.className || e.id || e.tagName); });
        check(onStage === '#intro' || onStage === 'intro-backdrop', 'A: the open walk-through takes a pointer aimed at the stage (hit: ' + onStage + ') — a driver that clicks the stage seeds INTRO_SEEN_KEY first');
        await page.click('.intro-next');
        await page.waitForFunction(() => !document.querySelector('.intro-entry').disabled);
        const label = await page.textContent('.intro-entry');
        check(label === 'Login to enter Godsworld', 'A: unsigned shell with powch → the button reads "Login to enter Godsworld" (read: ' + label + ')');
        const rings = await page.$$eval('.intro-ring:not([hidden])', (rs) => rs.map((r) => r.dataset.for));
        note('rings shown', rings);
        check(!rings.includes('btn-fullscreen') && rings.length === Object.keys(EXPLAINERS).length - 1 && rings.includes('btn-info'), 'A: desktop draws a ring on every shown control (every EXPLAINERS row but Full screen), Info included, and none on the hidden Full screen (rings: ' + rings.length + ')');
        const pads = await page.evaluate(() => {
            const sec = document.querySelector('#intro .intro-pads');
            const disc = (cap) => { const d = sec && sec.querySelector('.intro-pad[data-pad="' + cap + '"]'); const r = d && d.getBoundingClientRect(); return r ? { x: r.left, w: r.width, cap: d.textContent } : null; };
            return sec ? { title: sec.querySelector('h2').textContent, lede: sec.querySelector('.intro-lede').textContent, move: disc('MOVE'), look: disc('LOOK'),
                rows: Array.from(sec.querySelectorAll('li')).map((li) => li.querySelector('b').textContent) } : null;
        });
        note('pads section', pads);
        check(pads && /3D scenes/.test(pads.title) && /airplane/.test(pads.lede) && pads.move && pads.look && pads.move.x < pads.look.x && pads.move.cap === 'MOVE' && pads.look.cap === 'LOOK'
            && pads.rows.join('|') === 'MOVE (W A S D)|LOOK (arrow keys)', 'A: step 2 draws the MOVE pad left and the LOOK pad right after the controls, with their airplane rows');
        await page.$eval('#intro .intro-pads', (sec) => sec.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(200);
        await shot(page, 'A2b-desktop-pads.png');
        await page.$eval('.intro-panel', (p) => { p.scrollTop = 0; });
        await page.hover('.intro-explainers li[data-for="btn-hand"]');
        await shot(page, 'A2-desktop-step2.png');
        await page.keyboard.press('h');
        const hand = await page.getAttribute('#btn-hand', 'aria-pressed');
        check(hand === 'false', 'A: H pressed under the walk-through leaves the hand off (aria-pressed ' + hand + ')');
        // Tab never leaves the walk-through: focus is inside #intro or on <body> (between the last and the first control).
        const walk = [];
        for (let i = 0; i < 15; i++) {
            await page.keyboard.press('Tab');
            walk.push(await page.evaluate(() => { const a = document.activeElement; return a && a.closest('#intro') ? 'intro:' + (a.id || a.className || a.tagName) : (a ? a.tagName + (a.id ? '#' + a.id : '') : 'null'); }));
        }
        note('tab walk', walk);
        check(walk.every((w) => w.startsWith('intro:') || w === 'BODY'), 'A: 15 Tabs never leave the walk-through');
        await page.keyboard.press('h');
        check((await page.getAttribute('#btn-hand', 'aria-pressed')) === 'false', 'A: H after tabbing leaves the hand off');
        check(await page.evaluate(() => ['header', 'main'].every((s) => document.querySelector(s).inert)), 'A: the header and main are inert while the walk-through is open');
        await page.evaluate(() => { window.__loginThrows = true; });
        await page.click('.intro-entry');
        await page.waitForSelector('.intro-error:not([hidden])');
        const shown = await page.textContent('.intro-error');
        check(/^NotAllowedError: /.test(shown) && await visible(page), 'A: a login that throws is shown by name and the walk-through stays (read: ' + shown + ')');
        const errView = await page.evaluate(() => {
            const e = document.querySelector('.intro-error'); const r = e.getBoundingClientRect();
            const panel = document.querySelector('.intro-panel').getBoundingClientRect();
            const entry = document.querySelector('.intro-entry').getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { err: [r.top, r.bottom], panel: [panel.top, panel.bottom], entryTop: entry.top, hit: hit === e || e.contains(hit) ? 'error' : (hit ? hit.className || hit.tagName : null) };
        });
        note('login error in view', errView);
        check(errView.err[0] >= errView.panel[0] && errView.err[1] <= errView.entryTop && errView.hit === 'error', 'A: the login error lies inside the panel\'s visible area, above the buttons, uncovered');
        await shot(page, 'A3-desktop-login-error.png');
        await page.evaluate(() => { window.__loginThrows = false; });
        await page.click('.intro-entry');
        await page.waitForFunction(() => document.getElementById('intro').hidden);
        check((await page.evaluate(() => window.__logins)) === 2, 'A: the login act called powch.login() and a resolved login closed the walk-through');
        await page.evaluate(() => window.MaxiIntro.open());
        await page.keyboard.press('Escape');
        check(!(await visible(page)), 'A: Esc dismisses');
        check(await page.evaluate(() => ['header', 'main', '#says', '#error'].every((s) => !document.querySelector(s).inert)), 'A: nothing stays inert after close');
        await page.keyboard.press('h');
        await page.waitForFunction(() => document.getElementById('btn-hand').getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
        check(true, 'A: H after close takes the hand');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('btn-hand').getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
        await page.keyboard.press('r');
        await page.waitForFunction(() => document.getElementById('btn-record').textContent === 'Stop', null, { timeout: 5000 });
        await page.keyboard.press('r');
        await page.waitForFunction(() => document.getElementById('btn-record').textContent === 'Record', null, { timeout: 15000 });
        check(true, 'A: R after close starts and stops a Record');
        await shot(page, 'A4-desktop-lab.png');
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('#intro-open');
        await booted(page);
        await page.waitForTimeout(500);
        check(!(await visible(page)), 'A: a second visit skips the walk-through (run once)');
        await page.click('#intro-open');
        check(await visible(page), 'A: "What is this?" re-opens it');
        await page.goto(URL_ + '?intro=1', { waitUntil: 'load' });
        await page.waitForSelector('#intro-open');
        await booted(page);
        check(await visible(page), 'A: ?intro=1 re-opens it on a seen browser');
        await page.evaluate(() => localStorage.clear());
        await page.goto(URL_ + '?intro=0', { waitUntil: 'load' });
        await page.waitForSelector('#intro-open');
        await booted(page);
        check(!(await visible(page)), 'A: ?intro=0 keeps it closed on a first visit');
        note('A page errors', errors);
        check(errors.filter((e) => !/NotAllowedError/.test(e)).length === 0, 'A: no page errors beyond the planted login error');
        await ctx.close();
    }
    // ── B. 390 px, standalone ──
    {
        const { ctx, page, errors } = await open(browser, { width: 390, height: 844 }, []);
        await page.goto(URL_, { waitUntil: 'load' });
        await page.waitForSelector('#intro:not([hidden])');
        await shot(page, 'B1-390-step1.png');
        const nextBox = await (await page.$('.intro-next')).boundingBox();
        check(nextBox && nextBox.y + nextBox.height <= 844 && nextBox.x >= 0 && nextBox.x + nextBox.width <= 390, 'B: Next is on screen at 390 px without scrolling (box ' + JSON.stringify(nextBox) + ')');
        await page.click('.intro-next');
        await page.waitForFunction(() => !document.querySelector('.intro-entry').disabled);
        const label = await page.textContent('.intro-entry');
        check(label === 'Enter Godsworld', 'B: standalone → "Enter Godsworld" (read: ' + label + ')');
        await shot(page, 'B2-390-step2.png');
        await page.click('.intro-explainers li[data-for="btn-hand"]');
        await page.waitForTimeout(400);
        check(await page.evaluate(() => document.getElementById('intro').classList.contains('intro-peek')), 'B: a tapped row fades the panel to show its control');
        await shot(page, 'B2b-390-peek-hand.png');
        await page.waitForFunction(() => !document.getElementById('intro').classList.contains('intro-peek'), null, { timeout: 4000 });
        const box = await (await page.$('.intro-entry')).boundingBox();
        check(box && box.y + box.height <= 844 && box.x + box.width <= 390, 'B: the entry button is on screen at 390 px (box ' + JSON.stringify(box) + ')');
        const scrolls = await page.$eval('.intro-panel', (p) => ({ scrollHeight: p.scrollHeight, clientHeight: p.clientHeight }));
        note('B panel', scrolls);
        await page.$eval('#intro .intro-pads', (sec) => sec.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(200);
        await shot(page, 'B3a-390-pads.png');
        const padsFit = await page.$eval('#intro .intro-pads-picture', (p) => { const r = p.getBoundingClientRect(); return { left: r.left, right: r.right }; });
        check(padsFit.left >= 0 && padsFit.right <= 390, 'B: the pads picture fits the 390 px panel (' + JSON.stringify(padsFit) + ')');
        await page.$eval('.intro-panel', (p) => { p.scrollTop = p.scrollHeight; });
        await shot(page, 'B3-390-step2-scrolled.png');
        check((await page.$$eval('.intro-ring:not([hidden])', (rs) => rs.map((r) => r.dataset.for))).includes('btn-fullscreen'), 'B: 390 portrait rings the Full screen button');
        await page.click('.intro-entry');
        await page.waitForFunction(() => document.getElementById('intro').hidden, null, { timeout: 5000 });
        check(await page.evaluate(() => !!document.fullscreenElement), 'B: Enter on a phone-sized screen closed the walk-through and put the lab in full screen');
        await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 30, null, { timeout: 30000 });
        await shot(page, 'B4-390-lab.png');
        note('B page errors', errors);
        await ctx.close();
    }
    // ── D. landscape phone: coarse pointer, 844x390 ──
    {
        const { ctx, page, errors } = await open(browser, { width: 844, height: 390 }, [], { hasTouch: true, isMobile: true });   // a touch screen: pointer coarse
        await page.goto(URL_, { waitUntil: 'load' });
        await page.waitForSelector('#intro:not([hidden])');
        check(await page.evaluate(() => window.MaxiLab.mobile() && window.MaxiLab.fullscreenAvailable().available), 'D: 844x390 coarse pointer → MaxiLab.mobile() and full screen available');
        await shot(page, 'D1-844x390-step1.png');
        await page.click('.intro-next');
        await page.waitForFunction(() => !document.querySelector('.intro-entry').disabled);
        const rings = await page.$$eval('.intro-ring:not([hidden])', (rs) => rs.map((r) => r.dataset.for));
        note('D rings shown', rings);
        check(rings.includes('btn-fullscreen'), 'D: the Full screen control is ringed in landscape');
        await page.click('.intro-explainers li[data-for="btn-fullscreen"]');
        await page.waitForTimeout(400);
        await shot(page, 'D2-844x390-peek-fullscreen.png');
        await page.waitForFunction(() => !document.getElementById('intro').classList.contains('intro-peek'), null, { timeout: 4000 });
        const box = await (await page.$('.intro-entry')).boundingBox();
        check(box && box.y + box.height <= 390 && box.x + box.width <= 844, 'D: the entry button is on screen in landscape (box ' + JSON.stringify(box) + ')');
        await page.click('.intro-entry');
        await page.waitForFunction(() => document.getElementById('intro').hidden, null, { timeout: 5000 });
        check(await page.evaluate(() => !!document.fullscreenElement), 'D: Enter closed the walk-through and put the lab in full screen');
        await booted(page);
        await page.waitForTimeout(800);
        await shot(page, 'D3-844x390-lab-fullscreen.png');
        note('D page errors', errors);
        check(errors.length === 0, 'D: no page errors');
        await ctx.close();
    }
    // ── C. storage throws ──
    {
        const { ctx, page, errors } = await open(browser, { width: 1280, height: 800 }, [STORAGE_THROWS]);
        await page.goto(URL_, { waitUntil: 'load' });
        await page.waitForSelector('#intro:not([hidden])');
        await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 30, null, { timeout: 30000 });
        check(true, 'C: storage that throws → the walk-through shows and the lab boots');
        await page.keyboard.press('Escape');
        check(!(await visible(page)), 'C: Esc dismisses with storage throwing');
        note('C page errors', errors);
        check(errors.every((e) => /\[maxi-intro\] localStorage could not be/.test(e) || /storage denied/.test(e)), 'C: the only errors are the named storage ones');
        await ctx.close();
    }
} catch (err) {
    failed = err;
    note('FAILED', String(err && err.stack || err));
} finally {
    await browser.close();
    note('orphan gate after close', { own: ownBrowserPids() });
}
if (failed) { process.exit(1); }
