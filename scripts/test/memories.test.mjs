// memories.test.mjs — the gate on Maxi's memories and persona.   run: node --test "scripts/**/*.test.mjs"
//
// Reads the repo by default; MEMORIES_ROOT=<dir> points it at another tree holding assets/, kb/ and
// site/ (how the negative controls are run: plant one defect in a copy, watch the gate fail).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookedFaults, lookedLine, isPlaceholder, publishedRecordFaults, renderPublished, rerenderPublished, writeSeenMemory, recordIndexSection, RECORD_INDEX_HEADING, LOOKED_SHAPE, LOOKERS } from '../gen-memories-seen.mjs';
import { VENDOR_REL, PINNED, distFile } from '../frqtl-web-pin.mjs';
import { card, indexText, firstSentence, WHY_HEADING, WHY_INDEX_HEADING, GROWS_INDEX_HEADING, LEARNED_HEADING } from '../gen-memories-build.mjs';
import { SKETCH_FORM, FILES, START_KEY, NO_CHANGE } from '../../site/app-assets/maxi-record-folder.js';   // the Record owner's one definition of the sketch module form, its file names, start key and no-change words
import { readRecordFolder } from '../../minimaxi/record-folder.mjs';
import { testTmpDir } from './tmpdir.mjs';

const ROOT = process.env.MEMORIES_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MEM = join(ROOT, 'kb', 'GodsWorld', 'memories');
const SITE = join(ROOT, 'site');
const PERSONA = join(ROOT, 'assets', 'system_instructions.md');
const MEMO = /^\s*\/\/ memo:/;          // an added note line inside a build fence (scripts/gen-memories-build.mjs)
const roster = JSON.parse(readFileSync(join(MEM, 'roster.json'), 'utf8'));
const mdFiles = readdirSync(MEM).filter((f) => f.endsWith('.md'));
const read = (f) => readFileSync(join(MEM, f), 'utf8');
const sha256 = (t) => createHash('sha256').update(t).digest('hex');

test('roster: every scene has its card, build and seen files, in one file each', () => {
  assert.ok(roster.scenes.length >= 9, 'roster holds at least the nine tiles');
  for (const s of roster.scenes) {
    for (const suffix of ['-card.md', '-build.md', '-seen.md']) {
      assert.ok(existsSync(join(MEM, s.id + suffix)), s.id + suffix + ' is missing');
    }
  }
  for (const id of roster.tiles) assert.ok(roster.scenes.some((s) => s.id === id), 'tile ' + id + ' is in scenes');
  const split = mdFiles.filter((f) => /-(build|card|seen)-\d+\.md$/.test(f));
  assert.deepEqual(split, [], 'a memory is one file; numbered parts found: ' + split.join(', '));
});

test('every served media path cited in a memory exists under site/', () => {
  let cited = 0;
  for (const f of mdFiles) {
    for (const m of read(f).matchAll(/\bmemories\/[A-Za-z0-9._\/-]+\.(?:mp4|png)\b/g)) {
      cited++;
      assert.ok(existsSync(join(SITE, m[0])), f + ' cites ' + m[0] + ' which is not under site/');
    }
  }
  assert.ok(cited > 0, 'no media path cited anywhere');
});

test('no -seen file claims a picture without its clip', () => {
  for (const s of roster.scenes) {
    const text = read(s.id + '-seen.md');
    if (isPlaceholder(text)) continue;   // a TRUE placeholder
    const clip = text.match(/\bmemories\/[A-Za-z0-9._\/-]+\/clip[A-Za-z0-9-]*\.mp4\b/);
    assert.ok(clip, s.id + '-seen.md describes a picture but cites no clip');
    assert.ok(existsSync(join(SITE, clip[0])), s.id + '-seen.md cites ' + clip[0] + ' which is not under site/');
    assert.ok(/RECORD, not Maxi's own sighting/.test(text), s.id + '-seen.md must say who recorded it');
  }
});

/** Each code text that does not parse as an ES module, as `<label>: <node's message>` (node --check: parses import/export, resolves nothing). */
export function moduleParseFaults(codes) {
  const dir = testTmpDir('memories-parse');
  try {
    return codes.flatMap(([label, code], i) => {
      const f = join(dir, i + '.mjs');
      writeFileSync(f, code);
      const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
      return r.status === 0 ? [] : [label + ': ' + (r.stderr.split('\n').find((l) => /Error/.test(l)) || r.stderr.trim())];
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('the module parse rule: a sketch module passes; a syntax error and a dual-mode sketch are refused', () => {
  assert.deepEqual(moduleParseFaults([['ok', "import { Wall } from '@descix/frqtl-web/parts';\nexport default function buildExperiment(exp) {}\n"]]), []);
  assert.equal(moduleParseFaults([['bad', 'export default function buildExperiment(exp) {\n']]).length, 1);
  assert.ok(!SKETCH_FORM.test('function buildExperiment(exp) {}\nif (typeof module !== "undefined") { module.exports = { buildExperiment }; }'), 'a dual-mode sketch is not the sketch form');
});

test('every build is one js fence that parses as an ES module, and its code lines equal the registry source', () => {
  const codes = [];
  for (const s of roster.scenes) {
    const text = read(s.id + '-build.md');
    const fences = text.match(/```js\n[\s\S]*?\n```/g) || [];
    assert.equal(fences.length, 1, s.id + '-build.md must hold exactly one js fence');
    const fence = fences[0].slice('```js\n'.length, -'\n```'.length);
    const code = fence.split('\n').filter((l) => !MEMO.test(l)).join('\n');
    assert.ok(SKETCH_FORM.test(code), s.id + ' build lacks `export default function buildExperiment(` (the sketch module form)');
    codes.push([s.id + '-build.md', code]);
    const sha = text.match(/source sha256 ([0-9a-f]{64})/);
    assert.ok(sha, s.id + '-build.md header lacks the source sha256');
    assert.equal(sha256(code), sha[1], s.id + '-build.md: code lines (memo lines stripped) do not equal the registry source recorded in its header');
    assert.ok(!/How to extrapolate: \(not written yet/.test(text), s.id + '-build.md still has the unwritten extrapolate note');
  }
  assert.deepEqual(moduleParseFaults(codes), [], 'a build fence (memo lines stripped) does not parse as an ES module');
});

test('persona: the HANDS markers once each, in order, and WHY YOU ARE kept', () => {
  const p = readFileSync(PERSONA, 'utf8');
  const begin = '<!-- HANDS:BEGIN generated by scripts/gen-hands-section.mjs -->';
  const end = '<!-- HANDS:END -->';
  const count = (s) => p.split(s).length - 1;
  assert.equal(count(begin), 1, 'HANDS:BEGIN marker must appear exactly once');
  assert.equal(count(end), 1, 'HANDS:END marker must appear exactly once');
  assert.ok(p.indexOf(begin) < p.indexOf(end), 'HANDS:BEGIN must precede HANDS:END');
  assert.ok(p.split('\n').includes('WHY YOU ARE'), 'the line WHY YOU ARE must be kept');
});

// Maxi has never seen the engine: a memo may state the scene's own source, its card, a clip, a labelled
// prediction or a PUBLIC SDK doc by name (sdk.html is the package's own dist/sdk.html). These tokens are the tells of an engine rule restated as fact,
// so a memo line carrying one must also carry a citation marker saying where it came from.
export const TELL = /capacity 16|floor\(|λ\/4|lambda\/4|transverse kick|braid|fullness|wavelengthScale|capacity \d|the engine|mass|momentum|ripple|transverse|capacity\b/i;
export const CITE = /\[(?:src|card|clip|predict|HUMAN_GUIDE|THE_MINIMAL_SIM|COMPOSE_AND_CAPTURE|DSE_WORKED_EXAMPLE|EXTENDING_FRQTL|VISUAL_CODING_GUIDE|RENDERER_PROVIDER|sdk\.html)\b[^\]]*\]/;
test('no memo line states an engine tell without a citation marker', () => {
  const uncited = [];
  for (const f of mdFiles.filter((x) => x.endsWith('-build.md'))) {
    read(f).split('\n').forEach((l, i) => {
      if (!MEMO.test(l)) return;
      if (/docs\/internal|CLAUDE\.md|crates\//.test(l)) uncited.push(f + ':' + (i + 1) + ' cites a non-public source: ' + l.trim());
      else if (TELL.test(l) && !CITE.test(l)) uncited.push(f + ':' + (i + 1) + ' ' + l.trim());
    });
  }
  assert.deepEqual(uncited, [], 'memo lines with an engine tell (' + TELL.source + ') but no marker ' +
    '[src|card|clip <path>|predict|<PUBLIC_DOC> <section>]:\n' + uncited.join('\n'));
});

test('every vendored-package path a memory cites names the pinned package and version (a re-vendor regenerates them, never leaves them behind)', () => {
  const pinned = JSON.parse(readFileSync(join(ROOT, VENDOR_REL, 'PINNED.json'), 'utf8')).version;
  const want = VENDOR_REL + '/' + pinned + '/';
  const stale = [];
  for (const f of mdFiles.concat(['roster.json'])) {
    for (const m of read(f).matchAll(/site\/vendor\/[^/\s`]+\/[^/\s`]+\//g)) {
      if (m[0] !== want) stale.push(f + ' cites ' + m[0]);
    }
  }
  assert.deepEqual(stale, [], 'memories cite a vendored SDK other than the pinned ' + pinned + ' (run scripts/gen-memories-roster.mjs then scripts/gen-memories-build.mjs):\n' + stale.join('\n'));
});

// A [src <path>] citation names a file the pinned vendored package ships: the path is package-relative
// (PINNED.copied + '/…', e.g. dist/frqtl/objects/FrqtlApp.js) and resolves through frqtl-web-pin.mjs distFile, never a typed
// root, so a re-vendor that moves or drops the file turns the citation red. A [src <id>] (no slash) names a roster scene.
export const SRC_CITE = /\[src ([^\s\],;]+)/g;
/** What is wrong with the [src …] citations in one text: [] when every one resolves. */
export function srcCiteFaults(text, sceneIds) {
  const faults = [];
  for (const m of String(text).matchAll(SRC_CITE)) {
    const tok = m[1];
    if (!tok.includes('/')) { if (!sceneIds.has(tok)) faults.push('[src ' + tok + '] names no roster scene'); continue; }
    const pre = PINNED.copied + '/';
    if (!tok.startsWith(pre)) { faults.push('[src ' + tok + '] is not a path inside the vendored package\'s ' + pre); continue; }
    try { distFile(tok.slice(pre.length)); } catch (e) { faults.push('[src ' + tok + '] ' + e.message); }
  }
  return faults;
}
test('every [src …] citation names a file in the pinned vendored package or a roster scene', () => {
  const ids = new Set(roster.scenes.map((s) => s.id));
  const bad = [];
  let paths = 0;
  for (const f of mdFiles) {
    read(f).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(SRC_CITE)) if (m[1].includes('/')) paths++;
      srcCiteFaults(l, ids).forEach((x) => bad.push(f + ':' + (i + 1) + ' ' + x));
    });
  }
  assert.ok(paths > 0, 'no [src <path>] citation anywhere: the rule measures nothing');
  assert.deepEqual(bad, [], 'a [src …] citation names nothing the pinned ' + PINNED.name + '@' + PINNED.version + ' ships:\n' + bad.join('\n'));
});
test('the src rule: a missing path, a path outside the package and an unknown scene are refused; a shipped file passes', () => {
  const ids = new Set(roster.scenes.map((s) => s.id));
  assert.ok(srcCiteFaults('[src dist/js/game/FrqtlApp.js noPositionAuthorityMessage]', ids).length > 0, 'a file the package does not ship');
  assert.ok(srcCiteFaults('[src scripts/gen-memories-build.mjs]', ids).length > 0, 'a path outside the package');
  assert.ok(srcCiteFaults('[src no-such-scene]', ids).length > 0, 'an id not in the roster');
  assert.ok(srcCiteFaults('[src dist/frqtl/objects noPositionAuthorityMessage]', ids).length > 0, 'a directory, not a file');
  assert.ok(srcCiteFaults('[src dist/../../../../../scripts/gen-memories-build.mjs]', ids).length > 0, 'a path that climbs out of the package');
  assert.deepEqual(srcCiteFaults('[src dist/frqtl/objects/FrqtlApp.js noPositionAuthorityMessage] [src r4-self-interference] [src]', ids), []);
});

// A placeholder seen memory speaks in the present ("In <package> <version> this is a walk-through rung"), so the package it
// names is the pinned one, read from PINNED, never a remembered literal. A RECORD seen memory names the version its clip was
// filmed under: that is history and stays.
export const PACKAGE_MENTION = /@descix\/frqtl-[a-z-]+ \d[0-9A-Za-z.\-]*[0-9A-Za-z]/g;
test('a placeholder seen memory names only the pinned package and version', () => {
  const want = PINNED.name + ' ' + PINNED.version;
  const bad = [];
  for (const f of mdFiles.filter((x) => x.endsWith('-seen.md'))) {
    if (!isPlaceholder(read(f))) continue;
    for (const m of read(f).matchAll(PACKAGE_MENTION)) if (m[0] !== want) bad.push(f + ' names ' + m[0] + ', not the pinned ' + want);
  }
  assert.deepEqual(bad, [], 'a placeholder states the present, so it names the pinned package:\n' + bad.join('\n'));
});

// A measurement is a citation ONLY when its evidence is published: a line that says it was measured carries a
// [clip memories/<id>/<clip>.mp4 …] marker naming a clip served under site/. "measured from" is geometry, not a claim.
export const MEASURED = /\bmeasured\b(?!\s+from\b)/i;
export const CLIP_MARKER = /\[clip (memories\/[A-Za-z0-9._\/-]+\.mp4)\b[^\]]*\]/g;
/** What is wrong with one authored line under the rule: [] when it is fine. */
export function measuredFaults(line, siteDir) {
  if (!MEASURED.test(line)) return [];
  const clips = [...line.matchAll(CLIP_MARKER)].map((m) => m[1]);
  if (!clips.length) return ['says measured but carries no [clip memories/…mp4] marker: ' + line.trim().slice(0, 160)];
  return clips.filter((c) => !existsSync(join(siteDir, c))).map((c) => 'cites ' + c + ', which is not published under site/');
}
test('every authored "measured" claim cites a published clip by a [clip …] marker', () => {
  const bad = [];
  for (const f of mdFiles) {
    const build = f.endsWith('-build.md'), seen = f.endsWith('-seen.md');
    if (!build && !seen) continue;   // cards are the registry's own copy, verbatim
    read(f).split('\n').forEach((l, i) => {
      const authored = seen || MEMO.test(l) || /^How to extrapolate:/.test(l);
      if (authored) measuredFaults(l, SITE).forEach((m) => bad.push(f + ':' + (i + 1) + ' ' + m));
    });
  }
  assert.deepEqual(bad, [], 'an unpublished measurement is not a citation:\n' + bad.join('\n'));
});
test('the measured rule: red cases are refused, geometry and a published clip pass', () => {
  const red = [
    '// memo: SUM_out goes dark when B is on, measured in the lab on 2026-10-14.',   // the verifier's plant (D2)
    '// memo: the spill stops near x 460 (measured through the body, 2026-10-14).',
    '// memo: the run goes on, measured [clip memories/no-such-scene/clip.mp4].'
  ];
  for (const l of red) assert.ok(measuredFaults(l, SITE).length > 0, 'must be refused: ' + l);
  const green = [
    '// memo: the leg, measured from the slit exits.',
    '// memo: the spill ends at the sink, measured [clip memories/blackbody/clip-drag-sink.mp4].'
  ];
  for (const l of green) assert.deepEqual(measuredFaults(l, join(ROOT, 'site')), [], 'must pass: ' + l);
});

// A seen memory is kept only when a human, the local Owl or the seat LOOKED at its stills; the platform brain's
// word alone is refused. The looked line's shape is owned by scripts/gen-memories-seen.mjs (lookedFaults).
test('every seen memory names who looked at its stills, never the platform brain, citing its own published clip', () => {
  const bad = [];
  const placeholders = [];
  for (const f of mdFiles.filter((x) => x.endsWith('-seen.md'))) {
    if (isPlaceholder(read(f))) placeholders.push(f);
    bad.push(...lookedFaults(read(f), f.slice(0, -'-seen.md'.length), SITE));
  }
  assert.deepEqual(bad, [], 'a seen memory nobody who may vouch has looked at is not kept:\n' + bad.join('\n'));
  for (const f of placeholders) assert.ok(!existsSync(join(SITE, 'memories', f.slice(0, -'-seen.md'.length), 'clip.mp4')), f + ' is a placeholder while its clip is published: someone must look at it');
});
test('the looked rule: no look, a platform looker and an unpublished clip are refused; a local look passes', () => {
  const site = join(ROOT, 'site');
  const head = '# Memory: 1A · Mirror — seen\n\nRECORD, not Maxi\'s own sighting: from the clip memories/cl1a-mirror/clip.mp4.\n';
  const line = (s) => head + s + '\n\nSeen, clip: a beam.\n';
  const red = {
    'no looked line': head,
    'platform kind': line('looked: platform mm3d2c-owl-r2 on 8 stills of memories/cl1a-mirror/clip.mp4 — contact: none; after: up; passes: yes'),
    'owl-platform kind': line('looked: owl-platform mm3d2c-owl-r2 on 8 stills of memories/cl1a-mirror/clip.mp4 — contact: none'),
    'the model as who': line('looked: local-owl gemini-3.8-flash on 8 stills of memories/cl1a-mirror/clip.mp4 — contact: none'),
    'a platform interaction id as who': line('looked: human dsx1.abc on 8 stills of memories/cl1a-mirror/clip.mp4 — contact: none'),
    'an unknown kind': line('looked: robot r2 on 8 stills of memories/cl1a-mirror/clip.mp4 — contact: none'),
    'a person\'s name as who': line('looked: human Sam on 3 stills of memories/cl1a-mirror/clip.mp4 — contact: the slab'),
    'a one-word name as who': line('looked: human sam on 3 stills of memories/cl1a-mirror/clip.mp4 — contact: the slab'),
    'a path as who': line('looked: local-owl out/turns/mm1/04-owl.md on 8 stills of memories/cl1a-mirror/clip.mp4 — contact: the slab'),
    'an unpublished clip': line('looked: human the-seat-owner on 3 stills of memories/cl1a-mirror/clip-not-filmed.mp4 — contact: the slab'),
    'another memory\'s clip': line('looked: human the-seat-owner on 3 stills of memories/r7-3d/clip.mp4 — contact: the slab'),
    'no account': line('looked: human the-seat-owner on 3 stills of memories/cl1a-mirror/clip.mp4 — '),
    'malformed': line('looked: the owl saw it')
  };
  for (const [why, text] of Object.entries(red)) assert.ok(lookedFaults(text, 'cl1a-mirror', site).length > 0, 'must be refused (' + why + ')');
  const green = line(lookedLine({ by: 'local-owl', who: 'maxi-owl', stills: 8, account: 'turn file out/turns/mm1/04-owl.md; contact: mirror, middle third; after: up; passes: no' }, 'cl1a-mirror', 'clip.mp4'));
  assert.deepEqual(lookedFaults(green, 'cl1a-mirror', site), []);
  assert.deepEqual(lookedFaults('No recording watched yet: there is no clip.\n', 'smoking-gun', site), [], 'a true placeholder has nothing to look at');
  assert.ok(lookedFaults('No recording watched yet.\nlooked: human x on 3 stills of memories/smoking-gun/clip.mp4 — a beam\n', 'smoking-gun', site).length > 0, 'a placeholder cannot carry a look');
  assert.ok(!isPlaceholder(line('looked: human x on 3 stills of memories/cl1a-mirror/clip.mp4 — the words no recording watched yet inside a sentence')), 'only a line that opens with the placeholder words is one');
  assert.throws(() => lookedLine({ by: 'platform', who: 'mm-owl-r1', stills: 8, account: 'x' }, 'cl1a-mirror'), /platform brain/);
  assert.throws(() => lookedLine(undefined, 'cl1a-mirror'), /no look/);
  assert.throws(() => lookedLine({ by: 'human', who: 'Sam', stills: 3, account: 'x' }, 'cl1a-mirror'), /never a person's name/);
  // the messages quote LOOKED_SHAPE, which is built from LOOKERS: the kinds in a message are the kinds in the list
  assert.ok(LOOKED_SHAPE.startsWith('looked: <' + LOOKERS.join('|') + '> <role> '), LOOKED_SHAPE);
  assert.ok(lookedFaults(head, 'cl1a-mirror', site)[0].includes(LOOKED_SHAPE), 'the no-look message quotes LOOKED_SHAPE');
});

// A seen memory published from a Record is the generator's (scripts/gen-memories-seen.mjs): its served folder
// site/memories/<id>/ is a COMPLETE Record and its change/part lines are exactly the ones that Record states; a draft
// from an incomplete Record never sits in kb/ (it is written under minimaxi/out/<run>/memory/ only).
test('every seen memory published from a Record matches its served, complete Record; no draft of an incomplete Record is in kb/', () => {
  const bad = [];
  for (const f of mdFiles.filter((x) => x.endsWith('-seen.md'))) {
    const text = read(f);
    if (/^INCOMPLETE Record\b/m.test(text)) bad.push(f + ' is a draft of an incomplete Record: it is written under minimaxi/out/<run>/memory/ only, never into kb/');
    bad.push(...publishedRecordFaults(text, f.slice(0, -'-seen.md'.length), SITE));
  }
  assert.deepEqual(bad, [], 'a published seen memory that its Record does not state:\n' + bad.join('\n'));
});

test('the published-Record rule triggers on the text: a served record.json deleted, or a hand-written change: line, is red', () => {
  const scratch = testTmpDir('memories-record');
  try {
    mkdirSync(join(scratch, 'kb', 'GodsWorld', 'memories'), { recursive: true });
    mkdirSync(join(scratch, 'site', 'memories'), { recursive: true });
    const run = join(scratch, 'minimaxi', 'out', 'mmp41d', 'record');
    cpSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'record-mmp41d', 'record'), run, { recursive: true });
    cpSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'record-mmp41d', 'turns'), join(scratch, 'minimaxi', 'out', 'turns'), { recursive: true });
    const out = writeSeenMemory(run, { by: 'seat', who: 'maxi-memory-curator', stills: 3, account: 'contact: the slab; after: up-left; passes: no' }, { root: scratch });
    const site = join(scratch, 'site');
    const text = readFileSync(join(scratch, out.memory), 'utf8');
    assert.deepEqual(publishedRecordFaults(text, out.id, site), [], 'the generated memory with its served Record passes');
    rmSync(join(site, 'memories', out.id, 'record.json'));
    assert.ok(publishedRecordFaults(text, out.id, site).length > 0, 'a Record memory whose served record.json is gone is red');
    assert.ok(publishedRecordFaults(text.replace(/^change: .*$/m, 'change: tick 1 · move (maxi) mirror: rect [1, 1, 1, 1] → rect [2, 1, 1, 1]'), out.id, site).length > 0, '... and so is its hand-edited change line');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  const plain = read('atomic-model-seen.md');
  assert.deepEqual(publishedRecordFaults(plain, 'atomic-model', SITE), [], 'a seen memory that claims no Record is not this rule\'s');
  assert.ok(publishedRecordFaults(plain + '\nchange: tick 5 · move (human) nucleus: center [1, 2] → center [3, 4]\n', 'atomic-model', SITE).length > 0, 'a hand-written change: line added to a non-Record memory is red');
  assert.ok(publishedRecordFaults(plain + '\npart nucleus: ["Box",{}] → ["Box",{"a":1}]\n', 'atomic-model', SITE).length > 0, 'a hand-written part line is red');
});

// Every published Record memory passes the plan check on its served Record (publishedRecordFaults runs recordPlanFaults):
// a Record with no start, or one that ends where it started, cannot be published, even with a text regenerated to match it.
test('the published-Record rule runs the plan check: a served Record with no start, or one that ends where it started (no change), is red', () => {
  const ID = 'mm-dse-tunnel-rebuild-olc2';
  const scratch = testTmpDir('memories-plan');
  const PLAN = 'does not state its plan (the plan check, recordPlanFaults) — ';
  try {
    const site = join(scratch, 'site'), dir = join(site, 'memories', ID);
    cpSync(join(SITE, 'memories', ID), dir, { recursive: true });
    const text = read(ID + '-seen.md');
    assert.deepEqual(publishedRecordFaults(text, ID, site), [], 'the control: the published olc2 with its start passes');
    const lab = JSON.parse(readFileSync(join(dir, FILES.lab), 'utf8'));
    // planted: no start
    const noStart = Object.assign({}, lab); delete noStart[START_KEY];
    writeFileSync(join(dir, FILES.lab), JSON.stringify(noStart, null, 2) + '\n');
    const a = publishedRecordFaults(text, ID, site);
    assert.ok(a.some((f) => f.includes(PLAN) && /lab\.json carries no `start`/.test(f)), 'a start-less Record is red by the plan check:\n' + a.join('\n'));
    assert.ok(a.some((f) => /states no parts diff — .*lab\.json carries no `start`/.test(f)), 'and the generator renders no diff for it (fails loud):\n' + a.join('\n'));
    const md = join(scratch, 'kb', 'GodsWorld', 'memories', ID + '-seen.md');
    mkdirSync(dirname(md), { recursive: true }); writeFileSync(md, text);
    assert.throws(() => rerenderPublished(ID, { root: scratch }), /--rerender: the Record served for .* is not publishable .*nothing was written:\n- record-01: lab\.json carries no `start`/s, 'the regeneration refuses it too');
    assert.equal(readFileSync(md, 'utf8'), text, '... and writes nothing');
    // planted: no change — the round ends where it started, and the text regenerated from that folder, so only the plan check can see it
    writeFileSync(join(dir, FILES.lab), JSON.stringify(lab, null, 2) + '\n');
    writeFileSync(join(dir, FILES.partsAfter), JSON.stringify(lab[START_KEY], null, 2) + '\n');
    const same = renderPublished(text, ID, readRecordFolder(dir));
    assert.throws(() => rerenderPublished(ID, { root: scratch }), new RegExp('nothing was written:\\n- ' + NO_CHANGE + ': '), 'the regeneration refuses a no-change Record');
    const b = publishedRecordFaults(same, ID, site);
    assert.ok(b.some((f) => f.includes(PLAN + NO_CHANGE + ': ')), 'a no-change Record is red by the plan check:\n' + b.join('\n'));
    assert.deepEqual(b.filter((f) => !f.includes(PLAN)), [], 'only the plan check catches it: without it the regenerated text would pass');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

// The INDEX's "Record memories" section is generated (gen-memories-build.mjs writes recordIndexSection); a hand edit, or a
// published Record memory it does not list, is red.
test('INDEX.md ends with the generated Record memories section, listing every published Record memory', () => {
  const index = readFileSync(join(MEM, 'INDEX.md'), 'utf8');
  const at = index.indexOf('\n' + RECORD_INDEX_HEADING + '\n');
  assert.ok(at !== -1, 'INDEX.md has no `' + RECORD_INDEX_HEADING + '` section: run node scripts/gen-memories-build.mjs');
  assert.equal(index.slice(at + 1), recordIndexSection(MEM, SITE), 'INDEX.md\'s Record memories section is not the generated one: regenerate with node scripts/gen-memories-build.mjs, never edit it by hand');
});

// The cards and INDEX.md are generated (scripts/gen-memories-build.mjs card / indexText): a hand edit to either is red.
test('every card is the generator\'s text for its roster row, and INDEX.md is the generator\'s text as a whole (a hand edit is red)', () => {
  const edited = roster.scenes.filter((s) => read(s.id + '-card.md') !== card(s)).map((s) => s.id + '-card.md');
  assert.deepEqual(edited, [], 'a card is not the generated one: regenerate with node scripts/gen-memories-build.mjs, never edit it by hand');
  const index = readFileSync(join(MEM, 'INDEX.md'), 'utf8');
  const want = indexText(roster, MEM, SITE);
  if (index !== want) {
    const a = index.split('\n'), b = want.split('\n');
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    assert.fail('INDEX.md is not the generated one from line ' + (i + 1) + ' (' + JSON.stringify((a[i] || '').slice(0, 120)) + '): regenerate with node scripts/gen-memories-build.mjs, never edit it by hand');
  }
});

// The why is the registry's (roster tile.why): each tiled card carries it whole under WHY_HEADING; INDEX.md's why table
// carries its first sentence, one row per tile; every card ends with where its learning grows. Read off the roster, not the generator.
test('every tile\'s why is retrievable: whole under the why heading in its card, first sentence in INDEX.md\'s why table', () => {
  const index = readFileSync(join(MEM, 'INDEX.md'), 'utf8');
  const why = index.slice(index.indexOf('\n' + WHY_INDEX_HEADING + '\n'), index.indexOf('\n' + GROWS_INDEX_HEADING + '\n'));
  assert.ok(index.includes('\n' + WHY_INDEX_HEADING + '\n') && index.includes('\n' + GROWS_INDEX_HEADING + '\n'), 'INDEX.md lacks its why table or its learning rule');
  const bad = [];
  for (const s of roster.scenes) {
    const text = read(s.id + '-card.md');
    if (!text.includes('\n' + LEARNED_HEADING + '\n')) bad.push(s.id + '-card.md has no `' + LEARNED_HEADING + '` section');
    if (!s.tile) { if (text.includes(WHY_HEADING)) bad.push(s.id + '-card.md has a why heading but the registry gives it no why'); continue; }
    if (!text.includes(WHY_HEADING + '\n\nWhy it is impossible the usual way: ' + s.tile.why + '\n')) bad.push(s.id + '-card.md does not carry the registry\'s why whole under `' + WHY_HEADING + '`');
    const first = firstSentence(s.tile.why);
    if (!s.tile.why.startsWith(first) || first.length < 20) bad.push(s.id + ': first sentence ' + JSON.stringify(first) + ' is not a prefix of its why');
    if (!why.includes('\n| ' + s.id + ' | ') || !why.includes(' | ' + s.id + '-card.md | ' + first.replace(/\|/g, '\\|') + ' |\n')) bad.push('INDEX.md\'s why table has no row for ' + s.id + ' carrying its first sentence');
  }
  assert.equal((why.match(/\n\| [a-z0-9-]+ \| /g) || []).length - 1, roster.tiles.length, 'the why table has one row per tile');   // -1: the header row
  assert.deepEqual(bad, [], bad.join('\n'));
});
test('the first-sentence rule: a closing quote, a decimal point and a one-sentence text', () => {
  assert.equal(firstSentence('Feynman called it "impossible, absolutely impossible". A ray tracer cannot.'), 'Feynman called it "impossible, absolutely impossible".');
  assert.equal(firstSentence('Tuned over 13.8 billion years, and more. Next.'), 'Tuned over 13.8 billion years, and more.');
  assert.equal(firstSentence('One sentence only.'), 'One sentence only.');
  assert.equal(firstSentence('Two systems, two rules. Two sets.'), 'Two systems, two rules.');
});

// THE MEMO PIN. The hand-written half of a build memory (its `// memo:` lines and its "How to extrapolate:" note) is
// kept byte for byte by gen-memories-build.mjs, which checks only the code lines; so a memo's text change passed every
// other rule. These pins are the count and sha256 of those texts in order (file name, tab, text; files sorted), and
// they move ONLY in a maxi-memory-curator commit that says why, with the carry evidence (before/after hashes).
export const MEMO_PIN = Object.freeze({ count: 486, sha256: 'd64095678dd05d39dc866009d4d1809bd58850909fd5c9da150c59a86c31a580' });
export const NOTE_PIN = Object.freeze({ count: 30, sha256: '647a7569ec703cec2ede97c27e9dffce5abb2f2070596eb0ee7f83093e0a1064' });
/** The ordered memo lines and note slices of the build memories under `dir`. */
export function memoTexts(dir) {
  const builds = readdirSync(dir).filter((f) => f.endsWith('-build.md')).sort();
  const memos = [], notes = [];
  for (const f of builds) {
    const t = readFileSync(join(dir, f), 'utf8');
    t.split('\n').forEach((l) => { if (MEMO.test(l)) memos.push(f + '\t' + l); });
    notes.push(f + '\t' + t.slice(t.indexOf('\nHow to extrapolate:') + 1, t.indexOf('\n```js')));
  }
  return { memos, notes };
}
test('the memo pin: the ordered memo lines and extrapolate notes are the curator\'s pinned text (a memo-text edit is red)', () => {
  const { memos, notes } = memoTexts(MEM);
  assert.deepEqual({ count: memos.length, sha256: sha256(memos.join('\n')) }, MEMO_PIN, 'the build memories\' `// memo:` lines moved: a memo text changes only in a maxi-memory-curator commit that moves MEMO_PIN with its carry evidence');
  assert.deepEqual({ count: notes.length, sha256: sha256(notes.join('\n')) }, NOTE_PIN, 'the build memories\' "How to extrapolate:" notes moved: a note changes only in a maxi-memory-curator commit that moves NOTE_PIN with its carry evidence');
});
