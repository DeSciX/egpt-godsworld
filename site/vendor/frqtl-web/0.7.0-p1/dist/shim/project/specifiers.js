/* Copyright 2023-2026 by Essam Abadir */

/**
 * specifiers.js — THE one table of `@descix/frqtl-web/...` specifiers a sketch may import.
 *
 *   FRQTL_WEB_SPECIFIERS        rows { specifier, libPath, why, tier } — a row whose specifier ends in `/`
 *                               is a PREFIX row (one part = one file under it). `tier` is a key of SPECIFIER_TIERS:
 *                               'scene' (a sketch imports it) or 'part-internal' (a forked part file under parts/
 *                               imports it, never a sketch: the parts' own internal imports, one row per file —
 *                               the set equals what the registering parts import, held by fork.test.mjs G-CENSUS)
 *   SPECIFIER_TIERS             { scene, 'part-internal' } — the tier vocabulary and who may import each
 *   libPathOf(specifier)        → the lib-identity path it names; THROWS on an unknown specifier
 *   tierOf(specifier)           → the row's tier; THROWS on an unknown specifier (libPathOf's rows)
 *   specifierOfLibPath(libPath) → the specifier naming that lib-identity file, or null: libPathOf's inverse over
 *                               the same rows (a prefix row answers for each file directly under it)
 *   importMapFor(libRootUrl)    → { imports } — the rows as an import map, every libPath appended to
 *                               the URL of the lib-identity root AS SEEN FROM THE PAGE: an absolute
 *                               URL or one starting with '/', './' or '../' (any other root THROWS —
 *                               an import map ignores such a value as a bare specifier); prefix rows
 *                               stay prefixes. No filesystem computation, so a vendored dist root
 *                               takes the same call.
 *   FRQTL_WEB_HOST_SPECIFIERS   rows { specifier, libPath, why } a HOST PAGE imports and a sketch never does:
 *                               ./boot (FRQTL_WEB_BOOT, the scene doors), ./registry, ./project, ./host-view and ./site-graph. libPathOf
 *                               refuses every one of them, so a sketch cannot boot a page.
 *   pageImportMapFor(libRootUrl) → importMapFor(libRootUrl) plus every FRQTL_WEB_HOST_SPECIFIERS row: the map
 *                               of a page that boots a scene through the doors and runs sketches beside it.
 *
 * Inside lib/ the specifier is a SELF-REFERENCE — the package naming itself, the way node resolves a
 * package importing itself by name — not a lib→sdk edge. It is legal ONLY in sketch content
 * (a host's scene files, written sketches, sketch and notebook text); closure modules import relatively
 * (scripts/verify-arrows.mjs holds the scope). Consumers ferry this table and never restate it:
 * every page import map (importMapFor), the node resolve hook (node-specifier-hook.mjs) and the sdk
 * build's module closure (libPathOf).
 */

/** Who imports a row of each tier. */
export const SPECIFIER_TIERS = Object.freeze({
    scene: Object.freeze({ id: 'scene', importedBy: 'any project file (a sketch imports it)' }),
    'part-internal': Object.freeze({ id: 'part-internal', importedBy: 'a part file (parts/*.js) of a project — a forked part imports its parent part\'s internals; never a sketch' })
});

/** The published surface a project imports. Every row is a public exports entry of both packages (sdk/_build/exports-contract.mjs derives them from this table). */
export const FRQTL_WEB_SPECIFIERS = Object.freeze([
    Object.freeze({ specifier: '@descix/frqtl-web/parts', libPath: 'frqtl/parts/index.js',
        why: 'the parts barrel', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/parts/', libPath: 'frqtl/parts/',
        why: 'one part = one file', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/shim/controls/registry.js', libPath: 'shim/controls/registry.js',
        why: 'knob registration (registerControls): a scene declares its own sliders and toggles', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/shim/render/sun-look.js', libPath: 'shim/render/sun-look.js',
        why: "the one owner of the sun's FX bag (SunLook)", tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/compat/renderer/display-slot.js', libPath: 'frqtl/compat/renderer/display-slot.js',
        why: 'the booted display name a dual-mode scene reads before its co-init call', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/compat/renderer/orbit-bag.js', libPath: 'frqtl/compat/renderer/orbit-bag.js',
        why: 'hasAngularPose, THE 3D-ness predicate of a camera pose', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/setup/_collisionMatrixLanes.js', libPath: 'frqtl/objects/setup/_collisionMatrixLanes.js',
        why: 'the one collision-lane table (density lanes of a collision scene)', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/compat/engine.js', libPath: 'frqtl/compat/engine.js',
        why: 'the engine accessor (a scene that builds its frames by hand)', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/kinds', libPath: 'frqtl/objects/kinds-entry.js',
        why: 'the kind registry: a composed fork registers its renamed class (registerKind, kindNamed, kindOf, registeredKinds)', tier: 'scene' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/objects/tagger.js', libPath: 'frqtl/objects/objects/tagger.js',
        why: 'imported by DetectorWall — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/schema/index.js', libPath: 'frqtl/objects/schema/index.js',
        why: 'imported by DetectorWall, SlitScreen, Wall — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/shim/render/heat-colormap.js', libPath: 'shim/render/heat-colormap.js',
        why: 'imported by GraphingDetectorWall — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/schema/valueNormalizer.js', libPath: 'frqtl/objects/schema/valueNormalizer.js',
        why: 'imported by LiveChart, Wall — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/objects/Box.js', libPath: 'frqtl/objects/objects/Box.js',
        why: 'imported by OvenBox — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/objects/QuantumEmitter.js', libPath: 'frqtl/objects/objects/QuantumEmitter.js',
        why: 'imported by OvenBox — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/shim/expr/ast-schema.js', libPath: 'shim/expr/ast-schema.js',
        why: 'imported by OvenBox, Tunnel — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/objects/actionCompiler.js', libPath: 'frqtl/objects/objects/actionCompiler.js',
        why: 'imported by OvenBox, Tunnel — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/v1-replacements.js', libPath: 'frqtl/objects/v1-replacements.js',
        why: 'imported by SlitLightSource — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/objects/slitLinerScatter.js', libPath: 'frqtl/objects/objects/slitLinerScatter.js',
        why: 'imported by SlitScreen, Tunnel — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/setup/setupSphereEmitter3D.js', libPath: 'frqtl/objects/setup/setupSphereEmitter3D.js',
        why: 'imported by SphereEmitter — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/objects/directedRedirectProgram.js', libPath: 'frqtl/objects/objects/directedRedirectProgram.js',
        why: 'imported by Tunnel — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/compat/renderer/lo-drawn-center.js', libPath: 'frqtl/compat/renderer/lo-drawn-center.js',
        why: 'imported by Tunnel — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/setup/setupTunnelPointExit.js', libPath: 'frqtl/objects/setup/setupTunnelPointExit.js',
        why: 'imported by Tunnel — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/constants/WallBehaviors.js', libPath: 'frqtl/objects/constants/WallBehaviors.js',
        why: 'imported by Wall — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/objects/absorbRadiation.js', libPath: 'frqtl/objects/objects/absorbRadiation.js',
        why: 'imported by Wall — a forked copy imports it', tier: 'part-internal' }),
    Object.freeze({ specifier: '@descix/frqtl-web/objects/geometry/SlabFace.js', libPath: 'frqtl/objects/geometry/SlabFace.js',
        why: 'imported by Wall — a forked copy imports it', tier: 'part-internal' })
]);

/** The scene doors a host page imports — the package's `./boot` export; never a sketch specifier. */
export const FRQTL_WEB_BOOT = Object.freeze({ specifier: '@descix/frqtl-web/boot', libPath: 'frqtl/experiments/_shared/doors.js',
    why: 'the scene doors (bootScene, bootProject)' });

/** What a host page imports beside its sketches. Every row is a public exports entry of @descix/frqtl-web. */
export const FRQTL_WEB_HOST_SPECIFIERS = Object.freeze([
    FRQTL_WEB_BOOT,
    Object.freeze({ specifier: '@descix/frqtl-web/registry', libPath: 'shim/registry/index.js',
        why: 'the roster contract and its readers (normalizeRoster, sceneGroups, showcaseCard, showcaseHref), the roster loader (loadRoster), projectOf + emptyProjectOf, STUDIO\'s deep-link landing record' }),
    Object.freeze({ specifier: '@descix/frqtl-web/project', libPath: 'shim/project/index.js',
        why: 'the specifier table, the link site, sketchProject and the project identity' }),
    Object.freeze({ specifier: '@descix/frqtl-web/host-view', libPath: 'shim/host/index.js',
        why: 'the DeSciX host-view declarer: a page declares its own view' }),
    Object.freeze({ specifier: '@descix/frqtl-web/site-graph', libPath: 'shim/engine/site-graph.js',
        why: 'the static site\'s shape: the graph directory, the build-stamp attribute, the build id pattern, the IDE entry page, the host-provided attribute' })
]);

/** The package a self-reference names. */
export const FRQTL_WEB_PACKAGE = '@descix/frqtl-web';

function _isPrefix(row) { return row.specifier.endsWith('/'); }

/**
 * @param {string} specifier — a `@descix/frqtl-web/...` specifier
 * @returns {string} the lib-identity path (e.g. 'frqtl/parts/Wall.js')
 */
export function libPathOf(specifier) {
    if (typeof specifier !== 'string') {
        throw new TypeError('[specifiers] libPathOf(specifier): a string specifier (got ' + typeof specifier + '). (FAIL-LOUD.)');
    }
    for (const row of FRQTL_WEB_SPECIFIERS) {
        if (!_isPrefix(row) && row.specifier === specifier) { return row.libPath; }
    }
    for (const row of FRQTL_WEB_SPECIFIERS) {
        if (_isPrefix(row) && specifier.startsWith(row.specifier) && specifier.length > row.specifier.length) {
            const rest = specifier.slice(row.specifier.length);
            if (rest.split('/').indexOf('..') !== -1) {
                throw new Error('[specifiers] "' + specifier + '" climbs out of its prefix row (' + row.specifier + '). (FAIL-LOUD.)');
            }
            return row.libPath + rest;
        }
    }
    throw new Error('[specifiers] "' + specifier + '" is not a @descix/frqtl-web specifier — the table ' +
        '(lib/shim/project/specifiers.js FRQTL_WEB_SPECIFIERS) offers: ' +
        FRQTL_WEB_SPECIFIERS.map(function (r) { return r.specifier + (_isPrefix(r) ? '<file>' : ''); }).join(', ') +
        '. (FAIL-LOUD.)');
}

/** The row naming `specifier` (libPathOf's rule: an exact row first, else a prefix row with a file under it), or null. */
function _rowOf(specifier) {
    for (const row of FRQTL_WEB_SPECIFIERS) {
        if (!_isPrefix(row) && row.specifier === specifier) { return row; }
    }
    for (const row of FRQTL_WEB_SPECIFIERS) {
        if (_isPrefix(row) && specifier.startsWith(row.specifier) && specifier.length > row.specifier.length) { return row; }
    }
    return null;
}

/**
 * @param {string} specifier — a `@descix/frqtl-web/...` specifier
 * @returns {string} its row's tier (a key of SPECIFIER_TIERS); THROWS on a specifier no row names
 */
export function tierOf(specifier) {
    libPathOf(specifier);   // the one validation (and its refusal text)
    return _rowOf(specifier).tier;
}

/**
 * @param {string} libPath — a lib-identity path (e.g. 'frqtl/parts/Wall.js', 'frqtl/objects/schema/index.js')
 * @returns {string|null} the specifier whose row names that file, or null when no row does
 */
export function specifierOfLibPath(libPath) {
    if (typeof libPath !== 'string' || !libPath) {
        throw new TypeError('[specifiers] specifierOfLibPath(libPath): a lib-identity path (got ' + JSON.stringify(libPath) + '). (FAIL-LOUD.)');
    }
    for (const row of FRQTL_WEB_SPECIFIERS) {
        if (!_isPrefix(row) && row.libPath === libPath) { return row.specifier; }
    }
    for (const row of FRQTL_WEB_SPECIFIERS) {
        if (_isPrefix(row) && libPath.startsWith(row.libPath)) {
            const rest = libPath.slice(row.libPath.length);
            if (rest && rest.indexOf('/') === -1) { return row.specifier + rest; }
        }
    }
    return null;
}

/** An import map resolves an address only if it is an absolute URL or starts with '/', './' or '../'. */
function _isMapAddress(url) {
    if (/^(\/|\.\/|\.\.\/)/.test(url)) { return true; }
    try { new URL(url); return true; } catch (e) { return false; }
}

/**
 * @param {string} libRootUrl — the lib-identity root as seen from the page, ending in `/`: an absolute
 *   URL or one starting with '/', './' or '../' (e.g. '../../', '/pub/abc123/', './vendor/frqtl-web/0.6.0/dist/')
 * @returns {{imports: Object<string, string>}}
 */
export function importMapFor(libRootUrl) {
    if (typeof libRootUrl !== 'string' || !libRootUrl.endsWith('/')) {
        throw new TypeError('[specifiers] importMapFor(libRootUrl): the lib-identity root URL as seen from the page, ' +
            'ending in "/" (got ' + JSON.stringify(libRootUrl) + '). (FAIL-LOUD.)');
    }
    if (!_isMapAddress(libRootUrl)) {
        throw new TypeError('[specifiers] importMapFor(libRootUrl): ' + JSON.stringify(libRootUrl) + ' is neither an ' +
            'absolute URL nor a path starting with "/", "./" or "../", so a browser reads every row built on it as a ' +
            'bare specifier and ignores it. Write it as ' + JSON.stringify('./' + libRootUrl) + ' (relative to the page) ' +
            'or ' + JSON.stringify('/' + libRootUrl) + ' (from the origin root). (FAIL-LOUD.)');
    }
    const imports = {};
    for (const row of FRQTL_WEB_SPECIFIERS) { imports[row.specifier] = libRootUrl + row.libPath; }
    return { imports: imports };
}

/**
 * @param {string} libRootUrl — as importMapFor's
 * @returns {{imports: Object<string, string>}} importMapFor(libRootUrl) plus every FRQTL_WEB_HOST_SPECIFIERS row
 *
 * The map carries no dist-manifest.json row: the manifest is a fact of a PACKAGE dist, and this map is also
 * rendered for lib roots that are not one (the static site's graph has none). A host reads it from the root
 * it already holds: `new URL('dist-manifest.json', root)`.
 */
export function pageImportMapFor(libRootUrl) {
    const map = importMapFor(libRootUrl);
    for (const row of FRQTL_WEB_HOST_SPECIFIERS) { map.imports[row.specifier] = libRootUrl + row.libPath; }
    return map;
}
