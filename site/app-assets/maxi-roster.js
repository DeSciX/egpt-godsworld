/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-roster.js — WHERE the lab's scene roster is: the one owner of its site path, and the one writer of the page's
 * `<link rel="frqtl-roster">`.
 *
 * site/scenes/roster.json is the one list of the scenes the lab knows, in the package's roster contract
 * (`@descix/frqtl-web/registry` ROSTER_KEYS, normalizeRoster); each row's `source` is a scene file beside it
 * (site/scenes/<sha8>/<name>.js, listed with its hashes in site/scenes/FORKED.json). The package reads a roster only
 * from an ABSOLUTE href (rosterHrefOf refuses a relative one), and the lab is served under several origins and path
 * prefixes (`descix serve`, the PROD shell's frame, MiniMaxi's body, any static server), so the href is formed in the
 * page from the page's own URL: `new URL(ROSTER_SITE_PATH, document.baseURI)`. Every page sits at the site root, so the
 * roster is the one beside the page that loaded it, wherever that page is served.
 *
 *   ROSTER_SITE_PATH      'scenes/roster.json', relative to the site root (node reads the same file: scripts/lab-roster.mjs)
 *   linkRoster(doc, rel)  writes the one `<link rel=rel href=<absolute>>` into doc.head and returns the href; THROWS when
 *                         the page already carries one (this module is its one writer) or rel is not text
 *
 * No import: node imports this file for the path, and the link's `rel` is the package's ROSTER_LINK_REL, passed in by
 * the page (maxi-lab.js), so it is spelled once, by the package.
 */

/** The roster's path relative to the site root. */
export const ROSTER_SITE_PATH = 'scenes/roster.json';

/** Write the page's roster link, absolute off the page's own URL; returns its href. */
export function linkRoster(doc, rel) {
    if (typeof rel !== 'string' || rel === '') {
        throw new Error('[maxi-roster] linkRoster(doc, rel) takes the package\'s ROSTER_LINK_REL, got ' + JSON.stringify(rel) + '. (FAIL-LOUD.)');
    }
    const have = doc.querySelectorAll('link[rel~="' + rel + '"]').length;
    if (have !== 0) {
        throw new Error('[maxi-roster] the page already carries ' + have + ' <link rel="' + rel + '">: maxi-roster.js is the one writer of the ' +
            'roster link, written from the page\'s own URL, so the page itself carries none. (FAIL-LOUD.)');
    }
    const href = new URL(ROSTER_SITE_PATH, doc.baseURI).href;
    const link = doc.createElement('link');
    link.setAttribute('rel', rel);
    link.setAttribute('href', href);
    doc.head.appendChild(link);
    return href;
}
