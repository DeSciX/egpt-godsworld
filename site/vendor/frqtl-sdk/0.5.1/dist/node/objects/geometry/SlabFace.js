/* Copyright 2023-2026 by Essam Abadir */

/**
 * SlabFace.js — the SOLE face / OBB / convention authority for a rotated Wall slab.
 *
 * ## Why this file exists (the DRY crux — architect Gate-2 ruling, circulation §1)
 *
 * A Wall mirror's reflecting FACE is derived from its `orientationDeg` in what USED to be
 * three independent, hand-authored places, each re-writing the SAME "tall slab, y-DOWN
 * screen handedness" convention:
 *   1. the renderer draws the slab as `rect(-w/2,-h/2,w,h)` (h>w) rotated by +orientationDeg;
 *   2. `actionCompiler._buildReflectOps` baked `alphaScreen = (90 + orientationDeg) % 360`
 *      (the drawn-tall-face reflection line);
 *   3. the engine swept-OBB narrow-phase needs the slab's rotated collision region.
 *
 * A hand-mirrored sign in ANY of the three re-creates the off-face deflection bug the CEO
 * saw when rotating a mirror (the "1A/1D" class). This module is the ONE place the
 * convention is written: `orientationDeg (+ slab aspect, z-slab) → canonical face geometry`.
 * `_buildReflectOps` reads `reflectBaseDeg` from here; `Wall.compileWallV2` reads `obb` from
 * here for the engine `region` field. The renderer consumes the RAW `orientationDeg` (the
 * primary reference this convention is DEFINED to match — no second convention there).
 *
 * ## The convention (single authority — do not re-derive elsewhere)
 *
 * - **Drawn face.** The Wall mirror is a TALL slab (h > w). At orientation 0 its long face
 *   is VERTICAL — the line at 90° in the engine's y-DOWN velocity coordinates — so a +x beam
 *   bounces straight back (−x), exactly what the cardinal incidence tree does. p5/three draw
 *   the slab rotated by +orientationDeg, so the drawn face LINE sits at `(90 + orientationDeg)`.
 *   ⇒ `reflectBaseDeg = (90 + orientationDeg) % 360` — reflect about the line the user SEES.
 * - **OBB geometry (convention-FREE, the ONLY thing that crosses the ABI).** The engine
 *   deserializes `{ theta, hw, hh, hz }` and does a segment-vs-OBB test in ITS OWN coordinate
 *   frame (`region.rs`, `Obb::to_local` rotates world by −theta). The slab's local x-axis
 *   (thin, `hw = w/2`) and local y-axis (tall, `hh = h/2`) are world-rotated by +orientationDeg
 *   to match the drawn rect. ⇒ `theta = orientationDeg` (RADIANS). There is NO "90+" in the
 *   OBB — the reflection base and the OBB angle are DIFFERENT derived views of one input, and
 *   the raw `orientationDeg` NEVER crosses to the engine (storing it there = the convention-
 *   drift bug the circulation rejects).
 *
 * ## Cardinal gate (one threshold, shared with the reflect-law cardinal branch)
 *
 * `isCardinal` (orientationDeg ≡ 0 mod 90 within EPS) routes BOTH: (a) `_buildReflectOps` to
 * the axis-aligned incidence tree, and (b) the engine to the byte-identical AABB path
 * (`obb === null` ⇒ the sugar emits `region: null`). Aligning the two gates on one authority
 * means "is this cardinal" is answered ONCE. At a cardinal, `obb` is `null` (byte-identical,
 * SU1) — the region is the AABB and nothing rotated is ever sent.
 *
 * ## Layer 1 — API contract
 *
 * `resolveSlabFace({ cx, cy, w, h, orientationDeg, z, d }) → {`
 *   `isCardinal:     boolean,`   // orientationDeg ≡ 0 (mod 90) within EPS
 *   `reflectBaseDeg: number,`    // (90 + orientationDeg) % 360 — the value _buildReflectOps bakes
 *   `obb: {`                     // convention-RESOLVED geometry (null when isCardinal)
 *     `cx, cy, cz,`              // center (LO backing-frame center at collide time; JS-side/tests)
 *     `hw, hh, hz,`              // half-extents (w/2, h/2, d/2) — hz 0 for a 2D slab
 *     `theta,`                   // RADIANS, engine y-DOWN frame — the ONLY angle that crosses the ABI
 *     `faceDir: { x, y },`       // unit drawn-face LINE dir, ENGINE (y-down) frame = the reflect
 *                                //   law's invariant line (JS-side predicates; not on the ABI)
 *     `normal:  { x, y }`        // faceDir ⟂ (+90) = the axis R(reflectBaseDeg) FLIPS — the
 *                                //   tilted-reflect guard's crossing normal (sign conventional;
 *                                //   the guard is n→−n invariant). Not on the ABI.
 *   `} | null`
 * `}`
 *   @param {Object} spec
 *   @param {number} [spec.cx=0]  emission/collision center X (px) — the LO re-centered center.
 *   @param {number} [spec.cy=0]  center Y (px).
 *   @param {number} spec.w       slab width (px, physics). Thin axis for a tall mirror.
 *   @param {number} spec.h       slab height (px, physics). Long face axis for a tall mirror.
 *   @param {number} [spec.orientationDeg=0]  mirror SURFACE angle (deg). Normalized to [0,360).
 *   @param {number} [spec.z=0]   slab z-center (px) — 3D wall; 0 for 2D.
 *   @param {number} [spec.d=0]   slab z-depth (px) — 3D wall; 0/absent ⇒ hz 0 (2D passthrough).
 *   @param {number} [spec.pitchDeg=0]  up/down tilt about the plate's own long axis (deg,
 *     [-90,90]; 3D wall REQUIRED). ≠0 ⇒ the PITCHED result shape: `{ pitched:true, obb:null,
 *     plate3:{ n,u,v, hw,hh,hz, aabb } }` — the true 3-space plate basis; NO engine region
 *     (z-theta-only contract; the in-op guard is the narrow phase). 0/absent ⇒ byte-identical
 *     un-pitched behavior (this whole block is opt-in — CEO two-axis ruling 2026-07-26).
 *
 * ## Layer 2 — physics behavior
 * ZERO physics of its own (SU1). This is a pure geometry derivation consumed by the reflect
 * op-program (velocity RESPONSE) and the engine narrow-phase (collision MEMBERSHIP). Rotating
 * the mirror sweeps the drawn face; `reflectBaseDeg`/`theta` follow it so the bounce happens
 * AT the face the user sees and the collision REGION is that same rotated slab. A moved bench
 * golden would mean physics leaked into this convenience layer — the SU1 bug.
 */

'use strict';

(function () {

    var EPS = 1e-9;
    var DEG2RAD = Math.PI / 180;

    /**
     * Resolve a slab's face convention + OBB geometry from ONE input (orientationDeg).
     * See the file header for the full contract. Convention-free geometry only crosses
     * the ABI (theta + half-extents); the raw orientationDeg NEVER does.
     * @param {Object} spec
     * @returns {{ isCardinal: boolean, reflectBaseDeg: number, obb: Object|null }}
     */
    function resolveSlabFace(spec) {
        spec = spec || {};
        var w = +spec.w;
        var h = +spec.h;
        var o = (typeof spec.orientationDeg === 'number' && isFinite(spec.orientationDeg))
            ? spec.orientationDeg : 0;
        // ── PITCH (two-axis mirror, CEO ruling 2026-07-26) ─────────────────────────
        // `pitchDeg` rotates the plate about its OWN in-plane LONG axis (the drawn face
        // line), tipping the face normal out of the xy-plane: positive pitch tips the
        // normal toward +z. The TRUE 3-space plate basis:
        //   u  = (cos rb, sin rb, 0)                  — long axis (pitch rotation axis)
        //   n  = (n2.x·cos p, n2.y·cos p, sin p)      — face normal (the reflection axis)
        //   v  = u × n                                 — depth axis (pitched)
        // pitch 0 (or absent) is BYTE-IDENTICAL to the un-pitched contract (the z-axis
        // orientation law with vz passing through) — the pitched branch below is opt-in.
        // A pitched plate has NO engine ObbRegion (the region contract is z-theta-only):
        // callers emit region null and use the plate's 3D AABB as the broad phase; the
        // in-op guard (actionCompiler) is the narrow phase. Engine two-angle OBB is a
        // flagged Gate-1 follow-up.
        var p = (typeof spec.pitchDeg === 'number' && isFinite(spec.pitchDeg)) ? spec.pitchDeg : 0;
        if (Math.abs(p) > EPS) {
            if (p < -90 || p > 90) {
                throw new Error('[SlabFace] pitchDeg must be within [-90, 90]; got ' + p);
            }
            var dP = (typeof spec.d === 'number' && isFinite(spec.d) && spec.d > 0) ? spec.d : 0;
            if (!(dP > 0)) {
                throw new Error('[SlabFace] a PITCHED plate requires a real z-depth (3D wall) — ' +
                    'pitchDeg ' + p + ' with d=' + spec.d + '. Give the wall a z/depth first.');
            }
            var onormP = ((o % 360) + 360) % 360;
            var rbP = (90 + onormP) % 360;
            var gP = rbP * DEG2RAD;
            var prad = p * DEG2RAD;
            var u3 = { x: Math.cos(gP), y: Math.sin(gP), z: 0 };
            var n2p = { x: -Math.sin(gP), y: Math.cos(gP) };
            var n3 = { x: n2p.x * Math.cos(prad), y: n2p.y * Math.cos(prad), z: Math.sin(prad) };
            var v3 = {   // u × n
                x: u3.y * n3.z - u3.z * n3.y,
                y: u3.z * n3.x - u3.x * n3.z,
                z: u3.x * n3.y - u3.y * n3.x
            };
            var hwP = w / 2, hhP = h / 2, hzP = dP / 2;
            var cxP = (typeof spec.cx === 'number' && isFinite(spec.cx)) ? spec.cx : 0;
            var cyP = (typeof spec.cy === 'number' && isFinite(spec.cy)) ? spec.cy : 0;
            var czP = (typeof spec.z === 'number' && isFinite(spec.z)) ? spec.z : 0;
            return {
                isCardinal: false,
                pitched: true,
                reflectBaseDeg: rbP,
                obb: null,     // NO engine region for a pitched plate (z-theta-only contract)
                plate3: {
                    cx: cxP, cy: cyP, cz: czP,
                    n: n3, u: u3, v: v3,
                    hw: hwP, hh: hhP, hz: hzP,
                    // World-axis-aligned half-extents of the pitched plate (the broad-phase
                    // superset box — the ONE place these are derived).
                    aabb: {
                        hx: Math.abs(n3.x) * hwP + Math.abs(u3.x) * hhP + Math.abs(v3.x) * hzP,
                        hy: Math.abs(n3.y) * hwP + Math.abs(u3.y) * hhP + Math.abs(v3.y) * hzP,
                        hz: Math.abs(n3.z) * hwP + Math.abs(u3.z) * hhP + Math.abs(v3.z) * hzP
                    }
                }
            };
        }
        // Normalize to [0,360) so 315, −45, 675 all collapse to their canonical residue —
        // the SAME normalization _buildReflectOps used (`((o % 360) + 360) % 360`), so the
        // repoint is byte-identical.
        var onorm = ((o % 360) + 360) % 360;
        var mod90 = onorm % 90;
        var isCardinal = (mod90 < EPS) || ((90 - mod90) < EPS);

        // reflectBaseDeg = the drawn TALL-face line angle in the engine y-DOWN frame.
        // Identical to the value the pre-repoint _buildReflectOps baked as `alphaScreen`.
        var reflectBaseDeg = (90 + onorm) % 360;

        var obb = null;
        if (!isCardinal) {
            var cx = (typeof spec.cx === 'number' && isFinite(spec.cx)) ? spec.cx : 0;
            var cy = (typeof spec.cy === 'number' && isFinite(spec.cy)) ? spec.cy : 0;
            var cz = (typeof spec.z === 'number' && isFinite(spec.z)) ? spec.z : 0;
            var d = (typeof spec.d === 'number' && isFinite(spec.d) && spec.d > 0) ? spec.d : 0;
            // theta = the slab's OWN rotation (matches the drawn rect rotated +orientationDeg).
            // NOT reflectBaseDeg — the OBB is the geometric slab, the reflect base is the face
            // LINE. Both are pure functions of the same onorm; neither is a second source.
            var theta = onorm * DEG2RAD;
            // Auxiliary face vectors (JS-side predicates / guards / tests — do NOT cross the
            // ABI), in the ENGINE frame (y-DOWN screen coords — the frame frame.x/y/vx/vy and
            // the reflect law's algebra live in):
            //   faceDir = (cos rb, sin rb)  — the drawn long-face LINE direction. This is BOTH
            //     (a) the p5-drawn long axis (local (0,1) rotated +orientationDeg in screen
            //         coords: (−sin o, cos o) ≡ (cos(90+o), sin(90+o))), and
            //     (b) the +1-eigenvector (invariant line) of the reflect law R(reflectBaseDeg)
            //         = [cos2α sin2α; sin2α −cos2α] that `_buildReflectOps` bakes.
            //   normal  = (−sin rb, cos rb) — faceDir rotated +90 in the same algebra: the
            //     −1-eigenvector R actually FLIPS, i.e. the crossing normal the tilted-reflect
            //     guard trigger tests against. Its overall SIGN is conventional (the guard is
            //     invariant under n → −n: flipping n flips both s(P) and v·n, and the guard
            //     only reads their products).
            // One frame, one convention: drawn face ≡ reflect-law invariant line ≡ guard line.
            // (A y-flipped variant here is the exact hand-mirrored-sign bug circulation §1 bans.)
            var g = reflectBaseDeg * DEG2RAD;
            var faceDir = { x: Math.cos(g), y: Math.sin(g) };
            var normal = { x: -faceDir.y, y: faceDir.x };
            obb = {
                cx: cx, cy: cy, cz: cz,
                hw: w / 2, hh: h / 2, hz: d / 2,
                theta: theta,
                faceDir: faceDir,
                normal: normal
            };
        }

        return { isCardinal: isCardinal, reflectBaseDeg: reflectBaseDeg, obb: obb };
    }

    /**
     * Extract the CONVENTION-FREE, center-less engine `region` field from a resolved obb.
     * The engine re-centers the LO's rect on its backing frame every tick, so the stored
     * region carries NO center (a stored center would go stale) — only `{ kind, theta, hw,
     * hh, hz }`. Returns `null` when there is no obb (cardinal ⇒ the AABB path). This is the
     * ONE adapter from SlabFace geometry to the `LargeObject.region` schema field / ABI.
     * @param {Object|null} obb — the `.obb` from resolveSlabFace (or null).
     * @returns {{ kind: 'obb', theta: number, hw: number, hh: number, hz: number }|null}
     */
    function regionFromObb(obb) {
        if (!obb) { return null; }
        return { kind: 'obb', theta: obb.theta, hw: obb.hw, hh: obb.hh, hz: obb.hz };
    }

    /**
     * BROAD-PHASE SUPERSET (CEO/architect MIRROR ruling, 2026-07-25 — the sugar-half
     * broad-phase-rect flag closed here). The engine's spatial index is an AABB broad
     * phase over the LO's registered rect (`octree.rs`); a tilted TALL slab's raw
     * un-rotated rect is NARROWER in x than the rotated slab, so a beam aimed at the
     * face TIP (outside the raw rect, inside the true rotated slab) is never a broad-
     * phase candidate and never collides. FIX (superset discipline): the LO's broad-
     * phase rect for a tilted wall = the ROTATED slab's AXIS-ALIGNED bounding box; the
     * OBB `region` (narrow phase) is UNCHANGED and culls the AABB corners back out. This
     * is the ONE place the rotated-AABB half-extents are derived (Wall never hand-derives
     * them) — the SAME `theta` the region/reflect law already share, so no second
     * convention. Returns half-extents (the LO rect stays center-symmetric about the
     * slab center, which rotation preserves). z is NOT rotated by the xy-plane OBB, so
     * the z half-extent passes through as `hz`.
     *   aabbHx = hw·|cos θ| + hh·|sin θ|   (x reach of the rotated w×h slab)
     *   aabbHy = hw·|sin θ| + hh·|cos θ|   (y reach)
     *   aabbHz = hz                        (z-slab depth is orientation-independent)
     * @param {Object|null} obb — the `.obb` from resolveSlabFace (or null → null, the
     *   cardinal/AABB path: broad-phase rect stays the raw rect, byte-identical SU1).
     * @returns {{ hx: number, hy: number, hz: number }|null}
     */
    function aabbHalfExtentsFromObb(obb) {
        if (!obb) { return null; }
        var c = Math.abs(Math.cos(obb.theta));
        var s = Math.abs(Math.sin(obb.theta));
        return {
            hx: obb.hw * c + obb.hh * s,
            hy: obb.hw * s + obb.hh * c,
            hz: obb.hz
        };
    }

    // ── Export (dual: Node module + browser global) ─────────────────────────────
    var api = {
        resolveSlabFace: resolveSlabFace,
        regionFromObb: regionFromObb,
        aabbHalfExtentsFromObb: aabbHalfExtentsFromObb
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        window.SlabFace = api;
        window.resolveSlabFace = resolveSlabFace;
    }

})();
