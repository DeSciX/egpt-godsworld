/* Copyright 2023-2026 by Essam Abadir */

/**
 * scene-roster.js — THE scene list both views show (the GYM's select and STUDIO's dropdown): one owner, read by
 * both, so the two lists are the same rows in the same order.
 *
 *   SHOWCASE_GROUP   the label of the showcase group ('Impossible things')
 *   sceneGroups()    → [{ label, rows: [{ id, title }] }] — the showcase roster first (EXHIBITS, in tile order,
 *                      each row its exhibit title), then every walk-through rung in WALKTHROUGH order under its
 *                      lab group (walkthroughGroup), with NO rung removed from its own group: a showcase rung
 *                      appears twice, and both rows name the same rung (a deep link selects it either way).
 *
 * A row is a scene id a host opens by ?walkthrough=<id>. A host keeps its own non-scene rows (STUDIO's blank world
 * and saved projects) around these groups; the GYM's default scene is the first row.
 */

import { EXHIBITS } from './exhibits.js';
import { WALKTHROUGH, walkthroughGroup } from './walkthrough.js';

/** The showcase group's label. */
export const SHOWCASE_GROUP = 'Impossible things';

/**
 * @returns {Array<{label: string, rows: Array<{id: string, title: string}>}>} a new array on every call
 */
export function sceneGroups() {
    var groups = [{ label: SHOWCASE_GROUP, rows: EXHIBITS.map(function (e) { return { id: e.id, title: e.title }; }) }];
    WALKTHROUGH.forEach(function (r) {
        var g = walkthroughGroup(r);
        var last = groups[groups.length - 1];
        if (groups.length === 1 || last.label !== g) { groups.push({ label: g, rows: [] }); last = groups[groups.length - 1]; }
        last.rows.push({ id: r.id, title: r.title });
    });
    return groups;
}
