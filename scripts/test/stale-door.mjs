/* Copyright 2023-2026 by Essam Abadir */

/**
 * stale-door.mjs — the PROD black-lab failure, planted on a local serve, for scripts/test/boot-report.test.mjs and
 * scripts/look/maxi-lab-look-boot-fail.mjs only. Never in site/.
 *
 * STALE_DOOR is the body the edge served for app-assets/frqtl-web-project.js after the 0.6.1-p3.1 bump (the previous
 * upload's door, importing the deleted 0.6.0 tree). serveSite(overrides) is scripts/serve-site.mjs's own handler over the
 * repo root, with named site paths answered from `overrides` instead ({'/site/app-assets/x.js': body}); it listens on an
 * OS-assigned loopback port. withoutBootReporter(html) is app.html with its boot reporter cut out: the negative control.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { siteHandler } from '../serve-site.mjs';
import { REPO } from '../frqtl-web-pin.mjs';

export const STALE_DOOR = "export * from '../vendor/frqtl-web/0.6.0/dist/shim/project/index.js';\n";
export const DOOR_PATH = '/site/app-assets/frqtl-web-project.js';
/** The URL the stale door asks for, relative to the serve's origin: the request that 404s. */
export const MISSING_PATH = '/site/vendor/frqtl-web/0.6.0/dist/shim/project/index.js';

export const APP_HTML = fs.readFileSync(path.join(REPO, 'site', 'app.html'), 'utf8');

const REPORTER = /<script>\n\(function \(\) \{\n {2}var seen = \[\];[\s\S]*?\n<\/script>\n/;

/** app.html without its boot reporter. THROWS when the reporter is not there to cut (the control would measure nothing). */
export function withoutBootReporter(html) {
    if (!REPORTER.test(html)) { throw new Error('[stale-door] app.html carries no boot reporter to cut; the negative control would measure nothing.'); }
    return html.replace(REPORTER, '');
}

export async function serveSite(overrides) {
    const base = siteHandler(REPO);
    const server = http.createServer(function (req, res) {
        const at = new URL(req.url, 'http://x').pathname;
        if (Object.prototype.hasOwnProperty.call(overrides || {}, at)) {
            res.writeHead(200, { 'content-type': at.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
            res.end(overrides[at]);
            return;
        }
        base(req, res);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return { origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) };
}

/** What the page shows about its boot: #status, #error (text and shown), and whether window.MaxiLab exists. */
export function readBoot(page) {
    return page.evaluate(() => {
        const e = document.getElementById('error');
        return { status: document.getElementById('status').textContent, error: e.hidden ? null : e.textContent, lab: !!window.MaxiLab };
    });
}
