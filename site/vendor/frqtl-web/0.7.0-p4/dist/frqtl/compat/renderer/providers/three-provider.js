/* Copyright 2023-2026 by Essam Abadir */

/**
 * threeProvider — RendererProvider backed by three.js (WebGL2).
 *
 * Implements the RendererProvider interface (renderer-provider-contract.js):
 *   init({ parentEl, width, height })   (parentEl REQUIRED: requireMountHost)
 *   renderTick(tickData, largeObjects)
 *   filter(filterSpec) / removeFilter(name)
 *   setSize(width, height)
 *   start() / stop()
 *   destroy()
 *   raw()
 *   captureStill()          — OPTIONAL (the `composite` stage tap; same-task GL readback)
 *
 * Design (§3 from WS_RENDERER_SHIM_DESIGN.md):
 *   - Retained-mode: geometry/material/mesh created ONCE in init(), buffers mutated
 *     each tick. NEVER recreates geometry per tick.
 *   - Quanta → Points geometry (MAX pre-allocated; draw range adjusted per tick).
 *   - Large objects → Box/Circle geometries created once, visibility toggled.
 *   - Orthographic camera maps physics-pixel space exactly (top-left origin, y-down).
 *   - Field → DataTexture for water filter (§7).
 *   - Filter passes → three.js WebGLRenderTarget + ShaderMaterial full-screen quad.
 *
 * Dependencies:
 *   - three.js (the vendored r128 UMD), reached ONLY through compat/vendor.js `three()`.
 *
 * FAIL-LOUD contract:
 *   makeThreeProvider() throws (and the boot module paints the overlay) if three is not
 *   loaded. Never silently falls back to the p5 provider.
 */

import { three, meshLoadersBase } from '../../vendor.js';
import * as CaptureStillCommon from '../captureStill-common.js';
import { FieldBuilder } from '../FieldBuilder.js';
import * as FieldDescriptorSchema from '../../../../shim/field-descriptor/index.js';
import { Filters } from '../Filters.js';
import * as FrameDataSchema from '../../../../shim/frame-data/index.js';
import * as GodraysLayer from './godrays-layer.js';
import { LightColor } from '../../../parts/LightColor.js';
import * as LoDrawnCenter from '../lo-drawn-center.js';
import * as OrbitBag from '../orbit-bag.js';
import * as RenderCapabilitiesCommon from '../renderCapabilities-common.js';
import { RenderFamily } from '../RenderFamily.js';
import { RenderMesh } from '../RenderMesh.js';
import { RenderShape } from '../RenderShape.js';
import * as RendererProviderContract from '../renderer-provider-contract.js';
import * as ThreeCameraContract from './three-camera-contract.js';
import * as ThreeCameraGeometry from './three-camera-geometry.js';


    // Shader: vertex — passes position + CPU-computed color/alpha to fragment.
    // Color comes from LightColor (canonical single source) via per-particle aColor/aAlpha
    // attributes, filled on the CPU each tick. No color spectrum in any shader.
    var QUANTA_VERT = [
        'attribute float aFullness;',
        'attribute vec3  aColor;',
        'attribute float aAlpha;',
        'attribute float aSize;',           // voxel dimension (frame rect.w) — R4-C smoke puff size
        'attribute float aSmoke;',          // per-frame smoke flag (1 = this frame renders as a puff)
        'uniform float uPersp;',            // 1 in 3D (perspective): attenuate point size by depth
        'uniform float uSmoke;',            // 0 = off; >0 = puff size scale per voxel-dimension px (R4-C)
        'varying vec3  vColor;',
        'varying float vAlpha;',
        'varying float vFull;',
        'varying float vSmoke;',
        'void main() {',
        '  vColor = aColor;',
        '  vAlpha = aAlpha;',
        '  vFull  = aFullness;',
        '  vSmoke = aSmoke;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  float size;',
        '  if (uSmoke > 0.0 && aSmoke > 0.5) {',
        // Smoke render-half: size the sprite by the voxel dimension (emergent frame size
        // from Thread B physics) — bigger parented frames draw as bigger puffs. World-px
        // diameter in 2D (ortho 1:1); perspective-attenuated by depth in 3D.
        '    float world = max(2.0, aSize * uSmoke);',
        '    size = mix(world, world * (800.0 / max(1.0, -mv.z)), uPersp);',
        '  } else {',
        // DEFAULT render: the VOXEL SIZE (aSize = frame rect.w) drives the render size —
        // matching the 2D p5/Chroma renderer (color + alpha come from fullness on the CPU).
        // A 1px quantum → ~2px point; a Dim-6 64px voxel → 64px. (2px floor for visibility.)
        '    float base = max(2.0, aSize);',
        '    size = mix(base, base * (800.0 / max(1.0, -mv.z)), uPersp);',
        '  }',
        '  gl_PointSize = size;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
    ].join('\n');

    // Shader: fragment — glow envelope ONLY; color read from vColor/vAlpha (CPU LightColor).
    // No cold/hot spectrum; no fullness→color calculation here. Single-source rule.
    var QUANTA_FRAG = [
        'uniform float uIntensity;',        // glow gain (additive bloom knob; R4-A)
        'uniform float uHeat;',             // 0..1 heat ramp: shift dense quanta warmer
        'uniform float uSmoke;',            // >0 = soft translucent puff falloff (R4-C)
        'uniform float uShape;',            // 0 = ball (round glow); 1 = box (filled square @ voxel size)
        'varying vec3  vColor;',
        'varying float vAlpha;',
        'varying float vFull;',
        'varying float vSmoke;',
        'void main() {',
        '  vec2 c = gl_PointCoord - 0.5;',
        // BOX shader (uShape=1): the point sprite IS a quad, so a Chebyshev-distance fill draws
        // a solid square at the voxel size (1 Dim-0 = 1 px). A bright rim shows the box edge so
        // the boxes-of-balls and their overlap/abutment read clearly. Same frame data, diff shader.
        '  if (uShape > 0.5) {',
        '    float e = max(abs(c.x), abs(c.y)) * 2.0;',     // 0 at centre → 1 at the edge
        '    if (e > 1.0) discard;',
        '    float rim = smoothstep(0.80, 1.0, e);',
        '    vec3 bcol = mix(vColor, vColor + vec3(0.55, 0.18, -0.25) * vFull, uHeat);',
        '    bcol = mix(bcol, vec3(1.0), rim * 0.6);',       // bright outline
        '    float ba = clamp(vAlpha, 0.15, 1.0) * uIntensity;',  // fullness → alpha (min for visibility)
        '    gl_FragColor = vec4(bcol * ba, ba);',
        '    return;',
        '  }',
        '  float d = length(c) * 2.0;',
        '  float glow = smoothstep(1.0, 0.0, d);',
        // Smoke puff: softer, dimmer edge so overlapping puffs build up cloudily.
        '  if (uSmoke > 0.0 && vSmoke > 0.5) { glow = pow(glow, 0.6) * 0.5; }',
        '  float a = glow * vAlpha * uIntensity;',
        '  vec3 col = mix(vColor, vColor + vec3(0.55, 0.18, -0.25) * vFull, uHeat);',
        '  gl_FragColor = vec4(col * a, a);',
        '}'
    ].join('\n');

    // Full-screen quad vertex for post-process passes
    var QUAD_VERT = [
        'varying vec2 vTexCoord;',
        'void main() {',
        '  vTexCoord = uv;',
        '  gl_Position = vec4(position, 1.0);',
        '}'
    ].join('\n');

    // ── LO SKIN — the ONE derivation of "what colour/opacity an LO is painted" ──
    //
    // Per-face brightness fakes directional shading (the scene carries no lights) so a
    // box reads as a solid 3D object. Face order +x,-x,+y,-y,+z,-z. ONE table: the box
    // branch, the liveCanvas-slab branch and the per-frame refresh all index THIS array
    // (three hand-copies of the same six numbers was a mirror waiting to drift).
    var LO_FACE_MUL = [0.92, 0.72, 1.0, 0.6, 0.86, 0.78];

    /**
     * The LO's LIVE skin — colour (0-255 triple) + normalized opacity.
     * `lo.color` / `lo.alpha` are the canonical render-only fields the property
     * accessor writes (ObjectSchema `engineVisible:false`); the renderer DERIVES
     * what it paints from them rather than baking them once at mesh build.
     * @param {Object} lo
     * @returns {{color:Array<number>, alpha:number}}
     */
    function loSkin(lo) {
        return {
            color: (lo && lo.color) || [200, 200, 200],
            alpha: (lo && lo.alpha !== undefined) ? lo.alpha / 255 : 1.0
        };
    }

    /** A change-detection signature for `loSkin` — the per-frame refresh below only
     *  touches materials when this moves (a colour edit is rare; the scan is not). */
    function loSkinSig(lo) {
        var s = loSkin(lo);
        return s.color.join(',') + '|' + s.alpha;
    }

    /**
     * Re-paint an ALREADY-BUILT mesh's material(s) from the LO's live skin.
     *
     * ── Layer 1: API contract ────────────────────────────────────────────────
     * `materials` is a single material or the per-face array (index → LO_FACE_MUL,
     * the same order `_buildLoMesh` builds with). Pure with respect to THREE: it
     * only calls `material.color.setRGB` / sets `opacity`/`transparent`/`depthWrite`,
     * so it is unit-testable with plain fake materials.
     *
     * TWO rules it must not break:
     *   - a material carrying a `map` (a ferried liveCanvas / sprite surface) is
     *     NEVER tinted — only its opacity follows (`_buildLoMesh` forces white on
     *     those for the same reason);
     *   - translucency keeps the "read-not-write" depth convention (`depthWrite`
     *     only for a fully opaque LO), so a transparent wall stops occluding the
     *     quanta behind it instead of punching a hole in them.
     *
     * @param {Object|Array} materials
     * @param {Object} lo
     * @returns {{color:Array<number>, alpha:number}} the applied skin.
     */
    function applyLoSkin(materials, lo) {
        var s = loSkin(lo);
        var list = Array.isArray(materials) ? materials : [materials];
        var perFace = (list.length === LO_FACE_MUL.length);
        for (var i = 0; i < list.length; i++) {
            var m = list[i];
            if (!m) { continue; }
            var mul = perFace ? LO_FACE_MUL[i] : 1;
            if (!m.map && m.color && typeof m.color.setRGB === 'function') {
                m.color.setRGB((s.color[0] / 255) * mul, (s.color[1] / 255) * mul, (s.color[2] / 255) * mul);
            }
            var wantTransparent = m.map ? true : (s.alpha < 1.0);
            if (m.transparent !== wantTransparent) { m.transparent = wantTransparent; m.needsUpdate = true; }
            m.opacity    = s.alpha;
            m.depthWrite = (s.alpha >= 1.0);
        }
        return s;
    }







    // THE one field source (FieldBuilder.buildHeightField). An absent FieldBuilder is a load-order
    // fault, never a skipped field update — the same rule capture.js's `field` tap throws on.

    // ── renderCapabilities() (OPTIONAL contract method — S5a) ────────────────
    //
    // Studio Controls Realignment §7 r2 item 2/4 — see p5-provider.js's
    // identical-purpose block for the full rationale (getCameraControl()
    // optional-capability precedent; per-provider truth; module-level free
    // function so no live WebGL/THREE context is required to call it —
    // capability DESCRIPTORS are static metadata, live VALUES are read via
    // FrqtlApp.getRenderOption/isFilterActive). three.js additionally
    // declares the R4/R5 effect-layer knobs (godrays/godrayDensity/
    // glowIntensity/heat/smoke) — p5 has no such render path (grep confirms;
    // see p5-provider.js's own capability list, which omits them).
    // S5b DRY tidy (the 3
    // universal descriptors + the filter loop were hand-copied between this
    // file and p5-provider.js): the ONE shared owner is now
    // `renderCapabilities-common.js` — see that file's own docstring.


    function _renderCapabilitiesThree() {
        var normalizeFieldDescriptor = FieldDescriptorSchema.normalizeFieldDescriptor;
        var RenderShapeRef = RenderShape;
        var FrameDataSchemaRef = FrameDataSchema;
        var FiltersRef = Filters;
        var common = RenderCapabilitiesCommon;

        var caps = common.universalRenderCapabilities(normalizeFieldDescriptor, RenderShapeRef, FrameDataSchemaRef).concat([
            // ── three-only R4/R5 effect-layer knobs (the fx-* pages' ──────────────
            //    renderDefaults keys — bounds
            //    match the values already hardcoded per-page today, verified against
            //    _renderTick's opts.godrays/godrayDensity/glowIntensity/heat/smoke reads).
            normalizeFieldDescriptor({
                name: 'godrays', type: 'number', unit: 'intensity', default: 0,
                constraint: { min: 0, max: 3, integer: false },
                description: 'God-rays post-process composite intensity (three-only final-composite layer).'
            }),
            normalizeFieldDescriptor({
                name: 'godrayDensity', type: 'number', unit: 'density', default: 0.8,
                constraint: { min: 0.2, max: 1.5, integer: false },
                description: 'God-rays radial-blur density/spread (only consulted when godrays > 0).'
            }),
            normalizeFieldDescriptor({
                name: 'godraySource', type: 'enum', default: GodraysLayer.GODRAY_SOURCE_DEFAULT,
                constraint: { values: GodraysLayer.GODRAY_SOURCES.reduce(function (m, v) { m[v] = v; return m; }, {}) },
                description: "What the god-rays are computed from: 'leaf' = the fundamental-layer frames " +
                    "(LOs only occlude), 'all' = the whole lit scene (every frame of every layer and every LO)."
            }),
            normalizeFieldDescriptor({
                name: 'godrayMode', type: 'enum', default: GodraysLayer.GODRAY_MODE_DEFAULT,
                constraint: { values: GodraysLayer.GODRAY_MODES.reduce(function (m, v) { m[v] = v; return m; }, {}) },
                description: "How the god-rays are computed: 'streak' = each source frame trails a streak behind " +
                    "its direction of travel, 'field' = each pixel marches along the local direction of travel, " +
                    "'radial' = each pixel marches toward one light point (the source frames' centroid)."
            }),
            normalizeFieldDescriptor({
                name: 'glowIntensity', type: 'number', unit: 'intensity', default: 0,
                constraint: { min: 0, max: 3, integer: false },
                description: 'Per-dim glow-layer intensity multiplier (R4-GEO additive glow shading).'
            }),
            normalizeFieldDescriptor({
                name: 'heat', type: 'number', unit: '0-1', default: 0,
                constraint: { min: 0, max: 1, integer: false },
                description: 'Heat-ramp shift: warms dense-quanta color toward the hot end of the scheme.'
            }),
            normalizeFieldDescriptor({
                name: 'smoke', type: 'number', unit: 'intensity', default: 0,
                constraint: { min: 0, max: 16, integer: false },
                description: 'Smoke-puff layer intensity (per-dim greyscale+soft paint gate).'
            })
        ]).concat(common.meshRenderCapabilities(normalizeFieldDescriptor))
          .concat(common.filterRenderCapabilities(normalizeFieldDescriptor, FiltersRef));

        return caps;
    }

    // ── Factory ─────────────────────────────────────────────────────────────

    /**
     * @param {{is3D?: boolean}} [cfg] — the 3D-ness the provider starts with (default false). A host
     *   normally states it at init(opts) (FrqtlApp.createCanvas → {is3D, depth}); a harness that
     *   reads the camera handle without a WebGL init states it here.
     */
    function makeThreeProvider(cfg) {
        var THREE = three();   // the vendor's one reader (compat/vendor.js) — throws until three is loaded

        // The runner's physics rect, stated by init({width, height}) / setSize(w, h). null until
        // then: every read goes through _physW()/_physH(), which THROW before it is stated — a
        // provider has no size of its own (RENDERER_CONTRACT §1 init row).
        var _width    = null;
        var _height   = null;
        function _unsized() {
            return new Error('threeProvider: the physics rect was read before init({width, height}) or ' +
                'setSize(w, h) stated it. FrqtlApp.createCanvas hands the runner\'s canvas_rect to ' +
                'provider.init — the provider has no default size.');
        }
        function _physW() { if (_width === null) { throw _unsized(); } return _width; }
        function _physH() { if (_height === null) { throw _unsized(); } return _height; }

        // three.js core objects (created once in init)
        var _renderer  = null;
        var _scene     = null;
        var _camera    = null;
        var _canvas    = null;   // the HTMLCanvasElement inside the renderer

        // ── 3D camera mode (opt-in) ──────────────────────────────────────────
        // 2D (default): the top-down OrthographicCamera below — every existing
        //   experiment is byte-unchanged.
        // 3D: an orbit PerspectiveCamera, opted into by the host's init opts (`is3D`, from
        //   exp.createScene or a page's `new FrqtlApp({is3D:true})`). The orbit state is
        //   driven by getCameraControl().setOrbit() — the sugar handle the experiment wires
        //   a widget to (mirrors temperatureControl).
        var _is3D    = !!(cfg && cfg.is3D);   // (re)stated by _init(opts) — 3D only when told so
        var _depth   = null;    // the world z-extent the host declared (createScene's d)
        // Render SHAPE: resolved per-tick by RenderShape.resolve(frame, renderOpts) from the
        // priority chain: per-frame render.shape string_map key > setRenderOption('shape',...)
        // default > 'ball'. The construction-time _egptRenderShape global is DELETED — it was
        // construction-time only and had no p5 parity. RenderShape.js is the one shape authority.
        // _currentShapeUniform is set in _renderTick from the experiment's render options.
        var _currentShapeUniform = 0.0;   // 0 = ball (default), 1 = box
        // Default orientation convention (STAGE 2): x/y = the vertical screen plane,
        // z toward the viewer (right-handed). The scene initially orients with the camera looking
        // STRAIGHT AT the x/y plane from the +z edge of the canvas cube — that is az=0, el=0
        // (pos = (cx, cy, cz+d), forward = (0,0,-1) into the screen). Scene setup = moving the
        // camera RELATIVE to this start. (Was {35,22} = a 3/4 view; now straight-on-z.) Distance
        // is still derived from canvas size at _init (Math.max(w,h)*1.6 — "the edge of the cube").
        // Explicit-camera experiment pages (initialOrbit/setPreset/setOrbit) are UNAFFECTED; only
        // bare-default 3D pages re-base to straight-on-z (build report enumerates them).
        // `target` is the point the orbit revolves around: null = the scene centre
        // (every existing scene), or a walked {x,y,z} once `move()` is used.
        // `roll` is the rotation about the VIEW AXIS (the horizon tilt), degrees,
        // default 0 — the fifth pose coordinate; it WRAPS and is never clamped.
        var _orbit   = { azimuth: 0, elevation: 0, distance: 0, roll: 0, target: null };  // distance set in _init from canvas size

        // Point the live camera at whatever the orbit bag currently says. This
        // function POSITIONS a camera — it derives NOTHING: the eye, the look-at
        // centre and the up-vector all come from the ONE camera authority
        // (three-camera-geometry.js `_orbitCameraBasis` / `_orbitCenter`), which is
        // the SAME basis MOVE-strafe, screenToWorld, the carry pin and the picking
        // ray consume. Two mirrors used to live here — a hand-copied az/el position
        // formula and a hardcoded physics-y-down up-vector literal — and a roll
        // applied to either of them would have rolled the PICTURE while every other
        // consumer kept an unrolled basis. Both are DELETED; this is now a four-line
        // ferry, and a source gate asserts no up-vector literal ever comes back
        // (camera-roll-geometry.test.mjs).
        //
        // It is also the ONE place a pose write lands (setOrbit, look, move, setPreset, a
        // resize), so it is where the POSE-CHANGE NOTICE fires: every write reaches every
        // `addPoseListener` subscriber, whichever surface made it.
        function _applyOrbit() {
            if (!_is3D) { return; }
            if (_camera) {
                var _g = ThreeCameraGeometry;
                var c = _g._orbitCenter(_orbit, _physW(), _physH());
                var b = _g._orbitCameraBasis(_orbit, _physW(), _physH());
                _camera.position.set(b.pos.x, b.pos.y, b.pos.z);
                _camera.up.set(b.up.x, b.up.y, b.up.z);   // DERIVED (rolled), never a literal
                _camera.lookAt(c.x, c.y, c.z);
                _camera.updateProjectionMatrix();
            }
            if (_poseNotice) { _poseNotice.notify(_orbitBag()); }
        }

        // The whole pose bag, COPIED (a captured pose must not keep tracking the camera): what
        // getOrbit() returns and what every pose-change listener receives.
        function _orbitBag() {
            return {
                azimuth: _orbit.azimuth, elevation: _orbit.elevation, distance: _orbit.distance,
                // ROLL is a DECLARED field: a roll-capable provider always returns it as a
                // number, so a consumer's capability check is `typeof cam.getOrbit().roll ===
                // 'number'` — field presence, the peer of move()'s method presence. Absent ⇒
                // hide the affordance, never substitute a different rotation.
                roll: _orbit.roll,
                // Carried so a captured pose ROUND-TRIPS through setOrbit (a saved project
                // restores the walk, not just the look).
                target: _orbit.target
                    ? { x: _orbit.target.x, y: _orbit.target.y, z: _orbit.target.z } : null
            };
        }

        // The pose-change listener list (OrbitBag.makePoseNotice), provider-scoped so every
        // handle getCameraControl() returns shares it. Created on the first subscription.
        var _poseNotice = null;

        // ── Per-dim render layers (R4-GEO, the geometry-aware effects design) ──────────
        // Replaces the old single _quantaMesh (all non-flash dims merged) + _flashMesh
        // (all flash-eligible dims merged) pair with ONE THREE.Points object per
        // POPULATED (dim, family) bucket — family 'A' (additive, the flash/hot family)
        // or 'N' (normal-blend, everything else). "Dim decides APPEARANCE, position
        // decides OCCLUSION": a frame's dim and the glow/smoke options pick
        // its color/alpha/blend/paint; every bucket depth-READS (so walls occlude quanta
        // for real — the root-cause fix) but does NOT depth-write (translucent layers
        // never occlude each other via the z-buffer alone — that ordering is the
        // explicit camera-distance renderOrder sort in `_renderTick`, painter's
        // algorithm). This is what lets smoke in front of the flash dim it, and the
        // existing 3-pass god-ray march (UNCHANGED, zero new shader math) becomes
        // geometry-correct for free once the image it reads is honest. No parent/leaf
        // distinction: "Dim 4 is smoke and Dim 5 is smoke — just different sizes."
        // Buckets are created lazily (retained-mode: create once, mutate buffers,
        // grow-on-demand — same discipline as the LO mesh Map below) and never
        // disposed (an idle, hidden bucket is cheap; mirrors the LO-by-reference Map).
        var _dimLayers = {};             // key "<dim>|A"/"<dim>|N" -> entry (see _ensureDimLayer)
        var _DIM_LAYER_INITIAL_CAP = 2048;

        function _makeDimLayerBuffers(cap) {
            return {
                cap:      cap,
                posArr:   new Float32Array(cap * 3),
                fullArr:  new Float32Array(cap),
                colArr:   new Float32Array(cap * 3),   // CPU-computed LightColor (0-1 range)
                alphaArr: new Float32Array(cap),
                sizeArr:  new Float32Array(cap),        // voxel dimension (frame rect.w; R4-C)
                smokeArr: new Float32Array(cap)          // paint==='soft' puff-size gate (R4-C, reused verbatim)
            };
        }

        // One THREE object per (dim, family) bucket. `isAdditive` picks blending +
        // whether the material carries a `uShape` uniform (mirrors the pre-existing
        // _quantaMat-vs-_flashMat asymmetry: flash quanta never switch ball/box shape).
        // `paint` picks the MESH KIND: 'sphere' -> a THREE.InstancedMesh (R6, 2026-07-03,
        // this bucket's row-purity-locked paint never changes mid-run — see the
        // row-purity structural test — so deciding the mesh kind ONCE at creation is safe);
        // 'crisp'/'soft' -> the existing ShaderMaterial Points bucket, unchanged below.
        function _ensureDimLayer(key, isAdditive, paint) {
            var entry = _dimLayers[key];
            if (entry) { return entry; }

            if (paint === 'sphere') {
                var sphereMesh = _buildSphereInstancedMesh(_DIM_LAYER_INITIAL_CAP);
                sphereMesh.visible = false;
                _scene.add(sphereMesh);
                entry = { isSphere: true, mesh: sphereMesh, capacity: _DIM_LAYER_INITIAL_CAP, centroid: { x: 0, y: 0, z: 0 } };
                _dimLayers[key] = entry;
                return entry;
            }

            var bufs = _makeDimLayerBuffers(_DIM_LAYER_INITIAL_CAP);
            var geo = new THREE.BufferGeometry();
            geo.setAttribute('position',  new THREE.BufferAttribute(bufs.posArr,  3));
            geo.setAttribute('aFullness', new THREE.BufferAttribute(bufs.fullArr, 1));
            geo.setAttribute('aColor',    new THREE.BufferAttribute(bufs.colArr,  3));
            geo.setAttribute('aAlpha',    new THREE.BufferAttribute(bufs.alphaArr, 1));
            geo.setAttribute('aSize',     new THREE.BufferAttribute(bufs.sizeArr, 1));
            geo.setAttribute('aSmoke',    new THREE.BufferAttribute(bufs.smokeArr, 1));
            geo.setDrawRange(0, 0);

            var uniforms = {
                uIntensity: { value: 1.0 },
                uHeat:      { value: 0.0 },
                uSmoke:     { value: 0.0 },
                uPersp:     { value: _is3D ? 1.0 : 0.0 }
            };
            if (!isAdditive) { uniforms.uShape = { value: _currentShapeUniform }; }

            var mat = new THREE.ShaderMaterial({
                vertexShader:   QUANTA_VERT,
                fragmentShader: QUANTA_FRAG,
                transparent:    true,
                // depth-READ (walls/any depth-writing geometry occludes quanta for
                // real); depth-WRITE stays OFF ("read not write"). Layer
                // vs layer visual ordering is the explicit renderOrder sort below.
                depthTest:  true,
                depthWrite: false,
                uniforms: uniforms
            });
            if (isAdditive) { mat.blending = THREE.AdditiveBlending; }

            var mesh = new THREE.Points(geo, mat);
            mesh.visible = false;
            _scene.add(mesh);

            entry = { geo: geo, mat: mat, mesh: mesh, isAdditive: isAdditive, bufs: bufs, centroid: { x: 0, y: 0, z: 0 } };
            _dimLayers[key] = entry;
            return entry;
        }

        function _growDimLayerIfNeeded(entry, needed) {
            if (entry.isSphere) {
                if (needed <= entry.capacity) { return; }
                var newSphereCap = entry.capacity;
                while (newSphereCap < needed) { newSphereCap = newSphereCap * 2; }
                // InstancedMesh capacity is fixed at construction (no growable buffer like
                // BufferGeometry attributes) — grow-by-recreate, mirroring _ensureCubeMesh's
                // own grow path exactly (dispose the old mesh, build a fresh bigger one,
                // preserve visibility/renderOrder across the swap).
                var oldSphereMesh = entry.mesh;
                var newSphereMesh = _buildSphereInstancedMesh(newSphereCap);
                newSphereMesh.visible     = oldSphereMesh.visible;
                newSphereMesh.renderOrder = oldSphereMesh.renderOrder;
                _scene.remove(oldSphereMesh);
                oldSphereMesh.dispose();
                _scene.add(newSphereMesh);
                entry.mesh = newSphereMesh;
                entry.capacity = newSphereCap;
                return;
            }
            if (needed <= entry.bufs.cap) { return; }
            var newCap = entry.bufs.cap;
            while (newCap < needed) { newCap = newCap * 2; }
            entry.bufs = _makeDimLayerBuffers(newCap);
            entry.geo.setAttribute('position',  new THREE.BufferAttribute(entry.bufs.posArr,  3));
            entry.geo.setAttribute('aFullness', new THREE.BufferAttribute(entry.bufs.fullArr, 1));
            entry.geo.setAttribute('aColor',    new THREE.BufferAttribute(entry.bufs.colArr,  3));
            entry.geo.setAttribute('aAlpha',    new THREE.BufferAttribute(entry.bufs.alphaArr, 1));
            entry.geo.setAttribute('aSize',     new THREE.BufferAttribute(entry.bufs.sizeArr, 1));
            entry.geo.setAttribute('aSmoke',    new THREE.BufferAttribute(entry.bufs.smokeArr, 1));
        }

        function _hideAllDimLayers() {
            for (var k in _dimLayers) {
                if (_dimLayers.hasOwnProperty(k)) { _dimLayers[k].mesh.visible = false; }
            }
        }

        // Squared distance from the active camera to a dim-layer's centroid — plain
        // arithmetic (no THREE.Vector3 allocation) for the per-tick sort below.
        function _camDistSq(c) {
            var dx = c.x - _camera.position.x, dy = c.y - _camera.position.y, dz = c.z - _camera.position.z;
            return dx * dx + dy * dy + dz * dz;
        }

        // Large objects: Map keyed by the LO OBJECT REFERENCE → { mesh, sig }. Keying by
        // identity (not position) lets a MOVING LO (e.g. a Bullet) reuse its single mesh and
        // just update its position each frame — no mesh-per-tick leak. The mesh is rebuilt only
        // when the LO's SHAPE/skin signature (size, circle-vs-rect, renderHint/sprite) changes.
        var _loMeshes = new Map();

        // ── Cube instanced-mesh layer (3D + shape='cube' only) ──────────────────
        // When the experiment opts in via setRenderOption('shape','cube') AND _is3D, the
        // quanta render as TRUE shaded 3D cube meshes (THREE.InstancedMesh + BoxGeometry +
        // MeshLambertMaterial) instead of flat point-sprites. The existing Points mesh
        // becomes invisible; the cube mesh takes over. Both paths share the same CPU color
        // computation (LightColor). The cube mesh is lazily created on first cube-tick.
        //
        // Gating: RenderShape.isCubeMesh(resolvedShape) && _is3D
        //   → true:  hide Points, show cube InstancedMesh.
        //   → false: show Points (all existing experiments unchanged), hide cube.
        //
        // The AmbientLight + DirectionalLight added in _init are invisible to ShaderMaterial
        // (the Points shader is custom GLSL that ignores the three.js lighting system), so
        // existing experiments are byte-identical to before this change.
        var _cubeMesh     = null;   // THREE.InstancedMesh — created lazily
        var _cubeGeo      = null;   // THREE.BoxGeometry   — created lazily (voxel-sized)
        var _cubeCapacity = 0;      // current max-instance count (grows in powers of 2)
        var _cubeMat4     = null;   // THREE.Matrix4 scratch (reused per-instance, no alloc)
        var _cubeColor    = null;   // THREE.Color scratch (reused per-instance, no alloc)

        // ── Aim feedback layer (opts.aimFeedback — see _updateAimFeedback): the universe cube,
        // the screen-centre reticle, the shadow-surrounds, the lock glyph and the heading ring.
        // Lazily created, toggled .visible + transformed per frame — never rebuilt per tick.
        var _aimCube       = null;   // THREE.LineSegments — universe-bounds wireframe
        var _aimCubeSig    = null;   // last bounds signature (rebuild only on a bounds change)
        var _aimReticle    = null;   // THREE.LineSegments — the screen-centre reticle
        var _aimRing       = null;   // THREE.LineSegments — passive heading ring + spoke
        var _aimLock       = null;   // THREE.LineSegments — the grabbed lock glyph
        var _aimHoverSur   = null;   // shadow-surround for the aimed / grabbed object
        var _aimSelSur     = null;   // shadow-surround for the host selection
        var _feedbackScene = null;   // SEPARATE scene drawn as a final overlay pass AFTER all FX
                                     // composites so bloom/god-rays can never wash it out (G2)

        // ── Sphere InstancedMesh — per-dim baseline (R6, the in-page ───────────────
        // per-dim matrix drawing: Effect=None -> paint:'sphere', "the 2D coloring
        // extended to 3D"). Mirrors the cube InstancedMesh precedent immediately above
        // (SAME pre-created-white-instanceColor / frustumCulled=false / MeshLambertMaterial-
        // reads-instanceColor-for-free gotchas) with ONE difference: cubes share ONE
        // voxel-size for the whole scene (`_ensureCubeMesh(size,...)`), but spheres are
        // PER-(dim,family)-BUCKET (see _dimLayers below) and size PER-INSTANCE via the
        // instance matrix's scale component (frames within one dim can have varying box
        // sizes — "Dim 4 is smoke and Dim 5 is smoke, just different sizes," the same
        // per-dim-not-per-parent-leaf principle applies to spheres) — so ONE shared UNIT
        // sphere geometry (radius 0.5) suffices for every bucket; only the material +
        // InstancedMesh are per-bucket (built in `_buildSphereInstancedMesh`, called
        // from `_ensureDimLayer` when `bucket.paint === 'sphere'`).
        var _sphereGeo    = null;   // THREE.SphereGeometry — SHARED unit sphere (radius 0.5), created once
        var _sphereMat4   = null;   // THREE.Matrix4 scratch (reused per-instance, no alloc)
        var _spherePos    = null;   // THREE.Vector3 scratch (position component of the composed matrix)
        var _sphereQuat   = null;   // THREE.Quaternion scratch — identity, spheres never rotate
        var _sphereScale  = null;   // THREE.Vector3 scratch (scale component — per-instance sizing)
        var _sphereColor  = null;   // THREE.Color scratch (reused per-instance, no alloc)

        // ── render.mesh external-geometry path (3D + render.mesh asset id) ───────
        // When a frame/experiment routes to an external glTF (RenderMesh.resolve), the quanta
        // render as CLONES of the loaded mesh instead of cube/sprite. State:
        var _meshLoader   = null;   // THREE.GLTFLoader (lazy; DRACOLoader attached if present)
        var _meshCache    = {};     // assetId → { status:'loading'|'ready'|'error', scene, norm, error }
        var _meshGroup    = null;   // THREE.Group holding all clones (added to _scene once, lazily)
        // Per-ASSET clone sub-pools (spec §2 clone-pool fix): `assetId -> [Object3D]`. A single
        // flat pool indexed by frame index would let TWO concurrent glTF assets (e.g. a per-frame
        // bullet mesh + a scene-wide default) fight over the same clone slots. Keying the pool by
        // asset id keeps each asset's clones independent, so a per-frame render.mesh (a
        // projectile body) coexists with any other mesh in the same scene.
        var _meshClonesByAsset = {};   // assetId -> pool of cloned Object3D (reused across ticks; extras hidden)

        // Field DataTexture for filter passes (smooth heightfield from FieldBuilder)
        var _fieldFw    = 0;
        var _fieldFh    = 0;
        var _fieldTex   = null;
        var _fieldData  = null;  // Uint8Array(FIELD_OPTS.w * FIELD_OPTS.h)

        // Render targets for post-process
        var _rtA = null;
        var _rtB = null;
        var _quadScene  = null;
        var _quadCamera = null;
        var _quadMeshes = {};   // per-filter name → Mesh

        var _filters = [];       // ordered list of active filterSpec objects

        // ── R4-B god-rays layer (GodraysLayer.makeGodrayPasses; created lazily on first activation) ──
        var _godrays = null;
        var _cubeSourceCount = 0;      // cube instances [0, n) are god-rays source frames
        // The particle objects LAID this tick but hidden from the lit picture (Particles OFF while
        // god rays consume the particle layer): the source pass shows them, the lit scene never does.
        var _particlesLaidHidden = [];

        var _initialized = false;
        var _lastTickData = null;
        // What the LAST composite actually ran with — recorded AT compositing time, never
        // re-read from the runner later: this provider is the authority for what it
        // composited (RENDERER_CONTRACT §1a.4, no caller-supplied provenance), and
        // captureStill() replays _composeFinal with THIS bag so the readback is the same
        // picture. null until the first renderTick = "nothing composited yet".
        var _lastOpts = null;
        var _lastRenderBaseCanvas = null;
        // The `uTime` the LAST final composite fed its filter pass (the contract's filterTime of
        // the rendered tick); null when no filter ran.
        var _lastFilterTime = null;

        // ── Init ─────────────────────────────────────────────────────────────

        function _init(opts) {
            RendererProviderContract.requireProviderSize('threeProvider.init',
                opts && opts.width, opts && opts.height);
            // The mount host is resolved BEFORE any GL resource exists: a missing or unknown
            // canvasParentId throws the contract's sentence, never a body-append (no default mount).
            var host  = RendererProviderContract.requireMountHost('threeProvider.init', opts.parentEl);
            _width    = opts.width;
            _height   = opts.height;
            _is3D     = !!(opts && opts.is3D);
            _depth    = (opts && opts.depth !== undefined) ? opts.depth : null;

            // Renderer
            _renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            _renderer.setSize(_physW(), _physH());
            _renderer.setPixelRatio(1);
            _canvas = _renderer.domElement;

            host.appendChild(_canvas);

            if (_is3D) {
                // 3D: orbit PerspectiveCamera around the scene centre. The fixed-pixel
                // point shader keeps quanta visible at any depth. near/far span the
                // physics-pixel volume generously.
                // CAMERA_FOV_DEG is the ONE vertical-FOV constant, owned by
                // three-camera-geometry.js — the analytic picking ray and this live
                // frustum share it by construction, never a second literal 50.
                _camera = new THREE.PerspectiveCamera(
                    ThreeCameraGeometry.CAMERA_FOV_DEG, _physW() / _physH(), 0.1, 100000);
                _orbit.distance = Math.max(_physW(), _physH()) * 1.6;
                _applyOrbit();
            } else {
                // 2D (default): top-down OrthographicCamera, physics-pixel space, y-down.
                // THREE is y-up by default, so we invert y via the camera bounds
                // (top=0, bottom=_physH()). Unchanged from the pre-3D provider.
                _camera = new THREE.OrthographicCamera(0, _physW(), _physH(), 0, -1, 1);
            }

            _scene = new THREE.Scene();
            _scene.background = new THREE.Color(0x000000);

            // ── Lights for the cube InstancedMesh path ────────────────────────
            // MeshLambertMaterial requires real lights. These have ZERO effect on the
            // existing ShaderMaterial Points mesh (custom GLSL ignores the three.js
            // lighting system). Cost is negligible (two light uniforms uploaded once).
            // Present always (not gated on shape) because shape can change at runtime.
            var _ambient = new THREE.AmbientLight(0xffffff, 0.45);
            _scene.add(_ambient);
            // Key light: angled from upper-right in world space — when the camera orbits,
            // the top/front faces catch the key and the side/back faces go darker, giving
            // depth shading that makes cube faces unambiguous from every orbit angle.
            var _dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
            _dirLight.position.set(1.2, -2.0, 2.5).normalize();   // y is physics-down → -y = "up"
            _scene.add(_dirLight);
            // Scratch objects for the cube path (reused per-frame — zero GC).
            _cubeMat4  = new THREE.Matrix4();
            _cubeColor = new THREE.Color();
            // Scratch objects for the sphere InstancedMesh path (reused per-instance —
            // zero GC, same discipline as the cube scratch objects above).
            _sphereMat4  = new THREE.Matrix4();
            _spherePos   = new THREE.Vector3();
            _sphereQuat  = new THREE.Quaternion();   // stays identity — spheres never rotate
            _sphereScale = new THREE.Vector3();
            _sphereColor = new THREE.Color();

            // Per-dim render layers (_dimLayers) are created LAZILY on first population
            // in `_renderTick` (`_ensureDimLayer`) — there is nothing to build here at
            // init time; unlike the old fixed _quantaMesh/_flashMesh pair, the set of
            // populated dims isn't known until the first tick's frameData arrives.

            // ── Field DataTexture (smooth heightfield from FieldBuilder) ──────
            var fOpts = FieldBuilder.FIELD_OPTS;
            _fieldFw = fOpts.w;
            _fieldFh = fOpts.h;
            _fieldData = new Uint8Array(_fieldFw * _fieldFh);
            _fieldTex  = new THREE.DataTexture(
                _fieldData, _fieldFw, _fieldFh,
                THREE.RedFormat, THREE.UnsignedByteType
            );
            _fieldTex.minFilter = THREE.LinearFilter;
            _fieldTex.magFilter = THREE.LinearFilter;
            _fieldTex.needsUpdate = true;

            // ── Render targets for post-process ───────────────────────────────
            _rtA = new THREE.WebGLRenderTarget(_physW(), _physH());
            _rtB = new THREE.WebGLRenderTarget(_physW(), _physH());

            // Quad scene for full-screen post-process passes
            _quadScene  = new THREE.Scene();
            _quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

            _initialized = true;
        }

        // ── Large objects ─────────────────────────────────────────────────────

        // Shape/skin signature (NOT position): a change here rebuilds the mesh; movement does not.
        // Includes the render.mesh asset id AND its load status, so the async glTF load flipping
        // loading→ready changes the signature and rebuilds the placeholder into the real geometry.
        function _loSig(lo, opts) {
            var meshAsset = RenderMesh.resolve(lo, opts);
            var meshStatus = (meshAsset && _meshCache[meshAsset]) ? _meshCache[meshAsset].status : '';
            // lo.rect.d included (structural fix): box-vs-
            // plane can now be DERIVED from rect.d alone (see _buildLoMesh below) —
            // an LO that never sets the explicit lo.shape/lo.depth hint pair still
            // needs its signature sensitive to rect.d so a depth change rebuilds it.
            return [lo.shape || (lo.drawAsCircle ? 'c' : 'r'), lo.rect.w, lo.rect.h, lo.depth || '', lo.rect.d || '',
                    lo.shellShape || '',   // R3-5: a live shell-shape change rebuilds the mesh
                    lo.renderHint || '', lo.sprite || '',
                    (lo.liveCanvas ? 'L' : ''),   // LiveChart: presence flips to the live-texture plane branch
                    // A renderHint texture is BAKED with the LO's colour (_hintTexture caches by
                    // hint+colour), so for THAT branch alone the colour belongs in the signature.
                    // Every other branch re-derives its colour per frame (applyLoSkin) — colour is
                    // deliberately NOT a general rebuild trigger.
                    (lo.renderHint ? (lo.color || []).join('-') : ''),
                    meshAsset || '', meshStatus, lo.meshScale || '',
                    (lo.meshRotation || []).join('|')].join(',');
        }

        // Resolve a LiveChart LO's CURRENT chart canvas. lo.liveCanvas is an accessor
        // (a function returning the current HTMLCanvasElement — makeChartEnv recreates the
        // canvas each redraw) OR a direct canvas element. Returns the element or null.
        function _resolveLiveCanvas(lo) {
            var lc = lo && lo.liveCanvas;
            if (!lc) { return null; }
            try {
                var cv = (typeof lc === 'function') ? lc() : lc;
                return cv || null;
            } catch (e) { return null; }
        }

        // ── liveCanvas texturing — ONE construction site, orientation derived in WORLD SPACE ──
        //
        // THE FACE→WORLD TABLE. Derived from THREE.BoxGeometry's own six buildPlane()
        // calls (u,v,w axes + udir/vdir signs) and PlaneGeometry's vertex/uv order:
        // for each face, as UV.x runs 0→1 the world coordinate on `uAxis` moves in
        // direction `uDir`; as UV.y runs 0→1 the world coordinate on `vAxis` moves in
        // direction `vDir`. (buildPlane pushes `uv.x = ix/gridX` with world[u] = x·udir,
        // and `uv.y = 1 - iy/gridY` with world[v] = y·vdir — hence vDir = −vdir.)
        //
        //   idx 0 (+x): u=z,uDir=−1  v=y,vDir=+1      idx 3 (−y): u=x,uDir=+1  v=z,vDir=+1
        //   idx 1 (−x): u=z,uDir=+1  v=y,vDir=+1      idx 4 (+z): u=x,uDir=+1  v=y,vDir=+1
        //   idx 2 (+y): u=x,uDir=+1  v=z,vDir=−1      idx 5 (−z): u=x,uDir=−1  v=y,vDir=+1
        //   plane     : u=x,uDir=+1  v=y,vDir=+1
        //
        // The ferried canvas is painted in WORLD-AXIS-INCREASING order (canvas x → the
        // face's horizontal world axis increasing, canvas y → its vertical world axis
        // increasing). So the texture transform is a DERIVATION, never a hand-tuned sign:
        //   flipY = false   — canvas row 0 must sample at UV.y = 0 (the mapping above is
        //                     stated in raw UV, and THREE's default flipY would invert it);
        //   mirrorU/mirrorV — set exactly when that face's uDir/vDir is −1.
        // This is why the same painted canvas reads CORRECT from the front and as the
        // through-the-window MIRROR from behind: both faces show the texel at its true
        // world position, which is what "spatially registered" means. Hand-mirrored signs
        // tuned to one camera are the banned class (see _applyOrbit's own note: the world
        // holds RAW y-down physics values; only camera.up is flipped).
        var LIVE_FACE_UV = [
            { uAxis: 'z', uDir: -1, vAxis: 'y', vDir: 1 },   // 0 +x
            { uAxis: 'z', uDir:  1, vAxis: 'y', vDir: 1 },   // 1 −x
            { uAxis: 'x', uDir:  1, vAxis: 'z', vDir: -1 },  // 2 +y
            { uAxis: 'x', uDir:  1, vAxis: 'z', vDir: 1 },   // 3 −y
            { uAxis: 'x', uDir:  1, vAxis: 'y', vDir: 1 },   // 4 +z
            { uAxis: 'x', uDir: -1, vAxis: 'y', vDir: 1 }    // 5 −z
        ];

        /**
         * The wall's THIN axis (the one its broad faces are normal to), derived from
         * the drawn extents — generic, no per-object hint and no scene special-case.
         * A flat LO (no z-slab) is thin along z by construction.
         * @returns {{axis:'x'|'y'|'z', faces:number[]}} the two face indices to texture.
         */
        function _thinAxisFaces(w, h, d) {
            if (!(d > 0)) { return { axis: 'z', faces: [4, 5] }; }
            if (w <= h && w <= d) { return { axis: 'x', faces: [0, 1] }; }
            if (h <= w && h <= d) { return { axis: 'y', faces: [2, 3] }; }
            return { axis: 'z', faces: [4, 5] };
        }

        /**
         * THE ONE world-texture constructor: every texture an LO carries — a ferried
         * liveCanvas (mesh build + per-frame refresh), a renderHint paint, an lo.sprite
         * image — is built here, so the orientation derivation has exactly one home.
         * @param {HTMLCanvasElement|string} src — a canvas, or an image URL (lo.sprite)
         * @param {{mirrorU:boolean, mirrorV:boolean}} [xf] — from LIVE_FACE_UV.
         */
        function _makeWorldTexture(src, xf) {
            var t = (typeof src === 'string') ? new THREE.TextureLoader().load(src) : new THREE.CanvasTexture(src);
            t.minFilter = THREE.LinearFilter;
            t.flipY = false;
            if (xf && xf.mirrorU) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; }
            if (xf && xf.mirrorV) { t.wrapT = THREE.RepeatWrapping; t.repeat.y = -1; t.offset.y = 1; }
            return t;
        }

        /**
         * THE ONE material shape for a world-textured flat plane (a LiveChart plane, a
         * renderHint paint, an lo.sprite). DoubleSide travels with the world registration:
         * the texel sits at its true world position, so the plane reads from wherever the
         * camera stands — from behind as the through-the-window mirror — and an orbit past
         * 90 degrees never silently blanks it.
         */
        function _worldPlaneMaterial(map, alpha, depthWrite) {
            return new THREE.MeshBasicMaterial({
                map: map, transparent: true, opacity: alpha, depthWrite: depthWrite,
                side: THREE.DoubleSide
            });
        }

        /** The texture transform for a face index (or the flat-plane case, index 4). */
        function _liveFaceTransform(faceIdx) {
            var f = LIVE_FACE_UV[faceIdx] || LIVE_FACE_UV[4];
            return { mirrorU: f.uDir < 0, mirrorV: f.vDir < 0 };
        }

        // Build the THREE.Mesh for one LO (geometry + flat/textured material). Position is set
        // by the caller every frame so a moving LO follows its rect.
        //
        // 3D SUGAR OBJECTS: an LO may declare lo.shape='box' (+ optional lo.depth) — the renderer
        // then WRAPS the conceptual LargeObject with a 3D BoxGeometry (a solid cube of w×h×depth)
        // instead of a flat plane, so it reads as a real 3D object from every angle. This is the
        // first of a family of 3D render shapes the renderer can wrap around an LO (the gun will
        // become one too). The engine/physics never see this — it is a renderer-only field.
        function _buildLoMesh(lo, opts) {
            var alpha = (lo.alpha !== undefined) ? lo.alpha / 255 : 1.0;
            // Deterministic translucency: "translucent LOs read-not-write, opaque LOs write" — the
            // SAME depthTest:true/depthWrite:false convention the per-dim quanta layers
            // already follow (see _ensureDimLayer above). Previously EVERY LO material
            // left depthWrite at its THREE default (true) regardless of opacity, so a
            // translucent LO (e.g. a Tube wall at wallOpacity<1) WROTE depth — whether an
            // interior sprite then read as occluded or visible depended on draw/insertion
            // order, not true 3D position (the wall-occlusion inconsistency: one look saw
            // see-through where another saw near-black — both real, nondeterministic).
            // Generalized here for ANY LO (not a Tube special-case): opaque (alpha>=1, the
            // default when lo.alpha is unset) still writes depth as before — zero change
            // for every existing opaque LO (detector walls, source bodies, etc).
            var loDepthWrite = alpha >= 1.0;

            // ── render.mesh: wrap the LO with an external glTF geometry (highest priority) ──
            // A source-body glTF routes here (lo.mesh = '/frqtl/assets/models/<asset>.glb').
            // Reuses the same async load/cache/normalize helpers as the per-quantum mesh path.
            // The unit-normalized scene is scaled so its max dimension fills the LO's largest
            // rect extent; an optional lo.meshScale / lo.meshRotation tunes fit + orientation.
            var meshAsset = RenderMesh.resolve(lo, opts);
            if (meshAsset) {
                _ensureMeshLoaded(meshAsset);
                var mEntry = _meshCache[meshAsset];
                if (mEntry && mEntry.status === 'ready' && mEntry.scene) {
                    var g = mEntry.scene.clone(true);
                    g.frustumCulled = false;
                    var fit = Math.max(lo.rect.w, lo.rect.h, lo.depth || 0) || lo.rect.w;
                    var mul = (typeof lo.meshScale === 'number' && lo.meshScale > 0) ? lo.meshScale : 1;
                    g.scale.setScalar(fit * mEntry.norm * mul);
                    if (lo.meshRotation) {
                        g.rotation.set(lo.meshRotation[0] || 0, lo.meshRotation[1] || 0, lo.meshRotation[2] || 0);
                    }
                    return g;
                }
                // loading (or errored → _meshFailLoud already fired): empty placeholder. _loSig
                // carries the cache status, so the ready flip re-enters here with real geometry.
                return new THREE.Group();
            }

            // ── liveCanvas: a ferried in-scene surface (LiveChart panel / a detector
            //    wall's own registered heatmap) ───────────────────────────────────────
            // The LO carries an OFFSCREEN canvas on lo.liveCanvas (the R5 ferry contract,
            // peer of sprite/renderHint) — a Chart.js panel canvas, or the bin rectangles
            // a GraphingDetectorWall paints itself. The provider only wraps it as a native
            // THREE.CanvasTexture; nothing above the shim enters the renderer, and there is
            // no new provider capability method (declare-data / provider-derives, exactly
            // like box-vs-plane below). The canvas element can churn per redraw, so
            // _syncLargeObjects re-resolves + refreshes per frame.
            //
            // TWO SHAPES, ONE BEHAVIOR:
            //  • a real z-slab (rect.d>0) → the BOX branch with the canvas on the TWO faces
            //    normal to the wall's THIN axis (derived from the extents — generic) and the
            //    flat wall material on the other four. Both textured faces are opaque, so at
            //    every orbit the camera sees exactly one of them: the map can never disappear.
            //  • no z-slab → the flat plane, kept (free-floating chart planes stay supported)
            //    and now DoubleSide, so it is equally visible from behind.
            // Orientation for BOTH comes from the same world-space derivation
            // (_liveFaceTransform + _makeWorldTexture) — front reads correct, back reads
            // as the through-the-window mirror, because each texel sits at its true world
            // position on the face.
            if (lo.liveCanvas) {
                var liveCv = _resolveLiveCanvas(lo);
                var liveD  = (lo.depth !== undefined && lo.depth > 0) ? lo.depth
                           : ((lo.rect.d !== undefined && lo.rect.d > 0) ? lo.rect.d : 0);
                var pc = lo.color || [30, 40, 55];
                var liveMesh, liveFaces;
                if (liveD > 0) {
                    var thin = _thinAxisFaces(lo.rect.w, lo.rect.h, liveD);
                    var liveBox = new THREE.BoxGeometry(lo.rect.w, lo.rect.h, liveD);
                    // Same per-face brightness as the plain box branch (the ONE
                    // LO_FACE_MUL table), so the four untextured faces read as a solid slab.
                    liveFaces = [];
                    var liveMats = LO_FACE_MUL.map(function (m, idx) {
                        var isFace = thin.faces.indexOf(idx) !== -1;
                        if (isFace && liveCv) {
                            var xf = _liveFaceTransform(idx);
                            liveFaces.push({ index: idx, mirrorU: xf.mirrorU, mirrorV: xf.mirrorV });
                            return new THREE.MeshBasicMaterial({
                                map: _makeWorldTexture(liveCv, xf),
                                transparent: true, opacity: alpha, depthWrite: loDepthWrite
                            });
                        }
                        return new THREE.MeshBasicMaterial({
                            color: new THREE.Color((pc[0] / 255) * m, (pc[1] / 255) * m, (pc[2] / 255) * m),
                            transparent: alpha < 1.0, opacity: alpha, depthWrite: loDepthWrite
                        });
                    });
                    if (!liveCv) {
                        // Placeholder until the first paint lands; the refresh pass installs
                        // the textures on the SAME two faces once the canvas appears.
                        liveFaces = thin.faces.map(function (idx) {
                            var xf = _liveFaceTransform(idx);
                            return { index: idx, mirrorU: xf.mirrorU, mirrorV: xf.mirrorV };
                        });
                    }
                    liveMesh = new THREE.Mesh(liveBox, liveMats);
                    liveMesh.add(new THREE.LineSegments(
                        new THREE.EdgesGeometry(liveBox),
                        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
                    ));
                } else {
                    var planeGeo = new THREE.PlaneGeometry(lo.rect.w, lo.rect.h);
                    var planeXf = _liveFaceTransform(4);   // the plane's own u=x,v=y mapping
                    liveFaces = [{ index: -1, mirrorU: planeXf.mirrorU, mirrorV: planeXf.mirrorV }];
                    var liveMat;
                    if (liveCv) {
                        liveMat = _worldPlaneMaterial(_makeWorldTexture(liveCv, planeXf), alpha, loDepthWrite);
                    } else {
                        // Panel shell placeholder until the first chart render lands.
                        liveMat = new THREE.MeshBasicMaterial({
                            color: new THREE.Color(pc[0] / 255, pc[1] / 255, pc[2] / 255),
                            transparent: alpha < 1.0, opacity: alpha, depthWrite: loDepthWrite,
                            side: THREE.DoubleSide
                        });
                    }
                    liveMesh = new THREE.Mesh(planeGeo, liveMat);
                }
                liveMesh.userData = liveMesh.userData || {};
                liveMesh.userData.liveCanvasSrc = liveCv || null;
                liveMesh.userData.liveCanvasFaces = liveFaces;
                return liveMesh;
            }

            // BOX-VS-PLANE DERIVATION (structural fix): "engine emits primitives; renderer
            // DERIVES" — a 6-element LO rect (rect.d present and >0) is a real
            // z-slab at the ENGINE level; the renderer should not require a
            // SEPARATE, easy-to-forget lo.shape='box' hint to reflect that (the DSE
            // slabs shipped with correct 6-element rects but no hint, rendering as
            // flat planes while the tunnels next to them correctly rendered as
            // boxes — the SECOND instance of the exact bug fixed earlier for
            // SlitScreen/DetectorWall/setupDoubleSlit's walls). Ground-truthed: EVERY
            // current rect.d-bearing LO in this tree (Tube, SlitScreen, DetectorWall,
            // setupDoubleSlit's startWall, the pierced-wall slabs) already explicitly sets
            // shape='box' — none wants a flat render of a deep rect — so derivation
            // is a safe, non-breaking ADDITION: `lo.shape==='box'` (explicit, unchanged)
            // OR `lo.shape===undefined && rect.d>0` (derived, NEW — makes the explicit
            // hint redundant going forward; the 5 existing hint-setting call sites
            // become dead weight, left in place — a later sweep may remove them). A
            // caller that genuinely wants a flat plane despite a real z-slab can still
            // opt out by setting `lo.shape` to any OTHER explicit value.
            // R3-5: shell-shape parity with p5 (_layerBodies). A per-LO `shellShape` (the ferried
            // render.shape vocab, set by the r2 Shell section) picks the drawn primitive on the 3D
            // provider too: box/cube → BoxGeometry, sphere → SphereGeometry, ball/circle → the flat
            // disc. Absent → the prior lo.shape/rect.d/drawAsCircle behavior (byte-identical).
            var _shellShape = (typeof lo.shellShape === 'string' && lo.shellShape) ? lo.shellShape : null;
            var wantsBox = (lo.shape === 'box') ||
                (_shellShape === 'box' || _shellShape === 'cube') ||
                (lo.shape === undefined && _shellShape === null && lo.rect.d !== undefined && lo.rect.d > 0);
            if (wantsBox) {
                var d   = (lo.depth !== undefined) ? lo.depth : ((lo.rect.d !== undefined) ? lo.rect.d : lo.rect.w);   // cube z-extent
                var box = new THREE.BoxGeometry(lo.rect.w, lo.rect.h, d);
                var c   = lo.color || [200, 200, 200];
                // Per-face brightness: the ONE LO_FACE_MUL table (see its docstring).
                var mats = LO_FACE_MUL.map(function (m) {
                    return new THREE.MeshBasicMaterial({
                        color: new THREE.Color((c[0]/255)*m, (c[1]/255)*m, (c[2]/255)*m),
                        transparent: alpha < 1.0, opacity: alpha, depthWrite: loDepthWrite
                    });
                });
                var boxMesh = new THREE.Mesh(box, mats);
                // Crisp edge lines so the cube silhouette/faces are unmistakable from any angle.
                boxMesh.add(new THREE.LineSegments(
                    new THREE.EdgesGeometry(box),
                    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
                ));
                return boxMesh;
            }

            // R3-5: a shell shape of 'sphere' → a TRUE 3D sphere (three is 3D; symmetric with the
            // box branch). ball/circle → the flat disc; no shellShape → the legacy drawAsCircle path.
            var _asCircle = _shellShape
                ? (_shellShape !== 'box' && _shellShape !== 'cube' && _shellShape !== 'sphere')
                : !!lo.drawAsCircle;
            var geo = (_shellShape === 'sphere')
                ? new THREE.SphereGeometry(lo.rect.w / 2, 24, 16)
                : (_asCircle
                    ? new THREE.CircleGeometry(lo.rect.w / 2, 32)
                    : new THREE.PlaneGeometry(lo.rect.w, lo.rect.h));
            var mat;
            if (lo.sprite || lo.renderHint) {
                // R5: custom textured plane (image URL or named built-in graphic) vs the flat rect.
                var tex = lo.sprite ? _makeWorldTexture(lo.sprite, _liveFaceTransform(4))
                                    : _hintTexture(lo.renderHint, lo.color);
                mat = _worldPlaneMaterial(tex, alpha, loDepthWrite);
            } else {
                mat = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(lo.color[0]/255, lo.color[1]/255, lo.color[2]/255),
                    transparent: alpha < 1.0, opacity: alpha, depthWrite: loDepthWrite
                });
            }
            return new THREE.Mesh(geo, mat);
        }

        // ── R5 gun-paint — custom textured graphic for a hinted LargeObject ─────
        // An LO may carry OPTIONAL additive fields the renderer reads (not interpreted
        // by the engine): `sprite` (image URL) or `renderHint` (a named built-in graphic,
        // e.g. 'gun'). Both paint a textured plane instead of the flat colored rect.
        // Procedural CanvasTextures are cached by hint+color so we build each once.
        var _hintTexCache = {};

        function _hintTexture(hint, color) {
            var key = hint + '|' + (color ? color.join(',') : '');
            if (_hintTexCache[key]) { return _hintTexCache[key]; }
            var cv = document.createElement('canvas');
            cv.width = 256; cv.height = 256;
            var g = cv.getContext('2d');
            if (hint === 'gun') {
                // Stylized side-view gun pointing +x (down-barrel of a smoking gun).
                var body = 'rgb(' + (color ? color.join(',') : '46,46,52') + ')';
                g.clearRect(0, 0, 256, 256);
                g.fillStyle = body;
                // receiver / body
                g.fillRect(40, 96, 120, 56);
                // barrel
                g.fillRect(150, 110, 86, 26);
                // grip (angled)
                g.save(); g.translate(70, 150); g.rotate(0.35);
                g.fillRect(0, 0, 34, 80); g.restore();
                // metallic top highlight
                g.fillStyle = 'rgba(150,160,180,0.55)';
                g.fillRect(40, 96, 196, 8);
                // muzzle flash hint at the tip
                var grd = g.createRadialGradient(236, 123, 2, 236, 123, 26);
                grd.addColorStop(0, 'rgba(255,230,150,0.95)');
                grd.addColorStop(1, 'rgba(255,180,60,0)');
                g.fillStyle = grd; g.beginPath(); g.arc(236, 123, 26, 0, Math.PI * 2); g.fill();
            } else {
                // Generic hinted placeholder: a bordered tile labelled with the hint.
                g.fillStyle = 'rgb(' + (color ? color.join(',') : '60,60,70') + ')';
                g.fillRect(0, 0, 256, 256);
                g.strokeStyle = 'rgba(180,200,220,0.7)'; g.lineWidth = 6;
                g.strokeRect(8, 8, 240, 240);
            }
            var tex = _makeWorldTexture(cv, _liveFaceTransform(4));   // the plane's own u=x,v=y mapping
            _hintTexCache[key] = tex;
            return tex;
        }

        // ── Cube InstancedMesh — lazy creation + capacity growth ──────────────
        //
        // Called at the start of the cube render path each tick. Creates the mesh
        // the first time (or grows it when active count exceeds current capacity).
        // Geometry is a cube of `size` px on each side (the voxel dimension). In the
        // collision-matrix-3d experiment, every frame is a Dim-6 body (64 px voxel),
        // so size is constant — the geometry is created once and reused every tick.
        //
        // MeshLambertMaterial + vertexColors: the instance color (set via setColorAt)
        // IS the base diffuse color; Lambert shading (AmbientLight + DirectionalLight)
        // then modulates it per-face. Result: physics-derived color with face-depth shading.
        //
        // The InstancedMesh is added to _scene once; its count is updated each tick via
        // the drawRange-equivalent `mesh.count = activeCount`. This is the retained-mode
        // pattern (same philosophy as the Points mesh — create once, update buffers).
        function _ensureCubeMesh(size, needed) {
            var recreateGeo = !_cubeGeo;
            if (!_cubeMesh || needed > _cubeCapacity) {
                // Grow to next power of 2 at or above needed.
                var newCap = _cubeCapacity || 4096;
                while (newCap < needed) { newCap = newCap * 2; }

                if (_cubeMesh) { _scene.remove(_cubeMesh); _cubeMesh.dispose(); }
                if (recreateGeo || !_cubeGeo) {
                    if (_cubeGeo) { _cubeGeo.dispose(); }
                    // BoxGeometry: size×size×size voxel. The y-down physics convention means
                    // the box sits centred on the frame's (x,y,z) position — no offset needed.
                    _cubeGeo = new THREE.BoxGeometry(size, size, size);
                }
                // Do NOT set vertexColors: true here. BoxGeometry has no 'color' vertex
                // attribute, so vertexColors:true makes the GLSL vColor read (0,0,0) and
                // multiplies every face to black. For InstancedMesh colored per-instance via
                // setColorAt(), three.js automatically uploads instanceColor as a second
                // instanced attribute that the built-in Lambert shader reads WITHOUT
                // vertexColors being set — the instanceColor IS the per-cube diffuse color.
                var mat = new THREE.MeshLambertMaterial({});
                _cubeMesh = new THREE.InstancedMesh(_cubeGeo, mat, newCap);
                _cubeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                // Pre-create instanceColor at construction (initialized WHITE), NOT lazily on the
                // first setColorAt(). If instanceColor is added AFTER the material program first
                // compiles, r128 binds the new attribute but the per-instance colors read as zero
                // -> diffuse * 0 = BLACK cubes (the bug this thread chased). Allocating it up front
                // makes USE_INSTANCING_COLOR part of the FIRST compile; white init keeps any
                // not-yet-written instance visible rather than black.
                _cubeMesh.instanceColor = new THREE.InstancedBufferAttribute(
                    new Float32Array(newCap * 3).fill(1), 3);
                _cubeMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
                _cubeMesh.count = 0;
                // Disable frustum culling on the InstancedMesh. three.js frustum-culls using
                // the BASE geometry's bounding sphere (a ~64px sphere at the world origin).
                // All instances are translated to physics coords (x~300, y~300, z varies) via
                // instanceMatrix, which the cull test does NOT see — so if the origin is outside
                // the frustum, three.js culls the ENTIRE mesh (black canvas, no error).
                // frustumCulled=false is the standard fix; cost is negligible for one mesh.
                _cubeMesh.frustumCulled = false;
                _scene.add(_cubeMesh);
                _cubeCapacity = newCap;
            }
        }

        // ── Sphere InstancedMesh factory (R6, 2026-07-03 — Effect=None baseline) ──
        // Builds a NEW InstancedMesh at the given capacity, sharing the ONE global unit
        // sphere geometry (created lazily on first call) across every (dim,family)
        // bucket that opts into `paint:'sphere'` — unlike the cube path, no per-scene
        // voxel-size geometry rebuild is needed since PER-INSTANCE scale (set in the
        // fill loop below) does the sizing. Mirrors `_ensureCubeMesh`'s exact material/
        // instanceColor/frustumCulled discipline (see its own comments for the "why"):
        //   - MeshLambertMaterial({}) reads instanceColor as the per-instance diffuse
        //     color automatically, using the SAME _ambient/_dirLight already in _scene
        //     (zero new lighting setup).
        //   - instanceColor is PRE-CREATED (white) at construction, not lazily on first
        //     setColorAt() — adding it after first shader compile reads zero -> BLACK
        //     spheres (the exact bug class the cube path's own comment documents).
        //   - frustumCulled=false — instances translate far from the shared geometry's
        //     origin-centered bounding sphere; three.js's frustum cull test doesn't see
        //     per-instance transforms and would otherwise cull the WHOLE mesh.
        function _buildSphereInstancedMesh(capacity) {
            if (!_sphereGeo) {
                // Low-poly unit sphere — radius 0.5 so a per-instance scale of
                // (size,size,size) gives an exact `size`-px diameter, matching the crisp/
                // soft Points path's `aSize` (frame.rect.w) convention.
                _sphereGeo = new THREE.SphereGeometry(0.5, 8, 6);
            }
            var mat = new THREE.MeshLambertMaterial({});
            var mesh = new THREE.InstancedMesh(_sphereGeo, mat, capacity);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(
                new Float32Array(capacity * 3).fill(1), 3);
            mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            mesh.count = 0;
            mesh.frustumCulled = false;
            return mesh;
        }

        // ── render.mesh external-geometry helpers ────────────────────────────
        // FAIL LOUD: a requested mesh that can't load is a broken experiment, not a silent
        // fallback to sprites (Invariant 2 / truth-in-labeling). Inject an overlay + console.
        function _meshFailLoud(msg) {
            if (typeof document === 'undefined') { throw new Error(msg); }
            if (!document.getElementById('egpt-renderer-error')) {
                var d = document.createElement('div');
                d.id = 'egpt-renderer-error';
                d.style.cssText = 'position:fixed;inset:0;background:#300;color:#fdd;font:14px monospace;' +
                    'padding:18px;white-space:pre-wrap;z-index:99999;overflow:auto;';
                d.textContent = 'render.mesh FAIL-LOUD\n\n' + msg;
                document.body.appendChild(d);
            }
            // eslint-disable-next-line no-console
            if (typeof console !== 'undefined') { console.error('[three-provider] render.mesh: ' + msg); }
        }

        // Kick off (once) the async glTF load for an asset id; cache the result. The GLTFLoader
        // is lazy-constructed with DRACOLoader attached (Objaverse assets are often Draco), the
        // decoder pointed at the vendored draco dir (compat/vendor.js `meshLoadersBase()`, the one
        // owner of where the loaders were loaded from). On load, the scene is normalized to unit size so per-frame
        // scaling is `frame.w` directly. FAIL LOUD if the loaders aren't present or the load errors.
        function _ensureMeshLoaded(assetId) {
            if (_meshCache[assetId]) { return; }
            if (typeof THREE.GLTFLoader === 'undefined') {
                _meshCache[assetId] = { status: 'error', scene: null, norm: 1, error: 'loaders-missing' };
                _meshFailLoud('THREE.GLTFLoader is undefined — the mesh experiment must boot with ' +
                    'bootRealm({ meshLoaders: true }) so the UMD loaders load after three.');
                return;
            }
            if (!_meshLoader) {
                var _loader = new THREE.GLTFLoader();
                if (typeof THREE.DRACOLoader !== 'undefined') {
                    // ONE base for one fact: compat/vendor.js loaded the loaders and owns where from.
                    var base = meshLoadersBase();
                    var draco = new THREE.DRACOLoader();
                    draco.setDecoderPath(base + '/draco/');
                    _loader.setDRACOLoader(draco);
                }
                _meshLoader = _loader;
            }
            _meshCache[assetId] = { status: 'loading', scene: null, norm: 1, error: null };
            _meshLoader.load(
                assetId,
                function (gltf) {
                    var scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                    if (!scene) { _meshCache[assetId] = { status: 'error', scene: null, norm: 1, error: 'no-scene' };
                        _meshFailLoud('glTF loaded but has no scene: ' + assetId); return; }
                    // Normalize to unit size: scale so the model's max bbox dimension = 1, so a
                    // clone scaled by frame.w (quanta) or the LO rect (large objects) fills the target.
                    var box = new THREE.Box3().setFromObject(scene);
                    var size = new THREE.Vector3(); box.getSize(size);
                    var center = new THREE.Vector3(); box.getCenter(center);
                    var maxDim = Math.max(size.x, size.y, size.z) || 1;
                    // RECENTER at the local origin via a pivot wrapper: shift the model inside a
                    // parent group by -center, and cache the WRAPPER. A clone of the wrapper has its
                    // origin at the model's bbox center, so setting the clone's position places the
                    // model CENTERED there — not offset by the asset's authored pivot. Without this a
                    // single large LO mesh (e.g. the gun body) lands off-frame; the per-quantum cloud
                    // masked it because many clones spread the offset out. Both paths clone the wrapper.
                    scene.position.sub(center);
                    var pivot = new THREE.Group();
                    pivot.add(scene);
                    _meshCache[assetId] = { status: 'ready', scene: pivot, norm: 1 / maxDim, error: null };
                },
                undefined,
                function (err) {
                    _meshCache[assetId] = { status: 'error', scene: null, norm: 1, error: String(err) };
                    _meshFailLoud('failed to load render.mesh asset: ' + assetId + '\n' + String(err));
                }
            );
        }

        // Position one clone of the loaded mesh per frame (reusing a pool). The loaded scene is
        // unit-normalized; each clone is scaled to the frame's voxel size (w) and placed at the
        // frame's (x,y,z) — the SAME physics coords the cube/points paths use. Extra clones hide.
        function _layoutMeshClones(entry, frameData, lay, scaleMul, assetId) {
            if (!_meshGroup) { _meshGroup = new THREE.Group(); _meshGroup.frustumCulled = false; _scene.add(_meshGroup); }
            // Per-ASSET clone sub-pool (spec §2): one pool per asset id so concurrent assets never
            // fight over slots. Callers: the scene-wide useMesh branch (assetId = resolvedMesh) and
            // the per-frame mesh siphon in the Points path (one call per stamped asset).
            var pool = _meshClonesByAsset[assetId] || (_meshClonesByAsset[assetId] = []);
            var mul = (typeof scaleMul === 'number' && scaleMul > 0) ? scaleMul : 1;
            var n = (lay && frameData) ? frameData.length : 0;
            for (var i = 0; i < n; i++) {
                var f = frameData[i];
                var clone = pool[i];
                if (!clone) {
                    clone = entry.scene.clone(true);
                    clone.frustumCulled = false;
                    pool[i] = clone;
                    _meshGroup.add(clone);
                }
                // R3-3: per-frame render.meshScale / render.meshRotation overrides (local > global),
                // read mechanically from the frame's engine-opaque string_map — the same local-over-
                // global precedence render.color/render.shape use. render.meshScale replaces the
                // experiment-wide `mul` (setRenderOption('meshScale',…)); render.meshRotation is a CSV
                // of THREE euler radians (same unit as lo.meshRotation). Absent → the prior behavior
                // exactly (mul, identity rotation) → byte-identical for every mesh caller today.
                var _sm = f.data && f.data.string_map;
                var frameMul = mul;
                if (_sm && _sm['render.meshScale'] != null) {
                    var _fms = Number(_sm['render.meshScale']);
                    if (!isNaN(_fms) && _fms > 0) { frameMul = _fms; }
                }
                var s = (f.rect && f.rect.w ? f.rect.w : 1) * entry.norm * frameMul;
                clone.scale.setScalar(s);
                clone.position.set(f.rect.x, f.rect.y, f.z || 0);
                clone.userData.frameLayer = f.layer;   // the god-rays source pass reads it (isGodraySource)
                if (_sm && _sm['render.meshRotation'] != null) {
                    var _rp = String(_sm['render.meshRotation']).split(',').map(Number);
                    if (_rp.length >= 3 && _rp.every(function (n) { return !isNaN(n); })) {
                        clone.rotation.set(_rp[0], _rp[1], _rp[2]);
                    } else { clone.rotation.set(0, 0, 0); }
                } else {
                    clone.rotation.set(0, 0, 0);
                }
                clone.visible = true;
            }
            for (var j = n; j < pool.length; j++) { if (pool[j]) { pool[j].visible = false; } }
            if (n > 0 && _meshGroup) { _meshGroup.visible = true; }   // group hidden by the caller when NO asset drew
            return n;
        }

        // Hide every clone in every asset pool NOT in `keep` (an array of active asset ids). Lets
        // a tick that stops using an asset (asset swap, or mesh→points transition) drop its clones
        // without a per-asset call. The active pools' own _layoutMeshClones manages their tails.
        function _hideMeshClonesExcept(keep) {
            for (var aid in _meshClonesByAsset) {
                if (!_meshClonesByAsset.hasOwnProperty(aid)) { continue; }
                if (keep && keep.indexOf(aid) !== -1) { continue; }
                var pool = _meshClonesByAsset[aid];
                for (var i = 0; i < pool.length; i++) { if (pool[i]) { pool[i].visible = false; } }
            }
        }

        function _syncLargeObjects(largeObjects, opts) {
            if (!largeObjects) return;
            var seen = new Set();
            for (var i = 0; i < largeObjects.length; i++) {
                var lo  = largeObjects[i];
                seen.add(lo);
                var sig = _loSig(lo, opts);
                var rec = _loMeshes.get(lo);
                if (!rec || rec.sig !== sig) {
                    // New LO, or its shape/skin/mesh-status changed → (re)build the mesh.
                    if (rec && rec.mesh) { _scene.remove(rec.mesh); }
                    var mesh = _buildLoMesh(lo, opts);
                    rec = { mesh: mesh, sig: sig, skinSig: null };
                    _loMeshes.set(lo, rec);
                    _scene.add(mesh);
                }
                // Colour + opacity are DERIVED every frame, never baked once at build:
                // `lo.color` / `lo.alpha` are live render-only fields the property accessor
                // (Inspector, a page's own code) writes between ticks, exactly like `visible`
                // and the rect below. Guarded by a skin signature so the material walk runs
                // only when a value actually moved.
                var skinSig = loSkinSig(lo);
                if (rec.skinSig !== skinSig) {
                    if (rec.mesh && rec.mesh.material) { applyLoSkin(rec.mesh.material, lo); }
                    rec.skinSig = skinSig;
                }
                // Update position EVERY frame (cheap) — this is what moves a moving LO. The mesh
                // sits at the rect's drawn center, owned by lo-drawn-center.js (the runner's pick
                // aims at the same point through it).
                var loCenter = LoDrawnCenter.drawnCenter(lo.rect);
                rec.mesh.position.set(loCenter[0], loCenter[1], loCenter[2]);
                // R2 — VISIBLE ROTATION: rotate the shell about z by the ferried orientationDeg.
                // Cheap per-frame update (not a geometry rebuild). orientation 0 ⇒ no rotation,
                // byte-identical to every existing LO (SU1). Skipped for a billboard LO
                // (its quaternion is camera-driven below). The drawn face is the wall: a rotated
                // wall draws NO outline of its un-rotated engine rect.
                var _deg = (typeof lo.orientationDeg === 'number') ? (((lo.orientationDeg % 360) + 360) % 360) : 0;
                // R2AX — PITCH (two-axis mirror): tip the plate about
                // its OWN long axis (the geometry's local Y after the z-rotation) by the
                // ferried pitchDeg. Euler order 'ZYX' = intrinsic z-then-local-y — exactly
                // "yaw about world z, then pitch about the plate's own long axis" (the same
                // decomposition SlabFace uses for the physics normal; drawn face is truth).
                // pitch 0/absent leaves rotation.y at 0 — byte-identical to every existing LO.
                var _pitch = (typeof lo.pitchDeg === 'number') ? lo.pitchDeg : 0;
                if (!lo.billboard) {
                    rec.mesh.rotation.order = 'ZYX';
                    // SIGN (3D-loop orientation-inversion fix — drawn face
                    // is truth IN WORLD SPACE): the THREE world holds RAW physics coordinates
                    // (y-down VALUES; only camera.up is flipped, see _applyOrbit) — the world is
                    // NOT y-flipped, so yaw draws as +deg, exactly the p5/SlabFace convention
                    // (face line at 90+o in the engine frame). The previous −deg was a hand-
                    // mirrored sign (the SlabFace-banned class): it survived single-plate LOOKs
                    // because the az≈0 camera mirrors screen-x, and for an UNDIRECTED in-plane
                    // plate line an x-mirror is indistinguishable from a y-mirror — but the BEAM
                    // lives in world space, so a ring of tangent mirrors drew as a pinwheel fan
                    // (per-mirror error 2·ori) with the beam disagreeing with every plate.
                    // Probe: scratchpad loopm1probe.cjs — physics exit exact 2D-law on the 2D
                    // wall AND the 3D slab (byte-identical states); only the drawn angle lied.
                    rec.mesh.rotation.z = _deg * Math.PI / 180;
                    // Pitch sign (re-derived against the TRUE normal, not a y-flipped one):
                    // Rz(+yaw)·Ry(θy)·x̂ = (cosθy·cos o, cosθy·sin o, −sinθy) must align with
                    // −n3 = (cos o·cos p, sin o·cos p, −sin p) ⇒ θy = +pitch for ALL yaw
                    // (plate normal sign is conventional; the z-tip direction is unchanged
                    // from the verified R2AX realm sweep).
                    rec.mesh.rotation.y = _pitch * Math.PI / 180;
                }
                // Billboard: opt-in LOs (e.g. a Bullet) always face the camera, so a flat plane
                // reads as a disc head-on (down-barrel) instead of an edge-on sliver. No-op in the
                // 2D ortho view (camera faces -z, so the plane is already front-on).
                if (lo.billboard && _camera) { rec.mesh.quaternion.copy(_camera.quaternion); }
                // liveCanvas refresh: keep the LiveChart texture current. The offscreen
                // Chart.js canvas churns each redraw (new element) AND updates in place, so
                // re-resolve; (re)build the CanvasTexture when the element changed; always flag
                // needsUpdate so a same-element mid-redraw shows. Cheap per-frame (throttled to
                // ~10fps upstream); zero cost for a non-chart LO (lo.liveCanvas absent).
                if (lo.liveCanvas && rec.mesh && rec.mesh.material) {
                    var curCv = _resolveLiveCanvas(lo);
                    var ud = rec.mesh.userData || (rec.mesh.userData = {});
                    // One or two target materials: the flat plane's single material
                    // (face index −1), or the two thin-axis faces of a slab. Each keeps
                    // its OWN world-space UV transform, built by the SAME one texture
                    // factory the mesh-build path uses.
                    var faces = ud.liveCanvasFaces || [{ index: -1, mirrorU: false, mirrorV: false }];
                    for (var fi = 0; fi < faces.length; fi++) {
                        var face = faces[fi];
                        var lmat = (face.index >= 0 && Array.isArray(rec.mesh.material))
                            ? rec.mesh.material[face.index] : rec.mesh.material;
                        if (!lmat) { continue; }
                        if (curCv && (ud.liveCanvasSrc !== curCv || !lmat.map)) {
                            if (lmat.map) { try { lmat.map.dispose(); } catch (e) {} }
                            lmat.map = _makeWorldTexture(curCv, face);
                            if (lmat.color) { lmat.color.setRGB(1, 1, 1); }   // never tint the ferried surface
                            lmat.transparent = true;
                            lmat.needsUpdate = true;
                        } else if (curCv && lmat.map) {
                            lmat.map.needsUpdate = true;
                        }
                    }
                    if (curCv) { ud.liveCanvasSrc = curCv; }
                }
                rec.mesh.visible = (lo.visible !== false);
            }
            // Hide meshes whose LO is absent this frame.
            _loMeshes.forEach(function (rec, lo) { if (!seen.has(lo)) { rec.mesh.visible = false; } });
        }

        // ── Field texture update — smooth heightfield via shared FieldBuilder ─

        function _updateFieldTex(tickData) {
            if (!tickData || !tickData.frameData || !_fieldData) return;

            // FieldBuilder builds a smooth splatted heightfield (shared spec, identical
            // semantics as p5 provider) and returns a fresh Uint8Array each tick.
            var built = FieldBuilder.buildHeightField(tickData.frameData,
                Object.assign({}, FieldBuilder.FIELD_OPTS, { canvasW: _physW(), canvasH: _physH() }));
            // Copy into the pre-allocated _fieldData buffer (same size)
            _fieldData.set(built);
            _fieldTex.needsUpdate = true;
        }

        // ── Filter post-process ────────────────────────────────────────────────

        function _ensureQuadMesh(spec) {
            var name = spec.name || 'filter';
            if (_quadMeshes[name]) return _quadMeshes[name];

            var fragSrc = spec.glsl;
            // three.js ShaderMaterial uses GLSL 1.0-style by default (no version directive needed)

            var mat = new THREE.ShaderMaterial({
                uniforms: {
                    uScene:      { value: _rtA.texture },
                    uField:      { value: _fieldTex    },
                    uResolution: { value: new THREE.Vector2(_physW(), _physH()) },
                    uTime:       { value: 0.0 }
                },
                vertexShader:   QUAD_VERT,
                fragmentShader: fragSrc,
                transparent: false,
                depthWrite: false
            });

            var mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
            _quadScene.add(mesh);
            _quadMeshes[name] = mesh;
            return mesh;
        }

        function _applyFilter(spec, time) {
            var name = spec.name || 'filter';
            var mesh = _ensureQuadMesh(spec);

            // uTime = simulation seconds at the rendered tick (the contract's filterTime).
            mesh.material.uniforms.uTime.value = time;
            mesh.material.uniforms.uResolution.value.set(_physW(), _physH());

            // Render scene → rtA, then apply filter pass → screen
            _renderer.setRenderTarget(_rtA);
            _renderer.render(_scene, _camera);
            _renderer.setRenderTarget(null);

            // Now render the quad (reads rtA) to screen
            mesh.material.uniforms.uScene.value = _rtA.texture;
            mesh.material.uniforms.uField.value = _fieldTex;
            _renderer.render(_quadScene, _quadCamera);
        }

        // ── R4-B god-rays ──────────────────────────────────────────────────────

        // The god-rays SOURCE image → _godrays.rtSource: same scene/camera/paint, ONLY the fundamental-layer
        // frames drawn. LOs write depth but no colour (they shadow, never shine). All flags restored.
        function _renderGodraySource(tickData, leaf) {
            var gs = GodraysLayer, fund = gs.fundamentalLayerOf(tickData);
            var hidden = [], cubeCount = null, colourOff = [];
            function hide(o) { if (o && o.visible) { o.visible = false; hidden.push(o); } }
            // The rays read the PARTICLE LAYER whether or not the lit picture draws it.
            for (var p = 0; p < _particlesLaidHidden.length; p++) { _particlesLaidHidden[p].visible = true; }
            if (!leaf) {
                // 'all': the lit scene WITH its particles (only reached when Particles are OFF).
                _renderer.setRenderTarget(_godrays.rtSource);
                _renderer.render(_scene, _camera);
                for (var pa = 0; pa < _particlesLaidHidden.length; pa++) { _particlesLaidHidden[pa].visible = false; }
                return;
            }
            for (var k in _dimLayers) {
                if (_dimLayers.hasOwnProperty(k) && !gs.isGodraySource(_dimLayers[k].layer, fund)) { hide(_dimLayers[k].mesh); }
            }
            if (_cubeMesh && _cubeMesh.visible) { cubeCount = _cubeMesh.count; _cubeMesh.count = _cubeSourceCount; }
            for (var aid in _meshClonesByAsset) {
                if (!_meshClonesByAsset.hasOwnProperty(aid)) { continue; }
                var pool = _meshClonesByAsset[aid];
                for (var i = 0; i < pool.length; i++) {
                    if (pool[i] && !gs.isGodraySource(pool[i].userData.frameLayer, fund)) { hide(pool[i]); }
                }
            }
            _loMeshes.forEach(function (rec) {
                if (!rec.mesh) { return; }
                rec.mesh.traverse(function (o) {
                    var mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
                    for (var m = 0; m < mats.length; m++) {
                        if (mats[m] && mats[m].colorWrite !== false) { mats[m].colorWrite = false; colourOff.push(mats[m]); }
                    }
                });
            });

            _renderer.setRenderTarget(_godrays.rtSource);
            _renderer.render(_scene, _camera);

            for (var h = 0; h < hidden.length; h++) { hidden[h].visible = true; }
            if (cubeCount !== null) { _cubeMesh.count = cubeCount; }
            for (var c = 0; c < colourOff.length; c++) { colourOff[c].colorWrite = true; }
            for (var q = 0; q < _particlesLaidHidden.length; q++) { _particlesLaidHidden[q].visible = false; }
        }

        // Are god rays on? THE one predicate: the final composite dispatch and the particle-layer
        // gate (rays consume the particle layer as their source) both ask it.
        function _wantGodrays(opts) { return opts.godrays > 0; }

        // God-rays to screen: the rays read the SOURCE image (fundamental-layer frames, LOs
        // depth-only) and add over the full lit scene. Cost paid ONLY when on.
        // `godraySource` 'all' reads the lit scene itself (every frame, every LO); `godrayMode`
        // picks the pass (GodraysLayer owns both values and defaults).
        function _renderGodrays(opts, tickData) {
            var gl = GodraysLayer, leaf = gl.resolveGodraySource(opts.godraySource) === 'leaf';
            var mode = gl.resolveGodrayMode(opts.godrayMode);
            if (!_godrays) { _godrays = gl.makeGodrayPasses(THREE, QUAD_VERT, _physW(), _physH()); }
            _renderer.setRenderTarget(_rtA);                 // Pass 1: lit scene → _rtA
            _renderer.render(_scene, _camera);
            // Pass 1b: source → rtSource. 'leaf' always; 'all' only when the lit scene lacks its
            // particles (Particles OFF) — otherwise the lit scene IS the 'all' source.
            var ownSource = leaf || _particlesLaidHidden.length > 0;
            if (ownSource) { _renderGodraySource(tickData, leaf); }
            var src = ownSource ? _godrays.rtSource : _rtA;
            if (mode === 'radial') {
                _godrays.march(_renderer, _quadCamera, _rtA, src, _rtB,
                    _godrays.lightUV(tickData, _camera, opts.godraySource), opts.godrayDensity, opts.godrays);
            } else {
                var pass = (mode === 'streak') ? _godrays.streak : _godrays.field;
                pass(_renderer, _quadCamera, _rtA, src, _rtB,
                    gl.godraySourceFrames(tickData, opts.godraySource), _camera, opts.godrayDensity, opts.godrays);
            }
        }

        // ── Aim feedback layer update ─────────────────────────────────────────────────
        // Gated on opts.aimFeedback (runner-fed, live per frame). 3D-only. Draws, in a SEPARATE
        // _feedbackScene rendered as a FINAL overlay pass (see _renderAimFeedbackPass) AFTER every
        // FX composite so bloom/god-rays cannot wash it out:
        //   • the universe-cube wireframe from `bounds`;
        //   • the RETICLE — a screen-centre glyph with no position of its own: it is placed each
        //     frame at the orbit centre (the point the camera looks at, on its centre ray) facing
        //     the camera, so it sits at screen centre by construction;
        //   • the SHADOW-SURROUND around `hover` (grab-ready / grabbed) and `selected` (the host
        //     selection) — painted FROM the volume in the bag, the same lo-drawn-center volume the
        //     runner's ray tested: a dark translucent shell plus amber edges;
        //   • the LOCK glyph on the grabbed object's shadow;
        //   • the passive heading ring (amber, the highlight's colour) at `orientation.pivot`,
        //     turned by `orientation.deg`. Magenta is the reticle's alone.
        // Reticle, surround and lock are framing-normalized (scaled by orbit-distance / default
        // framing) so their screen weight holds at telephoto; depthTest:false keeps them on top.
        var AIM_RETICLE_COLOR = 0xff33ff;   // opaque magenta — the aim instrument
        var AIM_SURROUND_EDGE = 0xffaa00;   // amber — the shadow-surround's rim
        var AIM_LOCK_COLOR    = 0x33ff99;   // green — grabbed
        function _lineGeo(pts) {
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
            return g;
        }
        // `transparent:true` at full opacity puts the lines in three's TRANSPARENT list with the dark
        // surround shells, so renderOrder (lines 9999 over shells 9997) decides — an opaque line
        // would be drawn first and then darkened by the shell over it.
        function _overlayLines(geo, color) {
            var l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: color, depthTest: false,
                transparent: true, opacity: 1 }));
            l.renderOrder = 9999; l.frustumCulled = false;
            return l;
        }
        function _circlePts(r, seg, z) {
            var p = [];
            for (var i = 0; i < seg; i++) {
                var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
                p.push(r * Math.cos(a0), r * Math.sin(a0), z || 0, r * Math.cos(a1), r * Math.sin(a1), z || 0);
            }
            return p;
        }
        /** One shadow-surround: a unit dark shell + amber rim for a box volume, a camera-facing
         *  dark disc + amber ring for a sphere; transformed per frame from the bag's volume. */
        function _makeSurround() {
            var unitBox = new THREE.BoxGeometry(1, 1, 1);
            var dark = function () {
                return new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38,
                    depthTest: false, depthWrite: false, side: THREE.DoubleSide });
            };
            var box = new THREE.Mesh(unitBox, dark());
            box.add(_overlayLines(new THREE.EdgesGeometry(unitBox), AIM_SURROUND_EDGE));
            var disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), dark());
            disc.add(_overlayLines(_lineGeo(_circlePts(1, 48)), AIM_SURROUND_EDGE));
            [box, disc].forEach(function (m) { m.renderOrder = 9997; m.frustumCulled = false; m.visible = false; _feedbackScene.add(m); });
            return { box: box, disc: disc };
        }
        /** Place `sur` around `vol` (padded by `pad` world px); returns the volume's outer radius. */
        function _placeSurround(sur, vol, pad) {
            var c = vol.center;
            if (vol.kind === 'sphere') {
                var r = vol.radius + pad;
                sur.disc.position.set(c[0], c[1], c[2]);
                sur.disc.quaternion.copy(_camera.quaternion);
                sur.disc.scale.setScalar(r);
                sur.disc.visible = true; sur.box.visible = false;
                return r;
            }
            sur.box.position.set(c[0], c[1], c[2]);
            sur.box.rotation.order = 'ZYX';                               // the shell's own order
            sur.box.rotation.z = (vol.yawDeg || 0) * Math.PI / 180;
            sur.box.rotation.y = (vol.pitchDeg || 0) * Math.PI / 180;
            sur.box.scale.set(2 * (vol.half[0] + pad), 2 * (vol.half[1] + pad), 2 * (vol.half[2] + pad));
            sur.box.visible = true; sur.disc.visible = false;
            return Math.hypot(vol.half[0], vol.half[1], vol.half[2]) + pad;
        }
        function _hideSurround(sur) { if (sur) { sur.box.visible = false; sur.disc.visible = false; } }

        function _updateAimFeedback(opts) {
            var fb = opts && opts.aimFeedback;
            if (!_is3D || !fb || !fb.bounds) {
                if (_aimCube)    { _aimCube.visible = false; }
                if (_aimReticle) { _aimReticle.visible = false; }
                if (_aimRing)    { _aimRing.visible = false; }
                if (_aimLock)    { _aimLock.visible = false; }
                _hideSurround(_aimHoverSur); _hideSurround(_aimSelSur);
                return;
            }
            if (!_feedbackScene) { _feedbackScene = new THREE.Scene(); }
            var w = fb.bounds.width, h = fb.bounds.height, zHalf = fb.bounds.zHalf;
            var sig = w + 'x' + h + 'x' + zHalf;
            var s = Math.max(4, Math.min(w, h) * 0.06);   // glyph half-length (world px, base)
            if (!_aimCube || _aimCubeSig !== sig) {
                // (Re)build the bounds-sized geometry only when the universe bounds change.
                [_aimCube, _aimReticle, _aimRing, _aimLock].forEach(function (o) {
                    if (o) { _feedbackScene.remove(o); o.geometry.dispose(); }
                });
                var cube = new THREE.BoxGeometry(w, h, Math.max(1, 2 * zHalf));
                _aimCube = new THREE.LineSegments(new THREE.EdgesGeometry(cube),
                    new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.5, depthTest: false }));
                _aimCube.renderOrder = 9998; _aimCube.frustumCulled = false;
                _feedbackScene.add(_aimCube);
                cube.dispose();
                // Reticle: four ticks around an open centre plus a small ring (camera plane).
                var g0 = s * 0.25;
                _aimReticle = _overlayLines(_lineGeo([-s, 0, 0, -g0, 0, 0,  g0, 0, 0, s, 0, 0,
                    0, -s, 0, 0, -g0, 0,  0, g0, 0, 0, s, 0].concat(_circlePts(s * 0.55, 32))), AIM_RETICLE_COLOR);
                _feedbackScene.add(_aimReticle);
                // Heading ring: a ring in world xy (orientation is a yaw about z) + a spoke along
                // local +x with an arrowhead, turned with the object it describes.
                var rr = s * 1.6, tip = rr * 1.35, ah = rr * 0.22;
                _aimRing = _overlayLines(_lineGeo(_circlePts(rr, 48).concat(
                    [0, 0, 0, tip, 0, 0,  tip, 0, 0, tip - ah, ah * 0.6, 0,  tip, 0, 0, tip - ah, -ah * 0.6, 0])),
                    AIM_SURROUND_EDGE);   // the highlight's colour: magenta is the reticle alone
                _feedbackScene.add(_aimRing);
                // Lock glyph: a padlock (body rectangle + shackle arch), camera-facing.
                var bw = s * 0.45, bh = s * 0.4, lk = [-bw, -bh, 0, bw, -bh, 0,  bw, -bh, 0, bw, bh * 0.4, 0,
                    bw, bh * 0.4, 0, -bw, bh * 0.4, 0,  -bw, bh * 0.4, 0, -bw, -bh, 0];
                var sr = bw * 0.62;
                for (var ai = 0; ai < 12; ai++) {
                    var q0 = ai / 12 * Math.PI, q1 = (ai + 1) / 12 * Math.PI;
                    lk.push(sr * Math.cos(q0), bh * 0.4 + sr * 0.3 + sr * Math.sin(q0), 0,
                            sr * Math.cos(q1), bh * 0.4 + sr * 0.3 + sr * Math.sin(q1), 0);
                }
                lk.push(sr, bh * 0.4, 0, sr, bh * 0.4 + sr * 0.3, 0,  -sr, bh * 0.4, 0, -sr, bh * 0.4 + sr * 0.3, 0);
                _aimLock = _overlayLines(_lineGeo(lk), AIM_LOCK_COLOR);
                _feedbackScene.add(_aimLock);
                if (!_aimHoverSur) { _aimHoverSur = _makeSurround(); _aimSelSur = _makeSurround(); }
                _aimCubeSig = sig;
            }
            _aimCube.position.set(w / 2, h / 2, 0);   // BoxGeometry is origin-centred → universe centre
            _aimCube.visible = true;
            var ref = Math.max(_physW(), _physH()) * 1.6;
            var fscale = (ref > 0 && _orbit.distance > 0) ? (_orbit.distance / ref) : 1;
            // Reticle at the orbit centre, facing the camera: screen centre by construction.
            var oc = ThreeCameraGeometry._orbitCenter(_orbit, _physW(), _physH());
            _aimReticle.position.set(oc.x, oc.y, oc.z);
            _aimReticle.quaternion.copy(_camera.quaternion);
            _aimReticle.scale.setScalar(fscale);
            _aimReticle.visible = true;
            var pad = 4 * fscale;
            var hoverR = fb.hover ? _placeSurround(_aimHoverSur, fb.hover.volume, pad) : 0;
            if (!fb.hover) { _hideSurround(_aimHoverSur); }
            if (fb.selected && !(fb.hover && fb.hover.name === fb.selected.name)) {
                _placeSurround(_aimSelSur, fb.selected.volume, pad);
            } else { _hideSurround(_aimSelSur); }
            if (fb.grabbed && fb.hover) {
                // The lock rides the top of the grabbed object's shadow (screen-up of its centre).
                var gc = fb.hover.volume.center, up = _camera.up, lift = hoverR + s * 0.8 * fscale;
                _aimLock.position.set(gc[0] + up.x * lift, gc[1] + up.y * lift, gc[2] + up.z * lift);
                _aimLock.quaternion.copy(_camera.quaternion);
                _aimLock.scale.setScalar(fscale);
                _aimLock.visible = true;
            } else { _aimLock.visible = false; }
            var ori = fb.orientation;
            if (ori && ori.pivot) {
                _aimRing.position.set(ori.pivot[0], ori.pivot[1], (ori.pivot[2] != null) ? ori.pivot[2] : 0);
                // Same yaw sign as the wall shell (R2: rotation.z = +deg — the world holds raw
                // physics coordinates), so the spoke turns WITH the drawn object.
                _aimRing.rotation.z = (ori.deg || 0) * Math.PI / 180;
                _aimRing.scale.setScalar(fscale);
            }
            _aimRing.visible = !!(ori && ori.pivot);
        }

        // G2 final overlay pass: render the feedback scene OVER the composited screen with
        // autoClear disabled, so it survives bloom/god-ray/water composites untouched. Called last
        // in _renderTick (after the FX dispatch has drawn to the default framebuffer).
        function _renderAimFeedbackPass() {
            if (!_feedbackScene || !_aimCube || !_aimCube.visible) { return; }
            var prevAuto = _renderer.autoClear;
            _renderer.autoClear = false;
            _renderer.setRenderTarget(null);
            _renderer.render(_feedbackScene, _camera);
            _renderer.autoClear = prevAuto;
        }

        // ── renderTick ─────────────────────────────────────────────────────────

        function _renderTick(tickData, largeObjects, options) {
            if (!_initialized) return;
            _lastTickData = tickData;
            _updateAimFeedback(options || {});

            // Sync large objects (pass render options so LO render.mesh resolves + rebuilds on load)
            _syncLargeObjects(largeObjects, options || {});

            // ── Layer gating — each layer does per-frame work ONLY when active ──
            // Modular separation: no layer's per-frame cost is paid unless that layer
            // is on AND something consumes it. The Field heightfield in particular is
            // built ONLY when a consumer (a queued filter) is active — never unconditionally (that was one sugar object hijacking the
            // render loop). Each flag comes from the render OPTIONS bag (setRenderOption).
            var opts          = options || {};
            var drawParticles = opts.renderBaseCanvas !== false;          // Particles layer (the lit picture)
            // The particle layer is LAID when drawn OR consumed: god rays read it as their source,
            // so Particles OFF + god rays ON lays it out hidden and the rays still shine.
            var layParticles  = drawParticles || _wantGodrays(opts);
            // SNAPSHOT, not the reference: _renderOptsWithFeedback() returns
            // this._renderOptions ITSELF when there is no aim-feedback bag, so retaining
            // `opts` would let a setRenderOption between ticks silently change what
            // captureStill() replays (§1a.4's "as of the last completed renderTick").
            _lastOpts = Object.assign({}, opts);
            _lastRenderBaseCanvas = drawParticles;
            var fieldConsumed = _filters.length > 0;                      // build field iff consumed

            // R4-GEO / per-dim layers (2026-07-02): glow/heat/smoke + additive-vs-normal
            // blend are resolved PER (dim,family) BUCKET inside the points-path loop below
            // (each bucket gets its own material/uniforms).
            var glow = opts.glowIntensity;

            // ── Cube InstancedMesh path (shape='cube' + 3D only) ─────────────────────────
            // When the experiment opts in with setRenderOption('shape','cube') AND the scene
            // is 3D (_is3D), quanta render as TRUE shaded 3D cube meshes instead of flat
            // point-sprites. The Points mesh (+ flash) becomes invisible; the cube InstancedMesh
            // takes over. The physics data (position, fullness, color scheme) flows through the
            // SAME LightColor path as the Points path — only the draw call changes.
            //
            // Gate: RenderShape.isCubeMesh(resolvedShape) && _is3D.
            //   true  → cube InstancedMesh path (Points hidden).
            //   false → existing Points path (cube InstancedMesh hidden). ALL EXISTING
            //           EXPERIMENTS use false → ZERO change to their render path.
            // LightColor + RenderShape are MANDATORY canonical contracts (the single color/shape
            // sources). A missing one is a hard load-order/packaging error — FAIL LOUD, never a
            // silent fallback to a default color/shape (Invariant 2).
            var lc2  = LightColor;
            var rs2  = RenderShape;
            // SCENE-DEFAULT shape (opts only, no frame): the scene-wide cube gate below + the default
            // uShape for glow-sprite buckets (glow/smoke) that carry no per-frame shape. The
            // PER-FRAME shape/mesh routing bug (Red-Team §6: the old `resolve(null,opts)` ignored a
            // frame's own render.shape/render.mesh) is fixed in the Points loop, which resolves EACH
            // frame's family via RenderFamily.resolveRenderFamily(f, opts, _is3D) — never null.
            var resolvedShape = rs2.resolve(null, opts);
            // render.mesh (external glTF) takes priority over cube/points when an experiment
            // routes to it. resolvedMesh = experiment-level setRenderOption('mesh',id).
            var resolvedMesh  = _is3D ? RenderMesh.resolve(null, opts) : null;
            var useMesh       = !!resolvedMesh;
            var useCubeMesh   = !useMesh && _is3D && rs2.isCubeMesh(resolvedShape);
            if (!useMesh && _meshGroup) { _meshGroup.visible = false; }

            if (useMesh) {
                // ── MESH PATH — clones of a loaded glTF (render.mesh) ─────────
                // Points/flash/cube hidden; one clone of the external mesh per frame at its
                // (x,y,z). The asset loads async (FAIL-LOUD on error); while loading, nothing
                // draws (no silent sprite). WHICH mesh = renderer/sugar choice from FrameData.
                _hideAllDimLayers();
                if (_cubeMesh) { _cubeMesh.visible = false; }
                _ensureMeshLoaded(resolvedMesh);
                var _me = _meshCache[resolvedMesh];
                var _sceneLaid = 0;
                if (_me && _me.status === 'ready') {
                    _sceneLaid = _layoutMeshClones(_me, tickData.frameData, layParticles, opts.meshScale, resolvedMesh);
                }
                _hideMeshClonesExcept([resolvedMesh]);           // drop any stale per-frame/other-asset clones
                if (_meshGroup) { _meshGroup.visible = _sceneLaid > 0; }   // loading/empty → hidden (error already overlaid)
            } else if (useCubeMesh) {
                // ── CUBE PATH — InstancedMesh of BoxGeometry ──────────────────
                // Points + flash are invisible; cube InstancedMesh fills from frameData.
                // MeshLambertMaterial uses the scene's AmbientLight + DirectionalLight
                // to shade each face differently — front/top catch the key light and are
                // bright; back/bottom are dark — so the cube reads as a solid 3D object.
                _hideAllDimLayers();

                if (layParticles && tickData && tickData.frameData) {
                    var fdC = tickData.frameData;
                    var totalC = fdC.length;
                    var defaultColorSchemeC = opts.colorScheme || 'warmcool';

                    // Voxel size: the frame rect.w for the first active frame, or a sensible
                    // default. BoxGeometry is sized from the first frame that arrives, then
                    // reused if the voxel size is stable (which it always is — one Dim-level
                    // per setup call). If it changes (unusual), a new geometry is lazy-created.
                    var cubeSize = 64;   // fallback
                    for (var ci0 = 0; ci0 < totalC; ci0++) {
                        if (fdC[ci0].rect && fdC[ci0].rect.w) { cubeSize = fdC[ci0].rect.w; break; }
                    }
                    // Grow the InstancedMesh if needed (same power-of-2 grow philosophy as
                    // _growDimLayerIfNeeded above).
                    _ensureCubeMesh(cubeSize, totalC);

                    // God-rays source frames FIRST: the source pass draws instances [0, _cubeSourceCount).
                    var gsC = GodraysLayer, fundC = gsC.fundamentalLayerOf(tickData), orderC = [];
                    for (var oc = 0; oc < totalC; oc++) { if (gsC.isGodraySource(fdC[oc].layer, fundC)) { orderC.push(oc); } }
                    _cubeSourceCount = orderC.length;
                    for (var oc2 = 0; oc2 < totalC; oc2++) { if (!gsC.isGodraySource(fdC[oc2].layer, fundC)) { orderC.push(oc2); } }

                    var cubeCount = 0;
                    for (var ci = 0; ci < totalC; ci++) {
                        var fc = fdC[orderC[ci]];
                        var fullnessC = fc.fullness || 0;
                        var _smC = fc.data && fc.data.string_map;
                        var renderColorC = null;
                        if (_smC && _smC['render.color']) {
                            var _cpC = String(_smC['render.color']).split(',').map(Number);
                            if (_cpC.length >= 3 && _cpC.every(function (n) { return !isNaN(n); })) renderColorC = _cpC;
                        }
                        var frameSchemeC = (_smC && _smC['render.colorScheme']) ? _smC['render.colorScheme'] : defaultColorSchemeC;
                        var rgbC = renderColorC ? renderColorC
                            : lc2.getRgbBySchemeName(frameSchemeC, fullnessC);

                        // Position the cube at the frame's physics (x, y, z).
                        var px = fc.rect.x, py = fc.rect.y, pz = fc.z || 0;
                        _cubeMat4.makeTranslation(px, py, pz);
                        _cubeMesh.setMatrixAt(cubeCount, _cubeMat4);

                        // Instance color: fullness-driven physics color (LightColor authority).
                        // MeshLambertMaterial multiplies this with the diffuse shading from the
                        // scene lights, so bright faces = key light, dark faces = shadow.
                        _cubeColor.setRGB((rgbC[0] || 0) / 255, (rgbC[1] || 0) / 255, (rgbC[2] || 0) / 255);
                        _cubeMesh.setColorAt(cubeCount, _cubeColor);
                        cubeCount++;
                    }
                    _cubeMesh.count = cubeCount;
                    _cubeMesh.instanceMatrix.needsUpdate = true;
                    if (_cubeMesh.instanceColor) { _cubeMesh.instanceColor.needsUpdate = true; }
                    _cubeMesh.visible = cubeCount > 0;
                } else {
                    if (_cubeMesh) { _cubeMesh.visible = false; }
                }
            } else {
                // ── POINTS PATH — per-dim layers; every non-cube/non-mesh experiment ──
                // runs here (R4-GEO, 2026-07-02). The cube InstancedMesh (if it was ever
                // created from a prior cube-tick) is simply hidden; no disposal needed.
                if (_cubeMesh) { _cubeMesh.visible = false; }
                _hideAllDimLayers();

                if (layParticles && tickData && tickData.frameData) {
                    var fd = tickData.frameData;
                    var total = fd.length;

                    var lc = lc2;   // alias — same LightColor authority
                    var rs = rs2;
                    var smokeOn        = (typeof opts.smoke === 'number') && opts.smoke > 0;
                    var smokeIntensity = smokeOn ? opts.smoke : 0.0;
                    var defaultColorScheme = opts.colorScheme || 'warmcool';

                    // _currentShapeUniform = the SCENE-DEFAULT uShape (glow-sprite buckets that carry
                    // no per-frame shape — glow/smoke — use it). The crisp 'N' shape bucket now
                    // carries its OWN per-frame uShape (see the family fold below), so ball vs box can
                    // COEXIST per-frame instead of sharing this one scene-wide uniform.
                    _currentShapeUniform = rs.toUniform(resolvedShape);

                    // Scene-wide additive-vs-normal choice: glow > 0 makes the WHOLE scene one
                    // additive blend mode.
                    var plainWantAdditive = (typeof glow === 'number' && glow > 0);

                    // Per-frame render FAMILY (per-frame render-intent resolution): each frame's
                    // shape/mesh is resolved PER-FRAME via RenderFamily.resolveRenderFamily(f, opts,
                    // _is3D) inside the loop below (never the old scene-wide `resolve(null,opts)`).
                    // The resolved family is folded into the bucket KEY so per-frame ball / box /
                    // sphere COEXIST in one scene (each family draws with its own THREE object):
                    //   'sphere' → paint:'sphere' (the L2e instanced-sphere fold, per-instance color)
                    //   'pts:<v>' → the crisp Points sprite with per-bucket uShape v (0=ball, 1=box)
                    //   'mesh:<id>' → siphoned OUT of the sprite buckets into a per-asset glTF clone
                    //                 layout (meshByAsset below) — the per-frame projectile case.
                    // PHASE 1 limitation (stated): a per-frame render.shape='cube' in a NON-cube-default
                    // scene renders here as the box SPRITE (uShape 1), not a lit 3D cube — the lit cube
                    // InstancedMesh is still the scene-wide `useCubeMesh` branch above (folding cube into
                    // a per-bucket family is Phase 2; deferred pending realm verification).
                    var meshByAsset = {};   // assetId -> [frame]  (per-frame render.mesh siphon)

                    // ── Bucket rows into (dim, family) groups — ONE THREE object per bucket.
                    // "Dim decides APPEARANCE, position decides OCCLUSION": no
                    // parent/leaf distinction — a frame is classified by its OWN dim using its
                    // OWN fullness/box size.
                    var buckets = {};   // key -> { additive, paint, uShape?, list:[{x,y,z,full,r,g,b,a,size}] }
                    function _pushTo(layer, key, additive, paint, x, y, z, full, rgb, a, size, uShapeVariant) {
                        var b = buckets[key];
                        if (!b) { b = buckets[key] = { layer: layer, additive: additive, paint: paint, uShape: uShapeVariant, list: [] }; }
                        b.list.push({ x: x, y: y, z: z, full: full, r: rgb[0] || 0, g: rgb[1] || 0, b2: rgb[2] || 0, a: a, size: size });
                    }

                    for (var i = 0; i < total; i++) {
                        var f = fd[i];
                        var layer = f.layer || 0;

                        // Per-frame render FAMILY (spec §2/§3): resolve mesh/shape from THIS frame.
                        // A per-frame render.mesh stamp OUTRANKS shape AND color — it renders as a
                        // glTF clone regardless (a per-frame projectile). Siphon it out of the sprite
                        // buckets and continue.
                        var famF = RenderFamily.resolveRenderFamily(f, opts, _is3D);
                        if (famF.family === 'mesh') {
                            (meshByAsset[famF.assetId] || (meshByAsset[famF.assetId] = [])).push(f);
                            continue;
                        }

                        var fullness = f.fullness || 0;
                        // render.color: read from string_map (the cross-engine path), NOT f.data.render.color
                        // (the retired typed render section — f.data.render.color is the old shape that was
                        // never written by the engine and caused a silent null for most frames).
                        var _sm = f.data && f.data.string_map;
                        var renderColor = null;
                        if (_sm && _sm['render.color']) {
                            var _cp = String(_sm['render.color']).split(',').map(Number);
                            if (_cp.length >= 3 && _cp.every(function (n) { return !isNaN(n); })) renderColor = _cp;
                        }
                        // Per-frame color scheme override.
                        var frameScheme = (_sm && _sm['render.colorScheme']) ? _sm['render.colorScheme'] : defaultColorScheme;
                        var z = f.z || 0, px = f.rect.x, py = f.rect.y;
                        var voxelSize = (f.rect && f.rect.w) ? f.rect.w : 1;

                        var alpha01 = lc.getAlphaFromIntensity(fullness);
                        var rgbN = renderColor ? renderColor : lc.getRgbBySchemeName(frameScheme, fullness);
                        // Destination bucket, in priority order: the whole scene additive (glow > 0);
                        // soft puffs (smoke > 0); else the per-frame render FAMILY (famF) folded into
                        // the KEY so ball / box / sphere coexist per-frame.
                        var nSize = plainWantAdditive ? (4.0 * fullness + 1.0) : voxelSize;
                        if (plainWantAdditive) {
                            // additive glow sprite — shape N/A (additive materials carry no uShape uniform).
                            _pushTo(layer, layer + '|A', true, 'crisp', px, py, z, fullness, rgbN, alpha01, nSize);
                        } else if (smokeOn) {
                            // soft puff — shape N/A.
                            _pushTo(layer, layer + '|N|soft', false, 'soft', px, py, z, fullness, rgbN, alpha01, nSize);
                        } else if (famF.family === 'sphere') {
                            // per-frame render.shape='sphere' → the instanced-sphere family (per-instance color).
                            _pushTo(layer, layer + '|N|sphere', false, 'sphere', px, py, z, fullness, rgbN, alpha01, nSize, 0);
                        } else {
                            // per-frame Points sprite: ball (uShape 0) / box (uShape 1). PHASE 1: a
                            // per-frame render.shape='cube' renders as the box sprite (uv 1) — the lit
                            // 3D cube is the scene-wide useCubeMesh branch only (cube-fold = Phase 2).
                            var uv = (famF.family === 'cube') ? 1 : (famF.uShapeVariant != null ? famF.uShapeVariant : 0);
                            _pushTo(layer, layer + '|N|pts:' + uv, false, 'crisp', px, py, z, fullness, rgbN, alpha01, nSize, uv);
                        }
                    }

                    // ── Fill/grow/paint each populated bucket's THREE object ──
                    var seenKeys = [];
                    for (var key2 in buckets) {
                        if (!buckets.hasOwnProperty(key2)) { continue; }
                        var bucket = buckets[key2];
                        var n = bucket.list.length;
                        if (n === 0) { continue; }
                        seenKeys.push(key2);

                        var entry = _ensureDimLayer(key2, bucket.additive, bucket.paint);
                        _growDimLayerIfNeeded(entry, n);
                        entry.layer = bucket.layer;   // the god-rays source pass reads it (isGodraySource)

                        var cx = 0, cy = 0, cz = 0;

                        if (entry.isSphere) {
                            // ── Sphere InstancedMesh branch (R6, Effect=None baseline) ──
                            // Per-instance TRANSLATE + SCALE (unlike the cube path's fixed
                            // per-scene voxel size): matrix.compose(position, identity
                            // rotation, scale) sizes each sphere by its OWN frame.rect.w
                            // (already carried in `it.size` — the SAME value the crisp/soft
                            // Points path uses for `aSize`), matching "Dim decides
                            // APPEARANCE... a frame is painted per its OWN box size."
                            for (var js = 0; js < n; js++) {
                                var its = bucket.list[js];
                                _spherePos.set(its.x, its.y, its.z);
                                _sphereScale.set(its.size, its.size, its.size);
                                _sphereMat4.compose(_spherePos, _sphereQuat, _sphereScale);
                                entry.mesh.setMatrixAt(js, _sphereMat4);
                                _sphereColor.setRGB(its.r / 255, its.g / 255, its.b2 / 255);
                                entry.mesh.setColorAt(js, _sphereColor);
                                cx += its.x; cy += its.y; cz += its.z;
                            }
                            entry.mesh.count = n;
                            entry.mesh.instanceMatrix.needsUpdate = true;
                            if (entry.mesh.instanceColor) { entry.mesh.instanceColor.needsUpdate = true; }
                        } else {
                            // ── existing crisp/soft Points branch — UNCHANGED ──
                            for (var j = 0; j < n; j++) {
                                var it = bucket.list[j];
                                entry.bufs.posArr[j*3]=it.x; entry.bufs.posArr[j*3+1]=it.y; entry.bufs.posArr[j*3+2]=it.z;
                                entry.bufs.fullArr[j]=it.full;
                                entry.bufs.colArr[j*3]=it.r/255; entry.bufs.colArr[j*3+1]=it.g/255; entry.bufs.colArr[j*3+2]=it.b2/255;
                                entry.bufs.alphaArr[j]=it.a;
                                entry.bufs.sizeArr[j]=it.size;
                                // Puff-size gate (aSmoke/uSmoke — the pre-existing `smoke`
                                // render option, independent of color/alpha), driven by
                                // `paint` — a bucket-level constant (the key carries it).
                                entry.bufs.smokeArr[j] = (bucket.paint === 'soft') ? 1 : 0;
                                cx += it.x; cy += it.y; cz += it.z;
                            }
                            entry.geo.setDrawRange(0, n);
                            entry.geo.attributes.position.needsUpdate  = true;
                            entry.geo.attributes.aFullness.needsUpdate = true;
                            entry.geo.attributes.aColor.needsUpdate    = true;
                            entry.geo.attributes.aAlpha.needsUpdate    = true;
                            entry.geo.attributes.aSize.needsUpdate     = true;
                            entry.geo.attributes.aSmoke.needsUpdate    = true;

                            entry.mat.uniforms.uPersp.value = _is3D ? 1.0 : 0.0;
                            // uShape is now PER-BUCKET (the per-frame render.shape fold): the crisp
                            // family bucket carries its own ball(0)/box(1) uShape; glow/smoke buckets
                            // (no per-frame shape) fall back to the scene default. So ball and box
                            // coexist per-frame, each in its own bucket with its own uniform.
                            if (entry.mat.uniforms.uShape) {
                                entry.mat.uniforms.uShape.value = (bucket.uShape != null) ? bucket.uShape : _currentShapeUniform;
                            }
                            if (bucket.additive) {
                                // glow controls flash gain DIRECTLY: glow:0 -> flash OFF
                                // (intensity 0), not full (the fix that stopped glow:0
                                // drowning white smoke in gold).
                                entry.mat.uniforms.uIntensity.value = (typeof glow === 'number') ? glow : 1.0;
                                entry.mat.uniforms.uHeat.value      = (typeof opts.heat === 'number') ? opts.heat : 0.0;
                                entry.mat.uniforms.uSmoke.value     = 0.0;   // additive/flash quanta never puff
                            } else {
                                entry.mat.uniforms.uIntensity.value = 1.0;
                                entry.mat.uniforms.uHeat.value      = (typeof opts.heat === 'number') ? opts.heat : 0.0;
                                entry.mat.uniforms.uSmoke.value     = (bucket.paint === 'soft') ? smokeIntensity : 0.0;
                            }
                        }

                        entry.centroid.x = cx / n; entry.centroid.y = cy / n; entry.centroid.z = cz / n;
                        entry.mesh.visible = true;
                    }

                    // ── Camera-distance sort (painter's algorithm) — farthest
                    // drawn FIRST so a nearer translucent bucket visually occludes (dims) a
                    // farther one, exactly like real depth would (only meaningful in 3D; the
                    // 2D ortho camera has no orbit/depth axis quanta actually vary along). ──
                    if (_is3D && seenKeys.length > 1) {
                        seenKeys.sort(function (ka, kb) {
                            return _camDistSq(_dimLayers[kb].centroid) - _camDistSq(_dimLayers[ka].centroid);
                        });
                        for (var oi = 0; oi < seenKeys.length; oi++) {
                            _dimLayers[seenKeys[oi]].mesh.renderOrder = oi;
                        }
                    }

                    // ── Per-frame render.mesh (spec §2 — the per-frame projectile case) ───────
                    // Lay out glTF clones for each per-frame-stamped asset (siphoned above into
                    // meshByAsset), per-asset sub-pool. This runs INSIDE the Points path so mesh
                    // frames coexist with sprite/points frames in ONE scene — the bullet renders as
                    // its glTF while the propellant renders as points, with NO experiment-level
                    // setRenderOption('mesh',…). A referenced asset that is still loading / failed
                    // draws nothing (FAIL-LOUD overlay via _ensureMeshLoaded), never a silent sprite.
                    var _pfMeshAssets = [];
                    var _pfMeshLaid = 0;
                    for (var _aid in meshByAsset) {
                        if (!meshByAsset.hasOwnProperty(_aid)) { continue; }
                        _pfMeshAssets.push(_aid);
                        _ensureMeshLoaded(_aid);
                        var _pfMe = _meshCache[_aid];
                        if (_pfMe && _pfMe.status === 'ready') {
                            _pfMeshLaid += _layoutMeshClones(_pfMe, meshByAsset[_aid], layParticles, opts.meshScale, _aid);
                        }
                    }
                    _hideMeshClonesExcept(_pfMeshAssets);
                    if (_meshGroup) { _meshGroup.visible = _pfMeshLaid > 0; }
                }
            }

            // ── Particles OFF: what was laid (for the god-rays source) leaves the lit picture ──
            _particlesLaidHidden = [];
            if (!drawParticles) {
                var laid = [_cubeMesh, _meshGroup];
                for (var lk in _dimLayers) { if (_dimLayers.hasOwnProperty(lk)) { laid.push(_dimLayers[lk].mesh); } }
                for (var li = 0; li < laid.length; li++) {
                    if (laid[li] && laid[li].visible) { laid[li].visible = false; _particlesLaidHidden.push(laid[li]); }
                }
            }

            // ── Field layer — build the heightfield ONLY when consumed ──
            if (fieldConsumed) { _updateFieldTex(tickData); }

            // ── Render ── (the FINAL composite dispatch — one implementation, two callers)
            _composeFinal(opts, tickData);
        }

        /**
         * The FINAL composite dispatch — the ONE implementation, two callers (`_renderTick`
         * and `captureStill`). Extracted so a capture replays the IDENTICAL composite in the
         * same JS task; the full readback guarantee (and why `preserveDrawingBuffer:true` is
         * the WRONG fix) is RENDERER_CONTRACT §1a.4. A second copy here would be the
         * two-paths bug: the capture would silently stop matching the picture.
         * @param {object} opts     — the render options bag in effect
         * @param {object} tickData — the TickData the composite draws from
         */
        function _composeFinal(opts, tickData) {
            opts = opts || {};
            // godrays is a final-composite layer (a declared render option). It owns the final pass when on; it and the 2D water-fx
            // filter are alternative final composites (concurrent use is a phase-2 item).
            var wantGodrays = _wantGodrays(opts);
            var time = _filters.length > 0
                ? RendererProviderContract.filterTime(tickData) : null;
            _lastFilterTime = time;   // capture provenance (§1a.4)

            if (wantGodrays) {
                _renderGodrays(opts, tickData);
            } else if (_filters.length > 0) {
                // 2D water-fx path: scene → rtA, then the full-screen quad shader.
                // (Particle visibility already set above via the Particles layer flag.)
                _applyFilter(_filters[0], time);
                // Additional filters would use rtB ping-pong — deferred to phase 2
            } else {
                _renderer.setRenderTarget(null);
                _renderer.render(_scene, _camera);
            }

            // G2 — draw the aim feedback (cube, reticle, surrounds) LAST, over whatever the FX dispatch just
            // composited to the screen, so it can never be washed by bloom/god-rays.
            _renderAimFeedbackPass();
        }

        // ── Public interface ─────────────────────────────────────────────────

        var provider = {

            // RETURNS the drawing surface (RENDERER_CONTRACT §1 init row): the WebGL canvas.
            init: function (opts) {
                _init(opts);
                return _canvas;
            },

            renderTick: function (tickData, largeObjects, options) {
                _renderTick(tickData, largeObjects, options);
            },

            filter: function (filterSpec, perFilterOptions) {
                // R-6: perFilterOptions (optional) merges over the runner options for this
                // specific filter call. Stored on the spec entry for _applyFilter.
                if (!filterSpec) return;
                if (filterSpec.name) {
                    for (var i = 0; i < _filters.length; i++) {
                        if (_filters[i].name === filterSpec.name) {
                            if (perFilterOptions) {
                                _filters[i]._perFilterOptions = perFilterOptions;
                            }
                            return;
                        }
                    }
                }
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
                if (name && _quadMeshes[name]) {
                    _quadScene.remove(_quadMeshes[name]);
                    delete _quadMeshes[name];
                }
            },

            setSize: function (w, h) {
                RendererProviderContract.requireProviderSize('threeProvider.setSize', w, h);
                _width = w; _height = h;
                if (_renderer) {
                    _renderer.setSize(w, h);
                    if (_is3D) {
                        _camera.aspect = w / h;
                        _applyOrbit();            // re-centre + updateProjectionMatrix
                    } else {
                        _camera.right  = w;
                        _camera.bottom = h;
                        _camera.updateProjectionMatrix();
                    }
                    if (_rtA) { _rtA.setSize(w, h); }
                    if (_rtB) { _rtB.setSize(w, h); }
                    if (_godrays) { _godrays.setSize(w, h); }
                } else if (_is3D) {
                    // No camera yet, but the pose basis still moved with the canvas centre:
                    // _applyOrbit is the one pose-applied site, so it carries the notice.
                    _applyOrbit();
                }
                // Field DataTexture uses FieldBuilder.FIELD_OPTS dimensions (fixed).
                // No rebuild needed for canvas resize — field resolution is independent.
            },

            // Loop owned by FrqtlApp — no-ops here.
            start: function () {},
            stop:  function () {},

            destroy: function () {
                if (_renderer) { _renderer.dispose(); }
                if (_canvas && _canvas.parentNode) { _canvas.parentNode.removeChild(_canvas); }
                _initialized = false;
                _filters = [];
            },

            raw: function () {
                // Escape hatch: return { renderer, scene, camera }
                return { renderer: _renderer, scene: _scene, camera: _camera };
            },

            // ── projection (OPTIONAL — the scene's camera intrinsics, §1a.5) ──
            // `fovY` is FERRIED from the camera-geometry authority, never a literal typed
            // here (a second FOV copy is the split-basis bug in miniature). three's own 2D
            // ortho mode reports the same `affine2d` kind as p5 — one vocabulary.
            projection: function () {
                if (!_is3D) { return { kind: 'affine2d' }; }
                return {
                    kind: 'perspective',
                    fovY: ThreeCameraGeometry.CAMERA_FOV_DEG
                };
            },

            // ── captureStill (OPTIONAL — the `composite` tap executor, §1a.4) ──
            // The compliant GL readback, in ONE JS task: (1) replay the identical final
            // composite against the RETAINED scene + LAST options bag (no
            // preserveDrawingBuffer ⇒ an earlier task's buffer is already cleared), then
            // (2) readPixels + bottom-left→top-left flip through the shared owner. Promise
            // per the frozen signature (WebGPU readback is async); resolves immediately.
            // FAIL-LOUD before the first renderTick — never a blank still a golden would
            // silently absorb.
            captureStill: function () {
                if (!_initialized || !_renderer) {
                    throw new Error('[three-provider.captureStill] no live renderer — init() has ' +
                        'not run. (FAIL-LOUD — never a null or blank still.)');
                }
                if (!_lastTickData) {
                    throw new Error('[three-provider.captureStill] nothing has been composited yet ' +
                        '(no renderTick/repaint since init). A capture before the first draw would be ' +
                        'a cleared framebuffer, i.e. a black still. (FAIL-LOUD.)');
                }
                var common = CaptureStillCommon;
                // 1. Same-task re-render of the retained scene through the ONE dispatch.
                _composeFinal(_lastOpts, _lastTickData);
                // 2. Same-task readback.
                var gl = _renderer.getContext();
                var el = _renderer.domElement;
                var bag = common.captureFromGl(gl, el.width, el.height, {
                    cssWidth:  el.clientWidth  || _physW(),
                    cssHeight: el.clientHeight || _physH(),
                    physicsW:  _physW(),
                    physicsH:  _physH(),
                    // This provider's OWN ordered _filters list is the one authority on
                    // which passes ran and in what order (it also sees a direct BYO
                    // prov.filter() call, which the runner's map does not).
                    filtersApplied: _filters.map(function (f) { return f.name; }),
                    renderBaseCanvas: _lastRenderBaseCanvas,
                    filterTime: _lastFilterTime,
                    // The TickData the replayed composite was drawn from → `renderedTick`.
                    composited: _lastTickData
                });
                return Promise.resolve(bag);
            },

            // ── Camera control (OPTIONAL convenience capability) ───────────────
            // Returns a sugar handle { setOrbit, getOrbit } the experiment wires a
            // widget to — the camera analogue of the blackbody oven's live setTemperature.
            // Returns null in 2D mode (no orbit camera): consumers capability-CHECK
            // the result (runner.cameraControl == null → hide the camera UI), they
            // never sniff the renderer. A custom BYO provider may implement the same
            // method to get the same UI for free.
            getCameraControl: function () {
                if (!_is3D) { return null; }
                // The preset table and the pose-axis descriptors are DECLARED in
                // three-camera-contract.js (the ONE source for both). The handle
                // PUBLISHES them, so every host renders whatever THIS camera
                // declares — and a BYO provider's own lists show up for free.
                var _contract = ThreeCameraContract;
                function _presets() { return _contract.cameraPresets(_physW(), _physH()); }
                /**
                 * THROW-OR-APPLY input guard (the property-accessor discipline).
                 * A pose write is either applied or it FAILS LOUD — a silent
                 * clamp-and-continue on a NaN would leave the camera in a
                 * plausible-looking wrong place with no diagnostic. Absent /
                 * `undefined` still means "not mentioned" (a partial spec is the
                 * whole point of setOrbit), so only a PRESENT non-finite value
                 * throws. There is deliberately no fail-loud at the orbit POLE:
                 * a chart singularity is not a contract violation, and a throw
                 * mid-drag is a grenade (see _decomposeOrbitBasis).
                 */
                function _finite(v, name, where) {
                    if (typeof v === 'number' && isFinite(v)) { return v; }
                    throw new Error('three-provider camera ' + where + ': ' + name +
                        ' must be a finite number, got ' + String(v) +
                        ' — throw-or-apply, never a silent clamp.');
                }
                var ctl = {
                    presets: Object.keys(_presets()),
                    // POSE AXES: name = the getOrbit()/setOrbit() key,
                    // constraint/widgetConfig = the slider range + step. A newly
                    // declared axis gets a slider in every host with no host edit.
                    poseFields: _contract.cameraPoseFields(_physW(), _physH()),
                    setOrbit: function (spec) {
                        if (!spec) { return; }
                        // POINT SHAPE FIRST, at the ONE owner: both spellings arrive here as
                        // the canonical object form, and a malformed point has already thrown
                        // the same message the 2D handle throws — never a silent re-centre.
                        spec = OrbitBag.normalizeOrbitPatch(spec);
                        if (spec.azimuth   !== undefined) { _orbit.azimuth   = _finite(spec.azimuth,   'azimuth',   'setOrbit'); }
                        if (spec.elevation !== undefined) { _orbit.elevation = _finite(spec.elevation, 'elevation', 'setOrbit'); }
                        if (spec.distance  !== undefined) { _orbit.distance  = _finite(spec.distance,  'distance',  'setOrbit'); }
                        // ROLL — the fifth pose coordinate (rotation about the view
                        // axis). It WRAPS (mod 360) and is NEVER clamped: roll has no
                        // pole, so a clamp would make the picture stop rolling part-way.
                        if (spec.roll !== undefined) {
                            var _r = _finite(spec.roll, 'roll', 'setOrbit') % 360;
                            _orbit.roll = (_r > 180) ? _r - 360 : ((_r <= -180) ? _r + 360 : _r);
                        }
                        // `target` is only touched when the spec MENTIONS it, so a
                        // look/zoom write never silently un-walks the camera. An
                        // explicit `target:null` re-centres on the scene.
                        if ('target' in spec) {
                            var t = spec.target;
                            _orbit.target = t ? { x: t.x, y: t.y, z: t.z } : null;
                        }
                        _applyOrbit();
                    },
                    getOrbit: function () { return _orbitBag(); },
                    // addPoseListener(fn) → unsubscribe — the POSE-CHANGE NOTICE: `fn(bag)` runs
                    // after EVERY pose write (setOrbit, look, move, setPreset, a resize), with
                    // the getOrbit() bag, whichever surface wrote it. A dependent that must
                    // follow the camera (the runner's aim + carry) subscribes here instead of
                    // being forwarded to by each writer.
                    addPoseListener: function (fn) {
                        if (!_poseNotice) { _poseNotice = OrbitBag.makePoseNotice(); }
                        return _poseNotice.add(fn);
                    },
                    setPreset: function (name) {
                        var all = _presets(), p = all[name];
                        if (!p) {
                            throw new Error('[three-provider camera] setPreset("' + name + '"): this camera offers ' +
                                'only [' + Object.keys(all).join(', ') + '] (ctl.presets). (FAIL-LOUD.)');
                        }
                        // A preset is a FULL framing reset — it re-centres the walk AND
                        // levels the horizon, which is what makes the preset buttons the
                        // reliable way back. A stale roll surviving a preset click would
                        // break that promise, so roll:0 is part of the reset.
                        ctl.setOrbit({ azimuth: p.azimuth, elevation: p.elevation,
                                       distance: p.distance, roll: 0, target: null });
                    },
                    // ── look — ROTATE the camera, screen-relative (the LOOK drag) ───────
                    // The INTERACTIVE peer of `move()`: `{spin, pitch}` in DEGREES,
                    // INCREMENTAL, both applied in the camera's OWN frame.
                    //   spin  → rotate about the view axis  → the picture ROLLS.
                    //   pitch → rotate about screen-right   → the view tilts up/down,
                    //           orbiting the centre at a FIXED radius.
                    // Successive screen-relative rotations do NOT compose the way three
                    // Euler angles applied in a fixed order do, so this goes through the
                    // ONE rotation authority (three-camera-geometry `_rotateOrbit`):
                    // compose the bag into an orthonormal frame, rotate the FRAME,
                    // decompose back. `azimuth` is therefore DERIVED on this path (an
                    // output of the decomposition) while staying a writable declarative
                    // coordinate through `setOrbit` — the same coordinate, two directions
                    // through the same adjoint pair. `distance`/`target` are untouched:
                    // a LOOK is never a translation.
                    //
                    // A LOOK widget therefore composes NOTHING — it forwards its stick
                    // deflection as a delta and all the geometry stays here. A BYO
                    // provider that omits `look` is capability-checked by its absence
                    // (LOOK degrades to a defined no-op, never a substituted rotation),
                    // exactly like `move`.
                    look: function (spec) {
                        if (!spec) { return; }
                        var spin  = (spec.spin  === undefined) ? 0 : _finite(spec.spin,  'spin',  'look');
                        var pitch = (spec.pitch === undefined) ? 0 : _finite(spec.pitch, 'pitch', 'look');
                        if (!spin && !pitch) { return; }
                        var next = ThreeCameraGeometry
                            ._rotateOrbit(_orbit, { spin: spin, pitch: pitch }, _physW(), _physH());
                        _orbit.azimuth   = next.azimuth;
                        _orbit.elevation = next.elevation;
                        _orbit.roll      = next.roll;
                        _applyOrbit();
                    },
                    // ── move — TRANSLATE the camera, screen-relative (the FPS walk) ─────
                    // The translation peer of `look()`. `{forward, strafe}` in ENGINE
                    // PIXELS: `forward` walks along the FULL view direction (positive =
                    // into the picture, so objects grow), `strafe` slides along
                    // screen-right. NEITHER changes azimuth, elevation, roll or distance —
                    // a walk is never a rotation.
                    //
                    // MOVE is ALWAYS screen-relative: the walk is NOT
                    // pinned to a ground plane, so walking forward while pitched down
                    // DESCENDS. This is a fly control, not an FPS ground walk — and it is
                    // what keeps "positive strafe reads as rightward on screen" true at
                    // roll ≠ 0, where screen-right is no longer world-horizontal.
                    //
                    // It exists so a MOVE joystick (CameraControls.js) can be pure
                    // translation without re-deriving any orbit math in the widget: ALL the
                    // geometry stays at the one camera authority (the same split
                    // cameraOffsetFromWorld/screenToWorld already use). A BYO provider that
                    // does not implement it is capability-checked by its absence, exactly
                    // like getCameraControl itself.
                    move: function (spec) {
                        if (!spec) { return; }
                        var f = (spec.forward === undefined) ? 0 : _finite(spec.forward, 'forward', 'move');
                        var s = (spec.strafe  === undefined) ? 0 : _finite(spec.strafe,  'strafe',  'move');
                        if (!f && !s) { return; }
                        _orbit.target = ThreeCameraGeometry
                            ._orbitTranslate(_orbit, _physW(), _physH(), f, s);
                        _applyOrbit();
                    },
                    // ── Camera-relative carry transform (OPTIONAL capability, Q-A5-CAP) ──
                    // The world↔camera-space transform PAIR that lets a feature carry a
                    // selected object PINNED to the camera view (A5): capture the object's
                    // fixed camera-local offset once, then re-place it as the orbit pose
                    // changes. ALL orbit math stays at the ONE camera authority
                    // (three-camera-geometry `_orbitCameraBasis`, which screenToWorld also
                    // reuses) — the feature never reads _camera.position, never re-derives
                    // the basis, never sniffs the renderer. Because that basis is the
                    // ROLLED one, a carried object stays pinned through a roll exactly as
                    // it does through an azimuth change.
                    // Units = ENGINE PIXELS throughout (directly feeds
                    // runner.updateObjectProperty(h,'center',…)). Only reachable when _is3D
                    // (getCameraControl returns null in 2D), so both are inherently 2D-null.
                    //
                    // cameraOffsetFromWorld([x,y,z]) → {right,up,forward}: the world point in
                    //   the camera's orthonormal frame (capture a selection's FIXED offset once).
                    cameraOffsetFromWorld: function (worldPoint) {
                        return ThreeCameraGeometry
                            ._cameraOffsetFromWorld(_orbit, _physW(), _physH(), worldPoint);
                    },
                    // worldFromCameraOffset({right,up,forward}) → [x,y,z]: the exact inverse off
                    //   the LIVE pose (re-place the object as az/el/dist change → pinned in view).
                    worldFromCameraOffset: function (off) {
                        return ThreeCameraGeometry
                            ._worldFromCameraOffset(_orbit, _physW(), _physH(), off);
                    }
                };
                return ctl;
            },

            // renderCapabilities — OPTIONAL (see the module-level docstring above
            // _renderCapabilitiesThree). Static per-provider metadata; no live
            // WebGL/THREE instance state needed, so the free function above is
            // called unmodified.
            renderCapabilities: _renderCapabilitiesThree,

            // ── screenToWorld (OPTIONAL convenience capability, S5b) ────────────
            // Studio Controls Realignment §7 r2 item 4/§2.5.7 "3D drag":
            // "three: raycast against the object's plane [at its z]". Returns
            // `null` in 2D mode (no orbit camera to raycast from — mirrors
            // `getCameraControl`'s own 2D-mode null) or when the ray is parallel
            // to / behind the requested z-plane. `_screenToWorldThree`
            // (three-camera-geometry.js, THREE-instance-free — see its own
            // docstring) does the actual pinhole-camera math off the SAME rolled
            // basis the live camera uses; this is a thin live-state wrapper.
            screenToWorld: function (canvasCssX, canvasCssY, canvasCssWidth, canvasCssHeight, worldZ) {
                if (!_is3D) { return null; }
                return ThreeCameraGeometry._screenToWorldThree(_orbit, _physW(), _physH(),
                    canvasCssX, canvasCssY, canvasCssWidth, canvasCssHeight, worldZ);
            },

            get initialized() { return _initialized; }
        };

        return provider;
    }

// _renderCapabilitiesThree is exported beside the factory so the capability LIST is testable in
// node WITHOUT a live THREE/WebGL provider. The camera GEOMETRY is NOT re-exported: its one
// import path is three-camera-geometry.js.
export { makeThreeProvider, _renderCapabilitiesThree, loSkin, loSkinSig, applyLoSkin, LO_FACE_MUL };
