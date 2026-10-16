/* Copyright 2023-2026 by Essam Abadir */

/**
 * RenderMesh — the ONE resolver for the `render.mesh` external-geometry intent.
 *
 * `render.mesh` is an OPEN-ID render-intent key (owned by lib/shim/frame-data
 * RENDER_INTENT_KEYS; deliberately NO RENDER_INTENT_VALUES entry = accept-any-string).
 * Its value is an external-geometry ASSET ID — e.g. an Objaverse glTF id or a served
 * .glb/.gltf URL. It routes a frame/LO to a loaded mesh instead of a sprite/cube.
 *
 * Mirrors RenderShape: this file is the DECODE/RESOLVE authority (which asset id applies
 * to a frame, via the priority chain). It does NOT load anything — asset loading + caching
 * + FAIL-LOUD-on-failure live in the renderer provider (three GLTFLoader path). Keeping the
 * resolver pure (no three import) means it runs in pkg-node/conformance unchanged.
 *
 * CANONICAL-STACK NOTE (CEO-ratified 2026-06-30): WHICH mesh a frame maps to is a
 * renderer/sugar/user-space CHOICE derived from FrameData (a frame's layer/mass/fullness,
 * or an explicit per-frame `render.mesh` string_map key written by sugar). The engine emits
 * primitives and carries `render.mesh` OPAQUE (I1) — it never interprets it. See
 * docs/internal/engine/RENDERER_CONTRACT.md §9.
 *
 * Priority chain (same shape as RenderShape.resolve):
 *   1. render.mesh key in a FRAME's string_map (per-quantum override; highest priority)
 *   2. `.mesh` field on a LARGE OBJECT (renderer-only LO field, parallel to lo.sprite /
 *      lo.renderHint — an LO carries render intent directly; it has no string_map bubble)
 *   3. mesh in experiment render options (setRenderOption('mesh', id) default)
 *   4. none (null) — object falls back to its sprite/cube/box/ball path
 *
 * Export contract (pure; no side effects, no three dependency):
 *   RenderMesh.resolve(frame, renderOpts) -> string | null   (asset id, or null = no mesh)
 *   RenderMesh.hasMesh(frame, renderOpts) -> boolean
 *   RenderMesh.KEY                        -> 'render.mesh'    (the frame-data-owned key name)
 */

(function () {
    'use strict';

    // The open-id render-intent key this resolver decodes. Asserted against the canonical
    // owner (lib/shim/frame-data RENDER_INTENT_KEYS) so a contract drop FAILS LOUD rather
    // than silently resolving nothing — same fail-loud discipline as RenderShape's ferry.
    var KEY = 'render.mesh';

    function _ferryFrameDataSchema() {
        if (typeof module !== 'undefined' && module.exports) {
            var path = require('path');
            return require(path.resolve(__dirname, '../../../shim/frame-data/index.js'));
        }
        if (typeof window !== 'undefined' && window.FrameDataSchema) {
            return window.FrameDataSchema;
        }
        throw new Error(
            'RenderMesh: canonical contract lib/shim/frame-data (FrameDataSchema) is unreachable — ' +
            'cannot confirm the render.mesh key is declared. Fail-loud (Invariant 2), not a fallback.'
        );
    }

    var _schema = _ferryFrameDataSchema();
    if (_schema.RENDER_INTENT_KEYS.indexOf(KEY) === -1) {
        throw new Error(
            'RenderMesh: "' + KEY + '" is not a declared render-intent key in lib/shim/frame-data ' +
            'RENDER_INTENT_KEYS — the open-id key set must be owned there.'
        );
    }
    // render.mesh is OPEN-ID: it must have NO RENDER_INTENT_VALUES entry (accept-any-string).
    if (_schema.RENDER_INTENT_VALUES[KEY] !== undefined) {
        throw new Error(
            'RenderMesh: "' + KEY + '" must be OPEN-ID (no RENDER_INTENT_VALUES entry) — an asset id ' +
            'is a free string validated at load time by the renderer, not an enum.'
        );
    }

    /**
     * Resolve the external-mesh asset id for one renderable object, from the priority chain.
     *
     * @param {object} obj         - a FRAME (obj.data.string_map may carry 'render.mesh') OR a
     *                               LARGE OBJECT (obj.mesh may carry the asset id directly).
     * @param {object} renderOpts  - FrqtlApp._renderOptions (the setRenderOption bag).
     * @returns {string|null} the asset id, or null when no mesh is routed (sprite/cube/box path applies).
     */
    function resolve(obj, renderOpts) {
        var sm = obj && obj.data && obj.data.string_map;
        if (sm && typeof sm[KEY] === 'string' && sm[KEY].length > 0) {
            return sm[KEY];
        }
        // Per-LO renderer-only field. LOs have no frame-data bubble; they carry render intent
        // directly on the object (like lo.sprite / lo.renderHint). This keeps RenderMesh the
        // SINGLE resolver authority for the render.mesh intent across frames AND large objects.
        if (obj && typeof obj.mesh === 'string' && obj.mesh.length > 0) {
            return obj.mesh;
        }
        if (renderOpts && typeof renderOpts.mesh === 'string' && renderOpts.mesh.length > 0) {
            return renderOpts.mesh;
        }
        return null;
    }

    /**
     * True when a frame routes to an external mesh (resolve returns a non-null asset id).
     * @param {object} frame
     * @param {object} renderOpts
     * @returns {boolean}
     */
    function hasMesh(frame, renderOpts) {
        return resolve(frame, renderOpts) !== null;
    }

    var RenderMesh = {
        KEY:     KEY,
        resolve: resolve,
        hasMesh: hasMesh
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RenderMesh: RenderMesh };
    } else {
        window.RenderMesh = RenderMesh;
    }

})();
