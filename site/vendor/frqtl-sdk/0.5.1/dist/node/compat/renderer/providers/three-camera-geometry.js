/* Copyright 2023-2026 by Essam Abadir */

/**
 * three-camera-geometry.js — the three.js camera's PURE GEOMETRY authority: the
 * orbit bag ⇄ camera basis maps, the screen-relative rotation/translation
 * primitives, and the analytic pinhole-camera ray math.
 *
 * ## Why this is its own file
 *
 * It is the pure half of the camera authority: plain functions of an orbit bag
 * and a scene size, returning plain `{x,y,z}` data, with no THREE, no WebGL and
 * no live provider state. `three-provider.js` (the live half) resolves it and
 * every camera surface it exposes — `_applyOrbit`, `screenToWorld`,
 * `getCameraControl()`'s `setOrbit`/`look`/`move`/carry methods — is a THIN
 * wrapper over the functions below. **All camera geometry lives HERE**: the
 * provider positions a camera, it does not re-derive a basis, and no widget or
 * host above it does either.
 *
 * Its sibling `three-camera-contract.js` is the DECLARATIVE half (the preset
 * table + the pose-axis field descriptors). Three files, one camera: declarative
 * contract / pure geometry / live renderer.
 *
 * Keeping geometry separate also holds `three-provider.js` under the per-file
 * size ceiling that `sdk/frqtl-sdk/scripts/verify-publish-surface.mjs` enforces
 * on the copied-verbatim dist directories — that gate's own instruction is to
 * SPLIT at a natural seam rather than raise the ceiling, and "pure orbit
 * geometry vs live renderer" is that seam.
 *
 * ## The orbit bag
 *
 *   `{ azimuth, elevation, distance, roll, target }`
 *
 * Generalized coordinates, all angles in DEGREES, `distance` in ENGINE PIXELS:
 *   - `azimuth`   — orbit angle around the world vertical.
 *   - `elevation` — orbit angle above (+) / below (−) the horizontal, |el| ≤ 90.
 *   - `distance`  — how far the eye sits from the orbit centre.
 *   - `roll`      — rotation about the VIEW AXIS (the horizon tilt). WRAPS
 *                   (mod 360); it has no pole, so it is never clamped.
 *   - `target`    — the point the orbit revolves around, or `null` = the scene
 *                   centre (`orbitCenter` is the ONE resolver).
 *
 * The bag is BOTH the declarative contract (a rung's stored camera, a saved
 * project, a drone waypoint) and the provider's stored state. The camera's
 * up-VECTOR is never stored — it is DERIVED as `orbitCameraBasis().up`. The bag
 * carries the free coordinate; the geometry derives the vector.
 *
 * ## The two maps (compose ⇄ decompose)
 *
 *   `orbitCameraBasis(bag, w, h)` → `{pos, forward, right, up}`   — compose
 *   `decomposeOrbitBasis(basis)`  → `{azimuth, elevation, roll}`  — decompose
 *
 * They are exact adjoints (see `decomposeOrbitBasis`'s own docstring for the
 * pole convention), which is what lets `rotateOrbit` express an INTERACTIVE,
 * screen-relative rotation (a LOOK drag) as: compose → rotate the orthonormal
 * frame → decompose back to the bag. Azimuth is therefore an OUTPUT on the
 * interactive path while remaining a writable coordinate on the declarative one
 * — the same coordinate, two directions through the same adjoint pair.
 *
 * ## Node
 *
 * Dual export (`module.exports`), so every function here is testable in plain
 * Node with no THREE instance — see `providers/test/camera-roll-geometry.test.mjs`,
 * `camera-carry.test.mjs`, `screen-to-world.test.mjs`.
 *
 * ## Load order (browser)
 *
 * A classic script published as `window.ThreeCameraGeometry`, listed in
 * `lib/shim/engine/renderer-layer-manifest.js` BEFORE `three-provider.js`. The
 * provider resolves it FAIL-LOUD at call time (never a silent fallback), so a
 * missing script names itself instead of yielding a camera with no geometry.
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention) — classic scripts share
//    ONE global lexical environment, so everything below is private; only the
//    explicit module.exports / window.ThreeCameraGeometry assignment at the
//    bottom reaches the shared scope. Enforced by
//    lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

    // ── Constants ───────────────────────────────────────────────────────────

    /** The ONE vertical-FOV constant (degrees). `three-provider.js`'s `_init`
     *  constructs `new THREE.PerspectiveCamera(...)` with THIS — never a second
     *  literal `50` — so the analytic ray math below and the live camera share
     *  one frustum by construction. */
    var CAMERA_FOV_DEG = 50;

    /** Ray/plane ANGLE guard (`dir.z` IS a cosine for a unit `dir`): reject any
     *  ray within ~2.9° of parallel-to-the-plane, never just "exactly" parallel.
     *  See `intersectRayWithZPlane` for the regression this closes. */
    var MIN_RAY_PLANE_COS  = 0.05;
    /** Reject an unprojected result beyond 20× the scene's own width/height. */
    var SANITY_EXTENT_FACTOR = 20;

    /**
     * The FIXED world-up HINT the orbit basis is built from — physics y-DOWN, so
     * it matches the render camera's own `up` before any roll. It appears in
     * EXACTLY ONE place in the repo (here): `orbitCameraBasis` is the sole
     * consumer, and every other camera surface (the live `_applyOrbit`, MOVE
     * strafe, `screenToWorld`, the carry pin, `rayDirForNdc`) consumes the BASIS
     * this produces. Three hand-copies of this hint used to exist — the roll
     * capability is exactly what a fourth would have broken, since a rolled
     * picture with an UNROLLED strafe/drag/carry basis is the schema-mirror
     * failure signature (one datum, two enumerations, breaks in one consumer).
     */
    var UP_HINT = { x: 0, y: -1, z: 0 };

    /**
     * Pole band (dimensionless): |cos(elevation)| below this and the
     * (azimuth, roll) split is a GAUGE — see `decomposeOrbitBasis`. Both the
     * compose and the decompose branch on the SAME quantity with the SAME
     * threshold, which is what makes the round trip exact at the pole.
     */
    var POLE_EPS = 1e-9;

    var DEG = Math.PI / 180;
    var RAD = 180 / Math.PI;

    // ── Small vector helpers (private) ──────────────────────────────────────

    function _cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }
    function _dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    function _norm(v) {
        var l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
        return { x: v.x / l, y: v.y / l, z: v.z / l };
    }
    /** Rodrigues rotation of `v` about the UNIT axis `k` by `rad`. */
    function _rotateAbout(v, k, rad) {
        var c = Math.cos(rad), s = Math.sin(rad);
        var kxv = _cross(k, v);
        var kdv = _dot(k, v) * (1 - c);
        return {
            x: v.x * c + kxv.x * s + k.x * kdv,
            y: v.y * c + kxv.y * s + k.y * kdv,
            z: v.z * c + kxv.z * s + k.z * kdv
        };
    }
    /** Wrap an angle to (-180, 180] — roll and azimuth WRAP, they never clamp. */
    function _wrapDeg(d) {
        var w = ((d + 180) % 360 + 360) % 360 - 180;
        return (w === -180) ? 180 : w;
    }

    // ── The orbit centre ────────────────────────────────────────────────────

    /**
     * The ONE resolver for the point the orbit revolves around (and the camera
     * looks at). Default = the scene centre `(width/2, height/2, 0)`; an orbit
     * carrying a `target:{x,y,z}` (set by `move()` — the FPS walk) revolves
     * around THAT instead. Every consumer of the camera geometry —
     * `orbitCameraBasis`, and through it `screenToWorld` and the carry
     * transforms — resolves the centre HERE, so a walked camera keeps
     * click-to-place and carry registered instead of silently desyncing.
     */
    function _orbitCenter(orbit, width, height) {
        var t = orbit && orbit.target;
        if (t && typeof t.x === 'number' && typeof t.y === 'number' && typeof t.z === 'number') {
            return { x: t.x, y: t.y, z: t.z };
        }
        return { x: width / 2, y: height / 2, z: 0 };
    }

    // ── COMPOSE: bag → camera position + orthonormal basis ──────────────────

    /**
     * Camera position + orthonormal basis (forward/right/up) for the given orbit
     * bag, around the orbit's resolved centre (`_orbitCenter` — the scene centre,
     * or a walked `target`). This is the EXACT geometry `three-provider.js`'s
     * `_applyOrbit` positions the live THREE camera with, and the ONE camera
     * authority every other surface consumes.
     *
     * `pos = centre − distance · forward` exactly, so a ROLL (a rotation about
     * `forward`) never moves the eye and never changes the radius — a LOOK is
     * fixed-radius by construction, and only MOVE translates.
     *
     * Basis convention: `right`/`up` ARE screen-right/screen-up by construction,
     * because they are derived from the SAME `UP_HINT` the render camera's own
     * `up` comes from (see UP_HINT). At the default pose (az=0, el=0, roll=0):
     * `forward = (0,0,-1)` INTO the screen (viewer on +z), `right = (-1,0,0)`
     * = world −x = SCREEN-RIGHT, `up = (0,-1,0)` = world −y = physics-UP =
     * SCREEN-UP. That is what makes `screenToWorld`, the MOVE strafe, the carry
     * pin and the drive change-of-basis screen-consistent regardless of the
     * world-axis SIGN convention.
     *
     * ROLL enters HERE and nowhere else: after `right`/`up` are built from the
     * fixed hint, both are rotated about `forward` by `roll` (right-handed about
     * `forward`), which on screen spins the PICTURE counter-clockwise for a
     * positive roll. `forward` is untouched, so roll changes the horizon tilt and
     * nothing else.
     *
     * TOTAL at the poles: at |elevation| = 90 the hint is parallel to `forward`
     * and the cross product vanishes, so the unrolled `right` is taken as the
     * analytic LIMIT of the off-pole formula, `(−cos az, 0, sin az)`. Pitching
     * over the top is therefore legal and continuous — no clamp, no NaN basis.
     *
     * @param {{azimuth:number,elevation:number,distance:number,roll?:number,target?:object}} orbit
     * @param {number} width  scene width in engine pixels
     * @param {number} height scene height in engine pixels
     * @returns {{pos:{x,y,z}, forward:{x,y,z}, right:{x,y,z}, up:{x,y,z}}}
     */
    function _orbitCameraBasis(orbit, width, height) {
        var _c = _orbitCenter(orbit, width, height);
        var cx = _c.x, cy = _c.y, cz = _c.z;
        var az = orbit.azimuth   * DEG;
        var el = orbit.elevation * DEG;
        var d  = orbit.distance;
        var cosEl = Math.cos(el), sinEl = Math.sin(el);
        var pos = {
            x: cx + d * cosEl * Math.sin(az),
            y: cy + d * sinEl,
            z: cz + d * cosEl * Math.cos(az)
        };
        // forward = normalize(centre - pos) = -(cosEl sinAz, sinEl, cosEl cosAz)
        var forward = { x: -cosEl * Math.sin(az), y: -sinEl, z: -cosEl * Math.cos(az) };

        // Unrolled screen-right = normalize(forward × UP_HINT). |forward × UP_HINT|
        // is exactly |cosEl|, so the pole test below is the SAME quantity (and the
        // SAME POLE_EPS) `decomposeOrbitBasis` branches on — that is what makes the
        // two exact adjoints at the pole as well as away from it.
        var right;
        if (Math.abs(cosEl) < POLE_EPS) {
            // POLE: the analytic limit of normalize(forward × UP_HINT) as el → ±90.
            //
            // DEFENSIVE GUARD, deliberately not a behavioural gate. `Math.cos` never
            // returns exactly 0 for a double (cos(90°) is ~6.1e-17), so the generic
            // branch below already normalizes cleanly at the pole and produces this
            // very vector — verified by mutation: disabling this branch moves NO test.
            // It exists so that a genuinely zero cross product could never reach
            // `_norm`'s `|| 1` fallback and yield a SILENT zero basis vector, which is
            // the one failure mode here that would not announce itself. If you are
            // hunting for the test that covers this line: there isn't one, and that is
            // recorded on purpose rather than papered over with a vacuous assertion.
            right = { x: -Math.cos(az), y: 0, z: Math.sin(az) };
        } else {
            right = _norm(_cross(forward, UP_HINT));
        }
        var up = _cross(right, forward);

        var rollDeg = (typeof orbit.roll === 'number') ? orbit.roll : 0;
        if (rollDeg) {
            var r = rollDeg * DEG;
            right = _rotateAbout(right, forward, r);
            up    = _rotateAbout(up,    forward, r);
        }
        return { pos: pos, forward: forward, right: right, up: up };
    }

    // ── DECOMPOSE: camera basis → bag angles (the exported adjoint) ──────────

    /**
     * The adjoint of `_orbitCameraBasis`: recover `{azimuth, elevation, roll}`
     * (degrees) from an orthonormal camera basis. Colocated with its inverse on
     * purpose — a decomposition that drifts from the composition is the whole
     * bug class this pair exists to prevent.
     *
     * `distance` and `target` are NOT recovered: a rotation about the eye or the
     * centre changes neither, so `rotateOrbit` carries them through untouched.
     *
     *   elevation = asin(−forward.y)                      (always in [−90, 90])
     *   azimuth   = atan2(−forward.x, −forward.z)
     *   roll      = the signed angle from the UNROLLED right/up frame to the
     *               basis's own right, measured about `forward`.
     *
     * Because elevation is always returned in [−90, 90], pitching OVER the pole
     * re-charts automatically as the coordinated (azimuth+180, elevation
     * reflected, roll+180) transition — the ORIENTATION is continuous; only its
     * coordinates change chart. This is what makes "any view can be achieved"
     * true without an elevation clamp anywhere.
     *
     * ## Pole convention (documented, STATELESS, total — and it never throws)
     *
     * Inside the band |cos(elevation)| < POLE_EPS the (azimuth, roll) split is
     * ill-conditioned — but the ill-conditioned direction IS the gauge direction:
     * `(az+δ, roll+δ)` composes to the SAME orientation. So the APPLIED VIEW is
     * stable to floating-point epsilon straight through the pole; only the
     * REPORTED azimuth/roll numbers may jump along the gauge.
     *
     * The gauge is fixed statelessly: **roll := 0, and azimuth absorbs the whole
     * screen-spin**, read off `right`'s horizontal projection —
     * `azimuth = atan2(right.z, −right.x)`. That is exactly the off-pole formula's
     * own limit at roll = 0, so the convention is continuous with the generic
     * branch rather than an arbitrary snap, and `_orbitCameraBasis` composes it
     * back exactly (its pole branch uses the same limit).
     *
     * A chart singularity is not a contract violation and a throw mid-drag is a
     * grenade, so this function is TOTAL and never throws. FAIL-LOUD lives at the
     * INPUTS instead: `setOrbit` / `look` / `move` reject non-finite values.
     *
     * @param {{forward:{x,y,z}, right:{x,y,z}, up:{x,y,z}}} basis
     * @returns {{azimuth:number, elevation:number, roll:number}} degrees
     */
    function _decomposeOrbitBasis(basis) {
        var f = basis.forward, rt = basis.right;
        var sinEl = -f.y;
        if (sinEl >  1) { sinEl =  1; }
        if (sinEl < -1) { sinEl = -1; }
        var elevation = Math.asin(sinEl) * RAD;
        var horiz = Math.sqrt(f.x * f.x + f.z * f.z);   // = |cos(elevation)|

        if (horiz < POLE_EPS) {
            // POLE: gauge-fixed — roll 0, azimuth carries the screen-spin.
            return {
                azimuth: _wrapDeg(Math.atan2(rt.z, -rt.x) * RAD),
                elevation: elevation,
                roll: 0
            };
        }

        var azimuth = Math.atan2(-f.x, -f.z) * RAD;
        // The UNROLLED reference frame at this (azimuth, elevation).
        var right0 = _norm(_cross(f, UP_HINT));
        var up0    = _cross(right0, f);
        // right = cos(roll)·right0 − sin(roll)·up0   (right-handed about forward)
        var roll = Math.atan2(-_dot(rt, up0), _dot(rt, right0)) * RAD;
        return { azimuth: _wrapDeg(azimuth), elevation: elevation, roll: _wrapDeg(roll) };
    }

    // ── The interactive rotation: compose → rotate → decompose ──────────────

    /**
     * `rotateOrbit(bag, {spin, pitch}, w, h)` → a NEW bag (pure; mutates nothing).
     *
     * The SCREEN-RELATIVE, INCREMENTAL rotation a LOOK drag produces — the peer
     * of `_orbitTranslate` (which is what a MOVE drag produces). Both deltas are
     * in DEGREES and both are applied in the camera's OWN frame:
     *
     *   `spin`  — rotate about `forward` (the view axis): the picture rolls.
     *   `pitch` — rotate about `right`   (screen-horizontal): the view tilts up
     *             /down, orbiting the centre at a FIXED radius.
     *
     * Successive screen-relative rotations do NOT compose the way three Euler
     * angles applied in a fixed order do — which is exactly why this goes through
     * the orthonormal frame: compose the bag into a basis, rotate the FRAME, then
     * decompose back. `azimuth` is an OUTPUT of that decomposition (the CEO's
     * "azimuth gets computed as a function of the two"), while remaining a
     * writable declarative coordinate through `setOrbit`. `distance` and `target`
     * ride through untouched — a LOOK is never a translation.
     *
     * Roll WRAPS (mod 360). It has no pole, so it is never clamped: a clamp would
     * make the picture stop rolling part-way, which reads as "roll is broken at
     * the extremes".
     *
     * @param {object} orbit  the current bag
     * @param {{spin?:number, pitch?:number}} delta degrees
     * @param {number} width  scene width in engine pixels
     * @param {number} height scene height in engine pixels
     * @returns {object} a new bag `{azimuth, elevation, distance, roll, target}`
     */
    function _rotateOrbit(orbit, delta, width, height) {
        var spin  = (delta && typeof delta.spin  === 'number') ? delta.spin  : 0;
        var pitch = (delta && typeof delta.pitch === 'number') ? delta.pitch : 0;
        var b = _orbitCameraBasis(orbit, width, height);
        var forward = b.forward, right = b.right, up = b.up;

        if (spin) {
            var s = spin * DEG;
            right = _rotateAbout(right, forward, s);
            up    = _rotateAbout(up,    forward, s);
        }
        if (pitch) {
            var p = pitch * DEG;
            forward = _rotateAbout(forward, right, p);
            up      = _rotateAbout(up,      right, p);
        }
        // Re-orthonormalize: many small incremental rotations accumulate FP drift.
        forward = _norm(forward);
        right   = _norm(right);
        var ang = _decomposeOrbitBasis({ forward: forward, right: right, up: up });
        return {
            azimuth: ang.azimuth,
            elevation: ang.elevation,
            distance: orbit.distance,
            roll: ang.roll,
            target: orbit.target || null
        };
    }

    // ── The interactive translation (the FPS walk) ──────────────────────────

    /**
     * SCREEN-RELATIVE translation of the orbit TARGET — the FPS walk, in the
     * camera's own frame. PURE (returns a new target; mutates nothing) so it is
     * Node-testable with no live THREE instance, and so the one piece of orbit
     * math a MOVE pad needs lives HERE at the camera authority rather than being
     * re-derived inside a widget.
     *
     * `forward` walks along the FULL view direction (positive = into the picture);
     * `strafe` slides along screen-right. Both in ENGINE PIXELS, both taken from
     * the ONE basis, so a positive strafe reads as rightward on screen at every
     * azimuth AND at every roll.
     *
     * **MOVE is ALWAYS screen-relative** (CEO 2026-07-28). The walk is NOT pinned
     * to a ground plane: walking forward while pitched down DESCENDS — this is a
     * fly control, not an FPS ground walk. (The earlier `y: centre.y` pin was the
     * algebraic residue of a retired ground-plane promise; keeping it would have
     * silently zeroed the vertical motion, and at roll≠0 it would have made
     * "screen-right" and "world-horizontal" contradict each other.)
     */
    function _orbitTranslate(orbit, width, height, forward, strafe) {
        var c = _orbitCenter(orbit, width, height);
        var b = _orbitCameraBasis(orbit, width, height);
        return {
            x: c.x + forward * b.forward.x + strafe * b.right.x,
            y: c.y + forward * b.forward.y + strafe * b.right.y,
            z: c.z + forward * b.forward.z + strafe * b.right.z
        };
    }

    // ── Camera-relative CARRY transforms (Q-A5-CAP) ─────────────────────────

    /** Camera-relative CARRY transforms (Q-A5-CAP) — the world↔camera-space pair, PURE
     *  free functions off _orbitCameraBasis (the ONE camera authority) so they are Node-
     *  testable with no live THREE/WebGL instance (mirrors _screenToWorldThree). The
     *  getCameraControl handle's cameraOffsetFromWorld/worldFromCameraOffset methods are
     *  thin closures over these with the live _orbit/_width/_height. Units = engine px.
     *  They read the ROLLED basis, so a carried object stays pinned in view through a
     *  roll exactly as it does through an azimuth change. */
    function _cameraOffsetFromWorld(orbit, width, height, worldPoint) {
        if (!worldPoint) { return null; }
        var b = _orbitCameraBasis(orbit, width, height);
        var dx = worldPoint[0] - b.pos.x, dy = worldPoint[1] - b.pos.y, dz = worldPoint[2] - b.pos.z;
        return {
            right:   dx * b.right.x   + dy * b.right.y   + dz * b.right.z,
            up:      dx * b.up.x      + dy * b.up.y      + dz * b.up.z,
            forward: dx * b.forward.x + dy * b.forward.y + dz * b.forward.z
        };
    }
    function _worldFromCameraOffset(orbit, width, height, off) {
        if (!off) { return null; }
        var b = _orbitCameraBasis(orbit, width, height);
        var r = off.right || 0, u = off.up || 0, f = off.forward || 0;
        return [
            b.pos.x + r * b.right.x + u * b.up.x + f * b.forward.x,
            b.pos.y + r * b.right.y + u * b.up.y + f * b.forward.y,
            b.pos.z + r * b.right.z + u * b.up.z + f * b.forward.z
        ];
    }

    // ── screenToWorld() analytic camera math (OPTIONAL capability, S5b) ──────
    //
    // WS Studio Controls Realignment §7 r2 item 4 / §2.5.7 "3D drag": "three:
    // raycast against the object's plane [at its z]". Rather than reach for a
    // LIVE `THREE.Raycaster`/`THREE.Plane` (which would make this untestable in
    // plain Node — makeThreeProvider() itself throws fail-loud without a real
    // WebGL/THREE global), this is a PURE re-derivation of the exact same
    // pinhole-camera geometry `_applyOrbit` uses to POSITION the camera — the
    // SAME basis function, the same fixed vertical FOV — so the two are
    // geometrically identical by construction, while this half stays
    // THREE-instance-free and unit-testable with plain `{x,y,z}` objects (see
    // `test/screen-to-world.test.mjs`). The provider's own `screenToWorld`
    // method is a THIN wrapper calling these free functions with its live
    // `_orbit`/`_width`/`_height` — it does not re-derive the math.

    /** World-space ray direction (unit vector) for a normalized-device-coordinate
     *  screen point `(ndcX, ndcY)` (both in [-1,1], y-up) through `basis`'s camera,
     *  given the fixed vertical FOV and the canvas aspect ratio. Standard pinhole-
     *  camera ray generation — the SAME math `THREE.Raycaster.setFromCamera` performs
     *  internally for a `PerspectiveCamera`, re-derived here without a THREE instance. */
    function _rayDirForNdc(basis, ndcX, ndcY, fovDeg, aspect) {
        var tanHalfFov = Math.tan((fovDeg * DEG) / 2);
        var dx = ndcX * tanHalfFov * aspect;
        var dy = ndcY * tanHalfFov;
        var dirX = basis.forward.x + dx * basis.right.x + dy * basis.up.x;
        var dirY = basis.forward.y + dx * basis.right.y + dy * basis.up.y;
        var dirZ = basis.forward.z + dx * basis.right.z + dy * basis.up.z;
        var len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
        return { x: dirX / len, y: dirY / len, z: dirZ / len };
    }

    // S5b tester-found BLOCKING regression (fix-loop): a live down-barrel drag
    // (the DEFAULT 3D camera preset — looks ~straight down +X) exploded a
    // dragged LO's rect to ~1e15. Root cause: `dir` is a UNIT vector, so
    // `dir.z` IS `cos(angle between the ray and the plane normal)`; the
    // ORIGINAL `Math.abs(dir.z) < 1e-9` guard only caught the ray being
    // EXACTLY parallel (dir.z ~ 1e-17, floating-point zero) — a genuinely
    // common NEAR-parallel case (down-barrel's screen-centre column has
    // dir.z passing smoothly through small-but-not-tiny values like 1e-4 as
    // the mouse crosses the vertical centreline) produced a t = numerator/
    // dir.z with dir.z just above that razor-thin threshold, giving a huge
    // but FINITE (never NaN/Infinity, so never itself caught) t — and the
    // resulting world point blew up proportionally. Two independent guards
    // now close this, per the tester's own fix recipe:
    //   (1) MIN_RAY_PLANE_COS — an ANGLE threshold (dir.z is literally a
    //       cosine), not a near-zero-only threshold: reject any ray within
    //       ~3° of parallel-to-the-plane, never just "exactly" parallel.
    //   (2) A scene-scale-aware SANITY BOUND at the `_screenToWorldThree`
    //       orchestration layer (which alone knows width/height) — reject
    //       ANY result implausibly far beyond the scene extent, so a
    //       degenerate point can NEVER reach `updateObjectProperty` even if
    //       a future edge case slipped past guard (1).

    /** Intersect a ray (`origin`,`dir`) with the world plane `z = planeZ`.
     *  Returns `{x,y}` (z === planeZ by construction) or `null` when the ray is
     *  NEAR-parallel to the plane (see MIN_RAY_PLANE_COS above — this is an
     *  ANGLE guard, not merely an exact-zero check) or the intersection is
     *  BEHIND the camera (t < 0). Pure math — no scene-scale awareness here
     *  (that lives in `_screenToWorldThree`'s own sanity-bound check below,
     *  which is the layer that actually knows width/height). */
    function _intersectRayWithZPlane(origin, dir, planeZ) {
        if (Math.abs(dir.z) < MIN_RAY_PLANE_COS) { return null; }
        var t = (planeZ - origin.z) / dir.z;
        // T_EPS tolerates floating-point noise right at t~0 (e.g. `origin.z`
        // for a down-barrel orbit is `distance * cos(el) * cos(90°)`, and
        // `Math.cos(Math.PI/2)` is NOT exactly 0 in IEEE-754 — it is
        // ~6.12e-17 — so a worldZ=0 target from a down-barrel camera can
        // resolve to a genuinely-in-front intersection with `t` a few
        // e-13 NEGATIVE purely from that noise). Only a MEANINGFULLY
        // negative t (the intersection is actually behind the camera) is
        // rejected; a noise-scale negative t is treated as ~0.
        if (t < -1e-6) { return null; }
        return { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
    }

    /**
     * screenToWorld — the full pure pipeline: canvas CSS pixel → NDC → world-ray
     * → intersection with the z=worldZ plane → scene-scale sanity bound.
     * Exported (alongside the three sub-steps above) so the LIVE provider
     * method is a one-line call and the geometry is independently
     * unit-testable without a THREE global. Returns `null` on EITHER a
     * near-parallel/behind-camera ray (see `_intersectRayWithZPlane`) OR a
     * result beyond `SANITY_EXTENT_FACTOR` × the scene's own width/height —
     * the caller (AuthorView.jsx's overlay drag) treats a `null` result as
     * "skip this frame's write" (never a fallback to a DIFFERENT, WRONG
     * coordinate transform, and never a write of the degenerate point).
     *
     * It reads the ROLLED basis, so a drag under a rolled camera resolves along
     * the screen axes the user is actually looking at.
     */
    // OPT-IN EXTENSION (`fovYDeg`, trailing, defaulted to the module's own CAMERA_FOV_DEG):
    // byte-identical for every existing caller — the live provider's camera IS at
    // CAMERA_FOV_DEG, so omitting the argument reproduces the previous behaviour exactly.
    // It exists so the OFFLINE unproject (`unprojectStill.js`) can pass a captured scene's
    // `projection.fovY` as DATA through this SAME composition rather than re-deriving the
    // pinhole. One mapping authority: a consumer's hand-written unproject drifting from the
    // provider's is the schema-mirror bug applied to MATH.
    function _screenToWorldThree(orbit, width, height, canvasCssX, canvasCssY, canvasCssWidth, canvasCssHeight, worldZ, fovYDeg) {
        var cw = canvasCssWidth  || width;
        var ch = canvasCssHeight || height;
        var fov = (typeof fovYDeg === 'number' && isFinite(fovYDeg) && fovYDeg > 0) ? fovYDeg : CAMERA_FOV_DEG;
        var ndcX =  (canvasCssX / cw) * 2 - 1;
        var ndcY = -((canvasCssY / ch) * 2 - 1);
        var basis = _orbitCameraBasis(orbit, width, height);
        var dir = _rayDirForNdc(basis, ndcX, ndcY, fov, width / height);
        var hit = _intersectRayWithZPlane(basis.pos, dir, (typeof worldZ === 'number') ? worldZ : 0);
        if (!hit) { return null; }
        var bound = SANITY_EXTENT_FACTOR * Math.max(width, height, 1);
        if (!isFinite(hit.x) || !isFinite(hit.y) || Math.abs(hit.x) > bound || Math.abs(hit.y) > bound) {
            return null;
        }
        return hit;
    }

    // ── Export ──────────────────────────────────────────────────────────────
    //
    // The `_`-prefixed names are preserved verbatim from their previous home
    // inside three-provider.js: this was a MOVE, not a rewrite, and renaming
    // during a relocation makes the relocation unreviewable. They read as
    // "renderer-internal geometry primitives", which is exactly what they are —
    // the PUBLIC camera surface is the `getCameraControl()` handle.

    var ThreeCameraGeometry = {
        CAMERA_FOV_DEG: CAMERA_FOV_DEG,
        MIN_RAY_PLANE_COS: MIN_RAY_PLANE_COS,
        SANITY_EXTENT_FACTOR: SANITY_EXTENT_FACTOR,
        UP_HINT: UP_HINT,
        POLE_EPS: POLE_EPS,
        _orbitCenter: _orbitCenter,
        _orbitCameraBasis: _orbitCameraBasis,
        _decomposeOrbitBasis: _decomposeOrbitBasis,
        _rotateOrbit: _rotateOrbit,
        _orbitTranslate: _orbitTranslate,
        _cameraOffsetFromWorld: _cameraOffsetFromWorld,
        _worldFromCameraOffset: _worldFromCameraOffset,
        _rayDirForNdc: _rayDirForNdc,
        _intersectRayWithZPlane: _intersectRayWithZPlane,
        _screenToWorldThree: _screenToWorldThree
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ThreeCameraGeometry;
    } else if (typeof window !== 'undefined') {
        window.ThreeCameraGeometry = ThreeCameraGeometry;
    }

})();
