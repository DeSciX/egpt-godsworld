/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * scenes-fork.test.mjs — the lab's scenes are its own: ONE roster (site/scenes/roster.json) in the package's contract, and
 * the forked scene files beside it, each the bytes it was forked as.
 *
 * Gates:
 *   1. the fork holds (scripts/lab-roster.mjs forkFaults over site/scenes): every file listed in FORKED.json sits at
 *      <sha8>/<name>.js with sha8 its own sha256 prefix and hashes to the entry's sha256 AND git blob id (the ids its source
 *      commit lists); the roster passes the vendored package's loadRoster (normalizeRoster, ROSTER_KEYS); every roster
 *      source is a forked file and every forked file a source; nothing else is in the directory. Planted faults in a
 *      temp copy are each red by name: one flipped byte, a scene the roster names but the tree lacks (and the package's
 *      projectOf refusing it by the scene's id), an unforked source, a stray file, an unknown roster key, an unused
 *      entry, a directory that is not the hash;
 *   2. the page's roster link: maxi-roster.js writes ONE absolute link off the page's own URL, whatever prefix serves
 *      the site, that the package's rosterHrefOf accepts; a second writer is refused; no page carries a static link;
 *   3. one reader each side: in the page only maxi-lab.js imports the package's registry (a look script re-reads it there
 *      as an independent check), and it loads the roster
 *      through the link; in node only scripts/lab-roster.mjs imports it, and only it and maxi-roster.js name the
 *      roster's path; no site, body or script file names the package's deleted scene rows. Read by token (frqtl-web/registry,
 *      shim/registry, ./registry, roster.json), never by a quote style or a call shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO } from '../frqtl-web-pin.mjs';
import { registry, roster, forkFaults, loadLabRoster, rosterHrefIn, SCENES_REL, ROSTER_REL, FORKED_FILE } from '../lab-roster.mjs';
import { ROSTER_SITE_PATH, linkRoster } from '../../site/app-assets/maxi-roster.js';
import { publishedFiles } from '../publish-paths.mjs';
import { testTmpDir } from './tmpdir.mjs';

const SCENES = path.join(REPO, SCENES_REL);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const forked = () => JSON.parse(fs.readFileSync(path.join(SCENES, FORKED_FILE), 'utf8'));

/** A temp copy of site/scenes with `plant(dir)` applied; returns {dir, faults}. */
async function planted(name, plant) {
    const dir = path.join(testTmpDir('scenes-fork-' + name), 'scenes');
    fs.cpSync(SCENES, dir, { recursive: true });
    await plant(dir);
    return { dir, faults: (await forkFaults(dir)).faults };
}
const editJson = (file, edit) => { const j = JSON.parse(fs.readFileSync(file, 'utf8')); edit(j); fs.writeFileSync(file, JSON.stringify(j, null, 1) + '\n'); };

test('the fork holds: every scene file is its hashes, the roster is the package\'s contract, and sources and files are one set', async (t) => {
    const { faults, roster: bag } = await forkFaults(SCENES);
    assert.deepEqual(faults, []);
    assert.ok(bag && bag.rows.length > 0, 'the roster loaded');
    const f = forked();
    assert.equal(new Set(roster.rows.map((r) => r.source)).size, f.files.length, 'one forked file per distinct source');
    // the roster on disk is JSON the package normalizes unchanged at its own href: every key is a ROSTER_KEYS key
    const json = JSON.parse(read(ROSTER_REL));
    assert.doesNotThrow(() => registry.normalizeRoster(json, rosterHrefIn(SCENES)));
    assert.equal(roster.href, pathToFileURL(path.join(REPO, ROSTER_REL)).href, 'node reads the roster by its own file: URL');
    assert.equal(ROSTER_REL, 'site/' + ROSTER_SITE_PATH, 'node and the page name one path');
    t.diagnostic(roster.rows.length + ' scenes, ' + f.files.length + ' forked files, ' + (roster.showcase ? roster.showcase.rows.length : 0) + ' showcase cards; forked from ' + f.forkedFrom.commit);
});

test('negative controls: each planted fault in a copy of site/scenes is red by name, and loadLabRoster throws on it', async () => {
    const first = forked().files[0];
    const rowOf = (file) => roster.rows.find((r) => r.source === file);
    const cases = [
        ['one flipped byte', (d) => { const p = path.join(d, first.file); const b = fs.readFileSync(p); b[b.length >> 1] ^= 1; fs.writeFileSync(p, b); },
            new RegExp(first.file.replace('.', '\\.') + ': sha256 [0-9a-f]{64}, FORKED\\.json says ' + first.sha256)],
        ['a scene the roster names but the tree lacks', (d) => fs.rmSync(path.join(d, first.file)),
            new RegExp(first.file.replace('.', '\\.') + ': listed in FORKED\\.json, missing from')],
        ['an unforked source', (d) => { fs.mkdirSync(path.join(d, 'deadbeef')); fs.writeFileSync(path.join(d, 'deadbeef', 'x.js'), 'export default function buildExperiment(exp) {}\n');
            editJson(path.join(d, 'roster.json'), (j) => { j.rows[0].source = 'deadbeef/x.js'; }); }, /its source deadbeef\/x\.js is not a forked file of FORKED\.json/],
        ['a stray file', (d) => fs.writeFileSync(path.join(d, 'notes.txt'), 'x'), /notes\.txt: in .* but neither the roster, FORKED\.json nor a forked file/],
        ['an unknown roster key', (d) => editJson(path.join(d, 'roster.json'), (j) => { j.rows[0].is3D = false; }), /has no key "is3D" — is3D is derived/],
        ['an unused entry', (d) => editJson(path.join(d, 'roster.json'), (j) => { j.rows = j.rows.filter((r) => r.source !== first.file); if (j.showcase) { j.showcase.rows = j.showcase.rows.filter((c) => j.rows.some((r) => r.id === c.id)); } if (j.firstContact && !j.rows.some((r) => r.id === j.firstContact)) { j.firstContact = null; } }),
            new RegExp(first.file.replace('.', '\\.') + ': forked, but no roster row names it')],
        ['a directory that is not the hash', (d) => { const name = first.file.split('/')[1]; fs.mkdirSync(path.join(d, '00000000')); fs.renameSync(path.join(d, first.file), path.join(d, '00000000', name));
            editJson(path.join(d, FORKED_FILE), (j) => { j.files[0].file = '00000000/' + name; });
            editJson(path.join(d, 'roster.json'), (j) => { j.rows.forEach((r) => { if (r.source === first.file) { r.source = '00000000/' + name; } }); }); }, /its directory is not the first 8 hex of its sha256/]
    ];
    assert.ok(rowOf(first.file), 'the first forked file is a roster source');
    for (const [label, plant, re] of cases) {
        const { dir, faults } = await planted(label.replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), plant);
        assert.match(faults.join('\n'), re, label + ' is RED');
        await assert.rejects(loadLabRoster(dir), /the lab's scenes in .* are not the fork they say they are/, label + ': loadLabRoster fails loud');
    }
    // the page's own read of a missing scene: the package's projectOf refuses it, naming the scene
    const { dir } = await planted('missing-read', () => {});
    const bag = await registry.loadRoster(rosterHrefIn(dir));
    fs.rmSync(path.join(dir, first.file));
    await assert.rejects(registry.projectOf(bag, rowOf(first.file).id), new RegExp('scene "' + rowOf(first.file).id + '"'));
});

// ── 2. the page's roster link ─────────────────────────────────────────────────────────────────

/** A document with just what linkRoster and the package's rosterHrefOf use. */
function fakeDoc(baseURI) {
    const links = [];
    const el = () => { const a = {}; return { setAttribute: (k, v) => { a[k] = v; }, getAttribute: (k) => (k in a ? a[k] : null), attrs: a }; };
    return {
        baseURI, links,
        createElement: () => el(),
        head: { appendChild: (n) => { links.push(n); return n; } },
        querySelectorAll: (sel) => { const rel = /rel~="([^"]+)"/.exec(sel)[1]; return links.filter((n) => (n.getAttribute('rel') || '').split(/\s+/).includes(rel)); }
    };
}

test('the roster link is written once, absolute off the page\'s own URL under any prefix, and the package reads it; no page carries one', () => {
    const bases = {
        'https://egpt-godsworld.descix.net/prod/egpt-godsworld/site/app.html?scene=r1-straight-walk#x': 'https://egpt-godsworld.descix.net/prod/egpt-godsworld/site/scenes/roster.json',
        'https://localhost:5173/p/egpt-godsworld/app.html': 'https://localhost:5173/p/egpt-godsworld/scenes/roster.json',
        'http://127.0.0.1:5611/site/app.html?scene=cl1a-mirror&mode=': 'http://127.0.0.1:5611/site/scenes/roster.json'
    };
    for (const [base, want] of Object.entries(bases)) {
        const doc = fakeDoc(base);
        assert.equal(linkRoster(doc, registry.ROSTER_LINK_REL), want, base);
        assert.equal(registry.rosterHrefOf(doc), want, 'the package reads the link the lab wrote');
        assert.throws(() => linkRoster(doc, registry.ROSTER_LINK_REL), /already carries 1 <link rel="frqtl-roster">/, 'a second write is refused');
    }
    assert.throws(() => linkRoster(fakeDoc('https://x.invalid/app.html'), undefined), /takes the package's ROSTER_LINK_REL/);
    for (const page of ['site/app.html', 'site/scene.html', 'site/index.html']) {
        assert.deepEqual(registry.rosterLinksOfHtml(read(page)), [], page + ' carries a static roster link: maxi-roster.js writes the one link');
    }
    assert.equal(registry.rosterLinksOfHtml('<link rel="frqtl-roster" href="https://a.invalid/r.json">').length, 1, 'the link reader is not deaf');
});

// ── 3. one reader each side ───────────────────────────────────────────────────────────────────

/**
 * The roster.json mentions allowed outside the two owners, by file and exact text: Maxi's memories roster by its one
 * repo path, and three sentences about that memories roster in text Maxi reads (each removed once before the token rule).
 */
export const ROSTER_JSON_ALLOWED = Object.freeze({
    '*': 'kb/GodsWorld/memories/roster.json',
    'site/app-assets/maxi-roles.js': '(roster.json lists every id;',
    'scripts/gen-memories-seen.mjs': '(roster.json lists scenes)',
    'scripts/gen-memories-build.mjs': 'Generated by scripts/gen-memories-build.mjs from roster.json.'
});
const PAGE_READER = 'site/app-assets/maxi-lab.js';
const NODE_READER = 'scripts/lab-roster.mjs';
const PATH_OWNERS = Object.freeze(['site/app-assets/maxi-roster.js', NODE_READER]);

/**
 * The text with its comments taken out and every line of code kept: each block comment itself (`/* … *\/`, never the code
 * after it on the same line), then each line that is only a `//` comment. A `/*` counts as a comment opener only where code
 * can start one: not inside a quote on its line (an odd number of ', " or ` before it) and not glued to a preceding `*`
 * or word character (a glob such as `scripts/**\/*.test.mjs`), so a string cannot hide code by opening a false comment.
 */
export function codeOf(text) {
    const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m, at, all) => {
        const lineStart = all.lastIndexOf('\n', at - 1) + 1;
        const before = all.slice(lineStart, at);
        const quotes = (before.match(/(?<!\\)['"`]/g) || []).length;
        if (quotes % 2 === 1 || /[*\w$.\/]$/.test(before)) { return m; }
        return m.replace(/[^\n]/g, '');   // keep the line breaks, so what follows stays on its own line
    });
    return noBlocks.replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Faults of the reader rule over {file: text}, read by TOKEN, never by a quote style or a call shape (comment lines skipped):
 *   - `frqtl-web/registry` anywhere (any quote, a template, an import or a dynamic import) outside the page reader and the
 *     look scripts (which re-read the roster in the page as an independent check of what the lab painted);
 *   - `shim/registry` or `./registry` anywhere outside the node reader (the dist path of the barrel, or its export key);
 *   - `roster.json` anywhere outside the path owners, once ROSTER_JSON_ALLOWED's texts are taken out.
 */
export function readerFaults(src) {
    const faults = [];
    for (const [f, text] of Object.entries(src)) {
        let code = codeOf(text);   // comments describe; code reads
        if (/frqtl-web\/registry/.test(code) && f !== PAGE_READER && !f.startsWith('scripts/look/')) { faults.push(f + ' names frqtl-web/registry: ' + PAGE_READER + ' is the page\'s one reader of the package registry'); }
        if (/shim\/registry|\.\/registry/.test(code) && f !== NODE_READER) { faults.push(f + ' names the vendored registry (shim/registry or ./registry): ' + NODE_READER + ' is its one node reader'); }
        if (!PATH_OWNERS.includes(f)) {
            code = code.split(ROSTER_JSON_ALLOWED['*']).join('');
            if (ROSTER_JSON_ALLOWED[f]) { code = code.replace(ROSTER_JSON_ALLOWED[f], ''); }
            if (/roster\.json/.test(code)) { faults.push(f + ' names roster.json: site/app-assets/maxi-roster.js ROSTER_SITE_PATH is the one spelling of the lab roster\'s path (Maxi\'s memories roster is named only as ' + ROSTER_JSON_ALLOWED['*'] + ')'); }
        }
        if (/\b(WALKTHROUGH|EXHIBITS|scenePath|walkthroughGroup|FIRST_CONTACT_WALKTHROUGH_ID)\b/.test(code)) { faults.push(f + ' names a scene-row export the package deleted (WALKTHROUGH, EXHIBITS, scenePath, walkthroughGroup, FIRST_CONTACT_WALKTHROUGH_ID): read the lab\'s roster'); }
    }
    for (const f of Object.keys(ROSTER_JSON_ALLOWED)) {
        if (f !== '*' && !(src[f] || '').includes(ROSTER_JSON_ALLOWED[f])) { faults.push('ROSTER_JSON_ALLOWED names ' + f + ' text the file no longer holds: drop the stale exemption'); }
    }
    const lab = src['site/app-assets/maxi-lab.js'] || '';
    if (!lab.includes('    linkRoster(document, ROSTER_LINK_REL);\n    roster.bag = await loadRoster(rosterHrefOf(document));')) { faults.push('maxi-lab.js does not load its roster as linkRoster(document, ROSTER_LINK_REL) then loadRoster(rosterHrefOf(document))'); }
    return faults;
}

function readerSources() {
    const out = {};
    for (const f of publishedFiles(REPO).filter((x) => /^(site\/app-assets|minimaxi|scripts)\//.test(x) && !/^scripts\/test\//.test(x) && /\.(m?js)$/.test(x))) { out[f] = read(f); }
    return out;
}

test('one reader each side: maxi-lab.js in the page, scripts/lab-roster.mjs in node; no file names the deleted scene rows (plants are red)', () => {
    const src = readerSources();
    assert.ok(src['site/app-assets/maxi-lab.js'] && src['scripts/lab-roster.mjs'] && src['minimaxi/body.mjs'], 'the walk covers the page, node and the body');
    assert.deepEqual(readerFaults(src), []);
    const add = (f, text) => Object.assign({}, src, { [f]: src[f] + text });
    for (const [label, plant, re] of [
        ['a second page reader', add('site/app-assets/maxi-hands.js', "\nimport { walkthroughById } from '@descix/frqtl-web/registry';\n"), /maxi-hands\.js names frqtl-web\/registry/],
        ['(a) a backtick dynamic import of the registry', add('site/app-assets/maxi-hands.js', "\nconst reg = await import(`@descix/frqtl-web/registry`);\n"), /maxi-hands\.js names frqtl-web\/registry/],
        ['a second node reader by export key', add('minimaxi/body.mjs', "\nconst r = await import(distUrl(exportFile('./registry')));\n"), /body\.mjs names the vendored registry/],
        ['(b) the old body\'s dist path', add('minimaxi/body.mjs', "\nconst r = await import(distUrl('shim/registry/index.js'));\n"), /body\.mjs names the vendored registry/],
        ['a second spelling of the path', add('scripts/gen-memories-build.mjs', "\nconst p = 'site/scenes/roster.json';\n"), /gen-memories-build\.mjs names roster\.json/],
        ['(c) the path concatenated', add('scripts/gen-memories-build.mjs', "\nconst p = 'site/scenes/' + 'roster.json';\n"), /gen-memories-build\.mjs names roster\.json/],
        ['(d) a registry import after a block comment on its line', add('site/app-assets/maxi-hands.js', "\n/* the hand table */ const RR = await import('@descix/frqtl-web/registry');\n"), /maxi-hands\.js names frqtl-web\/registry/],
        ['(e) the old dist path after a block comment on its line', add('minimaxi/body.mjs', "\n/* eyes */ const R2 = await import(distUrl('shim/registry/index.js'));\n"), /body\.mjs names the vendored registry/],
        ['(f) a false comment opener inside a string hides nothing', add('minimaxi/body.mjs', "\nconst g = 'a/*b'; const R3 = await import(distUrl('shim/registry/index.js')); const h = 'c*/d';\n"), /body\.mjs names the vendored registry/],
        ['the roster path where an exemption sits', add('site/app-assets/maxi-roles.js', "\nconst p = 'scenes/' + 'roster.json';\n"), /maxi-roles\.js names roster\.json/],
        ['a stale exemption', Object.assign({}, src, { 'scripts/gen-memories-seen.mjs': src['scripts/gen-memories-seen.mjs'].replace('(roster.json lists scenes)', '(the roster lists scenes)') }), /ROSTER_JSON_ALLOWED names scripts\/gen-memories-seen\.mjs text the file no longer holds/],
        ['a deleted row export', add('site/app-assets/maxi-lab.js', '\nconst n = WALKTHROUGH.length;\n'), /maxi-lab\.js names a scene-row export the package deleted/],
        ['the roster fetched past the link', Object.assign({}, src, { 'site/app-assets/maxi-lab.js': src['site/app-assets/maxi-lab.js'].replace('loadRoster(rosterHrefOf(document))', "loadRoster(new URL('scenes/roster.json', location.href).href)") }), /does not load its roster as linkRoster/]
    ]) {
        assert.match(readerFaults(plant).join('\n'), re, label + ' is RED');
    }
});
