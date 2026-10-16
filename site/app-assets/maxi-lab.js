/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-lab.js — Maxi's Lab (app.html): the whole frame in the DeSciX shell, with Maxi's conversation in its own panel (#talk).
 *
 * Built on the PUBLISHED @descix/frqtl-sdk (vendored byte-identically, see ./frqtl-sdk.js):
 *   - scenes come from the package's registries (WALKTHROUGH rungs, the EXHIBITS roster) — this file
 *     holds no id → file table; a sketch's text is fetched by the package's own loadSceneSource;
 *   - ONE boot door: every scene — registry rung or a sketch Maxi wrote — boots through `bootRecipe`
 *     in its own scene document (scene.html, replaced per load; see maxi-scene.js for why); a restart
 *     is the runner's own `restart()` in that same document;
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

import { HANDS, publishHands, assertAdapterCoversHands, inventoryObjects, inventoryOf, worldShape, declaredModesOf } from './maxi-hands.js';
import { attachHandTool, handKeyAction } from './maxi-hand-tool.js';
import { attachRecorder, recordKeyAction, RECORD_DROPPED, paintCard, clipUrlLedger } from './maxi-record.js';
import { createLoop, threadBrain, labBody, refuseWhileWorking } from './maxi-loop.js';
import * as roles from './maxi-roles.js';
import { ASK, createThread, footageUserInput, plainWords } from './maxi-ask.js';
import {
    WALKTHROUGH, walkthroughById, walkthroughGroup, walkthroughModes, defaultWalkthroughModeId, effectiveRenderState,
    EXHIBITS, loadSceneSource, scenePath, SDK_VERSION
} from './frqtl-sdk.js';

const SCENE_PAGE = 'scene.html';   // relative on purpose: the shell serves this site under a path prefix

const state = {
    host: 'pending', bridge: null, view: null,
    frame: null, scene: null, grab: null,
    hand: null, handOn: false,            // the human's hand (maxi-hand-tool.js): per scene; the toggle outlives a reload
    recorder: null,                       // the human's Record (maxi-record.js): one per lab; a scene swap disposes a running one
    loading: null, says: [],
    thread: null,                         // the lab's ONE thread with Maxi (maxi-ask.js createThread), made once the host settles
    loop: null,                           // the three-role loop (maxi-loop.js): Tony's outlines, three threads of its own
    clips: []                             // every clip the lab handed (or tried to hand) to Maxi, newest last, kept for a test to look at
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
    talk: document.getElementById('talk'),
    talkLines: document.getElementById('talk-lines'),
    talkNew: document.getElementById('talk-new'),
    imagine: document.getElementById('imagine'),
    imagineText: document.getElementById('imagine-text'),
    code: document.getElementById('btn-code'),
    codePane: document.getElementById('code'),
    codeTitle: document.getElementById('code-title'),
    codeText: document.getElementById('code-text'),
    status: document.getElementById('status'),
    says: document.getElementById('says'),
    error: document.getElementById('error')
};
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

/** The one mount path: a fresh scene document, booted through the SDK's bootRecipe. */
async function mountScene(spec) {
    if (state.loading) { throw new Error('[maxi-lab] a scene is still booting (' + state.loading + ') — wait for it before loading another.'); }
    state.loading = spec.label;
    showError(null);
    try {
        if (state.hand) { state.hand.dispose(); state.hand = null; }
        await dropRecording('a scene swap');
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
        const booted = await ms.boot({ label: spec.label, source: spec.source, renderState: spec.renderState, seed: spec.seed });
        state.scene = {
            label: spec.label, kind: spec.kind, id: spec.id, mode: spec.mode, modes: spec.modes, path: spec.path, source: spec.source,
            renderer: booted.renderer, win: win, runner: ms.runner, recipeContext: ms.recipeContext,
            tick: function () { return ms.tick(); }
        };
        attachHand(ms, win);
        renderCode();
        syncPicker();
        return summary(state.scene);
    } catch (err) {
        showError(err);
        throw err;
    } finally {
        state.loading = null;
        renderStatus();
    }
}

// A running Record is disposed and SETTLED before the scene it films is replaced or restarted, so its
// encoder cannot fail after the swap; the drop is painted under its own owner.
async function dropRecording(why) {
    if (!(state.recorder && state.recorder.recording)) { return; }
    const drop = await state.recorder.dispose();
    console.warn('[maxi-lab] record dropped by ' + why + ' (' + drop.settled + ').');
    showError(new Error(RECORD_DROPPED), 'record-drop');
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
    const renderState = effectiveRenderState(row, modeId);   // refuses an undeclared mode naming the declared ones
    const source = await loadSceneSource(row);
    return mountScene({ label: row.title, kind: 'registry', id: row.id, mode: modeId, modes: walkthroughModes(row).map(function (m) { return m.id; }), path: scenePath(row), source: source, renderState: renderState });
}

async function sceneSource(a) {
    const row = walkthroughById(a.id);
    if (!row) {
        throw new Error('sceneSource: no scene "' + a.id + '" in the registry. Scenes: [' + WALKTHROUGH.map(function (r) { return r.id; }).join(', ') + '].');
    }
    return { id: row.id, path: scenePath(row), source: await loadSceneSource(row) };
}

function derivedRenderer(source) {
    const scene = /\bcreateScene\s*\(/.test(source);
    const canvas = /\bcreateCanvas\s*\(/.test(source);
    return (scene && !canvas) ? 'three' : 'p5';
}

function openSketch(a) {
    return openSketchUnguarded(a).catch(loadFailed);
}

async function openSketchUnguarded(a) {
    const renderer = (a.renderer === undefined || a.renderer === null) ? derivedRenderer(a.source) : a.renderer;
    return mountScene({ label: 'sketch (Maxi)', kind: 'sketch', id: null, mode: null, modes: [], path: null, source: a.source, renderState: { renderer: renderer }, seed: a.seed });
}

/** The same scene from tick 0, in the same frame: the runner's own restart() (same sketch, same seed). */
function restart() {
    return restartUnguarded().catch(loadFailed);
}

async function restartUnguarded() {
    const sc = requireScene('restart');
    showError(null);
    if (state.hand) { state.hand.dispose(); state.hand = null; }
    await dropRecording('a restart');
    state.grab = null;
    sc.runner.restart();                                    // stop → replay the sketch → start (schedules, delivers nothing yet)
    await sc.runner.firstTick({ deadlineMs: 5000 });         // the replayed world is live: the tick read below is the new one
    attachHand(sc.win.MaxiScene, sc.win);
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
        onChange: function () { renderStatus(); }
    });
    win.addEventListener('keydown', onHandKey);
    if (state.handOn) { setHand(true); }
}

function setHand(on) {
    const sc = requireScene('hand');
    try {
        state.hand.set(on);
        state.handOn = !!on;
        clearError('hand');   // only what the hand itself painted — a swap's RECORD_DROPPED stays up
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
    if (!state.scene) { return; }
    const rec = recordKeyAction(ev);
    if (rec === 'toggle') { ev.preventDefault(); toggleRecord().catch(function (err) { console.error('[maxi-lab] record failed (shown in #error):', err); }); return; }
    const action = handKeyAction(ev);
    if (!action || !state.hand) { return; }
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
    return Promise.resolve(p).then(function (r) { clearError('record'); renderStatus(); return r; }, function (err) { showError(err, 'record'); renderStatus(); throw err; });
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
        const out = (state.host !== 'shell' && typeof window.MaxiHostDoor === 'function')
            ? await window.MaxiHostDoor({ op: op, note: q.note, media: q.media })
            : await thread().ask({ op: op, note: q.note, userInput: footageUserInput(q.note), media: q.media });
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
        talkLine(t.op === 'record' ? 'You' : 'Lab', t.note + '\n[footage: ' + clipWords(t.media) + ']', 'talk-user');
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

const ROLE_ROW = { tony: ['You', 'talk-tony'], designer: [roles.ROLES.designer.name, 'talk-maxi'], builder: [roles.ROLES.builder.name, 'talk-builder'], owl: [roles.ROLES.owl.name, 'talk-owl'], loop: ['Lab', 'talk-refused'] };
let loopPending = null;

function loopRow(role, text) {
    if (loopPending) { loopPending.remove(); loopPending = null; }
    const who = ROLE_ROW[role];
    if (!who) { throw new Error('[maxi-lab] the loop spoke as an unknown role "' + role + '".'); }
    return talkLine(who[0], text, who[1]);
}

const inlineUrls = clipUrlLedger();   // the conversation's inline clips, freed when New conversation clears the strip
function inlineClip(row, clip) {
    const v = document.createElement('video');
    v.controls = true; v.muted = true; v.playsInline = true; v.loop = true;
    v.src = inlineUrls.make(clip.media.mime_type, clip.media.data);
    row.appendChild(v);
    return v;
}

/** The Owl's account of the footage (what it looked at), as words, in the roles module's own SEEN_ACCOUNT order. */
function seenWords(seen) {
    const keys = Object.keys(roles.SEEN_ACCOUNT);
    const missing = keys.filter(function (k) { return !seen || typeof seen[k] !== 'string' || !seen[k].trim(); });
    if (missing.length) { throw new Error('[maxi-lab] the Owl\'s verdict reached the page without its account of the footage (' + missing.join(', ') + ').'); }
    return 'What I saw — ' + keys.map(function (k) { return k + ': ' + seen[k]; }).join('; ') + '.';
}

// textContent only (talkLine): nothing a role writes is rendered as markup. Words, never code — the loop
// hands over only the words before each hand-off block.
function renderLoop(e) {
    if (e.kind === 'asking') {
        if (loopPending) { loopPending.remove(); }
        const who = ROLE_ROW[e.role];
        loopPending = talkLine(who[0], e.role === 'owl' ? 'watching the clip …' : (e.role === 'builder' ? 'working …' : 'thinking …'), who[1] + ' talk-pending');
        return;
    }
    if (e.role === 'tony') { el.imagineText.value = ''; loopRow('tony', e.words); return; }   // the box empties only when the loop takes the outline
    // a role that said nothing before its hand-off gets a bracketed lab fact, never words put in its mouth
    if (e.role === 'designer') { loopRow('designer', (e.words || '[plan handed to the Builder]') + '\nPrediction: ' + e.prediction); return; }
    if (e.role === 'builder' && e.kind === 'working') { loopRow('builder', (e.words ? e.words + '\n' : '') + '[' + e.hand + (e.ok ? ' ran' : ' was refused') + ']'); return; }
    if (e.role === 'builder' && e.kind === 'built') {
        const row = loopRow('builder', 'built — watch.' + (e.round > 1 ? ' (round ' + e.round + ')' : '') + '\nPrediction: ' + e.prediction);
        inlineClip(row, e.clip);
        return;
    }
    if (e.role === 'owl') {
        const row = loopRow('owl', (e.kind === 'approve' ? 'Approved. ' : 'Sent back. ') + (e.words ? e.words + '\n' : '') + seenWords(e.seen) + '\n' +
            e.reasons.map(function (r) { return '· ' + r; }).join('\n') + (e.change ? '\nChange: ' + e.change : ''));
        if (e.kind === 'approve') { row.classList.add('talk-approve'); }
        return;
    }
    if (e.role === 'loop') { loopRow('loop', e.words); return; }
    throw new Error('[maxi-lab] the loop emitted an event the page does not show: ' + e.role + ':' + e.kind);
}

function theLoop() {
    if (!state.loop) {
        state.loop = createLoop({ roles: roles, brain: threadBrain({ call: commandDoor, roles: roles }), body: labBody({ hands: HANDS, lab: lab }), onEvent: renderLoop, recorder: state.recorder,
            hand: { get enabled() { return !!(state.hand && state.hand.enabled); } } });
    }
    return state.loop;
}

/** Tony's outline → the loop. An approved clip is kept as a demonstration on Record's card. */
async function imagine(outline) {
    if (state.host === 'pending') { throw new Error('imagine: the DeSciX bridge has not settled yet (DeSciX.ready() pending) — nothing was asked; try again in a moment.'); }
    el.imagineText.disabled = true;
    try {
        const out = await theLoop().imagine(outline);
        paintCard({ root: el.demo, title: el.demoTitle, video: el.demoClip, lines: el.demoChanges }, {
            mime: out.clip.media.mime_type, base64: out.clip.media.data,
            title: 'Demonstration · ' + out.outline + ' · ' + out.clip.seconds.toFixed(1) + ' s · the Owl approved (round ' + out.rounds + ')',
            lines: 'Prediction: ' + out.prediction
        });
        clearError('loop');
        return out;
    } catch (err) {
        showError(err, 'loop');
        throw err;
    } finally {
        el.imagineText.disabled = false;
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
    state: state,
    loadScene: loadScene, sceneSource: sceneSource, openSketch: openSketch, restart: restart,
    inventory: inventory, ask: ask, fetchMemory: fetchMemory, say: say
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
    const parts = ['host: ' + state.host + (state.view ? ' (' + state.view + ')' : ''), 'frqtl-sdk ' + SDK_VERSION];
    if (state.thread && state.thread.id) { parts.push('Maxi thread · ' + state.thread.turns + ' turn' + (state.thread.turns === 1 ? '' : 's')); }
    if (state.loop && state.loop.running) { parts.push('Maxi is working'); }
    if (state.loading) { parts.push('booting ' + state.loading + ' …'); }
    else if (sc) { parts.push(sc.label + ' · ' + sc.renderer + ' · tick ' + (sc.tick() == null ? '-' : sc.tick()) + (sc.runner.isRunning ? '' : ' · PAUSED')); }
    else { parts.push('no scene'); }
    if (sc && state.hand) { parts.push(state.hand.state().text); }
    if (sc && state.recorder) { parts.push(state.recorder.state().text); }
    el.status.textContent = parts.join('  ·  ');
    el.run.textContent = (sc && !sc.runner.isRunning) ? 'Resume' : 'Pause';
    el.run.disabled = !sc; el.restart.disabled = !sc; el.hand.disabled = !sc; el.record.disabled = !sc;
    el.hand.setAttribute('aria-pressed', String(!!(state.hand && state.hand.enabled)));
    el.record.setAttribute('aria-pressed', String(!!(state.recorder && state.recorder.recording)));
    el.record.textContent = (state.recorder && state.recorder.recording) ? 'Stop' : 'Record';
}

function wireUi() {
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
    el.code.addEventListener('click', function () {
        el.codePane.hidden = !el.codePane.hidden;
        el.code.setAttribute('aria-pressed', String(!el.codePane.hidden));
    });
    el.hand.addEventListener('click', function () {
        try { humanSetHand(!(state.hand && state.hand.enabled)); }
        catch (err) { console.error('[maxi-lab] hand toggle failed (shown in #error):', err); }
    });
    el.record.addEventListener('click', function () {
        toggleRecord().catch(function (err) { console.error('[maxi-lab] record failed (shown in #error):', err); });
    });
    el.demoClose.addEventListener('click', function () { el.demo.hidden = true; });
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
        card: { root: el.demo, title: el.demoTitle, video: el.demoClip, lines: el.demoChanges }
    });
    setInterval(renderStatus, 500);
}

// The host view is declared ONCE, by app-assets/host-view.js (loaded before this module by app.html):
// it asks the shell for the whole frame (CodeSite) and records the outcome on
// <html data-descix-view> (+ data-descix-view-detail). This page only READS that record.
function hostViewRecord() {
    const root = document.documentElement;
    const first = root.dataset.descixView;
    if (first === undefined) {
        throw new Error('[maxi-lab] no data-descix-view record on <html>: app-assets/host-view.js did not run before this module (app.html must load it after DeSciXAppSDK.js and before maxi-lab.js).');
    }
    const read = function () { const d = root.dataset.descixViewDetail; return root.dataset.descixView + (d ? ' — ' + d : ''); };
    if (first !== 'pending') { return Promise.resolve(read()); }
    return new Promise(function (resolve) {
        const watch = new MutationObserver(function () {
            if (root.dataset.descixView !== 'pending') { watch.disconnect(); resolve(read()); }
        });
        watch.observe(root, { attributes: true, attributeFilter: ['data-descix-view', 'data-descix-view-detail'] });
    });
}

async function settleHost() {
    if (!window.DeSciX || typeof window.DeSciX.ready !== 'function') {
        state.host = 'sdk-absent';
        throw new Error('[maxi-lab] window.DeSciX is missing: DeSciXAppSDK.js is not beside this page.');
    }
    const viewRecord = hostViewRecord();
    state.view = 'view ' + document.documentElement.dataset.descixView;
    renderStatus();
    const settled = await window.DeSciX.ready();
    state.host = settled.mode;
    state.bridge = settled;
    state.view = 'view ' + await viewRecord;
    renderStatus();
}

// The lab OPENS on a 2D scene with declared walls (hands and video are proven on 2D first):
// the registry's first-contact rung in its declared '2d' mode — the double slit with named walls
// (wall1/wall2/wall3, screen) and a live chart. `?scene=<id>&mode=<m>` overrides it.
const OPENING_SCENE = Object.freeze({ id: 'dse-tunnel-rebuild', mode: '2d' });

function firstScene() {
    const q = new URLSearchParams(window.location.search);
    if (q.get('scene')) { return { id: q.get('scene'), mode: q.get('mode') || undefined }; }
    return { id: OPENING_SCENE.id, mode: OPENING_SCENE.mode };
}

const ready = (async function main() {
    buildPicker();
    wireUi();
    renderStatus();
    await settleHost();
    el.imagineText.disabled = false;   // standalone too: an outline there is refused loudly, naming the shell's door
    return loadScene(firstScene());
})();
ready.catch(function (err) { showError(err); console.error('[maxi-lab] boot failed:', err); });

window.MaxiLab = Object.freeze({
    hands: HANDS,
    state: state,
    ready: ready,
    sdkVersion: SDK_VERSION,
    exhibits: function () { return EXHIBITS.map(function (e) { return { id: e.id, mode: e.mode, title: e.title }; }); },
    rungs: function () { return WALKTHROUGH.map(function (r) { return { id: r.id, title: r.title, group: walkthroughGroup(r) }; }); },
    loadScene: loadScene, sceneSource: sceneSource, openSketch: openSketch, restart: restart, inventory: inventory,
    hand: function () { return state.hand; }, setHand: setHand,
    recorder: function () { return state.recorder; }, toggleRecord: toggleRecord,
    ask: ASK,
    thread: function () { return state.thread ? { id: state.thread.id, turns: state.thread.turns } : null; },
    imagine: imagine,
    loop: function () { return state.loop ? { running: state.loop.running, designer: state.loop.designerId, last: state.loop.last() } : null; },
    clips: function () { return state.clips.slice(); }
});
