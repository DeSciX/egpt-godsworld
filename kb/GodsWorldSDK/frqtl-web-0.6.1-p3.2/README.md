# @descix/frqtl-web

FRQTL for the browser: a discrete cellular-automata physics engine (compiled Rust → WASM). Physics
comes out of local per-pixel rules — a frame moves one pixel per tick, single occupancy, momentum —
rather than force equations. Interference, blackbody spectra and atom-like binding emerge from the
automaton.

`0.6.1-p3.2` (npm dist-tag `next`). The node twin is `@descix/frqtl-node` — the same
modules, built from the same source.

## Install

    npm install @descix/frqtl-web

## A scene, booted

```js
import { bootScene } from '@descix/frqtl-web/boot';
import { SphereEmitter } from '@descix/frqtl-web/parts';

await bootScene('mount', function buildExperiment(exp) {
  const SRC = { preset: 'spherical', emissionBoxSide: 0, is2D: false, chargeMode: 'random', fundamentalDimension: 2 };
  exp.createScene(480, 480, 480, SphereEmitter.worldCfg(SRC));   // the world: the sketch's first statement
  exp.addObject('SphereEmitter', SRC);
}, { renderer: 'three', render: { shape: 'sphere', godrays: 0.8 } });
```

A sketch held as text — or a project with more files beside it — boots through `bootProject`:

```js
import { bootProject } from '@descix/frqtl-web/boot';
await bootProject('mount', { files: { 'sketch.js': sketch, 'parts/MyEmitter.js': fork }, entry: 'sketch.js' });
```

A project folder names its entry in `frqtl.json` — `{ "name", "kind": "scene", "entry", "version"? }`, any other
key refused by name — so a folder boots with no `entry` (one given beside the manifest must equal it). `./project`
owns the file: `manifestFor({ name, entry })` and `serializeManifest(bag)` write it, `parseManifest(text)` and
`normalizeManifest(partial)` read it against `MANIFEST_KEYS`. How a host boots the folder (display, seed, camera,
render rows) is its own `renderState`, never a manifest key.

```js
import { manifestFor, serializeManifest } from '@descix/frqtl-web/project';
const manifest = serializeManifest(manifestFor({ name: 'my-scene', entry: 'sketch.js' }));
await bootProject('mount', { files: { 'frqtl.json': manifest, 'sketch.js': sketch, 'README.md': notes } });
```

A sketch writes its movable parts as data, `export const parts = { name: [Kind, { …props }] }` (Kind an
imported class, the key its name), declared by one `exp.declare(parts)`:

```js
import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';
export const parts = {
  sun:    [SphereEmitter, { center: [70, 200, 0], preset: 'hemisphere', is2D: true }],
  screen: [Wall, { rect: [260, 40, 20, 320], collisionBehavior: 'absorb' }],
};
export default function buildExperiment(exp) {
  exp.createCanvas(600, 400, SphereEmitter.worldCfg(parts.sun[1]));
  exp.declare(parts);
}
```

The `recipeContext` a project boot returns holds that text: `await recipeContext.toSketch()` writes the hands
(a placement, a property write, a delete, a new object) into the `parts` literal and returns the files — only
the touched values change, a new kind brings one import line — and `await recipeContext.setDeclared(name, patch)`
changes one entry and runs the scene again in the same page, keeping its seed and camera.

Project files import each other by relative specifiers and the package by a `@descix/frqtl-web/...`
row of `FRQTL_WEB_SPECIFIERS`. Before anything runs, `bootProject` refuses, naming the file and the
specifier: an import that names no project file, one that climbs out of the project, an import of a file
that is not a module (`.js` / `.mjs`), a module file the entry never imports, a package path the table does
not offer, a cycle, an invalid `frqtl.json`, a served file that is not UTF-8. A served folder (`{ url }`) is
fetched once per file, as bytes, `frqtl.json` first (a 404 there is allowed only beside `entry`). The linked
set is `frqtl.json` plus the module files; any other file (a README) travels with the folder, unlinked and
unhashed. The runner's SceneRecord carries the project's identity as `sourceSha256`: `projectIdentity({ files })`
over the linked set's BYTES, a BOM included. `linkProject` returns `{ buildExperiment, module, manifest, files,
urls, project }`: the entry's default export, its module namespace (`module.parts` is the sketch's `parts`), the
normalized manifest (or `null` when linked by `entry` alone), the linked bytes, each module's minted URL, and the
held folder as text (every file given).

A fork of a part is a project file that extends the part and registers its renamed class — it imports only
public specifiers, so the same file resolves in every host:

```js
// parts/MySphereEmitter.js
import { SphereEmitter } from '@descix/frqtl-web/parts';
import { registerKind, kindOf } from '@descix/frqtl-web/kinds';
export class MySphereEmitter extends SphereEmitter {}
const base = kindOf(SphereEmitter);   // the parent's row, frozen
registerKind(MySphereEmitter, { from: import.meta.url, descriptor: base.descriptor, defaults: base.defaults, build: base.build });
```

`parts.mine = [MySphereEmitter, props]` (or `exp.addObject('MySphereEmitter', props)`) then builds it; the
writer imports it by its path (`import { MySphereEmitter } from './parts/MySphereEmitter.js'`). A copy that keeps the parent's class name is refused,
naming both files. A hand-written fork imports only public specifiers, as above.

`await recipeContext.fork(name, NewKind, { by })` makes the other fork, a full copy: it copies the part file of
the `parts` entry `name` into the folder as `parts/<NewKind>.js`, renames the class, rewrites the file's imports
to package specifiers (a part's internal modules resolve through the part-internal rows below), points the entry
at it, and re-runs the scene in the same page. It resolves `{ fork, file, from, files }`; `by` is required while
a Record is open. A part file copied by hand keeps its relative imports (`../objects/…`), which name package
internals: the linker refuses them, naming the file — `fork` writes the package specifiers for you. A part-internal
specifier is admitted only from a `parts/*.js` file, never from a sketch.

A project folder, saved and moved: the project identity is a sha256 through `crypto.subtle`, which a browser
offers only in a secure context: serve a folder from https or from localhost (e.g. `npx serve`). Import takes a
zip of the folder's CONTENTS (`frqtl.json` at the zip's root, as an Export writes it); a zip holding the folder
itself is refused, naming it.

No build step: load `dist/frqtl-web.min.js` with a `<script>` tag and call `FRQTL.bootScene(…)`
(`FRQTL.Wall`, `FRQTL.SphereEmitter`, …). A min.js page owns only `FRQTL` (and the booted page's
`FrqtlPage` seam); bind parts however you like. A page that uses ES modules without a bundler renders its
import map from the package's own table: `importMapFor('<dist root URL>/')` (`./project`); a host page that also
imports `./boot`, `./registry`, `./project`, `./host-view` or `./site-graph` by specifier renders `pageImportMapFor('<dist root URL>/')`;
it has no manifest row, so read the manifest from the same root: `new URL('dist-manifest.json', root)`. A page that holds only its map
recovers the root through `FRQTL_WEB_HOST_SPECIFIERS` (`./project`): `imports[row.specifier]` minus `row.libPath`. The root is an absolute URL or starts with `/`, `./` or `../`
(any other root is refused: a browser ignores its rows). `sketchProject(text)` (`./project`) is the one-file
project of a sketch held as text, for `bootProject(mount, sketchProject(text))`.

A DeSciX app asks its shell for a view once, under its own policy: `declareHostView({ sdk: window.DeSciX, mode,
fallback })` (`./host-view`), then reads the outcome from `document.documentElement.dataset.descixView` — a row of
`HOST_VIEW_OUTCOMES` (`requested:<mode>`, `fallback:<mode>` when the shell's published `view.MODES` lacks `mode` and
offers the optional `fallback`, `unoffered:<mode>`, …), the detail in `dataset.descixViewDetail`. A `fallback` must
differ from `mode`: `declareHostView` throws a TypeError when they are the same string. The app vendors
`HOST_SDK_SCRIPT` beside its page.

String kinds — `exp.addObject('Wall', props)` — resolve in the SCENE's realm. A host driving a scene in
an iframe passes the string through that frame's `recipeContext`; it never resolves a kind in its own
document, whose classes (`./parts` and `./project` register the published parts there too) are not the frame's.

## Exports

| subpath | what |
|---|---|
| `.` | the parts, `bootScene`, `bootProject`, `engine`, `engineState`, `FrqtlCapture`, `RenderStages`, `FieldBuilder`, `CaptureEnvelope`, `validateRendererProvider` |
| `./boot` | `bootScene`, `bootProject` (in node it throws, naming `@descix/frqtl-node`) |
| `./parts`, `./parts/*` | the parts barrel; one part = one file |
| `./project` | `FRQTL_WEB_SPECIFIERS`, `libPathOf`, `importMapFor`, `pageImportMapFor`, `FRQTL_WEB_HOST_SPECIFIERS`, `linkProject`, `sketchProject`, `SKETCH_ENTRY`, `projectIdentity`, `MANIFEST_FILE`, `MANIFEST_KEYS`, `normalizeManifest`, `parseManifest`, `serializeManifest`, `manifestFor`, `RECORD_FILES`, `RECORD_KEYS`, `CHANGE_KEYS`, `OPS`, `BY`, `CLIP_SECONDS`, `CLIP_NAME`, `clipName`, `jsonText`, `rowFaults`, `recordFolderFaults`, `applyRows` (stands alone: no other import is needed) |
| `./registry` | the walk-through rungs, the showcase roster, the scene list (`sceneGroups`), `projectOf`, a showcase tile's link (`showcaseHref(row)` relative to the serving site, `showcaseUrl(row)` absolute on `SHOWCASE_SITE.origin`; `row` is an element of the same imported `EXHIBITS`, and the link carries the row's effective mode on a multi-mode rung), and how STUDIO resolved the link it opened with (`STUDIO_LANDING_ATTR` on `<html>`, a `STUDIO_LANDING_OUTCOMES` id) |
| `./kinds` | `registerKind`, `kindNamed`, `kindOf`, `registeredKinds` — the kind registry a composed fork registers in |
| `./host-view` | `declareHostView`, `HOST_VIEW_OUTCOMES`, `CONTRACT_VIOLATIONS`, `HOST_SDK_SCRIPT` — the DeSciX host-view declarer an app calls under its own policy (below) |
| `./site-graph` | `SITE_GRAPH_DIR`, `SITE_BUILD_ATTR`, `SITE_BUILD_ID_RE`, `siteBuildStampOf`, `STATIC_APP_PAGE`, `HOST_PROVIDED_ATTR`, `SITE_PLACEMENTS`, `SITE_ENTRY_PAGES`, `isSiteEntry`, `siteGraphFaults` — the static site's shape (graph directory, build-stamp attribute, build id pattern and its reader, IDE entry page, the attribute declaring a file host-provided, the graph directory of each placed package, the entry pages) and the rule that a served graph is the placed releases' bytes, for a reader of a served site (both packages) |
| `./shim/controls/registry.js`, `./shim/render/sun-look.js`, `./compat/renderer/display-slot.js`, `./compat/renderer/orbit-bag.js`, `./objects/setup/_collisionMatrixLanes.js`, `./compat/engine.js` | the six non-part modules a scene may import (the rows of `FRQTL_WEB_SPECIFIERS`) |
| `./objects/objects/tagger.js`, `./objects/schema/index.js`, `./shim/render/heat-colormap.js`, `./objects/schema/valueNormalizer.js`, `./objects/objects/Box.js`, `./objects/objects/QuantumEmitter.js`, `./shim/expr/ast-schema.js`, `./objects/objects/actionCompiler.js`, `./objects/v1-replacements.js`, `./objects/objects/slitLinerScatter.js`, `./objects/setup/setupSphereEmitter3D.js`, `./objects/objects/directedRedirectProgram.js`, `./compat/renderer/lo-drawn-center.js`, `./objects/setup/setupTunnelPointExit.js`, `./objects/constants/WallBehaviors.js`, `./objects/objects/absorbRadiation.js`, `./objects/geometry/SlabFace.js` | the 17 part-internal modules a forked part file imports (the `tier: 'part-internal'` rows of `FRQTL_WEB_SPECIFIERS`): not a scene API — the linker admits them only from a `parts/*.js` file — and they move with the parts |
| `./dist-manifest.json` | sha256 of every dist file |

`dist/frqtl-web.min.js` is a file, not an export. `dist/sdk.html` is the API reference.

Self-hosting: serve an unmodified copy of `dist/` and import from YOUR copy — every module loads its
imports relative to its own URL. Check the copy against `dist/dist-manifest.json`.

## Acceptance is visual

There is no CLI. FRQTL scenes are fractal and non-linear: run a scene and look at it. A numeric score
is a design aid in your own harness, never the acceptance criterion.

## Packaging

The npm payload is `dist/`, `README.md`, `CLAUDE.md`, `llms.txt` and `LICENSE.md` (the DeSciX Community License and Membership Agreement). No JS physics-engine source ships:
the engine is the compiled WASM build (`dist/fat/pkg-web/`), in this package as in every FRQTL distribution.
