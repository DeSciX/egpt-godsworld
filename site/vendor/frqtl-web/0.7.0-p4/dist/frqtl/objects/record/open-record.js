/* Copyright 2023-2026 by Essam Abadir */

/**
 * open-record.js — which Record is open on a runner: the ONE store FrqtlVision asks (its clip hook) and the
 * Record writes. One open Record per runner; a second open is refused by the facade (RecipeContext.startRecord).
 *
 *   openRecordOf(runner) → Record | null
 */

var _open = new WeakMap();

/** @param {object} runner @returns {object|null} the Record open on it */
function openRecordOf(runner) {
    return (runner && _open.get(runner)) || null;
}

/** @private — Record.js only */
function _setOpenRecord(runner, rec) {
    if (rec) { _open.set(runner, rec); } else { _open.delete(runner); }
}

export { openRecordOf, _setOpenRecord };
