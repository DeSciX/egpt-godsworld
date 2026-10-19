#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-sketch-look.mjs — LOOK at the sketch doors on the vendored package: every hand ends written into the sketch
 * (exp.toSketch), setDeclared re-runs the world, and the Record's clock climbs across it.
 *   cl1a-mirror: inventory (the parts block and the project) → moveObject mirror (the text holds the new rect) →
 *   setDeclared mirror {orientationDeg: 30} (the block says 30; the clock climbs) → see (filmed after the re-run, ticks
 *   on the clock) → dragTo source (the emitter's centre in the block); cl1d-mirror-route: a hand on its code-declared
 *   emitter is refused by name and nothing moves.
 *
 *   node scripts/look/maxi-sketch-look.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <node_modules> --out .scratch/look-sketch --ffmpeg <ffmpeg>
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
const OUT = path.resolve(argOf('--out', '.scratch/look-sketch'));
const FFMPEG = argOf('--ffmpeg', null);
if (!URL_ || !PW_DIR || !FFMPEG) { throw new Error('--url, --playwright and --ffmpeg are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'))('playwright');

const log = [];
const faults = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-sketch] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-sketch-log.json'), JSON.stringify({ log, faults }, null, 2));
}
function expect(ok, what) { if (!ok) { faults.push(what); note('FAULT', what); } }
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
function saveClip(media, name) {
    const clip = path.join(OUT, name + '.mp4');
    fs.writeFileSync(clip, Buffer.from(media.data, 'base64'));
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', clip, '-vf', 'fps=1,scale=300:-1,tile=6x1', '-frames:v', '1', path.join(OUT, name + '-sheet.png')]);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-sseof', '-0.3', '-i', clip, '-frames:v', '1', path.join(OUT, name + '-last.png')]);
    return clip;
}

note('orphan gate before launch', { own: ownBrowserPids() });
const browser = await chromium.launch({ headless: true });
try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(STUB);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') { pageErrors.push('console: ' + m.text()); } });
    await page.goto(URL_ + '?scene=cl1a-mirror', { waitUntil: 'load' });
    await page.evaluate(() => window.MaxiLab.ready);
    await page.waitForFunction(() => window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 60, null, { timeout: 30000 });

    const inv0 = await hand(page, 'inventory', {});
    expect(inv0.ok, 'inventory: ' + inv0.error);
    note('inventory parts', inv0.ok ? inv0.result.parts : inv0);
    expect(inv0.ok && inv0.result.parts && Object.keys(inv0.result.parts).join() === 'source,mirror', 'the block is source, mirror in key order');
    expect(inv0.ok && inv0.result.project && inv0.result.project.entry === 'sketch.js' && /export const parts/.test(inv0.result.project.files['sketch.js']), 'the project is sketch.js holding the parts block');

    const mv = await hand(page, 'moveObject', { name: 'mirror', rect: [300, 80, 20, 240] });
    note('moveObject', mv);
    const inv1 = await hand(page, 'inventory', {});
    note('after move: parts.mirror', inv1.ok ? inv1.result.parts.mirror : inv1);
    expect(inv1.ok && JSON.stringify(inv1.result.parts.mirror[1].rect) === '[300,80,20,240]', 'the block holds the moved rect');
    const text1 = inv1.ok ? inv1.result.project.files['sketch.js'] : '';
    const literal = (t) => t.slice(t.indexOf('export const parts = {'), t.indexOf('};', t.indexOf('export const parts = {')) + 2);
    note('after move: the parts literal', literal(text1));

    const t0 = (await hand(page, 'inventory', {})).result.tick;
    const sd = await hand(page, 'setDeclared', { name: 'mirror', patch: { orientationDeg: 30 } });
    note('setDeclared', sd);
    expect(sd.ok && sd.result.to.orientationDeg === 30 && sd.result.from.orientationDeg === 45, 'setDeclared from 45 to 30');
    await page.waitForTimeout(800);
    const inv2 = await hand(page, 'inventory', {});
    note('after setDeclared: parts.mirror, tick', inv2.ok ? { mirror: inv2.result.parts.mirror, tick: inv2.result.tick, before: t0 } : inv2);
    expect(inv2.ok && inv2.result.parts.mirror[1].orientationDeg === 30, 'the block says 30');
    expect(inv2.ok && JSON.stringify(inv2.result.parts.mirror[1].rect) === '[300,80,20,240]', 'the earlier move survives the re-run');
    expect(inv2.ok && inv2.result.tick > t0, 'the Record\'s clock climbs across the re-run (' + t0 + ' → ' + (inv2.ok && inv2.result.tick) + ')');

    const see = await hand(page, 'see', {});
    note('see after setDeclared', see.ok ? { firstTick: see.result.firstTick, lastTick: see.result.lastTick, frames: see.result.frames } : see);
    expect(see.ok && see.result.firstTick > t0, 'the clip after the re-run is placed on the clock, after the earlier ticks');
    const media = await page.evaluate(() => window.__media.slice(-1)[0]);
    if (media) { note('clip', { file: saveClip(media, 'setDeclared-30-see') }); }

    const dr = await hand(page, 'dragTo', { name: 'source', to: [100, 200], ticks: 100, settle: 150 });
    note('dragTo source', dr.ok ? { from: dr.result.from, to: dr.result.to } : dr);
    const inv3 = await hand(page, 'inventory', {});
    note('after drag: parts.source center', inv3.ok ? inv3.result.parts.source[1].center : inv3);
    expect(inv3.ok && JSON.stringify(inv3.result.parts.source[1].center.slice(0, 2)) === '[100,200]', 'the block holds the emitter\'s new centre');
    note('after drag: the parts literal', inv3.ok ? literal(inv3.result.project.files['sketch.js']) : null);
    const media2 = await page.evaluate(() => window.__media.slice(-1)[0]);
    if (media2) { note('clip', { file: saveClip(media2, 'drag-source') }); }

    // a scene whose emitter is declared in code: a hand on it is refused by name, nothing moves
    const ld = await hand(page, 'loadScene', { id: 'cl1d-mirror-route' });
    expect(ld.ok, 'loadScene cl1d-mirror-route: ' + ld.error);
    const invR = await hand(page, 'inventory', {});
    note('mirror-route parts / objects', invR.ok ? { parts: invR.result.parts && Object.keys(invR.result.parts), objects: invR.result.objects.map((o) => o.name) } : invR);
    const refused = await hand(page, 'dragTo', { name: 'sphere emitter 0', to: [100, 200] });
    note('dragTo a code-declared emitter', refused);
    expect(!refused.ok && /declared in the scene's code, not in its `export const parts` block/.test(refused.error), 'refused by name');
    const invR2 = await hand(page, 'inventory', {});
    expect(invR.ok && invR2.ok && JSON.stringify(invR.result.objects[0].center) === JSON.stringify(invR2.result.objects[0].center), 'nothing moved');

    note('page errors', pageErrors);
    expect(pageErrors.length === 0, 'no page errors');
} catch (e) {
    faults.push(String(e && e.stack || e)); note('FAILED', String(e && e.stack || e));
} finally {
    await browser.close();
    const own = ownBrowserPids();
    note('orphan gate after close', { own });
    if (own.length) { faults.push('orphans'); }
    note('faults', faults);
    process.exitCode = faults.length ? 1 : 0;
}
