/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render/heat-colormap — the ONE count→intensity colour ramp.
 *
 * Peer of `lib/shim/frame-data` (the data-bubble/render-intent contract) and
 * `lib/shim/rpc` (the call() primitive): named ES-module exports, imported BOTH
 *   - by the game layer (`lib/frqtl/parts/GraphingDetectorWall.js`'s heat
 *     painter), and
 *   - by a component above the shim (`lib/components/notebook-pane/realm-chart.js`).
 * Both arrows are legal; neither consumer owns the ramp.
 *
 * ── Why it lives here, and NOT in LightColor.js ──────────────────────────────
 *
 * `lib/frqtl/parts/LightColor.js` owns FREQUENCY→light-colour
 * semantics (ROYGBIV, derived from a leaf's fullness). A count→intensity heat
 * ramp is a different vocabulary entirely — it colours a STATISTIC (how many
 * hits landed in a bin), not a particle's frequency band. Housing it in
 * LightColor would be dishonest labelling; housing a private copy in each
 * consumer is the schema-mirror-drift anti-pattern (the tell: the in-scene
 * detector heatmap and the DOM topology chart, reading the SAME grid, drifting
 * to different colours).
 *
 * ── Layer 1: API contract ───────────────────────────────────────────────────
 *
 *   HEAT_STOPS      — the frozen [r,g,b] control points (deep blue → cyan →
 *                     green → yellow → red, a standard topographic ramp).
 *   heatColor(t)    — normalized intensity t (0..1, clamped) → an `rgb(r,g,b)`
 *                     CSS string (a canvas `fillStyle` / Chart.js colour).
 *   heatRgb(t)      — the same sample as an [r,g,b] triple (0-255 integers),
 *                     for a consumer that needs the channels (e.g. compositing
 *                     with its own alpha).
 *
 * ── Layer 2: physics behaviour ──────────────────────────────────────────────
 *
 * ZERO physics — this is an output-boundary presentation map over an
 * already-collected statistic. It never reads a frame, never draws from the
 * engine RNG, and cannot move a canonical-bench golden (SU1).
 */



/**
 * The topographic control points: deep blue → cyan → green → yellow → red.
 * Exported so a conformance/drift test can assert both consumers resolve the
 * SAME ramp instead of hand-copying five triples into a test file.
 */
var HEAT_STOPS = Object.freeze([
    Object.freeze([12, 24, 70]),
    Object.freeze([20, 130, 190]),
    Object.freeze([40, 190, 120]),
    Object.freeze([235, 210, 60]),
    Object.freeze([235, 70, 45])
]);

/**
 * Sample the ramp at normalized intensity `t`.
 * @param {number} t — 0..1 (clamped; a non-finite input samples the low end).
 * @returns {Array<number>} [r, g, b], each a 0-255 integer.
 */
function heatRgb(t) {
    var n = Number(t);
    if (!isFinite(n)) { n = 0; }
    var u = n < 0 ? 0 : (n > 1 ? 1 : n);
    var f = u * (HEAT_STOPS.length - 1);
    var i = Math.min(HEAT_STOPS.length - 2, Math.floor(f));
    var k = f - i;
    var a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
    return [
        Math.round(a[0] + (b[0] - a[0]) * k),
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k)
    ];
}

/**
 * Sample the ramp at normalized intensity `t` as a CSS colour string.
 * @param {number} t — 0..1 (clamped).
 * @returns {string} `rgb(r,g,b)`
 */
function heatColor(t) {
    var c = heatRgb(t);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    HEAT_STOPS,
    heatRgb,
    heatColor
};
