/* Copyright 2023-2026 by Essam Abadir */

/**
 * CameraControls.js — a REUSABLE first-person-game-style camera-controls sugar
 * object. ANY 3D experiment page drops
 * it in with ONE call; it drives the existing `runner.cameraControl` capability
 * (the camera-as-sugar / BYO-renderer pattern — `getCameraControl()` →
 * `look({spin,pitch})` ROTATES, `move({forward,strafe})` TRANSLATES) with two
 * on-screen joysticks + arrow/WASD keys.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `CameraControls.attach(runner, mountEl, opts) → handle`
 *
 *   @param {object} runner  — an FrqtlApp. The ONLY coupling: it reads
 *     `runner.cameraControl` (the OPTIONAL camera sugar handle the active
 *     renderer provider exposes via `getCameraControl()`). The pads mount only
 *     for a camera that DECLARES an angular axis — `OrbitBag.hasAngularPose(cam)`
 *     (compat/renderer/orbit-bag.js), asked of the handle's own `poseFields`. The
 *     2D p5 camera is a real handle too (`{distance, target}`, no look/move), so
 *     handle presence is never the test. NO renderer-sniffing, NO engine, NO
 *     per-page coupling — the object knows nothing about which experiment mounts it.
 *   @param {HTMLElement} mountEl — the container the two joystick pads are
 *     absolutely positioned within (typically the experiment's canvas wrapper).
 *     Its `position` is set to `relative` while attached if it is `static`
 *     (restored on dispose) so the pads anchor to it.
 *   @param {object} [opts]
 *     @param {{azimuth?:number,elevation?:number,distance?:number}} [opts.initialOrbit]
 *       — applied to the camera at attach (via setOrbit) so the page keeps its
 *       default framing. Omitted ⇒ the camera's CURRENT `getOrbit()` is kept.
 *       CALLER CONTRACT: name ONLY axes the TARGET camera declares. Every camera
 *       publishes its own axes as `cameraControl.poseFields` (the CameraPath idiom:
 *       ask what axes EXIST, never what mode the camera is in); an axis the camera
 *       does not declare FAILS LOUD inside `setOrbit` (by design, at the provider
 *       that owns the axes). A flat camera never gets this far — attach() mounts
 *       nothing for it (see the handle below). This
 *       widget deliberately does not re-validate or filter the bag: a second
 *       enumeration of the pose vocabulary here would be a schema mirror, and
 *       silently dropping an axis the caller asked for is the failure mode
 *       CameraPath's own check exists to prevent. Derive the bag from
 *       `poseFields`; do not hand the same literal to every camera.
 *     @param {number} [opts.lookSpeed=90]   — deg/sec of screen-relative ROTATION
 *       at full LOOK-stick deflection (and full arrow-key hold): x spins (roll),
 *       y pitches. Forwarded to `cameraControl.look()`; this widget integrates no
 *       angles of its own.
 *     @param {number} [opts.moveRate=0.6]   — TRANSLATION rate at full MOVE-stick
 *       deflection (and full WASD hold), on both the walk and strafe axes, as a
 *       FRACTION OF THE CURRENT ORBIT DISTANCE per second. Scale-invariant on
 *       purpose — the same pad has to feel right in a 600-px scene and a 3000-px
 *       one, exactly like the camera presets scale distance to the scene.
 *     @param {number} [opts.dollySpeed=900] — world-px/sec of distance change used
 *       ONLY as the fallback walk for a provider whose cameraControl exposes no
 *       `move()` translate primitive (see the mapping note below).
 *     @param {number} [opts.wheelStep=60]   — world-px of distance per wheel notch
 *       (wheel/pinch zoom on mountEl). Set 0 to disable wheel zoom.
 *     @param {number} [opts.minDistance=20] — dolly/zoom clamp (near).
 *     @param {number} [opts.maxDistance=12000] — dolly/zoom clamp (far).
 *     @param {boolean} [opts.keyboard=true] — bind arrow + WASD keys. When on,
 *       `mountEl` is made focusable (tabindex -1) and focused on attach + on any
 *       pointer interaction with the canvas, so REAL key presses (which are only
 *       delivered to this iframe while it holds focus) reach the handler — the
 *       natural "click the canvas, then the keys drive it" behavior. (tabindex is
 *       restored on dispose.)
 *     @param {Window|HTMLElement} [opts.keyboardTarget=window] — where key
 *       listeners attach. Default `window` receives the bubbled keydown once the
 *       focused mount (inside the iframe) delivers it; also lets a headless test
 *       dispatch synthetic events straight at window.
 *     @param {boolean} [opts.joysticks=true] — render the two on-screen pads.
 *     The camera's WHOLE `getOrbit()` bag is published continuously: every NUMERIC field
 *       of it is stamped as `data-cam-<field>` on the control container
 *       (`data-role="camera-controls"`). The bag is FERRIED, never re-listed: a
 *       hand-written {azimuth,elevation,distance} triple here would have silently
 *       dropped `roll` the moment the camera declared it.
 *   @returns {{
 *     dispose():void,               // remove pads + listeners + rAF, restore mountEl
 *     getState():object,            // the camera's whole orbit bag
 *     setState(spec):void,          // apply an orbit-bag PATCH to the camera + publish
 *     sync():void,                  // re-read the camera's orbit into the hook (e.g. after an external setOrbit)
 *     mounted:boolean               // false when the camera declares no angular axis (FAIL-SOFT no-op)
 *   }} handle. When the camera declares no angular axis (the 2D p5 camera) or there
 *   is no camera handle at all, NOTHING mounts and a no-op handle (`mounted:false`,
 *   all methods safe) is returned — every caller, including an unconditional
 *   walkthrough-rung attach, is right in 2D by construction.
 *
 * ── Input mapping — the STANDARD FPS SPLIT ───────────────────────────────────
 *   The two pads are the two halves of a first-person camera and they do NOT
 *   overlap: LOOK rotates, MOVE translates. MOVE never rotates.
 *     LOOK pad (bottom-RIGHT) — ROTATION ONLY, and it is SCREEN-RELATIVE.
 *       x → SPIN about the view axis (the picture ROLLS — the horizon tilts).
 *       y → PITCH about screen-right (the view tilts up/down at a FIXED radius).
 *       Both are forwarded as DELTAS to `cameraControl.look({spin, pitch})`.
 *       Azimuth is no longer driven directly: spin + pitch generate the whole
 *       rotation group (roll 90° then pitch IS yaw), so azimuth is DERIVED by the
 *       provider's decomposition. There is no elevation clamp — pitching over the
 *       pole is legal, which is what makes any view reachable.
 *     MOVE pad (bottom-LEFT)  — TRANSLATION ONLY, via `cameraControl.move()`.
 *       y → walk forward/back along the view direction (up = into the picture,
 *           so objects grow) · x → strafe left/right along screen-right. MOVE is
 *           ALWAYS screen-relative: walking forward while pitched down DESCENDS
 *           (fly, not FPS ground-walk).
 *     Arrow keys  → mirror the LOOK pad  (←/→ spin/roll, ↑/↓ pitch).
 *     W/A/S/D     → mirror the MOVE pad  (W/S walk, A/D strafe).
 *     Wheel/pinch → dolly (distance), independent of the pads.
 *   THE STICKS ONLY EVER FLY THE CAMERA — in every state, with nothing selected, an
 *   object aimed at, or an object grabbed. There is no object-drive branch: a
 *   grabbed object follows the camera because the runner carries it on the camera's
 *   own pose notice (`addPoseListener`), not because a stick is routed to it.
 *     Space       → `runner.grabToggle()` — the aim's grab/place key (STUDIO's
 *                   stationary reticle).
 *                   Ignored while typing (INPUT/TEXTAREA/SELECT/contenteditable) and
 *                   on key auto-repeat; a no-op while the runner's aim is off.
 *   A state label above the pads (`data-role="aim-state"`) reads the runner's aim
 *   state (roaming / grab-ready / grabbed) while the aim is armed.
 *   All the geometry lives at the ONE camera authority (the provider's
 *   `getCameraControl()` handle: `look` rotates, `move` translates) — this object
 *   re-derives NO orbit math and integrates NO angles. A BYO provider whose handle
 *   omits `look()` / `move()` is capability-checked by that absence: the affected
 *   axis becomes a defined NO-OP (walk falls back to a dolly), never a substituted
 *   different rotation.
 *   Drive is CONTINUOUS while a pad is held or a key is down (a single rAF loop
 *   integrates the current input each frame; it idles — no rAF scheduled — when
 *   no input is active, and is torn down on dispose).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *   ZERO physics (canonical-bench SU1). This is an OUTPUT-BOUNDARY view control:
 *   it only re-points the camera through the renderer's `setOrbit` sugar; it never
 *   touches the engine, a frame, a dimension, or emission. Toggling / driving it
 *   leaves every physics golden byte-identical — the same guarantee the camera
 *   preset dropdown it replaces already had (rendering is downstream of doTick()).
 */

import * as OrbitBag from '../compat/renderer/orbit-bag.js';


    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }



    // No-op handle returned when the camera declares no angular axis (the 2D p5
    // camera) or there is no camera. All methods are safe to call.
    function noopHandle() {
        return {
            mounted: false,
            dispose: function () {},
            getState: function () { return null; },
            setState: function () {},
            sync: function () {}
        };
    }

    function attach(runner, mountEl, opts) {
        opts = opts || {};

        // ── CAPABILITY CHECK (FAIL-SOFT) ─────────────────────────────────────
        // The pads are the ANGULAR affordance: they mount only for a camera whose own
        // poseFields declare an angular axis (OrbitBag.hasAngularPose — the ONE 3D-ness
        // predicate). A flat camera (2D p5: {distance, target}, no look/move) would get
        // a LOOK pad with no live axis. Never a renderer sniff, never handle presence.
        // That predicate is the ONLY no-op exit: an angular camera that cannot set or read
        // its pose breaks the camera contract and throws.
        var cam = (runner && runner.cameraControl) ? runner.cameraControl : null;
        if (!OrbitBag.hasAngularPose(cam)) { return noopHandle(); }
        if (typeof cam.setOrbit !== 'function' || typeof cam.getOrbit !== 'function') {
            throw new Error('[CameraControls] the camera declares angular axes but its handle has no ' +
                'setOrbit()/getOrbit() — every getCameraControl() handle sets and reads its pose ' +
                '(RENDERER_CONTRACT §1a.2). (FAIL-LOUD.)');
        }

        // ── IDEMPOTENT per mountEl (F4) ──────────────────────────────────────
        // A second attach() on the SAME container returns the LIVE instance instead of
        // stacking a second pad set + a second window keydown listener. This kills the
        // double-mount race for EVERY caller — a page that wires its own joysticks
        // (a walkthrough rung) AND STUDIO's host mount (F2) both target the same
        // #canvas-wrapper, and whichever runs second must be a no-op. Ordering-
        // independent: no reliance on the host's DOM-timing guard. The marker is cleared
        // in dispose(), so a re-attach after dispose mounts fresh.
        if (mountEl && mountEl.__frqtlCameraHandle && mountEl.__frqtlCameraHandle.mounted) {
            return mountEl.__frqtlCameraHandle;
        }
        // ...and per RUNNER: one runner has one camera controller. A host that mounted the pads before the scene
        // could (STUDIO: the sizeless page builds before its runner has a control host), then a re-run in the same
        // document (a fork, setDeclared) that reaches the scene's own attach with another container, gets the live one.
        if (runner.__frqtlCameraHandle && runner.__frqtlCameraHandle.mounted) {
            return runner.__frqtlCameraHandle;
        }

        var doc = (mountEl && mountEl.ownerDocument) ? mountEl.ownerDocument
                : (typeof document !== 'undefined' ? document : null);

        var lookSpeed  = (typeof opts.lookSpeed  === 'number') ? opts.lookSpeed  : 90;
        var moveRate   = (typeof opts.moveRate   === 'number') ? opts.moveRate   : 0.6;
        var dollySpeed = (typeof opts.dollySpeed === 'number') ? opts.dollySpeed : 900;
        // Capability check for TRANSLATION (the getCameraControl precedent — the
        // presence of the method IS the check, never a renderer sniff). A provider
        // without move() still gets forward/back as a dolly; its strafe axis is a
        // no-op, because MOVE must never rotate.
        var canTranslate = (typeof cam.move === 'function');
        // Capability check for screen-relative ROTATION, the same idiom: the
        // presence of the method IS the check. A provider without look() gets a
        // defined NO-OP on the LOOK pad — never a substituted azimuth/elevation
        // integration here, which would put orbit geometry back in the widget.
        var canLook = (typeof cam.look === 'function');
        var wheelStep  = (typeof opts.wheelStep  === 'number') ? opts.wheelStep  : 60;
        var minDist    = (typeof opts.minDistance === 'number') ? opts.minDistance : 20;
        var maxDist    = (typeof opts.maxDistance === 'number') ? opts.maxDistance : 12000;
        var useKeyboard = opts.keyboard !== false;
        var kbTarget   = opts.keyboardTarget || (doc ? doc.defaultView : null);
        var useJoysticks = opts.joysticks !== false;


        // ── Seed the camera framing ──────────────────────────────────────────
        if (opts.initialOrbit) { cam.setOrbit(opts.initialOrbit); }

        // ── Realm hook + data-attr publishing ────────────────────────────────
        var container = null;
        function publishState() {
            // FERRY the whole bag — never a hand-listed {azimuth,elevation,distance}
            // triple. The retired hand list would have silently omitted `roll` from
            // both the realm hook and the data attrs the moment the camera declared
            // it: the schema-mirror failure mode in miniature — the datum exists,
            // one consumer sees it, another does not.
            var o = cam.getOrbit();

            if (container) {
                for (var k in o) {
                    if (!Object.prototype.hasOwnProperty.call(o, k)) { continue; }
                    // Numeric pose axes become data-cam-<axis>; `target` is an object
                    // (the walked centre), read off the hook instead.
                    if (typeof o[k] !== 'number') { continue; }
                    container.setAttribute('data-cam-' + k.toLowerCase(),
                        String(Math.round(o[k] * 100) / 100));
                }
            }
            return o;
        }

        // ── Live input state (joystick vectors + held keys), integrated by rAF ─
        // Each vector component is in [-1, 1]; keyboard contributes ±1 additively.
        var jMove = { x: 0, y: 0 };   // MOVE pad
        var jLook = { x: 0, y: 0 };   // LOOK pad
        var keys  = {};               // keyCode → true while held

        function keyMove() {
            var x = 0, y = 0;
            if (keys.KeyA) { x -= 1; } if (keys.KeyD) { x += 1; }   // strafe left/right
            if (keys.KeyW) { y += 1; } if (keys.KeyS) { y -= 1; }   // walk forward/back
            return { x: x, y: y };
        }
        function keyLook() {
            var x = 0, y = 0;
            if (keys.ArrowLeft)  { x -= 1; } if (keys.ArrowRight) { x += 1; }  // spin (roll)
            if (keys.ArrowUp)    { y += 1; } if (keys.ArrowDown)  { y -= 1; }  // pitch
            return { x: x, y: y };
        }

        function anyInputActive() {
            if (jMove.x || jMove.y || jLook.x || jLook.y) { return true; }
            for (var k in keys) { if (keys[k]) { return true; } }
            return false;
        }

        // ── The single rAF integration loop ──────────────────────────────────
        var rafId = null;
        var lastT = 0;
        var nowFn = (typeof performance !== 'undefined' && performance.now)
            ? function () { return performance.now(); } : function () { return Date.now(); };
        var rAF = (typeof requestAnimationFrame === 'function')
            ? requestAnimationFrame : function (cb) { return setTimeout(function () { cb(nowFn()); }, 16); };
        var cAF = (typeof cancelAnimationFrame === 'function')
            ? cancelAnimationFrame : clearTimeout;

        // A stick/key/wheel step changes what the frame SHOWS — the camera pose, and with it
        // a grabbed object the runner carries. A running loop paints every frame; a STOPPED one
        // (STUDIO Design) paints only when asked, so ask the runner for one repaint of the
        // CURRENT state. repaint() never advances the tick clock — no physics.
        function paintIfStopped() {
            if (runner && !runner.isRunning && typeof runner.repaint === 'function') { runner.repaint(); }
        }

        function frame(t) {
            rafId = null;
            var dt = (t - lastT) / 1000;
            lastT = t;
            if (dt <= 0) { dt = 0.016; }
            if (dt > 0.1) { dt = 0.1; }   // clamp long gaps (tab switch)

            var km = keyMove(), kl = keyLook();
            // Combine pad + keyboard, clamped to a unit deflection per channel.
            var lookX = clamp(jLook.x + kl.x, -1, 1);   // spin  (roll, about the view axis)
            var lookY = clamp(jLook.y + kl.y, -1, 1);   // pitch (about screen-right)
            var moveX = clamp(jMove.x + km.x, -1, 1);   // strafe (translation, screen-right)
            var moveY = clamp(jMove.y + km.y, -1, 1);   // walk   (translation, into the picture)

            var o = cam.getOrbit();
            // ── THE FPS SPLIT (screen-relative) ──────────────────────────────
            // LOOK = rotation ONLY, and the widget COMPOSES NOTHING: it hands the
            //        provider a screen-relative DELTA (spin about the view axis,
            //        pitch about screen-right) and the ONE camera authority does
            //        the compose -> rotate -> decompose. The old widget-side
            //        `az/el += rate*dt` integration is DELETED: three Euler angles
            //        applied in a fixed order do NOT compose the way successive
            //        screen-relative rotations do, so integrating them here could
            //        not express a rolled pitch at all.
            // MOVE = translation ONLY (y = walk along the view direction, x =
            //        strafe along screen-right). MOVE never contributes rotation —
            //        that was the mis-wire where BOTH pads orbited when grabbed
            //        sideways.
            if (canLook && (lookX || lookY)) {
                cam.look({ spin: lookX * lookSpeed * dt, pitch: lookY * lookSpeed * dt });
            }
            if (moveX || moveY) {
                if (canTranslate) {
                    // SCALE-INVARIANT walk: a step is a FRACTION of how far away the
                    // camera currently is, the same way the presets scale distance to
                    // the scene. A fixed px/sec felt right in one scene and walked
                    // clean out of a smaller one in under two seconds.
                    var step = Math.max(o.distance, 1) * moveRate * dt;
                    cam.move({ forward: moveY * step, strafe: moveX * step });
                } else {
                    // FAIL-SOFT for a provider with no translate primitive: forward/back
                    // still reads as into/out of the picture (a dolly); strafe is a
                    // defined NO-OP rather than a rotation. ONLY distance is written —
                    // the LOOK axes are look()'s business, never smuggled in here.
                    if (moveY) {
                        cam.setOrbit({ distance: clamp(o.distance - moveY * dollySpeed * dt,
                                                       minDist, maxDist) });
                    }
                }
            }
            if (lookX || lookY || moveX || moveY) { paintIfStopped(); }
            publishState();

            if (anyInputActive()) { scheduleFrame(); }
        }
        function scheduleFrame() {
            if (rafId === null) { lastT = nowFn(); rafId = rAF(frame); }
        }

        // ── Keyboard ─────────────────────────────────────────────────────────
        var HANDLED_KEYS = {
            ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
            KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1
        };
        function onKeyDown(e) {
            var code = e.code || e.key;
            // Typing never drives: no grab, no camera key, while an editable has the key.
            if ((code === 'Space' || HANDLED_KEYS[code]) && isTypingTarget(e, doc)) { return; }
            if (code === 'Space') {
                if (!runner || typeof runner.grabToggle !== 'function' || !runner.isAimArmed()) { return; }
                if (e.preventDefault) { e.preventDefault(); }   // Space is the page-scroll key
                if (e.repeat) { return; }                       // a held key toggles once
                runner.grabToggle();
                paintIfStopped();
                return;
            }
            if (!HANDLED_KEYS[code]) { return; }
            keys[code] = true;
            if (e.preventDefault) { e.preventDefault(); }   // stop arrow-key page scroll
            scheduleFrame();
        }
        function onKeyUp(e) {
            var code = e.code || e.key;
            if (!HANDLED_KEYS[code]) { return; }
            keys[code] = false;
        }
        if (useKeyboard && kbTarget && kbTarget.addEventListener) {
            kbTarget.addEventListener('keydown', onKeyDown);
            kbTarget.addEventListener('keyup', onKeyUp);
        }

        // ── Canvas focus — so REAL keyboard input reaches this iframe ─────────
        // The experiment page runs INSIDE an iframe. A real, human keydown is only
        // delivered to this window when the iframe holds focus; if the iframe body
        // never receives focus, real arrow/WASD presses fire in the PARENT document
        // and never reach onKeyDown. (The old smoke test passed only because it
        // DISPATCHED synthetic KeyboardEvents straight at window, bypassing focus.)
        // Fix: make the mount focusable and grab focus on attach + on any pointer
        // interaction with the canvas — the natural "click the game canvas, then
        // the keys drive it" behavior. Key delivery still routes through kbTarget
        // (window) via event bubbling once the mount (inside the iframe) is focused.
        var restoreTabIndex = null;
        var onMountPointerDown = null;
        function focusMount() {
            if (mountEl && typeof mountEl.focus === 'function') {
                try { mountEl.focus({ preventScroll: true }); }
                catch (e) { try { mountEl.focus(); } catch (e2) {} }
            }
        }
        if (useKeyboard && mountEl && mountEl.addEventListener) {
            if (typeof mountEl.tabIndex !== 'number' || mountEl.tabIndex < 0) {
                restoreTabIndex = (mountEl.getAttribute && mountEl.hasAttribute && mountEl.hasAttribute('tabindex'))
                    ? mountEl.getAttribute('tabindex') : false;   // false ⇒ no attr to restore
                mountEl.tabIndex = -1;                              // focusable, out of tab order
                if (mountEl.style) { mountEl.style.outline = 'none'; }
            }
            // Capture phase so this fires even when a joystick pad handles the same down.
            onMountPointerDown = function () { focusMount(); };
            mountEl.addEventListener('pointerdown', onMountPointerDown, true);
            focusMount();   // best-effort focus at attach
        }

        // ── Aim state label — what the reticle is doing, read off the runner ──────
        // Rendered from runner.getAimState() on the runner's aim notice, so it cannot disagree
        // with what SPACE does. Shown only while the aim is armed (STUDIO Design). Carries
        // data-aim-* attributes so a non-human reader (the VLA loop) reads the same state.
        var aimLabelEl = null;
        var unsubscribeAim = null;
        var AIM_TEXT = {
            'roaming':    function () { return 'ROAMING \u2014 aim the reticle at an object'; },
            'grab-ready': function (st) { return 'GRAB-READY ' + (st.hover || 'object') + ' \u2014 press SPACE to grab'; },
            'grabbed':    function (st) { return 'GRABBED ' + (st.grabbed || 'object') + ' \u2014 move the world to place it, SPACE to release'; }
        };
        function makeAimLabel() {
            var el = doc.createElement('div');
            el.setAttribute('data-role', 'aim-state');
            el.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:118px;display:none;' +
                'max-width:70%;padding:4px 8px;border-radius:4px;background:rgba(20,30,38,0.8);' +
                'border:1px solid rgba(255,170,0,0.7);color:rgba(240,240,240,0.95);' +
                'pointer-events:none;z-index:40;font:11px sans-serif;line-height:1.45;text-align:center;';
            return el;
        }
        function renderAimLabel() {
            if (!aimLabelEl) { return; }
            var st = runner.getAimState();
            aimLabelEl.setAttribute('data-aim-state', st.state);
            aimLabelEl.setAttribute('data-aim-target', st.grabbed || st.hover || '');
            aimLabelEl.setAttribute('data-aim-edge', st.atEdge ? 'true' : 'false');
            aimLabelEl.setAttribute('data-aim-heading-held', st.headingHeld ? 'true' : 'false');
            aimLabelEl.setAttribute('data-aim-z-held', st.zHeld ? 'true' : 'false');
            if (st.state === 'off') { aimLabelEl.style.display = 'none'; aimLabelEl.textContent = ''; return; }
            var lines = [AIM_TEXT[st.state](st)];
            if (st.atEdge) { lines.push('AT WORLD EDGE \u2014 held at the universe boundary'); }
            if (st.headingHeld) { lines.push('HEADING HELD \u2014 it points along the depth axis'); }
            if (st.zHeld) { lines.push('Z HELD \u2014 a flat (z-less) wall stays on the z = 0 plane'); }
            // The runner's message names what happened: a carry write that failed (the grab was
            // released) or a grab the object refused (it was never grabbed).
            if (st.error) { lines.push('NOT HELD: ' + st.error); }
            aimLabelEl.textContent = lines.join('\n');
            aimLabelEl.style.whiteSpace = 'pre-line';
            aimLabelEl.style.color = (st.state === 'grabbed') ? '#ffcc66' : 'rgba(240,240,240,0.95)';
            aimLabelEl.style.display = 'block';
        }

        // ── On-screen joystick pads ──────────────────────────────────────────
        var padEls = [];
        var padCleanups = [];        // per-pad force-release (used on dispose mid-drag)
        var restoreMountPosition = null;
        var onWheel = null;

        function makePad(side, label, vec) {
            var pad = doc.createElement('div');
            pad.setAttribute('data-role', 'camera-joystick');
            pad.setAttribute('data-stick', side === 'left' ? 'move' : 'look');
            pad.style.cssText =
                'position:absolute;bottom:16px;' + (side === 'left' ? 'left:16px;' : 'right:16px;') +
                'width:96px;height:96px;border-radius:50%;' +
                'background:rgba(20,30,38,0.55);border:1px solid rgba(126,200,227,0.5);' +
                'touch-action:none;z-index:40;box-sizing:border-box;user-select:none;' +
                '-webkit-user-select:none;cursor:grab;';
            var cap = doc.createElement('div');
            cap.textContent = label;
            cap.style.cssText =
                'position:absolute;top:4px;left:0;right:0;text-align:center;' +
                'color:rgba(126,200,227,0.85);font:10px sans-serif;pointer-events:none;';
            var knob = doc.createElement('div');
            knob.setAttribute('data-role', 'camera-joystick-knob');
            knob.style.cssText =
                'position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;' +
                'border-radius:50%;background:rgba(126,200,227,0.85);pointer-events:none;' +
                'transition:transform 0.06s linear;';
            pad.appendChild(cap); pad.appendChild(knob);

            var R = 48;          // pad radius (px); knob travels within it
            var activePointer = null;
            function setFromEvent(e) {
                var rect = pad.getBoundingClientRect();
                var cx = rect.left + rect.width / 2;
                var cy = rect.top + rect.height / 2;
                var dx = (e.clientX - cx);
                var dy = (e.clientY - cy);
                // Normalize to [-1,1]; invert y so "up" is +1 (screen y grows down).
                var nx = clamp(dx / R, -1, 1);
                var ny = clamp(-dy / R, -1, 1);
                vec.x = nx; vec.y = ny;
                knob.style.transform = 'translate(' + (nx * (R - 17)) + 'px,' + (-ny * (R - 17)) + 'px)';
                scheduleFrame();
            }
            // A REAL mouse/touch drag routinely leaves the 96 px pad. Relying on the
            // pad's own pointermove (+ setPointerCapture) is fragile — capture can be
            // silently lost, and without it a pointer outside the pad stops firing pad
            // events, so the drag "dies" and the camera never moves. Instead we track
            // the drag at the DOCUMENT level for its whole lifetime (attached on down,
            // detached on release), which works regardless of where the pointer goes or
            // whether capture is honored. setPointerCapture stays as a harmless bonus.
            var onDocMove = null, onDocUp = null;
            function detachDoc() {
                if (doc && doc.removeEventListener) {
                    if (onDocMove) { doc.removeEventListener('pointermove', onDocMove); }
                    if (onDocUp) {
                        doc.removeEventListener('pointerup', onDocUp);
                        doc.removeEventListener('pointercancel', onDocUp);
                    }
                }
                onDocMove = null; onDocUp = null;
            }
            function release() {
                if (pad.releasePointerCapture && activePointer !== null) {
                    try { pad.releasePointerCapture(activePointer); } catch (err) {}
                }
                activePointer = null;
                vec.x = 0; vec.y = 0;
                knob.style.transform = 'translate(0px,0px)';
                pad.style.cursor = 'grab';
                detachDoc();
            }
            pad.addEventListener('pointerdown', function (e) {
                activePointer = e.pointerId;
                pad.style.cursor = 'grabbing';
                focusMount();   // clicking a joystick focuses the canvas ⇒ keys work too
                if (pad.setPointerCapture) { try { pad.setPointerCapture(e.pointerId); } catch (err) {} }
                // Document-level drag tracking for the life of this gesture.
                onDocMove = function (ev) { if (activePointer === ev.pointerId) { setFromEvent(ev); } };
                onDocUp = function (ev) { if (activePointer === ev.pointerId) { release(); } };
                if (doc && doc.addEventListener) {
                    doc.addEventListener('pointermove', onDocMove);
                    doc.addEventListener('pointerup', onDocUp);
                    doc.addEventListener('pointercancel', onDocUp);
                }
                setFromEvent(e);
                if (e.preventDefault) { e.preventDefault(); }
            });
            padCleanups.push(function () { release(); });
            return pad;
        }

        if (useJoysticks && doc && mountEl) {
            // Anchor pads to mountEl.
            var computed = (doc.defaultView && doc.defaultView.getComputedStyle)
                ? doc.defaultView.getComputedStyle(mountEl).position : mountEl.style.position;
            if (computed === 'static' || !computed) {
                restoreMountPosition = mountEl.style.position || '';
                mountEl.style.position = 'relative';
            }
            container = doc.createElement('div');
            container.setAttribute('data-role', 'camera-controls');
            container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:39;';
            // Pads themselves re-enable pointer events (container passes clicks through
            // to the canvas everywhere else).
            var movePad = makePad('left',  'MOVE', jMove);
            var lookPad = makePad('right', 'LOOK', jLook);
            movePad.style.pointerEvents = 'auto';
            lookPad.style.pointerEvents = 'auto';
            container.appendChild(movePad);
            container.appendChild(lookPad);
            mountEl.appendChild(container);
            padEls = [movePad, lookPad];
            if (runner && typeof runner.addAimListener === 'function') {
                aimLabelEl = makeAimLabel();
                container.appendChild(aimLabelEl);
                unsubscribeAim = runner.addAimListener(renderAimLabel);
                renderAimLabel();
            }

            // Wheel/pinch zoom on the mount surface (dolly), independent of the pads.
            if (wheelStep > 0) {
                onWheel = function (e) {
                    var o = cam.getOrbit();
                    var di = clamp(o.distance + (e.deltaY > 0 ? 1 : -1) * wheelStep, minDist, maxDist);
                    cam.setOrbit({ distance: di });
                    paintIfStopped();
                    publishState();
                    if (e.preventDefault) { e.preventDefault(); }
                };
                mountEl.addEventListener('wheel', onWheel, { passive: false });
            }
        }

        // Publish once so the hook is live immediately (headless can read it
        // before any drive).
        publishState();

        // ── Handle ───────────────────────────────────────────────────────────
        var liveHandle = {
            mounted: true,
            dispose: function () {
                // F4: release the idempotency marker so a later attach() mounts fresh.
                if (mountEl && mountEl.__frqtlCameraHandle === liveHandle) {
                    mountEl.__frqtlCameraHandle = null;
                }
                if (runner.__frqtlCameraHandle === liveHandle) { runner.__frqtlCameraHandle = null; }
                if (rafId !== null) { cAF(rafId); rafId = null; }
                // Force-release any in-flight joystick drag (detaches its doc listeners).
                for (var i = 0; i < padCleanups.length; i++) {
                    try { padCleanups[i](); } catch (e) {}
                }
                padCleanups = [];
                if (useKeyboard && kbTarget && kbTarget.removeEventListener) {
                    kbTarget.removeEventListener('keydown', onKeyDown);
                    kbTarget.removeEventListener('keyup', onKeyUp);
                }
                if (onMountPointerDown && mountEl && mountEl.removeEventListener) {
                    mountEl.removeEventListener('pointerdown', onMountPointerDown, true);
                }
                if (restoreTabIndex !== null && mountEl) {
                    if (restoreTabIndex === false) {
                        if (mountEl.removeAttribute) { mountEl.removeAttribute('tabindex'); }
                    } else if (mountEl.setAttribute) {
                        mountEl.setAttribute('tabindex', restoreTabIndex);
                    }
                }
                if (onWheel && mountEl && mountEl.removeEventListener) {
                    mountEl.removeEventListener('wheel', onWheel);
                }
                if (unsubscribeAim) { unsubscribeAim(); unsubscribeAim = null; }
                aimLabelEl = null;
                if (container && container.parentNode) { container.parentNode.removeChild(container); }
                if (restoreMountPosition !== null && mountEl) { mountEl.style.position = restoreMountPosition; }
                padEls = [];
                container = null;
            },
            getState: function () { return cam.getOrbit(); },
            setState: function (spec) { cam.setOrbit(spec); publishState(); },
            sync: function () { publishState(); }
        };
        // F4: mark the container as owning this live instance (idempotency guard above).
        if (mountEl) { mountEl.__frqtlCameraHandle = liveHandle; }
        runner.__frqtlCameraHandle = liveHandle;
        return liveHandle;
    }

    // ── Export ──────────────────────────────────────────────────────────────
    /**
     * isTypingTarget(e, doc) — THE "is the user typing" predicate (one owner): true when the key
     * event's target, or the document's focused element (Monaco types into a hidden textarea while
     * the event lands on the body), is an INPUT / TEXTAREA / SELECT or contenteditable. Every key
     * binding that must not fire while typing asks THIS — the camera's Space + WASD/arrows here,
     * STUDIO's Delete/Backspace in the parent document.
     * @param {{target?:Element}} e @param {Document|null} doc @returns {boolean}
     */
    function _isEditable(el) {
        var tag = el && el.tagName;
        return !!el && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true);
    }
    function isTypingTarget(e, doc) {
        return _isEditable(e && e.target) || !!(doc && _isEditable(doc.activeElement));
    }

    var CameraControls = { attach: attach, isTypingTarget: isTypingTarget };

    export { CameraControls };

