/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupOscillator — oscillator (EGPT Fractal) experiment factory.
 *
 * Builds a three-level frame hierarchy: observer > oscillator > quantum.
 * The quantum does a random walk inside the oscillator while compress()
 * pulls it toward the center, creating stable oscillation. The oscillator
 * moves inside the observer, producing an emergent wave pattern.
 *
 * Uses the STANDARD JS-reference interface (Frame.makeLeafFrame, dimension.addFrame,
 * dimension.createFrameFromRect via EgptFractal). The shim's boundary Dimension
 * covers these: JS engine forwards natively; WASM engine logs+null for APIs not
 * yet implemented in Rust and degrades gracefully.
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

    var EgptFractal;

    if (typeof module !== 'undefined' && module.exports) {
        EgptFractal = require('../objects/EgptFractal').EgptFractal;
    } else {
        EgptFractal = window.EgptFractal;
    }

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create the oscillator (EGPT Fractal) experiment.
     *
     * The canvas bounds come from `universe.universe_rect` — the universe owns its rect.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM boundary object)
     * @param {Object} options - Configuration
     * @returns {Object} { fractal, quantum, oscillator, observer }
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupOscillator.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [];

    function setupOscillator(universe, options) {
        options = _assertSetupOptions('setupOscillator', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupOscillator universe.universe_rect', canvas_rect);

        var fractal = new EgptFractal(universe, canvas_rect);
        fractal.setupFractal();

        return {
            fractal: fractal,
            quantum: fractal.quanta[0],
            oscillator: fractal.oscillator,
            observer: fractal.observer_frame
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupOscillator.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupOscillator: setupOscillator };
    } else {
        window.setupOscillator = setupOscillator;
    }

})();
