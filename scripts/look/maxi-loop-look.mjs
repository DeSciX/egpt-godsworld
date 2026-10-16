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
 *      at the Owl's approval; the approved clip is saved; the mirror's position is read back. While Maxi
 *      works, R and H are pressed: each is refused by name in the error bar. After the approval, "New
 *      conversation" clears the strip (its inline clips go with it).
 *   C. the replay double again: Record (R) is on when Tony presses Enter — the loop refuses to start,
 *      naming Record, nothing is asked, and the outline stays in the Imagine box.
 *   D. the same with the Hand (H) on: refused naming the Hand, nothing asked, the outline kept.
 *   E. SCENES AND 3D (switching scenes from the lab, and Maxi working in a 3D scene
 *      too), the replay double answering from scripts/test/fixtures/three-roles-mirror-3d.json: the lab opens
 *      on its 2D double slit; the picker switches to the 3D mirror and back (a Lab row each time, the card
 *      hidden); Tony types an outline that NAMES the 3D mirror; the Designer is shown the 2D stage, the
 *      Builder loads cl1a-mirror-3d and drags the slab to z 120 while filming; while Maxi works the picker and
 *      the shell's Run (DeSciX_Actions.loadScene) are refused by name; the Owl approves; then, after the
 *      loop, the picker reloads the 3D mirror and the human Hand aims, SPACE-grabs, carries and drops it.
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

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/loop-look'));
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'test', 'fixtures', 'three-roles-mirror.json'), 'utf8'));
const FIXTURE_3D = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'test', 'fixtures', 'three-roles-mirror-3d.json'), 'utf8'));
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
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') { note('console error', m.text()); } });
        await boot(page);
        note('B host', await page.evaluate(() => window.MaxiLab.state.host));
        const actionsBefore = await page.evaluate(() => Object.keys(window.DeSciX_Actions).length);
        await say(page, FIXTURE.outline);
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-builder') !== null, null, { timeout: 30000 });
        await page.screenshot({ path: path.join(OUT, 'B1-plan.png') });
        check(await page.evaluate(() => document.getElementById('imagine-text').value === ''), 'B: the Imagine box empties once the loop takes the outline');
        // the human's tools while Maxi works: R and H are refused by name in the error bar
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await page.keyboard.press('KeyR');
        await page.waitForTimeout(300);
        const r = await page.evaluate(() => ({ bar: document.getElementById('error').textContent, recording: window.MaxiLab.recorder().recording, working: window.MaxiLab.loop().running }));
        check(r.working && !r.recording && /^Record \(R\) is refused while Maxi is working/.test(r.bar), 'B: R while Maxi works is refused by name in the error bar', r);
        await page.screenshot({ path: path.join(OUT, 'B1r-record-refused.png') });
        await page.keyboard.press('KeyH');
        await page.waitForTimeout(300);
        const h = await page.evaluate(() => ({ bar: document.getElementById('error').textContent, hand: !!(window.MaxiLab.hand() && window.MaxiLab.hand().enabled), working: window.MaxiLab.loop().running }));
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
        const inv = await page.evaluate(() => window.MaxiLab.inventory());
        const mirror = inv.objects.find((o) => o.name === 'mirror');
        check(mirror && Math.round(mirror.center[0]) === 370 && Math.round(mirror.center[1]) === 200, 'B: the mirror was dragged and left centred, click-free', { mirror, scene: inv.scene });
        const last = await page.evaluate(() => { const l = window.MaxiLab.loop().last; return { verdict: l.verdict, rounds: l.rounds, prediction: l.prediction, seconds: l.clip.seconds, data: l.clip.media.data }; });
        const f = path.join(OUT, 'B-approved-clip.mp4');
        fs.writeFileSync(f, Buffer.from(last.data, 'base64'));
        check(last.verdict === 'approve' && last.rounds === 2 && last.seconds >= 5 && last.seconds <= 10, 'B: the Owl approved in round 2; the clip is 5–10 s', { verdict: last.verdict, rounds: last.rounds, seconds: last.seconds, file: f, bytes: fs.statSync(f).size });
        const card = await page.evaluate(() => ({ hidden: document.getElementById('demo').hidden, title: document.getElementById('demo-title').textContent }));
        check(!card.hidden && /the Owl approved/.test(card.title), 'B: the approved clip is kept on the demonstration card', card);
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
        check(e0.id === 'dse-tunnel-rebuild' && e0.mode === '2d', 'E: the lab opens on the 2D double slit', e0);
        await pick('cl1a-mirror-3d', 'cl1a-mirror-3d');
        const e1 = await st(); const row1 = await lastRow();
        await page.screenshot({ path: path.join(OUT, 'E1-picked-3d-mirror.png') });
        check(e1.renderer === 'three' && e1.picker === 'cl1a-mirror-3d' && /^Lab: scene switched — now loaded: 1A · Mirror \(3D\) \(cl1a-mirror-3d, 3D\)\. Maxi's next outline starts from it; this conversation is kept\.$/.test(row1),
            'E: the picker switches to the 3D mirror and the conversation says so', { e1, row1 });
        await pick('dse-tunnel-rebuild#2d', 'dse-tunnel-rebuild');
        check((await st()).mode === '2d' && /now loaded: Double Slit .*\(dse-tunnel-rebuild · 2d, 2D\)/.test(await lastRow()), 'E: and back to the 2D double slit', await lastRow());
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
        const inv3 = await page.evaluate(() => window.MaxiLab.inventory());
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
} finally {
    await browser.close();
    const gate1 = ownBrowserPids();
    note('orphan gate after close', gate1);
    if (gate1.own.length) { failures.push('orphaned browser pids ' + gate1.own.join(',')); }
}
note(failures.length ? 'FAILED: ' + failures.join(' | ') : 'ALL PASS');
process.exit(failures.length ? 1 : 0);
