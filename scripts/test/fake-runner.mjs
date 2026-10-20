/* Copyright 2023-2026 by Essam Abadir */

/**
 * fake-runner.mjs — ONE node stand-in for the @descix/frqtl-web runner (the vendored version, PINNED.json)'s declared-object
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
 * An object is a plain bag: {name, _schemaKind, rect?: {left, top, w, h[, z, d]}, center?: [x, y, z]}. Like the SDK's
 * census, each carries `inParts` (not enumerable): true unless the test declares the bag with its own `inParts: false`
 * (a part the scene declares in code).
 *
 * withSketch(sc, opts) adds the sketch side a scene publishes at the vendored @descix/frqtl-web, with the world's Record
 * open (the lab opens one per booted world), by its contract: recipeContext.toSketch({by}) → {files, changes, refused}
 * (opts.refused, a list or a function of the call, plays a refusal), recipeContext.setDeclared(name, patch, {by}) →
 * {set, from, to, tick: 0, kept, files} — each REFUSES an act that names no `by` of the package's BY, as an open Record
 * does — win.MaxiScene.entry() / partsOf(project) (the block of the in-parts objects, in declared order), and the lab's
 * Record doors on the scene: sc.recordTickOf(t) (the identity: no re-run), sc.readyToFilm(op) (resolves) and
 * sc.noteFilmed(hand, span) (lands in sc.filmed). setDeclared's and partsOf's answers are built in another realm
 * (`foreign`), as the scene document's are. Every call lands in sc.sketchCalls.
 */
function inPartsByDefault(o) {
    if (o && typeof o === 'object' && !Object.prototype.hasOwnProperty.call(o, 'inParts')) {
        Object.defineProperty(o, 'inParts', { value: true, enumerable: false, writable: true, configurable: true });
    }
    return o;
}

import vm from 'node:vm';
import { distUrl, exportFile } from '../frqtl-web-pin.mjs';

const { BY } = await import(distUrl(exportFile('./project')));
/** The package's refusal of an act that names no `by` while a Record is open. */
function requireBy(opts, where) {
    if (!opts || BY.indexOf(opts.by) === -1) { throw new TypeError('[' + where + '] a Record is open: the act names who acted — { by: ' + BY.map((b) => JSON.stringify(b)).join(' | ') + ' }; got ' + JSON.stringify(opts && opts.by) + '. (FAIL-LOUD.)'); }
    return opts.by;
}

/** A value built in ANOTHER realm, as the scene document's answers are (its Object.prototype is not this one's). */
export const foreign = (v) => vm.runInNewContext('(' + JSON.stringify(v) + ')');

/** The vendored package's own orbit geometry (the file the live three provider positions its camera with). */
const geometry = await import(distUrl('frqtl/compat/renderer/providers/three-camera-geometry.js'));

export function fakeRunner(objects, extra) {
    const declared = objects.map(inPartsByDefault);
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

/** The sketch side of a fake scene (see the header). Mutates and returns `sc`. */
export function withSketch(sc, opts) {
    opts = opts || {};
    const calls = sc.sketchCalls = [];
    const entry = 'sketch.js';
    let text = opts.text || 'export const parts = {};\nexport default function buildExperiment(exp) {}\n';
    const placeOf = (o) => (o.center ? { center: o.center.slice() } : o.rect ? { rect: o.rect.z !== undefined ? [o.rect.left, o.rect.top, o.rect.z, o.rect.w, o.rect.h, o.rect.d] : [o.rect.left, o.rect.top, o.rect.w, o.rect.h] } : {});
    const block = () => {
        const out = {};
        (sc.runner.declared || []).forEach((o) => { inPartsByDefault(o); if (o.inParts === true) { out[o.name] = [o._schemaKind, Object.assign({}, o.props || {}, placeOf(o))]; } });
        return out;
    };
    const files = () => { const f = {}; f[entry] = text; return f; };
    sc.recipeContext = Object.assign({}, sc.recipeContext || {}, {
        toSketch: async (o) => {
            const by = requireBy(o, 'RecipeContext.toSketch');
            const refused = typeof opts.refused === 'function' ? opts.refused(calls.filter((c) => c.op === 'toSketch').length) : (opts.refused || []);
            calls.push({ op: 'toSketch', by });
            return { files: files(), changes: [], refused: refused.slice() };
        },
        setDeclared: async (name, patch, actOpts) => {
            const by = requireBy(actOpts, 'RecipeContext.setDeclared');
            calls.push({ op: 'setDeclared', name, patch, by });
            const o = sc.runner.declared.find((d) => d.name === name && d.inParts === true);
            if (!o) { throw new Error('[RecipeContext.setDeclared] "' + name + '" is not an object of this sketch\'s `parts` block. (FAIL-LOUD.)'); }
            if (Object.prototype.hasOwnProperty.call(patch, 'name')) { throw new TypeError('[RecipeContext.setDeclared] "name": the key is the name (FAIL-LOUD.)'); }
            const from = {};
            o.props = o.props || {};
            Object.keys(patch).forEach((k) => { from[k] = o.props[k] === undefined ? null : o.props[k]; o.props[k] = patch[k]; });
            text += '// set ' + name + ' ' + JSON.stringify(patch) + '\n';
            return foreign({ set: name, from, to: Object.assign({}, patch), tick: 0, kept: ['seed'], files: files() });
        }
    });
    sc.win = sc.win || {};
    sc.win.MaxiScene = Object.assign({}, sc.win.MaxiScene || {}, {
        entry: () => entry,
        partsOf: async (project) => { calls.push({ op: 'partsOf', entry: project.entry }); return opts.noBlock ? null : foreign(block()); }
    });
    if (typeof sc.recordTickOf !== 'function') { sc.recordTickOf = (t) => t; }
    if (typeof sc.readyToFilm !== 'function') { sc.readyToFilm = async () => {}; }
    if (!Array.isArray(sc.filmed)) { sc.filmed = []; }
    if (typeof sc.noteFilmed !== 'function') { sc.noteFilmed = (hand, span) => { sc.filmed.push({ hand, span }); }; }
    return sc;
}

/**
 * The 3D renderer's camera handle (`runner.cameraControl`) as the SDK publishes it, over the SDK's OWN pure orbit
 * geometry — the vendored dist's three-camera-geometry.js, the file the live three provider positions its camera
 * with — so a test of which way is toward the viewer runs the real orbit maths, never a re-typed copy of it.
 * `orbit` {azimuth, elevation, distance, roll?, target?}; `w`, `h` the world's width and height.
 */
export function sdkCameraControl(orbit, w, h) {
    const bag = Object.assign({ roll: 0, target: null }, orbit);
    return {
        getOrbit: () => Object.assign({}, bag),
        cameraOffsetFromWorld: (p) => geometry._cameraOffsetFromWorld(bag, w, h, p)
    };
}

const { serializeRecordFolder } = await import(distUrl('shim/project/record-format.js'));
const { manifestFor, serializeManifest } = await import(distUrl(exportFile('./project')));

/**
 * The lab's world-Record doors (maxi-lab.js THE WORLD'S RECORD) over fake scenes, for a test that drives the loop's page
 * body: `sceneOf()` → the current fake scene. Each scene's Record is sc.record ({changes}: the rows its acts wrote; the fake
 * sketch writes none, a test pushes them); its clips are the ones the scene noted (sc.filmed); closing it runs the PACKAGE's
 * writer, and a refusal gives its rows to the chain's `unheld`. `leave()` is a scene change (the world's Record closes into
 * the chain); nextRound() the page's beginNextRound; actRows / beginChain / endChain / abandonChain / chainState are the lab's, by name.
 */
export function recordDoors(sceneOf) {
    let chain = null;
    const recOf = (sc) => (sc.record = sc.record || { changes: [] });
    function close(sc, into) {
        const rec = recOf(sc);
        const filmed = sc.filmed || [];
        let out;
        try {
            out = serializeRecordFolder({ changes: rec.changes, clips: filmed.map((f, i) => ({ bytes: new TextEncoder().encode('clip-' + i), firstTick: f.span.first, lastTick: f.span.last })),
                partsBefore: {}, partsAfter: {}, project: { 'frqtl.json': serializeManifest(manifestFor({ name: 'fake', entry: 'sketch.js' })), 'sketch.js': 'export default function buildExperiment(exp) {}\n' } });
        } catch (e) { if (into) { into.unheld.push.apply(into.unheld, rec.changes); } return { refused: e.message }; }
        const hands = filmed.map((f) => f.hand);
        sc.record = { changes: [] }; sc.filmed = [];
        if (!out.empty && into) { into.worlds.push({ folder: out, filmed: hands, carried: 0, start: {}, scene: { label: sc.label, id: sc.id, mode: sc.mode, renderer: sc.renderer } }); }
        return out;
    }
    return {
        leave: () => close(sceneOf(), chain),
        actRows: async (act) => {
            const sc = sceneOf(); const rec = recOf(sc); const n = rec.changes.length;
            let value, error = null;
            try { value = await act(); } catch (e) { error = String((e && e.message) || e); }
            const now = recOf(sceneOf());
            const changes = JSON.parse(JSON.stringify(rec.changes.slice(n).concat(now !== rec ? now.changes : [])));
            return error === null ? { ok: true, value, changes } : { ok: false, error, changes };
        },
        beginChain: async (producer) => { if (chain) { throw new Error(producer + ': the ' + chain.producer + ' is recording now'); } close(sceneOf(), null); chain = { producer, worlds: [], unheld: [] }; return { carried: 0 }; },
        endChain: async () => { const ch = chain; close(sceneOf(), ch); chain = null; return { producer: ch.producer, worlds: ch.worlds, unheld: ch.unheld }; },
        abandonChain: () => { chain = null; },
        /** The page's beginNextRound (an Owl's revise): the round's chain let go, the world's Record closed, the next round's chain begun. */
        nextRound: () => { const producer = chain ? chain.producer : 'loop'; chain = null; close(sceneOf(), null); chain = { producer, worlds: [], unheld: [] }; },
        chainState: () => (chain ? { records: chain.worlds.length + 1, rows: 0 } : { records: 0, rows: 0 }),
        /** The chain recording now, or null (a function: Object.assign would copy a getter's value once). */
        chainNow: () => chain
    };
}
