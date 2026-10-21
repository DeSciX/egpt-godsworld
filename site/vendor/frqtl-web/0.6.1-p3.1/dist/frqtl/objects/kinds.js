/* Copyright 2023-2026 by Essam Abadir */

/**
 * kinds.js — THE kind registry: a kind registers when the module that defines it is imported.
 *
 *   registerKind(Class, { from, descriptor, defaults?, build?, palette? })
 *       The kind's NAME IS `Class.name` — there is no name field (a `name` key is refused: it would
 *       be a second derivation of the same fact). Fork = copy the part file, rename the class,
 *       import it: the copy registers under its new name with no other edit.
 *         from        REQUIRED — the defining module's own URL (`import.meta.url`), so a copied
 *                     file carries the right value untouched; a duplicate registration names both
 *         descriptor  REQUIRED — the editable-field contract, validated by schema/'s own validator
 *                     (schema/validate-descriptor.js). It carries no `kind`: the registry stamps
 *                     `descriptor.kind = Class.name`. A COMPOSED FORK passes its parent's registered
 *                     descriptor (kindOf(Parent).descriptor): the registry registers a copy of it,
 *                     stamped with the fork's own name — the parent's row is never touched
 *         defaults    the construction defaults ObjectFactory merges under a config (ObjectSchema.defaultPropsFor)
 *         build       (props, ctx, Class) → the declared part — ObjectFactory.create's per-kind step; Class is the
 *                     class that registered (a composed fork passing its parent's build gets an instance of the
 *                     FORK, stamped `_schemaKind = Class.name`). A kind
 *                     with no build registers a descriptor only: ObjectFactory refuses to build it,
 *                     naming the kind's own construction door
 *         palette     { displayName, category, iconHint, rank } — present ⇔ STUDIO can DROP the kind
 *                     (ObjectSchema.placeableCatalog, ordered by rank; equal ranks keep registration
 *                     order, so a fork — a renamed copy — sits beside its original)
 *       THROWS on an anonymous class, a malformed row, a name a scope descriptor already owns
 *       (schema/scopes.js) unless the descriptor IS that scope row's object, or a second
 *       registration of the same name.
 *   kindNamed(name) → Class        THROWS when no module defining it was imported in this realm
 *   kindOf(ClassOrName) → row|null  { name, Class, from, descriptor, defaults, build, palette } — the row and
 *                                   its descriptor/defaults/palette are FROZEN (deeply): a fork reads its parent's
 *                                   row and cannot change it
 *   registeredKinds() → string[]   in registration order
 *   placeableKinds() → rows with a palette, by rank (stable: equal ranks in registration order)
 *
 * A registry is an IMPORT fact: a realm has the kinds it imported. The boot imports the parts barrel
 * (@descix/frqtl-web/parts), so every booted realm has every published part; a kind defined outside
 * the parts directory registers when the module that uses it imports it. This file imports nothing
 * of the parts, so the arrow runs part → registry, never back.
 */

import { validateDescriptor } from './schema/validate-descriptor.js';
import { SCOPE_DESCRIPTORS } from './schema/scopes.js';

/** The keys a registration row may carry. */
export const KIND_ROW_KEYS = Object.freeze(['from', 'descriptor', 'defaults', 'build', 'palette']);
/** The keys a palette entry carries. */
export const PALETTE_KEYS = Object.freeze(['displayName', 'category', 'iconHint', 'rank']);

const _rows = new Map();   // name → frozen row

function _fail(msg) {
    throw new Error('[kinds] ' + msg + ' (FAIL-LOUD.)');
}

/**
 * @param {Function} Class — the part's class (its name is the kind name)
 * @param {{from: string, descriptor: object, defaults?: object, build?: Function, palette?: object}} row
 * @returns {Function} Class
 */
export function registerKind(Class, row) {
    if (typeof Class !== 'function') { _fail('registerKind(Class, row): Class must be the part\'s class (got ' + typeof Class + ').'); }
    const name = Class.name;
    if (!name) { _fail('registerKind: the class is anonymous — the kind name IS the class name, so a kind\'s class must be named.'); }
    if (!row || typeof row !== 'object') { _fail('registerKind(' + name + ', row): row must be an object {' + KIND_ROW_KEYS.join(', ') + '}.'); }
    if (Object.prototype.hasOwnProperty.call(row, 'name')) {
        _fail('registerKind(' + name + '): a row carries no `name` — the kind name IS the class name (' + name + '). ' +
            'To register under another name, rename the class.');
    }
    for (const k of Object.keys(row)) {
        if (KIND_ROW_KEYS.indexOf(k) === -1) { _fail('registerKind(' + name + '): unknown row key "' + k + '" — a row carries ' + KIND_ROW_KEYS.join(', ') + '.'); }
    }
    if (typeof row.from !== 'string' || !row.from) {
        _fail('registerKind(' + name + '): `from` is required — the defining module\'s own URL (from: import.meta.url).');
    }
    try { new URL(row.from); } catch (e) { _fail('registerKind(' + name + '): `from` must be a URL (import.meta.url), got ' + JSON.stringify(row.from) + '.'); }
    // A scope row's name is refused — except to a kind whose descriptor IS that row's object (the
    // LargeObject part registers the engine door's row by reference: still one owner, schema/scopes.js).
    const scopeRow = Object.prototype.hasOwnProperty.call(SCOPE_DESCRIPTORS, name) ? SCOPE_DESCRIPTORS[name] : null;
    if (scopeRow && row.descriptor !== scopeRow) {
        _fail('registerKind(' + name + ', …): "' + name + '" is a SCOPE descriptor row (schema/scopes.js SCOPE_DESCRIPTORS) — ' +
            'a scope is not a kind, and one name has one owner. Rename the class, or register the scope row ' +
            'itself by reference (descriptor: SCOPE_DESCRIPTORS.' + name + ') (' + row.from + ').');
    }
    if (_rows.has(name)) {
        _fail('kind "' + name + '" is already registered by ' + _rows.get(name).from + '; ' + row.from +
            ' registers it again — rename the class in the copy.');
    }
    let descriptor = row.descriptor;
    if (!descriptor || typeof descriptor !== 'object') { _fail('registerKind(' + name + '): `descriptor` is required.'); }
    // A composed fork inherits a REGISTERED kind's descriptor: register a copy, stamped with the fork's name.
    if (!scopeRow && _isRegisteredDescriptor(descriptor)) {
        const copy = {};
        for (const k of Object.keys(descriptor)) { if (k !== 'kind') { copy[k] = descriptor[k]; } }
        descriptor = copy;
    }
    if (!scopeRow && Object.prototype.hasOwnProperty.call(descriptor, 'kind')) {
        _fail('registerKind(' + name + '): the descriptor carries a `kind` — the registry stamps it from the class ' +
            'name; a typed copy is a second derivation of the same fact. Delete the descriptor\'s kind line.');
    }
    validateDescriptor(name, descriptor);
    if (row.defaults !== undefined && (row.defaults === null || typeof row.defaults !== 'object' || Array.isArray(row.defaults))) {
        _fail('registerKind(' + name + '): `defaults` must be a props object when given.');
    }
    if (row.build !== undefined && typeof row.build !== 'function') {
        _fail('registerKind(' + name + '): `build` must be a function (props, ctx) → part when given.');
    }
    if (row.palette !== undefined) {
        const p = row.palette;
        if (!p || typeof p !== 'object') { _fail('registerKind(' + name + '): `palette` must be {' + PALETTE_KEYS.join(', ') + '}.'); }
        for (const k of Object.keys(p)) {
            if (PALETTE_KEYS.indexOf(k) === -1) { _fail('registerKind(' + name + '): unknown palette key "' + k + '" — ' + PALETTE_KEYS.join(', ') + '.'); }
        }
        for (const k of ['displayName', 'category', 'iconHint']) {
            if (typeof p[k] !== 'string' || !p[k]) { _fail('registerKind(' + name + '): palette.' + k + ' must be a non-empty string.'); }
        }
        if (typeof p.rank !== 'number' || !Number.isInteger(p.rank) || p.rank < 0) {
            _fail('registerKind(' + name + '): palette.rank must be a non-negative integer (the palette order).');
        }
    }
    if (!scopeRow) {   // a scope row carries its own kind (= its name)
        Object.defineProperty(descriptor, 'kind', { value: name, enumerable: true, writable: false, configurable: false });
    }
    _rows.set(name, Object.freeze({
        name: name,
        Class: Class,
        from: row.from,
        descriptor: _deepFreeze(descriptor),
        defaults: row.defaults === undefined ? undefined : _deepFreeze(Object.assign({}, row.defaults)),
        build: row.build,
        palette: row.palette ? Object.freeze(Object.assign({}, row.palette)) : undefined
    }));
    return Class;
}

/** Is `d` the descriptor object of a kind already registered (kindOf(Parent).descriptor)? */
function _isRegisteredDescriptor(d) {
    for (const r of _rows.values()) { if (r.descriptor === d) { return true; } }
    return false;
}

/** Freeze `o` and every plain object / array under it (functions and class instances are left as they are). */
function _deepFreeze(o) {
    if (!o || typeof o !== 'object' || Object.isFrozen(o)) { return o; }
    const proto = Object.getPrototypeOf(o);
    if (proto !== Object.prototype && proto !== null && !Array.isArray(o)) { return o; }
    Object.freeze(o);
    for (const k of Object.keys(o)) { _deepFreeze(o[k]); }
    return o;
}

/** The refusal an unregistered kind name reads — the import form, never a path. */
export function unregisteredKindMessage(name) {
    return 'kind "' + name + '" is not registered in this realm — import the module that defines it; ' +
        'published parts: \'@descix/frqtl-web/parts\'';
}

/**
 * @param {string} name
 * @returns {Function} the registered class. THROWS when no module defining it was imported here.
 */
export function kindNamed(name) {
    const row = _rows.get(name);
    if (!row) { throw new Error('[kinds] ' + unregisteredKindMessage(name) + '. (FAIL-LOUD.)'); }
    return row.Class;
}

/**
 * @param {Function|string} classOrName
 * @returns {object|null} the registration row
 */
export function kindOf(classOrName) {
    if (typeof classOrName === 'string') { return _rows.get(classOrName) || null; }
    if (typeof classOrName === 'function') {
        const row = _rows.get(classOrName.name);
        return (row && row.Class === classOrName) ? row : null;
    }
    return null;
}

/** @returns {string[]} the registered kind names, in registration order */
export function registeredKinds() {
    return Array.from(_rows.keys());
}

/** @returns {object[]} the rows STUDIO can drop, ordered by palette.rank (a stable sort: ties keep registration order) */
export function placeableKinds() {
    return Array.from(_rows.values()).filter(function (r) { return !!r.palette; })
        .sort(function (a, b) { return a.palette.rank - b.palette.rank; });
}
