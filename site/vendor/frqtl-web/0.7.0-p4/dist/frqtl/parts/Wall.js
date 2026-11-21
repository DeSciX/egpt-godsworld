/* Copyright 2023-2026 by Essam Abadir */

/**
 * Wall — the first-class, palette-exposed WALL primitive
 * (W1). It stands to the wall family
 * exactly as `SphereEmitter` stands to the emitter family: a THIN, named, UX-
 * declaring FACADE over the ONE engine-facing primitive that already exists — a
 * single `LargeObject` whose collision behavior is the Collision LEXICON v2
 * (`collisionBehavior`: nothing | block | bounce | absorb | destroy, plus
 * `bounceDirection` and the composable `mark`/`count`/`recolor` hooks), compiled to
 * op-programs by the SAME `actionCompiler` every other wall rides.
 *
 *     var barrier = new Wall(universe, { rect: [200, 0, 8, 120], collisionBehavior: 'block' });
 *     barrier.setV2Prop('collisionBehavior', 'bounce');   // recompile the running program live
 *     var screen  = new Wall(universe, { rect: [400, 0, 20, 400], preset: 'detector-screen' });
 *     screen.getCollisionHistogram(tickData);   // y -> count on the counting screen
 *
 * ── PURE FACADE — zero engine, zero new physics (canonical-bench SU1) ─────────
 * A `Wall` adds NO collision logic of its own. The lexicon lives once in
 * `constants/WallBehaviors.js` (ferried from the frozen `CollisionActions`/
 * `CollisionTypes` sets), `resolveWallSpec` → `compileWallV2` is the ONE compiler
 * authority, and the engine interprets the resulting op-program. The engine has NO
 * "wall" concept and needs none — "a new behavior is new op-program DATA, never new
 * engine code." If building a `Wall` ever seems to need engine or provider code,
 * STOP: it is a `LargeObject` + `actionCompiler`.
 *
 * ── The wall family builds ON this atom ──────────────────────────────────────
 * `DetectorWall` (the counting atom `Wall{'destroy', hooks:['count']}`),
 * and `SlitScreen`'s wall segments (`Wall{'block'|'destroy'}`) are composed from
 * this facade. The specialized parts that are NOT plain walls (SlitScreen's
 * MARK/RANDOM_XY slits + liners) stay as-is.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `new Wall(universe, opts)` — builds + engine-registers ONE `LargeObject` (it
 *   does NOT add itself to any runner render list; the caller — the ObjectFactory
 *   builder or a setup factory — needs NO render-wiring call: constructing the inner
 *   LargeObject registers it with the world for physics AND render, exactly
 *   as it would for a bare `LargeObject`).
 *   @param {Object} universe — an EGPTUniverse (JS or WASM compat shim).
 *   @param {Object} opts
 *   @param {Array|Object} [opts.rect] — bounding rect [left,top,w,h] or the
 *     explicit-z/depth [left,top,z,w,h,d] / {left,top,w,h[,z,d]} (passed verbatim
 *     to `LargeObject`, WASM 3D convention). If omitted, built from
 *     opts.left/top/w/h (+ optional z/d).
 *   @param {string} opts.collisionBehavior — REQUIRED (or supply a `preset`):
 *     nothing | block | bounce | absorb | destroy. The ONE owner is `WallBehaviors`.
 *     FAIL-LOUD on an unknown value.
 *   @param {string} [opts.bounceDirection='reflect'] — reflect | random (behavior=bounce).
 *   @param {string[]} [opts.hooks] — composable: mark | count | recolor.
 *   @param {string} [opts.preset] — mirror | brick | detector-screen |
 *     transparent-probe | wall. Construction sugar expanding to the fields above.
 *   @param {string} [opts.name] — display/debug identifier.
 *   @param {Array}  [opts.color] — RGB [r,g,b] render color.
 *   @param {number} [opts.alpha] — render opacity 0-255.
 *   @param {boolean}[opts.visible] — drawn or not (render-only).
 *   @param {string} [opts.reposition='closest'] — eject direction.
 *   @param {number} [opts.layer] — dimension layer to scope to (null = all).
 *   @param {string} [opts.shellShape] — render shape hint (ball|box|circle|…).
 *   @param {boolean}[opts.collectCollided] — ADVANCED override of the behavior's
 *     default collect_collided flag. Omit for normal use (the `count` hook sets it).
 *   @param {number} [opts.capacity=64] — ABSORB only: the fill ceiling, and the
 *     `1/capacity` per-tick emission probability. How much it holds and how often it
 *     gives some back.
 *   @param {number} [opts.emissivity=0.5] — ABSORB only: radiating EFFICIENCY, as a
 *     FULLNESS fraction in (0,1] of each emitted leaf. This is a colour/temperature
 *     knob, not bookkeeping: emissivity fixes what the re-emitted quantum IS, and both
 *     its speed and its wavelength fall out of that fullness together — 1.0 emits a full
 *     leaf (P_eff 1, light speed, shortest λ), 0.5 a half-full one (P_eff ½, twice the
 *     λ), 0.25 a quarter-full one. FAIL-LOUD outside (0,1]: a fullness above 1 would be
 *     a move gate above 1. The emitted leaf's SCALE is not a knob — see `emissivity` in
 *     the datasheet: the wall re-emits at the layer it soaked from.
 *
 * Live methods:
 *   `setV2Prop(prop, value)` — retarget a lexicon field (collisionBehavior /
 *     bounceDirection / decoherence / hooks / markTag / countFilter / capacity /
 *     orientationDeg / pitchDeg) and RECOMPILE the running op-program.
 *     `emissivity` is also accepted and takes the short path: it is a radiator knob,
 *     not a collision mechanic, so it retunes the live radiator without a recompile.
 *   `getCollisionHistogram(tickData)` — for a COUNTING wall: accumulate + return
 *     `{ combined: Map<y,count>, grid: Map<y,Map<z,count>>, total }` from this LO's
 *     collided frames (`tickData.objects[handle].frames`). `combined` is the 1D
 *     y-profile (the 2D fringe histogram); `grid` is the SAME hits binned over the
 *     wall FACE (the 3D topology instrument) — one accumulation, two readings, and
 *     `Wall.deriveMarginalY(grid)` reproduces `combined` exactly. (For per-slit
 *     provenance, use the `DetectorWall` wrapper.) Throws on a wall with no `count` hook.
 *   `resetHistogram()` — clear the accumulator.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * ZERO physics of its own (SU1). Every collision effect — the eject-to-nearest-face
 * (block), the incidence flip (bounce/reflect), the scatter redraw (bounce/random),
 * the kill (destroy), the tally-and-radiate (absorb), the stamp/tally (mark/count) —
 * is REALIZED by the compiled op-program the engine interprets, the SAME one every
 * composite in the wall family produces. A `Wall` cannot move a bench golden; it
 * only names + places the primitive.
 */

import { LargeObject } from './LargeObject.js';
import * as _WB from '../objects/constants/WallBehaviors.js';
import { CollisionTypes } from './CollisionTypes.js';
import * as AbsorbRadiation from '../objects/objects/absorbRadiation.js';
import * as SlabFace from '../objects/geometry/SlabFace.js';
import { registerKind } from '../objects/kinds.js';
import * as ValueNormalizer from '../objects/schema/valueNormalizer.js';
import { shapeValuesMap } from '../objects/schema/index.js';
import { wallBehaviorV2ValuesMap as _wallBehaviorV2ValuesMap, bounceDirectionValuesMap as _bounceDirectionValuesMap, wallHookValuesMap as _wallHookValuesMap } from '../objects/constants/WallBehaviors.js';

    // ── Imports (Node.js) or globals (browser) ──────────────────────────
    var resolveWallSpec, expandWallPreset;
    resolveWallSpec = _WB.resolveWallSpec;
    expandWallPreset = _WB.expandWallPreset;

    /**
     * Resolve the full slab geometry for a v2 wall from its rect + orientation, via the ONE
     * SlabFace authority. Returns BOTH halves of the swept-OBB collision model:
     *
     *   - `region` — the CONVENTION-FREE, center-less narrow-phase OBB descriptor
     *     ({ kind:'obb', theta, hw, hh, hz }) for a NON-cardinal wall, or null at a cardinal
     *     orientation (the byte-identical AABB path). The engine re-centers the LO rect on
     *     its backing frame each tick, so the region carries NO center.
     *   - `broadRect` — the LO's REGISTERED rect (the AABB broad phase, `octree.rs`). For a
     *     NON-cardinal wall this is EXPANDED to the rotated slab's axis-aligned bounding box
     *     (SlabFace.aabbHalfExtentsFromObb — the superset-discipline fix so a beam at the
     *     face TIP is a broad-phase candidate; the OBB region then culls the AABB corners).
     *     The expansion is symmetric about the slab center (rotation preserves the center),
     *     so the rect center — where the region resolves — is unchanged. At a cardinal
     *     orientation broadRect === the raw rect (byte-identical SU1).
     *   - `trueW`/`trueH` — the ORIGINAL (un-expanded) slab dimensions, ferried onto the LO
     *     so the renderer draws the THIN rotated mirror face (not the fat AABB). Undefined
     *     at a cardinal orientation (the raw rect IS the true slab → no ferry needed).
     *
     * @param {Array} rectArr — the LO rect ([l,t,w,h] or [l,t,z,w,h,d]).
     * @param {number} orientationDeg — the wall's current orientation.
     * @returns {{region:Object|null, broadRect:Array, trueW:(number|undefined), trueH:(number|undefined)}}
     */
    function _slabGeometryForWall(rectArr, orientationDeg, pitchDeg) {
        if (!SlabFace) { return { region: null, broadRect: rectArr }; } // pre-load safety
        var wh = _rectWH(rectArr);
        var depth = _rectDepth(rectArr);
        var slab = SlabFace.resolveSlabFace({
            w: wh.w, h: wh.h, orientationDeg: orientationDeg, d: depth, pitchDeg: pitchDeg
        });
        // R2AX — a PITCHED plate (two-axis mirror) has NO engine
        // region (the ObbRegion contract is z-theta-only): the broad phase is the plate's
        // full 3D AABB (SlabFace plate3.aabb — the one derivation) and the compiled guard
        // trigger is the narrow phase. Engine two-angle OBB = flagged Gate-1 follow-up.
        if (slab.pitched) {
            var p3 = slab.plate3;
            var whP = _rectWH(rectArr);
            var cxP = rectArr[0] + whP.w / 2, cyP = rectArr[1] + whP.h / 2;
            var zP = rectArr[2], dTot = rectArr[5];
            var czP = zP + dTot / 2;
            return {
                region: null,
                broadRect: [cxP - p3.aabb.hx, cyP - p3.aabb.hy, czP - p3.aabb.hz,
                            2 * p3.aabb.hx, 2 * p3.aabb.hy, 2 * p3.aabb.hz],
                trueW: whP.w, trueH: whP.h
            };
        }
        var region = SlabFace.regionFromObb(slab.obb);
        if (!region) {
            // cardinal → no OBB, no expansion (byte-identical AABB path).
            return { region: null, broadRect: rectArr };
        }
        // NON-cardinal → expand the broad-phase rect to the rotated-slab AABB (same center).
        var aabb = SlabFace.aabbHalfExtentsFromObb(slab.obb);
        var is6 = Array.isArray(rectArr) && rectArr.length === 6;
        var left = rectArr[0], top = rectArr[1];
        var cx = left + wh.w / 2, cy = top + wh.h / 2;
        var broadRect;
        if (is6) {
            var z = rectArr[2], d = rectArr[5];
            broadRect = [cx - aabb.hx, cy - aabb.hy, z, 2 * aabb.hx, 2 * aabb.hy, d];
        } else {
            broadRect = [cx - aabb.hx, cy - aabb.hy, 2 * aabb.hx, 2 * aabb.hy];
        }
        return { region: region, broadRect: broadRect, trueW: wh.w, trueH: wh.h };
    }

    function _rectFromOpts(opts) {
        // ONE spelling of the z-slab: a rect that already carries z/depth (the 6-element form, or an
        // object rect with z/d) beside the z / d / depth props would be two statements of one fact,
        // one of them silently ignored. Refused, naming both.
        var slabProps = ['z', 'd', 'depth'].filter(function (k) { return opts[k] !== undefined; });
        if (slabProps.length && opts.rect && (Array.isArray(opts.rect) ? opts.rect.length === 6
                : (opts.rect.z !== undefined || opts.rect.d !== undefined))) {
            throw new Error('[Wall] rect is already the z/depth form ' + ValueNormalizer.rectTupleText(6) +
                ' and the props also give ' + slabProps.join(', ') + ' — write the z-slab ONE way: the 6-element rect, ' +
                'or a 4-element rect beside z/depth. (FAIL-LOUD.)');
        }
        // Normalize an OBJECT-bag rect ({left,top,w,h} / {left,top,z,w,h,d} — the shape a live LO's
        // rect reads as) to the canonical ARRAY form FIRST, so the 3D checks below
        // (_rectIs3D/_rectDepth are Array-based) see such a 3D wall as 3D. Mirrors LargeObject's
        // own rectToArray.
        if (opts.rect && !Array.isArray(opts.rect) && opts.rect.left !== undefined && opts.rect.w !== undefined) {
            var ob = opts.rect;
            var arr = (ob.z !== undefined || ob.d !== undefined)
                ? [ob.left, ob.top, (ob.z !== undefined ? ob.z : 0), ob.w, ob.h,
                   (ob.d !== undefined ? ob.d : ob.w)]
                : [ob.left, ob.top, ob.w, ob.h];
            opts = Object.assign({}, opts, { rect: arr });
        }
        if (opts.rect) {
            // Z1 — promote a 4-element rect to the explicit z/depth 6-element form when the
            // `depth`/`z` 3D sugar is supplied (a wall you place in 2D but give a z-slab).
            // A rect already in 6-element form, or a bare 4-element with no z/depth sugar,
            // passes through verbatim (byte-identical).
            if (Array.isArray(opts.rect) && opts.rect.length === 4 &&
                (opts.depth !== undefined || opts.z !== undefined)) {
                var r = opts.rect;
                return [r[0], r[1], (opts.z !== undefined ? opts.z : 0), r[2], r[3],
                        (opts.depth !== undefined ? opts.depth : r[2])];
            }
            return opts.rect;
        }
        if (opts.z !== undefined || opts.d !== undefined || opts.depth !== undefined) {
            return [opts.left, opts.top, (opts.z !== undefined ? opts.z : 0),
                    opts.w, opts.h,
                    (opts.depth !== undefined ? opts.depth : (opts.d !== undefined ? opts.d : opts.w))];
        }
        return [opts.left, opts.top, opts.w, opts.h];
    }

    /** Read w/h out of a rect array ([l,t,w,h] or [l,t,z,w,h,d]) for the reflect-prefix. */
    function _rectWH(rectArr) {
        if (Array.isArray(rectArr) && rectArr.length === 6) { return { w: rectArr[3], h: rectArr[4] }; }
        if (Array.isArray(rectArr)) { return { w: rectArr[2], h: rectArr[3] }; }
        return { w: rectArr.w, h: rectArr.h };
    }

    /** True when a rect is the 6-element z/depth form with a real (>0) z-slab depth. */
    function _rectIs3D(rectArr) {
        return Array.isArray(rectArr) && rectArr.length === 6 && typeof rectArr[5] === 'number' && rectArr[5] > 0;
    }

    /** Read the depth (z-extent) out of a rect array (0 for a 2D 4-element rect). */
    function _rectDepth(rectArr) {
        return (Array.isArray(rectArr) && rectArr.length === 6) ? rectArr[5] : 0;
    }

    /**
     * Collision LEXICON v2 construction (nothing|block|bounce|absorb|destroy + nested
     * direction/modifiers + composable mark/count hooks). Compiles the ONE program via
     * resolveWallSpec → compileWallV2 (the single compiler authority), registers a bare
     * LO with the registration-time collect flag, pushes the program, and — for ABSORB —
     * attaches a REAL backing frame + registers the radiation host tick-fn (Track A). SU1.
     */
    function _constructV2(self, universe, opts) {
        var behavior = opts.collisionBehavior;
        self.collisionBehavior = behavior;
        self.bounceDirection = opts.bounceDirection || (behavior === 'bounce' ? 'reflect' : undefined);
        self.angleConstraint = opts.angleConstraint;
        self.decoherence = !!opts.decoherence;
        self.hooks = Array.isArray(opts.hooks) ? opts.hooks.slice() : [];
        self.markTag = opts.markTag;
        self.countFilter = opts.countFilter;
        self.capacity = (typeof opts.capacity === 'number') ? opts.capacity : 64;
        // ABSORB radiating efficiency — a FULLNESS fraction of the emitted leaf. Left undefined
        // when the caller does not state one, so the ONE default lives in absorbRadiation.js.
        self.emissivity = (typeof opts.emissivity === 'number') ? opts.emissivity : undefined;
        self.orientationDeg = (typeof opts.orientationDeg === 'number') ? opts.orientationDeg : 0;
        // R2AX (two-axis mirror) — up/down tilt about the plate's own long
        // axis. 0/absent ⇒ byte-identical un-pitched wall. Requires a 3D wall (validated
        // below once the rect is resolved; SlabFace + compileWallV2 double-guard).
        self.pitchDeg = (typeof opts.pitchDeg === 'number') ? opts.pitchDeg : 0;

        var rect = _rectFromOpts(opts);
        var baseName = opts.name || 'wall';
        self.name = baseName;
        // Z1 — a 6-element rect with a real depth is a 3D wall: it reflects on all three
        // axes (the z-incidence lift) and ejects on all six faces. The eject-region promotion
        // to 'closest3d' happens inside compileWallV2 (is3D), so both the compiled program AND
        // the LargeObject reposition agree; we mirror it here for the LO wrapper reposition.
        var is3D = _rectIs3D(rect);
        var reposition = opts.reposition || (is3D ? 'closest3d' : 'closest');
        // observed dimensions: an explicit opts.layer scopes the wall to that layer; unset =
        // ALL dimensions. The former absorb-only `layer=0` workaround (dodging the multi-dim
        // collect_collided wipe) is REMOVED — the engine now clears the collect buffer once per
        // tick and ACCUMULATES across all observed dimensions (K5 fix), so an absorb wall
        // correctly collects colliders wherever the leaves live, not just in a hardcoded dim 0.
        var layer = opts.layer;
        var observedDimensions = (layer !== undefined && layer !== null) ? [layer] : null;

        var _wh0 = _rectWH(rect);
        var v2 = resolveWallSpec({
            collisionBehavior: behavior, bounceDirection: self.bounceDirection,
            angleConstraint: self.angleConstraint, decoherence: self.decoherence,
            hooks: self.hooks, markTag: self.markTag, capacity: self.capacity,
            emissivity: self.emissivity,
            // the wall's drawn color → the ONE authority the `recolor` hook tags with.
            color: opts.color,
            orientationDeg: self.orientationDeg, reposition: reposition, is3D: is3D,
            slabW: _wh0.w, slabH: _wh0.h,
            // R2AX — pitch + depth ferry (pitch 0 ⇒ byte-identical programs).
            pitchDeg: self.pitchDeg, slabD: _rectDepth(rect)
        });
        // `opts.collectCollided` is a DECLARED Wall option (see this module's docstring) and
        // the legacy path has always honored it as an override of the behavior's default.
        // The v2 path was reading ONLY `v2.collectCollided` (the compiler's derived flag), so
        // the documented override silently did nothing on a `collisionBehavior` wall — the
        // gap a Tunnel in directed mode hits: its walls carry NO behavior that implies
        // collection (they are 'nothing' + an eject-only program), yet the host redirect
        // needs `tickData.objects[handle].frames` to exist. Collection is a REGISTRATION-time
        // engine flag (no live toggle — see setV2Prop's own guard), which is exactly why
        // it must be settable at construction. Omitted ⇒ the compiler's flag ⇒ byte-identical.
        var collectCollided = (opts.collectCollided !== undefined)
            ? !!opts.collectCollided : !!v2.collectCollided;
        self._collectCollided = collectCollided;
        self._radiation = v2.radiation;

        // SWEPT-OBB geometry (circulation §2 + MIRROR broad-phase-superset rule): resolve
        // BOTH the narrow-phase region AND the broad-phase rect from the ONE SlabFace authority.
        // The JS wrapper LO keeps the TRUE slab rect (render draws the thin rotated face + the
        // renderer/eject stay byte-identical); the ENGINE's registered rect is EXPANDED to the
        // rotated-slab AABB below (broad-phase superset) so a face-tip beam is a candidate — the
        // OBB region then culls the AABB corners back to the drawn face. Cardinal → no expansion.
        self._trueRect = rect;
        var geom = _slabGeometryForWall(rect, self.orientationDeg, self.pitchDeg);

        // Bare LO (no auto-compiled actions) with the collect flag AT REGISTRATION, then push
        // the v2 program (the same live-push path recompileActions uses). Construct on the TRUE
        // slab rect; the engine broad-phase rect is widened to the AABB after (region push below).
        self.lo = new LargeObject(universe, rect, 'NONE', [], baseName, reposition, observedDimensions, 1, opts.color, collectCollided);
        // THE ONE UP-LINK: a composer stamps `_owner` on what it composed (the Wall composed its LO).
        self.lo._owner = self;
        // Ferry orientationDeg onto the LO wrapper (mirrors how shellShape/color are ferried)
        // so the renderer providers draw the shell rotated (R2).
        // The engine never sees it (LargeObject is a plain render/collide wrapper here).
        self.lo.orientationDeg = self.orientationDeg;
        // R2AX — ferry the pitch for the renderer (drawn face is truth: the provider tips
        // the plate about its long axis to match SlabFace's plate3.n). Render-only mirror
        // of the physics angle, like orientationDeg. Only ferried when nonzero so an
        // un-pitched wall's LO surface stays byte-identical.
        if (self.pitchDeg) { self.lo.pitchDeg = self.pitchDeg; }
        // Z1 — ferry the z-slab depth onto the LO wrapper so the three provider draws the
        // wall as a real BoxGeometry slab (w×h×depth).
        // (The engine already has the z-slab collision region from the 6-element rect; this
        // is the render-only mirror, like orientationDeg.) Only set for a 3D wall so a 2D
        // wall's LO signature/fit stays byte-identical (undefined → flat plane).
        if (is3D) { self.lo.depth = _rectDepth(rect); }
        self.is3D = is3D;
        if (v2.program && universe && typeof universe.updateObjectProperty === 'function') {
            universe.updateObjectProperty(self.lo.handle, 'LargeObject', 'program', v2.program);
        }
        self.lo.program = v2.program || null;
        // The program THIS wall baked — the record the re-bake guard (`_rebake`) checks, so a
        // program another part pushed onto this LO is never silently re-baked over.
        self._program = self.lo.program;
        // SWEPT-OBB narrow-phase region (circulation §2): a NON-cardinal wall gets the rotated
        // collision slab so the engine filters candidates by the SWEPT prev→now segment-vs-OBB
        // test AT its DRAWN face (not the fat AABB entry plane), fixing membership for EVERY
        // consumer (reflect/absorb/count/detect) at once. Cardinal → null = the byte-identical
        // AABB path (SU1). Pushed on the SAME live path as `program`. WASM-only: the JS provider
        // FAILS LOUD on a non-null region (the frozen 2D fixture cannot honor a rotated slab).
        var region = geom.region;
        if (universe && typeof universe.updateObjectProperty === 'function') {
            universe.updateObjectProperty(self.lo.handle, 'LargeObject', 'region', region);
            // BROAD-PHASE SUPERSET: widen ONLY the ENGINE's registered rect to the rotated-slab
            // AABB (same center). The engine re-centers this rect on the backing frame each tick
            // keeping w/h, so the wider AABB persists; the JS wrapper's lo.rect stays the true
            // slab (render/eject-reference untouched). Cardinal → broadRect === rect → no push
            // (byte-identical SU1). WASM-only alongside the region.
            // R2AX FIX (measured, 2026-07-26): the push is gated on the WIDENING itself, never
            // on `region` — a PITCHED plate has region:null BY DESIGN (z-theta-only contract)
            // yet NEEDS its 3D-AABB broad rect; gating on region left the raw thin slab as the
            // broad phase and face-crossings OUTSIDE it were never candidates (the sweep-matrix
            // pass-through class).
            if (geom.broadRect !== rect) {
                universe.updateObjectProperty(self.lo.handle, 'LargeObject', 'rect', geom.broadRect);
            }
        }
        self.lo.region = region;
        if (opts.alpha !== undefined) { self.lo.alpha = opts.alpha; }
        if (opts.visible !== undefined) { self.lo.visible = opts.visible; }
        if (opts.shellShape !== undefined) { self.lo.shellShape = opts.shellShape; }

        // ABSORB v2 (Track A): back the LO with a REAL leaf frame + register the radiation
        // host tick-fn (the emitter/thermostat seam). The backing frame is ASSUMED to exist
        // (no fallback) per the mandatory-at-registration directive.
        self._radiationTickFn = null; self._backing = null;
        if (behavior === 'absorb' && AbsorbRadiation) {
            var back = AbsorbRadiation.attachAbsorberBackingFrame(universe, self.lo.handle, rect, self.capacity);
            self._backing = back;
            // The absorb CLOCK (`back.capacity`) is what the radiator runs on; `back.level` is
            // only the record of how that ceiling was quantized. The EMISSION level is not a
            // knob — it is read per emission off the layer the mass was absorbed from.
            var tickFn = AbsorbRadiation.buildAbsorbRadiationTickFn({
                universe: universe, loHandle: self.lo.handle, backingQid: back.backingQid,
                capacity: back.capacity, rect: rect,
                emissivity: (v2.radiation && v2.radiation.emissivity)
            });
            self._radiationTickFn = tickFn;
            // The radiator OWNS the live emissivity (including the default when none was
            // stated). Read the facade prop back off it rather than leaving it undefined —
            // captureProps (the parts writer) and the Inspector read `wall.emissivity`, and a facade that
            // says nothing while the radiator says 0.5 is a second, wrong answer.
            self.emissivity = tickFn.emissivity();
            if (universe && Array.isArray(universe.experimentTickFunctions)) {
                universe.experimentTickFunctions.push(tickFn);
            }
        }

        self._combined = new Map();
        self._grid = new Map();
        self._total = 0;
        self._lastTickData = undefined;
    }

    function Wall(universe, opts) {
        opts = opts || {};
        this.universe = universe;
        this._schemaKind = this.constructor.name;

        // A `preset` expands to the v2 descriptor fields (construction sugar; the parts
        // writer captures the EXPANDED fields, never the preset name).
        if (opts.preset) {
            var expanded = expandWallPreset(opts.preset);
            var merged = {}; Object.keys(opts).forEach(function (k) { if (k !== 'preset') { merged[k] = opts[k]; } });
            Object.keys(expanded).forEach(function (k) { if (merged[k] === undefined) { merged[k] = expanded[k]; } });
            opts = merged;
        }

        // ── Collision LEXICON v2 — the ONE input path ────────────────────────────
        // The legacy `wallBehavior` vocabulary (block|reflect|absorb|detect) is DELETED.
        // A caller still speaking it is named its V2 form rather than silently building
        // a different wall.
        if (opts.wallBehavior !== undefined) {
            throw new Error('[Wall] `wallBehavior` is deleted — use `collisionBehavior`: ' +
                'block → collisionBehavior:\'block\'; reflect → collisionBehavior:\'bounce\', ' +
                'bounceDirection:\'reflect\'; absorb (plain kill) → collisionBehavior:\'destroy\'; ' +
                'detect → collisionBehavior:\'destroy\', hooks:[\'count\'] (= preset ' +
                '\'detector-screen\'). Note collisionBehavior:\'absorb\' is the RADIATING ' +
                'absorber, NOT the old plain kill.');
        }
        if (opts.collisionType !== undefined) {
            throw new Error('[Wall] the `collisionType` override is deleted — a wall\'s ' +
                'collision mechanics ARE its compiled op-program (collisionBehavior + ' +
                'bounceDirection + hooks).');
        }
        if (opts.collisionBehavior === undefined) {
            throw new Error('[Wall] `collisionBehavior` is REQUIRED — one of ' +
                'nothing|block|bounce|absorb|destroy (or pass a `preset`).');
        }
        return _constructV2(this, universe, opts);
    }

    // ── Descriptor-field read surface (captureProps / Inspector) ─────────────
    // captureProps(wall, WallDescriptor) reads wall[field.name] directly; these
    // getters expose the LIVE inner-LO state so a dragged/edited wall Saves at its
    // current state (what the parts writer captures). `rect` is the single
    // captured position authority (the LO's own Rectangle, whose toJSON pins the
    // {left,top,w,h} wire shape).
    Object.defineProperty(Wall.prototype, 'rect',        { get: function () { return this.lo ? this.lo.rect : undefined; } });
    Object.defineProperty(Wall.prototype, 'handle',      { get: function () { return this.lo ? this.lo.handle : undefined; } });
    Object.defineProperty(Wall.prototype, 'color',       { get: function () { return this.lo ? this.lo.color : undefined; } });
    Object.defineProperty(Wall.prototype, 'alpha',       { get: function () { return this.lo ? this.lo.alpha : undefined; } });
    Object.defineProperty(Wall.prototype, 'visible',     { get: function () { return this.lo ? this.lo.visible : undefined; } });
    Object.defineProperty(Wall.prototype, 'layer',       { get: function () { return this.lo ? this.lo.layer : undefined; } });
    Object.defineProperty(Wall.prototype, 'reposition',  { get: function () { return this.lo ? this.lo.reposition : undefined; } });
    Object.defineProperty(Wall.prototype, 'shellShape',  { get: function () { return this.lo ? this.lo.shellShape : undefined; } });
    // Z1 — z-slab read-out (derived from the LO's Rectangle; 0 for a 2D wall). The rect is
    // the single live position authority; these are inspectable, round-tripped by the sugar.
    Object.defineProperty(Wall.prototype, 'depth',       { get: function () { return (this.lo && this.lo.rect && typeof this.lo.rect.d === 'number') ? this.lo.rect.d : 0; } });
    Object.defineProperty(Wall.prototype, 'z',           { get: function () { return (this.lo && this.lo.rect && typeof this.lo.rect.z === 'number') ? this.lo.rect.z : 0; } });

    // A Wall exposes NO getCenter: its position authority is its RECT (the TRUE slab,
    // `_trueRect`), written ONLY through setRect below. A GRABBED wall (STUDIO's spacebar aim,
    // AIM_GRAB_FEEDBACK_CONTRACT §The carry) holds its camera-relative pose: the runner re-places
    // the rect's drawn centre (lo-drawn-center rectAtCenter) through updateObjectProperty(wall,
    // 'rect') → setRect, and carries the heading through setOrientation.

    /** getOrientation() → the wall's current orientation in degrees (0 default). */
    Wall.prototype.getOrientation = function () {
        return (typeof this.orientationDeg === 'number') ? this.orientationDeg : 0;
    };

    /**
     * setOrientation(deg) — live re-aim (B7). Normalizes to [0,360) and routes through
     * the SAME setV2Prop recompile path the Inspector slider uses (explicit re-bake of the
     * directional cone — the "a wall that should re-aim must recompile"
     * path; NOT a per-tick re-capture). SU1 at deg=0. THROWS on a wall-shaped object with no
     * collisionBehavior: the constructor requires one, so such an object was not built by Wall
     * and has no op-program to re-aim — turning it silently would show a turn that never happened.
     * @param {number} deg @returns {Wall} this
     */
    Wall.prototype.setOrientation = function (deg) {
        if (this.collisionBehavior === undefined) {
            throw new Error('[Wall.setOrientation] this wall has no collisionBehavior, so it has no ' +
                'compiled op-program to re-aim — a Wall is built only through the v2 lexicon ' +
                '(new Wall(universe, { collisionBehavior | preset })); an object without one was not ' +
                'built by Wall. (FAIL-LOUD.)');
        }
        var d = ((deg % 360) + 360) % 360;
        this.setV2Prop('orientationDeg', d);
        return this;
    };

    /**
     * setRect(rect) — THE wall position/extent write (the rect is the one position authority).
     * Every rect write reaches it: FrqtlApp.updateObjectProperty routes a Wall facade's `rect`, and
     * its inner LO's, here. `rect` is the write-wire array `[l,t,w,h]` or `[l,t,z,w,h,d]`:
     *   - on a z-slab wall (6-element) a 4-element write is PLANAR: z and d are kept;
     *   - a 6-element write on a wall built without z THROWS — the wall's 3D-ness (the z-incidence
     *     reflect + the closest3d eject compiled into its program) is fixed at construction.
     * It keeps every wall-derived place in step: the true slab (`_trueRect`, which every later
     * setV2Prop re-derives from), the LO wrapper's drawn rect, the ENGINE rect (the broad-phase
     * rect from the ONE SlabFace authority — the rotated-slab AABB for a tilted wall; the engine
     * moves the backing frame with it), and an absorber's re-emission exit. A changed extent
     * re-bakes the program too (the slab dimensions are compiled in). Zero physics: placement only.
     * @param {number[]} rect @returns {Wall} this
     */
    Wall.prototype.setRect = function (rect) {
        if (!Array.isArray(rect) || (rect.length !== 4 && rect.length !== 6) ||
            !rect.every(function (v) { return typeof v === 'number' && isFinite(v); })) {
            throw new TypeError('[Wall.setRect] rect must be [l,t,w,h] or [l,t,z,w,h,d] of finite ' +
                'numbers; got ' + JSON.stringify(rect) + '. (FAIL-LOUD.)');
        }
        var cur = this._trueRect;
        var cur6 = Array.isArray(cur) && cur.length === 6;
        var next;
        if (rect.length === 6) {
            if (!cur6) {
                throw new Error('[Wall.setRect] "' + this.name + '" was built without a z-slab; a ' +
                    '6-element rect would give it one, but a wall\'s 3D-ness is compiled into its ' +
                    'op-program at construction. Remove + re-add it with z/depth. (FAIL-LOUD.)');
            }
            next = rect.slice();
        } else {
            next = cur6 ? [rect[0], rect[1], cur[2], rect[2], rect[3], cur[5]] : rect.slice();
        }
        var wh0 = _rectWH(cur), wh1 = _rectWH(next);
        var resized = wh0.w !== wh1.w || wh0.h !== wh1.h || _rectDepth(cur) !== _rectDepth(next);
        if (resized) { this.assertOwnsProgram(); }   // atomic: refuse before anything moves
        this._trueRect = next;
        var lr = this.lo.rect;
        lr.w = wh1.w; lr.h = wh1.h;
        if (cur6) { lr.z = next[2]; lr.d = next[5]; }
        lr.left = next[0]; lr.top = next[1];
        if (this.is3D) { this.lo.depth = _rectDepth(next); }
        if (resized) {
            this._rebake();   // the slab dimensions are compiled in: program + region + broad rect
        } else if (this.universe && typeof this.universe.updateObjectProperty === 'function') {
            var geom = _slabGeometryForWall(next, this.orientationDeg, this.pitchDeg);
            this.universe.updateObjectProperty(this.lo.handle, 'LargeObject', 'rect', geom.broadRect);
        }
        if (this._radiationTickFn) { this._radiationTickFn.setRect(next); }
        return this;
    };

    /**
     * R2AX — live PITCH (up/down, two-axis mirror). Degrees in
     * [-90, 90], rotation about the plate's own long axis; routes through the SAME
     * setV2Prop recompile path as orientation (re-bakes the 3-space reflection about the
     * SlabFace plate normal + the n-dot guard + the 3D-AABB broad rect). Requires a 3D
     * wall (throws otherwise — the FAIL-LOUD accessor discipline).
     * Layer 2 — physics: tips the mirror face out of the xy-plane, so the reflected beam
     * gains/loses a z-component per R = I − 2nnᵀ (pitch 0 restores the in-plane 2θ law
     * with vz passing through). The reflected spray always leaves on the incident side.
     * @param {number} d degrees, [-90, 90].
     * @returns {Wall} this
     */
    Wall.prototype.setPitch = function (d) {
        this.setV2Prop('pitchDeg', d);
        return this;
    };

    /**
     * Live-edit a Collision LEXICON v2 field (bounceDirection / decoherence / hooks /
     * markTag / countFilter / capacity / collisionBehavior) — updates the facade prop IN
     * PLACE (so the Inspector's visibleWhen re-read reveals dependent fields immediately)
     * and RECOMPILES the running op-program via resolveWallSpec (the same live-push path).
     *
     * Two registration-time guards (FAIL-LOUD, atomic — throw before any mutation):
     *   - collection (collect_collided) is registration-time; refuse a live switch that
     *     would NEWLY need collection (adding count/mark, or an absorb behavior) on a wall
     *     not registered to collect.
     *   - the ABSORB backing frame + radiation tick-fn are attached at construction; refuse
     *     a live switch INTO/out of absorb (reconstruct the wall instead).
     *
     * `emissivity` takes the SHORT path below: it is a radiator knob, not a collision
     * mechanic, so it changes nothing in the compiled op-program and recompiling for it would
     * be theatre.
     */
    Wall.prototype.setV2Prop = function (prop, value) {
        // EMISSIVITY — live radiating efficiency. The running radiator OWNS the value (one
        // live copy); the facade prop is a ferried mirror for the Inspector and capture read.
        // Validation (fullness fraction in (0,1]) belongs to the owner and throws from there.
        if (prop === 'emissivity') {
            if (this.collisionBehavior !== 'absorb' || !this._radiationTickFn) {
                throw new Error('[Wall.setV2Prop] emissivity is a RADIATOR knob and this wall is not ' +
                    'an ABSORB wall (collisionBehavior "' + this.collisionBehavior + '").');
            }
            this.emissivity = this._radiationTickFn.setEmissivity(value);
            return this;
        }
        return this._rebake(prop, value);
    };

    /**
     * THE re-bake (one site): re-derive the wall's program, narrow-phase region and engine broad
     * rect from its spec + true slab through the ONE compiler, committing `prop = value` first when
     * a lexicon prop is being edited (setV2Prop) — or with no prop, re-deriving from the current
     * state (setRect's resize: the slab dimensions are compiled in).
     *
     * GUARD (FAIL-LOUD, atomic — before any mutation): a Wall re-bakes only a program IT baked.
     * A composite may push its own program onto this wall's LO (a directed Tunnel's liner-scatter
     * eject, a Tunnel exit gate, an OvenBox counter wall); re-baking would silently replace that
     * part's physics with the wall's own. Such a program must be re-applied by the part that owns it.
     * @param {string} [prop] @param {*} [value] @returns {Wall} this
     */
    Wall.prototype._rebake = function (prop, value) {
        this.assertOwnsProgram();
        var nextBehavior = (prop === 'collisionBehavior') ? value : this.collisionBehavior;
        var wasAbsorb = (this.collisionBehavior === 'absorb');
        var willAbsorb = (nextBehavior === 'absorb');
        if (wasAbsorb !== willAbsorb) {
            throw new Error('[Wall.setV2Prop] cannot live-switch ' + (willAbsorb ? 'INTO' : 'out of') +
                ' the radiating ABSORB behavior — its backing frame + radiation tick-fn are attached ' +
                'at construction. Remove + re-add the wall as absorb.');
        }
        var nextHooks = (prop === 'hooks') ? (Array.isArray(value) ? value.slice() : []) : this.hooks;
        var _trueWH = _rectWH(this._trueRect);
        var probe = resolveWallSpec({
            collisionBehavior: nextBehavior, bounceDirection: (prop === 'bounceDirection') ? value : this.bounceDirection,
            angleConstraint: this.angleConstraint, decoherence: (prop === 'decoherence') ? !!value : this.decoherence,
            hooks: nextHooks, markTag: (prop === 'markTag') ? value : this.markTag,
            capacity: (prop === 'capacity') ? value : this.capacity,
            // B7: a live orientation edit re-bakes the directional cone (explicit recompile —
            // the sanctioned re-aim path). Use the NEW value for the probe (the
            // generic commit below sets this.orientationDeg AFTER the probe is built).
            orientationDeg: (prop === 'orientationDeg') ? value : this.orientationDeg,
            // R2AX — a live pitch edit re-bakes the 3-space reflection + guard the same way
            // a live orientation edit re-bakes the 2θ law (the ONE recompile path).
            pitchDeg: (prop === 'pitchDeg') ? value : this.pitchDeg,
            slabD: _rectDepth(this._trueRect),
            reposition: this.lo.reposition,
            // Z1 — preserve the wall's 3D-ness across a live recompile (else an orientation
            // edit on a 3D wall would drop the z-incidence reflect + the closest3d eject).
            is3D: this.is3D === true,
            // MIRROR rule — the TRUE slab dims (from _trueRect) so a live orientation edit
            // re-bakes the OBB-normal eject for the new angle (cardinal → AABB eject, SU1).
            slabW: _trueWH.w, slabH: _trueWH.h
        });
        if (probe.collectCollided && !this._collectCollided) {
            throw new Error('[Wall.setV2Prop] cannot live-enable collection (mark/count) on a wall not ' +
                'registered to collect_collided — construct it with the hook, or remove + re-add it.');
        }
        // Commit the facade prop, then push the recompiled program.
        if (prop === 'hooks') { this.hooks = nextHooks; }
        else if (prop === 'decoherence') { this.decoherence = !!value; }
        else if (prop !== undefined) { this[prop] = value; }
        // Keep the ferried render orientation in sync so the shell rotation (R2) tracks a live edit.
        if (prop === 'orientationDeg' && this.lo) { this.lo.orientationDeg = value; }
        if (prop === 'pitchDeg' && this.lo) { this.lo.pitchDeg = value; }
        if (this.universe && typeof this.universe.updateObjectProperty === 'function') {
            this.universe.updateObjectProperty(this.lo.handle, 'LargeObject', 'program', probe.program || null);
        }
        this.lo.program = probe.program || null;
        // Re-derive + re-push the swept-OBB geometry on a live edit (a live orientation change
        // re-bakes the rotated collision slab + its broad-phase AABB from the SAME SlabFace
        // authority; a change back to a cardinal orientation clears the region to null = the AABB
        // path and restores the true-slab broad rect). Uses the wall's TRUE (un-expanded) rect —
        // the JS wrapper's lo.rect is the true slab, and the engine broad rect is re-widened here.
        // WASM-only (the JS provider FAILS LOUD on a non-null region).
        var geom2 = _slabGeometryForWall(this._trueRect, this.orientationDeg, this.pitchDeg);
        if (this.universe && typeof this.universe.updateObjectProperty === 'function') {
            this.universe.updateObjectProperty(this.lo.handle, 'LargeObject', 'region', geom2.region);
            // Re-widen the ENGINE broad-phase rect to the new orientation's AABB (or restore the
            // true rect at a cardinal). The JS wrapper rect is left as the true slab (render).
            this.universe.updateObjectProperty(this.lo.handle, 'LargeObject', 'rect', geom2.broadRect);
        }
        this.lo.region = geom2.region;
        this._program = this.lo.program;
        return this;
    };

    /** THROWS when this wall's LO carries a program the wall did not bake (see `_rebake`). The
     *  STUDIO grab of a DECLARED wall asks it first: a wall whose program another part replaced
     *  must not be re-baked by a carry or a turn, so the grab is refused. (A composite's members
     *  are never grabbed on their own — the composite is the declared object.) */
    Wall.prototype.assertOwnsProgram = function () {
        if (this.lo && this.lo.program !== this._program) {
            throw new Error('[Wall] "' + this.name + '": its LargeObject carries an op-program another ' +
                'part pushed (' + (this._owner ? 'owned by ' + (this._owner.name || 'its composite') :
                'not baked by this wall') + '). Re-baking it here would silently replace that part\'s ' +
                'physics — the owning part must re-apply it. (FAIL-LOUD.)');
        }
    };

    /**
     * detect-wall counting readout: accumulate this tick's collided frames into a
     * running y→count histogram and return it. Reads THIS LO's collected frames from
     * the marshalled tick output (`tickData.objects[handle].frames`) — the engine
     * buffers them because the LO was registered `collect_collided:true` (the detect
     * behavior). Pure reader; identical on both engines.
     *
     * Guard: THROWS if called on a non-detect wall (no collected frames buffer) so a
     * mis-wired counting screen fails loud rather than silently reporting zero.
     * @param {Object} tickData — the universe.doTick() result.
     * @returns {{ combined: Map<number,number>, total: number }}
     */
    Wall.prototype.getCollisionHistogram = function (tickData) {
        // A wall counts if it is the legacy `detect` behavior OR a v2 wall carrying the
        // `count` hook (the Counting Wall / Detector Screen).
        var counts = Array.isArray(this.hooks) && this.hooks.indexOf('count') !== -1;
        if (!counts) {
            throw new Error(
                '[Wall.getCollisionHistogram] this wall does not COUNT (collisionBehavior "' +
                this.collisionBehavior + '", hooks ' + JSON.stringify(this.hooks || []) +
                ') — only a wall carrying the `count` hook collects collided frames ' +
                '(preset \'detector-screen\' for a counting screen, \'transparent-probe\' ' +
                'for a pass-through population probe).'
            );
        }
        // #61 double-consume guard (same discipline as DetectorWall): each tick's
        // data must be consumed exactly once or hits double-count silently.
        if (tickData != null && tickData === this._lastTickData) {
            throw new Error(
                '[Wall.getCollisionHistogram] called twice with the SAME TickData object — ' +
                'each tick must be consumed exactly once. Call universe.doTick() again first.'
            );
        }
        this._lastTickData = tickData;

        var handle = this.lo.handle;
        var frames = (tickData && tickData.objects && tickData.objects[handle] &&
                      Array.isArray(tickData.objects[handle].frames))
            ? tickData.objects[handle].frames : [];
        for (var i = 0; i < frames.length; i++) {
            var fd = frames[i];
            var y;
            if (fd.rect && fd.rect.top != null) { y = Math.floor(fd.rect.top); }
            else if (fd.y != null) { y = Math.floor(fd.y); }
            else { y = 0; }
            // z rides FrameData top-level (the x/y-vs-z field split); 0 in a 2D scene
            // (the engine never writes it) — so the grid degenerates to one z-bucket.
            var z = (fd.z != null) ? Math.floor(fd.z) : 0;
            this._combined.set(y, (this._combined.get(y) || 0) + 1);
            Wall.gridAdd(this._grid, y, z);
            this._total++;
        }
        return { combined: this._combined, grid: this._grid, total: this._total };
    };

    /**
     * Add one hit at (y,z) to a Y×Z grid (Map<y, Map<z,count>>). Pure mutation
     * helper — the ONE grid-accumulation authority for the wall family (Wall is the
     * atom; DetectorWall delegates here rather than keeping a second copy).
     * @param {Map<number, Map<number,number>>} grid
     * @param {number} y
     * @param {number} z
     */
    Wall.gridAdd = function (grid, y, z) {
        var byZ = grid.get(y);
        if (!byZ) { byZ = new Map(); grid.set(y, byZ); }
        byZ.set(z, (byZ.get(z) || 0) + 1);
    };

    /**
     * Derive the Y-marginal (Map<y,count>) from a Y×Z grid — sums every z-bucket for
     * each y. Pure/static; exists so a caller can PROVE the grid and the 1D
     * histogram agree (the same "Y-marginal DERIVED" discipline as DetectorWall,
     * which delegates to this one authority).
     * @param {Map<number, Map<number,number>>} grid
     * @returns {Map<number,number>}
     */
    Wall.deriveMarginalY = function (grid) {
        var out = new Map();
        grid.forEach(function (byZ, y) {
            var sum = 0;
            byZ.forEach(function (c) { sum += c; });
            out.set(y, sum);
        });
        return out;
    };

    /** Does the op-program this wall's LargeObject is RUNNING remove the frame it triggers
     *  on (`set 0.is_alive = …`)? Read off the program itself — the one statement of what
     *  the wall does — never a hand list of behavior names (today: destroy and absorb). On
     *  such a wall a frame's listing in `tickData.objects[handle].frames` is not one
     *  arrival: the engine collects every frame in the mb_w-padded search rect
     *  (ENGINE_CONTRACT §5.1), so a frame is listed alive through its approach ticks and
     *  once more on its kill tick. */
    function _runningProgramRemoves(wall) {
        var prog = wall.lo && wall.lo.program;
        return !!(prog && Array.isArray(prog.ops) &&
            prog.ops.some(function (op) { return op && op.set === '0.is_alive'; }));
    }

    /**
     * ZONE-OCCUPANCY readout (loop-polish B): the number of frames THIS wall's
     * engine collect pass listed on the sampled tick — every frame in its search rect
     * (the rect padded by the dimension's mb_w). For a FULL-AREA background wall
     * (collisionBehavior 'nothing' + the count hook) that listing IS the current live
     * population inside the wall — the ONE canonical "how many live" authority (the
     * emission-cap gate and the LiveChart `liveCount` projector read it).
     *
     * Layer 1 (API): dual-lane, mirroring the LiveChart PROJECTOR_SPEC shape —
     *   getLiveCount(tickData) — SAMPLE lane (per tick): read
     *     `tickData.objects[handle].frames.length` and remember it. IDEMPOTENT per
     *     TickData (a pure sample, not an accumulator) — no double-consume guard
     *     needed, so a gate tick-fn and a chart drain may both sample the same tick.
     *   getLiveCount() — READ lane: return the last sample (0 before the first tick).
     *
     * Layer 2 (physics): zero physics — the background wall's compiled program is the
     * COUNT increment only (bench LO7); counting never moves, kills, or recolors a
     * frame (SU1).
     *
     * Guards: THROWS on a REMOVING wall (destroy / absorb) — there the listing reads
     * (1 + approach-halo ticks) x arrivals, never the arrivals; `getArrivals` is the
     * reader. THROWS on a wall without the count hook (no collected-frames buffer → it
     * would silently report 0 forever).
     * @param {Object} [tickData] — the universe.doTick() result (sample lane).
     * @returns {number}
     */
    Wall.prototype.getLiveCount = function (tickData) {
        if (_runningProgramRemoves(this)) {
            throw new Error(
                '[Wall.getLiveCount] this wall REMOVES what it hits (collisionBehavior "' +
                this.collisionBehavior + '") — getLiveCount is the zone-occupancy reader of a ' +
                'non-removing wall, and on a removing wall it would count each frame once per ' +
                'approach tick plus once on its kill tick. Read arrivals with ' +
                'wall.getArrivals(tickData) → { total, delta } (the engine\'s own per-wall count).'
            );
        }
        var counts = Array.isArray(this.hooks) && this.hooks.indexOf('count') !== -1;
        if (!counts) {
            throw new Error(
                '[Wall.getLiveCount] this wall does not COUNT (collisionBehavior "' +
                this.collisionBehavior + '", hooks ' + JSON.stringify(this.hooks || []) +
                ') — only a wall carrying the `count` hook collects collided frames ' +
                '(preset \'detector-screen\' for a counting screen, \'transparent-probe\' ' +
                'for a pass-through population probe).'
            );
        }
        if (tickData != null) {
            var handle = this.lo.handle;
            var oc = tickData.objects && tickData.objects[handle];
            this._liveCount = (oc && Array.isArray(oc.frames)) ? oc.frames.length : 0;
        }
        return this._liveCount || 0;
    };

    /**
     * ARRIVALS readout: how many frames have triggered THIS wall's collision program —
     * read from the engine's own per-wall counter, `tickData.objects[handle].count`, the
     * contract's one read authority for an LO count (ENGINE_CONTRACT §4.3). The `count`
     * hook compiles `set 1.count = 1.count + 1` behind the trigger, so the engine counts
     * one per trigger event; on a removing wall (destroy / absorb) each trigger is the
     * frame's removal, so the count IS the arrivals. Never derived from the collected
     * frame listing (that is the padded search-rect census — see getLiveCount).
     *
     * Layer 1 (API): dual-lane, the same shape as getLiveCount —
     *   getArrivals(tickData) — SAMPLE lane: read the engine count and return
     *     `{ total, delta }`: `total` = cumulative arrivals since the wall registered,
     *     `delta` = the change since the previously sampled TickData (this tick's
     *     arrivals when sampled every tick). IDEMPOTENT per TickData — sampling the same
     *     TickData twice returns the same `{ total, delta }`.
     *   getArrivals() — READ lane: the last sample (`{ total: 0, delta: 0 }` before the
     *     first tick).
     *
     * Layer 2 (physics): zero physics — a pure reader of a counter the compiled program
     * already maintains (bench LO7); reading it moves nothing (SU1).
     *
     * Guards: THROWS on a wall without the count hook (the engine counter never moves →
     * it would silently report 0 forever), and on a TickData that is not the one this
     * wall's universe last produced (`universe._lastTickData`, the object `doTick()` returned
     * and every tick listener receives). LO handles restart at 0 in every universe, so a
     * TickData from another world indexes a different wall's count at the same handle; and
     * an earlier TickData of this world would yield a wrong delta.
     * @param {Object} [tickData] — the universe.doTick() result (sample lane).
     * @returns {{ total: number, delta: number }}
     */
    Wall.prototype.getArrivals = function (tickData) {
        var counts = Array.isArray(this.hooks) && this.hooks.indexOf('count') !== -1;
        if (!counts) {
            throw new Error(
                '[Wall.getArrivals] this wall does not COUNT (collisionBehavior "' +
                this.collisionBehavior + '", hooks ' + JSON.stringify(this.hooks || []) +
                ') — the engine increments a wall\'s count only through the `count` hook; ' +
                'add hooks: [\'count\'] (preset \'detector-screen\' = destroy + count).'
            );
        }
        if (!this._arrivals) { this._arrivals = { td: null, total: 0, delta: 0 }; }
        var a = this._arrivals;
        if (tickData != null && tickData !== a.td) {
            if (tickData !== this.universe._lastTickData) {
                throw new Error('[Wall.getArrivals] "' + this.name + '": this is not the TickData its ' +
                    'own universe last produced (universe._lastTickData) — it is another world\'s, ' +
                    'where handle ' + this.lo.handle + ' is a different wall, or an earlier tick of ' +
                    'this one. Sample the TickData this wall\'s universe.doTick() just returned. (FAIL-LOUD.)');
            }
            var handle = this.lo.handle;
            var oc = tickData.objects && tickData.objects[handle];
            if (!oc || typeof oc.count !== 'number') {
                throw new Error('[Wall.getArrivals] "' + this.name + '": this world\'s TickData carries no ' +
                    'objects[' + handle + '].count — every registered LargeObject is marshalled each ' +
                    'tick, so the wall is not registered here. (FAIL-LOUD.)');
            }
            var total = oc.count;
            a.delta = total - a.total;
            a.total = total;
            a.td = tickData;
        }
        return { total: a.total, delta: a.delta };
    };

    /**
     * ABSORB v2 readout: the wall's live { stored, absorbedTotal, radiatedTotal } (the
     * REAL backing-frame mass ledger). Throws on a non-absorb wall. Call between ticks.
     */
    Wall.prototype.getAbsorbStats = function () {
        if (this.collisionBehavior !== 'absorb' || !this._radiationTickFn) {
            throw new Error('[Wall.getAbsorbStats] this wall is not an ABSORB wall (collisionBehavior "' +
                this.collisionBehavior + '").');
        }
        return this._radiationTickFn.stats();
    };

    /**
     * Full teardown: drop the ABSORB radiation host tick-fn from the universe's tick-fn
     * list (so FrqtlApp.setup() reinit does not STACK radiators) + dispose the LO.
     * Idempotent. FrqtlApp.removeObject / setup-teardown call this via the facade.
     */
    Wall.prototype.dispose = function () {
        if (this._disposed) { return; }
        this._disposed = true;
        var u = this.universe;
        if (this._radiationTickFn && u && Array.isArray(u.experimentTickFunctions)) {
            var i = u.experimentTickFunctions.indexOf(this._radiationTickFn);
            if (i !== -1) { u.experimentTickFunctions.splice(i, 1); }
        }
        if (this.lo && typeof this.lo.dispose === 'function') { this.lo.dispose(); }
    };

    /** Clear the accumulated detect histogram (both the y-marginal and the Y×Z grid). */
    Wall.prototype.resetHistogram = function () {
        this._combined = new Map();
        this._grid = new Map();
        this._total = 0;
        // _lastTickData is deliberately NOT reset (the double-consume guard is
        // orthogonal to accumulator state — same discipline as DetectorWall).
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults, palette, builder ──────────

    /**
     * Wall — the first-class WALL primitive (W1). A SUGAR kind (peer of
     * SphereEmitter — NOT a new engine kind):
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
        description: 'A rectangular wall/boundary with a single collision behavior: nothing ' +
            '(pass through), block (stop at the surface), bounce (turn around), absorb (kill + ' +
            'tally + radiate), or destroy (plain kill) — plus the composable mark/count/recolor ' +
            'hooks. The first-class palette face over a LargeObject + actionCompiler op-program ' +
            '— the ONE wall primitive the composites (SlitScreen, DetectorWall) build ' +
            'on. Zero physics of its own.',
        // STUDIO UX presentation contract (A0 vocab, owned at lib/shim/field-descriptor).
        // A wall has a genuine draggable/resizable extent (unlike the two-radii
        // SphereEmitter) → resizable:true (resize zones are 2D; the 3D Hand only moves).
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
                //   the honest AABB catch zone; nothing in lo_to_scope_bag — v2 §1b).
                //   A live edit EXPLICITLY recompiles (setV2Prop → compileWallV2) AND the
                //   renderer draws the shell rotated (no outline of the un-rotated rect).
                //
                //   Layer 2 (what the knob DOES): orientationDeg is the mirror SURFACE angle.
                //   For a bounce/reflect mirror the compiled reflection law is now
                //   ORIENTATION-AWARE (R1, proven exact):
                //     • 0/90/180/270 → the axis-aligned incidence BOX reflector (both faces;
                //       byte-identical at 0 — SU1).
                //     • 45/135/225/315 → the exact swap / swap+negate (+x → +y / +x → −y).
                //     • any α → the fixed tilted-plane reflection R=[cos2α,sin2α;sin2α,−cos2α].
                //   STANDARD OPTICS 2θ LAW: a mirror surface at angle θ DEFLECTS the beam by
                //   2θ, so a +x beam exits at angle 2θ (slope tan2θ). Rotate the mirror to 45°
                //   and a +x beam exits +y (the routing landmark); 15° → slope tan30°;
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
                // ── R2AX — two-axis mirror:
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
            // ── Z-slab (Z1) — a wall's 3D depth/placement. A
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
                derivedFrom: { field: 'rect', tuple: 6, key: 'd' },
                unit: 'px',
                engineVisible: false,
                description: 'The wall\'s z-slab depth (z-extent) in physics pixels — 0 for a flat 2D ' +
                    'wall. Derived from the 6-element rect ' + ValueNormalizer.rectTupleText(6) + '; a real depth makes the ' +
                    'wall a 3D slab (six-face reflect/eject, box render). Edit via the rect field.'
            },
            {
                name: 'z',
                type: 'readonly',
                derivedFrom: { field: 'rect', tuple: 6, key: 'z' },
                unit: 'px',
                engineVisible: false,
                description: 'The wall\'s z placement (near-face … far-face CENTER) in physics pixels ' +
                    '(0 for a 2D wall). Derived from the 6-element rect. Edit via the rect field.'
            },
            // ── Collision LEXICON v2 — the nested behavior/direction/
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
                constraint: { values: shapeValuesMap() },
                engineVisible: false,
                live: true,
                description: 'Render shape hint of the wall\'s visual shell (ball|box|circle|cube|sphere; ' +
                    'render-only). cube/sphere degrade to box/ball in 2D; absent falls back to a rect.'
            }
        ]
    };

    //
    // The first-class wall primitive (W1). Builds a Wall facade over ONE
    // engine-registered LargeObject (Wall.js resolves the collision lexicon to an
    // op-program via actionCompiler), adds its inner LO to the render list, and returns
    // the FACADE (so the Inspector sees kind 'Wall' + the lexicon fields). Honors a
    // palette DROP's click point (ctx.x/ctx.y) exactly as the LargeObject builder
    // does: when the recipe/opts do NOT declare placement, center the wall's rect on
    // the click. A recipe passing an explicit rect / left+top still wins (byte-
    // identical addObject path).
    registerKind(Wall, {
        from: import.meta.url,
        descriptor: WallDescriptor,
        defaults: {
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
        palette: { displayName: 'Wall', category: 'boundary', iconHint: 'wall', rank: 1 },
        build: function (props, ctx, Class) {
            var WallCls = Class;   // the class that registered (a composed fork's own class)

            var opts = {};
            for (var k in props) {
                if (!Object.prototype.hasOwnProperty.call(props, k)) { continue; }
                opts[k] = props[k];
            }
            // Derive the rect from the drop point when the recipe declared no placement.
            if (opts.rect == null && opts.left == null) {
                var ww = (opts.w != null) ? opts.w : 12;
                var wh = (opts.h != null) ? opts.h : 120;
                opts.left = Math.round(ctx.x - ww / 2);
                opts.top  = Math.round(ctx.y - wh / 2);
                opts.w = ww;
                opts.h = wh;
            }
            // R#101 (2026-09-28) — a palette DROP into a 3D scene is a FULL-SCENE-DEPTH slab
            // by default. A bare 4-element rect reaches the engine as z=0/depth=w (the
            // back-compat promotion) — a ~w-thin plate a directed stream walks around in z
            // (measured: 146/300 crossers in 30 ticks, vs ~0 through a full-depth wall). The
            // z-band is CONSUMED from the runner's ONE bounds read (`FrqtlApp.worldBounds`:
            // the TickData boundary_rect ferry once ticked, the init-time initBounds read-back
            // before) — never hand-typed. An explicit z / d / depth / z-carrying rect wins
            // untouched, and the recipe path (no fromPalette) stays byte-identical.
            // 3D-ness is the WORLD's (its resolved axes), never a boot global.
            var u3 = ctx.runner && ctx.runner.universe;
            if (ctx.fromPalette && u3 && u3.activeAxes && u3.activeAxes.z &&
                opts.z === undefined && opts.d === undefined && opts.depth === undefined &&
                !(opts.rect && (Array.isArray(opts.rect)
                    ? opts.rect.length === 6
                    : (opts.rect.z !== undefined || opts.rect.d !== undefined)))) {
                var wb = ctx.runner && ctx.runner.worldBounds;
                if (!wb || typeof wb.near !== 'number' || typeof wb.d !== 'number') {
                    throw new Error('[ObjectFactory] create("Wall"): a 3D palette drop derives its ' +
                        'z-slab from the scene bounds (runner.worldBounds — the TickData ' +
                        'boundary_rect ferry / init-time initBounds read-back), but the runner ' +
                        'publishes none. (FAIL-LOUD — a depth-less wall in a 3D scene is the ' +
                        'z-leak this default repairs.)');
                }
                opts.z = wb.near;
                opts.depth = wb.d;
            }
            // Palette drops are census-numbered like every other numbered drop ('block N',
            // 'sphere emitter N', 'livechart N'): repeated bare drops otherwise all read
            // "wall" in LAYERS and collide in name-based lookups. Recipe path unchanged
            // (no fromPalette => Wall's own bare default; an explicit name always wins).
            if (ctx.fromPalette && opts.name == null) {
                opts.name = 'wall ' + (ctx.runner.largeObjects.length + 1);
            }
            var wall = new WallCls(ctx.runner.universe, opts);
            wall._schemaKind = Class.name;
            return wall;
        }
    });

    // ── Export ───────────────────────────────────────────────────────────
    export { Wall };

