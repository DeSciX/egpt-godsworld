#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * serve-site.mjs — a strict-port static file server for LOOKING at the site locally.
 *
 *   node scripts/serve-site.mjs --port 5540 [--root .]
 *
 * Serves `--root` (default: the repo root, so the lab is at /site/app.html — a path PREFIX, the
 * way the platform serves it) over http on 127.0.0.1. The port is STRICT: a busy port exits 2,
 * it never drifts to a neighbour. Not a deploy tool — `descix serve` is the platform's own.
 * `createSiteServer(root)` is the same server, unlistened, for an in-process test
 * (scripts/test/sdk-copy.test.mjs); `siteHandler(root)` is its request handler alone, for a host
 * that serves the site beside its own routes (minimaxi/body.mjs).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.glb': 'model/gltf-binary', '.mp4': 'video/mp4', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

/**
 * The static request handler over `root` (a directory): the ONE serving rule (MIME table, path
 * containment, no-store). createSiteServer wraps it; minimaxi/body.mjs mounts it beside its bridge.
 */
export function siteHandler(root) {
    root = path.resolve(root);
    if (!fs.statSync(root).isDirectory()) { throw new Error('[serve-site] the root is not a directory: ' + root); }
    return function (req, res) {
        const url = new URL(req.url, 'http://' + req.headers.host);
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith('/')) { rel += 'index.html'; }
        const file = path.resolve(root, '.' + rel);
        if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
        fs.stat(file, function (err, st) {
            if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404 ' + rel); return; }
            res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
            fs.createReadStream(file).pipe(res);
        });
    };
}

/** The static server over `root` (a directory), not yet listening. */
export function createSiteServer(root) {
    return http.createServer(siteHandler(root));
}

function argOf(flag) {
    const i = process.argv.indexOf(flag);
    return i === -1 ? null : process.argv[i + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(argOf('--port'));
    if (!Number.isInteger(port) || port <= 0) { throw new Error('[serve-site] --port <n> is required (strict; never auto-picked).'); }
    const root = path.resolve(argOf('--root') || process.cwd());
    const server = createSiteServer(root);
    server.on('error', function (e) {
        console.error('[serve-site] cannot listen on 127.0.0.1:' + port + ' — ' + e.message + ' (strict port: not retrying another).');
        process.exit(2);
    });
    server.listen(port, '127.0.0.1', function () {
        console.log('[serve-site] http://127.0.0.1:' + port + '/  root=' + root);
    });
}
