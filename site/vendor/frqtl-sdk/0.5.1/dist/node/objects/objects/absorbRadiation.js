/* Copyright 2023-2026 by Essam Abadir */

/**
 * absorbRadiation.js — ABSORB v2 on the LO's REAL backing-frame mass (Track A).
 *
 * CEO mass-surface ruling (Living Log 384ef5ee): use the OBJECT approach, not a
 * duplicative op-prop mass surface. A LargeObject is backed by a REAL leaf Frame, so the
 * absorbed mass lands in a real frame's `mass` reachable through the SAME frame accessors
 * everything else uses.
 *
 * MANDATORY BACKING (CEO dry-realign 8d45fcdb): the backing frame is now created by the engine
 * at `register_large_object` (every LO is frame-backed — no unbacked path). This sugar READS
 * that ledger via `getLargeObjectFrameId` instead of creating + attaching one.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * `attachAbsorberBackingFrame(universe, loHandle, rect, capacity)` → READS the LO's
 *   registration-created backing leaf (store-resident mass ledger — uninjected, zero
 *   single-occupancy / quadtree interaction, theorist §2a), primes it with the mass-1 empty
 *   baseline, and returns `{ backingFrameHandle, backingQid, level, capacity }`. `capacity` is
 *   the absorb CLOCK — the fill ceiling and the `1/capacity` emission probability — snapped to
 *   the nearest LEVEL the engine can actually size (`level` is that quantization's record).
 * `buildAbsorbRadiationTickFn(cfg)` → a host tick-fn (the emitter/thermostat seam)
 *   that each tick: (1) tallies the collected KILLED colliders' masses into the
 *   backing frame's REAL mass, KEYED BY THE LAYER each collider came from; (2) at-cap gating —
 *   deactivates the LO's collision when full, reactivates when radiation drains it below cap;
 *   (3) radiates a leaf with probability 1/capacity, AT one of the layers it absorbed from and
 *   carrying `emissivity` of that layer's cell capacity, decrementing EXACTLY. Mass is
 *   conserved exactly, now PER LAYER as well as in total.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * A wall that fills up as it absorbs, stops soaking at capacity, and drips the stored mass
 * back out as leaves OF THE SCALE IT SOAKED — with NO mass created or destroyed (Invariant
 * 5/7). This is the blackbody absorb/re-emit paradigm as pure sugar.
 *
 * EMISSIVITY is the wall's radiating efficiency, expressed the only way this engine expresses
 * "how much of a body is there": as a FULLNESS FRACTION of the emitted leaf. 1.0 emits a FULL
 * leaf (fullness 1 — light speed, shortest wavelength); 0.5 (the default) emits a half-full
 * one, which moves at half the gate probability and carries twice the wavelength. Emissivity
 * is therefore a colour/temperature knob, not a bookkeeping constant: it sets what the
 * re-emitted quantum IS, and speed and λ fall out of that together.
 */

(function () {

    /**
     * The default radiating efficiency for an absorber that never sets one (CEO ruling
     * 2026-08-11). A half-full leaf: it steps half the ticks and carries twice the wavelength
     * of a full one — a visibly "warm" re-emitter rather than a light-speed one.
     */
    var DEFAULT_EMISSIVITY = 0.5;

    /**
     * Emissivity is a FULLNESS fraction, so it lives in (0, 1] — a fullness above 1 is a move
     * gate above 1, which cannot mean anything. FAIL LOUD rather than clamp: a silently
     * clamped 2.0 would look like it worked and quietly emit light-speed leaves.
     *
     * NOTE (open, see the datasheet): 0 is REFUSED, not read as "never re-emit". The ruled mass
     * law floors the emitted mass at 1, so a 0 could not actually suppress emission — accepting
     * it would be a silent lie. A true perfect-absorber knob is a separate, unruled question.
     */
    function _validEmissivity(v, whence) {
        var n = Number(v);
        if (!isFinite(n) || n <= 0 || n > 1) {
            throw new Error('[' + whence + '] emissivity must be a fullness fraction in (0, 1] — got ' +
                JSON.stringify(v) + '. Above 1 is a move gate above 1; 0 is refused because the ' +
                'emitted-mass law floors at 1 cell and could not honour it.');
        }
        return n;
    }

    /**
     * Snap a requested absorb-clock capacity to a LEVEL the engine can actually size, by ASKING
     * the engine (`universe.levelCapacity`) rather than inverting `4^L` — which is the A={x,y}
     * answer only. Returns the smallest level whose real capacity covers the request, so the
     * clock never promises a ceiling the frame has no cells for. Minimum level 1 (an LO is a
     * leaf frame at Dim>0, CEO round-2 (3)).
     */
    function deriveBackingLevel(universe, capacity) {
        var want = Math.max(1, Number(capacity) || 1);
        for (var lvl = 1; lvl <= 64; lvl++) {
            if (universe.levelCapacity(lvl) >= want) { return lvl; }
        }
        throw new Error('[deriveBackingLevel] no leaf level up to 64 reaches the requested absorb ' +
            'capacity ' + want + ' on this universe\'s active axes.');
    }

    // Read [cx, cy] centre from a rect ([l,t,w,h] / [l,t,z,w,h,d] / {left,top,w,h} / Rectangle).
    function _rectCenter(rect) {
        if (Array.isArray(rect)) {
            if (rect.length === 6) { return [rect[0] + rect[3] / 2, rect[1] + rect[4] / 2]; }
            return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
        }
        var l = (rect.left !== undefined) ? rect.left : rect._left;
        var t = (rect.top !== undefined) ? rect.top : rect._top;
        return [l + rect.w / 2, t + rect.h / 2];
    }
    // Right-face exit point (radiated leaves are placed OUTSIDE the wall so they fly
    // away rather than immediately re-colliding with their own absorber).
    function _rectRightExit(rect) {
        var c = _rectCenter(rect);
        var right;
        if (Array.isArray(rect)) { right = (rect.length === 6) ? (rect[0] + rect[3]) : (rect[0] + rect[2]); }
        else { var l = (rect.left !== undefined) ? rect.left : rect._left; right = l + rect.w; }
        return [right, c[1]];
    }

    // Per-layer ledger helpers (Map<layer:number, mass:number>).
    function _bump(map, layer, delta) {
        map.set(layer, (map.get(layer) || 0) + delta);
    }
    function _layersAscending(map) {
        var out = [];
        map.forEach(function (_v, k) { out.push(k); });
        out.sort(function (a, b) { return a - b; });
        return out;
    }

    /**
     * READ the LO's mandatory backing leaf (created at registration) and prime it as the
     * absorber's mass ledger. Returns the backing-frame descriptor.
     *
     * `level`/`capacity` are the ABSORB-CLOCK knobs (how fast the wall fills and how often it
     * radiates), derived from the requested `capacity` through the engine's published capacity
     * law — independent of the backing frame's own geometric level. `rect` is retained in the
     * signature for call-site compatibility but is no longer used (the engine owns the center).
     */
    function attachAbsorberBackingFrame(universe, loHandle, rect, capacity) { // eslint-disable-line no-unused-vars
        var level = deriveBackingLevel(universe, capacity);
        var realCap = universe.levelCapacity(level);
        var fh = universe.getLargeObjectFrameId(loHandle);   // the registration-created ledger
        var backingQid = universe.getFrameQuantumId(fh);
        // Start EMPTY (mass 1 = nearly-empty floor; mass 0 risks the cap/mass wavelength write).
        // The +1 baseline is subtracted out of every conservation reading below.
        universe.setFrameProperty(backingQid, 'mass', 1);
        return { backingFrameHandle: fh, backingQid: backingQid, level: level, capacity: realCap };
    }

    /**
     * Build the ABSORB radiation host tick-fn. `cfg`:
     *   universe, loHandle, backingQid, capacity, rect, [emissivity], [loActiveSetter], [exit]
     * Exposes:
     *   `.stats()` → { stored, absorbedTotal, radiatedTotal, byLayer[] } for tests/readouts
     *   `.emissivity()` / `.setEmissivity(v)` → the LIVE radiating-efficiency knob
     *   `.setRect(rect)` → the wall moved: the exit follows it (Wall.setRect calls this)
     * `stored`/`absorbedTotal`/`radiatedTotal` all EXCLUDE the mass-1 backing baseline.
     */
    function buildAbsorbRadiationTickFn(cfg) {
        var universe = cfg.universe, loHandle = cfg.loHandle, backingQid = cfg.backingQid;
        var capacity = cfg.capacity, rect = cfg.rect;
        var exit = cfg.exit || _rectRightExit(rect);
        // Emission happens AT a layer the wall absorbed from (per-layer ledgers below), and an
        // absorbed frame lived in its own dimension — so every emission layer already exists.
        // Nothing here can make routing allocate a layer, and so nothing here can re-base the
        // world's floor (universe.rs::route_injected_frames).
        var BASE = 1;                        // the mass-1 empty baseline (see attach)
        var absorbedTotal = 0, radiatedTotal = 0, referenceMass = BASE;
        var emissivity = (cfg.emissivity === undefined || cfg.emissivity === null)
            ? DEFAULT_EMISSIVITY
            : _validEmissivity(cfg.emissivity, 'buildAbsorbRadiationTickFn');

        // Per-layer provenance of the ONE scalar backing mass. `stored` is what is still held
        // from each layer; `absorbed`/`radiated` are cumulative. The invariant this exists to
        // make checkable: for EVERY layer, stored + radiated == absorbed, and the stored values
        // sum to the backing frame's real mass.
        var absorbedByLayer = new Map(), radiatedByLayer = new Map(), storedByLayer = new Map();

        function setActive(active) {
            if (typeof cfg.loActiveSetter === 'function') { cfg.loActiveSetter(active); }
            else if (universe && typeof universe.setLargeObjectActive === 'function') {
                universe.setLargeObjectActive(loHandle, active);
            }
        }

        /**
         * MULTI-LAYER APPORTIONING — an LO that observes collisions at several layers radiates
         * at EACH layer in proportion to the mass it absorbed from that layer's collisions, so
         * conservation holds per layer and not merely in total.
         *
         * PENDING CEO CONFIRM (orchestrator's interpretation of the CEO's direction, 2026-08-11): the
         * proportion is drawn against each layer's UNRADIATED stored mass, which is what makes
         * "in proportion to what it absorbed from that layer" exactly true in the ledger rather
         * than only in expectation — a layer that has already given back everything it soaked
         * stops being a candidate instead of borrowing another layer's mass.
         *
         * The draw is SKIPPED when only one layer is in play, so a single-layer world consumes
         * exactly the RNG stream it did before this rule existed.
         */
        function pickEmissionLayer() {
            var layers = _layersAscending(storedByLayer).filter(function (L) {
                return (storedByLayer.get(L) || 0) > 0;
            });
            if (layers.length === 0) { return null; }
            if (layers.length === 1) { return layers[0]; }
            var total = 0, i;
            for (i = 0; i < layers.length; i++) { total += storedByLayer.get(layers[i]); }
            var draw = ((typeof universe.random === 'function') ? universe.random() : Math.random()) * total;
            for (i = 0; i < layers.length; i++) {
                draw -= storedByLayer.get(layers[i]);
                if (draw < 0) { return layers[i]; }
            }
            return layers[layers.length - 1];
        }

        var tick = function absorbRadiationTick(arg) {
            // Resolve the tickData carrying THIS/last tick's collected KILLED frames.
            //
            // This host tick-fn rides `universe.experimentTickFunctions`, which the engine calls
            // as `fn(universe)` BEFORE do_tick (the Phase-A emitter/thermostat seam). But a radiation
            // consumer needs the POST-tick output (TickData.objects[handle].frames). So when called
            // with the universe (no `.objects`), read the universe's cached LAST tickData — a
            // one-tick lag; mass is still exactly conserved. The bench/tests call `fn(tickData)`
            // directly (same-tick). The ORIGINAL K5-realm bug was reading `universe.objects`
            // (undefined) here → `absorbedThisTick=0` every tick → silent zero, no radiation.
            var tickData = (arg && arg.objects) ? arg
                : (universe && universe._lastTickData) ? universe._lastTickData
                : null;

            // (1) tally the collected KILLED colliders into the backing frame's REAL mass,
            //     recording WHICH LAYER each one came from. The cap clamp is applied per
            //     collider (in collection order) rather than to the tick's sum: the landed
            //     total is identical, and every layer's share of it is then exact — no
            //     proportional fudge to apportion a clamped remainder with.
            var o = tickData && tickData.objects && tickData.objects[loHandle];
            var cur = universe.getFrameProperty(backingQid, 'mass');
            var curBefore = cur;
            if (o && Array.isArray(o.frames)) {
                for (var i = 0; i < o.frames.length; i++) {
                    var f = o.frames[i];
                    if (!f || f.isAlive !== false || typeof f.mass !== 'number') { continue; }
                    var room = capacity - cur;
                    if (room <= 0) { break; }        // full: the rest pile/pass (a sink)
                    var landed = Math.min(f.mass, room);
                    if (landed <= 0) { continue; }
                    cur += landed;
                    absorbedTotal += landed;
                    _bump(absorbedByLayer, f.layer, landed);
                    _bump(storedByLayer, f.layer, landed);
                }
            }
            if (cur !== curBefore) { universe.setFrameProperty(backingQid, 'mass', cur); }
            if (cur > referenceMass) { referenceMass = cur; }

            // (2) at-cap gating: stop absorbing when full; resume once radiation drains it.
            setActive(cur < capacity);

            // (3) radiate with p = 1/capacity, AT a layer this wall actually soaked from, with
            //     the emitted leaf's mass set by EMISSIVITY as a fraction of that layer's own
            //     cell capacity (read from the engine — never a hand-derived 4^level). Never
            //     more than that layer still holds, never below HALF the absorbed peak.
            if ((cur - BASE) > 0) {
                var coin = (typeof universe.random === 'function') ? universe.random() : Math.random();
                if (coin < (1 / capacity)) {
                    var L = pickEmissionLayer();
                    if (L !== null) {
                        var heldAtL = storedByLayer.get(L);
                        var radMass = Math.min(
                            Math.max(1, Math.round(emissivity * universe.levelCapacity(L))),
                            heldAtL
                        );
                        var floor = BASE + (referenceMass - BASE) / 2;   // never below half the peak
                        if ((cur - radMass) >= floor) {
                            var half = Math.pow(2, L) / 2;
                            var rh = universe.makeLeafFrame(exit[0] + half + 1, exit[1] - half, L, null, 1, 0, true, 0, null);
                            universe.injectFrame(rh);
                            var rq = universe.getFrameQuantumId(rh);
                            universe.setFrameProperty(rq, 'mass', radMass);
                            universe.setFrameProperty(backingQid, 'mass', cur - radMass);
                            radiatedTotal += radMass;
                            _bump(radiatedByLayer, L, radMass);
                            _bump(storedByLayer, L, -radMass);
                        }
                    }
                }
            }
        };

        tick.stats = function () {
            var stored = universe.getFrameProperty(backingQid, 'mass') - BASE;
            var seen = new Map();
            absorbedByLayer.forEach(function (_v, k) { seen.set(k, true); });
            radiatedByLayer.forEach(function (_v, k) { seen.set(k, true); });
            var byLayer = _layersAscending(seen).map(function (L) {
                return {
                    layer: L,
                    absorbed: absorbedByLayer.get(L) || 0,
                    radiated: radiatedByLayer.get(L) || 0,
                    stored: storedByLayer.get(L) || 0
                };
            });
            return { stored: stored, absorbedTotal: absorbedTotal, radiatedTotal: radiatedTotal, byLayer: byLayer };
        };

        /** The wall's LIVE radiating efficiency (fullness fraction of the emitted leaf). */
        tick.emissivity = function () { return emissivity; };
        /** Live-set the radiating efficiency; takes effect at the next emission (no recompile). */
        tick.setEmissivity = function (v) {
            emissivity = _validEmissivity(v, 'setEmissivity');
            return emissivity;
        };

        /** The wall MOVED (Wall.setRect): re-derive the right-face exit from the new rect, so a
         *  radiated leaf leaves the wall where it now stands. A caller-stated `cfg.exit` is the
         *  caller's own placement and is kept. */
        tick.setRect = function (r) {
            if (!cfg.exit) { exit = _rectRightExit(r); }
        };

        return tick;
    }

    var api = {
        DEFAULT_EMISSIVITY: DEFAULT_EMISSIVITY,
        deriveBackingLevel: deriveBackingLevel,
        attachAbsorberBackingFrame: attachAbsorberBackingFrame,
        buildAbsorbRadiationTickFn: buildAbsorbRadiationTickFn
    };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    else { window.AbsorbRadiation = api; window.buildAbsorbRadiationTickFn = buildAbsorbRadiationTickFn; }

})();
