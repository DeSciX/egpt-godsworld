/* Copyright 2023-2026 by Essam Abadir */

/**
 * host-view-module.mjs — the ONE way a test loads site/app-assets/maxi-host-view.js in node: through the site's own import
 * map (site-import-map.mjs) with a stand-in window, so the module's one top-level declaration meets no SDK (sdk-absent)
 * and logs nothing. Returns the module (its exported rules and declareSiteHostView); cached per process.
 */

let MOD;
export async function loadHostViewModule() {
    if (MOD) { return MOD; }
    await import('./site-import-map.mjs');
    const prev = globalThis.window;
    globalThis.window = { DeSciX: undefined, document: { documentElement: { dataset: {} } }, matchMedia: () => ({ matches: false }) };
    const realInfo = console.info;
    console.info = () => {};
    try {
        MOD = await import('../../site/app-assets/maxi-host-view.js');
        const first = await MOD.hostView;
        if (first.record !== 'sdk-absent') { throw new Error('maxi-host-view.js under the stand-in window recorded ' + first.record + ', not sdk-absent'); }
    } finally {
        console.info = realInfo;
        globalThis.window = prev;
    }
    return MOD;
}
