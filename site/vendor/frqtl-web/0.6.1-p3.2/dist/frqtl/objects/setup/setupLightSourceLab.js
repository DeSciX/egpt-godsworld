/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupLightSourceLab — LightSource ISOLATION (I2, directed-tunnel composition model
 * §3 row 2): ONE `LightSource`, gun-chamber mechanics (fill / escape / dispersion) at a
 * live-tunable scale — the visual half of the I2 source-invariance measurement, same object,
 * same DSE-scale defaults.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * @param {Object} universe - WASM universe (not yet init'd — this factory calls init()).
 *   Same seeding convention as every other setup factory (no `opts.seed` — the
 *   seed is fixed by `FrqtlApp` before any factory runs).
 * @param {Object} [opts]
 * @param {number} [opts.bore=8] - Tunnel bore (`LightSource`'s own DSE-scale
 *   default). REINIT-CLASS.
 * @param {number} [opts.length=16] - Tunnel length (`LightSource`'s own DSE-scale
 *   default). REINIT-CLASS.
 * @param {'particleWalk'|'emitter'} [opts.source='particleWalk'] - `LightSource`'s
 *   own I2 default (the PRIMARY reference source). REINIT-CLASS (the two
 *   source mechanisms are fundamentally different constructions — see
 *   `LightSource.js`'s own docstring).
 * @param {'random'|'positive'|'negative'} [opts.polarization='random'] - passed
 *   straight through to `LightSource`. REINIT-CLASS.
 * @param {number} [opts.particleCount=20] - The INITIAL one-shot burst size
 *   hand-placed at construction (unchanged meaning/default — `LightSource`'s
 *   own construction-time placement, T2/I2 semantics untouched).
 * @param {number} [opts.sourceDensity] - the SUSTAIN fix (without it the
 *   LightSource Lab decays to 0 by tick ~2000: particleWalk is a one-shot
 *   snapshot that never replenishes).
 *   Quanta per RECURRING emission event, for BOTH source modes — mirrors
 *   `setupTunnelLab.js`'s own `sourceDensity` exactly ("same treatment,
 *   layered"). Defaults to `particleCount` (the recurring bursts match the
 *   initial one's size unless told otherwise). `source:'particleWalk'` -> a
 *   NEW local host tick-fn (this factory, NOT `LightSource.js` — that class
 *   stays a one-shot construction for every OTHER caller, e.g. DSE Lab)
 *   re-places `sourceDensity` quanta at the SAME entrance pixel/velocity/
 *   charge convention `LightSource.js`'s own particleWalk uses (mirrored
 *   here, cited below). `source:'emitter'` -> `emitterSpec.burstSize`
 *   (quanta/tick from the underlying `QuantumEmitter`).
 * @param {number} [opts.sourceRate=1] - Ticks between recurring emission
 *   events (mirrors `setupTunnelLab.js`'s own `sourceRate` exactly; `1` =
 *   every tick, the densest reachable cadence). `source:'particleWalk'` ->
 *   the local tick-fn's own cadence gate. `source:'emitter'` ->
 *   `emitterSpec.delay = max(0, sourceRate-1)` (`QuantumEmitter`'s own "ticks
 *   between bursts," 0-based — this mapping keeps `sourceRate=1` meaning
 *   "every tick" for BOTH source modes identically).
 * @param {boolean} [opts.sourceActive=true] - Master on/off. LIVE
 *   (`setupResult.sourceState.active`) for `source:'particleWalk'` (gates the
 *   local recurring tick-fn). `source:'emitter'` does NOT currently wire this
 *   to the underlying `QuantumEmitter` (it auto-fires unconditionally once
 *   constructed, matching `Gun.js`'s own breech emitter — no live on/off
 *   toggle exists for ANY `Tube`/`DirectedTunnel` emitter today); `setupResult
 *   .sourceState.active` is still returned for a future caller that wants it.
 *
 *   GUN-CHAMBER PARITY (ground-truthed `Gun.js`'s own breech
 *   `QuantumEmitter`, 2026-07-14): `auto_fire:true, quantum_limit:Infinity,
 *   delay:0` — an UNLIMITED, every-tick-firing emitter, exactly what
 *   `source:'emitter'` now does (`quantumLimit:Infinity` unconditionally,
 *   never `particleCount` — the OLD finite cap was the bug this fix removes).
 * @param {string} [opts.wallBehavior='option2'] - `LightSource.tunnel`'s initial
 *   behavior (`DirectedTunnel.BEHAVIORS`). LIVE (`setupResult.tunnel.
 *   updateBehavior(newBehavior)` — the same stock `DirectedTunnel` accessor
 *   `tunnel-lab` uses; REPLICA DISCIPLINE means nothing LightSource-specific is
 *   needed here).
 * @param {number} [opts.depth] - 3D toggle. OMITTED
 *   (default) -> 2D (byte-identical to every pre-existing caller). A positive
 *   value -> real z-containment (`activeAxes:{x,y,z}` on `universe.init()`,
 *   `LightSource.tunnel`'s own `depth`/`z=-depth/2` — `LightSource.js` ALREADY
 *   z-centres its `particleWalk` quanta whenever `tunnel.depth` is real, N1 fix
 *   precedent — zero new logic needed here beyond forwarding). Mirrors
 *   `setupTunnelLab.js`'s identical `opts.depth` recipe exactly (tunnel-lab and
 *   lightsource-lab STAY layered — same object, same 3D recipe). REINIT-CLASS.
 *
 * @returns {{ lightSource: LightSource, tunnel: DirectedTunnel, largeObjects: LargeObject[] }}
 * `largeObjects` (= `lightSource.largeObjects` = `lightSource.tunnel.largeObjects`)
 * is the canonical key `FrqtlApp.setup()` auto-wires for rendering.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero new physics (canonical-bench SU1) — this factory only constructs a
 * STOCK `LightSource` (itself zero new physics over `DirectedTunnel`/`Tube` — see
 * those objects' own docstrings) with DSE-scale defaults, matching
 * the directed-tunnel composition model §2.3's "the Gun Chamber object set, scaled
 * by sugar params."`source:'particleWalk'`'s snapshot burst vs `source:'emitter'`'s
 * continuous stream is the REAL, honest visual contrast between the two source
 * mechanisms this page exists to demonstrate (I2's source-invariance oracle
 * quantifies how close their downstream exit ensembles are — see that script's
 * README section).
 */

import { assertSetupOptions as _assertSetupOptions, requireWorldRect as _requireWorldRect } from './_setupOptions.js';
import { LightSource } from '../objects/LightSource.js';
import * as SustainedSource from '../objects/sustainedSource.js';

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.

    // ── Imports ─────────────────────────────────────────────────────────────

    var FUNDAMENTAL_DIMENSION = 2; // matches setupTunnelLab.js / setupDoubleSlit.js / LightSource.js's own construction path

    // MATCHED CONTROLS -> MATCHED PHYSICS: the
    // SAME MAX_USEFUL_WAVELENGTH clamp authority setupTunnelLab.js derives its
    // own ceiling from (SustainedSource.capacityAtDimension) — at identical
    // FUNDAMENTAL_DIMENSION=2, this is byte-identical to setupTunnelLab.
    // MAX_USEFUL_WAVELENGTH (16), so a matched-wavelength setting on both labs
    // produces the SAME mass/fullness/color.
    var LIGHTSOURCE_LAB_CAPACITY = SustainedSource.capacityAtDimension(FUNDAMENTAL_DIMENSION);
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupLightSourceLab.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'bore', 'depth',
        'length', 'particleCount', 'polarization', 'source',
        'sourceActive', 'sourceDensity', 'sourceRate', 'wallBehavior',
        'wavelength',
    ];

    function setupLightSourceLab(universe, opts) {
        opts = _assertSetupOptions('setupLightSourceLab', opts, OPTIONS);
        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var canvasRect = universe.universe_rect;
        var world = _requireWorldRect('setupLightSourceLab universe.universe_rect', canvasRect);
        var cw = world.w, ch = world.h;

        var bore = opts.bore !== undefined ? opts.bore : 8;
        var length = opts.length !== undefined ? opts.length : 16;
        var source = opts.source !== undefined ? opts.source : 'particleWalk';
        var polarization = opts.polarization !== undefined ? opts.polarization : 'random';
        var particleCount = opts.particleCount !== undefined ? opts.particleCount : 20;
        var wallBehavior = opts.wallBehavior !== undefined ? opts.wallBehavior : 'option2';
        var depth = (opts.depth !== undefined && opts.depth !== null) ? opts.depth : null;
        // lightsource-lab has the SAME wavelength control tunnel-lab has, same
        // default 8, same MAX_USEFUL_WAVELENGTH clamp authority: threaded into the
        // INITIAL one-shot burst
        // (`lsOpts.particle.wavelength`, `source:'particleWalk'`, matching
        // `LightSource.js`'s own `options.particle.wavelength` field) AND into
        // the recurring sustain spec below — this is THE field whose omission
        // on this factory's OLD injector produced "different particle
        // colors" (tunnel-lab's mass=2/fullness=0.125/red vs this page's
        // mass=16/fullness=1.0/violet at otherwise-identical settings).
        // lightsource-lab's λ slider governs emitter mode too — `source:
        // 'emitter'` ALSO stamps `wavelength` (via `lsOpts.emitterSpec.
        // wavelength` below, QuantumEmitter's new `opts.wavelength`), and is LIVE
        // via the `sourceState.wavelength` accessor built further down.
        var wavelength = opts.wavelength !== undefined ? opts.wavelength : 8;

        // SUSTAIN fix:
        // recurring emission params, ONE authority for BOTH source modes —
        // mirrors setupTunnelLab.js's own sourceDensity/sourceRate/sourceActive
        // exactly ("same treatment, layered"). Defaults to particleCount so the
        // recurring bursts match the initial one's size unless told otherwise.
        var sourceDensity = opts.sourceDensity !== undefined ? opts.sourceDensity : particleCount;
        var sourceRate = opts.sourceRate !== undefined ? opts.sourceRate : 1;
        var sourceActive = opts.sourceActive !== undefined ? !!opts.sourceActive : true;

        var initOpts = {};
        if (depth !== null) { initOpts.activeAxes = { x: true, y: true, z: true }; }
        universe.init(FUNDAMENTAL_DIMENSION, initOpts);

        var left = Math.round(cw * 0.1);
        var top = Math.round(ch / 2 - bore / 2);

        var tunnelOpts = {
            left: left, top: top, length: length, width: bore,
            capNegX: true, capPosX: false, // closed breech, open muzzle — Gun-Chamber convention
            behavior: wallBehavior,
        };
        if (depth !== null) { tunnelOpts.depth = depth; tunnelOpts.z = -depth / 2; }

        var lsOpts = {
            source: source,
            polarization: polarization,
            tunnel: tunnelOpts,
        };
        if (source === 'particleWalk') {
            lsOpts.particleCount = particleCount;
            lsOpts.particle = { wavelength: wavelength };
            // LightSource itself has the sustain capability through the SAME
            // single authority: delegates
            // the recurring re-placement to `LightSource`'s own opt-in
            // `options.sustain` (-> `sustainedSource.js`'s ONE authority) —
            // REPLACES this factory's own previously hand-rolled injector
            // tick-fn (which "mirror[ed] setupTunnelLab.js's own injector idiom
            // byte-for-byte"). `wavelength` here (density/rate/active too) feeds
            // the recurring bursts; the initial one-shot burst above uses the
            // SAME `wavelength` via `lsOpts.particle` — one source of truth,
            // never two independently-typed values.
            lsOpts.sustain = { density: sourceDensity, rate: sourceRate, active: sourceActive, wavelength: wavelength };
        } else {
            // GUN-CHAMBER PARITY (ground-truthed Gun.js's own breech
            // QuantumEmitter, 2026-07-14): auto_fire:true, quantum_limit:
            // Infinity, delay:0 — UNLIMITED. quantumLimit is now ALWAYS
            // Infinity (never particleCount — that finite cap was the O5.2
            // bug: the stream stopped admitting new quanta and the existing
            // population eventually escaped/died with nothing to replace it).
            // burstSize/delay are now driven by sourceDensity/sourceRate (the
            // SAME rate-control mechanism 'particleWalk' mode uses above).
            lsOpts.emitterSpec = {
                burstSize: sourceDensity,
                quantumLimit: Infinity,
                randomDirection: false,
                delay: Math.max(0, sourceRate - 1),
                // lightsource-lab's λ slider governs emitter mode too: threads through
                // LightSource.js's generic `options.emitterSpec` passthrough ->
                // DirectedTunnel's generic `options.emitter` copy -> Tube.js's new
                // `espec.wavelength` read -> QuantumEmitter's new `opts.wavelength`.
                // Matches `lsOpts.particle.wavelength` above — ONE source of truth
                // for BOTH source modes, never two independently-typed values.
                wavelength: wavelength,
            };
        }

        var lightSource = new LightSource(universe, lsOpts);

        // sourceState: for 'particleWalk', this IS `lightSource.sustainedSource
        // .sourceState` (the SAME live-mutable normalized spec `sustainedSource
        // .js` returns — a UI slider mutating `sourceState.wavelength`/`density`
        // /`rate`/`active` takes effect on the NEXT recurring burst, no
        // reinit). For 'emitter', a plain info object PLUS a `wavelength`
        // ACCESSOR that delegates to `QuantumEmitter.prototype.
        // setWavelength` — so the page's wavelength slider
        // (`runner.setupResult.sourceState.wavelength = v`, the SAME bare-
        // assignment idiom used for BOTH modes) works identically whether the
        // live source is a sustainedSource or this emitter, with zero page-level
        // branching on source mode. burstSize/delay stay NOT live-wired
        // (unchanged).
        var sourceState;
        if (source === 'particleWalk' && lightSource.sustainedSource) {
            sourceState = lightSource.sustainedSource.sourceState;
        } else {
            sourceState = { density: sourceDensity, rate: sourceRate, active: sourceActive };
            if (source === 'emitter' && lightSource.emitter) {
                Object.defineProperty(sourceState, 'wavelength', {
                    get: function () { return lightSource.emitter.wavelength; },
                    set: function (v) { lightSource.emitter.setWavelength(v); },
                    enumerable: true,
                    configurable: true,
                });
            }
        }

        return {
            lightSource: lightSource,
            tunnel: lightSource.tunnel,
            sourceState: sourceState,
            // FrqtlApp.setup() (FrqtlApp.js:528) auto-wires
            // the render list; today the world's own census carries them by construction.
            largeObjects: lightSource.largeObjects,
            // CANONICAL TEARDOWN (the reinit-
            // compounding fix): delegates to `LightSource.prototype.dispose`
            // — that ONE method already tears down BOTH
            // `this.sustainedSource` (particleWalk+sustain) and `this.emitter`
            // (emitter mode's own QuantumEmitter.dispose) — no bespoke
            // teardownFns array needed here anymore.
            dispose: function () { lightSource.dispose(); },
        };
    }

    // ONE authority for the achievable wavelength ceiling at this factory's
    // FUNDAMENTAL_DIMENSION — byte-identical formula/value to
    // `setupTunnelLab.MAX_USEFUL_WAVELENGTH` (both derive from
    // `SustainedSource.capacityAtDimension`), so `lightsource-lab/index.html`
    // reads THIS instead of hand-typing "16" — matched controls on both pages.
    setupLightSourceLab.FUNDAMENTAL_DIMENSION = FUNDAMENTAL_DIMENSION;
    setupLightSourceLab.CAPACITY = LIGHTSOURCE_LAB_CAPACITY;
    setupLightSourceLab.MAX_USEFUL_WAVELENGTH = LIGHTSOURCE_LAB_CAPACITY;

    setupLightSourceLab.OPTIONS = OPTIONS;

    export { setupLightSourceLab };

