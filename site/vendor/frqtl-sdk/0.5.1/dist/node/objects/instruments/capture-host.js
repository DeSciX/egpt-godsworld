/* Copyright 2023-2026 by Essam Abadir */

/**
 * capture-host.js — THE CAPTURE-HOST KIND: a stage executor that runs REMOTELY.
 *
 * Peer of `capture.js` in this directory (the tap MECHANISM) and deliberately narrower:
 * `capture.js` owns dispatch, throw rules and provenance for stages this process can
 * execute; a CAPTURE HOST executes a stage in ANOTHER process — a managed headless
 * browser running the real render stack — and hands back a bag that was already
 * normalized THERE. This file is the contract that makes that safe: the KIND's shape,
 * the ONE boundary codec, and the verification that proves the two processes are
 * talking about the SAME scene.
 *
 * Contract text: docs/internal/engine/RENDERER_CONTRACT.md §9 (the capture-host KIND) and
 * §10.3 (the normalized format this ferries).
 *
 * ── Why a distinct KIND and not a provider-shaped adapter (architect ruling, V3) ──
 *
 * A `RendererProvider` adapter would have been the tempting shape: implement
 * `captureStill()` in node, forward to the browser, let the local dispatcher stamp the
 * provenance. It is WRONG, and not by taste — the local process has none of the facts
 * the provenance is made of. It has no tick (the world is in the page), no pose (the
 * camera is in the page), no ordered filter list, no render options, no canvas dims. A
 * provider-shaped adapter would therefore have had to INVENT them, which is the
 * caller-supplied-provenance anti-pattern at industrial scale: a corpus row that looks
 * fully stamped and is fiction.
 *
 * So the KIND inverts the arrow. **The IN-PAGE dispatcher stamps everything** (it is a
 * real `FrqtlCapture` over a real loop and a real provider — the ONE authority, the same
 * code the browser user runs), and the node side's job is not to stamp but to VERIFY:
 * every still it hands back must carry the SAME scene identity the node side computed
 * independently. Measured fidelity, not trust.
 *
 * ── The KIND (what an implementation must be) ─────────────────────────────────
 *
 *   {
 *     kind:       'capture-host',              // the KIND tag — asserted, never inferred
 *     stages:     string[],                    // stages this executor executes REMOTELY
 *     identity():  { build, projection },      // SYNC — resolved once at open()
 *     capture(stage): Promise<Still>,          // a FULLY NORMALIZED bag, stamped remotely
 *     record(opts): Promise<VideoEnvelope>,    // FrqtlVision.record, run where the world is
 *                                              // (opts.signal aborts it across the boundary)
 *     dispose():   Promise<void>               // symmetric with whatever open() acquired
 *   }
 *
 * `record` FORWARDS to the one recorder, `FrqtlVision.record`, running in the host's page
 * over its own runner — the tick listener, the hold, the stills and the encoder are all
 * there. The host adds no recording logic; the node side re-validates the returned envelope
 * against its owner and VERIFIES its scene (`verifyVideo`), exactly as it verifies a still.
 *
 * `identity()` is SYNCHRONOUS on purpose: `sceneRecord()` builds its record from live
 * field reads and only its HASH is async, so an async identity read here would have
 * forced the record build itself to become async and rippled through every caller. An
 * implementation resolves the page's `build`/`projection` during its own async `open()`
 * and serves them from a field afterwards — they cannot change within a run anyway
 * (§10.3: the display provider is boot-fixed).
 *
 * ── a.3 · identity convergence (the finding that would have split every corpus row) ──
 *
 * As-built, a node-side identity carries `build: {engine:null, renderer:null, …}` and
 * `projection: null`, because those are derived from BROWSER boot authorities that do not
 * exist in node. The page's identity carries the real ones. Two different records ⇒ two
 * different hashes ⇒ EVERY hosted row would have declared a different scene than the
 * browser row of the same scene, silently, forever.
 *
 * The fix is structural, not a comparison relaxation: attaching a host EXTENDS the node
 * identity with the page-resolved `build`/`projection` (`capture.js` reads them through
 * the attached host), so the two records are equal BY CONSTRUCTION and the hash check is
 * a real check rather than a tautology waiting to be loosened. What remains genuinely
 * node-owned — `seed`, `sourceRef`, `physicsW/H` — is what the host must make the page
 * agree to (it boots with `?seed=`, registers the source ref, and lands on a page whose
 * canvas defines the bounds), and `diffSceneRecords` below names any survivor by field.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This is the output boundary, in two processes instead of one. Nothing
 * here touches a frame, a dimension, a tick or an op-program, and the node side never
 * drives a clock: the page's own loop is the tick authority (a second clock across a
 * process boundary is the two-clocks bug with network latency added).
 */

(function () {
    'use strict';

    /** The KIND tag. A `RendererProvider` does not carry it — that is the point. */
    var CAPTURE_HOST_KIND = 'capture-host';

    /**
     * Resolve the shim-owned stage vocabulary through a named FAIL-LOUD guard — the same
     * seam `capture.js` uses, for the same reason (a local stage list here would be the
     * schema-mirror drift the owner exists to prevent).
     * @private
     */
    function _resolveRenderStages() {
        var RS = (typeof window !== 'undefined' && window.RenderStages) ? window.RenderStages
               : ((typeof RenderStages !== 'undefined') ? RenderStages : null);
        if (!RS) {
            throw new Error('[FrqtlCaptureHost] canonical contract RenderStages ' +
                '(lib/shim/render/render-stages.js) is unreachable — a host ferries the ' +
                'owner\'s vocabulary and normalizer, never a copy. Fail-loud, not a fallback.');
        }
        return RS;
    }

    /**
     * assertCaptureHost(host) — throw-or-return the KIND gate.
     *
     * The `kind` tag is checked FIRST and by exact string, so the most likely mistake —
     * handing this a provider-shaped object because "it has captureStill()" — names its
     * own diagnosis instead of failing later on a missing method.
     *
     * @param {object} host
     * @returns {object} the same host, when valid
     * @throws {Error} FAIL-LOUD on any missing/mis-shaped member.
     */
    function assertCaptureHost(host) {
        var RS = _resolveRenderStages();
        if (!host || typeof host !== 'object') {
            throw new Error('[FrqtlCaptureHost] expected a capture-host object, got ' +
                String(host) + '. (FAIL-LOUD.)');
        }
        if (host.kind !== CAPTURE_HOST_KIND) {
            throw new Error('[FrqtlCaptureHost] this object is not a ' +
                JSON.stringify(CAPTURE_HOST_KIND) + ' (its kind is ' + JSON.stringify(host.kind) +
                '). A capture host is a DISTINCT stage-executor kind, not a RendererProvider: a ' +
                'provider returns raw pixels and lets the local dispatcher stamp provenance, ' +
                'which a remote executor cannot honestly do — it holds no tick, no pose, no ' +
                'filter order. A host returns a bag already normalized by the dispatcher that ' +
                'DOES hold them. (FAIL-LOUD.)');
        }
        if (!Array.isArray(host.stages) || host.stages.length === 0) {
            throw new Error('[FrqtlCaptureHost] `stages` must be a non-empty array of stage ' +
                'names this host executes remotely — [' + RS.RENDER_STAGES.join(', ') +
                ']. (FAIL-LOUD.)');
        }
        for (var i = 0; i < host.stages.length; i++) { RS.assertStage(host.stages[i]); }
        ['identity', 'capture', 'record', 'dispose'].forEach(function (m) {
            if (typeof host[m] !== 'function') {
                throw new Error('[FrqtlCaptureHost] a capture host must implement ' + m + '() — ' +
                    'the KIND is {kind, stages, identity(), capture(stage), record(opts), dispose()}. ' +
                    '(FAIL-LOUD.)');
            }
        });
        var ident = host.identity();
        if (!ident || typeof ident !== 'object') {
            throw new Error('[FrqtlCaptureHost] identity() must return the page-resolved ' +
                '{build, projection} bag SYNCHRONOUSLY (resolved once during the host\'s own ' +
                'open()); got ' + String(ident) + '. Without it the node-side scene identity ' +
                'carries nulls where the page carries real values, and every hosted row splits ' +
                'into a second scene. (FAIL-LOUD.)');
        }
        return host;
    }

    // ── The BOUNDARY CODEC — authored ONCE, here ─────────────────────────────
    //
    // Exactly one thing crosses the process boundary: the normalized bag. Never a raw
    // pixel buffer plus reassembly code on the node side, which would mint a second
    // encoder beside `FrqtlVision.toDataURL` and let the two disagree about row order,
    // colour space or alpha.
    //
    // The problem the codec solves is narrow and real: a browser-automation `evaluate`
    // boundary is JSON-shaped, and a typed array does not survive it (it arrives as an
    // object with integer keys — silently, and 4x the bytes). So the payload rides as
    // base64 and is rebuilt into the SAME typed-array constructor the page produced.

    /**
     * IN_PAGE_CAPTURE — THE IN-PAGE HALF OF THE CODEC. **This function runs in the PAGE.**
     *
     * It is handed to a browser `evaluate()` as source text, so it closes over NOTHING:
     * every contract it needs (`window.RenderStages`, `window._frqtlApp`) it resolves from
     * the page's own globals, which is exactly where the page publishes them. Keep it
     * self-contained — a captured variable here fails at runtime in the page, not at build
     * time here.
     *
     * It performs NO capture logic of its own: it calls the page's `capture(stage)` — the
     * one dispatcher, which stamps all provenance — and then encodes the result for
     * transport. Encoding is declared IN the envelope (`encoding`), so the node half
     * obeys the page's declaration instead of re-deriving the rule.
     *
     * @param {{stage: string}} args
     * @returns {Promise<{bag: object, encoding: string, ctor: (string|null), payload: *}>}
     */
    var IN_PAGE_CAPTURE = function (args) {
        var app = window._frqtlApp;
        if (!app) {
            throw new Error('[FrqtlCaptureHost/in-page] no window._frqtlApp on this page — the ' +
                'host booted something that is not a running FRQTL stack. (FAIL-LOUD.)');
        }
        return Promise.resolve(app.capture(args.stage)).then(function (still) {
            var data = still.data;
            var bag = {};
            for (var k in still) { if (k !== 'data') { bag[k] = still[k]; } }
            // A typed array does not survive a JSON boundary; a plain framedata array does
            // (the normalizer already flattened it to plain data — that is what makes the
            // whole format serialization-safe). The choice is declared, never re-derived.
            if (data && typeof data.BYTES_PER_ELEMENT === 'number') {
                // The ONE transportable-bytes encoder, read from the page's global at run time
                // (the page loads capture-envelope.js in its ENGINE phase) — never a copy here.
                if (!window.CaptureEnvelope || typeof window.CaptureEnvelope.bytesToBase64 !== 'function') {
                    throw new Error('[FrqtlCaptureHost/in-page] no window.CaptureEnvelope on this page — ' +
                        'the transport contract (lib/shim/render/capture-envelope.js) encodes the ' +
                        'payload and loads in the ENGINE phase. (FAIL-LOUD.)');
                }
                return { bag: bag, encoding: 'base64', ctor: data.constructor.name,
                         payload: window.CaptureEnvelope.bytesToBase64(data) };
            }
            return { bag: bag, encoding: 'plain', ctor: null, payload: data };
        });
    };

    /**
     * IN_PAGE_RECORD_BEGIN / _END / _ABORT — the recorder, in the PAGE, in three calls.
     * **All run in the PAGE** and close over nothing.
     *
     * BEGIN calls the ONE recorder, `FrqtlVision.attach(window._frqtlApp).record(opts)`, which
     * subscribes to the tick fan-out SYNCHRONOUSLY, and parks its Promise plus an
     * `AbortController` (whose signal the page-side record is given — a node-side signal cannot
     * cross `evaluate`) under `id` in the host's ledger, `window._frqtlHostedRecordings` — so a
     * drive the node side issues after BEGIN resolves cannot run ticks the recorder did not
     * see. END awaits the parked Promise and removes the entry once it settles. ABORT aborts
     * the parked controller and returns true, or returns false when no recording is parked
     * under `id` (it already settled — aborting a finished operation is not an error in the
     * AbortSignal contract). The envelope crosses the boundary as plain JSON: its bytes are
     * already base64 by the envelope owner's contract.
     *
     * @param {{id: number, opts: object}} args  (END and ABORT take {id})
     */
    var IN_PAGE_RECORD_BEGIN = function (args) {
        var app = window._frqtlApp;
        if (!app) {
            throw new Error('[FrqtlCaptureHost/in-page] no window._frqtlApp on this page — the ' +
                'host booted something that is not a running FRQTL stack. (FAIL-LOUD.)');
        }
        if (!window.FrqtlVision) {
            throw new Error('[FrqtlCaptureHost/in-page] no window.FrqtlVision on this page — the ' +
                'recorder is published by the game-layer manifest. (FAIL-LOUD.)');
        }
        var parked = window._frqtlHostedRecordings || (window._frqtlHostedRecordings = {});
        var controller = new AbortController();
        var opts = {};
        for (var k in args.opts) { opts[k] = args.opts[k]; }
        opts.signal = controller.signal;
        var pending = window.FrqtlVision.attach(app).record(opts);
        pending.then(null, function () {});      // delivered by END, never unhandled meanwhile
        parked[args.id] = { pending: pending, controller: controller };
        return args.id;
    };

    var IN_PAGE_RECORD_END = function (args) {
        var parked = window._frqtlHostedRecordings || {};
        var entry = parked[args.id];
        if (!entry) {
            throw new Error('[FrqtlCaptureHost/in-page] no recording parked under id ' + args.id +
                '. (FAIL-LOUD.)');
        }
        var forget = function () { delete parked[args.id]; };
        return entry.pending.then(function (env) { forget(); return env; },
                                  function (e) { forget(); throw e; });
    };

    var IN_PAGE_RECORD_ABORT = function (args) {
        var parked = window._frqtlHostedRecordings || {};
        var entry = parked[args.id];
        if (!entry) { return false; }
        entry.controller.abort();
        return true;
    };

    /**
     * decodeStillEnvelope(env) — THE NODE-SIDE HALF of the codec.
     *
     * Rebuilds the payload and re-runs the OWNER'S normalizer over the bag. Re-normalizing
     * is not a second stamping: every provenance field is the page's, ferried verbatim —
     * what the normalizer adds is VALIDATION (a payload that arrived empty, a format that
     * does not match its stage, a missing scene id all fail loud here rather than entering
     * a corpus) and the plain-data snapshot the contract promises.
     *
     * The payload's TYPE is ferried (`ctor`), not mapped: a local format→constructor table
     * would be a hand mirror of the stage table's own declaration, and the page already
     * knows the answer exactly.
     *
     * @param {object} env — an `IN_PAGE_CAPTURE` envelope
     * @returns {object} a full normalized still bag
     */
    function decodeStillEnvelope(env) {
        var RS = _resolveRenderStages();
        if (!env || typeof env !== 'object' || !env.bag) {
            throw new Error('[FrqtlCaptureHost.decodeStillEnvelope] expected a capture envelope ' +
                '{bag, encoding, ctor, payload}, got ' + String(env) + '. (FAIL-LOUD.)');
        }
        var data;
        if (env.encoding === 'base64') {
            if (typeof Buffer === 'undefined' || typeof Buffer.from !== 'function') {
                throw new Error('[FrqtlCaptureHost.decodeStillEnvelope] base64 payloads are ' +
                    'decoded with Node\'s Buffer — the node half of the boundary runs in Node by ' +
                    'definition. (FAIL-LOUD.)');
            }
            var Ctor = (typeof globalThis !== 'undefined') ? globalThis[env.ctor] : null;
            if (typeof Ctor !== 'function' || typeof Ctor.BYTES_PER_ELEMENT !== 'number') {
                throw new Error('[FrqtlCaptureHost.decodeStillEnvelope] the envelope declares ' +
                    'payload type ' + JSON.stringify(env.ctor) + ', which is not a typed-array ' +
                    'constructor here. The payload TYPE is ferried from the page, never mapped ' +
                    'from the format — a local table would be a hand mirror. (FAIL-LOUD.)');
            }
            data = new Ctor(Buffer.from(env.payload, 'base64'));
        } else if (env.encoding === 'plain') {
            data = env.payload;
        } else {
            throw new Error('[FrqtlCaptureHost.decodeStillEnvelope] unknown payload encoding ' +
                JSON.stringify(env.encoding) + ' — the ENCODING SIDE declares it (base64 for a ' +
                'typed buffer, plain for JSON-safe data) and this side obeys. (FAIL-LOUD.)');
        }
        var partial = {};
        for (var k in env.bag) { partial[k] = env.bag[k]; }
        partial.data = data;
        return RS.normalizeStill(partial);
    }

    // ── VERIFICATION — the node side proves, per still, that it is the same scene ──

    /**
     * diffSceneRecords(a, b) — the `SCENE_KEYS` on which two records disagree.
     *
     * Driven off the OWNER'S key list and its OWN canonical encoding, so a scene field
     * added to the contract is compared here with no edit. Used at attach time to turn
     * "the hashes differ" — the least actionable error a content-addressed format can
     * produce — into "seed, physicsH".
     *
     * @param {object} a
     * @param {object} b
     * @returns {string[]} the differing key names, in table order
     */
    function diffSceneRecords(a, b) {
        var RS = _resolveRenderStages();
        var out = [];
        for (var i = 0; i < RS.SCENE_KEYS.length; i++) {
            var k = RS.SCENE_KEYS[i];
            // canonicalizeScene is the ONE canonical encoding; projecting a single field
            // through a one-key record reuses it rather than re-implementing key-sorted
            // deep equality here.
            var ea = RS.canonicalizeScene(_one(k, a));
            var eb = RS.canonicalizeScene(_one(k, b));
            if (ea !== eb) { out.push(k); }
        }
        return out;
    }

    /** A record carrying ONE key's value, for the per-field canonical compare. @private */
    function _one(key, rec) {
        var r = {};
        r[key] = rec ? rec[key] : undefined;
        return r;
    }

    /**
     * verifyStill(expectedSceneId, stage, still) — the per-still fidelity check.
     *
     * The node side computed a scene identity independently; the page stamped one into the
     * still. Equal ⇒ the two processes agree about what was captured. Unequal ⇒ something
     * moved mid-run (a re-init, a resize, a re-seeded reload) and the row is REFUSED — a
     * still that lies about its scene is worse than no still, because it verifies against
     * the wrong header forever.
     *
     * @param {string} expectedSceneId — the node-side `sceneRecord().scene`
     * @param {string} stage
     * @param {object} still — the decoded, normalized bag
     * @returns {object} the same still, when it verifies
     * @throws {Error} FAIL-LOUD on a scene or stage mismatch.
     */
    function verifyStill(expectedSceneId, stage, still) {
        if (!still || typeof still !== 'object') {
            throw new Error('[FrqtlCaptureHost] the host returned no still for stage ' +
                JSON.stringify(stage) + '. (FAIL-LOUD — never a null still.)');
        }
        if (still.stage !== stage) {
            throw new Error('[FrqtlCaptureHost] asked the host for stage ' + JSON.stringify(stage) +
                ' and it returned stage ' + JSON.stringify(still.stage) + '. (FAIL-LOUD.)');
        }
        if (still.scene !== expectedSceneId) {
            throw new Error('[FrqtlCaptureHost] SCENE IDENTITY MISMATCH: the hosted page stamped ' +
                JSON.stringify(still.scene) + ' but this process computed ' +
                JSON.stringify(expectedSceneId) + ' for the same scene. The two are supposed to be ' +
                'equal BY CONSTRUCTION (host attachment extends the node identity with the ' +
                'page-resolved build/projection), so a mismatch means the page is no longer ' +
                'running the scene this handle was opened for. The still is REFUSED rather than ' +
                'filed against the wrong header. (FAIL-LOUD.)');
        }
        return still;
    }

    /** The envelope owner, ferried (node: the shim by literal require). @private */
    function _resolveCaptureEnvelope() {
        if (typeof window !== 'undefined' && window.CaptureEnvelope) { return window.CaptureEnvelope; }
        if (typeof require === 'function') { return require('../../../shim/render/capture-envelope.js'); }
        throw new Error('[FrqtlCaptureHost] canonical contract CaptureEnvelope ' +
            '(lib/shim/render/capture-envelope.js) is unreachable. Fail-loud, not a fallback.');
    }

    /**
     * verifyVideo(expectedSceneId, envelope) — the per-recording fidelity check.
     *
     * Re-runs the OWNER'S `videoEnvelope` over what the page returned (validation — cadence,
     * contiguous indices, encoded fields — never a second stamping), then refuses a recording
     * whose scene is not the one this process computed, for the same reason `verifyStill`
     * refuses a still.
     *
     * @param {string} expectedSceneId — the node-side `sceneRecord().scene`
     * @param {object} envelope — what the host's `record` resolved
     * @returns {object} the re-normalized envelope, when it verifies
     * @throws {Error} FAIL-LOUD on a malformed envelope or a scene mismatch.
     */
    function verifyVideo(expectedSceneId, envelope) {
        if (!envelope || typeof envelope !== 'object' || envelope.kind !== 'video') {
            throw new Error('[FrqtlCaptureHost] the host returned no video envelope (got ' +
                String(envelope && envelope.kind) + '). (FAIL-LOUD — never a null recording.)');
        }
        var env = _resolveCaptureEnvelope().videoEnvelope({
            track: envelope.track, encoded: envelope.encoded, truncated: envelope.truncated
        });
        if (env.track.scene !== expectedSceneId) {
            throw new Error('[FrqtlCaptureHost] SCENE IDENTITY MISMATCH: the hosted page recorded ' +
                'scene ' + JSON.stringify(env.track.scene) + ' but this process computed ' +
                JSON.stringify(expectedSceneId) + ' for the same scene. The recording is REFUSED ' +
                'rather than filed against the wrong header. (FAIL-LOUD.)');
        }
        return env;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    var FrqtlCaptureHost = {
        CAPTURE_HOST_KIND:    CAPTURE_HOST_KIND,
        assertCaptureHost:    assertCaptureHost,
        IN_PAGE_CAPTURE:      IN_PAGE_CAPTURE,
        IN_PAGE_RECORD_BEGIN: IN_PAGE_RECORD_BEGIN,
        IN_PAGE_RECORD_END:   IN_PAGE_RECORD_END,
        IN_PAGE_RECORD_ABORT: IN_PAGE_RECORD_ABORT,
        decodeStillEnvelope:  decodeStillEnvelope,
        diffSceneRecords:     diffSceneRecords,
        verifyStill:          verifyStill,
        verifyVideo:          verifyVideo
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FrqtlCaptureHost;
    } else if (typeof window !== 'undefined') {
        window.FrqtlCaptureHost = FrqtlCaptureHost;
    }

})();
