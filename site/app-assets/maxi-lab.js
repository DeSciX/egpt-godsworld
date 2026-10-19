/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab.js — Maxi's Lab (app.html): the whole frame in the DeSciX shell, with Maxi's conversation in its own panel (#talk).
 *
 * Built on the PUBLISHED @descix/frqtl-web (vendored byte-identically; app.html's import map, scripts/gen-import-maps.mjs):
 *   - scenes come from the package's registries (WALKTHROUGH rungs, the EXHIBITS roster) — this file
 *     holds no id → file table; a rung is read as the project folder it boots by the package's own projectOf;
 *   - ONE boot door: every scene — registry rung or a sketch Maxi wrote — boots through `bootProject`
 *     in its own scene document (scene.html, replaced per load; see maxi-scene.js for why); a restart
 *     is the runner's own `restart()` in that same document;
 *   - ONE Record per booted world: the package's exp.startRecord() as the world boots (THE WORLD'S RECORD below);
 *     its clock is the lab's tick, its rows every act's, its clips every recording's;
 *   - Maxi's hands are `window.DeSciX_Actions`, built from the one HANDS table (./maxi-hands.js) and
 *     registered at load, before anything else can fail.
 *
 * Host facts this page relies on: in the signed-in shell the lab takes the whole frame (measured 2026-10-15),
 * so Maxi is reached through the page's own conversation, not the shell's chat. Tony's "Imagine…" box drives
 * Maxi's three roles (./maxi-loop.js) on three threads the page owns, asking through the shell's command door
 * window.DeSciX.call, executes the Builder's hand calls through the same HANDS adapter with no click, and
 * shows only words (and the clips) in its conversation (#talk). FOOTAGE does not
 * travel through the chat: the page hands every clip to Maxi itself, as `media[]` on the question
 * command through the shell's command door window.DeSciX.call (./maxi-ask.js), on ONE thread the page
 * owns, and shows the exchange in plain words on its conversation strip (#talk). The bridge
 * (DeSciXAppSDK.js) resolves itself — `await DeSciX.ready()` settles timing.
 */

import { HANDS, publishHands, assertAdapterCoversHands, inventoryObjects, inventoryOf, worldShape, declaredModesOf, writeSketch, HUMAN } from './maxi-hands.js';
import { attachHandTool, handKeyAction } from './maxi-hand-tool.js';
import { attachRecorder, recordKeyAction, paintCard, clipUrlLedger } from './maxi-record.js';
import { createLoop, threadBrain, labBody, refuseWhileWorking } from './maxi-loop.js';
import { assembleLoopRecords, changesAsText, completenessWords, folderHere, sceneFacts, base64OfBytes, MAX_SEGMENTS } from './maxi-record-folder.js';
import * as roles from './maxi-roles.js';
import { loopRowsOf } from './maxi-talk.js';
import { ASK, createThread, footageUserInput, plainWords } from './maxi-ask.js';
import { loadPageIcons, iconButton } from './maxi-icons.js';
import { MOBILE_QUERY, hostView } from './maxi-host-view.js';
import { sceneCard, cardLines } from './maxi-card.js';
import {
    WALKTHROUGH, walkthroughById, walkthroughGroup, walkthroughModes, defaultWalkthroughModeId,
    EXHIBITS, projectOf, scenePath
} from '@descix/frqtl-web/registry';
import { FRQTL_WEB_HOST_SPECIFIERS, MANIFEST_FILE, SKETCH_ENTRY, manifestFor, serializeManifest } from '@descix/frqtl-web/project';

/**
 * The vendored dist root, read back off the page's own import map at one of the package's HOST rows
 * (FRQTL_WEB_HOST_SPECIFIERS: scripts/gen-import-maps.mjs writes the map as the package's pageImportMapFor(root), every row
 * root + its libPath): the map has no manifest row, so the manifest is read from the root, as the package says
 * (`new URL('dist-manifest.json', root)`). THROWS when the map does not carry the package's host table.
 */
function frqtlWebRoot() {
    const row = FRQTL_WEB_HOST_SPECIFIERS[0];
    const url = import.meta.resolve(row.specifier);
    if (!url.endsWith(row.libPath)) {
        throw new Error('[maxi-lab] the page\'s import map resolves ' + row.specifier + ' to ' + url + ', not <root>' + row.libPath +
            ' — app.html\'s map is not the package\'s pageImportMapFor; run node scripts/gen-import-maps.mjs --write. (FAIL-LOUD.)');
    }
    return url.slice(0, url.length - row.libPath.length);
}
/** The vendored package's version, off its manifest: read at load WITHOUT holding the module (the hands publish first); `ready` awaits it, so a manifest that is not served fails the boot by name. */
const sdk = { version: null };
const SDK_MANIFEST = (async function () {
    const at = new URL('dist-manifest.json', frqtlWebRoot());
    const res = await fetch(at);
    if (!res.ok) { throw new Error('[maxi-lab] the vendored @descix/frqtl-web dist-manifest.json is not served at ' + at + ' (HTTP ' + res.status + '). (FAIL-LOUD.)'); }
    const manifest = await res.json();
    sdk.version = manifest.version;
    return manifest;
})();

/** The header's icons (maxi-icons.js): read at load like the manifest, awaited in main() before the header is painted. */
const ICONS = loadPageIcons();
let icons = null;
/** The registry rows a scene's card is read from (maxi-card.js sceneCard): the vendored registry's own exports. */
const CARD_REGISTRY = Object.freeze({ EXHIBITS: EXHIBITS, walkthroughById: walkthroughById, walkthroughGroup: walkthroughGroup });

const SCENE_PAGE = 'scene.html';   // relative on purpose: the shell serves this site under a path prefix

const state = {
    host: 'pending', bridge: null, view: null,
    frame: null, scene: null, grab: null,
    hand: null, handOn: false,            // the human's hand (maxi-hand-tool.js): per scene; the toggle outlives a reload
    recorder: null,                       // the human's Record (maxi-record.js): one per lab; a scene swap closes the world's Record, and its filming goes on in the next world
    chain: null,                          // the producer recording now (beginChain): {producer, worlds, unheld, carried, carriedRecord}, else null
    chainTurn: null,                      // a chain being begun again between two loop rounds (an Owl's revise); every act awaits it
    loading: null, says: [],
    thread: null,                         // the lab's ONE thread with Maxi (maxi-ask.js createThread), made once the host settles
    loop: null,                           // the three-role loop (maxi-loop.js): Tony's outlines, three threads of its own
    clips: [],                            // every clip the lab handed (or tried to hand) to Maxi, newest last, kept for a test to look at
    records: null                         // the newest loop approve's Records (maxi-record-folder.js assembleLoopRecords), in memory, one per world
};

/** How many handed clips the page keeps in memory (a test reads the newest; older ones are let go). */
const KEEP_CLIPS = 8;

const el = {
    stage: document.getElementById('stage'),
    picker: document.getElementById('scene-picker'),
    run: document.getElementById('btn-run'),
    restart: document.getElementById('btn-restart'),
    hand: document.getElementById('btn-hand'),
    record: document.getElementById('btn-record'),
    demo: document.getElementById('demo'),
    demoTitle: document.getElementById('demo-title'),
    demoClip: document.getElementById('demo-clip'),
    demoChanges: document.getElementById('demo-changes'),
    demoClose: document.getElementById('demo-close'),
    demoTeach: document.getElementById('demo-teach'),
    demoTeachText: document.getElementById('demo-teach-text'),
    demoSend: document.getElementById('demo-send'),
    talk: document.getElementById('talk'),
    talkLines: document.getElementById('talk-lines'),
    talkNew: document.getElementById('talk-new'),
    imagine: document.getElementById('imagine'),
    imagineText: document.getElementById('imagine-text'),
    imagineSend: document.getElementById('imagine-send'),
    fullscreen: document.getElementById('btn-fullscreen'),
    code: document.getElementById('btn-code'),
    codePane: document.getElementById('code'),
    codeTitle: document.getElementById('code-title'),
    codeText: document.getElementById('code-text'),
    info: document.getElementById('btn-info'),
    infoPane: document.getElementById('info'),
    infoTitle: document.getElementById('info-title'),
    infoBody: document.getElementById('info-body'),
    status: document.getElementById('status'),
    says: document.getElementById('says'),
    error: document.getElementById('error')
};

/** The demonstration card's elements, as maxi-record.js paintCard takes them: ONE object for Record's card and the loop's. */
const demoCard = { root: el.demo, title: el.demoTitle, video: el.demoClip, lines: el.demoChanges, teach: el.demoTeach, teachText: el.demoTeachText, send: el.demoSend };
Object.keys(el).forEach(function (k) {
    if (!el[k]) { throw new Error('[maxi-lab] app.html is missing #' + k + ' — the page and this module disagree.'); }
});

// ── the scene ───────────────────────────────────────────────────────────────────────────────

function requireScene(op) {
    if (!state.scene) { throw new Error(op + ': no scene is loaded — loadScene{id} or openSketch{source} first.'); }
    return state.scene;
}

function summary(sc) {
    const shape = worldShape(sc);
    return {
        scene: sc.label, id: sc.id, mode: sc.mode, modes: declaredModesOf(sc), renderer: sc.renderer,
        dimensions: shape.dimensions, canvas: shape.canvas,
        tick: sc.tick(),
        objects: inventoryObjects(sc.runner).map(function (r) { return r.name; })
    };
}

/** The one mount path: a fresh scene document, booted through the package's bootProject. */
async function mountScene(spec) {
    if (state.loading) { throw new Error('[maxi-lab] a scene is still booting (' + state.loading + ') — wait for it before loading another.'); }
    state.loading = spec.label;
    showError(null);
    try {
        await leaveWorld();
        if (state.frame) { state.frame.remove(); }
        state.frame = null; state.scene = null; state.grab = null;
        const frame = document.createElement('iframe');
        frame.id = 'scene-frame';
        frame.title = 'FRQTL scene: ' + spec.label;
        frame.src = SCENE_PAGE;
        await new Promise(function (resolve) {
            frame.addEventListener('load', resolve, { once: true });
            el.stage.appendChild(frame);
        });
        state.frame = frame;
        const win = frame.contentWindow;
        const ms = win && win.MaxiScene;
        if (!ms || typeof ms.boot !== 'function') {
            throw new Error('[maxi-lab] ' + SCENE_PAGE + ' loaded but published no window.MaxiScene.boot — app-assets/maxi-scene.js did not run (served URL: ' + frame.src + ').');
        }
        const booted = await ms.boot({ label: spec.label, files: spec.files, renderState: spec.renderState, seed: spec.seed });
        const sc = {
            label: spec.label, kind: spec.kind, id: spec.id, mode: spec.mode, modes: spec.modes, path: spec.path, source: spec.files[spec.entry],
            renderer: booted.renderer, win: win, runner: ms.runner, recipeContext: ms.recipeContext,
            record: null, filmed: [],                             // the world's open Record, and the hand that filmed each of its clips (lab.json `filmed`)
            tick: function () { return recordOf(sc, 'the tick').tick; },   // THE clock: the open Record's (climbs across re-runs)
            recordTickOf: function (t) { return recordTickOf(sc, t); },
            readyToFilm: function (op) { return readyToFilm(sc, op); },
            noteFilmed: function (hand, span) { sc.filmed.push({ hand: hand, span: span || null }); }
        };
        await openWorldRecord(sc);
        state.scene = sc;
        attachHand(ms, win);
        resumeRecorder();
        renderCode();
        renderInfo();
        syncPicker();
        return summary(state.scene);
    } catch (err) {
        renderInfo();
        showError(err);
        throw err;
    } finally {
        state.loading = null;
        renderStatus();
    }
}

// The human's Record films on in the world that now runs (a new world, or the same one after a restart).
function resumeRecorder() { if (state.recorder) { state.recorder.resumeFilming(); } }

// The world's filming stops, in this order: the paused refusal first (nothing torn down, the hand kept); then the hand goes,
// awaited, so a live carry it drops is written into the world's Record; then the human's rolling segment is finished (a clip
// cannot span a re-run or a scene change). A finish that fails after the hand went re-arms the hand on the scene that stays.
async function stopFilming() {
    if (state.recorder) { state.recorder.assertCanFinish(); }
    if (state.hand) { const h = state.hand; state.hand = null; await h.dispose(); }
    if (!state.recorder) { return; }
    try { await state.recorder.finishSegment(); }
    catch (err) { if (state.scene && !state.hand) { attachHand(state.scene.win.MaxiScene, state.scene.win); } throw err; }
}

// Leaving the world: its filming stops, then its Record closes (into the chain when a producer records).
async function leaveWorld() {
    await stopFilming();
    if (state.scene && state.scene.record) { await closeWorldRecord(state.scene); }
}

// ── THE WORLD'S RECORD ──────────────────────────────────────────────────────────────────────

/**
 * Every booted world holds ONE open Record (the package's exp.startRecord(), opened as the world boots): it writes every
 * act's rows (toSketch / setDeclared, each naming who acted), counts THE clock (the lab's tick) and keeps every recording as
 * one of its 5–10 s clips. A producer — the human's Record (maxi-record.js) or the loop (Tony's outline) — BEGINS A CHAIN
 * (beginChain): the world's Record closes and a new one opens, so the producer's first Record starts with it; when the open
 * Record holds rows its footage does not show it cannot close (rec.stop() refuses): what it already held (rows and clips)
 * stays in the producer's first Record's folder and lab.json names it `carried`, never the producer's own. While the chain lasts every Record that closes — a scene change (leaveWorld) or the
 * producer's end (endChain) — joins it as {folder, filmed, carried, scene}; a close the package refuses (rows no clip shows)
 * gives its rows, off the refusal's err.record, to the chain's `unheld`, and the scene change goes on (a re-authoring is never
 * refused for missing footage). With no chain a closing Record is nobody's and is let go.
 */
function recordOf(sc, op) {
    if (!sc.record) { throw new Error(op + ': the world holds no open Record (one is closing or opening) — try again in a moment.'); }
    return sc.record;
}

async function openWorldRecord(sc) {
    if (sc.record) { throw new Error('[maxi-lab] the world already holds an open Record — one per booted world.'); }
    sc.record = await sc.recipeContext.startRecord();
    sc.filmed = [];
}

/**
 * Close the world's open Record: {folder, filmed} | {empty: true} | {refused, rows} — refused: the package kept the Record
 * open (rows its footage does not show); `rows` are its rows, off err.record. THROWS when the lab's note of who filmed what
 * does not match the Record's clips (count, or a span a hand read): a Record is never handed on with a guessed `filmed`.
 */
async function stopWorldRecord(sc) {
    const rec = recordOf(sc, 'the Record');
    let out;
    try { out = await rec.stop(); }
    catch (err) {
        if (!err || !err.record || !Array.isArray(err.record.changes)) { throw err; }
        return { refused: String(err.message || err), rows: JSON.parse(JSON.stringify(err.record.changes)), clips: JSON.parse(JSON.stringify(err.record.clips || [])) };
    }
    const filmed = sc.filmed;
    sc.record = null; sc.filmed = [];
    if (out.empty) { return { empty: true }; }
    const folder = folderHere(out);   // the scene document's values, crossed into this realm
    if (filmed.length !== folder.clips.length) {
        throw new Error('[maxi-lab] the world\'s Record holds ' + folder.clips.length + ' clip(s), the lab noted ' + filmed.length + ' filmed (' + filmed.map(function (f) { return f.hand; }).join(', ') + ') — which hand filmed which clip cannot be said.');
    }
    folder.clips.forEach(function (c, i) {
        const s = filmed[i].span;
        if (s && (s.first !== c.firstTick || s.last !== c.lastTick)) {
            throw new Error('[maxi-lab] ' + filmed[i].hand + ' read its clip as ticks ' + s.first + '–' + s.last + ', the Record holds ' + c.file + ' as ' + c.firstTick + '–' + c.lastTick + ' — the hand\'s span is not the Record\'s.');
        }
    });
    return { folder: folder, filmed: filmed.map(function (f) { return f.hand; }) };
}

/**
 * Close the world's Record into the chain (when a producer records); the world's next Record is the caller's to open. A close
 * the package refuses gives the producer's rows it held to the chain's `unheld` (no Record holds them); the world whose Record
 * the producer found unclosable carries its `carried` (what that Record held before the producer began) into the chain entry.
 */
async function closeWorldRecord(sc) {
    const rec = sc.record;
    const closed = await stopWorldRecord(sc);
    const ch = state.chain;
    if (!ch) { return closed; }
    if (closed.refused) {   // the producer's rows no Record holds; rows the Record carried from before the producer began are nobody's, as before it began
        Array.prototype.push.apply(ch.unheld, closed.rows.slice(rec === ch.carriedRecord && ch.carried ? ch.carried.changes.length : 0));
    }
    else if (!closed.empty) { ch.worlds.push({ folder: closed.folder, filmed: closed.filmed, carried: rec === ch.carriedRecord ? ch.carried : null, scene: sceneFacts(sc) }); }
    return closed;
}

/** A frame's runner tick on the open Record's clock: the runner's count restarts at 0 on a re-run, the Record's climbs. THROWS for a frame not of the current run. */
function recordTickOf(sc, t) {
    const rec = recordOf(sc, 'a clip');
    const rt = sc.win.MaxiScene.runnerTick();
    if (!Number.isInteger(t) || !Number.isInteger(rt) || t > rt) {
        throw new Error('[maxi-lab] a frame at runner tick ' + JSON.stringify(t) + ' is not of the current run (the runner is at ' + rt + ') — its tick cannot be placed on the Record\'s clock.');
    }
    const at = rec.tick - (rt - t);
    if (at < 0) { throw new Error('[maxi-lab] a frame at runner tick ' + t + ' was filmed before the world\'s Record opened.'); }
    return at;
}

/**
 * Before a clip is filmed: the open Record holds at most MAX_SEGMENTS clips. Inside a chain a full Record REFUSES by name
 * (the producer's Record cannot hold it); with no chain the full Record is nobody's, so it closes and a new one opens.
 */
async function readyToFilm(sc, op) {
    if (state.chainTurn) { await state.chainTurn; }
    recordOf(sc, op);
    if (sc.filmed.length < MAX_SEGMENTS) { return; }
    if (state.chain) {
        throw new Error(op + ': the world\'s Record already holds ' + MAX_SEGMENTS + ' clips — the most one Record holds (the question door takes ' + MAX_SEGMENTS +
            ' attachments per turn); nothing was filmed. Hand back what was filmed (json:done, or Stop).');
    }
    const closed = await stopWorldRecord(sc);
    if (closed.refused) { throw new Error(op + ': the world\'s Record holds ' + MAX_SEGMENTS + ' clips and cannot close (' + closed.refused + ') — nothing was filmed.'); }
    await openWorldRecord(sc);
}

/**
 * A producer begins recording: the world's Record closes and a new one opens (the producer's first). When it cannot close (rows
 * its footage does not show) it carries on, and what it already held — its rows and its clips, each clip with the hand that
 * filmed it — is CARRIED: the producer's first Record names it in lab.json (maxi-record-folder.js CARRIED_KEY), never as its own.
 */
async function beginChain(producer) {
    if (state.chain) { throw new Error(producer + ': the ' + state.chain.producer + ' is recording now — one producer records at a time.'); }
    const sc = requireScene(producer);
    const closed = await stopWorldRecord(sc);
    if (!closed.refused) { await openWorldRecord(sc); }
    const carried = closed.refused ? {
        changes: closed.rows,
        clips: closed.clips.map(function (c, i) { return { hand: sc.filmed[i] ? sc.filmed[i].hand : null, firstTick: c.firstTick, lastTick: c.lastTick }; })
    } : null;
    state.chain = { producer: producer, worlds: [], unheld: [], carriedRecord: sc.record, carried: carried };
    return { carried: carried ? { changes: carried.changes.length, clips: carried.clips.length } : null };
}

/** The producer's end: the world's Record closes into the chain and a new one opens; → the chain {worlds, unheld}. */
async function endChain() {
    const ch = state.chain;
    if (!ch) { throw new Error('[maxi-lab] no producer is recording — nothing to hand back.'); }
    try {
        const sc = state.scene;
        if (sc && sc.record) {
            const closed = await closeWorldRecord(sc);
            if (!closed.refused) { await openWorldRecord(sc); }
        }
    } finally { state.chain = null; }
    return { producer: ch.producer, worlds: ch.worlds, unheld: ch.unheld };
}

/** The chain as a status line counts it: {records: closed + the open one, rows: their rows}. */
function chainState() {
    const ch = state.chain;
    if (!ch) { return { records: 0, rows: 0 }; }
    const open = state.scene && state.scene.record;
    const carriedRows = function (w) { return w && w.carried ? w.carried.changes.length : 0; };   // rows from before the producer began are not its own
    return {
        records: ch.worlds.length + (open ? 1 : 0),
        rows: ch.worlds.reduce(function (n, w) { return n + w.folder.record.changes.length - carriedRows(w); }, 0) +
            (open ? open.changes.length - (open === ch.carriedRecord ? carriedRows(ch) : 0) : 0)
    };
}

/** The producer stopped without handing back (the loop stopped, a refused start): its chain is let go; the world's Record goes on. */
function abandonChain() { state.chain = null; }

/** Between two loop rounds (the Owl sent it back): the round's chain is let go and the next round's begins; every act awaits it. */
function beginNextRound() {
    const producer = state.chain ? state.chain.producer : 'loop';
    state.chain = null;
    state.chainTurn = beginChain(producer).catch(function (err) { showError(err, 'loop'); throw err; })
        .finally(function () { state.chainTurn = null; });
    state.chainTurn.catch(function () {});
    return state.chainTurn;
}

/**
 * ONE act and the rows it made: the open Record's rows after the act, read off the package (rec.changes), crossed into this
 * realm as JSON. → {ok:true, value, changes} | {ok:false, error, changes} (a refused act's rows too). The loop's body and the
 * node body (MaxiLab.actRows) read a hand's rows here; nothing else derives them.
 */
async function actRows(act) {
    if (typeof act !== 'function') { throw new Error('[maxi-lab] actRows(act) runs one act.'); }
    if (state.chainTurn) { await state.chainTurn; }
    const sc = state.scene;
    const rec = sc && sc.record;
    const n = rec ? rec.changes.length : 0;
    let value, error = null;
    try { value = await act(); } catch (e) { error = String((e && e.message) || e); }
    const now = state.scene && state.scene.record;
    const rows = (rec ? rec.changes.slice(n) : []).concat(now && now !== rec ? now.changes : []);
    const changes = JSON.parse(JSON.stringify(rows));
    return error === null ? { ok: true, value: value, changes: changes } : { ok: false, error: error, changes: changes };
}

/** A closed chain as it crosses to node (minimaxi/body.mjs): each file as {text} or {base64}. */
function chainForNode(ch) {
    return {
        producer: ch.producer, unheld: ch.unheld,
        worlds: ch.worlds.map(function (w) {
            const files = {};
            Object.keys(w.folder.files).forEach(function (f) { const v = w.folder.files[f]; files[f] = typeof v === 'string' ? { text: v } : { base64: base64OfBytes(v) }; });
            return { folder: { files: files, record: w.folder.record, clips: w.folder.clips }, filmed: w.filmed, carried: w.carried, scene: w.scene };
        })
    };
}

// EVERY load failure — an unknown id, an undeclared mode, a sketch file that does not come back, a
// boot that throws — is painted in the lab and leaves the picker naming the scene actually running
// (or none). The error is then rethrown, so a hand's caller still receives it verbatim.
function loadFailed(err) {
    showError(err);
    syncPicker();
    renderStatus();
    throw err;
}

function loadScene(a) {
    return loadSceneUnguarded(a).catch(loadFailed);
}

async function loadSceneUnguarded(a) {
    const row = walkthroughById(a.id);
    if (!row) {
        throw new Error('loadScene: no scene "' + a.id + '" in the registry. Scenes: [' + WALKTHROUGH.map(function (r) { return r.id; }).join(', ') + '].');
    }
    const modeId = (a.mode === undefined || a.mode === null) ? defaultWalkthroughModeId(row) : a.mode;
    const p = await projectOf(row, { mode: modeId });   // the rung as the project folder it boots (frqtl.json names its entry); refuses an undeclared mode by name
    return mountScene({ label: row.title, kind: 'registry', id: row.id, mode: modeId, modes: walkthroughModes(row).map(function (m) { return m.id; }), path: scenePath(row),
        files: p.files, entry: p.manifest.entry, renderState: p.renderState });
}

async function sceneSource(a) {
    const row = walkthroughById(a.id);
    if (!row) {
        throw new Error('sceneSource: no scene "' + a.id + '" in the registry. Scenes: [' + WALKTHROUGH.map(function (r) { return r.id; }).join(', ') + '].');
    }
    const p = await projectOf(row);
    return { id: row.id, path: scenePath(row), source: p.files[p.manifest.entry] };
}

function derivedRenderer(source) {
    const scene = /\bcreateScene\s*\(/.test(source);
    const canvas = /\bcreateCanvas\s*\(/.test(source);
    return (scene && !canvas) ? 'three' : 'p5';
}

function openSketch(a) {
    return openSketchUnguarded(a).catch(loadFailed);
}

/** The project name a sketch Maxi wrote boots under (its frqtl.json `name`). */
const SKETCH_NAME = 'maxi-sketch';

/**
 * Maxi's one-file sketch as the project folder it boots: the text as the package's SKETCH_ENTRY and the frqtl.json naming it
 * (the package's host step for a one-string sketch, so the world's Record can snapshot the folder).
 */
function sketchFolder(source) {
    const files = {};
    files[MANIFEST_FILE] = serializeManifest(manifestFor({ name: SKETCH_NAME, entry: SKETCH_ENTRY }));
    files[SKETCH_ENTRY] = source;
    return files;
}

async function openSketchUnguarded(a) {
    const renderer = (a.renderer === undefined || a.renderer === null) ? derivedRenderer(a.source) : a.renderer;
    return mountScene({ label: 'sketch (Maxi)', kind: 'sketch', id: null, mode: null, modes: [], path: null, files: sketchFolder(a.source), entry: SKETCH_ENTRY, renderState: { renderer: renderer }, seed: a.seed });
}

/** The same scene from tick 0, in the same frame: the runner's own restart() (same sketch, same seed). */
function restart() {
    return restartUnguarded().catch(loadFailed);
}

async function restartUnguarded() {
    const sc = requireScene('restart');
    showError(null);
    await stopFilming();                                     // the world's Record stays open across the restart; only a rolling clip ends (none spans a re-run)
    state.grab = null;
    await sc.runner.restart();                              // stop → replay the sketch (a re-link of its text) → start; settles after the rebuild, rejects on a failed one
    await sc.runner.firstTick({ deadlineMs: 5000 });         // the replayed world is live: the tick read below is the new one
    attachHand(sc.win.MaxiScene, sc.win);
    resumeRecorder();
    renderCode();
    renderStatus();
    return summary(sc);
}

function inventory() {
    return inventoryOf(requireScene('inventory'));
}

// ── the human's hand ────────────────────────────────────────────────────────────────────────

// One hand per booted scene, bound from THIS document over the frame's DOM (the hands' one
// writePosition lives here). The on/off toggle survives a scene reload: a hand kept on is re-armed.
function attachHand(ms, win) {
    state.hand = attachHandTool({
        runner: ms.runner, host: ms.mount(), win: win,
        onError: function (err) { showError(err, 'hand'); console.error('[maxi-lab] hand:', err); },
        onChange: function () { renderStatus(); },
        endAct: function () { return writeSketch(requireScene('the Hand'), 'the Hand', HUMAN); }   // each act ends written into the sketch, the human's
    });
    win.addEventListener('keydown', onHandKey);
    if (state.handOn) { setHand(true); }
}

function setHand(on) {
    const sc = requireScene('hand');
    try {
        state.hand.set(on);
        state.handOn = !!on;
        clearError('hand');   // only what the hand itself painted — another owner's message stays up
    } catch (err) {
        state.handOn = !!state.hand.enabled;   // a refused leave (a carry that could not be written) keeps the hand on
        showError(err, 'hand');
        throw err;
    } finally {
        el.hand.setAttribute('aria-pressed', String(state.handOn));
        renderStatus();
    }
    return Object.assign({ scene: sc.label }, state.hand.state());
}

/** The human's H key and Hand button: taking the hand is refused while Maxi is working; leaving it never is. */
function humanSetHand(on) {
    if (on) { guardBusy('the Hand (H)'); }
    return setHand(on);
}

function onHandKey(ev) {
    const rec = recordKeyAction(ev);
    const action = handKeyAction(ev);
    if (rec !== 'toggle' && !action) { return; }
    // A world is booting (between mountScene's leaveWorld and attachHand: no scene, no hand) — the Builder's loadScene or
    // openSketch while Maxi works. Nothing can toggle, but a key Maxi's work refuses is refused by name, never dropped.
    if (!state.scene || (rec !== 'toggle' && !state.hand)) {
        const tool = rec === 'toggle' ? 'Record (R)' : action === 'toggle' ? 'the Hand (H)' : null;
        if (tool) { try { guardBusy(tool); } catch (err) { ev.preventDefault(); console.error('[maxi-lab] ' + tool + ' refused while a world boots (shown in #error):', err); } }
        return;
    }
    if (rec === 'toggle') { ev.preventDefault(); toggleRecord().catch(function (err) { console.error('[maxi-lab] record failed (shown in #error):', err); }); return; }
    if (action === 'toggle') { ev.preventDefault(); try { humanSetHand(!state.hand.enabled); } catch (err) { console.error('[maxi-lab] hand toggle refused (shown in #error):', err); } }
    else if (action === 'leave' && state.hand.enabled) { ev.preventDefault(); setHand(false); }
}

// ── the human's Record ──────────────────────────────────────────────────────────────────────

// While Maxi is working the human's Record and Hand are refused by name, painted in the error bar.
function guardBusy(tool) {
    try { refuseWhileWorking(state.loop, tool); }
    catch (err) { showError(err, 'loop'); throw err; }
}

function toggleRecord() {
    requireScene('record');
    try { guardBusy('Record (R)'); } catch (err) { return Promise.reject(err); }
    const p = state.recorder.toggle();
    renderStatus();
    return Promise.resolve(p).then(function (r) { clearError('record'); renderStatus(); return r; }, function (err) {
        if (state.recorder.state().waiting) { el.demo.hidden = false; }   // a refusal for an unsent demonstration shows its card, where Send and × are
        showError(err, 'record'); renderStatus(); throw err;
    });
}

/** The card's close (×): a waiting demonstration is discarded unsent, said by name on the status line; then the card goes. */
function closeDemonstration() {
    try {
        const d = state.recorder ? state.recorder.dismiss() : { discarded: false };
        if (d.discarded) { talkLine('Lab', 'the demonstration was discarded unsent (the card was closed before Send to Maxi).', 'talk-user'); }
        el.demo.hidden = true;
        clearError('record');
    } catch (err) { showError(err, 'record'); }
    renderStatus();
}

/** The card's Send to Maxi: the stopped demonstration and the human's words (maxi-record.js send), refusals painted. */
function sendDemonstration(words) {
    if (!state.recorder) { return Promise.reject(new Error('record: the lab has no Record yet — it is attached when the lab boots.')); }
    let p;
    try { p = state.recorder.send(words); } catch (err) { showError(err, 'record'); return Promise.reject(err); }
    return p.then(function (r) { clearError('record'); renderStatus(); return r; }, function (err) { showError(err, 'record'); renderStatus(); throw err; });
}

// ── the question door: footage to Maxi, from the page itself ───────────────────────────────

// The shell's command door, or a refusal naming it. DeSciX.call itself throws standalone; an
// embedded page with no readable bus ('embedded-no-bridge') is refused here by the same name.
function commandDoor(command, params) {
    if (state.host !== 'shell') {
        throw new Error('the lab asks Maxi through the DeSciX App Shell\'s command door, window.DeSciX.call(\'' + command +
            '\'), and this page is running ' + state.host + ' — there is no shell above it, so nothing was asked' + (params && params.media ? ' (the clip is kept: MaxiLab.clips()).' : '.'));
    }
    return window.DeSciX.call(command, params);
}

function thread() {
    if (!state.thread) {
        state.thread = createThread({ call: commandDoor, onTurn: renderTurn });
    }
    return state.thread;
}

/**
 * lab.ask: the clip is KEPT first (a standalone page still has it for a test), then asked about on the
 * lab's thread. A refusal is painted in the error bar and thrown verbatim to the hand's caller.
 */
async function ask(op, q) {
    if (state.host === 'pending') { throw new Error(op + ': the DeSciX bridge has not settled yet (DeSciX.ready() pending) — nothing was asked; try again in a moment.'); }
    q.media.forEach(function (m) {
        state.clips.push({ op: op, at: new Date().toISOString(), mime_type: m.mime_type, label: m.label || null, data: m.data });
    });
    while (state.clips.length > KEEP_CLIPS) { state.clips.shift(); }
    try {
        // A node body (minimaxi/body.mjs) exposes window.MaxiHostDoor before this page loads; standalone,
        // the question goes there (node owns the threads) instead of the shell's command door.
        const node = state.host !== 'shell' && typeof window.MaxiHostDoor === 'function';
        if (node && q.teaching !== undefined) {
            throw new Error(op + ': the node body\'s door (window.MaxiHostDoor, minimaxi/ask-door.mjs) asks a hand\'s footage and carries no human\'s teaching words — nothing was asked; send a Record demonstration from the lab in the DeSciX App Shell.');
        }
        const out = node
            ? await window.MaxiHostDoor({ op: op, note: q.note, media: q.media })
            : await thread().ask({ op: op, note: q.note, teaching: q.teaching, userInput: footageUserInput(q.note, q.teaching), media: q.media });
        clearError('ask');
        return out;
    } catch (err) {
        showError(err, 'ask');
        throw err;
    }
}

// ── the conversation strip: plain words only ────────────────────────────────────────────────

function talkLine(who, text, cls) {
    const row = document.createElement('div');
    row.className = 'talk-row ' + cls;
    const name = document.createElement('b');
    name.textContent = who;
    const body = document.createElement('p');
    body.textContent = text;
    row.appendChild(name); row.appendChild(body);
    el.talkLines.appendChild(row);
    el.talkLines.scrollTop = el.talkLines.scrollHeight;
    return row;
}

function clipWords(media) {
    return media.map(function (m) { return (m.label || m.mime_type) + ' (' + Math.round(m.bytes / 1024) + ' KB)'; }).join(', ');
}

// One user turn per question (the note that rode with the footage, never the standing question text),
// then Maxi's words or the refusal. textContent only: nothing Maxi writes is rendered as markup.
let pendingRow = null;
function renderTurn(t) {
    if (t.phase === 'asking') {
        talkLine(t.op === 'record' ? 'You' : 'Lab', (t.teaching ? t.teaching + '\n' : '') + t.note + '\n[footage: ' + clipWords(t.media) + ']', 'talk-user');
        pendingRow = talkLine('Maxi', 'looking …', 'talk-maxi talk-pending');
        return;
    }
    const row = pendingRow || talkLine('Maxi', '', 'talk-maxi');
    pendingRow = null;
    row.classList.remove('talk-pending');
    const body = row.querySelector('p');
    if (t.phase === 'refused') {
        row.classList.add('talk-refused');
        body.textContent = 'did not see it — ' + t.error;
        return;
    }
    const w = plainWords(t.answer);
    body.textContent = w.text + (w.fenced ? '\n[' + w.fenced + ' code block' + (w.fenced === 1 ? '' : 's') + ' left out of this strip]' : '');
    const meta = document.createElement('small');
    meta.textContent = (t.usage && typeof t.usage.media_tokens === 'number' ? 'media tokens ' + t.usage.media_tokens + ' · ' : '') + 'thread ' + t.interaction_id.slice(0, 12) + '…';
    row.appendChild(meta);
}

function newThread() {
    if (state.loop && state.loop.running) { showError(new Error('Maxi is still working on the last outline — a new conversation starts when he stops.'), 'loop'); return; }
    thread().reset();
    if (state.loop) { state.loop.reset(); }
    // the strip is cleared with the threads: its rows go, and every inline clip's URL is freed
    el.talkLines.textContent = '';
    pendingRow = null; loopPending = null;
    inlineUrls.revokeAll();
    talkLine('Lab', 'a new conversation with Maxi starts at the next outline or clip.', 'talk-user');
}

// ── the human's scene picker ────────────────────────────────────────────────────────────────

/**
 * Tony picks a scene. Refused by name while Maxi is working (the picker goes back to what is running).
 * Otherwise the scene loads; the demonstration card goes (it showed the last scene); the conversation and
 * Maxi's Designer thread stay; a Lab row says what is now loaded — the next outline is shown it as THE STAGE,
 * and its Builder and Owl threads are new (the loop opens them per outline and per verdict).
 */
async function pickScene(a) {
    try { guardBusy('the scene picker'); }
    catch (err) { syncPicker(); throw err; }
    const sc = await loadScene(a);
    el.demo.hidden = true;
    talkLine('Lab', 'scene switched — now loaded: ' + sc.scene + ' (' + sc.id + (sc.mode ? ' · ' + sc.mode : '') + ', ' +
        sc.dimensions + 'D' + '). Maxi\'s next outline starts from it; this conversation is kept.', 'talk-user');
    return sc;
}

// ── the three-role loop: Tony's outline in, words and clips out ─────────────────────────────

let loopPending = null;

// The rows are maxi-talk.js's (the one owner of the loop's row shapes); this paints them, textContent only (talkLine):
// nothing a role writes is rendered as markup.
function paintRow(r) {
    if (loopPending) { loopPending.remove(); loopPending = null; }
    const row = talkLine(r.who, r.text, r.cls + (r.pending ? ' talk-pending' : ''));
    if (r.pending) { loopPending = row; }
    if (r.approve) { row.classList.add('talk-approve'); }
    if (r.clip) { inlineClip(row, r.clip); }
    return row;
}

const inlineUrls = clipUrlLedger();   // the conversation's inline clips, freed when New conversation clears the strip
function inlineClip(row, clip) {
    const v = document.createElement('video');
    v.controls = true; v.muted = true; v.playsInline = true; v.loop = true;
    v.src = inlineUrls.make(clip.media.mime_type, clip.media.data);
    row.appendChild(v);
    return v;
}

// Words, never code — the loop hands over only the words before each hand-off block. An event with no row THROWS by name.
function renderLoop(e) {
    const rows = loopRowsOf(e);
    if (e.role === 'tony') { el.imagineText.value = ''; }   // the box empties only when the loop takes the outline
    rows.forEach(paintRow);
}

/**
 * The loop's Records follow its rounds: the Owl's verdict sent back (roles.VERDICTS' revise, read off the verdict it carries,
 * never off the row kind the strip paints) lets the round's chain go and begins the next round's; its first act awaits it.
 */
const REVISE = 'revise';
if (roles.VERDICTS.indexOf(REVISE) === -1) { throw new Error('[maxi-lab] maxi-roles.js VERDICTS [' + roles.VERDICTS.join(', ') + '] has no "' + REVISE + '" — the lab cannot tell when a round is sent back.'); }
function roundRecord(e) {
    if (e.role === 'owl' && e.verdict && e.verdict.verdict === REVISE && state.chain) { beginNextRound(); }
}

function theLoop() {
    if (!state.loop) {
        state.loop = createLoop({ roles: roles, brain: threadBrain({ call: commandDoor, roles: roles }), body: labBody({ hands: HANDS, lab: lab }), onEvent: function (e) { roundRecord(e); renderLoop(e); }, recorder: state.recorder,
            hand: { get enabled() { return !!(state.hand && state.hand.enabled); } } });
    }
    return state.loop;
}

/** THE one owner of the conversation form's enabled state: the Imagine box and its Send button flip together, never apart. */
function setConversationEnabled(on) {
    el.imagineText.disabled = !on;
    el.imagineSend.disabled = !on;
}

/** Tony's message → the loop. A question is answered in words (its row is the loop's; no build, no Record); an approved clip is kept as a demonstration on Record's card. */
async function imagine(outline) {
    if (state.host === 'pending') { throw new Error('imagine: the DeSciX bridge has not settled yet (DeSciX.ready() pending) — nothing was asked; try again in a moment.'); }
    setConversationEnabled(false);
    let recording = false;
    try {
        if (!state.chain) { await beginChain('loop'); recording = true; }   // a human Record that is on is refused by the loop itself, by name
        const out = await theLoop().imagine(outline);
        if (out.answered) { clearError('loop'); return out; }   // a question: the answer row is painted; the card and the Records stay the last build's (the chain is let go below)
        const ch = await endChain();
        recording = false;
        state.records = assembleLoopRecords(out, { worlds: ch.worlds, unheld: ch.unheld, brain: 'platform' });
        const handBack = state.records[state.records.length - 1];
        paintCard(demoCard, {
            mime: out.clip.media.mime_type, base64: out.clip.media.data,
            title: 'Demonstration · ' + out.outline + ' · ' + out.clip.seconds.toFixed(1) + ' s · the Owl approved (round ' + out.rounds + ')',
            lines: 'Prediction: ' + out.prediction + '\n' + (state.records.length > 1 ? state.records.length + ' Records, one per world the Builder booted; the hand-back is ' + handBack.name + '\n' : '') +
                changesAsText(handBack.record.changes) + '\n' + completenessWords(handBack)
        });
        clearError('loop');
        return out;
    } catch (err) {
        showError(err, 'loop');
        throw err;
    } finally {
        if (recording) { abandonChain(); }
        setConversationEnabled(true);
        el.imagineText.focus();
        renderStatus();
    }
}

// A memory clip served beside this page (site/memories/<id>/clip.mp4), fetched as bytes for the same
// question door `see` uses (media[] takes `data` base64 or an app `asset_ref`; a served URL is neither,
// so the bytes travel). Relative URL on purpose — the site lives under a path prefix.
const MEMORY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
async function fetchMemory(op, id) {
    if (!MEMORY_ID_RE.test(id)) { throw new Error(op + ': a memory id is [A-Za-z0-9._-] (got ' + JSON.stringify(id) + ').'); }
    const url = 'memories/' + id + '/clip.mp4';
    const res = await fetch(url);
    if (!res.ok) { throw new Error(op + ': GET ' + url + ' answered ' + res.status + ' — no clip is served for memory "' + id + '".'); }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (type !== 'video/mp4') { throw new Error(op + ': ' + url + ' is served as "' + type + '", not video/mp4 — the question door takes the clip by its declared type; fix the serving type.'); }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length) { throw new Error(op + ': ' + url + ' is empty.'); }
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) { bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); }
    return { mime_type: type, data: btoa(bin), bytes: buf.length, url: new URL(url, document.baseURI).href };
}

function say(text) {
    state.says.push(text);
    el.says.hidden = false;
    el.says.textContent = 'Maxi: ' + text;
}

// ── the lab the hands run against, and the hands themselves (registered NOW) ───────────────

const lab = {
    host: function () { return state.host; },
    scene: requireScene,
    current: function () { return state.scene; },
    state: state,
    loadScene: loadScene, sceneSource: sceneSource, openSketch: openSketch, restart: restart,
    inventory: inventory, ask: ask, fetchMemory: fetchMemory, say: say,
    actRows: actRows, beginChain: beginChain, endChain: endChain, abandonChain: abandonChain, chainState: chainState
};

// The shell's Run (a ```json:call:<hand> block in its chat) is refused by name while Maxi is working: the
// Builder drives the stage through its own adapter (maxi-loop.js labBody), which this gate never sees.
function shellGate(op) { guardBusy('the shell\'s ' + op + ' (Run)'); }

publishHands(window, lab, shellGate);
assertAdapterCoversHands(window.DeSciX_Actions, HANDS);

// ── the page ────────────────────────────────────────────────────────────────────────────────

function option(label, id, mode) {
    const o = document.createElement('option');
    o.textContent = label;
    o.value = id + (mode ? '#' + mode : '');
    o.dataset.id = id;
    if (mode) { o.dataset.mode = mode; }
    return o;
}

function buildPicker() {
    el.picker.innerHTML = '';
    const ex = document.createElement('optgroup');
    ex.label = 'Impossible things, running';
    EXHIBITS.forEach(function (row) { ex.appendChild(option(row.title, row.id, row.mode)); });
    el.picker.appendChild(ex);
    const groups = [];
    WALKTHROUGH.forEach(function (rung) {
        const g = walkthroughGroup(rung);
        if (groups.indexOf(g) === -1) { groups.push(g); }
    });
    groups.forEach(function (g) {
        const og = document.createElement('optgroup');
        og.label = g;
        WALKTHROUGH.filter(function (r) { return walkthroughGroup(r) === g; })
            .forEach(function (r) {
                const modes = walkthroughModes(r);
                if (modes.length > 1) {   // one option per declared mode, so the picker can name exactly what runs
                    modes.forEach(function (m) { og.appendChild(option(r.title + ' · ' + m.label, r.id, m.id)); });
                } else {
                    og.appendChild(option(r.title, r.id, null));
                }
            });
        el.picker.appendChild(og);
    });
}

function syncPicker() {
    const sc = state.scene;
    if (!sc || sc.kind !== 'registry') { el.picker.value = ''; return; }
    const opts = Array.prototype.slice.call(el.picker.options);
    // EXACT (id + mode) or nothing: a near match would name a scene that is not the one running.
    const exact = opts.find(function (o) { return o.dataset.id === sc.id && (o.dataset.mode || null) === (sc.mode || null); });
    el.picker.value = exact ? exact.value : '';
}

function renderCode() {
    const sc = state.scene;
    if (!sc) { el.codeTitle.textContent = ''; el.codeText.textContent = ''; return; }
    el.codeTitle.textContent = sc.kind === 'registry' ? (sc.path + ' — ' + sc.label) : sc.label;
    el.codeText.textContent = sc.source;
}

// The scene's card (the Info button's panel): every word from the registry through maxi-card.js, painted textContent only.
function renderInfo() {
    const sc = state.scene;
    el.infoBody.textContent = '';
    if (!sc) { el.infoTitle.textContent = ''; return; }
    const lines = cardLines(sc.kind === 'registry' ? sceneCard(CARD_REGISTRY, sc.id) : null);
    el.infoTitle.textContent = lines[0].kind === 'title' ? lines[0].text : sc.label;
    lines.forEach(function (l) {
        if (l.kind === 'title') { return; }
        const n = document.createElement(l.kind === 'label' ? 'h3' : 'p');
        n.className = 'info-' + l.kind;
        n.textContent = l.text;
        el.infoBody.appendChild(n);
    });
}

// The error bar remembers WHO painted it, so a part clears only its own message (clearError(owner));
// showError(null) — a fresh scene load — clears whatever is there.
function showError(err, owner) {
    if (!err) { el.error.hidden = true; el.error.textContent = ''; delete el.error.dataset.owner; return; }
    el.error.hidden = false;
    el.error.textContent = String((err && err.message) || err);
    el.error.dataset.owner = owner || 'lab';
}
function clearError(owner) {
    if (el.error.dataset.owner === owner) { showError(null); }
}

function renderStatus() {
    const sc = state.scene;
    const parts = ['host: ' + state.host + (state.view ? ' (' + state.view + ')' : ''), 'frqtl-web ' + (sdk.version || '…')];
    if (state.thread && state.thread.id) { parts.push('Maxi thread · ' + state.thread.turns + ' turn' + (state.thread.turns === 1 ? '' : 's')); }
    if (state.loop && state.loop.running) { parts.push('Maxi is working'); }
    if (state.loading) { parts.push('booting ' + state.loading + ' …'); }
    else if (sc) { parts.push(sc.label + ' · ' + sc.renderer + ' · tick ' + (sc.record ? sc.tick() : '-') + (sc.runner.isRunning ? '' : ' · PAUSED')); }
    else { parts.push('no scene'); }
    if (sc && state.hand) { parts.push(state.hand.state().text); }
    if (sc && state.recorder) { parts.push(state.recorder.state().text); }
    el.status.textContent = parts.join('  ·  ');
    if (sc && !sc.runner.isRunning) { iconButton(el.run, icons, 'play', 'Resume'); } else { iconButton(el.run, icons, 'pause', 'Pause'); }
    el.run.disabled = !sc; el.restart.disabled = !sc; el.hand.disabled = !sc; el.record.disabled = !sc;
    el.hand.setAttribute('aria-pressed', String(!!(state.hand && state.hand.enabled)));
    el.record.setAttribute('aria-pressed', String(!!(state.recorder && state.recorder.recording)));
    if (state.recorder && state.recorder.recording) { iconButton(el.record, icons, 'stop', 'Stop'); } else { iconButton(el.record, icons, 'record', 'Record'); }
}

// ── full screen (mobile) ──────────────────────────────────────────────────────────────────────
// On a phone the shell's own chrome (its header, the frame's margins) takes the lab's real estate. Inside the shell's frame
// (allow="fullscreen", measured 2026-10-18) Chromium grants element full screen from a user gesture; iPhone Safari offers
// no element Fullscreen API at all (WebKit iPhone emulation: document.fullscreenEnabled and requestFullscreen undefined).
// When the lab is on a phone: MOBILE_QUERY, owned by maxi-host-view.js (the same rule decides the host view).

/** Whether this page can go full screen here: {available, why}. */
function fullscreenAvailability() {
    const root = document.documentElement;
    if (typeof root.requestFullscreen !== 'function') {
        return { available: false, why: 'this browser offers no element Fullscreen API to the lab (document.documentElement.requestFullscreen is ' + typeof root.requestFullscreen + '; iPhone Safari has none)' };
    }
    if (document.fullscreenEnabled !== true) {
        return { available: false, why: 'document.fullscreenEnabled is ' + document.fullscreenEnabled + ' in the lab\'s frame (the host\'s iframe does not allow fullscreen)' };
    }
    return { available: true, why: null };
}

/**
 * THE full-screen door (window.MaxiLab.fullscreen, the header's Full screen button): fullscreen(true) puts the lab's own page in
 * full screen, fullscreen(false) leaves it; it must run inside a user gesture (a click). Resolves {fullscreen: boolean}.
 * THROWS by name when full screen is unavailable here (fullscreenAvailability().why) or the browser refuses the request.
 */
async function fullscreen(on) {
    const want = on !== false;
    if (!want) {
        if (document.fullscreenElement) { await document.exitFullscreen(); }
        renderFullscreen();
        return { fullscreen: !!document.fullscreenElement };
    }
    const can = fullscreenAvailability();
    if (!can.available) { throw new Error('fullscreen: refused — ' + can.why + '. The lab stays in its frame.'); }
    if (!document.fullscreenElement) {
        try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); }
        catch (err) { throw new Error('fullscreen: the browser refused requestFullscreen (' + ((err && err.name) || 'Error') + ': ' + ((err && err.message) || err) + ') — it is granted only inside a user gesture such as a click.'); }
    }
    renderFullscreen();
    return { fullscreen: !!document.fullscreenElement };
}

function renderFullscreen() {
    el.fullscreen.hidden = !fullscreenAvailability().available;
    const on = !!document.fullscreenElement;
    el.fullscreen.setAttribute('aria-pressed', String(on));
    if (on) { iconButton(el.fullscreen, icons, 'fullscreenExit', 'Exit full screen'); } else { iconButton(el.fullscreen, icons, 'fullscreen', 'Full screen'); }
}

// The side panes (Scene code, Info) share ONE slot beside the conversation: opening one closes the other, so the stage
// keeps its width (two open panes left it 9 px at 1232 px). Each button's aria-pressed says whether its pane is open.
function toggleSidePane(which) {
    const panes = { code: [el.code, el.codePane], info: [el.info, el.infoPane] };
    if (!panes[which]) { throw new Error('[maxi-lab] toggleSidePane: no side pane "' + which + '" (code | info).'); }
    const open = panes[which][1].hidden;
    Object.keys(panes).forEach(function (k) {
        const on = k === which && open;
        panes[k][1].hidden = !on;
        panes[k][0].setAttribute('aria-pressed', String(on));
    });
}

function wireUi() {
    iconButton(el.restart, icons, 'restart');   // the static buttons keep app.html's words
    iconButton(el.hand, icons, 'hand');
    iconButton(el.code, icons, 'code');
    iconButton(el.info, icons, 'info');
    el.picker.addEventListener('change', function () {
        const o = el.picker.selectedOptions[0];
        if (!o || !o.dataset.id) { return; }
        pickScene({ id: o.dataset.id, mode: o.dataset.mode }).catch(function (err) { console.error('[maxi-lab] picker load refused or failed (shown in #error):', err); });
    });
    el.run.addEventListener('click', function () {
        const sc = state.scene; if (!sc) { return; }
        if (sc.runner.isRunning) { sc.runner.stop(); } else { sc.runner.start(); }
        renderStatus();
    });
    el.restart.addEventListener('click', function () { restart().catch(function (err) { console.error('[maxi-lab] restart failed (shown in #error):', err); }); });
    el.code.addEventListener('click', function () { toggleSidePane('code'); });
    el.info.addEventListener('click', function () { toggleSidePane('info'); });
    el.hand.addEventListener('click', function () {
        try { humanSetHand(!(state.hand && state.hand.enabled)); }
        catch (err) { console.error('[maxi-lab] hand toggle failed (shown in #error):', err); }
    });
    el.record.addEventListener('click', function () {
        toggleRecord().catch(function (err) { console.error('[maxi-lab] record failed (shown in #error):', err); });
    });
    el.demoClose.addEventListener('click', closeDemonstration);
    el.demoTeach.addEventListener('submit', function (ev) {
        ev.preventDefault();
        sendDemonstration(el.demoTeachText.value).catch(function (err) { console.error('[maxi-lab] the demonstration was not handed to Maxi (shown in #error):', err); });
    });
    el.fullscreen.addEventListener('click', function () {
        fullscreen(!document.fullscreenElement).then(function () { clearError('fullscreen'); }, function (err) { showError(err, 'fullscreen'); console.error('[maxi-lab] full screen:', err); });
    });
    document.addEventListener('fullscreenchange', renderFullscreen);
    renderFullscreen();
    el.talkNew.addEventListener('click', newThread);
    el.imagine.addEventListener('submit', function (ev) {
        ev.preventDefault();
        const text = el.imagineText.value.trim();
        if (!text) { return; }
        imagine(text).catch(function (err) { console.error('[maxi-lab] imagine stopped (shown in the conversation and #error):', err); });
    });
    window.addEventListener('keydown', onHandKey);
    state.recorder = attachRecorder({
        lab: lab,
        onError: function (err) { showError(err, 'record'); console.error('[maxi-lab] record:', err); },
        onChange: function () { renderStatus(); },
        card: demoCard
    });
    setInterval(renderStatus, 500);
}

// The host view is declared ONCE, by maxi-host-view.js (imported above, so it runs before this module's body and the
// full-screen door): NoChrome on a phone, CodeSite otherwise. This page only READS its outcome.
async function hostViewRecord() {
    const outcome = await hostView;
    return outcome.record + (outcome.detail ? ' — ' + outcome.detail : '');
}

async function settleHost() {
    if (!window.DeSciX || typeof window.DeSciX.ready !== 'function') {
        state.host = 'sdk-absent';
        throw new Error('[maxi-lab] window.DeSciX is missing: DeSciXAppSDK.js is not beside this page.');
    }
    const viewRecord = hostViewRecord();
    state.view = 'view pending';
    renderStatus();
    const settled = await window.DeSciX.ready();
    state.host = settled.mode;
    state.bridge = settled;
    state.view = 'view ' + await viewRecord;
    renderStatus();
}

// The lab OPENS on the double slit in 3D. WHICH scene Maxi starts on is the lab's own product choice: it does not follow
// FRQTL's first-contact rung (the registry's FIRST_CONTACT_WALKTHROUGH_ID), so the id is typed here. Only the MODE is read
// off the registry: the rung's declared default (defaultWalkthroughModeId), never spelled here. `?scene=<id>&mode=<m>`
// overrides both.
const OPENING_SCENE_ID = 'dse-tunnel-rebuild';

/** The opening scene {id, mode}: THROWS by name when the id is not a registry rung. Exported so a test gates it (scripts/test/lab-opening.test.mjs). */
export function openingScene() {
    const row = walkthroughById(OPENING_SCENE_ID);
    if (!row) {
        throw new Error('[maxi-lab] the opening scene "' + OPENING_SCENE_ID + '" is not a registry rung. Scenes: [' + WALKTHROUGH.map(function (r) { return r.id; }).join(', ') + '].');
    }
    return { id: row.id, mode: defaultWalkthroughModeId(row) };
}

function firstScene() {
    const q = new URLSearchParams(window.location.search);
    if (q.get('scene')) { return { id: q.get('scene'), mode: q.get('mode') || undefined }; }
    return openingScene();
}

const ready = (async function main() {
    await SDK_MANIFEST;
    icons = await ICONS;
    buildPicker();
    wireUi();
    renderStatus();
    await settleHost();
    setConversationEnabled(true);   // standalone too: an outline there is refused loudly, naming the shell's door
    return loadScene(firstScene());
})();
ready.catch(function (err) { showError(err); console.error('[maxi-lab] boot failed:', err); });

window.MaxiLab = Object.freeze({
    hands: HANDS,
    state: state,
    ready: ready,
    get sdkVersion() { return sdk.version; },
    exhibits: function () { return EXHIBITS.map(function (e) { return { id: e.id, mode: e.mode, title: e.title }; }); },
    rungs: function () { return WALKTHROUGH.map(function (r) { return { id: r.id, title: r.title, group: walkthroughGroup(r) }; }); },
    loadScene: loadScene, sceneSource: sceneSource, openSketch: openSketch, restart: restart,
    /** THE inventory hand (maxi-hands.js HANDS.inventory, the loop's stage): INVENTORY_KEYS plus the sketch's SKETCH_KEYS (parts, project). A Promise. */
    inventory: function () { return HANDS.inventory.run(lab); },
    hand: function () { return state.hand; }, setHand: setHand,
    recorder: function () { return state.recorder; }, toggleRecord: toggleRecord,
    /** The demonstration card's Send to Maxi: hand the stopped Record over with the human's words ('' = none). A Promise of the Records. */
    sendDemonstration: sendDemonstration,
    ask: ASK,
    thread: function () { return state.thread ? { id: state.thread.id, turns: state.thread.turns } : null; },
    imagine: imagine,
    /** Full screen for the mobile layout (see fullscreen() above): call it from a click; it THROWS by name where full screen is unavailable — ask fullscreenAvailable() first. */
    fullscreen: fullscreen,
    fullscreenAvailable: fullscreenAvailability,
    mobile: function () { return window.matchMedia(MOBILE_QUERY).matches; },
    loop: function () { return state.loop ? { running: state.loop.running, designer: state.loop.designerId, last: state.loop.last() } : null; },
    clips: function () { return state.clips.slice(); },
    /** The newest loop approve's Records [{name, files, record, lab, faults, complete}] in chain order, or null. */
    records: function () { return state.records; },
    /** Run one act and read the rows it made off the world's Record (the node body's door: minimaxi/body.mjs). */
    actRows: actRows,
    /** The node loop's Record doors (minimaxi/body.mjs /bridge/record): begin a producer's chain; end it → its closed Records, files as {text}|{base64}. */
    beginRecord: function (producer) { return beginChain(producer); },
    beginNextRound: function () { return beginNextRound(); },
    endRecord: function () { return endChain().then(chainForNode); },
    abandonRecord: function () { abandonChain(); return { abandoned: true }; }
});
