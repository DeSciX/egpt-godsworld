/* Copyright 2023-2026 by Essam Abadir */

/**
 * Filters — built-in post-process filter specs for the RendererProvider shim.
 *
 * A filterSpec is a backend-keyed object:
 *   {
 *     name:    string,           // unique ID used by filter()/removeFilter()
 *     glsl:    string,           // GLSL 1.0 WebGL2 fragment body (works both backends)
 *     strands: function(p5),     // optional: p5.strands JS body for WebGPU
 *     tsl:     function(THREE),  // optional: TSL node graph for three.js WebGPU
 *     uniforms: string[]         // uniform names this filter uses
 *   }
 *
 * The glsl field is the day-one portable body — works on the WebGL2 path for
 * BOTH backends (p5 provider offscreen canvas; three ShaderMaterial quad).
 * strands/tsl fields are ADDITIVE for the WebGPU path and are NOT required.
 *
 * Standard uniforms always available to every filter (from render-boot.js §5):
 *   uResolution  vec2   — canvas size in pixels
 *   uTime        float  — simulation seconds at the tick being rendered
 *                         (tick / FILTER_TICKS_PER_SECOND, 60 today; owner:
 *                         renderer-provider-contract.js `filterTime`) — a paused
 *                         scene's filters hold still
 *   uField       sampler2D  — R8 occupancy/height texture (from doTick() frameData)
 *   uScene       sampler2D  — rendered particle layer (the frame before this pass)
 *
 * Coordinate convention: vTexCoord is [0..1] with origin at bottom-left (WebGL
 * default for textures). The water heightfield uses this directly.
 *
 * Usage:
 *   renderer.filter(Filters.water);
 *   renderer.filter(Filters.bloom);
 *   renderer.removeFilter('water');
 */

(function () {
    'use strict';

    // ── Filters.water ────────────────────────────────────────────────────────
    //
    // WebGL2 water-surface post-process (§8 from WS_RENDERER_SHIM_DESIGN.md).
    // uField = occupancy/height from the CA wave; uScene = rendered particle layer.
    // Computes surface normal via finite differences of the heightfield, then:
    //   - Refracts the scene lookup by the surface slope
    //   - Adds a specular highlight from a fixed light
    //   - Adds fake caustics (bright at high curvature)
    //   - Applies a shallow-water tint

    var WATER_GLSL = [
        'precision highp float;',
        '',
        'uniform sampler2D uField;',
        'uniform sampler2D uScene;',
        'uniform vec2      uResolution;',
        'uniform float     uTime;',
        '',
        'varying vec2 vTexCoord;',
        '',
        '// Sample height with a small ripple that advances with simulation time (uTime).',
        'float height(vec2 uv) {',
        '    float h = texture2D(uField, uv).r;',
        '    h += 0.03 * sin(uv.x * 60.0 + uTime * 1.5)',
        '       + 0.03 * sin(uv.y * 48.0 - uTime * 1.1);',
        '    return h;',
        '}',
        '',
        'void main() {',
        '    vec2 uv    = vTexCoord;',
        '    vec2 texel = 1.0 / uResolution;',
        '',
        '    // Surface normal from finite differences (Sobel-ish).',
        '    float hL = height(uv - vec2(texel.x, 0.0));',
        '    float hR = height(uv + vec2(texel.x, 0.0));',
        '    float hD = height(uv - vec2(0.0, texel.y));',
        '    float hU = height(uv + vec2(0.0, texel.y));',
        '    vec3  n  = normalize(vec3(hL - hR, hD - hU, 0.18));',
        '',
        '    // Refraction: offset scene lookup by surface slope (Snell-ish cheap approx).',
        '    float refractAmt = 0.025;',
        '    vec2  refracted  = uv + n.xy * refractAmt;',
        '    vec3  base       = texture2D(uScene, refracted).rgb;',
        '',
        '    // Specular highlight from a fixed directional light.',
        '    vec3  lightDir = normalize(vec3(0.4, 0.7, 0.6));',
        '    float spec     = pow(max(dot(n, lightDir), 0.0), 32.0);',
        '',
        '    // Fake caustics: bright where the surface focuses (high curvature).',
        '    float curvature = abs((hL + hR + hU + hD) * 0.25 - height(uv));',
        '    float caustic   = smoothstep(0.02, 0.12, curvature);',
        '',
        '    // Shallow-water tint deepening with height; add specular + caustics.',
        '    vec3  waterTint = mix(',
        '        vec3(0.02, 0.10, 0.16),',
        '        vec3(0.10, 0.34, 0.42),',
        '        height(uv)',
        '    );',
        '    vec3  color = base * 0.65 + waterTint * 0.55',
        '                + spec    * vec3(0.9, 0.97, 1.0)',
        '                + caustic * vec3(0.45, 0.85, 0.95);',
        '',
        '    gl_FragColor = vec4(color, 1.0);',
        '}'
    ].join('\n');

    // ── Filters.bloom ────────────────────────────────────────────────────────
    //
    // Simple single-pass bloom / glow: bright areas bleed softly into neighbours.
    // Uses a 9-tap box blur on pixels above a luminance threshold.

    var BLOOM_GLSL = [
        'precision highp float;',
        '',
        'uniform sampler2D uScene;',
        'uniform vec2      uResolution;',
        'uniform float     uTime;',
        '',
        'varying vec2 vTexCoord;',
        '',
        'float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }',
        '',
        'void main() {',
        '    vec2 uv    = vTexCoord;',
        '    vec2 texel = 1.0 / uResolution;',
        '',
        '    vec3 base  = texture2D(uScene, uv).rgb;',
        '',
        '    // 9-tap box blur of bright regions only',
        '    vec3 bloom = vec3(0.0);',
        '    float wSum = 0.0;',
        '    for (int dx = -2; dx <= 2; dx++) {',
        '        for (int dy = -2; dy <= 2; dy++) {',
        '            vec2 off   = vec2(float(dx), float(dy)) * texel * 2.0;',
        '            vec3 s     = texture2D(uScene, uv + off).rgb;',
        '            float l    = luma(s);',
        '            float w    = step(0.5, l);   // only bright pixels contribute',
        '            bloom += s * w;',
        '            wSum  += w;',
        '        }',
        '    }',
        '    if (wSum > 0.0) bloom /= wSum;',
        '',
        '    // Additive blend: base + soft bloom',
        '    vec3 color = base + bloom * 0.35;',
        '    gl_FragColor = vec4(color, 1.0);',
        '}'
    ].join('\n');

    // ── Filters catalog ────────────────────────────────────────────────────

    var Filters = {
        water: {
            name:     'water',
            glsl:     WATER_GLSL,
            uniforms: ['uField', 'uScene', 'uResolution', 'uTime']
        },

        bloom: {
            name:     'bloom',
            glsl:     BLOOM_GLSL,
            uniforms: ['uScene', 'uResolution', 'uTime']
        }
    };

    // ── Export ────────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Filters: Filters };
    } else {
        window.Filters = Filters;
    }

})();
