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
 *   showcase-link.js showcaseHref(row), showcaseUrl(row), SHOWCASE_SITE — a showcase tile's link (relative, absolute)
 *                    and the site that serves it; `row` is an element of THIS barrel's EXHIBITS
 *   studio-landing.js STUDIO_LANDING_ATTR, STUDIO_LANDING_OUTCOMES, recordStudioLanding — how STUDIO resolved the deep
 *                    link it opened with, recorded on <html> (what a gate following a tile reads)
 */

export * from './walkthrough.js';
export * from './exhibits.js';
export * from './scene-roster.js';
export * from './scene-source.js';
export * from './showcase-link.js';
export * from './studio-landing.js';
