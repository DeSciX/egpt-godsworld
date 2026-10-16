/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupEmpty — Engine-agnostic blank-universe factory.
 *
 * Initializes the universe (same init contract as every other setup factory) but
 * creates NO objects and NO emitters. This is the base the AuthorView snapshot
 * model loads: a saved project opens this page, the universe is init'd here, then
 * AuthorView.applyDesign reconstructs the saved entities into it. Without the
 * universe.init() call here, applyDesign would run against an uninitialized
 * universe and silently restore nothing.
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

    /**
     * Initialize a blank universe with the standard dimension stack, no objects.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM), not yet init'd
     * @param {Object} [options]
     * @param {number} [options.fundamentalDimension=2]
     * @param {number} [options.wavelengthScale=8]
     * @returns {Object} { largeObjects: [] }
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupEmpty.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'fundamentalDimension', 'wavelengthScale',
    ];

    function setupEmpty(universe, options) {
        options = _assertSetupOptions('setupEmpty', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupEmpty universe.universe_rect', canvas_rect);
        var fundamentalDimension = options.fundamentalDimension !== undefined ? options.fundamentalDimension : 2;
        var wavelengthScale = options.wavelengthScale !== undefined ? options.wavelengthScale : 8;

        // Same init contract as setupWaveInterference: ground-up, brownianMotion:false.
        universe.init(fundamentalDimension, { wavelengthScale: wavelengthScale, brownianMotion: false });

        return { largeObjects: [] };
    }

    setupEmpty.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupEmpty: setupEmpty };
    } else {
        window.setupEmpty = setupEmpty;
    }

})();
