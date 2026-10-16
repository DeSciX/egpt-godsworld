/* Copyright 2023-2026 by Essam Abadir */

/**
 * lo-drawn-center.js — THE authority for where a LargeObject rect is DRAWN: its center point.
 *
 * Peer of `orbit-bag.js`: a shared contract-half with no geometry of its own beyond one rule, so
 * the fact has ONE owner. Its consumers are the three.js provider (it places each LO mesh at this
 * point and paints the shadow-surround from its volume) and `FrqtlApp` (the 3D mouse pick aims
 * at the centre; the aim ray tests the volume). Two
 * derivations of the one fact is the drift this file exists to make impossible — a pick aimed at
 * a different point than the mesh is drawn at selects the wrong object silently.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 *
 * An LO rect is corner-mode (`left`/`top` are the near corner, never a center — the LargeObject
 * convention). A 6-element rect (`{left, top, z, w, h, d}`) also carries `z`, the NEAR-face corner
 * on the z axis, so its z-center is `z + d/2`, with `d` defaulting to `w` exactly as the engine's
 * z-capable rectangle does. A legacy 4-element rect has no `z`: it sits at z-center 0.
 *
 *   drawnCenter(rect) → [left + w/2, top + h/2, (z present) ? z + (d ?? w)/2 : 0]
 *   hasZ(rect)        → whether the rect carries z — the ONE z-presence test (consumers never re-derive it)
 *
 * Its INVERSE places the same-sized rect at a centre (a grabbed wall carried by the camera):
 *
 *   rectAtCenter(rect, [cx, cy, cz]) → the WRITE-wire array, the rect's own form:
 *     z present → [cx − w/2, cy − h/2, cz − D/2, w, h, D] with D = d ?? w STATED (so the written
 *                 rect reads back through drawnCenter to the centre it was placed at);
 *     z absent  → [cx − w/2, cy − h/2, w, h], and cz must be 0 — a z-less rect sits at z-centre
 *                 0 by the rule above, so any other cz THROWS rather than being dropped.
 *
 * ── The drawn VOLUME and the center-ray hit (STUDIO's aim) ──────────────────────
 *
 * The same rect also owns the VOLUME the aim ray tests and the shadow-surround paints, so the
 * thing you aim at, the thing that lights up and the mesh are one geometry:
 *
 *   drawnVolume({rect, orientationDeg?, pitchDeg?}) → a BOX: centre = drawnCenter(rect), half
 *     extents [w/2, h/2, D/2] with D = the rect's z-extent (d ?? w when z is present — the same
 *     default the centre uses — else 0, a flat legacy rect), turned by the shell's own rotation
 *     (yaw about world z, then pitch about the plate's own long axis: Rz(yaw)·Ry(pitch), the
 *     renderer's 'ZYX' order).
 *   drawnVolume({center, radius}) → a SPHERE (a centre-only target, e.g. an emitter).
 *   rayIntersect(origin, dir, volume, margin?) → the ENTRY ray parameter t ≥ 0 (0 when the
 *     origin is inside), or null for a miss / a volume wholly behind the origin. `margin`
 *     inflates the volume on every side first, so a thin wall is aimable.
 *   firstHit(origin, dir, volumes, margin?) → {index, t} | null — THE hover rule: the nearest
 *     entry wins, except that a smaller volume whose entry point lies inside the winner's
 *     (a volume nested in another along the ray) wins over it.
 *   volumeContains(volume, point, margin?) — the containment test firstHit uses.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This reads a rect the engine already published; it moves no frame and no LO.
 *
 * Classic-script module: `window.LoDrawnCenter` in the browser, `module.exports` in Node — the
 * same dual publication as every other shared contract-half in this directory.
 */

(function () {
'use strict';

/**
 * hasZ(rect) — whether the rect carries a z (a z-capable / 6-element rect). THE one z-presence test
 * every consumer asks (the carry's flat/z-held rule, a part's 6-on-flat refusal), never re-derived.
 * @param {{z?:number}} rect @returns {boolean}
 */
function hasZ(rect) {
    return typeof rect.z === 'number';
}

/**
 * @param {{left:number, top:number, w:number, h:number, z?:number, d?:number}} rect
 * @returns {number[]} `[cx, cy, cz]` — the center the renderer draws the rect's box at.
 */
function drawnCenter(rect) {
    var cz = hasZ(rect)
        ? rect.z + ((typeof rect.d === 'number') ? rect.d : rect.w) / 2
        : 0;
    return [rect.left + rect.w / 2, rect.top + rect.h / 2, cz];
}

/**
 * @param {{left:number, top:number, w:number, h:number, z?:number, d?:number}} rect — the rect
 *   being placed (its w/h and z-extent are kept).
 * @param {number[]} center — `[cx, cy, cz]` (cz may be omitted for a z-less rect).
 * @returns {number[]} the write-wire array `[l, t, z, w, h, d]` (z present) or `[l, t, w, h]`.
 */
function rectAtCenter(rect, center) {
    var cz = (typeof center[2] === 'number') ? center[2] : 0;
    if (hasZ(rect)) {
        var D = _zExtent(rect);
        return [center[0] - rect.w / 2, center[1] - rect.h / 2, cz - D / 2, rect.w, rect.h, D];
    }
    if (cz !== 0) {
        throw new RangeError('[LoDrawnCenter.rectAtCenter] a z-less rect sits at z-centre 0 and cannot ' +
            'be placed at z = ' + cz + ' — place it at cz 0, or give the rect an explicit z. (FAIL-LOUD.)');
    }
    return [center[0] - rect.w / 2, center[1] - rect.h / 2, rect.w, rect.h];
}

var DEG = Math.PI / 180;

/** The rect's z-extent: d ?? w when it carries z (the engine's z-capable rectangle), else 0. */
function _zExtent(rect) {
    if (!hasZ(rect)) { return 0; }
    return (typeof rect.d === 'number') ? rect.d : rect.w;
}

/**
 * @param {{rect:object, orientationDeg?:number, pitchDeg?:number}|{center:number[], radius:number}} src
 * @returns {{kind:'box', center:number[], half:number[], yawDeg:number, pitchDeg:number}
 *          |{kind:'sphere', center:number[], radius:number}}
 */
function drawnVolume(src) {
    if (src && src.rect) {
        var r = src.rect;
        return {
            kind: 'box',
            center: drawnCenter(r),
            half: [r.w / 2, r.h / 2, _zExtent(r) / 2],
            yawDeg: (typeof src.orientationDeg === 'number') ? src.orientationDeg : 0,
            pitchDeg: (typeof src.pitchDeg === 'number') ? src.pitchDeg : 0
        };
    }
    if (src && Array.isArray(src.center) && typeof src.radius === 'number') {
        var c = src.center;
        return { kind: 'sphere', center: [c[0], c[1], (typeof c[2] === 'number') ? c[2] : 0], radius: src.radius };
    }
    throw new TypeError('[LoDrawnCenter.drawnVolume] needs {rect} (an LO) or {center, radius} (a ' +
        'centre-only target); got ' + JSON.stringify(src) + '. (FAIL-LOUD.)');
}

/** A world vector expressed in the box's local frame: Rᵀ·v with R = Rz(yaw)·Ry(pitch). */
function _toLocal(box, v) {
    var a = box.yawDeg * DEG, b = box.pitchDeg * DEG;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    return [
        ca * cb * v[0] + sa * cb * v[1] - sb * v[2],
        -sa * v[0] + ca * v[1],
        ca * sb * v[0] + sa * sb * v[1] + cb * v[2]
    ];
}

function _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

/**
 * @param {number[]} origin @param {number[]} dir (need not be unit; t is in units of |dir|)
 * @param {object} volume — a drawnVolume result. @param {number} [margin=0] world px.
 * @returns {number|null}
 */
function rayIntersect(origin, dir, volume, margin) {
    var m = (typeof margin === 'number') ? margin : 0;
    if (volume.kind === 'sphere') {
        var R = volume.radius + m;
        var oc = _sub(origin, volume.center);
        var A = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
        var B = 2 * (oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2]);
        var C = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - R * R;
        var disc = B * B - 4 * A * C;
        if (!(A > 0) || disc < 0) { return null; }
        var sq = Math.sqrt(disc);
        var t0 = (-B - sq) / (2 * A), t1 = (-B + sq) / (2 * A);
        if (t1 < 0) { return null; }
        return (t0 > 0) ? t0 : 0;
    }
    if (volume.kind === 'box') {
        var o = _toLocal(volume, _sub(origin, volume.center));
        var d = _toLocal(volume, dir);
        var tNear = -Infinity, tFar = Infinity;
        for (var i = 0; i < 3; i++) {
            var h = volume.half[i] + m;
            if (Math.abs(d[i]) < 1e-12) {
                if (o[i] < -h || o[i] > h) { return null; }   // parallel to this slab, outside it
                continue;
            }
            var ta = (-h - o[i]) / d[i], tb = (h - o[i]) / d[i];
            if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
            if (ta > tNear) { tNear = ta; }
            if (tb < tFar) { tFar = tb; }
            if (tNear > tFar) { return null; }
        }
        if (tFar < 0) { return null; }
        return (tNear > 0) ? tNear : 0;
    }
    throw new TypeError('[LoDrawnCenter.rayIntersect] unknown volume kind ' + String(volume && volume.kind) +
        ' — volumes come from drawnVolume(). (FAIL-LOUD.)');
}

/** Whether `point` lies inside `volume` (inflated by `margin`). */
function volumeContains(volume, point, margin) {
    var m = (typeof margin === 'number') ? margin : 0;
    var p = _sub(point, volume.center);
    if (volume.kind === 'sphere') {
        var R = volume.radius + m;
        return p[0] * p[0] + p[1] * p[1] + p[2] * p[2] <= R * R + 1e-9;
    }
    var l = _toLocal(volume, p);
    for (var i = 0; i < 3; i++) { if (Math.abs(l[i]) > volume.half[i] + m + 1e-9) { return false; } }
    return true;
}

/** The inflated volume's size — the nested-volume tie-break compares it. */
function _size(volume, m) {
    if (volume.kind === 'sphere') { var R = volume.radius + m; return R * R * R * 4.18879; }
    return 8 * (volume.half[0] + m) * (volume.half[1] + m) * (volume.half[2] + m);
}

/**
 * @param {number[]} origin @param {number[]} dir @param {object[]} volumes @param {number} [margin=0]
 * @returns {{index:number, t:number}|null}
 */
function firstHit(origin, dir, volumes, margin) {
    var m = (typeof margin === 'number') ? margin : 0;
    var hits = [];
    for (var i = 0; i < volumes.length; i++) {
        var t = rayIntersect(origin, dir, volumes[i], m);
        if (t !== null) { hits.push({ index: i, t: t }); }
    }
    if (!hits.length) { return null; }
    hits.sort(function (a, b) { return a.t - b.t; });
    var best = hits[0];
    for (var k = 1; k < hits.length; k++) {
        var h = hits[k], vb = volumes[best.index], vh = volumes[h.index];
        var entry = [origin[0] + dir[0] * h.t, origin[1] + dir[1] * h.t, origin[2] + dir[2] * h.t];
        if (volumeContains(vb, entry, m) && _size(vh, m) < _size(vb, m)) { best = h; }
    }
    return best;
}

var LoDrawnCenter = {
    drawnCenter: drawnCenter,
    rectAtCenter: rectAtCenter,
    hasZ: hasZ,
    drawnVolume: drawnVolume,
    rayIntersect: rayIntersect,
    volumeContains: volumeContains,
    firstHit: firstHit
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoDrawnCenter;
} else if (typeof window !== 'undefined') {
    window.LoDrawnCenter = LoDrawnCenter;
}

})();
