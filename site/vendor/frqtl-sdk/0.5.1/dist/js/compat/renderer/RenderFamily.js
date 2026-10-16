/* Copyright 2023-2026 by Essam Abadir */

/**
 * RenderFamily — the ONE per-frame render-FAMILY decode authority for the 3D provider.
 *
 * WHY (Red-Team R2-4 §6; contract: docs/internal/engine/RENDERER_CONTRACT.md,
 * §per-frame render-intent resolution): the three.js tick loop used to
 * decide the render path (mesh vs cube vs sphere vs point-sprite) ONCE per tick from a
 * `RenderShape.resolve(null, opts)` / `RenderMesh.resolve(null, opts)` call — frame hard-coded
 * `null`, so a correctly-stamped PER-FRAME `render.shape` / `render.mesh` was silently ignored
 * (the bug class the resolver-only unit tests structurally cannot see: a resolver is 100%
 * correct while its ONLY caller feeds it null). This file lifts that routing DECISION into a
 * PURE, Node-testable decode function with a SINGLE caller — mirroring RenderShape.js
 * (RenderShape.resolve), the existing precedent for "extract the tick-loop routing
 * decision into a pure decode fn." A future call-site cannot re-pass null silently because this
 * function has NO null-frame code path — it composes the two authorities per-frame.
 *
 * It COMPOSES the two existing decode authorities (never re-maps): RenderMesh first (a mesh stamp
 * outranks a shape), then RenderShape. It adds NO shader, NO GLSL attribute, NO new vocab — the
 * three-provider folds the returned family into its existing per-(dim,family) bucket key.
 *
 * FAMILY (what THREE object draws the frame):
 *   'mesh'   (+assetId)          → a clone of a loaded glTF (RenderMesh.resolve truthy; 3D-only)
 *   'cube'                       → a lit BoxGeometry InstancedMesh (RenderShape 'cube'; 3D-only)
 *   'sphere'                     → a lit SphereGeometry InstancedMesh (RenderShape 'sphere'; 3D-only)
 *   'pts' (+uShapeVariant 0|1)   → the Points shader sprite (ball/circle→0, box→1; any 2D shape)
 *
 * 3D gate: mesh/cube/sphere are 3D-only families (they are lit meshes). When `is3D` is false
 * (2D three, or p5 never calls here) they DEGRADE to the 'pts' family exactly as RenderShape
 * already degrades cube/sphere to the ball/box sprite — no separate 2D branch needed.
 *
 * Export contract (PURE — no THREE, no side effects; runs unchanged in pkg-node/conformance):
 *   RenderFamily.resolveRenderFamily(frame, renderOpts, is3D)
 *       -> { family:'mesh'|'cube'|'sphere'|'pts', key:string, assetId?:string, uShapeVariant?:number }
 *   RenderFamily.familyKey(res) -> string   (the bucket-key token: 'mesh:<id>'|'cube'|'sphere'|'pts:<v>')
 *
 * Single-source: RenderShape / RenderMesh remain the shape/mesh decode authorities; this file
 * only ORDERS them into one family verdict. It re-uses their outputs by reference — it never
 * re-lists shape names or re-reads string_map keys itself.
 */

(function () {
    'use strict';

    // Ferry the two decode authorities (same dual Node/browser pattern RenderShape/RenderMesh
    // use to ferry frame-data). FAIL LOUD if either is unreachable — a missing canonical
    // authority is an Invariant-2 load-order error, never a silent fallback.
    function _ferryAuthorities() {
        if (typeof module !== 'undefined' && module.exports) {
            var path = require('path');
            return {
                RenderShape: require(path.resolve(__dirname, './RenderShape.js')).RenderShape,
                RenderMesh:  require(path.resolve(__dirname, './RenderMesh.js')).RenderMesh
            };
        }
        if (typeof window !== 'undefined' && window.RenderShape && window.RenderMesh) {
            return { RenderShape: window.RenderShape, RenderMesh: window.RenderMesh };
        }
        throw new Error(
            'RenderFamily: canonical authorities RenderShape/RenderMesh are unreachable — ' +
            'RenderFamily.js must load AFTER RenderShape.js and RenderMesh.js in the stack-boot ' +
            'RENDERER list (fail-loud, Invariant 2, not a fallback).'
        );
    }

    var _auth = _ferryAuthorities();
    var RenderShape = _auth.RenderShape;
    var RenderMesh  = _auth.RenderMesh;

    /**
     * Resolve the render FAMILY of one frame, composing RenderMesh (highest) then RenderShape.
     *
     * @param {object} frame       - FrameData; frame.data.string_map may carry render.mesh/render.shape.
     * @param {object} renderOpts  - the setRenderOption bag (opts.mesh / opts.shape scene defaults).
     * @param {boolean} is3D       - whether the provider is in 3D mode (mesh/cube/sphere families
     *                               only exist in 3D; 2D degrades every one to the 'pts' sprite).
     * @returns {{family:string, key:string, assetId?:string, uShapeVariant?:number}}
     */
    function resolveRenderFamily(frame, renderOpts, is3D) {
        // 1. Mesh outranks shape (a per-frame render.mesh stamp routes to a glTF clone). 3D-only.
        if (is3D) {
            var assetId = RenderMesh.resolve(frame, renderOpts);
            if (assetId) {
                return { family: 'mesh', assetId: assetId, key: 'mesh:' + assetId };
            }
        }
        // 2. Shape family. cube/sphere are lit InstancedMeshes (3D-only); everything else is the
        //    Points sprite whose ball-vs-box is the per-bucket uShape uniform.
        var shape = RenderShape.resolve(frame, renderOpts);
        if (is3D && RenderShape.isCubeMesh(shape)) {
            return { family: 'cube', key: 'cube' };
        }
        if (is3D && RenderShape.isSphereMesh(shape)) {
            return { family: 'sphere', key: 'sphere' };
        }
        var uShapeVariant = RenderShape.toUniform(shape);   // 0 = ball/circle/(degraded cube/sphere), 1 = box
        return { family: 'pts', uShapeVariant: uShapeVariant, key: 'pts:' + uShapeVariant };
    }

    /** The bucket-key token for a resolved family (already precomputed on `.key`). */
    function familyKey(res) {
        return res && res.key ? res.key : 'pts:0';
    }

    var RenderFamily = {
        resolveRenderFamily: resolveRenderFamily,
        familyKey:           familyKey
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RenderFamily: RenderFamily };
    } else {
        window.RenderFamily = RenderFamily;
    }

})();
