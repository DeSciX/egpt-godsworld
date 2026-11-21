/* Copyright 2023-2026 by Essam Abadir */

/**
 * Notebook cell-as-module resolver — the IN-MEMORY blob closure (B2;
 * build-gate C + VETO-CLASS constraint #1).
 *
 * Named ESM export. PURE module — NO Runtime/Bus/DOM/engine imports. It is
 * host-neutral (it must NOT assume CodeEditorPane or any pane exists — model-gate
 * rule 6): the blob-minting + dynamic-import are injected by the caller
 * (Runtime.runCell in the browser; a test stub in node).
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *
 * Given a notebook's user-code module SET (`{ name → source }`, the `type="module"`
 * cells keyed by their relative path) and a builder cell body that `import`s some
 * of them, it builds the dependency closure ENTIRELY IN MEMORY:
 *
 *   - every module member becomes its OWN blob whose relative `./x.js` specifiers
 *     are rewritten to its SIBLINGS' blob URLs (a topological create so a
 *     referenced module's blob URL exists before the referencer is rewritten);
 *   - the entry (builder cell) keeps its top-level imports verbatim (relative
 *     specifiers rewritten to the sibling blob URLs) and wraps the rest in an
 *     exported `default async (caps, inputs) => {…}` so `caps`/`inputs` stay
 *     INJECTED (they are NOT imports) — the caller invokes the default export with
 *     the injected objects.
 *
 * ── THE VETO-CLASS CONSTRAINT (#1) THIS HOLDS ────────────────────────────────
 *
 * A relative specifier NEVER resolves to an HTTP sibling on a scoped mount — that
 * is the Phase-A blob-rewriter 404 trap (a blob module has no hierarchical base,
 * so statically-served siblings hit the native loader and relative sub-imports
 * 404). Here a relative `./x.js` ONLY ever resolves to an in-memory sibling blob
 * URL; an unresolved relative specifier FAILS LOUD. Bare specifiers (no leading
 * `.`) pass through verbatim for the host's native loader (third-party / host
 * resolution). There is NO network round-trip per relative import.
 */

'use strict';

/* ── path math (pure) ─────────────────────────────────────────────────────── */

// Canonicalize a module path into a stable key: drop '.' and '' segments, fold
// '..'. So './setups/x.js', 'setups/x.js' canonicalize identically, and a
// sat.js-relative './setupCircuitBasic.js' folds to the same key the module set
// is keyed by.
export function canonKey(p) {
    var parts = String(p).split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var seg = parts[i];
        if (seg === '' || seg === '.') { continue; }
        if (seg === '..') { out.pop(); continue; }
        out.push(seg);
    }
    return out.join('/');
}

// Resolve a relative `specifier` against the DIRECTORY of `fromName`, returning a
// canonical key. (Both inputs are relative notebook-local paths.)
export function resolveRelativeKey(specifier, fromName) {
    var fromParts = canonKey(fromName).split('/');
    fromParts.pop(); // drop the file segment → directory
    var base = fromParts.join('/');
    var joined = base ? (base + '/' + specifier) : specifier;
    return canonKey(joined);
}

/* ── import-detection + body split (pure) ─────────────────────────────────── */

// Does the source contain a real top-level `import` statement?
export function hasImport(code) {
    return /(^|\n)\s*import\s/.test(String(code));
}

// Split a cell body into ITS TOP-LEVEL IMPORTS and the REST. The cell author
// writes imports at (or near) the top, possibly interleaved with leading comment
// lines and blanks (the notebook convention). ES modules require `import` at the
// top level, so we must HOIST every top-level import above the
// `async (caps, inputs) => {…}` wrapper. We collect:
//   - leading blank lines + full-line comments (// … or /* … */ on one line) AND
//     every top-level `import …` (single- or multi-line) into the PREAMBLE,
//   - everything from the first line of real (non-import) code onward into BODY.
// A `// import x` comment is NOT an import (it is stripped of leading whitespace,
// so the `^import` test fails on the `//`). Returns { imports, body }.
export function splitImportsAndBody(code) {
    var lines = String(code).split('\n');
    var preamble = [];   // blanks + leading comments + import statements
    var bodyStart = 0;
    var inImport = false;
    for (var i = 0; i < lines.length; i++) {
        var trimmed = lines[i].replace(/^\s+/, '');
        if (inImport) {
            preamble.push(lines[i]);
            bodyStart = i + 1;
            if (/from\s+['"][^'"]+['"]/.test(lines[i]) || /;\s*$/.test(lines[i])) { inImport = false; }
            continue;
        }
        if (trimmed === '') { preamble.push(lines[i]); bodyStart = i + 1; continue; }
        // A single-line comment or a single-line block comment — part of the
        // leading preamble (so a comment ABOVE the import does not strand the
        // import inside the body). A multi-line /* … */ that does not close on
        // this line ends the preamble (rare in a cell header; treat as body).
        if (/^\/\//.test(trimmed) || /^\/\*.*\*\/\s*$/.test(trimmed)) {
            preamble.push(lines[i]); bodyStart = i + 1; continue;
        }
        if (/^import\s/.test(trimmed)) {
            preamble.push(lines[i]);
            bodyStart = i + 1;
            if (!/from\s+['"][^'"]+['"]/.test(lines[i]) && !/;\s*$/.test(lines[i])) { inImport = true; }
            continue;
        }
        break; // first line of real (non-import) code → body begins here
    }
    return { imports: preamble.join('\n'), body: lines.slice(bodyStart).join('\n') };
}

/* ── specifier rewrite (pure) ─────────────────────────────────────────────── */

// Rewrite every relative specifier in `source` to the blob URL of the resolved
// sibling (looked up in blobUrlByKey) — BOTH static `from '…'` clauses (import/
// export) AND dynamic `import('…')` call expressions (gym-controls-as-sugar
// REMEDIATION, Finding 2: the synthesized builder now DEFERS its
// module-cell import to a dynamic `await import(...)` placed AFTER
// `frqtl.ensureEngine()` — see setup-builder.js — so the relative specifier
// this rewrite must resolve can appear inside the function BODY, not only the
// header). Bare specifiers pass through verbatim (host loader). An unresolved
// relative specifier FAILS LOUD in either form.
export function rewriteRelativeToSiblingBlobs(source, ownName, blobUrlByKey) {
    function resolveOrThrow(specifier) {
        var key = resolveRelativeKey(specifier, ownName);
        var blobUrl = blobUrlByKey[key];
        if (!blobUrl) {
            throw new Error(
                '[module-resolver] relative import "' + specifier + '" (from "' + ownName +
                '") resolves to "' + key + '", which is NOT a notebook-local module cell. ' +
                'Add a <cell type="module" name="' + specifier + '">, or fix the path. ' +
                '(FAIL-LOUD — never an HTTP sibling fetch.)'
            );
        }
        return blobUrl;
    }
    var out = String(source).replace(/from\s+(['"])([^'"]+)\1/g, function (match, quote, specifier) {
        if (specifier.charAt(0) !== '.') { return match; } // bare → host loader
        return 'from ' + quote + resolveOrThrow(specifier) + quote;
    });
    out = out.replace(/import\(\s*(['"])([^'"]+)\1\s*\)/g, function (match, quote, specifier) {
        if (specifier.charAt(0) !== '.') { return match; } // bare → host loader
        return 'import(' + quote + resolveOrThrow(specifier) + quote + ')';
    });
    return out;
}

// The relative dependency keys a module source imports.
function _relativeDepKeys(name, source) {
    var deps = [];
    String(source).replace(/from\s+(['"])([^'"]+)\1/g, function (m, q, spec) {
        if (spec.charAt(0) === '.') { deps.push(resolveRelativeKey(spec, name)); }
        return m;
    });
    return deps;
}

/* ── the in-memory closure ────────────────────────────────────────────────── */

/**
 * buildModuleClosure(modules, mintBlobUrl) → { blobUrlByKey, revoke }
 *
 * Mints one blob per module member (via the injected `mintBlobUrl(source)` →
 * url), each rewritten so its relative specifiers point at sibling blob URLs.
 * Topological create (a referenced module's blob URL exists before the referencer
 * is rewritten); FAIL-LOUD on a missing member or a dependency cycle.
 *
 * @param {Object<string,string>} modules — { name → source }
 * @param {(source:string)=>string} mintBlobUrl — host-injected blob URL minter.
 * @returns {{ blobUrlByKey: Object<string,string>, revoke: () => void }}
 *          revoke is a no-op here (the caller owns URL lifetime via a revokeAll it
 *          accumulates); we return the created URL list through revoke for symmetry.
 */
export function buildModuleClosure(modules, mintBlobUrl) {
    if (typeof mintBlobUrl !== 'function') {
        throw new Error('[module-resolver] buildModuleClosure requires a mintBlobUrl(source) function.');
    }
    var byKey = Object.create(null);
    var keys = Object.keys(modules || {});
    for (var i = 0; i < keys.length; i++) {
        byKey[canonKey(keys[i])] = { name: keys[i], source: modules[keys[i]] };
    }

    var blobUrlByKey = Object.create(null);
    var created = [];

    var remaining = Object.keys(byKey);
    var guard = 0;
    while (remaining.length > 0) {
        if (guard++ > 100000) {
            throw new Error('[module-resolver] module closure did not converge (cycle?). (FAIL-LOUD.)');
        }
        var madeProgress = false;
        var still = [];
        for (var r = 0; r < remaining.length; r++) {
            var key = remaining[r];
            var entry = byKey[key];
            var deps = _relativeDepKeys(entry.name, entry.source);
            var ready = true;
            for (var d = 0; d < deps.length; d++) {
                if (!blobUrlByKey[deps[d]]) {
                    if (!byKey[deps[d]]) {
                        throw new Error(
                            '[module-resolver] module "' + entry.name + '" imports "' + deps[d] +
                            '" which is not in the notebook module set. (FAIL-LOUD.)'
                        );
                    }
                    ready = false; break;
                }
            }
            if (!ready) { still.push(key); continue; }
            var rewritten = rewriteRelativeToSiblingBlobs(entry.source, entry.name, blobUrlByKey);
            var url = mintBlobUrl(rewritten);
            blobUrlByKey[key] = url;
            created.push(url);
            madeProgress = true;
        }
        remaining = still;
        if (!madeProgress && remaining.length > 0) {
            throw new Error(
                '[module-resolver] unresolvable module closure (dependency cycle among ' +
                remaining.join(', ') + '). (FAIL-LOUD.)'
            );
        }
    }

    return { blobUrlByKey: blobUrlByKey, created: created };
}

/**
 * compileEntryModuleSource(code, entryName, blobUrlByKey) → string
 *
 * Build the entry (builder cell) module SOURCE: its top-level imports kept
 * verbatim (relative specifiers rewritten to sibling blob URLs), the remaining
 * statements wrapped in an exported `default async (caps, inputs) => {…}` so
 * caps/inputs stay INJECTED. The caller mints the blob + dynamic-imports it +
 * invokes `mod.default(caps, inputs)`.
 *
 * The rewrite runs on the FULL `code` (imports AND body) BEFORE splitting —
 * REMEDIATION, Finding 2: the synthesized
 * builder's module-cell reference is now a DYNAMIC `await import('<module>')`
 * placed inside the body (after `frqtl.ensureEngine()`, deliberately deferring
 * evaluation — see setup-builder.js), so a relative specifier needing
 * blob-URL rewrite can live in the body, not only the header. Rewriting first
 * then splitting is behavior-preserving for the header-only case (the
 * structural blank/comment/import scan in splitImportsAndBody does not
 * inspect specifier CONTENT) and additionally catches body-level dynamic
 * imports.
 */
export function compileEntryModuleSource(code, entryName, blobUrlByKey) {
    var rewritten = rewriteRelativeToSiblingBlobs(code, entryName, blobUrlByKey);
    var split = splitImportsAndBody(rewritten);
    return split.imports + '\n' +
        'export default async (caps, inputs) => {\n' + split.body + '\n};\n';
}
