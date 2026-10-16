/* Copyright 2023-2026 by Essam Abadir */

/**
 * makeControlsForObject.js — the schema→controls FACTORY (WS Studio Controls
 * Realignment, Bite S2, "the factory spine").
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `makeControlsForObject(wrapper, ctx, opts)` → `{ kind, objectName, controls, display }`.
 *
 * Walks `ObjectSchema.get(kind).fields` (the property-bag authority,
 * `lib/frqtl/objects/schema/`) and mechanically emits ONE contract-legal control
 * descriptor per editable field (`lib/shim/controls` — the control-surface
 * authority) — never a hand-mirrored per-object control array. Each generated
 * control carries `bind:{object, prop}` (a `channel:'physics'` object bind,
 * resolved at execution time by `controlBind.js`'s `resolveBind`, this file's
 * sibling) — this factory NEVER synthesizes an `onChange` closure (see the
 * "no-onChange-synthesis" scope note below; it is a hard constraint, not an
 * oversight, and it is WHY several field types below are DISPLAY-ONLY rather
 * than live controls in this bite).
 *
 * @param {*} wrapper — the live object to introspect:
 *   - LargeObject/QuantumEmitter/PointSource/DetectorWall/SlitScreen/Box/OvenBox/
 *     CircuitGate/CircuitProbe/backdrop wrappers — a JS object carrying `_schemaKind`
 *     (kind is read off it automatically; `opts.kind` may still override).
 *   - a Frame — NOT an object; per the registry's own documented precedent
 *     (`lib/frqtl/objects/objects/controlBind.js` file docstring, "Registration
 *     precedent"), a Frame bind target is the bare QUANTUM_ID (a number, from
 *     `universe.getFrameQuantumId(handle)`). Pass the qid as `wrapper` and
 *     `opts.kind = 'Frame'` (required — a number has no `_schemaKind`).
 *   - the Universe singleton — pass ANY truthy placeholder as `wrapper` (unused)
 *     and `opts.kind = 'Universe'`; `objectName` resolves to the reserved
 *     `'universe'` sentinel automatically (matches `controlBind.js`'s
 *     `bind.object === 'universe'` dispatch branch) unless overridden.
 * @param {object} [ctx] — read-context, passed straight through to per-field
 *   live-value readers (NOT to `resolveBind` — that happens later, at dispatch
 *   time, when a host actually EXECUTES a generated control's bind):
 *     - `ctx.universe` — required when `kind === 'Frame'` (`getFrameProperty`).
 *     - `ctx.runner`   — required when `kind === 'Universe'` (`getUniverseProperty`).
 *   Every other kind reads its live value directly off `wrapper[field.name]`
 *   (LargeObject/QuantumEmitter/etc. wrappers are plain JS objects with their
 *   schema fields as properties — no ctx needed).
 * @param {object} [opts]
 *   - `opts.kind`   — override/supply the schema kind (REQUIRED for Frame/Universe).
 *   - `opts.name` / `opts.prefix` — the registry NAME this object is (or will be)
 *     registered under; used to build `id = "<name>.<field>"` and
 *     `bind.object = "<name>"`. `opts.prefix` wins if both are supplied.
 *     Falls back to `wrapper.name` (LargeObject/etc. often carry a `name` field)
 *     then to the `'universe'` sentinel for `kind === 'Universe'`; REQUIRED
 *     otherwise (FAIL-LOUD if nothing resolves — an unaddressable id is a
 *     factory bug, never silently guessed).
 *
 * @returns {{kind:string, objectName:string,
 *            controls:object[],   // normalized descriptors — ready for
 *                                  // registry.registerControls(objectName, controls)
 *            display:object[]}}   // NON-control passthrough entries — see below
 *
 * Every entry in `controls` has ALREADY been run through
 * `normalizeControlDescriptor` (fail-fast: a factory bug throws HERE, at
 * generation time, not later at registration time). `registry.registerControls`
 * re-normalizing them again is harmless (idempotent — normalize only validates
 * + copies) and is how the SAME arrow-legality precedent
 * (`lib/frqtl/objects/schema/index.js` importing `lib/shim/frame-data` directly,
 * see the "Arrow legality" note below) plays out for the controls contract too.
 *
 * `display` entries are NOT control descriptors — they never touch
 * `normalizeControlDescriptor` (there is no "display" kind in `ControlsSchema.KINDS`,
 * and inventing one would violate the closed-union discipline that contract
 * documents). Shape: `{id, label, fieldType, unit, value, description}`. A host
 * (Inspector, panel) renders these as read-only info rows — exactly how
 * `renderFieldControl`'s `'readonly'` branch already renders `<span>{val}</span>`
 * today (`lib/features/ide/AuthorView.jsx`) — this factory just makes the
 * SAME decision mechanically, off the schema, for every kind at once.
 *
 * ── Arrow legality (design §2.1 "Arrow condition") ───────────────────────────
 *
 * This file `require`s `lib/shim/controls/index.js` directly (Node) / reads
 * `window.ControlsSchema` (browser) — an `objects → shim/controls` edge.
 * Checked against `scripts/verify-arrows.mjs`: rule [A] (core-lib-skips-shim)
 * scopes ONLY `lib/features` + `lib/components`; `lib/frqtl/objects` is
 * explicitly annotated there as "user-space sugar — NOT a violation." Rule [B]
 * (engine-sniffing) doesn't apply (no `engine===` branches here). `verify:lib-acyclic`
 * likewise scopes `lib/components`/`lib/features`, not `lib/frqtl/objects`. This
 * exactly mirrors the PRE-EXISTING precedent one directory over —
 * `lib/frqtl/objects/schema/index.js` already `require`s
 * `lib/shim/frame-data/index.js` directly (see that file's own "Imports" comment
 * block) for the identical reason: a schema-contract dependency, not an engine
 * dependency. DEPENDENCY INJECTION (accepting `normalizeControlDescriptor` via
 * `ctx`/`opts` instead of importing it) was the escape hatch IF `verify-arrows`
 * rejected the import — it did not, so this file imports directly, same as its
 * schema/index.js precedent. (`make verify` run confirms — see the Bite S2
 * build report.)
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero physics. This is pure schema-introspection + descriptor-shape glue —
 * generating a control changes NOTHING about the simulation until a host
 * actually calls the generated control's `bind` through `resolveBind` (which
 * itself adds zero physics — see that file's own Layer 2 note). A
 * factory-generated control produces the IDENTICAL effect as hand-writing the
 * same `{kind, id, bind}` literal.
 *
 * ── Scope decisions this bite makes explicit (read before extending) ────────
 *
 * 1. NO onChange synthesis (dispatch constraint) — every live control's write
 *    path is `bind:{object, prop}` ONLY. This is SAFE for every numeric field
 *    (JSON/WASM round-trips a JS number losslessly either way) and safe for
 *    every STRING-valued enum/flags field (see #2) — but it is UNSAFE for two
 *    field shapes, which are therefore DISPLAY-ONLY in this bite, not scalar/
 *    enum live controls (documented per-branch below, not silently degraded):
 *      (a) a `boolean`-typed field with `engineVisible !== false` — its value
 *          reaches the engine ABI via `setFrameProperty`'s
 *          `JSON.stringify(value)` (or the WASM LargeObject ABI equivalent);
 *          Rust's serde expects a JSON `true`/`false` literal for a `bool`
 *          field, not a number — a bare 0/1 scalar-fold passthrough (the
 *          shape `SphereEmitter.controls`'s scalar rows use, but THAT control
 *          uses an explicit `onChange: v => self.setActive(!!v)` coercion,
 *          which this factory is forbidden from synthesizing) risks writing
 *          the wrong wire type. `engineVisible:false` booleans (LargeObject/
 *          backdrop `.visible`, `.drawAsCircle`) are UNAFFECTED — their write
 *          path is a bare `lo[prop] = value` JS assignment (confirmed against
 *          every consumer: `p5-provider.js`/`FrqtlApp.hitTest` all
 *          check `=== false` or truthiness, never `=== true`) — numeric 0/1
 *          is safe there, so those DO become live scalar controls.
 *      (b) an `enum`/`enum-set` field whose `constraint.values` is NOT an
 *          IDENTITY map (key === value for every key) — e.g.
 *          `SlitScreen.detectAtSlits: {NONE:0, DETECT_RANDOM_XY:1, DETECT_MARK:2}`,
 *          the ONE such field in the whole schema (verified exhaustively at
 *          build time). A bind-driven enum control's `value`/`values` must be
 *          STRINGS (`ControlsSchema._validateEnum`); writing the string KEY
 *          back through a bare bind would write `'NONE'` into a field the
 *          engine expects as the NUMBER `0`. Needs either an onChange
 *          translator (forbidden here) or a `resolveBind`-side value-mapping
 *          extension — an architect decision, not a factory guess.
 *    Both are named, tested exceptions — NOT a silent drop. See
 *    `_booleanHandler`/`_enumHandler`/`_flagsHandler`/`_writableHandler` below.
 * 2. `rect-array` fields (`QuantumEmitter.source_rects`) become N DISPLAY
 *    entries, one per array item — NOT N live vector controls. The `bind`
 *    contract (`lib/shim/controls` `BIND_KEYS = ['object','prop']`) has no
 *    array-index addressing; a correct per-entry live write needs either
 *    `bind.index` (a shim-contract extension) or an onChange closure
 *    (forbidden). Flagged per-entry in the `description` field, and in the
 *    Bite S2 build report for S3/S4/architect follow-up.
 * 3. `QuantumEmitter`/`PointSource`'s singular `rect` field has NO live getter
 *    on the wrapper today (a PRE-EXISTING gap — `AuthorView.jsx`'s current
 *    Inspector reads `obj['rect']` too and gets the identical `undefined`).
 *    `FIELD_VALUE_OVERRIDES` derives a best-effort INITIAL value
 *    (`source_rects[0]` / `[x-d/2, y-d/2, d, d]`) so the generated `vector`
 *    control still has something to show; when even that isn't derivable, the
 *    field is a DEFINED SKIP (no control generated at all) — never a
 *    fabricated read (mirrors `controlBind.js`'s own "defined skip" discipline).
 * 4. The "coupled emitter move" op (design §2.2's coder finding — dragging an
 *    emitter is TWO writes today, LO rect + emitter sub-rect) has NO factory
 *    support yet — TODO for S4: a composite-move op or two coupled `vector`
 *    controls sharing one drag gesture. This factory generates each field's
 *    control independently; it does not know about cross-field coupling.
 * 5. Behavior-lowering fields (`collision_type`, `actions` — compiled to an
 *    op-program at REGISTRATION by `actionCompiler.js`, `engineVisible:false`)
 *    DO get live `enum`/`flags` controls here (their values are identity-mapped
 *    strings, safe per #1's rule) — but per design §2.3.5, a live edit only
 *    mutates the RENDER-layer JS wrapper mirror; it does NOT recompile/repush
 *    the running op-program. That gap is CEO call #7's `recompile` write class,
 *    explicitly deferred to S4 — this factory does not attempt it.
 * 6. **Bind-executable-kind gate (S3, architect ruling `ruling_studio_controls_
 *    s2_factory.md` watch-out #1 — MANDATORY, closes an S2-documented KNOWN
 *    GAP).** `controlBind.js`'s `resolveBind` only EXECUTES a bind for a
 *    registry-resolved kind in `{Frame, LargeObject, backdrop}`, plus the
 *    `bind.object === 'universe'` sentinel (this factory's `kind === 'Universe'`)
 *    — it FAILS LOUD for every other kind (`QuantumEmitter`, `Box`, `OvenBox`,
 *    `DetectorWall`, `SlitScreen`, `CircuitGate`, `CircuitProbe`, `PointSource`,
 *    `Tube`, `EgptFractal`, …) because there is no real
 *    accessor path from a bare `{object,prop}` pair to that object's actual
 *    state — a `QuantumEmitter`'s real state lives in `emState`/`_specTemplate`
 *    (mutated only via `setVelocity`/`setBurstSize`/…), and a composite like
 *    `Box` exposes CONVENIENCE fields (`width`, `height`, …) that require
 *    rebuilding multiple walls, not a bare property set. A host (Studio's
 *    Inspector, the page-level panel) that registers this factory's output and
 *    resolves binds against it MUST NEVER be handed a control descriptor whose
 *    bind is GUARANTEED to throw — an object of a non-bind-executable kind
 *    sitting in the scene must not break the whole panel just by existing.
 *    So: for ANY kind outside `BIND_EXECUTABLE_KINDS`, every field is demoted
 *    to a DISPLAY entry — never a live control — regardless of what its
 *    per-field `TYPE_DISPATCH` handler would otherwise produce. This is a
 *    per-KIND gate (applied once, after the per-field handler runs), not a
 *    per-field one — it sits at the SAME "safe live-write path, or a
 *    documented display passthrough" grain as the existing boolean/enum
 *    per-field demotions (scope notes #1(a)/#1(b) above), just scoped to the
 *    whole object instead of one field. See `_demoteToDisplay` below.
 *
 * ── Module format: CLASSIC dual CommonJS/window (matches this directory's
 *    siblings — controlBind.js, frqtl-controls-panel.js, Tube.js) ─────────────
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — see Wall.js, LargeObject.js
//    and 24 more siblings). Every declaration below is PRIVATE to this file; the ONLY
//    thing that reaches the shared browser global scope is the explicit window.<NS>
//    assignment at the bottom. Classic <script> tags share ONE global lexical scope,
//    so an unwrapped top-level 'function _label(...)' here would silently OVERWRITE a
//    same-named helper in a sibling script (and vice-versa) — a collision that is
//    invisible to 'node --test' by construction, because Node gives each file its own
//    module scope. Enforced by lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

// ── Nullable-override sentinel (W0-D, CEO 2026-07-23) ───────────────────────────
// A LIVE per-leaf render-intent OVERRIDE field (SphereEmitter.renderShape,
// .renderColor) defaults to NULL — "no key, byte-identical, scheme-driven default"
// (the SU1 guarantee: a non-null default would stamp every leaf and move a golden).
// Its control must still be EDITABLE (the CEO's "renderShape/Color is not changeable
// in the Inspector" defect), so a null-valued live override renders a control seeded
// with this reserved sentinel meaning "unset / scheme default". The consuming
// Inspector maps the sentinel BACK to null on write (AuthorView commitField/
// commitEmitterField), so the descriptor's own vocab (constraint.values) stays the
// ONE owner and the null-byte-identity is preserved. Exposed on the exported
// namespace so the host reads ONE definition (never a hand-copied magic string).
var NULL_ENUM_SENTINEL = '(default)';

// ── Imports (lazy-guarded, mirrors controls/registry.js's own precedent) ────

var _ObjectSchemaNode = null;
var _ControlsSchemaNode = null;

if (typeof module !== 'undefined' && module.exports) {
    var path = require('path');
    _ObjectSchemaNode = require(path.resolve(__dirname, '../schema/index.js')).ObjectSchema;
    _ControlsSchemaNode = require(path.resolve(__dirname, '../../../shim/controls/index.js'));
}

function _getObjectSchema() {
    if (_ObjectSchemaNode) { return _ObjectSchemaNode; }
    if (typeof window !== 'undefined' && window.ObjectSchema) { return window.ObjectSchema; }
    throw new Error('[makeControlsForObject] ObjectSchema not available. In the browser, ensure ' +
        'lib/frqtl/objects/schema/index.js is loaded before this file. (FAIL-LOUD.)');
}

function _getControlsSchema() {
    if (_ControlsSchemaNode) { return _ControlsSchemaNode; }
    if (typeof window !== 'undefined' && window.ControlsSchema) { return window.ControlsSchema; }
    throw new Error('[makeControlsForObject] ControlsSchema not available. In the browser, ensure ' +
        'lib/shim/controls/index.js is loaded before this file. (FAIL-LOUD.)');
}

// ── Default-bounds policy (dispatch condition: "never emit an unbounded ──────
//    slider and never invent silent magic numbers without documenting them") ─
//
// Precedence per numeric field: `widgetConfig.{min,max,step}` (explicit,
// deliberate author override — the pre-existing `OvenBox.temperature`/
// `Universe.wavelengthScale` pattern) > `constraint.{min,max}` (schema-
// declared bound) > the DEFAULT below. Only ~40% of number fields declare a
// `max` at all (verified at build time) — most physics-pixel/position/velocity
// fields are genuinely open-ended, so an unbounded-slider default is not
// acceptable (dispatch condition) and a fixed universal constant would be
// meaningless across wildly different field magnitudes (a wall's `left` vs. a
// `windowTicks` count). The chosen default SCALES WITH THE FIELD'S OWN CURRENT
// VALUE, exactly mirroring the ONE pre-existing precedent for an un-annotated
// bounded slider in this codebase — `SphereEmitter.controls`'s
// `burstSize` row (`max: 200`, lib/frqtl/objects/setup/setupSphereEmitter3D.js).
// DEFAULT_MAX_FLOOR=40 is that SAME constant, reused for consistency, not
// invented fresh.
var DEFAULT_MAX_FLOOR = 40;

function _isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

/**
 * Resolve {min, max, step} for a scalar numeric field, per the precedence above.
 * `min` defaults to a SYMMETRIC `-max` when `constraint.min` is not declared
 * (covers signed fields — velocities, positions that may go negative — the
 * majority of the schema's `min`-less number fields, verified at build time).
 */
function _resolveBounds(field, value) {
    var c = field.constraint || {};
    var wc = field.widgetConfig || {};
    var base = _isFiniteNum(value) ? Math.abs(value) : 0;
    var max = (typeof wc.max === 'number') ? wc.max
        : (typeof c.max === 'number') ? c.max
            : Math.max(base * 3, DEFAULT_MAX_FLOOR);
    var min = (typeof wc.min === 'number') ? wc.min
        : (typeof c.min === 'number') ? c.min
            : -max;
    var step = (typeof wc.step === 'number') ? wc.step
        : (c.integer ? 1 : Math.max(max / 100, 0.01));
    return { min: min, max: max, step: step };
}

function _label(field) {
    // An optional display `label` (Bite 5b) overrides the field NAME for the
    // control's shown label WITHOUT renaming the schema field (the codegen/capture
    // key stays `field.name`). e.g. leafDimension → "Emit Dimension", the global
    // shape capability → "Default Shape". Absent → the name, as before (byte-identical).
    var base = (typeof field.label === 'string' && field.label) ? field.label : field.name;
    return field.unit ? (base + ' (' + field.unit + ')') : base;
}

function _scalarFmt(field) {
    var integer = !!(field.constraint && field.constraint.integer);
    return function (v) { return integer ? String(Math.round(v)) : Number(v).toFixed(2); };
}

// ── Live-value reading (kind-dependent — see file docstring @param ctx) ─────

// FIELD_VALUE_OVERRIDES — see scope note #3 above.
var FIELD_VALUE_OVERRIDES = {
    QuantumEmitter: {
        rect: function (w) {
            return (w && Array.isArray(w.source_rects) && w.source_rects[0])
                ? w.source_rects[0].slice()
                : undefined;
        }
    },
    PointSource: {
        rect: function (w) {
            if (!w || !_isFiniteNum(w.x) || !_isFiniteNum(w.y) || !_isFiniteNum(w.diameter)) { return undefined; }
            var d = w.diameter;
            return [w.x - d / 2, w.y - d / 2, d, d];
        }
    },
    // SphereEmitter (Bite 4b): `rect` is the WRITE-ONLY reposition adapter — its
    // direct getter is undefined (so captureProps skips it; `center` is the captured
    // position authority). Seed the Inspector's live rect vector from `center` so the
    // field still shows/edits a position (edit → updateObjectProperty → setCenter).
    SphereEmitter: {
        rect: function (w) {
            var c = w && w.center;
            if (!Array.isArray(c) || !_isFiniteNum(c[0]) || !_isFiniteNum(c[1])) { return undefined; }
            var D = 24; // marker diameter (matches the ObjectFactory SphereEmitter builder)
            return [c[0] - D / 2, c[1] - D / 2, D, D];
        }
    }
};

function _readValue(env, propName) {
    var kind = env.kind, wrapper = env.wrapper, ctx = env.ctx;
    if (kind === 'Frame') {
        if (!ctx.universe || typeof ctx.universe.getFrameProperty !== 'function') {
            throw new Error('[makeControlsForObject] kind="Frame" requires ctx.universe ' +
                '(getFrameProperty) to read live field values. (FAIL-LOUD.)');
        }
        try { return ctx.universe.getFrameProperty(wrapper, propName); }
        catch (e) { return undefined; } // defined skip — mirrors controlBind.js's own discipline
    }
    if (kind === 'Universe') {
        if (!ctx.runner || typeof ctx.runner.getUniverseProperty !== 'function') {
            throw new Error('[makeControlsForObject] kind="Universe" requires ctx.runner ' +
                '(getUniverseProperty) to read live field values. (FAIL-LOUD.)');
        }
        try { return ctx.runner.getUniverseProperty(propName); }
        catch (e) { return undefined; }
    }
    var overrides = FIELD_VALUE_OVERRIDES[kind];
    if (overrides && typeof overrides[propName] === 'function') { return overrides[propName](wrapper); }
    return (wrapper && typeof wrapper === 'object') ? wrapper[propName] : undefined;
}

// ── Display-passthrough entries (readonly/forbidden/string/object/deferred) ──

function _displayEntry(field, env) {
    var value;
    try { value = _readValue(env, field.name); } catch (e) { value = undefined; }
    return {
        kind: 'display',
        entries: [{
            id: env.objectName + '.' + field.name,
            label: _label(field),
            fieldType: field.type,
            unit: field.unit || null,
            value: value,
            description: field.description || ''
        }]
    };
}

// ── Per-field-type handlers ──────────────────────────────────────────────────
// TYPE_DISPATCH is the EXHAUSTIVE map — every field.type value that can appear
// in ObjectSchema MUST have an entry here (even if that entry's action is a
// documented display/skip). An unrecognized type throws (see the main loop) —
// this is the fail-loud gate the conformance suite drives its exhaustiveness
// check off of (never a hardcoded type list re-derived in the test file).

function _numberHandler(field, env) {
    var value = _readValue(env, field.name);
    if (!_isFiniteNum(value)) { return null; } // defined skip — no live value to seed the slider
    var b = _resolveBounds(field, value);
    return {
        kind: 'control',
        descriptor: {
            kind: 'scalar', id: env.objectName + '.' + field.name, label: _label(field),
            min: b.min, max: b.max, step: b.step, value: value,
            fmt: _scalarFmt(field),
            bind: { object: env.objectName, prop: field.name }
        }
    };
}

/** See scope note #1(a) above for the engineVisible:true branch's rationale. */
function _booleanHandler(field, env) {
    if (field.engineVisible !== false) { return _displayEntry(field, env); }
    var value = _readValue(env, field.name);
    if (value === undefined || value === null) { return null; }
    return {
        kind: 'control',
        descriptor: {
            kind: 'scalar', id: env.objectName + '.' + field.name, label: _label(field),
            min: 0, max: 1, step: 1, value: value ? 1 : 0,
            fmt: function (v) { return v ? 'true' : 'false'; },
            bind: { object: env.objectName, prop: field.name }
        }
    };
}

/** Every key must equal its own value (see scope note #1(b)). */
function _isIdentityValuesMap(valuesObj) {
    var keys = Object.keys(valuesObj);
    for (var i = 0; i < keys.length; i++) {
        if (valuesObj[keys[i]] !== keys[i]) { return false; }
    }
    return true;
}

function _enumHandler(field, env) {
    var valuesObj = (field.constraint && field.constraint.values) || {};
    if (!_isIdentityValuesMap(valuesObj)) { return _displayEntry(field, env); }
    var keys = Object.keys(valuesObj);
    var value = _readValue(env, field.name);
    if (typeof value !== 'string' || keys.indexOf(value) === -1) {
        // W0-D (CEO 2026-07-23): a LIVE enum whose value is null/unset — the
        // SphereEmitter.renderShape override, kept null for byte-identity (SU1) — still
        // renders an EDITABLE control, seeded with the '(default)' sentinel option
        // representing "unset / scheme default". Picking a real key writes the string
        // (the existing updateObjectProperty → applyProp → setRenderShape path); the
        // Inspector maps the sentinel back to null. A NON-live null enum keeps the
        // pre-existing skip (byte-identical — the sentinel only serves nullable LIVE
        // overrides, never a required enum like collision_type which is always valued).
        if (field.live !== true) { return null; }
        return {
            kind: 'control',
            descriptor: {
                kind: 'enum', id: env.objectName + '.' + field.name, label: _label(field),
                values: [NULL_ENUM_SENTINEL].concat(keys), value: NULL_ENUM_SENTINEL,
                fmt: function (v) { return v; },
                bind: { object: env.objectName, prop: field.name }
            }
        };
    }
    return {
        kind: 'control',
        descriptor: {
            kind: 'enum', id: env.objectName + '.' + field.name, label: _label(field),
            values: keys, value: value,
            fmt: function (v) { return v; },
            bind: { object: env.objectName, prop: field.name }
        }
    };
}

function _flagsHandler(field, env) {
    var valuesObj = (field.constraint && field.constraint.values) || {};
    if (!_isIdentityValuesMap(valuesObj)) { return _displayEntry(field, env); }
    var keys = Object.keys(valuesObj);
    var value = _readValue(env, field.name);
    if (!Array.isArray(value)) { return null; }
    return {
        kind: 'control',
        descriptor: {
            kind: 'flags', id: env.objectName + '.' + field.name, label: _label(field),
            values: keys, value: value.slice(),
            fmt: function (v) { return Array.isArray(v) ? v.join(', ') : String(v); },
            bind: { object: env.objectName, prop: field.name }
        }
    };
}

// The "unset / scheme default" swatch a null-valued LIVE rgb override seeds its
// editable control with (W0-D2). White = a neutral "no tint" placeholder; the
// override is genuinely UNSET (scheme-driven fullness→ROYGBIV) until the user picks
// a color, at which point setRenderColor stamps the chosen [r,g,b]. (A true
// "return to unset" gesture needs a companion clear affordance — out of the minimal
// scope; see the W0-D2 note in the deliverable.)
var NULL_RGB_DEFAULT_SWATCH = [255, 255, 255];

/**
 * Is `value` acceptable for `field`'s DECLARED type? The predicate is the schema owner's
 * write-time normalizer (`ObjectSchema.normalizeValue`, throw-or-apply) run as a probe —
 * never a second hand-written per-type test here. A read-side seeding decision and a
 * write-side gate must agree by construction, so there is exactly one implementation.
 */
function _isValidForField(field, value, kind) {
    // `null`/`undefined` is a legal WRITE everywhere ("unset" — the normalizer passes it
    // through by contract), but it can never SEED a control: there is no live value to
    // show. So the READ-side probe treats it as not-usable and the caller falls to its
    // own unset branch.
    if (value === null || value === undefined) { return false; }
    try { _getObjectSchema().normalizeValue(field, value, kind); return true; }
    catch (e) { return false; }
}

function _rgbHandler(field, env) {
    var value = _readValue(env, field.name);
    var isValid = _isValidForField(field, value, env.kind);
    if (!isValid) {
        // W0-D2 (CEO 2026-07-23): a LIVE rgb override whose value is null/unset — the
        // SphereEmitter.renderColor override, kept null for byte-identity (SU1) — still
        // renders an EDITABLE color control seeded with the neutral default swatch, so
        // the field is not a dead "–" in the Inspector. Picking a color writes [r,g,b]
        // (updateObjectProperty → applyProp → setRenderColor). A NON-live null rgb keeps
        // the pre-existing skip (byte-identical — same discipline as the enum branch).
        if (field.live !== true) { return null; }
        value = NULL_RGB_DEFAULT_SWATCH;
    }
    return {
        kind: 'control',
        descriptor: {
            kind: 'vector', id: env.objectName + '.' + field.name, label: _label(field),
            value: value.slice(), min: [0, 0, 0], max: [255, 255, 255], step: [1, 1, 1],
            widgetHint: 'color',
            fmt: function (v) { return 'rgb(' + v.map(function (n) { return Math.round(n); }).join(',') + ')'; },
            bind: { object: env.objectName, prop: field.name }
        }
    };
}

// Fixed component-name ORDER (LO z/depth wire contract — z is THIRD, not last:
// [left, top, z, w, h, d]). Position components (left/top/z) may be signed;
// size components (w/h/d) are non-negative — this drives the per-component
// min/max policy below.
var RECT4_KEYS = ['left', 'top', 'w', 'h'];
var RECT6_KEYS = ['left', 'top', 'z', 'w', 'h', 'd'];

function _rectComponentBounds(keys, values) {
    var mins = [], maxs = [], steps = [];
    for (var i = 0; i < keys.length; i++) {
        var isSize = (keys[i] === 'w' || keys[i] === 'h' || keys[i] === 'd');
        var v = values[i];
        var m = Math.max(Math.abs(_isFiniteNum(v) ? v : 0) * 3, DEFAULT_MAX_FLOOR);
        maxs.push(m);
        mins.push(isSize ? 0 : -m);
        steps.push(1);
    }
    return { min: mins, max: maxs, step: steps };
}

/**
 * `rect` → `vector`. Tuple length (4 vs 6) is derived from the LIVE current
 * value, NOT a static schema flag — a LargeObject's `.rect` is a plain object
 * `{left,top,w,h}` OR `{left,top,z,w,h,d}` depending on what was actually
 * passed at CONSTRUCTION time (`LargeObject.js`) — genuinely per-INSTANCE, not
 * per-kind. This matches the `vector` kind's own "length is free" contract
 * (`lib/shim/controls/index.js` doc comment).
 */
function _rectHandler(field, env) {
    var raw = _readValue(env, field.name);
    var arr = null, keys = RECT4_KEYS;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        var hasZD = ('z' in raw) && ('d' in raw);
        keys = hasZD ? RECT6_KEYS : RECT4_KEYS;
        arr = keys.map(function (k) { return raw[k]; });
    } else if (Array.isArray(raw)) {
        keys = (raw.length === 6) ? RECT6_KEYS : RECT4_KEYS;
        arr = raw.slice();
    }
    if (!arr || arr.length === 0 || !arr.every(_isFiniteNum)) { return null; } // defined skip
    var b = _rectComponentBounds(keys, arr);
    return {
        kind: 'control',
        descriptor: {
            kind: 'vector', id: env.objectName + '.' + field.name, label: _label(field),
            value: arr, min: b.min, max: b.max, step: b.step,
            fmt: function (v) { return '[' + v.map(function (n) { return Math.round(n); }).join(', ') + ']'; },
            bind: { object: env.objectName, prop: field.name }
        }
    };
}

/** See scope note #2 above — DISPLAY entries, one per array item, never a live control. */
function _rectArrayHandler(field, env) {
    var arr = _readValue(env, field.name);
    if (!Array.isArray(arr) || arr.length === 0) { return null; }
    var entries = [];
    for (var i = 0; i < arr.length; i++) {
        var r = arr[i];
        if (!Array.isArray(r)) { continue; }
        entries.push({
            id: env.objectName + '.' + field.name + '[' + i + ']',
            label: _label(field) + ' [' + i + ']',
            fieldType: 'rect-array-entry',
            unit: field.unit || null,
            value: r.slice(),
            description: (field.description || '') +
                ' (DISPLAY ONLY — the bind contract {object,prop} has no array-index ' +
                'addressing; a live per-entry write needs either bind.index, a shim-contract ' +
                'extension, or an onChange closure, forbidden this bite. See ' +
                'makeControlsForObject.js\'s module docstring, scope note #2.)'
        });
    }
    return entries.length ? { kind: 'display', entries: entries } : null;
}

function _readonlyHandler(field, env) { return _displayEntry(field, env); }
function _forbiddenHandler(field, env) { return _displayEntry(field, env); }
function _stringHandler(field, env) { return _displayEntry(field, env); }
function _objectHandler(field, env) { return _displayEntry(field, env); }

/**
 * `writable` (Frame kind ONLY) — this schema type is an ACCESS-LEVEL tag, not
 * a value-type tag (unlike 'number'/'boolean'/'string' on every other kind,
 * which ARE value-typed). x/y/z/vx/vy/vz/mass/speed_prob/local_time are
 * numbers; is_alive/is_stationary/wrap are booleans; charge is a string;
 * data is an object — all declared `type:'writable'`. This handler infers the
 * actual JS value type from the LIVE read and re-dispatches accordingly.
 */
function _writableHandler(field, env) {
    var value = _readValue(env, field.name);
    if (value === undefined) { return null; } // defined skip
    if (typeof value === 'number') { return _numberHandler(field, env); }
    if (typeof value === 'boolean') {
        // Frame's writable booleans are ALWAYS engineVisible:true and reach the
        // engine ABI via setFrameProperty's JSON.stringify — same coercion risk
        // as the dedicated 'boolean' handler's engineVisible:true branch (scope
        // note #1(a)). DISPLAY ONLY.
        return _displayEntry(field, env);
    }
    // string (charge — no declared candidate-values set to build a safe 'enum'
    // from) or object (the data bubble — an arbitrary bag) — neither has a
    // live-control shape without inventing behavior the schema doesn't declare.
    return _displayEntry(field, env);
}

var TYPE_DISPATCH = {
    number: _numberHandler,
    boolean: _booleanHandler,
    enum: _enumHandler,
    'enum-set': _flagsHandler,
    rgb: _rgbHandler,
    rect: _rectHandler,
    'rect-array': _rectArrayHandler,
    readonly: _readonlyHandler,
    forbidden: _forbiddenHandler,
    string: _stringHandler,
    object: _objectHandler,
    writable: _writableHandler
};

// ── Bind-executable-kind gate (see module docstring scope note #6) ──────────
//
// The EXACT set of kinds `controlBind.js`'s `resolveBind` can execute a bind
// against: the three registry-resolved kinds it dispatches on
// (`Frame`, `LargeObject`, `backdrop`) plus `Universe` (this factory's own
// `kind === 'Universe'` — resolved through the `bind.object === 'universe'`
// reserved sentinel, never a registry lookup). Kept as a literal, minimal
// mirror of `resolveBind`'s own three-way dispatch + the sentinel branch —
// NOT re-derived from `ObjectSchema.kinds()` (that list is open-ended and
// growing; this one is closed by what `resolveBind` can actually execute).
var BIND_EXECUTABLE_KINDS = Object.freeze(['Frame', 'LargeObject', 'backdrop', 'Universe']);

/**
 * Demote an already-generated 'control' result to a 'display' result — used
 * ONLY when `env.kind` is outside `BIND_EXECUTABLE_KINDS` (scope note #6).
 * Reuses the descriptor's ALREADY-COMPUTED `id`/`label`/`value` (no second
 * live-value read — the handler already did that work; demoting never
 * re-derives it) so the demoted row shows the exact same value a live control
 * would have shown.
 */
function _demoteToDisplay(field, env, result) {
    var d = result.descriptor;
    return {
        kind: 'display',
        entries: [{
            id: d.id,
            label: d.label,
            fieldType: field.type,
            unit: field.unit || null,
            value: d.value,
            description: (field.description || '') +
                ' (DISPLAY ONLY — kind "' + env.kind + '" is not in controlBind.js\'s bind-execution ' +
                'allowlist {Frame, LargeObject, backdrop, Universe}; resolveBind FAILS LOUD for any ' +
                'other kind rather than silently no-op through an accessor path that would not reach ' +
                'this object\'s real state. Demoted per the S3 architect gate — see ' +
                '.claude/agent-memory/frqtl-architect/ruling_studio_controls_s2_factory.md watch-out #1.)'
        }]
    };
}

// ── Conditional visibility (Collision LEXICON v2, architect §1b) ────────────────
//
// ONE declarative `visibleWhen` predicate + ONE evaluator — the general substrate for a
// field that shows only when a SIBLING field holds a value (bounceDirection only for a
// bounce wall; angle/decoherence only for a random bounce; markTag only when the mark
// hook is set). Evaluated LIVE against the current captured props (NOT baked at generation
// time), so picking 'bounce' reveals bounceDirection immediately. Orthogonal to
// `internal:true` (always-hide): `internal` is a never-show, `visibleWhen` is a
// conditional-show — the two are never folded. Shape:
//   { field:'collisionBehavior', equals:'bounce' }   — sibling equals a value
//   { field:'hooks', includes:'mark' }               — sibling enum-set contains a member
//   [ {…}, {…} ]                                      — ARRAY = AND (the nested case)
function evalVisibleWhen(field, props) {
    var vw = field && field.visibleWhen;
    if (!vw) { return true; }
    var conds = Array.isArray(vw) ? vw : [vw];
    for (var i = 0; i < conds.length; i++) {
        var c = conds[i];
        var v = (props && typeof props === 'object') ? props[c.field] : undefined;
        if (c.equals !== undefined) { if (v !== c.equals) { return false; } }
        else if (c.includes !== undefined) { if (!Array.isArray(v) || v.indexOf(c.includes) === -1) { return false; } }
        // `present` (emission-gate contract §2): the field shows iff the referenced
        // field is set (non-null) — e.g. gateCounter only once emissionCap is declared.
        else if (c.present !== undefined) { if ((v != null) !== !!c.present) { return false; } }
        // `truthy` (R2AX two-axis mirror, 2026-07-26): the field shows iff the referenced
        // field is truthy — e.g. pitchDeg only on a 3D wall (depth > 0; a 2D wall's derived
        // depth is 0, which `present` cannot distinguish). The ONE evaluator, extended
        // additively like `present` before it.
        else if (c.truthy !== undefined) { if (!!v !== !!c.truthy) { return false; } }
    }
    return true;
}

// ── The factory ───────────────────────────────────────────────────────────────

/**
 * @see file docstring for the full contract.
 */
function makeControlsForObject(wrapper, ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};

    var ObjectSchemaRef = _getObjectSchema();
    var normalizeControlDescriptor = _getControlsSchema().normalizeControlDescriptor;

    var kind = opts.kind ||
        (wrapper && typeof wrapper === 'object' && wrapper._schemaKind) ||
        null;
    if (!kind) {
        throw new Error('[makeControlsForObject] cannot determine object kind — pass opts.kind, or a ' +
            'wrapper object with a "_schemaKind" property (every LargeObject/QuantumEmitter/etc. sets ' +
            'this at construction). A bare Frame quantum_id (a number) or the Universe singleton has no ' +
            '"_schemaKind" — opts.kind is REQUIRED for those. (FAIL-LOUD.)');
    }
    var descriptor = ObjectSchemaRef.get(kind);
    if (!descriptor) {
        throw new Error('[makeControlsForObject] ObjectSchema has no descriptor for kind "' + kind +
            '". (FAIL-LOUD.)');
    }

    var objectName = opts.prefix || opts.name ||
        (kind === 'Universe' ? 'universe' : null) ||
        (wrapper && typeof wrapper === 'object' ? wrapper.name : null) ||
        null;
    if (!objectName) {
        throw new Error('[makeControlsForObject] cannot determine the registry object name (used to ' +
            'prefix every generated control id "<objectName>.<field>" and to build bind.object) — pass ' +
            'opts.name (or opts.prefix). (FAIL-LOUD.)');
    }

    var env = { kind: kind, wrapper: wrapper, ctx: ctx, opts: opts, objectName: objectName };

    var controls = [];
    var display = [];

    for (var i = 0; i < descriptor.fields.length; i++) {
        var field = descriptor.fields[i];
        // ── Designer-internal fields (W1 tweak T3) ───────────────────────────
        // `internal:true` (the ONE authority, a descriptor flag — NOT a hardcoded
        // field-name list) marks an ENGINE INTERNAL that must never surface as a
        // designer control/display (e.g. LargeObject.program's raw op-program AST,
        // the derived op-program-scope geometry accessors). Skipped entirely here —
        // no control, no display row. Still engineVisible + captured for codegen.
        if (field.internal === true) { continue; }
        var handler = TYPE_DISPATCH[field.type];
        if (!handler) {
            throw new Error('[makeControlsForObject] unmapped field.type "' + field.type + '" on kind "' +
                kind + '" field "' + field.name + '" — every ObjectSchema field.type must have an ' +
                'explicit TYPE_DISPATCH entry in makeControlsForObject.js (even a documented display/skip). ' +
                '(FAIL-LOUD — never a silent drop.)');
        }
        // ── Explicit per-field LIVE attribute (Bite 4b) ──────────────────────
        // `live:false` → a read-only DISPLAY row regardless of type (boot-level /
        // reload-to-change / derived fields — SphereEmitter's is2D, fundamentalDimension,
        // emissionBox, …). captureProps STILL captures the value; the Inspector just
        // renders it read-only. A field with NO `live` attribute keeps the pre-existing
        // behavior EXACTLY (undefined !== false / !== true → both new branches no-op),
        // so every existing kind is byte-identical.
        if (field.live === false) {
            display = display.concat(_displayEntry(field, env).entries);
            continue;
        }
        var result = handler(field, env);
        if (!result) { continue; } // documented, deliberate skip (e.g. no live value to seed a control)
        // `live:true` EXEMPTS from the bind-executable demotion: the consuming
        // Inspector / cross-context registry writes this field via
        // updateObjectProperty(wrapper, prop, v) (mechanism A → the kind's own
        // updateObjectProperty branch — e.g. SphereEmitter → control setter), NEVER
        // resolveBind, so the bind-executable allowlist does not apply. Without an
        // explicit `live:true`, the pre-existing demotion stands (S3 gate, scope
        // note #6) — this object's kind has no working resolveBind path.
        if (result.kind === 'control' && field.live !== true && BIND_EXECUTABLE_KINDS.indexOf(kind) === -1) {
            result = _demoteToDisplay(field, env, result);
        }
        // Pass `visibleWhen` THROUGH onto the emitted entry (architect §1b) — a live,
        // sibling-dependent RENDER concern the Inspector evaluates at render time; NOT a
        // generation-time skip (unlike internal:true). Attached AFTER normalization so the
        // control descriptor's own contract is unchanged (normalize never sees it).
        if (result.kind === 'display') {
            if (field.visibleWhen) { result.entries.forEach(function (e) { e.visibleWhen = field.visibleWhen; }); }
            display = display.concat(result.entries);
        } else if (result.kind === 'control') {
            var norm = normalizeControlDescriptor(result.descriptor);
            if (field.visibleWhen) { norm.visibleWhen = field.visibleWhen; }
            controls.push(norm);
        }
    }

    return { kind: kind, objectName: objectName, controls: controls, display: display };
}

// ── Export ────────────────────────────────────────────────────────────────────

var MakeControlsForObject = {
    makeControlsForObject: makeControlsForObject,
    // The ONE conditional-visibility evaluator (Collision LEXICON v2, architect §1b) —
    // the AuthorView Inspector filter calls THIS beside its existing internal-field drop,
    // never a hand-rolled per-field branch.
    evalVisibleWhen: evalVisibleWhen,
    // W0-D: the reserved "unset / scheme default" sentinel a nullable LIVE enum
    // override control is seeded with. The ONE definition — the host (AuthorView
    // Inspector commit) reads THIS to map the sentinel back to null on write, never
    // a hand-copied magic string.
    NULL_ENUM_SENTINEL: NULL_ENUM_SENTINEL,
    // Exposed for the exhaustiveness conformance test — driven off THIS list,
    // never a hand-copied duplicate (schema-mirror discipline).
    HANDLED_FIELD_TYPES: Object.keys(TYPE_DISPATCH),
    // Exposed so a consuming test (or a future host) can assert against the
    // SAME gate list this factory enforces, never a hand-copied duplicate —
    // see scope note #6 / BIND_EXECUTABLE_KINDS above.
    BIND_EXECUTABLE_KINDS: BIND_EXECUTABLE_KINDS,
    // ── Reuse seam for makeControlsForRenderSurface.js (WS Studio Controls ────
    //    Realignment §7 r2, architect condition: "REUSES makeControlsForObject's
    //    TYPE_DISPATCH — the big DRY win", NOT a third hand-parallel conversion).
    // Exposes ONLY the per-field-type handlers a renderCapabilities() descriptor
    // uses (`number`, `enum`, `boolean`, `string`) — deliberately NOT the full
    // TYPE_DISPATCH map: the rest bake in Frame/Universe-specific assumptions (the
    // rect z/d component ordering, the Frame writable-boolean engine-ABI coercion
    // trap in scope note #1(a)). A boolean render capability declares
    // `engineVisible:false` (it is render-only), so `_booleanHandler` emits its 0/1
    // control; a `string` capability (an OPEN-ID asset id) is a display entry, which
    // the render factory does not turn into a control. These handlers call the
    // generic `_readValue` fallback (`wrapper[propName]`) for any `env.kind` outside
    // {'Frame','Universe'}, so `env.kind:'RenderSurface'` with a synthetic
    // single-field `wrapper` reuses them UNMODIFIED.
    RENDER_TYPE_HANDLERS: { number: _numberHandler, enum: _enumHandler, boolean: _booleanHandler, string: _stringHandler }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MakeControlsForObject;
} else if (typeof window !== 'undefined') {
    window.MakeControlsForObject = MakeControlsForObject;
}

})();
