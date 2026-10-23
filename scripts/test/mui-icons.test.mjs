/* Copyright 2023-2026 by Essam Abadir */

/**
 * mui-icons.test.mjs — gates on the header's vendored Material icons (site/vendor/mui-icons/, read by
 * site/app-assets/maxi-icons.js):
 *   1. every PINNED.json field is one a gate below reads;
 *   2. the pinned tarball (npm's cache, addressed by the integrity) hashes to the pin, and every vendored file IS
 *      that tarball's package/<file>;
 *   3. the version directory holds exactly the pinned files, each hashing to its pinned sha256 (a flipped byte and
 *      a stray file are red);
 *   4. the icons the page uses are exactly the pinned esm files: ICON_FILES ⊆ pin, every pinned esm file is used,
 *      every role maxi-lab.js paints is an ICON_FILES role (an unmanifested icon and an unknown role are red);
 *   5. every pinned icon reads by its exact upstream shape (a changed shape is refused by name).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ICON_FILES, iconShape, loadIcons } from '../../site/app-assets/maxi-icons.js';
import { testTmpDir } from './tmpdir.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENDOR = path.join(REPO, 'site', 'vendor', 'mui-icons');
const PIN = JSON.parse(fs.readFileSync(path.join(VENDOR, 'PINNED.json'), 'utf8'));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const filesUnder = (root) => fs.readdirSync(root, { recursive: true }).filter((f) => fs.statSync(path.join(root, f)).isFile()).map((f) => f.split(path.sep).join('/')).sort();

// ── 1. the pin's fields ──────────────────────────────────────────────────────────────────────

/** Every PINNED.json leaf a gate here reads (`files` is read whole); a field outside this list is unverified, so RED. */
const PIN_FIELDS_VERIFIED = Object.freeze(['name', 'version', 'npm.tarball', 'npm.shasum', 'npm.integrity', 'tarballSha256', 'tarballBytes', 'license', 'files']);
function leaves(o, at) {
    return Object.entries(o).flatMap(([k, v]) => (k !== 'files' && v && typeof v === 'object' && !Array.isArray(v)) ? leaves(v, at + k + '.') : [at + k]);
}

test('every mui-icons PINNED.json field is one a gate reads (an unread field is red)', () => {
    const fields = leaves(PIN, '').filter((f) => f !== '_purpose').sort();
    assert.deepEqual(fields, [...PIN_FIELDS_VERIFIED].sort());
    assert.notDeepEqual(leaves(Object.assign({}, PIN, { resolvedFrom: 'x' }), '').filter((f) => f !== '_purpose').sort(), [...PIN_FIELDS_VERIFIED].sort(), 'a planted unread field must differ');
    assert.equal(PIN.name, '@mui/icons-material');
    assert.equal(PIN.npm.tarball, 'https://registry.npmjs.org/@mui/icons-material/-/icons-material-' + PIN.version + '.tgz');
    assert.ok(fs.existsSync(path.join(VENDOR, PIN.version)), 'the pinned version directory exists');
    assert.deepEqual(fs.readdirSync(VENDOR).sort(), ['PINNED.json', PIN.version].sort(), 'one version directory beside the pin: an old version is deleted in the same change');
});

// ── 2. the tarball ───────────────────────────────────────────────────────────────────────────

/** The pinned tarball from npm's cache, checked against every pinned hash; THROWS naming how to fetch it. */
function cachedTarball(pin) {
    const hex = Buffer.from(pin.npm.integrity.replace(/^sha512-/, ''), 'base64').toString('hex');
    const cache = execFileSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).trim();
    const file = path.join(cache, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
    if (!fs.existsSync(file)) { throw new Error(pin.name + '@' + pin.version + ' is not in npm\'s cache (' + file + '): run `npm cache add ' + pin.name + '@' + pin.version + '`.'); }
    const bytes = fs.readFileSync(file);
    assert.equal(sha256(bytes), pin.tarballSha256, 'tarballSha256');
    assert.equal(createHash('sha1').update(bytes).digest('hex'), pin.npm.shasum, 'npm.shasum');
    assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), pin.npm.integrity, 'npm.integrity');
    assert.equal(bytes.length, pin.tarballBytes, 'tarballBytes');
    return bytes;
}

test('the pinned tarball hashes to the pin, and every vendored file is its package/<file> byte for byte', () => {
    const dir = testTmpDir('mui-icons');
    try {
        fs.writeFileSync(path.join(dir, 'p.tgz'), cachedTarball(PIN));
        execFileSync('tar', ['-xzf', path.join(dir, 'p.tgz'), '-C', dir, ...Object.keys(PIN.files).map((f) => 'package/' + f)]);
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package', 'package.json'), 'utf8'));
        assert.equal(pkg.name + '@' + pkg.version, PIN.name + '@' + PIN.version);
        assert.equal(pkg.license, 'MIT');
        const differ = Object.keys(PIN.files).filter((f) => !fs.readFileSync(path.join(VENDOR, PIN.version, f)).equals(fs.readFileSync(path.join(dir, 'package', f))));
        assert.deepEqual(differ, [], 'vendored files differ from the published tarball');
        assert.match(fs.readFileSync(path.join(VENDOR, PIN.version, PIN.license), 'utf8'), /^The MIT License \(MIT\)/, 'the package LICENSE sits beside the icons');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── 3. the vendored files against the pin ────────────────────────────────────────────────────

export function copyFaults(root, pin) {
    const faults = [];
    const have = filesUnder(root);
    const want = Object.keys(pin.files).sort();
    for (const f of have) { if (!want.includes(f)) { faults.push(f + ': vendored but not in the pin'); } }
    for (const f of want) {
        if (!have.includes(f)) { faults.push(f + ': pinned but not vendored'); continue; }
        const got = sha256(fs.readFileSync(path.join(root, f)));
        if (got !== pin.files[f]) { faults.push(f + ': sha256 ' + got + ', pinned ' + pin.files[f]); }
    }
    return faults;
}

test('the version directory holds exactly the pinned files, each at its pinned sha256 (a flipped byte and a stray file are red)', () => {
    const root = path.join(VENDOR, PIN.version);
    assert.deepEqual(copyFaults(root, PIN), []);
    const tmp = testTmpDir('mui-icons-copy');
    try {
        fs.cpSync(root, tmp, { recursive: true });
        const victim = path.join(tmp, 'esm', 'Info.js');
        const buf = fs.readFileSync(victim); buf[buf.length >> 1] ^= 0x01; fs.writeFileSync(victim, buf);
        fs.writeFileSync(path.join(tmp, 'esm', 'Star.js'), 'x');
        assert.deepEqual(copyFaults(tmp, PIN).map((f) => f.split(':')[0]).sort(), ['esm/Info.js', 'esm/Star.js']);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ── 4. the icons the page uses ───────────────────────────────────────────────────────────────

/** The roles maxi-lab.js paints: every iconButton(…, '<role>' literal. */
export function rolesPainted(src) {
    return [...src.matchAll(/iconButton\(\s*el\.\w+,\s*icons,\s*'([^']+)'/g)].map((m) => m[1]);
}

export function useFaults(pin, files, labSrc) {
    const faults = [];
    const pinned = Object.keys(pin.files);
    for (const [role, f] of Object.entries(files)) { if (!pinned.includes(f)) { faults.push(role + ': ' + f + ' is not in the pin'); } }
    const used = Object.values(files);
    for (const f of pinned.filter((p) => p.startsWith('esm/'))) { if (!used.includes(f)) { faults.push(f + ': pinned but no role draws it'); } }
    const painted = rolesPainted(labSrc);
    if (painted.length === 0) { faults.push('maxi-lab.js paints no icon through iconButton'); }
    for (const r of painted) { if (!Object.prototype.hasOwnProperty.call(files, r)) { faults.push('maxi-lab.js paints the role "' + r + '", which ICON_FILES lacks'); } }
    for (const r of Object.keys(files)) { if (!painted.includes(r)) { faults.push(r + ': ICON_FILES has it and maxi-lab.js never paints it'); } }
    return faults;
}

test('the page uses exactly the pinned icons, and paints only ICON_FILES roles (an unmanifested icon and an unknown role are red)', async () => {
    const lab = fs.readFileSync(path.join(REPO, 'site', 'app-assets', 'maxi-lab.js'), 'utf8');
    assert.deepEqual(useFaults(PIN, ICON_FILES, lab), []);
    const extra = Object.assign({}, ICON_FILES, { star: 'esm/Star.js' });
    assert.deepEqual(useFaults(PIN, extra, lab.replace("iconButton(el.info, icons, 'info');", "iconButton(el.info, icons, 'info'); iconButton(el.info, icons, 'star');")), ['star: esm/Star.js is not in the pin']);
    assert.deepEqual(useFaults(PIN, ICON_FILES, lab.replace("iconButton(el.info, icons, 'info');", "iconButton(el.info, icons, 'star');")),
        ['maxi-lab.js paints the role "star", which ICON_FILES lacks', 'info: ICON_FILES has it and maxi-lab.js never paints it']);
    const fetchText = async (rel) => fs.readFileSync(path.join(VENDOR, rel), 'utf8');
    await assert.rejects(loadIcons(fetchText, extra), /the icon for "star" is esm\/Star\.js, which the pin .* does not list/);
});

// ── 5. the upstream shape ────────────────────────────────────────────────────────────────────

test('every pinned icon reads by its exact upstream shape; a changed shape, a foreign attribute and a wrong name are refused by name', async () => {
    const icons = await loadIcons(async (rel) => fs.readFileSync(path.join(VENDOR, rel), 'utf8'));
    assert.equal(icons.version, PIN.version);
    assert.deepEqual(Object.keys(icons.shapes).sort(), Object.keys(ICON_FILES).sort());
    assert.equal(icons.shapes.record.tag, 'circle');
    assert.deepEqual(icons.shapes.play.attrs, { d: 'M8 5v14l11-7z' });
    const play = fs.readFileSync(path.join(VENDOR, PIN.version, 'esm', 'PlayArrow.js'), 'utf8');
    assert.throws(() => iconShape(play.replace('_jsx("path", {', '[_jsx("path", {'), 'esm/PlayArrow.js'), /esm\/PlayArrow\.js is not one createSvgIcon/);
    assert.throws(() => iconShape(play.replace('  d: "M8 5v14l11-7z"', '  d: "M8 5v14l11-7z",\n  opacity: ".3"'), 'esm/PlayArrow.js'), /carries "opacity: \\".3\\""/);
    assert.throws(() => iconShape(play, 'esm/Pause.js'), /names its icon "PlayArrow", not its file name "Pause"/);
});
