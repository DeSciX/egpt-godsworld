/* Copyright 2023-2026 by Essam Abadir */

/**
 * page-door.js — THE page door: `window.FrqtlPage`, the one object a page publishes for a realm that
 * cannot import its module instances (a parent frame, a Playwright `page.evaluate`). Plan rule 3b:
 * the ONE global seam of the module closure, and its ONE publisher.
 *
 *   PAGE_DOOR_KEYS            the members, each a row { key, kind, replaces?, why }:
 *                               kind 'owner' — a getter over the ONE store its owner module keeps
 *                                              (the old page globals with a live cross-frame reader)
 *                               kind 'page'  — a function a host page registers (the empty page's door)
 *   installPageDoor()         define `window.FrqtlPage` (once per realm) — the boot module calls it, so
 *                             every booted page, a package consumer's included, carries the one seam
 *   refuseRetiredGlobals()    refuse every retired page global (retired-globals.js minus compat/vendor.js
 *                             P5_GLOBAL_MODE_HOOKS, computed) with a non-enumerable accessor that THROWS its
 *                             replacement — once per realm. The migration aid of the pages that once carried
 *                             the classic layer: an in-tree page ENTRY calls it (the experiment pages, the
 *                             empty page, the notebook realm, the robot lab); no package door does, so a
 *                             consumer's page owns every global name but FRQTL and FrqtlPage
 *   publishPageDoorMembers(members)   a host page registers its 'page' members; an unknown key or a
 *                             second registration THROWS
 *   retiredGlobalNames()      the refused names (the census minus the p5 hooks)
 *
 * A member joins only through review: a row here whose old global had a live cross-frame reader
 * (runner ← _frqtlApp, experiment ← _egptExperiment, controls ← _frqtlControlsRegistry) or a host
 * page's own function. Anything else is an import.
 */

import { pageRunner } from '../../objects/FrqtlApp.js';
import { pageExperiment } from '../../objects/RecipeContext.js';
import { FrqtlControlsPanel } from '../../parts/FrqtlControlsPanel.js';
import { refuseRetiredDoors } from '../../compat/engine.js';
import { P5_GLOBAL_MODE_HOOKS } from '../../compat/vendor.js';
import { RETIRED_GLOBALS } from './retired-globals.js';

/** The page door's members. */
export const PAGE_DOOR_KEYS = Object.freeze([
    Object.freeze({ key: 'runner', kind: 'owner', replaces: '_frqtlApp', read: pageRunner,
        why: 'the runner the page drives (objects/FrqtlApp.js pageRunner)' }),
    Object.freeze({ key: 'experiment', kind: 'owner', replaces: '_egptExperiment', read: pageExperiment,
        why: 'the recipe facade the page builds through (objects/RecipeContext.js pageExperiment)' }),
    Object.freeze({ key: 'controls', kind: 'owner', replaces: '_frqtlControlsRegistry',
        read: function () { return FrqtlControlsPanel.exposedRegistry(); },
        why: 'the control registry the page exposed (parts/FrqtlControlsPanel.js exposedRegistry)' }),
    Object.freeze({ key: 'isReady', kind: 'page', why: 'the empty page: a host may apply a scene now' }),
    Object.freeze({ key: 'applyModuleSource', kind: 'page', why: 'the empty page: apply a sketch held as text' }),
    Object.freeze({ key: 'applyRenderState', kind: 'page', why: 'the empty page: apply a renderState bag' }),
    Object.freeze({ key: 'displayResolution', kind: 'page', why: 'the empty page: the renderer the scene requires vs booted' })
]);

/** The page globals refused in a booted page: the census, minus p5 global mode's own hooks. */
export function retiredGlobalNames() {
    return Object.keys(RETIRED_GLOBALS).filter(function (n) { return P5_GLOBAL_MODE_HOOKS.indexOf(n) === -1; });
}

let _door = null;

/** Define `window.FrqtlPage` — once per realm (a page only). */
export function installPageDoor() {
    if (_door) { return _door; }
    if (typeof document === 'undefined') {
        throw new Error('[page-door] installPageDoor: the page door is a PAGE\'s — this realm has no document. (FAIL-LOUD.)');
    }
    const door = {};
    for (const row of PAGE_DOOR_KEYS) {
        if (row.kind === 'owner') {
            Object.defineProperty(door, row.key, { enumerable: true, get: row.read });
        }
    }
    _door = door;
    window.FrqtlPage = door;   // THE one page-global write of the closure (rule 3b)
    return door;
}

let _refused = false;

/** Refuse the retired page globals on `window` — once per realm. An in-tree page entry calls it; a door never does. */
export function refuseRetiredGlobals() {
    if (_refused) { return; }
    if (typeof document === 'undefined') {
        throw new Error('[page-door] refuseRetiredGlobals: the retired globals are a PAGE\'s — this realm has no document. (FAIL-LOUD.)');
    }
    const table = {};
    for (const name of retiredGlobalNames()) {
        table[name] = 'window.' + name + ' is retired — ' + RETIRED_GLOBALS[name] + '. (FAIL-LOUD.)';
    }
    refuseRetiredDoors(window, table);
    _refused = true;
}

/**
 * @param {Object<string, function>} members — a host page's 'page' members (PAGE_DOOR_KEYS)
 * @returns {object} the page door
 */
export function publishPageDoorMembers(members) {
    const door = installPageDoor();
    for (const key of Object.keys(members || {})) {
        const row = PAGE_DOOR_KEYS.filter(function (r) { return r.key === key; })[0];
        if (!row || row.kind !== 'page') {
            throw new Error('[page-door] "' + key + '" is not a page member of the page door — the members are ' +
                PAGE_DOOR_KEYS.filter(function (r) { return r.kind === 'page'; }).map(function (r) { return r.key; }).join(', ') +
                ' (experiments/_shared/page-door.js PAGE_DOOR_KEYS). (FAIL-LOUD.)');
        }
        if (Object.prototype.hasOwnProperty.call(door, key)) {
            throw new Error('[page-door] "' + key + '" is already published — one page, one publisher. (FAIL-LOUD.)');
        }
        if (typeof members[key] !== 'function') {
            throw new TypeError('[page-door] "' + key + '" must be a function. (FAIL-LOUD.)');
        }
        Object.defineProperty(door, key, { enumerable: true, value: members[key] });
    }
    return door;
}
