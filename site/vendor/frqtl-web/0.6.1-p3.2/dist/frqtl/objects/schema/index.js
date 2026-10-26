/* Copyright 2023-2026 by Essam Abadir */

/**
 * Object-definition schema for EGPT FRQTL VM.
 *
 * Each descriptor declares the EDITABLE properties for a canonical object kind,
 * with types and constraints. This is the single source the IDE reads to render
 * generic inspector/palette/drag-edit controls — no per-object UI code needed.
 *
 * Design rules (enforced by the schema test):
 *   1. Enum constraints REFERENCE the imported CollisionTypes / CollisionActions
 *      objects — never re-list values. A copied enum recreates the Rust-only-
 *      divergence bug the frozen sets exist to prevent.
 *   2. Field names are 1:1 with constructor params (one vocabulary).
 *   3. engineVisible:true  → edit routes through the concurrence path (Phase 4b).
 *      engineVisible:false → edit is render-layer-only (Phase 4a).
 *   4. The schema set stays 1:1 with the object set and the frozen enum set.
 *      Adding a new editable enum value still requires the JS-reference-first
 *      → conformance flow (the engine contract's discipline).
 *   5. Every descriptor has an object-level `description` (what the object does)
 *      and every field has a `description` (what the property does / its effect).
 *   6. A composing part stamps `_owner` on what it composed (and nothing else); the declared
 *      object is what `ObjectFactory.create` returns and registers (`runner.declared`). A
 *      part's sub-objects are never declared. Composite descriptors expose only the
 *      composite's own editable props.
 *
 * This file declares WHAT type each field is; its sibling `valueNormalizer.js` states
 * what that declaration MEANS at a write. The sibling's single entry point is re-exported
 * here as `ObjectSchema.normalizeValue(fieldDef, value, kind?)` — the ONE public surface
 * every consumer ferries (the property accessor, the controls factory), so a wrong-typed
 * write throws at the write instead of poisoning a reader far away.
 *
 * Used by: Phase 4 uniform edit API, IDE tools palette, inspector panel.
 * NOT wired to sdk/ — schema lives in lib/ (canonical stack, engine-agnostic).
 * No coupling to lib/components (would violate the acyclic-import rule).
 */

import { CollisionTypes } from '../../parts/CollisionTypes.js';
import { CollisionActions } from '../../parts/CollisionActions.js';
import { wallBehaviorV2ValuesMap as _wallBehaviorV2ValuesMap, bounceDirectionValuesMap as _bounceDirectionValuesMap,
    wallHookValuesMap as _wallHookValuesMap } from '../constants/WallBehaviors.js';
import * as FrameDataSchema from '../../../shim/frame-data/index.js';
import * as FieldDescriptorSchema from '../../../shim/field-descriptor/index.js';
import * as ValueNormalizer from './valueNormalizer.js';
import * as LoDrawnCenter from '../../compat/renderer/lo-drawn-center.js';
import { SCOPE_DESCRIPTORS, shapeValuesMap } from './scopes.js';
import { kindOf, registeredKinds, placeableKinds } from '../kinds.js';


    // ── Imports ───────────────────────────────────────────────────────────────
    // CollisionTypes and CollisionActions are imported BY REFERENCE — NEVER re-listed.
    // Copying them would recreate the Rust-only-divergence bug the frozen sets prevent.
    //
    // FrameDataSchema (SECTION_KEYS + normalizeDataBubble) is imported BY REFERENCE from
    // lib/shim/frame-data — NEVER re-list 'detection'/'render'/'ext' keys here.
    // This mirrors the schema-mirror discipline: one owner per key list (§Engineering Culture).

    // FieldDescriptorSchema (FIELD_TYPES — the shared field-SHAPE vocabulary) is imported
    // BY REFERENCE from lib/shim/field-descriptor — Studio Controls Realignment §7 r2
    // C1: ONE owner for the field-type vocabulary this file's
    // ~200 field declarations and makeControlsForObject.js's TYPE_DISPATCH both consume.
    // This file's own per-kind field ARRAYS stay UNCHANGED (byte-identical) — only the type
    // vocabulary itself is now shared, asserted below (never a hand-copied comment list).

    // ── Field type vocabulary ─────────────────────────────────────────────────
    //
    // type:'rect'       → the positional write tuple, 4 or 6 elements, in the order
    //                      valueNormalizer.js::RECT_TUPLE owns (all physics pixels).
    //                      Omitting z/d is back-compat (engine defaults z=0, d=w).
    //                      See LargeObject rect field below.
    // type:'rgb'        → [r, g, b]  (0-255 integers)
    // type:'number'     → numeric scalar; constraint: { min?, max?, integer? }
    // type:'boolean'    → true | false
    // type:'string'     → free string
    // type:'enum'       → one value from constraint.values object
    // type:'enum-set'   → array of zero or more values from constraint.values object
    // type:'rect-array' → array of rect tuples (source_rects for emitters)
    // type:'readonly'   → derived/computed: inspectable but not editable
    //
    // Optional per-field key `unit` (Studio Controls Realignment S2, design §2.2):
    // a machine-readable string ('px', 'px/tick', 'ticks', 'px²', …) for fields whose
    // `description` prose already states a unit. NOT populated en masse — only where
    // the description text already says so (mechanical, not invented). Consumed by
    // `makeControlsForObject` (lib/frqtl/objects/objects/makeControlsForObject.js) to
    // append "(unit)" to a generated control's label. Absence means "no declared unit,"
    // never "unitless" — most number fields simply haven't been swept yet.

    // ── Shape-vocab ferry (R2-3) ─────────────────────────────────────────────
    // The shell SHAPE selector (LargeObject.shellShape) ferries the canonical shape
    // value set from its ONE owner, lib/shim/frame-data (RENDER_INTENT_VALUES
    // ['render.shape']) — the SAME set the render-level "Default Shape" uses — never a
    // hand-listed enum. frame-data is a static import, so the value set is available at
    // descriptor-build.

    /** The descriptor `name` resolves to: a registered kind's, else a scope row's, else null. */
    function _descriptor(name) {
        var row = kindOf(name);
        if (row) { return row.descriptor; }
        return Object.prototype.hasOwnProperty.call(SCOPE_DESCRIPTORS, name) ? SCOPE_DESCRIPTORS[name] : null;
    }

    // ── Kind descriptors ──────────────────────────────────────────────────────
    //
    // A kind's descriptor, construction defaults and palette entry TRAVEL WITH ITS CLASS: each part
    // module registers them (objects/kinds.js registerKind) when it is imported, and every read below
    // is a registry read. The SCOPE rows (particle, backdrop, Frame, Universe, Dimension) are the
    // schema's own (schema/scopes.js). The palette presents V2 stock only (rows with a `palette`);
    // backdrop is added through the EFFECTS toggle (runner.addBackdrop), never dropped.

    // ── Normalizer-row exhaustiveness guard (load time) ───────────────────────
    //
    // The normalizer's row keys must be EXACTLY lib/shim/field-descriptor's FIELD_TYPES —
    // the ONE field-type vocabulary. A type added there without a row (or a row for a type
    // that no longer exists) FAILS LOUD at module load, so the two never drift into
    // "validated in one consumer, unvalidated in another". Skipped (not thrown) when the
    // contract module is genuinely unreachable — the same pointer-fallback discipline the
    // two guards above use.
    if (Array.isArray(FieldDescriptorSchema.FIELD_TYPES)) {
        var _rowKeys = ValueNormalizer.TYPES;
        var _vocab = FieldDescriptorSchema.FIELD_TYPES;
        for (var _vi = 0; _vi < _vocab.length; _vi++) {
            if (_rowKeys.indexOf(_vocab[_vi]) === -1) {
                throw new Error('[lib/frqtl/objects/schema] field type "' + _vocab[_vi] +
                    '" is declared in lib/shim/field-descriptor\'s FIELD_TYPES but has no ' +
                    'row in valueNormalizer.js\'s VALUE_NORMALIZERS — every declared type ' +
                    'must state how a written value is normalized/rejected. (FAIL-LOUD.)');
            }
        }
        for (var _ri = 0; _ri < _rowKeys.length; _ri++) {
            if (_vocab.indexOf(_rowKeys[_ri]) === -1) {
                throw new Error('[lib/frqtl/objects/schema] valueNormalizer.js declares a row ' +
                    'for "' + _rowKeys[_ri] + '", which is not a member of lib/shim/' +
                    'field-descriptor\'s FIELD_TYPES ([' + _vocab.join(', ') + ']). The type ' +
                    'vocabulary has ONE owner. (FAIL-LOUD.)');
            }
        }
    }

    /** A deep copy of arrays and plain objects; any other value (a primitive, a class instance) as it is. */
    function _plainCopy(v) {
        if (v === null || typeof v !== 'object') { return v; }
        if (Array.isArray(v)) { return v.map(_plainCopy); }
        if (ArrayBuffer.isView(v)) { return Array.from(v); }
        var proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) { return v; }
        var out = {};
        Object.keys(v).forEach(function (k) { out[k] = _plainCopy(v[k]); });
        return out;
    }

    var ObjectSchema = {
        /**
         * get(name) → the descriptor: a kind a module registered in THIS realm (objects/kinds.js),
         * else a scope row (schema/scopes.js), else null.
         */
        get: function (kind) {
            return _descriptor(kind);
        },
        /** kinds() → every name get() answers, once each: the registered kinds, then the scope rows
         *  (a kind registered by reference to its scope row — LargeObject — is listed once). */
        kinds: function () {
            var reg = registeredKinds();
            return reg.concat(Object.keys(SCOPE_DESCRIPTORS).filter(function (n) { return reg.indexOf(n) === -1; }));
        },
        /**
         * ux(kind) → the normalized STUDIO UX presentation contract for a kind
         * Runs the descriptor's declared `ux:{}` block (or absence)
         * through lib/shim/field-descriptor's normalizeUx, so a caller ALWAYS gets
         * the full bag { resizable, draggable, handles, shellRender }
         * with legacy defaults filled (R6 — no block ⇒ today's behavior). Consumers
         * (STUDIO's overlay + Inspector, a headless game) FERRY this — they never
         * re-derive the vocabulary. Returns the legacy-default bag when the field-
         * descriptor contract is unreachable OR the kind is unknown (never throws
         * on a read — the write-time normalize guard above is the fail-loud gate).
         * @param {string} kind
         * @returns {{resizable:boolean, draggable:object, handles:string[], shellRender:string}}
         */
        ux: function (kind) {
            var descriptor = _descriptor(kind);
            var raw = descriptor ? descriptor.ux : undefined;
            if (typeof FieldDescriptorSchema.normalizeUx === 'function') {
                return FieldDescriptorSchema.normalizeUx(raw);
            }
            // Field-descriptor unreachable — inline legacy default (mirrors normalizeUx's
            // no-block branch). Never throws on a read.
            return {
                resizable: true,
                draggable: { '2d': true },
                handles: null,           // null ⇒ "all zones" for a consumer without the vocab
                shellRender: 'design'
            };
        },
        /**
         * Returns the schema-driven palette catalog: an array of PlaceableEntry objects.
         * Each entry: { kind, displayName, description, category, iconHint, defaultProps }.
         * This is the ONLY source a palette component should use — never hardcode kind names in UI.
         *
         * @returns {Array<{kind:string, displayName:string, description:string,
         *                  category:string, iconHint:string, defaultProps:Object}>}
         */
        placeableCatalog: function () {
            return placeableKinds().map(function (row) {
                return {
                    kind:         row.name,
                    displayName:  row.palette.displayName,
                    description:  row.descriptor.description,
                    category:     row.palette.category,
                    iconHint:     row.palette.iconHint,
                    defaultProps: row.defaults
                };
            });
        },
        /**
         * defaultPropsFor(kind) → the kind's default construction props, or `{}`.
         *
         * The ONE read path for construction defaults (the `defaults` a kind registers with).
         * ObjectFactory._mergeProps ferries this bag; it does NOT scan
         * placeableCatalog(), because the palette answers "what can be DROPPED in
         * STUDIO" while this answers "what does a kind construct with" — two
         * different questions that used to share one list. A kind retired from the
         * palette keeps constructing identically through a recipe.
         *
         * Returns the live bag by reference (same contract as placeableCatalog()'s
         * entries: callers must not mutate it — _mergeProps copies).
         * @param {string} kind
         * @returns {object}
         */
        /**
         * captureProps(obj, kind) → the plain props bag of a live object, read through its kind's descriptor:
         * every declared field whose value is defined, deep-copied (arrays and plain objects; any other object
         * is left as the value it is, so a writer refuses it by name); a `rect` field read as a {left, top, w, h}
         * shape is captured in its write form: RECT_TUPLE[6] when it carries a z-extent (LoDrawnCenter.hasZ),
         * else RECT_TUPLE[4]. A `writeOnly` field (a live reposition
         * adapter — SphereEmitter.rect, Tunnel.rect) is skipped: the part's real position fields are captured.
         * THROWS for a kind with no descriptor: there is no descriptor-less walk.
         * Consumers: RecipeContext (the parts writer's baseline and its diff), the IDE's inspector reads.
         * @param {object} obj — a live declared object
         * @param {string} kind — its kind (runner.kindOf(obj))
         * @returns {object}
         */
        captureProps: function (obj, kind) {
            var descriptor = _descriptor(kind);
            if (!descriptor || !Array.isArray(descriptor.fields)) {
                throw new Error('[ObjectSchema] captureProps(obj, "' + kind + '"): no descriptor for kind "' + kind +
                    '" in this realm — a capture reads the kind\'s declared fields, never the object\'s own keys. (FAIL-LOUD.)');
            }
            var props = {};
            for (var i = 0; i < descriptor.fields.length; i++) {
                var field = descriptor.fields[i];
                if (field.writeOnly === true) { continue; }
                var val = obj[field.name];
                if (val === undefined) { continue; }
                // A `rect` field READS as a {left, top, w, h} shape (a Rectangle) but is WRITTEN as the
                // tuple whose order valueNormalizer.js::RECT_TUPLE owns: the capture is the write form.
                // A rect with a z-extent (LoDrawnCenter.hasZ) is captured in the 6-number form, a flat one in the
                // 4-number form, so a baseline and a live capture agree on form and a z move is a `rect` diff.
                if (field.type === 'rect' && val && typeof val === 'object' && !Array.isArray(val)) {
                    var form = LoDrawnCenter.hasZ(val) ? 6 : 4;
                    var tuple = ValueNormalizer.RECT_TUPLE[form].map(function (k) {
                        return k === 'd' ? LoDrawnCenter.zExtent(val) : val[k];
                    });
                    if (tuple.every(function (n) { return typeof n === 'number'; })) {
                        props[field.name] = tuple;
                        continue;
                    }
                }
                props[field.name] = _plainCopy(val);
            }
            return props;
        },
        /**
         * derivedReads(kind) → [{ name, field, tuple, key }] — the kind's readonly reads that a write field owns
         * (a descriptor row's `derivedFrom`: e.g. Wall `z` = RECT_TUPLE[6] key 'z' of `rect`). Data only: the
         * write authority stays the named field. THROWS for a kind with no descriptor.
         * @param {string} kind
         * @returns {{name: string, field: string, tuple: number, key: string}[]}
         */
        derivedReads: function (kind) {
            var descriptor = _descriptor(kind);
            if (!descriptor || !Array.isArray(descriptor.fields)) {
                throw new Error('[ObjectSchema] derivedReads("' + kind + '"): no descriptor for kind "' + kind + '". (FAIL-LOUD.)');
            }
            return descriptor.fields.filter(function (f) { return !!f.derivedFrom; }).map(function (f) {
                return { name: f.name, field: f.derivedFrom.field, tuple: f.derivedFrom.tuple, key: f.derivedFrom.key };
            });
        },
        defaultPropsFor: function (kind) {
            var row = kindOf(kind);
            return (row && row.defaults) ? row.defaults : {};
        },
        /**
         * The declared-type write gate: `normalizeValue(fieldDef, value, kind?)` returns
         * the value in its declared canonical form or THROWS naming kind/field/expected
         * type (throw-or-apply). Implemented by the sibling `valueNormalizer.js` (the
         * per-type contract table lives there); exposed HERE so there is ONE public
         * entry point, which every consumer — the accessor
         * (FrqtlApp.updateObjectProperty) and the controls factory's read-side
         * validity probe — FERRIES rather than re-implementing per type.
         */
        normalizeValue: ValueNormalizer.normalizeValue,
        // The ONE world-rect normalizer (valueNormalizer.js::worldRect): `{left,top,w,h}`
        // or the rect tuple → `{w,h,…}`, THROWING on a missing/non-positive dimension.
        worldRect: ValueNormalizer.worldRect,
        // THE rect write-tuple order (valueNormalizer.js::RECT_TUPLE) and its text form — every
        // description below that spells a tuple is BUILT from rectTupleText.
        RECT_TUPLE: ValueNormalizer.RECT_TUPLE,
        rectTupleText: ValueNormalizer.rectTupleText,
        // The field-TYPE vocabulary, FERRIED by reference from its ONE owner
        // (lib/shim/field-descriptor) so a consumer that already holds ObjectSchema can
        // drive a table off it without a second import — never a re-listed copy. Falls
        // back to the normalizer row keys when the contract module is unreachable (the
        // load-time guard above proves the two sets are identical whenever it IS
        // reachable), so a consumer always gets the vocabulary, never undefined.
        FIELD_TYPES: FieldDescriptorSchema.FIELD_TYPES,
        // Exposed by reference so tests can assert identity (not copies).
        CollisionTypes:   CollisionTypes,
        CollisionActions: CollisionActions,
        // FrameDataSchema reference — the bubble sub-shape authority (lib/shim/frame-data).
        FrameDataSchema:  FrameDataSchema,
        // FieldDescriptorSchema reference — the shared field-shape/type-vocabulary authority
        // (lib/shim/field-descriptor, §7 r2 C1).
        FieldDescriptorSchema: FieldDescriptorSchema
    };

export {
    ObjectSchema,
    shapeValuesMap
};
