/* Copyright 2023-2026 by Essam Abadir */

/**
 * site-graph.js — the shape of a static FRQTL site: the names a site's documents carry, the directory its
 * build-stamped graph sits in, which published package owns which part of that graph, and the ONE rule that says
 * whether a served graph is those packages' bytes. The ONE owner and the ONE import door of each:
 * lib/shim/engine/router.js and every other consumer import them from here (the router never re-exports them), and a
 * node consumer that reads a SERVED site (a publisher's gate) imports them through the package export
 * `@descix/frqtl-web/site-graph` (or `@descix/frqtl-node/site-graph`), never typing them.
 *
 *   SITE_GRAPH_DIR      'pub' — the site directory holding the fixed entries and, under
 *                       SITE_GRAPH_DIR/<build>/, the build-stamped module graph
 *   SITE_BUILD_ATTR     the <html> attribute of the IDE document carrying <build>
 *   SITE_BUILD_ID_RE    a <build>: the 8-hex-digit short sha of the commit the bundle was built from
 *   siteBuildStampOf    the ONE reader of that stamp
 *   STATIC_APP_PAGE     the IDE bundle's entry document, beside the publisher's front page
 *   SITE_STUDIO_DIR     the @descix/frqtl-web dist directory holding STUDIO (STATIC_APP_PAGE + its assets): the site
 *                       places it at the site ROOT, beside the front page, never in the graph
 *   HOST_PROVIDED_ATTR  the attribute declaring a file host-provided (the publisher vendors it beside the page)
 *   SITE_PLACEMENTS     each published package placed in the graph, and the graph directory it is placed at
 *   SITE_ENTRY_PAGES, isSiteEntry
 *                       the @descix/frqtl-web dist's HTML ENTRIES (reached by navigation or iframe, never loaded as a
 *                       resource): the site keeps them at fixed URLs under SITE_GRAPH_DIR/, outside the stamped graph
 *   siteGraphFaults     the served graph and site root against the placed releases' dist-manifest.json records
 *                       (empty = faithful)
 *   SITE_GRAPH_EXPORTS  the published names (the parity gate holds both packages' ./site-graph to this table)
 *
 * Host-neutral ESM with no imports: it loads unchanged in node and in a page. The node-only assembler that WRITES a
 * site to this shape is lib/shim/engine/site-assemble.mjs (`@descix/frqtl-web/site-assemble`).
 */

/** The names `./site-graph` publishes. */
export const SITE_GRAPH_EXPORTS = Object.freeze([
    'SITE_GRAPH_DIR', 'SITE_BUILD_ATTR', 'SITE_BUILD_ID_RE', 'siteBuildStampOf', 'STATIC_APP_PAGE', 'SITE_STUDIO_DIR',
    'HOST_PROVIDED_ATTR', 'SITE_PLACEMENTS', 'SITE_ENTRY_PAGES', 'isSiteEntry', 'siteGraphFaults',
]);

/** The static site's graph directory name (the entries sit in it, the graph under its build-stamped child). */
export const SITE_GRAPH_DIR = 'pub';

/** The <html> attribute carrying the static site's build id — the cross-repo contract. */
export const SITE_BUILD_ATTR = 'data-frqtl-site-build';

/** A build id: the 8-hex-digit short sha of the commit the bundle was built from. */
export const SITE_BUILD_ID_RE = /^[0-9a-f]{8}$/;

/**
 * The build stamp an HTML document carries on <html SITE_BUILD_ATTR>, or null when absent.
 * THROWS on more than one stamp. The ONE reader of the stamp.
 * @param {string} html
 * @returns {string|null}
 */
export function siteBuildStampOf(html) {
    const stamps = [...html.matchAll(new RegExp('<html\\b[^>]*\\b' + SITE_BUILD_ATTR + '="([^"]*)"', 'gi'))].map((m) => m[1]);
    if (stamps.length > 1) {
        throw new Error('[site-graph] the document carries ' + stamps.length + ' ' + SITE_BUILD_ATTR + ' stamps: ' + stamps.join(', '));
    }
    return stamps.length ? stamps[0] : null;
}

/**
 * The static IDE bundle's entry document, beside its front page. The bundle ships THIS name and no
 * index.html: a site's index.html is the publisher's front page (lib/shim/host/host-view.js::HOST_FRONT_PAGE).
 */
export const STATIC_APP_PAGE = 'app.html';

/**
 * The @descix/frqtl-web dist directory holding STUDIO (its `./studio` export: STATIC_APP_PAGE and its assets). A site
 * places its contents at the site ROOT, beside the front page — never in the graph — and writes the site's facts (the
 * build stamp, the import map, the roster link) into STATIC_APP_PAGE, so that one file is the only one whose bytes
 * differ from the release.
 */
export const SITE_STUDIO_DIR = 'studio';

/**
 * The attribute that declares a file host-provided, on the element that consumes it, in the bytes the browser
 * executes (the STUDIO build writes it: sdk/frqtl-web/studio.vite.config.js). Both the bundle gate (the file must be ABSENT from
 * the bundle) and the publisher (the file must be PRESENT beside the page) read the set from this attribute.
 */
export const HOST_PROVIDED_ATTR = 'data-frqtl-host-provided';

/**
 * Each published package the site places in its graph, and the graph-relative directory it is placed at ('' = the
 * graph root). The router derives every same-origin URL into a package from its row; a publisher checks each
 * placement against that package's installed `<package>/dist-manifest.json`.
 */
export const SITE_PLACEMENTS = Object.freeze([
    Object.freeze({ package: '@descix/frqtl-web', dir: '' }),
    Object.freeze({ package: '@descix/egpt-math-sdk', dir: 'egpt-math-sdk' }),
]);

/**
 * The @descix/frqtl-web dist's HTML entry pages written by its entry writer (dist-root-relative). The experiment pages
 * (experiments/{id}/index.html) are entries too; isSiteEntry names both.
 */
export const SITE_ENTRY_PAGES = Object.freeze(['sdk.html']);
const EXPERIMENT_ENTRY = /^experiments\/[^/]+\/index\.html$/;

/**
 * Is this graph-relative path an entry page (which the site serves at SITE_GRAPH_DIR/<path>, never in the graph)?
 * @param {string} rel
 * @returns {boolean}
 */
export function isSiteEntry(rel) {
    return SITE_ENTRY_PAGES.indexOf(rel) !== -1 || EXPERIMENT_ENTRY.test(rel);
}

/**
 * Is a served site the placed releases' bytes? PURE: the caller enumerates and hashes.
 *
 * @param {{graph: Object<string,string>, entries: Set<string>, app: Object<string,string>}} served
 *   graph    graph-relative path → sha256 hex, for EVERY file under SITE_GRAPH_DIR/<build>/
 *   entries  the paths present under SITE_GRAPH_DIR/ outside the stamped directory (SITE_GRAPH_DIR-relative)
 *   app      site-root-relative path → sha256 hex, for every file at the site root outside SITE_GRAPH_DIR/
 * @param {Array<{dir: string, name: string, version: string, files: Object<string,string>,
 *                manifest: {file: string, sha256: string}}>} releases
 *   one per SITE_PLACEMENTS row: its `dir`, the release's dist-manifest.json `name`, `version` and `files`, and the
 *   manifest file itself (its dist-relative name and the sha256 of its bytes — the record no manifest lists).
 * @returns {string[]} the faults, in a stable order (empty = the graph IS the releases):
 *   - two placements at one dir, or a manifest key that falls under another placement's dir;
 *   - a graph file with no owning placement (longest dir prefix), not listed by its owner, or of another sha256;
 *   - a placement's manifest absent from the graph, or not the release's bytes;
 *   - a listed file absent from the graph, unless it is an entry (isSiteEntry) present among `entries`;
 *   - an entry still inside the graph (each entry has ONE URL);
 *   - a SITE_STUDIO_DIR file of the graph-root placement still inside the graph, absent from the site root, or (any
 *     file but STATIC_APP_PAGE, which the assembly writes into) of other bytes than the release lists.
 */
export function siteGraphFaults(served, releases) {
    const graph = served && served.graph;
    const entries = served && served.entries;
    const app = served && served.app;
    if (!graph || typeof graph !== 'object' || !(entries instanceof Set) || !app || typeof app !== 'object' ||
        !Array.isArray(releases) || releases.length === 0) {
        throw new Error('[site-graph] siteGraphFaults({graph: {path: sha256}, entries: Set, app: {path: sha256}}, releases[]) — got ' +
            JSON.stringify({ graph: typeof graph, entries: Object.prototype.toString.call(entries), app: typeof app,
                releases: Array.isArray(releases) ? releases.length : typeof releases }) + '.');
    }
    for (const r of releases) {
        if (!r || typeof r.dir !== 'string' || !r.files || typeof r.files !== 'object' || !r.manifest ||
            typeof r.manifest.file !== 'string' || typeof r.manifest.sha256 !== 'string') {
            throw new Error('[site-graph] siteGraphFaults: each release is {dir, name, version, files, manifest: {file, sha256}} — got ' +
                JSON.stringify(r && { dir: r.dir, name: r.name, version: r.version, manifest: r.manifest }) + '.');
        }
    }
    const placed = (r, key) => (r.dir ? r.dir + '/' + key : key);
    const label = (r) => r.name + '@' + r.version + (r.dir ? ' (at ' + r.dir + '/)' : ' (at the graph root)');
    const ownerOf = (rel) => {
        let best = null;
        for (const r of releases) {
            if ((r.dir === '' || rel.startsWith(r.dir + '/')) && (!best || r.dir.length > best.dir.length)) { best = r; }
        }
        return best;
    };
    const faults = [];

    // 1. The placements are disjoint.
    const dirs = releases.map((r) => r.dir);
    for (const d of dirs) {
        if (dirs.indexOf(d) !== dirs.lastIndexOf(d)) { faults.push('two placements at one dir: ' + JSON.stringify(d)); break; }
    }
    for (const r of releases) {
        for (const key of Object.keys(r.files).sort()) {
            const o = ownerOf(placed(r, key));
            if (o !== r) { faults.push(label(r) + ' lists ' + key + ', which falls under ' + label(o) + ' — the placements overlap'); }
        }
    }

    // 2. Every graph file is its owner's byte.
    for (const rel of Object.keys(graph).sort()) {
        const o = ownerOf(rel);
        if (!o) { faults.push('graph file ' + rel + ' has no owning placement'); continue; }
        const key = o.dir ? rel.slice(o.dir.length + 1) : rel;
        if (key === o.manifest.file) {
            if (graph[rel] !== o.manifest.sha256) {
                faults.push('graph file ' + rel + ' is ' + graph[rel] + ', not ' + label(o) + '\'s integrity record (' + o.manifest.sha256 + ')');
            }
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(o.files, key)) {
            faults.push('graph file ' + rel + ' is not listed by ' + label(o));
        } else if (o.files[key] !== graph[rel]) {
            faults.push('graph file ' + rel + ' is ' + graph[rel] + ', ' + label(o) + ' lists ' + o.files[key]);
        }
    }

    // 3. Every listed file is served: in the graph, (an entry) at its fixed URL, or (STUDIO) at the site root — the
    //    last two NOT in the graph.
    const studioPrefix = SITE_STUDIO_DIR + '/';
    for (const r of releases) {
        const m = placed(r, r.manifest.file);
        if (!Object.prototype.hasOwnProperty.call(graph, m)) { faults.push(label(r) + '\'s ' + r.manifest.file + ' is absent from the graph'); }
        for (const key of Object.keys(r.files).sort()) {
            const rel = placed(r, key);
            const inGraph = Object.prototype.hasOwnProperty.call(graph, rel);
            if (r.dir === '' && key.startsWith(studioPrefix)) {
                const appRel = key.slice(studioPrefix.length);
                if (inGraph) { faults.push('STUDIO file ' + rel + ' (' + label(r) + ') is inside the graph — STUDIO is placed at the site root'); }
                if (!Object.prototype.hasOwnProperty.call(app, appRel)) {
                    faults.push('STUDIO file ' + key + ' (' + label(r) + ') is absent from the site root (' + appRel + ')');
                } else if (appRel !== STATIC_APP_PAGE && app[appRel] !== r.files[key]) {
                    faults.push('site-root file ' + appRel + ' is ' + app[appRel] + ', ' + label(r) + ' lists ' + key + ' as ' + r.files[key]);
                }
            } else if (isSiteEntry(rel)) {
                if (inGraph) { faults.push('entry ' + rel + ' (' + label(r) + ') is still inside the graph — an entry has one URL, at ' + SITE_GRAPH_DIR + '/' + rel); }
                if (!entries.has(rel)) { faults.push('entry ' + rel + ' (' + label(r) + ') is absent from ' + SITE_GRAPH_DIR + '/'); }
            } else if (!inGraph) {
                faults.push(label(r) + ' lists ' + key + ' but it is absent from the graph');
            }
        }
    }
    return faults;
}
