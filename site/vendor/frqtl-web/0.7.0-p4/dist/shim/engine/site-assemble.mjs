/* Copyright 2023-2026 by Essam Abadir */

/**
 * site-assemble.mjs — the ONE assembler of a static FRQTL site from the published packages' dists. NODE-ONLY
 * (it writes files): published as `@descix/frqtl-web/site-assemble`, whose browser condition is a refusal. Every
 * consumer runs this one function: FRAQTL's `make static-assemble` (scripts/assemble-static-deploy.mjs, a caller that
 * adds its own gates after it) and a publisher's ship step.
 *
 *   assembleSite({ out, build, rosterHref, webDist, mathDist })
 *       writes the site at `out` in the shape lib/shim/engine/site-graph.js names, and proves it (G-GRAPH):
 *         <out>/STATIC_APP_PAGE + its assets   ← webDist/SITE_STUDIO_DIR/ (STUDIO), with the site's facts written in:
 *                                               the build stamp, the baked import map, the roster <link>
 *         <out>/pub/<build>/<row.dir>/          ← each SITE_PLACEMENTS row's dist, unmodified (STUDIO and the entry
 *                                               pages moved out of it)
 *         <out>/pub/<entry>                     ← each entry page of the dists (site-graph.js::isSiteEntry), its
 *                                               relative URLs re-anchored into pub/<build>/
 *   stampSiteBuild(html, build)    the ONE writer of the build stamp (its one reader: site-graph.js::siteBuildStampOf)
 *   writeRosterLink(html, href)    the ONE writer of `<link rel="frqtl-roster" href="…">` (the assembler and the dev
 *                                  server, lib/server/plugin.js)
 *   placeEntryHtml(html, page, build, graphHas)
 *                                  an entry page of a dist (graph at the dist root) re-anchored for the site (graph
 *                                  under pub/<build>/)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    SITE_GRAPH_DIR, SITE_BUILD_ATTR, SITE_BUILD_ID_RE, STATIC_APP_PAGE, SITE_STUDIO_DIR, SITE_PLACEMENTS, isSiteEntry,
    siteGraphFaults,
} from './site-graph.js';
import { engineRouter, staticSdkBase } from './router.js';
import { spliceRealmImportMap } from '../notebook/vendor-importmap.js';
// The roster link's rel and its href rule have one owner each (lib/shim/registry): this module writes what they read.
import { ROSTER_LINK_REL, rosterLinksOfHtml } from '../registry/roster-link.js';
import { rosterHrefRefusalOf } from '../registry/roster.js';
/** A dist's integrity record (sdk/_build/dist-manifest.cjs writes it at every dist root). */
const DIST_MANIFEST_FILE = 'dist-manifest.json';

const sha256 = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

/**
 * The document with its <html> element stamped <html SITE_BUILD_ATTR="<build>">. THROWS on an invalid build id,
 * a document with no <html> element, or one already stamped. The ONE writer of the stamp.
 * @param {string} html
 * @param {string} build
 * @returns {string}
 */
export function stampSiteBuild(html, build) {
    if (typeof build !== 'string' || !SITE_BUILD_ID_RE.test(build)) {
        throw new Error('[site-assemble] stampSiteBuild: the build id must match ' + SITE_BUILD_ID_RE + ', got ' + JSON.stringify(build) + '.');
    }
    if (!/<html\b/i.test(html) || html.includes(SITE_BUILD_ATTR + '=')) {
        throw new Error('[site-assemble] stampSiteBuild: the document must carry exactly one unstamped <html> element');
    }
    return html.replace(/<html\b/i, '<html ' + SITE_BUILD_ATTR + '="' + build + '"');
}

/** THROWS, naming `where` and the rule (roster.js::rosterHrefRefusalOf), unless `href` can be a roster URL. */
function refuseRosterHref(href, where) {
    const why = rosterHrefRefusalOf(href);
    if (why) { throw new Error('[site-assemble] ' + where + ': ' + why); }
}

/**
 * The document with `<link rel="frqtl-roster" href="<href>">` written before </head>. THROWS on a bad href
 * (roster.js::rosterHrefRefusalOf), a document that already carries a roster link, or one without exactly one </head>.
 * @param {string} html
 * @param {string} href  absolute
 * @returns {string}
 */
export function writeRosterLink(html, href) {
    refuseRosterHref(href, 'writeRosterLink(html, href)');
    if (rosterLinksOfHtml(html).length) {
        throw new Error('[site-assemble] writeRosterLink: the document already carries a <link rel="' + ROSTER_LINK_REL + '"> — one roster per document.');
    }
    if ((html.match(/<\/head>/gi) || []).length !== 1) {
        throw new Error('[site-assemble] writeRosterLink: the document must carry exactly one </head>.');
    }
    const esc = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return html.replace(/<\/head>/i, '    <link rel="' + ROSTER_LINK_REL + '" href="' + esc + '">\n</head>');
}

// ── Entry pages ──────────────────────────────────────────────────────────────

/** A src=/href= value, or a quoted string literal that starts with ./ or ../ (an import, a map address, a URL). */
const RELATIVE_REF = /(\b(?:src|href)=")([^"]*)(")|(["'])(\.\.?\/[^"'\s]*)\4/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/**
 * An ENTRY page of a dist (its graph at the dist root) re-anchored for a site whose graph sits under
 * `<build>/` beside it: every relative URL the page carries outside HTML comments — src=/href= values, import-map
 * addresses, module specifiers, `new URL("…")` literals — that resolves to a graph file or directory is pointed into
 * `<build>/`; one that resolves to another entry page is kept; absolute, fragment and query-only URLs are kept.
 * THROWS on a relative URL leaving the dist root or naming nothing the graph holds.
 *
 * @param {string} html
 * @param {string} page     the page's dist-root-relative path ('sdk.html', 'experiments/empty/index.html')
 * @param {string} build    the build id (the graph's directory name under SITE_GRAPH_DIR/)
 * @param {(distRel: string) => boolean} graphHas  does the graph hold this dist-relative file or directory?
 * @returns {string}
 */
export function placeEntryHtml(html, page, build, graphHas) {
    if (!SITE_BUILD_ID_RE.test(build)) {
        throw new Error('[site-assemble] placeEntryHtml: the build id must match ' + SITE_BUILD_ID_RE + ', got ' + JSON.stringify(build) + '.');
    }
    const pageDir = path.posix.dirname(page);
    const place = (url) => {
        if (url === '' || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url[0] === '#' || url[0] === '?') { return url; }
        const cut = url.search(/[?#]/);
        const p = cut === -1 ? url : url.slice(0, cut);
        const suffix = cut === -1 ? '' : url.slice(cut);
        const distRel = path.posix.normalize(path.posix.join(pageDir, p));
        const bare = distRel.replace(/\/$/, '');
        if (bare === '..' || bare.startsWith('../')) {
            throw new Error('[site-assemble] entry ' + page + ' references "' + url + '", outside the dist root.');
        }
        if (isSiteEntry(bare)) { return url; }
        if (!graphHas(bare)) {
            throw new Error('[site-assemble] entry ' + page + ' references "' + url + '" (' + bare + '), which is neither an ' +
                'entry page nor a file or directory the graph holds — cannot place it.');
        }
        let rel = path.posix.relative(pageDir, build + '/' + bare) + (distRel.endsWith('/') ? '/' : '');
        if (url.startsWith('./') && !rel.startsWith('.')) { rel = './' + rel; }
        return rel + suffix;
    };
    let out = '';
    let last = 0;
    for (const m of html.matchAll(HTML_COMMENT)) {
        out += html.slice(last, m.index).replace(RELATIVE_REF, (whole, a, url, z, q, rel) =>
            (a !== undefined ? a + place(url) + z : q + place(rel) + q)) + m[0];
        last = m.index + m[0].length;
    }
    return out + html.slice(last).replace(RELATIVE_REF, (whole, a, url, z, q, rel) =>
        (a !== undefined ? a + place(url) + z : q + place(rel) + q));
}

// ── The assembly ─────────────────────────────────────────────────────────────

function walkFiles(dir, skip) {
    const out = [];
    (function walk(rel) {
        for (const d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const r = rel ? rel + '/' + d.name : d.name;
            if (skip && skip(r)) { continue; }
            if (d.isDirectory()) { walk(r); continue; }
            if (!d.isFile()) { throw new Error('[site-assemble] ' + path.join(dir, r) + ' is neither a file nor a directory. (FAIL-LOUD.)'); }
            out.push(r);
        }
    })('');
    return out.sort();
}

function readDistManifest(dist, pkg) {
    const file = path.join(dist, DIST_MANIFEST_FILE);
    if (!fs.existsSync(file)) {
        throw new Error('[site-assemble] ' + dist + ' has no ' + DIST_MANIFEST_FILE + ' — it is not a built ' + pkg + ' dist.');
    }
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (m.name !== pkg) {
        throw new Error('[site-assemble] ' + dist + ' is the dist of ' + JSON.stringify(m.name) + ', not ' + pkg + '.');
    }
    return { manifest: m, sha256: sha256(file) };
}

/**
 * Assemble the static site at `out` (wiped first) and prove it. THROWS on a bad argument, a missing STUDIO or
 * vendor manifest in the web dist, an entry page that cannot be placed, or any G-GRAPH fault
 * (site-graph.js::siteGraphFaults — the same rule a publisher runs on a served site).
 *
 * @param {object} o
 * @param {string} o.out         absolute path of the site directory to write
 * @param {string} o.build       the build id (SITE_BUILD_ID_RE): the graph's directory and the stamp
 * @param {string} o.rosterHref  the roster's ABSOLUTE URL, written as the STUDIO page's `<link rel="frqtl-roster">`
 * @param {string} o.webDist     absolute path of a built @descix/frqtl-web dist
 * @param {string} o.mathDist    absolute path of a built @descix/egpt-math-sdk dist
 * @returns {{ out: string, build: string, graphFiles: number, entries: string[], appFiles: string[], releases: string[] }}
 */
export function assembleSite(o) {
    const { out, build, rosterHref, webDist, mathDist } = o || {};
    // STUDIO reads every scene row through <link rel="frqtl-roster" href>, which this call writes.
    refuseRosterHref(rosterHref, 'assembleSite needs `rosterHref`, the roster\'s URL written into STUDIO\'s <link rel="' +
        ROSTER_LINK_REL + '">');
    if (typeof build !== 'string' || !SITE_BUILD_ID_RE.test(build)) {
        throw new Error('[site-assemble] assembleSite: `build` must match ' + SITE_BUILD_ID_RE + ' (got ' + JSON.stringify(build) + ').');
    }
    for (const [k, v] of [['out', out], ['webDist', webDist], ['mathDist', mathDist]]) {
        if (typeof v !== 'string' || !path.isAbsolute(v)) {
            throw new Error('[site-assemble] assembleSite: `' + k + '` must be an absolute path (got ' + JSON.stringify(v) + ').');
        }
    }
    const distOf = { '@descix/frqtl-web': webDist, '@descix/egpt-math-sdk': mathDist };
    const placed = SITE_PLACEMENTS.map((row) => {
        const dist = distOf[row.package];
        if (!dist) { throw new Error('[site-assemble] SITE_PLACEMENTS names ' + row.package + ', which assembleSite is not given a dist for.'); }
        return { row, dist, ...readDistManifest(dist, row.package) };
    });
    const studioDir = path.join(webDist, SITE_STUDIO_DIR);
    if (!fs.existsSync(path.join(studioDir, STATIC_APP_PAGE))) {
        throw new Error('[site-assemble] ' + webDist + ' carries no ' + SITE_STUDIO_DIR + '/' + STATIC_APP_PAGE + ' — STUDIO is built ' +
            'into the @descix/frqtl-web dist by its build (node build.js in sdk/frqtl-web).');
    }

    const outUrl = pathToFileURL(out + path.sep).href;
    const graphDir = fileURLToPath(staticSdkBase(outUrl, build));
    const entryDir = path.dirname(graphDir);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    // 1. STUDIO → the site root.
    fs.cpSync(studioDir, out, { recursive: true });
    // 2. Each placed dist → pub/<build>/<row.dir>, unmodified; the graph-root row first, so a nested row lands inside it.
    for (const p of placed.slice().sort((a, b) => a.row.dir.length - b.row.dir.length)) {
        fs.cpSync(p.dist, p.row.dir ? path.join(graphDir, p.row.dir) : graphDir, { recursive: true });
    }
    fs.rmSync(path.join(graphDir, SITE_STUDIO_DIR), { recursive: true, force: true });
    // 3. Entry pages → pub/<entry>, re-anchored into the graph; the graph keeps no entry copy.
    const graphHas = (rel) => fs.existsSync(path.join(graphDir, rel));
    const entries = walkFiles(graphDir).filter(isSiteEntry);
    for (const rel of entries) {
        const dest = path.join(entryDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, placeEntryHtml(fs.readFileSync(path.join(graphDir, rel), 'utf8'), rel, build, graphHas));
    }
    for (const rel of entries) { fs.rmSync(path.join(graphDir, rel)); }
    (function prune(dir) {
        for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!d.isDirectory()) { continue; }
            const p = path.join(dir, d.name);
            prune(p);
            if (fs.readdirSync(p).length === 0) { fs.rmdirSync(p); }
        }
    })(graphDir);
    // 4. The site's facts in STUDIO's page: the build stamp, the import map (every address through the static router,
    //    document-relative, over the PLACED vendor manifest), the roster link.
    const appPage = path.join(out, STATIC_APP_PAGE);
    const vendorManifest = fileURLToPath(engineRouter({ mode: 'static', documentBaseURI: outUrl, build }).vendorBase + '/manifest.json');
    if (!fs.existsSync(vendorManifest)) {
        throw new Error('[site-assemble] the placed graph has no vendor manifest at ' + vendorManifest + ' — the web dist is incomplete.');
    }
    let html = stampSiteBuild(fs.readFileSync(appPage, 'utf8'), build);
    html = spliceRealmImportMap(html, JSON.parse(fs.readFileSync(vendorManifest, 'utf8')),
        engineRouter({ mode: 'static', documentRelative: true, build }));
    html = writeRosterLink(html, rosterHref);
    fs.writeFileSync(appPage, html);

    // 5. G-GRAPH: the graph, the entries and the site root are the placed releases' bytes.
    const graph = {};
    for (const rel of walkFiles(graphDir)) { graph[rel] = sha256(path.join(graphDir, rel)); }
    const graphName = path.basename(graphDir);
    const entrySet = new Set(walkFiles(entryDir, (r) => r === graphName));
    const app = {};
    for (const rel of walkFiles(out, (r) => r === SITE_GRAPH_DIR)) { app[rel] = sha256(path.join(out, rel)); }
    const releases = placed.map((p) => ({
        dir: p.row.dir, name: p.manifest.name, version: p.manifest.version, files: p.manifest.files,
        manifest: { file: DIST_MANIFEST_FILE, sha256: p.sha256 },
    }));
    const faults = siteGraphFaults({ graph, entries: entrySet, app }, releases);
    if (faults.length) {
        throw new Error('[site-assemble] G-GRAPH: ' + faults.length + ' fault(s) — the site at ' + out + ' is not the placed ' +
            'releases\' bytes:\n  ' + faults.join('\n  '));
    }
    return {
        out, build, graphFiles: Object.keys(graph).length, entries: [...entrySet].sort(), appFiles: Object.keys(app).sort(),
        releases: releases.map((r) => r.name + '@' + r.version),
    };
}
