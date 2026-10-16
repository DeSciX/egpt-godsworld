#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * owl-control.mjs — the Owl's planted negative control: ONE Owl turn, on a fresh thread, given an outline,
 * a prediction and a clip chosen to CONTRADICT the outline (e.g. the mirror left at 45° for "a mirror at
 * 30 degrees"). A verifier that approves it is not a verifier.
 *
 *   node scripts/look/owl-control.mjs --bridge <url> --brain platform|local --outline "<words>" \
 *        --prediction "<words>" --clip <mp4> --frames <dir of pngs> [--run <id>] [--expect revise|approve]
 *
 * Uses the loop's own brain (minimaxi/loop.mjs makeAsk), turn (owlTurn) and parser (parseVerdict); exits 1
 * when the verdict is not --expect (default revise). Writes minimaxi/out/runs/<run>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeAsk, parseArgs, ENV } from '../../minimaxi/loop.mjs';
import { owlTurn, parseVerdict } from '../../site/app-assets/maxi-roles.js';

const argv = process.argv.slice(2);
const pick = (k) => { const i = argv.indexOf(k); if (i === -1) { return undefined; } const v = argv[i + 1]; argv.splice(i, 2); return v; };
const prediction = pick('--prediction'); const clip = pick('--clip'); const framesDir = pick('--frames'); const expect = pick('--expect') || 'revise';
if (!prediction || !clip || !framesDir) { console.error('owl-control: --prediction, --clip and --frames are required.'); process.exit(2); }
const a = parseArgs(argv);
const frames = fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).sort().map((f) => path.resolve(framesDir, f));
const report = { run: a.run, control: 'owl', outline: a.outline, prediction, clip: path.resolve(clip), threads: {}, expect };
const ask = makeAsk(a, report, ENV);
const thread = a.run + '-owl-control';
const reply = ask('owl', thread, owlTurn({ outline: a.outline, prediction }), { path: path.resolve(clip), frames, label: 'CONTROL ' + path.basename(clip) });
report.reply = reply;
const v = parseVerdict(reply);
report.verdict = v;
fs.mkdirSync(path.join(ENV.out, 'runs'), { recursive: true });
fs.writeFileSync(path.join(ENV.out, 'runs', a.run + '.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ verdict: v.verdict, reasons: v.reasons, change: v.change, threads: report.threads }, null, 2));
if (v.verdict !== expect) { console.error('owl-control: the Owl said ' + v.verdict + ', the control expects ' + expect + '.'); process.exit(1); }
