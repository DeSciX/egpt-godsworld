/* Copyright 2023-2026 by Essam Abadir */

/**
 * directedRedirectProgram.js — the "option1" host-trig redirect (DIRECTED TUNNEL
 * BUILD, 2026-07-13).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * The report's measured verdict (§2, path (c)): the ONLY way to give an in-tunnel
 * collision the emitter's own true circular-isotropic trig ability is to keep
 * EJECT in-engine (as every existing liner already does via BLOCK) and have the
 * HOST tick-loop read `TickData.objects[handle].frames` between ticks and write
 * back `vx`/`vy` via `setFrameProperty` — measured zero (or bounded ≤1px) extra
 * latency vs a native mechanism, because collision detection is itself
 * post-move within Phase C, so both an in-engine `set` and a host `setFrameProperty`
 * can only affect motion starting the tick AFTER detection regardless of mechanism.
 *
 * This is a HOST TICK-FN COMPONENT in the SAME sense as `emitterProgram.js` — an
 * engine-agnostic function composed entirely from generic primitives
 * (`universe.random()`, `universe.setFrameProperty()`), NOT a native op-program (the
 * op-vocabulary's `FN_NAMES` has no `cos`/`sin` — theorist-established FN_NAMES gap,
 * report §2(b)). UNLIKE `emitterProgram.js` (which registers itself onto
 * `universe.experimentTickFunctions` and runs during Phase A, BEFORE that tick's own
 * collision/collect), this component must run AFTER `doTick()` returns — it needs
 * THIS tick's `TickData.objects[handle].frames`, which does not exist until Phase D
 * completes. `buildRedirectApplier` therefore returns a plain function the CALLER
 * (an experiment page's own `onTick`, or a setup factory's return value the caller
 * invokes) calls ONCE per tick with that tick's `tickData` — mirroring how
 * `DetectorWall.prototype.getCollisionHistogram(tickData)` is called.
 *
 * @param {Object} universe - engine universe exposing random()/setFrameProperty().
 * @param {Object} spec
 * @param {Array<number>} spec.wallHandles - LargeObject handles whose collected
 *   frames (`tickData.objects[handle].frames`) get redirected each call. Each wall
 *   MUST have been constructed with `collectCollided:true` (Tube's own opt-in param)
 *   — otherwise `tickData.objects[handle].frames` is simply absent/empty and this
 *   applier is a silent (correct) no-op for that handle.
 * @param {number} spec.angleRad - the directed redirect angle, RADIANS (the
 *   direction "the tunnel DIRECTS TOWARDS" — honored EXACTLY, never snapped; only
 *   the tunnel BODY snaps to an axis-aligned orientation — see DirectedTunnel.js).
 * @param {number} [spec.spreadRad=0] - isotropic-spread sub-option (AZIMUTH,
 *   the XY-plane angle): each redirected frame's actual azimuth is
 *   `angleRad + (random()*2-1)*spreadRad` — a uniform draw in
 *   `[angleRad-spreadRad, angleRad+spreadRad]`. `0` (default) = fully directed,
 *   zero spread (every redirected frame gets the EXACT same angle) — byte-identical
 *   opt-out for a pure-directed beam.
 * @param {number} [spec.polarSpreadRad=0] - 3D EXTENSION (ws-dse-3d, theorist §4
 *   option (c) — "extend the redirect to draw a direction on the unit SPHERE,
 *   azimuth + polar"): an independent isotropic-spread draw for the POLAR angle
 *   (elevation out of the XY plane), `phi = (random()*2-1)*polarSpreadRad`. `0`
 *   (default) = byte-identical to the pre-3D behavior — `phi` stays exactly `0`
 *   (`cos(0)=1, sin(0)=0` exactly in IEEE754), so `vx`/`vy` are UNCHANGED and NO
 *   `vz` `setFrameProperty` call happens at all (never even the RNG draw — a 2D
 *   tunnel's redirect never touches a 3rd axis). Non-zero (a caller with real
 *   z-containment armed) makes the redirected direction genuinely 3D — closes the
 *   "the laserBeam path only ever writes 2 axes" gap (DirectedTunnel's `option1`
 *   previously flattened every redirected quantum into the XY plane regardless of
 *   the tunnel's own z-containment).
 * @param {number|null} [spec.speed=null] - redirected speed magnitude. `null`
 *   (default) preserves the frame's OWN incoming speed (`sqrt(vx^2+vy^2)`, falling
 *   back to 1 if the frame arrived with zero velocity) — a reflection-style
 *   redirect that changes DIRECTION only. A finite number forces every redirected
 *   frame to the SAME speed (a collimating/laser-style redirect).
 * @returns {Function} `applyRedirect(tickData)` — call once per tick, AFTER
 *   `doTick()` returns that tick's `tickData`.
 */
(function () {
    'use strict';

    function buildRedirectApplier(universe, spec) {
        spec = spec || {};
        var wallHandles = spec.wallHandles || [];
        var angleRad = spec.angleRad;
        if (typeof angleRad !== 'number' || !isFinite(angleRad)) {
            throw new Error('[directedRedirectProgram] spec.angleRad must be a finite number (radians).');
        }
        var spreadRad = (spec.spreadRad !== undefined && spec.spreadRad !== null) ? spec.spreadRad : 0;
        var polarSpreadRad = (spec.polarSpreadRad !== undefined && spec.polarSpreadRad !== null) ? spec.polarSpreadRad : 0;
        var fixedSpeed = (spec.speed !== undefined) ? spec.speed : null;

        return function applyRedirect(tickData) {
            if (!tickData || !tickData.objects) { return; }
            for (var w = 0; w < wallHandles.length; w++) {
                var entry = tickData.objects[wallHandles[w]];
                if (!entry || !Array.isArray(entry.frames)) { continue; }
                var frames = entry.frames;
                for (var i = 0; i < frames.length; i++) {
                    var fd = frames[i];
                    var theta = angleRad; // azimuth (XY-plane angle)
                    if (spreadRad) {
                        theta += (universe.random() * 2 - 1) * spreadRad; // draw — host trig, path (c)
                    }
                    var speed = (fixedSpeed !== null)
                        ? fixedSpeed
                        : (Math.sqrt(fd.vx * fd.vx + fd.vy * fd.vy) || 1);
                    // 3D EXTENSION (ws-dse-3d): phi (polar, elevation out of the XY
                    // plane) draws ONLY when polarSpreadRad is non-zero — otherwise
                    // phi stays exactly 0, making this byte-identical to the pre-3D
                    // 2-axis formula (cos(0)=1 -> vx=cos(theta)*speed,
                    // sin(0)=0 -> vz=0, never written).
                    var phi = 0;
                    if (polarSpreadRad) {
                        phi = (universe.random() * 2 - 1) * polarSpreadRad; // unit-sphere draw — host trig, path (c)
                    }
                    var vx = Math.cos(theta) * Math.cos(phi) * speed;
                    var vy = Math.sin(theta) * Math.cos(phi) * speed;
                    var vz = Math.sin(phi) * speed;
                    // fd.id is ALREADY the quantum_id (Rust FrameData's own `id` field —
                    // NOT a raw FrameId handle; unlike a fresh emission from makeLeafFrame,
                    // a COLLECTED tickData frame needs no getFrameQuantumId() conversion).
                    universe.setFrameProperty(fd.id, 'vx', vx);
                    universe.setFrameProperty(fd.id, 'vy', vy);
                    if (polarSpreadRad) { universe.setFrameProperty(fd.id, 'vz', vz); }
                }
            }
        };
    }

    var api = { buildRedirectApplier: buildRedirectApplier };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        window.DirectedRedirectProgram = api;
    }

})();
