/* Copyright 2023-2026 by Essam Abadir */

/**
 * emitterProgram.js — the emitter as an engine-AGNOSTIC handle-program (sugar).
 *
 * G-EMIT-2: the emitter is NOT an engine object and NOT a per-engine provider method — it is a
 * host tick-function (a "handle program") composed entirely from the generic engine primitives
 * `universe.random()`, `universe.makeLeafFrame(...)`, and `universe.injectFrame(...)`. Both engines
 * (WASM canonical + the JS reference) expose those primitives identically, so this ONE function is
 * the single source of emit behavior — replacing the former dual per-engine `registerEmitter`
 * implementations (compat/providers + the JS reference engine).
 *
 * DRAW-ORDER CONTRACT (golden-locked on WASM — do not reorder):
 *   per emitted leaf:  random()→x, random()→y, [random()→angle if randomDirection],
 *                      [random()→charge if charge is null], then makeLeafFrame(...) which on WASM
 *                      draws ONE more internally (the ctor charge-mirror, always). The JS reference
 *                      makeLeafFrame draws 0 there (charge is passed in) — engines may diverge
 *                      (WASM is canonical); only the WASM goldens are asserted.
 *
 *   OPT-IN 3D z-SPREAD: `em.zMin`/`em.zDepth` default to `null` — when
 *   both are absent, ZERO additional draws execute and this tick-fn is byte-identical to the
 *   contract above (every existing 2D caller — QuantumEmitter, PointSource — is unaffected).
 *   When a caller opts in (`em.zMin` a number), ONE additional `random()` draw executes AFTER
 *   `injectFrame` (uniformly distributing the emitted leaf across `[zMin, zMin+zDepth)`), then a
 *   `setFrameProperty(qid, 'z', z)` write — the canonical z-placement precedent
 *   (a THIRD setFrameProperty call, never inserted into the locked x/y/[angle]/[charge] sequence).
 *   `makeLeafFrame` has no z argument — no engine change, this composes existing primitives.
 *
 *   OPT-IN 3D ISOTROPIC SCATTER: `em.zIsotropy`
 *   (default falsy) — when BOTH `em.randomDirection` AND `em.zIsotropy` are true, the
 *   random-direction draw becomes a full unit-SPHERE direction (azimuth + polar angle,
 *   TWO draws replacing the 2D branch's ONE) instead of a 2D-plane circle, and the drawn
 *   `vz` is written via a FOURTH `setFrameProperty` call (sharing the SAME qid lookup as
 *   the zMin branch above when both are armed). Every existing `randomDirection:true`
 *   caller has `zIsotropy` false/undefined and takes the unchanged 2D-circle branch —
 *   byte-identical, zero extra draws.
 *
 * The emState object is OWNED by the sugar (QuantumEmitter / PointSource). The sugar mutates it
 * directly for active / velocity / burst-size / source-rect changes — there is no provider
 * setEmitter* ABI. The tick-fn closes over emState so those mutations take effect live.
 *
 * DSE LAB (systematic controls): `em.everyNTicks` (opt-in,
 * default null/undefined = fire every active tick, byte-identical to every existing
 * caller) throttles firing to once every N ticks — a LIVE, per-tick-read cadence knob
 * (mutate `em.everyNTicks` directly on the live emState any time; no re-init). This is
 * DIFFERENT from `delay`/`remainingDelay`, which is a ONE-TIME initial wait before the
 * FIRST burst (`remainingDelay` never resets after reaching 0 — ground-truthed by
 * reading this file — so `delay` cannot serve as a repeating rate control). `fireOnce`
 * (exported below) is the manual single-burst primitive for a "FIRE" button —
 * refactored out of the tick-fn's burst loop (`_fireBurst`) so BOTH the automatic
 * per-tick path and a manual trigger share the IDENTICAL draw-order/injection logic;
 * zero duplication, zero change to the golden-locked draw order for the automatic path.
 */

    'use strict';

    /**
     * Core burst-firing logic — shared by the automatic tick-fn AND `fireOnce` (the
     * manual "FIRE" trigger). Extracted verbatim from the tick-fn (no logic change) so
     * a manual single-burst call reuses the EXACT same draw-order/injection path as an
     * automatic tick, rather than a second hand-rolled copy.
     * @param {Object} universe
     * @param {Object} em
     */
    function _fireBurst(universe, em) {
        var burstLeft = em.burstSize;
        for (var bi = 0; bi < burstLeft && em.remainingQuanta > 0; bi++) {
            var rects = em.sourceRects;
            for (var ri = 0; ri < rects.length && em.remainingQuanta > 0; ri++) {
                var srcRect = rects[ri];                                   // [l, t, w, h]
                var x = srcRect[0] + universe.random() * srcRect[2];       // draw 1
                var y = srcRect[1] + universe.random() * srcRect[3];       // draw 2

                var vx = em.vx;
                var vy = em.vy;
                var vzOut = null; // set only by the zIsotropy branch below
                if (em.randomDirection) {
                    if (em.zIsotropy) {
                        // Velocity z-symmetry consistent with its
                        // profile: a real-depth-armed ISOTROPIC point source scatters
                        // on the unit SPHERE (azimuth + polar), not just the XY plane —
                        // mirrors directedRedirectProgram.js's own polarSpreadRad>0
                        // sphere draw. OPT-IN (em.zIsotropy defaults false) — zero extra
                        // draws for every pre-existing randomDirection:true caller, which
                        // takes the `else` 2D-circle branch unchanged (SAME single draw,
                        // SAME golden-locked position in the sequence).
                        var az = universe.random() * 2 * Math.PI;          // draw 3a
                        var cosPolar = universe.random() * 2 - 1;          // draw 3b
                        var sinPolar = Math.sqrt(Math.max(0, 1 - cosPolar * cosPolar));
                        var speed3 = Math.sqrt(vx * vx + vy * vy) || 1;
                        vx = Math.cos(az) * sinPolar * speed3;
                        vy = Math.sin(az) * sinPolar * speed3;
                        vzOut = cosPolar * speed3;
                    } else {
                        var angle = universe.random() * 2 * Math.PI;          // draw 3
                        var speed = Math.sqrt(vx * vx + vy * vy) || 1;
                        vx = Math.cos(angle) * speed;
                        vy = Math.sin(angle) * speed;
                    }
                }

                var chargeInt;
                if (em.charge === null || em.charge === undefined) {
                    chargeInt = (universe.random() < 0.5) ? 0 : 1;        // draw 4
                } else {
                    chargeInt = (em.charge === 'Positive' || em.charge === 'POSITIVE') ? 0 : 1;
                }

                // LEVEL (leaf scale) is a UNIVERSE property, NOT an emitter constant: a
                // fundamental leaf is created at the universe's fundamental-dimension level
                // (wave-interference / double-slit run at dimension 2 → 4×4 leaves, capacity 16
                // → wavelength 16·WC). Pass null so makeLeafFrame derives it from the universe;
                // a non-null em.fundamentalDim is an explicit override. (Hardcoding 0 here
                // collapsed capacity 16→1 and wavelength 128→8 — the wave-richness regression.)
                var level = (em.fundamentalDim != null) ? em.fundamentalDim : null;
                // makeLeafFrame draws ONE more on WASM (ctor charge-mirror) → golden +1.
                // R3-1: thread per-frame render.shape (10th) + render.outline (11th) EXACTLY as
                // em.color is threaded (9th) — so QuantumEmitter/PointSource gain the same per-frame
                // render reach SphereEmitter3D has. All three ride makeLeafFrame's WASM-side
                // string_map merge stamp (0 RNG draws, golden preserved). Null default → no key →
                // byte-identical for every pre-existing caller. WASM-ONLY (the frozen JS reference
                // makeLeafFrame ignores the shape/outline positionals — a DOCUMENTED no-op, see the
                // wasm-engine makeLeafFrame docstring + the render-intent-merge test; the realm is WASM).
                var handle = universe.makeLeafFrame(
                    x, y, level,
                    (em.wavelength !== null && em.wavelength !== undefined) ? em.wavelength : 0,
                    vx, vy, !!em.wrap, chargeInt,
                    em.color || null,
                    (em.renderShape != null && em.renderShape !== '') ? em.renderShape : null,
                    (em.renderOutline != null) ? em.renderOutline : null
                );
                // liveQuantaCap refused the add: no leaf was born, so a finite quantumLimit is
                // not spent on it (below the cap the handle is never null — byte-identical).
                if (handle === null) { continue; }
                universe.injectFrame(handle);

                // OPT-IN 3D z-SPREAD (see module docstring). em.zMin is null for every
                // existing 2D caller — this branch is dead code (0 extra draws) unless a
                // caller explicitly opts in (PointSource `opts.zMin`/`opts.zDepth`).
                // Shares the SAME qid lookup with the zIsotropy vz write
                // below (never a second getFrameQuantumId call for the same handle).
                var zMinArmed = (em.zMin !== null && em.zMin !== undefined);
                if (zMinArmed || vzOut !== null) {
                    var qid = universe.getFrameQuantumId(handle);
                    if (zMinArmed) {
                        var zDepth = (em.zDepth !== null && em.zDepth !== undefined) ? em.zDepth : 0;
                        var z = em.zMin + (zDepth > 0 ? universe.random() * zDepth : 0); // extra draw, opt-in only
                        universe.setFrameProperty(qid, 'z', z);
                    }
                    if (vzOut !== null) {
                        universe.setFrameProperty(qid, 'vz', vzOut);
                    }
                }

                em.remainingQuanta--;
            }
        }
    }

    /**
     * Build a host tick-function that fires one emitter, drawing from the engine's single RNG and
     * injecting leaves via the generic primitives. Push the returned fn onto
     * `universe.experimentTickFunctions`.
     *
     * @param {Object} universe - engine universe exposing random()/makeLeafFrame()/injectFrame().
     * @param {Object} em - emitter state: {
     *     sourceRects: Array<[l,t,w,h]>, vx, vy, burstSize, charge: (null|'POSITIVE'|'NEGATIVE'),
     *     randomDirection: bool, remainingQuanta: number, delay, remainingDelay,
     *     active: bool, tombstoned: bool, color: [r,g,b,a]|null, wrap: bool,
     *     wavelength: number|null, fundamentalDim: number, everyNTicks: number|null }
     * @returns {Function} tick-fn (returns [] — frames are injected via injectFrame, not returned).
     */
    function buildEmitterTickFn(universe, em) {
        return function () {
            if (em.tombstoned || !em.active) return [];
            if (em.remainingDelay > 0) { em.remainingDelay--; return []; }
            if (em.remainingQuanta <= 0) return [];

            // OPT-IN firing-rate cadence (DSE Lab): null/undefined/<=1 -> fire every
            // active tick (byte-identical to pre-Lab behavior — this branch is dead
            // code for every existing caller, which never sets em.everyNTicks).
            if (em.everyNTicks !== null && em.everyNTicks !== undefined && em.everyNTicks > 1) {
                em._rateCounter = (em._rateCounter || 0) + 1;
                if (em._rateCounter % em.everyNTicks !== 0) return [];
            }

            _fireBurst(universe, em);
            return [];
        };
    }

    /**
     * Manual single-burst trigger (DSE Lab "FIRE" button, autofire off). Bypasses the
     * `active`/`remainingDelay`/`everyNTicks` GATING (an explicit user action should
     * always fire on request) but still respects `tombstoned`/`remainingQuanta` (a
     * disposed or already-exhausted emitter cannot be forced to fire past its limit).
     * Reuses the IDENTICAL `_fireBurst` draw-order/injection path the automatic tick-fn
     * uses — no second implementation.
     * @param {Object} universe
     * @param {Object} em
     */
    function fireOnce(universe, em) {
        if (em.tombstoned || em.remainingQuanta <= 0) return;
        _fireBurst(universe, em);
    }


export { buildEmitterTickFn, fireOnce };

