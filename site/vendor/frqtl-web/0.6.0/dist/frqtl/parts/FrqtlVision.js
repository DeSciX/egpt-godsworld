/* Copyright 2023-2026 by Essam Abadir */

/**
 * FrqtlVision.js — the reusable "video camera that takes stills" sugar object, and the
 * consumer-facing surface of the normalized capture format.
 *
 * Peer of `CameraControls.js` in this directory, and deliberately DISJOINT from it:
 * `CameraControls` drives the VIEWPOINT (`runner.cameraControl` — where the camera looks);
 * `FrqtlVision` reads the PICTURE (`runner.capture` / `runner.captureStill` — what came out).
 * Framing a still is therefore composition, not a parameter: point the camera with
 * `CameraControls`/`cameraControl.setOrbit`, then capture what the canvas shows. A
 * `getStill({azimuth…})` would be a second write path into camera state.
 *
 * ── Vocabulary: the noun is STILL, never `frame` ─────────────────────────────
 * `Frame` is the engine's core noun (the Frame Axiom — every body, every quantum is a
 * Frame; `FrameData`, `makeLeafFrame`, `setFrameProperty`). On this surface a **STILL** is
 * one tap result, a **STREAM** is a tick-ordered sequence of stills, and a **VIDEO** is an
 * encoded stream. There is no `getFrame`, no `frames[]`, no `onFrame`, no `frameRate`
 * anywhere here. The video metaphor survives in prose ("a still is a single frame *of that
 * video*") but never in an identifier — in this codebase a stream-of-frames API would read
 * as a stream of physics `Frame` objects, and the `tick` stage makes that a genuine
 * ambiguity rather than a pedantic one: `getStill('tick').data` literally IS `FrameData[]`.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `FrqtlVision.attach(runner) → handle`
 *
 *   @param {object} runner — an FrqtlApp. The coupling: `runner.capture()`,
 *     `runner.captureStill()`, `runner.sceneRecord()` and the shim-owned stage table; the
 *     stream and the recorder additionally use the per-tick listener fan-out
 *     (`addTickListener`) and, for a raster stage, the capture hold (`suspendTicks`,
 *     `repaint`, `resumeTicks`); `record` reads `runner.captureHost()` where the runner has
 *     one (a node-side capture instrument), and forwards to that host. No renderer-sniffing,
 *     no engine, no per-page coupling — this
 *     object knows nothing about which experiment mounts it.
 *   @returns {{
 *     getScene():Promise<object>,        // the run-invariant SceneRecord + its content id
 *     getStill(stage?):Promise<object>,  // stage omitted → the FULL composed stack
 *     getStream({stage?, everyTicks}):AsyncIterable<object>,   // stills at a TICK cadence
 *     record({everyTicks, stopAt, maxFrames, fps, stage?, bitrate?, keyFrameInterval?, signal?})
 *         :Promise<object>,              // an encoded video: CaptureEnvelope.videoEnvelope
 *     stages:string[],                   // the FERRIED RenderStages.RENDER_STAGES list
 *     finalStage():string,               // the ferried final-stage derivation
 *     toDataURL(still):string,           // the BROWSER PNG encoder (data URL)
 *     toPNG(still):Buffer                // the NODE PNG encoder (bytes)
 *   }}
 *
 * ── TWO HOSTS, one contract ──────────────────────────────────────────────────
 *
 * This object runs in a browser and in Node, and the PIXEL ENCODER differs by host — so each
 * one throws naming the other rather than guessing: `toDataURL` is the browser encoder (a
 * scratch canvas) and refuses under Node naming `toPNG`; `toPNG` is the Node encoder (zlib +
 * Buffer) and refuses in a browser naming `toDataURL`. Same picture, same record, the encoder
 * for THIS host.
 *
 * That redirect is only honest if `attach()` is REACHABLE in both hosts: the stage vocabulary
 * is an import (lib/shim/render/render-stages.js) in both. Pinned end to end by
 * `objects/test/frqtl-vision-node-host.test.mjs`, which seeds NO global.
 *
 * ── The normalized format: ONE scene record, MANY light stills ────────────────
 *
 * 3D scenes are high bandwidth, so the format does not repeat the scene on every capture.
 * `getScene()` returns the RUN-INVARIANT regeneration input — `seed`, `sourceRef`, `build`,
 * `physicsW/H`, `projection` — IMMUTABLE and CONTENT-ADDRESSED (`scene = sha256(...)`).
 * `getStill()` returns COORDINATES WITHIN that scene: which tick, which stage, which pose,
 * plus the payload, carrying `scene: <hash>` rather than the embedded record. A corpus
 * stores one scene plus N tiny stills, and every still is verifiable against (and
 * regenerable from) its scene. A self-contained "fat" bag is a JOIN a consumer can perform —
 * never a second stored format.
 *
 * The split is drawn by MUTABILITY, not by category. `filtersApplied`, `pose`,
 * `cssWidth`/`cssHeight` and `renderOptions` all LOOK scene-level and are not — each has a
 * live mid-run mutation surface, and hoisting one would mislabel every subsequent still. The
 * `RenderStages.RUNTIME_MUTATION_SURFACES` table declares that line and a conformance gate
 * enforces it, so a future hoist fails CI instead of rotting a corpus at training time.
 *
 * `getStill(stage)` FORWARDS — it adds nothing:
 *   - `getStill()`      → `runner.captureStill()` (the last-stage convenience)
 *   - `getStill(stage)` → `runner.capture(stage)` (the generic mechanism)
 *   - `getScene()`      → `runner.sceneRecord()`
 *   All dispatch, all throw rules and ALL provenance stamping live in the runner and nowhere
 *   else. This object holds no state at all.
 *
 * ── STREAM and VIDEO: the tick IS the frame ─────────────────────────────────
 *
 * `getStream({stage, everyTicks})` is this same tap subscribed across ticks through the
 * runner's per-tick listener fan-out, yielding the SAME canonical still bags in tick order —
 * no envelope, no new noun, no sequence number beside `tick` (a second ordering key would be a
 * two-clocks bug). The cadence is in TICKS; there is no wall-clock rate anywhere on this face.
 * A stream spans ONE scene at ONE size: a still whose `scene` or dimensions differ from the
 * first ENDS the stream with an error rather than yielding a sequence no encoder can hold.
 *
 * A sampled RASTER tick is rendered before it is read because the stream ASKS for it: in the
 * listener it raises the capture HOLD — `suspendTicks()` → `repaint()` → capture →
 * `resumeTicks()` when the capture settles. The listener fires BEFORE the loop draws its
 * tick, a batching loop composites only a batch's last tick, and an fps cap skips draws; the
 * hold stops the clock and forces the draw, and the tap's provenance guard proves it did.
 * The stream never OWNS the clock: a paused runner yields nothing, and a runner driven by
 * `step()` waits for each hold to release. Numeric stages (`tick`, `field`) read the
 * retained TickData directly and need no hold — selected by FORMAT off the stage table.
 *
 * `record(...)` is `getStream`'s sampling plus an encoder, and nothing records anything
 * else: every encoded picture IS a provenance-stamped still, so its manifest row `{i, tick,
 * pose}` is DERIVED from the still. The encoder is mediabunny (vendored unmodified with its
 * licence and pin, `assets/vendor/mediabunny.*`), loaded LAZILY through the page's router on
 * the first `record()` — a page that never records never fetches it. It runs where WebCodecs
 * exists, i.e. in a page; under node the hosted eyes run this SAME `record` inside their page
 * (`eyes.vision.record`), and a node process with no host is refused naming that door.
 *
 * ── Why the PNG is DERIVED here and never in a provider ──────────────────────
 *
 * The pixel array IS the still; a PNG is a lossless ENCODING of it. pixels → PNG is
 * synchronous and lossless, so it is written ONCE, here, and no provider (nor any BYO
 * renderer) ever ships image-encoding code. This is the sanctioned EDGE for encoders: every
 * encoding accretes HERE over records — never below this layer, and never as a format
 * parameter on the tap (that would be format negotiation inside a render capability). The
 * video encoder is the heavyweight one, so it is resolved lazily by `record()` rather than
 * loaded as a script by every page.
 *
 * ── ONE ENCODER PER HOST, both on this ONE face ──────────────────────────────
 *
 * "Get a picture from a script" is the most natural thing to want from this surface, and
 * until V4 the package shipped no node way to do it: `toDataURL` needs a DOM scratch canvas,
 * which is exactly the environment the HOSTED eyes do NOT have. Routing node pixels back
 * INTO a browser to encode them (the earlier design) is ceremony without a compensating
 * invariant when zlib is stdlib — so there are two encoders, one per host environment, and
 * BOTH are members of this face:
 *
 *   `toDataURL(still)` → `data:image/png;base64,…`   the BROWSER encoder (scratch canvas)
 *   `toPNG(still)`     → PNG `Buffer`                 the NODE encoder (zlib, no dependency)
 *
 * Each FAILS LOUD in the wrong host NAMING THE RIGHT ONE — the correct next line in the
 * error message, which is the whole P5-test discipline. What keeps the two honest is a
 * conformance row that encodes ONE known bag through BOTH and asserts the decoded pixels are
 * identical: "two implementations, one derivation" is a contract only when a test says so.
 * Row order and colour space come from the record contract, not a guess: rgba8 is row-major
 * from the TOP-LEFT origin, sRGB, NON-premultiplied — ImageData's own convention, and
 * exactly PNG colour type 6. Both encoders are therefore straight copies with no
 * re-orientation and no alpha correction.
 *
 * `eyes.saveStill(still, path)` (the hosted handle) is the write convenience over `toPNG`.
 *
 * The numbers stay first class: a consumer folding a radial profile, a histogram or a corpus
 * row reads `still.data` directly and never goes near a PNG. Analysis lives in the consumer —
 * an analysis method on this handle is how one primitive quietly becomes an instrument
 * registry. Pixel→universe mapping is likewise a separate published authority
 * (`compat/renderer/unprojectStill.js`), not a method here.
 *
 * ── FAIL-LOUD ────────────────────────────────────────────────────────────────
 *
 * `toDataURL`/`toPNG` THROW on a record whose `format` is not `'rgba8'` (a `framedata` or `r8`
 * field record has no image encoding — a plausible-looking blank PNG would be worse than an
 * error), and each throws in the wrong host naming the other. `attach` throws when handed
 * something that is not a capture-capable runner. Never a null image, never a silent empty
 * record.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This is the output boundary reading its own output — no frame, dimension,
 * tick or op-program is touched, so no canonical-bench golden can move because of it. Its
 * product is stills, goldens, guide captures and corpus rows.
 *
 * Usage:
 *   var vision = FrqtlVision.attach(runner);
 *   var scene  = await vision.getScene();         // store ONCE
 *   var still  = await vision.getStill();         // the whole composed stack
 *   var field  = await vision.getStill('field');  // the render-free numeric channel
 *
 *   // A video: 1 still per 2 ticks until tick 600, played back at 30 fps.
 *   var env = await vision.record({ everyTicks: 2, stopAt: { tick: 600 }, maxFrames: 400, fps: 30 });
 *
 *   // Aligned multi-channel corpus row: capture BETWEEN ticks and assert equal tick stamps —
 *   // the tick equality IS the co-registration guard; `scene` ties them to one header.
 *   runner.stop();
 *   var rows = await Promise.all(vision.stages
 *       .filter(function (s) { return s !== 'scene'; })   // no 'scene' executor in v1
 *       .map(function (s) { return vision.getStill(s); }));
 */

/** The rgba8 format tag, read from the owner so this file carries no format literal. */

import * as RenderStages from '../../shim/render/render-stages.js';
import * as CaptureEnvelope from '../../shim/render/capture-envelope.js';
import { CameraPath } from './CameraPath.js';
import { FrqtlCaptureHost } from '../objects/instruments/capture-host.js';
import { vendorUrl } from '../compat/vendor.js';
import { openRecordOf } from '../objects/record/open-record.js';

function _rgba8Format(RS) { return RS.STAGE_FORMATS[RS.finalStage()]; }

function _assertImageable(still, RS, who) {
    if (!still || typeof still !== 'object') {
        throw new Error('[FrqtlVision.' + who + '] expected a still record, got ' + String(still) + '.');
    }
    var want = _rgba8Format(RS);
    if (still.format !== want) {
        throw new Error('[FrqtlVision.' + who + '] this record\'s format is ' +
            JSON.stringify(still.format) + ', not ' + JSON.stringify(want) + ' — stage ' +
            JSON.stringify(still.stage) + ' carries NUMBERS (read still.data), not an image. ' +
            'Encoding it as a PNG would produce a plausible-looking picture of nothing. (FAIL-LOUD.)');
    }
}

/**
 * The BROWSER encoder: an rgba8 still record → a PNG data URL.
 *
 * FAILS LOUD with no DOM naming `toPNG` — the node counterpart on this same face. An error
 * that only says "no DOM" leaves the reader to guess; an error that names the next line is
 * the whole point (a crash is recoverable curriculum, a silent wrong outcome is not).
 *
 * @param {object} still — a `format:'rgba8'` record from `getStill()`
 * @returns {string} `data:image/png;base64,…`
 */
function toDataURL(still) {
    var RS = RenderStages;
    _assertImageable(still, RS, 'toDataURL');
    if (typeof document === 'undefined') {
        throw new Error('[FrqtlVision.toDataURL] no DOM: a data URL is encoded through a ' +
            'scratch canvas, so this is the BROWSER encoder. In node call ' +
            'FrqtlVision.toPNG(still) for PNG bytes (or eyes.saveStill(still, path) to write ' +
            'them straight to a file) — same picture, same record, the encoder for THIS host. ' +
            '(FAIL-LOUD.)');
    }
    var scratch = document.createElement('canvas');
    scratch.width  = still.width;
    scratch.height = still.height;
    var ctx = scratch.getContext('2d');
    if (!ctx || typeof ctx.putImageData !== 'function') {
        throw new Error('[FrqtlVision.toDataURL] the scratch canvas has no 2D context. (FAIL-LOUD.)');
    }
    // The record's rows are TOP-LEFT origin, sRGB and NON-premultiplied by contract (a GL
    // provider already flipped) — exactly ImageData's own convention, so this is a straight
    // copy with no re-orientation and no alpha correction.
    var img = ctx.createImageData(still.width, still.height);
    img.data.set(still.data);
    ctx.putImageData(img, 0, 0);
    return scratch.toDataURL('image/png');
}

/**
 * The NODE encoder: an rgba8 still record → PNG bytes.
 *
 * The counterpart of `toDataURL`, for the host that has no scratch canvas — which is exactly
 * where the hosted eyes run. PNG here is one filter byte per row plus `zlib.deflate`, so it
 * needs no dependency at all; zlib is node's built-in, reached through
 * `process.getBuiltinModule` when this encoder is called, so a browser that imports this module
 * never touches it.
 *
 * @param {object} still — a `format:'rgba8'` record from `getStill()`
 * @returns {Buffer} PNG bytes
 */
function toPNG(still) {
    var RS = RenderStages;
    _assertImageable(still, RS, 'toPNG');
    var zlib = (typeof process !== 'undefined' && process.getBuiltinModule) ? process.getBuiltinModule('node:zlib') : null;
    if (!zlib || typeof Buffer === 'undefined') {
        throw new Error('[FrqtlVision.toPNG] this is the NODE encoder (zlib + Buffer) and ' +
            'neither is available here. In a browser call FrqtlVision.toDataURL(still) — same ' +
            'picture, same record, the encoder for THIS host. (FAIL-LOUD.)');
    }
    var w = still.width, h = still.height;
    var px = Buffer.from(still.data.buffer, still.data.byteOffset, still.data.length);
    var stride = w * 4 + 1;
    var raw = Buffer.alloc(h * stride);
    for (var y = 0; y < h; y++) {
        raw[y * stride] = 0;                               // filter type 0 (None) per row
        px.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
    }
    // Node's zlib gained crc32 only in v20.15; a local one keeps this version-independent.
    function crc32(b) {
        var c, crc = 0xffffffff;
        for (var n = 0; n < b.length; n++) {
            c = (crc ^ b[n]) & 0xff;
            for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); }
            crc = (crc >>> 8) ^ c;
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
    function chunk(type, data) {
        var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
        return Buffer.concat([len, body, crc]);
    }
    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;                              // 8-bit, colour type 6 (RGBA)
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

// ── STREAM + VIDEO ────────────────────────────────────────────────────────────

/** Named FAIL-LOUD for this face. @private */
function _fail(who, msg) {
    throw new Error('[FrqtlVision.' + who + '] ' + msg + ' (FAIL-LOUD.)');
}

/** @private */
function _requirePosInt(value, name, who) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0 || value % 1 !== 0) {
        _fail(who, name + ' must be a positive whole number, got ' + String(value));
    }
    return value;
}

/** Refuse any option this call does not declare — a typo'd knob is never a silent no-op. @private */
function _assertKnownKeys(bag, allowed, where, who) {
    var keys = Object.keys(bag);
    for (var i = 0; i < keys.length; i++) {
        if (allowed.indexOf(keys[i]) === -1) {
            _fail(who, where + ' has no option ' + JSON.stringify(keys[i]) + ' — declared: ' +
                allowed.join(', '));
        }
    }
}

/**
 * THE ONE SAMPLING MECHANISM behind `getStream` and `record`.
 *
 * Subscribes to the runner's tick fan-out and samples the FIRST tick after subscription, then
 * every `everyTicks`-th. A sampled raster tick is HELD (suspend → repaint → capture → resume
 * when `cfg.onStill`'s promise settles, so a stop decision taken there lands before another
 * tick can run). `cfg.admit(index)` is asked BEFORE each capture and may refuse it (a bound
 * reached). Every capture promise goes to `cfg.onStill(promise, index)` with the one-scene /
 * one-size continuity check already applied.
 *
 * @returns {{stop:function}} idempotent; releases nothing it does not hold (holds release
 *   when their own capture settles).
 * @private
 */
function _sample(runner, RS, cfg) {
    var who = cfg.who;
    if (typeof runner.addTickListener !== 'function') {
        _fail(who, 'needs the runner\'s per-tick listener fan-out (runner.addTickListener) — the ' +
            'cadence is counted in TICKS, and nothing else can count them. A node-side capture ' +
            'instrument has no clock of its own: record inside the page that runs the world ' +
            '(eyes.vision.record from @descix/frqtl-node/eyes)');
    }
    var raster = RS.STAGE_FORMATS[cfg.stage] === _rgba8Format(RS);
    if (raster && (typeof runner.suspendTicks !== 'function' || typeof runner.resumeTicks !== 'function' ||
                   typeof runner.repaint !== 'function')) {
        _fail(who, 'a ' + JSON.stringify(cfg.stage) + ' sample needs the capture hold ' +
            '(runner.suspendTicks/repaint/resumeTicks): a capture from the tick listener must see ' +
            'its tick COMPOSITED before the readback, and on a batching or fps-capped loop only a ' +
            'held clock plus a forced draw guarantees that');
    }
    var calls = 0;
    var index = 0;
    var first = null;
    var stopped = false;
    var unsubscribe = null;

    function continuity(still) {
        if (first === null) { first = { scene: still.scene, width: still.width, height: still.height }; return still; }
        if (still.scene !== first.scene) {
            throw new Error('[FrqtlVision.' + who + '] the scene changed mid-sequence (' +
                JSON.stringify(first.scene) + ' → ' + JSON.stringify(still.scene) + ' at tick ' +
                still.tick + '): a sequence spans exactly ONE scene record. Start a new one. (FAIL-LOUD.)');
        }
        if (still.width !== first.width || still.height !== first.height) {
            throw new Error('[FrqtlVision.' + who + '] the ' + still.stage + ' size changed mid-sequence (' +
                first.width + 'x' + first.height + ' → ' + still.width + 'x' + still.height + ' at tick ' +
                still.tick + '): a sequence has constant dimensions (an encoder cannot hold a resize). ' +
                'Start a new one. (FAIL-LOUD.)');
        }
        return still;
    }

    function onTick() {
        if (stopped) { return; }
        calls += 1;
        if ((calls - 1) % cfg.everyTicks !== 0) { return; }
        if (!cfg.admit(index)) { return; }
        var i = index;
        index += 1;
        var capture;
        if (raster) {
            runner.suspendTicks();
            try { runner.repaint(); }
            catch (e) { capture = Promise.reject(e); }
        }
        if (!capture) {
            try { capture = Promise.resolve(runner.capture(cfg.stage)); }
            catch (e) { capture = Promise.reject(e); }
        }
        var handled = Promise.resolve(cfg.onStill(capture.then(continuity), i));
        if (raster) {
            var release = function () { runner.resumeTicks(); };
            handled.then(release, release);
        }
    }

    unsubscribe = runner.addTickListener(onTick);
    return {
        stop: function () {
            if (stopped) { return; }
            stopped = true;
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        }
    };
}

/**
 * getStream({stage?, everyTicks}) — the tap subscribed across ticks.
 *
 * @param {object} runner
 * @param {object} RS
 * @param {{stage?:string, everyTicks:number}} opts — `stage` defaults to the final stage.
 * @returns {AsyncIterable<object>} canonical still bags in tick order. Iteration SUBSCRIBES;
 *   `break`/`return()` unsubscribes. A capture failure or a continuity break rejects `next()`
 *   and ends the stream. The queue is UNBOUNDED: stills sampled faster than the consumer pulls
 *   are held in memory — `record`'s `maxFrames` is the bound when one is needed.
 * @private
 */
function _getStream(runner, RS, opts) {
    var who = 'getStream';
    if (!opts || typeof opts !== 'object') { _fail(who, 'expected {stage?, everyTicks}, got ' + String(opts)); }
    _assertKnownKeys(opts, ['stage', 'everyTicks'], 'getStream', who);
    var everyTicks = _requirePosInt(opts.everyTicks, 'everyTicks', who);
    var stage = (opts.stage === undefined) ? RS.finalStage() : RS.assertStage(opts.stage);

    var iterable = {};
    iterable[Symbol.asyncIterator] = function () {
        var queue = [];          // capture promises, in index order
        var waiter = null;       // a pending next() with nothing queued
        var ended = false;
        var session = _sample(runner, RS, {
            who: who, stage: stage, everyTicks: everyTicks,
            admit: function () { return !ended; },
            onStill: function (p) {
                // Handled here so a capture failing while nobody is pulling is never an
                // unhandled rejection; the failure is delivered by next().
                p.then(null, function () {});
                queue.push(p);
                if (waiter) { var w = waiter; waiter = null; w(); }
                return p;
            }
        });
        function end() { ended = true; session.stop(); queue.length = 0; }
        return {
            next: function () {
                if (queue.length) {
                    return queue.shift().then(function (still) { return { value: still, done: false }; },
                        function (e) { end(); throw e; });
                }
                if (ended) { return Promise.resolve({ value: undefined, done: true }); }
                var self = this;
                return new Promise(function (resolve) { waiter = resolve; }).then(function () { return self.next(); });
            },
            return: function () {
                end();
                if (waiter) { var w = waiter; waiter = null; w(); }
                return Promise.resolve({ value: undefined, done: true });
            }
        };
    };
    return iterable;
}

/** The recorder's declared options. @private */
var RECORD_OPTIONS = ['everyTicks', 'stopAt', 'maxFrames', 'fps', 'stage', 'bitrate', 'keyFrameInterval', 'signal'];
var STOP_AT_FORMS = ['tick', 'ticks', 'path'];
var PATH_OPTIONS = ['waypoints', 'loop', 'waypointTimeoutMs'];

/** Validate a record() request; returns the normalized request. @private */
function _normalizeRecord(RS, opts) {
    var who = 'record';
    if (!opts || typeof opts !== 'object') {
        _fail(who, 'expected {everyTicks, stopAt, maxFrames, fps, stage?, bitrate?, keyFrameInterval?, signal?}, got ' + String(opts));
    }
    _assertKnownKeys(opts, RECORD_OPTIONS, 'record', who);
    var req = {
        everyTicks: _requirePosInt(opts.everyTicks, 'everyTicks (the capture cadence in TICKS — there is no wall-clock cadence)', who),
        maxFrames:  _requirePosInt(opts.maxFrames, 'maxFrames (the memory bound; hitting it reports truncated:true)', who),
        fps:        _requirePosInt(opts.fps, 'fps (the PLAYBACK rate — it has no physical meaning)', who),
        stage:      (opts.stage === undefined) ? RS.finalStage() : RS.assertStage(opts.stage),
        bitrate:    (opts.bitrate === undefined) ? null : _requirePosInt(opts.bitrate, 'bitrate (bits per second)', who),
        keyFrameInterval: (opts.keyFrameInterval === undefined) ? 1
            : _requirePosInt(opts.keyFrameInterval, 'keyFrameInterval (frames)', who),
        stopAt: null,
        signal: null
    };
    if (opts.signal !== undefined) {
        var sig = opts.signal;
        if (!sig || typeof sig.aborted !== 'boolean' || typeof sig.addEventListener !== 'function') {
            _fail(who, 'signal must be an AbortSignal (new AbortController().signal) — it is how a recording ' +
                'stops before its stopAt; got ' + String(sig));
        }
        req.signal = sig;
    }
    if (RS.STAGE_FORMATS[req.stage] !== _rgba8Format(RS)) {
        _fail(who, 'stage ' + JSON.stringify(req.stage) + ' carries NUMBERS (format ' +
            JSON.stringify(RS.STAGE_FORMATS[req.stage]) + '), not an image — a video of it would be a ' +
            'plausible-looking movie of nothing. Read the numbers with getStream({stage: ' +
            JSON.stringify(req.stage) + ', everyTicks})');
    }
    var s = opts.stopAt;
    if (!s || typeof s !== 'object') {
        _fail(who, 'stopAt is REQUIRED — exactly one of {tick: T}, {ticks: K}, {path: {waypoints, loop?, ' +
            'waypointTimeoutMs?}}. A recording with no honest stop is stopped by its bound, which is ' +
            'how a cap silently becomes the length of every video');
    }
    var forms = Object.keys(s);
    _assertKnownKeys(s, STOP_AT_FORMS, 'stopAt', who);
    if (forms.length !== 1) {
        _fail(who, 'stopAt names exactly ONE form, got [' + forms.join(', ') + '] — declared: ' + STOP_AT_FORMS.join(', '));
    }
    if (forms[0] === 'tick') {
        if (typeof s.tick !== 'number' || !isFinite(s.tick) || s.tick < 0 || s.tick % 1 !== 0) {
            _fail(who, 'stopAt.tick is an absolute tick (a non-negative whole number), got ' + String(s.tick));
        }
        req.stopAt = { tick: s.tick };
    } else if (forms[0] === 'ticks') {
        req.stopAt = { ticks: _requirePosInt(s.ticks, 'stopAt.ticks (ticks after the first capture)', who) };
    } else {
        if (!s.path || typeof s.path !== 'object') { _fail(who, 'stopAt.path must be {waypoints, loop?, waypointTimeoutMs?}'); }
        _assertKnownKeys(s.path, PATH_OPTIONS, 'stopAt.path', who);
        req.stopAt = { path: s.path };
    }
    return req;
}

/**
 * Load the vendored encoder and its pin (compat/vendor.js vendorUrl — beside this tree). Asynchronous only —
 * every synchronous refusal is a door `_record` checks first. @private
 */
function _loadEncoder() {
    return Promise.all([
        import(vendorUrl('mediabunny.min.mjs')),
        fetch(vendorUrl('mediabunny.PINNED.json')).then(function (r) {
            if (!r.ok) { _fail('record', 'the encoder pin mediabunny.PINNED.json did not load (HTTP ' + r.status + ')'); }
            return r.json();
        })
    ]).then(function (mods) {
        var pin = mods[1];
        if (!pin || typeof pin.version !== 'string' || !pin.version) {
            _fail('record', 'mediabunny.PINNED.json carries no version — the muxer label is ferried from ' +
                'the pin, never typed here');
        }
        return { MB: mods[0], pin: pin };
    });
}

/**
 * record(opts) — the in-page recorder, or the hosted forward.
 * @private
 */
function _record(runner, RS, opts) {
    var req = _normalizeRecord(RS, opts);
    var CE = CaptureEnvelope;

    // HOSTED: the world, the clock and the encoder are in the page. The SAME record runs there;
    // this process forwards and VERIFIES the envelope against its own scene identity. The
    // forward is issued synchronously, so a drive issued right after this call cannot run
    // ticks ahead of the page-side subscription.
    var host = (typeof runner.captureHost === 'function') ? runner.captureHost() : null;
    if (host) {
        var pending = Promise.resolve(host.record(opts));
        return Promise.all([runner.sceneRecord(), pending]).then(function (joined) {
            return FrqtlCaptureHost.verifyVideo(joined[0].scene, joined[1]);
        });
    }
    if (typeof document === 'undefined') {
        _fail('record', 'no DOM and no capture host: video is encoded with WebCodecs where the ' +
            'picture is, i.e. in a page. From node use the hosted eyes — ' +
            'openHostedEyes from @descix/frqtl-node/eyes, then eyes.vision.record(opts), ' +
            'which runs this SAME record inside the hosted page');
    }
    if (typeof VideoEncoder === 'undefined') {
        _fail('record', 'this page has no WebCodecs VideoEncoder (it needs a secure context: https or ' +
            'localhost). The encoder is not optional — there is no second path');
    }

    // THE CLIP HOOK: while a Record is open on this runner, every recording is one of its clips. The Record
    // refuses a request that cannot be a CLIP_SECONDS clip (before anything subscribes) and keeps the clip's
    // ticks and bytes; this recorder holds no Record state of its own (objects/record/Record.js _clipFor).
    var openRec = openRecordOf(runner);
    var clip = openRec ? openRec._clipFor(req) : null;

    // Everything that can THROW synchronously happens BEFORE the sampler subscribes: a
    // CameraPath refused at attach (no pose control, an undeclared pose field) must not leave
    // a subscribed sampler holding the clock behind a rejection nobody can reach.
    var path = null;
    if (req.stopAt.path) {
        try {
            path = CameraPath.attach(runner, {
                waypoints: req.stopAt.path.waypoints,
                loop: !!req.stopAt.path.loop,
                waypointTimeoutMs: req.stopAt.path.waypointTimeoutMs
            });
        } catch (e) { if (clip) { clip.drop(); } throw e; }
    }
    var frames = [];
    var inflight = [];
    var truncated = false;
    var closing = false;
    var failure = null;
    var stopTick = (req.stopAt.tick !== undefined) ? req.stopAt.tick : null;
    var session = null;
    var onAbort = null;
    var dims = null;
    var scene = null;
    var encoderReady = _loadEncoder().then(function (enc) {
        var MB = enc.MB;
        var target = new MB.BufferTarget();
        var output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: target });
        var source = new MB.VideoSampleSource({
            codec: 'avc',
            bitrate: (req.bitrate === null) ? MB.QUALITY_HIGH : req.bitrate,
            keyFrameInterval: req.keyFrameInterval
        });
        output.addVideoTrack(source, { frameRate: req.fps });
        return output.start().then(function () {
            return { MB: MB, pin: enc.pin, target: target, output: output, source: source };
        });
    });
    var encodeChain = encoderReady;

    var settle;
    var done = new Promise(function (resolve, reject) { settle = { resolve: resolve, reject: reject }; });

    function close(err) {
        if (err && !failure) { failure = err; }
        if (closing) { return; }
        closing = true;
        if (session) { session.stop(); }
        if (path) { path.dispose(); path = null; }
        if (onAbort) { req.signal.removeEventListener('abort', onAbort); onAbort = null; }
        // Every capture already requested lands in the video before it is finalized.
        Promise.all(inflight).then(function () {
            if (failure) { throw failure; }
            if (!frames.length) {
                _fail('record', 'the recording stopped before a single still was captured — nothing to ' +
                    'encode. Is the runner advancing ticks?');
            }
            if (clip) { clip.check(frames.length); }
            return encodeChain;
        }).then(function (enc) {
            return enc.output.finalize().then(function () { return enc.output.getMimeType(); })
                .then(function (mimeType) {
                    var parts = String(mimeType).split(';');
                    var mime = parts[0].trim();
                    var m = /codecs="([^"]+)"/.exec(mimeType);
                    if (!m) {
                        _fail('record', 'the muxer reported no codec string (' + JSON.stringify(mimeType) +
                            ') — encoded.codec REPORTS what was produced and is never assumed');
                    }
                    return CE.videoEnvelope({
                        track: {
                            scene: scene, stage: req.stage, width: dims.width, height: dims.height,
                            ticksPerFrame: req.everyTicks, fps: req.fps, frames: frames
                        },
                        encoded: {
                            mime: mime,
                            bytes: CE.bytesToBase64(new Uint8Array(enc.target.buffer)),
                            encoder: 'FrqtlVision.record',
                            codec: m[1],
                            muxer: 'mediabunny@' + enc.pin.version
                        },
                        truncated: truncated
                    });
                });
        }).then(function (env) {
            if (clip) { clip.end(env); }
            settle.resolve(env);
        }, function (e) {
            if (clip) { clip.drop(); }
            encoderReady.then(function (enc) { return enc.output.cancel(); }).then(null, function () {});
            settle.reject(e);
        });
    }

    encoderReady.then(null, function (e) { close(e); });

    session = _sample(runner, RS, {
        who: 'record', stage: req.stage, everyTicks: req.everyTicks,
        admit: function (i) {
            if (closing) { return false; }
            if (i >= req.maxFrames) { truncated = true; close(null); return false; }
            return true;
        },
        onStill: function (p, i) {
            if (clip) { clip.sample(i); }
            var handled = p.then(function (still) {
                if (i === 0) {
                    scene = still.scene;
                    dims = { width: still.width, height: still.height };
                    if (req.stopAt.ticks !== undefined) { stopTick = still.tick + req.stopAt.ticks; }
                    if (stopTick !== null && still.tick > stopTick) {
                        _fail('record', 'stopAt.tick ' + stopTick + ' is already in the past — the first ' +
                            'capture is tick ' + still.tick);
                    }
                }
                frames[i] = { i: i, tick: still.tick, pose: still.pose };
                encodeChain = encodeChain.then(function (enc) {
                    var sample = new enc.MB.VideoSample(still.data, {
                        format: 'RGBA', codedWidth: still.width, codedHeight: still.height,
                        timestamp: i / req.fps, duration: 1 / req.fps
                    });
                    return Promise.resolve(enc.source.add(sample)).then(function () {
                        sample.close();
                        return enc;
                    }, function (e) { sample.close(); throw e; });
                });
                // Handled at close; a rejected encode must not surface as unhandled meanwhile.
                encodeChain.then(null, function (e) { close(e); });
                if (stopTick !== null && still.tick + req.everyTicks > stopTick) { close(null); }
            }, function (e) { close(e); });
            inflight.push(handled);
            return handled;
        }
    });

    // An abort ends the recording before its declared stop — that IS what `truncated` reports.
    // With no still captured yet, close() refuses with "nothing to encode".
    if (req.signal) {
        onAbort = function () { truncated = true; close(null); };
        if (req.signal.aborted) { onAbort(); return done; }
        req.signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
        if (path) {
            var last = path.waypoints.length - 1;
            path.onWaypoint(function (evt) { if (evt.index === last) { close(null); } });
            path.start();
        }
    } catch (e) { close(e); }
    return done;
}

/**
 * attach(runner) — bind the handle to a runner. Stateless: the handle is a thin forwarder.
 * @param {object} runner — an FrqtlApp
 * @returns {object} the handle (see the module docstring)
 */
function attach(runner) {
    if (!runner || typeof runner.capture !== 'function' || typeof runner.captureStill !== 'function' ||
        typeof runner.sceneRecord !== 'function') {
        throw new Error('[FrqtlVision.attach] needs an FrqtlApp exposing capture(stage), ' +
            'captureStill() and sceneRecord() (the RENDER_STAGES tap contract). (FAIL-LOUD.)');
    }
    var RS = RenderStages;
    return {
        // FERRIED from the owner — a hand-written stage list here would be the
        // schema-mirror bug, and a stage added to the table appears here for free.
        stages:     RS.RENDER_STAGES.slice(),
        finalStage: RS.finalStage,
        /**
         * getScene() — the run-invariant SceneRecord plus its own content id. Pure forwarding.
         *
         * **MUST BE AWAITED.** It is a Promise because the scene id is a content hash and
         * `crypto.subtle.digest` — the ONE hashing implementation, a global in both Node and
         * the browser — is Promise-based; a synchronous accessor would need a second,
         * hand-rolled sha256 in the render layer. The failure mode is SILENT and has already
         * been hit once in the realm: an un-awaited Promise has NO own keys and
         * `JSON.stringify(promise)` is `'{}'`, so
         *   `JSON.stringify({ scene: vision.getScene() })`   // ← writes {} into the corpus
         * looks like an empty SceneRecord rather than a mistake. Always:
         *   `const scene = await vision.getScene();`
         *
         * The returned record is a fresh COPY each call — it shares no object identity with
         * the runner's internal memo, so mutating it cannot corrupt the record for any other
         * caller or break the hash other stills already reference.
         * @returns {Promise<object>}
         */
        getScene: function () { return runner.sceneRecord(); },
        /**
         * getStill(stage?) — pure forwarding. Omit `stage` for the fully composed stack.
         * @param {string} [stage]
         * @returns {Promise<object>}
         */
        getStill: function (stage) {
            return (stage === undefined) ? runner.captureStill() : runner.capture(stage);
        },
        /**
         * getStream({stage?, everyTicks}) — stills at a TICK cadence, as an async iterable.
         * Iterating subscribes; `break` unsubscribes. The queue is UNBOUNDED (a slow consumer
         * holds every sampled still in memory); `record`'s `maxFrames` is the bound when one
         * is needed. See the module docstring for the hold and the one-scene/one-size rule.
         * @param {{stage?:string, everyTicks:number}} opts
         * @returns {AsyncIterable<object>}
         */
        getStream: function (opts) { return _getStream(runner, RS, opts); },
        /**
         * record(opts) → Promise<VideoEnvelope> — sample like `getStream`, encode an MP4.
         *
         *   everyTicks        REQUIRED — capture cadence in TICKS (sampling starts at the first
         *                     tick after this call, then every `everyTicks`)
         *   stopAt            REQUIRED — exactly one of `{tick: T}` (absolute, inclusive),
         *                     `{ticks: K}` (K ticks after the first capture),
         *                     `{path: {waypoints, loop?, waypointTimeoutMs?}}` (a CameraPath
         *                     flight started with the recording; stop = arrival at its last
         *                     waypoint)
         *   maxFrames         REQUIRED — the memory bound; reaching it before `stopAt` stops the
         *                     recording and reports `truncated: true`
         *   fps               REQUIRED — PLAYBACK rate only; frame i is timestamped i/fps
         *   stage             default `finalStage()`; must be an rgba8 stage
         *   signal            an AbortSignal: abort ends the recording early with the stills
         *                     captured so far and `truncated: true` (rejects if none yet)
         *   bitrate           default mediabunny QUALITY_HIGH (resolution-scaled); bits/second
         *   keyFrameInterval  default 1 — every frame independently decodable
         *
         * Resolves `CaptureEnvelope.videoEnvelope`: `encoded {mime, bytes (base64), encoder,
         * codec (as PRODUCED), muxer ('mediabunny@<pin>')}`, `track {scene, stage, width,
         * height, ticksPerFrame, fps, firstTick, lastTick, frames[{i, tick, pose}]}` (every row
         * derived from its still), `truncated`. Never throws synchronously.
         * @param {object} opts
         * @returns {Promise<object>}
         */
        record: function (opts) {
            try { return _record(runner, RS, opts); }
            catch (e) { return Promise.reject(e); }
        },
        toDataURL: toDataURL,
        toPNG:     toPNG
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

var FrqtlVision = { attach: attach, toDataURL: toDataURL, toPNG: toPNG };

// The capture-host KIND's in-page recorder is THIS face: registered here, so capture-host
// never names FrqtlVision (the import runs one way: FrqtlVision → capture-host).
FrqtlCaptureHost.registerRecorder(FrqtlVision);

export { FrqtlVision };

