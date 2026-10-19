/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-record.js — the human's RECORD button: a demonstration for Maxi.
 *
 * The human demonstrates and Maxi watches: Record hands Maxi the video of what the human did
 * together with every change it made to the scene.
 *
 * Every booted world holds one open Record, the package's (maxi-lab.js THE WORLD'S RECORD): it writes the change rows
 * of every act (the human's hand ends each act written into the sketch as the human's, maxi-hand-tool.js endAct), counts
 * its own clock and keeps every FrqtlVision recording as one of its 5–10 s clips. Pressing Record BEGINS the human's chain
 * (lab.beginChain('record')): the world's Record closes and a new one opens, the first of this demonstration. While Record
 * is on, FrqtlVision.record — the same recorder the hands use — films the stage in SEGMENTS of the band's maximum
 * (CLIP_SECONDS, RECORD_DEFAULTS: 10 s of clip); when the human keeps going, the next segment starts as the last one ends,
 * and the status line says which segment is rolling. A segment never spans a re-run or a scene change (a clip whose ticks go
 * back is refused by the package), so a restart or a scene change FINISHES the rolling segment (finishSegment: to the
 * band's minimum first), and filming resumes in the world that then runs (resumeFilming). A scene change also closes the
 * world's Record into the chain; a restart does not (one Record spans it). At most MAX_SEGMENTS clips fit one Record:
 * filming stops there, said on the status line. Pressing Record again stops it: the rolling segment is finished, the chain
 * ends (lab.endChain: the last world's Record closes) and the Records are assembled by maxi-record-folder.js — one per world
 * the demonstration filmed in, the package's folder plus lab.json (assembleRecord), chained record-01, record-02, … (recordChain).
 * The Record reaches Maxi through the door the hands use (lab.ask → the question command, app-assets/maxi-ask.js): Stop
 * shows the demonstration to the human as a card (clip + change lines) with a textarea for what they are teaching Maxi, and
 * the card's Send to Maxi (`send`) hands it over as ONE question carrying every segment of every Record as `media[]`, the
 * change list riding in the note and the human's words (if any) in the question (footageUserInput). Maxi's answer appears
 * on the lab's conversation strip; the hand-back Record's lab.json then carries asked {interaction_id, answer_excerpt} and
 * the words as `teaching`.
 */

import { CLIP_SECONDS, RECORD_DEFAULTS } from './maxi-hands.js';
import { assembleRecord, recordChain, changeText, UNHELD_KEY, TEACHING_KEY, TEACHING_PROMPT, teachingOf, changesAsText, completenessWords, base64OfBytes, MAX_SEGMENTS } from './maxi-record-folder.js';

/** What a world's Record carried from before Record was pressed (maxi-lab.js beginChain): its rows and clips are set aside from the demonstration. */
function carriedOf(w) { return w.carried || { changes: [], clips: [] }; }
function ownRows(w) { return w.folder.record.changes.slice(carriedOf(w).changes.length); }
function ownClips(w) { return w.folder.clips.slice(carriedOf(w).clips.length); }

/** The words for what was set aside: '' when nothing was carried. */
export function setAsideWords(worlds) {
    const rows = worlds.reduce(function (n, w) { return n + carriedOf(w).changes.length; }, 0);
    const clips = worlds.reduce(function (n, w) { return n + carriedOf(w).clips.length; }, 0);
    if (!rows && !clips) { return ''; }
    const by = Array.from(new Set([].concat.apply([], worlds.map(function (w) { return carriedOf(w).changes.map(function (c) { return c.by; }); })).concat(clips ? ['maxi'] : [])));
    const who = by.map(function (b) { return b === 'maxi' ? 'Maxi' : 'the human'; }).join(' and ');
    return rows + ' earlier act' + (rows === 1 ? '' : 's') + ' and ' + clips + ' clip' + (clips === 1 ? '' : 's') + ' by ' + who + ' were set aside, not part of this demonstration (made before Record was pressed; lab.json carried names them).';
}

export const RECORD_KEYS = Object.freeze({ toggle: 'KeyR' });

/** The hand name lab.json `filmed` gives the human's segments. */
export const SEGMENT_HAND = 'record';

/** Stop on a paused world: a recording samples by TICK, so the 5 s minimum cannot be finished while paused. */
export function pausedStopError(elapsedSeconds) {
    return new Error('record: the world is paused, so Stop cannot finish the recording — a recording samples by TICK, never by the clock, and this segment has ' +
        elapsedSeconds.toFixed(1) + ' s of the ' + CLIP_SECONDS.min + ' s minimum. Resume, then press Stop. Still recording.');
}

/** A scene change or restart on a paused world: it finishes the rolling segment by TICK, which cannot happen while paused. */
export function pausedCloseError(elapsedSeconds) {
    return new Error('record: the world is paused, so the scene cannot change or restart while Record is on — that finishes the rolling segment, which has ' +
        elapsedSeconds.toFixed(1) + ' s of the ' + CLIP_SECONDS.min + ' s minimum, finished by TICK. Resume, then change the scene. Still recording.');
}

/**
 * A segment's budget from the band and the recorder defaults — ONE derivation: `frames` is the band's maximum of frames
 * (CLIP_SECONDS.max × fps), `max` the ticks after the first capture that end it (its last frame), `min` the ticks a segment
 * has rolled before Stop may cut it (CLIP_SECONDS.min × fps frames, at everyTicks).
 */
export function segmentTicks(band, defaults) {
    band = band || CLIP_SECONDS; defaults = defaults || RECORD_DEFAULTS;
    const frames = band.max * defaults.fps;
    return { frames: frames, max: (frames - 1) * defaults.everyTicks, min: band.min * defaults.fps * defaults.everyTicks };
}

function isEditable(el) {
    const tag = el && el.tagName;
    return !!el && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true);
}
export function recordKeyAction(ev) {
    if (!ev || isEditable(ev.target)) { return null; }
    return ((ev.code || ev.key) === RECORD_KEYS.toggle) ? 'toggle' : null;
}

/** A clip's playback seconds, from its span on the Record's clock at the recorder's own cadence (RECORD_DEFAULTS). */
function secondsOf(c) { return ((c.lastTick - c.firstTick) / RECORD_DEFAULTS.everyTicks + 1) / RECORD_DEFAULTS.fps; }

/**
 * The human's recording → its Records: `worlds` are the chain's closed Records in order ([{folder, filmed, scene}],
 * maxi-lab.js endChain), chained by the folder's one chain owner (recordChain); `asked` rides in the hand-back Record
 * only, with the rows no Record holds (`unheld`) and the human's `teaching` words (teachingOf; undefined = absent).
 * Returns [{name, files, record, lab, faults, complete}] in chain order.
 */
export function recordsOf(worlds, asked, unheld, teaching) {
    const ch = recordChain(worlds, 'of the recording');
    return worlds.map(function (w, i) {
        const handBack = i === worlds.length - 1;
        const lab = { scene: w.scene, asked: handBack && asked ? asked : null, chain: ch.chainOf(i), handBack: Object.assign({}, ch.handBack) };
        if (handBack && unheld && unheld.length) { lab[UNHELD_KEY] = unheld.slice(); }   // rows no Record holds (the owner's key and rows)
        if (handBack && teaching !== undefined) { lab[TEACHING_KEY] = teaching; }      // the human's words (teachingOf), absent when they typed none
        return Object.assign({ name: ch.names[i] }, assembleRecord({ producer: 'record', folder: w.folder, filmed: w.filmed, carried: w.carried || null, lab: lab }));
    });
}

/** The words for rows no Record holds (a world's Record closed with rows its footage does not show): one line each, or ''. */
export function unheldWords(unheld) {
    if (!unheld || !unheld.length) { return ''; }
    return 'Changes no Record holds (a world\'s Record closed with changes its footage does not show):\n' +
        unheld.map(changeText).join('\n');
}

/** The note of a demonstration question: what was recorded in each world, and its change list. ONE composition. */
export function demonstrationNote(worlds, unheld) {
    const head = worlds.length === 1 ? 'The human pressed Record and made this demonstration in one world:' :
        'The human pressed Record and made this demonstration across ' + worlds.length + ' worlds (a scene change closes a world\'s Record; the next one follows in the chain):';
    return head + '\n' + worlds.map(function (w, i) {
        const clips = ownClips(w);
        const span = clips.length === 1 ? 'one clip' : clips.length + ' clips, one per segment, in order';
        return 'Record ' + (i + 1) + ' — ' + w.scene.label + ': ' + span + ', ticks ' + clips[0].firstTick + ' to ' + clips[clips.length - 1].lastTick + '.\n' +
            'Changes made in this world\'s Record, one per act:\n' + changesAsText(ownRows(w));
    }).join('\n') + (setAsideWords(worlds) ? '\n' + setAsideWords(worlds) : '') + (unheldWords(unheld) ? '\n' + unheldWords(unheld) : '');
}

/** The demonstration's footage: every clip of every Record, labelled, as media[] items, in filming order. */
export function demonstrationMedia(worlds) {
    const out = [];
    worlds.forEach(function (w, k) {
        const clips = ownClips(w);   // a clip carried from before Record was pressed is not the demonstration's
        clips.forEach(function (c, i) {
            out.push({
                mime_type: 'video/mp4', data: base64OfBytes(w.folder.files[c.file]),
                label: 'DEMONSTRATION ' + (worlds.length > 1 ? 'Record ' + (k + 1) + '/' + worlds.length + ' ' : '') + w.scene.label + ' — ' + c.file + ' (' + (i + 1) + '/' + clips.length + '), ticks ' + c.firstTick + '-' + c.lastTick
            });
        });
    });
    return out;
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
    if (!card || !card.root || !card.video || !card.title || !card.lines || !card.teach || !card.teachText || !card.send) {
        throw new Error('[record] paintCard needs the card elements {root, video, title, lines, teach, teachText, send}.');
    }
    const url = clipObjectUrl(d.mime, d.base64);
    if (card.video.dataset.url) { URL.revokeObjectURL(card.video.dataset.url); }   // the clip it replaces
    card.video.dataset.url = url;
    card.video.src = url;
    card.title.textContent = d.title;
    card.lines.textContent = d.lines;
    // the teaching form shows only while a human's demonstration waits to be sent (`d.teach`); a loop's clip has none
    card.teach.hidden = !d.teach;
    card.teachText.placeholder = TEACHING_PROMPT;
    if (d.teach) { card.teachText.value = ''; card.teachText.disabled = false; card.send.disabled = false; }
    card.root.hidden = false;
}

/** The card while its demonstration is being handed over: the words stay readable, nothing can be sent twice. */
export function cardSending(card, on) {
    card.teachText.disabled = on;
    card.send.disabled = on;
}

/**
 * @param {{lab:object, onChange?:function, onError:function, card?:{root, video, lines, title, teach, teachText, send}}} spec
 *   lab — maxi-lab's lab (scene(op), ask(op, {note, media[]}), beginChain(producer), endChain(), abandonChain(), chainState());
 *   card — the human's card elements.
 */
export function attachRecorder(spec) {
    if (!spec || !spec.lab || typeof spec.lab.scene !== 'function' || typeof spec.lab.ask !== 'function') {
        throw new Error('[record] attachRecorder needs the lab (scene(op), ask(op, {note, media[]})).');
    }
    ['beginChain', 'endChain', 'abandonChain', 'chainState'].forEach(function (k) {
        if (typeof spec.lab[k] !== 'function') { throw new Error('[record] attachRecorder needs the lab\'s ' + k + '() — the demonstration is the chain of the world\'s Records (maxi-lab.js).'); }
    });
    if (typeof spec.onError !== 'function') { throw new Error('[record] attachRecorder needs onError(err) — the lab\'s error bar.'); }
    const lab = spec.lab;
    const onError = spec.onError;
    const onChange = typeof spec.onChange === 'function' ? spec.onChange : function () {};
    const card = spec.card || null;
    const budget = segmentTicks();

    const st = { on: false, starting: false, stopping: false, filming: false, full: false, scene: null, vision: null, segment: null, loop: null, segments: 0, last: null, error: null,
        waiting: null, sending: false };   // waiting: the stopped demonstration {worlds, unheld} until send() hands it to Maxi

    function fail(err) { st.error = String((err && err.message) || err); onError(err); onChange(state()); }

    function visionOf(sc) {
        const FV = sc.win && sc.win.MaxiScene && sc.win.MaxiScene.FrqtlVision;
        if (!FV || typeof FV.attach !== 'function') { throw new Error('record: the scene document publishes no window.MaxiScene.FrqtlVision — maxi-scene.js imports it from @descix/frqtl-web/parts.'); }
        if (!sc.runner.isRunning) { throw new Error('record: the world is paused, so no tick will arrive to film (a recording samples by TICK, never by the clock) — resume first.'); }
        return FV.attach(sc.runner);
    }

    async function segmentLoop() {
        while (true) {
            if (st.scene.filmed.length >= MAX_SEGMENTS) {   // the Record is full: filming stops here, by name
                st.full = true; st.filming = false; onChange(state());
                return;
            }
            await st.scene.readyToFilm(SEGMENT_HAND);
            const controller = new AbortController();
            st.segment = { index: st.segments + 1, startTick: st.scene.tick(), controller: controller };
            onChange(state());
            const video = await st.vision.record({
                everyTicks: RECORD_DEFAULTS.everyTicks, fps: RECORD_DEFAULTS.fps,
                stopAt: { ticks: budget.max }, maxFrames: budget.frames, signal: controller.signal
            });
            const frames = video && video.track && video.track.frames;
            if (!frames || !frames.length) { throw new Error('record: the recorder returned no frames.'); }
            st.scene.noteFilmed(SEGMENT_HAND, { first: st.scene.recordTickOf(frames[0].tick), last: st.scene.recordTickOf(frames[frames.length - 1].tick) });
            st.segments += 1;
            st.segment = null;
            if (st.stopping || !st.filming) { return; }   // stopped, or the world is changing: never roll onto a run that is going
        }
    }

    /** Film the world that runs now (Record's start, or after a scene change or a restart). */
    function film(sc) {
        st.vision = visionOf(sc);
        st.scene = sc; st.filming = true; st.full = false; st.segments = 0;
        st.loop = segmentLoop().catch(function (err) {
            st.filming = false; st.segment = null;
            if (st.on) { st.on = false; lab.abandonChain(); }   // a failed recording is no demonstration: said by name, the chain let go
            fail(err);
        });
    }

    async function start() {
        if (st.on || st.starting) { return state(); }
        if (st.waiting) { throw waitingError(); }   // an unsent demonstration is never thrown away by a new recording
        const sc = lab.scene('record');
        visionOf(sc);                                // a paused world is refused before anything closes
        st.starting = true;
        try {
            st.error = null; st.stopping = false; st.last = null;
            await lab.beginChain('record');          // the world's Record closes; the demonstration's first opens
            st.on = true;
            film(sc);
        } finally { st.starting = false; onChange(state()); }
        return state();
    }

    function elapsedTicks() { return (st.segment && st.scene && st.scene.record) ? (st.scene.tick() - st.segment.startTick) : 0; }
    function elapsedSeconds() { return elapsedTicks() / (RECORD_DEFAULTS.everyTicks * RECORD_DEFAULTS.fps); }

    /**
     * Finish the rolling segment and stop filming: the band's minimum is the package's rule, so a segment under it is
     * finished to the minimum, then cut. Ticks finish it, so a paused world REFUSES (`paused(seconds)`, still recording).
     */
    async function finish(paused, who) {
        if (!st.filming) { await st.loop; return; }
        if (!st.scene.runner.isRunning) { throw paused(elapsedSeconds()); }
        st.stopping = true;
        onChange(state());
        try {
            while (st.segment && elapsedTicks() < budget.min) {
                if (!st.scene.runner.isRunning) { throw paused(elapsedSeconds()); }   // paused while finishing the minimum: the same refusal, still recording
                await new Promise(function (r) { setTimeout(r, 100); });
            }
            if (st.segment) { st.segment.controller.abort(); }
            await st.loop;
        } finally { st.stopping = false; onChange(state()); }
        if (st.error) { throw new Error('record: the recording failed before ' + who + ' finished it — ' + st.error); }   // the loop's own failure, not a misleading "nothing was filmed"
        st.filming = false;
    }

    /** A scene change or a restart is about to re-run the world: the rolling segment is finished while its run still exists. */
    async function finishSegment() {
        if (!st.on) { return { finished: false }; }
        await finish(pausedCloseError, 'the scene change');
        onChange(state());
        return { finished: true };
    }

    /** Throws the paused refusal by name unless the rolling segment can finish now: the lab asks BEFORE it tears anything down. */
    function assertCanFinish() {
        if (st.on && st.filming && !st.scene.runner.isRunning) { throw pausedCloseError(elapsedSeconds()); }
    }

    /** The world runs again (a new one, or the same after a restart): filming resumes in it, in the chain's next or same Record. */
    function resumeFilming() {
        if (!st.on) { return { filming: false }; }
        if (st.filming) { throw new Error('record: resumeFilming() while a segment still rolls — finishSegment() first (a clip never spans a re-run).'); }
        film(lab.scene('record'));
        onChange(state());
        return { filming: true };
    }

    async function stop() {
        if (!st.on) { throw new Error('record: not recording — press Record (R) first.'); }
        await finish(pausedStopError, 'Stop');
        let ch;
        try { ch = await lab.endChain(); }
        catch (err) { st.on = false; fail(err); throw err; }
        st.on = false; st.stopping = false;
        try {
            st.last = recordsOf(ch.worlds, null, ch.unheld);
            st.waiting = { worlds: ch.worlds, unheld: ch.unheld };
            renderCard(st.last, ch.worlds, true);                 // the human sees what was filmed, and says what it teaches before Send
            onChange(state());
            return st.last;
        } catch (err) { fail(err); throw err; }
    }

    /** A new recording while a demonstration waits: refused by name, since discarding it is a loss nobody could repair. */
    function waitingError() {
        return new Error('record: the last demonstration has not been sent — press Send to Maxi on its card, or close the card (×) to discard it, then press Record (R).');
    }

    /** The card's close (×): the human discards the waiting demonstration, unsent. Refused while it is being handed over. */
    function dismiss() {
        if (st.sending) { throw new Error('record: this demonstration is being handed to Maxi — it cannot be discarded now; wait for his answer on the strip.'); }
        const had = !!st.waiting;
        st.waiting = null;
        onChange(state());
        return { discarded: had };
    }

    /**
     * THE hand-off of a stopped demonstration (the card's Send to Maxi): ONE question with every segment as media[], the
     * change list in the note and the human's `words` (the card's textarea, read by the owner's teachingOf: '' = none, so
     * the question is the look alone). The hand-back Record's lab.json carries the words as `teaching` from this moment,
     * asked or refused; Maxi's answer rides in it once he answers. A refusal keeps the demonstration waiting, to send again.
     */
    async function send(words) {
        if (!st.waiting) { throw new Error('record: no demonstration waits to be sent — press Record (R), demonstrate, then Stop; the card\'s Send to Maxi hands it over.'); }
        if (st.sending) { throw new Error('record: this demonstration is already being handed to Maxi — wait for his answer on the strip.'); }
        const teaching = teachingOf(words);
        const w = st.waiting;
        st.sending = true; st.error = null;
        if (card) { cardSending(card, true); }
        onChange(state());
        try {
            st.last = recordsOf(w.worlds, null, w.unheld, teaching);
            const asked = await lab.ask('record', { note: demonstrationNote(w.worlds, w.unheld), teaching: teaching, media: demonstrationMedia(w.worlds) });
            st.last = recordsOf(w.worlds, { interaction_id: asked.interaction_id, answer_excerpt: asked.answer_excerpt }, w.unheld, teaching);
            st.waiting = null;
            renderCard(st.last, w.worlds, false);
            return st.last;
        } catch (err) { fail(err); throw err; }
        finally {
            st.sending = false;
            if (card && st.waiting) { cardSending(card, false); }
            onChange(state());
        }
    }

    function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
    function renderCard(recs, worlds, teach) {
        if (!card) { return; }
        const hb = recs[recs.length - 1];
        const lastWorld = worlds[worlds.length - 1];
        const clips = [].concat.apply([], worlds.map(ownClips));
        const changes = worlds.reduce(function (n, w) { return n + ownRows(w).length; }, 0);
        paintCard(card, {
            mime: 'video/mp4', base64: base64OfBytes(lastWorld.folder.files[ownClips(lastWorld)[0].file]),
            title: 'Record · ' + (recs.length > 1 ? recs.length + ' Records (' + recs.map(function (r) { return r.lab.scene.label; }).join(' → ') + ')' : hb.lab.scene.label) + ' · ' + plural(clips.length, 'clip') +
                ' (' + clips.map(function (k) { return secondsOf(k).toFixed(1) + ' s'; }).join(' + ') + ') · ' + plural(changes, 'change') +
                (hb.lab.asked ? ' · Maxi answered' : ''),
            teach: teach,
            lines: (hb.lab[TEACHING_KEY] ? 'You taught: ' + hb.lab[TEACHING_KEY] + '\n' : '') +
                recs.map(function (r, i) { return (recs.length > 1 ? r.name + ' · ' + r.lab.scene.label + '\n' : '') + changesAsText(ownRows(worlds[i])); }).join('\n') + '\n' +
                (setAsideWords(worlds) ? setAsideWords(worlds) + '\n' : '') +
                (hb.lab[UNHELD_KEY] ? unheldWords(hb.lab[UNHELD_KEY]) + '\n' : '') + completenessWords(hb)
        });
    }

    function state() {
        const ch = st.on ? lab.chainState() : { records: 0, rows: 0 };   // the Records' own count: their rows, one per act
        const secs = elapsedSeconds();
        const rec = ch.records > 1 ? 'record ' + ch.records + ' · ' : '';
        return {
            on: st.on, stopping: st.stopping, filming: st.filming, full: st.full, waiting: !!st.waiting, sending: st.sending, records: ch.records,
            segment: st.segment ? st.segment.index : null, clips: st.segments, changes: ch.rows,
            elapsedTicks: elapsedTicks(), elapsedSeconds: secs, minTicks: budget.min, maxTicks: budget.max, error: st.error, last: st.last,
            text: !st.on ? (st.sending ? 'record off (R) · handing the demonstration to Maxi' : st.waiting ? 'record off (R) · the demonstration waits: say what it teaches, then Send to Maxi' : st.starting ? 'record off (R) · starting' : 'record off (R)')
                : (st.full ? 'REC ' + rec + 'the Record holds ' + MAX_SEGMENTS + ' clips, the most one Record holds · press Stop'
                    : !st.filming ? 'REC ' + rec + 'the world is changing'
                    : st.stopping ? 'REC ' + rec + 'stopping' + (st.segment && elapsedTicks() < budget.min ? ' · finishing the ' + CLIP_SECONDS.min + ' s minimum' : '')
                    : 'REC ' + rec + 'segment ' + (st.segment ? st.segment.index : '-') + ' · ' + secs.toFixed(1) + ' s / ' + CLIP_SECONDS.max + ' s' +
                      (st.segments ? ' · ' + st.segments + ' done' : '')) + ' · ' + plural(ch.rows, 'change')
        };
    }

    return {
        get recording() { return st.on; },
        start: start, stop: stop, send: send, dismiss: dismiss, assertCanFinish: assertCanFinish, finishSegment: finishSegment, resumeFilming: resumeFilming,
        toggle: function () { try { return st.on ? stop() : start(); } catch (err) { return Promise.reject(err); } },   // a refused start is a rejection the lab paints
        state: state,
        /** The last recording's Records, in chain order (record-01, …), or null. */
        last: function () { return st.last; },
        dispose: function () { throw new Error('record: dispose() is deleted — a scene change never drops a recording: the lab finishes its segment (finishSegment) and closes the world\'s Record into the chain, and filming resumes (resumeFilming).'); }
    };
}
