/* Copyright 2023-2026 by Essam Abadir */

/**
 * _collisionMatrixLanes — the ONE lane table the collision-matrix experiments sweep.
 *
 * The collision matrix is a DENSITY sweep. Density — `ρ = mass / capacity` — is the
 * physical quantity the experiment reads: the per-tick exchange ceiling of
 * `voxel_collision_pass` carries occupancy (ρ_A·ρ_B), so bounce TIMING emerges from
 * density. Dense lanes complete the two-bucket exchange earliest; sparse lanes linger
 * or pass through.
 *
 * The lanes are therefore declared as DENSITIES, and the absolute mass is derived from
 * the capacity the ENGINE reports for the body it actually built. A hardcoded mass list
 * is only correct for one capacity: `[1,8,64,512,1024,2048,4096]` spans ρ 0→1 for a 2D
 * 64x64 voxel (capacity 4096) and collapses to ρ ≤ 0.0156 for the 3D 64x64x64 voxel
 * (capacity 262144), which squeezes the whole sweep into its sparse corner and leaves
 * the 3D scene with no dense lanes at all.
 *
 * The powers-of-two ladder is deliberate: collision probability goes as density², so a
 * LOG scale is what reads cleanly across the transition.
 *
 * @module _collisionMatrixLanes
 */

    /**
     * Lane densities, sparse → full. `2^-12 … 2^0`.
     *
     * Against a 2D capacity of 4096 these reproduce the canonical mass ladder exactly:
     * 1, 8, 64, 512, 1024, 2048, 4096.
     *
     * @type {Array<number>}
     */
    var LANE_DENSITIES = [
        Math.pow(2, -12), Math.pow(2, -9), Math.pow(2, -6), Math.pow(2, -3),
        Math.pow(2, -2), Math.pow(2, -1), 1
    ];

    /**
     * Resolve the lane densities against a real capacity.
     *
     * @param {number} capacity - The body capacity the ENGINE reports (`mass` of a freshly
     *   built full body). 2^(2·level) in 2D, 2^(3·level) in 3D.
     * @returns {Array<number>} one integer mass per lane, sparse → full, each ≥ 1 and
     *   clamped to `capacity`.
     * @throws {Error} FAIL-LOUD when capacity is not a positive finite number — a lane
     *   ladder built against a bad capacity is the exact silent-wrong-scene this module
     *   exists to prevent.
     */
    function laneMassesForCapacity(capacity) {
        if (!isFinite(capacity) || capacity <= 0) {
            throw new Error('[collisionMatrixLanes] capacity must be a positive number, got ' +
                JSON.stringify(capacity) + '. Read it back from the engine after building a ' +
                'body (universe.getFrameProperty(qid, \'mass\')) — never assume it.');
        }
        return LANE_DENSITIES.map(function (rho) {
            return Math.max(1, Math.min(capacity, Math.round(rho * capacity)));
        });
    }

    var api = {
        LANE_DENSITIES: LANE_DENSITIES,
        laneMassesForCapacity: laneMassesForCapacity
    };

    export { api as collisionMatrixLanes };

