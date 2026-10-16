/* Copyright 2023-2026 by Essam Abadir */

/**
 * DetectorWall — the provenance-splitting detector screen.
 *
 * ── A DetectorWall IS … (the datasheet line) ────────────────────────────────
 *
 * A DetectorWall is a **`Wall{detect}` + a `Tagger` read**: the Wall supplies the
 * compiled op-program (`[COUNT, ABSORB]` + `collect_collided:true`, canonical bench
 * LO7 MARK+COUNT) that counts and removes each arriving frame and buffers a FrameData
 * copy of it; the Tagger supplies the read of the provenance string an UPSTREAM tagger
 * (SlitScreen's slit LOs, whose `CollisionActions.MARK` is itself a Tagger write) put
 * on that frame. Everything this file adds on top is bookkeeping: partition the hits
 * by that tag, and keep two accumulators (the Y-marginal and the Y×Z grid) whose
 * grid-add / marginal-derive helpers are the Wall atom's own statics.
 *
 * It owns NO op-program, NO string_map path and NO grid algebra of its own. Composed
 * from — never wrapping — `Wall` (`./Wall.js`) and `Tagger` (`./tagger.js`).
 *
 * ── Layer 1: API contract ───────────────────────────────────────────────────
 *
 *   - The inner Wall registers with `collect_collided:true` so the engine accumulates a
 *     point-in-time FrameData copy for every frame that collided this tick, AFTER the
 *     op-program (the upstream MARK wrote the slit name) and BEFORE Step-7 cleanup
 *     (ABSORB removes the frame).
 *   - `getCollisionHistogram(tickData)` reads this LO's collided frames from the
 *     marshalled tick output (`tickData.objects[handle].frames`) each tick and
 *     accumulates a running Map<y, count>, split by slit provenance read through
 *     `Tagger.readTag(fd)` (the canonical `detector_name` key — this file never names
 *     `data.string_map`).
 *
 * ── Layer 2: physics behavior ───────────────────────────────────────────────
 *
 * ZERO physics (SU1) beyond the Wall's own compiled program. Counting, tagging and
 * reading move nothing: the canonical bench holds 28/28 across this composition.
 *
 * Engine-agnostic: the readout is identical on every engine (no capability gap).
 */

(function () {

    // ── Imports (Node.js) or globals (browser) ──────────────────────────

    var LargeObject, CollisionTypes, CollisionActions, Wall, Tagger;

    if (typeof module !== 'undefined' && module.exports) {
        LargeObject = require('./LargeObject').LargeObject;
        CollisionTypes = require('../constants/CollisionTypes').CollisionTypes;
        CollisionActions = require('../constants/CollisionActions').CollisionActions;
        Wall = require('./Wall').Wall;
        // Tagger — the MARK part. The detector's provenance READ is this part; the
        // matching WRITE is the upstream slit LO's MARK action (the same part).
        Tagger = require('./tagger.js');
    } else {
        LargeObject = window.LargeObject;
        CollisionTypes = window.CollisionTypes;
        CollisionActions = window.CollisionActions;
        Wall = window.Wall;
        Tagger = window.Tagger;
    }

    // ── DetectorWall ─────────────────────────────────────────────────────

    /**
     * Detector/absorber wall that counts arriving particles and removes them.
     *
     * Wraps a single {@link LargeObject} configured with `[COUNT, ABSORB]` actions
     * and collision type `NONE`. The `ABSORB` action removes the particle so it
     * does not pile up. The `COUNT` action increments the LO's internal counter.
     *
     * G1: the LO is registered with `collect_collided: true`. Each call to
     * `getCollisionHistogram(tickData)` reads this LO's collided frames from the
     * marshalled tick output (`tickData.objects[handle].frames`) and accumulates the
     * running histogram (no per-LO collision query — the engine stays generic).
     * Slit provenance is read through the `Tagger` part (`Tagger.readTag(fd)`) — the
     * matching write is SlitScreen's slit LOs' MARK op-program (the same part), captured
     * in the collided FrameData AFTER the op-program runs, before ABSORB kills the frame.
     *
     * ## Physics you can drive
     *
     * **`wallX`** — the x position of the detector. In `setupDoubleSlit` this is set
     * to `slitScreen.left + slitScreen.width + 3 * wavelength`. Moving it closer to
     * the slit screen (smaller `L`) compresses the fringe pattern vertically; moving
     * it further (larger `L`) expands the fringe spacing. This is the `L` in the
     * classical fringe-spacing formula `Δy = λL/d`.
     *
     * **Histogram readout** — call `detectorWall.getCollisionHistogram()` each tick
     * to accumulate hits. Returns `{ combined: Map<y,count>, slit1: Map<y,count>,
     * slit2: Map<y,count>, total: number }`. The accumulated `combined` map forms the
     * detector interference pattern.
     *
     * **`wallWidth`** (default 20 px) — wider wall = more forgiving capture zone;
     * narrower = sparser but more positionally precise hit data. Width does not affect
     * fringe position, only total hit rate.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM).
     * @param {Object} canvasRect - The world rect `{left,top,w,h}` (or the rect tuple),
     *   read through `ObjectSchema.worldRect` — a missing or non-positive dimension THROWS.
     *   Used to derive default wall height and x position.
     * @param {number} [wallX] - X position of the detector wall (physics px).
     *   Defaults to `canvasRect.w - 20` (near the right edge).
     * @param {number} [wallY=0] - Y position (physics px).
     * @param {string} [wallCollisionType] - RETIRED positional slot. The counting
     *   atom's collision mechanics are the compiled `destroy`+`count` op-program;
     *   there is no collision_type override. Passing anything other than `NONE`
     *   THROWS (FAIL-LOUD — never a silently ignored argument).
     * @param {Array} [wallColor=[120,120,120]] - RGB color for rendering.
     * @param {number} [wallHeight] - Wall height (physics px); defaults to
     *   `canvasRect.h`.
     * @param {number} [wallWidth=20] - Wall thickness (physics px).
     * @param {string} [wallName='detector_wall'] - Identifier used to key the
     *   collision histogram in the universe.
     * @param {Object} [opts] - WS-DSE-3D Bite B1.
     * @param {number} [opts.depth] - When provided, the detector LO is built as a
     *   6-element `[left,top,z,w,h,d]` rect spanning the FULL z-extent
     *   `[-depth/2, +depth/2]` (Tube.js precedent) — without it, z-spread quanta
     *   (WS-DSE-3D Bite B0's emitter z-spread) fly past a paper-thin (z=0,d=w)
     *   detector. OMITTED (default) → legacy 4-element rect, byte-identical.
     */
    // ObjectSchema (the world-rect normalizer's one public surface), resolved at CALL time:
    // schema/index.js loads after this file in the game-layer roster.
    function _schema() {
        var s = (typeof module !== 'undefined' && module.exports)
            ? require('../schema/index.js').ObjectSchema
            : window.ObjectSchema;
        if (!s || typeof s.worldRect !== 'function') {
            throw new Error('[DetectorWall] ObjectSchema.worldRect is not loaded — load ' +
                'objects/schema/valueNormalizer.js + objects/schema/index.js (stack-boot.js roster).');
        }
        return s;
    }

    function DetectorWall(universe, canvasRect, wallX, wallY, wallCollisionType, wallColor, wallHeight, wallWidth, wallName, opts) {
        opts = opts || {};
        var depth = (opts.depth !== undefined && opts.depth !== null) ? opts.depth : null;

        this.universe = universe;
        this._schemaKind = 'DetectorWall';

        // The world rect, through the ONE normalizer (a zero-high detector counts nothing
        // and would report it as physics — so a missing dimension throws, never zeroes).
        var world = _schema().worldRect(canvasRect, 'DetectorWall canvasRect');
        var cw = world.w, ch = world.h;

        // Defaults
        wallX = (wallX !== null && wallX !== undefined) ? wallX : (cw - 20);
        wallY = (wallY !== null && wallY !== undefined) ? wallY : 0;
        // The collision_type override died with the legacy wall lexicon: the counting
        // atom's mechanics ARE its op-program. A caller still naming a non-NONE type
        // is asking for something that no longer exists — say so.
        if (wallCollisionType !== null && wallCollisionType !== undefined &&
            wallCollisionType !== CollisionTypes.NONE) {
            throw new Error('[DetectorWall] the wallCollisionType override is retired ("' +
                wallCollisionType + '") — the counting atom is Wall{collisionBehavior:' +
                '\'destroy\', hooks:[\'count\']} and its mechanics are the compiled ' +
                'op-program. Pass NONE (or omit the argument).');
        }
        wallColor = wallColor || [120, 120, 120];
        wallHeight = (wallHeight !== null && wallHeight !== undefined) ? wallHeight : ch;
        wallWidth = (wallWidth !== null && wallWidth !== undefined) ? wallWidth : 20;
        wallName = wallName || ('detector_wall' + Math.floor(Math.random() * 1000000));

        this.wallX = wallX;
        this._wallHeight = wallHeight;
        this.depth = depth;

        // G1: register with collect_collided:true so the engine populates the
        // per-tick collided-frame buffer.  The buffer is read by getCollisionHistogram()
        // between ticks to accumulate the running histogram.
        //
        // NOTE: collect_collided is passed in the spec object that LargeObject forwards
        // to universe.registerLargeObject().  It is a spec field (not a post-registration
        // setter), so it is set atomically at registration time and never changes.
        // WS-DSE-3D Bite B1: 6-element full-z-depth rect when opts.depth is set
        // (Tube.js precedent); legacy 4-element rect otherwise (byte-identical).
        var wallRect = (depth !== null)
            ? [wallX, wallY, -depth / 2, wallWidth, wallHeight, depth]
            : [wallX, wallY, wallWidth, wallHeight];
        // The detector's inner engine object IS the counting atom —
        // `Wall{collisionBehavior:'destroy', hooks:['count']}` (= preset
        // 'detector-screen'): kill the arrival, increment the wall's counter, buffer
        // the collided FrameData. MEASURED equal to the legacy `detect` construction on
        // the canonical WASM engine (same alive-trace tick-by-tick, same total); the two
        // compiled programs carry the SAME two ops in the opposite order, and they
        // commute (count reads only self.count, the kill writes only frame.is_alive).
        // The rich histogram (grid + slit provenance + the #61 guard) stays OWNED here —
        // this wrapper delegates only the plain-wall LO construction, not the counting.
        this.name = wallName;   // the declared name is the detector's own construction fact
        this._innerWall = new Wall(universe, {
            rect: wallRect,
            collisionBehavior: 'destroy',
            hooks: ['count'],
            name: wallName,
            color: wallColor
        });
        this.detector_wall = this._innerWall.lo;
        // THE ONE UP-LINK: the detector composed this Wall (which stamps its own LO).
        this._innerWall._owner = this;
        // WS-DSE-3D fix-loop item 1 (render): the Tube.js precedent — a 6-element
        // rect gives the ENGINE a real z-slab, but _buildLoMesh (three-provider.js)
        // only builds a 3D BoxGeometry when the LO ALSO carries the render-only
        // `shape='box'` + `depth` hint (see SlitScreen.js for the identical fix).
        if (this.detector_wall.rect.d !== undefined) {
            this.detector_wall.shape = 'box';
            this.detector_wall.depth = this.detector_wall.rect.d;
        }

        // ── Accumulated histogram state (G1) ─────────────────────────────
        // Running Maps: y → hit count. Accumulated across ticks (double-slit pattern
        // is cumulative — many ticks of hits build the interference fringes). This is
        // the Y-MARGINAL — unchanged code path, byte-identical to pre-B1 (the CLI,
        // charts, and the committed golden all read exactly these fields).
        this._combined = new Map(); // all slits combined
        this._slit1    = new Map(); // hits tagged 'slit1' by SlitScreen MARK op-program
        this._slit2    = new Map(); // hits tagged 'slit2' by SlitScreen MARK op-program
        this._total    = 0;
        this._slit1Total = 0;
        this._slit2Total = 0;

        // ── Y×Z grid (WS-DSE-3D Bite B1, ratified §4.2) ───────────────────
        // Additive capture alongside the (untouched) Y-marginal above: Map<y, Map<z,count>>.
        // In 2D (depth omitted), z is always 0 (fd.z defaults to 0 — see the loop below),
        // so every grid entry has a single z=0 bucket and `DetectorWall.deriveMarginalY(grid)`
        // reproduces `this._combined` exactly — the Y-marginal IS the derived marginal of
        // this grid (verified by a unit test), even though the accumulator above is not
        // rewritten to compute it lazily (kept untouched to protect the golden).
        this._grid      = new Map(); // all slits combined
        this._gridSlit1 = new Map();
        this._gridSlit2 = new Map();

        // #61 throw-guard (fraqtl#61, architect-ruled shape: THROW, never silent dedup) —
        // the last TickData object consumed by getCollisionHistogram(). Applies in 2D too.
        this._lastTickData = undefined;
    }

    /**
     * Add one hit at (y,z) to a Y×Z grid (Map<y, Map<z,count>>). Delegates to the ONE
     * grid-accumulation authority on the wall ATOM (`Wall.gridAdd`) — a DetectorWall
     * is a Wall wrapper, so it consumes the atom's helper rather than keeping a
     * second copy that could drift.
     */
    function _gridAdd(grid, y, z) {
        Wall.gridAdd(grid, y, z);
    }

    /**
     * Derive the Y-marginal (Map<y,count>) from a Y×Z grid (Map<y, Map<z,count>>) —
     * sums every z-bucket for each y. Pure/static; exists so a caller can PROVE the
     * grid and the legacy marginal agree (ratified §4.2 "Y-marginal DERIVED").
     * Thin re-export of the atom's `Wall.deriveMarginalY` (one authority; the
     * DetectorWall name stays as the published API its callers already use).
     * @param {Map<number, Map<number,number>>} grid
     * @returns {Map<number,number>}
     */
    DetectorWall.deriveMarginalY = function (grid) {
        return Wall.deriveMarginalY(grid);
    };

    /**
     * Get the X position of the detector wall.
     */
    Object.defineProperty(DetectorWall.prototype, 'x', {
        get: function () { return this.wallX; },
        set: function (val) { this.wallX = val; }
    });

    /**
     * Accumulate this tick's collided frames into the running histogram and return it.
     *
     * G1 implementation: reads this LO's collided frames from the marshalled tick output
     * (`tickData.objects[handle].frames`) — the engine snapshots them AFTER each op-program
     * pass and BEFORE Step-7 cleanup, then marshals them out in Phase D (no per-LO query).
     * Because the engine copies FrameData after the MARK/DETECT op-program has run, the
     * frame already carries the slit provenance tag (e.g. 'slit1' or 'slit2') written by
     * SlitScreen's slit LOs — read back here with `Tagger.readTag(fd)`.
     *
     * Bins by the frame's Y position (floor of `rect.y` / `fd.y`), matching the
     * physical pixel row at which the frame hit the detector.
     *
     * The returned object holds RUNNING totals across all calls — each call adds
     * the current tick's hits to the accumulators.
     *
     * #61 throw-guard (fraqtl#61, architect-ruled): THROWS if called twice in a row
     * with the SAME `tickData` object reference — each tick's data must be consumed
     * exactly once, or collisions double-count silently. A correct caller (the CLI,
     * FrqtlApp's onTick, the bench) calls this once per `universe.doTick()`
     * result, so a fresh object reference every call means this never fires for them.
     * Applies identically in 2D and 3D.
     *
     * @returns {{
     *   combined: Map<number,number>,
     *   slit1: Map<number,number>,
     *   slit2: Map<number,number>,
     *   total: number,
     *   slit1Total: number,
     *   slit2Total: number,
     *   grid: Map<number, Map<number,number>>,
     *   gridSlit1: Map<number, Map<number,number>>,
     *   gridSlit2: Map<number, Map<number,number>>
     * }}
     */
    DetectorWall.prototype.getCollisionHistogram = function (tickData) {
        // #61 throw-guard — top of function, before any read (architect-ruled: THROW,
        // never silent dedup). Reference equality only; two DIFFERENT tickData objects
        // (even with identical content, e.g. the TICKS=0 `{objects:{}}` literal) never
        // trip it — only the exact same object consumed twice in a row does.
        if (tickData != null && tickData === this._lastTickData) {
            throw new Error(
                '[DetectorWall] getCollisionHistogram() called twice with the SAME TickData ' +
                'object — each tick must be consumed exactly once (fraqtl#61 double-count guard). ' +
                'Call universe.doTick() again before re-consuming.'
            );
        }
        this._lastTickData = tickData;

        var handle = this.detector_wall.handle;

        // Read THIS LO's collected frames from the MARSHALLED tick output — the engine emits them as
        // TickData.objects[handle].frames (it answers no per-LO collision QUERY; the universe stays
        // focused on generic physics). IDENTICAL on both engines — no capability gap, no FAIL-LOUD
        // guard. Each frame carries its provenance TAG, written in-tick by the SlitScreen slit LOs'
        // compiled MARK op-program and read below through the Tagger part. This is a pure reader.
        var frames = (tickData && tickData.objects && tickData.objects[handle] &&
                      Array.isArray(tickData.objects[handle].frames))
            ? tickData.objects[handle].frames : [];

        for (var i = 0; i < frames.length; i++) {
            var fd = frames[i];

            // Y bin: the frame's top-left Y. fd.rect.top (canonical wrap) or fd.y (flat snapshot).
            var y;
            if (fd.rect && fd.rect.top != null) {
                y = Math.floor(fd.rect.top);
            } else if (fd.y != null) {
                y = Math.floor(fd.y);
            } else {
                y = 0;
            }

            // Z bin (WS-DSE-3D Bite B1): stays 0 in every 2D run (fd.z defaults to 0 when
            // the engine never wrote it), so the grid degenerates to one z-bucket per y.
            var z = (fd.z != null) ? Math.floor(fd.z) : 0;

            // Slit provenance — the TAGGER READ (the other half of the upstream slit LO's
            // MARK write, which is the same part). This file names no bubble path and no
            // key string: `Tagger.readTag(fd)` defaults to the canonical provenance key.
            // Untagged frames read back as null (they go only into `combined`).
            var slitName = Tagger.readTag(fd) || null;

            // Y-marginal accumulation — UNTOUCHED from pre-B1 (protects the golden).
            this._combined.set(y, (this._combined.get(y) || 0) + 1);
            this._total++;

            if (slitName === 'slit2') {
                this._slit2.set(y, (this._slit2.get(y) || 0) + 1);
                this._slit2Total++;
            } else if (slitName === 'slit1') {
                this._slit1.set(y, (this._slit1.get(y) || 0) + 1);
                this._slit1Total++;
            }
            // Hits with no slit mark (slitName === null) go only into combined.

            // Y×Z grid accumulation — additive, same frame data, same iteration.
            _gridAdd(this._grid, y, z);
            if (slitName === 'slit2') {
                _gridAdd(this._gridSlit2, y, z);
            } else if (slitName === 'slit1') {
                _gridAdd(this._gridSlit1, y, z);
            }
        }

        return {
            combined:   this._combined,
            slit1:      this._slit1,
            slit2:      this._slit2,
            total:      this._total,
            slit1Total: this._slit1Total,
            slit2Total: this._slit2Total,
            grid:       this._grid,
            gridSlit1:  this._gridSlit1,
            gridSlit2:  this._gridSlit2
        };
    };

    /**
     * Full teardown of what this detector composed: its inner Wall (and so its LO). Idempotent.
     */
    DetectorWall.prototype.dispose = function () {
        this._innerWall.dispose();
    };

    /**
     * Reset the accumulated histogram (e.g. when experiment parameters change).
     */
    DetectorWall.prototype.resetHistogram = function () {
        this._combined  = new Map();
        this._slit1     = new Map();
        this._slit2     = new Map();
        this._total     = 0;
        this._slit1Total = 0;
        this._slit2Total = 0;
        // Y×Z grid (WS-DSE-3D Bite B1) — reset alongside the Y-marginal it derives from.
        this._grid      = new Map();
        this._gridSlit1 = new Map();
        this._gridSlit2 = new Map();
        // NOTE: _lastTickData (the #61 throw-guard) is deliberately NOT reset here —
        // resetting histogram DATA is orthogonal to the double-consume guard, which
        // exists to catch a caller bug regardless of accumulator state.
    };

    // ── Export ───────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { DetectorWall: DetectorWall };
    } else {
        window.DetectorWall = DetectorWall;
    }

})();
