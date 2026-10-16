#!/usr/bin/env node
// gen-memories-build.mjs — writes the GENERATED half of Maxi's scene memories from the roster.
//
//   node scripts/gen-memories-build.mjs
//
// Reads the sketches from the VENDORED SDK this site pins (site/vendor/frqtl-sdk/<version>/dist,
// version from PINNED.json): a registry row's `source` (scenes/<file>.js) is a path under that dist,
// so the repo is self-contained.
// For every scene in kb/GodsWorld/memories/roster.json:
//   <id>-card.md   the tile's title / what / why / how (verbatim from the registry) or the rung's
//                  title / prose, plus the load id and mode. Always rewritten.
//   <id>-build.md  the WHOLE sketch, <vendored dist>/scenes/<file>.js, in ONE js fence. Created as a
//                  bare skeleton when missing; when present it is VERIFIED and left alone: every
//                  code line must be byte-identical to the registry source once the added
//                  `// memo:` lines (Maxi's notes, hand-written) are stripped — a drifted file
//                  FAILS LOUD here, naming itself, so the notes are re-made against the new source,
//                  never silently overwritten. The header records the source's sha256 for the
//                  gate (scripts/test/memories.test.mjs), which has no registry to read.
//   INDEX.md       one row per scene. Always rewritten.
// <id>-seen.md is never touched here. Media is served from site/memories/<id>/ (clip.mp4 is what
// Maxi can watch; stills are a reading aid); memories cite it by the served relative path.
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlaceholder } from './gen-memories-seen.mjs';

export const MEMO = /^\s*\/\/ memo:/;   // an added note line; everything else in the fence is source

if (process.argv.length > 2) { console.error('usage: gen-memories-build.mjs (no arguments — it reads the pinned vendored SDK)'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const pinned = JSON.parse(readFileSync(resolve(here, '..', 'site', 'vendor', 'frqtl-sdk', 'PINNED.json'), 'utf8'));
const sdkDist = resolve(here, '..', 'site', 'vendor', 'frqtl-sdk', pinned.version, 'dist');
const SRC_LABEL = 'site/vendor/frqtl-sdk/' + pinned.version + '/dist/';   // how a memory cites where its sketch is
const memDir = resolve(here, '..', 'kb', 'GodsWorld', 'memories');
const siteDir = resolve(here, '..', 'site');
const roster = JSON.parse(readFileSync(join(memDir, 'roster.json'), 'utf8'));
const sha256 = (t) => createHash('sha256').update(t).digest('hex');
const titleOf = (s) => (s.tile ? s.tile.title : s.rungTitle);

const loadLine = (s) => 'load: GYM scene id `' + s.id + '`' + (s.mode ? ' (mode `' + s.mode + '`' +
  (s.modes.length > 1 ? ', also `' + s.modes.filter((m) => m !== s.mode).join('`, `') + '`' : '') +
  (s.tile && s.tile.mode && s.tile.mode !== s.mode ? '; the GYM tile opens in `' + s.tile.mode + '`' : '') + ')' : '') +
  ' · ' + (s.is3D ? '3D' : '2D') + ' · source ' + SRC_LABEL + s.source;

function card(s) {
  const t = s.tile;
  const lines = ['# Memory: ' + titleOf(s) + ' — card', '', loadLine(s), ''];
  if (t) {
    lines.push('tile: ' + t.tile, '', 'What you are seeing: ' + t.what, '', 'Why it is impossible the usual way: ' + t.why, '',
      'How FRQTL gets it: ' + t.how);
    if (t.controls) lines.push('', 'Controls: ' + t.controls);
    if (t.still) lines.push('', 'Tile still (tick ' + t.still.tick + '): ' + t.still.alt);
    lines.push('', 'Rung ' + s.rungTitle + ' (' + s.group + '): ' + s.prose);
  } else {
    lines.push('group: ' + s.group, '', s.prose);
  }
  return lines.join('\n') + '\n';
}

export function fenceOf(text, where) {
  const m = text.match(/```js\n([\s\S]*?)\n```\s*$/);
  if (!m) throw new Error(where + ' has no closing js fence (FAIL-LOUD).');
  return m[1];
}
export const stripMemos = (fence) => fence.split('\n').filter((l) => !MEMO.test(l)).join('\n');

const buildHeader = (s, sha) => '# Memory: ' + titleOf(s) + ' — build\n\n' + loadLine(s) + '\n' +
  'source sha256 ' + sha + ' · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against ' + SRC_LABEL + s.source + '\n' +
  'how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.\n';

// Stale split files from the old one-chunk rule.
for (const f of readdirSync(memDir)) if (/-(build|card|seen)-\d+\.md$/.test(f)) unlinkSync(join(memDir, f));

const rows = [];
for (const s of roster.scenes) {
  writeFileSync(join(memDir, s.id + '-card.md'), card(s));
  const src = readFileSync(join(sdkDist, s.source), 'utf8').replace(/\s+$/, '');
  const sha = sha256(src);
  const buildPath = join(memDir, s.id + '-build.md');
  if (existsSync(buildPath)) {
    const text = readFileSync(buildPath, 'utf8');
    const code = stripMemos(fenceOf(text, s.id + '-build.md'));
    if (code !== src) {
      throw new Error(s.id + '-build.md: its code lines (memo lines stripped) no longer equal ' + SRC_LABEL + s.source +
        ' — the registry source moved, or a code line was edited. Re-make the notes against the new source (delete the file and re-run to get a bare skeleton). (FAIL-LOUD.)');
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
  const seenPath = join(memDir, s.id + '-seen.md');
  const seen = !existsSync(seenPath) ? 'MISSING' : isPlaceholder(readFileSync(seenPath, 'utf8')) ? 'awaiting clip' : 'seen';
  const clip = existsSync(join(siteDir, 'memories', s.id, 'clip.mp4')) ? 'memories/' + s.id + '/clip.mp4' : '(no clip yet)';
  rows.push('| ' + s.id + ' | ' + (s.mode || '-') + ' | ' + titleOf(s) + ' | ' + s.id + '-card.md | ' + s.id + '-build.md | ' + s.id + '-seen.md (' + seen + ') | ' + clip + ' |');
}
writeFileSync(join(memDir, 'INDEX.md'), ['# Maxi\'s scene memories — index', '',
  'Per scene: the card (what it is and why it matters), the build (the whole sketch in one fence, every parameter described in `// memo:` lines, with a how-to-extrapolate note), what was seen (a record of a clip: objects and rects, what formed by when, 2D paths and drags worth doing), and its media under site/memories/<id>/ (clip.mp4 is what Maxi can watch, served at the relative path in the last column; stills there are a reading aid). 2D scenes first, then 3D. Generated by scripts/gen-memories-build.mjs from roster.json.', '',
  '| id | mode | title | card | build | seen | clip |', '|---|---|---|---|---|---|---|', ...rows].join('\n') + '\n');
console.log('cards, builds (skeletons where missing, verified otherwise) and INDEX.md for ' + roster.scenes.length + ' scenes');
