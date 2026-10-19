/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-web-pin.mjs — the ONE node-side reader of the vendored FRQTL package's pin and location.
 *
 * site/vendor/frqtl-web/PINNED.json names the version; site/vendor/frqtl-web/<version>/dist is the published
 * @descix/frqtl-web tarball's dist/ copied unchanged, with the tarball's package.json beside it. Every script
 * and test that needs a vendored file asks here, so the version directory is spelled once, from the pin.
 *
 *   PINNED            the parsed PINNED.json
 *   VENDOR_REL        'site/vendor/frqtl-web' (repo-relative)
 *   DIST_REL          'site/vendor/frqtl-web/<version>/dist' (repo-relative)
 *   SITE_DIST         'vendor/frqtl-web/<version>/dist' — the dist as seen from a page at the site root
 *   distFile(rel)     absolute path of a regular file inside the dist; THROWS naming the pin when it is missing, a directory, or outside the dist
 *   distUrl(rel)      its file: URL (for import())
 *   packageJson()     the vendored package.json, after its bytes hash to PINNED.packageJsonSha256
 *   exportFile(sub)   the dist-relative file the package exports at `sub` ('./registry', './boot', …) for a page
 *                     (the `default` condition); THROWS when the export is absent or not a vendored file
 *   cachedTarball(rec) a pinned registry tarball's bytes (PINNED or PINNED.node), read from npm's content-addressed cache
 *                     by its pinned integrity (`npm ci --prefix minimaxi` fills it), after its sha256, sha1 shasum,
 *                     sha512 integrity and byte count all equal the pin; THROWS naming the field that differs
 *   sceneFile(rel)    a registry row's `source` ('scenes/<file>.js') → its vendored file, repo-relative, resolved by the
 *                     package's own path authority (the engine router its `projectOf` reads through; the package
 *                     exports no public reader of that path, so this is the one place that imports the router)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VENDOR_REL = 'site/vendor/frqtl-web';
export const PINNED = JSON.parse(fs.readFileSync(path.join(REPO, VENDOR_REL, 'PINNED.json'), 'utf8'));
const VERSION_REL = VENDOR_REL + '/' + PINNED.version;
export const DIST_REL = VERSION_REL + '/' + PINNED.copied;
export const SITE_DIST = DIST_REL.slice('site/'.length);

export function distFile(rel) {
    const root = path.join(REPO, DIST_REL);
    const abs = path.resolve(root, rel);
    const inside = path.relative(root, abs);
    if (!inside || inside === '..' || inside.startsWith('..' + path.sep) || path.isAbsolute(inside)) {
        throw new Error('[frqtl-web-pin] ' + rel + ' leaves the vendored ' + PINNED.name + '@' + PINNED.version +
            ' dist (' + DIST_REL + '): a dist path names a file inside it. (FAIL-LOUD.)');
    }
    if (!fs.existsSync(abs)) {
        throw new Error('[frqtl-web-pin] ' + rel + ' is not in the vendored ' + PINNED.name + '@' + PINNED.version +
            ' (' + DIST_REL + '). (FAIL-LOUD.)');
    }
    if (!fs.statSync(abs).isFile()) {
        throw new Error('[frqtl-web-pin] ' + rel + ' is a directory (or not a regular file) in the vendored ' + PINNED.name + '@' +
            PINNED.version + ' (' + DIST_REL + '): a dist path names a file. (FAIL-LOUD.)');
    }
    return abs;
}

export const distUrl = (rel) => pathToFileURL(distFile(rel)).href;

export function packageJson() {
    const bytes = fs.readFileSync(path.join(REPO, VERSION_REL, PINNED.packageJson));
    const got = createHash('sha256').update(bytes).digest('hex');
    if (got !== PINNED.packageJsonSha256) {
        throw new Error('[frqtl-web-pin] ' + VERSION_REL + '/' + PINNED.packageJson + ' hashes to ' + got + ', not the pinned ' +
            PINNED.packageJsonSha256 + ' — it is not the published ' + PINNED.name + '@' + PINNED.version + ' package.json. (FAIL-LOUD.)');
    }
    return JSON.parse(bytes.toString('utf8'));
}

export function exportFile(sub) {
    const t = packageJson().exports[sub];
    const target = (t && typeof t === 'object') ? t.default : t;
    const prefix = './' + PINNED.copied + '/';
    if (typeof target !== 'string' || !target.startsWith(prefix)) {
        throw new Error('[frqtl-web-pin] ' + PINNED.name + '@' + PINNED.version + ' exports ' + JSON.stringify(sub) + ' as ' + JSON.stringify(t) +
            ' — not a page (default) file under ' + prefix + '. (FAIL-LOUD.)');
    }
    const rel = target.slice(prefix.length);
    distFile(rel);
    return rel;
}

const { engineRouter } = await import(distUrl('shim/engine/router.js'));
const SCENE_ROUTER = engineRouter({ mode: 'cdn', base: new URL('.', distUrl(PINNED.distManifest)).href.replace(/\/$/, '') });

export function sceneFile(rel) {
    const abs = fileURLToPath(SCENE_ROUTER.resolve(rel));
    if (!fs.existsSync(abs)) {
        throw new Error('[frqtl-web-pin] scene ' + JSON.stringify(rel) + ' resolves to ' + abs + ', which the vendored ' + PINNED.name + '@' + PINNED.version + ' does not ship. (FAIL-LOUD.)');
    }
    return path.relative(REPO, abs).split(path.sep).join('/');
}

export function cachedTarball(rec) {
    const name = rec.name || PINNED.node.name;
    const integrity = rec.npm.integrity;
    if (!/^sha512-/.test(integrity)) { throw new Error('[frqtl-web-pin] ' + name + ': the pinned integrity is not sha512 (' + integrity + '). (FAIL-LOUD.)'); }
    const hex = Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex');
    const cache = execFileSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).trim();
    const file = path.join(cache, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
    if (!fs.existsSync(file)) {
        throw new Error('[frqtl-web-pin] ' + name + '@' + PINNED.version + ' is not in npm\'s cache (' + file + ') — run `npm ci --prefix minimaxi`. (FAIL-LOUD.)');
    }
    const bytes = fs.readFileSync(file);
    const got = {
        tarballSha256: createHash('sha256').update(bytes).digest('hex'),
        'npm.shasum': createHash('sha1').update(bytes).digest('hex'),
        'npm.integrity': 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
        tarballBytes: bytes.length
    };
    const want = { tarballSha256: rec.tarballSha256, 'npm.shasum': rec.npm.shasum, 'npm.integrity': integrity, tarballBytes: rec.tarballBytes };
    for (const k of Object.keys(want)) {
        if (got[k] !== want[k]) {
            throw new Error('[frqtl-web-pin] ' + name + ' tarball ' + k + ' is ' + got[k] + ', the pin says ' + want[k] + ' (PINNED.json). (FAIL-LOUD.)');
        }
    }
    return bytes;
}
