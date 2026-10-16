/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-hand-tool.js — the HUMAN'S HAND in Maxi's Lab: STUDIO's pick-up and drag-and-drop semantics
 * over the published SDK runner, sharing Maxi's ONE position write.
 *
 * It lives in the LAB document (app.html) and reaches into the scene frame's DOM (same origin):
 * the hands (maxi-hands.js) run in the lab document, so one module instance owns `writePosition`
 * for Maxi AND the human — a human drag shows up in Maxi's next `inventory` because it IS the
 * same write. A copy of this inside the scene document would be a second module instance.
 *
 * Which semantics apply is the RUNNER'S rule, not a renderer-name test: `setAimArmed(true)` arms
 * only when the camera has an angular pose (OrbitBag.hasAngularPose, the runner's own predicate),
 * so `runner.isAimArmed()` after arming says "3D" — and then the hand is the runner's own aim +
 * SPACE grab + camera (bound by the package's CameraControls on the scene window): this module adds
 * no 3D drag, it only makes that state visible (outline + status) and writes the drop (SPACE, or Esc
 * while carrying) through the one write. Unarmed = 2D: hover → outline,
 * pointerdown on a declared object → select (runner.pickObjectAtScreen with the canvas's CSS size,
 * runner.setSelectHighlight), drag → the object follows the pointer through the renderer's OWN
 * screenToWorld (the 2D camera pans and zooms: CSS px are never world px), pointerup → release.
 * Every drag write is followed by the runner's own repaint() (STUDIO's semantics), so a drag on a
 * PAUSED world shows at once.
 *
 * What the pointer hits is resolved to the DECLARED object it belongs to (runner.declaredOf): only
 * what the scene declared moves; anything else is outlined and refuses, naming why — as does a
 * declared object with no position authority (runner.positionAuthorityOf null). The move is the
 * object's centre (runner.centerOf at pick-up) plus the pointer's world delta, written through
 * writePosition from maxi-hands.js (→ runner.placeDeclaredAt) and confined to the world's published
 * bounds (runner.getUniverseBounds), as STUDIO's carry confines its device; the outline is the box
 * the runner reports (runner.envelopeOf). There is no rect arithmetic here
 * (scripts/test/hand-tool.test.mjs is red if a second write appears). Everything missing — no runner,
 * no screenToWorld, no screenPointOf — THROWS a named error, which the lab paints in its error bar;
 * nothing here goes quiet.
 */

import { writePosition } from './maxi-hands.js';

/** The keys the lab binds (on its own window and on the scene window). */
export const HAND_KEYS = Object.freeze({ toggle: 'KeyH', leave: 'Escape' });

/** The status-line text per hand state — ONE table, read by the lab and by the tests. */
export const HAND_STATUS = Object.freeze({
    off: 'hand off (H)',
    '2d': 'HAND: hover an object, press and drag to move it · Esc leaves',
    '3d': 'HAND: aim, SPACE to grab, move the camera (WASD / arrows), SPACE to drop · Esc leaves'
});

const OUTLINE_ROLE = 'hand-outline';

function isEditable(el) {
    const tag = el && el.tagName;
    return !!el && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true);
}

/** True when a keydown should toggle/leave the hand; the lab calls this from both windows. */
export function handKeyAction(ev) {
    if (!ev || isEditable(ev.target)) { return null; }
    const code = ev.code || ev.key;
    if (code === HAND_KEYS.toggle) { return 'toggle'; }
    if (code === HAND_KEYS.leave) { return 'leave'; }
    return null;
}

/**
 * Attach the hand to one booted scene.
 * @param {{runner:object, host:Element, win:Window, onError:function, onChange?:function}} spec
 *   runner — the FrqtlApp the scene document booted; host — the scene's mount element (#canvas-wrapper);
 *   win — the scene window; onError(err) — the lab's error bar; onChange(state) — status refresh.
 * @returns {{set(on:boolean):object, toggle():object, state():object, dispose():void, get enabled():boolean}}
 */
export function attachHandTool(spec) {
    if (!spec || !spec.runner || typeof spec.runner.pickObjectAtScreen !== 'function' || typeof spec.runner.setSelectHighlight !== 'function') {
        throw new Error('[hand] no runner: attachHandTool needs the booted FrqtlApp (pickObjectAtScreen / setSelectHighlight) — the scene has not booted.');
    }
    if (!spec.host || typeof spec.host.addEventListener !== 'function') {
        throw new Error('[hand] no mount: attachHandTool needs the scene\'s #canvas-wrapper element.');
    }
    if (typeof spec.onError !== 'function') {
        throw new Error('[hand] attachHandTool needs onError(err) — the lab\'s error bar; a hand error has nowhere else to go.');
    }
    const runner = spec.runner;
    const host = spec.host;
    const win = spec.win;
    const onError = spec.onError;
    const onChange = typeof spec.onChange === 'function' ? spec.onChange : function () {};

    const st = {
        on: false, mode: 'off',           // 'off' | '2d' | '3d'
        hover: null,                      // name under the pointer (2D) or under the aim (3D)
        held: null,                       // 2D: the object being dragged {name, obj, startCenter, pw0, pointerId}
        grabbed: null,                    // 3D: the runner's grabbed object name (aim state)
        aimState: null,
        refuse: null,                     // why the hovered object cannot move, when it cannot
        error: null
    };
    let outline = null;
    let raf = null;
    let unsubscribeAim = null;
    let hoverObj = null;

    function canvasOf() {
        const c = host.querySelector('canvas');
        if (!c) { throw new Error('[hand] the scene mount has no <canvas> — nothing is drawn to pick on.'); }
        return c;
    }
    function rendererOf() {
        const r = runner.renderer;
        if (!r || typeof r.screenToWorld !== 'function') {
            throw new Error('[hand] the active renderer publishes no screenToWorld — the pointer cannot be mapped to world px (RENDERER_CONTRACT capability absent); the hand cannot move anything here.');
        }
        return r;
    }
    function cssPoint(ev) {
        const r = canvasOf().getBoundingClientRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
    }
    function worldAt(p) {
        const q = rendererOf().screenToWorld(p.x, p.y, p.w, p.h);
        if (!q || typeof q.x !== 'number' || typeof q.y !== 'number') {
            throw new Error('[hand] screenToWorld(' + p.x + ', ' + p.y + ', ' + p.w + ', ' + p.h + ') returned ' + JSON.stringify(q) + ' — no world point for this pointer.');
        }
        return q;
    }
    /** The handle the hands address (getObjectByName): the human writes the same object Maxi does. */
    function handleOf(name) {
        const d = runner.getObjectByName(name);
        if (!d) { throw new Error('[hand] the runner aims at "' + name + '" but getObjectByName("' + name + '") finds no declared object — the aim and the hands disagree about this object.'); }
        return d;
    }
    /** The pointer's world point confined to the world cube the runner publishes. */
    function inWorld(c) {
        const b = runner.getUniverseBounds();
        return [Math.max(0, Math.min(b.width, c[0])), Math.max(0, Math.min(b.height, c[1])), Math.max(-b.zHalf, Math.min(b.zHalf, c[2]))];
    }

    // ── the outline (DOM, pointer-events none; projected through the runner's own world→screen) ──
    function ensureOutline() {
        if (outline && outline.parentNode === host) { return outline; }
        const doc = host.ownerDocument;
        outline = doc.createElement('div');
        outline.setAttribute('data-role', OUTLINE_ROLE);
        outline.style.cssText = 'position:absolute;pointer-events:none;box-sizing:border-box;border:2px solid #5fd3ff;' +
            'border-radius:3px;box-shadow:0 0 6px rgba(95,211,255,.6);display:none;z-index:3;';
        host.appendChild(outline);
        return outline;
    }
    /** The corners of the box the runner says the object occupies (envelopeOf: {left, top, w, h[, z, d]}). */
    function cornersOf(env) {
        const out = [];
        const zs = (typeof env.z === 'number' && typeof env.d === 'number') ? [env.z, env.z + env.d] : [0];
        zs.forEach(function (z) {
            out.push([env.left, env.top, z], [env.left + env.w, env.top, z], [env.left, env.top + env.h, z], [env.left + env.w, env.top + env.h, z]);
        });
        return out;
    }
    function paintOutline(d) {
        const box = ensureOutline();
        if (!d) { box.style.display = 'none'; return; }
        if (typeof runner.screenPointOf !== 'function') {
            throw new Error('[hand] the runner publishes no screenPointOf — an outline cannot be projected without the renderer\'s world→screen adjoint.');
        }
        const env = runner.envelopeOf(d);
        if (!env) { box.style.display = 'none'; return; }   // the runner reports no box for it: nothing to outline
        const canvas = canvasOf();
        const cr = canvas.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const pts = cornersOf(env);
        for (let i = 0; i < pts.length; i++) {
            const sp = runner.screenPointOf(pts[i], cr.width, cr.height);
            if (!sp) { box.style.display = 'none'; return; }   // off-screen by the runner's own rule
            minX = Math.min(minX, sp[0]); maxX = Math.max(maxX, sp[0]);
            minY = Math.min(minY, sp[1]); maxY = Math.max(maxY, sp[1]);
        }
        box.style.left = (cr.left - hr.left + minX - 3) + 'px';
        box.style.top = (cr.top - hr.top + minY - 3) + 'px';
        box.style.width = (maxX - minX + 6) + 'px';
        box.style.height = (maxY - minY + 6) + 'px';
        box.style.display = 'block';
    }
    function loop() {
        raf = null;
        if (!st.on) { return; }
        try {
            const target = st.held ? st.held.obj : hoverObj;
            paintOutline(target);
        } catch (e) { fail(e); return; }
        raf = win.requestAnimationFrame(loop);
    }

    function fail(err) {
        st.error = String((err && err.message) || err);
        onError(err);
        onChange(state());
    }
    /** Hover what the pointer hit, as the declared object it belongs to (null: not declared — it cannot move). */
    function setHover(hit) {
        const d = hit ? runner.declaredOf(hit) : null;
        hoverObj = d || hit || null;
        st.hover = d ? d.name : null;
        st.refuse = null;
        if (hit && !d) { st.refuse = 'the object under the pointer is not declared by the scene (built with new, or a primitive) — only declared objects move'; }
        else if (d && runner.positionAuthorityOf(d) === null) { st.refuse = runner.noPositionAuthorityMessage(d); }
    }

    // ── 2D pointer semantics ──
    function onPointerDown(ev) {
        if (!st.on || ev.button !== 0) { return; }
        if (ev.target && ev.target.closest && ev.target.closest('[data-role="camera-controls"]')) { return; }   // the package's pads keep their pointer
        try {
            const p = cssPoint(ev);
            const hit = runner.pickObjectAtScreen(p.x, p.y, p.w, p.h);
            runner.setSelectHighlight(hit || null);
            setHover(hit);
            if (!hit) { onChange(state()); return; }
            if (st.mode !== '2d') { onChange(state()); return; }   // 3D: the runner's aim + SPACE carry the object
            if (st.refuse) { throw new Error('[hand] cannot pick up "' + (st.hover || '(undeclared)') + '": ' + st.refuse + '.'); }
            st.held = { name: st.hover, obj: hoverObj, startCenter: runner.centerOf(hoverObj).slice(), pw0: worldAt(p), pointerId: ev.pointerId, moved: false };
            if (host.setPointerCapture) { try { host.setPointerCapture(ev.pointerId); } catch (e) { /* capture is a convenience; the move still tracks the host */ } }
            host.style.cursor = 'grabbing';
            ev.preventDefault();
            onChange(state());
        } catch (e) { fail(e); }
    }
    function onPointerMove(ev) {
        if (!st.on) { return; }
        try {
            const p = cssPoint(ev);
            if (st.held) {
                if (st.held.pointerId !== undefined && ev.pointerId !== st.held.pointerId) { return; }
                const pw = worldAt(p);
                const c0 = st.held.startCenter;
                const to = inWorld([c0[0] + (pw.x - st.held.pw0.x), c0[1] + (pw.y - st.held.pw0.y), c0[2]]);
                writePosition(runner, st.held.obj, { center: to }, { op: 'drag', by: 'human' });
                runner.repaint();   // STUDIO's drag: redraw the CURRENT state, no tick — a paused world shows the move now
                st.held.moved = true;
                return;
            }
            if (st.mode !== '2d') { return; }
            const hit = runner.pickObjectAtScreen(p.x, p.y, p.w, p.h);
            if (hit !== hoverObj) { setHover(hit); host.style.cursor = hit ? (st.refuse ? 'not-allowed' : 'grab') : 'default'; onChange(state()); }
        } catch (e) { fail(e); }
    }
    function onPointerUp(ev) {
        if (!st.on || !st.held) { return; }
        if (st.held.pointerId !== undefined && ev.pointerId !== st.held.pointerId) { return; }
        if (host.releasePointerCapture) { try { host.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ } }
        st.held = null;
        host.style.cursor = hoverObj ? 'grab' : 'default';
        onChange(state());
    }
    function onPointerLeave() {
        if (!st.on || st.held) { return; }
        setHover(null);
        host.style.cursor = 'default';
        onChange(state());
    }

    // ── 3D: the runner's own aim, made visible ──
    // The carry itself is the runner's (grabToggle + the camera pose). On the DROP the carried
    // centre is written once more through the one write path — the same point, snapped to the
    // integer wire, with `from` = where the grab found it — so a human carry is logged exactly
    // like a human drag and shows up in Maxi's inventory on the same wire.
    let carry = null;
    function onAim(aimSt) {
        st.aimState = aimSt;
        const wasGrabbed = st.grabbed;
        st.grabbed = aimSt.grabbed || null;
        try {
            if (!wasGrabbed && st.grabbed) {
                const d = handleOf(st.grabbed);
                carry = { name: st.grabbed, obj: d, from: { center: runner.centerOf(d).slice() } };
            } else if (wasGrabbed && !st.grabbed && carry) {
                writePosition(runner, carry.obj, { center: runner.centerOf(carry.obj) }, { op: 'carry3d', by: 'human', from: carry.from });
                carry = null;
            }
        } catch (e) { carry = null; fail(e); return; }
        const name = aimSt.grabbed || aimSt.hover || null;
        hoverObj = name ? runner.getObjectByName(name) : null;
        st.hover = name;
        st.refuse = aimSt.error || null;
        onChange(state());
    }

    function state() {
        return {
            on: st.on, mode: st.mode, hover: st.hover, held: st.held ? st.held.name : null, grabbed: st.grabbed,
            refuse: st.refuse, aim: st.aimState, error: st.error,
            text: !st.on ? HAND_STATUS.off
                : HAND_STATUS[st.mode] +
                  (st.held ? ' · holding ' + st.held.name : st.grabbed ? ' · GRABBED ' + st.grabbed : st.hover ? ' · over ' + st.hover : '') +
                  (st.refuse ? ' · cannot move: ' + st.refuse : '')
        };
    }

    function set(on) {
        on = !!on;
        if (on === st.on) { return state(); }
        st.error = null;
        if (on) {
            rendererOf();                 // fail loud at entry, not at the first drag
            if (typeof runner.repaint !== 'function') {
                throw new Error('[hand] the runner publishes no repaint() — a drag on a paused world could not be shown (FrqtlApp.repaint is the SDK\'s redraw-without-tick); the hand refuses to move objects it cannot show.');
            }
            runner.setAimArmed(true);     // the runner's rule: arms only with an angular camera
            st.mode = runner.isAimArmed() ? '3d' : '2d';
            st.on = true;
            host.addEventListener('pointerdown', onPointerDown);
            host.addEventListener('pointermove', onPointerMove);
            host.addEventListener('pointerup', onPointerUp);
            host.addEventListener('pointercancel', onPointerUp);
            host.addEventListener('pointerleave', onPointerLeave);
            if (st.mode === '3d') {
                if (typeof runner.addAimListener !== 'function') { throw new Error('[hand] the runner arms an aim but publishes no addAimListener — the aimed object cannot be shown.'); }
                unsubscribeAim = runner.addAimListener(onAim);
                onAim(runner.getAimState());
            }
            host.style.cursor = st.mode === '2d' ? 'grab' : 'crosshair';
            ensureOutline();
            if (!raf) { raf = win.requestAnimationFrame(loop); }
        } else {
            leave();
        }
        onChange(state());
        return state();
    }
    function leave() {
        // A live 3D carry is DROPPED first, through the one write (integer wire, logged as carry3d),
        // while the hand still listens: a throw here leaves the hand on and the carry held, never a
        // silent float position.
        if (carry) {
            writePosition(runner, carry.obj, { center: runner.centerOf(carry.obj) }, { op: 'carry3d', by: 'human', from: carry.from });
            carry = null;
        }
        host.removeEventListener('pointerdown', onPointerDown);
        host.removeEventListener('pointermove', onPointerMove);
        host.removeEventListener('pointerup', onPointerUp);
        host.removeEventListener('pointercancel', onPointerUp);
        host.removeEventListener('pointerleave', onPointerLeave);
        if (unsubscribeAim) { unsubscribeAim(); unsubscribeAim = null; }
        if (raf) { win.cancelAnimationFrame(raf); raf = null; }
        if (st.on && runner.isAimArmed && runner.isAimArmed()) { runner.setAimArmed(false); }
        st.on = false; st.mode = 'off'; st.held = null; st.hover = null; st.grabbed = null; st.aimState = null; st.refuse = null;
        hoverObj = null;
        host.style.cursor = '';
        if (outline) { outline.style.display = 'none'; }
    }

    return {
        get enabled() { return st.on; },
        set: set,
        toggle: function () { return set(!st.on); },
        state: state,
        dispose: function () { leave(); if (outline && outline.parentNode) { outline.parentNode.removeChild(outline); } outline = null; }
    };
}
