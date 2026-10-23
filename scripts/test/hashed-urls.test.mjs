/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"   (needs minimaxi's install: npm ci --prefix minimaxi)

/**
 * hashed-urls.test.mjs — a site module whose bytes change reaches a browser that cached the old bytes as immutable
 * (scripts/gen-import-maps.mjs moduleRows: every app-assets/*.js is fetched as <url>?v=<content hash>).
 *
 * The PROD failure: the edge served app-assets/frqtl-web-project.js "public, max-age=31536000, immutable" (it guesses that
 * from the file's name), so a browser that loaded the lab before an upload kept the previous door for a year, whatever the
 * edge held next. Here a serve of a copy of site/ answers every non-html file that way (html no-store, as PROD does), and
 * in ONE browser context, in Chromium and in WebKit:
 *   1. the lab loads with door body "one" (a mark the door sets when it runs);
 *   2. the door's bytes change to "two" and the page reloads with its map NOT regenerated — the page as it was before this
 *      gate's change, where nothing in the html changes when a module does: "one" still runs and the door is not asked for
 *      again. That is the negative control: the cache bites, so step 3 can fail;
 *   3. the pages are regenerated (writePages, what --write does): "two" runs, the door was fetched at its new ?v= URL
 *      through maxi-hands.js's RELATIVE import (an import-map key that is the resolved URL remaps it), the plain URL was
 *      never asked for, and the lab boots. writePages(…, false) (what --check runs) names the stale pages before it.
 * And a ?v= URL never names two contents (the platform's purge never reaches a query variant): the version is the module's
 * own bytes' sha256 prefix, two different contents of the site's modules (each module, and each with one byte changed or
 * appended) never share one, and the map's rows are those versions.
 * And a page reaches a site module ONLY through its one versioned tag: each page's module tag rewritten another way (src
 * before type, single quotes, unquoted, type="MODULE") or a <link rel="modulepreload"> added is refused by renderPage
 * (what --check and --write run), naming it.
 * Browsers: minimaxi's pinned playwright, closed by their handles; the server on an OS-assigned loopback port.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { REPO } from '../frqtl-web-pin.mjs';
import { siteHandler } from '../serve-site.mjs';
import { SITE_DIR, MODULE_DIR, PROJECT_DOOR, PAGES, renderProjectDoor, renderPage, strayModuleFaults, writePages, contentVersion, moduleRows } from '../gen-import-maps.mjs';
import { testTmpDir } from './tmpdir.mjs';

function playwright() {
    try { return createRequire(path.join(REPO, 'minimaxi', 'package.json'))('playwright'); }
    catch (e) { throw new Error('[hashed-urls] playwright is not installed under minimaxi/ — run `npm ci --prefix minimaxi`. ' + e.message); }
}

/** A copy of site/ under a temp root: the pages and the modules copied (the gate rewrites them), everything else linked. */
function siteCopy() {
    const root = testTmpDir('hashed-urls');
    const site = path.join(root, 'site');
    fs.mkdirSync(site);
    for (const name of fs.readdirSync(SITE_DIR)) {
        const from = path.join(SITE_DIR, name);
        const copy = name === MODULE_DIR || PAGES.includes(name);
        if (copy) { fs.cpSync(from, path.join(site, name), { recursive: true }); }
        else { fs.symlinkSync(from, path.join(site, name)); }
    }
    return { root, site };
}

/** The site served the way the edge serves it: html no-store, every other file immutable for a year. Logs every request. */
async function serveImmutable(root) {
    const base = siteHandler(root);
    const asked = [];
    const server = http.createServer(function (req, res) {
        asked.push(req.url);
        const html = new URL(req.url, 'http://x').pathname.endsWith('.html');
        const writeHead = res.writeHead;
        res.writeHead = function (code, headers) {
            return writeHead.call(res, code, Object.assign({}, headers, { 'cache-control': html ? 'no-store' : 'public, max-age=31536000, immutable' }));
        };
        base(req, res);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return { origin: 'http://127.0.0.1:' + server.address().port, asked, close: () => new Promise((r) => server.close(r)) };
}

const DOOR_URL = '/site/' + PROJECT_DOOR;
const doorBody = (mark) => renderProjectDoor() + 'globalThis.__doorMark = ' + JSON.stringify(mark) + ';\n';

/** Wait for the lab, then read which door body ran. */
async function markOf(page) {
    await page.waitForFunction(() => window.MaxiLab && typeof globalThis.__doorMark === 'string', null, { timeout: 30000 })
        .catch(() => { /* the assertions say what is missing */ });
    return page.evaluate(() => ({ mark: globalThis.__doorMark || null, lab: !!window.MaxiLab }));
}

async function runIn(engine) {
    const { root, site } = siteCopy();
    const door = path.join(site, PROJECT_DOOR);
    const srv = await serveImmutable(root);
    const browser = await playwright()[engine].launch();
    try {
        const ctx = await browser.newContext({ viewport: { width: 1232, height: 720 } });
        const page = await ctx.newPage();

        fs.writeFileSync(door, doorBody('one'));
        writePages(site);
        await page.goto(srv.origin + '/site/app.html', { waitUntil: 'load' });
        const first = await markOf(page);
        assert.deepEqual(first, { mark: 'one', lab: true }, engine + ': the first load runs door "one" and the lab boots');

        fs.writeFileSync(door, doorBody('two'));
        const before = srv.asked.length;
        await page.reload({ waitUntil: 'load' });
        const control = await markOf(page);
        assert.equal(control.mark, 'one', engine + ': the negative control — with the map not regenerated the cached door "one" runs (the cache honours immutable)');
        assert.deepEqual(srv.asked.slice(before).filter((u) => u.startsWith(DOOR_URL)), [], engine + ': the control asked for no door: it came from the cache');

        const stale = writePages(site, false);
        assert.ok(stale.includes('site/app.html') && stale.includes('site/scene.html'), engine + ': the check names the stale pages once the door changed: ' + JSON.stringify(stale));
        writePages(site);
        const at = srv.asked.length;
        await page.reload({ waitUntil: 'load' });
        const fresh = await markOf(page);
        const asked = srv.asked.slice(at).filter((u) => u.startsWith(DOOR_URL));
        assert.deepEqual(fresh, { mark: 'two', lab: true }, engine + ': after regenerating the pages, the new door "two" runs and the lab boots');
        assert.deepEqual(asked, [DOOR_URL + '?v=' + contentVersion(fs.readFileSync(door))], engine + ': the door was asked for once, at its new content version: ' + JSON.stringify(asked));
        assert.deepEqual(srv.asked.filter((u) => u === DOOR_URL), [], engine + ': the door\'s plain URL was never asked for (every import of it is remapped)');
        await ctx.close();
    } finally {
        await browser.close();
        await srv.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('a changed site module runs in a browser that cached the old one as immutable, in Chromium and WebKit (negative control: the map not regenerated runs the old body)', { timeout: 240000 }, async () => {
    await runIn('chromium');
    await runIn('webkit');
});

/** The faults of `versionOf` over `contents` (Buffers): a version that is not the bytes' own sha256 prefix, or two contents sharing one. */
export function versionFaults(versionOf, contents) {
    const f = [];
    const byV = new Map();
    for (const bytes of contents) {
        const v = versionOf(bytes);
        const own = createHash('sha256').update(bytes).digest('hex');
        if (typeof v !== 'string' || v.length < 16 || !own.startsWith(v)) { f.push('version ' + JSON.stringify(v) + ' is not a 16+ hex prefix of the bytes\' own sha256'); }
        if (byV.has(v) && byV.get(v) !== own) { f.push('two different contents share v=' + v); }
        byV.set(v, own);
    }
    return f;
}

test('a ?v= version is the module\'s own bytes\' hash: two different contents never share one, and the pages carry exactly those (plants are red)', () => {
    const dir = path.join(SITE_DIR, MODULE_DIR);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
    const contents = [];
    for (const f of files) {
        const bytes = fs.readFileSync(path.join(dir, f));
        contents.push(bytes, Buffer.concat([bytes, Buffer.from('\n')]), Buffer.concat([Buffer.from([bytes[0] ^ 1]), bytes.subarray(1)]));
    }
    assert.deepEqual(versionFaults(contentVersion, contents), []);
    assert.equal(contentVersion(contents[0]), contentVersion(Buffer.from(contents[0])), 'the same bytes, the same version');
    const rows = moduleRows();
    assert.deepEqual(Object.keys(rows), files.map((f) => './' + MODULE_DIR + '/' + f), 'every module in ' + MODULE_DIR + '/ has a row');
    for (const f of files) {
        assert.equal(rows['./' + MODULE_DIR + '/' + f], './' + MODULE_DIR + '/' + f + '?v=' + contentVersion(fs.readFileSync(path.join(dir, f))));
    }
    assert.match(versionFaults(() => 'stable0000000000', contents).join(), /two different contents share v=stable0000000000/);
    assert.match(versionFaults((b) => createHash('sha256').update(b).digest('hex').slice(0, 8), contents).join(), /not a 16\+ hex prefix/);
    assert.match(versionFaults(() => String(Date.now()).padStart(16, '0'), contents).join(), /not a 16\+ hex prefix|share/);
});

/** The ways a page could load a site module other than through its one versioned tag, built from that page's own tag. */
export const STRAY_PLANTS = Object.freeze([
    ['src before type', (html, tag, rel) => html.replace(tag, '<script src="./' + rel + '" type="module"></script>')],
    ['single quotes', (html, tag, rel) => html.replace(tag, "<script type='module' src='./" + rel + "'></script>")],
    ['unquoted', (html, tag, rel) => html.replace(tag, '<script type=module src=./' + rel + '></script>')],
    ['type="MODULE"', (html, tag, rel) => html.replace(tag, '<script type="MODULE" src="./' + rel + '"></script>')],
    ['an added modulepreload', (html, tag, rel) => html.replace(tag, '<link rel="modulepreload" href="./' + rel + '">\n' + tag)]
]);

test('a page reaches a site module only through its one versioned tag: every other tag form or a modulepreload, in each page, is refused (plants are red)', () => {
    const rows = moduleRows();
    for (const page of PAGES) {
        const html = fs.readFileSync(path.join(SITE_DIR, page), 'utf8');
        assert.equal(renderPage(html, 'site/' + page).stale, false, 'site/' + page + ' renders as it is');
        const tag = Object.values(rows).map((v) => '<script type="module" src="' + v + '"></script>').find((t) => html.includes(t));
        assert.ok(tag, 'site/' + page + ' carries a versioned module tag to plant on');
        const rel = /src="\.\/([^"?]+)/.exec(tag)[1];
        for (const [label, plant] of STRAY_PLANTS) {
            const planted = plant(html, tag, rel);
            assert.notEqual(planted, html, label + ' planted in site/' + page);
            assert.throws(() => renderPage(planted, 'site/' + page), new RegExp('site/' + page.replace('.', '\\.') + ' reaches a site module other than through its one versioned tag[\\s\\S]*' + rel.replace(/[.-]/g, '\\$&')),
                label + ' in site/' + page + ' must be refused');
        }
    }
    // the tag and link rules stand without a module path to read: an inline module, a second import map, a preload of any script
    assert.match(strayModuleFaults("<script type='MODULE'>import './x.js';</script>").join(), /has a script of type module/);
    assert.match(strayModuleFaults('<script type=importmap>{"imports":{}}</script>').join(), /has a script of type importmap/);
    assert.match(strayModuleFaults('<link href="./vendor/x.js" rel=MODULEPRELOAD>').join(), /preloads a script/);
    assert.match(strayModuleFaults('<link rel="preload" as="script" href="./vendor/x.js">').join(), /preloads a script/);
    assert.deepEqual(strayModuleFaults('<link rel="stylesheet" href="app-assets/maxi-intro.css"><script src="DeSciXAppSDK.js"></script>'), []);
});
