/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-card.js — the scene's card for the lab's Info panel, read from the lab's scene roster, never retyped.
 *
 * The card's words have ONE owner, the lab's roster (site/scenes/roster.json, loaded and normalized by the package's
 * '@descix/frqtl-web/registry'): the scene's showcase card (title / tile / what / why / how / controls) and its scene
 * row (title / prose, and its group). This module only picks the rows for a scene id and lays them out as lines; the
 * labels are the ones Maxi's card memory uses (scripts/gen-memories-build.mjs card(), held equal by
 * scripts/test/card.test.mjs). maxi-lab.js paints the lines. The roster bag and the package's reader are passed in, so
 * a test can hand it a roster whose words no one could have typed.
 */

/** The tile fields shown, in the card memory's order, with the card memory's labels. `controls` is optional. */
export const CARD_FIELDS = Object.freeze([
    Object.freeze({ key: 'what', label: 'What you are seeing' }),
    Object.freeze({ key: 'why', label: 'Why it is impossible the usual way' }),
    Object.freeze({ key: 'how', label: 'How FRQTL gets it' }),
    Object.freeze({ key: 'controls', label: 'Controls', optional: true })
]);

/** Said when the scene has no tile row: a statement of the absence, never a stand-in for the card. */
export const TILE_ABSENT = 'The roster has no tile card for this scene; its scene row follows.';

/** Said for a sketch Maxi wrote: it is not a roster scene. */
export const SKETCH_NO_CARD = 'A sketch Maxi wrote is not a roster scene, so the roster holds no card for it.';

/** The rung's heading, as the card memory writes it ('Rung <title> (<group>)'). */
export function rungHeading(rung) { return 'Rung ' + rung.title + ' (' + rung.group + ')'; }

/**
 * The card for roster scene `id`: {id, title, tile: {title, tile, fields: [{key, label, text}]} | null,
 * rung: {title, group, prose}}. `reader` is the package's registry (its walkthroughById), `roster` a bag it normalized.
 * The tile is the scene's showcase card in whichever mode it is declared. THROWS by name when the id is no scene of the
 * roster, the id has two cards, or a card lacks a required field.
 */
export function sceneCard(reader, roster, id) {
    if (!reader || typeof reader.walkthroughById !== 'function') {
        throw new Error('[maxi-card] sceneCard(reader, roster, id) needs the package registry\'s walkthroughById.');
    }
    const row = reader.walkthroughById(roster, id);   // the package refuses a roster it did not normalize
    if (!row) { throw new Error('[maxi-card] no scene "' + id + '" in the lab\'s roster.'); }
    const tiles = roster.showcase === null ? [] : roster.showcase.rows.filter(function (t) { return t.id === id; });
    if (tiles.length > 1) { throw new Error('[maxi-card] the roster has ' + tiles.length + ' showcase cards for "' + id + '".'); }
    const t = tiles[0] || null;
    let tile = null;
    if (t) {
        const fields = [];
        CARD_FIELDS.forEach(function (f) {
            const text = t[f.key];
            if (text === null || text === undefined) {
                if (f.optional) { return; }
                throw new Error('[maxi-card] the card for "' + id + '" has no ' + f.key + '.');
            }
            if (typeof text !== 'string') { throw new Error('[maxi-card] the card for "' + id + '" has a ' + typeof text + ' ' + f.key + '.'); }
            fields.push(Object.freeze({ key: f.key, label: f.label, text: text }));
        });
        tile = Object.freeze({ title: t.title, tile: t.tile, fields: Object.freeze(fields) });
    }
    const rung = Object.freeze({ title: row.title, group: row.group, prose: row.prose });
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
