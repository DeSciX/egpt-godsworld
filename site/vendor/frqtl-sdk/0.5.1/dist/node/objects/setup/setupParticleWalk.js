/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupParticleWalk — Engine-agnostic particle walk experiment factory.
 * Emits particles rightward from canvas center with wave-walk behavior.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

(function () {

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.
    var _assertSetupOptions;
    var _requireWorldRect;   // _setupOptions.js — the world rect, never a default size
    if (typeof module !== 'undefined' && module.exports) {
        _assertSetupOptions = require('./_setupOptions').assertSetupOptions;
        _requireWorldRect = require('./_setupOptions').requireWorldRect;
    } else {
        _assertSetupOptions = function (n, o, k) { return window.assertSetupOptions(n, o, k); };
        _requireWorldRect = function (w, r) { return window.requireWorldRect(w, r); };
    }

    // ── Imports ─────────────────────────────────────────────────────────

    var QuantumEmitter;

    if (typeof module !== 'undefined' && module.exports) {
        QuantumEmitter = require('../objects/QuantumEmitter').QuantumEmitter;
    } else {
        QuantumEmitter = window.QuantumEmitter;
    }

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create a particle walk experiment.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM), not yet init'd
     * @param {Object} [options] - Configuration overrides
     * @param {number} [options.fundamentalDimension=0] - Base dimension
     * @param {number} [options.fundamentalWaveLength=64] - Desired wavelength
     * @param {number} [options.velocity=1] - Emission velocity
     * @returns {Object} { emitter, largeObjects }
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupParticleWalk.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'fundamentalDimension', 'fundamentalWaveLength', 'velocity',
    ];

    function setupParticleWalk(universe, options) {
        options = _assertSetupOptions('setupParticleWalk', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupParticleWalk universe.universe_rect', canvas_rect);

        var fundamentalDimension = options.fundamentalDimension !== undefined ? options.fundamentalDimension : 0;
        var desiredWaveLength = options.fundamentalWaveLength !== undefined ? options.fundamentalWaveLength : 64;
        var velocity = options.velocity !== undefined ? options.velocity : 1;

        var waveLengthMultiplier = Math.floor(desiredWaveLength / 4);
        waveLengthMultiplier = Math.max(1, waveLengthMultiplier);

        var vx = velocity;
        var vy = 0;

        // Init universe: ground-up mode, brownianMotion:false for the wave branch
        universe.init(fundamentalDimension, { wavelengthScale: waveLengthMultiplier, brownianMotion: false });
        universe.minMBFillRate = 0.2;

        var light_source_center_y = Math.floor(canvas_rect.h / 2);
        var light_source_center_x = Math.floor(canvas_rect.w / 2);
        var light_source_height = 10;

        // Create emitter at center, firing rightward
        var sourceRect = [light_source_center_x, light_source_center_y, 1, light_source_height];

        var emitter = new QuantumEmitter(
            universe,
            [sourceRect],
            vx, vy,
            20,        // burst_size
            1,         // charge = NEGATIVE (1)
            true,      // auto_fire
            false,     // not random direction
            Infinity,  // quantum_limit
            0,         // delay
            false      // wrap = false (particles die at canvas boundary)
        );

        return {
            emitter: emitter,
            largeObjects: []
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupParticleWalk.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupParticleWalk: setupParticleWalk };
    } else {
        window.setupParticleWalk = setupParticleWalk;
    }

})();
