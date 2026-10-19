#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-restart-look.mjs — LOOK at the lab's restart: cl1a-mirror runs a while, the `restart` hand runs, and the next
 * hands meet the rebuilt world — inventory at a low tick, then `see` films 5 s of the scene from near tick 0 (the beam
 * leaving the source again), sampled to a sheet by ffmpeg.
 *
 *   node scripts/look/maxi-restart-look.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <absolute node_modules> --out .scratch/look-restart --ffmpeg <ffmpeg>
 *
 * Same discipline as maxi-hand-tool-look.mjs: shell bus stubbed in the top window, the browser closed by its handle,
 * the orphan gate counting only chrome-headless-shell processes descended from THIS process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/look-restart'));
const FFMPEG = argOf('--ffmpeg', null);
if (!URL_ || !PW_DIR || !FFMPEG) { throw new Error('--url, --playwright and --ffmpeg are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-restart] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-restart-log.json'), JSON.stringify(log, null, 2));
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
            window.__asks = window.__asks || [];
            window.__asks.push({ command: command });
            (params.media || []).forEach((m) => window.__media.push({ mime_type: m.mime_type, data: m.data }));
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

note('orphan gate before launch', { own: ownBrowserPids() });
const browser = await chromium.launch({ headless: true });
let failed = null;
try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(STUB);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') { pageErrors.push('console: ' + m.text()); } });
    await page.goto(URL_ + '?scene=cl1a-mirror', { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);
    note('sdk', await page.evaluate(() => window.MaxiLab.sdkVersion));
    await page.waitForFunction(() => window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 300, null, { timeout: 30000 });
    note('before restart', { tick: (await hand(page, 'inventory', {})).result.tick });
    const r = await hand(page, 'restart', {});
    note('restart', r.ok ? { ok: true, tick: r.result.tick } : r);
    const after = await hand(page, 'inventory', {});
    note('inventory right after restart', after.ok ? { tick: after.result.tick, objects: after.result.objects.map((o) => o.name) } : after);
    note('hand + record after restart', await page.evaluate(() => ({ hand: !!window.MaxiLab.hand(), record: window.MaxiLab.recorder() && window.MaxiLab.recorder().state().text, status: document.getElementById('status').textContent, error: document.getElementById('error').hidden ? null : document.getElementById('error').textContent })));
    const see = await hand(page, 'see', {});
    note('see after restart', see.ok ? { firstTick: see.result.firstTick, lastTick: see.result.lastTick, frames: see.result.frames, seconds: see.result.seconds } : see);
    const media = await page.evaluate(() => window.__media.slice(-1)[0]);
    if (!media) { throw new Error('no clip reached the stubbed door'); }
    const clip = path.join(OUT, 'restart-see.mp4');
    fs.writeFileSync(clip, Buffer.from(media.data, 'base64'));
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', clip, '-vf', 'fps=1,scale=300:-1,tile=6x1', '-frames:v', '1', path.join(OUT, 'restart-see-sheet.png')]);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '0.5', '-i', clip, '-frames:v', '1', path.join(OUT, 'restart-see-t0.5s.png')]);
    note('clip', { file: clip, bytes: fs.statSync(clip).size, sheet: path.join(OUT, 'restart-see-sheet.png') });
    note('page errors', pageErrors);
    if (pageErrors.length || !r.ok || !after.ok || !see.ok) { process.exitCode = 1; }
} catch (e) {
    failed = e; note('FAILED', String(e && e.stack || e)); process.exitCode = 1;
} finally {
    await browser.close();
    const own = ownBrowserPids();
    note('orphan gate after close', { own });
    if (own.length) { process.exitCode = 3; }
}
