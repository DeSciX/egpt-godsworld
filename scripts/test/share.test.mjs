/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * share.test.mjs — site/share.json passes the published share contract, read from the package, never re-typed.
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
 *   3. the control: the same file with default_view "Bogus" is refused by name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DESCIX_APP_SDK } from '../../minimaxi/ask-door.mjs';

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

/** The published `./share` module of the pinned app SDK, imported from its own tarball. */
async function publishedShare(pin) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-sdk-share-'));
    try {
        fs.writeFileSync(path.join(dir, 'p.tgz'), cachedTarball(pin));
        execFileSync('tar', ['-xzf', path.join(dir, 'p.tgz'), '-C', dir, 'package/package.json', 'package/src/util']);
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package', 'package.json'), 'utf8'));
        assert.equal(pkg.name + '@' + pkg.version, pin.name + '@' + pin.version);
        const entry = pkg.exports && pkg.exports['./share'];
        assert.ok(entry, pin.name + '@' + pkg.version + ' exports no ./share');
        return await import(pathToFileURL(path.join(dir, 'package', entry)).href);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('site/share.json passes the published share contract and starts in CodeSite; "Bogus" is refused by name', async () => {
    const { validateShareJson, SHARE_CONTRACT } = await publishedShare(DESCIX_APP_SDK);
    assert.ok(SHARE_CONTRACT.some((f) => f.name === 'default_view'), 'the published contract carries default_view');
    const bag = validateShareJson(JSON.parse(SHARE_TEXT));
    assert.equal(bag.default_view, 'CodeSite');
    const planted = Object.assign(JSON.parse(SHARE_TEXT), { default_view: 'Bogus' });
    assert.throws(() => validateShareJson(planted), /default_view 'Bogus' is not a view/);
});
