#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * gen-hands-section.mjs — the persona's GENERATED sections, rendered from their executing owners. The one
 * writer of every marker pair in assets/system_instructions.md:
 *   HANDS        maxi-hands.js HANDS_MARKERS        ← renderHandsMarkdown(HANDS) (the table window.DeSciX_Actions is built from)
 *   WORLD FRAME  maxi-roles.js WORLD_FRAME_MARKERS  ← renderWorldFrameMarkdown() (the constant the Owl's turn carries)
 *
 *   node scripts/gen-hands-section.mjs                         # print the sections
 *   node scripts/gen-hands-section.mjs --write <persona.md>    # rewrite ONLY what sits between each pair of markers
 *   node scripts/gen-hands-section.mjs --check <persona.md>    # exit 1 when any section is stale
 *
 * The hands block opens with HOW a hand is invoked, then the op table, then one worked ```json:call example
 * per hand (scripts/test/hands.test.mjs is its gate); the world-frame block is WORLD_FRAME between its markers
 * (scripts/test/roles.test.mjs). A file without BOTH markers of a section is refused: the generator never
 * guesses where a section goes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HANDS, HANDS_MARKERS, renderHandsMarkdown } from '../site/app-assets/maxi-hands.js';
import { WORLD_FRAME_MARKERS, renderWorldFrameMarkdown } from '../site/app-assets/maxi-roles.js';

/** Every generated section of the persona: its name, its markers (owned by its module) and its rendered block. */
export const SECTIONS = Object.freeze([
    Object.freeze({ name: 'HANDS', markers: HANDS_MARKERS, render: () => renderHandsMarkdown(HANDS), note: Object.keys(HANDS).length + ' hands' }),
    Object.freeze({ name: 'WORLD FRAME', markers: WORLD_FRAME_MARKERS, render: renderWorldFrameMarkdown, note: 'WORLD_FRAME' })
]);

/** Splice one section's block between its markers: {next, current}. Throws when the markers are missing, doubled or out of order. */
export function spliceBlock(text, section, where) {
    const m = section.markers;
    const b = text.indexOf(m.begin);
    const e = text.indexOf(m.end);
    if (b === -1 || e === -1 || e < b || text.indexOf(m.begin, b + 1) !== -1 || text.indexOf(m.end, e + 1) !== -1) {
        throw new Error('[gen-hands-section] ' + where + ' does not carry exactly one ' + section.name + ' block — put these two lines, once, where the ' +
            section.name + ' section goes:\n' + m.begin + '\n' + m.end);
    }
    return { next: text.slice(0, b) + section.render().trimEnd() + text.slice(e + m.end.length), current: text.slice(b, e + m.end.length) };
}

/** The persona with every section rendered, and the names of the sections that were stale. */
export function renderPersona(text, where) {
    const stale = [];
    let next = text;
    SECTIONS.forEach((s) => {
        const r = spliceBlock(next, s, where);
        if (r.current.trimEnd() !== s.render().trimEnd()) { stale.push(s.name); }
        next = r.next;
    });
    return { next: next, stale: stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const wi = process.argv.indexOf('--write');
    const ci = process.argv.indexOf('--check');
    if (wi === -1 && ci === -1) {
        process.stdout.write(SECTIONS.map((s) => s.render()).join('\n'));
    } else {
        const target = process.argv[(wi !== -1 ? wi : ci) + 1];
        if (!target) { throw new Error('[gen-hands-section] --write/--check need the persona file path.'); }
        const file = path.resolve(process.cwd(), target);
        const r = renderPersona(fs.readFileSync(file, 'utf8'), target);
        const what = SECTIONS.map((s) => s.name + ' (' + s.note + ')').join(', ');
        if (wi !== -1) {
            fs.writeFileSync(file, r.next);
            console.log('[gen-hands-section] wrote ' + what + ' into ' + target);
        } else if (!r.stale.length) {
            console.log('[gen-hands-section] ' + target + ' is current: ' + what + '.');
        } else {
            console.error('[gen-hands-section] STALE: ' + target + ' — ' + r.stale.join(', ') + ' do(es) not match the executing owner — run: node scripts/gen-hands-section.mjs --write ' + target);
            process.exit(1);
        }
    }
}
