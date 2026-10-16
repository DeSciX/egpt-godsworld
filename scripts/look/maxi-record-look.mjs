#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-record-look.mjs — LOOK at Record: on cl1a-mirror, Record on, a human hand drag of the mirror,
 * ~6 s of clip, Record off → ONE demonstration {clips, changes, sketchDiff:null} ferried to the
 * (stubbed) question door with the change list in its note, and the card shown to the human.
 *
 *   node scripts/look/maxi-record-look.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <node_modules> --out .scratch/look-record [--ffprobe /opt/homebrew/bin/ffprobe]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/look-record'));
const FFPROBE = argOf('--ffprobe', null);
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(PW_DIR, 'noop.js'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-record] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-record-log.json'), JSON.stringify(log, null, 2));
}
function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: +p[0], ppid: +p[1], comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]); let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    return rows.filter((r) => /chrome-headless-shell/.test(r.comm) && mine.has(r.pid)).map((r) => r.pid);
}
function probe(file) {
    if (!FFPROBE) { return null; }
    const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames,duration', '-of', 'json', file]).toString();
    return JSON.parse(out).streams[0];
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
function objOf(inventory, name) { const o = inventory.objects.find((r) => r.name === name); if (!o) { throw new Error('no "' + name + '"'); } return o; }
async function ui(page) {
    return page.evaluate(() => ({
        hand: document.getElementById('btn-hand').getAttribute('aria-pressed'),
        record: document.getElementById('btn-record').getAttribute('aria-pressed'),
        status: document.getElementById('status').textContent,
        error: document.getElementById('error').hidden ? null : document.getElementById('error').textContent,
        rec: window.MaxiLab.recorder() && window.MaxiLab.recorder().state(),
        card: { hidden: document.getElementById('demo').hidden, title: document.getElementById('demo-title').textContent, lines: document.getElementById('demo-changes').textContent }
    }));
}
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

note('orphan gate before launch', { own: ownBrowserPids() });
const browser = await chromium.launch({ headless: true });
let failed = null;
try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(STUB);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(URL_, { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);
    const ld = await hand(page, 'loadScene', { id: 'cl1a-mirror' });
    if (!ld.ok) { throw new Error(ld.error); }
    await page.waitForTimeout(1500);

    await page.click('#btn-hand');
    await page.click('#btn-record');
    await page.waitForTimeout(300);
    const on = await ui(page);
    note('Record ON (hand on)', on);
    if (on.record !== 'true' || !on.rec.on) { throw new Error('record did not start: ' + JSON.stringify(on)); }

    // The human drags the mirror 100 css px left while recording.
    const before = objOf(await inv(page), 'mirror');
    const c0 = before.center.slice(0, 2);
    const at = await pageXY(page, c0);
    await page.mouse.move(at.x, at.y); await page.waitForTimeout(300);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(at.x - 10 * i, at.y); await page.waitForTimeout(80); }
    await page.mouse.up();
    await page.screenshot({ path: path.join(OUT, '01-recording-after-drag.png') });
    note('dragged while recording', { before: before.rect, after: objOf(await inv(page), 'mirror').rect, ui: await ui(page) });

    // Keep filming until ~6 s of clip (300 ticks at everyTicks 5 / fps 10), then stop.
    await page.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 300, null, { timeout: 60000 });
    note('6 s reached', (await ui(page)).rec);
    await page.click('#btn-record');
    await page.waitForFunction(() => !window.MaxiLab.recorder().state().on, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const off = await ui(page);
    await page.screenshot({ path: path.join(OUT, '02-demonstration-card.png') });
    note('Record OFF → card', off);
    const demo = await page.evaluate(() => window.MaxiLab.recorder().last());
    note('demonstration', { scene: demo.scene, clips: demo.clips, changes: demo.changes, sketchDiff: demo.sketchDiff, sketchDiffReason: demo.sketchDiffReason, asked: demo.asked, interaction_id: demo.interaction_id, answer_excerpt: demo.answer_excerpt });
    const media = await page.evaluate(() => window.__media.splice(0).map((m) => ({ mime_type: m.mime_type, label: m.label, note: m.note, bytes: m.data.length, data: m.data })));
    note('media handed to the question door', media.map((m) => ({ mime_type: m.mime_type, label: m.label, note: m.note, base64Length: m.bytes })));
    if (media.length !== demo.clips.length) { throw new Error('ferried ' + media.length + ' clips for ' + demo.clips.length); }
    if (!demo.changes.length) { throw new Error('the drag was not logged'); }
    if (demo.sketchDiff !== null) { throw new Error('an invented sketch diff'); }
    if (off.card.hidden) { throw new Error('the card is hidden'); }
    media.forEach((m, i) => {
        const file = path.join(OUT, 'demo-segment-' + (i + 1) + '.mp4');
        fs.writeFileSync(file, Buffer.from(m.data, 'base64'));
        note('clip saved', { file: path.basename(file), size: fs.statSync(file).size, ffprobe: probe(file) });
    });
    // A second recording with NO change still carries its clip.
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 10, null, { timeout: 60000 });
    await page.click('#btn-record');
    await page.waitForFunction(() => !window.MaxiLab.recorder().state().on, null, { timeout: 60000 });
    const demo2 = await page.evaluate(() => window.MaxiLab.recorder().last());
    note('zero-change demonstration', { clips: demo2.clips.map((c) => ({ seconds: c.seconds, frames: c.frames })), changes: demo2.changes, ui: (await ui(page)).card });
    if (!demo2.clips.length || demo2.changes.length) { throw new Error('zero-change demonstration wrong'); }
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
