/* Copyright 2023-2026 by Essam Abadir */

/**
 * RenderShape — the ONE shape authority for all renderers.
 *
 * Resolves the per-frame render shape from the priority chain:
 *   1. render.shape key in frame's string_map (per-frame override; highest priority)
 *   2. shape in experiment render options (setRenderOption default; set by the experiment)
 *   3. Renderer's own fallback (always 'ball')
 *
 * This is consumed by BOTH p5 and three providers — no per-provider shape logic.
 *
 * Why a single file: a render-color audit found that shape was
 * driven by a construction-time global in three-provider
 * and was absent entirely in p5-provider. That creates a provider divergence where
 * the same experiment renders differently on each provider. RenderShape.js closes
 * this by being the unique decoder both providers call.
 *
 * VALID SHAPES:
 *   'ball'   — round glowing point sprite (default; unchanged behavior for all existing
 *              experiments). In three: Gaussian glow in the fragment shader; in p5: ellipse.
 *   'box'    — filled square at the voxel size (1 Dim-0 = 1 screen px). In three: the
 *              existing Chebyshev-fill box shader branch (uShape=1); in p5: rect.
 *   'circle' — outline circle (no fill). In three: same as ball but outline-only via
 *              discard inside radius; in p5: noFill+stroke ellipse.
 *   'cube'   — TRUE shaded 3D cube mesh (three.js InstancedMesh; 3D mode only). In three
 *              (when _is3D): an InstancedMesh of BoxGeometry with per-face brightness
 *              shading (front/top brighter than sides/back) so cube faces are visually
 *              distinct. In 2D or p5: silently falls back to 'box' (graceful degradation —
 *              the engine/physics are untouched; only the render path changes). The cube
 *              render path completely BYPASSES the Points mesh and GLSL shader; it uses a
 *              real THREE.Mesh so depth-sorting and face normals work correctly.
 *   'sphere' — TRUE 3D instanced-sphere mesh (three.js InstancedMesh; 3D mode only) —
 *              SYMMETRIC with 'cube' (gated on isSphereMesh, exactly like isCubeMesh). In
 *              three (when _is3D): a per-instance-colored SphereGeometry InstancedMesh (the
 *              R6 "2D coloring extended to 3D" baseline) that applies render.color per
 *              instance, so render.shape and render.color stay INDEPENDENT (a forced-red
 *              sphere is a red sphere, not a point). In 2D or p5: degrades to the filled
 *              'ball' disc — toUniform('sphere')=0 (ball glow) on the three Points path, and
 *              p5's default (else) branch draws it as the ball ellipse. No per-provider map:
 *              this file is the one authority; the fold-in retired the old shapeMesh3D flag.
 *
 * Export contract:
 *   RenderShape.resolve(frame, renderOpts) -> 'ball' | 'box' | 'circle' | 'cube' | 'sphere'
 *   RenderShape.toUniform(shape)           -> number (three uShape value; cube/sphere→0 = ball
 *                                             because cube/sphere bypass the point-sprite shader)
 *   RenderShape.isCubeMesh(shape)          -> boolean (true for 'cube' — instanced-mesh gate)
 *   RenderShape.isSphereMesh(shape)        -> boolean (true for 'sphere' — instanced-mesh gate)
 *   RenderShape.VALID_SHAPES               -> string[] (FERRIED from lib/shim/frame-data
 *                                             RENDER_INTENT_VALUES['render.shape'] — NOT a source here)
 *
 * Single-source: the shape VALUE set is owned by lib/shim/frame-data (the foundational
 * cross-engine render-intent contract). RenderShape is the DECODE authority (resolve/
 * isCubeMesh/toUniform) but re-exports the value list rather than re-listing it, so adding
 * a shape is one edit at frame-data.
 */

import * as FrameDataSchema from '../../../shim/frame-data/index.js';



    var _schema = FrameDataSchema;
    var VALID_SHAPES = _schema.RENDER_INTENT_VALUES['render.shape'];
    if (!Array.isArray(VALID_SHAPES) || VALID_SHAPES.length === 0) {
        throw new Error(
            'RenderShape: frame-data RENDER_INTENT_VALUES["render.shape"] is missing or empty — ' +
            'the shape value set must be owned by lib/shim/frame-data.'
        );
    }

    /**
     * Resolve the shape for one frame, from the priority chain.
     *
     * @param {object} frame       - FrameData object; frame.data.string_map may carry 'render.shape'.
     * @param {object} renderOpts  - FrqtlApp._renderOptions (the setRenderOption bag).
     * @returns {string} a member of VALID_SHAPES (ferried from frame-data's
     *   RENDER_INTENT_VALUES['render.shape']: 'ball'|'box'|'circle'|'cube'|'sphere').
     */
    function resolve(frame, renderOpts) {
        // 1. Per-frame override via string_map (highest priority).
        var sm = frame && frame.data && frame.data.string_map;
        if (sm && sm['render.shape'] && VALID_SHAPES.indexOf(sm['render.shape']) !== -1) {
            return sm['render.shape'];
        }
        // 2. Experiment default via setRenderOption('shape', ...).
        var optShape = renderOpts && renderOpts.shape;
        if (optShape && VALID_SHAPES.indexOf(optShape) !== -1) {
            return optShape;
        }
        // 3. Renderer default.
        return 'ball';
    }

    /**
     * Convert a resolved shape name to the three.js uShape uniform value.
     *
     * uShape is a float consumed by the QUANTA_FRAG shader (the Points mesh path):
     *   0.0 = ball (round Gaussian glow — default)
     *   1.0 = box  (Chebyshev-fill solid square)
     *
     * 'circle' renders via the ball glow path in three (a full separate branch
     * is a future enhancement — for now circle ≡ ball in three, and is
     * distinct only in p5 where the stroke/noFill path is available without
     * any shader change).
     *
     * 'cube' in 3D mode BYPASSES the Points mesh and GLSL shader entirely — the
     * three-provider switches to an InstancedMesh of BoxGeometry instead. This
     * function returns 0.0 for 'cube' as a safe sentinel; the caller must gate
     * on RenderShape.isCubeMesh(shape) to know whether to use the instanced-mesh
     * path vs the Points path. 'sphere' is the same: an instanced mesh in 3D
     * (gate: isSphereMesh), 0.0 here.
     *
     * @param {string} shape - a member of VALID_SHAPES: 'ball' | 'box' | 'circle' | 'cube' | 'sphere'
     * @returns {number}     - 0.0 (ball/circle/cube/sphere) or 1.0 (box)
     */
    function toUniform(shape) {
        return (shape === 'box') ? 1.0 : 0.0;
    }

    /**
     * True when shape should be rendered as a 3D InstancedMesh cube (not a point sprite).
     * The three-provider gates on this to switch between the Points path and the instanced-mesh path.
     * In 2D or p5, 'cube' falls back to 'box' in resolve() before isCubeMesh is called.
     *
     * @param {string} shape - resolved shape name
     * @returns {boolean}
     */
    function isCubeMesh(shape) {
        return shape === 'cube';
    }

    /**
     * True when shape should be rendered as a 3D InstancedMesh sphere (not a point sprite) —
     * exactly parallel to isCubeMesh. The three-provider gates its sphere InstancedMesh path
     * on `_is3D && isSphereMesh(resolvedShape)`, symmetric with the cube gate. In 2D or p5,
     * 'sphere' degrades to the filled 'ball' disc (toUniform('sphere')=0 / p5's ball branch)
     * before this matters.
     *
     * @param {string} shape - resolved shape name
     * @returns {boolean}
     */
    function isSphereMesh(shape) {
        return shape === 'sphere';
    }

    var RenderShape = {
        VALID_SHAPES: VALID_SHAPES,
        resolve:      resolve,
        toUniform:    toUniform,
        isCubeMesh:   isCubeMesh,
        isSphereMesh: isSphereMesh
    };

export { RenderShape };
