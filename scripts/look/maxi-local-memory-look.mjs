#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-local-memory-look.mjs — LOOK at local memories end to end on dse-tunnel-rebuild (2D, its declared `screen`), across
 * browser sessions on one profile (each a NEW browser, so a memory is read back from the browser's own storage):
 *   1 (1232x720, the shell frame): the header is one row; a Record stopped is kept at that moment (no button, Maxi asked
 *     nothing); its card's × removes it; a second Record is kept, Reload is refused while its card waits, Send updates it with
 *     the words and his answer; Reload is refused while Record is on;
 *   2 (390x844 phone): one-row header; the pane, rows and doors fit;
 *   3: the memory listed; Reload at parts.after with its clip playing; Discuss asks with its facts and clip; a well-formed
 *     wrong parts.after.json and a corrupt entry, planted in IndexedDB, refused by name; Delete;
 *   4: a new browser lists nothing.
 *
 *   node scripts/look/maxi-local-memory-look.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <node_modules> --out .scratch/look-local-memory [--ffmpeg /opt/homebrew/bin/ffmpeg]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { INTRO_SEEN_KEY } from '../../site/app-assets/maxi-intro.js';
import { DISCUSS_HEAD, TEACHING_HEAD } from '../../site/app-assets/maxi-ask.js';
import { DB_NAME, STORE, LOCAL_MEMORY_HEAD } from '../../site/app-assets/maxi-local-memory.js';

const WORDS = 'moving the screen away from the slits lets the bands spread wider';
const QUESTION = 'why do the bands get wider when the screen is further from the slits?';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/look-local-memory'));
const FFMPEG = argOf('--ffmpeg', null);
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const PROFILE = path.join(OUT, 'profile');
fs.rmSync(PROFILE, { recursive: true, force: true });
const { chromium } = createRequire(path.join(PW_DIR, 'noop.js'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-local-memory] ' + line + (data !== undefined ? ' ' + JSON.stringify(data).slice(0, 600) : ''));
    fs.writeFileSync(path.join(OUT, 'look-local-memory-log.json'), JSON.stringify(log, null, 2));
}
function check(ok, what, data) { if (!ok) { throw new Error('LOOK FAILED: ' + what + (data !== undefined ? ' — ' + JSON.stringify(data).slice(0, 1200) : '')); } note('ok: ' + what); }

const STUB = () => {
    if (window.top !== window) { return; }
    window.__asks = [];
    window.DeSciX = {
        bridge: { version: 'look-stub', ready: true, EVENT: 'descix:bridge-ready', members: () => ['call', 'view'] },
        ready: async () => ({ mode: 'shell', members: ['call', 'view'], version: 'look-stub' }),
        call: async (command, params) => {
            window.__asks.push({ command: command, params: params });
            const n = window.__asks.length;
            const answer = /remembered demonstration/.test(params.user_input)
                ? 'look-stub answer ' + n + ': you asked about your kept demonstration; the footage shows the part you moved.'
                : 'look-stub answer ' + n + ': I see the scene and the part you moved.';
            return { status: 'OK', message: { status: 'OK', response: answer, interaction_id: 'look-stub-' + n, usage: { media_tokens: 0 } } };
        },
        view: { available: () => false, set: (m) => m }
    };
};

async function session(viewport, extra) {
    const ctx = await chromium.launchPersistentContext(PROFILE, Object.assign({ headless: true, viewport: viewport }, extra || {}));
    await ctx.addInitScript(STUB);
    await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);
    const page = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    return { ctx, page, errors };
}
async function hand(page, op, args) {
    return page.evaluate(async ({ op, args }) => {
        try { return { ok: true, result: JSON.parse(await window.DeSciX_Actions[op](args)) }; }
        catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    }, { op, args });
}
async function inv(page) { return page.evaluate(async () => { const i = await window.MaxiLab.inventory(); return { parts: i.parts, objects: i.objects }; }); }
async function pageXY(page, world) {
    return page.evaluate((world) => {
        const f = document.getElementById('scene-frame');
        const fr = f.getBoundingClientRect();
        const ms = f.contentWindow.MaxiScene;
        const cr = ms.canvas().getBoundingClientRect();
        const sp = ms.runner.screenPointOf(world, cr.width, cr.height);
        return { x: fr.left + cr.left + sp[0], y: fr.top + cr.top + sp[1] };
    }, world);
}
const paneText = (page) => page.evaluate(() => ({ status: document.getElementById('memories-status').textContent, list: document.getElementById('memories-list').innerText, hidden: document.getElementById('memories').hidden }));
const errorBar = (page) => page.evaluate(() => document.getElementById('error').hidden ? null : document.getElementById('error').textContent);
function ownBrowsers() {
    return execFileSync('ps', ['-eo', 'pid,command']).toString().split('\n').filter((l) => /chrome-headless-shell|ms-playwright/.test(l) && !/\bgrep\b/.test(l)).length;
}

const headerOneRow = (page) => page.evaluate(() => {
    const tops = Array.from(document.querySelectorAll('header button')).filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.getBoundingClientRect().top);
    return { rows: Math.max(...tops) - Math.min(...tops) <= 2, ids: Array.from(document.querySelectorAll('header button')).filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id) };
});
const stripHas = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('talk-lines').innerText), re.source, { timeout: 30000 });
/** Wait until the strip holds `n` Lab rows matching `re`. */
const stripRows = (page, re, n) => page.waitForFunction(({ src, n }) => Array.from(document.querySelectorAll('#talk-lines .talk-row')).filter((r) => new RegExp(src).test(r.innerText)).length >= n, { src: re.source, n }, { timeout: 30000 });
const keys = (page) => page.evaluate(async () => (await window.MaxiLab.memories.list()).map((m) => ({ key: m.key, teaching: m.teaching, answered: m.answered, faults: m.faults })));

/** One human Record in the open scene: Record, the hand drags `screen` by dx css px, ~6 s, Stop → the card waits. */
async function recordOnce(page, dx, shotName) {
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().on, null, { timeout: 10000 });
    await page.click('#btn-hand');
    await page.waitForTimeout(300);
    const s0 = (await inv(page)).objects.find((o) => o.name === 'screen');
    const at = await pageXY(page, s0.center.slice(0, 2));
    await page.mouse.move(at.x - 4, at.y); await page.waitForTimeout(150);
    await page.mouse.move(at.x, at.y); await page.waitForTimeout(300);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(at.x + dx * i / 12, at.y); await page.waitForTimeout(80); }
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.click('#btn-hand');
    const s1 = (await inv(page)).objects.find((o) => o.name === 'screen');
    check(JSON.stringify(s0.rect) !== JSON.stringify(s1.rect), 'the hand moved the screen inside the Record', { from: s0.rect, to: s1.rect });
    if (shotName) { await page.screenshot({ path: path.join(OUT, shotName) }); }
    await page.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 300, null, { timeout: 90000 });
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().waiting, null, { timeout: 60000 });
    return { from: s0.rect, to: s1.rect };
}

note('orphan gate before launch', { matches: ownBrowsers() });
let failed = null;
let live = null;
const SCENE = '?scene=dse-tunnel-rebuild&mode=2d';
try {
    // ── session 1 (the shell frame's 1232x720): completion keeps, × removes, Send updates ─────────
    live = await session({ width: 1232, height: 720 });
    let { page } = live;
    await page.goto(URL_ + SCENE, { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);
    await page.waitForTimeout(1500);
    const row1 = await headerOneRow(page);
    check(row1.rows && row1.ids.includes('btn-memories'), '1232x720: the header, Memories included, is one row', row1);
    await page.screenshot({ path: path.join(OUT, '01-scene-1232.png') });

    const r1 = await recordOnce(page, 40, null);
    await stripRows(page, /kept in Your memories \(this browser only\): dse-tunnel-rebuild#2d@/, 1);
    const afterStop = await keys(page);
    note('Stop → kept at completion, no button', afterStop);
    check(afterStop.length === 1 && afterStop[0].teaching === null && (await page.evaluate(() => window.__asks.length)) === 0, 'a completed Record is kept at Stop (no words yet), Maxi asked nothing', afterStop);
    check(await page.evaluate(() => !document.getElementById('demo-save')), 'the card has no Save button');
    await page.screenshot({ path: path.join(OUT, '02-kept-at-completion.png') });
    await page.click('#demo-close');
    await stripRows(page, /removed from Your memories: dse-tunnel-rebuild#2d@/, 1);
    const afterClose = await keys(page);
    note('× → removed', { afterClose, r1 });
    check(afterClose.length === 0, 'the card\'s × removes the memory its completion kept, said on the strip', afterClose);
    await page.screenshot({ path: path.join(OUT, '03-closed-removed.png') });

    const r2 = await recordOnce(page, 48, '04-recording-after-drag.png');
    await stripRows(page, /kept in Your memories \(this browser only\)/, 2);
    const waitRefusal = await page.evaluate(async () => { const k = (await window.MaxiLab.memories.list())[0].key; try { await window.MaxiLab.memories.reload(k); return null; } catch (e) { return e.message; } });
    note('Reload while the card waits', waitRefusal);
    check(/a demonstration waits on the card — Send it to Maxi or close the card \(×\) first; Reload would cover it\. Nothing was reloaded\./.test(waitRefusal || '') && await page.evaluate(() => window.MaxiLab.recorder().state().waiting), 'Reload while a demonstration waits is refused by name; it still waits', waitRefusal);
    await page.click('#demo-teach-text');
    await page.keyboard.type(WORDS);
    await page.screenshot({ path: path.join(OUT, '05-card-typed.png') });
    await page.click('#demo-send');
    await stripHas(page, /updated your memory dse-tunnel-rebuild#2d@\S+ with your words and Maxi's answer/);
    const sent = await page.evaluate(() => { const a = window.__asks[0]; return { user_input: a.params.user_input, media: a.params.media.map((m) => ({ label: m.label, data: m.data })) }; });
    sent.media.forEach((m, i) => fs.writeFileSync(path.join(OUT, 'recorded-clip-' + (i + 1) + '.mp4'), Buffer.from(m.data, 'base64')));
    const afterSend = await keys(page);
    note('Send → updated', { afterSend, clips: sent.media.map((m) => m.label) });
    check(afterSend.length === 1 && afterSend[0].teaching === WORDS && /look-stub answer 1/.test(afterSend[0].answered || ''), 'Send to Maxi updates the memory with the words and his answer', afterSend);
    const lastYou = await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('#talk-lines .talk-user')); return rows[rows.length - 1].innerText; });
    check(lastYou.includes(WORDS), 'the strip\'s last You row is the demonstration (the memory lines are Lab rows)', lastYou.slice(0, 200));
    await page.screenshot({ path: path.join(OUT, '06-sent-and-updated.png') });

    // Reload during a live Record
    await page.click('#demo-close');
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().on, null, { timeout: 10000 });
    const recRefusal = await page.evaluate(async () => { const k = (await window.MaxiLab.memories.list())[0].key; try { await window.MaxiLab.memories.reload(k); return null; } catch (e) { return e.message; } });
    note('Reload while Record is on', recRefusal);
    check(/Record is on — stop it first; the memory's scene would become a second Record inside the running demonstration\. Nothing was reloaded\./.test(recRefusal || '') && await page.evaluate(() => window.MaxiLab.recorder().recording), 'Reload during a live Record is refused by name; the Record goes on', recRefusal);
    await page.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 260, null, { timeout: 90000 });
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().waiting, null, { timeout: 60000 });
    await stripRows(page, /kept in Your memories \(this browser only\)/, 3);
    await page.click('#demo-close');
    await stripRows(page, /removed from Your memories/, 2);
    check((await keys(page)).length === 1, 'the zero-change Record kept at its Stop is removed by its ×; the sent memory stays');
    check(live.errors.length === 0, 'session 1: no page error', live.errors);
    await live.ctx.close(); live = null;

    // ── session 2: a phone, the pane in the chrome-less frame ─────────────────────────────────
    live = await session({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    page = live.page;
    await page.goto(URL_, { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);
    const rowPhone = await headerOneRow(page);
    check(rowPhone.rows && rowPhone.ids.includes('btn-memories'), '390x844: the header is one row', rowPhone);
    await page.click('#btn-memories');
    await page.waitForFunction(() => document.querySelectorAll('#memories-list .memory').length > 0, null, { timeout: 15000 });
    const fit = await page.evaluate(() => {
        const r = document.getElementById('memories').getBoundingClientRect();
        const rows = Array.from(document.querySelectorAll('#memories-list .memory, #memories-list .memory button')).map((m) => m.getBoundingClientRect());
        return { vw: window.innerWidth, vh: window.innerHeight, pane: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, rows: rows.map((x) => ({ left: x.left, right: x.right })),
            docScrollWidth: document.documentElement.scrollWidth, mobile: window.MaxiLab.mobile() };
    });
    note('phone: Your memories', { fit, pane: await paneText(page) });
    await page.screenshot({ path: path.join(OUT, '07-phone-memories.png') });
    check(fit.mobile && fit.pane.left >= 0 && fit.pane.right <= fit.vw + 0.5 && fit.pane.bottom <= fit.vh + 0.5 && fit.rows.every((x) => x.left >= 0 && x.right <= fit.vw + 0.5) && fit.docScrollWidth <= fit.vw,
        'phone 390x844: the pane, its rows and doors fit the frame', fit);
    await live.ctx.close(); live = null;

    // ── session 3: reload, discuss, a wrong parts.after, a corrupt entry, delete ────────────────
    live = await session({ width: 1232, height: 720 });
    page = live.page;
    await page.goto(URL_, { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);
    await page.waitForTimeout(1000);
    await page.click('#btn-memories');
    await page.waitForFunction(() => document.querySelectorAll('#memories-list .memory').length > 0, null, { timeout: 15000 });
    const listed = await paneText(page);
    note('a new session: Your memories', listed);
    check(/double slit/i.test(listed.list) && listed.list.includes('You taught: ' + WORDS) && /Maxi answered: look-stub answer 1/.test(listed.list) && /Maxi sees one only when you Send or Discuss it/.test(await page.evaluate(() => document.getElementById('memories-title').innerText)),
        'a new browser lists the memory per scene with its date, words and answer, under the true storage line', listed);
    await page.screenshot({ path: path.join(OUT, '08-memories-listed.png') });
    const key = await page.evaluate(() => document.querySelector('#memories-list .memory').dataset.key);
    await page.click('#memories-list .memory .memory-reload');
    await page.waitForFunction(() => /^Your memory/.test(document.getElementById('demo-title').textContent) && !document.getElementById('demo').hidden, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const reloaded = await page.evaluate(async () => {
        const v = document.getElementById('demo-clip');
        const i = await window.MaxiLab.inventory();
        return { title: document.getElementById('demo-title').textContent, playing: !v.paused, t: v.currentTime, scene: window.MaxiLab.state.scene.id, mode: window.MaxiLab.state.scene.mode, screen: i.parts.screen };
    });
    note('Reload', reloaded);
    check(reloaded.scene === 'dse-tunnel-rebuild' && reloaded.mode === '2d' && JSON.stringify(reloaded.screen[1].rect) === JSON.stringify(r2.to), 'Reload opens the scene with the screen at parts.after', { reloaded, after: r2.to });
    check(reloaded.playing && reloaded.t > 0, 'Reload plays the clip on the card', reloaded);
    await page.screenshot({ path: path.join(OUT, '09-reloaded-at-parts-after.png') });
    await page.click('#memories-list .memory .memory-discuss');
    await page.fill('#memories-list .memory form input', QUESTION);
    await page.click('#memories-list .memory form button[type=submit]');
    await page.waitForFunction(() => window.__asks.length === 1 && !document.querySelector('#talk-lines .talk-pending'), null, { timeout: 30000 });
    const discussed = await page.evaluate(() => { const a = window.__asks[0].params; return { user_input: a.user_input, kbs: a.knowledgebase_names, media: a.media.map((m) => ({ label: m.label, mime_type: m.mime_type, data: m.data })), strip: document.getElementById('talk-lines').innerText }; });
    fs.writeFileSync(path.join(OUT, 'discussed-clip.mp4'), Buffer.from(discussed.media[0].data, 'base64'));
    fs.writeFileSync(path.join(OUT, 'discuss-user-input.txt'), discussed.user_input);
    note('Discuss → the ask', { user_input: discussed.user_input, kbs: discussed.kbs, media: discussed.media.map((m) => m.label) });
    check(discussed.user_input.startsWith(LOCAL_MEMORY_HEAD) && discussed.user_input.includes(TEACHING_HEAD + '\n' + WORDS) && discussed.user_input.includes(DISCUSS_HEAD + '\n' + QUESTION) &&
        /move \(human\) screen: rect/.test(discussed.user_input) && /parts before → after:\nscreen: /.test(discussed.user_input) && discussed.media.length === 1,
        'Discuss asks the question with the memory\'s facts (words, change row, parts diff) and its clip', discussed.user_input);
    check(fs.readFileSync(path.join(OUT, 'discussed-clip.mp4')).equals(fs.readFileSync(path.join(OUT, 'recorded-clip-1.mp4'))), 'the discussed clip is the recorded clip, byte for byte');
    check(discussed.strip.includes(QUESTION) && /look-stub answer 1: you asked about your kept demonstration/.test(discussed.strip), 'the strip shows the question and Maxi\'s answer');
    await page.screenshot({ path: path.join(OUT, '10-discussed.png') });

    // two entries planted in the browser's own store: a well-formed but wrong parts.after.json, and a prompt as the words
    const planted = await page.evaluate(async ({ db, store, key }) => {
        const open = () => new Promise((res, rej) => { const r = indexedDB.open(db); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const d = await open();
        const get = await new Promise((res, rej) => { const r = d.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const put = (e) => new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(e); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
        const wrongAfter = Object.assign({}, get.records[0].files);
        const pa = JSON.parse(wrongAfter['parts.after.json']); pa.screen[1].rect[0] += 7; wrongAfter['parts.after.json'] = JSON.stringify(pa, null, 2);
        await put({ key: get.key, savedAt: get.savedAt, records: [{ name: 'record-01', files: wrongAfter }] });
        const corrupt = Object.assign({}, get.records[0].files);
        const lab = JSON.parse(corrupt['lab.json']); lab.teaching = 'What are you teaching Maxi?'; corrupt['lab.json'] = JSON.stringify(lab, null, 2);
        await put({ key: 'dse-tunnel-rebuild#2d@1-2', savedAt: '2026-10-19T09:00:00.000Z', records: [{ name: 'record-01', files: corrupt }] });
        d.close();
        return { good: get, corruptKey: 'dse-tunnel-rebuild#2d@1-2' };
    }, { db: DB_NAME, store: STORE, key: key });
    await page.click('#demo-close');
    const wrong = await page.evaluate(async (k) => { try { await window.MaxiLab.memories.reload(k); return null; } catch (e) { return e.message; } }, key);
    note('a wrong parts.after.json', wrong);
    check(new RegExp(key.replace(/[#@.-]/g, '\\$&') + ' reloaded, but the scene holds parts .* not the memory\'s parts\\.after\\.json').test(wrong || ''), 'Reload refuses a scene that does not hold parts.after, by name', wrong);
    await page.screenshot({ path: path.join(OUT, '11-wrong-parts-after-refused.png') });
    await page.evaluate(() => window.MaxiLab.memories.render());
    const corrupt = await paneText(page);
    const refusedLoad = await page.evaluate(async (k) => { try { await window.MaxiLab.memories.reload(k); return null; } catch (e) { return e.message; } }, planted.corruptKey);
    note('a corrupt entry', { pane: corrupt.list, reload: refusedLoad });
    check(/Refused \(not a complete Record\)/i.test(corrupt.list) && /lab\.json teaching is the card's prompt/.test(corrupt.list), 'the corrupt entry is listed refused, by name', corrupt.list);
    check(/the memory "dse-tunnel-rebuild#2d@1-2" is refused — it is not a complete Record/.test(refusedLoad || ''), 'opening it is refused by name', refusedLoad);
    await page.screenshot({ path: path.join(OUT, '12-corrupt-refused.png') });

    const before = (await keys(page)).map((m) => m.key);
    await page.click('#memories-list .memory[data-key="' + key + '"] .memory-delete');
    await page.waitForFunction((k) => !document.querySelector('#memories-list .memory[data-key="' + k + '"]'), key, { timeout: 10000 });
    await page.click('#memories-list .memory[data-key="' + planted.corruptKey + '"] .memory-delete');
    await page.waitForFunction(() => !document.querySelector('#memories-list .memory'), null, { timeout: 10000 });
    const after = (await keys(page)).map((m) => m.key);
    note('Delete', { before, after, status: (await paneText(page)).status });
    check(before.length === 2 && after.length === 0, 'Delete removes each memory, the refused one too', { before, after });
    await page.screenshot({ path: path.join(OUT, '13-deleted.png') });
    check(live.errors.length === 0, 'session 3: no page error', live.errors);
    await live.ctx.close(); live = null;

    // ── session 4: a new browser lists nothing ─────────────────────────────────────────────────
    live = await session({ width: 1232, height: 720 });
    page = live.page;
    await page.goto(URL_, { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);
    check((await keys(page)).length === 0, 'a new browser lists nothing after Delete');
    await live.ctx.close(); live = null;

    if (FFMPEG) {
        for (const [i, t] of [[1, 0.5], [2, 3], [3, 5.5]]) {
            execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(t), '-i', path.join(OUT, 'recorded-clip-1.mp4'), '-frames:v', '1', path.join(OUT, 'clip-still-' + i + '.png')]);
        }
        execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', path.join(OUT, 'clip-still-1.png'), '-i', path.join(OUT, 'clip-still-2.png'), '-i', path.join(OUT, 'clip-still-3.png'), '-filter_complex', 'hstack=3', path.join(OUT, 'clip-stills-strip.png')]);
        note('stills sampled from the recorded clip', ['clip-still-1.png', 'clip-still-2.png', 'clip-still-3.png', 'clip-stills-strip.png']);
    }
} catch (err) {
    failed = err;
    note('FAILED', { error: String(err && err.stack || err) });
    if (live) { try { await live.page.screenshot({ path: path.join(OUT, 'zz-failure.png') }); } catch (e) { /* the failure is already named */ } }
} finally {
    if (live) { await live.ctx.close(); }
    fs.rmSync(PROFILE, { recursive: true, force: true });
    note('orphan gate after close', { matches: ownBrowsers() });
}
if (failed) { process.exitCode = 1; } else { note('LOOK PASSED'); }
