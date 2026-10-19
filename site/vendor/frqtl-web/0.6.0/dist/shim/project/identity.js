/* Copyright 2023-2026 by Essam Abadir */

/**
 * identity.js — THE project identity: one published function over a project's files.
 *
 *   projectIdentity(project) → Promise<string>   lowercase hex sha256
 *       project — { files: { '<path>': Uint8Array, … } } — BYTES, never text (any other keys are ignored)
 *   projectBytes(files) → { '<path>': Uint8Array }  the bytes a { path: text } map denotes (UTF-8)
 *
 * A host passes the bytes it ran: the linker hashes the bytes it fetched (a served folder) or the UTF-8
 * encoding of the text it was handed (a file map, projectBytes); node hands a file's Buffer. A BOM is part
 * of a file's bytes, so it is part of the identity (a decoder strips it only from the executed text).
 *
 * The byte recipe (one recipe from the first pre-release on; there is no normalization):
 *   for each file, in ascending BYTE order of its path (UTF-8),
 *     the path   (UTF-8, '/'-separated, root-relative, no leading './')   then a 0x00 byte
 *     the decimal byte length of the file (ASCII digits)                   then a 0x00 byte
 *     the file's raw bytes
 *   then the sha256 of the whole stream.
 *
 * Swapping the order of the input keys cannot change the value (the path order is canonical); one
 * flipped byte, or a dropped trailing newline, does. A path that is empty, absolute, starts with './'
 * or climbs with '..' is REFUSED, never repaired: a repaired path would hash a project the caller did
 * not hand in.
 *
 * Hashing is the platform's `crypto.subtle` (a global in a page and in node ≥ 19): one source, no host
 * branch. Gate: lib/shim/project/test/identity.test.mjs (an independent printf | shasum pipeline).
 */

const _enc = new TextEncoder();

function _fail(msg) {
    throw new Error('[identity] ' + msg + ' (FAIL-LOUD.)');
}

/** @param {Uint8Array} a @param {Uint8Array} b @returns {number} byte-order comparison */
function _byteCompare(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { if (a[i] !== b[i]) { return a[i] - b[i]; } }
    return a.length - b.length;
}

/**
 * THE project-path rule (identity and the linker both apply it): root-relative, '/'-separated, no
 * leading './', no empty / '.' / '..' segment. THROWS naming the path.
 * @param {string} p
 */
export function checkProjectPath(p) {
    if (!p) { _fail('a project file has an empty path.'); }
    if (p.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(p)) { _fail('"' + p + '" is absolute — a project path is root-relative.'); }
    if (p.startsWith('./')) { _fail('"' + p + '" starts with "./" — a project path carries no leading "./".'); }
    if (p.indexOf('\\') !== -1) { _fail('"' + p + '" uses "\\" — a project path is "/"-separated.'); }
    if (p.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
        _fail('"' + p + '" has an empty, "." or ".." segment — a project path names one file under the root.');
    }
}

/**
 * The bytes a { path: text } map denotes: each text UTF-8 encoded. THROWS on a non-string value.
 * @param {Object<string, string>} files
 * @returns {Object<string, Uint8Array>}
 */
export function projectBytes(files) {
    if (!files || typeof files !== 'object') {
        _fail('projectBytes(files): files is the map { path: text } (got ' + typeof files + ').');
    }
    const out = {};
    for (const p of Object.keys(files)) {
        if (typeof files[p] !== 'string') { _fail('projectBytes: file "' + p + '" is not text (got ' + typeof files[p] + ').'); }
        out[p] = _enc.encode(files[p]);
    }
    return out;
}

/**
 * @param {{files: Object<string, Uint8Array>}} project
 * @returns {Promise<string>} the lowercase hex sha256
 */
export async function projectIdentity(project) {
    const files = project && project.files;
    if (!files || typeof files !== 'object') {
        _fail('projectIdentity(project): project.files is the map { path: bytes } (got ' + typeof files + ').');
    }
    const rows = Object.keys(files).map((p) => {
        checkProjectPath(p);
        const v = files[p];
        if (!(v instanceof Uint8Array)) {
            _fail('file "' + p + '" is not bytes (got ' + typeof v + ') — the identity is over the bytes a host ran; ' +
                'a { path: text } map goes through projectBytes(files) first.');
        }
        return { path: _enc.encode(p), bytes: v };
    });
    if (rows.length === 0) { _fail('projectIdentity(project): the project has no files.'); }
    rows.sort((a, b) => _byteCompare(a.path, b.path));
    const chunks = [];
    let total = 0;
    for (const r of rows) {
        const len = _enc.encode(String(r.bytes.length));
        for (const c of [r.path, Uint8Array.of(0), len, Uint8Array.of(0), r.bytes]) { chunks.push(c); total += c.length; }
    }
    const stream = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { stream.set(c, at); at += c.length; }
    const subtle = (typeof crypto !== 'undefined') ? crypto.subtle : null;
    if (!subtle || typeof subtle.digest !== 'function') {
        _fail('crypto.subtle is unavailable — this page is not a secure context (isSecureContext ' + String(typeof isSecureContext === 'undefined' ? undefined : isSecureContext) +
            '): serve the folder from https or from localhost (e.g. npx serve). The project identity is a content hash with no second ' +
            'hashing path.');
    }
    const view = new Uint8Array(await subtle.digest('SHA-256', stream));
    let hex = '';
    for (let i = 0; i < view.length; i++) { hex += (view[i] < 16 ? '0' : '') + view[i].toString(16); }
    return hex;
}
