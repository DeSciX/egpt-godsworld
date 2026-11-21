/* Copyright 2023-2026 by Essam Abadir */

/**
 * package-core.js — the members BOTH package entries carry beside the parts barrel and their own host
 * door (frqtl/boot-entry.js for @descix/frqtl-web, frqtl/node-entry.js for @descix/frqtl-node): the
 * engine accessors, the capture contracts and the renderer contract's validator. One module, so the two
 * packages' `.` cannot disagree on them.
 *
 *   engine, engineState                 the booted EngineHandle / the boot state (compat/engine.js)
 *   FrqtlCapture                        the render-pipeline tap (objects/instruments/capture.js)
 *   RenderStages, FieldBuilder          the two contracts the instrument reads
 *   CaptureEnvelope                     the transport contract a recording is validated against
 *   validateRendererProvider, RENDERER_PROVIDER_REQUIRED, RENDERER_PROVIDER_OPTIONAL
 *                                       a BYO renderer's design aid (reports, never throws)
 */

export { engine, engineState } from './compat/engine.js';
export { FrqtlCapture } from './objects/instruments/capture.js';
export * as RenderStages from '../shim/render/render-stages.js';
export { FieldBuilder } from './compat/renderer/FieldBuilder.js';
export * as CaptureEnvelope from '../shim/render/capture-envelope.js';
export { validateRendererProvider, RENDERER_PROVIDER_REQUIRED, RENDERER_PROVIDER_OPTIONAL }
    from './compat/renderer/renderer-provider-contract.js';
