/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"   (needs minimaxi's install: npm ci --prefix minimaxi)

/**
 * eyes-one-origin.test.mjs — MiniMaxi's eyes see from the body's ONE origin, under the site's sub-path.
 *
 * @descix/frqtl-node's hosted eyes resolve the empty page's modules through the page's own import map, so the vendored
 * dist served under /site/vendor/frqtl-web/<v>/dist/ by the body's one handler is where they boot (minimaxi/body.mjs
 * eyesPageUrl). Gates:
 *   1. body.mjs makes exactly ONE server and hands the eyes eyesPageUrl(origin) of that server — no origin of the dist's own;
 *   2. the eyes, opened at eyesPageUrl(origin) on a server built as the body builds its own (scripts/serve-site.mjs over the
 *      repo root), boot cl1a-mirror from the package's one-file project and take a composite still that is the world's size
 *      and not one flat colour.
 * Browsers: the eyes package's own pinned chromium, disposed by its handle; the server on an OS-assigned loopback port.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { siteHandler } from '../serve-site.mjs';
import { REPO, distUrl, exportFile, sceneFile } from '../frqtl-web-pin.mjs';
import { eyesPageUrl } from '../../minimaxi/body.mjs';

const BODY = path.join(REPO, 'minimaxi', 'body.mjs');
const minimaxiRequire = createRequire(path.join(REPO, 'minimaxi', 'package.json'));
function eyesModule() {
    let resolved;
    try { resolved = minimaxiRequire.resolve('@descix/frqtl-node/eyes'); }
    catch (e) { throw new Error('[eyes-one-origin] @descix/frqtl-node is not installed under minimaxi/ — run `npm ci --prefix minimaxi` (this gate needs the eyes package itself). ' + e.message); }
    return import(pathToFileURL(resolved).href);
}

/** The body's own form of its one origin: scripts/serve-site.mjs's handler over the repo root. */
async function serveLikeTheBody() {
    const server = http.createServer(siteHandler(REPO));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return { origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) };
}

/** The faults of body.mjs's source against gate 1. */
export function bodyOriginFaults(src) {
    const faults = [];
    const servers = (src.match(/\bhttp\.createServer\(/g) || []).length;
    if (servers !== 1) { faults.push('body.mjs makes ' + servers + ' servers; the eyes share the body\'s ONE origin'); }
    const pageUrls = [...src.matchAll(/\bpageUrl:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    if (pageUrls.length !== 1 || pageUrls[0] !== 'eyesPageUrl(origin)') {
        faults.push('body.mjs hands the eyes pageUrl ' + JSON.stringify(pageUrls) + ', not eyesPageUrl(origin) of its one server');
    }
    return faults;
}

test('body.mjs: one server, and the eyes\' pageUrl is eyesPageUrl(origin) of it (negative controls: a second server, a second origin are red)', () => {
    const src = fs.readFileSync(BODY, 'utf8');
    assert.deepEqual(bodyOriginFaults(src), []);
    const second = src.replace("const origin = 'http://127.0.0.1:' + port;",
        "const origin = 'http://127.0.0.1:' + port;\n    const distServer = http.createServer(siteHandler(REPO));");
    assert.notEqual(second, src, 'the plant did not apply');
    assert.match(bodyOriginFaults(second).join('; '), /makes 2 servers/);
    const elsewhere = src.replace('pageUrl: eyesPageUrl(origin),', "pageUrl: eyesOrigin + '/experiments/empty/index.html',");
    assert.notEqual(elsewhere, src, 'the plant did not apply');
    assert.match(bodyOriginFaults(elsewhere).join('; '), /not eyesPageUrl\(origin\)/);
});

test('hosted eyes boot under the site\'s sub-path on the body\'s one origin and take a composite still of the world', async (t) => {
    const { openHostedEyes } = await eyesModule();
    const { sketchProject } = await import(distUrl(exportFile('./project')));
    const source = fs.readFileSync(path.join(REPO, sceneFile('scenes/mirror.js')), 'utf8');
    const one = await serveLikeTheBody();
    const pageUrl = eyesPageUrl(one.origin);
    assert.ok(new URL(pageUrl).pathname.startsWith('/site/vendor/'), 'the eyes\' page is not under the site\'s sub-path: ' + pageUrl);
    let eyes = null;
    try {
        eyes = await openHostedEyes({
            sceneRecord: { seed: 42, sourceRef: 'eyes-one-origin:cl1a-mirror', physicsW: 600, physicsH: 400 },
            sceneSource: Object.assign({ kind: 'project' }, sketchProject(source)),
            pageUrl: pageUrl
        });
        await eyes.driveToTick(20);
        const still = await eyes.vision.getStill('composite');
        assert.ok(still && still.width > 0 && still.height > 0, 'no composite still at ' + pageUrl);
        assert.equal(still.width / still.height, 600 / 400, 'the still is ' + still.width + 'x' + still.height + ', not the 600x400 world\'s shape');
        const px = still.data || still.pixels;
        assert.ok(px && px.length === still.width * still.height * 4, 'the still carries no rgba8 pixels');
        const seen = new Set();
        for (let i = 0; i < px.length && seen.size < 3; i += 4 * 97) { seen.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]); }
        assert.ok(seen.size > 1, 'the composite still is one flat colour: the eyes booted no world at ' + pageUrl);
        t.diagnostic('composite ' + still.width + 'x' + still.height + ' from ' + pageUrl);
    } finally {
        if (eyes) { await eyes.dispose(); }
        await one.close();
    }
});
