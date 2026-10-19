#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-record-look.mjs — LOOK at Record: on cl1a-mirror, Record on, a human hand drag of the mirror,
 * ~6 s of clip, Record off → ONE Record folder (maxi-record-folder.js: record.json {tickRange, clips, changes},
 * parts.before/after.json the sketch's block at open and close, project/ the sketch at close: a COMPLETE Record) on the card
 * with its teaching textarea; the human types what they teach and presses Send to Maxi, and the (stubbed) question door gets
 * the clip with the change list in its note and the words in its user_input; lab.json keeps them as `teaching`. Then the
 * same card at 390 px STANDALONE (no shell): Send is refused naming the shell's command door, the strip's row and lab.json
 * still carry the words, and the demonstration waits to be sent again.
 *
 *   node scripts/look/maxi-record-look.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright <node_modules> --out .scratch/look-record [--ffprobe /opt/homebrew/bin/ffprobe]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { INTRO_SEEN_KEY } from '../../site/app-assets/maxi-intro.js';
import { TEACHING_KEY, TEACHING_PROMPT } from '../../site/app-assets/maxi-record-folder.js';
import { TEACHING_HEAD } from '../../site/app-assets/maxi-ask.js';

/** The human's words for the look (two lines, as a person types them). */
const WORDS = 'The mirror sends the beam off at the angle it arrives.\nWatch the reflection move when I drag the mirror left.';

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
        card: { hidden: document.getElementById('demo').hidden, title: document.getElementById('demo-title').textContent, lines: document.getElementById('demo-changes').textContent,
            teach: { hidden: document.getElementById('demo-teach').hidden, placeholder: document.getElementById('demo-teach-text').placeholder, value: document.getElementById('demo-teach-text').value,
                disabled: document.getElementById('demo-teach-text').disabled, send: document.getElementById('demo-send').textContent } }
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
    await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);   // this look drives the page: the run-once walk-through stays closed (maxi-intro.js)
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
    if (off.card.teach.hidden || off.card.teach.placeholder !== TEACHING_PROMPT || off.card.teach.send !== 'Send to Maxi' || !off.rec.waiting) { throw new Error('the card does not offer the teaching textarea and Send: ' + JSON.stringify(off.card.teach)); }
    if (await page.evaluate(() => window.__media.length)) { throw new Error('Stop asked before the human pressed Send'); }
    await page.click('#demo-teach-text');
    await page.keyboard.type(WORDS.split('\n')[0]); await page.keyboard.press('Shift+Enter'); await page.keyboard.type(WORDS.split('\n')[1]);
    await page.screenshot({ path: path.join(OUT, '02b-card-typed.png') });
    note('typed on the card', (await ui(page)).card.teach);
    await page.click('#demo-send');
    await page.waitForFunction(() => { const s = window.MaxiLab.recorder().state(); return !s.sending && !s.waiting; }, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const sentUi = await ui(page);
    await page.screenshot({ path: path.join(OUT, '02c-card-sent.png') });
    const asked = await page.evaluate(() => window.__asks[window.__asks.length - 1].params.user_input);
    const teachLab = await page.evaluate((k) => { const rs = window.MaxiLab.recorder().last(); return rs[rs.length - 1].lab[k]; }, TEACHING_KEY);
    const youRow = await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('#talk-lines .talk-user')); return rows.length ? rows[rows.length - 1].textContent : null; });
    note('Send to Maxi → the question', { user_input: asked, lab_teaching: teachLab, you_row: youRow, card: sentUi.card });
    if (!asked.includes(TEACHING_HEAD + '\n' + WORDS)) { throw new Error('the question\'s user_input does not carry the human\'s words verbatim'); }
    if (teachLab !== WORDS) { throw new Error('lab.json does not carry the words as ' + TEACHING_KEY + ': ' + JSON.stringify(teachLab)); }
    if (!youRow || !youRow.includes(WORDS)) { throw new Error('the strip\'s You row does not show the words'); }
    if (!sentUi.card.teach.hidden || !sentUi.card.lines.startsWith('You taught: ' + WORDS)) { throw new Error('the sent card does not show what was taught: ' + JSON.stringify(sentUi.card)); }
    const demo = await page.evaluate(() => { const rs = window.MaxiLab.recorder().last(); const r = rs[rs.length - 1]; return { count: rs.length, name: r.name, chain: r.lab.chain, record: r.record, lab: r.lab, faults: r.faults, complete: r.complete, files: Object.keys(r.files).sort() }; });
    note('Record folder', demo);
    const media = await page.evaluate(() => window.__media.splice(0).map((m) => ({ mime_type: m.mime_type, label: m.label, note: m.note, bytes: m.data.length, data: m.data })));
    note('media handed to the question door', media.map((m) => ({ mime_type: m.mime_type, label: m.label, note: m.note, base64Length: m.bytes })));
    if (media.length !== demo.record.clips.length) { throw new Error('ferried ' + media.length + ' clips for ' + demo.record.clips.length); }
    if (!demo.record.changes.length) { throw new Error('the drag was not logged'); }
    const after = objOf(await inv(page), 'mirror');
    const row = demo.record.changes[demo.record.changes.length - 1];
    if (row.op !== 'move' || after.authority !== 'rect' || Object.keys(row.from).join() !== 'rect' || JSON.stringify(row.to.rect) !== JSON.stringify(after.rect)) {
        throw new Error('the human drag of the rect-declared mirror is not ONE {rect} move ending at its rect: ' + JSON.stringify({ row, after }));
    }
    note('row shape', { row, declared: after.authority, rectAfter: after.rect });
    if (!demo.complete || demo.faults.length) { throw new Error('the Record is not complete: ' + demo.faults.join('; ')); }
    const sketch = await page.evaluate(() => { const rs = window.MaxiLab.recorder().last(); const f = rs[rs.length - 1].files; return { before: JSON.parse(f['parts.before.json']), after: JSON.parse(f['parts.after.json']), project: Object.keys(f).filter((k) => k.startsWith('project/')), entry: f['project/sketch.js'] }; });
    note('the sketch in the Record', { before: sketch.before.mirror, after: sketch.after.mirror, project: sketch.project });
    if (JSON.stringify(sketch.before.mirror[1].rect) !== '[360,80,20,240]' || JSON.stringify(sketch.after.mirror[1].rect) !== JSON.stringify(demo.record.changes[0].to.rect)) { throw new Error('parts.before/after do not state the drag the change row states'); }
    if (!/rect: \[260, 80, 20, 240\]/.test(sketch.entry)) { throw new Error('project/sketch.js at close does not hold the dragged rect'); }
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
    await page.click('#demo-send');                                   // nothing typed: handed as before, with no words
    await page.waitForFunction(() => { const s = window.MaxiLab.recorder().state(); return !s.sending && !s.waiting; }, null, { timeout: 60000 });
    const demo2 = await page.evaluate(() => window.MaxiLab.recorder().last()[0].record);
    const plain = await page.evaluate((k) => ({ user_input: window.__asks[window.__asks.length - 1].params.user_input, has: Object.prototype.hasOwnProperty.call(window.MaxiLab.recorder().last()[0].lab, k) }), TEACHING_KEY);
    note('zero-change Record, sent with no words', { record: demo2, ui: (await ui(page)).card, plain });
    if (!demo2.clips.length || demo2.changes.length) { throw new Error('zero-change Record wrong'); }
    if (plain.has || plain.user_input.includes(TEACHING_HEAD)) { throw new Error('an empty blurb sent words or wrote the key'); }

    // A recording ACROSS a scene change (one Record per booted world, the design §6): Record, drag in world 1, a refused
    // scene change on a paused world (named in the error bar, still recording), resume, openSketch, drag in world 2, Stop
    // → two chained Records, record-01 and record-02, ONE question carrying both worlds' footage.
    const drag = async (dx) => {
        const o = objOf(await inv(page), 'mirror');
        const p0 = await pageXY(page, o.center.slice(0, 2));
        await page.mouse.move(p0.x - 5, p0.y); await page.waitForTimeout(150);   // a fresh hover in this frame
        await page.mouse.move(p0.x, p0.y); await page.waitForTimeout(300);
        const hover = await ui(page);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) { await page.mouse.move(p0.x + dx * i / 10, p0.y); await page.waitForTimeout(80); }
        await page.mouse.up();
        return { before: o.rect, after: objOf(await inv(page), 'mirror').rect, at: p0, hover: hover.status.split('  ·  ').slice(-2).join(' · '), error: hover.error };
    };
    // Record again while a demonstration waits unsent: refused by name (never a silent discard); the card's × discards it, said on the strip.
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 260, null, { timeout: 60000 });
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().waiting, null, { timeout: 60000 });
    await page.evaluate(() => { document.getElementById('demo').hidden = true; });   // the card out of sight (as after a scene switch)
    await page.click('#btn-record');
    await page.waitForTimeout(300);
    const refusedRec = await ui(page);
    await page.screenshot({ path: path.join(OUT, '05a-record-refused-while-waiting.png') });
    note('Record while a demonstration waits', { error: refusedRec.error, rec: refusedRec.rec, cardHidden: refusedRec.card.hidden });
    if (refusedRec.rec.on || !refusedRec.rec.waiting || !/^record: the last demonstration has not been sent — press Send to Maxi on its card, or close the card \(×\) to discard it/.test(refusedRec.error || '') || refusedRec.card.hidden) {
        throw new Error('Record while a demonstration waits was not refused by name with its card shown: ' + JSON.stringify(refusedRec));
    }
    await page.click('#demo-close');
    await page.waitForTimeout(200);
    const discarded = await ui(page);
    const stripText = await page.evaluate(() => document.getElementById('talk-lines').innerText);
    note('the card closed unsent', { error: discarded.error, waiting: discarded.rec.waiting, strip_says: /the demonstration was discarded unsent/.test(stripText) });
    if (discarded.rec.waiting || discarded.error || !/the demonstration was discarded unsent/.test(stripText)) { throw new Error('closing the card did not discard the demonstration by name'); }
    await page.evaluate(() => window.__media.splice(0));             // the zero-change Record's footage is not this chain's
    if (!(await ui(page)).card.hidden) { await page.click('#demo-close'); }   // the human closes the last card: it lies over the stage
    await page.click('#btn-record');
    await page.waitForFunction(() => window.MaxiLab.recorder().state().on, null, { timeout: 10000 });
    note('chain: world 1 drag', await drag(-80));
    await page.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 100, null, { timeout: 60000 });
    await page.click('#btn-run');                                   // Pause
    await page.waitForTimeout(300);
    const src = await hand(page, 'sceneSource', { id: 'cl1a-mirror' });
    if (!src.ok) { throw new Error('sceneSource: ' + src.error); }
    const refused = await hand(page, 'openSketch', { source: src.result.source });
    const pausedUi = await ui(page);
    await page.screenshot({ path: path.join(OUT, '03-paused-scene-change-refused.png') });
    note('chain: scene change on a paused world', { refused, ui: pausedUi });
    if (refused.ok || !/the world is paused, so the scene cannot change or restart while Record is on/.test(refused.error) ||
        !pausedUi.error || !/the scene cannot change or restart while Record is on/.test(pausedUi.error) || !pausedUi.rec.on || pausedUi.rec.records !== 1) {
        throw new Error('the paused scene change was not refused by name with the recording kept: ' + JSON.stringify({ refused, pausedUi }));
    }
    await page.click('#btn-run');                                   // Resume
    await page.waitForTimeout(500);
    const opened = await hand(page, 'openSketch', { source: src.result.source });
    if (!opened.ok) { throw new Error('openSketch: ' + opened.error); }
    await page.waitForTimeout(3000);
    const w2 = await ui(page);
    note('chain: world 2 booted, still recording', w2.rec);
    if (!w2.rec.on || w2.rec.records !== 2 || !/REC record 2 · segment/.test(w2.rec.text)) { throw new Error('the recording did not go on in world 2 as record 2: ' + JSON.stringify(w2.rec)); }
    if ((await ui(page)).hand !== 'true') { throw new Error('the Hand did not outlive the scene change (the lab re-arms a hand kept on)'); }
    const d2 = await drag(80);
    note('chain: world 2 drag', d2);
    if (d2.before[0] === d2.after[0]) { throw new Error('the world 2 drag moved nothing: ' + JSON.stringify(d2)); }
    await page.screenshot({ path: path.join(OUT, '04-recording-record-2.png') });
    note('chain: status in world 2', (await ui(page)).status);
    await page.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 300, null, { timeout: 60000 });
    await page.click('#btn-record');
    await page.waitForFunction(() => !window.MaxiLab.recorder().state().on, null, { timeout: 60000 });
    await page.click('#demo-send');
    await page.waitForFunction(() => { const s = window.MaxiLab.recorder().state(); return !s.sending && !s.waiting; }, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const chainUi = await ui(page);
    await page.screenshot({ path: path.join(OUT, '05-chain-card.png') });
    const chain = await page.evaluate(() => window.MaxiLab.recorder().last().map((r) => ({ name: r.name, scene: r.lab.scene.label, chain: r.lab.chain, handBack: r.lab.handBack, asked: r.lab.asked, record: r.record })));
    note('chain: Records', { chain, card: chainUi.card });
    const chainMedia = await page.evaluate(() => window.__media.splice(0).map((m) => ({ label: m.label, data: m.data })));
    chainMedia.forEach((m, i) => {
        const file = path.join(OUT, 'chain-media-' + (i + 1) + '.mp4');
        fs.writeFileSync(file, Buffer.from(m.data, 'base64'));
        note('chain clip saved', { file: path.basename(file), label: m.label, size: fs.statSync(file).size, ffprobe: probe(file) });
    });
    if (chain.length !== 2 || chain.map((r) => r.name).join() !== 'record-01,record-02' || chain.some((r) => r.record.changes.length !== 1) ||
        chain[1].chain.index !== 2 || chain[0].handBack.record !== 'record-02' || chain[0].asked !== null || !chain[1].asked) {
        throw new Error('the recording across a scene change is not two chained Records: ' + JSON.stringify(chain.map((r) => ({ name: r.name, chain: r.chain, changes: r.record.changes.length }))));
    }
    if (chainMedia.length !== chain[0].record.clips.length + chain[1].record.clips.length || !/^DEMONSTRATION Record 1\/2/.test(chainMedia[0].label)) { throw new Error('the one question did not carry both worlds\' footage'); }
    if (!/2 Records/.test(chainUi.card.title) || !/record-01[\s\S]*record-02/.test(chainUi.card.lines)) { throw new Error('the card does not show both Records: ' + JSON.stringify(chainUi.card)); }

    note('page errors', pageErrors);
    if (pageErrors.length) { throw new Error('page errors: ' + pageErrors.join(' | ')); }
    await ctx.close();

    // 390 px, STANDALONE (no shell above the page): the card with its textarea, the words typed, Send refused loudly
    // naming the shell's command door — the strip's row and the Record's lab.json still carry the words.
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);
    const mp = await mctx.newPage();
    const mErrors = [];
    mp.on('pageerror', (e) => mErrors.push(e.message));
    await mp.goto(URL_, { waitUntil: 'load' });
    await mp.evaluate(() => window.MaxiLab.ready);
    const host = await mp.evaluate(() => window.MaxiLab.state.host);
    if (host !== 'standalone') { throw new Error('the 390 px page is not standalone: ' + host); }
    const mld = await hand(mp, 'loadScene', { id: 'cl1a-mirror' });
    if (!mld.ok) { throw new Error(mld.error); }
    await mp.waitForTimeout(1500);
    await mp.evaluate(() => window.MaxiLab.toggleRecord());
    await mp.waitForFunction(() => window.MaxiLab.recorder().state().elapsedTicks >= 300, null, { timeout: 60000 });
    await mp.evaluate(() => window.MaxiLab.toggleRecord());
    await mp.waitForFunction(() => window.MaxiLab.recorder().state().waiting, null, { timeout: 60000 });
    await mp.waitForTimeout(300);
    await mp.screenshot({ path: path.join(OUT, '06-mobile-390-card.png') });
    const mcard = await ui(mp);
    const box = await mp.evaluate(() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { demo: r('demo'), text: r('demo-teach-text'), send: r('demo-send'), vw: innerWidth, vh: innerHeight }; });
    note('390 px: the card', { card: mcard.card, box });
    if (mcard.card.teach.hidden) { throw new Error('390 px: no teaching textarea on the card'); }
    if (box.send[0] + box.send[2] > box.vw || box.send[1] + box.send[3] > box.vh || box.text[0] < 0) { throw new Error('390 px: Send or the textarea is off screen: ' + JSON.stringify(box)); }
    await mp.tap('#demo-teach-text');
    await mp.keyboard.type(WORDS.split('\n')[0]); await mp.keyboard.press('Shift+Enter'); await mp.keyboard.type(WORDS.split('\n')[1]);
    await mp.screenshot({ path: path.join(OUT, '07-mobile-390-typed.png') });
    await mp.tap('#demo-send');
    await mp.waitForFunction(() => { const s = window.MaxiLab.recorder().state(); return !s.sending && !!s.error; }, null, { timeout: 60000 });
    await mp.waitForTimeout(300);
    await mp.screenshot({ path: path.join(OUT, '08-mobile-390-refused.png') });
    const mref = await ui(mp);
    const strip = await mp.evaluate(() => Array.from(document.querySelectorAll('#talk-lines .talk-row')).map((r) => r.textContent));
    const mlab = await mp.evaluate((k) => { const rs = window.MaxiLab.recorder().last(); const hb = rs[rs.length - 1]; return { teaching: hb.lab[k], asked: hb.lab.asked, faults: hb.faults, lab: JSON.parse(typeof hb.files['lab.json'] === 'string' ? hb.files['lab.json'] : new TextDecoder().decode(hb.files['lab.json']))[k] }; }, TEACHING_KEY);
    note('390 px standalone: Send refused', { error: mref.error, rec: mref.rec, strip, lab: mlab });
    if (!mref.error || !/the lab asks Maxi through the DeSciX App Shell's command door, window\.DeSciX\.call\('ask_question_to_app'\)/.test(mref.error)) { throw new Error('the refusal does not name the shell\'s command door: ' + mref.error); }
    if (!strip.some((t) => t.includes(WORDS)) || !strip.some((t) => /did not see it — record: Maxi was NOT shown the footage/.test(t))) { throw new Error('the strip does not carry the words and the refusal'); }
    if (mlab.teaching !== WORDS || mlab.lab !== WORDS || mlab.asked !== null || mlab.faults.length) { throw new Error('the refused Record\'s lab.json does not keep the words: ' + JSON.stringify(mlab)); }
    if (!mref.rec.waiting || mref.card.teach.hidden || mref.card.teach.disabled) { throw new Error('a refused Send does not keep the demonstration waiting to send again: ' + JSON.stringify(mref.rec)); }
    note('390 px page errors', mErrors);
    if (mErrors.length) { throw new Error('390 px page errors: ' + mErrors.join(' | ')); }
    await mctx.close();
} catch (e) {
    failed = e; note('FAILED', String(e && e.stack || e));
} finally {
    await browser.close();
    const own = ownBrowserPids();
    note('orphan gate after close', { own });
    if (own.length) { process.exitCode = 3; }
}
if (failed) { process.exitCode = 1; }
