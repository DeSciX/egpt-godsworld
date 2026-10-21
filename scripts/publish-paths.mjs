/* Copyright 2023-2026 by Essam Abadir */

/**
 * publish-paths.mjs — the one owner of which tracked paths are the product: the files published to the public repo,
 * at the paths they have there.
 *
 *   PUBLISHED         the product roots (a trailing "/" is a directory, anything else one file);
 *   PUBLISHED_EXCEPT  the tracked files inside a PUBLISHED root that are not published (each named whole);
 *   isPublished(p)    p sits under a PUBLISHED root and is not in PUBLISHED_EXCEPT (a path of the TWIN);
 *   OVERLAY, OVERLAID, publicPathOf(p)  the publish overlay: the twin's .publish/<p> publishes as <p>;
 *   isPublicPath(p)   p is a path of the PUBLIC tree (the overlay applied);
 *   viewOf(root)      'twin' when the checkout tracks a file under OVERLAY, else 'public';
 *   isPublishedIn(view)  isPublished in the twin, isPublicPath in the public tree;
 *   publishedFiles(root, ref?)  the tracked files of the checkout at root (or of its commit ref), kept to
 *                     isPublishedIn(viewOf(root)), in git's order: the same gate reads the same files in either view.
 *
 * A gate that reads "what ships" walks publishedFiles; it never lists the paths that do not ship.
 */

import { execFileSync } from 'node:child_process';

export const PUBLISHED = Object.freeze(['site/', 'minimaxi/', 'plugin/', 'kb/', 'scripts/', 'docs/rules.md', 'docs/concepts/',
    '.descix/manifests/', 'assets/system_instructions.md', '.publish/', 'LICENSE.md', '.beast/award-policy.md',
    '.github/ISSUE_TEMPLATE/bounty.md']);
export const PUBLISHED_EXCEPT = Object.freeze(['scripts/test/specialists.test.mjs', 'scripts/test/publish-scrub.test.mjs',
    'scripts/test/twin-deps.test.mjs', 'scripts/test/published-tree.test.mjs']);

/** p is r, or sits under r when r is a directory (ends in "/"). */
export const underRoot = (r, p) => p === r || (r.endsWith('/') && p.startsWith(r));
/** p is under any root of list. */
export const underAny = (list, p) => list.some((r) => underRoot(r, p));

export const isPublished = (p) => underAny(PUBLISHED, p) && !PUBLISHED_EXCEPT.includes(p);

/**
 * The publish overlay, as daita-beast publish.sh publish_view applies it: a twin file .publish/<p> publishes as <p> and
 * replaces the twin's own <p>; the twin's root CLAUDE.md never publishes (it is outside PUBLISHED). publish.sh is bash
 * with an inline python step and exports nothing to import, so this is the one copy of that rule here; OVERLAID is held
 * to the twin's own .publish/ files by scripts/test/published-tree.test.mjs.
 */
export const OVERLAY = '.publish/';
export const OVERLAID = Object.freeze(['CLAUDE.md', 'README.md']);
export const publicPathOf = (p) => (p.startsWith(OVERLAY) ? p.slice(OVERLAY.length) : p);

export const isPublicPath = (p) => !PUBLISHED_EXCEPT.includes(p) && (OVERLAID.includes(p) || (underAny(PUBLISHED, p) && !underRoot(OVERLAY, p)));

const gitList = (root, ...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);

/** 'twin' when the checkout at root tracks a file under OVERLAY (the public tree never does: the overlay maps it away), else 'public'. */
export function viewOf(root) {
    return gitList(root, 'ls-files', '-z', '--', OVERLAY).length ? 'twin' : 'public';
}

/** The published-path predicate of a view. */
export function isPublishedIn(view) {
    if (view === 'twin') { return isPublished; }
    if (view === 'public') { return isPublicPath; }
    throw new Error('publish-paths: no view ' + JSON.stringify(view) + ' (twin or public)');
}

/** The tracked files of the checkout at root (or of its commit ref) that are published, in that checkout's view. */
export function publishedFiles(root, ref) {
    const all = ref ? gitList(root, 'ls-tree', '-r', '-z', '--name-only', '--full-tree', ref) : gitList(root, 'ls-files', '-z');
    return all.filter(isPublishedIn(viewOf(root)));
}
