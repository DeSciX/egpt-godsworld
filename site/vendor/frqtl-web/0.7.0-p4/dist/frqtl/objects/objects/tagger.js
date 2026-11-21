/* Copyright 2023-2026 by Essam Abadir */

/**
 * Tagger — the MARK part: put a user string on a frame, consistently.
 *
 * ── A Tagger IS … (the datasheet line; the minimal sim §3) ───────────────────────
 *
 * A Tagger is the op-program op `{ set: '0.data.<key>', to: StrLit(<value>) }` — ONE
 * write of a user string into a frame's engine-opaque `string_map` — offered on the
 * two lanes a frame can be reached from, plus the matching read:
 *
 *   IN-TICK  (`tagOps`)  — the op appended to a collision op-program; the engine runs
 *                          it on every colliding frame (canonical bench LO7 MARK).
 *   HOST     (`stamp`)   — the SAME write between ticks, as a get→merge→set through
 *                          `universe.getFrameProperty(qid,'data')` /
 *                          `setFrameProperty(qid,'data',bag)`, for a frame that
 *                          nothing collided with (no LO, no wall — see §Reuse).
 *   READ     (`readTags`)— the tags back off a collected `FrameData`, without the
 *                          caller ever naming `fd.data.string_map`.
 *
 * That is the whole part: three lanes, ONE key/value vocabulary, ZERO physics.
 *
 * ── Layer 1: API contract ───────────────────────────────────────────────────
 *
 *   Tagger.tagOps(tags)                  → Array<op>   (append to an op-program's ops)
 *   Tagger.stamp(universe, qid, tags)    → number      (keys written; host lane)
 *   Tagger.readTags(frameData)           → {k:v}       ({} when untagged)
 *   Tagger.readTag(frameData[, key])     → string|null (key defaults to MARK_KEY)
 *   Tagger.normalizeTags(tags)           → {k:v}       (the shared coercion; exported
 *                                                       so a consumer never re-derives it)
 *   Tagger.MARK_KEY = 'detector_name'                  (the canonical provenance key)
 *
 * `tags` is either a plain object `{ key: value, … }` or a bare string (shorthand for
 * `{ [MARK_KEY]: value }` — the "just mark it with this name" case that MARK/DETECT and
 * the wall `mark` hook have always meant). Values are coerced with `String()`; `''` IS a
 * valid tag value (the wall `mark` hook with no `markTag` stamps the empty string and has
 * always done so — dropping it here would move a compiled program). `null`/`undefined`
 * values are skipped. A non-string / empty key throws (FAIL-LOUD, never a silent no-op).
 *
 * Key order is the object's own insertion order, so `tagOps` is deterministic and a
 * caller's program bytes are stable.
 *
 * ── The knobs ───────────────────────────────────────────────────────────────
 *
 *   key    — any string. It is carried VERBATIM by the engine, which interprets
 *            nothing (`lib/shim/frame-data` §string_map). A dotted key survives whole
 *            (`render.color` is a tag like any other — the wall `recolor` hook is a
 *            Tagger whose key happens to be one the renderer reads).
 *   value  — any string. This is USER data; there is no enum, no registry, no engine
 *            meaning. Two different LOs stamping the same key is a last-write-wins
 *            overwrite inside one tick, in op order.
 *
 * ── Layer 2: physics behavior — measured constants ──────────────────────────
 *
 * ZERO physics (SU1). A tag write costs **0 RNG draws** (`StrLit` is a compile-time
 * constant; `actionCompiler`'s own RNG-cost ledger already lists MARK at 0), touches no
 * position, velocity, mass, capacity, wavelength or `is_alive`, and the engine
 * interprets no `string_map` key. Measured baseline: the canonical bench holds
 * **28/28** across this part landing, with **LO7 MARK + COUNT** the golden that covers
 * it directly (`count=105, mark="probeA"` — the stamped string rides the collected
 * FrameData and is read between ticks). A Tagger cannot move a golden; if one moves,
 * physics leaked into the tag and that is a defect in this file.
 *
 * ── Reuse: a Tagger is NOT a wall part ──────────────────────────────────────
 *
 * The in-tick lane needs a collision, so it rides whatever object already hooks
 * collisions (today: a `Wall`/`LargeObject` op-program — `Wall{hooks:['mark']}` IS a
 * Tagger). The HOST lane needs nothing at all: a bare `experimentTickFunctions` entry
 * that notices something about the world and stamps the frames it noticed is a complete
 * detector with no wall, no rect and no collision — e.g. a thermostat-style probe that
 * marks every frame it counts while the world is above its setpoint. See
 * `lib/frqtl/objects/test/tagger.test.mjs` §"non-wall reuse".
 *
 * ── What this file does NOT own ─────────────────────────────────────────────
 *
 * The BUBBLE SCHEMA (`SECTION_KEYS`, `normalizeDataBubble`) is owned by
 * `lib/shim/frame-data`; this file FERRIES it and never re-lists a section. The AST node
 * kinds are owned by `lib/shim/expr/ast-schema.js`; this file consumes `StrLit` +
 * `HANDLE_FRAME` and never re-derives an op shape. Which render keys are legal is owned
 * by `RENDER_INTENT_KEYS`; a Tagger carries any key, exactly as the engine does.
 */

import * as AstSchema from '../../../shim/expr/ast-schema.js';
import * as FrameDataSchema from '../../../shim/frame-data/index.js';



    /**
     * MARK_KEY — the canonical provenance key. This is the key MARK/DETECT and the wall
     * `mark` hook have always written, and the key `DetectorWall` reads for slit
     * provenance. Named ONCE here so no consumer spells the string again.
     */
    var MARK_KEY = 'detector_name';

    /**
     * normalizeTags(tags) — the ONE coercion both write lanes share, so the in-tick op
     * and the host stamp can never disagree about what "tagging with X" means.
     *
     * @param {Object|string} tags — `{key: value, …}` or a bare string (→ {MARK_KEY: str}).
     * @returns {Object} a fresh `{key: string}` bag (insertion order preserved).
     * @throws {TypeError} on a non-object/non-string input, or a non-string/empty key.
     */
    function normalizeTags(tags) {
        if (typeof tags === 'string') {
            var one = {};
            one[MARK_KEY] = tags;
            return one;
        }
        if (tags === null || typeof tags !== 'object' || Array.isArray(tags)) {
            throw new TypeError('[Tagger] tags must be a plain object {key: value} or a bare ' +
                'string (shorthand for {' + MARK_KEY + ': value}); got ' +
                (Array.isArray(tags) ? 'an array' : typeof tags) + '.');
        }
        var out = {};
        var keys = Object.keys(tags);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (typeof k !== 'string' || k.length === 0) {
                throw new TypeError('[Tagger] tag key must be a non-empty string; got ' +
                    JSON.stringify(k) + '.');
            }
            var v = tags[k];
            if (v === null || v === undefined) { continue; }   // skipped, never stamped as "null"
            out[k] = String(v);
        }
        return out;
    }

    /**
     * tagOps(tags) — the IN-TICK lane. Build the op-program ops that stamp `tags` onto the
     * COLLIDING frame (`HANDLE_FRAME`), for a caller to concat into its own `ops` array.
     *
     * This is the single authority for the tag-op SHAPE: `actionCompiler`'s MARK/DETECT
     * action, its v2 `mark` hook and its v2 `recolor` hook are all this function (the op
     * bytes are unchanged — the compiler ferries them, it does not re-spell them).
     *
     * @param {Object|string} tags
     * @returns {Array<{set:string, to:Object}>} — one op per key, in key order.
     */
    function tagOps(tags) {
        var ast = AstSchema;
        var bag = normalizeTags(tags);
        var ops = [];
        var keys = Object.keys(bag);
        for (var i = 0; i < keys.length; i++) {
            // `0.data.<key>` — the op-apply layer intercepts StrLit and routes it to the
            // frame's string_map write path (the dotted part of a key like 'render.color'
            // survives whole: strKey = prop.slice(5)).
            ops.push({ set: ast.HANDLE_FRAME + '.data.' + keys[i], to: ast.StrLit(bag[keys[i]]) });
        }
        return ops;
    }

    /**
     * stamp(universe, quantumId, tags) — the HOST lane. Tag a frame BETWEEN ticks, with
     * no collision, no LargeObject and no op-program: read the frame's current data bag,
     * merge the tags into its `string_map`, write the whole bag back.
     *
     * get→merge→set is deliberate (the render-intent stamp rule): the write
     * must PRESERVE the frame's `detection` section and any pre-existing string_map keys,
     * rather than relying on the engine's `set('data')` happening to merge.
     *
     * @param {Object} universe — an EGPTUniverse (get/setFrameProperty accessors).
     * @param {number} quantumId — the frame's QUANTUM ID (`FrameData.id` — NOT the
     *   `FrameId` handle `makeLeafFrame` returns; bridge with `getFrameQuantumId`).
     * @param {Object|string} tags
     * @returns {number} the number of keys written.
     * @throws {TypeError} on a universe without the accessors, or a bad tag bag.
     */
    function stamp(universe, quantumId, tags) {
        if (!universe || typeof universe.setFrameProperty !== 'function') {
            throw new TypeError('[Tagger.stamp] needs a universe with setFrameProperty ' +
                '(the host write lane). Got ' + (universe ? typeof universe : universe) + '.');
        }
        var bag = normalizeTags(tags);
        var keys = Object.keys(bag);
        if (keys.length === 0) { return 0; }

        var current = null;
        if (typeof universe.getFrameProperty === 'function') {
            current = universe.getFrameProperty(quantumId, 'data');
        }
        if (!current || typeof current !== 'object') { current = {}; }
        var sm = (current.string_map && typeof current.string_map === 'object')
            ? current.string_map : {};
        for (var i = 0; i < keys.length; i++) { sm[keys[i]] = bag[keys[i]]; }
        current.string_map = sm;
        universe.setFrameProperty(quantumId, 'data', current);
        return keys.length;
    }

    /**
     * readTags(frameData) — the READ lane. Pull every tag off a collected `FrameData`
     * (`tickData.objects[handle].frames[i]`, or `tickData.frameData[i]`) without the
     * caller naming `fd.data.string_map`.
     *
     * The bubble shape comes from its owner (`lib/shim/frame-data` `normalizeDataBubble`),
     * so a section change lands here for free and this file never re-lists SECTION_KEYS.
     *
     * @param {Object} frameData — a FrameData (or anything carrying `.data`).
     * @returns {Object} `{key: string}` — `{}` when the frame carries no tags.
     */
    function readTags(frameData) {
        if (!frameData) { return {}; }
        var bubble = FrameDataSchema.normalizeDataBubble(frameData.data);
        var sm = bubble.string_map;
        if (!sm || typeof sm !== 'object') { return {}; }
        var out = {};
        var keys = Object.keys(sm);
        for (var i = 0; i < keys.length; i++) {
            if (sm[keys[i]] !== null && sm[keys[i]] !== undefined) { out[keys[i]] = sm[keys[i]]; }
        }
        return out;
    }

    /**
     * readTag(frameData, key) — one tag off a collected FrameData.
     * @param {Object} frameData
     * @param {string} [key=MARK_KEY] — defaults to the canonical provenance key.
     * @returns {string|null} the tag value, or null when the frame is untagged.
     */
    function readTag(frameData, key) {
        var k = (key === undefined || key === null) ? MARK_KEY : key;
        var tags = readTags(frameData);
        return (tags[k] !== undefined) ? tags[k] : null;
    }

export { MARK_KEY, normalizeTags, tagOps, stamp, readTags, readTag };
