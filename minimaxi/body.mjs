#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * body.mjs — MiniMaxi's BODY: Maxi's lab page, driven from node.
 *
 *   node minimaxi/body.mjs --port <n> --scene <registry id> [--mode <m>] --brain none|platform [--stills 8] [--out minimaxi/out]
 *
 * ONE origin on 127.0.0.1:<port> (strict: a forbidden or busy port exits 2, nothing drifts):
 *   /bridge/hand  POST {hand, args?, thread?, knowledgebase_names?, stills?, ask?} → {result} | {error, changes}
 *                 (every result carries `changes`, CHANGES_KEY: the §6 change rows the hand made, read off the world's
 *                 Record by the page's own MaxiLab.actRows)
 *                 runs ONE hand of the HANDS table (site/app-assets/maxi-hands.js) on the page's own
 *                 window.DeSciX_Actions; a hand not in the table is refused BY NAME; one at a time.
 *                 A footage hand's result gains {clip, frames[]} (ABSOLUTE paths: the MP4 and its sampled
 *                 stills). `ask:false` films and keeps the clip but asks nothing, under either brain.
 *   /bridge/ask   POST {thread, knowledgebase_names?, user_input, media?:[{path, label?}]} → {result}
 *                 one turn on a named thread (ask-door.mjs askThread; --brain platform only).
 *   /bridge/record POST {act: 'begin'|'next'|'end'|'abandon'} → {result} — the page's Record doors (MaxiLab.beginRecord,
 *                 beginNextRound, endRecord, abandonRecord): a loop begins its chain, begins it again after a revise, ends it
 *                 (→ the chain's closed Records, each file {text}|{base64}) or lets it go. One at a time, like a hand.
 *   /bridge/hands GET → {hands:[names]}
 *   everything else: the repo root, by scripts/serve-site.mjs's one handler (the lab is /site/app.html).
 *
 * The browser: launched from `@descix/frqtl-node/eyes`'s own pinned playwright chromium and handed to
 * openHostedEyes through its BYO `browserType` seam; eyes.dispose() closes it. The eyes can host only the
 * package's empty experiment page (the site's vendored copy, on this ONE origin: eyesPageUrl) and their handle
 * exposes no page, so the LAB page is a second page of that browser, in standalone host mode, with
 * window.MaxiHostDoor exposed (ask-door.mjs). The lab boots first and its inventory names the world; the
 * eyes then boot their REFERENCE eye — the same rung as the project folder it boots (projectOf) + its renderState
 * (the GYM look) — check those bounds against their own boot, and the body saves one composite still.
 * Maxi's clips are the lab's own FrqtlVision.record (mediabunny MP4) in the scene frame. The body runs no
 * sketch in node: the registry it reads is the site's vendored copy (the rows the lab's picker shows).
 *
 * stdout line 1: {"bridge","port","scene","mode","brain","reference"} (reference = the eyes' composite still at tick 150) — then nothing else on stdout
 * (logs go to stderr). Stays up until SIGTERM/SIGINT; tears down the browser and server itself.
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { siteHandler } from '../scripts/serve-site.mjs';
import { HANDS } from '../site/app-assets/maxi-hands.js';
import { DIST_REL, distUrl, distFile, exportFile } from '../scripts/frqtl-web-pin.mjs';
import { BRAINS, DEFAULT_STILLS, createAskDoor, askThread, mainCheckoutOf } from './ask-door.mjs';

const { walkthroughById, defaultWalkthroughModeId, projectOf } = await import(distUrl(exportFile('./registry')));

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');

/** Ports other seats own on this machine (the dispatch's list). */
export const FORBIDDEN_PORTS = Object.freeze([5173, 5530, 5540, 5591, 5594]);

/** The seed the reference eye regenerates with (the lab's boot default when no seed is given). */
const REFERENCE_SEED = 42;
const REFERENCE_TICK = 150;

/** The vendored dist's empty experiment page, where the eyes boot. */
const EYES_PAGE = 'experiments/empty/index.html';
distFile(EYES_PAGE);   // THROWS naming the pin when the vendored dist does not ship it

/**
 * The eyes' page on the body's ONE origin, under the site's sub-path: the eyes resolve the page's modules through the
 * page's own import map, so the dist needs no origin of its own (scripts/test/eyes-one-origin.test.mjs).
 */
export function eyesPageUrl(origin) {
    return origin + '/' + DIST_REL + '/' + EYES_PAGE;
}

// ── the port ──────────────────────────────────────────────────────────────────────────────────

function probe(host, port) {
    return new Promise((resolve) => {
        const s = net.connect({ host: host, port: port });
        const done = (busy) => { s.destroy(); resolve(busy); };
        s.once('connect', () => done(true));
        s.once('error', () => done(false));
        s.setTimeout(800, () => done(false));
    });
}

/**
 * THROWS unless `port` is a whole number, not forbidden, and nothing listens on it on 127.0.0.1 or ::1
 * (a listener on one loopback does not stop a bind on the other — measured on 5577).
 */
export async function assertPortFree(port) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) { throw new Error('--port must be a whole number in 1024–65535, got ' + JSON.stringify(port) + ' (strict: never auto-picked).'); }
    if (FORBIDDEN_PORTS.indexOf(port) !== -1) { throw new Error('--port ' + port + ' is forbidden — other seats own [' + FORBIDDEN_PORTS.join(', ') + '].'); }
    const busy = [];
    if (await probe('127.0.0.1', port)) { busy.push('127.0.0.1'); }
    if (await probe('::1', port)) { busy.push('::1'); }
    if (busy.length) { throw new Error('--port ' + port + ' is busy (something listens on ' + busy.join(' and ') + ') — strict port: pick another.'); }
    return port;
}

// ── the bridge ────────────────────────────────────────────────────────────────────────────────

/** THROWS naming the table unless `name` is a hand of HANDS. */
export function assertHand(name) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(HANDS, name)) {
        throw new Error('unknown hand ' + JSON.stringify(name) + ' — not in the HANDS table (site/app-assets/maxi-hands.js), which has: [' + Object.keys(HANDS).join(', ') + ']. Nothing ran.');
    }
    return name;
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
            if (!body.trim()) { resolve({}); return; }
            try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('the request body is not JSON: ' + e.message)); }
        });
        req.on('error', reject);
    });
}

function send(res, code, obj) {
    const text = JSON.stringify(obj);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
    res.end(text);
}

let seq = 0;
function stampNow() {
    seq += 1;
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '-' + String(seq).padStart(3, '0');
}

/**
 * A footage hand's result + the body's {clip, frames[]} (and {thread, media_tokens} when it asked).
 * The hand's own `frames` is its frame COUNT; the contract's `frames` is the still paths, so the count
 * rides as `frameCount`. Any other key the hand already has is a collision and THROWS — never overwritten.
 */
/** The keys the body adds to a footage hand's result: the clip file and its still paths (absolute). Readers import these. */
export const FOOTAGE_KEYS = Object.freeze({ clip: 'clip', stills: 'frames', frameCount: 'frameCount' });
/** The key a hand's result gains: the §6 change rows the hand made (the page's MaxiLab.actRows, off the world's Record). A refusal carries it beside `error`. */
export const CHANGES_KEY = 'changes';

export function withFootage(result, kept) {
    const out = Object.assign({}, result);
    if (typeof out.frames === 'number') { out[FOOTAGE_KEYS.frameCount] = out.frames; delete out.frames; }
    const add = { [FOOTAGE_KEYS.clip]: kept.clip, [FOOTAGE_KEYS.stills]: kept.frames };
    if (kept.thread) { add.thread = kept.thread; add.media_tokens = kept.media_tokens; }
    const counted = typeof result.frames === 'number';
    const clash = Object.keys(add).concat([FOOTAGE_KEYS.frameCount]).filter((k) => !(k === 'frames' && counted) && Object.prototype.hasOwnProperty.call(result, k));
    if (clash.length) { throw new Error('the hand result already carries [' + clash.join(', ') + '] — the body will not overwrite a hand\'s own keys.'); }
    return Object.assign(out, add);
}

/** The Record acts of /bridge/record, each the page's own door (MaxiLab). */
export const RECORD_ACTS = Object.freeze(['begin', 'next', 'end', 'abandon']);

/**
 * The bridge's request handler over a `body` = {runHand(hand, args) → {ok}|{error}, runRecord(act) → result, brain, door, outDir, cliRoot}.
 * Exported so a test can drive it with a fake page.
 */
export function bridgeHandler(body) {
    let running = null;
    return async function (req, res) {
        const url = new URL(req.url, 'http://x');
        try {
            if (req.method === 'GET' && url.pathname === '/bridge/hands') { send(res, 200, { hands: Object.keys(HANDS) }); return; }
            if (req.method === 'POST' && url.pathname === '/bridge/hand') {
                const q = await readJson(req);
                try { assertHand(q.hand); } catch (e) { send(res, 404, { error: e.message }); return; }
                if (running) { send(res, 409, { error: 'busy: hand ' + JSON.stringify(running) + ' is still running — one hand at a time. Nothing ran.' }); return; }
                const stills = (q.stills === undefined) ? body.stills : q.stills;
                if (!Number.isInteger(stills) || stills < 1) { send(res, 400, { error: '`stills` must be a whole number ≥ 1, got ' + JSON.stringify(stills) + '. Nothing ran.' }); return; }
                if (q.ask !== undefined && typeof q.ask !== 'boolean') { send(res, 400, { error: '`ask` must be true or false, got ' + JSON.stringify(q.ask) + '. Nothing ran.' }); return; }
                const ctx = { hand: q.hand, stamp: stampNow(), stills: stills, ask: q.ask !== false, thread: q.thread, knowledgebase_names: q.knowledgebase_names, kept: [] };
                running = q.hand;
                body.current = ctx;
                try {
                    const out = await body.runHand(q.hand, q.args === undefined ? {} : q.args);
                    if (!Array.isArray(out[CHANGES_KEY])) { throw new Error('the page answered ' + q.hand + ' without `' + CHANGES_KEY + '` (the rows it made) — window.MaxiLab.actRows did not run.'); }
                    if (out.error !== undefined) { send(res, 422, { error: out.error, [CHANGES_KEY]: out[CHANGES_KEY] }); return; }
                    if (Object.prototype.hasOwnProperty.call(out.ok, CHANGES_KEY)) { throw new Error('the ' + q.hand + ' hand result already carries `' + CHANGES_KEY + '` — the body will not overwrite a hand\'s own keys.'); }
                    const result = Object.assign({}, out.ok, { [CHANGES_KEY]: out[CHANGES_KEY] });
                    if (ctx.kept.length > 1) { throw new Error(q.hand + ' handed ' + ctx.kept.length + ' clips; the hand contract carries one {clip, frames}.'); }
                    send(res, 200, { result: ctx.kept.length === 1 ? withFootage(result, ctx.kept[0]) : result });
                } finally { running = null; body.current = null; }
                return;
            }
            if (req.method === 'POST' && url.pathname === '/bridge/record') {
                const q = await readJson(req);
                if (RECORD_ACTS.indexOf(q.act) === -1) { send(res, 400, { error: '`act` is one of ' + RECORD_ACTS.join('|') + ', got ' + JSON.stringify(q.act) + '. Nothing ran.' }); return; }
                if (running) { send(res, 409, { error: 'busy: ' + JSON.stringify(running) + ' is still running — one call at a time. Nothing ran.' }); return; }
                running = 'record ' + q.act;
                try { send(res, 200, { result: await body.runRecord(q.act) }); }
                catch (e) { send(res, 422, { error: String((e && e.message) || e) }); }
                finally { running = null; }
                return;
            }
            if (req.method === 'POST' && url.pathname === '/bridge/ask') {
                if (body.brain !== 'platform') { send(res, 409, { error: 'ask: this body runs --brain ' + body.brain + ' — a question needs --brain platform. Nothing was asked.' }); return; }
                const q = await readJson(req);
                if (running) { send(res, 409, { error: 'busy: ' + JSON.stringify(running) + ' is still running — one call at a time. Nothing was asked.' }); return; }
                running = 'ask';
                try {
                    const result = await askThread({ outDir: body.outDir, cliRoot: body.cliRoot, run: body.run, op: 'ask', thread: q.thread, knowledgebase_names: q.knowledgebase_names, user_input: q.user_input, media: q.media });
                    send(res, 200, { result: result });
                } catch (e) { send(res, 422, { error: String((e && e.message) || e) }); }
                finally { running = null; }
                return;
            }
            send(res, 404, { error: 'no bridge route ' + req.method + ' ' + url.pathname + ' — routes: GET /bridge/hands, POST /bridge/hand, POST /bridge/record, POST /bridge/ask.' });
        } catch (e) {
            send(res, 500, { error: String((e && e.message) || e) });
        }
    };
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

function argOf(argv, flag) { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; }
function log(line) { process.stderr.write('[minimaxi body] ' + line + '\n'); }

async function main(argv) {
    const port = await assertPortFree(Number(argOf(argv, '--port')));
    const sceneId = argOf(argv, '--scene');
    const row = walkthroughById(sceneId);
    if (!row) { throw new Error('--scene ' + JSON.stringify(sceneId) + ' is not a registry scene id (kb/GodsWorld/memories/roster.json lists them).'); }
    const mode = argOf(argv, '--mode') === undefined ? defaultWalkthroughModeId(row) : argOf(argv, '--mode');
    const project = await projectOf(row, { mode: mode });   // the rung as the folder it boots, its renderState beside it; refuses an undeclared mode by name
    const brain = argOf(argv, '--brain');
    if (BRAINS.indexOf(brain) === -1) { throw new Error('--brain must be one of [' + BRAINS.join(', ') + '], got ' + JSON.stringify(brain) + '.'); }
    const stills = argOf(argv, '--stills') === undefined ? DEFAULT_STILLS : Number(argOf(argv, '--stills'));
    if (!Number.isInteger(stills) || stills < 1) { throw new Error('--stills must be a whole number ≥ 1.'); }
    const outDir = path.resolve(argOf(argv, '--out') || path.join(HERE, 'out'));
    const cliRoot = brain === 'platform' ? mainCheckoutOf(REPO) : null;

    const door = createAskDoor({ brain: brain, outDir: outDir, cliRoot: cliRoot });
    const body = { brain: brain, outDir: outDir, cliRoot: cliRoot, stills: stills, current: null, runHand: null, runRecord: null };
    const site = siteHandler(REPO);
    const bridge = bridgeHandler(body);
    const server = http.createServer((req, res) => (req.url.startsWith('/bridge/') ? bridge(req, res) : site(req, res)));
    server.requestTimeout = 0;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const origin = 'http://127.0.0.1:' + port;

    let eyes = null;
    let browser = null;
    let down = false;
    async function teardown(why) {
        if (down) { return; }
        down = true;
        log('teardown (' + why + ')');
        try { if (eyes) { await eyes.dispose(); } else if (browser) { await browser.close(); } }
        finally { await new Promise((r) => server.close(r)); }
    }
    process.on('SIGTERM', () => { teardown('SIGTERM').then(() => process.exit(0), (e) => { log(e.stack); process.exit(1); }); });
    process.on('SIGINT', () => { teardown('SIGINT').then(() => process.exit(0), (e) => { log(e.stack); process.exit(1); }); });

    try {
        const sdkRequire = createRequire(path.join(HERE, 'package.json'));
        const { openHostedEyes } = sdkRequire('@descix/frqtl-node/eyes');
        const { chromium } = sdkRequire('playwright');   // declared in minimaxi/package.json, pinned EQUAL to the eyes' own dependency (scripts/test/minimaxi.test.mjs)
        // The eyes' sceneRecord needs the world's physics bounds BEFORE open, and the sketch alone
        // declares them (the published node core has no reader for it). So the lab boots first and its
        // own inventory names the world; the eyes then regenerate the same sketch and CHECK those bounds
        // against their own boot. The browser is the eyes package's pinned chromium, launched here and
        // handed to openHostedEyes through its BYO `browserType` seam — eyes.dispose() closes it.
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', (e) => log('page error: ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error') { log('page console.error: ' + m.text()); } });
        await page.exposeFunction('MaxiHostDoor', async (question) => {
            const ctx = body.current;
            const got = await door(question, ctx);
            ctx.kept.push({ clip: got.clip, frames: got.frames, thread: got.thread || null, media_tokens: got.media_tokens === undefined ? null : got.media_tokens });
            return got;
        });
        const labUrl = origin + '/site/app.html?scene=' + encodeURIComponent(row.id) + (mode ? '&mode=' + encodeURIComponent(mode) : '');
        await page.goto(labUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.MaxiLab, undefined, { timeout: 60000 });
        const opened = await page.evaluate(async () => {
            try { return { ok: await window.MaxiLab.ready, host: window.MaxiLab.state.host }; }
            catch (e) { return { error: String((e && e.message) || e), host: window.MaxiLab.state.host }; }
        });
        if (opened.error) { throw new Error('the lab did not open ' + row.id + ': ' + opened.error); }
        if (opened.host !== 'standalone') { throw new Error('the lab settled host ' + JSON.stringify(opened.host) + ', not standalone — the node door is for a lab with no shell above it.'); }

        const world = await page.evaluate(async () => (await window.MaxiLab.inventory()).canvas);
        eyes = await openHostedEyes({
            sceneRecord: { seed: REFERENCE_SEED, sourceRef: 'walkthrough:' + row.id + (mode ? '#' + mode : ''), physicsW: world[0], physicsH: world[1] },
            sceneSource: { kind: 'project', files: project.files, entry: project.manifest.entry },
            renderState: project.renderState,
            pageUrl: eyesPageUrl(origin),
            // This stand-in DROPS the eyes' hardware-GL launch args (launch(opts) arrives after the lab already booted the browser); build.gl on the reference still records the raster path actually used.
            browserType: { launch: async function () { return browser; } }
        });
        await eyes.driveToTick(REFERENCE_TICK);
        const reference = eyes.saveStill(await eyes.vision.getStill('composite'), path.join(outDir, stampNow() + '-reference', row.id + '-t' + REFERENCE_TICK + '.png'));

        body.runHand = (hand, args) => page.evaluate(async ([h, a]) => {
            const got = await window.MaxiLab.actRows(() => window.DeSciX_Actions[h](a));
            if (!got.ok) { return { error: got.error, changes: got.changes }; }
            try { return { ok: JSON.parse(got.value), changes: got.changes }; }
            catch (e) { return { error: 'the ' + h + ' hand returned no JSON: ' + String((e && e.message) || e), changes: got.changes }; }
        }, [hand, args]);

        body.runRecord = (act) => page.evaluate(async (k) => {
            const L = window.MaxiLab;
            if (k === 'begin') { return L.beginRecord('loop'); }
            if (k === 'next') { await L.beginNextRound(); return { begun: true }; }
            if (k === 'end') { return L.endRecord(); }
            return L.abandonRecord();
        }, act);

        process.stdout.write(JSON.stringify({ bridge: origin + '/bridge', port: port, scene: row.id, mode: mode, brain: brain, reference: reference }) + '\n');
        log('lab up: ' + labUrl + ' — ' + JSON.stringify(opened.ok));
    } catch (e) {
        await teardown('start failed');
        throw e;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch((e) => {
        process.stderr.write('[minimaxi body] ' + String((e && e.stack) || e) + '\n');
        process.exit(2);
    });
}
