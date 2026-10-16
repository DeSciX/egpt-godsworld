/* Copyright 2023-2026 by Essam Abadir */

/**
 * @file CircuitProbe — non-intrusive density probe for circuit experiments.
 *
 * Calls `universe.queryRect()` each tick to count quanta in a rectangular
 * region without absorbing them.  Maintains a sliding-window history
 * (`windowSize` = 10 ticks) for `getFlowRate()` — the same metric the
 * experiment page compares against `PROBE_THRESHOLD` (default 20) to decide
 * HIGH vs LOW output.
 *
 * ## What you can drive
 *
 * | Parameter | Default | Observable effect |
 * |-----------|---------|-------------------|
 * | `size`  | (caller-set) | Width and height of the probe rectangle in pixels.  A larger probe region samples more wire cross-section; too large and it overlaps neighbouring channels. |
 * | `windowSize` | 10 | (set on the instance after construction) Sliding-window length.  Larger window smooths transient noise; smaller window responds faster to input changes. |
 *
 * A `CircuitProbe` registers a visual-only `LargeObject` marker (collision type
 * `NONE`) so it appears as a distinct region in the renderer layers panel.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

(function () {

    // ── Imports ─────────────────────────────────────────────────────────

    var LargeObject;

    if (typeof module !== 'undefined' && module.exports) {
        LargeObject = require('./LargeObject').LargeObject;
    } else {
        LargeObject = window.LargeObject;
    }

    // ── CircuitProbe ────────────────────────────────────────────────────

    /**
     * Non-intrusive density probe for circuit experiments.
     *
     * @param {Object} universe - Engine universe instance (JS or WASM).
     * @param {number} x - Probe center X (pixels).
     * @param {number} y - Probe center Y (pixels).
     * @param {number} size - Probe region width and height (pixels).  Should
     *   match or be slightly smaller than the wire channel it monitors.
     * @param {string} [name='probe'] - Probe identifier; used for the visual
     *   marker label and in `getCircuitState()` result keys.
     */
    function CircuitProbe(universe, x, y, size, name) {
        name = name || 'probe';

        this.universe = universe;
        this._schemaKind = 'CircuitProbe';
        this.x = x;
        this.y = y;
        this.size = size;
        this.name = name;
        this.color = [0, 255, 0];
        this.history = [];
        this.windowSize = 10;

        this.rect = {
            left: x - size / 2,
            top: y - size / 2,
            w: size,
            h: size
        };

        // Register a visual-only LargeObject for rendering (no collision)
        this.marker = new LargeObject(
            universe,
            [this.rect.left, this.rect.top, this.rect.w, this.rect.h],
            'NONE',     // no collision
            [],         // no actions
            'probe_' + name,
            'closest'
        );

        this.marker._owner = this;   // THE ONE UP-LINK: the probe composed its marker LO
    }

    /**
     * Full teardown of what this probe composed: its marker LO leaves the world. Idempotent.
     */
    CircuitProbe.prototype.dispose = function () {
        this.marker.dispose();
    };

    /**
     * Query particle density in the probe region.
     * @returns {number} Particle count
     */
    CircuitProbe.prototype.queryDensity = function () {
        var count = this.universe.queryRect(
            this.rect.left, this.rect.top, this.rect.w, this.rect.h
        );
        this.history.push(count);
        if (this.history.length > this.windowSize) {
            this.history.shift();
        }
        return count;
    };

    /**
     * Get the full density history.
     * @returns {Array<number>}
     */
    CircuitProbe.prototype.getDensityHistory = function () {
        return this.history;
    };

    /**
     * Get the average flow rate over the sliding window.
     * @returns {number}
     */
    CircuitProbe.prototype.getFlowRate = function () {
        if (this.history.length === 0) return 0;
        var sum = 0;
        for (var i = 0; i < this.history.length; i++) {
            sum += this.history[i];
        }
        return sum / this.history.length;
    };

    /**
     * Get the most recent count.
     * @returns {number}
     */
    CircuitProbe.prototype.getLastCount = function () {
        return this.history.length > 0 ? this.history[this.history.length - 1] : 0;
    };

    /**
     * Returns true if average flow is at or above threshold.
     * @param {number} threshold
     * @returns {boolean}
     */
    CircuitProbe.prototype.isHigh = function (threshold) {
        threshold = (threshold !== undefined) ? threshold : 1;
        return this.getFlowRate() >= threshold;
    };

    // ── Export ───────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CircuitProbe };
    } else {
        window.CircuitProbe = CircuitProbe;
    }

})();
