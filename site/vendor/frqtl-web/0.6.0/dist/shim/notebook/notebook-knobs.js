/* Copyright 2023-2026 by Essam Abadir */

/**
 * NOTEBOOK_KNOBS — the canonical, notebook-scoped declaration of every live
 * canvas-cell driving knob.
 *
 * This is the SINGLE home for the driving-knob SCHEMA. It is keyed by NOTEBOOK
 * ID (the notebooks.json `id`, e.g. 'gallery-wave-interference'); each entry
 * names the setup-factory export it binds (`spec`) and carries the knob schema
 * shape ({ label, param, min, max, step, defaultValue }).
 *
 * ── Why the declaration lives HERE (not on the exhibit card) ──────────────────
 *
 * A canvas cell's live knob is a NOTEBOOK feature: the gallery notebook declares
 * a canvas with `opts="<param>=<value>"`, and the shim validates + maps that
 * param to a setup-factory option at run time (lib/shim/notebook/knob.js →
 * frqtl.knob). The knob therefore belongs to the notebook that hosts the canvas,
 * not to the Impossible Gallery exhibit card (a separate public-site curation
 * surface). Keeping the schema here — a lib/shim sibling of knob.js — makes the
 * notebook path self-contained: knob.js reads this table directly (a same-layer
 * read), with no upward dependency on lib/shim/registry/exhibits.js.
 *
 * knob.js remains the MECHANISM owner (validate + param→factory-option map);
 * this module is only the DECLARATION. One authority, no mirror.
 *
 * Named ESM export. No Runtime, no Bus, no DOM, no engine path.
 */

'use strict';

/**
 * @typedef {Object} KnobSchema
 * @property {string} label        — human/UI label for the slider.
 * @property {string} param        — the URL/opts-facing knob name (e.g. 'quanta').
 * @property {number} min
 * @property {number} max
 * @property {number} step
 * @property {number} defaultValue
 */

/**
 * @typedef {Object} NotebookKnobEntry
 * @property {string} spec         — the setup-factory export name the knob drives
 *                                   (e.g. 'setupWaveInterference'); this is the
 *                                   `spec` the builder cell passes to frqtl.knob.
 * @property {KnobSchema} knob      — the knob schema.
 */

/** @type {Object<string, NotebookKnobEntry>} keyed by notebook id. */
export const NOTEBOOK_KNOBS = {
    // gallery-wave-interference: the `quanta` knob = max quanta per source =
    // setupWaveInterference's `quantumLimit` option (setupWaveInterference.js).
    // More quanta → denser emission → an observably different fringe build-up.
    'gallery-wave-interference': {
        spec: 'setupWaveInterference',
        knob: {
            label: 'Particles',
            param: 'quanta',
            min: 100,
            max: 2000,
            step: 100,
            defaultValue: 800,
        },
    },
};
