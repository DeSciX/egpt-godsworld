/* Copyright 2023-2026 by Essam Abadir */

/**
 * copy-gate.js — the ONE owner of what shipped copy may look like: the placeholder rules and the
 * segment shape. Every table of viewer-facing copy validates through it at load:
 * lib/shim/registry/exhibits.js (the showcase roster, SHOWCASE_INTRO, SHOWCASE_THROUGH_LINE,
 * SHOWCASE_INVITE) and lib/features/ide/presets.js (PRESET_EXPLAINERS).
 *
 *   assertCopyText(text, where)                        → text   (non-empty, no placeholder)
 *   assertCopyParagraphs(paragraphs, where, { table }) → paragraphs
 *
 * A paragraph is a non-empty segment array; a segment is a string or `{ text, href: URL|null,
 * em?: true }` — a null href is a link not yet known, a string href is https and no stand-in. With
 * `{ table: true }` a paragraph may also be a TABLE paragraph (`{ table: … }`): its structure is the
 * run-once card's input contract (lib/components/run-once-card assertSpec), so this gate does NOT
 * re-enumerate its keys — it walks every string leaf for placeholder text. With `{ table: false }`
 * a table paragraph is refused outright.
 *
 * What a caption SAYS is an editorial pass, never a gate here: this module checks shape only.
 *
 * @module copy-gate
 */

/** Text that marks unfinished copy; shipped copy never contains it. */
export const PLACEHOLDER_TEXT = /\b(TODO|TBD|FIXME|XXX|placeholder|lorem)\b/i;

/** An href that stands in for a link not yet known (declare such a link `href: null` instead). */
export const PLACEHOLDER_HREF = /^(#|$)|example\.(com|org|net)|localhost|127\.0\.0\.1/i;

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Non-empty text with no placeholder in it.
 * @param {*} text
 * @param {string} where  names the copy in the error (e.g. '[exhibits] r8-sun.why')
 * @returns {string} text
 * @throws {Error}
 */
export function assertCopyText(text, where) {
    if (typeof text !== 'string' || text.trim() === '') {
        throw new Error(where + ' must be non-empty text (got ' + JSON.stringify(text) + ').');
    }
    if (PLACEHOLDER_TEXT.test(text)) {
        throw new Error(where + ': placeholder text in shipped copy: ' + JSON.stringify(text));
    }
    return text;
}

function assertSegment(seg, where) {
    if (typeof seg === 'string') { assertCopyText(seg, where); return; }
    if (!seg || typeof seg !== 'object' || typeof seg.text !== 'string') {
        throw new Error(where + ': a segment is neither a string nor { text, href } (got ' + JSON.stringify(seg) + ').');
    }
    assertCopyText(seg.text, where);
    if (!has(seg, 'href') || (seg.href !== null && typeof seg.href !== 'string')) {
        throw new Error(where + ': link segment ' + JSON.stringify(seg.text) +
            ' must declare href as a URL or null (not-yet-known link), got ' + JSON.stringify(seg.href) + '.');
    }
    if (has(seg, 'em') && seg.em !== true) {
        throw new Error(where + ': segment ' + JSON.stringify(seg.text) +
            ' declares em as ' + JSON.stringify(seg.em) + ' — em is true (emphasis) or absent.');
    }
    if (typeof seg.href === 'string' && (PLACEHOLDER_HREF.test(seg.href) || !/^https:\/\//.test(seg.href))) {
        throw new Error(where + ': placeholder or non-https href ' + JSON.stringify(seg.href) +
            ' — a link not yet known is declared null, never a stand-in URL.');
    }
}

function walkLeaves(v, where) {
    if (typeof v === 'string') {
        if (PLACEHOLDER_TEXT.test(v)) { throw new Error(where + ': placeholder text in shipped copy: ' + JSON.stringify(v)); }
        return;
    }
    if (v && typeof v === 'object') { Object.keys(v).forEach((k) => walkLeaves(v[k], where)); }
}

/**
 * A non-empty list of paragraphs, every segment valid; table paragraphs only where allowed.
 * @param {Array} paragraphs
 * @param {string} where
 * @param {{table: boolean}} opts  whether a table paragraph is allowed here (required — no default)
 * @returns {Array} paragraphs
 * @throws {Error}
 */
export function assertCopyParagraphs(paragraphs, where, opts) {
    if (!opts || typeof opts.table !== 'boolean') {
        throw new TypeError('copy-gate: assertCopyParagraphs(' + where + ') needs { table: true|false }.');
    }
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
        throw new Error(where + ' must be a non-empty array of paragraphs (got ' + JSON.stringify(paragraphs) + ').');
    }
    paragraphs.forEach((para, i) => {
        const at = where + ' paragraph ' + i;
        if (Array.isArray(para)) {
            if (para.length === 0) { throw new Error(at + ' is an empty segment array.'); }
            para.forEach((seg) => assertSegment(seg, at));
            return;
        }
        if (para && typeof para === 'object' && has(para, 'table')) {
            if (!opts.table) {
                throw new Error(at + ' is a table paragraph — a table is allowed only in the run-once intro (SHOWCASE_INTRO); ' +
                    'this copy is plain paragraphs.');
            }
            walkLeaves(para.table, at);
            return;
        }
        throw new Error(at + ' is neither a segment array nor a table paragraph (got ' + JSON.stringify(para) + ').');
    });
    return paragraphs;
}
