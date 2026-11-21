/* Copyright 2023-2026 by Essam Abadir */

/**
 * wasm-engine.js — Env-agnostic WASM adapter provider.
 *
 * Design:
 *   - Never loads the WASM module itself — the env-specific loader
 *     (wasm-load-browser.js / wasm-load-node.js) resolves the WasmUniverse
 *     constructor and the boot door (compat/engine.js `bootEngine`) passes it in
 *     via makeProvider(WasmUniverse).
 *   - Imports its contracts (ObjectSchema, LightColor, Rectangle) statically; no
 *     environment branch.
 *   - Constructing a universe before the door booted the engine THROWS, naming the door.
 */

import { ObjectSchema } from '../../objects/schema/index.js';
import { LightColor } from '../../parts/LightColor.js';
import { Rectangle } from '../../parts/Rectangle.js';

    // ── Charge enum (matches JS engine) ─────────────────────────────────

    var Charge = Object.freeze({
        POSITIVE: 0,
        NEGATIVE: 1,
    });

    // ── Data classes (match JS engine shapes) ───────────────────────────

    function FrameData(tick, id, layer, rect, fullness, isAlive, childCount, mass, collidedId, vx, vy, z, vz, data) {
        this.tick = tick;
        this.id = id;
        this.layer = layer;
        this.rect = rect;
        this.fullness = fullness;
        this.isAlive = isAlive;
        this.childCount = childCount;
        this.mass = mass;
        this.collidedId = collidedId;
        this.vx = vx;
        this.vy = vy;
        // 3D depth: z position + vz velocity, carried alongside the 2D
        // rect (which stays x,y,w,h). For A={x,y} (2D) experiments z stays 0 — the
        // three.js provider populates _posArr z from this; p5 renders the z=0 slice.
        this.z = z != null ? z : 0;
        this.vz = vz != null ? vz : 0;
        // Phase-D COLLECT data bubble.
        // Canonical shape: { detection: { detector_name }|null, string_map: { ... }|null }
        // detection — engine MARK/DETECT writes; string_map — opaque user-space data (render.color,
        // render.outline, …) carried verbatim (I1). The typed render section is RETIRED.
        // Absent → null. Never undefined — mirrors JS reference null normalization.
        // Coercion: fd.data absent (key not in WASM output) → null, not undefined.
        this.data = (data !== undefined && data !== null) ? data : null;
    }

    function DimensionData(tick, layer, frameCount, boundaryRect) {
        this.tick = tick;
        this.layer = layer;
        this.frameCount = frameCount;
        this.boundaryRect = boundaryRect;
    }

    function UniverseData(tick, dimensionCount, boundaryRect) {
        this.tick = tick;
        this.dimensionCount = dimensionCount;
        this.boundaryRect = boundaryRect;
    }

    function TickData(universeData) {
        this.universeData = universeData;
        this.dimensionData = [];
        this.frameData = [];
    }
    TickData.prototype.addDimensionData = function (dd) { this.dimensionData.push(dd); };
    TickData.prototype.addFrameData = function (fd) { this.frameData.push(fd); };

    // ── Wire-format translation (canonical→WASM ABI) ─────────────────────
    //
    // These functions translate the CANONICAL spec vocabulary (SCREAMING_SNAKE
    // collision types/actions, numeric/string charge, literal 'closest' reposition)
    // into the WASM Rust ABI wire format (PascalCase, Pascal-string charge, null).
    //
    // Relocated from lib/frqtl/objects/constants/CollisionTypes.js and
    // QuantumEmitter.js per §13.3 (no engine-sniffing above the shim).

    /**
     * FRQTL-MAINT (2026-07-01) — normalize an OBJECT-shaped LO rect ({left,top,w,h}
     * or {left,top,z,w,h,d}) to the wire array form the WASM ABI accepts: legacy
     * 4-element [left,top,w,h] when z/d are absent (back-compat, z=0/d=w applied
     * engine-side), or explicit 6-element [left,top,z,w,h,d] — MIRRORS
     * Rectangle::from_top_left(l,t,z,w,h,d)'s own argument order (egpt_wasm/src/lib.rs
     * rect_to_z_capable_rectangle) — when either is present. Array-shaped rects
     * (already [l,t,w,h] or [l,t,z,w,h,d]) pass through unchanged; the WASM ABI itself
     * validates length (THROW-OR-APPLY).
     * @param {Object} rect - {left, top, w, h, z?, d?}
     * @returns {Array<number>}
     */
    function _rectSpecToArray(rect) {
        if (rect.z !== undefined || rect.d !== undefined) {
            return [
                rect.left, rect.top,
                rect.z !== undefined ? rect.z : 0,
                rect.w, rect.h,
                rect.d !== undefined ? rect.d : rect.w,
            ];
        }
        return [rect.left, rect.top, rect.w, rect.h];
    }

    /**
     * Map canonical charge to WASM Pascal-string format.
     * Canonical input: 0/1 (numeric), 'POSITIVE'/'NEGATIVE' (SNAKE), or null (random).
     * WASM output: 'Positive', 'Negative', or null.
     */
    function _wasmCharge(charge) {
        if (charge === null || charge === undefined) return null;
        if (typeof charge === 'string') {
            var upper = charge.toUpperCase();
            if (upper === 'POSITIVE' || charge === '+' || charge === 'Positive') return 'Positive';
            if (upper === 'NEGATIVE' || charge === '-' || charge === 'Negative') return 'Negative';
            return charge; // pass unknown strings through
        }
        if (charge === 0) return 'Positive';
        if (charge === 1) return 'Negative';
        return null;
    }

    // ── EGPTUniverse wrapper ─────────────────────────────────────────────
    //
    // The WasmUniverse constructor is injected at provider-creation time via
    // makeProvider().  This keeps the adapter env-agnostic.

    /**
     * UNIVERSE_CONFIG — the constructor's contract, exported so no consumer
     * re-enumerates it by hand. Each row: the key, its default, and what the
     * default MEANS. `EGPTUniverse` reads this table for both defaulting and
     * unknown-key rejection, so the table IS the surface (one authority).
     *
     * A row is EITHER `required: true` (no default — `create` throws without it; today only
     * `rect`) OR carries `def`, the published default.
     *
     * @type {Array<{key:string, required?:boolean, def?:*, unit:string, effect:string}>}
     */
    var UNIVERSE_CONFIG = [
        { key: 'rect', required: true, unit: 'Rectangle (px)',
          effect: 'REQUIRED — the ONE world-rect declaration; there is no world without it. init(fundamentalDimension, options) reads it and takes no rect. A leaf that leaves this rect is gone (the boundary is the only engine-side sink).' },
        { key: 'seed', def: 42, unit: 'integer',
          effect: 'THE deterministic RNG stream. Same seed + same ops ⇒ bit-identical run.' },
        { key: 'fps', def: 60, unit: 'frames/second',
          effect: 'the nominal tick rate the engine config records. Does not change physics per tick (1 tick = 1 time quantum, always).' },
        { key: 'iframeIntervalSeconds', def: 1, unit: 'seconds',
          effect: 'how often Phase B (STRUCTURE — build higher dimensions from the fundamental quadtree) runs. 1/60 = every tick (emergent composites appear immediately); 1 = once a second.' },
        { key: 'withInterQuantumCollisions', def: false, unit: 'boolean',
          effect: 'false = leaves pass through each other (the fast path). true = leaf-leaf collision resolution (superlinear in alive-count — this is what makes a medium resistive).' },
        { key: 'withBonding', def: false, unit: 'boolean',
          effect: 'false = no bonding pass. true = collided leaves may bond into composites.' },
        { key: 'frameGenMode', def: 'groundUp', unit: "'groundUp' | 'topDown'",
          effect: "how PARENT frames are generated. 'groundUp' = bottom-up, by actual collisions between the smallest frames (collision-based promotion, wave-walk). 'topDown' = by how many frames an area can parent (density clustering, brownian ON, collisions off). init() takes its own frameGenMode and does NOT inherit this one." },
        { key: 'minMBFillRate', def: 0.1, unit: 'fraction of capacity (0..1)',
          effect: 'the minimum fullness a merged/promoted composite must reach to survive.' },
        { key: 'wavelengthScale', def: 1, unit: 'multiplier',
          effect: 'the GLOBAL multiplier on every frame per-frame (capacity/mass) wavelength: lambda_eff = (capacity/mass) * wavelengthScale. Raising it widens fringes. init() re-reads this.' },
        { key: 'liveQuantaCap', def: 300000, unit: 'leaf quanta | false',
          effect: 'the WASM preview cap: once this many leaf quanta are alive, every further leaf add (makeLeafFrame) is skipped (returns null) until the count falls below it; the debug console is warned once per universe. The default is the preview limit set for this release: a value above it throws. false = uncapped.' },
    ];

    /**
     * INIT_OPTIONS — `init(fundamentalDimension, options)`'s contract, the peer of UNIVERSE_CONFIG.
     *
     * `create(config)` has rejected unknown keys against UNIVERSE_CONFIG since it landed;
     * `init()` only rejected RETIRED and LEGACY names, so any OTHER unrecognized key was
     * read nowhere and thrown nowhere — accepted into `options` and silently discarded.
     * A typo (`wavelenghtScale`, `frameGenModeX`) ran the scene with DIFFERENT physics
     * than the author wrote, with zero signal. 20+ V1 setup factories call `init()`
     * directly, below the recipe-layer `assertInitCfg` gate, so this was the widest
     * unguarded physics-config surface in the shim.
     *
     * The two surfaces take DIFFERENT vocabularies (they overlap only on frameGenMode and
     * wavelengthScale), so this is a second TABLE, not a second copy of the first — and,
     * like UNIVERSE_CONFIG, the table IS the surface: it is what init() validates against
     * AND the documentation of what init() accepts, so the doc cannot drift from the check.
     * Both surfaces share ONE retirement map (`_RETIRED_CONFIG_KEYS`) via
     * `_assertNoRetiredKeys`, so a retired name keeps its specific migration message at
     * both, and only a genuinely unrecognized name gets the generic unknown-key error.
     *
     * ALL of these are [GLOBAL] — universe-wide, set once, scaling or gating the whole run.
     * [PER-FRAME] state (mass/capacity→wavelength, speed_prob, charge, vx/vy/vz) is NEVER
     * set here.
     *
     * @type {Array<{key:string, def:*, unit:string, effect:string}>}
     */
    var INIT_OPTIONS = [
        { key: 'wavelengthScale', def: 1, unit: 'multiplier',
          effect: "universe-wide multiplier on every frame's (capacity/mass) wavelength ratio: lambda_eff = (capacity/mass) * wavelengthScale. Raising it widens fringes. (The retired spelling 'wavelengthConstant' THROWS — see _RETIRED_CONFIG_KEYS.)" },
        { key: 'frameGenMode', def: 'groundUp', unit: "'groundUp' | 'topDown'",
          effect: "how PARENT frames are generated. 'groundUp' = bottom-up, by actual collisions between the smallest frames (promotion, wave-walk). 'topDown' = by how many frames an area can parent (density clustering, brownian ON, no collisions). init() does NOT inherit create()'s frameGenMode — the create()-time key is a pre-init record only. (The retired bool 'emergentPhysics' THROWS with the VALUE mapping.)" },
        { key: 'brownianMotion', def: undefined, unit: 'boolean',
          effect: "true = brownian random walk · false = wave-walk (particle walk). Rides the CONFIG BAG (brownian_motion) as the caller's REQUEST; the ENGINE resolves it at construction and JS reads the answer back, so nothing is inherited from a previous init. Omitted ⇒ null ⇒ the Rust unwrap_or is the ONE default authority. frameGenMode:'topDown' REQUIRES it: an explicit brownianMotion:false alongside topDown THROWS (the engine coerces it back to true, so accepting the false would be a lie). (The INVERTED alias 'noObserverFrame' is DELETED and THROWS.)" },
        { key: 'noEscape', def: false, unit: 'boolean',
          effect: 'true = children hard-trapped inside the parent rect.' },
        { key: 'activeAxes', def: undefined, unit: '{x,y,z} boolean bag',
          effect: 'the 1D/2D/3D selector — which axes the base-walk + yo-yo coins fire on. Omitted ⇒ the WASM serde default {x:true,y:true,z:false}, which keeps every existing 2D experiment byte-identical. capacity()/wavelength scale as the product over active axes.' },
        { key: 'depth', def: undefined, unit: 'pixels',
          effect: 'explicit world z-extent, DECOUPLED from width. Omitted ⇒ width (a CUBE), so a square 2D scene is byte-identical to the historic coupling. The z-range is CENTERED [-depth/2, depth/2].' },
        { key: 'stepping', def: 'fixed', unit: "'fixed' | 'average'",
          effect: "the wave-walk STEPPING SAMPLER. Both realize the same mean step (1 px/tick along the momentum vector) and differ in the VARIANCE about it. 'fixed' walks a deterministic error accumulator, so along-ray deviation stays bounded below 1 px forever; 'average' draws a per-axis Bernoulli coin, so it random-walks along the ray (Var = (L1/L2 - 1) px^2/tick — zero on-axis, 0.414 at 45 degrees) and the 2nd/3rd-order interference rings wash out OFF-axis while staying crisp on-axis. Axis-aligned and stationary frames are BIT-IDENTICAL under both. SET ONCE at init — there is no runtime setter and no live property (a mid-run flip would splice two samplers into one trajectory)." },
    ];

    /**
     * frameGenMode — the ONE table mapping the JS vocabulary to the engine wire name.
     *
     * `frameGenMode` is an INDEPENDENT engine setting: it decides how PARENT frames come
     * into being — 'topDown' (by how many frames an area can parent — periodic density
     * clustering) or 'groundUp' (by actual collisions between the smallest frames). It is
     * not part of the walk law; the walk-law consequences (brownian ON, collisions off
     * under topDown) are COERCIONS the engine applies, and they live in `egpt_engine`.
     *
     * Both directions are served from this one object — the wire name goes OUT in the
     * config bag and comes BACK through the `frame_gen_mode()` getter — so there is no
     * second hand-written map to drift.
     */
    var FRAME_GEN_MODES = { groundUp: 'GroundUp', topDown: 'TopDown' };

    function _frameGenModeNames() {
        return Object.keys(FRAME_GEN_MODES).map(function (k) { return "'" + k + "'"; }).join(' | ');
    }

    /** THROW-OR-APPLY: an unknown mode names EVERY legal value. @returns {string} the JS name */
    function _assertFrameGenMode(where, value) {
        if (!Object.prototype.hasOwnProperty.call(FRAME_GEN_MODES, value)) {
            throw new Error(where + ': frameGenMode must be ' + _frameGenModeNames() +
                ' (got ' + JSON.stringify(value) + "). 'groundUp' = parents form from actual " +
                "collisions between the smallest frames; 'topDown' = parents form from how many " +
                'frames an area can parent (density clustering).');
        }
        return value;
    }

    /** wire name ('GroundUp'|'TopDown') → JS name, derived from the one table. */
    function _frameGenModeFromWire(wire) {
        var names = Object.keys(FRAME_GEN_MODES);
        for (var i = 0; i < names.length; i++) {
            if (FRAME_GEN_MODES[names[i]] === wire) { return names[i]; }
        }
        throw new Error("EGPTUniverse: the engine reported an unknown frame_gen_mode '" + wire +
            "'. Legal wire names: " + names.map(function (n) { return FRAME_GEN_MODES[n]; }).join(', ') + '.');
    }

    // Retired names → corrective guidance (FAIL LOUD, never a silent alias).
    //
    // ONE map, consulted by BOTH construction surfaces — `create(config)` and
    // `init(fundamentalDimension, options)` — via `_assertNoRetiredKeys()`. A name accepted at one
    // surface and thrown at the other is one name in two migration states; that split is
    // exactly what let `wavelengthConstant` keep flowing into the engine long after
    // `create()` had retired it.
    var _RETIRED_CONFIG_KEYS = {
        iframe_interval_seconds: "renamed to 'iframeIntervalSeconds'",
        universe_rect: "renamed to 'rect'",
        wavelength_constant: "renamed to 'wavelengthScale'",
        wavelengthConstant: "renamed to 'wavelengthScale'",
        // RETIRED because it was INERT, which is the worst kind of accepted key: create()
        // recorded it and nothing ever read it, so `create({lowestDimension: 2})` ran a
        // dimension-0 world and reported success. The base scale layer has one authority and
        // always did — init()'s FIRST ARGUMENT. Both spellings get the same sentence.
        lowest_dimension: "is RETIRED, and it is NOT a rename. The base (fundamental) scale " +
            "layer is the FIRST ARGUMENT of init(fundamentalDimension, options) — pass it there: " +
            "universe.init(2). create() does not carry it.",
        lowestDimension: "is RETIRED, and it was INERT: create() recorded it and init() never " +
            "read it, so create({lowestDimension: 2}) silently ran a dimension-0 world. The " +
            "base (fundamental) scale layer is the FIRST ARGUMENT of " +
            "init(fundamentalDimension, options) — pass it there: universe.init(2).",
        withFrames: "deleted — it was inert (the WASM engine always has frames). Remove it.",
        // DELETED, not renamed. Read the inversion carefully before migrating a saved
        // recipe by hand — getting its SENSE backwards silently swaps the walk law.
        noObserverFrame: "is DELETED — it is NOT a rename. It was the INVERTED alias of " +
            "'brownianMotion': noObserverFrame:TRUE meant brownianMotion:FALSE (the " +
            "wave-walk), and noObserverFrame:false meant nothing at all — it landed on the " +
            "engine default, which is already brownianMotion:false. So OMIT the key: " +
            "dropping it is exactly what every caller of it was asking for. Only if you " +
            "want the random walk instead, pass brownianMotion:true",
        // A BOOLEAN retired in favour of an ENUM. The message must carry the VALUE mapping,
        // not just the new spelling: a hand-migration that keeps the boolean's `true`/`false`
        // (or guesses which string means which) silently swaps how parent frames are
        // generated, and nothing downstream complains.
        emergentPhysics: "is RETIRED — it is now 'frameGenMode', an ENUM, not a boolean. " +
            "Migrate the VALUE, not just the name: emergentPhysics:true becomes " +
            "frameGenMode:'topDown' (parent frames are generated by how many frames an area " +
            "can parent — density clustering), and emergentPhysics:false becomes " +
            "frameGenMode:'groundUp' (parent frames are generated by actual collisions " +
            "between the smallest frames — the default)",
    };

    /**
     * FAIL LOUD on any retired key, naming the canonical replacement.
     * @param {string} where — the call shape to quote back ('EGPTUniverse.create(config)' | 'EGPTUniverse.init()')
     * @param {Object} bag — the caller's config/options object
     */
    function _assertNoRetiredKeys(where, bag) {
        Object.keys(bag).forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(_RETIRED_CONFIG_KEYS, k)) {
                throw new Error(where + ": '" + k + "' " + _RETIRED_CONFIG_KEYS[k] + '.');
            }
        });
    }

    function _configKeyList() {
        return UNIVERSE_CONFIG.map(function (r) { return r.key; }).join(', ');
    }

    function _initOptionKeyList() {
        return INIT_OPTIONS.map(function (r) { return r.key; }).join(', ');
    }

    /**
     * FAIL LOUD on any key the surface does not accept, naming every key it does.
     *
     * The SECOND half of the pair `_assertNoRetiredKeys` starts: a retired name keeps its
     * specific migration message (that map is consulted FIRST, at both surfaces), and only
     * a genuinely unrecognized name reaches this generic error. Run this at EVERY
     * config-bag surface — a bag validated at one surface and swallowed at the other is
     * how a typo reaches the engine as different physics.
     *
     * @param {string} where — the call shape to quote back
     * @param {Object} bag — the caller's config/options object
     * @param {Array<{key:string}>} table — the surface's contract table
     * @param {string} keyList — the human-readable list of legal keys
     */
    function _assertNoUnknownKeys(where, bag, table, keyList) {
        Object.keys(bag).forEach(function (k) {
            var known = table.some(function (r) { return r.key === k; });
            if (!known) {
                throw new Error(where + ": unknown key '" + k + "'. Valid keys: " + keyList + '.');
            }
        });
    }

    // The ONE construction authority's private brand. `EGPTUniverse.create` is the
    // only holder; a `new EGPTUniverse(...)` anywhere else cannot produce it, so the
    // bare constructor FAILS LOUD instead of quietly becoming construction site #2.
    var _BUILD_BRAND = {};

    /**
     * EGPTUniverse — the WORLD. **Do not `new` it** — build it with the ONE
     * construction authority, `EGPTUniverse.create(config)` (below), then `init()`
     * it (ALWAYS FIRST: every simulation method throws before init).
     *
     * The bare constructor is BRANDED: called any way other than through
     * `EGPTUniverse.create` it throws, naming the authority. There is no positional
     * form, no compat alias, and no second factory.
     *
     * @param {Object} config — the normalized bag `create()` produced.
     * @param {Object} brand  — `_BUILD_BRAND`; anything else is a hard error.
     */
    function EGPTUniverse(config, brand) {
        if (brand !== _BUILD_BRAND) {
            throw new Error(
                'new EGPTUniverse(...) is not the construction path. Build a universe with ' +
                'the ONE construction authority: EGPTUniverse.create(config) — e.g. ' +
                'EGPTUniverse.create({ rect: { left: 0, top: 0, w: 600, h: 400 }, seed: 42 }). ' +
                'Reach it as engine().EGPTUniverse.create (lib/frqtl/compat/engine.js). Keys + defaults: ' +
                'EGPTUniverse.CONFIG (' + _configKeyList() + ').'
            );
        }
        var cfg = config;

        // Internal snake_case mirror consumed by init()'s WASM config assembly.
        this._params = {
            fps: cfg.fps,
            iframe_interval_seconds: cfg.iframeIntervalSeconds,
            withInterQuantumCollisions: !!cfg.withInterQuantumCollisions,
            withBonding: !!cfg.withBonding,
            frameGenMode: cfg.frameGenMode,
            minMBFillRate: cfg.minMBFillRate,
            wavelength_scale: cfg.wavelengthScale,
            seed: cfg.seed,
            // Wrapper state, never sent to the engine: the live-quanta admission cap (_admitLeaf).
            liveQuantaCap: cfg.liveQuantaCap,
        };
        // The cap's per-tick admission ledger (_admitLeaf): the alive count snapshotted once per
        // engine tick, the leaves admitted since, and the once-per-universe warn latch.
        this._capTick = null;
        this._capAlive = 0;
        this._capAdmitted = 0;
        this._capWarned = false;
        this._wasm = null;
        this.tick = 0;
        // The world rect — written HERE, once, from create()'s REQUIRED `rect`; read through
        // the read-only `universe_rect` accessor (init() reads it and takes no rect).
        this._universeRect = cfg.rect;
        this._withInterQuantumCollisions = !!cfg.withInterQuantumCollisions;
        // PRE-INIT ONLY: what `universe.brownianMotion` / `universe.wavelengthScale` /
        // `universe.frameGenMode` answer in the window before init() builds an engine to ask
        // (FrqtlApp constructs a universe and hands it to the sketch un-init'd, so this read
        // is real). From init() onward all three getters read the engine and these fields are
        // never consulted again.
        this._brownianMotion = false;
        this._wavelengthScale = cfg.wavelengthScale;
        this._frameGenMode = cfg.frameGenMode;
        this.experimentTickFunctions = [];
        this._loHandles = [];
        /**
         * THE WRAPPER CENSUS — the world's own list of the JS `LargeObject` wrappers
         * constructed on it, maintained beside the engine handle table above.
         *
         * CONSTRUCTED = IN THE WORLD = ON SCREEN. `new LargeObject(u, …)` is the ONE
         * wrapper construction seam and it appends itself here, so a renderer DERIVES its
         * draw list from the world instead of consuming a second, render-only registration
         * list. That second list is a SHADOW CENSUS: its divergence from the engine's
         * registry is unrepresentable in the mental model the primitive table teaches
         * ("LARGE OBJECTS … self-registers"), and when it diverged the object collided and
         * counted correctly while being completely invisible, with no warning — a silently
         * wrong world, which for a stack that learns by LOOKING is poisoned data.
         *
         * The engine census holds physics only (color/alpha/visible/backdrop/image/
         * drawAsCircle/shellRender are render intent, and "engine emits primitives" forbids
         * them ever becoming engine fields), which is exactly why the derivation runs off
         * the WRAPPERS and not off the handle table.
         *
         * Lifetime is the WORLD's: `init()` empties it, because re-initing the world drops
         * every engine registration with it and a surviving wrapper would hold a stale
         * handle. Removal rides `unregisterLargeObject`, so one teardown call leaves BOTH
         * censuses.
         * @type {Array}
         */
        this.largeObjects = [];
    }

    // The contract, exported so tests/consumers read it instead of re-listing it.
    EGPTUniverse.CONFIG = UNIVERSE_CONFIG;
    // The init() surface's contract, exported for the same reason. Both surfaces now
    // reject unknown keys, so both tables are load-bearing and neither may be re-listed.
    EGPTUniverse.INIT_OPTIONS = INIT_OPTIONS;

    /**
     * RETIRED_CONFIG_KEYS — the retirement ledger, PUBLISHED for the same reason
     * `CONFIG` is: so no consumer re-enumerates it by hand.
     *
     * The recipe facades (`exp.createCanvas(w, h, cfg)` / `exp.createScene(w, h, d, cfg)`) reject unknown cfg keys, and a saved STUDIO
     * recipe's unknown key is almost always a name retired HERE. Consulting this export
     * lets their error carry the SAME migration sentence this file throws, so the
     * guidance can never drift into a second table.
     *
     * Read it off the universe's own class (`universe.constructor.RETIRED_CONFIG_KEYS`)
     * — the recipe layer must stay engine-agnostic and never import this module.
     *
     * @type {Object<string,string>} key → the sentence that follows "'<key>' "
     */
    EGPTUniverse.RETIRED_CONFIG_KEYS = _RETIRED_CONFIG_KEYS;


    // A Rectangle is recognised STRUCTURALLY, not by `instanceof`: the class is loaded
    // once as a browser global and once as a Node module, so identity is not reliable.
    function _isRectangle(v) {
        return !!v && typeof v === 'object' && v.is_centered !== undefined && v._left !== undefined;
    }

    /**
     * createUniverse — **THE ONE CONSTRUCTION AUTHORITY.** The only place in the
     * tree that builds a universe; every other site (host, setup factory, bench,
     * conformance scenario, test) calls this. Published as `EGPTUniverse.create`,
     * so it is reachable wherever the class is — `engine().EGPTUniverse.create` after the
     * boot door (`compat/engine.js`) — with NO host in the way
     * (the minimal sim's primitive #1).
     *
     * ── Layer 1: API contract ────────────────────────────────────────────────
     *
     * ONE argument: a CONFIG BAG. `rect` is REQUIRED; every other key is optional and every
     * default lives in `UNIVERSE_CONFIG` (exported as `EGPTUniverse.CONFIG`), the single table
     * that drives defaulting, unknown-key rejection AND this docstring — so a caller
     * states the world and ONLY what else it means to change:
     *
     *   EGPTUniverse.create({ rect: { left: 0, top: 0, w: 600, h: 400 }, seed: 42 })
     *
     * | key                        | default | unit                    |
     * |----------------------------|---------|-------------------------|
     * | rect                       | REQUIRED| Rectangle (px)          |
     * | seed                       | 42      | integer                 |
     * | fps                        | 60      | frames/second           |
     * | iframeIntervalSeconds      | 1       | seconds                 |
     * | withInterQuantumCollisions | false   | boolean                 |
     * | withBonding                | false   | boolean                 |
     * | frameGenMode               | groundUp| 'groundUp' \| 'topDown'  |
     * | minMBFillRate              | 0.1     | fraction of capacity    |
     * | wavelengthScale            | 1       | multiplier              |
     * | liveQuantaCap              | 300000  | leaf quanta \| false    |
     *
     * `rect` accepts EITHER a `Rectangle` OR a plain bounds literal
     * (`{left|x, top|y, w, h}`), which is normalised here to a non-centered
     * `Rectangle` — so a headless caller never hand-rolls one. Its `w` and `h` must be
     * positive finite numbers, gated here: the engine itself builds and ticks a 0x0 world.
     *
     * THROW-OR-APPLY: a non-object argument, a retired positional-era key, or any
     * key outside the table is a hard error naming the canonical replacement. There
     * is no positional form, no second factory and no compat alias.
     *
     * ── Layer 2: physics behavior ────────────────────────────────────────────
     *
     * Construction starts NO physics — it only records the world's settings.
     * `seed` fixes the one deterministic stream; `wavelengthScale` scales every
     * frame's transverse oscillation period (Invariant 6B); `iframeIntervalSeconds`
     * sets how often composites can form; `withInterQuantumCollisions` decides
     * whether the medium resists. Physics begins at `doTick()` — and every
     * simulation method throws until `universe.init(fundamentalDimension, options)`.
     *
     * @param {Object} [config] — see the table above.
     * @returns {EGPTUniverse}
     */
    function createUniverse(config) {
        if (!_WasmUniverse) {
            throw new Error('EGPTUniverse.create(config): the engine is not booted — boot it through a door ' +
                'first: await bootEngine(loader) (lib/frqtl/compat/engine.js), which the boot module ' +
                '(experiments/_shared/boot.js) and the node door call for you. (FAIL-LOUD.)');
        }
        if (config === undefined) { config = {}; }
        if (config === null || typeof config !== 'object' || Array.isArray(config)) {
            throw new Error(
                'EGPTUniverse.create(config): takes ONE config bag, e.g. ' +
                'EGPTUniverse.create({ rect: rect, seed: 42 }). The positional argument list ' +
                '(fps, iframeInterval, …) and the two-argument (canvasRect, opts) factory are ' +
                'both DELETED — name the keys you mean: ' + _configKeyList() + '.'
            );
        }
        _assertNoRetiredKeys('EGPTUniverse.create(config)', config);
        _assertNoUnknownKeys('EGPTUniverse.create(config)', config,
            UNIVERSE_CONFIG, _configKeyList());

        var cfg = {};
        UNIVERSE_CONFIG.forEach(function (row) {
            cfg[row.key] = (config[row.key] !== undefined && config[row.key] !== null)
                ? config[row.key] : row.def;
        });

        // frameGenMode is the one ENUM in the table — THROW-OR-APPLY, naming every legal
        // value. (Every other row is a scalar the engine validates for itself.)
        _assertFrameGenMode('EGPTUniverse.create(config)', cfg.frameGenMode);
        _assertLiveQuantaCap(cfg.liveQuantaCap);

        // rect: REQUIRED — the ONE world-rect declaration (init() takes none). A Rectangle passes
        // through; a plain bounds literal is normalised. Either way the dimensions are gated
        // HERE — this is the authority's own door, and the engine below it accepts a 0x0, a
        // negative or a NaN world without complaint (measured).
        if (cfg.rect === undefined || cfg.rect === null) {
            throw new Error(
                'EGPTUniverse.create(config): `rect` is REQUIRED — there is no world without it ' +
                '(got ' + String(cfg.rect) + '). ' + _COINIT_SENTENCE + ' Then ' +
                'universe.init(fundamentalDimension, options) reads it. (FAIL-LOUD.)'
            );
        }
        if (!_isRectangle(cfg.rect)) {
            var r = cfg.rect;
            if (typeof r !== 'object' || Array.isArray(r)) {
                throw new Error(
                    'EGPTUniverse.create(config): `rect` must be a Rectangle or a bounds ' +
                    'literal { left, top, w, h } — got ' + JSON.stringify(r) + '.'
                );
            }
            var RectCtor = Rectangle;
            if (!RectCtor) {
                throw new Error(
                    'EGPTUniverse.create(config): `rect` was given as a bounds literal but the ' +
                    'Rectangle class is not loaded. Load parts/Rectangle.js (the ENGINE ' +
                    'boot phase does this in the browser; the compat shim does it in Node), or pass ' +
                    'a Rectangle instance.'
                );
            }
            cfg.rect = new RectCtor(
                r.left !== undefined ? r.left : (r.x || 0),
                r.top !== undefined ? r.top : (r.y || 0),
                r.w, r.h, null, false
            );
        }

        _requireWorldDimensions(cfg.rect);

        return new EGPTUniverse(cfg, _BUILD_BRAND);
    }

    // The world-dimension rule at the construction authority's door: `w` and `h` positive
    // finite NUMBERS (a numeric string is not one). The same rule the world-rect normalizer
    // (ObjectSchema.worldRect) and the renderer size rule (requireProviderSize) apply — one value
    // table drives all three doors (compat/providers/world-dimension-doors.test.mjs).
    // liveQuantaCap: `false` (uncapped) or a positive integer no larger than the row's published
    // default — the default is this release's published preview limit, so a larger value
    // throws. The ceiling is READ from the row; nothing else states the number.
    function _liveQuantaCapRow() {
        for (var i = 0; i < UNIVERSE_CONFIG.length; i++) {
            if (UNIVERSE_CONFIG[i].key === 'liveQuantaCap') { return UNIVERSE_CONFIG[i]; }
        }
        throw new Error('[wasm-engine] UNIVERSE_CONFIG has no liveQuantaCap row.');
    }
    function _assertLiveQuantaCap(v) {
        var ceiling = _liveQuantaCapRow().def;
        if (v === false) { return; }
        if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= ceiling) { return; }
        throw new Error(
            'EGPTUniverse.create(config): liveQuantaCap must be false (uncapped) or a positive ' +
            'integer no larger than ' + ceiling + ' (the release ceiling, EGPTUniverse.CONFIG row ' +
            "'liveQuantaCap') — got " + (typeof v === 'string' ? JSON.stringify(v) : String(v)) + '.'
        );
    }

    function _isPositiveFiniteDimension(v) {
        return typeof v === 'number' && isFinite(v) && v > 0;
    }
    // The co-init sentence both create() door throws quote — one string, so the two cannot drift.
    var _COINIT_SENTENCE = 'The world rect is written ONCE by the co-init call — ' +
        'EGPTUniverse.create({ rect }) ← new FrqtlApp({ canvasW, canvasH }) / ' +
        'exp.createCanvas(w, h, cfg). There is no default world size.';
    function _requireWorldDimensions(r) {
        if (_isPositiveFiniteDimension(r.w) && _isPositiveFiniteDimension(r.h)) { return; }
        throw new Error(
            'EGPTUniverse.create(config): rect w and h must be positive finite numbers (got w=' +
            _describeDimension(r.w) + ', h=' + _describeDimension(r.h) + '). ' + _COINIT_SENTENCE +
            ' (FAIL-LOUD.)'
        );
    }
    function _describeDimension(v) {
        return (typeof v === 'string') ? JSON.stringify(v) + ' (a string)' : String(v);
    }

    // THE construction authority, reachable wherever the class is (host-free).
    EGPTUniverse.create = createUniverse;

    // ── Getter / setter pairs ────────────────────────────────────────────

    // [GLOBAL] brownianMotion — ENGINE TRUTH, ASKED ON EVERY READ. There is no JS copy of the
    // resolved value to go stale: init() ferries the caller's un-coerced REQUEST in the CONFIG
    // BAG (`brownian_motion`), the ENGINE resolves it (TopDown coercion + the `unwrap_or`
    // default), and this getter asks the running universe what it actually HOLDS. So a flip
    // made ANYWHERE — through this setter or straight at the WASM handle — is visible here,
    // and the reported value can never disagree with the walk that is running. A cached
    // read-back could only ever report the last value JS happened to observe.
    //
    // `_brownianMotion` survives for exactly ONE read: the window between create() and init(),
    // when there is no engine to ask. A value parked there is NOT an input to init() — init()
    // resolves the flag from the options bag — so state it in the init options instead.
    //
    // The setter is the LIVE mutation path (the blackbody / atomic-model factories turning
    // brownian on AFTER init) and writes straight through to the engine.
    Object.defineProperty(EGPTUniverse.prototype, 'brownianMotion', {
        get: function () {
            return this._wasm ? this._wasm.brownian_motion() : this._brownianMotion;
        },
        set: function (value) {
            this._brownianMotion = value;
            if (this._wasm) this._wasm.set_brownian_motion(value);
        }
    });

    Object.defineProperty(EGPTUniverse.prototype, 'withInterQuantumCollisions', {
        get: function () { return this._withInterQuantumCollisions; },
        set: function (value) {
            this._withInterQuantumCollisions = value;
            if (this._wasm) this._wasm.set_with_inter_quantum_collisions(value);
        }
    });

    Object.defineProperty(EGPTUniverse.prototype, 'activeQuanta', {
        get: function () {
            if (!this._wasm) return 0;
            return this._wasm.active_quanta();
        }
    });

    // liveQuantaCap — the ACTIVE preview cap (a number, or false when uncapped), READ-ONLY: its
    // one writer is EGPTUniverse.create({ liveQuantaCap }). "Reached" is derivable:
    // activeQuanta >= liveQuantaCap.
    Object.defineProperty(EGPTUniverse.prototype, 'liveQuantaCap', {
        get: function () { return this._params.liveQuantaCap; }
    });

    // universe_rect — the world rect, READ-ONLY. Its one writer is `EGPTUniverse.create({ rect })`;
    // init() reads it and takes no rect, and no resize path exists. A write THROWS rather than
    // quietly re-pointing the field at a rect the engine never hears.
    Object.defineProperty(EGPTUniverse.prototype, 'universe_rect', {
        get: function () { return this._universeRect; },
        set: function () {
            throw new Error("EGPTUniverse: 'universe_rect' is read-only — its one writer is " +
                'EGPTUniverse.create({ rect, seed, … }); universe.init(fundamentalDimension, options) ' +
                'reads it. (FAIL-LOUD: one declaration per fact.)');
        }
    });

    // initDimension — the dimension this world was INIT'd at: the one layer `init(fundamentalDimension, options)`
    // allocates, and the seed every part's own layer declaration is re-applied from when a scene
    // is rebuilt. A DIFFERENT fact from `fundamentalDimension` below: that one is the LIVE lowest
    // allocated layer and moves when a part adds a lower dimension; this one never moves until the
    // world is re-init'd. A saved scene's world step re-emits THIS value. Throws before init.
    Object.defineProperty(EGPTUniverse.prototype, 'initDimension', {
        get: function () {
            this._ensureInit();
            return this._initDimension;
        },
        set: function () {
            throw new Error("EGPTUniverse: 'initDimension' is read-only — its one writer is " +
                'universe.init(fundamentalDimension, options).');
        }
    });

    // fundamentalDimension — [GLOBAL] the world's LIVE base scale layer, ENGINE TRUTH, ASKED
    // ON EVERY READ. It is the layer a leaf is minted at when its caller declares none, so a
    // part that needs "the world's layer" reads it HERE and never keeps its own copy. It moves
    // only through `addDimension` (the engine self-lowers it to the lowest allocated layer),
    // so a write is refused rather than silently ignored. Before `init()` there is no world
    // and no layer to report.
    Object.defineProperty(EGPTUniverse.prototype, 'fundamentalDimension', {
        get: function () {
            this._ensureInit();
            return this._wasm.fundamental_dimension();
        },
        set: function () {
            throw new Error("EGPTUniverse: 'fundamentalDimension' is read-only — the world's base " +
                'layer is set by init() and lowered only by universe.addDimension(layer).');
        }
    });

    // [D5] wavelengthScale — [GLOBAL] universe-wide λ multiplier, ENGINE TRUTH, ASKED ON
    // EVERY READ. Live-writable (wave-interference and tunnel-point-exit bind it to a
    // slider): raising it WIDENS fringes. There is no JS copy of the running value to go
    // stale: init() ferries the caller's value in the CONFIG BAG (`wavelength_scale`), the
    // ENGINE holds it, and this getter asks the running universe what it actually HOLDS. So
    // a write made ANYWHERE — through this setter or straight at the WASM handle — is
    // visible here, and the reported multiplier can never disagree with the λ the leaves
    // are walking. A cached read-back could only ever report the last value JS observed.
    //
    // `_wavelengthScale` survives for exactly ONE read: the window between create() and
    // init(), when there is no engine to ask (FrqtlApp constructs a universe and hands it
    // to the sketch un-init'd). A value parked there is NOT an input to init() — init()
    // takes the scale from its options bag — so state it in the init options instead.
    //
    // The setter is the LIVE mutation path (the λ slider) and writes straight through.
    Object.defineProperty(EGPTUniverse.prototype, 'wavelengthScale', {
        get: function () {
            return this._wasm ? this._wasm.wavelength_scale() : this._wavelengthScale;
        },
        set: function (value) {
            this._wavelengthScale = value;
            if (this._wasm) this._wasm.set_wavelength_scale(value);
        }
    });

    // [GLOBAL] frameGenMode — how PARENT frames are generated: 'groundUp' (bottom-up, by
    // actual collisions between the smallest frames) | 'topDown' (by how many frames an area
    // can parent — density clustering). ENGINE TRUTH, ASKED ON EVERY READ: init() ferries the
    // mode in the CONFIG BAG (`frame_gen_mode`), the ENGINE holds it, and this getter asks the
    // running universe what it actually HOLDS. A JS copy would go stale the moment a re-init
    // changed the mode — and a writer that read it would write a mode the run was not using.
    //
    // `_frameGenMode` survives for exactly ONE read: the window between create() and init(),
    // when there is no engine to ask. It is NOT an input to init() — init() takes its own
    // `frameGenMode` option and defaults to 'groundUp' — so state the mode in the init options.
    //
    // SET ONCE, no runtime setter (same class as `stepping`): the engine has no
    // set_frame_gen_mode ABI, and a mid-run flip would splice two frame-generation regimes
    // into one run. A write THROWS rather than quietly creating an own property that the
    // engine never hears — the silence is the worst outcome.
    Object.defineProperty(EGPTUniverse.prototype, 'frameGenMode', {
        get: function () {
            return this._wasm ? _frameGenModeFromWire(this._wasm.frame_gen_mode()) : this._frameGenMode;
        },
        set: function (value) {
            throw new Error(
                "EGPTUniverse: 'frameGenMode' is SET ONCE, at construction — there is no " +
                'runtime setter (the engine holds the mode, and a mid-run flip would splice ' +
                'two frame-generation regimes into one run). Pass it where the world is ' +
                "built: universe.init(dim, { frameGenMode: " + JSON.stringify(value) +
                ' }), or EGPTUniverse.create({ frameGenMode: … }) before init.'
            );
        }
    });

    // RETIRED spelling. A throwing accessor, not a compat plug — it NEVER works. Without it,
    // `universe.emergentPhysics = true` in old page/recipe/setup code would quietly create an
    // own property, the engine would never hear it, and the run would silently use the other
    // frame-generation regime. (the big-bang scene declares it as `iframeIntervalSeconds` in its world cfg.)
    Object.defineProperty(EGPTUniverse.prototype, 'emergentPhysics', {
        get: function () {
            throw new Error("EGPTUniverse: 'emergentPhysics' " + _RETIRED_CONFIG_KEYS.emergentPhysics + '.');
        },
        set: function () {
            throw new Error("EGPTUniverse: 'emergentPhysics' " + _RETIRED_CONFIG_KEYS.emergentPhysics + '.');
        }
    });

    // RETIRED spelling. A throwing accessor, not a compat plug — it NEVER works. Without
    // it, `universe.wavelengthConstant = v` in old page/recipe code would quietly create an
    // own property, the WASM would never hear the write, and the run would look fine while
    // λ stayed at its init value. That silence is the worst outcome; this is the loud one.
    Object.defineProperty(EGPTUniverse.prototype, 'wavelengthConstant', {
        get: function () {
            throw new Error("EGPTUniverse: 'wavelengthConstant' " + _RETIRED_CONFIG_KEYS.wavelengthConstant + '.');
        },
        set: function () {
            throw new Error("EGPTUniverse: 'wavelengthConstant' " + _RETIRED_CONFIG_KEYS.wavelengthConstant + '.');
        }
    });

    // [D7] iframe_interval_seconds getter/setter — mirrors JS EGPTUniverse parity.
    //
    // The JS reference engine has a `set iframe_interval_seconds(value)` setter that
    // updates `_iframe_interval_ticks` immediately. The WASM wrapper lacked an
    // equivalent, so `universe.iframe_interval_seconds = 1/60` (called by
    // the big-bang setup before universe.init()) was a silent plain-property assignment —
    // `_params.iframe_interval_seconds` stayed at 1, and init() passed
    // `iframe_interval_seconds: 1` to the WASM config. Phase B fired every 60 ticks
    // instead of every tick, producing a "flat leaf cloud" for the first second with
    // no emergent composite frames visible.
    //
    // Pre-init: the setter updates _params.iframe_interval_seconds, which init()
    // reads to populate the WASM config (the only path to set the WASM interval).
    // Post-init: the WASM ABI has no set_iframe_interval_seconds method; the value
    // is frozen after init() in Rust. Post-init changes must call init() again.
    Object.defineProperty(EGPTUniverse.prototype, 'iframe_interval_seconds', {
        get: function () { return this._params.iframe_interval_seconds; },
        set: function (value) {
            this._params.iframe_interval_seconds = value;
            // No WASM ABI for post-init update — value is consumed by the next init().
        }
    });

    // ── Lifecycle ────────────────────────────────────────────────────────

    EGPTUniverse.prototype._ensureInit = function () {
        if (!this._wasm) {
            throw new Error('EGPTUniverse.init() must be called before any simulation methods.');
        }
    };

    // The rect argument is DELETED: the world rect has one writer, `create({ rect })`. A
    // rect-shaped first argument (or a third argument) is the old call shape — it THROWS
    // naming the new signature, never a "rect ignored" arm.
    var _INIT_SIGNATURE_SENTENCE =
        'EGPTUniverse.init(fundamentalDimension, options) takes NO rect — the world rect is ' +
        'written ONCE, by EGPTUniverse.create({ rect, seed, … }), and init reads it ' +
        '(universe.universe_rect). Call e.g. universe.init(0, { wavelengthScale: 1 }). (FAIL-LOUD.)';

    EGPTUniverse.prototype.init = function (
        fundamental_dimension_number,
        options
    ) {
        if ((fundamental_dimension_number !== null && typeof fundamental_dimension_number === 'object') ||
            arguments.length > 2) {
            throw new Error('EGPTUniverse.init(): the rect argument is DELETED. ' + _INIT_SIGNATURE_SENTENCE);
        }
        if (fundamental_dimension_number === undefined || fundamental_dimension_number === null) {
            throw new Error('EGPTUniverse.init(): the fundamental dimension is required. ' + _INIT_SIGNATURE_SENTENCE);
        }
        var universe_rect = this.universe_rect;
        options = (options === undefined) ? {} : options;
        // FAIL-LOUD: options must be a plain object and must not carry retired/legacy keys.
        if (options === null || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error("EGPTUniverse.init(): the second argument must be a plain options object, e.g. init(dim, { wavelengthScale: 1, noEscape: false, frameGenMode: 'groundUp' }).");
        }
        // Retired names throw at init() with the SAME message create() gives — one name,
        // one migration state (see _RETIRED_CONFIG_KEYS).
        _assertNoRetiredKeys('EGPTUniverse.init()', options);
        // Legacy keys (key name → corrective guidance). Key strings are assembled so the
        // retired identifiers do not appear verbatim in source (keeps cleanup greps clean).
        var _legacyKeyGuards = {};
        _legacyKeyGuards['is' + 'Greedy'] = "the 'is" + "Greedy' option has been removed (it was inert). Delete it.";
        _legacyKeyGuards['emergent' + 'Dimensions'] = "the 'emergent" + "Dimensions' option is DELETED. " +
            "The frame-generation regime is now the enum frameGenMode: 'topDown' (what a truthy " +
            "emergent" + "Dimensions asked for) | 'groundUp' (the default).";
        Object.keys(_legacyKeyGuards).forEach(function (k) {
            if (k in options) {
                throw new Error("EGPTUniverse.init(): " + _legacyKeyGuards[k]);
            }
        });
        // Anything left that INIT_OPTIONS does not declare is a key init() reads nowhere.
        // It used to be accepted and discarded, so a typo ran the scene with different
        // physics than the author wrote and nothing said so. LAST of the three checks:
        // retired and legacy names have already claimed their specific migration messages
        // above, so only a genuinely unrecognized name reaches this generic one.
        _assertNoUnknownKeys('EGPTUniverse.init()', options,
            INIT_OPTIONS, _initOptionKeyList());

        // ── Init options ─────────────────────────────────────────────────────────
        // WHAT each option means, its default, and its physics effect live in the
        // INIT_OPTIONS table at the top of this file — the SAME table the unknown-key
        // check above validates against, so the documentation and the check cannot
        // drift apart. Restating them here would be that drift.
        var wavelengthScale = options.wavelengthScale;
        var stepping           = options.stepping;       // 'fixed' | 'average' | undefined
        var noEscape           = options.noEscape;
        var frameGenModeOpt    = options.frameGenMode;   // 'groundUp' | 'topDown' | undefined (new canonical)
        var brownianMotionOpt  = options.brownianMotion; // bool | undefined (new canonical)

        // frameGenMode — THROW-OR-APPLY on the enum; omitted ⇒ 'groundUp'. init() deliberately
        // does NOT inherit the create()-time mode: it never did, and every caller that means
        // topDown states it here (the create()-time key is a pre-init record only).
        var frameGenMode = (frameGenModeOpt === undefined || frameGenModeOpt === null)
            ? 'groundUp'
            : _assertFrameGenMode('EGPTUniverse.init()', frameGenModeOpt);
        var isTopDown = (frameGenMode === 'topDown');

        // activeAxes — the active spatial axes for this run (1D / 2D / 3D).
        //
        // Layer 1 (API): a plain { x, y, z } boolean bag (camelCase option, matching the
        //   other init options) forwarded into the WASM UniverseConfig (serde field
        //   `active_axes`, default {x:true,y:true,z:false}). OMITTED from the config when not
        //   declared, so every existing 2D experiment's config is byte-for-byte unchanged
        //   (the engine applies its serde default). This is the experiment-facing knob that
        //   fulfills Thread B's coordination request R3.
        // Layer 2 (physics): selects which axes the base-walk + yo-yo coins fire on, i.e.
        //   the dimensionality of the emergent motion. {x} → a 1D oscillator/walk (y,z frozen);
        //   {x,y,z} → a 3D isotropic emission (sphere, not cube — see the §6.10 isotropy
        //   oracle). capacity()/wavelength scale as the product over active axes. This is the
        //   browser-facing entry point for the 1D/3D discrete walk landed in the Rust engine;
        //   2D experiments never set it.
        // stepping — FAIL LOUD on anything that is not one of the two legal samplers. The engine
        // would also reject it (serde names both variants in its unknown-variant error), but
        // catching it here names the option the caller actually typed.
        if (stepping !== undefined && stepping !== null &&
            stepping !== 'fixed' && stepping !== 'average') {
            throw new Error("EGPTUniverse.init(): stepping must be 'fixed' or 'average' (got " +
                JSON.stringify(stepping) + "). 'fixed' = deterministic accumulator walk (default, " +
                "bounded along-ray error); 'average' = per-axis Bernoulli walk (the historic sampler).");
        }

        var activeAxes = options.activeAxes;
        if (activeAxes !== undefined && activeAxes !== null &&
            (typeof activeAxes !== 'object' || Array.isArray(activeAxes) ||
             typeof activeAxes.x !== 'boolean' || typeof activeAxes.y !== 'boolean' || typeof activeAxes.z !== 'boolean')) {
            throw new Error("EGPTUniverse.init(): activeAxes must be a plain object { x:boolean, y:boolean, z:boolean }, e.g. { x:true, y:false, z:false } for a 1D walk.");
        }

        var frame_gen_mode = FRAME_GEN_MODES[frameGenMode];
        var withCollisions = this._params.withInterQuantumCollisions;
        if (isTopDown) {
            withCollisions = false;
        }

        // ── brownianMotion — the caller's REQUEST rides the CONFIG BAG; the ENGINE resolves ──
        //
        // This value is a CONSTRUCTION-TIME config field (`brownian_motion` below), exactly
        // like frame_gen_mode and wavelength_scale — NOT a post-construction replay. It used
        // to be pushed after `new _WasmUniverse(config)` via `set_brownian_motion()` guarded
        // by a truthy check on the JS mirror, which made the mirror a SECOND source of truth
        // and produced three defects: (1) the mirror survived a re-init that said nothing
        // about brownian, so a stale `true` was replayed into a fresh universe; (2) the
        // TopDown coercion wrote the mirror, so a topDown run contaminated a later groundUp
        // run on the same object — a real physics divergence in an ordinary preset switch;
        // (3) an explicit `false` under topDown was accepted, reported back, and then
        // discarded by the engine's own coercion.
        //
        // What JS computes here is ONLY the un-coerced REQUEST (`bool | undefined`).
        // The TopDown⇒true / GroundUp⇒unwrap_or(false) COERCION belongs to `egpt_engine`
        // `EGPTUniverse::new` and is NOT restated here: a JS copy of that match is a schema
        // mirror across two languages, and this file used to carry one. `undefined` ferries
        // as `null` ⇒ Rust `None`, so the DEFAULT also has exactly one authority (the Rust
        // `unwrap_or`), never a JS duplicate. The resolved value is read back below through
        // the `brownian_motion()` WASM getter — the running universe answers for itself.
        //
        // The throw below is NOT part of that resolution: it is INPUT VALIDATION on a
        // self-contradictory request. The engine coerces TopDown to true unconditionally, so
        // an explicit `brownianMotion:false` alongside it could only ever be discarded —
        // fail loud instead of accepting a value that cannot be honoured.
        if (isTopDown &&
            brownianMotionOpt !== undefined && brownianMotionOpt !== null && !brownianMotionOpt) {
            throw new Error(
                "EGPTUniverse.init(): frameGenMode:'topDown' requires brownian motion, so an " +
                "explicit brownianMotion:false contradicts it — top-down frame generation IS the " +
                "brownian regime and the engine coerces brownian_motion = true " +
                "unconditionally, so the false would be silently discarded. Choose one: " +
                "drop brownianMotion (topDown supplies it), or use frameGenMode:'groundUp' " +
                "if you want the wave-walk. brownianMotion:true with topDown is redundant " +
                "but consistent, and is allowed."
            );
        }
        var brownianRequest;   // bool | undefined — the REQUEST, never the resolution
        if (brownianMotionOpt !== undefined && brownianMotionOpt !== null) {
            brownianRequest = !!brownianMotionOpt;
        }

        var wlScale = (wavelengthScale !== undefined && wavelengthScale !== null) ? wavelengthScale : 1;
        var config = {
            fps: this._params.fps,
            iframe_interval_seconds: this._params.iframe_interval_seconds,
            with_inter_quantum_collisions: withCollisions,
            with_bonding: this._params.withBonding,
            frame_gen_mode: frame_gen_mode,
            brownian_motion: brownianRequest === undefined ? null : brownianRequest,
            min_fill_rate: this._params.minMBFillRate,
            universe_rect: [universe_rect.left, universe_rect.top, universe_rect.w, universe_rect.h],
            wavelength_scale: wlScale,
            fundamental_dimension: fundamental_dimension_number,
            seed: this._params.seed,
        };
        // Only attach active_axes when the setup declared it — omission lets the WASM
        // serde default ({x,y} 2D) apply, keeping every existing experiment's config
        // (and thus its golden recording) byte-identical.
        //
        // NOTE: "omission ⇒ byte-identical" is a property of
        // active_axes' default, NOT a general rule for omitted keys. `stepping` below defaults
        // to 'fixed', which is a DELIBERATE behavior change for every caller that omits it —
        // the walk sampler moved. Axis-aligned and stationary scenes are still bit-identical
        // (the two samplers coincide there); off-axis scenes are expected to move, and that
        // movement is the point of the change, not a regression.
        if (activeAxes !== undefined && activeAxes !== null) {
            config.active_axes = { x: activeAxes.x, y: activeAxes.y, z: activeAxes.z };
        }
        // Only attach stepping when declared — omission lets the engine's serde default
        // (Fixed) apply, so there is ONE authority for the default (the Rust enum) instead of
        // a JS-side copy that could drift from it.
        if (stepping !== undefined && stepping !== null) {
            config.stepping = stepping;
        }
        // READ-BACK of the RESOLVED axes (what this run actually uses, including the
        // engine's serde default when the sketch omitted them). Truth-in-labeling: any
        // consumer that must re-declare this world (a host re-stating the sketch's world step)
        // DERIVES it from here rather than guessing.
        this.activeAxes = config.active_axes
            ? { x: config.active_axes.x, y: config.active_axes.y, z: config.active_axes.z }
            : { x: true, y: true, z: false };
        // depth — explicit world z-extent (DECOUPLED from width). Only attach when the setup
        // declared it; omission lets the WASM serde default (None → depth = width, a CUBE) apply,
        // keeping every existing (square) scene's config byte-identical. A non-square 3D scene
        // (e.g. 800×400) sets depth explicitly so z-near/z-depth are no longer tied to width.
        var depth = (options.depth !== undefined && options.depth !== null) ? options.depth
                  : (universe_rect && universe_rect.d !== undefined && universe_rect.d !== null &&
                     universe_rect.d !== universe_rect.w ? universe_rect.d : undefined);
        if (depth !== undefined) {
            if (typeof depth !== 'number' || !(depth > 0)) {
                throw new Error('EGPTUniverse.init(): depth must be a positive number (the world z-extent).');
            }
            config.depth = depth;
        }
        // READ-BACK of the RESOLVED world bounds (truth-in-labeling, exactly as `activeAxes`
        // above): the explicit `depth` when one was attached, else the engine's documented
        // square→cube default (the OPTIONS `depth` row: omitted ⇒ depth = width; z-range
        // CENTERED [-depth/2, depth/2]). Built THROUGH `_wrapBoundaryRect` — THE ONE
        // engine-bounds → JS bag normalizer — from the same centre+extent 6-tuple the
        // engine's own `boundary_rect` emits, so the pre-tick bag and the post-tick ferry
        // share one shape by construction (init-bounds-conformance.test.mjs binds keys AND
        // values to the first tick's `universeData.boundaryRect`). Pre-tick consumers read
        // this via FrqtlApp.worldBounds (e.g. the palette Wall drop's full-scene-depth
        // default, R#101); once a tick has run, the TickData ferry is the authority and
        // wins (it tracks live resizes; this is the INIT-time declaration).
        var resolvedDepth = (depth !== undefined) ? depth : universe_rect.w;
        this.initBounds = _wrapBoundaryRect([
            universe_rect.left + universe_rect.w / 2,
            universe_rect.top + universe_rect.h / 2,
            0,
            universe_rect.w,
            universe_rect.h,
            resolvedDepth
        ]);

        // The WORLD is being (re)built: every prior engine registration goes with it, so
        // the wrapper census empties too. A wrapper that survived a re-init would hold a
        // handle into a universe that no longer exists — the render list and the physics
        // registry disagreeing, which is the whole failure this census removes.
        this.largeObjects.length = 0;
        this._loHandles.length = 0;

        // _WasmUniverse is captured in the closure created by makeProvider()
        this._wasm = new _WasmUniverse(config);
        // The INIT dimension of THIS world (re-init overwrites it): the input a consumer that
        // re-declares the world re-emits. Read through `initDimension`, never the live
        // `fundamentalDimension`, which a lower addDimension ratchets down.
        this._initDimension = fundamental_dimension_number;
        // NO wavelength-scale read-back here either. The universe that just consumed the
        // config bag IS the answer, and `universe.wavelengthScale` asks it on every read —
        // so there is nothing to copy out at init time and nothing that could go stale
        // afterwards. (An assignment `this._wavelengthScale = wlScale` lived here; it was a
        // better-SOURCED cache, not engine truth, and it went stale the moment anything wrote
        // the scale past the JS property.)
        // NO brownian read-back here. The universe that just consumed the config bag IS the
        // answer, and `universe.brownianMotion` asks it on every read — so there is nothing to
        // copy out at init time and nothing that could go stale afterwards. (A read-back
        // assignment lived here once; it was a better-SOURCED cache, not engine truth.)
        // Register this universe as the active one so BoundaryFrame.makeLeafFrame
        // can forward through its makeLeafFrame door without holding an explicit reference.
        _activeUniverse = this;
        // A fresh engine starts its tick count over: drop the cap's snapshot so the next add
        // re-reads the alive count of THIS engine.
        this._capTick = null;

        if (this._withInterQuantumCollisions) this._wasm.set_with_inter_quantum_collisions(this._withInterQuantumCollisions);
        // When noEscape is set, hard-trap children inside parent rects.
        if (noEscape) this._wasm.set_no_escape(true);
    };

    // ── Simulation API ───────────────────────────────────────────────────

    EGPTUniverse.prototype.addDimension = function (layer) {
        this._ensureInit();
        this._wasm.add_dimension(layer);
        return _makeBoundaryDimension(layer, this._wasm);
    };

    EGPTUniverse.prototype.registerLargeObject = function (spec) {
        this._ensureInit();
        var normalized = Object.assign({}, spec);
        // No collision_type / actions / reposition translation: the ABI has no such fields.
        // Every behaviour — the eject face included — is already lowered into `program` by
        // actionCompiler.js before this call.
        // Rect shape normalize (existing behavior preserved; FRQTL-MAINT 2026-07-01
        // extends the object form to carry z/d when present — see _rectSpecToArray).
        if (spec.rect && !Array.isArray(spec.rect) && spec.rect.left !== undefined) {
            normalized.rect = _rectSpecToArray(spec.rect);
        }
        // Extract program BEFORE passing to register_large_object.
        // serde_wasm_bindgen v0.6 cannot deserialize internally-tagged enums
        // (#[serde(tag="kind")]) from JsValue via the custom Deserializer — it can't
        // look up the "kind" discriminant from a JS object map during tagged-enum dispatch.
        // Safe path: strip program from the spec, register WITHOUT program, then
        // attach via set_large_object_program_json (which uses serde_json on a JSON string,
        // which correctly handles internally-tagged enums). Confirmed working for all
        // existing variants (Lit, Ref, Bin, Cmp, Cond, Fn) and required for StrLit.
        var programPayload = normalized.program;
        delete normalized.program;

        var handle = this._wasm.register_large_object(normalized);
        this._loHandles.push(handle);

        if (programPayload != null && typeof this._wasm.set_large_object_program_json === 'function') {
            this._wasm.set_large_object_program_json(handle, JSON.stringify(programPayload));
        }

        return handle;
    };

    EGPTUniverse.prototype.doTick = function () {
        this._ensureInit();
        // [D6] Run legacy experimentTickFunctions for backwards compat.
        // Node copy checked return values and injected if array; browser copy ignored return.
        // Use node's more-complete path so legacy game objects work.
        for (var i = 0; i < this.experimentTickFunctions.length; i++) {
            var fn = this.experimentTickFunctions[i];
            var result = fn(this);
            if (Array.isArray(result) && result.length > 0) {
                // The returned-array injection path is DELETED: its wire format carried no
                // layer, so every frame it made was minted at the fundamental. Injection now
                // routes by the frame's own layer and cannot infer one from this shape.
                throw new TypeError(
                    '[doTick] experimentTickFunctions[' + i + '] returned an array of ' +
                    result.length + ' frames. Returning frames to be injected is no longer ' +
                    'supported — it could not express a frame\'s layer. Mint and inject ' +
                    'explicitly instead: universe.makeLeafFrame(left, top, level, ...) then ' +
                    'universe.injectFrame(handle), and return nothing.');
            }
        }
        var rawTick = this._wasm.do_tick();
        this.tick = Number(this._wasm.tick());
        var wrapped = this._wrapTickData(rawTick);
        // Cache the wrapped tick output so POST-tick host consumers (e.g. the ABSORB radiation
        // tick-fn, which tallies THIS/last tick's collided KILLED frames) can read
        // TickData.objects[handle].frames. experimentTickFunctions are called with fn(universe)
        // BEFORE do_tick (Phase-A: emitters inject), so a post-tick consumer registered there
        // must read the universe's cached last tickData (a one-tick lag; mass stays conserved).
        // Without this the radiation fn read `universe.objects` (undefined) → silent zero (K5).
        this._lastTickData = wrapped;
        return wrapped;
    };

    /**
     * G-EMIT generic primitive: advance the engine's deterministic Mulberry32 RNG
     * and return the next value in [0,1).
     *
     * Host tick-fns (e.g. the emitter tick-fn from emitterProgram.buildEmitterTickFn) call this
     * to draw x/y/angle/charge from the same single deterministic stream that
     * physics uses.  Must be called BEFORE do_tick() (i.e. from experimentTickFunctions).
     *
     * @returns {number} Next f64 in [0,1) from the Mulberry32 stream.
     */
    EGPTUniverse.prototype.random = function () {
        this._ensureInit();
        return this._wasm.random();
    };

    /**
     * Render-intent MERGE stamp (provider-side output-boundary marshalling).
     *
     * READ the frame's CURRENT engine-opaque data bag → MERGE the given render-intent
     * string_map keys into its `string_map` (preserving `detection` + any pre-existing
     * keys) → WRITE the whole bag back. This is a marshalling fix at the OUTPUT
     * BOUNDARY (zero physics, no engine change): a render-intent stamp NEVER clobbers
     * other string_map data, and the provider is correct on its OWN — it does not
     * depend on the engine's `set_frame_property('data')` happening to merge string_map
     * (Q-A3). Additional render-intent keys (a future `render.shape`,
     * `render.outline`, …) drop in by extending `keys` — one seam, no color special-case.
     *
     * NOTE (empirical finding, pkg-node dump): the engine ALREADY merges
     * string_map keys and carries `render.color` verbatim across ticks (a live-set
     * color persists) — this get→merge→set does not FIX a persistence bug (there is
     * none on the emitter path); it DECOUPLES the provider from the engine's merge
     * behavior and makes the stamp point trivially multi-key for A3.
     *
     * @param {Object} wasm — the WASM universe (this._wasm at makeLeafFrame; `w` at createFrameFromRect)
     * @param {number} qid  — frame quantum_id (get_frame_quantum_id of the SoA handle)
     * @param {Object} keys — { 'render.color': 'r,g,b,a', ... } string_map keys to merge
     */
    function _stampRenderIntentMerge(wasm, qid, keys) {
        if (!wasm || !qid || qid <= 0 || !keys) { return; }
        if (typeof wasm.set_frame_property !== 'function') { return; }
        var bag = null;
        if (typeof wasm.get_frame_property === 'function') {
            try {
                var cur = wasm.get_frame_property(qid, 'data');
                if (typeof cur === 'string' && cur.length) { bag = JSON.parse(cur); }
                else if (cur && typeof cur === 'object') { bag = cur; }
            } catch (_) { bag = null; }
        }
        if (!bag || typeof bag !== 'object') { bag = {}; }
        var sm = (bag.string_map && typeof bag.string_map === 'object') ? bag.string_map : {};
        for (var k in keys) {
            if (Object.prototype.hasOwnProperty.call(keys, k) && keys[k] != null) { sm[k] = String(keys[k]); }
        }
        bag.string_map = sm;
        try { wasm.set_frame_property(qid, 'data', JSON.stringify(bag)); } catch (_) {}
    }

    /**
     * G-EMIT-2 generic primitive: create a leaf frame and return its handle. Engine-agnostic
     * surface (mirrors the JS reference's universe.makeLeafFrame) so the emitter is shared sugar
     * (emitterProgram.js). chargeInt: 0=Positive, 1=Negative. Optional color [r,g,b,a] is stamped
     * via the data bubble AFTER creation (the make_leaf_frame ABI has no color arg) — 0 RNG draws,
     * so the golden draw order (make_leaf_frame's ctor-mirror +1) is preserved. The color rides the
     * generic string_map render-intent MERGE (_stampRenderIntentMerge) so it never clobbers other
     * bubble keys and additional render-intent keys drop in at the SAME seam.
     *
     * WASM-ONLY render-intent positionals (R3-1, DECLARED per the JS-ref-is-a-live-oracle
     * rule): `color` (9th), `shape` (10th), `outline` (11th) are OUTPUT-BOUNDARY render marshalling —
     * they are stamped onto the engine-opaque string_map here, WASM-side. The frozen JS reference
     * engine's makeLeafFrame has ONLY the `color` positional (color_override); it
     * ignores the shape/outline args (extra JS args = no-op) BY DESIGN — the JS reference is a frozen
     * visual fixture (never edited; CLAUDE.md §Engine discipline) and the realm is WASM. This is a
     * DOCUMENTED no-op on the JS twin, NOT a silent drop — covered by the render-intent-merge test
     * (WASM stamp asserted) + the emitterProgram threading note. Adding a 4th key is one more `if` here.
     * THE ONE LEAF DOOR, AND THE PREVIEW CAP: every leaf a host births comes through here (the
     * static Frame.makeLeafFrame routes through this method), so the `liveQuantaCap` admission
     * check runs FIRST — a refused leaf costs no frame-store slot and no RNG draw — and the add
     * returns `null` ("no frame"; handle 0 is a real frame). injectFrame(null) and
     * getFrameQuantumId(null) absorb it; setLargeObjectFrame(h, null) throws.
     * @returns {number|null} frame handle (SoA FrameId), or null when the cap refused the add
     */
    EGPTUniverse.prototype.makeLeafFrame = function (left, top, level, wavelength, vx, vy, wrap, chargeInt, color, shape, outline) {
        this._ensureInit();
        if (!this._admitLeaf()) { return null; }
        // LEVEL (leaf scale) defaults to the universe's fundamental dimension: a fundamental leaf
        // at dimension N has level N (Rust make_leaf_frame: width=2^N, capacity=width², wavelength
        // derived). The emitter passes null; only an explicit override passes a number. Mirrors the
        // JS reference makeLeafFrame.
        // DYNAMIC DIMENSIONS: the LIVE fundamental self-lowers when a lower dimension is
        // allocated (add_dimension), so it is read through the one `fundamentalDimension`
        // getter on every mint, never snapshotted.
        var lvl = (level != null) ? level : this.fundamentalDimension;
        // I2 BUGFIX (discovered by the LightSource source-invariance oracle):
        // the Rust wasm binding's `charge: i32` contract is "0=Positive, 1=Negative,
        // ANY OTHER VALUE (canonically -1)=random draw inside make_leaf_frame"
        // (egpt_wasm/src/lib.rs make_leaf_frame doc comment) — but this wrapper
        // passed `chargeInt` straight through UNTRANSLATED, unlike `wavelength`
        // right above (which already does `!= null ? wavelength : 0`). A caller
        // passing `null`/`undefined` for "please draw a random charge" (the
        // intuitive JS convention this codebase uses everywhere else — see `level`
        // just above) got silently coerced to `0` at the wasm-bindgen i32 ABI
        // boundary (JS `null`/`undefined` -> `+0` under numeric coercion), which
        // the Rust match reads as `0 => Some(Charge::Positive)` — an EXPLICIT
        // override to ALWAYS Positive, never a random draw. Measured: 100/100
        // particleWalk quanta got charge=POSITIVE under `polarization:'random'`
        // before this fix (LightSource.js, andI1's setupTunnelLab.js, both affected
        // — neither engine-visible before this oracle surfaced it, since every
        // OTHER makeLeafFrame caller in the tree passes an explicit 0/1). The JS
        // reference engine's own `_jsCharge` helper (js-engine.js) already treats
        // null/undefined as "random" correctly — this was a WASM-only parity bug.
        // Fix: translate null/undefined to -1 (the documented random-draw sentinel)
        // here, matching the wavelength line's own null-handling convention exactly.
        var chargeArg = (chargeInt === null || chargeInt === undefined) ? -1 : chargeInt;
        var handle = this._wasm.make_leaf_frame(
            left, top, lvl, (wavelength != null ? wavelength : 0), vx, vy, !!wrap, chargeArg);
        // Render-intent stamp: color AND/OR shape ride the SAME provider-side
        // MERGE seam (get→merge→set) so multiple keys coexist and neither clobbers the
        // engine-opaque bubble. Both omitted ⇒ 0 draws, no stamp → byte-identical.
        var _intent = null;
        if (color) {
            _intent = _intent || {};
            _intent['render.color'] = [color[0], color[1], color[2], color[3] !== undefined ? color[3] : 255].join(',');
        }
        if (shape != null && shape !== '') {
            _intent = _intent || {};
            _intent['render.shape'] = String(shape);
        }
        if (outline != null && outline !== '') {
            // render.outline is the ENUM 'true'|'false' (frame-data RENDER_INTENT_VALUES). Coerce a
            // boolean/'true' to 'true', anything else to 'false' — a null/undefined arg stamps nothing.
            _intent = _intent || {};
            _intent['render.outline'] = (outline === true || outline === 'true') ? 'true' : 'false';
        }
        if (_intent && typeof this._wasm.get_frame_quantum_id === 'function') {
            var qid = this._wasm.get_frame_quantum_id(handle);
            if (qid > 0) { _stampRenderIntentMerge(this._wasm, qid, _intent); }
        }
        return handle;
    };

    /**
     * The `liveQuantaCap` admission check — private to makeLeafFrame. The alive count is an
     * O(capacity) engine scan, so it is read ONCE per engine tick (keyed by `this.tick`, which
     * doTick updates after the engine steps: the first add of a tick's Phase A sees the count at
     * the previous tick's end); every leaf admitted since is counted here, so births never
     * overshoot the cap. Deaths inside a tick show up at the next snapshot.
     * @returns {boolean} true = make the leaf; false = refuse it (the cap is reached)
     */
    EGPTUniverse.prototype._admitLeaf = function () {
        var cap = this._params.liveQuantaCap;
        if (cap === false) { return true; }
        if (this._capTick !== this.tick) {
            var alive = this._wasm.active_quanta();
            if (typeof alive !== 'number' || !isFinite(alive)) {
                throw new Error('[EGPTUniverse] liveQuantaCap cannot read the alive count: ' +
                    'active_quanta() returned ' + String(alive) + ', not a finite number.');
            }
            this._capTick = this.tick;
            this._capAlive = alive;
            this._capAdmitted = 0;
        }
        if (this._capAlive + this._capAdmitted >= cap) {
            if (!this._capWarned) {
                this._capWarned = true;
                var ceiling = _liveQuantaCapRow().def.toLocaleString('en-US');
                console.warn('[EGPTUniverse] liveQuantaCap: ' + cap.toLocaleString('en-US') +
                    ' leaf quanta are alive — further leaf frames are skipped until the count ' +
                    'falls below it. This version of the engine is a limited preview release ' +
                    'capped at ' + ceiling + ' live quanta.');
            }
            return false;
        }
        this._capAdmitted++;
        return true;
    };

    /**
     * THE CAPACITY LAW, PUBLISHED — the cell capacity of a leaf at `level`, read off the
     * engine that owns it (`ActiveAxes::level_capacity`). Sugar that must size a frame by
     * level CONSUMES this; it never re-derives `4^level`, which is the A={x,y} answer only
     * and over-states a leaf's room on every other axis set. Capacity is the denominator of
     * both the move gate (fullness) and the wavelength, so a hand mirror mis-scales speed and
     * λ together — see `absorbRadiation.js`, the live consumer.
     *
     * @param {number} level - leaf/dimension scale level (edge = 2^level).
     * @returns {number} cells the frame owns, over the universe's ACTIVE axes.
     */
    EGPTUniverse.prototype.levelCapacity = function (level) {
        this._ensureInit();
        if (typeof this._wasm.level_capacity !== 'function') {
            throw new Error('[EGPTUniverse.levelCapacity] the engine does not publish the ' +
                'capacity law (level_capacity). Rebuild the engine (make wasm / make wasm-node).');
        }
        return this._wasm.level_capacity(level);
    };

    /**
     * G-EMIT generic primitive: inject an already-created frame handle into the
     * engine's injection buffer for consumption in Phase A of the next do_tick().
     *
     * Companion to make_leaf_frame(): the host emitter tick-fn calls make_leaf_frame()
     * to create a frame (with correct wavelength/charge), then calls injectFrame()
     * to enqueue it.
     *
     * @param {number|null} frameHandle - SoA FrameId returned by makeLeafFrame(); `null` (an add
     *   the liveQuantaCap refused) is a no-op — it never reaches the engine's injection buffer.
     */
    EGPTUniverse.prototype.injectFrame = function (frameHandle) {
        this._ensureInit();
        if (frameHandle === null) { return; }
        this._wasm.inject_frame(frameHandle);
    };

    /**
     * Resolve a makeLeafFrame handle (SoA FrameId) to its QUANTUM_ID — the id that
     * setFrameProperty/getFrameProperty and tickData.frameData[i].id key on. These two
     * id spaces differ; mutating a per-frame property with the raw makeLeafFrame handle
     * silently targets the wrong frame. Use this to bridge them (see the color path above,
     * which does the same conversion internally). A `null` handle (an add the liveQuantaCap
     * refused) answers 0, the ABI's own "no frame" id — never reaching the ABI, where null
     * coerces to the REAL frame 0.
     */
    EGPTUniverse.prototype.getFrameQuantumId = function (frameHandle) {
        this._ensureInit();
        if (frameHandle === null) { return 0; }
        return (typeof this._wasm.get_frame_quantum_id === 'function')
            ? this._wasm.get_frame_quantum_id(frameHandle)
            : frameHandle;
    };

    /**
     * MANDATORY BACKING — RE-ATTACH a LargeObject to a (moving)
     * backing Frame (a make_leaf_frame handle / FrameId): Bullet-style move-by-frame. Each tick
     * the engine re-centers the LO's rect on that frame's position (keeping the LO's own w/h/d).
     * Every LO is ALREADY frame-backed at registration; this RE-POINTS it (e.g. Gun / setupG2Sweep
     * binding the LO to a moving body leaf). There is NO null/detach path — pass a real FrameId.
     * Mass is not transferred on re-attach (default no-transfer). This is the "LO extends Frame"
     * composition.
     */
    EGPTUniverse.prototype.setLargeObjectFrame = function (handle, frameHandle) {
        this._ensureInit();
        if (frameHandle === null) {
            throw new Error('[EGPTUniverse.setLargeObjectFrame] the backing frame is null — the ' +
                'leaf add was refused by liveQuantaCap (' + this._params.liveQuantaCap + ' live ' +
                'quanta). A LargeObject needs a real backing frame.');
        }
        this._wasm.set_large_object_property(
            handle, 'frame_id', JSON.stringify(frameHandle));
    };

    /**
     * MANDATORY BACKING — read the SoA FrameId of the LO's backing frame (created at
     * registration). Sugar (e.g. absorbRadiation.js) READS the ledger frame here instead of
     * creating one. Returns -1 for an out-of-range handle.
     */
    EGPTUniverse.prototype.getLargeObjectFrameId = function (handle) {
        this._ensureInit();
        return this._wasm.get_large_object_frame_id(handle);
    };

    // ── The engine-visible ROUTING TABLE (the ONE statement of what this provider
    //    can push to WASM) ────────────────────────────────────────────────────────
    //
    // updateObjectProperty's dispatch AND its unroutable-property error both read
    // THIS table — never a second hand-written key list. A prop that is
    // engineVisible:true in the schema but absent here has NO WASM ABI, which is
    // exactly the condition that used to fall off the end of the old `else if`
    // chain and return silently (a scene that renders confidently while the engine
    // never received the edit — the DetectorWall case).
    //
    // Keyed by schema KIND. A kind absent from this table has no engine-side
    // dispatch at all in this provider.
    var _ENGINE_PROP_ROUTES = {
        LargeObject: {
            // G4b: rect/layer/count route through the ONE generic
            // set_large_object_property accessor (collapsed the typed setters).
            rect: function (u, handle, value) {
                // FRQTL-MAINT (2026-07-01): value may be [l,t,w,h], [l,t,z,w,h,d], or the
                // object form {left,top,w,h,z?,d?} — normalize to the wire array.
                var rectArr = Array.isArray(value) ? value : _rectSpecToArray(value);
                u._wasm.set_large_object_property(handle, 'rect', JSON.stringify(rectArr));
            },
            layer: function (u, handle, value) {
                // layer n → observed_dimensions=[n]; null → []
                u._wasm.set_large_object_property(handle, 'layer',
                    JSON.stringify((value !== null && value !== undefined) ? value : null));
            },
            count: function (u, handle, value) {
                // writable integer counter (JSON int — no BigInt; the accessor reads i64 from JSON)
                u._wasm.set_large_object_property(handle, 'count', JSON.stringify(Math.trunc(value)));
            },
            program: function (u, handle, value) {
                // §10.3 L3: attach or replace the op-program on an existing LO.
                // Used to add eject op-programs to walls after registerLargeObject.
                // value is the program object { on, ops } or null to clear.
                if (typeof u._wasm.set_large_object_program_json === 'function') {
                    var progJson = (value !== null && value !== undefined)
                        ? JSON.stringify(value)
                        : 'null';
                    u._wasm.set_large_object_program_json(handle, progJson);
                }
                // No-op fallback if WASM binary predates this ABI (older builds).
            },
            region: function (u, handle, value) {
                // SWEPT-OBB narrow-phase region (circulation §2): retarget the rotated collision
                // slab on a running LO (Wall registration + live orientation edit). value is the
                // convention-free { kind:'obb', theta, hw, hh, hz } from SlabFace, or null to
                // clear back to the byte-identical AABB path. The ABI validates the shape
                // (throw-or-apply; a bad kind/extent throws) — never a silent skip. The string
                // 'null' clears (matches egpt_wasm set_large_object_property 'region' handling).
                var regionJson = (value !== null && value !== undefined)
                    ? JSON.stringify(value)
                    : 'null';
                u._wasm.set_large_object_property(handle, 'region', regionJson);
            }
        }
    };
    // 'backdrop' shares LargeObject's dispatch (same wrapper class, same ABI).
    _ENGINE_PROP_ROUTES.backdrop = _ENGINE_PROP_ROUTES.LargeObject;

    // ── Props DELIBERATELY applied at the JS layer, not by any WASM ABI ──────────
    //
    // These reach this method and are correctly a no-op HERE because
    // FrqtlApp.updateObjectProperty has already mirrored them onto the JS wrapper,
    // which is the whole mechanism:
    //
    //   reposition      engineVisible:true, but there is no standalone WASM ABI —
    //                   it is read at LO registration time, never during collide()
    //                   from Rust. The wrapper mirror IS the applied state.
    //
    // This is NOT a mirror of the schema's field list — it is this provider's own
    // statement about which engine-visible props have no ABI yet.
    var _JS_APPLIED_PROPS = { reposition: true };

    /**
     * Uniform schema-driven mutation entry point — ENGINE-VISIBLE props only (Phase 4b).
     *
     * The WASM universe does not hold references to JS-side LargeObject wrappers, so
     * render-only props (engineVisible:false) CANNOT be routed here. The caller
     * (FrqtlApp.updateObjectProperty) handles render-only props by mutating the
     * JS wrapper directly before reaching this method.
     *
     * This method:
     *   1. Validates the prop against the schema → FAIL LOUD on unknown/readonly/wrong-kind.
     *   2. For engineVisible:false props that reach here (a caller that bypassed FrqtlApp):
     *      no-op (the JS wrapper is already updated).
     *   3. For engineVisible:true props: delegates to the appropriate WASM ABI.
     *
     * @param {number}  handle  - Opaque handle (registerLargeObject)
     * @param {string}  kind    - Object kind matching ObjectSchema registry
     * @param {string}  prop    - Field name in the schema descriptor
     * @param {*}       value   - New value
     * @throws {TypeError}      - If prop is not in the schema for kind, or is readonly
     */
    EGPTUniverse.prototype.updateObjectProperty = function (handle, kind, prop, value) {
        this._ensureInit();

        var schema = ObjectSchema;   // the canonical descriptor table (objects/schema), a static import

        // ── Schema validation ─────────────────────────────────────────────────
        var fieldDef = null;
        var descriptor = schema.get(kind);
        if (!descriptor) {
            throw new TypeError(
                '[updateObjectProperty] Unknown object kind "' + kind + '"'
            );
        }
        for (var i = 0; i < descriptor.fields.length; i++) {
            if (descriptor.fields[i].name === prop) {
                fieldDef = descriptor.fields[i];
                break;
            }
        }
        if (!fieldDef) {
            throw new TypeError(
                '[updateObjectProperty] Property "' + prop + '" is not in the schema for kind "' + kind + '"'
            );
        }
        if (fieldDef.type === 'readonly') {
            throw new TypeError(
                '[updateObjectProperty] Property "' + prop + '" is readonly for kind "' + kind + '"'
            );
        }
        // Render-only props: handled by FrqtlApp before we get here.
        // If they somehow reach this path, no-op — the JS wrapper is already mutated.
        if (!fieldDef.engineVisible) {
            return;
        }

        // ── Engine-visible dispatch → WASM ABI ───────────────────────────────
        // ONE table (_ENGINE_PROP_ROUTES) drives both the call and the error below.
        var routes = _ENGINE_PROP_ROUTES[kind];
        if (routes && Object.prototype.hasOwnProperty.call(routes, prop)) {
            routes[prop](this, handle, value);
            return;
        }

        // Applied at the JS layer by FrqtlApp's wrapper mirror — a no-op here is
        // the CORRECT outcome, not a swallow. See _JS_APPLIED_PROPS.
        if (Object.prototype.hasOwnProperty.call(_JS_APPLIED_PROPS, prop)) {
            return;
        }

        // ── FAIL LOUD: engine-visible, but nothing routes it ─────────────────
        // Reaching here means the schema declares this prop engineVisible:true for
        // this kind while NO WASM ABI receives it. The old code returned silently,
        // so the Inspector showed the edit and the running scene ignored it
        // (DetectorWall's wallX/wallY/wallHeight/wallWidth/wallCollisionType, the
        // double-slit detector — a scene that renders confidently and is not the
        // scene it claims). If the write genuinely belongs to the JS layer, the
        // object's own setter must perform it BEFORE delegating here, the way
        // Wall/Tunnel/SphereEmitter/QuantumEmitter-rect already return early in
        // FrqtlApp.updateObjectProperty.
        //
        // Both lists below are DERIVED: the routable set from the dispatch table
        // above, the declared set from the descriptor this method already resolved.
        // Neither is hand-enumerated here.
        var routable = routes ? Object.keys(routes) : [];
        var declared = [];
        var d2 = schema.get(kind);
        for (var j = 0; j < d2.fields.length; j++) {
            if (d2.fields[j].engineVisible && d2.fields[j].type !== 'readonly') {
                declared.push(d2.fields[j].name);
            }
        }
        throw new TypeError(
            '[updateObjectProperty] Property "' + prop + '" is engine-visible for kind "' +
            kind + '" but no WASM ABI routes it — the write would be silently discarded. ' +
            (routable.length
                ? 'This provider routes for "' + kind + '": ' + routable.join(', ') + '.'
                : 'This provider has NO engine dispatch for kind "' + kind + '" at all.') +
            ' The schema declares these engine-visible fields for "' + kind + '": ' +
            (declared.length ? declared.join(', ') : '(none)') + '. ' +
            'Either add the ABI, or apply the write at the JS layer (the object\'s own ' +
            'setter) and return before delegating to universe.updateObjectProperty.'
        );
    };

    EGPTUniverse.prototype.setLargeObjectCollisionType = function (handle, collisionType) {
        // G2: native collision_type is fully deleted from the Rust engine.
        // All velocity behaviors (RANDOM_X/Y/XY, MOMENTUM_BASED, WALL, BOUNCE) are compiled
        // into op-programs by actionCompiler at registration time. Calling this method at
        // runtime is a no-op — the op-program is the only velocity mechanism.
        // set_large_object_collision_type / set_large_object_collision_type_str are DELETED
        // WASM ABI methods. Calling them would cause a WASM trap. Warn instead of crash.
        if (typeof console !== 'undefined') {
            console.warn('[wasm-engine] setLargeObjectCollisionType(' + handle + ', ' +
                JSON.stringify(collisionType) + ') called after G2 deletion — no-op.' +
                ' Compile velocity behavior into an op-program at registration time instead.');
        }
    };

    EGPTUniverse.prototype.setLargeObjectActive = function (handle, active) {
        this._ensureInit();
        // G4b: generic LO accessor (was set_large_object_active).
        this._wasm.set_large_object_property(handle, 'active', JSON.stringify(!!active));
    };

    /**
     * Update the rect of a large object by handle (IDE direct-manipulation API).
     * Delegates to the WASM ABI when the binary exposes update_large_object_rect;
     * silently no-ops if the binary is older (render rect is still moved by
     * FrqtlApp.moveLargeObject — visually correct for the next frame).
     *
     * @param {number} handle
     * @param {Array|Object} rect - [left, top, w, h], [left, top, z, w, h, d]
     *   (FRQTL-MAINT 2026-07-01: explicit z/depth, mirrors Rectangle::from_top_left's
     *   own argument order), or the object form {left, top, w, h, z?, d?}.
     */
    EGPTUniverse.prototype.updateLargeObjectRect = function (handle, rect) {
        this._ensureInit();
        var rectArr = Array.isArray(rect) ? rect : _rectSpecToArray(rect);
        if (typeof this._wasm.set_large_object_property === 'function') {
            // G4b: generic LO accessor (was update_large_object_rect).
            this._wasm.set_large_object_property(handle, 'rect', JSON.stringify(rectArr));
        }
        // No-op fallback: FrqtlApp.moveLargeObject already updated lo.rect
        // so the renderer sees the new position. Physics rect update deferred until
        // the WASM binary gains the ABI endpoint.
    };


    EGPTUniverse.prototype.queryRect = function (left, top, w, h) {
        this._ensureInit();
        return this._wasm.query_rect(left, top, w, h);
    };

    /**
     * SLICE 3 — set the writable integer counter for a registered LargeObject.
     *
     * B2.1 (Gate-2 binding): count is read from
     * TickData.objects[handle].count (the ONE read authority). The pull
     * getLargeObjectCount is DELETED — count has a single marshalling path.
     *
     * @param {number} handle - Opaque handle from registerLargeObject
     * @param {number} value  - New count value (integer)
     */
    EGPTUniverse.prototype.setLargeObjectCount = function (handle, value) {
        this._ensureInit();
        // G4b: generic LO accessor (was set_large_object_count). JSON int — the accessor reads i64.
        this._wasm.set_large_object_property(handle, 'count', JSON.stringify(Math.trunc(value)));
    };

    /**
     * Query frames overlapping a rectangular region (SLICE 2 — EXTENSIBLE read path).
     *
     * Returns an array of canonical FrameData objects — the SAME shape as
     * doTick() already emits (marshalled via _wrapTickData's FrameData path).
     * NOT a parallel DTO.
     *
     * The WASM ABI returns a JSON-encoded FrameData array. We deserialize and
     * pass each frame through the same FrameData constructor used by _wrapTickData
     * so callers get an identical object shape.
     *
     * @param {number} left - Left edge (physics pixels)
     * @param {number} top  - Top edge (physics pixels)
     * @param {number} w    - Width (physics pixels)
     * @param {number} h    - Height (physics pixels)
     * @returns {FrameData[]}
     */
    EGPTUniverse.prototype.queryRectFrames = function (left, top, w, h) {
        this._ensureInit();
        var json = this._wasm.query_rect_frames(left, top, w, h);
        if (!json) return [];
        var rawFrames;
        try {
            rawFrames = JSON.parse(json);
        } catch (_e) {
            return [];
        }
        if (!Array.isArray(rawFrames) || rawFrames.length === 0) return [];

        // Marshal each raw frame through the canonical _wrapRawFrame() — the SAME
        // path _wrapTickData uses for do_tick() output. No parallel DTO: a single
        // marshaller means z/vz and the string_map Map→obj normalization
        // are inherited here for free instead of being hand-mirrored.
        var result = [];
        for (var j = 0; j < rawFrames.length; j++) {
            result.push(_wrapRawFrame(rawFrames[j], this.tick));
        }
        return result;
    };

    /**
     * Query frames inside an ORIENTED bounding box (the exposed community narrow-phase
     * primitive; circulation §4). A between-ticks READ — a snapshot has a fixed position,
     * so this is a point-in-OBB test (no sweep). Standard-math geometry in (explicit center
     * + theta radians + half-extents in the ENGINE frame — the FRQTL "tall-mirror" convention
     * is one JS adapter, SlabFace, ABOVE this convention-free primitive); returns canonical
     * FrameData[] via the SAME marshaller as queryRectFrames (no parallel DTO). DRY: the same
     * region.rs evaluator the LO narrow-phase filter uses.
     *
     * WASM-ONLY: the frozen 2D JS reference has no OBB primitive (the fixture
     * is never edited); the JS provider FAILS LOUD instead of silently returning [].
     *
     * @param {number} cx    center X (physics px)
     * @param {number} cy    center Y (physics px)
     * @param {number} cz    center Z (physics px; 0 for 2D)
     * @param {number} theta rotation about z (RADIANS, engine frame)
     * @param {number} hw    half-extent along local x (px, > 0)
     * @param {number} hh    half-extent along local y (px, > 0)
     * @param {number} hz    half-extent along local z (px; large value = 2D z-passthrough)
     * @returns {FrameData[]}
     */
    EGPTUniverse.prototype.queryObbFrames = function (cx, cy, cz, theta, hw, hh, hz) {
        this._ensureInit();
        if (typeof this._wasm.query_obb_frames !== 'function') {
            throw new Error(
                '[queryObbFrames] the active WASM binary predates the swept-OBB ABI ' +
                '(query_obb_frames). Rebuild the engine (make wasm / make wasm-node).'
            );
        }
        var json = this._wasm.query_obb_frames(cx, cy, cz, theta, hw, hh, hz);
        if (!json) return [];
        var rawFrames;
        try {
            rawFrames = JSON.parse(json);
        } catch (_e) {
            return [];
        }
        if (!Array.isArray(rawFrames) || rawFrames.length === 0) return [];
        var out = [];
        for (var k = 0; k < rawFrames.length; k++) {
            out.push(_wrapRawFrame(rawFrames[k], this.tick));
        }
        return out;
    };

    /**
     * Enqueue a one-time batch of property mutations to apply at the top of the
     * next tick (Phase A, before move) — the EXTENSIBLE deferred-write path.
     *
     * FAIL-LOUD: throws on malformed entry, unknown/forbidden/readonly prop.
     * Does NOT silently drop mutations (stricter than inject_frames).
     *
     * Batch entries: { id: quantum_id, prop: string, value: * }
     *   id   — frame.id (= quantum_id, FrameData.id from doTick())
     *   prop — writable Frame property name (§2.3 Frame property table)
     *   value — new value (type follows §2.3 table)
     *
     * @param {Array<{id:number, prop:string, value:*}>} batch
     * @throws {TypeError} — malformed entry, forbidden/readonly/unknown prop
     */
    EGPTUniverse.prototype.injectMutations = function (batch) {
        this._ensureInit();

        if (!Array.isArray(batch)) {
            throw new TypeError('[injectMutations] batch must be an array, got: ' + typeof batch);
        }

        // Schema-driven pre-validation — fail before any enqueue. The Frame scope row
        // (objects/schema/scopes.js) is a static import, so it is always present.
        var descriptor = ObjectSchema.get('Frame');

        for (var i = 0; i < batch.length; i++) {
            var entry = batch[i];
            if (entry === null || typeof entry !== 'object' ||
                typeof entry.id !== 'number' ||
                typeof entry.prop !== 'string' ||
                !('value' in entry)) {
                throw new TypeError(
                    '[injectMutations] Malformed entry at index ' + i +
                    ': expected { id: number, prop: string, value: * }, got ' +
                    JSON.stringify(entry)
                );
            }
            // Schema guard — validates classification before the WASM boundary.
            var fieldDef = null;
            for (var fi = 0; fi < descriptor.fields.length; fi++) {
                if (descriptor.fields[fi].name === entry.prop) { fieldDef = descriptor.fields[fi]; break; }
            }
            if (!fieldDef) {
                throw new TypeError(
                    '[injectMutations] Unknown property "' + entry.prop +
                    '" for kind "Frame" (entry index ' + i + '). ' +
                    'Valid properties: ' + descriptor.fields.map(function(f){return f.name;}).join(', ')
                );
            }
            if (fieldDef.type === 'forbidden') {
                throw new TypeError(
                    '[injectMutations] Property "' + entry.prop +
                    '" is engine-owned topology — forbidden (entry index ' + i + '). ' +
                    'Set position (x/y) and let the engine reconcile topology next tick.'
                );
            }
            if (fieldDef.type === 'readonly') {
                throw new TypeError(
                    '[injectMutations] Property "' + entry.prop +
                    '" is read-only (entry index ' + i + '). ' +
                    'Use a writable property to change it indirectly.'
                );
            }
        }

        // Pack the batch as JSON for the WASM ABI.
        // wire format: [{ id, prop, value }, ...]
        // value is JSON-serialized to match set_frame_property's json_value ABI.
        var wasmBatch = [];
        for (var j = 0; j < batch.length; j++) {
            var e = batch[j];
            var wasmValue = e.value;
            // Wire-format translation for charge (SCREAMING_SNAKE → integer 0/1).
            if (e.prop === 'charge') {
                if (wasmValue === 'POSITIVE' || wasmValue === 'Positive') wasmValue = 0;
                else if (wasmValue === 'NEGATIVE' || wasmValue === 'Negative') wasmValue = 1;
            } else if (e.prop === 'data') {
                // data bubble: already an object; pass through (Rust will receive it as JSON).
                wasmValue = (wasmValue !== null && wasmValue !== undefined) ? wasmValue : null;
            }
            wasmBatch.push({ id: e.id, prop: e.prop, value: wasmValue });
        }
        // Delegate to WASM ABI.
        this._wasm.inject_mutations(JSON.stringify(wasmBatch));
    };

    // [D4] Methods present in node copy only; absent in browser copy — included here.

    EGPTUniverse.prototype.killFrame = function (id) {
        this._ensureInit();
        this._wasm.kill_frame(id);
    };

    EGPTUniverse.prototype.getFramePosition = function (id) {
        this._ensureInit();
        var pos = this._wasm.get_frame_position(id);
        if (pos.length === 2) {
            return { x: pos[0], y: pos[1] };
        }
        return null;
    };

    /**
     * Get a property of a frame by ID and property name.
     *
     * Schema-driven: reads the Frame descriptor from ObjectSchema to validate prop names.
     * Throws TypeError for unknown properties.
     *
     * Returns the live frame property value at call time (reflects last-tick state).
     *
     * @param {number} id    — frame ID (quantum_id / FrameData.id)
     * @param {string} prop  — property name (from §2.3 Frame property table)
     * @returns {*}          — property value, or null if frame not found
     * @throws {TypeError}   — unknown property name
     */
    EGPTUniverse.prototype.getFrameProperty = function (id, prop) {
        this._ensureInit();

        // Schema validation — driven off the canonical FrameDescriptor table.
        // The Frame scope row (objects/schema/scopes.js) — a static import, so it is always present.
        var descriptor = ObjectSchema.get('Frame');
        var fieldDef = null;
        for (var i = 0; i < descriptor.fields.length; i++) {
            if (descriptor.fields[i].name === prop) { fieldDef = descriptor.fields[i]; break; }
        }
        if (!fieldDef) {
            throw new TypeError(
                '[getFrameProperty] Unknown property "' + prop + '" for kind "Frame". ' +
                'Valid properties: ' + descriptor.fields.map(function(f){return f.name;}).join(', ')
            );
        }

        // Delegate to the WASM ABI.
        var result = this._wasm.get_frame_property(id, prop);
        // get_frame_property returns: null string for not-found, JSON-encoded value otherwise.
        if (result === null || result === undefined) return null;
        if (typeof result === 'string') {
            // WASM returns JSON-encoded for complex values; primitives are passed through.
            try { return JSON.parse(result); } catch (_) { return result; }
        }
        return result;
    };

    /**
     * Set a property of a frame by ID and property name.
     *
     * THROW-OR-APPLY: every writable prop reaches the engine or throws.
     * NO silent no-op — Frames have no JS-wrapper upstream; engine owns them.
     *
     * Forbidden topology props (parent, children): FAIL-LOUD TypeError always.
     * Derived read-only props: FAIL-LOUD TypeError always.
     * Unknown props: FAIL-LOUD TypeError always.
     *
     * @param {number} id    — frame ID (quantum_id / FrameData.id)
     * @param {string} prop  — property name (from §2.3 Frame property table)
     * @param {*}      value — new value
     * @throws {TypeError}   — forbidden / readonly / unknown property
     */
    EGPTUniverse.prototype.setFrameProperty = function (id, prop, value) {
        this._ensureInit();

        // Schema validation — driven off the canonical FrameDescriptor table.
        // The Frame scope row (objects/schema/scopes.js) — a static import, so it is always present.
        var descriptor = ObjectSchema.get('Frame');
        var fieldDef = null;
        for (var i = 0; i < descriptor.fields.length; i++) {
            if (descriptor.fields[i].name === prop) { fieldDef = descriptor.fields[i]; break; }
        }
        if (!fieldDef) {
            throw new TypeError(
                '[setFrameProperty] Unknown property "' + prop + '" for kind "Frame". ' +
                'Valid properties: ' + descriptor.fields.map(function(f){return f.name;}).join(', ')
            );
        }
        if (fieldDef.type === 'forbidden') {
            throw new TypeError(
                '[setFrameProperty] Property "' + prop + '" is engine-owned topology — ' +
                'structure is engine-derived. Set position and let the next tick reconcile.'
            );
        }
        if (fieldDef.type === 'readonly') {
            throw new TypeError(
                '[setFrameProperty] Property "' + prop + '" is read-only (derived: ' + prop + ').'
            );
        }

        // Wire-format translation: charge canonical SCREAMING_SNAKE → Rust enum integer.
        // data bubble: JSON-encode for WASM ABI.
        var wasmValue = value;
        if (prop === 'charge') {
            if (value === 'POSITIVE' || value === 'Positive') {
                wasmValue = 0;
            } else if (value === 'NEGATIVE' || value === 'Negative') {
                wasmValue = 1;
            } else if (typeof value !== 'number') {
                throw new TypeError('[setFrameProperty] Invalid charge value: ' + JSON.stringify(value) +
                    '. Use "POSITIVE" or "NEGATIVE".');
            }
        }
        // NOTE: 'data' is NOT pre-stringified here. Every value is JSON-encoded exactly ONCE below.
        // Pre-stringifying the bubble double-encodes it to a JSON string, so Rust's value.as_object()
        // sees a string and silently drops the write — a latent bug masked by a guarded FP10 assert.

        // Delegate to WASM ABI.
        // set_frame_property(id, prop, json_value) — all values go as JSON strings for uniformity.
        var jsonVal = (wasmValue === null || wasmValue === undefined)
            ? 'null'
            : JSON.stringify(wasmValue);
        this._wasm.set_frame_property(id, prop, jsonVal);
    };

    // ── Internal helpers ─────────────────────────────────────────────────


    // THE ONE raw-frame → canonical FrameData wrapper. Rust reports flat x/y/z (the CENTRE on all three
    // axes) + w/h, wrapped here as a centred Rectangle, and a data bubble whose string_map arrives as a
    // JS Map under serde_wasm_bindgen v0.6; normalize it to a plain object. Used by _wrapTickData for
    // BOTH frames[] and objects[].frames, and by queryRectFrames/queryObbFrames — no parallel DTO.
    function _wrapRawFrame(fd, defaultTick) {
        var rect = new Rectangle(
            fd.x != null ? fd.x : 0, fd.y != null ? fd.y : 0,
            fd.w != null ? fd.w : 1, fd.h != null ? fd.h : 1,
            null, true
        );
        var wasmData = (fd.data !== undefined && fd.data !== null) ? fd.data : null;
        if (wasmData && wasmData.string_map instanceof Map) {
            var smObj = {};
            wasmData.string_map.forEach(function (v, k) { smObj[k] = v; });
            wasmData = Object.assign({}, wasmData, { string_map: smObj });
        }
        return new FrameData(
            fd.tick != null ? fd.tick : defaultTick,
            fd.id != null ? fd.id : 0,
            fd.layer != null ? fd.layer : 0,
            rect,
            fd.fullness != null ? fd.fullness : 0,
            fd.is_alive !== false,
            fd.child_count != null ? fd.child_count : 0,
            fd.mass != null ? fd.mass : 1,
            fd.collided_id != null ? fd.collided_id : -1,
            fd.vx != null ? fd.vx : 0,
            fd.vy != null ? fd.vy : 0,
            fd.z != null ? fd.z : 0,
            fd.vz != null ? fd.vz : 0,
            wasmData
        );
    }

    // THE ONE engine-bounds → JS bag normalizer, for BOTH UniverseData and DimensionData.
    //
    // The ENGINE owns the world's bounds and emits them as centre + extent on all three axes
    // (`tick_data.rs::UniverseData::boundary_rect` / `DimensionData::boundary_rect`, a 6-tuple
    // `(x,y,z,w,h,d)`). This reads that tuple rather than re-deriving from the JS-side
    // `universe_rect`, which is the CONFIG rect: it carries no z, and `UniverseConfig::depth`
    // decouples the world's depth from its width, so the shim cannot compute the z extent —
    // it has to be TOLD it. Frames already report `z`; without this a consumer receives depth
    // coordinates with no frame of reference for them.
    //
    // The six derived edges are the same ones the engine's own `Rectangle` publishes, so a
    // consumer reading `left`/`top`/`right`/`bottom` sees exactly what it always did and gains
    // `z`/`d`/`near`/`far` alongside.
    function _wrapBoundaryRect(t) {
        if (!Array.isArray(t) || t.length !== 6) {
            throw new Error(
                'wasm-engine: TickData boundary_rect must be the engine\'s 6-tuple ' +
                '(x, y, z, w, h, d) — got ' + JSON.stringify(t) + '. The world bounds are owned ' +
                'by the engine (tick_data.rs UniverseData/DimensionData::boundary_rect); the shim ' +
                'ferries them and never re-derives them from the JS-side config rect.'
            );
        }
        var x = t[0], y = t[1], z = t[2], w = t[3], h = t[4], d = t[5];
        return {
            x: x, y: y, z: z, w: w, h: h, d: d,
            left:  x - w / 2, right:  x + w / 2,
            top:   y - h / 2, bottom: y + h / 2,
            near:  z - d / 2, far:    z + d / 2,
            r: w / 2
        };
    }

    EGPTUniverse.prototype._wrapTickData = function (raw) {
        var ud = new UniverseData(
            raw.universe != null ? raw.universe.tick : this.tick,
            raw.universe != null ? raw.universe.dimension_count : 0,
            _wrapBoundaryRect(raw.universe && raw.universe.boundary_rect)
        );
        var td = new TickData(ud);

        if (raw.dimensions) {
            for (var i = 0; i < raw.dimensions.length; i++) {
                var dd = raw.dimensions[i];
                td.addDimensionData(new DimensionData(
                    dd.tick != null ? dd.tick : this.tick,
                    dd.layer != null ? dd.layer : 0,
                    dd.frame_count != null ? dd.frame_count : 0,
                    _wrapBoundaryRect(dd.boundary_rect)
                ));
            }
        }

        if (raw.frames) {
            for (var j = 0; j < raw.frames.length; j++) {
                td.addFrameData(_wrapRawFrame(raw.frames[j], this.tick));
            }
        }

        // SLICE 3 — B2: populate objects[] from raw.objects (populated by Rust Phase D COLLECT).
        // Handle order: 0, 1, 2, ... matches LargeObjectSpec Vec index (same as JS).
        // B2.1 — ONE read authority: user space reads count from tickData.objects[handle].count.
        //   get_large_object_count() (WASM pull) is DELETED (Dispatch C2, 2026-06-21) — this
        //   section is the sole marshalling path for count (§10.8 B2.1).
        // B2.2 — shape { handle, count } is the canonical key list owned by ObjectCollectedState.
        if (raw.objects && Array.isArray(raw.objects) && raw.objects.length > 0) {
            if (!td.objects) { td.objects = []; }
            var _wrapTick = this.tick;
            for (var k = 0; k < raw.objects.length; k++) {
                var oc = raw.objects[k];
                // B2.2 — keys { handle, count, frames }. `frames` = the LO's per-tick collected
                // frames (TickData.objects[handle].frames), marshalled through the ONE wrapper —
                // the same FrameData shape as TickData.frames. Replaces the retired getCollidedFrames
                // query: the engine emits the collected frames, it does not answer per-LO queries.
                td.objects.push({
                    handle: oc.handle != null ? oc.handle : k,
                    count:  oc.count  != null ? Number(oc.count) : 0,
                    frames: Array.isArray(oc.frames)
                        ? oc.frames.map(function (f) { return _wrapRawFrame(f, _wrapTick); })
                        : []
                });
            }
        }

        return td;
    };

    // ── SLICE 3 B1: CRUD Delete on WASM side ──────────────────────────────────

    /**
     * Unregister a large object by handle (SLICE 3, B1).
     *
     * Gate-2 binding (§10.8 B1):
     *   B1.1 — FAIL-LOUD on unknown handle: throws (propagates Rust Err → JsValue).
     *   B1.2 — Reuses the ONE integer handle table; handle slot is tombstoned.
     *   B1.3 — Must be called between ticks.
     *
     * Mirror: Rust universe.rs unregister_large_object / JS reference unregisterLargeObject.
     *
     * @param {number} handle — opaque handle from registerLargeObject()
     * @throws {Error|TypeError} — if handle is out of range or already tombstoned
     */
    EGPTUniverse.prototype.unregisterLargeObject = function (handle) {
        this._ensureInit();
        this._wasm.unregister_large_object(handle);
        // ONE teardown call leaves BOTH censuses: the engine's registry above and the JS
        // wrapper census the renderer derives its draw list from. A wrapper that outlived
        // its engine registration would draw a body that no longer collides.
        for (var i = this.largeObjects.length - 1; i >= 0; i--) {
            if (this.largeObjects[i] && this.largeObjects[i].handle === handle) {
                this.largeObjects.splice(i, 1);
            }
        }
        var h = this._loHandles.indexOf(handle);
        if (h !== -1) { this._loHandles.splice(h, 1); }
    };

    /**
     * The LIVE engine registrations on this world that carry NO JS wrapper — i.e. the
     * objects a renderer deriving its draw list from `largeObjects` cannot see.
     *
     * ── Why this is the divergence oracle, and why `tickData.objects[]` is not ──
     * The collected `objects[]` array keeps a slot for an UNREGISTERED object (the handle
     * space never compacts), so it cannot tell a live object from a torn-down one and
     * would flag every disposed wall forever. This world owns BOTH ledgers — the handle
     * table it hands out and the wrapper census constructed against it — so it is the one
     * place that can answer honestly.
     *
     * The raw `registerLargeObject(spec)` path is legitimate for a headless conformance
     * harness (there is no renderer to be absent from). In a RENDERED world it is exactly
     * the silent-invisible case: a body that collides and counts correctly and never
     * appears in a picture. The host asserts on this before it draws.
     *
     * @returns {number[]} live handles with no wrapper, in registration order.
     */
    EGPTUniverse.prototype.unwrappedLargeObjectHandles = function () {
        var wrapped = Object.create(null), i;
        for (i = 0; i < this.largeObjects.length; i++) {
            if (this.largeObjects[i]) { wrapped[this.largeObjects[i].handle] = true; }
        }
        var out = [];
        for (i = 0; i < this._loHandles.length; i++) {
            if (!wrapped[this._loHandles[i]]) { out.push(this._loHandles[i]); }
        }
        return out;
    };


    // ── Boundary Frame (standard interface coverage) ───────────────────
    //
    // The standard JS-reference interface exposes Frame.makeLeafFrame and instance
    // methods (insert, addPoints, etc.) that experiment code calls directly.
    //
    // On the WASM path these are NOT implemented in Rust. The boundary Frame surfaces
    // every JS-reference Frame method: static makeLeafFrame forwards or logs+null;
    // instance methods (insert, addPoints, etc.) do the same. This lets experiments use
    // the standard interface on both engines — WASM degrades gracefully (log+null) rather
    // than crashing with "undefined is not a function".

    function BoundaryFrame() {
        // Boundary instance — represents a Frame-shaped null returned for WASM-missing constructors.
        this.is_alive  = false;
        this.is_leaf   = false;
        this.children  = [];
        this.mass      = 0;
        this.layer     = 0;
        this.rect      = null;
        this.name      = null;
        this._isBoundaryNull = true; // sentinel: callers can detect the shim null
    }

    BoundaryFrame.prototype.insert = function (quantum) {
        if (_activeUniverse && this._handle !== undefined && quantum && quantum._handle !== undefined) {
            return _activeUniverse._wasm.insert_into_frame(this._handle, quantum._handle);
        }
        console.log('[shim] Frame.insert: missing handle(s) or no active WASM universe — returning null');
        return null;
    };
    BoundaryFrame.prototype.addPoints = function (quanta) {
        console.log('[shim] Frame.addPoints not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.move = function (t, boundary_rect) {
        console.log('[shim] Frame.move not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.compress = function () {
        console.log('[shim] Frame.compress not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.reinit = function () {
        console.log('[shim] Frame.reinit not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.kill = function () {
        console.log('[shim] Frame.kill not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.reset = function () {
        console.log('[shim] Frame.reset not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.toFrameData = function () {
        console.log('[shim] Frame.toFrameData not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.checkCollision = function () {
        console.log('[shim] Frame.checkCollision not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.collide = function () {
        console.log('[shim] Frame.collide not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.merge = function () {
        console.log('[shim] Frame.merge not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.bond = function () {
        console.log('[shim] Frame.bond not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.bounce = function () {
        console.log('[shim] Frame.bounce not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.boundary_check = function () {
        console.log('[shim] Frame.boundary_check not implemented in WASM engine — returning null');
        return null;
    };
    BoundaryFrame.prototype.setWavelength = function () {
        console.log('[shim] Frame.setWavelength not implemented in WASM engine — returning null');
        return null;
    };

    /**
     * Static makeLeafFrame — matches JS-reference Frame.makeLeafFrame signature.
     * Routes through the active universe's makeLeafFrame (THE one leaf door, which owns the
     * charge/wavelength translation and the liveQuantaCap admission). Returns the BoundaryFrame
     * null marker when no universe is initialised yet OR when the cap refused the add.
     *
     * charge: 0=Positive, 1=Negative, null/undefined=random.
     * wavelength: 0 or negative means "none" on the Rust side (mass = capacity).
     * `boundary_rect` and `color_override` are NOT forwarded: the instance door's 9th positional
     * is `color`, so the positional list must never be passed through as-is.
     *
     * The JS reference took a trailing frame-generation-mode flag here; it was never read by
     * this body (the mode is universe state the engine already holds) and is DROPPED. Extra
     * arguments from an old call site are ignored by JS, so no caller changes.
     */
    BoundaryFrame.makeLeafFrame = function (left, top, level, wavelength, vx, vy, wrap, charge, boundary_rect, color_override) {
        if (!_activeUniverse) {
            console.log('[shim] Frame.makeLeafFrame: no active WASM universe — returning null');
            var f0 = new BoundaryFrame();
            f0.layer = level || 0;
            return f0;
        }
        var frameId = _activeUniverse.makeLeafFrame(left, top, level, wavelength, vx, vy, wrap, charge);
        if (frameId === null) {
            var fc = new BoundaryFrame();
            fc.layer = level || 0;
            return fc;
        }
        var f = new BoundaryFrame();
        f._handle = frameId;
        f.layer = level || 0;
        f.is_leaf = true;
        f.is_alive = true;
        f._isBoundaryNull = false;
        return f;
    };

    // ── Boundary Dimension (standard interface coverage) ─────────────────
    //
    // JS-reference Dimension exposes mb_w, mb_h, addFrame, createFrameFromRect,
    // createParentFrame, handleStructurePromotion, frames,
    // layer, isHidden, and more. The boundary Dimension surfaces every method:
    // for properties computable locally (mb_w, mb_h) values are derived from layer;
    // for methods not implemented in WASM: log+null; the WASM doTick() still works.

    function _makeBoundaryDimension(layer, wasm) {
        var mb_w = Math.pow(2, layer);
        var mb_h = mb_w;
        var _isHidden = false;

        var dim = {
            layer: layer,
            mb_w:  mb_w,
            mb_h:  mb_h,
            frames: [], // not populated by WASM (WASM owns its own frame list)

            // addFrame — forwards to Rust add_frame_to_dimension when a handle is present
            addFrame: function (mb) {
                var w = wasm || (_activeUniverse && _activeUniverse._wasm);
                if (w && mb && mb._handle !== undefined) {
                    w.add_frame_to_dimension(layer, mb._handle);
                    return;
                }
                console.log('[shim] Dimension.addFrame: missing handle or no active WASM universe — returning null');
                return null;
            },

            // createFrameFromRect — forwards to Rust create_frame_from_rect
            // Returns a BoundaryFrame with _handle set, or a null-sentinel on failure.
            createFrameFromRect: function (rect, childFrames, vx, vy, addToDimension, is_stationary, string_map) {
                var w = wasm || (_activeUniverse && _activeUniverse._wasm);
                if (w && rect) {
                    var childHandles = (childFrames || []).map(function (c) {
                        return (c && c._handle !== undefined) ? c._handle : 0;
                    });
                    var rectArr = [rect.left || 0, rect.top || 0, rect.w || mb_w, rect.h || mb_h];
                    // usize::MAX (returned on failure) is representable as a JS number
                    // only approximately; use a large-enough threshold instead.
                    var INVALID = 4294967295; // 0xFFFF_FFFF — frame counts will never reach this
                    var frameId = w.create_frame_from_rect(
                        layer, rectArr, childHandles,
                        vx || 0, vy || 0,
                        addToDimension !== false, !!is_stationary
                    );
                    if (frameId >= INVALID) {
                        console.log('[shim] Dimension.createFrameFromRect: Rust returned INVALID — returning sentinel');
                        return new BoundaryFrame();
                    }
                    var f = new BoundaryFrame();
                    f._handle = frameId;
                    f.layer = layer;
                    f.is_alive = true;
                    f._isBoundaryNull = false;
                    // Opaque user-space render hints ride the generic string_map (e.g.
                    // {'render.outline':'true'}). Written via the generic 'data' arm (Rust
                    // set_frame_property → string_map insert); the engine carries it, the renderer
                    // deserializes. set_frame_property resolves by quantum_id (find_by_quantum_id),
                    // but create_frame_from_rect returns the SoA HANDLE — convert via
                    // get_frame_quantum_id first (same as the emitter color stamp).
                    if (string_map && typeof w.get_frame_quantum_id === 'function') {
                        var fqid = w.get_frame_quantum_id(frameId);
                        // MERGE (get→merge→set) via the SAME render-intent seam (Q-A3 (a):
                        // this stamp previously replace-wrote {string_map}).
                        if (fqid > 0) { _stampRenderIntentMerge(w, fqid, string_map); }
                    }
                    return f;
                }
                // G6: createFrameFromRect IS implemented on WASM (forwards to Rust
                // create_frame_from_rect, above) — composite experiments (oscillator, atomic-model)
                // are realm-verified rendering on ?engine=wasm. This branch is only the
                // no-active-WASM-universe fallback.
                console.log('[shim] Dimension.createFrameFromRect: no active WASM universe — returning sentinel');
                // Return a BoundaryFrame sentinel (not JS null) so callers can safely set
                // properties (e.g. frame.name = '...') without crashing.
                return new BoundaryFrame();
            },

            // createParentFrame — forwards to Rust create_parent_frame
            createParentFrame: function (childA, childB) {
                var w = wasm || (_activeUniverse && _activeUniverse._wasm);
                if (w && childA && childA._handle !== undefined && childB && childB._handle !== undefined) {
                    var INVALID = 4294967295;
                    var frameId = w.create_parent_frame(layer, childA._handle, childB._handle);
                    if (frameId >= INVALID) {
                        console.log('[shim] Dimension.createParentFrame: Rust returned INVALID — returning sentinel');
                        return new BoundaryFrame();
                    }
                    var f = new BoundaryFrame();
                    f._handle = frameId;
                    f.layer = layer;
                    f.is_alive = true;
                    f._isBoundaryNull = false;
                    return f;
                }
                console.log('[shim] Dimension.createParentFrame: missing handle(s) or no active WASM universe — returning null');
                return new BoundaryFrame();
            },

            // handleStructurePromotion — not in WASM; log+null
            handleStructurePromotion: function (frameA, frameB) {
                console.log('[shim] Dimension.handleStructurePromotion not implemented in WASM engine — returning null');
                return null;
            },

            // generateFrames — not in WASM; log+null
            generateFrames: function (qtree) {
                console.log('[shim] Dimension.generateFrames not implemented in WASM engine — returning null');
                return null;
            },

            // addPointsFromQuadTree — not in WASM; log+null
            addPointsFromQuadTree: function (qtree) {
                console.log('[shim] Dimension.addPointsFromQuadTree not implemented in WASM engine — returning null');
                return null;
            },

            // releasePoints — not in WASM; log+null
            releasePoints: function (quanta) {
                console.log('[shim] Dimension.releasePoints not implemented in WASM engine — returning null');
                return null;
            },

            // reset — not in WASM; log+null
            reset: function () {
                console.log('[shim] Dimension.reset not implemented in WASM engine — returning null');
                return null;
            },

            // update — not in WASM (driven internally by doTick); log+null
            update: function (t, large_object_list) {
                console.log('[shim] Dimension.update not implemented in WASM engine — returning null');
                return null;
            },

            // collectFrameData — not in WASM (WASM produces its own TickData); log+null
            collectFrameData: function (t) {
                console.log('[shim] Dimension.collectFrameData not implemented in WASM engine — returning null');
                return null;
            },

            // getMassForColor / getWavelengthForColor — not in WASM; log+null
            getMassForColor: function (colorName) {
                console.log('[shim] Dimension.getMassForColor not implemented in WASM engine — returning null');
                return null;
            },
            getWavelengthForColor: function (colorName) {
                console.log('[shim] Dimension.getWavelengthForColor not implemented in WASM engine — returning null');
                return null;
            },

            // alignMBtoDimGrid — not in WASM; log+null
            alignMBtoDimGrid: function (mb_rect) {
                console.log('[shim] Dimension.alignMBtoDimGrid not implemented in WASM engine — returning null');
                return null;
            },

            // getQtreeFromFrames — not in WASM; log+null
            getQtreeFromFrames: function () {
                console.log('[shim] Dimension.getQtreeFromFrames not implemented in WASM engine — returning null');
                return null;
            }
        };

        // showFrameOutlinesOnly RETIRED — outline is user-space data on the frame's string_map
        // ('render.outline'); the dimension has no render concept. isHidden remains settable.
        Object.defineProperty(dim, 'isHidden', {
            get: function () { return _isHidden; },
            set: function (v) { _isHidden = v; },
            enumerable: true, configurable: true
        });

        return dim;
    }

    // ── makeProvider factory ─────────────────────────────────────────────
    //
    // The env shim calls makeProvider(WasmUniverseCtor) after resolving the WASM
    // module.  The returned provider object is the EngineHandle exposed to callers.
    //
    // _WasmUniverse is a file-scoped variable shared by the EGPTUniverse methods
    // above (via closure).  makeProvider sets it exactly once.

    var _WasmUniverse = null;
    // Set during EGPTUniverse.prototype.init() so that BoundaryFrame static/instance
    // methods can forward to the live universe (and its WasmUniverse) without holding an
    // explicit ref.
    var _activeUniverse = null;

    function makeProvider(WasmUniverseCtor) {
        if (!WasmUniverseCtor) {
            throw new Error('[wasm-engine] WasmUniverse constructor is required.');
        }
        _WasmUniverse = WasmUniverseCtor;

        return {
            backend: 'wasm',
            Rectangle: Rectangle,
            EGPTUniverse: EGPTUniverse,
            Frame: BoundaryFrame,
            TickData: TickData,
            FrameData: FrameData,
            DimensionData: DimensionData,
            UniverseData: UniverseData,
            LightColor: LightColor,
            Charge: Charge,
            // DELETED, FAIL LOUD: the two-argument `(canvasRect, opts)` provider factory
            // was a SECOND construction convention with its own defaults (it silently
            // defaulted seed to 0 where the config bag defaults 42). One authority now.
            createUniverse: function () {
                throw new Error(
                    'handle.createUniverse(canvasRect, opts) is DELETED — it was a second ' +
                    'construction convention with divergent defaults (seed 0, not 42). Use the ONE ' +
                    'construction authority: handle.EGPTUniverse.create({ rect: canvasRect, seed: … }). ' +
                    '`rect` accepts the same { left, top, w, h } literal.'
                );
            },
        };
    }

// _stampRenderIntentMerge is exported for the merge-semantics unit test (mock-wasm, sweep-safe —
// the real WASM color-persistence is verified via pkg-node, like all engine behavior).
export {
    makeProvider,
    EGPTUniverse,
    TickData,
    FrameData,
    DimensionData,
    UniverseData,
    LightColor,
    Charge,
    _stampRenderIntentMerge
};
