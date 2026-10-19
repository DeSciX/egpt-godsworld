/* Copyright 2023-2026 by Essam Abadir */

/**
 * ask-door.mjs — MiniMaxi's NODE question door.
 *
 * In the App Shell the lab asks Maxi about a clip through window.DeSciX.call; standalone that door
 * throws. minimaxi/body.mjs exposes `window.MaxiHostDoor` on the lab page, and every footage question
 * the page asks (lab.ask → {op, note, media[]}) lands HERE, in node:
 *
 *   1. every clip is written to <out>/<stamp>-<hand>.mp4 and sampled into <out>/<stamp>-<hand>/frame-NN.png
 *      (at most `stills` frames, evenly spaced: a local reader looks at these; the eyes stay the MP4);
 *   2. --brain none   → {asked:false, clip, frames}; NO platform call;
 *      --brain platform → the question runs through the published CLI,
 *        npx -y -p <DESCIX_CLI> descix mcp execute --tool ask_question_to_app --params <json> --json
 *      on a NAMED thread with that thread's knowledgebase_names. The params, the answer and the thread
 *      are maxi-ask.js's (createThread → buildAskParams / readAnswer; footageUserInput): this file types
 *      none of them. Each thread's last interaction id lives in <out>/threads.json,
 *      {<thread>: {interaction_id, turns, media_tokens_total}}.
 *
 * Every CLI call's raw stdout/stderr is kept under <out>/cli/. Fail loud: no `env: prod … https://descix.net`
 * origin line, a non-zero exit, output with
 * no JSON object, a refused answer — each THROWS verbatim and threads.json is not touched. No retry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

import { ASK, FOOTAGE_MIME, createThread, footageUserInput, knowledgebaseNamesOf } from '../site/app-assets/maxi-ask.js';

export const BRAINS = Object.freeze(['none', 'platform']);

/**
 * The published CLI this repo runs, pinned: the ONE owner of the version (scripts/test/cli-pin.test.mjs holds every
 * `npx -y -p` pin of @descix/cli in the tracked tree to it). Plain `npx descix` resolves the wrong package.
 */
export const DESCIX_CLI = '@descix/cli@4.0.0';

export const CLI_ARGV = Object.freeze(['-y', '-p', DESCIX_CLI, 'descix', 'mcp', 'execute', '--tool', ASK.command]);

/** The first line the CLI must print in this repo (CLAUDE.md, measured 2026-10-09 / 2026-10-14). */
export const CLI_ORIGIN_RE = /^env: prod \(.*\) https:\/\/descix\.net\s*$/;

export const DEFAULT_STILLS = 8;

const THREAD_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// ── stills sampled out of a clip ──────────────────────────────────────────────────────────────

/**
 * Which frames of a `total`-frame clip become stills: every Nth (N = ceil(total / max)), starting at 0,
 * so at most `max` and never more than the clip holds. THROWS on a non-positive input.
 */
export function sampleIndices(total, max) {
    if (!Number.isInteger(total) || total < 1) { throw new Error('sampleIndices: a clip of ' + total + ' frames has nothing to sample.'); }
    if (!Number.isInteger(max) || max < 1) { throw new Error('sampleIndices: `stills` must be a whole number ≥ 1, got ' + JSON.stringify(max) + '.'); }
    const every = Math.ceil(total / max);
    const out = [];
    for (let i = 0; i < total; i += every) { out.push(i); }
    return out;
}

/** Frames in an MP4 (ffprobe, counted by decoding — never the container's claim). */
export function countFrames(mp4) {
    const out = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', mp4]).toString().trim();
    const n = Number(out);
    if (!Number.isInteger(n) || n < 1) { throw new Error('countFrames: ffprobe read ' + JSON.stringify(out) + ' frames from ' + mp4 + '.'); }
    return n;
}

/** Write the sampled frames of `mp4` as dir/frame-NN.png (NN = the frame index in the clip). Returns the paths. */
export function writeStills(mp4, dir, max) {
    const total = countFrames(mp4);
    const idx = sampleIndices(total, max);
    fs.mkdirSync(dir, { recursive: true });
    const select = idx.map((i) => 'eq(n\\,' + i + ')').join('+');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', 'select=' + select, '-vsync', 'vfr', path.join(dir, 'tmp-%03d.png')]);
    const tmp = fs.readdirSync(dir).filter((f) => /^tmp-\d{3}\.png$/.test(f)).sort();
    if (tmp.length !== idx.length) {
        throw new Error('writeStills: asked ffmpeg for frames [' + idx.join(', ') + '] of ' + mp4 + ' and got ' + tmp.length + ' images.');
    }
    return tmp.map((f, k) => {
        const to = path.join(dir, 'frame-' + String(idx[k]).padStart(2, '0') + '.png');
        fs.renameSync(path.join(dir, f), to);
        return to;
    });
}

// ── the clip on disk ──────────────────────────────────────────────────────────────────────────

/** One footage item from the page, written to `<base>.mp4` and sampled into `<base>/`. */
export function keepClip(item, base, stills) {
    if (!item || item.mime_type !== FOOTAGE_MIME) {
        throw new Error('the node door keeps ' + FOOTAGE_MIME + ' footage only, got ' + JSON.stringify(item && item.mime_type) + '.');
    }
    const bytes = Buffer.from(item.data, 'base64');
    if (bytes.length < 8 || bytes.toString('latin1', 4, 8) !== 'ftyp') {
        throw new Error('the clip handed to the node door is not an MP4 (no ftyp box at byte 4; ' + bytes.length + ' bytes).');
    }
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const clip = base + '.mp4';
    fs.writeFileSync(clip, bytes);
    return { clip: clip, frames: writeStills(clip, base, stills) };
}

// ── threads.json ──────────────────────────────────────────────────────────────────────────────

export function readThreads(file) {
    if (!fs.existsSync(file)) { return {}; }
    const t = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!t || typeof t !== 'object' || Array.isArray(t)) { throw new Error(file + ' is not a {<thread>: {interaction_id, turns, media_tokens_total}} object.'); }
    return t;
}

function writeThreads(file, threads) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(threads, null, 2) + '\n');
    fs.renameSync(file + '.tmp', file);
}

// ── the CLI ───────────────────────────────────────────────────────────────────────────────────

/**
 * The CLI's output → its JSON answer, parsed by SHAPE (sliced from the first `{` of stdout). The origin
 * line `env: prod (…) https://descix.net` is REQUIRED as the first line of stderr or of stdout — piped
 * with --json the CLI prints the JSON first on stdout, so the line is looked for on both.
 */
export function parseCliOutput(stdout, stderr) {
    const firstOf = (t) => String(t || '').split('\n').find((l) => l.trim() !== '') || '';
    const origin = [firstOf(stderr), firstOf(stdout)].find((l) => CLI_ORIGIN_RE.test(l));
    if (!origin) {
        throw new Error('the descix CLI printed no `env: prod (…) https://descix.net` origin line — first stderr line ' + JSON.stringify(firstOf(stderr)) +
            ', first stdout line ' + JSON.stringify(firstOf(stdout)) + '. The workspace is not the PROD app workspace; nothing is trusted from this call.');
    }
    const at = String(stdout).indexOf('{');
    if (at === -1) { throw new Error('the descix CLI printed no JSON object: ' + JSON.stringify(String(stdout).slice(0, 600))); }
    return JSON.parse(stdout.slice(at));
}

let cliSeq = 0;

/**
 * Run the pinned CLI once from `cliRoot` with `params`; resolves its parsed JSON. Every call's raw
 * stdout/stderr is kept as <rawDir>/<stamp>.out / .err BEFORE it is parsed (raw evidence survives a refusal).
 */
export function runCli(cliRoot, params, rawDir) {
    if (typeof rawDir !== 'string' || !rawDir) { throw new Error('runCli: `rawDir` is required — every CLI call keeps its raw output.'); }
    const json = JSON.stringify(params);
    cliSeq += 1;
    const base = path.join(rawDir, new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '-' + process.pid + '-' + cliSeq);
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = spawn('npx', CLI_ARGV.concat(['--params', json, '--json']), { cwd: cliRoot, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e) {
            reject(new Error('could not start the descix CLI (' + e.code + ': ' + e.message + ')' +
                (e.code === 'E2BIG' ? ' — the params (' + Buffer.byteLength(json) + ' bytes, carried as ONE argv string) are over this machine\'s ARG_MAX; the clip is too big for --params.' : '')));
            return;
        }
        let out = '';
        let err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('error', (e) => reject(new Error('the descix CLI failed to run: ' + e.message + (e.code === 'E2BIG' ? ' (params ' + Buffer.byteLength(json) + ' bytes over ARG_MAX)' : ''))));
        child.on('close', (code) => {
            fs.mkdirSync(rawDir, { recursive: true });
            fs.writeFileSync(base + '.out', out);
            fs.writeFileSync(base + '.err', err);
            if (code !== 0) { reject(new Error('the descix CLI exited ' + code + ' (raw: ' + base + '.out/.err): ' + (err || out).trim().slice(0, 2000))); return; }
            try { resolve(parseCliOutput(out, err)); } catch (e) { reject(new Error(e.message + ' (raw: ' + base + '.out/.err)')); }
        });
    });
}

/** The repo's MAIN checkout (where the PROD workspace and its credential live), from any worktree of it. */
export function mainCheckoutOf(dir) {
    const common = execFileSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim();
    const root = path.dirname(common);
    if (!fs.existsSync(path.join(root, '.descix', 'workspace.json'))) {
        throw new Error('the main checkout ' + root + ' has no .descix/workspace.json — the CLI has no PROD workspace to run in.');
    }
    return root;
}

// ── one turn on a named thread ────────────────────────────────────────────────────────────────

/** A media item for the question: {path, label?} (an MP4 on disk) or the page's {mime_type, data, label?, truncated?}. */
export function mediaItemOf(m, where) {
    if (m && typeof m.path === 'string') {
        const bytes = fs.readFileSync(m.path);
        if (bytes.length < 8 || bytes.toString('latin1', 4, 8) !== 'ftyp') { throw new Error(where + ': ' + m.path + ' is not an MP4 (no ftyp box at byte 4).'); }
        const item = { mime_type: FOOTAGE_MIME, data: bytes.toString('base64') };
        if (typeof m.label === 'string' && m.label) { item.label = m.label; }
        return item;
    }
    return m;   // the page's own item; buildAskParams checks it
}

/**
 * askThread(spec) — ONE turn on a named thread, through maxi-ask.js's createThread (params, answer,
 * excerpt are its). spec: {outDir, thread, knowledgebase_names?, user_input, media?, op?, note?} plus
 * {cliRoot} or {run(params)}. media omitted = a words-only turn. threads.json is read before and written
 * only after an answer. Resolves {asked:true, answer, interaction_id, answer_excerpt, usage, model,
 * thread, turns, knowledgebase_names, media_tokens}.
 */
export async function askThread(spec) {
    const op = spec.op || 'ask';
    if (typeof spec.outDir !== 'string' || !spec.outDir) { throw new Error(op + ': askThread needs `outDir` (where threads.json lives).'); }
    const run = spec.run || ((params) => runCli(spec.cliRoot, params, path.join(spec.outDir, 'cli')));
    if (!spec.run && (typeof spec.cliRoot !== 'string' || !spec.cliRoot)) { throw new Error(op + ': askThread needs `cliRoot`, the checkout the CLI runs from.'); }
    const name = spec.thread;
    if (typeof name !== 'string' || !THREAD_RE.test(name)) {
        throw new Error(op + ': a question goes on a NAMED thread ([A-Za-z0-9._-]) — got ' + JSON.stringify(name) + '. Nothing was asked.');
    }
    const kbs = knowledgebaseNamesOf(spec.knowledgebase_names, op);
    const media = (spec.media === undefined || spec.media === null) ? undefined
        : (Array.isArray(spec.media) ? spec.media.map((m, i) => mediaItemOf(m, op + ' (attachment ' + (i + 1) + ')')) : spec.media);
    const threadsFile = path.join(spec.outDir, 'threads.json');
    const threads = readThreads(threadsFile);
    const was = threads[name] || null;
    const thread = createThread({
        call: (command, params) => {
            if (command !== ASK.command) { throw new Error('the node door runs ' + ASK.command + ' only, asked for ' + command + '.'); }
            return run(params);
        },
        knowledgebaseNames: kbs,
        resume: was ? { interaction_id: was.interaction_id, turns: was.turns } : null
    });
    const got = await thread.ask({ op: op, note: spec.note, userInput: spec.user_input, media: media });
    const mediaTokens = (got.usage && typeof got.usage.media_tokens === 'number') ? got.usage.media_tokens : null;
    threads[name] = {
        interaction_id: thread.id,
        turns: thread.turns,
        media_tokens_total: ((was && was.media_tokens_total) || 0) + (mediaTokens || 0)
    };
    writeThreads(threadsFile, threads);
    return Object.assign({}, got, { thread: name, turns: thread.turns, knowledgebase_names: kbs, media_tokens: mediaTokens });
}

// ── the page's footage door ───────────────────────────────────────────────────────────────────

/**
 * createAskDoor({brain, outDir, cliRoot?, run?}) → door(question, ctx)
 *   question — what the page's lab.ask hands over: {op, note, media[]};
 *   ctx      — the hand being run: {hand, stamp, stills, ask?, thread?, knowledgebase_names?}.
 * Resolves the page's ask answer: {asked:false, clip, frames} (brain none, or ctx.ask === false) or askThread's answer on
 * ctx.thread (user_input = footageUserInput(note)) + {clip, frames}.
 */
export function createAskDoor(spec) {
    if (!spec || BRAINS.indexOf(spec.brain) === -1) { throw new Error('createAskDoor: `brain` must be one of [' + BRAINS.join(', ') + '], got ' + JSON.stringify(spec && spec.brain) + '.'); }
    if (typeof spec.outDir !== 'string' || !spec.outDir) { throw new Error('createAskDoor: `outDir` is required.'); }
    if (spec.brain === 'platform' && !spec.run && (typeof spec.cliRoot !== 'string' || !spec.cliRoot)) {
        throw new Error('createAskDoor: --brain platform needs `cliRoot`, the checkout the CLI runs from.');
    }
    return async function door(question, ctx) {
        if (!ctx || typeof ctx.stamp !== 'string' || typeof ctx.hand !== 'string') { throw new Error('the node door was asked outside a hand (no {hand, stamp}) — nothing was kept or asked.'); }
        const media = question && question.media;
        if (!Array.isArray(media) || media.length !== 1) {
            throw new Error(ctx.hand + ': the node door takes ONE clip per question (a hand films one), got ' + (Array.isArray(media) ? media.length : JSON.stringify(media)) + '.');
        }
        const kept = keepClip(media[0], path.join(spec.outDir, ctx.stamp + '-' + ctx.hand), ctx.stills);
        if (spec.brain === 'none' || ctx.ask === false) { return { asked: false, clip: kept.clip, frames: kept.frames }; }
        if (typeof ctx.thread !== 'string') {
            throw new Error(ctx.hand + ': --brain platform asks on a NAMED thread — give hand.mjs --thread <name>, or --no-ask to film without asking. The clip is kept: ' + kept.clip);
        }
        let got;
        try {
            got = await askThread({
                outDir: spec.outDir, cliRoot: spec.cliRoot, run: spec.run, op: question.op, note: question.note,
                thread: ctx.thread, knowledgebase_names: ctx.knowledgebase_names,
                user_input: footageUserInput(question.note), media: media
            });
        } catch (e) {
            throw new Error(String((e && e.message) || e) + ' (the clip is kept: ' + kept.clip + ')');
        }
        return Object.assign(got, { clip: kept.clip, frames: kept.frames });
    };
}
