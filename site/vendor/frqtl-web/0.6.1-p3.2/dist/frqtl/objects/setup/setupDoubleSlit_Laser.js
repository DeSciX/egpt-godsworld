/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupDoubleSlit_Laser — Laser-style double-slit experiment factory.
 *
 * Replaces the radial PointSource with a directional QuantumEmitter (like a
 * circuit battery). Particles fire rightward with initial momentum; the
 * engine's brownian motion + wave-walk creates the lateral displacement that
 * produces interference.
 *
 * Slit geometry uses d/a ≈ 5 to match real-world HeNe laser teaching-lab
 * proportions (slit separation / slit width ≈ 5).
 *
 * Includes single-photon mode: fires one particle at a time from a random
 * spot on the laser aperture, demonstrating that individual particles still
 * build up the interference pattern.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { SlitScreen } from '../../parts/SlitScreen.js';
import { QuantumEmitter } from '../objects/QuantumEmitter.js';
import { DetectorWall } from '../../parts/DetectorWall.js';
import { LargeObject } from '../../parts/LargeObject.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────

    // ── Defaults ────────────────────────────────────────────────────────

    var DEFAULT_VOLTAGE = 2;      // vx: rightward momentum
    var DEFAULT_AMPERAGE = 8;     // particles per tick
    var DEFAULT_SLIT_HEIGHT = 20; // px — slit opening (a), gives d/a ≈ 5
    var DEFAULT_GAP_HEIGHT = 80;  // px — inter-slit wall, gives d = a + gap = 100
    var SINGLE_PHOTON_DELAY = 8;  // ticks between single-photon emissions

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create a laser-style double-slit experiment.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM), not yet init'd
     * @param {Object} options - Configuration
     * @param {number} [options.wavelength=64] - Wavelength for screen positioning
     * @param {number} [options.fundamentalDimension=2] - Base dimension
     * @param {number} [options.detectAtSlits=1] - Slit detection mode (0/1/2)
     * @param {boolean} [options.absorbAtSlitWall=true] - Absorb vs block at walls
     * @param {number} [options.wavelengthScale] - Override wavelength constant
     * @param {number} [options.voltage=2] - Rightward momentum (vx)
     * @param {number} [options.amperage=8] - Particles per tick
     * @param {boolean} [options.singlePhoton=false] - Single-photon mode
     * @param {number} [options.slitHeight=20] - Slit opening height (px)
     * @param {number} [options.gapHeight=80] - Inter-slit wall height (px)
     * @returns {Object} { slitScreen, emitter, detectorWall, startWall, interferenceParams, largeObjects, setSinglePhoton }
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupDoubleSlit_Laser.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'absorbAtSlitWall', 'amperage', 'detectAtSlits',
        'fundamentalDimension', 'gapHeight', 'singlePhoton', 'slitHeight',
        'voltage', 'wavelength', 'wavelengthScale',
    ];

    function setupDoubleSlit_Laser(universe, options) {
        options = _assertSetupOptions('setupDoubleSlit_Laser', options, OPTIONS);

        var wavelength = options.wavelength !== undefined ? options.wavelength : 64;
        var fundamentalDimension = options.fundamentalDimension !== undefined ? options.fundamentalDimension : 2;
        var detectAtSlits = options.detectAtSlits !== undefined ? options.detectAtSlits : 1;
        var absorbAtSlitWall = options.absorbAtSlitWall !== undefined ? options.absorbAtSlitWall : true;
        var canvasRect = universe.universe_rect;
        // The world height, through the ONE world-rect normalizer (throws on a missing or
        // non-positive dimension — a zero-high screen would count nothing, silently).
        var canvasH = _requireWorldRect('setupDoubleSlit_Laser universe.universe_rect', canvasRect).h;
        var voltage = options.voltage !== undefined ? options.voltage : DEFAULT_VOLTAGE;
        var amperage = options.amperage !== undefined ? options.amperage : DEFAULT_AMPERAGE;
        var singlePhoton = options.singlePhoton || false;
        var slitHeight = options.slitHeight !== undefined ? options.slitHeight : DEFAULT_SLIT_HEIGHT;
        var gapHeight = options.gapHeight !== undefined ? options.gapHeight : DEFAULT_GAP_HEIGHT;

        // Wavelength constant: higher values create coarser wave-walk oscillation,
        // producing wider, more detectable interference fringes. 32 gives stable
        // 4/4 interference tests with ~4000 hits at 5×5000. Lower values (4-16)
        // produce finer fringes that wash out with aggregated data.
        var wavelengthScale = options.wavelengthScale !== undefined
            ? options.wavelengthScale
            : 32;

        universe.wavelengthScale = wavelengthScale;

        // Init universe: ground-up mode with wave-walk (NOT brownian motion).
        // brownianMotion:false disables brownian motion, enabling the wave-walk
        // movement mode where particles move 1px along velocity + 1px perpendicular
        // via the wavelength-driven coin-flip. This is what produces interference.
        // (brownianMotion=true would enable pure random walk, which diffuses the pattern.)
        universe.init(
            fundamentalDimension,
            {
                wavelengthScale: wavelengthScale,
                brownianMotion: false,   // enables wave-walk mode
            }
        );

        // ── Slit Screen (d/a ≈ 5 geometry) ─────────────────────────────
        var slitScreenLeft = wavelength * 1.5;
        var slitScreen = new SlitScreen(
            universe,
            slitScreenLeft,
            wavelength,       // wall thickness
            canvasH,
            wavelength,
            absorbAtSlitWall,
            detectAtSlits,
            slitHeight,       // override: narrower slits
            gapHeight         // override: wider gap
        );

        // ── Start Wall (absorb wall at left edge) ──────────────────────
        var startWall = new LargeObject(
            universe,
            [0, 0, 10, canvasH],
            CollisionTypes.ABSORB,
            // RECOLOR removed: deleted in the engine-no-color cut (I1). Stale dead reference.
            // KILL removed: was a Rust-only divergence, deleted from canonical action set.
            // The ABSORB collision type already absorbs frames; no action needed here.
            [],
            'start_wall',
            'closest',
            null,
            1,
            [120, 120, 120]
        );

        // ── Laser Emitter ──────────────────────────────────────────────
        // Two source rects, one aligned with each slit, positioned close to the
        // slit screen (x = slitScreenLeft - 6). The wave-walk's coin-flip has a
        // strong directional bias at high wavelengthScale; placing the source
        // close minimizes pre-slit drift, keeping slit1/slit2 ratio near 1.0.
        var laserX = slitScreenLeft - 6;
        var sourceRect1 = [laserX, slitScreen.slit1_top, 4, slitScreen.slit_height];
        var sourceRect2 = [laserX, slitScreen.slit2_top, 4, slitScreen.slit_height];

        var effectiveBurst = singlePhoton ? 1 : amperage;
        var effectiveDelay = singlePhoton ? SINGLE_PHOTON_DELAY : 0;

        var emitter = new QuantumEmitter(
            universe,
            [sourceRect1, sourceRect2],
            voltage, 0,         // vx=rightward, vy=0
            effectiveBurst,
            null,               // random charge
            true,               // auto_fire
            false,              // directional (not random)
            Infinity,           // unlimited quanta
            effectiveDelay      // delay between bursts
        );

        // ── Detector Wall ──────────────────────────────────────────────
        var detectorWallX = slitScreen.wall1.rect.left + slitScreen.wall1.rect.w + 3 * wavelength;
        var detectorWall = new DetectorWall(
            universe,
            canvasRect,
            detectorWallX
        );

        // ── Interference parameters ────────────────────────────────────
        var d_distance_between_slits = slitScreen.slit_height + slitScreen.slit_wall_gap_height;
        var L_distance_slits_to_screen = detectorWall.x - (slitScreen.wall1.rect.left + slitScreen.wall1.rect.w);

        // ── Collect all large objects for rendering ─────────────────────
        var largeObjects = [];
        for (var wi = 0; wi < slitScreen.walls.length; wi++) {
            largeObjects.push(slitScreen.walls[wi]);
        }
        largeObjects.push(startWall);
        largeObjects.push(detectorWall.detector_wall);

        // ── Single-photon toggle ────────────────────────────────────────
        var currentAmperage = amperage;

        function setSinglePhoton(enabled) {
            if (enabled) {
                emitter.setBurstSize(1);
                // Delay is set at registration; re-register or use setActive to pace
                // For now, burst_size=1 is the primary control
            } else {
                emitter.setBurstSize(currentAmperage);
            }
        }

        function setAmperage(newAmperage) {
            currentAmperage = newAmperage;
            emitter.setBurstSize(newAmperage);
        }

        function setVoltage(newVoltage) {
            emitter.setVelocity(newVoltage, 0);
        }

        return {
            slitScreen: slitScreen,
            emitter: emitter,
            detectorWall: detectorWall,
            startWall: startWall,
            interferenceParams: {
                d: d_distance_between_slits,
                L: L_distance_slits_to_screen,
                wavelength: wavelength
            },
            largeObjects: largeObjects,
            setSinglePhoton: setSinglePhoton,
            setAmperage: setAmperage,
            setVoltage: setVoltage
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupDoubleSlit_Laser.OPTIONS = OPTIONS;

    export { setupDoubleSlit_Laser };

