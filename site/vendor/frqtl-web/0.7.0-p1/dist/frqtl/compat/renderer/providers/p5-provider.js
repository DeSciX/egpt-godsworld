/* Copyright 2023-2026 by Essam Abadir */

/**
 * p5Provider — RendererProvider backed by p5.js 2.x (global mode).
 *
 * Implements the RendererProvider interface (renderer-provider-contract.js):
 *   init({ parentEl, width, height }) → HTMLCanvasElement   (parentEl REQUIRED: requireMountHost)
 *   renderTick(tickData, largeObjects)
 *   filter(filterSpec) / removeFilter(name)
 *   setSize(width, height)
 *   start() / stop()
 *   destroy()
 *   raw()
 *   captureStill()          — OPTIONAL (the `composite` stage tap; 2D-canvas readback)
 *
 * Design:
 *   - Operates in p5 global mode: p5 installs background/fill/etc. as globals (compat/vendor.js loads it).
 *   - FrqtlApp owns the RAF loop and calls renderTick() each draw frame.
 *   - The provider DOES NOT own the loop (start/stop are no-ops).
 *   - canvas creation happens in init() called from p5's setup() context.
 *   - filter() queues a post-process pass applied after each renderTick().
 *   - Post-process passes use WebGL2 on a secondary offscreen canvas and blit back.
 *
 * p5 2.x vs 0.6.0 compatibility:
 *   API surface: background, fill, noStroke, stroke, strokeWeight, noFill, ellipse,
 *   rect, createCanvas, loop, noLoop, frameRate — unchanged between 0.6.0 and 2.x.
 *   createCanvas() returns a p5.Element; .parent(element) still works.
 *   p5.dom is built into the main bundle in 2.x (no separate script tag needed).
 */

import * as Camera2dGeometry from '../camera2d-geometry.js';
import * as CaptureStillCommon from '../captureStill-common.js';
import { FieldBuilder } from '../FieldBuilder.js';
import * as FieldDescriptorSchema from '../../../../shim/field-descriptor/index.js';
import { Filters } from '../Filters.js';
import * as FrameDataSchema from '../../../../shim/frame-data/index.js';
import { LightColor } from '../../../parts/LightColor.js';
import * as OrbitBag from '../orbit-bag.js';
import * as RenderCapabilitiesCommon from '../renderCapabilities-common.js';
import { RenderShape } from '../RenderShape.js';
import * as RendererProviderContract from '../renderer-provider-contract.js';


    var VERT_SRC = [
        '#version 300 es',
        'in vec2 aPosition;',
        'out vec2 vTexCoord;',
        'void main() {',
        '  vTexCoord = aPosition * 0.5 + 0.5;',
        '  gl_Position = vec4(aPosition, 0.0, 1.0);',
        '}'
    ].join('\n');

    // ── Shader helpers ──────────────────────────────────────────────────────

    function compileShader(gl, type, src) {
        var sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error('[p5-provider] shader compile error:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
        }
        return sh;
    }

    function compileProgram(gl, vertSrc, fragSrc) {
        var vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
        var fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vs || !fs) return null;
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('[p5-provider] shader link error:', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    // Convert a GLSL 1.0-style fragment source to GLSL 300 es.
    // Only used when the caller provides a glsl field without a version directive.
    function upgradeGlsl(src) {
        // Strip declarations we re-emit at the top (uniforms, varyings, precision)
        var body = src
            .replace(/precision\s+\w+\s+float\s*;/g, '')
            .replace(/uniform\s+sampler2D\s+\w+\s*;/g, '')
            .replace(/uniform\s+vec2\s+\w+\s*;/g, '')
            .replace(/uniform\s+float\s+\w+\s*;/g, '')
            .replace(/varying\s+vec2\s+\w+\s*;/g, '')
            .replace(/texture2D\s*\(/g, 'texture(')
            .replace(/gl_FragColor/g, 'fragColor');
        return [
            '#version 300 es',
            'precision highp float;',
            'out vec4 fragColor;',
            'uniform sampler2D uField;',
            'uniform sampler2D uScene;',
            'uniform vec2 uResolution;',
            'uniform float uTime;',
            'in vec2 vTexCoord;',
            body
        ].join('\n');
    }

    // ── renderCapabilities() (OPTIONAL contract method — S5a) ────────────────
    //
    // Studio Controls Realignment §7 r2 item 2/4: renderCapabilities() is an
    // OPTIONAL RendererProvider method (the getCameraControl() precedent — absent
    // ⇒ makeControlsForRenderSurface emits no render controls, never an error).
    // Declares ONLY what THIS provider actually supports (condition
    // "per-provider truth" — no schema-mirror registry claiming a capability a
    // given backend can't honor). p5 supports the THREE universal knobs
    // (shape/colorScheme/renderBaseCanvas — README §3: "both p5 and three
    // providers honor this identically") plus every Filters.js entry (filter()/
    // removeFilter() are REQUIRED contract methods on every provider) — it does
    // NOT declare the three-only effect-layer knobs (godrays/glow/heat/smoke —
    // p5 has no such render path; grep confirms).
    //
    // Defined as a MODULE-LEVEL free function (not inside makeP5Provider's
    // per-instance closure) so it needs no live p5/WebGL context — capability
    // DESCRIPTORS are static metadata (name/type/constraint/unit/default);
    // live VALUES are read separately via FrqtlApp.getRenderOption /
    // isFilterActive. This is what makes it unit-testable in plain Node.
    // S5b DRY tidy (the 3
    // universal descriptors + the filter loop were hand-copied between this
    // file and three-provider.js): the ONE shared owner is now
    // `renderCapabilities-common.js` — see that file's own docstring.


    // THE 2D camera map (pan/zoom). Pure + backend-free, so the provider stays thin and the
    // SAME map serves the offline unprojectStill — one authority, live and offline.


    // THE one field source (FieldBuilder.buildHeightField). An absent FieldBuilder is a load-order
    // fault, never an all-zero field — the same rule capture.js's `field` tap throws on.

    // THE point-shape authority for the pose bag (`{x,y,z}` AND `[x,y,z]`, one identical
    // throw under every provider). This provider re-validates NO point field — a second
    // opinion about a shape the contract owns is exactly the drift orbit-bag.js closes.

    function _renderCapabilitiesP5() {
        var normalizeFieldDescriptor = FieldDescriptorSchema.normalizeFieldDescriptor;
        var common = RenderCapabilitiesCommon;
        var FiltersRef = Filters;
        return common.universalRenderCapabilities(
            normalizeFieldDescriptor,
            RenderShape,
            FrameDataSchema
        ).concat(common.filterRenderCapabilities(normalizeFieldDescriptor, FiltersRef));
    }

    // ── Factory ─────────────────────────────────────────────────────────────

    function makeP5Provider() {
        // The runner's physics rect, stated by init({width, height}) / setSize(w, h). null until
        // then: every read goes through _physW()/_physH(), which THROW before it is stated — a
        // provider has no size of its own (RENDERER_CONTRACT §1 init row).
        var _width        = null;
        var _height       = null;
        function _unsized() {
            return new Error('p5Provider: the physics rect was read before init({width, height}) or ' +
                'setSize(w, h) stated it. FrqtlApp.createCanvas hands the runner\'s canvas_rect to ' +
                'provider.init — the provider has no default size.');
        }
        function _physW() { if (_width === null) { throw _unsized(); } return _width; }
        function _physH() { if (_height === null) { throw _unsized(); } return _height; }
        var _filters      = [];        // ordered list of active filterSpec objects
        var _initialized  = false;
        var _p5Canvas     = null;      // p5.Element returned by createCanvas()
        var _filterState  = {};        // per-filter compiled WebGL2 state cache
        var _lastTickData = null;      // latest tickData for field-texture derivation
        // The renderBaseCanvas value that the LAST composite actually ran with. Recorded
        // at the point of compositing (not read from the runner later) because this
        // provider is the authority for what it composited — a capture's provenance must
        // state what produced the pixels, not what the option happens to say afterwards
        // (RENDERER_CONTRACT §1a.4: no caller-supplied provenance). null until the first
        // renderTick, which is exactly the "nothing composited yet" case.
        var _lastRenderBaseCanvas = null;
        // The `uTime` every filter pass of the LAST composite drew with (the contract's
        // filterTime of the rendered tick), recorded where it is fed for the same reason;
        // null when no filter ran.
        var _lastFilterTime = null;
        // The 2D camera pose — the DEGENERATE orbit bag {distance, target}. Initialised lazily
        // (init() supplies the real dims). Null target = canvas centre; distance = visible
        // physics-px height. This is CAMERA state, not a render option: every still stamps it
        // as `pose`, so a zoomed 2D capture is self-describing instead of silently mislabeled.
        var _pose = null;
        function _poseOrDefault() {
            if (!_pose) { _pose = Camera2dGeometry.defaultPose2d(_physW(), _physH()); }
            return _pose;
        }
        // The whole 2D pose bag, COPIED — never the live object (a captured pose must not keep
        // tracking the camera; the still-provenance aliasing discipline): what getOrbit()
        // returns and what every pose-change listener receives.
        function _poseBag() {
            var p = _poseOrDefault();
            return { distance: p.distance, target: p.target ? { x: p.target.x, y: p.target.y } : null };
        }
        // The pose-change listener list (OrbitBag.makePoseNotice), provider-scoped so every
        // handle getCameraControl() returns shares it. Created on the first subscription; a
        // pose write (setOrbit, setPreset, a resize) notifies it.
        var _poseNotice = null;
        function _notifyPose() { if (_poseNotice) { _poseNotice.notify(_poseBag()); } }

        // ── Layer helpers ───────────────────────────────────────────────────
        //
        // Layers are a RENDERER-SIDE organizing pattern over the per-tick handle
        // (tickData.frameData + largeObjects). There is NO engine concept of a
        // layer and NO spec-side layer descriptor — the structure is intrinsic to
        // the handle: each quantum already self-identifies its dimension via
        // FrameData.layer, and largeObjects carry their own render attributes
        // (visible/color/alpha/drawAsCircle/backdrop/image). Each helper below
        // walks the handle and draws one named layer. The IDE Layers panel reflects
        // these by reading dimensionData ∪ largeObjects and toggles them via the
        // per-object .visible flag / renderBaseCanvas — no new contract.
        //
        // p5 draws the layers here; three/custom implement the SAME named layers in
        // their own renderTick. Swapping renderers never touches this file — only
        // the RendererProvider interface + the handle are shared.

        /**
         * Backdrop layer: non-colliding LargeObjects carrying an image, drawn first
         * (under everything). The image is a p5.Image / HTMLImageElement loaded by
         * the experiment page; the renderer only composites it into the LO's rect.
         */
        function _layerBackdrop(largeObjects) {
            if (!largeObjects || typeof image !== 'function') return;
            for (var i = 0; i < largeObjects.length; i++) {
                var lo = largeObjects[i];
                if (lo.visible === false || !lo.backdrop || !lo.image) continue;
                image(lo.image, lo.rect.left, lo.rect.top, lo.rect.w, lo.rect.h);
            }
        }

        /**
         * Bodies layer: structural LargeObjects (walls, detectors, blocks) — the
         * colliding sprites. Backdrops are skipped here (drawn in _layerBackdrop).
         */
        function _layerBodies(largeObjects) {
            if (!largeObjects) return;
            for (var i = 0; i < largeObjects.length; i++) {
                var lo = largeObjects[i];
                if (lo.visible === false || lo.backdrop) continue;
                var loa = (lo.alpha !== undefined) ? lo.alpha : 255;
                // LiveChart: composite the ferried OFFSCREEN Chart.js canvas as an in-scene
                // image panel (the R5 ferry contract). The renderer only wraps the canvas
                // element — Chart.js never enters the renderer. lo.liveCanvas is an accessor
                // returning the CURRENT element (it churns each redraw). drawingContext.drawImage
                // is the safe cross-version path (p5's image() may reject a raw canvas); a colored
                // panel shell draws until the first chart render lands.
                if (lo.liveCanvas) {
                    var _lcv = (typeof lo.liveCanvas === 'function') ? lo.liveCanvas() : lo.liveCanvas;
                    var _drewLive = false;
                    push();
                    if (_lcv && typeof drawingContext !== 'undefined' && drawingContext &&
                        typeof drawingContext.drawImage === 'function') {
                        var _pa = drawingContext.globalAlpha;
                        drawingContext.globalAlpha = Math.max(0, Math.min(1, loa / 255));
                        try {
                            drawingContext.drawImage(_lcv, lo.rect.left, lo.rect.top, lo.rect.w, lo.rect.h);
                            _drewLive = true;
                        } catch (e) { /* pre-layout frame — fall through to the panel shell */ }
                        drawingContext.globalAlpha = _pa;
                    } else if (_lcv && typeof image === 'function') {
                        try { image(_lcv, lo.rect.left, lo.rect.top, lo.rect.w, lo.rect.h); _drewLive = true; }
                        catch (e) { /* fall through */ }
                    }
                    if (!_drewLive) {
                        noStroke();
                        fill(lo.color[0], lo.color[1], lo.color[2], loa);
                        rect(lo.rect.left, lo.rect.top, lo.rect.w, lo.rect.h);
                    }
                    pop();
                    continue;
                }
                // Shell SHAPE (R2-3, capability-based, zero engine change): a per-LO
                // shellShape (ferried render.shape vocab) picks the drawn primitive — box/cube →
                // rect, ball/circle/sphere → ellipse (cube/sphere degrade to box/ball in 2D).
                // Absent → the legacy drawAsCircle boolean (byte-identical for every prior LO).
                var _asCircle;
                if (typeof lo.shellShape === 'string' && lo.shellShape) {
                    _asCircle = (lo.shellShape !== 'box' && lo.shellShape !== 'cube');
                } else {
                    _asCircle = !!lo.drawAsCircle;
                }
                var _cx = lo.rect.left + lo.rect.w / 2, _cy = lo.rect.top + lo.rect.h / 2;
                // R2 — VISIBLE ROTATION: a ferried orientationDeg (Wall sugar) rotates the drawn
                // shell about its center. The drawn face is the wall: a rotated wall draws NO
                // outline of its un-rotated engine rect. orientation 0 ⇒ the legacy axis-aligned
                // draw, byte-identical (SU1). NOTE: lo.rect is the wrapper's TRUE-slab rect (the
                // broad-phase-superset expansion applies only to the ENGINE's registered rect).
                var _deg = (typeof lo.orientationDeg === 'number') ? (((lo.orientationDeg % 360) + 360) % 360) : 0;
                if (_deg !== 0) {
                    // the rotated shell face (drawn centered under the rotation transform).
                    push();
                    noStroke();
                    fill(lo.color[0], lo.color[1], lo.color[2], loa);
                    translate(_cx, _cy);
                    rotate(radians(_deg));
                    if (_asCircle) { ellipse(0, 0, lo.rect.w, lo.rect.h); }
                    else { rect(-lo.rect.w / 2, -lo.rect.h / 2, lo.rect.w, lo.rect.h); }
                    pop();
                    continue;
                }
                noStroke();
                fill(lo.color[0], lo.color[1], lo.color[2], loa);
                if (_asCircle) {
                    ellipse(_cx, _cy, lo.rect.w, lo.rect.h);
                } else {
                    rect(lo.rect.left, lo.rect.top, lo.rect.w, lo.rect.h);
                }
            }
        }

        /**
         * Particle layers: leaf-frame quanta grouped by their self-organizing
         * .layer (the dimension number the engine assigns — FrameData.layer),
         * sorted ascending so higher dimensions composite on top. Order WITHIN a
         * layer is preserved, so single-dimension experiments (wave-interference)
         * render byte-identically to the pre-refactor frame loop.
         *
         * @param {object} tickData
         * @param {object} renderOpts — the runner's _renderOptions bag (setRenderOption).
         */
        function _layerParticles(tickData, renderOpts) {
            if (!tickData || !tickData.frameData) return;
            // LightColor + RenderShape are MANDATORY canonical contracts (the single color/shape
            // sources). A missing one is a hard load-order/packaging error — FAIL LOUD, never a
            // silent fallback to white/'ball' (Invariant 2).
            var lc = LightColor;
            var rs = RenderShape;

            var byLayer = {};
            var order = [];
            for (var j = 0; j < tickData.frameData.length; j++) {
                var L = tickData.frameData[j].layer;
                var key = (L === undefined || L === null) ? 0 : L;
                if (!byLayer[key]) { byLayer[key] = []; order.push(key); }
                byLayer[key].push(tickData.frameData[j]);
            }
            order.sort(function (a, b) { return a - b; });

            for (var oi = 0; oi < order.length; oi++) {
                var group = byLayer[order[oi]];
                for (var k = 0; k < group.length; k++) { _drawQuantum(group[k], lc, rs, renderOpts); }
            }
        }

        /**
         * Draw a single quantum.
         *
         * Color priority:
         *   render.color (exact CSV r,g,b,a)
         *     > render.colorScheme per-frame key in string_map (LightColor ramp)
         *     > renderOpts.colorScheme default (LightColor ramp)
         *     > 'warmcool' default
         *
         * Shape priority: RenderShape.resolve(frame, renderOpts) — single authority.
         *   'ball'   → round glow ellipse + halo (existing default behavior)
         *   'box'    → solid rect at voxel size
         *   'circle' → outline ellipse (noFill + stroke)
         */
        function _drawQuantum(fd, lc, rs, renderOpts) {
            var rgb;
            // Render color: user-space data on the generic string_map (CSV 'r,g,b,a'); the engine
            // carries it opaque (I1). Same channel as render.outline.
            var _sm = fd.data && fd.data.string_map;
            var renderColor = null;
            if (_sm && _sm['render.color']) {
                var _cp = String(_sm['render.color']).split(',').map(Number);
                if (_cp.length >= 3 && _cp.every(function (n) { return !isNaN(n); })) renderColor = _cp;
            }
            // Color scheme: per-frame override > experiment default > 'warmcool'.
            var frameScheme = (_sm && _sm['render.colorScheme']) ? _sm['render.colorScheme']
                : ((renderOpts && renderOpts.colorScheme) ? renderOpts.colorScheme : 'warmcool');

            if (renderColor) {
                rgb = renderColor;
            } else {
                // LightColor is the single color authority — getRgbBySchemeName dispatches by scheme
                // and always returns [r,g,b]. Alpha: single authority — getAlphaFromIntensity (wider
                // dynamic range; eliminates the old 180/255 floor so sparse quanta read visually dim).
                var color   = lc.getRgbBySchemeName(frameScheme, fd.fullness);
                var alpha01 = lc.getAlphaFromIntensity(fd.fullness);
                rgb = [color[0], color[1], color[2], alpha01];
            }

            // Shape: RenderShape.resolve is the single authority (it returns 'ball' as its own default).
            var shape = rs.resolve(fd, renderOpts);
            var r = rgb[0], g = rgb[1], b = rgb[2], a = (rgb[3] !== undefined ? rgb[3] : 1);

            noStroke();
            if (shape === 'box') {
                // Solid filled rectangle at the voxel size. Gives boxes-of-balls a crisp voxel look.
                fill(r, g, b, a * 255);
                rect(fd.rect.left, fd.rect.top, fd.rect.w, fd.rect.h);
            } else if (shape === 'circle') {
                // Outline circle — noFill + stroke, good for wave-front / boundary visualization.
                strokeWeight(1);
                stroke(r, g, b, a * 255);
                noFill();
                ellipse(fd.rect.x, fd.rect.y, fd.rect.w, fd.rect.h);
            } else {
                // 'ball' (default) — round glow ellipse + halo (existing behavior, unchanged).
                // render.outline is a legacy override for this branch: 'true' → rect outline.
                var _outline = !!(_sm && _sm['render.outline'] === 'true');
                if (!_outline) {
                    var r1 = Math.max(1, fd.rect.w / 2);
                    var r2 = Math.max(2, fd.rect.w);
                    fill(r, g, b, a * 255);
                    ellipse(fd.rect.x, fd.rect.y, r1, r1);
                    fill(r, g, b, 25);
                    ellipse(fd.rect.x, fd.rect.y, r2, r2);
                } else {
                    strokeWeight(1);
                    stroke(r, g, b, a * 255);
                    noFill();
                    rect(fd.rect.left, fd.rect.top, fd.rect.w, fd.rect.h);
                }
            }
        }

        // ── Compose the named layers in z-order ─────────────────────────────
        // Per-layer visibility is INDEPENDENT:
        //   backdrop & bodies — toggle per-object via LargeObject.visible
        //   particles         — toggle via drawParticles (renderBaseCanvas gate)
        // Hiding particles still composes backdrop + bodies, so e.g. a pond
        // backdrop refracts under the water shader without the photons. This is
        // the per-layer independence the IDE Layers panel rides on.
        function _composeLayers(tickData, largeObjects, drawParticles, renderOpts) {
            if (typeof background === 'undefined') return;  // p5 not in global scope yet
            background(0);
            // ── 2D CAMERA: pan/zoom applied ONCE, around every layer ──
            // Derived from the pose through the one authority, so the picture and
            // screenToWorld/unprojectStill can never disagree. At the default pose k === 1
            // and this is the identity transform — every pre-existing scene is byte-unchanged.
            var v = Camera2dGeometry.resolveView2d(_poseOrDefault(), _physW(), _physH());
            var _framed = (typeof push === 'function' && typeof scale === 'function' &&
                           typeof translate === 'function');
            if (_framed) {
                push();
                translate(_physW() / 2, _physH() / 2);
                scale(v.k);
                translate(-v.cx, -v.cy);
            }
            _layerBackdrop(largeObjects);   // non-colliding image LOs (under all)
            _layerBodies(largeObjects);     // structural sprites
            if (drawParticles) { _layerParticles(tickData, renderOpts); }  // quanta, grouped by .layer
            if (_framed) { pop(); }
        }

        // ── Filter post-processing (WebGL2) ─────────────────────────────────

        // The provider's OWN canvas — the element p5's createCanvas() returned in init(). Never
        // looked up in the document: the first <canvas> on a page is not necessarily this one.
        function _getP5Canvas() {
            if (_p5Canvas && _p5Canvas.elt) return _p5Canvas.elt;
            throw new Error('p5Provider: no canvas to read — the provider\'s p5 canvas element is absent. ' +
                'init({width, height}) creates it (p5\'s createCanvas() → .elt); call init first ' +
                '(FrqtlApp.createCanvas does).');
        }

        // Smooth heightfield via shared FieldBuilder (single source, identical to three provider).
        function _buildFieldTexture() {
            if (!_lastTickData || !_lastTickData.frameData) {
                return new Uint8Array(FieldBuilder.FIELD_OPTS.w * FieldBuilder.FIELD_OPTS.h);
            }
            // FieldBuilder uses its own fixed resolution (FIELD_OPTS.w x h), not canvas size;
            // canvasW/canvasH map physics px onto it.
            return FieldBuilder.buildHeightField(_lastTickData.frameData,
                Object.assign({}, FieldBuilder.FIELD_OPTS, { canvasW: _physW(), canvasH: _physH() }));
        }

        function _initFilterState(spec, canvas) {
            var offscreen = document.createElement('canvas');
            offscreen.width  = canvas.width;
            offscreen.height = canvas.height;
            var gl = offscreen.getContext('webgl2');
            if (!gl) {
                console.warn('[p5-provider] WebGL2 unavailable for filter:', spec.name);
                return { skip: true };
            }

            var fragSrc = (spec.glsl.indexOf('#version') === -1)
                ? upgradeGlsl(spec.glsl)
                : spec.glsl;

            var prog = compileProgram(gl, VERT_SRC, fragSrc);
            if (!prog) return { skip: true };

            // Both uploads (the scene canvas and FieldBuilder's field) are TOP row first, and
            // vTexCoord has its origin at the BOTTOM-left (Filters.js convention). Flip on upload,
            // once for this context, or the composite draws the whole picture upside down while
            // screenToWorld (and every hand on the canvas) stays right side up.
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

            var quadBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

            function makeTex() {
                var t = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                return t;
            }

            return {
                gl: gl, prog: prog, quadBuf: quadBuf,
                sceneTex: makeTex(), fieldTex: makeTex(),
                offscreen: offscreen
            };
        }

        function _runFilter(spec, time) {
            var canvas = _getP5Canvas();

            var key   = spec.name || 'filter';
            var state = _filterState[key];
            if (!state) {
                state = _initFilterState(spec, canvas);
                _filterState[key] = state;
            }
            if (state.skip) return;

            var gl = state.gl;
            // R-7: pixelDensity fix — the p5 canvas's LOGICAL size vs. its
            // backing-store size may differ by the device pixel ratio (pixelDensity).
            // Two sizes matter here:
            //   logW / logH  = LOGICAL pixels = the physics canvas size, the SOT
            //                  (init's opts.width/height ← runner.canvas_rect; ==
            //                  createCanvas(_width,_height)). The p5 2D context is
            //                  scaled by pixelDensity, so it draws in THESE units and
            //                  a full-canvas rect spans (0,0)→(logW,logH).
            //   bsW  / bsH   = backing-store pixels (canvas.width / canvas.height =
            //                  logical × pixelDensity). The offscreen WebGL2 buffer,
            //                  viewport, and uResolution use the backing store.
            //
            // BUGFIX (letterbox interaction): the blit dst rect below MUST be the
            // LOGICAL/SOT size (logW/logH), NOT canvas.clientWidth/clientHeight.
            // clientWidth/Height is the DISPLAYED element box, which the object-fit
            // letterbox (+ max-width/max-height:100% clamps in experiment-layout.css)
            // distorts to a wide/short rectangle on a wide viewport. Blitting into
            // that distorted box left the bottom of the square uncovered (raw
            // particles showing through under the water shader). logW/logH is the
            // same SOT the base particle draw + the object-fit letterbox consume, so
            // the shader now covers the FULL physics square at any viewport width.
            var bsW = canvas.width;
            var bsH = canvas.height;
            var logW = _physW();
            var logH = _physH();

            // Resize the offscreen buffer only when the backing-store size changes.
            if (state.offscreen.width !== bsW || state.offscreen.height !== bsH) {
                state.offscreen.width  = bsW;
                state.offscreen.height = bsH;
            }

            gl.viewport(0, 0, bsW, bsH);

            // Upload scene (from the backing store — full bsW × bsH)
            gl.bindTexture(gl.TEXTURE_2D, state.sceneTex);
            try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); }
            catch (e) { return; }

            // Upload field (smooth heightfield from shared FieldBuilder; fixed resolution)
            var fOpts = FieldBuilder.FIELD_OPTS;
            var fw = fOpts.w;
            var fh = fOpts.h;
            var fieldData = _buildFieldTexture();
            gl.bindTexture(gl.TEXTURE_2D, state.fieldTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fw, fh, 0, gl.RED, gl.UNSIGNED_BYTE, fieldData);

            // Draw
            gl.useProgram(state.prog);
            var posLoc = gl.getAttribLocation(state.prog, 'aPosition');
            gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBuf);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            // uResolution = backing-store size so texel = 1/uResolution matches the texture.
            // The finite-difference normal uses this to step one texel in UV space.
            gl.uniform2f(gl.getUniformLocation(state.prog, 'uResolution'), bsW, bsH);
            // uTime = simulation seconds at the rendered tick (the contract's filterTime).
            gl.uniform1f(gl.getUniformLocation(state.prog, 'uTime'), time);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, state.sceneTex);
            gl.uniform1i(gl.getUniformLocation(state.prog, 'uScene'), 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, state.fieldTex);
            gl.uniform1i(gl.getUniformLocation(state.prog, 'uField'), 1);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            // R-7 FIX: Blit result back to p5 canvas via 2D context with explicit
            // src (backing-store) → dst (LOGICAL/SOT) rect mapping.
            //
            // The p5 2D context is scaled by pixelDensity, so it draws in LOGICAL
            // units: a full-canvas rect is (0,0)→(logW,logH). The offscreen buffer
            // is bsW × bsH (= logical × pixelDensity). Specifying the full
            // src (0,0,bsW,bsH) → full dst (0,0,logW,logH) stretches the entire
            // shader output over the entire physics canvas, regardless of
            // pixelDensity AND regardless of how CSS (object-fit letterbox) then
            // scales the element for display. Using the DISPLAYED client size here
            // instead would couple the framebuffer to the letterboxed box and leave
            // part of the square uncovered on a wide viewport (the bug this fixes).
            var ctx2d = canvas.getContext('2d');
            if (ctx2d) {
                ctx2d.drawImage(state.offscreen,
                    0, 0, bsW,  bsH,    // source: full offscreen (backing-store pixels)
                    0, 0, logW, logH    // destination: full physics canvas (logical/SOT units)
                );
            }
        }

        // ── Public interface ─────────────────────────────────────────────────

        var provider = {

            /**
             * init — create the p5 canvas and RETURN it as an HTMLCanvasElement (`.elt`).
             * MUST be called from inside p5's window.setup() (createCanvas is a p5 global).
             */
            init: function (opts) {
                RendererProviderContract.requireProviderSize('p5Provider.init',
                    opts && opts.width, opts && opts.height);
                _width    = opts.width;
                _height   = opts.height;
                // The mount host is resolved BEFORE createCanvas: a missing or unknown canvasParentId
                // throws the contract's sentence instead of leaving the canvas at p5's own body default
                // (null) or reaching p5's parent(id), whose missing-id path is a bare TypeError.
                var host  = RendererProviderContract.requireMountHost('p5Provider.init', opts.parentEl);
                _p5Canvas = createCanvas(_physW(), _physH());
                _p5Canvas.parent(host);
                _initialized = true;
                return _getP5Canvas();   // the HTMLCanvasElement (RENDERER_CONTRACT §1 init row)
            },

            renderTick: function (tickData, largeObjects, options) {
                _lastTickData = tickData;
                // renderBaseCanvas gates ONLY the particle layer (back-compat: the
                // "shade particles" toggle). The backdrop + bodies layers always
                // compose, so hiding particles leaves other layers independently
                // visible (e.g. a pond backdrop refracting under water without the
                // photons). Default true = particles drawn. Never touches uField/physics.
                var drawParticles = !options || options.renderBaseCanvas !== false;
                _lastRenderBaseCanvas = drawParticles;   // capture provenance (§1a.4)
                _composeLayers(tickData, largeObjects, drawParticles, options);
                var time = _filters.length > 0
                    ? RendererProviderContract.filterTime(tickData) : null;
                _lastFilterTime = time;                    // capture provenance (§1a.4)
                for (var i = 0; i < _filters.length; i++) { _runFilter(_filters[i], time); }
            },

            filter: function (filterSpec, perFilterOptions) {
                // R-6: perFilterOptions (optional) merges over the runner options for this
                // specific filter call. The merged options are stored on the spec copy so
                // renderTick picks them up on the next draw.
                if (!filterSpec) return;
                if (filterSpec.name) {
                    for (var i = 0; i < _filters.length; i++) {
                        if (_filters[i].name === filterSpec.name) {
                            // Update perFilterOptions on the existing entry
                            if (perFilterOptions) {
                                _filters[i]._perFilterOptions = perFilterOptions;
                            }
                            return;
                        }
                    }
                }
                // Store perFilterOptions alongside the spec (shallow copy to avoid mutating caller)
                var entry = filterSpec;
                if (perFilterOptions) {
                    entry = Object.assign({}, filterSpec);
                    entry._perFilterOptions = perFilterOptions;
                }
                _filters.push(entry);
            },

            removeFilter: function (nameOrSpec) {
                var name = (typeof nameOrSpec === 'string') ? nameOrSpec
                         : (nameOrSpec && nameOrSpec.name);
                _filters = _filters.filter(function (f) { return f.name !== name; });
                if (name && _filterState[name]) { delete _filterState[name]; }
            },

            setSize: function (w, h) {
                RendererProviderContract.requireProviderSize('p5Provider.setSize', w, h);
                _width = w; _height = h;
                if (_initialized && typeof resizeCanvas === 'function') { resizeCanvas(w, h); }
                _notifyPose();   // the 2D map changes with the canvas (target null = its centre)
            },

            // Loop is owned by FrqtlApp — these are intentional no-ops.
            start: function () {},
            stop:  function () {},

            destroy: function () {
                if (_p5Canvas && _p5Canvas.remove) { _p5Canvas.remove(); }
                _initialized = false;
                _filters = [];
                _filterState = {};
                _lastTickData = null;
                _lastFilterTime = null;
            },

            raw: function () { return _p5Canvas; },

            // renderCapabilities — OPTIONAL (see the module-level docstring above
            // _renderCapabilitiesP5). Static per-provider metadata; no live-instance
            // state needed, so the free function above is called unmodified.
            renderCapabilities: _renderCapabilitiesP5,

            // ── screenToWorld (OPTIONAL convenience capability, S5b) ────────────
            // REPOINTED (2026-07-30) to consume the SAME 2D pose state the draw transform
            // uses. Previously a fixed CSS→physics ratio; under pan/zoom that map must
            // change, and if the pose lived anywhere but the camera authority two authorities
            // would feed one mapping — the split-basis failure the 3D consolidation removed.
            // At the default pose this is byte-identical to the old ratio scale (k === 1), so
            // every existing drag/pick is unchanged until someone actually pans or zooms.
            // `worldZ` still has no effect (2D has no depth transform; accepted for signature
            // parity with three-provider.js).
            screenToWorld: function (canvasCssX, canvasCssY, canvasCssWidth, canvasCssHeight /*, worldZ */) {
                return Camera2dGeometry.screenToWorld2d(
                    _poseOrDefault(), _physW(), _physH(),
                    canvasCssX, canvasCssY, canvasCssWidth || _physW(), canvasCssHeight || _physH());
            },

            // ── getCameraControl (OPTIONAL capability) — the DEGENERATE orbit bag ──
            // RENDERER_CONTRACT §1a.2. This provider DOES have camera pose control (pan +
            // zoom), so it returns a handle rather than null: `getCameraControl()` returns
            // null ONLY when a provider has no pose control AT ALL. The handle's `poseFields`
            // declares exactly the axes this camera has — `distance` and `target`, and NO
            // azimuth/elevation/roll — so a host hides the angular affordances by FIELD
            // PRESENCE (the `roll`/`move()` capability idiom) and never asks "is this 2D?".
            //
            // All handle discipline carries over unchanged from the 3D camera: `setOrbit`
            // applies a PATCH (only the keys mentioned), `getOrbit` returns the whole bag
            // value-exact so a captured pose round-trips, a present non-finite value THROWS
            // (throw-or-apply — a silent clamp would leave the camera in a plausible wrong
            // place with no diagnostic), and `setPreset` is a FULL framing reset.
            getCameraControl: function () {
                var geom = Camera2dGeometry;
                function _finite(v, name, where) {
                    if (typeof v === 'number' && isFinite(v)) { return v; }
                    throw new Error('p5-provider camera ' + where + ': ' + name +
                        ' must be a finite number, got ' + String(v) +
                        ' — throw-or-apply, never a silent clamp.');
                }
                function _presets() { return geom.PRESETS_2D(_physW(), _physH()); }
                var ctl = {
                    // FERRIED from the geometry authority, exactly as the 3D handle ferries
                    // its own preset table — the provider holds no declarative data.
                    presets: Object.keys(_presets()),
                    poseFields: geom.POSE_FIELDS_2D(_physW(), _physH()),
                    setOrbit: function (spec) {
                        if (!spec) { return; }
                        // POINT SHAPE FIRST, at the ONE owner: `{x,y,z}` and `[x,y,z]` both
                        // arrive here as the canonical object form, and a malformed point has
                        // already thrown the same message the 3D handle throws.
                        spec = OrbitBag.normalizeOrbitPatch(spec);
                        var pose = _poseOrDefault();
                        if (spec.distance !== undefined) {
                            var d = _finite(spec.distance, 'distance', 'setOrbit');
                            if (d <= 0) {
                                throw new Error('p5-provider camera setOrbit: distance is the VISIBLE ' +
                                    'HEIGHT in physics px and must be > 0, got ' + d + '. (FAIL-LOUD.)');
                            }
                            pose.distance = d;
                        }
                        // `target` is only touched when the spec MENTIONS it, so a zoom write
                        // never silently re-centres. An explicit `target:null` re-centres.
                        // The point is already normalized (object form or null); this camera
                        // PROJECTS it — it stores {x,y} and ignores z, which is what "the 2D
                        // pose is the degenerate orbit bag" means at the storage level.
                        if ('target' in spec) {
                            var t = spec.target;
                            pose.target = t ? { x: t.x, y: t.y } : null;
                        }
                        // An angular key is a REAL mistake here, not a no-op: silently
                        // ignoring it would let a 3D camera path path "run" in 2D and produce
                        // fabricated evidence. The handle declares what it has; asking for
                        // more fails loud.
                        // The angular axes are named once, at the pose-vocabulary owner.
                        var angular = OrbitBag.ANGULAR_FIELDS;
                        for (var i = 0; i < angular.length; i++) {
                            if (spec[angular[i]] !== undefined) {
                                throw new Error('p5-provider camera setOrbit: this camera declares no "' +
                                    angular[i] + '" axis (2D pose is {distance, target}). Check ' +
                                    'cameraControl.poseFields rather than assuming a mode. (FAIL-LOUD.)');
                            }
                        }
                        _notifyPose();
                    },
                    getOrbit: function () { return _poseBag(); },
                    // addPoseListener(fn) → unsubscribe — the POSE-CHANGE NOTICE: `fn(bag)` runs
                    // after EVERY pose write, with the getOrbit() bag (RENDERER_CONTRACT §1a.2).
                    addPoseListener: function (fn) {
                        if (!_poseNotice) { _poseNotice = OrbitBag.makePoseNotice(); }
                        return _poseNotice.add(fn);
                    },
                    setPreset: function (name) {
                        // A preset is a FULL framing reset — the reliable way back. A name this
                        // camera does not offer THROWS (a silent no-op would leave a saved or
                        // written preset doing nothing with no signal).
                        var all = _presets(), p = all[name];
                        if (!p) {
                            throw new Error('[p5-provider camera] setPreset("' + name + '"): this camera offers ' +
                                'only [' + Object.keys(all).join(', ') + '] (ctl.presets). (FAIL-LOUD.)');
                        }
                        ctl.setOrbit(p);
                    }
                    // No look()/move(): this camera has no angular axes and no dolly beyond
                    // `distance`. Their ABSENCE is the capability check (the move() precedent).
                };
                return ctl;
            },

            // ── projection (OPTIONAL capability — the scene's camera intrinsics) ──
            // RENDERER_CONTRACT §1a.5 + §9: the DISPLAY provider is boot-fixed (swapping it
            // is a reload) while OBSERVERS are live and own no projection — so this is
            // scene-level and rides the SceneRecord, not each still. p5's 2D mode is the
            // `affine2d` map — the per-still pan/zoom terms live on the still's own `pose`,
            // which is where mutable state belongs.
            projection: function () {
                return { kind: 'affine2d' };
            },

            // ── captureStill (OPTIONAL capability — the `composite` tap executor) ──
            // RENDERER_CONTRACT §1a.4. The 2D-canvas readback: `getImageData` is already
            // RGBA, row-major, TOP-LEFT, and a 2D canvas PERSISTS between draws, so no flip
            // and no re-render is needed (contrast the GL path). All bag assembly, the length
            // check and the blank-buffer guard live in the shared owner. Returns a Promise per
            // the frozen signature (a WebGPU backend's only readback is async).
            //
            // `filtersApplied` is read from THIS provider's own ordered `_filters` list — the
            // one ordered authority, and the only one that sees a direct BYO `prov.filter()`.
            captureStill: function () {
                var common = CaptureStillCommon;
                var bag = common.captureFrom2dCanvas(_getP5Canvas(), {
                    cssWidth:  _physW(),
                    cssHeight: _physH(),
                    physicsW:  _physW(),
                    physicsH:  _physH(),
                    filtersApplied: _filters.map(function (f) { return f.name; }),
                    renderBaseCanvas: _lastRenderBaseCanvas,
                    filterTime: _lastFilterTime,
                    // The TickData these canvas pixels were drawn from → `renderedTick`.
                    composited: _lastTickData
                });
                return Promise.resolve(bag);
            },

            get initialized() { return _initialized; }
        };

        return provider;
    }

export { makeP5Provider, _renderCapabilitiesP5 };
