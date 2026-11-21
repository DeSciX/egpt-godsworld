/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupParticleWalk3D — Engine-agnostic 3D particle walk experiment factory.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * @param {Object} universe
 *   The engine universe instance (JS or WASM compat shim), not yet init'd.
 *   Obtained from `window.EGPTUniverse` via FrqtlApp.
 *
 * @param {Object} [options]
 *   Configuration overrides.
 *
 * @param {number} [options.fundamentalDimension=0]
 *   Base dimension index to simulate in. Units: dimension ordinal (integer).
 *
 * @param {number} [options.fundamentalWaveLength=64]
 *   Desired wavelength of emitted quanta. Units: pixels.
 *   Drives the wavelengthScale multiplier: Math.max(1, floor(λ/4)).
 *
 * @param {number} [options.velocity=1]
 *   Rightward emission velocity component (vx). Units: pixels/tick.
 *   With activeAxes.z=true the engine's transverse yo-yo fires on both y AND z.
 *
 * @returns {{ emitter: QuantumEmitter, largeObjects: [] }}
 *   emitter: the QuantumEmitter instance (supports setActive(), auto_fire).
 *   largeObjects: empty array (no collision screens in this experiment).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * With activeAxes:{x:true,y:true,z:true} forwarded to universe.init(), the
 * WASM engine arms THREE independent transverse axes. The rightward beam
 * (vx=1) drives quanta along x; the wave-walk coin-flip fires the yo-yo kick
 * on BOTH y AND z independently each tick (two transverse coins). This creates
 * a beam that SPREADS in both transverse directions as it propagates —
 * observable as growing z-spread in TickData.frameData[*].z.
 *
 * With only two axes (2D), the z column stays zero throughout. With three axes
 * the z-spread grows monotonically from tick 0 as the beam fans out into 3D
 * space. This is the realm-observable proof that the engine's 3D motion model
 * (Invariant 1: per-axis ±1 speed limit, independent per axis) is live.
 *
 * The stochastic stack-up (base-walk + yo-yo on the same axis) can push a
 * quantum ±2 px/tick on any single axis when both mechanisms fire in the same
 * direction. This is deliberate (§6.10 isotropy oracle) — do NOT clamp it.
 *
 * See: FRAQTL CLAUDE.md §Engine Invariants §1; lib/frqtl/crates/egpt_engine/
 *      src/frame.rs move_frame + the §6.10 isotropy oracle.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { QuantumEmitter } from '../objects/QuantumEmitter.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────────

    // ── Setup Factory ────────────────────────────────────────────────────────
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupParticleWalk3D.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'fundamentalDimension', 'fundamentalWaveLength', 'velocity',
    ];

    function setupParticleWalk3D(universe, options) {
        options = _assertSetupOptions('setupParticleWalk3D', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupParticleWalk3D universe.universe_rect', canvas_rect);

        var fundamentalDimension = options.fundamentalDimension !== undefined
            ? options.fundamentalDimension : 0;
        var desiredWaveLength = options.fundamentalWaveLength !== undefined
            ? options.fundamentalWaveLength : 64;
        var velocity = options.velocity !== undefined ? options.velocity : 1;

        var waveLengthMultiplier = Math.floor(desiredWaveLength / 4);
        waveLengthMultiplier = Math.max(1, waveLengthMultiplier);

        var vx = velocity;
        var vy = 0;

        // Init universe with full 3D active axes.
        // activeAxes:{x,y,z} is the camelCase option shape validated by wasm-engine.js;
        // it maps to config.active_axes = {x,y,z} forwarded to the Rust engine.
        universe.init(fundamentalDimension, {
            wavelengthScale: waveLengthMultiplier,
            brownianMotion: false,
            activeAxes: { x: true, y: true, z: true }
        });
        universe.minMBFillRate = 0.2;

        // Emitter at canvas centre, firing rightward (vx=1, vy=0).
        // The engine's z-axis yo-yo kicks are transverse to the beam direction —
        // they emerge autonomously from the coin-flip walk; we do not set vz here.
        var cx = Math.floor(canvas_rect.w / 2);
        var cy = Math.floor(canvas_rect.h / 2);
        var sourceHeight = 10;
        var sourceRect = [cx, cy, 1, sourceHeight];

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
            false      // wrap = false (quanta die at canvas boundary)
        );

        return {
            emitter: emitter,
            largeObjects: []
        };
    }

    // ── Export ───────────────────────────────────────────────────────────────

    setupParticleWalk3D.OPTIONS = OPTIONS;

    export { setupParticleWalk3D };

