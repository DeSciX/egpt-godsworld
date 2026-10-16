/* Copyright 2023-2026 by Essam Abadir */

/**
 * The registry barrel — the module `@descix/frqtl-sdk/registry` resolves to
 * (dist/ide/registry/index.js). Host-neutral ESM: it runs unchanged in node and in a page.
 * Each module below owns its own surface; this file only ferries them.
 * The directory is ESM-only; its package.json {"type":"module"} is why every loader (node,
 * Playwright's transform, bundlers) agrees, rather than each sniffing the syntax.
 *
 *   walkthrough.js   the walk-through rungs: walkthroughById, effectiveRenderState, modes
 *   exhibits.js      the showcase roster
 *   experiments.js   the experiment registry and its tiers
 *   scene-source.js  loadSceneSource(id) — a rung's sketch text (fetch in a page, file read in node)
 */

export * from './walkthrough.js';
export * from './exhibits.js';
export * from './experiments.js';
export * from './scene-source.js';
