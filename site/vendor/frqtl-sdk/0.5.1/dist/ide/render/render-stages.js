/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render/render-stages — THE render-pipeline stage vocabulary contract.
 *
 * Peer of `lib/shim/frame-data` (`RENDER_INTENT_KEYS` — the per-frame render-intent
 * vocabulary) and `lib/shim/expr/ast-schema` (`NODE_KINDS`/`OP_KINDS` — the op-program
 * vocabulary): the shim owns every cross-layer contract vocabulary, and consumers FERRY
 * the exported list rather than re-enumerating it (the schema-mirror rule). Dual
 * CommonJS/`window` module with ZERO ES `export` statements, so it is consumable BOTH by
 * page-context classic scripts under the `/frqtl` mount (`FrqtlApp.js` resolves
 * `window.RenderStages` through a named FAIL-LOUD guard) and by an ESM consumer above the
 * shim — the `heat-colormap.js` precedent, same directory.
 *
 * ── What this contract IS (and deliberately is NOT) ──────────────────────────
 *
 * The render pipeline already EXISTS as an ordered sequence of transforms, and each of
 * its transform-registration surfaces already exists too:
 *
 *   - `scene` appearance registers as the per-provider `renderCapabilities()`
 *     descriptor knobs (R4/R5 effect layers).
 *   - the scene→composite segment registers as the ORDERED `filterSpec` queue
 *     (`Filters.js` catalog + `renderer.filter({name, glsl, uniforms})`).
 *   - `field` registers as ONE authored canonical module (`FieldBuilder`).
 *   - `tick` is the frame-data bubble — the engine-opaque `string_map` render intent.
 *
 * This module adds **ZERO new registration mechanisms**. It contributes exactly three
 * things those mechanisms never had: a NAME for the pipeline point each attaches to, a
 * way to READ the data at a named point (a tap), and PROVENANCE on what a tap returned.
 * If a change to this file starts to look like a `registerStage()` / `onStage(cb)` /
 * transform-plugin registry, that is the failure mode this contract exists to prevent —
 * a new render transform lands as registered data on its stage's EXISTING surface, never
 * as bespoke provider code and never as a new uber-registry
 * (docs/internal/engine/RENDERER_CONTRACT.md §9, the standing veto).
 *
 * ── Layer 1: API contract ───────────────────────────────────────────────────
 *
 *   RENDER_STAGES          — the ordered, named, COMPLETE canonical stage list.
 *   STAGE_FORMATS          — stage → payload format tag ('framedata' | 'r8' | 'rgba8').
 *   finalStage()           — the LAST stage. `runner.captureStill()` derives its stage
 *                            from this, never from a hardcoded 'composite' literal.
 *   upstreamStages(stage)  — the ordered stage names strictly BEFORE `stage`.
 *   assertStage(stage)     — throw-or-return; the message lists the whole table.
 *   stageNotTappableError(stage, who) — the DISTINCT error for a stage that is a real
 *                            member of the table but has no tap executor on the active
 *                            provider (v1: `scene`). Never conflated with unknown-stage.
 *   SCHEMA_VERSION         — the `v` stamped on BOTH records (R1).
 *   SCENE_KEYS             — the RUN-INVARIANT record: the regeneration input.
 *   STILL_KEYS             — the SERIALIZED still record: coordinates within a scene.
 *   STILL_DERIVED_KEYS     — in-memory conveniences that are NOT serialized (composedOf).
 *   STILL_BAG_KEYS         — the full IN-MEMORY still bag = STILL_KEYS + derived.
 *   STILL_PROVENANCE_KEYS  — the provenance subset, DERIVED (bag keys minus payload keys).
 *   RUNTIME_MUTATION_SURFACES — the mutability line, declared: which APIs touch which
 *                            still fields. The drift gate runs off this.
 *   deepPlainCopy(value)   — THE plain-data deep-copy authority (payload + scene record).
 *   normalizeScene(partial)— ferry a partial scene bag to the full SceneRecord, FAIL-LOUD.
 *   canonicalizeScene(rec) — the ONE canonical byte-string a scene identity is taken over.
 *   sceneHash(rec)         — `Promise<'sha256:<hex>'>`; the content address.
 *   normalizeStill(partial)— ferry a partial bag to the full canonical shape, FAIL-LOUD.
 *   SCENE_SURFACE_ATTR     — the scene-surface marker attribute, RE-EXPORTED from its owner
 *                            (compat/renderer/renderer-provider-contract.js).
 *
 * ── The stage table ─────────────────────────────────────────────────────────
 *
 *   tick       TickData.frameData — pure physics data, format 'framedata'. The frame-data
 *              bubble IS stage 0 of this pipeline: the engine-boundary law ("a new
 *              behavior is op-program DATA, never engine code") and the render-stack law
 *              ("a new transform is registered data on its stage's surface") are the same
 *              law at two altitudes, and this stage is where they meet.
 *   field      the `FieldBuilder` heightfield — format 'r8', physics-pixel space,
 *              y-down/top-left, at field resolution. Backend-INDEPENDENT by construction
 *              (the one field source), so its tap is runner-side and every BYO provider
 *              gets it for free.
 *   scene      the frozen three-layer composite (backdrop → particle → large-object,
 *              RENDERER_CONTRACT §8) BEFORE the filter passes — format 'rgba8'. NAMED
 *              here because the pipeline genuinely has this point; its tap EXECUTOR is
 *              deferred to its first caller (v1 ships no `scene` tap → the distinct
 *              `stageNotTappableError`). "Capture without the water shader" composes the
 *              existing knobs instead: setFilterActive(name,false) → repaint() → capture.
 *   composite  after the ordered filter passes — format 'rgba8'. THE final stage, tapped
 *              by the provider's OPTIONAL `captureStill()` (RENDERER_CONTRACT §1a.4).
 *
 * ── Provenance is load-bearing, not decoration ───────────────────────────────
 *
 * The tap consumers are VLA training and the JSONL finetuning corpus. A pre-render tap
 * that is INDISTINGUISHABLE from a post-bloom tap is not a missing feature — it is a
 * silently corrupted training corpus that teaches the wrong mapping from code to
 * picture. So every bag states which stage produced it AND what was active:
 *
 *   v                 the schema version                      (stamped by the normalizer)
 *   scene             the content hash of the SceneRecord this  (stamped by the dispatcher)
 *                     still is coordinates within
 *   stage             the stage name from RENDER_STAGES        (stamped by the dispatcher)
 *   tick              the tick the channel derives from        (stamped by the dispatcher)
 *   format            STAGE_FORMATS[stage]                     (stage implementation)
 *   width, height     payload buffer dims                      (stage implementation)
 *   cssWidth/cssHeight the canvas CSS size at capture, or null  (stage implementation)
 *   fieldOpts         the FieldBuilder options the field tap    (stage implementation)
 *                     ran with; null on every other stage
 *   filtersApplied    ORDERED filter names actually run, or []  (the PROVIDER — its own
 *                     `_filters` list is the one ordered authority; NEVER derived from the
 *                     runner's unordered `_activeFilters` map, which is also blind to a
 *                     direct BYO `prov.filter()` call and would therefore lie for exactly
 *                     the BYO case)
 *   renderBaseCanvas  the boolean in effect at composite, or null on a stage where
 *                     nothing composited                        (the provider)
 *   filterTime        the `uTime` the filter passes drew with (simulation seconds at the
 *                     rendered tick, RendererProviderContract.filterTime), or null when no
 *                     filter ran or the stage composited nothing  (the provider)
 *   pose              `cameraControl.getOrbit()` (the 2D bag is {distance, target}), or null
 *                     with no camera pose control at all (the dispatcher, via the
 *                     ONE camera authority — a derived read, no new machinery; without it
 *                     a 3D composite cannot be co-registered to the field)
 *   composedOf        upstreamStages(stage) — the ordered upstream stage names, DERIVED
 *                     from this table. STRUCTURAL: it says what precedes this stage in the
 *                     canonical pipeline, which is what "the full stack of transforms
 *                     composed" means at the API level. It is NOT a per-capture run
 *                     record — `filtersApplied` (ordered, from the provider) and
 *                     `renderOptions` are the run record.
 *   renderOptions     the live value of each key the active provider DECLARES via
 *                     `renderCapabilities()`, driven off that declared list so a newly
 *                     declared R4/R5 knob appears in provenance with zero capture-code
 *                     edits. `filter.*` capability keys are deliberately ABSENT here:
 *                     their authority is `filtersApplied`, and a second filter read would
 *                     be the two-sources bug. (Stamped by the dispatcher.)
 *
 * The RUN-INVARIANT provenance — `seed`, `sourceRef`, `build`, `physicsW/H`, `projection` —
 * does NOT ride each still. It lives ONCE on the SceneRecord (`SCENE_KEYS`), which the still
 * references by content hash. 3D scenes are high bandwidth; repeating their header on every
 * capture is the cost this split removes.
 *
 * NO provenance field is ever caller-supplied — a caller-supplied provenance field is the
 * hardcoded-backend-label anti-pattern (dep-map rule 4). `normalizeStill`/`normalizeScene`
 * ENFORCE this for the derived fields: a `composedOf` or a `v` that disagrees THROWS.
 *
 * ── Channel semantics (what the numbers MEAN) ─────────────────────────────────
 *
 *   framedata — the frame-data bubble's OWN published contract; `FrameDataSchema` is its
 *               owner and this contract points AT it and never restates its fields.
 *   r8        — gain-scaled, clamped [0,255], optionally blurred soft-splat fullness
 *               density: a dimensionless INSTRUMENT RESPONSE, NOT calibrated mass, and
 *               comparable only between captures at equal `fieldOpts`.
 *   rgba8     — row-major from the TOP-LEFT origin, colour space **sRGB**, alpha
 *               **NON-premultiplied**. An encoder cannot guess either, so both are stated:
 *               three initialises `alpha:false` (opaque, a=255) and p5's 2D `getImageData`
 *               is unpremultiplied by spec.
 *
 * ── Layer 2: physics behaviour ──────────────────────────────────────────────
 *
 * ZERO physics. This is an output-boundary vocabulary: it names points in the render
 * pipeline and describes what came out of them. Nothing here reads, writes, or gates a
 * frame, a dimension, or a tick — a change to this file cannot move a canonical-bench
 * golden, and if one moves, physics leaked into the convenience layer.
 *
 * Usage:
 *   const { RENDER_STAGES, finalStage, normalizeStill } = require('lib/shim/render/render-stages');
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — the same wrapper every shim
//    contract and game-layer object carries). This file loads in the browser as a classic
//    <script> from stack-boot.js, and classic scripts share ONE global lexical
//    environment: an unwrapped top-level `function _fail(...)` here would silently
//    OVERWRITE a same-named helper in a sibling script (last loaded wins), which is
//    invisible to `node --test` by construction. Everything below is PRIVATE; the only
//    thing reaching the shared scope is the explicit module.exports / window.RenderStages
//    assignment at the bottom. Enforced by
//    lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

/**
 * RENDER_STAGES — the ordered, named, COMPLETE canonical render-pipeline stage list.
 *
 * Ordered EARLIEST → LATEST along the per-tick data flow. Consumers (the tap MECHANISM
 * `objects/instruments/capture.js`, the conformance gate, any host UI) FERRY this array;
 * a hand-written stage list anywhere else is the schema-mirror bug this ownership
 * prevents, and a stage added here appears in every consumer with zero consumer edits.
 *
 * To add a stage: add it HERE in pipeline position, add its STAGE_FORMATS entry, and add
 * its tap executor. Nothing else changes — `finalStage()`, `upstreamStages()`,
 * `composedOf`, the conformance table and `runner.captureStill()` all re-derive.
 *
 * @type {string[]}
 */
var RENDER_STAGES = ['tick', 'field', 'scene', 'composite'];

/**
 * STAGE_FORMATS — stage name → payload format tag.
 *
 *   'framedata' → `data` is the Array of FrameData objects (pure physics data)
 *   'r8'        → `data` is a Uint8Array, one byte per texel (the heightfield)
 *   'rgba8'     → `data` is a Uint8ClampedArray, 4 bytes per pixel, ROW-MAJOR from the
 *                 TOP-LEFT origin (a provider reading a bottom-left WebGL framebuffer
 *                 flips the rows itself — callers never see backend row order)
 *
 * @type {Object<string,string>}
 */
var STAGE_FORMATS = {
    tick:      'framedata',
    field:     'r8',
    scene:     'rgba8',
    composite: 'rgba8'
};

/**
 * SCHEMA_VERSION — the `v` stamped on BOTH records (R1).
 *
 * The normalizer IS the version authority: a record's `v` is the contract version that
 * normalized it, and a caller-supplied `v` that disagrees THROWS (same discipline as
 * `composedOf`). Bump on ANY semantic change to `SCENE_KEYS`/`STILL_KEYS`/`STAGE_FORMATS`.
 * Corpus tooling refuses to mix versions silently — which is the whole point: without `v`, a
 * regenerated corpus cannot be safely mixed across generations, and the mixing is invisible.
 * @type {number}
 */
var SCHEMA_VERSION = 3;

/**
 * SCENE_KEYS — the RUN-INVARIANT record. The regeneration input, hashed into an identity.
 *
 * The video-container shape: ONE scene record (the header) + many light still records (the
 * frames of that video). A 3D corpus stores one scene plus N tiny stills instead of
 * repeating the whole header on every capture.
 *
 * ── The line is drawn by MUTABILITY, not by category (the trap) ──
 * ONLY what CANNOT change within a run is hoisted here. Several fields LOOK scene-level and
 * are not: `filtersApplied` (a mid-run `setFilterActive('water', false)` IS the ring
 * measurement control), `pose` (a camera path changes it every tick), `cssWidth`/`cssHeight`
 * (viewport resize). Hoisting any one of them would mislabel EVERY subsequent still —
 * corpus corruption arriving through the back door of a bandwidth optimisation. The
 * `RUNTIME_MUTATION_SURFACES` table below makes that a CI failure instead of a discovery at
 * training time.
 *
 *   v          — schema version (on BOTH records: they are encountered separately and must
 *                self-describe; 4 bytes is not the bandwidth problem)
 *   seed       — the RNG seed. Fixed at universe init. Two of the regeneration triple
 *                (code, seed, tick) were previously absent — this is one of them.
 *   sourceRef  — experiment/rung identity, registered ONCE at setup (nullable). A legitimate
 *                authority set at attach time, NOT per-capture caller-supplied provenance.
 *                `null` is HONEST for an ad-hoc universe — the corpus row then carries the
 *                code itself. The two corpus modes live at the harness, not in the record.
 *   build      — the runtime build pin, DERIVED from the boot authorities, never a literal.
 *                The package is pinned by CONTENT (`wasmSha256`), never by the URL that
 *                served it: an origin is a deployment fact, not a regeneration input.
 *   physicsW/H — universe bounds, init-fixed. (NOTE: the CANVAS may be resized mid-run; the
 *                still's own `width`/`height` carry that. These are the physics bounds.)
 *   projection — camera intrinsics, provider-stamped. Scene-level because the DISPLAY
 *                provider is boot-fixed and OBSERVERS are live (RENDERER_CONTRACT §9): the
 *                one display provider owns canvas/camera/projection and swapping it is a
 *                reload; observers own no projection, so scene identity never moves mid-run.
 *                Without it a 3D pixel→world mapping is UNDERDETERMINED offline.
 *
 * @type {string[]}
 */
var SCENE_KEYS = ['v', 'seed', 'sourceRef', 'build', 'physicsW', 'physicsH', 'projection'];

/**
 * STILL_KEYS — the SERIALIZED still record: coordinates WITHIN a scene, plus the payload and
 * everything that can vary per capture. `scene` is the content hash of the SceneRecord this
 * still belongs to, so any drift between what a still claims and what the scene was is
 * DETECTABLE (recompute the hash), never silent.
 * @type {string[]}
 */
var STILL_KEYS = [
    'v', 'scene', 'stage', 'format', 'tick',
    'data', 'width', 'height', 'cssWidth', 'cssHeight',
    'pose', 'filtersApplied', 'renderBaseCanvas', 'filterTime', 'renderOptions', 'fieldOpts'
];

/**
 * STILL_DERIVED_KEYS — present on the IN-MEMORY bag as a convenience, deliberately NOT in
 * `STILL_KEYS`: `composedOf` is derived from (`stage`, the `v`-versioned table), so a
 * consumer re-derives it. Serializing a derivable is stored drift.
 * @type {string[]}
 */
var STILL_DERIVED_KEYS = ['composedOf'];

/**
 * The full IN-MEMORY still bag shape = serialized keys + derived conveniences.
 * `normalizeStill` guarantees every one of these is PRESENT (a value may legitimately be
 * `null`), so no consumer tests for key existence and no gate re-types the list.
 * @type {string[]}
 */
var STILL_BAG_KEYS = STILL_KEYS.concat(STILL_DERIVED_KEYS);

/** The payload/geometry keys — everything else on a still is provenance. @type {string[]} */
var STILL_PAYLOAD_KEYS = ['data', 'width', 'height'];

/**
 * The PROVENANCE subset of the still bag — DERIVED from the two lists above rather than
 * hand-listed, so a new still field lands in provenance automatically.
 * @type {string[]}
 */
var STILL_PROVENANCE_KEYS = STILL_BAG_KEYS.filter(function (k) {
    return STILL_PAYLOAD_KEYS.indexOf(k) === -1;
});

/**
 * RUNTIME_MUTATION_SURFACES — THE MUTABILITY LINE, DECLARED.
 *
 * Every API that can change what a capture reports, mapped to the still fields it touches.
 * The conformance gate asserts each listed field is in `STILL_KEYS` and in NO case in
 * `SCENE_KEYS` — so a future attempt to hoist a toggleable field into the scene header
 * fails a test instead of quietly rotting a corpus. Declared HERE (not in the test) so the
 * line is self-documenting at the contract and a new mutation surface is added once.
 * @type {Object<string,string[]>}
 */
var RUNTIME_MUTATION_SURFACES = {
    'cameraControl.setOrbit/look/move/setPreset': ['pose'],
    'setFilterActive / provider.filter / removeFilter': ['filtersApplied', 'filterTime'],
    'setRenderOption': ['renderOptions', 'renderBaseCanvas'],
    'canvas resize (setSize)': ['width', 'height', 'cssWidth', 'cssHeight'],
    'FieldBuilder options at the field tap': ['fieldOpts']
};

/** The rgba8 payload constructor name, for the format check below. */
function _isStageKnown(stage) { return RENDER_STAGES.indexOf(stage) !== -1; }

/**
 * finalStage() — the LAST stage of the canonical pipeline.
 *
 * `runner.captureStill()` (the convenience) resolves its stage THROUGH this function, so
 * "capture the fully composed stack" follows the table by construction: if the pipeline
 * ever grows a later stage, the convenience follows it with no edit. A hardcoded
 * `'composite'` literal in a convenience would be truth-in-labeling drift at the API
 * level — the API would claim "final" while naming a stage that is no longer last.
 *
 * @returns {string}
 */
function finalStage() { return RENDER_STAGES[RENDER_STAGES.length - 1]; }

/**
 * upstreamStages(stage) — the ordered stage names strictly BEFORE `stage` in the table.
 * This is the derivation behind every bag's `composedOf`. Structural (pipeline position),
 * not a per-capture run record — see the module docstring.
 *
 * @param {string} stage
 * @returns {string[]} a fresh array (never the shared table)
 * @throws {Error} on an unknown stage
 */
function upstreamStages(stage) {
    assertStage(stage);
    return RENDER_STAGES.slice(0, RENDER_STAGES.indexOf(stage));
}

/**
 * assertStage(stage) — throw-or-return. The message ENUMERATES the whole table, so a
 * typo'd stage name names its own fix (the `getRenderOption` fail-loud precedent).
 *
 * @param {string} stage
 * @returns {string} the same stage, when valid
 * @throws {Error} when `stage` is absent or not a member of RENDER_STAGES
 */
function assertStage(stage) {
    if (!_isStageKnown(stage)) {
        throw new Error('[RenderStages] unknown stage ' + JSON.stringify(stage) +
            ' — the canonical pipeline is [' + RENDER_STAGES.join(', ') + ']. ' +
            'The stage argument is REQUIRED on the tap mechanism (a default is the ' +
            'convenience\'s job, not the mechanism\'s). (FAIL-LOUD.)');
    }
    return stage;
}

/**
 * stageNotTappableError(stage, who) — the DISTINCT error for a stage that IS a real member
 * of the table but has no tap executor available (v1: `scene`; or `composite` on a
 * provider that does not implement the OPTIONAL `captureStill()`).
 *
 * Kept separate from `assertStage`'s unknown-stage throw on purpose: "you named something
 * that does not exist" and "you named a real pipeline point nothing can read yet" are
 * different diagnoses with different fixes, and collapsing them would send a caller
 * hunting for a typo that is not there.
 *
 * @param {string} stage
 * @param {string} who — the party that cannot tap it (e.g. 'the active renderer provider')
 * @returns {Error} (the caller throws it — never a null bag, never a blank still)
 */
function stageNotTappableError(stage, who) {
    return new Error('[RenderStages] stage ' + JSON.stringify(stage) + ' is known, but ' +
        'not tappable by ' + (who || 'the active provider') + '. Known stages: [' +
        RENDER_STAGES.join(', ') + ']. A tap executor is added when a real caller for it ' +
        'appears — never a null image or an empty bag in the meantime. (FAIL-LOUD.)');
}

function _fail(msg) {
    throw new Error('[RenderStages.normalizeStill] ' + msg + ' (FAIL-LOUD.)');
}

function _posInt(v, name) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0 || Math.floor(v) !== v) {
        _fail(name + ' must be a positive integer, got ' + String(v));
    }
    return v;
}

// ── `data` IS IMMUTABLE BY CONTRACT — snapshot at capture ─────────────────────────
//
// A still that keeps changing is not a still. The `tick` stage's payload arrives as the
// LIVE `TickData.frameData` the engine just marshalled, and the render contract makes NO
// promise that the marshalling layer builds fresh arrays/objects per tick — so a record
// holding that reference is (a) an aliasing hazard the moment any layer reuses a buffer and
// (b) not serialization-safe, because a live object graph with prototype accessors does not
// survive JSON. For a training corpus that is the worst class of defect: every record
// silently drifts toward the latest tick and nothing announces it. So the normalizer
// SNAPSHOTS.
//
// Snapshotting (rather than ratifying a fresh-per-tick guarantee with the engine-boundary
// owner) is the ruled choice because it buys the SECOND property too: the snapshot is plain
// data, hence JSON-safe, which is the prerequisite for any on-disk corpus row.

/**
 * Every READABLE property name of an object, own and inherited, data and accessor.
 *
 * Why not `Object.keys` / `structuredClone` / a JSON round-trip: all three copy only OWN
 * ENUMERABLE DATA properties, and the engine's `FrameData.rect` is a `Rectangle` whose
 * `x`/`y`/`left`/`top`/`right`/`bottom` are NON-ENUMERABLE PROTOTYPE ACCESSORS over private
 * `_x`/`_y` backing fields. Any of those three would therefore have produced a snapshot
 * whose `rect.x` was silently `undefined` — swapping one silent-data-loss bug for another,
 * and forcing a corpus consumer to read a private field it should never know about.
 *
 * This walk FLATTENS accessors into plain data. It is deliberately GENERIC — it knows no
 * field names, so it cannot drift from `FrameDataSchema` (the frame-data bubble's owner,
 * which this contract points AT and never restates). The backing field AND its accessor both
 * survive (e.g. both `_x` and `x`) because the walk knows no naming convention — a corpus
 * writer that wants only one may project.
 *
 * Functions are split by OWNERSHIP, deliberately: an INHERITED function is a METHOD and is
 * skipped (that is what flattening means), while an OWN function-valued field is a genuine
 * contract violation and is INCLUDED here so the clone can THROW naming its path. Silently
 * dropping it would be the fail-silent behaviour this whole change exists to remove.
 *
 * @param {object} obj
 * @returns {string[]}
 */
function _readableKeys(obj) {
    var keys = [];
    var seen = Object.create(null);
    var o = obj;
    var own = true;
    while (o && o !== Object.prototype && o !== Array.prototype) {
        var names = Object.getOwnPropertyNames(o);
        for (var i = 0; i < names.length; i++) {
            var k = names[i];
            if (k === 'constructor' || seen[k]) { continue; }
            var d = Object.getOwnPropertyDescriptor(o, k);
            if (d.get) { seen[k] = true; keys.push(k); }
            else if (own || typeof d.value !== 'function') { seen[k] = true; keys.push(k); }
        }
        o = Object.getPrototypeOf(o);
        own = false;
    }
    return keys;
}

function _isTypedArray(v) {
    return v && typeof v === 'object' && typeof v.BYTES_PER_ELEMENT === 'number' &&
           typeof v.length === 'number' && typeof v.constructor === 'function';
}

/**
 * Deep PLAIN-DATA clone. Primitives pass through; typed arrays are copied; arrays and
 * objects are rebuilt as plain `Array`/`Object` with accessors flattened. A FUNCTION value
 * THROWS naming its path — a function inside a data payload means the payload is not
 * serialization-safe, which is precisely what this contract requires it to be.
 * @private
 */
function _deepPlainClone(v, path) {
    if (v === null || v === undefined) { return null; }
    var t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') { return v; }
    if (t === 'function') {
        _fail('the payload carries a FUNCTION at ' + path + ' — a still record must be plain, ' +
              'serialization-safe data');
    }
    if (t !== 'object') {
        _fail('the payload carries an unsupported ' + t + ' at ' + path);
    }
    if (_isTypedArray(v)) { return new v.constructor(v); }
    if (Array.isArray(v)) {
        var arr = new Array(v.length);
        for (var i = 0; i < v.length; i++) { arr[i] = _deepPlainClone(v[i], path + '[' + i + ']'); }
        return arr;
    }
    var out = {};
    var keys = _readableKeys(v);
    for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        var val;
        try { val = v[k]; }
        catch (e) { continue; }   // a throwing getter is not payload data
        // An OWN function-valued field reaches here (see _readableKeys) and THROWS below;
        // inherited methods were already filtered out as flattening, not as an error.
        out[k] = _deepPlainClone(val, path + '.' + k);
    }
    return out;
}

/**
 * deepPlainCopy(value) — THE plain-data deep-copy authority.
 *
 * Returns a copy that shares NO object identity with `value` (accessors flattened, typed
 * arrays copied, prototypes dropped). Exported because the same guarantee is needed in two
 * places and must not be written twice: the still PAYLOAD (`snapshotPayload`, R8) and the
 * SCENE RECORD handed out by `runner.sceneRecord()`. A record a caller can mutate is
 * internal state on loan, not a record.
 *
 * @param {*} value
 * @returns {*} a copy sharing no object identity with `value`
 */
function deepPlainCopy(value) { return _deepPlainClone(value, 'value'); }

/**
 * snapshotPayload(data, format) — the immutability guarantee, applied.
 *
 * `'rgba8'`/`'r8'` → a fresh typed-array copy. `'framedata'` → a deep plain-data clone with
 * accessors flattened. Exported so the conformance gate and any future stage executor use
 * the SAME snapshot, never a second one.
 *
 * @param {*} data — the stage implementation's payload
 * @param {string} format — a `STAGE_FORMATS` value
 * @returns {*} a payload that no later tick can change
 */
function snapshotPayload(data, format) {
    if (format === 'framedata') { return _deepPlainClone(data, 'data'); }
    if (_isTypedArray(data)) { return new data.constructor(data); }
    if (Array.isArray(data)) { return _deepPlainClone(data, 'data'); }
    _fail('format ' + JSON.stringify(format) + ' expects an indexed buffer payload, got ' + String(data));
}

// ── The SCENE record: immutable, CONTENT-ADDRESSED ───────────────────────────────
//
// `scene = sha256(canonicalize(SceneRecord))`. Canonicalization lives HERE — one hashing
// authority, or two writers mint two identities for the same scene. Content-addressing buys
// two properties for free: identical setups SHARE a scene identity across runs, and any
// drift between what a still claims and what the scene was is DETECTABLE.
//
// Scene records are IMMUTABLE. A structural edit (object added/deleted) does not revise a
// record, it mints a NEW one — under content-addressing "revision bump" and "new record" are
// the same operation, and a mutable revisioned record would reintroduce exactly the
// identity-vs-content ambiguity content-addressing removes. A field-level revision scheme
// would have been catastrophic in the other direction: a per-tick pose change would mint a
// revision per tick and the normalization would have destroyed itself.

function _failScene(msg) {
    throw new Error('[RenderStages.normalizeScene] ' + msg + ' (FAIL-LOUD.)');
}

/**
 * normalizeScene(partial) — ferry a partial scene bag to the full canonical SceneRecord.
 *
 * Every `SCENE_KEYS` key is present on the result. `seed` must be a finite number (it is
 * half of the regeneration triple — a null seed silently downgrades "regenerate" to
 * "hope"); `sourceRef` and `build` and `projection` may be `null` (honestly absent).
 *
 * @param {object} partial
 * @returns {object} a record carrying exactly SCENE_KEYS
 */
function normalizeScene(partial) {
    if (!partial || typeof partial !== 'object') {
        _failScene('expected a partial scene bag object, got ' + String(partial));
    }
    if (partial.v !== undefined && partial.v !== null && partial.v !== SCHEMA_VERSION) {
        _failScene('v ' + String(partial.v) + ' disagrees with the contract version ' +
                   SCHEMA_VERSION + ' — the normalizer is the version authority, `v` is never ' +
                   'caller-supplied');
    }
    if (typeof partial.seed !== 'number' || !isFinite(partial.seed)) {
        _failScene('seed must be a finite number — it is half of the regeneration triple ' +
                   '(code, seed, tick), and a null seed downgrades "regenerate" to "trust the ' +
                   'raster", got ' + String(partial.seed));
    }
    return {
        v:          SCHEMA_VERSION,
        seed:       partial.seed,
        sourceRef:  (partial.sourceRef === undefined || partial.sourceRef === null)
                        ? null : String(partial.sourceRef),
        // COPIED, never aliased: a BYO provider is free to return a CACHED projection
        // object from `projection()`, and a caller is free to keep a reference to the
        // `build` bag it passed in. Either would make the record a live view of somebody
        // else's mutable state — the R8 defect class, in the record that the whole
        // regenerate-not-replay claim rests on.
        build:      (partial.build && typeof partial.build === 'object')
                        ? deepPlainCopy(partial.build) : null,
        physicsW:   _posInt(partial.physicsW, 'physicsW'),
        physicsH:   _posInt(partial.physicsH, 'physicsH'),
        projection: (partial.projection && typeof partial.projection === 'object')
                        ? deepPlainCopy(partial.projection) : null
    };
}

/** Deterministic key-sorted encoding of a plain value. @private */
function _stableEncode(v) {
    if (v === null || v === undefined) { return 'null'; }
    var t = typeof v;
    if (t === 'number' || t === 'boolean') { return String(v); }
    if (t === 'string') { return JSON.stringify(v); }
    if (Array.isArray(v)) {
        return '[' + v.map(_stableEncode).join(',') + ']';
    }
    var keys = Object.keys(v).sort();
    return '{' + keys.map(function (k) {
        return JSON.stringify(k) + ':' + _stableEncode(v[k]);
    }).join(',') + '}';
}

/**
 * canonicalizeScene(record) — the ONE canonical byte-string a scene identity is taken over.
 *
 * PROJECTS onto `SCENE_KEYS` in table order, encoding nested objects with sorted keys. Two
 * consequences worth stating: (a) key insertion order cannot change an identity, and (b) an
 * `scene` id field carried ALONGSIDE the record (as `getScene()` does for convenience)
 * cannot perturb its own hash, because it is not a `SCENE_KEYS` member and is projected out.
 *
 * @param {object} record — a normalized SceneRecord (or a superset of one)
 * @returns {string}
 */
function canonicalizeScene(record) {
    if (!record || typeof record !== 'object') {
        _failScene('canonicalizeScene expects a record object, got ' + String(record));
    }
    var parts = [];
    for (var i = 0; i < SCENE_KEYS.length; i++) {
        var k = SCENE_KEYS[i];
        parts.push(JSON.stringify(k) + ':' + _stableEncode(record[k]));
    }
    return '{' + parts.join(',') + '}';
}

/**
 * sceneHash(record) → Promise<'sha256:<hex>'> — the content address.
 *
 * ASYNC because the platform's own digest is: `crypto.subtle.digest` is the ONE hashing
 * implementation used here, and it is Promise-based. It is a global in both the browser and
 * modern Node, so this is a single path — not a per-environment fork of a crypto primitive
 * (hand-rolling sha256 in the render layer would be exactly the wrong kind of DRY win).
 *
 * The `sha256:` prefix makes the algorithm self-describing in the record, so a future
 * algorithm change can never be silent.
 *
 * @param {object} record
 * @returns {Promise<string>}
 */
function sceneHash(record) {
    var canon = canonicalizeScene(record);
    var subtle = (typeof globalThis !== 'undefined' && globalThis.crypto)
        ? globalThis.crypto.subtle : null;
    if (!subtle || typeof subtle.digest !== 'function') {
        return Promise.reject(new Error('[RenderStages.sceneHash] crypto.subtle.digest is ' +
            'unavailable — the scene identity is a content hash and there is no fallback ' +
            'hashing path by design (two hashing authorities would mint two identities for ' +
            'one scene). (FAIL-LOUD.)'));
    }
    var bytes = new TextEncoder().encode(canon);
    return Promise.resolve(subtle.digest('SHA-256', bytes)).then(function (buf) {
        var view = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < view.length; i++) {
            hex += (view[i] < 16 ? '0' : '') + view[i].toString(16);
        }
        return 'sha256:' + hex;
    });
}

/**
 * normalizeStill(partial) — ferry a partial tap result to the FULL canonical bag.
 *
 * The owner-exported normalizer of the "owner exports contract → consumers ferry the bag"
 * pattern: the dispatcher merges the stage implementation's render-domain fields with the
 * provenance it alone knows, hands the merged partial here ONCE, and every consumer reads
 * a bag with all STILL_BAG_KEYS present. No consumer re-enumerates the key list.
 *
 * FAIL-LOUD rules (each closes a way a bag could lie):
 *   - unknown/absent `stage`                → assertStage throws (names the table)
 *   - absent or EMPTY `data`                → throw. A zero-length payload is the "silent
 *                                             empty bag"/black-still failure the whole
 *                                             capability exists to make impossible.
 *   - `format` ≠ STAGE_FORMATS[stage]       → throw. The format is a property of the
 *                                             stage, not a caller opinion.
 *   - non-positive-integer width/height     → throw.
 *   - `filtersApplied` not an array         → throw (order is contract; a map is not).
 *   - a filter ran without a finite         → throw. A filtered still without the uTime it
 *     `filterTime`, or a `filterTime`         drew with is not regenerable; a time with no
 *     with no filter                          filter claims a pass that never ran. Checked
 *                                             HERE because a BYO captureStill() bag never
 *                                             passes the built-in providers' readback helper.
 *   - a caller-supplied `composedOf` that   → throw. Provenance is stamped by its
 *     disagrees with upstreamStages(stage)    authority, never supplied by the caller.
 *
 * @param {object} partial
 * @returns {object} a bag carrying every STILL_BAG_KEYS key
 */
function normalizeStill(partial) {
    if (!partial || typeof partial !== 'object') { _fail('expected a partial bag object, got ' + String(partial)); }
    var stage = assertStage(partial.stage);

    var format = STAGE_FORMATS[stage];
    if (partial.format !== undefined && partial.format !== null && partial.format !== format) {
        _fail('format ' + JSON.stringify(partial.format) + ' does not match stage ' +
              JSON.stringify(stage) + '\'s declared format ' + JSON.stringify(format));
    }

    var data = partial.data;
    if (data === undefined || data === null) {
        _fail('stage ' + JSON.stringify(stage) + ' returned no `data` payload');
    }
    if (typeof data.length !== 'number') {
        _fail('`data` must be an indexed payload (Array / Uint8Array / Uint8ClampedArray), got ' + String(data));
    }
    if (data.length === 0) {
        _fail('stage ' + JSON.stringify(stage) + ' returned an EMPTY `data` payload — never ' +
              'a blank still: a measurement or golden built on an empty capture is fabricated evidence');
    }

    if (partial.v !== undefined && partial.v !== null && partial.v !== SCHEMA_VERSION) {
        _fail('v ' + String(partial.v) + ' disagrees with the contract version ' + SCHEMA_VERSION +
              ' — the normalizer is the version authority, `v` is never caller-supplied');
    }
    if (typeof partial.scene !== 'string' || !partial.scene) {
        _fail('scene must be the content hash of the SceneRecord this still belongs to — a ' +
              'still without a scene id is unmoored: it cannot be verified against, or ' +
              'regenerated from, anything. Got ' + String(partial.scene));
    }
    if (typeof partial.tick !== 'number' || !isFinite(partial.tick) || partial.tick < 0) {
        _fail('tick must be a finite non-negative number (the dispatcher stamps it from the ' +
              'live TickData — the tick-equality assertion is what co-registers a multi-channel ' +
              'corpus row), got ' + String(partial.tick));
    }

    var filters = partial.filtersApplied;
    if (!Array.isArray(filters)) {
        _fail('filtersApplied must be an ARRAY of filter names in the order they ran (the ' +
              'provider\'s ordered _filters list is the one authority), got ' + String(filters));
    }

    var filterTime = (partial.filterTime === undefined) ? null : partial.filterTime;
    if (filters.length > 0 ? !(typeof filterTime === 'number' && isFinite(filterTime)) : filterTime !== null) {
        _fail('filterTime must be the finite uTime the filter passes drew with when filtersApplied is ' +
              'non-empty, and null when it is empty (filtersApplied ' + JSON.stringify(filters) +
              ', filterTime ' + String(filterTime) + ') — the provider reports it ' +
              '(RendererProviderContract.filterTime of the rendered tick)');
    }

    var composed = upstreamStages(stage);
    if (partial.composedOf !== undefined && partial.composedOf !== null) {
        var supplied = partial.composedOf;
        var same = Array.isArray(supplied) && supplied.length === composed.length &&
            supplied.every(function (s, i) { return s === composed[i]; });
        if (!same) {
            _fail('composedOf is DERIVED from RENDER_STAGES (' + JSON.stringify(composed) +
                  ') and is never caller-supplied; got ' + JSON.stringify(supplied));
        }
    }

    return {
        v:                SCHEMA_VERSION,
        scene:            partial.scene,
        stage:            stage,
        tick:             partial.tick,
        format:           format,
        // IMMUTABLE BY CONTRACT: snapshot at capture. See snapshotPayload's docstring for
        // why a live reference here is the worst defect class a training corpus can carry.
        data:             snapshotPayload(data, format),
        width:            _posInt(partial.width,  'width'),
        height:           _posInt(partial.height, 'height'),
        // CSS size is meaningful only for a stage that read a real canvas; null elsewhere.
        cssWidth:         (typeof partial.cssWidth  === 'number') ? partial.cssWidth  : null,
        cssHeight:        (typeof partial.cssHeight === 'number') ? partial.cssHeight : null,
        filtersApplied:   filters.slice(),
        // null (not false) on a stage where NOTHING composited — reporting `true` there
        // would be a claim about a compositing pass that never ran.
        renderBaseCanvas: (typeof partial.renderBaseCanvas === 'boolean') ? partial.renderBaseCanvas : null,
        // The uTime the provider's filter passes drew with; null where no filter ran (checked
        // above). A filtered still is regenerable only with it (a filter may animate on uTime).
        filterTime:       filterTime,
        pose:             (partial.pose !== undefined && partial.pose !== null) ? partial.pose : null,
        // The FieldBuilder options the field tap actually ran with (gain/radius/blur/dims).
        // Two field captures at different gain are otherwise INDISTINGUISHABLE, and the r8
        // channel is a dimensionless instrument response, comparable only at equal options.
        // null on every other stage.
        fieldOpts:        (partial.fieldOpts && typeof partial.fieldOpts === 'object')
                              ? partial.fieldOpts : null,
        composedOf:       composed,
        renderOptions:    (partial.renderOptions && typeof partial.renderOptions === 'object')
                              ? partial.renderOptions : {}
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

var RenderStages = {
    SCHEMA_VERSION:            SCHEMA_VERSION,
    RENDER_STAGES:             RENDER_STAGES,
    STAGE_FORMATS:             STAGE_FORMATS,
    SCENE_KEYS:                SCENE_KEYS,
    STILL_KEYS:                STILL_KEYS,
    STILL_DERIVED_KEYS:        STILL_DERIVED_KEYS,
    STILL_BAG_KEYS:            STILL_BAG_KEYS,
    STILL_PAYLOAD_KEYS:        STILL_PAYLOAD_KEYS,
    STILL_PROVENANCE_KEYS:     STILL_PROVENANCE_KEYS,
    RUNTIME_MUTATION_SURFACES: RUNTIME_MUTATION_SURFACES,
    finalStage:                finalStage,
    upstreamStages:            upstreamStages,
    assertStage:               assertStage,
    stageNotTappableError:     stageNotTappableError,
    deepPlainCopy:             deepPlainCopy,
    snapshotPayload:           snapshotPayload,
    normalizeScene:            normalizeScene,
    canonicalizeScene:         canonicalizeScene,
    sceneHash:                 sceneHash,
    normalizeStill:            normalizeStill
};

// SCENE_SURFACE_ATTR — the attribute `FrqtlApp.createCanvas` stamps on the scene's drawing
// surface. OWNED by the RendererProvider contract (compat/renderer/renderer-provider-contract.js);
// re-exported here so consumers above the engine (specs, the eyes) reach it through the shim's
// render vocabulary — a barrel, never a second literal. Resolved at READ time from the host's
// global, the seam the capture instrument uses: a page publishes window.RendererProviderContract
// in the RENDERER phase (after this file loads — stack-boot.js), and the SDK's node boot publishes
// it on globalThis. Never a relative require: the repo and the node dist place compat/ differently.
function _rendererProviderContract() {
    var host = (typeof window !== 'undefined') ? window : globalThis;
    if (host.RendererProviderContract) { return host.RendererProviderContract; }
    throw new Error('RenderStages.SCENE_SURFACE_ATTR: its owner RendererProviderContract ' +
        '(lib/frqtl/compat/renderer/renderer-provider-contract.js) is not published on this host — a ' +
        'page publishes it in the RENDERER phase (renderer-layer-manifest.js), the SDK node boot on ' +
        'globalThis; read the name after the renderer boots.');
}
Object.defineProperty(RenderStages, 'SCENE_SURFACE_ATTR', {
    enumerable: true,
    get: function () { return _rendererProviderContract().SCENE_SURFACE_ATTR; }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderStages;
} else if (typeof window !== 'undefined') {
    window.RenderStages = RenderStages;
}

})();
