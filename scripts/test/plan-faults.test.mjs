/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * plan-faults.test.mjs — the plan against the Record, in code: site/app-assets/maxi-record-folder.js recordPlanFaults
 * (the Owl never sees the plan; it gets the outline, the prediction and the footage).
 *
 * Gates, each with its negative control:
 *   1. conformance: the plan is read from lab.json through the owner's PLAN_KEY (one of LOOP_LAB_KEYS), and the plan
 *      maxi-roles.js parsePlan makes of the same json:plan block gives the same answer as the one lab.json holds;
 *   2. the fixture record-mmp41d states its plan as its chain [record-01, record-02] and as a chain of one (the green
 *      controls), and so does the published p41c; a Record that carries no start (p41c with it deleted) is refused by
 *      name, by the plan check and by the generator — no row and no parts.before.json stands in for it;
 *   3. START → END (lab.json START_KEY → the hand-back's parts.after.json): a re-staged round that undoes an earlier row and
 *      then moves the part passes, and its parts diff is the real move; trial mmt41a's own Record (fixture record-mmt41a: a re-stage,
 *      then a last row that undoes it), its start where its round began, ends where it started and is refused as NO_CHANGE;
 *      a synthetic round that ends where it started is refused the same way; each with the check planted away, red;
 *   4. each refusal, planted alone, is red BY ITS OWN NAME and green again restored: a plan change the start already holds;
 *      a row on a part the plan never mentions; a plan value parts.after.json does not hold; a planned rect for a
 *      centre-placed part; a plan that is not parsePlan's; rows that say something else no longer decide anything;
 *   5. the CHAIN: a change made in an earlier Record passes (start → end spans it); an unplanned row in an earlier Record is
 *      red naming it; the hand-back's parts.after.json, never an earlier one's, is the end; a bare tree is refused;
 *   6. an act beyond the plan (a setDeclared key or a move the plan does not name for a planned part; a remove; a fork) is red;
 *      an add of a planned part is not (its arrival; its props state the planned value), and the same add unplanned is red;
 *   7. a planned centre against a rect's centre: 0.5 px per axis passes, 0.6 px fails (RECT_CENTER_SLACK).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { recordPlanFaults, planOf, startOf, PLAN_KEY, START_KEY, NO_CHANGE, LOOP_LAB_KEYS, FILES, MOVE, CHANGE_KEYS, RECT_CENTER_SLACK, recordFolderFaults } from '../../site/app-assets/maxi-record-folder.js';
import { recordLines } from '../gen-memories-seen.mjs';
import { parsePlan, emptyStage, HANDOFF_TAGS } from '../../site/app-assets/maxi-roles.js';
import { readRecordFolder } from '../../minimaxi/record-folder.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MMP41D = path.join(REPO, 'scripts', 'test', 'fixtures', 'record-mmp41d', 'record', 'record-02');
const P41C = path.join(REPO, 'site', 'memories', 'mm-dse-tunnel-rebuild-p41c');
const T41A = path.join(REPO, 'scripts', 'test', 'fixtures', 'record-mmt41a', 'record', 'record-01');

const enc = (v) => new TextEncoder().encode(JSON.stringify(v, null, 2) + '\n');
const dec = (b) => JSON.parse(typeof b === 'string' ? b : new TextDecoder().decode(b));
/** A copy of a folder tree with one JSON file rewritten by `edit(parsed)`. */
function withJson(files, name, edit) { const v = dec(files[name]); edit(v); return Object.assign({}, files, { [name]: enc(v) }); }
/** Which arms a fault list fired: a fault names its arm in words the owner writes. */
function arms(faults) {
    return {
        nostart: faults.some((f) => /lab\.json carries no `start`/.test(f)),
        nochange: faults.some((f) => f.startsWith(NO_CHANGE + ': ')),
        already: faults.some((f) => /: the start \(lab\.json start\) already holds /.test(f)),
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
const NONE = { nostart: false, nochange: false, already: false, after: false, unplanned: false, beyond: false };

test('record-mmp41d states its plan as its chain and as a chain of one; the published mm-dse-tunnel-rebuild-p41c states its plan from its start; with its start deleted it is refused by name, and nothing stands in for it', () => {
    const r01 = readRecordFolder(R01), r02 = readRecordFolder(MMP41D), p41c = readRecordFolder(P41C);
    assert.deepEqual(recordPlanFaults(planOf(r02), [r01, r02]), [], 'record-mmp41d [record-01, record-02]');
    assert.deepEqual(recordPlanFaults(planOf(r02), [r02]), [], 'record-mmp41d [record-02]');
    assert.deepEqual(recordFolderFaults(p41c), [], 'the published Record is a complete §6 Record');
    assert.deepEqual(recordPlanFaults(planOf(p41c), [p41c]), [], 'the published Record, its start its own parts.before.json, states its plan');
    const p41cNoStart = withJson(p41c, FILES.lab, (lab) => { delete lab[START_KEY]; });
    const f = recordPlanFaults(planOf(p41cNoStart), [p41cNoStart]);
    assert.deepEqual(arms(f), { ...NONE, nostart: true }, f.join('\n'));
    assert.match(f[0], /^record-01: lab\.json carries no `start` — .* cannot be judged start → end \(parts\.before\.json is where its world stood when the Record opened, not necessarily where the round began\)\.$/);
    assert.throws(() => startOf(p41cNoStart), /lab\.json carries no `start`/, 'the one reader refuses it too');
    assert.throws(() => recordLines(p41cNoStart), /lab\.json carries no `start`/, 'the memory\'s parts diff has no other side: the generator fails loud through the same reader');
    const noStart = withJson(r02, FILES.lab, (lab) => { delete lab[START_KEY]; });
    assert.deepEqual(arms(recordPlanFaults(planOf(r02), [noStart])), { ...NONE, nostart: true }, 'the fixture with its start deleted');
    const notBlock = withJson(r02, FILES.lab, (lab) => { lab[START_KEY] = { mirror: 'Wall' }; });
    assert.match(recordPlanFaults(planOf(r02), [notBlock])[0], /^record-02: lab\.json start: entry "mirror" is not \[Kind, \{props\}\]/);
    assert.ok(recordFolderFaults(notBlock).includes('lab.json start: entry "mirror" is not [Kind, {props}]: "Wall"'), 'the folder gate names a start that is not a parts block');
    const early = withJson(r01, FILES.lab, (lab) => { lab[START_KEY] = dec(r01[FILES.partsBefore]); });
    assert.ok(recordFolderFaults(early).includes('lab.json start rides in the hand-back Record of a chain only'), 'a start in an earlier Record is refused by name');
});

// ── START → END ─────────────────────────────────────────────────────────────────────────────
/** The mmt41a Record, retired as 'no change' and kept as this fixture (round 2 of 2: it opened on round 1's world, re-staged the screen to the stock place, then
 *  dragged it back to the plan's), with the start `start` planted into its lab.json (the trial carries none: it predates START_KEY). */
function t41aWith(start) { return withJson(readRecordFolder(T41A), FILES.lab, (lab) => { lab[START_KEY] = start; }); }

test('START → END: a re-staged round that undoes an earlier row and then moves the part passes, and its parts diff is the real move (negative control: parts.before.json is another side, and without the start the generator fails loud)', () => {
    const r02 = readRecordFolder(MMP41D);
    const start = dec(r02[FILES.lab])[START_KEY];
    // the round: the angle set, the mirror dragged to 330 (a wrong place), re-staged back to 360 (undoing that row), then to the plan's 290
    const restaged = withJson(withJson(r02, FILES.record, (r) => {
        const set = r.changes[0];
        r.changes = [set,
            { tick: 3000, name: 'mirror', op: MOVE, by: 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: [330, 80, 20, 240] } },
            { tick: 3100, name: 'mirror', op: MOVE, by: 'maxi', from: { rect: [330, 80, 20, 240] }, to: { rect: [360, 80, 20, 240] } },
            { tick: 8378, name: 'mirror', op: MOVE, by: 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: [290, 80, 20, 240] } }];
    }), FILES.partsBefore, (p) => { p.mirror[1].rect = [330, 80, 20, 240]; });   // its world's Record opened after the wrong drag
    assert.deepEqual(recordPlanFaults(planOf(restaged), [restaged]), [], 'start (360, 45°) → end (290, 30°): the plan is stated');
    const end = dec(r02[FILES.partsAfter]);
    assert.deepEqual(recordLines(restaged).filter((l) => l.startsWith('part ')), ['part mirror: ' + JSON.stringify(start.mirror) + ' → ' + JSON.stringify(end.mirror)], 'the parts diff is the real move, start → end');
    assert.notDeepEqual(dec(restaged[FILES.partsBefore]).mirror, start.mirror, 'the control: parts.before.json (from 330) is another side, so the start is what makes it the real move');
    const noStart = withJson(restaged, FILES.lab, (lab) => { delete lab[START_KEY]; });
    assert.throws(() => recordLines(noStart), /lab\.json carries no `start`/, 'without the start no diff is rendered: parts.before.json never stands in');
});

test('a round that ends where it started is refused as NO_CHANGE, whatever its rows did: the mmt41a shape (a re-stage, then a last row that undoes it) and a synthetic one (negative control: the check planted away passes both)', async () => {
    const t = readRecordFolder(T41A);
    const rows = dec(t[FILES.record]).changes;
    assert.deepEqual(rows.map((r) => [r.from.rect[0], r.to.rect[0]]), [[355, 315], [315, 355]], 'the trial\'s rows: the re-stage to the stock place, then a last row that undoes it');
    const opened = t41aWith(dec(t[FILES.partsBefore]));   // its start is where round 2 began: the world round 1 left
    const f = recordPlanFaults(planOf(opened), [opened]);
    assert.deepEqual(f, [
        NO_CHANGE + ': record-01/parts.after.json equals the start (lab.json start) — the round ends where it started, whatever its 2 row(s) did on the way',
        'plan changes[0] (screen center: [365,200,0]): the start (lab.json start) already holds "screen" center at [365,200] (the centre of its rect [355,0,20,400]) — start → end does not make this change'
    ]);
    assert.deepEqual(recordLines(opened).filter((l) => l.startsWith('part ')), ['part (none): parts.after.json equals lab.json start']);
    assert.throws(() => recordLines(t), /lab\.json carries no `start`/, 'without its start no memory is rendered: parts.before.json does not stand in');
    // synthetic: the fixture's mirror moved away and back inside the round, nothing else changed
    const r02 = readRecordFolder(MMP41D);
    const back = withJson(withJson(r02, FILES.record, (r) => {
        r.changes = [{ tick: 3000, name: 'mirror', op: MOVE, by: 'maxi', from: { rect: [360, 80, 20, 240] }, to: { rect: [290, 80, 20, 240] } },
                     { tick: 3100, name: 'mirror', op: MOVE, by: 'maxi', from: { rect: [290, 80, 20, 240] }, to: { rect: [360, 80, 20, 240] } }];
    }), FILES.partsAfter, (p) => { Object.keys(p).forEach((k) => { delete p[k]; }); Object.assign(p, dec(r02[FILES.lab])[START_KEY]); });
    const centre = { ...planOf(r02), changes: [{ object: 'mirror', param: 'center', value: [370, 200], why: 'w' }] };
    assert.deepEqual(arms(recordPlanFaults(centre, [back])), { ...NONE, nochange: true, already: true });
    // planted away: the NO_CHANGE check and the start arm deleted from a copy of the owner — both rounds pass (RED)
    const src = fs.readFileSync(path.join(REPO, 'site', 'app-assets', 'maxi-record-folder.js'), 'utf8');
    const CHECK = '    if (start !== null && partsEqual(start, end)) {';
    const ALREADY = '        if (was.none === undefined && sameValue(c.param, c.value, was)) {';
    assert.equal(src.split(CHECK).length, 2, 'the plant target moved'); assert.equal(src.split(ALREADY).length, 2, 'the plant target moved');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-plant-'));
    try {
        const pin = (x) => x.replace(/from '\.\/(frqtl-web-project|maxi-hands)\.js'/g, (m, n) => "from '" + pathToFileURL(path.join(REPO, 'site/app-assets', n + '.js')).href + "'");
        fs.writeFileSync(path.join(dir, 'maxi-record-folder.js'), pin(src.replace(CHECK, '    if (false) {').replace(ALREADY, '        if (false) {')));
        const m = await import(pathToFileURL(path.join(dir, 'maxi-record-folder.js')).href);
        assert.deepEqual(m.recordPlanFaults(planOf(opened), [opened]), [], 'planted away, the mmt41a shape passes (the plant exhibits the failure)');
        assert.deepEqual(m.recordPlanFaults(centre, [back]), [], 'planted away, the synthetic round passes');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('each refusal, planted alone, is red by its own name; restored, green', () => {
    const files = readRecordFolder(MMP41D);
    const plan = planOf(files);
    const run = (rec) => recordPlanFaults(plan, [rec]);
    assert.deepEqual(arms(run(files)), NONE, 'the control');

    // a plan change the start already holds: the producer began with the mirror at 30 degrees
    const already = withJson(files, FILES.lab, (lab) => { lab[START_KEY].mirror[1].orientationDeg = 30; });
    let f = run(already);
    assert.deepEqual(f, ['plan changes[0] (mirror orientationDeg: 30): the start (lab.json start) already holds "mirror" orientationDeg at 30 — start → end does not make this change']);
    const placed = withJson(files, FILES.lab, (lab) => { lab[START_KEY].mirror[1].rect = [291, 80, 19, 240]; });   // centre [300.5, 200]: within the slack
    assert.match(run(placed)[0], /^plan changes\[1\] \(mirror center: \[300,200\]\): the start \(lab\.json start\) already holds "mirror" center at \[300\.5,200\] \(the centre of its rect \[291,80,19,240\]\)/);

    // rows decide nothing about where the round ended: a row whose `to` says 25, or a move 2 px short, with END holding the plan
    assert.deepEqual(run(withJson(files, FILES.record, (r) => { r.changes[0].to.orientationDeg = 25; })), [], 'a setDeclared row that says 25: END holds 30');
    assert.deepEqual(run(withJson(files, FILES.record, (r) => { r.changes[1].to.rect = [292, 80, 20, 240]; })), [], 'a move row 2 px short: END holds the plan\'s centre');

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
    // the setDeclared made in the first world (before the openSketch), its row in record-01: start → end spans it
    const set = dec(r02[FILES.record]).changes[0];
    const r01set = withJson(r01, FILES.record, (r) => { r.changes.push({ ...set, tick: r.tickRange[0] }); });
    const r02moveOnly = withJson(r02, FILES.record, (r) => { r.changes.splice(0, 1); });
    assert.deepEqual(recordPlanFaults(plan, [r01set, r02moveOnly]), [], 'the setDeclared made in record-01');
    // negative control: a start that already holds it (the producer began at 30 degrees) is red, chain or not
    const r02began30 = withJson(r02moveOnly, FILES.lab, (lab) => { lab[START_KEY].mirror[1].orientationDeg = 30; });
    assert.deepEqual(arms(recordPlanFaults(plan, [r01set, r02began30])), { ...NONE, already: true });
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
    assert.deepEqual(arms(f), { ...NONE, after: true }, '0.6 px off: fails on parts.after.json\n' + f.join('\n'));
    assert.deepEqual(arms(recordPlanFaults(at(301.1), [odd])), { ...NONE, after: true }, '0.6 px the other side');
    // an exact centre (a centre-placed part) has no slack: source at [72, 200] planned [72.5, 200]
    const src = withJson(files, FILES.record, (r) => { r.changes.push({ tick: 3000, name: 'source', op: MOVE, by: 'maxi', from: { center: [72, 200] }, to: { center: [80, 200] } }); });
    const srcPlan = { ...planOf(files), changes: planOf(files).changes.concat([{ object: 'source', param: 'center', value: [80.5, 200], why: 'w' }]) };
    const srcMoved = withJson(src, FILES.partsAfter, (p) => { p.source[1].center = [80, 200]; });
    assert.deepEqual(arms(recordPlanFaults(srcPlan, [srcMoved])), { ...NONE, after: true });
    assert.deepEqual(recordPlanFaults({ ...srcPlan, changes: srcPlan.changes.slice(0, 2).concat([{ object: 'source', param: 'center', value: [80, 200], why: 'w' }]) }, [srcMoved]), [], 'the control: exactly [80, 200] passes');
});
