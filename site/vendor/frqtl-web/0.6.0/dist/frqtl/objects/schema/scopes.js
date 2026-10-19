/* Copyright 2023-2026 by Essam Abadir */

/**
 * scopes.js — the schema's SCOPE descriptor rows: the engine and render scopes an inspector or an
 * op-program addresses, NOT placeable kinds. They have no class, no builder and no defaults; they
 * are never constructed, registered or forked.
 *
 *   SCOPE_DESCRIPTORS   { particle, backdrop, Frame, Universe, Dimension, LargeObject }
 *   shapeValuesMap()    the render.shape constraint map (frame-data owns the list)
 *
 * ObjectSchema.get(name) reads the kinds registry first, then these rows; objects/kinds.js
 * registerKind REFUSES a class whose name is a scope row's, so one name never has two owners — with
 * ONE exception: a kind whose descriptor IS that row's object (LargeObject: the part registers the
 * engine door's row by reference, so the name still has one owner, this file).
 * Frame / Universe / Dimension are the engine-core accessor descriptors, owned by engine-scopes.js.
 */

import * as EngineScopes from './engine-scopes.js';
import { validateDescriptor } from './validate-descriptor.js';
import * as ValueNormalizer from './valueNormalizer.js';
import * as FrameDataSchema from '../../../shim/frame-data/index.js';
import { CollisionTypes } from '../../parts/CollisionTypes.js';
import { CollisionActions } from '../../parts/CollisionActions.js';

/**
 * The render-intent shape vocabulary as a constraint map (value → value), read from frame-data's
 * RENDER_INTENT_VALUES['render.shape'] — the ONE owner of the shape list. Schema/index.js re-exports it.
 * @returns {Object<string,string>}
 */
export function shapeValuesMap() {
    var arr = FrameDataSchema.RENDER_INTENT_VALUES['render.shape'];
    var m = {};
    if (Array.isArray(arr)) { for (var i = 0; i < arr.length; i++) { m[arr[i]] = arr[i]; } }
    return m;
}

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
     * LargeObject — Engine-registered wall/boundary/detector: primitive 4 of THE_MINIMAL_SIM, so its
     * descriptor is an ENGINE-DOOR scope row (the engine's updateObjectProperty(h, 'LargeObject', …)
     * validates against it with no part imported). parts/LargeObject.js registers its kind with
     * `descriptor:` set to THIS object, by reference.
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
                // ── SWEPT-OBB NARROW-PHASE region (circulation §2) ──────────────────────────
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
                //   (the frozen 2D JS fixture FAILS LOUD on a non-null region).
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
                // Studio Controls Realignment S4 (design §2.3.5):
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
                // directly. Studio Controls Realignment S4: a runtime edit of THIS field is ALSO
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
                    'search rect now expands by the dimension\'s mb_w. Retained ' +
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
                // WHEN this object's visual shell paints (render-only, generalizes
                // the `_designMarker` boolean at the ONE _visibleLargeObjects authority):
                //   design — only while authoring (Design mode). The manipulable-marker
                //            default (a SphereEmitter marker is invisible during Run — you see the
                //            emission, not the source).
                //   run    — ALWAYS visible (the "red light bulb" opt-in: a run-visible shell;
                //            pair with visible:true + color:[255,0,0] + a low alpha for the orb).
                //   never  — never drawn.
                // Absent → the effective default is derived at the filter (a _designMarker LO
                // defaults 'design'; an ordinary LO defaults always-visible = 'run') so every
                // existing scene is byte-identical. A live edit (updateObjectProperty) sets the
                // per-instance override that _visibleLargeObjects reads.
                description: 'When this object\'s visual shell renders (render-only): design = only ' +
                    'while authoring (the marker default); run = always visible (the "red light ' +
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
                // the same set "Default Shape" uses; never a hand-listed enum (R2-3).
                constraint: { values: shapeValuesMap() },
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
                // program is still engineVisible + captured (the parts writer's round trip).
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
/** The scope rows, in the schema's published order. */
export const SCOPE_DESCRIPTORS = Object.freeze({
    particle:  ParticleDescriptor,
    backdrop:  BackdropDescriptor,
    Frame:     EngineScopes.FrameDescriptor,     // writable engine-core accessor (distinct from particle)
    Universe:  EngineScopes.UniverseDescriptor,  // C1 B4 — read-only universe state for op-program scope
    Dimension: EngineScopes.DimensionDescriptor, // C1 B4 — read-only dimension properties
    LargeObject: LargeObjectDescriptor           // the engine door's object scope; the LargeObject part registers it BY REFERENCE
});
Object.keys(SCOPE_DESCRIPTORS).forEach(function (name) { validateDescriptor(name, SCOPE_DESCRIPTORS[name]); });
