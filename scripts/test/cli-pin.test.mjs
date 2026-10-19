/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * cli-pin.test.mjs — one @descix/cli version in the published tree, owned by minimaxi/ask-door.mjs DESCIX_CLI.
 *
 * Every `@descix/cli@<spec>` in a published text file (scripts/publish-paths.mjs publishedFiles, outside site/vendor/
 * and this file) is a RUN PIN, whatever the spec: an exact version, a bare major (`@3`), a range or a dist-tag (`@latest`). Each is an
 * `npx -y -p` line, an argv entry, or a doc a reader would run, and each must equal DESCIX_CLI exactly. DESCIX_CLI
 * itself must be an exact version at or above the floor: the platform answers 410 COMMAND_REMOVED to the retired buy
 * verbs of ≤3.x (DEVPLANE, @descix/cli 4.0.0, 2026-10-18). One mention is not a run pin and is excepted by FILE AND
 * PHRASE together: the schema provenance note "@descix/cli@<v> ManifestLoader…" in .descix/manifests/site.json. The
 * same phrase in any other file is a run pin. The pins gated are the ones that ship: a twin-only file is never published
 * and is not read (a pin there is a dated record or a seat's note, never a line a reader runs).
 *
 * Gates (each shown red on a planted fault, ws-cli-400):
 *   1. DESCIX_CLI is an exact version ≥ the floor (the constant moved back to 2.0.4 is red);
 *   2. every run pin in the published tree equals DESCIX_CLI, named by file:line;
 *   3. the classifier's own plants: `@3`, `@latest`, `@3.0.1`, `@^4.0.0` in a script, and the ManifestLoader phrase in
 *      a script, are each a run pin that is not DESCIX_CLI; the note in site.json is not a pin;
 *   4. the scan found the owner's own pin and at least one other file (a scan that reads nothing cannot pass).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DESCIX_CLI } from '../../minimaxi/ask-door.mjs';
import { publishedFiles, isPublished } from '../publish-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url));
const OWNER = 'minimaxi/ask-door.mjs';
const SKIP = [/^site\/vendor\//];
const FLOOR = [4, 0, 0];
// Any spec after `@descix/cli@`, up to whitespace, a quote, a backtick, a closing paren or bracket; trailing
// sentence punctuation is not part of the spec.
const PIN_RE = /@descix\/cli@([^\s'"`)\]]+)/g;
// The one mention that is not a run pin: this file's schema provenance note naming the CLI's ManifestLoader.
const PROVENANCE = Object.freeze({ file: '.descix/manifests/site.json', re: /^@descix\/cli@\S+ ManifestLoader\b/ });

function versionOf(pin) {
    const m = /^@descix\/cli@(\d+)\.(\d+)\.(\d+)$/.exec(pin);
    if (!m) { throw new Error('DESCIX_CLI is not @descix/cli@<major>.<minor>.<patch>: ' + JSON.stringify(pin)); }
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function atLeast(v, floor) {
    for (let i = 0; i < 3; i++) { if (v[i] !== floor[i]) { return v[i] > floor[i]; } }
    return true;
}

/** The run pins in one file's text: [{file, line, pin}] (the provenance note in its own file is left out). */
function pinsIn(file, text) {
    const out = [];
    String(text).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(PIN_RE)) {
            if (file === PROVENANCE.file && PROVENANCE.re.test(line.slice(m.index))) { continue; }
            out.push({ file: file, line: i + 1, pin: '@descix/cli@' + m[1].replace(/[.,;:]+$/, '') });
        }
    });
    return out;
}

/** The files the scan reads: the published ones, less the vendored SDK and this file. */
function scannedFiles() {
    return publishedFiles(ROOT).filter((f) => f !== SELF && !SKIP.some((re) => re.test(f)));
}

/** Every run pin in the published tree. */
function scan() {
    const files = scannedFiles();
    const pins = [];
    for (const f of files) {
        const abs = path.join(ROOT, f);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { continue; }
        const buf = fs.readFileSync(abs);
        if (buf.includes(0)) { continue; }   // binary
        pins.push(...pinsIn(f, buf.toString('utf8')));
    }
    return pins;
}

test('DESCIX_CLI is an exact version at or above the floor (≤3.x hits the 410 on the retired buy verbs)', () => {
    assert.ok(atLeast(versionOf(DESCIX_CLI), FLOOR),
        OWNER + ' DESCIX_CLI is ' + DESCIX_CLI + ', below @descix/cli@' + FLOOR.join('.') + ' — the platform answers 410 COMMAND_REMOVED to ≤3.x.');
});

test('the classifier: any spec is a run pin; the ManifestLoader note is excepted only in site.json', () => {
    const plants = [
        ['scripts/x.mjs', 'npx -y -p @descix/cli@3 descix credits buy', '@descix/cli@3'],
        ['scripts/x.mjs', 'npx -y -p @descix/cli@latest descix whoami', '@descix/cli@latest'],
        ['scripts/x.mjs', "spawn('npx', ['-y', '-p', '@descix/cli@3.0.1', 'descix'])", '@descix/cli@3.0.1'],
        ['docs/x.md', 'run `npx -y -p @descix/cli@^4.0.0 descix serve`.', '@descix/cli@^4.0.0'],
        ['scripts/x.mjs', '// @descix/cli@1.0.20 ManifestLoader descix credits buy', '@descix/cli@1.0.20']
    ];
    for (const [file, text, want] of plants) {
        const got = pinsIn(file, text);
        assert.deepEqual(got.map((p) => p.pin), [want], 'plant ' + JSON.stringify(text) + ' in ' + file + ' must be ONE run pin ' + want);
        assert.notEqual(got[0].pin, DESCIX_CLI, 'plant ' + want + ' must not equal DESCIX_CLI');
    }
    assert.deepEqual(pinsIn(PROVENANCE.file, '  "_schema": "@descix/cli@1.0.20 ManifestLoader.validateSiteManifest: …",'), [],
        'the provenance note in ' + PROVENANCE.file + ' is not a run pin');
    assert.deepEqual(pinsIn('x.md', 'every command is `npx -y -p ' + DESCIX_CLI + ' descix …`, as measured.').map((p) => p.pin), [DESCIX_CLI],
        'a pin equal to DESCIX_CLI is read whole (the control)');
});

test('every run pin of @descix/cli in the published tree equals DESCIX_CLI', () => {
    const files = scannedFiles();
    assert.ok(files.length > 100 && files.every(isPublished) && !files.includes(SELF), 'the scan reads the published files, less this one: ' + files.length);
    const pins = scan();
    assert.ok(pins.some((h) => h.file === OWNER && h.pin === DESCIX_CLI), 'the scan did not find DESCIX_CLI in ' + OWNER + ' — it read nothing.');
    assert.ok(new Set(pins.map((h) => h.file)).size >= 2, 'the scan found run pins in fewer than two files: ' + JSON.stringify(pins));
    const stray = pins.filter((h) => h.pin !== DESCIX_CLI);
    assert.deepEqual(stray.map((h) => h.file + ':' + h.line + ' ' + h.pin), [],
        'run pins that are not ' + OWNER + ' DESCIX_CLI (' + DESCIX_CLI + '): move each to the constant (a script imports it; a doc names its version).');
});
