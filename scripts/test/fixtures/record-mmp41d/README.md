# Fixture: a Record chain from MiniMaxi trial mmp41d

`record/` is the Record folder of MiniMaxi trial mmp41d (local brain, cl1a-mirror, 0 platform loops, @descix/frqtl-web
0.6.0-p4.1): each Record is the package's closed Record (the world's `exp.startRecord()`, closed by `rec.stop()`:
`record.json`, the clips, `parts.before.json` / `parts.after.json`, `project/` with its `frqtl.json`), plus the lab's
`lab.json` and, in the hand-back Record, the three stills, as `minimaxi/loop.mjs` wrote them through
`site/app-assets/maxi-record-folder.js` `assembleLoopRecords` and the package's node writer. It is the gate's fixture for
`scripts/gen-memories-seen.mjs` (`scripts/test/seen-memory.test.mjs`), the plan check and the loop's publish-or-draft
test, never a memory.

- `record-01/` is the first world: the registry's cl1a-mirror, one `see` (the mirror at 45 degrees), no change. The
  Builder's `openSketch` closed it.
- `record-02/` is the hand-back Record: the Builder's own sketch of the mirror, its parts declared in
  `export const parts`; `setDeclared` mirror {orientationDeg: 45 → 30}, `see`, `dragTo` mirror to centre [300, 200]
  (one `move` row in the shape the mirror is declared by, {rect}, written on the drag's arrival, inside its clip); the Owl
  approved in round 1. Every tick is on the Record's own clock.
- `turns/mmp41d/` holds the trial's own answers (`<n>-<role>.answer.md`, as `minimaxi/loop.mjs` read them). The prompt
  turns are not kept, because they carry local paths. The tests copy the folder to `<root>/minimaxi/out/turns/mmp41d/`,
  beside the turns the Record's `threads` name, because a published memory serves the answers under
  `site/memories/<id>/turns/`.
- One file was removed after the trial: `record-01/clip-01.mp4`, so the chain's first Record is incomplete, as the tests
  that read only the hand-back Record need.
- The trial's lab.json carries no `teaching` (the human's words on a Record demonstration): the teaching test adds them to
  its scratch copy of `record-02/lab.json`, never to this folder.
