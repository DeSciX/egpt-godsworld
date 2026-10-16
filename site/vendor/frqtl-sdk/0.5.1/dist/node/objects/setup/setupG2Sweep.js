/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupG2Sweep — UNIT-TEST experiment G2: a MOVING LargeObject (LO extends Frame)
 * sweeps a field of stationary targets and its collision trigger ABSORBS them.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * @param {Object} universe - WASM universe (this experiment is wasmOnly).
 * @param {Object} [opts]
 * @param {number} [opts.speedProb=0.6] - Speed probability of the LO's backing frame.
 * @returns {{ lo, bodyHandle, bodyQid, targets:number, searchW:number }}
 *
 * ── Layer 2: physics behavior (what this PROVES) ─────────────────────────────
 * G2 = "an LO extends Frame" by COMPOSITION. A `LargeObject` is linked to a BACKING
 * FRAME (a moving leaf) via setLargeObjectFrame; the engine re-centers the LO's search
 * rect on the frame every tick, so the LO MOVES via the normal move pass + speed_prob
 * gate (G1). Its search rect (searchW) is LARGER than the 1px body — collisions fire
 * over the rect, not the frame. The LO's `on:'collision'` op-program (ABSORB here)
 * runs across its observed dimensions. So the LO both moves like a Frame AND triggers
 * multi-dimensionally — with the backing frame excluded from its own trigger.
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

    var LargeObject, CollisionTypes;
    if (typeof module !== 'undefined' && module.exports) {
        LargeObject    = require('../objects/LargeObject').LargeObject;
        CollisionTypes = require('../constants/CollisionTypes').CollisionTypes;
    } else {
        LargeObject    = window.LargeObject;
        CollisionTypes = window.CollisionTypes;
    }
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupG2Sweep.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'speedProb',
    ];


    function setupG2Sweep(universe, opts) {
        opts = _assertSetupOptions('setupG2Sweep', opts, OPTIONS);
        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var rect = universe.universe_rect;
        var world = _requireWorldRect('setupG2Sweep universe.universe_rect', rect);
        var cw = world.w, ch = world.h;
        var speedProb = (opts.speedProb !== undefined) ? opts.speedProb : 0.6;

        universe.init(0, { wavelengthScale: 1, brownianMotion: false });

        // ── Target field: a grid of STATIONARY quanta the LO will sweep through. ──
        var targets = 0;
        for (var gx = Math.floor(cw * 0.28); gx <= Math.floor(cw * 0.82); gx += 36) {
            for (var gy = Math.floor(ch * 0.22); gy <= Math.floor(ch * 0.78); gy += 36) {
                var th = universe.makeLeafFrame(gx, gy, 0, null, 0, 0, false, 0, [90, 150, 220]);
                universe.injectFrame(th);
                universe.setFrameProperty(universe.getFrameQuantumId(th), 'is_stationary', true);
                targets++;
            }
        }

        // ── LO BODY: a leaf moving rightward (speed_prob gated), mid-height. ──
        var bodyY = Math.floor(ch * 0.5);
        var bodyHandle = universe.makeLeafFrame(20, bodyY, 0, null, 1, 0, false, 0, [255, 120, 80]);
        universe.injectFrame(bodyHandle);
        var bodyQid = universe.getFrameQuantumId(bodyHandle);
        universe.setFrameProperty(bodyQid, 'speed_prob', speedProb);

        // ── The LO: a TALL search rect (covers the field height) + ABSORB trigger. ──
        // Its rect (searchW × searchH) is far larger than the 1px body — the collision
        // fires over the rect. ABSORB kills any (non-body) frame inside it.
        var searchW = 40, searchH = Math.floor(ch * 0.72);
        var lo = new LargeObject(
            universe,
            [20 - searchW / 2, bodyY - searchH / 2, searchW, searchH],
            CollisionTypes.NONE, ['ABSORB'],
            'g2_sweeper', 'closest', null, 1, [255, 120, 80]
        );
        // Link the LO to its backing frame → it MOVES with the body each tick.
        universe.setLargeObjectFrame(lo.handle, bodyHandle);

        return { lo: lo, bodyHandle: bodyHandle, bodyQid: bodyQid,
                 targets: targets, searchW: searchW, searchH: searchH, bodyY: bodyY };
    }

    setupG2Sweep.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupG2Sweep: setupG2Sweep };
    } else {
        window.setupG2Sweep = setupG2Sweep;
    }

})();
