// Copyright 2023-2026 by Essam Abadir
// lib/shim/notebook/frqtl-setups-importmap.js — the ONE owner of the `@frqtl/setups/<id>`
// bare-specifier lane: the manifest and the import-map fragment. Deleter: P5 (notebooks as
// projects) — notebook cells name these specifiers, and their text is P5's.
//
// WHY BARE SPECIFIERS: a notebook `module` cell's declared name (`name="./setups/x.js"`)
// is a SIBLING-MODULE KEY inside the notebook's own moduleSet() closure, not a real
// filesystem/HTTP path; a relative specifier that is NOT itself a module cell in the same
// notebook 404s (VETO-CLASS #1, lib/shim/notebook/module-resolver.js). A notebook imports a
// canonical setup factory by bare specifier, resolved through the document import map.
//
// The specifiers point at the REAL factory modules (lib/frqtl/objects/setup/<file>, ES modules):
// no transform, no second copy. Every profile's `objects/` prefix (lib/shim/engine/router.js)
// places them, so the map built here is correct in every host.
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
 * `file` is relative to `lib/frqtl/objects/setup/`. `primary` is the factory's named export;
 * `statics` names its other named exports (`createWire`, …).
 *
 * @type {Object<string, {file:string, primary:string, statics?:string[]}>}
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

/**
 * The lane's rows — every consumer that maps or checks a setup module iterates THIS (never
 * FRQTL_SETUPS_MANIFEST's keys by hand).
 *
 * @returns {Array<{spec:string, entry:{file:string, primary:string, statics?:string[]}, sourcePath:string}>}
 *   `sourcePath` is frqtl-root-relative (`objects/setup/<file>`) — hand it to `router.resolve()` for a URL.
 * @throws {Error} FAIL-LOUD on a manifest entry with no file/primary.
 */
export function frqtlSetupsModules() {
    return Object.keys(FRQTL_SETUPS_MANIFEST).map(function (spec) {
        const entry = FRQTL_SETUPS_MANIFEST[spec];
        if (!entry || typeof entry.file !== 'string' || typeof entry.primary !== 'string') {
            throw new Error('[frqtl-setups-importmap] manifest spec "' + spec + '" has no file/primary (FAIL-LOUD).');
        }
        return { spec: spec, entry: entry, sourcePath: FRQTL_SETUPS_SOURCE_DIR + entry.file };
    });
}

/**
 * Build the `{imports: {spec: url}}` import-map fragment for the canonical setup factories, each
 * bare specifier resolved by the CALLER'S router at the factory's own module path.
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
    const mods = frqtlSetupsModules();
    for (let i = 0; i < mods.length; i++) {
        imports[mods[i].spec] = router.resolve(mods[i].sourcePath);
    }
    return { imports: imports };
}
