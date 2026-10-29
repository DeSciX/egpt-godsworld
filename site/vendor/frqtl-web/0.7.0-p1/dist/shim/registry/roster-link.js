/* Copyright 2023-2026 by Essam Abadir */

/**
 * roster-link.js — THE loader of a host's roster: the one reader of `<link rel="frqtl-roster" href>` and the one
 * fetch of the file it names. A surface never fetches a roster itself; the host loads it once per document and
 * passes the bag down.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 *   ROSTER_LINK_REL          'frqtl-roster'
 *   ROSTER_CACHE_BUCKET_MS   the width of the cache-busting bucket a request URL carries on http(s)
 *   rosterLinksOfHtml(html)  → [{ tag, href }] for every `<link rel="frqtl-roster">` in a document's TEXT (an assembler,
 *                            a server or a harness reading HTML it has not parsed; `href` decoded, null when absent).
 *                            The one reader of the link in text; a parsed document goes through rosterHrefOf.
 *   rosterHrefOf(doc)        → the link's absolute href. THROWS on no link, a second link, a relative href (the
 *                            store-shell reason) or an href with a query or a hash.
 *   rosterRequestUrl(href, now)
 *                            → the URL to request: `href?b=<floor(now / ROSTER_CACHE_BUCKET_MS)>` on http(s), `href`
 *                            unchanged on file: (node). Any other scheme THROWS.
 *   loadRoster(href, { fetch, now })
 *                            → Promise of normalizeRoster(json, href). REJECTS naming the URL on a failed read (a
 *                            non-200 names its status), an empty body or invalid JSON.
 *   sceneOriginRefusalOf(url, { pageOrigin, roster })
 *                            → null when a `?scene=` URL's origin is the page's or the roster's; else the refusal text
 *                            naming the rule and both allowed origins.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero physics — a file read.
 */

import { normalizeRoster, rosterHrefRefusalOf, assertRosterBag } from './roster.js';
import { readText } from '../project/read-text.js';

/** The `rel` of the one link that names a document's roster. */
export const ROSTER_LINK_REL = 'frqtl-roster';

/** Five minutes. Why: the edge caches the uploaded roster for 1 h; this query and the constant are deleted when
 *  the platform's media store gains per-object cache control and the roster uploads uncached. */
export const ROSTER_CACHE_BUCKET_MS = 300000;

const LINK_SHAPE = '<link rel="' + ROSTER_LINK_REL + '" href="https://…">';

const LINK_TAG = new RegExp('<link\\b[^>]*\\brel=["\']' + ROSTER_LINK_REL + '["\'][^>]*>', 'gi');
const HREF_ATTR = /\shref=(["'])([^"']*)\1/i;
const decodeAttr = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * @param {string} html  a document's text
 * @returns {Array<{tag: string, href: string|null}>} every roster link tag in it, in order, with its decoded href
 */
export function rosterLinksOfHtml(html) {
    if (typeof html !== 'string') {
        throw new Error('[roster-link] rosterLinksOfHtml(html) takes the document\'s text; got ' + typeof html + '. (FAIL-LOUD.)');
    }
    return (html.match(LINK_TAG) || []).map((tag) => {
        const m = tag.match(HREF_ATTR);
        return { tag, href: m ? decodeAttr(m[2]) : null };
    });
}

/**
 * @param {Document} doc
 * @returns {string} the roster link's absolute href
 * @throws {Error} no link, two links, or an href that is not an absolute plain file URL
 */
export function rosterHrefOf(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') {
        throw new Error('[roster-link] rosterHrefOf(doc) takes a document; got ' + String(doc) + '. (FAIL-LOUD.)');
    }
    const links = Array.from(doc.querySelectorAll('link[rel~="' + ROSTER_LINK_REL + '"]'));
    if (links.length === 0) {
        throw new Error('[roster-link] this document has no ' + LINK_SHAPE + ' — STUDIO and the GYM read their scene ' +
            'list from the roster it names; the host writes the link into the page. (FAIL-LOUD.)');
    }
    if (links.length > 1) {
        throw new Error('[roster-link] this document has ' + links.length + ' ' + LINK_SHAPE + ' links; a document ' +
            'names exactly one roster. (FAIL-LOUD.)');
    }
    const href = links[0].getAttribute('href');
    const why = rosterHrefRefusalOf(href);
    if (why) { throw new Error('[roster-link] ' + LINK_SHAPE + ': ' + why + ' (FAIL-LOUD.)'); }
    return href;
}

/**
 * @param {string} href  an absolute roster URL
 * @param {number} now   epoch milliseconds
 * @returns {string} the URL to request
 */
export function rosterRequestUrl(href, now) {
    const why = rosterHrefRefusalOf(href);
    if (why) { throw new Error('[roster-link] rosterRequestUrl(href, now): ' + why + ' (FAIL-LOUD.)'); }
    if (!Number.isFinite(now)) {
        throw new Error('[roster-link] rosterRequestUrl(href, now): now is epoch milliseconds (got ' + String(now) + '). (FAIL-LOUD.)');
    }
    const protocol = new URL(href).protocol;
    if (protocol === 'file:') { return href; }
    return href + '?b=' + Math.floor(now / ROSTER_CACHE_BUCKET_MS);
}

/**
 * @param {string} href  an absolute roster URL (rosterHrefOf in a page; a file: URL in node)
 * @param {{fetch?: function, now?: number}} [opts]  fetch is injectable; now defaults to Date.now()
 * @returns {Promise<object>} the normalized roster bag
 */
export function loadRoster(href, opts) {
    return Promise.resolve().then(() => {
        const o = opts || {};
        const url = rosterRequestUrl(href, o.now === undefined ? Date.now() : o.now);
        return readText(url, { fetch: o.fetch }).then((text) => {
            if (text.trim() === '') { throw new Error('[roster-link] roster ' + url + ' is empty. (FAIL-LOUD.)'); }
            let json = null;
            try { json = JSON.parse(text); }
            catch (e) { throw new Error('[roster-link] roster ' + url + ' is not JSON: ' + e.message + ' (FAIL-LOUD.)'); }
            return normalizeRoster(json, href);
        }, (e) => {
            throw new Error('[roster-link] loading the roster failed: ' + e.message + ' (FAIL-LOUD.)');
        });
    });
}

/**
 * @param {string} url  the `?scene=` value, resolved (absolute)
 * @param {{pageOrigin: string, roster: object}} ctx
 * @returns {string|null} null when allowed; else the refusal text
 */
export function sceneOriginRefusalOf(url, ctx) {
    const c = ctx || {};
    assertRosterBag(c.roster, 'sceneOriginRefusalOf(url, { pageOrigin, roster })');
    if (typeof c.pageOrigin !== 'string' || c.pageOrigin === '') {
        throw new Error('[roster-link] sceneOriginRefusalOf(url, { pageOrigin, roster }): pageOrigin is the page\'s ' +
            'location.origin (got ' + JSON.stringify(c.pageOrigin) + '). (FAIL-LOUD.)');
    }
    const rosterOrigin = new URL(c.roster.href).origin;
    let origin = null;
    try { origin = new URL(url).origin; } catch (e) { origin = null; }
    // An opaque origin (a file: or data: URL serializes it as "null") equals nothing, itself included.
    if (origin !== null && origin !== 'null' && (origin === c.pageOrigin || origin === rosterOrigin)) { return null; }
    return 'a scene opens from this page\'s origin (' + c.pageOrigin + ') or its roster\'s origin (' + rosterOrigin +
        '); ' + JSON.stringify(url) + ' is ' + (origin === null ? 'not an absolute URL' : 'on ' + origin) + '.';
}
