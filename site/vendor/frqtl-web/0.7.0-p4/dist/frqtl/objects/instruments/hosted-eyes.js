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
 * point of this file — a raster backend that RE-DREW the scene in
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
 *                   mirror plus a second serving context). Any other page is REFUSED by
 *                   name at once (no `window.FrqtlPage` after DOMContentLoaded), as is a
 *                   URL that did not serve, a canonical page whose stack failed (its boot
 *                   record's `data-egpt-boot-failed`) and one that stalled (the pending
 *                   phase) — never a generic wait-for-function timeout.
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
 *   the world       the scene's co-init call (`exp.createCanvas/createScene`) — the ONE size
 *                   writer. `physicsW/H` are read back from the page's SceneRecord like
 *                   `build`/`projection`; a caller who states them states an EXPECTATION.
 *
 * ── The REGENERATE gate (a.4) ────────────────────────────────────────────────
 *
 * A SceneRecord alone cannot open a host: it is identity plus reproduction pins, with no
 * scene spec in it. So the API takes the PAIR — record + `{kind:'project', files, entry}`, the
 * project whose entry's default export is `buildExperiment(exp)` (a one-string sketch, such as a
 * shipped scene file, is `{ files: { 'sketch.js': text }, entry: 'sketch.js' }`). The
 * page links it through its one door and stamps the project's identity (projectIdentity) as the
 * record's `sourceSha256`; this process computes the same identity from the same linked set
 * (lib/shim/project/link.js linkedFiles — frqtl.json and the module files; a README rides unhashed), and the
 * open-time record check holds the two equal. A caller without one is REPLAY-grade
 * (an ad-hoc tick-fn scene, a live-edited scene, a bare raster row) and is REFUSED in
 * RENDERER_CONTRACT §10.3's own vocabulary: there is nothing to regenerate FROM, and a
 * silently approximate re-run is the one failure a content-addressed corpus cannot detect
 * after the fact.
 *
 * ── The raster path is RECORDED, never assumed ───────────────────────────────
 *
 * The default launch flags select HARDWARE GL, per the measured policy: hardware is bit-reproducible on a
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
 *       // No display or size fields: the SOURCE declares its world and what kind of scene it
 *       // is, the PAGE resolves them, and `build`/`projection`/`physicsW/H` REPORT what happened.
 *       sceneRecord: { seed: 42, sourceRef: 'walkthrough:r7-3d' },
 *       sceneSource: { kind: 'project', files: { 'sketch.js': rungSource }, entry: 'sketch.js' },
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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as RenderStages from '../../../shim/render/render-stages.js';
import * as CaptureEnvelope from '../../../shim/render/capture-envelope.js';
import * as PageParams from '../../../shim/page-params/index.js';
import * as RenderState from '../../../shim/render-state/apply.js';
import * as Warmup from '../../../shim/notebook/warmup.js';
import { FrqtlCaptureHost } from './capture-host.js';
import { FrqtlVision } from '../../parts/FrqtlVision.js';
import { FrqtlCapture } from './capture.js';
import { projectIdentity, projectBytes } from '../../../shim/project/identity.js';
import { linkedFiles, entryOf } from '../../../shim/project/link.js';
import { libPathOf } from '../../../shim/project/specifiers.js';


    /** The contracts this instrument consumes, by static import (it is a node-only module). */
    function _contracts() {
        return { RS: RenderStages, CH: FrqtlCaptureHost, PP: PageParams, RST: RenderState };
    }

    /** `warmUpRealm` (lib/shim/notebook/warmup.js) — the one clock driver. @private */
    function _warmup() {
        return Promise.resolve(Warmup);
    }

    /**
     * The URL, AS THE PAGE SEES IT, of a module beside this file. MODULES sit at their
     * lib-relative paths in lib/ and in every dist, so a module's lib path is its path from this
     * tree's lib root. The PAGE does not: the dev mount serves it inside the lib tree, a dist
     * re-anchors it (`<dist>/experiments/empty/`, the graph beside or under a build directory),
     * so where the page sits says nothing about where its modules are. The page's own import map
     * does — every row is its lib root plus a lib path (lib/shim/project/specifiers.js
     * `importMapFor`, rendered for each placement) — so the lib root is asked of the page
     * (`_IN_PAGE_LIB_ROOT` on `PAGE_ANCHOR`) and each module's lib path resolved against it.
     * The in-page routines import the PAGE's module instances from these URLs — never a copy.
     * @private
     */
    var LIB_ROOT_DIR = fileURLToPath(new URL('../../../', import.meta.url));
    var PAGE_ANCHOR_SPECIFIER = '@descix/frqtl-web/parts';
    var PAGE_ANCHOR = { specifier: PAGE_ANCHOR_SPECIFIER, libPath: libPathOf(PAGE_ANCHOR_SPECIFIER) };
    function _pageModuleUrl(pageLibRoot, moduleUrl) {
        var rel = path.relative(LIB_ROOT_DIR, fileURLToPath(moduleUrl)).split(path.sep).join('/');
        return new URL(rel, pageLibRoot).href;
    }
    /** The modules the capture-host KIND's in-page routines import, for a page whose lib root is `pageLibRoot`. @private */
    function _inPageModules(pageLibRoot) {
        return {
            captureHost: _pageModuleUrl(pageLibRoot, import.meta.resolve('./capture-host.js')),
            captureEnvelope: _pageModuleUrl(pageLibRoot, import.meta.resolve('../../../shim/render/capture-envelope.js'))
        };
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
     * assertHostable({sceneRecord, sceneSource}) — throw-or-return the entry, in §10.3's vocabulary. The entry is
     * THE entry rule's answer (link.js entryOf): the entry frqtl.json names, else sceneSource.entry.
     * @private
     */
    function _assertHostable(opts) {
        var src = opts.sceneSource;
        if (!opts.sceneRecord || typeof opts.sceneRecord !== 'object') {
            throw new Error('[FrqtlHostedEyes.open] `sceneRecord` is REQUIRED — it is this ' +
                'process\'s half of the scene identity (seed, sourceRef), and ' +
                'the thing every returned still is verified against. (FAIL-LOUD.)');
        }
        if (typeof opts.sceneRecord.seed !== 'number' || !isFinite(opts.sceneRecord.seed)) {
            throw new Error('[FrqtlHostedEyes.open] the sceneRecord carries no finite `seed`. ' +
                'The seed is half of the regeneration triple (code, seed, tick) and is what the ' +
                'hosted page is booted with — without it a "regenerated" scene is a different ' +
                'scene wearing the same name. (FAIL-LOUD.)');
        }
        if (src && typeof src === 'object' && src.kind === 'module') {
            throw new Error('[FrqtlHostedEyes.open] sceneSource {kind:"module", source} is retired — a scene ' +
                'is a project: sceneSource: { kind: "project", files: { "sketch.js": source }, entry: "sketch.js" } ' +
                '(more files beside it for a project with forked parts). (FAIL-LOUD.)');
        }
        if (!src || typeof src !== 'object' || src.kind !== 'project' ||
            !src.files || typeof src.files !== 'object' || Object.keys(src.files).length === 0) {
            throw new Error('[FrqtlHostedEyes.open] this scene is REPLAY-grade, not ' +
                'REGENERATE-grade: hosting re-RUNS the scene in another process, so a ' +
                'SceneRecord alone is not enough (it is identity + reproduction pins, with no ' +
                'scene spec in it). Pass the pair — sceneSource: { kind: "project", files, entry? } (entry optional when ' +
                'files carries the frqtl.json that names it) — ' +
                'where the entry\'s default export is buildExperiment(exp) and the canonical empty ' +
                'page links it. An ad-hoc tick-fn scene, a live-edited scene or a ' +
                'bare raster row has nothing to regenerate FROM, and a silently approximate ' +
                're-run is the one failure a content-addressed corpus cannot detect afterwards. ' +
                '(FAIL-LOUD — see RENDERER_CONTRACT.md §10.3.)');
        }
        // THE entry rule (link.js entryOf): frqtl.json's entry, a given one equal to it, else the given one.
        return entryOf(src.files, src.entry);
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
     * resolve to. Agreement is silent; a disagreement THROWS naming BOTH sides — the
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

    /** Was this bound stated at all? (`undefined`/`null` is "the source decides".) @private */
    function _stated(record, k) { return record[k] !== undefined && record[k] !== null; }

    /**
     * A STATED physics bound is validated by its owner's rule (`RenderStages.assertSceneBound`)
     * at the FRONT DOOR — before a browser is acquired, never after a boot. @private
     */
    function _assertBoundShape(record, RS) {
        RS.SCENE_BOUND_KEYS.forEach(function (k) {
            if (!_stated(record, k)) { return; }
            try { RS.assertSceneBound(record[k], k); }
            catch (e) {
                throw new Error('[FrqtlHostedEyes.open] sceneRecord.' + k + ' ' + String(record[k]) +
                    ' is refused before a browser is acquired — ' + e.message + ' The bounds are the scene SOURCE\'s ' +
                    '(its exp.createCanvas/createScene call) and are read back from the page — omit ' +
                    k + ' to accept the source\'s own answer; state it only as an expectation. ' +
                    '(FAIL-LOUD.)');
            }
        });
    }

    /**
     * The caller's `physicsW/H` are an EXPECTATION, never a request — the `build`/`projection`
     * rule (`_assertExpectedDisplay`) applied to the world size. The scene's co-init call is the
     * ONE size writer; agreement is silent, a disagreement THROWS naming both sides by field.
     * @private
     */
    function _assertExpectedBounds(record, pageScene, RS) {
        var bad = [];
        RS.SCENE_BOUND_KEYS.forEach(function (k) {
            if (_stated(record, k) && record[k] !== pageScene[k]) {
                bad.push(k + ' — you expected ' + String(record[k]) + ', the scene source resolved ' +
                    String(pageScene[k]));
            }
        });
        if (bad.length) {
            throw new Error('[FrqtlHostedEyes.open] the world you declared is not the world this ' +
                'scene builds: ' + bad.join('; ') + '. The physics bounds are a boot RESULT: the ' +
                'scene SOURCE states its world in its first statement (exp.createCanvas(w, h, cfg) / ' +
                'exp.createScene(w, h, d, cfg)), the page builds it, and `physicsW/H` REPORT it. Drop ' +
                'them from the record to accept the source\'s own answer. (FAIL-LOUD.)');
        }
    }

    // ── The boot wait: every way it can fail is a NAMED refusal ─────────────────

    /**
     * Where a published dist serves the one page — under the dist's own URL, which may be an
     * origin root or a sub-path, so it is named, not computed from `url`. @private
     */
    function _distEmptyPage() {
        return '<dist>/experiments/empty/index.html';
    }

    /** D — the URL did not serve (an HTTP status other than 2xx, or a navigation error). @private */
    function _refuseUnserved(url, what) {
        return new Error('[FrqtlHostedEyes.open] ' + url + ' did not serve: ' + what + '. That is ' +
            'a deployment fact, not a scene problem — the hosted eyes boot ONLY the canonical empty ' +
            'experiment page lib/frqtl/experiments/empty/index.html as your deployment serves it ' +
            '(a published dist serves it at ' + _distEmptyPage() + ', <dist> being the URL the dist is served at); point ' +
            '`pageUrl` at it, or serve it. Nothing was booted. (FAIL-LOUD.)');
    }

    /** A — it served, and it is not the canonical page (no `window.FrqtlPage`). @private */
    function _refuseNotCanonical(url, status) {
        return new Error('[FrqtlHostedEyes.open] ' + url + ' is not the canonical empty experiment ' +
            'page: it loaded (HTTP ' + status + ') and defines no window.FrqtlPage. The hosted eyes ' +
            'boot ONLY lib/frqtl/experiments/empty/index.html (in a published dist: ' +
            _distEmptyPage() + ') and apply your scene into it. They never host an app page, the ' +
            'IDE, or a page of your own: a page that boots and edits its own scene cannot be ' +
            'regenerated from {sceneRecord, sceneSource}. To see your own page, capture IN it ' +
            'through FrqtlVision (the in-page face). To drive it from node, use your own browser; ' +
            'pass that browser type as `browserType` to share one process. (FAIL-LOUD.)');
    }

    /** B — the canonical page's stack failed: its boot record stamped a phase. @private */
    function _refuseBootFailed(url, state) {
        return new Error('[FrqtlHostedEyes.open] the canonical page at ' + url + ' booted and its ' +
            'stack did not come up: boot phase ' + JSON.stringify(state.failed) + ' FAILED ' +
            '(<html data-egpt-boot-failed>). The page\'s own failure text: ' +
            (state.text ? JSON.stringify(state.text)
                : '(none: no [data-egpt-boot-error] overlay text was present when the failure was read)') +
            '. This is the deployment\'s stack, not your scene — nothing was applied. (FAIL-LOUD.)');
    }

    /** C — the canonical page never became ready within `timeoutMs`. @private */
    function _refuseStalled(url, timeoutMs, state) {
        var pending = state.phase
            ? 'boot phase ' + JSON.stringify(state.phase) + ' (' + state.done + '/' + state.total +
              ') is pending'
            : 'the page published no boot record (<html data-egpt-boot-phase> is absent)';
        return new Error('[FrqtlHostedEyes.open] the canonical page at ' + url + ' never became ' +
            'ready within ' + timeoutMs + ' ms: ' + pending + '. FrqtlPage.isReady() stayed false, ' +
            'so nothing was applied. (FAIL-LOUD.)');
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
    var _IN_PAGE_APPLY = async function (args) {
        if (!window.FrqtlPage || typeof window.FrqtlPage.applyModuleSource !== 'function') {
            throw new Error('[FrqtlHostedEyes/in-page] this page has no ' +
                'FrqtlPage.applyModuleSource — the host boots the CANONICAL empty experiment page ' +
                '(lib/frqtl/experiments/empty/index.html), never an arbitrary URL.');
        }
        try {
            await window.FrqtlPage.applyModuleSource({ files: args.files, entry: args.entry });
        } catch (e) {
            // The scene's co-init call named a renderer this page did not boot: report it, so the
            // host reloads with the scene's own answer (displayResolution reads it back).
            if (e && e.frqtlRequiredRenderer) { return { requiredRenderer: e.frqtlRequiredRenderer }; }
            throw e;
        }
        var r = window.FrqtlPage.runner;
        if (!r) { throw new Error('[FrqtlHostedEyes/in-page] no FrqtlPage.runner after apply'); }
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
        // ESTABLISH THE CLOCK with one step, deliberately: applying a recipe begins a world that has not stepped
        // (runner.worldTick 0, no TickData yet), and a capture before the first tick is REFUSED ("no tick has run yet"
        // — never an empty buffer), so tick 1 is the earliest capturable coordinate of any scene. Every later read is
        // exact because this process is the only stepper (the RAF loop is stopped above).
        r.step();
        return { renderState: applied };
    };

    /** Is this the canonical page? Its public front door is published by its module script, so
        it exists once the page has loaded — its absence then is decisive, with nothing to wait for. */
    var _IN_PAGE_FRONT_DOOR = function () {
        return !!(window.FrqtlPage && typeof window.FrqtlPage.isReady === 'function');
    };

    /** Settled = ready, or FAILED per the boot record (with the overlay's own text); else null. */
    var _IN_PAGE_BOOT_SETTLED = function () {
        var failed = document.documentElement.getAttribute('data-egpt-boot-failed');
        if (failed) {
            var box = document.querySelector('[data-egpt-boot-error]');
            return { failed: failed, text: box ? box.textContent : null };
        }
        return window.FrqtlPage.isReady() ? { ready: true } : null;
    };

    /** The boot record's pending phase, read after a stall. */
    var _IN_PAGE_BOOT_STATE = function () {
        var el = document.documentElement;
        return {
            phase: el.getAttribute('data-egpt-boot-phase'),
            done:  el.getAttribute('data-egpt-boot-done'),
            total: el.getAttribute('data-egpt-boot-total')
        };
    };

    /** The page's own SceneRecord — the identity half this process cannot resolve. */
    var _IN_PAGE_SCENE = function () {
        return window.FrqtlPage.runner.sceneRecord();
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
        var r = window.FrqtlPage.runner;
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
                    r.step();
                    resolve(r.worldTick);
                } catch (e) { reject(e); }
            })();
        });
    };

    /** The current tick, read (never advanced). */
    var _IN_PAGE_TICK = function () {
        var r = window.FrqtlPage.runner;
        if (!r) { throw new Error('[FrqtlHostedEyes/in-page] there is no runner to read a tick from (FrqtlPage.runner). (FAIL-LOUD.)'); }
        return r.worldTick;
    };

    /**
     * The page's lib root, resolved by the PAGE's import map: `anchor.specifier` resolves to the lib
     * root plus `anchor.libPath`. A `blob:` module asks, because `import.meta.resolve` is the
     * browser's own resolution against the document's map (the link site's blob modules resolve
     * their imports the same way).
     */
    var _IN_PAGE_LIB_ROOT = async function (anchor) {
        var url = URL.createObjectURL(new Blob(['export default import.meta.resolve(' +
            JSON.stringify(anchor.specifier) + ');'], { type: 'text/javascript' }));
        var resolved;
        try { resolved = (await import(url)).default; }
        catch (e) {
            throw new Error('[FrqtlHostedEyes/in-page] this page\'s import map does not resolve ' +
                JSON.stringify(anchor.specifier) + ' (' + ((e && e.message) || String(e)) + ') — the canonical ' +
                'empty page carries the specifier table\'s import map; nothing can locate its modules ' +
                'without it. (FAIL-LOUD.)');
        }
        finally { URL.revokeObjectURL(url); }
        if (typeof resolved !== 'string' || resolved.slice(-anchor.libPath.length) !== anchor.libPath) {
            throw new Error('[FrqtlHostedEyes/in-page] ' + JSON.stringify(anchor.specifier) + ' resolved to ' +
                JSON.stringify(resolved) + ', which does not end in its lib path ' + JSON.stringify(anchor.libPath) +
                ' — the page\'s import map is not the specifier table\'s rendering. (FAIL-LOUD.)');
        }
        return resolved.slice(0, resolved.length - anchor.libPath.length);
    };

    /** Point the ONE camera and redraw — pose is a still coordinate, set before capture. */
    var _IN_PAGE_POSE = function (pose) {
        var r = window.FrqtlPage.runner;
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

    // ── The Record door, in the page (lib/frqtl/objects/record/Record.js through FrqtlPage.experiment) ──
    // The page's facade owns the Record; these routines only forward to it, so the folder a node host gets
    // is the one the page's own door wrote (one implementation, every host). The open Record and a film
    // in flight are parked on the page under ONE name, `__frqtlHostedRecord`.

    /** exp.startRecord() on the page's facade; parks the Record. */
    var _IN_PAGE_RECORD_START = async function () {
        var exp = window.FrqtlPage.experiment;
        if (!exp || typeof exp.startRecord !== 'function') {
            throw new Error('[FrqtlHostedEyes/in-page] this page has no FrqtlPage.experiment facade to record.');
        }
        var rec;
        // A refusal crosses the page boundary as data, so its err.record reaches node (page.evaluate keeps only a message).
        try { rec = await exp.startRecord(); }
        catch (e) { if (e && e.record) { return { refused: { message: e.message, record: e.record } }; } throw e; }
        window.__frqtlHostedRecord = { rec: rec, film: null };
        return { tick: rec.tick };
    };

    /** rec.film(opts) begins: its first segment subscribes before this returns (the drive gate waits on it). */
    var _IN_PAGE_RECORD_FILM_BEGIN = function (opts) {
        var p = window.__frqtlHostedRecord;
        if (!p || !p.rec) { throw new Error('[FrqtlHostedEyes/in-page] no Record is open — eyes.record.start() first.'); }
        if (p.film) { throw new Error('[FrqtlHostedEyes/in-page] a film is already running — await it first.'); }
        p.film = p.rec.film(opts);
        p.film.then(null, function () {});
        return true;
    };

    /** The film's clip spans, when it ends. */
    var _IN_PAGE_RECORD_FILM_END = function () {
        var p = window.__frqtlHostedRecord;
        var f = p && p.film;
        if (!f) { throw new Error('[FrqtlHostedEyes/in-page] no film is running.'); }
        return f.then(function (spans) { p.film = null; return spans; }, function (e) { p.film = null; throw e; });
    };

    /** rec.stop() → the folder, each clip's bytes as base64 (the one encoder, capture-envelope.js). */
    var _IN_PAGE_RECORD_STOP = async function (args) {
        var p = window.__frqtlHostedRecord;
        if (!p || !p.rec) { throw new Error('[FrqtlHostedEyes/in-page] no Record is open — eyes.record.start() first.'); }
        var CE = await import(args.modules.captureEnvelope);
        var out;
        // A refused stop() leaves the Record open (still parked); its err.record crosses as data.
        try { out = await p.rec.stop(); }
        catch (e) { if (e && e.record) { return { refused: { message: e.message, record: e.record } }; } throw e; }
        window.__frqtlHostedRecord = null;
        if (out.empty) { return { empty: true }; }
        var files = {};
        Object.keys(out.files).forEach(function (k) {
            var v = out.files[k];
            files[k] = typeof v === 'string' ? { text: v } : { base64: CE.bytesToBase64(v) };
        });
        return { files: files, record: out.record, clips: out.clips };
    };

    /** rec.changes (the page's own read: a deep-frozen copy per read) as plain JSON. */
    var _IN_PAGE_RECORD_CHANGES = function () {
        var p = window.__frqtlHostedRecord;
        if (!p || !p.rec) { throw new Error('[FrqtlHostedEyes/in-page] no Record is open — eyes.record.start() first.'); }
        return JSON.parse(JSON.stringify(p.rec.changes));
    };

    /** One act through the page's own doors: toSketch({by}), setDeclared(name, patch, {by}), fork(name, Kind, {by}),
     *  placeDeclaredAt(name, point). */
    var _IN_PAGE_ACT = async function (args) {
        var exp = window.FrqtlPage.experiment;
        var r = window.FrqtlPage.runner;
        if (args.door === 'toSketch') { return exp.toSketch(args.opts); }
        if (args.door === 'setDeclared') { return exp.setDeclared(args.name, args.patch, args.opts); }
        if (args.door === 'fork') { return exp.fork(args.name, args.Kind, args.opts); }
        if (args.door === 'placeDeclaredAt') {
            var d = r.declared.find(function (o) { return o.name === args.name; });
            if (!d) { throw new Error('[FrqtlHostedEyes/in-page] no declared object is named ' + JSON.stringify(args.name) + '.'); }
            var res = r.placeDeclaredAt(d, args.point);
            r.repaint();
            return res;
        }
        throw new Error('[FrqtlHostedEyes/in-page] unknown act door ' + JSON.stringify(args.door) + '.');
    };

    /** A page refusal `{ refused: { message, record } }` → a thrown Error carrying `.record`, as in a page. @private */
    function _rethrowRefused(out) {
        if (out && out.refused) {
            var e = new Error(out.refused.message);
            e.record = out.refused.record;
            throw e;
        }
        return out;
    }

    /** A page folder (text | base64 per path) → { path: string | Uint8Array }. @private */
    function _folderFromPage(out) {
        if (out.empty) { return { empty: true }; }
        var files = {};
        Object.keys(out.files).forEach(function (k) {
            var v = out.files[k];
            files[k] = (v.text !== undefined) ? v.text : new Uint8Array(Buffer.from(v.base64, 'base64'));
        });
        return { files: files, record: out.record, clips: out.clips };
    }

    // ── open() ────────────────────────────────────────────────────────────────

    /**
     * open(opts) → Promise<handle> — boot a hosted eye on a regenerable scene.
     *
     * @param {object} opts
     * @param {object} opts.sceneRecord — this process's identity half (seed, sourceRef).
     *   `build`/`projection`/`physicsW`/`physicsH` are RESOLVED from the page (the bounds from the
     *   world the source's co-init call built). Supplying any of them is an EXPECTATION, checked
     *   after boot and THROWN on mismatch — never a request; a stated bound that is not a
     *   positive integer is refused before a browser is acquired.
     * @param {{kind:'project', files:Object<string,string>, entry?:string}} opts.sceneSource — the
     *   REGENERATE-grade scene: a project, linked in the page by its one door. `entry` is optional when
     *   `files` carries the frqtl.json that names it (a different one is refused).
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
     *   `<dist>/experiments/empty/index.html`, where `<dist>` is the dist's URL — an origin root
     *   or a sub-path). Required rather than guessed: the address of
     *   a deployment is not something a library may invent.
     * @param {object} opts.browserType — a Playwright browser type (`chromium`). The
     *   `@descix/frqtl-node/eyes` entry supplies the packaged default; passing your own IS the
     *   BYO seam.
     * @param {string[]} [opts.launchArgs] — overrides the hardware-GL default wholesale.
     * @param {{width:number,height:number}} [opts.viewport]
     * @param {number} [opts.timeoutMs=60000] — the boot budget. Only a STALL waits it out: a
     *   page that is not the canonical one, a URL that did not serve and a stack that failed are
     *   refused by name as soon as they are decidable.
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
        var entry = _assertHostable(opts);
        _assertBoundShape(opts.sceneRecord, C.RS);
        var declared = _declaredRenderState(opts, opts.sceneRecord, C.RST);
        if (!opts.pageUrl || typeof opts.pageUrl !== 'string') {
            throw new Error('[FrqtlHostedEyes.open] `pageUrl` is REQUIRED: the URL of the ' +
                'CANONICAL empty experiment page (lib/frqtl/experiments/empty/index.html) in your ' +
                'deployment — a dev server exposes it at its /frqtl mount, a published dist at ' +
                '<dist>/experiments/empty/index.html (<dist> = the URL the dist is served at). A library may not invent the address of ' +
                'your deployment, and it must not ship a second copy of that page. (FAIL-LOUD.)');
        }
        if (!opts.browserType || typeof opts.browserType.launch !== 'function') {
            throw new Error('[FrqtlHostedEyes.open] `browserType` is REQUIRED — a Playwright ' +
                'browser type (chromium). The dependency is declared by the eyes ENTRY that ' +
                'ships it (@descix/frqtl-node/eyes), never by this layer, so the core library ' +
                'stays dependency-free and a BYO browser stack is a first-class option. ' +
                '(FAIL-LOUD.)');
        }
        var timeout = (typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 60000;
        var record  = opts.sceneRecord;
        var sourceRef = (record.sourceRef === undefined || record.sourceRef === null)
            ? null : String(record.sourceRef);

        var browser = null, page = null, modules = null;
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
                    .then(function (resp) {
                        // D: a non-2xx response is decisive now (goto RESOLVES on a 404).
                        if (resp && !resp.ok()) {
                            throw _refuseUnserved(url, 'HTTP ' + resp.status() +
                                (resp.statusText() ? ' ' + resp.statusText() : ''));
                        }
                        return resp ? resp.status() : null;
                    }, function (navErr) {
                        throw _refuseUnserved(url, 'navigation error: ' + ((navErr && navErr.message) || String(navErr)));
                    })
                    .then(function (status) {
                        // A: the canonical page's front door exists by DOMContentLoaded.
                        return page.evaluate(_IN_PAGE_FRONT_DOOR).then(function (isCanonical) {
                            if (!isCanonical) { throw _refuseNotCanonical(url, status === null ? '(no response)' : status); }
                        });
                    })
                    .then(function () {
                        // The page boots ENGINE then RENDERER then p5 (which calls setup()); the
                        // runner exists only after that chain completes. Waiting on the page's
                        // own boot record — ready, or FAILED (B) — not on a timer, is what makes
                        // this deterministic; only a STALL (C) waits out the budget.
                        return page.waitForFunction(_IN_PAGE_BOOT_SETTLED, undefined, { timeout: timeout })
                            .then(function (h) { return h.jsonValue(); }, function (e) {
                                if (!e || e.name !== 'TimeoutError') { throw e; }
                                return page.evaluate(_IN_PAGE_BOOT_STATE).then(function (st) {
                                    throw _refuseStalled(url, timeout, st);
                                });
                            })
                            .then(function (settled) {
                                if (settled.failed) { throw _refuseBootFailed(url, settled); }
                            });
                    })
                    .then(function () {
                        return page.evaluate(_IN_PAGE_APPLY,
                            { files: opts.sceneSource.files, entry: entry, sourceRef: sourceRef, renderState: declared });
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
            // Asked of the FINAL page (after any display reload), once: the in-page routines import
            // its module instances from these URLs.
            return page.evaluate(_IN_PAGE_LIB_ROOT, PAGE_ANCHOR);
        }).then(function (pageLibRoot) {
            modules = _inPageModules(pageLibRoot);
            return page.evaluate(_IN_PAGE_SCENE);
        }).then(function (pageScene) {
            // The caller's `build`/`projection`, if any, were an EXPECTATION about what the
            // source would resolve to — checked here, against what it actually did.
            _assertExpectedDisplay(record, pageScene);
            _assertExpectedBounds(record, pageScene, C.RS);
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
                    return page.evaluate(C.CH.IN_PAGE_CAPTURE, { stage: stage, modules: modules })
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
                    var begun = page.evaluate(C.CH.IN_PAGE_RECORD_BEGIN, { id: id, opts: pageOpts, modules: modules });
                    gate.opened = begun.then(null, function () {});
                    var onAbort = null;
                    var aborted = null;
                    if (signal) {
                        var sendAbort = function () {
                            return begun.then(function () {
                                return page.evaluate(C.CH.IN_PAGE_RECORD_ABORT, { id: id, modules: modules });
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
                        return page.evaluate(C.CH.IN_PAGE_RECORD_END, { id: id, modules: modules });
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
            // EXTENDS its identity with the page's build/projection (a.3), and its physics
            // bounds are the page's too — the world the source's co-init call built, never a
            // caller's restatement — so the record it computes and the one the page stamps are
            // the same record.
            var inst = FrqtlCapture.create(
                { lastTickData: null },
                function () { return null; },
                { seed: record.seed, rect: { w: pageScene.physicsW, h: pageScene.physicsH }, sourceRef: sourceRef },
                function () { return {}; }
            );
            inst.attachCaptureHost(host);

            return projectIdentity({ files: projectBytes(linkedFiles(opts.sceneSource.files)) }).then(function (sha) {
                inst.setSourceSha256(sha);
                return inst.sceneRecord();
            }).then(function (nodeScene) {
                // Prove a.3 AT OPEN, by field — not at the first capture, by hash.
                var diff = C.CH.diffSceneRecords(nodeScene, pageScene);
                if (diff.length) {
                    throw new Error('[FrqtlHostedEyes.open] the hosted page is not running the ' +
                        'scene this handle was opened for: [' + diff.join(', ') + '] disagree. ' +
                        'Node ' + JSON.stringify(_pick(nodeScene, diff)) + ' vs page ' +
                        JSON.stringify(_pick(pageScene, diff)) + '. The page was booted with ' +
                        'this record\'s seed (?seed=) and handed its sourceRef, and did not take ' +
                        'them. (FAIL-LOUD — a hosted still filed under the wrong scene verifies ' +
                        'forever against the wrong header.)');
                }
                return _handle(browser, page, host, inst, nodeScene, gate, timeout, modules);
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
    function _handle(browser, page, host, inst, scene, gate, timeout, modules) {
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

            /** @returns {Promise<number>} the world's own tick (runner.worldTick: 0 before its first step) — READ, never advanced. */
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
                    var at = now;
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
                fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
                fs.writeFileSync(file, FrqtlVision.toPNG(still));
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
                var env = CaptureEnvelope.videoEnvelope({ track: envelope.track, encoded: envelope.encoded, truncated: envelope.truncated });
                fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
                fs.writeFileSync(file, Buffer.from(env.encoded.bytes, 'base64'));
                return file;
            },

            /**
             * The Record door, forwarded to the PAGE's facade (lib/frqtl/objects/record/Record.js): the folder is
             * the one the page's own door writes, so a node host and a page produce the same files for the same acts.
             * The handle has no re-authoring door: a Record opened by `eyes.record.start()` closes only by
             * `eyes.record.stop()`. A refusal carries `err.record = { changes, clips }`, as in a page.
             *   start()      exp.startRecord() → the Record's tick (0)
             *   film(opts)   rec.film(opts) → its clip spans. Drive the world while it films:
             *                `const f = eyes.record.film(o); await eyes.driveToTick(n); await f`
             *   stop()       rec.stop() → { files: { path: string | Uint8Array }, record, clips } | { empty: true }
             *   changes()    rec.changes → the rows so far, plain JSON (the page's own read). REJECTS when no Record is
             *                open (as stop() does). One act's rows: read the length before the act, slice after.
             */
            record: {
                start: function () {
                    return page.evaluate(_IN_PAGE_RECORD_START).then(_rethrowRefused).then(function (o) { return o.tick; });
                },
                film: function (opts) {
                    var begun = page.evaluate(_IN_PAGE_RECORD_FILM_BEGIN, opts);
                    gate.opened = begun.then(null, function () {});
                    return begun.then(function () { return page.evaluate(_IN_PAGE_RECORD_FILM_END); });
                },
                stop: function () {
                    return page.evaluate(_IN_PAGE_RECORD_STOP, { modules: modules }).then(_rethrowRefused).then(_folderFromPage);
                },
                changes: function () {
                    return page.evaluate(_IN_PAGE_RECORD_CHANGES);
                }
            },

            /**
             * Acts through the page's own doors (the writer's rows come from these, never from node):
             *   toSketch({ by })                 exp.toSketch
             *   setDeclared(name, patch, { by }) exp.setDeclared
             *   fork(name, Kind, { by })         exp.fork → { fork, file, from, files } (the files as text)
             *   placeDeclaredAt(name, [x, y, z?]) runner.placeDeclaredAt on the declared object of that name
             */
            act: {
                toSketch: function (opts) { return page.evaluate(_IN_PAGE_ACT, { door: 'toSketch', opts: opts }); },
                setDeclared: function (name, patch, opts) { return page.evaluate(_IN_PAGE_ACT, { door: 'setDeclared', name: name, patch: patch, opts: opts }); },
                fork: function (name, Kind, opts) { return page.evaluate(_IN_PAGE_ACT, { door: 'fork', name: name, Kind: Kind, opts: opts }); },
                placeDeclaredAt: function (name, point) { return page.evaluate(_IN_PAGE_ACT, { door: 'placeDeclaredAt', name: name, point: point }); }
            },

            /** Close the managed browser. Symmetric with open(), idempotent. */
            dispose: function () { return host.dispose(); }
        };
        return self;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    var FrqtlHostedEyes = { open: open };

    /**
     * writeRecordFolder(folder, dir) — write a Record folder (what `eyes.record.stop()` resolves) to `dir`, each path
     * verbatim: text as UTF-8, clip bytes as they are. The ONE node writer of the folder.
     * REFUSES (throws): an empty Record (`{ empty: true }` is a state with no folder); a `dir` that exists and is not
     * empty (a Record is never written over another); a path that is absolute or climbs out of `dir`.
     * @param {{ files: Object<string, string|Uint8Array> }} folder
     * @param {string} dir
     * @returns {string[]} the paths written, in the folder's order
     */
    function writeRecordFolder(folder, dir) {
        if (folder && folder.empty === true) {
            throw new Error('[FrqtlHostedEyes] writeRecordFolder: this Record is empty — no change and no clip — a state with no folder. (FAIL-LOUD.)');
        }
        if (!folder || !folder.files || typeof folder.files !== 'object') {
            throw new Error('[FrqtlHostedEyes] writeRecordFolder(folder, dir): folder is what eyes.record.stop() resolves, { files, record, clips }. (FAIL-LOUD.)');
        }
        if (typeof dir !== 'string' || !dir) { throw new Error('[FrqtlHostedEyes] writeRecordFolder(folder, dir): dir is a directory path. (FAIL-LOUD.)'); }
        const root = path.resolve(dir);
        if (fs.existsSync(root) && fs.readdirSync(root).length) {
            throw new Error('[FrqtlHostedEyes] writeRecordFolder: ' + root + ' exists and is not empty — a Record is never written over another; ' +
                'name a new directory. (FAIL-LOUD.)');
        }
        const paths = Object.keys(folder.files);
        for (const p of paths) {
            const at = path.resolve(root, p);
            if (path.isAbsolute(p) || (at !== root && !at.startsWith(root + path.sep))) {
                throw new Error('[FrqtlHostedEyes] writeRecordFolder: the folder path ' + JSON.stringify(p) + ' is not inside the folder. (FAIL-LOUD.)');
            }
            const v = folder.files[p];
            if (typeof v !== 'string' && !(v instanceof Uint8Array)) {
                throw new Error('[FrqtlHostedEyes] writeRecordFolder: ' + JSON.stringify(p) + ' is neither text nor bytes. (FAIL-LOUD.)');
            }
        }
        for (const p of paths) {
            const at = path.resolve(root, p);
            fs.mkdirSync(path.dirname(at), { recursive: true });
            fs.writeFileSync(at, folder.files[p]);
        }
        return paths;
    }

    export { FrqtlHostedEyes, writeRecordFolder };

