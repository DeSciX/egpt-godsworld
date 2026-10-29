/* Copyright 2023-2026 by Essam Abadir */

/**
 * The registry barrel — the module `@descix/frqtl-web/registry` and `@descix/frqtl-node/registry` resolve
 * to (dist/shim/registry/index.js). Host-neutral ESM: it runs unchanged in node and in a page.
 * Each module below owns its own surface; this file only ferries them. The package holds no scene rows: a host
 * declares them in its roster, and every reader takes the loaded bag first.
 * lib/shim/package.json {"type":"module"} is why every loader (node, Playwright's transform, bundlers)
 * agrees the tree is ESM, rather than each sniffing the syntax.
 *
 *   roster.js         THE roster contract (ROSTER_KEYS, normalizeRoster) and its readers: scene rows, modes,
 *                     effectiveRenderState, sceneGroups, firstContactOf, the showcase cards and links, sceneUrlOf
 *   roster-link.js    THE loader: rosterHrefOf(document), loadRoster(href), sceneOriginRefusalOf
 *   scene-source.js   projectOf(roster, id, { mode }) and emptyProjectOf({ router }) — a scene as a project folder
 *   studio-landing.js STUDIO_LANDING_ATTR, STUDIO_LANDING_OUTCOMES, recordStudioLanding — how STUDIO resolved the deep
 *                     link it opened with, recorded on <html> (what a gate following a tile reads)
 */

export * from './roster.js';
export * from './roster-link.js';
export * from './scene-source.js';
export * from './studio-landing.js';
