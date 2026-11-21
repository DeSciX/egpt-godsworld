/* Copyright 2023-2026 by Essam Abadir */

/**
 * InterferenceAnalysis — Reusable statistical analysis functions for
 * interference pattern verification.
 *
 * Functions are pure (array in, structured result out) — no console.log.
 *
 * Claim: purely particle-level local rules produce wave-like statistical
 * clustering at the detector wall (interference patterns).
 *
 * An ES module: `export { InterferenceAnalysis }`.
 */

    // ── Basic statistics ─────────────────────────────────────────────────

    /**
     * Arithmetic mean of an array.
     * @param {number[]} arr
     * @returns {number}
     */
    function mean(arr) {
        if (!arr.length) return 0;
        return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    }

    /**
     * Population standard deviation of an array.
     * @param {number[]} arr
     * @returns {number}
     */
    function std(arr) {
        if (!arr.length) return 0;
        var m = mean(arr);
        return Math.sqrt(arr.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / arr.length);
    }

    // ── Smoothing ────────────────────────────────────────────────────────

    /**
     * Moving average with symmetric window.
     * @param {number[]} arr - Input array
     * @param {number} windowSize - Total window width (uses floor(w/2) on each side)
     * @returns {number[]} Smoothed array, same length as input
     */
    function smooth(arr, windowSize) {
        var half = Math.floor(windowSize / 2);
        var out = new Array(arr.length);
        for (var i = 0; i < arr.length; i++) {
            var sum = 0, n = 0;
            for (var j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
                sum += arr[j];
                n++;
            }
            out[i] = sum / n;
        }
        return out;
    }

    // ── Active range ─────────────────────────────────────────────────────

    /**
     * Find the first and last indices where arr[i] > threshold.
     * @param {number[]} arr
     * @param {number} threshold
     * @returns {{ start: number, end: number }} Both -1 if nothing above threshold
     */
    function findActiveRange(arr, threshold) {
        var start = -1, end = -1;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] > threshold) {
                if (start === -1) start = i;
                end = i;
            }
        }
        return { start: start, end: end };
    }

    // ── Cluster segmentation ─────────────────────────────────────────────

    /**
     * Segment a smoothed histogram into HIGH/LOW clusters and gaps using a
     * mean-density threshold. Returns cluster and gap descriptors with mass
     * drawn from the raw (un-smoothed) counts.
     *
     * @param {number[]} smoothed  - Smoothed histogram (full array, same length as raw)
     * @param {number[]} raw       - Raw histogram (full array)
     * @param {number}   rangeStart - Start index of the active range (from findActiveRange)
     * @returns {{ clusters: Array<{start,end,width,peakY,peakValue,mass}>,
     *             gaps:     Array<{start,end,width,mass}> }}
     *   All start/end indices are absolute (relative to the full array, not the active slice).
     */
    function segmentClusters(smoothed, raw, rangeStart) {
        // Derive the active region from rangeStart to end of provided smoothed slice
        // smoothed here is expected to be the active slice (smoothed.slice(rangeStart, rangeEnd+1))
        // or the full array — we use rangeStart as offset for absolute indexing
        var active = smoothed;
        var activeRaw = raw;
        var activeMean = mean(active);

        var labels = active.map(function (v) { return v >= activeMean ? 'H' : 'L'; });

        var clusters = [];
        var gaps = [];
        var inCluster = false;
        var clusterStart = 0;

        for (var i = 0; i < labels.length; i++) {
            if (labels[i] === 'H' && !inCluster) {
                clusterStart = i;
                inCluster = true;
            } else if (labels[i] === 'L' && inCluster) {
                var clusterSlice = active.slice(clusterStart, i);
                var peakVal = Math.max.apply(null, clusterSlice);
                var peakIdx = clusterStart + clusterSlice.indexOf(peakVal);
                var mass = 0;
                for (var j = clusterStart; j < i; j++) mass += activeRaw[j] || 0;
                clusters.push({
                    start:      clusterStart + rangeStart,
                    end:        i - 1 + rangeStart,
                    width:      i - clusterStart,
                    peakY:      peakIdx + rangeStart,
                    peakValue:  peakVal,
                    mass:       mass
                });
                inCluster = false;
            }
        }

        // Close final cluster if open
        if (inCluster) {
            var clusterSlice = active.slice(clusterStart);
            var peakVal = Math.max.apply(null, clusterSlice);
            var peakIdx = clusterStart + clusterSlice.indexOf(peakVal);
            var mass = 0;
            for (var j = clusterStart; j < active.length; j++) mass += activeRaw[j] || 0;
            clusters.push({
                start:      clusterStart + rangeStart,
                end:        active.length - 1 + rangeStart,
                width:      active.length - clusterStart,
                peakY:      peakIdx + rangeStart,
                peakValue:  peakVal,
                mass:       mass
            });
        }

        // Build gaps: LOW regions between consecutive clusters
        for (var i = 1; i < clusters.length; i++) {
            var gapStart = clusters[i - 1].end + 1;
            var gapEnd   = clusters[i].start - 1;
            var gapWidth = gapEnd - gapStart + 1;
            var gapMass  = 0;
            for (var j = gapStart; j <= gapEnd; j++) {
                gapMass += raw[j - rangeStart] || 0;
            }
            gaps.push({ start: gapStart, end: gapEnd, width: gapWidth, mass: gapMass });
        }

        return { clusters: clusters, gaps: gaps };
    }

    // ── Runs test ────────────────────────────────────────────────────────

    /**
     * Wald-Wolfowitz runs test for non-randomness on the active range
     * of a smoothed histogram. Labels bins as H (>= mean) or L (< mean)
     * and tests whether the run count differs from the random expectation.
     *
     * @param {number[]} smoothed  - Active-region slice of smoothed histogram
     * @param {number}   rangeStart - Start index (for bookkeeping only, not used in calc)
     * @param {number}   rangeEnd   - End index (for bookkeeping only)
     * @returns {{ runs: number, expected: number, z: number, significant: boolean,
     *             direction: string, nH: number, nL: number }}
     */
    function runsTest(smoothed, rangeStart, rangeEnd) {
        var activeMean = mean(smoothed);
        var labels = smoothed.map(function (v) { return v >= activeMean ? 'H' : 'L'; });

        var runs = 1;
        var nH = 0, nL = 0;
        for (var i = 0; i < labels.length; i++) {
            if (labels[i] === 'H') nH++; else nL++;
            if (i > 0 && labels[i] !== labels[i - 1]) runs++;
        }

        var N = nH + nL;
        var expectedRuns = (2 * nH * nL) / N + 1;
        var varianceRuns = (2 * nH * nL * (2 * nH * nL - N)) / (N * N * (N - 1));
        var stdRuns = Math.sqrt(Math.max(0, varianceRuns));
        var zRuns = stdRuns > 0 ? (runs - expectedRuns) / stdRuns : 0;

        var direction = '';
        if (Math.abs(zRuns) > 1.96) {
            direction = zRuns < 0 ? 'clustering' : 'alternating';
        }

        return {
            runs:        runs,
            expected:    expectedRuns,
            z:           zRuns,
            significant: Math.abs(zRuns) > 1.96,
            direction:   direction,
            nH:          nH,
            nL:          nL
        };
    }

    // ── Autocorrelation ──────────────────────────────────────────────────

    /**
     * Compute autocorrelation function (ACF) on the active-region slice and
     * identify significant positive peaks (suggesting periodicity).
     *
     * @param {number[]} smoothed   - Active-region slice of smoothed histogram
     * @param {number}   rangeStart - Start index (for bookkeeping)
     * @param {number}   rangeEnd   - End index (for bookkeeping)
     * @param {number}   [maxLag]   - Maximum lag to compute (default: min(floor(N/2), 200))
     * @returns {{ acf: Array<{lag,r}>, peaks: Array<{lag,r}>, dominantPeriod: number|null }}
     */
    function autocorrelation(smoothed, rangeStart, rangeEnd, maxLag) {
        var activeMean = mean(smoothed);
        var centered = smoothed.map(function (v) { return v - activeMean; });
        var variance = centered.reduce(function (s, v) { return s + v * v; }, 0);

        var N = smoothed.length;
        var cap = maxLag !== undefined ? maxLag : Math.min(Math.floor(N / 2), 200);
        var significanceThreshold = 2 / Math.sqrt(N);

        var acf = [];
        for (var lag = 1; lag <= cap; lag++) {
            var cov = 0;
            for (var i = 0; i < N - lag; i++) {
                cov += centered[i] * centered[i + lag];
            }
            acf.push({ lag: lag, r: variance > 0 ? cov / variance : 0 });
        }

        // Find significant positive local maxima
        var peaks = [];
        for (var i = 2; i < acf.length - 1; i++) {
            if (acf[i].r > acf[i - 1].r && acf[i].r > acf[i + 1].r &&
                acf[i].r > significanceThreshold) {
                peaks.push(acf[i]);
            }
        }

        // Sort by strength
        peaks = peaks.slice().sort(function (a, b) { return b.r - a.r; });

        var dominantPeriod = peaks.length > 0 ? peaks[0].lag : null;

        return {
            acf:             acf,
            peaks:           peaks,
            dominantPeriod:  dominantPeriod,
            significanceThreshold: significanceThreshold
        };
    }

    // ── Density contrast ─────────────────────────────────────────────────

    /**
     * Compute mean density (mass/width) for clusters and gaps, and their ratio.
     *
     * @param {Array<{mass,width}>} clusters
     * @param {Array<{mass,width}>} gaps
     * @returns {{ clusterDensity: number, gapDensity: number, ratio: number }}
     */
    function densityContrast(clusters, gaps) {
        var clusterDensities = clusters.map(function (c) { return c.width > 0 ? c.mass / c.width : 0; });
        var gapDensities     = gaps.map(function (g)     { return g.width > 0 ? g.mass / g.width : 0; });

        var clusterDensity = clusterDensities.length > 0 ? mean(clusterDensities) : 0;
        var gapDensity     = gapDensities.length     > 0 ? mean(gapDensities)     : 0;
        var ratio          = gapDensity > 0 ? clusterDensity / gapDensity : Infinity;

        return {
            clusterDensity: clusterDensity,
            gapDensity:     gapDensity,
            ratio:          ratio
        };
    }

    // ── Driver ───────────────────────────────────────────────────────────

    /**
     * Run all interference analyses on a raw histogram and return a complete
     * structured result.
     *
     * @param {number[]} rawCounts  - Per-pixel (or per-bin) raw hit counts
     * @param {number}   [smoothWindow=16] - Smoothing window (default uses max(5, floor(wavelength/4))
     *                                       caller should compute and pass in)
     * @returns {Object} Full analysis result with clusters, gaps, runsTest,
     *                   autocorrelation, densityContrast, evidence, passCount
     */
    function analyzeHistogram(rawCounts, smoothWindow) {
        var window = smoothWindow !== undefined ? smoothWindow : 16;

        // Smooth
        var smoothed = smooth(rawCounts, window);

        // Active range (bins with any smoothed signal)
        var range = findActiveRange(smoothed, 0.5);
        if (range.start === -1) {
            // No data
            return {
                range:          range,
                clusters:       [],
                gaps:           [],
                runsTest:       { runs: 0, expected: 0, z: 0, significant: false, direction: '', nH: 0, nL: 0 },
                autocorrelation: { acf: [], peaks: [], dominantPeriod: null, significanceThreshold: 0 },
                densityContrast: { clusterDensity: 0, gapDensity: 0, ratio: 0 },
                evidence:       [],
                passCount:      0,
                smoothed:       smoothed,
                smoothWindow:   window
            };
        }

        // Extract active slices
        var activeSmoothed = smoothed.slice(range.start, range.end + 1);
        var activeRaw      = rawCounts.slice(range.start, range.end + 1);

        // Run analyses
        var segResult   = segmentClusters(activeSmoothed, activeRaw, range.start);
        var runsResult  = runsTest(activeSmoothed, range.start, range.end);
        var acfResult   = autocorrelation(activeSmoothed, range.start, range.end);
        var contrastResult = densityContrast(segResult.clusters, segResult.gaps);

        // Build 4-test evidence array
        var evidence = [];

        if (segResult.clusters.length >= 3) {
            evidence.push({ test: 'Cluster count', result: 'PASS',
                detail: segResult.clusters.length + ' distinct density clusters' });
        } else {
            evidence.push({ test: 'Cluster count', result: 'FAIL',
                detail: 'Only ' + segResult.clusters.length + ' clusters (need >= 3)' });
        }

        if (runsResult.significant) {
            evidence.push({ test: 'Runs test', result: 'PASS',
                detail: 'Non-random clustering (z=' + runsResult.z.toFixed(2) + ')' });
        } else {
            evidence.push({ test: 'Runs test', result: 'FAIL',
                detail: 'Pattern indistinguishable from random (z=' + runsResult.z.toFixed(2) + ')' });
        }

        if (contrastResult.ratio > 1.5) {
            evidence.push({ test: 'Density contrast', result: 'PASS',
                detail: contrastResult.ratio.toFixed(2) + 'x cluster/gap density ratio' });
        } else {
            evidence.push({ test: 'Density contrast', result: 'FAIL',
                detail: 'Weak contrast (' + contrastResult.ratio.toFixed(2) + 'x, need >1.5)' });
        }

        if (acfResult.peaks.length > 0) {
            evidence.push({ test: 'Autocorrelation', result: 'PASS',
                detail: 'Periodic component at lag=' + acfResult.peaks[0].lag + 'px (r=' + acfResult.peaks[0].r.toFixed(3) + ')' });
        } else {
            evidence.push({ test: 'Autocorrelation', result: 'FAIL',
                detail: 'No significant periodic component' });
        }

        var passCount = evidence.filter(function (e) { return e.result === 'PASS'; }).length;

        return {
            range:           range,
            clusters:        segResult.clusters,
            gaps:            segResult.gaps,
            runsTest:        runsResult,
            autocorrelation: acfResult,
            densityContrast: contrastResult,
            evidence:        evidence,
            passCount:       passCount,
            smoothed:        smoothed,
            smoothWindow:    window
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    var InterferenceAnalysis = {
        smooth:          smooth,
        findActiveRange: findActiveRange,
        mean:            mean,
        std:             std,
        segmentClusters: segmentClusters,
        runsTest:        runsTest,
        autocorrelation: autocorrelation,
        densityContrast: densityContrast,
        analyzeHistogram: analyzeHistogram
    };

    export { InterferenceAnalysis };

