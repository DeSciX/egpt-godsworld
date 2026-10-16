<!-- Copyright 2023-2026 by Essam Abadir -->
# `lib/shim/` — the FRQTL shim router

`lib/shim/` is the cross-engine uniformity surface for the FRQTL stack (renamed from
`lib/common/` in WS-A). It is the **only layer that knows where code lives or which
implementation executes**. Every layer above it (components, features, apps) asks the
shim; every layer below it (core libs) is reached exclusively through it.

The shim is delivered via the `fraqtlServe()` vite plugin (`lib/server/plugin.js`),
which mounts `/lib/shim` → repo `lib/shim/` at dev time and rewrites paths for the
dist profile. A missing shim import is a hard FAIL-LOUD load error — there are no
`window.Common*` ambient globals.

---

## Named ESM exports (the public contract)

All public names are re-exported from the barrel (`lib/shim/index.js`). Import from
the barrel; never reach past it into sub-files.

```js
// Under vite with the 'lib' alias (apps/ide):
import { Bus, Runtime, EXPERIMENTS, engineRouter } from 'lib/shim';

// Direct relative path (lib/components, lib/features):
import { Bus, Runtime } from '../../lib/shim/index.js';
```

### Core router exports

| Export | File | Role |
|---|---|---|
| `Bus` | `bus.js` | Synchronous pub/sub. Events: `run:request`, `run:result`, `console:write/clear`, `render:frame`, `engine:tick/error`, `pane:show/hide/focus/resize/layout`. |
| `Runtime` | `runtime/index.js` | Unified eval surface. `Runtime.runCell({source, code, fileId})` dispatches to the `frqtl` or `math` lane and injects `{frqtl, math, console, render}` into executed code. |
| `EXPERIMENTS` | `registry/experiments.js` | Array of experiment descriptors — the single source of truth for the experiment registry. |
| `engineRouter` | `engine/router.js` | THE path authority. Resolves engine + SDK URLs from the active profile (dev or dist). No other file re-derives paths. |
| `DEV_CORE_PROFILE` | `engine/router.js` | Source-mount profile (dev): `/frqtl`, `/fat/pkg-web`, `/egpt-src/…`. |
| `DIST_PROFILE` | `engine/router.js` | Dist profile: paths relative to the built dist page (`../../js/…`), baked in by `sdk/frqtl-sdk/build.js`. |

### Math backend registry

| Export | File | Role |
|---|---|---|
| `MathBackendRegistry` | `../egpt/js/model/backend/MathBackendRegistry.js` | Singleton registry for the active math backend (js-reference or wasm-math); a zero-import module, so the JS reference core never enters the shim's graph. Re-exported from the shim barrel so `lib/features` imports from the sanctioned route. Module identity is preserved by ESM caching — one singleton regardless of import path. |
| `MathBackendNotAvailableError` | same | Thrown on FAIL-LOUD backend selection failure. |

### Notebook spine

| Export | File | Role |
|---|---|---|
| `parse` / `serialize` / `normalize` | `notebook/format.js` | Native `<frqtl-notebook>` HTML format: parse HTML → notebook model, serialize notebook model → HTML, normalize a partial cell bag. `CELL_ATTRS` is the canonical attribute schema; consumers ferry the normalized bag — never re-list the keys. `CELL_TYPES` is the legal type list and `PROSE_CELL_TYPES` its prose subset. `parse` throws on a root with zero cells, a cell with no `</cell>` closer, and a type outside `CELL_TYPES` — a malformed notebook never parses to fewer cells. |
| `NotebookKernel` / `NOTEBOOK_CELL_STATUS` | `notebook/kernel.js` | Per-notebook kernel. Calls `Runtime.runCell` directly (no Bus executor). Owns the cell execution graph and dirty state. |

### Cell-as-module resolver

| Export | File | Role |
|---|---|---|
| `canonKey` / `resolveRelativeKey` / `hasImport` / `splitImportsAndBody` / `rewriteRelativeToSiblingBlobs` / `buildModuleClosure` / `compileEntryModuleSource` | `notebook/module-resolver.js` | Host-neutral in-memory blob closure. Rewrites relative specifiers to sibling blob URLs (transitive, in memory). DOM-free — must NOT assume a pane exists. |

### Notebook realm model (the FOURTH BYO pluggable surface)

| Export | File | Role |
|---|---|---|
| `RealmRegistry` (namespace) | `notebook/realm-registry.js` | ONE registry authority. Maps realm name → pre-load descriptor `{ boot(hostEl, transport) → handle }`. Blessed pre-loads (`canvas`→`frqtl`, `chart`→`chart`) register at import; custom realms register the same way. |
| `makeViewHandle` / `isViewHandle` / `assertSerializable` | `notebook/view-handle.js` | Frozen view-handle contract (`inject/call/on/start/stop/step/dispose`). `assertSerializable` FAILS LOUD if a data-plane payload carries a live ref or DOM node — the postMessage transport requires structured-clone-serializable payloads. |
| `inAppTransport` | `notebook/realm-transport.js` | The realm transport: the direct fast path (in-page same-origin). |

### Vendor import-map

| Export | File | Role |
|---|---|---|
| `buildImportMap` | `notebook/vendor-importmap.js` | Pure function: vendor manifest + `router.vendorBase` → browser `{ imports }` map. |
| `buildRealmImportMap` / `spliceRealmImportMap` | `notebook/vendor-importmap.js` | The ONE document import map: vendor libs + `@frqtl/setups/*` bare specifiers, resolved through one `engineRouter()`. `spliceRealmImportMap` is called by `lib/server/realm-html.js` (dev, serve time) and `apps/ide/vite.config.js` (static bundle, build time, `engineRouter({mode:'static', documentRelative:true})`). |
| `buildFrqtlSetupsImportMap` / `FRQTL_SETUPS_MANIFEST` | `notebook/frqtl-setups-importmap.js` | The `@frqtl/setups/<id>` surface: manifest, `appendEsmExports` transform, `frqtlSetupsEsmModules()` list (consumed by the dev handler, `sdk/frqtl-sdk/build.js` and the static assembler). |

---

## Bus event table (frozen)

| Event | Payload | Direction |
|---|---|---|
| `run:request` | `{ source: 'frqtl'\|'math', code: string, fileId: string, sourceUrl?: string }` | Editor → Runtime |
| `run:result` | `{ source: 'frqtl'\|'math', ok: boolean, error?: string }` | Runtime → Console |
| `console:write` | `{ level: 'info'\|'warn'\|'error'\|'pass'\|'fail', text: string }` | Runtime/bridges → Console |
| `console:clear` | `{}` | Any → Console |
| `render:frame` | `{ universe?: object, tickData?: object, cmd?: string }` | Runtime/GFX → GFX |
| `engine:tick` | `{ tick: number, metrics: object }` | GraphicsPane → DataPane |
| `engine:error` | `{ message: string }` | GraphicsPane → Console + shell |
| `pane:show` | `{ paneId: string }` | PaneHost ↔ components |
| `pane:hide` | `{ paneId: string }` | PaneHost ↔ components |
| `pane:focus` | `{ paneId: string }` | Any → PaneHost |
| `pane:resize` | `{ paneId: string, w: number, h: number }` | PaneHost → components |
| `pane:layout` | `{ mode: string }` | PaneHost → components |

---

## How the shim is served

`fraqtlServe()` (`lib/server/plugin.js`) is a vite plugin dropped into
`apps/ide/vite.config.js`. It mounts all
backend routes in-process via the single route table `lib/server/mounts.js`:

```
/lib/shim        → lib/shim/            (dev source; was /lib/common)
/lib/components  → lib/components/
/frqtl           → lib/frqtl/
/fat             → lib/fat/
/vendor          → lib/frqtl/assets/vendor/
/notebooks       → lib/notebooks/
/egpt-src/…      → sdk/egpt-math-sdk/src/ + lib/egpt/js/model/theorems/
/api /v1 /ws     (handlers)
```

No separate server process is required in dev — `npm run dev` in `apps/ide` starts
vite with all routes in-process. `lib/server/server.js` serves the same `mounts.js`
table standalone (mode `'core'`, no vite). The public site is the static bundle
`make static-deploy` assembles, not a server process.

In the dist SDK, `sdk/frqtl-sdk/build.js::copyCommon` copies `lib/shim/` (ENUMERATED,
minus its `test/` directories) to `sdk/frqtl-sdk/dist/ide/` — the `lib/shim/` row of
`sdk/frqtl-sdk/scripts/lib-dist-placement.js`. Each experiment page is rewritten into
`dist/experiments/{id}/index.html` for the WASM-only dist (`window._egptEnginePathMap`
spliced from `engineRouter` `DIST_PROFILE` by `lib/shim/engine/experiment-page-map.js`).

---

## Frozen contracts

The following signatures are the single coordination point. No agent edits
`bus.js`, `runtime/index.js`, `registry/experiments.js`, or
`engine/router.js` contract signatures without coordinating all dependents
in lock-step.

- **`Bus`** — the event enum above is frozen; new events require a contract update.
- **`Runtime.runCell`** — the `{source, code, fileId}` shape is frozen.
- **`engineRouter`** — the profile shape is frozen; new profiles require an architect review.
- **`CELL_ATTRS` / `normalizeCellAttrs` / `CELL_TYPES` / `PROSE_CELL_TYPES`** in `notebook/format.js` — the canonical cell-attribute schema and cell-type list. Consumers ferry the normalized bag; they do NOT re-enumerate the attribute list. Schema-mirror drift (re-listing keys by hand in another consumer) is a bug class — the tell is data that breaks in one consumer but not another.
- **View-handle contract** (`inject/call/on/start/stop/step/dispose`) — frozen; a realm pre-load that implements fewer verbs is valid (optional verbs); a realm that adds new verbs to the handle surface requires a contract update.
