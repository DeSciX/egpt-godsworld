/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim — the unified shim router (was lib/common).
 *
 * ESM barrel: re-exports all named exports. A missing import is a hard
 * FAIL-LOUD load error — no window.Common* ambient globals.
 *
 * Usage (under vite with alias 'lib' → repo-root/lib):
 *   import { Bus, Runtime, EXPERIMENTS, engineRouter } from 'lib/shim';
 *
 * Usage (direct relative path):
 *   import { Bus } from '../../lib/shim/index.js';
 */

export { Bus }           from './bus.js';
export { Runtime }       from './runtime/index.js';
export { EXPERIMENTS, EXPERIMENT_TIERS, experimentById, experimentIs3D,
         isPublicExperiment, publicExperiments,
         internalExperiments } from './registry/experiments.js';
export { WALKTHROUGH, walkthroughIs3D, walkthroughModes, walkthroughGroup,
         walkthroughById,
         FIRST_CONTACT_WALKTHROUGH_ID,
         defaultWalkthroughModeId, effectiveRenderState } from './registry/walkthrough.js';
export { loadSceneSource, scenePath, EMPTY_SCENE } from './registry/scene-source.js';
// The host-side experiment-iframe guard (the false-200 trap). Exported from the
// barrel so every host that frames an experiment page (lib/features/ide's GYM)
// asserts against the SAME contract.
export { EXPERIMENT_PAGE_MARKERS, HOST_SHELL_ROOT_SELECTOR, FRAME_VERDICTS,
         DEFAULT_FRAME_TIMEOUT_MS, classifyFrameProbe, probeExperimentFrame,
         paintFrameGuardOverlay, watchExperimentFrame } from './experiment-frame/index.js';
export { engineRouter, DEV_CORE_PROFILE, DIST_PROFILE } from './engine/router.js';
// Math backend registry — re-exported so lib/features can import from the shim
// barrel (the sanctioned route) without reaching past the shim into lib/egpt directly.
// Module identity is preserved: both the barrel re-export and any direct import of
// MathBackendRegistry.js resolve to the SAME singleton because ESM caches by
// canonical URL — there is only one MathBackendRegistry instance. The registry
// module has zero imports; the JS reference core never enters this graph.
export { MathBackendRegistry, MathBackendNotAvailableError } from '../egpt/js/model/backend/MathBackendRegistry.js';
// Notebook spine (WS-NOTEBOOK-A1): the native format parser/serializer and the
// per-notebook kernel. The kernel calls Runtime.runCell directly (no Bus
// executor). Consumers (the A2 notebook pane) import these from the barrel.
export { parse, serialize, normalize } from './notebook/format.js';
export { NotebookKernel, NOTEBOOK_CELL_STATUS } from './notebook/kernel.js';
// Cell-as-module resolver (WS-NOTEBOOK-IMPORT B2) — the host-neutral in-memory
// blob closure logic. Re-exported so tests + any host can build the closure
// (Runtime injects the browser blob minter; the resolver itself is DOM-free and
// must NOT assume a pane exists — model-gate ruling 6).
export {
    canonKey, resolveRelativeKey, hasImport, splitImportsAndBody,
    rewriteRelativeToSiblingBlobs, buildModuleClosure, compileEntryModuleSource
} from './notebook/module-resolver.js';
// Notebook webview-realm model (WS-NOTEBOOK-REALM): the FOURTH BYO pluggable
// surface. ONE registry authority + the frozen view-handle contract + the in-app
// transport (same-origin direct fast path). A realm pre-load
// is an above-the-shim renderer env; the frqtl pre-load co-locates the engine.
export * as RealmRegistry from './notebook/realm-registry.js';
export { makeViewHandle, isViewHandle, assertSerializable } from './notebook/view-handle.js';
export { inAppTransport } from './notebook/realm-transport.js';
// Realm import map — buildImportMap (vendor manifest → `{ imports }`), buildRealmImportMap
// (vendor + @frqtl/setups, through ONE router) and spliceRealmImportMap (the ONE splice the
// served hosts, lib/server/realm-html.js, and the static bake, apps/ide/vite.config.js, both
// call). PURE, DOM-free.
export { buildImportMap, buildRealmImportMap, spliceRealmImportMap } from './notebook/vendor-importmap.js';
// Canonical setup-factory bare-specifier surface — the manifest and its import-map fragment
// (merged by buildRealmImportMap above). PURE, DOM-free.
export { buildFrqtlSetupsImportMap, FRQTL_SETUPS_MANIFEST } from './notebook/frqtl-setups-importmap.js';
