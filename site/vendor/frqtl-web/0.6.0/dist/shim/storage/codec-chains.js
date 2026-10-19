/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/storage/codec-chains.js — THE owner of a ROSETTA codec chain saved in browser storage.
 *
 * A codec chain is one module text (the codec page's `chainToModule` output) under a name. It is not a sketch
 * project (frqtl.json is "kind": "scene"), so it has its own small store:
 *
 *   CODEC_CHAINS_NAMESPACE = 'codec-chains'
 *   CODEC_CHAIN_KEYS       = ['name', 'source']   the stored row, keyed by `name`
 *
 *   saveChain(provider, row)              → name   Save: write under its own name (overwrites)
 *   saveChainAs(provider, row, newName)   → newName Save As: REFUSED when newName is taken
 *   loadChain(provider, name)             → row | null
 *   listChains(provider)                  → [{ name }] ascending
 *   deleteChain(provider, name)
 *
 * The name follows the storage seam's key rule (index.js checkStorageKey), as a project folder's does. The
 * codec page's deep link `?module=<name>` is a key of this namespace.
 *
 * FAIL-LOUD. Layer 2 (physics): none.
 */

'use strict';

import { checkStorageKey } from './index.js';

export var CODEC_CHAINS_NAMESPACE = 'codec-chains';
export var CODEC_CHAIN_KEYS = Object.freeze(['name', 'source']);

function _fail(msg) {
    throw new Error('[codec-chains] ' + msg + ' (FAIL-LOUD.)');
}

/** @returns {Readonly<{name: string, source: string}>} */
export function normalizeChainRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
        _fail('a codec chain row is { ' + CODEC_CHAIN_KEYS.join(', ') + ' } (got ' + (row === null ? 'null' : typeof row) + ').');
    }
    var unknown = Object.keys(row).filter(function (k) { return CODEC_CHAIN_KEYS.indexOf(k) === -1; });
    if (unknown.length) {
        _fail('unknown key ' + unknown.map(function (k) { return JSON.stringify(k); }).join(', ') +
            ' — a codec chain row holds exactly CODEC_CHAIN_KEYS: ' + CODEC_CHAIN_KEYS.join(', ') + '.');
    }
    checkStorageKey(row.name, 'a codec chain name');
    if (typeof row.source !== 'string' || row.source.length === 0) {
        _fail('"source" is the chain\'s module text, a non-empty string.');
    }
    return Object.freeze({ name: row.name, source: row.source });
}

export function saveChain(provider, row) {
    var n = normalizeChainRow(row);
    provider.put(CODEC_CHAINS_NAMESPACE, n.name, { name: n.name, source: n.source });
    return n.name;
}

export function saveChainAs(provider, row, newName) {
    checkStorageKey(newName, 'a codec chain name');
    var n = normalizeChainRow(Object.assign({}, row, { name: newName }));
    if (provider.get(CODEC_CHAINS_NAMESPACE, newName) !== null) {
        _fail('a codec chain named "' + newName + '" is already saved — Save As takes a name no saved chain has.');
    }
    provider.put(CODEC_CHAINS_NAMESPACE, n.name, { name: n.name, source: n.source });
    return n.name;
}

export function loadChain(provider, name) {
    checkStorageKey(name, 'a codec chain name');
    var raw = provider.get(CODEC_CHAINS_NAMESPACE, name);
    if (raw === null || raw === undefined) { return null; }
    var row;
    try { row = normalizeChainRow(raw); }
    catch (e) { _fail('the saved chain "' + name + '" is not a codec chain row: ' + ((e && e.message) || e)); }
    if (row.name !== name) { _fail('the saved chain under "' + name + '" names itself "' + row.name + '".'); }
    return row;
}

export function listChains(provider) {
    return provider.list(CODEC_CHAINS_NAMESPACE).map(function (e) { return e.key; }).sort().map(function (k) {
        return { name: k };
    });
}

export function deleteChain(provider, name) {
    checkStorageKey(name, 'a codec chain name');
    provider['delete'](CODEC_CHAINS_NAMESPACE, name);
}
