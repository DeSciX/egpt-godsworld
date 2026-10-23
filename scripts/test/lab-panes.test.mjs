/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-panes.test.mjs — maxi-lab.js paints the loop into TWO panes: its own renderLoop, newThread and the drawer's functions
 * (their source sliced out of the page and run over a small DOM stand-in) fed the loop's events in the shapes maxi-loop.js
 * emits them (talk.test.mjs EVENTS).
 *
 * Gates, each with its negative control:
 *   1. the conversation carries the visitor's words, ONE Thinking line (live process words, then "Thought for … · approved"
 *      linking to #imagination-turn-1) and the approved clip; ZERO Builder, Owl or Designing rows; the drawer carries turn 1's
 *      group under Designing / Building / Checking, the ticker its last process line; the routing planted out (every row to the
 *      conversation) is red;
 *   2. a Thinking anchor whose target is missing is red: the drawer's group creation planted out, the link refuses by name;
 *   3. a stop: the Thinking line red, linking to the drawer, and Maxi's one short line; a question's answer: no Thinking line,
 *      Maxi's words alone in the conversation (no file name) linking to the question's own group in the drawer, which holds
 *      the memory files under Designing; the drawer row planted out, the answer's link refuses by name;
 *   4. New conversation clears both panes and the turn count;
 *   5. a model answer with backticks and a file name renders the turn (never a stop): the model words without backticks, the slip
 *      counted in a plain drawer row under Designing; the collapsed ticker never shows a file name (the page's old ticker line
 *      planted back is red);
 *   6. the page's own words in the conversation pass conversationFaults at the strip's one row painter (talkLine), by what the
 *      row IS (maxi-talk.js isPageRow), never by how it was asked for: a faulty Lab row painted every way (talkLine, labFact,
 *      paintConversation, a label or a style alone) throws by name, Maxi's and the visitor's own rows never do; a backtick and a
 *      bare file name planted into the new-conversation line throw by name; every page row left in the strip passes the gate;
 *   7. the footage rows (renderTurn's asking phase): the page's own part is gated on the visitor's row and the hand's; a hand
 *      caller's note (Maxi's words from a Run block) is shown with its backticks removed and its slip counted on the row, never
 *      a stop; the visitor's words are shown as they are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as talk from '../../site/app-assets/maxi-talk.js';
import { plainWords } from '../../site/app-assets/maxi-ask.js';
import { EVENTS } from './loop-events.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAB_SRC = fs.readFileSync(path.join(REPO, 'site', 'app-assets', 'maxi-lab.js'), 'utf8');

// ── a small DOM: what the pane functions touch, nothing more ───────────────────────────────────
class Node_ {
    constructor(doc, tag, text) { this.ownerDocument = doc; this.tagName = tag; this.children = []; this.parent = null; this._text = text || ''; this.attrs = {}; this.listeners = {}; this.hidden = false; this.scrollTop = 0; this._cls = new Set(); this.id = ''; }
    get className() { return [...this._cls].join(' '); }
    set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get classList() { const n = this; return { add: (c) => n._cls.add(c), remove: (c) => n._cls.delete(c), contains: (c) => n._cls.has(c), toggle: (c, on) => { const want = on === undefined ? !n._cls.has(c) : !!on; if (want) { n._cls.add(c); } else { n._cls.delete(c); } return want; } }; }
    get textContent() { return this.tagName === '#text' ? this._text : this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children.forEach((c) => { c.parent = null; }); this.children = []; this._text = String(v); }
    get scrollHeight() { return 1000; }
    appendChild(c) { if (c.parent) { c.remove(); } c.parent = this; this.children.push(c); return c; }
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
    contains(n) { for (let x = n; x; x = x.parent) { if (x === this) { return true; } } return false; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    click() { const ev = { prevented: false, preventDefault() { this.prevented = true; } }; (this.listeners.click || []).forEach((f) => f(ev)); return ev; }
    scrollIntoView() { this.ownerDocument.scrolledTo = this.id; }
    querySelector(sel) { return this.all().find((n) => n !== this && n.tagName === sel) || null; }
    querySelectorAll(sel) { return this.all().filter((n) => n !== this && (sel[0] === '.' ? n._cls.has(sel.slice(1)) : n.tagName === sel)); }
    all() { return [this].concat(...this.children.map((c) => c.all())); }
}
function documentOf() {
    const doc = { scrolledTo: null };
    doc.body = new Node_(doc, 'body');
    doc.createElement = (t) => new Node_(doc, t);
    doc.createTextNode = (t) => new Node_(doc, '#text', t);
    doc.getElementById = (id) => doc.body.all().find((n) => n.id === id) || null;
    return doc;
}
/** The rows of a pane as {cls, who, text, video, link}. */
function rowsOf(pane) {
    return pane.children.map((r) => ({ cls: r.className, who: (r.querySelector('b') || { textContent: '' }).textContent, text: (r.querySelector('p') || r).textContent,
        video: r.querySelectorAll('video').length, link: ((r.querySelector('p') || r).querySelector('a') || { href: null }).href }));
}

/** maxi-lab.js's pane functions (their own source, `src` for a plant) over a fresh stand-in DOM. */
function pagePanes(src, over) {
    const cut = (from, to) => {
        const a = src.indexOf(from); assert.ok(a !== -1, 'maxi-lab.js has ' + from);
        const b = src.indexOf(to, a); assert.ok(b !== -1, 'maxi-lab.js has ' + to + ' after ' + from);
        return src.slice(a, b);
    };
    const doc = documentOf();
    const mk = (id, parent, tag) => { const n = doc.createElement(tag || 'div'); n.id = id; (parent || doc.body).appendChild(n); return n; };
    const el = { talkLines: mk('talk-lines'), imagineText: { value: 'typed' }, imagination: mk('imagination', null, 'section') };
    el.imaginationToggle = mk('imagination-toggle', el.imagination, 'button');
    el.imaginationTicker = mk('imagination-ticker', el.imaginationToggle, 'span');
    el.imaginationLines = mk('imagination-lines');
    const errors = [];
    const urls = [];
    const deps = {
        el, document: doc, state: { loop: null }, thread: () => ({ reset() {} }), showError: (err) => errors.push(String(err.message || err)),
        clipUrlLedger: () => ({ make: (mime) => { urls.push(mime); return 'blob:' + urls.length; }, revokeAll: () => { urls.length = 0; } }),
        loopRowsOf: talk.loopRowsOf, thinkingOf: talk.thinkingOf, thinkingLine: talk.thinkingLine, thinkingSummary: talk.thinkingSummary,
        turnAnchor: talk.turnAnchor, tickerOf: talk.tickerOf, conversationFaults: talk.conversationFaults, IMAGINATION_TITLE: talk.IMAGINATION_TITLE,
        isPageRow: talk.isPageRow, plainTalk: talk.plainTalk, registerSlips: talk.registerSlips, slipWords: talk.slipWords, plainWords, MEMORY_OP: 'memory'
    };
    Object.assign(deps, over || {});
    const body =
        cut('\nfunction talkLine(', '\nfunction newThread(') +
        cut('\nfunction newThread(', '\n// ── the human\'s scene picker') +
        cut('\nconst inlineUrls = clipUrlLedger();', '\n/**\n * The loop\'s Records follow its rounds') +
        '\nreturn { renderLoop, newThread, setDrawer, openTurn, drawer, thinking: () => thinking, talkLine, labFact, paintConversation, renderTurn };';
    const page = new Function(...Object.keys(deps), body)(...Object.values(deps));
    return Object.assign(page, { doc, el, errors, urls });
}

/** What a run of the loop's events left in the two panes; the faults of an approved outline turn. */
function approvedTurnFaults(p) {
    const f = [];
    const conv = rowsOf(p.el.talkLines);
    const kinds = conv.map((r) => r.cls);
    if (JSON.stringify(kinds) !== JSON.stringify(['talk-row talk-tony', 'talk-row talk-maxi talk-thinking talk-thought', 'talk-row talk-lab'])) { f.push('the conversation holds ' + JSON.stringify(conv.map((r) => r.cls + ' ' + r.who + ': ' + r.text.slice(0, 40)))); return f; }
    if (conv.some((r) => /talk-builder|talk-owl|talk-designing/.test(r.cls) || /^(Building|Checking|Designing)$/.test(r.who))) { f.push('a process row is in the conversation'); }
    if (!/^Thought for \d+ s · 2 rounds · approved ↗$/.test(conv[1].text) || conv[1].link !== '#imagination-turn-1') { f.push('the Thinking line reads ' + JSON.stringify(conv[1]) + ''); }
    if (conv[2].text !== talk.APPROVED_FACT || conv[2].video !== 1) { f.push('the approved clip is not after the Thinking line: ' + JSON.stringify(conv[2])); }
    const group = p.doc.getElementById('imagination-turn-1');
    if (!group || !p.el.imaginationLines.contains(group)) { f.push('the drawer has no #imagination-turn-1'); return f; }
    const blocks = group.querySelectorAll('.imagination-process').map((b) => b.querySelector('b').textContent);
    if (JSON.stringify(blocks) !== JSON.stringify(['Designing', 'Building', 'Checking', 'Building', 'Checking'])) { f.push('the drawer\'s processes are ' + JSON.stringify(blocks)); }
    if (group.querySelector('h3').textContent !== EVENTS[0].words) { f.push('the group is not headed by the visitor\'s words'); }
    if (!/^Checking · Approved\. Good\.$/.test(p.el.imaginationTicker.textContent)) { f.push('the ticker reads ' + JSON.stringify(p.el.imaginationTicker.textContent)); }
    if (p.urls.length !== 3) { f.push('inline clips made: ' + p.urls.length + ' (each round\'s built clip in the drawer, the approved one in the conversation)'); }
    return f;
}

test('an approved outline turn: the conversation holds the visitor\'s words, ONE Thinking line and the approved clip, no process row; the drawer holds turn 1 under Designing, Building, Checking (negative control: the routing planted out is red)', () => {
    const p = pagePanes(LAB_SRC);
    p.renderLoop(EVENTS[0]);
    assert.equal(p.el.imagineText.value, '', 'the box empties when the loop takes the outline');
    const live = [];
    for (const e of EVENTS.slice(1, 11)) { p.renderLoop(e); live.push(rowsOf(p.el.talkLines)[1].text); }
    assert.equal(live[1], 'Thinking: planning from my memory of cl1a-mirror');
    assert.equal(live[3], 'Thinking: building: dragTo ran');
    assert.equal(live[7], 'Thinking: sent back: round 2');
    assert.equal(live[8], 'Thinking: round 2 · building: see was refused', 'the round is named once it is past the first');
    assert.equal(rowsOf(p.el.talkLines).length, 2, 'while the loop runs the conversation holds the visitor\'s words and the Thinking line only');
    p.renderLoop(EVENTS[11]);
    assert.deepEqual(approvedTurnFaults(p), []);
    assert.deepEqual(p.errors, []);
    // the drawer opens from its toggle state and from the Thinking line's link
    assert.equal(p.el.imaginationLines.hidden, false, 'setDrawer has not run yet: the stand-in starts open');
    p.setDrawer(false);
    assert.equal(p.el.imaginationToggle.getAttribute('aria-expanded'), 'false');
    const link = p.el.talkLines.children[1].querySelector('p').querySelector('a');
    const ev = link.click();
    assert.ok(ev.prevented, 'the link opens the drawer instead of navigating');
    assert.equal(p.el.imaginationLines.hidden, false); assert.equal(p.el.imaginationToggle.getAttribute('aria-expanded'), 'true');
    assert.equal(p.doc.scrolledTo, 'imagination-turn-1', 'the drawer scrolls to the turn');
    // negative control: the routing planted out — every row painted in the conversation
    const planted = LAB_SRC.replace("rows.forEach(function (r) { return r.pane === 'imagination' ? paintImagination(r) : paintConversation(r); });", 'rows.forEach(paintConversation);');
    assert.notEqual(planted, LAB_SRC);
    const q = pagePanes(planted);
    let threw = null;
    try { EVENTS.forEach((e) => q.renderLoop(e)); } catch (err) { threw = err; }
    assert.ok(threw || approvedTurnFaults(q).length, 'the planted routing is red');
    assert.match(threw ? threw.message : approvedTurnFaults(q).join(), /the Imagination drawer has no such turn|the conversation holds/);
});

test('a Thinking anchor whose target is missing is red: with the drawer\'s group creation planted out, the link refuses by name (and so does openTurn)', () => {
    const planted = LAB_SRC.replace('        el.imaginationLines.appendChild(g);\n', '');
    assert.notEqual(planted, LAB_SRC);
    const p = pagePanes(planted);
    EVENTS.slice(0, 11).forEach((e) => p.renderLoop(e));
    assert.throws(() => p.renderLoop(EVENTS[11]), /^Error: \[maxi-lab\] a conversation row links to imagination-turn-1, and the Imagination drawer has no such turn — nothing was linked\.$/);
    const ok = pagePanes(LAB_SRC);
    EVENTS.forEach((e) => ok.renderLoop(e));
    assert.throws(() => ok.openTurn(7), /the conversation links to imagination-turn-7, and the Imagination drawer has no such turn/);
    assert.equal(ok.openTurn(1).id, 'imagination-turn-1');
});

test('a stop: the Thinking line closes red and links to the drawer, and is the conversation\'s whole stop; a question\'s answer takes the Thinking line away, Maxi\'s words alone in the conversation and the memory files in the question\'s own drawer group (negative control: that row planted out, the link refuses by name); a refusal before any outline is the plain Lab fact "Maxi did not start — why ↗" in its own group', () => {
    const p = pagePanes(LAB_SRC);
    EVENTS.slice(0, 5).forEach((e) => p.renderLoop(e));
    p.renderLoop({ role: 'loop', kind: 'stopped', words: 'Maxi stopped: the Builder did not hand back (json:done) within 12 replies in round 1, so the loop stopped.' });
    const conv = rowsOf(p.el.talkLines);
    assert.deepEqual(conv.map((r) => r.cls), ['talk-row talk-tony', 'talk-row talk-maxi talk-thinking talk-thought talk-refused'], 'no loop words in the conversation: the red Thinking line is the stop');
    assert.match(conv[1].text, /^Thought for \d+ s · 1 round · stopped ↗$/);
    assert.equal(conv[1].link, '#imagination-turn-1');
    const g = p.doc.getElementById('imagination-turn-1');
    assert.ok(/the Builder did not hand back/.test(g.textContent), 'the stop in full in the drawer');
    // a question: the Thinking line opens with the visitor's words and goes with the answer
    p.renderLoop({ role: 'tony', kind: 'said', words: 'What is this?' });
    p.renderLoop({ role: 'designer', kind: 'asking' });
    p.renderLoop({ role: 'designer', kind: 'answer', reading: 'question', words: 'The tunnel.', memories: ['dse-tunnel-rebuild-card.md'] });
    const after = rowsOf(p.el.talkLines).slice(2);
    assert.deepEqual(after.map((r) => r.cls + ' · ' + r.who), ['talk-row talk-tony · You', 'talk-row talk-maxi · Maxi']);
    assert.deepEqual([after[1].text, after[1].link], ['The tunnel. ↗', '#imagination-turn-2'], 'Maxi\'s words alone, linking to the question\'s group');
    assert.ok(!/\.md\b|From my memories/.test(rowsOf(p.el.talkLines).map((r) => r.text).join('\n')), 'no file name in the conversation');
    assert.equal(p.thinking(), null);
    const q = p.doc.getElementById('imagination-turn-2');
    assert.ok(q && p.el.imaginationLines.contains(q), 'a question turn is turn 2 (the visitor\'s second turn) and has its own group');
    assert.equal(q.querySelector('h3').textContent, 'What is this?', 'headed by the question');
    assert.deepEqual(q.querySelectorAll('.imagination-process').map((b) => [b.querySelector('b').textContent, b.querySelector('p').textContent]),
        [['Designing', 'From my memories: dse-tunnel-rebuild-card.md']], 'the memory files under Designing, in the drawer');
    assert.equal(p.el.imaginationTicker.textContent, 'Designing · From my memories', 'the collapsed ticker: the label and the row\'s lead, never the list');
    // negative control: the drawer row planted out of the answer's rows, Maxi's link to the group refuses by name
    const lost = pagePanes(LAB_SRC, { loopRowsOf: (e) => talk.loopRowsOf(e).filter((x) => !(e.kind === 'answer' && x.pane === 'imagination')) });
    lost.renderLoop({ role: 'tony', kind: 'said', words: 'What is this?' });
    assert.throws(() => lost.renderLoop({ role: 'designer', kind: 'answer', reading: 'question', words: 'The tunnel.', memories: ['dse-tunnel-rebuild-card.md'] }),
        /^Error: \[maxi-lab\] a conversation row links to imagination-turn-1, and the Imagination drawer has no such turn — nothing was linked\.$/);
    // a refusal before any outline: a plain Lab fact linking to "Before your first outline", which holds the words
    const r = pagePanes(LAB_SRC);
    const words = 'Maxi did not start on "x": the Hand is on — put it down (H or Esc) first.';
    r.renderLoop({ role: 'loop', kind: 'refused', words });
    const fact = rowsOf(r.el.talkLines);
    assert.deepEqual(fact.map((x) => [x.cls, x.who, x.text, x.link]), [['talk-row talk-lab', 'Lab', 'Maxi did not start — why ↗', '#imagination-turn-0']]);
    const g0 = r.doc.getElementById('imagination-turn-0');
    assert.equal(g0.querySelector('h3').textContent, 'Before your first outline');
    assert.ok(g0.textContent.includes(words), 'the drawer holds the full text');
});

test('New conversation clears both panes, the drawer\'s turns and the ticker, and frees the inline clips', () => {
    const p = pagePanes(LAB_SRC);
    EVENTS.forEach((e) => p.renderLoop(e));
    assert.ok(p.el.imaginationLines.children.length === 1 && p.urls.length === 3);
    p.newThread();
    assert.deepEqual(rowsOf(p.el.talkLines).map((r) => r.cls + ' ' + r.who), ['talk-row talk-lab Lab']);
    assert.equal(p.el.imaginationLines.children.length, 0);
    assert.equal(p.el.imaginationTicker.textContent, 'nothing yet');
    assert.equal(p.urls.length, 0, 'every inline clip URL freed');
    assert.equal(p.drawer.turn, 0);
    EVENTS.forEach((e) => p.renderLoop(e));
    assert.ok(p.doc.getElementById('imagination-turn-1'), 'the next outline is turn 1 again');
});

/** The faults of a question turn whose model words slipped: rendered, not stopped; backticks gone; the slip counted; no file name in the ticker. */
function slipTurnFaults(p) {
    const f = [];
    p.renderLoop({ role: 'tony', kind: 'said', words: 'what is unique about it?' });
    p.renderLoop({ role: 'designer', kind: 'asking' });
    try { p.renderLoop({ role: 'designer', kind: 'answer', reading: 'question', words: 'The `Tunnel` part, as dse-tunnel-rebuild-card.md says, is `SlitScreen`-free.', memories: ['dse-tunnel-rebuild-card.md'] }); }
    catch (err) { f.push('the turn stopped: ' + err.message); return f; }
    const conv = rowsOf(p.el.talkLines);
    const m = conv[conv.length - 1];
    if (m.cls !== 'talk-row talk-maxi' || m.text !== 'The Tunnel part, as dse-tunnel-rebuild-card.md says, is SlitScreen-free. ↗') { f.push('Maxi\'s row reads ' + JSON.stringify(m)); }
    if (conv.some((r) => /talk-refused/.test(r.cls))) { f.push('a red row'); }
    const g = p.doc.getElementById('imagination-turn-1');
    const rows = g ? g.querySelectorAll('.imagination-process').flatMap((b) => b.querySelectorAll('p').map((x) => b.querySelector('b').textContent + ': ' + x.textContent)) : [];
    if (JSON.stringify(rows) !== JSON.stringify(['Designing: From my memories: dse-tunnel-rebuild-card.md', 'Designing: register slip: 4 backticks, 1 file name'])) { f.push('the drawer holds ' + JSON.stringify(rows)); }
    if (/\w\.md\b/.test(p.el.imaginationTicker.textContent)) { f.push('the ticker shows a file name: ' + JSON.stringify(p.el.imaginationTicker.textContent)); }
    return f;
}

test('a model answer with backticks and a file name renders the turn, never a stop: backticks gone, the slip counted under Designing, no file name in the ticker (negative control: the page\'s old ticker line is red)', () => {
    assert.deepEqual(slipTurnFaults(pagePanes(LAB_SRC)), []);
    const p = pagePanes(LAB_SRC);
    p.renderLoop({ role: 'tony', kind: 'said', words: 'What is this?' });
    p.renderLoop({ role: 'designer', kind: 'answer', reading: 'question', words: 'The tunnel.', memories: ['dse-tunnel-rebuild-card.md'] });
    assert.equal(p.el.imaginationTicker.textContent, 'Designing · From my memories');
    const old = LAB_SRC.replace('    drawer.last = tickerOf(r);', "    drawer.last = r.who + ' · ' + r.text.split('\\n')[0];");
    assert.notEqual(old, LAB_SRC, 'the plant must change the page');
    const q = pagePanes(old);
    q.renderLoop({ role: 'tony', kind: 'said', words: 'What is this?' });
    q.renderLoop({ role: 'designer', kind: 'answer', reading: 'question', words: 'The tunnel.', memories: ['dse-tunnel-rebuild-card.md'] });
    assert.equal(q.el.imaginationTicker.textContent, 'Designing · From my memories: dse-tunnel-rebuild-card.md', 'negative control: the old ticker shows the list');
});

/** The page rows left in the strip that the gate should have refused: every row maxi-talk.js calls the page's, by what is shown. */
function stripFaults(p) {
    return p.el.talkLines.children.filter((r) => talk.isPageRow(r.querySelector('b').textContent, r.className))
        .flatMap((r) => talk.conversationFaults(r.querySelector('p').textContent));
}

const BAD = 'see the `Tunnel` in dse-tunnel-rebuild-card.md';
const GATE = /^Error: \[maxi-lab\] page words in the conversation: a conversation row carries a file name: .*; a conversation row carries a backtick: /;

test('the page\'s own words pass conversationFaults at the strip\'s one row painter, by what the row is, never by how it was asked for; Maxi\'s and the visitor\'s own rows are never thrown on (negative controls: a backtick and a bare file name in the new-conversation line throw by name)', () => {
    const p = pagePanes(LAB_SRC);
    p.newThread();
    assert.deepEqual(rowsOf(p.el.talkLines).map((r) => r.who + ': ' + r.text), ['Lab: a new conversation with Maxi starts at the next outline or clip.']);
    const LABW = 'Lab';
    const ways = {
        'talkLine(\'Lab\', …)': () => p.talkLine('Lab', BAD, 'talk-lab'),
        'talkLine with a held label': () => p.talkLine(LABW, BAD, 'talk-lab'),
        'labFact': () => p.labFact(BAD),
        'paintConversation, a hand-built row': () => p.paintConversation({ who: 'Lab', text: BAD, cls: 'talk-lab' }),
        'the Lab label in another style': () => p.talkLine('Lab', BAD, 'talk-user'),
        'the Lab style under the visitor\'s label': () => p.talkLine('You', BAD, 'talk-tony talk-lab'),
        'a label nobody speaks under': () => p.talkLine('Studio', BAD, 'talk-studio')
    };
    for (const [how, paint] of Object.entries(ways)) { assert.throws(paint, GATE, how + ' paints a faulty page row'); }
    // Maxi's own words and the visitor's are theirs: shown, never thrown on (Maxi's slips are stripped and counted upstream)
    assert.doesNotThrow(() => p.talkLine('Maxi', BAD, 'talk-maxi'));
    assert.doesNotThrow(() => p.paintConversation({ who: 'You', text: BAD, cls: 'talk-tony' }));
    assert.deepEqual(stripFaults(p), [], 'no page row in the strip carries a fault');
    // the verifier's plant B9: a backtick and a bare .md name in the page's own Lab line
    const b9 = LAB_SRC.replace("labFact('a new conversation with Maxi starts at the next outline or clip.');", "labFact('a new `conversation` with Maxi starts at dse-tunnel-rebuild-card.md.');");
    assert.notEqual(b9, LAB_SRC);
    assert.throws(() => pagePanes(b9).newThread(), GATE);
});

test('the footage rows: the page\'s own part is gated on the visitor\'s row and the hand\'s; a hand caller\'s note is shown with its backticks removed and its slip counted on the row, never a stop; the visitor\'s words as they are', () => {
    const clip = [{ label: 'see clip', mime_type: 'video/webm', bytes: 2048 }];
    const p = pagePanes(LAB_SRC);
    p.renderTurn({ phase: 'asking', op: 'see', note: 'I look at the `Tunnel`, as dse-tunnel-rebuild-card.md says.', media: clip });
    const hand = p.el.talkLines.children[0];
    assert.deepEqual([hand.className, hand.querySelector('b').textContent, hand.querySelector('p').textContent],
        ['talk-row talk-lab', 'Lab', 'I look at the Tunnel, as dse-tunnel-rebuild-card.md says.\n[footage: see clip (2 KB)]']);
    assert.equal((hand.querySelector('small') || { textContent: null }).textContent, 'register slip: 2 backticks, 1 file name', 'the slip counted on the row');
    p.renderTurn({ phase: 'asking', op: 'record', note: 'moved: Mirror', teaching: 'the `mirror` from dse.md', question: null, media: clip });
    const yours = p.el.talkLines.children[2];
    assert.deepEqual([hand.querySelector('b').textContent, yours.querySelector('b').textContent, yours.querySelector('p').textContent],
        ['Lab', 'You', 'the `mirror` from dse.md\nmoved: Mirror\n[footage: see clip (2 KB)]'], 'the visitor\'s words as they are');
    assert.equal(yours.querySelector('small'), null);
    // the page's own part carrying a fault throws by name, on either row
    const bad = [{ label: 'clip `of` dse.md', mime_type: 'video/webm', bytes: 2048 }];
    assert.throws(() => pagePanes(LAB_SRC).renderTurn({ phase: 'asking', op: 'see', note: 'I look.', media: bad }), GATE);
    assert.throws(() => pagePanes(LAB_SRC).renderTurn({ phase: 'asking', op: 'record', note: 'moved: Mirror', teaching: null, question: null, media: bad }), GATE);
    assert.throws(() => pagePanes(LAB_SRC).renderTurn({ phase: 'asking', op: 'memory', note: 'a memory', teaching: null, question: 'why?', media: bad }), GATE);
});
