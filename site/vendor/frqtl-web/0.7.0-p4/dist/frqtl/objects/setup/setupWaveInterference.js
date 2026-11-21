/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupWaveInterference — Engine-agnostic wave interference experiment factory.
 * Two PointSources separated by 2*wavelength, emitting radially.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { PointSource } from '../../parts/PointSource.js';
import { LargeObject } from '../../parts/LargeObject.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create a wave interference experiment with two radial point sources.
     *
     * Builds two {@link PointSource} emitters separated by `sourceSeparation`, each
     * firing 1px/tick leaf Frames radially, plus two visual-only source circles.
     * The fringe pattern is EMERGENT — no wave equation; it appears where the two
     * particle streams overlap.
     *
     * Two independent "wavelength" knobs — keep them distinct:
     *  - `options.fundamentalWaveLength` → each emitter's `opts.wavelength` → particle
     *    MASS (`mass = capacity / wavelength`); 32 gives leaf mass ≈ 1 (clean fringes,
     *    matches WASM). It also sets the default source geometry below.
     *  - `options.wavelengthScale` → the universe-wide scale in
     *    `wavelength = floor((capacity/mass) × WAVELENGTH_CONSTANT)`. Raising it WIDENS
     *    the fringes (the live slider on the experiment page drives this).
     *
     * @param {Object} universe - The engine universe instance (JS or WASM), not yet init'd.
     * @param {Object} [options] - Configuration overrides.
     * @param {number} [options.fundamentalDimension=2] - Fundamental (leaf) dimension layer.
     * @param {number} [options.fundamentalWaveLength=32] - Per-emitter wavelength → particle
     *   mass; also the default for source separation (2×) and diameter (1×).
     * @param {number} [options.wavelengthScale=8] - Universe-wide fringe-spacing scale
     *   (see above); higher = wider fringes.
     * @param {number} [options.velocity=50000] - Default quantum-limit source (NOT particle
     *   speed; speed is fixed at 1px/tick by the Universal Speed Limit invariant).
     * @param {number} [options.sourceSeparation] - Distance between the two sources (physics
     *   pixels; default 2×wavelength).
     * @param {number} [options.sourceDiameter] - Source circle diameter (default = wavelength).
     * @param {number} [options.quantumLimit] - Max quanta emitted per angle (default: velocity);
     *   the steady-state density ceiling.
     * @param {number} [options.depth] - total z-extent for a 3D run. OMITTED
     *   (default) → today's 2D behavior, byte-identical (no `activeAxes`/z key touched at all).
     *   When provided: `universe.init()` gains `activeAxes:{x:true,y:true,z:true}` (mirrors
     *   `setupParticleWalk3D`) and BOTH PointSources emit with a uniform z-spread centered on
     *   z=0 (`zMin=-depth/2, zDepth=depth`) — every z-slice sees the same radial illumination,
     *   so the emergent fringe pattern is genuinely 3D rather than a dark volume around one
     *   lit plane (design §2.3/§4.4). This is the SAME emitter option `SlitLightSource`
     *   consumes — the z-spread lives in `PointSource`/
     *   `emitterProgram.js`, not here, precisely so both experiments share it.
     * @returns {Object} `{ sources:{source1,source2}, source1Circle, source2Circle,
     *   fundamentalDimension, desiredWaveLength, largeObjects }`.
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupWaveInterference.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'depth', 'fundamentalDimension', 'fundamentalWaveLength', 'quantumLimit',
        'sourceDiameter', 'sourceSeparation', 'velocity', 'wavelengthScale',
    ];

    function setupWaveInterference(universe, options) {
        options = _assertSetupOptions('setupWaveInterference', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupWaveInterference universe.universe_rect', canvas_rect);

        var fundamentalDimension = options.fundamentalDimension !== undefined ? options.fundamentalDimension : 2;
        var desiredWaveLength = options.fundamentalWaveLength !== undefined ? options.fundamentalWaveLength : 32;
        var wavelengthScale = options.wavelengthScale !== undefined ? options.wavelengthScale : 8;
        // Opt-in 3D depth. undefined/null → 2D, byte-identical.
        var depth = (options.depth !== undefined && options.depth !== null) ? options.depth : null;

        // Init universe: ground-up, brownianMotion:false (the wave-walk). activeAxes is ONLY
        // attached when a
        // 3D depth was requested — omission keeps the exact init() call 2D callers already get.
        var initOpts = { wavelengthScale: wavelengthScale, brownianMotion: false };
        if (depth !== null) {
            initOpts.activeAxes = { x: true, y: true, z: true };
        }
        universe.init(fundamentalDimension, initOpts);

        // Centered uniform z-spread — the caller (this factory) decides centering;
        // PointSource itself just forwards zMin/zDepth (see PointSource.js opts doc).
        var zMin = depth !== null ? -depth / 2 : null;
        var zDepth = depth !== null ? depth : null;

        var light_source_center_y = Math.floor(canvas_rect.h / 2);
        var light_source_center_x = Math.floor(canvas_rect.w / 2);

        var sourceSeparation = options.sourceSeparation !== undefined ? options.sourceSeparation : 2 * desiredWaveLength;
        var sourceOffset = sourceSeparation / 2;
        var lightSourceDiameter = options.sourceDiameter !== undefined
            ? options.sourceDiameter
            : desiredWaveLength;

        var velocity = options.velocity !== undefined ? options.velocity : 50000;
        var quantumLimit = options.quantumLimit !== undefined ? options.quantumLimit : velocity;
        var charge = null; // random +/- per particle

        var center_x1 = light_source_center_x - sourceOffset;
        var center_x2 = light_source_center_x + sourceOffset;
        var sourceRadius = lightSourceDiameter / 2;

        // Create two radial point sources
        var pointSource1 = new PointSource(
            universe,
            center_x1, light_source_center_y,
            lightSourceDiameter,
            sourceRadius,       // speed = radius (matches WASM adapter velocity pattern)
            charge,
            true,               // auto_fire
            quantumLimit,       // quantum_limit per angle
            0,                  // delay
            5,                  // angle_increment = 5 degrees
            { wavelength: desiredWaveLength, zMin: zMin, zDepth: zDepth }  // JS leaf mass = capacity/wavelength → 1 (matches WASM; clean fringes)
        );

        var pointSource2 = new PointSource(
            universe,
            center_x2, light_source_center_y,
            lightSourceDiameter,
            sourceRadius,
            charge,
            true,
            quantumLimit,
            0,
            5,
            { wavelength: desiredWaveLength, zMin: zMin, zDepth: zDepth }  // JS leaf mass = capacity/wavelength → 1 (matches WASM; clean fringes)
        );

        // Visual-only circles for the source bodies (black, no collision)
        var source1Circle = new LargeObject(
            universe,
            [center_x1 - sourceRadius, light_source_center_y - sourceRadius, lightSourceDiameter, lightSourceDiameter],
            CollisionTypes.NONE, [], 'source1', 'closest', null, 1, [0, 0, 0]
        );
        source1Circle.drawAsCircle = true;

        var source2Circle = new LargeObject(
            universe,
            [center_x2 - sourceRadius, light_source_center_y - sourceRadius, lightSourceDiameter, lightSourceDiameter],
            CollisionTypes.NONE, [], 'source2', 'closest', null, 1, [0, 0, 0]
        );
        source2Circle.drawAsCircle = true;

        return {
            sources: { source1: pointSource1, source2: pointSource2 },
            source1Circle: source1Circle,
            source2Circle: source2Circle,
            fundamentalDimension: fundamentalDimension,
            desiredWaveLength: desiredWaveLength,
            largeObjects: [source1Circle, source2Circle]
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupWaveInterference.OPTIONS = OPTIONS;

    export { setupWaveInterference };

