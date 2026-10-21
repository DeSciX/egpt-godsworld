# Fixture: the Record of MiniMaxi trial mmt41a, a round that ends where it started

`record/record-01/` is the hand-back Record of MiniMaxi trial mmt41a (local brain, dse-tunnel-rebuild, @descix/frqtl-web
0.6.0-p4.1), a chain of one with nothing carried. It was published as the memory mm-dse-tunnel-rebuild-t41a and then
retired as "no change": its start is its own `parts.before.json` (round 2 opened on the world round 1 left), and its
`parts.after.json` equals it, because its two rows re-staged the screen to the stock place and then moved it back. The plan
check (`site/app-assets/maxi-record-folder.js` `recordPlanFaults`) refuses it as `NO_CHANGE`. It is a gate fixture,
never a memory.

- The files are the served folder as it was published (the clips, the stills, `record.json`, `lab.json`, the parts files,
  `project/`), without the roles' answers (`turns/`).
- Its `lab.json` carries no `start` (the trial ran before Records carried their start). The tests add it in their scratch
  copies (`scripts/test/plan-faults.test.mjs`, `scripts/test/record-folder.test.mjs`), never to this folder.
