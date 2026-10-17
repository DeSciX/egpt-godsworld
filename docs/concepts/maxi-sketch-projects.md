<!-- Copyright 2023-2026 by Essam Abadir -->
# Maxi on sketch projects

This doc covers how Maxi's lab reads, rewrites, records and remembers a scene once FRQTL scenes are sketch projects. Authority: FRAQTL `docs/internal/concepts/SKETCH_PROJECTS.md` (approved 2026-10-15; cited below as "the design §n"). The rules this repo applies: `docs/rules.md`. These bounds still hold, from `docs/rules.md`:
- Maxi's eyes are video only.
- The Owl sees only the outline, the prediction and the footage.
- Maxi's knowledge is self-contained in this repo.
- Maxi never reads engine source.
- Scenes are memories.
- Paths are pixels relative to an object's left, top.

Sam has confirmed these names: `parts`, `exp.declare`, `exp.setDeclared` and `frqtl.json`. Each package door below is named for the pre-release that publishes it (P0b, P0c, P1, P2, P4; §7). Where the package has not fixed a spelling yet, this doc marks the name *(illus.)*. Examples are `toSketch`'s result shape, the `inParts`/`module` field names, `projectOf`, `projectIdentity` and FrqtlVision's subpath. The lab never hard-codes such a name: it reads it from the vendored package. Each open item is a numbered row in `.scratch/verdicts/maxi-sketch-projects-gaps.md` (G1…), cited here as (G n).

## 0. The one rule

A scene is a folder: `frqtl.json`, `sketch.js`, optional `parts/`, optional `renderer.js` (the design §1). Inside `sketch.js`, Maxi rewrites ONE region: `export const parts = { name: [Kind, props], … }`, which `exp.declare(parts)` declares. A hand never rewrites the author's code: the world call, the tick functions, anything outside `parts`. A hand edit IS a code edit (the design §5).

## 1. How Maxi reads a scene folder

### 1.1 Memories

A memory stays three Markdown files in `kb/GodsWorld/memories/`, because the GodsWorld KB ingests Markdown: `<id>-card.md`, `<id>-build.md` and `<id>-seen.md`. The runnable project and the media sit under `site/memories/<id>/`, because only `site/` is served (§3.4).

`<id>-build.md` is the project as text:
- The header (generated) carries:
  - the load line;
  - the project's `frqtl.json` verbatim on one line;
  - the project identity sha256, computed by the package's one published identity function `projectIdentity(project)` *(illus.)* (the design §4; P0c). Its recipe: for each file, in ascending byte order of its path, the path (UTF-8, `/`-separated, root-relative, no leading `./`), a 0x00 byte, the decimal byte length, a 0x00 byte and the raw bytes. The identity is the sha256 of the whole. There is no normalization, and `frqtl.json` is hashed like any other file.
- The hand-written `How to extrapolate:` note follows the header.
- Then comes ONE fence per project source file, in manifest order. Manifest order is presentation only; it plays no part in the identity. A fence's info string is `js <path>` (`js sketch.js`, `js parts/MySphereEmitter.js`, `js renderer.js`). `frqtl.json` and `README.md` get no fence: the header carries the manifest, and a README is prose for the card.
- `// memo:` lines inside any fence are Maxi's notes. Every other line of a fence is byte-identical to the project file at that path.

`scripts/gen-memories-build.mjs` stays the one writer of build memories, and its rules are unchanged in kind:
- It reads each project from the pinned vendored package, rewrites the header, and keeps the note and the fences byte for byte.
- If any file's stripped fence differs from the source, it fails loud and names the file. The memo lines are then re-made by hand.
- `stripMemos` and `fenceOf` become per-fence.

`scripts/test/memories.test.mjs` gates each build memory:
- One fence per file named by the manifest, with no file missing and no extra fence.
- Each fence's stripped code equals its file's bytes.
- The header sha equals what the package's own `projectIdentity` returns for the project. The gate calls the published function and never re-derives the recipe.
- Each fence parses as an ES module: written to a scratch `.mjs` and passed through `node --check`, which parses `import`/`export` without resolving them. This replaces `new Function(code)`.
- `sketch.js` has `export default function buildExperiment(` in place of today's `/function buildExperiment\s*\(/`.

The engine-tell rule (`TELL`/`CITE`) is unchanged. Whether a memo line may cite a package part file, and with which marker, waits on Sam's persona ruling (G19).

### 1.2 The roster

`kb/GodsWorld/memories/roster.json` is still written only by `scripts/gen-memories-roster.mjs` from the vendored registry. Each row's `source: "scenes/<file>.js"` is replaced by:
- `project`: the folder path relative to the vendored dist, as the registry gives it;
- `files`: the manifest-ordered list read from that folder's `frqtl.json`.

A Maxi-made memory (`mm-…`) that joins the roster carries `project: "memories/<id>/project"`, relative to `site/`. The registry read that returns a project, `projectOf(row)` *(illus.)* → `{manifest, files}` with the row's `renderState` beside it, lands at P2 (G6a).

### 1.3 The loading hands

| Hand | Reads | Boots |
|---|---|---|
| `loadScene{id, mode?}` | the registry row → its project (manifest + files) | The project, through the package's boot door `bootProject(mount, {files, entry}, opts)` (P0c; G4), into a fresh `scene.html` frame. One project per document, as today (maxi-lab.js::mountScene). The result is `{runner, recipeContext, display, …}`. `bootRecipe` throws naming `bootProject` |
| `sceneSource{id}` | the same project | Nothing. It returns `{id, project, manifest, files: {"sketch.js": text, "parts/…": text, …}}`: every file of the project, verbatim. A part imported from the package is not a project file, so it is not returned (§2.4) |
| `openSketch{source, forks?}` | Maxi's own text. `source` is `sketch.js`; `forks` is `{"parts/<Name>.js": text}`, files under `parts/` only | A project the lab assembles. `frqtl.json` is generated (`{name: "sketch (Maxi)", kind: "scene", entry: "sketch.js"}`) and `id` is null, as today. A single `.js` file is a one-file project (the design §5) |

`bootProject` needs `entry` until P2 makes `frqtl.json` its source. Until P2, the lab passes `entry: "sketch.js"`. Between P0c and P2, the registry still returns one source, which the lab boots as the one-file project `{files: {"sketch.js": source}, entry: "sketch.js"}`.

What changes in the lab:
- `state.scene` keeps `project: {manifest, files}` in place of `source`. It keeps the path of each file.
- The read-only code pane (maxi-lab.js::renderCode) shows `sketch.js` first, then each `parts/` file, from the CURRENT text (§2.1).
- The renderer is whatever `sketch.js` imports (the design §3). maxi-lab.js::derivedRenderer (a regex over the source) is deleted. The lab reads which display booted from the one display fact: `display` in `bootProject`'s result, which the package's display slot owns (P0b; G6b). `window._egptRenderer` throws on read.

### 1.4 The stage line

The stage line already gives:
- the scene id, or "a sketch booted by openSketch";
- the registry modes;
- 2D/3D, from `worldShape`;
- the canvas, the camera and the viewer axis (`viewerOf`);
- every declared part's span and centre (`spansOf` → maxi-roles.js::extentWords).

It gains, per declared object, where the part comes from and whether a hand can write it:
`mirror (Wall · package part · in parts): spans x 360..380, y 80..320; centre [370, 200]`
`mine (MySphereEmitter · parts/MySphereEmitter.js · in parts): centre [100, 100]`
`trace (Trace · package part · declared in code, not in parts — hands cannot write it): …`

Both facts come from the runner, never from re-deriving the text:
- Each `runner.declared` row carries `inParts` (boolean) and `module` *(field names illus.)* (P1; G11). `module` is a package specifier or a project path.
- maxi-hands.js::INVENTORY_KEYS stays the one key list. Each `objects[]` row ferries `inParts` and `module` from the runner row as is.
- maxi-roles.js::stageOf validates the two keys. `extentWords` prints "package part" for a package specifier, and the path for a project file.

## 2. What Maxi rewrites

### 2.1 One region, two doors

Maxi rewrites only `parts`. Every rewrite goes through the package's one writer, `exp.toSketch()` → `{files}` *(shape illus.)* (P1; G7). The writer is a host call the lab makes at the END of an act; it never runs per placement. The writer regenerates `parts` from the live declared graph. Whether a rewrite keeps the untouched entries' expressions and comments (`Math.round(W * 0.6)`, loops, comments) waits on Sam (G10). Until he rules, a rewritten `parts` carries literal values.

Outside `parts`, the writer adds exactly one kind of line. When a kind is newly in `parts` and `sketch.js` does not import it, the writer adds ONE import line after the last import statement: the barrel's specifier for a package part, `./parts/<Name>.js` for a fork. If the kind has no importable module, the writer refuses it by name. An added key goes LAST in `parts`, so every existing entry seeds as before. Every pre-existing line stays byte-identical (P1; G8, G9).

| Door | What it is | Effect on the world | Effect on `sketch.js` |
|---|---|---|---|
| **live placement**: `writePosition` (maxi-hands.js). Reached by `moveObject`, `resize`, `revert`, `dragTo`, and the human's `drag`/`carry3d` (maxi-hand-tool.js) | WHERE a declared part is, while the world runs | The running world changes at once (`runner.placeDeclaredAt` / `updateObjectProperty`, unchanged) | The lab calls the writer once per act, which rewrites the part's `center`/`rect` entry in `parts`. The writer runs at the end of `moveObject`/`resize`/`revert`, at the last step of `dragTo`, and at the human's release. A per-tick placement inside a drag is never written to text |
| **declaration**: the hand `setDeclared{name, patch}`, over `exp.setDeclared(name, patch)` (the design §5; P1; G12) | WHAT a part is, and where the scene STARTS it: `orientationDeg`, `wavelength`, `burstSize`, `collisionBehavior`, `rect`, `center` | The entry is re-declared, and the scene re-runs from tick 0 in the SAME document, through the one restart door. A `rect` or `center` patch sets where the entry starts. The seed (the sketch's own `createScene`) and the camera pose survive, and the result says so | The entry in `parts` is rewritten with the patch |

Every rewrite announces itself once through `onWrite` (maxi-hands.js), which stays the change list's one source (§3.1). After any rewrite, the code pane shows the writer's current text.

### 2.2 Hands

| Hand | Under sketch projects |
|---|---|
| `setDeclared{name, patch}` | NEW. `patch` is a strict-JSON object of the kind's declared props. The package refuses an unknown prop, an undeclared name, or a name declared outside `parts`. The refusal comes back verbatim. It returns the package's result, `{set: name, from: {<each patched key>: <value before>}, to: patch, tick: 0, kept: ["seed", "cameraPose"]}` *(illus.)*, plus `objects: [names]`. A running Record is dropped by the re-run, as `restart` drops it today (maxi-lab.js::dropRecording) |
| `moveObject`, `resize`, `revert` | Live placement (§2.1), landed in `parts` at the end of the act. They are not sugar over `setDeclared`, because they never re-run the world |
| `dragTo` | Live placement: one `writePosition` per step inside the FrqtlVision recording, as built. The clip of the drag is the point. `parts` receives the final centre once, at the last step |
| `addObject{kind, opts}` | `kind` stays a string in the hand's JSON, because a `json:call` body cannot carry an imported value. `kindFor(name)` in maxi-hands.js passes the string through `recipeContext.addObject`. In the scene's realm, `exp.addObject('Wall', …)` resolves it through the package's registry (P0c; G1a). The writer appends the entry as the last key of `parts` and adds the kind's import line, or refuses by name (§2.1). An unknown name is the package's refusal, verbatim |
| `removeObject{name}` | Removes the part from the world and its entry from `parts` |
| `restart` | Re-runs the CURRENT `parts` from tick 0. Its `returns` text changes from "everything moved goes back to where the sketch put it" to: "the scene from tick 0 as its `parts` now say: what was moved stays moved; revert{} or loadScene{id} goes back". The promise holds because every act ends with a write |
| `grab`, `release`, `setCamera`, `pause`, `resume`, `inventory`, `see`, `record`, `showMemory`, `say` | Unchanged. `inventory` = the declared graph (the design §2: "inventory = … this object") |
| `loadScene`, `sceneSource`, `openSketch` | See §1.3 |

`openSketch` stays the only way to change the author's code, such as a tick function or the world call. It boots a new project (id null). The stage then names it as a sketch, and a plan for a registry id must load that id again (maxi-roles.js::parsePlan, unchanged).

### 2.3 String kinds

A string kind reaches the scene in one place: `kindFor` in maxi-hands.js passes it through `recipeContext.addObject`, and the registry resolves it in the scene's realm. The lab imports no kind lookup into its own document. The scene runs in a different frame, so a lookup imported into the lab would read a second, empty registry. The lab keeps no list of kinds, no `switch`, and no copy of `PLACEABLE_KINDS`.

Strings appear in exactly two places: an `addObject` hand call, and the Designer's plan (which names objects, never kinds). Inside `sketch.js` a kind is always an imported value. `exp.declare` refuses a string kind inside `parts` and names the import form (the design §2; P1; G1b). Maxi's own `openSketch` text imports its kinds, and the `openSketch` example in HANDS shows the import form (§5).

### 2.4 A forked part

A fork is a file under `parts/` (the design §3). The class name IS the kind name, so a fork renames its class (P0b; G26). A copy that keeps the original class name is refused as a duplicate kind, and the refusal names both files.

Maxi makes a fork in four steps:
1. He writes the file's text: his own code, a part composed from package parts, with its own class name.
2. He imports it in `sketch.js` as `./parts/<Name>.js`.
3. He declares it in `parts`.
4. He boots with `openSketch{source, forks: {"parts/<Name>.js": text}}`.

Forking by copying a PACKAGE part file means reading that file first, which waits on Sam's persona ruling (G19).

A fork is cited:
- in the change list, as `op: "fork"` with `from` the source kind name and `to: {"kind": "<new kind name>", "file": "parts/<Name>.js"}` (the design §6);
- in the Record's snapshot (§3.1), as a file;
- in a build memory, as its own `js parts/<Name>.js` fence. A memo line that learns from it cites `[src parts/<Name>.js]`.

## 3. The Record

### 3.1 One shape

Two producers write one folder per Record:
- the human's Record button (maxi-record.js::attachRecorder);
- the loop's approve (maxi-loop.js::createLoop, minimaxi/loop.mjs).

A Record is its own folder, and it CONTAINS the project it recorded (the design §6; P4). The folder is `site/memories/<id>/`:

```
site/memories/<id>/
  record.json          # the design §6: {tickRange, clips: ["clip-01.mp4", …], changes: [{tick, name, op, by, from, to}]}
  clip-01.mp4 …        # the footage: one file per 5–10 s segment (CLIP_SECONDS), in order
  parts.before.json    # the `parts` block when the Record started
  parts.after.json     # the `parts` block when it stopped; their diff IS the code change
  project/             # the snapshot at stop: frqtl.json, sketch.js, parts/… — replayable through bootProject
  lab.json             # the lab's own file (§3.2)
  early.png mid.png settled.png   # stills: a reading aid, never Maxi's eyes
```

`record.json` carries no record-level who. Who acted is each change's `by`. Which producer made the Record is the lab's fact, so it lives in `lab.json` (§3.2).

The change list keeps today's keys, `{tick, name, op, by, from, to}`, which are maxi-hands.js `onWrite` notices. Values are strict JSON.
- `op` ∈ moveObject | resize | dragTo | revert | drag | carry3d | setDeclared | addObject | removeObject | fork.
- `by` ∈ maxi | human.
- A placement carries `from`/`to` as `{center}` or `{rect}`, as built.
- A `setDeclared` carries in `from`/`to` the patched keys before and after. maxi-record.js::tupleText becomes `valueText`, which prints either form and still throws on anything else.
- An `addObject` carries `from: null` and `to` the new parts entry `["<registered kind name>", {props}]`; a `removeObject` carries that entry in `from` and `to: null`; a `fork` carries the source kind name in `from` and `{"kind": "<new kind name>", "file": "parts/<File>.js"}` in `to` (the design §6). The lab writes these in record.json's own vocabulary and never re-derives them.

`parts.before.json` and `parts.after.json` have the form `{"<name>": ["<registered kind name>", {props}]}`, in key order, with strict-JSON props. The kind is written by the name the registry resolves, so a replay resolves it through the same lookup. A fork's registered name is its class name. These two files replace today's `sketchDiff: null`. `SKETCH_DIFF_UNAVAILABLE` and its tripwire in `scripts/test/record.test.mjs` are deleted the day the vendored package ships the writer.

A Record holds at most 8 segments. The limit comes from the question door, which takes 8 attachments per turn, 8 MiB each and 16 MiB per turn (measured, three-roles record).

### 3.2 The lab's own file

A host's own fields live in the host's own file in the Record folder, never in `record.json` (the design §6). For the lab, that file is `lab.json`. It holds:
- `{producer: "record" | "loop", scene: {label, id, mode, renderer}}`.
- For a human Record: `asked: {interaction_id, answer_excerpt}`, which is Maxi's answer to the demonstration.
- For the loop: `{outline, plan, designerWords, steps:[{hand, args}], prediction, builderWords, owl:{seen:{contact, after, passes}, verdict, reasons, words}, threads:{designer, builder, owl}, rounds}`. This is the record `scripts/gen-memories-seen.mjs` reads today, moved here as is.

### 3.3 The loop's approve is a Record

The Builder's round is bracketed:
- `parts.before` is read at the Builder's first hand;
- `parts.after` is read at its `json:done`;
- the change list is every `onWrite` notice in between, including each `setDeclared`;
- the clips are the hand-back clip (the last one filmed);
- the snapshot is the project at `json:done`.

`setDeclared` re-runs the world, so a clip filmed before the round's last `setDeclared` does not show the build. maxi-loop.js therefore refuses `json:done` when a `setDeclared` follows the last clip, and names the rule. The loop still refuses to start while the human's Record or Hand is on (as built).

### 3.4 From a Record to a memory: the kb/site split

Served files go under `site/`:
- `site/memories/<id>/` holds everything served: the clips, the stills, `record.json`, `lab.json`, `parts.*.json` and `project/`.
- `showMemory` and maxi-lab.js::fetchMemory read clips here. `showMemory{id}` sends every segment as `media[]`, in order. Today it sends `clip.mp4`.

`kb/GodsWorld/memories/<id>-seen.md` is the text Maxi retrieves. `scripts/gen-memories-seen.mjs` generates it from `record.json` + `lab.json`; its role becomes "the one writer of a memory from a Record folder". The text contains:
- "RECORD, not Maxi's own sighting", with who recorded it (`lab.json.producer` and the changes' `by`);
- each clip, cited by its served path;
- the change list, as text lines;
- the `parts` diff, as before → after lines per entry;
- for a loop Record, the outline, plan, prediction and the Owl's account and verdict, quoted.

For a Maxi-made memory, `kb/GodsWorld/memories/<id>-build.md` is generated from `project/` (§1.1), with the extrapolate note left to be written. It is a DRAFT until the id joins the roster, as today's `mm-` drafts are.

The browser cannot write to this repo. A Record made in the PROD page reaches Maxi's knowledge only through a node run (MiniMaxi). A DeSciX-side save waits on Sam's call D (G18).

### 3.5 What the Owl never sees

maxi-roles.js::owlTurn stays the one owner of the Owl's turn: the outline, the prediction, the footage, and nothing else (G27). These items are material for a CODE verifier and never go on the Owl's turn:
- `parts.before/after`;
- `record.json`;
- the snapshot;
- the change list.

A code verifier is a lab test that runs the design §10 round-trip checks on a Record folder. The Owl's KB stays `General`, so the ingested memories never reach it. Changing this is Sam's call.

## 4. Prompts (maxi-roles.js)

### 4.1 The Designer's plan

```json:plan
{"scene": "<a scene id from your memories>",
 "registryMode": null,
 "changes": [{"object": "<a name in the scene's parts>", "patch": {"<prop>": <value>}, "why": "<one line>"}],
 "hands": ["<hand>", "…"],
 "prediction": "<what the finished clip should show, in words, before anyone has seen it>"}
```

The rules:
- `changes` describe the scene as it STARTS. Each one is literally the argument of one `setDeclared`. A starting place is a change too (`"patch": {"rect": [300, 80, 20, 240]}`).
- `hands` describe what happens while filming: `dragTo`, `record`, `see`.
- maxi-roles.js::parsePlan validates `patch` as a non-empty object. It refuses the old `param`/`value` keys by name, through `PLAN_REFUSED_KEYS` (no compat reading).
- `DESIGNER_PREFACE` drops "a part's own parameter … changes only in the sketch — sceneSource to read it, then openSketch with the edited source". In its place it says three things:
  - A part's parameter or starting place is a change `{object, patch}`, which the Builder applies with `setDeclared`, and the scene re-runs from tick 0.
  - The seed and the camera pose survive the re-run.
  - A part declared outside `parts` (the stage line says so) cannot be changed this way and needs `openSketch`.

### 4.2 The Builder's preface

`BUILDER_PREFACE` states:
- **What it may rewrite:** only `parts`, through four kinds of hand:
  - `setDeclared`, one per change of the plan, before filming;
  - the position hands;
  - `addObject`;
  - `removeObject`.

  The author's code (tick functions, the world call) changes only by booting an edited whole sketch with `openSketch`.
- **What it must film:** the hand-back clip comes AFTER the last `setDeclared`. A `setDeclared` re-runs the world, so a clip filmed before it shows a scene that no longer exists. A drag is filmed with `dragTo`. A view is filmed with `see` or `record`.
- For parameter changes, it drops "sceneSource{id} gives you the sketch text; change the value there and boot the whole edited sketch with openSketch{source}".

### 4.3 The Owl

`OWL_PREFACE` and `owlTurn` are unchanged (§3.5).

## 5. The persona's generated HANDS block

The block between `<!-- HANDS:BEGIN … -->` and `<!-- HANDS:END -->` in `assets/system_instructions.md` is rendered by `scripts/gen-hands-section.mjs` from `HANDS`, `HANDS_PREAMBLE` and `RECT_CONVENTION` (maxi-hands.js). It changes as follows:
- **Rows:**
  - A new `setDeclared` row.
  - `openSketch`'s `source` becomes an ES-module `sketch.js`: kinds imported, `export const parts = {…}`, `exp.declare(parts)`, `export default function buildExperiment(exp)`, and no dual-mode tail. The hand also takes `forks`.
  - `sceneSource` returns `files`.
  - `addObject` says the string is resolved by the scene's own registry.
  - `restart`'s returns are as in §2.2.
- **The `openSketch` example** is the published form.
  - `scripts/test/hands.test.mjs` checks its import specifiers against the package's exported specifier table, `FRQTL_WEB_SPECIFIERS` (P0c; G3b). They are never typed from a brief.
  - Its world config uses `SphereEmitter.worldCfg` from the parts barrel (P0b, vendorable at P0c; G2a).
  - The package names are settled (G3a): `@descix/frqtl-web` (browser, `/parts`) and `@descix/frqtl-node`; `@descix/frqtl-sdk` ends at 0.5.1, and the first `0.6.0-p0.N` pre-release on `next` already carries the new names.
- **`HANDS_PREAMBLE`** gains one paragraph, "YOUR SKETCH IS CODE YOU EDIT WITH YOUR HANDS". It says:
  - `parts` is the one region your hands rewrite;
  - a move lands there when the move ends;
  - `setDeclared` changes what a part is and re-runs the scene, keeping the seed and the camera;
  - the rest of the file is the author's;
  - a Record carries the `parts` before and after.
- **`RECT_CONVENTION`:** "Only what the scene DECLARED (exp.addObject)" becomes "Only what the scene declared (in `parts`, or by exp.addObject in its code)". "A thing a scene built with `new` … has no handle" is kept.

Sam's own text outside the markers is not edited. Where it disagrees with the generated block waits on his word (G20).

## 6. MiniMaxi and node

- **minimaxi/body.mjs** serves the repo root through `scripts/serve-site.mjs::siteHandler`. Every project folder under `site/` is therefore already served to the lab page the body drives: the vendored package's scenes and `site/memories/<id>/project/`. The body still runs no sketch in node. It drives the same lab page (`/site/app.html`) through `window.DeSciX_Actions`, so it runs the same files the page runs.
- **What changes in body.mjs:**
  - The reference eye's `openHostedEyes({sceneSource: {kind: 'module', source}})` becomes `openHostedEyes({sceneSource: {kind: 'project', files, entry}})` (P0c; G5). `{kind: 'module'}` throws, naming the project form.
  - `loadSceneSource(row)` becomes the registry's project read (P2; G6a).
  - The `--scene` id is unchanged.
- **minimaxi/hand.mjs** is unchanged. Hand names come from `HANDS`, so `setDeclared` arrives with the table.
- **minimaxi/loop.mjs:**
  - On approve, it writes a Record folder (§3.3) and the memory (§3.4) through the writer in `scripts/gen-memories-seen.mjs`, in place of today's `writeSeenDraft` record shape.
  - The run report under `minimaxi/out/runs/` gains the round's `parts.before/after`.
- **Node imports of a project:** only a code verifier needs them: a node test that links a Record's `project/` and checks it against `parts.after.json`. The door is `import { bootNode } from '@descix/frqtl-node'` plus `import(pathToFileURL(entry))` (P0c; G24). How node resolves the sketch's package specifiers waits on Sam (O1).

## 7. Rollout

The lab consumes only published, vendored package bytes: `site/vendor/frqtl-sdk/PINNED.json` and `scripts/test/sdk-copy.test.mjs` hash against the npm tarball. Nothing below can start in the lab before a package carrying it is published. Each pre-release is vendored and measured on a branch. The PROD site moves to a pre-release on Sam's word.

| Step | Lands in the lab | Gate (measured, red-first) |
|---|---|---|
| **P0b**: the game layer as ESM, built in FRAQTL's tree. Publishes nothing | Nothing vendorable. P0b fixes four facts the P0c changes stand on: the kind name is the class name (G26); one display fact, the slot (G6b); `SphereEmitter.worldCfg`, `Tunnel.pointExitSpec` and `CameraControls` in the parts barrel (G2a); `importMapFor(libRootUrl)`'s signature (G3b) | Red-first gate fixtures only |
| **P0c**: the pre-release on `next`, `0.6.0-p0.N` | `scene.html` renders its import map with the package's `importMapFor`, and frqtl-sdk.js resolves through it (G3b). maxi-scene.js boots through `bootProject` (G4), with a one-file project until P2, and imports `CameraControls` from the barrel (G2a). maxi-scene.js also imports FrqtlVision inside the scene frame and hands it to the lab on `window.MaxiScene`; maxi-hands.js and maxi-record.js `visionOf` read it there (G2b). The lab reads `display` from the boot result, and derivedRenderer is deleted (G6b). `kindFor` passes the string through `recipeContext.addObject` (G1a). The `openSketch` arg text, the example and `HANDS_PREAMBLE` move to the ESM sketch form. All 30 builds are regenerated: the generator fails loud ×30 and the memo lines are re-placed. Build headers carry `projectIdentity` (G22). The memories gate parses modules with `node --check` (G23). body.mjs passes the project form to the eyes (G5) | The memories gate is green on the 30 regenerated builds, and red on one planted drifted line and on one planted wrong identity. The hands test passes: the example parses and its specifiers are in the package's table; it goes red on a planted unknown specifier. A body run of one 2D scene (cl1a-mirror) and one 3D scene (cl1a-mirror-3d): `see` returns a 5–10 s clip, and `dragTo` moves the mirror inside its clip (LOOK at both) |
| **P1**: `exp.declare(parts)`, the writer, `toSketch`, `setDeclared`. Its pre-release waits on Sam (G21) | The `setDeclared` hand (G12). Position hands write through the writer at the end of each act (G7). The writer adds import lines and appends last keys, seen in the code pane (G8, G9). `exp.declare` refuses a string kind in `parts`, verbatim (G1b). The new `restart` promise. The plan's `changes[].patch`. Both prefaces. The stage line's `module`/`inParts`, read from `runner.declared` (G11). `parts.before/after` in place of `sketchDiff`. The 30 builds regenerated against the migrated block | On cl1a-mirror, `setDeclared{name:"mirror", patch:{orientationDeg:30}}` changes exactly one `parts` entry and leaves the author's code byte-identical; red on a planted second edit. Its result names the seed and camera pose as kept. Its clip shows the exit steered (the build memory predicts 240°), judged by the Owl from footage. `dragTo` writes `parts` once per act. `addObject` of an unimported kind adds exactly one import line. `json:done` is refused after a trailing `setDeclared` |
| **P2**: the project container. Its pre-release waits on Sam (G21) | `loadScene`/`sceneSource` read projects through the registry's project read (G6a). `frqtl.json` becomes `entry`'s source. Roster rows carry `project` + `files`. Build memories have one fence per file. Identities change once, because `frqtl.json` joins each project's content. `openSketch{forks}` | The memories gate goes red on a missing fence, an extra fence, and a drifted `parts/` file. A fork (Maxi's own part file, its class renamed) boots, declares, and is cited in its build memory. A fork keeping the original class name is refused naming both files |
| **P3**: the multi-file editor | The code pane lists the project files (read-only) | The pane shows the `parts/` files of a forked project |
| **P4**: the Record. Its pre-release waits on Sam (G21) | From both producers: `record.json` with `clips[]` and no record-level who (G14, G25), the change list's `from`/`to` shapes (G13), `lab.json` with `producer`, the segments, `parts.*.json` with kinds by registered name (G16), and `project/` inside the Record folder (G15). The seen generator reads a Record folder. `showMemory` sends the segments | A human Record and a loop approve each produce a folder that the code verifier replays: `project/` links, and its `parts` equal `parts.after.json`. The Owl's turn text contains no `parts` key; red on a planted one |
| **P5**: notebooks | Nothing | None |

Before P0c publishes, only red-first gate fixtures can be written. Nothing that ships changes.
