/* Copyright 2023-2026 by Essam Abadir */

/**
 * camera2d-geometry.js — THE 2D camera map: the `affine2d` projection's one authority.
 *
 * Peer of `providers/three-camera-geometry.js` (the pinhole authority) and, like it, PURE and
 * backend-free so it is unit-testable in plain Node with no canvas. It lives at
 * `compat/renderer/` rather than under `providers/` because it is NOT p5-specific: it is the
 * math of the `projection:{kind:'affine2d'}` mode, and three's own 2D orthographic mode
 * reports that same kind. Naming it after one provider would be a lie the day the other uses it.
 *
 * ── Why 2D pan/zoom is a CAMERA concern, not a render option ─────────────────
 *
 * Three reasons, each decisive alone (ratified 2026-07-30):
 *
 * 1. **One write path / honest provenance.** Every still stamps `pose` from `cameraControl`.
 *    If 2D pan/zoom lived on the render surface (a `setRenderOption`, a view rect), a ZOOMED
 *    2D still's `pose` would read `null` — a mislabeled training record, which is the corpus
 *    corruption channel reopened by the very feature meant to serve VLA.
 * 2. **One mapping authority.** `screenToWorld` in 2D must change under pan/zoom. If the
 *    pan/zoom state lived anywhere but the camera authority, two authorities would feed one
 *    mapping — the split-basis failure the 3D camera consolidation just eliminated.
 * 3. **One vocabulary.** "Look at point P at magnification Z" is the same sentence in 2D and
 *    3D. In 3D it is already `target` + `distance`. Minting a parallel 2D vocabulary
 *    (`viewRect`, `panX`/`panY`/`zoom`) would fork the pose bag AND fork `CameraPath`.
 *
 * ── The degenerate orbit bag ─────────────────────────────────────────────────
 *
 * The 2D pose IS the orbit bag with the angular triple absent — NOT a new bag type:
 *
 *   `target: {x, y}` — the physics-px point at the VIEW CENTRE; `null` = the canvas centre.
 *                      **Pan IS target, in both modes — the same key.**
 *   `distance`       — the VISIBLE PHYSICS-PX HEIGHT of the view; smaller = zoomed IN.
 *
 * `distance` is not a pun. In 3D at a fixed vertical FOV the visible height at the target
 * plane is `2·distance·tan(fovY/2)`, so `distance` ALREADY means "how much world you see" in
 * both modes — one observable, two projections. There is deliberately no `zoom` field: a
 * second magnification vocabulary would fork the bag. "Zoom into that region" is
 * `setOrbit({ target: regionCentre, distance: regionHeight })`.
 *
 * A consumer NEVER asks "is this 2D?". It asks which pose fields exist: the handle's
 * `poseFields` declares exactly the axes it has, so a host hides the angular affordances and
 * shows the rest by FIELD PRESENCE — the same capability idiom as `roll` and `move()`.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 *   POSE_FIELDS_2D(w, h)          — the declared pose axes (distance, target). No azimuth /
 *                                   elevation / roll: this camera does not have them.
 *   PRESETS_2D(w, h)              — the named framings, declared beside the axes.
 *   defaultPose2d(w, h)           — `{distance: h, target: null}` = the whole canvas, 1:1.
 *   resolveView2d(pose, w, h)     — `{k, cx, cy}`: scale factor and the physics-px point at
 *                                   the view centre. THE one place the transform is derived.
 *   screenToWorld2d(pose, w, h, sx, sy, sw, sh) — a point in canvas/buffer space → physics px.
 *
 * At the default pose `k === 1` and the map is the IDENTITY — so every existing 2D caller,
 * drag, pick and capture is byte-unchanged until someone actually pans or zooms.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. A view transform at the output boundary: it changes which pixels you are
 * shown, never a frame, a dimension or a tick. Zooming does not alter the simulation, which
 * is exactly why it is safe as an observation instrument.
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — every renderer authority carries it;
//    classic scripts share ONE global lexical environment, so an unwrapped top-level helper
//    would silently overwrite a same-named sibling, invisibly to `node --test`).
(function () {

function _fail(msg) {
    throw new Error('[camera2d-geometry] ' + msg + ' (FAIL-LOUD.)');
}

function _resolveFieldDescriptorSchema() {
    if (typeof module !== 'undefined' && module.exports) {
        var path = require('path');
        return require(path.resolve(__dirname, '../../../shim/field-descriptor/index.js'));
    }
    if (typeof window !== 'undefined' && window.FieldDescriptorSchema) { return window.FieldDescriptorSchema; }
    _fail('canonical contract FieldDescriptorSchema is unreachable (load order)');
}

/**
 * The DECLARED pose axes of a 2D camera — normalized field descriptors, the same shape the
 * 3D camera publishes. A host renders whatever THIS camera declares; the absence of
 * `azimuth`/`elevation`/`roll` is what hides the angular affordances, with no mode sniffing
 * anywhere.
 * @param {number} width @param {number} height — physics canvas dims
 * @returns {Array<object>}
 */
function POSE_FIELDS_2D(width, height) {
    var nfd = _resolveFieldDescriptorSchema().normalizeFieldDescriptor;
    return [
        nfd({
            name: 'distance', label: 'zoom', type: 'number', unit: 'px', default: height,
            // Down to 8 px of visible height is a deep zoom (native pixel scale and beyond);
            // up to 4x the canvas frames any scene with margin.
            constraint: { min: 8, max: Math.max(height * 4, 32), integer: false },
            widgetConfig: { step: Math.max(1, Math.round(height / 60)) },
            description: 'The VISIBLE HEIGHT of the view in physics pixels — smaller = zoomed IN. ' +
                'Default = the full canvas height (1:1). The same observable as the 3D camera\'s ' +
                'distance: "how much world you see".'
        }),
        nfd({
            name: 'target', label: 'centre', type: 'object', unit: 'px', default: null,
            description: 'The physics-px point {x,y} at the view centre; null = the canvas centre. ' +
                'Pan IS target — the same key the 3D camera uses.'
        })
    ];
}

/**
 * PRESETS_2D — the named framings this camera offers, DECLARED beside its axes.
 *
 * Lives here rather than inline in the provider for the same reason `POSE_FIELDS_2D` does:
 * the 3D camera keeps its preset TABLE and its pose descriptors together in
 * `three-camera-contract.js`, and splitting the 2D pair across two files would leave the
 * provider holding declarative data. A 2D camera has exactly one framing — the whole canvas.
 *
 * @param {number} width @param {number} height — physics canvas dims
 * @returns {Object<string,object>} preset name → the orbit-bag patch it applies
 */
function PRESETS_2D(width, height) {
    return { fit: { target: null, distance: height } };
}

/** `{distance: height, target: null}` — the whole canvas at 1:1. @returns {object} */
function defaultPose2d(width, height) {
    return { distance: height, target: null };
}

/**
 * resolveView2d(pose, width, height) → `{k, cx, cy}` — THE derivation of the 2D view.
 *
 *   k       — scale factor = `height / distance`. `k > 1` is zoomed in.
 *   cx, cy  — the physics-px point held at the view centre (`target`, or the canvas centre).
 *
 * Every consumer (the provider's draw transform, `screenToWorld`, the offline
 * `unprojectStill`) derives from THIS, so the picture and the mapping can never disagree.
 *
 * @param {object|null} pose — a (possibly partial) orbit bag
 * @param {number} width @param {number} height — physics canvas dims
 * @returns {{k:number, cx:number, cy:number}}
 */
function resolveView2d(pose, width, height) {
    if (!(width > 0 && height > 0)) { _fail('physics dims must be positive, got ' + width + 'x' + height); }
    var d = (pose && typeof pose.distance === 'number' && isFinite(pose.distance) && pose.distance > 0)
        ? pose.distance : height;
    var t = (pose && pose.target && typeof pose.target.x === 'number' && typeof pose.target.y === 'number')
        ? pose.target : null;
    return {
        k:  height / d,
        cx: t ? t.x : width / 2,
        cy: t ? t.y : height / 2
    };
}

/**
 * screenToWorld2d — a point in CANVAS space → physics px, under the current 2D pose.
 *
 * `srcX/srcY` are in the coordinate space whose extent is `srcW/srcH`. That is deliberately
 * general: the live provider passes CSS pixels and the canvas's CSS size, while the OFFLINE
 * `unprojectStill` passes BUFFER pixels and the still's buffer dims. Same map, one
 * implementation — which is what stops an offline measurement from drifting from the live
 * drag/pick.
 *
 * @param {object|null} pose @param {number} width @param {number} height — physics dims
 * @param {number} srcX @param {number} srcY @param {number} srcW @param {number} srcH
 * @returns {{x:number, y:number}}
 */
function screenToWorld2d(pose, width, height, srcX, srcY, srcW, srcH) {
    var sw = (srcW > 0) ? srcW : width;
    var sh = (srcH > 0) ? srcH : height;
    var v = resolveView2d(pose, width, height);
    // 1. source space → canvas-draw space (physics px on an unzoomed canvas)
    var dx = srcX * (width / sw);
    var dy = srcY * (height / sh);
    // 2. invert the draw transform: translate(w/2,h/2) · scale(k) · translate(-cx,-cy)
    return {
        x: (dx - width / 2) / v.k + v.cx,
        y: (dy - height / 2) / v.k + v.cy
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

var Camera2dGeometry = {
    POSE_FIELDS_2D:  POSE_FIELDS_2D,
    PRESETS_2D:      PRESETS_2D,
    defaultPose2d:   defaultPose2d,
    resolveView2d:   resolveView2d,
    screenToWorld2d: screenToWorld2d
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Camera2dGeometry;
} else if (typeof window !== 'undefined') {
    window.Camera2dGeometry = Camera2dGeometry;
}

})();
