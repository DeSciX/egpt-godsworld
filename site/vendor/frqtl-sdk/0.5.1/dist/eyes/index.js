/* Copyright 2023-2026 by Essam Abadir */

/**
 * eyes/index.js — the HOSTED EYES entry for `@descix/frqtl-sdk` (`exports["./eyes"]`).
 *
 * Ships at `dist/eyes/index.js`. It is a SEPARATE entry from the core barrel for exactly one
 * reason: it is the only surface in this package with a heavyweight runtime dependency.
 *
 * ── Why the dependency is REAL, pinned, and lives HERE ───────────────────────
 *
 * `composite` is the render stack's own output. A node raster backend that RE-DREW the
 * scene would show an agent a different picture than the end user sees — which is the whole
 * failure the hosted design exists to avoid (a god-rays shader turns a bunch of particles
 * into A SUN; the renderer and its filters are part of the experiment, not decoration). So
 * the eyes look through the SAME stack, in a real browser, and the browser is therefore not
 * an optional extra — it is THE default stack this package ships for anyone who does not
 * BYO one.
 *
 * That is why `playwright` is a real `dependencies` entry, PINNED to an exact version (a
 * range would let a browser build drift under a published corpus, and the raster path is
 * provenance — see `build.gl`), and NOT `optionalDependencies`: an optional dependency is a
 * surface that sometimes exists, which is a compat fence wearing a package-manager hat.
 * Keeping it off the `.` entry keeps the core install exactly as light as it
 * was: a consumer who never imports `./eyes` never loads it.
 *
 * The BYO seam is `browserType`: pass your own Playwright browser type (or a compatible
 * driver) and this entry gets out of the way. The library layer
 * (`lib/frqtl/objects/instruments/hosted-eyes.js`) REQUIRES it and declares no dependency of
 * its own — the dependency is declared exactly once, by the entry that ships it.
 *
 * The picture is the scene SOURCE plus the `renderState` you hand it — nothing else. A
 * walk-through rung's look (render rows, filters, camera) lives on its registry row, not in its
 * sketch: pass `effectiveRenderState(rung, mode)` as `renderState` to record the rung as the GYM
 * shows it; the sketch alone records its PLAIN render.
 *
 * @example
 *   const { openHostedEyes } = require('@descix/frqtl-sdk/eyes');
 *   const eyes = await openHostedEyes({
 *       sceneRecord: { seed: 42, sourceRef: 'my-scene', physicsW: 600, physicsH: 400 },
 *       sceneSource: { kind: 'module', source: buildExperimentSource },
 *       pageUrl: 'http://localhost:8080/experiments/empty/index.html'
 *   });
 *   try {
 *       await eyes.driveToTick(300);
 *       const still = await eyes.vision.getStill('composite');   // the SAME normalized bag
 *       eyes.saveStill(still, 'out.png');                        // …and the picture, in one line
 *   } finally { await eyes.dispose(); }
 *
 * `FrqtlVision` is re-exported for the encoder itself (`FrqtlVision.toPNG(still)` → PNG
 * bytes) — the node half of the one-encoder-per-host pair. It is FERRIED FROM THE CORE
 * BARREL's node condition rather than deep-required, because that barrel IS the node boot: it publishes the
 * two call-time contracts (`RenderStages`, `FieldBuilder`) the face resolves from globals. A
 * deep require would hand back the same object with its contracts unpublished — a fail-loud
 * for a consumer who encodes before opening a handle.
 */

'use strict';

// ── The WRONG-HOST DOOR — mirror image of src/boot/node-refusal.js ──────────
//
// `./eyes` is host-named: it DRIVES a browser from node. Loaded IN a page it can only
// fail, and before this guard existed it failed ACCIDENTALLY — the first thing the module
// body did was resolve `playwright`, so a DOM host got "the pinned playwright dependency
// is not installed", blaming the install and naming the wrong door. One pattern, two
// instances, deliberately the same voice: the wrong host gets a THROWN error naming the
// RIGHT door, at module scope, BEFORE any dependency resolve, so the host message always
// wins. Capability-detected (`document`), never a user-agent or bundler flag.
if (typeof document !== 'undefined') {
    throw new Error(
        '[frqtl-sdk/eyes] `@descix/frqtl-sdk/eyes` is a NODE-HOST surface and this is a browser.\n' +
        '\n' +
        'openHostedEyes LAUNCHES a real browser (playwright) and drives a page from outside it —\n' +
        'there is nothing for it to launch from inside one.\n' +
        '\n' +
        'THE RIGHT DOOR IN A PAGE is the parity core:  import { FrqtlCapture, FrqtlVision } from\n' +
        "'@descix/frqtl-sdk'  — the in-page capture tap, already looking through THIS page's own\n" +
        'render stack, which is the same picture the hosted eyes go to a browser to obtain.\n' +
        'To boot a scene into the page first, use  @descix/frqtl-sdk/boot.\n' +
        '\n' +
        '(FAIL-LOUD. This is a refusal, not a missing feature — the composite you want is already\n' +
        'in front of you, and a silent no-op here would hand you an eye that never opens.)'
    );
}

var HostedEyes  = require('../node/objects/instruments/hosted-eyes.js');
var FrqtlVision = require('../node/index.js').FrqtlVision;

/**
 * The packaged default stack. FAIL-LOUD naming the pinned dependency — never a silent
 * degradation to "no composite for you", which is how a corpus quietly loses its pictures.
 * @private
 */
var _memoBrowserType = null;
function _defaultBrowserType() {
    if (_memoBrowserType) { return _memoBrowserType; }
    var pw;
    try { pw = require('playwright'); }
    catch (e) {
        throw new Error('[frqtl-sdk/eyes] the pinned `playwright` dependency is not installed ' +
            '(' + (e && e.message) + '). It is a REAL dependency of this package, not an ' +
            'optional one: the hosted eyes look through a real browser because that is the only ' +
            'way an agent sees the real render stack\'s picture. Reinstall the package, or pass your ' +
            'own `browserType` (the BYO seam). (FAIL-LOUD.)');
    }
    if (!pw || !pw.chromium) {
        throw new Error('[frqtl-sdk/eyes] `playwright` resolved but exposes no `chromium` ' +
            'browser type. (FAIL-LOUD.)');
    }
    _memoBrowserType = pw.chromium;
    return _memoBrowserType;
}

/**
 * openHostedEyes(opts) → Promise<handle>
 *
 * Pure forwarding plus the default stack: every argument, every rule and every fail-loud
 * message belongs to `lib/frqtl/objects/instruments/hosted-eyes.js` (see its docstring for
 * the full contract — the REGENERATE-grade gate, the declared `renderState`, the exact-tick
 * drive, the pose authority and the dispose-symmetric lifecycle). This entry adds no options of its own; an entry that
 * grew its own knobs would be a second authority over the host.
 *
 * @param {object} opts — see `HostedEyes.open`. `browserType` defaults to the packaged
 *   Playwright chromium.
 * @returns {Promise<object>} the hosted-eyes handle.
 */
function openHostedEyes(opts) {
    opts = opts || {};
    var bag = Object.assign({}, opts);
    if (!bag.browserType) {
        // LAZY on purpose: `open()` validates the REQUEST (a regenerable scene, a page URL)
        // before it needs a browser, and a caller with a malformed request deserves to hear
        // about the request first. Resolving the default eagerly here would put a missing
        // install in front of every other diagnosis.
        Object.defineProperty(bag, 'browserType', {
            get: _defaultBrowserType, enumerable: true, configurable: true
        });
    }
    return HostedEyes.open(bag);
}

module.exports = { openHostedEyes: openHostedEyes, FrqtlVision: FrqtlVision };
