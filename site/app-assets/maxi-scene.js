/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-scene.js — ONE scene per document (scene.html).
 *
 * The lab (app.html) hosts each loaded scene in its own iframe of this page and replaces the frame to
 * load another: the package holds one engine stack per document (there is no dispose()), and a scene with
 * a different world needs a fresh document. A second boot in one document is refused by the package's
 * doors themselves, by name; this page adds no guard of its own. A same-world restart is the runner's own
 * `restart()`, in this frame (the lab calls it).
 *
 * The package comes by SPECIFIER: scene.html's import map is rendered from the vendored @descix/frqtl-web by
 * scripts/gen-import-maps.mjs, so this module and every sketch it boots resolve `@descix/frqtl-web/...` to
 * the same vendored files (the linker rewrites a project's package imports to those URLs: one module, one URL).
 *
 * What this page owns:
 *   - the mount `#canvas-wrapper` — where `bootProject` mounts the project folder the lab hands over (its frqtl.json
 *     names the entry) and the lab's Hand listens;
 *   - the package's CameraControls through the runner's ONE control door, `runner.controlHost` — the
 *     same element a scene's own attach names, so the package's per-element idempotence gives the page
 *     ONE MOVE/LOOK pair whether or not the scene attached its own (3D: pads, WASD/arrows, wheel, SPACE →
 *     the runner's `grabToggle`; 2D: a no-op by the package's own rule). The human's HAND — pick, hover
 *     outline, 2D drag, and arming the runner's aim in 3D — is owned by the lab document (app-assets/maxi-hand-tool.js),
 *     which shares Maxi's one position write; nothing here picks or writes;
 *   - the eyes: the package's FrqtlVision, imported in THIS realm (a recording attaches to this frame's runner)
 *     and handed to the lab as `window.MaxiScene.FrqtlVision`; the package publishes no page global for it.
 */

import { bootProject } from '@descix/frqtl-web/boot';
import { linkProject, parseManifest, MANIFEST_FILE } from '@descix/frqtl-web/project';
import { kindOf } from '@descix/frqtl-web/kinds';
import { CameraControls, FrqtlVision } from '@descix/frqtl-web/parts';

const MOUNT_ID = 'canvas-wrapper';

const state = {
    label: null, runner: null, recipeContext: null, renderer: null, camera: null, entry: null,
    runnerTick: null                      // the last tick the runner handed its listeners (its own count, which restarts at 0 on a re-run)
};

function mount() {
    const el = document.getElementById(MOUNT_ID);
    if (!el) { throw new Error('[maxi-scene] #' + MOUNT_ID + ' is missing from scene.html.'); }
    return el;
}

/**
 * Boot one project folder into this document through the package's project door. `files` is the folder a host boots:
 * its frqtl.json names the entry (a roster scene: the package's projectOf over the lab's roster; Maxi's sketch: the lab's one-file folder),
 * so the facade holds a project a Record can snapshot (exp.startRecord refuses a held project with no frqtl.json).
 * @param {{label:string, files:object, renderState:object, seed?:number}} spec
 * @returns {Promise<{renderer:string, retainedRenderRows:Array}>}
 */
async function boot(spec) {
    if (!spec || !spec.files || typeof spec.files !== 'object' || typeof spec.files[MANIFEST_FILE] !== 'string') {
        throw new Error('[maxi-scene] boot({label, files, renderState, seed?}) needs the project folder as `files`, its ' + MANIFEST_FILE + ' naming the entry.');
    }
    state.label = spec.label;
    const host = mount();
    const opts = {
        renderState: spec.renderState || null,
        onTick: function (tickData) {
            if (tickData && tickData.universeData && typeof tickData.universeData.tick === 'number') { state.runnerTick = tickData.universeData.tick; }
        }
    };
    if (spec.seed !== undefined) { opts.seed = spec.seed; }
    const out = await bootProject(host, { files: spec.files }, opts);
    state.entry = parseManifest(spec.files[MANIFEST_FILE]).entry;
    state.runner = out.runner;
    state.recipeContext = out.recipeContext;
    if (out.display !== 'p5' && out.display !== 'three') {
        throw new Error('[maxi-scene] bootProject resolved with display ' + JSON.stringify(out.display) +
            ' — the package names the display it booted ("p5" | "three"); without it the lab cannot say what is drawing.');
    }
    state.renderer = out.display;
    attachHumanControls(out.runner);
    return { renderer: state.renderer, retainedRenderRows: out.retainedRenderRows };
}

/**
 * The package's camera controls through the runner's control door (SPACE → the runner's grabToggle rides
 * inside them). CameraControls is idempotent PER ELEMENT: a scene that attached its own pads through
 * `runner.controlHost` hands back the same handle here; any other element would draw a second pair.
 */
export function attachHumanControls(runner) {
    const controlHost = runner.controlHost;
    if (!controlHost) {
        throw new Error('[maxi-scene] runner.controlHost is null after bootProject — the camera pads mount through the runner\'s one control door, and the booted scene has none.');
    }
    state.camera = CameraControls.attach(runner, controlHost);
}

/** Where a value stops being strict JSON ('' at the top, '.k' / '[i]' below), or null when it is. */
function nonJsonAt(v, at) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') { return null; }
    if (typeof v === 'number') { return isFinite(v) ? null : at; }
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const b = nonJsonAt(v[i], at + '[' + i + ']'); if (b !== null) { return b; } } return null; }
    if (typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
        for (const k of Object.keys(v)) { const b = nonJsonAt(v[k], at + '.' + k); if (b !== null) { return b; } }
        return null;
    }
    return at || '(the value)';
}

/**
 * THE PARTS BLOCK of a project as the sketch-projects design §6 writes it: {"<name>": ["<registered kind name>", {props}]}
 * in key order — the entry module's own `export const parts`, read off the package's one link door (linkProject, in THIS
 * realm, where the kinds are registered: its result's `module` is the entry's namespace), each kind written by the name the
 * registry resolves (@descix/frqtl-web/kinds kindOf). The values are the block's, never the live objects'. The inventory hand
 * reads it (maxi-hands.js sketchOf); a Record's parts.before/after.json are the package's own. Resolves null when the entry
 * exports no `parts` (a sketch that declares its parts in code has no block). THROWS on an entry that is not [Kind, {props}],
 * an unregistered kind, or props that are not strict JSON.
 */
async function partsOf(project) {
    if (!project || typeof project.entry !== 'string' || !project.files || typeof project.files[project.entry] !== 'string') {
        throw new Error('[maxi-scene] partsOf({entry, files}) needs a project whose entry is one of its files.');
    }
    const minted = [];
    function mint(text) {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        minted.push(url);
        return { url: url, release: function () { URL.revokeObjectURL(url); } };
    }
    try {
        const linked = await linkProject({ files: project.files, entry: project.entry, mint: mint });
        if (!linked.module || typeof linked.module !== 'object') { throw new Error('[maxi-scene] linkProject returned no `module` — the entry\'s namespace is the package\'s to read.'); }
        if (linked.module.parts === undefined) { return null; }
        const block = linked.module.parts;
        if (!block || typeof block !== 'object' || Array.isArray(block)) { throw new Error('[maxi-scene] ' + project.entry + ' exports `parts` as ' + JSON.stringify(block) + ', not { name: [Kind, {props}] }.'); }
        const out = {};
        Object.keys(block).forEach(function (key) {
            const e = block[key];
            if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'function' || !e[1] || typeof e[1] !== 'object') {
                throw new Error('[maxi-scene] parts.' + key + ' is not [Kind, {props}].');
            }
            const row = kindOf(e[0]);
            if (!row) { throw new Error('[maxi-scene] parts.' + key + ': the class ' + (e[0].name || '(anonymous)') + ' is not a registered kind in the scene\'s realm.'); }
            const bad = nonJsonAt(e[1], '');
            if (bad !== null) { throw new Error('[maxi-scene] parts.' + key + ' props' + bad + ' is not strict JSON — the block cannot be written as §6 JSON.'); }
            out[key] = [e[0].name, JSON.parse(JSON.stringify(e[1]))];
        });
        return out;
    } finally {
        minted.forEach(function (u) { URL.revokeObjectURL(u); });
    }
}

window.MaxiScene = Object.freeze({
    boot: boot,
    mountId: MOUNT_ID,
    get runner() { return state.runner; },
    get recipeContext() { return state.recipeContext; },
    get renderer() { return state.renderer; },
    /** The last tick the runner handed its listeners: ITS count, which restarts at 0 when it re-runs. Never a Record's clock (the open Record's `tick` is). */
    runnerTick: function () { return state.runnerTick; },
    entry: function () { return state.entry; },
    partsOf: partsOf,
    FrqtlVision: FrqtlVision,
    mount: mount,
    canvas: function () { return mount().querySelector('canvas'); }
});
