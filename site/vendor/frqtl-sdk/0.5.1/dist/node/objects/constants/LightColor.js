/* Copyright 2023-2026 by Essam Abadir */

/**
 * LightColor — canonical single-source color mapping for all renderers.
 *
 * This is the ONE color source for all renderers. Both p5 and three providers call
 * LightColor.getRgbBySchemeName(scheme, v01) — no per-renderer color map,
 * no per-shader color spectrum, no alpha ramp duplicated in any provider.
 *
 * Semantics: smooth chroma.js mix across the named-color stops (canonical
 * semantics). If chroma is not present (Node/headless), falls back to linear
 * interpolation so headless run.js / conformance tests do not break.
 *
 * Export contract (ALL functions are pure; no side-effects):
 *   LightColor.getRgbColorFromFullness(v01)       -> [r, g, b]   (back-compat, calls warmcool)
 *   LightColor.getRgbColorFromFrequency(v01)      -> [r, g, b]   (new; 7-stop ROYGBIV, no pink)
 *   LightColor.getRgbBySchemeName(scheme, v01)    -> [r, g, b]   (dispatch; 'roygbiv'|'warmcool')
 *   LightColor.getAlphaFromIntensity(v01)         -> number 0..1 (single alpha authority)
 *   LightColor.getColorNameFor(fullness)          -> string
 *   LightColor.getFullnessForColorName(name)      -> number
 *   LightColor.fullnessColorMap                   -> { name: threshold }
 */

(function () {

    // ── warmcool map (existing; back-compat) ─────────────────────────────────
    // 9 stops red→…→violet→pink. Kept for existing experiments that use the
    // default scheme. The pink terminus is an artifact of the original design;
    // use 'roygbiv' for a spectrally correct ramp.
    var fullnessColorMap = {
        'red':    0.1,
        'orange': 0.2,
        'yellow': 0.3,
        'green':  0.4,
        'cyan':   0.5,
        'blue':   0.6,
        'indigo': 0.7,
        'violet': 0.8,
        'pink':   0.9
    };

    // Named color RGB values for fallback (chroma-absent / Node/headless).
    var namedColorRgb = {
        red:    [255, 0, 0],
        orange: [255, 165, 0],
        yellow: [255, 255, 0],
        green:  [0, 128, 0],
        cyan:   [0, 255, 255],
        blue:   [0, 0, 255],
        indigo: [75, 0, 130],
        violet: [238, 130, 238],
        pink:   [255, 192, 203]
    };

    var stops = Object.entries(fullnessColorMap)
        .sort(function (a, b) { return a[1] - b[1]; })
        .map(function (entry) {
            return { name: entry[0], threshold: entry[1], rgb: namedColorRgb[entry[0]] };
        });

    // ── ROYGBIV map (new; spectrally clean, NO pink) ─────────────────────────
    // 7 stops: red→orange→yellow→green→blue→indigo→violet.
    // v01=0 = red (lowest frequency / highest fullness = most mass-dense), v01=1 = violet.
    // Physics: fullness = mass/capacity = frequency proxy (wavelength = capacity/mass →
    // frequency ∝ mass/capacity). Mapping fullness→ROYGBIV therefore maps frequency to
    // spectrum with zero engine change.
    var roygbivStops = [
        { threshold: 0.0,       name: 'red',    rgb: [255, 0,   0]   },
        { threshold: 1/6,       name: 'orange', rgb: [255, 127, 0]   },
        { threshold: 2/6,       name: 'yellow', rgb: [255, 255, 0]   },
        { threshold: 3/6,       name: 'green',  rgb: [0,   200, 0]   },
        { threshold: 4/6,       name: 'blue',   rgb: [0,   0,   255] },
        { threshold: 5/6,       name: 'indigo', rgb: [75,  0,   130] },
        { threshold: 1.0,       name: 'violet', rgb: [148, 0,   211] }
    ];

    // Fallback: linear interpolation between two RGB arrays.
    function _lerpRgb(a, b, t) {
        return [
            Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)
        ];
    }

    // Interpolate a sorted stop array (each stop has .threshold and .rgb).
    function _lerpStops(stopArr, v01) {
        var v = Math.max(0, Math.min(1, v01));
        if (v <= stopArr[0].threshold) return stopArr[0].rgb.slice();
        if (v >= stopArr[stopArr.length - 1].threshold) return stopArr[stopArr.length - 1].rgb.slice();
        for (var i = 0; i < stopArr.length - 1; i++) {
            if (v <= stopArr[i + 1].threshold) {
                var span = stopArr[i + 1].threshold - stopArr[i].threshold;
                var t    = span > 0 ? (v - stopArr[i].threshold) / span : 0;
                return _lerpRgb(stopArr[i].rgb, stopArr[i + 1].rgb, t);
            }
        }
        return stopArr[stopArr.length - 1].rgb.slice();
    }

    function _fallbackRgb(fullness) {
        if (fullness <= stops[0].threshold) return stops[0].rgb.slice();
        if (fullness >= stops[stops.length - 1].threshold) return stops[stops.length - 1].rgb.slice();
        for (var i = 0; i < stops.length - 1; i++) {
            if (fullness <= stops[i + 1].threshold) {
                var t = (fullness - stops[i].threshold) / (stops[i + 1].threshold - stops[i].threshold);
                return _lerpRgb(stops[i].rgb, stops[i + 1].rgb, t);
            }
        }
        return stops[stops.length - 1].rgb.slice();
    }

    // chroma-based smooth mix for the warmcool ramp.
    function _chromaWarmcool(fullness) {
        var colorNames = Object.keys(fullnessColorMap);
        var targetColor = colorNames[colorNames.length - 1];
        for (var i = 0; i < colorNames.length; i++) {
            if (fullness <= fullnessColorMap[colorNames[i]]) {
                targetColor = colorNames[i];
                break;
            }
        }
        if (targetColor === colorNames[0]) {
            var r0 = chroma(targetColor).rgb();
            return [Math.round(r0[0]), Math.round(r0[1]), Math.round(r0[2])];
        }
        var targetIndex = colorNames.indexOf(targetColor);
        var previousColor = colorNames[targetIndex - 1];
        var mixRatio = (fullness - fullnessColorMap[previousColor]) /
                       (fullnessColorMap[targetColor] - fullnessColorMap[previousColor]);
        var mixed = chroma.mix(previousColor, targetColor, isNaN(mixRatio) ? 0 : mixRatio);
        var rgb = mixed.rgb();
        return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
    }

    // chroma-based smooth mix for the ROYGBIV ramp.
    function _chromaRoygbiv(v01) {
        var v = Math.max(0, Math.min(1, v01));
        var lo = roygbivStops[0], hi = roygbivStops[roygbivStops.length - 1];
        for (var i = 0; i < roygbivStops.length - 1; i++) {
            if (v <= roygbivStops[i + 1].threshold) {
                lo = roygbivStops[i]; hi = roygbivStops[i + 1]; break;
            }
        }
        var span = hi.threshold - lo.threshold;
        var t    = span > 0 ? (v - lo.threshold) / span : 0;
        var mixed = chroma.mix(chroma.rgb(lo.rgb), chroma.rgb(hi.rgb), t);
        var rgb = mixed.rgb();
        return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
    }

    /**
     * getAlphaFromIntensity — single alpha authority for ALL renderers.
     *
     * Layer 1 (API): v01 is the intensity proxy (fullness = mass/capacity ∈ [0,1]).
     *   Returns an alpha value in [0..1].
     * Layer 2 (physics): fullness = frequency proxy (high fullness = high mass-density =
     *   high frequency). Dense quanta (high fullness) appear bright; sparse quanta
     *   (low fullness) appear dim — amplitude proportional to density.
     *
     * Dynamic range: `floor` (dim; near-empty quanta, default 0.35) to 1.0 (full alpha;
     * full quanta). Previous per-provider floor was 180/255≈0.71 — too high, quanta could
     * not read as dim. The wider default range (0.35..1.0) lets sparse quanta in the
     * LOW×LOW lane of the collision matrix visually signal their sparsity.
     *
     * FRQTL-MAINT (2026-07-02, CEO render-tier-table ruling): `floor` is now an OPTIONAL
     * second parameter (default 0.35 — every existing call site that omits it is
     * byte-identical). This is the "extend, don't bypass" answer to the render-tier
     * table's need for a true-invisible-below-a-mass-gate tier (e.g. air, Dim 2, mass≤2):
     * that is NOT expressed by passing `floor:0` here (0 + v*0.65 is still nonzero for any
     * v>0) — a genuine "invisible" tier is a SEPARATE, prior gate the CALLER applies
     * (skip calling this function / force alpha=0 outright when the frame's mass is below
     * the gate) BEFORE reaching for a dynamic-range floor at all. `floor` exists for tiers
     * that want a DIFFERENT dim/bright dynamic range than the 0.35..1.0 default (e.g. a
     * greyscale smoke tier that wants to read as dimmer overall) — it does not itself
     * implement invisibility.
     *
     * @param {number} v01 - intensity value (fullness) in [0, 1]
     * @param {number} [floor=0.35] - alpha at v01=0 (the low end of the dynamic range).
     * @returns {number} alpha in [0, 1]
     */
    function getAlphaFromIntensity(v01, floor) {
        var v = Math.max(0, Math.min(1, v01));
        var f = (floor !== undefined && floor !== null) ? Math.max(0, Math.min(1, floor)) : 0.35;
        // linear ramp: floor at v=0, 1.0 at v=1.
        return f + v * (1 - f);
    }

    /**
     * getRgbColorFromFrequency — 7-stop clean ROYGBIV ramp (NO pink terminus).
     *
     * Layer 1 (API): v01 is fullness (= frequency proxy). Returns [r,g,b] (0-255 ints).
     * Layer 2 (physics): v01=0 → red (lowest frequency / sparsest), v01=1 → violet
     *   (highest frequency / densest). Spectrally correct light-spectrum ordering.
     *
     * @param {number} v01 - fullness / frequency proxy in [0, 1]
     * @returns {number[]} [r, g, b]  (0-255 ints)
     */
    function getRgbColorFromFrequency(v01) {
        if (typeof chroma !== 'undefined') {
            return _chromaRoygbiv(v01);
        }
        return _lerpStops(roygbivStops, v01);
    }

    // ── greyscale ramp (FRQTL-MAINT 2026-07-02, CEO render-tier-table ruling) ────────
    // §1 Dim→visual table: smoke/haze (the high-dim tiers) are "greyscale + alpha by
    // density" — a neutral (no hue) ramp from dark (sparse) to near-white (dense), so
    // density reads on BOTH channels (darker+more-transparent = sparse edges, brighter+
    // more-opaque = dense core) — the standard smoke-rendering technique. 2-stop ramp
    // (degenerate case of the same _lerpStops/_chromaMix machinery every other scheme
    // uses — no new interpolation code).
    var greyscaleStops = [
        { threshold: 0.0, name: 'greyscale-dark',  rgb: [60,  60,  60]  },
        { threshold: 1.0, name: 'greyscale-light', rgb: [235, 235, 235] }
    ];

    function _chromaGreyscale(v01) {
        var v = Math.max(0, Math.min(1, v01));
        var mixed = chroma.mix(chroma.rgb(greyscaleStops[0].rgb), chroma.rgb(greyscaleStops[1].rgb), v);
        var rgb = mixed.rgb();
        return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
    }

    /**
     * getRgbColorFromGreyscale — dark→light neutral ramp (density proxy, no hue).
     *
     * Layer 1 (API): v01 is fullness (density proxy). Returns [r,g,b] (0-255 ints).
     * Layer 2 (physics): v01=0 → dark grey (sparse), v01=1 → near-white (dense) — the
     *   smoke/haze tiers (§1 Dim 4/5) read density via BOTH this ramp AND alpha
     *   (getAlphaFromIntensity), matching the standard smoke-rendering technique.
     *
     * @param {number} v01 - fullness / density proxy in [0, 1]
     * @returns {number[]} [r, g, b]  (0-255 ints)
     */
    function getRgbColorFromGreyscale(v01) {
        if (typeof chroma !== 'undefined') {
            return _chromaGreyscale(v01);
        }
        return _lerpStops(greyscaleStops, v01);
    }

    /**
     * getRgbBySchemeName — single dispatch for named color schemes.
     *
     * Layer 1 (API): scheme ∈ 'roygbiv' | 'warmcool' | 'greyscale'. v01 is fullness in
     *   [0,1]. Unknown scheme → falls through to warmcool (back-compat). Returns [r,g,b]
     *   (0-255 ints).
     * Layer 2 (physics): 'roygbiv' maps fullness→ROYGBIV spectrum (frequency-correct);
     *   'warmcool' maps fullness→warm-to-cool legacy ramp (existing behavior); 'greyscale'
     *   (FRQTL-MAINT 2026-07-02) maps fullness→dark-to-light neutral ramp (the §1 smoke/
     *   haze tiers' shading mode).
     *
     * Both providers call THIS instead of calling getRgbColorFromFullness directly —
     * no per-renderer color logic.
     *
     * @param {string} scheme - 'roygbiv' | 'warmcool' | 'greyscale'
     * @param {number} v01    - fullness in [0, 1]
     * @returns {number[]} [r, g, b]  (0-255 ints)
     */
    function getRgbBySchemeName(scheme, v01) {
        if (scheme === 'roygbiv')   return getRgbColorFromFrequency(v01);
        if (scheme === 'greyscale') return getRgbColorFromGreyscale(v01);
        return getRgbColorFromFullness(v01);  // 'warmcool' or unknown → back-compat
    }

    /**
     * getRgbColorFromFullness — warmcool ramp (back-compat; callers prefer getRgbBySchemeName).
     *
     * Primary path: chroma.js smooth mix (browser; canonical semantics).
     * Fallback path: linear interpolation (Node/headless — no chroma needed).
     *
     * @param {number} fullness - Value typically in 0..1 range
     * @returns {number[]} [r, g, b]  (0-255 ints)
     */
    function getRgbColorFromFullness(fullness) {
        if (typeof chroma !== 'undefined') {
            return _chromaWarmcool(fullness);
        }
        return _fallbackRgb(fullness);
    }

    /**
     * Get the named color for a fullness value (nearest ceiling threshold).
     * @param {number} fullness
     * @returns {string} Color name
     */
    function getColorNameFor(fullness) {
        var colorNames = Object.keys(fullnessColorMap);
        for (var i = 0; i < colorNames.length; i++) {
            if (fullness <= fullnessColorMap[colorNames[i]]) return colorNames[i];
        }
        return 'pink';
    }

    /**
     * Get the fullness threshold for a named color.
     * @param {string} name
     * @returns {number}
     */
    function getFullnessForColorName(name) {
        return fullnessColorMap[name] !== undefined ? fullnessColorMap[name] : 0.5;
    }

    var LightColor = {
        fullnessColorMap:           fullnessColorMap,
        getRgbColorFromFullness:    getRgbColorFromFullness,
        getRgbColorFromFrequency:   getRgbColorFromFrequency,
        getRgbColorFromGreyscale:   getRgbColorFromGreyscale,
        getRgbBySchemeName:         getRgbBySchemeName,
        getAlphaFromIntensity:      getAlphaFromIntensity,
        getColorNameFor:            getColorNameFor,
        getFullnessForColorName:    getFullnessForColorName
    };

    // Single setter in browser; module.exports in Node.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { LightColor: LightColor };
    } else {
        window.LightColor = LightColor;
    }

})();
