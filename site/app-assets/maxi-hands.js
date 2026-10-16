/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-hands.js — MAXI'S HANDS: the ONE owner table of what Maxi can do in the lab.
 *
 * `HANDS` is consumed by these readers and never re-typed by any:
 *   - app-assets/maxi-loop.js `labBody` runs the Builder's hand calls through `buildAdapter` over it: in the
 *     signed-in shell the lab takes the whole frame (measured 2026-10-15), so Maxi is reached through the
 *     page's own conversation, asking through window.DeSciX.call, and the loop needs no click;
 *   - app-assets/maxi-lab.js publishes the same adapter as `window.DeSciX_Actions` (`publishHands`), the
 *     global minimaxi/body.mjs and the look scripts drive hands through; a shell Run dispatched into it is
 *     refused by name while Maxi is working;
 *   - scripts/gen-hands-section.mjs renders the persona's hands section from it (`renderHandsMarkdown`).
 *
 * Every hand is a THIN adapter over the SDK runner the scene document booted (an FrqtlApp: the
 * declared registry — declared / getObjectByName / kindOf / positionAuthorityOf / centerOf / envelopeOf
 * — and its writes — placeDeclaredAt / updateObjectProperty / removeObject — plus addTickListener /
 * setSelectHighlight / restart / start / stop / cameraControl) and over `FrqtlVision` + `CameraPath`.
 * Only what the scene DECLARED (exp.addObject) is read or moved. A hand
 * returns a small JSON result or THROWS naming what is missing — no silent fallback, no warning
 * string, no retry.
 *
 * Maxi's eyes are VIDEO: every reading is an MP4 clip filmed through FrqtlVision's mediabunny recorder,
 * and the video and the hands are the whole exercise, so neither is ever stood in for by stills, numbers
 * or text: `see` films a clip through FrqtlVision.record — the SDK's vendored mediabunny MP4
 * encoder — and the PAGE hands the encoded video to Maxi itself, as `media[]` on the question command
 * (lab.ask → app-assets/maxi-ask.js); `dragTo` moves an object across world ticks INSIDE such a recording
 * so Maxi watches what the drag did; `record` is the same eye flown along a camera path (pan/zoom in 2D,
 * orbit in 3D). There is no still-returning hand. A hand's result carries {asked:true, interaction_id,
 * answer_excerpt}: what Maxi said he saw, on the lab's own thread.
 *
 * The `lab` a hand runs against (app-assets/maxi-lab.js):
 *   host()                      → 'shell' | 'standalone' | 'embedded-no-bridge' | 'pending'
 *   scene(op)                   → { label, kind, id, mode, modes, renderer, win, runner, recipeContext, tick() } or THROWS
 *   loadScene / sceneSource / openSketch (async) — the registry + the one boot door (a frame per load)
 *   restart (async)             — the runner's own restart(), in the same frame
 *   inventory()                 → the declared scene graph: inventoryOf(scene) below (INVENTORY_KEYS)
 *   ask(op, {note, media[]})    → the question command with the footage (maxi-ask.js createThread) →
 *                                 {asked, interaction_id, answer, answer_excerpt, …}, or THROWS verbatim;
 *                                 standalone it THROWS naming the shell's command door (the clip is kept)
 *   fetchMemory(op, id)         → { mime_type, data (base64), bytes, url } of a served memory clip
 *   say(text)                   → shows the sentence on the page
 *   state.grab                  → the one grabbed object, or null
 */

'use strict';

export const RECT_CONVENTION =
    'World pixels, origin at the top-left, y down. Only what the scene DECLARED (exp.addObject) is listed or ' +
    'moved; a thing a scene built with `new` runs and draws but has no handle here. Every declared object that ' +
    'can move has a CENTER [x, y, z] (z is 0 in a 2D scene): where it is placed. A wall or tunnel also has a ' +
    'rect, the box it occupies: [left, top, w, h] in a 2D scene or [left, top, z, w, h, d] in a 3D one, handed ' +
    'to the SDK unchanged (its refusals come back verbatim); an emitter has only its center. A point `to` is ' +
    'always an object\'s CENTER, placed by the SDK, which refuses a point outside the world naming its bounds. ' +
    'The wire is INTEGER world px: hand-supplied tuples must be integers (a fraction is refused by name); ' +
    'derived positions (a dragTo step, the human\'s drag or 3D drop) are rounded to the integer wire once, at the write.';

/** `see`: 5 seconds of the lab at 10 fps — a frame every 5 ticks for 250 ticks after the first capture. */
export const SEE_DEFAULTS = Object.freeze({
    everyTicks: 5, stopAt: Object.freeze({ ticks: 250 }), maxFrames: 51, fps: 10
});

/** `dragTo`: the move spans 150 world ticks, the clip keeps filming 150 more so the effect settles (61 frames, 6.1 s). */
export const DRAG_DEFAULTS = Object.freeze({ ticks: 150, settle: 150, everyTicks: 5, fps: 10 });

/**
 * Every clip a hand films lasts 5 to 10 seconds of playback (the clip band: long enough to watch an
 * effect unfold). Duration = frames / fps. A hand refuses BEFORE filming when its own plan falls outside the
 * band, and refuses to hand over a clip that came out outside it.
 */
export const CLIP_SECONDS = Object.freeze({ min: 5, max: 10 });
const CLIP_BAND = CLIP_SECONDS.min + '–' + CLIP_SECONDS.max + ' s';

/** Frames a recording will hold: a frame on the first tick, then every `everyTicks`, bounded by maxFrames. */
export function plannedFrames(spanTicks, everyTicks, maxFrames, path) {
    const n = path ? Math.floor(spanTicks / everyTicks) : Math.floor(spanTicks / everyTicks) + 1;
    return Math.min(n, maxFrames);
}

/** THROWS unless frames/fps lies in CLIP_SECONDS, naming the band and the knobs that set it. */
export function assertClipSeconds(op, frames, fps, what) {
    const sec = frames / fps;
    if (!(sec >= CLIP_SECONDS.min && sec <= CLIP_SECONDS.max)) {
        throw new Error(op + ': ' + what + ' ' + frames + ' frames at ' + fps + ' fps = ' + (Math.round(sec * 100) / 100) +
            ' s, outside the ' + CLIP_BAND + ' every clip must last. Duration = frames / fps; frames = ticks filmed / everyTicks. ' +
            'Change the ticks, everyTicks or fps so the clip lands in ' + CLIP_BAND + '. Nothing was shown.');
    }
    return sec;
}

/** `record`: the flight's own length sets the frame count. */
export const RECORD_DEFAULTS = Object.freeze({ everyTicks: 5, fps: 10 });

export const HANDS_MARKERS = Object.freeze({
    begin: '<!-- HANDS:BEGIN generated by scripts/gen-hands-section.mjs -->',
    end: '<!-- HANDS:END -->'
});

// ── small validators (the hands' own argument contract; SDK contracts stay the SDK's) ───────

function bag(args) {
    if (args === undefined || args === null) { return {}; }
    if (typeof args !== 'object' || Array.isArray(args)) {
        throw new Error('a hand takes ONE JSON object of named arguments, got ' + JSON.stringify(args));
    }
    return args;
}

function req(a, key, type, op) {
    const v = a[key];
    if (v === undefined || v === null) { throw new Error(op + ': `' + key + '` (' + type + ') is required and was not given.'); }
    if (type === 'array') {
        if (!Array.isArray(v)) { throw new Error(op + ': `' + key + '` must be an array, got ' + JSON.stringify(v)); }
    } else if (typeof v !== type || (type === 'string' && v.trim() === '')) {
        throw new Error(op + ': `' + key + '` must be a non-empty ' + type + ', got ' + JSON.stringify(v));
    }
    return v;
}

function numbers(arr, key, op, lengths) {
    if (!Array.isArray(arr) || lengths.indexOf(arr.length) === -1 || !arr.every(function (n) { return typeof n === 'number' && isFinite(n); })) {
        throw new Error(op + ': `' + key + '` must be an array of ' + lengths.join(' or ') + ' finite numbers, got ' + JSON.stringify(arr));
    }
    return arr;
}

/** A hand-supplied tuple: whole world px only — the wire is integer, so a fraction is refused, never coerced. */
function integers(arr, key, op, lengths) {
    numbers(arr, key, op, lengths);
    const bad = arr.findIndex(function (n) { return n % 1 !== 0; });
    if (bad !== -1) {
        throw new Error(op + ': `' + key + '` must be whole world pixels (the wire is integer), got ' + JSON.stringify(arr) +
            ' — element ' + bad + ' is ' + arr[bad] + '; give integers.');
    }
    return arr;
}

function posInt(v, key, op, dflt) {
    if (v === undefined || v === null) { return dflt; }
    if (typeof v !== 'number' || !isFinite(v) || v <= 0 || v % 1 !== 0) {
        throw new Error(op + ': `' + key + '` must be a positive whole number, got ' + JSON.stringify(v));
    }
    return v;
}

// ── the declared scene graph, read off the runner's own accessors ───────────────────────────

/**
 * The box a declared object occupies as a tuple: [left, top, w, h] (2D) or [left, top, z, w, h, d]
 * (3D). A COPY — `runner.envelopeOf` may hand back the object's own live rect.
 */
function boxTuple(env) {
    return (typeof env.z === 'number' && typeof env.d === 'number')
        ? [env.left, env.top, env.z, env.w, env.h, env.d]
        : [env.left, env.top, env.w, env.h];
}

/**
 * A box tuple's extent per axis — the inverse reading of boxTuple, owned beside it: [left, top, w, h] →
 * {x:[left, left+w], y:[top, top+h]}; [left, top, z, w, h, d] → the same plus z:[z, z+d]. Any other length THROWS.
 */
export function spansOf(rect) {
    if (!Array.isArray(rect) || (rect.length !== 4 && rect.length !== 6) || !rect.every(function (n) { return typeof n === 'number' && isFinite(n); })) {
        throw new Error('spansOf: a rect is [left, top, w, h] (2D) or [left, top, z, w, h, d] (3D) of finite numbers, got ' + JSON.stringify(rect));
    }
    return rect.length === 6
        ? { x: [rect[0], rect[0] + rect[3]], y: [rect[1], rect[1] + rect[4]], z: [rect[2], rect[2] + rect[5]] }
        : { x: [rect[0], rect[0] + rect[2]], y: [rect[1], rect[1] + rect[3]] };
}

/**
 * Where a DECLARED object is, read off the runner: `{center}` (the point it is placed at, always
 * [x, y, z]), plus `{rect}` (the box it occupies) when a rect is its position authority. THROWS —
 * the runner's own refusal — for an undeclared object or one with no position authority.
 */
export function placementOf(runner, d) {
    const authority = runner.positionAuthorityOf(d);
    if (authority === null) { throw new Error(runner.noPositionAuthorityMessage(d)); }
    const out = { center: runner.centerOf(d).slice() };
    if (authority === 'rect') {
        const env = runner.envelopeOf(d);
        if (!env) { throw new Error('"' + d.name + '" is rect-placed but runner.envelopeOf answers null — it occupies no box to report.'); }
        out.rect = boxTuple(env);
    }
    return out;
}

/** One declared object as the hands report it: {name, kind, authority, center?, rect?}. */
function rowOf(runner, d) {
    const row = { name: d.name, kind: runner.kindOf(d), authority: runner.positionAuthorityOf(d) };
    return row.authority ? Object.assign(row, placementOf(runner, d)) : row;
}

/**
 * Every object the scene DECLARED (runner.declared — what exp.addObject put in the world), as rows.
 * A thing a scene built with `new` runs and draws but is not declared: it is not listed and no hand
 * can move it.
 */
export function inventoryObjects(runner) {
    if (!runner || !Array.isArray(runner.declared) || typeof runner.kindOf !== 'function') {
        throw new Error('inventory: the runner publishes no declared registry (runner.declared + kindOf) — not an @descix/frqtl-sdk FrqtlApp.');
    }
    return runner.declared.map(function (d) { return rowOf(runner, d); });
}

/**
 * THE WORLD'S SHAPE — the ONE owner of whether the loaded scene is 2D or 3D. It is a fact of the BOOTED
 * scene (a sketch that called exp.createScene(w, h, d) has a world with depth; exp.createCanvas(w, h) has
 * none), read off the booted recipe's world — never a registry mode, never planned. Every surface that says
 * 2D or 3D (the inventory, a load's summary, the stage words, the lab's switch line) reads `dimensions` here.
 * @returns {{canvas: number[], dimensions: 2|3}}
 */
export function worldShape(sc) {
    const world = sc && sc.recipeContext && sc.recipeContext.world;
    if (!world || typeof world.w !== 'number' || typeof world.h !== 'number') {
        throw new Error('worldShape: the loaded scene\'s recipeContext.world is not {w, h[, d]} (got ' + JSON.stringify(world) + ') — the SDK boot did not publish the world it built.');
    }
    return world.d != null
        ? { canvas: [world.w, world.h, world.d], dimensions: 3 }
        : { canvas: [world.w, world.h], dimensions: 2 };
}

/**
 * The registry modes the loaded scene DECLARES (lab.scene().modes, ids from the walkthrough registry): a
 * registry row's own variants, usually none. A sketch Maxi booted declares none. Never 2D/3D: that is
 * worldShape's.
 */
export function declaredModesOf(sc) {
    if (!Array.isArray(sc.modes) || !sc.modes.every(function (m) { return typeof m === 'string' && m; })) {
        throw new Error('inventory: the loaded scene carries no declared-modes list (lab.scene().modes, [] when the registry declares none), got ' + JSON.stringify(sc.modes) + '.');
    }
    return sc.modes.slice();
}

/**
 * THE inventory: what the `inventory` hand returns and what the loop shows the Designer and the Builder as
 * THE STAGE (maxi-roles.js stageOf reads these keys, by this list). `sc` is the lab's loaded scene
 * (lab.scene()); a sketch Maxi booted has id null, mode null and modes []. `mode` is the registry mode
 * loaded (null when the scene declares none), `modes` the ones it declares, `dimensions` worldShape's.
 */
export const INVENTORY_KEYS = Object.freeze(['tick', 'scene', 'id', 'mode', 'modes', 'renderer', 'dimensions', 'canvas', 'camera', 'viewer', 'objects']);

/**
 * Below this |d depth / d z| the camera looks ACROSS z (side-on, within ~3° of perpendicular to it): neither z
 * direction reads as nearer on screen, so the viewer axis is null rather than a coin toss.
 */
export const VIEWER_SIDE_ON = 0.05;

/**
 * WHICH WAY IS TOWARD THE VIEWER — the ONE owner of that fact, for a 3D world: `{toward:'+z'|'-z', away}`,
 * or `{toward:null, away:null}` when the camera looks across z (VIEWER_SIDE_ON); null in 2D (no depth).
 * Derived from the LIVE camera, never typed and never read off an object's name (the 3D mirror names its
 * +z wall zClipFar, yet from its default camera — azimuth 45, elevation 45 — +z is the NEAR side: measured
 * 2026-10-15 by dragging the slab to z +170 / -170 and counting its pixels, 7009 vs 4113 against 5297 at 0).
 * The derivation asks the SDK's own camera handle (`cameraControl.cameraOffsetFromWorld`, the published
 * surface over its one orbit basis) how a point's forward depth changes when it moves +1 in z: depth that
 * shrinks means +z comes toward the camera. The orbit maths is the SDK's; nothing here re-derives it.
 */
export function viewerOf(cam, dimensions) {
    if (dimensions === 2) { return null; }
    if (dimensions !== 3) { throw new Error('viewer: dimensions must be 2 or 3 (worldShape), got ' + JSON.stringify(dimensions)); }
    if (!cam || typeof cam.cameraOffsetFromWorld !== 'function') {
        throw new Error('viewer: this 3D scene\'s renderer publishes no camera handle with cameraOffsetFromWorld (runner.cameraControl) — which way is toward the viewer cannot be read off the camera.');
    }
    const at0 = cam.cameraOffsetFromWorld([0, 0, 0]);
    const at1 = cam.cameraOffsetFromWorld([0, 0, 1]);
    if (!at0 || !at1 || typeof at0.forward !== 'number' || typeof at1.forward !== 'number' || !isFinite(at0.forward) || !isFinite(at1.forward)) {
        throw new Error('viewer: cameraOffsetFromWorld answered no finite {forward} depth (got ' + JSON.stringify([at0, at1]) + ').');
    }
    const dDepth = at1.forward - at0.forward;          // + : moving +z takes a point deeper (away)
    if (Math.abs(dDepth) < VIEWER_SIDE_ON) { return { toward: null, away: null }; }
    return dDepth < 0 ? { toward: '+z', away: '-z' } : { toward: '-z', away: '+z' };
}

export function inventoryOf(sc) {
    const shape = worldShape(sc);
    const cam = sc.runner.cameraControl;
    return {
        tick: sc.tick(), scene: sc.label, id: sc.id, mode: sc.mode, modes: declaredModesOf(sc), renderer: sc.renderer,
        dimensions: shape.dimensions, canvas: shape.canvas,
        camera: cam ? cam.getOrbit() : null,
        viewer: viewerOf(cam, shape.dimensions),
        objects: inventoryObjects(sc.runner)
    };
}

function findByName(runner, name, op) {
    const d = runner.getObjectByName(name);
    if (!d) {
        throw new Error(op + ': no declared object named "' + name + '". Declared: [' + runner.declared.map(function (x) { return x.name; }).join(', ') + '].');
    }
    return d;
}

function takeGrab(lab, runner, name, op) {
    const d = findByName(runner, name, op);
    const baseline = placementOf(runner, d);
    runner.setSelectHighlight(d);
    lab.state.grab = { name: name, obj: d, baseline: baseline };
    return lab.state.grab;
}

function requireGrab(lab, op) {
    const g = lab.state.grab;
    if (!g) { throw new Error(op + ': nothing is grabbed — grab{name} first, or give `name`.'); }
    return g;
}

/**
 * THE ONE position write for a declared object. Every mover — Maxi's dragTo/moveObject/resize/revert
 * and the human's hand tool — lands here:
 *   {center: [x, y, z?]} → runner.placeDeclaredAt (the SDK's placement write; it refuses a point
 *                          outside the world, an undeclared object, a part it may not place);
 *   {rect: tuple}        → runner.updateObjectProperty(d, 'rect', tuple), for a rect-placed object.
 * The wire is integer world px, so a DERIVED position (a drag step, a 3D drop) is rounded once, here,
 * not by each caller (hand-supplied tuples are refused upstream when fractional). Only WHERE is
 * rounded — a centre, or a rect's left/top(/z); a rect's extent is written as given (it is the
 * hand's integers, or the scene's own size read back by revert, never derived). The pre-write
 * position is read here too; a failed read THROWS naming the object — nothing is written. Every
 * write is announced ONCE to the `onWrite` listeners (the Record change log) as
 * {runner, obj, name, op, by, key, from, to} with `from`/`to` in the written key; `meta` names the op
 * and who moved (`by`: 'maxi' | 'human'; `from` overrides the pre-write placement when the caller
 * knows an earlier origin). Returns what the write left: {center, zHeld} for a centre write (the
 * SDK's answer), {rect} for a rect write.
 */
export function writePosition(runner, d, pos, meta) {
    if (!pos || (!pos.center === !pos.rect)) { throw new Error('writePosition: a position bag is {center} or {rect}, got ' + JSON.stringify(pos) + '.'); }
    meta = meta || {};
    const key = pos.center ? 'center' : 'rect';
    const name = (d && typeof d.name === 'string') ? d.name : null;
    let from = meta.from || null;
    if (!from) {
        try { from = placementOf(runner, d); }
        catch (e) {
            throw new Error('writePosition: cannot read where "' + name + '" is before moving it (' + String((e && e.message) || e) +
                ') — an object with no position authority is not written; nothing moved.');
        }
    }
    if (!from[key]) {
        throw new Error('writePosition: "' + name + '" is placed by its ' + (from.rect ? 'rect' : 'center') + ', so a ' + key +
            ' write is refused — ' + (key === 'rect' ? 'give its centre (dragTo{to})' : 'give its rect') + '; nothing moved.');
    }
    const extentFrom = (key === 'rect') ? (pos.rect.length === 6 ? 3 : 2) : Infinity;   // [l,t,w,h] / [l,t,z,w,h,d]
    const tuple = pos[key].map(function (v, i) { return (i < extentFrom) ? Math.round(v) : v; });
    let left;
    if (key === 'center') {
        left = runner.placeDeclaredAt(d, tuple);
    } else {
        runner.updateObjectProperty(d, 'rect', tuple);
        left = { rect: tuple };
    }
    const was = {}; was[key] = from[key];
    const to = {}; to[key] = (key === 'center') ? left.center.slice() : tuple;
    const notice = { runner: runner, obj: d, name: name, op: meta.op || 'write', by: meta.by || 'maxi', key: key, from: was, to: to };
    WRITE_LISTENERS.slice().forEach(function (fn) { fn(notice); });
    return left;
}

const WRITE_LISTENERS = [];

/** Hear every writePosition (the Record change log's ONE source). Returns the unsubscribe. */
export function onWrite(fn) {
    if (typeof fn !== 'function') { throw new Error('onWrite(fn) needs a listener function.'); }
    WRITE_LISTENERS.push(fn);
    return function () { const i = WRITE_LISTENERS.indexOf(fn); if (i !== -1) { WRITE_LISTENERS.splice(i, 1); } };
}

// ── the eyes: FrqtlVision.record → the question command (lab.ask) ───────────────────────────

function visionOf(sc, op) {
    const FV = sc.win && sc.win.FrqtlVision;
    if (!FV || typeof FV.attach !== 'function') {
        throw new Error(op + ': the scene document publishes no window.FrqtlVision — the GAME roster did not inject objects/objects/FrqtlVision.js.');
    }
    if (!sc.runner.isRunning) {
        throw new Error(op + ': the world is paused, so no tick will arrive to film (a recording samples by TICK, never by the clock) — resume{} first.');
    }
    return FV.attach(sc.runner);
}

function clipOf(video, op) {
    const frames = video && video.track && video.track.frames;
    if (!frames || !frames.length) { throw new Error(op + ': the recorder returned no frames.'); }
    return { video: video, first: frames[0].tick, last: frames[frames.length - 1].tick, frames: frames };
}

/**
 * What a hand reports of the question it asked: Maxi's own words come back as answer_excerpt. `asked`
 * is the door's own answer, never assumed: a body with no brain (minimaxi --brain none) films and
 * keeps the clip and answers asked:false.
 */
function askedOf(asked) {
    if (!asked || typeof asked.asked !== 'boolean') {
        throw new Error('the question door answered without a boolean `asked`: ' + JSON.stringify(asked && Object.keys(asked)) + '.');
    }
    return { asked: asked.asked, interaction_id: asked.interaction_id, answer_excerpt: asked.answer_excerpt };
}

/** The clip facts a footage hand's result carries, by name: `ferry` writes them; a reader imports these, never re-types them. */
export const CLIP_FACTS = Object.freeze({ label: 'label', seconds: 'seconds', base64Length: 'base64Length' });

async function ferry(lab, op, clip, recordOpts, label, note) {
    assertClipSeconds(op, clip.frames.length, recordOpts.fps, 'the recorded clip came out');
    const asked = await lab.ask(op, {
        note: note,
        media: [{ mime_type: clip.video.encoded.mime, data: clip.video.encoded.bytes, label: label, truncated: !!clip.video.truncated }]
    });
    return Object.assign({
        mime: clip.video.encoded.mime, codec: clip.video.encoded.codec, muxer: clip.video.encoded.muxer,
        frames: clip.frames.length, firstTick: clip.first, lastTick: clip.last,
        everyTicks: recordOpts.everyTicks, fps: recordOpts.fps, [CLIP_FACTS.seconds]: clip.frames.length / recordOpts.fps,
        truncated: !!clip.video.truncated, [CLIP_FACTS.base64Length]: clip.video.encoded.bytes.length, [CLIP_FACTS.label]: label
    }, askedOf(asked));
}

function noteOr(a, dflt) { return (typeof a.note === 'string' && a.note) ? a.note : dflt; }

// ── THE TABLE ───────────────────────────────────────────────────────────────────────────────

export const HANDS = Object.freeze({
    loadScene: {
        args: { id: 'string, required — a registry scene id (the picker lists them); a 2D and a 3D scene are different ids, and whether the loaded world is 2D or 3D is read from the result\'s `dimensions`', mode: 'string, ONLY for a scene whose registry row declares modes (inventory `modes` lists them; most declare none and refuse any mode) — one of those declared modes, its default when omitted' },
        returns: 'the loaded scene: {scene, id, mode, modes, renderer, dimensions: 2|3, canvas, tick, objects:[names]}',
        example: { id: 'cl1a-mirror-3d' },
        run: function (lab, a) {
            const id = req(a, 'id', 'string', 'loadScene');
            return lab.loadScene({ id: id, mode: a.mode });
        }
    },
    sceneSource: {
        args: { id: 'string, required — a registry scene id' },
        returns: '{id, path, source} — the sketch file text exactly as shipped',
        example: { id: 'cl1a-mirror' },
        run: function (lab, a) { return lab.sceneSource({ id: req(a, 'id', 'string', 'sceneSource') }); }
    },
    openSketch: {
        args: {
            source: 'string, required — a whole sketch: a buildExperiment(exp) module whose first statement is exp.createCanvas(w, h, cfg) (2D) or exp.createScene(w, h, d, cfg) (3D), ending with the dual-mode tail `if (typeof module !== "undefined" && module.exports) { module.exports = { buildExperiment }; } else if (typeof window !== "undefined") { window.buildExperiment = buildExperiment; }`',
            renderer: '"p5" | "three", optional — the display to boot; derived from the sketch when omitted (createScene without createCanvas → three, else p5); a mismatch is refused by the SDK naming both',
            seed: 'number, optional — RNG seed (42 when omitted)'
        },
        returns: 'the booted sketch: {scene, renderer, canvas, tick, objects:[names]}; a SyntaxError or a build throw comes back verbatim as the error',
        example: { source: "function buildExperiment(exp) {\n  var SRC = { preset: 'particle-walk', is2D: true, center: [60, 240], orientationDeg: 0, chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1, fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1 };\n  exp.createCanvas(480, 480, setupSphereEmitter3D.worldCfg(SRC));\n  exp.addObject('SphereEmitter', SRC);\n  exp.addObject('Wall', { rect: [300, 120, 20, 240], collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: 45, name: 'mirror', color: [255, 120, 0], hooks: ['recolor'] });\n}\nif (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; } else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }" },
        run: function (lab, a) {
            return lab.openSketch({ source: req(a, 'source', 'string', 'openSketch'), renderer: a.renderer, seed: a.seed });
        }
    },
    addObject: {
        args: {
            kind: 'string, required — a kind the SDK ObjectFactory builds (Wall, SphereEmitter, GraphingDetectorWall, LargeObject, LiveChart, …); an unknown kind is refused by the SDK naming the known ones',
            opts: 'object, required — the kind\'s declared props; opts.name (string) is REQUIRED so the object can be addressed afterwards'
        },
        returns: '{added:name, kind, authority:"center"|"rect"|null, center?, rect?} — the object is declared, so inventory lists it and the hands can move it',
        example: { kind: 'Wall', opts: { name: 'blocker', rect: [200, 150, 16, 100], collisionBehavior: 'block', color: [200, 200, 60] } },
        run: function (lab, a) {
            const kind = req(a, 'kind', 'string', 'addObject');
            const opts = a.opts;
            if (!opts || typeof opts !== 'object' || Array.isArray(opts)) { throw new Error('addObject: `opts` (object) is required — the kind\'s declared props, with opts.name.'); }
            const name = req(opts, 'name', 'string', 'addObject (opts.name)');
            const sc = lab.scene('addObject');
            sc.recipeContext.addObject(kind, opts);
            const row = rowOf(sc.runner, findByName(sc.runner, name, 'addObject'));
            return Object.assign({ added: name }, row);
        }
    },
    removeObject: {
        args: { name: 'string, required — a declared object name' },
        returns: '{removed:name}',
        example: { name: 'blocker' },
        run: function (lab, a) {
            const name = req(a, 'name', 'string', 'removeObject');
            const sc = lab.scene('removeObject');
            sc.runner.removeObject(findByName(sc.runner, name, 'removeObject'));
            if (lab.state.grab && lab.state.grab.name === name) { lab.state.grab = null; }
            return { removed: name };
        }
    },
    moveObject: {
        args: { name: 'string, required — a rect-placed object (a wall, a tunnel)', rect: 'array, required — [left, top, w, h] or [left, top, z, w, h, d], whole world pixels (integers; a fraction is refused); an instant placement (no clip) — use dragTo to watch a move happen' },
        returns: '{moved:name, center, rect}',
        example: { name: 'mirror', rect: [300, 80, 20, 240] },
        run: function (lab, a) {
            const name = req(a, 'name', 'string', 'moveObject');
            const rect = integers(req(a, 'rect', 'array', 'moveObject'), 'rect', 'moveObject', [4, 6]);
            const sc = lab.scene('moveObject');
            const d = findByName(sc.runner, name, 'moveObject');
            writePosition(sc.runner, d, { rect: rect }, { op: 'moveObject', by: 'maxi' });
            return Object.assign({ moved: name }, placementOf(sc.runner, d));
        }
    },
    resize: {
        args: { name: 'string, required — a rect-placed object', size: 'array, required — [w, h] or [w, h, d], whole world pixels (integers; a fraction is refused); left/top (and z) stay where they are' },
        returns: '{resized:name, center, rect}',
        example: { name: 'mirror', size: [20, 120] },
        run: function (lab, a) {
            const name = req(a, 'name', 'string', 'resize');
            const size = integers(req(a, 'size', 'array', 'resize'), 'size', 'resize', [2, 3]);
            const sc = lab.scene('resize');
            const d = findByName(sc.runner, name, 'resize');
            const pos = placementOf(sc.runner, d);
            if (!pos.rect) { throw new Error('resize: "' + name + '" is a ' + sc.runner.kindOf(d) + ' — it is placed by its center; it has no rect to resize.'); }
            const r = pos.rect;
            if (r.length === 4 && size.length === 3) { throw new Error('resize: "' + name + '" is a 2D rect [left, top, w, h] — it has no depth to set.'); }
            const next = (r.length === 6)
                ? [r[0], r[1], r[2], size[0], size[1], (size.length === 3 ? size[2] : r[5])]
                : [r[0], r[1], size[0], size[1]];
            writePosition(sc.runner, d, { rect: next }, { op: 'resize', by: 'maxi' });
            return Object.assign({ resized: name }, placementOf(sc.runner, d));
        }
    },
    grab: {
        args: { name: 'string, required — the object to hold (it is highlighted); where it is now is remembered for revert{}' },
        returns: '{grabbed:name, center, rect?}',
        example: { name: 'screen' },
        run: function (lab, a) {
            const name = req(a, 'name', 'string', 'grab');
            const sc = lab.scene('grab');
            const g = takeGrab(lab, sc.runner, name, 'grab');
            return Object.assign({ grabbed: name }, g.baseline);
        }
    },
    dragTo: {
        args: {
            to: 'array, required — the object\'s new CENTER [x, y] (or [x, y, z] in 3D), whole world pixels (integers; a fraction is refused); a point outside the world is refused by the SDK naming the world\'s bounds',
            name: 'string, optional — the object to drag (grabs it first); omitted = the object grab{} is holding',
            ticks: 'number, optional — world ticks the move takes (default ' + DRAG_DEFAULTS.ticks + '); the object steps every tick along a straight line. (ticks + settle) / everyTicks / fps must land in ' + CLIP_BAND,
            settle: 'number, optional — ticks the clip keeps filming after arrival (default ' + DRAG_DEFAULTS.settle + ')',
            everyTicks: 'number, optional — frames every N ticks (default ' + DRAG_DEFAULTS.everyTicks + ')',
            fps: 'number, optional — playback rate (default ' + DRAG_DEFAULTS.fps + ')',
            note: 'string, optional — the note that rides with the clip'
        },
        returns: 'the lab hands the clip of the drag to you with its question, and this result carries your answer: {dragged:name, from:{center, rect?}, to:{center, rect?}, zHeld, ticks, settle, mime:"video/mp4", frames, firstTick, lastTick, seconds, asked:true, interaction_id, answer_excerpt, …}. zHeld:true means a flat wall was asked for a z and stayed on the z = 0 plane. The object stays where it landed (revert{} puts it back).',
        example: { name: 'mirror', to: [300, 200], ticks: 150 },
        run: async function (lab, a) {
            const to = integers(req(a, 'to', 'array', 'dragTo'), 'to', 'dragTo', [2, 3]);
            const ticks = posInt(a.ticks, 'ticks', 'dragTo', DRAG_DEFAULTS.ticks);
            const settle = (a.settle === 0) ? 0 : posInt(a.settle, 'settle', 'dragTo', DRAG_DEFAULTS.settle);
            const recordOpts = {
                everyTicks: posInt(a.everyTicks, 'everyTicks', 'dragTo', DRAG_DEFAULTS.everyTicks),
                stopAt: { ticks: ticks + settle },
                fps: posInt(a.fps, 'fps', 'dragTo', DRAG_DEFAULTS.fps)
            };
            const planned = plannedFrames(ticks + settle, recordOpts.everyTicks, Infinity, false);
            recordOpts.maxFrames = planned + 1;   // headroom: stopAt ends the clip, the bound only guards memory
            assertClipSeconds('dragTo', planned, recordOpts.fps, '(ticks ' + ticks + ' + settle ' + settle + ') / everyTicks ' + recordOpts.everyTicks + ' plans');
            const sc = lab.scene('dragTo');
            if (to.length === 3 && worldShape(sc).dimensions === 2) { throw new Error('dragTo: this scene is a 2D world — give `to` as [x, y].'); }
            const g = (a.name !== undefined && a.name !== null) ? takeGrab(lab, sc.runner, req(a, 'name', 'string', 'dragTo'), 'dragTo') : requireGrab(lab, 'dragTo');
            const from = placementOf(sc.runner, g.obj);
            const start = from.center;
            const dest = (to.length === 2) ? [to[0], to[1], start[2]] : to.slice();
            const vision = visionOf(sc, 'dragTo');
            // The drag is a per-tick placement on the runner's OWN tick seam (addTickListener), subscribed
            // BEFORE the recorder's listener so each frame is captured with that tick's position applied.
            // On arrival it unsubscribes inside its own tick. A placement the SDK refuses (a point outside
            // the world) stops the drag and the recording; the refusal comes back verbatim, nothing is sent.
            const abort = new AbortController();
            recordOpts.signal = abort.signal;
            let n = 0;
            let refused = null;
            let left = null;
            let subscribed = true;
            const unsub = sc.runner.addTickListener(function () {
                n += 1;
                const f = Math.min(1, n / ticks);
                try {
                    left = writePosition(sc.runner, g.obj, { center: start.map(function (v, i) { return v + (dest[i] - v) * f; }) }, { op: 'dragTo', by: 'maxi' });
                } catch (e) { refused = e; }
                if (n >= ticks || refused) { off(); }
                if (refused) { abort.abort(); }
            });
            function off() { if (subscribed) { subscribed = false; unsub(); } }
            let clip;
            try {
                const video = await vision.record(recordOpts).catch(function (e) { if (refused) { return null; } throw e; });
                if (refused) { throw refused; }
                clip = clipOf(video, 'dragTo');
            } finally {
                off();
            }
            const label = 'DRAG ' + g.name + ' — ticks ' + clip.first + '-' + clip.last + ', ' + clip.frames.length + ' frames';
            const out = await ferry(lab, 'dragTo', clip, recordOpts, label,
                noteOr(a, 'Maxi drags "' + g.name + '" to ' + JSON.stringify(to) + ' over ' + ticks + ' ticks and watches, ticks ' + clip.first + ' to ' + clip.last + '.'));
            return Object.assign({ dragged: g.name, from: from, to: placementOf(sc.runner, g.obj), zHeld: !!(left && left.zHeld), ticks: ticks, settle: settle }, out);
        }
    },
    revert: {
        args: {},
        returns: '{reverted:name, center, rect?} — the grabbed object back where grab{} (or dragTo{name}) found it (a resized wall gets its old size back too)',
        example: {},
        run: function (lab) {
            const g = requireGrab(lab, 'revert');
            const sc = lab.scene('revert');
            writePosition(sc.runner, g.obj, g.baseline.rect ? { rect: g.baseline.rect } : { center: g.baseline.center }, { op: 'revert', by: 'maxi' });
            return Object.assign({ reverted: g.name }, placementOf(sc.runner, g.obj));
        }
    },
    release: {
        args: {},
        returns: '{released:name, center, rect?} — the object stays where it is',
        example: {},
        run: function (lab) {
            const g = requireGrab(lab, 'release');
            const sc = lab.scene('release');
            sc.runner.setSelectHighlight(null);
            lab.state.grab = null;
            return Object.assign({ released: g.name }, placementOf(sc.runner, g.obj));
        }
    },
    setCamera: {
        args: {
            preset: 'string, optional — a camera preset name (the SDK refuses an unknown one by name)',
            orbit: 'object, optional — the pose. 2D: {target:{x,y}, distance} where target is the point at the view centre (null = canvas centre) and distance is the visible world height in pixels (smaller = zoomed in). 3D: {azimuth, elevation, distance, roll?, target?:{x,y,z}}'
        },
        returns: '{camera: the live pose}',
        example: { orbit: { target: { x: 236, y: 200 }, distance: 200 } },
        run: function (lab, a) {
            const sc = lab.scene('setCamera');
            const cam = sc.runner.cameraControl;
            if (!cam) { throw new Error('setCamera: this scene\'s renderer publishes no camera control (runner.cameraControl is null).'); }
            if (a.preset !== undefined) { cam.setPreset(req(a, 'preset', 'string', 'setCamera')); }
            else if (a.orbit !== undefined) {
                if (!a.orbit || typeof a.orbit !== 'object') { throw new Error('setCamera: `orbit` must be an object (2D: {target, distance}; 3D: {azimuth, elevation, distance, …})'); }
                cam.setOrbit(a.orbit);
            } else { throw new Error('setCamera: give {preset} or {orbit}.'); }
            return { camera: cam.getOrbit() };
        }
    },
    pause: {
        args: {}, returns: '{paused:true, tick}', example: {},
        run: function (lab) { const sc = lab.scene('pause'); sc.runner.stop(); return { paused: true, tick: sc.tick() }; }
    },
    resume: {
        args: {}, returns: '{running:true, tick}', example: {},
        run: function (lab) { const sc = lab.scene('resume'); sc.runner.start(); return { running: true, tick: sc.tick() }; }
    },
    restart: {
        args: {}, returns: 'the scene run again from tick 0 on the same page (same sketch, same declared names; everything moved goes back to where the sketch put it): {scene, …, tick, objects:[names]}', example: {},
        run: function (lab) { lab.scene('restart'); return lab.restart(); }
    },
    inventory: {
        args: {},
        returns: '{tick, scene, id, mode, modes:[declared registry modes], renderer, dimensions: 2|3 (the booted world: 3 when it has depth), canvas:[w,h] or [w,h,d], camera: pose|null, viewer: {toward:"+z"|"-z"|null, away} in 3D (read off the live camera: which z direction comes nearer on screen; null when it looks across z) | null in 2D, objects:[{name, kind, authority:"center"|"rect"|null, center?, rect?}]} — what the scene declared, nothing else (authority null: it cannot be moved)',
        example: {},
        run: function (lab) { return lab.inventory(); }
    },
    see: {
        args: {
            everyTicks: 'number, optional — a frame every N ticks (default ' + SEE_DEFAULTS.everyTicks + ')',
            stopAt: 'object, optional — {ticks: K} after the first capture, or {tick: T} absolute (default {ticks: ' + SEE_DEFAULTS.stopAt.ticks + '})',
            maxFrames: 'number, optional — memory bound (default ' + SEE_DEFAULTS.maxFrames + '; reaching it reports truncated:true)',
            fps: 'number, optional — playback rate (default ' + SEE_DEFAULTS.fps + ' → the defaults make a 5.1-second clip); frames / fps must land in ' + CLIP_BAND,
            note: 'string, optional — the note that rides with the clip'
        },
        returns: 'the lab hands the clip to you with its question; this result carries your answer: {mime:"video/mp4", codec, frames, firstTick, lastTick, everyTicks, fps, seconds, truncated, base64Length, label, asked:true, interaction_id, answer_excerpt}',
        example: {},
        run: async function (lab, a) {
            const sc = lab.scene('see');
            const vision = visionOf(sc, 'see');
            const opts = {
                everyTicks: posInt(a.everyTicks, 'everyTicks', 'see', SEE_DEFAULTS.everyTicks),
                stopAt: a.stopAt !== undefined ? a.stopAt : SEE_DEFAULTS.stopAt,
                maxFrames: posInt(a.maxFrames, 'maxFrames', 'see', SEE_DEFAULTS.maxFrames),
                fps: posInt(a.fps, 'fps', 'see', SEE_DEFAULTS.fps)
            };
            const st = opts.stopAt;
            if (!st || typeof st !== 'object') { throw new Error('see: `stopAt` must be {ticks: K} or {tick: T}, got ' + JSON.stringify(st)); }
            const span = (typeof st.ticks === 'number') ? st.ticks
                : (typeof st.tick === 'number' && typeof sc.tick() === 'number') ? st.tick - sc.tick() : null;
            if (span === null) { throw new Error('see: `stopAt` must be {ticks: K} or {tick: T} with a numeric value, got ' + JSON.stringify(st)); }
            assertClipSeconds('see', plannedFrames(span, opts.everyTicks, opts.maxFrames, false), opts.fps, 'stopAt / everyTicks (capped by maxFrames) plans');
            const clip = clipOf(await vision.record(opts), 'see');
            const label = 'SEE — ticks ' + clip.first + '-' + clip.last + ', ' + clip.frames.length + ' frames';
            return ferry(lab, 'see', clip, opts, label,
                noteOr(a, 'Maxi looks: a ' + clip.frames.length + '-frame clip of the lab, ticks ' + clip.first + ' to ' + clip.last + '.'));
        }
    },
    record: {
        args: {
            waypoints: 'array, required — the camera flight [{atTick, pose}, …]; atTick counts from the moment the recording starts. 2D pose: {target:{x,y}, distance} (pan/zoom); 3D pose: {azimuth, elevation, distance, target?:{x,y,z}}. Every waypoint must declare the same pose keys (the SDK refuses a mixed target:null / point path)',
            everyTicks: 'number, optional — a frame every N ticks (default ' + RECORD_DEFAULTS.everyTicks + ')',
            maxFrames: 'number, optional — memory bound (default: floor(lastAtTick / everyTicks) + 1, sized off the flight)',
            fps: 'number, optional — playback rate (default ' + RECORD_DEFAULTS.fps + '); (last atTick / everyTicks) / fps must land in ' + CLIP_BAND + ' — at the defaults, a flight of 250 to 500 ticks',
            note: 'string, optional — the note that rides with the clip'
        },
        returns: 'the lab hands the flown clip to you with its question; this result carries your answer: {mime, codec, frames, firstTick, lastTick, everyTicks, fps, seconds, truncated, base64Length, label, asked:true, interaction_id, answer_excerpt, poses:{first,last}}',
        example: { waypoints: [
            { atTick: 0, pose: { target: { x: 300, y: 200 }, distance: 400 } },
            { atTick: 200, pose: { target: { x: 236, y: 200 }, distance: 160 } },
            { atTick: 400, pose: { target: { x: 300, y: 200 }, distance: 400 } }
        ] },
        run: async function (lab, a) {
            const wps = req(a, 'waypoints', 'array', 'record');
            if (!wps.length) { throw new Error('record: `waypoints` must hold at least one {atTick, pose}.'); }
            const sc = lab.scene('record');
            if (!sc.runner.cameraControl) { throw new Error('record: this scene\'s renderer publishes no camera control (runner.cameraControl is null) — a flight has nothing to fly; see{} films without flying.'); }
            const everyTicks = posInt(a.everyTicks, 'everyTicks', 'record', RECORD_DEFAULTS.everyTicks);
            const lastAt = Math.max.apply(null, wps.map(function (w) { return Number(w && w.atTick); }));
            if (!isFinite(lastAt)) { throw new Error('record: every waypoint needs a numeric atTick.'); }
            const vision = visionOf(sc, 'record');
            const opts = {
                everyTicks: everyTicks,
                stopAt: { path: { waypoints: wps } },
                maxFrames: posInt(a.maxFrames, 'maxFrames', 'record', Math.floor(lastAt / everyTicks) + 1),
                fps: posInt(a.fps, 'fps', 'record', RECORD_DEFAULTS.fps)
            };
            assertClipSeconds('record', plannedFrames(lastAt, opts.everyTicks, opts.maxFrames, true), opts.fps, 'the flight (last atTick ' + lastAt + ') / everyTicks plans');
            const clip = clipOf(await vision.record(opts), 'record');
            const label = 'RECORD — flight over ticks ' + clip.first + '-' + clip.last + ', ' + clip.frames.length + ' frames';
            const out = await ferry(lab, 'record', clip, opts, label,
                noteOr(a, 'Maxi flies: a ' + clip.frames.length + '-frame camera flight, ticks ' + clip.first + ' to ' + clip.last + '.'));
            out.poses = { first: clip.frames[0].pose, last: clip.frames[clip.frames.length - 1].pose };
            return out;
        }
    },
    showMemory: {
        args: { id: 'string, required — a memory id; its clip is served beside this page at memories/<id>/clip.mp4 (a clip already recorded; this hand films nothing)', note: 'string, optional — the note that rides with the clip' },
        returns: 'the lab hands the remembered clip to you with its question; this result carries your answer: {memory:id, mime, bytes, url, asked:true, interaction_id, answer_excerpt}',
        example: { id: 'first-double-slit' },
        run: async function (lab, a) {
            const id = req(a, 'id', 'string', 'showMemory');
            const m = await lab.fetchMemory('showMemory', id);
            const asked = await lab.ask('showMemory', {
                note: noteOr(a, 'Maxi remembers "' + id + '": the clip recorded for that memory.'),
                media: [{ mime_type: m.mime_type, data: m.data, label: 'MEMORY ' + id }]
            });
            return Object.assign({ memory: id, mime: m.mime_type, bytes: m.bytes, url: m.url }, askedOf(asked));
        }
    },
    say: {
        args: { text: 'string, required' },
        returns: '{said:text} — shown on the lab page beside the scene',
        example: { text: 'Watch the beam: I am about to move the mirror.' },
        run: function (lab, a) { const text = req(a, 'text', 'string', 'say'); lab.say(text); return { said: text }; }
    }
});

// ── the adapter the shell dispatches into ───────────────────────────────────────────────────

/**
 * `window.DeSciX_Actions` from HANDS: one function per hand, taking the shell's single args object
 * and resolving to the result as JSON TEXT (what the shell relays back into the conversation).
 * A throw stays a throw — the error reaches Maxi verbatim.
 */
export function buildAdapter(hands, lab, gate) {
    if (gate !== undefined && typeof gate !== 'function') { throw new Error('buildAdapter: `gate` is a function gate(op) that THROWS to refuse a hand, got ' + typeof gate + '.'); }
    const out = {};
    Object.keys(hands).forEach(function (op) {
        out[op] = function (args) {
            return Promise.resolve()
                .then(function () { if (gate) { gate(op); } return hands[op].run(lab, bag(args)); })
                .then(function (result) { return JSON.stringify(result); });
        };
    });
    return Object.freeze(out);
}

/**
 * THE ONE place `DeSciX_Actions` is assigned: the adapter built from HANDS, checked before it is returned.
 * maxi-lab.js calls this; scripts/test/hands.test.mjs fails if any other line of site/ assigns the global.
 * `gate(op)` (required) runs before every hand the SHELL dispatches and throws to refuse it — the lab
 * refuses a shell Run while Maxi is working (the loop's own body builds its adapter without it).
 */
export function publishHands(win, lab, gate) {
    if (typeof gate !== 'function') { throw new Error('publishHands(win, lab, gate): the shell\'s adapter needs gate(op) — the lab\'s refusal while Maxi is working.'); }
    const adapter = buildAdapter(HANDS, lab, gate);
    assertAdapterCoversHands(adapter, HANDS);
    win.DeSciX_Actions = adapter;
    return adapter;
}

/** The adapter's keys are HANDS' keys, exactly — a hand-typed table is refused by name. */
export function assertAdapterCoversHands(adapter, hands) {
    const want = Object.keys(hands);
    const have = Object.keys(adapter || {});
    const missing = want.filter(function (k) { return typeof adapter[k] !== 'function'; });
    const extra = have.filter(function (k) { return !Object.prototype.hasOwnProperty.call(hands, k); });
    if (missing.length || extra.length) {
        throw new Error('DeSciX_Actions does not match HANDS — missing: [' + missing.join(', ') + '], extra: [' + extra.join(', ') + '].');
    }
    return true;
}

// ── the persona's hands section, rendered from the EXECUTING table ─────────────────────────

/**
 * HOW a hand is invoked. Verified facts only:
 *   - the dispatch shape (one ```json:call:<fn> block, strict-JSON body, a human clicks Run, the return
 *     value goes back into the conversation, a malformed body is dropped without a word) is what the
 *     godsworld-dev lab MEASURED against the shell (its page comments cite CodeSiteWidget.handleExecuteAction
 *     and the ChatWidget Run gate; design/maxi-frqtl-sdk-programming-notes.md §3, 2026-09-02);
 *   - the app side (site/DeSciXAppSDK.js) names the exact global the shell looks up, `window.DeSciX_Actions`,
 *     and the command door `DeSciX.call` the page asks the question through — that file carries no json:call
 *     parser, so the fence mechanics are the shell's, measured, not read;
 *   - the eyes: the page hands every clip to the question command's `media[]` itself (maxi-ask.js); a clip
 *     on that field was described with media_tokens 300 (record: godsworld-dev docs/records/2026-10-15-egpt-godsworld-records-moved.md).
 */
export const HANDS_PREAMBLE = [
    'HOW YOU ACT. A hand is words in one exact shape, not a tool that can be missing. To use one, END your',
    'reply with ONE fenced block whose tag is exactly `json:call:<hand>` and whose body is ONE strict-JSON',
    'object of named arguments (double quotes, no comments, no trailing commas; `{}` when a hand takes none):',
    '',
    '```json:call:inventory',
    '{}',
    '```',
    '',
    'The lab page turns that block into a Run button; a human presses it; only then does the hand move, and',
    'its result (a JSON object) or its error (verbatim) comes back to you as the next message. One action',
    'block per reply. A malformed body is dropped by the shell without a word — your hand simply does not',
    'move and nobody tells you why — so write strict JSON. Never say a hand "is unavailable"; write the block.',
    'When you are read without your lab page (plain chat), the block shows as text: say what you would do.',
    '',
    'YOUR EYES ARE VIDEO. `see` films a clip of the lab through its own renderer; `dragTo` moves a thing',
    'across world ticks while filming, so you WATCH what the drag did; `record` flies the camera while',
    'filming; `showMemory` replays a remembered clip. Every clip lasts ' + CLIP_BAND + ' (duration = frames / fps); a hand',
    'asked for a shorter or longer clip refuses and says so. The LAB PAGE delivers the footage: it hands the',
    'clip to you itself, with the note and the question "describe exactly what you see", on the lab\'s own',
    'thread, and you answer there, in words; your answer is shown to the human in the lab\'s conversation',
    'strip, and its first lines come back in the hand\'s result as answer_excerpt (with asked:true and the',
    'thread\'s interaction_id). When the human presses Record, the lab hands you the demonstration the same',
    'way: the clip, plus the list of what was moved. Nothing reaches you as a chat attachment. Describe only',
    'what the footage shows — what you remember about a scene is not what you saw; "I looked at the',
    'readings" is `inventory`; "I saw" is the answer you gave to the footage. A refused question comes back',
    'as the hand\'s error, verbatim: then you have NOT seen it, so say so.',
    '',
    'COORDINATES. ' + RECT_CONVENTION
].join('\n');

export function renderHandsMarkdown(hands) {
    const lines = [HANDS_MARKERS.begin, '', HANDS_PREAMBLE, '', '| hand | arguments | returns |', '|---|---|---|'];
    Object.keys(hands).forEach(function (op) {
        const h = hands[op];
        const args = Object.keys(h.args || {});
        const argText = args.length
            ? args.map(function (k) { return '`' + k + '` — ' + h.args[k]; }).join('<br>')
            : '_none_ (`{}`)';
        lines.push('| `' + op + '` | ' + escapeCell(argText) + ' | ' + escapeCell(h.returns) + ' |');
    });
    lines.push('', 'WORKED EXAMPLES — one per hand, exactly as you would end a reply:', '');
    Object.keys(hands).forEach(function (op) {
        const h = hands[op];
        if (!Object.prototype.hasOwnProperty.call(h, 'example')) { throw new Error('[hands] ' + op + ' declares no example — every hand carries one.'); }
        lines.push('```json:call:' + op, JSON.stringify(h.example, null, 2), '```', '');
    });
    lines.push(HANDS_MARKERS.end);
    return lines.join('\n') + '\n';
}

function escapeCell(s) { return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
