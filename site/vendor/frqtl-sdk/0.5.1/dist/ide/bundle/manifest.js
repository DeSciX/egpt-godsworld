/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/bundle/manifest.js — the bundle manifest as an ENVELOPE FERRY
 * (ws-experiments-walkthrough Bite 2, CEO ruling E1).
 *
 * ── The rule (E1): manifest = the Module envelope minus `source` ─────────────
 *
 * The bundle is a projection of the `lib/shim/storage/modules.js` Module
 * envelope. `experiment.js` = `module.source`. The manifest carries EVERYTHING
 * ELSE from the envelope, ferried VERBATIM (`{...envelope}` minus `source`) plus
 * a small set of bundle-only fields. Critically this module NEVER re-enumerates
 * the envelope's field list (`{name: mod.name, renderState: mod.renderState, …}`)
 * — that would be a schema mirror of modules.js. It spreads the whole envelope
 * and deletes the ONE key (`source`) the sibling `experiment.js` file owns. Any
 * field modules.js adds in future rides through automatically; `renderState`
 * rides through as an ordinary envelope field, opaque (never parsed here).
 *
 * ── Bundle-only fields ───────────────────────────────────────────────────────
 *
 *   sdkVersion : string  — the `@descix/frqtl-sdk@<pin>` the index.html imports.
 *                          A VALUE passed IN by the caller (the feature side
 *                          DERIVES it from the built SDK's package.json at export
 *                          time — truth-in-labeling; NEVER a literal in bundle
 *                          code). REQUIRED — FAIL-LOUD when absent.
 *   preview    : string|null — the preview image filename ref (e.g. 'preview.png'),
 *                          or null when no preview was captured.
 *   descix     : {}      — reserved inert publish block (DeSciX now-vs-later).
 *
 * Layer 2 (physics): none — pure metadata projection.
 */

'use strict';

/** The envelope key the sibling `experiment.js` file owns (never in the manifest). */
export var SOURCE_KEY = 'source';

/** Bundle-only manifest keys (NOT envelope fields — stripped on import). */
export var BUNDLE_ONLY_KEYS = ['sdkVersion', 'preview', 'descix'];

/**
 * Build the manifest object from a Module envelope + bundle-only inputs.
 *
 * @param {object} envelope   — a `lib/shim/storage/modules.js` Module envelope
 *   (MUST carry `source`; every other field is ferried verbatim).
 * @param {object} opts
 * @param {string} opts.sdkVersion — REQUIRED; the CDN pin (e.g. '0.1.7').
 * @param {string|null} [opts.preview] — preview filename ref, or null/omitted.
 * @returns {object} the manifest (JSON-serializable).
 */
export function buildManifest(envelope, opts) {
    if (!envelope || typeof envelope !== 'object') {
        throw new Error('[bundle/manifest] buildManifest(envelope): envelope must be an object.');
    }
    opts = opts || {};
    if (typeof opts.sdkVersion !== 'string' || opts.sdkVersion.length === 0) {
        throw new Error('[bundle/manifest] buildManifest: opts.sdkVersion is REQUIRED (a derived value, ' +
            'never a literal) — the index.html CDN pin depends on it.');
    }

    // Ferry the WHOLE envelope minus `source` (no per-field re-enumeration).
    var manifest = Object.assign({}, envelope);
    delete manifest[SOURCE_KEY];

    // Bundle-only fields.
    manifest.sdkVersion = opts.sdkVersion;
    manifest.preview = (opts.preview != null) ? opts.preview : null;
    manifest.descix = {};   // reserved inert publish block

    return manifest;
}

/**
 * Recover the Module envelope from a manifest + the `experiment.js` source.
 * Inverse of `buildManifest`: strips the bundle-only fields and re-attaches
 * `source`. The result is a full Module envelope (validatable by modules.js).
 *
 * @param {object} manifest — the parsed manifest.json object.
 * @param {string} source   — the `experiment.js` recipe source.
 * @returns {object} the reconstructed Module envelope.
 */
export function manifestToEnvelope(manifest, source) {
    if (!manifest || typeof manifest !== 'object') {
        throw new Error('[bundle/manifest] manifestToEnvelope(manifest): manifest must be an object.');
    }
    if (typeof source !== 'string') {
        throw new Error('[bundle/manifest] manifestToEnvelope: source (experiment.js) must be a string.');
    }
    var envelope = Object.assign({}, manifest);
    for (var i = 0; i < BUNDLE_ONLY_KEYS.length; i++) {
        delete envelope[BUNDLE_ONLY_KEYS[i]];
    }
    envelope[SOURCE_KEY] = source;
    return envelope;
}
