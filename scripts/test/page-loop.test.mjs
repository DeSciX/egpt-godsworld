/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * page-loop.test.mjs — the three-role loop the lab page runs itself (site/app-assets/maxi-loop.js), driven by
 * the REAL roles module (maxi-roles.js), the REAL hands table (maxi-hands.js) over the shared fake runner
 * and a fake FrqtlVision, and the replay double of the shell's command door (replay-door.mjs) answering
 * from scripts/test/fixtures/three-roles-mirror.json (authored answers in the measured body shape).
 *
 * Gates, each with its negative control:
 *   1. the mirror loop runs click-free: plan → loadScene → openSketch → dragTo (the mirror MOVES) → done →
 *      Owl revise → the Builder again → done → Owl approve; the conversation carries no code;
 *   2. interaction ids stay per role: one Designer thread, one Builder thread per imagine, a fresh Owl
 *      thread per verdict, no id crosses roles;
 *   3. the Owl receives the outline, the prediction and the final clip ONLY — never the plan, never the
 *      Designer's knowledge bases (ROLES.owl.knowledgebase_names; PROD showed [] retrieves the memories);
 *   4. a malformed Builder answer stops the loop loudly (the Owl is never asked);
 *   5. revise re-enters the Builder with the Owl's reasons; max rounds stops loudly;
 *   6. a clip outside 5–10 s: the hand's refusal goes back to the Builder; a held clip outside the band
 *      stops the loop; a `done` with no clip stops the loop.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as roles from '../../site/app-assets/maxi-roles.js';
import { HANDS, inventoryOf } from '../../site/app-assets/maxi-hands.js';
import { createLoop, LOOP_LIMITS, threadBrain, labBody } from '../../site/app-assets/maxi-loop.js';
import { fakeRunner, sdkCameraControl } from './fake-runner.mjs';
import { replayDoor } from './replay-door.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'three-roles-mirror.json'), 'utf8'));
const KBS = { designer: roles.ROLES.designer.knowledgebase_names, builder: roles.ROLES.builder.knowledgebase_names, owl: roles.ROLES.owl.knowledgebase_names };
const PREFACES = { designer: roles.ROLES.designer.preface, builder: roles.ROLES.builder.preface, owl: roles.ROLES.owl.preface };
const B64 = Buffer.from('fake mp4 bytes, ftyp isom').toString('base64');

/** A FrqtlVision stand-in: drives the runner's tick listeners for the recording's span, returns that many frames. */
function fakeVision(runner, framesOverride) {
    return {
        attach: () => ({
            record: async (opts) => {
                const span = opts.stopAt.ticks;
                for (let t = 1; t <= span; t++) { runner.__listeners.slice().forEach((fn) => fn()); }
                const n = framesOverride || Math.min(Math.floor(span / opts.everyTicks) + 1, opts.maxFrames || Infinity);
                const frames = []; for (let i = 0; i < n; i++) { frames.push({ tick: 10 + i * opts.everyTicks }); }
                return { track: { frames }, encoded: { mime: 'video/mp4', codec: 'avc1.42001f', muxer: 'mediabunny', bytes: B64 }, truncated: false };
            }
        })
    };
}

/** The lab the hands run against: the mirror scene on the fake runner. loadScene / openSketch are logged. */
function mirrorLab(opts) {
    const mirror = { name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, w: 20, h: 240 } };
    const runner = fakeRunner([mirror], { isRunning: true, __listeners: [] });
    runner.addTickListener = (fn) => { runner.__listeners.push(fn); return () => { runner.__listeners = runner.__listeners.filter((f) => f !== fn); }; };
    const sc = { label: 'mirror', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', runner, recipeContext: { world: { w: 600, h: 400 } }, tick: () => 10, win: { FrqtlVision: fakeVision(runner, opts && opts.frames) } };
    const booted = [];
    const lab = {
        state: { grab: null },
        scene: () => sc,
        loadScene: async (a) => { booted.push({ hand: 'loadScene', id: a.id }); return { scene: 'mirror', id: a.id, tick: 0, objects: ['mirror'] }; },
        openSketch: async (a) => { booted.push({ hand: 'openSketch', bytes: a.source.length }); return { scene: 'sketch (Maxi)', tick: 0, objects: ['mirror'] }; },
        inventory: () => inventoryOf(sc),
        ask: async () => { throw new Error('the loop must never reach the lab\'s own question door'); }
    };
    return { lab, runner, mirror, booted };
}

function run(fixture, opts) {
    const door = replayDoor(fixture, PREFACES);
    const m = mirrorLab(opts);
    const events = [];
    const loop = createLoop({ roles, brain: threadBrain({ call: door.call, roles }), body: labBody({ hands: (opts && opts.hands) || HANDS, lab: m.lab }), onEvent: (e) => events.push(e), limits: opts && opts.limits });
    return Object.assign({ loop, events, sent: door.sent }, m);
}

const of = (sent, role) => sent.filter((s) => s.role === role).map((s) => s.params);
const ans = (role, n, response) => ({ status: 'OK', response, interaction_id: 'replay.' + role + '.' + n, usage: { media_tokens: 0 } });
const fence = (tag, obj) => '```' + tag + '\n' + JSON.stringify(obj) + '\n```';
const SEEN = { contact: 'the mirror, its middle third', after: 'up and to the left', passes: 'no' };

/** The Owl's params see nothing but the outline, the prediction and the clip. */
export function assertOwlBlind(params, plan, outline) {
    const text = JSON.stringify(params);
    assert.deepEqual(params.knowledgebase_names, KBS.owl.slice(), 'the Owl asks with its own KB list');
    assert.ok(!params.knowledgebase_names.some((k) => KBS.designer.includes(k)), 'the Owl asks with no knowledge base of the Designer\'s memories');
    assert.ok(params.user_input.includes(outline), 'the Owl is given the outline');
    for (const piece of [plan.changes[0].why, plan.prediction, JSON.stringify(plan)]) {
        assert.ok(!text.includes(piece), 'the Owl was shown the plan: ' + piece.slice(0, 60));
    }
    assert.equal(params.media.length, 1, 'the Owl gets the one final clip');
    assert.equal(params.media[0].mime_type, 'video/mp4');
}

/** No code reaches the conversation: no fence, no JSON object, no hand call. */
export function assertWordsOnly(events) {
    for (const e of events) {
        const texts = [e.words].concat(e.seen ? Object.values(e.seen) : []).filter((t) => typeof t === 'string');
        for (const t of texts) { assert.ok(!/```|json:call|\{\s*"/.test(t), e.role + ' ' + e.kind + ' shows code: ' + t.slice(0, 80)); }
    }
}

test('the mirror loop runs click-free, three roles, the drag executed; the conversation is words only (negative controls: a planted fence, a seeing Owl)', async () => {
    const r = run(FIXTURE);
    const out = await r.loop.imagine(FIXTURE.outline);
    assert.equal(out.verdict, 'approve');
    assert.equal(out.rounds, 2);
    assert.deepEqual(r.booted.map((b) => b.hand), ['loadScene', 'openSketch'], 'the Builder\'s calls ran in order, with no Run click');
    const moves = r.runner.calls.update.filter((u) => u.name === 'mirror');
    assert.ok(moves.length >= 300, 'both drags wrote the mirror tick by tick (' + moves.length + ' writes)');
    assert.deepEqual(r.runner.centerOf(r.mirror).slice(0, 2), [370, 200], 'the second drag left the mirror centred on the beam line');
    assert.ok(moves.some((u) => u.tuple[1] === 140), 'the first drag reached centre y 260 (rect top 140)');

    // the conversation
    const kinds = r.events.filter((e) => e.kind !== 'asking').map((e) => e.role + ':' + e.kind);
    assert.deepEqual(kinds, ['tony:said', 'designer:plan', 'builder:working', 'builder:working', 'builder:working', 'builder:built', 'owl:revise',
        'builder:working', 'builder:built', 'owl:approve']);
    const built = r.events.filter((e) => e.kind === 'built');
    assert.ok(built.every((e) => e.clip && e.clip.media.mime_type === 'video/mp4' && e.clip.seconds >= 5 && e.clip.seconds <= 10), 'every built clip is 5–10 s video');
    assertWordsOnly(r.events);
    assert.throws(() => assertWordsOnly(r.events.concat([{ role: 'builder', kind: 'working', words: 'ok\n```json:call:see\n{}\n```' }])), /shows code/);

    // the Owl accounts for the footage before it judges: its `seen` reaches the conversation, key by key (the roles module's SEEN_ACCOUNT)
    const owlEvents = r.events.filter((e) => e.role === 'owl' && e.kind !== 'asking');
    assert.ok(owlEvents.length === 2 && owlEvents.every((e) => Object.keys(roles.SEEN_ACCOUNT).every((k) => typeof e.seen[k] === 'string' && e.seen[k].trim())), 'every Owl event carries its seen account');
    assert.equal(owlEvents[0].seen.contact, 'the mirror, its top third');
    assert.throws(() => assertWordsOnly([{ role: 'owl', kind: 'approve', words: 'ok', seen: { contact: '{"part":"mirror"}' } }]), /owl approve shows code/);

    // the Owl
    const plan = roles.parsePlan(FIXTURE.designer[0].response, roles.stageOf(r.lab.inventory())).plan;
    const owl = of(r.sent, 'owl');
    assert.equal(owl.length, 2);
    owl.forEach((p) => assertOwlBlind(p, plan, FIXTURE.outline));
    assert.ok(owl[1].user_input.includes('the mirror slides back up to centre'), 'the Owl is given the prediction of the clip it watches');
    assert.throws(() => assertOwlBlind(Object.assign({}, owl[0], { user_input: owl[0].user_input + JSON.stringify(plan) }), plan, FIXTURE.outline), /shown the plan/);
    assert.throws(() => assertOwlBlind(Object.assign({}, owl[0], { knowledgebase_names: KBS.designer.slice() }), plan, FIXTURE.outline), /its own KB list/);
});

test('interaction ids stay per role: one Designer thread, one Builder thread per imagine, a fresh Owl thread per verdict (negative control: a crossed id is red)', async () => {
    const r = run(FIXTURE);
    await r.loop.imagine(FIXTURE.outline);
    const prev = (role) => of(r.sent, role).map((p) => p.previous_interaction_id);
    assert.deepEqual(prev('designer'), [undefined]);
    assert.deepEqual(prev('builder'), [undefined, 'replay.builder.1', 'replay.builder.2', 'replay.builder.3', 'replay.builder.4', 'replay.builder.5']);
    assert.deepEqual(prev('owl'), [undefined, undefined], 'every verdict on a fresh Owl thread');
    const crossed = (sent) => sent.some((s) => s.params.previous_interaction_id && s.params.previous_interaction_id.indexOf('replay.' + s.role + '.') !== 0);
    assert.equal(crossed(r.sent), false);
    assert.equal(crossed(r.sent.concat([{ role: 'owl', params: { previous_interaction_id: 'replay.builder.3' } }])), true);
    // KBs per role on every question
    r.sent.forEach((s) => assert.deepEqual(s.params.knowledgebase_names, KBS[s.role].slice()));
    // footage rides on the Builder's NEXT turn only after a footage hand; the media-less turns carry no media key
    const b = of(r.sent, 'builder');
    assert.deepEqual(b.map((p) => (p.media ? p.media.length : 0)), [0, 0, 0, 1, 0, 1], 'the clip of each dragTo rides on the turn after it');
    assert.ok(b[3].user_input.includes('RESULT OF `dragTo`') && b[3].user_input.includes('attached as video'));
    assert.ok(b[4].user_input.startsWith('THE OWL SENT IT BACK (revise)') && b[4].user_input.includes('centre the mirror on the beam line at y 200'), 'revise re-enters the Builder with the Owl\'s reasons');

    // a second imagine: the Designer remembers (its thread continues), the Builder starts fresh
    const two = Object.assign({}, FIXTURE, {
        designer: FIXTURE.designer.concat([Object.assign({}, FIXTURE.designer[0], { interaction_id: 'replay.designer.2' })]),
        builder: FIXTURE.builder.concat(FIXTURE.builder.slice(2, 4).map((x, i) => Object.assign({}, x, { interaction_id: 'replay.builder.' + (7 + i) }))),
        owl: FIXTURE.owl.concat([FIXTURE.owl[1]])
    });
    two.builder[6] = ans('builder', 7, 'Again.\nPREDICTION: the mirror slides down.\n\n' + fence('json:call:dragTo', { name: 'mirror', to: [370, 260], ticks: 150, settle: 150 }));
    const r2 = run(two);
    await r2.loop.imagine(FIXTURE.outline);
    await r2.loop.imagine('the same mirror, once more');
    assert.deepEqual(of(r2.sent, 'designer').map((p) => p.previous_interaction_id), [undefined, 'replay.designer.1'], 'the Designer\'s thread continues across outlines');
    assert.ok(!of(r2.sent, 'designer')[1].user_input.includes('the Designer'), 'the preface rides only on the Designer thread\'s first turn');
    assert.equal(of(r2.sent, 'builder')[6].previous_interaction_id, undefined, 'a new imagine starts a new Builder thread');
});

test('a malformed Builder answer stops the loop loudly; the Owl is never asked (negative control: the well-formed answer passes)', async () => {
    const bad = Object.assign({}, FIXTURE, { builder: [ans('builder', 1, 'I will load the mirror scene now, json:call:loadScene {"id":"cl1a-mirror"}')].concat(FIXTURE.builder.slice(1)) });
    const r = run(bad);
    await assert.rejects(r.loop.imagine(FIXTURE.outline), /^Error: Maxi stopped: the Builder's answer is malformed, so the loop stopped: \[builder → hand-off\]: expected exactly ONE json:call:<hand> or json:done block, found 0/);
    assert.equal(of(r.sent, 'owl').length, 0);
    assert.deepEqual(r.booted, [], 'nothing ran');
    const stop = r.events[r.events.length - 1];
    assert.deepEqual([stop.role, stop.kind], ['loop', 'stopped']);
    assert.equal(r.loop.running, false);
    // a malformed Designer plan and a malformed verdict stop it too
    const r2 = run(Object.assign({}, FIXTURE, { designer: [ans('designer', 1, 'Let us build a mirror.')] }));
    await assert.rejects(r2.loop.imagine(FIXTURE.outline), /Maxi stopped: \[designer → plan\]/);
    const r3 = run(Object.assign({}, FIXTURE, { owl: [ans('owl', 1, 'Looks fine to me.')] }));
    await assert.rejects(r3.loop.imagine(FIXTURE.outline), /Maxi stopped: \[owl → verdict\]/);
});

test('max rounds: a third revise stops the loop at its limit (negative control: an approve inside the limit returns)', async () => {
    assert.equal(LOOP_LIMITS.rounds, 3);
    const see = (n) => ans('builder', n, 'Filming.\nPREDICTION: the beam reflects.\n\n' + fence('json:call:see', {}));
    const done = (n) => ans('builder', n, 'Done.\n\n' + fence('json:done', {}));
    const revise = (n) => ans('owl', n, 'No.\n\n' + fence('json:verdict', { seen: SEEN, verdict: 'revise', reasons: ['round ' + n + ' is not it'], change: 'try again' }));
    const fx = Object.assign({}, FIXTURE, { builder: [see(1), done(2), see(3), done(4), see(5), done(6)], owl: [revise(1), revise(2), revise(3)] });
    const r = run(fx);
    await assert.rejects(r.loop.imagine(FIXTURE.outline), /the Owl sent it back 3 times \(max rounds\) — last reasons: round 3 is not it/);
    assert.equal(of(r.sent, 'owl').length, 3);
    assert.ok(of(r.sent, 'builder')[2].user_input.includes('round 1 is not it') && of(r.sent, 'builder')[4].user_input.includes('round 2 is not it'));
    const ok = run(Object.assign({}, fx, { owl: [revise(1), ans('owl', 2, 'Yes.\n\n' + fence('json:verdict', { seen: SEEN, verdict: 'approve', reasons: ['it reflects'] }))] }));
    assert.equal((await ok.loop.imagine(FIXTURE.outline)).rounds, 2);
});

test('a clip outside 5–10 s: the hand refuses back to the Builder; a held clip outside the band stops the loop; done without a clip stops it (negative control: the 5.1 s default passes)', async () => {
    // (a) the hand's own refusal goes back to the Builder verbatim, with no media
    const short = ans('builder', 1, 'Quick look.\nPREDICTION: a short clip.\n\n' + fence('json:call:see', { stopAt: { ticks: 20 } }));
    const fxA = Object.assign({}, FIXTURE, { builder: [short, ans('builder', 2, 'Proper length.\nPREDICTION: the beam reflects.\n\n' + fence('json:call:see', {})), ans('builder', 3, 'Done.\n\n' + fence('json:done', {}))], owl: [FIXTURE.owl[1]] });
    const a = run(fxA);
    assert.equal((await a.loop.imagine(FIXTURE.outline)).verdict, 'approve', 'the 5.1 s default passes');
    const b = of(a.sent, 'builder');
    assert.ok(b[1].user_input.includes('YOUR HAND `see` WAS REFUSED') && b[1].user_input.includes('outside the 5–10 s'), 'the refusal reaches the Builder');
    assert.equal(b[1].media, undefined, 'a refused hand hands no footage');

    // (b) a hand that holds a clip outside the band (the loop's own check) stops the loop
    const hands = Object.assign({}, HANDS, {
        see: Object.assign({}, HANDS.see, {
            run: async (lab) => {
                const got = await lab.ask('see', { note: 'n', media: [{ mime_type: 'video/mp4', data: B64, label: 'SEE' }] });
                return Object.assign({ mime: 'video/mp4', frames: 30, fps: 10, seconds: 3 }, got);
            }
        })
    });
    const fxB = Object.assign({}, FIXTURE, { builder: [ans('builder', 1, 'Look.\nPREDICTION: x.\n\n' + fence('json:call:see', {}))] });
    const c = run(fxB, { hands });
    await assert.rejects(c.loop.imagine(FIXTURE.outline), /Maxi stopped: see: the clip handed to the loop lasts 3 s, outside the 5–10 s/);
    assert.equal(of(c.sent, 'owl').length, 0);
    assert.equal(of(c.sent, 'builder').length, 1, 'the short clip was never handed on');

    // (c) done before any clip
    const fxC = Object.assign({}, FIXTURE, { builder: [ans('builder', 1, 'Read first.\nPREDICTION: one mirror.\n\n' + fence('json:call:inventory', {})), ans('builder', 2, 'Done.\n\n' + fence('json:done', {}))] });
    const d = run(fxC);
    await assert.rejects(d.loop.imagine(FIXTURE.outline), /the Builder said json:done before filming any clip/);
    assert.equal(of(d.sent, 'owl').length, 0);
});

test('createLoop refuses an Owl that shares the Designer\'s memories, and a roles module that lacks a turn (negative controls)', () => {
    const base = { brain: threadBrain({ call: async () => ({}), roles }), body: labBody({ hands: HANDS, lab: mirrorLab().lab }), onEvent: () => {} };
    assert.ok(createLoop(Object.assign({ roles }, base)));
    const seeing = Object.assign({}, roles, { ROLES: Object.assign({}, roles.ROLES, { owl: Object.assign({}, roles.ROLES.owl, { knowledgebase_names: KBS.designer.slice() }) }) });
    assert.throws(() => createLoop(Object.assign({ roles: seeing }, base)), /the Owl's knowledge bases \[GodsWorld\] share one with the Designer's/);
    const lacking = Object.assign({}, roles, { parseVerdict: undefined });
    assert.throws(() => createLoop(Object.assign({ roles: lacking }, base)), /exports no parseVerdict\(\)/);
});

test('the reply after a filmed clip must say what the clip shows; a revise needs a new clip (negative control: the described clip passes)', async () => {
    const see = (n) => ans('builder', n, 'Filming.\nPREDICTION: the beam reflects.\n\n' + fence('json:call:see', {}));
    const silentDone = ans('builder', 2, fence('json:done', {}));
    const r = run(Object.assign({}, FIXTURE, { builder: [see(1), silentDone], owl: [FIXTURE.owl[1]] }));
    await assert.rejects(r.loop.imagine(FIXTURE.outline), /the Builder did not say what its clip shows before its next block/);
    assert.equal(of(r.sent, 'owl').length, 0, 'an undescribed clip never reaches the Owl');
    const ok = run(Object.assign({}, FIXTURE, { builder: [see(1), ans('builder', 2, 'The beam turns up and to the left.\n\n' + fence('json:done', {}))], owl: [FIXTURE.owl[1]] }));
    const out = await ok.loop.imagine(FIXTURE.outline);
    assert.equal(out.builderWords, 'The beam turns up and to the left.', 'the Builder\'s words on its clip are kept with it');
    // a revise needs a NEW clip: done straight after the revise stops
    const revise = ans('owl', 1, 'No.\n\n' + fence('json:verdict', { seen: SEEN, verdict: 'revise', reasons: ['not it'], change: 'again' }));
    const again = run(Object.assign({}, FIXTURE, { builder: [see(1), ans('builder', 2, 'Up-left.\n\n' + fence('json:done', {})), ans('builder', 3, 'Same clip.\n\n' + fence('json:done', {}))], owl: [revise] }));
    await assert.rejects(again.loop.imagine(FIXTURE.outline), /the Builder said json:done before filming any clip/);
});

test('createLoop checks every role in maxi-roles.js ROLE_ORDER, the one list (negative controls: a role added to ROLE_ORDER without its entry is refused by name; no hand-typed role list in the loop)', () => {
    const base = { brain: threadBrain({ call: async () => ({}), roles }), body: labBody({ hands: HANDS, lab: mirrorLab().lab }), onEvent: () => {} };
    assert.deepEqual(roles.ROLE_ORDER, ['designer', 'builder', 'owl']);
    const grown = Object.assign({}, roles, { ROLE_ORDER: Object.freeze(roles.ROLE_ORDER.concat(['critic'])) });
    assert.throws(() => createLoop(Object.assign({ roles: grown }, base)), /ROLES\.critic must carry \{name, knowledgebase_names\[\]\}/);
    assert.throws(() => createLoop(Object.assign({ roles: Object.assign({}, roles, { ROLE_ORDER: undefined }) }, base)), /exports no ROLE_ORDER/);
    const src = fs.readFileSync(path.join(HERE, '..', '..', 'site', 'app-assets', 'maxi-loop.js'), 'utf8');
    assert.ok(!/\[\s*'designer'\s*,\s*'builder'\s*,\s*'owl'\s*\]/.test(src), 'maxi-loop.js hand-types the role list beside ROLE_ORDER');
});

test('a hand output the body cannot read stops the loop naming the hand — it is never handed to the Builder as a refusal (negative control: a hand\'s own throw still goes back to the Builder)', async () => {
    const hands = Object.assign({}, HANDS, { say: Object.assign({}, HANDS.say, { run: async () => undefined }) });
    const fx = Object.assign({}, FIXTURE, { builder: [ans('builder', 1, 'Say first.\nPREDICTION: the words show.\n\n' + fence('json:call:say', { text: 'x' }))] });
    const r = run(fx, { hands });
    await assert.rejects(r.loop.imagine(FIXTURE.outline), /^Error: Maxi stopped: the body could not read the say hand's output \(.+\) — the hand returned undefined; a body bug, so the loop stopped\.$/);
    assert.equal(of(r.sent, 'builder').length, 1, 'the unreadable output reached the Builder');
    assert.equal(r.events.filter((e) => e.role === 'loop' && e.kind === 'stopped').length, 1);
    // the hand's own refusal is still the Builder's to read
    const refusing = Object.assign({}, HANDS, { say: Object.assign({}, HANDS.say, { run: async () => { throw new Error('say: the lab has no line to show it on.'); } }) });
    const fx2 = Object.assign({}, FIXTURE, { builder: [ans('builder', 1, 'Say first.\nPREDICTION: the words show.\n\n' + fence('json:call:say', { text: 'x' })), ans('builder', 2, 'Done.\n\n' + fence('json:done', {}))] });
    const ok = run(fx2, { hands: refusing });
    await assert.rejects(ok.loop.imagine(FIXTURE.outline), /json:done before filming any clip/);
    assert.ok(of(ok.sent, 'builder')[1].user_input.includes('say: the lab has no line to show it on.'), 'the hand\'s own refusal goes back to the Builder verbatim');
});

// ── a named scene and a 3D world: the stage, the load, the 3D drag ─────────────────────────────

const FIXTURE_3D = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'three-roles-mirror-3d.json'), 'utf8'));

/** A lab on a 2D stage whose loadScene swaps in the 3D mirror (a 600 x 400 x 600 world, the slab z −80..+80). */
function switchingLab() {
    function sceneOf(spec) {
        const runner = fakeRunner(spec.objects, { isRunning: true, __listeners: [], cameraControl: spec.camera ? sdkCameraControl(spec.camera, spec.world.w, spec.world.h) : null });
        runner.addTickListener = (fn) => { runner.__listeners.push(fn); return () => { runner.__listeners = runner.__listeners.filter((f) => f !== fn); }; };
        return { label: spec.label, id: spec.id, mode: spec.mode, modes: spec.modes, renderer: spec.renderer, runner, recipeContext: { world: spec.world }, tick: () => 10, win: { FrqtlVision: fakeVision(runner) } };
    }
    const TUNNEL = { label: 'Double Slit (Tunnel, symmetric)', id: 'dse-tunnel-rebuild', mode: '2d', modes: ['3d', '2d'], renderer: 'p5', world: { w: 600, h: 400 },
        objects: [{ name: 'screen', _schemaKind: 'GraphingDetectorWall', rect: { left: 315, top: 0, w: 20, h: 400 } }] };
    const MIRROR_3D = { label: '1A · Mirror (3D)', id: 'cl1a-mirror-3d', mode: null, modes: [], renderer: 'three', world: { w: 600, h: 400, d: 600 }, camera: { azimuth: 45, elevation: 45, distance: 900 },
        objects: [{ name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } }] };
    let sc = sceneOf(TUNNEL);
    const booted = [];
    const lab = {
        state: { grab: null },
        scene: () => sc,
        loadScene: async (a) => {
            booted.push({ hand: 'loadScene', id: a.id, mode: a.mode });
            if (a.id !== 'cl1a-mirror-3d') { throw new Error('loadScene: the fake lab knows only cl1a-mirror-3d, got ' + a.id); }
            sc = sceneOf(MIRROR_3D);
            return { scene: sc.label, id: sc.id, mode: sc.mode, modes: sc.modes, renderer: sc.renderer, dimensions: 3, canvas: [600, 400, 600], tick: 0, objects: ['mirror'] };
        },
        openSketch: async () => { throw new Error('the 3D fixture boots no sketch'); },
        inventory: () => inventoryOf(sc),
        ask: async () => { throw new Error('the loop must never reach the lab\'s own question door'); }
    };
    return { lab, booted, scene: () => sc };
}

test('an outline that names the 3D mirror: the Designer sees the 2D stage, the plan loads the 3D scene, the Builder drags in depth, the Owl never sees the stage (negative control: the same plan without loadScene stops before the Builder)', async () => {
    const door = replayDoor(FIXTURE_3D, PREFACES);
    const m = switchingLab();
    const events = [];
    const loop = createLoop({ roles, brain: threadBrain({ call: door.call, roles }), body: labBody({ hands: HANDS, lab: m.lab }), onEvent: (e) => events.push(e) });
    const stage2d = roles.stageOf(m.lab.inventory());
    const out = await loop.imagine(FIXTURE_3D.outline);
    assert.equal(out.verdict, 'approve');
    assert.deepEqual(out.plan, { scene: 'cl1a-mirror-3d', registryMode: null, changes: [], hands: ['loadScene', 'dragTo'], prediction: out.plan.prediction });
    const d = of(door.sent, 'designer')[0].user_input;
    assert.ok(d.includes(roles.stageWords(stage2d)) && /scene id dse-tunnel-rebuild, registry modes declared: 3d, 2d \(loaded: 2d\); 2D \(x, y\): a world 600 x 400/.test(d), 'the Designer is shown the 2D stage');
    const b = of(door.sent, 'builder');
    assert.ok(b[0].user_input.includes(roles.stageWords(stage2d)) && b[0].user_input.includes('The plan\'s scene is not on the stage: your first hand loads it — loadScene {"id":"cl1a-mirror-3d"} (or openSketch'), 'the Builder is told to load the plan\'s scene first');
    assert.deepEqual(m.booted, [{ hand: 'loadScene', id: 'cl1a-mirror-3d', mode: undefined }], 'the Builder\'s loadScene ran, click-free');
    const mirror = m.scene().runner.getObjectByName('mirror');
    assert.deepEqual(m.scene().runner.centerOf(mirror), [370, 200, 120], 'the 3D drag moved the slab in depth');
    assert.deepEqual(m.lab.inventory().objects[0].rect, [360, 80, 40, 20, 240, 160], 'the rect is 3D: z −80 → 40, depth kept');
    const drag = events.find((e) => e.role === 'builder' && e.kind === 'working' && e.hand === 'dragTo');
    assert.ok(drag.ok && drag.result.zHeld === false && drag.clip && drag.clip.seconds === 6.1, 'the drag filmed a 6.1 s clip and z was not held');
    assert.deepEqual(drag.result.to.center, [370, 200, 120]);
    const owl = of(door.sent, 'owl');
    assert.equal(owl.length, 1);
    assert.ok(!/THE STAGE|cl1a-mirror-3d|dse-tunnel-rebuild|3D \(x, y, z\)|registry modes|toward the viewer is|azimuth|spans [xyz] /.test(owl[0].user_input), 'the Owl is never shown the stage, the camera, the viewer axis, the extents or the plan');
    // after the load, the stage is the 3D mirror and SAYS so — read from the booted world, not planned
    assert.match(roles.stageWords(roles.stageOf(m.lab.inventory())), /scene id cl1a-mirror-3d, no registry modes declared \(loadScene takes its id only\); 3D \(x, y, z\): a world 600 x 400 x 600 with depth/);
    // …and which way is toward the viewer, off the booted camera (az 45 el 45 → +z), with the dragged slab's span
    assert.match(roles.stageWords(roles.stageOf(m.lab.inventory())), /the camera looks from azimuth 45°, elevation 45°; toward the viewer is \+z, away is -z .*mirror \(Wall\): spans x 360\.\.380, y 80\.\.320, z 40\.\.200; centre \[370, 200, 120\]/);
    assertWordsOnly(events);

    // negative control: the plan for a scene that is not on the stage, with no loading hand, stops the loop before the Builder
    const noLoad = JSON.parse(JSON.stringify(FIXTURE_3D));
    noLoad.designer[0].response = noLoad.designer[0].response.replace('"loadScene",\n    ', '');
    assert.ok(!/"loadScene"/.test(noLoad.designer[0].response), 'the planted plan lost its loadScene');
    const door2 = replayDoor(noLoad, PREFACES);
    const m2 = switchingLab();
    const loop2 = createLoop({ roles, brain: threadBrain({ call: door2.call, roles }), body: labBody({ hands: HANDS, lab: m2.lab }), onEvent: () => {} });
    await assert.rejects(loop2.imagine(FIXTURE_3D.outline), /^Error: Maxi stopped: \[designer → plan\]: the plan is for "cl1a-mirror-3d", which is not on the stage \("dse-tunnel-rebuild" mode "2d"\), and its hands \[dragTo\] never load it/);
    assert.equal(of(door2.sent, 'builder').length, 0, 'the Builder is never asked to build on the wrong stage');
    assert.deepEqual(m2.booted, []);

    // negative control (run-3d-platform mm3d2): the same plan in the OLD shape — a planned "mode": "3d" — stops by name before the Builder
    const stale = JSON.parse(JSON.stringify(FIXTURE_3D));
    stale.designer[0].response = stale.designer[0].response.replace('"registryMode": null', '"mode": "3d"');
    assert.ok(/"mode": "3d"/.test(stale.designer[0].response), 'the planted plan carries the stale mode');
    const door3 = replayDoor(stale, PREFACES);
    const m3 = switchingLab();
    const loop3 = createLoop({ roles, brain: threadBrain({ call: door3.call, roles }), body: labBody({ hands: HANDS, lab: m3.lab }), onEvent: () => {} });
    await assert.rejects(loop3.imagine(FIXTURE_3D.outline), /^Error: Maxi stopped: \[designer → plan\]: the plan is refused — `mode` is not a plan field: a plan names a scene id, and 2D or 3D is a fact of the loaded scene/);
    assert.equal(of(door3.sent, 'builder').length, 0, 'a stale plan never reaches the Builder');
    assert.deepEqual(m3.booted, []);
});

test('the stage the loop reads is the body\'s inventory: a refused inventory is an empty stage in words; a malformed one stops the loop as a body bug', async () => {
    const door = replayDoor(FIXTURE_3D, PREFACES);
    const m = switchingLab();
    const refusing = Object.assign({}, HANDS, { inventory: Object.assign({}, HANDS.inventory, { run: () => { throw new Error('inventory: no scene is loaded — loadScene{id} or openSketch{source} first.'); } }) });
    const loop = createLoop({ roles, brain: threadBrain({ call: door.call, roles }), body: labBody({ hands: refusing, lab: m.lab }), onEvent: () => {} });
    await loop.imagine(FIXTURE_3D.outline);
    assert.ok(of(door.sent, 'designer')[0].user_input.includes('THE STAGE: no scene is loaded in the lab (the lab says: inventory: no scene is loaded — loadScene{id} or openSketch{source} first.).'));
    const bad = Object.assign({}, HANDS, { inventory: Object.assign({}, HANDS.inventory, { run: () => ({ objects: [] }) }) });
    const loop2 = createLoop({ roles, brain: threadBrain({ call: replayDoor(FIXTURE_3D, PREFACES).call, roles }), body: labBody({ hands: bad, lab: switchingLab().lab }), onEvent: () => {} });
    await assert.rejects(loop2.imagine(FIXTURE_3D.outline), /^Error: Maxi stopped: the body's inventory is not a stage \(\[roles\] the stage is the inventory hand's result, and it lacks tick, scene, id, mode, modes, renderer, dimensions, canvas, camera/);
});
