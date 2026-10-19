/* Copyright 2023-2026 by Essam Abadir */

/**
 * card.test.mjs — gates on the Info panel's scene card (site/app-assets/maxi-card.js, painted by maxi-lab.js renderInfo):
 *   1. for every registry rung the card's lines ARE the registry's fields (the tile's title / tile / what / why / how /
 *      controls when the scene has a tile row, the rung's title / group / prose always), and a scene with no tile row
 *      says so; a registry whose words no one could have typed comes back word for word (a retyped string is red);
 *   2. the labels are the ones Maxi's card memories carry (kb/GodsWorld/memories/<id>-card.md, written by
 *      scripts/gen-memories-build.mjs): every label line meets its text there as "<label>: <text>";
 *   3. no page module carries a copy of registry card text (8-word windows; a pasted sentence is red);
 *   4. maxi-lab.js paints the panel from cardLines only, and the page carries the panel.
 */

import './site-import-map.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARD_FIELDS, TILE_ABSENT, SKETCH_NO_CARD, sceneCard, cardLines, rungHeading } from '../../site/app-assets/maxi-card.js';
const registry = await import('@descix/frqtl-web/registry');   // after site-import-map.mjs registered the site's map

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── 1. the lines are the registry's fields ───────────────────────────────────────────────────

/** The lines a card must have, built here straight from the registry rows, without maxi-card.js. */
function expectedLines(reg, id) {
    const rung = reg.walkthroughById(id);
    const t = reg.EXHIBITS.find((e) => e.id === id) || null;
    const out = [{ kind: 'title', text: t ? t.title : rung.title }];
    if (t) {
        out.push({ kind: 'tile', text: t.tile });
        for (const [key, label] of [['what', 'What you are seeing'], ['why', 'Why it is impossible the usual way'], ['how', 'How FRQTL gets it'], ['controls', 'Controls']]) {
            if (t[key] !== null && t[key] !== undefined) { out.push({ kind: 'label', text: label }, { kind: 'text', text: t[key] }); }
        }
    } else {
        out.push({ kind: 'absent', text: TILE_ABSENT });
    }
    out.push({ kind: 'label', text: 'Rung ' + rung.title + ' (' + reg.walkthroughGroup(rung) + ')' }, { kind: 'text', text: rung.prose });
    return out;
}

/** A registry of two rungs, one with a tile row, every word random: no one could have typed them. */
function fakeRegistry() {
    const w = () => 'w' + Math.random().toString(36).slice(2) + ' ' + Math.random().toString(36).slice(2);
    const rungs = [{ id: 'fake-a', title: w(), prose: w(), group: w() }, { id: 'fake-b', title: w(), prose: w(), group: w() }];
    return {
        EXHIBITS: [{ kind: 'rung', id: 'fake-a', title: w(), tile: w(), what: w(), why: w(), how: w(), controls: w() }],
        walkthroughById: (id) => rungs.find((r) => r.id === id) || null,
        walkthroughGroup: (r) => r.group
    };
}

export async function assertCardModule(mod) {
    for (const rung of registry.WALKTHROUGH) {
        assert.deepEqual(mod.cardLines(mod.sceneCard(registry, rung.id)), expectedLines(registry, rung.id), 'the card for ' + rung.id + ' is not the registry\'s fields');
    }
    for (let i = 0; i < 3; i++) {
        const fake = fakeRegistry();
        for (const id of ['fake-a', 'fake-b']) {
            assert.deepEqual(mod.cardLines(mod.sceneCard(fake, id)), expectedLines(fake, id), 'a registry no one could have typed did not come back word for word (' + id + ')');
        }
    }
}

test('the card\'s lines are the registry\'s fields for every rung, and for a registry no one could have typed (a retyped string is red)', async () => {
    const withTile = registry.WALKTHROUGH.filter((r) => registry.EXHIBITS.some((e) => e.id === r.id));
    assert.equal(withTile.length, registry.EXHIBITS.length, 'every tile row is a rung');
    assert.ok(registry.WALKTHROUGH.length > withTile.length, 'the registry has rungs without a tile row');
    await assertCardModule({ sceneCard, cardLines });
    assert.deepEqual(cardLines(null), [{ kind: 'absent', text: SKETCH_NO_CARD }], 'a sketch Maxi wrote says it has no card');
    assert.throws(() => sceneCard(registry, 'no-such-scene'), /no scene "no-such-scene" in the registry/);
    const torn = Object.assign({}, registry, { EXHIBITS: registry.EXHIBITS.map((e) => (e.id === 'r8-sun' ? Object.assign({}, e, { why: undefined }) : e)) });
    assert.throws(() => sceneCard(torn, 'r8-sun'), /the tile row for "r8-sun" has no why/);
    // the plant: a "what" retyped from today's registry into the module
    const src = read('site/app-assets/maxi-card.js');
    const sun = registry.EXHIBITS.find((e) => e.id === 'r8-sun');
    const planted = src.replace('const text = t[f.key];', 'const text = f.key === \'what\' ? ' + JSON.stringify(sun.what) + ' : t[f.key];');
    assert.notEqual(planted, src, 'the plant applied');
    const mod = await import('data:text/javascript;base64,' + Buffer.from(planted).toString('base64'));
    await assert.rejects(assertCardModule(mod), /is not the registry's fields|no one could have typed/);
});

// ── 2. the labels are the card memory's ──────────────────────────────────────────────────────

export function memoryLabelFaults(lines, memory) {
    const faults = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].kind !== 'label') { continue; }
        const want = lines[i].text + ': ' + lines[i + 1].text;
        if (!memory.includes(want)) { faults.push('the card memory has no line "' + lines[i].text + ': …"'); }
    }
    return faults;
}

test('the card\'s labels are the ones Maxi\'s card memories carry, for every rung (a relabelled field is red)', () => {
    assert.deepEqual(CARD_FIELDS.map((f) => f.key), ['what', 'why', 'how', 'controls']);
    for (const rung of registry.WALKTHROUGH) {
        const file = 'kb/GodsWorld/memories/' + rung.id + '-card.md';
        assert.ok(fs.existsSync(path.join(REPO, file)), file + ' exists');
        const memory = read(file);
        const lines = cardLines(sceneCard(registry, rung.id));
        if (lines.some((l) => l.kind === 'tile')) {
            assert.ok(memory.includes('tile: ' + lines[1].text), file + ' carries the tile line');
            assert.deepEqual(memoryLabelFaults(lines, memory), [], file);
        } else {   // a rung with no tile: the memory writes the group and the prose, with no "Rung …:" line
            const card = sceneCard(registry, rung.id);
            assert.ok(memory.includes('group: ' + card.rung.group + '\n\n' + card.rung.prose), file + ' carries the group and the prose');
        }
    }
    const sun = cardLines(sceneCard(registry, 'r8-sun')).map((l) => (l.text === 'What you are seeing' ? { kind: 'label', text: 'What you see' } : l));
    assert.deepEqual(memoryLabelFaults(sun, read('kb/GodsWorld/memories/r8-sun-card.md')), ['the card memory has no line "What you see: …"']);
    assert.equal(rungHeading({ title: 'T', group: 'G' }), 'Rung T (G)');
});

// ── 3. no copy of the card text in a page module ─────────────────────────────────────────────

const WINDOW = 8;
const wordsOf = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
function windowsOf(text) { const w = wordsOf(text); const out = new Set(); for (let i = 0; i + WINDOW <= w.length; i++) { out.add(w.slice(i, i + WINDOW).join(' ')); } return out; }

/** Every 8-word window of every registry card text (tile title / tile / what / why / how / controls, rung prose). */
function registryWindows() {
    const out = new Set();
    const texts = registry.EXHIBITS.flatMap((e) => [e.tile, e.what, e.why, e.how, e.controls]).concat(registry.WALKTHROUGH.map((r) => r.prose));
    for (const t of texts) { if (typeof t === 'string') { for (const w of windowsOf(t)) { out.add(w); } } }
    return out;
}

export function copiedCardText(files, readOf, windows) {
    const out = {};
    for (const f of files) { const hits = [...windowsOf(readOf(f))].filter((w) => windows.has(w)); if (hits.length) { out[f] = hits[0]; } }
    return out;
}

test('no page module carries a copy of registry card text (a pasted sentence is red)', () => {
    const files = fs.readdirSync(path.join(REPO, 'site', 'app-assets')).filter((f) => /\.(m?js|css)$/.test(f)).map((f) => 'site/app-assets/' + f).concat(['site/app.html', 'site/scene.html']);
    assert.ok(files.includes('site/app-assets/maxi-card.js') && files.includes('site/app-assets/maxi-lab.js'));
    const windows = registryWindows();
    assert.ok(windows.size > 500, 'the registry gave its card text');
    assert.deepEqual(copiedCardText(files, read, windows), {});
    const sun = registry.EXHIBITS.find((e) => e.id === 'r8-sun');
    const planted = (f) => (f === 'site/app-assets/maxi-lab.js' ? read(f) + '\n// ' + sun.why + '\n' : read(f));
    assert.deepEqual(Object.keys(copiedCardText(files, planted, windows)), ['site/app-assets/maxi-lab.js']);
});

// ── 4. the page paints the panel from cardLines ──────────────────────────────────────────────

test('maxi-lab.js paints the Info panel from cardLines(sceneCard(…)) only, and app.html carries the panel after #code (plants are red)', () => {
    const src = read('site/app-assets/maxi-lab.js');
    const fn = src.match(/\nfunction renderInfo\(\) \{\n[\s\S]*?\n\}\n/);
    assert.ok(fn, 'maxi-lab.js has renderInfo()');
    assert.match(fn[0], /cardLines\(sc\.kind === 'registry' \? sceneCard\(CARD_REGISTRY, sc\.id\) : null\)/);
    assert.doesNotMatch(fn[0], /innerHTML/, 'textContent only');
    assert.match(src, /const CARD_REGISTRY = Object\.freeze\(\{ EXHIBITS: EXHIBITS, walkthroughById: walkthroughById, walkthroughGroup: walkthroughGroup \}\);/, 'the card reads the vendored registry\'s own exports');
    // renderInfo runs with the fake registry's lines: the panel holds exactly the card's text, in order
    const made = [];
    const doc = { createElement: (tag) => { const n = { tag, className: '', textContent: '' }; made.push(n); return n; } };
    const el = { infoBody: { textContent: 'stale', appendChild: (n) => n }, infoTitle: { textContent: '' } };
    const fake = fakeRegistry();
    const paint = new Function('document', 'el', 'state', 'cardLines', 'sceneCard', 'CARD_REGISTRY', fn[0] + '\nreturn renderInfo;');
    paint(doc, el, { scene: { kind: 'registry', id: 'fake-a', label: 'x' } }, cardLines, sceneCard, fake)();
    const lines = cardLines(sceneCard(fake, 'fake-a'));
    assert.equal(el.infoTitle.textContent, lines[0].text);
    assert.deepEqual(made.map((n) => [n.tag, n.className, n.textContent]), lines.slice(1).map((l) => [l.kind === 'label' ? 'h3' : 'p', 'info-' + l.kind, l.text]));
    const retyped = fn[0].replace('n.textContent = l.text;', 'n.textContent = l.kind === \'text\' ? \'A sphere emitter, walls\' : l.text;');
    made.length = 0;
    new Function('document', 'el', 'state', 'cardLines', 'sceneCard', 'CARD_REGISTRY', retyped + '\nreturn renderInfo;')(doc, el, { scene: { kind: 'registry', id: 'fake-a', label: 'x' } }, cardLines, sceneCard, fake)();
    assert.notDeepEqual(made.map((n) => n.textContent), lines.slice(1).map((l) => l.text), 'a painter that retypes a field is caught');
    const html = read('site/app.html');
    assert.match(html, /<\/aside>\n  <!--[^\n]*-->\n  <aside id="info" hidden aria-labelledby="info-title">\n    <div class="info-head" id="info-title"><\/div>\n    <div id="info-body"><\/div>\n  <\/aside>/);
});

// ── one wording of the card's labels on the page ─────────────────────────────────────────────

/** Faults of the Info button's title and its intro row: each carries the three tile labels verbatim (first letter folded). */
export function infoWordingFaults(title, says) {
    const faults = [];
    const phrases = CARD_FIELDS.filter((f) => !f.optional).map((f) => f.label.charAt(0).toLowerCase() + f.label.slice(1));
    for (const [who, text] of [['#btn-info title', title], ['EXPLAINERS btn-info', says]]) {
        for (const p of phrases) { if (!text.includes(p)) { faults.push(who + ' lacks "' + p + '"'); } }
    }
    return faults;
}

test('the Info button\'s title and its intro row use the card\'s own label phrases verbatim (a reworded phrase is red)', async () => {
    const { EXPLAINERS } = await import('../../site/app-assets/maxi-intro.js');
    const title = read('site/app.html').match(/<button id="btn-info"[^>]*\stitle="([^"]*)"/)[1].replace(/&#39;|&apos;/g, '\'');
    const says = EXPLAINERS['btn-info'].says;
    assert.deepEqual(infoWordingFaults(title, says), []);
    assert.deepEqual(infoWordingFaults(title.replace('why it is impossible', 'why it is thought impossible'), says), ['#btn-info title lacks "why it is impossible the usual way"']);
    assert.deepEqual(infoWordingFaults(title, says.replace('how FRQTL gets it', 'how it works')), ['EXPLAINERS btn-info lacks "how FRQTL gets it"']);
});
