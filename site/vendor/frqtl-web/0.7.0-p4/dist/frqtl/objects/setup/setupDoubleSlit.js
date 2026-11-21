/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupDoubleSlit — Engine-agnostic double-slit experiment factory.
 * Creates the complete DSE setup: slit screen, light source, detector wall.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { SlitScreen } from '../../parts/SlitScreen.js';
import { SlitLightSource } from '../../parts/SlitLightSource.js';
import { DetectorWall } from '../../parts/DetectorWall.js';
import { LargeObject } from '../../parts/LargeObject.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create a double-slit experiment.
     *
     * Assembles the complete DSE: a radial light source ({@link SlitLightSource}),
     * a two-slit barrier ({@link SlitScreen}), and a counting detector wall
     * ({@link DetectorWall}). There is no wave equation — each leaf Frame makes a
     * local 1px/tick choice. The interference pattern at the detector wall is
     * emergent from where the two particle streams overlap after passing through
     * the slits.
     *
     * ## Physics you can drive
     *
     * **`options.wavelength`** is the single geometry master knob (default 64).
     * It simultaneously scales every physical dimension of the experiment:
     *
     * | Derived quantity | Formula |
     * |---|---|
     * | Slit opening height | `floor(wavelength * 0.8)` px |
     * | Inter-slit gap height | `floor(wavelength * 0.8)` px |
     * | Slit screen left edge | `wavelength * 1.5` px from canvas left |
     * | Detector wall x | `screenLeft + screenWidth + 3 * wavelength` px |
     * | Universe `wavelengthScale` (derived) | `floor(wavelength / 16)` |
     *
     * Raising `wavelength` enlarges slits, widens the gap, moves the detector
     * further right, and increases the universe oscillation period. The canonical
     * operating point for a 600×600 canvas is `wavelength = 64`: at this value
     * the complete geometry (source → screen → detector) fits within the canvas,
     * both slits receive balanced illumination (slit1/slit2 hit ratio ≈ 1.0), and
     * a clear multi-band interference pattern emerges on the detector histogram.
     *
     * Below 64: geometry shrinks; the slits become too small for balanced
     * illumination and the pattern is suppressed. Above 64 on a 600×600 canvas:
     * geometry exceeds the canvas and the detector wall falls off-screen.
     *
     * Observed sweep (engine = js, seed 42, tick 400):
     *
     * | `wavelength` | `wavelengthScale` | Active quanta | Slit1/Slit2 ratio | Field |
     * |---|---|---|---|---|
     * | 16 | 1 | ~556 | 0.04 | pattern compressed into left sixth of canvas |
     * | 32 | 2 | ~2032 | 0.44 | moderate spread, unbalanced slit hits |
     * | **64** (default) | **4** | ~3601 | **0.98** | full canvas, clear interference bands |
     * | 128 | 8 | ~6029 | — | geometry exceeds canvas; detector not reached at tick 400 |
     *

     * **Disambiguate from wave-interference `wavelengthScale`:** the DSE
     * `wavelength` scales PHYSICAL GEOMETRY (moves walls). The wave-interference
     * `wavelengthScale` in `setupWaveInterference` only scales the per-Frame
     * oscillation period without moving anything. In the DSE, `wavelengthScale`
     * is a derived quantity — it is set internally as `floor(wavelength / 16)` and
     * is not a free input unless you pass `options.wavelengthScale` explicitly.
     *
     * **`options.detectAtSlits`** controls the measurement mode at the slit openings:
     * - `0` — no detection (slits are transparent pass-through zones)
     * - `1` (default) — detect + scatter (`RANDOM_XY` collision type) — the act of
     *   detection disturbs the particle's trajectory (canonical "which-slit" measurement)
     * - `2` — detect + color only (no trajectory disturbance); used for visualization
     *
     * @param {Object} universe - The engine universe instance (JS or WASM), not yet init'd.
     * @param {Object} [options] - Configuration overrides.
     * @param {number} [options.wavelength=64] - Geometry master knob: scales slit size,
     *   inter-slit gap, wall positions, detector distance, and derived
     *   `wavelengthScale`. See "Physics you can drive" above.
     * @param {number} [options.fundamentalDimension=2] - Fundamental (leaf) dimension layer.
     * @param {number} [options.detectAtSlits=1] - Slit detection mode: 0=none,
     *   1=detect+scatter (RANDOM_XY), 2=detect+color only. Mode 1 is the canonical
     *   "which-slit" measurement.
     * @param {boolean} [options.absorbAtSlitWall=true] - If true, wall segments absorb
     *   particles on contact (no reflection). If false, walls block (reflect) particles.
     * @param {number} [options.wavelengthScale] - Override the derived universe
     *   `wavelengthScale` (normally `floor(wavelength/16)`). Use only when you want
     *   to decouple the oscillation scale from the geometry scale.
     * @param {number} [options.angleIncrement=10] - Degrees between emission angles
     *   from the light source. Smaller = more rays = smoother illumination cone;
     *   larger = coarser, more visible discrete rays.
     * @param {number} [options.depth] - total z-extent for a 3D run.
     *   OMITTED (default) → today's 2D behavior, byte-identical — no `activeAxes`
     *   key touched, every wall/screen/detector rect stays the legacy 4-element form,
     *   the light source's inner PointSource gets no z-draw at all. When provided:
     *   `universe.init()` gains `activeAxes:{x:true,y:true,z:true}` (mirrors
     *   `setupWaveInterference`'s `options.depth`); `SlitScreen`
     *   becomes a FLOOR-TO-CEILING 3D wall (the geometry amendment):
     *   `wall1`/`wall2`/`wall3` span the full z-depth `[-depth/2,+depth/2]`, and
     *   each slit becomes a CUBIC HOLE (bounded in BOTH y and z, see
     *   `options.holeDepth`) tiled from a solid near/far z-side pair around the
     *   aperture — NOT a full-depth-in-z slot (supersedes the earlier
     *   construction). The start-wall and detector wall get the SAME full-z-depth
     *   treatment (else z-spread quanta fly around/past them); `SlitLightSource`
     *   threads `zMin=-depth/2, zDepth=depth` into its inner PointSource — the
     *   IDENTICAL shared z-spread mechanism built for
     *   `setupWaveInterference` (`emitterProgram.js`'s opt-in `em.zMin`/`em.zDepth`),
     *   reused not forked. PHYSICS EXPECTATION (restated): the
     *   detector pattern is genuinely 2D — y-interference fringes × a z
     *   aperture-diffraction envelope (concentrated near the hole's z-band, NOT
     *   uniform across all z-bands — the old "every z-band identical" self-check
     *   is superseded).
     * @param {number} [options.holeDepth] - 3D only: z-extent of each cubic hole
     *   (centered on z=0). Default: the EFFECTIVE slit height (square-ish aperture
     *   at the default wavelength — see `SlitScreen`'s docstring for the exact
     *   value). Ignored when `options.depth` is omitted.
     * @param {'current'|'noreset'|'symmetric'|'combined'|'bounce'|'ejectY'|'ejectYReflect'} [options.slitScatter='current']
     *   EXPERIMENT LOOP: selects the slit
     *   liner's edge-diffraction scatter behavior. `'current'` (default, OMIT to
     *   keep it) is today's exact compiled `RANDOM_XY` — byte-identical, the
     *   ratified 2D golden (seed42/wl64/detect1/t400 -> 103/63/40) depends on
     *   it. See `SlitScreen`'s `_buildLinerVelocityOps` docstring for
     *   `noreset`/`symmetric`/`combined`/`bounce`, and `_buildEjectYOps`'s
     *   docstring for `ejectY`/`ejectYReflect` (MATRIX EXTENSION, 2026-07-12 — the
     *   standard block+eject idiom other LOs use, Y-into-the-cavity). Works
     *   identically on the 2D and 3D (`options.depth`) construction paths.
     * @param {number} [options.gapHeight] - DSE LAB (2026-07-13): inter-slit gap
     *   override — the "slit gap"/"slit-tunnel width" (the interference formula's
     *   `d`, read back via `interferenceParams.d`). OMITTED (default) -> SlitScreen's
     *   own default `floor(wavelength*0.8)`, byte-identical to every existing caller.
     *   REINIT-class knob: a live UI change must restart the experiment with a new
     *   value (no live LO rect-surgery path in v1).
     * @returns {Object} `{ slitScreen, slitLightSource, detectorWall, startWall,
     *   interferenceParams: { d, L, wavelength, depth? } }` where `d` = inter-slit gap
     *   height, `L` = distance from slit screen face to detector wall, and `depth`
     *   is present ONLY when `options.depth` was set (3D run).
     *
     * @example
     * // Two-cell notebook pattern (declarative-canvas model):
     * // module cell:
     * export function setupDS(frqtl, universe, opts) {
     *     return setupDoubleSlit(universe, {
     *         wavelength: opts.wavelength ?? 64,
     *         detectAtSlits: opts.detectAtSlits ?? 1,
     *         canvasRect: universe.universe_rect
     *     });
     * }
     * // canvas cell: setup="<module>#setupDS" opts='{"wavelength":64}' stage="600x600" seed="42"
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupDoubleSlit.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'absorbAtSlitWall', 'angleIncrement', 'depth',
        'detectAtSlits', 'fundamentalDimension', 'gapHeight', 'holeDepth',
        'slitScatter', 'wavelength', 'wavelengthScale',
    ];

    function setupDoubleSlit(universe, options) {
        options = _assertSetupOptions('setupDoubleSlit', options, OPTIONS);

        var wavelength = options.wavelength !== undefined ? options.wavelength : 64;
        var fundamentalDimension = options.fundamentalDimension !== undefined ? options.fundamentalDimension : 2;
        var detectAtSlits = options.detectAtSlits !== undefined ? options.detectAtSlits : 1;
        var absorbAtSlitWall = options.absorbAtSlitWall !== undefined ? options.absorbAtSlitWall : true;
        var canvasRect = universe.universe_rect;
        // The world height, through the ONE world-rect normalizer (throws on a missing or
        // non-positive dimension — a zero-high screen would count nothing, silently).
        var canvasH = _requireWorldRect('setupDoubleSlit universe.universe_rect', canvasRect).h;
        var angleIncrement = options.angleIncrement !== undefined ? options.angleIncrement : 10;
        // Opt-in 3D depth. undefined/null → 2D, byte-identical.
        var depth = (options.depth !== undefined && options.depth !== null) ? options.depth : null;
        // The geometry amendment: cubic-hole z-extent. undefined -> SlitScreen
        // applies its own default (the effective slit_height). 2D-inert.
        var holeDepth = (options.holeDepth !== undefined && options.holeDepth !== null) ? options.holeDepth : undefined;
        // EXPERIMENT LOOP (2026-07-12): liner edge-diffraction scatter variant.
        // 'current' (default/omitted) -> today's exact RANDOM_XY, byte-identical —
        // the ratified 2D golden depends on this. Works identically in 2D and 3D.
        var slitScatter = options.slitScatter !== undefined ? options.slitScatter : 'current';
        // DSE LAB (2026-07-13): inter-slit gap override ("slit gap" / "slit-tunnel
        // width" — the interference formula's `d`). undefined (default) -> SlitScreen's
        // own default (floor(wavelength*0.8)), byte-identical to every existing caller.
        // REINIT-class: a live change restarts the experiment with a new value; there
        // is no live LO rect-surgery path (v1).
        var gapHeight = (options.gapHeight !== undefined && options.gapHeight !== null) ? options.gapHeight : undefined;

        // Wavelength constant: default to floor(wavelength / 16) matching original
        var wavelengthScale = options.wavelengthScale !== undefined
            ? options.wavelengthScale
            : Math.floor(wavelength / 16);

        // Set wavelength constant on universe
        universe.wavelengthScale = wavelengthScale;

        // Init universe: ground-up mode, brownianMotion:false (the wave-walk). activeAxes is ONLY
        // attached when a 3D depth was requested — omission keeps the exact init()
        // call every existing 2D caller (incl. the settlement CLI/golden) gets.
        var initOpts = {
            wavelengthScale: wavelengthScale,
            brownianMotion: false,
        };
        if (depth !== null) {
            initOpts.activeAxes = { x: true, y: true, z: true };
        }
        universe.init(fundamentalDimension, initOpts);

        // ── Slit Screen ──────────────────────────────────────────────────
        var slitScreenLeft = wavelength * 1.5;
        var slitScreen = new SlitScreen(
            universe,
            slitScreenLeft,
            wavelength,
            canvasH,
            wavelength,
            absorbAtSlitWall,
            detectAtSlits,
            undefined,  // slitHeight override (none)
            gapHeight,  // DSE LAB: inter-slit gap override (undefined -> SlitScreen default)
            depth,      // null (default) -> legacy 4-elem rects
            holeDepth,  // the geometry amendment: cubic-hole z-extent (2D-inert)
            slitScatter // EXPERIMENT LOOP: 'current' (default) -> byte-identical liner behavior
        );

        // ── Start Wall (absorb wall at left edge) ───────────────────────
        // Full-z-depth 6-elem rect when depth is set (Tube.js
        // precedent) — without it, z-spread quanta fly around a paper-thin (z=0,d=w)
        // start wall. depth===null (default) -> legacy 4-elem rect, byte-identical.
        var startWallRect = (depth !== null)
            ? [0, 0, -depth / 2, 10, canvasH, depth]
            : [0, 0, 10, canvasH];
        var startWall = new LargeObject(
            universe,
            startWallRect,
            CollisionTypes.ABSORB,
            // RECOLOR removed: deleted in the engine-no-color cut (I1). Stale dead reference.
            // The ABSORB collision type already absorbs frames; no action needed here.
            [],
            'start_wall',
            'closest',
            null,
            1,
            [120, 120, 120]
        );
        // Render: the Tube.js precedent — a 6-element
        // rect gives the ENGINE a real z-slab, but _buildLoMesh (three-provider.js)
        // only builds a 3D BoxGeometry when the LO ALSO carries the render-only
        // `shape='box'` + `depth` hint (see SlitScreen.js for the identical fix).
        if (startWall.rect.d !== undefined) {
            startWall.shape = 'box';
            startWall.depth = startWall.rect.d;
        }

        // ── Light Source ─────────────────────────────────────────────────
        var slitLightSource = new SlitLightSource(
            universe,
            slitScreen,
            angleIncrement,
            undefined,  // quantum_limit (default)
            undefined,  // delay (default)
            { depth: depth }  // null (default) -> no z-draw at all
        );

        // ── Detector Wall ────────────────────────────────────────────────
        var detectorWallX = slitScreen.wall1.rect.left + slitScreen.wall1.rect.w + 3 * wavelength;
        var detectorWall = new DetectorWall(
            universe,
            canvasRect,
            detectorWallX,
            undefined, undefined, undefined, undefined, undefined, undefined,
            { depth: depth }  // null (default) -> legacy 4-elem rect
        );

        // ── Tick function ────────────────────────────────────────────────
        var tickFunction = slitLightSource.getTickFunction();
        universe.experimentTickFunctions.push(tickFunction);

        // ── Interference parameters (for chart/analysis) ─────────────────
        var d_distance_between_slits = slitScreen.slit_wall_gap_height;
        var L_distance_slits_to_screen = detectorWall.x - (slitScreen.wall1.rect.left + slitScreen.wall1.rect.w);

        // ── Collect all large objects for rendering ───────────────────────
        var largeObjects = [];
        // Slit screen walls + slit liners
        for (var wi = 0; wi < slitScreen.walls.length; wi++) {
            largeObjects.push(slitScreen.walls[wi]);
        }
        largeObjects.push(startWall);
        largeObjects.push(detectorWall.detector_wall);

        // §2.1: depth key present ONLY on a 3D run —
        // a 2D interferenceParams object has the EXACT SAME key set as a 2D-only build.
        var interferenceParams = {
            d: d_distance_between_slits,
            L: L_distance_slits_to_screen,
            wavelength: wavelength
        };
        if (depth !== null) {
            interferenceParams.depth = depth;
        }

        return {
            slitScreen: slitScreen,
            slitLightSource: slitLightSource,
            detectorWall: detectorWall,
            startWall: startWall,
            interferenceParams: interferenceParams,
            largeObjects: largeObjects
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupDoubleSlit.OPTIONS = OPTIONS;

    export { setupDoubleSlit };

