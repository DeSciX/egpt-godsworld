/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render-state/apply.js — the ONE owner of the renderState contract AND of the procedure
 * that applies a renderState bag to a booted runner.
 *
 * A renderState bag (renderer/seed load-time selections + render rows + camera + backdrop
 * visibility) is replayed by every host: the GYM rung frame, STUDIO, the bundle's
 * `bootRecipe`, the hosted eyes. They all come through `RenderState.apply` — directly (the bundle,
 * which is its own page) or through the blank page's door `FrqtlPage.applyRenderState`
 * (lib/frqtl/experiments/empty/index.html). A host never restates the procedure.
 *
 * ── Layer 1: API contract (named ES-module exports) ─────────────────────────────────────────────
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
 *       Page controls are not state: a sketch declares them in its own code.
 *
 *   backdropOf(runner)                   — THE answer to "which LO is the backdrop" for a host: the
 *                                          census LO marked `backdrop === true`, or null. STUDIO's
 *                                          save captures its visibility through it, so capture and
 *                                          replay read one fact.
 *   RENDER_STATE_KEYS                    — THE key table of a bag, in the order the normalized bag is written;
 *                                          each row normalizes its own value.
 *   RENDER_STATE_VERSION                 — 1, the one version a bag may declare.
 *   normalizeSavedRenderState(raw)       — a bag (or null: no boot bag) → the full bag off RENDER_STATE_KEYS.
 *                                          THROWS on a key outside the table (naming it and the table), on
 *                                          another version, on page controls (author code now), and on a
 *                                          value that is neither a plain object nor null.
 *   pickCameraReplay(saved)              — pure decision: named preset over raw orbit.
 *   partitionRenderRows(rows, declared, known) — apply / retain / throw, before anything is written.
 *   renderRowsFromBag(bag)               — a { key: value } render-option bag as ordered rows.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────────────────────────
 *
 * Zero physics. Replaying a value has the IDENTICAL effect as a user re-dragging the same control;
 * the runner's own doors (`setRenderOptions`, `cameraControl`, `updateObjectProperty`) do the work.
 */


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

/** The one version a renderState bag may declare (an absent version is this one). */
var RENDER_STATE_VERSION = 1;

/**
 * THE key table of a renderState bag, in the order the normalized bag is written. Each row's `normalize(value)`
 * takes the raw value (undefined when the key is absent) to the stored form; an absent or malformed value is the
 * neutral one (null / []), which `apply` writes nothing for.
 * @type {ReadonlyArray<{key: string, normalize: function(*): *}>}
 */
var RENDER_STATE_KEYS = Object.freeze([
    { key: 'version', normalize: function (v) {
        if (v === undefined || v === RENDER_STATE_VERSION) { return RENDER_STATE_VERSION; }
        throw new Error('[render-state] renderState.version ' + JSON.stringify(v) + ' — this owner reads version ' +
            RENDER_STATE_VERSION + ' only. (FAIL-LOUD.)');
    } },
    { key: 'renderer', normalize: function (v) { return (typeof v === 'string' && v.length > 0) ? v : null; } },
    { key: 'engine', normalize: function (v) { return (typeof v === 'string' && v.length > 0) ? v : null; } },
    { key: 'seed', normalize: function (v) { return (v !== undefined && v !== null && v !== '') ? String(v) : null; } },
    { key: 'backdropVisible', normalize: function (v) { return (typeof v === 'boolean') ? v : null; } },
    { key: 'camera', normalize: function (v) {
        if (!_isPlainObject(v)) { return null; }
        return { orbit: _isPlainObject(v.orbit) ? v.orbit : null, preset: (typeof v.preset === 'string') ? v.preset : null };
    } },
    { key: 'render', normalize: function (v) {
        return Array.isArray(v) ? v.filter(function (row) {
            return _isPlainObject(row) && typeof row.key === 'string' && row.key.length > 0;
        }) : [];
    } }
].map(Object.freeze));

/**
 * The full renderState bag of `raw`, built off RENDER_STATE_KEYS: a bag (a host's capture, a registry rung's, a
 * stored folder row's, an export's boot bag) or `null` (no boot bag — the one-file Import) → every key, in table
 * order. An owner refuses what is not in its contract: a silent drop would be a silent fallback.
 *
 * @param {object|null} raw
 * @returns {{
 *   version: number,
 *   renderer: string|null,
 *   engine: string|null,
 *   seed: string|null,
 *   backdropVisible: boolean|null,
 *   camera: {orbit:object|null, preset:string|null}|null,
 *   render: {key:string, value:*}[]
 * }}
 * @throws {Error} a key outside RENDER_STATE_KEYS (named, beside the table); a version other than
 *   RENDER_STATE_VERSION; a bag carrying `pageControls` — page controls are declared in the sketch's own code, so a
 *   saved bag never carries them (migrate the project: move the controls into its sketch); and a value that is
 *   neither a plain object nor null (`undefined` included: a caller with no bag passes null).
 */
function normalizeSavedRenderState(raw) {
    if (raw !== null && !_isPlainObject(raw)) {
        throw new Error('[render-state] a renderState is a bag (a plain object) or null for none — got ' +
            (raw === undefined ? 'undefined' : Array.isArray(raw) ? 'an array' : typeof raw) + '. (FAIL-LOUD.)');
    }
    var r = raw || {};
    if (Object.prototype.hasOwnProperty.call(r, 'pageControls')) {
        var rows = Array.isArray(r.pageControls) ? r.pageControls : [];
        throw new Error('[render-state] this saved project carries page controls (renderState.pageControls: ' +
            (rows.map(function (row) { return _isPlainObject(row) ? String(row.id) : '?'; }).join(', ') || 'an empty list') +
            ') — page controls are declared in the sketch\'s own code; move them into the sketch and save again. (FAIL-LOUD.)');
    }
    var known = RENDER_STATE_KEYS.map(function (row) { return row.key; });
    Object.keys(r).forEach(function (k) {
        if (known.indexOf(k) === -1) {
            throw new Error('[render-state] renderState has no key "' + k + '" — its keys (RENDER_STATE_KEYS): ' +
                known.join(', ') + '. (FAIL-LOUD.)');
        }
    });
    var out = {};
    RENDER_STATE_KEYS.forEach(function (row) { out[row.key] = row.normalize(r[row.key]); });
    return out;
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

export {
    apply,
    backdropOf,
    RENDER_STATE_KEYS,
    RENDER_STATE_VERSION,
    normalizeSavedRenderState,
    pickCameraReplay,
    partitionRenderRows,
    renderRowsFromBag
};
