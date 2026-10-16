/* Copyright 2023-2026 by Essam Abadir */

/**
 * FieldBuilder — shared smooth heightfield builder.
 *
 * The ONE field-build source for all renderer providers. Both p5 and three
 * providers call FieldBuilder.buildHeightField(frameData, opts) to produce
 * the same smooth Uint8Array heightfield. No per-provider splat loop.
 *
 * Algorithm: soft-splat with quadratic falloff kernel + optional separable blur.
 * Each particle deposits its fullness into a (2R+1)^2 neighborhood with weight
 *   w(dx,dy) = max(0, 1 - (dx^2+dy^2)/R^2)
 * Accumulated values are scaled by FIELD_GAIN then clamped to [0,255].
 * An optional 3-tap separable blur pass smooths the result further.
 *
 * Coordinate convention: field[py * w + px], physics-pixel space (y-down, top-left).
 * Matches the vTexCoord flip in the providers' texture uploads.
 *
 * Export:
 *   FieldBuilder.buildHeightField(frameData, opts) -> Uint8Array(w * h)
 *   FieldBuilder.FIELD_OPTS  — shared default options constant
 */

(function () {
    'use strict';

    // Shared constants — both providers use THESE values so they cannot drift.
    var FIELD_OPTS = {
        w:      300,    // field texel resolution — a render choice, independent of the world rect
        h:      200,    // (canvasW/canvasH map physics px onto it per call)
        radius: 2,      // splat radius in texels
        gain:   4.0,    // scale factor: typical fullness × gain ≈ mid-range accumulation
        blur:   true    // run a 3-tap separable blur pass after the splat
    };

    // THE size rule (renderer-provider-contract.js `requireProviderSize`) — one owner for the
    // renderer layer. Resolved at CALL time: the renderer manifest loads this file before it.
    function _requireProviderSize(who, w, h) {
        var C = (typeof module !== 'undefined' && module.exports)
            ? require('./renderer-provider-contract.js')
            : (typeof window !== 'undefined' ? window.RendererProviderContract : null);
        if (!C || typeof C.requireProviderSize !== 'function') {
            throw new Error('FieldBuilder: RendererProviderContract.requireProviderSize is unreachable ' +
                '(load compat/renderer/renderer-provider-contract.js — renderer-layer-manifest.js) — ' +
                'fail-loud, not a fallback.');
        }
        C.requireProviderSize(who, w, h);
    }

    /**
     * Build a smooth single-channel heightfield from frameData.
     *
     * @param {Array<{rect:{x,y}, fullness:number}>} frameData
     * @param {{w:number, h:number, radius:number, gain:number, blur:boolean,
     *          canvasW:number, canvasH:number}} opts
     *   `canvasW`/`canvasH` are REQUIRED: the physics rect the frameData coordinates live in
     *   (the runner's canvas_rect). Callers spread FIELD_OPTS and add them.
     * @returns {Uint8Array} length = opts.w * opts.h, values 0-255
     * @throws {Error} when canvasW/canvasH are absent or not positive finite numbers.
     */
    function buildHeightField(frameData, opts) {
        _requireProviderSize('FieldBuilder.buildHeightField(frameData, Object.assign({}, FIELD_OPTS, ' +
            '{ canvasW, canvasH })) opts.canvasW/canvasH', opts && opts.canvasW, opts && opts.canvasH);
        var canvasW = opts.canvasW;
        var canvasH = opts.canvasH;
        var fw = opts.w      || FIELD_OPTS.w;
        var fh = opts.h      || FIELD_OPTS.h;
        var R  = opts.radius !== undefined ? opts.radius : FIELD_OPTS.radius;
        var gain = opts.gain !== undefined ? opts.gain : FIELD_OPTS.gain;
        var doBlur = opts.blur !== undefined ? opts.blur : FIELD_OPTS.blur;

        var R2 = R * R;
        // Use a Float32 accumulation buffer then quantize at the end
        var accum = new Float32Array(fw * fh);

        if (frameData) {
            // Map physics-pixel coords → field-texel coords by (fw/canvasW, fh/canvasH).
            var scaleX = fw / canvasW;
            var scaleY = fh / canvasH;

            for (var i = 0; i < frameData.length; i++) {
                var f  = frameData[i];
                var fx = f.rect.x * scaleX;
                var fy = f.rect.y * scaleY;
                var px = Math.round(fx) | 0;
                var py = Math.round(fy) | 0;
                var v  = f.fullness || 0;
                if (v <= 0) continue;

                // Splat into (2R+1)^2 neighborhood
                var x0 = Math.max(0,  px - R);
                var x1 = Math.min(fw - 1, px + R);
                var y0 = Math.max(0,  py - R);
                var y1 = Math.min(fh - 1, py + R);

                for (var sy = y0; sy <= y1; sy++) {
                    var dy = sy - py;
                    for (var sx = x0; sx <= x1; sx++) {
                        var dx = sx - px;
                        var d2 = dx * dx + dy * dy;
                        if (d2 > R2) continue;
                        var w = 1.0 - d2 / R2;   // quadratic falloff
                        accum[sy * fw + sx] += v * w;
                    }
                }
            }
        }

        // Quantize (scale by gain, clamp to [0,255])
        var out = new Uint8Array(fw * fh);
        for (var k = 0; k < accum.length; k++) {
            var val = Math.round(accum[k] * gain * 255);
            out[k] = val > 255 ? 255 : val;
        }

        // Optional 3-tap separable Gaussian blur [0.25, 0.5, 0.25]
        if (doBlur && fw > 2 && fh > 2) {
            var tmp = new Uint8Array(fw * fh);
            var row, col, idx, a, b, c;

            // Horizontal pass
            for (row = 0; row < fh; row++) {
                var rowBase = row * fw;
                tmp[rowBase] = out[rowBase];
                tmp[rowBase + fw - 1] = out[rowBase + fw - 1];
                for (col = 1; col < fw - 1; col++) {
                    idx = rowBase + col;
                    a = out[idx - 1];
                    b = out[idx];
                    c = out[idx + 1];
                    tmp[idx] = (a + 2 * b + c + 2) >> 2;
                }
            }

            // Vertical pass (reads tmp, writes out)
            for (col = 0; col < fw; col++) {
                out[col] = tmp[col];
                out[(fh - 1) * fw + col] = tmp[(fh - 1) * fw + col];
            }
            for (row = 1; row < fh - 1; row++) {
                for (col = 0; col < fw; col++) {
                    a = tmp[(row - 1) * fw + col];
                    b = tmp[row * fw + col];
                    c = tmp[(row + 1) * fw + col];
                    out[row * fw + col] = (a + 2 * b + c + 2) >> 2;
                }
            }
        }

        return out;
    }

    var FieldBuilder = {
        FIELD_OPTS:      FIELD_OPTS,
        buildHeightField: buildHeightField
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { FieldBuilder: FieldBuilder };
    } else {
        window.FieldBuilder = FieldBuilder;
    }

})();
