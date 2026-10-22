/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-talk.js — THE row shapes of the lab's conversation strip for the three-role loop: what each loop event
 * (maxi-loop.js onEvent) shows, as plain data {role, who, cls, text, clip?, approve?}. DOM-free: maxi-lab.js
 * renderLoop paints the rows (textContent only) and adds the inline clip; it knows no event shape of its own.
 * An event this table has no row for THROWS naming its role:kind — the page never shows a loop event silently
 * wrong, and never drops one.
 */

import { ROLES, SEEN_ACCOUNT, VERDICTS } from './maxi-roles.js';
import { isSignInRefusal, SIGN_IN_NOTICE } from './maxi-auth.js';

/**
 * Who speaks a row, and its style: the loop's own refusals and stops are the Lab's, styled as refusals; a Lab NOTICE
 * (`lab`: the sign-in a question waits on, a memory an answer left unnamed) is the Lab's in its plain style.
 */
export const ROLE_ROW = Object.freeze({
    tony: Object.freeze(['You', 'talk-tony']),
    designer: Object.freeze([ROLES.designer.name, 'talk-maxi']),
    builder: Object.freeze([ROLES.builder.name, 'talk-builder']),
    owl: Object.freeze([ROLES.owl.name, 'talk-owl']),
    loop: Object.freeze(['Lab', 'talk-refused']),
    lab: Object.freeze(['Lab', 'talk-lab'])
});

/** The event of a refused json:done (the loop's doneRefusal): {role:'builder', kind:DONE_REFUSED, round, words, refusal}. */
export const DONE_REFUSED = 'done-refused';

/**
 * The event of the Designer's answer to a question (maxi-roles.js parseDesignerReply): {role:'designer', kind:ANSWERED,
 * words, memories, unnamed, reading}. Its row is Maxi's words, then the memory files the answer drew on that its words
 * name; the listed files the answer never names (`unnamed`, the answer's fault) follow as a Lab notice, never hiding the answer.
 */
export const ANSWERED = 'answer';

function row(role, text, extra) {
    const who = ROLE_ROW[role];
    if (!who) { throw new Error('[maxi-talk] the loop spoke as an unknown role "' + role + '".'); }
    return Object.assign({ role: role, who: who[0], cls: who[1], text: text }, extra || {});
}

/** The Owl's account of the footage (what it looked at), as words, in the roles module's own SEEN_ACCOUNT order. */
export function seenWords(seen) {
    const keys = Object.keys(SEEN_ACCOUNT);
    const missing = keys.filter(function (k) { return !seen || typeof seen[k] !== 'string' || !seen[k].trim(); });
    if (missing.length) { throw new Error('[maxi-lab] the Owl\'s verdict reached the page without its account of the footage (' + missing.join(', ') + ').'); }
    return 'What I saw — ' + keys.map(function (k) { return k + ': ' + seen[k]; }).join('; ') + '.';
}

const VERDICT_WORDS = Object.freeze({ approve: 'Approved. ', revise: 'Sent back. ' });
VERDICTS.forEach(function (v) { if (!VERDICT_WORDS[v]) { throw new Error('[maxi-talk] the Owl\'s verdict "' + v + '" (maxi-roles.js VERDICTS) has no row words.'); } });

function owlRow(e) {
    return [row('owl', VERDICT_WORDS[e.kind] + (e.words ? e.words + '\n' : '') + seenWords(e.seen) + '\n' +
        e.reasons.map(function (r) { return '· ' + r; }).join('\n') + (e.change ? '\nChange: ' + e.change : ''), { approve: e.kind === 'approve' })];
}

/**
 * THE table: role:kind → the rows an event shows. A role that said nothing before its hand-off gets a bracketed lab
 * fact, never words put in its mouth.
 */
export const LOOP_ROWS = Object.freeze(Object.assign({
    'tony:said': function (e) { return [row('tony', e.words)]; },
    'designer:plan': function (e) { return [row('designer', (e.words || '[plan handed to the Builder]') + '\nPrediction: ' + e.prediction)]; },
    'builder:working': function (e) { return [row('builder', (e.words ? e.words + '\n' : '') + '[' + e.hand + (e.ok ? ' ran' : ' was refused') + ']')]; },
    'builder:built': function (e) { return [row('builder', 'built — watch.' + (e.round > 1 ? ' (round ' + e.round + ')' : '') + '\nPrediction: ' + e.prediction, { clip: e.clip })]; },
    // a refused json:done: the Builder's words before it, then the refusal VERBATIM as a Lab refusal row (the loop hands it back to the Builder)
    ['builder:' + DONE_REFUSED]: function (e) {
        if (typeof e.refusal !== 'string' || !e.refusal.trim()) { throw new Error('[maxi-lab] the loop\'s builder:' + DONE_REFUSED + ' event carries no `refusal` text (the words the Builder was refused with), got ' + JSON.stringify(e.refusal)); }
        if (e.words !== undefined && typeof e.words !== 'string') { throw new Error('[maxi-lab] the loop\'s builder:' + DONE_REFUSED + ' event\'s `words` is the Builder\'s words (a string), got ' + JSON.stringify(e.words)); }
        return (e.words && e.words.trim() ? [row('builder', e.words + '\n[json:done]')] : []).concat([row('loop', 'json:done refused — ' + e.refusal)]);
    },
    // the Designer's answer to a question: Maxi's words, then the memory files they drew on (no build follows a question)
    ['designer:' + ANSWERED]: function (e) {
        if (typeof e.words !== 'string' || !e.words.trim()) { throw new Error('[maxi-lab] the loop\'s designer:' + ANSWERED + ' event carries no `words` (the answer itself), got ' + JSON.stringify(e.words)); }
        if (!Array.isArray(e.memories) || !e.memories.length || !e.memories.every(function (m) { return typeof m === 'string' && m; })) {
            throw new Error('[maxi-lab] the loop\'s designer:' + ANSWERED + ' event names no memory files (`memories`, the files the answer drew on), got ' + JSON.stringify(e.memories));
        }
        if (!Array.isArray(e.unnamed) || !e.unnamed.every(function (m) { return e.memories.indexOf(m) !== -1; })) {
            throw new Error('[maxi-lab] the loop\'s designer:' + ANSWERED + ' event\'s `unnamed` lists the memory files the answer never names (some of `memories`), got ' + JSON.stringify(e.unnamed));
        }
        const named = e.memories.filter(function (m) { return e.unnamed.indexOf(m) === -1; });
        const rows = [row('designer', e.words + (named.length ? '\nFrom my memories: ' + named.join(', ') : ''))];
        if (e.unnamed.length) {
            rows.push(row('lab', (named.length ? 'Maxi named only some of the memories for this answer' : 'Maxi named no memory for this answer') +
                ': he lists ' + e.unnamed.join(', ') + ' as drawn on, and the answer never names ' + (e.unnamed.length > 1 ? 'them' : 'it') + '.'));
        }
        return rows;
    },
    'loop:refused': function (e) { return [row('loop', e.words)]; },
    // a question the platform refused because nobody is signed in (maxi-auth.js): a Lab notice, never a red stop
    'loop:stopped': function (e) { return [isSignInRefusal(e.words) ? row('lab', SIGN_IN_NOTICE) : row('loop', e.words)]; }
}, VERDICTS.reduce(function (o, v) { o['owl:' + v] = owlRow; return o; }, {})));

/** The pending row a role's `asking` shows until its answer lands. */
export function pendingRowOf(role) {
    return row(role, role === 'owl' ? 'watching the clip …' : (role === 'builder' ? 'working …' : 'thinking …'), { pending: true });
}

/** The rows a loop event shows. THROWS naming an event the page does not show. */
export function loopRowsOf(e) {
    if (!e || typeof e.role !== 'string' || typeof e.kind !== 'string') { throw new Error('[maxi-lab] a loop event is {role, kind, …}, got ' + JSON.stringify(e)); }
    if (e.kind === 'asking') { return [pendingRowOf(e.role)]; }
    const shape = LOOP_ROWS[e.role + ':' + e.kind];
    if (!shape) { throw new Error('[maxi-lab] the loop emitted an event the page does not show: ' + e.role + ':' + e.kind + ' (the rows are ' + Object.keys(LOOP_ROWS).join(', ') + ').'); }
    return shape(e);
}
