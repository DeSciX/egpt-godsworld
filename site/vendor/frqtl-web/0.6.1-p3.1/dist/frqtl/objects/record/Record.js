/* Copyright 2023-2026 by Essam Abadir */

/**
 * Record.js — THE live owner of a Record (the sketch-projects design §6): its change rows, its own clock and
 * its clips. Opened by the facade (`const rec = await exp.startRecord()`, RecipeContext); serialized by the one
 * writer, lib/shim/project/record-format.js serializeRecordFolder.
 *
 *   rec.changes              READ-ONLY: the rows so far, a new deep-frozen copy per read (open or closed).
 *   rec.tick                 READ-ONLY. The Record's OWN clock: 0 when it opens, +1 per world tick the runner
 *                            delivers (runner.addTickListener, which survives a rebuild), so it climbs across
 *                            every re-run inside the Record's world (setDeclared, restart) while the runner's
 *                            own tick restarts at 0. Every row's tick and every clip span is on this clock.
 *   await rec.film({ seconds, fps, everyTicks, stage? })
 *                            ceil(seconds / 10) back-to-back FrqtlVision recordings of equal frame count, each
 *                            CLIP_SECONDS long; seconds below CLIP_SECONDS.min are refused. Resolves the clip
 *                            spans it filmed. The host keeps the world ticking (its loop, or a driver).
 *   await rec.stop()         → { files, record, clips: [{ file, firstTick, lastTick }] } | { empty: true }.
 *                            REJECTS (the Record stays open): a change and no clip, a change after the last
 *                            clip ends, a clip still being filmed, any fault recordFolderFaults finds in its
 *                            own folder.
 *   rec.closed               a Promise that settles once, when the Record closes: the stop() value plus
 *                            `closedBy: 'stop'`, or — when the facade's world is re-authored (a build of
 *                            text that is not the held text) — the folder of the world before, with
 *                            `closedBy: 'reauthor'` (rejected when that folder is refused, as stop() is).
 *                            Both carry `droppedClips`: the clips still filming when the Record closed, which
 *                            the close drops (0 on a stop, which refuses while a clip films); a refused
 *                            re-author close carries it as err.droppedClips beside err.closedBy.
 *                            A refused close nobody READ (the getter records the read) makes the facade's
 *                            next exp.startRecord() reject, naming it.
 *   err.record               every rejection of stop() and of `closed` carries { changes, clips } — the
 *                            Record's rows and clip spans — so a host can name them unheld instead of losing them.
 *
 * `closedBy`, `droppedClips` and the clip spans are the host's (a lab's own `filmed` list); record.json never
 * carries them.
 *
 * An act (toSketch, setDeclared, fork) is ADMITTED only while the Record is open and not stopping (`_admit`, asked
 * before the act changes the held text): an act during an async stop() is refused naming "stopping", and the
 * held text is unchanged.
 *
 * WHERE ITS PARTS COME FROM — nothing here captures a second time:
 *   rows    the writer's own edits at act end (RecipeContext.toSketch / setDeclared call `_row`); only what
 *           was WRITTEN makes a row;
 *   clips   every FrqtlVision.record on this runner while the Record is open (FrqtlVision asks
 *           `openRecordOf(runner)` and hands the recording to `_clipFor`); a recording whose frames / fps
 *           falls outside CLIP_SECONDS is refused before it is encoded;
 *   parts   parts.before / parts.after = linkProject(held text).module.parts at open / at close, each kind
 *           by the name the kinds registry resolves (kindNamed);
 *   project the held files at close, under project/.
 */

import { FrqtlVision } from '../../parts/FrqtlVision.js';
import { linkProject } from '../../../shim/project/link.js';
import { serializeRecordFolder, CLIP_SECONDS, BY, CHANGE_KEYS } from '../../../shim/project/record-format.js';
import { kindNamed } from '../kinds.js';
import { _setOpenRecord, openRecordOf } from './open-record.js';

function _fail(msg) {
    throw new Error('[Record] ' + msg + ' (FAIL-LOUD.)');
}

function _bytesOfBase64(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
}

/** linkProject(held).module.parts → { name: [registered kind name, props] } in key order. */
async function _partsOf(held) {
    var linked = await linkProject(held);
    var parts = linked.module && linked.module.parts;
    if (!parts || typeof parts !== 'object') {
        _fail('the held sketch exports no `parts` block — a Record writes parts.before/after from `export const parts`.');
    }
    var out = {};
    Object.keys(parts).forEach(function (name) {
        var e = parts[name];
        var Kind = Array.isArray(e) ? e[0] : null;
        if (typeof Kind !== 'function') { _fail('parts.' + name + ' carries no kind class.'); }
        kindNamed(Kind.name);   // the name the registry resolves (THROWS naming an unregistered kind)
        out[name] = [Kind.name, e[1]];
    });
    return out;
}

/** The held project's files, copied (text values). */
function _heldFiles(held) {
    return Object.assign({}, held.files);
}

/**
 * @param {object} exp — the RecipeContext that opens it (its runner and its held project)
 * @private — construct through exp.startRecord()
 */
function Record(exp) {
    var self = this;
    this._exp = exp;
    this._runner = exp.runner;
    this._tick = 0;
    this._rows = [];
    this._clips = [];
    this._inflight = 0;
    this._open = true;
    this._stopping = false;
    this._filmArm = null;
    this._before = null;
    this._closedSettle = null;
    this._closedRead = false;
    this._refused = null;
    this._closed = new Promise(function (resolve, reject) { self._closedSettle = { resolve: resolve, reject: reject }; });
    // Observed here so node does not crash on an unhandled rejection; a refused close nobody read is LOUD at the next
    // act instead (RecipeContext.startRecord refuses until `rec.closed` has been read).
    this._closed.then(null, function () {});
    this._settled = this._closed.then(function () {}, function () {});
    this._onTick = function () { self._tick += 1; };
    this._off = this._runner.addTickListener(this._onTick);
    _setOpenRecord(this._runner, this);
}

Object.defineProperty(Record.prototype, 'tick', { get: function () { return this._tick; } });
/** A deep-frozen copy. */
function _frozen(v) {
    if (v === null || typeof v !== 'object') { return v; }
    var o = Array.isArray(v) ? v.map(_frozen) : Object.keys(v).reduce(function (a, k) { a[k] = _frozen(v[k]); return a; }, {});
    return Object.freeze(o);
}
/**
 * rec.changes — the rows so far, a NEW deep-frozen copy per read (record.json's `changes` vocabulary), on an open or a
 * closed Record. One act's rows: `const n = rec.changes.length; await exp.toSketch({ by }); rec.changes.slice(n)`.
 */
Object.defineProperty(Record.prototype, 'changes', { get: function () {
    return _frozen(this._rows.map(function (r) { var o = {}; CHANGE_KEYS.forEach(function (k) { o[k] = r[k]; }); return o; }));
} });
/** rec.closed — reading it records that the host has heard how the Record closed. */
Object.defineProperty(Record.prototype, 'closed', { get: function () { this._closedRead = true; return this._closed; } });

/** Attach what the Record holds to a refusal — `err.record = { changes, clips }` — so a host can name it unheld. */
Record.prototype._carry = function (err) {
    var e = (err instanceof Error) ? err : new Error(String(err));
    e.record = {
        changes: this._rows.map(function (r) { return JSON.parse(JSON.stringify(r)); }),
        clips: this._clips.map(function (c) { return { firstTick: c.firstTick, lastTick: c.lastTick }; })
    };
    return e;
};

/** Read parts.before (the held text at open). @private */
Record.prototype._ready = async function (held) {
    this._held = held;
    this._before = await _partsOf(held);
    return this;
};

/** Throws unless `by` is one of BY (while a Record is open, every act names who acted). */
Record.requireBy = function (by, where) {
    if (BY.indexOf(by) === -1) {
        throw new TypeError('[' + where + '] a Record is open: the act names who acted — { by: ' + BY.map(function (b) {
            return JSON.stringify(b); }).join(' | ') + ' } (record-format.js BY); got ' + JSON.stringify(by) + '. (FAIL-LOUD.)');
    }
    return by;
};

/**
 * THE admission check: an act may write into this Record only while it is open and not stopping. The facade asks
 * it BEFORE an act changes the held text (toSketch, setDeclared, fork), and `_row` asks it again: one predicate.
 * @private
 */
Record.prototype._admit = function (where) {
    var at = where ? where + ': ' : '';
    if (!this._open) { _fail(at + 'this Record is closed — no row is written into it.'); }
    if (this._stopping) { _fail(at + 'this Record is stopping — an act during stop() belongs to the next Record.'); }
};

/** One change row, at the Record's current tick, in the order acted. @private */
Record.prototype._row = function (row) {
    this._admit();
    this._rows.push({ tick: this._tick, name: row.name, op: row.op, by: row.by, from: row.from, to: row.to });
};

/**
 * The clip hook. FrqtlVision calls it with the normalized record() request, BEFORE it subscribes; it THROWS
 * when the request cannot be a CLIP_SECONDS clip, and otherwise returns the recording's session:
 *   sample(i)        called as frame i is sampled (inside the tick fan-out), reads this Record's tick
 *   check(frames)    called before the encoder is finalized; THROWS outside CLIP_SECONDS
 *   end(envelope)    the encoded clip joins the Record (ignored once the Record is closed)
 *   drop()           the recording failed
 * @private
 */
Record.prototype._clipFor = function (req) {
    var self = this;
    var span = CLIP_SECONDS.min + '–' + CLIP_SECONDS.max + ' s';
    var advice = 'film inside an open Record with rec.film({ seconds, fps, everyTicks }), or record ' + span +
        ' (frames / fps) per clip';
    var planned = null;
    if (req.stopAt.ticks !== undefined) { planned = Math.min(req.maxFrames, Math.floor(req.stopAt.ticks / req.everyTicks) + 1); }
    var bound = planned === null ? req.maxFrames : planned;
    var secs = function (n) { return n / req.fps; };
    if ((planned !== null && (secs(planned) < CLIP_SECONDS.min || secs(planned) > CLIP_SECONDS.max)) ||
        (planned === null && secs(bound) < CLIP_SECONDS.min)) {
        _fail('a Record is open on this runner, so this recording is one of its clips, and a clip is ' + span +
            ' long: this one is ' + (planned !== null ? secs(planned) : 'at most ' + secs(bound)) + ' s (' + bound +
            ' frames at ' + req.fps + ' fps) — ' + advice + '.');
    }
    var arm = this._filmArm;
    this._filmArm = null;
    var ticks = [];
    var done = false;
    this._inflight += 1;
    function settle() { if (!done) { done = true; self._inflight -= 1; } }
    return {
        sample: function (i) {
            ticks[i] = self._tick;
            if (arm && i === req.maxFrames - 1) { var next = arm.onLast; arm = null; next(); }
        },
        check: function (frames) {
            if (secs(frames) < CLIP_SECONDS.min || secs(frames) > CLIP_SECONDS.max) {
                settle();
                _fail('a Record is open on this runner, so this recording is one of its clips, and a clip is ' + span +
                    ' long: this one stopped at ' + secs(frames) + ' s (' + frames + ' frames at ' + req.fps + ' fps) — ' + advice + '.');
            }
        },
        end: function (env) {
            settle();
            if (!self._open) { return; }
            var n = env.track.frames.length;
            self._clips.push({ bytes: _bytesOfBase64(env.encoded.bytes), firstTick: ticks[0], lastTick: ticks[n - 1] });
        },
        drop: function () { settle(); }
    };
};

/**
 * rec.film({ seconds, fps, everyTicks, stage? }) → Promise<[{ file?, firstTick, lastTick }]> — ceil(seconds/10)
 * back-to-back segments of equal frame count. Each segment's recording is started INSIDE the previous one's last
 * sampled tick (the tick fan-out dispatches a snapshot, so the next subscription fires from the next tick): the
 * segments are contiguous on the world's clock whatever drives it. REFUSES: seconds below CLIP_SECONDS.min, a
 * seconds × fps that does not split into equal whole-frame segments.
 */
Record.prototype.film = function (opts) {
    var self = this;
    try {
        if (!this._open) { _fail('this Record is closed — open the next one (exp.startRecord()) to film.'); }
        if (!opts || typeof opts !== 'object') { _fail('rec.film({ seconds, fps, everyTicks, stage? })'); }
        Object.keys(opts).forEach(function (k) {
            if (['seconds', 'fps', 'everyTicks', 'stage'].indexOf(k) === -1) { _fail('rec.film takes { seconds, fps, everyTicks, stage? }, not "' + k + '".'); }
        });
        var s = opts.seconds, fps = opts.fps, every = opts.everyTicks;
        if (typeof s !== 'number' || !isFinite(s) || s < CLIP_SECONDS.min) {
            _fail('rec.film: seconds is at least ' + CLIP_SECONDS.min + ' (CLIP_SECONDS), got ' + JSON.stringify(s) + '.');
        }
        if (!Number.isInteger(fps) || fps < 1) { _fail('rec.film: fps is a whole number ≥ 1 (the playback rate), got ' + JSON.stringify(fps) + '.'); }
        if (!Number.isInteger(every) || every < 1) { _fail('rec.film: everyTicks is a whole number ≥ 1 (the capture cadence in ticks), got ' + JSON.stringify(every) + '.'); }
        var n = Math.ceil(s / CLIP_SECONDS.max);
        var total = s * fps;
        if (!Number.isInteger(total) || total % n !== 0) {
            _fail('rec.film: ' + s + ' s at ' + fps + ' fps is ' + total + ' frames, which does not split into ' + n +
                ' equal whole-frame segments of at most ' + CLIP_SECONDS.max + ' s — choose seconds × fps divisible by ' + n + '.');
        }
        var f = total / n;
        var req = { everyTicks: every, fps: fps, maxFrames: f, stopAt: { ticks: (f - 1) * every } };
        if (opts.stage !== undefined) { req.stage = opts.stage; }
        var vision = FrqtlVision.attach(this._runner);
        var first = this._clips.length;
        // One deferred per segment: segment k+1 exists once segment k sampled its last frame.
        var segs = [];
        for (var k = 0; k < n; k++) {
            (function () { var d = {}; d.promise = new Promise(function (res, rej) { d.resolve = res; d.reject = rej; }); segs.push(d); })();
        }
        var started = [];
        var start = function (k) {
            started[k] = true;
            self._filmArm = (k < n - 1) ? { onLast: function () { start(k + 1); } } : null;
            var p = vision.record(req);
            segs[k].resolve(p);
            p.then(function () {
                if (k + 1 < n && !started[k + 1]) {
                    segs[k + 1].reject(new Error('[Record.film] segment ' + (k + 1) + ' of ' + n + ' ended without sampling its last frame, ' +
                        'so segment ' + (k + 2) + ' never started. (FAIL-LOUD.)'));
                }
            }, function (e) {
                self._filmArm = null;
                for (var j = k + 1; j < n; j++) { if (!started[j]) { started[j] = true; segs[j].reject(e); } }
            });
        };
        start(0);
        return Promise.all(segs.map(function (d) { return d.promise; })).then(function () {
            return self._clips.slice(first).map(function (c) { return { firstTick: c.firstTick, lastTick: c.lastTick }; });
        });
    } catch (e) { return Promise.reject(e); }
};

/** Serialize this Record's folder from `held` (the files it snapshots). @private */
Record.prototype._folder = async function (held) {
    var after = await _partsOf(held);
    return serializeRecordFolder({
        changes: this._rows.slice(), clips: this._clips.slice(),
        partsBefore: this._before, partsAfter: after, project: _heldFiles(held)
    });
};

/** Detach from the world (no row, tick or clip after this). @private */
Record.prototype._detach = function () {
    this._open = false;
    if (this._off) { this._off(); this._off = null; }
    _setOpenRecord(this._runner, null);
    this._exp._record = null;
};

/** rec.stop() — see the module docstring. */
Record.prototype.stop = async function () {
    var self = this;
    var refuse = function (msg) { try { _fail(msg); } catch (e) { throw self._carry(e); } };
    if (!this._open) { refuse('this Record is already closed' + (this._closedBy ? ' (closedBy: ' + this._closedBy + ')' : '') + ' — read rec.closed.'); }
    if (this._stopping) { refuse('stop() is already running.'); }
    if (this._inflight) { refuse(this._inflight + ' clip(s) are still being filmed — await rec.film (or the record()) before stop().'); }
    this._stopping = true;
    var out;
    try { out = await this._folder(this._exp._project); }
    catch (e) { throw this._carry(e); }
    finally { this._stopping = false; }
    this._closedBy = 'stop';
    this._detach();
    this._closedSettle.resolve(Object.assign({}, out, { closedBy: 'stop', droppedClips: 0 }));
    return out;
};

/**
 * The facade re-authors its world: close with the folder of the world BEFORE (`held` = the held project before
 * the build). Synchronous detach; the folder settles `closed`. @private
 */
Record.prototype._closeOnReauthor = function (held) {
    var self = this;
    var dropped = this._inflight;   // clips still filming: detaching drops them (their end() finds the Record closed)
    this._closedBy = 'reauthor';
    this._detach();
    this._folder(held).then(function (out) {
        self._closedSettle.resolve(Object.assign({}, out, { closedBy: 'reauthor', droppedClips: dropped }));
    }, function (e) {
        self._refused = self._carry(e);
        self._refused.closedBy = 'reauthor';
        self._refused.droppedClips = dropped;
        self._closedSettle.reject(self._refused);
    });
};

export { Record, openRecordOf };
