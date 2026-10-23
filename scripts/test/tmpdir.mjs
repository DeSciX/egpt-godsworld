/* Copyright 2023-2026 by Essam Abadir */

/**
 * tmpdir.mjs — the ONE maker of the tests' temporary folders.
 *
 * Contract:
 *   testTmpDir(name)    a fresh empty folder <os.tmpdir()>/godsworld-tests-<pid>/<name>-XXXXXX; name is [a-z0-9-]+
 *   testTmpRoot()       this process's root, <os.tmpdir()>/godsworld-tests-<pid> (made on the first testTmpDir)
 *   removeTestTmpRoot() removes every root this process made; safe to call twice
 *   TEST_TMP_PREFIX     'godsworld-tests-'
 *
 * Importing this module registers the removal at process exit (pass or fail) and as a root-level node:test `after`
 * hook, and removes the roots of earlier runs whose process is gone (a run killed by a signal never reaches its exit
 * hook). A test that calls mkdtemp itself leaves its folder behind on every run: tmpdir.test.mjs refuses it by name.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

export const TEST_TMP_PREFIX = 'godsworld-tests-';
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const made = new Set();

export function testTmpRoot() {
    return path.join(os.tmpdir(), TEST_TMP_PREFIX + process.pid);
}

export function testTmpDir(name) {
    if (typeof name !== 'string' || !NAME.test(name)) { throw new Error(`testTmpDir: name ${JSON.stringify(name)} is not [a-z0-9-]+ (it names the folder under ${testTmpRoot()})`); }
    const root = testTmpRoot();
    fs.mkdirSync(root, { recursive: true });
    made.add(root);
    return fs.mkdtempSync(path.join(root, name + '-'));
}

export function removeTestTmpRoot() {
    for (const root of made) { fs.rmSync(root, { recursive: true, force: true }); }
    made.clear();
}

/** The roots under os.tmpdir() whose process no longer runs (ESRCH); never this process's, never a live one's. */
export function deadRoots(dir = os.tmpdir()) {
    const out = [];
    for (const e of fs.readdirSync(dir)) {
        const m = new RegExp('^' + TEST_TMP_PREFIX + '(\\d+)$').exec(e);
        if (!m || Number(m[1]) === process.pid) { continue; }
        try { process.kill(Number(m[1]), 0); } catch (err) { if (err.code === 'ESRCH') { out.push(path.join(dir, e)); } }
    }
    return out;
}

for (const root of deadRoots()) { fs.rmSync(root, { recursive: true, force: true }); }
process.once('exit', removeTestTmpRoot);
after(removeTestTmpRoot);
