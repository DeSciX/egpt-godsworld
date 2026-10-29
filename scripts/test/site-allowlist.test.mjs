/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * site-allowlist.test.mjs — every file the site ships is on the site upload allowlist, and every allowlist entry is live.
 *
 * `descix site upload` sends only the files .descix/manifests/site.json allowlists; a shipped file the manifest leaves out
 * is a 404 on PROD with nothing said at upload (the lab's site/scenes/ roster, before "scenes/**" was added). The files
 * are scripts/publish-paths.mjs publishedFiles (the one owner of what ships), kept to each manifest source's path; the
 * patterns are read the way the manifest's own _schema/_purpose notes and the handbook (app-developer runbook §7.1) state
 * them, and nothing more:
 *   - an exclude is a bare directory name, matching that name at ANY depth, and is tested BEFORE include (exclude wins);
 *   - an include is a file path relative to the source, or "<dir>/**" for everything under <dir>;
 *   - an empty include matches everything, so an empty include is refused here (the allowlist must be explicit);
 *   - a source whose path is "." or "" is refused (the notes forbid it).
 * Any other pattern shape is not covered by those notes and fails loud rather than being guessed.
 *
 * Gates:
 *   1. every shipped site file is matched by an include and caught by no exclude (red naming each file and the manifest);
 *   2. every include matches at least one shipped file (a stale entry is red).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishedFiles } from '../publish-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = '.descix/manifests/site.json';

const GLOB = /[*?[\]{}!]/;

/** A matcher for one include pattern, or a thrown error naming a shape the manifest's notes do not cover. */
function includeMatcher(pat) {
    if (typeof pat !== 'string' || pat === '') { throw new Error(MANIFEST + ': include entry ' + JSON.stringify(pat) + ' is not a non-empty string'); }
    if (pat.endsWith('/**') && !GLOB.test(pat.slice(0, -3)) && pat.length > 3) {
        const dir = pat.slice(0, -2);
        return (rel) => rel.startsWith(dir);
    }
    if (!GLOB.test(pat) && !pat.startsWith('/') && !pat.endsWith('/')) { return (rel) => rel === pat; }
    throw new Error(MANIFEST + ': include pattern ' + JSON.stringify(pat) + ' has a shape the manifest notes do not cover '
        + '(a file path or "<dir>/**"); state its meaning in the manifest notes before this gate reads it');
}

/** A matcher for one exclude entry (a bare directory name, any depth), or a thrown error for any other shape. */
function excludeMatcher(name) {
    if (typeof name !== 'string' || name === '' || name.includes('/') || GLOB.test(name)) {
        throw new Error(MANIFEST + ': exclude entry ' + JSON.stringify(name) + ' is not a bare directory name, the only exclude '
            + 'shape the manifest notes cover');
    }
    return (rel) => rel.split('/').slice(0, -1).includes(name);
}

/** The faults of a manifest against the shipped files: { unlisted: [{file, why}], stale: [{source, pattern}] }. */
function allowlistFaults(manifest, files) {
    if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) { throw new Error(MANIFEST + ': sources[] is empty'); }
    const unlisted = [];
    const stale = [];
    for (const src of manifest.sources) {
        const sp = src.path;
        if (typeof sp !== 'string' || sp === '' || sp === '.' || sp.startsWith('./') || sp.startsWith('/')) {
            throw new Error(MANIFEST + ': source path ' + JSON.stringify(sp) + ' is refused (the notes forbid "." and a repo-root walk)');
        }
        const include = src.include || [];
        if (include.length === 0) {
            throw new Error(MANIFEST + ': source "' + sp + '" has an empty include, which the CLI reads as match-everything; '
                + 'the site set must be an explicit allowlist');
        }
        const inc = include.map((p) => ({ p, m: includeMatcher(p), hits: 0 }));
        const exc = (src.exclude || []).map((n) => ({ n, m: excludeMatcher(n) }));
        const prefix = sp.replace(/\/+$/, '') + '/';
        for (const f of files.filter((x) => x.startsWith(prefix))) {
            const rel = f.slice(prefix.length);
            const ex = exc.find((e) => e.m(rel));
            const hit = inc.filter((i) => i.m(rel));
            for (const i of hit) { i.hits++; }
            if (ex) { unlisted.push({ file: f, why: 'caught by exclude "' + ex.n + '"' }); }
            else if (hit.length === 0) { unlisted.push({ file: f, why: 'matched by no include of source "' + sp + '"' }); }
        }
        for (const i of inc) { if (i.hits === 0) { stale.push({ source: sp, pattern: i.p }); } }
    }
    return { unlisted, stale };
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
const files = publishedFiles(ROOT);

test('every shipped site file is on the upload allowlist of ' + MANIFEST, () => {
    const { unlisted } = allowlistFaults(manifest, files);
    assert.ok(files.some((f) => f.startsWith('site/')), 'publishedFiles holds no site/ file: the gate would read nothing');
    assert.equal(unlisted.length, 0, unlisted.length + ' shipped file(s) the site upload leaves out (PROD serves them 404); '
        + 'add an include to ' + MANIFEST + ' or stop shipping the file:\n'
        + unlisted.map((u) => '  ' + u.file + ': ' + u.why).join('\n'));
});

test('every include of ' + MANIFEST + ' matches a shipped file', () => {
    const { stale } = allowlistFaults(manifest, files);
    assert.equal(stale.length, 0, stale.length + ' stale include(s) in ' + MANIFEST + ' match no shipped file; delete them:\n'
        + stale.map((s) => '  source "' + s.source + '": ' + JSON.stringify(s.pattern)).join('\n'));
});
