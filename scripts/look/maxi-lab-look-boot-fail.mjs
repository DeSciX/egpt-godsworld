#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab-look-boot-fail.mjs — LOOK at a lab that cannot start: the PROD stale project door (scripts/test/stale-door.mjs)
 * on a local serve, in Chromium and in WebKit (Playwright's builds; WebKit stands in for Safari, it is not Safari).
 *
 *   node scripts/look/maxi-lab-look-boot-fail.mjs --out .scratch/boot-fail-look
 *
 * For each engine, at 1232x720 with the intro marked seen: a still once the page has painted its verdict, and the page's
 * #status / #error read back; Chromium also at 390x844 and once with the intro open (what a first visit shows).
 * Checks: #status says the lab could not start; #error names the 404'd URL. The server listens on an OS-assigned loopback
 * port; browsers close by handle; the orphan gate counts browser processes descended from THIS process.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { REPO } from '../frqtl-web-pin.mjs';
import { INTRO_SEEN_KEY } from '../../site/app-assets/maxi-intro.js';
import { STALE_DOOR, DOOR_PATH, MISSING_PATH, serveSite, readBoot } from '../test/stale-door.mjs';

function argOf(flag, dflt) { const i = process.argv.indexOf(flag); return i === -1 ? dflt : process.argv[i + 1]; }
const OUT = path.resolve(argOf('--out', '.scratch/boot-fail-look'));
fs.mkdirSync(OUT, { recursive: true });
const pw = createRequire(path.join(REPO, 'minimaxi', 'package.json'))('playwright');

const log = [];
function note(line, data) {
    log.push({ t: new Date().toISOString(), line, data });
    console.log('[look-boot-fail] ' + line + (data !== undefined ? ' ' + JSON.stringify(data) : ''));
    fs.writeFileSync(path.join(OUT, 'look-boot-fail-log.json'), JSON.stringify(log, null, 2));
}
function ownBrowserPids() {
    const rows = execFileSync('ps', ['-eo', 'pid,ppid,command']).toString().trim().split('\n').slice(1)
        .map((l) => l.trim().split(/\s+/)).map((p) => ({ pid: +p[0], ppid: +p[1], cmd: p.slice(2).join(' ') }));
    const mine = new Set([process.pid]); let grew = true;
    while (grew) { grew = false; for (const r of rows) { if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } } }
    return rows.filter((r) => mine.has(r.pid) && r.pid !== process.pid && /chrome-headless-shell|ms-playwright/.test(r.cmd)).map((r) => r.pid);
}
function check(cond, what, data) { if (!cond) { note('FAILED: ' + what, data); throw new Error('LOOK check failed: ' + what); } note('ok: ' + what, data); }

note('orphan gate before', { own: ownBrowserPids().length });
const srv = await serveSite({ [DOOR_PATH]: STALE_DOOR });
const missing = srv.origin + MISSING_PATH;
const verdict = () => !document.getElementById('error').hidden;
try {
    for (const [engine, views] of [['chromium', [['desktop', { width: 1232, height: 720 }, true], ['phone', { width: 390, height: 844 }, true], ['intro-open', { width: 1232, height: 720 }, false]]],
        ['webkit', [['desktop', { width: 1232, height: 720 }, true]]]]) {
        const browser = await pw[engine].launch();
        try {
            for (const [name, viewport, seen] of views) {
                const ctx = await browser.newContext({ viewport });
                if (seen) { await ctx.addInitScript((key) => { try { localStorage.setItem(key, '1'); } catch (e) { /* read the page either way */ } }, INTRO_SEEN_KEY); }
                const page = await ctx.newPage();
                const consoleErrors = [];
                page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text()); } });
                await page.goto(srv.origin + '/site/app.html', { waitUntil: 'load' });
                await page.waitForFunction(verdict, null, { timeout: 20000 }).catch(() => { /* the checks say what is missing */ });
                await page.waitForTimeout(500);
                const shot = path.join(OUT, engine + '-' + name + '.png');
                await page.screenshot({ path: shot });
                const b = await readBoot(page);
                note(engine + ' ' + name, Object.assign({ still: shot, console: consoleErrors }, b));
                check(b.status === 'Maxi\'s Lab could not start', engine + ' ' + name + ': #status says the lab could not start', b.status);
                check(!!b.error && b.error.includes(missing) && /HTTP 404/.test(b.error), engine + ' ' + name + ': #error names ' + missing, b.error);
                await ctx.close();
            }
        } finally { await browser.close(); }
    }
} finally { await srv.close(); }
note('orphan gate after', { own: ownBrowserPids().length });
