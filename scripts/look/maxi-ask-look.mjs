#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-ask-look.mjs — LOOK at the question door in a real browser: the page hands every clip to Maxi
 * itself as media[] on ask_question_to_app through window.DeSciX.call, on ONE thread.
 *
 *   node scripts/look/maxi-ask-look.mjs --url http://127.0.0.1:5563/site/app.html \
 *        --playwright /path/to/node_modules --out .scratch/ask-look
 *
 * Two runs, both on the 2D mirror (cl1a-mirror) with a PLANTED control — a magenta wall "probe" that no
 * memory holds, added at [40, 330, 90, 24] and dragged to centre [470, 80] inside the dragTo clip:
 *   A. STANDALONE (no shell): the dragTo hand THROWS naming the command door; the clip is kept
 *      (MaxiLab.clips()) and saved as standalone-dragTo.mp4 — the clip the API run sends;
 *   B. a STUB of the shell's command door (only call + view): see, dragTo, showMemory and a human Record
 *      demonstration; every params bag the page sends is captured and asserted (media[0].mime_type
 *      video/mp4, raw base64, previous_interaction_id chained across hands); the conversation strip is
 *      read back as text; then the door REFUSES and the refusal must come back verbatim, with no retry.
 * Exit 1 on any failed assertion. Browser discipline: launched and closed by Playwright's handle; the
 * orphan gate counts chrome-headless-shell processes descended from THIS process only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/ask-look'));
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire(path.join(PW_DIR, 'noop.js'));
const { chromium } = require('playwright');

const log = [];
function note(line, data) {
    const row = { t: new Date().toISOString(), line: line };
    if (data !== undefined) { row.data = data; }
    log.push(row);
    console.log('[ask-look] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'ask-look-log.json'), JSON.stringify(log, null, 2));
}
const failures = [];
function check(ok, what, data) {
    note((ok ? 'PASS ' : 'FAIL ') + what, data);
    if (!ok) { failures.push(what); }
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

// The command-door stub: only the TOP window owns the bus; it carries call + view, NO chat.
const STUB = () => {
    if (window.top !== window) { return; }
    window.__asks = [];
    window.__answer = (n) => ({ status: 'OK', message: { status: 'OK', response: 'Stub Maxi, turn ' + n + ': I see a magenta bar.\n\n```json:call:see\n{}\n```', interaction_id: 'stub-thread-' + n, usage: { media_tokens: 300 } } });
    window.DeSciX = {
        bridge: { version: 'ask-stub', ready: true, EVENT: 'descix:bridge-ready', members: () => ['call', 'view'] },
        ready: async () => ({ mode: 'shell', members: ['call', 'view'], version: 'ask-stub' }),
        call: async (command, params) => { window.__asks.push({ command: command, params: params }); return window.__answer(window.__asks.length); },
        view: { available: () => false, set: (m) => m }
    };
};

async function hand(page, op, args) {
    return page.evaluate(async ({ op, args }) => {
        try { return { ok: true, result: JSON.parse(await window.DeSciX_Actions[op](args)) }; }
        catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    }, { op, args });
}
async function must(page, op, args) {
    const r = await hand(page, op, args);
    if (!r.ok) { throw new Error(op + ' failed: ' + r.error); }
    const brief = Object.assign({}, r.result); delete brief.objects;
    note(op + ' ok', brief);
    return r.result;
}
async function boot(page) {
    await page.goto(URL_ + '?scene=cl1a-mirror', { waitUntil: 'load' });
    await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 20, null, { timeout: 60000 });
}
// The planted control: a magenta wall no memory holds.
const PROBE = { kind: 'Wall', opts: { name: 'probe', rect: [40, 330, 90, 24], collisionBehavior: 'block', color: [255, 0, 255] } };
const PROBE_TO = [470, 80];

const gate0 = ownBrowserPids();
note('orphan gate before launch', gate0);
const browser = await chromium.launch({ headless: true });
note('browser launched', ownBrowserPids());
try {
    // ── A. standalone ────────────────────────────────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        await boot(page);
        note('A standalone host', await page.evaluate(() => window.MaxiLab.state.host));
        await must(page, 'addObject', PROBE);
        note('A inventory before', (await must(page, 'inventory', {})).objects);
        const r = await hand(page, 'dragTo', { name: 'probe', to: PROBE_TO, ticks: 150, settle: 150 });
        check(!r.ok && /window\.DeSciX\.call\('ask_question_to_app'\)/.test(r.error) && /running standalone/.test(r.error) && /Maxi was NOT shown the footage/.test(r.error),
            'A: standalone dragTo throws naming the command door', r);
        const clips = await page.evaluate(() => window.MaxiLab.clips().map((c) => ({ op: c.op, mime_type: c.mime_type, label: c.label, data: c.data })));
        check(clips.length === 1 && clips[0].mime_type === 'video/mp4' && clips[0].op === 'dragTo', 'A: the clip is kept (MaxiLab.clips())', clips.map((c) => ({ op: c.op, label: c.label, base64Length: c.data.length })));
        if (clips.length) {
            const f = path.join(OUT, 'standalone-dragTo.mp4');
            fs.writeFileSync(f, Buffer.from(clips[0].data, 'base64'));
            fs.writeFileSync(path.join(OUT, 'standalone-dragTo.label.txt'), clips[0].label + '\n');
            note('A saved clip', { file: f, bytes: fs.statSync(f).size, ftyp: fs.readFileSync(f).subarray(4, 8).toString('ascii') });
        }
        const bar = await page.evaluate(() => document.getElementById('error').textContent);
        check(/window\.DeSciX\.call/.test(bar), 'A: the error bar shows the refusal', bar);
        note('A inventory after', (await must(page, 'inventory', {})).objects);
        await page.screenshot({ path: path.join(OUT, 'A-standalone.png') });
        await ctx.close();
    }
    // ── B. the stubbed command door ─────────────────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.addInitScript(STUB);
        const page = await ctx.newPage();
        const consoleErrors = [];
        page.on('pageerror', (e) => consoleErrors.push(String(e)));
        await boot(page);
        note('B host', await page.evaluate(() => window.MaxiLab.state.host));
        await must(page, 'addObject', PROBE);
        const see = await must(page, 'see', {});
        const drag = await must(page, 'dragTo', { name: 'probe', to: PROBE_TO, ticks: 150, settle: 150 });
        const mem = await must(page, 'showMemory', { id: 'cl1a-mirror' });
        // a human Record: start, a move through the one write path, ≥ 5 s of world, Stop
        await page.evaluate(() => window.MaxiLab.toggleRecord());
        await must(page, 'moveObject', { name: 'mirror', rect: [300, 60, 20, 240] });
        await page.waitForTimeout(6500);
        const demo = await page.evaluate(async () => { const d = await window.MaxiLab.toggleRecord(); return { asked: d.asked, interaction_id: d.interaction_id, answer_excerpt: d.answer_excerpt, clips: d.clips.length, changes: d.changes.length }; });
        note('Record demonstration', demo);

        const asks = await page.evaluate(() => window.__asks.map((a) => ({
            command: a.command, keys: Object.keys(a.params), app_id: a.params.app_id, kb: a.params.knowledgebase_names,
            previous_interaction_id: a.params.previous_interaction_id === undefined ? null : a.params.previous_interaction_id,
            user_input_head: a.params.user_input.slice(0, 160), user_input_tail: a.params.user_input.slice(-200),
            media: a.params.media.map((m) => ({ mime_type: m.mime_type, label: m.label, base64Length: m.data.length, dataUrl: /^data:/.test(m.data), b64ok: m.data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(m.data), ftyp: atob(m.data.slice(0, 16)).slice(4, 8) }))
        })));
        fs.writeFileSync(path.join(OUT, 'B-captured-params.json'), JSON.stringify(asks, null, 2));
        check(asks.length === 4, 'B: four questions (see, dragTo, showMemory, Record)', asks.map((a) => a.media.map((m) => m.label)));
        check(asks.every((a) => a.command === 'ask_question_to_app' && a.app_id === 'egpt-godsworld' && JSON.stringify(a.kb) === '["GodsWorld"]'), 'B: every call is ask_question_to_app, app egpt-godsworld, KB GodsWorld');
        check(asks.every((a) => a.media.length >= 1 && a.media.every((m) => m.mime_type === 'video/mp4' && m.base64Length > 1000 && !m.dataUrl && m.b64ok && m.ftyp === 'ftyp')),
            'B: media[0].mime_type video/mp4, raw base64 of an MP4 (ftyp), every question', asks.map((a) => a.media.map((m) => [m.mime_type, m.base64Length, m.ftyp])));
        check(JSON.stringify(asks.map((a) => a.previous_interaction_id)) === JSON.stringify([null, 'stub-thread-1', 'stub-thread-2', 'stub-thread-3']),
            'B: previous_interaction_id chains across hands (one thread)', asks.map((a) => a.previous_interaction_id));
        check(asks.every((a) => /Answer in words only, with no action block: this turn is for looking\.$/.test(a.user_input_tail)), 'B: user_input ends with the look question');
        check(/^The human pressed Record in 1A/.test(asks[3] ? asks[3].user_input_head : '') && /moveObject \(maxi\) mirror/.test(await page.evaluate(() => window.__asks[3].params.user_input)), 'B: the Record question carries the change list', asks[3] && asks[3].user_input_head);
        check(see.asked === true && see.interaction_id === 'stub-thread-1' && drag.interaction_id === 'stub-thread-2' && mem.interaction_id === 'stub-thread-3' && demo.interaction_id === 'stub-thread-4',
            'B: hand results carry {asked:true, interaction_id}', { see: see.interaction_id, drag: drag.interaction_id, mem: mem.interaction_id, demo: demo.interaction_id });
        check(!('delivered' in see) && !('delivered' in drag) && !('delivered' in mem), 'B: no `delivered` in hand results');
        check(typeof see.answer_excerpt === 'string' && see.answer_excerpt.startsWith('Stub Maxi, turn 1') && !/```/.test(see.answer_excerpt), 'B: answer_excerpt is Maxi\'s words (no code block)', see.answer_excerpt);
        const strip = await page.evaluate(() => ({ hidden: document.getElementById('talk').hidden, text: document.getElementById('talk-lines').innerText }));
        fs.writeFileSync(path.join(OUT, 'B-strip.txt'), strip.text);
        check(!strip.hidden && /Stub Maxi, turn 1: I see a magenta bar\./.test(strip.text) && /Maxi drags "probe"/.test(strip.text) && /The human pressed Record/.test(strip.text),
            'B: the conversation strip shows the notes and Maxi\'s words');
        check(!/```|json:call|"mime_type"|\{"/.test(strip.text), 'B: the strip carries no code block and no JSON', strip.text.slice(0, 400));
        check(/media tokens 300/.test(strip.text), 'B: the strip shows media tokens from the answer\'s usage');
        await page.screenshot({ path: path.join(OUT, 'B-stub-strip.png') });

        // the door refuses: verbatim, painted, no retry
        await page.evaluate(() => { window.__refusals = 0; window.DeSciX.call = async () => { window.__refusals += 1; throw new Error('NOT_AUTHENTICATED: stub refusal (sign in)'); }; });
        const ref = await hand(page, 'see', {});
        const bar = await page.evaluate(() => document.getElementById('error').textContent);
        const refusals = await page.evaluate(() => window.__refusals);
        check(!ref.ok && /^see: Maxi was NOT shown the footage — NOT_AUTHENTICATED: stub refusal \(sign in\)/.test(ref.error) && bar === ref.error && refusals === 1,
            'B: a refused call is thrown verbatim, painted in the error bar, called once', { error: ref.error, bar: bar, refusals: refusals });
        const stripAfter = await page.evaluate(() => document.getElementById('talk-lines').innerText);
        check(/did not see it — see: Maxi was NOT shown the footage — NOT_AUTHENTICATED/.test(stripAfter), 'B: the strip says Maxi did not see it');
        await page.screenshot({ path: path.join(OUT, 'B-stub-refused.png') });
        check(consoleErrors.length === 0, 'B: no page errors', consoleErrors);
        await ctx.close();
    }
} catch (err) {
    failures.push('run threw: ' + String((err && err.stack) || err));
    note('run threw', String((err && err.stack) || err));
} finally {
    await browser.close();
    const gate1 = ownBrowserPids();
    note('orphan gate after close', gate1);
    if (gate1.own.length) { failures.push('own browser processes survived: ' + gate1.own.join(',')); }
}
note(failures.length ? 'FAILED: ' + failures.join(' | ') : 'ALL PASS');
process.exit(failures.length ? 1 : 0);
