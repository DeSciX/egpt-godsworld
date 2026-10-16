/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module shim-contract-manifest
 *
 * THE SINGLE SOURCE OF TRUTH for which `lib/shim/*` CONTRACT scripts load in
 * `stack-boot.js`'s ENGINE array, and in what order. Mirrors the
 * `game-layer-manifest.js` pattern (same directory) — the manifest is the
 * canonical list; `stack-boot.js`'s literal ENGINE array is a copy whose
 * order/presence is enforced by the parity test
 * `lib/shim/engine/test/shim-contract-manifest.test.mjs`.
 *
 * ## Why these, in this order
 *
 * - `expr/ast-schema.js` — the op-program AST node/op-kind vocabulary.
 *   Required by `actionCompiler.js` (GAME layer) to compile `CollisionActions`
 *   → op-programs. No internal ordering constraint among the six (first here
 *   only because it landed first, historically).
 * - `frame-data/index.js` — the data-bubble + render-intent VALUE contract
 *   (`RENDER_INTENT_KEYS`/`VALUES`). MUST load before `RenderShape.js` (in the
 *   RENDERER array, which only starts once the ENGINE phase's `_seqPhase` promise
 *   chain fully resolves — see `docs/internal/engine/ENGINE_CONTRACT.md` / stack-boot.js's own
 *   `_seqPhase(ENGINE).then(() => _seqPhase(RENDERER))` composition) — `RenderShape.js`
 *   FERRIES the `render.shape` value set from it, no second source.
 * - `page-params/index.js` — the URL-param routing-table contract (WS
 *   gym-controls-as-sugar Bite 3). MUST load before `engine-boot.js`/
 *   `render-boot.js` (injected right after the ENGINE array resolves) and
 *   before `fx-experiment.js` (a `data-page-scripts` entry, loaded later
 *   still) — all three live-import their URL-param KEY NAMEs from
 *   `window.PageParams.KEYS`.
 * - `field-descriptor/index.js` — the shared field-SHAPE vocabulary contract
 *   (WS Studio Controls Realignment §7 r2 CEO call C1). MUST load before
 *   `objects/schema/index.js` (a GAME-layer file, loaded later) — that file's
 *   own load-time drift assertion reads `FieldDescriptorSchema.FIELD_TYPES`
 *   eval-time. No ordering dependency on the other six.
 * - `controls/index.js` then `controls/registry.js` — the control-descriptor
 *   contract (WS gym-controls-as-sugar Bite 1) + its runtime instance
 *   registry. ORDER MATTERS here specifically: `registry.js`'s
 *   `_getControlsSchema()` guard reads `window.ControlsSchema`, installed by
 *   `index.js` — the SAME "constant/schema before the thing that reads it"
 *   constraint as game-layer-manifest.js's Box-before-OvenBox rule.
 * - `rpc/index.js` — the request/response `call()` primitive (WS gym-controls-
 *   as-sugar Bite 3 Stage 2 fix-loop, architect gate-5 charter). Publishes
 *   `window.ShimRpc`. No ordering dependency on the other five; consumed by
 *   page-context sugar (`lib/frqtl/objects/objects/frqtl-controls-panel.js`)
 *   via a named FAIL-LOUD guard — never a relative ES import (the exact
 *   mount-boundary 404 class this primitive's extraction fixed).
 * - `render/heat-colormap.js` — the ONE count→intensity heat ramp. Publishes
 *   `window.HeatColormap`. Consumed BELOW the shim by the GraphingDetectorWall
 *   heat painter (GAME layer, loaded later) and ABOVE it by
 *   `lib/components/notebook-pane/realm-chart.js` — one ramp for the in-scene
 *   wall heatmap and the DOM topology chart. No ordering dependency.
 * - `render/render-stages.js` — the ORDERED render-pipeline stage vocabulary
 *   (`RENDER_STAGES` + the tap-result bag normalizer). Publishes
 *   `window.RenderStages`. The peer of `frame-data/index.js`'s
 *   `RENDER_INTENT_KEYS`: the shim owns the cross-layer vocabulary, consumers
 *   FERRY it. Consumed BELOW the shim by `objects/instruments/capture.js` (the
 *   tap MECHANISM) and `objects/objects/FrqtlVision.js` (the sugar), both GAME
 *   layer and both through a named FAIL-LOUD guard at CALL time — so there is
 *   no eval-time ordering dependency on the other shim entries.
 * - `render/capture-envelope.js` — the TRANSPORT contract of a capture (the still and video
 *   envelopes, `ENCODERS`, `ENCODED_KEYS`). Publishes `window.CaptureEnvelope`. Consumed by
 *   `FrqtlVision.record` in the page, which returns `videoEnvelope`; resolves `RenderStages`
 *   at CALL time, so no eval-time ordering dependency.
 * - `render/sun-look.js` — the sun's render-option bag. Publishes `globalThis.SunLook`.
 * - `render-state/apply.js` — the renderState contract and its ONE apply procedure
 *   (`RenderState.apply(runner, bag, env)`). Publishes `globalThis.RenderState`; the blank page's
 *   `FrqtlPage.applyRenderState` and the sdk bundle's `bootRecipe` call it in the page. No
 *   eval-time ordering dependency (it reads the runner and env only when called).
 *
 * ## Updating this manifest
 *
 * 1. Add / remove / reorder entries here ONLY.
 * 2. Keep the parity test passing (`node --test
 *    lib/shim/engine/test/shim-contract-manifest.test.mjs`).
 * 3. The parity test catches any divergence in stack-boot.js's ENGINE literal.
 */

'use strict';

/**
 * Ordered ABSOLUTE `/lib/shim/...` paths for the shim-contract scripts that
 * ride inside stack-boot.js's ENGINE array (interspersed among the engine/
 * compat scripts — this manifest lists ONLY the `/lib/shim/` subset, in the
 * relative order they must appear).
 * @type {string[]}
 */
export var ENGINE_SHIM_CONTRACT_SCRIPTS = [
    '/lib/shim/expr/ast-schema.js',
    '/lib/shim/frame-data/index.js',
    '/lib/shim/page-params/index.js',
    '/lib/shim/field-descriptor/index.js',
    '/lib/shim/controls/index.js',
    '/lib/shim/controls/registry.js',
    '/lib/shim/rpc/index.js',
    '/lib/shim/render/heat-colormap.js',
    '/lib/shim/render/render-stages.js',
    '/lib/shim/render/capture-envelope.js',
    '/lib/shim/render/sun-look.js',
    '/lib/shim/render-state/apply.js'
];

/**
 * The ONE classic-script sequencer every boot bootstraps before it injects any list above
 * (lib/shim/engine/script-sequencer.js), router-relative. NOT a member of
 * ENGINE_SHIM_CONTRACT_SCRIPTS: that array IS the ENGINE injection list, and this file is what
 * injects it. sdk/frqtl-sdk/src/esm/index.js resolves it through engineRouter; stack-boot.js
 * carries a literal copy (parity: lib/shim/engine/test/sequencer-owner-tombstone.test.mjs).
 */
export var BOOT_SEQUENCER_SCRIPT = 'shim/engine/script-sequencer.js';
