/* Copyright 2023-2026 by Essam Abadir */

/**
 * renderCapabilities-common.js — the SHARED universal + filter capability
 * descriptors every `RendererProvider.renderCapabilities()` implementation
 * declares (Studio Controls Realignment S5b — the S5a gate
 * "minor DRY recommendation": `p5-provider.js` and `three-provider.js` had
 * byte-identical `_universalRenderCapabilities` bodies + an identical
 * per-Filters-entry toggle loop, hand-copied across two legitimately-
 * independent BYO files — a 4th universal knob would have needed adding in
 * two places. This module is the ONE owner both providers import).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * Pure, module-level free functions — no live WebGL/THREE/canvas instance
 * needed (capability DESCRIPTORS are static metadata; live VALUES are read
 * separately via `FrqtlApp.getRenderOption`) — this is what keeps every caller
 * unit-testable in plain Node with no browser.
 *
 * `universalRenderCapabilities(normalizeFieldDescriptor, RenderShapeRef, FrameDataSchemaRef)`
 *   → the 3 knobs BOTH built-in providers honor identically (README §3):
 *     `shape` (enum, RenderShape.VALID_SHAPES), `colorScheme` (enum,
 *     RENDER_INTENT_VALUES['render.colorScheme']), `renderBaseCanvas` (boolean,
 *     render-only). Does NOT include filter toggles — see `filterRenderCapabilities`
 *     below (three-provider splices its OWN effect-layer knobs BETWEEN the
 *     universal 3 and the filter toggles, so the lists are kept separate).
 *
 * `meshRenderCapabilities(normalizeFieldDescriptor)`
 *   → the scene external-mesh pair (`mesh`, `meshScale`) a provider with a mesh
 *     render path declares (three).
 *
 * `filterRenderCapabilities(normalizeFieldDescriptor, FiltersRef)`
 *   → one `filter.<name>` toggle descriptor (boolean, render-only, default false) per
 *     `Filters.js` catalog entry — `filter()`/`removeFilter()` are REQUIRED
 *     contract methods on every provider (README §1), so every provider
 *     declares every filter identically; this is why the loop is shared
 *     rather than per-provider.
 *
 * A caller composes its own full list as
 * `universalRenderCapabilities(...).concat(providerOnlyCaps).concat(filterRenderCapabilities(...))`
 * — see `p5-provider.js`'s `_renderCapabilitiesP5` / `three-provider.js`'s
 * `_renderCapabilitiesThree` for the two worked call sites.
 *
 * `knownRenderCapabilityNames(providers)`
 *   → the union of names over the renderer registry (`providers/index.js` RENDERER_PROVIDERS,
 *     each entry registering its static `renderCapabilities` beside `makeProvider`) —
 *     the "known" set saved render rows are partitioned against.
 *
 * ── Module format: an ES module, like every peer under lib/frqtl/compat/renderer/ ──
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * Zero physics — pure metadata describing render-surface knobs (root
 * CLAUDE.md §Object architecture: render is output-boundary only).
 */



/** `{value:value}` identity map — the shape `makeControlsForObject.js`'s
 *  `_enumHandler` requires for `constraint.values` (`_isIdentityValuesMap`). */
function _identityMap(values) {
    var m = {};
    for (var i = 0; i < values.length; i++) { m[values[i]] = values[i]; }
    return m;
}

/**
 * The 3 universal knobs both p5 and three honor identically.
 * @param {function} normalizeFieldDescriptor — `lib/shim/field-descriptor`'s
 *   `normalizeFieldDescriptor` (dependency-injected, not required here, so
 *   this module has no import of its own — mirrors the callers' own
 *   already-resolved-ref-passing convention).
 * @param {{VALID_SHAPES:string[]}} RenderShapeRef
 * @param {{RENDER_INTENT_VALUES:object}} FrameDataSchemaRef
 * @returns {object[]} 3 normalized field descriptors.
 */
function universalRenderCapabilities(normalizeFieldDescriptor, RenderShapeRef, FrameDataSchemaRef) {
    return [
        normalizeFieldDescriptor({
            name: 'shape', type: 'enum', default: 'ball',
            // This is the render-LEVEL DEFAULT shape (per-object sugar like a
            // SphereEmitter's `renderShape` field overrides it per-leaf via render.shape) —
            // labelled "Default Shape" so the scoping reads true. `label` overrides the shown
            // control label only; the capability key stays `shape` (setRenderOption('shape',…)).
            label: 'Default Shape',
            constraint: { values: _identityMap(RenderShapeRef.VALID_SHAPES) },
            description: 'Render-level DEFAULT particle shape (RenderShape.js — the one shape ' +
                'authority). A per-object sugar override (e.g. a SphereEmitter renderShape) wins ' +
                'per-leaf via the render.shape key; this is the fallback when none is set.'
        }),
        normalizeFieldDescriptor({
            name: 'colorScheme', type: 'enum', default: 'warmcool',
            constraint: { values: _identityMap(FrameDataSchemaRef.RENDER_INTENT_VALUES['render.colorScheme']) },
            description: 'Per-experiment default fullness-to-color ramp (LightColor.js — the one color authority).'
        }),
        normalizeFieldDescriptor({
            name: 'renderBaseCanvas', type: 'boolean', default: true, engineVisible: false,
            description: 'Whether the particle/base layer composites into the scene before any ' +
                'post-process pass (README §3). Both p5 and three honor this identically; the write ' +
                'gate coerces a 0/1 control value to the boolean the providers read.'
        })
    ];
}

/**
 * The scene external-mesh pair, declared by a provider with a mesh render path (three):
 * `mesh` is read one hop away, in `RenderMesh.resolve(frame, renderOpts)` (priority #3,
 * below a frame's `render.mesh` and a large object's `mesh`); `meshScale` scales the clones.
 * @param {function} normalizeFieldDescriptor
 * @returns {object[]} 2 normalized field descriptors.
 */
function meshRenderCapabilities(normalizeFieldDescriptor) {
    return [
        normalizeFieldDescriptor({
            name: 'mesh', type: 'string', default: null,
            description: 'Scene-default external glTF asset id (URL) every frame is drawn as, in 3D. ' +
                'OPEN-ID like its per-frame twin render.mesh; unset draws the shape path.'
        }),
        normalizeFieldDescriptor({
            name: 'meshScale', type: 'number', unit: 'multiplier', default: 1,
            constraint: { min: 0.01, max: 100, integer: false },
            description: 'Scene-wide scale multiplier for external-mesh clones (a frame\'s ' +
                'render.meshScale overrides it per frame).'
        })
    ];
}

/**
 * One `filter.<name>` toggle capability per `Filters.js` catalog entry.
 * @param {function} normalizeFieldDescriptor
 * @param {object} FiltersRef — `Filters.js`'s exported catalog (`{water:{...}, bloom:{...}, ...}`).
 * @returns {object[]} `Object.keys(FiltersRef).length` normalized field descriptors.
 */
function filterRenderCapabilities(normalizeFieldDescriptor, FiltersRef) {
    var caps = [];
    var filterNames = Object.keys(FiltersRef);
    for (var i = 0; i < filterNames.length; i++) {
        caps.push(normalizeFieldDescriptor({
            name: 'filter.' + filterNames[i], type: 'boolean', default: false, engineVisible: false,
            description: 'Toggle the "' + filterNames[i] + '" post-process filter ' +
                '(Filters.js — the runner routes the write to filter()/removeFilter(); a 0/1 ' +
                'control value is coerced to the boolean).'
        }));
    }
    return caps;
}

/**
 * The union of capability NAMES every registered renderer declares — the "known" set a
 * saved render row is partitioned against (declared by the target / by another renderer /
 * by none). Read off each registry entry's STATIC `renderCapabilities` (the providers
 * register it beside `makeProvider`), so no provider is constructed and no name is listed
 * by hand.
 * @param {Object<string, {renderCapabilities:function}>} providers — `RENDERER_PROVIDERS`.
 * @returns {string[]} sorted, de-duplicated names.
 * @throws {Error} when the registry is missing or an entry exposes no static renderCapabilities.
 */
function knownRenderCapabilityNames(providers) {
    if (!providers || typeof providers !== 'object') {
        throw new Error('[RenderCapabilitiesCommon.knownRenderCapabilityNames] requires the renderer ' +
            'registry (providers/index.js RENDERER_PROVIDERS); got ' + (providers === null ? 'null' : typeof providers) +
            '. (FAIL-LOUD.)');
    }
    var seen = {};
    var ids = Object.keys(providers);
    for (var i = 0; i < ids.length; i++) {
        var entry = providers[ids[i]];
        if (!entry || typeof entry.renderCapabilities !== 'function') {
            throw new Error('[RenderCapabilitiesCommon.knownRenderCapabilityNames] registered renderer "' +
                ids[i] + '" exposes no static renderCapabilities() — every registry entry publishes its ' +
                'capability descriptors beside makeProvider. (FAIL-LOUD.)');
        }
        var caps = entry.renderCapabilities();
        for (var j = 0; j < caps.length; j++) { seen[caps[j].name] = true; }
    }
    return Object.keys(seen).sort();
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    universalRenderCapabilities,
    filterRenderCapabilities,
    knownRenderCapabilityNames,
    meshRenderCapabilities,
    _identityMap
};
