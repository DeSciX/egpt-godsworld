/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupFxSmoke — Emergent smoke experiment via voxel size-up ladder.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * @param {Object} universe - The engine universe instance (JS or WASM compat shim),
 *   not yet init'd. `universe.init` is called internally.
 * @param {Object} [options] - Configuration overrides.
 * @param {number} [options.velocity=1]
 *   Rightward emission velocity (px/tick). Units: pixels/tick.
 * @param {number} [options.fundamentalWaveLength=64]
 *   Desired wavelength for emitted quanta. Units: pixels.
 *   Drives `wavelengthScale = max(1, floor(λ/4))`.
 * @param {number} [options.burstSize=20]
 *   Quanta emitted per tick from the beam source. Units: quanta/tick.
 * @param {number} [options.billowDimensions=3]
 *   Number of extra aggregation dimensions to register (voxel size-up ladder).
 *   dim0 = 1 px (fundamental leaf), dim+1 = 4 px, dim+2 = 8 px, dim+3 = 16 px.
 *   Each dimension represents bigger puffs once quanta aggregate into parent frames.
 *   Range: 1–4. Higher values produce larger maximum puff sizes but require more
 *   collision events to reach the top level.
 * @param {boolean} [options.brownianMotion=true]
 *   Enable Brownian (random) perturbation on each frame per tick. Keeps the beam
 *   from being perfectly laminar — essential for inter-quantum collision frequency.
 * @param {number} [options.bulletSpeed=2]
 *   Speed of the moving Bullet occluder (px/tick). When > 0 a Bullet is placed at
 *   the beam centre and advances rightward; its BOUNCE collision compresses quanta
 *   in the wake, driving aggregation into bigger frames (the smoke billow effect).
 *   Set to 0 to disable the bullet (pure-beam smoke, no projectile).
 * @param {string} [options.bulletCollision='BOUNCE']
 *   CollisionTypes value for the Bullet. BOUNCE deflects quanta; WALL stops them
 *   dead (sharper void). NONE makes the bullet a ghost (visual only, no physics).
 *
 * @returns {{
 *   emitter: QuantumEmitter,
 *   bullet: Bullet|null,
 *   largeObjects: LargeObject[]
 * }}
 *   bullet is null when options.bulletSpeed === 0.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * The smoke billow is EMERGENT PHYSICS, not a sprite trick. It mirrors the
 * Blackbody aggregation mechanic (the blackbody showcase scene):
 *
 *   universe.withInterQuantumCollisions = true
 *     → colliding quanta PARENT into compound frames (merge/promote pipeline)
 *
 *   addDimension(layer) for each size-up step
 *     → the engine's Phase B (STRUCTURE) builds higher-dimension frames from
 *       fundamental-quadtree collisions, growing compound frames with larger rect.w
 *       (2× per level: 1 px → 4 px → 8 px → 16 px)
 *
 *   Bullet (BOUNCE) advancing rightward
 *     → compresses quanta in the beam's wake → higher local density
 *     → more inter-quantum collisions → faster aggregation up the size ladder
 *     → renderer reads each frame's rect.w and sizes the smoke puff accordingly
 *     → result: varied puff sizes, denser puffs in the wake → billowing smoke
 *
 * With no bullet (bulletSpeed=0), the beam still aggregates but more slowly —
 * you get a smooth column of growing puffs rather than a directional billow.
 *
 * With bullet (bulletSpeed>0) the wakes produce large aggregated frames whose
 * rect.w drives the renderer's `aSize` attribute (three-provider.js) → larger,
 * softer puff sprites. Faster bullet = denser wake = bigger emergent frames.
 *
 * OBSERVED effect (design intent — verified in the realm):
 *   fx-smoke: at tick ~200 puffs range from 1 px (single leaf) to 8–16 px
 *   (aggregated compound frames). The bullet wake region shows higher density
 *   and larger puff sizes than the undisturbed beam. Adjusting the `puff` slider
 *   (render control, three-provider) scales the sprite size for each puff — the
 *   variance in sizes is physics, not the slider. Figure TBD (realm verification).
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { QuantumEmitter } from '../objects/QuantumEmitter.js';
import { Bullet } from '../objects/Bullet.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────────

    // ── Voxel-ladder dimension levels ────────────────────────────────────────
    //
    // The JS reference engine uses integer layer numbers; addDimension(n) registers
    // a new quadtree level at scale n. The WASM engine's add_dimension() mirrors this.
    // Blackbody uses fundamental_dim=0 + quantum_dim=4 (one extra level).
    //
    // For the smoke ladder we want multiple extra levels so frames can aggregate into
    // progressively larger puffs. The layer numbers determine the relative cell size:
    //   layer 0 = fundamental (1 px leaf quanta)
    //   layer 4 = first aggregation level (cell ≈ 4 px)
    //   layer 8 = second aggregation level (cell ≈ 8 px)
    //   layer 12 = third aggregation level (cell ≈ 16 px)
    //
    // These follow the same convention as Blackbody (quantum_dim=4).
    var BILLOW_DIMS = [4, 8, 12];   // up to 3 extra levels; trimmed by billowDimensions option

    // ── Setup factory ────────────────────────────────────────────────────────
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupFxSmoke.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'billowDimensions', 'brownianMotion', 'bulletCollision', 'bulletSpeed',
        'burstSize', 'fundamentalWaveLength', 'velocity',
    ];

    function setupFxSmoke(universe, options) {
        options = _assertSetupOptions('setupFxSmoke', options, OPTIONS);

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvas_rect = universe.universe_rect;
        _requireWorldRect('setupFxSmoke universe.universe_rect', canvas_rect);

        var desiredWaveLength  = options.fundamentalWaveLength !== undefined ? options.fundamentalWaveLength : 64;
        var velocity           = options.velocity              !== undefined ? options.velocity              : 1;
        var burstSize          = options.burstSize             !== undefined ? options.burstSize             : 20;
        var billowDimensions   = options.billowDimensions      !== undefined ? options.billowDimensions      : 3;
        var useBrownian        = options.brownianMotion        !== undefined ? options.brownianMotion        : true;
        var bulletSpeed        = options.bulletSpeed           !== undefined ? options.bulletSpeed           : 2;
        var bulletCollision    = options.bulletCollision       !== undefined ? options.bulletCollision       : CollisionTypes.BOUNCE;

        var waveLengthMultiplier = Math.max(1, Math.floor(desiredWaveLength / 4));

        // ── Universe init ─────────────────────────────────────────────────────
        // fundamental_dim=0 — leaf quanta are 1-px frames.
        // withInterQuantumCollisions = true — inter-quantum collisions drive the
        // merge/promote pipeline (as the blackbody showcase scene sets it).
        universe.init(0, {
            wavelengthScale: waveLengthMultiplier,
            brownianMotion: false,
            activeAxes: { x: true, y: true, z: true }
        });

        // Brownian motion keeps the beam from laminar flow → more collisions.
        universe.brownianMotion = useBrownian;

        // The Blackbody aggregation mechanic: colliding quanta parent up into
        // compound frames that occupy progressively larger cells in the quadtree.
        universe.withInterQuantumCollisions = true;

        // Register the voxel size-up ladder — a subset of BILLOW_DIMS trimmed to
        // billowDimensions entries (max 3 extra levels above fundamental dim=0).
        var dimsToAdd = Math.max(1, Math.min(billowDimensions, BILLOW_DIMS.length));
        for (var i = 0; i < dimsToAdd; i++) {
            universe.addDimension(BILLOW_DIMS[i]);
        }

        // ── Emitter ───────────────────────────────────────────────────────────
        // Beam source at canvas centre, firing rightward (3D walk).
        // The z-axis yo-yo kicks spread the beam into depth, giving the smoke
        // a 3D volumetric appearance when viewed from an orbit angle.
        var cx = Math.floor(canvas_rect.w / 2);
        var cy = Math.floor(canvas_rect.h / 2);
        var sourceHeight = 10;

        var emitter = new QuantumEmitter(
            universe,
            [[cx, cy - Math.floor(sourceHeight / 2), 1, sourceHeight]],
            velocity, 0,
            burstSize,
            1,          // charge = NEGATIVE
            true,       // auto_fire
            false,      // not random_direction
            Infinity,   // quantum_limit
            0,          // delay
            false       // wrap = false
        );

        // ── Bullet (optional) ─────────────────────────────────────────────────
        // A small BOUNCE LO placed at the beam source, advancing rightward.
        // Its moving wake compresses quanta → more inter-quantum collisions →
        // aggregation into bigger frames → billowing smoke puffs (Effect C per design).
        var bullet = null;
        if (bulletSpeed > 0 && Bullet) {
            bullet = new Bullet(universe, {
                x:             cx,
                y:             cy - 4,
                w:             8,
                h:             8,
                speed:         bulletSpeed,
                collisionType: bulletCollision,
                color:         [40, 40, 40],
                name:          'smoke_bullet',
                loop:          true
            });
        }

        return {
            emitter:      emitter,
            bullet:       bullet,
            largeObjects: bullet ? [bullet.lo] : []
        };
    }

    // ── Export ───────────────────────────────────────────────────────────────

    setupFxSmoke.OPTIONS = OPTIONS;

    export { setupFxSmoke };

