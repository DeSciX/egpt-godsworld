/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupG1Race — UNIT-TEST experiment G1: "LO (a Frame) races a Dim-0 quantum".
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * @param {Object} universe - Engine universe (WASM; this experiment is wasmOnly).
 * @param {Object} [opts]
 * @param {number} [opts.speedProb=0.5] - Initial speed probability for the "LO" frame.
 * @returns {{ loHandle, loQid, quantumHandle, startX, speedProb }}
 *   loQid — the QUANTUM_ID of the LO frame (use with setFrameProperty — NOT loHandle).
 *
 * ── Layer 2: physics behavior (what this PROVES) ─────────────────────────────
 * The realization of "an LO extends Frame": both racers are LEAF FRAMES moving
 * rightward (vx=1), wrapping the canvas. The reference is a Dim-0 "light" quantum —
 * a fundamental particle that ALWAYS steps (P=1, the speed limit). The "LO" is a
 * larger Dim-2 leaf (4px voxel) that takes its along-momentum step with probability
 * = its `speed_prob` (default 0.5) — so it falls behind the light at a rate set by
 * that probability (E=MC²: a fuller/heavier frame's children have fewer free pixels,
 * so more of a push converts to motion; here the user sets the probability directly).
 * The orthogonal wavelength (transverse jitter) is unchanged — only the forward rate
 * is gated. Sweeping speed_prob 1.0 → 0 sweeps the LO from light-speed to frozen.
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
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupG1Race.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'loLevel', 'speedProb',
    ];


    function setupG1Race(universe, opts) {
        opts = _assertSetupOptions('setupG1Race', opts, OPTIONS);
        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var rect = universe.universe_rect;
        var ch = _requireWorldRect('setupG1Race universe.universe_rect', rect).h;
        var startX = 30;
        var speedProb = (opts.speedProb !== undefined) ? opts.speedProb : 0.5;

        // 2D walk: a gentle transverse wavelength so the racers jitter sideways a little
        // while the LONGITUDINAL race (the speed_prob gate) is the visible story.
        universe.init(0, { wavelengthScale: 16, brownianMotion: false });

        // Register Dim 6 so the "LO" can be a 64px voxel/frame there — a big body that
        // renders clearly as a cube in 3D. The leaf still moves under the move pass; the
        // gate applies. (mass fullness has a color interpretation via LightColor/Chroma.)
        var loLevel = (opts.loLevel !== undefined) ? opts.loLevel : 6;   // 2^6 = 64px voxel
        universe.addDimension(loLevel);

        // Reference: a Dim-0 LIGHT quantum (always P=1), blue, wrapping.
        var quantumHandle = universe.makeLeafFrame(
            startX, Math.floor(ch * 0.32), 0, null, 1, 0, true, 0, [120, 200, 255]);
        universe.injectFrame(quantumHandle);

        // The "LO": a Dim-6 leaf (64px voxel), gold, wrapping — moves with a speed probability.
        var loHandle = universe.makeLeafFrame(
            startX, Math.floor(ch * 0.62), loLevel, null, 1, 0, true, 0, [255, 180, 80]);
        universe.injectFrame(loHandle);

        // set/getFrameProperty key on the QUANTUM_ID, not the makeLeafFrame handle.
        var loQid = universe.getFrameQuantumId(loHandle);
        universe.setFrameProperty(loQid, 'speed_prob', speedProb);

        return { loHandle: loHandle, loQid: loQid, quantumHandle: quantumHandle,
                 startX: startX, speedProb: speedProb };
    }

    setupG1Race.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupG1Race: setupG1Race };
    } else {
        window.setupG1Race = setupG1Race;
    }

})();
