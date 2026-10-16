/* Copyright 2023-2025 by Essam Abadir */

/**
 * Charge — Shared charge enum for EGPT FRQTL VM.
 * Matches both JS engine and Rust/WASM engine.
 */

(function () {

    var Charge = Object.freeze({
        POSITIVE: 0,
        NEGATIVE: 1
    });

    /**
     * Normalize various input formats to the Charge enum values.
     *
     * Accepted inputs:
     *   - 0 / 1 (numeric)
     *   - 'POSITIVE' / 'NEGATIVE' (string enum)
     *   - 'positive' / 'negative' (lowercase)
     *   - '+' / '-'
     *   - true (POSITIVE) / false (NEGATIVE)
     *   - Charge.POSITIVE / Charge.NEGATIVE (passthrough)
     *
     * @param {*} c - Charge value in any supported format
     * @returns {number} Charge.POSITIVE (0) or Charge.NEGATIVE (1)
     */
    function mapCharge(c) {
        if (c === 0 || c === Charge.POSITIVE) return Charge.POSITIVE;
        if (c === 1 || c === Charge.NEGATIVE) return Charge.NEGATIVE;

        if (typeof c === 'string') {
            var upper = c.toUpperCase();
            if (upper === 'POSITIVE' || c === '+') return Charge.POSITIVE;
            if (upper === 'NEGATIVE' || c === '-') return Charge.NEGATIVE;
        }

        if (typeof c === 'boolean') {
            return c ? Charge.POSITIVE : Charge.NEGATIVE;
        }

        // Default to POSITIVE for unrecognized input
        return Charge.POSITIVE;
    }

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Charge, mapCharge };
    } else {
        window.Charge = Charge;
        window.mapCharge = mapCharge;
    }

})();
