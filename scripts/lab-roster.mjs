/* Copyright 2023-2026 by Essam Abadir */

/**
 * lab-roster.mjs — the ONE node-side reader of the lab's scene roster and its forked scene files.
 *
 * site/scenes/roster.json (path: site/app-assets/maxi-roster.js ROSTER_SITE_PATH, the page's own) names every scene the
 * lab knows, in the vendored package's roster contract; each row's `source` is a forked scene file beside it, listed with
 * its sha256 and git blob id in site/scenes/FORKED.json. The page loads the same file over http (maxi-lab.js); node loads
 * it here by its file: URL, through the SAME vendored registry module (frqtl-web-pin.mjs), so every reader in node takes
 * the one bag the package normalized.
 *
 *   registry            the vendored package's ./registry module (normalizeRoster, loadRoster, walkthroughById, projectOf, …)
 *   SCENES_REL          'site/scenes' (repo-relative); ROSTER_REL 'site/scenes/roster.json'; FORKED_FILE 'FORKED.json'
 *   rosterHrefIn(dir)   the file: URL of the roster in a scenes directory
 *   forkFaults(dir)     → {faults: [text], roster: bag | null}: every forked file is at <sha8>/<name>.js with sha8 its own
 *                       sha256 prefix, hashes to its entry's sha256 and git blob id; the roster passes the package's
 *                       loadRoster; every row's source is an entry and every entry a row's source; the directory holds
 *                       nothing else
 *   loadLabRoster(dir?) → the bag; THROWS naming every fault
 *   roster              the repo's roster bag, loaded at import (a broken fork fails every importer by name)
 *   sceneFileOf(row)    a row's scene file, repo-relative
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { REPO, distUrl, exportFile } from './frqtl-web-pin.mjs';
import { ROSTER_SITE_PATH } from '../site/app-assets/maxi-roster.js';

export const registry = await import(distUrl(exportFile('./registry')));

export const ROSTER_REL = 'site/' + ROSTER_SITE_PATH;
export const SCENES_REL = path.posix.dirname(ROSTER_REL);
const ROSTER_FILE = path.posix.basename(ROSTER_REL);
export const FORKED_FILE = 'FORKED.json';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
/** git's blob id of `bytes` (sha1 of "blob <length>\0" + bytes): the id the fork's source commit lists for the file. */
export const gitBlobOf = (b) => createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b])).digest('hex');

export const rosterHrefIn = (dir) => pathToFileURL(path.join(dir, ROSTER_FILE)).href;

function filesUnder(dir) {
    return fs.readdirSync(dir, { recursive: true }).map((f) => f.split(path.sep).join('/'))
        .filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();
}

export async function forkFaults(dir) {
    const faults = [];
    const forked = JSON.parse(fs.readFileSync(path.join(dir, FORKED_FILE), 'utf8'));
    const entries = new Map();
    for (const e of forked.files) {
        const m = /^([0-9a-f]{8})\/[a-z0-9-]+\.js$/.exec(e.file);
        if (!m) { faults.push(FORKED_FILE + ': ' + JSON.stringify(e.file) + ' is not <sha8>/<name>.js'); continue; }
        entries.set(e.file, e);
        const abs = path.join(dir, e.file);
        if (!fs.existsSync(abs)) { faults.push(e.file + ': listed in ' + FORKED_FILE + ', missing from ' + dir); continue; }
        const bytes = fs.readFileSync(abs);
        if (sha256(bytes) !== e.sha256) { faults.push(e.file + ': sha256 ' + sha256(bytes) + ', ' + FORKED_FILE + ' says ' + e.sha256); }
        if (gitBlobOf(bytes) !== e.gitBlob) { faults.push(e.file + ': git blob ' + gitBlobOf(bytes) + ', ' + FORKED_FILE + ' says ' + e.gitBlob); }
        if (m[1] !== e.sha256.slice(0, 8)) { faults.push(e.file + ': its directory is not the first 8 hex of its sha256 (' + e.sha256.slice(0, 8) + ')'); }
    }
    let roster = null;
    try { roster = await registry.loadRoster(rosterHrefIn(dir)); }
    catch (e) { faults.push(ROSTER_FILE + ': ' + e.message); }
    if (roster) {
        const used = new Set(roster.rows.map((r) => r.source));
        for (const r of roster.rows) {
            if (!entries.has(r.source)) { faults.push('scene "' + r.id + '": its source ' + r.source + ' is not a forked file of ' + FORKED_FILE); }
        }
        for (const f of entries.keys()) { if (!used.has(f)) { faults.push(f + ': forked, but no roster row names it'); } }
    }
    for (const f of filesUnder(dir)) {
        if (f !== ROSTER_FILE && f !== FORKED_FILE && !entries.has(f)) { faults.push(f + ': in ' + dir + ' but neither the roster, ' + FORKED_FILE + ' nor a forked file'); }
    }
    return { faults, roster: faults.length ? null : roster };
}

export async function loadLabRoster(dir = path.join(REPO, SCENES_REL)) {
    const { faults, roster: bag } = await forkFaults(dir);
    if (faults.length) {
        throw new Error('[lab-roster] the lab\'s scenes in ' + dir + ' are not the fork they say they are:\n  ' + faults.join('\n  ') + '\n(FAIL-LOUD.)');
    }
    return bag;
}

export const roster = await loadLabRoster();

export function sceneFileOf(row) {
    return path.relative(REPO, fileURLToPath(registry.sceneUrlOf(roster, row))).split(path.sep).join('/');
}
