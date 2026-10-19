#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab-look.mjs — LOOK at Maxi's Lab through a real browser and drive its hands the way the shell
 * would (window.DeSciX_Actions[hand](args)), with the shell's command door stubbed so every clip Maxi
 * "sees" lands in a file we can watch.
 *
 *   node scripts/look/maxi-lab-look.mjs --url http://127.0.0.1:5540/site/app.html \
 *        --playwright /path/to/node_modules --out .scratch/look [--ffmpeg /path/to/ffmpeg]
 *
 * Browser discipline: launched through Playwright's handle and closed by that handle; the orphan gate
 * counts chrome-headless-shell processes descended from THIS process only (peers run their own).
 * Nothing here is a hand of Maxi's: the stills it takes are the verifier's eyes (FrqtlVision.getStill
 * on the scene's runner), the clips are Maxi's (the hands' own MP4s, saved from the stub ingress).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { sceneFile } from '../frqtl-web-pin.mjs';

/** Where a registry row's sketch is served, relative to the site root. */
const servedRel = (scenesRel) => sceneFile(scenesRel).slice('site/'.length);

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/look'));
const FFMPEG = argOf('--ffmpeg', null);
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire(path.join(PW_DIR, 'noop.js'));
const { chromium } = require('playwright');

const log = [];
function note(line, data) {
    const row = { t: new Date().toISOString(), line: line };
    if (data !== undefined) { row.data = data; }
    log.push(row);
    console.log('[look] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-log.json'), JSON.stringify(log, null, 2));
}

function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: Number(p[0]), ppid: Number(p[1]), comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]);
    let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    const all = rows.filter((r) => /chrome-headless-shell|ms-playwright/.test(r.comm));
    return { own: all.filter((r) => mine.has(r.pid)).map((r) => r.pid), total: all.length };
}

function saveB64(name, b64) { const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; }
function saveDataUrl(name, dataUrl) { return saveB64(name, dataUrl.slice(dataUrl.indexOf(',') + 1)); }
function isMp4(file) { const b = fs.readFileSync(file).subarray(4, 8).toString('ascii'); return b === 'ftyp'; }
// Decode a clip the way the END USER's browser does: a <video> in the page, seeked to a few moments,
// each drawn to a canvas and saved as PNG (Chromium's own H.264 decoder; nothing re-encodes).
async function framesFromClip(page, b64, name, count) {
    const out = await page.evaluate(async ({ b64, count }) => {
        const bin = atob(b64); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
        const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
        await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video element refused the clip: ' + (v.error && v.error.message))); });
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        const g = c.getContext('2d'); const frames = [];
        for (let i = 0; i < count; i++) {
            const t = (v.duration * i) / Math.max(1, count - 1);
            await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(t, Math.max(0, v.duration - 0.01)); });
            g.drawImage(v, 0, 0); frames.push({ t: v.currentTime, png: c.toDataURL('image/png') });
        }
        URL.revokeObjectURL(url);
        return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, frames };
    }, { b64, count });
    const files = out.frames.map((f, i) => saveDataUrl(name + '-t' + f.t.toFixed(2) + 's-' + i + '.png', f.png));
    note('decoded in-browser ' + name, { duration: out.duration, width: out.width, height: out.height, frames: files });
    if (FFMPEG) {
        try { execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(OUT, name + '.mp4'), '-vf', "select='not(mod(n\\,5))',scale=300:-1,tile=4x3", '-frames:v', '1', path.join(OUT, name + '-sheet.png')]); }
        catch (e) { note('ffmpeg could not read ' + name + ' (a minimal build is not evidence about the file)', String(e.message).split('\n')[0]); }
    }
    return out;
}

// The shell stub: only the TOP window owns the bus (DeSciXAppSDK.js resolves a framed page up to it).
const STUB = () => {
    if (window.top !== window) { return; }
    window.__media = [];
    window.DeSciX = {
        bridge: { version: 'look-stub', ready: true, EVENT: 'descix:bridge-ready', members: () => ['call', 'view'] },
        // At hop 0 DeSciXAppSDK.js hands back the OWNER bus itself, so the stub carries the owner's ready().
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
        catch (e) { return { ok: false, error: String((e && e.name) || 'Error') + ': ' + String((e && e.message) || e) }; }
    }, { op, args });
}
async function must(page, op, args) {
    const r = await hand(page, op, args);
    if (!r.ok) { throw new Error(op + ' failed: ' + r.error); }
    note(op + ' ok', summarize(r.result));
    return r.result;
}
function summarize(r) {
    if (r && Array.isArray(r.objects)) { return Object.assign({}, r, { objects: r.objects.map((o) => (typeof o === 'string' ? o : o.name + ':' + (o.rect || o.center || o.position))) }); }
    return r;
}
async function takeMedia(page) {
    return page.evaluate(() => { const m = window.__media.splice(0); return m; });
}
async function verifierStill(page, name) {
    const dataUrl = await page.evaluate(() => {
        const ms = document.getElementById('scene-frame').contentWindow.MaxiScene;
        return ms.FrqtlVision.attach(ms.runner).getStill().then((still) => ms.FrqtlVision.toDataURL(still));
    });
    return saveDataUrl(name, dataUrl);
}

const gate0 = ownBrowserPids();
note('orphan gate before launch', gate0);
const browser = await chromium.launch({ headless: true });
note('browser launched', ownBrowserPids());
let failed = null;
try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(STUB);
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text()); } });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

    // 1. Open: the lab must land on its opening scene, the 3D double slit, with the hands registered.
    await page.goto(URL_, { waitUntil: 'load' });
    const opening = await page.evaluate(() => window.MaxiLab.ready.then((r) => r));
    note('opened on', summarize(opening));
    const host = await page.evaluate(() => window.MaxiLab.state.host);
    note('host mode', host);
    await page.screenshot({ path: path.join(OUT, '01-opening.png') });
    const inv0 = await must(page, 'inventory', {});
    if (inv0.id !== 'dse-tunnel-rebuild' || inv0.mode !== '3d' || inv0.renderer !== 'three' || inv0.canvas.length !== 3) { throw new Error('the opening scene is not the 3D double slit: ' + JSON.stringify({ id: inv0.id, mode: inv0.mode, renderer: inv0.renderer, canvas: inv0.canvas })); }

    // 2. sceneSource equals the served sketch bytes.
    const src = await must(page, 'sceneSource', { id: 'cl1a-mirror' });
    const servedUrl = new URL(servedRel(src.path), URL_).href;
    const served = await (await fetch(servedUrl)).text();
    if (served !== src.source) { throw new Error('sceneSource differs from the served bytes at ' + servedUrl); }
    note('sceneSource == served bytes', { path: src.path, bytes: served.length });

    // 3. openSketch fails loud: the retired dual-mode form, a sketch importing the retired vendored path, and a syntax error.
    const r1 = await hand(page, 'openSketch', { source: "function buildExperiment(exp) { exp.createCanvas(300, 200, { dimension: 0 }); setupDoubleSlit(exp.universe, {}); }\nwindow.buildExperiment = buildExperiment;" });
    note('openSketch dual-mode (no default export)', r1);
    if (r1.ok) { throw new Error('openSketch accepted a dual-mode sketch with no default export'); }
    const r1b = await hand(page, 'openSketch', { source: "import { bootRecipe } from '../vendor/frqtl-sdk/0.5.1/dist/esm/index.js';\nexport default function buildExperiment(exp) { exp.createCanvas(300, 200, {}); }\n" });
    note('openSketch importing the retired vendored path', r1b);
    if (r1b.ok || !/frqtl-sdk\/0\.5\.1/.test(r1b.error)) { throw new Error('openSketch did not refuse the retired vendored path by name'); }
    const r2 = await hand(page, 'openSketch', { source: 'export default function buildExperiment(exp) { exp.createCanvas(300, 200, {}) ' });
    note('openSketch syntax error', r2);
    if (r2.ok || !/SyntaxError/.test(r2.error)) { throw new Error('openSketch did not relay the SyntaxError verbatim'); }

    // 4. THE 2D LOOP ON THE MIRROR: drag the mirror while filming; the beam's reflection must move.
    await must(page, 'loadScene', { id: 'cl1a-mirror' });
    await page.waitForTimeout(1500);
    const before = await must(page, 'inventory', {});
    await verifierStill(page, '02-mirror-before.png');
    const drag = await must(page, 'dragTo', { name: 'mirror', to: [300, 200], ticks: 100 });
    const dragMedia = await takeMedia(page);
    if (dragMedia.length !== 1 || dragMedia[0].mime_type !== 'video/mp4') { throw new Error('dragTo did not ferry one video/mp4 — got ' + JSON.stringify(dragMedia.map((m) => m.mime_type))); }
    const dragMp4 = saveB64('03-mirror-drag.mp4', dragMedia[0].data);
    note('dragTo clip', { file: dragMp4, bytes: fs.statSync(dragMp4).size, isMp4: isMp4(dragMp4), label: dragMedia[0].label, note: dragMedia[0].note, frames: drag.frames, seconds: drag.seconds, from: drag.from, to: drag.to });
    await framesFromClip(page, dragMedia[0].data, '03-mirror-drag', 6);
    const after = await must(page, 'inventory', {});
    const mBefore = before.objects.find((o) => o.name === 'mirror'), mAfter = after.objects.find((o) => o.name === 'mirror');
    if (JSON.stringify(mBefore.rect) === JSON.stringify(mAfter.rect)) { throw new Error('the mirror did not move'); }
    note('mirror moved', { before: mBefore.rect, after: mAfter.rect });
    await verifierStill(page, '04-mirror-after.png');
    await page.screenshot({ path: path.join(OUT, '05-lab-mirror-after.png') });
    await must(page, 'revert', {});
    await must(page, 'release', {});

    // 5. see: a 5-second clip with the defaults.
    const see = await must(page, 'see', {});
    const seeMedia = await takeMedia(page);
    const seeMp4 = saveB64('06-see.mp4', seeMedia[0].data);
    note('see clip', { file: seeMp4, bytes: fs.statSync(seeMp4).size, isMp4: isMp4(seeMp4), frames: see.frames, seconds: see.seconds, firstTick: see.firstTick, lastTick: see.lastTick });
    await framesFromClip(page, seeMedia[0].data, '06-see', 4);

    // 6. record: a 2D pan/zoom flight through CameraPath (MEASUREMENT: does the 2D camera fly?).
    const flight = await hand(page, 'record', { waypoints: [
        { atTick: 0, pose: { target: { x: 300, y: 200 }, distance: 400 } },
        { atTick: 200, pose: { target: { x: 360, y: 200 }, distance: 160 } },
        { atTick: 400, pose: { target: { x: 300, y: 200 }, distance: 400 } }
    ] });
    note('record (2D flyby) result', flight.ok ? Object.assign({}, flight.result) : flight);
    if (flight.ok) {
        const m = await takeMedia(page);
        const f = saveB64('07-flyby-2d.mp4', m[0].data);
        note('flyby clip', { file: f, bytes: fs.statSync(f).size, isMp4: isMp4(f), frames: flight.result.frames, seconds: flight.result.seconds, poses: flight.result.poses });
        await framesFromClip(page, m[0].data, '07-flyby-2d', 6);
    }

    // 6b. THE 3D MIRROR: see, then drag the mirror while filming (the 3D look of the switch).
    await must(page, 'loadScene', { id: 'cl1a-mirror-3d' });
    await page.waitForTimeout(1500);
    const inv3 = await must(page, 'inventory', {});
    if (inv3.renderer !== 'three') { throw new Error('cl1a-mirror-3d did not boot three: ' + inv3.renderer); }
    await verifierStill(page, '07b-mirror3d-before.png');
    const see3 = await must(page, 'see', {});
    const see3Media = await takeMedia(page);
    const see3Mp4 = saveB64('07c-mirror3d-see.mp4', see3Media[0].data);
    note('3D see clip', { file: see3Mp4, bytes: fs.statSync(see3Mp4).size, isMp4: isMp4(see3Mp4), frames: see3.frames, seconds: see3.seconds });
    await framesFromClip(page, see3Media[0].data, '07c-mirror3d-see', 4);
    const m3 = inv3.objects.find((o) => o.name === 'mirror');
    const drag3 = await must(page, 'dragTo', { name: 'mirror', to: [m3.center[0] - 60, m3.center[1]], ticks: 100 });
    const drag3Media = await takeMedia(page);
    const drag3Mp4 = saveB64('07d-mirror3d-drag.mp4', drag3Media[0].data);
    note('3D dragTo clip', { file: drag3Mp4, bytes: fs.statSync(drag3Mp4).size, isMp4: isMp4(drag3Mp4), frames: drag3.frames, seconds: drag3.seconds, from: drag3.from, to: drag3.to });
    await framesFromClip(page, drag3Media[0].data, '07d-mirror3d-drag', 6);
    const inv3b = await must(page, 'inventory', {});
    note('3D mirror moved', { before: m3.center, after: inv3b.objects.find((o) => o.name === 'mirror').center });
    await page.screenshot({ path: path.join(OUT, '07e-lab-mirror3d.png') });
    await must(page, 'release', {});

    // 7. The opening scene (DSE 2D): drag the detector screen while filming.
    await must(page, 'loadScene', { id: 'dse-tunnel-rebuild', mode: '2d' });
    await page.waitForTimeout(2500);
    await verifierStill(page, '08-dse2d-before.png');
    await must(page, 'grab', { name: 'screen' });
    const dse = await must(page, 'dragTo', { to: [480, 200], ticks: 120 });
    const dseMedia = await takeMedia(page);
    const dseMp4 = saveB64('09-dse2d-drag-screen.mp4', dseMedia[0].data);
    note('dse screen drag clip', { file: dseMp4, bytes: fs.statSync(dseMp4).size, isMp4: isMp4(dseMp4), frames: dse.frames, from: dse.from, to: dse.to });
    await framesFromClip(page, dseMedia[0].data, '09-dse2d-drag-screen', 6);
    await verifierStill(page, '10-dse2d-after.png');
    await must(page, 'revert', {});
    await page.screenshot({ path: path.join(OUT, '11-lab-dse2d.png') });

    // 8. 480x480, 100 frames: the clip-size measurement on a sketch Maxi could write.
    const sk = await must(page, 'openSketch', { source: (await page.evaluate(() => window.MaxiLab.hands.openSketch.example.source)) });
    note('openSketch 480x480', summarize(sk));
    await page.waitForTimeout(1000);
    const big = await must(page, 'see', { everyTicks: 5, stopAt: { ticks: 495 }, maxFrames: 100, fps: 10 });
    const bigMedia = await takeMedia(page);
    const bigMp4 = saveB64('12-see-480x480-100f.mp4', bigMedia[0].data);
    note('480x480 100-frame clip', { file: bigMp4, bytes: fs.statSync(bigMp4).size, base64Length: bigMedia[0].base64Length, isMp4: isMp4(bigMp4), frames: big.frames, seconds: big.seconds });
    await framesFromClip(page, bigMedia[0].data, '12-see-480x480-100f', 4);
    await verifierStill(page, '13-sketch-480.png');

    // 9. showMemory: ferry a served clip (fixture = the see clip, served under site/memories/).
    const memDir = path.resolve(argOf('--site', 'site'), 'memories', 'look-fixture');
    fs.mkdirSync(memDir, { recursive: true });
    fs.copyFileSync(seeMp4, path.join(memDir, 'clip.mp4'));
    try {
        const mem = await hand(page, 'showMemory', { id: 'look-fixture' });
        note('showMemory', mem);
        const mm = await takeMedia(page);
        note('showMemory media', mm.map((m) => ({ mime: m.mime_type, label: m.label, base64Length: m.base64Length })));
    } finally { fs.rmSync(memDir, { recursive: true, force: true }); }   // only the fixture folder: site/memories/ holds the published clips

    // 10. Every EXHIBITS id boots and inventories (3D included — loadable, not tonight's proof).
    const exhibits = await page.evaluate(() => window.MaxiLab.exhibits());
    for (const ex of exhibits) {
        const t0 = Date.now();
        const r = await hand(page, 'loadScene', { id: ex.id, mode: ex.mode || undefined });
        if (!r.ok) { note('EXHIBIT FAILED ' + ex.id, r); continue; }
        const inv = await must(page, 'inventory', {});
        note('exhibit ' + ex.id + (ex.mode ? '#' + ex.mode : ''), { ms: Date.now() - t0, renderer: inv.renderer, objects: inv.objects.map((o) => o.name) });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, '20-exhibit-' + ex.id + '.png') });
    }

    // 11. Negative control: a second boot in one scene document is refused by name.
    const second = await page.evaluate(() => document.getElementById('scene-frame').contentWindow.MaxiScene.boot({ label: 'x', files: { 'frqtl.json': JSON.stringify({ name: 'x', kind: 'scene', entry: 'sketch.js' }), 'sketch.js': 'export default function buildExperiment(exp){}' }, renderState: null }).then(() => 'RESOLVED', (e) => String(e.message)));
    note('second boot in one document', second);

    note('console errors during the run', consoleErrors);

    // 11b. The front page (static: no scene boots there) and its way into the lab.
    const front = await ctx.newPage();
    await front.goto(new URL('index.html', URL_).href, { waitUntil: 'load' });
    await front.screenshot({ path: path.join(OUT, '25-front-page.png') });
    note('front page', { title: await front.title(), labLink: await front.evaluate(() => !!document.querySelector('a[href="app.html"]')) });
    await front.close();

    // 12. Standalone (no shell): hands register; see throws naming the ingress; inventory works.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();
    await page2.goto(URL_ + '?scene=cl1a-mirror', { waitUntil: 'load' });
    await page2.evaluate(() => window.MaxiLab.ready);
    note('standalone host', await page2.evaluate(() => window.MaxiLab.state.host));
    note('standalone inventory', summarize(await must(page2, 'inventory', {})));
    note('standalone see', await hand(page2, 'see', {}));
    await page2.screenshot({ path: path.join(OUT, '30-standalone.png') });
    await ctx2.close();
    await ctx.close();
} catch (e) {
    failed = e;
    note('FAILED', String(e && e.stack || e));
} finally {
    await browser.close();
    const gate1 = ownBrowserPids();
    note('orphan gate after close', gate1);
    if (gate1.own.length) { note('ORPHANS IN OWN TREE', gate1.own); process.exitCode = 3; }
}
if (failed) { process.exitCode = 1; }
note('done', { out: OUT });
