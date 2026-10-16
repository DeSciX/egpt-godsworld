/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-scene.js — ONE scene per document (scene.html).
 *
 * The lab (app.html) hosts each loaded scene in its own iframe of this page and replaces the frame to
 * load another: the SDK holds one engine stack per document (there is no dispose()), and a scene with
 * a different world needs a fresh document (COMPOSE_AND_CAPTURE.md, "One engine per page"). A second
 * `bootRecipe` in one document is refused by the SDK itself, by name; this page adds no guard of its
 * own. A same-world restart is the runner's own `restart()`, in this frame (the lab calls it).
 *
 * What this page owns:
 *   - the mount `#canvas-wrapper` — where `bootRecipe` mounts the scene and the lab's Hand listens;
 *   - the package's CameraControls through the runner's ONE control door, `runner.controlHost` — the
 *     same element a scene's own attach names, so the package's per-element idempotence gives the page
 *     ONE MOVE/LOOK pair whether or not the scene attached its own (3D: pads, WASD/arrows, wheel, SPACE →
 *     the runner's `grabToggle`; 2D: a no-op by the package's own rule). The human's HAND — pick, hover
 *     outline, 2D drag, and arming the runner's aim in 3D — is owned by the lab document (app-assets/maxi-hand-tool.js),
 *     which shares Maxi's one position write; nothing here picks or writes.
 * The page-level path resolver `FrqtlVision.record` uses (`window._egptResolveFrqtl`) is published
 * by the SDK boot from the router that loaded the engine — not here.
 */

import { bootRecipe, sdkBase } from './frqtl-sdk.js';

const MOUNT_ID = 'canvas-wrapper';

const state = {
    label: null, tick: null, runner: null, recipeContext: null, renderer: null, camera: null
};

function mount() {
    const el = document.getElementById(MOUNT_ID);
    if (!el) { throw new Error('[maxi-scene] #' + MOUNT_ID + ' is missing from scene.html.'); }
    return el;
}

/**
 * Boot one sketch into this document through the SDK's one door.
 * @param {{label:string, source:string, renderState:object, seed?:number}} spec
 * @returns {Promise<{renderer:string, retainedRenderRows:Array}>}
 */
async function boot(spec) {
    if (!spec || typeof spec.source !== 'string') {
        throw new Error('[maxi-scene] boot({label, source, renderState, seed?}) needs the sketch text as `source`.');
    }
    state.label = spec.label;
    const host = mount();
    const opts = {
        base: sdkBase(document.baseURI),
        renderState: spec.renderState || null,
        onTick: function (tickData) {
            if (tickData && tickData.universeData && typeof tickData.universeData.tick === 'number') {
                state.tick = tickData.universeData.tick;
            }
        }
    };
    if (spec.seed !== undefined) { opts.seed = spec.seed; }
    const out = await bootRecipe(host, spec.source, opts);
    state.runner = out.runner;
    state.recipeContext = out.recipeContext;
    const renderer = window._egptRenderer;
    if (renderer !== 'p5' && renderer !== 'three') {
        throw new Error('[maxi-scene] bootRecipe resolved but window._egptRenderer is ' + JSON.stringify(renderer) +
            ' — the SDK boot names the display it installed there ("p5" | "three"); without it the lab cannot say what is drawing.');
    }
    state.renderer = renderer;
    attachHumanControls(out.runner);
    return { renderer: state.renderer, retainedRenderRows: out.retainedRenderRows };
}

/**
 * The package's camera controls through the runner's control door (SPACE → the runner's grabToggle rides
 * inside them). CameraControls is idempotent PER ELEMENT: a scene that attached its own pads through
 * `runner.controlHost` hands back the same handle here; any other element would draw a second pair.
 */
export function attachHumanControls(runner) {
    if (!window.CameraControls || typeof window.CameraControls.attach !== 'function') {
        throw new Error('[maxi-scene] window.CameraControls is missing — the GAME roster did not inject objects/objects/CameraControls.js.');
    }
    const controlHost = runner.controlHost;
    if (!controlHost) {
        throw new Error('[maxi-scene] runner.controlHost is null after bootRecipe — the camera pads mount through the runner\'s one control door, and the booted scene has none.');
    }
    state.camera = window.CameraControls.attach(runner, controlHost);
}

window.MaxiScene = Object.freeze({
    boot: boot,
    mountId: MOUNT_ID,
    get runner() { return state.runner; },
    get recipeContext() { return state.recipeContext; },
    get renderer() { return state.renderer; },
    tick: function () { return state.tick; },
    mount: mount,
    canvas: function () { return mount().querySelector('canvas'); }
});
