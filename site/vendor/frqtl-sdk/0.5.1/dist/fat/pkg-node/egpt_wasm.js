/* @ts-self-types="./egpt_wasm.d.ts" */

/**
 * WASM-exposed universe handle.
 */
class WasmUniverse {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmUniverseFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmuniverse_free(ptr, 0);
    }
    /**
     * Number of alive leaf quanta.
     * @returns {number}
     */
    active_quanta() {
        const ret = wasm.wasmuniverse_active_quanta(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Add a new dimension at the given scale layer.
     * @param {number} layer
     */
    add_dimension(layer) {
        wasm.wasmuniverse_add_dimension(this.__wbg_ptr, layer);
    }
    /**
     * Add a frame to a dimension's frame list (mirrors JS Dimension.addFrame).
     *
     * Returns true if added; false if size mismatch or dimension not found.
     * @param {number} layer
     * @param {number} frame_handle
     * @returns {boolean}
     */
    add_frame_to_dimension(layer, frame_handle) {
        const ret = wasm.wasmuniverse_add_frame_to_dimension(this.__wbg_ptr, layer, frame_handle);
        return ret !== 0;
    }
    /**
     * The LIVE brownian-motion mode of the running universe.
     *
     * The engine — not the host — RESOLVES this: `EGPTUniverse::new` coerces
     * `FrameGenMode::TopDown ⇒ true` (density clustering IS the brownian regime) and
     * otherwise takes `config.brownian_motion.unwrap_or(false)` (universe.rs, the
     * FrameGenMode match). The host ferries the caller's un-coerced REQUEST in the
     * config bag and reads the resolved answer back through here, so the coercion rule
     * lives in exactly ONE language. A JS-side copy of that match is a schema mirror and
     * drifts — it already produced a read-back that disagreed with the running walk.
     *
     * Also tracks `set_brownian_motion` (the post-init live flip), so this is engine
     * state at all times, never a snapshot of the construction argument.
     * @returns {boolean}
     */
    brownian_motion() {
        const ret = wasm.wasmuniverse_brownian_motion(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Create a non-leaf parent frame at scale layer from a corner rect + children.
     *
     * Mirrors JS Dimension.createFrameFromRect(rect, childFrames, vx, vy,
     *   addToDimension=true, isStationary=false).
     *
     * rect: [left, top, w, h]
     * children: flat array of frame handle IDs
     * add_to_dimension: true = push to dim.frame_ids (default JS behavior)
     * is_stationary: mirrors the JS is_stationary param
     *
     * Returns frame handle, or usize::MAX on failure (dimension not found /
     * size mismatch).
     * @param {number} layer
     * @param {Float64Array} rect
     * @param {Uint32Array} children
     * @param {number} vx
     * @param {number} vy
     * @param {boolean} add_to_dimension
     * @param {boolean} is_stationary
     * @returns {number}
     */
    create_frame_from_rect(layer, rect, children, vx, vy, add_to_dimension, is_stationary) {
        const ptr0 = passArrayF64ToWasm0(rect, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(children, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmuniverse_create_frame_from_rect(this.__wbg_ptr, layer, ptr0, len0, ptr1, len1, vx, vy, add_to_dimension, is_stationary);
        return ret >>> 0;
    }
    /**
     * Create a new leaf frame and return its ID.
     * @param {number} x
     * @param {number} y
     * @param {number} vx
     * @param {number} vy
     * @param {number} charge
     * @returns {number}
     */
    create_leaf_frame(x, y, vx, vy, charge) {
        const ret = wasm.wasmuniverse_create_leaf_frame(this.__wbg_ptr, x, y, vx, vy, charge);
        return ret >>> 0;
    }
    /**
     * Create a parent frame enclosing two child frames in the given dimension layer.
     *
     * Mirrors JS `Dimension.createParentFrame(childA, childB)`.
     * Returns the new parent FrameId, or usize::MAX if the dimension does not exist
     * or the children are too far apart (span > mb_w/mb_h).
     * @param {number} layer
     * @param {number} child_a
     * @param {number} child_b
     * @returns {number}
     */
    create_parent_frame(layer, child_a, child_b) {
        const ret = wasm.wasmuniverse_create_parent_frame(this.__wbg_ptr, layer, child_a, child_b);
        return ret >>> 0;
    }
    /**
     * Get debug stats from the last tick.
     * @returns {number}
     */
    debug_dim_update_pairs() {
        const ret = wasm.wasmuniverse_debug_dim_update_pairs(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get number of promotions attempted in last tick.
     * @returns {number}
     */
    debug_promotions_attempted() {
        const ret = wasm.wasmuniverse_debug_promotions_attempted(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get number of promotions that succeeded in last tick.
     * @returns {number}
     */
    debug_promotions_succeeded() {
        const ret = wasm.wasmuniverse_debug_promotions_succeeded(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Run one tick. Returns TickData as a JS object.
     *
     * An engine panic inside the tick — the injection path's diagnostics are the live class —
     * reaches the caller as a JS error carrying the panic's own sentence, via the hook
     * installed in `WasmUniverse::new`, instead of a bare `RuntimeError: unreachable`.
     * @returns {any}
     */
    do_tick() {
        const ret = wasm.wasmuniverse_do_tick(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The LIVE frame-generation mode of the running universe, as the wire name
     * (`"TopDown"` | `"GroundUp"`).
     *
     * The engine — not the host — HOLDS this: `EGPTUniverse::new` takes
     * `config.frame_gen_mode` and the whole Phase B / Phase C split hangs off it (the
     * TopDown gate at `universe.rs`, plus the brownian / collisions / bonding coercions).
     * The host ferries the caller's choice in the config bag and reads the running value
     * back through here, so the mode that shapes the run and the mode the host reports are
     * the SAME value in exactly ONE place. A JS-side copy is a cache: it goes stale the
     * moment a re-init changes the mode without the copy being cleared — which is exactly
     * the defect class the brownian mirror produced.
     *
     * SET ONCE at construction: there is deliberately no runtime setter (a mid-run flip
     * would splice two frame-generation regimes into one run), so a new mode means a new
     * `init()`.
     * @returns {string}
     */
    frame_gen_mode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmuniverse_frame_gen_mode(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The LIVE fundamental (lowest / "light") dimension.
     *
     * Under dynamic dimensions the fundamental self-tracks as the lowest currently-allocated
     * dimension (it self-lowers when `add_dimension` allocates a lower layer). Provider code
     * MUST read this live value rather than snapshotting the init seed — a stale snapshot
     * would create default-level leaves at the OLD floor.
     * @returns {number}
     */
    fundamental_dimension() {
        const ret = wasm.wasmuniverse_fundamental_dimension(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Get frame position. Returns [x, y] or empty if invalid.
     * @param {number} id
     * @returns {Float64Array}
     */
    get_frame_position(id) {
        const ret = wasm.wasmuniverse_get_frame_position(this.__wbg_ptr, id);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Get a named Frame property by quantum_id (= FrameData.id from do_tick()).
     *
     * `id` is the external quantum_id, NOT the SoA FrameId (array index). This matches
     * the JS reference convention where `getFrameProperty(id, prop)` takes the same
     * `quantum_id` that appears in FrameData.id from doTick().
     *
     * Returns a JSON string encoding the value, or `null` (JSON) if the frame is
     * not found / dead. Throws a JS error for unknown property names.
     *
     * Mirrors `EGPTUniverse.getFrameProperty(id, prop)` in the JS reference engine.
     *
     * Property name vocabulary: see docs/internal/engine/ENGINE_CONTRACT.md Frame property table.
     * @param {number} id
     * @param {string} prop
     * @returns {string}
     */
    get_frame_property(id, prop) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(prop, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.wasmuniverse_get_frame_property(this.__wbg_ptr, id, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Return the external quantum_id for a frame handle (SoA FrameId).
     *
     * G-EMIT companion: after make_leaf_frame() returns a SoA handle, the host
     * emitter tick-fn uses this to get the quantum_id it needs for set_frame_property()
     * (to stamp data.render.color on the newly-created frame before injecting it).
     *
     * Returns 0 if the handle is out of range (safe sentinel — quantum_ids start at 1).
     * @param {number} frame_handle
     * @returns {number}
     */
    get_frame_quantum_id(frame_handle) {
        const ret = wasm.wasmuniverse_get_frame_quantum_id(this.__wbg_ptr, frame_handle);
        return ret >>> 0;
    }
    /**
     * MANDATORY BACKING — return the SoA FrameId of this LO's backing frame.
     *
     * Under mandatory backing (CEO dry-realign 8d45fcdb), `register_large_object` ALWAYS
     * creates the backing frame, so sugar (e.g. `absorbRadiation.js`) READS the id here
     * instead of creating+attaching its own frame or shadow-tracking the id (either would be
     * new drift). Companion: `get_frame_quantum_id(fid)` converts to the external quantum_id
     * the frame accessors key on. Returns -1 for an out-of-range handle (safe sentinel).
     *
     * Return type is `i32` (NOT i64/isize): a backing frame_id is a small SoA store index, and
     * wasm-bindgen maps i32 → a JS Number (i64 → a JS BigInt, which breaks `getFrameQuantumId`
     * arithmetic downstream). Mirrors `get_frame_quantum_id`'s u32→Number shape.
     * @param {number} handle
     * @returns {number}
     */
    get_large_object_frame_id(handle) {
        const ret = wasm.wasmuniverse_get_large_object_frame_id(this.__wbg_ptr, handle);
        return ret;
    }
    /**
     * Inject an already-created frame (by FrameId / frame handle) into the injection buffer.
     *
     * Companion to make_leaf_frame(): the host emitter tick-fn calls make_leaf_frame()
     * to create a frame (with correct wavelength/charge/color), then calls inject_frame()
     * to enqueue it for Phase A consumption (route_injected_frames).
     *
     * frame_handle: the usize returned by make_leaf_frame() (SoA FrameId / array index).
     * @param {number} frame_handle
     */
    inject_frame(frame_handle) {
        wasm.wasmuniverse_inject_frame(this.__wbg_ptr, frame_handle);
    }
    /**
     * Enqueue a one-time batch of property mutations to apply at the top of the
     * next tick (Phase A, before move) — the EXTENSIBLE deferred-write path.
     *
     * FAIL-LOUD (Architect binding 2026-06-21): throws on malformed batch JSON,
     * unknown/forbidden/readonly prop, or invalid value. Does NOT silently drop
     * mutations. This is stricter than inject_frames' break-on-short-chunk.
     *
     * `batch_json` — JSON string, array of { id, prop, value } objects:
     *   id    — quantum_id (= FrameData.id from do_tick(); NOT the SoA FrameId)
     *   prop  — writable Frame property name (§2.3 Frame property table)
     *   value — JSON-encoded value (same ABI as set_frame_property json_value)
     *
     * Mirrors JS EGPTUniverse.injectMutations(batch).
     * @param {string} batch_json
     */
    inject_mutations(batch_json) {
        const ptr0 = passStringToWasm0(batch_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmuniverse_inject_mutations(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Insert a child frame into a parent frame (mirrors JS Frame.insert).
     *
     * Returns true if inserted, false on failure (parent is leaf/dead/full,
     * child out-of-bounds, or child has zero mass).
     * @param {number} parent_handle
     * @param {number} child_handle
     * @returns {boolean}
     */
    insert_into_frame(parent_handle, child_handle) {
        const ret = wasm.wasmuniverse_insert_into_frame(this.__wbg_ptr, parent_handle, child_handle);
        return ret !== 0;
    }
    /**
     * Dimension frame-id snapshot for the physics-invariant oracle.
     *
     * Returns a JSON string encoding an object mapping layer → array of SoA indices:
     *   { "<layer>": [<soa_id>, ...], ... }
     *
     * Oracle use: cross-reference each SoA id against the topology snapshot to verify
     * that every id in a dimension's frame list is alive (no stray handles) and that
     * no id appears twice (no duplicate registration).
     * @returns {string}
     */
    invariant_dimension_frames_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmuniverse_invariant_dimension_frames_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Topology snapshot for the physics-invariant oracle.
     *
     * Returns a JSON string encoding an array of slot descriptors, one per allocated
     * FrameStore slot (including dead slots — the oracle needs to detect stray handles
     * pointing at dead frames). Shape of each entry:
     *   {
     *     "soa": <SoA array index (slot number)>,
     *     "qid": <quantum_id — same value as FrameData.id from do_tick()>,
     *     "alive": <bool>,
     *     "leaf":  <bool>,
     *     "layer": <u32>,
     *     "mass":  <f64>,
     *     "x":     <f64>,
     *     "y":     <f64>,
     *     "parent_soa": <SoA index of parent, or null if none>,
     *     "children_soa": [<SoA indices of children>]
     *   }
     *
     * Oracle use: build a qid→soa map and a soa→qid map, then walk topology entirely
     * in quantum_id space for human-readable violation reports.
     * @returns {string}
     */
    invariant_topology_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmuniverse_invariant_topology_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Kill a frame by ID.
     *
     * Mirrors JS `EGPTUniverse.killFrame(id)` (EGPTfrqtl.js:1595), which sets
     * `is_alive = false` and LEAVES CHILDREN ALIVE — children are orphaned and
     * their parent pointer is nulled by `garbageCollectDeadParents` at end-of-tick.
     * (Distinct from `Frame.kill()` / the LO ABSORB path, which remove children.)
     * @param {number} id
     */
    kill_frame(id) {
        wasm.wasmuniverse_kill_frame(this.__wbg_ptr, id);
    }
    /**
     * THE CAPACITY LAW, PUBLISHED — the cell capacity of a leaf (or a dimension cell) at
     * `level`, straight from its ONE owner, `constants::ActiveAxes::level_capacity`.
     *
     * Host sugar that must SIZE a frame by level — the ABSORB radiator's emissivity law is the
     * live consumer — asks the engine instead of re-deriving `4^level`. `4^level` is the
     * `A={x,y}` answer only: on `A={x}` a level-2 leaf owns 4 cells and on `A={x,y,z}` it owns
     * 64, so a hand mirror hands the sugar a mass the frame has no room for. Capacity is the
     * denominator of BOTH the move gate (`fullness = mass/capacity`) and the wavelength
     * (`λ_eff = capacity/mass · scale`), so getting it wrong mis-scales how often a body steps
     * and how long its wave is, together and in the same direction.
     * @param {number} level
     * @returns {number}
     */
    level_capacity(level) {
        const ret = wasm.wasmuniverse_level_capacity(this.__wbg_ptr, level);
        return ret;
    }
    /**
     * Create a leaf frame mirroring JS Frame.makeLeafFrame.
     *
     * Parameters match the JS signature order:
     *   make_leaf_frame(left, top, level, wavelength, vx, vy, wrap, charge)
     *
     * charge: 0 = Positive, 1 = Negative, -1 = random (one rng draw).
     * Returns the frame handle (usize ID).
     * @param {number} left
     * @param {number} top
     * @param {number} level
     * @param {number} wavelength
     * @param {number} vx
     * @param {number} vy
     * @param {boolean} wrap
     * @param {number} charge
     * @returns {number}
     */
    make_leaf_frame(left, top, level, wavelength, vx, vy, wrap, charge) {
        const ret = wasm.wasmuniverse_make_leaf_frame(this.__wbg_ptr, left, top, level, wavelength, vx, vy, wrap, charge);
        return ret >>> 0;
    }
    /**
     * Create a new universe from a JS config object.
     *
     * Expected config shape:
     * ```js
     * {
     *   fps: 60,
     *   iframe_interval_seconds: 1.0,
     *   with_inter_quantum_collisions: true,
     *   with_bonding: false,
     *   frame_gen_mode: "GroundUp",  // or "TopDown"
     *   min_fill_rate: 0.1,
     *   universe_rect: [0, 0, 600, 600],  // [left, top, width, height]
     *   depth: 600,                       // optional; world z-extent, default = width (a cube)
     *   wavelength_scale: 1.0,
     *   fundamental_dimension: 0,
     *   seed: 42
     * }
     * ```
     *
     * AN UNKNOWN KEY IS UNDETECTABLE AT THIS BOUNDARY, and `#[serde(deny_unknown_fields)]`
     * cannot change that: `serde_wasm_bindgen` deserializes a struct by looking each KNOWN field
     * name up as a property and never enumerates the object's own keys, so an unrecognised or
     * near-miss key (`wavelengthScale` beside `wavelength_scale`) is silently ignored here while
     * a wrong type, a bad enum value and a missing field all still throw. The gate is the JS
     * wrapper's `create()` / `init()` contract tables (`wasm-engine.js`, `_assertNoUnknownKeys`
     * + `_RETIRED_CONFIG_KEYS`), which throw naming the key — and the one-construction-authority
     * rule keeps every caller behind them. Do not add a second key list here.
     * @param {any} config
     */
    constructor(config) {
        const ret = wasm.wasmuniverse_new(config);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmUniverseFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * EXPOSED OBB QUERY PRIMITIVE (community surface — circulation §4).
     *
     * Return the fundamental-dimension alive frames whose CURRENT position lies inside a
     * rotated box, as canonical FrameData JSON (same shape as `query_rect_frames`).
     * CONVENTION-FREE: `theta` is radians in the engine's coordinate frame; `hw/hh/hz` are
     * half-extents (pixels); `cz`/`hz` are the z-slab (2D callers pass a wide `hz`). The
     * FRQTL "tall-mirror" convention (SlabFace) sits ABOVE this primitive on the JS side —
     * a third-party caller passes standard-math geometry and gets the same evaluator.
     *
     * WASM-only surface (circulation §4): no `EGPTfrqtl.js` twin; the conformance oracle is
     * the hand-computed point-in-OBB expectation set (prev_z precedent).
     * @param {number} cx
     * @param {number} cy
     * @param {number} cz
     * @param {number} theta
     * @param {number} hw
     * @param {number} hh
     * @param {number} hz
     * @returns {string}
     */
    query_obb_frames(cx, cy, cz, theta, hw, hh, hz) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmuniverse_query_obb_frames(this.__wbg_ptr, cx, cy, cz, theta, hw, hh, hz);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Query particle count in a rectangular region (post-tick).
     * @param {number} left
     * @param {number} top
     * @param {number} w
     * @param {number} h
     * @returns {number}
     */
    query_rect(left, top, w, h) {
        const ret = wasm.wasmuniverse_query_rect(this.__wbg_ptr, left, top, w, h);
        return ret >>> 0;
    }
    /**
     * Query frames overlapping a rectangular region (post-tick).
     *
     * SLICE 2 — EXTENSIBLE read path. Extends count-only query_rect() with a
     * variant that returns the frame set as canonical FrameData objects.
     *
     * Returns a JSON string: array of FrameData objects (same shape as the
     * `frames` array in do_tick() TickData output). Empty region → "[]".
     *
     * The returned FrameData shape is the CANONICAL shape from tick_data.rs —
     * NOT a parallel DTO. Callers on the JS side pass this through the same
     * _wrapTickData marshalling path used for do_tick() output.
     *
     * Mirrors JS EGPTUniverse.queryRectFrames(left, top, w, h).
     * @param {number} left
     * @param {number} top
     * @param {number} w
     * @param {number} h
     * @returns {string}
     */
    query_rect_frames(left, top, w, h) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.wasmuniverse_query_rect_frames(this.__wbg_ptr, left, top, w, h);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Draw the next value from the deterministic Mulberry32 stream.
     *
     * Generic primitive for host tick-fns (G-EMIT).  Host-side emitter tick-fns call
     * this to draw x/y/angle/charge from the same single deterministic RNG stream
     * that physics uses.  Draw order must match the JS reference emitter tick-fn
     * (EGPTfrqtl.js:1280-1294) so the golden deterministic stream is preserved.
     * @returns {number}
     */
    random() {
        const ret = wasm.wasmuniverse_random(this.__wbg_ptr);
        return ret;
    }
    /**
     * Register a large object and return its handle.
     *
     * Expected spec shape:
     * ```js
     * {
     *   rect: [left, top, width, height],             // legacy 4-element (z=0, d=width)
     *   // OR, for explicit z/depth (FRQTL-MAINT, 2026-07-01):
     *   rect: [left, top, z, width, height, depth],   // 6-element, MIRRORS
     *                                                  // Rectangle::from_top_left(l,t,z,w,h,d)
     *   name: "LEFT_wall",
     *   observed_dimensions: [],      // empty = all dimensions
     *   program: { on: "collision", ops: [...] }, // optional op-program
     *   collect_collided: false,
     *   region: null,                 // or the SlabFace-resolved OBB descriptor
     * }
     * ```
     * There is no `collision_type`, `actions`, `reposition` or `search_padding` key: the
     * eject face, the velocity response and the whole action vocabulary are lowered into
     * `program` by actionCompiler.js before registration.
     *
     * FRQTL-MAINT (2026-07-01): `rect` now accepts an explicit 6-element form
     * `[left, top, z, width, height, depth]` in the SAME argument order as
     * `Rectangle::from_top_left(left, top, near, w, h, d)` — no invented ordering.
     * The legacy 4-element `[left, top, width, height]` form is unchanged and
     * back-compat (z=0.0, depth=width — bit-identical to the pre-fix behavior,
     * so every existing caller/golden is untouched). THROW-OR-APPLY: any other
     * length is a hard error, never a silent truncation/pad.
     * @param {any} spec
     * @returns {number}
     */
    register_large_object(spec) {
        const ret = wasm.wasmuniverse_register_large_object(this.__wbg_ptr, spec);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Total PRNG draws consumed so far.
     * @returns {bigint}
     */
    rng_call_count() {
        const ret = wasm.wasmuniverse_rng_call_count(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Current PRNG state.
     * @returns {number}
     */
    rng_state() {
        const ret = wasm.wasmuniverse_rng_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * Set brownian motion mode at runtime (post-init).
     * @param {boolean} enabled
     */
    set_brownian_motion(enabled) {
        wasm.wasmuniverse_set_brownian_motion(this.__wbg_ptr, enabled);
    }
    /**
     * Set a named Frame property by quantum_id (= FrameData.id from do_tick()).
     *
     * `id` is the external quantum_id, NOT the SoA FrameId (array index). See
     * get_frame_property for the id convention.
     *
     * `json_value`: JSON-encoded value string (e.g. `"42.0"`, `"\"POSITIVE\""`, `"null"`).
     *
     * THROW-OR-APPLY: throws a JS TypeError for forbidden topology props, derived read-only
     * props, unknown props, or invalid values. Never silently no-ops — Frames have no
     * JS-wrapper upstream; the engine owns them.
     *
     * Mirrors `EGPTUniverse.setFrameProperty(id, prop, value)` in the JS reference engine.
     * @param {number} id
     * @param {string} prop
     * @param {string} json_value
     */
    set_frame_property(id, prop, json_value) {
        const ptr0 = passStringToWasm0(prop, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(json_value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmuniverse_set_frame_property(this.__wbg_ptr, id, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Set or replace the op-program on a registered large object (§10.3 L3).
     *
     * Accepts a JSON string encoding an OpProgram (or null / "null" to clear).
     * Called by updateObjectProperty(handle, 'LargeObject', 'program', prog).
     *
     * §10.3 use case: attach eject op-programs to oven walls after registration,
     * so that cavity walls block quanta via set-expressions instead of native WALL eject.
     *
     * Returns Ok on success, Err with a message on parse failure (FAIL-LOUD for bad JSON).
     * @param {number} handle
     * @param {string} program_json
     */
    set_large_object_program_json(handle, program_json) {
        const ptr0 = passStringToWasm0(program_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmuniverse_set_large_object_program_json(this.__wbg_ptr, handle, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * G4b — Generic LargeObject property write. The ONE typed-setter replacement
     * (collapses set_large_object_active / _observed_dimensions / update_large_object_rect /
     * _count into one accessor), mirroring set_frame_property's (handle, prop, json) shape.
     * THROW-OR-APPLY: unknown / non-engine-writable props throw. Engine-writable LO props:
     *   count (int), layer (int|null → observed_dimensions), rect ([l,t,w,h]), active (bool).
     * (program is attached via set_large_object_program_json — a typed AST payload, not a scalar.)
     * @param {number} handle
     * @param {string} prop
     * @param {string} json_value
     */
    set_large_object_property(handle, prop, json_value) {
        const ptr0 = passStringToWasm0(prop, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(json_value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmuniverse_set_large_object_property(this.__wbg_ptr, handle, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Set no_escape mode at runtime (post-init).
     * When true, children inserted into a parent frame are hard-trapped
     * inside the parent rect (boundary = parent rect, wrap = true).
     * Required for stable composite frames (Atomic Model).
     * Mirrors JS EGPTUniverse.noEscape setter.
     * @param {boolean} enabled
     */
    set_no_escape(enabled) {
        wasm.wasmuniverse_set_no_escape(this.__wbg_ptr, enabled);
    }
    /**
     * G4b — Generic Universe property write. The Universe is READ-ONLY (UniverseDescriptor:
     * tick/activeQuanta are engine-derived), so every write FAIL-LOUDs — the ABI mirror of the
     * op-program handle-2 read-only panic. Provides the generic accessor the spec mandates per kind.
     * @param {string} prop
     * @param {string} _json_value
     */
    set_universe_property(prop, _json_value) {
        const ptr0 = passStringToWasm0(prop, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(_json_value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmuniverse_set_universe_property(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * [GLOBAL] Set the universe wavelength SCALE (runtime slider change) — the one
     * universe-wide multiplier on every frame's (capacity/mass) wavelength ratio.
     * @param {number} value
     */
    set_wavelength_scale(value) {
        wasm.wasmuniverse_set_wavelength_scale(this.__wbg_ptr, value);
    }
    /**
     * Set inter-quantum collisions mode at runtime (post-init).
     * @param {boolean} enabled
     */
    set_with_inter_quantum_collisions(enabled) {
        wasm.wasmuniverse_set_with_inter_quantum_collisions(this.__wbg_ptr, enabled);
    }
    /**
     * Current tick count.
     * @returns {bigint}
     */
    tick() {
        const ret = wasm.wasmuniverse_tick(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * Unregister a large object by handle (SLICE 3, B1).
     *
     * Gate-2 architect binding (§10.8 B1, 2026-06-21):
     *   B1.1 — FAIL-LOUD on unknown handle: throws JS TypeError.
     *   B1.2 — Reuses the ONE integer handle table (Vec index). Slot is tombstoned;
     *          handle is never reused.
     *   B1.3 — Must be called between ticks, not inside a tick callback.
     *
     * After unregistering, the LO stops acting next tick (active=false).
     * The TickData.objects[] section still emits an entry for this handle
     * (count=0) so handle-index ordering remains stable.
     *
     * Mirrors JS EGPTUniverse.prototype.unregisterLargeObject(handle).
     * @param {number} handle
     */
    unregister_large_object(handle) {
        const ret = wasm.wasmuniverse_unregister_large_object(this.__wbg_ptr, handle);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * The LIVE wavelength SCALE of the running universe.
     *
     * The engine — not the host — HOLDS this: `EGPTUniverse::new` takes
     * `config.wavelength_scale` and every leaf's wavelength is recomputed from it on
     * the tick it is read (`compute_wavelength`: `λ_eff = floor(capacity/mass ·
     * wavelength_scale)`, min 4). The host ferries the caller's value in the config bag
     * and reads the running value back through here, so the number that shapes the walk
     * and the number the host reports are the SAME number in exactly ONE place. A JS-side
     * copy is a cache: it goes stale the moment anything writes the scale without going
     * through the JS property — including a write straight at this handle.
     *
     * Also tracks `set_wavelength_scale` (the live slider flip), so this is engine state
     * at all times, never a snapshot of the construction argument.
     * @returns {number}
     */
    wavelength_scale() {
        const ret = wasm.wasmuniverse_wavelength_scale(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmUniverse.prototype[Symbol.dispose] = WasmUniverse.prototype.free;
exports.WasmUniverse = WasmUniverse;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_ef53bc310eb298a0: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_6b506e6536831eaa: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_38130e98eecd467d: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_1a45e2c38d4d41b9: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_0accd80f45e5faa2: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_70a403a56e771704: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_6ffd6468a9bc44b9: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_754e9f305ff6029e: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_56732c2bc353f41d: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_c236cabd84a4d769: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_67b456be8673d3d7: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_1068e624fa87f6ab: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_2c56564c75129511: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_9bb1761122181af2: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_rethrow_c4d99b4b53265290: function(arg0) {
            throw arg0;
        },
        __wbg___wbindgen_string_get_72bdf95d3ae505b1: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_8a89609d89f6608a: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_done_60cf307fcc680536: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_04b37a02507f1713: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_get_1f8f054ddbaa7db2: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_2b48c7d0d006a781: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_33f6e5c9e2f2d6b2: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_8f49811467741499: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_9fc06d9a951bcee6: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_86f30649f63ef9c2: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_67c2c9c4313f4448: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_66acec27e09e99a7: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_8732428d309e270e: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_4a591ecaa01354d9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_66f1a4b2e9026940: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_50bb5ebeecef71a8: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_578aeef4b6b94378: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_622fc80556be2e26: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_ce1ab61c1c2b300d: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_d90091b82fdf5b91: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_next_9e03acdf51c4960d: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_eb8ca7351fa27906: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_prototypesetcall_3249fc62a0fafa30: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_set_52b1e1eb5bed906a: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_dca99999bba88a9a: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_value_f3625092ee4b37f4: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./egpt_wasm_bg.js": import0,
    };
}

const WasmUniverseFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmuniverse_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/egpt_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasmInstance = new WebAssembly.Instance(wasmModule, __wbg_get_imports());
let wasm = wasmInstance.exports;
wasm.__wbindgen_start();
