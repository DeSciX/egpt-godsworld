// Copyright 2023-2026 by Essam Abadir
// lib/shim/notebook/frqtl-setups-importmap.js — the ONE owner of the `@frqtl/setups/<id>`
// bare-specifier surface: the manifest, the ESM transform, the emitted-module list, and
// the import-map fragment.
//
// WHY BARE SPECIFIERS: a notebook `module` cell's declared name (`name="./setups/x.js"`)
// is a SIBLING-MODULE KEY inside the notebook's own moduleSet() closure, not a real
// filesystem/HTTP path; a relative specifier that is NOT itself a module cell in the same
// notebook 404s (VETO-CLASS #1, lib/shim/notebook/module-resolver.js). A notebook imports a
// canonical setup factory by bare specifier, resolved through the document import map.
//
// WHY AN ESM TRANSFORM: the canonical factories (lib/frqtl/objects/setup/*.js) are
// UMD/CJS-interop IIFEs with NO top-level `export` — the same file loads as a CLASSIC
// <script> on experiment pages, where an `export` keyword is a syntax error. The bare
// specifiers therefore point at a SIBLING `objects/setup-esm/<file>` URL whose body is
// `appendEsmExports(source)`: the untouched source plus `export const <name> =
// window.<name>;` and the `carryFactoryStatics` helper export. The classic
// `objects/setup/<file>` URL stays byte-for-byte unchanged.
//
// ONE TRANSFORM, TWO EMITTERS, ONE URL SPACE:
//   - dev:  lib/server/frqtl-setup-esm.js serves `/frqtl/objects/setup-esm/:file` at request time;
//   - dist: sdk/frqtl-sdk/build.js writes `dist/js/game/setup-esm/<file>` at build time.
// Both call appendEsmExports and iterate FRQTL_SETUPS_MANIFEST (via frqtlSetupsEsmModules).
// Every profile's `objects/` prefix (lib/shim/engine/router.js) routes `objects/setup-esm/`
// to the emitted location, so the map built here is correct in every profile, and
// scripts/assemble-static-deploy.mjs derives its presence check from the same list.
//
// PURE: no DOM, no fs, no engine import — URLs come only from the caller's router.

/**
 * The ONE bare-specifier → canonical-setup-factory manifest.
 *
 * Explicit curation (not a directory enumeration): a bare specifier is a chosen PUBLIC
 * vocabulary (`@frqtl/setups/<id>`), not a 1:1 derivation from the PascalCase filename.
 * Add an entry here when a notebook needs a new canonical setup factory — never re-derive
 * this list elsewhere.
 *
 * `file` is relative to `lib/frqtl/objects/setup/`. `primary` is the name the classic
 * branch assigns via `window.<primary> = <primary>` (appendEsmExports scans for it,
 * FAIL-LOUD if absent). `statics` names helpers attached as STATIC PROPERTIES on the
 * primary (`setupCircuitBasic.createWire = createWire`) — each gets its own export. `deps`
 * lists OTHER bare specifiers whose module MUST evaluate first (a cross-file evaluation-
 * order dependency of the factory file); appendEsmExports prepends a static side-effect
 * `import '<dep>';` for each. No entry declares `deps` today: every factory resolves its
 * sugar dependencies at CALL time.
 *
 * @type {Object<string, {file:string, primary:string, statics?:string[], deps?:string[]}>}
 */
export const FRQTL_SETUPS_MANIFEST = {
    '@frqtl/setups/wave-interference': { file: 'setupWaveInterference.js', primary: 'setupWaveInterference' },
    '@frqtl/setups/double-slit': { file: 'setupDoubleSlit.js', primary: 'setupDoubleSlit' },
    '@frqtl/setups/circuit-basic': {
        file: 'setupCircuitBasic.js', primary: 'setupCircuitBasic',
        statics: ['createWire', 'createBattery', 'createResistor']
    },
    '@frqtl/setups/particle-walk-3d': { file: 'setupParticleWalk3D.js', primary: 'setupParticleWalk3D' }
};

/** Canonical source directory of the factories, relative to the frqtl root (`lib/frqtl/`). */
export const FRQTL_SETUPS_SOURCE_DIR = 'objects/setup/';

/** Router-relative directory of the ESM-transformed modules (routed by every profile's `objects/` prefix). */
export const FRQTL_SETUPS_ESM_DIR = 'objects/setup-esm/';

/**
 * The emitted-module list — every consumer that writes, serves, maps or checks a
 * setup-esm module iterates THIS (never FRQTL_SETUPS_MANIFEST's keys by hand).
 *
 * @returns {Array<{spec:string, entry:{file:string, primary:string, statics?:string[], deps?:string[]}, sourcePath:string, esmPath:string}>}
 *   `sourcePath` / `esmPath` are frqtl-root-relative (`objects/setup/<file>`,
 *   `objects/setup-esm/<file>`) — hand `esmPath` to `router.resolve()` for a URL.
 * @throws {Error} FAIL-LOUD on a manifest entry with no file/primary.
 */
export function frqtlSetupsEsmModules() {
    return Object.keys(FRQTL_SETUPS_MANIFEST).map(function (spec) {
        const entry = FRQTL_SETUPS_MANIFEST[spec];
        if (!entry || typeof entry.file !== 'string' || typeof entry.primary !== 'string') {
            throw new Error('[frqtl-setups-importmap] manifest spec "' + spec + '" has no file/primary (FAIL-LOUD).');
        }
        return {
            spec: spec,
            entry: entry,
            sourcePath: FRQTL_SETUPS_SOURCE_DIR + entry.file,
            esmPath: FRQTL_SETUPS_ESM_DIR + entry.file
        };
    });
}

/**
 * Filename-keyed view of the emitted-module list — the shape the dev route handler needs (it
 * receives an express `:file` param, not a bare specifier). Each value is the SAME row
 * frqtlSetupsEsmModules() yields, so the handler can name the spec it is serving.
 *
 * @returns {Object<string, {spec:string, entry:{file:string, primary:string, statics?:string[], deps?:string[]}, sourcePath:string, esmPath:string}>}
 */
export function frqtlSetupsManifestByFile() {
    const byFile = {};
    const mods = frqtlSetupsEsmModules();
    for (let i = 0; i < mods.length; i++) {
        byFile[mods[i].entry.file] = mods[i];
    }
    return byFile;
}

/**
 * The ONE error both emitters raise when a manifest row's source file is absent (manifest↔tree
 * drift): the dev handler answers 500 with its message, build.js rethrows it — so the two fail
 * with identical wording.
 *
 * @param {{spec:string}} mod        a frqtlSetupsEsmModules() row.
 * @param {string} absSourcePath     the absolute path that was read.
 * @param {Error} [cause]            the underlying read error.
 * @returns {Error}
 */
export function frqtlSetupsSourceMissingError(mod, absSourcePath, cause) {
    const err = new Error(
        '[frqtl-setup-esm] FRQTL_SETUPS_MANIFEST spec "' + mod.spec + '" names source "' + absSourcePath +
        '", which cannot be read (' + ((cause && cause.code) || (cause && cause.message) || 'missing') + ') — restore the ' +
        'file or remove the entry from lib/shim/notebook/frqtl-setups-importmap.js (FAIL-LOUD).'
    );
    if (cause) { err.cause = cause; }
    return err;
}

/**
 * The ONE ESM transform. Verifies the source contains the expected browser-classic
 * assignment(s), appends `export const` statement(s) re-reading them off `window` plus
 * the `carryFactoryStatics` export (CARRY_FACTORY_STATICS_EXPORT), and prepends a static
 * side-effect import for each declared `deps` entry.
 *
 * @param {string} source  raw file contents of a canonical setup factory.
 * @param {{primary:string, statics?:string[], deps?:string[]}} spec
 * @returns {string} deps imports + source + appended export statement(s).
 * @throws {Error} FAIL-LOUD when an expected assignment is not found in source.
 */
export function appendEsmExports(source, spec) {
    const primary = spec && spec.primary;
    if (!primary) {
        throw new Error('[frqtl-setup-esm] spec.primary is required (FAIL-LOUD).');
    }
    const statics = (spec && spec.statics) || [];
    const deps = (spec && spec.deps) || [];

    const primaryRe = new RegExp('window\\.' + primary + '\\s*=\\s*' + primary + '\\b');
    if (!primaryRe.test(source)) {
        throw new Error(
            '[frqtl-setup-esm] expected "window.' + primary + ' = ' + primary + '" not found in source ' +
            '— refusing to append a broken export statement (FAIL-LOUD).'
        );
    }
    for (let i = 0; i < statics.length; i++) {
        const s = statics[i];
        const staticRe = new RegExp(primary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.' + s + '\\s*=\\s*' + s + '\\b');
        if (!staticRe.test(source)) {
            throw new Error(
                '[frqtl-setup-esm] expected "' + primary + '.' + s + ' = ' + s + '" (static export) not found in ' +
                'source — refusing to append a broken export statement (FAIL-LOUD).'
            );
        }
    }

    let depImports = '';
    for (let i = 0; i < deps.length; i++) {
        if (!deps[i] || typeof deps[i] !== 'string') {
            throw new Error('[frqtl-setup-esm] spec.deps entry is not a non-empty string (FAIL-LOUD).');
        }
        depImports += "import '" + deps[i] + "';\n";
    }

    let out = depImports +
        '// ── Appended by lib/shim/notebook/frqtl-setups-importmap.js appendEsmExports (ESM URL only) ──\n' +
        source +
        '\n// ── Appended by lib/shim/notebook/frqtl-setups-importmap.js appendEsmExports (ESM URL only) ──\n' +
        'export const ' + primary + ' = (typeof window !== "undefined" ? window.' + primary + ' : undefined);\n';
    for (let i = 0; i < statics.length; i++) {
        const s = statics[i];
        out += 'export const ' + s + ' = (typeof window !== "undefined" && window.' + primary +
            ' ? window.' + primary + '.' + s + ' : undefined);\n';
    }
    out += CARRY_FACTORY_STATICS_EXPORT;
    return out;
}

/**
 * Appended to EVERY transformed module: the FrqtlApp helper a notebook adapter cell wraps
 * its canonical factory with (`carryFactoryStatics(adapter, factory)`), so the factory's
 * statics (FrqtlApp.FACTORY_STATICS) reach runner.setup() through the adapter. Notebook
 * code never reads window.*; the builder imports the module after ensureEngine(), so the
 * game layer is live — an absent helper is a boot-order defect and throws at import.
 */
const CARRY_FACTORY_STATICS_EXPORT =
    'export const carryFactoryStatics = (function () {\n' +
    '    var F = (typeof window !== "undefined") ? window.FrqtlApp : undefined;\n' +
    '    if (!F || typeof F.carryFactoryStatics !== "function") {\n' +
    '        throw new Error("[frqtl-setup-esm] FrqtlApp.carryFactoryStatics (owner: lib/frqtl/objects/FrqtlApp.js) " +\n' +
    '            "is not available — the game layer must be booted (await frqtl.ensureEngine()) before a " +\n' +
    '            "@frqtl/setups/* module is imported (FAIL-LOUD).");\n' +
    '    }\n' +
    '    return F.carryFactoryStatics;\n' +
    '})();\n';

/**
 * Build the `{imports: {spec: url}}` import-map fragment for the canonical setup
 * factories, each bare specifier resolved by the CALLER'S router at the ESM-transformed
 * `objects/setup-esm/<file>` path (never the raw classic-script `objects/setup/<file>`).
 *
 * @param {{resolve:(relPath:string)=>string}} router  an engineRouter() instance.
 * @returns {{imports: Object<string,string>}}
 * @throws {Error} FAIL-LOUD without a router, or on a manifest entry with no file/primary.
 */
export function buildFrqtlSetupsImportMap(router) {
    if (!router || typeof router.resolve !== 'function') {
        throw new Error('[frqtl-setups-importmap] buildFrqtlSetupsImportMap(router) requires an engineRouter() instance ' +
            '(lib/shim/engine/router.js) — the map is a function of the host\'s path profile (FAIL-LOUD).');
    }
    const imports = {};
    const mods = frqtlSetupsEsmModules();
    for (let i = 0; i < mods.length; i++) {
        imports[mods[i].spec] = router.resolve(mods[i].esmPath);
    }
    return { imports: imports };
}
