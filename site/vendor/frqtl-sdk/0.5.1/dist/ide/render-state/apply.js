/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render-state/apply.js — the ONE owner of the renderState contract AND of the procedure
 * that applies a renderState bag to a booted runner.
 *
 * A renderState bag (renderer/seed load-time selections + render rows + camera + backdrop
 * visibility + page controls) is replayed by every host: the GYM rung frame, STUDIO, the bundle's
 * `bootRecipe`, the hosted eyes. They all come through `RenderState.apply` — directly (the bundle,
 * which is its own page) or through the blank page's door `FrqtlPage.applyRenderState`
 * (lib/frqtl/experiments/empty/index.html). A host never restates the procedure.
 *
 * ── Layer 1: API contract (globalThis.RenderState, frozen) ──────────────────────────────────────
 *
 *   apply(runner, bag, env) → { applied, retained, camera, preset, backdrop }
 *       bag   — ANY renderState (raw or normalized); normalized here, so a registry bag and a saved
 *               project's bag take one path.
 *       env   — { knownNames: string[] }: `RenderCapabilitiesCommon.knownRenderCapabilityNames(
 *               providers)` — the page's renderer registry is a page global, not the runner's.
 *       Everything is RESOLVED before anything is written: a row no renderer declares, a camera
 *       on a runner with no `cameraControl`, or a camera handle with no `presets` THROWS with the
 *       runner untouched.
 *       Rows     → `partitionRenderRows` against `runner.renderCapabilities()`, then ONE
 *                  `runner.setRenderOptions(applied)` batch.
 *       Camera   → `pickCameraReplay`: a preset the booted camera offers (`cameraControl.presets`)
 *                  → `setPreset`, camera:'preset'; a preset it does not offer is NOT applied,
 *                  camera:'retained' (the CALLER decides whether that is acceptable); an orbit →
 *                  `setOrbit`, camera:'orbit'; no camera → null. `preset` names the preset applied
 *                  or retained (null for an orbit or no camera).
 *       Backdrop → `backdropOf(runner)`: a boolean `backdropVisible` →
 *                  `runner.updateObjectProperty(lo, 'visible', v)`, backdrop:v. An ABSENT
 *                  `backdropVisible` (null after normalizing) is not written — the scene's own
 *                  `addBackdrop(…, {visible})` rules — and reports backdrop:null, as does no backdrop LO.
 *       `pageControls` are NOT applied here: they are STUDIO's host-specific override.
 *
 *   backdropOf(runner)                   — THE answer to "which LO is the backdrop" for a host: the
 *                                          census LO marked `backdrop === true`, or null. STUDIO's
 *                                          save captures its visibility through it, so capture and
 *                                          replay read one fact.
 *   normalizeSavedRenderState(raw)       — tolerant normalizer for a LOADED bag (never throws).
 *   pickCameraReplay(saved)              — pure decision: named preset over raw orbit.
 *   partitionRenderRows(rows, declared, known) — apply / retain / throw, before anything is written.
 *   renderRowsFromBag(bag)               — a { key: value } render-option bag as ordered rows.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────────────────────────
 *
 * Zero physics. Replaying a value has the IDENTICAL effect as a user re-dragging the same control;
 * the runner's own doors (`setRenderOptions`, `cameraControl`, `updateObjectProperty`) do the work.
 *
 * Publish form (the sun-look form): a CLASSIC script in ENGINE_SHIM_CONTRACT_SCRIPTS
 * (lib/shim/engine/shim-contract-manifest.js + the stack-boot.js ENGINE literal), so the procedure
 * EXECUTES IN THE PAGE; read at load by `lib/shim/render-state/index.js` (ESM, a side-effect import
 * then the global) in node CJS, Vite, classic and the sdk bundle. It sets `globalThis.RenderState`
 * in EVERY mode and ALSO `module.exports` when `module` exists — one frozen object.
 */

(function () {
'use strict';

/** @returns {boolean} */
function _isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

/**
 * @param {{camera?: {orbit?:object|null, preset?:string|null}|null}} saved — a normalized bag.
 * @returns {{mode:'preset', name:string}|{mode:'orbit', orbit:object}|null}
 *   `null` — no camera was captured (nothing to replay).
 */
function pickCameraReplay(saved) {
    if (!saved || !saved.camera) { return null; }
    var cam = saved.camera;
    if (typeof cam.preset === 'string' && cam.preset.length > 0) {
        return { mode: 'preset', name: cam.preset };
    }
    if (cam.orbit && typeof cam.orbit === 'object') {
        return { mode: 'orbit', orbit: cam.orbit };
    }
    return null;
}

/**
 * Tolerant normalizer for a saved module's `renderState` field — a stored record may be
 * `undefined` (a pre-S6 legacy module), `null`, or a shape from another `version` — NEVER throws;
 * every missing/malformed field degrades to a NEUTRAL default (empty array / null), one `apply`
 * writes nothing for.
 *
 * @param {*} raw
 * @returns {{
 *   version: number,
 *   renderer: string|null,
 *   engine: string|null,
 *   seed: string|null,
 *   backdropVisible: boolean|null,
 *   camera: {orbit:object|null, preset:string|null}|null,
 *   render: {key:string, value:*}[],
 *   pageControls: {id:string, value:*, bind:{object:string,prop:string}|null}[]
 * }}
 */
function normalizeSavedRenderState(raw) {
    var r = _isPlainObject(raw) ? raw : {};
    var camera = null;
    if (_isPlainObject(r.camera)) {
        camera = {
            orbit: _isPlainObject(r.camera.orbit) ? r.camera.orbit : null,
            preset: (typeof r.camera.preset === 'string') ? r.camera.preset : null
        };
    }
    return {
        version: (typeof r.version === 'number') ? r.version : 1,
        renderer: (typeof r.renderer === 'string' && r.renderer.length > 0) ? r.renderer : null,
        engine: (typeof r.engine === 'string' && r.engine.length > 0) ? r.engine : null,
        seed: (r.seed !== undefined && r.seed !== null && r.seed !== '') ? String(r.seed) : null,
        backdropVisible: (typeof r.backdropVisible === 'boolean') ? r.backdropVisible : null,
        camera: camera,
        render: Array.isArray(r.render) ? r.render.filter(function (row) {
            return _isPlainObject(row) && typeof row.key === 'string' && row.key.length > 0;
        }) : [],
        pageControls: Array.isArray(r.pageControls) ? r.pageControls.filter(function (row) {
            return _isPlainObject(row) && typeof row.id === 'string' && row.id.length > 0;
        }).map(function (row) {
            return {
                id: row.id,
                value: row.value,
                bind: (_isPlainObject(row.bind) && typeof row.bind.object === 'string' &&
                       typeof row.bind.prop === 'string') ? { object: row.bind.object, prop: row.bind.prop } : null
            };
        }) : []
    };
}

/**
 * Resolve a bag's `render[]` rows against the renderer that will RECEIVE them, before anything is
 * written. Each row falls in exactly one class:
 *   - declared by the target        → `apply` (a `{key: value}` bag for ONE
 *                                     `runner.setRenderOptions` call; a later row wins)
 *   - declared by another renderer  → `retained` (NOT applied; the host decides what to do)
 *   - declared by no renderer       → THROWS (a typo, or a deleted option)
 *
 * @param {{key:string, value:*}[]} rows
 * @param {string[]} declaredNames — the target's `renderCapabilities()` names
 * @param {string[]} knownNames — `RenderCapabilitiesCommon.knownRenderCapabilityNames(registry)`
 * @returns {{apply: Object<string, *>, retained: {key:string, value:*}[]}}
 * @throws {Error} on a row whose key no registered renderer declares, or bad arguments.
 */
function partitionRenderRows(rows, declaredNames, knownNames) {
    if (!Array.isArray(rows) || !Array.isArray(declaredNames) || !Array.isArray(knownNames)) {
        throw new Error('[render-state] partitionRenderRows(rows, declaredNames, knownNames) takes three ' +
            'arrays. (FAIL-LOUD.)');
    }
    var apply = {};
    var retained = [];
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (declaredNames.indexOf(row.key) !== -1) {
            apply[row.key] = row.value;
        } else if (knownNames.indexOf(row.key) !== -1) {
            retained.push({ key: row.key, value: row.value });
        } else {
            throw new Error('[render-state] saved render option "' + row.key + '" is declared by no ' +
                'registered renderer (known: [' + knownNames.join(', ') + ']). (FAIL-LOUD: a typo or a ' +
                'deleted option would otherwise silently change the picture.)');
        }
    }
    return { apply: apply, retained: retained };
}

/**
 * renderRowsFromBag(bag) — a render-option BAG (`{ key: value }`, the `runner.setRenderOptions`
 * shape) as the ordered `[{ key, value }]` render rows a renderState carries, in the bag's own key
 * order. The ONE place a bag becomes rows, so a look owned as a bag (lib/shim/render/sun-look.js)
 * reaches a rung's renderState without a hand-typed row list.
 *
 * @param {Object<string, *>} bag
 * @returns {{key:string, value:*}[]}
 * @throws {Error} on a non-object or an array.
 */
function renderRowsFromBag(bag) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
        throw new Error('[render-state] renderRowsFromBag(bag) takes a plain { key: value } object; got ' +
            (Array.isArray(bag) ? 'an array' : String(bag)) + '. (FAIL-LOUD.)');
    }
    return Object.keys(bag).map(function (k) { return { key: k, value: bag[k] }; });
}

/** The backdrop LargeObject in the runner's census (the one with `backdrop === true`), or null. */
function backdropOf(runner) {
    var los = runner && runner.largeObjects;
    if (!Array.isArray(los)) {
        throw new Error('[render-state] RenderState.backdropOf: runner.largeObjects is not the world\'s census ' +
            '(an array) — the backdrop is found there and nowhere else. (FAIL-LOUD.)');
    }
    for (var i = 0; i < los.length; i++) {
        if (los[i] && los[i].backdrop === true) { return los[i]; }
    }
    return null;
}

/**
 * Apply a renderState bag to a booted runner — see the Layer 1 contract above.
 *
 * @param {object} runner — a booted FrqtlApp (its provider attached, its scene built).
 * @param {*} bag — a renderState bag, raw or normalized.
 * @param {{knownNames:string[]}} env
 * @returns {{applied:Object<string,*>, retained:{key:string,value:*}[],
 *            camera:'preset'|'orbit'|'retained'|null, preset:string|null, backdrop:boolean|null}}
 * @throws {Error} on bad arguments, a row no renderer declares, a value its descriptor refuses, a
 *   camera on a runner with no camera control, or any write the runner refuses.
 */
function apply(runner, bag, env) {
    if (!runner || typeof runner.renderCapabilities !== 'function' || typeof runner.setRenderOptions !== 'function') {
        throw new Error('[render-state] RenderState.apply(runner, bag, env): runner must be a booted FrqtlApp ' +
            '(renderCapabilities + setRenderOptions). (FAIL-LOUD.)');
    }
    if (!env || !Array.isArray(env.knownNames)) {
        throw new Error('[render-state] RenderState.apply(runner, bag, env): env.knownNames must be the page\'s ' +
            'RenderCapabilitiesCommon.knownRenderCapabilityNames(providers) array. (FAIL-LOUD.)');
    }
    var n = normalizeSavedRenderState(bag);

    // ── RESOLVE everything before anything is written ──
    // Rows — partitioned against the booted renderer.
    var parts = partitionRenderRows(
        n.render,
        runner.renderCapabilities().map(function (c) { return c.name; }),
        env.knownNames
    );
    // Camera — preset over orbit; a preset the booted camera does not offer is reported, not applied.
    var cam = pickCameraReplay(n);
    var ctl = null, camera = null, preset = null;
    if (cam) {
        ctl = runner.cameraControl;
        if (!ctl) {
            throw new Error('[render-state] the bag declares a camera (' + JSON.stringify(n.camera) + ') but the ' +
                'runner has no cameraControl — a declared view on a display with no pose control would look ' +
                'fine and be wrong. (FAIL-LOUD.)');
        }
        if (cam.mode === 'preset') {
            if (!Array.isArray(ctl.presets)) {
                throw new Error('[render-state] the booted camera publishes no `presets` array — every ' +
                    'getCameraControl() handle declares the presets it offers. (FAIL-LOUD.)');
            }
            preset = cam.name;
            camera = (ctl.presets.indexOf(cam.name) === -1) ? 'retained' : 'preset';
        } else {
            camera = 'orbit';
        }
    }
    // Backdrop — the one derivation: the census LO marked `backdrop === true`.
    var lo = backdropOf(runner);

    // ── WRITE ──
    runner.setRenderOptions(parts.apply);   // ONE validated batch
    if (camera === 'preset') { ctl.setPreset(cam.name); }
    else if (camera === 'orbit') { ctl.setOrbit(cam.orbit); }
    var backdrop = null;
    if (lo && n.backdropVisible !== null) {
        runner.updateObjectProperty(lo, 'visible', n.backdropVisible);
        backdrop = n.backdropVisible;
    }

    return { applied: parts.apply, retained: parts.retained, camera: camera, preset: preset, backdrop: backdrop };
}

var RenderState = Object.freeze({
    apply: apply,
    backdropOf: backdropOf,
    normalizeSavedRenderState: normalizeSavedRenderState,
    pickCameraReplay: pickCameraReplay,
    partitionRenderRows: partitionRenderRows,
    renderRowsFromBag: renderRowsFromBag
});

globalThis.RenderState = RenderState;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderState;
}

})();
