/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupG3Collide — UNIT-TEST experiment G3: "two LO voxel bodies collide head-on".
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * @param {Object} universe - WASM universe (this experiment is wasmOnly).
 * @param {Object} [opts]
 * @param {number} [opts.level=6]     - Dimension of the bodies (2^level px voxel cube; 6 = 64px).
 * @param {number} [opts.massRatio=1] - mass_B / mass_A. 1 = equal (clean velocity swap).
 * @param {number} [opts.density=1]   - Fullness of BOTH boxes: mass = capacity × density.
 *   1.0 = full (boxes abut, no interpenetration); <1 = partial (overlap by empty fraction).
 * @param {number} [opts.offset=0]    - Transverse B offset in voxel units. 0 = head-on; ~1 = glancing.
 * @returns {{ aHandle, aQid, bHandle, bQid, level, voxel, massRatio, density, offset,
 *             capacity, aMass, midY, collideControl }}
 *   `collideControl` is a LIVE control handle (Blackbody shape):
 *   - `setMassRatio(r)` — live: updates B's mass relative to A; no reload.
 *   - `setDensity(d)`   — live: updates BOTH bodies' fullness (mass = capacity × d), then B scaled
 *                          by current massRatio.
 *   - `setOffset(o)`    — live: repositions B's y centre to midY + round(o × voxel).
 *   - `reset()`         — re-seats BOTH bodies to launch positions (initial x, vx=±1, B.y = midY
 *                          + round(offset × voxel)) so density/offset changes restart the collision
 *                          honestly. Reads current live state (massRatio, density, offset) so the
 *                          new collision respects the latest knob values.
 *   All setters write through the property accessors (setFrameProperty) against the stored
 *   quantum ids (aQid, bQid) — NEVER a page reload.
 *
 * ── Layer 2: physics behavior (what this PROVES) ─────────────────────────────
 * Two LEAF FRAMES at the SAME non-fundamental Dimension (= same voxel size, so each
 * stands in for the virtual children filling its voxel) are launched toward each other
 * (A: vx=+1 from the left, B: vx=-1 from the right) with speed_prob=1 so they approach
 * deterministically and the COLLISION is the whole story. When their voxel extents
 * overlap, the engine's voxel_collision_pass exchanges the overlap-volume momentum
 * (conserved): at full overlap with equal mass the result is a perfect velocity SWAP —
 * both cubes reverse and separate (perfectly-elastic head-on bounce). With massRatio≠1
 * the lighter body recoils faster than the heavier one plows forward. Fundamental
 * "light" quanta are NOT involved — this pass acts only on virtual-children bodies, so
 * the no-collision experiments (Particle Walk, Wave Interference) are untouched.
 *
 * Bodies wrap at canvas edges so after a bounce they re-approach and collide again —
 * a continuous ping-pong demo.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupG3Collide.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'density', 'level', 'massRatio', 'offset',
    ];

    function setupG3Collide(universe, opts) {
        opts = _assertSetupOptions('setupG3Collide', opts, OPTIONS);
        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var rect = universe.universe_rect;
        var world = _requireWorldRect('setupG3Collide universe.universe_rect', rect);
        var cw = world.w, ch = world.h;
        var level = (opts.level !== undefined) ? opts.level : 5;          // 2^5 = 32px voxel body
        // Initial knob values — held in the closure so live setters compose correctly.
        var massRatio = (opts.massRatio !== undefined) ? opts.massRatio : 1.0;
        // density ∈ (0,1] — fullness of BOTH boxes (mass = capacity·density). 1 = full (abut, no
        // interpenetration); <1 = partial (the boxes interpenetrate by their empty fraction).
        var density = (opts.density !== undefined) ? opts.density : 1.0;
        // transverse offset (in voxel units): B's y relative to A. 0 = head-on; ~1 = glancing.
        var offset = (opts.offset !== undefined) ? opts.offset : 0.0;

        universe.init(0, { wavelengthScale: 1, brownianMotion: false });
        // Enable the collision passes (default is false) — G3 needs voxel_collision_pass.
        universe.withInterQuantumCollisions = true;

        // Register the voxel dimension so the bodies are visible cubes/blobs.
        universe.addDimension(level);
        var voxel = Math.pow(2, level);

        // Canonical launch x-positions (re-used by reset()).
        var midY = Math.floor(ch * 0.5);
        var ax0 = Math.floor(cw * 0.5) - 1.5 * voxel;
        var bx0 = Math.floor(cw * 0.5) + 1.5 * voxel;

        // Body A — warm, moving +x from the left. wrap=true so after the bounce it wraps and
        // re-approaches (a continuous demo) instead of escaping a non-reflecting boundary.
        var aHandle = universe.makeLeafFrame(ax0, midY, level, null, 1, 0, true, 0, [255, 140, 70]);
        universe.injectFrame(aHandle);
        // makeLeafFrame returns a FrameId; set/getFrameProperty key on the QUANTUM_ID.
        var aQid = universe.getFrameQuantumId(aHandle);

        // Body B — cool, moving -x from the right, offset transversely for glancing blows.
        var bHandle = universe.makeLeafFrame(bx0, midY + Math.round(offset * voxel), level, null, -1, 0, true, 0, [70, 160, 255]);
        universe.injectFrame(bHandle);
        var bQid = universe.getFrameQuantumId(bHandle);

        // Density: set BOTH boxes' fullness (mass = capacity·density). The capacity is the full
        // mass makeLeafFrame gave A. Then mass ratio scales B on top (asymmetric collisions).
        // capacity is treated as a constant after init; density and massRatio are live-writable.
        var capacity = universe.getFrameProperty(aQid, 'mass');   // full body → mass == capacity
        var aMass = capacity * density;
        universe.setFrameProperty(aQid, 'mass', aMass);
        universe.setFrameProperty(bQid, 'mass', aMass * massRatio);

        // ── Live control handle (Blackbody shape) ──────────────────────────────
        // Each setter writes through the property accessors against the stored quantum ids.
        // No page reload — the same shape as the blackbody scene's temperature knob
        // (lib/frqtl/scenes/blackbody.js: slider onChange → oven.setTemperature, live).
        var collideControl = {
            /**
             * Update mass_B / mass_A live.
             * @param {number} r - New mass ratio (mass_B relative to mass_A).
             */
            setMassRatio: function (r) {
                massRatio = r;
                var curA = universe.getFrameProperty(aQid, 'mass');
                universe.setFrameProperty(bQid, 'mass', curA * massRatio);
            },

            /**
             * Update the fullness (density) of BOTH bodies live.
             * @param {number} d - Density in (0, 1]. mass = capacity × d; B then scaled by massRatio.
             */
            setDensity: function (d) {
                density = d;
                var m = capacity * density;
                universe.setFrameProperty(aQid, 'mass', m);
                universe.setFrameProperty(bQid, 'mass', m * massRatio);
            },

            /**
             * Reposition B's y-centre live (transverse offset in voxel units).
             * @param {number} o - Offset in voxel units. 0 = head-on; ~1 = glancing.
             */
            setOffset: function (o) {
                offset = o;
                universe.setFrameProperty(bQid, 'y', midY + Math.round(o * voxel));
            },

            /**
             * Re-seat BOTH bodies to their canonical launch state so the collision restarts
             * honestly with the current knob values. Reads the live massRatio / density / offset
             * closure state so the new run respects the latest slider positions.
             */
            reset: function () {
                // Re-seat positions and velocities via property accessors.
                universe.setFrameProperty(aQid, 'x',  ax0);
                universe.setFrameProperty(aQid, 'y',  midY);
                universe.setFrameProperty(aQid, 'vx', 1);
                universe.setFrameProperty(bQid, 'x',  bx0);
                universe.setFrameProperty(bQid, 'y',  midY + Math.round(offset * voxel));
                universe.setFrameProperty(bQid, 'vx', -1);
                // Re-apply current mass state (density × capacity, B scaled by massRatio).
                var m = capacity * density;
                universe.setFrameProperty(aQid, 'mass', m);
                universe.setFrameProperty(bQid, 'mass', m * massRatio);
            },

            getMassRatio: function () { return massRatio; },
            getDensity:   function () { return density; },
            getOffset:    function () { return offset; }
        };

        return { aHandle: aHandle, aQid: aQid, bHandle: bHandle, bQid: bQid,
                 level: level, voxel: voxel, massRatio: massRatio,
                 density: density, offset: offset,
                 capacity: capacity, aMass: aMass, midY: midY,
                 collideControl: collideControl };
    }

    setupG3Collide.OPTIONS = OPTIONS;

    export { setupG3Collide };

