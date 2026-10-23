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
import path from 'node:path';

import { createSiteServer } from '../serve-site.mjs';

import { execFileSync } from 'node:child_process';
import { REPO, PINNED, VENDOR_REL, DIST_REL, packageJson, cachedTarball } from '../frqtl-web-pin.mjs';
import { testTmpDir } from './tmpdir.mjs';
const MANIFEST_PATH = path.join(REPO, DIST_REL, PINNED.distManifest);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The manifest, once its own bytes hash to the pin; THROWS naming both hashes otherwise. */
export function pinnedManifest(bytes, pin = PINNED) {
    const got = sha256(bytes);
    if (got !== pin.distManifestSha256) {
        throw new Error('[sdk-copy] the vendored dist-manifest.json hashes to ' + got + ', not the pinned ' + pin.distManifestSha256 +
            ' (PINNED.json, recorded from ' + pin.npm.tarball + ') — the copy is not the published ' + pin.name + '@' + pin.version + '.');
    }
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (manifest.name !== pin.name || manifest.version !== pin.version) {
        throw new Error('[sdk-copy] the manifest names ' + manifest.name + '@' + manifest.version + ', the pin ' + pin.name + '@' + pin.version + '.');
    }
    return manifest;
}

/** The guide's check against a served `base` (absolute, no trailing slash): {name, version, total, bad[]}. */
export async function checkCopy(base, manifestBytes, pin = PINNED) {
    const manifest = pinnedManifest(manifestBytes, pin);
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
    assert.throws(() => pinnedManifest(tampered), /is not the published @descix\/frqtl-web@/);
    // a wrong pin refuses the true copy: another manifest hash, and another version under the true hash
    const wrongHash = { ...PINNED, distManifestSha256: PINNED.distManifestSha256.replace(/^./, (c) => (c === '0' ? '1' : '0')) };
    assert.throws(() => pinnedManifest(bytes, wrongHash), /is not the published @descix\/frqtl-web@/);
    assert.equal(packageJson().version, PINNED.version, 'the vendored package.json (its exports map feeds the import maps) is the pinned release');
    assert.throws(() => pinnedManifest(bytes, { ...PINNED, version: PINNED.version + '-not' }), (e) => e.message.includes('the manifest names ' + PINNED.name + '@' + PINNED.version + ', the pin ' + PINNED.name + '@' + PINNED.version + '-not'));
});

test('every file the site serves under the boot base hashes to its manifest entry; .js and .wasm carry the guide\'s types', async (t) => {
    const site = await serve(REPO);
    try {
        const base = site.origin + '/' + DIST_REL;
        const r = await checkCopy(base, fs.readFileSync(MANIFEST_PATH));
        assert.deepEqual(r.bad, [], r.bad.length + ' of ' + r.total + ' served files differ');
        t.diagnostic(r.name + '@' + r.version + ': all ' + r.total + ' served files match');
        const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const js = await fetch(base + '/frqtl/parts/index.js');
        assert.match(js.headers.get('content-type') || '', /^text\/javascript\b/, 'a module script must be served as text/javascript');
        const wasm = Object.keys(m.files).filter((f) => f.endsWith('.wasm'));
        assert.ok(wasm.length > 0, 'the manifest lists no .wasm — the engine is missing from the copy');
        for (const f of wasm) {
            const res = await fetch(base + '/' + f, { method: 'HEAD' });
            assert.equal(res.headers.get('content-type'), 'application/wasm', f + ' must be served as application/wasm');
        }
    } finally { await site.close(); }
});

test('negative controls: one flipped byte in a served copy, and a wrong base, both fail the check', async () => {
    const tmp = testTmpDir('sdk-copy');
    try {
        const copy = path.join(tmp, DIST_REL);
        fs.mkdirSync(path.dirname(copy), { recursive: true });
        fs.cpSync(path.join(REPO, DIST_REL), copy, { recursive: true });
        const victim = path.join(copy, 'frqtl', 'parts', 'index.js');
        const buf = fs.readFileSync(victim);
        buf[buf.length >> 1] ^= 0x01;   // one bit of one byte, the length unchanged
        fs.writeFileSync(victim, buf);
        const site = await serve(tmp);
        try {
            const changed = await checkCopy(site.origin + '/' + DIST_REL, fs.readFileSync(MANIFEST_PATH));
            assert.deepEqual(changed.bad.map((b) => b.split(':')[0]), ['frqtl/parts/index.js'], 'the changed file must be the one reported');
            const wrong = await checkCopy(site.origin + '/' + VENDOR_REL + '/' + PINNED.version, fs.readFileSync(MANIFEST_PATH));
            assert.equal(wrong.bad.length, wrong.total, 'a base that serves no SDK must fail every file');
            assert.match(wrong.bad[0], /HTTP 404$/);
        } finally { await site.close(); }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ── the pin itself: every field is read by a gate ─────────────────────────────────────────────

/** Every leaf of PINNED.json a gate verifies (the tests below and minimaxi.test); a field outside this list is unverified, so RED. */
export const PINNED_FIELDS_VERIFIED = Object.freeze([
    'name', 'version', 'copied', 'distManifest', 'distManifestSha256', 'packageJson', 'packageJsonSha256',
    'npm.tarball', 'npm.shasum', 'npm.integrity', 'tarballSha256', 'tarballBytes',
    'node.name', 'node.npm.tarball', 'node.npm.shasum', 'node.npm.integrity', 'node.tarballSha256', 'node.tarballBytes', 'node.distManifestSha256'
]);

function leaves(o, at) {
    return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v)) ? leaves(v, at + k + '.') : [at + k]);
}

/** Unpack a tarball into a fresh temp dir; returns its package/ root (caller removes `dir`). */
function unpack(bytes) {
    const dir = testTmpDir('sdk-copy-tgz');
    fs.writeFileSync(path.join(dir, 'p.tgz'), bytes);
    execFileSync('tar', ['-xzf', path.join(dir, 'p.tgz'), '-C', dir]);
    return { dir, root: path.join(dir, 'package') };
}
function filesUnder(root) {
    return fs.readdirSync(root, { recursive: true }).filter((f) => fs.statSync(path.join(root, f)).isFile()).map((f) => f.split(path.sep).join('/')).sort();
}

test('every PINNED.json field is one a gate verifies (an unread field is red)', () => {
    const fields = leaves(PINNED, '').filter((f) => f !== '_purpose').sort();
    assert.deepEqual(fields, [...PINNED_FIELDS_VERIFIED].sort(), 'PINNED.json fields and the verified list disagree: a field no gate reads can drift silently');
});

test('the registry tarballs are the pinned ones; the vendored tree IS the unpacked web tarball; the node manifest and the installed packages match', () => {
    const web = unpack(cachedTarball(PINNED));
    try {
        const vendored = path.join(REPO, DIST_REL);
        const want = filesUnder(path.join(web.root, PINNED.copied));
        assert.deepEqual(filesUnder(vendored), want, 'the vendored dist and the tarball\'s dist hold different file sets');
        const differ = want.filter((f) => !fs.readFileSync(path.join(vendored, f)).equals(fs.readFileSync(path.join(web.root, PINNED.copied, f))));
        assert.deepEqual(differ, [], 'vendored files differ from the pinned tarball');
        assert.ok(fs.readFileSync(path.join(REPO, VENDOR_REL, PINNED.version, PINNED.packageJson)).equals(fs.readFileSync(path.join(web.root, 'package.json'))), 'the vendored package.json is not the tarball\'s');
    } finally { fs.rmSync(web.dir, { recursive: true, force: true }); }
    const node = unpack(cachedTarball(PINNED.node));
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(node.root, 'package.json'), 'utf8'));
        assert.equal(pkg.name, PINNED.node.name);
        assert.equal(pkg.version, PINNED.version);
        assert.equal(sha256(fs.readFileSync(path.join(node.root, 'dist', PINNED.distManifest))), PINNED.node.distManifestSha256, PINNED.node.name + ': the tarball\'s dist-manifest is not the pinned one');
    } finally { fs.rmSync(node.dir, { recursive: true, force: true }); }
    for (const [name, sha] of [[PINNED.name, PINNED.distManifestSha256], [PINNED.node.name, PINNED.node.distManifestSha256]]) {
        const installed = path.join(REPO, 'minimaxi', 'node_modules', name, 'dist', PINNED.distManifest);
        assert.ok(fs.existsSync(installed), name + ' is not installed under minimaxi/ — run `npm ci --prefix minimaxi`');
        assert.equal(sha256(fs.readFileSync(installed)), sha, name + ': the installed dist-manifest is not the pinned one');
    }
});
