/* Copyright 2023-2026 by Essam Abadir */

/**
 * SlitScreen — Engine-agnostic double-slit barrier.
 *
 * 2D (depth omitted): a wall with two slits made of LargeObjects:
 *   - 3 wall segments (wall1 above slit1, wall2 between slits, wall3 below slit2)
 *   - 2 slit segments (slit1, slit2) with optional detection
 *   - 4 slit liners (top/bottom of each slit) for edge diffraction
 *
 * 3D (depth set — the geometry amendment, "floor to ceiling
 * with cubic holes"): the screen spans the FULL universe cross-section — the SAME
 * floor-to-ceiling y-extent as 2D (unchanged: wall1 starts at y=0, wall3 ends at
 * canvasHeight) PLUS the full z-depth (the fix-loop item-1 render/collision fix) —
 * but the two apertures are now CUBIC HOLES (bounded in BOTH y and z), not full-
 * depth-in-z SLOTS. Built by TILING the wall around each hole: a wall1/wall2/wall3
 * slab spans the full z-depth (no hole in those y-bands), and each hole's own
 * y-band is split into THREE z-tiles — a solid "_near" side (z < holeZmin), the
 * hole itself (z ∈ [holeZmin, holeZmax), still named `slit1`/`slit2` — detection
 * identity preserved), and a solid "_far" side (z > holeZmax). AABB-only — this
 * is exactly why round holes were rejected (§4.1) and cubic holes were ratified:
 * a box aperture is just MORE 6-element rects, zero new collision machinery.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

import { LargeObject } from './LargeObject.js';
import { CollisionTypes } from './CollisionTypes.js';
import { CollisionActions } from './CollisionActions.js';
import * as SlitLinerScatter from '../objects/objects/slitLinerScatter.js';
import { Wall } from './Wall.js';
import { registerKind } from '../objects/kinds.js';
import { ObjectSchema } from '../objects/schema/index.js';

    // ── Imports (Node.js) or globals (browser) ──────────────────────────

    /**
     * DSE LAB / EXPERIMENT LOOP / MATRIX EXTENSION liner scatter — delegates
     * ENTIRELY to `slitLinerScatter.js`, the ONE authority both this constructor
     * (legacy `linerScatter` string, construction-time) AND the `dse-lab` page
     * (LIVE, explicit `{behavior, resetLocalTime}`) push through. See that
     * module's docstring for the full behavior/reset decomposition and the
     * ground-truth physics finding behind the variants.
     */
    function _applyLinerScatter(linerLO, variant, universe, intoCavityDir) {
        SlitLinerScatter.applyLinerScatter(linerLO, universe, intoCavityDir, { slitScatter: variant });
    }

    // ── SlitScreen ────────────────────────────────────────────────────────

    /**
     * Double-slit barrier with edge diffraction liners.
     *
     * 2D: creates five LargeObjects (three wall segments + two slit openings) plus
     * four slit edge liners (9 total, `this.walls.length===9`). 3D (`depth` set):
     * each slit opening becomes a CUBIC HOLE tiled from THREE z-pieces
     * (near-side/hole/far-side), so the wall segment count grows to nine core
     * pieces (wall1, slit1_near/slit1/slit1_far, wall2, slit2_near/slit2/slit2_far,
     * wall3) plus the same four liners (13 total, `this.walls.length===13`) — see
     * the module docstring above. The liners apply `RANDOM_XY` to particles at the
     * very edge of each hole, which produces edge diffraction — a directional
     * scatter that contributes to the emergent interference pattern.
     *
     * ## Physics you can drive
     *
     * **`wavelength`** drives the slit geometry. The default formulas are:
     * ```
     * slitHeight = floor(wavelength * 0.8)   — height of each slit opening
     * gapHeight  = floor(wavelength * 0.8)   — height of the wall between the two slits
     * linerHeight = min(10, floor(slitHeight * 0.2))  — edge diffraction liner depth
     * ```
     * A larger `wavelength` gives taller slits and a wider inter-slit gap, allowing
     * more particles through per tick and increasing the effective slit separation `d`
     * in the interference formula. Pass explicit `slitHeight` / `gapHeight` to decouple
     * the two dimensions independently (e.g. fixed slit size but varying gap).
     *
     * **`detectAtSlits`** sets the measurement mode at each slit opening:
     * - `0` — no detection; slit objects are transparent (collision type `NONE`,
     *   action `MARK` only)
     * - `1` — detect + scatter: collision type `RANDOM_XY` is applied, so the engine
     *   randomly deflects particles that pass through. This is the canonical
     *   "which-slit" measurement — detection disturbs the trajectory.
     * - `2` — detect + color only: action `DETECT` is added and the slit objects are
     *   colored blue for visualization, but collision type stays `NONE` so trajectories
     *   are not disturbed.
     *
     * **`absorbAtSlitWall`**: when true the three wall segments silently absorb any
     * particle that hits them (`ABSORB` action). When false the walls block and reflect
     * particles (`BLOCK` action). Absorption is the default — it prevents reflected
     * particles from re-entering the beam and contaminating the fringe signal.
     *
     * **`this.slit_wall_gap_height`** — the inter-slit gap `d` in the interference
     * formula. Read this field on the returned `SlitScreen` instance to get the
     * actual pixel distance between the two slit centers.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM).
     * @param {number} wallLeft - X position (left edge) of the slit screen (physics px).
     * @param {number} wallWidth - Thickness of the slit screen (physics px).
     * @param {number} canvasHeight - Full height of the simulation area (physics px).
     * @param {number} wavelength - Geometry master knob: drives slit height, gap height,
     *   and liner depth (see formulas above).
     * @param {boolean} absorbAtSlitWall - If true, wall segments absorb particles
     *   (ABSORB action); if false, they block/reflect (BLOCK action).
     * @param {number} detectAtSlits - Measurement mode at slit openings:
     *   0=none, 1=detect+scatter (RANDOM_XY), 2=detect+color only.
     * @param {number} [slitHeight] - Override slit opening height
     *   (default: `floor(wavelength * 0.8)`).
     * @param {number} [gapHeight] - Override inter-slit wall height
     *   (default: `floor(wavelength * 0.8)`).
     * @param {number} [depth] - when provided, the screen becomes a 3D
     *   floor-to-ceiling wall (full z-depth `[-depth/2, +depth/2]`) tiled around two
     *   CUBIC HOLE apertures (the geometry amendment — supersedes the earlier
     *   full-depth-SLOT construction). `wall1`/`wall2`/`wall3` (no hole in
     *   their y-band) become 6-element rects spanning the FULL z-depth; `slit1`/
     *   `slit2` (still the detection identity) become 6-element rects bounded in
     *   BOTH y (unchanged from 2D) AND z (`holeDepth`, centered on z=0) — plus two
     *   new solid side tiles per hole (`slit1_near`/`slit1_far`, `slit2_near`/
     *   `slit2_far`) filling the rest of that y-band's z-span. OMITTED (default) →
     *   every rect stays the LEGACY 4-element `[left,top,w,h]` array, byte-identical
     *   to pre-B1/pre-amendment 2D behavior (no new code path executed at all).
     * @param {number} [holeDepth] - 3D only: the z-extent of each cubic hole
     *   (centered on z=0, i.e. `[-holeDepth/2, +holeDepth/2)`). Default: the
     *   EFFECTIVE `slit_height` (respects a `slitHeight` override), so the default
     *   aperture is square-ish in the y×z plane (e.g. wavelength=64 → slit_height=51
     *   → a 51×51 hole); pass an explicit
     *   value to decouple the hole's z-extent from its y-extent. Ignored when
     *   `depth` is omitted.
     * @param {'current'|'noreset'|'symmetric'|'combined'|'bounce'|'ejectY'|'ejectYReflect'} [linerScatter='current']
     *   Legacy compound scatter-variant string — resolved by `slitLinerScatter.js`'s
     *   `LEGACY_VARIANT_MAP` (the ONE authority for the behavior×resetLocalTime
     *   decomposition; see that module's docstring). `'current'` (default, OMIT to
     *   keep it) is the no-op sentinel — today's exact compiled `RANDOM_XY`,
     *   byte-identical, the ratified 2D golden depends on it. The other
     *   variants push a composed replacement op-program LIVE via
     *   `universe.updateObjectProperty` — the SAME mechanism the `dse-lab` page's
     *   LIVE `behavior`/`resetLocalTime` controls use (DSE LAB, 2026-07-13).
     */
    function SlitScreen(universe, wallLeft, wallWidth, canvasHeight, wavelength, absorbAtSlitWall, detectAtSlits, slitHeight, gapHeight, depth, holeDepth, linerScatter) {
        this.universe = universe;
        this._schemaKind = this.constructor.name;
        this.wavelength = wavelength;
        this.depth = (depth !== undefined && depth !== null) ? depth : null;
        // 'current' (default/omitted) = today's exact liner behavior, byte-identical.
        // See slitLinerScatter.js's LEGACY_VARIANT_MAP for the full decomposition.
        this.linerScatter = linerScatter || 'current';

        // ── Geometry (y-axis) — UNCHANGED by the cubic-hole amendment in EITHER
        // mode: "floor to ceiling" was already satisfied here (wall1
        // starts at y=0, wall3 ends at canvasHeight — confirmed by ground-truth,
        // fix-loop item 1); only the APERTURE shape changes in 3D (§ below).
        this.slit_height = (slitHeight !== undefined) ? slitHeight : Math.floor(wavelength * 0.8);
        this.slit_wall_gap_height = (gapHeight !== undefined) ? gapHeight : Math.floor(wavelength * 0.8);
        this.slit_group_height = this.slit_height + this.slit_wall_gap_height + this.slit_height;
        this.slit_group_center_y = canvasHeight / 2;
        this.slit1_top = this.slit_group_center_y - this.slit_group_height / 2;
        this.slit_wall_gap_top = this.slit1_top + this.slit_height;
        this.slit2_bottom = this.slit_group_center_y + this.slit_group_height / 2;
        this.slit2_top = this.slit2_bottom - this.slit_height;
        this.slit_group_left = wallLeft;
        this.slit_width = wallWidth;
        this.bottom_wall_height = canvasHeight - this.slit2_bottom;

        // The geometry amendment: cubic-hole z-extent, centered
        // on z=0. Default = the EFFECTIVE slit_height (square-ish aperture at the
        // default wavelength=64 -> slit_height=51 -> a 51x51 hole) — overridable to
        // decouple the hole's z-extent from its y-extent. 2D-inert (unused).
        this.hole_depth = (holeDepth !== undefined && holeDepth !== null) ? holeDepth : this.slit_height;

        // ── Collision config ─────────────────────────────────────────────
        var wall_collision_actions = absorbAtSlitWall
            ? [CollisionActions.ABSORB]
            : [CollisionActions.BLOCK];
        var wall_collision_type = CollisionTypes.NONE;

        // The three plain wall SEGMENTS (wall1/wall2/wall3) are built through the unified
        // Wall primitive. `destroy`/`block` compile the BYTE-IDENTICAL op-programs these
        // segments produced under the legacy `absorb`/`block` vocabulary (verified
        // program-for-program), so the port moves ZERO physics. The SLITS (MARK/RANDOM_XY
        // detectors) and LINERS (RANDOM_XY scatter) are NOT plain walls — they stay
        // LargeObjects. `_wallLO(rect,name,color)` returns the Wall's inner engine LO so
        // `this.walls` keeps holding LargeObjects (downstream — grouping, updateGapHeight,
        // the runner auto-wire — is untouched).
        var _segmentBehavior = absorbAtSlitWall ? 'destroy' : 'block';
        var _wallUniverse = universe;
        function _wallLO(rect, name, color) {
            return new Wall(_wallUniverse, { rect: rect, collisionBehavior: _segmentBehavior,
                                             name: name, color: color }).lo;
        }

        var detector_actions = [CollisionActions.MARK];
        var detector_type = CollisionTypes.NONE;
        var slit1_color = [0, 0, 0, 0];
        var slit2_color = [0, 0, 0, 0];

        if (detectAtSlits === 1) {
            detector_actions.push(CollisionActions.DETECT);
            detector_type = CollisionTypes.RANDOM_XY;
        }
        if (detectAtSlits === 2) {
            detector_actions.push(CollisionActions.DETECT);
            slit1_color = [0, 0, 255];
            slit2_color = [0, 0, 255];
        }

        var liner_height = Math.min(10, Math.floor(this.slit_height * 0.2));
        var _depth = this.depth;

        if (_depth === null) {
            // ═══ 2D — EXACT pre-amendment construction, byte-identical ═══
            // (rect3 here is a plain pass-through; kept as a named local so this
            // branch reads identically to the historical code it replaces.)
            function rect3(left, top, w, h) { return [left, top, w, h]; }

            // Wall above slit1
            this.wall1 = _wallLO(
                rect3(this.slit_group_left, 0, this.slit_width, this.slit1_top - 1),
                'wall1', [255, 0, 0]
            );

            // Slit 1 (2D: a plain y-only slot, unchanged)
            this.slit1 = new LargeObject(
                universe,
                rect3(this.slit_group_left, this.slit1_top, this.slit_width, this.slit_height - 1),
                detector_type, detector_actions, 'slit1',
                'closest', null, 1, slit1_color
            );

            // Wall between slits
            this.wall2 = _wallLO(
                rect3(this.slit_group_left, this.slit_wall_gap_top, this.slit_width, this.slit_wall_gap_height - 1),
                'wall2', [128, 0, 0]
            );

            // Slit 2
            this.slit2 = new LargeObject(
                universe,
                rect3(this.slit_group_left, this.slit2_top, this.slit_width, this.slit_height - 1),
                detector_type, detector_actions, 'slit2',
                'closest', null, 1, slit2_color
            );

            // Wall below slit2
            this.wall3 = _wallLO(
                rect3(this.slit_group_left, this.slit2_bottom, this.slit_width, this.bottom_wall_height - 1),
                'wall3', [255, 0, 0]
            );

            // ── Slit liners (edge diffraction) ───────────────────────────
            var slit1_liner_top = new LargeObject(
                universe,
                rect3(this.slit_group_left, this.slit1_top, this.slit_width, liner_height),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit1_liner_top',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit1_liner_top, this.linerScatter, universe, 'bottom'); // "_top" liner -> into-cavity = bottom

            var slit1_liner_bottom = new LargeObject(
                universe,
                rect3(this.slit_group_left, this.slit1_top + this.slit_height - liner_height, this.slit_width, liner_height),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit1_liner_bottom',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit1_liner_bottom, this.linerScatter, universe, 'top'); // "_bottom" liner -> into-cavity = top

            var slit2_liner_top = new LargeObject(
                universe,
                rect3(this.slit_group_left, this.slit2_top, this.slit_width, liner_height),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit2_liner_top',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit2_liner_top, this.linerScatter, universe, 'bottom'); // "_top" liner -> into-cavity = bottom

            var slit2_liner_bottom = new LargeObject(
                universe,
                rect3(this.slit_group_left, this.slit2_top + this.slit_height - liner_height, this.slit_width, liner_height),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit2_liner_bottom',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit2_liner_bottom, this.linerScatter, universe, 'top'); // "_bottom" liner -> into-cavity = top

            this.walls = [
                this.wall1, this.slit1, this.wall2, this.slit2, this.wall3,
                slit1_liner_top, slit1_liner_bottom,
                slit2_liner_top, slit2_liner_bottom
            ];

        } else {
            // ═══ 3D — CUBIC HOLES (the geometry amendment) ═══
            // Tile the wall around each hole: wall1/wall2/wall3 (no hole in their
            // y-band) span the FULL z-depth; each hole's own y-band splits into
            // THREE z-tiles — a solid "_near" side (z < holeZmin), the hole itself
            // (still named slit1/slit2 — detection identity preserved, now bounded
            // in z too), and a solid "_far" side (z > holeZmax). Exact z-partition,
            // no gaps/overlaps: near.z=[zLo,holeZlo), hole.z=[holeZlo,holeZhi),
            // far.z=[holeZhi,zLo+depth) — verified by slit-family-depth.test.mjs.
            var zLo = -_depth / 2;                       // full screen z-min
            var holeZlo = -this.hole_depth / 2;           // hole z-min (centered)
            var holeZspan = this.hole_depth;
            var farZlo = holeZlo + holeZspan;             // = +hole_depth/2
            var nearZspan = holeZlo - zLo;                // z < holeZmin side-tile depth
            var farZspan = (_depth / 2) - farZlo;          // z > holeZmax side-tile depth

            function zSlab(left, top, w, h) { return [left, top, zLo, w, h, _depth]; }
            function zBand(left, top, w, h, zb, zs) { return [left, top, zb, w, h, zs]; }

            // Wall above slit1 (no hole in this y-band -> full z-depth)
            this.wall1 = _wallLO(
                zSlab(this.slit_group_left, 0, this.slit_width, this.slit1_top - 1),
                'wall1', [255, 0, 0]
            );

            // Hole 1's y-band, split into near/hole/far along z.
            this.slit1_near = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit1_top, this.slit_width, this.slit_height - 1, zLo, nearZspan),
                CollisionTypes.NONE, wall_collision_actions, 'slit1_near',
                'closest', null, 1, [200, 60, 60]
            );
            this.slit1 = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit1_top, this.slit_width, this.slit_height - 1, holeZlo, holeZspan),
                detector_type, detector_actions, 'slit1',
                'closest', null, 1, slit1_color
            );
            this.slit1_far = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit1_top, this.slit_width, this.slit_height - 1, farZlo, farZspan),
                CollisionTypes.NONE, wall_collision_actions, 'slit1_far',
                'closest', null, 1, [200, 60, 60]
            );

            // Wall between slits (no hole in this y-band -> full z-depth)
            this.wall2 = _wallLO(
                zSlab(this.slit_group_left, this.slit_wall_gap_top, this.slit_width, this.slit_wall_gap_height - 1),
                'wall2', [128, 0, 0]
            );

            // Hole 2's y-band, split into near/hole/far along z.
            this.slit2_near = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit2_top, this.slit_width, this.slit_height - 1, zLo, nearZspan),
                CollisionTypes.NONE, wall_collision_actions, 'slit2_near',
                'closest', null, 1, [200, 60, 60]
            );
            this.slit2 = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit2_top, this.slit_width, this.slit_height - 1, holeZlo, holeZspan),
                detector_type, detector_actions, 'slit2',
                'closest', null, 1, slit2_color
            );
            this.slit2_far = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit2_top, this.slit_width, this.slit_height - 1, farZlo, farZspan),
                CollisionTypes.NONE, wall_collision_actions, 'slit2_far',
                'closest', null, 1, [200, 60, 60]
            );

            // Wall below slit2 (no hole in this y-band -> full z-depth)
            this.wall3 = _wallLO(
                zSlab(this.slit_group_left, this.slit2_bottom, this.slit_width, this.bottom_wall_height - 1),
                'wall3', [255, 0, 0]
            );

            // ── Slit liners (edge diffraction) — z-bounded to the hole's OWN
            // z-range: edge diffraction only applies at the aperture, not at the
            // solid side-tiles (there is no opening there to diffract around). ──
            var slit1_liner_top = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit1_top, this.slit_width, liner_height, holeZlo, holeZspan),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit1_liner_top',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit1_liner_top, this.linerScatter, universe, 'bottom'); // "_top" liner -> into-cavity = bottom

            var slit1_liner_bottom = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit1_top + this.slit_height - liner_height, this.slit_width, liner_height, holeZlo, holeZspan),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit1_liner_bottom',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit1_liner_bottom, this.linerScatter, universe, 'top'); // "_bottom" liner -> into-cavity = top

            var slit2_liner_top = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit2_top, this.slit_width, liner_height, holeZlo, holeZspan),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit2_liner_top',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit2_liner_top, this.linerScatter, universe, 'bottom'); // "_top" liner -> into-cavity = bottom

            var slit2_liner_bottom = new LargeObject(
                universe,
                zBand(this.slit_group_left, this.slit2_top + this.slit_height - liner_height, this.slit_width, liner_height, holeZlo, holeZspan),
                CollisionTypes.RANDOM_XY, [CollisionActions.BLOCK], 'slit2_liner_bottom',
                'closest', null, 1, [0, 0, 255]
            );
            _applyLinerScatter(slit2_liner_bottom, this.linerScatter, universe, 'top'); // "_bottom" liner -> into-cavity = top

            this.walls = [
                this.wall1,
                this.slit1_near, this.slit1, this.slit1_far,
                this.wall2,
                this.slit2_near, this.slit2, this.slit2_far,
                this.wall3,
                slit1_liner_top, slit1_liner_bottom,
                slit2_liner_top, slit2_liner_bottom
            ];
        }

        // ── Render shape (renderer-only hint; physics unaffected)
        // The Tube.js precedent (FRQTL-MAINT 2026-07-01): a
        // 6-element rect gives the ENGINE a real z-slab, but `_buildLoMesh`
        // (three-provider.js) only wraps an LO in a 3D BoxGeometry when it
        // ALSO carries the render-only `lo.shape='box'` + `lo.depth` hint —
        // omitting it (as B1 did) left every wall a flat zero-thickness
        // PlaneGeometry despite its correct 6-element engine rect. Only set
        // when `depth` was actually requested (`rect.d` is only present then;
        // a legacy 2D LO gets a 4-element rect with no `.d` and is untouched).
        for (var _si = 0; _si < this.walls.length; _si++) {
            if (this.walls[_si].rect.d !== undefined) {
                this.walls[_si].shape = 'box';
                this.walls[_si].depth = this.walls[_si].rect.d;
            }
        }

        // THE ONE UP-LINK on every LO this screen composed (a drawn wall resolves to the screen).
        for (var _wi = 0; _wi < this.walls.length; _wi++) {
            this.walls[_wi]._owner = this;   // THE ONE UP-LINK: the screen composed each LO
        }
    }

    /**
     * Full teardown of what this screen composed: every wall, slit and liner LO leaves the
     * world (dispose IS the removal). Idempotent (LargeObject.dispose guards itself).
     */
    SlitScreen.prototype.dispose = function () {
        for (var i = 0; i < this.walls.length; i++) { this.walls[i].dispose(); }
    };

    /**
     * LIVE slit-gap update — recomputes
     * every affected 2D wall/slit/liner rect (mirroring the constructor's OWN 2D
     * geometry formulas, one authority, no schema-mirror) and pushes each via
     * `runner.updateObjectProperty(lo, 'rect', [left,top,w,h])` — the SAME S3/S4
     * live-drag accessor path `AuthorView.jsx`'s overlay-drag code already calls
     * (mirrors/mutates the JS-side Rectangle wrapper AND forwards to the engine ABI;
     * deliberately NOT a hand-rolled Rectangle-setter mirror, which would risk
     * drifting from that canonical accessor's own setter-order discipline).
     *
     * Only `slit_wall_gap_height` changes; `slit_height`/`wavelength`/`slit_width`/
     * `slit_group_left` and the group's vertical CENTER (`slit_group_center_y`,
     * always `canvasHeight/2`) are invariants of a gap-only change — growing/
     * shrinking the gap symmetrically re-centers `slit1_top`/`slit2_top` and
     * reshapes `wall1`/`wall2`/`wall3`'s heights, exactly as the constructor would
     * compute for that `gapHeight` from scratch.
     *
     * 3D (`this.depth !== null`) is NOT supported live — the cubic-hole z-tiling
     * (the geometry amendment) adds ~13 LOs (near/far z-tiles per hole, wall1-3
     * z-spanning tiles) whose z-partition math would need the identical live-update
     * treatment; not built. Returns `false` so the caller falls
     * back to a reinit reload — name this explicitly rather than silently no-op.
     *
     * @param {number} newGapHeight - the new `slit_wall_gap_height` (px).
     * @param {Object} runner - an FrqtlApp exposing `updateObjectProperty(lo,prop,value)`.
     * @returns {boolean} true if the live update was applied; false if 3D (caller must reinit).
     */
    SlitScreen.prototype.updateGapHeight = function (newGapHeight, runner) {
        if (this.depth !== null) {
            return false; // 3D: structurally out of scope for a live update (see docstring above) — reinit.
        }
        if (!runner || typeof runner.updateObjectProperty !== 'function') {
            throw new Error('[SlitScreen.updateGapHeight] requires a runner exposing updateObjectProperty(lo, prop, value).');
        }

        // slit_group_center_y = canvasHeight / 2 is a constructor invariant (never
        // moves with gapHeight) — derive canvasHeight from it rather than storing a
        // second field that could drift.
        var canvasHeight = this.slit_group_center_y * 2;

        this.slit_wall_gap_height = newGapHeight;
        this.slit_group_height    = this.slit_height + this.slit_wall_gap_height + this.slit_height;
        this.slit1_top            = this.slit_group_center_y - this.slit_group_height / 2;
        this.slit_wall_gap_top    = this.slit1_top + this.slit_height;
        this.slit2_bottom         = this.slit_group_center_y + this.slit_group_height / 2;
        this.slit2_top            = this.slit2_bottom - this.slit_height;
        this.bottom_wall_height   = canvasHeight - this.slit2_bottom;

        var liner_height = Math.min(10, Math.floor(this.slit_height * 0.2));
        var left = this.slit_group_left, w = this.slit_width;

        function findWall(walls, name) {
            for (var i = 0; i < walls.length; i++) { if (walls[i].name === name) return walls[i]; }
            return null;
        }

        var wall1 = findWall(this.walls, 'wall1');
        if (wall1) runner.updateObjectProperty(wall1, 'rect', [left, 0, w, this.slit1_top - 1]);

        var slit1 = findWall(this.walls, 'slit1');
        if (slit1) runner.updateObjectProperty(slit1, 'rect', [left, this.slit1_top, w, this.slit_height - 1]);

        var wall2 = findWall(this.walls, 'wall2');
        if (wall2) runner.updateObjectProperty(wall2, 'rect', [left, this.slit_wall_gap_top, w, this.slit_wall_gap_height - 1]);

        var slit2 = findWall(this.walls, 'slit2');
        if (slit2) runner.updateObjectProperty(slit2, 'rect', [left, this.slit2_top, w, this.slit_height - 1]);

        var wall3 = findWall(this.walls, 'wall3');
        if (wall3) runner.updateObjectProperty(wall3, 'rect', [left, this.slit2_bottom, w, this.bottom_wall_height - 1]);

        var s1lt = findWall(this.walls, 'slit1_liner_top');
        if (s1lt) runner.updateObjectProperty(s1lt, 'rect', [left, this.slit1_top, w, liner_height]);

        var s1lb = findWall(this.walls, 'slit1_liner_bottom');
        if (s1lb) runner.updateObjectProperty(s1lb, 'rect', [left, this.slit1_top + this.slit_height - liner_height, w, liner_height]);

        var s2lt = findWall(this.walls, 'slit2_liner_top');
        if (s2lt) runner.updateObjectProperty(s2lt, 'rect', [left, this.slit2_top, w, liner_height]);

        var s2lb = findWall(this.walls, 'slit2_liner_bottom');
        if (s2lb) runner.updateObjectProperty(s2lb, 'rect', [left, this.slit2_top + this.slit_height - liner_height, w, liner_height]);

        return true;
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults, builder ──────────

    /**
     * SlitScreen — Double-slit barrier (group: 3 wall segments + 2 slit segments + 4 liners = 9 sub-objects).
     * Constructor: SlitScreen(universe, wallLeft, wallWidth, canvasHeight, wavelength,
     *                         absorbAtSlitWall, detectAtSlits, slitHeight, gapHeight)
     * Group wrapper: all 9 sub-LargeObjects are stamped with the ONE up-link `_owner` = <this>.
     */
    var SlitScreenDescriptor = {
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

    registerKind(SlitScreen, {
        from: import.meta.url,
        descriptor: SlitScreenDescriptor,
        defaults: {
        slit_group_left: 100,
        slit_width: 8,
        wavelength: 20,
        slit_height: 16,
        slit_wall_gap_height: 16,
        absorbAtSlitWall: true,
        detectAtSlits: 0
        },
        build: function (props, ctx, Class) {
            var SS = Class;   // the class that registered (a composed fork's own class)
            var ph = ObjectSchema.worldRect(ctx.runner.canvas_rect, 'ObjectFactory create(\"SlitScreen\") runner.canvas_rect').h;
            var screen = new SS(
                ctx.runner.universe,
                props.slit_group_left != null ? props.slit_group_left : Math.round(ctx.x),
                props.slit_width      || 8,
                ph,
                props.wavelength      || 20,
                props.absorbAtSlitWall != null ? props.absorbAtSlitWall : true,
                props.detectAtSlits    != null ? props.detectAtSlits    : 0,
                props.slit_height,
                props.slit_wall_gap_height
            );
            screen._schemaKind = Class.name;
            return screen;
        }
    });

    // ── Export ───────────────────────────────────────────────────────────

    export { SlitScreen };

