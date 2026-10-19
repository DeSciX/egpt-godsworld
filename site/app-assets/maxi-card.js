/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-card.js — the scene's card for the lab's Info panel, read from the frqtl SDK's registry, never retyped.
 *
 * The card's words have ONE owner, the vendored registry ('@descix/frqtl-web/registry'): the scene's EXHIBITS tile row
 * (tile / what / why / how / controls) and its WALKTHROUGH rung (title / prose, and its group). This module only
 * picks the rows for a scene id and lays them out as lines; the labels are the ones Maxi's card memory uses
 * (scripts/gen-memories-build.mjs card(), held equal by scripts/test/card.test.mjs). maxi-lab.js paints the lines.
 * The registry is passed in, so a test can hand it a registry whose words no one could have typed.
 */

/** The tile fields shown, in the card memory's order, with the card memory's labels. `controls` is optional. */
export const CARD_FIELDS = Object.freeze([
    Object.freeze({ key: 'what', label: 'What you are seeing' }),
    Object.freeze({ key: 'why', label: 'Why it is impossible the usual way' }),
    Object.freeze({ key: 'how', label: 'How FRQTL gets it' }),
    Object.freeze({ key: 'controls', label: 'Controls', optional: true })
]);

/** Said when the scene has no tile row: a statement of the absence, never a stand-in for the card. */
export const TILE_ABSENT = 'The registry has no tile card for this scene; its walk-through rung follows.';

/** Said for a sketch Maxi wrote: it is not a registry scene. */
export const SKETCH_NO_CARD = 'A sketch Maxi wrote is not a registry scene, so the registry holds no card for it.';

/** The rung's heading, as the card memory writes it ('Rung <title> (<group>)'). */
export function rungHeading(rung) { return 'Rung ' + rung.title + ' (' + rung.group + ')'; }

/**
 * The card for registry scene `id`: {id, title, tile: {title, tile, fields: [{key, label, text}]} | null,
 * rung: {title, group, prose}}. THROWS by name when the id is no rung, the id has two tile rows, or a
 * tile lacks a required field.
 */
export function sceneCard(registry, id) {
    if (!registry || !Array.isArray(registry.EXHIBITS) || typeof registry.walkthroughById !== 'function' || typeof registry.walkthroughGroup !== 'function') {
        throw new Error('[maxi-card] sceneCard needs the registry\'s EXHIBITS, walkthroughById and walkthroughGroup.');
    }
    const row = registry.walkthroughById(id);
    if (!row) { throw new Error('[maxi-card] no scene "' + id + '" in the registry\'s WALKTHROUGH.'); }
    const tiles = registry.EXHIBITS.filter(function (t) { return t.id === id; });
    if (tiles.length > 1) { throw new Error('[maxi-card] the registry has ' + tiles.length + ' tile rows for "' + id + '".'); }
    const t = tiles[0] || null;
    let tile = null;
    if (t) {
        const fields = [];
        CARD_FIELDS.forEach(function (f) {
            const text = t[f.key];
            if (text === null || text === undefined) {
                if (f.optional) { return; }
                throw new Error('[maxi-card] the tile row for "' + id + '" has no ' + f.key + '.');
            }
            if (typeof text !== 'string') { throw new Error('[maxi-card] the tile row for "' + id + '" has a ' + typeof text + ' ' + f.key + '.'); }
            fields.push(Object.freeze({ key: f.key, label: f.label, text: text }));
        });
        tile = Object.freeze({ title: t.title, tile: t.tile, fields: Object.freeze(fields) });
    }
    const rung = Object.freeze({ title: row.title, group: registry.walkthroughGroup(row), prose: row.prose });
    return Object.freeze({ id: id, title: t ? t.title : row.title, tile: tile, rung: rung });
}

/**
 * The card as lines to paint, in order: [{kind, text}] with kind one of title | tile | label | text | absent.
 * `card` null is a sketch Maxi wrote.
 */
export function cardLines(card) {
    if (card === null) { return [{ kind: 'absent', text: SKETCH_NO_CARD }]; }
    const out = [{ kind: 'title', text: card.title }];
    if (card.tile) {
        out.push({ kind: 'tile', text: card.tile.tile });
        card.tile.fields.forEach(function (f) { out.push({ kind: 'label', text: f.label }, { kind: 'text', text: f.text }); });
    } else {
        out.push({ kind: 'absent', text: TILE_ABSENT });
    }
    out.push({ kind: 'label', text: rungHeading(card.rung) }, { kind: 'text', text: card.rung.prose });
    return out;
}
