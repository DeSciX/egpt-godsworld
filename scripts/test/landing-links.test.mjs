/* Copyright 2023-2026 by Essam Abadir */

/**
 * landing-links.test.mjs — gates on the landing page's links into the FRQTL app (site/index.html):
 *   1. every <a href> is read the way a browser reads it: the tag and its href/class attributes in any case,
 *      with or without spaces around `=`, double-, single- or un-quoted; `&amp;` and numeric character
 *      references (`&#38;`, `&#x26;`) decoded; any other character reference refused by name; the value resolved
 *      against a base so a relative or protocol-relative href is classified by host; an href that still fails
 *      to parse is a FAULT, never a skipped link;
 *   2. a link is the FRQTL app when its host is egpt-frqtl.descix.net (any case, trailing dot) or a descix.net
 *      host serving a path under /prod/egpt-frqtl/;
 *   3. no FRQTL link carries an `experiment` or a `project` query key: FRQTL 0.6.0 deletes the experiments
 *      registry and refuses `?experiment=<id>` by name, so such a link opens on a deep-link error;
 *   4. no FRQTL link repeats its `walkthrough` or `preset` key, and every `walkthrough` id on any FRQTL link is a
 *      scene of the lab's roster (site/scenes/roster.json through scripts/lab-roster.mjs and the vendored package's
 *      walkthroughById). The roster is the ONE owner of the ids this site knows; this gate retypes none. STUDIO resolves
 *      the id against its own roster (the egpt-frqtl app's media), which this gate does not read;
 *   5. every landing tile that names a scene names it as `?preset=author&walkthrough=<id>`.
 * Every gate is shown red on a planted fault inside its own test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../frqtl-web-pin.mjs';
import { registry, roster } from '../lab-roster.mjs';

const FRQTL_HOST = 'egpt-frqtl.descix.net';
const FRQTL_PATH = '/prod/egpt-frqtl/';
/** Relative hrefs resolve against this; any https origin that is not the FRQTL app classifies the same. */
const RESOLVE_BASE = 'https://landing.invalid/';
const SCENE_KEYS = Object.freeze(['walkthrough', 'experiment', 'project']);
const SINGLE_KEYS = Object.freeze(['walkthrough', 'preset']);
const REFUSED_KEYS = Object.freeze({
    experiment: 'FRQTL 0.6.0 deletes the experiments registry and refuses ?experiment=<id> by name; link ?walkthrough=<rung id>',
    project: 'a landing link names a registry rung, never a saved project; link ?walkthrough=<rung id>',
});

/** The lab roster's id resolver (id → scene row | null), through the package's own reader. */
const byId = (id) => registry.walkthroughById(roster, id);

/** The value of attribute `name` in a tag's attribute text, as written (undecoded), or null. */
function attr(attrs, name) {
    const re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
    const m = re.exec(attrs);
    return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/** An attribute value decoded as a browser does for `&amp;` and numeric references; other references refused. */
function decodeRefs(value) {
    const refused = [];
    const text = value.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));?/g, (whole, dec, hex, named) => {
        if (named !== undefined) {
            if (named.toLowerCase() === 'amp' && whole.endsWith(';')) return '&';
            if (!whole.endsWith(';')) return whole; // `&experiment=` stays literal in an attribute
            refused.push(whole);
            return whole;
        }
        const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
        try { return String.fromCodePoint(cp); } catch { refused.push(whole); return whole; }
    });
    return { text, refused };
}

function isFrqtl(url) {
    const host = url.hostname.replace(/\.$/, '');
    if (host === FRQTL_HOST) return true;
    return (host === 'descix.net' || host.endsWith('.descix.net')) && url.pathname.startsWith(FRQTL_PATH);
}

/** Every <a href> of `html`: { links: [{ href, url, tile }] for FRQTL links, faults: [] for unreadable hrefs }. */
export function frqtlLinks(html) {
    const links = [];
    const faults = [];
    for (const m of html.matchAll(/<a\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
        const href = attr(m[1], 'href');
        if (href === null) continue;
        const { text, refused } = decodeRefs(href);
        let url;
        try { url = new URL(text.trim(), RESOLVE_BASE); } catch {
            faults.push(href + ': does not parse as a URL, so the gate cannot classify it');
            continue;
        }
        if (refused.length && (isFrqtl(url) || /frqtl/i.test(text))) {
            faults.push(href + ': character reference ' + refused.join(', ') + ' in an FRQTL link; write the character itself or &amp;');
        }
        if (!isFrqtl(url)) continue;
        const cls = attr(m[1], 'class');
        links.push({ href, url, tile: cls !== null && decodeRefs(cls).text.split(/\s+/).includes('tile') });
    }
    return { links, faults };
}

/** The faults of `html`'s FRQTL links against the roster resolver `byId` (id → rung | null). [] when clean. */
export function landingLinkFaults(html, byId) {
    const { links, faults } = frqtlLinks(html);
    for (const { href, url, tile } of links) {
        const q = url.searchParams;
        for (const key of Object.keys(REFUSED_KEYS)) {
            if (q.has(key)) faults.push(href + ': carries ?' + key + '= — ' + REFUSED_KEYS[key]);
        }
        for (const key of SINGLE_KEYS) {
            if (q.getAll(key).length > 1) faults.push(href + ': repeats ?' + key + '= — name it once');
        }
        for (const each of q.getAll('walkthrough')) {
            if (!byId(each)) faults.push(href + ': walkthrough "' + each + '" is not a scene of the lab\'s roster');
        }
        const id = q.get('walkthrough');
        if (!tile || !SCENE_KEYS.some((k) => q.has(k))) continue;
        if (q.get('preset') !== 'author') faults.push(href + ': a scene tile opens with preset=author');
        if (id === null) faults.push(href + ': a scene tile names its scene with ?walkthrough=<rung id>');
    }
    return faults;
}

const INDEX = fs.readFileSync(path.join(REPO, 'site', 'index.html'), 'utf8');

test('the landing page links into FRQTL by walkthrough rung, never by experiment', () => {
    const tiles = frqtlLinks(INDEX).links.filter((l) => l.tile && l.url.searchParams.has('walkthrough'));
    assert.ok(tiles.length > 0, 'no walkthrough tile found in site/index.html: the link parser has gone deaf');
    assert.deepEqual(landingLinkFaults(INDEX, byId), []);
});

test('planted faults are red', () => {
    const F = 'https://egpt-frqtl.descix.net/';
    const ok = [
        '<a class="tile" href="' + F + '?preset=author&walkthrough=blackbody">x</a>',
        "<A CLASS='tile dark' HREF = '" + F + "?preset=author&amp;walkthrough=blackbody'>x</A>",
        '<a href="' + F + '?preset=author#experiment=x">hash is not the query</a>',
        '<a href="https://www.egpt-frqtl.descix.net/?experiment=x">not the app</a>',
        '<a href="app.html">relative, not the app</a>',
    ].join('\n');
    assert.deepEqual(landingLinkFaults(ok, byId), []);
    const EXP = /refuses \?experiment=<id> by name/;
    const plants = [
        ['<a class="tile" href="' + F + '?preset=author&experiment=blackbody">x</a>', EXP],
        ['<a href="' + F + '?experiment=blackbody">footer</a>', EXP],
        ['<a class="tile" href="' + F + '?preset=author&amp;walkthrough=no-such-rung">x</a>', /"no-such-rung" is not a scene of the lab.s roster/],
        ['<a class="tile" href="' + F + '?preset=ide&walkthrough=blackbody">x</a>', /opens with preset=author/],
        ['<a class="tile" href="' + F + '?walkthrough=blackbody">x</a>', /opens with preset=author/],
        ['<a class="tile" href="' + F + '?preset=author&project=blackbody">x</a>', /never a saved project/],
        ['<a class="tile" href="' + F + '?preset=author&expe%72iment=blackbody">x</a>', EXP],
        ['<a class="tile" href="https://EGPT-FRQTL.descix.net/?preset=author&experiment=blackbody">x</a>', EXP],
        ['<a class="tile" href="https://egpt-frqtl.descix.net./?preset=author&experiment=blackbody">x</a>', EXP],
        ['<a class="tile" href="' + F + '?preset=author&walkthrough=">x</a>', /walkthrough "" is not a scene of the lab.s roster/],
        // decoded references
        ['<a class="tile" href="' + F + '?preset=author&#38;experiment=blackbody">x</a>', EXP],
        ['<a class="tile" href="' + F + '?preset=author&#x26;experiment=blackbody">x</a>', EXP],
        ['<a class="tile" href="' + F + '?preset=author&#38experiment=blackbody">x</a>', EXP],
        ['<a class="tile" href="' + F + '?preset=author&semi;walkthrough=blackbody">x</a>', /character reference &semi;/],
        // hrefs resolved against a base, or a fault
        ['<a class="tile" href="//egpt-frqtl.descix.net/?preset=author&experiment=blackbody">x</a>', EXP],
        ['<a class="tile" href="https://[egpt-frqtl">x</a>', /does not parse as a URL/],
        // attribute spellings
        ["<a class='tile' href='" + F + "?preset=author&experiment=blackbody'>x</a>", EXP],
        ['<a class="tile" HREF="' + F + '?preset=author&experiment=blackbody">x</a>', EXP],
        ['<a class="tile" href = "' + F + '?preset=author&experiment=blackbody">x</a>', EXP],
        ['<a class=tile href=' + F + '?preset=author&experiment=blackbody>x</a>', EXP],
        ['<A CLASS="tile" HREF="' + F + '?preset=ide&walkthrough=blackbody">x</A>', /opens with preset=author/],
        ["<a class = 'tile' href=\"" + F + '?preset=ide&walkthrough=blackbody">x</a>', /opens with preset=author/],
        // every FRQTL link, repeated keys, the app addressed by path
        ['<a href="' + F + '?preset=author&walkthrough=bogus">footer</a>', /"bogus" is not a scene of the lab.s roster/],
        ['<a class="tile" href="' + F + '?preset=author&walkthrough=blackbody&walkthrough=bogus">x</a>', /repeats \?walkthrough=/],
        ['<a class="tile" href="' + F + '?preset=ide&preset=author&walkthrough=blackbody">x</a>', /repeats \?preset=/],
        ['<a class="tile" href="https://descix.net/prod/egpt-frqtl/site/app.html?preset=author&experiment=blackbody">x</a>', EXP],
        ['<a href="https://egpt-frqtl.descix.net/prod/egpt-frqtl/site/app.html?walkthrough=bogus">x</a>', /"bogus" is not a scene of the lab.s roster/],
    ];
    for (const [html, re] of plants) {
        const f = landingLinkFaults(html, byId);
        assert.ok(f.some((s) => re.test(s)), 'plant not red: ' + html + ' -> ' + JSON.stringify(f));
    }
});
