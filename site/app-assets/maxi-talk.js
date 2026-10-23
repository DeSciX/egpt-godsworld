/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-talk.js — THE row shapes of the lab's two panes for the three-role loop: what each loop event (maxi-loop.js onEvent)
 * shows, and where, as plain data {role, pane, who, cls, text, clip?, approve?, toDrawer?}, and what the conversation's
 * Thinking line says about it. DOM-free: maxi-lab.js renderLoop paints the rows (textContent only) and the Thinking line;
 * it knows no event shape of its own.
 *
 * Two panes (PANES): the CONVERSATION carries Maxi's voice and the visitor's words, and the Lab's plain facts; the
 * IMAGINATION drawer carries Maxi's three processes, Designing, Building and Checking (PROCESSES), as "how I thought about
 * it" — never as speakers in the conversation. A row's role has a label and a style per pane it may show in (ROLE_ROW): a
 * Builder or Owl row has none in the conversation, so it cannot be painted there.
 *
 * An event this table has no entry for THROWS naming its role:kind — the page never shows a loop event silently wrong, and
 * never drops one. A row whose pane is not one of PANES, or not one its role may show in, THROWS by name (paneFaults).
 *
 * A turn remembers one thing across its events (talkTurn, stepped by loopStep): the approved clip Maxi has not told the visitor
 * about yet. The Owl's approve holds it; Maxi's closing turn (maxi:told) shows it on his own row; a stop before he told it, or
 * a loop that ended without telling it (turnEnd), shows it once as the Lab's, with the why in the drawer. Never twice, never lost.
 */

import { ROLES, ROLE_ORDER, SEEN_ACCOUNT, VERDICTS } from './maxi-roles.js';
import { isSignInRefusal, SIGN_IN_NOTICE } from './maxi-auth.js';

/** The two panes a row may show in. */
export const PANES = Object.freeze(['conversation', 'imagination']);

/** Maxi's three processes, as the Imagination drawer labels them: one per role of maxi-roles.js ROLE_ORDER. */
export const PROCESSES = Object.freeze({ designer: 'Designing', builder: 'Building', owl: 'Checking' });
ROLE_ORDER.forEach(function (r) { if (!PROCESSES[r]) { throw new Error('[maxi-talk] the role "' + r + '" (maxi-roles.js ROLE_ORDER) has no process label for the Imagination drawer.'); } });

/** The drawer's label for Maxi's closing turn (maxi:told): what he told the visitor, after the Checking that approved it. */
export const TELLING = 'Telling';

/** The drawer's heading: what the Imagination pane is. */
export const IMAGINATION_TITLE = 'How I thought about it';

/**
 * Who a row is, by its role and its pane: [label, style]. A role with no entry for a pane never shows there. The visitor
 * and Maxi are the conversation's two speakers (the Designer's own words are Maxi's); the loop's refusals and stops are the
 * Lab's, in full, in the drawer only — the loop's words never reach the conversation; a Lab NOTICE or fact (`lab`) is the
 * Lab's in its plain style (labFactFaults: no loop words, no role names, no code). No conversation row the page composes
 * carries a file name or a backtick (conversationFaults, a throw); Maxi's own words are his model's, shown with their
 * backticks removed and each slip counted into the drawer (registerSlips), never a stop.
 */
export const ROLE_ROW = Object.freeze({
    tony: Object.freeze({ conversation: Object.freeze(['You', 'talk-tony']) }),
    designer: Object.freeze({ conversation: Object.freeze([ROLES.designer.name, 'talk-maxi']), imagination: Object.freeze([PROCESSES.designer, 'talk-designing']) }),
    // Maxi himself (the loop's role 'maxi', its closing turn): his own voice in the conversation, and the Telling line in the drawer
    maxi: Object.freeze({ conversation: Object.freeze([ROLES.designer.name, 'talk-maxi']), imagination: Object.freeze([TELLING, 'talk-telling']) }),
    builder: Object.freeze({ imagination: Object.freeze([PROCESSES.builder, 'talk-builder']) }),
    owl: Object.freeze({ imagination: Object.freeze([PROCESSES.owl, 'talk-owl']) }),
    loop: Object.freeze({ imagination: Object.freeze(['Lab', 'talk-refused']) }),
    lab: Object.freeze({ conversation: Object.freeze(['Lab', 'talk-lab']) })
});

/** The event of a refused json:done (the loop's doneRefusal): {role:'builder', kind:DONE_REFUSED, round, words, refusal}. */
export const DONE_REFUSED = 'done-refused';

/**
 * The event of the Designer's answer to a question (maxi-roles.js parseDesignerReply): {role:'designer', kind:ANSWERED,
 * words, memories, reading}. Its rows: the memory files the answer drew on, under Designing in the turn's group of the
 * Imagination drawer (MEMORIES_LEAD + the files: how he thought about it), then Maxi's words alone in the conversation,
 * linking to that group. The conversation never carries the file list.
 */
export const ANSWERED = 'answer';

/** How the drawer's row of an answer's memory files begins. */
export const MEMORIES_LEAD = 'From my memories: ';

/** The event a role emits while its brain is asked (maxi-loop.js ask): {role, kind:ASKING}. */
export const ASKING = 'asking';

/**
 * The event of Maxi's closing turn after an approve (maxi-loop.js): {role:'maxi', kind:TOLD, round, words, clip}. Its rows: his
 * words under Telling in the drawer (and any register slip counted there), then Maxi's words in the conversation (backticks
 * removed) with the approved clip on that row. The Thinking line closes "approved" at it.
 */
export const TOLD = 'told';

/** What the Thinking line says between the approve and Maxi's closing words. */
export const TELLING_LINE = 'telling you what the clip shows';

/**
 * The approved clip's Lab fact when Maxi did not get to tell the visitor about it (the loop stopped after the approve, or ended
 * with no closing turn): the clip on this row, once; the why in the drawer, which this fact links to.
 */
export const UNTOLD_FACT = '[built and approved — watch; Maxi did not get to tell you about it — why]';

/** The drawer's words when the loop ended with an approved clip and no closing turn (turnEnd): the loop's fault, in full. */
export const NO_TOLD_WORDS = 'The loop handed back the approved clip without Maxi\'s closing words (no maxi:' + TOLD + ' event after the approve): the clip is shown as the Lab\'s.';

/** A refusal before the visitor's words were taken (Record or the Hand on): the conversation's Lab fact; the why is in the drawer. */
export const NOT_STARTED_FACT = 'Maxi did not start — why';

/**
 * What a Lab fact in the conversation must never carry: the loop's words, a role's name (Designer, Builder, Owl, by id, name or
 * title in maxi-roles.js ROLES), or code. A Lab fact is the Lab's plain statement, never bench text.
 */
const ROLE_WORDS = Array.from(new Set(ROLE_ORDER.flatMap(function (r) { return [ROLES[r].id, ROLES[r].title.replace(/^the /, '')]; })));
const LAB_FACT_BANS = Object.freeze([
    ['a role\'s name', new RegExp('\\b(' + ROLE_WORDS.join('|') + ')\\b', 'i')],
    ['the loop\'s words', /\bstopped\b|\bthe loop\b|\brefused\b|\bround \d/i],
    ['code', /```|json:|[{}]|\w\(|\bwindow\.|=>/]
]);
export function labFactFaults(text) {
    if (typeof text !== 'string' || !text.trim()) { return ['a Lab fact has no words']; }
    return LAB_FACT_BANS.filter(function (b) { return b[1].test(text); }).map(function (b) { return 'a Lab fact carries ' + b[0] + ': ' + JSON.stringify(text); });
}

/**
 * What a conversation row the PAGE composes (the loop table's Lab rows, through paneFaults; every Lab row maxi-lab.js paints
 * itself, through its one row painter talkLine and isPageRow; the footage rows' own part) must never carry: a memory file name (a token ending .md,
 * outside a link: a library link https://egpt.descix.net/#<path> handed in a sentence is a person's link, a bare file name is
 * a citation) or a backtick. paneFaults throws on it. Maxi's own words (the designer's conversation row) are his model's: the
 * table strips their backticks and counts each slip into the drawer (registerSlips), so only a backtick left in them is a
 * fault there. The visitor's own words are theirs and are never held to it.
 */
const LINK = /\bhttps?:\/\/\S+/g;
const FILE_TOKENS = /[\w./-]*\w\.md\b/gi;
const BACKTICKS = /`/g;
/**
 * THE file-name reader: the bare file names in `text` (a token ending .md), each {token, at} with its position in `text`;
 * a link (https?://…) is masked to spaces of its own length first, so a library link is never a file name and positions
 * stay true. conversationFaults, registerSlips and tickerOf read file names through this alone.
 */
export function fileNames(text) {
    const masked = String(text).replace(LINK, function (m) { return ' '.repeat(m.length); });
    return Array.from(masked.matchAll(FILE_TOKENS), function (m) { return { token: m[0], at: m.index }; });
}
export function conversationFaults(text) {
    if (typeof text !== 'string') { return ['a conversation row has no words']; }
    const bad = [];
    if (fileNames(text).length) { bad.push('a conversation row carries a file name: ' + JSON.stringify(text)); }
    if (BACKTICKS.test(text)) { bad.push('a conversation row carries a backtick: ' + JSON.stringify(text)); }
    BACKTICKS.lastIndex = 0;
    return bad;
}

/**
 * Whether a conversation row's words are the PAGE's own, held to conversationFaults by the page's one row painter (maxi-lab.js
 * talkLine, a throw): every row but the visitor's and Maxi's own (their ROLE_ROW labels), and any row in the Lab's style
 * whatever its label. How the row was asked for (a literal, a constant, a loop row, a hand-built row) does not enter into it.
 */
export function isPageRow(who, cls) {
    const own = who === ROLE_ROW.tony.conversation[0] || who === ROLE_ROW.designer.conversation[0] || who === ROLE_ROW.maxi.conversation[0];
    return !own || String(cls).split(/\s+/).indexOf(ROLE_ROW.lab.conversation[1]) !== -1;
}

/** Maxi's model words as the conversation shows them: backticks removed (plain text); bare file names left as they are. */
export function plainTalk(words) { return String(words).replace(BACKTICKS, ''); }

/** The register slips in Maxi's model words: {backticks, files} (file names outside links), for the persona to be measured by. */
export function registerSlips(words) {
    return { backticks: (String(words).match(BACKTICKS) || []).length, files: fileNames(words).length };
}

/** How a turn's register-slip row in the drawer begins (its ticker lead). */
export const SLIP_LEAD = 'register slip';

/** The drawer's register-slip row's words, "register slip: 2 backticks, 1 file name"; null when there was no slip. */
export function slipWords(s) {
    const parts = [];
    if (s.backticks) { parts.push(s.backticks + ' backtick' + (s.backticks === 1 ? '' : 's')); }
    if (s.files) { parts.push(s.files + ' file name' + (s.files === 1 ? '' : 's')); }
    return parts.length ? SLIP_LEAD + ': ' + parts.join(', ') : null;
}

/**
 * THE collapsed drawer's ticker for a drawer row: its process label and its lead, never a file name. A row the table gave a
 * `lead` shows that (the memory row: "From my memories", never the list); any other row shows its first line, cut before a
 * bare file name it carries (model words in the drawer are shown in full in the drawer, never in the ticker). THROWS when
 * the result would carry a file name (the ticker's gate).
 */
export function tickerOf(r) {
    let lead = typeof r.lead === 'string' ? r.lead : String(r.text).split('\n')[0];
    if (typeof r.lead !== 'string') {
        const first = fileNames(lead)[0];
        if (first) { lead = (lead.slice(0, first.at).trim() + ' …').trim(); }
    }
    const t = r.who + ' · ' + lead;
    if (fileNames(t).length) { throw new Error('[maxi-talk] the drawer\'s ticker would show a file name: ' + JSON.stringify(t)); }
    return t;
}

/** The id of turn n's group in the Imagination drawer: the Thinking line and the not-started Lab fact link to it. */
export function turnAnchor(n) {
    if (!Number.isInteger(n) || n < 0) { throw new Error('[maxi-talk] a turn of the conversation is a whole number from 0, got ' + JSON.stringify(n)); }
    return 'imagination-turn-' + n;
}

/** One row: its role's label and style in its pane. THROWS when the role does not show in that pane. */
function row(role, pane, text, extra) {
    const who = ROLE_ROW[role];
    if (!who) { throw new Error('[maxi-talk] the loop spoke as an unknown role "' + role + '".'); }
    if (PANES.indexOf(pane) === -1) { throw new Error('[maxi-talk] a row\'s pane is one of ' + PANES.join(', ') + ', got ' + JSON.stringify(pane) + ' (role ' + role + ').'); }
    if (!who[pane]) { throw new Error('[maxi-talk] a ' + role + ' row never shows in the ' + pane + ' pane (it shows in: ' + Object.keys(who).join(', ') + ').'); }
    return Object.assign({ role: role, pane: pane, who: who[pane][0], cls: who[pane][1], text: text }, extra || {});
}

/**
 * Why `rows` cannot be painted, [] when they can: every row's pane is one of PANES and one its role shows in, with that
 * role's label and style there. loopRowsOf throws on any; a row built by hand (not through the table's own row()) is held
 * to the same rule.
 */
export function paneFaults(rows) {
    const bad = [];
    (rows || []).forEach(function (r, i) {
        const at = 'row ' + (i + 1) + ' (' + (r && r.role) + ')';
        if (!r || typeof r !== 'object') { bad.push(at + ' is not a row'); return; }
        if (PANES.indexOf(r.pane) === -1) { bad.push(at + ' has no pane (' + JSON.stringify(r.pane) + '; the panes are ' + PANES.join(', ') + ')'); return; }
        const who = ROLE_ROW[r.role];
        if (!who) { bad.push(at + ': no role "' + r.role + '"'); return; }
        if (!who[r.pane]) { bad.push(at + ' is in the ' + r.pane + ' pane, where a ' + r.role + ' row never shows (it shows in: ' + Object.keys(who).join(', ') + ')'); return; }
        if (r.who !== who[r.pane][0] || r.cls !== who[r.pane][1]) { bad.push(at + ' is labelled ' + JSON.stringify([r.who, r.cls]) + ' in the ' + r.pane + ' pane, not ' + JSON.stringify(who[r.pane])); }
        if (r.role === 'lab' && r.pane === 'conversation') { labFactFaults(r.text).forEach(function (f) { bad.push(at + ': ' + f); }); }
        if (r.role === 'lab' && r.pane === 'conversation') { conversationFaults(r.text).forEach(function (f) { bad.push(at + ': ' + f); }); }
        if ((r.role === 'designer' || r.role === 'maxi') && r.pane === 'conversation' && registerSlips(r.text).backticks) { bad.push(at + ': Maxi\'s words reached the conversation with their backticks: ' + JSON.stringify(r.text)); }
    });
    return bad;
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

/** The loop's words for a stop or a refusal, in full: the drawer's. THROWS on a stop with no words. */
function stopRow(e) {
    if (typeof e.words !== 'string' || !e.words.trim()) { throw new Error('[maxi-talk] a stop or refusal carries the loop\'s words, got ' + JSON.stringify(e.words)); }
    return row('loop', 'imagination', e.words);
}

/**
 * What the conversation's Thinking line does at an event: {begin, line} opens it (the visitor's words), {line} says what
 * Maxi is doing now in process words, {end} closes it with how the loop ended (THINKING_ENDS), {none} takes it away (the turn
 * was a conversation turn, or a notice: nothing was thought out in the drawer), null leaves it as it is.
 */
export const THINKING_ENDS = Object.freeze({ approve: 'approved', stopped: 'stopped' });

/** A clip as the loop carries it: {seconds, media: {mime_type, data}}. */
function isClip(c) { return !!c && typeof c === 'object' && !!c.media && typeof c.media.mime_type === 'string' && typeof c.media.data === 'string' && !!c.media.data; }

function owlEntry(v) {
    const entry = {
        // the verdict and its account, in the drawer only: the approved clip is held for Maxi's closing turn (maxi:told), which shows it
        rows: function (e) {
            return [row('owl', 'imagination', VERDICT_WORDS[e.kind] + (e.words ? e.words + '\n' : '') + seenWords(e.seen) + '\n' +
                e.reasons.map(function (r) { return '· ' + r; }).join('\n') + (e.change ? '\nChange: ' + e.change : ''), { approve: e.kind === 'approve' })];
        },
        think: function (e) { return v === 'approve' ? { line: TELLING_LINE } : { line: 'sent back: round ' + (e.round + 1) }; }
    };
    if (v === 'approve') {
        entry.hold = function (e, held) {
            if (held) { throw new Error('[maxi-talk] the Owl approved round ' + e.round + ' while round ' + held.round + '\'s approved clip is still untold.'); }
            if (!isClip(e.clip)) { throw new Error('[maxi-lab] the loop\'s owl:approve event carries no clip (the approved hand-back the visitor is to watch), got ' + JSON.stringify(e.clip)); }
            return { clip: e.clip, round: e.round };
        };
    }
    return entry;
}

/** The approved clip held for Maxi's closing turn, shown as the Lab's with the why in the drawer (`why`: the drawer's row). */
function untoldRows(why, held) {
    return [why, row('lab', 'conversation', UNTOLD_FACT, { clip: held.clip, toDrawer: true })];
}

/**
 * THE table: role:kind → {rows(e), think(e)}: the rows an event shows, and what the Thinking line does. A role that said
 * nothing before its hand-off gets a bracketed lab fact, never words put in its mouth.
 */
export const LOOP_ROWS = Object.freeze(Object.assign({
    'tony:said': {
        rows: function (e) { return [row('tony', 'conversation', e.words)]; },
        think: function () { return { begin: true, line: 'reading what you said' }; },
        hold: function (e, held) {
            if (held) { throw new Error('[maxi-talk] a new outline began while the last turn\'s approved clip (round ' + held.round + ') was never shown: no closing turn, no stop, no turnEnd.'); }
            return null;
        }
    },
    'designer:plan': {
        rows: function (e) { return [row('designer', 'imagination', (e.words || '[plan handed to the Builder]') + '\nPrediction: ' + e.prediction)]; },
        think: function (e) { return { line: 'planning from my memory of ' + e.plan.scene }; }
    },
    'builder:working': {
        rows: function (e) { return [row('builder', 'imagination', (e.words ? e.words + '\n' : '') + '[' + e.hand + (e.ok ? ' ran' : ' was refused') + ']')]; },
        think: function (e) { return { line: 'building: ' + e.hand + (e.ok ? ' ran' : ' was refused') }; }
    },
    'builder:built': {
        rows: function (e) { return [row('builder', 'imagination', 'built — watch.' + (e.round > 1 ? ' (round ' + e.round + ')' : '') + '\nPrediction: ' + e.prediction, { clip: e.clip })]; },
        think: function () { return { line: 'built: handing the clip over' }; }
    },
    // a refused json:done: the Builder's words before it, then the refusal VERBATIM as a Lab refusal row (the loop hands it back to the Builder)
    ['builder:' + DONE_REFUSED]: {
        rows: function (e) {
            if (typeof e.refusal !== 'string' || !e.refusal.trim()) { throw new Error('[maxi-lab] the loop\'s builder:' + DONE_REFUSED + ' event carries no `refusal` text (the words the Builder was refused with), got ' + JSON.stringify(e.refusal)); }
            if (e.words !== undefined && typeof e.words !== 'string') { throw new Error('[maxi-lab] the loop\'s builder:' + DONE_REFUSED + ' event\'s `words` is the Builder\'s words (a string), got ' + JSON.stringify(e.words)); }
            return (e.words && e.words.trim() ? [row('builder', 'imagination', e.words + '\n[json:done]')] : []).concat([row('loop', 'imagination', 'json:done refused — ' + e.refusal)]);
        },
        think: function () { return { line: 'building: the hand-back was refused, filming again' }; }
    },
    // the Designer's answer to a question (no build follows it): the memory files it drew on in the drawer, under Designing in
    // the turn's group (made by this row), and any register slip of the model words counted there; then the model words alone in the
    // conversation (backticks removed), linking to that group. A slip is measured, never a stop.
    ['designer:' + ANSWERED]: {
        rows: function (e) {
            if (typeof e.words !== 'string' || !e.words.trim()) { throw new Error('[maxi-lab] the loop\'s designer:' + ANSWERED + ' event carries no `words` (the answer itself), got ' + JSON.stringify(e.words)); }
            if (!Array.isArray(e.memories) || !e.memories.length || !e.memories.every(function (m) { return typeof m === 'string' && m; })) {
                throw new Error('[maxi-lab] the loop\'s designer:' + ANSWERED + ' event names no memory files (`memories`, the files the answer drew on), got ' + JSON.stringify(e.memories));
            }
            const slip = slipWords(registerSlips(e.words));
            return [row('designer', 'imagination', MEMORIES_LEAD + e.memories.join(', '), { lead: MEMORIES_LEAD.replace(/: $/, '') })]
                .concat(slip ? [row('designer', 'imagination', slip, { lead: slip })] : [])
                .concat([row('designer', 'conversation', plainTalk(e.words), { toDrawer: true })]);
        },
        think: function () { return { none: true }; }
    },
    // Maxi's closing turn: the words under Telling in the drawer (a slip counted there), then the same words in the conversation with
    // the approved clip on his own row. Only an approve this turn holds may be told; the told clip is that approve's.
    ['maxi:' + TOLD]: {
        rows: function (e, held) {
            if (!held) { throw new Error('[maxi-lab] the loop emitted maxi:' + TOLD + ' with no approved clip held for it (no owl:approve before it in this turn).'); }
            if (typeof e.words !== 'string' || !e.words.trim()) { throw new Error('[maxi-lab] the loop\'s maxi:' + TOLD + ' event carries no `words` (what Maxi tells the visitor), got ' + JSON.stringify(e.words)); }
            if (!isClip(e.clip)) { throw new Error('[maxi-lab] the loop\'s maxi:' + TOLD + ' event carries no `clip` (the approved clip he tells the visitor about), got ' + JSON.stringify(e.clip)); }
            if (e.clip.media.data !== held.clip.media.data) { throw new Error('[maxi-lab] the loop\'s maxi:' + TOLD + ' clip is not the one the Owl approved in round ' + held.round + '.'); }
            const slip = slipWords(registerSlips(e.words));
            return [row('maxi', 'imagination', e.words)]
                .concat(slip ? [row('maxi', 'imagination', slip, { lead: slip })] : [])
                .concat([row('maxi', 'conversation', plainTalk(e.words), { clip: e.clip })]);
        },
        think: function () { return { end: THINKING_ENDS.approve }; },
        hold: function () { return null; }
    },
    // refused before the visitor's words were taken (no Thinking line): the why in the drawer, a plain Lab fact linking to it
    'loop:refused': { rows: function (e) { return [stopRow(e), row('lab', 'conversation', NOT_STARTED_FACT, { toDrawer: true })]; }, think: function () { return null; } },
    // a question the platform refused because nobody is signed in (maxi-auth.js): a Lab notice, never a red stop; any other
    // stop is the drawer's alone — the conversation's whole stop is the Thinking line, closed red
    // A stop after the approve (Maxi's closing turn threw): the stop in full in the drawer, the held clip once as the Lab's.
    'loop:stopped': {
        rows: function (e, held) {
            if (held) { return untoldRows(stopRow(e), held); }
            return isSignInRefusal(e.words) ? [row('lab', 'conversation', SIGN_IN_NOTICE)] : [stopRow(e)];
        },
        think: function (e, held) { return !held && isSignInRefusal(e.words) ? { none: true } : { end: THINKING_ENDS.stopped }; },
        hold: function () { return null; }
    },
    // while a role's brain is asked: nothing to show but what Maxi is doing now
    // the Designer's thread asked after the approve is Maxi's closing turn being written
    ['designer:' + ASKING]: { rows: function () { return []; }, think: function (e, held) { return { line: held ? TELLING_LINE : 'thinking it through' }; } },
    ['builder:' + ASKING]: { rows: function () { return []; }, think: function () { return { line: 'building' }; } },
    ['owl:' + ASKING]: { rows: function () { return []; }, think: function () { return { line: 'watching the clip' }; } }
}, VERDICTS.reduce(function (o, v) { o['owl:' + v] = owlEntry(v); return o; }, {})));

function entryOf(e) {
    if (!e || typeof e.role !== 'string' || typeof e.kind !== 'string') { throw new Error('[maxi-lab] a loop event is {role, kind, …}, got ' + JSON.stringify(e)); }
    const entry = LOOP_ROWS[e.role + ':' + e.kind];
    if (!entry) {
        if (!ROLE_ROW[e.role]) { throw new Error('[maxi-talk] the loop spoke as an unknown role "' + e.role + '".'); }
        throw new Error('[maxi-lab] the loop emitted an event the page does not show: ' + e.role + ':' + e.kind + ' (the rows are ' + Object.keys(LOOP_ROWS).join(', ') + ').');
    }
    return entry;
}

/** A conversation turn's memory across its events: `held`, the approved clip not yet told ({clip, round}), else null. The page keeps one. */
export function talkTurn() { return { held: null }; }

function heldOf(turn, op) {
    if (turn === undefined) { return null; }
    if (!turn || typeof turn !== 'object' || !('held' in turn)) { throw new Error('[maxi-talk] ' + op + ' takes a turn made by talkTurn(), got ' + JSON.stringify(turn)); }
    return turn.held;
}

function checked(e, rows) {
    const bad = paneFaults(rows);
    if (bad.length) { throw new Error('[maxi-talk] ' + e.role + ':' + e.kind + ' made rows the page cannot paint: ' + bad.join('; ') + '.'); }
    return rows;
}

/**
 * The rows a loop event shows in `turn` (talkTurn; none given: a turn holding nothing), each with its pane. Reads the turn, never
 * steps it. THROWS naming an event the page does not show, or a row in a pane its role never shows in.
 */
export function loopRowsOf(e, turn) {
    return checked(e, entryOf(e).rows(e, heldOf(turn, 'loopRowsOf')));
}

/** What the conversation's Thinking line does at a loop event in `turn` ({begin, line} | {line} | {end} | {none} | null). THROWS like loopRowsOf. */
export function thinkingOf(e, turn) {
    return entryOf(e).think(e, heldOf(turn, 'thinkingOf'));
}

/**
 * THE page's step of a turn at a loop event: {rows, think} as the turn stood before the event, then the turn steps (an approve
 * holds its clip; Maxi's closing turn or a stop lets it go). THROWS like loopRowsOf, and leaves the turn as it was.
 */
export function loopStep(e, turn) {
    const held = heldOf(turn, 'loopStep');
    if (turn === undefined) { throw new Error('[maxi-talk] loopStep takes the page\'s turn (talkTurn()), got none.'); }
    const entry = entryOf(e);
    const out = { rows: checked(e, entry.rows(e, held)), think: entry.think(e, held) };
    turn.held = entry.hold ? entry.hold(e, held) : held;
    return out;
}

/**
 * The turn's end once the loop has returned: an approved clip still held (the loop handed back with no closing turn) is shown
 * once as the Lab's, the loop's fault in the drawer, and the Thinking line closes red. {rows: [], think: null} when nothing is held.
 */
export function turnEnd(turn) {
    const held = heldOf(turn, 'turnEnd');
    if (turn === undefined) { throw new Error('[maxi-talk] turnEnd takes the page\'s turn (talkTurn()), got none.'); }
    if (!held) { return { rows: [], think: null }; }
    const rows = checked({ role: 'loop', kind: 'ended' }, untoldRows(row('loop', 'imagination', NO_TOLD_WORDS), held));
    turn.held = null;
    return { rows: rows, think: { end: THINKING_ENDS.stopped } };
}

/** The Thinking line while the loop runs: what Maxi is doing now, the round named once it is past the first. */
export function thinkingLine(line, round) {
    return 'Thinking: ' + (round > 1 ? 'round ' + round + ' · ' : '') + line;
}

/** The Thinking line once the loop has ended: how long, how many rounds, how it ended (THINKING_ENDS). */
export function thinkingSummary(t) {
    const ends = Object.keys(THINKING_ENDS).map(function (k) { return THINKING_ENDS[k]; });
    if (!t || ends.indexOf(t.end) === -1) { throw new Error('[maxi-talk] a Thinking line ends ' + ends.join(' or ') + ', got ' + JSON.stringify(t && t.end)); }
    if (typeof t.ms !== 'number' || !(t.ms >= 0) || !Number.isInteger(t.rounds) || t.rounds < 0) { throw new Error('[maxi-talk] a Thinking summary takes {ms, rounds, end}, got ' + JSON.stringify(t)); }
    return 'Thought for ' + Math.max(1, Math.round(t.ms / 1000)) + ' s' + (t.rounds ? ' · ' + t.rounds + ' round' + (t.rounds === 1 ? '' : 's') : '') + ' · ' + t.end;
}
