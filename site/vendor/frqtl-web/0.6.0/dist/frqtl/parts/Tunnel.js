/* Copyright 2023-2026 by Essam Abadir */

/**
 * Tunnel — TWO parallel MIRROR Walls forming a corridor (a tunnel is implemented
 * with two mirrors). The waveguide /
 * light-pipe primitive: a beam travelling down the bore bounces off the two facing
 * mirror walls (the guarded reflection law), staying collimated inside the channel.
 *
 *     var t = new Tunnel(universe, { left: 96, top: 233, length: 64, bore: 31 });
 *     t.walls;      // [ Wall{bounce}, Wall{bounce} ] — the two mirror surfaces
 *     t.innerRect;  // [96, 233, 64, 31] — the clear bore (aperture) the beam passes
 *
 * ── PURE COMPOSITION — zero engine, zero new physics (canonical-bench SU1) ─────
 * A Tunnel adds NO collision logic of its own. It CONSTRUCTS two `Wall`s with
 * `collisionBehavior:'bounce'` (the guarded, zero-leak reflection the Collision-Lab
 * mirrors already prove) and places them a `bore` apart. Every collision effect is
 * REALIZED by the two walls' compiled op-programs — the SAME reflect law the bench
 * goldens hold. A Tunnel cannot move a bench golden; it only names + places a pair
 * of the mirror primitive. If building a Tunnel ever seems to need engine or
 * provider code, STOP: it is two `Wall`s + a bore.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `new Tunnel(universe, opts)` — builds + engine-registers TWO mirror `Wall`s.
 *   (It does NOT add itself to any runner render list; the caller — the
 *   ObjectFactory builder or a setup factory — iterates `tunnel.walls` /
 *   `tunnel.largeObjects`; no render-wiring call is needed (each inner LargeObject
 *   registered itself with the world when it was constructed), exactly as it
 *   would for a bare `Wall`, or `runner.setup()` auto-wires `tunnel.largeObjects`.)
 *   @param {Object} universe — an EGPTUniverse (JS or WASM compat shim).
 *   @param {Object} opts
 *   @param {number} opts.left, opts.top — the bore (aperture) top-left corner, px.
 *   @param {number} opts.length — the travel-axis extent of the corridor, px (x
 *     extent for a horizontal tunnel, y extent for a vertical one).
 *   @param {number} opts.bore — the cross-section gap between the two mirror inner
 *     faces, px (the clear aperture the beam passes through).
 *   @param {number} [opts.wallThickness=10] — thickness of each mirror wall, px.
 *   @param {'x'|'y'} [opts.axis='x'] — corridor travel axis. 'x' → a HORIZONTAL
 *     corridor (two wide/flat mirrors above+below the bore; a +x beam reflects its
 *     vy). 'y' → a VERTICAL corridor (two tall/thin mirrors left+right of the bore;
 *     a +y beam reflects its vx).
 *   @param {number} [opts.z], [opts.depth] — 3D passthrough. When `depth` is given
 *     each mirror Wall is built as a z-slab (6-element rect) — the is3D reflection
 *     comes FREE from the Wall's own depth field (a 3D corridor with real z-walls);
 *     omitted → a flat 2D-in-3D corridor, byte-identical to a 2D scene.
 *   @param {Array}  [opts.color=[90,120,200]] — RGB render color for both mirrors.
 *   @param {number} [opts.wallOpacity] — render opacity 0-255 for both mirrors.
 *   @param {string} [opts.name='tunnel'] — display/debug identifier prefix
 *     (`<name>_A` = the first mirror, `<name>_B` = the second).
 *   @param {'mirror'|'directed'} [opts.mode='mirror'] — the corridor's COLLISION MODE.
 *     `'mirror'` (DEFAULT) is the pre-existing guarded-bounce waveguide, unchanged and
 *     byte-identical. `'directed'` is the DIRECTED TUNNEL: a wall hit
 *     re-emits the quantum in a random FORWARD direction within a 180° fan about the
 *     corridor's own axis — the tunnel behaves as a semi-circular emitter rather than a
 *     mirror. See `opts.directedAngle` / `opts.redirectSpread` and the Layer-2 note.
 *     CONSTRUCTION-LEVEL, not live: the directed mode needs its walls registered with the
 *     engine's `collect_collided` flag, which is a REGISTRATION-time flag with no live
 *     toggle (`Wall.setWallBehavior` refuses exactly this switch). Change it by rebuilding.
 *   @param {number} [opts.directedAngle] — `'directed'` mode AIM, in DEGREES: the centre
 *     of the forward fan. Omitted ⇒ DERIVED from `axis` (0° = +x for an x-axis corridor,
 *     90° = +y for a y-axis one) — i.e. "forward" is the corridor's own travel direction.
 *     Supply `180`/`270` to aim a corridor that is fed from the far end. The BODY stays
 *     axis-aligned (a Tunnel is two AABB walls); this angle drives the redirect only —
 *     the same v1 split `DirectedTunnel.orientation` documents.
 *   @param {number} [opts.redirectSpread=90] — `'directed'` mode fan HALF-WIDTH, DEGREES.
 *     The default `90` is a full 180° forward fan (`directedAngle ± 90°`).
 *     `0` collapses to a perfectly collimated re-emission along `directedAngle`.
 *   @param {boolean} [opts.exitCollapse=false] — THE POINT-EXIT GATE (D3). Adds a THIRD
 *     LargeObject spanning the last 2 columns of the bore at the corridor's OUTPUT mouth,
 *     whose whole behavior is one position write: every crossing quantum is pinned to the
 *     bore's mid-line, so the mouth emits as a one-pixel POINT SOURCE. Orthogonal to
 *     `mode` (it composes with either), default OFF. Requires the fast path
 *     (`withInterQuantumCollisions:false`) — FAIL-LOUD otherwise, see the Layer-2 note.
 *     ZERO offset, no jitter: the SphereEmitter has no occupancy mechanism either (a burst
 *     with emission box 0 starts every quantum on the SAME pixel and co-location is inert
 *     on the fast path), so a literal one-pixel point source is the faithful replication.
 *     A transverse random jitter is specifically what an earlier self-interference seed did
 *     before it was replaced for BLURRING the bands — do not add one.
 *   @param {boolean} [opts.exitPhaseReset=false] — coherence option ON the exit gate: append
 *     `set frame.local_time = 0` to the gate's program, re-phase-locking the ensemble at the
 *     mouth. Default OFF — this is a deliberate coherence CHOICE, not a ratified behavior;
 *     it exists so both regimes are drivable and the boundary is visible. LIVE via
 *     `setExitPhaseReset()`. Requires `exitCollapse` (it is an op on that gate).
 *     It is PHASE ONLY — never the separable decoherence bundle, whose second op redraws
 *     charge. The corridor WALLS keep their no-reset rule regardless.
 *   @param {number} [opts.polarSpread=0] — `'directed'` mode polar (out-of-plane) fan
 *     half-width, DEGREES. `0` (DEFAULT, including on a 3D corridor) keeps the re-emission
 *     in the XY plane — the measured, angle-uniform case. A non-zero value draws the polar
 *     angle UNIFORMLY IN PHI, which is polar-uniform and NOT solid-angle-uniform on the
 *     hemisphere (it over-weights the pole). Opt in deliberately; do not read it as an
 *     isotropic 3D scatter.
 *
 * @property {Array<Wall>} walls — the two mirror `Wall` facades.
 * @property {Array<LargeObject>} largeObjects — the two inner engine LOs (the key
 *   `FrqtlApp.setup()` auto-wires for rendering).
 * @property {Array} innerRect — the clear bore rect [left, top, length, bore]
 *   (4-el), or [left, top, z, length, bore, depth] (6-el, 3D).
 * @property {Wall} wallA, wallB — the two mirrors individually.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * ZERO physics of its own (SU1). The corridor's collimating action IS emergent
 * from the two mirrors: a particle whose transverse walk would carry it into a
 * mirror is reflected back into the bore (vy flipped for a horizontal tunnel, vx
 * for a vertical one) by the compiled bounce op-program — no random scatter, no
 * leak through the wall (the guarded reflect law), so the beam stays collimated
 * down the channel. This is the physical difference the rebuild targets vs
 * the legacy RANDOM_XY slit liners (which scatter randomly and can leak).
 *
 * `mode:'directed'` swaps that ONE emergent effect for the other one:
 * instead of reflecting the incidence axis, each wall hit RE-EMITS the quantum into a
 * uniformly-drawn direction inside the forward 180°, so the corridor reads as a
 * semi-circular (semi-spherical) emitter rather than a mirror. It is still ZERO new
 * physics — it is the SAME two-piece composition `DirectedTunnel.option1` already
 * commits, ported onto the mirror-pair Tunnel rather than re-invented beside it:
 *
 *   1. IN-TICK, per wall — an EJECT-ONLY compiled behavior (`slitLinerScatter`'s
 *      `'ejectY'`: a position write, and deliberately NO velocity ops) so the frame
 *      leaves the wall the same tick. `'ejectY'` is chosen for exactly the reason
 *      DirectedTunnel chose it — it has no velocity ops at all, so the eject owns
 *      POSITION and the redirect owns VELOCITY, with zero cross-coupling.
 *   2. BETWEEN TICKS, host — `directedRedirectProgram.buildRedirectApplier` reads the
 *      walls' collected frames from `tickData.objects[handle].frames` and draws each
 *      exit azimuth uniformly in `directedAngle ± redirectSpread` with REAL trig,
 *      preserving the frame's own incoming speed (`speed:null` ⇒ a DIRECTION-only
 *      rewrite; speed is always 1px/tick anyway — Invariant 1 / bench M1 — so only
 *      the direction ratio `l2_walk_probs` normalizes is being set).
 *
 * WHY THE HOST HALF IS NOT AN OP-PROGRAM — and must not be "simplified" into one.
 * The op vocabulary has no `cos`/`sin` (the FN_NAMES gap) and ops cannot loop, so no
 * in-tick rejection sampling is expressible. The two in-tick shapes that ARE expressible
 * are both measurably wrong for a 180° angle-uniform fan: the legacy RANDOM_XY box draw
 * (`vx=random()`, `vy=random()*2-1`) is 1.83:1 DIAGONAL-WEIGHTED with peaks at ±45°, and
 * the chord-lerp constrained cone is fully DEGENERATE at exactly 180° (its own docstring
 * restricts it to <180°). Reaching for either is the bug, not the shortcut.
 *
 * Latency is not a reason to prefer an in-tick write either: collision detection is
 * itself post-move within Phase C, so an in-engine `set` and a host `setFrameProperty`
 * both affect motion starting the tick AFTER detection (measured in the DirectedTunnel
 * round). NO decoherence is bundled into the scatter — the legacy RANDOM_XY liner reset
 * `local_time=0`, which phase-locks the ensemble and produced a spurious coherent drift;
 * decoherence stays a separate, off-by-default op set.
 *
 * `exitCollapse` (D3) turns the corridor's OUTPUT MOUTH into a point source. The banding in
 * the self-interference exemplar comes from equal-radius quanta sharing a spin phase: births
 * at `local_time=0` are phase-locked, fundamental leaves step P=1 so AGE = RADIUS, and the λ
 * coin adds a transverse kick whose bias flips per spin quadrant — every ray snakes with
 * period λ and the ensemble reads as concentric bands. Collapsing every exiting quantum onto
 * one pixel supplies the "one origin" half of that mechanism.
 *
 * WHAT IT DOES NOT SUPPLY, and why `exitPhaseReset` exists. Quanta reaching the mouth have
 * DIFFERENT transit histories, so their phases are spread — measured on this exact
 * construction (240px corridor): within-same-crossing-tick `local_time` std ≈ 45 ticks. Whether
 * that spread matters is λ-DEPENDENT, because the spin period IS λ_eff: one full transverse
 * cycle takes λ_eff ticks (frame.rs `compute_spin` quadrants the leaf's `local_time % wl`).
 *   - λ_eff ≈ 256 (the self-interference golden): a 45-tick spread is ~18% of the 256-tick
 *     period — the exit is ~82% phase-aligned FOR FREE, and the banding should substantially
 *     survive with the toggle OFF.
 *   - λ_eff ≲ 128: the exit is measurably phase-FLAT (8-bin phase CV ≈ 0.09) — the fan reads
 *     smooth and un-banded with the toggle OFF, and banded with it ON.
 * That CONTRAST is the experiment. Nothing here is tuned to make both regimes look alike.
 *
 * The gate is only meaningful on the fast path. With `withInterQuantumCollisions:true` the
 * collapse pixel becomes a one-frame-per-tick SERIALIZER: the frustration pass reverts the
 * losers to their pre-move positions (undoing the collapse write) and kills contended frames
 * — measured, 1 of 5 dead within 20 ticks. The constructor refuses that configuration rather
 * than producing a scene that measures contention instead of a point source.
 *
 * Residual differences from a FRESH emission, if the picture is subtly off: the angular
 * distribution is transit-FILTERED (not the emitter's uniform half-disk); charge/mass/λ are
 * preserved from birth so parity needs a matching feeder; and the launch geometry is a TRUE
 * point, where the exemplar launches on a velocity-aligned shell (innerR 16) — so the
 * exemplar has an empty centre and this deliberately will not.
 */

import { Wall as _Wall } from './Wall.js';
import * as _SlitLinerScatter from '../objects/objects/slitLinerScatter.js';
import * as DirectedRedirectProgram from '../objects/objects/directedRedirectProgram.js';
import * as _AstSchema from '../../shim/expr/ast-schema.js';
import { buildTriggerExpr as _buildTriggerExpr, applyProgramTrigger as _applyProgramTrigger } from '../objects/objects/actionCompiler.js';
import { LargeObject as _LargeObject } from './LargeObject.js';
import * as _LoDrawnCenter from '../compat/renderer/lo-drawn-center.js';
import { registerKind } from '../objects/kinds.js';
import { setupTunnelPointExit } from '../objects/setup/setupTunnelPointExit.js';

    // SlitLinerScatter + DirectedRedirectProgram are the TWO halves of the directed
    // mode, both already committed for DirectedTunnel's `option1`. They are CONSUMED
    // here, never re-derived — in particular `applyLinerScatter` carries the O4b
    // program-trigger fix (a replacement program pushed without re-attaching its
    // `trigger` silently no-ops), which a hand-rolled program push in this file would
    // have to reproduce and would very likely get wrong.

    var MODE_MIRROR = 'mirror';
    var MODE_DIRECTED = 'directed';
    var MODES = [MODE_MIRROR, MODE_DIRECTED];

    // The exit gate's column WIDTH, in px. TWO, not one, and that is load-bearing: a
    // diagonal mover's base-walk and transverse yo-yo can STACK to ±2 on one axis in a
    // single tick (Invariant 1 — the sanctioned exception), so a 1px column is jumpable
    // and the collapse would silently miss those frames. With 2px a frame may instead sit
    // in the gate for two consecutive ticks and take the op twice — a uniform 1-tick
    // re-pin at the same apex, identical for every frame, harmless to the ensemble.
    var EXIT_GATE_WIDTH = 2;

    // LoDrawnCenter.hasZ — the ONE z-presence test (lo-drawn-center.js).
    function _hasZ(rect) {
        return _LoDrawnCenter.hasZ(rect);
    }

    /**
     * THE member geometry (one derivation, shared by the constructor and setRect): the two mirror
     * plate rects, the clear bore, the exit-gate rect and the collapse target, all from the
     * corridor's declared fields. 4-element rects for a flat corridor, z-capable 6-element ones
     * when it has a depth.
     * @private
     */
    function _geometry(left, top, length, bore, wallThickness, axis, z, depth) {
        var g = {};
        if (axis === 'x') {
            g.rectA = [left, top - wallThickness, length, wallThickness];      // top mirror
            g.rectB = [left, top + bore, length, wallThickness];               // bottom mirror
            g.innerRect = [left, top, length, bore];
            g.gateRect = [left + length - EXIT_GATE_WIDTH, top, EXIT_GATE_WIDTH, bore];
            g.midCoord = top + bore / 2;      // bore mid-line in Y
        } else {
            g.rectA = [left - wallThickness, top, wallThickness, length];      // left mirror
            g.rectB = [left + bore, top, wallThickness, length];               // right mirror
            g.innerRect = [left, top, bore, length];
            g.gateRect = [left, top + length - EXIT_GATE_WIDTH, bore, EXIT_GATE_WIDTH];
            g.midCoord = left + bore / 2;     // bore mid-line in X
        }
        if (depth !== null) {
            var zs = function (r) { return [r[0], r[1], z, r[2], r[3], depth]; };
            g.rectA6 = zs(g.rectA); g.rectB6 = zs(g.rectB); g.gateRect6 = zs(g.gateRect);
            g.innerRect = zs(g.innerRect);
        }
        return g;
    }

    function Tunnel(universe, opts) {
        opts = opts || {};
        this.universe = universe;
        this._schemaKind = this.constructor.name;

        var left = opts.left, top = opts.top;
        var length = opts.length, bore = opts.bore;
        if (!(length > 0) || !(bore > 0)) {
            throw new Error('[Tunnel] opts.length and opts.bore must both be positive numbers.');
        }
        var wallThickness = (opts.wallThickness !== undefined && opts.wallThickness !== null) ? opts.wallThickness : 10;
        var axis = (opts.axis === 'y') ? 'y' : 'x';
        var hasDepth = (opts.depth !== undefined && opts.depth !== null);
        var z = (opts.z !== undefined && opts.z !== null) ? opts.z : 0;
        var depth = hasDepth ? opts.depth : null;
        var color = opts.color || [90, 120, 200];
        var name = opts.name || 'tunnel';

        // ── Collision MODE (D2) ──────────────────────────────────────────────
        // 'mirror' (default) = the pre-existing guarded-bounce waveguide, untouched.
        // 'directed' = eject-only walls + the host 180° forward re-emission.
        // FAIL-LOUD on anything else (never a silent fallback to mirror).
        var mode = (opts.mode !== undefined && opts.mode !== null) ? opts.mode : MODE_MIRROR;
        if (MODES.indexOf(mode) === -1) {
            throw new Error('[Tunnel] unknown mode "' + mode + '". Expected: ' + MODES.join(' | '));
        }
        var directed = (mode === MODE_DIRECTED);
        // AIM: the fan's centre. Omitted ⇒ the corridor's OWN forward travel direction,
        // derived from `axis` — never a hand-typed default per call site.
        var directedAngleDeg = (typeof opts.directedAngle === 'number')
            ? opts.directedAngle : (axis === 'y' ? 90 : 0);
        // FAN HALF-WIDTH: 90° ⇒ the full 180° forward fan.
        var redirectSpreadDeg = (typeof opts.redirectSpread === 'number') ? opts.redirectSpread : 90;
        // POLAR half-width: 0 even on a 3D corridor — a non-zero value is polar-uniform,
        // NOT solid-angle-uniform (see the module docstring). Opt in deliberately.
        var polarSpreadDeg = (typeof opts.polarSpread === 'number') ? opts.polarSpread : 0;

        // ── EXIT-GATE COLLAPSE (D3) ──────────────────────────────────────────
        // A third LargeObject at the corridor's OUTPUT mouth that pins every crossing
        // quantum to the bore's mid-line, turning the mouth into a one-pixel POINT SOURCE.
        // Orthogonal to `mode` (it composes with either), default OFF.
        var exitCollapse = !!opts.exitCollapse;
        // THE TWO INDEPENDENT EXIT FLAGS (D4). Both are ops on the gate `exitCollapse` creates,
        // so both require it; neither implies the other.
        //   exitRecenter   — the point-source collapse. DEFAULT ON (preserves D3 behaviour).
        //   exitPhaseReset — coherence. DEFAULT OFF (a choice, not a ratified behaviour).
        // Making recentering optional is what SEPARATES "does the point source matter?" from
        // "does coherence matter?" — while it was mandatory the two were confounded.
        var exitRecenter = (opts.exitRecenter !== undefined) ? !!opts.exitRecenter : true;
        var exitPhaseReset = !!opts.exitPhaseReset;
        if ((exitPhaseReset || opts.exitRecenter !== undefined) && !exitCollapse) {
            throw new Error('[Tunnel] exitPhaseReset / exitRecenter require exitCollapse — both are ' +
                'ops on the exit gate, and without the gate there is nothing to carry them. (FAIL-LOUD.)');
        }

        // ── REGIME PRECONDITION — fail loud, not a comment ───────────────────
        // Both the directed scatter and the exit collapse are only valid on the fast path
        // (`withInterQuantumCollisions:false`), which is what every one of these experiments
        // already runs. With IQC ON the collapse point becomes a one-frame-per-tick
        // SERIALIZER: the frustration pass REVERTS the losers to their pre-move positions —
        // undoing the collapse write — and kills contended frames (measured: 1 of 5 dead
        // within 20 ticks). The experiment would then be measuring collapse contention, not
        // a point source. Refuse rather than silently produce that.
        if ((directed || exitCollapse) && universe && universe.withInterQuantumCollisions === true) {
            throw new Error('[Tunnel] mode:"directed" / exitCollapse require ' +
                'withInterQuantumCollisions:false (the fast path). With inter-quantum collisions ON ' +
                'the collapse point becomes a one-frame-per-tick serializer: the frustration pass ' +
                'reverts the collapse write and KILLS contended quanta, so the scene measures ' +
                'contention rather than the point source. (FAIL-LOUD.)');
        }

        // Stash the authored construction values (what the parts writer captures —
        // the descriptor fields read these back verbatim, Box precedent).
        this.left = left; this.top = top; this.length = length; this.bore = bore;
        this.wallThickness = wallThickness; this.axis = axis; this.color = color;
        this.name = name;
        // `mode` is ALWAYS stashed (unlike the optional z/depth pair): it is the user-facing
        // knob, so the Inspector must render its selector on every tunnel, which needs a
        // defined value to read. The three directed-only tunables follow the z/depth
        // OPT-IN precedent instead — left undefined in mirror mode so captureProps skips
        // them and a mirror tunnel's captured entry gains exactly ONE key, not four.
        this.mode = mode;
        if (directed) {
            this.directedAngle = directedAngleDeg;
            this.redirectSpread = redirectSpreadDeg;
            this.polarSpread = polarSpreadDeg;
        }
        // Same OPT-IN stashing discipline as z/depth: undefined unless armed, so a tunnel
        // without the gate codegens exactly as it did before D3.
        if (exitCollapse) {
            this.exitCollapse = true;
            this.exitRecenter = exitRecenter;
            this.exitPhaseReset = exitPhaseReset;
        }
        // z/depth are DECLARED descriptor fields (TunnelDescriptor) so a 3D corridor
        // round-trips through the parts writer. A FLAT (2D) tunnel leaves them
        // `undefined` — captureProps skips undefined, so a 2D capture carries
        // no `"z":0,"depth":null` noise.
        if (hasDepth) { this.z = z; this.depth = depth; }

        // ── Mirror wall rects (two parallel plates a `bore` apart) ───────────
        // axis 'x': wide/flat mirrors ABOVE and BELOW the bore (reflect vy).
        // axis 'y': tall/thin mirrors LEFT and RIGHT of the bore (reflect vx).
        var geo = _geometry(left, top, length, bore, wallThickness, axis, z, depth);
        var rectA = geo.rectA, rectB = geo.rectB;

        // ── Build the two Walls — the ONE mirror atom, or the directed pair ──
        // MIRROR: collisionBehavior 'bounce' (guarded reflect law, bounceDirection 'reflect').
        // DIRECTED: 'nothing' (the wall itself neither reflects nor kills — it must contribute
        // ZERO velocity ops so the host redirect is the only velocity write) + the
        // registration-time collect flag the redirect reads its frames from. The eject-only
        // program is pushed just below, once both walls exist.
        var self = this;
        function mkWall(rect, suffix) {
            var wopts = {
                rect: rect,
                collisionBehavior: directed ? 'nothing' : 'bounce',
                name: name + suffix,
                color: color
            };
            // collect_collided has NO live toggle in the substrate, so a directed tunnel must
            // register for it at construction — this is why `mode` is construction-level.
            if (directed) { wopts.collectCollided = true; }
            if (opts.wallOpacity !== undefined) { wopts.alpha = opts.wallOpacity; }
            // 3D passthrough: a real depth makes each mirror a z-slab (is3D reflect FREE
            // from Wall's own depth field). z lands the slab; omitting depth keeps a flat 2D wall.
            if (depth !== null) { wopts.z = z; wopts.depth = depth; }
            return new _Wall(self.universe, wopts);
        }
        this.wallA = mkWall(rectA, '_A');
        this.wallB = mkWall(rectB, '_B');
        this.walls = [this.wallA, this.wallB];
        this.largeObjects = [this.wallA.lo, this.wallB.lo];
        this.innerRect = geo.innerRect;

        // ── EXIT GATE (D3): the point-source collapse at the corridor's output mouth ──
        // A THIRD LargeObject spanning the last EXIT_GATE_WIDTH columns of the bore,
        // bore-cross-section only, whose whole behavior is one POSITION write. This is
        // in-tick op-program DATA on the eject precedent (`set 0.top`, conformance
        // EP22-EP25) — NOT a host tick-fn: the host slot exists because angle-uniform
        // VELOCITY redraw needs trig the op vocabulary lacks, and a position write with a
        // baked literal needs none of that.
        this.exitGate = null;
        this._exitGateMid = null;
        if (exitCollapse) {
            var ast = _AstSchema;
            var mkTrigger = _buildTriggerExpr;
            var attachTrigger = _applyProgramTrigger;
            // Gate rect + the collapse target, both derived from the corridor's own geometry
            // — compile-time sugar data, the same "baked at construction" pattern as the
            // directed mode's angleRad. The corridor's LONG axis picks which coordinate is
            // pinned: an x corridor collapses Y to the bore mid-line, a y corridor collapses X.
            var gateRect = geo.gateRect, midCoord = geo.midCoord;
            var pinProp = (axis === 'x') ? 'top' : 'left', sizeProp = (axis === 'x') ? 'h' : 'w';
            this._exitGateMid = midCoord;
            this._exitPinProp = pinProp;
            this._exitSizeProp = sizeProp;
            var gateOpts = {
                rect: gateRect,
                // The gate is not a barrier: it neither reflects nor kills. Its ONLY effect is
                // the position write pushed below. `visible:false` because drawing a bar across
                // the mouth would read as an obstruction it is not.
                collisionBehavior: 'nothing',
                collectCollided: true,
                visible: false,
                name: name + '_exitgate',
                color: color
            };
            if (depth !== null) { gateOpts.z = z; gateOpts.depth = depth; }
            var GateWallCls = _Wall;
            this.exitGate = new GateWallCls(this.universe, gateOpts);

            // Compile + push the gate's program from the TWO independent flags. ONE authority
            // (`_applyExitGateProgram`), shared by construction and by both live setters, so
            // the four flag combinations can never diverge between the two paths.
            this.exitRecenter = exitRecenter;
            this.exitPhaseReset = exitPhaseReset;
            this._applyExitGateProgram();
            this.walls.push(this.exitGate);
            this.largeObjects.push(this.exitGate.lo);
        }

        // ── DIRECTED mode: the two-piece composition (ported from DirectedTunnel.option1) ──
        this.applyRedirect = null;
        this._unsubRedirect = null;
        if (directed) {
            var SlitLinerScatter = _SlitLinerScatter;
            var buildRedirectApplier = DirectedRedirectProgram.buildRedirectApplier;
            // (1) IN-TICK: the eject-only program, per wall. The eject NORMAL points INTO the
            // bore — wallA sits on the low side of the corridor's cross-axis and ejects toward
            // the high side, wallB the reverse. Derived from `axis`, never hand-typed:
            //   axis 'x' → mirrors above/below → wallA ejects 'bottom', wallB ejects 'top'
            //   axis 'y' → mirrors left/right  → wallA ejects 'right',  wallB ejects 'left'
            // ('ejectY' is the behavior KEY — historical, DSE-liner-named; the DIRECTION is
            // this argument. It is the one behavior with NO velocity ops, which is precisely
            // why it is the correct partner for a host-owned velocity write.)
            var intoBoreA = (axis === 'y') ? 'right' : 'bottom';
            var intoBoreB = (axis === 'y') ? 'left' : 'top';
            SlitLinerScatter.applyLinerScatter(this.wallA.lo, universe, intoBoreA,
                { behavior: 'ejectY', resetLocalTime: false });
            SlitLinerScatter.applyLinerScatter(this.wallB.lo, universe, intoBoreB,
                { behavior: 'ejectY', resetLocalTime: false });
            // resetLocalTime stays FALSE: bundling the `local_time=0` phase reset into a
            // scatter phase-locks the ensemble (the measured spurious coherent drift).
            // Decoherence is a separable op set and is deliberately not armed here.

            // (2) BETWEEN TICKS: ONE host applier over BOTH walls. speed:null ⇒ direction-only.
            this.applyRedirect = buildRedirectApplier(universe, {
                wallHandles: [this.wallA.lo.handle, this.wallB.lo.handle],
                angleRad: directedAngleDeg * Math.PI / 180,
                spreadRad: redirectSpreadDeg * Math.PI / 180,
                speed: null,
                polarSpreadRad: polarSpreadDeg * Math.PI / 180
            });
        }

        // ── THE ONE UP-LINK: the Tunnel composed its plates and its gate (each a Wall facade),
        // so it stamps THEM — never their LOs (each Wall stamps its own LO). A drawn plate LO
        // therefore resolves LO → Wall → Tunnel. Zero behavior change.
        for (var i = 0; i < this.walls.length; i++) {
            this.walls[i]._owner = this;
        }
    }

    /**
     * `tunnel.rect` — the corridor's ENVELOPE: the axis-aligned box enclosing every member it
     * composed (both plates and the exit gate, which lies inside the bore), in the LO rect
     * shape `{left, top, w, h}` plus `{z, d}` when the corridor has depth. A pure getter over
     * the members' own rects (each Wall's rect is its one position authority), so it can never
     * disagree with what is drawn. The 2D overlay box, the aim surround and the carry read it.
     */
    Object.defineProperty(Tunnel.prototype, 'rect', {
        get: function () {
            var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
            var z0 = Infinity, z1 = -Infinity, hasZ = false;
            for (var i = 0; i < this.walls.length; i++) {
                var m = this.walls[i] && this.walls[i].rect;
                if (!m) { continue; }
                l = Math.min(l, m.left); t = Math.min(t, m.top);
                r = Math.max(r, m.left + m.w); b = Math.max(b, m.top + m.h);
                if (_hasZ(m)) {
                    hasZ = true;
                    var md = (typeof m.d === 'number') ? m.d : m.w;
                    z0 = Math.min(z0, m.z); z1 = Math.max(z1, m.z + md);
                }
            }
            if (!(l < r) || !(t < b)) { return undefined; }
            var env = { left: l, top: t, w: r - l, h: b - t };
            if (hasZ) { env.z = z0; env.d = z1 - z0; }
            return env;
        }
    });

    /**
     * THE ONE exit-gate program authority (D4). Compiles the gate's op-program from the two
     * INDEPENDENT flags and pushes it on the same live path `applyLinerScatter` /
     * `recompileActions` use. Construction and both live setters call THIS — so the four flag
     * combinations can never diverge between the build path and the toggle path.
     *
     *   recenter ON  → `set frame.top = boreMid - frame.h*0.5`  (the point-source collapse)
     *   phase    ON  → `set frame.local_time = 0`               (re-phase-lock the ensemble)
     *
     * BOTH OFF ⇒ **no program at all** (`program = null`, nothing pushed to the engine), NOT an
     * empty-ops program. That distinction is deliberate: an empty-ops program is
     * indistinguishable from a broken/mis-compiled gate when someone debugs this later,
     * whereas a null program reads unambiguously as "gate present, disarmed". The gate LO
     * itself STAYS REGISTERED as an inert collector, because `collect_collided` is a
     * registration-time engine flag with no live toggle — dropping the LO would make the two
     * flags un-flippable at runtime, which is exactly the manipulation this lab exists for.
     *
     * FUTURE-PROOFING NOTE (not built): the recenter op pins to a single mid-line. Generalising
     * it to an APERTURE (a band of width A centred on the mid-line, A=1 ⇒ today's point source,
     * A=bore ⇒ no collapse) is a change to THIS function alone — which is why the collapse
     * target is derived here rather than baked at three call sites.
     *
     * @private
     */
    Tunnel.prototype._applyExitGateProgram = function () {
        if (!this.exitGate) { return null; }
        var ast = _AstSchema;
        var HF = ast.HANDLE_FRAME;
        var ops = [];
        if (this.exitRecenter) {
            ops.push({
                set: HF + '.' + this._exitPinProp,
                to: ast.Bin('-', ast.Lit(this._exitGateMid),
                    ast.Bin('*', ast.Ref(HF, this._exitSizeProp), ast.Lit(0.5)))
            });
        }
        if (this.exitPhaseReset) {
            // PHASE ONLY — the single op. NEVER `_buildDecoherenceOps`: that bundle is TWO ops
            // and its second redraws CHARGE with an RNG draw, which is a rider nobody asked for
            // AND shifts every downstream seeded stream. The corridor WALLS keep
            // resetLocalTime:false regardless — this reset lives at the exit
            // gate and nowhere else.
            ops.push({ set: HF + '.local_time', to: ast.Lit(0) });
        }

        var program = null;
        if (ops.length) {
            program = { on: 'collision', ops: ops };
            // O4b: a program pushed WITHOUT re-attaching its trigger silently no-ops. Build +
            // attach through the SAME authority compileActions itself uses.
            _applyProgramTrigger(program, _buildTriggerExpr(
                this.exitGate.lo.reposition || null, false,
                ast.HANDLE_FRAME, ast.HANDLE_SELF,
                ast.Lit, ast.Ref, ast.Cmp, ast.Cond, ast.Fn
            ));
        }
        this.exitGate.lo.program = program;
        if (this.universe && typeof this.universe.updateObjectProperty === 'function') {
            this.universe.updateObjectProperty(this.exitGate.lo.handle, 'LargeObject', 'program', program);
        }
        return program;
    };

    /**
     * THE WRITE ROUTER (D5) — the Inspector / any `updateObjectProperty` caller lands here for
     * a Tunnel's SUGAR props, exactly as `SphereEmitter.prototype.applyProp` does for the
     * emitter's. Without it a live edit fell through to the generic mirror-write, which set a
     * DEAD property on this facade and never called the setter: the flag flipped in the
     * Inspector and the gate program never changed — a silent no-op, which is precisely what
     * the accessor's throw-or-apply contract forbids.
     *
     * `LIVE_PROPS` is the ONE routing table (owned by the object, never a second list inside
     * FrqtlApp — the coupling that has bitten the Wall v2 props before). A new live
     * facade prop is one entry here; `tunnel-point-exit.test.mjs` asserts every `live:true`
     * descriptor field is either routed here or is a render prop that fans out to the walls,
     * so forgetting the entry is a CI failure rather than a dead knob.
     *
     * @param {string} prop
     * @param {*} value
     * @returns {boolean} true when THIS router handled the write (the caller must then stop);
     *   false to fall through to the generic render-only / group fan-out path (e.g. `color`).
     */
    Tunnel.prototype.applyProp = function (prop, value) {
        var setter = Tunnel.LIVE_PROPS[prop];
        if (!setter) { return false; }
        if (typeof this[setter] !== 'function') {
            throw new Error('[Tunnel] live prop "' + prop + '" is routed to ' + setter +
                '() but that setter does not exist. (FAIL-LOUD.)');
        }
        this[setter](value);
        return true;
    };

    /** prop → setter. The ONE routing table for a Tunnel's live sugar props. */
    Tunnel.LIVE_PROPS = {
        exitRecenter:   'setExitRecenter',
        exitPhaseReset: 'setExitPhaseReset',
        // Position: the envelope (the 2D drag and the SPACE carry) and the declared bore origin
        // (an Inspector edit) — every one ends in setRect, the Tunnel's ONE position authority.
        rect:           'setRect',
        left:           'setLeft',
        top:            'setTop'
    };

    /**
     * setRect(rect) — THE Tunnel position/extent write (its envelope, `tunnel.rect`, is what it
     * places). `rect` is the write wire `[l,t,w,h]` or `[l,t,z,w,h,d]` of the ENVELOPE (both plates
     * and the gate); a 6-element write on a flat corridor THROWS (its 3D-ness is fixed at
     * construction, like a Wall's), a 4-element write on a deep corridor keeps z/depth.
     *
     * SAME EXTENT = a translation: the declared bore origin (left/top, and z) is re-derived from
     * the envelope, every member rect is re-derived through the SAME geometry the constructor used
     * and written through Wall.setRect (same size, so no member re-bakes — a directed corridor's
     * liner-eject programs survive untouched), then the exit-gate collapse target is re-derived and
     * the gate program re-pushed through its ONE authority (_applyExitGateProgram) — the mouth
     * collapses to the NEW mid-line.
     *
     * CHANGED EXTENT = a resize: length/bore (and depth) re-derive from the envelope (the wall
     * thickness is kept). A member whose program this Tunnel pushed (a directed corridor wall, the
     * exit gate) cannot be re-baked by its Wall, so the resize is REFUSED — atomically: every
     * member is checked before the first one moves. A plain mirror corridor's plates own their
     * programs and re-bake.
     *
     * Zero physics of its own: placement only, through each member's own setter.
     * @param {number[]} rect @returns {Tunnel} this
     */
    Tunnel.prototype.setRect = function (rect) {
        if (!Array.isArray(rect) || (rect.length !== 4 && rect.length !== 6) ||
            !rect.every(function (v) { return typeof v === 'number' && isFinite(v); })) {
            throw new TypeError('[Tunnel.setRect] rect must be the envelope [l,t,w,h] or [l,t,z,w,h,d] of finite ' +
                'numbers; got ' + JSON.stringify(rect) + '. (FAIL-LOUD.)');
        }
        var env = this.rect;
        var deep = _hasZ(env);
        if (rect.length === 6 && !deep) {
            throw new Error('[Tunnel.setRect] "' + this.name + '" is a flat corridor (built without a depth); a ' +
                '6-element rect would give it one, but its 3D-ness is compiled into its walls at construction. ' +
                '(FAIL-LOUD.)');
        }
        var L = rect[0], T = rect[1];
        var W = (rect.length === 6) ? rect[3] : rect[2], H = (rect.length === 6) ? rect[4] : rect[3];
        var Z = (rect.length === 6) ? rect[2] : (deep ? env.z : null);
        var D = (rect.length === 6) ? rect[5] : (deep ? env.d : null);
        var wt = this.wallThickness, axis = this.axis;
        var resized = (W !== env.w || H !== env.h || (deep && D !== env.d));
        var length = this.length, bore = this.bore;
        if (resized) {
            length = (axis === 'x') ? W : H;
            bore = ((axis === 'x') ? H : W) - 2 * wt;
            if (!(length > 0) || !(bore > 0)) {
                throw new Error('[Tunnel.setRect] the envelope ' + JSON.stringify(rect) + ' leaves no bore inside ' +
                    'two ' + wt + 'px walls. (FAIL-LOUD.)');
            }
            // Atomic: a member whose program this Tunnel pushed cannot be re-baked by its Wall.
            for (var i = 0; i < this.walls.length; i++) { this.walls[i].assertOwnsProgram(); }
        }
        var left = (axis === 'x') ? L : L + wt;
        var top = (axis === 'x') ? T + wt : T;
        var g = _geometry(left, top, length, bore, wt, axis, deep ? Z : 0, deep ? D : null);
        this.wallA.setRect(deep ? g.rectA6 : g.rectA);
        this.wallB.setRect(deep ? g.rectB6 : g.rectB);
        this.left = left; this.top = top; this.length = length; this.bore = bore;
        if (deep) { this.z = Z; this.depth = D; }
        this.innerRect = g.innerRect;
        if (this.exitGate) {
            this.exitGate.setRect(deep ? g.gateRect6 : g.gateRect);
            this._exitGateMid = g.midCoord;
            this._applyExitGateProgram();
        }
        return this;
    };

    /** setLeft(x) — move the declared bore origin's x (a translation through setRect). */
    Tunnel.prototype.setLeft = function (x) {
        var env = this.rect;
        return this.setRect([env.left + (x - this.left), env.top, env.w, env.h]);
    };
    /** setTop(y) — move the declared bore origin's y (a translation through setRect). */
    Tunnel.prototype.setTop = function (y) {
        var env = this.rect;
        return this.setRect([env.left, env.top + (y - this.top), env.w, env.h]);
    };

    /** True when the exit gate currently carries at least one op (i.e. it does something). */
    Tunnel.prototype.isExitGateArmed = function () {
        return !!(this.exitGate && this.exitGate.lo.program &&
                  this.exitGate.lo.program.ops && this.exitGate.lo.program.ops.length > 0);
    };

    /**
     * LIVE toggle for the exit gate's RECENTERING (D4) — the point-source collapse. Default ON;
     * turning it OFF leaves the corridor's exit spatially unchanged, which is what separates
     * "does the point source matter?" from "does coherence matter?" (the two were confounded
     * while recentering was mandatory).
     * @param {boolean} on
     * @returns {boolean} the resulting state (false if this tunnel has no exit gate).
     */
    Tunnel.prototype.setExitRecenter = function (on) {
        if (!this.exitGate) { return false; }
        var want = !!on;
        if (this.exitRecenter === want) { return want; }
        this.exitRecenter = want;
        this._applyExitGateProgram();
        return want;
    };

    /**
     * LIVE toggle for the exit gate's phase reset (D3 L2) — re-phase-locks the ensemble at the
     * mouth so every quantum leaving shares a spin phase and AGE = RADIUS again. Flipping it
     * mid-run makes the banding appear/disappear, which IS the experiment. No rebuild.
     * @param {boolean} on
     * @returns {boolean} the resulting state (false if this tunnel has no exit gate).
     */
    Tunnel.prototype.setExitPhaseReset = function (on) {
        if (!this.exitGate) { return false; }
        var want = !!on;
        if (this.exitPhaseReset === want) { return want; }
        this.exitPhaseReset = want;
        this._applyExitGateProgram();
        return want;
    };

    /**
     * The ONE per-tick call a consumer makes, unconditionally, for every tunnel — it
     * SELF-GATES on the mode, so a caller never needs its own `mode === 'directed'`
     * check (forgetting that gate is the exact C1 bug DirectedTunnel's
     * `applyRedirectIfActive` exists to make structurally impossible). A mirror tunnel
     * is a no-op here.
     *
     * The host half CANNOT be a `universe.experimentTickFunctions` push: those run in
     * Phase A, BEFORE this tick's collision + collect, and the redirect needs THIS tick's
     * Phase-D `tickData.objects[handle].frames`. `attachToRunner` below wires it to the
     * runner's per-tick fan-out (the peer of the page's single `onTick` slot); a caller
     * without a runner calls this directly, the `DetectorWall.getCollisionHistogram(tickData)`
     * idiom.
     * @param {Object} tickData - this tick's TickData (from `universe.doTick()`).
     */
    Tunnel.prototype.applyRedirectIfActive = function (tickData) {
        if (this.mode === MODE_DIRECTED && this.applyRedirect) { this.applyRedirect(tickData); }
    };

    /**
     * Subscribe this tunnel's redirect to a runner's per-tick fan-out
     * (`FrqtlApp.addTickListener` — the multi-subscriber peer of the page's single
     * `onTick` slot, so it never steals it). Called by the ObjectFactory builder, which is
     * what makes the directed mode part of the declared object: the mode is a DECLARED
     * descriptor field on the facade, so every build of it (a sketch entry, a Restart)
     * re-wires itself.
     *
     * Idempotent, and a no-op for a mirror tunnel or a runner without the fan-out.
     * @param {Object} runner - an FrqtlApp (needs `addTickListener`).
     * @returns {Function|null} the unsubscribe fn (also stored for `dispose`).
     */
    Tunnel.prototype.attachToRunner = function (runner) {
        if (this.mode !== MODE_DIRECTED || this._unsubRedirect) { return this._unsubRedirect; }
        if (!runner || typeof runner.addTickListener !== 'function') { return null; }
        var self = this;
        this._unsubRedirect = runner.addTickListener(function (tickData) {
            self.applyRedirectIfActive(tickData);
        });
        return this._unsubRedirect;
    };

    /**
     * Full teardown: unsubscribe the directed-mode tick listener (so a removed tunnel
     * stops writing velocities), then dispose both mirror Walls (drops their LOs).
     * Delegating through Wall.dispose keeps the ONE teardown authority. Idempotent.
     * FrqtlApp.removeObject / setup-teardown call this via the facade.
     */
    Tunnel.prototype.dispose = function () {
        if (this._disposed) { return; }
        this._disposed = true;
        if (this._unsubRedirect) { this._unsubRedirect(); this._unsubRedirect = null; }
        for (var i = 0; i < this.walls.length; i++) {
            if (this.walls[i] && typeof this.walls[i].dispose === 'function') { this.walls[i].dispose(); }
        }
    };

    // The canonical, complete list of legal `opts.mode` values — ONE authority for any
    // consumer (the schema enum, a control-panel select) that needs to enumerate them.
    Tunnel.MODES = MODES;

    /**
     * Tunnel.pointExitSpec(spec) → `{ geom, emitter, tunnel }` — the point-exit (laser build-up) scene's
     * emitter and corridor configs, for a sketch that declares the parts itself:
     *
     *     var spec = Tunnel.pointExitSpec({ canvasW: W, canvasH: H, tunnelLength: 240, … });
     *     exp.addObject('SphereEmitter', spec.emitter); exp.addObject('Tunnel', spec.tunnel);
     *
     * PURE DELEGATION to the ONE function, setupTunnelPointExit.sceneSpec — byte-identical to calling
     * it (tunnel-point-exit.test asserts the identity). The setup factory is machinery, not a part.
     */
    Tunnel.pointExitSpec = function pointExitSpec(spec) {
        return setupTunnelPointExit.sceneSpec(spec);
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults, palette, builder ──────────

    /**
     * Tunnel — TWO parallel MIRROR walls forming a corridor (a waveguide / light-pipe).
     * Constructor: Tunnel(universe, { left, top, length, bore, wallThickness, axis, color })
     * Group wrapper: the two inner Wall{bounce} sub-objects are
     * stamped with the ONE up-link `_owner` = <this>. Zero physics of its own (SU1) — it only
     * places two of the guarded mirror primitive a `bore` apart.
     */
    var TunnelDescriptor = {
        description: 'A corridor built from TWO parallel MIRROR walls (guarded bounce) ' +
            'a `bore` apart — a waveguide / light-pipe. A beam travelling down the bore ' +
            'reflects off the two facing mirrors and stays collimated (no random scatter, ' +
            'no leak through the walls). The group is the single author-surface entity; ' +
            'the two mirror Walls it composes carry its `_owner` up-link. Zero physics of its own.',
        // A tunnel has a genuine draggable/resizable extent (like a Wall). 2D drag only.
        ux: {
            resizable: true,
            draggable: { '2d': true },
            shellRender: 'run'
        },
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: false,
                live: true,
                writeOnly: true,
                description: 'WRITE-ONLY reposition ADAPTER: the corridor ENVELOPE (both mirrors and the exit ' +
                    'gate). A rect write — the 2D drag, the SPACE carry — moves the whole Tunnel through ' +
                    'Tunnel.setRect (a same-size write is a translation; a resize re-derives length/bore). ' +
                    'Its read getter derives the envelope from the members; captureProps SKIPS it via ' +
                    'writeOnly:true, so left/top/length/bore stay the captured position authority.'
            },
            {
                name: 'left',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                live: true,
                unit: 'px',
                description: 'Bore (aperture) left X position (physics pixels). For an X-axis tunnel this is the corridor mouth.'
            },
            {
                name: 'top',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                live: true,
                unit: 'px',
                description: 'Bore (aperture) top Y position (physics pixels).'
            },
            {
                name: 'length',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Corridor travel-axis extent (physics pixels) — X extent for an X-axis tunnel, Y for a Y-axis tunnel. The mirrors span this length.'
            },
            {
                name: 'bore',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Clear aperture — the gap between the two mirror inner faces (physics pixels). The beam passes through the bore; a wider bore lets more through with less collimation.'
            },
            {
                name: 'wallThickness',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Thickness of each mirror wall in physics pixels (default 10).'
            },
            {
                name: 'axis',
                type: 'enum',
                constraint: { values: { x: 'x', y: 'y' } },
                engineVisible: true,
                description: 'Corridor travel axis: x = horizontal (two wide mirrors above+below the bore; a +x beam reflects its vy); y = vertical (two tall mirrors left+right; a +y beam reflects its vx).'
            },
            {
                name: 'z',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Near-face Z of the corridor z-slab (physics pixels). Paired with `depth`: both mirror walls are built as 6-element-rect z-slabs, so the corridor is a real 3D tube whose z-faces also reflect. Inert without `depth` (a flat 2D corridor).'
            },
            {
                name: 'depth',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Z extent of the corridor z-slab (physics pixels). OMIT for a flat 2D corridor (the mirror walls stay 4-element rects, unconstrained in z). Supplying it makes each mirror a z-slab spanning z .. z+depth — the corridor a real tube in space.'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Render color [r, g, b] for both mirror walls (render-only). A live edit fans ' +
                    'out to both mirrors (the `_owner` fan-out in updateObjectProperty).'
            },
            {
                // D2 — the corridor's collision MODE. Enum values are
                // ferried from Tunnel.MODES (the object's own authority), never re-listed.
                name: 'mode',
                type: 'enum',
                // The vocabulary's OWNER is MODES (Tunnel.MODES) — this descriptor registers from
                // the same module, so it reads the owner instead of copying it.
                constraint: { values: Object.fromEntries(MODES.map(function (m) { return [m, m]; })) },
                engineVisible: true,
                // CONSTRUCTION-level: the directed mode needs its walls registered with the
                // engine's collect_collided flag, which has no live toggle in the substrate
                // (Wall.setWallBehavior refuses exactly this switch). Rebuild to change it.
                live: false,
                description: 'Collision mode. mirror (default) = the guarded-bounce waveguide: a beam ' +
                    'reflects off the two facing mirrors and stays collimated. directed = the tunnel ' +
                    'acts as a semi-circular EMITTER: each wall hit ejects the quantum back into the ' +
                    'bore and re-emits it in a uniformly random FORWARD direction within 180° of the ' +
                    'corridor axis. Construction-level (collection is a registration-time engine flag).'
            },
            {
                name: 'directedAngle',
                type: 'number',
                constraint: { min: 0, max: 360 },
                engineVisible: true,
                live: false,
                unit: 'deg',
                visibleWhen: { field: 'mode', equals: 'directed' },
                description: 'Centre of the forward re-emission fan, in degrees. Omitted = DERIVED from ' +
                    '`axis` (0 = +x for an x corridor, 90 = +y for a y one), i.e. the corridor\'s own ' +
                    'travel direction. Set 180/270 for a corridor fed from the far end. The tunnel BODY ' +
                    'stays axis-aligned; this aims the re-emission only.'
            },
            {
                name: 'redirectSpread',
                type: 'number',
                constraint: { min: 0, max: 180 },
                engineVisible: true,
                live: false,
                unit: 'deg',
                visibleWhen: { field: 'mode', equals: 'directed' },
                description: 'Half-width of the forward fan, in degrees (default 90 = a full 180° forward ' +
                    'fan). The exit azimuth is drawn UNIFORMLY in directedAngle ± this. 0 collapses to a ' +
                    'perfectly collimated re-emission along directedAngle.'
            },
            {
                // D3 — the point-exit gate.
                name: 'exitCollapse',
                type: 'boolean',
                engineVisible: true,
                // Construction-level: the gate is a THIRD LargeObject, and its collect flag is
                // a registration-time engine flag. Rebuild to add or remove it.
                live: false,
                description: 'Point-exit gate. Adds a third LargeObject spanning the last 2 columns of ' +
                    'the bore at the output mouth; every crossing quantum is pinned to the bore mid-line, ' +
                    'so the mouth emits as a one-pixel POINT SOURCE (the self-interference geometry). ' +
                    'Composes with either mode. Requires withInterQuantumCollisions:false — FAIL-LOUD ' +
                    'otherwise, because with collisions ON the collapse pixel serializes and kills quanta.'
            },
            {
                // D4 — recentering becomes optional so the two exit effects
                // can be driven independently.
                name: 'exitRecenter',
                type: 'boolean',
                // SUGAR, not an engine-ABI field: the write goes through the facade's own
                // setter (Tunnel.LIVE_PROPS -> applyProp), which recompiles the exit gate's
                // op-program and pushes it — it never reaches setFrameProperty or a LargeObject
                // bool ABI. Declared engineVisible:true it was DEMOTED to a read-only Inspector
                // row by the documented safety rule for engine-visible booleans (whose bind-only
                // write path would send a bare 0/1 where serde wants a JSON bool), so a user
                // could see the flag and not flip it. `Wall.collisionBehavior` is the precedent:
                // also op-program-compiled, also live, correctly engineVisible:false.
                engineVisible: false,
                live: true,
                visibleWhen: { field: 'exitCollapse', truthy: true },
                description: 'Pin every quantum crossing the exit gate to the bore mid-line — the ' +
                    'point-source collapse. DEFAULT ON. Turning it OFF leaves the exit spatially ' +
                    'unchanged, which is what separates "does the point source matter?" from "does ' +
                    'coherence matter?" (exitPhaseReset) — while recentering was mandatory the two ' +
                    'were confounded. With BOTH off the gate carries no program at all and stays ' +
                    'registered only as an inert collector. LIVE (next collision).'
            },
            {
                name: 'exitPhaseReset',
                type: 'boolean',
                // SUGAR, not an engine-ABI field: the write goes through the facade's own
                // setter (Tunnel.LIVE_PROPS -> applyProp), which recompiles the exit gate's
                // op-program and pushes it — it never reaches setFrameProperty or a LargeObject
                // bool ABI. Declared engineVisible:true it was DEMOTED to a read-only Inspector
                // row by the documented safety rule for engine-visible booleans (whose bind-only
                // write path would send a bare 0/1 where serde wants a JSON bool), so a user
                // could see the flag and not flip it. `Wall.collisionBehavior` is the precedent:
                // also op-program-compiled, also live, correctly engineVisible:false.
                engineVisible: false,
                // LIVE: flipping it recompiles the gate's op-program and pushes it on the same
                // live path recompileActions uses — so the banding can be toggled mid-run.
                live: true,
                visibleWhen: { field: 'exitCollapse', truthy: true },
                description: 'Re-phase-lock the ensemble at the exit gate (appends `set local_time = 0` ' +
                    'to the gate program). Default OFF — a deliberate coherence choice, not a ratified ' +
                    'behavior. Whether banding needs it is λ-dependent: at long effective λ the exit is ' +
                    'already ~90% phase-aligned and bands survive with it OFF; at short λ the exit is ' +
                    'phase-flat and the fan reads smooth OFF, banded ON. PHASE ONLY — never the ' +
                    'decoherence bundle (whose second op redraws charge). LIVE (next collision).'
            },
            {
                name: 'polarSpread',
                type: 'number',
                constraint: { min: 0, max: 90 },
                engineVisible: true,
                live: false,
                unit: 'deg',
                visibleWhen: { field: 'mode', equals: 'directed' },
                description: 'Half-width of the OUT-OF-PLANE (polar) fan, in degrees. 0 (default, even on ' +
                    'a 3D corridor) keeps the re-emission in the XY plane — the angle-uniform case. A ' +
                    'non-zero value draws the polar angle uniformly in phi, which over-weights the pole: ' +
                    'it is polar-uniform, NOT solid-angle-uniform on the hemisphere.'
            }
        ]
    };

    // TWO parallel mirror Walls forming a corridor. A palette drop centers the bore
    // on the click (F1 drop idiom); a recipe supplies explicit left/top. The Tunnel
    // stamps its own members; create() declares the Tunnel. Zero physics (SU1) — two
    // Wall{bounce} mirrors + a bore.
    registerKind(Tunnel, {
        from: import.meta.url,
        descriptor: TunnelDescriptor,
        defaults: {
        length: 80,
        bore: 24,
        wallThickness: 10,
        axis: 'x',
        color: [90, 120, 200]
        },
        palette: { displayName: 'Mirror Tunnel', category: 'composite', iconHint: 'tunnel', rank: 2 },
        build: function (props, ctx, Class) {
            var TunnelCls = Class;   // the class that registered (a composed fork's own class)
            var opts = {};
            for (var k in props) {
                if (!Object.prototype.hasOwnProperty.call(props, k)) { continue; }
                opts[k] = props[k];
            }
            var tlen  = (opts.length != null) ? opts.length : 80;
            var tbore = (opts.bore   != null) ? opts.bore   : 24;
            // Derive the bore origin from the drop point when the recipe declared no placement.
            if (opts.left == null) { opts.left = Math.round(ctx.x - tlen / 2); }
            if (opts.top  == null) { opts.top  = Math.round(ctx.y - tbore / 2); }
            opts.length = tlen; opts.bore = tbore;
            var tunnel = new TunnelCls(ctx.runner.universe, opts);
            tunnel._schemaKind = Class.name;
            // mode:'directed' — subscribe the host redirect to the runner's per-tick fan-out.
            // Self-gating + idempotent, so this is called unconditionally (a mirror tunnel
            // no-ops). Wiring it HERE, off the DECLARED `mode` field, is what makes the
            // directed behavior part of the declared object: every build of the facade
            // re-subscribes itself.
            if (typeof tunnel.attachToRunner === 'function') { tunnel.attachToRunner(ctx.runner); }
            return tunnel;
        }
    });

    // ── Export ───────────────────────────────────────────────────────────
    export { Tunnel };

