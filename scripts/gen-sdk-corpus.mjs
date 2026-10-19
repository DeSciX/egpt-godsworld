#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * gen-sdk-corpus.mjs — the Builder's knowledge base corpus: the docs the PUBLISHED @descix/frqtl-web ships.
 *
 *   node scripts/gen-sdk-corpus.mjs            # fetch the pinned tarball, verify it, write kb/GodsWorldSDK/
 *   node scripts/gen-sdk-corpus.mjs --check    # exit 1 when kb/GodsWorldSDK/ differs from the tarball's docs
 *
 * The pin is site/vendor/frqtl-web/PINNED.json (npm tarball URL + its sha256, read through scripts/frqtl-web-pin.mjs):
 * the tarball is fetched and REFUSED unless its sha256 equals the pin. The docs are every file of the tarball named
 * *.md, llms.txt or sdk.html, written unchanged under kb/GodsWorldSDK/frqtl-web-<version>/<path inside the package>. Nothing is authored here: the KB holds the
 * package's own words: the published SDK's spec is canonical for egpt-godsworld, so the KB carries it
 * unchanged. The KB is synced from .descix/manifests/GodsWorldSDK.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPO, PINNED as pin } from './frqtl-web-pin.mjs';

export const DOC = /(^|\/)([^/]+\.md|llms\.txt|sdk\.html)$/;
/** kb/GodsWorldSDK holds ONE version — the pinned one; the KB manifest syncs the whole root, so any other file under it is stale. */
const ROOT = path.join(REPO, 'kb', 'GodsWorldSDK');
const OUT = path.join(ROOT, pin.name.split('/')[1] + '-' + pin.version);

async function tarball() {
    const res = await fetch(pin.npm.tarball);
    if (!res.ok) { throw new Error('[gen-sdk-corpus] ' + pin.npm.tarball + ' answered ' + res.status); }
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== pin.tarballSha256) { throw new Error('[gen-sdk-corpus] the tarball sha256 is ' + sha + ', the pin says ' + pin.tarballSha256 + ' — refused.'); }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-corpus-'));
    const file = path.join(dir, 'sdk.tgz');
    fs.writeFileSync(file, buf);
    return { dir, file };
}

export async function docsOfTarball() {
    const t = await tarball();
    const names = execFileSync('tar', ['-tzf', t.file], { encoding: 'utf8' }).split('\n').filter((n) => n.startsWith('package/') && DOC.test(n));
    if (!names.length) { throw new Error('[gen-sdk-corpus] the tarball ships no docs matching ' + DOC.source); }
    const x = path.join(t.dir, 'x');
    fs.mkdirSync(x);
    execFileSync('tar', ['-xzf', t.file, '-C', x].concat(names));
    const docs = names.map((n) => ({ rel: n.slice('package/'.length), bytes: fs.readFileSync(path.join(x, n)) }));
    fs.rmSync(t.dir, { recursive: true, force: true });
    return docs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const check = process.argv[2] === '--check';
    const docs = await docsOfTarball();
    if (check) {
        const prefix = path.relative(ROOT, OUT) + '/';
        const want = docs.map((d) => prefix + d.rel).sort();
        const have = fs.existsSync(ROOT) ? fs.readdirSync(ROOT, { recursive: true }).filter((f) => fs.statSync(path.join(ROOT, f)).isFile()).sort() : [];
        const drift = docs.filter((d) => !fs.existsSync(path.join(OUT, d.rel)) || !fs.readFileSync(path.join(OUT, d.rel)).equals(d.bytes)).map((d) => d.rel)
            .concat(have.filter((f) => want.indexOf(f) === -1).map((f) => f + ' (not shipped by ' + pin.name + '@' + pin.version + ')'));
        if (drift.length) { console.error('[gen-sdk-corpus] STALE: ' + drift.join(', ') + ' — run node scripts/gen-sdk-corpus.mjs'); process.exit(1); }
        console.log('[gen-sdk-corpus] kb/GodsWorldSDK is the tarball\'s ' + docs.length + ' docs.');
    } else {
        fs.rmSync(ROOT, { recursive: true, force: true });
        docs.forEach((d) => { fs.mkdirSync(path.dirname(path.join(OUT, d.rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, d.rel), d.bytes); });
        console.log('[gen-sdk-corpus] wrote ' + docs.length + ' docs of ' + pin.name + '@' + pin.version + ' to ' + path.relative(REPO, OUT) + ': ' + docs.map((d) => d.rel).join(', '));
    }
}
