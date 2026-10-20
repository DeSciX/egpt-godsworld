## DeSciX lane
LANE: app          ENV: PROD (read .descix/workspace.json; `descix whoami` must print prod, chosen by env.apiUrl — never by an environment variable)
SDK: the published @descix/cli and @descix/app-sdk only, as an external developer — the handbook below, never platform source
INDEX: this file — a standalone public app repo; the HANDBOOK below is its reference
HANDBOOK: 1 `descix tell-me-how "<question>"`  2 the docs shipped inside @descix/cli (agent-assets/) and @descix/app-sdk (README.md)  3 the canonical app-developer runbook, live at https://descix.net/prod/daita-docs/site/app-sdk/app-developer-runbook.html
PLATFORM WALL: when the handbook does not answer — stop, write the question with evidence (command, output, the CLI's origin line), hand it to your orchestrator; the orchestrator asks the owner to open a platform session. Never open platform source to answer it.

# egpt-godsworld — Gods World, Maxi's Lab: a PROD app of the egpt community
Public URL https://egpt-godsworld.descix.net/ (godsworld.ai 301-forwards to it); app id `egpt-godsworld`, community `egpt`.
One site, one repo: this repo builds and uploads this app; nothing else uploads to it, and no other app's files live here. The front page is generated from the shared EGPT front-page template and this app's content block in EGPT-Evidence `site-src/frontpage/egpt-godsworld.json`; only the built OUTPUT lives here.
CLI: no package.json here, so every command is `npx -y -p @descix/cli@4.2.0 descix …` from this root; its first line reads `env: prod (.descix/workspace.json env.apiUrl) https://descix.net` (measured 2026-10-15).

## State
- `.descix/workspace.json` (v3, PROD) maps `egpt-godsworld` with its site at `site`; `.descix/manifests/site.json` is the upload allowlist; the site is uploaded (`/prod/egpt-godsworld/site/share.json` and `app.html` answer 200, measured 2026-10-15).
- Login is done (`whoami` answers the owner's valid PROD session here); never re-run it.
- `site/app.html` is Maxi's Lab: its view through `app-assets/maxi-host-view.js` (NoChrome on a phone, CodeSite otherwise), Maxi's conversation as the lab's own panel.

## Layout
`site/` is the only directory uploaded: `index.html` (front page; a query-string load forwards to app.html), `app.html` (Maxi's Lab, `app-assets/maxi-lab.js`, Maxi's conversation in its own panel; both pages declare their view through the one call site `app-assets/maxi-host-view.js`, the package's `@descix/frqtl-web/host-view` declarer), `scene.html` (the scene document maxi-lab.js replaces per load), `share.json` (title, description, `default_view` CodeSite — the view the shell paints first on this app's own domain, before maxi-host-view.js asks NoChrome on a phone — icon, og_image, twitter_card, apple_touch_icon; it must pass `@descix/app-sdk/share`, gated by scripts/test/share.test.mjs), `images/` with `images/share/` (favicon.ico, icon-180.png, share-1200x630.png), `DeSciXAppSDK.js` (vendored), `vendor/frqtl-web/` (the pinned @descix/frqtl-web, imported by specifier through the import map in index.html, app.html and scene.html), `memories/` (per memory: its filmed clip and early/mid/settled stills, plus `tile.png` when its card has a `tile:` line; atomic-model has only its tile, no clip yet). A new file must be added to the site manifest's `include` (`.descix/manifests/site.json`) or the upload silently leaves it out. No root-absolute paths: PROD serves the bundle under `/prod/egpt-godsworld/site/`, `descix serve` under `/p/egpt-godsworld/`.

## Serve
The workspace maps the site (`env.app.site.static` is `site`), so `npx -y -p @descix/cli@4.2.0 descix serve` from this root; open the gateway ROOT `https://localhost:5173/` (not `/p/egpt-godsworld`). Files are read from disk per request: rebuild, refresh, no restart.

## Upload
`npx -y -p @descix/cli@4.2.0 descix site upload -a egpt-godsworld --dry-run` (read the upload list and "Would remove from the server"), then the same without `--dry-run`. Served == built: `shasum -a 256 site/index.html` equals `curl -fsS https://egpt-godsworld.descix.net/prod/egpt-godsworld/site/index.html | shasum -a 256`. Share card: `curl -sS -A 'facebookexternalhit/1.1' https://egpt-godsworld.descix.net/ | grep -o '<title>[^<]*</title>\|property="og:image" content="[^"]*"'` must print this site's title and og:image; the edge caches a share.json MISS for 300 s after the first upload that introduces it.

## Rules
- Never hand-edit `.descix/workspace.json`: `descix app init`, `descix app set-site`, `descix app set-localpath`, `descix app unmap` and `descix config …` are its only writers.
- Never run `descix login` (the owner's passkey). Never open or copy `.descix/wallet.json`: a single-holder credential. `Authentication required` is reported to the orchestrator, not repaired.
- No `DESCIX_API_URL` anywhere, no `--env`/`--api-url`: the environment is the workspace file's. A first line naming any other source is a stop.
- One CLI call at a time: two in one workspace race the same credential rotation.
- `app set-listed`, any chain-writing command, any account change: the owner's acts.
- Committed to main means pushed.
