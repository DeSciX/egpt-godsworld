/* Copyright 2023-2026 by Essam Abadir */

/**
 * SlitLightSource — Engine-agnostic light source for the double-slit experiment.
 * Creates a PointSource centered between the two slits of a SlitScreen.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

import { PointSource } from './PointSource.js';
import { registerKind } from '../objects/kinds.js';
import { V1_REPLACEMENTS } from '../objects/v1-replacements.js';

    // ── Imports (Node.js) or globals (browser) ──────────────────────────

    // ── SlitLightSource ──────────────────────────────────────────────────

    /**
     * Radial point source positioned to illuminate both slits evenly.
     *
     * A thin wrapper around {@link PointSource} that positions the source
     * automatically at the geometric center of the two slits: `x = 20`,
     * `y = slit_wall_gap_top + slit_wall_gap_height / 2`. This equidistant
     * placement ensures both slits receive identical particle flux, which is
     * required for the interference fringes to be symmetric.
     *
     * ## Physics you can drive
     *
     * **`angle_increment`** (default 10 degrees) controls how many emission rays
     * the source fires: `floor(360 / angle_increment)` rays. At 10° that is 36
     * rays. The emission cone must reach both slits — the source is placed at
     * x = 20 so rays at a wide range of angles hit the slit screen. Increasing
     * `angle_increment` thins the ray count (coarser illumination); decreasing it
     * increases ray density (smoother, more particle flux).
     *
     * **Emission radius** is hardcoded to `light_source_diameter / 2 = 8` px. Each
     * ray's initial velocity is `vx = 8 * cos(θ)`, `vy = 8 * sin(θ)` (the
     * `PointSource` emitter-registration pattern). The Universal Speed Limit caps
     * actual movement to 1px/tick; excess becomes accumulated momentum.
     *
     * **Particle wavelength / mass:** the source passes `slitScreen.wavelength` to
     * the inner `PointSource` as `opts.wavelength`, which sets each emitted
     * particle's mass via `mass = capacity / wavelength`. This keeps particle mass
     * consistent with the slit geometry scale.
     *
     * **`delay`** (default 1) sets ticks between bursts per angle. `delay = 0` fires
     * every tick; `delay = 1` fires every other tick. Affects particle density but
     * not fringe position.
     *
     * **`quantum_limit`** (default `Infinity`) caps total particles emitted per angle.
     * Set a finite value to limit the total particle count (useful for single-shot
     * or timed observations).
     *
     * @param {Object} universe - The engine universe instance (JS or WASM).
     * @param {Object} slitScreen - A {@link SlitScreen} instance. Provides `slit_wall_gap_top`,
     *   `slit_wall_gap_height`, and `wavelength` for automatic positioning and mass.
     * @param {number} [angle_increment=10] - Degrees between emission angles;
     *   `floor(360 / angle_increment)` total rays.
     * @param {number} [quantum_limit=Infinity] - Max quanta emitted per angle before
     *   the emitter stops.
     * @param {number} [delay=1] - Ticks between emission bursts per angle. 0 = every
     *   tick; 1 = every other tick.
     * @param {Object} [opts]
     * @param {number} [opts.depth] - When provided, threads `zMin=-depth/2,
     *   zDepth=depth` into the inner `PointSource`'s opts — the IDENTICAL shared
     *   z-spread mechanism built for `setupWaveInterference`
     *   (`emitterProgram.js`'s opt-in `em.zMin`/`em.zDepth`). REUSE, not a fork —
     *   SlitLightSource is a thin PointSource wrapper (see module docstring), so
     *   this is the only line needed to make the DSE light source illuminate the
     *   full z-depth of the SLOT-shaped 3D slits (SlitScreen's `depth`).
     *   OMITTED (default) → `zMin`/`zDepth` stay `undefined` on the PointSource
     *   opts object, which PointSource itself treats as `null` (byte-identical
     *   2D behavior — zero extra `random()` draws, per `emitterProgram.js`).
     */
    function SlitLightSource(universe, slitScreen, angle_increment, quantum_limit, delay, opts) {
        angle_increment = (angle_increment !== undefined) ? angle_increment : 10;
        quantum_limit = (quantum_limit !== undefined) ? quantum_limit : Infinity;
        delay = (delay !== undefined) ? delay : 1;
        opts = opts || {};
        var depth = (opts.depth !== undefined && opts.depth !== null) ? opts.depth : null;
        var zMin = (depth !== null) ? -depth / 2 : null;
        var zDepth = (depth !== null) ? depth : null;

        this.universe = universe;
        this._schemaKind = this.constructor.name;

        // Light source diameter: hardcoded to 16 matching devsdk's pointSOURCESIZE.
        // (wavelength * 0.25 * 2 = 32 would double the emission radius and velocity)
        var light_source_diameter = 16;

        // Position: x=20, y=midpoint of inter-slit gap (equidistant from both slit centers).
        // Previously used slit_wall_gap_top (top edge of gap), which biased toward slit1.
        // Correct position = gap_top + gap_height/2 = slit pair center = canvas center.
        var light_source_x = 20;
        var light_source_center_y = slitScreen.slit_wall_gap_top + slitScreen.slit_wall_gap_height / 2;

        var charge = null; // random +/- per particle
        var speed = 1;

        // Color OFF by default —
        // this used to hardcode `color: [0, 255, 0]` (devsdk parity green),
        // which OVERRIDES the render layer's colorScheme (LightColor ramp;
        // "an explicit render.color OVERRIDES colorScheme, so ROYGBIV never
        // shows on colored bodies" — docs/physics/COLOR_RENDER_LEARNINGS.md).
        // That override made every double-slit-family page render a fixed green
        // regardless of physics, while setupWaveInterference's PointSources
        // pass NO color at all (colorless -> colorScheme-driven, genuine
        // fullness/frequency-driven presentation) — the exact asymmetry
        // flagged (WI shows real physics color; the Lab showed a flat
        // override). `opts.color` is now an EXPLICIT opt-in (default `null` —
        // colorless, PointSource's own `opts.color || null` already handles
        // this correctly) so any caller that WANTS the old green back can
        // still request it; none currently do (grepped: setupDoubleSlit.js,
        // slit-family-depth.test.mjs, schema.test.mjs — zero callers pass
        // `opts.color` to SlitLightSource, so this is a pure default flip).
        var lightSourceColor = (opts.color !== undefined) ? opts.color : null;

        // Create a PointSource (already engine-agnostic)
        this.lightSource = new PointSource(
            universe,
            light_source_x,
            light_source_center_y,
            light_source_diameter,
            speed,
            charge,
            true,           // auto_fire
            quantum_limit,
            delay,
            angle_increment,
            { color: lightSourceColor, wavelength: slitScreen.wavelength, zMin: zMin, zDepth: zDepth }
        );

        this.lightSource._owner = this;   // THE ONE UP-LINK
    }

    /**
     * Returns a tick function suitable for universe.experimentTickFunctions.
     * Delegates to the PointSource's default tick function pattern:
     * each emitter with auto_fire=true fires automatically via the engine.
     * Returns a no-op since PointSource emitters auto-fire via the engine.
     */
    SlitLightSource.prototype.getTickFunction = function () {
        // PointSource emitters are registered with auto_fire=true,
        // so the engine fires them in Phase A automatically.
        // Return a no-op tick function for compatibility.
        return function () {};
    };

    /**
     * Enable/disable the light source.
     * @param {boolean} active
     */
    SlitLightSource.prototype.setActive = function (active) {
        this.lightSource.setActive(active);
    };

    /**
     * DSE LAB (2026-07-13): chargeMode passthrough — mirrors `setActive`'s delegation
     * pattern. `PointSource.prototype.chargeMode`'s setter already covers
     * `'random'|'positive'|'negative'|'both'` and is LIVE/read-per-emission with NO
     * re-init (ground-truthed: it lazily registers whichever (charge,random_direction)
     * handle groups the new mode needs, then flips `active` on the relevant groups —
     * emitterProgram.js's tick-fn checks `em.active` fresh every tick, so the switch
     * takes effect on the very next emission, not just future ones). The DSE Lab's
     * `chargeMode` control (random|positive|negative) drives this directly —
     * `slitLightSource.chargeMode = 'positive'` — reusing the IDENTICAL mechanism
     * `setupWaveInterference`'s emitters would use, not a fork.
     */
    Object.defineProperty(SlitLightSource.prototype, 'chargeMode', {
        get: function () { return this.lightSource.chargeMode; },
        set: function (mode) { this.lightSource.chargeMode = mode; },
        enumerable: true,
        configurable: true
    });

    // ── The kind (objects/kinds.js): descriptor, construction defaults, builder ──────────

    /**
     * SlitLightSource — Radial emitter positioned between slit pairs (wraps PointSource).
     * Constructor: SlitLightSource(universe, slitScreen, angle_increment,
     *                              quantum_limit, delay)
     * Position is derived from slitScreen geometry at construction time.
     * Group wrapper: the inner PointSource's per-angle handles are stamped with the ONE up-link `_owner` = <this>.
     */
    var SlitLightSourceDescriptor = {
        description: 'A radial light source for the double-slit experiment. ' +
            'Wraps a PointSource positioned equidistant between the two slits ' +
            '(at the inter-slit gap center), so particles reach both openings with equal path length. ' +
            'Emits in all directions; the slit screen selects which particles pass through.',
        fields: [
            {
                name: 'angle_increment',
                type: 'number',
                constraint: { min: 1, max: 360, integer: false },
                engineVisible: true,
                description: 'Degrees between emission angles (fewer degrees = more angles = denser wave front). 10° gives 36 directions, the double-slit experiment default.'
            },
            {
                name: 'quantum_limit',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Max quanta per angle emitter (null/Infinity = unlimited). Limits total particle count for performance control.'
            },
            {
                name: 'delay',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                description: 'Ticks between bursts for each angle emitter. 1 = emit every other tick (default for the double-slit source).'
            }
        ]
    };

    // ── SlitLightSource — cannot be built standalone ─────────────────────────
    registerKind(SlitLightSource, {
        from: import.meta.url,
        descriptor: SlitLightSourceDescriptor,
        defaults: {
        angle_increment: 10,
        quantum_limit: null,
        delay: 1
        },
        build: function () {
            throw new Error('[ObjectFactory] create("SlitLightSource"): a SlitLightSource requires a paired ' +
                'SlitScreen and cannot be constructed independently — build it through its setup factory ' +
                '(setupDoubleSlit), or compose ' + V1_REPLACEMENTS.SlitLightSource + '. (FAIL-LOUD.)');
        }
    });

    // ── Export ───────────────────────────────────────────────────────────

    export { SlitLightSource };

