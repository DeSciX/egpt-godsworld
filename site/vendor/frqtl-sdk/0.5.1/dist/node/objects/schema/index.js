/* Copyright 2023-2026 by Essam Abadir */

/**
 * Object-definition schema for EGPT FRQTL VM.
 *
 * Each descriptor declares the EDITABLE properties for a canonical object kind,
 * with types and constraints. This is the single source the IDE reads to render
 * generic inspector/palette/drag-edit controls — no per-object UI code needed.
 *
 * Design rules (enforced by the schema test):
 *   1. Enum constraints REFERENCE the imported CollisionTypes / CollisionActions
 *      objects — never re-list values. A copied enum recreates the Rust-only-
 *      divergence bug the frozen sets exist to prevent.
 *   2. Field names are 1:1 with constructor params (one vocabulary).
 *   3. engineVisible:true  → edit routes through the concurrence path (Phase 4b).
 *      engineVisible:false → edit is render-layer-only (Phase 4a).
 *   4. The schema set stays 1:1 with the object set and the frozen enum set.
 *      Adding a new editable enum value still requires the JS-reference-first
 *      → conformance flow (docs/internal/engine/ENGINE_CONTRACT.md discipline).
 *   5. Every descriptor has an object-level `description` (what the object does)
 *      and every field has a `description` (what the property does / its effect).
 *   6. A composing part stamps `_owner` on what it composed (and nothing else); the declared
 *      object is what `ObjectFactory.create` returns and registers (`runner.declared`). A
 *      part's sub-objects are never declared. Composite descriptors expose only the
 *      composite's own editable props.
 *
 * This file declares WHAT type each field is; its sibling `valueNormalizer.js` states
 * what that declaration MEANS at a write. The sibling's single entry point is re-exported
 * here as `ObjectSchema.normalizeValue(fieldDef, value, kind?)` — the ONE public surface
 * every consumer ferries (the property accessor, the controls factory), so a wrong-typed
 * write throws at the write instead of poisoning a reader far away.
 *
 * Used by: Phase 4 uniform edit API, IDE tools palette, inspector panel.
 * NOT wired to sdk/frqtl-sdk/ — schema lives in lib/ (canonical stack, engine-agnostic).
 * No coupling to lib/components (would violate the acyclic-import rule).
 */

(function () {
    'use strict';

    // ── Imports ───────────────────────────────────────────────────────────────
    // CollisionTypes and CollisionActions are imported BY REFERENCE — NEVER re-listed.
    // Copying them would recreate the Rust-only-divergence bug the frozen sets prevent.
    //
    // FrameDataSchema (SECTION_KEYS + normalizeDataBubble) is imported BY REFERENCE from
    // lib/shim/frame-data — NEVER re-list 'detection'/'render'/'ext' keys here.
    // This mirrors the schema-mirror discipline: one owner per key list (§Engineering Culture).

    // FieldDescriptorSchema (FIELD_TYPES — the shared field-SHAPE vocabulary) is imported
    // BY REFERENCE from lib/shim/field-descriptor — WS Studio Controls Realignment §7 r2
    // CEO call C1 (ratified 2026-07-07): ONE owner for the field-type vocabulary this file's
    // ~200 field declarations and makeControlsForObject.js's TYPE_DISPATCH both consume.
    // This file's own per-kind field ARRAYS stay UNCHANGED (byte-identical) — only the type
    // vocabulary itself is now shared, asserted below (never a hand-copied comment list).

    var CollisionTypes, CollisionActions;
    var _wallBehaviorV2ValuesMap, _bounceDirectionValuesMap, _wallHookValuesMap; // v2 lexicon ferries
    var FrameDataSchema; // { SECTION_KEYS, normalizeDataBubble, normalizeDetection, normalizeRender }
    var FieldDescriptorSchema; // { FIELD_TYPES, FIELD_ENVELOPE_KEYS, normalizeFieldDescriptor }
    var ValueNormalizer;       // { normalizeValue, TYPES } — the SIBLING file in this dir
    var EngineScopes;          // { Frame/Universe/Dimension Descriptor } — the SIBLING file in this dir

    if (typeof module !== 'undefined' && module.exports) {
        var _ct = require('../constants/CollisionTypes');
        CollisionTypes  = _ct.CollisionTypes;
        var _ca = require('../constants/CollisionActions');
        CollisionActions = _ca.CollisionActions;
        // Wall's collision-lexicon enum values are OWNED by constants/WallBehaviors.js
        // (ferried from the frozen CollisionActions/CollisionTypes sets) — never a
        // hand-listed enum here (schema-mirror guard, W1(ii)/(iv)).
        var _WBmod = require('../constants/WallBehaviors');
        _wallBehaviorV2ValuesMap = _WBmod.wallBehaviorV2ValuesMap;
        _bounceDirectionValuesMap = _WBmod.bounceDirectionValuesMap;
        _wallHookValuesMap = _WBmod.wallHookValuesMap;
        var path = require('path');
        try {
            FrameDataSchema = require(path.resolve(__dirname, '../../../shim/frame-data/index.js'));
        } catch (e) {
            // Pointer fallback: if the module is unreachable from this path, consumers resolve
            // the data-bubble sub-shape from window.FrameDataSchema at access time.
            FrameDataSchema = null;
        }
        try {
            FieldDescriptorSchema = require(path.resolve(__dirname, '../../../shim/field-descriptor/index.js'));
        } catch (e) {
            // Same pointer-fallback discipline as FrameDataSchema above — the load-time
            // drift assertion below is skipped (not thrown) when the contract module is
            // genuinely unreachable from this path; every normal Node/browser boot resolves it.
            FieldDescriptorSchema = null;
        }
        ValueNormalizer = require('./valueNormalizer.js');
        EngineScopes = require('./engine-scopes.js');
    } else {
        CollisionTypes   = window.CollisionTypes;
        CollisionActions = window.CollisionActions;
        // Browser: constants/WallBehaviors.js publishes window.wallBehaviorV2ValuesMap
        // (loaded before schema/index.js in the game-layer manifest).
        _wallBehaviorV2ValuesMap = window.wallBehaviorV2ValuesMap;
        _bounceDirectionValuesMap = window.bounceDirectionValuesMap;
        _wallHookValuesMap = window.wallHookValuesMap;
        // Browser: lib/shim/frame-data publishes to window.FrameDataSchema via its own script tag.
        FrameDataSchema  = (typeof window !== 'undefined' && window.FrameDataSchema) || null;
        // Browser: lib/shim/field-descriptor publishes to window.FieldDescriptorSchema.
        FieldDescriptorSchema = (typeof window !== 'undefined' && window.FieldDescriptorSchema) || null;
        // Browser: the SIBLING valueNormalizer.js publishes window.ObjectValueNormalizer
        // (loaded immediately before this file in the game-layer manifest / stack-boot
        // roster). No pointer fallback here — unlike the two cross-layer lib/shim
        // contracts above, this is a file in THIS directory and it carries the WRITE
        // GATE: booting without it would silently accept every wrong-typed write.
        ValueNormalizer = (typeof window !== 'undefined' && window.ObjectValueNormalizer) || null;
        // Browser: the SIBLING engine-scopes.js publishes window.EngineScopeDescriptors
        // (loaded immediately before this file in the game-layer manifest / stack-boot
        // roster), same discipline as valueNormalizer.js above.
        EngineScopes = (typeof window !== 'undefined' && window.EngineScopeDescriptors) || null;
    }
    if (!ValueNormalizer || typeof ValueNormalizer.normalizeValue !== 'function') {
        throw new Error('[lib/frqtl/objects/schema] valueNormalizer.js is not loaded — ' +
            'ObjectSchema.normalizeValue IS the declared-type write gate, so booting ' +
            'without it would silently accept wrong-typed writes. Load ' +
            'objects/schema/valueNormalizer.js before objects/schema/index.js ' +
            '(stack-boot.js roster). (FAIL-LOUD.)');
    }
    if (!EngineScopes || !EngineScopes.FrameDescriptor) {
        throw new Error('[lib/frqtl/objects/schema] engine-scopes.js is not loaded — it owns the ' +
            'Frame/Universe/Dimension descriptors this registry publishes, so booting without it ' +
            'would leave ObjectSchema.get("Frame") null and every property-accessor write ' +
            'unvalidated. Load objects/schema/engine-scopes.js before objects/schema/index.js ' +
            '(stack-boot.js roster). (FAIL-LOUD.)');
    }

    // ── Field type vocabulary ─────────────────────────────────────────────────
    //
    // type:'rect'       → the positional write tuple, 4 or 6 elements, in the order
    //                      valueNormalizer.js::RECT_TUPLE owns (all physics pixels).
    //                      Omitting z/d is back-compat (engine defaults z=0, d=w).
    //                      See LargeObject rect field below.
    // type:'rgb'        → [r, g, b]  (0-255 integers)
    // type:'number'     → numeric scalar; constraint: { min?, max?, integer? }
    // type:'boolean'    → true | false
    // type:'string'     → free string
    // type:'enum'       → one value from constraint.values object
    // type:'enum-set'   → array of zero or more values from constraint.values object
    // type:'rect-array' → array of rect tuples (source_rects for emitters)
    // type:'readonly'   → derived/computed: inspectable but not editable
    //
    // Optional per-field key `unit` (WS Studio Controls Realignment S2, design §2.2):
    // a machine-readable string ('px', 'px/tick', 'ticks', 'px²', …) for fields whose
    // `description` prose already states a unit. NOT populated en masse — only where
    // the description text already says so (mechanical, not invented). Consumed by
    // `makeControlsForObject` (lib/frqtl/objects/objects/makeControlsForObject.js) to
    // append "(unit)" to a generated control's label. Absence means "no declared unit,"
    // never "unitless" — most number fields simply haven't been swept yet.

    // ── Shape-vocab ferry (Bite 5b R2-3) ─────────────────────────────────────
    // The shell SHAPE selector (LargeObject.shellShape) ferries the canonical shape
    // value set from its ONE owner, lib/shim/frame-data (RENDER_INTENT_VALUES
    // ['render.shape']) — the SAME set the render-level "Default Shape" uses — never a
    // hand-listed enum. Load order guarantees frame-data (a shim contract) is loaded
    // before this game-layer file (shim-contract-manifest before game-layer-manifest;
    // Node require resolves it too), so the value set is available at descriptor-build.
    function _shapeValuesMap() {
        var arr = (FrameDataSchema && FrameDataSchema.RENDER_INTENT_VALUES &&
                   FrameDataSchema.RENDER_INTENT_VALUES['render.shape']) || null;
        var m = {};
        if (Array.isArray(arr)) { for (var i = 0; i < arr.length; i++) { m[arr[i]] = arr[i]; } }
        return m;
    }

    // ── Descriptors ───────────────────────────────────────────────────────────

    /**
     * LargeObject — Engine-registered wall/boundary/detector.
     * Constructor: LargeObject(universe, rect, collision_type, actions, name,
     *                          reposition, observedDimensions, search_padding, color)
     */
    var LargeObjectDescriptor = {
        kind: 'LargeObject',
        description: 'A rectangular engine-registered boundary object (wall, detector, barrier). ' +
            'The engine evaluates particle collisions against every registered LargeObject each tick ' +
            'and applies the configured collision_type + actions to matching particles.',
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: true,
                unit: 'px',
                description: 'Bounding rectangle in physics pixels ' + ValueNormalizer.rectTupleText(4) + '. ' +
                    'FRQTL-MAINT (2026-07-01): may also carry explicit z/depth ' +
                    ValueNormalizer.rectTupleText(6) + ' — WASM-only, MIRRORS the engine\'s ' +
                    'Rectangle::from_top_left argument order. Omitting z/d ' +
                    'is back-compat: the engine defaults z=0, d=w (bit-identical to the ' +
                    'pre-fix hardcoded behavior — see #61).'
            },
            {
                // ── SWEPT-OBB NARROW-PHASE region (circulation §2, CEO-ratified 2026-07-25) ──
                //   The RESOLVED, convention-FREE collision region produced by the ONE
                //   SlabFace authority (lib/frqtl/objects/geometry/SlabFace.js) for a NON-
                //   cardinal (rotated) wall: { kind:'obb', theta, hw, hh, hz } — theta in
                //   RADIANS in the engine's own frame, NEVER the raw orientationDeg (storing
                //   orientationDeg here + re-deriving "90+" in Rust is the convention-drift
                //   bug the circulation rejects). null/absent = today's pure AABB path,
                //   BYTE-IDENTICAL (the sugar emits null at cardinals via SlabFace.isCardinal,
                //   so a present region is always non-cardinal). engineVisible:true — the
                //   engine's narrow-phase filter (universe.rs) consumes it directly (unlike
                //   collision_type/actions, which are sugar-compiled). internal:true — a
                //   compiled/derived engine field, never a designer Inspector control (same
                //   class as `program`). Throw-or-apply validation of the { kind, theta, hw,
                //   hh } shape lives at the ABI (egpt_wasm RegionJs::into_region); `poly` is
                //   reserved-but-rejected in v1. Written via updateObjectProperty(handle,
                //   'LargeObject', 'region', regionOrNull) — the SAME live-push path `program`
                //   uses (register-time or on a live orientation edit). WASM-only surface
                //   (the frozen 2D JS fixture FAILS LOUD on a non-null region — architect veto).
                name: 'region',
                type: 'object',
                engineVisible: true,
                internal: true,
                description: 'SWEPT-OBB narrow-phase collision region (circulation §2): ' +
                    '{ kind:"obb", theta(radians), hw, hh, hz } produced by the SlabFace authority ' +
                    'for a rotated wall, or null (default) = the byte-identical AABB path. Convention-' +
                    'free geometry (theta in the engine frame, never raw orientationDeg). The engine ' +
                    'narrow-phase filters candidates by a SWEPT prev→now segment-vs-OBB test ahead of ' +
                    'BOTH the op-program trigger and the collided-frame collection, so a tilted mirror ' +
                    'collides AT its drawn face (not the AABB entry plane). WASM-only.'
            },
            {
                name: 'collision_type',
                type: 'enum',
                constraint: { values: CollisionTypes },
                // SUGAR-INPUT (G2/G4b): the engine has NO collision_type dispatch (G2 deleted it).
                // collision_type is a declarative sugar field that actionCompiler.js lowers to an
                // op-program at REGISTRATION. engineVisible:false — the engine never reads it directly.
                // WS Studio Controls Realignment S4 (design §2.3.5 / CEO call #7):
                // FrqtlApp.updateObjectProperty routes a runtime edit of THIS field through
                // LargeObject.recompileActions() (re-runs actionCompiler.js + pushes the new
                // op-program), so a live edit DOES retarget the running behavior (e.g. WALL → NONE
                // mid-run) — no longer display-only.
                engineVisible: false,
                description: 'SUGAR-INPUT (compiled to an op-program at registration; engine has no ' +
                    'collision_type dispatch). NONE = pass-through; BOUNCE = reverse momentum; WALL = stop; ' +
                    'RANDOM_X/Y/XY = randomise that velocity component; ' +
                    'MOMENTUM_BASED = redirect proportional to incoming momentum.'
            },
            {
                name: 'actions',
                type: 'enum-set',
                constraint: { values: CollisionActions },
                // SUGAR-INPUT (G3/G4b): the CollisionAction engine enum + actions field were DELETED
                // (G3). actions is a declarative sugar field that actionCompiler.js lowers to an
                // op-program at REGISTRATION. engineVisible:false — the engine never reads it
                // directly. WS Studio Controls Realignment S4: a runtime edit of THIS field is ALSO
                // routed through LargeObject.recompileActions() (see the collision_type field's
                // doc, above) — live, not mirror-only.
                engineVisible: false,
                description: 'SUGAR-INPUT (compiled to an op-program at registration; engine has no ' +
                    'action dispatch). ABSORB = remove the particle; COUNT = increment hit counter; ' +
                    'MARK = flag the particle (writes string_map.detector_name = loName); ' +
                    'DETECT = record the detection event (same as MARK); ' +
                    'LOG = emit a log entry; BOUNCE = apply bounce momentum; ' +
                    'BLOCK = stop the particle.'
            },
            {
                name: 'name',
                type: 'string',
                engineVisible: false,
                description: 'Human-readable identifier for this object (display/debug only; not engine-visible after construction)'
            },
            {
                name: 'reposition',
                type: 'enum',
                constraint: { values: { top: 'top', bottom: 'bottom', left: 'left', right: 'right', closest: 'closest' } },
                engineVisible: true,
                description: 'Eject direction when a quantum is found overlapping this object\'s rect. ' +
                    '"closest" ejects toward the nearest edge; the cardinal values force a specific side.'
            },
            {
                name: 'search_padding',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                description: 'DEPRECATED / IGNORED. The engine no longer reads this; the collision ' +
                    'search rect now expands by the dimension\'s mb_w (EGPTfrqtl.js::update). Retained ' +
                    'only as a reserved positional constructor placeholder.'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                description: 'Render color [r, g, b] 0-255 each. Affects only the drawn appearance; engine collision is unaffected.'
            },
            {
                name: 'alpha',
                type: 'number',
                constraint: { min: 0, max: 255, integer: true },
                engineVisible: false,
                widgetHint: 'slider',
                description: 'Render opacity 0-255 (render-only). 0 = fully transparent, 255 = fully opaque.'
            },
            {
                name: 'visible',
                type: 'boolean',
                engineVisible: false,
                description: 'Whether the object is drawn (render-only). Setting false hides the visual; engine collision detection remains active.'
            },
            {
                name: 'shellRender',
                type: 'enum',
                constraint: { values: { design: 'design', run: 'run', never: 'never' } },
                engineVisible: false,
                // Bite 5b A6 — WHEN this object's visual shell paints (render-only, generalizes
                // the Bite-4b `_designMarker` boolean at the ONE _visibleLargeObjects authority):
                //   design — only while authoring (Design mode). The Bite-4b manipulable-marker
                //            default (a SphereEmitter marker is invisible during Run — you see the
                //            emission, not the source).
                //   run    — ALWAYS visible (the CEO's "red light bulb" opt-in: a run-visible shell;
                //            pair with visible:true + color:[255,0,0] + a low alpha for the orb).
                //   never  — never drawn.
                // Absent → the effective default is derived at the filter (a _designMarker LO
                // defaults 'design'; an ordinary LO defaults always-visible = 'run') so every
                // existing scene is byte-identical. A live edit (updateObjectProperty) sets the
                // per-instance override that _visibleLargeObjects reads.
                description: 'When this object\'s visual shell renders (render-only): design = only ' +
                    'while authoring (Bite-4b marker default); run = always visible (the "red light ' +
                    'bulb" opt-in); never = hidden. Generalizes the design-only marker suppression ' +
                    'at the single _visibleLargeObjects authority; engine collision is unaffected.'
            },
            {
                name: 'drawAsCircle',
                type: 'boolean',
                engineVisible: false,
                description: 'Render as a circle inscribed in the bounding rect instead of a rectangle (render-only).'
            },
            {
                name: 'shellShape',
                type: 'enum',
                // Vocab FERRIED from the ONE owner (lib/shim/frame-data render.shape set) —
                // the same set "Default Shape" uses; never a hand-listed enum (Bite 5b R2-3).
                constraint: { values: _shapeValuesMap() },
                engineVisible: false,
                description: 'Render shape of this object\'s visual shell (render-only): ball|box|circle|' +
                    'cube|sphere. For a SphereEmitter this is the shape of the emitter\'s outer LO frame ' +
                    '(the "red light bulb" orb vs a box). Honored by the provider draw layer (capability-' +
                    'based, zero engine change); absent/omitted falls back to drawAsCircle. cube/sphere ' +
                    'degrade to box/ball in 2D.'
            },
            {
                name: 'layer',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                description: 'Dimension layer this object is scoped to (0 = fundamental/lowest; null = all layers). Selects which Dimension passes this object participates in (observed_dimensions=[layer]; null = all). Candidates come from that dimension\'s frame list.'
            },
            {
                name: 'count',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                description: 'Writable integer counter (SLICE 3, binding item 2). ' +
                    'Incremented via op-program: set self.count = self.count + 1. ' +
                    'Routed through setObjectProperty like any property — NOT an interpreter special-case. ' +
                    'Default 0; reset only by an explicit op or by user code. ' +
                    'Mirrors the count field in the Rust LargeObjectSpec (universe.rs).'
            },
            {
                name: 'program',
                type: 'object',
                engineVisible: true,
                // W1 tweak (T3): the compiled op-program AST is an ENGINE INTERNAL, not a
                // designer control — the raw JSON must never render in the STUDIO Inspector.
                // `internal:true` is the ONE authority for "hide from the designer surface"
                // (consumed by makeControlsForObject + AuthorView's renderInspector); the
                // program is still engineVisible + captured for codegen/round-trip.
                internal: true,
                description: 'Op-program attached to this LO (§10.3 SLICE 3). ' +
                    'Shape: { on: "collision"|"tick", ops: [{ set: "<handle>.<prop>", to: ExprAST }] }. ' +
                    'on:"collision" — runs once per overlapping frame per tick, BEFORE ABSORB. ' +
                    'on:"tick" — runs once per LO per tick (Phase A). ' +
                    'null clears the program. Written via updateObjectProperty(handle, "LargeObject", "program", prog) ' +
                    '— used by §10.3 L3 to attach eject op-programs to oven walls after registration.'
            },
            // ── Read-only: derived geometry (self.* in op-program scope) ────────
            // These are derived from the rect field and exposed as flat scalars in the
            // op-program scope bag (Rust lo_to_scope_bag; JS evalExpr Ref expansion).
            // They are READ-ONLY — rect is the single writable authority.
            // All are required by the §10.3 eject-expression proof (which side of the
            // wall do we eject to? → Cond(Cmp(frame.x, self.cx), ...)).
            {
                name: 'left',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.left (left edge in physics pixels). Read-only in scope; rect is the writable authority.'
            },
            {
                name: 'right',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.right (right edge = rect.left + rect.w). Read-only in scope.'
            },
            {
                name: 'top',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.top (top edge in physics pixels). Read-only in scope.'
            },
            {
                name: 'bottom',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.bottom (bottom edge = rect.top + rect.h). Read-only in scope.'
            },
            {
                name: 'cx',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.x (center X = rect.left + rect.w/2). Read-only in scope.'
            },
            {
                name: 'cy',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.y (center Y = rect.top + rect.h/2). Read-only in scope.'
            },
            {
                name: 'w',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.w (width in physics pixels). Read-only in scope.'
            },
            {
                name: 'h',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.h (height in physics pixels). Read-only in scope.'
            },
            {
                name: 'x',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.x (center X, alias for cx). Read-only; rect is the writable authority.'
            },
            {
                name: 'y',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.y (center Y, alias for cy). Read-only; rect is the writable authority.'
            },
            // ── FRQTL-MAINT (2026-07-01) — z/depth readonly geometry ────────────
            // Already emitted by the Rust op-program scope bag (universe.rs
            // lo_to_scope_bag) for every LO regardless of whether z/d were ever
            // meaningfully non-default; listed here now that the rect field can
            // actually carry a non-default z/d (see rect field above). WASM-only
            // (the frozen JS reference engine's evalExpr scope bag is 2D-only).
            {
                name: 'near',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.near (near z-face = rect.z - rect.d/2 in centered terms, ' +
                    'or the literal z corner in corner-mode registration). Read-only in scope; rect is ' +
                    'the writable authority. WASM-only.'
            },
            {
                name: 'far',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.far (far z-face = rect.near + rect.d). Read-only in scope. WASM-only.'
            },
            {
                name: 'd',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.d (depth in physics pixels). Read-only in scope. WASM-only.'
            },
            {
                name: 'cz',
                type: 'readonly',
                internal: true,
                engineVisible: true,
                description: 'Derived: rect.z (center Z). Read-only in scope. WASM-only.'
            }
        ]
    };

    /**
     * QuantumEmitter — Engine-registered particle emitter.
     * Constructor: QuantumEmitter(universe, source_rects, vx, vy, burst_size,
     *                             charge, auto_fire, random_direction,
     *                             quantum_limit, delay, wrap)
     */
    var QuantumEmitterDescriptor = {
        kind: 'QuantumEmitter',
        description: 'A particle emitter that fires leaf quanta (particles) from one or more ' +
            'source rectangles. Supports directed or random emission, charge polarity, ' +
            'burst-size (amperage), and velocity (voltage direction). ' +
            'The chargeMode/random_direction sugar layer composes multiple underlying engine ' +
            'handles to implement "both" charge and random direction without engine changes.',
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: true,
                description: 'Canonical bounding rect ' + ValueNormalizer.rectTupleText(4) + ' — repositions the single emission ' +
                    'source rect. WS Studio Controls Realignment S4: routed through ' +
                    'QuantumEmitter.setSourceRect() (mutates emState.sourceRects directly — the ' +
                    'RETIRED provider ABI updateEmitterSourceRects no longer exists post-G-EMIT-2). ' +
 'The emitter moves its own marker.'
            },
            {
                name: 'source_rects',
                type: 'rect-array',
                engineVisible: true,
                description: 'Emission regions as array of ' + ValueNormalizer.rectTupleText(4) + ' rects'
            },
            {
                name: 'vx',
                type: 'number',
                constraint: { integer: false },
                engineVisible: true,
                unit: 'px/tick',
                description: 'Initial X velocity of emitted particles (pixels/tick). Positive = rightward, negative = leftward.'
            },
            {
                name: 'vy',
                type: 'number',
                constraint: { integer: false },
                engineVisible: true,
                unit: 'px/tick',
                description: 'Initial Y velocity of emitted particles (pixels/tick). Positive = downward (screen coords), negative = upward.'
            },
            {
                name: 'burst_size',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Number of particles fired per burst (amperage). Higher values produce more particles per tick; lower values reduce flux.'
            },
            {
                name: 'auto_fire',
                type: 'boolean',
                engineVisible: true,
                description: 'Whether the emitter fires automatically every tick. false = must be triggered manually (e.g. by a tick function or the inspector).'
            },
            {
                name: 'quantum_limit',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Maximum total quanta to emit (null/Infinity = unlimited). The emitter auto-deactivates after reaching this count.'
            },
            {
                name: 'delay',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                unit: 'ticks',
                description: 'Ticks between bursts. 0 = fire every tick; N = fire once every N+1 ticks.'
            },
            {
                name: 'wrap',
                type: 'boolean',
                engineVisible: true,
                description: 'Wrap emitted particles at canvas boundaries instead of letting them escape.'
            },
            {
                name: 'colorOverride',
                type: 'rgb',
                engineVisible: false,
                description: 'Override render color for emitted particles [r, g, b] (render-only; stored on the emitter wrapper)'
            },
            {
                name: 'chargeMode',
                type: 'enum',
                constraint: { values: { random: 'random', positive: 'positive', negative: 'negative', both: 'both' } },
                engineVisible: false,
                description: 'Charge mode (user-facing sugar): random = null charge, positive, negative, or both (two co-located emitters). Composes underlying emitter handle-programs by toggling their active flag — no engine ABI change. Use this instead of the raw charge param.'
            },
            {
                name: 'random_direction',
                type: 'boolean',
                engineVisible: false,
                description: 'Randomize emission direction each burst (sugar layer). Registers a new underlying handle with rd=true — no engine ABI change.'
            },
            {
                name: 'layer',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                description: 'Dimension layer this emitter targets (0 = fundamental; null = default). Emitted particles are placed in this layer. Stored on the emitter wrapper; no engine ABI change required.'
            }
        ]
    };

    /**
     * PointSource — Radial emitter (one engine emitter handle per angle).
     * Constructor: PointSource(universe, x, y, diameter, speed, charge,
     *                          auto_fire, quantum_limit, delay, angle_increment, opts)
     * opts fields: { emergentPhysics, minRadius, color, wavelength }
     */
    var PointSourceDescriptor = {
        kind: 'PointSource',
        description: 'A radial point emitter that fires particles outward from the surface ' +
            'of a circle at regular angular intervals. Each angle gets its own engine emitter ' +
            'handle so the angular pattern is deterministic. Produces wave fronts, interference ' +
            'patterns, and Big Bang-style expansions depending on configuration.',
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: true,
                description: 'Canonical bounding rect ' + ValueNormalizer.rectTupleText(4) + ' — repositions center (cx=left+w/2, cy=top+h/2) and recomputes all angle source rects (one-path via repositionToRect)'
            },
            {
                name: 'x',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Center X of the point source (physics pixels)'
            },
            {
                name: 'y',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Center Y of the point source (physics pixels)'
            },
            {
                name: 'diameter',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Diameter of the emission circle (physics pixels)'
            },
            {
                name: 'speed',
                type: 'number',
                constraint: { min: 0, integer: false },
                engineVisible: true,
                unit: 'px/tick',
                description: 'Velocity magnitude for emitted particles (pixels/tick)'
            },
            {
                name: 'auto_fire',
                type: 'boolean',
                engineVisible: true,
                description: 'Whether all angle emitters fire automatically'
            },
            {
                name: 'quantum_limit',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Max quanta per angle emitter (null = Infinity)'
            },
            {
                name: 'delay',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                description: 'Ticks between bursts for each angle emitter'
            },
            {
                name: 'angle_increment',
                type: 'number',
                constraint: { min: 1, max: 360, integer: false },
                engineVisible: true,
                description: 'Degrees between emission angles. Fewer degrees = more angles = denser wave front. ' +
                    '5° gives 72 directions; 10° gives 36; 45° gives 8 (coarser).'
            },
            {
                name: 'colorOverride',
                type: 'rgb',
                engineVisible: false,
                description: 'Override render color for emitted particles [r, g, b] (render-only; stored on the emitter wrapper).'
            },
            {
                name: 'chargeMode',
                type: 'enum',
                constraint: { values: { random: 'random', positive: 'positive', negative: 'negative', both: 'both' } },
                engineVisible: false,
                description: 'High-level charge mode (sugar layer). "both" creates two per-angle handle groups ' +
                    '(POSITIVE + NEGATIVE), doubling the emission count. Toggles the handle active flag — no engine ABI change.'
            },
            {
                name: 'random_direction',
                type: 'boolean',
                engineVisible: false,
                description: 'Whether emitted particles have randomized direction (sugar layer). ' +
                    'PointSource normally uses directed emission; enabling this registers a new handle group with rd=true.'
            },
            {
                name: 'layer',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                description: 'Dimension layer this emitter targets (0 = fundamental; null = default). Stored on the emitter wrapper; no engine ABI change required.'
            }
        ]
    };

    /**
     * SphereEmitter — the manipulable palette face over the setupSphereEmitter3D
     * setup factory (ws-experiments-walkthrough Bite 4b). A SUGAR kind (peer of
     * QuantumEmitter/PointSource — NOT a new engine kind): the ObjectFactory
     * builder composes a LargeObject-visual marker + the factory's host emit
     * tick-fn (SU1 — the visual LO is NONE-collision, non-leaf, zero physics).
     *
     * This descriptor is the SINGLE field authority: captureProps (codegen),
     * makeControlsForObject (the Inspector), and FrqtlApp.updateObjectProperty
     * (the live-edit write path) ALL drive off it — no hand-list anywhere.
     *
     * Per-field `live` attribute (Bite 4b, consumed by makeControlsForObject):
     *   live:true  → a LIVE Inspector control; the write goes through
     *                updateObjectProperty(sphereObj, prop, v) → the control setter
     *                (mechanism A — NOT resolveBind; the SphereEmitter kind is
     *                deliberately outside controlBind's bind-executable allowlist).
     *   live:false → a read-only DISPLAY row (boot-level / derived fields that
     *                need a reload to change — same class as the renderer-swap
     *                reload ruling). captureProps STILL captures its VALUE for
     *                round-trip; the Inspector just renders it read-only.
     *
     * FIELD SET is COMPLETE w.r.t. every scene-affecting setupSphereEmitter3D opt
     * (a missing opt = lossy codegen). `emissionBoxSide` is subsumed by the
     * captured derived `emissionBox`. There is no init flag: the SKETCH inits the
     * world once (setupSphereEmitter3D.initWorld / the co-init call), so a second emitter on
     * one universe (6A/6B/6C) is simply a second object.
     */
    var SphereEmitterDescriptor = {
        kind: 'SphereEmitter',
        description: 'A spherical/omni "sun" emitter — uniform-direction ball-rejected emission ' +
            '(preset spherical/laser/drum/particle-walk). The manipulable palette face over the ' +
            'setupSphereEmitter3D setup factory: pure sugar (a NONE-collision visual marker + a host ' +
            'emit tick-fn), zero physics of its own. Drag the marker to move the emission center live; ' +
            'edit burst/rate/wavelength/charge/preset/shell live; dimension/is2D are boot-level (reload).',
        // ── STUDIO UX presentation contract (Bite 5b A0) ──────────────────────
        // A sugar object DECLARES its own STUDIO UX (CEO §9 "the design question").
        // The vocab is owned once at lib/shim/field-descriptor (UX_HANDLE_ZONES /
        // UX_DRAGGABLE_MODES / UX_SHELL_RENDER); this block is read via
        // ObjectSchema.ux('SphereEmitter'). resizable:false — a SphereEmitter has
        // TWO radii (inner+outer); a single-box resize gesture is ambiguous, so the
        // CEO ruled it NOT resizable (individually, per object). draggable 2D (a 3D
        // scene never cursor-drags). handles: ['move'] — it only moves, never scales.
        // shellRender:'design' — the marker paints only while authoring (Bite-4b
        // default; the "red light bulb" flips a per-instance shellRender override).
        ux: {
            resizable: false,
            draggable: { '2d': true },
            handles: ['move'],
            shellRender: 'design'
        },
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: false,
                live: true,
                // PR-1 item iii: the facade's `.rect` getter now returns a REAL rect DERIVED from
                // the live center (so computeEntityBboxForDesign reads fresh — no stale bbox). To
                // keep `center` the SINGLE captured position authority (codegen round-trip), this
                // field is `writeOnly:true` → captureProps SKIPS it BY THE FLAG (not by the getter
                // being undefined). The WRITE path is unchanged: a rect write maps rect-CENTER →
                // the emission center (control.setCenter, via applyProp).
                writeOnly: true,
                description: 'WRITE-ONLY reposition ADAPTER (drag handle). A rect write — from the visual ' +
                    'marker\'s coupled-move or a rect edit — maps rect-CENTER → the emission center ' +
                    '(control.setCenter). Its READ getter DERIVES a fresh rect from `center` (PR-1 item ' +
                    'iii, for the Design bbox); captureProps SKIPS it via writeOnly:true so `center` stays ' +
                    'the single captured position authority. Inspector seeds the vector control from ' +
                    '`center` via a FIELD_VALUE_OVERRIDE.'
            },
            {
                name: 'center',
                type: 'object',
                engineVisible: false,
                live: false,
                description: 'Emission SOURCE POSITION in absolute canvas px as [x,y,z] (the captured ' +
                    'position authority — codegen round-trips this, not rect). Edited live via the rect ' +
                    'adapter / the visual marker drag; shown read-only here.'
            },
            {
                name: 'preset',
                type: 'enum',
                constraint: { values: { spherical: 'spherical', hemisphere: 'hemisphere', laser: 'laser', drum: 'drum', 'particle-walk': 'particle-walk' } },
                engineVisible: false,
                live: true,
                description: 'Velocity-range preset: spherical (full ball / the sun), hemisphere (the SAME ' +
                    'ball-rejected sampler with the forward axis halved to [0,R] — 180° forward emission, ' +
                    'aimed by orientationDeg), laser (collimated beam), drum (z=0 disk), particle-walk ' +
                    '(deterministic +X drift). LIVE (next burst).'
            },
            {
                name: 'chargeMode',
                type: 'enum',
                constraint: { values: { positive: 'positive', negative: 'negative', random: 'random' } },
                engineVisible: false,
                live: true,
                description: 'Per-emitted-leaf charge: positive (0), negative (1), or random (per-leaf ±, ' +
                    'the braiding that makes self-interference structure). LIVE (affects the next leaf).'
            },
            {
                name: 'burstSize',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                description: 'Leaves emitted per burst (flux). LIVE (affects the next burst).'
            },
            {
                name: 'emitEveryTicks',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                unit: 'ticks',
                description: 'Ticks between bursts (sustained-emission cadence). LIVE (affects the next burst).'
            },
            {
                // ── Declared EMISSION GATE (CEO ruling 05c98e1f — the Blackbody-thermostat
                //    pattern; architect circulation-emission-gate-contract §2 field shapes).
                //    Sensor = a placeable counting Wall (name in gateCounter); regulation =
                //    emitter-side sugar compiled at CONSTRUCTION into a host tick-fn (the
                //    Restart-safe host-tick-fn rule — codegen captures these two fields and
                //    the reconstructed emitter's constructor rebuilds the gate).
                name: 'emissionCap',
                type: 'number',
                label: 'Population Limit',
                constraint: { min: 1, integer: true },
                widgetConfig: { max: 12800, step: 1 },   // stable slider range (constraint has no max); 2x the cl1d default 6400
                engineVisible: false,
                live: true,
                description: 'Self-throttle target: the emitter deactivates when the live population ' +
                    'measured by gateCounter reaches this value and reactivates when it drops below. ' +
                    'null/omitted = uncapped (byte-identical to today). LIVE (next tick). Zero physics ' +
                    '(SU1) — pure emission regulation, like the blackbody thermostat.'
            },
            {
                name: 'gateCounter',
                type: 'string',
                engineVisible: false,
                live: false,
                visibleWhen: { field: 'emissionCap', present: true },
                description: 'The NAME of the counting Wall (collisionBehavior:"nothing" + count hook) ' +
                    'whose getLiveCount() is this cap\'s population authority. Resolved lazily by name ' +
                    'at tick time (construction-order independent). FAIL-LOUD if absent once ' +
                    'emissionCap is set.'
            },
            {
                name: 'wavelength',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                description: 'Per-leaf wavelength arg → mass=max(1,capacity/wavelength), hence the transverse ' +
                    'oscillation period (CLAUDE.md §6 fork). A NO-OP until fundamentalDimension is raised ' +
                    '(capacity 1 saturates mass). LIVE (affects the next leaf).'
            },
            {
                name: 'emissionShell',
                type: 'enum',
                constraint: { values: { volume: 'volume', surface: 'surface' } },
                engineVisible: false,
                live: true,
                description: 'Emission start topology: volume (seed within the box) or surface (velocity-' +
                    'aligned ring launch at innerR — empty center, sharp bands). LIVE (affects the next leaf).'
            },
            {
                name: 'innerR',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                live: true,
                unit: 'px',
                description: 'Shell radius for emissionShell:surface (0 collapses to the center point; ' +
                    'ignored in volume mode). LIVE (affects the next leaf).'
            },
            {
                name: 'renderColor',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Per-leaf render color override [r,g,b] (render-intent data, zero physics); ' +
                    'null = colorless (scheme-driven fullness→ROYGBIV). LIVE (affects the next leaf).'
            },
            {
                name: 'renderShape',
                type: 'enum',
                constraint: { values: { ball: 'ball', box: 'box', circle: 'circle', cube: 'cube', sphere: 'sphere' } },
                engineVisible: false,
                live: true,
                description: 'Per-leaf render.shape override (render-intent data, zero physics) — peer of ' +
                    'renderColor. Stamped into string_map[\'render.shape\'] on each emitted leaf via the ' +
                    'provider render-intent MERGE seam. Overrides the render-level "Default Shape" ' +
                    '(setRenderOption). null/omitted = fall back to the default. LIVE (affects the next leaf).'
            },
            {
                // EMITTER ORIENTATION (B8 pulsar) — the CURRENT orientation the velocity sampler
                // rotates each sampled (vx,vy) about z by. Spinning a constrained (laser) emitter
                // sweeps the beam (a pulsar); omni ('spherical') is rotationally invariant. Also the
                // LOOK-drive rotation target. SU1: at 0 the rotation is the identity (byte-identical).
                name: 'orientationDeg',
                type: 'number',
                constraint: { min: 0, max: 360 },
                engineVisible: false,
                live: true,
                widgetHint: 'slider',
                description: 'Emitter orientation in degrees (default 0). The velocity sampler rotates ' +
                    'each emitted (vx,vy) by this angle (M5: affects the NEXT leaf), so spinning a ' +
                    'constrained/laser emitter sweeps its beam (pulsar); an omni emitter is unaffected. ' +
                    'LIVE via control.setOrientation; the LOOK-drive rotation target.'
            },
            {
                name: 'fundamentalWaveLength',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: false,
                description: 'Init-time wavelengthScale seed (waveLengthMultiplier=floor(fwl/4)); boot-level ' +
                    '(set at universe.init — reload to change). Captured for round-trip.'
            },
            {
                name: 'fundamentalDimension',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                live: false,
                description: 'The universe base dimension this emitter inits at; boot-level (reload to change). ' +
                    'Raises leaf capacity so the wavelength knob gains leverage. Captured for round-trip.'
            },
            {
                name: 'leafDimension',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                live: true,
                // Field NAME stays `leafDimension` (codegen/capture key; a rename = round-trip
                // break + a second name = schema mirror — architect Q-A2). The Inspector shows
                // the display LABEL "Emit Dimension"; the write routes through applyProp →
                // control.setLeafDimension (host-side addDimension + closure var flip; the NEXT
                // emitted leaf is born at the new dimension). Theorist CLEARED mid-run addDimension
                // as SAFE (2026-07-22 verdict). SIDE EFFECT (S1): a value BELOW the current
                // fundamental floor self-lowers the floor UNIVERSE-GLOBALLY and is a ONE-WAY
                // RATCHET (no removeDimension) — the Inspector surfaces a hint when crossing below
                // floor. fundamentalDimension stays display-only (universe base = reinit-class).
                label: 'Emit Dimension',
                // R2-2: rendered as a SCROLLER LIST (a <select> showing the current dimension +
                // choices), NOT a slider — via the resolveWidget 'dimension-select' widget. The
                // option list is dynamic runtime state sourced from the emitter (fundamental +
                // current leafDimension), so the descriptor stays the single FIELD authority while
                // the candidate values come from the world (not a schema mirror).
                widgetHint: 'dimension-select',
                description: 'The per-emitter dimension leaves are born at (default = fundamentalDimension). ' +
                    'LIVE (host-side addDimension + closure flip; next emitted leaf). A leaf born ABOVE ' +
                    'the fundamental is move-gated (Invariant 6A) — slower/larger/redder, the per-dimension ' +
                    'observable. A value BELOW the current fundamental self-lowers the floor universe-globally ' +
                    '(a one-way ratchet). Captured for round-trip.'
            },
            {
                name: 'is2D',
                type: 'boolean',
                engineVisible: false,
                live: false,
                description: 'Whether the z-axis is inactive (2D disk of directions vs 3D ball); boot-level ' +
                    '(set at init via activeAxes — reload to change). Captured for round-trip.'
            },
            {
                name: 'emissionBox',
                type: 'object',
                engineVisible: false,
                live: false,
                description: 'Derived per-axis emission-position box {x,y,z} (subsumes the scalar ' +
                    'emissionBoxSide input). Captured for round-trip; frozen when re-passed on reload.'
            }
        ]
    };

    /**
     * Wall — the first-class WALL primitive (ws-experiments-walkthrough W1, CEO
     * ruling E-W1a). A SUGAR kind (peer of SphereEmitter — NOT a new engine kind):
     * a thin facade over ONE LargeObject whose collision behavior is a friendly
     * Collision LEXICON v2 (`collisionBehavior`: nothing | block | bounce | absorb |
     * destroy, + bounceDirection + hooks) compiled to op-programs
     * by the SAME actionCompiler every wall rides. The ObjectFactory builder
     * constructs the facade (a bare, engine-registered LargeObject inside), honoring
     * a palette drop's click point (ctx.x/ctx.y).
     *
     * The lexicon enum values are FERRIED from constants/WallBehaviors.js
     * (whose tables themselves ferry the frozen CollisionActions/CollisionTypes sets)
     * — NEVER a hand-listed enum here (schema-mirror guard). FrqtlApp
     * .updateObjectProperty routes a lexicon write to Wall.setV2Prop
     * (recompile-and-push, the "flip a wall into a detector mid-run" live path), and
     * routes the engine-visible props (rect/color/layer/…) DOWN to the inner
     * LargeObject (which keeps its own engine push). SU1: zero physics of its own.
     */
    var WallDescriptor = {
        kind: 'Wall',
        description: 'A rectangular wall/boundary with a single collision behavior: nothing ' +
            '(pass through), block (stop at the surface), bounce (turn around), absorb (kill + ' +
            'tally + radiate), or destroy (plain kill) — plus the composable mark/count/recolor ' +
            'hooks. The first-class palette face over a LargeObject + actionCompiler op-program ' +
            '— the ONE wall primitive the composites (SlitScreen, DetectorWall) build ' +
            'on. Zero physics of its own.',
        // STUDIO UX presentation contract (A0 vocab, owned at lib/shim/field-descriptor).
        // A wall has a genuine draggable/resizable extent (unlike the two-radii
        // SphereEmitter) → resizable:true. 2D drag only (3D reposition via the camera).
        // shellRender:'run' — a wall is a boundary you SEE during Run (not a Design-only
        // marker like an emitter), so its shell always paints.
        ux: {
            resizable: true,
            draggable: { '2d': true },
            shellRender: 'run'
        },
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: true,
                unit: 'px',
                live: true,
                description: 'Bounding rectangle in physics pixels ' + ValueNormalizer.rectTupleText(4) + ', or the ' +
                    'explicit z/depth form ' + ValueNormalizer.rectTupleText(6) + ' — WASM 3D. The wall\'s collision ' +
                    'search region. Live-editable (drag/resize); routed to the inner LargeObject ' +
                    'engine handle.'
            },
            {
                // ── Rotation (Collision Lab; R1 UX-pass upgrade) — a live orientation the
                //   sugar owns. Layer 1: number, degrees, [0,360), live, render+op-owned
                //   (engineVisible:false — the engine LO search region stays AXIS-ALIGNED,
                //   the honest AABB catch zone; nothing in lo_to_scope_bag — theorist v2 §1b).
                //   A live edit EXPLICITLY recompiles (setV2Prop → compileWallV2) AND the
                //   renderer draws the shell rotated (no outline of the un-rotated rect).
                //
                //   Layer 2 (what the knob DOES): orientationDeg is the mirror SURFACE angle.
                //   For a bounce/reflect mirror the compiled reflection law is now
                //   ORIENTATION-AWARE (R1, theorist-proven exact):
                //     • 0/90/180/270 → the axis-aligned incidence BOX reflector (both faces;
                //       byte-identical at 0 — SU1).
                //     • 45/135/225/315 → the exact swap / swap+negate (+x → +y / +x → −y).
                //     • any α → the fixed tilted-plane reflection R=[cos2α,sin2α;sin2α,−cos2α].
                //   STANDARD OPTICS 2θ LAW: a mirror surface at angle θ DEFLECTS the beam by
                //   2θ, so a +x beam exits at angle 2θ (slope tan2θ). Rotate the mirror to 45°
                //   and a +x beam exits +y (the CEO routing landmark); 15° → slope tan30°;
                //   67.5° → (−0.7071, 0.7071). For a constrained-random ("laser-gate") wall,
                //   orientation instead re-bakes the scatter CONE endpoints
                //   (cos/sin(orientation ± angleConstraint)) — the scatter axis follows the spin.
                //   Also the LOOK-drive rotation target.
                name: 'orientationDeg',
                type: 'number',
                constraint: { min: 0, max: 360 },
                engineVisible: false,
                live: true,
                widgetHint: 'slider',
                description: 'Wall orientation in degrees (default 0; visible always) = the mirror ' +
                    'SURFACE angle. A live edit recompiles the op-program: a bounce/reflect mirror bakes ' +
                    'the ORIENTATION-AWARE reflection law (standard optics — a surface at θ deflects a ' +
                    'beam by 2θ, so 45° turns a +x beam to +y), and a constrained-random wall re-aims its ' +
                    'scatter cone. The renderer draws the shell rotated to this angle. Also the LOOK-drive ' +
                    'rotation target.'
            },
            {
                // ── R2AX — two-axis mirror (CEO ruling 2026-07-26, Living Log ce4fb0c9):
                //   Layer 1 (API): up/down tilt in degrees [-90, 90] about the plate's OWN
                //   long axis (the drawn face line). 3D walls only (needs a real z/depth —
                //   visible in the Inspector only when depth > 0); a 2D wall THROWS. Live:
                //   routes through the same setV2Prop recompile path as orientationDeg.
                //   Layer 2 (physics): pitch tips the mirror face out of the xy-plane, so a
                //   bounce/reflect wall bakes the TRUE 3-space reflection R = I − 2nn^T about
                //   the SlabFace plate normal — the reflected beam gains a z-component and
                //   ALWAYS leaves on the incident side (verified: the (yaw × pitch) sweep
                //   matrix, zero pass-through at every angle pair). pitch 0 restores the
                //   in-plane 2θ law byte-identically (vz passes through — the un-pitched
                //   contract). A pitched plate uses the AABB broad phase + the compiled
                //   n-dot guard as its narrow phase (no engine ObbRegion — z-theta-only;
                //   engine two-angle OBB is a flagged Gate-1 follow-up).
                name: 'pitchDeg',
                type: 'number',
                constraint: { min: -90, max: 90 },
                engineVisible: false,
                live: true,
                widgetHint: 'slider',
                visibleWhen: { field: 'depth', truthy: true },
                description: 'Up/down tilt (degrees, -90..90) about the plate\'s own long axis — the ' +
                    'second mirror rotation axis (3D walls only). A live edit recompiles the true ' +
                    '3-space reflection about the tipped plate normal: the reflected beam gains a ' +
                    'z-component and always leaves on the incident side (never through the mirror). ' +
                    '0 = the flat in-plane mirror (vz passes through).'
            },
            // ── Z-slab (Z1, CEO UX-pass 2026-07-24) — a wall's 3D depth/placement. A
            //    6-element rect (RECT_TUPLE[6]) gives the wall a real z-slab: the
            //    engine's collision region covers the depth, the wall reflects/ejects on all
            //    SIX faces (the 3-axis incidence lift, WASM), and the three renderer draws it
            //    as a BoxGeometry slab.
            //    `depth` and `z` are DERIVED from the rect (the single live position authority —
            //    the `rect` field above already accepts the 6-element z/depth form and is the
            //    editable authority; these are the inspectable read-out, round-tripped by the
            //    depth/z construction sugar). A dedicated depth SLIDER is a flagged follow-on.
            {
                name: 'depth',
                type: 'readonly',
                unit: 'px',
                engineVisible: false,
                description: 'The wall\'s z-slab depth (z-extent) in physics pixels — 0 for a flat 2D ' +
                    'wall. Derived from the 6-element rect ' + ValueNormalizer.rectTupleText(6) + '; a real depth makes the ' +
                    'wall a 3D slab (six-face reflect/eject, box render). Edit via the rect field.'
            },
            {
                name: 'z',
                type: 'readonly',
                unit: 'px',
                engineVisible: false,
                description: 'The wall\'s z placement (near-face … far-face CENTER) in physics pixels ' +
                    '(0 for a 2D wall). Derived from the 6-element rect. Edit via the rect field.'
            },
            // ── Collision LEXICON v2 (CEO 3e2016aa) — the nested behavior/direction/
            //    modifier/hook surface. Enum values are FERRIED from WallBehaviors.js
            //    (never hand-listed). `visibleWhen` (evaluated live at Inspector render
            //    against the captured props) reveals the dependent fields only when
            //    relevant — ONE declarative predicate, one evaluator (makeControlsForObject).
            {
                name: 'collisionBehavior',
                type: 'enum',
                constraint: { values: _wallBehaviorV2ValuesMap ? _wallBehaviorV2ValuesMap() : {} },
                engineVisible: false,
                live: true,
                description: 'The wall\'s collision BEHAVIOR (compiled to an op-program; the engine has ' +
                    'no wall dispatch): nothing = pass-through; block = STOP the particle at the surface ' +
                    '(reposition to the closest position outside the wall, velocity kept — it parks at the ' +
                    'face instead of turning around); bounce = a motion response (see bounceDirection); ' +
                    'absorb = tally the colliders\' mass into the wall\'s REAL backing ' +
                    'frame + radiate (conserving); destroy = remove the particle. Hooks (mark/count) compose ' +
                    'with any behavior.'
            },
            {
                name: 'bounceDirection',
                type: 'enum',
                constraint: { values: _bounceDirectionValuesMap ? _bounceDirectionValuesMap() : {} },
                engineVisible: false,
                live: true,
                visibleWhen: { field: 'collisionBehavior', equals: 'bounce' },
                description: 'How a BOUNCE redirects the particle: reflect = invert the velocity on the ' +
                    'axis of incidence (a mirror); random = redraw the exit direction (omni by default, or ' +
                    'constrained to a cone about the wall\'s INITIAL orientation). Only shown for bounce.'
            },
            {
                name: 'decoherence',
                type: 'boolean',
                engineVisible: false,
                live: true,
                visibleWhen: [{ field: 'collisionBehavior', equals: 'bounce' },
                              { field: 'bounceDirection', equals: 'random' }],
                description: 'When a random BOUNCE also resets the wave phase (local_time=0) + re-rolls the ' +
                    'charge sign (an independent decoherence toggle). Off by default (direction-only). ' +
                    'Only shown for a random bounce.'
            },
            {
                name: 'hooks',
                type: 'enum-set',
                constraint: { values: _wallHookValuesMap ? _wallHookValuesMap() : {} },
                engineVisible: false,
                live: true,
                description: 'Composable statistics hooks (any behavior): mark = stamp a user string on ' +
                    'each collided frame (engine-transparent); count = tally collisions (filterable by mark). ' +
                    'The counting screen is destroy + count.'
            },
            {
                name: 'markTag',
                type: 'string',
                engineVisible: false,
                visibleWhen: { field: 'hooks', includes: 'mark' },
                description: 'The user string MARK stamps into each collided frame\'s string_map (only shown ' +
                    'when the mark hook is active).'
            },
            {
                name: 'countFilter',
                type: 'string',
                engineVisible: false,
                visibleWhen: { field: 'hooks', includes: 'count' },
                description: 'Restrict COUNT to frames carrying a specific mark ("any" = count all). Applied ' +
                    'by the between-tick stats reader (only shown when the count hook is active).'
            },
            {
                name: 'capacity',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                visibleWhen: { field: 'collisionBehavior', equals: 'absorb' },
                description: 'ABSORB mass ceiling (snapped to a leaf level the engine can actually ' +
                    'size — the capacity law runs over the ACTIVE AXES) AND the 1/capacity per-tick ' +
                    'radiation probability. How much it holds and how often it gives some back. ' +
                    'Only shown for absorb.'
            },
            {
                name: 'emissivity',
                type: 'number',
                constraint: { min: 0.01, max: 1 },
                engineVisible: false,
                live: true,
                visibleWhen: { field: 'collisionBehavior', equals: 'absorb' },
                description: 'ABSORB radiating efficiency — the FULLNESS of each re-emitted leaf, as ' +
                    'a fraction in (0,1] of that layer\'s cell capacity (default 0.5). A colour knob, ' +
                    'not bookkeeping: fullness IS the move gate and sets the wavelength, so 1.0 ' +
                    're-emits at light speed with the shortest λ and 0.5 at half the step rate with ' +
                    'twice the λ. The emitted leaf\'s SCALE is not a knob — the wall re-emits at the ' +
                    'layer it soaked from. Only shown for absorb.'
            },
            {
                name: 'name',
                type: 'string',
                engineVisible: false,
                description: 'Human-readable identifier (display/debug only).'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Render color [r, g, b] 0-255 (render-only; engine collision unaffected).'
            },
            {
                name: 'alpha',
                type: 'number',
                constraint: { min: 0, max: 255, integer: true },
                engineVisible: false,
                live: true,
                widgetHint: 'slider',
                description: 'Render opacity 0-255 (render-only). 0 = fully transparent, 255 = fully opaque — ' +
                    'a transparent wall still collides, it simply stops obstructing the view.'
            },
            {
                name: 'visible',
                type: 'boolean',
                engineVisible: false,
                live: true,
                description: 'Whether the wall is drawn (render-only; collision detection stays active).'
            },
            {
                name: 'layer',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                description: 'Dimension layer this wall is scoped to (0 = fundamental; null = all layers).'
            },
            {
                name: 'shellShape',
                type: 'enum',
                constraint: { values: _shapeValuesMap() },
                engineVisible: false,
                live: true,
                description: 'Render shape hint of the wall\'s visual shell (ball|box|circle|cube|sphere; ' +
                    'render-only). cube/sphere degrade to box/ball in 2D; absent falls back to a rect.'
            }
        ]
    };

    /**
     * GraphingDetectorWall — a Detector Screen that PAINTS ITS OWN HIT GRID onto
     * its own faces (presentation pass Item 1; CEO ruling "the spatial hitmap IS
     * the chart"). A SUGAR kind that EXTENDS `Wall` (prototype chain): the
     * physics authority — counting, `Wall.gridAdd`, the once-per-tick drain
     * discipline — is Wall's, verbatim and untouched. What it adds is a
     * sugar-side painter that reads the SAME grid and paints pure bin rectangles
     * onto the wall LO's `liveCanvas` ferry through ONE owned linear map, so a
     * hot cell sits exactly where the counted collisions physically occurred.
     * No chart chrome in-scene (the wall IS the axis); chart/statistical analysis
     * of the same data stays available separately in the DOM panel lane.
     *
     * FIELDS ARE FERRIED FROM WallDescriptor (never re-listed — the
     * schema-mirror-drift discipline): this descriptor is Wall's field table plus
     * the three heatmap fields. Every one is a DECLARED field, so a codegen
     * Restart round-trip rebuilds the heatmap wall from captured state.
     */
    var GraphingDetectorWallDescriptor = {
        kind: 'GraphingDetectorWall',
        description: 'A counting detector screen that draws its OWN hit heatmap on its faces: ' +
            'collisions are binned over the wall face (y×z) and painted as colour cells exactly ' +
            'where they landed — the wall is the axis, so there are no chart axes, labels or ' +
            'margins in the scene. Extends Wall (defaults to the detector-screen preset: destroy ' +
            '+ count); zero physics of its own.',
        // Same UX as a Wall — a real draggable/resizable boundary, visible during Run
        // (an instrument you WATCH fill up).
        ux: WallDescriptor.ux,
        fields: WallDescriptor.fields.concat([
            {
                name: 'binPx',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                unit: 'px',
                widgetHint: 'slider',
                description: 'Face bin size in physics pixels (default 12) — the heatmap cell pitch. ' +
                    'Smaller resolves finer structure but each cell holds fewer hits (noisier); larger ' +
                    'smooths. The SAME binning the DOM topology chart applies to the same grid.'
            },
            {
                name: 'refreshMs',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                unit: 'ms',
                description: 'Heatmap repaint throttle in milliseconds (default 100). Hit accumulation ' +
                    'is per-tick and never throttled — only the repaint is gated, so no counts are lost.'
            },
            {
                name: 'heatBase',
                type: 'number',
                constraint: { min: 0, max: 1 },
                engineVisible: false,
                widgetHint: 'slider',
                description: 'Opacity (0..1, default 0.35) of the heat ramp\'s ZERO colour washed ' +
                    'UNDER the cells, so an un-hit face still reads as a solid plate and intensity ' +
                    'rises monotonically from empty through every bin. Render-only.'
            }
        ])
    };

    /**
     * DetectorWall — Absorbing detector screen (wraps a single LargeObject).
     * Constructor: DetectorWall(universe, canvasRect, wallX, wallY,
     *                           wallCollisionType, wallColor, wallHeight,
     *                           wallWidth, wallName)
     * The inner LargeObject always has actions=[COUNT, ABSORB].
     * Group wrapper: the inner LargeObject is stamped with the ONE up-link `_owner` = <this>.
     */
    var DetectorWallDescriptor = {
        kind: 'DetectorWall',
        description: 'A detector/absorber screen that counts and removes particles on contact. ' +
            'Used as the observation screen in quantum experiments (e.g. double-slit). ' +
            'Wraps a single LargeObject with COUNT+ABSORB actions. Accumulates a collision ' +
            'histogram (y-position → count) for interference pattern analysis.',
        fields: [
            {
                name: 'wallX',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Left edge X position (physics pixels)'
            },
            {
                name: 'wallY',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Top edge Y position (physics pixels)'
            },
            {
                name: 'wallCollisionType',
                type: 'enum',
                constraint: { values: CollisionTypes },
                engineVisible: true,
                description: 'Collision type for the detector wall. Default NONE — absorption is via the ' +
                    'ABSORB action in its actions list, not the collision type.'
            },
            {
                name: 'wallColor',
                type: 'rgb',
                engineVisible: false,
                description: 'Render color [r, g, b] of the detector wall'
            },
            {
                name: 'wallHeight',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Height of the detector wall (physics pixels). Typically the full canvas height.'
            },
            {
                name: 'wallWidth',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Width/thickness of the detector wall (physics pixels). Default 20.'
            },
            {
                name: 'wallName',
                type: 'string',
                engineVisible: false,
                description: 'Identifier string for this detector (display/debug only; not engine-visible after construction).'
            }
        ]
    };

    /**
     * SlitScreen — Double-slit barrier (group: 3 wall segments + 2 slit segments + 4 liners = 9 sub-objects).
     * Constructor: SlitScreen(universe, wallLeft, wallWidth, canvasHeight, wavelength,
     *                         absorbAtSlitWall, detectAtSlits, slitHeight, gapHeight)
     * Group wrapper: all 9 sub-LargeObjects are stamped with the ONE up-link `_owner` = <this>.
     */
    var SlitScreenDescriptor = {
        kind: 'SlitScreen',
        description: 'A double-slit barrier that produces quantum interference. ' +
            'Creates 9 sub-LargeObjects: wall1 (above slit1), slit1, wall2 (between slits), ' +
            'slit2, wall3 (below slit2), and 4 edge-diffraction liners (slit1_liner_top/bottom, ' +
            'slit2_liner_top/bottom). The group is the single author-surface entity; ' +
            'slit geometry is derived from the wavelength so the interference fringe spacing is ' +
            'automatically correct for the particle wavelength.',
        fields: [
            {
                name: 'slit_group_left',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'X position of the slit barrier left edge (physics pixels). Moving this repositions the entire slit assembly.'
            },
            {
                name: 'slit_width',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Width/thickness of the slit screen (physics pixels). Thicker screens affect diffraction character.'
            },
            {
                name: 'wavelength',
                type: 'number',
                constraint: { min: 4, integer: true },
                engineVisible: true,
                description: 'Wavelength driving slit and gap sizing. Default slit height = floor(wavelength * 0.8); inter-slit gap = same. Engine invariant 6: minimum wavelength is 4.'
            },
            {
                name: 'slit_height',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Height of each slit opening (physics pixels). Narrower slits increase diffraction spread; wider slits reduce it.'
            },
            {
                name: 'slit_wall_gap_height',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Height of the wall segment between the two slits (physics pixels). Larger gap → tighter interference fringes on the screen.'
            },
            {
                name: 'absorbAtSlitWall',
                type: 'boolean',
                engineVisible: true,
                description: 'If true, wall segments use ABSORB (particles disappear on contact). If false, walls use BLOCK. Absorbing walls eliminate back-scatter and produce cleaner interference patterns.'
            },
            {
                name: 'detectAtSlits',
                type: 'enum',
                constraint: { values: { NONE: 0, DETECT_RANDOM_XY: 1, DETECT_MARK: 2 } },
                engineVisible: true,
                description: 'Slit detection mode: 0 = no detection (coherent, wave-like pattern); 1 = DETECT+RANDOM_XY (which-path measurement collapses the wavefunction); 2 = DETECT+MARK (which-path marker via string_map.detector_name).'
            }
        ]
    };

    /**
     * SlitLightSource — Radial emitter positioned between slit pairs (wraps PointSource).
     * Constructor: SlitLightSource(universe, slitScreen, angle_increment,
     *                              quantum_limit, delay)
     * Position is derived from slitScreen geometry at construction time.
     * Group wrapper: the inner PointSource's per-angle handles are stamped with the ONE up-link `_owner` = <this>.
     */
    var SlitLightSourceDescriptor = {
        kind: 'SlitLightSource',
        description: 'A radial light source for the double-slit experiment. ' +
            'Wraps a PointSource positioned equidistant between the two slits ' +
            '(at the inter-slit gap center), so particles reach both openings with equal path length. ' +
            'Emits in all directions; the slit screen selects which particles pass through.',
        fields: [
            {
                name: 'angle_increment',
                type: 'number',
                constraint: { min: 1, max: 360, integer: false },
                engineVisible: true,
                description: 'Degrees between emission angles (fewer degrees = more angles = denser wave front). 10° gives 36 directions, the double-slit experiment default.'
            },
            {
                name: 'quantum_limit',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Max quanta per angle emitter (null/Infinity = unlimited). Limits total particle count for performance control.'
            },
            {
                name: 'delay',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: true,
                description: 'Ticks between bursts for each angle emitter. 1 = emit every other tick (default for the double-slit source).'
            }
        ]
    };

    /**
     * particle — A leaf frame (is_leaf=true) produced by engine emitters.
     * Not directly constructable by the IDE; emitted by engine tick functions.
     * Descriptor is for inspector display only (all fields are readonly).
     */
    var ParticleDescriptor = {
        kind: 'particle',
        description: 'A leaf frame (is_leaf=true) — the fundamental quantum of the simulation. ' +
            'Particles are not directly placeable; they are emitted by QuantumEmitter, PointSource, ' +
            'and other emitter objects. Every "particle" IS a Frame: the Frame Axiom states there is ' +
            'no separate particle class. Leaf frames have mass = capacity (engine invariant).',
        fields: [
            {
                name: 'x',
                type: 'readonly',
                engineVisible: true,
                description: 'Current X position (physics pixels)'
            },
            {
                name: 'y',
                type: 'readonly',
                engineVisible: true,
                description: 'Current Y position (physics pixels)'
            },
            {
                name: 'vx',
                type: 'readonly',
                engineVisible: true,
                description: 'Current X momentum (pixels/tick). Accumulates when the 1px/tick speed limit is exceeded.'
            },
            {
                name: 'vy',
                type: 'readonly',
                engineVisible: true,
                description: 'Current Y momentum (pixels/tick). Accumulates when the 1px/tick speed limit is exceeded.'
            },
            {
                name: 'mass',
                type: 'readonly',
                engineVisible: true,
                description: 'Pixel occupancy count (Frame Axiom: leaf mass = capacity). Mass drives wavelength: higher mass → shorter wavelength → higher frequency.'
            },
            {
                name: 'wavelength',
                type: 'readonly',
                engineVisible: true,
                description: 'floor(capacity/mass * WAVELENGTH_CONSTANT), minimum 4 (engine invariant 6). Controls the probabilistic coin-flip that creates wave behavior.'
            }
        ]
    };

    // ── Engine-core accessor descriptors (the SIBLING module) ─────────────────
    //
    // `Frame`, `Universe` and `Dimension` describe the ENGINE'S OWN SCOPES — what
    // an op-program addresses and what getFrameProperty/setFrameProperty write
    // through — not authored parts. They live in `engine-scopes.js` and are
    // REGISTERED + RE-EXPORTED here, so this file stays the ONE registry and the
    // ONE public surface: `ObjectSchema.get('Frame')` is unchanged, and so is
    // every named export at the bottom of this file. See that file's header for
    // why the seam is there.
    var FrameDescriptor = EngineScopes.FrameDescriptor;
    var UniverseDescriptor = EngineScopes.UniverseDescriptor;
    var DimensionDescriptor = EngineScopes.DimensionDescriptor;

    var BackdropDescriptor = {
        kind: 'backdrop',
        description: 'A render-only background image or color fill. ' +
            'Created as a LargeObject with NONE collision type and no actions, ' +
            'so it is invisible to the physics engine. Use it for scene backgrounds, ' +
            'lab diagrams, or any decoration that should never interact with particles.',
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: false,
                description: 'Bounding rectangle for the backdrop image or fill (render-only). Typically matches the full canvas rect.'
            },
            {
                name: 'visible',
                type: 'boolean',
                engineVisible: false,
                description: 'Whether the backdrop is rendered (render-only). Toggling false hides the background.'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                description: 'Fallback fill color [r, g, b] used when no image is provided (render-only).'
            },
            {
                name: 'alpha',
                type: 'number',
                constraint: { min: 0, max: 255, integer: true },
                engineVisible: false,
                widgetHint: 'slider',
                description: 'Render opacity 0-255 (render-only)'
            }
        ]
    };

    /**
     * LiveChart — an IN-SCENE live chart of a counting Wall's running histogram.
     * Modeled on BackdropDescriptor: a NONE-collision, render-only LargeObject
     * (zero physics, SU1) that carries a `chartSpec` bag naming the source wall +
     * projector. The Chart.js chart renders to an OFFSCREEN canvas (the ONE
     * makeChartEnv authority, ABOVE the shim) and is ferried onto the LO's
     * `liveCanvas` slot; the renderer wraps that canvas as a native drawable (p5
     * image / three CanvasTexture) — Chart.js never enters a renderer.
     *
     * Unlike a Design-only emitter marker, a LiveChart is VISIBLE during Run — its
     * entire value is accumulating on-screen while the sim runs (shellRender 'run').
     * All fields are render-only (engineVisible:false).
     */
    var LiveChartDescriptor = {
        kind: 'LiveChart',
        description: 'An in-scene live chart panel that plots a counting Wall\'s running ' +
            'y→count histogram (getCollisionHistogram) as the sim runs. A render-only ' +
            'LargeObject (NONE collision, zero physics) — the Chart.js chart renders to an ' +
            'offscreen canvas and is composited into the scene as a texture/image, so it ' +
            'moves and scales with the scene. Point it at a detect/count Wall; a non-counting ' +
            'source fails loud.',
        // STUDIO UX: a chart panel has a real draggable/resizable extent, and it is
        // VISIBLE during Run (its whole point), so shellRender:'run' (NOT a Design-only
        // marker). 2D drag; 3D reposition via the camera.
        ux: {
            resizable: true,
            draggable: { '2d': true },
            shellRender: 'run'
        },
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: false,
                unit: 'px',
                description: 'Placement + size of the chart panel in physics pixels ' + ValueNormalizer.rectTupleText(4) + '. Render-only — never a collision region.'
            },
            {
                name: 'source',
                type: 'string',
                engineVisible: false,
                description: 'Name of the source Wall that feeds this chart (a direct wall handle is ' +
                    'also accepted at construction). For projector detectorHistogram: a detect/count ' +
                    'wall (getCollisionHistogram). For projector absorberStats: an ABSORB wall ' +
                    '(getAbsorbStats). For projector liveCount: a count-hook wall (getLiveCount). ' +
                    'A source lacking the projector\'s read method fails loud at wire time.'
            },
            {
                name: 'projector',
                type: 'enum',
                constraint: { values: { detectorHistogram: 'detectorHistogram', absorberStats: 'absorberStats', liveCount: 'liveCount', detectorSurface: 'detectorSurface' } },
                engineVisible: false,
                description: 'The blessed live-chart projector to poll (default detectorHistogram). ' +
                    'detectorHistogram = a counting Wall\'s y→count column-profile (fringes); ' +
                    'absorberStats = an ABSORB Wall\'s {stored,absorbed,radiated} mass ledger; ' +
                    'liveCount = a counting Wall\'s per-tick collided-frame count (a full-area ' +
                    'background wall\'s live population); ' +
                    'detectorSurface = the SAME counting Wall\'s hits binned over its FACE (y×z) ' +
                    'and drawn as a topology heightfield — the 3D instrument, where a detector is ' +
                    'a plane and the fringes read as ridges. ' +
                    'One vocabulary, owned by live-chart-controller\'s LIVE_CHART_PROJECTORS.'
            },
            {
                name: 'series',
                type: 'enum',
                constraint: { values: { bar: 'bar', line: 'line' } },
                engineVisible: false,
                description: 'Chart series kind: bar (default, a histogram) or line.'
            },
            {
                name: 'orientation',
                type: 'enum',
                constraint: { values: { '0': '0', '90': '90' } },
                engineVisible: false,
                live: true,
                description: 'Chart orientation in degrees. 0 = standard vertical bars (bins along x). ' +
                    '90 = the GYM detector-histogram presentation: HORIZONTAL bars stacked along y ' +
                    '(Chart.js indexAxis:y, y-axis reversed to run top-down) so a detector column-profile ' +
                    'aligns SPATIALLY with the vertical detector wall beside it. Default: 90 for a ' +
                    'detectorHistogram chart (detector-aligned), 0 otherwise. Live-editable in the Inspector.'
            },
            {
                name: 'label',
                type: 'string',
                engineVisible: false,
                description: 'Dataset label shown in the chart legend (default = the source name).'
            },
            {
                name: 'refreshMs',
                type: 'number',
                constraint: { min: 16, integer: true },
                engineVisible: false,
                unit: 'ms',
                description: 'Redraw cadence in ms (default 100 → ~10 fps). Caps Chart.js redraw cost ' +
                    'regardless of tick rate; accumulation still runs EVERY tick (no dropped counts).'
            },
            {
                name: 'visible',
                type: 'boolean',
                engineVisible: false,
                live: true,
                description: 'Whether the chart panel is rendered (render-only).'
            },
            {
                name: 'alpha',
                type: 'number',
                constraint: { min: 0, max: 255, integer: true },
                engineVisible: false,
                live: true,
                widgetHint: 'slider',
                description: 'Render opacity 0-255 (render-only).'
            }
        ]
    };

    // ── New object kind descriptors ───────────────────────────────────────────
    // (Box, OvenBox, CircuitGate, CircuitProbe, EgptFractal — added for self-describing palette)

    /**
     * Box — Rectangular enclosure made of 4 LargeObject walls (optionally with a slit).
     * Constructor: Box(universe, options)
     * options: { left, top, width, height, wallThickness, collisionType, actions, color, slit }
     * Group wrapper: all wall sub-LargeObjects are stamped with the ONE up-link `_owner` = <this>.
     */
    var BoxDescriptor = {
        kind: 'Box',
        description: 'A rectangular enclosure built from 4 LargeObject walls ' +
            '(top, bottom, left, right). Any wall can optionally have a slit opening. ' +
            'Used to confine particles, build cavities, or create directed channels. ' +
            'Inner dimensions define the open cavity; walls extend outward by wallThickness.',
        fields: [
            {
                name: 'left',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Inner box left X position (physics pixels). The outer wall begins at left - wallThickness.'
            },
            {
                name: 'top',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Inner box top Y position (physics pixels). The outer wall begins at top - wallThickness.'
            },
            {
                name: 'width',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Inner box width (physics pixels). Outer width = width + 2 * wallThickness.'
            },
            {
                name: 'height',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Inner box height (physics pixels). Outer height = height + 2 * wallThickness.'
            },
            {
                name: 'wallThickness',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Thickness of each wall in physics pixels (default 10). Walls extend outward from the inner box.'
            },
            {
                name: 'collisionType',
                type: 'enum',
                constraint: { values: CollisionTypes },
                engineVisible: true,
                description: 'Collision type applied to all four walls (e.g. BOUNCE confines particles inside).'
            },
            {
                name: 'actions',
                type: 'enum-set',
                constraint: { values: CollisionActions },
                engineVisible: true,
                description: 'Actions applied on collision for all four walls (e.g. [BOUNCE, ABSORB]).'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Render color [r, g, b] for all four walls (render-only). A live edit fans ' +
                    'out to every wall the group owns (the `_owner` fan-out in updateObjectProperty).'
            }
        ]
    };

    /**
     * Tunnel — TWO parallel MIRROR walls forming a corridor (a waveguide / light-pipe).
     * Constructor: Tunnel(universe, { left, top, length, bore, wallThickness, axis, color })
     * Group wrapper: the two inner Wall{bounce} sub-objects are
     * stamped with the ONE up-link `_owner` = <this>. Zero physics of its own (SU1) — it only
     * places two of the guarded mirror primitive a `bore` apart.
     */
    var TunnelDescriptor = {
        kind: 'Tunnel',
        description: 'A corridor built from TWO parallel MIRROR walls (guarded bounce) ' +
            'a `bore` apart — a waveguide / light-pipe. A beam travelling down the bore ' +
            'reflects off the two facing mirrors and stays collimated (no random scatter, ' +
            'no leak through the walls). The group is the single author-surface entity; ' +
            'the two mirror Walls it composes carry its `_owner` up-link. Zero physics of its own.',
        // A tunnel has a genuine draggable/resizable extent (like a Wall). 2D drag only.
        ux: {
            resizable: true,
            draggable: { '2d': true },
            shellRender: 'run'
        },
        fields: [
            {
                name: 'rect',
                type: 'rect',
                engineVisible: false,
                live: true,
                writeOnly: true,
                description: 'WRITE-ONLY reposition ADAPTER: the corridor ENVELOPE (both mirrors and the exit ' +
                    'gate). A rect write — the 2D drag, the SPACE carry — moves the whole Tunnel through ' +
                    'Tunnel.setRect (a same-size write is a translation; a resize re-derives length/bore). ' +
                    'Its read getter derives the envelope from the members; captureProps SKIPS it via ' +
                    'writeOnly:true, so left/top/length/bore stay the captured position authority.'
            },
            {
                name: 'left',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                live: true,
                unit: 'px',
                description: 'Bore (aperture) left X position (physics pixels). For an X-axis tunnel this is the corridor mouth.'
            },
            {
                name: 'top',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                live: true,
                unit: 'px',
                description: 'Bore (aperture) top Y position (physics pixels).'
            },
            {
                name: 'length',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Corridor travel-axis extent (physics pixels) — X extent for an X-axis tunnel, Y for a Y-axis tunnel. The mirrors span this length.'
            },
            {
                name: 'bore',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Clear aperture — the gap between the two mirror inner faces (physics pixels). The beam passes through the bore; a wider bore lets more through with less collimation.'
            },
            {
                name: 'wallThickness',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Thickness of each mirror wall in physics pixels (default 10).'
            },
            {
                name: 'axis',
                type: 'enum',
                constraint: { values: { x: 'x', y: 'y' } },
                engineVisible: true,
                description: 'Corridor travel axis: x = horizontal (two wide mirrors above+below the bore; a +x beam reflects its vy); y = vertical (two tall mirrors left+right; a +y beam reflects its vx).'
            },
            {
                name: 'z',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Near-face Z of the corridor z-slab (physics pixels). Paired with `depth`: both mirror walls are built as 6-element-rect z-slabs, so the corridor is a real 3D tube whose z-faces also reflect. Inert without `depth` (a flat 2D corridor).'
            },
            {
                name: 'depth',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Z extent of the corridor z-slab (physics pixels). OMIT for a flat 2D corridor (the mirror walls stay 4-element rects, unconstrained in z). Supplying it makes each mirror a z-slab spanning z .. z+depth — the corridor a real tube in space.'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Render color [r, g, b] for both mirror walls (render-only). A live edit fans ' +
                    'out to both mirrors (the `_owner` fan-out in updateObjectProperty).'
            },
            {
                // D2 (CEO 2026-07-28) — the corridor's collision MODE. Enum values are
                // ferried from Tunnel.MODES (the object's own authority), never re-listed.
                name: 'mode',
                type: 'enum',
                // The vocabulary's OWNER is `Tunnel.MODES` (exported on the object). It is
                // not `require`d here because schema/index.js loads BEFORE the object files
                // in the browser roster — a require would resolve in Node and silently read
                // `undefined` off `window` in the realm, the worst of both. Instead the copy
                // is DRIFT-GATED: tunnel-directed.test.mjs asserts this map's keys equal
                // Tunnel.MODES exactly, so adding a mode without updating both fails CI.
                constraint: { values: { mirror: 'mirror', directed: 'directed' } },
                engineVisible: true,
                // CONSTRUCTION-level: the directed mode needs its walls registered with the
                // engine's collect_collided flag, which has no live toggle in the substrate
                // (Wall.setWallBehavior refuses exactly this switch). Rebuild to change it.
                live: false,
                description: 'Collision mode. mirror (default) = the guarded-bounce waveguide: a beam ' +
                    'reflects off the two facing mirrors and stays collimated. directed = the tunnel ' +
                    'acts as a semi-circular EMITTER: each wall hit ejects the quantum back into the ' +
                    'bore and re-emits it in a uniformly random FORWARD direction within 180° of the ' +
                    'corridor axis. Construction-level (collection is a registration-time engine flag).'
            },
            {
                name: 'directedAngle',
                type: 'number',
                constraint: { min: 0, max: 360 },
                engineVisible: true,
                live: false,
                unit: 'deg',
                visibleWhen: { field: 'mode', equals: 'directed' },
                description: 'Centre of the forward re-emission fan, in degrees. Omitted = DERIVED from ' +
                    '`axis` (0 = +x for an x corridor, 90 = +y for a y one), i.e. the corridor\'s own ' +
                    'travel direction. Set 180/270 for a corridor fed from the far end. The tunnel BODY ' +
                    'stays axis-aligned; this aims the re-emission only.'
            },
            {
                name: 'redirectSpread',
                type: 'number',
                constraint: { min: 0, max: 180 },
                engineVisible: true,
                live: false,
                unit: 'deg',
                visibleWhen: { field: 'mode', equals: 'directed' },
                description: 'Half-width of the forward fan, in degrees (default 90 = a full 180° forward ' +
                    'fan). The exit azimuth is drawn UNIFORMLY in directedAngle ± this. 0 collapses to a ' +
                    'perfectly collimated re-emission along directedAngle.'
            },
            {
                // D3 (CEO 2026-07-29) — the point-exit gate.
                name: 'exitCollapse',
                type: 'boolean',
                engineVisible: true,
                // Construction-level: the gate is a THIRD LargeObject, and its collect flag is
                // a registration-time engine flag. Rebuild to add or remove it.
                live: false,
                description: 'Point-exit gate. Adds a third LargeObject spanning the last 2 columns of ' +
                    'the bore at the output mouth; every crossing quantum is pinned to the bore mid-line, ' +
                    'so the mouth emits as a one-pixel POINT SOURCE (the self-interference geometry). ' +
                    'Composes with either mode. Requires withInterQuantumCollisions:false — FAIL-LOUD ' +
                    'otherwise, because with collisions ON the collapse pixel serializes and kills quanta.'
            },
            {
                // D4 (CEO 2026-07-29) — recentering becomes optional so the two exit effects
                // can be driven independently.
                name: 'exitRecenter',
                type: 'boolean',
                // SUGAR, not an engine-ABI field: the write goes through the facade's own
                // setter (Tunnel.LIVE_PROPS -> applyProp), which recompiles the exit gate's
                // op-program and pushes it — it never reaches setFrameProperty or a LargeObject
                // bool ABI. Declared engineVisible:true it was DEMOTED to a read-only Inspector
                // row by the documented safety rule for engine-visible booleans (whose bind-only
                // write path would send a bare 0/1 where serde wants a JSON bool), so the CEO
                // could see the flag and not flip it. `Wall.collisionBehavior` is the precedent:
                // also op-program-compiled, also live, correctly engineVisible:false.
                engineVisible: false,
                live: true,
                visibleWhen: { field: 'exitCollapse', truthy: true },
                description: 'Pin every quantum crossing the exit gate to the bore mid-line — the ' +
                    'point-source collapse. DEFAULT ON. Turning it OFF leaves the exit spatially ' +
                    'unchanged, which is what separates "does the point source matter?" from "does ' +
                    'coherence matter?" (exitPhaseReset) — while recentering was mandatory the two ' +
                    'were confounded. With BOTH off the gate carries no program at all and stays ' +
                    'registered only as an inert collector. LIVE (next collision).'
            },
            {
                name: 'exitPhaseReset',
                type: 'boolean',
                // SUGAR, not an engine-ABI field: the write goes through the facade's own
                // setter (Tunnel.LIVE_PROPS -> applyProp), which recompiles the exit gate's
                // op-program and pushes it — it never reaches setFrameProperty or a LargeObject
                // bool ABI. Declared engineVisible:true it was DEMOTED to a read-only Inspector
                // row by the documented safety rule for engine-visible booleans (whose bind-only
                // write path would send a bare 0/1 where serde wants a JSON bool), so the CEO
                // could see the flag and not flip it. `Wall.collisionBehavior` is the precedent:
                // also op-program-compiled, also live, correctly engineVisible:false.
                engineVisible: false,
                // LIVE: flipping it recompiles the gate's op-program and pushes it on the same
                // live path recompileActions uses — so the banding can be toggled mid-run.
                live: true,
                visibleWhen: { field: 'exitCollapse', truthy: true },
                description: 'Re-phase-lock the ensemble at the exit gate (appends `set local_time = 0` ' +
                    'to the gate program). Default OFF — a deliberate coherence choice, not a ratified ' +
                    'behavior. Whether banding needs it is λ-dependent: at long effective λ the exit is ' +
                    'already ~90% phase-aligned and bands survive with it OFF; at short λ the exit is ' +
                    'phase-flat and the fan reads smooth OFF, banded ON. PHASE ONLY — never the ' +
                    'decoherence bundle (whose second op redraws charge). LIVE (next collision).'
            },
            {
                name: 'polarSpread',
                type: 'number',
                constraint: { min: 0, max: 90 },
                engineVisible: true,
                live: false,
                unit: 'deg',
                visibleWhen: { field: 'mode', equals: 'directed' },
                description: 'Half-width of the OUT-OF-PLANE (polar) fan, in degrees. 0 (default, even on ' +
                    'a 3D corridor) keeps the re-emission in the XY plane — the angle-uniform case. A ' +
                    'non-zero value draws the polar angle uniformly in phi, which over-weights the pole: ' +
                    'it is polar-uniform, NOT solid-angle-uniform on the hemisphere.'
            }
        ]
    };

    /**
     * OvenBox — Thermostat box with wall emitters for blackbody experiments.
     * Constructor: OvenBox(universe, options)
     * options: { left, top, width, height, wallThickness, temperature, slitHeight, slitWall, color }
     * Group wrapper: its Box (which stamps its own walls) and 4 QuantumEmitter sub-objects are
     * stamped with the ONE up-link `_owner` = <this>.
     */
    var OvenBoxDescriptor = {
        kind: 'OvenBox',
        description: 'A thermostat-controlled cavity for blackbody radiation experiments. ' +
            'Builds a Box with a slit on one wall and installs 4 inward-firing wall emitters ' +
            '(top, bottom, left, right). A tick function adjusts emitter burst sizes to maintain ' +
            'the target quanta count (temperature). Demonstrates how energy equilibrium emerges ' +
            'from local emitter control rather than a global energy equation.',
        fields: [
            {
                name: 'left',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Inner box left X position (physics pixels).'
            },
            {
                name: 'top',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Inner box top Y position (physics pixels).'
            },
            {
                name: 'width',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Inner box width (physics pixels).'
            },
            {
                name: 'height',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Inner box height (physics pixels).'
            },
            {
                name: 'wallThickness',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Wall thickness in physics pixels (default 10).'
            },
            {
                name: 'temperature',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                widgetConfig: { max: 3000, step: 50 },   // slider range (constraint has no max)
                description: 'Target quanta count inside the cavity (the "temperature"). ' +
                    'The thermostat tick function increases emission until this count is reached, ' +
                    'then stops all emitters. Higher = more particles = higher "temperature".'
            },
            {
                name: 'slitHeight',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Height of the slit opening on the exit wall (physics pixels, default 60). ' +
                    'Particles leak through this slit to the outside for blackbody spectrum measurement.'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Render color [r, g, b] for the box walls (render-only). A live edit fans ' +
                    'out to every wall the group owns (the `_owner` fan-out in updateObjectProperty).'
            }
        ]
    };

    /**
     * LogicGate — the V2 stock switching part (the successor named in
     * V2_PARTS_CLASSIFICATION.md §4.4 for CircuitGate): two `Wall{destroy,count}`
     * ammeter terminals, a mirror-`Tunnel` output channel carrying a
     * `SphereEmitter` supply rail, and a `Wall{destroy}` shunt valve.
     * Constructor: LogicGate(universe, { logic, left, top, bore, wallThickness,
     *                        length, supplyVoltage, thresholdHigh, thresholdLow,
     *                        windowTicks, color, name })
     * Group wrapper: every inner Wall/Tunnel wall and the supply emitter are
     * stamped with the ONE up-link `_owner` = <this>.
     */
    var LogicGateDescriptor = {
        kind: 'LogicGate',
        description: 'A powered logic gate assembled from stock: two counting-Wall ammeter ' +
            'terminals sense the current arriving on two input lanes, a comparator with ' +
            'hysteresis thresholds them into booleans, and one shunt valve either lets the ' +
            'gate\'s own supply rail reach the outlet or dumps it. Because the output is the ' +
            'gate\'s OWN rail, its HIGH level is independent of the input levels, so gates ' +
            'cascade without per-stage retuning. Zero physics of its own.',
        // A gate cell has a real placed extent, but its internal lane geometry is
        // derived — resizing it by dragging would silently break the lane pitch.
        ux: {
            resizable: false,
            draggable: { '2d': true },
            shellRender: 'run'
        },
        fields: [
            {
                name: 'logic',
                type: 'enum',
                // The vocabulary's OWNER is `LogicGate.TRUTH` / `LogicGate.LOGICS` (exported
                // on the object). It is not `require`d here because schema/index.js loads
                // BEFORE the object files in the browser roster — a require would resolve in
                // Node and silently read `undefined` off `window` in the realm, the worst of
                // both. Instead the copy is DRIFT-GATED: logic-gate.test.mjs asserts this
                // map's keys equal LogicGate.LOGICS exactly, so adding a row without updating
                // both fails CI. (Same discipline as Tunnel.mode / Tunnel.MODES.)
                constraint: { values: { AND: 'AND', OR: 'OR', XOR: 'XOR', NAND: 'NAND', NOR: 'NOR', XNOR: 'XNOR' } },
                engineVisible: false,
                live: true,
                description: 'The comparator row applied to the two sensed inputs. DATA, not geometry: every row builds the identical hardware and differs only in this function, so an inverting gate (NAND/NOR/XNOR) costs exactly what a non-inverting one costs here — unlike silicon.'
            },
            {
                name: 'left',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Gate cell left X position (physics pixels). The two input terminal faces and the output-channel inlet all sit on this edge.'
            },
            {
                name: 'top',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Gate cell top Y position (physics pixels). Input A rides the first lane, the powered output the middle lane, input B the third.'
            },
            {
                name: 'bore',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Lane aperture in physics pixels — the same bore the Traces wired to this gate should use. Sets the lane pitch (bore + 2 x wallThickness) and therefore the whole cell height.'
            },
            {
                name: 'wallThickness',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Lane insulation in physics pixels. This is the knob that sets the shrink floor: too thin and the channel mirrors go transparent, which reads as a dead gate rather than a noisy one.'
            },
            {
                name: 'length',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Output-channel X extent in physics pixels — the cell width. The measured floor is 20px (below that the supply inlet and the shunt valve overlap).'
            },
            {
                name: 'supplyVoltage',
                type: 'number',
                constraint: { min: 0, integer: true },
                engineVisible: false,
                live: true,
                unit: 'quanta/tick',
                description: 'The supply rail: emitter burst per tick, and therefore the gate\'s HIGH output level in quanta per tick. Raising it raises the output level and (unless the thresholds are pinned) the switching thresholds with it, so the gate stays correctly biased at any rail.'
            },
            {
                name: 'thresholdHigh',
                type: 'number',
                constraint: { min: 0 },
                engineVisible: false,
                live: true,
                unit: 'quanta/tick',
                description: 'Input current at or above which an input is called HIGH. Defaults to half the rail. Because the sensed current is a counting process, an input must sit several standard deviations clear of this value to be reliably read — see the part datasheet for the measured margin.'
            },
            {
                name: 'thresholdLow',
                type: 'number',
                constraint: { min: 0 },
                engineVisible: false,
                live: true,
                unit: 'quanta/tick',
                description: 'Input current below which a HIGH input reverts to LOW. Defaults to a quarter of the rail. The gap up to thresholdHigh IS the hysteresis — it is what stops an input sitting near its threshold from chattering on shot noise.'
            },
            {
                name: 'windowTicks',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                live: true,
                unit: 'ticks',
                description: 'Sliding window over which the input current is averaged. It sets BOTH the sense noise (which falls as 1/sqrt(window)) and half the switching delay — a longer window is a steadier, slower gate.'
            },
            {
                name: 'color',
                type: 'rgb',
                engineVisible: false,
                live: true,
                description: 'Render color [r, g, b] for the output-channel mirrors (render-only). A live edit fans out to both mirrors via the `_owner` fan-out in updateObjectProperty.'
            }
        ]
    };

    /**
     * CircuitGate — Density-activated logic gate for circuit experiments.
     * Constructor: CircuitGate(universe, gateType, x, y, signalWidth, gateLength,
     *                          horizontal, options)
     * options: { thresholdHigh, thresholdLow, windowTicks, fundamentalDim, notEmissionRate }
     * Group wrapper: the inner gateBody LargeObject (and optional notEmitter for NOT gates)
     * are stamped with the ONE up-link `_owner` = <this>.
     */
    var CircuitGateDescriptor = {
        kind: 'CircuitGate',
        description: 'A density-activated logic gate for quantum circuit experiments. ' +
            'Evaluates gate logic (AND, OR, NOT, XOR, BUFFER) by querying particle density ' +
            'in control regions, then toggles the gate body\'s collision type to open/close. ' +
            'Demonstrates how classical Boolean logic emerges from particle density thresholds. ' +
            'NOT gates include an internal emitter that fires when no input signal is present.',
        fields: [
            {
                name: 'gateType',
                type: 'enum',
                constraint: { values: { AND: 'AND', OR: 'OR', NOT: 'NOT', XOR: 'XOR', BUFFER: 'BUFFER' } },
                engineVisible: false,
                description: 'Gate logic type. AND/OR/XOR use two control regions; NOT/BUFFER use one. ' +
                    'Gate body is WALL (closed/blocking) when logic output is false, NONE (open) when true.'
            },
            {
                name: 'x',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Gate body center X (physics pixels).'
            },
            {
                name: 'y',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Gate body center Y (physics pixels).'
            },
            {
                name: 'signalWidth',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Height/width of the signal channel through the gate (physics pixels, default 6).'
            },
            {
                name: 'gateLength',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                description: 'Length of the gate body along the flow direction (physics pixels, default 4).'
            },
            {
                name: 'horizontal',
                type: 'boolean',
                engineVisible: true,
                description: 'Flow direction: true = particles flow horizontally (left→right); false = vertically (top→bottom).'
            },
            {
                name: 'thresholdHigh',
                type: 'number',
                constraint: { min: 0, integer: false },
                engineVisible: false,
                description: 'Average density (over windowTicks) above which a control region is considered HIGH (logic 1). Default 2.'
            },
            {
                name: 'thresholdLow',
                type: 'number',
                constraint: { min: 0, integer: false },
                engineVisible: false,
                description: 'Average density below which a control region returns to LOW (logic 0). Default 1. ' +
                    'Hysteresis band = [thresholdLow, thresholdHigh] prevents rapid toggling.'
            },
            {
                name: 'windowTicks',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                description: 'Sliding window size (ticks) for density averaging (default 20). ' +
                    'Larger values smooth burst fluctuations; smaller values make the gate more responsive.'
            },
            {
                name: 'notEmissionRate',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                description: 'Burst size of the NOT gate\'s internal emitter (particles/burst, default 2). Only applies to gateType NOT.'
            }
        ]
    };

    /**
     * CircuitProbe — Non-intrusive density probe for circuit experiments.
     * Constructor: CircuitProbe(universe, x, y, size, name)
     * Group wrapper: the inner marker LargeObject is stamped with the ONE up-link `_owner` = <this>.
     */
    var CircuitProbeDescriptor = {
        kind: 'CircuitProbe',
        description: 'A non-intrusive density probe for quantum circuit experiments. ' +
            'Uses universe.queryRect() to count particles in a rectangular region each tick ' +
            'without absorbing or deflecting them. Maintains a sliding window history for ' +
            'flow rate analysis. Renders a visual marker rectangle (NONE collision type).',
        fields: [
            {
                name: 'x',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Probe center X (physics pixels).'
            },
            {
                name: 'y',
                type: 'number',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Probe center Y (physics pixels).'
            },
            {
                name: 'size',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: true,
                unit: 'px',
                description: 'Width and height of the probe region (physics pixels). Square region centered at (x, y).'
            },
            {
                name: 'name',
                type: 'string',
                engineVisible: false,
                description: 'Probe identifier string (display/debug only).'
            },
            {
                name: 'windowSize',
                type: 'number',
                constraint: { min: 1, integer: true },
                engineVisible: false,
                description: 'Sliding window size (ticks) for flow rate averaging (default 10). getFlowRate() returns the average over this window.'
            }
        ]
    };

    /**
     * EgptFractal — JS-only 3-level recursive frame hierarchy oscillator.
     * Constructor: EgptFractal(universe, canvasRect)
     * NOT portable to WASM; experiments must mark portable:false.
     */
    var EgptFractalDescriptor = {
        kind: 'EgptFractal',
        description: 'A 3-level recursive frame hierarchy that produces emergent wave oscillation. ' +
            'Creates observer > oscillator > quantum dimension layers. The quantum does a random walk ' +
            'inside the oscillator frame; compress() pulls it toward the oscillator center, creating ' +
            'stable oscillation. The oscillator moves inside the observer frame, producing an emergent ' +
            'wave pattern in the observer\'s rest frame. Demonstrates the Frame Axiom at three scales. ' +
            'JS-only: uses Frame.makeLeafFrame and dimension APIs not yet implemented in WASM.',
        fields: [
            {
                name: 'quantum_dimension_number',
                type: 'readonly',
                engineVisible: true,
                description: 'Exponent for the quantum dimension scale (read-only; derived from canvasRect at construction).'
            }
        ]
    };

    // ── Registry ───────────────────────────────────────────────────────────────

    /**
     * ObjectSchema — registry of all canonical object kind descriptors.
     *
     * ObjectSchema.get(kind)               → descriptor or null
     * ObjectSchema.kinds()                 → string[] of all registered kind names
     * ObjectSchema.placeableCatalog()      → Array<PlaceableEntry> — schema-driven palette list
     * ObjectSchema.CollisionTypes          → the CollisionTypes object (by reference)
     * ObjectSchema.CollisionActions        → the CollisionActions object (by reference)
     *
     * Palette design rule: PLACEABLE_KINDS is the ONLY source of truth for what appears in
     * the IDE palette. Never hardcode the kind list in UI components.
     */
    var _registry = {
        LargeObject:      LargeObjectDescriptor,
        QuantumEmitter:   QuantumEmitterDescriptor,
        PointSource:      PointSourceDescriptor,
        SphereEmitter:    SphereEmitterDescriptor,
        Wall:             WallDescriptor,
        GraphingDetectorWall: GraphingDetectorWallDescriptor,
        DetectorWall:     DetectorWallDescriptor,
        SlitScreen:       SlitScreenDescriptor,
        SlitLightSource:  SlitLightSourceDescriptor,
        Box:              BoxDescriptor,
        Tunnel:           TunnelDescriptor,
        OvenBox:          OvenBoxDescriptor,
        LogicGate:        LogicGateDescriptor,
        CircuitGate:      CircuitGateDescriptor,
        CircuitProbe:     CircuitProbeDescriptor,
        EgptFractal:      EgptFractalDescriptor,
        particle:         ParticleDescriptor,
        backdrop:         BackdropDescriptor,
        LiveChart:        LiveChartDescriptor,
        Frame:            FrameDescriptor,     // writable engine-core accessor (distinct from particle)
        Universe:         UniverseDescriptor,  // C1 B4 — read-only universe state for op-program scope
        Dimension:        DimensionDescriptor  // C1 B4 — read-only dimension properties
    };

    // ── Field-type vocabulary drift guard (§7 r2 C1) ──────────────────────────
    //
    // Asserts every field.type across every registered descriptor is a member of
    // lib/shim/field-descriptor's FIELD_TYPES — the ONE owner. This is the load-time
    // half of the drift gate (the other half, in
    // lib/shim/field-descriptor/test/field-descriptor.test.mjs, cross-checks
    // makeControlsForObject.js's TYPE_DISPATCH against the SAME FIELD_TYPES list).
    // Skipped (not thrown) when FieldDescriptorSchema is unreachable — mirrors the
    // FrameDataSchema pointer-fallback discipline above; every normal boot resolves it,
    // so this runs in practice on every require()/script-tag load of this module.
    if (FieldDescriptorSchema && Array.isArray(FieldDescriptorSchema.FIELD_TYPES)) {
        var _fieldTypeSet = FieldDescriptorSchema.FIELD_TYPES;
        for (var _kindName in _registry) {
            if (!Object.prototype.hasOwnProperty.call(_registry, _kindName)) { continue; }
            var _fields = _registry[_kindName].fields || [];
            for (var _fi = 0; _fi < _fields.length; _fi++) {
                var _ft = _fields[_fi].type;
                if (_fieldTypeSet.indexOf(_ft) === -1) {
                    throw new Error('[lib/frqtl/objects/schema] descriptor "' + _kindName + '" field "' +
                        _fields[_fi].name + '" has type "' + _ft + '" — not a member of ' +
                        'lib/shim/field-descriptor\'s FIELD_TYPES ([' + _fieldTypeSet.join(', ') + ']). ' +
                        '(FAIL-LOUD — the field-type vocabulary is shared; add the type at the ONE ' +
                        'owner, lib/shim/field-descriptor/index.js, never here.)');
                }
            }
        }
    }

    // ── UX presentation-block drift guard (Bite 5b A0) ────────────────────────
    //
    // Every descriptor MAY carry a `ux:{}` block (the per-kind STUDIO presentation
    // contract). Its vocabulary is owned ONCE at lib/shim/field-descriptor
    // (UX_HANDLE_ZONES / UX_DRAGGABLE_MODES / UX_SHELL_RENDER + normalizeUx). We
    // VALIDATE each declared block at load time by running it through normalizeUx —
    // an invalid member FAILS LOUD here (never a silent bad-UX ship), exactly like
    // the field-type drift guard above. Skipped (not thrown) when FieldDescriptorSchema
    // is unreachable (pointer-fallback discipline). A descriptor with NO ux block is
    // untouched (R6 — today's behavior).
    if (FieldDescriptorSchema && typeof FieldDescriptorSchema.normalizeUx === 'function') {
        for (var _uk in _registry) {
            if (!Object.prototype.hasOwnProperty.call(_registry, _uk)) { continue; }
            if (_registry[_uk].ux !== undefined) {
                // Throws on an invalid ux member — surfacing the descriptor kind.
                try {
                    FieldDescriptorSchema.normalizeUx(_registry[_uk].ux);
                } catch (_uxErr) {
                    throw new Error('[lib/frqtl/objects/schema] descriptor "' + _uk +
                        '" has an invalid ux block: ' + _uxErr.message);
                }
            }
        }
    }

    // ── Normalizer-row exhaustiveness guard (load time) ───────────────────────
    //
    // The normalizer's row keys must be EXACTLY lib/shim/field-descriptor's FIELD_TYPES —
    // the ONE field-type vocabulary. A type added there without a row (or a row for a type
    // that no longer exists) FAILS LOUD at module load, so the two never drift into
    // "validated in one consumer, unvalidated in another". Skipped (not thrown) when the
    // contract module is genuinely unreachable — the same pointer-fallback discipline the
    // two guards above use.
    if (FieldDescriptorSchema && Array.isArray(FieldDescriptorSchema.FIELD_TYPES)) {
        var _rowKeys = ValueNormalizer.TYPES;
        var _vocab = FieldDescriptorSchema.FIELD_TYPES;
        for (var _vi = 0; _vi < _vocab.length; _vi++) {
            if (_rowKeys.indexOf(_vocab[_vi]) === -1) {
                throw new Error('[lib/frqtl/objects/schema] field type "' + _vocab[_vi] +
                    '" is declared in lib/shim/field-descriptor\'s FIELD_TYPES but has no ' +
                    'row in valueNormalizer.js\'s VALUE_NORMALIZERS — every declared type ' +
                    'must state how a written value is normalized/rejected. (FAIL-LOUD.)');
            }
        }
        for (var _ri = 0; _ri < _rowKeys.length; _ri++) {
            if (_vocab.indexOf(_rowKeys[_ri]) === -1) {
                throw new Error('[lib/frqtl/objects/schema] valueNormalizer.js declares a row ' +
                    'for "' + _rowKeys[_ri] + '", which is not a member of lib/shim/' +
                    'field-descriptor\'s FIELD_TYPES ([' + _vocab.join(', ') + ']). The type ' +
                    'vocabulary has ONE owner. (FAIL-LOUD.)');
            }
        }
    }

    // ── Default construction props, per kind ───────────────────────────────────
    //
    // The ONE authority for "what a kind constructs with when the caller omits a
    // prop" — read by ObjectFactory through ObjectSchema.defaultPropsFor(kind) for
    // EVERY kind, placeable or not. PLACEABLE_KINDS (the IDE palette list, below)
    // references these bags BY REFERENCE, so retiring a kind from the palette
    // changes only where it can be DROPPED — never how a recipe constructs it.
    var KIND_DEFAULT_PROPS = {
        QuantumEmitter: {
        source_rects: [[50, 95, 10, 10]],
        vx: 1, vy: 0,
        burst_size: 1,
        chargeMode: 'random',
        auto_fire: true,
        random_direction: false,
        quantum_limit: null,
        delay: 0,
        wrap: false
        },
        PointSource: {
        x: 50, y: 100,
        diameter: 16,
        speed: 1,
        chargeMode: 'random',
        auto_fire: true,
        quantum_limit: null,
        delay: 0,
        angle_increment: 10
        },
        SphereEmitter: {
        preset: 'spherical',
        is2D: true
        },
        SlitLightSource: {
        angle_increment: 10,
        quantum_limit: null,
        delay: 1
        },
        Wall: {
        // The bare palette drop's behavior authority: preset 'wall' -> collisionBehavior
        // 'block' (WallBehaviors.WALL_PRESETS), making the catalog's "vertical blocking
        // wall" true. A recipe's own `preset` replaces this one in _mergeProps's
        // Object.assign; a recipe's explicit `collisionBehavior` wins because Wall.js
        // preset-expansion fills ONLY undefined fields. Never a concrete
        // collisionBehavior here — that clobbered presets (K6).
        preset: 'wall',
        w: 12,
        h: 120,
        color: [150, 150, 160]
        },
        LargeObject: {
        collision_type: 'BOUNCE',
        actions: [],
        reposition: 'closest',
        search_padding: 1,
        color: [120, 120, 120]
        },
        Box: {
        left: 60, top: 60,
        width: 80, height: 80,
        wallThickness: 10,
        collisionType: 'BOUNCE',
        actions: [],
        color: [120, 120, 120]
        },
        SlitScreen: {
        slit_group_left: 100,
        slit_width: 8,
        wavelength: 20,
        slit_height: 16,
        slit_wall_gap_height: 16,
        absorbAtSlitWall: true,
        detectAtSlits: 0
        },
        Tunnel: {
        length: 80,
        bore: 24,
        wallThickness: 10,
        axis: 'x',
        color: [90, 120, 200]
        },
        OvenBox: {
        left: 60, top: 40,
        width: 100, height: 120,
        wallThickness: 10,
        temperature: 300,
        slitHeight: 60,
        color: [120, 120, 120]
        },
        DetectorWall: {
        wallX: 180,
        wallY: 0,
        wallCollisionType: 'NONE',
        wallColor: [120, 120, 120],
        wallHeight: 200,
        wallWidth: 20
        },
        GraphingDetectorWall: {
        w: 20,
        h: 200,
        binPx: 12,
        refreshMs: 100,
        heatBase: 0.35,
        color: [120, 200, 120]
        },
        LiveChart: {
        w: 200,
        h: 140,
        projector: 'detectorHistogram',
        series: 'bar',
        refreshMs: 100,
        color: [30, 40, 55]
        },
        LogicGate: {
        // A palette drop makes an AND gate on the densest lane geometry that was
        // MEASURED to hold the full truth table (bore 3 / wall 3 / length 20 —
        // a 20x27 px cell). `left`/`top` are intentionally absent: the
        // ObjectFactory builder derives them from the drop point (F1 drop idiom).
        logic: 'AND',
        bore: 3,
        wallThickness: 3,
        length: 20,
        supplyVoltage: 6,
        windowTicks: 20,
        color: [200, 170, 70]
        },
        CircuitGate: {
        gateType: 'AND',
        x: 100, y: 100,
        signalWidth: 6,
        gateLength: 4,
        horizontal: true,
        thresholdHigh: 2,
        thresholdLow: 1,
        windowTicks: 20,
        notEmissionRate: 2
        },
        CircuitProbe: {
        x: 100, y: 100,
        size: 10,
        name: 'probe',
        windowSize: 10
        }
    };

    // ── Placeable catalog ─────────────────────────────────────────────────────
    //
    // PLACEABLE_KINDS is the schema-driven IDE palette list.
    // Each entry: { kind, displayName, description, category, iconHint, defaultProps }
    //
    // Excluded from palette (not placeable via the IDE palette):
    //   particle     — emitted by engine, not placed
    //   EgptFractal  — JS-only low-level fractal; constructed programmatically
    //   LargeObject  — SUBSTRATE, not a part: the engine-facing atom every Wall/
    //                  Tunnel/Trace composes from (V2_PARTS_CLASSIFICATION §4.1).
    //                  Author boundaries as `Wall`; drop to the raw LO only in code.
    //   The V1 stock — QuantumEmitter, PointSource, SlitLightSource, SlitScreen,
    //                  DetectorWall, Box, OvenBox, CircuitGate, CircuitProbe —
    //                  carry ARCHIVE verdicts
    //                  (V2_PARTS_CLASSIFICATION §4.3/§4.4). The palette presents V2
    //                  stock only. Their DESCRIPTORS and ObjectFactory builders stay
    //                  (accessor validation + recipe construction are driven by the
    //                  descriptor registry and `_builders`, never by this list), so
    //                  existing setups and recipes are unaffected; the FILES follow
    //                  their consumers into archive as each experiment is rebuilt.
    //
    // backdrop is NOT a placeable dropper kind — it's added via the EFFECTS toggle
    // (runner.addBackdrop), not buildObject. (Listing it here made a dead palette control.)
    //
    // category: 'emitter' | 'boundary' | 'composite' | 'measurement' | 'circuit'

    var PLACEABLE_KINDS = [
        // ── Emitters ────────────────────────────────────────────────────────
        {
            kind: 'SphereEmitter',
            displayName: 'Sphere Emitter',
            description: SphereEmitterDescriptor.description,
            category: 'emitter',
            iconHint: 'emitter',
            // A palette drop makes a visible 2D omni "sun" (spherical disk of directions);
            // every other scene-affecting opt defaults inside setupSphereEmitter3D (byte-
            // identical to a bare factory call). captureProps round-trips the full resolved set.
            defaultProps: KIND_DEFAULT_PROPS.SphereEmitter
        },
        // ── Boundaries ──────────────────────────────────────────────────────
        {
            kind: 'Wall',
            displayName: 'Wall',
            description: WallDescriptor.description,
            category: 'boundary',
            iconHint: 'wall',
            // A palette drop makes a vertical blocking wall centered on the click; the
            // ObjectFactory builder derives the rect from ctx.x/ctx.y (F1 drop idiom).
            // NOTE: collisionBehavior is INTENTIONALLY not in defaultProps. `_mergeProps` does
            // Object.assign({}, defaults, config), so a hardcoded default here lands as a CONCRETE
            // value in the props bag and Wall.js's preset-expansion (`if (merged[k]===undefined)`)
            // can no longer override it — silently dropping a preset's collisionBehavior
            // (K6: addObject('Wall',{preset:'detector-screen'}) yielded 'nothing' not 'destroy').
            // Behavior is owned by ONE authority: the PRESET — the defaults' `preset: 'wall'`
            // for a bare drop ('block', matching this "blocking wall" description), replaced
            // by a recipe's own preset, and out-ranked field-by-field by a recipe's explicit
            // collisionBehavior (expansion fills only undefined fields).
            defaultProps: KIND_DEFAULT_PROPS.Wall
        },
        // NOTE: 'backdrop' is intentionally NOT a placeable dropper kind — it is added
        // via the EFFECTS "Backdrop" toggle (runner.addBackdrop), not buildObject (which
        // has no backdrop branch). Listing it here produced a dead palette control that
        // silently no-op'd on drop. BackdropDescriptor still exists for the inspector.
        // ── Composites (group objects) ───────────────────────────────────────
        {
            kind: 'Tunnel',
            displayName: 'Mirror Tunnel',
            description: TunnelDescriptor.description,
            category: 'composite',
            iconHint: 'tunnel',
            // A palette drop makes a short horizontal mirror corridor centered on the click;
            // the ObjectFactory builder derives the bore origin from ctx.x/ctx.y (F1 drop idiom).
            defaultProps: KIND_DEFAULT_PROPS.Tunnel
        },
        // ── Measurement ─────────────────────────────────────────────────────
        {
            kind: 'GraphingDetectorWall',
            displayName: 'Graphing Detector Wall',
            description: GraphingDetectorWallDescriptor.description,
            category: 'measurement',
            iconHint: 'detector',
            // A palette drop makes a tall counting screen centered on the click (the
            // ObjectFactory builder derives the rect from ctx.x/ctx.y — the F1 drop
            // idiom, inherited from the Wall builder). collisionBehavior is
            // INTENTIONALLY absent for the SAME reason as the Wall entry: the object
            // defaults to the detector-screen preset, and a concrete default here would
            // silently out-rank it.
            defaultProps: KIND_DEFAULT_PROPS.GraphingDetectorWall
        },
        {
            kind: 'LiveChart',
            displayName: 'Live Chart',
            description: LiveChartDescriptor.description,
            category: 'measurement',
            iconHint: 'chart',
            // A palette drop makes a chart panel centered on the click; the ObjectFactory
            // builder derives the rect from ctx.x/ctx.y (F1 drop idiom). `source` is left
            // unset — a dropped chart must be pointed at a counting Wall (by name or handle)
            // in the recipe/Inspector before it can wire (fails loud otherwise).
            defaultProps: KIND_DEFAULT_PROPS.LiveChart
        },
        // ── Circuit ─────────────────────────────────────────────────────────
        {
            kind: 'LogicGate',
            displayName: 'Logic Gate',
            description: LogicGateDescriptor.description,
            category: 'circuit',
            iconHint: 'gate',
            // A palette drop makes an AND gate on the smallest MEASURED cell, centered
            // on the click; the ObjectFactory builder derives left/top from ctx.x/ctx.y
            // (F1 drop idiom), which is why they are absent from defaultProps.
            defaultProps: KIND_DEFAULT_PROPS.LogicGate
        }
    ];

    var ObjectSchema = {
        get: function (kind) {
            return _registry[kind] || null;
        },
        kinds: function () {
            return Object.keys(_registry);
        },
        /**
         * ux(kind) → the normalized STUDIO UX presentation contract for a kind
         * (Bite 5b A0). Runs the descriptor's declared `ux:{}` block (or absence)
         * through lib/shim/field-descriptor's normalizeUx, so a caller ALWAYS gets
         * the full bag { resizable, draggable, handles, shellRender }
         * with legacy defaults filled (R6 — no block ⇒ today's behavior). Consumers
         * (STUDIO's overlay + Inspector, a headless game) FERRY this — they never
         * re-derive the vocabulary. Returns the legacy-default bag when the field-
         * descriptor contract is unreachable OR the kind is unknown (never throws
         * on a read — the write-time normalize guard above is the fail-loud gate).
         * @param {string} kind
         * @returns {{resizable:boolean, draggable:object, handles:string[], shellRender:string}}
         */
        ux: function (kind) {
            var descriptor = _registry[kind] || null;
            var raw = descriptor ? descriptor.ux : undefined;
            if (FieldDescriptorSchema && typeof FieldDescriptorSchema.normalizeUx === 'function') {
                return FieldDescriptorSchema.normalizeUx(raw);
            }
            // Field-descriptor unreachable — inline legacy default (mirrors normalizeUx's
            // no-block branch). Never throws on a read.
            return {
                resizable: true,
                draggable: { '2d': true },
                handles: null,           // null ⇒ "all zones" for a consumer without the vocab
                shellRender: 'design'
            };
        },
        /**
         * Returns the schema-driven palette catalog: an array of PlaceableEntry objects.
         * Each entry: { kind, displayName, description, category, iconHint, defaultProps }.
         * This is the ONLY source a palette component should use — never hardcode kind names in UI.
         *
         * @returns {Array<{kind:string, displayName:string, description:string,
         *                  category:string, iconHint:string, defaultProps:Object}>}
         */
        placeableCatalog: function () {
            return PLACEABLE_KINDS.slice(); // shallow copy; callers must not mutate entries
        },
        /**
         * defaultPropsFor(kind) → the kind's default construction props, or `{}`.
         *
         * The ONE read path for construction defaults (KIND_DEFAULT_PROPS above).
         * ObjectFactory._mergeProps ferries this bag; it does NOT scan
         * placeableCatalog(), because the palette answers "what can be DROPPED in
         * STUDIO" while this answers "what does a kind construct with" — two
         * different questions that used to share one list. A kind retired from the
         * palette keeps constructing identically through a recipe.
         *
         * Returns the live bag by reference (same contract as placeableCatalog()'s
         * entries: callers must not mutate it — _mergeProps copies).
         * @param {string} kind
         * @returns {object}
         */
        defaultPropsFor: function (kind) {
            return Object.prototype.hasOwnProperty.call(KIND_DEFAULT_PROPS, kind)
                ? KIND_DEFAULT_PROPS[kind] : {};
        },
        /**
         * The declared-type write gate: `normalizeValue(fieldDef, value, kind?)` returns
         * the value in its declared canonical form or THROWS naming kind/field/expected
         * type (throw-or-apply). Implemented by the sibling `valueNormalizer.js` (the
         * per-type contract table lives there); exposed HERE so there is ONE public
         * entry point, which every consumer — the accessor
         * (FrqtlApp.updateObjectProperty) and the controls factory's read-side
         * validity probe — FERRIES rather than re-implementing per type.
         */
        normalizeValue: ValueNormalizer.normalizeValue,
        // The ONE world-rect normalizer (valueNormalizer.js::worldRect): `{left,top,w,h}`
        // or the rect tuple → `{w,h,…}`, THROWING on a missing/non-positive dimension.
        worldRect: ValueNormalizer.worldRect,
        // THE rect write-tuple order (valueNormalizer.js::RECT_TUPLE) and its text form — every
        // description below that spells a tuple is BUILT from rectTupleText.
        RECT_TUPLE: ValueNormalizer.RECT_TUPLE,
        rectTupleText: ValueNormalizer.rectTupleText,
        // The field-TYPE vocabulary, FERRIED by reference from its ONE owner
        // (lib/shim/field-descriptor) so a consumer that already holds ObjectSchema can
        // drive a table off it without a second import — never a re-listed copy. Falls
        // back to the normalizer row keys when the contract module is unreachable (the
        // load-time guard above proves the two sets are identical whenever it IS
        // reachable), so a consumer always gets the vocabulary, never undefined.
        FIELD_TYPES: (FieldDescriptorSchema && Array.isArray(FieldDescriptorSchema.FIELD_TYPES))
            ? FieldDescriptorSchema.FIELD_TYPES
            : ValueNormalizer.TYPES,
        // Exposed by reference so tests can assert identity (not copies).
        CollisionTypes:   CollisionTypes,
        CollisionActions: CollisionActions,
        // FrameDataSchema reference — the bubble sub-shape authority (lib/shim/frame-data).
        // May be null in environments where lib/shim is not on the require path.
        FrameDataSchema:  FrameDataSchema,
        // FieldDescriptorSchema reference — the shared field-shape/type-vocabulary authority
        // (lib/shim/field-descriptor, §7 r2 C1). May be null in environments where lib/shim
        // is not on the require path (same discipline as FrameDataSchema above).
        FieldDescriptorSchema: FieldDescriptorSchema
    };

    // ── Export ─────────────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            KIND_DEFAULT_PROPS,
            ObjectSchema,
            PLACEABLE_KINDS,
            LargeObjectDescriptor,
            QuantumEmitterDescriptor,
            PointSourceDescriptor,
            SphereEmitterDescriptor,
            WallDescriptor,
            GraphingDetectorWallDescriptor,
            DetectorWallDescriptor,
            SlitScreenDescriptor,
            SlitLightSourceDescriptor,
            BoxDescriptor,
            OvenBoxDescriptor,
            CircuitGateDescriptor,
            CircuitProbeDescriptor,
            EgptFractalDescriptor,
            ParticleDescriptor,
            BackdropDescriptor,
            LiveChartDescriptor,
            FrameDescriptor,
            UniverseDescriptor,   // C1 B4
            DimensionDescriptor   // C1 B4
        };
    } else {
        window.ObjectSchema = ObjectSchema;
        window.PLACEABLE_KINDS = PLACEABLE_KINDS;
    }

})();
