/* Copyright 2023-2026 by Essam Abadir */

/**
 * RadiationHistogram — engine-agnostic histogram of non-leaf frames by child count.
 *
 * Computes the "Intensity frequency" panel used by the blackbody and
 * blackbody-substrate experiments. Reads ONLY from tickData.frameData (the
 * engine-agnostic FrameData array produced by doTick() on both JS and WASM
 * engines), so it works identically regardless of engine.
 *
 * ## What it measures
 * Every non-leaf frame (childCount > 0) that has crossed past exitX (default
 * 405 px — the right edge of the oven cavity) is counted into a histogram
 * bucket keyed by its child count. This captures the "intensity" (child count)
 * of escaped radiation. The histogram accumulates over ticks (a running census
 * of escaped non-leaf frames), not a per-tick snapshot.
 *
 * ## Usage
 *   var hist = new RadiationHistogram({ exitX: 405 });
 *   // In onTick:
 *   hist.update(tickData);
 *   if (shouldDraw) hist.draw('histogram-canvas', 'histogram-panel');
 *   // Reset after temperature change:
 *   hist.reset();
 *
 * ## Sharing discipline
 * This module is shared between blackbody/index.html and
 * blackbody-substrate/index.html. Both experiments load it via stack-boot.js
 * data-page-scripts. The draw logic is NOT copy-pasted — both pages use this
 * module. See blackbody/index.html and blackbody-substrate/index.html.
 *
 * @param {Object} [options]
 * @param {number} [options.exitX=405] - x-coordinate threshold; only frames
 *   with rect.x > exitX are counted (escape-detection gate).
 * @param {number} [options.massCap=256] - Maximum child count tracked in the
 *   histogram. Frames with childCount > massCap are clamped to massCap-1.
 */

(function () {

    function RadiationHistogram(options) {
        options = options || {};
        this.exitX   = options.exitX   !== undefined ? options.exitX   : 405;
        this.massCap = options.massCap !== undefined ? options.massCap : 256;

        this.massCounts    = new Array(this.massCap).fill(0);
        this.escapedNonLeaf = 0;
        this.massSum       = 0;
    }

    /**
     * Reset the accumulated histogram (e.g. on temperature change or restart).
     */
    RadiationHistogram.prototype.reset = function () {
        this.massCounts    = new Array(this.massCap).fill(0);
        this.escapedNonLeaf = 0;
        this.massSum       = 0;
    };

    /**
     * Accumulate one tick's worth of non-leaf frames into the histogram.
     *
     * @param {Object} tickData - The tickData object returned by doTick().
     *   tickData.frameData must be an array of FrameData objects with:
     *     - isAlive: boolean (default: true if absent)
     *     - childCount: number (0 = leaf)
     *     - rect: { x: number, ... }
     */
    RadiationHistogram.prototype.update = function (tickData) {
        if (!tickData || !tickData.frameData) return;
        var frames  = tickData.frameData;
        var exitX   = this.exitX;
        var massCap = this.massCap;

        for (var i = 0; i < frames.length; i++) {
            var f = frames[i];
            if (f.isAlive === false) continue;
            var c = f.childCount || 0;
            if (c <= 0) continue;
            var px = (f.rect && f.rect.x !== undefined) ? f.rect.x : 0;
            if (px <= exitX) continue;
            var idx = Math.max(0, Math.min(massCap - 1, Math.round(c)));
            this.massCounts[idx]++;
            this.massSum += c;
            this.escapedNonLeaf++;
        }
    };

    /**
     * Draw the histogram onto the named canvas inside the named panel element.
     *
     * @param {string} canvasId - id of the <canvas> element to draw on.
     * @param {string} panelId  - id of the container panel (used to measure available height).
     *   The panel is assumed to contain .histogram-label, .histogram-sub, and
     *   .histogram-status children that occupy the top; the canvas fills the rest.
     */
    RadiationHistogram.prototype.draw = function (canvasId, panelId) {
        var panel  = document.getElementById(panelId);
        var canvas = document.getElementById(canvasId);
        if (!panel || !canvas || !this.massCounts) return;

        var labelH = 0;
        panel.querySelectorAll('.histogram-label, .histogram-sub, .histogram-status')
            .forEach(function (el) { labelH += el.offsetHeight; });

        var panelW = panel.offsetWidth;
        var panelH = panel.offsetHeight - labelH;
        if (panelW < 10 || panelH < 10) return;
        canvas.width  = panelW;
        canvas.height = panelH;

        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, panelW, panelH);

        var padL = 20, padR = 6, padT = 6, padB = 13;
        var plotW = panelW - padL - padR;
        var plotH = panelH - padT - padB;
        var baseY = padT + plotH;

        var massCounts = this.massCounts;
        var massCap    = this.massCap;

        var total = 0;
        for (var t = 0; t < massCap; t++) total += massCounts[t];
        var maxIdx = 4, acc = 0, cutoff = total * 0.97;
        for (var i = 0; i < massCap; i++) {
            acc += massCounts[i];
            if (total > 0 && acc >= cutoff) { maxIdx = Math.max(maxIdx, i); break; }
        }
        var maxCount = 1;
        for (var j = 0; j <= maxIdx; j++) {
            if (massCounts[j] > maxCount) maxCount = massCounts[j];
        }

        var rows = maxIdx + 1;
        var rowH = plotH / rows;

        ctx.fillStyle = 'rgba(255, 140, 60, 0.9)';
        for (var m = 0; m <= maxIdx; m++) {
            var yTop = baseY - (m + 1) * rowH;
            var len  = (massCounts[m] / maxCount) * plotW;
            ctx.fillRect(padL, yTop + 1, len, Math.max(rowH - 1, 1));
        }

        ctx.fillStyle = '#666';
        ctx.font = '9px Courier New';
        var step = Math.max(1, Math.ceil(rows / 7));
        for (var lm = 0; lm <= maxIdx; lm += step) {
            var ly = baseY - (lm + 0.5) * rowH;
            ctx.fillText(String(lm), 3, ly + 3);
        }

        var escapedNonLeaf = this.escapedNonLeaf;
        var massSum        = this.massSum;
        var avgMass = escapedNonLeaf > 0 ? (massSum / escapedNonLeaf) : 0;
        if (escapedNonLeaf > 0) {
            var my = baseY - Math.min(rows, avgMass + 0.5) * rowH;
            ctx.strokeStyle = 'rgba(120, 200, 255, 0.7)';
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(padL, my); ctx.lineTo(panelW - padR, my); ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.fillStyle = '#555';
        ctx.font = '9px Courier New';
        ctx.fillText('↑ children · → freq', 3, panelH - 3);
    };

    /**
     * Draw the warmup overlay (replaces histogram while warming up).
     *
     * @param {string} canvasId - id of the <canvas> element to draw on.
     * @param {string} panelId  - id of the container panel.
     * @param {number} remainSec - seconds remaining in the warmup period.
     */
    RadiationHistogram.prototype.drawWarmup = function (canvasId, panelId, remainSec) {
        var panel  = document.getElementById(panelId);
        var canvas = document.getElementById(canvasId);
        if (!panel || !canvas) return;

        var labelH = 0;
        panel.querySelectorAll('.histogram-label, .histogram-sub, .histogram-status')
            .forEach(function (el) { labelH += el.offsetHeight; });

        var w = panel.offsetWidth;
        var h = panel.offsetHeight - labelH;
        if (w < 10 || h < 10) return;
        canvas.width = w; canvas.height = h;

        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,177,78,0.85)';
        ctx.font = '13px Courier New'; ctx.textAlign = 'center';
        ctx.fillText('BLACKBODY', w / 2, h / 2 - 18);
        ctx.fillText('WARMING UP', w / 2, h / 2 - 2);
        ctx.font = 'bold 22px Courier New';
        ctx.fillText(remainSec + 's', w / 2, h / 2 + 28);
        ctx.textAlign = 'left';
    };

    // ── Export ───────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RadiationHistogram: RadiationHistogram };
    } else {
        window.RadiationHistogram = RadiationHistogram;
    }

})();
