/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * talk.test.mjs — the two panes' loop rows (site/app-assets/maxi-talk.js, the one owner of their shapes, their panes and the
 * Thinking line's words) and the page's use of them (maxi-lab.js renderLoop paints what loopRowsOf returns, and holds no row
 * shape of its own).
 *
 * Gates, each with its negative control:
 *   1. every role:kind the loop emits (read off maxi-loop.js's own emit calls, every maxi-roles.js VERDICT, and `asking` for
 *      every role of ROLE_ORDER) has an entry; an event the page does not show THROWS naming its role:kind;
 *   2. every row carries its PANE: the visitor's words, Maxi's answer and the Lab's facts in the conversation; the plan, every
 *      Builder and Owl row and every stop and refusal in full in the Imagination drawer; a row with no pane, or a Builder or
 *      Owl row whose pane is the conversation, is red; the conversation's labels are Maxi's, the visitor's and the Lab's only;
 *   3. a stop or refusal: the loop's words in full in the drawer, one short line in Maxi's voice in the conversation that
 *      links to the drawer; the loop's stop head is the one the table takes off (read off maxi-loop.js);
 *   4. the Thinking line: opened by the visitor's words, process words while the loop runs, closed with its summary on the
 *      approve or the stop, taken away for an answered question or a sign-in notice;
 *   5. builder:done-refused (the refused json:done): the refusal VERBATIM in a Lab row of the drawer styled as the loop's other
 *      refusals (talk-refused), the Builder's words before it in its own row; an event without its refusal text throws by name;
 *   6. maxi-lab.js renders the loop through loopRowsOf only: no role table, no verdict words, no unknown-kind throw of its own;
 *   7. designer:answer: Maxi's words alone in the conversation, linking to the turn's drawer group; the memory files under
 *      Designing there; a conversation row the page composes never carries a file name (a token ending .md outside a link)
 *      or a backtick (conversationFaults, in paneFaults, a throw); Maxi's model words are shown without backticks and each
 *      slip is counted in a plain drawer row (registerSlips), never a stop;
 *   8. the collapsed drawer's ticker (tickerOf) shows the process label and the row's lead, never a file name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    loopRowsOf, thinkingOf, thinkingLine, thinkingSummary, paneFaults, labFactFaults, conversationFaults, turnAnchor,
    registerSlips, slipWords, plainTalk, tickerOf, fileNames,
    LOOP_ROWS, ROLE_ROW, PANES, PROCESSES, DONE_REFUSED, ANSWERED, ASKING, MEMORIES_LEAD, APPROVED_FACT, NOT_STARTED_FACT, THINKING_ENDS, IMAGINATION_TITLE
} from '../../site/app-assets/maxi-talk.js';
import { VERDICTS, SEEN_ACCOUNT, ROLE_ORDER, ROLES } from '../../site/app-assets/maxi-roles.js';
import { signInRefusal, SIGN_IN_NOTICE, SIGN_IN_MARK } from '../../site/app-assets/maxi-auth.js';
import { EVENTS, SEEN, CLIP, REFUSAL } from './loop-events.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

/** Every literal role:kind the loop emits (maxi-loop.js `emit({ role: '…', kind: '…'`), `asking` aside. */
function emittedKinds(src) {
    const out = new Set();
    for (const m of src.matchAll(/emit\(\{\s*role:\s*'(\w+)',\s*kind:\s*'([\w-]+)'/g)) { if (m[2] !== ASKING) { out.add(m[1] + ':' + m[2]); } }
    return [...out];
}

const OTHERS = Object.freeze([
    { role: 'designer', kind: ANSWERED, reading: 'question', words: 'This is the tunnel.', memories: ['dse-tunnel-rebuild-card.md'] },
    { role: 'loop', kind: 'refused', words: 'Maxi did not start on "x": Record is on (a segment is rolling) — press Stop (R) first; the loop films with the same recorder.' },
    { role: 'loop', kind: 'stopped', words: 'Maxi stopped: the Owl sent it back 3 times (max rounds). Last reasons: cut.' },
    { role: 'loop', kind: 'stopped', words: 'Maxi stopped: designer: the question was NOT answered — ' + signInRefusal(new Error('User not authenticated')).message }
]);

test('every event the loop emits has an entry; one the page does not show throws by its role:kind (negative controls: a builder, a designer and an Owl kind the table lacks)', () => {
    const kinds = emittedKinds(read('site/app-assets/maxi-loop.js'));
    assert.ok(kinds.length >= 6 && kinds.includes('builder:working') && kinds.includes('loop:stopped'), 'the scan reads the loop\'s emits: ' + kinds);
    assert.ok(kinds.includes('designer:' + ANSWERED), 'the scan reads the Designer\'s answer emit: ' + kinds);
    assert.match(read('site/app-assets/maxi-loop.js'), /emit\(\{ role: role, kind: 'asking' \}\)/, 'the loop emits `asking` for the role it asks');
    const owed = kinds.concat(VERDICTS.map((v) => 'owl:' + v), ['builder:' + DONE_REFUSED, 'designer:' + ANSWERED], ROLE_ORDER.map((r) => r + ':' + ASKING));
    assert.deepEqual(owed.filter((k) => !LOOP_ROWS[k]), [], 'a loop event with no entry');
    for (const k of Object.keys(LOOP_ROWS)) { assert.equal(typeof LOOP_ROWS[k].rows, 'function', k + ' rows'); assert.equal(typeof LOOP_ROWS[k].think, 'function', k + ' think'); }
    for (const r of ROLE_ORDER) { assert.deepEqual(loopRowsOf({ role: r, kind: ASKING }), [], r + ' asking shows no row, only the Thinking line'); }
    for (const bad of [{ role: 'builder', kind: 'frobbed' }, { role: 'designer', kind: 'second-thoughts' }, { role: 'owl', kind: 'maybe', seen: SEEN, reasons: [] }]) {
        assert.throws(() => loopRowsOf(bad), new RegExp('^Error: \\[maxi-lab\\] the loop emitted an event the page does not show: ' + bad.role + ':' + bad.kind + ' '));
        assert.throws(() => thinkingOf(bad), /the loop emitted an event the page does not show/);
    }
    assert.throws(() => loopRowsOf({ role: 'narrator', kind: ASKING }), /unknown role "narrator"/);
    assert.throws(() => loopRowsOf({ kind: 'said' }), /a loop event is \{role, kind, …\}/);
});

/** Where each kind's rows go, as role@pane. */
const routes = (e) => loopRowsOf(e).map((r) => r.role + '@' + r.pane);

test('every row carries its pane: the visitor, Maxi\'s answer and the Lab\'s facts in the conversation; the plan, the Builder, the Owl and the stops in the drawer (negative controls: a row with no pane, an unknown pane, a Builder or Owl row in the conversation are each red)', () => {
    assert.deepEqual(PANES, ['conversation', 'imagination']);
    const all = EVENTS.concat(OTHERS).flatMap((e) => loopRowsOf(e).map((r) => Object.assign({ kind: e.role + ':' + e.kind }, r)));
    assert.deepEqual(paneFaults(all), [], 'every row the table makes is paintable');
    for (const r of all) { assert.ok(PANES.includes(r.pane), r.kind + ' has a pane'); }
    assert.deepEqual(routes(EVENTS[0]), ['tony@conversation']);
    assert.deepEqual(routes(EVENTS[2]), ['designer@imagination'], 'the plan words and prediction are Designing');
    assert.deepEqual(routes(EVENTS[4]), ['builder@imagination']);
    assert.deepEqual(routes(EVENTS[5]), ['builder@imagination', 'loop@imagination']);
    assert.deepEqual(routes(EVENTS[6]), ['builder@imagination']);
    assert.deepEqual(routes(EVENTS[8]), ['owl@imagination']);
    assert.deepEqual(routes(EVENTS[11]), ['owl@imagination', 'lab@conversation'], 'the approve: the verdict in the drawer, the clip in the conversation');
    assert.deepEqual(routes(OTHERS[0]), ['designer@imagination', 'designer@conversation'], 'the answer to a question: its memory files in the drawer, Maxi\'s words in the conversation');
    assert.deepEqual(routes(OTHERS[1]), ['loop@imagination', 'lab@conversation'], 'a refusal before any outline: the why in the drawer, a plain Lab fact in the conversation');
    assert.deepEqual(routes(OTHERS[2]), ['loop@imagination'], 'a stop: the drawer alone (the conversation\'s stop is the red Thinking line)');
    assert.deepEqual(routes(OTHERS[3]), ['lab@conversation'], 'the sign-in notice is a Lab fact');
    // no Builder or Owl row is ever in the conversation; the conversation's labels are Maxi's, the visitor's and the Lab's
    assert.deepEqual(all.filter((r) => r.pane === 'conversation' && (r.role === 'builder' || r.role === 'owl')), []);
    assert.deepEqual([...new Set(all.filter((r) => r.pane === 'conversation').map((r) => r.who))].sort(), ['Lab', ROLES.designer.name, 'You'].sort());
    assert.deepEqual([...new Set(all.filter((r) => r.pane === 'imagination').map((r) => r.who))].sort(), ['Lab', PROCESSES.designer, PROCESSES.builder, PROCESSES.owl].sort(), 'the drawer\'s labels are the three processes (and the Lab\'s stops)');
    assert.deepEqual(PROCESSES, { designer: 'Designing', builder: 'Building', owl: 'Checking' });
    assert.ok(!all.some((r) => /^(the )?(Designer|Builder|Owl)$/i.test(r.who)), 'no row is labelled as another speaker');
    const approved = loopRowsOf(EVENTS[11])[1];
    assert.equal(approved.text, APPROVED_FACT); assert.equal(approved.cls, 'talk-lab'); assert.equal(approved.clip, CLIP, 'the approved clip rides on the conversation\'s Lab fact');
    // negative controls: rows built by hand that the table must never make
    const ok = loopRowsOf(EVENTS[4])[0];
    assert.match(paneFaults([Object.assign({}, ok, { pane: 'conversation' })]).join(), /row 1 \(builder\) is in the conversation pane, where a builder row never shows/);
    const owl = loopRowsOf(EVENTS[11])[0];
    assert.match(paneFaults([Object.assign({}, owl, { pane: 'conversation' })]).join(), /row 1 \(owl\) is in the conversation pane, where a owl row never shows/);
    const noPane = Object.assign({}, ok); delete noPane.pane;
    assert.match(paneFaults([noPane]).join(), /row 1 \(builder\) has no pane/);
    assert.match(paneFaults([Object.assign({}, ok, { pane: 'sidebar' })]).join(), /has no pane \("sidebar"/);
    assert.match(paneFaults([Object.assign({}, ok, { who: 'the Builder' })]).join(), /is labelled \["the Builder","talk-builder"\] in the imagination pane/);
    // and through loopRowsOf: a table entry planted to put the Builder in the conversation is refused by name
    const planted = Object.assign({}, LOOP_ROWS['builder:working'], { rows: (e) => LOOP_ROWS['builder:working'].rows(e).map((r) => Object.assign({}, r, { pane: 'conversation' })) });
    assert.throws(() => { const rows = planted.rows(EVENTS[4]); const bad = paneFaults(rows); if (bad.length) { throw new Error(bad.join()); } }, /builder row never shows/);
    assert.throws(() => ROLE_ROW.builder.conversation[0], TypeError, 'the Builder has no conversation label to paint with');
});

/** maxi-talk.js with `edit` applied, imported from a temp copy (its relative imports pointed back at site/app-assets). */
async function plantedTalk(edit) {
    const src = read('site/app-assets/maxi-talk.js');
    const planted = edit(src);
    assert.notEqual(planted, src, 'the plant must change maxi-talk.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talk-plant-'));
    const assets = pathToFileURL(path.join(REPO, 'site', 'app-assets') + path.sep).href;
    const file = path.join(dir, 'maxi-talk.js');
    fs.writeFileSync(file, planted.replace(/from '\.\/(maxi-[\w-]+\.js)'/g, (m, f) => "from '" + assets + f + "'"));
    try { return await import(pathToFileURL(file).href); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('planted copies of maxi-talk.js: a Builder row put in the conversation, an Owl row put there, a row with no pane, and a hand-made row that skips the table\'s row() are each refused by loopRowsOf by name', async () => {
    const b = await plantedTalk((s) => s.replace("row('builder', 'imagination', (e.words ? e.words + '\\n' : '') + '['", "row('builder', 'conversation', (e.words ? e.words + '\\n' : '') + '['"));
    assert.throws(() => b.loopRowsOf(EVENTS[4]), /^Error: \[maxi-talk\] a builder row never shows in the conversation pane \(it shows in: imagination\)\.$/);
    const o = await plantedTalk((s) => s.replace("const out = [row('owl', 'imagination',", "const out = [row('owl', 'conversation',"));
    assert.throws(() => o.loopRowsOf(EVENTS[11]), /a owl row never shows in the conversation pane/);
    const n = await plantedTalk((s) => s.replace("rows: function (e) { return [row('designer', 'imagination', (e.words", "rows: function (e) { return [row('designer', undefined, (e.words"));
    assert.throws(() => n.loopRowsOf(EVENTS[2]), /a row's pane is one of conversation, imagination, got undefined \(role designer\)/);
    const raw = await plantedTalk((s) => s.replace("'tony:said': { rows: function (e) { return [row('tony', 'conversation', e.words)]; }",
        "'tony:said': { rows: function (e) { return [{ role: 'builder', who: 'Building', cls: 'talk-builder', text: e.words }]; }"));
    assert.throws(() => raw.loopRowsOf(EVENTS[0]), /^Error: \[maxi-talk\] tony:said made rows the page cannot paint: row 1 \(builder\) has no pane/);
    const raw2 = await plantedTalk((s) => s.replace("'tony:said': { rows: function (e) { return [row('tony', 'conversation', e.words)]; }",
        "'tony:said': { rows: function (e) { return [{ role: 'owl', pane: 'conversation', who: 'Checking', cls: 'talk-owl', text: e.words }]; }"));
    assert.throws(() => raw2.loopRowsOf(EVENTS[0]), /tony:said made rows the page cannot paint: row 1 \(owl\) is in the conversation pane, where a owl row never shows/);
    // the unplanted table, for contrast: every one of these events paints
    for (const e of EVENTS) { assert.doesNotThrow(() => loopRowsOf(e)); }
});

test('a stop or a refusal: the loop\'s words in full in the drawer only; a refusal before any outline is the plain Lab fact "Maxi did not start — why" linking there (negative controls: the old "I stopped" row, a role name, loop words or code in a Lab fact are each red)', async () => {
    const stop = loopRowsOf(OTHERS[2]);
    assert.equal(stop.length, 1, 'a stop puts nothing of its own in the conversation');
    assert.deepEqual([stop[0].pane, stop[0].who, stop[0].cls, stop[0].text], ['imagination', 'Lab', 'talk-refused', OTHERS[2].words], 'the drawer has the loop\'s words verbatim');
    const [full, fact] = loopRowsOf(OTHERS[1]);
    assert.equal(full.text, OTHERS[1].words);
    assert.deepEqual([fact.pane, fact.who, fact.cls, fact.text, fact.toDrawer], ['conversation', 'Lab', 'talk-lab', NOT_STARTED_FACT, true]);
    assert.equal(NOT_STARTED_FACT, 'Maxi did not start — why');
    assert.ok(!/talk-refused/.test(fact.cls), 'the Lab fact is never red');
    assert.deepEqual(labFactFaults(NOT_STARTED_FACT), []);
    assert.deepEqual(labFactFaults(APPROVED_FACT), []);
    // no loop words ever reach the conversation
    for (const e of EVENTS.concat(OTHERS)) {
        for (const r of loopRowsOf(e).filter((x) => x.pane === 'conversation' && x.role !== 'tony' && x.role !== 'designer')) {
            assert.ok(!e.words || r.text.indexOf(e.words) === -1 || r.text === e.words && e.role === 'tony', e.role + ':' + e.kind + ' carries the loop\'s words into the conversation');
        }
    }
    // negative controls on the gate itself
    assert.match(labFactFaults('the Builder did not start — why').join(), /carries a role's name/);
    assert.match(labFactFaults('Maxi did not start: the Owl was refused').join(), /carries a role's name/);
    assert.match(labFactFaults('I stopped: Maxi stopped: designer: nothing was asked.').join(), /carries a role's name.*|carries the loop's words/);
    assert.match(labFactFaults("window.DeSciX.call('ask_question_to_app')").join(), /carries code/);
    // planted copies of maxi-talk.js through the real loopRowsOf: the old "I stopped" row, and a role name in the Lab fact
    const old = await plantedTalk((s) => s.replace("rows: function (e) { return isSignInRefusal(e.words) ? [row('lab', 'conversation', SIGN_IN_NOTICE)] : [stopRow(e)]; },",
        "rows: function (e) { return isSignInRefusal(e.words) ? [row('lab', 'conversation', SIGN_IN_NOTICE)] : [stopRow(e), row('loop', 'conversation', 'I stopped: ' + e.words, { toDrawer: true })]; },"));
    assert.throws(() => old.loopRowsOf(OTHERS[2]), /a loop row never shows in the conversation pane/, 'negative control: the old row in Maxi\'s voice is red');
    const asLab = await plantedTalk((s) => s.replace("rows: function (e) { return isSignInRefusal(e.words) ? [row('lab', 'conversation', SIGN_IN_NOTICE)] : [stopRow(e)]; },",
        "rows: function (e) { return isSignInRefusal(e.words) ? [row('lab', 'conversation', SIGN_IN_NOTICE)] : [stopRow(e), row('lab', 'conversation', 'I stopped: ' + e.words)]; },"));
    assert.throws(() => asLab.loopRowsOf(OTHERS[2]), /made rows the page cannot paint: row 2 \(lab\): a Lab fact carries/, 'negative control: the old row\'s words as a Lab fact are red');
    const named = await plantedTalk((s) => s.replace("export const NOT_STARTED_FACT = 'Maxi did not start — why';", "export const NOT_STARTED_FACT = 'the Builder did not start — why';"));
    assert.throws(() => named.loopRowsOf(OTHERS[1]), /row 2 \(lab\): a Lab fact carries a role's name: "the Builder did not start — why"/, 'negative control: a role name in the Lab fact is red');
});

test('the drawer\'s title lives once: app.html\'s labels and the page\'s titleDrawer are IMAGINATION_TITLE (negative control: a changed constant is red)', () => {
    const html = read('site/app.html');
    const lab = read('site/app-assets/maxi-lab.js');
    const faults = (title) => {
        const bad = [];
        const want = [
            ['#imagination-lines aria-label', /<div id="imagination-lines"[^>]*aria-label="([^"]*)"/],
            ['#imagination aria-label', /<section id="imagination"[^>]*aria-label="([^"]*)"/],
            ['#imagination-title', /<b id="imagination-title">([^<]*)<\/b>/],
            ['#imagination-toggle title', /<button id="imagination-toggle"[^>]*title="([^":]*):/]
        ];
        for (const [what, re] of want) { const m = html.match(re); if (!m || m[1] !== title) { bad.push(what + ' reads ' + JSON.stringify(m && m[1]) + ', not ' + JSON.stringify(title)); } }
        const fn = lab.slice(lab.indexOf('\nfunction titleDrawer('), lab.indexOf('\n}\n', lab.indexOf('\nfunction titleDrawer(')));
        for (const line of ["el.imaginationTitle.textContent = IMAGINATION_TITLE;", "el.imagination.setAttribute('aria-label', IMAGINATION_TITLE);", "el.imaginationLines.setAttribute('aria-label', IMAGINATION_TITLE);", "el.imaginationToggle.title = IMAGINATION_TITLE + '"]) {
            if (!fn.includes(line)) { bad.push('titleDrawer does not set ' + line); }
        }
        if (!/\n {4}titleDrawer\(\);\n/.test(lab)) { bad.push('the page never calls titleDrawer at boot'); }
        return bad;
    };
    assert.deepEqual(faults(IMAGINATION_TITLE), []);
    assert.equal(html.split(IMAGINATION_TITLE).length - 1, 4, 'app.html spells the title only in those four places');
    assert.match(faults('How Maxi thought').join('\n'), /#imagination-lines aria-label reads "How I thought about it", not "How Maxi thought"/, 'negative control: a changed constant is red');
});

test('the Thinking line: opened by the visitor\'s words, process words while the loop runs, closed by the approve or the stop, taken away for an answer or a sign-in notice (negative controls: an unknown end, a bad summary are refused)', () => {
    const steps = EVENTS.map((e) => thinkingOf(e));
    assert.deepEqual(steps[0], { begin: true, line: 'reading what you said' });
    assert.deepEqual(steps.slice(1, 11).map((s) => s.line), ['thinking it through', 'planning from my memory of cl1a-mirror', 'building', 'building: dragTo ran',
        'building: the hand-back was refused, filming again', 'built: handing the clip over', 'watching the clip', 'sent back: round 2', 'building: see was refused', 'built: handing the clip over']);
    assert.deepEqual(steps[11], { end: 'approved' });
    assert.deepEqual(thinkingOf(OTHERS[0]), { none: true }, 'a question\'s answer: no Thinking line');
    assert.equal(thinkingOf(OTHERS[1]), null, 'a refusal before the visitor\'s words are taken leaves the line alone');
    assert.deepEqual(thinkingOf(OTHERS[2]), { end: 'stopped' });
    assert.deepEqual(thinkingOf(OTHERS[3]), { none: true }, 'a sign-in notice: no Thinking line');
    assert.deepEqual(THINKING_ENDS, { approve: 'approved', stopped: 'stopped' });
    assert.equal(thinkingLine('building: dragTo ran', 1), 'Thinking: building: dragTo ran');
    assert.equal(thinkingLine('watching the clip', 2), 'Thinking: round 2 · watching the clip');
    assert.equal(thinkingSummary({ ms: 48200, rounds: 2, end: 'approved' }), 'Thought for 48 s · 2 rounds · approved');
    assert.equal(thinkingSummary({ ms: 300, rounds: 1, end: 'stopped' }), 'Thought for 1 s · 1 round · stopped');
    assert.equal(thinkingSummary({ ms: 2000, rounds: 0, end: 'stopped' }), 'Thought for 2 s · stopped', 'a loop stopped before any round names none');
    assert.throws(() => thinkingSummary({ ms: 1, rounds: 1, end: 'revised' }), /a Thinking line ends approved or stopped, got "revised"/);
    assert.throws(() => thinkingSummary({ ms: -1, rounds: 1, end: 'approved' }), /takes \{ms, rounds, end\}/);
    assert.equal(turnAnchor(3), 'imagination-turn-3');
    assert.throws(() => turnAnchor(-1), /a whole number from 0/);
});

test('builder:done-refused shows the refusal verbatim as a Lab refusal row in the drawer, the Builder\'s words before it (negative control: no refusal text throws by name)', () => {
    const rows = loopRowsOf({ role: 'builder', kind: DONE_REFUSED, round: 1, words: 'The clip shows the slide; handing it to the Owl.', refusal: REFUSAL });
    const refusedStyle = loopRowsOf({ role: 'loop', kind: 'refused', words: 'w' })[0];
    assert.deepEqual(rows.map((r) => [r.who, r.cls, r.pane]), [[ROLE_ROW.builder.imagination[0], ROLE_ROW.builder.imagination[1], 'imagination'], [refusedStyle.who, refusedStyle.cls, 'imagination']]);
    assert.equal(refusedStyle.cls, 'talk-refused');
    assert.equal(rows[1].text, 'json:done refused — ' + REFUSAL, 'the refusal is shown verbatim');
    assert.equal(rows[0].text, 'The clip shows the slide; handing it to the Owl.\n[json:done]');
    assert.deepEqual(loopRowsOf({ role: 'builder', kind: DONE_REFUSED, round: 1, words: '', refusal: REFUSAL }).map((r) => r.cls), ['talk-refused'], 'no words: the refusal row alone');
    assert.throws(() => loopRowsOf({ role: 'builder', kind: DONE_REFUSED, round: 1, words: 'w' }), /builder:done-refused event carries no `refusal` text/);
    assert.throws(() => loopRowsOf({ role: 'builder', kind: DONE_REFUSED, refusal: REFUSAL, words: 3 }), /`words` is the Builder's words/);
});

test('designer:answer: the memory files under Designing in the drawer, then Maxi\'s words alone in the conversation, linking to the turn\'s group (negative controls: no memories, no words, each throws by name; the row removed from the table is red)', () => {
    const rows = loopRowsOf({ role: 'designer', kind: ANSWERED, reading: 'question', words: 'The tunnel builds its bands one hit at a time.', memories: ['dse-tunnel-rebuild-card.md'] });
    assert.deepEqual(rows.map((r) => [r.who, r.cls, r.pane]), [[PROCESSES.designer, ROLE_ROW.designer.imagination[1], 'imagination'], [ROLE_ROW.designer.conversation[0], ROLE_ROW.designer.conversation[1], 'conversation']],
        'two rows: Designing in the drawer, Maxi in the conversation');
    assert.equal(MEMORIES_LEAD, 'From my memories: ');
    assert.equal(rows[0].text, 'From my memories: dse-tunnel-rebuild-card.md', 'the drawer keeps the file list');
    assert.equal(rows[1].text, 'The tunnel builds its bands one hit at a time.', 'the conversation carries Maxi\'s words only');
    assert.equal(rows[1].toDrawer, true, 'his row links to the turn\'s group in the drawer');
    assert.equal(rows[0].clip, undefined); assert.equal(rows[1].clip, undefined, 'an answer carries no clip');
    assert.throws(() => loopRowsOf({ role: 'designer', kind: ANSWERED, words: 'w', memories: [] }), /designer:answer event names no memory files/);
    assert.throws(() => loopRowsOf({ role: 'designer', kind: ANSWERED, words: 'w' }), /designer:answer event names no memory files/);
    assert.throws(() => loopRowsOf({ role: 'designer', kind: ANSWERED, words: ' ', memories: ['a.md'] }), /designer:answer event carries no `words`/);
    assert.equal(loopRowsOf({ role: 'designer', kind: ANSWERED, words: 'As Feynman said.', memories: ['a.md', 'b.md'] })[0].text, 'From my memories: a.md, b.md', 'every memory file drawn on, in the drawer');
    const without = Object.assign({}, LOOP_ROWS); delete without['designer:' + ANSWERED];
    assert.deepEqual(emittedKinds(read('site/app-assets/maxi-loop.js')).filter((k) => !without[k]), ['designer:' + ANSWERED], 'negative control: the loop emits an answer the table without its row cannot show');
});

test('a conversation row the page composes never carries a file name or a backtick (a throw); Maxi\'s model words are shown without backticks, each slip counted in a plain drawer row under Designing, never a stop; links and the visitor\'s words are not held to it (negative controls: a page-authored backtick, the strip removed, the old file line planted back are each red)', async () => {
    assert.deepEqual(conversationFaults('The bands build up one hit at a time.'), []);
    assert.deepEqual(conversationFaults('Rota\'s piece on the Barrier of Meaning (https://egpt.descix.net/#04_ROTA/The_Barrier_of_Meaning_Rota.md) is really interesting.'), [], 'a link handed in a sentence is a person\'s link');
    assert.match(conversationFaults('From my memories: dse-tunnel-rebuild-card.md').join(), /carries a file name/);
    assert.match(conversationFaults('See README.MD.').join(), /carries a file name/);
    assert.match(conversationFaults('The `Tunnel` part.').join(), /carries a backtick/);
    assert.deepEqual(conversationFaults('a.mdx, Ph.D.'), [], 'only a token ending .md');
    // every row the table makes passes
    for (const e of EVENTS.concat(OTHERS)) { assert.deepEqual(paneFaults(loopRowsOf(e)), [], e.role + ':' + e.kind); }
    // Maxi's model words: rendered, backticks gone, bare file names left; the slip counted in the drawer, never a throw
    const words = 'It is a `Tunnel` with two slits, as dse-tunnel-rebuild-card.md and https://egpt.descix.net/#04_ROTA/x.md say; `SlitScreen` is not in it.';
    assert.deepEqual(registerSlips(words), { backticks: 4, files: 1 }, 'a file name inside a link is not a slip');
    assert.equal(slipWords({ backticks: 2, files: 1 }), 'register slip: 2 backticks, 1 file name');
    assert.equal(slipWords({ backticks: 1, files: 2 }), 'register slip: 1 backtick, 2 file names');
    assert.equal(slipWords({ backticks: 0, files: 0 }), null);
    assert.equal(plainTalk(words), 'It is a Tunnel with two slits, as dse-tunnel-rebuild-card.md and https://egpt.descix.net/#04_ROTA/x.md say; SlitScreen is not in it.');
    const rows = loopRowsOf({ role: 'designer', kind: ANSWERED, reading: 'question', words, memories: ['dse-tunnel-rebuild-card.md'] });
    assert.deepEqual(rows.map((r) => [r.pane, r.who, r.text]), [
        ['imagination', PROCESSES.designer, 'From my memories: dse-tunnel-rebuild-card.md'],
        ['imagination', PROCESSES.designer, 'register slip: 4 backticks, 1 file name'],
        ['conversation', ROLES.designer.name, plainTalk(words)]], 'the turn renders: the slip is a plain drawer row, the model words without backticks');
    assert.ok(!rows.some((r) => /talk-refused/.test(r.cls)), 'a slip is never red');
    assert.equal(loopRowsOf({ role: 'designer', kind: ANSWERED, words: 'The tunnel.', memories: ['a.md'] }).length, 2, 'no slip, no slip row');
    assert.deepEqual(loopRowsOf({ role: 'tony', kind: 'said', words: 'what is in `robotic-imagination.md`?' }).map((r) => r.text), ['what is in `robotic-imagination.md`?'], 'the visitor\'s words are theirs, unchanged');
    // negative control 1: a page-authored row with a backtick throws (a hand-made Lab fact, and a planted NOT_STARTED_FACT)
    assert.match(paneFaults([{ role: 'lab', pane: 'conversation', who: 'Lab', cls: 'talk-lab', text: 'kept as `seen-01`' }]).join(), /row 1 \(lab\): a conversation row carries a backtick/);
    assert.match(paneFaults([{ role: 'lab', pane: 'conversation', who: 'Lab', cls: 'talk-lab', text: 'kept as seen-01.md' }]).join(), /row 1 \(lab\): a conversation row carries a file name/);
    const ticked = await plantedTalk((s) => s.replace("export const NOT_STARTED_FACT = 'Maxi did not start — why';", "export const NOT_STARTED_FACT = 'Maxi did not start — `why`';"));
    assert.throws(() => ticked.loopRowsOf(OTHERS[1]), /row 2 \(lab\): a conversation row carries a backtick: "Maxi did not start — `why`"/);
    // negative control 2: the strip removed, the backticks reach the conversation (red)
    const unstripped = await plantedTalk((s) => s.replace("row('designer', 'conversation', plainTalk(e.words), { toDrawer: true })", "row('designer', 'conversation', e.words, { toDrawer: true })"));
    assert.throws(() => unstripped.loopRowsOf({ role: 'designer', kind: ANSWERED, words, memories: ['a.md'] }), /row 3 \(designer\): Maxi's words reached the conversation with their backticks/);
    // negative control 3: the old answer row (the model words, then the file line, in the conversation) is red
    const old = await plantedTalk((s) => s.replace(/return \[row\('designer', 'imagination', MEMORIES_LEAD[\s\S]*?\.concat\(\[row\('designer', 'conversation', plainTalk\(e\.words\), \{ toDrawer: true \}\)\]\);/,
        "return [row('designer', 'conversation', e.words + '\\nFrom my memories: ' + e.memories.join(', '))];"));
    assert.match(answerFaults(old.loopRowsOf).join(), /the conversation carries the file line/);
    assert.deepEqual(answerFaults(loopRowsOf), []);
});

/** The faults of a table's answer rows: the file list is the drawer's, never the conversation's. */
function answerFaults(rowsOf) {
    const f = [];
    const rows = rowsOf({ role: 'designer', kind: ANSWERED, reading: 'question', words: 'This is the tunnel.', memories: ['dse-tunnel-rebuild-card.md'] });
    if (rows.some((r) => r.pane === 'conversation' && r.text.includes(MEMORIES_LEAD))) { f.push('the conversation carries the file line'); }
    if (!rows.some((r) => r.pane === 'imagination' && r.text === MEMORIES_LEAD + 'dse-tunnel-rebuild-card.md')) { f.push('the drawer lacks the file line'); }
    return f;
}

test('the collapsed drawer\'s ticker shows the process label and the row\'s lead, never a file name (negative controls: the memory row\'s lead planted out, a ticker that keeps the whole first line, are each red)', async () => {
    const all = EVENTS.concat(OTHERS).flatMap((e) => loopRowsOf(e)).filter((r) => r.pane === 'imagination');
    for (const r of all) { assert.ok(!/\w\.md\b/.test(tickerOf(r).replace(/https?:\/\/\S+/g, '')), 'a ticker with a file name: ' + tickerOf(r)); }
    const [mem] = loopRowsOf(OTHERS[0]);
    assert.equal(tickerOf(mem), 'Designing · From my memories');
    assert.equal(tickerOf({ who: 'Building', text: 'I loaded dse-tunnel-rebuild-card.md and moved the wall\nmore' }), 'Building · I loaded …', 'model words in the drawer: cut before a file name');
    assert.equal(tickerOf({ who: 'Checking', text: 'Approved. The bands show.\nWhat I saw' }), 'Checking · Approved. The bands show.');
    const noLead = await plantedTalk((s) => s.replace("{ lead: MEMORIES_LEAD.replace(/: $/, '') }", '{}'));
    assert.equal(noLead.tickerOf(noLead.loopRowsOf(OTHERS[0])[0]), 'Designing · From my memories: …', 'without its lead the memory row is cut before the list');
    const whole = await plantedTalk((s) => s.replace("    if (typeof r.lead !== 'string') {\n", '    if (false) {\n'));
    assert.throws(() => whole.tickerOf({ who: 'Building', text: 'I loaded dse-tunnel-rebuild-card.md' }), /the drawer's ticker would show a file name: "Building · I loaded dse-tunnel-rebuild-card\.md"/);
    // one owner of the file-name fact: fileNames, with positions true through a masked link
    const sample = 'see https://egpt.descix.net/#a/B.md and card.md, then x.MD';
    assert.deepEqual(fileNames(sample), [{ token: 'card.md', at: sample.indexOf('card.md') }, { token: 'x.MD', at: sample.indexOf('x.MD') }], 'positions are true through a masked link');
    assert.equal(tickerOf({ who: 'Building', text: 'dse-tunnel-rebuild-card.md was loaded' }), 'Building · …', 'a first line that starts with a file name: one space, no empty lead');
    assert.equal(read('site/app-assets/maxi-talk.js').split('\\.md\\b').length - 1, 1, 'the file-name pattern is written once, in FILE_TOKENS (tickerOf has no copy)');
    // the verifier's plant: the owner widened to (md|json) in a copy — the ticker follows the owner and cuts, never throws
    const wide = await plantedTalk((s) => s.replace("const FILE_TOKENS = /[\\w./-]*\\w\\.md\\b/gi;", "const FILE_TOKENS = /[\\w./-]*\\w\\.(md|json)\\b/gi;"));
    assert.equal(wide.tickerOf({ who: 'Building', text: 'I loaded lab.json and moved the mirror' }), 'Building · I loaded …');
    assert.deepEqual(wide.registerSlips('lab.json'), { backticks: 0, files: 1 }, 'the slip count follows the owner');
    assert.match(wide.conversationFaults('lab.json').join(), /carries a file name/, 'the page gate follows the owner');
    const wholeLead = await plantedTalk((s) => s.replace("{ lead: MEMORIES_LEAD.replace(/: $/, '') }", '{ lead: MEMORIES_LEAD + e.memories.join(\', \') }'));
    assert.throws(() => wholeLead.tickerOf(wholeLead.loopRowsOf(OTHERS[0])[0]), /the drawer's ticker would show a file name: "Designing · From my memories: dse-tunnel-rebuild-card\.md"/);
});

test('maxi-lab.js paints the loop through loopRowsOf only (negative control: a planted row shape in the page is red)', () => {
    const own = (src) => {
        const bad = [];
        if (!/import\s*\{[^}]*\bloopRowsOf\b[^}]*\}\s*from\s*'\.\/maxi-talk\.js'/.test(src)) { bad.push('does not import loopRowsOf from ./maxi-talk.js'); }
        const body = src.slice(src.indexOf('\nfunction renderLoop('), src.indexOf('\n}\n', src.indexOf('\nfunction renderLoop(')));
        if (!/loopRowsOf\(e\)/.test(body)) { bad.push('renderLoop does not read its rows from loopRowsOf'); }
        for (const [what, re] of [['a role table', /\bROLE_ROW\b/], ['the verdict words', /'Approved\. '|'Sent back\. '/], ['an unknown-kind throw', /event the page does not show/], ['a role:kind branch', /e\.kind === '(?!asking)/]]) {
            if (re.test(src)) { bad.push('holds ' + what + ' of its own'); }
        }
        return bad;
    };
    const lab = read('site/app-assets/maxi-lab.js');
    assert.deepEqual(own(lab), []);
    const planted = lab.replace('    const rows = loopRowsOf(e);\n', "    if (e.role === 'builder' && e.kind === 'done-refused') { talkLine('Lab', e.refusal, 'talk-refused'); return; }\n    const rows = loopRowsOf(e);\n");
    assert.notEqual(planted, lab);
    assert.deepEqual(own(planted), ['holds a role:kind branch of its own']);
});

/** The talk rows of `e` through a LOOP_ROWS entry planted back to the old shape (`old`), for the negative controls below. */
const OLD_NOTICE = (e) => {
    const unnamed = e.memories.filter((m) => e.words.indexOf(m) === -1);
    const named = e.memories.filter((m) => unnamed.indexOf(m) === -1);
    const rows = [{ who: ROLE_ROW.designer.conversation[0], cls: ROLE_ROW.designer.conversation[1], text: e.words + (named.length ? '\nFrom my memories: ' + named.join(', ') : '') }];
    if (unnamed.length) { rows.push({ who: ROLE_ROW.lab.conversation[0], cls: ROLE_ROW.lab.conversation[1], text: 'Maxi named no memory for this answer: he lists ' + unnamed.join(', ') + ' as drawn on.' }); }
    return rows;
};
const OLD_STOPPED = (e) => [{ who: ROLE_ROW.loop.imagination[0], cls: ROLE_ROW.loop.imagination[1], text: e.words }];

/** The faults of a table's rows for the two events this bite shows differently. */
function noticeFaults(rowsOf) {
    const faults = [];
    const a = rowsOf({ role: 'designer', kind: ANSWERED, reading: 'question', words: 'This is the tunnel.', memories: ['dse-tunnel-rebuild-build.md'] });
    const conv = a.filter((r) => r.pane !== 'imagination');
    if (JSON.stringify(conv.map((r) => r.cls)) !== JSON.stringify(['talk-maxi'])) { faults.push('an answer naming no memory shows ' + conv.map((r) => r.cls).join(', ')); }
    else if (conv[0].text !== 'This is the tunnel.') { faults.push('Maxi\'s row is ' + JSON.stringify(conv[0].text)); }
    const words = 'Maxi stopped: designer: the question was NOT answered — ' + signInRefusal(new Error('User not authenticated')).message;
    const s = rowsOf({ role: 'loop', kind: 'stopped', words });
    if (s.length !== 1 || s[0].cls !== 'talk-lab' || s[0].text !== SIGN_IN_NOTICE) { faults.push('a sign-in stop shows ' + JSON.stringify(s)); }
    const other = rowsOf({ role: 'loop', kind: 'stopped', words: 'Maxi stopped: designer: the question was NOT answered — Request entity too large' });
    if (other.length !== 1 || other[0].cls !== 'talk-refused' || other[0].pane !== 'imagination' || !/Request entity too large/.test(other[0].text)) { faults.push('another stop shows ' + JSON.stringify(other)); }
    return faults;
}

test('a sign-in refusal is the SIGN IN Lab notice, never a red stop; an answer naming no memory is Maxi\'s row alone, no notice; every other stop stays red (negative controls: the old notice row and the old stop row are each red)', () => {
    assert.deepEqual(ROLE_ROW.lab, { conversation: ['Lab', 'talk-lab'] });
    assert.notEqual(ROLE_ROW.lab.conversation[1], ROLE_ROW.loop.imagination[1], 'the notice is not the refusal style');
    assert.ok(!/talk-refused/.test(ROLE_ROW.lab.conversation[1]), 'a Lab fact is never red');
    assert.deepEqual(noticeFaults(loopRowsOf), []);
    assert.equal(signInRefusal(new Error('Request entity too large')).message, 'Request entity too large', 'any other refusal passes unchanged');
    assert.ok(signInRefusal(new Error('User not authenticated')).message.startsWith(SIGN_IN_MARK));
    const plant = (key, fn) => (e) => (e.role + ':' + e.kind === key ? fn(e) : loopRowsOf(e));
    assert.match(noticeFaults(plant('designer:' + ANSWERED, OLD_NOTICE)).join(), /an answer naming no memory shows talk-maxi, talk-lab/);
    assert.match(noticeFaults(plant('loop:stopped', OLD_STOPPED)).join(), /a sign-in stop shows/);
});
