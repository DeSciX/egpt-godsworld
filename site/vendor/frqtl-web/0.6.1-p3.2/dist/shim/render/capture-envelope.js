/* Copyright 2023-2026 by Essam Abadir */

/**
 * capture-envelope.js — the TRANSPORT contract for a capture leaving this process.
 *
 * ── What it packages ─────────────────────────────────────────────────────────
 *
 * A still that stays in-process is `normalizeStill`'s bag and nothing more. A capture that
 * CROSSES a boundary — to a model, an app microservice, a corpus row — needs two things the
 * bag deliberately does not carry: the ENCODED bytes (rgba8 is not transportable), and, for
 * a sequence, the map from frame index back to simulation state.
 *
 * This module adds exactly that envelope and NOTHING else.
 *
 * ── Why it composes rather than re-declares ──────────────────────────────────
 *
 * `render-stages.js` in this same directory OWNS the still schema: it holds `SCHEMA_VERSION`,
 * refuses an unknown stage, refuses a `format` disagreeing with its stage, refuses an empty
 * payload, refuses a still with no `scene` hash, and snapshots `data` so a live reference can
 * never leak into a corpus. Re-listing `{stage, format, width, height, data, tick, scene}`
 * here would be a hand mirror of that schema and would drift the first time a stage is added
 * — the review-blocking bug class this codebase names by hand. So the still rides WHOLE,
 * under one key, normalized by its owner, and this file never reads inside it except to
 * cross-check what the encoder claims.
 *
 * ── The two forms ────────────────────────────────────────────────────────────
 *
 *   stillEnvelope({ still, encoded })        one capture
 *   videoEnvelope({ track, encoded, truncated })   a sequence + its sidecar manifest
 *
 * The still envelope carries NO pose of its own: `normalizeStill` already holds `pose`, and a
 * second one here would be a duplicated owner field. The VIDEO track carries pose per frame,
 * because the owner has no notion of a sequence and nothing there could hold it.
 *
 * ── The encoded half: ONE key table per form, bytes always base64 ─────────────
 *
 * `ENCODED_KEYS[kind]` is the whole encoded shape of each form and the normalizer BUILDS its
 * output by iterating it, so a declared field cannot be silently dropped on the way through.
 * `bytes` is a base64 STRING in every host — the envelope is the transport form, and a string
 * crosses a JSON boundary (a browser-automation `evaluate`, an HTTP body) unchanged. A video
 * additionally REQUIRES `codec` (the codec string the encoder actually PRODUCED, never the
 * request) and `muxer` (the pinned muxer that wrote the container). `ENCODERS` is the table of
 * producers this contract recognises, each with the form and mime it produces.
 *
 * ── Why `truncated` has NO default ───────────────────────────────────────────
 *
 * `FrqtlVision.record` stops at its `maxFrames` bound and reports it as `truncated: true`,
 * because "a truncated sequence that LOOKS complete is worse than a refusal". Defaulting
 * `truncated` to false here would re-create that lie one layer up: a caller who forgot to
 * ferry the flag would ship a short recording carrying an explicit claim of completeness. So it
 * is REQUIRED, and a missing one throws.
 *
 * ── Why frame cadence is checked against the declared cadence ────────────────
 *
 * `ticksPerFrame` is the CAPTURE cadence (a tick IS the frame); `fps` is a PLAYBACK choice
 * with no physical meaning — engine speed is 1 px/tick, so a presentation rate says nothing
 * about the simulation. Both are required because collapsing them destroys the tick index,
 * and the tick index is the only thing that makes a frame comparable to engine state. The
 * frames' own tick deltas must equal the declared cadence: a manifest whose label disagrees
 * with its data is worse than an unlabelled one, because it will be believed.
 */

import * as RenderStages from './render-stages.js';



/** Envelope schema version. Independent of the still's own `v`, which its owner sets. */
var ENVELOPE_VERSION = 1;

/**
 * The encoded shape of each envelope form. `encoder` is optional (null when absent) and
 * validated against `ENCODERS` when present; every other key is a REQUIRED non-empty string.
 */
var ENCODED_KEYS = {
    still: ['mime', 'bytes', 'encoder'],
    video: ['mime', 'bytes', 'encoder', 'codec', 'muxer']
};

/** The mime family each form accepts. */
var MIME_PREFIX = { still: 'image/', video: 'video/' };

/** The producers this contract recognises: the form each produces and its mime. */
var ENCODERS = {
    'FrqtlVision.toPNG':     { kind: 'still', mime: 'image/png' },
    'FrqtlVision.toDataURL': { kind: 'still', mime: 'image/png' },
    'FrqtlVision.record':    { kind: 'video', mime: 'video/mp4' }
};

function _fail(msg) { throw new Error('[capture-envelope] ' + msg + ' (FAIL-LOUD.)'); }

function _requireBool(value, name) {
    if (typeof value !== 'boolean') {
        _fail(name + ' must be an explicit boolean, got ' + String(value) +
              ' — it is never defaulted, because a fabricated completeness claim is the ' +
              'exact failure the recorder\'s own bound reporting exists to prevent');
    }
    return value;
}

function _requirePosInt(value, name) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0 || value % 1 !== 0) {
        _fail(name + ' must be a positive whole number, got ' + String(value));
    }
    return value;
}

function _requireNonEmptyString(value, name, why) {
    if (typeof value !== 'string' || !value) { _fail(name + ' must be a non-empty string' + (why ? ' — ' + why : '') + ', got ' + String(value)); }
    return value;
}

/** Validate the encoded half of a `kind` envelope, building the output off `ENCODED_KEYS`. */
function _normalizeEncoded(encoded, kind) {
    if (!encoded || typeof encoded !== 'object') { _fail('`encoded` must be an object carrying the transportable bytes'); }
    var out = {};
    var keys = ENCODED_KEYS[kind];
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === 'encoder') {
            out.encoder = (encoded.encoder === undefined) ? null : encoded.encoder;
        } else if (k === 'bytes') {
            if (typeof encoded.bytes !== 'string' || !encoded.bytes) {
                _fail('encoded.bytes must be a non-empty base64 string — the envelope carries ' +
                      'TRANSPORTABLE bytes; an rgba8 payload does not cross a boundary and the ' +
                      'still already holds it');
            }
            out.bytes = encoded.bytes;
        } else {
            out[k] = _requireNonEmptyString(encoded[k], 'encoded.' + k);
        }
    }
    if (out.mime.indexOf(MIME_PREFIX[kind]) !== 0) {
        _fail('encoded.mime ' + JSON.stringify(out.mime) + ' is not a ' + MIME_PREFIX[kind] + '* type');
    }
    if (out.encoder !== null) {
        if (!Object.prototype.hasOwnProperty.call(ENCODERS, out.encoder)) {
            _fail('unknown encoder ' + JSON.stringify(out.encoder) + ' — known: ' +
                  Object.keys(ENCODERS).join(', '));
        }
        var known = ENCODERS[out.encoder];
        if (known.kind !== kind) {
            _fail('encoder ' + JSON.stringify(out.encoder) + ' produces a ' + known.kind +
                  ', not a ' + kind);
        }
        if (known.mime !== out.mime) {
            _fail('encoder ' + JSON.stringify(out.encoder) + ' produces ' +
                  JSON.stringify(known.mime) + ', but encoded.mime says ' + JSON.stringify(out.mime));
        }
    }
    return out;
}

/**
 * bytesToBase64(bytes) — THE transportable-bytes encoding, in every host.
 *
 * A typed array → a base64 string, chunked (a per-byte concat of megabytes is slow, and
 * `String.fromCharCode.apply` has an argument limit). The one encoder of `encoded.bytes`, and
 * of the capture host's in-page payload: both read it from here, never from a copy.
 *
 * @param {ArrayBufferView} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
    if (!bytes || typeof bytes.BYTES_PER_ELEMENT !== 'number') {
        _fail('bytesToBase64 expects a typed array, got ' + String(bytes));
    }
    if (typeof btoa !== 'function') {
        _fail('bytesToBase64 needs a global btoa (every browser, and node >= 16)');
    }
    var u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var bin = '';
    for (var i = 0; i < u8.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

/**
 * Compose a single-capture envelope.
 *
 * @param {{still:object, encoded:{mime:string,bytes:string,encoder?:string}}} partial
 *   `still` is a RAW partial bag; it is normalized HERE by its owner, never pre-normalized
 *   by the caller (that would let two callers disagree about who validated).
 * @returns {object} the envelope
 */
function stillEnvelope(partial) {
    if (!partial || typeof partial !== 'object') { _fail('expected an object, got ' + String(partial)); }

    var still = RenderStages.normalizeStill(partial.still);
    var encoded = _normalizeEncoded(partial.encoded, 'still');

    return {
        kind:     'still',
        v:        ENVELOPE_VERSION,
        still:    still,
        encoded:  encoded
    };
}

/**
 * Compose a sequence envelope. `track` is the SIDECAR MANIFEST — without it the bytes are an
 * unlabelled movie and no frame can be aligned to the state that produced it.
 *
 * @param {{track:object, encoded:{mime:string,bytes:string,codec:string,muxer:string,encoder?:string},
 *          truncated:boolean}} partial
 * @returns {object} the envelope
 */
function videoEnvelope(partial) {
    if (!partial || typeof partial !== 'object') { _fail('expected an object, got ' + String(partial)); }

    var t = partial.track;
    if (!t || typeof t !== 'object') { _fail('`track` (the sidecar manifest) is REQUIRED — without it the bytes are an unlabelled movie'); }

    _requireNonEmptyString(t.scene, 'track.scene',
        'a sequence without a scene id is unmoored exactly as a still without one is');
    var stage = RenderStages.assertStage(t.stage);

    var width  = _requirePosInt(t.width,  'track.width');
    var height = _requirePosInt(t.height, 'track.height');
    var ticksPerFrame = _requirePosInt(t.ticksPerFrame, 'track.ticksPerFrame');
    var fps = _requirePosInt(t.fps, 'track.fps');

    var frames = t.frames;
    if (!Array.isArray(frames) || frames.length === 0) {
        _fail('track.frames must be a non-empty array of {i, tick, pose} — an empty manifest ' +
              'over real bytes is a measurement built on nothing');
    }

    for (var n = 0; n < frames.length; n++) {
        var f = frames[n];
        if (!f || typeof f !== 'object') { _fail('track.frames[' + n + '] must be an object'); }
        if (f.i !== n) {
            _fail('track.frames[' + n + '].i is ' + String(f.i) + ' — frame indices must be ' +
                  'contiguous from 0, or the map from bytes to state is guesswork');
        }
        if (typeof f.tick !== 'number' || !isFinite(f.tick) || f.tick % 1 !== 0) {
            _fail('track.frames[' + n + '].tick must be a whole number, got ' + String(f.tick));
        }
        if (n > 0) {
            var delta = f.tick - frames[n - 1].tick;
            if (delta !== ticksPerFrame) {
                _fail('track.frames[' + n + '] is ' + delta + ' ticks after its predecessor, but ' +
                      'track.ticksPerFrame declares ' + ticksPerFrame + ' — a manifest whose ' +
                      'label disagrees with its data is worse than none, because it is believed');
            }
        }
    }

    var encoded = _normalizeEncoded(partial.encoded, 'video');

    return {
        kind:      'video',
        v:         ENVELOPE_VERSION,
        track: {
            scene:         t.scene,
            stage:         stage,
            width:         width,
            height:        height,
            ticksPerFrame: ticksPerFrame,
            fps:           fps,
            firstTick:     frames[0].tick,
            lastTick:      frames[frames.length - 1].tick,
            frames:        frames.map(function (f) {
                return { i: f.i, tick: f.tick, pose: f.pose === undefined ? null : f.pose };
            })
        },
        encoded:   encoded,
        truncated: _requireBool(partial.truncated, 'truncated')
    };
}

export {
    ENVELOPE_VERSION,
    ENCODED_KEYS,
    ENCODERS,
    bytesToBase64,
    stillEnvelope,
    videoEnvelope
};
