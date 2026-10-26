/* Copyright 2023-2026 by Essam Abadir */

/**
 * orbit-bag.js — THE point-shape authority for the camera pose bag.
 *
 * Peer of `renderCapabilities-common.js` and `captureStill-common.js`: a shared contract-half
 * BOTH providers import, so the pose vocabulary has ONE owner instead of one per provider.
 * (`camera2d-geometry.js` and `providers/three-camera-geometry.js` are the per-projection MATH
 * authorities and stay exactly that — this file does no geometry, only shape.)
 *
 * ── Why this file exists (V4 UX, fix 3) ──────────────────────────────────────
 *
 * The two providers each hand-validated `target` and disagreed, in two different wrong ways:
 * the 2D handle threw `target.x must be a finite number` on the array spelling, while the 3D
 * handle SILENTLY RESET a malformed target to `null` and re-centred the camera. The second is
 * a fail-loud breach on its own (RENDERER_CONTRACT §1a.2: throw-or-apply, never
 * clamp-and-continue), and the pair is a validation schema mirror — two modules hand-listing a
 * shape the contract owns. So the shape moves HERE and both providers ferry through it.
 *
 * ── The vocabulary ───────────────────────────────────────────────────────────
 *
 * A point-valued pose field accepts BOTH spellings, because a reader trained on p5 writes
 * either one and both are unambiguous:
 *
 *   `{x, y, z}`  — the canonical OBJECT form (`z` optional ⇒ 0)
 *   `[x, y, z]`  — the ARRAY form (`[x, y]` is accepted; `z` ⇒ 0)
 *   `null` / `undefined` — UNSET (the camera re-centres on the scene). This is a declared
 *                  value, not a malformed one, exactly as it is in the schema accessors.
 *
 * OUTPUT is always the object form — `getOrbit()` is unchanged and a captured pose still
 * round-trips value-exact through `setOrbit`. The array is an accepted INPUT spelling only:
 * the same "an enum accepts a key or a value" precedent, applied to points. Anything else —
 * a string, a 4-tuple, a bag with a NaN — THROWS one identical message under EVERY provider,
 * naming both accepted spellings. Two providers disagreeing about a shape is the drift this
 * owner exists to make impossible.
 *
 * A 2D handle PROJECTS the normalized point (it stores `{x, y}` and ignores `z`) — it does not
 * re-validate, and it does not get its own opinion about the spelling.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 *   POINT_FIELDS                     — the pose keys that are point-valued (`target` today).
 *                                      A future point field joins this list and both providers
 *                                      accept both spellings for it for free.
 *   normalizePoint(value, fieldName) — throw-or-return `{x, y, z}` (or `null` for unset).
 *   normalizeOrbitPatch(patch)       — a COPY of the patch with every point field normalized.
 *                                      Non-point keys are passed through untouched (the
 *                                      per-axis finite guards stay with the provider that
 *                                      declares those axes).
 *   ANGULAR_FIELDS                   — the pose keys that ROTATE the view (azimuth, elevation,
 *                                      roll). A camera that declares none of them is flat.
 *   hasAngularPose(cameraHandle)     — THE 3D-ness predicate: does this camera handle declare an
 *                                      angular axis in its own `poseFields`? Every consumer that
 *                                      must branch on "is this scene 3D?" asks this — never handle
 *                                      presence (the 2D p5 camera is a real handle too) and never
 *                                      a renderer sniff. `null` (no pose control at all) is flat;
 *                                      a handle without a `poseFields` array breaks the camera
 *                                      contract and THROWS.
 *   makePoseNotice()                 — the POSE-CHANGE notice every camera handle publishes as
 *                                      `addPoseListener(fn) → unsubscribe`: `{ add, notify }`.
 *                                      A provider calls `notify(bag)` from the ONE place its pose
 *                                      is applied, so EVERY write reaches every listener (pads,
 *                                      camera strip, wheel, page-code `setOrbit`, a resize). A
 *                                      dependent that re-derived the notice per write site would
 *                                      go silently stale on the site it forgot.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This is pose-input spelling at the output boundary: it changes which pixels
 * you are shown, never a frame, a dimension or a tick.
 */


/** The pose keys whose value is a POINT. Named once so no consumer re-lists them. */
var POINT_FIELDS = ['target'];

/** The pose keys that ROTATE the view. Named once: the 2D provider's setOrbit guard and the
 *  3D-ness predicate both read it. */
var ANGULAR_FIELDS = ['azimuth', 'elevation', 'roll'];

/**
 * hasAngularPose(cameraHandle) — THE 3D-ness predicate, asked of the handle's own axis
 * declaration (`poseFields[].name`), never of its presence.
 *
 * @param {object|null} cameraHandle — a `getCameraControl()` handle, or null (no pose control).
 * @returns {boolean} true iff the handle declares at least one ANGULAR_FIELDS axis.
 * @throws {Error} when a non-null handle publishes no `poseFields` array (camera contract breach).
 */
function hasAngularPose(cameraHandle) {
    if (cameraHandle === null || cameraHandle === undefined) { return false; }
    var fields = cameraHandle.poseFields;
    if (!Array.isArray(fields)) {
        throw new Error('camera pose: the camera handle publishes no `poseFields` array, so whether ' +
            'it has angular axes cannot be read — every getCameraControl() handle declares its ' +
            'axes (RENDERER_CONTRACT §1a.2). (FAIL-LOUD.)');
    }
    for (var i = 0; i < fields.length; i++) {
        if (fields[i] && ANGULAR_FIELDS.indexOf(fields[i].name) !== -1) { return true; }
    }
    return false;
}

/** @private — the ONE message, so both providers are byte-identical on a bad input. */
function _reject(fieldName, value) {
    throw new Error('camera pose: `' + fieldName + '` must be a POINT — either {x, y, z} or ' +
        '[x, y, z] (z optional, defaults to 0), with finite numbers, or null to re-centre. ' +
        'Got ' + _describe(value) + '. Throw-or-apply: a malformed point is never silently ' +
        'reset and never silently clamped. (FAIL-LOUD.)');
}

/** @private — a short, honest rendering of whatever arrived. */
function _describe(v) {
    if (Array.isArray(v)) { return 'an array of length ' + v.length + ' (' + v.join(', ') + ')'; }
    if (v === null) { return 'null'; }
    if (typeof v === 'object') {
        var keys = [];
        for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) { keys.push(k); } }
        return 'an object {' + keys.join(', ') + '}';
    }
    return typeof v + ' ' + String(v);
}

/** @private */
function _finiteOrNull(v) {
    return (typeof v === 'number' && isFinite(v)) ? v : null;
}

/**
 * normalizePoint(value, fieldName) — the ONE point-shape gate.
 *
 * @param {object|Array|null|undefined} value — `{x,y,z?}`, `[x,y,z?]`, or null/undefined.
 * @param {string} fieldName — the pose key, for the message (e.g. 'target').
 * @returns {{x:number,y:number,z:number}|null} the canonical object form, or null for unset.
 * @throws {Error} one identical message under every provider on anything else.
 */
function normalizePoint(value, fieldName) {
    if (value === null || value === undefined) { return null; }
    var x, y, z;
    if (Array.isArray(value)) {
        // `[x, y]` and `[x, y, z]` only: a 1- or 4-tuple is a mistake, not a shorthand.
        if (value.length !== 2 && value.length !== 3) { _reject(fieldName, value); }
        x = _finiteOrNull(value[0]);
        y = _finiteOrNull(value[1]);
        z = (value.length === 3) ? _finiteOrNull(value[2]) : 0;
    } else if (typeof value === 'object') {
        x = _finiteOrNull(value.x);
        y = _finiteOrNull(value.y);
        z = (value.z === undefined || value.z === null) ? 0 : _finiteOrNull(value.z);
    } else {
        _reject(fieldName, value);
    }
    if (x === null || y === null || z === null) { _reject(fieldName, value); }
    return { x: x, y: y, z: z };
}

/**
 * normalizeOrbitPatch(patch) — normalize every point-valued field of a setOrbit patch.
 *
 * A patch is PARTIAL by contract (only the keys it mentions are applied), so a point field is
 * normalized only when the patch MENTIONS it — `'target' in patch` — which is what keeps an
 * explicit `target:null` (re-centre) distinguishable from an unmentioned target.
 *
 * @param {object} patch — a setOrbit spec.
 * @returns {object} a COPY with point fields in canonical object form; non-point keys verbatim.
 */
function normalizeOrbitPatch(patch) {
    if (!patch || typeof patch !== 'object') { return patch; }
    var out = {}, k;
    for (k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) { out[k] = patch[k]; }
    }
    for (var i = 0; i < POINT_FIELDS.length; i++) {
        var f = POINT_FIELDS[i];
        if (f in patch) { out[f] = normalizePoint(patch[f], f); }
    }
    return out;
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * makePoseNotice() → `{ add(fn) → unsubscribe, notify(bag) }` — the pose-change listener list a
 * camera handle publishes as `addPoseListener`. Listeners are provider-scoped (every handle the
 * provider returns shares one list), so a listener registered through one handle hears a write
 * made through another. `notify` iterates a SNAPSHOT (a listener may unsubscribe itself) and lets
 * a listener's throw propagate to the pose writer — a dependent that cannot follow the camera
 * fails loud at the write, never silently. A non-function listener THROWS at `add`.
 */
function makePoseNotice() {
    var listeners = [];
    return {
        add: function (fn) {
            if (typeof fn !== 'function') {
                throw new TypeError('[OrbitBag] addPoseListener(fn) needs a function, got ' +
                    String(fn) + '. (FAIL-LOUD.)');
            }
            if (listeners.indexOf(fn) === -1) { listeners.push(fn); }
            return function () {
                var i = listeners.indexOf(fn);
                if (i !== -1) { listeners.splice(i, 1); }
            };
        },
        notify: function (bag) {
            var ls = listeners.slice();
            for (var i = 0; i < ls.length; i++) { ls[i](bag); }
        }
    };
}

export {
    makePoseNotice,
    POINT_FIELDS,
    ANGULAR_FIELDS,
    normalizePoint,
    normalizeOrbitPatch,
    hasAngularPose
};
