/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * host-view.test.mjs — ONE view declarer for the whole site.
 *
 * app-assets/host-view.js is the only code that asks the DeSciX host for a view (the whole frame,
 * CodeSite) and it records the outcome on <html data-descix-view>. Gates:
 *   1. every page that talks to the host (index.html, app.html) loads DeSciXAppSDK.js, then host-view.js,
 *      and app.html loads maxi-lab.js AFTER host-view.js (the lab reads the record host-view.js wrote);
 *   2. no other site script declares a view (no `.view.set(`, no 'SplitView'), and maxi-lab.js reads the
 *      record (dataset.descixView) and fails loud when it is missing.
 * Negative control: the same checks run over main before this change (app.html without host-view.js,
 * maxi-lab.js calling view.set('SplitView')) fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site');
const read = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');
const scriptSrcs = (html) => [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);

test('index.html and app.html load the bridge, then the one declarer host-view.js; app.html loads the lab after it', () => {
    for (const page of ['index.html', 'app.html']) {
        const srcs = scriptSrcs(read(page));
        const sdk = srcs.indexOf('DeSciXAppSDK.js');
        const hv = srcs.indexOf('app-assets/host-view.js');
        assert.ok(sdk !== -1, page + ' does not load DeSciXAppSDK.js');
        assert.ok(hv !== -1, page + ' does not load app-assets/host-view.js (the one view declarer)');
        assert.ok(sdk < hv, page + ' loads host-view.js before the bridge');
    }
    const srcs = scriptSrcs(read('app.html'));
    const lab = srcs.indexOf('app-assets/maxi-lab.js');
    assert.ok(lab !== -1, 'app.html does not load app-assets/maxi-lab.js');
    assert.ok(lab > srcs.indexOf('app-assets/host-view.js'), 'app.html loads maxi-lab.js before host-view.js: the lab would read no record');
});

test('no site script but host-view.js declares a view; maxi-lab.js reads the record and fails loud without it', () => {
    const dir = path.join(SITE, 'app-assets');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js') && n !== 'host-view.js')) {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.ok(!/\.view\s*\.\s*set\s*\(|\bview\.set\b/.test(src), 'app-assets/' + f + ' declares a view itself (view.set): host-view.js is the one declarer');
        assert.ok(!/SplitView/.test(src), 'app-assets/' + f + ' names SplitView');
    }
    const lab = read('app-assets/maxi-lab.js');
    assert.ok(/dataset\.descixView\b/.test(lab), 'maxi-lab.js does not read the host-view record (dataset.descixView)');
    assert.ok(/throw new Error\('\[maxi-lab\] no data-descix-view record/.test(lab), 'maxi-lab.js does not fail loud when the host-view record is missing');
});
