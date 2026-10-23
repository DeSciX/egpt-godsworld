/* Copyright 2023-2026 by Essam Abadir */

/**
 * loop-events.mjs — one event of each kind the three-role loop emits, in the shapes maxi-loop.js emits them (its `emit({ role,
 * kind, … })` calls): an outline turn of two rounds, the Owl's revise between, approved. Read by talk.test.mjs (the rows and
 * the Thinking line) and lab-panes.test.mjs (the page painting them). Not a test file: importing it runs nothing.
 */

import { SEEN_ACCOUNT } from '../../site/app-assets/maxi-roles.js';
import { ASKING, DONE_REFUSED, TOLD } from '../../site/app-assets/maxi-talk.js';

/** The Owl's account of the footage, every SEEN_ACCOUNT key said. */
export const SEEN = Object.freeze(Object.fromEntries(Object.keys(SEEN_ACCOUNT).map((k) => [k, 'x'])));
/** A clip as the loop carries it. */
export const CLIP = Object.freeze({ seconds: 6, media: Object.freeze({ mime_type: 'video/mp4', data: 'AAAA' }) });
/** The doneRefusal text maxi-loop.js writes for a change no clip shows. */
export const REFUSAL = 'json:done after 1 change(s) your last clip does not show (the first: move of mirror) — a Record\'s changes lie inside its footage; film again after the last change.';

/** An outline turn of two rounds: the visitor's words, the plan, two builds, the Owl's revise and its approve, then Maxi's closing turn on the Designer's thread. */
export const EVENTS = Object.freeze([
    { role: 'tony', kind: 'said', words: 'a laser hitting a mirror at 30 degrees' },
    { role: 'designer', kind: ASKING },
    { role: 'designer', kind: 'plan', words: 'We take the mirror memory and turn the slab.', plan: { scene: 'cl1a-mirror', hands: ['dragTo'] }, prediction: 'the beam leaves at 60 degrees' },
    { role: 'builder', kind: ASKING },
    { role: 'builder', kind: 'working', round: 1, words: 'Moving the mirror.', hand: 'dragTo', ok: true, clip: CLIP },
    { role: 'builder', kind: DONE_REFUSED, round: 1, words: 'Done.', refusal: REFUSAL },
    { role: 'builder', kind: 'built', round: 1, words: 'The beam turns.', prediction: 'the beam leaves at 60 degrees', clip: CLIP },
    { role: 'owl', kind: ASKING },
    { role: 'owl', kind: 'revise', round: 1, words: 'Not yet.', seen: SEEN, reasons: ['the beam is cut'], change: 'film longer', clip: CLIP },
    { role: 'builder', kind: 'working', round: 2, words: '', hand: 'see', ok: false, clip: null },
    { role: 'builder', kind: 'built', round: 2, words: 'Now it shows.', prediction: 'the beam leaves at 60 degrees', clip: CLIP },
    { role: 'owl', kind: 'approve', round: 2, words: 'Good.', seen: SEEN, reasons: ['the beam leaves at 60 degrees'], clip: CLIP },
    { role: 'designer', kind: ASKING },
    { role: 'maxi', kind: TOLD, round: 2, words: 'The beam now leaves the mirror at about sixty degrees, as you asked; I am not yet sure why the spot widens.', clip: CLIP }
]);
