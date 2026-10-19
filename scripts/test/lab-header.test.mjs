/* Copyright 2023-2026 by Essam Abadir */

/**
 * lab-header.test.mjs — gates on the lab header's buttons (site/app.html; icons painted by maxi-icons.js iconButton):
 *   1. every header <button> carries an aria-label, a title and ONE <span class="label"> whose words ARE its aria-label
 *      (the label hides on phones; the aria-label names the button there);
 *   2. #btn-info comes right after #btn-code;
 *   3. Scene code and Info share one side-pane slot (never both open; aria-pressed follows each pane);
 *   4. the stylesheet hides the labels only inside the mobile @media block, and draws the icon in currentColor.
 * Every gate is shown red on a planted fault.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = fs.readFileSync(path.join(REPO, 'site', 'app.html'), 'utf8');

/** The header's buttons in order: {id, attrs, inner}. */
export function headerButtons(html) {
    const header = html.match(/<header>([\s\S]*?)<\/header>/);
    assert.ok(header, 'app.html has a <header>');
    return [...header[1].matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => {
        const attr = (k) => { const a = m[1].match(new RegExp('\\s' + k + '="([^"]*)"')); return a ? a[1] : null; };
        return { id: attr('id'), aria: attr('aria-label'), title: attr('title'), inner: m[2] };
    });
}

export function headerFaults(html) {
    const faults = [];
    const buttons = headerButtons(html);
    for (const b of buttons) {
        const who = '#' + (b.id || '?');
        if (!b.id) { faults.push('a header button has no id'); }
        if (!b.aria) { faults.push(who + ': no aria-label'); }
        if (!b.title) { faults.push(who + ': no title'); }
        const label = b.inner.match(/^<span class="label">([^<]*)<\/span>$/);
        if (!label) { faults.push(who + ': its content is not one <span class="label">words</span>'); continue; }
        if (b.aria && label[1] !== b.aria) { faults.push(who + ': label "' + label[1] + '" is not its aria-label "' + b.aria + '"'); }
    }
    const ids = buttons.map((b) => b.id);
    const code = ids.indexOf('btn-code');
    if (code === -1 || ids[code + 1] !== 'btn-info') { faults.push('#btn-info does not come right after #btn-code (order: ' + ids.join(', ') + ')'); }
    return faults;
}

test('every header button carries an aria-label, a title and its words in one label; #btn-info comes right after #btn-code (plants are red)', () => {
    const ids = headerButtons(HTML).map((b) => b.id);
    assert.deepEqual(ids, ['btn-run', 'btn-restart', 'btn-hand', 'btn-record', 'btn-code', 'btn-info', 'btn-fullscreen']);
    assert.deepEqual(headerFaults(HTML), []);
    assert.deepEqual(headerFaults(HTML.replace('<button id="btn-run" type="button" aria-label="Pause"', '<button id="btn-run" type="button"')), ['#btn-run: no aria-label']);
    assert.deepEqual(headerFaults(HTML.replace('aria-label="Restart"', 'aria-label="Again"')), ['#btn-restart: label "Restart" is not its aria-label "Again"']);
    assert.deepEqual(headerFaults(HTML.replace(/ title="Run the scene again[^"]*"/, '')), ['#btn-restart: no title']);
    const info = HTML.match(/  <button id="btn-info"[^\n]*\n/)[0];
    const moved = HTML.replace(info, '').replace('  <button id="btn-run"', info + '  <button id="btn-run"');
    assert.match(headerFaults(moved).join(), /#btn-info does not come right after #btn-code/);
    assert.deepEqual(headerFaults(HTML.replace('<span class="label">Scene code</span>', 'Scene code')), ['#btn-code: its content is not one <span class="label">words</span>']);
});

test('the stylesheet hides the header labels only on phones and paints the icons in the button\'s colour (plants are red)', () => {
    const faults = (html) => {
        const out = [];
        const mobile = html.match(/\n  @media \(max-width: 720px\), \(pointer: coarse\) and \(max-height: 600px\) \{\n([\s\S]*?)\n  \}\n/);
        if (!mobile || !/header button \.label \{ display: none; \}|, header button \.label \{ display: none; \}/.test(mobile[1])) { out.push('the mobile @media block does not hide header button .label'); }
        const outside = mobile ? html.replace(mobile[0], '') : html;
        if (/header button \.label[^{]*\{[^}]*display: none/.test(outside)) { out.push('the labels are hidden outside the mobile block'); }
        if (!/header button svg\.icon \{[^}]*fill: currentColor;/.test(html)) { out.push('the icons are not drawn in currentColor'); }
        return out;
    };
    assert.deepEqual(faults(HTML), []);
    assert.deepEqual(faults(HTML.replace('header strong, #status, header button .label { display: none; }', 'header strong, #status { display: none; }')), ['the mobile @media block does not hide header button .label']);
    assert.deepEqual(faults(HTML.replace('fill: currentColor;', 'fill: #fff;')), ['the icons are not drawn in currentColor']);
});

// ── the side panes share one slot ────────────────────────────────────────────────────────────

const LAB_SRC = fs.readFileSync(path.join(REPO, 'site', 'app-assets', 'maxi-lab.js'), 'utf8');

/** Faults of a lab source's side panes: at most one open after any click sequence, aria-pressed tracking each; no other writer. */
export function sidePaneFaults(src) {
    const faults = [];
    const fn = src.match(/\nfunction toggleSidePane\(which\) \{\n[\s\S]*?\n\}\n/);
    if (!fn) { return ['maxi-lab.js has no toggleSidePane(which)']; }
    const btn = () => ({ pressed: 'false', setAttribute(k, v) { if (k === 'aria-pressed') { this.pressed = v; } } });
    const el = { code: btn(), info: btn(), codePane: { hidden: true }, infoPane: { hidden: true } };
    const toggle = new Function('el', fn[0] + '\nreturn toggleSidePane;')(el);
    const seqs = [['code', 'info'], ['info', 'code'], ['code', 'info', 'info'], ['info', 'info', 'code', 'code'], ['code', 'info', 'code']];
    for (const seq of seqs) {
        el.codePane.hidden = true; el.infoPane.hidden = true; el.code.pressed = 'false'; el.info.pressed = 'false';
        seq.forEach((w) => toggle(w));
        const open = ['code', 'info'].filter((k) => !el[k + 'Pane'].hidden);
        if (open.length > 1) { faults.push('after ' + seq.join(' → ') + ' both panes are open'); }
        for (const k of ['code', 'info']) { if (el[k].pressed !== String(!el[k + 'Pane'].hidden)) { faults.push('after ' + seq.join(' → ') + ' #btn-' + k + ' aria-pressed is ' + el[k].pressed + ' with its pane ' + (el[k + 'Pane'].hidden ? 'closed' : 'open')); } }
        if (seq.length === 2 && el[seq[1] + 'Pane'].hidden) { faults.push('after ' + seq.join(' → ') + ' the pane clicked last is not open'); }
    }
    const rest = src.replace(fn[0], '');
    if (/(codePane|infoPane)\.hidden\s*=|(codePane|infoPane)\.(toggleAttribute|removeAttribute|setAttribute)\(/.test(rest)) { faults.push('a side pane is opened or closed outside toggleSidePane'); }
    if (!/el\.code\.addEventListener\('click', function \(\) \{ toggleSidePane\('code'\); \}\);/.test(rest) || !/el\.info\.addEventListener\('click', function \(\) \{ toggleSidePane\('info'\); \}\);/.test(rest)) { faults.push('Scene code and Info do not both click through toggleSidePane'); }
    return faults;
}

test('Scene code and Info share one side-pane slot: never both open, aria-pressed follows each pane (plants are red)', () => {
    assert.deepEqual(sidePaneFaults(LAB_SRC), []);
    const independent = LAB_SRC.replace(/\nfunction toggleSidePane\(which\) \{\n[\s\S]*?\n\}\n/, "\nfunction toggleSidePane(which) {\n    const b = el[which], p = el[which + 'Pane'];\n    p.hidden = !p.hidden;\n    b.setAttribute('aria-pressed', String(!p.hidden));\n}\n");
    assert.notEqual(independent, LAB_SRC, 'the plant applied');
    assert.match(sidePaneFaults(independent).join(), /both panes are open/);
    const bypass = LAB_SRC.replace("el.info.addEventListener('click', function () { toggleSidePane('info'); });", "el.info.addEventListener('click', function () { el.infoPane.hidden = !el.infoPane.hidden; });");
    assert.notEqual(bypass, LAB_SRC, 'the plant applied');
    assert.match(sidePaneFaults(bypass).join(), /outside toggleSidePane/);
    const noAria = LAB_SRC.replace("        panes[k][0].setAttribute('aria-pressed', String(on));\n", '');
    assert.notEqual(noAria, LAB_SRC, 'the plant applied');
    assert.match(sidePaneFaults(noAria).join(), /aria-pressed is false with its pane open/);
});
