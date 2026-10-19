/* Copyright 2023-2026 by Essam Abadir */

/**
 * view-builder — the SOLE authority that synthesizes the canonical VIEW-ENTRY source
 * from a `view` cell's declarative configuration.
 *
 * Named ESM export. PURE module — NO DOM / engine / Runtime / Bus import. It is
 * host-neutral and node-testable: hosts (the notebook-pane in-app) import this one
 * helper and NONE inlines the template (the §router single-path-authority rule applied to the view-entry
 * template). It is the SIBLING of `setup-builder.js` for the generic `view` cell,
 * and it REUSES setup-builder's export-resolution + module-resolution helpers (DRY —
 * one single-export-else-FAIL-LOUD authority, one in-memory-module-set resolver).
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *
 * Given a view declaration — `module="<module-name>#<exportName>"` — and the
 * notebook's user-code module SET (`{ name → source }`), it returns the canonical
 * VIEW-ENTRY SOURCE STRING + the realm-internal output name. The entry imports the
 * user render module by name and RETURNS its render export under the realm-internal
 * output name:
 *
 *   import { <export> } from '<module>';
 *   return { <outName>: <export> };
 *
 * `Runtime.runCell` runs THIS entry IN THE REALM (the SAME executor + module-compile
 * path the declared canvas uses). The entry's `import { <export> } from '<module>'`
 * resolves against the notebook's in-memory module closure; the USER module's OWN
 * `import * as d3 from 'd3'` bare-specifier imports resolve via the realm's injected
 * 2a import-map (bare specifiers pass through the blob-module rewrite verbatim — see
 * module-resolver `rewriteRelativeToSiblingBlobs`, "bare → host loader"). The render
 * export is returned as a LIVE realm-internal ref (NOT a kernel binding, NOT crossed
 * over the data plane) — exactly as the declared-canvas synthesis returns a live
 * `runner` ref. The HOST then invokes `renderExport(ctx)` with the view `ctx`
 * (mount + frozen handle + binding seam) it assembles realm-side (see view-ctx.js).
 *
 * ── single-export resolution (FAIL-LOUD, never guess) ─────────────────────────
 *
 * `#export` may be omitted ONLY when the named module has EXACTLY ONE export. Zero or
 * multiple exports → FAIL-LOUD with a precise message (never a guess). This reuses
 * setup-builder's `moduleExportNames` + the same resolution discipline (C5 mirror).
 *
 * ── the import resolves against the in-memory module closure ──────────────────
 *
 * The emitted `import` uses the DECLARED module name (e.g. `'./views/d3-bars.js'`),
 * resolved against the notebook's `moduleSet()` via the existing in-memory blob
 * closure. An unknown/missing module → FAIL-LOUD HERE so the caller never ships an
 * entry that 404s the relative import downstream.
 */

'use strict';

import { canonKey } from './module-resolver.js';
import { moduleExportNames } from './setup-builder.js';

/* ── parse "<module-name>#<exportName>" ──────────────────────────────────────── */

/**
 * Split the view module declaration into `{ moduleName, exportName }`. The
 * `exportName` is the substring after the FIRST '#'; absent → ''. The `moduleName`
 * is verbatim (kept with its relative './…' prefix so the emitted import matches the
 * module cell name the closure is keyed by).
 *
 * @param {string} moduleDecl — `"<module-name>#<exportName>"` (exportName optional).
 * @returns {{ moduleName: string, exportName: string }}
 * @throws {Error} FAIL-LOUD on an empty declaration or a declaration with no module name.
 */
export function parseViewDeclaration(moduleDecl) {
    if (typeof moduleDecl !== 'string' || !moduleDecl.trim()) {
        throw new Error(
            '[view-builder] a `view` cell requires a `module="<module-name>#<exportName>"` ' +
            'attribute (got: ' + JSON.stringify(moduleDecl) + '). (FAIL-LOUD.)'
        );
    }
    var s = moduleDecl.trim();
    var hash = s.indexOf('#');
    var moduleName = (hash === -1) ? s : s.slice(0, hash);
    var exportName = (hash === -1) ? '' : s.slice(hash + 1);
    moduleName = moduleName.trim();
    exportName = exportName.trim();
    if (!moduleName) {
        throw new Error(
            '[view-builder] `module` declaration "' + moduleDecl + '" has no module name ' +
            'before the "#". Expected "<module-name>#<exportName>". (FAIL-LOUD.)'
        );
    }
    return { moduleName: moduleName, exportName: exportName };
}

/* ── resolve the module source from the module set ───────────────────────────── */

// Look the declared module up in the module set, matching by canonical key so
// './views/x.js' and 'views/x.js' resolve the same. FAIL-LOUD on absence.
function _resolveModuleSource(moduleName, modules) {
    var set = modules || {};
    if (Object.prototype.hasOwnProperty.call(set, moduleName)) { return set[moduleName]; }
    var wantKey = canonKey(moduleName);
    var keys = Object.keys(set);
    for (var i = 0; i < keys.length; i++) {
        if (canonKey(keys[i]) === wantKey) { return set[keys[i]]; }
    }
    throw new Error(
        '[view-builder] declared view module "' + moduleName + '" is not a ' +
        '`type="module"` cell in this notebook (known modules: [' + keys.join(', ') +
        ']). (FAIL-LOUD — the `view` cell references an editable in-notebook module ' +
        'cell, never an opaque by-name load.)'
    );
}

/* ── resolve the export name (single-export-else-FAIL-LOUD) ───────────────────── */

// Return the export name to import: the explicit `exportName` when given (verified
// present); otherwise the module's SOLE export. Zero or multiple exports with no
// explicit `#export` → FAIL-LOUD (never guess). Mirrors setup-builder's C5 rule.
function _resolveExportName(moduleName, exportName, source) {
    var exports = moduleExportNames(source);
    if (exportName) {
        if (exports.indexOf(exportName) === -1) {
            throw new Error(
                '[view-builder] declared view export "' + exportName + '" is not exported ' +
                'by module "' + moduleName + '" (its exports: [' + exports.join(', ') +
                ']). (FAIL-LOUD.)'
            );
        }
        return exportName;
    }
    if (exports.length === 1) { return exports[0]; }
    if (exports.length === 0) {
        throw new Error(
            '[view-builder] view module "' + moduleName + '" has NO named export — ' +
            'declare `module="' + moduleName + '#<exportName>"` once the module exports a ' +
            'render function. (FAIL-LOUD — never guess.)'
        );
    }
    throw new Error(
        '[view-builder] view module "' + moduleName + '" has MULTIPLE exports [' +
        exports.join(', ') + '] — the `#export` part of `module` is required to pick one ' +
        '(e.g. module="' + moduleName + '#' + exports[0] + '"). (FAIL-LOUD — never guess.)'
    );
}

/* ── the synthesis (SOLE authority) ──────────────────────────────────────────── */

/**
 * synthesizeViewEntrySource — turn a `view` cell declaration into the canonical
 * VIEW-ENTRY source string + the realm-internal output name.
 *
 * @param {object} decl
 * @param {string} decl.module — `"<module-name>#<exportName>"` (exportName optional).
 * @param {Object<string,string>} decl.modules — the notebook module set `{ name → source }`,
 *   used to resolve a single export + verify the module exists.
 * @param {string} [decl.outName] — realm-internal output name; default `'_view'`.
 * @returns {{ entryCode: string, outName: string, moduleName: string, exportName: string }}
 * @throws {Error} FAIL-LOUD on a missing module / unknown export / zero-or-multiple
 *   exports with no `#export`.
 */
export function synthesizeViewEntrySource(decl) {
    decl = decl || {};
    var parsed = parseViewDeclaration(decl.module);
    var source = _resolveModuleSource(parsed.moduleName, decl.modules);
    var exportName = _resolveExportName(parsed.moduleName, parsed.exportName, source);

    // The realm-internal output name is emitted as an UNQUOTED object key in the
    // synthesized `return { <outName>: <export> }`. Callers pass `cell.id + '_view'`,
    // and notebook cell ids contain hyphens (e.g. `c-d3-view`) — a bare hyphen in a
    // key is a SyntaxError. Sanitize to a valid JS identifier (it is realm-internal,
    // never user-referenced, so the exact spelling does not matter — only that it is a
    // legal key and that the value we RETURN as `outName` matches the key the template
    // emits, so the caller's `result.outputs[outName]` lookup hits). Mirrors
    // setup-builder's outName sanitization (the hyphen bug class).
    var rawOutName = decl.outName || '_view';
    var outName = String(rawOutName).replace(/[^A-Za-z0-9_$]/g, '_');
    if (/^[0-9]/.test(outName)) { outName = '_' + outName; }

    // The canonical VIEW-ENTRY template. The synthesized entry:
    //   - imports the editable in-notebook view module's render export by name,
    //   - returns it as a realm-internal LIVE ref (the host invokes it with the ctx).
    // The USER module's OWN bare-specifier imports (e.g. `import * as d3 from 'd3'`)
    // resolve via the realm's injected 2a import-map — they are not rewritten here.
    var entryCode =
        "import { " + exportName + " } from '" + parsed.moduleName + "';\n" +
        "return { " + outName + ": " + exportName + " };\n";

    return {
        entryCode: entryCode,
        outName: outName,
        moduleName: parsed.moduleName,
        exportName: exportName
    };
}
