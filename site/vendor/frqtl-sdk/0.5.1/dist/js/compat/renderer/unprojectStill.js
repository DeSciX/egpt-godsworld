/* Copyright 2023-2026 by Essam Abadir */

/**
 * unprojectStill.js — THE pixel→universe mapping authority for a CAPTURED still (R5).
 *
 * Peer of `FieldBuilder.js` (the one field source) and `captureStill-common.js` (the one
 * readback): a single canonical module every consumer FERRIES instead of writing its own.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * "Which universe pixel is this image pixel?" is the question every measurement over a
 * capture actually asks — ring radii, fringe spacing, an object's apparent position. An
 * OFFLINE corpus consumer cannot ask the live renderer: there is no `screenToWorld` in a
 * JSONL row. And for a perspective camera the pose bag plus the buffer dims are NOT enough —
 * the mapping is underdetermined without the camera intrinsics. That is precisely why
 * eyeballed measurements over screenshots come out shaky.
 *
 * So the scene record carries `projection` (the intrinsics) and this module composes it with
 * the still's `pose` and dims into an unambiguous answer. It is a CONTRACT FUNCTION, not
 * prose: a consumer's hand-written unproject drifting from the provider's is the
 * schema-mirror bug applied to MATH, and it is silent — it returns plausible wrong numbers.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `UnprojectStill.unprojectStill(scene, still, bufX, bufY, worldZ?) → {x, y} | null`
 *
 *   @param {object} scene — a SceneRecord (`projection`, `physicsW`, `physicsH`).
 *   @param {object} still — a still record (`width`, `height`, `cssWidth`, `cssHeight`,
 *     `pose`). Must be an `rgba8` still: the `framedata` and `r8` channels are not rasters
 *     of the composited canvas, so a canvas-pixel unprojection is meaningless for them and
 *     THROWS rather than returning a number nobody should trust. (For `r8`, use
 *     `fieldTexelToPhysics` below — the field has its own, simpler map.)
 *   @param {number} bufX,bufY — coordinates in the still's OWN BUFFER (i.e. an array index
 *     pair: `data[(bufY*width + bufX)*4]`). That is what a corpus consumer actually holds —
 *     not a CSS coordinate. The conversion to CSS units happens here, once.
 *   @param {number} [worldZ=0] — the universe z-plane to intersect (3D only; ignored in 2D).
 *   @returns {{x:number,y:number}|null} physics-pixel point, or `null` when the ray cannot
 *     resolve (parallel to the plane, or beyond the scene-scale sanity bound).
 *
 * `UnprojectStill.fieldTexelToPhysics(scene, still, texX, texY) → {x, y}`
 *   The `r8` channel's own map: field texel → physics pixel, the exact inverse of the scale
 *   `FieldBuilder` applied (`fw/canvasW`, `fh/canvasH`). Separate function because the field
 *   is built in physics space and never passes through a camera — conflating it with the
 *   canvas unprojection is how a radial profile silently acquires a perspective error.
 *
 * ── FAIL-LOUD ────────────────────────────────────────────────────────────────
 *
 * A `null`/unknown `projection` THROWS naming the gap (a BYO provider that declares no
 * intrinsics cannot be unprojected — and guessing `affine2d` under a perspective camera is
 * the exact "silent 2D-affine fallback" the renderer contract already bans). A
 * `kind:'perspective'` still with no `pose` THROWS. A wrong-format still THROWS. None of
 * these returns a plausible wrong number.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 *
 * ZERO physics: a coordinate transform at the output boundary. It reads records; it cannot
 * touch a frame, a dimension or a tick.
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — every renderer authority carries
//    this wrapper; classic scripts share ONE global lexical environment, so an unwrapped
//    top-level helper would silently overwrite a same-named sibling, invisibly to
//    `node --test`). Enforced by lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

function _fail(msg) {
    throw new Error('[unprojectStill] ' + msg + ' (FAIL-LOUD — never a plausible wrong point.)');
}

/**
 * The three-camera GEOMETRY authority, through a named FAIL-LOUD guard. The perspective
 * branch DELEGATES to its `_screenToWorldThree` (passing the scene's `fovY` as data via that
 * function's opt-in trailing parameter) — this module composes records, it does not
 * re-derive the pinhole.
 */
function _resolveCameraGeometry() {
    if (typeof module !== 'undefined' && module.exports) {
        var path = require('path');
        return require(path.resolve(__dirname, 'providers/three-camera-geometry.js'));
    }
    if (typeof window !== 'undefined' && window.ThreeCameraGeometry) { return window.ThreeCameraGeometry; }
    _fail('canonical contract ThreeCameraGeometry is unreachable (load order)');
}

/**
 * The 2D camera map — the SAME authority the live p5 provider draws and picks with. Ferried,
 * never re-derived: a second copy of the pan/zoom terms is the schema-mirror bug applied to
 * MATH, and it fails silently.
 */
function _resolveCamera2dGeometry() {
    if (typeof module !== 'undefined' && module.exports) {
        var path = require('path');
        return require(path.resolve(__dirname, 'camera2d-geometry.js'));
    }
    if (typeof window !== 'undefined' && window.Camera2dGeometry) { return window.Camera2dGeometry; }
    _fail('canonical contract Camera2dGeometry is unreachable (load order)');
}

function _num(v, name) {
    if (typeof v !== 'number' || !isFinite(v)) { _fail(name + ' must be a finite number, got ' + String(v)); }
    return v;
}

function _requireRaster(still) {
    if (!still || typeof still !== 'object') { _fail('expected a still record, got ' + String(still)); }
    if (still.format !== 'rgba8') {
        _fail('this still\'s format is ' + JSON.stringify(still.format) + ', not "rgba8" — the ' +
              'framedata and r8 channels are not rasters of the composited canvas, so a ' +
              'canvas-pixel unprojection has no meaning for them (for r8 use fieldTexelToPhysics)');
    }
    return still;
}

/**
 * unprojectStill — see the module docstring.
 * @returns {{x:number,y:number}|null}
 */
function unprojectStill(scene, still, bufX, bufY, worldZ) {
    if (!scene || typeof scene !== 'object') { _fail('expected a SceneRecord, got ' + String(scene)); }
    _requireRaster(still);
    var proj = scene.projection;
    if (!proj || typeof proj.kind !== 'string') {
        _fail('the SceneRecord carries no `projection` — its provider declared no intrinsics, ' +
              'so this capture cannot be unprojected. Guessing an affine map under a ' +
              'perspective camera would compute the WRONG point silently');
    }
    var pw = _num(scene.physicsW, 'scene.physicsW');
    var ph = _num(scene.physicsH, 'scene.physicsH');
    var bw = _num(still.width,  'still.width');
    var bh = _num(still.height, 'still.height');
    _num(bufX, 'bufX'); _num(bufY, 'bufY');

    if (proj.kind === 'affine2d') {
        // The 2D map composes (buffer → canvas) with the CAMERA's pan/zoom, and it DELEGATES
        // to the same `camera2d-geometry` authority the live provider draws and picks with —
        // so an offline measurement cannot drift from the picture. The still's own `pose`
        // supplies {distance, target}; at the default pose the scale is 1 and this reduces
        // EXACTLY to the previous pure ratio, so unzoomed captures are byte-unchanged.
        //
        // This is load-bearing, not tidiness: without the pose terms a ZOOMED 2D still would
        // unproject as though it showed the whole universe — a silently wrong answer of
        // exactly the kind that made screenshot measurements untrustworthy.
        return _resolveCamera2dGeometry().screenToWorld2d(still.pose, pw, ph, bufX, bufY, bw, bh);
    }

    if (proj.kind === 'perspective') {
        var pose = still.pose;
        if (!pose || typeof pose !== 'object') {
            _fail('a perspective still needs its `pose` provenance to unproject — a 3D capture ' +
                  'with a null pose is not comparable run-to-run and is not acceptance evidence');
        }
        var fovY = _num(proj.fovY, 'projection.fovY');
        // Buffer px → CSS px (the units the pinhole authority takes). cssWidth/Height default
        // to the buffer dims when the capture had no distinct CSS size (headless).
        var cw = (typeof still.cssWidth  === 'number' && still.cssWidth  > 0) ? still.cssWidth  : bw;
        var ch = (typeof still.cssHeight === 'number' && still.cssHeight > 0) ? still.cssHeight : bh;
        var cssX = bufX * (cw / bw);
        var cssY = bufY * (ch / bh);
        // ONE mapping authority: delegate to the SAME analytic pinhole the live provider's
        // screenToWorld uses, with the captured fovY passed as data.
        return _resolveCameraGeometry()._screenToWorldThree(
            pose, pw, ph, cssX, cssY, cw, ch, (typeof worldZ === 'number') ? worldZ : 0, fovY);
    }

    _fail('unknown projection kind ' + JSON.stringify(proj.kind) +
          ' — known kinds: affine2d, perspective');
}

/**
 * fieldTexelToPhysics — the `r8` channel's own map (the exact inverse of FieldBuilder's scale).
 * @param {object} scene @param {object} still @param {number} texX @param {number} texY
 * @returns {{x:number,y:number}}
 */
function fieldTexelToPhysics(scene, still, texX, texY) {
    if (!scene || typeof scene !== 'object') { _fail('expected a SceneRecord, got ' + String(scene)); }
    if (!still || still.format !== 'r8') {
        _fail('fieldTexelToPhysics expects an "r8" (field) still, got ' +
              JSON.stringify(still && still.format));
    }
    var pw = _num(scene.physicsW, 'scene.physicsW');
    var ph = _num(scene.physicsH, 'scene.physicsH');
    var fw = _num(still.width,  'still.width');
    var fh = _num(still.height, 'still.height');
    _num(texX, 'texX'); _num(texY, 'texY');
    // FieldBuilder maps physics → texel by (fw/canvasW, fh/canvasH); this is that inverse.
    // The field never passes through a camera, which is exactly why it is a separate map.
    return { x: texX * (pw / fw), y: texY * (ph / fh) };
}

// ── Export ────────────────────────────────────────────────────────────────────

var UnprojectStill = {
    unprojectStill:      unprojectStill,
    fieldTexelToPhysics: fieldTexelToPhysics
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnprojectStill;
} else if (typeof window !== 'undefined') {
    window.UnprojectStill = UnprojectStill;
}

})();
