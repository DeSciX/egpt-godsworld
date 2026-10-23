/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * tmpdir.test.mjs — the tests leave nothing in the temp folder (scripts/test/tmpdir.mjs is the one maker of their folders).
 *
 * Gates:
 *   1. ONE MAKER: no file under scripts/test or minimaxi but tmpdir.mjs makes a temp folder or reads the temp folder's path;
 *      a planted direct maker is named;
 *   2. NOTHING SURVIVES: representative test files (the ones that copied clips and stills, and the body's) run in a child
 *      whose temp folder is a fresh empty one; after the child exits that folder is still empty. Negative controls: a planted
 *      test that makes its folder directly leaves it (red); a test that uses the helper and FAILS, and one that exits
 *      mid-run, leave nothing; a root left by a run that was killed is removed by the next run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testTmpDir, testTmpRoot, removeTestTmpRoot, TEST_TMP_PREFIX } from './tmpdir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HELPER = path.join(ROOT, 'scripts', 'test', 'tmpdir.mjs');
const HELPER_URL = pathToFileURL(HELPER).href;
const MAKER = new RegExp('mkd' + 'temp|\\btmp' + 'dir\\(');            // built in parts so this file is not its own hit
const REPRESENTATIVE = ['record-folder', 'seen-memory', 'minimaxi'].map((n) => path.join(ROOT, 'scripts', 'test', n + '.test.mjs'));

/** Each `<repo path>:<line>` under scripts/test and minimaxi (node_modules and out/ skipped) that makes or locates a temp folder itself. */
export function directMakers(root = ROOT) {
    const hits = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!['node_modules', 'out', 'fixtures'].includes(e.name)) { walk(p); } continue; }
            if (!/\.(mjs|js|cjs)$/.test(e.name) || p === path.join(root, 'scripts', 'test', 'tmpdir.mjs')) { continue; }
            fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (MAKER.test(l)) { hits.push(path.relative(root, p) + ':' + (i + 1)); } });
        }
    };
    for (const d of ['scripts/test', 'minimaxi']) { walk(path.join(root, d)); }
    return hits;
}

/** Run test files in a child `node --test` whose TMPDIR is a fresh empty folder; returns {status, left: what is in it after}. */
function runIsolated(files, seed) {
    const tmp = testTmpDir('isolated');
    if (seed) { seed(tmp); }
    const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, env: { ...process.env, TMPDIR: tmp, NODE_TEST_CONTEXT: undefined }, encoding: 'utf8' });
    return { status: r.status, left: fs.readdirSync(tmp).sort(), out: r.stdout + r.stderr };
}

/** Write a planted test file outside the isolated temp folder; returns its path. */
function plant(name, body) {
    const f = path.join(testTmpDir('plant'), name + '.test.mjs');
    fs.writeFileSync(f, "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport os from 'node:os';\nimport path from 'node:path';\n" + body);
    return f;
}

test('the helper: a fresh folder under this run\'s root; a bad name refused by name; removal takes the root', () => {
    const a = testTmpDir('contract'), b = testTmpDir('contract');
    assert.notEqual(a, b);
    assert.equal(path.dirname(a), testTmpRoot());
    assert.equal(path.basename(testTmpRoot()), TEST_TMP_PREFIX + process.pid);
    assert.match(path.basename(a), /^contract-[A-Za-z0-9]{6}$/);
    assert.deepEqual(fs.readdirSync(a), []);
    assert.throws(() => testTmpDir('Bad/Name'), /testTmpDir: name "Bad\/Name" is not \[a-z0-9-\]\+/);
    removeTestTmpRoot();
    assert.equal(fs.existsSync(testTmpRoot()), false);
    removeTestTmpRoot();                                             // twice is safe
});

test('one maker: nothing under scripts/test or minimaxi makes or locates a temp folder but tmpdir.mjs (negative control: a planted direct maker is named)', () => {
    assert.deepEqual(directMakers(), [], 'make the folder with testTmpDir(name) from scripts/test/tmpdir.mjs: a direct one is left behind on every run');
    const copy = testTmpDir('makers');
    fs.mkdirSync(path.join(copy, 'scripts', 'test'), { recursive: true });
    fs.mkdirSync(path.join(copy, 'minimaxi'), { recursive: true });
    fs.writeFileSync(path.join(copy, 'scripts', 'test', 'tmpdir.mjs'), 'const d = fs.mkd' + 'tempSync(x);\n');
    fs.writeFileSync(path.join(copy, 'minimaxi', 'x.mjs'), 'ok\nconst d = fs.mkd' + 'tempSync(path.join(os.tmp' + 'dir(), "x-"));\n');
    assert.deepEqual(directMakers(copy), ['minimaxi/x.mjs:2'], 'the plant is named; the owner is not');
});

test('nothing survives a run: representative test files leave their temp folder empty, on pass, on fail, on exit, and a killed run\'s root goes at the next run (negative control: a test that skips the helper leaves its folder)', () => {
    const rep = runIsolated(REPRESENTATIVE);
    assert.equal(rep.status, 0, rep.out.slice(-3000));
    assert.deepEqual(rep.left, [], 'the representative tests left these in the temp folder');

    const skips = plant('skips-helper', "test('skips the helper', () => { fs.mkd" + "tempSync(path.join(os.tmp" + "dir(), 'planted-')); });\n");
    const red = runIsolated([skips]);
    assert.equal(red.status, 0, red.out);
    assert.equal(red.left.length, 1, 'negative control: the planted direct folder survives, so the gate above is RED on it');
    assert.match(red.left[0], /^planted-/);

    const fails = plant('fails', `import { testTmpDir } from ${JSON.stringify(HELPER_URL)};\ntest('fails', () => { fs.writeFileSync(path.join(testTmpDir('fails'), 'x'), 'x'); assert.fail('planted failure'); });\n`);
    const failed = runIsolated([fails]);
    assert.notEqual(failed.status, 0, 'the planted failure fails');
    assert.deepEqual(failed.left, [], 'a failing test leaves nothing');

    const exits = plant('exits', `import { testTmpDir } from ${JSON.stringify(HELPER_URL)};\ntest('exits', () => { testTmpDir('exits'); process.exit(3); });\n`);
    const exited = runIsolated([exits]);
    assert.notEqual(exited.status, 0);
    assert.deepEqual(exited.left, [], 'a test that exits mid-run leaves nothing');

    const dead = spawnSync(process.execPath, ['-e', '0']).pid;      // a pid whose process is gone
    const killed = runIsolated([fails], (tmp) => { fs.mkdirSync(path.join(tmp, TEST_TMP_PREFIX + dead, 'seen-memory-xxxxxx'), { recursive: true }); });
    assert.deepEqual(killed.left, [], 'a killed run\'s root is removed by the next run');
});
