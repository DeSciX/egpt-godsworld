/* Copyright 2023-2026 by Essam Abadir */

/**
 * Notebook knob — the SINGLE authority for the canvas-cell driving knob
 *
 * A canvas cell may carry an `opts="<key>=<value>,…"` attribute (parsed to a
 * `{key: Number}` map by lib/shim/notebook/format.js — a pure module that does
 * NOT validate). This module is the ONE place that:
 *
 *   1. validates each opts key against the exhibit knob SCHEMA, and
 *   2. maps the manifest knob param name → the setup-factory option key,
 *
 * then returns the factory-option object the pane threads into
 * GraphicsPane.loadExperiment(setupFn, opts). It is FAIL-LOUD: an unknown key,
 * an out-of-range value, or a spec that defines no knob THROWS — never a silent
 * ignore (that would be the hint-only/lie-in-surface class the gate forbids).
 *
 * ── Why this lives in lib/shim (not the pane, not exhibits.js) ────────────────
 *
 * The knob SCHEMA lives ONCE, notebook-scoped, in the sibling module
 * lib/shim/notebook/notebook-knobs.js (NOTEBOOK_KNOBS). A canvas cell's live
 * knob is a NOTEBOOK feature, so its declaration belongs with the notebook, not
 * on the public-site Impossible Gallery exhibit card. This module reads that
 * same-layer table (no upward dependency on lib/frqtl) and owns the MECHANISM:
 * validation + the param→factory-option map.
 *
 * The param→factory-option map (e.g. quanta → quantumLimit) lives HERE and
 * ONLY here, so the notebook canvas path and the (future) public-iframe
 * set-param path cannot diverge.
 *
 * Named ESM export. Imports ONLY the sibling knob declaration; no Runtime, no
 * Bus, no DOM, no engine path.
 */

'use strict';

import { NOTEBOOK_KNOBS } from './notebook-knobs.js';

/* ── The ONE param → setup-factory-option map ────────────────────────────────
 *
 * The exhibit manifest knob `param` is the human/URL-facing name ('quanta').
 * The setup factory reads a different option key ('quantumLimit' in
 * setupWaveInterference). This map is the SINGLE bridge between the two
 * vocabularies. A param present in an exhibit knob MUST have an entry here, or
 * mapping FAILS LOUD (a knob with no wire is a hint-only knob — forbidden).
 *
 * Keyed by manifest param name → factory option key. */
var PARAM_TO_FACTORY_OPTION = {
    // wave-interference: quanta = max quanta per source = setupWaveInterference's
    // `quantumLimit` option (setupWaveInterference.js:64). More quanta → denser
    // emission → an observably different fringe build-up.
    quanta: 'quantumLimit'
};

/* Index the notebook-scoped declaration by the setup-factory `spec` name (the
 * value the builder cell threads into frqtl.knob). NOTEBOOK_KNOBS is keyed by
 * notebook id; each entry names its `spec`. FAIL-LOUD on a duplicate spec so two
 * notebooks cannot silently declare divergent knobs for one factory. */
var _knobBySpec = (function () {
    var map = Object.create(null);
    var ids = Object.keys(NOTEBOOK_KNOBS);
    for (var i = 0; i < ids.length; i++) {
        var entry = NOTEBOOK_KNOBS[ids[i]];
        if (!entry || !entry.spec || !entry.knob) { continue; }
        if (map[entry.spec]) {
            throw new Error(
                '[notebook/knob] duplicate knob spec "' + entry.spec + '" across notebooks ' +
                '(' + ids[i] + ' collides with an earlier entry). (FAIL-LOUD.)'
            );
        }
        map[entry.spec] = entry.knob;
    }
    return map;
})();

/**
 * knobSchemaFor(specName) → the exhibit knob schema for a canvas cell `spec`
 * (setup factory name), or null when the spec defines no knob.
 *
 * @param {string} specName
 * @returns {{label:string, param:string, min:number, max:number, step:number, defaultValue:number}|null}
 */
export function knobSchemaFor(specName) {
    if (!specName) { return null; }
    // The cell spec may be an ordered dependency list whose LAST member is the
    // factory (notebook-pane._runRealmCell convention). Use the last segment.
    var name = String(specName).split(',').pop().trim();
    return _knobBySpec[name] || null;
}

/**
 * validateAndMap(specName, optsMap) → factory-option object, or THROWS.
 *
 * FAIL-LOUD on:
 *   - optsMap has a key, but `specName` defines no knob at all.
 *   - a key that is not the spec's knob `param`.
 *   - a value out of the schema [min, max] range.
 *   - a knob `param` with no PARAM_TO_FACTORY_OPTION wire (a hint-only knob).
 *
 * Returns {} when optsMap is empty/absent (no knob requested — not an error).
 *
 * @param {string} specName            — the canvas cell `spec` (setup factory name)
 * @param {Object<string,number>} optsMap — parsed opts (format.js), {} when absent
 * @returns {Object<string,number>}    — { <factoryOption>: <value> }
 */
export function validateAndMap(specName, optsMap) {
    var keys = optsMap ? Object.keys(optsMap) : [];
    if (keys.length === 0) { return {}; }

    var schema = knobSchemaFor(specName);
    if (!schema) {
        throw new Error(
            '[notebook/knob] cell spec "' + specName + '" defines NO knob, but opts ' +
            'declares ' + JSON.stringify(keys) + '. (FAIL-LOUD — no silent ignore.)'
        );
    }

    var out = {};
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key !== schema.param) {
            throw new Error(
                '[notebook/knob] unknown knob key "' + key + '" for spec "' + specName +
                '" — the only knob is "' + schema.param + '". (FAIL-LOUD; not silently ignored.)'
            );
        }
        var value = optsMap[key];
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new Error(
                '[notebook/knob] knob "' + key + '" value is not a finite number: ' +
                JSON.stringify(value) + '. (FAIL-LOUD.)'
            );
        }
        if (value < schema.min || value > schema.max) {
            throw new Error(
                '[notebook/knob] knob "' + key + '"=' + value + ' is out of range [' +
                schema.min + ', ' + schema.max + '] for spec "' + specName + '". (FAIL-LOUD.)'
            );
        }
        var factoryOption = PARAM_TO_FACTORY_OPTION[key];
        if (!factoryOption) {
            throw new Error(
                '[notebook/knob] knob param "' + key + '" has NO factory-option wire in ' +
                'PARAM_TO_FACTORY_OPTION — a hint-only knob is forbidden. (FAIL-LOUD.)'
            );
        }
        out[factoryOption] = value;
    }
    return out;
}
