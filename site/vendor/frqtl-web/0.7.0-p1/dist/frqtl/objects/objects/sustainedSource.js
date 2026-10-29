/* Copyright 2023-2026 by Essam Abadir */

/**
 * sustainedSource — the ONE hand-placed-quantum source surface (Tunnel Lab and
 * LightSource Lab share ONE source surface and differ only in declared
 * composition). REPLACES two independently
 * hand-rolled injector tick-fns (`setupTunnelLab.js`'s and
 * `setupLightSourceLab.js`'s own, admitted by the latter's own comment to
 * "mirror setupTunnelLab.js byte-for-byte") with ONE authority that both labs,
 * and `LightSource` itself (via its opt-in `options.sustain`), consume.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `SOURCE_SPEC_FIELDS` is the declared contract for what a source stamps on
 * every hand-placed quantum, plus its burst schedule — the schema-mirror
 * discipline (root CLAUDE.md "Engineering Culture"): the owner (this file)
 * exports the field list + defaults; every consumer calls `normalizeSourceSpec`
 * to get a FULL bag (never hand-re-enumerates a subset), so a field omission is
 * structurally impossible to silently diverge on (the exact bug this
 * fixes: one injector stamped `wavelength`, the other didn't, and nothing
 * forced them to agree). `sustained-source.test.mjs` is driven off this exact
 * exported list — adding a field here without a matching test entry is a CI
 * failure, not a silent gap.
 *
 * `placeSourceQuanta(universe, innerRect, capNegX, hasRealDepth, spec, count)`
 * is the single low-level placement primitive — computes the entrance pixel
 * from `innerRect`+`capNegX`+`spec.entranceBias` (the SAME formula
 * `LightSource.js`'s own one-shot burst and both labs' old hand-rolled
 * injectors independently derived), draws a velocity per `spec.velocityProfile`,
 * and calls `makeLeafFrame`/`injectFrame`/`setFrameProperty` — the SAME
 * generic primitives every hand-placed-quantum experiment already uses (G-EMIT-2,
 * the engine boundary model). Used for BOTH a one-shot burst (LightSource's
 * own construction-time placement) and a recurring burst (`buildSustainedSource`'s
 * tick-fn) — "the one injector then stamps quantum properties ... in exactly ONE
 * place" (the worked-example blueprint, Section 4 item 1).
 *
 * `buildSustainedSource(universe, innerRect, capNegX, hasRealDepth, specPartial)`
 * builds+registers a recurring Phase-A host tick-fn (mirrors `emitterProgram.js`'s
 * own registration point — a pre-tick primitive with no Phase-D timing
 * constraint, unlike `directedRedirectProgram.js`'s option1 redirect) that calls
 * `placeSourceQuanta` every `sourceState.rate` ticks. Returns `{sourceState,
 * dispose}` — `sourceState` is the LIVE, mutable normalized spec (a UI slider
 * writes `sourceState.wavelength = v` etc.; the tick-fn reads it fresh every
 * call — no re-registration, no reconstruction, matching the established
 * `setupTunnelLab.js`/`setupLightSourceLab.js` LIVE-knob convention exactly).
 * `dispose()` tags-then-splices the tick-fn out of `experimentTickFunctions` by
 * identity (`injectorTickFn._sourceInjector`) — the SAME idiom
 * `QuantumEmitter.prototype.dispose` and every prior lab-level injector already
 * used; see `FrqtlApp.prototype.setup()`'s own dispose-before-reinit
 * convention (`reference_frqtlapp_setup_canonical_teardown.md`).
 *
 * @typedef {Object} SourceSpec
 * @property {number|null} wavelength - Per-frame wavelength override (Engine
 *   Invariant #6 `mass = max(1, capacity/wavelength)`). `null` (default) =
 *   engine default (`mass = capacity`, i.e. fullness=1, top of the ROYGBIV
 *   ramp). THIS is the field whose divergence (one injector set it, the other
 *   didn't) produced "different particle colors".
 * @property {number|null} charge - Per-frame charge override (0=Positive,
 *   1=Negative). `null` (default) = random draw per quantum.
 * @property {'beam'|'spray'} velocityProfile - `'beam'` (default) = collimated
 *   single direction, `orientationRad`+`speed` (LightSource's own convention —
 *   `vy=vz=0` always, a deliberately directed/phase-locked stream). `'spray'` =
 *   a biased random fan (`spraySpec`) — `setupTunnelLab.js`'s own original
 *   uniformization-demo shape. Named, selectable, NEVER divergent hand-code
 *   (Section 3 finding E).
 * @property {number} speed - `'beam'` profile only: speed magnitude.
 * @property {number} orientationRad - `'beam'` profile only: direction,
 *   radians (`0` = +X).
 * @property {{vxMin:number,vxRange:number,vyMin:number,vyRange:number}} spraySpec
 *   - `'spray'` profile only: `vx = vxMin + random()*vxRange`,
 *   `vy = vyMin + random()*vyRange` — `setupTunnelLab.js`'s ORIGINAL literal
 *   values (0.2/0.6/0.1/0.7), now named+declared instead of hardcoded inline.
 * @property {'center'|'top'} entranceBias - `'center'` (default) = bore
 *   Y-centreline (`LightSource.js`'s own convention). `'top'` = bunched 2px
 *   from the TOP wall (`setupTunnelLab.js`'s original biased-entry shape — "a
 *   symmetric/spread entrance is already balanced and shows no washout effect
 *   at all").
 * @property {boolean} zIsotropy - When real depth is armed AND
 *   `velocityProfile==='spray'`: draw `vz = (random()*2-1)*spraySpec.vyRange`
 *   (the SAME half-range as the vy spread) — the 3D-SYMMETRIC EMISSION fix
 *   (§4 option (a): vz is drawn symmetric to the vy spread).
 *   `'beam'` profile is UNAFFECTED regardless of this flag (`vy=vz=0` stays —
 *   collimation is deliberate; §4 option (b): the beam's isotropic
 *   TRANSVERSE WAVE already does the 3D work, measured y≈z). Default `true`.
 * @property {number|null} level - `makeLeafFrame`'s `level` override (rarely
 *   used; `LightSource.js`'s own `options.particle.level`). `null` (default).
 * @property {number|undefined} mass - post-placement `mass` override via
 *   `setFrameProperty` (`LightSource.js`'s own `options.particle.mass`).
 *   `undefined` (default) = no override.
 * @property {number} density - Quanta hand-placed per burst.
 * @property {number} rate - Ticks between bursts (an `everyNTicks` cadence).
 * @property {boolean} active - Master on/off for the recurring source.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero new physics (canonical-bench SU1): every write here is the SAME
 * `makeLeafFrame`/`injectFrame`/`setFrameProperty`/`universe.random()` primitive
 * chain every hand-placed-quantum experiment already uses — this module only
 * CONSOLIDATES two independently-hand-rolled call sites into one, and adds a
 * genuinely-new DECLARED knob (`zIsotropy`) that draws an EXTRA `vz` momentum
 * component using the identical `(random()*2-1)*range` draw shape the `vy`
 * spread already used — no new mechanism, just the same mechanism applied to a
 * third axis. `velocityProfile:'spray'` + `zIsotropy:true` (tunnel-lab's new
 * default) is expected to raise the settled z/y dispersion-spread ratio from
 * the tester-measured 0.23 (pinned z, zero vz ever drawn) toward something
 * close to the y-spread itself (the injected fan becomes 3D-symmetric; the
 * existing free-walk + NEAR/FAR wall bounces already handle z correctly once
 * they receive real z-momentum to work with — the measured `ax_only` branch
 * gives y≈z isotropic transverse spread).
 */
    'use strict';

    // SOURCE_SPEC_FIELDS — the ONE declared contract (schema-mirror discipline,
    // root CLAUDE.md). `default` is either a primitive or an object (deep-copied
    // per-normalize call so no two sourceStates ever share a mutable spraySpec).
    var SOURCE_SPEC_FIELDS = {
        wavelength: { default: null, desc: 'Per-frame wavelength override (Engine Invariant #6 mass=max(1,capacity/wavelength)). null = engine default (mass=capacity).' },
        charge: { default: null, desc: 'Per-frame charge override (0=Positive,1=Negative). null = random draw per quantum.' },
        velocityProfile: { default: 'beam', enum: ['beam', 'spray'], desc: "'beam' = collimated single-direction (orientationRad+speed, vy=vz=0); 'spray' = biased random fan (spraySpec)." },
        speed: { default: 1, desc: "'beam' profile only: speed magnitude." },
        orientationRad: { default: 0, desc: "'beam' profile only: direction, radians (0 = +X)." },
        spraySpec: { default: { vxMin: 0.2, vxRange: 0.6, vyMin: 0.1, vyRange: 0.7 }, desc: "'spray' profile only: vx=vxMin+random()*vxRange, vy=vyMin+random()*vyRange (setupTunnelLab.js's original literal fan)." },
        entranceBias: { default: 'center', enum: ['center', 'top'], desc: "'center' = bore Y-centreline (LightSource.js's convention); 'top' = bunched 2px from the TOP wall (setupTunnelLab.js's original biased-entry/uniformization-demo shape)." },
        zIsotropy: { default: true, desc: "When real depth is armed AND velocityProfile='spray': draw vz=(random()*2-1)*spraySpec.vyRange (SAME half-range as vy) for a 3D-symmetric fan. 'beam' stays vy=vz=0 regardless (deliberate collimation)." },
        level: { default: null, desc: "makeLeafFrame's level override (rarely used)." },
        mass: { default: undefined, desc: 'Post-placement mass override via setFrameProperty. undefined = no override.' },
        density: { default: 5, desc: 'Quanta hand-placed per burst.' },
        rate: { default: 10, desc: 'Ticks between bursts (everyNTicks cadence).' },
        active: { default: true, desc: 'Master on/off for the recurring source.' },
    };

    var SOURCE_SPEC_FIELD_NAMES = Object.keys(SOURCE_SPEC_FIELDS);

    /**
     * Normalize a partial spec into a FULL bag (every declared field present,
     * defaults filled in) — the schema-mirror discipline's "consumers ferry the
     * normalized bag" half. Never hand-re-enumerate a subset of
     * SOURCE_SPEC_FIELDS elsewhere; always go through this function.
     * @param {Object} [partial]
     * @returns {SourceSpec}
     */
    function normalizeSourceSpec(partial) {
        partial = partial || {};
        var out = {};
        for (var i = 0; i < SOURCE_SPEC_FIELD_NAMES.length; i++) {
            var key = SOURCE_SPEC_FIELD_NAMES[i];
            if (partial[key] !== undefined) {
                out[key] = (key === 'spraySpec')
                    ? Object.assign({}, SOURCE_SPEC_FIELDS.spraySpec.default, partial[key]) // partial spraySpec override
                    : partial[key];
            } else {
                var def = SOURCE_SPEC_FIELDS[key].default;
                out[key] = (def !== null && typeof def === 'object') ? Object.assign({}, def) : def; // fresh copy, never shared
            }
        }
        return out;
    }

    /**
     * Compute the fixed entrance pixel from a tunnel/tube's innerRect — the ONE
     * formula `LightSource.js`'s own one-shot burst and both labs' original
     * hand-rolled injectors independently derived (now declared once).
     * @param {Object} innerRect - {left, top, z, w, h, d}
     * @param {boolean} capNegX - true = closed breech (Gun-Chamber convention).
     * @param {'center'|'top'} entranceBias
     * @returns {{x:number, y:number}}
     */
    function _computeEntrance(innerRect, capNegX, entranceBias) {
        var x = capNegX ? (innerRect.left + 2) : (innerRect.left + innerRect.w / 2);
        var y = (entranceBias === 'top') ? (innerRect.top + 2) : (innerRect.top + innerRect.h / 2);
        return { x: x, y: y };
    }

    /**
     * The single low-level placement primitive — hand-places `count` quanta at
     * ONE shared entrance pixel (the I1 scale-sweep's own validated ensemble
     * technique: injection-time overlap does not merge same-tick frames; each
     * leaf's own move-gate/wavelength-oscillator RNG draws diverge it from its
     * siblings over subsequent ticks). Used for BOTH a one-shot burst
     * (`LightSource.js`'s construction) and a recurring burst
     * (`buildSustainedSource`'s tick-fn) — ONE place quantum properties get
     * stamped.
     * @param {Object} universe
     * @param {Object} innerRect
     * @param {boolean} capNegX
     * @param {boolean} hasRealDepth - gate on the CALLER's explicit request for
     *   z-containment (N1 fix precedent, `LightSource.js`) — NEVER derive this
     *   from `innerRect.d`, which is always a positive placeholder even when
     *   the tunnel is flat 2D-in-3D.
     * @param {SourceSpec} spec - a NORMALIZED spec (pass through
     *   `normalizeSourceSpec` first — this function does not fill defaults).
     * @param {number} count
     * @returns {Array<{handle:*, qid:*}>}
     */
    function placeSourceQuanta(universe, innerRect, capNegX, hasRealDepth, spec, count) {
        var entrance = _computeEntrance(innerRect, capNegX, spec.entranceBias);
        var entranceZ = hasRealDepth ? (innerRect.z + innerRect.d / 2) : null;
        var placed = [];
        for (var i = 0; i < count; i++) {
            var vx, vy, vz;
            if (spec.velocityProfile === 'spray') {
                var s = spec.spraySpec;
                vx = s.vxMin + universe.random() * s.vxRange;
                vy = s.vyMin + universe.random() * s.vyRange;
                // 3D-SYMMETRIC EMISSION (§4 option (a)): draw
                // vz symmetric to the vy spread, SAME half-range, only when real
                // depth is armed AND the caller opted into zIsotropy (default
                // true) — makes the injected fan 3D-isotropic instead of pinning
                // z-momentum at zero forever (the measured z/y=0.18-0.23 flatness
                // root cause — Section 2e, Section C).
                vz = (hasRealDepth && spec.zIsotropy) ? (universe.random() * 2 - 1) * s.vyRange : 0;
            } else { // 'beam' — collimated; vy=vz=0 stays (deliberate, §4 option (b))
                vx = Math.cos(spec.orientationRad) * spec.speed;
                vy = Math.sin(spec.orientationRad) * spec.speed;
                vz = 0;
            }
            var handle = universe.makeLeafFrame(entrance.x, entrance.y, spec.level, spec.wavelength, vx, vy, false, spec.charge, null);
            universe.injectFrame(handle);
            var qid = universe.getFrameQuantumId(handle);
            if (spec.mass !== undefined && spec.mass !== null) {
                universe.setFrameProperty(qid, 'mass', spec.mass);
            }
            if (entranceZ !== null) {
                universe.setFrameProperty(qid, 'z', entranceZ);
                if (vz !== 0) { universe.setFrameProperty(qid, 'vz', vz); }
            }
            placed.push({ handle: handle, qid: qid });
        }
        return placed;
    }

    /**
     * Build + register the ONE recurring hand-placed-quantum source tick-fn
     * (kills the duplicated tunnel-lab / lightsource-lab injectors). LIVE knobs:
     * every field of the returned `sourceState` is read FRESH on every burst —
     * a UI slider mutating `sourceState.wavelength`/`density`/`rate`/`active`
     * etc. takes effect on the NEXT burst, no re-registration.
     * @param {Object} universe
     * @param {Object} innerRect
     * @param {boolean} capNegX
     * @param {boolean} hasRealDepth
     * @param {Object} [specPartial] - overrides onto SOURCE_SPEC_FIELDS' defaults.
     * @returns {{ sourceState: SourceSpec, dispose: Function }}
     */
    function buildSustainedSource(universe, innerRect, capNegX, hasRealDepth, specPartial) {
        var sourceState = normalizeSourceSpec(specPartial);

        var tickCounter = 0;
        var injectorTickFn = function () {
            if (!sourceState.active) { return; }
            tickCounter++;
            if (tickCounter % Math.max(1, sourceState.rate) !== 0) { return; }
            placeSourceQuanta(universe, innerRect, capNegX, hasRealDepth, sourceState, sourceState.density);
        };
        // Tag the tick-fn with a back-reference (mirrors QuantumEmitter.dispose's
        // OWN `fns[j]._emState` idiom EXACTLY, and both prior labs' own
        // `_sourceInjector` tag) so dispose() below can find + splice out THIS
        // EXACT closure, never a different injector that happens to also be
        // registered.
        injectorTickFn._sourceInjector = sourceState;
        universe.experimentTickFunctions = universe.experimentTickFunctions || [];
        universe.experimentTickFunctions.push(injectorTickFn);

        return {
            sourceState: sourceState,
            // CANONICAL TEARDOWN (see reference_frqtlapp_setup_canonical_teardown.md):
            // tombstone (defense in depth) then physically splice the tick-fn out
            // of experimentTickFunctions by identity. Idempotent — a second call
            // is a safe no-op.
            dispose: function () {
                sourceState.active = false;
                var fns = universe.experimentTickFunctions;
                if (!Array.isArray(fns)) { return; }
                for (var j = fns.length - 1; j >= 0; j--) {
                    if (fns[j] === injectorTickFn) { fns.splice(j, 1); }
                }
            },
        };
    }

    /**
     * capacityAtDimension(dim) — the ONE authority for "capacity of a leaf at
     * fundamental dimension `dim`" (Engine Invariant #6: `width=2^dim,
     * capacity=width²`). Both tunnel-lab and lightsource-lab derive their
     * `MAX_USEFUL_WAVELENGTH` slider ceiling from this (the ceiling
     * fix — same MAX_USEFUL_WAVELENGTH clamp authority) —
     * never a hand-typed "16" in either factory.
     * @param {number} dim
     * @returns {number}
     */
    function capacityAtDimension(dim) {
        var width = Math.pow(2, dim);
        return width * width;
    }


export { SOURCE_SPEC_FIELDS, SOURCE_SPEC_FIELD_NAMES, normalizeSourceSpec, placeSourceQuanta, buildSustainedSource, capacityAtDimension };

