/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * share.test.mjs — site/share.json passes the published share contract, and site/DeSciXAppSDK.js is the published bridge,
 * each read from the pinned app SDK's own tarball, never re-typed.
 *
 * The owner of the share.json contract is @descix/app-sdk's `./share` export (SHARE_CONTRACT, validateShareJson):
 * the edge, `descix serve` and `descix site upload` all run it, and upload refuses the whole site when it fails.
 * The version and tarball integrity are minimaxi/ask-door.mjs DESCIX_APP_SDK (beside DESCIX_CLI); the module is read
 * from that tarball in npm's cache, so the suite needs no install of the SDK. A missing tarball is a thrown error
 * naming `npm cache add <name>@<version>`.
 *
 * Gates (each shown red on a planted fault, ws-default-view):
 *   1. the cached tarball hashes to the pinned integrity and is the pinned package;
 *   2. site/share.json validates through the published validateShareJson and starts in CodeSite;
 *   3. the control: the same file with default_view "Bogus" is refused by name;
 *   4. site/DeSciXAppSDK.js equals, byte for byte, the bridge the pinned SDK's `./scaffold` names (SITE_SCAFFOLD_BRIDGE):
 *      the file is generated for one app SDK version, so a pin move without a fresh copy is red; one changed byte is red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DESCIX_APP_SDK } from '../../minimaxi/ask-door.mjs';
import { testTmpDir } from './tmpdir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHARE_TEXT = fs.readFileSync(path.join(ROOT, 'site', 'share.json'), 'utf8');

/** The pinned tarball from npm's cache, checked against the pinned integrity; THROWS naming how to fetch it. */
function cachedTarball(pin) {
    const hex = Buffer.from(pin.integrity.replace(/^sha512-/, ''), 'base64').toString('hex');
    const cache = execFileSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).trim();
    const file = path.join(cache, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
    if (!fs.existsSync(file)) { throw new Error(pin.name + '@' + pin.version + ' is not in npm\'s cache (' + file + '): run `npm cache add ' + pin.name + '@' + pin.version + '`.'); }
    const bytes = fs.readFileSync(file);
    assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), pin.integrity, 'the cached tarball hashes to the pinned integrity');
    return bytes;
}

/**
 * Unpack `members` of the pinned app SDK's tarball, import its export `sub`, and return `use(module)` (awaited) before
 * the unpacked files are removed.
 */
async function withPublished(pin, sub, members, use) {
    const dir = testTmpDir('app-sdk-' + sub.replace(/\W/g, ''));
    try {
        fs.writeFileSync(path.join(dir, 'p.tgz'), cachedTarball(pin));
        execFileSync('tar', ['-xzf', path.join(dir, 'p.tgz'), '-C', dir, 'package/package.json', ...members]);
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package', 'package.json'), 'utf8'));
        assert.equal(pkg.name + '@' + pkg.version, pin.name + '@' + pin.version);
        const entry = pkg.exports && pkg.exports[sub];
        assert.ok(entry, pin.name + '@' + pkg.version + ' exports no ' + sub);
        return await use(await import(pathToFileURL(path.join(dir, 'package', entry)).href));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** The published `./share` module of the pinned app SDK. */
const publishedShare = (pin) => withPublished(pin, './share', ['package/src/util'], (m) => m);

/** The bytes of the bridge the pinned app SDK's `./scaffold` names (SITE_SCAFFOLD_BRIDGE). */
const publishedBridge = (pin) => withPublished(pin, './scaffold', ['package/scaffold'], (m) => fs.readFileSync(m.SITE_SCAFFOLD_BRIDGE));

test('site/share.json passes the published share contract and starts in CodeSite; "Bogus" is refused by name', async () => {
    const { validateShareJson, SHARE_CONTRACT } = await publishedShare(DESCIX_APP_SDK);
    assert.ok(SHARE_CONTRACT.some((f) => f.name === 'default_view'), 'the published contract carries default_view');
    const bag = validateShareJson(JSON.parse(SHARE_TEXT));
    assert.equal(bag.default_view, 'CodeSite');
    const planted = Object.assign(JSON.parse(SHARE_TEXT), { default_view: 'Bogus' });
    assert.throws(() => validateShareJson(planted), /default_view 'Bogus' is not a view/);
});

/** Why the site's bridge copy is not the published one: null when the bytes are equal. */
function bridgeFault(site, published, pin) {
    if (Buffer.compare(site, published) === 0) { return null; }
    let i = 0;
    while (i < site.length && i < published.length && site[i] === published[i]) { i++; }
    return 'site/DeSciXAppSDK.js differs from ' + pin.name + '@' + pin.version + ' scaffold/site/DeSciXAppSDK.js at byte ' + i +
        ' (' + site.length + ' vs ' + published.length + ' bytes): copy the pinned package\'s file (runbook §7.4).';
}

test('site/DeSciXAppSDK.js is the pinned app SDK\'s scaffold bridge, byte for byte (one changed byte is red)', async () => {
    const published = await publishedBridge(DESCIX_APP_SDK);
    const site = fs.readFileSync(path.join(ROOT, 'site', 'DeSciXAppSDK.js'));
    assert.equal(bridgeFault(site, published, DESCIX_APP_SDK), null);
    const planted = Buffer.from(site); planted[planted.length >> 1] ^= 1;
    assert.match(String(bridgeFault(planted, published, DESCIX_APP_SDK)), /differs from .* at byte \d+/, 'a one-byte change must be red');
});
