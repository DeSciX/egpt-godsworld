/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/bundle/index.js — the recipe-bundle assembler + importer
 * (ws-experiments-walkthrough Bite 2). The canonical owner of the bundle format
 * (design §2): a folder that zips for download —
 *
 *   experiment.js      ← THE source of truth (the buildExperiment(exp) recipe)
 *   experiment.frqnb   ← teaching/gallery projection (notebook/format.serialize)
 *   index.html         ← standalone host (imports @descix/frqtl-sdk, bootRecipe)
 *   manifest.json      ← Module envelope minus `source` + bundle-only fields (E1)
 *   preview.png        ← optional golden screenshot
 *
 * PURE + DOM-free: emits/consumes `Uint8Array`. STUDIO's export button and any
 * future DeSciX publisher CONSUME this — passing the generated `experiment.js`
 * source + envelope + renderState DOWN (this module never imports codegen/
 * save-state — those live above the shim; the arrow stays one-way). The browser
 * `Blob`+`a.click` download trigger is a THIN feature-side helper.
 *
 * Layer 2 (physics): none — pure format/packaging.
 */

'use strict';

import { buildManifest, manifestToEnvelope } from './manifest.js';
import { buildFrqnb } from './frqnb.js';
import { buildIndexHtml } from './indexHtml.js';
import { zipStore, unzipStore, textBytes, bytesText } from './zip.js';
import { normalizeSavedRenderState } from '../render-state/index.js';

// ── Canonical bundle file names ──────────────────────────────────────────────
export var FILE_EXPERIMENT_JS   = 'experiment.js';
export var FILE_EXPERIMENT_FRQNB = 'experiment.frqnb';
export var FILE_INDEX_HTML       = 'index.html';
export var FILE_MANIFEST_JSON    = 'manifest.json';
export var FILE_PREVIEW_PNG      = 'preview.png';

/**
 * Assemble a recipe bundle from a Module envelope + bundle inputs.
 *
 * Conceptually the dispatch's `(source, envelopeMeta, renderState, previewPngBytes,
 * sdkVersion)`: here `source` + `renderState` + `envelopeMeta` arrive together AS
 * the Module envelope (the exact shape STUDIO's Save path already builds), so the
 * bundle↔envelope round-trip is a clean identity. `manifest` ferries the envelope
 * minus `source` (E1) — no field re-enumeration.
 *
 * @param {object} envelope — a `lib/shim/storage/modules.js` Module envelope
 *   (`{id,name,source,renderState,…}`; `source` = the recipe, REQUIRED).
 * @param {object} opts
 * @param {string} opts.sdkVersion — REQUIRED CDN pin (derived, never a literal).
 * @param {Uint8Array|null} [opts.previewPngBytes] — preview image bytes, or null.
 * @param {string} [opts.stage='600x400'] — canvas stage for the .frqnb projection.
 * @param {string} [opts.prose] — optional teaching blurb for the .frqnb markdown.
 * @returns {{files: {name:string, bytes:Uint8Array}[], zipBytes: Uint8Array}}
 */
export function assembleBundle(envelope, opts) {
    if (!envelope || typeof envelope !== 'object') {
        throw new Error('[bundle] assembleBundle(envelope): envelope must be an object.');
    }
    if (typeof envelope.source !== 'string' || envelope.source.length === 0) {
        throw new Error('[bundle] assembleBundle: envelope.source (the recipe) is required.');
    }
    opts = opts || {};
    var preview = (opts.previewPngBytes instanceof Uint8Array && opts.previewPngBytes.length > 0)
        ? opts.previewPngBytes : null;

    var manifest = buildManifest(envelope, {
        sdkVersion: opts.sdkVersion,
        preview: preview ? FILE_PREVIEW_PNG : null
    });

    var normalizedRs = normalizeSavedRenderState(envelope.renderState);

    var files = [
        { name: FILE_EXPERIMENT_JS,    bytes: textBytes(envelope.source) },
        { name: FILE_EXPERIMENT_FRQNB, bytes: textBytes(buildFrqnb({
            name: envelope.name, source: envelope.source,
            renderState: normalizedRs, stage: opts.stage, prose: opts.prose
        })) },
        { name: FILE_INDEX_HTML,       bytes: textBytes(buildIndexHtml({
            name: envelope.name, sdkVersion: opts.sdkVersion, renderState: normalizedRs,
            scripts: Array.isArray(envelope.scripts) ? envelope.scripts : []   // DX-3: setup-factory delta
        })) },
        { name: FILE_MANIFEST_JSON,    bytes: textBytes(JSON.stringify(manifest, null, 2)) }
    ];
    if (preview) { files.push({ name: FILE_PREVIEW_PNG, bytes: preview }); }

    return { files: files, zipBytes: zipStore(files) };
}

/**
 * Import a recipe bundle: recover the Module envelope (source re-attached from
 * `experiment.js` per E1) + the preview bytes.
 *
 * @param {Uint8Array} zipBytes — a bundle `.zip` (from `assembleBundle`).
 * @returns {{envelope: object, previewPngBytes: Uint8Array|null}}
 */
export function importBundle(zipBytes) {
    var entries = unzipStore(zipBytes);
    var byName = Object.create(null);
    for (var i = 0; i < entries.length; i++) { byName[entries[i].name] = entries[i].bytes; }

    if (!byName[FILE_MANIFEST_JSON]) {
        throw new Error('[bundle] importBundle: ' + FILE_MANIFEST_JSON + ' missing from the archive.');
    }
    if (!byName[FILE_EXPERIMENT_JS]) {
        throw new Error('[bundle] importBundle: ' + FILE_EXPERIMENT_JS + ' missing from the archive.');
    }

    var manifest;
    try {
        manifest = JSON.parse(bytesText(byName[FILE_MANIFEST_JSON]));
    } catch (e) {
        throw new Error('[bundle] importBundle: ' + FILE_MANIFEST_JSON + ' is not valid JSON — ' + (e && e.message));
    }
    var source = bytesText(byName[FILE_EXPERIMENT_JS]);
    var envelope = manifestToEnvelope(manifest, source);
    var previewPngBytes = byName[FILE_PREVIEW_PNG] || null;

    return { envelope: envelope, previewPngBytes: previewPngBytes };
}
