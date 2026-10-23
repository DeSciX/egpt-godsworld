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
 *      question and presses Enter; the conversation shows the question and Maxi's words alone (no file name, no backtick),
 *      his row linking to the question's own drawer group (imagination-turn-1, headed by the question), which holds the
 *      memory files under Designing ("From my memories: …"); no error bar, no demonstration card, no Records; only the
 *      Designer is asked; the stage's parts are where they were; the status line no longer says Maxi is working and the
 *      Imagine box is given back; no Thinking line; his row's link opens the drawer at that group.
 *   G. THE TWO PANES at a phone's width (390 x 844, touch): the replay double's outline approved and told; the conversation
 *      holds the visitor's words, the Thinking line and Maxi's closing words with the clip only; the drawer's ticker sits below
 *      the stage and never covers the lab's toolbar, collapsed or open; it opens on a tap and its turn is reached from the
 *      Thinking line.
 *   H. THE CLOSING TURN REFUSED: the replay double's outline approved, then its closing reply is a hand block where Maxi's
 *      words belong (scripts/test/fixtures/three-roles-told-fails.json, page-only): the loop stops naming the closing turn and
 *      keeps the build; the Thinking line closes red, the clip shows ONCE, on the Lab's "did not get to tell you — why ↗"
 *      fact, the stop in full in the drawer, the card still holds the approved clip.
 * MAXI'S CLOSING TURN (B, E, G): after the approve the loop asks the Designer's thread one more turn (the replay's
 * replay.designer.2) and emits {role:'maxi', kind:'told', round, words, clip}; the result carries told: {words}.
 * In B, F and G no conversation row but the visitor's carries code, a file name or a backtick (maxi-talk.js
 * conversationFaults, the gate the page's rows pass). In B the conversation (#talk-lines) carries no Builder, Owl or Designing row: they are in the Imagination drawer
 * (#imagination-lines), whose collapsed ticker shows the last process line; the drawer opens on a click, the Thinking
 * line's link resolves to #imagination-turn-1, and the Thinking line ends "Thought for <s> s · 2 rounds · approved".
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
import { conversationFaults } from '../../site/app-assets/maxi-talk.js';

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
/** The mirror replay with its closing turn refused (page-only: three-roles-told-fails.json's closing reply as replay.designer.2). */
const FIXTURE_TOLD_FAILS = Object.assign({}, FIXTURE, { designer: [FIXTURE.designer[0], JSON.parse(fs.readFileSync(path.join(HERE, '..', 'test', 'fixtures', 'three-roles-told-fails.json'), 'utf8')).closing] });
/** What Maxi tells the visitor after the mirror replay's approve: its closing reply (replay.designer.2), as the loop hands it on. */
const TOLD_WORDS = FIXTURE.designer[1].response;
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
/** The Imagination drawer: its turns, each with its process blocks ({who, cls, rows: [text], videos}), the ticker, open or not. */
const drawer = (page) => page.evaluate(() => ({
    open: !document.getElementById('imagination-lines').hidden,
    expanded: document.getElementById('imagination-toggle').getAttribute('aria-expanded'),
    ticker: document.getElementById('imagination-ticker').textContent,
    turns: Array.from(document.querySelectorAll('#imagination-lines .imagination-turn')).map((t) => ({
        id: t.id, head: t.querySelector('h3').textContent,
        blocks: Array.from(t.querySelectorAll('.imagination-process')).map((b) => ({ who: b.querySelector('b').textContent, cls: b.className, rows: Array.from(b.querySelectorAll('p')).map((p) => p.textContent), videos: b.querySelectorAll('video').length }))
    }))
}));
/** The conversation scan: no row but the visitor's carries code, a file name or a backtick (the page's own gate, read off the painted text). */
function conversationScan(part, rows) {
    const bad = rows.filter((r) => !/talk-tony/.test(r.cls)).flatMap((r) => (/```|json:call|\{\s*"/.test(r.text) ? ['code: ' + JSON.stringify(r.text.slice(0, 90))] : []).concat(conversationFaults(r.text)));
    check(bad.length === 0, part + ': no conversation row but the visitor\'s carries code, a file name or a backtick', bad.length ? bad : rows.map((r) => r.who + ': ' + r.text.slice(0, 90)));
}
/** A refusal before any outline: the conversation's rows, the drawer's, the error bar; then the Lab fact's link clicked (screenshot first). */
async function notStarted(page, shot) {
    const c = await page.evaluate(() => ({
        rows: Array.from(document.querySelectorAll('#talk-lines .talk-row')).map((r) => ({ who: r.querySelector('b').textContent, text: r.querySelector('p').textContent, cls: r.className, color: getComputedStyle(r.querySelector('p')).color })),
        errColor: getComputedStyle(document.getElementById('error')).color,
        drawer: Array.from(document.querySelectorAll('#imagination-lines p')).map((p) => p.textContent), bar: document.getElementById('error').textContent,
        sent: window.__replaySent.length, working: window.MaxiLab.loop().running }));
    await page.screenshot({ path: path.join(OUT, shot) });
    const a = await page.$('#talk-lines .talk-lab a.talk-to-drawer');
    if (a) { await a.click(); }
    c.via = await page.evaluate(() => { const l = document.getElementById('imagination-lines'); const t = l.querySelector('.imagination-turn'); return { open: !l.hidden, id: t ? t.id : null }; });
    return c;
}
/** The checks every approved outline turn must pass in the two panes (part B and G). */
async function paneChecks(page, part, rounds) {
    const rows = await talk(page);
    const d = await drawer(page);
    check(!rows.some((r) => /talk-builder|talk-owl|talk-designing/.test(r.cls) || /^(Building|Checking|Designing|the Builder|the Owl)$/.test(r.who)),
        part + ': zero Builder, Owl or Designing rows in the conversation (#talk-lines)', rows.map((r) => r.cls + ' ' + r.who));
    const thought = rows.filter((r) => /talk-thinking/.test(r.cls));
    const re = new RegExp('^Thought for \\d+ s · ' + rounds + ' rounds? · approved ↗$');
    check(thought.length === 1 && re.test(thought[0].text) && !/talk-refused/.test(thought[0].cls), part + ': ONE Thinking line, ending "Thought for <s> s · ' + rounds + ' round(s) · approved"', thought);
    const at = rows.indexOf(thought[0]);
    check(rows.length === 3 && at === 1 && rows[2].who === 'Maxi' && /talk-maxi/.test(rows[2].cls) && rows[2].text === TOLD_WORDS && rows[2].video && rows.filter((r) => r.video).length === 1 && !rows.some((r) => r.who === 'Lab'),
        part + ': the conversation holds the visitor\'s words, the Thinking line and Maxi\'s closing words with the approved clip on his row, nothing else', rows.map((r) => r.who + ': ' + r.text.slice(0, 80) + (r.video ? ' [video]' : '')));
    const blocks = d.turns.length ? d.turns[0].blocks : [];
    check(d.turns.length === 1 && d.turns[0].id === 'imagination-turn-1' && blocks.every((b) => ['Designing', 'Building', 'Checking', 'Telling'].includes(b.who)) && blocks[0].who === 'Designing' && blocks[blocks.length - 1].who === 'Telling' && blocks[blocks.length - 1].videos === 0,
        part + ': the drawer holds turn 1 under Designing, Building, Checking, then Telling (no second copy of the clip)', d.turns.map((t) => ({ id: t.id, blocks: t.blocks.map((b) => b.who + ' x' + b.rows.length + (b.videos ? ' +' + b.videos + ' video' : '')) })));
    check(!d.open && d.expanded === 'false' && d.ticker === 'Telling · ' + TOLD_WORDS, part + ': the drawer is collapsed to its ticker: Telling and Maxi\'s first words', { open: d.open, ticker: d.ticker });
    return { rows, d };
}

/** The approved turn is over: the Thinking line has closed (told, or stopped red). */
const turnClosed = (page) => page.waitForFunction(() => document.querySelector('#talk-lines .talk-thought') && !window.MaxiLab.loop().running, null, { timeout: 300000 });

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
        const dA = await drawer(page);
        check(/Maxi stopped: .*window\.DeSciX\.call\('ask_question_to_app'\).*running standalone/.test(bar) && dA.turns.length === 1 && dA.turns[0].blocks.some((b) => b.rows.includes(bar)) &&
            rows.length === 2 && rows[0].who === 'You' && !rows.some((r) => /DeSciX|command door|standalone|stopped:|designer|Builder|Owl/.test(r.text)),
            'A: standalone, the outline is refused naming the shell\'s command door, in full in the error bar and the drawer; no loop words in the conversation', { rows, bar, drawer: dA });
        check(rows.filter((r) => /talk-thinking/.test(r.cls)).length === 1 && rows.some((r) => /talk-thinking/.test(r.cls) && /talk-refused/.test(r.cls) && /^Thought for \d+ s · stopped ↗$/.test(r.text)),
            'A: the Thinking line closes red: "Thought for <s> s · stopped"', rows.filter((r) => /talk-thinking/.test(r.cls)));
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
        await page.waitForFunction(() => document.querySelector('#imagination-lines .talk-builder') !== null, null, { timeout: 30000 });
        await page.screenshot({ path: path.join(OUT, 'B1-plan.png') });
        const live = await page.evaluate(() => { const r = document.querySelector('#talk-lines .talk-thinking'); return { thinking: r ? r.querySelector('p').textContent : null, ticker: document.getElementById('imagination-ticker').textContent }; });
        check(/^Thinking: /.test(live.thinking || '') && /^(Building|Designing) · /.test(live.ticker), 'B: while Maxi works the Thinking line says what he is doing, the ticker his last process line', live);
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
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#imagination-lines video')).length >= 1, null, { timeout: 240000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, 'B2-built-watch.png') });
        // between the approve and Maxi's words (the closing turn is asked on the Designer's thread): read the moment it is painted
        const telling = await page.waitForFunction(() => { const p = document.querySelector('#talk-lines .talk-thinking p'); return p && /telling you what the clip shows/.test(p.textContent) ? p.textContent : null; }, null, { timeout: 300000, polling: 'raf' }).then((h) => h.jsonValue());
        await page.screenshot({ path: path.join(OUT, 'B3a-telling.png') });
        check(/^Thinking: round 2 · telling you what the clip shows$/.test(telling) && await page.evaluate(() => document.querySelectorAll('#talk-lines video').length === 0),
            'B: between the approve and Maxi\'s words the Thinking line says he is telling, and the conversation shows no clip yet', telling);
        await turnClosed(page);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, 'B3-owl-approved.png') });
        const rows = await talk(page);
        fs.writeFileSync(path.join(OUT, 'B-conversation.json'), JSON.stringify(rows, null, 2));
        conversationScan('B', rows);
        const panes = await paneChecks(page, 'B', 2);
        fs.writeFileSync(path.join(OUT, 'B-drawer.json'), JSON.stringify(panes.d, null, 2));
        check(panes.d.turns[0].blocks.reduce((n, b) => n + b.videos, 0) === 2, 'B: both built clips play inline in the drawer (Building)');
        check(panes.d.turns[0].blocks.filter((b) => b.who === 'Telling').flatMap((b) => b.rows).join() === TOLD_WORDS, 'B: Maxi\'s closing words under Telling in the drawer');
        check(await page.evaluate(() => window.MaxiLab.loop().last.told && window.MaxiLab.loop().last.told.words) === TOLD_WORDS, 'B: the loop\'s result carries told: {words}');
        const owlRows = panes.d.turns[0].blocks.filter((b) => b.who === 'Checking').flatMap((b) => b.rows);
        check(owlRows.length === 2 && owlRows.every((r) => /What I saw — contact: .+; after: .+; passes: .+\./.test(r)), 'B: the Owl\'s account of the footage shows as words, in the drawer', owlRows.map((r) => r.slice(0, 160)));
        await page.screenshot({ path: path.join(OUT, 'B3b-conversation-pane.png') });
        // the drawer opens on a click, closes on another; the Thinking line's link opens it at its turn
        await page.click('#imagination-toggle');
        const opened = await drawer(page);
        const box = await page.evaluate(() => { const b = (id) => document.getElementById(id).getBoundingClientRect(); return { lines: b('imagination-lines'), stage: b('stage'), header: document.querySelector('header').getBoundingClientRect(), bar: b('imagination') }; });
        check(opened.open && opened.expanded === 'true' && box.lines.height > 120 && box.lines.top >= box.header.bottom && box.lines.bottom <= box.bar.top + 1,
            'B: the drawer expands on a click, over the bottom of the stage, below the toolbar', { open: opened.open, lines: box.lines, header: box.header.bottom, bar: box.bar.top });
        await page.screenshot({ path: path.join(OUT, 'B3c-drawer-open.png') });
        await page.click('#imagination-toggle');
        check(!(await drawer(page)).open, 'B: and collapses again');
        await page.click('#talk-lines .talk-thinking a.talk-to-drawer');
        const via = await page.evaluate(() => { const a = document.querySelector('#talk-lines .talk-thinking a.talk-to-drawer'); const id = a.getAttribute('href').slice(1); const g = document.getElementById(id); const lines = document.getElementById('imagination-lines');
            const gb = g && g.getBoundingClientRect(); const lb = lines.getBoundingClientRect(); return { href: a.getAttribute('href'), found: !!g, inDrawer: !!g && lines.contains(g), open: !lines.hidden, visible: !!gb && gb.top >= lb.top - 1 && gb.top < lb.bottom }; });
        check(via.href === '#imagination-turn-1' && via.found && via.inDrawer && via.open && via.visible, 'B: the Thinking line\'s link resolves to #imagination-turn-1 and opens the drawer there', via);
        await page.screenshot({ path: path.join(OUT, 'B3d-drawer-from-thinking-link.png') });
        await page.click('#imagination-toggle');
        const sent = await page.evaluate(() => window.__replaySent.map((s) => ({ role: s.role, prev: s.params.previous_interaction_id || null, kb: s.params.knowledgebase_names, media: (s.params.media || []).map((m) => ({ mime: m.mime_type, label: m.label || null, b64: m.data.length })), user_input: s.params.user_input })));
        fs.writeFileSync(path.join(OUT, 'B-sent.json'), JSON.stringify(sent, null, 2));
        check(sent.map((s) => s.role).join(',') === 'designer,builder,builder,builder,builder,owl,builder,builder,owl,designer', 'B: the turn order (the closing turn last, on the Designer\'s thread)', sent.map((s) => s.role));
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
        const clearedDrawer = await drawer(page);
        check(cleared.length === 1 && cleared[0].who === 'Lab' && !cleared[0].video && await page.evaluate(() => document.querySelectorAll('#talk-lines video, #imagination-lines video').length === 0) &&
            clearedDrawer.turns.length === 0 && clearedDrawer.ticker === 'nothing yet',
            'B: New conversation clears both panes and their inline clips', { cleared, drawer: clearedDrawer });
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
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-lab a.talk-to-drawer'), null, { timeout: 15000 });
        const c = await notStarted(page, 'C0-record-on-not-started-conversation.png');
        check(c.sent === 0 && !c.working && c.rows.length === 1 && c.rows[0].text === 'Maxi did not start — why ↗' && c.rows[0].who === 'Lab' && c.rows[0].cls === 'talk-row talk-lab' && c.rows[0].color !== c.errColor &&
            /^Maxi did not start on ".+": Record is on \(a segment is rolling\) — press Stop \(R\) first/.test(c.bar) && c.drawer.length === 1 && c.bar === c.drawer[0] && c.via.open && c.via.id === 'imagination-turn-0',
            'C: with Record on, the loop refuses to start naming Record (in full in the error bar and the drawer; the conversation\'s plain Lab fact "Maxi did not start — why ↗" opens it); nothing is asked', c);
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
        await page.waitForFunction(() => document.querySelector('#talk-lines .talk-lab a.talk-to-drawer'), null, { timeout: 15000 });
        const d = await notStarted(page, 'D0-hand-on-not-started-conversation.png');
        d.box = await page.evaluate(() => document.getElementById('imagine-text').value);
        check(d.sent === 0 && !d.working && d.rows.length === 1 && d.rows[0].text === 'Maxi did not start — why ↗' && d.rows[0].cls === 'talk-row talk-lab' &&
            /^Maxi did not start on ".+": the Hand is on — put it down \(H or Esc\) first; a human drag must never land in the Builder's footage\.$/.test(d.bar) && d.drawer.length === 1 && d.bar === d.drawer[0] && d.via.open && d.box === FIXTURE.outline,
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
        await page.waitForFunction(() => document.querySelector('#imagination-lines .talk-builder') !== null, null, { timeout: 30000 });
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
        await turnClosed(page);
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
        check(sent.map((x) => x.role).join(',') === 'designer,builder,builder,builder,owl,designer', 'E: the turn order (the closing turn last, on the Designer\'s thread)', sent.map((x) => x.role));
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
        check(!e4.card && e4.designer === e3.designer && e4.designer === 'replay.designer.2', 'E: a switch after the approval hides the card and keeps Maxi\'s Designer thread', e4);
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
        check(rows.length === 2 && rows[0].text === FIXTURE_Q.outline && answer.length === 1 && /^Feynman called it impossible to explain in any classical way, [^\n]*not something I proved\. ↗$/.test(answer[0].text) && !answer[0].video,
            'F: a question shows the message and Maxi\'s words alone (his row ends with its link to the drawer)', rows.map((r) => r.who + ': ' + r.text));
        conversationScan('F', rows);
        check(f.bar === null && !f.card && f.records === null && f.last === null, 'F: no error bar, no demonstration card, no Records, loop().last untouched', f);
        check(JSON.stringify(f.sent) === '["designer"]', 'F: only the Designer was asked (no Builder, no Owl)', f.sent);
        check(!/Maxi is working/.test(f.status) && !f.box.disabled && f.box.value === '', 'F: the status no longer says Maxi is working; the Imagine box is given back, empty', { status: f.status, box: f.box });
        const after = await parts();
        check(JSON.stringify(after) === JSON.stringify(before), 'F: the stage is untouched: every part where it was', { before, after });
        const dF = await drawer(page);
        check(!rows.some((r) => /talk-thinking/.test(r.cls)), 'F: a question is a conversation turn: no Thinking line', rows.map((r) => r.cls));
        check(dF.turns.length === 1 && dF.turns[0].id === 'imagination-turn-1' && dF.turns[0].head === FIXTURE_Q.outline &&
            JSON.stringify(dF.turns[0].blocks.map((b) => [b.who, b.rows])) === JSON.stringify([['Designing', ['From my memories: dse-tunnel-rebuild-card.md']]]),
            'F: the question\'s own drawer group (turn 1, headed by the question) holds the memory files under Designing', dF);
        const link = await page.evaluate(() => { const a = document.querySelector('#talk-lines .talk-maxi a.talk-to-drawer'); return a ? a.getAttribute('href') : null; });
        check(link === '#imagination-turn-1', 'F: Maxi\'s row links to the question\'s group', link);
        check(dF.ticker === 'Designing · From my memories', 'F: the collapsed ticker reads the label and the lead, never the file name', dF.ticker);
        await page.click('#talk-lines .talk-maxi a.talk-to-drawer');
        await page.waitForTimeout(400);
        const dF2 = await drawer(page);
        check(dF2.open, 'F: his row\'s link opens the drawer at the question\'s group', { open: dF2.open });
        await page.screenshot({ path: path.join(OUT, 'F2-question-drawer-open.png') });
        check(pageErrors.length === 0, 'F: no page errors', pageErrors);
        await ctx.close();
    }
    // ── G. the two panes at a phone's width ──────────────────────────────────────────────────
    {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await boot(page);
        const geo = () => page.evaluate(() => {
            const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height) }; };
            const head = Array.from(document.querySelectorAll('header button:not([hidden]), header select')).filter((e) => getComputedStyle(e).display !== 'none');
            const hits = head.map((e) => { const b = e.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { id: e.id, ok: !!hit && (hit === e || e.contains(hit)) }; });
            return { header: r(document.querySelector('header')), bar: r(document.getElementById('imagination')), lines: document.getElementById('imagination-lines').hidden ? null : r(document.getElementById('imagination-lines')),
                stage: r(document.getElementById('stage')), talk: r(document.getElementById('talk')), hits, vw: innerWidth, vh: innerHeight };
        });
        const g0 = await geo();
        check(g0.bar.top >= g0.stage.bottom - 1 && g0.bar.bottom <= g0.talk.top + 1 && g0.bar.h <= 32 && g0.bar.top > g0.header.bottom && g0.hits.every((h) => h.ok),
            'G: at 390 px the ticker sits under the stage, above the conversation, and covers none of the toolbar', g0);
        await say(page, FIXTURE.outline);
        await turnClosed(page);
        await page.waitForTimeout(1500);
        await paneChecks(page, 'G', 2);
        conversationScan('G', await talk(page));
        await page.screenshot({ path: path.join(OUT, 'G1-phone-conversation.png') });
        await page.tap('#imagination-toggle');
        await page.waitForTimeout(300);
        const g1 = await geo();
        check(!!g1.lines && g1.lines.top >= g1.header.bottom && g1.lines.bottom <= g1.bar.top + 1 && g1.hits.every((h) => h.ok) && g1.lines.h > 100,
            'G: open at 390 px, the drawer lies over the stage and still covers none of the toolbar', g1);
        await page.screenshot({ path: path.join(OUT, 'G2-phone-drawer-open.png') });
        await page.tap('#imagination-toggle');
        await page.tap('#talk-lines .talk-thinking a.talk-to-drawer');
        await page.waitForTimeout(300);
        const g2 = await drawer(page);
        check(g2.open && g2.turns[0].id === 'imagination-turn-1', 'G: the Thinking line\'s link opens the drawer at its turn on a tap', { open: g2.open });
        check(pageErrors.length === 0, 'G: no page errors', pageErrors);
        await ctx.close();
    }
    // ── H. the closing turn refused after the approve: the loop stops naming it, the build kept ──
    {
        const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 } });
        await ctx.addInitScript((key) => { window.localStorage.setItem(key, '1'); }, INTRO_SEEN_KEY);
        await ctx.addInitScript({ content: '(' + installReplayDoor.toString() + ')(window, ' + JSON.stringify(FIXTURE_TOLD_FAILS) + ', ' + JSON.stringify(PREFACES) + ', 700);' });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await boot(page);
        await say(page, FIXTURE.outline);
        await turnClosed(page);
        await page.waitForTimeout(1500);
        const rows = await talk(page);
        const d = await drawer(page);
        fs.writeFileSync(path.join(OUT, 'H-conversation.json'), JSON.stringify(rows, null, 2));
        conversationScan('H', rows);
        check(rows.length === 3 && /talk-thinking/.test(rows[1].cls) && /talk-refused/.test(rows[1].cls) && /^Thought for \d+ s · 2 rounds · stopped ↗$/.test(rows[1].text),
            'H: the Thinking line closes red after the approve', rows.map((r) => r.cls + ' ' + r.who + ': ' + r.text.slice(0, 90)));
        check(rows.length === 3 && rows[2].who === 'Lab' && /talk-lab/.test(rows[2].cls) && !/talk-refused/.test(rows[2].cls) && rows[2].text === '[built and approved — watch; Maxi did not get to tell you about it — why] ↗' && rows[2].video && rows.filter((r) => r.video).length === 1,
            'H: the approved clip shows ONCE, on the Lab\'s "did not get to tell you — why" fact', rows.map((r) => r.who + ': ' + r.text + (r.video ? ' [video]' : '')));
        check(d.turns.length === 1 && d.turns[0].blocks.some((b) => b.rows.some((x) => /^Maxi stopped before telling you what the approved clip shows: the closing turn failed — [\s\S]*The build was approved and is kept\.$/.test(x))), 'H: the stop in full in the drawer', d.turns.map((t) => t.blocks.map((b) => b.who + ': ' + b.rows.join(' / ').slice(0, 120))));
        await page.screenshot({ path: path.join(OUT, 'H1-told-stopped-conversation.png') });
        await page.click('#talk-lines .talk-lab a.talk-to-drawer');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, 'H2-told-stopped-drawer.png') });
        const kept = await page.evaluate(() => ({ told: window.MaxiLab.loop().last.told, verdict: window.MaxiLab.loop().last.verdict, card: !document.getElementById('demo').hidden, bar: document.getElementById('error').textContent }));
        check(kept.verdict === 'approve' && kept.told === null && kept.card && kept.bar === '', 'H: the loop kept the approved build (told null), the card holds it, no error bar', kept);
        check(pageErrors.length === 0, 'H: no page errors', pageErrors);
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
