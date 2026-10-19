/* Copyright 2023-2026 by Essam Abadir */

/**
 * DirectedTunnel — a directed-behavior convenience over Tube (T1, 2026-07-13,
 * "EXTEND Tube, do not fork a sibling").
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * DirectedTunnel does NOT re-derive wall construction — it CONSTRUCTS a `Tube`
 * (the ONE six-face-construction authority, #61 "ALL SIX FACES, ONE PATH") and
 * then, post-construction, applies:
 *   1. An opt-in `options.behavior` routed through `slitLinerScatter.js`'s
 *      composable authority (the SAME one-authority, no-fork rule the DSE liner
 *      already uses — report §4.4.4) onto the TOP/BOTTOM walls (the long,
 *      quantum-facing bounce surfaces a beam/scatter population actually
 *      interacts with repeatedly — report §3's own measured tunnel geometry).
 *   2. When `behavior:'option1'`, registers the host-trig redirect
 *      (`directedRedirectProgram.js`) and exposes `this.applyRedirect(tickData)`
 *      for the CALLER to invoke once per tick (mirrors `DetectorWall.prototype.
 *      getCollisionHistogram(tickData)` — this is NOT a `universe.
 *      experimentTickFunctions` push; see `directedRedirectProgram.js`'s own
 *      docstring for why Phase-A timing is wrong for this mechanism).
 *
 * ── `options.behavior` — the two report-defined modes + the full composable set ──
 *
 *   - `'option2'` (DEFAULT) — pure reflection, NATIVE `BOUNCE` (report §3's own
 *     mechanism; `REFLECT_*` is a no-op on the canonical engine — never used).
 *     This is Tube's OWN pre-existing default (`collisionType:'BOUNCE'`) —
 *     `behavior:'option2'` changes NOTHING; it exists so callers can name the
 *     report's mode explicitly rather than relying on Tube's implicit default.
 *   - `'option1'` — host-trig directed/isotropic redirect (report §2, path (c)):
 *     the TOP/BOTTOM walls are rebuilt with `collisionType:NONE, actions:[BLOCK]`
 *     (pure in-engine eject, ZERO velocity touch — `slitLinerScatter.js`'s
 *     `'ejectY'` behavior, chosen SPECIFICALLY because it has no velocity ops at
 *     all, so the host redirect below is the ONLY velocity write) via
 *     `SlitLinerScatter.applyLinerScatter`, and a `directedRedirectProgram.js`
 *     applier is built for `[topWall.handle, bottomWall.handle]` at `orientation`
 *     (see below) with `options.redirectSpread` (degrees, default 0 = fully
 *     directed) as the isotropic-spread sub-option. Requires `options.
 *     collectCollided` semantics — DirectedTunnel ALWAYS passes
 *     `collectCollided:true` to the underlying Tube when `behavior==='option1'`
 *     (needed for `tickData.objects[handle].frames` to exist at all; a no-op
 *     otherwise, so this is safe to always set for this one mode).
 *   - Any other string in `SlitLinerScatter.BEHAVIORS` (`'randomXY'|'symmetric'|
 *     'bounce'|'ejectY'|'ejectYReflect'`) — routes DIRECTLY through the SAME
 *     composable authority (the "any liner-behavior composition" case, report
 *     §4.4.4) — gives a Tube's own walls the full DSE-liner scatter vocabulary,
 *     unifying the two composable surfaces. `options.resetLocalTime` (default
 *     false) is the SAME orthogonal axis `slitLinerScatter.js` already defines.
 *   - Unknown string — throws (FAIL-LOUD, never a silent no-op).
 *
 * ── `options.orientation` — v1 semantics (open; DOCUMENT LOUDLY) ──────────────────────
 *
 * `orientation` (degrees) is the direction the tunnel DIRECTS TOWARDS — it drives
 * the DIRECTION machinery EXACTLY, at ANY angle, NEVER snapped:
 *   - the host-trig redirect's `angleRad` (`option1`'s `directedRedirectProgram`),
 *   - the auto-wired emitter's initial `(vx,vy) = (cos(orientation), sin(orientation))
 *     * speed` (when `options.emitter` is also supplied — see `this.emitter` below).
 *
 * The tunnel BODY, however, is a hard AABB (axis-aligned) construction — Tube's
 * OWN structural convention is "long axis always X" (its own module docstring):
 * `capNegX`/`capPosX` are the ONLY end-cap axis Tube can build; there is no
 * `capNegY`/`capPosY`. **v1 LIMITATION, stated plainly:** the tunnel body is
 * THEREFORE ALWAYS constructed X-long in v1 — `orientation`'s "snap to the
 * nearest axis-aligned orientation" trivially resolves to X (the only axis Tube
 * can cap) for EVERY input angle. A genuine Y/Z-long BODY (a real closed breech
 * positioned at a Y or Z extreme) is NOT achievable without new Tube geometry
 * (adding `capNegY`/`capPosY`) and is explicitly OUT OF SCOPE here — it
 * is sugar-layer work, not engine work, but it is a materially larger addition
 * than "opt-in default-off params," so it is deliberately deferred, not silently
 * claimed. The DIRECTION (redirect angle / exit vector / emitter velocity) is the
 * part that is genuinely free and exact at any angle — this is what "honors the
 * exact angle" means in practice: a 30° tunnel has an X-long BODY (unaffected by
 * the 90°-snap rule, since 30° would round toward 0° anyway) whose beam/redirect
 * travels at EXACTLY 30°, not 0°.
 *
 * @param {Object} universe - Already-init'd universe (JS or WASM).
 * @param {Object} options
 * @param {number} options.left, options.top, [options.z=0] - Interior origin corner
 *   (same convention as `Tube`).
 * @param {number} options.length - Interior X extent (the tunnel's long/travel axis
 *   in v1 — see the orientation note above). Maps onto `Tube`'s `interiorWidth`.
 * @param {number} options.width - Interior Y extent (bore cross-section). Maps onto
 *   `Tube`'s `interiorHeight`.
 * @param {number} [options.depth] - Interior Z extent (3D cross-section). Omitted
 *   (default) -> `zContain:false` passed to `Tube` (a flat 2D-in-3D bore, no NEAR/
 *   FAR walls — byte-identical to a 2D scene); a positive value -> `zContain:true`,
 *   `depth` maps onto `Tube`'s `interiorDepth`.
 * @param {number} [options.orientation=0] - Direction in DEGREES — see the note
 *   above. `0` = +X (Tube's native convention, unaffected).
 * @param {'option1'|'option2'|'randomXY'|'symmetric'|'bounce'|'ejectY'|'ejectYReflect'}
 *   [options.behavior='option2'] - see the behavior note above.
 * @param {boolean} [options.resetLocalTime=false] - orthogonal axis for the
 *   composable-behavior case (ignored for `'option1'`/`'option2'`).
 * @param {number} [options.redirectSpread=0] - degrees; `'option1'`'s isotropic-
 *   spread sub-option (0 = fully directed).
 * @param {number|null} [options.redirectSpeed=null] - `'option1'`'s redirected
 *   speed magnitude; `null` (default) preserves each frame's own incoming speed.
 * @param {Object|null} [options.emitter=null] - passed straight through to `Tube`'s
 *   own `options.emitter` (requires `options.capNegX:true`), EXCEPT `vx`/`vy` are
 *   derived from `orientation`+`speed` when the caller omits them explicitly (a
 *   directed-tunnel emitter fires ALONG the tunnel's own direction by default).
 * @param {...*} [options.*] - every other `Tube` option (`capNegX`, `capPosX`,
 *   `wallThickness`, `color`, `wallOpacity`, `sinkOpenEnds`, `collectCollided`,
 *   `observedDimensions`) passes straight through, UNCHANGED semantics.
 *
 * @property {Object} tube - the underlying `Tube` instance (walls/sinks/innerRect).
 * @property {Array<LargeObject>} walls - alias for `this.tube.walls`.
 * @property {Object|null} emitter - alias for `this.tube.emitter`.
 * @property {Function} applyRedirect - ALWAYS present (C1 fix), regardless of the current `behavior`
 *   — a redirect applier is cheap to build and this lets a LIVE `updateBehavior`
 *   switch INTO 'option1' work without reconstruction. Prefer
 *   `applyRedirectIfActive(tickData)` (below) over calling this directly — it
 *   self-gates on `this.behavior === 'option1'` so a caller never needs its own
 *   `currentBehavior === 'option1'` check (the exact omission that caused C1).
 * @property {string} behavior - the CURRENT behavior; kept live-accurate by
 *   `updateBehavior()` (never mutate directly).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * DirectedTunnel adds ZERO new physics (canonical-bench SU1): `option2` is Tube's
 * pre-existing native BOUNCE; the composable-BEHAVIORS case is the SAME op-programs
 * `slitLinerScatter.js` already proves byte-identical to the DSE liner's own
 * construction; `option1`'s redirect is the MEASURED path (c) — zero (or
 * bounded <=1px) extra latency vs a native mechanism, confirmed empirically
 * (Test A/B).
 */

import { Tube } from './Tube.js';
import * as SlitLinerScatter from './slitLinerScatter.js';
import * as DirectedRedirectProgram from './directedRedirectProgram.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';

    // ── Imports ─────────────────────────────────────────────────────────



    var OPTION1 = 'option1';
    var OPTION2 = 'option2';

    /**
     * @param {Object} universe
     * @param {Object} options - see module docstring above.
     */
    function DirectedTunnel(universe, options) {
        options = options || {};

        this.universe = universe;
        this._schemaKind = 'DirectedTunnel';

        var length = options.length;
        var width = options.width;
        if (!(length > 0) || !(width > 0)) {
            throw new Error('[DirectedTunnel] options.length and options.width must both be positive numbers.');
        }
        var hasDepth = (options.depth !== undefined && options.depth !== null);
        var depth = hasDepth ? options.depth : width; // placeholder — Tube requires interiorDepth > 0 even when zContain:false
        var zContain = hasDepth;
        // The SAME N1-fix-precedent
        // gate `hasRealDepth` uses elsewhere in this file (polarSpreadRad) — stored
        // for `_applyBehaviorToWalls`'s composable-behavior branch below, which
        // threads it into `SlitLinerScatter.applyLinerScatter`'s new `hasRealDepth`
        // opt-in (3D randomXY/symmetric scatter). zContain:false (every 2D tunnel,
        // every pre-existing caller) -> stays false -> byte-identical.
        this._hasRealDepth = zContain;

        var orientationDeg = options.orientation !== undefined ? options.orientation : 0;
        var orientationRad = orientationDeg * Math.PI / 180;
        this.orientation = orientationDeg;

        // v1 BODY SNAP (see module docstring "options.orientation" note): Tube can
        // ONLY build end-caps on its own X axis, so the body is ALWAYS constructed
        // X-long in v1 regardless of the requested orientation — the "snap to the
        // nearest axis-aligned orientation" is trivially satisfied by this single
        // fixed choice (documented loudly above; NOT silently narrower than implied).
        this.bodyAxis = 'X';

        var behavior = options.behavior !== undefined ? options.behavior : OPTION2;
        var resetLocalTime = !!options.resetLocalTime;
        var redirectSpreadDeg = options.redirectSpread !== undefined ? options.redirectSpread : 0;
        var redirectSpeed = (options.redirectSpeed !== undefined) ? options.redirectSpeed : null;

        var validComposable = SlitLinerScatter.BEHAVIORS.indexOf(behavior) !== -1;
        if (behavior !== OPTION1 && behavior !== OPTION2 && !validComposable) {
            throw new Error(
                '[DirectedTunnel] unknown behavior "' + behavior + '". Expected: option1 | option2 | ' +
                SlitLinerScatter.BEHAVIORS.join(' | ')
            );
        }

        // ── Emitter: derive vx/vy from orientation+speed when the caller omits them ──
        var tubeEmitterOpt = null;
        if (options.emitter) {
            tubeEmitterOpt = {};
            for (var k in options.emitter) { if (Object.prototype.hasOwnProperty.call(options.emitter, k)) { tubeEmitterOpt[k] = options.emitter[k]; } }
            if (tubeEmitterOpt.vx === undefined && tubeEmitterOpt.vy === undefined) {
                var espeed = tubeEmitterOpt.speed !== undefined ? tubeEmitterOpt.speed : 1;
                tubeEmitterOpt.vx = Math.cos(orientationRad) * espeed;
                tubeEmitterOpt.vy = Math.sin(orientationRad) * espeed;
            }
        }

        // ── Construct the underlying Tube (the ONE six-face-construction authority) ──
        var tubeOpts = {
            left: options.left, top: options.top, z: options.z,
            interiorWidth: length, interiorHeight: width, interiorDepth: depth,
            wallThickness: options.wallThickness,
            capNegX: options.capNegX, capPosX: options.capPosX,
            collisionType: options.collisionType, // Tube's own default (BOUNCE) applies unless option1 overrides TOP/BOTTOM below
            actions: options.actions,
            observedDimensions: options.observedDimensions,
            color: options.color,
            zContain: zContain,
            wallOpacity: options.wallOpacity,
            sinkOpenEnds: options.sinkOpenEnds,
            // C1 FIX (2026-07-13): ALWAYS true, regardless of the INITIAL behavior —
            // this.applyRedirect is now ALSO always built (below), so a LATER live
            // switch INTO 'option1' (updateBehavior) needs tickData.objects[handle]
            // .frames to already exist on TOP/BOTTOM; matches the DSE-lab tunnels'
            // own "always collect" design for the SAME reason. Cheap (a collection
            // buffer with no consumer is a no-op physics-wise) and DirectedTunnel has
            // no OTHER existing callers to keep byte-identical against (T1-new).
            collectCollided: true,
            emitter: tubeEmitterOpt,
        };
        this.tube = new Tube(universe, tubeOpts);
        this.walls = this.tube.walls;
        this.sinks = this.tube.sinks;
        this.innerRect = this.tube.innerRect;
        this.emitter = this.tube.emitter;
        this.largeObjects = this.tube.largeObjects;

        this._topWall = this.walls.filter(function (w) { return w.name === 'TOP'; })[0];
        this._bottomWall = this.walls.filter(function (w) { return w.name === 'BOTTOM'; })[0];

        // C1 FIX: the host redirect applier is ALWAYS
        // built (regardless of the INITIAL behavior) — mirrors the DSE-lab tunnels'
        // OWN "always collectCollided:true + always an applyRedirect fallback" design
        // (needed so a LIVE switch INTO option1 works with no reconstruction). Kept
        // here too — not just at the Lab layer — so ANY consumer of DirectedTunnel
        // gets the SAME guarantee "for free", not just the Lab's own hand-rolled path.
        var wallHandles = [];
        if (this._topWall) { wallHandles.push(this._topWall.handle); }
        if (this._bottomWall) { wallHandles.push(this._bottomWall.handle); }
        this.applyRedirect = DirectedRedirectProgram.buildRedirectApplier(universe, {
            wallHandles: wallHandles,
            angleRad: orientationRad,
            spreadRad: redirectSpreadDeg * Math.PI / 180,
            speed: redirectSpeed,
            // 3D EXTENSION (§4 option (c)): when this tunnel
            // has REAL z-containment armed (zContain, the SAME N1-fix-precedent
            // gate `hasRealDepth` uses elsewhere — never innerRect.d, always a
            // positive placeholder), mirror the azimuth spread's own magnitude
            // onto the polar (z) axis too — a redirected population scatters on
            // the unit SPHERE, not just the XY plane. zContain:false (every 2D
            // tunnel, every pre-existing caller) -> polarSpreadRad stays exactly
            // 0 -> byte-identical to the pre-3D 2-axis redirect formula.
            polarSpreadRad: zContain ? (redirectSpreadDeg * Math.PI / 180) : 0,
        });

        // 'option2' at CONSTRUCTION time needs NO extra push — Tube's own native
        // collisionType (default BOUNCE) already IS option2's target state (zero
        // additional code path, matching the pre-C1-fix behavior exactly). Every
        // OTHER initial behavior (option1 / a composable name) DOES need its
        // construction-time push, same as before. `updateBehavior` (a LIVE switch,
        // possibly INTO option2 from something else) always dispatches all 3 cases.
        if (behavior !== OPTION2) { this._applyBehaviorToWalls(behavior, resetLocalTime); }
        this.behavior = behavior;
        this.resetLocalTime = resetLocalTime;

        // ── THE ONE UP-LINK on every wall this corridor composed ──────────────────
        for (var gi = 0; gi < this.walls.length; gi++) {
            this.walls[gi]._owner = this;   // THE ONE UP-LINK
        }
    }

    /**
     * Apply ONE behavior to this tunnel's TOP/BOTTOM walls — the SAME three-
     * mechanism dispatch the constructor uses (private; both the constructor and
     * `updateBehavior` below call this ONE implementation, never a second copy).
     * @param {string} behavior
     * @param {boolean} resetLocalTime
     */
    DirectedTunnel.prototype._applyBehaviorToWalls = function (behavior, resetLocalTime) {
        var universe = this.universe;
        var topWall = this._topWall, bottomWall = this._bottomWall;
        if (behavior === OPTION1) {
            // In-engine half: pure eject, ZERO velocity touch (ejectY has no velocity
            // ops at all) — the host redirect (this.applyRedirect, ALWAYS present) is
            // the ONLY velocity write once this mode is active.
            if (topWall) { SlitLinerScatter.applyLinerScatter(topWall, universe, 'bottom', { behavior: 'ejectY', resetLocalTime: false }); }
            if (bottomWall) { SlitLinerScatter.applyLinerScatter(bottomWall, universe, 'top', { behavior: 'ejectY', resetLocalTime: false }); }
        } else if (behavior === OPTION2) {
            // Native BOUNCE — LargeObject's OWN recompileActions (the S4 mechanism
            // every collision_type/actions live edit already uses), NOT a
            // slitLinerScatter push (native BOUNCE has no eject-prefix op-program
            // shape to route through).
            if (topWall) { topWall.recompileActions({ collisionType: 'BOUNCE', actions: [] }); }
            if (bottomWall) { bottomWall.recompileActions({ collisionType: 'BOUNCE', actions: [] }); }
        } else if (SlitLinerScatter.BEHAVIORS.indexOf(behavior) !== -1) {
            // hasRealDepth threads THIS tunnel's own zContain (set
            // at construction, never re-derived) into the composable scatter
            // behaviors — a randomXY/symmetric switch on a real-depth tunnel now
            // scatters all 3 axes, matching option2's (native BOUNCE) own
            // already-correct NEAR/FAR handling.
            if (topWall) { SlitLinerScatter.applyLinerScatter(topWall, universe, 'bottom', { behavior: behavior, resetLocalTime: resetLocalTime, hasRealDepth: this._hasRealDepth }); }
            if (bottomWall) { SlitLinerScatter.applyLinerScatter(bottomWall, universe, 'top', { behavior: behavior, resetLocalTime: resetLocalTime, hasRealDepth: this._hasRealDepth }); }
        } else {
            throw new Error(
                '[DirectedTunnel] unknown behavior "' + behavior + '". Expected: option1 | option2 | ' +
                SlitLinerScatter.BEHAVIORS.join(' | ')
            );
        }
    };

    /**
     * LIVE behavior switch (C1 fix follow-through, 2026-07-13) — the STRUCTURAL
     * home for "how does a DirectedTunnel switch its collision behavior live,
     * across all 3 underlying mechanisms (option1 host-redirect / option2 native
     * BOUNCE / a slitLinerScatter composable name)". Moved OFF the DSE Lab page
     * (which used to hand-roll this by reaching into `tunnel.walls` directly) and
     * ONTO DirectedTunnel itself so `this.behavior` NEVER goes stale after a live
     * switch — the ONE thing that makes `applyRedirectIfActive` (below) safe to
     * call unconditionally from ANY consumer's per-tick loop, not just the Lab's.
     * @param {string} newBehavior
     * @param {boolean} [resetLocalTime=false] - composable-BEHAVIORS-name case only.
     */
    DirectedTunnel.prototype.updateBehavior = function (newBehavior, resetLocalTime) {
        resetLocalTime = !!resetLocalTime;
        this._applyBehaviorToWalls(newBehavior, resetLocalTime);
        this.behavior = newBehavior;
        this.resetLocalTime = resetLocalTime;
    };

    /**
     * C1 FIX — the redirect applier is a plain
     * function the CALLER invokes once per tick with that tick's `tickData`
     * (directedRedirectProgram.js's own docstring explains why this can never be
     * a self-registering `experimentTickFunctions` push: it needs THIS tick's
     * Phase-D `tickData.objects[handle].frames`, which does not exist until
     * AFTER `doTick()` returns — i.e. AFTER `experimentTickFunctions` already
     * ran). Since there is no generic "call me after every tick with tickData"
     * registry a sugar object can self-register into (FrqtlApp exposes
     * exactly ONE user-supplied `onTick` slot, matching the established
     * `DetectorWall.prototype.getCollisionHistogram(tickData)` precedent — a
     * caller-invoked method, not a hook), the caller MUST still call something,
     * every tick. `applyRedirectIfActive` is that ONE call: it self-gates on
     * `this.behavior` (kept live-accurate by `updateBehavior` above), so a
     * consumer's onTick can call this UNCONDITIONALLY for every tunnel, every
     * tick, regardless of which behavior is currently active — the exact
     * "forgetting to gate on option1" mistake (this C1 bug) becomes structurally
     * impossible to repeat.
     * @param {Object} tickData - this tick's TickData (from `universe.doTick()`).
     */
    DirectedTunnel.prototype.applyRedirectIfActive = function (tickData) {
        if (this.behavior === OPTION1) { this.applyRedirect(tickData); }
    };

    // BEHAVIORS: the canonical, complete list of legal `options.behavior` values —
    // 'option1'/'option2' (the report's two modes) PLUS every slitLinerScatter
    // composable name. ONE authority for any consumer (e.g. a control-panel select)
    // that needs to enumerate the full set — never hand-typed (T3, 2026-07-13).
    DirectedTunnel.BEHAVIORS = [OPTION1, OPTION2].concat(SlitLinerScatter.BEHAVIORS);

    // BEHAVIOR_META (option1/option2 are non-descript names): a DISPLAY-ONLY
    // label/description per canonical
    // `options.behavior` VALUE — the wire value ('option1'/'option2'/composable
    // name) is UNCHANGED (every existing caller — the tunnel/lightsource labs and
    // every test — keeps passing/reading the
    // SAME strings; renaming the wire value itself would ripple into the DSE Lab,
    // which this drive explicitly scopes OUT — "a SEPARATE later loop"). ONE
    // authority for any consumer building a control-panel select: read
    // `BEHAVIOR_META[value].label` for the human-facing option text and
    // `.description` for a tooltip — never hand-type either (tunnel-lab and
    // lightsource-lab's own `<select id="ctrl-wallbehavior">` population loops
    // consume this map).
    DirectedTunnel.BEHAVIOR_META = {
        option1: {
            label: 'laserBeam',
            description: 'Directed host-trig redirect — exits along the tunnel’s own direction, laser-like (collimated).'
        },
        option2: {
            label: 'reflect',
            description: 'Native BOUNCE — pure elastic ping-pong reflection off the walls (Tube’s own default).'
        },
        randomXY: {
            label: 'randomXY',
            description: 'Eject + vx=random() (always forward), vy symmetric (+ vz symmetric on a real-depth tunnel); charge redrawn.'
        },
        symmetric: {
            label: 'symmetric',
            description: 'Omnidirectional/unpolarized input — eject + vx AND vy both symmetric (+ vz symmetric on a real-depth tunnel; no forward bias); charge redrawn.'
        },
        bounce: {
            label: 'bounce',
            description: 'Eject + vy=-vy only (elastic reflection); no charge redraw.'
        },
        ejectY: {
            label: 'ejectY',
            description: 'Pure eject into the cavity, ZERO velocity writes; no charge redraw.'
        },
        ejectYReflect: {
            label: 'ejectYReflect',
            description: 'ejectY’s eject prefix PLUS vy=-vy; no charge redraw.'
        }
    };

    // ── Export ───────────────────────────────────────────────────────────

    export { DirectedTunnel };

