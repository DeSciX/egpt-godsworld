/* Copyright 2023-2026 by Essam Abadir */

/**
 * showcase-link.js — the ONE writer of a showcase tile's link: where a roster row opens on the site that serves
 * the IDE. Every front page (the publisher sites, Gods World) composes its tile hrefs from these two names and types
 * no query, page or origin of its own.
 *
 *   showcaseHref(row)  → 'app.html?preset=author&walkthrough=<id>[&mode=<mode>]', relative to the serving site's root:
 *                        the IDE entry page (site-graph.js::STATIC_APP_PAGE) opened on STUDIO at the row's rung. `mode`
 *                        is the row's EFFECTIVE mode (exhibits.js normalizes it: on a multi-mode rung the mode the row
 *                        names, else the rung's default; null on a single-mode rung, which carries no `mode`), so the
 *                        link opens the mode the tile's still shows.
 *   showcaseUrl(row)   → the same link, absolute on SHOWCASE_SITE.origin: what a front page on ANY other origin uses.
 *                        Whether a page links relative (it is the serving site) or absolute is the page's own fact.
 *   SHOWCASE_SITE      → { app, origin } — the DeSciX app that serves the IDE and its public origin.
 *
 * `row` must be an element of the EXHIBITS array imported from the SAME module instance (the ./registry export):
 * a copied, JSON-deserialized or second-copy row is refused, loudly.
 *
 * It writes no IDE state: the query is a link, read by the one parser (lib/features/ide/deep-link.js::parseDeepLink).
 * The shim cannot import that parser (shim → features is illegal), so the binding is a round-trip conformance test
 * in lib/features/ide/test/showcase-link-round-trip.test.mjs: for every EXHIBITS row the parsed link shows STUDIO,
 * names the row's rung and mode, and is refused by nothing.
 *
 * Host-neutral ESM: it runs unchanged in node and in a page (the `./registry` export).
 */

import { STATIC_APP_PAGE } from '../engine/site-graph.js';
import { EXHIBITS } from './exhibits.js';

/** The IDE surface a showcase tile opens: STUDIO (presets.js PRESETS.author; the round-trip test binds the two). */
const SHOWCASE_SURFACE = 'author';

/** The DeSciX app serving the IDE every showcase tile opens, and its public origin (no trailing slash). */
export const SHOWCASE_SITE = Object.freeze({ app: 'egpt-frqtl', origin: 'https://egpt-frqtl.descix.net' });

/**
 * @param {object} row  an element of EXHIBITS (exhibits.js)
 * @returns {string} the tile's link, relative to the serving site's root
 * @throws {Error} a row that is not on the roster
 */
export function showcaseHref(row) {
    if (EXHIBITS.indexOf(row) === -1) {
        throw new Error('[showcase-link] showcaseHref(row): not a showcase roster row — pass an element of EXHIBITS ' +
            '(lib/shim/registry/exhibits.js), got ' + JSON.stringify(row && { kind: row.kind, id: row.id }) + '. (FAIL-LOUD.)');
    }
    const params = new URLSearchParams();
    params.set('preset', SHOWCASE_SURFACE);
    params.set('walkthrough', row.id);
    if (row.mode !== null) { params.set('mode', row.mode); }
    return STATIC_APP_PAGE + '?' + params.toString();
}

/**
 * @param {object} row  an element of EXHIBITS (exhibits.js), from the same module instance
 * @returns {string} the tile's link, absolute on SHOWCASE_SITE.origin
 * @throws {Error} a row that is not on the roster
 */
export function showcaseUrl(row) {
    return new URL(showcaseHref(row), SHOWCASE_SITE.origin + '/').href;
}
