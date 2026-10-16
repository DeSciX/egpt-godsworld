#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * loop.mjs — ONE MiniMaxi loop: Tony's outline → the Designer's plan → the Builder's hands and clip →
 * the Owl's verdict → a seen-memory draft (approve) or back to the Builder (revise), up to --max-rounds.
 *
 *   node minimaxi/loop.mjs --bridge <url> --brain platform|local --outline "<words>" [--max-rounds N]
 *                          [--max-steps N] [--frames N] [--answer-timeout S] [--run <id>]
 *   (the defaults are ARG_DEFAULTS below — the loop's own LOOP_LIMITS — and USAGE prints them)
 *
 * The body (minimaxi/body.mjs, started with --brain none) holds the world; every hand runs through it as
 * `node minimaxi/hand.mjs --bridge <url> <hand> '<json>'` (exit 0: the result JSON; exit 1: the refusal),
 * one at a time. The ORDER of turns and every stop rule are site/app-assets/maxi-loop.js (createLoop, the
 * one owner, shared with the lab page); the roles, their turns and parsers are maxi-roles.js. This file is
 * the node DRIVER only: it supplies the loop with a brain (the platform ask door or the local file
 * hand-off, a thread per role), a body (hand.mjs over the bridge; footage as file paths + stills), and
 * writes the run report and, on approve, the seen-memory draft: written at once when the approving Owl is the
 * LOCAL Owl (its look: the frames of its turn file, its seen account); on the platform brain the approve
 * writes only <run>.record.json beside the report and the command a human runs after looking at the stills,
 * naming the looker by role (lab-owner, godsworld-seat-author), never by a person's name
 * (scripts/gen-memories-seen.mjs refuses a memory without a look; the platform brain's word is not one).
 *
 * --brain platform: each role is a thread of the egpt-godsworld app (the persona is its system prompt),
 *   asked through the body's ask door `hand.mjs --bridge <url> ask '{thread, knowledgebase_names,
 *   user_input, media?}'` with the role's own KB list; a clip rides as media on the turn after the hand
 *   that filmed it. Threads are named <run>-designer, <run>-builder, <run>-owl-r<n> (a fresh Owl per
 *   verdict: it sees outline + prediction + footage, nothing else).
 * --brain local: each turn is a FILE hand-off for a Claude Code agent (plugin/agents/maxi-<role>.md):
 *   the loop writes minimaxi/out/turns/<run>/<n>-<role>.md (the turn text, the frame paths sampled from
 *   the clip that rides with it) and waits for <n>-<role>.answer.md beside it.
 *
 * Stops LOUDLY (exit 1, the reason on stderr, the report still written) whenever the loop stops (maxi-loop.js
 * names every rule: a malformed hand-off, an undescribed clip, json:done before any clip, --max-steps Builder
 * replies in a round, --max-rounds revises, a clip outside 5–10 s).
 * Report: minimaxi/out/runs/<run>.json — every turn, every hand, every clip, the verdicts, the token
 * cost per thread (the sum of each answer's usage).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as roles from '../site/app-assets/maxi-roles.js';
import { createLoop, LOOP_LIMITS } from '../site/app-assets/maxi-loop.js';
import { CLIP_FACTS } from '../site/app-assets/maxi-hands.js';
import { FOOTAGE_KEYS } from './body.mjs';
import { writeSeenDraft, memoryId, LOOKERS } from '../scripts/gen-memories-seen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');
const HAND_CLI = path.join(HERE, 'hand.mjs');
/** Where the loop runs: the checkout (root), its out dir and the body CLI. Tests point these at a fake body. */
export const ENV = Object.freeze({ root: REPO, out: OUT, handCli: HAND_CLI });

// ── arguments ────────────────────────────────────────────────────────────────────────────────
export const ARG_DEFAULTS = Object.freeze({ maxRounds: LOOP_LIMITS.rounds, maxSteps: LOOP_LIMITS.builderTurns, frames: 8, answerTimeout: 1800 });
export const USAGE = 'node minimaxi/loop.mjs --bridge <url> --brain platform|local --outline "<words>" [--max-rounds ' + ARG_DEFAULTS.maxRounds +
    '] [--max-steps ' + ARG_DEFAULTS.maxSteps + '] [--frames ' + ARG_DEFAULTS.frames + '] [--answer-timeout ' + ARG_DEFAULTS.answerTimeout + '] [--run <id>]';

export function parseArgs(argv) {
    const a = Object.assign({}, ARG_DEFAULTS);
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const v = argv[i + 1];
        const take = () => { if (v === undefined) { throw new Error('loop: ' + k + ' needs a value.'); } i++; return v; };
        if (k === '--bridge') { a.bridge = take(); }
        else if (k === '--brain') { a.brain = take(); }
        else if (k === '--outline') { a.outline = take(); }
        else if (k === '--max-rounds') { a.maxRounds = Number(take()); }
        else if (k === '--max-steps') { a.maxSteps = Number(take()); }
        else if (k === '--frames') { a.frames = Number(take()); }
        else if (k === '--answer-timeout') { a.answerTimeout = Number(take()); }
        else if (k === '--run') { a.run = take(); }
        else { throw new Error('loop: unknown argument ' + k + ' — usage: ' + USAGE); }
    }
    if (!a.bridge) { throw new Error('loop: --bridge <url> is required (the first stdout line of minimaxi/body.mjs names it).'); }
    if (a.brain !== 'platform' && a.brain !== 'local') { throw new Error('loop: --brain must be platform or local, got ' + JSON.stringify(a.brain)); }
    if (typeof a.outline !== 'string' || !a.outline.trim()) { throw new Error('loop: --outline "<words>" is required.'); }
    ['maxRounds', 'maxSteps', 'frames', 'answerTimeout'].forEach((k) => {
        if (!Number.isInteger(a[k]) || a[k] < 1) { throw new Error('loop: ' + k + ' must be a positive whole number, got ' + a[k]); }
    });
    a.run = a.run || ('mm' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14));
    if (!/^[a-z0-9-]+$/.test(a.run)) { throw new Error('loop: --run must be lowercase letters, digits and dashes, got ' + a.run); }
    return a;
}

// ── the body ─────────────────────────────────────────────────────────────────────────────────
/** Run one hand.mjs call (one at a time: spawnSync). Returns {ok, result} | {ok:false, error}. A hand runs
 *  `--no-ask` (it films and returns {clip, frames} with absolute paths, asking nothing); `ask` is the door. */
export function bodyCall(bridge, op, args, env) {
    env = env || ENV;
    // every hand runs with --no-ask: the body films and keeps the clip; the LOOP puts it on the role's next turn
    const argv = [env.handCli, '--bridge', bridge].concat(op === 'ask' ? [] : ['--no-ask'], [op, JSON.stringify(args)]);
    const r = spawnSync(process.execPath, argv, { cwd: env.root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error) { throw new Error('loop: could not run ' + env.handCli + ': ' + r.error.message); }
    const out = (r.stdout || '').trim();
    if (r.status === 0) {
        const at = out.indexOf('{');   // parse by shape: the result is the JSON object on stdout
        if (at === -1) { throw new Error('loop: hand.mjs ' + op + ' exited 0 with no JSON object on stdout: ' + JSON.stringify(out.slice(0, 400))); }
        let result;
        try { result = JSON.parse(out.slice(at)); } catch (e) { throw new Error('loop: hand.mjs ' + op + ' exited 0 but its stdout is not one JSON object (' + e.message + '): ' + out.slice(0, 400)); }
        return { ok: true, result: result };
    }
    if (r.status === 1) { return { ok: false, error: (out || (r.stderr || '').trim()) }; }
    throw new Error('loop: hand.mjs ' + op + ' exited ' + r.status + ' (neither a result nor a refusal): ' + (r.stderr || out).slice(0, 800));
}

/** Evenly sampled frame paths of a clip (first and last always in). */
export function sampleFrames(frames, n) {
    if (!Array.isArray(frames) || !frames.length) { return []; }
    if (frames.length <= n) { return frames.slice(); }
    const out = [];
    for (let i = 0; i < n; i++) { out.push(frames[Math.round(i * (frames.length - 1) / (n - 1))]); }
    return out;
}

// ── the two brains: ask(role, thread, text, clip|null) → reply text ─────────────────────────
function platformBrain(a, report, env) {
    return function ask(role, thread, text, clip) {
        const params = { thread: thread, knowledgebase_names: roles.ROLES[role].knowledgebase_names.slice(), user_input: text };
        if (clip) { params.media = [{ path: clip.path, label: clip.label }]; }
        const r = bodyCall(a.bridge, 'ask', params, env);
        if (!r.ok) { throw new Error('loop: the ' + role + ' was NOT asked (thread ' + thread + ') — the ask door refused: ' + r.error); }
        const ans = r.result;
        if (typeof ans.answer !== 'string' || typeof ans.interaction_id !== 'string') {
            throw new Error('loop: the ask door answered without {answer, interaction_id}: keys [' + Object.keys(ans).join(', ') + ']');
        }
        const t = report.threads[thread] || (report.threads[thread] = { role: role, interaction_ids: [], turns: 0, usage: {} });
        t.interaction_ids.push(ans.interaction_id);
        t.turns += 1;
        const u = ans.usage || {};
        ['input_tokens', 'output_tokens', 'thinking_tokens', 'media_tokens', 'total_tokens'].forEach((k) => {
            if (typeof u[k] === 'number') { t.usage[k] = (t.usage[k] || 0) + u[k]; }
        });
        t.model = ans.model || u.model_used || t.model || null;
        return ans.answer;
    };
}

function localBrain(a, report, env) {
    const dir = path.join(env.out, 'turns', a.run);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    return function ask(role, thread, text, clip) {
        n += 1;
        const stem = String(n).padStart(2, '0') + '-' + role;
        const turnFile = path.join(dir, stem + '.md');
        const answerFile = path.join(dir, stem + '.answer.md');
        const frames = clip ? sampleFrames(clip.frames, a.frames) : [];
        const body = [
            '# MiniMaxi turn ' + n + ' — ' + roles.ROLES[role].title + ' (agent maxi-' + role + ', thread ' + thread + ')',
            '',
            'Write your whole reply to: ' + answerFile,
            role === 'builder' ? 'Body CLI for reading hands: node ' + path.relative(env.root, env.handCli) + ' --bridge ' + a.bridge + ' <inventory|sceneSource> \'<json>\'' : null,
            '',
            '## The turn',
            '',
            text,
            frames.length ? '\n## The footage — ' + clip.label + ' (' + frames.length + ' frames sampled from ' + clip.frames.length + ', in order; open every one)\n\n' + frames.map((f) => '- ' + f).join('\n') : null,
            ''
        ].filter((l) => l !== null).join('\n');
        fs.writeFileSync(turnFile, body);
        const t = report.threads[thread] || (report.threads[thread] = { role: role, turn_files: [], turns: 0 });
        t.turn_files.push(path.relative(env.root, turnFile));
        t.turns += 1;
        process.stderr.write('[loop] turn ' + n + ' (' + role + ') waiting for ' + path.relative(env.root, answerFile) + '\n');
        const deadline = Date.now() + a.answerTimeout * 1000;
        while (!fs.existsSync(answerFile)) {
            if (Date.now() > deadline) { throw new Error('loop: no answer at ' + answerFile + ' within ' + a.answerTimeout + ' s — the local ' + role + ' did not answer.'); }
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);   // let the writer finish
        return fs.readFileSync(answerFile, 'utf8');
    };
}

/** The brain a run asks through: ask(role, thread, text, clip|null) → reply text (records usage/turn files on report). */
export function makeAsk(a, report, env) {
    return (a.brain === 'platform' ? platformBrain : localBrain)(a, report, env || ENV);
}

// ── the driver: a brain and a body for maxi-loop.js, the report and the memory draft ─────────

/** The node BRAIN: thread(role, key) → a thread named <run>-<key>, asked through makeAsk; every turn lands in the report. */
function nodeBrain(a, report, env, save) {
    const ask = makeAsk(a, report, env);
    return {
        thread: function (role, key) {
            const name = a.run + '-' + key;
            return {
                get turns() { return report.threads[name] ? report.threads[name].turns : 0; },
                get id() {
                    const t = report.threads[name];
                    if (!t) { throw new Error('loop: no thread ' + name + ' in the report — a memory names only threads that answered.'); }
                    return t.interaction_ids ? t.interaction_ids[t.interaction_ids.length - 1] : ('local ' + t.turn_files.join(', '));
                },
                ask: async function (text, clip) {
                    const reply = ask(role, name, text, clip);
                    report.turns.push({ role: role, thread: name, text: text, media: clip ? { path: path.relative(env.root, clip.path), label: clip.label } : null, reply: reply });
                    save();
                    return reply;
                }
            };
        }
    };
}

/** The node BODY: a hand is one hand.mjs call (--no-ask); its footage is the clip file + its stills (FOOTAGE_KEYS), which ride as media, never as turn text. */
function nodeBody(a, env) {
    return {
        omit: [FOOTAGE_KEYS.clip, FOOTAGE_KEYS.stills],
        run: async function (hand, args) {
            const r = bodyCall(a.bridge, hand, args, env);
            if (!r.ok) { return { ok: false, error: r.error }; }
            const filmed = r.result && r.result[FOOTAGE_KEYS.clip];
            if (filmed && !Array.isArray(r.result[FOOTAGE_KEYS.stills])) { throw new Error('loop: ' + hand + ' filmed ' + filmed + ' but its result carries no `' + FOOTAGE_KEYS.stills + '` still paths. Stopped.'); }
            return {
                ok: true, result: r.result,
                clip: filmed ? {
                    path: path.resolve(env.root, filmed),
                    frames: r.result[FOOTAGE_KEYS.stills].map((f) => path.resolve(env.root, f)),
                    label: r.result[CLIP_FACTS.label], seconds: r.result[CLIP_FACTS.seconds]
                } : null
            };
        }
    };
}

export async function runLoop(a, env) {
    env = env || ENV;
    const report = { run: a.run, brain: a.brain, outline: a.outline, bridge: a.bridge, started: new Date().toISOString(), threads: {}, turns: [], rounds: [], outcome: null };
    const reportPath = path.join(env.out, 'runs', a.run + '.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    const roundOf = (n) => report.rounds.find((r) => r.round === n) || (report.rounds.push({ round: n, steps: [], verdict: null }), report.rounds[report.rounds.length - 1]);
    const onEvent = (e) => {
        if (e.role === 'designer' && e.kind === 'plan') { report.plan = e.plan; report.designerWords = e.words; save(); }
        else if (e.role === 'builder' && e.kind === 'working') {
            const step = { hand: e.hand, args: e.args, prediction: e.prediction, ok: e.ok };
            if (e.ok) { step.result = e.result; } else { step.error = e.error; }
            roundOf(e.round).steps.push(step); save();
        } else if (e.role === 'owl' && e.kind !== 'asking') {
            const rr = roundOf(e.round);
            rr.verdict = e.verdict;
            rr.clip = { path: path.relative(env.root, e.clip.path), label: e.clip.label, prediction: e.prediction };
            save();
        }
    };
    const loop = createLoop({ roles: roles, brain: nodeBrain(a, report, env, save), body: nodeBody(a, env), onEvent: onEvent, limits: { rounds: a.maxRounds, builderTurns: a.maxSteps } });
    try {
        const out = await loop.imagine(a.outline);
        const rec = {
            id: memoryId(out.plan.scene, a.run), date: new Date().toISOString().slice(0, 10), brain: a.brain, outline: a.outline, plan: out.plan,
            designerWords: out.designerWords, steps: out.steps, clip: out.clip, prediction: out.prediction,
            builderWords: out.builderWords, owl: out.owl, threads: out.threads
        };
        if (a.brain === 'local') {
            const owlTurn = String(out.threads.owl).replace(/^local /, '').split(', ').pop();
            const account = 'turn file ' + owlTurn + '; contact: ' + out.owl.seen.contact + '; after: ' + out.owl.seen.after + '; passes: ' + out.owl.seen.passes;
            report.memory = writeSeenDraft(rec, { by: 'local-owl', who: 'maxi-owl', stills: sampleFrames(out.clip.frames, a.frames).length, account: account }, env.root);
            report.outcome = 'approved in round ' + out.rounds;
        } else {
            const recordPath = path.join(env.out, 'runs', a.run + '.record.json');
            fs.writeFileSync(recordPath, JSON.stringify(rec, null, 2) + '\n');
            report.awaitingLook = {
                record: path.relative(env.root, recordPath), stills: out.clip.frames.map((f) => path.relative(env.root, f)),
                command: 'node scripts/gen-memories-seen.mjs ' + path.relative(env.root, recordPath) + ' --looked-by <' + LOOKERS.filter((k) => k !== 'local-owl').join('|') +
                    '>:<role> --stills <N looked at> --account "<contact, after, passes, in your words>"'
            };
            report.outcome = 'approved in round ' + out.rounds + ' by the platform Owl: no memory written until a human or the seat looks at the stills (' + report.awaitingLook.command + ')';
        }
        save();
        return report;
    } catch (e) {
        report.outcome = 'STOPPED: ' + e.message;
        save();
        e.report = reportPath;
        throw e;
    }
}

/** The token cost per thread, as a table. */
export function costTable(report) {
    const rows = Object.keys(report.threads).map((th) => {
        const t = report.threads[th];
        const u = t.usage || {};
        return th + ' (' + t.role + ', ' + t.turns + ' turns): input ' + (u.input_tokens || 0) + ' · output ' + (u.output_tokens || 0) +
            ' · thinking ' + (u.thinking_tokens || 0) + ' · media ' + (u.media_tokens || 0) + ' · total ' + (u.total_tokens || 0);
    });
    return rows.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let a;
    try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
    runLoop(a).then((report) => {
        console.log(JSON.stringify({ run: report.run, outcome: report.outcome, memory: report.memory, awaitingLook: report.awaitingLook, report: path.relative(REPO, path.join(OUT, 'runs', report.run + '.json')) }));
        if (a.brain === 'platform') { console.log(costTable(report)); }
    }, (e) => {
        console.error('[loop] ' + e.message + (e.report ? '\n[loop] report: ' + path.relative(REPO, e.report) : ''));
        process.exit(1);
    });
}
