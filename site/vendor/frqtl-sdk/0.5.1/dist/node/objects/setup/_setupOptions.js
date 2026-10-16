/* Copyright 2023-2026 by Essam Abadir */

/**
 * _setupOptions — the ONE unknown-option-key validator for every `objects/setup/`
 * factory.
 *
 * ## Why this exists
 *
 * Every setup factory reads its bag with the idiom
 * `options.X !== undefined ? options.X : default` — 56 occurrences across 16 files,
 * and NONE of them validated the key set. A misspelling therefore resolved to the
 * DEFAULT and ran silently: a blackbody factory handed `{ temperatuer: 5000 }` ran a
 * 300-quanta cavity, the badge stayed `ok`, and nothing anywhere said a word. This is the surface
 * the notebooks' own markdown invites a reader to edit, so the failure mode is "you got
 * a different experiment than the one you asked for, and you were never told."
 *
 * `EGPTUniverse.create()` and `EGPTUniverse.init()` already close exactly this hole one
 * layer down (`wasm-engine.js` `_assertNoUnknownKeys`). This is the same rule at the
 * factory layer, and it FAILS LOUD — no warn-path, no lenient mode, no opt-out flag.
 *
 * ## The contract, and who owns it
 *
 * A factory OWNS its option vocabulary, so the key list is declared in the factory's own
 * file (as `setupX.OPTIONS`) beside the code that reads those keys — never re-enumerated
 * here, and never copied from another module's schema. This module owns only the CHECK.
 *
 * Two consequences:
 *   1. A factory that ferries its bag onward composes its list from the downstream
 *      owner's EXPORTED list rather than retyping it — e.g. `setupTunnelPointExit`
 *      hands an augmented bag to `setupSphereEmitter3D`, so its legal set is
 *      `OWN.concat(setupSphereEmitter3D.OPTIONS)`. Copying the downstream keys by hand
 *      would be the schema-mirror bug this workstream exists to remove.
 *   2. `setup-factory-option-vocabulary.test.mjs` re-derives every factory's ACTUAL
 *      read-set by static trace and asserts the declared list covers it, so a key added
 *      to the code and forgotten in the list is a CI failure, not a caller's bad day.
 *
 * The message names every legal key, and — because the whole point is a typo — it leads
 * with the nearest legal key when one is within edit distance 2.
 */

(function () {

    /** Levenshtein, capped: we only care about "is this within 2 edits". */
    function _editDistance(a, b) {
        if (Math.abs(a.length - b.length) > 2) return 99;
        var prev = [], cur = [], i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            cur[0] = i;
            for (j = 1; j <= b.length; j++) {
                cur[j] = Math.min(
                    prev[j] + 1,
                    cur[j - 1] + 1,
                    prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
                );
            }
            prev = cur.slice();
        }
        return prev[b.length];
    }

    /** Nearest legal key within 2 edits (case-insensitive), or null. */
    function _suggest(key, legalKeys) {
        var best = null, bestD = 3, lk = key.toLowerCase();
        for (var i = 0; i < legalKeys.length; i++) {
            var d = _editDistance(lk, String(legalKeys[i]).toLowerCase());
            if (d < bestD) { bestD = d; best = legalKeys[i]; }
        }
        return best;
    }

    /**
     * Throw unless every own key of `options` is declared in `legalKeys`.
     *
     * @param {string}   factoryName - e.g. 'setupDoubleSlit'. Named in the error.
     * @param {Object}   [options]   - the caller's bag. null/undefined is legal (no options).
     * @param {string[]} legalKeys   - the factory's OWN exported vocabulary (`setupX.OPTIONS`).
     * @returns {Object} the same `options` (or `{}`), so a factory can write
     *                   `options = assertSetupOptions('setupX', options, OPTIONS);`
     */
    function assertSetupOptions(factoryName, options, legalKeys) {
        if (options === undefined || options === null) return {};
        if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error(
                '[' + factoryName + '] options must be a plain object, got ' +
                (Array.isArray(options) ? 'an array' : typeof options) + '. ' +
                'Legal keys: ' + legalKeys.slice().sort().join(', ') + '.'
            );
        }
        var sorted = legalKeys.slice().sort();
        var keys = Object.keys(options);
        for (var i = 0; i < keys.length; i++) {
            if (legalKeys.indexOf(keys[i]) !== -1) continue;
            var hint = _suggest(keys[i], legalKeys);
            throw new Error(
                '[' + factoryName + '] unknown option \'' + keys[i] + '\'' +
                (hint ? ' — did you mean \'' + hint + '\'?' : '') +
                ' This factory reads NONE of the keys it does not declare, so an ' +
                'unrecognized one would have silently resolved to a default and run a ' +
                'DIFFERENT experiment than you asked for. Legal options: ' +
                sorted.join(', ') + '.'
            );
        }
        return options;
    }

    /**
     * requireWorldRect(where, rect) → `{ w, h, … }` — the world rect a factory builds in,
     * through the ONE normalizer (`ObjectSchema.worldRect`). A factory never supplies a size:
     * it hands `universe.universe_rect`, which the ONE construction authority set from the
     * co-init call. Absent or malformed THROWS naming the co-init — never a default.
     */
    function requireWorldRect(where, rect) {
        var schema = (typeof module !== 'undefined' && module.exports)
            ? require('../schema/index.js').ObjectSchema
            : window.ObjectSchema;
        if (!schema || typeof schema.worldRect !== 'function') {
            throw new Error('[' + where + '] ObjectSchema.worldRect is not loaded — load ' +
                'objects/schema/valueNormalizer.js + objects/schema/index.js (stack-boot.js roster).');
        }
        return schema.worldRect(rect, where);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { assertSetupOptions: assertSetupOptions, requireWorldRect: requireWorldRect };
    } else {
        window.assertSetupOptions = assertSetupOptions;
        window.requireWorldRect = requireWorldRect;
    }

})();
