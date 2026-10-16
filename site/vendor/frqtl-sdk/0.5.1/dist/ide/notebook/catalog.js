/* Copyright 2023-2026 by Essam Abadir */

/**
 * firstContactNotebook — the ONE reader of the notebook catalog's first-contact default.
 *
 * The catalog (lib/notebooks/notebooks.json) owns the notebook roster AND, beside it, the
 * `firstContact` id: the notebook FAT opens on when no `?notebook=` is named (CEO 2026-10-13:
 * the Entropy-Log Bijection). Declared beside the roster, as the walkthrough registry
 * declares FIRST_CONTACT_WALKTHROUGH_ID beside its rungs. A deep link naming a notebook wins;
 * that branch never reaches this reader.
 *
 * Callers: NotebookBrowserView (the served catalog, at open), scripts/assemble-static-deploy.mjs
 * (every roster the bundle carries, after narrowing it to the shipped set) and the catalog test.
 *
 * Named ESM export. PURE — no DOM, no fetch, no Runtime.
 *
 * @param {{notebooks: Array<{id: string}>, firstContact?: string}} catalog — a parsed notebooks.json.
 * @returns {{id: string, file: string, title: string, group: string}} the roster row named by `firstContact`.
 * @throws {Error} `firstContact` absent, not a string, or naming an id outside `notebooks[]`.
 */
export function firstContactNotebook(catalog) {
    if (!catalog || !Array.isArray(catalog.notebooks)) {
        throw new Error('[notebook catalog] no notebooks[] array — cannot resolve the first-contact notebook.');
    }
    var id = catalog.firstContact;
    if (typeof id !== 'string' || id === '') {
        throw new Error('[notebook catalog] notebooks.json declares no "firstContact" notebook id — ' +
            'FAT has nothing to open with no ?notebook= (lib/notebooks/notebooks.json).');
    }
    for (var i = 0; i < catalog.notebooks.length; i++) {
        if (catalog.notebooks[i].id === id) { return catalog.notebooks[i]; }
    }
    throw new Error('[notebook catalog] firstContact "' + id + '" is not in the catalog — listed ids: [' +
        catalog.notebooks.map(function (n) { return n.id; }).join(', ') + '].');
}
