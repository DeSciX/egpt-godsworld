/* Copyright 2023-2026 by Essam Abadir */

/**
 * hosted-eyes.js — THE CAPTURE HOST: the eyes see through the SAME stack the user sees.
 *
 * The V3 implementation of the capture-host KIND (`instruments/capture-host.js`): it boots
 * the canonical experiment page in a managed headless browser, regenerates the scene from
 * its `{sceneRecord, sceneSource}` pair, drives the clock to an exact tick, points the one
 * camera, and captures IN-PAGE through the same `FrqtlCapture` surface a browser user has.
 * `composite` therefore works from node, through the real renderer and its shaders.
 *
 * What it draws is the SOURCE plus the renderState it is handed — nothing else. A walk-through
 * rung's LOOK (render rows, filters, camera) lives on its registry row, not in its sketch, so
 * the sketch alone records the PLAIN render: pass the rung's `effectiveRenderState(rung, mode)`
 * as `renderState` to record it as the GYM shows it. The contract is
 * SOURCE + declared renderState → PAGE resolves → PROVENANCE reports.
 *
 * **The browser is the ENGINE ROOM, never the interface.** Nothing above this file mentions
 * a page, a selector or a screenshot: a consumer opens a handle, drives it, and reads the
 * same normalized still bags `FrqtlVision` hands out everywhere else. That is the whole
 * point of the ruling that produced this file — a raster backend that RE-DREW the scene in
 * node would have shown the agent a different picture than the end user sees, which defeats
 * the purpose (a god-rays shader turns a bunch of particles into A SUN, and the shader is
 * part of the experiment, not decoration).
 *
 * ── Everything here CONSUMES an existing authority. There is no new machinery. ──
 *
 *   the page        `lib/frqtl/experiments/empty/index.html` + `FrqtlPage.applyModuleSource` —
 *                   the same blank load-by-eval target STUDIO's saved projects and the
 *                   public site's hero already boot. NEVER the IDE page (a driver that
 *                   hunts an iframe and clicks chrome by label is a harness, not a library)
 *                   and never a bespoke HTML harness (that would be a boot-manifest schema
 *                   mirror plus a second serving context).
 *   the URL keys    `lib/shim/page-params` — `seed` (the record's, half the regeneration
 *                   triple) and `renderer` (the declared renderState's display on the first
 *                   boot, or the SCENE's own required display on a reload — never a record
 *                   field), each CHECKED against its own `FORWARDABLE_PARAMS` list
 *                   before it is set. (`engine` is deliberately absent: the contract
 *                   declares it non-forwardable, because the host's own engine selector is
 *                   the sole authority for that axis.)
 *   the clock       `lib/shim/notebook/warmup.js` `warmUpRealm` — one AWAITED `step()` per
 *                   tick over a control-plane handle, which is exactly what this boundary
 *                   is. It is transport-agnostic by design: the handle below is
 *                   driven over page-evaluate, a consumer, not a fork. A wall-clock "wait for ~N frames at 60fps" poll —
 *                   the old capture-script shape — is BOTH incorrect (it lands on whatever
 *                   tick the render loop reached) and slower, because its minutes are spent
 *                   watching a render loop rather than computing.
 *   the look        `FrqtlPage.applyRenderState` — the page's door to the ONE renderState
 *                   procedure (`lib/shim/render-state/apply.js` `RenderState.apply`: rows,
 *                   camera, backdrop), called in-page after the scene is applied and before
 *                   the establishing step. This file restates none of it; it only refuses
 *                   what a hosted eye cannot accept (a RETAINED row or preset — see `open`).
 *   the pose        `runner.cameraControl` — the ONE camera authority, set and read back
 *                   in-page. This file re-derives no orbit geometry.
 *   the format      the page's own `capture(stage)` dispatcher stamps every field; the
 *                   KIND's codec ferries the bag; this file adds NO provenance.
 *
 * ── The REGENERATE gate (a.4) ────────────────────────────────────────────────
 *
 * A SceneRecord alone cannot open a host: it is identity plus reproduction pins, with no
 * scene spec in it. So the API takes the PAIR — record + `{kind:'module', source}`, the
 * `buildExperiment(exp)` module `designToModule` emits. A caller without one is REPLAY-grade
 * (an ad-hoc tick-fn scene, a live-edited scene, a bare raster row) and is REFUSED in
 * RENDERER_CONTRACT §10.3's own vocabulary: there is nothing to regenerate FROM, and a
 * silently approximate re-run is the one failure a content-addressed corpus cannot detect
 * after the fact.
 *
 * ── The raster path is RECORDED, never assumed ───────────────────────────────
 *
 * The default launch flags select HARDWARE GL, per the measured policy
 * (`docs/internal/physics-lab/composite-determinism/`): hardware is bit-reproducible on a
 * pinned machine/driver/build, so a software default would trade V3's premise for a
 * property we measured we already have. But the flags are a REQUEST — headless chromium
 * silently falls back to SwiftShader, which is how a naive rig measures the software path
 * without announcing it. What makes the policy safe is not the flags: every still's
 * `build.gl` carries the browser's OWN `UNMASKED_RENDERER_WEBGL` answer, so rows from
 * different raster paths refuse to mix by identity whatever was asked for.
 *
 * ── Lifecycle ────────────────────────────────────────────────────────────────
 *
 * ONE managed browser per handle, closed by `dispose()`, which is symmetric with `open()`
 * and idempotent. Every entry point after disposal FAILS LOUD rather than resurrecting a
 * browser silently. `open()` cleans up its own partial acquisition if boot fails — a
 * half-opened handle that leaked a browser process would poison the zero-orphans gate for
 * every later run in the same shell.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics, and NO second clock: this file never calls `doTick()`, and its only tick
 * driver is the page's own `step()`, awaited one tick at a time through the existing
 * warm-up authority.
 *
 * @example <caption>The library call. Published consumers reach the SAME open() through the
 *   sdk's "./eyes" entry, which supplies the packaged browser and adds nothing else.</caption>
 *   const HostedEyes = require('./instruments/hosted-eyes.js');
 *   const eyes = await HostedEyes.open({
 *       // No display fields: the SOURCE declares what kind of scene it is, the PAGE
 *       // resolves the display it needs, and `build`/`projection` REPORT what happened.
 *       sceneRecord: { seed: 42, sourceRef: 'walkthrough:r7-3d', physicsW: 600, physicsH: 400 },
 *       sceneSource: { kind: 'module', source: rungSource },
 *       pageUrl: 'http://localhost:5534/frqtl/experiments/empty/index.html',
 *       browserType: chromium
 *   });
 *   try {
 *       await eyes.driveToTick(300);
 *       // A pose set AFTER open overrides the camera a `renderState` declared: the bag is the
 *       // rung's declared view, a pose is a still coordinate.
 *       await eyes.setPose({ azimuth: 35, elevation: -15, distance: 420, target: [420, 200, 0] });
 *       const still = await eyes.vision.getStill('composite');   // the SAME normalized bag
 *       eyes.saveStill(still, 'out.png');                        // …and the picture, in one line
 *   } finally { await eyes.dispose(); }
 */

(function () {
    'use strict';

    var path = (typeof require === 'function') ? require('path') : null;
    var url  = (typeof require === 'function') ? require('url')  : null;

    /**
     * Resolve a sibling/upward CJS contract with a named FAIL-LOUD guard. `load` is a thunk
     * holding a literal `require(...)`, so the static require-closure gate over the node dist
     * sees every contract this instrument claims; the MODULE_NOT_FOUND message names the path.
     * @private
     */
    function _req(load, what) {
        if (typeof require !== 'function') {
            throw new Error('[FrqtlHostedEyes] this instrument is NODE-ONLY: it drives a ' +
                'headless browser. In a browser you already have the display renderer — ' +
                'capture through it directly. (FAIL-LOUD.)');
        }
        try { return load(); }
        catch (e) {
            throw new Error('[FrqtlHostedEyes] canonical contract ' + what +
                ' is unreachable: ' + (e && e.message) + '. Fail-loud, not a fallback.');
        }
    }

    var FrqtlCapture     = null;
    var FrqtlCaptureHost = null;
    var PageParams       = null;
    var RenderState      = null;
    function _contracts() {
        if (!FrqtlCapture) {
            FrqtlCapture     = _req(function () { return require('./capture.js'); }, 'the tap MECHANISM');
            FrqtlCaptureHost = _req(function () { return require('./capture-host.js'); }, 'the capture-host KIND');
            // 3-up from objects/instruments/ lands at lib/ (shim is a SIBLING of frqtl) —
            // the same relative math every Node-guarded game-layer require uses, and the
            // same depth the sdk build mirrors under dist/.
            PageParams = _req(function () {
                return require(path.resolve(__dirname, '..', '..', '..', 'shim', 'page-params', 'index.js'));
            }, 'the page-param vocabulary');
            RenderState = _req(function () {
                return require(path.resolve(__dirname, '..', '..', '..', 'shim', 'render-state', 'apply.js'));
            }, 'the renderState owner');
        }
        return { RS: _resolveRenderStages(), CH: FrqtlCaptureHost, PP: PageParams, RST: RenderState };
    }

    /** The shim-owned stage vocabulary, ferried (never re-listed). @private */
    function _resolveRenderStages() {
        var RS = (typeof globalThis !== 'undefined' && globalThis.RenderStages)
            ? globalThis.RenderStages : null;
        if (!RS) {
            RS = _req(function () {
                return require(path.resolve(__dirname, '..', '..', '..', 'shim', 'render', 'render-stages.js'));
            }, 'RenderStages');
            globalThis.RenderStages = RS;      // the node BOOT seam the core barrel uses
        }
        return RS;
    }

    /** `warmUpRealm` is ESM; a dynamic import is how CJS consumes it. @private */
    function _warmup() {
        var p = path.resolve(__dirname, '..', '..', '..', 'shim', 'notebook', 'warmup.js');
        return import(url.pathToFileURL(p).href);
    }

    /**
     * The DEFAULT raster-path request: hardware GL, per the measured policy. `--use-angle`
     * names the platform's own backend only where the measurement was taken; elsewhere ANGLE
     * picks its default. Overridable wholesale via `launchArgs` (a BYO browser stack is
     * sanctioned — what is NOT optional is that the result is recorded, which `build.gl`
     * does regardless of what was asked for).
     * @private
     */
    function _defaultLaunchArgs() {
        var args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle'];
        if (typeof process !== 'undefined' && process.platform === 'darwin') {
            args.push('--use-angle=metal');
        }
        return args;
    }

    // ── The REGENERATE gate ───────────────────────────────────────────────────

    /**
     * assertHostable({sceneRecord, sceneSource}) — throw-or-return, in §10.3's vocabulary.
     * @private
     */
    function _assertHostable(opts) {
        var src = opts.sceneSource;
        if (!opts.sceneRecord || typeof opts.sceneRecord !== 'object') {
            throw new Error('[FrqtlHostedEyes.open] `sceneRecord` is REQUIRED — it is this ' +
                'process\'s half of the scene identity (seed, sourceRef, physics bounds), and ' +
                'the thing every returned still is verified against. (FAIL-LOUD.)');
        }
        if (typeof opts.sceneRecord.seed !== 'number' || !isFinite(opts.sceneRecord.seed)) {
            throw new Error('[FrqtlHostedEyes.open] the sceneRecord carries no finite `seed`. ' +
                'The seed is half of the regeneration triple (code, seed, tick) and is what the ' +
                'hosted page is booted with — without it a "regenerated" scene is a different ' +
                'scene wearing the same name. (FAIL-LOUD.)');
        }
        if (!src || typeof src !== 'object' || src.kind !== 'module' ||
            typeof src.source !== 'string' || !src.source.trim()) {
            throw new Error('[FrqtlHostedEyes.open] this scene is REPLAY-grade, not ' +
                'REGENERATE-grade: hosting re-RUNS the scene in another process, so a ' +
                'SceneRecord alone is not enough (it is identity + reproduction pins, with no ' +
                'scene spec in it). Pass the pair — sceneSource: {kind:"module", source} — where ' +
                '`source` is the buildExperiment(exp) module `designToModule` emits and the ' +
                'canonical empty page evals. An ad-hoc tick-fn scene, a live-edited scene or a ' +
                'bare raster row has nothing to regenerate FROM, and a silently approximate ' +
                're-run is the one failure a content-addressed corpus cannot detect afterwards. ' +
                '(FAIL-LOUD — see RENDERER_CONTRACT.md §10.3.)');
        }
    }

    /**
     * The declared renderState, normalized by its OWNER (`RenderState.normalizeSavedRenderState`),
     * or null when the caller declared none. Throw-or-return, BEFORE a browser is acquired.
     *
     * Its two load-time fields must not open a second identity for one scene: a `seed` that is
     * not the record's would boot one scene and file it under another, and an `engine` other than
     * wasm names an engine FRQTL does not run.
     * @private
     */
    function _declaredRenderState(opts, record, RST) {
        var raw = opts.renderState;
        if (raw === undefined || raw === null) { return null; }
        if (typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error('[FrqtlHostedEyes.open] `renderState` must be a renderState bag (a plain ' +
                'object — for a rung, effectiveRenderState(rung, mode) from the walkthrough registry); ' +
                'got ' + (Array.isArray(raw) ? 'an array' : typeof raw) + '. (FAIL-LOUD.)');
        }
        var bag = RST.normalizeSavedRenderState(raw);
        if (bag.seed !== null && bag.seed !== String(record.seed)) {
            throw new Error('[FrqtlHostedEyes.open] renderState.seed ' + JSON.stringify(bag.seed) +
                ' is not the sceneRecord\'s seed ' + String(record.seed) + ' — two seeds for one scene ' +
                'is two identities. Drop the bag\'s seed, or open the record with it. (FAIL-LOUD.)');
        }
        if (bag.engine !== null && bag.engine !== 'wasm') {
            throw new Error('[FrqtlHostedEyes.open] renderState.engine ' + JSON.stringify(bag.engine) +
                ' — the JS reference engine is archived; FRQTL is WASM-only. Drop the bag\'s engine ' +
                'or set it to "wasm". (FAIL-LOUD.)');
        }
        return bag;
    }

    /**
     * The page URL, with the forwardable params this boot NEEDS.
     *
     * `seed` comes from the record — it is half the regeneration triple and the page cannot
     * derive it. THE DISPLAY DOES NOT: `renderer` is NOT set from the record.
     * They are boot RESULTS (RENDERER_CONTRACT §10.3 lists them as never caller-supplied),
     * and steering a boot with them made them caller REQUESTS wearing provenance names —
     * whose absent case silently booted a 2D default under a 3D scene. The SOURCE declares
     * what kind of scene it is (its co-init call names the renderer); the PAGE reports it;
     * this function carries a DECLARED display on the first boot (the renderState's `renderer`,
     * verified against the built world afterwards) or the scene's OWN answer back on a reload
     * (`renderer`). Each key is checked against the contract's forwardable list before it is set.
     *
     * @param {string} [renderer] — the declared renderState's display, or the renderer the
     *   SCENE's co-init call requires (see `_IN_PAGE_DISPLAY`) — never a record field.
     * @private
     */
    function _pageUrlFor(pageUrl, record, PP, renderer) {
        var u = new URL(pageUrl);
        var set = function (key, value) {
            if (PP.FORWARDABLE_PARAMS.indexOf(key) === -1) {
                throw new Error('[FrqtlHostedEyes] page param ' + JSON.stringify(key) + ' is ' +
                    'declared NON-forwardable by lib/shim/page-params — a host may not force ' +
                    'it into an embedded page. (FAIL-LOUD.)');
            }
            u.searchParams.set(key, String(value));
        };
        set(PP.KEYS.SEED, record.seed);
        if (renderer) { set(PP.KEYS.RENDERER, renderer); }
        return u.href;
    }

    /**
     * The caller's `build`/`projection` are an EXPECTATION, never a request.
     *
     * They are boot RESULTS, so a caller who states them is asserting what the source will
     * resolve to. Agreement is silent; a disagreement THROWS naming BOTH sides — the CEO's
     * "caller forces 2D onto a 3D source" case. The one thing never allowed is the third
     * outcome: quietly running the caller's display over the source's world.
     * @private
     */
    function _assertExpectedDisplay(record, pageScene) {
        var bad = [];
        if (record.build && record.build.renderer !== undefined && record.build.renderer !== null &&
            record.build.renderer !== pageScene.build.renderer) {
            bad.push('build.renderer — you expected ' + JSON.stringify(record.build.renderer) +
                ', the scene source resolved ' + JSON.stringify(pageScene.build.renderer));
        }
        if (record.projection && record.projection.kind !== undefined &&
            record.projection.kind !== null &&
            record.projection.kind !== pageScene.projection.kind) {
            bad.push('projection.kind — you expected ' + JSON.stringify(record.projection.kind) +
                ', the scene source resolved ' + JSON.stringify(pageScene.projection.kind));
        }
        if (bad.length) {
            throw new Error('[FrqtlHostedEyes.open] the display you declared is not the display ' +
                'this scene requires: ' + bad.join('; ') + '. `build` and `projection` are boot ' +
                'RESULTS, not requests — the scene SOURCE is the one authority on what kind of ' +
                'scene it is (its co-init call: exp.createCanvas ⇒ 2D, exp.createScene ⇒ 3D), the PAGE ' +
                'resolves the display it needs, and these fields REPORT what happened. Drop them ' +
                'from the record to accept the source\'s own answer. (FAIL-LOUD — a 3D scene ' +
                'running in a 2D display would look fine and be wrong.)');
        }
    }

    /**
     * A hosted eye accepts NO retained render state. STUDIO retains a row or preset because its
     * display toggle can switch back and its Render Controls SHOW what was retained; a hosted eye
     * has no later and no chrome, so a declared look that did not land is a picture that differs
     * from its declaration — the silent class a corpus cannot detect afterwards.
     * @param {object|null} report — `FrqtlPage.applyRenderState`'s report, or null (none declared).
     * @private
     */
    function _assertLanded(report) {
        if (!report) { return; }
        if (report.retained.length > 0) {
            throw new Error('[FrqtlHostedEyes.open] the renderState rows ' +
                JSON.stringify(report.retained) + ' were retained, not applied: the booted display ' +
                'does not declare them (another renderer does). A hosted eye records the look it was ' +
                'given or nothing. (FAIL-LOUD.)');
        }
        if (report.camera === 'retained') {
            throw new Error('[FrqtlHostedEyes.open] the renderState camera preset ' +
                JSON.stringify(report.preset) + ' is not offered by the booted camera, so it was ' +
                'retained, not applied. A hosted eye records the view it was given or nothing. ' +
                '(FAIL-LOUD.)');
        }
    }

    // ── IN-PAGE routines (each closes over NOTHING — they run in the browser) ──

    /**
     * Apply the regenerated scene, then its declared renderState (through the page's door), then
     * take the clock: the loop is the host's from here. Returns the door's report for the host to
     * judge (`renderState: null` when none was declared).
     */
    var _IN_PAGE_APPLY = function (args) {
        if (!window.FrqtlPage || typeof window.FrqtlPage.applyModuleSource !== 'function') {
            throw new Error('[FrqtlHostedEyes/in-page] this page has no ' +
                'FrqtlPage.applyModuleSource — the host boots the CANONICAL empty experiment page ' +
                '(lib/frqtl/experiments/empty/index.html), never an arbitrary URL.');
        }
        try {
            window.FrqtlPage.applyModuleSource(args.source);
        } catch (e) {
            // The scene's co-init call named a renderer this page did not boot: report it, so the
            // host reloads with the scene's own answer (displayResolution reads it back).
            if (e && e.frqtlRequiredRenderer) { return { requiredRenderer: e.frqtlRequiredRenderer }; }
            throw e;
        }
        var r = window._frqtlApp;
        if (!r) { throw new Error('[FrqtlHostedEyes/in-page] no window._frqtlApp after apply'); }
        r.stop();                                  // the RAF loop must not advance behind us
        if (args.sourceRef !== null) { r.setSourceRef(args.sourceRef); }
        // The declared look, BEFORE the establishing step, so tick 1 is already drawn under it.
        // The door paints the page's error overlay and rethrows on any owner throw.
        var applied = null;
        if (args.renderState !== null) {
            if (typeof window.FrqtlPage.applyRenderState !== 'function') {
                throw new Error('[FrqtlHostedEyes/in-page] this page has no FrqtlPage.applyRenderState — ' +
                    'the host boots the CANONICAL empty experiment page, never an arbitrary URL.');
            }
            applied = window.FrqtlPage.applyRenderState(args.renderState);
        }
        // ESTABLISH THE CLOCK with one step, deliberately. Applying a recipe RE-INITS the
        // universe, and neither the host's retained TickData nor the compat universe's own
        // `tick` field is cleared by that re-init — both keep reporting the blank page's last
        // value until the next tick overwrites them (observed: a freshly regenerated scene
        // read as "tick 10"). Every later read here is exact BECAUSE this process is the only
        // stepper (the RAF loop is stopped above), so the fix is to make the first reading a
        // real one rather than to trust a cache the re-init left behind. It costs nothing the
        // contract was not already charging: a capture before the first tick is REFUSED
        // anyway ("no tick has run yet" — never an empty buffer), so tick 1 is the earliest
        // capturable coordinate of any scene.
        r.step();
        return { renderState: applied };
    };

    /** The page's own SceneRecord — the identity half this process cannot resolve. */
    var _IN_PAGE_SCENE = function () {
        return window._frqtlApp.sceneRecord();
    };

    /** What display does the BUILT WORLD require, and what did this page boot? */
    var _IN_PAGE_DISPLAY = function () {
        return window.FrqtlPage.displayResolution();
    };

    /**
     * One tick, awaited by the caller: the control-plane step warmUpRealm drives.
     *
     * It HONOURS THE HOLD rather than racing it: an in-page recorder holds the clock from a
     * sampled tick until that capture settles, and `step()` refuses to advance a held clock. So
     * the step waits (a macrotask at a time) for `ticksSuspended` to clear, bounded by the
     * handle's timeout, and throws naming the hold if it never does.
     */
    var _IN_PAGE_STEP = function (args) {
        var r = window._frqtlApp;
        var deadline = Date.now() + args.timeoutMs;
        return new Promise(function (resolve, reject) {
            (function attempt() {
                if (r.ticksSuspended) {
                    if (Date.now() > deadline) {
                        reject(new Error('[FrqtlHostedEyes/in-page] the tick clock stayed HELD ' +
                            '(runner.ticksSuspended) for ' + args.timeoutMs + 'ms — a capture or ' +
                            'waypoint handler in the page never settled, so the drive cannot ' +
                            'advance. (FAIL-LOUD.)'));
                        return;
                    }
                    setTimeout(attempt, 0);
                    return;
                }
                try {
                    var td = r.step();
                    resolve((td && td.universeData) ? td.universeData.tick : null);
                } catch (e) { reject(e); }
            })();
        });
    };

    /** The current tick, read (never advanced). */
    var _IN_PAGE_TICK = function () {
        var td = window._frqtlApp._lastTickData;
        return (td && td.universeData) ? td.universeData.tick : null;
    };

    /** Point the ONE camera and redraw — pose is a still coordinate, set before capture. */
    var _IN_PAGE_POSE = function (pose) {
        var r = window._frqtlApp;
        var cam = r.cameraControl;
        if (!cam) {
            throw new Error('[FrqtlHostedEyes/in-page] this page\'s active provider exposes no ' +
                'camera pose control, so a pose cannot be applied (a 2D stack has no orbit). ' +
                'Capture without one — the still will report pose honestly.');
        }
        cam.setOrbit(pose);
        r.repaint();
        return cam.getOrbit();
    };

    // ── open() ────────────────────────────────────────────────────────────────

    /**
     * open(opts) → Promise<handle> — boot a hosted eye on a regenerable scene.
     *
     * @param {object} opts
     * @param {object} opts.sceneRecord — this process's identity half (seed, sourceRef,
     *   physicsW/H). `build`/`projection` are RESOLVED from the page. Supplying them is an
     *   EXPECTATION, checked after boot and THROWN on mismatch — never a request.
     * @param {{kind:string, source:string}} opts.sceneSource — the REGENERATE-grade scene.
     * @param {object} [opts.renderState] — the declared LOOK, ferried: a renderState bag (for a
     *   rung, `effectiveRenderState(rung, mode)`; or a saved project's bag). Its `renderer` boots
     *   the page; its rows, camera and backdrop are applied by `FrqtlPage.applyRenderState` before
     *   the establishing step. FAIL-LOUD: a row no renderer declares (the owner's throw); a row or
     *   camera preset the booted display cannot take (RETAINED — a hosted eye has no later and no
     *   chrome, so a declared look that did not land is refused, not recorded); a `renderer` the
     *   source does not build; a `seed` that is not the record's; an `engine` other than wasm.
     *   `setPose` after open overrides its camera. Omit it for a scene's PLAIN render.
     * @param {string} opts.pageUrl — the canonical empty experiment page in YOUR deployment
     *   (dev server: `<origin>/frqtl/experiments/empty/index.html`; published dist:
     *   `<origin>/experiments/empty/index.html`). Required rather than guessed: the address of
     *   a deployment is not something a library may invent.
     * @param {object} opts.browserType — a Playwright browser type (`chromium`). The
     *   `@descix/frqtl-sdk/eyes` entry supplies the packaged default; passing your own IS the
     *   BYO seam.
     * @param {string[]} [opts.launchArgs] — overrides the hardware-GL default wholesale.
     * @param {{width:number,height:number}} [opts.viewport]
     * @param {number} [opts.timeoutMs=60000]
     * @returns {Promise<object>} the handle (see the module docstring).
     */
    function open(opts) {
        // A Promise-returning entry point must NEVER throw synchronously: a mixed error
        // channel (sync throw for a bad argument, rejection for a bad boot) guarantees an
        // uncaught exception at some call site that only wrote `.catch()`. Same wrapper, same
        // reason, as the tap mechanism's `capture()`.
        try { return _open(opts || {}); }
        catch (e) { return Promise.reject(e); }
    }

    /** @private — the body; see `open` for the contract. */
    function _open(opts) {
        var C = _contracts();
        _assertHostable(opts);
        var declared = _declaredRenderState(opts, opts.sceneRecord, C.RST);
        if (!opts.pageUrl || typeof opts.pageUrl !== 'string') {
            throw new Error('[FrqtlHostedEyes.open] `pageUrl` is REQUIRED: the URL of the ' +
                'CANONICAL empty experiment page (lib/frqtl/experiments/empty/index.html) in your ' +
                'deployment — a dev server exposes it at its /frqtl mount, a published dist at ' +
                '<origin>/experiments/empty/index.html. A library may not invent the address of ' +
                'your deployment, and it must not ship a second copy of that page. (FAIL-LOUD.)');
        }
        if (!opts.browserType || typeof opts.browserType.launch !== 'function') {
            throw new Error('[FrqtlHostedEyes.open] `browserType` is REQUIRED — a Playwright ' +
                'browser type (chromium). The dependency is declared by the eyes ENTRY that ' +
                'ships it (@descix/frqtl-sdk/eyes), never by this layer, so the core library ' +
                'stays dependency-free and a BYO browser stack is a first-class option. ' +
                '(FAIL-LOUD.)');
        }
        var timeout = (typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 60000;
        var record  = opts.sceneRecord;
        var sourceRef = (record.sourceRef === undefined || record.sourceRef === null)
            ? null : String(record.sourceRef);

        var browser = null, page = null;
        return Promise.resolve(opts.browserType.launch({
            headless: true,
            args: Array.isArray(opts.launchArgs) ? opts.launchArgs : _defaultLaunchArgs()
        })).then(function (b) {
            browser = b;
            return b.newPage({ viewport: opts.viewport || { width: 900, height: 700 } });
        }).then(function (p) {
            page = p;
            /**
             * Boot the canonical page at `url`, wait for the runner, apply the source, and
             * report the display the BUILT WORLD requires. @private
             */
            function bootAndApply(url) {
                return page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout })
                    .then(function () {
                        // The page boots ENGINE then RENDERER then p5 (which calls setup()); the
                        // runner exists only after that chain completes. Waiting on the runner
                        // itself — not on a timer — is what makes this deterministic, not flaky.
                        return page.waitForFunction(
                            function () { return !!(window.FrqtlPage && window.FrqtlPage.isReady &&
                                window.FrqtlPage.isReady()); },
                            undefined, { timeout: timeout });
                    })
                    .then(function () {
                        return page.evaluate(_IN_PAGE_APPLY,
                            { source: opts.sceneSource.source, sourceRef: sourceRef, renderState: declared });
                    })
                    .then(function (applied) {
                        return page.evaluate(_IN_PAGE_DISPLAY).then(function (disp) {
                            return { disp: disp, renderState: (applied && applied.renderState) || null };
                        });
                    });
            }

            // ── SOURCE declares → PAGE resolves → PROVENANCE reports ─────────
            // The first boot takes the page's own default display, because nothing outside
            // the source knows what kind of scene this is. The page then reads the 3D-ness
            // off the world the source just BUILT. If that disagrees with what booted, the
            // page is reloaded with ITS OWN answer — the sanctioned RELOAD semantics of the
            // display slot (the display provider is boot-fixed; a re-selection is a reload),
            // and the reason this is a reload rather than a live swap is that a canvas owns
            // ONE rendering context and the runner memoizes the provider it started under.
            // One extra boot, only when the default was wrong, and never a caller knob.
            // A DECLARED renderState renderer boots the first page instead of the default, and
            // is then a declaration to verify, not a guess to correct: a source that builds a
            // different display THROWS rather than reloading over it.
            var declaredRenderer = declared ? declared.renderer : null;
            return bootAndApply(_pageUrlFor(opts.pageUrl, record, C.PP, declaredRenderer)).then(function (boot) {
                var disp = boot.disp;
                if (disp.required.renderer === disp.booted.renderer) { return boot; }
                if (declaredRenderer) {
                    throw new Error('[FrqtlHostedEyes.open] the renderState declares the ' +
                        JSON.stringify(declaredRenderer) + ' display and this scene\'s source requires the ' +
                        JSON.stringify(disp.required.renderer) + ' display. The bag and the source name ' +
                        'two different worlds; a rung\'s bag belongs to the rung\'s own scene text. ' +
                        '(FAIL-LOUD — a 3D scene drawn by a 2D display looks fine and is wrong.)');
                }
                return bootAndApply(_pageUrlFor(opts.pageUrl, record, C.PP, disp.required.renderer));
            }).then(function (boot) {
                var disp = boot.disp;
                if (disp.required.renderer !== disp.booted.renderer) {
                    throw new Error('[FrqtlHostedEyes.open] this scene\'s source requires the ' +
                        JSON.stringify(disp.required.renderer) + ' display and the page booted ' +
                        JSON.stringify(disp.booted.renderer) + ' even after a reload carrying that ' +
                        'answer. A 3D scene drawn by a 2D display looks fine and is wrong, so this ' +
                        'refuses rather than returning it. (FAIL-LOUD.)');
                }
                _assertLanded(boot.renderState);
            });
        }).then(function () {
            return page.evaluate(_IN_PAGE_SCENE);
        }).then(function (pageScene) {
            // The caller's `build`/`projection`, if any, were an EXPECTATION about what the
            // source would resolve to — checked here, against what it actually did.
            _assertExpectedDisplay(record, pageScene);
            // ── The KIND, over this page ────────────────────────────────────
            var identity = { build: pageScene.build, projection: pageScene.projection };
            var disposed = false;
            // The in-page recorder subscribes when its BEGIN lands; a drive waits on this gate so
            // no tick runs between a record() call and the page-side subscription.
            var gate = { opened: Promise.resolve(), seq: 0 };
            var host = {
                kind: C.CH.CAPTURE_HOST_KIND,
                // FERRIED, never a local list: the PAGE's dispatcher is the authority on which
                // stages are tappable, so a stage that gains an executor there works here the
                // same day, and one that has none fails loud with the page's own message.
                stages: C.RS.RENDER_STAGES.slice(),
                identity: function () { return identity; },
                capture: function (stage) {
                    if (disposed) {
                        throw new Error('[FrqtlHostedEyes] this handle is DISPOSED — its browser ' +
                            'is closed. Open a new one; a capture surface that silently ' +
                            'resurrected a browser would leak processes by design. (FAIL-LOUD.)');
                    }
                    return page.evaluate(C.CH.IN_PAGE_CAPTURE, { stage: stage })
                        .then(function (env) { return C.CH.decodeStillEnvelope(env); });
                },
                record: function (recordOpts) {
                    if (disposed) {
                        return Promise.reject(new Error('[FrqtlHostedEyes] this handle is DISPOSED — ' +
                            'its browser is closed. Open a new one. (FAIL-LOUD.)'));
                    }
                    gate.seq += 1;
                    var id = gate.seq;
                    // A signal cannot cross `evaluate`: the page-side record gets its own
                    // controller (parked by BEGIN), and this signal is ferried to it by ABORT.
                    var signal = recordOpts.signal || null;
                    var pageOpts = {};
                    for (var k in recordOpts) { if (k !== 'signal') { pageOpts[k] = recordOpts[k]; } }
                    var begun = page.evaluate(C.CH.IN_PAGE_RECORD_BEGIN, { id: id, opts: pageOpts });
                    gate.opened = begun.then(null, function () {});
                    var onAbort = null;
                    var aborted = null;
                    if (signal) {
                        var sendAbort = function () {
                            return begun.then(function () {
                                return page.evaluate(C.CH.IN_PAGE_RECORD_ABORT, { id: id });
                            });
                        };
                        if (signal.aborted) { aborted = sendAbort(); }
                        else {
                            onAbort = function () { aborted = sendAbort(); };
                            signal.addEventListener('abort', onAbort, { once: true });
                        }
                    }
                    var detach = function () { if (onAbort) { signal.removeEventListener('abort', onAbort); } };
                    return begun.then(function () {
                        return page.evaluate(C.CH.IN_PAGE_RECORD_END, { id: id });
                    }).then(function (env) {
                        detach();
                        // A failed ABORT delivery is surfaced, never swallowed.
                        return Promise.resolve(aborted).then(function () { return env; });
                    }, function (e) { detach(); throw e; });
                },
                dispose: function () {
                    if (disposed) { return Promise.resolve(); }
                    disposed = true;
                    return Promise.resolve(browser.close());
                }
            };

            // The node-side instrument: no world, no provider, no DOM. Attaching the host
            // EXTENDS its identity with the page's build/projection (a.3), so the record it
            // computes and the one the page stamps are the same record.
            var inst = FrqtlCapture.create(
                { lastTickData: null },
                function () { return null; },
                { seed: record.seed, rect: { w: record.physicsW, h: record.physicsH }, sourceRef: sourceRef },
                function () { return {}; }
            );
            inst.attachCaptureHost(host);

            return inst.sceneRecord().then(function (nodeScene) {
                // Prove a.3 AT OPEN, by field — not at the first capture, by hash.
                var diff = C.CH.diffSceneRecords(nodeScene, pageScene);
                if (diff.length) {
                    throw new Error('[FrqtlHostedEyes.open] the hosted page is not running the ' +
                        'scene this handle was opened for: [' + diff.join(', ') + '] disagree. ' +
                        'Node ' + JSON.stringify(_pick(nodeScene, diff)) + ' vs page ' +
                        JSON.stringify(_pick(pageScene, diff)) + '. Physics bounds come from the ' +
                        'booted page\'s canvas, so a record whose physicsW/H were taken from a ' +
                        'differently-sized page cannot be hosted by it. (FAIL-LOUD — a hosted ' +
                        'still filed under the wrong scene verifies forever against the wrong ' +
                        'header.)');
                }
                return _handle(browser, page, host, inst, nodeScene, gate, timeout);
            });
        }).catch(function (e) {
            // A half-opened handle that leaked a browser would poison the zero-orphans gate
            // for every later run in the same shell — so open() cleans up its OWN acquisition.
            if (browser) { return Promise.resolve(browser.close()).then(function () { throw e; },
                                                                        function () { throw e; }); }
            throw e;
        });
    }

    /** @private */
    function _pick(rec, keys) {
        var out = {};
        for (var i = 0; i < keys.length; i++) { out[keys[i]] = rec[keys[i]]; }
        return out;
    }

    /** The consumer-facing handle. @private */
    function _handle(browser, page, host, inst, scene, gate, timeout) {
        var FrqtlVision = _req(function () { return require('../objects/FrqtlVision.js'); }, 'the vision FACE');
        var self = {
            /**
             * The SAME face as everywhere else: getScene / getStill / stages / toPNG, and
             * `record(opts)`, which runs the one recorder IN the hosted page. Issue the drive
             * after it: `const p = eyes.vision.record(opts); await eyes.driveToTick(n); await p`.
             */
            vision: FrqtlVision.attach(inst),
            /** The tap MECHANISM, for a consumer that wants `capture(stage)` directly. */
            capture: inst,
            /** The node-side SceneRecord (page-extended) + its content id. */
            scene: scene,

            /** @returns {Promise<number|null>} the page's current tick — READ, never advanced. */
            tick: function () { return page.evaluate(_IN_PAGE_TICK); },

            /**
             * driveToTick(n) — advance the hosted world to EXACTLY tick `n`, or throw.
             *
             * One awaited `step()` per tick through `warmUpRealm` (the existing authority),
             * then a verify: "approximately tick n" is not a coordinate, and a still stamped
             * with a tick nobody asked for is worse than an error because it looks fine.
             * @param {number} n
             * @returns {Promise<number>} n
             */
            driveToTick: function (n) {
                if (!Number.isInteger(n) || n < 0) {
                    // REJECTION, never a sync throw — see open()'s wrapper for why.
                    return Promise.reject(new Error('[FrqtlHostedEyes.driveToTick] a tick is a ' +
                        'non-negative integer coordinate; got ' + String(n) + '. (FAIL-LOUD.)'));
                }
                return gate.opened.then(function () { return self.tick(); }).then(function (now) {
                    var at = (typeof now === 'number') ? now : 0;
                    if (at > n) {
                        throw new Error('[FrqtlHostedEyes.driveToTick] the hosted world is ' +
                            'already at tick ' + at + ', past ' + n + '. A world runs forward ' +
                            'only: open a fresh handle to reach an earlier tick (that is what ' +
                            'the seed is for). (FAIL-LOUD.)');
                    }
                    return _warmup().then(function (W) {
                        return W.warmUpRealm({ step: function () { return page.evaluate(_IN_PAGE_STEP, { timeoutMs: timeout }); } },
                                             n - at, 0, W.MAX_PRODUCE_AFTER_TICKS);
                    });
                }).then(function () {
                    return self.tick();
                }).then(function (landed) {
                    if (landed !== n) {
                        throw new Error('[FrqtlHostedEyes.driveToTick] asked for tick ' + n +
                            ' and the hosted world is at ' + String(landed) + '. Exact-or-throw: ' +
                            'the tick is a co-registration key, and a still stamped with a tick ' +
                            'nobody asked for is worse than an error. (FAIL-LOUD.)');
                    }
                    return n;
                });
            },

            /**
             * setPose(orbit) — point the ONE camera authority and redraw.
             * @param {object} orbit — an orbit bag (`{azimuth, elevation, distance, roll?}`)
             * @returns {Promise<object>} the pose the camera actually took (read back)
             */
            setPose: function (orbit) { return page.evaluate(_IN_PAGE_POSE, orbit); },

            /**
             * saveStill(still, file) — write a still to disk as a PNG.
             *
             * The write convenience over `FrqtlVision.toPNG` (the NODE encoder on the ONE
             * face) — "get a picture from a script" in one line, which is the most natural
             * thing to want from this surface and, until V4, the one thing the package could
             * not do (`toDataURL` needs a DOM, and a hosted eye has none).
             *
             * SYNCHRONOUS on purpose: unlike every other method here it crosses NO boundary —
             * the pixels are already in this process, and a Promise would imply a page round
             * trip that does not happen.
             *
             * @param {object} still — an rgba8 still (`getStill('composite')`)
             * @param {string} file — the destination path (directories created)
             * @returns {string} `file`
             */
            saveStill: function (still, file) {
                if (typeof file !== 'string' || !file) {
                    throw new Error('[FrqtlHostedEyes.saveStill] a destination path is REQUIRED ' +
                        '— saveStill(still, "out.png"). (FAIL-LOUD.)');
                }
                var fs = _req(function () { return require('fs'); }, 'the node filesystem');
                fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
                fs.writeFileSync(file, _req(function () { return require('../objects/FrqtlVision.js'); }, 'the vision FACE').toPNG(still));
                return file;
            },

            /**
             * saveVideo(envelope, file) — write a recording's MP4 bytes to disk.
             *
             * The twin of `saveStill`: the envelope is re-validated by its OWNER
             * (`CaptureEnvelope.videoEnvelope`) and its base64 bytes are decoded to the file.
             * SYNCHRONOUS — the bytes are already in this process.
             *
             * @param {object} envelope — what `vision.record` resolved
             * @param {string} file — the destination path (directories created)
             * @returns {string} `file`
             */
            saveVideo: function (envelope, file) {
                if (typeof file !== 'string' || !file) {
                    throw new Error('[FrqtlHostedEyes.saveVideo] a destination path is REQUIRED ' +
                        '— saveVideo(envelope, "out.mp4"). (FAIL-LOUD.)');
                }
                if (!envelope || envelope.kind !== 'video') {
                    throw new Error('[FrqtlHostedEyes.saveVideo] expected the video envelope ' +
                        'vision.record resolves, got kind ' + JSON.stringify(envelope && envelope.kind) +
                        '. (FAIL-LOUD.)');
                }
                var CE = _req(function () {
                    return require('../../../shim/render/capture-envelope.js');
                }, 'the capture-envelope contract');
                var env = CE.videoEnvelope({ track: envelope.track, encoded: envelope.encoded, truncated: envelope.truncated });
                var fs = _req(function () { return require('fs'); }, 'the node filesystem');
                fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
                fs.writeFileSync(file, Buffer.from(env.encoded.bytes, 'base64'));
                return file;
            },

            /** Close the managed browser. Symmetric with open(), idempotent. */
            dispose: function () { return host.dispose(); }
        };
        return self;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    var FrqtlHostedEyes = { open: open };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FrqtlHostedEyes;
    } else if (typeof window !== 'undefined') {
        window.FrqtlHostedEyes = FrqtlHostedEyes;
    }

})();
