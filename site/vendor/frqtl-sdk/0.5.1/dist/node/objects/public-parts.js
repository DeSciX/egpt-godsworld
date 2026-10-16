/* Copyright 2023-2026 by Essam Abadir */

/**
 * public-parts.js — THE ROSTER: the single owner table of "what is public".
 *
 * `@descix/frqtl-sdk` declares ONE symbol contract behind ONE specifier, served by
 * two condition targets (node + browser). This table is the ONE place that contract's
 * PARTS half is written down. Both barrels ENUMERATE off it and the parity gate DIFFS
 * against it:
 *
 *   - `sdk/frqtl-sdk/src/node/index.js`      requires each entry and fails loud on a
 *                                             resolved `undefined`.
 *   - the browser condition target            ferries `window[name]` for each entry.
 *   - `sdk/frqtl-sdk/scripts/verify-publish-surface.mjs`  diffs both key sets against it.
 *
 * A HAND-TYPED EXPORT LIST IN EITHER BARREL IS FORBIDDEN. Two derivations of one fact
 * is the general form of mirror drift: the copies WILL disagree silently, and the tell
 * here would be a part that imports in node and is `undefined` in the browser. Adding a
 * part to the published surface is a ONE-LINE change to this array — nowhere else.
 *
 * Membership is architect-gated (widening the roster is a product decision, not a
 * convenience): the 41 files under `objects/objects/` split into PUBLIC PARTS and
 * INTERNAL MACHINERY (compilers, control widgets, op-programs), and this table makes
 * that split a declared fact instead of folklore. `actionCompiler` deliberately stays
 * OFF the roster — a consumer's contract is the `actions[]` vocabulary, and the compiler
 * is `LargeObject`'s internal authority; exporting it would mint a second construction path.
 *
 * ── ROW SHAPE ───────────────────────────────────────────────────────────────
 *
 *   { name, module, key }
 *
 *   name   — the exported symbol name (identical on both condition targets, and the
 *            `window.<name>` global the classic dual-mode script publishes in a page).
 *   module — path RELATIVE TO `lib/frqtl/objects/` (e.g. 'objects/Wall.js'). The node
 *            barrel joins it under its own mirrored `./objects/` dist subtree; a browser
 *            consumer joins it under the router's `objects/` path-authority prefix.
 *   key    — the property name on that module's `module.exports`, or NULL when
 *            `module.exports` IS the symbol.
 *
 * `key` is NOT cosmetic: the shipped parts genuinely differ in export shape
 * (`module.exports = { Wall: Wall }` vs `module.exports = CameraPath`), and guessing it
 * yields a SILENT `undefined` rather than a load error. Every row below was read off its
 * file's own export tail.
 */

(function () {
    'use strict';

    /** @type {Array<{name: string, module: string, key: string|null}>} */
    var PUBLIC_PARTS = [
        // ── The primitive (THE_MINIMAL_SIM #4) ──────────────────────────────
        { name: 'LargeObject',       module: 'objects/LargeObject.js',        key: 'LargeObject' },

        // ── The parts with datasheets ───────────────────────────────────────
        { name: 'Wall',              module: 'objects/Wall.js',               key: 'Wall' },
        { name: 'SphereEmitter',     module: 'objects/SphereEmitter.js',      key: 'SphereEmitter' },
        { name: 'SlitScreen',        module: 'objects/SlitScreen.js',         key: 'SlitScreen' },
        { name: 'DetectorWall',      module: 'objects/DetectorWall.js',       key: 'DetectorWall' },
        { name: 'GraphingDetectorWall', module: 'objects/GraphingDetectorWall.js', key: 'GraphingDetectorWall' },
        { name: 'Tunnel',            module: 'objects/Tunnel.js',             key: 'Tunnel' },
        { name: 'Trace',             module: 'objects/Trace.js',              key: 'Trace' },

        // ── The eyes (module.exports IS the symbol) ─────────────────────────
        { name: 'CameraPath',        module: 'objects/CameraPath.js',         key: null },
        { name: 'FrqtlVision',       module: 'objects/FrqtlVision.js',        key: null },

        // ── The primitives' companions ──────────────────────────────────────
        { name: 'Rectangle',         module: 'geometry/Rectangle.js',         key: 'Rectangle' },
        { name: 'CollisionActions',  module: 'constants/CollisionActions.js', key: 'CollisionActions' },
        { name: 'CollisionTypes',    module: 'constants/CollisionTypes.js',   key: 'CollisionTypes' },

        // ── The setup factories ─────────────────────────────────────────────
        { name: 'setupDoubleSlit',   module: 'setup/setupDoubleSlit.js',      key: 'setupDoubleSlit' }
    ];

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PUBLIC_PARTS: PUBLIC_PARTS };
    } else if (typeof window !== 'undefined') {
        window.PUBLIC_PARTS = PUBLIC_PARTS;
    }

})();
