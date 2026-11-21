/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/frame-data — The data-bubble schema contract.
 *
 * Single authority for the FrameData.data bag shape (§6 of
 * the engine contract). The bubble is GENERIC and engine-opaque:
 * SECTION_KEYS = ['detection', 'string_map']. The engine interprets NOTHING in
 * string_map — it ferries every key verbatim across the JS↔WASM boundary.
 *
 * The data bubble has two cross-engine reserved namespaces (+ a JS-only ext):
 *   detection  — written by the engine (MARK/DETECT primitives). Contains
 *                detector_name and any future detection tags.
 *   string_map — op-program-writable via `set 0.data.<key> = StrLit(value)`;
 *                a flat { key: string, ... } the engine carries opaque. ALL
 *                render data rides here as opaque keys: color is
 *                string_map['render.color'] (CSV 'r,g,b,a'); outline is
 *                string_map['render.outline'] === 'true'. Sugar/renderer code
 *                serializes on write and deserializes on read — there is NO
 *                typed `render` section (RETIRED: FrameDataRender,
 *                FrameMetaData.render, render_color SoA field, normalizeRender).
 *   ext        — developer-extensible; engine carries opaque, never reads.
 *                NOTE (D2 decision): ext is JS-only. The Rust side has no ext
 *                field — serde_wasm_bindgen v0.6 cannot round-trip a free-form
 *                map through JsValue without serde_json::Value (which drops its
 *                contents). ext writes are carried through JS-only paths and are
 *                not asserted in cross-engine conformance. If ext survives a
 *                JS→WASM→JS round-trip, treat it as undefined behavior.
 *
 * The canonical section key list drives conformance (see §5 — the data-bubble
 * round-trip oracle iterates over SECTION_KEYS to assert completeness).
 *
 * Usage:
 *   import { SECTION_KEYS, normalizeDataBubble, RENDER_INTENT_KEYS,
 *            normalizeRenderIntent } from 'lib/shim/frame-data/index.js';
 */



/**
 * Canonical section key table.
 * Conformance iterates this list — adding a section here MUST be accompanied
 * by a conformance assertion (cross-engine oracle, §5 item 2).
 *
 * Sections:
 *   detection  — engine-writable (MARK/DETECT); { detector_name: string|null }
 *   string_map — op-program-writable via `set 0.data.<key> = StrLit(value)`;
 *                flat object { key: string, ... }. Absent → null in normalized form.
 *                Cross-engine (JS + WASM). Owner: this file + FrameMetaData (tick_data.rs).
 *                ALL render hints ride here as opaque keys (render.color, render.outline);
 *                there is no typed `render` section.
 */
// 'render' section RETIRED — color (and all render hints) are opaque user-space data on
// string_map; the engine never carries a typed render section. Owner: this file + FrameMetaData.
const SECTION_KEYS = ['detection', 'string_map'];
// NOTE: 'ext' is deliberately excluded because it is not cross-engine assertable.

/**
 * Normalize a partial data bag to the full canonical shape.
 *
 * Rules:
 *   - Each reserved section (detection, string_map) is present as an object or null.
 *   - Absent → null (mirrors the JS toFrameData() :2872 and Rust skip_serializing_if).
 *   - Extra keys inside a section are preserved (pass-through).
 *   - The ext key is passed through as-is (JS-only, not normalized).
 *
 * @param {object|null|undefined} partial — partial data bag from a frame or FrameData
 * @returns {{ detection: object|null, string_map: object|null, ext: any }}
 */
function normalizeDataBubble(partial) {
    if (partial === null || partial === undefined) {
        return { detection: null, string_map: null };
    }
    return {
        detection: (partial.detection !== null && partial.detection !== undefined)
            ? partial.detection
            : null,
        string_map: (partial.string_map !== null && partial.string_map !== undefined &&
                     typeof partial.string_map === 'object')
            ? partial.string_map
            : null,
        ext: partial.ext !== undefined ? partial.ext : undefined,
    };
}

/**
 * Normalize the detection sub-section.
 *   detector_name: string|null
 */
function normalizeDetection(partial) {
    if (!partial) return { detector_name: null };
    return {
        detector_name: (partial.detector_name !== null && partial.detector_name !== undefined)
            ? String(partial.detector_name)
            : null,
    };
}

// ── Render-intent vocabulary (Part C) ────────────────────────────────────────
//
// Render-intent keys are opaque string_map keys that sugar objects and experiment
// setups write to describe per-frame render intent. Providers deserialize them on
// read — the engine carries them verbatim and interprets nothing (I1 preserved).
//
// Key list owned HERE (single source). Conformance assertions MUST be driven off
// this list so that adding a key automatically extends the test surface.
//
// Priority in any provider:
//   render.color (exact CSV r,g,b,a) > render.colorScheme ramp via LightColor > renderer default

/**
 * RENDER_INTENT_KEYS — the canonical set of render-intent string_map keys.
 *
 * Conformance tests iterate this list. To add a new render-intent key:
 *   1. Add the key string here.
 *   2. Add its allowed values to RENDER_INTENT_VALUES.
 *   3. Update normalizeRenderIntent to pass it through.
 *   4. Add a conformance assertion (cross-engine oracle).
 *   5. Update both providers to consume it.
 *
 * Current keys:
 *   render.color       — CSV 'r,g,b,a' exact RGBA override (highest priority); existing. OPEN-ID (no value set).
 *   render.outline     — 'true' | 'false' (or absent); existing. ENUM.
 *   render.shape       — 'ball' | 'box' | 'circle' | 'cube' | 'sphere' (per-frame shape; absent → renderer default). ENUM.
 *                        'sphere' = a TRUE 3D instanced-sphere mesh (three, _is3D), symmetric with 'cube';
 *                        in 2D / p5 it degrades to the filled 'ball' disc (no per-provider map — RenderShape
 *                        is the one authority; the three sphere path is gated on _is3D like the cube path).
 *   render.colorScheme — 'roygbiv' | 'warmcool' (named LightColor ramp; absent → default). ENUM.
 *   render.mesh        — external-geometry asset id (e.g. an Objaverse glTF id); absent → sprite/cube path.
 *                        OPEN-ID: no RENDER_INTENT_VALUES entry (accept-any-string); the renderer's RenderMesh
 *                        resolver FAILS LOUD at the output boundary if the asset cannot load — never silent.
 *   render.meshScale   — per-frame scale MULTIPLIER for the frame's render.mesh clone (a number as a string;
 *                        local override of the experiment-wide setRenderOption('meshScale',…)). OPEN-ID.
 *   render.meshRotation— per-frame euler rotation for the frame's render.mesh clone, a CSV of THREE radians
 *                        'rx,ry,rz' (same unit as a LargeObject's lo.meshRotation → clone.rotation.set). OPEN-ID.
 *                        (R3-3: previously written ad-hoc but undeclared + unread; declared
 *                        here at the owner and read per-clone in three-provider's _layoutMeshClones.)
 *
 * Two contract shapes:
 *   ENUM key    — has a RENDER_INTENT_VALUES[] array; decoders ferry the array (no re-listing); conformance-validated.
 *   OPEN-ID key — has NO RENDER_INTENT_VALUES entry → assertRenderIntentConformance accepts any string; the
 *                 decoder/resolver owns load-time validation and fails loud. Covers render.color and render.mesh.
 */
const RENDER_INTENT_KEYS = [
    'render.color',
    'render.outline',
    'render.shape',
    'render.colorScheme',
    'render.mesh',
    'render.meshScale',      // OPEN-ID — per-frame mesh scale multiplier (R3-3)
    'render.meshRotation'    // OPEN-ID — per-frame mesh euler radians CSV (R3-3)
];

/**
 * RENDER_INTENT_VALUES — allowed values for each key (for validation).
 * Keys without an entry accept any string (e.g. render.color is a CSV).
 */
const RENDER_INTENT_VALUES = {
    'render.shape':       ['ball', 'box', 'circle', 'cube', 'sphere'],
    'render.colorScheme': ['roygbiv', 'warmcool'],
    'render.outline':     ['true', 'false']
    // NOTE: render.color, render.mesh, render.meshScale, render.meshRotation are OPEN-ID keys —
    // deliberately NO entry here (accept-any-string: a CSV / an asset id / a number / an euler CSV).
    // Their decoders/resolvers own validation and fail loud at the boundary.
};

/**
 * normalizeRenderIntent — ferry a partial render-intent bag to the full canonical shape.
 *
 * Reads only the keys declared in RENDER_INTENT_KEYS; copies them into the normalized
 * bag if present; absent keys are omitted (not defaulted — the renderer defaults apply).
 * This is the "ferry the bag" pattern: the caller never re-enumerates the key list.
 *
 * @param {object|null|undefined} partial — partial string_map or explicit intent object
 * @returns {{ 'render.color'?: string, 'render.outline'?: string,
 *             'render.shape'?: string, 'render.colorScheme'?: string }}
 */
function normalizeRenderIntent(partial) {
    var bag = {};
    if (!partial || typeof partial !== 'object') return bag;
    for (var i = 0; i < RENDER_INTENT_KEYS.length; i++) {
        var k = RENDER_INTENT_KEYS[i];
        if (partial[k] !== undefined && partial[k] !== null) {
            bag[k] = String(partial[k]);
        }
    }
    return bag;
}

/**
 * assertRenderIntentConformance — throw if any key in a string_map bag violates the contract.
 *
 * Validates values for keys whose allowed set is enumerated in RENDER_INTENT_VALUES.
 * Keys with unconstrained values (render.color, render.outline) are passed through.
 * Unknown keys outside RENDER_INTENT_KEYS are ignored (the engine carries all keys opaque).
 *
 * @param {object} bag — string_map object to validate
 * @throws {Error} if a constrained key holds an unknown value
 */
function assertRenderIntentConformance(bag) {
    if (!bag) return;
    for (var i = 0; i < RENDER_INTENT_KEYS.length; i++) {
        var k = RENDER_INTENT_KEYS[i];
        var allowed = RENDER_INTENT_VALUES[k];
        if (allowed && bag[k] !== undefined && allowed.indexOf(bag[k]) === -1) {
            throw new Error(
                'render-intent conformance: key "' + k + '" has invalid value "' + bag[k] +
                '"; allowed: ' + allowed.join('|')
            );
        }
    }
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    SECTION_KEYS,
    normalizeDataBubble,
    normalizeDetection,
    RENDER_INTENT_KEYS,
    RENDER_INTENT_VALUES,
    normalizeRenderIntent,
    assertRenderIntentConformance
};
