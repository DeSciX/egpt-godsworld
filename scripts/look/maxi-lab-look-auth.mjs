#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab-look-auth.mjs — LOOK at the lab for a visitor who asks before signing in, then signs in, then asks again.
 *
 *   node scripts/look/maxi-lab-look-auth.mjs --url http://127.0.0.1:<port>/site/app.html \
 *        --playwright /path/to/node_modules --out .scratch/auth-look
 *
 * A shell double (injected before the page loads; the page has no switch for it) publishes call, view and powch. Its
 * powch.isAuthenticated() answers window.__signedIn; its call REJECTS "User not authenticated" while that is false (the
 * platform's refusal as the lab showed it on PROD), else answers the Designer with a question reply whose json:answer lists
 * a memory its words never name.
 *   1. signed out: the status line says so; the intro's last button reads "Login to enter Godsworld".
 *   2. a question, Enter: a Lab notice naming SIGN IN, in the plain style (not talk-refused); no error bar; the question
 *      back in the box.
 *   3. the shell signs the visitor in (window.__signedIn = true, nothing reloaded): within the watcher's re-read the status
 *      line says "signed in", a Lab row says so, and the intro's last button reads "Enter Godsworld".
 *   4. Enter again: Maxi's words alone in his own row (talk-maxi), no file name and no backtick in any conversation row but
 *      the visitor's (maxi-talk.js conversationFaults); his row links to the question's own drawer group (imagination-turn-2,
 *      headed by the question), which holds the memory file drawn on under Designing; the link opens it; no Lab notice, no
 *      error bar; the collapsed ticker reads "Designing · From my memories", never the file name.
 *   5. a model answer that slips the register (backticks and a bare file name): the turn renders, never a stop and never
 *      red; Maxi's row without backticks; turn 3's group holds the memory file and "register slip: 4 backticks, 1 file name"
 *      under Designing; the ticker shows no file name.
 * Exit 1 on any failed check. The orphan gate counts chrome-headless-shell processes descended from THIS process only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

import { INTRO_SEEN_KEY, ENTRY_LABELS } from '../../site/app-assets/maxi-intro.js';
import { SIGN_IN_NOTICE, SIGNED_IN_NOTICE } from '../../site/app-assets/maxi-auth.js';
import { conversationFaults } from '../../site/app-assets/maxi-talk.js';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const URL_ = argOf('--url', null);
const PW_DIR = argOf('--playwright', null);
const OUT = path.resolve(argOf('--out', '.scratch/auth-look'));
if (!URL_ || !PW_DIR) { throw new Error('--url and --playwright are required'); }
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'))('playwright');

const QUESTION = 'what is this';
const WORDS = 'This is the double slit rebuilt as a tunnel: one emitter fires through two slits onto a detector wall, ' +
    'and the bands you see build up one hit at a time.';
const REPLY = 'THIS IS: a question\n' + WORDS + '\n```json:answer\n{"memories": ["dse-tunnel-rebuild-build.md"]}\n```';
const SLIP_Q = 'what is unique about it?';
const SLIP_WORDS = 'The `Tunnel` runs the double slit as particles, and dse-tunnel-rebuild-card.md says no `SlitScreen` part is needed.';
const SLIP_REPLY = 'THIS IS: a question\n' + SLIP_WORDS + '\n```json:answer\n{"memories": ["dse-tunnel-rebuild-card.md"]}\n```';

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-auth] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-auth-log.json'), JSON.stringify(log, null, 2));
}
function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: +p[0], ppid: +p[1], comm: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]); let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    return rows.filter((r) => /chrome-headless-shell/.test(r.comm) && mine.has(r.pid)).map((r) => r.pid);
}
function check(cond, what) { if (!cond) { throw new Error('LOOK check failed: ' + what); } note('ok: ' + what); }

/** The shell double: self-contained, injected with the Designer's reply. */
function shellDouble(reply) {
    if (window.top !== window) { return; }
    const members = ['call', 'view', 'powch'];
    window.__signedIn = false;
    window.DeSciX = {
        bridge: { version: 'look-auth', ready: true, EVENT: 'descix:bridge-ready', members: () => members },
        ready: async () => ({ mode: 'shell', members, version: 'look-auth' }),
        call: async (command) => {
            if (!window.__signedIn) { throw new Error('User not authenticated'); }
            if (command !== 'ask_question_to_app') { throw new Error('[look-auth] the double answers ask_question_to_app only'); }
            await new Promise((r) => setTimeout(r, 400));
            return { status: 'OK', message: { status: 'OK', response: window.__reply || reply, interaction_id: 'look.designer.1', usage: { media_tokens: 0 } } };
        },
        view: { available: () => false, set: (m) => m },
        powch: { isAuthenticated: () => window.__signedIn, getAddress: () => null, login: async () => {} }
    };
}

const strip = (page) => page.$$eval('#talk-lines .talk-row', (rows) => rows.map((r) => ({ cls: r.className.replace('talk-row ', ''), who: r.querySelector('b').textContent, text: r.querySelector('p').textContent })));
const shot = async (page, name) => { const p = path.join(OUT, name); await page.screenshot({ path: p }); note('still', p); };
const entryLabel = async (page) => {
    await page.click('#intro-open');
    await page.click('.intro-next');
    await page.waitForFunction(() => !document.querySelector('.intro-entry').disabled);
    return page.textContent('.intro-entry');
};
const closeIntro = (page) => page.click('.intro-close');

note('orphan gate before launch', { own: ownBrowserPids() });
const browser = await chromium.launch({ headless: true });
let failed = null;
try {
    const ctx = await browser.newContext({ viewport: { width: 1232, height: 720 } });
    await ctx.addInitScript((k) => { try { localStorage.setItem(k, '1'); } catch (e) { /* the intro shows */ } }, INTRO_SEEN_KEY);
    await ctx.addInitScript(shellDouble, REPLY);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForFunction(() => window.MaxiLab && window.MaxiLab.state && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 5, null, { timeout: 60000 });

    // 1. signed out
    await page.waitForFunction(() => /signed out/.test(document.getElementById('status').textContent));
    note('status', await page.textContent('#status'));
    const before = await entryLabel(page);
    check(before === ENTRY_LABELS.login, '1: signed out, the intro\'s last button reads "' + before + '"');
    await shot(page, '1-intro-signed-out.png');
    await closeIntro(page);

    // 2. a question while signed out
    await page.fill('#imagine-text', QUESTION);
    await page.press('#imagine-text', 'Enter');
    await page.waitForFunction((n) => Array.from(document.querySelectorAll('#talk-lines .talk-row p')).some((p) => p.textContent === n), SIGN_IN_NOTICE);
    await page.waitForFunction(() => !document.getElementById('imagine-text').disabled);
    const rows2 = await strip(page);
    note('strip after the signed-out question', rows2);
    const notice = rows2[rows2.length - 1];
    check(notice.who === 'Lab' && notice.cls === 'talk-lab' && notice.text === SIGN_IN_NOTICE, '2: a Lab notice in the plain style names SIGN IN');
    check(!rows2.some((r) => /talk-refused/.test(r.cls)), '2: no red row');
    check(await page.evaluate(() => document.getElementById('error').hidden), '2: no error bar');
    check((await page.inputValue('#imagine-text')) === QUESTION, '2: the question is kept in the box');
    const color = await page.$eval('#talk-lines .talk-row:last-child p', (p) => getComputedStyle(p).color);
    note('notice colour', color);
    await shot(page, '2-signed-out-question.png');

    // 3. the shell signs the visitor in; nothing is reloaded
    await page.evaluate(() => { window.__signedIn = true; });
    await page.waitForFunction(() => /signed in/.test(document.getElementById('status').textContent), null, { timeout: 5000 });
    note('status', await page.textContent('#status'));
    const rows3 = await strip(page);
    check(rows3[rows3.length - 1].text === SIGNED_IN_NOTICE, '3: a Lab row says the visitor is signed in');
    await shot(page, '3-signed-in.png');
    const after = await entryLabel(page);
    check(after === ENTRY_LABELS.enter, '3: signed in, the intro\'s last button reads "' + after + '"');
    await shot(page, '3b-intro-signed-in.png');
    await closeIntro(page);

    // 4. ask again: an answer whose words name no memory file
    await page.press('#imagine-text', 'Enter');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#talk-lines .talk-row p')).some((p) => /^This is the double slit rebuilt as a tunnel/.test(p.textContent)), null, { timeout: 15000 });
    await page.waitForFunction(() => !document.getElementById('imagine-text').disabled);
    const rows4 = await strip(page);
    note('strip after the signed-in question', rows4);
    const m = rows4[rows4.length - 1];
    check(m.cls === 'talk-maxi' && m.text === WORDS + ' ↗', '4: Maxi\'s words alone in his own row, last (ending with its link to the drawer)');
    const heard = rows4.filter((r) => r.cls !== 'talk-tony').flatMap((r) => conversationFaults(r.text));
    check(heard.length === 0 && !rows4.some((r) => /From my memories/.test(r.text)), '4: no conversation row but the visitor\'s carries a file name or a backtick: ' + JSON.stringify(heard));
    const q = await page.evaluate(() => {
        const a = document.querySelector('#talk-lines .talk-row:last-child a.talk-to-drawer');
        const g = a && document.getElementById(a.getAttribute('href').slice(1));
        return { href: a ? a.getAttribute('href') : null, head: g ? g.querySelector('h3').textContent : null,
            blocks: g ? Array.from(g.querySelectorAll('.imagination-process')).map((b) => [b.querySelector('b').textContent, Array.from(b.querySelectorAll('p')).map((p) => p.textContent)]) : null };
    });
    note('the question\'s drawer group', q);
    check(q.href === '#imagination-turn-2' && q.head === QUESTION && JSON.stringify(q.blocks) === JSON.stringify([['Designing', ['From my memories: dse-tunnel-rebuild-build.md']]]),
        '4: his row links to the question\'s own drawer group (turn 2), which holds the memory file under Designing');
    check(!rows4.slice(rows3.length).some((r) => r.cls === 'talk-lab'), '4: no Lab notice');
    check(!rows4.slice(rows3.length).some((r) => /talk-refused/.test(r.cls)), '4: no red row');
    check(await page.evaluate(() => document.getElementById('error').hidden), '4: no error bar');
    const ticker4 = await page.textContent('#imagination-ticker');
    check(ticker4 === 'Designing · From my memories', '4: the collapsed ticker reads the label and the lead, never the file name: ' + JSON.stringify(ticker4));
    await shot(page, '4-answer-words-only.png');
    await page.click('#talk-lines .talk-row:last-child a.talk-to-drawer');
    await page.waitForFunction(() => !document.getElementById('imagination-lines').hidden, null, { timeout: 5000 });
    note('ok: 4: the link opens the drawer');
    await shot(page, '4b-drawer-memory-files.png');
    await page.click('#imagination-toggle');   // collapse the drawer again: step 5 reads the ticker

    // 5. a model answer that slips the register: rendered, measured in the drawer, never a stop
    await page.evaluate((r) => { window.__reply = r; }, SLIP_REPLY);
    await page.fill('#imagine-text', SLIP_Q);
    await page.press('#imagine-text', 'Enter');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#talk-lines .talk-maxi p')).some((p) => /^The Tunnel runs/.test(p.textContent)), null, { timeout: 15000 });
    await page.waitForFunction(() => !document.getElementById('imagine-text').disabled);
    const rows5 = await strip(page);
    note('strip after the slip question', rows5.slice(rows4.length));
    const m5 = rows5[rows5.length - 1];
    check(m5.cls === 'talk-maxi' && m5.text === SLIP_WORDS.replace(/`/g, '') + ' ↗', '5: the turn renders Maxi\'s words without backticks (the bare file name as he said it)');
    check(!rows5.slice(rows4.length).some((r) => /talk-refused|talk-thinking/.test(r.cls)) && await page.evaluate(() => document.getElementById('error').hidden), '5: never a stop, never red, no error bar');
    const g5 = await page.evaluate(() => { const g = document.getElementById('imagination-turn-3'); return g ? { head: g.querySelector('h3').textContent, rows: Array.from(g.querySelectorAll('.imagination-process')).flatMap((b) => Array.from(b.querySelectorAll('p')).map((p) => b.querySelector('b').textContent + ': ' + p.textContent)) } : null; });
    note('turn 3\'s drawer group', g5);
    check(g5 && g5.head === SLIP_Q && JSON.stringify(g5.rows) === JSON.stringify(['Designing: From my memories: dse-tunnel-rebuild-card.md', 'Designing: register slip: 4 backticks, 1 file name']),
        '5: turn 3\'s group holds the memory file and the slip count under Designing');
    const ticker5 = await page.textContent('#imagination-ticker');
    check(!/\w\.md\b/.test(ticker5), '5: the ticker shows no file name: ' + JSON.stringify(ticker5));
    await shot(page, '5-slip-turn-ticker.png');
    await page.click('#talk-lines .talk-row:last-child a.talk-to-drawer');
    await page.waitForFunction(() => !document.getElementById('imagination-lines').hidden, null, { timeout: 5000 });
    await shot(page, '5b-slip-turn-drawer.png');
    note('page errors', errors);
    check(errors.length === 0, 'no page errors');
    await ctx.close();
} catch (err) {
    failed = err;
    note('FAILED', String(err && err.stack || err));
} finally {
    await browser.close();
    note('orphan gate after close', { own: ownBrowserPids() });
}
if (failed) { process.exit(1); }
