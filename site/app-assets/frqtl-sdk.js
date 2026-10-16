/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-sdk.js — the ONE place this site spells where the vendored @descix/frqtl-sdk lives.
 *
 * site/vendor/frqtl-sdk/<version>/dist is the published package's dist/ copied unchanged (pinned by
 * ../vendor/frqtl-sdk/PINNED.json; scripts/test/sdk-copy.test.mjs hashes every served file against
 * the package's own dist-manifest.json). Every other module here imports the SDK through THIS file,
 * through the package's own two browser doors (COMPOSE_AND_CAPTURE.md, "Self-hosting the SDK"):
 *   - `./boot` — dist/esm/index.js: `bootRecipe(mount, source, { base })`, where `base` is the
 *     absolute URL of the vendored dist with no trailing slash (`sdkBase`). The boot resolves every
 *     engine / renderer / game / WASM URL under it and publishes the page's path resolver itself.
 *   - `./registry` — dist/ide/registry/index.js, the relative barrel (this site has no import map):
 *     the walk-through rungs, the EXHIBITS roster and `loadSceneSource(scene)`, which reads a rung's
 *     sketch from the package's own dist root (the same vendored copy, served beside it).
 * One base derived from the document makes the site self-contained under ANY path prefix
 * (/p/egpt-godsworld/ under `descix serve`, /prod/egpt-godsworld/site/ on PROD).
 *
 * scripts/test/hands.test.mjs asserts every specifier below sits under SDK_DIST and that
 * SDK_VERSION equals PINNED.json's version — the two spellings cannot drift apart silently.
 */

export { bootRecipe } from '../vendor/frqtl-sdk/0.5.1/dist/esm/index.js';
export {
    WALKTHROUGH, walkthroughById, walkthroughGroup, walkthroughModes,
    defaultWalkthroughModeId, effectiveRenderState,
    EXHIBITS,
    loadSceneSource, scenePath
} from '../vendor/frqtl-sdk/0.5.1/dist/ide/registry/index.js';

/** The pinned package version (PINNED.json `version`). */
export const SDK_VERSION = '0.5.1';

/** The vendored dist directory, relative to the site root (app.html and scene.html live there). */
export const SDK_DIST = 'vendor/frqtl-sdk/' + SDK_VERSION + '/dist';

/**
 * The boot's `base`: the absolute URL of the vendored dist for a document, no trailing slash.
 * @param {string} documentBaseURI — `document.baseURI` of the page asking.
 * @returns {string}
 */
export function sdkBase(documentBaseURI) {
    if (typeof documentBaseURI !== 'string' || !documentBaseURI) {
        throw new Error('[frqtl-sdk] sdkBase(documentBaseURI) needs the document\'s base URI to anchor the vendored dist.');
    }
    return new URL(SDK_DIST, documentBaseURI).href;
}
