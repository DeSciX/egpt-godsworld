/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-record.js — the human's RECORD button: a demonstration for Maxi.
 *
 * The human demonstrates and Maxi watches: Record hands Maxi the video of what the human did
 * together with every change it made to the scene.
 *
 * While Record is on, FrqtlVision.record — the SAME recorder and the same 5–10 s clip band the
 * hands use (CLIP_SECONDS, RECORD_DEFAULTS) — films the stage in SEGMENTS: a segment is the band's
 * maximum (10 s of clip); when the human keeps going, the next segment starts as the last one
 * ends (never refused), and the status line says which segment is rolling. Every position write
 * made through the ONE write helper (maxi-hands.js writePosition: the hand tool's drags, Maxi's
 * dragTo/moveObject/resize/revert) is appended to the change log by writePosition's own listener
 * seam (onWrite) — this module keeps no second logger (scripts/test/record.test.mjs is red if it
 * does). Pressing Record again stops it: a segment shorter than the band's minimum is finished to
 * the minimum first (the band is the hands' rule, kept), then ONE demonstration is built:
 *
 *   { scene, clips:[{mime, codec, frames, firstTick, lastTick, seconds, …}], changes:[{tick, name,
 *     op, by, from, to}], sketchDiff: null, sketchDiffReason }
 *
 * sketchDiff is null BY MEASUREMENT: no sketch serializer ships in the vendored @descix/frqtl-sdk
 * (SDK_VERSION; no toSketch/toSource/exportSketch/sketchOf in its dist — scripts/test/record.test.mjs
 * greps the vendored dist and is red the day one ships), so the demonstration ships the
 * change list and says so — no invented diff. The
 * demonstration reaches Maxi through the door the hands use (lab.ask → the question command,
 * app-assets/maxi-ask.js): ONE question carrying every segment as `media[]`, the change list riding
 * in the note; it is shown to the human as a card (clip + change lines) and Maxi's answer appears on
 * the lab's conversation strip. The demonstration records {asked:true, interaction_id, answer_excerpt}.
 */

import { onWrite, CLIP_SECONDS, RECORD_DEFAULTS, plannedFrames } from './maxi-hands.js';
import { SDK_VERSION } from './frqtl-sdk.js';

export const RECORD_KEYS = Object.freeze({ toggle: 'KeyR' });

/** What the lab paints when a scene swap drops a running recording (its own message; the hand never clears it). */
export const RECORD_DROPPED = '[record] that recording was dropped: scene changed — no demonstration was built or sent.';

/** Stop on a paused world: a recording samples by TICK, so the 5 s minimum cannot be finished while paused. */
export function pausedStopError(elapsedSeconds) {
    return new Error('record: the world is paused, so Stop cannot finish the recording — a recording samples by TICK, never by the clock, and this segment has ' +
        elapsedSeconds.toFixed(1) + ' s of the ' + CLIP_SECONDS.min + ' s minimum. Resume, then press Stop. Still recording.');
}

export const SKETCH_DIFF_UNAVAILABLE =
    'no sketch serializer in @descix/frqtl-sdk ' + SDK_VERSION + '; recipeContext.toSketch() lands in 0.6.0, ' +
    'after which the demonstration carries the diff of two toSketch() texts (Record start / stop) — until then it ships the change list, not an invented diff';

/** A segment's tick budget from the hands' band and recorder defaults — ONE derivation. */
export function segmentTicks(band, defaults) {
    band = band || CLIP_SECONDS; defaults = defaults || RECORD_DEFAULTS;
    return { max: band.max * defaults.fps * defaults.everyTicks, min: band.min * defaults.fps * defaults.everyTicks };
}

function isEditable(el) {
    const tag = el && el.tagName;
    return !!el && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true);
}
export function recordKeyAction(ev) {
    if (!ev || isEditable(ev.target)) { return null; }
    return ((ev.code || ev.key) === RECORD_KEYS.toggle) ? 'toggle' : null;
}

function tupleText(pos) {
    if (!pos || (!pos.center && !pos.rect)) { throw new Error('record: a change carries no position ' + JSON.stringify(pos) + ' — writePosition always reads one; this change did not come from it.'); }
    return pos.center ? 'center [' + pos.center.join(', ') + ']' : 'rect [' + pos.rect.join(', ') + ']';
}

/** The change list as lines a model reads: "tick 123 · drag (human) mirror: rect [..] → rect [..]". */
export function changesAsText(changes) {
    if (!changes.length) { return '(no object was moved during this recording)'; }
    return changes.map(function (c) {
        return 'tick ' + c.tick + ' · ' + c.op + ' (' + c.by + ') ' + c.name + ': ' + tupleText(c.from) + ' → ' + tupleText(c.to);
    }).join('\n');
}

/** ONE demonstration from the segments and the change log. Zero changes still carries its clips. */
export function buildDemonstration(scene, clips, changes) {
    if (!Array.isArray(clips) || !clips.length) { throw new Error('record: a demonstration needs at least one clip — nothing was filmed.'); }
    return {
        scene: { label: scene.label, id: scene.id, mode: scene.mode, renderer: scene.renderer },
        clips: clips.map(function (c, i) {
            return {
                segment: i + 1, mime: c.video.encoded.mime, codec: c.video.encoded.codec, muxer: c.video.encoded.muxer,
                frames: c.frames.length, firstTick: c.first, lastTick: c.last,
                everyTicks: RECORD_DEFAULTS.everyTicks, fps: RECORD_DEFAULTS.fps, seconds: c.frames.length / RECORD_DEFAULTS.fps,
                truncated: !!c.video.truncated, base64Length: c.video.encoded.bytes.length
            };
        }),
        changes: changes.slice(),
        sketchDiff: null,
        sketchDiffReason: SKETCH_DIFF_UNAVAILABLE
    };
}

/** The note of a demonstration question: what was recorded, and the change list. ONE composition. */
export function demonstrationNote(scene, clips, changes) {
    const span = clips.length === 1 ? 'one clip' : clips.length + ' clips, one per segment, in order';
    return 'The human pressed Record in ' + scene.label + ' and made this demonstration: ' + span + ', ticks ' + clips[0].first + ' to ' + clips[clips.length - 1].last + '.\n' +
        'Changes made through the lab\'s write path during the recording:\n' + changesAsText(changes) + '\n' +
        'Sketch diff: none — ' + SKETCH_DIFF_UNAVAILABLE + '.';
}

/** The demonstration's footage: every segment, labelled, as media[] items. */
export function demonstrationMedia(scene, clips) {
    return clips.map(function (c, i) {
        return {
            mime_type: c.video.encoded.mime, data: c.video.encoded.bytes, truncated: !!c.video.truncated,
            label: 'DEMONSTRATION ' + scene.label + ' — segment ' + (i + 1) + '/' + clips.length + ', ticks ' + c.first + '-' + c.last + ', ' + c.frames.length + ' frames'
        };
    });
}

/** An object URL for a base64 clip (the card's video and the conversation's inline clip). The caller revokes it. */
export function clipObjectUrl(mime, base64) {
    if (typeof mime !== 'string' || !mime || typeof base64 !== 'string' || !base64) { throw new Error('[record] clipObjectUrl needs a mime and raw base64 bytes.'); }
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/**
 * The conversation's clip URLs: every inline clip's object URL is made here and kept until the strip is
 * cleared (New conversation), when revokeAll() frees them all — a clip still shown in the strip stays playable.
 */
export function clipUrlLedger() {
    let urls = [];
    return {
        make: function (mime, base64) { const url = clipObjectUrl(mime, base64); urls.push(url); return url; },
        revokeAll: function () { const n = urls.length; urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = []; return n; },
        get size() { return urls.length; }
    };
}

/**
 * THE demonstration card painter: the clip a demonstration keeps, its title and its lines. Record's
 * demonstration and a clip the Owl approved in the three-role loop (maxi-lab.js) are painted here alone.
 */
export function paintCard(card, d) {
    if (!card || !card.root || !card.video || !card.title || !card.lines) { throw new Error('[record] paintCard needs the card elements {root, video, title, lines}.'); }
    const url = clipObjectUrl(d.mime, d.base64);
    if (card.video.dataset.url) { URL.revokeObjectURL(card.video.dataset.url); }   // the clip it replaces
    card.video.dataset.url = url;
    card.video.src = url;
    card.title.textContent = d.title;
    card.lines.textContent = d.lines;
    card.root.hidden = false;
}

/**
 * @param {{lab:object, onChange?:function, onError:function, card?:{root:Element, video:Element, lines:Element, title:Element}}} spec
 *   lab — maxi-lab's lab (scene(op), ask(op, {note, media[]}), state); card — the human's card elements.
 */
export function attachRecorder(spec) {
    if (!spec || !spec.lab || typeof spec.lab.scene !== 'function' || typeof spec.lab.ask !== 'function') {
        throw new Error('[record] attachRecorder needs the lab (scene(op), ask(op, {note, media[]})).');
    }
    if (typeof spec.onError !== 'function') { throw new Error('[record] attachRecorder needs onError(err) — the lab\'s error bar.'); }
    const lab = spec.lab;
    const onError = spec.onError;
    const onChange = typeof spec.onChange === 'function' ? spec.onChange : function () {};
    const card = spec.card || null;
    const budget = segmentTicks();

    const st = { on: false, stopping: false, dropped: false, scene: null, vision: null, clips: [], changes: [], segment: null, unsubscribeWrite: null, loop: null, last: null, error: null };

    function fail(err) { st.error = String((err && err.message) || err); onError(err); onChange(state()); }

    function visionOf(sc) {
        const FV = sc.win && sc.win.FrqtlVision;
        if (!FV || typeof FV.attach !== 'function') { throw new Error('record: the scene document publishes no window.FrqtlVision — the GAME roster did not inject objects/objects/FrqtlVision.js.'); }
        if (!sc.runner.isRunning) { throw new Error('record: the world is paused, so no tick will arrive to film (a recording samples by TICK, never by the clock) — resume first.'); }
        return FV.attach(sc.runner);
    }
    function clipOf(video) {
        const frames = video && video.track && video.track.frames;
        if (!frames || !frames.length) { throw new Error('record: the recorder returned no frames.'); }
        return { video: video, first: frames[0].tick, last: frames[frames.length - 1].tick, frames: frames };
    }

    async function segmentLoop() {
        while (true) {
            const controller = new AbortController();
            const planned = plannedFrames(budget.max, RECORD_DEFAULTS.everyTicks, Infinity, false);
            st.segment = { index: st.clips.length + 1, startTick: st.scene.tick(), controller: controller };
            onChange(state());
            const video = await st.vision.record({
                everyTicks: RECORD_DEFAULTS.everyTicks, fps: RECORD_DEFAULTS.fps,
                stopAt: { ticks: budget.max }, maxFrames: planned + 1, signal: controller.signal
            });
            st.clips.push(clipOf(video));
            st.segment = null;
            if (st.stopping || !st.on) { return; }   // stopped, or disposed by a scene swap: never roll onto a dead scene
        }
    }

    function start() {
        if (st.on) { return state(); }
        const sc = lab.scene('record');
        st.error = null;
        st.vision = visionOf(sc);
        st.scene = sc; st.clips = []; st.changes = []; st.stopping = false; st.dropped = false; st.last = null;
        st.unsubscribeWrite = onWrite(function (w) {
            if (!st.on) { return; }
            st.changes.push({ tick: sc.tick(), name: w.name, op: w.op, by: w.by, from: w.from, to: w.to });
            onChange(state());
        });
        st.on = true;
        st.loop = segmentLoop().catch(function (err) {
            // After dispose() the recording is the lab's RECORD_DROPPED, already painted; the rejection
            // goes back to dispose()'s awaiter (which logs it), never to the error bar over that message.
            if (st.dropped) { throw err; }
            st.on = false; st.segment = null; fail(err);
        });
        onChange(state());
        return state();
    }

    function elapsedTicks() { return (st.segment && st.scene) ? (st.scene.tick() - st.segment.startTick) : 0; }

    async function stop() {
        if (!st.on) { throw new Error('record: not recording — press Record (R) first.'); }
        // The band's minimum is the hands' rule: a segment under it is finished to the minimum, then cut.
        // Ticks finish it, so a paused world REFUSES Stop by name (and keeps recording) instead of waiting.
        if (!st.scene.runner.isRunning) { throw pausedStopError(elapsedTicks() / (RECORD_DEFAULTS.everyTicks * RECORD_DEFAULTS.fps)); }
        st.stopping = true;
        onChange(state());
        while (st.segment && elapsedTicks() < budget.min) {
            if (!st.scene.runner.isRunning) {   // paused while finishing the minimum: the same refusal, still recording
                st.stopping = false; onChange(state());
                throw pausedStopError(elapsedTicks() / (RECORD_DEFAULTS.everyTicks * RECORD_DEFAULTS.fps));
            }
            await new Promise(function (r) { setTimeout(r, 100); });
        }
        if (st.segment) { st.segment.controller.abort(); }
        await st.loop;
        if (st.dropped) { return null; }   // a scene swap dropped it while it finished; the lab painted RECORD_DROPPED
        if (st.error) { throw new Error('record: the recording failed before Stop finished it — ' + st.error); }   // the loop's own failure, not a misleading "nothing was filmed"
        const sc = st.scene;
        if (st.unsubscribeWrite) { st.unsubscribeWrite(); st.unsubscribeWrite = null; }
        st.on = false; st.stopping = false;
        try {
            const demo = buildDemonstration(sc, st.clips, st.changes);
            st.last = demo;
            renderCard(demo, st.clips);                       // the human sees what was filmed while Maxi looks
            const asked = await lab.ask('record', { note: demonstrationNote(sc, st.clips, st.changes), media: demonstrationMedia(sc, st.clips) });
            demo.asked = true;
            demo.interaction_id = asked.interaction_id;
            demo.answer_excerpt = asked.answer_excerpt;
            renderCard(demo, st.clips);
            onChange(state());
            return demo;
        } catch (err) { fail(err); throw err; }
    }

    function renderCard(demo, clips) {
        if (!card) { return; }
        const c = clips[0];
        paintCard(card, {
            mime: c.video.encoded.mime, base64: c.video.encoded.bytes,
            title: 'Demonstration · ' + demo.scene.label + ' · ' + demo.clips.length + ' clip' + (demo.clips.length === 1 ? '' : 's') +
                ' (' + demo.clips.map(function (k) { return k.seconds.toFixed(1) + ' s'; }).join(' + ') + ') · ' + demo.changes.length + ' change' + (demo.changes.length === 1 ? '' : 's') +
                (demo.asked ? ' · Maxi answered' : ''),
            lines: changesAsText(demo.changes) + '\n' + 'sketch diff: none — ' + SKETCH_DIFF_UNAVAILABLE
        });
    }

    function state() {
        const secs = elapsedTicks() / (RECORD_DEFAULTS.everyTicks * RECORD_DEFAULTS.fps);
        return {
            on: st.on, stopping: st.stopping, segment: st.segment ? st.segment.index : null, clips: st.clips.length, changes: st.changes.length,
            elapsedTicks: elapsedTicks(), elapsedSeconds: secs, minTicks: budget.min, maxTicks: budget.max, error: st.error, last: st.last,
            text: !st.on ? 'record off (R)'
                : (st.stopping ? 'REC stopping' + (st.segment && elapsedTicks() < budget.min ? ' · finishing the ' + CLIP_SECONDS.min + ' s minimum' : '')
                    : 'REC segment ' + (st.segment ? st.segment.index : '-') + ' · ' + secs.toFixed(1) + ' s / ' + CLIP_SECONDS.max + ' s' +
                      (st.clips.length ? ' · ' + st.clips.length + ' done' : '')) + ' · ' + st.changes.length + ' change' + (st.changes.length === 1 ? '' : 's')
        };
    }

    return {
        get recording() { return st.on; },
        start: start, stop: stop,
        toggle: function () { return st.on ? stop() : Promise.resolve(start()); },
        state: state,
        last: function () { return st.last; },
        /**
         * Drop a running recording (the scene is about to be replaced). Await it BEFORE the scene document
         * goes: the segment is aborted and its encoder settles while the frame still exists, so no codec
         * error can arrive after the swap. Resolves {dropped, settled} — settled names how the dropped
         * segment ended (its error message travels here, for the lab's console, never into the error bar).
         */
        dispose: async function () {
            if (!st.on) { return { dropped: false, settled: null }; }
            st.dropped = true;
            st.on = false; st.stopping = false;
            if (st.unsubscribeWrite) { st.unsubscribeWrite(); st.unsubscribeWrite = null; }
            if (st.segment) { st.segment.controller.abort(); }
            let settled = 'segment closed';
            try { await st.loop; } catch (err) { settled = 'segment ended with: ' + String((err && err.message) || err); }
            st.segment = null; st.clips = []; st.changes = [];
            onChange(state());
            return { dropped: true, settled: settled };
        }
    };
}
