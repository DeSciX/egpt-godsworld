/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupCollisionMatrix — density-sweep collision experiment.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * @param {Object} universe - WASM universe (wasmOnly experiment); init()'d here.
 * @param {Object} [opts]
 * @param {number} [opts.level=6]    - Dimension of every body (2^level px voxel; 6 = 64px).
 * @param {number} [opts.offset=0]   - Transverse launch offset (px): A below / B above the lane.
 * @param {number} [opts.angle=0]    - Converging vy magnitude (the approach angle).
 *
 * @returns {{
 *   level: number, voxel: number, capacity: number, laneYs: number[], ax0: number, bx0: number,
 *   lanes: Array<{ name:string, label:string, aQid:number, bQid:number,
 *                  mass:number, ax0:number, bx0:number, laneY:number }>,
 *   matrixControl: { getOffset, setOffset, getAngle, setAngle, reset }
 * }}
 *
 * ── Layer 2: physics behavior (what this PROVES) ─────────────────────────────
 * SEVEN horizontal lanes, each a SYMMETRIC pair of Dim-6 boxes (equal mass) launched head-on
 * — A from the left (+x), B from the right (−x) — at speed_prob=1. Mass is swept on a LOG
 * (powers-of-2) scale: 1, 8, 64, 512, 1024, 2048, 4096(=capacity), so density ρ = mass/capacity
 * runs ≈0.0002 … 1.0 DOWN the lanes: SPARSE at the TOP, FULL at the BOTTOM. Bodies are
 * COLORLESS; the ROYGBIV render scheme colours each by its fullness.
 *
 * withInterQuantumCollisions=true runs voxel_collision_pass — the TWO-BUCKET momentum exchange:
 * colliding boxes EXCHANGE momentum and
 * CONSERVE it; the per-tick exchange ceiling carries occupancy (ρ_A·ρ_B), so the bounce TIMING
 * emerges from density — rigid (full) lanes bounce fast and clean, soft (sparse) lanes bounce
 * slowly. The sweep reads this spectrum at a glance. Cross-lane coupling is impossible: lanes are
 * y-separated ≫ the voxel, so no two lanes share a collision-proximity bucket.
 *
 * activeAxes {x,y}: x carries the head-on approach; the live OFFSET/ANGLE controls (no reload) add
 * a transverse launch offset + a converging vy so collisions go OFF-AXIS — exercising the engine's
 * SEPARATE per-axis momentum buckets (inc_x vs inc_y). density-sweep × offset/angle = the "offset
 * angle combinations". At offset=0, angle=0 it is clean head-on.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { collisionMatrixLanes as _lanes } from './_collisionMatrixLanes.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    /**
     * Lane descriptor: each lane is a SYMMETRIC pair of bodies (both the same mass) at a fixed y.
     * DENSITY is swept on a strict LOGARITHMIC (powers-of-2) scale from ρ≈0 (one Dim-0 child →
     * near-total pass-through) to ρ=1 (full box → hard abut) — non-linear probabilistic
     * effects (collision prob ~ density² with density=mass/capacity) read cleanly on a log scale
     * speed_prob=1 on every body so ALL lanes approach at the same 1px/tick,
     * isolating density→collision from the fullness-gate movement-speed effect (that is G1's job).
     * For a 2D Dim-6 box capacity = 64×64 = 4096 = 2^12, so the ladder is 2^0…2^12. The table is
     * `_collisionMatrixLanes.js` — shared with the 3D matrix, whose capacity is 64³ and whose
     * masses therefore differ while the DENSITIES are identical.
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupCollisionMatrix.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'angle', 'level',
        'offset',
    ];

    function setupCollisionMatrix(universe, opts) {
        opts = _assertSetupOptions('setupCollisionMatrix', opts, OPTIONS);
        var level  = (opts.level   !== undefined) ? opts.level   : 6;

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var rect = universe.universe_rect;
        var world = _requireWorldRect('setupCollisionMatrix universe.universe_rect', rect);
        var cw = world.w, ch = world.h;

        // activeAxes: BOTH x and y. x carries the head-on approach; y carries the OFFSET/ANGLE
        // switch (transverse offset + converging vy) that exercises the engine's SEPARATE per-axis
        // momentum buckets (inc_x vs inc_y) and the per-axis contact-cross-section ceiling. At
        // offset=0, angle=0 the motion is pure-x head-on (vy=0); the transverse yo-yo adds only a
        // small ±1px wiggle that does not cross the ~100px lane spacing over a collision.
        universe.init(0, {
            wavelengthScale: 1,
            brownianMotion: false,
            activeAxes: { x: true, y: true, z: false }
        });
        // Enable the voxel_collision_pass so same-dimension boxes exchange momentum.
        universe.withInterQuantumCollisions = true;

        universe.addDimension(level);
        var voxel = Math.pow(2, level);   // 64 for level=6
        var half  = voxel / 2;            // makeLeafFrame takes TOP-LEFT; we want CENTRES.

        // Canonical launch CENTRES (same for every lane). A left of centre, B right, 3 voxels apart.
        var midX = Math.floor(cw * 0.5);
        var ax0  = midX - Math.floor(1.5 * voxel);   // ~254 centre for 700-wide canvas
        var bx0  = midX + Math.floor(1.5 * voxel);   // ~446 centre

        // Lane y-CENTRES: N lanes evenly distributed (centres at ch*(2i+1)/(2N)). These are CENTRES
        // — the boxes are placed top-left = centre − half, so a 64px box centred at the bottom lane
        // (y≈650) spans 618..682 and stays IN BOUNDS (H=700). Passing the centre AS the top-left was
        // the boundary-kill bug: the bottom lane ran off the edge and the boundary check zeroed it.
        var N = _lanes.LANE_DENSITIES.length;
        var laneYs = _lanes.LANE_DENSITIES.map(function (_, i) { return Math.round(ch * (2 * i + 1) / (2 * N)); });

        // OFFSET / ANGLE state (the switch). offsetPx = transverse separation of the pair at launch
        // (A below centre, B above → glancing); angleVy = converging y-velocity (A up, B down →
        // both x AND y momentum at impact). Both default 0 = clean head-on.
        var offsetPx = (opts.offset !== undefined) ? opts.offset : 0;
        var angleVy  = (opts.angle  !== undefined) ? opts.angle  : 0;

        var capacity = null;

        // Seat one body's position + velocity for the current offset/angle (CENTRE coords).
        function seat(qid, cx, cy, dirX, mass) {
            universe.setFrameProperty(qid, 'x',  cx);
            universe.setFrameProperty(qid, 'y',  cy + dirX * offsetPx);   // A(dirX=+1) below, B above
            universe.setFrameProperty(qid, 'vx', dirX);
            universe.setFrameProperty(qid, 'vy', -dirX * angleVy);        // converge toward the lane
            universe.setFrameProperty(qid, 'mass', mass);
            universe.setFrameProperty(qid, 'speed_prob', 1.0);
        }

        // Build every body FIRST — the capacity that sets the lane ladder is whatever the
        // ENGINE reports for the body it actually built, so the masses cannot be known
        // until a body exists.
        var built = [];
        for (var i = 0; i < N; i++) {
            var laneY = laneYs[i];
            // Place COLORLESS boxes (ROYGBIV scheme drives colour from fullness) at top-left = centre−half.
            var aHandle = universe.makeLeafFrame(ax0 - half, laneY - half, level, null, 1, 0, true, 0, null);
            universe.injectFrame(aHandle);
            var aQid = universe.getFrameQuantumId(aHandle);
            var bHandle = universe.makeLeafFrame(bx0 - half, laneY - half, level, null, -1, 0, true, 0, null);
            universe.injectFrame(bHandle);
            var bQid = universe.getFrameQuantumId(bHandle);

            if (capacity === null) { capacity = universe.getFrameProperty(aQid, 'mass'); }
            built.push({ aQid: aQid, bQid: bQid });
        }

        var laneMasses = _lanes.laneMassesForCapacity(capacity);

        var lanes = built.map(function (b, i) {
            var laneY = laneYs[i];
            var m = laneMasses[i];
            // SYMMETRIC lane; seat applies mass + the current offset/angle.
            seat(b.aQid, ax0, laneY, 1, m);
            seat(b.bQid, bx0, laneY, -1, m);

            return {
                name:  'm=' + m,
                label: 'mass ' + m + ' / ' + capacity + ' (density ' + (m / capacity).toPrecision(2) + ')',
                aQid: b.aQid, bQid: b.bQid, mass: m, ax0: ax0, bx0: bx0, laneY: laneY
            };
        });

        function reseatAll() {
            lanes.forEach(function (lane) {
                seat(lane.aQid, lane.ax0, lane.laneY, 1, lane.mass);
                seat(lane.bQid, lane.bx0, lane.laneY, -1, lane.mass);
            });
        }

        // ── Live control handle (Blackbody pattern — no reload) ──────────────────
        // setOffset/setAngle change the transverse offset and converging angle and RE-SEAT every
        // lane so the new geometry takes effect immediately; reset just re-seats at the current
        // offset/angle. The density sweep (per lane) × the offset/angle slider = the "offset angle
        // combinations" the matrix is meant to explore.
        var matrixControl = {
            getOffset: function () { return offsetPx; },
            setOffset: function (v) { offsetPx = v; reseatAll(); },
            getAngle:  function () { return angleVy; },
            setAngle:  function (v) { angleVy  = v; reseatAll(); },
            reset:     function () { reseatAll(); }
        };

        return {
            level: level, voxel: voxel, capacity: capacity, laneYs: laneYs,
            ax0: ax0, bx0: bx0, lanes: lanes, matrixControl: matrixControl
        };
    }

    setupCollisionMatrix.OPTIONS = OPTIONS;

    export { setupCollisionMatrix };

