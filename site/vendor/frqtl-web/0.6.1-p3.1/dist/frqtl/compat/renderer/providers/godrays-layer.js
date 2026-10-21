/* Copyright 2023-2026 by Essam Abadir */

/**
 * godrays-layer.js — the three provider's god-rays layer: WHAT the rays are computed from
 * (the source rule), the light position, and the radial march + composite passes.
 *
 * God-rays are a render effect computed from the density of the LIGHT particles: by default
 * (`godraySource: 'leaf'`) the frames of the fundamental (lowest) layer. A parent frame at a higher layer is drawn in the scene
 * but is neither a ray source nor a ray shadow; an LO is not a frame, so it is no source
 * either (the provider keeps it as a depth-only occluder). Every god-rays site — the
 * provider's source pass (per-bucket / cube / clone visibility) and `lightUV` here — asks
 * `isGodraySource`; none re-states the rule.
 *
 * What stays in `three-provider.js`: `_renderGodraySource`, which needs the provider's live
 * scene objects, and the orchestration in `_renderGodrays`. This file is its own because the
 * rule is pure and because `three-provider.js` sits at the per-file ceiling
 * `verify-publish-surface.mjs` enforces, whose instruction is to split at a natural seam.
 *
 * An ES module: `three-provider.js` imports it; `providers/test/godrays-layer.test.mjs` drives it in node.
 */



    /**
     * The world's fundamental layer as TickData states it: the lowest ALLOCATED layer in
     * `tickData.dimensionData` (ENGINE_CONTRACT: the fundamental is derived as the lowest
     * layer that exists; the engine collects one DimensionData per allocated layer). A
     * renderer has no universe handle, so TickData is its one read. `null` for a world with
     * no dimension and no frame; THROWS when frames arrive with no dimension to place them.
     * @param {object} tickData
     * @returns {number|null}
     */
    function fundamentalLayerOf(tickData) {
        var dd = tickData && tickData.dimensionData;
        var lowest = null;
        if (dd) {
            for (var i = 0; i < dd.length; i++) {
                var l = dd[i] && dd[i].layer;
                if (typeof l === 'number' && (lowest === null || l < lowest)) { lowest = l; }
            }
        }
        if (lowest === null && tickData && tickData.frameData && tickData.frameData.length) {
            throw new Error('GodraysLayer: tickData carries ' + tickData.frameData.length + ' frames but no ' +
                'dimensionData[].layer, so the fundamental layer the god-rays are computed from cannot be named.');
        }
        return lowest;
    }

    /**
     * Is a frame at `layer` a god-rays source? Exactly the fundamental-layer frames.
     * @param {number} layer             — FrameData.layer
     * @param {number|null} fundamental  — fundamentalLayerOf(tickData)
     * @returns {boolean}
     */
    function isGodraySource(layer, fundamental) {
        return fundamental !== null && layer === fundamental;
    }

    /**
     * The `godraySource` render option — the ONE owner of its values and default. A scene picks
     * what the rays are computed from: 'leaf' (the fundamental-layer frames; LOs depth-only) or
     * 'all' (the whole lit scene: every frame of every layer and every LO). The renderer reads
     * it through the options bag; the engine interprets nothing.
     */
    var GODRAY_SOURCES = ['leaf', 'all'];
    var GODRAY_SOURCE_DEFAULT = 'leaf';

    /**
     * The effective source for a bag value: unset → the default; anything not declared THROWS
     * naming every legal value.
     * @param {*} value — opts.godraySource
     * @returns {'leaf'|'all'}
     */
    function resolveGodraySource(value) {
        if (value === undefined || value === null) { return GODRAY_SOURCE_DEFAULT; }
        if (GODRAY_SOURCES.indexOf(value) === -1) {
            throw new Error('GodraysLayer: godraySource ' + JSON.stringify(value) + ' is not one of [' +
                GODRAY_SOURCES.join(', ') + '] (default ' + JSON.stringify(GODRAY_SOURCE_DEFAULT) + ').');
        }
        return value;
    }

    /**
     * The frames the god-rays are computed from: the fundamental layer under 'leaf' (the
     * default), every frame under 'all'.
     * @param {object} tickData
     * @param {*} [source] — opts.godraySource
     * @returns {Array<object>}
     */
    function godraySourceFrames(tickData, source) {
        var fd = (tickData && tickData.frameData) || [];
        if (resolveGodraySource(source) === 'all') { return fd.slice(); }
        var fund = fundamentalLayerOf(tickData);
        var out = [];
        for (var i = 0; i < fd.length; i++) { if (isGodraySource(fd[i].layer, fund)) { out.push(fd[i]); } }
        return out;
    }

    // R4-B god-rays — radial light-scattering march (adapted from abberg's
    // VolumetericLightShader / GPU Gems 3). For each pixel it steps TOWARD the
    // projected light position, accumulating SOURCE brightness with exponential
    // decay → bright shafts where the path crosses luminous quanta, ray-shadows
    // where an occluder hid them. Output is PURE rays (starts at 0, no base scene
    // term) so the composite adds them once over the unblurred full scene.
    var GODRAY_BLUR_FRAG = [
        'uniform sampler2D uScene;',
        'uniform vec2  uLightPos;',   // light position in [0,1] screen UV
        'uniform float uDecay;',
        'uniform float uDensity;',
        'uniform float uWeight;',
        'uniform float uExposure;',
        'varying vec2 vTexCoord;',
        'const int SAMPLES = 50;',
        'void main() {',
        '  vec2 tc = vTexCoord;',
        '  vec2 delta = (tc - uLightPos) * (1.0 / float(SAMPLES)) * uDensity;',
        '  vec3 rays = vec3(0.0);',
        '  float decay = 1.0;',
        '  for (int i = 0; i < SAMPLES; i++) {',
        '    tc -= delta;',
        '    vec3 s = texture2D(uScene, tc).rgb;',
        '    rays += s * decay * uWeight;',
        '    decay *= uDecay;',
        '  }',
        '  gl_FragColor = vec4(rays * uExposure, 1.0);',
        '}'
    ].join('\n');

    // R4-B composite — unblurred scene + additive rays * intensity knob.
    var GODRAY_COMP_FRAG = [
        'uniform sampler2D uScene;',
        'uniform sampler2D uRays;',
        'uniform float uIntensity;',
        'varying vec2 vTexCoord;',
        'void main() {',
        '  vec3 scene = texture2D(uScene, vTexCoord).rgb;',
        '  vec3 rays  = texture2D(uRays,  vTexCoord).rgb;',
        '  gl_FragColor = vec4(scene + rays * uIntensity, 1.0);',
        '}'
    ].join('\n');

    /**
     * The live passes, created lazily by the provider on first activation.
     * @param {object} THREE
     * @param {string} quadVert — the provider's full-screen-quad vertex shader
     * @param {number} w @param {number} h — the provider's physical size
     * @returns {{rtSource:object, setSize:Function, lightUV:Function, march:Function}}
     */
    function makeGodrayPasses(THREE, quadVert, w, h) {
        var fxScene = new THREE.Scene();
        var fxQuad  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        fxScene.add(fxQuad);
        var vLight = new THREE.Vector3();
        var blurMat = new THREE.ShaderMaterial({
            uniforms: {
                uScene:    { value: null },
                uLightPos: { value: new THREE.Vector2(0.5, 0.5) },
                uDecay:    { value: 0.95 },
                uDensity:  { value: 0.8  },
                uWeight:   { value: 0.4  },
                uExposure: { value: 0.35 }
            },
            vertexShader: quadVert, fragmentShader: GODRAY_BLUR_FRAG, depthWrite: false, depthTest: false
        });
        var compMat = new THREE.ShaderMaterial({
            uniforms: { uScene: { value: null }, uRays: { value: null }, uIntensity: { value: 1.0 } },
            vertexShader: quadVert, fragmentShader: GODRAY_COMP_FRAG, depthWrite: false, depthTest: false
        });
        var passes = {
            rtSource: new THREE.WebGLRenderTarget(w, h),   // the SOURCE image the provider renders into
            setSize: function (sw, sh) { passes.rtSource.setSize(sw, sh); },
            // Light position in [0,1] screen UV: the fullness-weighted centroid of the SOURCE
            // frames, projected through `camera` (2D ortho + 3D persp); screen centre when none.
            lightUV: function (tickData, camera, source) {
                var fd = godraySourceFrames(tickData, source);
                var sx = 0, sy = 0, sz = 0, sw = 0;
                for (var i = 0; i < fd.length; i++) {
                    var f = fd[i];
                    var wt = (f.fullness || 0) + 0.05;   // floor so empty-fullness still weighs
                    sx += f.rect.x * wt; sy += f.rect.y * wt; sz += (f.z || 0) * wt; sw += wt;
                }
                if (sw <= 0) { return new THREE.Vector2(0.5, 0.5); }
                vLight.set(sx / sw, sy / sw, sz / sw).project(camera);   // → NDC [-1,1]
                return new THREE.Vector2(vLight.x * 0.5 + 0.5, vLight.y * 0.5 + 0.5);
            },
            // Pass 2: march sourceRT → rtRays. Pass 3: sceneRT + rays × intensity → screen.
            march: function (renderer, quadCamera, sceneRT, sourceRT, rtRays, lightUV, density, intensity) {
                blurMat.uniforms.uScene.value = sourceRT.texture;
                blurMat.uniforms.uLightPos.value.copy(lightUV);
                if (typeof density === 'number') { blurMat.uniforms.uDensity.value = density; }
                fxQuad.material = blurMat;
                renderer.setRenderTarget(rtRays);
                renderer.render(fxScene, quadCamera);
                compMat.uniforms.uScene.value = sceneRT.texture;
                compMat.uniforms.uRays.value  = rtRays.texture;
                compMat.uniforms.uIntensity.value = intensity;
                fxQuad.material = compMat;
                renderer.setRenderTarget(null);
                renderer.render(fxScene, quadCamera);
            }
        };
        return passes;
    }

export {
    fundamentalLayerOf,
    isGodraySource,
    godraySourceFrames,
    GODRAY_SOURCES,
    GODRAY_SOURCE_DEFAULT,
    resolveGodraySource,
    makeGodrayPasses
};
