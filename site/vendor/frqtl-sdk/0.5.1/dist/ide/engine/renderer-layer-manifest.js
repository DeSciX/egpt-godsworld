/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module renderer-layer-manifest
 *
 * THE SINGLE SOURCE OF TRUTH for the RENDERER phase — which renderer-layer
 * scripts load, and in what order. Every surface that injects the FRQTL
 * renderer stack MUST derive its script list from this manifest.
 *
 * This is the RENDERER sibling of the two manifests that already own the other
 * two boot phases:
 *   ENGINE   — `shim-contract-manifest.js` (ENGINE_SHIM_CONTRACT_SCRIPTS)
 *   GAME     — `game-layer-manifest.js`    (GAME_LAYER_SCRIPTS)
 *   RENDERER — THIS FILE                   (RENDERER_LAYER_SCRIPTS)
 *
 * ## Consumers
 *
 * - `lib/frqtl/experiments/_shared/stack-boot.js` — injects the scripts in the
 *   browser via `_u(path)`. stack-boot is a classic injected script (not ESM)
 *   so it cannot import this module; its RENDERER array is an exact literal
 *   copy, and the parity test
 *   `lib/shim/engine/test/renderer-layer-manifest.test.mjs` enforces 1:1 order
 *   equality — drift is a CI failure (same discipline as the GAME array).
 *
 * - `sdk/frqtl-sdk/src/esm/index.js` — `buildScriptLists()` maps this
 *   manifest through `engineRouter.resolve` for `bootScene`/`bootRecipe` (the
 *   dist gallery + the packaged walk-through rungs). It previously carried a
 *   HAND-COPIED renderer list which silently dropped `RenderFamily.js` when
 *   that authority was added: every 3D scene in the dist then hit
 *   three-provider's fail-loud "canonical contract RenderFamily is unreachable"
 *   and rendered an empty canvas, while dev (stack-boot) was fine. That is the
 *   exact roster-mirror drift this manifest exists to make impossible.
 *
 * ## Load-order constraints (why the order below is not arbitrary)
 *
 * - `LightColor.js` is the single color source and heads the phase.
 * - `RenderShape.js` reads `window.FrameDataSchema` at module-eval time, so the
 *   whole RENDERER phase runs AFTER the ENGINE phase (stack-boot sequences
 *   `_seqPhase(ENGINE) → _seqPhase(RENDERER)`; see `shim-contract-manifest.js`).
 * - `RenderFamily.js` FERRIES `window.RenderShape` + `window.RenderMesh` at its
 *   own module-eval time and throws if either is absent — it MUST follow both.
 * - `renderCapabilities-common.js` MUST precede both providers (their
 *   `renderCapabilities()` resolve `window.RenderCapabilitiesCommon` at call
 *   time, and a page whose `onReady` calls `makeControlsForRenderSurface`
 *   invokes it immediately).
 * - `three-provider.js` FERRIES `window.RenderFamily` per-frame in its tick
 *   loop and fails loud when it is missing — it MUST follow `RenderFamily.js`.
 *
 * ## NOT in this list (deliberately)
 *
 * - `experiments/_shared/render-boot.js` — the FAIL-LOUD renderer SELECTION
 *   step, injected after this phase (the analogue of `engine-boot.js`).
 * - `assets/vendor/three.min.js` — loaded LAZILY, only when the three renderer
 *   is actually selected (most 2D scenes never pay for it).
 * - `assets/vendor/p5.min.js` — deferred until engine AND renderer are live and the
 *   stack is complete (stack-boot's §THE ONE BOOT DANCE, window._egptStartSketch).
 *
 * ## Updating this manifest
 *
 * 1. Add / remove entries HERE only.
 * 2. Mirror the change into stack-boot.js's RENDERER literal.
 * 3. `node --test lib/shim/engine/test/renderer-layer-manifest.test.mjs` gates
 *    both the literal copy and the ESM entry's derivation.
 */

'use strict';

/**
 * Ordered frqtl-relative paths for the RENDERER phase.
 * Each consumer maps these paths through its own URL resolver
 * (`_u()` in stack-boot, `engineRouter.resolve()` in the ESM entry).
 * @type {string[]}
 */
export var RENDERER_LAYER_SCRIPTS = [
    // THE DISPLAY SLOT — the ONE answer to "which provider owns the display"
    // (RENDERER_CONTRACT §9: the display provider is boot-fixed, observers are live).
    // It HEADS the phase because render-boot.js — which runs immediately after this
    // phase and registers the booted provider INTO it — is its one writer, and the
    // three.js branch registers asynchronously later still. Replaces the bare
    // `window._egptActiveRenderer` global, which is DELETED.
    'compat/renderer/display-slot.js',
    // The ONE color source (lives under objects/ but is a renderer-phase dep).
    'objects/constants/LightColor.js',
    // Shape / mesh decode authorities — before RenderFamily and both providers.
    'compat/renderer/RenderShape.js',
    'compat/renderer/RenderMesh.js',
    // Per-frame render-family decode; COMPOSES the two above (ferried at
    // module-eval time) — MUST come after both, before the providers.
    'compat/renderer/RenderFamily.js',
    'compat/renderer/FieldBuilder.js',
    // The CODE OWNER of the RendererProvider method lists (required/optional split
    // + validateRendererProvider). A dependency, not a provider: it installs its
    // tables on `window` and nothing else reads it at module-eval time, so it sits
    // with the other shared owners, before both providers.
    'compat/renderer/renderer-provider-contract.js',
    // Shared universal-knob + FX filter-loop owner — before both providers.
    'compat/renderer/renderCapabilities-common.js',
    // Shared pixel-readback + still-bag owner for the OPTIONAL captureStill()
    // capability (the `composite` stage tap). Both providers resolve
    // `window.CaptureStillCommon` through a named FAIL-LOUD guard at CALL time,
    // so it MUST precede them for a page whose onReady captures immediately —
    // the same "shared owner before both providers" rule as the line above.
    'compat/renderer/captureStill-common.js',
    // THE 2D camera map (pan/zoom) — the `affine2d` projection's one authority, consumed by
    // p5-provider (draw transform + screenToWorld + the camera handle) AND by unprojectStill
    // (the offline map). Both resolve it at CALL time, but a page whose onReady pans or picks
    // needs it present, so it precedes them — same rule as the shared owners above.
    'compat/renderer/camera2d-geometry.js',
    // THE point-shape authority for the pose bag ({x,y,z} AND [x,y,z], one identical throw).
    // BOTH camera handles ferry every point-valued field through it, so it precedes both
    // providers — same "shared owner before both providers" rule as the entries above.
    'compat/renderer/orbit-bag.js',
    // THE LO drawn-center authority (where an LO rect's box is drawn). The three provider places
    // meshes through it and the game layer's FrqtlApp aims its pick at it, so it precedes both.
    'compat/renderer/lo-drawn-center.js',
    'compat/renderer/providers/p5-provider.js',
    // THE pixel→universe mapping authority for a captured still. It resolves
    // `window.ThreeCameraGeometry` LAZILY (only the perspective branch needs it), so
    // it has no eval-time ordering constraint — but it MUST follow the geometry
    // authority it ferries, and placing it here keeps the "one mapping authority"
    // block together. Consumed by analysis/harness code, never by the tick loop.
    'compat/renderer/unprojectStill.js',
    // The three camera's DECLARATIVE contract (view presets + pose-axis
    // descriptors) — pure data, no THREE. three-provider.js resolves
    // `window.ThreeCameraContract` FAIL-LOUD when getCameraControl() builds the
    // handle, so it MUST precede the provider.
    'compat/renderer/providers/three-camera-contract.js',
    // The three camera's PURE GEOMETRY authority (orbit bag ⇄ camera basis, the
    // screen-relative rotate/translate primitives, the picking-ray math) — also
    // THREE-free. three-provider.js resolves `window.ThreeCameraGeometry`
    // FAIL-LOUD from _applyOrbit onward, so it MUST precede the provider too.
    'compat/renderer/providers/three-camera-geometry.js',
    // The god-rays layer (what the rays are computed from + the march passes) — THREE-free at
    // load; three-provider.js resolves `window.GodraysLayer` FAIL-LOUD, so it precedes it.
    'compat/renderer/providers/godrays-layer.js',
    'compat/renderer/providers/three-provider.js',
    'compat/renderer/Filters.js'
];
