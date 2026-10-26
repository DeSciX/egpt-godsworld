/* Copyright 2023-2026 by Essam Abadir */

/**
 * index.js — the published door to the host-view declarer: `@descix/frqtl-web/host-view` and
 * `@descix/frqtl-node/host-view`. Exactly the names below, re-exported from THE declarer (host-view.js); its
 * static-build vocabulary (HOST_FRONT_PAGE) stays FRAQTL's own. The host-provided attribute a publisher reads is
 * published by `./site-graph` (site-graph.js::HOST_PROVIDED_ATTR).
 *
 *   HOST_VIEW_EXPORTS   the published names (the parity gate holds both packages' ./host-view to this table)
 *
 * A consuming app calls `declareHostView({ sdk: window.DeSciX, mode, fallback? })` once, under its own policy, and
 * reads the outcome off `document.documentElement.dataset.descixView` (a HOST_VIEW_OUTCOMES row). HOST_SDK_SCRIPT is
 * the publisher-provided SDK file the app vendors beside its page.
 */

/** The names `./host-view` publishes. */
export const HOST_VIEW_EXPORTS = Object.freeze(['declareHostView', 'HOST_VIEW_OUTCOMES', 'CONTRACT_VIOLATIONS', 'HOST_SDK_SCRIPT']);

export { declareHostView, HOST_VIEW_OUTCOMES, CONTRACT_VIOLATIONS, HOST_SDK_SCRIPT } from './host-view.js';
