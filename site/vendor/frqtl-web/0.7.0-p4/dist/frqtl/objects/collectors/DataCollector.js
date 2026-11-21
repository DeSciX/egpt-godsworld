/* Copyright 2023-2026 by Essam Abadir */

/**
 * DataCollector — Base class for tick-by-tick metric sampling.
 *
 * Subclasses override collectMetrics() to return experiment-specific
 * key/value pairs. The base class handles sample scheduling, time-series
 * accumulation, and result formatting.
 *
 * Works with both the JS engine (property getter for activeQuanta) and
 * the WASM engine (method call for activeQuanta).
 *
 * An ES module: `export { DataCollector }`.
 */

    // ── Helpers ──────────────────────────────────────────────────────────

    /**
     * Get active quanta count from a universe, handling both the JS engine
     * (property getter) and the WASM engine (method call) patterns.
     *
     * @param {Object} universe
     * @returns {number}
     */
    function getActiveQuanta(universe) {
        if (typeof universe.activeQuanta === 'function') {
            return universe.activeQuanta();
        }
        return universe.activeQuanta;
    }

    // ── DataCollector ────────────────────────────────────────────────────

    /**
     * Base collector for tick-by-tick metric sampling.
     *
     * @param {Object} [options]
     * @param {number} [options.sampleInterval=100] - Record a sample every N ticks
     * @param {Object} [options.params] - Experiment params to attach to results
     */
    function DataCollector(options) {
        options = options || {};
        this.sampleInterval = options.sampleInterval !== undefined ? options.sampleInterval : 100;
        this.params = options.params || {};
        this.timeSeries = [];
    }

    /**
     * Called every tick by the runner. Records a sample if
     * tick % sampleInterval === 0.
     *
     * @param {number} tick - Current tick number (1-based)
     * @param {Object} universe - Engine universe instance
     * @param {Object} setupResult - Object returned by the setup factory
     * @returns {Object|null} The sample object, or null if not a sample tick
     */
    DataCollector.prototype.sample = function (tick, universe, setupResult) {
        if (tick % this.sampleInterval !== 0) {
            return null;
        }

        var metrics = this.collectMetrics(universe, setupResult);
        var sample = { tick: tick };

        // Merge metrics into sample
        for (var key in metrics) {
            if (metrics.hasOwnProperty(key)) {
                sample[key] = metrics[key];
            }
        }

        this.timeSeries.push(sample);
        return sample;
    };

    /**
     * Override in subclasses to return experiment-specific metrics.
     * The base implementation records only activeQuanta.
     *
     * @param {Object} universe - Engine universe instance
     * @param {Object} setupResult - Object returned by the setup factory
     * @returns {Object} Flat object of metric key/value pairs
     */
    DataCollector.prototype.collectMetrics = function (universe, setupResult) {
        return {
            activeQuanta: getActiveQuanta(universe)
        };
    };

    /**
     * Return all collected data.
     *
     * @returns {{ params: Object, timeSeries: Array }}
     */
    DataCollector.prototype.getResults = function () {
        return {
            params: this.params,
            timeSeries: this.timeSeries.slice()
        };
    };

    /**
     * Reset state for the next seed run.
     */
    DataCollector.prototype.reset = function () {
        this.timeSeries = [];
    };

    // ── Static helper (re-exported for subclass convenience) ─────────────

    DataCollector.getActiveQuanta = getActiveQuanta;

    // ── Export ───────────────────────────────────────────────────────────

    export { DataCollector };

