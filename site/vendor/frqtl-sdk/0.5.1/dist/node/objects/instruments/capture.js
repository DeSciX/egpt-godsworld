/* Copyright 2023-2026 by Essam Abadir */

/**
 * capture.js — THE render-pipeline tap MECHANISM, as an INSTRUMENT on the primitive
 * surface (THE_MINIMAL_SIM.md §4; CEO ruling 2026-08-01, home = the primitive surface).
 *
 * `capture(stage)` is the ONE generic read-at-a-named-stage mechanism; `captureStill()` is
 * its last-stage CONVENIENCE; `sceneRecord()` is the run-invariant half of the normalized
 * format. All dispatch, all throw rules and ALL provenance stamping live HERE and nowhere
 * else. Contract text: docs/internal/engine/RENDERER_CONTRACT.md §1a.4 + §10.
 *
 * ── Why this is not on the host ──────────────────────────────────────────────
 *
 * A tap is not an editor concern. This mechanism was resident in `FrqtlApp` (the editor
 * host) purely by history, which made "eyes" a BROWSER privilege: nothing in reading a
 * stage needs a DOM, a page or a canvas — it needs the loop's retained tick, the active
 * provider, the scene identity, and the live render-options bag. Those four are the whole
 * binding, so the instrument constructs in a bare node process with no host at all:
 *
 *   FrqtlCapture.create(loop, providerGetter, identity, renderOptionsGetter)
 *
 *   @param loop                — anything exposing `lastTickData` (the retained TickData).
 *                                `SimLoop` after the §4 split; the `FrqtlApp` host today.
 *                                The instrument NEVER advances the clock: it does not call
 *                                `step()`/`doTick()`, so a tap can never perturb tick order.
 *   @param providerGetter      — `() => RendererProvider|null`. The ONE renderer authority,
 *                                read live (a provider that resolves later is picked up on
 *                                the next capture). `null` is a legitimate state — the
 *                                `tick` and `field` stages are backend-independent and work
 *                                with no renderer at all.
 *   @param identity            — `{ seed, rect, sourceRef? }`. The seed is FERRIED from the
 *                                party that handed it to the universe (one seed authority,
 *                                never re-derived here); `rect` is read LIVE so a host that
 *                                re-rects its canvas cannot leave a stale scene record.
 *   @param renderOptionsGetter — `() => renderOptionsBag`. The ONE LIVE bag `setRenderOption`
 *                                writes, read THROUGH the getter and never copied — a copy
 *                                here would be a second options authority whose provenance
 *                                silently stopped tracking the picture.
 *
 * ── One stage the local process genuinely cannot execute ─────────────────────
 *
 * `tick` and `field` are backend-independent, so a bare node process taps them with no
 * renderer at all. `composite` is different in kind: it IS the render stack's output, and
 * re-drawing it with a node raster library would show the agent a different picture than
 * the user sees (CEO ruling, V3 — a god-rays shader turns particles into A SUN, and the
 * shader is part of the experiment, not decoration). So `composite` is executed by a
 * CAPTURE HOST — a remote stage executor running the real stack in a managed headless
 * browser — attached via `attachCaptureHost()`. The KIND, its boundary codec and its
 * per-still verification live in the sibling `instruments/capture-host.js`.
 *
 * Two upward VOCABULARY reads (`RenderStages`, `FieldBuilder`) resolve at CALL time through
 * named FAIL-LOUD guards — the same seam every game-layer object uses for a shim/compat
 * contract. They are leaf tables and executors, never machinery, and they are resolved
 * rather than imported so this file adds no arrow.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This is the output boundary reading its own output — no frame, dimension,
 * tick or op-program is touched, so no canonical-bench golden can move because of it.
 *
 * OBSERVATION ONLY. A tap cannot perturb the pipeline. Pipeline CONFIGURATION stays exactly
 * where it already lives — `setFilterActive` / `setRenderOption` —
 * so "capture with the water shader off" composes existing knobs (setFilterActive('water',
 * false) → repaint() → capture → restore) rather than growing a second filter authority on
 * the capture call.
 */

(function () {
    'use strict';

    // ── Contract resolution — upward VOCABULARY reads, at CALL time, FAIL-LOUD ──

    /**
     * Resolve the shim-owned stage vocabulary through a named FAIL-LOUD guard. Never a
     * local stage list — a hand-written copy here is precisely the schema-mirror drift the
     * owner prevents.
     * @private
     */
    function _resolveRenderStages() {
        var RS = (typeof window !== 'undefined' && window.RenderStages) ? window.RenderStages
               : ((typeof RenderStages !== 'undefined') ? RenderStages : null);
        if (!RS) {
            throw new Error('[FrqtlCapture] canonical contract RenderStages ' +
                '(lib/shim/render/render-stages.js) is unreachable — it must load in the ENGINE ' +
                'phase (shim-contract-manifest.js). Fail-loud, not a fallback.');
        }
        return RS;
    }

    /**
     * Resolve the capture-host KIND contract (the sibling instrument), FAIL-LOUD.
     * Reached only when a caller ATTACHES a host, so a process that never hosts never
     * needs the file — the same call-time resolution the two vocabulary reads use.
     * @private
     */
    function _resolveCaptureHost() {
        var CH = (typeof window !== 'undefined' && window.FrqtlCaptureHost) ? window.FrqtlCaptureHost
               : ((typeof FrqtlCaptureHost !== 'undefined') ? FrqtlCaptureHost : null);
        if (!CH && typeof require === 'function') {
            // Node-guarded sibling require — the same seam other game-layer files use for a
            // Node-only dependency (see build.js's "Node subpath" step).
            CH = require('./capture-host.js');
        }
        if (!CH) {
            throw new Error('[FrqtlCapture] the capture-host KIND contract ' +
                '(lib/frqtl/objects/instruments/capture-host.js) is unreachable — it owns the ' +
                'host shape gate, the boundary codec and the scene verification. Fail-loud, ' +
                'not a fallback.');
        }
        return CH;
    }

    /** Resolve the ONE canonical field source, FAIL-LOUD. @private */
    function _resolveFieldBuilder() {
        var FB = (typeof window !== 'undefined' && window.FieldBuilder) ? window.FieldBuilder
               : ((typeof FieldBuilder !== 'undefined') ? FieldBuilder : null);
        if (!FB) {
            throw new Error('[FrqtlCapture] canonical contract FieldBuilder ' +
                '(lib/frqtl/compat/renderer/FieldBuilder.js) is unreachable — the `field` stage ' +
                'tap needs it. Fail-loud, not a fallback.');
        }
        return FB;
    }

    /**
     * The experiment identity the page ALREADY carries, ferried — not a second authority.
     *
     * The experiments registry DEFINES an experiment id as "the directory name under
     * experiments/" (`experimentById`), and a canonical page is served from
     * `…/experiments/<id>/index.html`. So the path segment IS the registry id, and reading it
     * ferries the existing identity rather than minting a parallel one. The registry module
     * itself is ESM and unreachable from this classic script, which is exactly why the id is
     * taken from the URL the registry's own ids are defined by.
     *
     * Fails SOFT to null (no DOM, a notebook realm, an ad-hoc page): `sourceRef: null` is the
     * honest "this scene has no authored identity" value, and the corpus row then carries the
     * code itself. A caller with a better identity overrides via `setSourceRef()`.
     * @private
     */
    function _defaultSourceRef() {
        try {
            if (typeof window === 'undefined' || !window.location) { return null; }
            var m = String(window.location.pathname).match(/\/experiments\/([^/]+)\//);
            return (m && m[1]) ? m[1] : null;
        } catch (e) { return null; }
    }

    /**
     * The RASTER PATH pin — which GL backend this browser actually rasters with.
     *
     * Measured, not assumed (`docs/internal/physics-lab/composite-determinism/`): a
     * `composite` still is bit-reproducible run-to-run WITHIN a pinned (machine, driver,
     * browser build) — under software SwiftShader AND under hardware ANGLE/Metal alike —
     * but the software and hardware pictures differ (0.42% of pixels raw, 1.75% with a
     * bloom pass). Sub-perceptual, and real. So the policy is bit-exact within a path and
     * tolerance across paths, which only works if a row SAYS which path drew it: rows from
     * different raster paths must refuse to mix BY IDENTITY, not by luck.
     *
     * It rides `build` because it is exactly what `build` is for — a runtime pin DERIVED
     * from the environment, never a caller-set flag (a hand-set `software:true` would be
     * the truth-in-labeling violation this field exists to prevent). The value is the
     * browser's own `UNMASKED_RENDERER_WEBGL` string, which separates `SwiftShader driver`
     * from `ANGLE Metal Renderer: Apple M4 Pro` exactly.
     *
     * MEMOIZED per process: it cannot change within a run, and creating a GL context per
     * `sceneRecord()` call would be an absurd cost on a memoized-by-design record. `null`
     * where there is no WebGL to ask (node, or a browser withholding the debug extension) —
     * honestly absent, exactly like the three sibling pins.
     * @private
     */
    var _rasterPathMemo;          // undefined = not yet read (null is a legitimate answer)
    function _rasterPath() {
        if (_rasterPathMemo !== undefined) { return _rasterPathMemo; }
        _rasterPathMemo = null;
        try {
            if (typeof document !== 'undefined' && document.createElement) {
                var c = document.createElement('canvas');
                var gl = c.getContext('webgl2') || c.getContext('webgl');
                var ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
                if (ext) { _rasterPathMemo = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); }
            }
        } catch (e) { _rasterPathMemo = null; }
        return _rasterPathMemo;
    }

    /**
     * The TICK-PROVENANCE GUARD for a raster the provider executes: the stamp is the pixels'
     * tick, or the capture THROWS.
     *
     * `tick` is stamped off the LOOP's retained TickData when the capture is requested; the
     * pixels are whatever the provider LAST composited, read later. The two diverge whenever
     * the clock ticks without a draw — the rAF loop runs a tick batch (listeners included)
     * BEFORE its one render, so a batched frame composites only its last tick, and the first
     * frame's burst composites only the burst's last. A still labelled with a tick its pixels
     * are not is a falsified physics record, so the provider REPORTS the tick it drew
     * (`renderedTick`, §1a.4) and this compares. The dispatcher takes the readback in the
     * stamp's task, so a between-frame caller always agrees; what is left to
     * refuse is a capture from inside a tick batch (or a genuinely asynchronous BYO
     * readback). There is no reconciling branch: the remedy is the caller's clock
     * discipline, named in the message.
     * @private
     */
    function _assertComposited(stage, tick, bag) {
        var rendered = bag.renderedTick;
        if (!(typeof rendered === 'number' && isFinite(rendered))) {
            throw new Error('[FrqtlCapture.capture] the provider\'s captureStill() bag reports ' +
                'no renderedTick (got ' + String(rendered) + ') — the tick of the TickData its ' +
                'pixels were drawn from is REQUIRED (RENDERER_CONTRACT §1a.4), because without ' +
                'it a still stamped tick ' + tick + ' cannot be shown to carry tick ' + tick +
                '\'s picture. (FAIL-LOUD.)');
        }
        if (rendered !== tick) {
            throw new Error('[FrqtlCapture.capture] PROVENANCE MISMATCH at stage \'' + stage +
                '\': the still would be stamped tick ' + tick + ' (the loop\'s retained TickData) ' +
                'but the provider composited tick ' + rendered + ' — these pixels are not tick ' +
                tick + '\'s. Capture a tick that was RENDERED: drive the clock with runner.step() ' +
                '(it renders, then notifies), or HOLD it from a tick listener — ' +
                'runner.suspendTicks(), runner.repaint() (forces the draw; an fps cap skips ' +
                'display frames), capture, runner.resumeTicks() in the capture\'s finally; ' +
                'outside a listener, runner.repaint() then capture in the same task. ' +
                '(FAIL-LOUD — a still whose label is not its pixels is a falsified record.)');
        }
    }

    // ── The instrument ────────────────────────────────────────────────────────

    /**
     * @param {{lastTickData: object}} loop
     * @param {function(): object|null} providerGetter
     * @param {{seed: *, rect: object, sourceRef: (string|null|undefined)}} identity
     * @param {function(): object} renderOptionsGetter
     */
    function CaptureInstrument(loop, providerGetter, identity, renderOptionsGetter) {
        if (!loop || typeof loop !== 'object') {
            throw new Error('[FrqtlCapture.create] argument 1 must be the LOOP — anything ' +
                'exposing `lastTickData` (SimLoop / the FrqtlApp host). (FAIL-LOUD.)');
        }
        if (typeof providerGetter !== 'function') {
            throw new Error('[FrqtlCapture.create] argument 2 must be a providerGetter ' +
                'function returning the active RendererProvider or null — the provider is read ' +
                'LIVE, never captured at bind time. (FAIL-LOUD.)');
        }
        if (!identity || typeof identity !== 'object' || identity.seed === undefined || !identity.rect) {
            throw new Error('[FrqtlCapture.create] argument 3 must be the identity bag ' +
                '{ seed, rect, sourceRef? } — `seed` is FERRIED from the party that handed it to ' +
                'the universe and `rect` is the physics canvas. (FAIL-LOUD.)');
        }
        if (typeof renderOptionsGetter !== 'function') {
            throw new Error('[FrqtlCapture.create] argument 4 must be a renderOptionsGetter ' +
                'function returning the ONE LIVE render-options bag — read through the getter, ' +
                'never copied (a copy is a second options authority). (FAIL-LOUD.)');
        }
        this._loop           = loop;
        this._providerGetter = providerGetter;
        this._identity       = identity;
        this._renderOptionsGetter = renderOptionsGetter;
        // Experiment/rung identity for a SceneRecord, registered ONCE at setup by the page or
        // harness via setSourceRef(). null is HONEST (an ad-hoc universe); the corpus row then
        // carries the code itself. Never per-capture caller-supplied provenance.
        this._sourceRef = (identity.sourceRef === undefined || identity.sourceRef === null)
            ? _defaultSourceRef() : String(identity.sourceRef);
        // Memo for the content-addressed SceneRecord — see sceneRecord().
        this._sceneMemo = null;
        // The attached CAPTURE HOST (the remote stage-executor KIND), or null. See
        // attachCaptureHost() and instruments/capture-host.js.
        this._host = null;
    }

    /**
     * attachCaptureHost(host) — attach a REMOTE stage executor (the capture-host KIND).
     *
     * The KIND, its boundary codec and its verification live in the sibling
     * `instruments/capture-host.js`; this method is the seam that lets a stage the LOCAL
     * process cannot execute be executed elsewhere without a second dispatcher. The
     * canonical implementation is the hosted headless browser (`instruments/hosted-eyes.js`)
     * that runs the REAL render stack, so `capture('composite')` works from node through the
     * real renderer and its shaders, drawing the scene source plus the renderState it was handed.
     *
     * ATTACHING EXTENDS THIS INSTRUMENT'S IDENTITY (a.3): from here on `_buildIdentity()`
     * and `_projection()` report the HOST'S page-resolved values, so the scene identity this
     * process computes and the one the page stamps are equal by construction rather than by
     * a comparison someone later loosens.
     *
     * FAIL-LOUD when the live provider already executes a stage the host claims: two
     * executors for one stage is two truths about one picture, and the honest moment to say
     * so is attach time, not the first mismatch.
     *
     * @param {object} host — see instruments/capture-host.js for the KIND
     * @returns {object} the same host
     */
    CaptureInstrument.prototype.attachCaptureHost = function (host) {
        var CH = _resolveCaptureHost();
        CH.assertCaptureHost(host);
        var prov = this._provider();
        if (prov && typeof prov.captureStill === 'function' && host.stages.indexOf('composite') !== -1) {
            throw new Error('[FrqtlCapture.attachCaptureHost] this instrument already has a ' +
                'display provider that implements captureStill(), so the `composite` stage is ' +
                'already executed locally. A capture host is for a stage this process CANNOT ' +
                'execute; attaching one here would mint a second executor — two truths about ' +
                'one picture. (FAIL-LOUD.)');
        }
        this._host = host;
        // The identity just changed (build/projection now come from the page), so the memo
        // computed under the old identity must not survive — a stale memo here would hand
        // out the pre-attachment hash and every verification would fail for the right
        // reason with the wrong explanation.
        this._sceneMemo = null;
        return host;
    };

    /**
     * captureHost() — the attached capture host, or null when this instrument executes its
     * stages locally. `FrqtlVision.record` reads it to forward a recording to the process
     * where the world and its clock are (the host's `record` member).
     * @returns {object|null}
     */
    CaptureInstrument.prototype.captureHost = function () {
        return this._host;
    };

    /** The live provider, or null. @private */
    CaptureInstrument.prototype._provider = function () {
        return this._providerGetter() || null;
    };

    /**
     * setSourceRef(ref) — register the experiment/rung identity for the SceneRecord.
     *
     * Called ONCE at setup by the page or harness (a legitimate authority set at attach
     * time), NEVER per capture — a per-capture identity would be caller-supplied provenance,
     * the hardcoded-label anti-pattern. Absent ⇒ `sourceRef: null`, which is honest for an
     * ad-hoc universe: such a scene is REPLAY-grade, not REGENERATE-grade, and the corpus row
     * must carry the code itself.
     * @param {string|null} ref
     */
    CaptureInstrument.prototype.setSourceRef = function (ref) {
        this._sourceRef = (ref === undefined || ref === null) ? null : String(ref);
    };

    /**
     * The runtime BUILD pin, DERIVED from the boot authorities — never a literal.
     *
     * Pixel-exact regeneration pins the builds, not just the code+seed. What is genuinely
     * derivable at runtime today is the boot identity: the engine axis engine-boot selected
     * (`window._egptEngine`), the renderer render-boot selected (`window._egptRenderer`), and
     * the CONTENT hash of the wasm binary the browser loader instantiated
     * (`window._WasmLoadBrowser.loadedWasmSha256()`, the `PINNED.json` `wasmSha256`
     * definition). Never the package URL: the serving origin is a deployment fact, so the same
     * bytes from two hosts must regenerate ONE scene identity. Each is `null` when the
     * authority is absent (a headless harness) — honestly absent, never invented; a hand-typed
     * version string here would be the truth-in-labeling violation (dep-map rule 4) that this
     * method exists to avoid.
     * @private
     */
    CaptureInstrument.prototype._buildIdentity = function () {
        // A capture host is attached ⇒ the picture is produced in the PAGE, so the page's
        // build pin is the truthful one (a.3 identity convergence — see attachCaptureHost).
        if (this._host) { return this._host.identity().build || null; }
        var w = (typeof window !== 'undefined') ? window : null;
        return {
            engine:     (w && w._egptEngine)      ? String(w._egptEngine)      : null,
            renderer:   (w && w._egptRenderer)    ? String(w._egptRenderer)    : null,
            wasmSha256: (w && w._WasmLoadBrowser) ? w._WasmLoadBrowser.loadedWasmSha256() : null,
            gl:         _rasterPath()
        };
    };

    /**
     * The camera intrinsics for the scene, from the provider's OPTIONAL `projection()`.
     *
     * Without them a 3D pixel→world mapping is UNDERDETERMINED offline: an offline corpus
     * consumer has no live `screenToWorld`, and the pose bag plus buffer dims are not enough
     * for a perspective camera. `null` when the provider does not declare the capability (a
     * BYO renderer) — honest, and `unprojectStill` then FAILS LOUD at use rather than
     * computing a wrong point.
     * @private
     */
    CaptureInstrument.prototype._projection = function () {
        // Hosted: the camera that made the picture is the PAGE's, so its intrinsics are the
        // only ones that describe this still's pixel→world map (a.3).
        if (this._host) {
            var ident = this._host.identity();
            return (ident && ident.projection) ? ident.projection : null;
        }
        var prov = this._provider();
        if (!prov || typeof prov.projection !== 'function') { return null; }
        return prov.projection();
    };

    /**
     * The ONE camera authority, read (never re-derived) — through the PROVIDER capability,
     * which is where the camera handle actually lives. The host's `runner.cameraControl`
     * memo is the same handle wearing a host-facing convenience; reading it back up through
     * the host would be an upward coupling for no extra truth. `null` when the active
     * provider exposes no camera pose control at all (a BYO renderer): without a pose a 3D
     * composite cannot be co-registered to the field, and for VLA data the pose is
     * load-bearing, so absent-and-honest is the only alternative to wrong.
     * @private
     */
    CaptureInstrument.prototype._pose = function () {
        var prov = this._provider();
        if (!prov || typeof prov.getCameraControl !== 'function') { return null; }
        var cam = prov.getCameraControl();       // null in a provider with no pose control
        return cam ? cam.getOrbit() : null;
    };

    /**
     * sceneRecord() → Promise<SceneRecord + its own content id>
     *
     * The RUN-INVARIANT half of the normalized format: the regeneration input
     * (`seed`, `sourceRef`, `build`, `physicsW/H`, `projection`), IMMUTABLE and
     * CONTENT-ADDRESSED as `scene = sha256(canonicalize(record))`. A corpus stores ONE of
     * these plus N light stills that reference it by hash, instead of repeating a
     * high-bandwidth header on every capture.
     *
     * SELF-INVALIDATING BY CONSTRUCTION: the record is rebuilt from the live authorities on
     * every call (seven field reads) and re-hashed ONLY when its canonical form actually
     * changes. So there is no `invalidateScene()` to forget to call, and a record is never
     * stale. Scene records being immutable, a change mints a NEW identity rather than
     * revising one — under content-addressing those are the same operation.
     *
     * The returned object carries its own `scene` id alongside the record for convenience;
     * `canonicalizeScene` PROJECTS onto `SCENE_KEYS`, so that id cannot perturb its own hash.
     *
     * @returns {Promise<object>} the record plus `scene`
     * @throws {Error} (as a rejection) if the seed authority is unreachable, or
     *   `crypto.subtle` is unavailable — never a silently unidentified scene.
     */
    CaptureInstrument.prototype.sceneRecord = function () {
        var RS = _resolveRenderStages();
        var self = this;
        var record;
        try {
            var rect = this._identity.rect;
            record = RS.normalizeScene({
                seed:       this._identity.seed,
                sourceRef:  this._sourceRef,
                build:      this._buildIdentity(),
                physicsW:   rect.w,
                physicsH:   rect.h,
                projection: this._projection()
            });
        } catch (e) { return Promise.reject(e); }
        var canon = RS.canonicalizeScene(record);
        if (this._sceneMemo && this._sceneMemo.canon === canon) {
            // COPY, never the memo object itself. Handing out `_sceneMemo.value` made every
            // caller share ONE mutable record that IS internal instrument state: a single
            // careless consumer (`scene.build.engine = ...`) corrupted the record for every
            // later caller AND changed its canonical form, so the hash silently stopped
            // verifying against stills already written. That is the R8 aliasing class landing
            // on the one record the regenerate-not-replay claim depends on. The memo stays —
            // it exists to avoid re-hashing, not to share an object.
            return Promise.resolve(RS.deepPlainCopy(this._sceneMemo.value));
        }
        return RS.sceneHash(record).then(function (id) {
            var value = Object.assign({}, record, { scene: id });
            self._sceneMemo = { canon: canon, value: value };
            // COPY ON THE WAY OUT — see the memo-hit path above for why.
            return RS.deepPlainCopy(value);
        });
    };

    /**
     * The tick index the channel derives from — the co-registration key.
     *
     * Stamped by the INSTRUMENT off the loop's retained TickData because the loop is the only
     * party that knows the tick: a caller capturing several stages between ticks asserts
     * EQUAL `tick` stamps to prove the channels are aligned, and a caller-supplied tick would
     * make that assertion vacuous.
     * @private
     */
    CaptureInstrument.prototype._tickIndex = function (tickData) {
        var t = tickData && tickData.universeData && tickData.universeData.tick;
        if (typeof t === 'number' && isFinite(t)) { return t; }
        throw new Error('[FrqtlCapture.capture] the live TickData carries no ' +
            'universeData.tick — the tick stamp is what co-registers a multi-channel capture, ' +
            'so it is never defaulted or omitted. (FAIL-LOUD.)');
    };

    /**
     * The capability descriptors the ACTIVE PROVIDER declares — the provider is the
     * capability authority (`renderCapabilities()` is its OPTIONAL contract method), and the
     * host's `runner.renderCapabilities()` is the host-facing read of that SAME authority.
     * A provider that predates the contract addition, or no provider at all, yields `[]` —
     * never an error (the `cameraControl` capability-check precedent).
     * @private
     */
    CaptureInstrument.prototype._renderCapabilities = function () {
        var prov = this._provider();
        if (!prov || typeof prov.renderCapabilities !== 'function') { return []; }
        return prov.renderCapabilities();
    };

    /**
     * The live values of the keys the active provider DECLARES via `renderCapabilities()`.
     *
     * DRIVEN OFF the declared descriptor list, so a newly declared R4/R5 knob shows up in
     * capture provenance with zero edits here — a hand-typed key list would be the
     * schema-mirror bug. The VALUES come from the ONE live options bag, read through the
     * bound getter (never copied). `filter.*` capability keys are deliberately EXCLUDED:
     * their authority is the provider-stamped, ORDERED `filtersApplied`, and reading them
     * here as well would create a second (unordered, BYO-blind) filter truth.
     * @private
     */
    CaptureInstrument.prototype._captureRenderOptions = function () {
        var caps = this._renderCapabilities();
        var live = this._renderOptionsGetter() || {};
        var out = {};
        for (var i = 0; i < caps.length; i++) {
            var name = caps[i].name;
            if (!name || name.indexOf('filter.') === 0) { continue; }
            out[name] = (live[name] !== undefined) ? live[name] : caps[i].default;
        }
        return out;
    };

    /**
     * capture(stage) — THE generic render-pipeline tap (the mechanism).
     *
     * Reads the data at a NAMED stage of the render pipeline and returns a provenance-
     * stamped bag. `stage` is REQUIRED: a default belongs to a convenience, not to the
     * mechanism (see `captureStill()` below).
     *
     * @param {string} stage — a member of `RenderStages.RENDER_STAGES`
     *   (`'tick' | 'field' | 'scene' | 'composite'`).
     * @returns {Promise<object>} a bag carrying every `RenderStages.STILL_BAG_KEYS` key:
     *   the `data` payload (Array of FrameData / `Uint8Array` / `Uint8ClampedArray` — the
     *   NUMBERS are first class, an image is something a consumer derives) plus the
     *   provenance that makes a pre-render tap distinguishable from a post-bloom one
     *   (`stage`, `tick`, `format`, `filtersApplied`, `renderBaseCanvas`, `pose`,
     *   `composedOf`, `renderOptions`). Async for all stages by contract: a WebGPU
     *   backend's only readback is `mapAsync`, so a sync signature would structurally
     *   exclude WebGPU BYO renderers forever. The shipped stages resolve immediately.
     *
     * @throws {Error} unknown/absent stage (message lists the whole table); no tick has
     *   run yet (never an empty buffer); a stage that is a real pipeline point but has no
     *   tap executor (`'scene'` in v1 — a DISTINCT error from unknown-stage); `'composite'`
     *   on a provider that does not implement the OPTIONAL `captureStill()`. Absence of a
     *   CAPABILITY hides a host affordance (a UI capability-checks and shows no button);
     *   a PROGRAMMATIC capture never degrades to `null` — a measurement or a golden built
     *   on a silently-blank capture is fabricated evidence.
     */
    CaptureInstrument.prototype.capture = function (stage) {
        // A Promise-returning method must NEVER throw synchronously: a mixed error channel
        // (sync throw for a bad argument, rejection for a bad readback) guarantees an
        // uncaught exception at some call site that only wrote `.catch()`. Every failure
        // below therefore arrives as a REJECTION, with the identical message. This wrapper
        // exists in exactly ONE place — a host that forwards to `capture()` must not add a
        // second try/catch of its own.
        try { return this._captureDispatch(stage); }
        catch (e) { return Promise.reject(e); }
    };

    /** @private — the dispatch body; see `capture` for the contract. */
    CaptureInstrument.prototype._captureDispatch = function (stage) {
        var RS = _resolveRenderStages();
        RS.assertStage(stage);

        // ── HOSTED: a REMOTE executor owns this stage ────────────────────────
        // Checked before every local precondition, because none of them apply: the world,
        // the clock, the canvas and the camera are all in the other process. The local side
        // computes the scene identity, asks, and VERIFIES — it never stamps. (Deliberately
        // NOT a provider branch: see instruments/capture-host.js for why a provider-shaped
        // adapter would have had to invent the provenance it does not hold.)
        if (this._host && this._host.stages.indexOf(stage) !== -1) {
            var CH = _resolveCaptureHost();
            var host = this._host;
            return this.sceneRecord().then(function (scene) {
                return Promise.resolve(host.capture(stage)).then(function (still) {
                    return CH.verifyStill(scene.scene, stage, still);
                });
            });
        }

        var td = this._loop.lastTickData;
        if (!td) {
            throw new Error('[FrqtlCapture.capture] no tick has run yet (the loop has ' +
                'retained no TickData), so there is no channel to read. Run start()/step() ' +
                'first. (FAIL-LOUD — never an empty buffer.)');
        }
        // Reject a non-tappable stage BEFORE doing any work — the diagnosis should not wait
        // on a hash. ('scene' is a real pipeline point with no executor in v1.)
        var prov = this._provider();
        if (stage === 'scene') {
            throw RS.stageNotTappableError(stage, 'the active renderer provider');
        }
        if (stage === 'composite' && (!prov || typeof prov.captureStill !== 'function')) {
            throw RS.stageNotTappableError(stage, 'the active renderer provider ' +
                '(it does not implement the OPTIONAL captureStill() capability), and no capture ' +
                'host is attached. In a process with no display renderer — a node rig — the ' +
                'composed picture is produced by the HOSTED headless stack, which runs the real ' +
                'renderer and its shaders: openHostedEyes({sceneRecord, sceneSource, pageUrl}) ' +
                'from @descix/frqtl-sdk/eyes (lib/frqtl/objects/instruments/hosted-eyes.js)');
        }

        // ONE TASK: the tick is stamped now; a raster readback runs in THIS task's microtask
        // checkpoint, queued before anything is awaited. Both halves of that are load-bearing:
        //  - never AFTER the scene hash: sceneRecord() is a real task boundary whenever it
        //    hashes (the first capture of a scene, and after every scene change), and a running
        //    loop can tick and redraw inside it — the readback would carry a later tick's
        //    pixels for a caller that did everything right;
        //  - never INSIDE the synchronous call: the rAF loop notifies tick listeners BEFORE the
        //    frame's draw in the same task, so a draw of tick t that follows the request in
        //    this task (the frame's own) must be what the readback sees.
        // The raster's LABELS (pose, renderOptions) are read in the readback's own synchronous run,
        // right beside captureStill(): a listener registered after the requester (CameraPath's
        // setOrbit, a knob write) can change them later in this task, and the pixels are drawn
        // under the later values — nothing can draw between these reads and the readback.
        // Selected by FORMAT off the stage table, not by stage name: every rgba8 stage is a
        // provider-executed raster and inherits the readback timing, the label timing and the guard.
        var self = this;
        var tick = this._tickIndex(td);
        var labels = { pose: null, renderOptions: null };
        var readback = null;
        if (RS.STAGE_FORMATS[stage] === 'rgba8') {
            readback = Promise.resolve().then(function () {
                labels.pose = self._pose();
                labels.renderOptions = self._captureRenderOptions();
                return prov.captureStill();
            });
        } else {
            // No readback: the channel IS the retained TickData, so the stamp-time labels are the
            // ones it is read under.
            labels.pose = this._pose();
            labels.renderOptions = this._captureRenderOptions();
        }
        // The still records COORDINATES WITHIN a scene, so it needs the scene's content id.
        // sceneRecord() is memoized on the canonical form, so this is a hash only when the
        // scene actually changed. Joined with the readback so neither rejection goes unhandled.
        return Promise.all([this.sceneRecord(), readback]).then(function (joined) {
            var scene = joined[0];
            var base = {
                scene:         scene.scene,
                stage:         stage,
                tick:          tick,
                pose:          labels.pose,
                renderOptions: labels.renderOptions
            };

            if (stage === 'tick') {
                // Stage 0 — the frame-data bubble itself. `width`/`height` are the physics
                // canvas the rect coordinates live in (a framedata payload is not a raster).
                // The payload SHAPE is the frame-data bubble's own published contract
                // (`FrameDataSchema` is its owner) — pointed AT here, never restated.
                return RS.normalizeStill(Object.assign({}, base, {
                    data:             td.frameData,
                    width:            scene.physicsW,
                    height:           scene.physicsH,
                    filtersApplied:   [],     // pre-render by definition
                    renderBaseCanvas: null    // nothing composited on this channel
                }));
            }

            if (stage === 'field') {
                // The render-free numeric channel: the ONE canonical field source over the
                // retained TickData. Instrument-side ON PURPOSE — the field stage is
                // backend-independent by construction, so putting it on the provider contract
                // would force every BYO renderer to re-ship a stage it does not own. Every
                // BYO provider gets this tap for free, and a headless process gets it with no
                // renderer at all.
                var FB = _resolveFieldBuilder();
                var fopts = Object.assign({}, FB.FIELD_OPTS, {
                    canvasW: scene.physicsW, canvasH: scene.physicsH
                });
                return RS.normalizeStill(Object.assign({}, base, {
                    data:             FB.buildHeightField(td.frameData, fopts),
                    width:            fopts.w,
                    height:           fopts.h,
                    // The r8 channel is a dimensionless INSTRUMENT RESPONSE (gain-scaled,
                    // clamped, optionally blurred soft-splat fullness density), comparable
                    // only at equal options — so the options ride the record. Two field
                    // captures at different gain would otherwise be indistinguishable.
                    fieldOpts:        fopts,
                    filtersApplied:   [],
                    renderBaseCanvas: null
                }));
            }

            // rgba8 ('composite') — the provider returns the §1a.4 render-domain bag (pixels + the
            // fields it alone is the authority for). The instrument normalizes ONCE through
            // the vocabulary owner: `pixels` becomes the stage-agnostic `data` payload and
            // the dispatcher's provenance is merged in. Providers never import the shim — a
            // BYO renderer's whole capture burden stays ONE method. The bag was read in the
            // stamp's task above.
            var bag = joined[1];
            if (!bag) {
                throw new Error('[FrqtlCapture.capture] the provider\'s captureStill() ' +
                    'resolved with nothing. (FAIL-LOUD — never a null still.)');
            }
            _assertComposited(stage, tick, bag);
            return RS.normalizeStill(Object.assign({}, base, {
                data:             bag.pixels,
                width:            bag.width,
                height:           bag.height,
                cssWidth:         bag.cssWidth,
                cssHeight:        bag.cssHeight,
                filtersApplied:   bag.filtersApplied,
                renderBaseCanvas: bag.renderBaseCanvas,
                filterTime:       bag.filterTime
            }));
        });
    };

    /**
     * captureStill() — the LAST-STAGE CONVENIENCE. Capturing the canvas is capturing the
     * fully composed stack of transforms (CEO-ratified 2026-07-29).
     *
     * PURE DELEGATION: it contains no capture logic, no provider call and no provenance
     * stamping of its own — it resolves the final stage name and calls the mechanism. The
     * `setPreset`-over-`setOrbit` shape (a full framing reset that still goes through the
     * one primitive). A convenience that duplicated its own primitive would be the second
     * path that later disagrees, so the conformance gate asserts `captureStill()` and
     * `capture(<last stage>)` return identically-shaped, identically-provenanced bags.
     *
     * The final stage is DERIVED from the exported table, never a hardcoded 'composite'
     * literal: if the pipeline ever grows a later stage, this convenience follows it by
     * construction (truth-in-labeling at the API level — an API that says "still of the
     * whole stack" must not name a stage that has stopped being last). The returned bag
     * carries FULL provenance, including `composedOf` (the ordered upstream stages) and
     * `renderOptions` — "final" alone would be a label, not a statement of what produced
     * the picture.
     *
     * @returns {Promise<object>} see `capture(stage)`.
     */
    CaptureInstrument.prototype.captureStill = function () {
        return this.capture(_resolveRenderStages().finalStage());
    };

    // ── Export ────────────────────────────────────────────────────────────────

    /**
     * create(loop, providerGetter, identity, renderOptionsGetter) → the instrument.
     * The ONE construction path (a bare `new CaptureInstrument` is not exported).
     */
    function create(loop, providerGetter, identity, renderOptionsGetter) {
        return new CaptureInstrument(loop, providerGetter, identity, renderOptionsGetter);
    }

    var FrqtlCapture = { create: create };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FrqtlCapture;
    } else if (typeof window !== 'undefined') {
        window.FrqtlCapture = FrqtlCapture;
    }

})();
