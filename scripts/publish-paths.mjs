/* Copyright 2023-2026 by Essam Abadir */

/**
 * publish-paths.mjs — the one owner of which tracked paths are the product: the files published to the public repo,
 * at the paths they have there.
 *
 *   PUBLISHED         the product roots (a trailing "/" is a directory, anything else one file);
 *   PUBLISHED_EXCEPT  the tracked files inside a PUBLISHED root that are not published (each named whole);
 *   isPublished(p)    p sits under a PUBLISHED root and is not in PUBLISHED_EXCEPT;
 *   publishedFiles(root)  `git ls-files` of the checkout at root, kept to isPublished, in git's order.
 *
 * A gate that reads "what ships" walks publishedFiles; it never lists the paths that do not ship.
 */

import { execFileSync } from 'node:child_process';

export const PUBLISHED = Object.freeze(['site/', 'minimaxi/', 'plugin/', 'kb/', 'scripts/', 'docs/rules.md', 'docs/concepts/',
    '.descix/manifests/', 'assets/system_instructions.md', '.publish/', 'LICENSE.md']);
export const PUBLISHED_EXCEPT = Object.freeze(['scripts/test/specialists.test.mjs', 'scripts/test/publish-scrub.test.mjs']);

/** p is r, or sits under r when r is a directory (ends in "/"). */
export const underRoot = (r, p) => p === r || (r.endsWith('/') && p.startsWith(r));
/** p is under any root of list. */
export const underAny = (list, p) => list.some((r) => underRoot(r, p));

export const isPublished = (p) => underAny(PUBLISHED, p) && !PUBLISHED_EXCEPT.includes(p);

/** The tracked files of the checkout at root that are published. */
export function publishedFiles(root) {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 })
        .split('\0').filter(Boolean).filter(isPublished);
}
