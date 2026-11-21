/* Copyright 2023-2026 by Essam Abadir */

/**
 * link.js — THE link site: a project (a folder of files held as text, or a served folder) becomes imported
 * modules, and its entry's default export is the scene.
 *
 *   linkProject(project) → Promise<{ buildExperiment, module, manifest, files, urls, project }>   THE result contract
 *     project = { files: { 'frqtl.json': text, 'sketch.js': text, 'parts/X.js': text, 'README.md': text, … }, entry?, mint, bare? }
 *             | { url: '<served folder>/', entry?, mint, bare? }
 *       url    absolute, or relative to the document's base URL in a page ('./'); ends in "/"
 *       entry  the root-relative path of the module whose default export is `function buildExperiment(exp)`.
 *              It comes from frqtl.json (manifest.js, the one owner) when the project carries one; an `entry`
 *              given beside a manifest must EQUAL manifest.entry, or the link REJECTS naming both. With neither
 *              a manifest nor an entry the link REJECTS naming frqtl.json. A served folder's
 *              `<url>frqtl.json` is fetched first; a 404 there is allowed only when `entry` is given (then
 *              there is no manifest).
 *       mint   REQUIRED — the host's (text, path) → { url, release? }: `blobMint` in a page, `dataMint` in
 *              node. Hosts differ ONLY here. A served folder is minted too: each file is fetched ONCE, as
 *              bytes; those bytes are the identity, and the same bytes, decoded once (UTF-8, fatal), are
 *              the text that runs. Nothing is fetched a second time.
 *       bare   (spec) → URL for a `@descix/frqtl-web/...` specifier; default: the specifier's
 *              lib-identity path (specifiers.js libPathOf) under THIS copy's package root
 *              (compat/package-root.js), so a project links against the very modules its boot loaded.
 *              A host whose modules are not served one file per URL (frqtl-web.min.js) passes its own.
 *     resolves
 *       buildExperiment  the entry's default export
 *       module           the entry module's namespace (its `parts` block is `module.parts`)
 *       manifest         frqtl.json's normalized bag (manifest.js normalizeManifest), or null when the project
 *                        was linked by `entry` alone
 *       files            THE LINKED SET's bytes by path — frqtl.json and every module file (linkedFiles): fetched,
 *                        for a served folder; the UTF-8 encoding of each text, for a file map. The input of
 *                        projectIdentity (identity.js).
 *       urls             each module's minted URL by path (a forked part registers its kind `from` that URL —
 *                        lib/shim/project/parts-module.js maps it back to the path)
 *       project          the linked project as TEXT — { files: { path: text }, entry, mint, bare? } — what a facade
 *                        holds and re-links (RecipeContext.build(linked)). For a file map its files are EVERY file
 *                        given (frqtl.json and README.md included), so a facade's sketch is the whole folder; for a
 *                        served folder they are the files fetched, decoded.
 *
 * THE LINKED SET (linkedFiles(files) → the sub-map): frqtl.json plus every MODULE file — a path ending ".js" or
 * ".mjs" — a pure path function of the folder, so every host hashes one set. Each module file must be reached
 * from the entry; any other file (README.md, notes.txt) travels with the folder, unlinked and unhashed.
 *
 * In a project, a module imports another project module by a RELATIVE specifier, and the package by
 * `@descix/frqtl-web/...`; nothing else. Relative specifiers are rewritten to the minted URLs of the files
 * they name, in topological order (a file is minted after everything it imports). REFUSED before anything
 * is minted, each naming the file, the specifier and the reason: a relative specifier that climbs out of
 * the root (package internals have no public specifier), one that names a non-module path (not ".js" /
 * ".mjs": a data file, an extensionless name, frqtl.json), one that names no project file (never an HTTP
 * sibling), a @descix/frqtl-web specifier that is not a row of FRQTL_WEB_SPECIFIERS, a part-internal row imported
 * by any file but a part file (parts/*.js), any other specifier;
 * an import cycle among project files; a module file the entry never reaches; an invalid frqtl.json; a
 * served file that is not UTF-8; a missing or non-function default export of the entry, a missing entry,
 * an empty project. Every argument error REJECTS.
 *
 * An error raised while the project EVALUATES (a duplicate kind, a throw at module top) is rethrown with every minted
 * URL in its message named by its project path and every package file URL by its specifier (_namePaths).
 *
 *   blobMint(text) → { url, release() }   a `blob:` module URL (a page), one per byte-identical text
 *   dataMint(text) → { url, release() }   a `data:` module URL (node)
 *
 * A one-string sketch is the one-file project: `{ files: { 'sketch.js': text }, entry: 'sketch.js' }` —
 * sketchProject(text) is that shape's one writer inside the tree (SKETCH_ENTRY its entry path).
 */

import { libPathOf, tierOf, specifierOfLibPath, FRQTL_WEB_PACKAGE, FRQTL_WEB_SPECIFIERS } from './specifiers.js';
import { checkProjectPath, projectBytes } from './identity.js';
import { MANIFEST_FILE, parseManifest } from './manifest.js';
import { packageRoot } from '../../frqtl/compat/package-root.js';

const SKETCH_FORM = 'export default function buildExperiment(exp) { … }';

/** THE decoder of served bytes: invalid UTF-8 throws; a BOM is stripped from the text (never from the identity bytes). */
const _UTF8 = new TextDecoder('utf-8', { fatal: true });

function _fail(msg) {
    throw new Error('[link] ' + msg + ' (FAIL-LOUD.)');
}

/**
 * The text with every comment blanked to spaces (newlines kept), so offsets into it are offsets into
 * the text. String and template literals are skipped, so a '//' inside a string is not a comment.
 * @param {string} text
 * @returns {string}
 */
function _blankComments(text) {
    const out = text.split('');
    let i = 0;
    const n = text.length;
    while (i < n) {
        const c = text[i];
        if (c === '/' && text[i + 1] === '/') {
            while (i < n && text[i] !== '\n') { out[i] = ' '; i++; }
        } else if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            for (; i < stop; i++) { if (text[i] !== '\n') { out[i] = ' '; } }
        } else if (c === '\'' || c === '"' || c === '`') {
            i++;
            while (i < n && text[i] !== c) { if (text[i] === '\\') { i++; } i++; }
            i++;
        } else {
            i++;
        }
    }
    return out.join('');
}

const _IMPORT_RE = /(?:^|[;\n}])\s*(?:import|export)\b[^'";]*?\bfrom\s*(['"])([^'"\n]+)\1|(?:^|[;\n}])\s*import\s*(['"])([^'"\n]+)\3|\bimport\s*\(\s*(['"])([^'"\n]+)\5\s*\)/dg;

/**
 * Every static import / export-from / side-effect import / literal dynamic import of `text`.
 * @param {string} text
 * @returns {{spec: string, start: number, end: number}[]} start/end bracket the specifier's characters
 */
function _imports(text) {
    const code = _blankComments(text);
    const out = [];
    let m;
    _IMPORT_RE.lastIndex = 0;
    while ((m = _IMPORT_RE.exec(code))) {
        const g = m[2] !== undefined ? 2 : (m[4] !== undefined ? 4 : 6);
        out.push({ spec: m[g], start: m.indices[g][0], end: m.indices[g][1] });
    }
    return out;
}

function _isRelative(spec) {
    return spec.startsWith('./') || spec.startsWith('../');
}

/** A row of FRQTL_WEB_SPECIFIERS names it (libPathOf, the table's one reader). */
function _isPublished(spec) {
    try { libPathOf(spec); return true; } catch (_) { return false; }
}

function _publishedList() {
    return FRQTL_WEB_SPECIFIERS.map(function (r) { return r.specifier + (r.specifier.endsWith('/') ? '<file>' : ''); }).join(', ');
}

/** The tier a forked part's internals carry (specifiers.js SPECIFIER_TIERS). */
const PART_INTERNAL = 'part-internal';

/** A project file under parts/ (a part file: the only importer of a part-internal module). */
function _isPartFile(p) {
    return /^parts\/[^/]+\.m?js$/.test(p);
}

function _isPackage(spec) {
    return spec === FRQTL_WEB_PACKAGE || spec.startsWith(FRQTL_WEB_PACKAGE + '/');
}

/** The project path a relative specifier names from `fromPath`, or null when it climbs out of the root. */
function _resolveRelative(fromPath, spec) {
    const segs = fromPath.split('/');
    segs.pop();
    for (const s of spec.split('/')) {
        if (s === '.' || s === '') { continue; }
        if (s === '..') {
            if (segs.length === 0) { return null; }
            segs.pop();
        } else {
            segs.push(s);
        }
    }
    return segs.join('/');
}

/**
 * The project's import graph from `entry`: each file's imports, classified and checked.
 * @param {string} entry
 * @param {function(string): Promise<{text: string, bytes: Uint8Array}>} sourceOf — path → its text and bytes
 *   (throws naming a file it lacks)
 * @returns {Promise<{order: string[], files: Object<string,string>, bytes: Object<string,Uint8Array>, edges: Object<string, object[]>}>}
 */
async function _walk(entry, sourceOf) {
    const files = {};
    const bytes = {};
    const edges = {};
    const order = [];
    const state = {};   // path → 'visiting' | 'done'
    async function visit(p, stack, spec) {
        if (state[p] === 'done') { return; }
        if (state[p] === 'visiting') {
            const loop = stack.slice(stack.indexOf(p)).concat(p);
            _fail('the project files import each other in a cycle: ' + loop.join(' → ') + ' — a project file graph ' +
                'is acyclic (each file is minted after everything it imports).');
        }
        state[p] = 'visiting';
        const src = await sourceOf(p, stack[stack.length - 1], spec);
        const text = src.text;
        files[p] = text;
        bytes[p] = src.bytes;
        const list = [];
        for (const imp of _imports(text)) {
            if (_isRelative(imp.spec)) {
                const target = _resolveRelative(p, imp.spec);
                if (target === null) {
                    _fail('"' + p + '" imports "' + imp.spec + '" — outside the project; package internals have no ' +
                        'public specifier (a project file imports the package by a @descix/frqtl-web/... row).');
                }
                if (!isModulePath(target)) {
                    _fail('"' + p + '" imports "' + imp.spec + '" (' + target + '), which is not a module path — a project ' +
                        'imports only its module files (' + MODULE_EXTENSIONS.join(' / ') + '); any other file of the folder ' +
                        '(a data file, an extensionless name, ' + MANIFEST_FILE + ') travels with it unlinked.');
                }
                list.push(Object.assign({ kind: 'file', target: target }, imp));
            } else if (_isPackage(imp.spec)) {
                if (!_isPublished(imp.spec)) {
                    _fail('"' + p + '" imports "' + imp.spec + '" — not a published specifier; the table ' +
                        '(lib/shim/project/specifiers.js FRQTL_WEB_SPECIFIERS) offers: ' + _publishedList() + '.');
                }
                if (tierOf(imp.spec) === PART_INTERNAL && !_isPartFile(p)) {
                    _fail('"' + p + '" imports "' + imp.spec + '" — a part-internal module is imported by a part file ' +
                        '(parts/*.js), never by a sketch — a sketch imports parts by @descix/frqtl-web/parts.');
                }
                list.push(Object.assign({ kind: 'package' }, imp));
            } else {
                _fail('"' + p + '" imports "' + imp.spec + '" — a project file imports another project file by a ' +
                    'relative specifier (./X.js) and the package by @descix/frqtl-web/...; nothing else.');
            }
        }
        edges[p] = list;
        for (const e of list) {
            if (e.kind === 'file') { await visit(e.target, stack.concat(p), e.spec); }
        }
        state[p] = 'done';
        order.push(p);
    }
    await visit(entry, []);
    return { order: order, files: files, bytes: bytes, edges: edges };
}

/**
 * The served folder's absolute URL: an absolute `url` as given; a relative one ('./', as a project's own
 * index.html writes it) against the document's base URL. A host with no document REJECTS a relative one.
 * @param {string} url
 * @returns {string}
 */
function _folderUrl(url) {
    try { return new URL(url).href; } catch (_) { /* relative: resolved below */ }
    if (typeof document === 'undefined' || !document || typeof document.baseURI !== 'string') {
        _fail('linkProject({ url }): ' + JSON.stringify(url) + ' is relative and this host has no document to ' +
            'resolve it against — pass the absolute folder URL (e.g. new URL(\'./proj/\', import.meta.url).href).');
    }
    return new URL(url, document.baseURI).href;
}

/** Rewrite each import specifier of `text` through `urlOf(edge)`, escaped for the literal's own quote. */
function _rewrite(text, list, urlOf) {
    let out = text;
    for (const e of list.slice().sort((a, b) => b.start - a.start)) {
        const quote = text[e.start - 1];
        const lit = String(urlOf(e)).replace(/\\/g, '\\\\').split(quote).join('\\' + quote);
        out = out.slice(0, e.start) + lit + out.slice(e.end);
    }
    return out;
}

/** The extensions of a project MODULE file; every other path of a folder is a non-module file. */
const MODULE_EXTENSIONS = Object.freeze(['.js', '.mjs']);

/** A project path names a module file (".js" / ".mjs"). */
function isModulePath(p) {
    return MODULE_EXTENSIONS.some(function (x) { return p.endsWith(x); });
}

/**
 * THE LINKED SET of a folder: the sub-map of `files` holding frqtl.json and every module file (".js" /
 * ".mjs"), values as given (text or bytes). A pure function of the paths, so every host — a page door,
 * hosted eyes in node — hashes one set; the link refuses a folder whose module files the entry does not
 * all reach, so for a folder that links this IS the set linked. Any other file passes through unhashed.
 * @param {Object<string, *>} files
 * @returns {Object<string, *>}
 */
export function linkedFiles(files) {
    if (!files || typeof files !== 'object') {
        _fail('linkedFiles(files): files is the map { path: text | bytes } (got ' + (files === null ? 'null' : typeof files) + ').');
    }
    const out = {};
    for (const p of Object.keys(files)) {
        if (p === MANIFEST_FILE || isModulePath(p)) { out[p] = files[p]; }
    }
    return out;
}

/**
 * Every module file of a file map is reached from the entry (a project's modules are exactly the graph its
 * entry imports, so linkedFiles is the set linked). REFUSES an unreached one, naming it.
 */
function _refuseUnreached(project, g) {
    if (project.files === undefined) { return; }
    const unused = Object.keys(linkedFiles(project.files)).filter(function (p) {
        return p !== MANIFEST_FILE && !Object.prototype.hasOwnProperty.call(g.files, p);
    });
    if (unused.length) {
        _fail('unused project file "' + unused[0] + '" — a project holds the module files its entry imports' +
            (unused.length > 1 ? ' (also unused: ' + unused.slice(1).join(', ') + ')' : '') + '; a non-module file ' +
            '(README.md) travels with the folder unlinked.');
    }
}

function _defaultBare(spec) {
    return new URL(libPathOf(spec), packageRoot()).href;
}

function _entryFunction(ns, entry) {
    if (typeof ns.default !== 'function') {
        _fail('the entry "' + entry + '" has no default export function — its form is ' + SKETCH_FORM +
            ' (a classic sketch\'s `window.buildExperiment` tail is retired: write the ES module form).');
    }
    return ns.default;
}

/** The served folder's frqtl.json: { manifest, text, bytes }, or null on a 404. One fetch. */
async function _fetchManifest(base) {
    const u = new URL(MANIFEST_FILE, base).href;
    let res;
    try { res = await fetch(u); }
    catch (e) { _fail('fetching "' + MANIFEST_FILE + '" (' + u + ') failed: ' + String((e && e.message) || e) + '.'); }
    if (res.status === 404) { return null; }
    if (!res.ok) { _fail('"' + MANIFEST_FILE + '" is not served at ' + u + ' (HTTP ' + res.status + ').'); }
    const raw = new Uint8Array(await res.arrayBuffer());
    let text;
    try { text = _UTF8.decode(raw); }
    catch (e) { _fail('"' + MANIFEST_FILE + '" is not valid UTF-8 (' + u + ').'); }
    let manifest;
    try { manifest = parseManifest(text); }
    catch (e) {
        const type = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : null;
        _fail('the served ' + MANIFEST_FILE + ' (' + u + ', HTTP ' + res.status + (type ? ', ' + type : '') + ') is refused: ' +
            String((e && e.message) || e) + ' — a host that answers a missing file with a page serves no 404, so a folder ' +
            'there carries its own ' + MANIFEST_FILE + '.');
    }
    return { manifest: manifest, text: text, bytes: raw };
}

/**
 * The entry: frqtl.json's when the project carries one (a given `entry` must equal it), else the given one.
 * @returns {string}
 */
function _entryOf(given, manifest) {
    if (manifest) {
        if (given !== undefined && given !== manifest.entry) {
            _fail('entryOf: `entry` "' + given + '" disagrees with ' + MANIFEST_FILE + '\'s "entry" "' + manifest.entry +
                '" — the manifest names the entry; drop `entry`, or make the two equal.');
        }
        return manifest.entry;
    }
    if (given === undefined) {
        _fail('entryOf: no entry — the project carries no ' + MANIFEST_FILE + ' (manifest.js; manifestFor({ name, entry }) ' +
            'writes one) and no `entry` was given (a one-string sketch: { files: { "sketch.js": text }, entry: "sketch.js" }).');
    }
    return given;
}

/**
 * entryOf(files, given) → the project's entry path — THE entry rule (every host asks it, never a copy): the entry
 * frqtl.json names (read through its owner, parseManifest) when `files` carries one, and a `given` entry must equal
 * it; else `given`. THROWS naming the rule: a disagreeing entry, no frqtl.json and no entry, an invalid frqtl.json.
 * Not on PROJECT_EXPORTS (like linkedFiles).
 * @param {Object<string, string>} files
 * @param {string} [given]
 * @returns {string}
 */
export function entryOf(files, given) {
    const has = files && Object.prototype.hasOwnProperty.call(files, MANIFEST_FILE);
    return _entryOf(given, has ? parseManifest(files[MANIFEST_FILE]) : null);
}

/**
 * @param {object} project — see the file header
 * @returns {Promise<{buildExperiment: function, module: object, manifest: ?object, files: Object<string, Uint8Array>,
 *   urls: Object<string, string>, project: {files: Object<string, string>, entry: string, mint: function, bare?: function}}>}
 */
export async function linkProject(project) {
    if (!project || typeof project !== 'object') {
        _fail('linkProject(project): project is { files, mint } or { url, mint } (+ `entry` when it carries no ' +
            MANIFEST_FILE + ') (got ' + typeof project + ').');
    }
    const given = project.entry;
    if (given !== undefined) {
        if (typeof given !== 'string' || !given) {
            _fail('linkProject: `entry` is the root-relative path of the module whose default export is the scene (got ' +
                JSON.stringify(given) + ').');
        }
        checkProjectPath(given);
    }
    const hasFiles = project.files !== undefined;
    const hasUrl = project.url !== undefined;
    if (hasFiles === hasUrl) {
        _fail('linkProject: a project is EITHER { files } OR { url } (got ' + (hasFiles ? 'both' : 'neither') + ').');
    }
    const mint = project.mint;
    if (typeof mint !== 'function') {
        _fail('linkProject: mint is REQUIRED — the host\'s (text, path) → { url, release? } (blobMint in a page, ' +
            'dataMint in node; lib/shim/project/link.js). A served folder is minted from the bytes it fetched.');
    }
    const bare = project.bare === undefined ? _defaultBare : project.bare;
    if (typeof bare !== 'function') {
        _fail('linkProject: bare is (specifier) → URL for a @descix/frqtl-web/... specifier.');
    }

    let sourceOf;
    let found = null;   // frqtl.json: { manifest, text, bytes }
    let encoded = null;
    if (hasFiles) {
        const files = project.files;
        if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
            _fail('linkProject: project.files is the map { path: text } and has no files.');
        }
        for (const p of Object.keys(files)) {
            checkProjectPath(p);
            if (typeof files[p] !== 'string') { _fail('linkProject: file "' + p + '" is not text.'); }
        }
        encoded = projectBytes(files);
        if (Object.prototype.hasOwnProperty.call(files, MANIFEST_FILE)) {
            found = { manifest: parseManifest(files[MANIFEST_FILE]), text: files[MANIFEST_FILE], bytes: encoded[MANIFEST_FILE] };
        }
        sourceOf = async function (p, from, spec) {
            if (!Object.prototype.hasOwnProperty.call(files, p)) {
                _fail(from === undefined
                    ? 'the entry "' + p + '" is not a project file (files: ' + Object.keys(files).join(', ') + ').'
                    : '"' + from + '" imports "' + spec + '" (' + p + '), which is not a project file (files: ' +
                      Object.keys(files).join(', ') + ') — a relative specifier names a file in the project, never an HTTP ' +
                      'sibling; package internals have no public specifier.');
            }
            const t = files[p];
            if (!t.trim()) { _fail('the project file "' + p + '" is empty.'); }
            return { text: t, bytes: encoded[p] };
        };
    } else {
        if (typeof project.url !== 'string' || !project.url.endsWith('/')) {
            _fail('linkProject({ url }): url is the served project folder, ending in "/" (got ' + JSON.stringify(project.url) + ').');
        }
        const base = _folderUrl(project.url);
        found = await _fetchManifest(base);
        sourceOf = async function (p, from, spec) {
            const u = new URL(p, base).href;
            let res;
            try { res = await fetch(u); }
            catch (e) { _fail('fetching "' + p + '" (' + u + ') failed: ' + String((e && e.message) || e) + '.'); }
            if (!res.ok) {
                _fail((from === undefined ? 'the entry "' + p + '"' : '"' + from + '" imports "' + spec + '" (' + p + '), which') +
                    ' is not served at ' + u + ' (HTTP ' + res.status + ')' +
                    (from === undefined ? '.' : ' — a relative specifier names a file in the project; package internals have no public specifier.'));
            }
            const raw = new Uint8Array(await res.arrayBuffer());
            let text;
            try { text = _UTF8.decode(raw); }
            catch (e) { _fail('"' + p + '" is not valid UTF-8 (' + u + ') — a project file is a UTF-8 text module.'); }
            if (!text.trim()) { _fail('the project file "' + p + '" is empty.'); }
            return { text: text, bytes: raw };
        };
    }
    const manifest = found ? found.manifest : null;
    const entry = _entryOf(given, manifest);
    if (!isModulePath(entry)) {
        _fail('linkProject: the entry "' + entry + '" is not a module path (' + MODULE_EXTENSIONS.join(' / ') + ').');
    }

    const g = await _walk(entry, sourceOf);
    _refuseUnreached(project, g);

    // The linked set's bytes: a file map's through linkedFiles (its owner); a served folder's are what was fetched.
    const bytes = hasFiles ? linkedFiles(encoded) : linkedFiles(Object.assign(found ? { [MANIFEST_FILE]: found.bytes } : {}, g.bytes));
    const heldFiles = hasFiles ? Object.assign({}, project.files)
        : Object.assign(found ? { [MANIFEST_FILE]: found.text } : {}, g.files);

    const urls = {};
    const minted = [];
    try {
        for (const p of g.order) {
            const text = _rewrite(g.files[p], g.edges[p], function (e) {
                return e.kind === 'file' ? urls[e.target] : bare(e.spec);
            });
            const m = mint(text, p);
            if (!m || typeof m.url !== 'string') { _fail('mint(text, path) must return { url, release? } (for "' + p + '").'); }
            minted.push(m);
            urls[p] = m.url;
        }
        let ns;
        try { ns = await import(urls[entry]); }
        catch (err) { throw _namePaths(err, urls); }
        const held = { files: heldFiles, entry: entry, mint: mint };
        if (project.bare !== undefined) { held.bare = project.bare; }
        return { buildExperiment: _entryFunction(ns, entry), module: ns, manifest: manifest, files: bytes,
            urls: Object.assign({}, urls), project: held };
    } finally {
        for (const m of minted) { if (typeof m.release === 'function') { m.release(); } }
    }
}

/**
 * An error raised while the project evaluates, with every minted URL in its message replaced by the project path
 * it names (byte-identical files share one minted URL: all their paths), and every package file URL by its
 * specifier — so a duplicate kind reads "kind "Wall" is already registered by @descix/frqtl-web/parts/Wall.js;
 * parts/Wall2.js registers it again". The SAME error is rethrown (its stack kept): enrichment, never a catch.
 */
function _namePaths(err, urls) {
    if (!err || typeof err.message !== 'string') { return err; }
    const byUrl = new Map();
    for (const p of Object.keys(urls)) { byUrl.set(urls[p], (byUrl.get(urls[p]) || []).concat(p)); }
    let msg = err.message;
    for (const [url, paths] of [...byUrl.entries()].sort(function (a, b) { return b[0].length - a[0].length; })) {
        msg = msg.split(url).join(paths.join(' (= ') + (paths.length > 1 ? ', byte-identical)' : ''));
    }
    const root = packageRoot();
    msg = msg.replace(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\s;,)\'"]+)', 'g'), function (m, lp) {
        return specifierOfLibPath(lp) || m;
    });
    try { err.message = msg; } catch (_) { /* a frozen error keeps its own text */ }
    return err;
}

/** The entry path of a one-string sketch held as a project. */
export const SKETCH_ENTRY = 'sketch.js';

/**
 * The one-file project of a sketch held as one string.
 * @param {string} text
 * @returns {{files: Object<string, string>, entry: string}}
 */
export function sketchProject(text) {
    if (typeof text !== 'string') {
        _fail('sketchProject(text): the sketch module text (got ' + typeof text + ').');
    }
    const files = {};
    files[SKETCH_ENTRY] = text;
    return { files: files, entry: SKETCH_ENTRY };
}

/** One `blob:` URL per byte-identical module text in this page (blobMint's memo). */
const _blobUrls = new Map();

/**
 * A `blob:` module URL for `text` (a page). MEMOIZED by text for the page's lifetime: a re-link of the same text
 * (restart, a Record's parts reads) gets the same URL, so the ESM cache keeps ONE instance and a project's own part
 * file registers its kind once — node's `data:` URLs are content-addressed the same way. `release()` is a no-op:
 * the URL stays valid for the next link of those bytes.
 */
export function blobMint(text) {
    let url = _blobUrls.get(text);
    if (!url) {
        url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        _blobUrls.set(text, url);
    }
    return { url: url, release: function () {} };
}

/**
 * The `bare` of a host whose modules are NOT served one file per URL (frqtl-web.min.js): a
 * `@descix/frqtl-web/...` specifier resolves to a minted module that re-exports the namespace this
 * host already evaluated for libPathOf(spec), read through `readExpr` (a global expression the minted
 * module can reach, e.g. 'FRQTL.modules'). One minted URL per module, kept for the page's lifetime,
 * so every project links against the same instances. A specifier whose module the host does not carry
 * THROWS naming it.
 * @param {Object<string, object>} modules — lib-relative path → module namespace
 * @param {string} readExpr — the expression that evaluates to `modules` in a minted module
 * @param {function(string): {url: string}} mint
 * @returns {function(string): string}
 */
export function namespaceBare(modules, readExpr, mint) {
    const urls = {};
    return function bare(spec) {
        const libPath = libPathOf(spec);
        if (urls[libPath]) { return urls[libPath]; }
        const ns = modules[libPath];
        if (!ns) {
            _fail('"' + spec + '" names ' + libPath + ', which this host does not carry (it carries: ' +
                Object.keys(modules).join(', ') + ').');
        }
        const lines = ['const ns = ' + readExpr + '[' + JSON.stringify(libPath) + '];'];
        for (const k of Object.keys(ns)) {
            if (k === 'default') { lines.push('export default ns.default;'); }
            else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)) { lines.push('export const ' + k + ' = ns.' + k + ';'); }
            else { _fail(libPath + ' exports "' + k + '", which is not an identifier.'); }
        }
        urls[libPath] = mint(lines.join('\n') + '\n').url;
        return urls[libPath];
    };
}

/** A `data:` module URL for `text` (node). */
export function dataMint(text) {
    return { url: 'data:text/javascript;charset=utf-8,' + encodeURIComponent(text), release: function () {} };
}
