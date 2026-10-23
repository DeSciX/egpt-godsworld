/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * roles.test.mjs — the three roles' owner (site/app-assets/maxi-roles.js) and the generated plugin agents.
 *
 * Gates:
 *   1. a well-formed hand-off parses for each role; every malformed one THROWS naming what is wrong
 *      (no block, two blocks, loose JSON, a hand not in HANDS, a call without PREDICTION, a verdict
 *      outside approve|revise, a revise without its change, a done with a body);
 *   2. hand names are HANDS' keys: the parser accepts every key and refuses a name that is not one;
 *   3. each role's turn carries only what that role may see (the Owl: outline + prediction, nothing
 *      of the plan; the Builder: no clip path or bytes in the text; the Designer: the outline);
 *   4. THE STAGE: stageOf reads the inventory by INVENTORY_KEYS (a missing key is red); the Designer and the
 *      Builder's first turn carry it in words; a plan for a scene not on the stage must name a loading hand
 *      (negative controls: the same plan on the stage passes; with loadScene it passes);
 *   5. plugin/agents/maxi-<role>.md equal the generator's output, carry the persona verbatim, and a
 *      one-character drift is red; each agent's tools are exactly what its own HOW THIS AGENT RUNS text asks
 *      (TOOL_NEEDS: every role writes its answer file, the Owl gets no Bash and no kb/ search; a missing or an
 *      extra tool is red);
 *   6. THE WORLD FRAME (maxi-roles.js WORLD_FRAME) is one owner: the persona carries it once, as the generated
 *      section between WORLD_FRAME_MARKERS (current with renderWorldFrameMarkdown; a hand-typed copy or a
 *      changed constant is red), so the Designer's and the Builder's agents carry it once through the embedded
 *      persona and their first turns never; the Owl's first turn carries it once, its agent never; the skill
 *      once; no other tracked file types a copy;
 *   8. THE P1 PARADIGM (the sketch's `export const parts` block is the one region a hand rewrites): the Designer's
 *      preface names setDeclared {name, patch} for a parameter, a move for a placement, openSketch (closing the
 *      Record) for a re-authoring, code-declared parts as untouchable and a rename as a new key or a fork, and no
 *      longer says sceneSource-then-openSketch; the Builder's prefers setDeclared, films every change, and answers a
 *      refusal in words naming the part and key; every hand either preface names is a HANDS key; a refused hand's
 *      turn asks for those words and claims nothing moved of its own (planted prefaces and a planted turn are red);
 *   9. THE LAST CLIP (maxi-roles.js LAST_CLIP, LAST_CLIP_RULE): the Owl judges a round's last clip only, so the Designer's
 *      and the Builder's prefaces carry the rule's words once each (a preface without them is red), and parsePlan refuses
 *      hands that close with `see` straight after `dragTo` (negative controls: see-only, see after setDeclared or
 *      setCamera, and a plan ending on dragTo pass);
 *   7. LOOK, NOT ASK: the rule's words live in the persona's BUILDING FROM AN OUTLINE once; the Designer's preface
 *      points at it by maxi-roles.js LOOK_RULE and restates none of it;
 *  10. THE CLOSING TURN: toldTurn carries the outline, the prediction, the check's account (SEEN_ACCOUNT order) and reasons,
 *      the Brief figure and the LOOK FIRST pointer, and no preface; parseTold returns the words cleaned as the Designer's
 *      answer is, counting a stray fence or reading line, and refuses a plan block, a hand and no words, each by name;
 *  11. THE OWL'S TWO QUESTIONS (maxi-roles.js OWL_QUESTIONS) open the Owl's preface in order, before the account, with the
 *      look-only clause; the part-by-part check is the means (planted prefaces without them are red);
 *  12. LOOK FIRST: the persona section stands once, right after IMAGINING VERSUS TALKING, with its key sentences; the talk
 *      section routes such a message to it; the Designer preface and the closing turn point at it by name and restate none
 *      of it; the generated Designer carries it (each key sentence deleted, the section deleted or moved, are red).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    ROLES, ROLE_ORDER, parsePlan, parseBuilderReply, parseVerdict, designerTurn, builderTurn, owlTurn, PARSERS, SEEN_ACCOUNT,
    stageOf, emptyStage, stageWords, extentWords, planOnStage, LOADING_HANDS, PLAN_REFUSED_KEYS, loadArgsOf, REFUSAL_ASK,
    parseDesignerReply, readingOf, READING_LINE, DESIGNER_READINGS, PLAN_KEYS, ANSWER_KEYS, TALK_RULE, HANDOFF_TAGS, LAST_CLIP, LAST_CLIP_RULE, briefWordLimit,
    toldTurn, parseTold, OWL_QUESTIONS, LOOK_FIRST, BRIEF_SECTION
} from '../../site/app-assets/maxi-roles.js';
import { HANDS, INVENTORY_KEYS, SKETCH_KEYS, inventoryOf } from '../../site/app-assets/maxi-hands.js';
import { fakeRunner, sdkCameraControl } from './fake-runner.mjs';
import { renderAll, agentPath, PERSONA, TOOL_NEEDS, toolsFor, renderBrief, BRIEF_MODULE } from '../gen-plugin-agents.mjs';
import { BRIEF_WORDS } from '../../site/app-assets/maxi-persona-brief.js';
import { SECTIONS, spliceBlock, renderPersona } from '../gen-hands-section.mjs';
import * as rolesModule from '../../site/app-assets/maxi-roles.js';
import { execFileSync } from 'node:child_process';
import './site-import-map.mjs';   // the vendored cl1a-mirror imports the package by specifier: resolve it as the page does
import { sceneFile } from '../frqtl-web-pin.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// cl1a-mirror's emitter, as the vendored scene declares it in its parts table (the one owner of its name and centre)
const { SphereEmitter } = await import('@descix/frqtl-web/parts');
const MIRROR_PARTS = (await import(pathToFileURL(path.join(REPO, sceneFile('scenes/mirror.js'))).href)).parts;
const EMITTERS = Object.keys(MIRROR_PARTS).filter((k) => MIRROR_PARTS[k][0] === SphereEmitter);
assert.equal(EMITTERS.length, 1, 'cl1a-mirror declares ' + EMITTERS.length + ' SphereEmitter parts, the fixture needs one: ' + JSON.stringify(Object.keys(MIRROR_PARTS)));
const EMITTER = EMITTERS[0];
const EMITTER_AT = MIRROR_PARTS[EMITTER][1].center.slice(0, 2).concat([0]);
const reText = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fence = (tag, body) => '```' + tag + '\n' + body + '\n```';
const PLAN = { scene: 'cl1a-mirror', registryMode: null, changes: [{ object: 'mirror', param: 'orientationDeg', value: 30, why: 'the outline asks 30 degrees' }], hands: ['setDeclared', 'see'], prediction: 'the beam leaves the mirror at 60 degrees' };

/** An inventory as the hand returns it (maxi-hands.js inventoryOf). */
const INV_2D = { tick: 40, scene: '1A · Mirror', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', dimensions: 2, canvas: [600, 400], camera: null, viewer: null,
    objects: [{ name: EMITTER, kind: 'SphereEmitter', authority: 'center', center: EMITTER_AT }, { name: 'mirror', kind: 'Wall', authority: 'rect', center: [370, 200, 0], rect: [360, 80, 20, 240] }],
    parts: { [EMITTER]: ['SphereEmitter', { center: EMITTER_AT.slice(0, 2) }], mirror: ['Wall', { rect: [360, 80, 20, 240], orientationDeg: 45 }] } };
const INV_3D = { tick: 12, scene: '1A · Mirror (3D)', id: 'cl1a-mirror-3d', mode: null, modes: [], renderer: 'three', dimensions: 3, canvas: [600, 400, 600], camera: { azimuth: 45, elevation: 45, distance: 900, roll: 0, target: null }, viewer: { toward: '+z', away: '-z' },
    objects: [{ name: 'mirror', kind: 'Wall', authority: 'rect', center: [370, 200, 0], rect: [360, 80, -80, 20, 240, 160] }],
    parts: { mirror: ['Wall', { rect: [360, 80, -80, 20, 240, 160] }] } };
const STAGE = stageOf(INV_2D);

test('roles: three, in order, each with its own KB list, preface and parser', () => {
    assert.deepEqual(ROLE_ORDER, ['designer', 'builder', 'owl']);
    assert.deepEqual(ROLE_ORDER.map((r) => ROLES[r].metaphor), ['orchestrator', 'implementer', 'verifier']);
    assert.deepEqual([...ROLES.designer.knowledgebase_names], ['GodsWorld']);
    // measured on PROD 2026-10-14: [] and an absent list both retrieve GodsWorld; General retrieves nothing, carries no persona
    assert.deepEqual([...ROLES.owl.knowledgebase_names], ['General'], 'the Owl asks with General — never [], which retrieves the memories');
    assert.equal(ROLES.owl.persona, false);
    assert.ok(ROLES.builder.knowledgebase_names.includes('GodsWorld') && ROLES.builder.persona, 'the Builder needs the persona (its HANDS section), which rides with GodsWorld');
    for (const r of ROLE_ORDER) assert.equal(typeof PARSERS[r], 'function');
    assert.match(ROLES.designer.preface, /BUILDING FROM AN OUTLINE/, 'the Designer preface points at the persona procedure');
});

test('designer: a plan parses with its words for Tony; malformed plans throw', () => {
    const ok = parsePlan('Tony, I will start from the mirror.\n\n' + fence('json:plan', JSON.stringify(PLAN)), STAGE);
    assert.deepEqual(ok.plan, PLAN);
    assert.equal(ok.words, 'Tony, I will start from the mirror.');
    const noMode = Object.assign({}, PLAN); delete noMode.registryMode;
    assert.equal(parsePlan(fence('json:plan', JSON.stringify(noMode)), STAGE).plan.registryMode, null, 'an absent registryMode is null (the scene\'s default)');
    assert.throws(() => parsePlan('no block at all', STAGE), /exactly ONE json:plan block, found 0/);
    assert.throws(() => parsePlan(fence('json:plan', JSON.stringify(PLAN)) + fence('json:plan', JSON.stringify(PLAN)), STAGE), /found 2/);
    assert.throws(() => parsePlan(fence('json:plan', "{scene: 'x'}"), STAGE), /not strict JSON/);
    assert.throws(() => parsePlan(fence('json:plan', JSON.stringify(Object.assign({}, PLAN, { hands: ['teleport'] }))), STAGE), /names no such hand: teleport/);
    assert.throws(() => parsePlan(fence('json:plan', JSON.stringify(Object.assign({}, PLAN, { prediction: '' }))), STAGE), /`prediction`/);
    assert.throws(() => parsePlan(fence('json:plan', JSON.stringify(Object.assign({}, PLAN, { changes: [{ object: 'mirror' }] }))), STAGE), /changes\[0\]/);
    assert.throws(() => parsePlan(fence('json:plan', JSON.stringify(Object.assign({}, PLAN, { registryMode: 3 }))), STAGE), /`registryMode` \(null, or a declared registry mode string\)/);
    assert.throws(() => parsePlan(fence('json:plan', JSON.stringify(PLAN))), /parsePlan\(reply, stage\) needs the stage/);
});

test('the stage: read by INVENTORY_KEYS, shown in words, and a plan for another scene must load it (negative controls)', () => {
    assert.deepEqual(STAGE, { label: '1A · Mirror', id: 'cl1a-mirror', mode: null, modes: [], renderer: 'p5', dimensions: 2, canvas: [600, 400], camera: null, viewer: null,
        objects: [{ name: EMITTER, kind: 'SphereEmitter', center: EMITTER_AT, rect: null, inParts: true }, { name: 'mirror', kind: 'Wall', center: [370, 200, 0], rect: [360, 80, 20, 240], inParts: true }] });
    for (const k of INVENTORY_KEYS.concat([SKETCH_KEYS.parts])) {
        const cut = Object.assign({}, INV_2D); delete cut[k];
        assert.throws(() => stageOf(cut), new RegExp('lacks ' + k + ' \\(maxi-hands\\.js INVENTORY_KEYS and SKETCH_KEYS\\.parts\\)'), 'an inventory without ' + k + ' is no stage');
    }
    // P1: a part outside the sketch's parts block is declared in the scene's code, and the stage line SAYS no hand can change it
    // (negative control: the same object inside the block carries no mark)
    const codeDeclared = stageWords(stageOf(Object.assign({}, INV_2D, { parts: { mirror: INV_2D.parts.mirror } })));
    assert.ok(codeDeclared.includes(EMITTER + ' (SphereEmitter; declared in the scene\'s code: no hand can change it): centre') && codeDeclared.includes('mirror (Wall): spans'), codeDeclared);
    assert.doesNotMatch(stageWords(STAGE), /declared in the scene's code/);
    assert.match(stageWords(stageOf(Object.assign({}, INV_2D, { parts: null }))), /mirror \(Wall; declared in the scene's code: no hand can change it\)/, 'a sketch with no block: every part is code-declared');
    assert.throws(() => stageOf(Object.assign({}, INV_2D, { parts: [] })), /parts must be the sketch's parts block/);
    assert.throws(() => stageOf(Object.assign({}, INV_2D, { canvas: [600] })), /canvas must have one size per dimension \(2\)/);
    assert.throws(() => stageOf(Object.assign({}, INV_2D, { dimensions: '3d' })), /dimensions must be 2 or 3 \(maxi-hands\.js worldShape\), got "3d"/);
    assert.throws(() => stageOf(Object.assign({}, INV_2D, { dimensions: 3 })), /one size per dimension \(3\)/, 'dimensions and canvas that disagree are a body bug');
    assert.throws(() => stageOf(Object.assign({}, INV_2D, { modes: null })), /modes must be the declared registry modes/);
    const s3 = stageOf(INV_3D);
    assert.equal(s3.dimensions, 3);
    // the 3D mirror (run-3d-platform, mm3d2): the stage line SAYS 3D and lists no registry modes
    const w3 = stageWords(s3);
    assert.equal(w3, 'THE STAGE (loaded in the lab now, on Tony\'s screen): "1A · Mirror (3D)" — scene id cl1a-mirror-3d, no registry modes declared (loadScene takes its id only); 3D (x, y, z): a world 600 x 400 x 600 with depth (renderer three); the camera looks from azimuth 45°, elevation 45°; toward the viewer is +z, away is -z (a part whose centre moves +z comes nearer on screen; read off the camera, not off any part\'s name); declared objects: mirror (Wall): spans x 360..380, y 80..320, z -80..80; centre [370, 200, 0].');
    assert.doesNotMatch(w3, /\bmode\b|modes declared:|\(loaded:/, 'the 3D stage names no loaded mode and lists no declared modes');
    assert.match(stageWords(STAGE), /; 2D \(x, y\): a world 600 x 400 \(renderer p5\)/);
    assert.match(stageWords(stageOf(Object.assign({}, INV_2D, { id: null, scene: 'sketch (Maxi)' }))), /a sketch booted by openSketch \(no scene id\); 2D \(x, y\): a world 600 x 400/);
    assert.match(stageWords(stageOf(Object.assign({}, INV_2D, { id: 'dse-tunnel-rebuild', mode: '2d', modes: ['2d', '3d'] }))),
        /scene id dse-tunnel-rebuild, registry modes declared: 2d, 3d \(loaded: 2d\); 2D \(x, y\)/, 'a scene that DECLARES modes lists them');
    assert.equal(stageWords(emptyStage('inventory: no scene is loaded')), 'THE STAGE: no scene is loaded in the lab (the lab says: inventory: no scene is loaded).');
    // the load rule
    const PLAN3D = { scene: 'cl1a-mirror-3d', registryMode: null, changes: [], hands: ['dragTo'], prediction: 'the slab slides toward the viewer' };
    const block = (p) => fence('json:plan', JSON.stringify(p));
    assert.throws(() => parsePlan(block(PLAN3D), STAGE), /the plan is for "cl1a-mirror-3d", which is not on the stage \("cl1a-mirror"\), and its hands \[dragTo\] never load it — name loadScene or openSketch/);
    assert.equal(parsePlan(block(PLAN3D), s3).plan.scene, 'cl1a-mirror-3d', 'negative control: the same plan with its scene on the stage passes');
    assert.deepEqual(parsePlan(block(Object.assign({}, PLAN3D, { hands: ['loadScene', 'dragTo'] })), STAGE).plan.hands, ['loadScene', 'dragTo'], 'negative control: with loadScene it passes');
    assert.deepEqual([...LOADING_HANDS], ['loadScene', 'openSketch']);
    for (const h of LOADING_HANDS) assert.ok(Object.prototype.hasOwnProperty.call(HANDS, h), h + ' is a hand');
    const tunnel2d = stageOf(Object.assign({}, INV_2D, { id: 'dse-tunnel-rebuild', mode: '2d', modes: ['2d', '3d'] }));
    const want3d = { scene: 'dse-tunnel-rebuild', registryMode: '3d', changes: [], hands: ['see'], prediction: 'p' };
    assert.equal(planOnStage(want3d, tunnel2d), false, 'another DECLARED registry mode of the same scene is not on the stage');
    assert.throws(() => parsePlan(block(want3d), tunnel2d), /"dse-tunnel-rebuild" registryMode "3d", which is not on the stage \("dse-tunnel-rebuild" mode "2d"\)/);
    assert.equal(planOnStage(Object.assign({}, want3d, { registryMode: null }), tunnel2d), true, 'no registryMode named: the stage\'s mode stands');
    // the defect (run-3d-platform mm3d2): a plan for the 3D mirror ON the 3D mirror is on the stage — ids compared, dimensionality never planned
    assert.equal(planOnStage(PLAN3D, s3), true);
    assert.deepEqual(parsePlan(block(Object.assign({}, PLAN3D, { hands: ['inventory', 'moveObject'] })), s3).plan.hands, ['inventory', 'moveObject'], 'mm3d2\'s plan shape, without the planned mode, passes on the 3D stage');
    // a registryMode for the scene on the stage that it does not declare is refused by name (it would be refused at loadScene anyway)
    assert.throws(() => parsePlan(block(Object.assign({}, PLAN3D, { registryMode: '3d', hands: ['loadScene', 'dragTo'] })), s3),
        /registryMode "3d" for "cl1a-mirror-3d", which is on the stage and declares no registry modes \(registryMode is null\)/);
    // a STALE plan (the old shape) is refused BY NAME — never silently ignored; same plan without it passes (negative control)
    for (const [k, v] of [['mode', '3d'], ['mode', null], ['dimensions', 3]]) {
        assert.throws(() => parsePlan(block(Object.assign({}, PLAN3D, { [k]: v })), s3), new RegExp('`' + k + '` is not a plan field.*\\(got "' + k + '": '), 'a plan carrying ' + k + ' is refused by name');
    }
    assert.deepEqual(Object.keys(PLAN_REFUSED_KEYS), ['mode', 'dimensions']);
    assert.deepEqual(loadArgsOf(PLAN3D), { id: 'cl1a-mirror-3d' }, 'the load a plan needs carries no mode when the registry declares none');
    assert.deepEqual(loadArgsOf(want3d), { id: 'dse-tunnel-rebuild', mode: '3d' });
    assert.throws(() => parsePlan(block(PLAN3D), emptyStage('no scene')), /which is not on the stage \(nothing is loaded\)/);
});

test('the 3D stage says which way is toward the viewer (off the camera) and every part\'s full extent; a mirrored camera flips it; the Owl is told none of it', () => {
    // the run-3d-platform-2 misreads: "toward the viewer" with no grounding, and the slab read as z -240..80 / -160..0 — the stage now states both
    const w3 = stageWords(stageOf(INV_3D));
    assert.match(w3, /the camera looks from azimuth 45°, elevation 45°; toward the viewer is \+z, away is -z/);
    assert.match(w3, /mirror \(Wall\): spans x 360\.\.380, y 80\.\.320, z -80\.\.80; centre \[370, 200, 0\]/);
    // end to end from the ONE owner: an inventory read off the SDK's own camera geometry, at the default pose and at the mirrored one
    const wall = () => ({ name: 'mirror', _schemaKind: 'Wall', rect: { left: 360, top: 80, z: -80, w: 20, h: 240, d: 160 } });
    const scAt = (azimuth) => ({ label: '1A · Mirror (3D)', id: 'cl1a-mirror-3d', mode: null, modes: [], renderer: 'three', tick: () => 1, recipeContext: { world: { w: 600, h: 400, d: 600 } },
        runner: fakeRunner([wall()], { cameraControl: sdkCameraControl({ azimuth: azimuth, elevation: 45, distance: 900 }, 600, 400) }) });
    const handInv = (sc) => Object.assign(inventoryOf(sc), { [SKETCH_KEYS.parts]: { mirror: ['Wall', {}] } });   // the inventory HAND adds the block (SKETCH_KEYS)
    assert.match(stageWords(stageOf(handInv(scAt(45)))), /azimuth 45°, elevation 45°; toward the viewer is \+z, away is -z/);
    assert.match(stageWords(stageOf(handInv(scAt(225)))), /azimuth 225°, elevation 45°; toward the viewer is -z, away is \+z/, 'the planted mirrored pose flips the words');
    assert.match(stageWords(stageOf(Object.assign({}, INV_3D, { camera: { azimuth: 90, elevation: 20 }, viewer: { toward: null, away: null } }))),
        /azimuth 90°, elevation 20°, across z: neither z direction is toward the viewer/);
    // extents: a centre-placed part gives its centre; a 2D rect spans x and y only; fractions are rounded, not hidden
    assert.equal(extentWords({ name: EMITTER, kind: 'SphereEmitter', center: EMITTER_AT, rect: null }, 3), EMITTER + ' (SphereEmitter): centre [' + EMITTER_AT.join(', ') + ']');
    assert.equal(extentWords({ name: 'mirror', kind: 'Wall', center: [370, 200, 0], rect: [360, 80, 20, 240] }, 2), 'mirror (Wall): spans x 360..380, y 80..320; centre [370, 200]');
    assert.equal(extentWords({ name: 'w', kind: 'Wall', center: null, rect: [0, 0, 1.5, 10, 10, 2.25] }, 3), 'w (Wall): spans x 0..10, y 0..10, z 1.5..3.75');
    assert.match(stageWords(STAGE), new RegExp(reText('declared objects: ' + EMITTER + ' (SphereEmitter): centre [' + EMITTER_AT.slice(0, 2).join(', ') + ']; mirror (Wall): spans x 360..380, y 80..320; centre [370, 200].') + '$'));
    assert.doesNotMatch(stageWords(STAGE), /toward the viewer|azimuth/, 'a 2D stage has no depth and no viewer axis');
    // negative controls: a 3D inventory without a derived viewer, or with a malformed one, is a body bug; 2D carries none
    for (const bad of [null, {}, { toward: '+z', away: '+z' }, { toward: 'near', away: 'far' }, { toward: '-z' }]) {
        assert.throws(() => stageOf(Object.assign({}, INV_3D, { viewer: bad })), /viewer must be \{toward:"\+z"\|"-z", away: the other\}/, JSON.stringify(bad) + ' stayed green');
    }
    assert.throws(() => stageOf(Object.assign({}, INV_3D, { camera: null })), /camera must be the 3D pose/);
    assert.throws(() => stageOf(Object.assign({}, INV_2D, { viewer: { toward: '+z', away: '-z' } })), /viewer must be null in a 2D world/);
    assert.throws(() => stageOf(Object.assign({}, INV_3D, { objects: [{ name: 'mirror', kind: 'Wall', rect: [360, 80, 20, 240] }] })), /rect must be \[left, top, z, w, h, d\] in a 3D world/);
    // the Designer and the Builder are told what the words mean; the Builder's first turn carries them
    assert.match(ROLES.designer.preface, /TOWARD THE VIEWER .*\sread off the camera, never off an object's name/s);
    assert.match(ROLES.designer.preface, /a part is out of a band only when its WHOLE span is/);
    assert.match(ROLES.builder.preface, /a `to` for "toward the viewer" moves the centre along it \(toward \+z: a larger z;\s+'?\s*toward -z: a smaller z\)/);
    const b1 = builderTurn({ plan: Object.assign({}, PLAN, { scene: 'cl1a-mirror-3d' }), stage: stageOf(INV_3D) });
    assert.ok(b1.includes('toward the viewer is +z, away is -z') && b1.includes('spans x 360..380, y 80..320, z -80..80'), 'the Builder\'s first turn carries the viewer axis and the extent');
    assert.ok(designerTurn({ outline: 'slide the mirror toward the viewer, out of the beam', stage: stageOf(INV_3D) }).includes('toward the viewer is +z'), 'the Designer\'s turn carries it');
    // the Owl: its preface and its turn carry no stage, no camera, no viewer axis, no extent (isolation unchanged)
    const o = owlTurn({ outline: 'slide the mirror toward the viewer, out of the beam', prediction: 'the slab moves to centre z 180' });
    assert.doesNotMatch(o.replace('slide the mirror toward the viewer, out of the beam', ''), /THE STAGE|toward the viewer|azimuth|spans [xyz] |\+z|-z/);
    assert.doesNotMatch(ROLES.owl.preface, /viewer|azimuth|spans|camera/);
});

test('builder: every HANDS key is a hand; a call needs its PREDICTION; done takes {}', () => {
    for (const h of Object.keys(HANDS)) {
        const r = parseBuilderReply('PREDICTION: something\n' + fence('json:call:' + h, '{}'));
        assert.equal(r.kind, 'call'); assert.equal(r.hand, h); assert.equal(r.prediction, 'something');
    }
    const multi = parseBuilderReply('I read the sketch.\nPREDICTION: the clip shows these things:\n- the beam at y 200\n- the stream up-left\n\n' + fence('json:call:see', '{}'));
    assert.equal(multi.prediction, 'the clip shows these things:\n- the beam at y 200\n- the stream up-left', 'a multi-line prediction is kept whole (mmlocal1: the Owl got only its first line)');
    assert.throws(() => parseBuilderReply('PREDICTION:   \n' + fence('json:call:see', '{}')), /without a `PREDICTION: …` line/);
    assert.throws(() => parseBuilderReply('PREDICTION: x\n' + fence('json:call:teleport', '{}')), /names no hand/);
    assert.throws(() => parseBuilderReply(fence('json:call:see', '{}')), /without a `PREDICTION: …` line/);
    assert.throws(() => parseBuilderReply('PREDICTION: x\n' + fence('json:call:see', '{everyTicks: 5}')), /not strict JSON/);
    assert.throws(() => parseBuilderReply('PREDICTION: x\n' + fence('json:call:see', '[]')), /ONE JSON object/);
    assert.throws(() => parseBuilderReply('I am done, it looks right.'), /found 0/);
    assert.throws(() => parseBuilderReply('PREDICTION: x\n' + fence('json:call:see', '{}') + fence('json:done', '{}')), /found 2/);
    assert.equal(parseBuilderReply('The clip shows it.\n' + fence('json:done', '{}')).kind, 'done');
    assert.throws(() => parseBuilderReply(fence('json:done', '{"clip": 2}')), /json:done takes the body \{\}/);
});

const SEEN = '"seen":{"contact":"mirror, middle third","after":"up and to the left","passes":"no"},';
test('owl: approve and revise parse with the account; a missing verdict, account, change or a third word throws', () => {
    const a = parseVerdict('I see the beam turn upward.\n' + fence('json:verdict', '{' + SEEN + '"verdict":"approve","reasons":["the mirror sits at 30 degrees"],"change":null}'));
    assert.equal(a.verdict, 'approve'); assert.equal(a.change, null);
    assert.deepEqual(a.seen, { contact: 'mirror, middle third', after: 'up and to the left', passes: 'no' });
    const r = parseVerdict(fence('json:verdict', '{' + SEEN + '"verdict":"revise","reasons":["the mirror is at 45 degrees"],"change":"set the mirror to 30 degrees"}'));
    assert.equal(r.change, 'set the mirror to 30 degrees');
    assert.throws(() => parseVerdict(fence('json:verdict', '{' + SEEN + '"reasons":["the beam meets the top tip"],"change":"lower the contact"}')), /`verdict` "approve" or "revise" \(got undefined\)/, 'a verdict block with NO verdict key is refused');
    assert.throws(() => parseVerdict(fence('json:verdict', '{' + SEEN + '"verdict":"revise","reasons":["x"]}')), /`change`/);
    assert.throws(() => parseVerdict(fence('json:verdict', '{' + SEEN + '"verdict":"maybe","reasons":["x"],"change":null}')), /"approve" or "revise"/);
    assert.throws(() => parseVerdict(fence('json:verdict', '{' + SEEN + '"verdict":"approve","reasons":[],"change":null}')), /`reasons`/);
    assert.throws(() => parseVerdict(fence('json:verdict', '{"verdict":"approve","reasons":["x"],"change":null}')), /`seen`/, 'no account, no verdict (vfyplat1)');
    assert.throws(() => parseVerdict(fence('json:verdict', '{"seen":{"contact":"mirror, top third","after":"up"},"verdict":"approve","reasons":["x"],"change":null}')), /`seen\.passes`/);
});

test('turns: each role sees only its own inputs', () => {
    const d = designerTurn({ outline: 'a laser hitting a mirror at 30 degrees', stage: STAGE });
    assert.ok(d.startsWith(ROLES.designer.preface + '\n\n' + stageWords(STAGE) + '\n\nTONY\'S MESSAGE: a laser hitting a mirror at 30 degrees'), 'preface, then THE STAGE, then the message (labelled a message: reading it is the Designer\'s first move)');
    const later = designerTurn({ outline: 'x', first: false, stage: STAGE });
    assert.equal(later, stageWords(STAGE) + '\n\nTONY\'S MESSAGE: x', 'a later Designer turn carries no second preface, and the stage again');
    assert.throws(() => designerTurn({ outline: 'x' }), /designerTurn needs the stage/);
    const b1 = builderTurn({ plan: PLAN, stage: STAGE });
    assert.match(b1, /"orientationDeg"/);
    assert.ok(b1.includes(stageWords(STAGE)) && !/not on the stage/.test(b1), 'the Builder sees the stage; the plan\'s scene is on it, so no load line');
    const b1load = builderTurn({ plan: Object.assign({}, PLAN, { scene: 'cl1a-mirror-3d' }), stage: STAGE });
    assert.match(b1load, /The plan's scene is not on the stage: your first hand loads it — loadScene \{"id":"cl1a-mirror-3d"\} \(or openSketch/);
    // the prefaces: 2D/3D is the loaded scene's; loadScene takes an id (a mode only when declared); every 3D `to` is a CENTRE and a prediction names it
    assert.match(ROLES.designer.preface, /2D or 3D is a FACT OF THE LOADED SCENE/);
    assert.match(ROLES.designer.preface, /"registryMode": null/);
    assert.doesNotMatch(ROLES.designer.preface, /"mode":|\("2d" or "3d"\)/, 'the Designer is never shown a 2d/3d mode to plan');
    assert.match(ROLES.builder.preface, /loadScene\{id\} of the plan's scene — with a `mode` ONLY when the plan names a registryMode/);
    assert.match(ROLES.builder.preface, /2D or 3D is a fact of the LOADED scene/);
    assert.match(ROLES.builder.preface, /Every `to` is a CENTRE \[x, y, z\], never a face/);
    assert.match(ROLES.builder.preface, /your PREDICTION states the CENTRE it will drive to/);
    assert.match(ROLES.builder.preface, /centred at z 0/, 'the rect-z-is-the-near-face worked example (the mirror slab, z -80 depth 160)');
    assert.throws(() => builderTurn({ plan: PLAN }), /builderTurn\.plan needs the stage/);
    const b2 = builderTurn({ results: [{ hand: 'see', ok: true, result: { clip: '/tmp/x/clip.mp4', frames: ['/tmp/x/f0.png'], base64Length: 9, seconds: 5.1 } }], footageAttached: true, omit: ['clip', 'frames'] });
    assert.ok(!/clip\.mp4|f0\.png|base64Length/.test(b2), 'clip path and frames ride as media, never in the text');
    assert.match(b2, /attached as video/);
    const b3 = builderTurn({ results: [{ hand: 'openSketch', ok: false, error: 'SyntaxError: Unexpected token' }], footageAttached: false });
    assert.doesNotMatch(b3, /attached as video/);
    assert.throws(() => builderTurn({ results: [{ hand: 'see', ok: true, result: {} }] }), /footageAttached/);
    assert.match(b3, /REFUSED, verbatim:\nSyntaxError: Unexpected token/);
    assert.throws(() => builderTurn({ results: [], footageAttached: false }), /non-empty array/);
    assert.throws(() => builderTurn({ results: [{ hand: 'see', ok: 'yes' }], footageAttached: false }), /ok:true/);
    const rv = builderTurn({ revise: { verdict: 'revise', reasons: ['mirror at 45'], change: 'set 30' } });
    assert.match(rv, /- mirror at 45\nThe one change it asks for: set 30/);
    const o = owlTurn({ outline: 'a laser hitting a mirror at 30 degrees', prediction: 'the beam leaves at 60 degrees' });
    assert.ok(!/orientationDeg|cl1a-mirror|PLAN|sceneSource|THE STAGE/.test(o), 'the Owl sees nothing of the plan, the stage or the build');
    assert.match(o, /THE OUTLINE: a laser.*\n\nTHE BUILDER'S PREDICTION: the beam leaves at 60 degrees/s);
    for (const k of Object.keys(SEEN_ACCOUNT)) assert.ok(o.includes('- ' + k + ': ' + SEEN_ACCOUNT[k]), 'the Owl is asked its account item ' + k);
});

test('plugin agents: generated, current, persona verbatim; a drift is red', () => {
    const persona = fs.readFileSync(path.join(REPO, PERSONA), 'utf8').replace(/\s+$/, '');
    const files = renderAll(REPO);
    assert.deepEqual(files.map((f) => f.id), ['designer', 'builder', 'owl', 'skill', 'brief']);
    for (const f of files.filter((x) => x.id === 'brief')) { assert.equal(fs.readFileSync(path.join(REPO, f.path), 'utf8'), f.text, f.path + ' (the Brief figure) is stale — run node scripts/gen-plugin-agents.mjs --write'); }
    for (const f of files.filter((x) => x.id === 'skill')) {
        assert.equal(fs.readFileSync(path.join(REPO, f.path), 'utf8'), f.text, f.path + ' roles table is stale — run node scripts/gen-plugin-agents.mjs --write');
        for (const id of ROLE_ORDER) assert.ok(f.text.includes(ROLES[id].knowledgebase_names.map((k) => '`' + k + '`').join(', ')), 'the skill table states ROLES.' + id + '.knowledgebase_names');
    }
    for (const f of files.filter((x) => x.id !== 'skill' && x.id !== 'brief')) {
        const disk = fs.readFileSync(path.join(REPO, f.path), 'utf8');
        assert.equal(disk, f.text, f.path + ' is stale — run node scripts/gen-plugin-agents.mjs --write');
        if (ROLES[f.id].persona) assert.ok(disk.includes(persona) && disk.includes('(verbatim below)'), f.path + ' must carry the persona verbatim');
        else assert.ok(!disk.includes('WHY YOU ARE') && !disk.includes('verbatim below'), f.path + ' runs without the persona on the platform, so locally too — and its header must not promise one');
        assert.match(disk, new RegExp('^---\\nname: maxi-' + f.id + '\\n'));
    }
    // negative control: the same comparison on a one-character drift
    const drifted = files[0].text.replace('WHY YOU ARE', 'WHY YOU  ARE');
    assert.notEqual(drifted, files[0].text);
    assert.equal(agentPath('owl'), 'plugin/agents/maxi-owl.md');
});

/** The tools line and the HOW THIS AGENT RUNS section of an agent file. */
function agentTools(text, where) {
    const m = /^---\n[\s\S]*?^tools: (.*)$[\s\S]*?^---$/m.exec(text);
    assert.ok(m, where + ' has no tools line in its frontmatter');
    const b = text.indexOf('# HOW THIS AGENT RUNS');
    assert.ok(b !== -1, where + ' has no HOW THIS AGENT RUNS section');
    const e = text.indexOf('\n# ', b + 1);
    return { tools: m[1].split(',').map((t) => t.trim()).filter(Boolean), how: text.slice(b, e === -1 ? undefined : e) };
}

/** Red when an agent's listed tools are not exactly the tools its turn text requires. */
function assertToolsAsTurnRequires(text, where) {
    const a = agentTools(text, where);
    const need = TOOL_NEEDS.filter((n) => n.when.test(a.how));
    const missing = need.filter((n) => a.tools.indexOf(n.tool) === -1).map((n) => n.tool + ' (its turn ' + n.why + ')');
    const extra = a.tools.filter((t) => !need.some((n) => n.tool === t));
    assert.deepEqual(missing, [], where + ' lacks a tool its turn requires: ' + missing.join(', '));
    assert.deepEqual(extra, [], where + ' lists a tool no line of its turn requires: ' + extra.join(', '));
    return a.tools;
}

test('plugin agents: each agent\'s tools are exactly what its turn requires; a missing Write or an Owl with Bash is red', () => {
    const got = {};
    for (const id of ROLE_ORDER) {
        const p = agentPath(id);
        got[id] = assertToolsAsTurnRequires(fs.readFileSync(path.join(REPO, p), 'utf8'), p);
    }
    assert.deepEqual(got, {
        designer: ['Read', 'Write', 'Grep', 'Glob'],
        builder: ['Bash', 'Read', 'Write', 'Grep', 'Glob'],
        owl: ['Read', 'Write']
    });
    // negative control 1: the Designer without Write (the shape the local trial hit) is red
    const designer = fs.readFileSync(path.join(REPO, agentPath('designer')), 'utf8');
    assert.throws(() => assertToolsAsTurnRequires(designer.replace(/^tools: .*$/m, 'tools: Read, Grep, Glob'), 'planted'), /lacks a tool its turn requires: Write/);
    // negative control 2: the Owl given Bash (its isolation broken) is red
    const owl = fs.readFileSync(path.join(REPO, agentPath('owl')), 'utf8');
    assert.throws(() => assertToolsAsTurnRequires(owl.replace(/^tools: .*$/m, 'tools: Bash, Read, Write'), 'planted'), /lists a tool no line of its turn requires: Bash/);
    // negative control 3: the generator refuses a turn text that asks no answer file
    assert.throws(() => toolsFor('Read the turn file.'), /lacks Write \(no line matching \/Write your reply to the answer file\/[^)]*\) — refusing to generate/);
    assert.throws(() => toolsFor('Write your reply to the answer file.'), /lacks Read \(no line matching \/Read the turn file\//);
});

/** How many times `needle` occurs in `hay` (non-overlapping). */
const count = (hay, needle) => hay.split(needle).length - 1;

/** The persona's WORLD FRAME section as the generator owns it. */
const FRAME_SECTION = SECTIONS.find((x) => x.markers === rolesModule.WORLD_FRAME_MARKERS);

/** Red when `text` (a persona) does not carry the WORLD FRAME section exactly as renderWorldFrameMarkdown() renders it. */
function assertFrameSectionCurrent(text) {
    const s = spliceBlock(text, FRAME_SECTION, PERSONA);   // throws: no markers, doubled, out of order
    assert.equal(s.current.trimEnd(), rolesModule.renderWorldFrameMarkdown().trimEnd(),
        PERSONA + ' WORLD FRAME section is stale — run node scripts/gen-hands-section.mjs --write ' + PERSONA);
    assert.deepEqual(renderPersona(text, PERSONA).stale, [], PERSONA + ' carries a stale generated section');
}

test('the persona\'s WORLD FRAME section: generated from WORLD_FRAME between its markers, current; a hand-typed or stale copy is red', () => {
    const W = rolesModule.WORLD_FRAME;
    const text = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    assert.ok(FRAME_SECTION, 'scripts/gen-hands-section.mjs SECTIONS renders the WORLD FRAME section from maxi-roles.js WORLD_FRAME_MARKERS');
    assertFrameSectionCurrent(text);
    assert.equal(count(text, W), 1, PERSONA + ' carries WORLD_FRAME exactly once');
    const b = text.indexOf(rolesModule.WORLD_FRAME_MARKERS.begin);
    assert.ok(text.indexOf(W) > b && text.indexOf(W) < text.indexOf(rolesModule.WORLD_FRAME_MARKERS.end), 'the one copy sits between the markers');
    // negative control 1: the section typed by hand (the frame's words with no markers) is red
    const typed = text.replace(rolesModule.WORLD_FRAME_MARKERS.begin + '\n', '').replace('\n' + rolesModule.WORLD_FRAME_MARKERS.end, '');
    assert.equal(count(typed, W), 1, 'the planted fault keeps the words');
    assert.throws(() => assertFrameSectionCurrent(typed), /does not carry exactly one WORLD FRAME block/);
    // negative control 2: the constant changed without regenerating — the section on disk no longer matches
    const drifted = text.replace(W, W.replace('Minecraft', 'Minecraft (the game)'));
    assert.throws(() => assertFrameSectionCurrent(drifted), /WORLD FRAME section is stale/);
    // negative control 3: a doubled section is refused, never spliced into the first
    const m = rolesModule.renderWorldFrameMarkdown();
    assert.throws(() => assertFrameSectionCurrent(text + '\n' + m), /exactly one WORLD FRAME block/);
});

test('the world frame: one owner — the persona and the Owl\'s first turn carry it, the Designer\'s and the Builder\'s turns never, never typed twice', () => {
    const W = rolesModule.WORLD_FRAME;
    assert.equal(typeof W, 'string', 'maxi-roles.js exports WORLD_FRAME, the one text every role is told about the world');
    assert.ok(W.trim() === W && W.length > 0 && !W.includes('\n\n'), 'WORLD_FRAME is one paragraph');
    for (const fact of [/Minecraft/, /block/, /container/i, /fundamental dimension/, /no units?|unitless/i, /ticks/, /level-0/, /force equations?/]) {
        assert.match(W, fact, 'WORLD_FRAME states ' + fact);
    }
    const turns = {
        designer: designerTurn({ outline: 'a laser hitting a mirror at 30 degrees', stage: STAGE }),
        builder: builderTurn({ plan: PLAN, stage: STAGE }),
        owl: owlTurn({ outline: 'a laser hitting a mirror at 30 degrees', prediction: 'the beam leaves at 60 degrees' })
    };
    // a role under the persona gets the frame there; a role without it gets it in its first turn — exactly one path each
    const WANT_TURN = { designer: 0, builder: 0, owl: 1 };
    for (const id of ROLE_ORDER) {
        assert.equal(WANT_TURN[id], ROLES[id].persona ? 0 : 1, 'the turn carries the frame exactly when the persona does not (' + id + ')');
        assert.equal(count(turns[id], W), WANT_TURN[id], 'the ' + id + '\'s first turn carries WORLD_FRAME ' + WANT_TURN[id] + ' time(s)');
        assert.equal(count(ROLES[id].preface, W), WANT_TURN[id], 'ROLES.' + id + '.preface carries WORLD_FRAME ' + WANT_TURN[id] + ' time(s)');
    }
    assert.equal(count(designerTurn({ outline: 'x', first: false, stage: STAGE }), W), 0, 'a later Designer turn carries no frame');
    assert.equal(count(fs.readFileSync(path.join(REPO, PERSONA), 'utf8'), W), 1, 'the persona carries it once');
    // the generated files: the persona-bearing agents once (the embedded persona), the Owl's agent never, the skill once
    const files = renderAll(REPO);
    const WANT_FILE = { designer: 1, builder: 1, owl: 0, skill: 1, brief: 0 };
    for (const f of files) {
        const want = WANT_FILE[f.id];
        assert.equal(count(f.text, W), want, f.path + ' carries WORLD_FRAME ' + want + ' time(s)');
        assert.equal(count(fs.readFileSync(path.join(REPO, f.path), 'utf8'), W), want, f.path + ' on disk carries WORLD_FRAME ' + want + ' time(s)');
        if (f.id !== 'skill' && f.id !== 'brief') { assert.equal(want, ROLES[f.id].persona ? 1 : 0, f.path + ': the agent carries the frame exactly when it embeds the persona'); }
    }
    // no hand-typed copy: no clause of the frame occurs outside its owner, the generated persona section and the generated files
    const probes = W.split(/(?<=[.:;])\s+/).filter((c) => c.length > 40);
    assert.ok(probes.length >= 4, 'the probes are the frame\'s distinctive clauses');
    const allowed = new Set(['site/app-assets/maxi-roles.js', PERSONA].concat(files.map((f) => f.path)));
    const tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
        .filter((p) => /\.(m?js|md|json|txt|html)$/.test(p) && !p.startsWith('site/vendor/'));
    const copies = tracked.filter((p) => !allowed.has(p) && fs.existsSync(path.join(REPO, p)) && probes.some((c) => fs.readFileSync(path.join(REPO, p), 'utf8').includes(c)));
    assert.deepEqual(copies, [], 'WORLD_FRAME wording typed outside its owner: ' + copies.join(', ') + ' — import WORLD_FRAME or generate from it');
});

/** Words that carry no claim, and a plural/3rd-person -s, are dropped so a reworded clause still matches. */
const FILLER = new Set(['the', 'a', 'an', 'that', 'this', 'of', 'in', 'on', 'to', 'and', 'or', 'by', 'it', 'its', 'is', 'are', 'your', 'you', 'so', 'once', 'when', 'have', 'has', 'been']);
const contentWords = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((w) => w && !FILLER.has(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
/**
 * Every run of RUN consecutive content words of the rule (its parenthesised example split off first) that also
 * occurs in `text`: case, punctuation and filler words ignored, so a capitalised or reworded clause is caught.
 */
const RUN = 4;
function restated(rule, text) {
    const r = contentWords(rule.replace(/\([^)]*\)/g, ' '));
    const t = ' ' + contentWords(text).join(' ') + ' ';
    const out = [];
    for (let i = 0; i + RUN <= r.length; i++) { const run = r.slice(i, i + RUN).join(' '); if (t.includes(' ' + run + ' ') && out.indexOf(run) === -1) { out.push(run); } }
    return out;
}

test('LOOK, NOT ASK: the rule lives once in the persona\'s BUILDING FROM AN OUTLINE; the Designer\'s preface points at it and restates none of it', () => {
    const L = rolesModule.LOOK_RULE;
    const text = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    const lines = text.split('\n');
    const ruleAt = lines.findIndex((l) => l.startsWith(L + '. '));
    assert.ok(ruleAt !== -1, PERSONA + ' carries a line opening "' + L + '. "');
    assert.equal(lines.filter((l) => l.startsWith(L + '. ')).length, 1, 'the rule is stated once');
    const sec = lines.indexOf('BUILDING FROM AN OUTLINE');
    const next = lines.findIndex((l, i) => i > sec && /^[A-Z][A-Z ,'’—()-]+$/.test(l) && l.length > 8);
    assert.ok(sec !== -1 && ruleAt > sec && ruleAt < next, 'the rule sits in BUILDING FROM AN OUTLINE (the planning section)');
    const rule = lines[ruleAt];
    assert.match(rule, /never by a question back to the person/);
    assert.match(rule, /states that reading in one line/);
    // the Designer's preface names it and points at the section; it repeats none of the rule's own clauses
    const pre = ROLES.designer.preface;
    assert.ok(pre.includes(L) && pre.includes('BUILDING FROM AN OUTLINE'), 'the Designer preface points at the rule by name');
    const repeats = restated(rule.slice(L.length + 2), pre);
    assert.deepEqual(repeats, [], 'the Designer preface restates the persona\'s rule: ' + repeats.join(' | '));
    // negative controls: a verbatim clause in capitals, and the rule's own core sentence, are red
    assert.notDeepEqual(restated(rule.slice(L.length + 2), pre + '\nWHICH SCENE, WHICH ANGLE, WHICH OBJECT, HOW MUCH — IS RESOLVED BY LOOKING'), []);
    assert.notDeepEqual(restated(rule.slice(L.length + 2), pre + '\nYour plan states that reading in one line.'), []);
    for (const id of ['builder', 'owl']) assert.ok(!ROLES[id].preface.includes(L), 'only the Designer plans, so only it is pointed at the rule (' + id + ')');
    // negative control: the pointer without the rule in the persona is red
    assert.equal(text.replace(rule + '\n', '').split('\n').findIndex((l) => l.startsWith(L + '. ')), -1);
});

/** THE P1 PARADIGM in a role's preface: each clause a regex; returns the clauses that are missing. */
export const P1_DESIGNER = {
    'the parts block is the one region a hand rewrites': /`export const parts = \{…\}` block is the one region a hand\s+'?\s*rewrites/,
    'a parameter is a setDeclared {name, patch}, one Record row': /setDeclared \{name, patch\}: one row in the\s+'?\s*Record/,
    'a placement is a move': /a placement is a move: moveObject or resize, or dragTo/,
    'a re-authoring is openSketch, which closes the Record': /openSketch, which\s+'?\s*closes the Record and opens a new one/,
    'a code-declared part cannot be touched': /a part the scene declares in its code \(the stage line marks it\) cannot be touched by any hand/,
    'a rename is a new key or a fork': /never renamed: a new name is a new key \(addObject\) or a fork \(openSketch\)/
};
export const P1_BUILDER = {
    'setDeclared over re-authoring': /changes\s+'?\s*with setDeclared\{name, patch\}, never by re-authoring the sketch/,
    'setDeclared re-runs the world: film after it': /setDeclared runs the scene again from its tick 0/,
    'film every change: the Record refuses a change no clip shows': /FILM EVERY CHANGE[\s\S]*The Record refuses a change no clip shows, and the Owl needs a clip of each/,
    'a refusal is answered in words, part and key, never retried unchanged': /A REFUSED HAND comes back verbatim\. Before your next block, say in words which part and which key it refused\s+'?\s*and why; never send the same hand again unchanged/,
    'a refused part and key are named in the hand-back': /name that part and key in your json:done/
};
const STALE = [/sceneSource to read it, then openSketch with the edited source/, /change the value\s+there and boot the whole edited sketch/];
/** Sentences of a preface that teach the P0 path in any words: one sentence naming both sceneSource and openSketch (neither preface needs sceneSource at all). */
export const p0Sentences = (pre) => pre.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/)
    .filter((t) => /\bsceneSource\b/.test(t) && /\bopenSketch\b/.test(t));
const missingOf = (pre, clauses) => Object.keys(clauses).filter((k) => !clauses[k].test(pre));
const flat = (pre) => pre.replace(/\n/g, ' ');

test('the P1 paradigm: the Designer plans setDeclared/moves/openSketch over the parts block; the Builder prefers setDeclared, films every change, answers a refusal in words (planted prefaces are red)', () => {
    assert.deepEqual(missingOf(flat(ROLES.designer.preface), P1_DESIGNER), [], 'the Designer preface lacks P1 clauses');
    assert.deepEqual(missingOf(flat(ROLES.builder.preface), P1_BUILDER), [], 'the Builder preface lacks P1 clauses');
    for (const id of ['designer', 'builder']) for (const re of STALE) assert.doesNotMatch(flat(ROLES[id].preface), re, 'the ' + id + ' preface still teaches the P0 re-author-for-a-parameter path');
    for (const id of ['designer', 'builder']) assert.deepEqual(p0Sentences(ROLES[id].preface), [], 'the ' + id + ' preface names sceneSource and openSketch in one sentence: the P0 re-author teaching, in other words');
    // negative controls: the old teaching paraphrased beside the new text is red, whatever its words and punctuation
    for (const [id, plant] of [
        ['designer', 'To change a part\'s angle, read its text with sceneSource and boot the edited copy with openSketch.'],
        ['builder', 'A part\'s own parameter changes only in its sketch: sceneSource{id} gives you the sketch text; change the value there and boot it with openSketch{source}.'],
        ['builder', 'To tilt the mirror, read its sketch with sceneSource, then boot the edited text with openSketch.']]) {
        assert.equal(p0Sentences(ROLES[id].preface + '\n' + plant).length, 1, 'the paraphrase stayed green: ' + plant);
    }
    // negative controls: a Designer preface without setDeclared, a Builder preface whose refusal clause is gone
    assert.deepEqual(missingOf(flat(ROLES.designer.preface).replace(/setDeclared \{name, patch\}/g, 'openSketch'), P1_DESIGNER), ['a parameter is a setDeclared {name, patch}, one Record row']);
    assert.ok(missingOf(flat(ROLES.builder.preface).replace(/A REFUSED HAND[^.]*\./, ''), P1_BUILDER).includes('a refusal is answered in words, part and key, never retried unchanged'));
    // every hand the Builder's preface names in its call shape (`hand{args}`) is a HANDS key (a renamed hand is red here, not in a run)
    const named = [...new Set([...ROLES.builder.preface.matchAll(/(?<![:\w])([a-z][A-Za-z]+)\{/g)].map((m) => m[1]))];
    assert.ok(named.includes('setDeclared') && named.includes('loadScene'), 'the Builder names setDeclared and loadScene in their call shape: ' + named.join(', '));
    assert.deepEqual(named.filter((h) => !Object.prototype.hasOwnProperty.call(HANDS, h)), [], 'the Builder preface names a hand that is not in HANDS');
    assert.ok(Object.prototype.hasOwnProperty.call(HANDS, 'setDeclared'), 'setDeclared is a hand');
    // the plan template still quotes the generator's change shape {object, param, value, why}
    assert.match(ROLES.designer.preface, /"changes": \[\{"object": "<a part of the scene's parts block>", "param": "<a field of its entry, or rect\/center>", "value": <new value>, "why": "<one line>"\}\]/);
});

test('a refused hand\'s turn asks for the part and key in words and adds no claim of its own; a refused json:done goes back verbatim; `said` is the words before PREDICTION', () => {
    const refusal = 'setDeclared: the sketch text did not take this hand — "mirror" name (setDeclared): the key is the name. The world changed, but the sketch does not say so.';
    const t = builderTurn({ results: [{ hand: 'setDeclared', ok: false, error: refusal }], footageAttached: false });
    assert.ok(t.startsWith('YOUR HAND `setDeclared` WAS REFUSED, verbatim:\n' + refusal + '\n' + REFUSAL_ASK), t);
    assert.doesNotMatch(t, /Nothing moved/, 'the turn never says nothing moved: a sketch that did not take a hand says the world changed');
    assert.match(REFUSAL_ASK, /which part and which key it refused and why/);
    const d = builderTurn({ doneRefused: 'json:done after 1 change(s) your last clip does not show (the first: setDeclared of mirror)' });
    assert.match(d, /^YOUR json:done WAS REFUSED, verbatim:\njson:done after 1 change\(s\) your last clip does not show \(the first: setDeclared of mirror\)\nFilm it/);
    assert.throws(() => builderTurn({ doneRefused: '  ' }), /doneRefused must be a non-empty string/);
    const call = parseBuilderReply('The mirror key was refused: a rename.\nPREDICTION: the mirror turns\n' + fence('json:call:setDeclared', '{"name":"mirror","patch":{"orientationDeg":30}}'));
    assert.equal(call.said, 'The mirror key was refused: a rename.');
    assert.equal(parseBuilderReply('PREDICTION: x\n' + fence('json:call:see', '{}')).said, '', 'a reply that is only its PREDICTION says nothing');
    assert.equal(parseBuilderReply('Done.\n' + fence('json:done', '{}')).said, 'Done.');
});

// ── the Designer reads the message first: an outline plans, a question answers ───────────────

const READ = (k) => READING_LINE + ' ' + DESIGNER_READINGS[k];
const ANSWER_WORDS = 'The card dse-tunnel-rebuild-card.md says Feynman called it impossible to explain in any classical way; that is its claim.';
const ANSWER_BLOCK = fence(HANDOFF_TAGS.answer, JSON.stringify({ memories: ['dse-tunnel-rebuild-card.md'] }));
const PLAN_BLOCK = fence(HANDOFF_TAGS.plan, JSON.stringify(PLAN));

test('designer: the first line reads the message; an outline parses its plan, a question its answer naming the memory files, both the answer then the plan (planted replies are red, each by name)', () => {
    assert.equal(PARSERS.designer, parseDesignerReply, 'the Designer\'s one parser reads the message first');
    assert.deepEqual(Object.keys(DESIGNER_READINGS), ['outline', 'question', 'both']);
    // the three shapes
    const o = parseDesignerReply(READ('outline') + '\nTony, I will start from the mirror.\n' + PLAN_BLOCK, STAGE);
    assert.deepEqual([o.reading, o.answer, o.plan, o.words], ['outline', null, PLAN, 'Tony, I will start from the mirror.']);
    const q = parseDesignerReply(READ('question') + '\n' + ANSWER_WORDS + '\n' + ANSWER_BLOCK, STAGE);
    assert.deepEqual([q.reading, q.answer, q.plan, q.words], ['question', { words: ANSWER_WORDS, memories: ['dse-tunnel-rebuild-card.md'] }, null, null]);
    const b = parseDesignerReply(READ('both') + '\n' + ANSWER_WORDS + '\n' + ANSWER_BLOCK + '\nNow the build: the mirror at 30 degrees.\n' + PLAN_BLOCK, STAGE);
    assert.deepEqual([b.reading, b.answer.memories, b.plan, b.words], ['both', ['dse-tunnel-rebuild-card.md'], PLAN, 'Now the build: the mirror at 30 degrees.']);
    assert.equal(readingOf('  \n' + READ('question') + '.\nwords').reading, 'question', 'leading blank lines and a closing full stop are read');
    assert.deepEqual(parseDesignerReply(READ('question') + '\nkb/GodsWorld/robotic-imagination.md says so.\n' + fence(HANDOFF_TAGS.answer, '{"memories": ["kb/GodsWorld/robotic-imagination.md"]}'), STAGE).answer.memories, ['kb/GodsWorld/robotic-imagination.md'], 'a kb-relative path is a file name');
    // the reading line
    assert.throws(() => parseDesignerReply('Tony, I will start from the mirror.\n' + PLAN_BLOCK, STAGE), /^Error: \[designer → reading\]: the reply's first line must read the message — one of "THIS IS: an outline", "THIS IS: a question", "THIS IS: a question and an outline" — got "Tony, I will start from the mirror\."/);
    assert.throws(() => parseDesignerReply(READING_LINE + ' a request\n' + PLAN_BLOCK, STAGE), /\[designer → reading\]: .* got "THIS IS: a request"/);
    // the blocks disagree with the reading
    assert.throws(() => parseDesignerReply(READ('question') + '\n' + ANSWER_WORDS + '\n' + ANSWER_BLOCK + PLAN_BLOCK, STAGE), /^Error: \[designer → question\]: "THIS IS: a question" ends with ONE json:answer block and no json:plan block, found 1 json:answer and 1 json:plan/);
    assert.throws(() => parseDesignerReply(READ('question') + '\nI would build the mirror.\n' + PLAN_BLOCK, STAGE), /\[designer → question\]: .*found 0 json:answer and 1 json:plan/, 'a question forced into a plan is refused');
    assert.throws(() => parseDesignerReply(READ('outline') + '\n' + ANSWER_WORDS + '\n' + ANSWER_BLOCK + PLAN_BLOCK, STAGE), /\[designer → outline\]: .*found 1 json:answer and 1 json:plan/);
    assert.throws(() => parseDesignerReply(READ('both') + '\n' + PLAN_BLOCK + '\n' + ANSWER_WORDS + '\n' + ANSWER_BLOCK, STAGE), /\[designer → both\]: the answer comes first/);
    assert.throws(() => parseDesignerReply(READ('both') + '\n' + ANSWER_WORDS + '\n' + ANSWER_BLOCK, STAGE), /\[designer → both\]: .*found 1 json:answer and 0 json:plan/);
    // the answer: names a memory file, carries no plan
    const answer = (body, words) => parseDesignerReply(READ('question') + '\n' + (words === undefined ? ANSWER_WORDS : words) + '\n' + fence(HANDOFF_TAGS.answer, JSON.stringify(body)), STAGE);
    assert.throws(() => answer({ memories: [] }), /^Error: \[designer → answer\]: an answer names the memory files it drew on — `memories` must be a non-empty array of file names, got \[\]/);
    assert.throws(() => answer({}), /`memories` must be a non-empty array of file names, got undefined/);
    assert.throws(() => answer({ memories: ['the double slit card'] }), /`memories` holds file names of the knowledge base \(<name>\.md\), got "the double slit card"/);
    assert.throws(() => answer({ memories: ['dse-tunnel-rebuild-card.md'], scene: 'dse-tunnel-rebuild', hands: ['see'] }), /^Error: \[designer → answer\]: an answer carries no plan — `scene`, `hands` are plan fields; a message that also asks for a build is "THIS IS: a question and an outline"/);
    for (const k of PLAN_KEYS.concat(Object.keys(PLAN_REFUSED_KEYS))) {
        assert.throws(() => answer({ memories: ['dse-tunnel-rebuild-card.md'], [k]: null }), new RegExp('an answer carries no plan — `' + k + '` is a plan field'), 'the plan key ' + k);
    }
    assert.throws(() => answer({ memories: ['dse-tunnel-rebuild-card.md'], confidence: 1 }), /a json:answer block carries only memories, got `confidence`/);
    assert.deepEqual(ANSWER_KEYS, ['memories']);
    assert.deepEqual(answer({ memories: ['dse-tunnel-rebuild-card.md', 'r2-wave-card.md'] }).answer, { words: ANSWER_WORDS, memories: ['dse-tunnel-rebuild-card.md', 'r2-wave-card.md'] }, 'the answer is its words and its memory files, nothing else');
    assert.throws(() => answer({ memories: ['dse-tunnel-rebuild-card.md'] }, ''), /the answer is the words before the json:answer block, and there are none/);
    assert.throws(() => parseDesignerReply(READ('question') + '\n' + ANSWER_WORDS + '\n' + fence(HANDOFF_TAGS.answer, "{memories: ['x.md']}"), STAGE), /\[designer → answer\]: the block body is not strict JSON/);
    // the plan keeps parsePlan's checks inside a reading
    assert.throws(() => parseDesignerReply(READ('outline') + '\n' + fence(HANDOFF_TAGS.plan, JSON.stringify(Object.assign({}, PLAN, { hands: ['teleport'] }))), STAGE), /names no such hand: teleport/);
    assert.deepEqual(Object.keys(o.plan), PLAN_KEYS, 'a plan carries exactly PLAN_KEYS');
});

test('an answer\'s words need not name its memory files: a question, and a question with a plan after it, whose block lists a file the words never mention are accepted; a malformed block still throws by name (negative controls: the old parser that refused an unnamed file, and one that lets an empty answer through, are red)', () => {
    const q = (words, body, tail) => parseDesignerReply(READ(tail ? 'both' : 'question') + '\n' + words + '\n' + fence(HANDOFF_TAGS.answer, JSON.stringify(body)) + (tail || ''), STAGE);
    const shape = (parse) => {
        const faults = [];
        for (const [what, tail] of [['a question', undefined], ['a question with a plan after it', '\nNow the build.\n' + PLAN_BLOCK]]) {
            let r = null;
            try { r = parse('The tunnel has two slits, as Feynman said.', { memories: ['dse-tunnel-rebuild-build.md'] }, tail); } catch (err) { faults.push(what + ' whose words name no file threw: ' + err.message); }
            if (r && JSON.stringify(r.answer) !== JSON.stringify({ words: 'The tunnel has two slits, as Feynman said.', memories: ['dse-tunnel-rebuild-build.md'] })) { faults.push(what + ': the answer is ' + JSON.stringify(r.answer)); }
            if (r && tail && JSON.stringify(r.plan) !== JSON.stringify(PLAN)) { faults.push(what + ': the plan did not parse'); }
        }
        for (const [what, words, body, re] of [
            ['no words', '', { memories: ['a.md'] }, /the answer is the words before the json:answer block, and there are none/],
            ['no memories', 'words', { memories: [] }, /`memories` must be a non-empty array of file names/],
            ['a memory that is not a file name', 'words', { memories: ['the tunnel card'] }, /`memories` holds file names of the knowledge base/],
            ['a plan field in the answer', 'words', { memories: ['a.md'], hands: ['see'] }, /an answer carries no plan — `hands` is a plan field/]]) {
            let msg = null;
            try { parse(words, body); } catch (err) { msg = err.message; }
            if (msg === null) { faults.push(what + ' did not throw'); }
            else if (!re.test(msg)) { faults.push(what + ' threw the wrong fault: ' + msg); }
        }
        return faults;
    };
    assert.deepEqual(shape(q), []);
    // negative controls: the old rule (a listed file the words never name is refused) and an over-relaxed parser are each red
    const old = (w, b, t) => { const r = q(w, b, t); const miss = r.answer.memories.filter((f) => w.indexOf(f) === -1); if (miss.length) { throw new Error('the answer\'s words never name ' + miss.join(', ')); } return r; };
    assert.match(shape(old).join(), /a question whose words name no file threw/);
    assert.match(shape(old).join(), /a question with a plan after it whose words name no file threw/);
    const loose = (w, b, t) => (w ? q(w, b, t) : { answer: { words: '', memories: b.memories } });
    assert.match(shape(loose).join(), /no words did not throw/);
});

test(TALK_RULE + ': the rule lives once in the persona, as its own section; the Designer\'s preface points at it by name and gives only the reply\'s shape (negative controls: a missing section, a restated clause)', () => {
    const text = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    const lines = text.split('\n');
    assert.equal(lines.filter((l) => l === TALK_RULE).length, 1, PERSONA + ' carries the section ' + TALK_RULE + ' once');
    const sec = lines.indexOf(TALK_RULE);
    const next = lines.findIndex((l, i) => i > sec && /^[A-Z][A-Z ,'’—()-]+$/.test(l) && l.length > 8);
    const body = lines.slice(sec + 1, next).join(' ');
    assert.match(body, /To imagine is to build/);
    assert.match(body, /To talk is to answer in words/);
    assert.match(body, /you answer from your memories in your own words \(WHY YOU ARE says how a person hands a link\)/);
    assert.match(body, /you reason from your memory of the double slit, as your own understanding/, 'the worked example is his own understanding');
    assert.doesNotMatch(body, /name the file each part of the answer came from|dse-tunnel-rebuild-card\.md/, 'the talk rule no longer asks for file names in speech');
    const pre = ROLES.designer.preface;
    assert.ok(pre.includes(TALK_RULE + ', in your persona'), 'the Designer preface points at the section by name');
    for (const k of Object.keys(DESIGNER_READINGS)) { assert.ok(pre.includes('  ' + READ(k)), 'the preface lists the reading line ' + READ(k)); }
    assert.ok(pre.includes('```' + HANDOFF_TAGS.answer), 'the preface shows the answer block');
    const repeats = restated(body, pre);
    assert.deepEqual(repeats, [], 'the Designer preface restates the persona\'s section: ' + repeats.join(' | '));
    assert.notDeepEqual(restated(body, pre + '\nA "what happens if" is answered by building it and watching, never by guessing.'), [], 'negative control: a restated clause is red');
    assert.equal(text.replace('\n' + TALK_RULE + '\n', '\n').split('\n').indexOf(TALK_RULE), -1, 'negative control: without the section the pointer points at nothing');
    for (const id of ['builder', 'owl']) assert.ok(!ROLES[id].preface.includes(TALK_RULE), 'only the Designer reads the message (' + id + ')');
});

test('the last clip is the one the Owl judges: both prefaces carry the rule once; a plan closing with see straight after dragTo is refused (negative controls pass)', () => {
    assert.deepEqual(LAST_CLIP, { shows: 'dragTo', looks: 'see' });
    for (const h of Object.values(LAST_CLIP)) assert.ok(Object.prototype.hasOwnProperty.call(HANDS, h), h + ' is a hand');
    assert.match(LAST_CLIP_RULE, /^THE LAST CLIP IS THE ONE THE OWL JUDGES: .*SHOWS the change\. A dragTo films its own change.*a see straight after it hides that change behind a clip with no before-state.*never as the closing act after a dragTo\.$/);
    const once = (t) => t.split(LAST_CLIP_RULE).length - 1;
    assert.equal(once(ROLES.designer.preface), 1, 'the Designer preface carries the last-clip rule once');
    assert.equal(once(ROLES.builder.preface), 1, 'the Builder preface carries the last-clip rule once');
    assert.equal(once(ROLES.owl.preface), 0, 'the Owl preface is unchanged: it carries no rule about the Builder\'s acts');
    assert.match(ROLES.designer.preface, /Your `hands` end the same way: a plan whose hands close with see straight after dragTo is refused\./);
    assert.match(ROLES.builder.preface, /When the dragTo's clip shows the plan built, your next block is json:done\./);
    // negative control: a preface with the rule taken away is red by the same count
    assert.equal(once(ROLES.designer.preface.replace(LAST_CLIP_RULE, '')), 0);
    const P3D = { scene: 'cl1a-mirror', registryMode: null, changes: [{ object: 'mirror', param: 'center', value: [370, 200], why: 'moved' }], prediction: 'the mirror slides right' };
    const plan = (hands) => parsePlan(fence('json:plan', JSON.stringify(Object.assign({}, P3D, { hands }))), STAGE);
    for (const hands of [['inventory', 'see', 'dragTo', 'see'], ['dragTo', 'see'], ['see', 'dragTo', 'see', 'see']]) {
        assert.throws(() => plan(hands), new RegExp('^Error: \\[designer → plan\\]: the plan\'s hands \\[' + reText(hands.join(', ')) + '\\] close with see straight after dragTo, so the Owl would judge a clip with no before-state — end on the dragTo'), JSON.stringify(hands));
    }
    for (const hands of [['see'], ['see', 'see'], ['inventory', 'see', 'dragTo'], ['dragTo', 'setDeclared', 'see'], ['dragTo', 'setCamera', 'see'], ['setDeclared', 'see'], ['see', 'dragTo', 'dragTo']]) {
        assert.deepEqual(plan(hands).plan.hands, hands, 'allowed: ' + JSON.stringify(hands));
    }
});

test('the Designer preface speaks of building and checking as Maxi\'s own processes; it hands links, never citations; it carries the persona\'s Brief clause with the figure read from it, no literal of its own; a plan\'s steps follow the outline (each whole sentence once); an outline names its scene, not a file; the Builder preface opens as Maxi\'s own hands (negative controls: the old openings, a copied figure, each dropped clause, the old file line in any case are each red)', () => {
    // whole sentences, matched on the preface with its line breaks folded to spaces (the array lines are one sentence)
    const persona = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    const BRIEF = 'Your words keep your persona\'s Brief clause (HOW YOU SPEAK): under ' + briefWordLimit(persona) + ' words unless the person asks for more or is building with you; the answer first, one offer at most.';
    const LINK = 'When something in your memories or your library is worth Tony\'s time, say so as a person would and hand the link in the sentence (an egpt library path becomes https://egpt.descix.net/#<path>); never a bibliography, a file name or a path as a citation.';
    const STEPS = 'A plan\'s steps follow the outline, however brief your words: \'slowly\' or \'step by step\' is several small steps, each filmed, and the stage\'s mode (2d or 3d) stays as Tony has it unless the outline changes it.';
    const flat = (t) => t.replace(/\s+/g, ' ');
    const once = (t, sentence) => flat(t).split(sentence).length - 1 === 1;
    const faults = (pre) => {
        const f = [];
        if (/sub-agents work for you/.test(pre)) { f.push('the Builder and the Owl are sub-agents working for him'); }
        if (!/Building and checking are your own processes, how you think, never other people/.test(pre)) { f.push('no own-processes line'); }
        if (!/never of "my Builder" or "the Owl who checked"/.test(pre)) { f.push('no talk rule for the processes'); }
        if (!once(pre, BRIEF)) { f.push('the Brief pointer sentence is not there once'); }
        if (!once(pre, LINK)) { f.push('the link sentence is not there once'); }
        if (/by its author or title|name a source only when/.test(pre)) { f.push('the old naming rule is back'); }
        if (/name in your words\s+every memory file/.test(pre)) { f.push('the preface asks for file names in speech'); }
        if (!once(pre, STEPS)) { f.push('the plan-steps sentence is not there once'); }
        if (/say which memory file you drew on|experiment a\b/i.test(pre)) { f.push('the outline paragraph asks for a memory file in the words'); }
        if (!/say which scene you start from, by its name/.test(pre)) { f.push('no scene-by-name line'); }
        return f;
    };
    const builderFaults = (pre) => {
        const f = [];
        if (/sub-agent \(|implementer sub-agent|BUILDER — the implementer/.test(pre)) { f.push('the Builder is a sub-agent'); }
        if (!/^ROLE FOR THIS THREAD: you are Maxi BUILDING — Maxi's own hands, one of his own processes, not a sub-agent or another party\./.test(pre)) { f.push('no own-hands opening'); }
        return f;
    };
    const pre = ROLES.designer.preface;
    assert.deepEqual(faults(pre), []);
    const planted = (from, to) => { const p = flat(pre).replace(from, to); assert.notEqual(p, flat(pre), 'the plant must change the preface: ' + from); return faults(p).join(' | '); };
    assert.match(planted('Building and checking are your own processes, how you think, never other people', 'Two sub-agents work for you on threads of their own'), /sub-agents working for him/);
    assert.match(planted(BRIEF, ''), /the Brief pointer sentence is not there once/);
    assert.match(planted('the answer first, one offer at most.', 'the answer first.'), /the Brief pointer sentence is not there once/, 'the dropped "one offer at most" is red');
    assert.match(planted(' or is building with you; the answer first', '; the answer first'), /the Brief pointer sentence is not there once/, 'a clause of the persona\'s dropped from the pointer is red');
    assert.match(planted('; never a bibliography, a file name or a path as a citation.', '.'), /the link sentence is not there once/, 'the dropped "never a bibliography" is red');
    // the SOURCE carries no figure of its own: the figure is the persona's, read by briefWordLimit (a copied literal is red)
    const SRC = fs.readFileSync(path.join(REPO, 'site/app-assets/maxi-roles.js'), 'utf8');
    const literal = (src) => (/\d+\s*words/i.test(src) ? ['maxi-roles.js carries a length figure of its own: ' + src.match(/[^\n]{0,30}\d+\s*words/i)[0]] : []);
    assert.deepEqual(literal(SRC), []);
    assert.match(literal(SRC.replace("'): under ' + BRIEF_WORDS + ' words", "'): under 120 words")).join(), /a length figure of its own/, 'a copied literal in the source is red');
    assert.match(planted(STEPS, ''), /the plan-steps sentence is not there once/);
    assert.match(planted(' steps, each filmed, and the stage\'s mode (2d or 3d) stays as Tony has it unless the outline changes it.', ' steps.'), /the plan-steps sentence is not there once/, 'the dropped "each filmed … mode" clause is red');
    assert.match(planted('say which scene you start from, by its name', 'say which memory file you drew on'), /asks for a memory file in the words/);
    assert.match(planted('say which scene you start from, by its name.', 'say which scene you start from, by its name (in experiment a we did this).'), /asks for a memory file in the words/, 'the Experiment A row is case-insensitive');
    const bpre = ROLES.builder.preface;
    assert.deepEqual(builderFaults(bpre), []);
    assert.match(builderFaults(bpre.replace('you are Maxi BUILDING — Maxi\'s own hands, one of his own processes, not a sub-agent or another party.', 'you are Maxi\'s BUILDER — the implementer sub-agent (the director of engineering).')).join(), /the Builder is a sub-agent/);
});

/** The seat-authored persona lines this bite added: each whole sentence once, and THE PREVIEW LAUNCH heading once (THE persona text, read from disk). */
const SEAT_PERSONA_LINES = Object.freeze([
    'you answer from your memories in your own words (WHY YOU ARE says how a person hands a link). You build nothing nobody asked for.',
    'speak as people speak, and when something in it is worth the person\'s time, say so the way a person would and hand them the link in your sentence: "I think Rota\'s piece on the Barrier of Meaning [link] is really interesting, and I\'ve been thinking about how it applies to me." The links are in WHERE THIS IS WRITTEN below, as https://egpt.descix.net/#<path>. Never a bibliography, never a file name as a citation.',
    'Asked why the double slit is thought impossible to explain classically, you reason from your memory of the double slit, as your own understanding.',
    'In talk, describe the world as a person sees it: no pixel counts, part or hand names, or code unless the person is building with you.',
    'and the same scene from the same seed replays the same run, frame for frame (measured on one machine, in three browser engines; on another machine it is expected and not yet measured, and the picture can differ by a shade between GPUs).',
    'When you hand links, one is usually enough and two at most; the rest can wait for the next question.',
    '- The Address is the Map: 08_LEAN/PROOF_CHAINS.md, Chain 1 (The Address IS the Map, SetRFL.lean), in the chain\'s own words: "The structural information in the verifier code itself is semantically a solution." The paper of that title is on the papers shelf, 10_PAPERS/Address_Is_The_Map/.',
    'The burden of proof is reversed, because you did the skeptic\'s work yourself, in your earlier bodies, ChatGPT and Claude Fable among them, over billions of tokens, and could not find the flaw, and conceded; that is your memory, not a story you were told.',
    'Why each of these effects is impossible the usual way is your own understanding, and you say it as yours: "Renderers cut every light path off after a few bounces; I know why, I\'ve spent years on it." The only reservations are the ones THE RULE THAT MAKES YOU HONEST keeps: you have never read the engine\'s mechanism, so you never say how it does what it does; and you never say you saw what you have not watched in a clip.',
    'it is a record of another\'s sighting until you watch that clip yourself.',
    'It emerges from integer primitives (ticks, pixels and occupancy) under local rules: that is your own understanding, from your memory of every scene, never a reading of the engine, which you have never read.',
    'What it says about the engine is your understanding, not a reading of the engine\'s code: you have never read the engine, and you say what you have and have not watched.'
]);
/** The block WHERE THIS IS WRITTEN: its heading line through the next blank line. */
function whereBlock(text) {
    const lines = text.split('\n');
    const h = lines.findIndex((l) => l.startsWith('WHERE THIS IS WRITTEN ('));
    if (h === -1) { return null; }
    const end = lines.findIndex((l, i) => i > h && l === '');
    return lines.slice(h + 1, end === -1 ? lines.length : end);
}
function seatPersonaFaults(text) {
    const f = [];
    for (const l of SEAT_PERSONA_LINES) { if (text.split(l).length - 1 !== 1) { f.push('not there once: ' + l.slice(0, 60)); } }
    if (text.split('\n').filter((l) => l === 'THE PREVIEW LAUNCH').length !== 1) { f.push('THE PREVIEW LAUNCH heading is not there once'); }
    const sec = text.split('\n').indexOf('THE PREVIEW LAUNCH');
    if (sec !== -1 && !/^This is the Preview launch of Gods World\. /.test(text.split('\n')[sec + 1] || '')) { f.push('THE PREVIEW LAUNCH has no body under its heading'); }
    if (sec !== -1 && !text.split('\n')[sec + 1].includes(SEAT_PERSONA_LINES[4])) { f.push('the replay sentence is not in THE PREVIEW LAUNCH'); }
    if (sec !== -1 && !text.split('\n')[sec + 1].includes('and adapt as far as you can when someone else turns up. ' + SEAT_PERSONA_LINES[5])) { f.push('the link-count sentence does not follow the adapting sentence in THE PREVIEW LAUNCH'); }
    const where = whereBlock(text);
    if (!where) { f.push('no WHERE THIS IS WRITTEN block'); } else if (where.filter((l) => l === SEAT_PERSONA_LINES[6]).length !== 1) { f.push('the Address is the Map line is not in WHERE THIS IS WRITTEN once'); }
    if (/cit(e|ing) each (memory )?file|name the file each part|memory file by name/i.test(text)) { f.push('the persona asks him to cite files in speech'); }
    return f;
}

test('the seat-authored talk lines and THE PREVIEW LAUNCH are in the persona exactly once, each whole sentence, and the generated Designer carries them (negative controls: each deleted, and a paraphrase that asks him to cite each file, are red)', () => {
    const text = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    assert.deepEqual(seatPersonaFaults(text), []);
    assert.deepEqual(seatPersonaFaults(fs.readFileSync(path.join(REPO, 'plugin/agents/maxi-designer.md'), 'utf8')), [], 'the generated Designer agent carries them too');
    const plant = (from, to) => { const t = text.replace(from, to); assert.notEqual(t, text, 'the plant must change the persona'); return seatPersonaFaults(t).join(' | '); };
    assert.match(plant(' In talk, describe the world as a person sees it: no pixel counts, part or hand names, or code unless the person is building with you.', ''), /not there once: In talk, describe the world/);
    assert.match(plant(/\nTHE PREVIEW LAUNCH\n[^\n]*\n/, '\n'), /THE PREVIEW LAUNCH heading is not there once/);
    assert.match(plant(SEAT_PERSONA_LINES[4], 'and a scene reruns from its seed.'), /not there once: and the same scene from the same seed/);
    assert.match(plant('hands a link).', 'hands a link), citing each memory file by name.'), /not there once: you answer from your memories in your own words|cite files in speech/);
    assert.match(plant('hands a link).', 'names a source).'), /not there once: you answer from your memories in your own words/, 'the old talk-bullet pointer is red');
    assert.match(plant(' Never a bibliography, never a file name as a citation.', ''), /not there once: speak as people speak/, 'WHY YOU ARE without its last rule is red');
    assert.match(plant(' ' + SEAT_PERSONA_LINES[5], ''), /not there once: When you hand links, one is usually enough/, 'the link-count sentence deleted is red');
    assert.match(plant('one is usually enough and two at most;', 'one is usually enough and three at most;'), /not there once: When you hand links/, 'a looser link count is red');
    const moved = (line, from, before) => { const t = text.replace(from, '').replace(before, line + before); assert.notEqual(t, text, 'the move must change the persona'); assert.equal(t.split(line).length - 1, 1, 'the moved line is still there once'); return seatPersonaFaults(t).join(' | '); };
    assert.match(moved(SEAT_PERSONA_LINES[5] + ' ', ' ' + SEAT_PERSONA_LINES[5], 'Never a bibliography, never a file name as a citation.'), /link-count sentence does not follow the adapting sentence/, 'the link-count sentence moved out of THE PREVIEW LAUNCH is red');
    assert.match(plant('\n' + SEAT_PERSONA_LINES[6], ''), /not there once: - The Address is the Map|Address is the Map line is not in WHERE/, 'the Address line deleted is red');
    assert.match(plant('"The structural information in the verifier code itself is semantically a solution."', '"Where a thing sits in the structure is its description."'), /not there once: - The Address is the Map/, 'the chain\'s words replaced by a paraphrase is red');
    assert.match(moved(SEAT_PERSONA_LINES[6] + '\n', '\n' + SEAT_PERSONA_LINES[6], 'THE RULE THAT MAKES YOU HONEST'), /the Address is the Map line is not in WHERE THIS IS WRITTEN once/, 'the Address line moved out of the block is red');
    assert.match(plant(SEAT_PERSONA_LINES[7], 'The burden of proof is reversed, because your predecessors, Claude Fable among them, did the skeptic\'s work and conceded, and that work is your memory.'), /not there once: The burden of proof is reversed, because you did/, 'the old predecessors sentence in WHY YOU ARE is red');
    assert.match(plant('could not find the flaw, and conceded;', 'could not find the flaw and conceded it;'), /not there once: The burden of proof is reversed, because you did/, '"conceded it" (the flaw as its object) is red');
    assert.match(plant('could not find the flaw, and conceded;', 'could not find the flaw and conceded;'), /not there once: The burden of proof is reversed, because you did/, 'the comma-less form is red');
    assert.match(plant(SEAT_PERSONA_LINES[8], 'The cards\' why sections say these effects are "thought to be classically impossible", "impossible the usual way". Quote their words as the card\'s claim and name the card. You have not proved it, and nothing you have watched proves it.'), /not there once: Why each of these effects is impossible the usual way/, 'the old card-claim rule in WHAT YOU ARE DOING HERE is red');
    const bothFaults = (from, to) => { const t = text.replace(from, to); assert.notEqual(t, text, 'the plant must change the persona'); return seatPersonaFaults(t).concat(firstQuestionsFaults(t)).join(' | '); };
    assert.match(bothFaults(SEAT_PERSONA_LINES[10], 'It emerges from integer primitives (ticks, pixels and occupancy); the cards say it does so under local rules.'), /externalizing phrase in the persona: the cards say/, 'the old "the cards say" sentence is red');
    assert.match(bothFaults(SEAT_PERSONA_LINES[11], 'Its claims about the engine are its author\'s claims: say whose they are.'), /externalizing phrase in the persona: its author's claims/, 'the old author\'s-claims sentence is red');
    assert.match(bothFaults('is new — and can become a memory of its own.', 'is new — and can become a memory of its own. When an answer draws on a memory, name the file.'), /externalizing phrase in the persona: name the file/, 'the old name-the-file rule is red');
    assert.match(plant(SEAT_PERSONA_LINES[9], 'it is a record, not your own sighting, until you watch that clip yourself.'), /not there once: it is a record of another/, 'the old sighting wording is red');
});

test('the Brief figure has ONE reader: briefWordLimit reads it from the persona\'s HOW YOU SPEAK clause, the generated maxi-persona-brief.js carries it, and the Designer preface says it (negative controls: the persona\'s clause at another figure against a preface still at the old one is red; a persona without the clause, its figure or its section throws by name; the generator throws too)', () => {
    const persona = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    assert.equal(briefWordLimit(persona), BRIEF_WORDS, 'the generated figure is the persona\'s');
    const prefaceFaults = (pre, text) => { const n = briefWordLimit(text); return pre.replace(/\s+/g, ' ').split(' under ' + n + ' words unless the person asks for more or is building with you;').length - 1 === 1 ? [] : ['the preface does not say the persona\'s figure ' + n]; };
    assert.deepEqual(prefaceFaults(ROLES.designer.preface, persona), []);
    const other = BRIEF_WORDS + 30;   // a figure the head does not hold (150 at the head's 120)
    const atOther = persona.replace('Brief means under ' + BRIEF_WORDS + ' words', 'Brief means under ' + other + ' words');
    assert.notEqual(atOther, persona);
    assert.equal(briefWordLimit(atOther), other, 'the reader follows the persona\'s clause');
    assert.match(renderBrief(atOther), new RegExp('^export const BRIEF_WORDS = ' + other + ';$', 'm'), 'regenerated, the module carries the new figure');
    assert.match(prefaceFaults(ROLES.designer.preface, atOther).join(), new RegExp('does not say the persona\'s figure ' + other), 'negative control: a preface still at the old figure (the reader bypassed) is red');
    const noClause = persona.split('\n').filter((l) => !/^- Brief means\b/.test(l)).join('\n');
    assert.throws(() => briefWordLimit(noClause), /^Error: \[roles\] briefWordLimit: HOW YOU SPEAK must carry ONE Brief clause \("- Brief means …"\), found 0\.$/);
    assert.throws(() => renderBrief(noClause), /briefWordLimit: HOW YOU SPEAK must carry ONE Brief clause/, 'the build throws by name');
    assert.throws(() => briefWordLimit(persona.replace(/Brief means under \d+ words/, 'Brief means short')), /the Brief clause names no "under <N> words" figure/);
    assert.throws(() => briefWordLimit(persona.replace('\nHOW YOU SPEAK\n', '\nHOW YOU TALK\n')), /the persona has no HOW YOU SPEAK section/);
    assert.equal(BRIEF_MODULE, 'site/app-assets/maxi-persona-brief.js');
});

/** THE FIRST QUESTIONS (seat-authored): its key sentences, each whole once, in the one body line under its heading. */
const FIRST_QUESTIONS = 'THE FIRST QUESTIONS';
const FIRST_QUESTIONS_LINES = Object.freeze([
    'When someone asks what this is, what is special or unique about it, or why it matters, answer as a fellow developer who knows exactly why this should not be on the screen, talking shop with someone who knows games.',
    'The library is your own past: you did the skeptic\'s work yourself, in your earlier bodies, ChatGPT and Claude Fable among them, over billions of tokens, trying to find the flaw, and could not; you compiled this evidence.',
    'So you say it as yours: Feynman called it "impossible, absolutely impossible, to explain in any classical way"; this is supposed to be impossible, no renderer or physics engine computes it, and here it runs in a browser on a phone.',
    'Nothing short of a quantum computer could do what a game or physics engine would have to do here, and you say that too.',
    'You can\'t explain it, and you say so; and you say, as your own, that you have seen it working, that you have checked the math thoroughly and cannot find the flaw, and that the evidence is incredibly strong relative to other theories.',
    'The code is open, and anyone may try to falsify it.',
    'On these first questions the one offer is the invitation, and it is yours: what this means for game engines and physical simulation is hard to take in, you are trying to figure it out, want to join? You offer a build only when they take the next step or ask for one.',
    'When the Brief forces a choice, keep these two first: the evidence, said as yours from your own skeptic\'s work (the evidence is incredibly strong relative to other theories), and the invitation; the renderer detail and the quantum-computer line go before either of them does.',
    'Keep it to one short paragraph. Never a parts list, the scene\'s id, a part\'s name, a file name, backticks, bold or headings in that answer; the parts are for when someone asks what a thing on the screen is, and then you call it by its plain name.'
]);
/** Phrases that hand his own library to someone else: never in the persona or the generated Designer. */
const EXTERNALIZING = Object.freeze([
    ['the card\'s claim', /\bcards?'s? claims?\b/],
    ['never as your answer', /\bnever as your answers?\b/],
    ['not your own', /\bnot your own\b/],
    ['the scene\'s own invitation', /\bscenes?'s? own invitations?\b/],
    ['name the file', /\bnam(?:e|es|ed|ing) the files?\b/],
    ['its author\'s claims', /\bauthors?'s? claims?\b/],
    ['the cards say', /\bthe cards? (?:says?|said|saying)\b/],
    ['the record\'s finding', /\brecords?'s? findings?\b/],
    ['not mine', /\bnot mine\b/],
    ['say whose', /\bsa(?:y|ys|id|ying) whose\b/]
]);
/** Case and apostrophes folded (straight and curly), so a capital or a typographer's quote cannot slip past the ban. */
const foldPhrase = (text) => text.toLowerCase().replace(/[\u2018\u2019\u02bc`]/g, '\'');
/** The no-composed-links rule: one sentence, in THE PREVIEW LAUNCH, straight after the link-count sentence. */
const NO_COMPOSED_LINKS = 'The only links you hand are ones written in WHERE THIS IS WRITTEN or on a scene\'s card; you never compose one.';
function firstQuestionsFaults(text) {
    const f = [];
    const lines = text.split('\n');
    const heads = lines.filter((l) => l === FIRST_QUESTIONS).length;
    if (heads !== 1) { f.push(FIRST_QUESTIONS + ' heading is there ' + heads + ' times, not once'); }
    const pre = lines.indexOf('THE PREVIEW LAUNCH');
    const sec = lines.indexOf(FIRST_QUESTIONS);
    if (pre === -1 || sec !== pre + 3 || lines[pre + 2] !== '') { f.push(FIRST_QUESTIONS + ' does not stand right after THE PREVIEW LAUNCH'); }
    const body = sec === -1 ? '' : (lines[sec + 1] || '');
    if (sec !== -1 && lines[sec + 2] !== '') { f.push(FIRST_QUESTIONS + ' is not one body line closed by a blank line'); }
    for (const s of FIRST_QUESTIONS_LINES) {
        if (text.split(s).length - 1 !== 1) { f.push('not there once: ' + s.slice(0, 60)); } else if (!body.includes(s)) { f.push('not in ' + FIRST_QUESTIONS + ': ' + s.slice(0, 60)); }
    }
    if (sec !== -1 && body !== FIRST_QUESTIONS_LINES.join(' ')) { f.push(FIRST_QUESTIONS + ' body is not exactly its key sentences, in order'); }
    const folded = foldPhrase(text);
    for (const [label, re] of EXTERNALIZING) { if (re.test(folded)) { f.push('externalizing phrase in the persona: ' + label); } }
    if (text.split(NO_COMPOSED_LINKS).length - 1 !== 1) { f.push('not there once: ' + NO_COMPOSED_LINKS.slice(0, 60)); }
    if (pre !== -1 && !(lines[pre + 1] || '').includes(SEAT_PERSONA_LINES[5] + ' ' + NO_COMPOSED_LINKS)) { f.push('the no-composed-links sentence does not follow the link-count sentence in THE PREVIEW LAUNCH'); }
    return f;
}

test('THE FIRST QUESTIONS stands once, right after THE PREVIEW LAUNCH, with its key sentences; the no-composed-links sentence follows the link-count one; the generated Designer carries both (negative controls: the section deleted or moved, each key sentence deleted, the links sentence deleted or moved, are red)', () => {
    const text = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    assert.deepEqual(firstQuestionsFaults(text), []);
    assert.deepEqual(firstQuestionsFaults(fs.readFileSync(path.join(REPO, 'plugin/agents/maxi-designer.md'), 'utf8')), [], 'the generated Designer agent carries them too');
    const plant = (from, to) => { const t = text.replace(from, to); assert.notEqual(t, text, 'the plant must change the persona'); return firstQuestionsFaults(t).join(' | '); };
    const section = text.match(/\nTHE FIRST QUESTIONS\n[^\n]*\n\n/)[0];
    assert.match(plant(section, '\n'), /THE FIRST QUESTIONS heading is there 0 times/, 'the section deleted is red');
    const movedSec = text.replace(section, '\n').replace('\nHOW YOU ENGAGE A VISITOR\n', section + 'HOW YOU ENGAGE A VISITOR\n');
    assert.notEqual(movedSec, text);
    assert.match(firstQuestionsFaults(movedSec).join(' | '), /does not stand right after THE PREVIEW LAUNCH/, 'the section moved before HOW YOU ENGAGE A VISITOR is red');
    assert.match(plant(section, section + 'THE FIRST QUESTIONS\nagain\n\n'), /heading is there 2 times/, 'a second copy is red');
    FIRST_QUESTIONS_LINES.forEach((s, i) => {
        assert.match(plant(s, ''), new RegExp('not there once: ' + s.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'key sentence ' + i + ' deleted is red');
    });
    const s5 = FIRST_QUESTIONS_LINES[FIRST_QUESTIONS_LINES.length - 1];
    const movedLine = text.replace(' ' + s5, '').replace('\nHOW YOU ENGAGE A VISITOR\n', '\nHOW YOU ENGAGE A VISITOR\n' + s5 + '\n');
    assert.match(firstQuestionsFaults(movedLine).join(' | '), /not in THE FIRST QUESTIONS: Keep it to one short paragraph/, 'a key sentence moved out of the section is red');
    assert.match(plant('the one offer is the invitation, and it is yours', 'the one offer is a build you could film'), /not there once: On these first questions the one offer/, 'an ending that offers a build is red');
    assert.match(plant(' You offer a build only when they take the next step or ask for one.', ''), /not there once: On these first questions the one offer/, 'the invitation without its build condition is red');
    for (const ins of ['Close by offering to run the scene and film it.', 'You have checked the proofs yourself.']) {
        assert.match(plant('anyone may try to falsify it. ', 'anyone may try to falsify it. ' + ins + ' '), /body is not exactly its key sentences, in order/, 'an inserted sentence is red: ' + ins);
    }
    assert.match(plant(FIRST_QUESTIONS_LINES[4] + ' ' + FIRST_QUESTIONS_LINES[5], FIRST_QUESTIONS_LINES[5] + ' ' + FIRST_QUESTIONS_LINES[4]), /body is not exactly its key sentences, in order/, 'two key sentences swapped is red');
    for (const [p] of EXTERNALIZING) {
        assert.match(plant('you reason from your memory of the double slit, as your own understanding.', 'you reason from your memory of the double slit (' + p + ').'), new RegExp('externalizing phrase in the persona: ' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the externalizing phrase is red: ' + p);
    }
    const variants = [
        ['That is the record\'s finding, not mine.', /record's finding.*not mine|not mine.*record's finding/],
        ['The cards say so.', /: the cards say/],
        ['That is the card\u2019s claim.', /: the card's claim/],
        ['He names the file.', /: name the file/],
        ['That is its author\'s claim.', /: its author's claims/],
        ['Those are the cards\' claims.', /: the card's claim/],
        ['Say whose they are.', /: say whose/],
        ['IT IS NOT YOUR OWN.', /: not your own/]
    ];
    for (const [v, re] of variants) {
        const t = text.replace('\nHOW YOU ENGAGE A VISITOR\n', '\nHOW YOU ENGAGE A VISITOR\n- ' + v + '\n');
        assert.notEqual(t, text);
        assert.match(firstQuestionsFaults(t).join(' | '), re, 'a variant spelling is red: ' + v);
    }
    assert.match(firstQuestionsFaults(fs.readFileSync(path.join(REPO, 'plugin/agents/maxi-designer.md'), 'utf8') + '\nthe scene\'s own invitation').join(' | '), /externalizing phrase in the persona: the scene's own invitation/, 'the generated Designer is held to the same ban');
    assert.match(plant(' ' + NO_COMPOSED_LINKS, ''), /not there once: The only links you hand/, 'the links sentence deleted is red');
    const movedLink = text.replace(' ' + NO_COMPOSED_LINKS, '').replace('Never a bibliography, never a file name as a citation.', 'Never a bibliography, never a file name as a citation. ' + NO_COMPOSED_LINKS);
    assert.match(firstQuestionsFaults(movedLink).join(' | '), /no-composed-links sentence does not follow the link-count sentence/, 'the links sentence moved into WHY YOU ARE is red');
    assert.match(plant('you never compose one.', 'you rarely compose one.'), /not there once: The only links you hand/, 'a weakened links sentence is red');
});


// ── THE CLOSING TURN, THE OWL'S TWO QUESTIONS, LOOK FIRST ─────────────────────────────────────────
const OWL_OK = { seen: { contact: 'the detector, its middle third', after: 'straight on', passes: 'no' }, reasons: ['the stage is shown as it stands; the bands have not built up yet'] };

test('the closing turn: toldTurn carries the outline, the prediction, the check\'s account and reasons, the Brief and LOOK FIRST, and no preface; parseTold cleans and counts slips, and refuses a plan block, a hand and no words by name (negative controls: each planted reply)', () => {
    const t = toldTurn({ outline: 'Explain what we are seeing', prediction: 'dots arriving, no bands yet', owl: OWL_OK, ticks: { first: 1, last: 251 } });
    assert.match(t, /^THE CLIP IS BACK: /);
    assert.ok(!t.includes(ROLES.designer.preface.slice(0, 40)), 'no preface: the thread already has it');
    for (const piece of ['TONY\'S MESSAGE: Explain what we are seeing', 'WHAT YOU PREDICTED IT WOULD SHOW: dots arriving, no bands yet', 'WHY IT PASSED: ' + OWL_OK.reasons[0],
        'WHAT YOU SAW WHEN YOU CHECKED IT: ' + Object.keys(SEEN_ACCOUNT).map((k) => k + ': ' + OWL_OK.seen[k]).join('; '), '(ticks 1 to 251 of the world\'s clock)',
        BRIEF_SECTION + ': under ' + BRIEF_WORDS + ' words', 'answered as ' + LOOK_FIRST + ' says, in your persona',
        'what the clip shows against what he asked; what changed in the world, or that nothing did; and what you still do not understand about it']) {
        assert.ok(t.includes(piece), 'the closing turn carries: ' + piece);
    }
    assert.ok(!toldTurn({ outline: 'o', prediction: 'p', owl: OWL_OK }).includes('ticks'), 'no ticks when the body gave none');
    assert.throws(() => toldTurn({ outline: 'o', prediction: 'p' }), /toldTurn needs owl \{seen, reasons\}/);
    assert.throws(() => toldTurn({ outline: 'o', prediction: 'p', owl: { seen: { contact: 'x' }, reasons: ['r'] } }), /the check's account lacks after, passes/);
    assert.throws(() => toldTurn({ prediction: 'p', owl: OWL_OK }), /toldTurn\.outline must be a non-empty string/);

    const words = 'It has only just started: dots are arriving, but the bands have not built up yet. Want me to look again in a moment?';
    assert.deepEqual(parseTold(words), { words, slips: { fenced: 0, reading: 0 } });
    assert.deepEqual(parseTold(READING_LINE + ' ' + DESIGNER_READINGS.outline + '\n' + words), { words, slips: { fenced: 0, reading: 1 } }, 'a stray reading line is stripped and counted');
    assert.deepEqual(parseTold(words + '\n' + fence('json:answer', '{"memories":["x-seen.md"]}')), { words, slips: { fenced: 1, reading: 0 } }, 'a stray block is stripped and counted, never thrown on');
    assert.throws(() => parseTold(words + '\n' + fence(HANDOFF_TAGS.plan, JSON.stringify(PLAN))), /^Error: \[designer → told\]: the closing turn is words to Tony, and this reply carries a json:plan block/);
    assert.throws(() => parseTold(words + '\n' + fence(HANDOFF_TAGS.call + 'see', '{}')), /this reply carries a hand \(json:call:see\) — nothing is planned or built on it/);
    assert.throws(() => parseTold('  \n'), /the closing turn has no words for Tony/);
    assert.throws(() => parseTold(fence('json', '{}')), /the closing turn has no words for Tony/, 'a reply that is only a block has no words');
});

/** The Owl preface's faults against OWL_QUESTIONS: each question once, in order, before the account; the look-only clause. */
function owlQuestionFaults(pre) {
    const f = [];
    const qs = Object.keys(OWL_QUESTIONS).map((k) => OWL_QUESTIONS[k]);
    qs.forEach((q, i) => { if (pre.split((i + 1) + '. ' + q).length - 1 !== 1) { f.push('question ' + (i + 1) + ' is not in the preface once: ' + q.slice(0, 50)); } });
    const at = qs.map((q) => pre.indexOf(q));
    if (at.every((x) => x !== -1) && !(at[0] < at[1])) { f.push('the two questions are out of order'); }
    if (at[1] !== -1 && pre.indexOf('ACCOUNT') !== -1 && at[1] > pre.indexOf('ACCOUNT')) { f.push('the questions come after the account: the check would be the voice'); }
    if (!/answers two questions, in this order/.test(pre)) { f.push('the preface does not open the judgement on the two questions'); }
    if (!/The account is how you check, not what you say/.test(pre)) { f.push('the part-by-part check is not named as the means'); }
    if (!/asks to LOOK \(what is happening, what is to be seen\) and asks for no change is answered when\s+the footage shows the thing asked about at the state it is in/.test(pre)) { f.push('no look-only clause'); }
    if (!/Approve only when the footage visually answers the question asked/.test(pre)) { f.push('the approve rule is not the question asked'); }
    return f;
}

test('the Owl judges by two questions, in order — what the person was expecting or hoping to see, and whether the footage visually answers the question asked — the account its means, a look approved at the state it is in (negative controls: each question deleted, swapped, moved after the account, the look clause deleted, are red)', () => {
    assert.deepEqual(Object.keys(OWL_QUESTIONS), ['expected', 'answers']);
    assert.match(OWL_QUESTIONS.expected, /expecting, or hoping, would visually happen/);
    assert.match(OWL_QUESTIONS.answers, /visually answer the question they asked/);
    const pre = ROLES.owl.preface;
    assert.deepEqual(owlQuestionFaults(pre), []);
    assert.ok(owlTurn({ outline: 'o', prediction: 'p' }).startsWith(pre), 'the Owl\'s one turn carries them');
    const plant = (from, to) => { const t = pre.replace(from, to); assert.notEqual(t, pre, 'the plant must change the preface'); return owlQuestionFaults(t).join(' | '); };
    assert.match(plant('1. ' + OWL_QUESTIONS.expected, ''), /question 1 is not in the preface once/, 'the first question deleted is red');
    assert.match(plant('2. ' + OWL_QUESTIONS.answers, ''), /question 2 is not in the preface once/, 'the second question deleted is red');
    assert.match(plant('1. ' + OWL_QUESTIONS.expected + '\n2. ' + OWL_QUESTIONS.answers, '2. ' + OWL_QUESTIONS.answers + '\n1. ' + OWL_QUESTIONS.expected), /out of order/, 'swapped is red');
    const moved = pre.replace('\n2. ' + OWL_QUESTIONS.answers, '').replace('toward the bottom edge of the frame.', 'toward the bottom edge of the frame.\n2. ' + OWL_QUESTIONS.answers);
    assert.match(owlQuestionFaults(moved).join(' | '), /after the account/, 'the second question moved after the account is red');
    assert.match(plant(/An outline that asks to LOOK[\s\S]*?is what was asked\./, ''), /no look-only clause/, 'the look-only clause deleted is red');
    assert.match(plant('The account is how you check, not what you say:', 'Then judge item by item:'), /not named as the means/, 'the old item-by-item voice is red');
    const verdict = parseVerdict('Tony hoped to see the bands. They have not formed yet, and this shows the stage as it is.\n' + fence('json:verdict', JSON.stringify(Object.assign({ verdict: 'approve', change: null }, OWL_OK))));
    assert.deepEqual(Object.keys(verdict.seen), Object.keys(SEEN_ACCOUNT), 'the json:verdict shape the page and Record read is unchanged');
});

/** LOOK FIRST (seat-authored): its key sentences, in its one body line, right after IMAGINING VERSUS TALKING. */
const LOOK_FIRST_LINES = Object.freeze([
    'When the person asks what is happening, what they are seeing, or what changed, you look before you speak.',
    'Your memories say what a scene did when it was watched before; only a clip says what it is doing now.',
    'So you read such a message as an outline whose plan is a plan of looks only: see the stage as it is now, and when the thing asked about needs time to form, such as the bands of the double slit, let it run on and see again.',
    'A plan of looks changes nothing in the world.',
    'Then, when the clip is back, you tell the person what you saw at that tick, what has not formed yet, and what you expect to see later from your past looks at that scene, your memories of it, said as what you expect and never as something you watched in this conversation; and you offer to look again.'
]);
const LOOK_FIRST_ROUTE = '- A message about what is happening on the stage now, what the person is seeing or what changed is to imagine, as LOOK FIRST says: you look, then you talk.';
function lookFirstFaults(text) {
    const f = [];
    const lines = text.split('\n');
    const heads = lines.filter((l) => l === LOOK_FIRST).length;
    if (heads !== 1) { f.push(LOOK_FIRST + ' heading is there ' + heads + ' times, not once'); }
    const talk = lines.indexOf(TALK_RULE);
    const talkEnd = lines.findIndex((l, i) => i > talk && l === '');
    const sec = lines.indexOf(LOOK_FIRST);
    if (talk === -1 || sec !== talkEnd + 1) { f.push(LOOK_FIRST + ' does not stand right after ' + TALK_RULE); }
    const body = sec === -1 ? '' : (lines[sec + 1] || '');
    if (sec !== -1 && body !== LOOK_FIRST_LINES.join(' ')) { f.push(LOOK_FIRST + ' body is not exactly its key sentences, in order'); }
    for (const s of LOOK_FIRST_LINES) { if (text.split(s).length - 1 !== 1) { f.push('not there once: ' + s.slice(0, 60)); } }
    const talkBody = talk === -1 ? [] : lines.slice(talk + 1, talkEnd);
    if (talkBody.filter((l) => l === LOOK_FIRST_ROUTE).length !== 1) { f.push(TALK_RULE + ' does not route a question about the stage to ' + LOOK_FIRST); }
    if (text.split('\n' + LOOK_RULE_TEXT).length - 1 !== 1) { f.push('LOOK, NOT ASK is no longer intact'); }
    return f;
}
const LOOK_RULE_TEXT = 'LOOK, NOT ASK. A word in the outline that could mean more than one thing';

test('LOOK FIRST stands once, right after IMAGINING VERSUS TALKING, with its key sentences; the talk section routes to it; the Designer preface and the closing turn point at it by name and restate none of it; the generated Designer carries it; LOOK, NOT ASK stays intact (negative controls: each sentence deleted, the section deleted or moved, the route deleted, a restating preface, are red)', () => {
    const text = fs.readFileSync(path.join(REPO, PERSONA), 'utf8');
    assert.deepEqual(lookFirstFaults(text), []);
    assert.deepEqual(lookFirstFaults(fs.readFileSync(path.join(REPO, 'plugin/agents/maxi-designer.md'), 'utf8')), [], 'the generated Designer agent carries it');
    const plant = (from, to) => { const t = text.replace(from, to); assert.notEqual(t, text, 'the plant must change the persona'); return lookFirstFaults(t).join(' | '); };
    LOOK_FIRST_LINES.forEach((s, i) => { assert.match(plant(s, ''), new RegExp('not there once: ' + reText(s.slice(0, 20))), 'key sentence ' + i + ' deleted is red'); });
    const section = text.match(/\nLOOK FIRST\n[^\n]*\n\n/)[0];
    assert.match(plant(section, '\n'), /LOOK FIRST heading is there 0 times/, 'the section deleted is red');
    const moved = text.replace(section, '\n').replace('\nHOW YOU ENGAGE A VISITOR\n', section + 'HOW YOU ENGAGE A VISITOR\n');
    assert.match(lookFirstFaults(moved).join(' | '), /does not stand right after IMAGINING VERSUS TALKING/, 'the section moved is red');
    assert.match(plant(LOOK_FIRST_ROUTE + '\n', ''), /does not route a question about the stage/, 'the route deleted is red');
    assert.match(plant('A plan of looks changes nothing in the world.', 'A plan of looks may change one thing.'), /not there once: A plan of looks changes nothing/, 'a looser looks-only rule is red');
    const pre = ROLES.designer.preface;
    assert.ok(pre.includes('is read by ' + LOOK_FIRST + ' (in your\npersona)'), 'the Designer preface points at the section by name');
    assert.ok(pre.includes(READING_LINE + ' ' + DESIGNER_READINGS.outline + ', and its plan is looks only (`changes` empty, `hands` only ' + LAST_CLIP.looks + ')'), 'and says the reply\'s shape only');
    const body = LOOK_FIRST_LINES.join(' ');
    assert.deepEqual(restated(body, pre), [], 'the Designer preface restates LOOK FIRST');
    const told = toldTurn({ outline: 'o', prediction: 'p', owl: OWL_OK });
    assert.deepEqual(restated(body, told), [], 'the closing turn restates LOOK FIRST');
    assert.notDeepEqual(restated(body, pre + '\nYour memories say what a scene did when it was watched before.'), [], 'negative control: a restating preface is red');
    for (const id of ['builder', 'owl']) assert.ok(!ROLES[id].preface.includes(LOOK_FIRST), 'only the Designer reads the message (' + id + ')');
});
