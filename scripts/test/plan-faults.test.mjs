/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * plan-faults.test.mjs — the plan against the Record, in code: site/app-assets/maxi-record-folder.js recordPlanFaults
 * (the Owl never sees the plan; it gets the outline, the prediction and the footage).
 *
 * Gates, each with its negative control:
 *   1. conformance: the plan is read from lab.json through the owner's PLAN_KEY (one of LOOP_LAB_KEYS), and the plan
 *      maxi-roles.js parsePlan makes of the same json:plan block gives the same answer as the one lab.json holds;
 *   2. the two trial rounds state their plans: the fixture record-mmp41d as its chain [record-01, record-02] and as a chain
 *      of one (the hand-back), and the published site/memories/mm-dse-tunnel-rebuild-p41c ([files]) answer [] — the green controls;
 *   3. each refusal, planted alone, is red BY ITS OWN NAME and green again restored: a plan change no row's `to` holds
 *      (a setDeclared value, a planned centre the rect move does not reach); a row on a part the plan never mentions; a
 *      plan value parts.after.json does not hold; a planned rect for a centre-placed part; a plan that is not parsePlan's;
 *   4. the CHAIN: a plan change stated by a row in an earlier Record passes; an unplanned row in an earlier Record is red
 *      naming it; the hand-back's parts.after.json, never an earlier one's, must hold the plan; a bare tree is refused;
 *   5. an act beyond the plan (a setDeclared key or a move the plan does not name for a planned part; a remove; a fork) is red;
 *      an add of a planned part is not (its arrival; its props state the planned value), and the same add unplanned is red;
 *   6. a planned centre against a rect's centre: 0.5 px per axis passes, 0.6 px fails (RECT_CENTER_SLACK).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordPlanFaults, planOf, PLAN_KEY, LOOP_LAB_KEYS, FILES, MOVE, CHANGE_KEYS, RECT_CENTER_SLACK, recordFolderFaults } from '../../site/app-assets/maxi-record-folder.js';
import { parsePlan, emptyStage, HANDOFF_TAGS } from '../../site/app-assets/maxi-roles.js';
import { readRecordFolder } from '../../minimaxi/record-folder.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MMP41D = path.join(REPO, 'scripts', 'test', 'fixtures', 'record-mmp41d', 'record', 'record-02');
const P41C = path.join(REPO, 'site', 'memories', 'mm-dse-tunnel-rebuild-p41c');

const enc = (v) => new TextEncoder().encode(JSON.stringify(v, null, 2) + '\n');
const dec = (b) => JSON.parse(typeof b === 'string' ? b : new TextDecoder().decode(b));
/** A copy of a folder tree with one JSON file rewritten by `edit(parsed)`. */
function withJson(files, name, edit) { const v = dec(files[name]); edit(v); return Object.assign({}, files, { [name]: enc(v) }); }
/** Which arms a fault list fired: a fault names its arm in words the owner writes. */
function arms(faults) {
    return {
        row: faults.some((f) => /has no change row on .* in the chain/.test(f)),
        after: faults.some((f) => /: record-\d\d\/parts\.after\.json (holds|has no part)/.test(f)),
        unplanned: faults.some((f) => /is on a part the plan never mentions/.test(f)),
        beyond: faults.some((f) => /acts beyond the plan/.test(f))
    };
}

test('conformance: the plan rides lab.json under PLAN_KEY (one of LOOP_LAB_KEYS); parsePlan\'s plan of the same block answers the same (negative control: a folder with no plan is refused by name)', () => {
    assert.ok(LOOP_LAB_KEYS.includes(PLAN_KEY), 'PLAN_KEY is not one of LOOP_LAB_KEYS');
    const files = readRecordFolder(MMP41D);
    assert.deepEqual(recordFolderFaults(files), [], 'the fixture hand-back Record is a complete §6 Record');
    const plan = planOf(files);
    assert.deepEqual(plan, dec(files[FILES.lab])[PLAN_KEY]);
    // the plan as the owner of its shape makes it (maxi-roles.js parsePlan), from the same json:plan block
    const reply = 'words\n```' + HANDOFF_TAGS.plan + '\n' + JSON.stringify(plan) + '\n```\n';
    const parsed = parsePlan(reply, emptyStage('nothing is loaded')).plan;
    assert.deepEqual(parsed.changes, plan.changes);
    assert.deepEqual(recordPlanFaults(parsed, [files]), recordPlanFaults(plan, [files]));
    // the rows it reads are §6 rows (the owner's CHANGE_KEYS), the move op the owner's MOVE
    dec(files[FILES.record]).changes.forEach((c) => assert.deepEqual(Object.keys(c).sort(), CHANGE_KEYS.slice().sort()));
    assert.ok(dec(files[FILES.record]).changes.some((c) => c.op === MOVE));
    const noPlan = withJson(files, FILES.lab, (lab) => { delete lab[PLAN_KEY]; });
    assert.throws(() => planOf(noPlan), /lab\.json carries no `plan` \(producer "loop"\)/);
    assert.throws(() => planOf(readRecordFolder(path.join(MMP41D, '..', 'record-01'))), /lab\.json carries no `plan`/, 'record-01 of the chain is not the hand-back Record');
});

const R01 = path.join(MMP41D, '..', 'record-01');
const NONE = { row: false, after: false, unplanned: false, beyond: false };

test('the two trial rounds state their plans: record-mmp41d as its chain and as a chain of one, mm-dse-tunnel-rebuild-p41c (the published Record memory) as a chain of one, answer []', () => {
    const r01 = readRecordFolder(R01), r02 = readRecordFolder(MMP41D), p41c = readRecordFolder(P41C);
    assert.deepEqual(recordPlanFaults(planOf(r02), [r01, r02]), [], 'record-mmp41d [record-01, record-02]');
    assert.deepEqual(recordPlanFaults(planOf(r02), [r02]), [], 'record-mmp41d [record-02]');
    assert.deepEqual(recordPlanFaults(planOf(p41c), [p41c]), [], 'mm-dse-tunnel-rebuild-p41c');
});

test('each refusal, planted alone, is red by its own name; restored, green', () => {
    const files = readRecordFolder(MMP41D);
    const plan = planOf(files);
    const run = (rec) => recordPlanFaults(plan, [rec]);
    assert.deepEqual(arms(run(files)), NONE, 'the control');

    // a plan change no row's `to` holds: the setDeclared row turned to 25 (parts.after still 30)
    const rowOff = withJson(files, FILES.record, (r) => { r.changes[0].to.orientationDeg = 25; });
    let f = run(rowOff);
    assert.deepEqual(arms(f), { ...NONE, row: true }, f.join('\n'));
    assert.equal(f[0], 'plan changes[0] (mirror orientationDeg: 30) has no change row on "mirror" in the chain whose `to` holds orientationDeg: 30 (its rows: record-02 setDeclared → {"orientationDeg":25}; record-02 move → {"rect":[290,80,20,240]})');

    // a planned centre the {rect} move does not reach: the move row 2 px short (parts.after still holds it)
    const moveOff = withJson(files, FILES.record, (r) => { r.changes[1].to.rect = [292, 80, 20, 240]; });
    f = run(moveOff);
    assert.deepEqual(arms(f), { ...NONE, row: true }, f.join('\n'));
    assert.match(f[0], /^plan changes\[1\] \(mirror center: \[300,200\]\) has no change row on "mirror" in the chain whose `to` holds center: \[300,200\]/);

    // a row on a part the plan never mentions
    const extra = withJson(files, FILES.record, (r) => { r.changes.push({ tick: 3000, name: 'source', op: MOVE, by: 'maxi', from: { center: [72, 200] }, to: { center: [80, 200] } }); });
    f = run(extra);
    assert.deepEqual(f, ['record-02/record.json changes[2] (move of "source") is on a part the plan never mentions (the plan names "mirror")']);

    // a plan value the hand-back's parts.after.json does not hold (the rows still state it)
    const afterOff = withJson(files, FILES.partsAfter, (p) => { p.mirror[1].orientationDeg = 45; });
    assert.deepEqual(run(afterOff), ['plan changes[0] (mirror orientationDeg: 30): record-02/parts.after.json holds "mirror" orientationDeg at 45, not 30']);
    const afterMoved = withJson(files, FILES.partsAfter, (p) => { p.mirror[1].rect = [360, 80, 20, 240]; });
    assert.deepEqual(run(afterMoved), ['plan changes[1] (mirror center: [300,200]): record-02/parts.after.json holds "mirror" center at [370,200] (the centre of its rect [360,80,20,240], 0.5 px per axis allowed), not [300,200]']);
    const afterGone = withJson(files, FILES.partsAfter, (p) => { delete p.mirror; });
    assert.deepEqual(arms(run(afterGone)), { ...NONE, after: true });

    // a planned rect for a part placed by its centre: no row and no parts entry can hold it
    const rectPlan = { ...plan, changes: plan.changes.concat([{ object: 'source', param: 'rect', value: [70, 190, 4, 20], why: 'w' }]) };
    f = recordPlanFaults(rectPlan, [extra]);
    assert.ok(f.includes('plan changes[2] (source rect: [70,190,4,20]): record-02/parts.after.json "source" holds no rect (it is placed by its centre, so it has no rect)'), f.join('\n'));
    assert.equal(arms(f).unplanned, false, 'the row on source is planned now');

    // a plan that is not parsePlan's, a change that is not {object, param, value}, records that are not a chain
    assert.match(recordPlanFaults({ scene: 'x' }, [files])[0], /^the plan is maxi-roles\.js parsePlan's/);
    assert.match(recordPlanFaults({ ...plan, changes: [{ object: 'mirror', value: 1 }] }, [files])[0], /^plan changes\[0\] is not \{object, param, value, why\}/);
    assert.match(recordPlanFaults(plan, files)[0], /^records is the round's chain of Record folder trees in order, the hand-back last \(\[files\] for one Record\), got object/);
    assert.match(recordPlanFaults(plan, [])[0], /^records is the round's chain/);

    assert.deepEqual(run(files), [], 'restored');
});

test('the chain: a change stated in an earlier Record passes; an unplanned row there is red naming it; only the hand-back\'s parts.after.json must hold the plan', () => {
    const r01 = readRecordFolder(R01), r02 = readRecordFolder(MMP41D);
    const plan = planOf(r02);
    // the setDeclared made in the first world (before the openSketch), its row in record-01
    const set = dec(r02[FILES.record]).changes[0];
    const r01set = withJson(r01, FILES.record, (r) => { r.changes.push({ ...set, tick: r.tickRange[0] }); });
    const r02moveOnly = withJson(r02, FILES.record, (r) => { r.changes.splice(0, 1); });
    assert.deepEqual(recordPlanFaults(plan, [r01set, r02moveOnly]), [], 'the setDeclared stated in record-01');
    // negative control: the same hand-back alone does not state it
    assert.deepEqual(arms(recordPlanFaults(plan, [r02moveOnly])), { ...NONE, row: true });
    // an unplanned row in the earlier Record is named with it
    const r01extra = withJson(r01, FILES.record, (r) => { r.changes.push({ tick: r.tickRange[0], name: 'source', op: MOVE, by: 'maxi', from: { center: [72, 200] }, to: { center: [80, 200] } }); });
    assert.deepEqual(recordPlanFaults(plan, [r01extra, r02]), ['record-01/record.json changes[0] (move of "source") is on a part the plan never mentions (the plan names "mirror")']);
    // record-01's parts.after.json (45°, at 360) is never the plan's end state; the hand-back's is
    assert.equal(dec(r01[FILES.partsAfter]).mirror[1].orientationDeg, 45);
    const r02after = withJson(r02, FILES.partsAfter, (p) => { p.mirror[1].orientationDeg = 45; });
    assert.deepEqual(arms(recordPlanFaults(plan, [r01, r02after])), { ...NONE, after: true });
});

test('an act beyond the plan is red by name: a setDeclared key, a move the plan does not name for a planned part, a remove', () => {
    const files = readRecordFolder(MMP41D);
    const plan = planOf(files);
    const setMore = withJson(files, FILES.record, (r) => { r.changes[0].from.collisionBehavior = 'bounce'; r.changes[0].to.collisionBehavior = 'absorb'; });
    assert.deepEqual(recordPlanFaults(plan, [setMore]), ['record-02/record.json changes[0] (setDeclared of "mirror") acts beyond the plan: collisionBehavior (the plan names orientationDeg, center for "mirror")']);
    const angleOnly = { ...plan, changes: plan.changes.slice(0, 1) };
    assert.deepEqual(recordPlanFaults(angleOnly, [files]), ['record-02/record.json changes[1] (move of "mirror") acts beyond the plan: rect (the plan names orientationDeg for "mirror")']);
    const removed = withJson(files, FILES.record, (r) => { r.changes.push({ tick: 3000, name: 'mirror', op: 'remove', by: 'maxi', from: ['Wall', { rect: [290, 80, 20, 240] }], to: null }); });
    assert.deepEqual(recordPlanFaults(plan, [removed]), ['record-02/record.json changes[2] (remove of "mirror") acts beyond the plan: remove (the plan names orientationDeg, center for "mirror")']);
    // a second move of a planned placement is not beyond the plan: one row states the value
    const twoMoves = withJson(files, FILES.record, (r) => { r.changes.splice(1, 0, { ...r.changes[1], tick: 2000, to: { rect: [320, 80, 20, 240] } }); r.changes[2].from = { rect: [320, 80, 20, 240] }; });
    assert.deepEqual(recordPlanFaults(plan, [twoMoves]), []);
});

test('a fork is an act beyond the plan: a fork row on a planned part is red by name (no plan change can say a fork)', () => {
    const files = readRecordFolder(MMP41D);
    const plan = planOf(files);
    const forked = withJson(files, FILES.record, (r) => { r.changes.push({ tick: 3000, name: 'mirror', op: 'fork', by: 'maxi', from: 'Wall', to: { kind: 'MirrorWall', file: 'parts/MirrorWall.js' } }); });
    assert.deepEqual(recordPlanFaults(plan, [forked]), ['record-02/record.json changes[2] (fork of "mirror") acts beyond the plan: fork (the plan names orientationDeg, center for "mirror")']);
    assert.deepEqual(recordPlanFaults(plan, [files]), [], 'the control: the same Record without the fork row');
});

test('an add of a planned part is allowed: its arrival is not an act beyond the plan, and its props state the planned value (negative control: the same add, unplanned, is red)', () => {
    const files = readRecordFolder(MMP41D);
    const plan = planOf(files);
    const lens = ['SphereEmitter', { preset: 'particle-walk', is2D: true, center: [200, 200], chargeMode: 'positive' }];
    const added = withJson(withJson(files, FILES.record, (r) => { r.changes.push({ tick: 3000, name: 'lens', op: 'add', by: 'maxi', from: null, to: lens }); }),
        FILES.partsAfter, (p) => { p.lens = lens; });
    const planned = { ...plan, changes: plan.changes.concat([{ object: 'lens', param: 'center', value: [200, 200], why: 'w' }]) };
    assert.deepEqual(recordPlanFaults(planned, [added]), [], 'the planned add: no act beyond the plan, its centre stated by the add row\'s props');
    assert.deepEqual(recordPlanFaults(plan, [added]), ['record-02/record.json changes[2] (add of "lens") is on a part the plan never mentions (the plan names "mirror")']);
});

test('a planned centre against a rect\'s centre: 0.5 px per axis passes, 0.6 px fails (RECT_CENTER_SLACK)', () => {
    assert.equal(RECT_CENTER_SLACK, 0.5);
    const files = readRecordFolder(MMP41D);
    // an odd-width mirror: rect [290, 80, 21, 240] has its centre at [300.5, 200]
    const odd = withJson(withJson(files, FILES.record, (r) => { r.changes[1].to.rect = [290, 80, 21, 240]; r.changes[1].from.rect = [360, 80, 21, 240]; }), FILES.partsAfter, (p) => { p.mirror[1].rect = [290, 80, 21, 240]; });
    const at = (x) => ({ ...planOf(files), changes: [planOf(files).changes[0], { object: 'mirror', param: 'center', value: [x, 200], why: 'w' }] });
    assert.deepEqual(recordPlanFaults(at(300), [odd]), [], '0.5 px off: passes');
    assert.deepEqual(recordPlanFaults(at(301), [odd]), [], '0.5 px the other side: passes');
    const f = recordPlanFaults(at(299.9), [odd]);
    assert.deepEqual(arms(f), { ...NONE, row: true, after: true }, '0.6 px off: fails on the row and on parts.after.json\n' + f.join('\n'));
    assert.deepEqual(arms(recordPlanFaults(at(301.1), [odd])), { ...NONE, row: true, after: true }, '0.6 px the other side');
    // an exact centre (a centre-placed part) has no slack: source at [72, 200] planned [72.5, 200]
    const src = withJson(files, FILES.record, (r) => { r.changes.push({ tick: 3000, name: 'source', op: MOVE, by: 'maxi', from: { center: [72, 200] }, to: { center: [80, 200] } }); });
    const srcPlan = { ...planOf(files), changes: planOf(files).changes.concat([{ object: 'source', param: 'center', value: [80.5, 200], why: 'w' }]) };
    assert.deepEqual(arms(recordPlanFaults(srcPlan, [src])), { ...NONE, row: true, after: true });
});
