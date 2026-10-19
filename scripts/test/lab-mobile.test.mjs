/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-mobile.test.mjs — the lab on a phone (CEO 2026-10-18: a Send button on the dialog, since the user can't hit return;
 * full screen on mobile so no DeSciX chrome takes the real estate).
 *
 *   1. app.html's conversation form carries a Send button (#imagine-send, type=submit) beside the Imagine box.
 *   2. maxi-lab.js setConversationEnabled is the ONE writer of the box's and the button's `disabled`: no other line in the
 *      page writes either, and the owner flips both from one value (run over a fake pair).
 *   3. the full-screen door (maxi-lab.js fullscreen / fullscreenAvailability, published as window.MaxiLab.fullscreen):
 *      refuses BY NAME where the browser offers no element Fullscreen API (iPhone Safari) or the frame is not allowed
 *      full screen, and requests it on the page's own root where it can; the header's button exists and is shown only
 *      under the mobile media query.
 * The page's own functions are read from maxi-lab.js, never re-typed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHostViewModule } from './host-view-module.mjs';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site');
const read = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');

/** The page's module-level (async) function `name`, to its first closing brace at column 0. */
function fnSource(src, name) {
    const m = new RegExp('\\n(?:async )?function ' + name + '\\(').exec(src);
    assert.ok(m, 'maxi-lab.js has no function ' + name + '()');
    return src.slice(m.index + 1, src.indexOf('\n}\n', m.index) + 2);
}

function sendButtonFaults(html) {
    const faults = [];
    const form = html.match(/<form id="imagine"[^>]*>([\s\S]*?)<\/form>/);
    if (!form) { return ['app.html has no form#imagine']; }
    const btn = form[1].match(/<button\b[^>]*\bid="imagine-send"[^>]*>([^<]*)<\/button>/);
    if (!btn) { faults.push('form#imagine has no <button id="imagine-send">'); return faults; }
    if (!/\btype="submit"/.test(btn[0])) { faults.push('#imagine-send is not type="submit"'); }
    if (btn[1].trim() !== 'Send') { faults.push('#imagine-send does not read "Send" (reads ' + JSON.stringify(btn[1]) + ')'); }
    if (!/\bdisabled\b/.test(btn[0])) { faults.push('#imagine-send does not start disabled, as the box does'); }
    if (!/<input id="imagine-text"[^>]*aria-label="[^"]*Send[^"]*"/.test(form[1])) { faults.push('the Imagine box\'s aria-label does not name the Send button'); }
    return faults;
}

/** The el table's two rows for the form's controls: the ONLY place maxi-lab.js names them by id. */
const EL_ROWS = ["    imagineText: document.getElementById('imagine-text'),", "    imagineSend: document.getElementById('imagine-send'),"];

/**
 * Outside setConversationEnabled, maxi-lab.js may touch the two controls only as `el.imagineText.value` (the outline is
 * read, and cleared once the loop takes it) and `el.imagineText.focus()`. Any other reference (an alias, a bracket key, a
 * removeAttribute / toggleAttribute / Object.assign, a second selector for the ids) is a second way to the enabled state.
 */
function enabledStateFaults(src) {
    const faults = [];
    const owner = fnSource(src, 'setConversationEnabled');
    for (const row of EL_ROWS) {
        if (src.split('\n').filter((l) => l === row).length !== 1) { faults.push('the page\'s el table does not hold exactly one row ' + JSON.stringify(row.trim())); }
    }
    const rest = src.replace(owner, '').split('\n').filter((l) => !EL_ROWS.includes(l)).join('\n');
    for (const m of rest.matchAll(/imagine-(?:text|send)/g)) {
        faults.push('a second selector for the form\'s controls outside the el table: ' + JSON.stringify(rest.slice(Math.max(0, m.index - 40), m.index + 20).trim()));
    }
    for (const m of rest.matchAll(/imagine(?:Text|Send)/g)) {
        const before = rest.slice(Math.max(0, m.index - 3), m.index);
        const after = rest.slice(m.index + m[0].length, m.index + m[0].length + 9);
        const allowed = before === 'el.' && m[0] === 'imagineText' && (/^\.value\b/.test(after) || after.startsWith('.focus()'));
        if (!allowed) { faults.push('a reference to the form\'s controls outside setConversationEnabled: ' + JSON.stringify(rest.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim())); }
    }
    const el = { imagineText: { disabled: null }, imagineSend: { disabled: null } };
    const set = new Function('el', owner + '\nreturn setConversationEnabled;')(el);
    for (const on of [true, false, true]) {
        set(on);
        if (el.imagineText.disabled !== !on || el.imagineSend.disabled !== !on) { faults.push('setConversationEnabled(' + on + ') leaves box disabled=' + el.imagineText.disabled + ', Send disabled=' + el.imagineSend.disabled); }
    }
    return faults;
}

test('app.html: the conversation form carries a Send submit button beside the Imagine box (negative controls: missing, not type=submit)', () => {
    const html = read('app.html');
    assert.deepEqual(sendButtonFaults(html), []);
    assert.match(sendButtonFaults(html.replace(/<button id="imagine-send"[^>]*>Send<\/button>/, ''))[0], /no <button id="imagine-send">/);
    assert.match(sendButtonFaults(html.replace('id="imagine-send" type="submit"', 'id="imagine-send" type="button"')).join(), /not type="submit"/);
});

test('maxi-lab.js: setConversationEnabled is the one writer of the box\'s and Send\'s enabled state (negative controls: six other ways to write it)', () => {
    const src = read('app-assets/maxi-lab.js');
    assert.deepEqual(enabledStateFaults(src), []);
    const planted = src.replace('    setConversationEnabled(true);   // standalone too', '    el.imagineText.disabled = false;   // standalone too');
    assert.notEqual(planted, src, 'the plant applied');
    assert.match(enabledStateFaults(planted).join(), /a reference to the form's controls outside setConversationEnabled/);
    for (const line of ['el.imagineSend.removeAttribute(\'disabled\');', 'el.imagineSend[\'disabled\'] = false;', 'document.querySelector(\'#imagine-send\').disabled = false;',
        'el.imagineSend.toggleAttribute(\'disabled\', false);', 'Object.assign(el.imagineSend, { disabled: false });', 'el[\'imagineText\'].disabled = false;']) {
        const p = src.replace('    setConversationEnabled(true);   // standalone too', '    ' + line + '   // standalone too');
        assert.notEqual(p, src, 'the plant applied');
        assert.ok(enabledStateFaults(p).length > 0, 'the planted writer ' + line + ' is caught');
    }
    const halfOwner = src.replace('    el.imagineSend.disabled = !on;\n', '');
    assert.match(enabledStateFaults(halfOwner).join(), /Send disabled=null/);
});

/** The page's full-screen door over a fake document: {fullscreen, fullscreenAvailability, requests}. */
function door(src, docProps) {
    const requests = [];
    const root = { requestFullscreen: docProps.noApi ? undefined : async function (opts) { requests.push(opts); doc.fullscreenElement = root; } };
    const doc = Object.assign({ documentElement: root, fullscreenElement: null, exitFullscreen: async function () { doc.fullscreenElement = null; } }, docProps);
    const el = { fullscreen: { hidden: null, setAttribute() {} } };
    const painted = [];
    const iconButton = (button, icons, role, words) => { painted.push([role, words]); };   // maxi-icons.js paints; this door only chooses
    const body = fnSource(src, 'fullscreenAvailability') + fnSource(src, 'fullscreen') + fnSource(src, 'renderFullscreen') + '\nreturn { fullscreen, fullscreenAvailability };';
    return Object.assign(new Function('document', 'el', 'iconButton', 'icons', body)(doc, el, iconButton, {}), { requests, el, doc, painted });
}

test('the full-screen door refuses by name where full screen is unavailable, requests it on the page root where it is, and is published (negative control: a silent no-op)', async () => {
    const src = read('app-assets/maxi-lab.js');
    const iphone = door(src, { noApi: true, fullscreenEnabled: undefined });
    assert.equal(iphone.fullscreenAvailability().available, false);
    await assert.rejects(iphone.fullscreen(), /^Error: fullscreen: refused — this browser offers no element Fullscreen API/);
    assert.equal(iphone.el.fullscreen.hidden, null, 'nothing rendered on a refusal');
    const framed = door(src, { fullscreenEnabled: false });
    await assert.rejects(framed.fullscreen(), /fullscreen: refused — document\.fullscreenEnabled is false/);
    assert.equal(framed.requests.length, 0);
    const android = door(src, { fullscreenEnabled: true });
    assert.deepEqual(await android.fullscreen(), { fullscreen: true });
    assert.equal(android.requests.length, 1);
    assert.equal(android.el.fullscreen.hidden, false);
    assert.deepEqual(android.painted.pop(), ['fullscreenExit', 'Exit full screen'], 'in full screen the button offers the way out');
    assert.deepEqual(await android.fullscreen(false), { fullscreen: false });
    assert.match(src, /\n    fullscreen: fullscreen,\n    fullscreenAvailable: fullscreenAvailability,\n/, 'window.MaxiLab publishes the door and its availability reader');
    const silent = src.replace("if (!can.available) { throw new Error('fullscreen: refused — ' + can.why + '. The lab stays in its frame.'); }", 'if (!can.available) { return { fullscreen: false }; }');
    assert.notEqual(silent, src, 'the plant applied');
    let threw = null;
    try { await door(silent, { noApi: true }).fullscreen(); } catch (e) { threw = e; }
    assert.equal(threw, null, 'the planted silent door does not refuse: the first assertion above is what goes red');
});

test('app.html: the header\'s Full screen button exists and is shown only under the mobile media query, which is the page\'s MOBILE_QUERY', async () => {
    const html = read('app.html');
    assert.match(html, /<header>[\s\S]*<button id="btn-fullscreen" type="button"[^>]*hidden><span class="label">Full screen<\/span><\/button>[\s\S]*<\/header>/);
    assert.match(html, /header button#btn-fullscreen \{ display: none; \}/);
    const blocks = Array.from(html.matchAll(/\n  @media ([^{]+) \{\n([\s\S]*?)\n  \}\n/g)).filter((m) => /header button#btn-fullscreen:not\(\[hidden\]\) \{ display: inline-flex;/.test(m[2]));
    assert.equal(blocks.length, 1, 'exactly one top-level @media block shows the Full screen button');
    const { MOBILE_QUERY, BREAKPOINTS } = await loadHostViewModule();   // the layout rule's owner, maxi-host-view.js
    assert.equal(blocks[0][1].trim(), MOBILE_QUERY, 'the stylesheet\'s mobile query IS the page\'s MOBILE_QUERY');
    assert.ok(MOBILE_QUERY.includes('(max-width: ' + BREAKPOINTS.width + 'px)'), 'portrait phones are mobile');
    assert.ok(MOBILE_QUERY.includes('(pointer: coarse) and (max-height: ' + BREAKPOINTS.height + 'px)'), 'landscape phones are mobile');
});
