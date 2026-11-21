/* Copyright 2023-2026 by Essam Abadir */

/**
 * LiveChart — an in-scene live chart of a counting Wall's histogram: a NONE-collision, render-only
 * LargeObject (zero physics, SU1) carrying a `chartSpec` bag and an empty `liveCanvas` ferry slot.
 *
 *     var chart = exp.addObject(LiveChart, { source: 'screen', rect: [620, 40, 200, 140] });
 *
 * THE FACTORY SHAPE (Pixi's `Sprite.from`, Matter's `Bodies.rectangle`): `LiveChart` is a KIND TOKEN.
 * Its registered build constructs the chart and returns it — a LargeObject (`chart instanceof
 * LargeObject`, never `instanceof LiveChart`) stamped `_schemaKind = LiveChart.name`. Constructing
 * the token itself (`new LiveChart()`) THROWS naming the declaration form. A fork that renames the
 * class stamps its own kind, because the stamp reads the class name, never a literal.
 *
 * The chart is DRAWN by the host wiring (lib/components/live-chart-wiring), which renders Chart.js
 * to an OFFSCREEN canvas and assigns it onto `lo.liveCanvas`; the providers composite that canvas
 * natively (p5 image / three CanvasTexture). This part imports NO Chart.js — pure sugar below the shim.
 */

import { LargeObject } from './LargeObject.js';
import { CollisionTypes } from './CollisionTypes.js';
import * as ValueNormalizer from '../objects/schema/valueNormalizer.js';
import { registerKind } from '../objects/kinds.js';

    class LiveChart {
        constructor() {
            throw new Error('[LiveChart] LiveChart is a kind token — declare it with exp.addObject(LiveChart, props) ' +
                '(or exp.addObject(\'LiveChart\', props)); its build returns the chart. (FAIL-LOUD.)');
        }
    }

    // A "chart source" is any Wall facade exposing a between-tick read method the LiveChart
    // wiring's projectors consume: getCollisionHistogram (detectorHistogram), getAbsorbStats
    // (absorberStats) OR getLiveCount (liveCount). The build only needs to know a handle is
    // PLAUSIBLE — the wiring (lib/components/live-chart-wiring PROJECTOR_SPEC, above the shim)
    // owns the projector→method dispatch and surfaces projector/source mismatches at WIRE time
    // (FAIL-LOUD).
    function _isChartSource(obj) {
        return !!obj && (typeof obj.getCollisionHistogram === 'function' ||
                         typeof obj.getAbsorbStats === 'function' ||
                         typeof obj.getLiveCount === 'function');
    }

    /** Resolve a chart source by NAME through the runner's declared registry (the ONE by-name
     *  authority — FrqtlApp.getObjectByName). Null when nothing declared matches; the caller
     *  decides whether that is FAIL-LOUD. */
    function _resolveHistogramSource(runner, name) {
        if (!runner || typeof runner.getObjectByName !== 'function') {
            throw new Error('[ObjectFactory] a named LiveChart source resolves through runner.getObjectByName ' +
                '(the declared-object registry); this runner has none. (FAIL-LOUD.)');
        }
        return runner.getObjectByName(name, _isChartSource);
    }

    // ── The kind (objects/kinds.js): descriptor, construction defaults, palette, builder ──────────

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
        description: 'An in-scene live chart panel that plots a counting Wall\'s running ' +
            'y→count histogram (getCollisionHistogram) as the sim runs. A render-only ' +
            'LargeObject (NONE collision, zero physics) — the Chart.js chart renders to an ' +
            'offscreen canvas and is composited into the scene as a texture/image, so it ' +
            'moves and scales with the scene. Point it at a detect/count Wall; a non-counting ' +
            'source fails loud.',
        // STUDIO UX: a chart panel has a real draggable/resizable extent, and it is
        // VISIBLE during Run (its whole point), so shellRender:'run' (NOT a Design-only
        // marker).
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

    //
    // An in-scene live chart of a counting Wall's histogram (the C-workstream visual
    // sugar object). Builds a NONE-collision, render-only LargeObject (zero physics,
    // SU1 — like a backdrop) carrying a `chartSpec` bag + an empty `liveCanvas` ferry
    // slot. The chart is DRAWN by the host wiring (lib/components/live-chart-wiring),
    // which renders Chart.js to an OFFSCREEN canvas and assigns it onto lo.liveCanvas;
    // the providers composite that canvas natively (p5 image / three CanvasTexture).
    // The object imports NO Chart.js — it stays pure sugar below the shim.
    //
    // `source` accepts a direct counting-Wall handle (getCollisionHistogram) OR its
    // name string. A named source is resolved here at build time — MISSING → THROW
    // (FAIL-LOUD build-time). The count-hook validity (a detect/count wall) is surfaced
    // at WIRE time by letting Wall.getCollisionHistogram's own throw propagate.
    registerKind(LiveChart, {
        from: import.meta.url,
        descriptor: LiveChartDescriptor,
        defaults: {
        w: 200,
        h: 140,
        projector: 'detectorHistogram',
        series: 'bar',
        refreshMs: 100,
        color: [30, 40, 55]
        },
        palette: { displayName: 'Live Chart', category: 'measurement', iconHint: 'chart', rank: 4 },
        build: function (props, ctx, Class) {
            var LO = LargeObject;
            var CT = CollisionTypes;

            // Rect: an explicit rect (array [l,t,w,h] / [l,t,z,w,h,d] OR object {left,top,w,h})
            // wins; else center a default panel on the drop point (ctx.x/ctx.y).
            var _r = props.rect;
            var cw, ch, cl, ct;
            if (Array.isArray(_r)) {
                if (_r.length >= 6) { cl = _r[0]; ct = _r[1]; cw = _r[3]; ch = _r[4]; }
                else { cl = _r[0]; ct = _r[1]; cw = _r[2]; ch = _r[3]; }
            } else if (_r && _r.left != null) {
                cl = _r.left; ct = _r.top; cw = _r.w; ch = _r.h;
            } else {
                cw = props.w || 200;
                ch = props.h || 140;
                cl = Math.round(ctx.x - cw / 2);
                ct = Math.round(ctx.y - ch / 2);
            }
            var name  = props.name  || ('livechart ' + (ctx.runner.largeObjects.length + 1));
            var color = props.color || [30, 40, 55];

            var lo = new LO(ctx.runner.universe, [cl, ct, cw, ch], CT.NONE, [], name,
                            'closest', null, 1, color);
            if (props.alpha   != null) { lo.alpha   = props.alpha; }
            if (props.visible != null) { lo.visible = props.visible; }
            lo._schemaKind = Class.name;   // a LargeObject on purpose, stamped with the registered kind

            // Resolve the source (handle | name | unbound).
            var source = props.source;
            var sourceHandle = null, sourceName = null;
            if (source && typeof source === 'object' && _isChartSource(source)) {
                sourceHandle = source;
                sourceName   = (typeof source.name === 'string') ? source.name : null;
            } else if (typeof source === 'string' && source) {
                sourceName   = source;
                sourceHandle = _resolveHistogramSource(ctx.runner, source);
                if (!sourceHandle) {
                    throw new Error('[ObjectFactory] LiveChart source wall "' + source +
                        '" not found among the registered objects — a LiveChart must be pointed ' +
                        'at an already-added counting/absorbing Wall (by name or handle). (FAIL-LOUD.)');
                }
            } else if (source != null) {
                throw new Error('[ObjectFactory] LiveChart `source` must be a Wall handle ' +
                    '(exposing getCollisionHistogram or getAbsorbStats) or its name string; got ' +
                    typeof source + '. (FAIL-LOUD.)');
            }
            // source == null → an unbound chart (bare palette drop); the host wiring skips
            // it until a source is set (it draws its empty panel shell meanwhile).

            var projector = props.projector || 'detectorHistogram';
            // Orientation: explicit 0|90 wins; else DEFAULT a detectorHistogram chart to 90 (the
            // GYM detector-aligned horizontal-bar presentation — a detector column-profile stacks
            // along y beside the vertical detector wall), any other projector (e.g. absorberStats,
            // a 3-bar ledger) to 0 (standard vertical bars).
            var orientation;
            if (props.orientation === 90 || props.orientation === '90') { orientation = 90; }
            else if (props.orientation === 0 || props.orientation === '0') { orientation = 0; }
            else { orientation = (projector === 'detectorHistogram') ? 90 : 0; }
            // Mirror onto the LO wrapper as the render-only, Inspector-live field (updateObjectProperty
            // mirror-writes lo.orientation); the wiring reads it live with a chartSpec fallback.
            lo.orientation = String(orientation);

            lo.chartSpec = {
                source:       sourceName,                       // serializable name (or null)
                sourceHandle: sourceHandle,                     // resolved handle (runtime only; or null)
                projector:    projector,
                kind:         (props.series === 'line') ? 'line' : 'bar',
                label:        props.label || sourceName || 'detector',
                refreshMs:    (typeof props.refreshMs === 'number') ? props.refreshMs : 100,
                orientation:  orientation                       // 0 | 90 (numeric default; lo.orientation is the live source)
            };
            // Mirror the SERIALIZABLE chartSpec fields onto the LO under their DESCRIPTOR
            // names (restart-bug fix, 2026-07-25): captureProps(lo, LiveChartDescriptor)
            // reads lo[field.name], so without these mirrors a captured chart (the parts writer's
            // capture of a declared chart) would rebuild UNBOUND
            // with default projector/label ("detector"). The name string — never the live
            // sourceHandle — is the captured source (re-resolved here on rebuild).
            lo.source    = sourceName;
            lo.projector = projector;
            lo.series    = lo.chartSpec.kind;
            lo.label     = lo.chartSpec.label;
            lo.refreshMs = lo.chartSpec.refreshMs;
            lo.liveCanvas = null;   // empty ferry slot — the host wiring assigns the rendered canvas

            return lo;
        }
    });

    export { LiveChart };
