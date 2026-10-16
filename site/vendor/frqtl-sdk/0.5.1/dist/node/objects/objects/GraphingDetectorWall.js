/* Copyright 2023-2026 by Essam Abadir */

/**
 * GraphingDetectorWall — a Detector Screen that PAINTS ITS OWN HIT GRID onto its
 * own faces (ws-experiments-walkthrough, presentation pass Item 1; CEO ruling
 * "the spatial hitmap IS the chart").
 *
 *     var screen = new GraphingDetectorWall(universe, {
 *         rect: [236, 0, -77, 20, 600, 154], name: 'screen', binPx: 12
 *     });
 *
 * ── The contract in one line ────────────────────────────────────────────────
 *
 * The in-scene instrument is a CHART-FREE, SPATIALLY REGISTERED HEATMAP: a hot
 * cell sits exactly where the counted collisions physically occurred. There is
 * no chart chrome on the wall — no axes, ticks, labels, legends or margins; the
 * bin rectangles fill the face edge-to-edge through ONE owned linear map. THE
 * WALL IS THE AXIS. Chart analysis of the same data (marginals, ledgers,
 * topology scatter) stays fully available SEPARATELY in the DOM panel lane
 * (Chart.js, lib/components/live-chart-wiring) — that lane is untouched.
 *
 * ── Layer 1: API contract ───────────────────────────────────────────────────
 *
 * `new GraphingDetectorWall(universe, opts)` — EXTENDS `Wall` (prototype chain),
 * so every Wall option, live method and property accessor applies verbatim.
 * When neither `preset` nor `collisionBehavior` is supplied it defaults to the
 * `detector-screen` preset (destroy + count) — the counting authority. Extra
 * options, all DECLARED descriptor fields (so a codegen Restart round-trip
 * rebuilds the heatmap wall from captured state — the W2 declared-field rule):
 *
 *   @param {number} [opts.binPx=12]     — face bin size in physics pixels. Bins
 *     are anchored at the FACE ORIGIN (its top / near-z corner), so the map runs
 *     edge-to-edge with no partial bin hanging off the leading edge.
 *   @param {number} [opts.refreshMs=100] — repaint throttle (ms). Accumulation
 *     is per-tick and un-throttled; only the repaint is gated.
 *   @param {number} [opts.heatBase=0.35] — opacity (0..1) of the ramp's ZERO
 *     colour washed under the bins, so an un-hit face still reads as a plate and
 *     intensity rises monotonically from empty through every bin.
 *
 * Readouts: `getCollisionHistogram()` / `resetHistogram()` / `getLiveCount()` —
 * inherited from `Wall`, UNCHANGED. `heatCanvas()` returns the ferry canvas.
 *
 * ── ESTIMATION BEFORE RUNNING: when will this plate have counted anything? ───
 *
 * A plate reads `{"total":0}` for as long as nothing has crossed the distance to it, and
 * that is not a fault — it is arithmetic you can do BEFORE the run:
 *
 *     ticks ≈ (distance from the source to this plate, px) ÷ the source preset's
 *             EFFECTIVE FORWARD SPEED (px/tick)
 *
 * The per-preset speeds are MEASURED and tabulated on the source that emits at you —
 * see `SphereEmitter.js`, "ESTIMATION BEFORE RUNNING" (`particle-walk` 1.00, `laser`
 * ~0.99, `hemisphere` 0.65 in 2D / 0.49 in 3D; the isotropic `spherical`/`drum` presets
 * have no forward axis and expand radially at ~1.00). Worked: a `hemisphere` source 350 px
 * upstream in 3D ⇒ 350 ÷ 0.49 ≈ 700 ticks before the MEAN of the population arrives — so a
 * 300-tick run legitimately counts zero, and the fix is more ticks or less distance, not a
 * different wall.
 *
 * It is a random walk's mean, not a wavefront: the first counts land earlier and the bulk
 * later. `binPx` changes the RESOLUTION of what you see, never when you see it.
 *
 * ── The ONE grid authority, consumed — never re-derived ─────────────────────
 *
 * The painter reads the SAME bag `Wall.gridAdd` accumulates
 * (`Wall.js` — `getCollisionHistogram()` → `{combined, grid, total}`): per tick
 * it calls the DRAIN lane `getCollisionHistogram(tickData)` exactly once (the
 * #61 once-per-tick discipline the wall itself enforces), and paints from the
 * no-arg PURE READ. It never scans frames, never touches the engine RNG, and
 * never keeps a second accumulator.
 *
 * IMPORTANT (FAIL-LOUD by construction): a wall's collided-frame buffer may be
 * drained by exactly ONE consumer per tick. A scene that puts a `LiveChart` on
 * a GraphingDetectorWall would hit the wall's OWN double-consume guard. Choose
 * one instrument per detector: the in-scene heatmap OR the DOM chart.
 *
 * ── Layer 2: physics behaviour ──────────────────────────────────────────────
 *
 * ZERO physics (SU1). This object adds no collision logic: counting + destroy is
 * Wall's already-compiled op-program (canonical bench LO7 MARK+COUNT), and the
 * painter is a pure between-tick READER plus a canvas draw at the output
 * boundary. It cannot move a bench golden.
 */

(function () {
    'use strict';

    // ── Imports (Node) / globals (browser) ──────────────────────────────────
    var WallCls, _HeatColormapNode;
    if (typeof module !== 'undefined' && module.exports) {
        WallCls = require('./Wall').Wall;
        _HeatColormapNode = require('../../../shim/render/heat-colormap.js');
    } else {
        WallCls = window.Wall;
    }

    /**
     * Resolve the ONE count→intensity ramp (lib/shim/render/heat-colormap.js).
     * Named FAIL-LOUD guard — the same idiom actionCompiler.js uses for
     * `window.AstSchema` (never a relative ES import across the /frqtl ↔
     * /lib/shim mount boundary).
     */
    function _getHeatColormap() {
        if (_HeatColormapNode) { return _HeatColormapNode; }
        if (typeof window !== 'undefined' && window.HeatColormap) { return window.HeatColormap; }
        throw new Error('[GraphingDetectorWall] window.HeatColormap not available — ensure ' +
            'lib/shim/render/heat-colormap.js is loaded (stack-boot.js ENGINE array). (FAIL-LOUD.)');
    }

    // ── The ONE linear cell→face map (pure; exported for the conformance test) ──

    /** Largest heat-canvas edge in device pixels (a texture, not a screenshot). */
    var MAX_CANVAS_PX = 512;
    /** Canvas width used when the wall has NO z-slab (one full-width z bucket). */
    var FLAT_CANVAS_W = 64;

    /**
     * faceSpec(rect, binPx) — the wall's BROAD-FACE coordinate system + the heat
     * canvas resolution, derived from the LO rect.
     *
     * The instrument's data axes are the grid's own axes: HORIZONTAL = z,
     * VERTICAL = y (`Wall.gridAdd(grid, y, z)`). For the canonical detector
     * screen (thin along x) those ARE the broad face's two axes, so the map is
     * an exact spatial registration. A wall with NO z-slab has a single
     * z-bucket, so its heatmap is one full-width column per y bin — the honest
     * painting of the only spatial information a 2D scene carries.
     *
     * @param {Array|Object} rect — the LO rect ([l,t,w,h] / [l,t,z,w,h,d] /
     *   {left,top,w,h[,z,d]} — the shape a codegen round-trip captures).
     * @param {number} binPx
     * @returns {{top:number,height:number,z0:number,depth:number,binPx:number,
     *            canvasW:number,canvasH:number}}
     */
    function faceSpec(rect, binPx) {
        var top, height, z0 = 0, depth = 0;
        if (Array.isArray(rect)) {
            if (rect.length >= 6) { top = rect[1]; z0 = rect[2]; height = rect[4]; depth = rect[5]; }
            else { top = rect[1]; height = rect[3]; }
        } else if (rect) {
            top = rect.top; height = rect.h;
            if (typeof rect.z === 'number') { z0 = rect.z; }
            if (typeof rect.d === 'number') { depth = rect.d; }
        }
        top = Number(top) || 0;
        height = Math.max(1, Number(height) || 1);
        depth = Math.max(0, Number(depth) || 0);
        var b = (typeof binPx === 'number' && binPx > 0) ? binPx : 12;
        var scale = Math.min(1, MAX_CANVAS_PX / Math.max(height, depth || 1));
        return {
            top: top, height: height, z0: z0, depth: depth, binPx: b,
            canvasW: (depth > 0) ? Math.max(1, Math.round(depth * scale)) : FLAT_CANVAS_W,
            canvasH: Math.max(1, Math.round(height * scale))
        };
    }

    /**
     * binStart(v, origin, binPx) — the world coordinate of the bin containing `v`,
     * anchored at the FACE ORIGIN (not at world 0). Anchoring at the face is what
     * keeps the map edge-to-edge: a face whose z-range starts at −77 with 12px bins
     * would otherwise open with a partial bin hanging off the canvas. One helper,
     * used by BOTH the binner and the map, so they can never disagree.
     */
    function binStart(v, origin, binPx) {
        return origin + Math.floor((Number(v) - origin) / binPx) * binPx;
    }

    /**
     * heatCellRect(spec, y, z) — THE map. One grid cell (world y, world z) → its
     * rectangle on the heat canvas, in canvas pixels. Pure + exported so the
     * conformance test asserts painted positions against THIS function rather
     * than hand-copied coordinates.
     *
     * @param {object} spec — a faceSpec() result.
     * @param {number} y — world y of the hit (physics px).
     * @param {number} z — world z of the hit (physics px; ignored when depth 0).
     * @returns {{x:number,y:number,w:number,h:number}}
     */
    function heatCellRect(spec, y, z) {
        var b = spec.binPx;
        var sy = spec.canvasH / spec.height;
        var yb = binStart(y, spec.top, b);
        var out = { x: 0, y: (yb - spec.top) * sy, w: spec.canvasW, h: b * sy };
        if (spec.depth > 0) {
            var sx = spec.canvasW / spec.depth;
            var zb = binStart(z, spec.z0, b);
            out.x = (zb - spec.z0) * sx;
            out.w = b * sx;
        }
        return out;
    }

    /**
     * binGrid(grid, spec) — fold the wall's Y×Z grid into binned cells + the peak
     * count, through the SAME `binStart` the map uses. Pure; exported for the unit test.
     * @param {Map<number,Map<number,number>>} grid
     * @param {object} spec — a faceSpec() result.
     * @returns {{cells:Array<{y:number,z:number,v:number}>, maxV:number}}
     */
    function binGrid(grid, spec) {
        var cells = [], maxV = 0;
        if (!grid || typeof grid.forEach !== 'function') { return { cells: cells, maxV: maxV }; }
        var b = spec.binPx;
        var acc = new Map();
        grid.forEach(function (byZ, y) {
            if (!byZ || typeof byZ.forEach !== 'function') { return; }
            var yb = binStart(y, spec.top, b);
            byZ.forEach(function (count, z) {
                var zb = (spec.depth > 0) ? binStart(z, spec.z0, b) : spec.z0;
                var key = yb + ',' + zb;
                acc.set(key, (acc.get(key) || 0) + (Number(count) || 0));
            });
        });
        acc.forEach(function (v, key) {
            var p = key.split(',');
            if (v > maxV) { maxV = v; }
            cells.push({ y: Number(p[0]), z: Number(p[1]), v: v });
        });
        return { cells: cells, maxV: maxV };
    }

    /**
     * paintHeatmap(ctx, spec, grid, opts) — draw the registered heatmap: a base
     * wash of the wall's own colour, then ONE `fillRect` per non-empty bin at
     * `heatCellRect`'s position, coloured by the shared ramp at count/peak.
     * No axes, no labels, no margins (the wall IS the axis).
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} spec — a faceSpec() result.
     * @param {Map} grid — the Wall's Y×Z grid.
     * @param {object} [opts] — { heatBase:number }
     * @returns {number} the number of bins painted (observability).
     */
    function paintHeatmap(ctx, spec, grid, opts) {
        opts = opts || {};
        var CM = _getHeatColormap();
        var heatColor = CM.heatColor;
        // The base wash is the ramp's ZERO colour, so intensity rises MONOTONICALLY
        // from an un-hit face through every bin: a lightly-hit cell can never read
        // darker (or hotter) than empty wall. Painting the wall's own colour here
        // instead breaks that ordering — measured in the realm: a green plate wash
        // sat BETWEEN the ramp's cold and warm ends, so a sparse bin looked like a
        // hole. `heatBase` is the wash's opacity (0 = a fully transparent face).
        var zero = CM.heatRgb(0);
        var baseA = (typeof opts.heatBase === 'number') ? opts.heatBase : 0.35;
        ctx.clearRect(0, 0, spec.canvasW, spec.canvasH);
        ctx.fillStyle = 'rgba(' + zero[0] + ',' + zero[1] + ',' + zero[2] + ',' + baseA + ')';
        ctx.fillRect(0, 0, spec.canvasW, spec.canvasH);
        var binned = binGrid(grid, spec);
        for (var i = 0; i < binned.cells.length; i++) {
            var c = binned.cells[i];
            var r = heatCellRect(spec, c.y, c.z);
            ctx.fillStyle = heatColor(binned.maxV > 0 ? c.v / binned.maxV : 0);
            ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        return binned.cells.length;
    }

    // ── The object ───────────────────────────────────────────────────────────

    function _num(v, dflt) { return (typeof v === 'number' && isFinite(v)) ? v : dflt; }

    function GraphingDetectorWall(universe, opts) {
        opts = opts || {};
        // Default to the Detector Screen preset (destroy + count) — this object IS a
        // counting detector; an explicit preset/collisionBehavior still wins.
        if (opts.preset === undefined && opts.collisionBehavior === undefined) {
            var merged = {}; Object.keys(opts).forEach(function (k) { merged[k] = opts[k]; });
            merged.preset = 'detector-screen';
            opts = merged;
        }
        WallCls.call(this, universe, opts);
        this._schemaKind = 'GraphingDetectorWall';

        // Declared heatmap fields (own props → codegen captureProps round-trip).
        this.binPx     = _num(opts.binPx, 12);
        this.refreshMs = _num(opts.refreshMs, 100);
        this.heatBase  = _num(opts.heatBase, 0.35);

        var counts = Array.isArray(this.hooks) && this.hooks.indexOf('count') !== -1;
        if (!counts) {
            throw new Error('[GraphingDetectorWall] this wall does not COUNT (collisionBehavior "' +
                this.collisionBehavior + '", hooks ' + JSON.stringify(this.hooks || []) + ') — a ' +
                'graphing detector needs the count hook (the "detector-screen" preset supplies it), ' +
                'or it would paint an eternally empty grid. (FAIL-LOUD.)');
        }

        this._faceSpec = faceSpec(this._trueRect, this.binPx);
        this._canvas = this._makeCanvas(opts.makeCanvas);
        // The ferry: the providers composite this canvas natively (p5 image /
        // three CanvasTexture). No provider capability method, no chartSpec.
        this.lo.liveCanvas = this._canvas;
        this._lastPaintMs = 0;
        this._paintedBins = 0;
        this._drainedTickData = undefined;

        var self = this;
        this._paintTickFn = function graphingDetectorWallTick(arg) {
            self._tick(arg);
        };
        if (universe && Array.isArray(universe.experimentTickFunctions)) {
            universe.experimentTickFunctions.push(this._paintTickFn);
        }
    }

    GraphingDetectorWall.prototype = Object.create(WallCls ? WallCls.prototype : Object.prototype);
    GraphingDetectorWall.prototype.constructor = GraphingDetectorWall;

    /**
     * Create the offscreen ferry canvas. A HEADLESS environment (Node tests, the
     * pkg-node settlement CLI) has no `document`: the wall then runs with NO
     * canvas — physics, counting and every readout are unchanged, only the paint
     * is skipped. A test may inject `opts.makeCanvas(w,h)`.
     */
    GraphingDetectorWall.prototype._makeCanvas = function (makeCanvas) {
        var s = this._faceSpec;
        if (typeof makeCanvas === 'function') { return makeCanvas(s.canvasW, s.canvasH); }
        if (typeof document !== 'undefined' && document.createElement) {
            var cv = document.createElement('canvas');
            cv.width = s.canvasW; cv.height = s.canvasH;
            return cv;
        }
        return null;
    };

    /**
     * setRect(rect) — Wall's one position/extent write, then the FACE follows it: the face
     * spec (the paint's world origin) is re-derived from the moved true slab, and the canvas is
     * re-sized when the extent changed. The grid stays keyed by WORLD (y, z) — where each hit
     * landed — so a moved face paints the hits that fall on it where they fall.
     */
    GraphingDetectorWall.prototype.setRect = function (rect) {
        WallCls.prototype.setRect.call(this, rect);
        this._faceSpec = faceSpec(this._trueRect, this.binPx);
        var cv = this._canvas;
        if (cv && (cv.width !== this._faceSpec.canvasW || cv.height !== this._faceSpec.canvasH)) {
            cv.width = this._faceSpec.canvasW; cv.height = this._faceSpec.canvasH;
        }
        this.repaintHeatmap();
        return this;
    };

    /** The ferry canvas (or null in a headless environment). */
    GraphingDetectorWall.prototype.heatCanvas = function () { return this._canvas; };

    /** Bins painted on the last repaint — observability for the realm/unit checks. */
    GraphingDetectorWall.prototype.paintedBins = function () { return this._paintedBins; };

    /**
     * The host tick-fn: drain the collided-frame buffer EXACTLY once per tick
     * (the accumulate lane), then repaint at most every `refreshMs`.
     * `experimentTickFunctions` are called `fn(universe)` BEFORE do_tick, so the
     * drain reads the universe's cached LAST TickData — the documented one-tick
     * lag (the absorb-radiation precedent); a test may call `fn(tickData)`.
     */
    GraphingDetectorWall.prototype._tick = function (arg) {
        var td = (arg && arg.objects) ? arg
            : (this.universe && this.universe._lastTickData) ? this.universe._lastTickData
            : null;
        // The painter keeps its OWN consumed-tick token: Wall's double-consume guard
        // field is reset by every no-arg pure READ (which the repaint below performs),
        // so it cannot double as the drain ledger.
        if (td && td !== this._drainedTickData) {
            this._drainedTickData = td;
            this.getCollisionHistogram(td);
        }
        var now = (typeof Date !== 'undefined') ? Date.now() : 0;
        if (this.refreshMs > 0 && (now - this._lastPaintMs) < this.refreshMs) { return; }
        this._lastPaintMs = now;
        this.repaintHeatmap();
    };

    /**
     * Repaint the ferry canvas from the CURRENT grid (the no-arg pure read).
     * Safe to call between ticks; a no-op with no canvas (headless).
     * @returns {number} bins painted.
     */
    GraphingDetectorWall.prototype.repaintHeatmap = function () {
        if (!this._canvas || typeof this._canvas.getContext !== 'function') { return 0; }
        var ctx = this._canvas.getContext('2d');
        if (!ctx) { return 0; }
        var hist = this.getCollisionHistogram();   // no-arg = pure read, never consumes
        this._paintedBins = paintHeatmap(ctx, this._faceSpec, hist && hist.grid, {
            heatBase: this.heatBase
        });
        return this._paintedBins;
    };

    /**
     * Full teardown: drop the painter tick-fn (so FrqtlApp.setup() reinit
     * does not STACK painters), then Wall's own dispose. Idempotent.
     */
    GraphingDetectorWall.prototype.dispose = function () {
        if (this._paintTickFn && this.universe && Array.isArray(this.universe.experimentTickFunctions)) {
            var i = this.universe.experimentTickFunctions.indexOf(this._paintTickFn);
            if (i !== -1) { this.universe.experimentTickFunctions.splice(i, 1); }
            this._paintTickFn = null;
        }
        if (WallCls && WallCls.prototype.dispose) { WallCls.prototype.dispose.call(this); }
    };

    // Statics — the exported pure map (the assertion surface for the unit test).
    GraphingDetectorWall.faceSpec     = faceSpec;
    GraphingDetectorWall.heatCellRect = heatCellRect;
    GraphingDetectorWall.binGrid      = binGrid;
    GraphingDetectorWall.paintHeatmap = paintHeatmap;

    // ── Export ───────────────────────────────────────────────────────────────
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { GraphingDetectorWall: GraphingDetectorWall };
    } else {
        window.GraphingDetectorWall = GraphingDetectorWall;
    }

})();
