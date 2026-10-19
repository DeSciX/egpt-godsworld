/* Copyright 2023-2026 by Essam Abadir */

/**
 * record-folder.mjs — a Record folder on disk, read back into the tree {path → string | bytes} the owner's gate takes
 * (site/app-assets/maxi-record-folder.js recordFolderFaults). Node only. The ONE writer of a folder is the package's
 * (@descix/frqtl-node/eyes writeRecordFolder), handed on here unchanged; the package has no reader, so this file reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { recordFolderFaults } from '../site/app-assets/maxi-record-folder.js';

/** THE node writer of a Record folder, the package's own (@descix/frqtl-node/eyes, MiniMaxi's install): writeRecordFolder({files}, dir). */
export const { writeRecordFolder } = createRequire(path.join(path.dirname(new URL(import.meta.url).pathname), 'package.json'))('@descix/frqtl-node/eyes');

/** Read a folder from disk into the tree: .json and .js/.md files as UTF-8 text, everything else as bytes. */
export function readRecordFolder(dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { throw new Error('[record-folder] no Record folder at ' + dir); }
    const files = {};
    fs.readdirSync(dir, { recursive: true }).map(String).sort().forEach((f) => {
        const p = path.join(dir, f);
        if (!fs.statSync(p).isFile()) { return; }
        const rel = f.split(path.sep).join('/');
        files[rel] = /\.(json|js|mjs|md)$/.test(rel) ? fs.readFileSync(p, 'utf8') : new Uint8Array(fs.readFileSync(p));
    });
    return files;
}

/** The completeness gate on a folder on disk: [] when it is a complete Record. */
export function recordFolderFaultsAt(dir) { return recordFolderFaults(readRecordFolder(dir)); }
