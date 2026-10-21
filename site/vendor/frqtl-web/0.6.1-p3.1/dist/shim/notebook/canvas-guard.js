/* Copyright 2023-2026 by Essam Abadir */

/**
 * canvas-guard — the SOLE C8 migration-guard authority for a DECLARED canvas cell
 * PURE module — NO DOM / engine / Runtime / Bus
 * import. The notebook-pane's `_resolveDeclaredCanvas` imports this one helper so no
 * host re-derives the legality test (DRY — one guard).
 *
 * ── The guard (C8 / FLAG-A) ──────────────────────────────────────────────────
 *
 * Folding `produces`→`out` (format.js) means a declared-producing canvas now
 * LEGITIMATELY carries `out`. The guard must distinguish:
 *
 *   LEGAL   — `setup` present AND every `out` name is also a `produces` name AND no
 *             `bind` AND no `in`. (Equivalently `out ⊆ produces`.)
 *   ILLEGAL — any `spec` (the retired opaque factory name, C3); any `bind` (a retired
 *             runner ref); any `in` (a retired consumed-runner ref); any `out` name NOT
 *             in `produces` (a legacy `out=<runner>` ref); or no `setup` at all.
 *
 * Get this EXACTLY right or a legacy runner-ref cell slips through (silent) or a valid
 * producing canvas FAILS LOUD (false positive). The function THROWS the FAIL-LOUD error
 * (so callers `try`/`catch` and surface it) rather than returning a flag — there is no
 * "legal-but-degraded" path.
 */

'use strict';

/**
 * Assert a `canvas` cell is a LEGAL declared producing canvas, or FAIL-LOUD-throw.
 *
 * @param {object} cell — a parsed canvas cell `{ id, setup, spec, bind, in[], out[], produces[] }`.
 * @returns {{ produces: string[] }} the cleaned declared produces names (for the caller's commit loop).
 * @throws {Error} FAIL-LOUD on any retired shape (spec / bind / in / out∉produces / missing setup).
 */
export function assertDeclaredCanvasLegal(cell) {
    cell = cell || {};
    var id = cell.id || '(unnamed)';
    var produces = Array.isArray(cell.produces) ? cell.produces : [];
    var out = Array.isArray(cell.out) ? cell.out : [];
    var inArr = Array.isArray(cell.in) ? cell.in : [];

    // (1) A `spec` on a canvas is the RETIRED opaque-factory shorthand (C3).
    if (cell.spec) {
        throw new Error(
            '[frqtl] canvas cell "' + id + '" carries a `spec` ("' + cell.spec +
            '", an opaque factory name) — that path is RETIRED. Declare ' +
            '`setup="<module>#<export>"` on the canvas instead. (FAIL-LOUD.)');
    }

    // The non-produces `out` names: an `out` name NOT also declared in `produces` is a
    // legacy `out=<runner>` runner ref (the retired authored-builder bind). C8.
    var outNotProduced = out.filter(function (n) { return produces.indexOf(n) === -1; });
    var hasLegacyRunnerRef = !!cell.bind || inArr.length > 0 || outNotProduced.length > 0;

    // (2) No `setup` → no remaining render path (no builder, no factory).
    if (!cell.setup) {
        throw new Error(
            '[frqtl] canvas cell "' + id + '" declares no `setup="<module>#<export>"` ' +
            (hasLegacyRunnerRef
                ? 'but carries a legacy `bind=`/`in=`/`out=` runner reference — that authored ' +
                  'builder path is DELETED. Convert it to a declarative canvas. '
                : '— nothing to render. ') +
            '(FAIL-LOUD — one developer-facing way: module + declarative canvas.)');
    }

    // (3) `setup` present BUT a legacy runner ref alongside it → unconverted; FAIL-LOUD.
    //     A `produces`-derived `out` is LEGAL (out ⊆ produces); a `bind`, an `in`, or an
    //     `out` name NOT in `produces` is the retired runner-ref shape.
    if (hasLegacyRunnerRef) {
        throw new Error(
            '[frqtl] canvas cell "' + id + '" declares `setup` AND carries a legacy ' +
            '`bind=`/`in=`/`out=` runner reference (' +
            (cell.bind ? 'bind="' + cell.bind + '" ' : '') +
            (inArr.length ? 'in=[' + inArr.join(', ') + '] ' : '') +
            (outNotProduced.length ? 'out=[' + outNotProduced.join(', ') + '] not in produces ' : '') +
            '). A declared canvas needs ONLY `setup`/`opts`/`stage`/`seed` (+ optional ' +
            '`produces`/`produceVia`). The authored runner-building builder is RETIRED. ' +
            '(FAIL-LOUD — never silently prefer one authority.)');
    }

    return { produces: produces.slice() };
}
