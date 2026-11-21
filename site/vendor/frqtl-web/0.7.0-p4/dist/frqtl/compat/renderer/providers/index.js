/* Copyright 2023-2026 by Essam Abadir */

/**
 * providers/index.js — THE renderer registry: every built-in RendererProvider by its boot name.
 *
 *   RENDERER_PROVIDERS[name] = { makeProvider(cfg) → provider, renderCapabilities() → descriptors }
 *
 * The boot module selects a provider by name from this table (`?renderer=` / `bootRealm({ renderer })`);
 * `RenderCapabilitiesCommon.knownRenderCapabilityNames(RENDERER_PROVIDERS)` is the "known" set saved
 * render rows are partitioned against. A BYO renderer is handed to the boot module as an instance; it
 * never joins this table.
 *
 * Zero physics: a provider reads TickData and draws.
 */

import { makeP5Provider, _renderCapabilitiesP5 } from './p5-provider.js';
import { makeThreeProvider, _renderCapabilitiesThree } from './three-provider.js';

export const RENDERER_PROVIDERS = Object.freeze({
    p5: Object.freeze({ makeProvider: makeP5Provider, renderCapabilities: _renderCapabilitiesP5 }),
    three: Object.freeze({ makeProvider: makeThreeProvider, renderCapabilities: _renderCapabilitiesThree })
});
