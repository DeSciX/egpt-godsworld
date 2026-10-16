/* Copyright 2023-2026 by Essam Abadir */

/**
 * node/index.js — the NODE CONDITION TARGET of `@descix/frqtl-sdk`'s `.` specifier.
 *
 * `.` is THE PARITY CORE: one specifier, two condition targets (this one for node,
 * `dist/browser/index.js` for everything else), ONE symbol contract. The two targets are
 * REQUIRED to export an identical symbol set, and that requirement is enforced — not
 * documented — by `scripts/verify-publish-surface.mjs` diffing both key sets against the
 * ONE owner table, `lib/frqtl/objects/public-parts.js::PUBLIC_PARTS`.
 *
 * Ships at `dist/node/index.js` (copied verbatim by build.js's "Node subpath" step).
 * Every file this module requires is copied INTO `dist/node/` at build time —
 * `lib/frqtl/...` source paths are never referenced from the published package. build.js
 * mirrors the EXACT relative-directory depth `lib/frqtl/compat/egpt-engine.js` (+ its
 * `providers/` requires) and `lib/frqtl/objects/**` already assume via their own
 * `__dirname`-relative `require()` calls — so those files are copied UNMODIFIED, only
 * their container directory is rebased. See build.js's own "Node subpath" step comment.
 *
 * ── NO HAND-TYPED PART LIST ─────────────────────────────────────────────────
 *
 * The parts half of the surface is ENUMERATED off `PUBLIC_PARTS` below. A hand-typed list
 * here would be a second derivation of the same fact as the browser barrel's list, and the
 * copies would disagree silently — a part that imports in node and is `undefined` in a
 * page. Adding a part to the published surface is a one-line change to the ROSTER, never
 * an edit here. A roster row whose symbol resolves `undefined` THROWS at require time,
 * naming the row and the resolved path — never a silently missing export.
 *
 * The package ships NO `bin`: this module IS the Node surface. Acceptance is VISUAL — a
 * static numeric check is a design aid in your own harness, never the instrument that says
 * a scene is right. `validateRendererProvider` is that kind of aid for a BYO renderer: it
 * reports, it never throws — the CALLER decides whether a missing method is fatal.
 *
 * ── HEADLESS EYES (V2) ──────────────────────────────────────────────────────
 *
 * `FrqtlCapture` (the render-pipeline tap MECHANISM) and `FrqtlVision` (its ergonomic face)
 * are on this barrel because eyes are not a browser privilege: the `tick` and `field` stages
 * are backend-independent, need no canvas and no DOM, and a node process that can run a
 * world should be able to LOOK at it. Reaching them by deep-requiring `lib/frqtl/...` is NOT
 * a sanctioned path — this barrel is the surface.
 *
 * `RenderStages` and `FieldBuilder` are re-exported for the same reason the page publishes
 * them on `window`: they are the two contracts the instrument resolves at CALL time, and a
 * consumer inspecting a still's stage vocabulary or field options should read the owner,
 * never a copy.
 *
 * `composite` in node REJECTS with the stage-known-but-not-tappable error (naming what is
 * missing) until a raster provider exists — never a blank still, which for a corpus is
 * fabricated evidence. The hosted composite is `require('@descix/frqtl-sdk/eyes')`.
 *
 * @example
 *   const { EGPTEngine, setupDoubleSlit } = require('@descix/frqtl-sdk');
 *   const handle = await EGPTEngine.create({ backend: 'wasm' });
 *   const universe = handle.EGPTUniverse.create({ rect: { left: 0, top: 0, w: 600, h: 600 }, seed: 42 });
 *   const { detectorWall } = setupDoubleSlit(universe, { wavelength: 64 });
 *
 * @example <caption>The extension point — an op-program part, zero engine code</caption>
 *   const { LargeObject, Rectangle, CollisionActions } = require('@descix/frqtl-sdk');
 *   const rect = new Rectangle(100, 200, 40, 8);
 *   const mirror = new LargeObject(universe, rect, 'wall',
 *       [{ action: CollisionActions.BOUNCE }], 'my-mirror');
 *
 * @example <caption>Headless eyes — a rig looking at its own scene</caption>
 *   const { FrqtlCapture, FrqtlVision } = require('@descix/frqtl-sdk');
 *   let last = null;
 *   const eye = FrqtlCapture.create(
 *       { get lastTickData() { return last; } },      // the loop
 *       () => null,                                   // no display provider
 *       { seed: 42, rect: universe.universe_rect },   // the scene identity
 *       () => ({})                                    // the live render options
 *   );
 *   for (let t = 0; t < 200; t++) { last = universe.doTick(); }
 *   const still = await FrqtlVision.attach(eye).getStill('field');   // r8 heightfield
 */

'use strict';

// ── The NODE BOOT ───────────────────────────────────────────────────────────
// The capture instrument resolves its two upward contracts at CALL time from
// the host's globals — that is what keeps it DOM-free and arrow-free. A page's
// boot publishes them on `window`; in node THIS module is the boot, so it
// publishes the same two names on `globalThis` before the instrument is
// required. Same seam, different host — never a second resolution mechanism.
//
// This block MUST stay ahead of every part require below: the roster loop pulls in
// FrqtlVision, whose module-eval reaches for these two names.
var RenderStages = require('../shim/render/render-stages.js');
var FieldBuilder = require('./compat/renderer/FieldBuilder.js').FieldBuilder;
globalThis.RenderStages = RenderStages;
globalThis.FieldBuilder = FieldBuilder;
// RenderStages.SCENE_SURFACE_ATTR re-exports the RendererProvider contract's marker name and
// resolves its owner from this same host-global seam.
globalThis.RendererProviderContract = require('./compat/renderer/renderer-provider-contract.js');

// ── The fixed (non-roster) members ──────────────────────────────────────────
var EGPTEngine   = require('./compat/egpt-engine.js');
var FrqtlCapture = require('./objects/instruments/capture.js');
var PUBLIC_PARTS = require('./objects/public-parts.js').PUBLIC_PARTS;
var CaptureEnvelope = require('../shim/render/capture-envelope.js');
var rendererContract = require('./compat/renderer/renderer-provider-contract.js');

var api = {
    EGPTEngine: EGPTEngine,
    FrqtlCapture: FrqtlCapture,
    RenderStages: RenderStages,
    FieldBuilder: FieldBuilder,
    // The TRANSPORT contract: `FrqtlVision.record` resolves `CaptureEnvelope.videoEnvelope`, so a
    // consumer validates a recording against the owner, never a copy of its shape.
    CaptureEnvelope: CaptureEnvelope,
    validateRendererProvider: rendererContract.validateRendererProvider,
    RENDERER_PROVIDER_REQUIRED: rendererContract.RENDERER_PROVIDER_REQUIRED,
    RENDERER_PROVIDER_OPTIONAL: rendererContract.RENDERER_PROVIDER_OPTIONAL,
    // The roster itself is public: a consumer (or a tool) that wants to know what the
    // barrel promises reads the owner table, never a copy of it.
    PUBLIC_PARTS: PUBLIC_PARTS
};

// ── The parts half — ENUMERATED off the roster, never hand-typed ────────────
for (var i = 0; i < PUBLIC_PARTS.length; i++) {
    var entry = PUBLIC_PARTS[i];
    var rel = './objects/' + entry.module;
    var mod = require(rel);
    var symbol = entry.key ? mod[entry.key] : mod;
    if (symbol === undefined) {
        throw new Error(
            '[frqtl-sdk] PUBLIC_PARTS roster entry "' + entry.name + '" resolved to undefined. ' +
            'Resolved path: ' + rel + '  (key: ' + (entry.key === null ? 'null — module.exports IS the symbol' : JSON.stringify(entry.key)) + '). ' +
            'Either the roster row in lib/frqtl/objects/public-parts.js names the wrong module/key, ' +
            'or build.js did not copy that file into dist/node/objects/. FAIL-LOUD: a published ' +
            'barrel never ships a silently missing export.'
        );
    }
    api[entry.name] = symbol;
}

// Dynamic on purpose (the roster is the owner). ESM named-import interop for this bag is
// solved at the EXPORTS-MAP level by the build-time-generated `dist/node/index.mjs`
// wrapper — generated FROM the roster, so it is not a hand mirror. See build.js.
module.exports = api;
