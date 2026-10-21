/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/storage/boot.js — THE browser boot of the storage seam: install a LocalStorageProvider
 * as the active provider, once, unless a host has already set one.
 *
 * Every browser surface that persists through lib/shim/storage calls this at its boot — FraqtlIde
 * when it mounts, a framework-free page before it mounts a run-once card — and nothing else
 * constructs a LocalStorageProvider (gated by test/boot.test.mjs). Plain ESM, no DOM beyond
 * `window.localStorage`, shim-internal imports only.
 *
 *   bootLocalStorage() → { row, detail? }   (a row of STORAGE_BOOT_OUTCOMES)
 *   recordStorageBoot(el, outcome)           (writes STORAGE_BOOT_ATTRS on the host's element)
 *
 * A browser without usable localStorage is a declared outcome, never a throw: persistence is a
 * convenience for its consumers, each of which records its own unavailable state (the run-once
 * card's `storage-unavailable-shown`). The reason the provider could not be built is the detail.
 * A host never discards the outcome: it writes it with recordStorageBoot, the ONE writer of the
 * boot record's attributes.
 */

import { peekProvider, setActiveProvider } from './index.js';
import { LocalStorageProvider } from './local-storage-provider.js';

/** The closed table of boot outcomes. */
export const STORAGE_BOOT_OUTCOMES = Object.freeze([
    { id: 'installed',      means: 'a LocalStorageProvider was constructed and is now the active provider' },
    { id: 'already-active', means: 'a provider was already active (a host set its own, or boot ran before); left as is' },
    { id: 'unavailable',    means: 'localStorage is absent or write-blocked: no provider is set; detail is the reason' },
].map(Object.freeze));

/**
 * Install localStorage as the active storage provider unless one is already active.
 * @returns {{row: 'installed'|'already-active'|'unavailable', detail?: string}}
 */
export function bootLocalStorage() {
    if (peekProvider()) { return { row: 'already-active' }; }
    let provider;
    try {
        provider = new LocalStorageProvider();
    } catch (e) {
        return { row: 'unavailable', detail: (e && e.message) ? String(e.message) : String(e) };
    }
    setActiveProvider(provider);
    return { row: 'installed' };
}

/** The boot record's attribute names on a host element — the ONE vocabulary readers and the writer share. */
export const STORAGE_BOOT_ATTRS = Object.freeze({ row: 'data-storage-boot', detail: 'data-storage-boot-detail' });

const BOOT_ROWS = new Set(STORAGE_BOOT_OUTCOMES.map((r) => r.id));

/**
 * Write a bootLocalStorage() outcome onto `el` (STORAGE_BOOT_ATTRS). A row without a detail
 * clears any previous detail. Refuses a row STORAGE_BOOT_OUTCOMES does not list.
 * @param {{setAttribute: function, removeAttribute: function}} el
 * @param {{row: string, detail?: string}} outcome
 */
export function recordStorageBoot(el, outcome) {
    if (!el || typeof el.setAttribute !== 'function' || typeof el.removeAttribute !== 'function') {
        throw new TypeError('storage boot: recordStorageBoot needs a DOM element');
    }
    if (!outcome || !BOOT_ROWS.has(outcome.row)) {
        throw new Error('storage boot: ' + JSON.stringify(outcome && outcome.row) + ' is not a STORAGE_BOOT_OUTCOMES row');
    }
    el.setAttribute(STORAGE_BOOT_ATTRS.row, outcome.row);
    if (outcome.detail === undefined) { el.removeAttribute(STORAGE_BOOT_ATTRS.detail); }
    else { el.setAttribute(STORAGE_BOOT_ATTRS.detail, outcome.detail); }
}
