#!/usr/bin/env node
// gen-memories-build.mjs — writes the GENERATED half of Maxi's scene memories from the roster.
//
//   node scripts/gen-memories-build.mjs
//
// Reads the sketches from the lab's own scene files: a memories row's scene is looked up in the lab's roster
// (scripts/lab-roster.mjs, site/scenes/roster.json) and its file resolved there (sceneFileOf: the package's sceneUrlOf
// against the roster), so the repo is self-contained and this file restates no path.
// For every scene in kb/GodsWorld/memories/roster.json:
//   <id>-card.md   the tile's title / what / why / how (verbatim from the roster's showcase card) or the row's
//                  title / prose, plus the load id and mode, under headings a retriever hits (the why under
//                  WHY_HEADING), ending with where what Maxi learned in the scene lives. Always rewritten.
//   <id>-build.md  the WHOLE sketch, the row's scene file, in ONE js fence. Created as a
//                  bare skeleton when missing; when present it is VERIFIED and left alone: every
//                  code line must be byte-identical to the scene source once the added
//                  `// memo:` lines (Maxi's notes, hand-written) are stripped — a drifted file
//                  FAILS LOUD here, naming itself, so the notes are re-made against the new source,
//                  never silently overwritten. The header records the source's sha256 for the
//                  gate (scripts/test/memories.test.mjs), which reads no scene file.
//   INDEX.md       one row per scene; "Why these are thought impossible" (each tile's why, first sentence); the rule
//                  for how a scene's learning grows; then the Record memories (recordIndexSection,
//                  gen-memories-seen.mjs). Always rewritten. card() and indexText() are exported for the gate,
//                  which compares every card and the whole INDEX to them; importing this file writes nothing.
// <id>-seen.md is never touched here. Media is served from site/memories/<id>/ (clip.mp4 is what
// Maxi can watch; stills are a reading aid); memories cite it by the served relative path.
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlaceholder, recordIndexSection } from './gen-memories-seen.mjs';
import { REPO } from './frqtl-web-pin.mjs';
import { registry, roster as lab, sceneFileOf } from './lab-roster.mjs';

export const MEMO = /^\s*\/\/ memo:/;   // an added note line; everything else in the fence is source

const here = dirname(fileURLToPath(import.meta.url));
/** The row's scene file, repo-relative — how a memory cites where its sketch is. THROWS when the memories roster is not the lab's. */
function sourceRel(s) {
  const row = registry.walkthroughById(lab, s.id);
  if (!row || row.source !== s.source) {
    throw new Error('kb/GodsWorld/memories/roster.json scene "' + s.id + '" (source ' + s.source + ') is not the lab roster\'s' +
      (row ? ' (its source is ' + row.source + ')' : '') + ' — run node scripts/gen-memories-roster.mjs first. (FAIL-LOUD.)');
  }
  return sceneFileOf(row);
}
const memDir = resolve(here, '..', 'kb', 'GodsWorld', 'memories');
const siteDir = resolve(here, '..', 'site');
const sha256 = (t) => createHash('sha256').update(t).digest('hex');
const titleOf = (s) => (s.tile ? s.tile.title : s.rungTitle);

const loadLine = (s) => 'load: GYM scene id `' + s.id + '`' + (s.mode ? ' (mode `' + s.mode + '`' +
  (s.modes.length > 1 ? ', also `' + s.modes.filter((m) => m !== s.mode).join('`, `') + '`' : '') +
  (s.tile && s.tile.mode && s.tile.mode !== s.mode ? '; the GYM tile opens in `' + s.tile.mode + '`' : '') + ')' : '') +
  ' · ' + (s.is3D ? '3D' : '2D') + ' · source ' + sourceRel(s);

/** The heading a card's why sits under: the words a question about the scene's impossibility uses. */
export const WHY_HEADING = '## Why it is thought to be classically impossible';
export const LEARNED_HEADING = '## What Maxi has learned since';
export const WHY_INDEX_HEADING = '## Why these are thought impossible';
export const GROWS_INDEX_HEADING = '## How a scene\'s learning grows';

/** The first sentence of a roster text: up to the first . ! or ? (a closing quote kept) that a space and a capital or quote follow. */
export function firstSentence(text) {
  const m = String(text).match(/^[\s\S]*?[.!?]["”’]?(?=\s+["“A-Z]|\s*$)/);
  return (m ? m[0] : String(text)).trim();
}

/** A scene's card: the roster's copy (card what / why / how, the rung prose), under headings a retriever can hit. */
export function card(s) {
  const t = s.tile;
  const lines = ['# Memory: ' + titleOf(s) + ' — card', '', loadLine(s), ''];
  if (t) {
    lines.push('tile: ' + t.tile, '', '## What you are seeing', '', 'What you are seeing: ' + t.what, '',
      WHY_HEADING, '', 'Why it is impossible the usual way: ' + t.why, '',
      '## How FRQTL gets it', '', 'How FRQTL gets it: ' + t.how);
    if (t.controls) lines.push('', 'Controls: ' + t.controls);
    if (t.still) lines.push('', '## The tile still', '', 'Tile still (tick ' + t.still.tick + '): ' + t.still.alt);
    lines.push('', '## The rung', '', 'Rung ' + s.rungTitle + ' (' + s.group + '): ' + s.prose);
  } else {
    lines.push('group: ' + s.group, '', s.prose);
  }
  lines.push('', LEARNED_HEADING, '', 'This card is the registry\'s text, rewritten from it on every run. What Maxi learns in this scene is not added here: it is ' +
    s.id + '-seen.md, and each Record memory that INDEX.md lists under "Record memories" with scene `' + s.id + '`.');
  return lines.join('\n') + '\n';
}

const cell = (v) => String(v).replace(/\s+/g, ' ').replace(/\|/g, '\\|');
const modesCell = (s) => (s.modes.length ? s.modes.join(', ') + (s.tile && s.tile.mode ? '; the tile opens in ' + s.tile.mode : '') : (s.is3D ? '3d' : '2d'));

/** INDEX.md's "Why these are thought impossible": one row per GYM tile, in front-page order, the why's first sentence verbatim. */
export function whyIndexSection(roster) {
  const byId = new Map(roster.scenes.map((s) => [s.id, s]));
  const rows = roster.tiles.map((id) => {
    const s = byId.get(id);
    if (!s || !s.tile) throw new Error('tile ' + id + ' has no roster row with a tile (FAIL-LOUD): run scripts/gen-memories-roster.mjs.');
    return '| ' + id + ' | ' + cell(s.tile.title) + ' | ' + cell(s.group) + ' | ' + cell(modesCell(s)) + ' | ' + id + '-card.md | ' + cell(firstSentence(s.tile.why)) + ' |';
  });
  const none = roster.scenes.filter((s) => !s.tile).map((s) => s.id);
  return [WHY_INDEX_HEADING, '',
    'Each of the ' + roster.tiles.length + ' GYM tiles carries a why: what makes its scene impossible, or thought impossible, the usual (classical) way. One row per tile, in front-page order; the last column is the first sentence of the why, verbatim from the registry, and the whole why is under "' + WHY_HEADING.slice(3) + '" in the card.', '',
    '| scene | title | group | modes | card | why, first sentence |', '|---|---|---|---|---|---|', ...rows, '',
    'The registry gives no why for the ' + none.length + ' rungs without a tile: ' + none.join(', ') + '.'].join('\n') + '\n';
}

/** INDEX.md's rule for how a scene's learning grows, stated once. */
export function growsIndexSection() {
  return [GROWS_INDEX_HEADING, '',
    'A card is the registry\'s text and is rewritten from it on every run; nothing learned is written into it. A scene\'s learning grows by seen memories: <id>-seen.md for the scene, and the Record memories below, each published from a run on one scene (its `scene` column) and extending that scene\'s card, <scene>-card.md. What Maxi learned is written as a seen memory that names the scene, never as a copy of the card\'s text, so a question about a scene finds its card and then what was learned in it.'].join('\n') + '\n';
}

/** The seen state and served clip of one scene, read from memDir and siteDir. */
function sceneRow(s, mem, site) {
  const seenPath = join(mem, s.id + '-seen.md');
  const seen = !existsSync(seenPath) ? 'MISSING' : isPlaceholder(readFileSync(seenPath, 'utf8')) ? 'awaiting clip' : 'seen';
  const clip = existsSync(join(site, 'memories', s.id, 'clip.mp4')) ? 'memories/' + s.id + '/clip.mp4' : '(no clip yet)';
  return '| ' + s.id + ' | ' + (s.mode || '-') + ' | ' + titleOf(s) + ' | ' + s.id + '-card.md | ' + s.id + '-build.md | ' + s.id + '-seen.md (' + seen + ') | ' + clip + ' |';
}

/** The whole of INDEX.md, from the roster, the memories under `mem` and the media under `site`. */
export function indexText(roster, mem, site) {
  return ['# Maxi\'s scene memories — index', '',
    'Per scene: the card (what it is and why it matters), the build (the whole sketch in one fence, every parameter described in `// memo:` lines, with a how-to-extrapolate note), what was seen (a record of a clip: objects and rects, what formed by when, 2D paths and drags worth doing), and its media under site/memories/<id>/ (clip.mp4 is what Maxi can watch, served at the relative path in the last column; stills there are a reading aid). 2D scenes first, then 3D. Generated by scripts/gen-memories-build.mjs from roster.json.', '',
    '| id | mode | title | card | build | seen | clip |', '|---|---|---|---|---|---|---|', ...roster.scenes.map((s) => sceneRow(s, mem, site))].join('\n') + '\n\n' +
    whyIndexSection(roster) + '\n' + growsIndexSection() + '\n' + recordIndexSection(mem, site);
}

export function fenceOf(text, where) {
  const m = text.match(/```js\n([\s\S]*?)\n```\s*$/);
  if (!m) throw new Error(where + ' has no closing js fence (FAIL-LOUD).');
  return m[1];
}
export const stripMemos = (fence) => fence.split('\n').filter((l) => !MEMO.test(l)).join('\n');

const buildHeader = (s, sha) => '# Memory: ' + titleOf(s) + ' — build\n\n' + loadLine(s) + '\n' +
  'source sha256 ' + sha + ' · every code line below is byte-identical to the scene source; lines beginning `// memo:` are added notes — strip them to diff against ' + sourceRel(s) + '\n' +
  'how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.\n';

function main() {
  if (process.argv.length > 2) { console.error('usage: gen-memories-build.mjs (no arguments — it reads the lab\'s scene roster and files)'); process.exit(2); }
  const roster = JSON.parse(readFileSync(resolve(here, '..', 'kb/GodsWorld/memories/roster.json'), 'utf8'));
  // Stale split files from the old one-chunk rule.
  for (const f of readdirSync(memDir)) if (/-(build|card|seen)-\d+\.md$/.test(f)) unlinkSync(join(memDir, f));

  for (const s of roster.scenes) {
    writeFileSync(join(memDir, s.id + '-card.md'), card(s));
    const src = readFileSync(join(REPO, sourceRel(s)), 'utf8').replace(/\s+$/, '');
    const sha = sha256(src);
    const buildPath = join(memDir, s.id + '-build.md');
    if (existsSync(buildPath)) {
      const text = readFileSync(buildPath, 'utf8');
      const code = stripMemos(fenceOf(text, s.id + '-build.md'));
      if (code !== src) {
        throw new Error(s.id + '-build.md: its code lines (memo lines stripped) no longer equal ' + sourceRel(s) +
          ' — the scene source moved, or a code line was edited. Re-make the notes against the new source (delete the file and re-run to get a bare skeleton). (FAIL-LOUD.)');
      }
      if (!text.includes('source sha256 ' + sha)) {
        throw new Error(s.id + '-build.md: header sha256 does not match its own code lines (FAIL-LOUD).');
      }
      // the generated header is rewritten; the hand-written note and the fence below it are kept byte for byte
      const note = text.indexOf('\nHow to extrapolate:');
      if (note === -1) { throw new Error(s.id + '-build.md: no "How to extrapolate:" line after its header (FAIL-LOUD).'); }
      writeFileSync(buildPath, buildHeader(s, sha) + text.slice(note));
    } else {
      writeFileSync(buildPath, buildHeader(s, sha) + '\nHow to extrapolate: (not written yet — add the note and the `// memo:` lines by hand)\n\n```js\n' + src + '\n```\n');
    }
  }
  writeFileSync(join(memDir, 'INDEX.md'), indexText(roster, memDir, siteDir));
  console.log('cards, builds (skeletons where missing, verified otherwise) and INDEX.md for ' + roster.scenes.length + ' scenes');
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();   // run, not imported
