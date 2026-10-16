/* Copyright 2023-2026 by Essam Abadir */

/**
 * Trace — THE WIRE PART. A routed, terminated conductor assembled entirely from
 * stock parts: mirror `Tunnel` runs + directed `Tunnel` corner junctions + a
 * `Wall{destroy}` ground. It is the standard part gates and adders are built from.
 *
 *     var t = new Trace(universe, { path: [[40,200],[240,200],[240,360]], bore: 3, ground: true });
 *     t.inPort;   // [40,200]  — where the source feeds it
 *     t.outPort;  // [240,360] — where it delivers
 *     t.onTick(tickData);        // once per tick (self-gating; no-op with no corners)
 *     t.getDelivered();          // quanta delivered to ground (calibrated)
 *
 * ── WHY THE NAME IS "TRACE" AND NOT "WIRE" ──────────────────────────────────
 * Named LAST, from what it was measured to do. It routes on the CARDINAL grid
 * only — straight x/y runs joined by right-angle junctions (Manhattan routing),
 * because a diagonal corridor of tilted mirrors was measured NOT to conduct
 * (G ≈ 0.04 at 15/30/45 deg vs 1.01 on-axis). Straight segments, right-angle
 * corners and a fixed parallel pitch is exactly a PCB trace, so that is the name.
 * It is the wire of this line; "trace" is just the honest word for the routing
 * it actually supports.
 *
 * ── PURE COMPOSITION — zero engine, zero new physics (canonical-bench SU1) ────
 * A Trace adds NO collision logic. Every piece is a part already on the floor:
 *   RUN      → `Tunnel{ mode:'mirror' }`   — two guarded-bounce mirror Walls = insulation
 *   CORNER   → `Tunnel{ mode:'directed' }` — wall hits are RE-EMITTED down the outgoing
 *              leg instead of reflected back; + one mirror `Wall` capping the outer face
 *   GROUND   → `Wall{ collisionBehavior:'destroy', hooks:['count'] }` — the sink + tally
 * The source is NOT part of a Trace (a wire carries no battery); feed `inPort` with
 * whatever emitter the experiment wants. If building a Trace ever seems to need engine
 * or provider code, STOP: it is Tunnels + a Wall.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `new Trace(universe, opts)` — builds + engine-registers the runs, junctions and
 *   ground. It does NOT add itself to a runner render list; the caller iterates
 *   `trace.largeObjects` (or `runner.setup()` auto-wires them).
 *
 *   ORDERING PRECONDITION — `universe.init()` MUST already have run. A Trace registers
 *   LargeObjects in its constructor, and the engine throws ("EGPTUniverse.init() must be
 *   called before any simulation methods") on any registration against a fresh universe.
 *   An `FrqtlApp`'s universe is NOT init'd, so the SKETCH inits it FIRST and then
 *   constructs parts (world.init() FIRST → CONSTRUCT parts → WIRE → RUN) — see
 *   `setupTraceCircuit.js`, whose first act is the world step. Order among PARTS is
 *   irrelevant; only world-before-parts matters. This bit once already: the demo threw on
 *   every real page while its tests passed, because the test double had no ordering
 *   concept. `setup-trace-circuit.test.mjs` now enforces the precondition in its double.
 *   @param {Object} universe — an EGPTUniverse (JS or WASM compat shim).
 *   @param {Object} opts
 *   @param {Array<Array<number>>} opts.path — 2+ waypoints `[[x,y],…]` on the BORE
 *     CENTRE-LINE, px. Consecutive points must differ on exactly ONE axis (cardinal
 *     routing) — FAIL-LOUD otherwise, because a diagonal run does not conduct.
 *   @param {number} [opts.bore=3] — clear aperture, px. 3 is the recommended minimum
 *     (see Layer 2); the transport measurement is flat from bore 3 to bore 40.
 *   @param {number} [opts.wallThickness=6] — insulation thickness, px. This is the
 *     knob that actually sets the shrink floor — see Layer 2. Below 3px the mirror
 *     leaks; the required thickness RISES as the bore falls.
 *   @param {boolean} [opts.ground=false] — build the sink terminal at the outlet.
 *   @param {number} [opts.groundGap=4] — px between the outlet and the ground slab.
 *   @param {number} [opts.cornerSpread=5] — the directed junction's fan half-width in
 *     DEGREES. Tighter is better, with a shallow optimum at 5: measured corner
 *     throughput G = 0.94 (5), 0.94 (0), 0.92 (10), 0.88 (20), 0.76 (45), 0.59 (90).
 *   @param {Array}  [opts.color=[90,120,200]] — RGB for the runs.
 *   @param {string} [opts.name='trace'] — identifier prefix.
 *
 * @property {Array<Tunnel>} segments — the mirror runs, in path order.
 * @property {Array<Tunnel>} junctions — the directed corner cells, in path order.
 * @property {Array<Wall>}  caps — the mirror walls closing each corner's outer face.
 * @property {Wall|null} ground — the sink terminal (`opts.ground`).
 * @property {Array} inPort, outPort — `[x,y]` centre-line inlet / outlet.
 * @property {Array<LargeObject>} largeObjects — every inner engine LO (render wiring).
 *
 * Methods:
 *   `onTick(tickData)` — the ONE per-tick call. Fans out to each junction's
 *     `applyRedirectIfActive` (the host half of directed mode) and samples the ground.
 *     SELF-GATING: a straight Trace with no corners and no ground is a no-op, so a
 *     caller never needs its own `if (hasCorners)` check.
 *   `attachToRunner(runner)` — subscribe `onTick` to the runner's per-tick fan-out.
 *   `getDelivered()` — quanta delivered to ground since construction, CALIBRATED.
 *     A destroy+count wall registers each arrival on TWO consecutive ticks (measured,
 *     deterministic), so the raw counter is halved here — one authority, so no caller
 *     has to know. Throws without a ground.
 *   `getCurrent()` — delivered per tick over the last sampled window.
 *   `dispose()` — tears down every sub-part (idempotent).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * ZERO physics of its own (SU1). Everything below is the emergent behaviour of the
 * stock parts, MEASURED on this construction (WASM engine, 2D, fundamental dim 0,
 * laser feed on the centre-line, steady-state current over a 250-tick window,
 * conductance G = delivered/tick ÷ emitted/tick):
 *
 *   CONDUCTION. A Trace run delivers essentially ALL the current it accepts:
 *   G = 1.00 ± 0.02 across seeds, against G = 0.29 ± 0.02 for the same source and
 *   ground with the run REMOVED. Leakage through the mirrors is 0.0 %. The mirrors
 *   are not "guiding" in a soft sense — nothing gets out.
 *
 *   LENGTH IS FREE. Conduction is length-independent; the run is a lossless
 *   waveguide, so lengthening a Trace costs propagation DELAY (1 px/tick — bench M1)
 *   and nothing else. Optimise junctions, never run length.
 *
 *   BORE. Transport is flat in bore: G = 1.01 / 1.00 / 1.01 / 1.00 / 1.00 at bore
 *   40 / 24 / 16 / 8 / 4. Wider does not carry more current once the current is
 *   inside. (Wider does ACCEPT more at the mouth — that is a source-coupling
 *   property of the inlet, not of the conductor.)
 *
 *   THE SHRINK FLOOR IS WALL THICKNESS, NOT BORE. Measured G by (bore, wallThickness):
 *
 *       bore\wt |    3       6      10
 *          3    |  1.010   1.002   0.996
 *          2    |  0.203   1.001   1.001      ← 0.203 leaks 48 %
 *          1    |  0.044   0.195   0.987      ← 0.987 leaks 0.1 %
 *
 *   A bore-1 Trace conducts at G = 0.987 with zero leak PROVIDED the insulation is
 *   ≥ 10 px. The thinner the bore, the thicker the wall must be. A too-thin wall does
 *   not degrade — it goes transparent, and the fault looks like a broken conductor.
 *
 *   PITCH (the reason it shrinks usefully). Lanes stacked one energised, the rest dark,
 *   measured lane-by-lane. Crosstalk only ever reaches the IMMEDIATELY adjacent lane —
 *   lane 2 and beyond measured EXACTLY 0.000 in every configuration tested.
 *
 *   Each Trace owns its own insulation, so INDEPENDENT Traces stack at
 *   `bore + 2 x wallThickness` (`Trace.lanePitch()`), wall against wall:
 *
 *       bore 3 + wall 3  → pitch  9 px, crosstalk 0.98 %
 *       bore 2 + wall 6  → pitch 14 px, crosstalk 0.00 %
 *       bore 12 + wall 6 → pitch 24 px, crosstalk 0.00 %
 *
 *   DO NOT OVERLAP TWO TRACES' MIRRORS TO SAVE THE PITCH. Stacking Traces at
 *   `bore + wallThickness`, so each pair of neighbours' mirrors lands on exactly the
 *   same pixels, LEAKS BADLY — measured crosstalk 31.0 % (bore 3), 33.6 % (bore 2),
 *   4.1 % (bore 12). Two coincident mirror walls are markedly WORSE than one: a
 *   SINGLE shared rail at that same 6 px pitch measures 4.1 % at bore 3, so the loss
 *   is caused by the duplication, not by the tightness. It fails silently — the
 *   energised lane still reads G = 0.98, so only the dark lane's meter shows it.
 *   FRQTL-MAINT(coincident-mirror-leak): design around it — never place two mirror
 *   Walls on the same pixels.
 *
 *   A tighter bus is still available, but it needs a genuinely SHARED rail (one wall
 *   serving two bores), which is a different part from a row of independent Traces:
 *   a ladder of N+1 shared rails measured 4.1 % at 6 px pitch (bore 3 + wall 3),
 *   1.2 % at 8 px (bore 2 + wall 6) and 0.03 % at 11 px (bore 1 + wall 10), with
 *   eight lanes fitting a 51 px band at G = 1.02 on the energised lane. That shared-rail
 *   bus is the natural NEXT part; a Trace deliberately does not pretend to be one.
 *
 *   THE CORNER: TWO WORKING MECHANISMS, AND THE ONE THAT MEASURED BETTER.
 *   A specular mirror DOES turn a ballistic 1 px/tick current — that is exactly what
 *   `Wall{collisionBehavior:'bounce', bounceDirection:'reflect'}` compiles (the velocity
 *   component perpendicular to the face flips, out = 180 + 2*orientation - in), and the
 *   Collision-Lab rungs route with it: `cl1a-mirror` steers a laser off one tilted mirror,
 *   and `cl1d-mirror-route` loops a beam around a CLOSED ten-mirror {10/3} star forever.
 *   Both mechanisms were built here and measured on the SAME rig, bore 12, settled, 2 seeds,
 *   best configuration of each (51 mirror configurations swept):
 *
 *       reflect-Wall mirror elbow      → G = 0.738 +- 0.011
 *       directed-Tunnel junction       → G = 0.951 +- 0.005
 *
 *   The directed junction is what a Trace uses because it measured 1.3x better in a
 *   BORE-TO-BORE corner — NOT because a mirror cannot turn current. The gap (0.21) is ~20x
 *   the seed spread, so the choice is decided, but the REASON is geometric: a mirror
 *   reflects specularly, so it PRESERVES the beam's angular spread and every off-axis ray
 *   leaves off-axis and misses the narrow outgoing mouth; the directed junction RE-AIMS
 *   every hit into a tight fan down the outgoing leg, which is what a bore-to-bore corner
 *   needs. In OPEN SPACE — cl1d's star, where the next "mouth" is a slab many beam-widths
 *   wide — the mirror is the right part and a directed cell would be pointless. Pick by
 *   geometry, not by a blanket rule.
 *
 *   Mirror-elbow tuning, if you build one anyway: the slab must be TALL/THIN (Wall infers
 *   the flip axis from the ASPECT — a wide/flat slab flips the wrong component) and the cell
 *   TIGHT. G = 0.73 (thickness 2), 0.67 (3), 0.68 (4), 0.34 (10), 0.17 (20); a cell much
 *   larger than the bore is worse (0.08), because a bigger room with the same small door
 *   loses more.
 *
 *   Directed-junction tuning, by fan half-width: G = 0.951 (5 deg), 0.94 (0), 0.92 (10),
 *   0.88 (20), 0.76 (45), 0.59 (90) — hence `cornerSpread: 5`.
 *
 *   WHAT A CORNER ACTUALLY COSTS: DELAY AND STORED POPULATION, NOT CURRENT. Measured on the
 *   shipped Trace geometry, fully settled (2600 ticks), 2 seeds, spread +-0.011:
 *
 *       route                  G       in-flight population
 *       straight            0.997            4 035
 *       one corner          0.990            4 576
 *       two corners         0.978            5 731
 *
 *   At steady state a corner gives back nearly everything: ~1 % per corner, which is only
 *   just above the seed spread. What visibly grows is the POPULATION HELD IN THE ROUTE — the
 *   junction cells store quanta while they find the exit. This is the same lesson as
 *   "length is free": the cost is transit time, not lost current. Read a corner too early
 *   and it looks far lossier than it is (the under-settled reads of this same geometry gave
 *   0.94 / 0.87, and QA independently hit a 0-conductance read for the same reason) — always
 *   settle past propagation delay PLUS the averaging window before quoting a corner.
 *
 *   CORNERS ARE BORE-LIMITED — ROUTE TURNS WIDE, RUN NARROW. Unlike a straight run
 *   (flat in bore), a turn's throughput collapses as the bore narrows, because the
 *   re-emitted current has to find the outgoing mouth and that acceptance is an
 *   aperture problem:
 *
 *       bore 12, flare 12  → G = 0.951
 *       bore  3, flare 12  → G = 0.31-0.44  (unflared, cell = bore: 0.016 — a DEAD corner)
 *       bore  1, flare 12  → G = 0.000
 *
 *   The same limit hits the mirror elbow, and harder — it has no re-aiming step at all, so
 *   at bore 3 it measured 0.047 where the directed junction managed 0.31-0.44.
 *
 *   Hence `cornerSize` defaults to `max(bore, 12)`: a junction always flares to at
 *   least 12 px even when the runs are 1-3 px, which is the difference between a
 *   19x-better corner and a dead one. The design rule that follows: put turns on wide
 *   bore and neck down to bore 1-3 only for the straight parallel stretches. A dense
 *   bus should be straight; the routing should happen where there is room.
 *
 *   THE ONE SWITCH THAT CHANGES THE COMPONENT: `universe.withInterQuantumCollisions`.
 *   Off (the default here) the Trace is a lossless waveguide with no ampacity limit.
 *   On, it becomes a current-limited device — that is RESISTANCE, and it is a
 *   different component with a different datasheet.
 */

(function () {

    // ── Imports (Node) or CALL-TIME globals (browser) ────────────────────────
    // Browser resolution is at CALL time, never module-eval time: these are classic
    // scripts in a roster and an eval-time capture would make correctness a latent
    // property of list position (the realm failure Tunnel.js documents at length).
    var _Tunnel = null, _Wall = null;
    if (typeof module !== 'undefined' && module.exports) {
        _Tunnel = require('./Tunnel').Tunnel;
        _Wall = require('./Wall').Wall;
    }
    function _getTunnel() {
        return _Tunnel || (typeof window !== 'undefined' && window.Tunnel) || null;
    }
    function _getWall() {
        return _Wall || (typeof window !== 'undefined' && window.Wall) || null;
    }

    /**
     * A `destroy` wall carrying the `count` hook registers each arrival on TWO
     * consecutive ticks (measured, deterministic: one quantum → 2 collected frames,
     * on the tick the kill op fires and the tick after, before cleanup). Every
     * delivered-count read divides by this ONE constant so no caller has to know.
     * FRQTL-MAINT(destroy-count-double-registers) — calibrated, not litigated.
     */
    var GROUND_COUNTS_PER_ARRIVAL = 2;

    /** Direction of travel from A to B as a compass unit vector + degrees. */
    function _dir(a, b) {
        var dx = b[0] - a[0], dy = b[1] - a[1];
        if ((dx !== 0) === (dy !== 0)) {
            throw new Error('[Trace] path leg ' + JSON.stringify(a) + '->' + JSON.stringify(b) +
                ' is not cardinal. A Trace routes on the x/y grid only: a diagonal corridor was ' +
                'measured NOT to conduct (G ~ 0.04 vs 1.01 on-axis). Insert a waypoint. (FAIL-LOUD.)');
        }
        if (dx > 0) { return { ux: 1, uy: 0, deg: 0, axis: 'x' }; }
        if (dx < 0) { return { ux: -1, uy: 0, deg: 180, axis: 'x' }; }
        if (dy > 0) { return { ux: 0, uy: 1, deg: 90, axis: 'y' }; }
        return { ux: 0, uy: -1, deg: 270, axis: 'y' };
    }

    function Trace(universe, opts) {
        opts = opts || {};
        this.universe = universe;
        this._schemaKind = 'Trace';

        var path = opts.path;
        if (!Array.isArray(path) || path.length < 2) {
            throw new Error('[Trace] opts.path must be an array of 2+ [x,y] waypoints. (FAIL-LOUD.)');
        }
        var bore = (opts.bore !== undefined && opts.bore !== null) ? opts.bore : 3;
        var wallThickness = (opts.wallThickness !== undefined && opts.wallThickness !== null)
            ? opts.wallThickness : 6;
        if (!(bore > 0) || !(wallThickness > 0)) {
            throw new Error('[Trace] bore and wallThickness must both be positive. (FAIL-LOUD.)');
        }
        var cornerSpread = (typeof opts.cornerSpread === 'number') ? opts.cornerSpread : 5;
        var color = opts.color || [90, 120, 200];
        var name = opts.name || 'trace';
        var groundGap = (opts.groundGap !== undefined) ? opts.groundGap : 4;
        // The junction is a SQUARE cell of this side, centred on the waypoint — a FLARE.
        // Independent of the run bore, and that independence is load-bearing: a junction
        // sized to a narrow bore does not turn the current at all (bore 3 with a 3px cell
        // measured G = 0.016 — a dead corner; widening the cell along the outgoing leg
        // alone did not help either, G = 0.014). A corner needs ROOM in the TRANSVERSE
        // direction, so the cell flares out to `cornerSize` and the runs neck back down.
        var cornerSize = (typeof opts.cornerSize === 'number') ? opts.cornerSize : Math.max(bore, 12);

        this.path = path.map(function (p) { return [p[0], p[1]]; });
        this.bore = bore;
        this.wallThickness = wallThickness;
        this.cornerSpread = cornerSpread;
        this.cornerSize = cornerSize;
        this.color = color;
        this.name = name;

        var TunnelCls = _getTunnel();
        var WallCls = _getWall();
        if (!TunnelCls || !WallCls) {
            throw new Error('[Trace] Tunnel.js + Wall.js are not loaded (game-layer roster). (FAIL-LOUD.)');
        }

        this.segments = [];
        this.junctions = [];
        this.caps = [];
        this.ground = null;
        this.largeObjects = [];
        this.walls = [];

        var half = bore / 2;
        var i, d, dPrev;

        // ── RUNS: one mirror Tunnel per leg, TRIMMED back by half a bore at every
        //    interior waypoint so the junction cell owns the corner square. ──────
        for (i = 0; i < path.length - 1; i++) {
            d = _dir(path[i], path[i + 1]);
            // The junction owns a square of side `cornerSize` centred on the waypoint, so a
            // leg stops (or starts) half a cell away from every interior waypoint.
            var trim = cornerSize / 2;
            var startTrim = (i === 0) ? 0 : trim;                        // leaving a corner
            var endTrim = (i === path.length - 2) ? 0 : trim;            // entering a corner
            var ax = path[i][0] + d.ux * startTrim;
            var ay = path[i][1] + d.uy * startTrim;
            var bx = path[i + 1][0] - d.ux * endTrim;
            var by = path[i + 1][1] - d.uy * endTrim;
            // SIGNED along the direction of travel — an over-trimmed leg leaves a NEGATIVE
            // remainder, and `Math.abs` would silently turn that into a short but "valid"
            // run pointing the wrong way.
            var runLen = (bx - ax) * d.ux + (by - ay) * d.uy;
            if (runLen <= 0) {
                throw new Error('[Trace] leg ' + i + ' is shorter than the corner cells it must join ' +
                    '(length ' + runLen + ' after trimming for bore ' + bore + '). Space the waypoints ' +
                    'at least one bore apart. (FAIL-LOUD.)');
            }
            var seg = new TunnelCls(universe, (d.axis === 'x')
                ? { left: Math.min(ax, bx), top: ay - half, length: runLen, bore: bore,
                    wallThickness: wallThickness, axis: 'x', mode: 'mirror',
                    name: name + '_run' + i, color: color }
                : { left: ax - half, top: Math.min(ay, by), length: runLen, bore: bore,
                    wallThickness: wallThickness, axis: 'y', mode: 'mirror',
                    name: name + '_run' + i, color: color });
            this.segments.push(seg);
        }

        // ── CORNERS: a short DIRECTED cell at each interior waypoint, aimed down the
        //    outgoing leg, plus one mirror cap closing the cell's outer face. ─────
        for (i = 1; i < path.length - 1; i++) {
            dPrev = _dir(path[i - 1], path[i]);
            d = _dir(path[i], path[i + 1]);
            if (d.axis === dPrev.axis) {
                throw new Error('[Trace] waypoint ' + i + ' does not turn (both legs run on the ' +
                    d.axis + ' axis). Merge the collinear legs. (FAIL-LOUD.)');
            }
            var cx = path[i][0], cy = path[i][1];
            // A square cell of side `cornerSize` centred on the waypoint. Its Tunnel runs
            // along the OUTGOING axis, so its two directed walls face the INCOMING beam —
            // the pair the current actually hits — and the re-emission aims every hit down
            // the new leg.
            var chalf = cornerSize / 2;
            var cell = new TunnelCls(universe, {
                left: cx - chalf, top: cy - chalf, length: cornerSize, bore: cornerSize,
                wallThickness: wallThickness, axis: d.axis,
                mode: 'directed', directedAngle: d.deg, redirectSpread: cornerSpread,
                name: name + '_corner' + i, color: color
            });
            this.junctions.push(cell);

            // Cap the face OPPOSITE the outlet (the -outgoing side) so nothing escapes
            // backwards out of the junction. Prefix picks the reflect axis (Wall's own
            // convention): a wall normal to y is TOP_, normal to x is LEFT_.
            var span = cornerSize + 2 * wallThickness;
            // Flush against the cell on the -outgoing side.
            var capRect = (d.axis === 'y')
                ? [cx - chalf - wallThickness, (d.uy > 0 ? cy - chalf - wallThickness : cy + chalf), span, wallThickness]
                : [(d.ux > 0 ? cx - chalf - wallThickness : cx + chalf), cy - chalf - wallThickness, wallThickness, span];
            this.caps.push(new WallCls(universe, {
                rect: capRect,
                collisionBehavior: 'bounce', bounceDirection: 'reflect',
                name: (d.axis === 'y' ? 'TOP_' : 'LEFT_') + name + '_cap' + i,
                color: color
            }));
        }

        // ── GROUND: the sink terminal across the outlet. ─────────────────────────
        this.inPort = [path[0][0], path[0][1]];
        this.outPort = [path[path.length - 1][0], path[path.length - 1][1]];
        var dOut = _dir(path[path.length - 2], path[path.length - 1]);
        this.outDirection = dOut.deg;
        if (opts.ground) {
            var gspan = bore + 2 * wallThickness;
            var gx = this.outPort[0] + dOut.ux * groundGap;
            var gy = this.outPort[1] + dOut.uy * groundGap;
            this.ground = new WallCls(universe, {
                rect: (dOut.axis === 'x')
                    ? [dOut.ux > 0 ? gx : gx - 4, gy - gspan / 2, 4, gspan]
                    : [gx - gspan / 2, dOut.uy > 0 ? gy : gy - 4, gspan, 4],
                collisionBehavior: 'destroy', hooks: ['count'],
                name: name + '_ground', color: [60, 60, 255]
            });
        }

        // ── Roll up every sub-part for render wiring. ────────────────────────────
        var parts = [];
        this.segments.forEach(function (s) { parts = parts.concat(s.walls); });
        this.junctions.forEach(function (j) { parts = parts.concat(j.walls); });
        parts = parts.concat(this.caps);
        if (this.ground) { parts.push(this.ground); }
        this.walls = parts;
        var self = this;
        parts.forEach(function (w) {
            if (w && w.lo) {
                self.largeObjects.push(w.lo);
            }
        });

        // THE ONE UP-LINK: the Trace stamps exactly what IT composed — its run and corner
        // Tunnels (each stamps its own plates), its caps and its ground.
        this.segments.concat(this.junctions, this.caps, this.ground ? [this.ground] : []).forEach(function (p) {
            if (p) { p._owner = self; }
        });

        this._rawDelivered = 0;
        this._window = [];
        this._unsub = null;
        this._disposed = false;
    }

    /**
     * THE ONE per-tick call. Self-gating: drives every directed junction's host-side
     * redirect and samples the ground counter. A straight, ungrounded Trace is a no-op
     * here, so a caller never needs its own `if (hasCorners)` guard — forgetting that
     * guard is the exact bug `Tunnel.applyRedirectIfActive` exists to make impossible.
     * @param {Object} tickData — this tick's TickData (from `universe.doTick()`).
     */
    Trace.prototype.onTick = function (tickData) {
        for (var i = 0; i < this.junctions.length; i++) {
            this.junctions[i].applyRedirectIfActive(tickData);
        }
        if (this.ground) {
            var raw = this.ground.getCollisionHistogram(tickData).total;
            this._window.push(raw);
            if (this._window.length > 251) { this._window.shift(); }
            this._rawDelivered = raw;
        }
    };

    /** Subscribe `onTick` to a runner's per-tick fan-out. Idempotent. */
    Trace.prototype.attachToRunner = function (runner) {
        if (this._unsub || !runner || typeof runner.addTickListener !== 'function') { return this._unsub || null; }
        var self = this;
        this._unsub = runner.addTickListener(function (td) { self.onTick(td); });
        return this._unsub;
    };

    /**
     * Quanta delivered to ground since construction. CALIBRATED — see
     * GROUND_COUNTS_PER_ARRIVAL. Throws on an ungrounded Trace rather than reporting 0.
     */
    Trace.prototype.getDelivered = function () {
        if (!this.ground) {
            throw new Error('[Trace.getDelivered] this Trace has no ground terminal ' +
                '(construct with `ground:true`). (FAIL-LOUD.)');
        }
        return this._rawDelivered / GROUND_COUNTS_PER_ARRIVAL;
    };

    /** Delivered quanta per tick over the sampled window (0 until the window fills). */
    Trace.prototype.getCurrent = function () {
        if (this._window.length < 2) { return 0; }
        var span = this._window.length - 1;
        return ((this._window[span] - this._window[0]) / GROUND_COUNTS_PER_ARRIVAL) / span;
    };

    /** Full teardown; delegates to each sub-part's own dispose. Idempotent. */
    Trace.prototype.dispose = function () {
        if (this._disposed) { return; }
        this._disposed = true;
        if (this._unsub) { this._unsub(); this._unsub = null; }
        var all = this.segments.concat(this.junctions);
        all.forEach(function (p) { if (p && typeof p.dispose === 'function') { p.dispose(); } });
        this.caps.forEach(function (w) { if (w && typeof w.dispose === 'function') { w.dispose(); } });
        if (this.ground && typeof this.ground.dispose === 'function') { this.ground.dispose(); }
    };

    /**
     * Centre-to-centre spacing for INDEPENDENT parallel Traces: each Trace carries its
     * own two mirrors, so neighbours sit wall-against-wall. Do NOT tighten this to
     * `bore + wallThickness` — that overlaps the two mirrors and leaks (see Layer 2).
     * @param {number} bore @param {number} wallThickness @returns {number} px
     */
    Trace.lanePitch = function (bore, wallThickness) {
        return bore + 2 * wallThickness;
    };

    /**
     * The measured design rules, as DATA — so a layout tool (or a gate) can pick a
     * geometry without re-running the bench. `pitch` is `Trace.lanePitch()` for
     * independent Traces; `crosstalk` is the fraction of the energised lane's current
     * that appears in the immediately adjacent lane at that pitch (lanes 2+ measured
     * exactly zero in every configuration).
     */
    Trace.GEOMETRIES = [
        { bore: 3, wallThickness: 3, pitch: 9, crosstalk: 0.0098, note: 'densest independent lane' },
        { bore: 2, wallThickness: 6, pitch: 14, crosstalk: 0.0, note: 'narrow bore, thick insulation' },
        { bore: 1, wallThickness: 10, pitch: 21, crosstalk: 0.0, note: 'smallest bore that conducts' },
        { bore: 12, wallThickness: 6, pitch: 24, crosstalk: 0.0, note: 'roomy — the only bore that TURNS well' }
    ];

    /** Measured throughput of one right-angle junction, by `cornerSpread` (degrees). */
    Trace.CORNER_THROUGHPUT = { 0: 0.935, 5: 0.951, 10: 0.920, 20: 0.881, 45: 0.760, 90: 0.590 };

    /**
     * The two corner MECHANISMS that were built and measured, best-of-sweep at bore 12, so a
     * later part can pick with the numbers instead of re-deriving them. A specular
     * `Wall{bounce/reflect}` elbow DOES turn the current (the Collision-Lab mirror rungs route
     * with it); it simply measured lower in a bore-to-bore corner, where preserving the beam's
     * angular spread is a liability rather than a feature.
     */
    Trace.CORNER_MECHANISMS = {
        mirrorElbow:      { G: 0.738, sd: 0.011, part: "Wall{collisionBehavior:'bounce', bounceDirection:'reflect'}" },
        directedJunction: { G: 0.951, sd: 0.005, part: "Tunnel{mode:'directed'}" }
    };

    Trace.GROUND_COUNTS_PER_ARRIVAL = GROUND_COUNTS_PER_ARRIVAL;

    // ── Export ───────────────────────────────────────────────────────────────
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Trace: Trace };
    } else {
        window.Trace = Trace;
    }

})();
