# @descix/frqtl-sdk

FRQTL SDK public distribution package for physics and game-engine demo surfaces.

## Public Dist Endpoints

- `dist/sdk.html` — game-object and SDK API reference surface

## Node target (ws-artifact-showcase Bite N2)

Alongside the browser surface (`.`), this package ships a Node-target build
of the SAME canonical Rust/WASM engine (`lib/fat/pkg-node`, `wasm-pack
--target nodejs`):

- **`require('@descix/frqtl-sdk')`** — THE PARITY CORE, node condition: `{ EGPTEngine,
  setupDoubleSlit, LargeObject, Wall, Rectangle, ... }` — the SAME symbol set
  the browser condition of the same specifier exports (`lib/frqtl/objects/public-parts.js`
  is the one owner table; a conformance gate diffs both). No DOM/browser dependency;
  runs headless.
- **No CLI ships with this package.** The engine is a thing you watch, not a
  thing you score: FRQTL scenes are fractal and non-linear, so a static numeric
  check cannot tell you a scene is right before you have drawn it. Acceptance is
  visual — run a scene and look at it. A numeric score belongs in your own
  harness as a design aid, never as the acceptance criterion.

Both `pkg-web` (browser) and `pkg-node` (Node) are built from the identical
Rust crate (`lib/frqtl/crates/egpt_wasm`) — bit-identical `.wasm` binary,
only the JS glue differs (`--target web` vs `--target nodejs`).

Current impossible-computations demo correlation:

- Circuit SAT (Half-Adder)
- Blackbody

## Packaging Policy

The npm payload is compiled/distribution-only:

- Published: `dist/` and this `README.md`
- Not published: source trees, build scripts, and internal authoring assets

**No JS physics-engine source ships either** (CEO standing rule, 2026-07-10 —
mirrors the same rule enforced on `@descix/egpt-math-sdk`). The canonical JS
reference engine (`lib/frqtl/js_reference/EGPTfrqtl.js`) is never bundled here
(repo `CLAUDE.md` rule 5) — `scripts/verify-publish-surface.mjs` now also
probes the built dist for that file's distinctive internal symbols
(`SortableDictionary`), delegating to the same shared checker
(`scripts/verify-no-core-source-in-dist.mjs`, repo root) `@descix/egpt-math-sdk`
uses for its own compute core. Root `make verify-publish-surface` runs both
packages' gates.

## Local Validation

```bash
npm run build
npm run verify:publish-surface
npm run pack:dry-run
```

## Notes

- Product pages can import the dist endpoints while FRQTL.com product sub-sites are being formalized.
- Source code is intentionally excluded from npm distribution payload.
