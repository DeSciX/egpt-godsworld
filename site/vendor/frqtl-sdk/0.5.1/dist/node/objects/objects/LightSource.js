/* Copyright 2023-2026 by Essam Abadir */

/**
 * LightSource — thin wrapper over DirectedTunnel (T2, 2026-07-13,
 * "the laser story — nearly free"; refactored I2, 2026-07-13, onto the
 * I1-PROVEN tunnel semantics — the DSE-scale sugar-scale bore replica).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * A LightSource is a `DirectedTunnel` (never re-derived — REPLICA DISCIPLINE:
 * zero LightSource-special tunnel behavior, the stock object unchanged) PLUS one
 * of two source mechanisms populating its bore — mirroring the classic
 * side-by-side `this.bulletHandle` (hand-placed) / `this.emitter` (auto-wired)
 * duality:
 *
 *   - `options.source = 'particleWalk'` (DEFAULT, I2 — the CEO's PRIMARY
 *     REFERENCE source) — one or more HAND-PLACED leaf frames in the bore (the
 *     hand-placed-projectile pattern, generalized to
 *     `options.particleCount` quanta — I1's own scale-sweep validated technique
 *     for building a stochastic ensemble from IDENTICAL start conditions:
 *     `docs/internal/physics-lab/directed-tunnel-scale-sweep/sweep.cjs` places its whole
 *     N-quantum population at ONE shared entrance pixel per seed and still
 *     measures genuine per-quantum variance at exit — each frame's OWN
 *     move-gate/wavelength-oscillator RNG draws diverge it from its siblings
 *     over time, Injection-time same-cell overlap does not merge them). Velocity
 *     derived from `orientation`+`speed` exactly like the emitter case,
 *     positioned at the bore's centreline just inside the breech (or the bore's
 *     geometric centre when `capNegX` is false — no breech to anchor to). No
 *     `QuantumEmitter`, no continuous firing — a SNAPSHOT placement (all
 *     `particleCount` quanta exist from tick 1), matching `particle-walk`-family
 *     experiments' own "hand-placed, not emitted" convention.
 *   - `options.source = 'emitter'` — the tunnel's own `options.emitter` (Tube's
 *     opt-in auto-wired `QuantumEmitter` at the breech, DirectedTunnel's
 *     `orientation`-derived `vx/vy`). Requires `capNegX` (defaults to `true` for
 *     THIS source type — a LightSource with no wall to emit from is meaningless).
 *
 * **I2 default flip (CEO ruling, directed-tunnel composition model §3 row 2):
 * `options.source` now DEFAULTS to `'particleWalk'`** (was `'emitter'` in T2) —
 * "the PRIMARY reference source." The one production caller
 * (the DSE-lab tunnels) always passes `source:'emitter'` explicitly, so this
 * default flip is byte-identical for every existing caller in the tree; it only
 * changes behavior for a hypothetical caller that OMITTED `source` entirely (none
 * exist yet). `docs/internal/physics-lab/directed-tunnel-scale-sweep/README.md`'s companion
 * source-invariance harness (I2) quantifies particleWalk vs emitter exit-ensemble
 * equivalence — the empirical justification for treating them as interchangeable
 * defaults at all.
 *
 * **DSE-scale sugar defaults (I2, directed-tunnel composition model §2.3: "the
 * Gun Chamber object set, scaled by sugar params — DSE example ~8px bore ×
 * ~16px length"):** `options.tunnel.width`/`options.tunnel.length` now default to
 * `8`/`16` when the caller omits them (previously REQUIRED — `DirectedTunnel`
 * itself still throws on non-positive values, so a caller could not omit them
 * before this bite). `left`/`top`/`z` remain caller-required (position is always
 * scene-specific) — DIRECTLY passed through, byte-identical.
 *
 * `options.polarization` ('random'|'positive'|'negative', default 'random') —
 * "lasers are just light sources which are polarized and have smaller widths"
 * (CEO). Maps DIRECTLY onto the SAME charge vocabulary `PointSource`/
 * `QuantumEmitter`'s own `chargeMode` already use — no new charge concept:
 *   'random' -> null (charge draw per particle — the DEFAULT, matches every
 *     existing DSE/WI emitter's un-polarized behavior)
 *   'positive' -> 0 ('POSITIVE'), 'negative' -> 1 ('NEGATIVE') (a FIXED charge —
 *     every emitted/placed quantum gets the SAME charge: a polarized beam).
 *
 * **`LightSource.laser(universe, options)`** — the Laser preset/factory (CEO:
 * "a Laser is a LightSource preset... not a separate class" — report §4.4 point
 * 3: "A thin Laser wrapper is legitimately separate... mirroring
 * the fx-* factories layering thin convenience over
 * Tube.js"). A STATIC FACTORY, not a subclass: pre-fills `polarization` (default
 * `'positive'` — a FIXED, not random, charge: the report's own "collimated,
 * phase-locked beam... every emitted quantum gets identical vx,vy" framing
 * extends naturally to "and identical charge") and a NARROWER default `width`
 * (report §4.3: "A tunnel + a directed emitter is a collimated, phase-locked
 * beam with zero new physics" — narrowness is a geometry convenience, not a new
 * mechanism), then constructs a plain `LightSource`. Every field is still
 * caller-overridable (`LightSource.laser(universe, {width: 40, polarization:
 * 'random', ...})` is a legal, narrower-but-unpolarized "laser").
 *
 * @param {Object} universe - Already-init'd universe (JS or WASM).
 * @param {Object} options
 * @param {'particleWalk'|'emitter'} [options.source='particleWalk'] - see above
 *   (I2: default flipped from 'emitter').
 * @param {'random'|'positive'|'negative'} [options.polarization='random'] - see above.
 * @param {number} [options.speed=1] - initial speed magnitude (both source types);
 *   direction is ALWAYS `options.tunnel.orientation` (see `DirectedTunnel`).
 * @param {number} [options.particleCount=1] - `options.source==='particleWalk'`
 *   only: how many hand-placed quanta to snapshot-place (I2 generalization from
 *   T2's fixed "exactly one"; `1` is byte-identical to T2's behavior).
 * @param {Object} [options.particle] - `options.source==='particleWalk'` only:
 *   `{wavelength, mass, level}` (all optional — `makeLeafFrame` defaults apply).
 * @param {Object} [options.tunnel={}] - passed straight through to
 *   `DirectedTunnel`'s own constructor (`left,top,z,length,width,depth,
 *   orientation,behavior,resetLocalTime,redirectSpread,redirectSpeed,capNegX,
 *   capPosX,wallThickness,color,wallOpacity,sinkOpenEnds,collectCollided`) —
 *   `options.emitter`/`options.tunnel.emitter` is OWNED by this file (derived
 *   from `source`+`polarization`+`speed`), never set directly by the caller.
 *   `length`/`width` DEFAULT to 16/8 (I2 DSE-scale sugar default) when omitted.
 *
 * @property {Object} tunnel - the underlying `DirectedTunnel` instance (a STOCK
 *   instance — replica discipline; LightSource never subclasses or monkeypatches it).
 * @property {Array<LargeObject>} walls - alias for `this.tunnel.walls`.
 * @property {Object|null} emitter - alias for `this.tunnel.emitter` (`source:
 *   'emitter'` only; `null` for `'particleWalk'`).
 * @property {Array<number>} particleHandles - the hand-placed leaves' FrameIds
 *   (`source:'particleWalk'` only; `[]` for `'emitter'`). Length ===
 *   `options.particleCount`.
 * @property {Array<number>} particleQids - `particleHandles`' quantum_ids
 *   (writable via `setFrameProperty`; `[]` for `'emitter'`).
 * @property {number|null} particleHandle - DEPRECATED alias for
 *   `particleHandles[0]` (T2 single-quantum API, kept for byte-identical reads
 *   when `particleCount` is omitted/1); `null` for `'emitter'` or an empty count.
 * @property {number|null} particleQid - DEPRECATED alias for `particleQids[0]`
 *   (see above).
 * @property {Function} applyRedirect - alias for `this.tunnel.applyRedirect`,
 *   ALWAYS present (C1 fix, 2026-07-13, ruling_directed_tunnel_lightsource.md)
 *   — prefer `this.tunnel.applyRedirectIfActive(tickData)` over calling this
 *   directly (self-gates on the tunnel's current `behavior`).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * LightSource adds ZERO new physics (canonical-bench SU1): it is a `DirectedTunnel`
 * (itself a `Tube` — zero new physics, per Tube's own docstring) plus either
 * `QuantumEmitter` (existing engine-agnostic sugar) or one-or-more hand-placed
 * leaves (the SAME `makeLeafFrame`/`injectFrame`/`setFrameProperty` primitives
 * every particle-walk/Gun-bullet experiment already uses, looped). The laser's
 * "collimated, phase-locked beam" IS free (report §4.3): skipping the
 * random-direction draw means every quantum gets IDENTICAL `vx,vy`, and a fresh
 * emission is already phase-locked at `local_time=0` (theorist-established) — no
 * new mechanism. Source-invariance (I2, `docs/internal/physics-lab/directed-tunnel-scale-
 * sweep/source-invariance.cjs`): particleWalk and emitter sourcing at IDENTICAL
 * tunnel params produce statistically comparable exit-face ensembles (see that
 * script's README section for the measured numbers and the metric used).
 */

(function () {

    // ── Imports ─────────────────────────────────────────────────────────

    var DirectedTunnel, SustainedSource;

    if (typeof module !== 'undefined' && module.exports) {
        DirectedTunnel = require('./DirectedTunnel').DirectedTunnel;
        SustainedSource = require('./sustainedSource');
    } else {
        DirectedTunnel = window.DirectedTunnel;
        SustainedSource = window.SustainedSource;
    }

    var VALID_SOURCES = ['emitter', 'particleWalk'];
    var VALID_POLARIZATIONS = ['random', 'positive', 'negative'];

    function _polarizationToCharge(polarization) {
        if (polarization === 'positive') { return 0; }
        if (polarization === 'negative') { return 1; }
        return null; // 'random'
    }

    /**
     * @param {Object} universe
     * @param {Object} options - see module docstring above.
     */
    function LightSource(universe, options) {
        options = options || {};

        this.universe = universe;
        this._schemaKind = 'LightSource';

        // I2 default flip (directed-tunnel composition model §3 row 2, CEO
        // ruling): 'particleWalk' is now the DEFAULT ("the PRIMARY reference
        // source") — was 'emitter' in T2. The one production caller
        // (the DSE-lab tunnels) always passes source:'emitter' explicitly, so
        // this is byte-identical for every existing caller in the tree.
        var source = options.source !== undefined ? options.source : 'particleWalk';
        if (VALID_SOURCES.indexOf(source) === -1) {
            throw new Error('[LightSource] unknown options.source "' + source + '". Expected: ' + VALID_SOURCES.join(' | '));
        }
        var polarization = options.polarization !== undefined ? options.polarization : 'random';
        if (VALID_POLARIZATIONS.indexOf(polarization) === -1) {
            throw new Error('[LightSource] unknown options.polarization "' + polarization + '". Expected: ' + VALID_POLARIZATIONS.join(' | '));
        }
        var speed = options.speed !== undefined ? options.speed : 1;
        var particleCount = options.particleCount !== undefined ? options.particleCount : 1;
        if (!(particleCount >= 1) || Math.floor(particleCount) !== particleCount) {
            throw new Error('[LightSource] options.particleCount must be a positive integer (got ' + particleCount + ').');
        }
        this.source = source;
        this.polarization = polarization;

        var tunnelOpts = {};
        var passthroughKeys = [
            'left', 'top', 'z', 'length', 'width', 'depth', 'orientation', 'behavior',
            'resetLocalTime', 'redirectSpread', 'redirectSpeed', 'capNegX', 'capPosX',
            'wallThickness', 'color', 'wallOpacity', 'sinkOpenEnds', 'collectCollided',
        ];
        var srcTunnelOpts = options.tunnel || {};
        for (var i = 0; i < passthroughKeys.length; i++) {
            var key = passthroughKeys[i];
            if (srcTunnelOpts[key] !== undefined) { tunnelOpts[key] = srcTunnelOpts[key]; }
        }
        // I2 DSE-scale sugar defaults (directed-tunnel composition model §2.3):
        // "the Gun Chamber object set, scaled by sugar params — DSE example ~8px
        // bore x ~16px length". T2 required length/width (DirectedTunnel throws
        // on omission); I2 defaults them here so a bare `new LightSource(universe,
        // {left,top})` is legal at the composition's actual sugar scale.
        if (tunnelOpts.length === undefined) { tunnelOpts.length = 16; }
        if (tunnelOpts.width === undefined) { tunnelOpts.width = 8; }

        var orientationDeg = tunnelOpts.orientation !== undefined ? tunnelOpts.orientation : 0;
        var orientationRad = orientationDeg * Math.PI / 180;
        var charge = _polarizationToCharge(polarization);

        this.emitter = null;
        this.particleHandles = [];
        this.particleQids = [];
        this.particleHandle = null; // deprecated T2 single-quantum alias (see docstring)
        this.particleQid = null;

        if (source === 'emitter') {
            // A LightSource emitter needs a breech to emit from — default capNegX:true
            // for THIS source type (byte-identical is not possible here since the
            // caller is EXPLICITLY asking for an emitter; a LightSource with no wall to
            // emit from is a caller error class, matched by DirectedTunnel/Tube's own
            // FAIL-LOUD for options.emitter without capNegX).
            if (tunnelOpts.capNegX === undefined) { tunnelOpts.capNegX = true; }
            tunnelOpts.emitter = Object.assign({ speed: speed, charge: charge }, options.emitterSpec || {});
        }

        this.tunnel = new DirectedTunnel(universe, tunnelOpts);
        this.walls = this.tunnel.walls;
        this.sinks = this.tunnel.sinks;
        this.innerRect = this.tunnel.innerRect;
        this.largeObjects = this.tunnel.largeObjects;
        this.applyRedirect = this.tunnel.applyRedirect;

        this.sustainedSource = null;

        if (source === 'emitter') {
            this.emitter = this.tunnel.emitter;
        } else {
            // 'particleWalk' — one or more hand-placed leaf frames (the classic
            // pattern, generalized I2), positioned at the bore's Y (and Z, when
            // zContain) centreline, just inside the breech when capped (mirrors
            // the emitter's own aperture placement), or at the bore's geometric
            // X-centre when open on both ends (no breech to anchor to). ALL
            // `particleCount` quanta share the SAME entrance pixel — the I1
            // scale-sweep's own validated ensemble-building technique
            // (docs/internal/physics-lab/directed-tunnel-scale-sweep/sweep.cjs): a shared
            // injection-time position does not merge same-tick frames, and each
            // leaf's OWN move-gate/wavelength-oscillator RNG draws diverge it
            // from its siblings over subsequent ticks — a genuine stochastic
            // ensemble from an identical start, not degenerate.
            //
            // ws-dse-3d (CEO ruling 2026-07-14, "one source surface"): this burst
            // now routes through `sustainedSource.js`'s ONE `placeSourceQuanta`
            // primitive — the SAME entrance-formula/velocity-draw/z-centring code
            // `setupTunnelLab.js`'s and `setupLightSourceLab.js`'s own independently
            // hand-rolled injectors used to duplicate. `velocityProfile:'beam'` +
            // `entranceBias:'center'` reproduce this constructor's PRE-EXISTING
            // formula EXACTLY (cos/sin(orientationRad)*speed, inner.top+inner.h/2) —
            // byte-identical for every existing caller (DSE Lab, this file's own
            // tests).
            var particleSpec = options.particle || {};
            var hasRealDepth = (tunnelOpts.depth !== undefined && tunnelOpts.depth !== null);
            var burstSpec = SustainedSource.normalizeSourceSpec({
                wavelength: particleSpec.wavelength !== undefined ? particleSpec.wavelength : null,
                charge: charge,
                velocityProfile: 'beam',
                speed: speed,
                orientationRad: orientationRad,
                entranceBias: 'center',
                level: particleSpec.level !== undefined ? particleSpec.level : null,
                mass: particleSpec.mass,
            });
            var placed = SustainedSource.placeSourceQuanta(universe, this.tunnel.innerRect, !!tunnelOpts.capNegX, hasRealDepth, burstSpec, particleCount);
            for (var pi = 0; pi < placed.length; pi++) {
                this.particleHandles.push(placed[pi].handle);
                this.particleQids.push(placed[pi].qid);
            }
            // Deprecated T2 single-quantum aliases — byte-identical reads for any
            // caller written against the old ONE-quantum API when particleCount is
            // omitted/1.
            this.particleHandle = this.particleHandles.length ? this.particleHandles[0] : null;
            this.particleQid = this.particleQids.length ? this.particleQids[0] : null;

            // ws-dse-3d AC1 (CEO ruling, "LightSource itself should gain the
            // sustain capability through the SAME single authority"): OPT-IN —
            // `options.sustain` omitted (default) is byte-identical to every
            // pre-existing caller (a genuine one-shot construction, DSE Lab's own
            // usage untouched). When supplied (truthy — `true` for "use the SAME
            // wavelength/charge/velocity convention as the burst above, just
            // recurring", or a partial spec object to override individual
            // fields), builds ONE recurring `sustainedSource` tick-fn replicating
            // this burst's own entrance/velocity/charge convention forever —
            // the SAME mechanism `setupTunnelLab.js`/`setupLightSourceLab.js` now
            // both delegate to, rather than each hand-rolling their own copy
            // (see `sustainedSource.js`'s module docstring).
            if (options.sustain) {
                var sustainOverrides = (options.sustain === true) ? {} : options.sustain;
                var sustainSpec = Object.assign({}, burstSpec, sustainOverrides);
                this.sustainedSource = SustainedSource.buildSustainedSource(
                    universe, this.tunnel.innerRect, !!tunnelOpts.capNegX, hasRealDepth, sustainSpec
                );
            }
        }
    }

    /**
     * Tear down every disposable resource THIS LightSource registered — the
     * SAME idiom `QuantumEmitter.prototype.dispose` and every setup factory's
     * own `dispose()` already use (tag-then-splice by identity, idempotent).
     * A `source:'particleWalk'` LightSource with no `options.sustain` (the
     * default — every pre-existing caller) has nothing to dispose; calling this
     * is always a safe no-op in that case. Callers building a page-level
     * `setupResult.dispose()` should delegate here rather than re-deriving the
     * teardown for `this.sustainedSource`/`this.emitter` a second time.
     */
    LightSource.prototype.dispose = function () {
        if (this.sustainedSource) { this.sustainedSource.dispose(); }
        if (this.emitter && typeof this.emitter.dispose === 'function') { this.emitter.dispose(); }
    };

    /**
     * The Laser preset/factory (CEO: "a Laser is a LightSource preset ... not a
     * separate class"). Pre-fills a FIXED polarization (default 'positive' — a
     * polarized beam, matching "lasers are ... polarized"), a NARROWER default
     * width (report §4.3 — collimation/geometry convenience, zero new physics),
     * and `source:'emitter'` (I2: a laser is "a collimated, phase-locked BEAM" —
     * an ONGOING stream, not LightSource's own new I2 default of a single
     * snapshot-placed particleWalk quantum; `laser()` keeps T2's original
     * emitter-sourced behavior explicitly rather than silently inheriting
     * LightSource's now-different bare default); every field is still
     * caller-overridable (a `source:'particleWalk'` laser is legal, if unusual).
     *
     * **I2 re-baseline (width default 20 -> 4):** T2's "narrower" framing was
     * relative to the THEN-current world where `width` had no LightSource
     * default at all (callers always supplied one, historically ~40px) — 20px
     * was narrower than that. I2 gave a bare LightSource its OWN DSE-scale
     * default (`width:8`), which made the OLD laser default (20px) WIDER than
     * the new baseline — breaking the "narrower" invariant this preset exists to
     * express. Re-baselined to 4px (narrower than the new 8px DSE-scale
     * default) so "a laser is narrower" stays TRUE, not just documented.
     *
     * @param {Object} universe
     * @param {Object} [options] - SAME shape as `LightSource`'s own options; any
     *   field provided here overrides the laser defaults below.
     * @returns {LightSource}
     */
    LightSource.laser = function (universe, options) {
        options = options || {};
        var tunnelDefaults = { width: 4 };
        var tunnelOpts = Object.assign({}, tunnelDefaults, options.tunnel || {});
        var laserOpts = Object.assign(
            { polarization: 'positive', source: 'emitter' },
            options,
            { tunnel: tunnelOpts }
        );
        return new LightSource(universe, laserOpts);
    };

    // ── Export ───────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { LightSource: LightSource };
    } else {
        window.LightSource = LightSource;
    }

})();
