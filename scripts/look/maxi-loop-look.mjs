#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-loop-look.mjs — LOOK at the click-free three-role loop in a real browser.
 *
 *   node scripts/look/maxi-loop-look.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright /path/to/node_modules --out .scratch/loop-look
 *
 *   A. STANDALONE (no shell): Tony types the mirror outline and presses Enter; the conversation and the
 *      error bar refuse it naming the shell's command door; nothing is asked.
 *   B. the REPLAY DOUBLE of the shell's command door (scripts/test/replay-door.mjs, injected here before
 *      the page loads — the page has no switch for it) answers the three roles from
 *      scripts/test/fixtures/three-roles-mirror.json. Tony types "a laser hitting a mirror at 30 degrees"
 *      and presses Enter; nothing else is clicked. Screenshots at the plan, at the first built clip, and
 *      at the Owl's approval; the approved clip is saved; the mirror's position is read back through
 *      window.MaxiLab.inventory(), which is the inventory hand (parts and project, as the hand has them). While Maxi
 *      works, R and H are pressed: each is refused by name in the error bar (read the moment it is painted). After the approval, "New
 *      conversation" clears the strip (its inline clips go with it).
 *   C. the replay double again: Record (R) is on when Tony presses Enter — the loop refuses to start,
 *      naming Record, nothing is asked, and the outline stays in the Imagine box.
 *   D. the same with the Hand (H) on: refused naming the Hand, nothing asked, the outline kept.
 *   E. SCENES AND 3D (switching scenes from the lab, and Maxi working in a 3D scene
 *      too), the replay double answering from scripts/test/fixtures/three-roles-mirror-3d.json: the lab opens
 *      on its 3D double slit; the picker switches to the 3D mirror, then to the 2D double slit (a Lab row each time, the card
 *      hidden); Tony types an outline that NAMES the 3D mirror; the Designer is shown the 2D stage, the
 *      Builder loads cl1a-mirror-3d and drags the slab to z 120 while filming; while Maxi works the picker and
 *      the shell's Run (DeSciX_Actions.loadScene) are refused by name; the Owl approves; the 3D world's
 *      inventory (the hand's, parts included) is the stage stageOf takes; then, after the
 *      loop, the picker reloads the 3D mirror and the human Hand aims, SPACE-grabs, carries and drops it.
 *   F. A QUESTION, the replay double answering from scripts/test/fixtures/three-roles-question.json: Tony types the
 *      question and presses Enter; the Designer's answer row shows with "From my memories:"; no error bar, no
 *      demonstration card, no Records; only the Designer is asked; the stage's parts are where they were; the
 *      status line no longer says Maxi is working and the Imagine box is given back.
 * Exit 1 on any failed check. Browser discipline: launched and closed by Playwright's handle; the orphan
 * gate counts chrome-headless-shell processes descended from THIS process only, before and after.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { installReplayDoor } from '../test/replay-door.mjs';
import { ROLES, stageOf, stageWords } from '../../site/app-assets/maxi-roles.js';
import { INTRO_SEEN_KEY } from '../../site/app-assets/maxi-intro.js';
import { START_KEY, partsEqual } from '../../site/app-assets/maxi-record-folder.js';
import { SKETCH_KEYS } from '../../site/app-assets/maxi-hands.js';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/loop-look'));
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'test', 'fixtures', 'three-roles-mirror.json'), 'utf8'));
const FIXTURE_3D = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'test', 'fixtures', 'three-roles-mirror-3d.json'), 'utf8'));
const FIXTURE_Q = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'test', 'fixtures', 'three-roles-question.json'), 'utf8'));
const PREFACES = { designer: ROLES.designer.preface, builder: ROLES.builder.preface, owl: ROLES.owl.preface };
const OWL_KB = JSON.stringify(ROLES.owl.knowledgebase_names);
const DESIGNER_KB = ROLES.designer.knowledgebase_names;

const require = createRequire(path.join(PW_DIR, 'noop.js'));
const { chromium } = require('playwright');

const log = [];
function note(line, data) {
    const row = { t: new Date().toISOString(), line };
    if (data !== undefined) { row.data = data; }
    log.push(row);
    console.log('[loop-look] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'loop-look-log.json'), JSON.stringify(log, null, 2));
}
const failures = [];
function check(ok, what, data) { note((ok ? 'PASS ' : 'FAIL ') + what, data); if (!ok) { failures.push(what); } }

function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: Number(p[0]), ppid: Number(p[1]), comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]);
    let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    const all = rows.filter((r) => /chrome-headless-shell|ms-playwright/.test(r.comm));
    return { own: all.filter((r) => mine.has(r.pid)).map((r) => r.pid), total: all.length };
}

async function boot(page) {
    await page.goto(URL_ + '?scene=cl1a-mirror', { waitUntil: 'load' });
    await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 20, null, { timeout: 60000 });
}
async function say(page, outline) {
    await page.click('#imagine-text');
    await page.keyboard.type(outline);
    await page.keyboard.press('Enter');   // the ONLY input: no Run click anywhere
}
/**
 * THE STAGE as the loop reads it: window.MaxiLab.inventory() beside the shell's inventory hand (DeSciX_Actions.inventory).
 * The page's door IS the inventory hand, so it carries SKETCH_KEYS (parts, project) exactly as the hand does — the stage
 * stageOf takes. Read after the loop (the shell's adapter is refused while Maxi works).
 */
async function stageReads(page, part) {
    const r = await page.evaluate(async () => ({ lab: await window.MaxiLab.inventory(), hand: JSON.parse(await window.DeSciX_Actions.inventory({})) }));
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    check(has(r.lab, 'parts') && has(r.lab, 'project') && JSON.stringify(r.lab.parts) === JSON.stringify(r.hand.parts) && JSON.stringify(r.lab.project) === JSON.stringify(r.hand.project),
        part + ': window.MaxiLab.inventory() is the inventory hand — it carries the sketch\'s parts block and project, as the hand does (' + r.lab.id + ', ' + r.lab.dimensions + 'D)',
        { id: r.lab.id, labKeys: Object.keys(r.lab), handKeys: Object.keys(r.hand), labParts: r.lab.parts === undefined ? 'absent' : Object.keys(r.lab.parts || {}), handParts: Object.keys(r.hand.parts || {}) });
    return r.lab;
}
const talk = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#talk-lines .talk-row')).map((r) => ({
    who: r.querySelector('b').textContent, text: r.querySelector('p').textContent, video: !!r.querySelector('video'), cls: r.className
})));

const gate0 = ownBrowserPids();
note('orphan gate before launch', gate0);
const browser = await chromium.launch({ headless: true });
try {
    // ── A. standalone ────────────────────────────────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);   // this look drives the page: the run-once walk-through stays closed (maxi-intro.js)
        const page = await ctx.newPage();
        await boot(page);
        note('A host', await page.evaluate(() => window.MaxiLab.state.host));
        await say(page, FIXTURE.outline);
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-refused'), null, { timeout: 15000 });
        const rows = await talk(page);
        const bar = await page.evaluate(() => document.getElementById('error').textContent);
        check(rows.some((r) => /window\.DeSciX\.call\('ask_question_to_app'\)/.test(r.text) && /running standalone/.test(r.text)) && /Maxi stopped: .*command door/.test(bar),
            'A: standalone, the outline is refused naming the shell\'s command door', { rows, bar });
        await page.screenshot({ path: path.join(OUT, 'A-standalone-refused.png') });
        await ctx.close();
    }
    // ── B. the replay double ─────────────────────────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);   // this look drives the page: the run-once walk-through stays closed (maxi-intro.js)
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') { note('console error', m.text()); } });
        await boot(page);
        note('B host', await page.evaluate(() => window.MaxiLab.state.host));
        const actionsBefore = await page.evaluate(() => Object.keys(window.DeSciX_Actions).length);
        // where the LOOP began: the stage's parts block as the loop takes the outline (round 1's start is read then)
        const loopStart = await page.evaluate(async (k) => (await window.MaxiLab.inventory())[k], SKETCH_KEYS.parts);
        await say(page, FIXTURE.outline);
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-builder') !== null, null, { timeout: 30000 });
        await page.screenshot({ path: path.join(OUT, 'B1-plan.png') });
        check(await page.evaluate(() => document.getElementById('imagine-text').value === ''), 'B: the Imagine box empties once the loop takes the outline');
        // the human's tools while Maxi works: R and H are refused by name in the error bar
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        // the refusal is read the moment it is painted: a world the Builder boots next (mountScene's showError(null)) clears the bar by design
        const refusedBy = (re) => page.waitForFunction((src) => { const t = document.getElementById('error').textContent; return new RegExp(src).test(t) ? t : null; }, re.source, { timeout: 3000, polling: 'raf' })
            .then((h) => h.jsonValue(), () => null);
        await page.keyboard.press('KeyR');
        const rBar = await refusedBy(/^Record \(R\) is refused while Maxi is working/);
        const r = await page.evaluate((bar) => ({ bar, recording: window.MaxiLab.recorder().recording, working: window.MaxiLab.loop().running }), rBar);
        check(r.working && !r.recording && /^Record \(R\) is refused while Maxi is working/.test(r.bar), 'B: R while Maxi works is refused by name in the error bar', r);
        await page.screenshot({ path: path.join(OUT, 'B1r-record-refused.png') });
        await page.keyboard.press('KeyH');
        const hBar = await refusedBy(/^the Hand \(H\) is refused while Maxi is working/);
        const h = await page.evaluate((bar) => ({ bar, hand: !!(window.MaxiLab.hand() && window.MaxiLab.hand().enabled), working: window.MaxiLab.loop().running }), hBar);
        check(h.working && !h.hand && /^the Hand \(H\) is refused while Maxi is working/.test(h.bar), 'B: H while Maxi works is refused by name in the error bar', h);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#talk-lines .talk-row video')).length >= 1, null, { timeout: 240000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, 'B2-built-watch.png') });
        await page.waitForFunction(() => window.MaxiLab.loop() && window.MaxiLab.loop().last, null, { timeout: 300000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, 'B3-owl-approved.png') });
        const rows = await talk(page);
        fs.writeFileSync(path.join(OUT, 'B-conversation.json'), JSON.stringify(rows, null, 2));
        check(rows.every((r) => !/```|json:call|\{\s*"/.test(r.text)), 'B: the conversation carries no code', rows.map((r) => r.who + ': ' + r.text.slice(0, 90)));
        check(rows.filter((r) => r.video).length === 2, 'B: both built clips play inline in the conversation');
        const owlRows = rows.filter((r) => /talk-owl/.test(r.cls) && !/talk-pending/.test(r.cls));
        check(owlRows.length === 2 && owlRows.every((r) => /What I saw — contact: .+; after: .+; passes: .+\./.test(r.text)), 'B: the Owl\'s account of the footage shows as words', owlRows.map((r) => r.text.slice(0, 160)));
        const sent = await page.evaluate(() => window.__replaySent.map((s) => ({ role: s.role, prev: s.params.previous_interaction_id || null, kb: s.params.knowledgebase_names, media: (s.params.media || []).map((m) => ({ mime: m.mime_type, label: m.label || null, b64: m.data.length })), user_input: s.params.user_input })));
        fs.writeFileSync(path.join(OUT, 'B-sent.json'), JSON.stringify(sent, null, 2));
        check(sent.map((s) => s.role).join(',') === 'designer,builder,builder,builder,builder,owl,builder,builder,owl', 'B: the turn order', sent.map((s) => s.role));
        const owl = sent.filter((s) => s.role === 'owl');
        check(owl.every((s) => JSON.stringify(s.kb) === OWL_KB && !s.kb.some((k) => DESIGNER_KB.includes(k)) && s.prev === null && s.media.length === 1 && s.media[0].mime === 'video/mp4' && !s.user_input.includes('the mirror memory turns the slab')),
            'B: the Owl gets outline + prediction + one clip, fresh thread, its own KB (none of the Designer\'s), no plan', owl.map((s) => ({ kb: s.kb, prev: s.prev, media: s.media })));
        check(sent.filter((s) => s.role === 'builder').map((s) => s.media.length).join(',') === '0,0,0,1,0,1', 'B: each drag clip rides on the Builder\'s next turn');
        const inv = await stageReads(page, 'B');
        const mirror = inv.objects.find((o) => o.name === 'mirror');
        check(mirror && Math.round(mirror.center[0]) === 370 && Math.round(mirror.center[1]) === 200, 'B: the mirror was dragged and left centred, click-free', { mirror, scene: inv.scene });
        const last = await page.evaluate(() => { const l = window.MaxiLab.loop().last; return { verdict: l.verdict, rounds: l.rounds, prediction: l.prediction, seconds: l.clip.seconds, data: l.clip.media.data }; });
        const f = path.join(OUT, 'B-approved-clip.mp4');
        fs.writeFileSync(f, Buffer.from(last.data, 'base64'));
        check(last.verdict === 'approve' && last.rounds === 2 && last.seconds >= 5 && last.seconds <= 10, 'B: the Owl approved in round 2; the clip is 5–10 s', { verdict: last.verdict, rounds: last.rounds, seconds: last.seconds, file: f, bytes: fs.statSync(f).size });
        const card = await page.evaluate(() => ({ hidden: document.getElementById('demo').hidden, title: document.getElementById('demo-title').textContent }));
        check(!card.hidden && /the Owl approved/.test(card.title), 'B: the approved clip is kept on the demonstration card', card);
        const rec = await page.evaluate((k) => { const rs = window.MaxiLab.records(); const r = rs[rs.length - 1]; return { count: rs.length, name: r.name, chain: r.lab.chain, record: r.record, producer: r.lab.producer, handBack: r.lab.handBack, filmed: r.lab.filmed, scene: r.lab.scene, complete: r.complete, faults: r.faults, files: Object.keys(r.files).sort(), clipBytes: r.files['clip-01.mp4'].length,
            partsBefore: r.files['parts.before.json'] ? JSON.parse(r.files['parts.before.json']) : null, partsAfter: r.files['parts.after.json'] ? JSON.parse(r.files['parts.after.json']) : null, start: r.lab[k] }; }, START_KEY);
        // THE START: the approving round (round 2) begins at the Owl's revise, so its Record's start is where round 1 left the
        // world — the parts its Record opened on (parts.before.json; nothing carried) — not where the loop began
        check(!!rec.start && !!rec.partsBefore && partsEqual(rec.start, rec.partsBefore) && !partsEqual(rec.start, loopStart) && !partsEqual(rec.start, rec.partsAfter),
            'B: lab.json ' + START_KEY + ' is the approving round\'s start (its Record\'s parts.before.json, where round 1 left the mirror), not where the loop began, and the round ends elsewhere',
            { start: rec.start && rec.start.mirror, partsBefore: rec.partsBefore && rec.partsBefore.mirror, loopStart: loopStart && loopStart.mirror, partsAfter: rec.partsAfter && rec.partsAfter.mirror });
        check(rec.count === 1 && rec.name === 'record-01' && JSON.stringify(rec.chain) === JSON.stringify({ index: 1, records: ['record-01'] }) && rec.producer === 'loop' && rec.record.clips.length === 1 && JSON.stringify(rec.handBack) === JSON.stringify({ record: 'record-01', clip: 'clip-01.mp4' }) && rec.filmed.length === 1 && rec.filmed[0].hand === 'dragTo' && rec.clipBytes === Buffer.from(last.data, 'base64').length && rec.record.changes.length === 1 &&
            rec.record.changes[0].op === 'move' && rec.record.changes[0].by === 'maxi' && rec.record.changes[0].name === 'mirror' &&
            mirror.authority === 'rect' && Object.keys(rec.record.changes[0].from).join() === 'rect' && JSON.stringify(rec.record.changes[0].to.rect) === JSON.stringify(mirror.rect) && rec.record.changes[0].tick >= rec.record.tickRange[0] && rec.record.changes[0].tick <= rec.record.tickRange[1] && rec.complete && rec.faults.length === 0 &&
            ['parts.after.json', 'parts.before.json', 'project/sketch.js'].every((f) => rec.files.includes(f)) && rec.partsAfter.mirror[1].orientationDeg === 30 && JSON.stringify(rec.partsAfter.mirror[1].rect) === JSON.stringify(rec.record.changes[0].to.rect) && JSON.stringify(rec.partsBefore.mirror[1].rect) === JSON.stringify(rec.record.changes[0].from.rect),
            'B: the approve is a COMPLETE Record folder in memory (the sketch-projects design §6): the hand-back clip, the approving round\'s ONE dragTo act as ONE \"move\" row in the shape the mirror is declared by ({rect}) inside tickRange, parts.before/after.json the sketch\'s block stating that move, project/ the sketch at close',
            { record: Object.assign({}, rec.record, { changes: rec.record.changes }), files: rec.files, scene: rec.scene, faults: rec.faults.map((f) => f.slice(0, 60)) });
        check(actionsBefore > 0 && await page.evaluate(() => typeof window.DeSciX_Actions.dragTo === 'function'), 'B: window.DeSciX_Actions stays published for the shell');
        await page.click('#talk-new');
        const cleared = await talk(page);
        check(cleared.length === 1 && cleared[0].who === 'Lab' && !cleared[0].video && await page.evaluate(() => document.querySelectorAll('#talk-lines video').length === 0),
            'B: New conversation clears the strip and its inline clips', cleared);
        await page.screenshot({ path: path.join(OUT, 'B4-new-conversation.png') });
        await ctx.close();
    }
    // ── C. Record on: the loop refuses to start ──────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);   // this look drives the page: the run-once walk-through stays closed (maxi-intro.js)
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        await boot(page);
        await page.keyboard.press('KeyR');
        await page.waitForFunction(() => window.MaxiLab.recorder().recording, null, { timeout: 10000 });
        await say(page, FIXTURE.outline);
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-refused'), null, { timeout: 15000 });
        const c = await page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('#talk-lines .talk-row p')).map((p) => p.textContent), bar: document.getElementById('error').textContent, sent: window.__replaySent.length, working: window.MaxiLab.loop().running }));
        check(c.sent === 0 && !c.working && c.rows.length === 1 && /^Maxi did not start on ".+": Record is on \(a segment is rolling\) — press Stop \(R\) first/.test(c.rows[0]) && c.bar === c.rows[0],
            'C: with Record on, the loop refuses to start naming Record; nothing is asked', c);
        check(await page.evaluate(() => document.getElementById('imagine-text').value) === FIXTURE.outline, 'C: the refused outline stays in the Imagine box');
        await page.screenshot({ path: path.join(OUT, 'C-record-on-refused.png') });
        await ctx.close();
    }
    // ── D. Hand on: the loop refuses to start ────────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);   // this look drives the page: the run-once walk-through stays closed (maxi-intro.js)
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        await boot(page);
        await page.keyboard.press('KeyH');
        await page.waitForFunction(() => window.MaxiLab.hand() && window.MaxiLab.hand().enabled, null, { timeout: 10000 });
        await say(page, FIXTURE.outline);
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-refused'), null, { timeout: 15000 });
        const d = await page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('#talk-lines .talk-row p')).map((p) => p.textContent), bar: document.getElementById('error').textContent, sent: window.__replaySent.length, working: window.MaxiLab.loop().running, box: document.getElementById('imagine-text').value }));
        check(d.sent === 0 && !d.working && d.rows.length === 1 && /^Maxi did not start on ".+": the Hand is on — put it down \(H or Esc\) first; a human drag must never land in the Builder's footage\.$/.test(d.rows[0]) && d.bar === d.rows[0] && d.box === FIXTURE.outline,
            'D: with the Hand on, the loop refuses to start naming the Hand; nothing is asked; the outline stays in the box', d);
        await page.screenshot({ path: path.join(OUT, 'D-hand-on-refused.png') });
        await ctx.close();
    }
    // ── E. scene switching and a 3D loop ─────────────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);   // this look drives the page: the run-once walk-through stays closed (maxi-intro.js)
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE_3D) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        const st = () => page.evaluate(() => ({ id: window.MaxiLab.state.scene && window.MaxiLab.state.scene.id, mode: window.MaxiLab.state.scene && window.MaxiLab.state.scene.mode,
            renderer: window.MaxiLab.state.scene && window.MaxiLab.state.scene.renderer, picker: document.getElementById('scene-picker').value,
            bar: document.getElementById('error').hidden ? null : document.getElementById('error').textContent, card: !document.getElementById('demo').hidden,
            working: !!(window.MaxiLab.loop() && window.MaxiLab.loop().running), designer: window.MaxiLab.loop() && window.MaxiLab.loop().designer }));
        const lastRow = () => page.evaluate(() => { const r = Array.from(document.querySelectorAll('#talk-lines .talk-row')).pop(); return r ? r.querySelector('b').textContent + ': ' + r.querySelector('p').textContent : null; });
        const pick = async (value, id) => {
            await page.selectOption('#scene-picker', value);
            await page.waitForFunction((want) => window.MaxiLab.state.scene && window.MaxiLab.state.scene.id === want && !window.MaxiLab.state.loading && window.MaxiLab.state.scene.tick() > 10, id, { timeout: 60000 });
        };
        await page.goto(URL_, { waitUntil: 'load' });
        await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 20, null, { timeout: 60000 });
        const e0 = await st();
        check(e0.id === 'dse-tunnel-rebuild' && e0.mode === '3d' && e0.renderer === 'three' && e0.picker === 'dse-tunnel-rebuild#3d', 'E: the lab opens on the 3D double slit', e0);
        await page.screenshot({ path: path.join(OUT, 'E0-opens-3d-double-slit.png') });
        await pick('cl1a-mirror-3d', 'cl1a-mirror-3d');
        const e1 = await st(); const row1 = await lastRow();
        await page.screenshot({ path: path.join(OUT, 'E1-picked-3d-mirror.png') });
        check(e1.renderer === 'three' && e1.picker === 'cl1a-mirror-3d' && /^Lab: scene switched — now loaded: 1A · Mirror \(3D\) \(cl1a-mirror-3d, 3D\)\. Maxi's next outline starts from it; this conversation is kept\.$/.test(row1),
            'E: the picker switches to the 3D mirror and the conversation says so', { e1, row1 });
        await pick('dse-tunnel-rebuild#2d', 'dse-tunnel-rebuild');
        check((await st()).mode === '2d' && /now loaded: Double Slit .*\(dse-tunnel-rebuild · 2d, 2D\)/.test(await lastRow()), 'E: and to the 2D double slit', await lastRow());
        await say(page, FIXTURE_3D.outline);
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-builder') !== null, null, { timeout: 30000 });
        // while Maxi works: the picker and the shell's Run are refused by name
        const during0 = await st();
        await page.selectOption('#scene-picker', 'r7-3d');
        await page.waitForTimeout(400);
        const during = await st();
        check(during.working && /^the scene picker is refused while Maxi is working/.test(during.bar) && during.id === during0.id && during.picker !== 'r7-3d',
            'E: the picker is refused by name while Maxi works; it goes back to the running scene', { during0, during });
        await page.screenshot({ path: path.join(OUT, 'E2-picker-refused-while-working.png') });
        const shell = await page.evaluate(async () => { try { await window.DeSciX_Actions.loadScene({ id: 'r7-3d' }); return { ran: true }; } catch (e) { return { error: String(e.message || e) }; } });
        check(/^the shell's loadScene \(Run\) is refused while Maxi is working/.test(shell.error || ''), 'E: the shell\'s Run (DeSciX_Actions.loadScene) is refused by name while Maxi works', shell);
        await page.waitForFunction(() => window.MaxiLab.loop() && window.MaxiLab.loop().last, null, { timeout: 300000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, 'E3-3d-owl-approved.png') });
        const e3 = await st();
        const inv3 = await stageReads(page, 'E');
        const slab = inv3.objects.find((o) => o.name === 'mirror');
        check(inv3.id === 'cl1a-mirror-3d' && inv3.dimensions === 3 && inv3.canvas.length === 3 && slab && slab.center[2] === 120 && slab.rect[2] === 40, 'E: the Builder loaded the 3D mirror and dragged the slab to z 120, click-free', { id: inv3.id, dimensions: inv3.dimensions, canvas: inv3.canvas, slab });
        const w3 = stageWords(stageOf(inv3));
        check(inv3.mode === null && Array.isArray(inv3.modes) && inv3.modes.length === 0 &&
            /scene id cl1a-mirror-3d, no registry modes declared \(loadScene takes its id only\); 3D \(x, y, z\): a world 600 x 400 x 600 with depth/.test(w3),
            'E: the served 3D mirror\'s stage says 3D (from the booted world) and lists no registry modes', { mode: inv3.mode, modes: inv3.modes, words: w3 });
        check(inv3.viewer && inv3.viewer.toward === '+z' && inv3.viewer.away === '-z' && inv3.camera.azimuth === 45 && inv3.camera.elevation === 45 &&
            /the camera looks from azimuth 45°, elevation 45°; toward the viewer is \+z, away is -z/.test(w3) && /mirror \(Wall\): spans x 360\.\.380, y 80\.\.320, z 40\.\.200; centre \[370, 200, 120\]/.test(w3),
            'E: the served 3D mirror\'s inventory reads toward-the-viewer off the live camera (az 45 el 45 → +z, as measured) and the stage line states it with the dragged slab\'s span', { camera: inv3.camera, viewer: inv3.viewer, words: w3 });
        check(e3.card && e3.picker === 'cl1a-mirror-3d', 'E: the approved 3D clip is on the card; the picker names the scene the Builder loaded', e3);
        const rec3 = await page.evaluate(() => window.MaxiLab.records().map((r) => ({ name: r.name, scene: r.lab.scene, chain: r.lab.chain, changes: r.record.changes, clips: r.record.clips, handBack: r.lab.handBack, faults: r.faults })));
        check(rec3.length === 1 && rec3[0].scene.id === 'cl1a-mirror-3d' && !rec3[0].changes.some((c) => c.op === 'sketch') && rec3[0].changes.length === 1 && rec3[0].changes[0].op === 'move' && rec3[0].changes[0].name === 'mirror' &&
            JSON.stringify(rec3[0].handBack) === JSON.stringify({ record: 'record-01', clip: rec3[0].clips[rec3[0].clips.length - 1] }) && !rec3[0].faults.some((f) => /placeholder/.test(f)),
            'E: the Builder\'s loadScene closes the stage\'s world (no act there, so no Record) and the 3D world is ONE Record: the slab\'s move, no sketch row, the hand-back its last clip', rec3);
        const sent = await page.evaluate(() => window.__replaySent.map((x) => ({ role: x.role, user_input: x.params.user_input, media: (x.params.media || []).length })));
        fs.writeFileSync(path.join(OUT, 'E-sent.json'), JSON.stringify(sent, null, 2));
        check(sent.map((x) => x.role).join(',') === 'designer,builder,builder,builder,owl', 'E: the turn order', sent.map((x) => x.role));
        check(/THE STAGE \(loaded in the lab now, on Tony's screen\): "Double Slit[^"]*" — scene id dse-tunnel-rebuild, registry modes declared: 3d, 2d \(loaded: 2d\); 2D \(x, y\): a world/.test(sent[0].user_input), 'E: the Designer was shown the 2D stage, its declared registry modes listed');
        check(sent[1].user_input.includes('The plan\'s scene is not on the stage: your first hand loads it — loadScene {"id":"cl1a-mirror-3d"} (or openSketch'), 'E: the Builder was told to load the plan\'s scene first');
        check(sent[3].media === 1 && sent[4].media === 1 && !/THE STAGE|toward the viewer is|azimuth|spans [xyz] /.test(sent[4].user_input), 'E: the drag clip rides on the Builder\'s next turn and to the Owl, who never sees the stage, the camera, the viewer axis or an extent');
        const last = await page.evaluate(() => { const l = window.MaxiLab.loop().last; return { seconds: l.clip.seconds, data: l.clip.media.data }; });
        const clip = path.join(OUT, 'E-approved-3d-clip.mp4');
        fs.writeFileSync(clip, Buffer.from(last.data, 'base64'));
        note('E approved 3D clip', { file: clip, seconds: last.seconds, bytes: fs.statSync(clip).size });
        // after the loop: the picker switches again (card hidden, Designer thread kept) and the human Hand works in 3D
        await pick('dse-tunnel-rebuild#2d', 'dse-tunnel-rebuild');
        await pick('cl1a-mirror-3d', 'cl1a-mirror-3d');
        const e4 = await st();
        check(!e4.card && e4.designer === e3.designer && e4.designer === 'replay.designer.1', 'E: a switch after the approval hides the card and keeps Maxi\'s Designer thread', e4);
        await page.waitForTimeout(1500);
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await page.keyboard.press('KeyH');
        await page.waitForTimeout(300);
        const h3 = await page.evaluate(() => window.MaxiLab.hand().state());
        check(h3.mode === '3d', 'E: after the loop the Hand enters its 3D mode (aim + SPACE)', h3);
        const m0 = (await page.evaluate(() => window.MaxiLab.inventory())).objects.find((o) => o.name === 'mirror');
        await page.evaluate(() => document.getElementById('scene-frame').contentWindow.MaxiScene.mount().focus());
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);
        const g = await page.evaluate(() => window.MaxiLab.hand().state());
        await page.keyboard.down('KeyA'); await page.waitForTimeout(700); await page.keyboard.up('KeyA'); await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(OUT, 'E4-3d-hand-carry-after-loop.png') });
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);
        const m1 = (await page.evaluate(() => window.MaxiLab.inventory())).objects.find((o) => o.name === 'mirror');
        const dropped = await page.evaluate(() => window.MaxiLab.hand().state());
        check(g.grabbed === 'mirror' && !dropped.grabbed && JSON.stringify(m1.rect) !== JSON.stringify(m0.rect), 'E: the human SPACE-grabs, carries and drops the 3D slab after the loop', { grabbed: g.grabbed, before: m0.rect, after: m1.rect });
        await page.keyboard.press('Escape');
        check(pageErrors.length === 0, 'E: no page errors', pageErrors);
        await ctx.close();
    }
    // ── F. a question: answered in words, nothing built ──────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);   // this look drives the page: the run-once walk-through stays closed (maxi-intro.js)
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE_Q) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await boot(page);
        const parts = async () => (await page.evaluate(() => window.MaxiLab.inventory())).objects.map((o) => o.name + ' ' + JSON.stringify(o.rect || o.center));
        const before = await parts();
        await say(page, FIXTURE_Q.outline);
        await page.waitForFunction(() => window.MaxiLab.loop() && !window.MaxiLab.loop().running && Array.from(document.querySelectorAll('#talk-lines .talk-maxi')).some((r) => !/talk-pending/.test(r.className)), null, { timeout: 30000 });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, 'F-question-answered.png') });
        const rows = await talk(page);
        const f = await page.evaluate(() => ({ bar: document.getElementById('error').hidden ? null : document.getElementById('error').textContent, card: !document.getElementById('demo').hidden,
            records: window.MaxiLab.records(), last: window.MaxiLab.loop().last, status: document.getElementById('status').textContent,
            box: { disabled: document.getElementById('imagine-text').disabled, value: document.getElementById('imagine-text').value }, sent: window.__replaySent.map((s) => s.role) }));
        const answer = rows.filter((r) => /talk-maxi/.test(r.cls) && !/talk-pending/.test(r.cls));
        check(rows.length === 2 && rows[0].text === FIXTURE_Q.outline && answer.length === 1 && /^From my card memory dse-tunnel-rebuild-card\.md: /.test(answer[0].text) && /\nFrom my memories: dse-tunnel-rebuild-card\.md$/.test(answer[0].text) && !answer[0].video,
            'F: a question shows the message and Maxi\'s answer row, its memory files named ("From my memories:")', rows.map((r) => r.who + ': ' + r.text));
        check(f.bar === null && !f.card && f.records === null && f.last === null, 'F: no error bar, no demonstration card, no Records, loop().last untouched', f);
        check(JSON.stringify(f.sent) === '["designer"]', 'F: only the Designer was asked (no Builder, no Owl)', f.sent);
        check(!/Maxi is working/.test(f.status) && !f.box.disabled && f.box.value === '', 'F: the status no longer says Maxi is working; the Imagine box is given back, empty', { status: f.status, box: f.box });
        const after = await parts();
        check(JSON.stringify(after) === JSON.stringify(before), 'F: the stage is untouched: every part where it was', { before, after });
        check(pageErrors.length === 0, 'F: no page errors', pageErrors);
        await ctx.close();
    }
} finally {
    await browser.close();
    const gate1 = ownBrowserPids();
    note('orphan gate after close', gate1);
    if (gate1.own.length) { failures.push('orphaned browser pids ' + gate1.own.join(',')); }
}
note(failures.length ? 'FAILED: ' + failures.join(' | ') : 'ALL PASS');
process.exit(failures.length ? 1 : 0);
