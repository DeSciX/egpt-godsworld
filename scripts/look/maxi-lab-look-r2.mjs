#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab-look-r2.mjs — the revise-round LOOK: picker load failures are painted, the PUBLISHED
 * window.DeSciX_Actions equals HANDS in the live page, and every default seeing hand films 5–10 s.
 *
 *   node scripts/look/maxi-lab-look-r2.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <node_modules> --out .scratch/look-r2 [--ffprobe /opt/homebrew/bin/ffprobe]
 *
 * Same discipline as maxi-lab-look.mjs: shell bus stubbed in the top window, the browser closed by
 * its handle, the orphan gate counting only chrome-headless-shell processes descended from THIS process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { HANDS } from '../../site/app-assets/maxi-hands.js';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/look-r2'));
const FFPROBE = argOf('--ffprobe', null);
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(PW_DIR, 'noop.js'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-r2] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-r2-log.json'), JSON.stringify(log, null, 2));
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
async function clipOf(page, op, args, name) {
    const r = await hand(page, op, args);
    if (!r.ok) { throw new Error(op + ' failed: ' + r.error); }
    const media = await page.evaluate(() => window.__media.splice(0));
    if (media.length !== 1 || media[0].mime_type !== 'video/mp4') { throw new Error(op + ' ferried ' + JSON.stringify(media.map((m) => m.mime_type))); }
    const file = path.join(OUT, name + '.mp4');
    fs.writeFileSync(file, Buffer.from(media[0].data, 'base64'));
    const p = probe(file);
    const frames = await framesFromClip(page, media[0].data, name, 5);
    note(op + ' clip ' + name, { args, result: Object.assign({}, r.result, { from: r.result.from, to: r.result.to }), bytes: fs.statSync(file).size, ffprobe: p, frames });
    return { result: r.result, ffprobe: p };
}
async function framesFromClip(page, b64, name, count) {
    const out = await page.evaluate(async ({ b64, count }) => {
        const bin = atob(b64); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
        const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
        await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video element refused the clip')); });
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        const g = c.getContext('2d'); const frames = [];
        for (let i = 0; i < count; i++) {
            const t = (v.duration * i) / (count - 1);
            await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(t, v.duration - 0.01); });
            g.drawImage(v, 0, 0); frames.push({ t: v.currentTime, png: c.toDataURL('image/png') });
        }
        URL.revokeObjectURL(url);
        return frames;
    }, { b64, count });
    return out.map((f, i) => {
        const file = path.join(OUT, name + '-f' + i + '-t' + f.t.toFixed(1) + 's.png');
        fs.writeFileSync(file, Buffer.from(f.png.slice(f.png.indexOf(',') + 1), 'base64'));
        return path.basename(file);
    });
}
function inBand(name, p) {
    const d = Number(p && p.duration);
    if (!(d >= 5 && d <= 10)) { throw new Error(name + ' ffprobe duration ' + d + ' s is outside 5–10 s'); }
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

    // 1. The PUBLISHED global in the live page equals HANDS.
    const published = await page.evaluate(() => Object.keys(window.DeSciX_Actions).sort());
    const want = Object.keys(HANDS).sort();
    if (JSON.stringify(published) !== JSON.stringify(want)) { throw new Error('published DeSciX_Actions ' + JSON.stringify(published) + ' != HANDS ' + JSON.stringify(want)); }
    note('published window.DeSciX_Actions == HANDS', { count: published.length });

    // 2. 404 on pick: the error is painted and the picker names the scene still running.
    await page.route('**/scenes/mirror.js', (r) => r.fulfill({ status: 404, body: 'gone' }));
    const val = await page.evaluate(() => Array.from(document.getElementById('scene-picker').options).find((o) => o.dataset.id === 'cl1a-mirror').value);
    await page.selectOption('#scene-picker', val);
    await page.waitForFunction(() => !document.getElementById('error').hidden, null, { timeout: 15000 });
    const st = await page.evaluate(() => {
        const sel = document.getElementById('scene-picker');
        return { errorHidden: document.getElementById('error').hidden, errorText: document.getElementById('error').textContent,
            running: window.MaxiLab.state.scene && window.MaxiLab.state.scene.id, pickerValue: sel.value,
            pickerLabel: sel.selectedOptions[0] && sel.selectedOptions[0].textContent };
    });
    await page.screenshot({ path: path.join(OUT, '01-404-on-pick.png') });
    note('404 on pick', st);
    if (st.errorHidden || !/404/.test(st.errorText)) { throw new Error('the 404 was not painted'); }
    if (!st.pickerValue.startsWith(st.running)) { throw new Error('picker names ' + st.pickerValue + ' while ' + st.running + ' runs'); }
    await page.unroute('**/scenes/mirror.js');

    // 3. Default clips on the 2D mirror: see{}, dragTo{name,to}, record{example waypoints}.
    const ok = await hand(page, 'loadScene', { id: 'cl1a-mirror' });
    if (!ok.ok) { throw new Error('loadScene cl1a-mirror: ' + ok.error); }
    note('loaded cl1a-mirror; error pane hidden again', await page.evaluate(() => document.getElementById('error').hidden));
    await page.waitForTimeout(1500);
    const see = await clipOf(page, 'see', {}, '02-see-default');
    inBand('see', see.ffprobe);
    const drag = await clipOf(page, 'dragTo', { name: 'mirror', to: [300, 200] }, '03-dragTo-default-mirror');
    inBand('dragTo', drag.ffprobe);
    await hand(page, 'revert', {}); await hand(page, 'release', {});
    const rec = await clipOf(page, 'record', HANDS.record.example, '04-record-example');
    inBand('record', rec.ffprobe);

    // 4. The opening 2D scene: drag the detector screen with defaults.
    const ld = await hand(page, 'loadScene', { id: 'dse-tunnel-rebuild', mode: '2d' });
    if (!ld.ok) { throw new Error(ld.error); }
    await page.waitForTimeout(2500);
    const dse = await clipOf(page, 'dragTo', { name: 'screen', to: [480, 200] }, '05-dragTo-default-dse-screen');
    inBand('dragTo dse', dse.ffprobe);
    await hand(page, 'revert', {});

    // 5. Out-of-band requests refused before filming.
    note('see 0.3 s refused', await hand(page, 'see', { stopAt: { ticks: 10 } }));
    note('dragTo 2.1 s refused', await hand(page, 'dragTo', { name: 'screen', to: [480, 200], ticks: 100, settle: 0 }));
    note('record 2 s refused', await hand(page, 'record', { waypoints: [{ atTick: 0, pose: { distance: 400 } }, { atTick: 100, pose: { distance: 200 } }] }));
    note('media ferried by refused calls', await page.evaluate(() => window.__media.length));
    await page.screenshot({ path: path.join(OUT, '06-lab-end.png') });
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
