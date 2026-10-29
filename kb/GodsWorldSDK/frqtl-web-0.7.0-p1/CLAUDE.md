# @descix/frqtl-web

A discrete cellular-automata physics engine (compiled Rust → WASM) for realtime, emergent simulations
in the browser. Physics comes out of local per-pixel rules — a frame moves one pixel per tick, single
occupancy, momentum — rather than force equations or wave PDEs. Double-slit fringes, wave interference
and blackbody spectra are computed live from the automaton, not replayed.

`0.7.0-p1` (npm dist-tag `next`). The node twin is `@descix/frqtl-node` (the same modules,
plus `bootNode` and the hosted eyes).

## Install
  npm install @descix/frqtl-web

## See it run
The showcase scenes, in STUDIO and the GYM: https://egpt-frqtl.descix.net

## A scene is a sketch
A scene is an ES module whose default export is `buildExperiment(exp)`. Its first statement is the
co-init call — `exp.createCanvas(w, h, cfg)` for a 2D world drawn by p5, `exp.createScene(w, h, d, cfg)`
for a 3D world drawn by three — the only place the world's size is written. It imports its parts from
`@descix/frqtl-web/parts`.

```js
import { SphereEmitter } from '@descix/frqtl-web/parts';
export default function buildExperiment(exp) {
  const SRC = { preset: 'spherical', emissionBoxSide: 0, is2D: false, chargeMode: 'random', fundamentalDimension: 2 };
  exp.createScene(480, 480, 480, SphereEmitter.worldCfg(SRC));
  exp.addObject('SphereEmitter', SRC);
}
```

Its movable parts are DATA: `export const parts = { name: [Kind, { …props }] }` (Kind an imported class, the
key its name), declared by one `exp.declare(parts)` in key order. A hand on a declared entry is written back
into that literal by the `recipeContext` a project boot returns: `await recipeContext.toSketch()` → `{ files,
changes, refused }` (only touched values change; a new kind brings one import line; a code-declared object is
refused by name), and `await recipeContext.setDeclared(name, patch)` changes one entry and re-runs in place
(seed and camera kept). `await recipeContext.fork(name, NewKind, { by })` copies that entry's part file into the folder as
`parts/<NewKind>.js` (class renamed, imports rewritten to package specifiers), points the entry at it and re-runs in place.
`runner.declared` rows read `inParts` and `module`.

Read a real part before writing your own: `https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.7.0-p1/dist/frqtl/parts/DetectorWall.js`.

## Boot it — the two doors (`@descix/frqtl-web/boot`)
  bootScene(mount, buildExperiment, { renderer: 'p5' | 'three', seed, onTick, render })
      → { runner, recipeContext, display }            the sketch is an imported FUNCTION
  bootProject(mount, { files: { 'sketch.js': text, 'parts/MyEmitter.js': text }, entry: 'sketch.js' }, { renderState, seed, onTick })
      → { runner, recipeContext, display, retainedRenderRows }
  bootProject(mount, { url: '<served folder>/', entry: 'sketch.js' }, opts)
  bootProject(mount, { files: { 'frqtl.json': text, 'sketch.js': text } }, opts)   frqtl.json names the entry

A project's files import each other by relative specifiers (`./parts/MyEmitter.js`) and the package by
`@descix/frqtl-web/...`; an import that names no project file, an import of a non-module file (not `.js` /
`.mjs`), an unreached module file, or a cycle, is refused naming the file. `frqtl.json` (`./project`
`manifestFor` / `serializeManifest` / `parseManifest`, keys `MANIFEST_KEYS`) names the entry; a README rides
along unhashed. `linkProject` returns `{ buildExperiment, module, manifest, files, urls, project }`.
One boot per document (a second throws naming the re-scene door). Every load failure paints an overlay
in the mount and rejects. The runner's SceneRecord carries the project's identity (`projectIdentity`,
`./project`) as `sourceSha256`.

A page with no build step needs an import map; render it from the package's own table:
`importMapFor('<the dist root URL>/')` (`./project`) — every `@descix/frqtl-web/...` row at its file; a host page that
imports `./boot`, `./registry`, `./project`, `./host-view` or `./site-graph` by specifier renders `pageImportMapFor(...)` instead; it has no manifest
row, so read the manifest from the same root: `new URL('dist-manifest.json', root)`. A page that holds only its map
recovers the root through `FRQTL_WEB_HOST_SPECIFIERS`: `imports[row.specifier]` minus `row.libPath`.
The root is an absolute URL or starts with `/`, `./` or `../`. A sketch held as text boots as `bootProject(mount, sketchProject(text))`.
Or skip the map: `<script src="https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.7.0-p1/dist/frqtl-web.min.js"></script>` then `FRQTL.bootScene(…)`,
`FRQTL.Wall`, …

String kinds: `exp.addObject('Wall', props)` resolves the kind in the SCENE's realm (the frame the scene
runs in). A host that drives a scene in an iframe passes the string through that frame's `recipeContext`;
it never resolves a kind in its own document, whose classes (`./parts` and `./project` register the published
parts there too) are not the frame's.

## Exports
| subpath | what |
|---|---|
| `.` | the parts (`Wall`, `SphereEmitter`, `Tunnel`, `FrqtlVision`, …), `bootScene`, `bootProject`, `engine`, `engineState`, `FrqtlCapture`, `RenderStages`, `FieldBuilder`, `CaptureEnvelope`, `validateRendererProvider` |
| `./boot` | `bootScene`, `bootProject` (in node it throws naming `@descix/frqtl-node`) |
| `./parts`, `./parts/*` | the parts barrel; one part = one file |
| `./project` | `FRQTL_WEB_SPECIFIERS`, `libPathOf`, `importMapFor`, `pageImportMapFor`, `FRQTL_WEB_HOST_SPECIFIERS`, `linkProject`, `sketchProject`, `SKETCH_ENTRY`, `projectIdentity`, `MANIFEST_FILE`, `MANIFEST_KEYS`, `normalizeManifest`, `parseManifest`, `serializeManifest`, `manifestFor`, `RECORD_FILES`, `RECORD_KEYS`, `CHANGE_KEYS`, `OPS`, `BY`, `CLIP_SECONDS`, `CLIP_NAME`, `clipName`, `jsonText`, `rowFaults`, `recordFolderFaults`, `applyRows` (stands alone: no other import is needed) |
| `./registry` | the roster contract and its readers. A host's scenes are its own: a roster (JSON, beside the scene files) names them, and the package ships no scene rows. `ROSTER_KEYS`, `normalizeRoster(json, href)` → the frozen bag every reader takes first; `loadRoster(href)` the one loader (`href` absolute; a page reads it with `rosterHrefOf(document)` off `<link rel="frqtl-roster" href>`); scene rows (`walkthroughById`, `walkthroughModes`, `defaultWalkthroughModeId`, `effectiveRenderState`, `walkthroughIs3D`, `firstContactOf`, `sceneGroups`, `sceneUrlOf`); showcase cards (`exhibitFor`, `sceneKey`, `showcaseCard`, `showcaseIntro`, `showcaseHref(roster, card)` relative to the serving site, `showcaseUrl(roster, card)` absolute on the roster's `showcase.siteOrigin`); `projectOf(roster, id, { mode })` → `{ manifest, files, renderState }`, `emptyProjectOf({ router })` (the Empty Universe, package content); how STUDIO resolved the link it opened with (`STUDIO_LANDING_ATTR` on `<html>`, a `STUDIO_LANDING_OUTCOMES` id) |
| `./studio` | `dist/studio/app.html`: STUDIO, the scene editor and GYM, as a page (its directory is the bundle); it reads its scenes from the roster its `<link rel="frqtl-roster" href>` names |
| `./site-assemble` | node only (a page import refuses, naming node): `assembleSite({ out, build, rosterHref, webDist, mathDist })` writes a static site from the dists — STUDIO with its build stamp, import map and roster link, the stamped graph, the entry pages — and proves it (`siteGraphFaults`); `stampSiteBuild`, `writeRosterLink`, `placeEntryHtml` |
| `./kinds` | `registerKind`, `kindNamed`, `kindOf` (the parent's row, frozen), `registeredKinds` — a composed fork registers its renamed class |
| `./host-view` | `declareHostView`, `HOST_VIEW_OUTCOMES`, `CONTRACT_VIOLATIONS`, `HOST_SDK_SCRIPT` — the DeSciX host-view declarer an app calls once, under its own policy |
| `./site-graph` | `SITE_GRAPH_DIR`, `SITE_BUILD_ATTR`, `SITE_BUILD_ID_RE`, `siteBuildStampOf`, `STATIC_APP_PAGE`, `SITE_STUDIO_DIR`, `HOST_PROVIDED_ATTR`, `SITE_PLACEMENTS`, `SITE_ENTRY_PAGES`, `isSiteEntry`, `siteGraphFaults` — the static site's shape (graph directory, build-stamp attribute, build id pattern and its reader, IDE entry page, the attribute declaring a file host-provided, the graph directory of each placed package, the entry pages) and the rule that a served graph is the placed releases' bytes, for a reader of a served site (both packages) |
| `./shim/controls/registry.js`, `./shim/render/sun-look.js`, `./compat/renderer/display-slot.js`, `./compat/renderer/orbit-bag.js`, `./objects/setup/_collisionMatrixLanes.js`, `./compat/engine.js` | the six non-part modules a scene may import (the rows of `FRQTL_WEB_SPECIFIERS`) |
| `./objects/objects/tagger.js`, `./objects/schema/index.js`, `./shim/render/heat-colormap.js`, `./objects/schema/valueNormalizer.js`, `./objects/objects/Box.js`, `./objects/objects/QuantumEmitter.js`, `./shim/expr/ast-schema.js`, `./objects/objects/actionCompiler.js`, `./objects/v1-replacements.js`, `./objects/objects/slitLinerScatter.js`, `./objects/setup/setupSphereEmitter3D.js`, `./objects/objects/directedRedirectProgram.js`, `./compat/renderer/lo-drawn-center.js`, `./objects/setup/setupTunnelPointExit.js`, `./objects/constants/WallBehaviors.js`, `./objects/objects/absorbRadiation.js`, `./objects/geometry/SlabFace.js` | the 17 part-internal modules a forked part file imports (the `tier: 'part-internal'` rows of `FRQTL_WEB_SPECIFIERS`): not a scene API — the linker admits them only from a `parts/*.js` file — and they move with the parts |
| `./dist-manifest.json` | sha256 of every dist file (check a self-hosted copy against it) |
`dist/frqtl-web.min.js` is a file, not an export.

Self-hosting: serve an unmodified copy of `dist/` and import the doors from YOUR copy — every file a
module loads resolves relative to that module's own URL.

## Eyes
`FrqtlCapture` and `FrqtlVision` (`runner.capture(stage)`, `FrqtlVision.attach(runner).getStill(stage)`,
`.record(opts)`) look through THIS page's own render stack. From node, the same composite comes from the
hosted eyes in `@descix/frqtl-node/eyes`.

No CLI ships with this package. FRQTL scenes are fractal and non-linear, so a static numeric check cannot
tell you a scene is right before you have drawn it — acceptance is visual: run a scene and look at it.

## The physics model (enough to code against)
Three primitives: time = 1 tick, space = 1 pixel, mass = pixel occupancy.
Everything is a Frame (recursive); there is no separate "particle" class.

  - A frame moves at most 1 pixel/tick per axis relative to its parent; excess
    intended motion accumulates as momentum (this is the speed limit).
  - Single occupancy: two quanta can't share a pixel; a failed placement is a
    collision (bounce/merge), not a force.
  - Interference fringes are the statistics of many discrete walks through the
    slits — the pattern builds up from individual quanta, not a wave equation.
  - Fullness (mass/capacity) sets two decoupled things: how often a frame steps
    (its effective speed) and its oscillation wavelength
    (wavelength = floor(capacity/mass × constant), minimum 4).
  - `doTick()` runs a fixed pipeline (inject → structure → physics → collect) and
    returns pure data; rendering is downstream.

## What this is NOT
  - Not a general PDE / force-integration physics library.
  - Not a math library — that is the sibling package @descix/egpt-math-sdk.
  - The published build is WASM-only on the engine side (compiled surface).

## Curated notebooks
Index: `https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.7.0-p1/dist/notebooks/notebooks.json`

## No account, credits, or tokens are needed for anything above.
