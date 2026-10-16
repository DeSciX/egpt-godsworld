/* Copyright 2023-2026 by Essam Abadir */

/**
 * engine-scopes.js — the ENGINE-CORE ACCESSOR descriptors: `Frame`, `Universe`,
 * `Dimension`.
 *
 * These three are a different family from every other descriptor in this
 * directory. The rest describe AUTHORED PARTS — things a person places, wires and
 * drags, whose fields are constructor parameters. These three describe the
 * ENGINE'S OWN SCOPES: the objects an op-program addresses (`0.mass`,
 * `universe.tick`, `dimension.layer`) and the uniform accessors
 * `getFrameProperty`/`setFrameProperty` write through. They are never placed,
 * never dragged, and never appear in the palette.
 *
 * That is the seam this file splits on. `schema/index.js` is the ONE registry and
 * the ONE public surface — it requires this module, registers these three
 * descriptors alongside the part descriptors, and re-exports them, so NO consumer
 * changes and `ObjectSchema.get('Frame')` is exactly what it always was.
 *
 * Loaded like its sibling `valueNormalizer.js`: in Node by `require` from
 * index.js; in the browser by a script tag placed BEFORE `schema/index.js` in the
 * game-layer roster (`lib/shim/engine/game-layer-manifest.js` +
 * `lib/frqtl/experiments/_shared/stack-boot.js`). index.js FAILS LOUD without it.
 *
 * WHY IT WAS SPLIT OUT: `schema/index.js` reached the per-file size ceiling that
 * `sdk/frqtl-sdk/scripts/verify-publish-surface.mjs` enforces on every
 * authored/copied-from-source dist directory (the backstop against a renamed or
 * minified core re-bundle landing in the package). That gate's own instruction is
 * to SPLIT AT A NATURAL SEAM rather than raise the ceiling, which is what this
 * file is. Adding a part descriptor should never require touching this one.
 *
 * DATA-BUBBLE DISCIPLINE: the `Frame.data` sub-shape is NOT re-listed here either.
 * `lib/shim/frame-data` (SECTION_KEYS, normalizeDataBubble) is the one owner and is
 * referenced BY REFERENCE through `FrameDataSchema`, exactly as index.js does.
 */

(function () {
    'use strict';

    // FrameDataSchema — resolved the SAME way schema/index.js resolves it, so the
    // two files agree by construction rather than by coincidence. Node: the real
    // module. Browser: the global lib/shim/frame-data publishes. A null here is the
    // documented pointer fallback (consumers resolve window.FrameDataSchema at
    // access time), NOT a silent degradation — index.js carries the same fallback.
    var FrameDataSchema = null;
    if (typeof module !== 'undefined' && module.exports) {
        var path = require('path');
        try {
            FrameDataSchema = require(path.resolve(__dirname, '../../../shim/frame-data/index.js'));
        } catch (e) {
            FrameDataSchema = null;
        }
    } else {
        FrameDataSchema = (typeof window !== 'undefined' && window.FrameDataSchema) || null;
    }

    /**
     * Frame — Writable engine-core descriptor for any frame in the simulation.
     *
     * Relationship to `particle` kind:
     *   `particle` is a READ-ONLY inspector view of a leaf frame (is_leaf=true).
     *   `Frame` is the WRITABLE engine-core accessor for ANY frame (leaf or composite).
     *   Keep them DISTINCT — do NOT merge them. `particle` drives the inspector palette;
     *   `Frame` drives the uniform accessor (getFrameProperty/setFrameProperty).
     *
     * Property access rules (docs/internal/engine/ENGINE_CONTRACT.md):
     *   type:'writable'   → user-writable; reaches the engine.
     *   type:'readonly'   → derived/computed; inspectable, write THROWS.
     *   type:'forbidden'  → engine-owned topology; any write FAIL-LOUDs (TypeError).
     *
     * FAIL-LOUD discipline (Gate-2 architect binding, 2026-06-21):
     *   The Frame accessor is THROW-OR-APPLY, never silent-skip.
     *   Frames have NO JS-wrapper upstream (engine owns them).
     *   Every writable prop reaches the engine or throws.
     *   Every non-writable/forbidden prop throws on write, always.
     *
     * data bubble sub-shape:
     *   NOT re-listed here. The canonical authority is lib/shim/frame-data (SECTION_KEYS,
     *   normalizeDataBubble). Reference it via FrameDataSchema — never re-enumerate
     *   'detection'/'render'/'ext' keys (schema-mirror trap; §Engineering Culture CEO mandate).
     */
    var FrameDescriptor = {
        kind: 'Frame',
        description: 'Any simulation frame (leaf or composite). ' +
            'Provides writable access to engine-core properties via getFrameProperty/setFrameProperty. ' +
            'Leaf frames (is_leaf=true) are the fundamental quanta; composite frames are parent nodes ' +
            'in the Frame hierarchy. The Frame Axiom: everything is a Frame — there is no separate ' +
            'particle class. Position/velocity/mass writes bypass move() by design (user override); ' +
            'the engine\'s CA rules reconcile topology and wavelength on the next tick. ' +
            'Topology (parent/children) is engine-owned and FORBIDDEN from user writes.',
        fields: [
            // ── Writable: position ──────────────────────────────────────────────
            {
                name: 'x',
                type: 'writable',
                engineVisible: true,
                unit: 'px',
                description: 'Frame center X position (physics pixels). ' +
                    'Write repositions the frame directly, bypassing move() — user override. ' +
                    'The engine does not clamp; caller is responsible for placing within bounds. ' +
                    'Children that escape their parent rect are released next tick by releaseEscapedChildren.'
            },
            {
                name: 'y',
                type: 'writable',
                engineVisible: true,
                description: 'Frame center Y position (physics pixels). ' +
                    'Write repositions the frame directly, bypassing move() — user override.'
            },
            {
                name: 'z',
                type: 'writable',
                engineVisible: true,
                description: 'Frame center Z position (depth, physics pixels). ' +
                    'Default 0.0 when active_axes.z is false (2D mode). ' +
                    'Bite 3 (ws-3d-discrete-walk): set by the 3D emitter; moved by the ' +
                    'independent z yo-yo coin when active_axes.z is true. ' +
                    'Cube edge = w (spec §11 — no separate d field; cubes only).'
            },
            {
                name: 'left',
                type: 'writable',
                engineVisible: true,
                description: 'Frame left edge (physics pixels). ' +
                    'Write repositions the frame by its left edge (mirrors lo._eject otherRect.left = newLeft). ' +
                    'Bit-identical to the native WALL eject — used in §10.3 eject-expression programs. ' +
                    'Setting left also updates right; center x is derived.'
            },
            {
                name: 'top',
                type: 'writable',
                engineVisible: true,
                description: 'Frame top edge (physics pixels). ' +
                    'Write repositions the frame by its top edge (mirrors lo._eject otherRect.top = newTop). ' +
                    'Bit-identical to the native WALL eject — used in §10.3 eject-expression programs. ' +
                    'Setting top also updates bottom; center y is derived.'
            },
            // ── Writable: momentum ─────────────────────────────────────────────
            {
                name: 'vx',
                type: 'writable',
                engineVisible: true,
                unit: 'px/tick',
                description: 'X velocity / momentum (pixels/tick). ' +
                    'Positive = rightward, negative = leftward. ' +
                    'The 1px/tick speed limit still applies on the next move() call; ' +
                    'excess accumulates back into vx.'
            },
            {
                name: 'vy',
                type: 'writable',
                engineVisible: true,
                description: 'Y velocity / momentum (pixels/tick). ' +
                    'Positive = downward (screen coords), negative = upward.'
            },
            {
                name: 'vz',
                type: 'writable',
                engineVisible: true,
                description: 'Z velocity / momentum (pixels/tick). ' +
                    'Default 0.0 when active_axes.z is false (2D mode). ' +
                    'When active_axes.z is true, the yo-yo z coin adds/subtracts to vz ' +
                    'each tick for the transverse axes (spec §3 / D5/D10). ' +
                    'The Euclidean L2 walk probs include vz: D = sqrt(vx²+vy²+vz²).'
            },
            // ── Writable: mass ─────────────────────────────────────────────────
            {
                name: 'mass',
                type: 'writable',
                engineVisible: true,
                description: 'Pixel occupancy count. Feeds setWavelength() on the next tick ' +
                    '(EGPTfrqtl.js:1716 / FrameStore.set_wavelength). Higher mass → shorter ' +
                    'wavelength → higher frequency (E=mc² analog, invariant 6).'
            },
            // ── Writable: charge ───────────────────────────────────────────────
            {
                name: 'charge',
                type: 'writable',
                engineVisible: true,
                description: 'Charge polarity: "POSITIVE" or "NEGATIVE" (canonical SCREAMING_SNAKE). ' +
                    'Determines wave phase (sine vs cosine random walk) and bonding attraction/repulsion. ' +
                    'Wire format: provider translates to engine-native (JS: 0/1; Rust: Charge enum).'
            },
            // ── Writable: lifecycle ────────────────────────────────────────────
            {
                name: 'is_alive',
                type: 'writable',
                engineVisible: true,
                description: 'Liveness flag. Setting false kills the frame: it is excluded from ' +
                    'physics next tick and GC\'d at end-of-tick. Equivalent to killFrame(id) ' +
                    'but accessed uniformly. Children of a killed composite are orphaned ' +
                    '(not recursively killed) — topology is reconciled by garbageCollectDeadParents.'
            },
            // ── Writable: motion control ───────────────────────────────────────
            {
                name: 'is_stationary',
                type: 'writable',
                engineVisible: true,
                description: 'Pins the frame in place: move() is skipped when true. ' +
                    'Existing per-frame flag (EGPTfrqtl.js:1681 / FrameStore.is_stationary). ' +
                    'Used in bespoke experiments to freeze specific frames while others evolve.'
            },
            {
                name: 'wrap',
                type: 'writable',
                engineVisible: true,
                description: 'Toroidal boundary for this individual frame. When true the frame ' +
                    'wraps at the canvas edges instead of escaping or bouncing. ' +
                    'Overrides the universe-level wrap setting for this frame.'
            },
            {
                name: 'speed_prob',
                type: 'writable',
                engineVisible: true,
                description: 'Per-frame OVERRIDE of the leaf longitudinal "speed probability" — the ' +
                    'probability the frame takes its along-momentum step this tick (frame.rs move_frame ' +
                    'leaf gate). Sentinel -1.0 (default; any negative resets to it) = derive from ' +
                    'fullness (mass/capacity). When >= 0.0 it overrides the gate so user space can set ' +
                    'the move-probability independent of mass — e.g. red vs blue light sharing a speed ' +
                    'while differing in momentum/wavelength. Does NOT change the orthogonal wavelength.'
            },
            // ── Writable: wave phase ───────────────────────────────────────────
            {
                name: 'local_time',
                type: 'writable',
                constraint: { integer: true },
                engineVisible: true,
                description: 'Per-frame wave-phase counter (integer ticks; EGPTfrqtl.js:2473 / ' +
                    'frame.rs local_time). Drives the spin/coin-flip via local_time % wavelength. ' +
                    'Incremented each tick; reset to 0 on collision/reset. Op-programs that ' +
                    'reproduce the native reset() (e.g. compiled RANDOM_* collision behavior) ' +
                    'write 0 here. CANONICAL home for the writable-prop contract — both engines ' +
                    'mirror this descriptor; neither hand-lists it (schema-mirror-drift fix).'
            },
            // ── Writable: data bubble ──────────────────────────────────────────
            {
                name: 'data',
                type: 'writable',
                engineVisible: true,
                // IMPORTANT: the sub-shape of this bag is OWNED by lib/shim/frame-data.
                // We reference it here — we NEVER re-list 'detection'/'render'/'ext' keys.
                // Callers must use FrameDataSchema (= lib/shim/frame-data) for the shape.
                dataBubbleSchema: FrameDataSchema, // resolved at module load; may be null in envs without the shim
                description: 'The per-frame data bubble: { detection, render, ext }. ' +
                    'Sub-shape is owned by lib/shim/frame-data (SECTION_KEYS + normalizeDataBubble). ' +
                    'detection — written by engine MARK/DETECT primitives (detector_name). ' +
                    'render    — written by sugar (emitter stamps data.render.color); renderer reads. ' +
                    'ext       — developer-extensible; JS-only (not cross-engine assertable). ' +
                    'NEVER enumerate the section keys here — always resolve from FrameDataSchema.'
            },
            // ── Read-only: derived ─────────────────────────────────────────────
            {
                name: 'fullness',
                type: 'readonly',
                engineVisible: true,
                description: 'Derived: mass / capacity (0.0–1.0). ' +
                    'Used by the renderer for color mapping and by detectors for density measurement. ' +
                    'Not directly writable — set mass to change fullness indirectly.'
            },
            {
                name: 'capacity',
                type: 'readonly',
                engineVisible: true,
                unit: 'px²',
                description: 'Derived: rect.w * rect.h (physics pixels). ' +
                    'Fixed at frame creation; determined by the frame\'s bounding rect size.'
            },
            {
                name: 'child_count',
                type: 'readonly',
                engineVisible: true,
                description: 'Number of direct children in this frame\'s hierarchy (0 for leaf frames). ' +
                    'Per-tick result; changes as promote/merge/release rules run.'
            },
            {
                name: 'collided_id',
                type: 'readonly',
                engineVisible: true,
                description: 'ID of the other frame this frame collided with in the last tick, ' +
                    'or -1/null if no collision occurred. Per-tick result from the Phase C collide pass.'
            },
            {
                name: 'r',
                type: 'readonly',
                engineVisible: true,
                description: 'Radius cache: max(rect.w, rect.h) / 2. ' +
                    'Used in proximity checks and rendering. Derived from rect size.'
            },
            {
                name: 'w',
                type: 'readonly',
                engineVisible: true,
                description: 'Frame width in physics pixels (fixed at creation, derived from rect.w). ' +
                    'Read in op-program scope for eject geometry: set frame.left = self.left - frame.w - 1. ' +
                    'For leaf quanta this is 1.'
            },
            {
                name: 'h',
                type: 'readonly',
                engineVisible: true,
                description: 'Frame height in physics pixels (fixed at creation, derived from rect.h). ' +
                    'Read in op-program scope for eject geometry: set frame.top = self.top - frame.h - 1. ' +
                    'For leaf quanta this is 1.'
            },
            {
                name: 'layer',
                type: 'readonly',
                engineVisible: true,
                description: 'Dimension layer membership (u32). Assigned at frame creation; ' +
                    'engine-managed — changes only when the frame is promoted to a higher dimension. ' +
                    'User writes are REJECTED (use the promote/detach structural primitives).'
            },
            // ── Read-only: scope-read pre-move snapshot ────────────────────────
            // prev_x/prev_y are the CENTER position before this tick's move() (saved by
            // Frame::move, frame.rs:626). They are READABLE in op-program scope
            // (frame_to_scope_bag, universe.rs) so the compiled MOMENTUM_BASED behavior can
            // restore the pre-move position via `set 0.x = Ref(0,'prev_x')`. Promoted to
            // canonical FrameDescriptor fields (PF1) so the one owner is mirrored by both
            // interpreters + conformance — closes the scope-read schema-mirror gap
            // (docs/internal/engine/ENGINE_LANGUAGE_SPEC.md §5-F3). Read-only — engine-owned per-tick snapshot.
            {
                name: 'prev_x',
                type: 'readonly',
                engineVisible: true,
                description: 'Derived (scope-read): frame CENTER X before this tick\'s move() ' +
                    '(physics pixels). Readable in op-program scope as Ref(0,"prev_x") — the ' +
                    'compiled MOMENTUM_BASED behavior restores pre-move position via set 0.x = prev_x. ' +
                    'Read-only — write THROWS (engine-owned per-tick snapshot, saved by Frame::move).'
            },
            {
                name: 'prev_y',
                type: 'readonly',
                engineVisible: true,
                description: 'Derived (scope-read): frame CENTER Y before this tick\'s move() ' +
                    '(physics pixels). Readable in op-program scope as Ref(0,"prev_y"). ' +
                    'Read-only — write THROWS (engine-owned per-tick snapshot, saved by Frame::move).'
            },
            {
                name: 'prev_z',
                type: 'readonly',
                engineVisible: true,
                description: 'Derived (scope-read): frame CENTER Z before this tick\'s move() ' +
                    '(physics pixels). Default 0.0 when active_axes.z is false. ' +
                    'Bite 3 (ws-3d-discrete-walk): saved by Frame::move_frame alongside prev_x/prev_y. ' +
                    'Read-only — write THROWS (engine-owned per-tick snapshot).'
            },
            // ── Forbidden: engine-owned topology ──────────────────────────────
            {
                name: 'parent',
                type: 'forbidden',
                engineVisible: false,
                description: 'FORBIDDEN — engine-owned topology. ' +
                    'The parent link is managed exclusively by the engine\'s promote/detach/GC rules. ' +
                    'Any write attempt FAIL-LOUDs with a TypeError. ' +
                    'To move a frame: write its x/y position and let the engine reconcile topology ' +
                    '(releaseEscapedChildren drops children outside their parent rect next tick).'
            },
            {
                name: 'children',
                type: 'forbidden',
                engineVisible: false,
                description: 'FORBIDDEN — engine-owned topology. ' +
                    'The children list is managed exclusively by the engine\'s promote/attach/detach rules. ' +
                    'Any write attempt FAIL-LOUDs with a TypeError.'
            }
        ]
    };

    /**
     * Universe — property table for the top-level simulation container.
     *
     * Gate-2 architect binding (§10.8 B4, 2026-06-21):
     *   Same home/pattern as FrameDescriptor. Reads = readonly (activeQuanta, tick).
     *   Scratch slots = writable (no scratch slots defined in that slice).
     *   THROW-OR-APPLY FAIL-LOUD on writes to readonly fields (no silent-skip).
     *
     * WS Studio Controls Realignment S1 (design §2.3.2 / gap-census #10, 2026-07-05):
     *   Added the FIRST writable field, `wavelengthScale` — Wave Interference's
     *   primary physics knob was previously unbindable (no writable Universe field
     *   existed to validate a bind against; the page wrote `universe.wavelengthScale`
     *   directly, undeclared and unreachable by any control-contract mechanism). This
     *   does NOT retroactively make every Universe field writable — each new writable
     *   field is added deliberately, per field, exactly like every other kind's schema.
     *
     * Used by: op-program evaluator scope (HANDLE_UNIVERSE = 2) for the readonly
     * fields; `FrqtlApp.prototype.setUniverseProperty`/`getUniverseProperty`
     * (the validated JS-side accessor pair — mirrors `updateObjectProperty`'s
     * throw-or-apply discipline) for `wavelengthScale`.
     * NOT a placeable kind — not in PLACEABLE_KINDS.
     */
    var UniverseDescriptor = {
        kind: 'Universe',
        description: 'The top-level simulation universe. Most properties are read-only state accessible ' +
            'from op-programs via HANDLE_UNIVERSE (2) in the expression scope; a small number of ' +
            'universe-wide physics constants (currently: wavelengthScale) are writable through the ' +
            'validated setUniverseProperty accessor. THROW-OR-APPLY: any write to an unknown or readonly ' +
            'field FAIL-LOUDs with TypeError — there is no bind-local property list anywhere in the stack.',
        fields: [
            {
                name: 'tick',
                type: 'readonly',
                engineVisible: true,
                description: 'Current tick count (u64). Increments once per doTick() call. ' +
                    'Available in op-program scope via Ref(HANDLE_UNIVERSE, "tick"). ' +
                    'Write THROWS — tick is engine-owned and monotonically increasing.'
            },
            {
                name: 'activeQuanta',
                type: 'readonly',
                engineVisible: true,
                description: 'Number of currently alive leaf quanta (usize). ' +
                    'Derived by counting is_alive=true frames in the fundamental dimension. ' +
                    'Available in op-program scope via Ref(HANDLE_UNIVERSE, "activeQuanta"). ' +
                    'Write THROWS — this is a derived aggregate, not a writable property.'
            },
            {
                name: 'wavelengthScale',
                type: 'number',
                constraint: { min: 1, integer: true },
                widgetHint: 'slider',
                widgetConfig: { max: 32, step: 1 },
                // engineVisible:true — this IS an engine-visible universe-wide physics
                // constant (WASM-live: EGPTUniverse.prototype.wavelengthScale's setter
                // calls `this._wasm.set_wavelength_scale(value)`, wasm-engine.js:268-274).
                // Unlike a Frame/LargeObject field, there is no separate engine-ABI branch
                // to add here — the JS-side property setter already dispatches to the WASM
                // ABI, so `setUniverseProperty` validates then does `universe[prop] = value`
                // (safe ONLY because the schema check ran first — never a bare, unvalidated
                // universe[prop]=v anywhere else in the stack).
                engineVisible: true,
                description: 'Layer 1 — universe-wide oscillation-wavelength scale: ' +
                    '`wavelength = floor((capacity/mass) * wavelengthScale)`, minimum 4 ' +
                    '(Core Axioms §6B). Every Frame in the universe shares this one multiplier. ' +
                    'Layer 2 — physics behavior: this is Wave Interference\'s and Double-Slit\'s ' +
                    'primary knob — raising it stretches every Frame\'s transverse oscillation ' +
                    'period, widening fringe/interference spacing without changing any Frame\'s ' +
                    'mass or capacity (see docs/internal/records/physics-lab/2026-06-16-wave-interference-wavelengthScale.md, ' +
                    'docs/internal/physics-lab/double-slit-wavelength.md for the observed sweep figures).'
            }
        ]
    };

    /**
     * Dimension — read-only property table for a scale layer in the simulation.
     *
     * Gate-2 architect binding (§10.8 B4, 2026-06-21):
     *   Same home/pattern as FrameDescriptor and UniverseDescriptor.
     *   layer = readonly (engine-managed).
     *   THROW-OR-APPLY FAIL-LOUD on writes.
     *
     * Used by: op-program evaluator (not yet in scope; defined here as the descriptor
     * home so conformance can iterate it and validate getObjectProperty / setObjectProperty).
     * NOT a placeable kind — not in PLACEABLE_KINDS.
     */
    var DimensionDescriptor = {
        kind: 'Dimension',
        description: 'A scale layer in the simulation (a "dimension" in FRQTL terminology). ' +
            'Each dimension is a spatial index (QuadTree) that organises frames at one scale. ' +
            'Properties are readonly — the engine manages dimensional structure. ' +
            'THROW-OR-APPLY: any write attempt FAIL-LOUDs with TypeError.',
        fields: [
            {
                name: 'layer',
                type: 'readonly',
                engineVisible: true,
                description: 'Dimension layer index (u32). Assigned at creation (add_dimension / addDimension). ' +
                    '0 = fundamental (leaf-quanta layer). Higher values = higher scales. ' +
                    'Engine-owned — write THROWS (topology is engine-derived).'
            },
            {
                name: 'frame_count',
                type: 'readonly',
                engineVisible: true,
                description: 'Number of frames currently in this dimension (usize). ' +
                    'Changes each tick as frames are added, promoted, or GC\'d. ' +
                    'Derived from the dimension\'s frame list length — not user-writable.'
            }
        ]
    };

    /**
     * backdrop — A draw-only LargeObject (collision_type=NONE, actions=[]).
     * Created via FrqtlApp.addBackdrop(). All fields are render-only.
     * Phase 3 declares backdrop as a formal kind so Phase 4a can route edits uniformly
     * instead of relying on the ad-hoc backdrop=true flag set inline.
     */

    // ── Export ─────────────────────────────────────────────────────────────────
    // Node: consumed by schema/index.js's require. Browser: published as a global
    // the SAME way valueNormalizer.js publishes window.ObjectValueNormalizer, and
    // read by index.js under the same FAIL-LOUD guard.

    var EngineScopeDescriptors = {
        FrameDescriptor: FrameDescriptor,
        UniverseDescriptor: UniverseDescriptor,
        DimensionDescriptor: DimensionDescriptor
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EngineScopeDescriptors;
    } else if (typeof window !== 'undefined') {
        window.EngineScopeDescriptors = EngineScopeDescriptors;
    }

})();
