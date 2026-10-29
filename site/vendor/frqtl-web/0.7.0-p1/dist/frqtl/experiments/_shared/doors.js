/* Copyright 2023-2026 by Essam Abadir */

/**
 * doors.js — THE two scene doors of a page (`@descix/frqtl-web/boot`), beside the boot they run.
 *
 *   bootScene(mount, buildExperiment, opts?) → Promise<{ runner, recipeContext, display }>
 *       The sketch is an imported FUNCTION, so nothing is evaluated. opts: renderer ('p5' | 'three',
 *       default 'p5'), seed (default 42), onTick, render (one runner.setRenderOptions batch after start).
 *
 *   bootProject(mount, project, opts?) → Promise<{ runner, recipeContext, display, retainedRenderRows }>
 *       project = { files: { 'frqtl.json': text, 'sketch.js': text, 'parts/X.js': text, … }, entry? }
 *               | { url: '<served folder>/', entry? }
 *       — linked by THE link site through linkInPage (lib/shim/project/link.js linkProject; `mint` defaults to blobMint;
 *       a project may carry its host's `mint` / `bare`), its entry's default export built on the page.
 *       `entry` is optional when the folder's frqtl.json names it (lib/shim/project/manifest.js); beside a
 *       manifest it must equal manifest.entry; with no manifest it is REQUIRED. A one-string sketch is
 *       { files: { 'sketch.js': src }, entry: 'sketch.js' }.
 *       opts: renderState (the HOST's boot bag — its renderer/seed pick the boot, then the whole bag is applied
 *       through the boot's applyRenderState; never a fact of frqtl.json), seed (overrides renderState.seed), onTick.
 *       The runner's SceneRecord carries the project's identity (identity.js projectIdentity over the linked
 *       set, frqtl.json included) as `sourceSha256`.
 *
 *   display — the display slot's value after the boot (compat/renderer/display-slot.js), ferried.
 *
 * Both end in ONE sketch path (sizeless RecipeContext → exp.build → the engine's init gate → start →
 * resolve on the runner's first tick). FAIL-LOUD: any link/engine/renderer/sketch failure paints an
 * overlay inside `mount` and the promise REJECTS. ONE BOOT PER DOCUMENT: the stack is document-scoped
 * and has no dispose(), so a second boot THROWS naming the re-scene door (the first boot's
 * recipeContext.build). Self-hosting is where this module is imported from: every file it loads
 * resolves relative to its own URL.
 *
 * Retired: bootRecipe (→ bootProject) — RETIRED_BOOT_DOORS, refused on the min.js bag through
 * compat/engine.js refuseRetiredDoors and, as a named import, by a function that throws the same text.
 */

import { bootPage, applyRenderState, bootedRenderer } from './boot.js';
import { RecipeContext } from '../../objects/RecipeContext.js';
import { normalizeSavedRenderState } from '../../../shim/render-state/index.js';
import { linkProject, blobMint } from '../../../shim/project/link.js';
import { projectIdentity } from '../../../shim/project/identity.js';

/** Retired scene doors → the message using one throws. */
export const RETIRED_BOOT_DOORS = Object.freeze({
    bootRecipe: '[doors] bootRecipe(mount, recipeSource, opts) is retired — boot a project: bootProject(mount, ' +
        '{ files: { "sketch.js": recipeSource }, entry: "sketch.js" }, opts) (@descix/frqtl-web/boot, ' +
        'lib/frqtl/experiments/_shared/doors.js). (FAIL-LOUD.)'
});

/** The retired named import: calling it throws its RETIRED_BOOT_DOORS message. */
export function bootRecipe() {
    throw new Error(RETIRED_BOOT_DOORS.bootRecipe);
}

// ── FAIL-LOUD overlay, scoped to the mount ──────────────────────────────────

function paintError(mountEl, title, detail) {
    const box = document.createElement('div');
    box.setAttribute('data-egpt-artifact-error', '1');
    box.style.cssText =
        'position:absolute;inset:0;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;' +
        'white-space:pre-wrap;background:#1a0000;color:#ff6b6b;border:2px solid #b6161c;' +
        'padding:14px;overflow:auto;z-index:9998;';
    box.textContent = title + '\n\n' + detail;
    mountEl.innerHTML = '';
    if (mountEl.style && (!mountEl.style.position || mountEl.style.position === 'static')) {
        mountEl.style.position = 'relative';
    }
    mountEl.appendChild(box);
}

function resolveMount(mountEl) {
    if (typeof mountEl === 'string') {
        const el = document.getElementById(mountEl);
        if (!el) { throw new Error('[doors] mount element id "' + mountEl + '" not found.'); }
        return el;
    }
    if (!mountEl || typeof mountEl.appendChild !== 'function') {
        throw new Error('[doors] mount must be a DOM element or its id.');
    }
    return mountEl;
}

/** Mount the door's canvas parent inside `mountEl` (cleared first). */
function mountCanvasHost(mountEl, role) {
    const host = resolveMount(mountEl);
    host.innerHTML = '';
    const canvasHost = document.createElement('div');
    canvasHost.setAttribute('data-role', role);
    canvasHost.id = role + '-' + Math.random().toString(36).slice(2);
    host.appendChild(canvasHost);
    return { host: host, canvasHost: canvasHost };
}

function assertRenderer(where, r) {
    if (r !== 'p5' && r !== 'three') {
        throw new Error('[doors] ' + where + ': renderer "' + r + '" is invalid (expected "p5" | "three").');
    }
    return r;
}

function refuseStray(where, opts, accepted) {
    const stray = Object.keys(opts).filter(function (k) { return accepted.indexOf(k) === -1; });
    if (stray.length) {
        throw new Error('[doors] ' + where + ': unknown option(s) ' + stray.join(', ') + ' (accepted: ' +
            accepted.join(', ') + '). The world — its size, 3D-ness and physics — is the sketch\'s own co-init ' +
            'call; the package copy a page boots from is the one it imported this module from. (FAIL-LOUD.)');
    }
}

// ── THE ONE SKETCH PATH ─────────────────────────────────────────────────────
//
// Readiness is the runner's: the promise resolves from runner.firstTick (FrqtlApp's own promise for its
// first DELIVERED tick, whose deadline runs only while the document is visible). Before start the
// engine's own gate is asked (universe.fundamentalDimension), so a sketch that left its world
// un-init'd rejects here instead of throwing on every frame.

const FIRST_TICK_DEADLINE_MS = 15000;

function runSketch(spec) {
    const host = spec.host;
    const label = spec.label;
    return new Promise(function (resolve, reject) {
        let page = null;
        // p5 is the boot trigger for both renderers (bootPage { p5: 'always' }); under three the co-init
        // call delegates the canvas to the three provider. The sketch phase settles once exp.build ran.
        function setup() {
            let exp;
            try {
                exp = new RecipeContext({ canvasParentId: spec.canvasHost.id, seed: spec.seed, onTick: spec.onTick });
                exp.build(spec.sketch);
                void exp.runner.universe.fundamentalDimension;   // the ENGINE's init gate
                page.completeSketch();
            } catch (err) {
                page.failSketch(err);
                paintError(host, 'FRQTL ' + label + ' SETUP FAILED', String((err && err.stack) || err));
                reject(err);
                return;
            }
            const runner = exp.runner;
            let extra;
            try {
                runner.start();
                extra = spec.afterStart(runner, exp) || {};
            } catch (err) {
                runner.stop();
                paintError(host, 'FRQTL ' + label + ' SETUP FAILED', String((err && err.stack) || err));
                reject(err);
                return;
            }
            runner.firstTick({ deadlineMs: FIRST_TICK_DEADLINE_MS }).then(function () {
                const out = { runner: runner, recipeContext: exp, display: bootedRenderer() };
                Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
                resolve(out);
            }, function (err) {
                const named = new Error('[doors] ' + label.toLowerCase() + ': FIRST_TICK_DEADLINE_MS = ' +
                    FIRST_TICK_DEADLINE_MS + ' ms — ' + String((err && err.message) || err));
                paintError(host, 'FRQTL ' + label + ' NEVER TICKED', String(named.stack || named));
                reject(named);
            });
        }
        page = bootPage(Object.assign({ p5: 'always', sketch: 'deferred', setup: setup }, spec.bootOpts));
        page.ready.catch(function (err) {
            paintError(host, 'FRQTL ' + label + ' BOOT FAILED', String((err && err.stack) || err));
            reject(err);
        });
    });
}

// ── ONE BOOT PER DOCUMENT ───────────────────────────────────────────────────

let _documentBoot = null;   // { door, state: 'pending' | 'booted' | 'failed' }

function claimDocument(door) {
    const prior = _documentBoot;
    if (prior && prior.state === 'pending') {
        throw new Error('[doors] ' + door + ': a boot through ' + prior.door + ' is IN PROGRESS in this ' +
            'document; await its promise. When it resolves, show another scene through the facade it returns ' +
            '(recipeContext.build); if it rejects, this document cannot host a second attempt. (FAIL-LOUD.)');
    }
    if (prior && prior.state === 'failed') {
        throw new Error('[doors] ' + door + ': a boot through ' + prior.door + ' was attempted in this ' +
            'document and FAILED; the stack cannot be re-booted in the same document — open a fresh document. ' +
            '(FAIL-LOUD.)');
    }
    if (prior) {
        throw new Error('[doors] ' + door + ': this document already booted the FRQTL stack (through ' +
            prior.door + '). One engine stack per document — there is no dispose(). To show another scene, ' +
            'use the facade the first boot returned: recipeContext.build(buildExperiment) — for a project, ' +
            'build(await linkProject({ files, entry, mint })) (same runner, same canvas); a ' +
            'different world size needs a fresh document. (FAIL-LOUD.)');
    }
    const claim = { door: door, state: 'pending' };
    _documentBoot = claim;
    return function settle(bootPromise) {
        return bootPromise.then(function (result) { claim.state = 'booted'; return result; },
            function (err) { claim.state = 'failed'; throw err; });
    };
}

/**
 * THE page host's link: linkProject with the page's mint (blobMint) unless the project carries its host's own.
 * bootProject and the empty page (FrqtlPage.applyModuleSource) both link through it.
 * @param {{files?: Object<string,string>, url?: string, entry?: string, mint?: Function, bare?: Function}} project
 * @returns {Promise<object>} linkProject's result (its contract: lib/shim/project/link.js)
 */
export function linkInPage(project) {
    if (!project || typeof project !== 'object') {
        return Promise.reject(new Error('[doors] linkInPage(project): project is { files } or { url } (+ entry when it carries no frqtl.json) (got ' +
            typeof project + '). (FAIL-LOUD.)'));
    }
    return linkProject(Object.assign({}, project, project.mint === undefined ? { mint: blobMint } : {}));
}

/** The keys bootScene accepts. Any other key THROWS. */
export const BOOT_SCENE_OPTS = Object.freeze(['renderer', 'seed', 'onTick', 'render']);
/** The keys bootProject accepts. Any other key THROWS. */
export const BOOT_PROJECT_OPTS = Object.freeze(['renderState', 'seed', 'onTick']);

/**
 * Boot a sketch FUNCTION — `buildExperiment(exp)` — into `mount`.
 * @param {HTMLElement|string} mountEl
 * @param {function(object):void} sketch
 * @param {{renderer?: 'p5'|'three', seed?: number, onTick?: Function, render?: object}} [opts]
 * @returns {Promise<{runner: object, recipeContext: object, display: string}>}
 * @example
 *   import { bootScene } from '@descix/frqtl-web/boot';
 *   import buildExperiment from './sketch.js';
 *   await bootScene('mount', buildExperiment);
 */
export function bootScene(mountEl, sketch, opts) {
    let settle;
    try { settle = claimDocument('bootScene'); } catch (err) { return Promise.reject(err); }
    return settle(bootSceneClaimed(mountEl, sketch, opts || {}));
}

async function bootSceneClaimed(mountEl, sketch, opts) {
    const m = mountCanvasHost(mountEl, 'frqtl-scene-canvas');
    let renderer;
    try {
        if (typeof sketch !== 'function') {
            throw new Error('[doors] bootScene(mount, sketch, opts): `sketch` must be the scene\'s ' +
                'buildExperiment(exp) function — a sketch held as text is a project: bootProject(mount, ' +
                '{ files: { "sketch.js": text }, entry: "sketch.js" }). (got ' + typeof sketch + ')');
        }
        refuseStray('bootScene', opts, BOOT_SCENE_OPTS);
        renderer = assertRenderer('bootScene', opts.renderer === undefined ? 'p5' : opts.renderer);
    } catch (err) {
        paintError(m.host, 'FRQTL SCENE BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }
    return runSketch({
        host: m.host, canvasHost: m.canvasHost, label: 'SCENE', sketch: sketch,
        bootOpts: { renderer: renderer, overlayHost: m.host },
        seed: opts.seed !== undefined ? opts.seed : 42,
        onTick: typeof opts.onTick === 'function' ? opts.onTick : function () {},
        afterStart: function (runner) {
            if (opts.render !== undefined) { runner.setRenderOptions(opts.render); }
        }
    });
}

/**
 * Boot a PROJECT into `mount`: link it (linkProject), build its entry's default export.
 * @param {HTMLElement|string} mountEl
 * @param {{files?: Object<string,string>, url?: string, entry?: string, mint?: Function, bare?: Function}} project
 * @param {{renderState?: object, seed?: number, onTick?: Function}} [opts]
 * @returns {Promise<{runner: object, recipeContext: object, display: string, retainedRenderRows: object[]}>}
 * @example
 *   import { bootProject } from '@descix/frqtl-web/boot';
 *   import { manifestFor, serializeManifest } from '@descix/frqtl-web/project';
 *   const json = serializeManifest(manifestFor({ name: 'my-scene', entry: 'sketch.js' }));
 *   await bootProject('mount', { files: { 'frqtl.json': json, 'sketch.js': src, 'parts/MyEmitter.js': fork } });
 */
export function bootProject(mountEl, project, opts) {
    let settle;
    try { settle = claimDocument('bootProject'); } catch (err) { return Promise.reject(err); }
    return settle(bootProjectClaimed(mountEl, project, opts || {}));
}

async function bootProjectClaimed(mountEl, project, opts) {
    const m = mountCanvasHost(mountEl, 'frqtl-project-canvas');
    let rs;
    let renderer;
    let linked;
    let identity;
    try {
        if (!project || typeof project !== 'object' || typeof project === 'function') {
            throw new Error('[doors] bootProject(mount, project, opts): project is { files } or { url } (+ entry when it carries no frqtl.json) ' +
                '(a sketch function boots through bootScene). (got ' + typeof project + ')');
        }
        refuseStray('bootProject', opts, BOOT_PROJECT_OPTS);
        rs = normalizeSavedRenderState(opts.renderState || null);
        renderer = assertRenderer('bootProject', rs.renderer || 'p5');
        linked = await linkInPage(project);
        identity = await projectIdentity({ files: linked.files });
    } catch (err) {
        paintError(m.host, 'FRQTL PROJECT BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }
    return runSketch({
        host: m.host, canvasHost: m.canvasHost, label: 'PROJECT', sketch: linked,   // the facade holds the linked text
        bootOpts: { renderer: renderer, overlayHost: m.host },
        seed: (opts.seed !== undefined) ? opts.seed : (rs.seed != null ? Number(rs.seed) : 42),
        onTick: typeof opts.onTick === 'function' ? opts.onTick : function () {},
        afterStart: function (runner) {
            runner.setSourceSha256(identity);
            const r = applyRenderState(runner, rs);
            if (r.camera === 'retained') {
                throw new Error('[doors] bootProject: renderState camera preset "' + r.preset +
                    '" is not offered by the booted camera (cameraControl.presets). (FAIL-LOUD.)');
            }
            return { retainedRenderRows: r.retained };
        }
    });
}
