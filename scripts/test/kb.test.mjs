// kb.test.mjs — the gate on the KB documents beside Maxi's memories (kb/GodsWorld/*.md).   run: node --test "scripts/**/*.test.mjs"
//
// kb/GodsWorld/robotic-imagination.md is a VERBATIM copy of a public document by its author: DeSciX/EGPT
// guide/robotic-imagination.md at one commit. Only two things differ from the source: its two HTML comments (the
// assistant's drafting notes, not the author's prose) are left out, and its relative links point to the same files on
// github.com/DeSciX/EGPT at that commit.
// Its footer names the source repo, path, commit and the source's sha256. The pin below is the copy's sha256: it moves
// only in a maxi-memory-curator commit that re-copies the source and says why. MEMORIES_ROOT=<dir> reads another tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.MEMORIES_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GUIDE_REL = 'kb/GodsWorld/robotic-imagination.md';
export const GUIDE_PIN = Object.freeze({ sha256: '4738a9686782fe67909f7358b8f2f88ab2df424d91c33d3f7f71196d37047be8' });
export const GUIDE_FOOTER = /^Source: DeSciX\/EGPT, guide\/robotic-imagination\.md at commit ([0-9a-f]{40}) \(https:\/\/github\.com\/DeSciX\/EGPT\/blob\/\1\/guide\/robotic-imagination\.md\), source sha256 [0-9a-f]{64}\. /m;
const sha256 = (t) => createHash('sha256').update(t).digest('hex');

/** What is wrong with the guide copy's text: [] when its bytes are the pinned ones, its footer names the commit, and every link resolves outside the KB at that commit. */
export function guideFaults(text) {
  const faults = [];
  if (sha256(text) !== GUIDE_PIN.sha256) faults.push(GUIDE_REL + ' is not the pinned copy (sha256 ' + sha256(text) + '): it changes only by a curator re-copy that moves GUIDE_PIN');
  const foot = text.match(GUIDE_FOOTER);
  if (!foot) { faults.push(GUIDE_REL + ' has no provenance footer naming DeSciX/EGPT, guide/robotic-imagination.md, its 40-hex commit and the source sha256'); return faults; }
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (!/^https?:\/\//.test(m[1])) faults.push(GUIDE_REL + ' keeps a relative link ' + m[1] + ', which does not resolve from the KB');
    else if (m[1].startsWith('https://github.com/DeSciX/EGPT/') && !m[1].startsWith('https://github.com/DeSciX/EGPT/blob/' + foot[1] + '/')) faults.push(GUIDE_REL + ' links ' + m[1] + ', not at the footer\'s commit ' + foot[1]);
  }
  if (/<!--/.test(text)) faults.push(GUIDE_REL + ' still carries an HTML comment: the source\'s drafting notes are left out of the copy');
  return faults;
}

test('the robotic-imagination guide is the pinned verbatim copy, its footer names the source commit, its links resolve', () => {
  assert.deepEqual(guideFaults(readFileSync(join(ROOT, GUIDE_REL), 'utf8')), []);
});
test('the guide rule: a one-character edit, a footer without its commit and a relative link are each red', () => {
  const text = readFileSync(join(ROOT, GUIDE_REL), 'utf8');
  const at = text.indexOf('barrier of meaning');
  assert.ok(at > 0);
  assert.ok(guideFaults(text.slice(0, at) + 'B' + text.slice(at + 1)).some((f) => /not the pinned copy/.test(f)), 'a one-character edit');
  const noCommit = text.replace(/at commit [0-9a-f]{40} /, 'at commit main ');
  assert.ok(guideFaults(noCommit).some((f) => /no provenance footer/.test(f)), 'a footer naming no commit');
  const rel = text.replace(/\]\(https:\/\/github\.com\/DeSciX\/EGPT\/blob\/[0-9a-f]{40}\/11_PATENT\/README\.md\)/, '](../11_PATENT/README.md)');
  assert.notEqual(rel, text);
  assert.ok(guideFaults(rel).some((f) => /relative link/.test(f)), 'a relative link');
  const other = text.replace(/blob\/[0-9a-f]{40}\/11_PATENT/, 'blob/main/11_PATENT');
  assert.ok(guideFaults(other).some((f) => /not at the footer's commit/.test(f)), 'a link at another ref');
  const note = text.replace('### Maxi, an AI model which understands, as the antidote\n', '### Maxi, an AI model which understands, as the antidote\n<!-- DRAFT by the assistant -->\n');
  assert.notEqual(note, text);
  assert.ok(guideFaults(note).some((f) => /HTML comment/.test(f)), 'a drafting note left in mid-document');
});
