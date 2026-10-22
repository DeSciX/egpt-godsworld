/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"   (needs minimaxi's install: npm ci --prefix minimaxi)

/**
 * boot-report.test.mjs — a lab that cannot start says so, naming the URL (app.html's boot reporter).
 *
 * The PROD failure (stale-door.mjs): the edge served the previous project door, which imports the deleted 0.6.0 tree;
 * the 404 killed the lab's module graph before maxi-lab.js ran, and the page sat at "booting …" with nothing painted.
 *   1. the stale door: #status says the lab could not start and #error names the 404'd URL; with the reporter cut out
 *      (the negative control) the page shows nothing, which is red;
 *   2. a module that throws while it runs (a throw planted atop app-assets/maxi-card.js): #error names that module; an
 *      import of an export that is not there (maxi-card.js emptied) names the importing graph's script, maxi-lab.js;
 *   3. the healthy site: the lab boots, and through the WHOLE boot (a MutationObserver from document start, not the end state,
 *      which maxi-lab.js repaints) #error is never shown, #status never reads "could not start" and no "[maxi-lab boot]" line
 *      reaches the console; the reporter's stand-down planted out is red.
 * Browser: minimaxi's pinned playwright chromium, closed by its handle; the server on an OS-assigned loopback port.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { REPO } from '../frqtl-web-pin.mjs';
import { INTRO_SEEN_KEY } from '../../site/app-assets/maxi-intro.js';
import { STALE_DOOR, DOOR_PATH, MISSING_PATH, APP_HTML, withoutBootReporter, serveSite, readBoot } from './stale-door.mjs';

const CARD_PATH = '/site/app-assets/maxi-card.js';
const CARD_SRC = fs.readFileSync(path.join(REPO, 'site', 'app-assets', 'maxi-card.js'), 'utf8');

function playwright() {
    try { return createRequire(path.join(REPO, 'minimaxi', 'package.json'))('playwright'); }
    catch (e) { throw new Error('[boot-report] playwright is not installed under minimaxi/ — run `npm ci --prefix minimaxi`. ' + e.message); }
}

/** Load app.html from a serve with `overrides`; resolve once the lab boots or the page has painted a verdict (or 20 s pass). */
async function bootOf(browser, overrides, until) {
    const srv = await serveSite(overrides);
    const ctx = await browser.newContext({ viewport: { width: 1232, height: 720 } });
    try {
        await ctx.addInitScript((key) => { try { localStorage.setItem(key, '1'); } catch (e) { /* the gate reads the page either way */ } }, INTRO_SEEN_KEY);
        await ctx.addInitScript(watchBoot);
        const page = await ctx.newPage();
        const bootLines = [];
        page.on('console', (m) => { if (m.text().includes('[maxi-lab boot]')) { bootLines.push(m.text()); } });
        await page.goto(srv.origin + '/site/app.html', { waitUntil: 'load' });
        await page.waitForFunction(until, null, { timeout: 20000 }).catch(() => { /* the faults below say what is missing */ });
        const seen = await page.evaluate(() => window.__bootPainted.slice());
        return Object.assign({ origin: srv.origin, painted: seen, bootLines: bootLines }, await readBoot(page));
    } finally { await ctx.close(); await srv.close(); }
}
/** Init script: records every moment #error is shown and every #status reading "could not start", from document start on. */
function watchBoot() {
    window.__bootPainted = [];
    function look() {
        const e = document.getElementById('error'); const s = document.getElementById('status');
        if (e && !e.hidden) { window.__bootPainted.push('#error shown: ' + e.textContent); }
        if (s && /could not start/.test(s.textContent)) { window.__bootPainted.push('#status: ' + s.textContent); }
    }
    new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
}
const painted = () => !document.getElementById('error').hidden || (window.MaxiLab && window.MaxiLab.state.scene);

/** The faults of a boot that must report `url` as the reason the lab could not start. */
export function reportFaults(b, url) {
    const f = [];
    if (b.lab) { f.push('window.MaxiLab exists; the plant did not stop the lab'); }
    if (b.status !== 'Maxi\'s Lab could not start') { f.push('#status reads ' + JSON.stringify(b.status) + ', not that the lab could not start'); }
    if (!b.error) { f.push('#error is not shown'); }
    else {
        if (!b.error.includes(url)) { f.push('#error does not name ' + url + ': ' + JSON.stringify(b.error)); }
        if (!/could not start/.test(b.error)) { f.push('#error does not say the lab could not start'); }
        if (/\n\s+at |@http/.test(b.error)) { f.push('#error carries a stack trace'); }
    }
    return f;
}

test('a lab that cannot start says so, naming the URL; a healthy lab boots with nothing painted (negative control: the reporter cut out is red)', { timeout: 120000 }, async () => {
    const browser = await playwright().chromium.launch();
    try {
        const stale = await bootOf(browser, { [DOOR_PATH]: STALE_DOOR }, painted);
        assert.deepEqual(reportFaults(stale, stale.origin + MISSING_PATH), [], 'the stale door: ' + JSON.stringify(stale));
        assert.match(stale.error, /HTTP 404/);

        const deaf = await bootOf(browser, { [DOOR_PATH]: STALE_DOOR, '/site/app.html': withoutBootReporter(APP_HTML) }, painted);
        assert.ok(reportFaults(deaf, deaf.origin + MISSING_PATH).length > 0, 'without the reporter the stale door must be red: ' + JSON.stringify(deaf));
        assert.equal(deaf.status, 'booting …', 'without the reporter the page sits at "booting …" (the PROD screen)');

        const thrown = await bootOf(browser, { [CARD_PATH]: "throw new Error('planted: maxi-card.js throws while it runs');\n" + CARD_SRC }, painted);
        assert.deepEqual(reportFaults(thrown, thrown.origin + '/site/app-assets/maxi-card.js'), [], 'a module that throws: ' + JSON.stringify(thrown));
        assert.match(thrown.error, /failed to run/);

        const unlinked = await bootOf(browser, { [CARD_PATH]: 'export {};\n' }, painted);
        assert.deepEqual(reportFaults(unlinked, unlinked.origin + '/site/app-assets/maxi-lab.js'), [], 'an import with no such export: ' + JSON.stringify(unlinked));

        const healthy = await bootOf(browser, {}, () => window.MaxiLab && window.MaxiLab.state.scene && window.MaxiLab.state.scene.tick() > 5);
        assert.equal(healthy.lab, true, 'the healthy site boots: ' + JSON.stringify(healthy));
        assert.deepEqual(healthy.painted, [], 'the healthy boot never paints the reporter, not even for a moment');
        assert.deepEqual(healthy.bootLines, [], 'the healthy boot logs no [maxi-lab boot] line');
        assert.equal(healthy.error, null, 'the healthy site paints no error: ' + JSON.stringify(healthy));
        assert.match(healthy.status, /frqtl-web \d/);
    } finally { await browser.close(); }
});
