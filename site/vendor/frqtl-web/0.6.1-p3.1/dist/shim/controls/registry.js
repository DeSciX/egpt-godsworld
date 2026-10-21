/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/controls/registry — the runtime-registerable instance registry
 * ("Instance addressing").
 *
 * Sugar objects (`SphereEmitter`, `Tube`, a future `*Layer` class, …) and their
 * declared control descriptors (`lib/shim/controls/index.js` shapes) need a
 * NAMED, runtime-addressable catalog: a page may host MULTIPLE same-kind
 * instances (two `SphereEmitter`s, two `Tube`s) and must add objects/controls
 * dynamically (not only at `setup()` time) — named lookup + enumeration,
 * FAIL-LOUD on an id collision or an unknown-id lookup (never a silent
 * overwrite or a silent `undefined`).
 *
 * ── FACTORY, not a singleton ─────────────────────────────────────────────────
 *
 * Unlike `lib/shim/notebook/realm-registry.js` (a process-global singleton —
 * appropriate there because there is conceptually ONE catalog of realm KINDS
 * for the whole session), `makeControlRegistry()` is a FACTORY: each call
 * returns an ISOLATED registry instance. A page hosting two independent
 * experiment runners side-by-side (e.g. the Physics Compare / GYM view, which
 * runs a JS engine and a WASM engine simultaneously) must not have one
 * runner's object named `"tube"` collide with the other runner's own `"tube"` —
 * each runner/experiment owns its OWN registry instance (mirrors the
 * `makeFrqtlHandle`/`makeChartHandle`/`makeViewHandle` factory precedent in
 * `lib/shim/notebook/`, not the single-catalog `realm-registry.js` precedent —
 * the difference being INSTANCES-per-scene vs KINDS-for-the-session).
 *
 * Two independent catalogs share one registry instance: OBJECTS (sugar object
 * instances) and CONTROLS (their declared control-descriptor arrays,
 * normalized via `normalizeControlDescriptor`). A name may be registered in
 * either catalog, both, or neither — an object without controls, or a bare
 * control array with no backing object instance, are both legal.
 *
 * Usage:
 *   import { makeControlRegistry } from 'lib/shim/controls/registry.js';
 *   const registry = makeControlRegistry();
 *   registry.registerObject('source', sphereEmitter, 'SphereEmitter');
 *   registry.registerControls('source', sphereEmitter.controls);
 *   // … later, dynamically, from anywhere holding `registry`:
 *   registry.getObject('muzzleEmitter').setActive(false);
 *   registry.getControls('muzzleEmitter').forEach(c => host.render(c));
 */

import * as ControlsSchema from './index.js';



    function _isValidName(name) {
        return typeof name === 'string' && name.length > 0;
    }

    /**
     * makeControlRegistry() → a fresh, isolated registry instance.
     *
     * @returns {{
     *   registerObject: (name:string, instance:*, kind?:string) => void,
     *   getObject: (name:string) => *,
     *   getObjectKind: (name:string) => string|null,
     *   hasObject: (name:string) => boolean,
     *   objectNames: () => string[],
     *   unregisterObject: (name:string) => void,
     *   registerControls: (name:string, descriptors:object[]) => object[],
     *   getControls: (name:string) => object[],
     *   hasControls: (name:string) => boolean,
     *   controlNames: () => string[],
     *   unregisterControls: (name:string) => void,
     *   allControls: () => Object<string, object[]>
     * }}
     */
    function makeControlRegistry() {
        // name -> { instance, kind } — the OBJECT catalog.
        var _objects = Object.create(null);
        // name -> normalized descriptor[] — the CONTROLS catalog.
        var _controls = Object.create(null);

        // ── Objects ──────────────────────────────────────────────────────────

        /**
         * Register a sugar-object instance under a name.
         *
         * @param {string} name — a non-empty, registry-unique addressing key.
         * @param {*} instance — the live object (a SphereEmitter, Tube, LargeObject, …).
         * @param {string} [kind] — a free-form label (e.g. 'SphereEmitter') for
         *   diagnostics/enumeration; not validated against any closed vocabulary
         *   (sugar-object KINDS are open-ended, unlike control-descriptor KINDS).
         * @throws {Error} FAIL-LOUD on an invalid/empty name, a missing instance,
         *   or a name already registered (never a silent overwrite).
         */
        function registerObject(name, instance, kind) {
            if (!_isValidName(name)) {
                throw new Error('[controls/registry] registerObject: name must be a non-empty ' +
                    'string; got ' + JSON.stringify(name) + '. (FAIL-LOUD.)');
            }
            if (instance === undefined || instance === null) {
                throw new Error('[controls/registry] registerObject("' + name +
                    '"): instance must not be null/undefined. (FAIL-LOUD.)');
            }
            if (_objects[name]) {
                throw new Error('[controls/registry] registerObject: id collision — "' + name +
                    '" is already registered (existing kind: "' + (_objects[name].kind || 'unknown') +
                    '"). Call unregisterObject("' + name + '") first, or choose a different name. ' +
                    '(FAIL-LOUD — never a silent overwrite.)');
            }
            _objects[name] = { instance: instance, kind: kind || null };
        }

        /**
         * Resolve a registered object instance.
         * @throws {Error} FAIL-LOUD if `name` is not registered.
         */
        function getObject(name) {
            var rec = _objects[name];
            if (!rec) {
                throw new Error('[controls/registry] getObject: no object registered for "' +
                    String(name) + '". Registered: [' + objectNames().join(', ') + ']. (FAIL-LOUD.)');
            }
            return rec.instance;
        }

        /**
         * Resolve a registered object's `kind` label (gym-controls-as-sugar
         * binds+ControlSync FINAL design — objects-side bind execution needs BOTH
         * the instance (`getObject`, unchanged) AND its kind, to route a scalar
         * descriptor's `bind.object` to the correct property-accessor family
         * (Frame → getFrameProperty/setFrameProperty; LargeObject → updateObjectProperty).
         * Additive — `getObject` keeps returning the bare instance, unchanged, for
         * every existing caller.
         * @throws {Error} FAIL-LOUD if `name` is not registered (mirrors `getObject`).
         */
        function getObjectKind(name) {
            var rec = _objects[name];
            if (!rec) {
                throw new Error('[controls/registry] getObjectKind: no object registered for "' +
                    String(name) + '". Registered: [' + objectNames().join(', ') + ']. (FAIL-LOUD.)');
            }
            return rec.kind;
        }

        /** hasObject(name) — non-throwing presence check. */
        function hasObject(name) { return !!_objects[name]; }

        /** objectNames() — registered object names (diagnostics/enumeration). */
        function objectNames() { return Object.keys(_objects); }

        /**
         * Remove a registered object (frees the name for re-registration).
         * @throws {Error} FAIL-LOUD if `name` is not registered — an unregister of
         *   an unknown name is a caller bug, never a silent no-op.
         */
        function unregisterObject(name) {
            if (!_objects[name]) {
                throw new Error('[controls/registry] unregisterObject: no object registered ' +
                    'for "' + String(name) + '". (FAIL-LOUD.)');
            }
            delete _objects[name];
        }

        // ── Controls ─────────────────────────────────────────────────────────

        /**
         * Register a named array of control descriptors. Each descriptor is
         * normalized via `normalizeControlDescriptor` (throw-or-apply — a
         * malformed descriptor anywhere in the array fails the WHOLE call,
         * nothing partial is committed).
         *
         * @param {string} name — a non-empty, registry-unique addressing key
         *   (independent of the OBJECTS catalog's namespace — an object and its
         *   controls conventionally share the same name, but this is
         *   convention, not enforced).
         * @param {object[]} descriptors — candidate control descriptors (see
         *   `lib/shim/controls/index.js` KINDS for the accepted shapes).
         * @returns {object[]} the normalized descriptor array (NOT the same
         *   array reference as the input — mirrors normalizeControlDescriptor's
         *   never-mutate-the-input discipline).
         * @throws {Error} FAIL-LOUD on an invalid/empty name, a name already
         *   registered, a non-array `descriptors`, a duplicate `id` WITHIN the
         *   array, or any descriptor that fails `normalizeControlDescriptor`.
         */
        function registerControls(name, descriptors) {
            if (!_isValidName(name)) {
                throw new Error('[controls/registry] registerControls: name must be a ' +
                    'non-empty string; got ' + JSON.stringify(name) + '. (FAIL-LOUD.)');
            }
            if (_controls[name]) {
                throw new Error('[controls/registry] registerControls: id collision — "' + name +
                    '" already has controls registered. Call unregisterControls("' + name +
                    '") first, or choose a different name. (FAIL-LOUD — never a silent overwrite.)');
            }
            if (!Array.isArray(descriptors)) {
                throw new Error('[controls/registry] registerControls("' + name +
                    '"): descriptors must be an array. (FAIL-LOUD.)');
            }
            var normalized = [];
            var seenIds = Object.create(null);
            for (var i = 0; i < descriptors.length; i++) {
                var bag = ControlsSchema.normalizeControlDescriptor(descriptors[i]);
                if (seenIds[bag.id]) {
                    throw new Error('[controls/registry] registerControls("' + name +
                        '"): duplicate control id "' + bag.id + '" within the same array at ' +
                        'index ' + i + '. (FAIL-LOUD.)');
                }
                seenIds[bag.id] = true;
                normalized.push(bag);
            }
            _controls[name] = normalized;
            return normalized;
        }

        /**
         * Resolve a registered controls array.
         * @throws {Error} FAIL-LOUD if `name` is not registered.
         */
        function getControls(name) {
            var arr = _controls[name];
            if (!arr) {
                throw new Error('[controls/registry] getControls: no controls registered ' +
                    'for "' + String(name) + '". Registered: [' + controlNames().join(', ') +
                    ']. (FAIL-LOUD.)');
            }
            return arr;
        }

        /** hasControls(name) — non-throwing presence check. */
        function hasControls(name) { return !!_controls[name]; }

        /** controlNames() — registered control-array names (diagnostics/enumeration). */
        function controlNames() { return Object.keys(_controls); }

        /**
         * Remove a registered controls array (frees the name for re-registration).
         * @throws {Error} FAIL-LOUD if `name` is not registered.
         */
        function unregisterControls(name) {
            if (!_controls[name]) {
                throw new Error('[controls/registry] unregisterControls: no controls ' +
                    'registered for "' + String(name) + '". (FAIL-LOUD.)');
            }
            delete _controls[name];
        }

        /**
         * allControls() — a snapshot map `{ name: descriptor[] }` of every
         * registered controls array (for a future host that enumerates
         * everything without knowing names ahead of time — e.g. the
         * control panel).
         * @returns {Object<string, object[]>}
         */
        function allControls() {
            var out = {};
            var names = controlNames();
            for (var i = 0; i < names.length; i++) { out[names[i]] = _controls[names[i]]; }
            return out;
        }

        return {
            registerObject:     registerObject,
            getObject:          getObject,
            getObjectKind:      getObjectKind,
            hasObject:          hasObject,
            objectNames:        objectNames,
            unregisterObject:   unregisterObject,
            registerControls:   registerControls,
            getControls:        getControls,
            hasControls:        hasControls,
            controlNames:       controlNames,
            unregisterControls: unregisterControls,
            allControls:        allControls
        };
    }

    // ── Export ────────────────────────────────────────────────────────────────

export { makeControlRegistry };
