/* Copyright 2023-2026 by Essam Abadir */

/**
 * The registry barrel — the module `@descix/frqtl-web/registry` and `@descix/frqtl-node/registry` resolve
 * to (dist/shim/registry/index.js). Host-neutral ESM: it runs unchanged in node and in a page.
 * Each module below owns its own surface; this file only ferries them.
 * lib/shim/package.json {"type":"module"} is why every loader (node, Playwright's transform, bundlers)
 * agrees the tree is ESM, rather than each sniffing the syntax.
 *
 *   walkthrough.js   the walk-through rungs: walkthroughById, effectiveRenderState, modes
 *   exhibits.js      the showcase roster
 *   scene-roster.js  sceneGroups() — THE scene list both views show (the showcase, then the walk-through groups)
 *   scene-source.js  projectOf(id, { mode }) — a rung as a project folder + its renderState (fetch in a page, file read in node)
 */

export * from './walkthrough.js';
export * from './exhibits.js';
export * from './scene-roster.js';
export * from './scene-source.js';
