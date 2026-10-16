/* Copyright 2023-2026 by Essam Abadir */

/**
 * setup-builder — the SOLE authority that synthesizes the canonical experiment
 * BUILDER source from a `canvas` cell's declarative configuration
 * (WS-NOTEBOOK-SHIM-MANAGED-BUILDER).
 *
 * Named ESM export. PURE module — NO DOM / engine / Runtime / Bus import (C8). It
 * is host-neutral and node-testable: hosts (the notebook-pane in-app) import this
 * one helper and NONE inlines the template (the §router single-path-authority rule applied to the
 * setup-builder template).
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *
 * Given a canvas declaration — `setup="<module-name>#<exportName>"` (+ `opts`,
 * `stage`, `seed`, `renderOptions`, `cameraPreset`) — and the notebook's user-code
 * module SET (`{ name → source }`), it returns the canonical builder SOURCE STRING
 * + the realm-internal output name:
 *
 *   const { frqtl } = caps;
 *   await frqtl.ensureEngine();
 *   const { <export> } = await import('<module>');
 *   const opts = frqtl.knob('<export>', <opts>);
 *   const runner = frqtl.FrqtlApp({ canvasW:<W>, canvasH:<H>, seed:<seed> });
 *   runner.setup(frqtl.carryFactoryStatics((u, o) => <export>(frqtl, u, o), <export>), opts);
 *   runner.setRenderOption('<k>', <v>);            // one line per renderOptions key (fix-loop #6)
 *   if (runner.cameraControl && …setPreset) { … }  // ONLY when cameraPreset is declared (fix-loop #6)
 *   return { <outName>: runner };
 *
 * The synthesized source is fed VERBATIM to the EXISTING `runBuilderThenMount` →
 * `Runtime.runCell` → `_mountRunnerInProcess` seam — ONE executor, ONE
 * source-origin. The retired authored builder body was the previous source-origin;
 * `mode:'declared'` synthesis is now the SOLE one. The runner is realm-internal —
 * `<outName>` is an internal binding the synthesized cell returns, NOT a kernel
 * binding the user references.
 *
 * ── C5: single-export resolution (FAIL-LOUD, never guess) ─────────────────────
 *
 * `#export` may be omitted ONLY when the named module has EXACTLY ONE setup export.
 * Zero or multiple exports → FAIL-LOUD with a precise message (never a guess). A
 * "setup export" is any top-level `export` binding (function/const/let/var or a
 * re-export name); we count them from the module source.
 *
 * ── C1: the import resolves against the in-memory module closure ──────────────
 *
 * The emitted `import()` uses the DECLARED module name (e.g. `'./setups/wave.js'`),
 * which `runBuilderThenMount` resolves against the notebook's `moduleSet()` via the
 * existing in-memory blob closure (`module-resolver.js`). An unknown/missing module
 * → FAIL-LOUD HERE (we require the module to be present in the module set) so the
 * caller never ships a builder that 404s the relative import downstream.
 *
 * ── C14: the module import is DYNAMIC and runs AFTER ensureEngine (ordering
 * guarantee, WS gym-controls-as-sugar Bite 0a REMEDIATION, Finding 2) ─────────
 *
 * A canonical setup factory's browser-classic export branch captures window.*
 * game-layer globals (LargeObject, SlitScreen, PointSource, …) into closure vars
 * AT MODULE-EVALUATION TIME — not at call time. Under a STATIC top-level
 * `import`, the ENTIRE reachable module graph (this builder → the notebook
 * module cell → any bare-specifier canonical factory it imports) is resolved
 * and evaluated as part of instantiating the builder's OWN module, which
 * happens BEFORE this function body runs — i.e. BEFORE `ensureEngine()`, which
 * is what actually boots the game layer. That raced the game-layer boot
 * (observed: an intermittent ~15% failure that passed only when a PRIOR
 * cell/page action had already booted the engine). A DYNAMIC `await
 * import(...)` defers resolution+evaluation of that ENTIRE graph to the exact
 * point of the call; placing it after the awaited `ensureEngine()` turns the
 * ordering into a deterministic GUARANTEE. `compileEntryModuleSource` +
 * `rewriteRelativeToSiblingBlobs` rewrite a relative specifier inside a
 * dynamic `import(...)` call identically to a static header import (see
 * module-resolver.js) — the blob-closure rewrite mechanism itself did not need
 * to change, only WHERE the import textually lives.
 */

'use strict';

import { canonKey } from './module-resolver.js';

/* ── parse "<module-name>#<exportName>" ──────────────────────────────────────── */

// Split the setup declaration into { moduleName, exportName }. The exportName is
// the substring after the FIRST '#'; absent → ''. The moduleName is verbatim
// (kept with its relative './…' prefix so the emitted import matches the module
// cell name the closure is keyed by).
export function parseSetupDeclaration(setup) {
    if (typeof setup !== 'string' || !setup.trim()) {
        throw new Error(
            '[setup-builder] a declared canvas requires a `setup="<module-name>#<exportName>"` ' +
            'attribute (got: ' + JSON.stringify(setup) + '). (FAIL-LOUD.)'
        );
    }
    var s = setup.trim();
    var hash = s.indexOf('#');
    var moduleName = (hash === -1) ? s : s.slice(0, hash);
    var exportName = (hash === -1) ? '' : s.slice(hash + 1);
    moduleName = moduleName.trim();
    exportName = exportName.trim();
    if (!moduleName) {
        throw new Error(
            '[setup-builder] `setup` declaration "' + setup + '" has no module name ' +
            'before the "#". Expected "<module-name>#<exportName>". (FAIL-LOUD.)'
        );
    }
    return { moduleName: moduleName, exportName: exportName };
}

/* ── enumerate a module's top-level exports (C5) ─────────────────────────────── */

// Return the array of top-level export NAMES declared in an ES-module source. Used
// ONLY to resolve a single-export module when `#export` is omitted (C5). Strips
// block + line comments so prose like "// export function" is not counted. This is
// a deliberately small, conservative scan: it recognizes the export forms the
// notebook setups use — `export function f`, `export const/let/var f`, and
// `export { a, b as c }`. `export default` is NOT a named setup export (it has no
// name to import by) and is excluded.
export function moduleExportNames(source) {
    var src = String(source == null ? '' : source)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    var names = [];
    var re = /\bexport\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
    var m;
    while ((m = re.exec(src)) !== null) { names.push(m[1]); }
    // `export { a, b as c }` — the EXTERNALLY-visible name is the post-`as` name.
    var braceRe = /\bexport\s*\{([^}]*)\}/g;
    var bm;
    while ((bm = braceRe.exec(src)) !== null) {
        var inner = bm[1];
        inner.split(',').forEach(function (part) {
            var t = part.trim();
            if (!t) { return; }
            var asM = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(t);
            if (asM) { names.push(asM[1]); return; }
            var id = /^([A-Za-z_$][\w$]*)$/.exec(t);
            if (id) { names.push(id[1]); }
        });
    }
    // De-dup, preserve first-seen order.
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < names.length; i++) {
        if (names[i] === 'default') { continue; }
        if (!seen[names[i]]) { seen[names[i]] = true; out.push(names[i]); }
    }
    return out;
}

/* ── resolve the module source from the module set (C1) ──────────────────────── */

// Look the declared module up in the module set, matching by canonical key so
// './setups/x.js' and 'setups/x.js' resolve the same. FAIL-LOUD on absence.
function _resolveModuleSource(moduleName, modules) {
    var set = modules || {};
    if (Object.prototype.hasOwnProperty.call(set, moduleName)) { return set[moduleName]; }
    var wantKey = canonKey(moduleName);
    var keys = Object.keys(set);
    for (var i = 0; i < keys.length; i++) {
        if (canonKey(keys[i]) === wantKey) { return set[keys[i]]; }
    }
    throw new Error(
        '[setup-builder] declared setup module "' + moduleName + '" is not a ' +
        '`type="module"` cell in this notebook (known modules: [' + keys.join(', ') +
        ']). (FAIL-LOUD — the declared canvas references an editable in-notebook module ' +
        'cell, never an opaque by-name load.)'
    );
}

/* ── resolve the export name (C5) ────────────────────────────────────────────── */

// Return the export name to import: the explicit `exportName` when given (verified
// present); otherwise the module's SOLE export. Zero or multiple exports with no
// explicit `#export` → FAIL-LOUD (never guess).
function _resolveExportName(moduleName, exportName, source) {
    var exports = moduleExportNames(source);
    if (exportName) {
        if (exports.indexOf(exportName) === -1) {
            throw new Error(
                '[setup-builder] declared setup export "' + exportName + '" is not exported ' +
                'by module "' + moduleName + '" (its exports: [' + exports.join(', ') +
                ']). (FAIL-LOUD.)'
            );
        }
        return exportName;
    }
    if (exports.length === 1) { return exports[0]; }
    if (exports.length === 0) {
        throw new Error(
            '[setup-builder] setup module "' + moduleName + '" has NO named export — ' +
            'declare `setup="' + moduleName + '#<exportName>"` once the module exports a ' +
            'setup function. (FAIL-LOUD — never guess.)'
        );
    }
    throw new Error(
        '[setup-builder] setup module "' + moduleName + '" has MULTIPLE exports [' +
        exports.join(', ') + '] — the `#export` part of `setup` is required to pick one ' +
        '(e.g. setup="' + moduleName + '#' + exports[0] + '"). (FAIL-LOUD — never guess.)'
    );
}

/* ── stage parsing (C4) ──────────────────────────────────────────────────────── */

// Parse the `stage="<W>x<H>"` attr → { canvasW, canvasH } or null when absent. A
// malformed stage (not <int>x<int>) → FAIL-LOUD (no silent default that hides a typo).
export function parseStage(stage) {
    if (stage == null || stage === '') { return null; }
    var m = /^(\d+)\s*[x×]\s*(\d+)$/.exec(String(stage).trim());
    if (!m) {
        throw new Error(
            '[setup-builder] `stage` must be "<W>x<H>" (e.g. "480x480"); got ' +
            JSON.stringify(stage) + '. (FAIL-LOUD.)'
        );
    }
    return { canvasW: parseInt(m[1], 10), canvasH: parseInt(m[2], 10) };
}

// Parse the `seed="<N>"` attr → an integer or null when absent. A non-integer seed
// → FAIL-LOUD.
export function parseSeed(seed) {
    if (seed == null || seed === '') { return null; }
    var n = Number(String(seed).trim());
    if (!Number.isInteger(n)) {
        throw new Error(
            '[setup-builder] `seed` must be an integer; got ' + JSON.stringify(seed) +
            '. (FAIL-LOUD.)'
        );
    }
    return n;
}

/* ── the synthesis (SOLE authority) ──────────────────────────────────────────── */

/**
 * synthesizeBuilderSource — turn a declared canvas configuration into the canonical
 * BUILDER source string + the realm-internal output name.
 *
 * @param {object} decl
 * @param {string} decl.setup         — `"<module-name>#<exportName>"` (exportName optional, C5).
 * @param {Object<string,string>} decl.modules — the notebook module set `{ name → source }`,
 *                                     used to resolve a single export + verify the module exists.
 * @param {Object<string,number|string>} [decl.opts] — the driving-knob map (validated by
 *                                     `frqtl.knob` at run time; `{}` → `frqtl.knob` returns `{}`).
 * @param {string} [decl.stage]       — `"<W>x<H>"` runner stage (C4): REQUIRED for a factory canvas
 *   (the runner has no default size), REFUSED for a recipe canvas (the recipe states its world).
 * @param {boolean} [decl.render3d]   — the cell's display declaration: a factory canvas's runner is
 *   built 3D (`is3D: true`); a recipe canvas states 3D itself (`exp.createScene`).
 * @param {string|number} [decl.seed] — runner RNG seed (C4); empty → FrqtlApp default.
 * @param {Object<string,number|string>} [decl.renderOptions] — WS gym-controls-as-sugar
 *   fix-loop #6 Finding B: render-INTENT key/value pairs applied via
 *   `runner.setRenderOption(key, value)` calls, ONE per key, emitted AFTER
 *   `runner.setup(...)` — mirroring the proven page-side order
 *   (`fx-experiment.js`: setup → setRenderOption(renderDefaults) → cameraControl).
 *   A SEPARATE channel from `decl.opts` (never merged — `opts` are physics-factory
 *   arguments; `renderOptions` are renderer-property-bag writes). `{}` → no calls
 *   emitted (byte-identical to a canvas with no `renderOptions` attr).
 * @param {string} [decl.cameraPreset] — WS gym-controls-as-sugar fix-loop #6 Finding B:
 *   a named camera-orbit preset applied via the CAPABILITY-CHECKED
 *   `runner.cameraControl && runner.cameraControl.setPreset(name)` (skipped when the active
 *   renderer has no camera control — the page-side `if (cam) { cam.setPreset(...) }` idiom;
 *   a camera that does not offer the preset THROWS). Empty/absent → no call emitted.
 * @param {string} [decl.shape]       — the setup-form discriminator (Bite 5c): `'factory'`
 *   (DEFAULT when empty/absent) or `'recipe'`. Any OTHER value → FAIL-LOUD (never a
 *   silent fallback). See the two-form note below.
 * @param {string} [decl.outName]     — realm-internal output name; default `'_run'`.
 * @returns {{ builderCode: string, outName: string, moduleName: string, exportName: string, usesModulePath: true, shape: string }}
 *   `usesModulePath` is ALWAYS `true` — see C15 below; the caller MUST forward it to
 *   `Runtime.runCell({ forceModulePath: synth.usesModulePath, … })`.
 * @throws {Error} FAIL-LOUD on a missing module / unknown export / zero-or-multiple
 *   exports with no `#export` / malformed stage|seed / an unknown `shape`.
 *
 * ── Two setup forms — the `shape` discriminator (Bite 5c) ─────────────────────
 *
 * A declared canvas's `setup` module takes ONE of two shapes; the CELL_ATTR `shape`
 * (owner: lib/shim/notebook/format.js) declares which, and this authority synthesizes
 * the matching builder. FAIL-LOUD on an unknown shape — never a silent guess.
 *
 *   shape='factory' (DEFAULT when empty): the export is a setup FACTORY
 *     `fn(frqtl, universe, options)`. Template:
 *       const { <export> } = await import('<module>');
 *       const opts = frqtl.knob('<export>', <opts>);
 *       const runner = frqtl.FrqtlApp(<cfg>);
 *       runner.setup(frqtl.carryFactoryStatics((universe, o) => <export>(frqtl, universe, o), <export>), opts);
 *     The arrow carries the export's factory statics (FrqtlApp.FACTORY_STATICS), so the
 *     canvas boots the same scene as every other surface.
 *
 *   shape='recipe': the module installs a `buildExperiment(exp)` RECIPE — a SINGLE
 *     RecipeContext arg (the dual-mode `window.buildExperiment` tail codegen /
 *     buildFrqnb / the walkthrough rungs emit, NOT an ESM export). Template:
 *       await import('<module>');            // side-effect installs window.<export>
 *       const buildExperiment = window['<export>'];   // FAIL-LOUD if not a function
 *       const exp = frqtl.RecipeContext({ seed, deferCanvas: true });   // SIZELESS
 *       exp.build(buildExperiment);          // runs its co-init call + addObject() — NO start
 *       const runner = exp.runner;           // the mount seam owns createCanvas()+start()
 *     `deferCanvas:true` lets the notebook realm's `_mountRunnerInProcess` seam own
 *     the single createCanvas() (it re-parents to the pane's canvas-wrapper). The
 *     recipe takes NO knob bag — a non-empty `opts` on a recipe canvas FAILS LOUD
 *     (rather than silently dropping it). The `<export>` defaults to
 *     `'buildExperiment'` when the `#export` part is omitted.
 *
 * WHY the template checks `buildExperiment` but not `exp` (FRAQTL #73): the two values
 * have different OWNERS. `buildExperiment` is read off `window` by this template itself,
 * so nothing but this template can vouch for it — hence the emitted FAIL-LOUD check.
 * `exp` comes from `frqtl.RecipeContext(...)`, a caps.frqtl member: its owner
 * (lib/shim/runtime/index.js `_sugar`) FAILS LOUD naming the missing game-layer global,
 * so `exp` is never null here and a second check would re-derive the owner's guarantee
 * for one call site while leaving every other member (runner, Universe, the sugar) to
 * the owner anyway. `RecipeContext` used to return null instead — that null reached
 * `exp.build` as an opaque property-access TypeError, which is what #73 reported.
 *
 * WHY the recipe path reads `window.<export>` rather than destructuring the import
 * namespace: a `buildExperiment(exp)` recipe is authored with the dual-mode tail
 * (`window.buildExperiment = buildExperiment`), NOT `export function buildExperiment`
 * — the SAME contract the STUDIO blank page (`FrqtlPage.applyModuleSource` eval) and the
 * walkthrough loader read. Importing the module runs its top-level code (installing
 * the window global); we read it immediately after, in the same builder body.
 *
 * ── C15: the caller MUST force the runtime's cell-as-module path (WS
 * gym-controls-as-sugar Bite 0a fix-loop #3 — tester regression finding
 * 2026-07-03) ──────────────────────────────────────────────────────────────
 *
 * `Runtime.runCell` decides JS-vs-module-blob routing by SNIFFING the cell body
 * for a STATIC top-level `import` (`lib/shim/notebook/module-resolver.js`
 * `hasImport`, `/(^|\n)\s*import\s/`). Since C14 moved this template's module
 * reference to a DYNAMIC `await import(...)` INSIDE the function body (never at
 * line-start), that sniff returns `false` — the runtime took the `new Function`
 * fast path, which never runs `rewriteRelativeToSiblingBlobs`, so the relative
 * specifier survived unrewritten into a dynamic import evaluated from the
 * RUNTIME's own module URL → 404 on every notebook (regression, tester-caught).
 *
 * Widening the sniff regex to detect `import(` ANYWHERE was REJECTED: `import(`
 * can appear inside an ordinary string/comment in an UNRELATED cell (e.g. a
 * math-lane cell's docstring demonstrating dynamic-import syntax) — a broadened
 * sniff would route that cell through `_runCellAsModule`, whose
 * `rewriteRelativeToSiblingBlobs` would then try to treat the coincidental
 * substring as a REAL relative specifier: either a spurious FAIL-LOUD throw (not
 * found in the module set) or, worse, a silent rewrite THAT MANGLES THE STRING
 * LITERAL'S TEXT (if a same-named sibling module happens to exist). That is a
 * genuine correctness hazard, not a benign inefficiency — verified, not assumed.
 *
 * THE FIX: this authority — which KNOWS with certainty its own template always
 * needs the module-blob path, because it just synthesized the dynamic import in
 * question — DECLARES that fact explicitly (`usesModulePath: true`) rather than
 * having the runtime re-derive it via regex on text it did not author with full
 * context. The runtime's `hasImport` sniff is UNCHANGED (still correct for
 * hand-authored module cells with real static imports, and for the sibling
 * `view-builder.js` template, which still uses a static import); ONLY the
 * synthesized-builder call site is exempted from the sniff, by explicit
 * authority signal — never a widened heuristic. See
 * `lib/shim/runtime/index.js` `RunCellSpec.forceModulePath`.
 */
export function synthesizeBuilderSource(decl) {
    decl = decl || {};
    var parsed = parseSetupDeclaration(decl.setup);
    var source = _resolveModuleSource(parsed.moduleName, decl.modules);

    // Bite 5c: the setup-form discriminator. Empty/absent → 'factory' (the pre-existing
    // gallery form, byte-identical). 'recipe' → RecipeContext/buildExperiment. Any other
    // value FAILS LOUD — never a silent guess.
    var shape = (decl.shape == null || decl.shape === '') ? 'factory' : String(decl.shape).trim();
    if (shape !== 'factory' && shape !== 'recipe') {
        throw new Error(
            '[setup-builder] unknown canvas `shape` "' + decl.shape + '" — expected ' +
            '"factory" (a `fn(frqtl, universe, options)` setup export) or "recipe" (a ' +
            '`buildExperiment(exp)` RecipeContext recipe). (FAIL-LOUD — never guess.)'
        );
    }

    var stage = parseStage(decl.stage);
    var seed = parseSeed(decl.seed);
    // The realm-internal output name is emitted as an UNQUOTED object key in the
    // synthesized `return { <outName>: runner }`. Callers pass `cell.id + '_run'`,
    // and notebook cell ids contain hyphens (e.g. `c-ds-canvas`) — a bare hyphen in
    // a key is a SyntaxError ("Unexpected token '-'"). Sanitize to a valid JS
    // identifier (it is realm-internal, never user-referenced, so the exact spelling
    // does not matter — only that it is a legal key and that the value we RETURN as
    // `outName` matches the key the template emits, so the caller's
    // `result.outputs[outName]` lookup hits).
    var rawOutName = decl.outName || '_run';
    var outName = String(rawOutName).replace(/[^A-Za-z0-9_$]/g, '_');
    if (/^[0-9]/.test(outName)) { outName = '_' + outName; }
    var optsLiteral = JSON.stringify(decl.opts || {});

    // Build the FrqtlApp config object literal from the DECLARED config only
    // (C4: stage/seed are the runner config authority, never folded into opts). An
    // undeclared seed takes the FrqtlApp default; a size is never defaulted (above).
    var cfgParts = [];
    if (stage) {
        cfgParts.push('canvasW: ' + stage.canvasW);
        cfgParts.push('canvasH: ' + stage.canvasH);
    }
    if (seed !== null) { cfgParts.push('seed: ' + seed); }
    // A `render3d` canvas boots the three display, which IS the 3D display: the factory's runner
    // is told so at construction (the provider's perspective camera), from the SAME cell attr
    // that chose the display — never a global.
    var factoryCfgParts = decl.render3d ? cfgParts.concat(['is3D: true']) : cfgParts;
    var cfgLiteral = '{ ' + factoryCfgParts.join(', ') + ' }';

    // WS gym-controls-as-sugar fix-loop #6 Finding B: render-INTENT lines, emitted
    // AFTER runner.setup() (mirrors the proven page-side order in fx-experiment.js:
    // setup() → setRenderOption(renderDefaults) → cameraControl.setPreset()). Each
    // `renderOptions` key becomes its OWN `runner.setRenderOption('<k>', <v>);` call
    // — a SEPARATE channel from the `opts` physics-knob bag above (never merged;
    // see the JSDoc). `{}` / absent → zero lines (byte-identical to before this
    // fix-loop for every existing canvas that doesn't declare `renderOptions`).
    var renderOptionLines = '';
    var renderOptions = decl.renderOptions || {};
    Object.keys(renderOptions).forEach(function (k) {
        renderOptionLines += 'runner.setRenderOption(' + JSON.stringify(k) + ', ' +
            JSON.stringify(renderOptions[k]) + ');\n';
    });

    // cameraPreset: a CAPABILITY-OBJECT method call (runner.cameraControl), not a
    // property-bag write — a THIRD channel from both opts and renderOptions (see
    // JSDoc). Capability-checked exactly like the page-side `if (cam) {...}` idiom
    // — skipped only with no camera control at all; a camera that does not offer the
    // preset THROWS (its own setPreset), never a silent no-op.
    var cameraPresetLine = '';
    if (decl.cameraPreset) {
        cameraPresetLine =
            "if (runner.cameraControl && typeof runner.cameraControl.setPreset === 'function') {\n" +
            "    runner.cameraControl.setPreset(" + JSON.stringify(decl.cameraPreset) + ");\n" +
            "}\n";
    }

    // The canonical template (the §0 builder shape). Both shapes:
    //   - boot the engine FIRST (ensureEngine),
    //   - THEN dynamically import the editable in-notebook module by name (C1) — WS
    //     gym-controls-as-sugar Bite 0a REMEDIATION, Finding 2: a canonical setup
    //     factory's browser-classic branch captures window.* game-layer globals
    //     (LargeObject, SlitScreen, …) into closure vars AT MODULE-EVALUATION TIME. A
    //     STATIC top-level `import` of the module cell is resolved+evaluated as part
    //     of instantiating THIS builder's own module graph — BEFORE this function body
    //     (and therefore BEFORE `ensureEngine()`) ever runs, racing the game-layer
    //     boot. A DYNAMIC `import()` defers that to the exact point of the call —
    //     placing it AFTER the awaited `ensureEngine()` makes the ordering a GUARANTEE.
    //     (compileEntryModuleSource + rewriteRelativeToSiblingBlobs rewrite a relative
    //     specifier inside a dynamic `import()` call identically to a static header
    //     import — see module-resolver.js.)
    //   - populate the runner (factory: runner.setup(...) / recipe: exp.build(...)),
    //   - apply the render-intent lines, and return the runner under the outName.
    var exportName;
    var builderCode;
    if (shape === 'recipe') {
        // RECIPE form: the module installs a `buildExperiment(exp)` recipe via the
        // dual-mode `window.<export>` tail (NOT an ESM export). Default export name.
        exportName = parsed.exportName || 'buildExperiment';
        // A recipe takes ONE RecipeContext arg — no knob bag. A non-empty `opts` here
        // would be silently ignored; FAIL LOUD instead (no silent drop).
        if (decl.opts && Object.keys(decl.opts).length > 0) {
            throw new Error(
                '[setup-builder] a recipe-shape canvas ("' + parsed.moduleName +
                '#' + exportName + '") takes NO `opts` — `buildExperiment(exp)` receives a ' +
                'single RecipeContext, not a knob bag (got opts ' + JSON.stringify(decl.opts) +
                '). Remove the `opts` attr or use shape="factory". (FAIL-LOUD.)'
            );
        }
        // ONE size statement per world: the recipe states its own in its co-init call.
        if (stage) {
            throw new Error('[setup-builder] a recipe-shape canvas ("' + parsed.moduleName + '") takes NO `stage` — ' +
                'the recipe states its world, size included, in its exp.createCanvas(w, h, cfg) / ' +
                'exp.createScene(w, h, d, cfg) call; a stage here would be a second size. (FAIL-LOUD.)');
        }
        // deferCanvas: true — the notebook realm's `_mountRunnerInProcess` seam owns the
        // single createCanvas()+start() (re-parenting to the pane's canvas-wrapper); an
        // eager RecipeContext-ctor createCanvas would orphan a second canvas.
        var recipeCfgParts = cfgParts.slice();
        recipeCfgParts.push('deferCanvas: true');
        var recipeCfgLiteral = '{ ' + recipeCfgParts.join(', ') + ' }';
        builderCode =
            "const { frqtl } = caps;\n" +
            "await frqtl.ensureEngine();\n" +
            "await import('" + parsed.moduleName + "');\n" +
            "const buildExperiment = (typeof window !== 'undefined') ? window[" + JSON.stringify(exportName) + "] : undefined;\n" +
            "if (typeof buildExperiment !== 'function') {\n" +
            "    throw new Error('[setup-builder] recipe module \"" + parsed.moduleName + "\" did not install a `" + exportName + "(exp)` recipe (window." + exportName + "). A recipe-shape canvas requires the module to define `function " + exportName + "(exp)` with the dual-mode tail. (FAIL-LOUD.)');\n" +
            "}\n" +
            "const exp = frqtl.RecipeContext(" + recipeCfgLiteral + ");\n" +
            "exp.build(buildExperiment);\n" +
            "const runner = exp.runner;\n" +
            renderOptionLines +
            cameraPresetLine +
            "return { " + outName + ": runner };\n";
    } else {
        // FACTORY form (default): the export is `fn(frqtl, universe, options)`. Resolve
        // the ESM export (C5) and validate the knob bag.
        exportName = _resolveExportName(parsed.moduleName, parsed.exportName, source);
        // A factory takes the runner's world, which only `stage` states — there is no default size.
        if (!stage) {
            throw new Error('[setup-builder] a factory-shape canvas ("' + parsed.moduleName + '") needs ' +
                '`stage="<W>x<H>"` — the runner has no default world size. (FAIL-LOUD.)');
        }
        builderCode =
            "const { frqtl } = caps;\n" +
            "await frqtl.ensureEngine();\n" +
            "const { " + exportName + " } = await import('" + parsed.moduleName + "');\n" +
            "const opts = frqtl.knob('" + exportName + "', " + optsLiteral + ");\n" +
            "const runner = frqtl.FrqtlApp(" + cfgLiteral + ");\n" +
            "runner.setup(frqtl.carryFactoryStatics((universe, o) => " + exportName + "(frqtl, universe, o), " +
                exportName + "), opts);\n" +
            renderOptionLines +
            cameraPresetLine +
            "return { " + outName + ": runner };\n";
    }

    return {
        builderCode: builderCode,
        outName: outName,
        moduleName: parsed.moduleName,
        exportName: exportName,
        shape: shape,
        // C15 — ALWAYS true (the template ALWAYS carries a body-level dynamic
        // import by construction). The caller MUST forward this to
        // Runtime.runCell({ forceModulePath: true, … }) — the runtime's own
        // hasImport() text-sniff returns false for this template (the import is
        // not at line-start) and must NOT be relied on for synthesized builders.
        usesModulePath: true
    };
}
