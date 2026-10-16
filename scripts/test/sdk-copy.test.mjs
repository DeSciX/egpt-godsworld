/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * sdk-copy.test.mjs — the SDK copy this site SERVES is the published release.
 *
 * The package's own check (COMPOSE_AND_CAPTURE.md, "Self-hosting the SDK" → "Checking your copy"):
 * `dist/dist-manifest.json` lists every other file of the published dist/ with its sha256; the copy
 * is the release when every file the site SERVES under `base` hashes to its entry, and the manifest
 * itself hashes to the published manifest. The guide reads the manifest from an installed package so
 * a changed copy cannot vouch for itself; this repo vendors by `npm pack` and installs nothing, so the
 * anchor is PINNED.json's `distManifestSha256`, recorded from the packed tarball: the vendored
 * manifest is used only after its own bytes hash to that pin.
 *
 * Gates:
 *   1. the vendored manifest is the pinned one (name, version, own sha256) — a tampered manifest is RED;
 *   2. every served file matches (the guide's loop: fetch base + '/' + file, sha256, compare), and the
 *      host serves .js as text/javascript and .wasm as application/wasm (the guide's content types);
 *   3. negative controls: a copy with one changed byte, and a wrong base, both FAIL the same check.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSiteServer } from '../serve-site.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PINNED = JSON.parse(fs.readFileSync(path.join(REPO, 'site', 'vendor', 'frqtl-sdk', 'PINNED.json'), 'utf8'));
const DIST_REL = 'site/vendor/frqtl-sdk/' + PINNED.version + '/dist';
const MANIFEST_PATH = path.join(REPO, DIST_REL, PINNED.distManifest);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The manifest, once its own bytes hash to the pin; THROWS naming both hashes otherwise. */
export function pinnedManifest(bytes) {
    const got = sha256(bytes);
    if (got !== PINNED.distManifestSha256) {
        throw new Error('[sdk-copy] the vendored dist-manifest.json hashes to ' + got + ', not the pinned ' + PINNED.distManifestSha256 +
            ' (PINNED.json, recorded from ' + PINNED.npm.tarball + ') — the copy is not the published ' + PINNED.name + '@' + PINNED.version + '.');
    }
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (manifest.name !== PINNED.name || manifest.version !== PINNED.version) {
        throw new Error('[sdk-copy] the manifest names ' + manifest.name + '@' + manifest.version + ', the pin ' + PINNED.name + '@' + PINNED.version + '.');
    }
    return manifest;
}

/** The guide's check against a served `base` (absolute, no trailing slash): {name, version, total, bad[]}. */
export async function checkCopy(base, manifestBytes) {
    const manifest = pinnedManifest(manifestBytes);
    const expected = { ...manifest.files };
    expected['dist-manifest.json'] = sha256(manifestBytes);
    const bad = [];
    for (const [file, sha] of Object.entries(expected)) {
        const res = await fetch(base + '/' + file);
        const got = res.ok ? sha256(Buffer.from(await res.arrayBuffer())) : 'HTTP ' + res.status;
        if (got !== sha) { bad.push(file + ': ' + got); }
    }
    return { name: manifest.name, version: manifest.version, total: Object.keys(expected).length, bad };
}

/** Serve `root` on an OS-assigned loopback port; resolves {origin, close()}. */
async function serve(root) {
    const server = createSiteServer(root);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return { origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) };
}

test('the vendored manifest is the pinned one (name, version, own sha256); a tampered manifest is refused', () => {
    const bytes = fs.readFileSync(MANIFEST_PATH);
    const m = pinnedManifest(bytes);
    assert.equal(Object.keys(m.files).length > 0, true);
    const tampered = Buffer.from(bytes.toString('utf8').replace('"version"', '"version" ').replace(/\s$/, ''));
    assert.notEqual(sha256(tampered), PINNED.distManifestSha256, 'the negative control did not change the bytes');
    assert.throws(() => pinnedManifest(tampered), /is not the published @descix\/frqtl-sdk@/);
});

test('every file the site serves under the boot base hashes to its manifest entry; .js and .wasm carry the guide\'s types', async (t) => {
    const site = await serve(REPO);
    try {
        const base = site.origin + '/' + DIST_REL;
        const r = await checkCopy(base, fs.readFileSync(MANIFEST_PATH));
        assert.deepEqual(r.bad, [], r.bad.length + ' of ' + r.total + ' served files differ');
        t.diagnostic(r.name + '@' + r.version + ': all ' + r.total + ' served files match');
        const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const js = await fetch(base + '/esm/index.js');
        assert.match(js.headers.get('content-type') || '', /^text\/javascript\b/, 'a module script must be served as text/javascript');
        const wasm = Object.keys(m.files).filter((f) => f.endsWith('.wasm'));
        assert.ok(wasm.length > 0, 'the manifest lists no .wasm — the engine is missing from the copy');
        for (const f of wasm) {
            const res = await fetch(base + '/' + f, { method: 'HEAD' });
            assert.equal(res.headers.get('content-type'), 'application/wasm', f + ' must be served as application/wasm');
        }
    } finally { await site.close(); }
});

test('negative controls: one changed byte in a served copy, and a wrong base, both fail the check', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-copy-'));
    try {
        const copy = path.join(tmp, DIST_REL);
        fs.mkdirSync(path.dirname(copy), { recursive: true });
        fs.cpSync(path.join(REPO, DIST_REL), copy, { recursive: true });
        fs.appendFileSync(path.join(copy, 'esm', 'index.js'), '\n');
        const site = await serve(tmp);
        try {
            const changed = await checkCopy(site.origin + '/' + DIST_REL, fs.readFileSync(MANIFEST_PATH));
            assert.deepEqual(changed.bad.map((b) => b.split(':')[0]), ['esm/index.js'], 'the changed file must be the one reported');
            const wrong = await checkCopy(site.origin + '/site/vendor/frqtl-sdk/' + PINNED.version, fs.readFileSync(MANIFEST_PATH));
            assert.equal(wrong.bad.length, wrong.total, 'a base that serves no SDK must fail every file');
            assert.match(wrong.bad[0], /HTTP 404$/);
        } finally { await site.close(); }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
