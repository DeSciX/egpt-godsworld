/* Copyright 2023-2026 by Essam Abadir */

/**
 * CameraPath.js — a declarative, REPRODUCIBLE camera path (CEO-ratified 2026-07-30).
 *
 * ONE object for both modes. It drives `runner.cameraControl` — the single camera write path —
 * with ABSOLUTE poses derived from waypoints, so the same waypoints and the same tick always
 * produce the same picture. There is **no `if (is3D)` anywhere**: a 3D path declares full
 * orbit-bag waypoints, a 2D path declares `{distance, target}` waypoints, and both go through
 * the identical per-field interpolation. Which fields are legal is read from the handle's own
 * `poseFields` — the consumer asks what axes EXIST, never what mode it is in.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `CameraPath.attach(runner, { waypoints, loop? }) → handle`
 *
 *   @param {object} runner — an FrqtlApp. The ONLY couplings: `runner.cameraControl`
 *     (the capability-checked camera handle), the per-tick listener fan-out, and
 *     `runner.repaint()`. No renderer-sniffing, no engine, no capture knowledge.
 *   @param {Array<{atTick:number, pose:object}>} waypoints — at least one. `pose` is a PARTIAL
 *     orbit bag with `setOrbit` patch semantics. Sorted by `atTick` at attach.
 *   @param {boolean} [loop=false] — wrap the path modulo its duration.
 *   @returns {{
 *     start():void, stop():void, dispose():void,
 *     poseAt(tick):object,          // PURE — same waypoints + same tick ⇒ same pose
 *     onWaypoint(cb):function,      // cb({ tick, index, pose }); returns an unsubscribe
 *     running:boolean
 *   }}
 *
 * `CameraPath.poseAt(waypoints, tick, loop)` is also exported as a FREE function — pure, no
 * runner, no wall clock, unit-testable in plain Node (the `three-camera-geometry` discipline).
 *
 * ── Why absolute writes, and why not look()/move() ───────────────────────────
 *
 * Playback is a tick-fan-out subscriber calling `cameraControl.setOrbit(poseAt(tick))`:
 * declarative ABSOLUTE writes through the one camera authority. It deliberately does NOT drive
 * the incremental `look()`/`move()` surface — integrating deltas would accumulate drift and
 * make the path unreproducible, which is the exact property this object exists to guarantee.
 * The tick is the ONLY clock: no wall time, no RAF coupling, so a paused-and-stepped run and a
 * live run trace the identical path.
 *
 * ── Interpolation ────────────────────────────────────────────────────────────
 *
 * Per-field over the bag, between the two bracketing waypoints:
 *   - `azimuth`/`roll` — SHORTEST-ARC mod 360 (a camera turning 350° the long way round is
 *     never what a waypoint pair meant).
 *   - every other number (`elevation`, `distance`, …) — scalar lerp.
 *   - `target` — componentwise; a segment mixing `target:null` with a concrete target THROWS
 *     at attach, because lerping "the scene centre" against a point is undefined. Declare both
 *     or neither on adjacent waypoints.
 * A field present in only ONE of the two bracketing waypoints is held constant (no invented
 * midpoint against an unstated value).
 *
 * ── FAIL-LOUD (a declared camera path that cannot fly is not a hidden affordance) ───
 *
 * `attach` THROWS when `runner.cameraControl` is null (a provider with NO pose control at all)
 * or when a waypoint names a field the handle does not declare (e.g. `azimuth` in 2D). This
 * deliberately BREAKS from the `CameraControls` fail-soft precedent, and the distinction is
 * the same one the capture contract draws: a UI widget that hides is an affordance; a declared
 * camera path that silently does not fly, under a golden or a corpus row, is FABRICATED EVIDENCE.
 *
 * ── Capture at a waypoint belongs to NEITHER object ──────────────────────────
 *
 * It is composition by the caller:
 *
 *   `drone.onWaypoint(async () => rows.push(await vision.getStill()));`
 *
 * `FrqtlVision` keeps zero camera knowledge (no pose on capture) and `CameraPath` keeps zero
 * capture knowledge — a `capture:true` waypoint flag would be the coupling that makes both
 * objects unpluggable separately. No data coupling is needed because the provenance already
 * closes the loop: every still stamps `pose` from the live camera authority, so a
 * camera path-captured row records the ACTUAL applied pose. The two objects compose through the
 * contract, not through each other. A callback is invoked and NOT awaited — the tick clock is
 * never held hostage by a consumer (a throwing callback is surfaced, never swallowed).
 *
 * ── Repaint ──────────────────────────────────────────────────────────────────
 *
 * A pose write on a PAUSED scene changes nothing visible until something redraws, which reads
 * as "the camera is broken". So every pose write is followed by `runner.repaint()` — the
 * existing one-shot redraw that re-renders the LAST TickData without advancing the clock. The
 * same recipe applies to a manual pan/zoom: `setOrbit(...)` → `repaint()` → capture.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. A camera path is an observation instrument: it changes which pixels you are
 * shown, never a frame, a dimension or a tick. No canonical-bench golden can move because of it.
 *
 * Usage:
 *   var drone = CameraPath.attach(runner, { waypoints: [
 *     { atTick: 0,   pose: { distance: 400, target: null } },
 *     { atTick: 200, pose: { distance: 60,  target: { x: 300, y: 220 } } }
 *   ]});
 *   drone.onWaypoint(async () => rows.push(await vision.getStill()));
 *   drone.start();
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — classic scripts share ONE global
//    lexical environment, so an unwrapped top-level helper would silently overwrite a
//    same-named sibling, invisibly to `node --test`).
(function () {

// NO hand list of angular axes. Wrap-ness is DECLARED by the camera that owns the axis
// (`poseFields[].constraint.wrap` — the period of a periodic value space) and FERRIED here.
// A hand-written ['azimuth','roll'] encoded, in this file, a fact the contract holds
// elsewhere: a camera declaring a NEW wrapping axis would have silently got long-way-round
// interpolation until someone remembered to edit this list.

function _fail(msg) {
    throw new Error('[CameraPath] ' + msg + ' (FAIL-LOUD.)');
}

function _finite(v, where) {
    if (typeof v === 'number' && isFinite(v)) { return v; }
    _fail(where + ' must be a finite number, got ' + String(v));
}

/**
 * Shortest-arc interpolation on a value space of the given PERIOD (declared, not assumed).
 * @private
 */
function _lerpAngle(a, b, t, period) {
    var half = period / 2;
    var d = ((((b - a) % period) + period + half) % period) - half;   // → (-half, half]
    return a + d * t;
}

function _lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Componentwise interpolation of a point, over the UNION of both endpoints' numeric
 * components — so {x,y} and {x,y,z} both work with no mode branch and nothing is dropped.
 * A component present in only one endpoint is HELD (the same rule as a pose field).
 * @private
 */
function _lerpPoint(a, b, t) {
    var out = {};
    var keys = _poseKeys(a, b);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i], va = a[k], vb = b[k];
        if (typeof va === 'number' && typeof vb === 'number') { out[k] = _lerp(va, vb, t); }
        else { out[k] = (vb === undefined) ? va : vb; }
    }
    return out;
}

/**
 * poseAt(waypoints, tick, loop) — THE pure path evaluation.
 *
 * Same waypoints + same tick ⇒ same pose, always. No wall clock, no RAF, no runner: this is
 * what makes a camera path-addressed golden reproducible rather than merely repeatable.
 *
 * @param {Array<{atTick:number, pose:object}>} waypoints — assumed sorted (attach sorts)
 * @param {number} tick
 * @param {boolean} [loop=false]
 * @param {Object<string,number>} [wrapByField] — field name → period, FERRIED from the
 *   camera's `poseFields[].constraint.wrap`. A field listed here interpolates on the SHORTEST
 *   ARC; everything else is a plain lerp. Omitted ⇒ no field wraps (a caller with no camera
 *   is not entitled to guess which axes are circular).
 * @returns {object} an orbit-bag PATCH to hand to `setOrbit`
 */
function poseAt(waypoints, tick, loop, wrapByField) {
    if (!Array.isArray(waypoints) || !waypoints.length) { _fail('poseAt needs at least one waypoint'); }
    var first = waypoints[0];
    var last  = waypoints[waypoints.length - 1];
    var t = _finite(tick, 'tick');

    if (loop && waypoints.length > 1) {
        var span = last.atTick - first.atTick;
        if (span > 0) { t = first.atTick + (((t - first.atTick) % span) + span) % span; }
    }
    // Before the first / after the last waypoint the path HOLDS that endpoint — it never
    // extrapolates into poses no waypoint declared.
    if (t <= first.atTick) { return _copyPose(first.pose); }
    if (t >= last.atTick)  { return _copyPose(last.pose); }

    var i = 0;
    while (i < waypoints.length - 1 && waypoints[i + 1].atTick <= t) { i++; }
    var a = waypoints[i], b = waypoints[i + 1];
    var span2 = b.atTick - a.atTick;
    var f = (span2 > 0) ? (t - a.atTick) / span2 : 0;

    var out = {};
    var keys = _poseKeys(a.pose, b.pose);
    for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var va = a.pose[key], vb = b.pose[key];
        // A field present in only ONE bracketing waypoint is HELD — never lerped against an
        // unstated value.
        if (va === undefined) { out[key] = _copyValue(vb); continue; }
        if (vb === undefined) { out[key] = _copyValue(va); continue; }
        if (key === 'target') {
            if (va === null && vb === null) { out[key] = null; continue; }
            // The null/concrete mix is rejected at attach; this is the belt-and-braces.
            if (va === null || vb === null) {
                _fail('cannot interpolate `target` between null (scene centre) and a concrete ' +
                      'point across the segment at ticks ' + a.atTick + '→' + b.atTick +
                      ' — declare target on both waypoints or neither');
            }
            // COMPONENTWISE over whatever components the point actually carries — a 2D
            // target is {x,y}, a 3D target is {x,y,z}. Hardcoding x/y here silently DROPPED
            // z on every 3D tracking path (found by the 3D-target gate, not by review).
            out[key] = _lerpPoint(va, vb, f);
            continue;
        }
        if (typeof va === 'number' && typeof vb === 'number') {
            var period = wrapByField ? wrapByField[key] : undefined;
            out[key] = (typeof period === 'number' && period > 0)
                ? _lerpAngle(va, vb, f, period) : _lerp(va, vb, f);
            continue;
        }
        out[key] = _copyValue(vb);
    }
    return out;
}

function _poseKeys(a, b) {
    var seen = Object.create(null), out = [];
    [a, b].forEach(function (p) {
        if (!p) { return; }
        Object.keys(p).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } });
    });
    return out;
}

function _copyValue(v) {
    // A plain-data copy over ALL own keys — never a hand-listed {x,y}, which dropped z from
    // every 3D target it touched.
    if (v && typeof v === 'object') { return JSON.parse(JSON.stringify(v)); }
    return v;
}

/** A pose copy — a handed-out pose never aliases a waypoint the caller still holds. */
function _copyPose(pose) {
    var out = {};
    if (!pose) { return out; }
    Object.keys(pose).forEach(function (k) { out[k] = _copyValue(pose[k]); });
    return out;
}

/**
 * attach(runner, opts) — validate the path against the camera's DECLARED axes, then bind it.
 * @param {object} runner @param {{waypoints:Array, loop?:boolean}} opts
 * @returns {object} the handle (see the module docstring)
 */
function attach(runner, opts) {
    if (!runner || typeof runner.addTickListener !== 'function') {
        _fail('attach needs an FrqtlApp with a per-tick listener fan-out');
    }
    var cam = runner.cameraControl;
    if (!cam) {
        _fail('this renderer exposes NO camera pose control (runner.cameraControl is null), so a ' +
              'declared camera path cannot fly. A UI widget may hide on an absent capability; a ' +
              'programmatic instrument must not silently do nothing — a golden or a corpus row ' +
              'built on a camera path that never moved is fabricated evidence');
    }
    opts = opts || {};
    var waypoints = opts.waypoints;
    if (!Array.isArray(waypoints) || !waypoints.length) {
        _fail('attach needs at least one waypoint: [{ atTick, pose }]');
    }

    // The DECLARED axes of THIS camera — ferried from the handle, never a hand-written list.
    // This is the whole reason there is no mode sniffing: 2D declares {distance, target}, 3D
    // declares the full bag, and the SAME validation covers both.
    var declared = {};
    var fields = cam.poseFields || [];
    for (var f = 0; f < fields.length; f++) { declared[fields[f].name] = true; }
    var declaredNames = Object.keys(declared);
    // FERRIED wrap-ness: field name → period, straight off the camera's own descriptors.
    var wrapByField = {};
    for (var w = 0; w < fields.length; w++) {
        var c = fields[w].constraint;
        if (c && typeof c.wrap === 'number' && c.wrap > 0) { wrapByField[fields[w].name] = c.wrap; }
    }

    var sorted = waypoints.slice().sort(function (a, b) { return a.atTick - b.atTick; });
    for (var i = 0; i < sorted.length; i++) {
        var wp = sorted[i];
        if (!wp || typeof wp !== 'object') { _fail('waypoint ' + i + ' is not an object'); }
        _finite(wp.atTick, 'waypoint ' + i + ' atTick');
        if (!wp.pose || typeof wp.pose !== 'object') { _fail('waypoint ' + i + ' has no pose bag'); }
        var keys = Object.keys(wp.pose);
        if (!keys.length) { _fail('waypoint ' + i + ' has an EMPTY pose bag'); }
        for (var k = 0; k < keys.length; k++) {
            var key = keys[k];
            if (declaredNames.length && !declared[key]) {
                _fail('waypoint ' + i + ' names pose field "' + key + '", which this camera does ' +
                      'NOT declare. Declared axes: [' + declaredNames.join(', ') + ']. Read ' +
                      'cameraControl.poseFields rather than assuming a mode — a silently skipped ' +
                      'axis is a camera path that does not fly');
            }
            var val = wp.pose[key];
            if (typeof val === 'number') { _finite(val, 'waypoint ' + i + ' ' + key); }
            if (key === 'target' && val !== null && val !== undefined) {
                if (typeof val.x !== 'number' || typeof val.y !== 'number') {
                    _fail('waypoint ' + i + ' target must be {x,y} (2D) or {x,y,z} (3D), or null');
                }
                // Validate EVERY numeric component the point carries (z included), so a
                // non-finite z fails at attach rather than steering the camera to NaN.
                var comps = Object.keys(val);
                for (var c = 0; c < comps.length; c++) {
                    if (typeof val[comps[c]] === 'number') {
                        _finite(val[comps[c]], 'waypoint ' + i + ' target.' + comps[c]);
                    }
                }
            }
        }
        // Reject the undefined null/concrete target mix AT ATTACH, where the diagnosis is
        // cheap, rather than mid-flight where it is a grenade.
        if (i > 0) {
            var prev = sorted[i - 1].pose;
            var pHas = ('target' in prev), cHas = ('target' in wp.pose);
            if (pHas && cHas && ((prev.target === null) !== (wp.pose.target === null))) {
                _fail('the segment at ticks ' + sorted[i - 1].atTick + '→' + wp.atTick +
                      ' mixes target:null (the scene centre) with a concrete point — that ' +
                      'interpolation is undefined. Declare target on both waypoints or neither');
            }
        }
    }

    var loop = !!opts.loop;
    // ── THE ANCHOR ──────────────────────────────────────────────────────────
    // `atTick` is PATH-RELATIVE: tick 0 is "when this camera path starts", not universe tick 0.
    // Absolute ticks were unusable in practice — attaching a drone to an already-running
    // page (a probe, a Studio session, any corpus run that boots the scene first) meant
    // every waypoint was ALREADY IN THE PAST, so `poseAt` returned the final pose and every
    // waypoint fired at once against it. That is not a timing race; it is a coordinate-system
    // bug, and it silently produced well-formed rows that all carried the last pose.
    //
    // `anchorTick` pins the origin explicitly for exact reproduction (a corpus row can record
    // it); omitted, the anchor is the universe tick at `start()`.
    var anchorTick = (typeof opts.anchorTick === 'number' && isFinite(opts.anchorTick))
        ? opts.anchorTick : null;
    var anchored = null;
    // Safety valve for an async waypoint handler that never settles (see _holdUntilSettled).
    // 0 disables it — accept a permanent freeze rather than a non-waypoint-exact capture.
    var waypointTimeoutMs = (typeof opts.waypointTimeoutMs === 'number')
        ? opts.waypointTimeoutMs : 10000;
    // How many suspends THIS drone currently holds, so stop()/dispose() can release exactly
    // its own and never another consumer's.
    var heldCount = 0;
    var listeners = [];
    var unsubscribe = null;
    var lastFiredIndex = -1;

    var draining = false;

    function _applyAt(tick) { _applyPose(poseAt(sorted, tick, loop, wrapByField)); }

    function _applyPose(pose) {
        cam.setOrbit(pose);
        // A pose write on a PAUSED scene is invisible until something redraws — working code
        // that reads as broken. repaint() re-renders the LAST TickData without advancing the
        // tick clock (the clock is the loop's alone).
        if (typeof runner.repaint === 'function') { runner.repaint(); }
    }

    /**
     * Fire the handlers for every waypoint newly reached, holding the TICK CLOCK until they
     * settle.
     *
     * ── Why the clock is held (this REVERSES the D9b default, deliberately) ──
     * D9b fired handlers and did not await them, on the rule "the tick clock is never held
     * hostage by a consumer". That rule is right for a PASSIVE observer, and wrong here. At
     * unbounded TPS the runner executes a whole batch of ticks inside one rAF frame, so an
     * `await` inside a handler resumes only AFTER the batch — and a capture taken there
     * records the pose and pixels of the LAST tick of the batch, not the waypoint's. The
     * provenance stays truthful (the still stamps what the canvas actually showed), which is
     * precisely what makes the failure so quiet: the row is well-formed and simply is not the
     * waypoint's record. For corpus building that is worthless.
     *
     * A waypoint is not an observation, it is a SYNCHRONISATION POINT — "this instant,
     * specifically" is its entire content. So the narrower correct rule: a waypoint handler
     * MAY hold the clock; it must not be able to hold it forever. Hence the counted
     * suspend/resume pair and the safety valve below.
     *
     * The tick SEQUENCE is unchanged (tick N is tick N), so physics determinism is untouched;
     * only wall-clock pacing changes. And the drone still knows NOTHING about capture — it
     * guarantees the world is frozen at the waypoint and lets the consumer do whatever it
     * likes with that instant.
     */
    function _notifyWaypoints(tick) {
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].atTick <= tick && i > lastFiredIndex) {
                lastFiredIndex = i;
                var evt = { tick: sorted[i].atTick, index: i, pose: _copyPose(sorted[i].pose) };
                var pending = [];
                for (var L = 0; L < listeners.length; L++) {
                    // A throwing SYNCHRONOUS handler is surfaced and cannot abort its peers.
                    try {
                        var r = listeners[L](evt);
                        if (r && typeof r.then === 'function') { pending.push(r); }
                    } catch (e) { _surface('onWaypoint callback threw', e); }
                }
                if (pending.length) { _holdUntilSettled(pending, evt); }
            }
        }
    }

    function _surface(what, e) {
        if (typeof console !== 'undefined' && console.error) {
            console.error('[CameraPath] ' + what + ':', e);
        }
    }

    /**
     * Hold the tick clock until every pending handler settles.
     *
     * The suspend is raised SYNCHRONOUSLY, inside the tick listener, so the runner's batch
     * loop (which checks the depth per tick) breaks immediately — before another tick can
     * move the world out from under an in-flight capture.
     *
     * The safety valve: a handler that never settles would freeze the sim, and a frozen canvas
     * is ambiguous rather than loud. After `waypointTimeoutMs` the clock is released and the
     * problem is reported. It cannot affect a healthy path (it never fires there), so it buys
     * a loud failure without introducing wall-clock dependence into the deterministic route.
     */
    function _holdUntilSettled(pending, evt, cont) {
        if (typeof runner.suspendTicks !== 'function') {
            // A runner predating the suspend contract: the capture cannot be made
            // waypoint-exact, and pretending otherwise would fabricate corpus rows.
            _fail('this runner exposes no suspendTicks()/resumeTicks(), so an async ' +
                  'onWaypoint handler cannot be guaranteed to observe waypoint ' + evt.index +
                  '. Upgrade the runner, or use only synchronous handlers');
        }
        runner.suspendTicks();
        heldCount += 1;
        var released = false;
        var release = function () {
            if (released) { return; }
            released = true;
            heldCount -= 1;
            runner.resumeTicks();
            if (typeof cont === 'function') { cont(); }
        };
        var timer = null;
        if (waypointTimeoutMs > 0 && typeof setTimeout === 'function') {
            timer = setTimeout(function () {
                if (!released) {
                    _surface('an onWaypoint handler for waypoint ' + evt.index + ' did not settle ' +
                        'within ' + waypointTimeoutMs + 'ms — releasing the tick clock so the sim ' +
                        'does not stay frozen. That capture is NOT waypoint-exact',
                        new Error('waypoint handler timeout'));
                    release();
                }
            }, waypointTimeoutMs);
        }
        var settle = function (results) {
            if (timer !== null && typeof clearTimeout === 'function') { clearTimeout(timer); }
            if (results) {
                for (var i = 0; i < results.length; i++) {
                    if (results[i] && results[i].status === 'rejected') {
                        _surface('onWaypoint callback rejected', results[i].reason);
                    }
                }
            }
            release();
        };
        // allSettled so ONE rejecting handler cannot strand the clock for its peers.
        if (typeof Promise.allSettled === 'function') {
            Promise.allSettled(pending).then(settle, function (e) { _surface('waypoint hold failed', e); release(); });
        } else {
            Promise.all(pending.map(function (p) { return p.then(null, function () {}); }))
                .then(function () { settle(null); }, function () { release(); });
        }
    }

    function _universeTick(tickData) {
        return (tickData && tickData.universeData && typeof tickData.universeData.tick === 'number')
            ? tickData.universeData.tick : null;
    }

    /**
     * Drain every waypoint that has become due, ONE AT A TIME, each against ITS OWN pose.
     *
     * Two properties this buys, both load-bearing for corpus rows:
     *   - a waypoint handler always observes the pose of THAT waypoint, never a later one. If
     *     several waypoints come due in a single tick (a stalled frame, or a path denser than
     *     the tick rate), firing them all against the current interpolated pose would stamp
     *     them identically — the exact shape of the realm defect.
     *   - only ONE waypoint is ever in flight, so the clock hold is unambiguous.
     */
    function _drainDue(pathTick) {
        if (draining) { return; }
        var next = lastFiredIndex + 1;
        if (next >= sorted.length || sorted[next].atTick > pathTick) { return; }
        draining = true;
        _fireWaypoint(next, pathTick);
    }

    function _fireWaypoint(i, pathTick) {
        lastFiredIndex = i;
        // Pin the camera to THIS waypoint's own pose before anyone observes it.
        _applyPose(poseAt(sorted, sorted[i].atTick, loop, wrapByField));
        var evt = { tick: sorted[i].atTick, index: i, pose: _copyPose(sorted[i].pose) };
        var pending = [];
        for (var L = 0; L < listeners.length; L++) {
            try {
                var r = listeners[L](evt);
                if (r && typeof r.then === 'function') { pending.push(r); }
            } catch (e) { _surface('onWaypoint callback threw', e); }
        }
        var cont = function () {
            var nxt = lastFiredIndex + 1;
            if (nxt < sorted.length && sorted[nxt].atTick <= pathTick) { _fireWaypoint(nxt, pathTick); }
            else { draining = false; _applyAt(pathTick); }   // back to the interpolated pose
        };
        if (pending.length) { _holdUntilSettled(pending, evt, cont); }
        else { cont(); }
    }

    function _surface(what, e) {
        if (typeof console !== 'undefined' && console.error) {
            console.error('[CameraPath] ' + what + ':', e);
        }
    }

    function onTick(tickData) {
        var ut = _universeTick(tickData);
        if (ut === null) { return; }
        if (anchored === null) { anchored = (anchorTick !== null) ? anchorTick : ut; }
        var pathTick = ut - anchored;
        if (!draining) { _applyAt(pathTick); }
        _drainDue(pathTick);
    }

    var handle = {
        get running() { return !!unsubscribe; },
        /** Bind to the per-tick fan-out and apply the pose for the CURRENT tick immediately. */
        start: function () {
            if (unsubscribe) { return; }
            // Anchor FIRST, from the live universe tick, so path tick 0 is "now" even on a
            // page that has already been running for a thousand ticks.
            var td = runner._lastTickData;
            var ut = _universeTick(td);
            if (anchored === null) { anchored = (anchorTick !== null) ? anchorTick : (ut === null ? 0 : ut); }
            unsubscribe = runner.addTickListener(onTick);
            // A paused scene frames itself at once rather than at the next tick.
            if (ut !== null) { onTick(td); }
        },
        /** The universe tick path-tick 0 maps to (null before start()). Record it to reproduce. */
        get anchorTick() { return anchored; },
        stop: function () {
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            draining = false;
            lastFiredIndex = -1;
            anchored = null;   // a restart re-anchors to the new now
            // Never leave the clock held by a drone that is no longer flying — a stopped
            // drone that froze the sim would be the worst kind of leak (silent and total).
            while (heldCount > 0) { heldCount -= 1; if (typeof runner.resumeTicks === 'function') { runner.resumeTicks(); } }
        },
        dispose: function () { handle.stop(); listeners = []; },
        /** The PURE path evaluation, bound to this drone's own waypoints. */
        poseAt: function (tick) { return poseAt(sorted, tick, loop, wrapByField); },
        /**
         * onWaypoint(cb) — cb({tick, index, pose}) when a waypoint is reached.
         * The natural move is `async () => rows.push(await vision.getStill())`.
         * @returns {Function} unsubscribe
         */
        onWaypoint: function (cb) {
            if (typeof cb !== 'function') { _fail('onWaypoint needs a function'); }
            listeners.push(cb);
            return function () {
                var i = listeners.indexOf(cb);
                if (i !== -1) { listeners.splice(i, 1); }
            };
        },
        /** The validated, sorted path (a copy — the drone's own list is never handed out). */
        get waypoints() { return sorted.map(function (w) {
            return { atTick: w.atTick, pose: _copyPose(w.pose) }; }); }
    };
    return handle;
}

// ── Export ────────────────────────────────────────────────────────────────────

var CameraPath = { attach: attach, poseAt: poseAt };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CameraPath;
} else if (typeof window !== 'undefined') {
    window.CameraPath = CameraPath;
}

})();
