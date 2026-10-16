/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/bundle/frqnb.js — the `.frqnb` teaching/gallery projection of a
 * recipe bundle (ws-experiments-walkthrough Bite 2).
 *
 * Builds a notebook OBJECT (never hand-emitted `<cell>` markup) and serializes
 * it THROUGH `lib/shim/notebook/format.js` `serialize` — the ONE notebook
 * serializer (no second serializer, no CELL_ATTRS mirror). The projection is:
 *
 *   1. markdown prose cell — title + teaching blurb.
 *   2. module cell (name './experiment.js') — carries the recipe source verbatim.
 *   3. canvas cell — wired to '<module>#buildExperiment', carrying the render
 *      intent (stage/seed/render3d/cameraPreset/renderOptions) ferried from the
 *      normalized renderState bag.
 *
 * Because it serializes through format.js, ANY new CELL_ATTR added there flows
 * through this projection automatically — the Bite-2 conformance gate asserts it.
 *
 * NOTE (Bite 5c — RESOLVED): the notebook REALM now executes `buildExperiment` as a
 * RecipeContext recipe (its co-init call + `exp.addObject`), NOT a `(frqtl,universe,options)` setup
 * factory. The canvas cell carries `shape="recipe"` (the CELL_ATTRS discriminator
 * owned by format.js); the shim's setup-builder synthesizes a `frqtl.RecipeContext` +
 * `exp.build(buildExperiment)` for a recipe-shape canvas (and FAILS LOUD on an unknown
 * shape). Before this, feeding the recipe-form `#buildExperiment` module through the
 * factory-only synthesizer threw "buildExperiment is not exported" (or, ESM-exported,
 * would have called it with the wrong `(frqtl,universe,options)` signature) — the
 * frqtl scene never built. That is the fix for the CEO-reported "frqnb broken for
 * frqtl rendering (egpt-math works)".
 *
 * Layer 2 (physics): none — pure notebook projection.
 */

'use strict';

import { serialize } from '../notebook/format.js';

var MODULE_NAME = './experiment.js';
var CANVAS_ID   = 'c-recipe';
var RECIPE_EXPORT = 'buildExperiment';

/**
 * Fold a normalized renderState `render` array ([{key,value}]) into a plain
 * `{key: value}` bag for the canvas cell's `renderOptions` (CELL_ATTRS 'opts' kind).
 * @param {{key:string,value:*}[]} render
 * @returns {object}
 */
function _renderOptionsBag(render) {
    var bag = {};
    if (Array.isArray(render)) {
        for (var i = 0; i < render.length; i++) {
            var row = render[i];
            if (row && typeof row.key === 'string' && row.key.length > 0) {
                bag[row.key] = row.value;
            }
        }
    }
    return bag;
}

/**
 * Build the `.frqnb` notebook string for a recipe bundle.
 *
 * @param {object} args
 * @param {string} args.name          — human-readable project name (notebook title + markdown heading).
 * @param {string} args.source        — the `experiment.js` recipe source (module cell body).
 * @param {object} [args.renderState] — a NORMALIZED renderState bag (from
 *   `lib/shim/render-state` normalizeSavedRenderState). Render intent is ferried
 *   onto the canvas cell; absent → the canvas carries stage/seed defaults only.
 * @param {string} [args.stage='600x400'] — canvas stage '<W>x<H>'.
 * @param {string} [args.prose]       — optional teaching blurb appended under the heading.
 * @returns {string} the serialized `.frqnb` notebook.
 */
export function buildFrqnb(args) {
    args = args || {};
    if (typeof args.source !== 'string' || args.source.length === 0) {
        throw new Error('[bundle/frqnb] buildFrqnb: args.source (experiment.js) is required.');
    }
    var name = (typeof args.name === 'string' && args.name.length > 0) ? args.name : 'FRQTL Recipe';
    var rs = args.renderState || {};
    var stage = (typeof args.stage === 'string' && args.stage.length > 0) ? args.stage : '600x400';
    var seed = (rs.seed != null && rs.seed !== '') ? String(rs.seed) : '42';

    var markdownBody = '# ' + name + '\n\n' +
        (typeof args.prose === 'string' && args.prose.length > 0
            ? args.prose
            : 'A FRQTL recipe. The module cell below is the `experiment.js` source of truth; ' +
              'the canvas runs it live.');

    var canvasCell = {
        type: 'canvas',
        id: CANVAS_ID,
        setup: MODULE_NAME + '#' + RECIPE_EXPORT,
        // Bite 5c: the module installs a `buildExperiment(exp)` RECIPE (RecipeContext
        // form), NOT a `(frqtl,universe,options)` setup factory — declare it so the
        // shim synthesizes the RecipeContext path (else it FAILS LOUD as a factory).
        shape: 'recipe',
        stage: stage,
        seed: seed
    };
    // Ferry render intent from the normalized renderState bag onto the canvas cell.
    if (rs.renderer === 'three') { canvasCell.render3d = true; }   // three IS the 3D display
    if (rs.camera && typeof rs.camera.preset === 'string' && rs.camera.preset.length > 0) {
        canvasCell.cameraPreset = rs.camera.preset;
    }
    var renderOptions = _renderOptionsBag(rs.render);
    if (Object.keys(renderOptions).length > 0) { canvasCell.renderOptions = renderOptions; }

    var notebook = {
        version: '1',
        title: name,
        cells: [
            { type: 'markdown', body: markdownBody },
            { type: 'module', name: MODULE_NAME, body: args.source },
            canvasCell
        ]
    };

    return serialize(notebook);
}
