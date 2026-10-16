/* Copyright 2023-2026 by Essam Abadir */

/**
 * fake-runner.mjs — ONE node stand-in for the @descix/frqtl-sdk runner (the vendored version, PINNED.json)'s declared-object
 * surface, shared by the hand / hands / record tests (none of them re-types it).
 *
 * It models what the lab reads and writes, by the SDK's published contract
 * (COMPOSE_AND_CAPTURE.md, "Finding and moving what the scene declared"):
 *   declared, declaredOf, getObjectByName, kindOf, positionAuthorityOf ('center' | 'rect' | null),
 *   noPositionAuthorityMessage, centerOf (always [x, y, z]; a rect's drawn centre), envelopeOf (the
 *   object's OWN live rect, as the SDK hands back a Wall's), placeDeclaredAt (refuses a point outside
 *   getUniverseBounds; a rect is placed at the centre and written through updateObjectProperty),
 *   updateObjectProperty (logged). Reads of an undeclared object THROW, as the SDK's do.
 *
 * An object is a plain bag: {name, _schemaKind, rect?: {left, top, w, h[, z, d]}, center?: [x, y, z]}.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SDK_DIST } from '../../site/app-assets/frqtl-sdk.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function fakeRunner(objects, extra) {
    const declared = objects.slice();
    const calls = { update: [], place: [] };
    const hasZ = (r) => typeof r.z === 'number' && typeof r.d === 'number';
    const runner = {
        calls,
        declared,
        bounds: { width: 600, height: 400, zHalf: 200 },
        getUniverseBounds() { return Object.assign({}, this.bounds); },
        declaredOf(x) { for (let c = x, i = 0; c && i < 64; c = c._owner, i++) { if (declared.includes(c)) { return c; } } return null; },
        requireDeclared(d, where) {
            if (!declared.includes(d)) { throw new Error('[FrqtlApp.' + where + '] "' + (d && d.name) + '" is not a declared object (FAIL-LOUD.)'); }
            return d;
        },
        getObjectByName(name) { return declared.find((d) => d.name === name) || null; },
        kindOf(d) { this.requireDeclared(d, 'kindOf'); return d._schemaKind; },
        positionAuthorityOf(d) { return (d && d.center) ? 'center' : (d && d.rect) ? 'rect' : null; },
        noPositionAuthorityMessage(d) { return '"' + (d && d.name) + '" (' + ((d && d._schemaKind) || 'object') + ') has no position authority — neither a centre nor a rect — so it cannot be moved as a unit.'; },
        centerOf(d) {
            this.requireDeclared(d, 'centerOf');
            if (d.center) { return [d.center[0], d.center[1], d.center[2] || 0]; }
            if (d.rect) { const r = d.rect; return [r.left + r.w / 2, r.top + r.h / 2, hasZ(r) ? r.z + r.d / 2 : 0]; }
            throw new Error(this.noPositionAuthorityMessage(d));
        },
        envelopeOf(d) { return (d && d.rect) ? d.rect : null; },
        placeDeclaredAt(d, p) {
            this.requireDeclared(d, 'placeDeclaredAt');
            calls.place.push({ name: d.name, point: p.slice() });
            const k = [p[0], p[1], p.length === 3 ? p[2] : 0];
            const b = this.bounds;
            if (k[0] < 0 || k[0] > b.width || k[1] < 0 || k[1] > b.height || k[2] < -b.zHalf || k[2] > b.zHalf) {
                throw new RangeError('[FrqtlApp.placeDeclaredAt] ' + JSON.stringify(k) + ' is outside the universe cube (FAIL-LOUD.)');
            }
            let zHeld = false;
            if (d.center) { this.updateObjectProperty(d, 'center', k); }
            else {
                const r = d.rect;
                if (!hasZ(r)) { zHeld = k[2] !== 0; this.updateObjectProperty(d, 'rect', [k[0] - r.w / 2, k[1] - r.h / 2, r.w, r.h]); }
                else { this.updateObjectProperty(d, 'rect', [k[0] - r.w / 2, k[1] - r.h / 2, k[2] - r.d / 2, r.w, r.h, r.d]); }
            }
            return { center: this.centerOf(d), zHeld };
        },
        updateObjectProperty(d, key, t) {
            calls.update.push({ name: d.name, key, tuple: t.slice() });
            if (key === 'center') { d.center = t.slice(); }
            else { d.rect = (t.length === 6) ? { left: t[0], top: t[1], z: t[2], w: t[3], h: t[4], d: t[5] } : { left: t[0], top: t[1], w: t[2], h: t[3] }; }
        },
        setSelectHighlight() {}
    };
    return Object.assign(runner, extra || {});
}

/**
 * The 3D renderer's camera handle (`runner.cameraControl`) as the SDK publishes it, over the SDK's OWN pure orbit
 * geometry — the vendored dist's three-camera-geometry.js, the file the live three provider positions its camera
 * with — so a test of which way is toward the viewer runs the real orbit maths, never a re-typed copy of it.
 * `orbit` {azimuth, elevation, distance, roll?, target?}; `w`, `h` the world's width and height.
 */
export function sdkCameraControl(orbit, w, h) {
    const geometry = createRequire(import.meta.url)(path.join(REPO_ROOT, 'site', SDK_DIST, 'js/compat/renderer/providers/three-camera-geometry.js'));
    const bag = Object.assign({ roll: 0, target: null }, orbit);
    return {
        getOrbit: () => Object.assign({}, bag),
        cameraOffsetFromWorld: (p) => geometry._cameraOffsetFromWorld(bag, w, h, p)
    };
}
