/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * talk.test.mjs — the conversation strip's loop rows (site/app-assets/maxi-talk.js, the one owner of their shapes) and
 * the page's use of them (maxi-lab.js renderLoop paints what loopRowsOf returns, and holds no row shape of its own).
 *
 * Gates, each with its negative control:
 *   1. every role:kind the loop emits (read off maxi-loop.js's own emit calls, and every maxi-roles.js VERDICT) has a row;
 *      an event the page does not show THROWS naming its role:kind — a builder kind, a designer kind and an Owl kind the
 *      table lacks included;
 *   2. builder:done-refused (the refused json:done): the refusal VERBATIM in a Lab row styled as the loop's other refusals
 *      (talk-refused), the Builder's words before it in its own row; an event without its refusal text throws by name;
 *   3. maxi-lab.js renders the loop through loopRowsOf only: no role table, no verdict words, no unknown-kind throw of its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loopRowsOf, LOOP_ROWS, ROLE_ROW, DONE_REFUSED, ANSWERED } from '../../site/app-assets/maxi-talk.js';
import { VERDICTS, SEEN_ACCOUNT } from '../../site/app-assets/maxi-roles.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const SEEN = Object.fromEntries(Object.keys(SEEN_ACCOUNT).map((k) => [k, 'x']));
/** The doneRefusal text maxi-loop.js writes for a change no clip shows, as the Builder is handed it. */
const REFUSAL = 'json:done after 1 change(s) your last clip does not show (the first: move of mirror) — a Record\'s changes lie inside its footage; film again after the last change.';

/** Every literal role:kind the loop emits (maxi-loop.js `emit({ role: '…', kind: '…'`), `asking` aside. */
function emittedKinds(src) {
    const out = new Set();
    for (const m of src.matchAll(/emit\(\{\s*role:\s*'(\w+)',\s*kind:\s*'([\w-]+)'/g)) { if (m[2] !== 'asking') { out.add(m[1] + ':' + m[2]); } }
    return [...out];
}

test('every event the loop emits has a row; one the page does not show throws by its role:kind (negative controls: a builder, a designer and an Owl kind the table lacks)', () => {
    const kinds = emittedKinds(read('site/app-assets/maxi-loop.js'));
    assert.ok(kinds.length >= 6 && kinds.includes('builder:working') && kinds.includes('loop:stopped'), 'the scan reads the loop\'s emits: ' + kinds);
    assert.ok(kinds.includes('designer:' + ANSWERED), 'the scan reads the Designer\'s answer emit: ' + kinds);
    const owed = kinds.concat(VERDICTS.map((v) => 'owl:' + v), ['builder:' + DONE_REFUSED, 'designer:' + ANSWERED]);
    assert.deepEqual(owed.filter((k) => !LOOP_ROWS[k]), [], 'a loop event with no row');
    for (const role of Object.keys(ROLE_ROW)) { assert.equal(loopRowsOf({ role, kind: 'asking' })[0].pending, true); }
    for (const bad of [{ role: 'builder', kind: 'frobbed' }, { role: 'designer', kind: 'second-thoughts' }, { role: 'owl', kind: 'maybe', seen: SEEN, reasons: [] }]) {
        assert.throws(() => loopRowsOf(bad), new RegExp('^Error: \\[maxi-lab\\] the loop emitted an event the page does not show: ' + bad.role + ':' + bad.kind + ' '));
    }
    assert.throws(() => loopRowsOf({ role: 'narrator', kind: 'asking' }), /unknown role "narrator"/);
    assert.throws(() => loopRowsOf({ kind: 'said' }), /a loop event is \{role, kind, …\}/);
});

test('builder:done-refused shows the refusal verbatim as a Lab refusal row, the Builder\'s words before it (negative control: no refusal text throws by name)', () => {
    const rows = loopRowsOf({ role: 'builder', kind: DONE_REFUSED, round: 1, words: 'The clip shows the slide; handing it to the Owl.', refusal: REFUSAL });
    const refusedStyle = loopRowsOf({ role: 'loop', kind: 'refused', words: 'w' })[0];
    assert.deepEqual(rows.map((r) => [r.who, r.cls]), [[ROLE_ROW.builder[0], ROLE_ROW.builder[1]], [refusedStyle.who, refusedStyle.cls]]);
    assert.equal(refusedStyle.cls, 'talk-refused');
    assert.equal(rows[1].text, 'json:done refused — ' + REFUSAL, 'the refusal is shown verbatim');
    assert.equal(rows[0].text, 'The clip shows the slide; handing it to the Owl.\n[json:done]');
    assert.deepEqual(loopRowsOf({ role: 'builder', kind: DONE_REFUSED, round: 1, words: '', refusal: REFUSAL }).map((r) => r.cls), ['talk-refused'], 'no words: the refusal row alone');
    assert.throws(() => loopRowsOf({ role: 'builder', kind: DONE_REFUSED, round: 1, words: 'w' }), /builder:done-refused event carries no `refusal` text/);
    assert.throws(() => loopRowsOf({ role: 'builder', kind: DONE_REFUSED, refusal: REFUSAL, words: 3 }), /`words` is the Builder's words/);
});

test('designer:answer shows Maxi\'s words and the memory files they drew on, in his own row (negative controls: no memories, no words, each throws by name; the row removed from the table is red)', () => {
    const rows = loopRowsOf({ role: 'designer', kind: ANSWERED, reading: 'question', words: 'The card dse-tunnel-rebuild-card.md says so.', memories: ['dse-tunnel-rebuild-card.md'] });
    assert.deepEqual(rows.map((r) => [r.who, r.cls]), [[ROLE_ROW.designer[0], ROLE_ROW.designer[1]]], 'one row, Maxi\'s');
    assert.equal(rows[0].text, 'The card dse-tunnel-rebuild-card.md says so.\nFrom my memories: dse-tunnel-rebuild-card.md');
    assert.equal(rows[0].clip, undefined, 'an answer carries no clip');
    assert.throws(() => loopRowsOf({ role: 'designer', kind: ANSWERED, words: 'w', memories: [] }), /designer:answer event names no memory files/);
    assert.throws(() => loopRowsOf({ role: 'designer', kind: ANSWERED, words: 'w' }), /designer:answer event names no memory files/);
    assert.throws(() => loopRowsOf({ role: 'designer', kind: ANSWERED, words: ' ', memories: ['a.md'] }), /designer:answer event carries no `words`/);
    const without = Object.assign({}, LOOP_ROWS); delete without['designer:' + ANSWERED];
    assert.deepEqual(emittedKinds(read('site/app-assets/maxi-loop.js')).filter((k) => !without[k]), ['designer:' + ANSWERED], 'negative control: the loop emits an answer the table without its row cannot show');
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
