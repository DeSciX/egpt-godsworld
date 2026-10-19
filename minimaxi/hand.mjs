#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * hand.mjs — one act on MiniMaxi's body (minimaxi/body.mjs), from a shell.
 *
 *   node minimaxi/hand.mjs --bridge <url> [--thread <name>] [--kb A,B] [--stills N] [--no-ask] <hand> ['<json args>']
 *   node minimaxi/hand.mjs --bridge <url> ask '<json {thread, knowledgebase_names?, user_input, media?:[{path, label?}]}>'
 *   node minimaxi/hand.mjs --bridge <url> record begin|next|end|abandon     (the page's Record doors: body.mjs /bridge/record)
 *
 * <url> is the `bridge` of body.mjs's first stdout line. A hand is a name of the HANDS table
 * (site/app-assets/maxi-hands.js); the body refuses any other by name. `--kb ''` sends [] (no KB).
 * --no-ask: a footage hand films and keeps its clip ({clip, frames}, asked:false) and asks nothing.
 * stdout: the result as JSON, exit 0. A refusal: its message verbatim on stderr, exit 1 (stdout: {changes} when
 * the refused hand had already written). Bad usage: exit 2.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORD_ACTS } from './body.mjs';

function usage(msg) {
    process.stderr.write((msg ? msg + '\n' : '') +
        'usage: hand.mjs --bridge <url> [--thread <name>] [--kb A,B] [--stills N] [--no-ask] <hand> [\'<json args>\']\n' +
        '       hand.mjs --bridge <url> ask \'<json {thread, knowledgebase_names?, user_input, media?}>\'\n' +
        '       hand.mjs --bridge <url> record begin|next|end|abandon\n');
    process.exit(2);
}

export function parseArgs(argv) {
    const out = { rest: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--bridge') { out.bridge = argv[++i]; }
        else if (a === '--thread') { out.thread = argv[++i]; }
        else if (a === '--kb') { const v = argv[++i]; out.kb = (v === undefined) ? undefined : v.split(',').map((s) => s.trim()).filter(Boolean); }
        else if (a === '--stills') { out.stills = Number(argv[++i]); }
        else if (a === '--no-ask') { out.ask = false; }
        else if (a.startsWith('--')) { throw new Error('unknown flag ' + a); }
        else { out.rest.push(a); }
    }
    if (!out.bridge) { throw new Error('--bridge <url> is required (body.mjs prints it on its first line).'); }
    if (!out.rest.length) { throw new Error('name a hand (or `ask`).'); }
    out.hand = out.rest[0];
    const raw = out.rest[1];
    if (out.hand === 'record') {   // a Record door: its act is a word, not JSON
        if (RECORD_ACTS.indexOf(raw) === -1) { throw new Error('record takes one act: ' + RECORD_ACTS.join(' | ') + ', got ' + JSON.stringify(raw) + '.'); }
        out.args = { act: raw };
    }
    else if (raw === undefined) { out.args = {}; }
    else {
        try { out.args = JSON.parse(raw); } catch (e) { throw new Error('the args are not JSON: ' + e.message); }
    }
    if (out.rest.length > 2) { throw new Error('one hand and ONE JSON object of args; got extra: ' + out.rest.slice(2).join(' ')); }
    return out;
}

/** The request: {route, body} for /bridge/hand or /bridge/ask. */
export function requestOf(a) {
    if (a.hand === 'ask') { return { route: '/ask', body: a.args }; }
    if (a.hand === 'record') { return { route: '/record', body: a.args }; }
    const body = { hand: a.hand, args: a.args };
    if (a.thread !== undefined) { body.thread = a.thread; }
    if (a.kb !== undefined) { body.knowledgebase_names = a.kb; }
    if (a.stills !== undefined) { body.stills = a.stills; }
    if (a.ask === false) { body.ask = false; }
    return { route: '/hand', body: body };
}

async function main() {
    let a;
    try { a = parseArgs(process.argv.slice(2)); } catch (e) { usage(e.message); }
    const r = requestOf(a);
    const res = await fetch(a.bridge.replace(/\/$/, '') + r.route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r.body) });
    const text = await res.text();
    let got;
    try { got = JSON.parse(text); } catch (e) { process.stderr.write('the bridge answered ' + res.status + ' with non-JSON: ' + text.slice(0, 500) + '\n'); process.exit(1); }
    // exitCode, never process.exit() after a write: exit() drops what a pipe has not taken yet (a Record's folder is megabytes; measured cut at 65536 bytes)
    if (res.ok && got.result !== undefined) { process.stdout.write(JSON.stringify(got.result, null, 2) + '\n'); process.exitCode = 0; return; }
    process.stderr.write(String(got.error !== undefined ? got.error : text) + '\n');
    if (Array.isArray(got.changes) && got.changes.length) { process.stdout.write(JSON.stringify({ changes: got.changes }) + '\n'); }   // a refused hand's writes still happened
    process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { process.stderr.write(String((e && e.message) || e) + '\n'); process.exit(1); });
}
