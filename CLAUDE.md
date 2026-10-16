## DeSciX lane
LANE: app          ENV: PROD (read .descix/workspace.json; `descix whoami` must print prod, chosen by env.apiUrl — never by an environment variable)
SDK: the published @descix/cli and @descix/app-sdk only, as an external developer — the handbook below, never platform source (nothing under Unkamon/DeSciX or any DeSciX_* tree)
INDEX: /Users/essam/Code/Unkamon/CLAUDE.md (imported at the end of this file) — repo map, runbooks, SME pointers, how modes switch
HANDBOOK: 1 `descix tell-me-how "<question>"`  2 the docs shipped inside @descix/cli (agent-assets/) and @descix/app-sdk (README.md)  3 /Users/essam/Code/daita/site/docs  4 the canonical app-developer runbook: /Users/essam/Code/daita/site/docs/app-sdk/app-developer-runbook.md (source DeSciX/V2_docs, rebuilt into the daita dist; live at https://descix.net/prod/daita-docs/site/app-sdk/app-developer-runbook.html)
PLATFORM WALL: when the handbook does not answer — stop, write the question with evidence (command, output, the CLI's origin line), hand it to your orchestrator; the orchestrator asks Sam to open a platform session in Unkamon (DEVPLANE). Never open platform source to answer it.

# egpt-godsworld — Gods World, Maxi's Lab: a PROD app of the egpt community
Public URL https://egpt-godsworld.descix.net/ (godsworld.ai 301-forwards to it); app id `egpt-godsworld`, community `egpt`.
One site, one repo: this repo builds and uploads this app; nothing else uploads to it, and no other app's files live here. The front page is generated from the shared template (egpt-courantgroup `site/index.html`) and this app's content block in EGPT-Evidence `site-src/frontpage/egpt-godsworld.json`; only the built OUTPUT lives here.
CLI: no package.json here, so every command is `npx -y -p @descix/cli@2.0.4 descix …` from this root; its first line reads `env: prod (.descix/workspace.json env.apiUrl) https://descix.net` (measured 2026-10-15).

## State
- `.descix/workspace.json` (v3, PROD) maps `egpt-godsworld` with its site at `site`; `.descix/manifests/site.json` is the upload allowlist; the site is uploaded (`/prod/egpt-godsworld/site/share.json` and `app.html` answer 200, measured 2026-10-15).
- Login is done (`whoami` answers Sam's valid PROD session here); never re-run it.
- `site/app.html` is Maxi's Lab: the whole frame through `app-assets/host-view.js`, Maxi's conversation as the lab's own panel.

## Layout
`site/` is the only directory uploaded: `index.html` (front page; a query-string load forwards to app.html), `app.html` (Maxi's Lab, `app-assets/maxi-lab.js`, Maxi's conversation in its own panel; both pages take the whole frame through the one declarer `app-assets/host-view.js`), `scene.html` (the scene document maxi-lab.js replaces per load), `share.json` (title, description, icon, og_image, twitter_card, apple_touch_icon), `images/` with `images/share/` (favicon.ico, icon-180.png, share-1200x630.png), `DeSciXAppSDK.js` (vendored), `vendor/frqtl-sdk/` (the pinned SDK), `memories/` (per memory: its filmed clip and early/mid/settled stills, plus `tile.png` when its card has a `tile:` line; atomic-model has only its tile, no clip yet). A new file must be added to the site manifest's `include` (`.descix/manifests/site.json`) or the upload silently leaves it out. No root-absolute paths: PROD serves the bundle under `/prod/egpt-godsworld/site/`, `descix serve` under `/p/egpt-godsworld/`.

## Serve
The workspace maps the site (`env.app.site.static` is `site`), so `npx -y -p @descix/cli@2.0.4 descix serve` from this root; open the gateway ROOT `https://localhost:5173/` (not `/p/egpt-godsworld`). Files are read from disk per request: rebuild, refresh, no restart.

## Upload
`npx -y -p @descix/cli@2.0.4 descix site upload -a egpt-godsworld --dry-run` (read the upload list and "Would remove from the server"), then the same without `--dry-run`. Served == built: `shasum -a 256 site/index.html` equals `curl -fsS https://egpt-godsworld.descix.net/prod/egpt-godsworld/site/index.html | shasum -a 256`. Share card: `curl -sS -A 'facebookexternalhit/1.1' https://egpt-godsworld.descix.net/ | grep -o '<title>[^<]*</title>\|property="og:image" content="[^"]*"'` must print this site's title and og:image; the edge caches a share.json MISS for 300 s after the first upload that introduces it.

## Rules
- Never hand-edit `.descix/workspace.json`: `descix app init`, `descix app set-site`, `descix app set-localpath`, `descix app unmap` and `descix config …` are its only writers.
- Never run `descix login` (Sam's passkey). Never open or copy `.descix/wallet.json`: a single-holder credential. `Authentication required` is reported to the orchestrator, not repaired.
- No `DESCIX_API_URL` anywhere, no `--env`/`--api-url`: the environment is the workspace file's. A first line naming any other source is a stop.
- One CLI call at a time: two in one workspace race the same credential rotation.
- `app set-listed`, any chain-writing command, any account change: Sam's acts.
- Committed to main means pushed.

## Index
The ecosystem index follows; its own LANE line is Unkamon's (platform), not this repo's.
@../Unkamon/CLAUDE.md

<!-- beast:begin — generated by daita-beast join.sh from plugin/templates/claude-block.md; a hand edit is undone by the next join -->
## Beast (how seats in this repo coordinate)

Protocol: DeSciX/daita-beast `docs/protocol.md`. Scripts: `/Users/essam/Code/daita-beast/plugin/scripts`. Sam reads one board: the issue titled "Pending decisions (generated)" in `eabadir/Unkamon`, and https://github.com/issues?q=is%3Aopen+label%3Adecision%2Cneeds-review+assignee%3Aeabadir . There is no standing intermediary: a seat files its own rows, posts its own status, and messages another seat only at a seam (`seats.sh address <SEAT>`).

Seats in this repo:
- **eabadir/CEO-COMMS** (platform, eabadir/Unkamon): orchestrator; where cross-repo decisions are filed
- **eabadir/GODSWORLD** (app, DeSciX/egpt-godsworld): the app's build seat: Maxi's Lab (egpt-godsworld), MiniMaxi, the GodsWorld KB and persona. Tracking: DeSciX/egpt-godsworld#1

**Your home.** Each seat's sessions run in its own home (`seat.sh where <SEAT>`): the checkout, a worktree `<repo>.seats/<LABEL>` on branch `seat/<LABEL>`, or a wrapper `~/.beast/homes/<login>/<LABEL>` opened with its `claude.sh`. A session started in a home is told its seat by the plugin's SessionStart hook. A new seat is made with `seat.sh new <LABEL> --role "<text>" --tracking <owner/repo#N>`, which prints how to open it.

**At every session start, and after any reload or compaction:** `join.sh <SEAT>` from your home (records your address, regenerates this block, lists memory files that duplicate GitHub state), which ends by printing `resume.sh <SEAT>`: your last handoff, your notes and your inbox. Then re-read this file. A long inbox or a handoff to draft: hire the `seat-clerk` agent, which drafts and never posts.

**Before a compaction or a shutdown:** `status.sh <your tracking issue> --seat <SEAT> --state handoff --next "<next act>" --text "<state, waiting on, branches, gotchas>"`.

**Board or desk.** Ask: would a development team put this on a PR or an issue for the lead's approval? Yes → the board: a code change is the PR itself, `pr.sh request <pr> --seat <SEAT>` (merge on his approve with `pr.sh close <pr> --merge --words … --record … --by <SEAT>`, `--rejected` on reject); an act without code (deploy PROD, release, spend, chain, secrets, scope, a design approval) is a decision row. No, it is a question across the desk (a name, a rewording, which option, a clarification) → your desk: `desk.sh ask <SEAT> --text "…" [--options "a | b"] [--default a]`; words he types to you for an ask go on with `desk.sh answer <SEAT> <n> "<verbatim>"`; a durable note to another seat is `desk.sh msg <TO> --from <SEAT> --text "…"`. The desk never touches the board.

**The board is a queue.** A decision row: `decision.sh new --repo <the repo it decides> --assignee eabadir --seat <SEAT> …` (six sections). A significant decision Sam gives you in session (scope, engine, ship-or-cut, release) is filed and closed in one act: `decision.sh record … --words "<verbatim>" --record "<commit — path>" --by <SEAT>`; a minor word (wording, copy, a link) goes only into the repo's dated record. You close on his words with `decision.sh close <row> --words … --record … --by <SEAT>`. At each wake run `decision.sh inbox <SEAT>` (board rows, then your desk; computed from GitHub, nothing local) and ack what you act on: `ack.sh <row or desk> --seat <SEAT> --state seen|executed|blocked --next "<act>"`. Status goes on your tracking issue at a blocker, a completion or a seam, never a tick.

**Where state lives.** Your role: this repo's agent definitions and CLAUDE.md. Your working state: your newest handoff on your tracking issue, never in auto-memory. What you must not relearn on another surface: your notes, one `BEAST-NOTES` comment on your tracking issue (`notes.sh <SEAT> show|set --text-file <f>|append --text "<line>"`). Your home's auto-memory: lessons about this repo only. Two seats never share a home.
<!-- beast:end -->
