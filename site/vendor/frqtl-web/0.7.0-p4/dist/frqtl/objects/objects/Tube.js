/* Copyright 2023-2026 by Essam Abadir */

/**
 * Tube — Engine-agnostic 3D containing tube (Dim-scaled walls; capped 0, 1, or 2 ends).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * A tube and a wire are the same object at different FRQTL Dims: the SAME
 * primitive is a wire, a barrel, a car
 * tunnel, or a wormhole — only the parameters and end-capping differ. Tube builds
 * a rectangular Y/Z perimeter (top/bottom + near/far walls) running the length of
 * its X (long) axis, with each X-end OPTIONALLY capped (a barrel = one capped end,
 * one open; a wire/tunnel = both open; a sealed chamber = both capped).
 *
 * FRQTL-MAINT (2026-07-01, #61) — ALL SIX FACES, ONE PATH: every wall (TOP, BOTTOM,
 * LEFT/RIGHT end-caps, and — when `zContain` — NEAR/FAR) is now a standard per-face
 * `LargeObject` built with an explicit 6-element rect `[left, top, z, w, h, d]` (the
 * landed `rect_to_z_capable_rectangle` wire contract, `egpt_wasm/src/lib.rs`, commit
 * `1c349ab`) sized to the tube's TRUE z cross-section. `LargeObject`'s own constructor
 * auto-compiles `collisionType`+`reposition` into an op-program for every face
 * uniformly (`actionCompiler.compileActions`) — there is no manual op-program
 * construction anywhere in this file. This RETIRES two prior workarounds (both
 * deleted, not kept alongside — see the "RETIRED" comment blocks in
 * `actionCompiler.js`): the literal-bounds `buildZContainmentOps` combined-program
 * (one fake full-footprint LO faking a NEAR/FAR test) and the manual x/y-only
 * `buildXYIntersectsTrigger` the thin end-caps needed (their z-slab used to be
 * pinned to their own — deliberately thin — x-width). Both were needed only because
 * every LO's z-slab used to be hardcoded to `[0, own-x-width]`; now that the wire
 * contract carries real z/d, `self.near`/`self.far` (read by the `'near'`/`'far'`
 * cases added to `actionCompiler.js`'s `buildEjectOps`/`buildVelocityFlipOp`) are
 * meaningful for the first time, so NEAR/FAR (and the end-caps) work exactly like
 * TOP/BOTTOM/LEFT/RIGHT always did.
 *
 * @param {Object} universe - The engine universe instance (JS or WASM), already `init()`'d.
 * @param {Object} options - Configuration.
 * @param {number} options.left   - Interior min-X corner (pixels) — the tube's X origin
 *   (breech end when used as a barrel).
 * @param {number} options.top    - Interior min-Y corner (pixels).
 * @param {number} [options.z=0]  - Interior min-Z corner (pixels). Default 0 — the SAME
 *   non-negative corner convention as `left`/`top` (an arbitrary reference origin; any
 *   value — including negative — is valid now that z/d ride an explicit wire field
 *   instead of a hardcoded 0.0).
 * @param {number} options.interiorWidth  - Interior X extent (pixels) — the tube's
 *   LENGTH along its long axis (breech to muzzle for a barrel).
 * @param {number} options.interiorHeight - Interior Y extent (pixels) — the bore's
 *   vertical cross-section.
 * @param {number} options.interiorDepth  - Interior Z extent (pixels) — the bore's
 *   lateral cross-section.
 * @param {number} [options.wallThickness=10] - Exterior wall thickness (pixels). Every
 *   face extends outward from the interior by this amount on its own thin axis, AND
 *   into its neighboring faces' corners on the other two axes (matching the
 *   Box.js/OvenBox.js X/Y convention, now applied uniformly to Z too) so the six
 *   faces close every edge of the box with no corner gap.
 * @param {boolean} [options.capNegX=false] - Build a wall capping the −X end (the
 *   "breech" when Tube is used as a barrel). Default false = open (a wire/tunnel).
 * @param {boolean} [options.capPosX=false] - Build a wall capping the +X end (the
 *   "muzzle" when Tube is used as a barrel). Default false = open. **A barrel is
 *   `capNegX:true, capPosX:false`** — the muzzle is a bare ABSENCE of a wall, not a
 *   sensor (Q-L1-2).
 * @param {string} [options.collisionType='BOUNCE'] - CollisionTypes value applied to
 *   every built face (a `CollisionTypes` constant) — TOP/BOTTOM/end-caps/NEAR/FAR alike.
 * @param {Array<string>} [options.actions=[]] - Additional CollisionActions applied to
 *   every wall (stacks with collisionType; passed through to LargeObject).
 * @param {Array|null} [options.observedDimensions=null] - Dimension layers the tube's
 *   walls observe. null = all dimensions (passed through to every LargeObject —
 *   Q4 "passes through the LO's params").
 * @param {Array<number>} [options.color=[90,90,96]] - Wall RGB tint.
 * @param {boolean} [options.zContain=true] - Build the NEAR/FAR z-perimeter walls.
 *   Set false to leave the z-axis open (e.g. a flat 2D-in-3D scene) — TOP/BOTTOM/
 *   end-caps then fall back to the legacy 4-element rect (z=0, depth=own-x-width;
 *   unaffected by this option, byte-identical to a z-open scene).
 * @param {number} [options.wallOpacity=0.3] - Render opacity 0 (fully transparent) to
 *   1 (fully opaque), applied to every wall (STANDARDIZED sugar-level knob,
 *   so contained quanta stay visible from outside views). Reuses the
 *   existing LO `alpha` schema field (0-255; see the Render shape block below) —
 *   NOT a new render hint. The white edge outline stays crisp at any opacity.
 * @param {boolean} [options.collectCollided=false] - DIRECTED TUNNEL BUILD (2026-07-13):
 *   passed through as `LargeObject`'s own 10th
 *   ctor arg (`collectCollided`) for EVERY wall built by this Tube. When true, the
 *   engine accumulates each wall's collided frames into `tickData.objects[handle]
 *   .frames` every tick (zero physics change — a collection buffer, not a behavior).
 *   Default false — byte-identical for every existing Tube caller, none of which
 *   read per-wall collided
 *   frames. Needed by `DirectedTunnel`'s host-trig redirect (report §2 path (c)):
 *   the host tick-loop reads `tickData.objects[topWallHandle|bottomWallHandle]
 *   .frames` between ticks and writes back `vx`/`vy` via `setFrameProperty` — this
 *   flag is what makes those frames appear in the marshalled tick output at all.
 * @param {Object|null} [options.emitter=null] - DIRECTED TUNNEL BUILD (2026-07-13):
 *   promotes the hand-rolled breech-emitter
 *   pattern into Tube's own constructor as an opt-in, auto-wired
 *   `QuantumEmitter` positioned just inside the `capNegX` breech wall, centred on the
 *   bore's Y (and, when `zContain`, Z) centreline. Requires `options.capNegX:true`
 *   (throws otherwise — FAIL-LOUD, not a silent no-op: an emitter with no breech to
 *   emit from is a caller error). Exposed as `this.emitter`. Fields (all optional,
 *   matching `QuantumEmitter`'s own ctor defaults exactly where omitted):
 *     - `vx`,`vy` (default: `speed`,`0` — a directed +X beam into the bore, mirroring
 *       a propellant emitter; `speed` below).
 *     - `speed` (default 1) - convenience: when `vx`/`vy` are BOTH omitted, the
 *       emitter fires at `(speed, 0)` (straight down the bore's local +X).
 *     - `burstSize` (default 1), `charge` (default null = random, back-compat
 *       0/1/'POSITIVE'/'NEGATIVE' — matches `QuantumEmitter`'s own vocabulary),
 *       `randomDirection` (default false - a DIRECTED beam;
 *       true = an isotropic point-source INSIDE the bore, for a diffuse fill),
 *       `quantumLimit` (default Infinity), `delay` (default 0), `wrap` (default false).
 *     - `wavelength` (default null = engine default mass) - per-
 *       emitted-particle wavelength override (`QuantumEmitter`'s own new `opts.
 *       wavelength`, Engine Invariant #6). LIVE via `this.emitter.setWavelength()`.
 *       When `zContain` is armed, this Tube ALSO auto-centres the emitter's z
 *       (`opts.zMin`) on the bore's z-centreline and, when `randomDirection` is
 *       also true, makes the random-direction draw 3D-isotropic (`opts.
 *       zIsotropy`) — a DIRECTED emitter (`randomDirection:false`, the default)
 *       stays `vz=0` deliberately (collimation unaffected).
 *     - `sourceHeight` (default: half the bore height, the propellant-aperture
 *       convention) - the emission aperture's Y-extent, centred
 *       on the bore.
 *   Default `null` - byte-identical for every existing Tube caller (none pass
 *   `options.emitter`).
 * @param {boolean} [options.sinkOpenEnds=false] - Build an ABSORB sink LO just beyond
 *   EACH open (uncapped) X-end — the reusable home for "the muzzle absorber-sink"
 *   (L2.2): any open-ended contained-flow scene (a barrel firing gas
 *   out the muzzle, a wire/tunnel with through-traffic on both ends) wants a bounded
 *   population, not unbounded growth as frames exit and are never removed. Named
 *   generically (not `muzzleSink`) because Tube itself is generic (wire ≡ barrel ≡
 *   tunnel ≡ wormhole) — a barrel (`capNegX:true, capPosX:false`) gets exactly one
 *   sink, at the open +X (muzzle) end; a wire (both ends open) gets two. Reuses the
 *   EXISTING KILL/ABSORB precedent (`DetectorWall.js`: `CollisionTypes.NONE` +
 *   `[COUNT, ABSORB]` actions, compiled by `actionCompiler.js`'s standard path to
 *   `set frame.is_alive = 0` — NOT `mass=0`, per the L1 note) — no new
 *   op-program, no engine change. Each sink is invisible (`visible:false`) by
 *   default (a floating absorber box outside the bore reads as a rendering
 *   artifact, not a real object) but IS included in `this.largeObjects` (so the
 *   Layers panel / IDE tooling can still find and toggle it) and separately on
 *   `this.sinks` for direct introspection (e.g. reading each sink's `.count`).
 *

 * @property {Array<LargeObject>} walls - ALL built walls (TOP, BOTTOM, LEFT/RIGHT for
 *   any capped end, NEAR/FAR when `zContain`) — the caller's visible/render list.
 * @property {Array<LargeObject>} sinks - The built open-end ABSORB sinks (when
 *   `sinkOpenEnds`), one per uncapped X-end. Empty array when `sinkOpenEnds` is false.
 * @property {Object} innerRect - `{left, top, z, w, h, d}` — the interior box, for
 *   callers that need to place contents (a bullet, an emitter, preplaced quanta)
 *   inside the tube.
 *
 * Custom tick functions STACK on the tube's own (Q4): Tube registers no tick
 * functions of its own — it only registers LargeObjects at construction time — so a
 * caller's `universe.experimentTickFunctions.push(...)` composes freely alongside it.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Tube adds ZERO new physics (canonical-bench SU1: sugar only WIRES the engine). Every
 * face — X/Y perimeter AND (when `zContain`) the Z perimeter — is the existing
 * OvenBox/Box eject+bounce op-program pattern (proven bit-identical to native
 * WALL/BOUNCE, EP21-EP28) — `LargeObject`'s own constructor compiles
 * `collisionType`+`reposition` to an op-program automatically for every face, including
 * NEAR/FAR (see `lib/frqtl/objects/objects/actionCompiler.js` `compileActions` +
 * its `'near'`/`'far'` reposition cases).
 *
 * OBSERVED (this workstream, pkg-node WASM, seed 42): a Dim-6 quantum fired at each of
 * the tube's 6 possible faces (top/bottom/near/far/breech/muzzle, `capNegX:true
 * capPosX:false`) bounces and stays contained on the 5 closed faces over 600+ ticks; a
 * quantum fired at the open muzzle exits without any wall interaction — re-verified
 * end-to-end against the landed z/depth wire contract (empirical re-proof, not assumed;
 * see the delivery report for the exact run).
 */

import { LargeObject } from '../../parts/LargeObject.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';
import { CollisionActions } from '../../parts/CollisionActions.js';
import { QuantumEmitter } from './QuantumEmitter.js';

    // ── Imports ─────────────────────────────────────────────────────────

    // ── Tube ────────────────────────────────────────────────────────────

    /**
     * @param {Object} universe - Already-init'd universe (JS or WASM).
     * @param {Object} options  - See module-level JSDoc above.
     */
    function Tube(universe, options) {
        options = options || {};

        this.universe = universe;
        this._schemaKind = 'Tube';

        var interiorWidth  = options.interiorWidth;
        var interiorHeight = options.interiorHeight;
        var interiorDepth  = options.interiorDepth;
        if (!(interiorWidth > 0) || !(interiorHeight > 0) || !(interiorDepth > 0)) {
            throw new Error(
                '[Tube] interiorWidth/interiorHeight/interiorDepth must all be positive numbers.'
            );
        }

        var wt = options.wallThickness !== undefined ? options.wallThickness : 10;

        var innerLeft = options.left;
        var innerTop  = options.top;
        // z defaults to 0 — the SAME non-negative corner convention as left/top (an
        // arbitrary reference origin; FRQTL-MAINT 2026-07-01: any value is now valid,
        // since z/d ride the explicit 6-element wire field rather than a hardcoded 0.0 —
        // see the module docstring).
        var innerZ    = options.z !== undefined ? options.z : 0;
        if (innerLeft === undefined || innerTop === undefined) {
            throw new Error('[Tube] options.left and options.top are required.');
        }

        var capNegX = !!options.capNegX;
        var capPosX = !!options.capPosX;

        var ct       = options.collisionType || CollisionTypes.BOUNCE;
        var actions  = options.actions || [];
        var color    = options.color || [90, 90, 96];
        var observedDimensions = options.observedDimensions !== undefined ? options.observedDimensions : null;
        var zContain = options.zContain !== undefined ? !!options.zContain : true;
        // wallOpacity: the STANDARDIZED render knob — see the Render
        // shape block below for the mechanism (reuses the existing LO `alpha` schema
        // field, lib/frqtl/objects/schema/index.js:166 — NOT a new hint).
        var wallOpacity  = options.wallOpacity  !== undefined ? options.wallOpacity  : 0.3;
        // sinkOpenEnds: the muzzle-absorber-sink home (L2.2) — see the
        // module docstring's param note. Default false — byte-identical to every
        // existing Tube consumer that doesn't
        // opt in.
        var sinkOpenEnds = options.sinkOpenEnds !== undefined ? !!options.sinkOpenEnds : false;
        // collectCollided: DIRECTED TUNNEL BUILD — see module docstring param note.
        // Default false — byte-identical for every existing caller.
        var collectCollided = options.collectCollided !== undefined ? !!options.collectCollided : false;

        this.innerRect = {
            left: innerLeft, top: innerTop, z: innerZ,
            w: interiorWidth, h: interiorHeight, d: interiorDepth,
        };
        this.wallThickness = wt;

        // ── ALL SIX FACES, ONE PATH (FRQTL-MAINT 2026-07-01, #61) ────────────────
        // Every wall gets an explicit 6-element rect [left, top, z, w, h, d] (when
        // zContain) sized to the tube's TRUE z cross-section — z spans
        // [innerZ - wt, innerZ + interiorDepth + wt] (the bore plus a wt margin at each
        // end, so all six faces close every corner, the same way the X-cap extension
        // (extLeft/extRight) already closed the TOP/BOTTOM corners against the caps).
        // LargeObject's own constructor auto-compiles collisionType+reposition into an
        // op-program (actionCompiler.compileActions) — no manual program-building here,
        // for ANY face.
        var extLeft  = capNegX ? wt : 0;
        var extRight = capPosX ? wt : 0;
        var zLo = innerZ - wt;               // this wall's own near (−z) corner
        var zD  = interiorDepth + 2 * wt;     // z span: the bore + a wt margin each end

        // rect(left, top, w, h) → 6-element [left,top,z,w,h,d] when zContain (real,
        // always-correct z-slab for this face); else the legacy 4-element form
        // (back-compat: z=0/d=w, unaffected — matches a z-open scene exactly as before).
        function faceRect(left, top, w, h) {
            return zContain ? [left, top, zLo, w, h, zD] : [left, top, w, h];
        }

        this.walls = [];

        // TOP wall (Y-min side) — pushes intersecting frames DOWN (+y) into the interior.
        this.walls.push(new LargeObject(
            universe,
            faceRect(innerLeft - extLeft, innerTop - wt, interiorWidth + extLeft + extRight, wt),
            ct, actions, 'TOP', 'bottom', observedDimensions, 1, color, collectCollided
        ));

        // BOTTOM wall (Y-max side) — pushes intersecting frames UP (-y) into the interior.
        this.walls.push(new LargeObject(
            universe,
            faceRect(innerLeft - extLeft, innerTop + interiorHeight, interiorWidth + extLeft + extRight, wt),
            ct, actions, 'BOTTOM', 'top', observedDimensions, 1, color, collectCollided
        ));

        // −X cap (breech, when requested) — pushes intersecting frames RIGHT (+x) inward.
        // FRQTL-MAINT (2026-07-01): now a STANDARD per-face LO (was a manual
        // collision_type:NONE + x/y-only-trigger program — see the RETIRED note in
        // actionCompiler.js) — the explicit z/d above gives this thin-in-x wall a
        // correct z-slab, so the native 3D Fn('intersects') trigger (LargeObject's
        // normal auto-compile) now correctly catches a z-drifted frame too.
        if (capNegX) {
            this.walls.push(new LargeObject(
                universe,
                faceRect(innerLeft - wt, innerTop - wt, wt, interiorHeight + 2 * wt),
                ct, actions, 'LEFT', 'right', observedDimensions, 1, color, collectCollided
            ));
        }

        // +X cap (muzzle, when requested) — pushes intersecting frames LEFT (-x) inward.
        // OMITTED by default (capPosX:false) — the open muzzle is a bare absence of a
        // wall (Q-L1-2), not a sensor. Same standard construction as −X.
        if (capPosX) {
            this.walls.push(new LargeObject(
                universe,
                faceRect(innerLeft + interiorWidth, innerTop - wt, wt, interiorHeight + 2 * wt),
                ct, actions, 'RIGHT', 'left', observedDimensions, 1, color, collectCollided
            ));
        }

        // ── NEAR/FAR (Z faces) — FRQTL-MAINT (2026-07-01, #61): REAL per-face walls,
        // unblocked by the landed z/depth wire contract. Previously structurally
        // impossible (every LO's z-slab was pinned to the origin) and worked around with
        // a manual literal-bounds combined program on one full-footprint LO
        // (buildZContainmentOps, now RETIRED — see actionCompiler.js). NEAR sits at the
        // bore's −z face (thin in z, full X/Y span, extended by wt into the X-cap and
        // Y-perimeter corners exactly like TOP/BOTTOM/LEFT/RIGHT extend into EACH OTHER's
        // corners); FAR mirrors it at the +z face. Both use the SAME standard
        // auto-compile path (collisionType+reposition) as every other face — the
        // 'near'/'far' reposition cases added to actionCompiler.js's buildEjectOps/
        // buildVelocityFlipOp make self.near/self.far (now real, non-degenerate values)
        // drive the eject/flip formulas exactly like self.left/self.right do for
        // LEFT/RIGHT.
        if (zContain) {
            this.walls.push(new LargeObject(
                universe,
                [innerLeft - extLeft, innerTop - wt, zLo,
                 interiorWidth + extLeft + extRight, interiorHeight + 2 * wt, wt],
                ct, actions, 'NEAR', 'far', observedDimensions, 1, color, collectCollided
            ));
            this.walls.push(new LargeObject(
                universe,
                [innerLeft - extLeft, innerTop - wt, innerZ + interiorDepth,
                 interiorWidth + extLeft + extRight, interiorHeight + 2 * wt, wt],
                ct, actions, 'FAR', 'near', observedDimensions, 1, color, collectCollided
            ));
        }

        // ── Open-end ABSORB sinks (L2.2 — the muzzle-absorber-sink) ──────────────────
        // ONE sink per uncapped X-end (never on a capped end — a closed face already
        // contains everything; a sink there would be redundant and would fight the
        // wall's own bounce). REUSES the existing KILL/ABSORB precedent verbatim
        // (DetectorWall.js: CollisionTypes.NONE + [COUNT, ABSORB] actions, compiled by
        // actionCompiler.js's standard compileActions path to `set frame.is_alive = 0`
        // — NOT mass=0, per the L1 note) — zero new op-program, zero engine
        // change. Positioned a small margin OUTSIDE the bore's open face (never
        // overlapping the interior, so normal bore physics near the opening is
        // unaffected) with the SAME z-slab (`faceRect`) every other face uses, so it
        // catches an exiting frame regardless of its Y/Z position — mirrors the NEAR/
        // FAR walls' "full-cross-section, thin-on-its-own-axis" shape.
        this.sinks = [];
        if (sinkOpenEnds) {
            var sinkDepth  = wt; // reuse wallThickness as the sink's own thin-axis extent
            var sinkMargin = 2;  // small gap so the sink never touches/overlaps the bore

            if (!capNegX) {
                // Sink just before the open −X (breech) end.
                this.sinks.push(new LargeObject(
                    universe,
                    faceRect(innerLeft - sinkMargin - sinkDepth, innerTop - wt, sinkDepth, interiorHeight + 2 * wt),
                    CollisionTypes.NONE, [CollisionActions.COUNT, CollisionActions.ABSORB],
                    'NEG_X_SINK', 'closest', observedDimensions, 1, color
                ));
            }
            if (!capPosX) {
                // Sink just beyond the open +X (muzzle) end.
                this.sinks.push(new LargeObject(
                    universe,
                    faceRect(innerLeft + interiorWidth + sinkMargin, innerTop - wt, sinkDepth, interiorHeight + 2 * wt),
                    CollisionTypes.NONE, [CollisionActions.COUNT, CollisionActions.ABSORB],
                    'POS_X_SINK', 'closest', observedDimensions, 1, color
                ));
            }
            // Invisible by default — a floating absorber box outside the bore reads as
            // a render artifact, not a real object. Physics (registerLargeObject) is
            // unaffected by visibility (a renderer-only property) — the sink still
            // absorbs whether or not it is drawn.
            for (var _si = 0; _si < this.sinks.length; _si++) {
                this.sinks[_si].visible = false;
            }
        }

        // ── Breech emitter (DIRECTED TUNNEL BUILD, 2026-07-13, opt-in) ────────────
        // Promotes the hand-rolled breech-emitter pattern into Tube's own
        // constructor — see the module docstring's
        // `options.emitter` param note for the full field list. FAIL-LOUD (not a
        // silent no-op): an emitter needs a closed breech to emit FROM, so
        // `options.emitter` without `capNegX:true` throws rather than building a
        // directed emitter that immediately fires out an open end.
        this.emitter = null;
        if (options.emitter) {
            if (!capNegX) {
                throw new Error(
                    '[Tube] options.emitter requires options.capNegX:true (the emitter is ' +
                    'positioned just inside the breech wall — there is no breech to emit from otherwise).'
                );
            }
            var espec = options.emitter;
            var espeed = espec.speed !== undefined ? espec.speed : 1;
            var evx = espec.vx !== undefined ? espec.vx : espeed;
            var evy = espec.vy !== undefined ? espec.vy : 0;
            var eburst = espec.burstSize !== undefined ? espec.burstSize : 1;
            var echarge = espec.charge !== undefined ? espec.charge : null;
            var erandomDir = espec.randomDirection !== undefined ? !!espec.randomDirection : false;
            var equantumLimit = espec.quantumLimit !== undefined ? espec.quantumLimit : Infinity;
            var edelay = espec.delay !== undefined ? espec.delay : 0;
            var ewrap = espec.wrap !== undefined ? !!espec.wrap : false;
            // Aperture: centred on the bore's Y centreline, positioned just inside the
            // breech wall (`breechEmitX = breechX + 2`). Height default is the
            // `propellantSourceH` convention (half the bore height).
            var esourceH = espec.sourceHeight !== undefined ? espec.sourceHeight : Math.max(1, Math.floor(interiorHeight / 2));
            var eEmitX = innerLeft + 2;
            var eCenterY = innerTop + interiorHeight / 2;
            // The emitter source mode consumes the SAME normalized SOURCE_SPEC bag:
            // wavelength/z-centring/
            // z-isotropy — derived from THIS Tube's own `zContain`/`innerZ`/
            // `interiorDepth` (already in scope), never a caller burden. zContain
            // false (every pre-existing Tube.options.emitter caller) -> eZMin stays
            // null, eZIsotropy stays false -> byte-identical (QuantumEmitter's own
            // opts defaults).
            var ewavelength = espec.wavelength !== undefined ? espec.wavelength : null;
            var eZMin = zContain ? (innerZ + interiorDepth / 2) : null; // bore's z-centreline
            var eZDepth = zContain ? 0 : null;                          // pinned (single value), not a spread
            var eZIsotropy = zContain;                                  // only consumed when erandomDir is also true
            this.emitter = new QuantumEmitter(
                universe,
                [[eEmitX, eCenterY - Math.floor(esourceH / 2), 1, esourceH]],
                evx, evy, eburst, echarge,
                true,          // auto_fire
                erandomDir,
                equantumLimit,
                edelay,
                ewrap,
                { wavelength: ewavelength, zMin: eZMin, zDepth: eZDepth, zIsotropy: eZIsotropy }
            );
        }

        // ── Render shape (renderer-only hints; physics is unaffected) ────────────
        // FRQTL-MAINT: shape:'box' + depth wraps each wall LO
        // with a real 3D BoxGeometry (Bullet.js:112-116 precedent) instead of the
        // flat-plane default (_buildLoMesh, three-provider.js) — a zero-thickness plane
        // reads as a thin 2D outline at oblique orbit angles, which is exactly the
        // "walls draw as thin 2D outlines" finding. depth is read straight off the
        // wall's OWN rect.d (set above by the 6-element rect) so the box's z-extent
        // matches its true physical z-slab exactly; when zContain is false (legacy
        // 4-element rect, no rect.d), depth stays undefined and _buildLoMesh's existing
        // `lo.depth || lo.rect.w` fallback applies unchanged.
        //
        // wallOpacity (translucent walls so contained quanta stay
        // visible from outside): REUSES the existing `alpha` LO field — already a
        // first-class, schema-declared render-only property (`lib/frqtl/objects/schema/
        // index.js` name:'alpha', 0-255, widgetHint:'slider') that `_buildLoMesh`'s
        // box-shape branch already reads for its material's `transparent`/`opacity`
        // (`three-provider.js` ~line 520/557) — NOT a new hint, NOT a hardcoded material.
        // `alpha` is 0-255 (matches `color`'s convention); `wallOpacity` is the
        // standardized 0-1 sugar-level knob every caller passes, converted here once.
        // The box mesh's white edge outline (`EdgesGeometry`+`LineBasicMaterial`,
        // three-provider.js) is unconditional at its own fixed opacity regardless of the
        // fill's alpha, so the duct silhouette stays crisp at any wallOpacity.
        var wallAlpha = Math.round(255 * Math.max(0, Math.min(1, wallOpacity)));
        for (var _wi = 0; _wi < this.walls.length; _wi++) {
            this.walls[_wi].shape = 'box';
            if (this.walls[_wi].rect.d !== undefined) {
                this.walls[_wi].depth = this.walls[_wi].rect.d;
            }
            this.walls[_wi].alpha = wallAlpha;
        }

        // ── THE ONE UP-LINK on every wall and sink this Tube composed ─────────────
        for (var _gi = 0; _gi < this.walls.length; _gi++) {
            this.walls[_gi]._owner = this;   // THE ONE UP-LINK
        }
        for (var _si2 = 0; _si2 < this.sinks.length; _si2++) {
            this.sinks[_si2]._owner = this;   // THE ONE UP-LINK
        }

        // ── Return-shape convenience ─────────────────────────────────────────────
        // Sinks ARE included (so Layers-panel/IDE tooling can find + toggle them) —
        // each is already visible:false, so the renderer draws nothing for it.
        this.largeObjects = this.walls.concat(this.sinks);
    }

    // ── Export ───────────────────────────────────────────────────────────

    export { Tube };

