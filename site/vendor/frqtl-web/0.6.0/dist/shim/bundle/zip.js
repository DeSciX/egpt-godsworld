/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/bundle/zip.js — a hand-rolled STORE-only ZIP writer + reader
 * (R2).
 *
 * ── Why hand-rolled + STORE-only ─────────────────────────────────────────────
 *
 * A bundle folder must download as ONE `.zip`. `jszip` was REJECTED (any dep
 * reachable from features ships in the sdk dist — supply-chain surface in the
 * lean shim). STORE (no compression, method 0) needs no deflate implementation,
 * is trivially readable by every standard unzip, and bundles are small text
 * files + one PNG. This module is PURE + DOM-free: it emits/consumes
 * `Uint8Array` only. The browser download trigger (`Blob` + `a.click`) is a THIN
 * feature-side helper (`lib/features/ide` — shim = bytes, feature = browser UX).
 *
 * ── Contract ─────────────────────────────────────────────────────────────────
 *
 *   zipStore(entries) → Uint8Array
 *     entries: [{ name: string, bytes: Uint8Array }]  (name = archive path)
 *
 *   unzipStore(bytes) → [{ name: string, bytes: Uint8Array }]
 *     Reads a STORE-only archive (throws FAIL-LOUD on a compressed entry, a bad
 *     signature, or a CRC mismatch — never silently returns wrong bytes).
 *
 *   textBytes(str) / bytesText(u8)   — UTF-8 encode/decode helpers (a text
 *                                      bundle file's bytes ARE its UTF-8 encoding).
 *
 * Layer 2 (physics): none — pure byte format.
 */

'use strict';

var _enc = new TextEncoder();
var _dec = new TextDecoder();

/** @param {string} s @returns {Uint8Array} */
export function textBytes(s) { return _enc.encode(s == null ? '' : String(s)); }

/** @param {Uint8Array} u8 @returns {string} */
export function bytesText(u8) { return _dec.decode(u8); }

// ── CRC-32 (IEEE 802.3, standard ZIP polynomial 0xEDB88320) ──────────────────

var _CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        t[n] = c >>> 0;
    }
    return t;
})();

/**
 * @param {Uint8Array} bytes
 * @returns {number} unsigned 32-bit CRC.
 */
export function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ _CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── little-endian writers ────────────────────────────────────────────────────

function _u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
function _u32(v) {
    v = v >>> 0;
    return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
}

function _concat(chunks) {
    var total = 0, i;
    for (i = 0; i < chunks.length; i++) { total += chunks[i].length; }
    var out = new Uint8Array(total);
    var off = 0;
    for (i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
    return out;
}

// ── little-endian readers ────────────────────────────────────────────────────

function _readU16(b, o) { return b[o] | (b[o + 1] << 8); }
function _readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

var LOCAL_SIG   = 0x04034b50;
var CENTRAL_SIG = 0x02014b50;
var EOCD_SIG    = 0x06054b50;

/**
 * Build a STORE-only ZIP archive from a list of named byte entries.
 *
 * @param {{name:string, bytes:Uint8Array}[]} entries
 * @returns {Uint8Array} the complete `.zip` bytes.
 */
export function zipStore(entries) {
    if (!Array.isArray(entries)) {
        throw new Error('[bundle/zip] zipStore(entries): entries must be an array.');
    }
    var localChunks = [];
    var centralChunks = [];
    var offset = 0;   // running offset of each local header

    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e || typeof e.name !== 'string' || !(e.bytes instanceof Uint8Array)) {
            throw new Error('[bundle/zip] zipStore: entry ' + i + ' must be {name:string, bytes:Uint8Array}.');
        }
        var nameBytes = textBytes(e.name);
        var data = e.bytes;
        var crc = crc32(data);
        var size = data.length;

        // Local file header.
        var local = _concat([
            new Uint8Array(_u32(LOCAL_SIG)),
            new Uint8Array(_u16(20)),           // version needed to extract (2.0)
            new Uint8Array(_u16(0)),            // general purpose bit flag
            new Uint8Array(_u16(0)),            // compression method: 0 = STORE
            new Uint8Array(_u16(0)),            // last mod time (fixed 0 — deterministic)
            new Uint8Array(_u16(0)),            // last mod date (fixed 0 — deterministic)
            new Uint8Array(_u32(crc)),
            new Uint8Array(_u32(size)),         // compressed size (== uncompressed for STORE)
            new Uint8Array(_u32(size)),         // uncompressed size
            new Uint8Array(_u16(nameBytes.length)),
            new Uint8Array(_u16(0)),            // extra field length
            nameBytes,
            data
        ]);
        localChunks.push(local);

        // Central directory record (references this local header's offset).
        var central = _concat([
            new Uint8Array(_u32(CENTRAL_SIG)),
            new Uint8Array(_u16(20)),           // version made by
            new Uint8Array(_u16(20)),           // version needed
            new Uint8Array(_u16(0)),            // flags
            new Uint8Array(_u16(0)),            // method: STORE
            new Uint8Array(_u16(0)),            // time
            new Uint8Array(_u16(0)),            // date
            new Uint8Array(_u32(crc)),
            new Uint8Array(_u32(size)),
            new Uint8Array(_u32(size)),
            new Uint8Array(_u16(nameBytes.length)),
            new Uint8Array(_u16(0)),            // extra length
            new Uint8Array(_u16(0)),            // comment length
            new Uint8Array(_u16(0)),            // disk number start
            new Uint8Array(_u16(0)),            // internal attrs
            new Uint8Array(_u32(0)),            // external attrs
            new Uint8Array(_u32(offset)),       // local header offset
            nameBytes
        ]);
        centralChunks.push(central);

        offset += local.length;
    }

    var localBlob = _concat(localChunks);
    var centralBlob = _concat(centralChunks);
    var eocd = _concat([
        new Uint8Array(_u32(EOCD_SIG)),
        new Uint8Array(_u16(0)),                    // disk number
        new Uint8Array(_u16(0)),                    // disk with central dir
        new Uint8Array(_u16(entries.length)),       // CD records on this disk
        new Uint8Array(_u16(entries.length)),       // total CD records
        new Uint8Array(_u32(centralBlob.length)),   // central dir size
        new Uint8Array(_u32(localBlob.length)),     // central dir offset (== size of all local records)
        new Uint8Array(_u16(0))                     // comment length
    ]);

    return _concat([localBlob, centralBlob, eocd]);
}

/**
 * Read a STORE-only ZIP archive. Walks the central directory (the canonical
 * index), resolves each entry's local header, and extracts its stored bytes.
 *
 * FAIL-LOUD: throws on a missing EOCD, a bad central/local signature, a
 * non-STORE compression method, or a CRC-32 mismatch — never returns wrong bytes.
 *
 * @param {Uint8Array} bytes
 * @returns {{name:string, bytes:Uint8Array}[]}
 */
export function unzipStore(bytes) {
    if (!(bytes instanceof Uint8Array)) {
        throw new Error('[bundle/zip] unzipStore(bytes): bytes must be a Uint8Array.');
    }
    // Locate the End Of Central Directory record (scan backward for its signature).
    var eocd = -1;
    for (var p = bytes.length - 22; p >= 0; p--) {
        if (_readU32(bytes, p) === EOCD_SIG) { eocd = p; break; }
    }
    if (eocd === -1) {
        throw new Error('[bundle/zip] unzipStore: End Of Central Directory record not found (not a ZIP).');
    }
    var count   = _readU16(bytes, eocd + 10);
    var cdOffset = _readU32(bytes, eocd + 16);

    var out = [];
    var o = cdOffset;
    for (var i = 0; i < count; i++) {
        if (_readU32(bytes, o) !== CENTRAL_SIG) {
            throw new Error('[bundle/zip] unzipStore: bad central directory signature at record ' + i + '.');
        }
        var method    = _readU16(bytes, o + 10);
        var crcStored = _readU32(bytes, o + 16);
        var compSize  = _readU32(bytes, o + 20);
        var nameLen   = _readU16(bytes, o + 28);
        var extraLen  = _readU16(bytes, o + 30);
        var commentLen = _readU16(bytes, o + 32);
        var localOff  = _readU32(bytes, o + 42);
        var name = bytesText(bytes.subarray(o + 46, o + 46 + nameLen));

        if (method !== 0) {
            throw new Error('[bundle/zip] unzipStore: entry "' + name + '" uses compression method ' +
                method + ' — this reader is STORE-only (method 0).');
        }

        // Resolve the local header to find the data start (its own name/extra lengths).
        if (_readU32(bytes, localOff) !== LOCAL_SIG) {
            throw new Error('[bundle/zip] unzipStore: bad local header signature for "' + name + '".');
        }
        var lNameLen  = _readU16(bytes, localOff + 26);
        var lExtraLen = _readU16(bytes, localOff + 28);
        var dataStart = localOff + 30 + lNameLen + lExtraLen;
        var data = bytes.slice(dataStart, dataStart + compSize);

        var crcActual = crc32(data);
        if (crcActual !== crcStored) {
            throw new Error('[bundle/zip] unzipStore: CRC-32 mismatch for "' + name +
                '" (stored ' + crcStored + ', computed ' + crcActual + ').');
        }
        out.push({ name: name, bytes: data });

        o += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}
