/* Copyright 2023-2026 by Essam Abadir */

/**
 * godrays-layer.js — the three provider's god-rays layer: WHAT the rays are computed from
 * (the source rule, `godraySource`), HOW (`godrayMode`: streak | field | radial), and the passes.
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

    /**
     * The `godrayMode` render option — the ONE owner of its values and default. HOW the rays are
     * computed from the source frames:
     *   'streak' (default) — each source frame trails a short streak BEHIND it along its own
     *                        projected direction of travel (FrameData vx,vy,vz: the mean axis);
     *   'field'            — every source frame's projected direction is splatted into a
     *                        direction grid; each pixel's march steps UPSTREAM along the local
     *                        direction, so the shafts extend ahead of the light and bend with the flow;
     *   'radial'           — every pixel marches toward ONE light point (`lightUV`).
     * `godrayDensity` is the reach in every mode: the march's fraction of the distance to the
     * light (radial), the streak length (streak), the march length (field).
     */
    var GODRAY_MODES = ['streak', 'field', 'radial'];
    var GODRAY_MODE_DEFAULT = 'streak';

    /**
     * The effective mode for a bag value: unset → the default; anything not declared THROWS.
     * @param {*} value — opts.godrayMode
     * @returns {'streak'|'field'|'radial'}
     */
    function resolveGodrayMode(value) {
        if (value === undefined || value === null) { return GODRAY_MODE_DEFAULT; }
        if (GODRAY_MODES.indexOf(value) === -1) {
            throw new Error('GodraysLayer: godrayMode ' + JSON.stringify(value) + ' is not one of [' +
                GODRAY_MODES.join(', ') + '] (default ' + JSON.stringify(GODRAY_MODE_DEFAULT) + ').');
        }
        return value;
    }

    // Screen-fraction scales (of the screen's SHORT side) the density knob multiplies.
    var STREAK_REACH = 0.06;      // streak length = godrayDensity × this
    var STREAK_WIDTH = 0.004;     // streak width (floor 1.5 physical px)
    var STREAK_GAIN  = 0.6;       // streak brightness relative to the source pixel at the head
    var FIELD_REACH  = 0.25;      // field march length = godrayDensity × this
    var FIELD_CELLS  = 96;        // direction-grid columns along the LONG side
    var FIELD_RADIUS = 3;         // splat radius in grid cells (tent weight)
    var MARCH_SAMPLES = 50;       // steps per pixel in the radial and field marches

    /**
     * Each frame's head in screen UV and its projected direction of travel as a UNIT vector in
     * PIXEL space (aspect-corrected). The direction is the projection of (pos + d̂) minus the
     * projection of pos, d̂ = normalize(vx,vy,vz). A frame with no direction, one whose direction
     * projects to under 1e-6 px (along the view axis), or one outside the clip volume yields NO
     * entry: it still draws in the scene as itself, a dot with no streak and no flow.
     * @param {Array<object>} frames — FrameData (rect.x, rect.y, z, vx, vy, vz)
     * @param {Function} project — (x,y,z) → NDC {x,y,z}
     * @param {number} w @param {number} h — the target's pixel size
     * @returns {{count:number, u:Float32Array, v:Float32Array, dx:Float32Array, dy:Float32Array}}
     */
    function screenDirections(frames, project, w, h) {
        var n = frames.length;
        var out = { count: 0, u: new Float32Array(n), v: new Float32Array(n), dx: new Float32Array(n), dy: new Float32Array(n) };
        for (var i = 0; i < n; i++) {
            var f = frames[i];
            var vx = f.vx || 0, vy = f.vy || 0, vz = f.vz || 0;
            var len = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (len === 0) { continue; }
            var x = f.rect.x, y = f.rect.y, z = f.z || 0;
            var p0 = project(x, y, z), x0 = p0.x, y0 = p0.y, z0 = p0.z;
            if (!(Math.abs(x0) <= 1 && Math.abs(y0) <= 1 && Math.abs(z0) <= 1)) { continue; }
            var p1 = project(x + vx / len, y + vy / len, z + vz / len);
            var px = (p1.x - x0) * w / 2, py = (p1.y - y0) * h / 2;
            var pl = Math.sqrt(px * px + py * py);
            if (!(pl > 1e-6)) { continue; }
            var k = out.count++;
            out.u[k] = x0 * 0.5 + 0.5; out.v[k] = y0 * 0.5 + 0.5;
            out.dx[k] = px / pl; out.dy[k] = py / pl;
        }
        return out;
    }

    /**
     * Screen-space streak quads (two triangles each), in NDC: the head at the frame, the tail
     * `lengthPx` BEHIND it (opposite its direction), `widthPx` wide. Per vertex: `head` (the head's
     * UV, where the colour is sampled) and `fade` (1 at the head, 0 at the tail).
     * @param {object} dirs — screenDirections(...)
     * @returns {{count:number, position:Float32Array, head:Float32Array, fade:Float32Array}}
     */
    function streakQuads(dirs, lengthPx, widthPx, w, h) {
        var n = dirs.count, pos = new Float32Array(n * 18), head = new Float32Array(n * 12), fade = new Float32Array(n * 6);
        var sx = 2 / w, sy = 2 / h, half = widthPx / 2;
        for (var i = 0; i < n; i++) {
            var hx = dirs.u[i] * 2 - 1, hy = dirs.v[i] * 2 - 1, dx = dirs.dx[i], dy = dirs.dy[i];
            var tx = hx - dx * lengthPx * sx, ty = hy - dy * lengthPx * sy;
            var nx = -dy * half * sx, ny = dx * half * sy;
            // head+n, head-n, tail+n ; tail+n, head-n, tail-n
            var vs = [hx + nx, hy + ny, 1, hx - nx, hy - ny, 1, tx + nx, ty + ny, 0,
                      tx + nx, ty + ny, 0, hx - nx, hy - ny, 1, tx - nx, ty - ny, 0];
            for (var j = 0; j < 6; j++) {
                var o = i * 6 + j;
                pos[o * 3] = vs[j * 3]; pos[o * 3 + 1] = vs[j * 3 + 1]; pos[o * 3 + 2] = 0;
                fade[o] = vs[j * 3 + 2];
                head[o * 2] = dirs.u[i]; head[o * 2 + 1] = dirs.v[i];
            }
        }
        return { count: n * 6, position: pos, head: head, fade: fade };
    }

    /**
     * The direction field: a `gw × gh` RGBA grid (row 0 = bottom, UV v = 0). Each direction is
     * splatted with a tent weight over `radius` cells; a cell stores its normalized mean direction
     * in R,G (0.5 + 0.5·d̂) and in B the strength a = coherence × coverage (coherence = |mean|,
     * 0 where opposed flows cancel; coverage = min(1, Σweight)). Decode: d = (RG·2 − 1)·B.
     * @param {object} dirs — screenDirections(...)
     * @returns {{width:number, height:number, data:Uint8Array}}
     */
    function buildDirectionField(dirs, gw, gh, radius) {
        var cells = gw * gh, sx = new Float32Array(cells), sy = new Float32Array(cells), sw = new Float32Array(cells);
        for (var i = 0; i < dirs.count; i++) {
            var cx = dirs.u[i] * gw - 0.5, cy = dirs.v[i] * gh - 0.5;
            var i0 = Math.max(0, Math.ceil(cx - radius)), i1 = Math.min(gw - 1, Math.floor(cx + radius));
            var j0 = Math.max(0, Math.ceil(cy - radius)), j1 = Math.min(gh - 1, Math.floor(cy + radius));
            for (var j = j0; j <= j1; j++) {
                for (var ii = i0; ii <= i1; ii++) {
                    var ex = ii - cx, ey = j - cy, wt = 1 - Math.sqrt(ex * ex + ey * ey) / (radius + 1);
                    if (wt <= 0) { continue; }
                    var c = j * gw + ii;
                    sx[c] += dirs.dx[i] * wt; sy[c] += dirs.dy[i] * wt; sw[c] += wt;
                }
            }
        }
        var data = new Uint8Array(cells * 4);
        for (var k = 0; k < cells; k++) {
            var r = 0.5, g = 0.5, a = 0;
            if (sw[k] > 0) {
                var mx = sx[k] / sw[k], my = sy[k] / sw[k], m = Math.sqrt(mx * mx + my * my);
                if (m > 1e-6) { r = 0.5 + 0.5 * mx / m; g = 0.5 + 0.5 * my / m; a = m * Math.min(1, sw[k]); }
            }
            data[k * 4] = Math.round(r * 255); data[k * 4 + 1] = Math.round(g * 255);
            data[k * 4 + 2] = Math.round(a * 255); data[k * 4 + 3] = 255;
        }
        return { width: gw, height: gh, data: data };
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
        'const int SAMPLES = ' + MARCH_SAMPLES + ';',
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

    // The 'field' march: the radial march's accumulation (same decay/weight/exposure), but each
    // step reads the LOCAL direction from the field and steps upstream along it, so a pixel
    // collects the light that flowed into it. An empty cell (strength 0) does not step.
    var GODRAY_FIELD_FRAG = [
        'uniform sampler2D uScene;',
        'uniform sampler2D uField;',
        'uniform vec2  uStepUV;',     // one step's length in UV per unit pixel-space direction
        'uniform float uDecay;',
        'uniform float uWeight;',
        'uniform float uExposure;',
        'varying vec2 vTexCoord;',
        'const int SAMPLES = ' + MARCH_SAMPLES + ';',
        'void main() {',
        '  vec2 tc = vTexCoord;',
        '  vec3 rays = vec3(0.0);',
        '  float decay = 1.0;',
        '  for (int i = 0; i < SAMPLES; i++) {',
        '    vec3 f = texture2D(uField, tc).rgb;',
        '    tc -= (f.rg * 2.0 - 1.0) * f.b * uStepUV;',
        '    vec3 s = texture2D(uScene, tc).rgb;',
        '    rays += s * decay * uWeight;',
        '    decay *= uDecay;',
        '  }',
        '  gl_FragColor = vec4(rays * uExposure, 1.0);',
        '}'
    ].join('\n');

    // The 'streak' quads: positions are NDC already; colour = the source image AT THE HEAD,
    // fading to black at the tail, added (additive blending) into a black rays target.
    var GODRAY_STREAK_VERT = [
        'attribute vec2 aHead;',
        'attribute float aFade;',
        'varying vec2 vHead;',
        'varying float vFade;',
        'void main() {',
        '  vHead = aHead; vFade = aFade;',
        '  gl_Position = vec4(position.xy, 0.0, 1.0);',
        '}'
    ].join('\n');
    // The head colour is the brightest texel of the 3×3 around the head: a sub-pixel quantum lands
    // between texels, so a single tap at its centre reads it dimmed.
    var GODRAY_STREAK_FRAG = [
        'uniform sampler2D uSource;',
        'uniform vec2  uTexel;',
        'uniform float uGain;',
        'varying vec2 vHead;',
        'varying float vFade;',
        'void main() {',
        '  vec3 c = vec3(0.0);',
        '  for (int i = -1; i <= 1; i++) {',
        '    for (int j = -1; j <= 1; j++) {',
        '      c = max(c, texture2D(uSource, vHead + vec2(float(i), float(j)) * uTexel).rgb);',
        '    }',
        '  }',
        '  gl_FragColor = vec4(c * vFade * uGain, 1.0);',
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
     * The live passes, created lazily by the provider on first activation. Every mode ends in the
     * same composite (sceneRT + rays × intensity → screen); they differ in how rtRays is made.
     * @param {object} THREE
     * @param {string} quadVert — the provider's full-screen-quad vertex shader
     * @param {number} w @param {number} h — the provider's physical size
     * @returns {{rtSource:object, setSize:Function, lightUV:Function, march:Function, streak:Function, field:Function}}
     */
    function makeGodrayPasses(THREE, quadVert, w, h) {
        var fxScene = new THREE.Scene();
        var fxQuad  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        fxScene.add(fxQuad);
        var vLight = new THREE.Vector3(), vProj = new THREE.Vector3(), clearKeep = new THREE.Color();
        var size = { w: w, h: h };
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
        var fieldMat = new THREE.ShaderMaterial({
            uniforms: {
                uScene:    { value: null },
                uField:    { value: null },
                uStepUV:   { value: new THREE.Vector2(0, 0) },
                uDecay:    blurMat.uniforms.uDecay,      // the SAME accumulation as the radial march
                uWeight:   blurMat.uniforms.uWeight,
                uExposure: blurMat.uniforms.uExposure
            },
            vertexShader: quadVert, fragmentShader: GODRAY_FIELD_FRAG, depthWrite: false, depthTest: false
        });
        var fieldTex = null;

        var streakScene = new THREE.Scene();
        var streakGeo = new THREE.BufferGeometry(), streakCap = 0;
        var streakMat = new THREE.ShaderMaterial({
            uniforms: { uSource: { value: null }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) }, uGain: { value: STREAK_GAIN } },
            vertexShader: GODRAY_STREAK_VERT, fragmentShader: GODRAY_STREAK_FRAG,
            blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false,
            side: THREE.DoubleSide   // a quad's winding follows its direction; never cull it
        });
        var streakMesh = new THREE.Mesh(streakGeo, streakMat);
        streakMesh.frustumCulled = false;
        streakScene.add(streakMesh);

        function composite(renderer, quadCamera, sceneRT, rtRays, intensity) {
            compMat.uniforms.uScene.value = sceneRT.texture;
            compMat.uniforms.uRays.value  = rtRays.texture;
            compMat.uniforms.uIntensity.value = intensity;
            fxQuad.material = compMat;
            renderer.setRenderTarget(null);
            renderer.render(fxScene, quadCamera);
        }
        // The reach in every mode is the density knob; unset → the value the radial march holds.
        function densityOf(density) { return (typeof density === 'number') ? density : blurMat.uniforms.uDensity.value; }
        function directionsOf(frames, camera) {
            return screenDirections(frames, function (x, y, z) { return vProj.set(x, y, z).project(camera); }, size.w, size.h);
        }
        function shortSide() { return Math.min(size.w, size.h); }

        var passes = {
            rtSource: new THREE.WebGLRenderTarget(w, h),   // the SOURCE image the provider renders into
            setSize: function (sw, sh) { size.w = sw; size.h = sh; passes.rtSource.setSize(sw, sh); },
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
            // 'radial' — Pass 2: march sourceRT toward lightUV → rtRays. Pass 3: composite.
            march: function (renderer, quadCamera, sceneRT, sourceRT, rtRays, lightUV, density, intensity) {
                blurMat.uniforms.uScene.value = sourceRT.texture;
                blurMat.uniforms.uLightPos.value.copy(lightUV);
                if (typeof density === 'number') { blurMat.uniforms.uDensity.value = density; }
                fxQuad.material = blurMat;
                renderer.setRenderTarget(rtRays);
                renderer.render(fxScene, quadCamera);
                composite(renderer, quadCamera, sceneRT, rtRays, intensity);
            },
            // 'streak' — rtRays cleared to black, one fading quad per moving source frame trailing
            // behind it (colour = sourceRT at its head), then the composite.
            streak: function (renderer, quadCamera, sceneRT, sourceRT, rtRays, frames, camera, density, intensity) {
                var q = streakQuads(directionsOf(frames, camera), densityOf(density) * STREAK_REACH * shortSide(),
                    Math.max(1.5, STREAK_WIDTH * shortSide()), size.w, size.h);
                if (q.count > streakCap) {
                    streakCap = Math.max(q.count, streakCap * 2, 600);
                    streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(streakCap * 3), 3));
                    streakGeo.setAttribute('aHead', new THREE.BufferAttribute(new Float32Array(streakCap * 2), 2));
                    streakGeo.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(streakCap), 1));
                }
                if (q.count > 0) {
                    streakGeo.attributes.position.array.set(q.position);
                    streakGeo.attributes.aHead.array.set(q.head);
                    streakGeo.attributes.aFade.array.set(q.fade);
                    streakGeo.attributes.position.needsUpdate = true;
                    streakGeo.attributes.aHead.needsUpdate = true;
                    streakGeo.attributes.aFade.needsUpdate = true;
                }
                streakGeo.setDrawRange(0, q.count);
                streakMat.uniforms.uSource.value = sourceRT.texture;
                streakMat.uniforms.uTexel.value.set(1 / size.w, 1 / size.h);
                renderer.getClearColor(clearKeep);
                var alphaKeep = renderer.getClearAlpha();
                renderer.setClearColor(0x000000, 1);
                renderer.setRenderTarget(rtRays);
                renderer.clear();
                if (q.count > 0) { renderer.render(streakScene, quadCamera); }
                renderer.setClearColor(clearKeep, alphaKeep);
                composite(renderer, quadCamera, sceneRT, rtRays, intensity);
            },
            // 'field' — the source frames' directions → a grid texture; march sourceRT along it →
            // rtRays; then the composite.
            field: function (renderer, quadCamera, sceneRT, sourceRT, rtRays, frames, camera, density, intensity) {
                var long = Math.max(size.w, size.h);
                var gw = Math.max(8, Math.round(FIELD_CELLS * size.w / long)), gh = Math.max(8, Math.round(FIELD_CELLS * size.h / long));
                var grid = buildDirectionField(directionsOf(frames, camera), gw, gh, FIELD_RADIUS);
                if (!fieldTex || fieldTex.image.width !== gw || fieldTex.image.height !== gh) {
                    if (fieldTex) { fieldTex.dispose(); }
                    fieldTex = new THREE.DataTexture(grid.data, gw, gh, THREE.RGBAFormat);
                    fieldTex.minFilter = THREE.LinearFilter; fieldTex.magFilter = THREE.LinearFilter;
                } else {
                    fieldTex.image.data.set(grid.data);
                }
                fieldTex.needsUpdate = true;
                var stepPx = densityOf(density) * FIELD_REACH * shortSide() / MARCH_SAMPLES;
                fieldMat.uniforms.uScene.value = sourceRT.texture;
                fieldMat.uniforms.uField.value = fieldTex;
                fieldMat.uniforms.uStepUV.value.set(stepPx / size.w, stepPx / size.h);
                fxQuad.material = fieldMat;
                renderer.setRenderTarget(rtRays);
                renderer.render(fxScene, quadCamera);
                composite(renderer, quadCamera, sceneRT, rtRays, intensity);
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
    GODRAY_MODES,
    GODRAY_MODE_DEFAULT,
    resolveGodrayMode,
    screenDirections,
    streakQuads,
    buildDirectionField,
    makeGodrayPasses
};
