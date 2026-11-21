/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module format
 * @description
 * Native FRQTL notebook format — parser + serializer.
 *
 * Named ESM export. PURE module — no engine imports, no Runtime/Bus, no DOM.
 * Runs identically in Node (for tests) and in the browser.
 *
 * The on-disk format is a human-readable HTML file:
 * ```html
 * <frqtl-notebook version="1" title="Double Slit → Rosetta → QFT">
 *   <cell type="markdown">## The double-slit experiment …</cell>
 *   <cell type="module" name="./setups/double-slit.js">export function setupDoubleSlit …</cell>
 *   <cell type="canvas" id="c-ds-canvas" setup="./setups/double-slit.js#setupDoubleSlit" opts="quanta=800" stage="480x480" seed="42"></cell>
 *   <cell type="chart"  id="c-ds-chart" in="hist" spec="bar:hist"></cell>
 * </frqtl-notebook>
 * ```
 *
 * Round-trip discipline: `parse(serialize(nb))` deep-equals `nb`. The cell body
 * is preserved verbatim; a literal `</cell>` inside a body is escaped on serialize
 * and unescaped on parse.
 */

/**
 * @typedef {'markdown'|'js'|'module'|'canvas'|'chart'|'view'} CellType
 *   One of {@link CELL_TYPES} — the exported list is the authority; `parse` refuses any other.
 */

/**
 * THE legal cell types, in the order of the {@link CellType} typedef. `parse` throws on a
 * cell whose `type` is not listed here. Consumers read this list; they never re-list it.
 *
 * @type {ReadonlyArray<CellType>}
 */
export const CELL_TYPES = Object.freeze(['markdown', 'js', 'module', 'canvas', 'chart', 'view']);

/**
 * The cell types whose body is PROSE (rendered, never executed or imported) — a subset of
 * {@link CELL_TYPES}. A consumer that scans cell bodies as code skips exactly these.
 *
 * @type {ReadonlyArray<CellType>}
 */
export const PROSE_CELL_TYPES = Object.freeze(['markdown']);

/**
 * @typedef {'math'|'frqtl'} CellLane
 */

/**
 * A single parsed notebook cell.
 *
 * @typedef {object} NotebookCell
 * @property {CellType} type
 *   Cell type. `markdown` renders prose. `js` executes via the Runtime lane
 *   (`math` or `frqtl`). `module` is user-code reachable by import (not runnable).
 *   `canvas` mounts a live physics realm. `chart` renders a data view. `view` runs
 *   ARBITRARY user code in the realm — the
 *   user module (`module="<name>#<export>"`) imports vendored libs via the 2a
 *   import-map and renders into a DOM `mount`. `liveChart=` is a blessed PRESET
 *   over this same `view` substrate.
 * @property {CellLane} lane
 *   Execution lane for `js` cells. `math` caps = `{ math, console, display, inputs }`;
 *   `frqtl` caps add `{ frqtl, render }`. Empty for non-`js` cells.
 * @property {string} id
 *   Stable cell identity (staleness graph + AI-agent editing).
 * @property {string} name
 *   For `module` cells: the notebook-local relative path (e.g. `'./setups/wave.js'`).
 *   This is the key in the in-memory module set. Empty for all other cell types.
 * @property {string[]} in
 *   Binding names this cell CONSUMES (resolved from the kernel's binding store).
 * @property {string[]} out
 *   Binding names this cell PRODUCES (committed to the kernel's binding store on success).
 * @property {string} bind
 *   For `canvas` cells: RETIRED runner binding name.
 *   A canvas that carries BOTH `setup` and a legacy `bind`/`out` runner ref is an
 *   unconverted cell and FAILS LOUD at both hosts (C7 migration guard). The runner is
 *   now realm-internal, never a kernel binding.
 * @property {string} spec
 *   For `chart` cells: view spec string e.g. `'bar:hist'`.
 *   For `canvas` cells: RETIRED (the opaque setup-factory name) — a `spec` on a canvas
 *   FAILS LOUD at both hosts (factory-retire C3).
 * @property {string} setup
 *   For `canvas` cells: the setup declaration.
 *   `<module-name>` is a `type="module"` cell's `name`. Its grammar depends on `shape`
 *   and is owned by lib/shim/notebook/setup-builder.js parseSetupDeclaration: a factory
 *   canvas is `'<module-name>#<factoryName>'` (the name REQUIRED), a recipe canvas is
 *   `'<module-name>'` (a `#` REFUSED — the recipe is the module's default export). This
 *   module stores the attribute verbatim. The shim synthesizes the builder from this
 *   declaration and runs it realm-internal.
 *   Empty for all other cell types.
 * @property {string} shape
 *   For `canvas` cells: OPTIONAL setup-form discriminator naming which SHAPE the
 *   declared `setup` module takes (the frqtl-notebook recipe fix). Two forms:
 *     - `'factory'` (DEFAULT when omitted): the module export is a setup FACTORY
 *       `fn(frqtl, universe, options)` — the shim synthesizes
 *       `runner.setup((u,o) => fn(frqtl, u, o), opts)` (the pre-existing gallery form,
 *       e.g. `setupDoubleSlit`). Absent → `'factory'`, so every existing notebook is
 *       byte-identical.
 *     - `'recipe'`: the module's DEFAULT export is a `buildExperiment(exp)` RECIPE (a single
 *       RecipeContext arg — the sketch form the scene files
 *       write). The shim builds a
 *       `frqtl.RecipeContext` and runs `exp.build(buildExperiment)` (the canonical
 *       co-init call + `addObject()` recipe path), NOT the factory signature.
 *   Any OTHER value FAILS LOUD at the synthesis helper (never a silent fallback; the
 *   setup-builder authority validates it). PURE PARSE — kept verbatim as a string
 *   (mirrors `seed`/`cameraPreset`). Empty → `''` (omitted on serialize; the
 *   synthesizer treats empty as `'factory'`). Empty for all other cell types.
 * @property {string} stage
 *   For `canvas` cells: the runner stage `'<W>x<H>'` (canvasW × canvasH) — the world size of a
 *   FACTORY-shape canvas, where it is REQUIRED (the runner has no default size). A
 *   RECIPE-shape canvas states its own world in its exp.createCanvas / exp.createScene call,
 *   so a stage there is refused. ONE config authority = this attr, NOT folded into `opts`
 *   (C4). Empty for all other cell types.
 * @property {string} seed
 *   For `canvas` cells: the runner RNG seed (integer string). Empty → the
 *   FrqtlApp default (42). ONE config authority = this attr (C4). Empty for
 *   all other cell types.
 * @property {boolean} render3d
 *   For `canvas` cells: OPTIONAL — request the three.js 3D renderer + perspective
 *   camera for this canvas.
 *   Selected through the ONE renderer-selection mechanism (the boot module's
 *   bootRealm, lib/frqtl/experiments/_shared/boot.js) — NOT a new renderer
 *   mechanism. The host (notebook-pane) threads this into `realm-frqtl.js`'s
 *   `bootFrqtlRealm` opts, which asks the boot for three. Honored EVEN when this is
 *   NOT the first canvas boot in the page session: bootRealm re-selects the renderer
 *   when a later boot asks for a different one, or when the previous selection
 *   failed, and a still-broken renderer fails loud on the run where it happens. `false`/absent → the
 *   p5 2D default, unchanged. Omitted on serialize when `false`. Canvas-only;
 *   `false` for all other cell types.
 * @property {Object<string,number|string>} renderOptions
 *   For `canvas` cells: OPTIONAL render-INTENT knob assignments parsed from
 *   `"key=value,…"` (gym-controls-as-sugar fix-loop #6 Finding B, 2026-07-04) —
 *   the notebook-cell channel for the SAME render-intent writes a scene file states
 *   itself (e.g. a 3D sketch's
 *   `exp.render({ shape: 'sphere', colorScheme: 'roygbiv' })`, a ferry to
 *   `runner.setRenderOptions`). PURE PARSE — reuses the identical `_parseOpts`/
 *   `_joinOpts` machinery as `opts` (same `kind:'opts'`), but is a DISTINCT,
 *   SEPARATE key — never folded into `opts`. This is deliberate channel
 *   separation: `opts` feeds the setup
 *   FACTORY as physics-knob arguments (`frqtl.knob` → `options` param);
 *   `renderOptions` feeds `runner.setRenderOption()` calls AFTER `runner.setup()`
 *   returns — a render-knob write must never be mixed into the physics-knob bag.
 *   Empty → `{}`; omitted on serialize when empty. Empty for all other cell types.
 * @property {string} cameraPreset
 *   For `canvas` cells: OPTIONAL named camera-orbit preset (gym-controls-as-sugar
 *   fix-loop #6 Finding B) — the notebook-cell channel for a standalone page's
 *   `runner.cameraControl.setPreset('<name>')` call (e.g. a 3D page's
 *   `window._egptFx.cameraPreset = 'down-barrel'`, applied by `fx-experiment.js`
 *   BEFORE the orbit sliders are seeded). A THIRD channel, distinct from both `opts`
 *   (physics knobs) and `renderOptions` (`setRenderOption` key/value pairs): this is
 *   a CAPABILITY-OBJECT METHOD CALL (`runner.cameraControl`), not a property-bag
 *   write, so it gets its own attribute rather than being shoehorned into
 *   `renderOptions`'s flat `key=value` shape. Capability-checked at apply time
 *   (skipped when the active renderer has no camera control; a camera that does not offer
 *   the preset THROWS) — mirrors the
 *   page-side `if (cam) { cam.setPreset(...) }` idiom exactly. PURE PARSE — kept
 *   verbatim as a string (mirrors `seed`/`produceVia`); the host validates the
 *   preset name against `runner.cameraControl.presets` (FAIL-LOUD is the
 *   capability-check itself: an unset/no-op result on a 2D canvas is expected, not
 *   an error). Empty → `''`; omitted on serialize when empty. Empty for all other
 *   cell types.
 * @property {string[]} produces
 *   For `canvas` cells: the serializable binding name(s) the canvas COMMITS to the
 *   kernel after the realm-internal runner mounts.
 *   The realm DERIVES each value at runtime via the frozen handle (`produceVia`) and
 *   the host commits it via `kernel.commitViewOutputs`. Parsed with `_splitNames`
 *   (→ `string[]`); empty → `[]`; omitted on serialize when empty. On parse a canvas's
 *   `produces` names are FOLDED INTO `out` (a produced binding IS an output binding the
 *   cell commits) so producer-discovery (`_findProducerCellId` over `out`) + the topo
 *   run-order stay ONE authority. Empty for all other cell types.
 * @property {string} produceVia
 *   For `canvas` cells: OPTIONAL frozen-handle `call()` name used to DERIVE each
 *   produced value. Default `'detectorHistogram'` when omitted (the one blessed frqtl
 *   producer). One `produceVia` per canvas (multi-name-multi-source is backlog, C11).
 *   Empty → `''`; omitted on serialize when empty. Empty for all other cell types.
 * @property {string} produceAfter
 *   For `canvas` cells: OPTIONAL integer-string tick count to WARM UP the realm
 *   (deterministic `handle.step()` loop) BEFORE deriving the produced binding
 *   The runner mounts at tick ~0 where no particle has
 *   reached the detector yet — deriving immediately commits an EMPTY histogram. Warming
 *   up `produceAfter` ticks lets particles cross the stage and accumulate at the detector
 *   so the committed binding (and the downstream chart) shows REAL data. ONE config
 *   authority = this attr (mirrors `seed`/`stage`, C4); NOT folded into `opts`. Empty →
 *   the host default warmup. Empty for all other cell types.
 * @property {string} liveChart
 *   For `canvas` cells: OPTIONAL frozen-handle `call()` projector name the live
 *   SAME-CELL accumulation chart polls each throttle tick.
 *   The blessed value is `'detectorHistogram'` (the one frqtl producer) — it reuses the
 *   SAME projector vocabulary as `produceVia`. UNLIKE `produces`, `liveChart` commits
 *   NOTHING to the kernel: it draws CONTINUOUSLY inside the canvas's OWN realm off the
 *   LOCAL `handle.on('tick')` stream, so its data never crosses the renderer↔realm seam.
 *   A canvas MAY carry BOTH `produces` and `liveChart` (orthogonal lifecycles). PURE PARSE —
 *   the raw string is kept; the host validates it against the blessed projector (FAIL-LOUD),
 *   mirroring `produceVia`/`seed`. Empty → `''`; omitted on serialize when empty. Empty for
 *   all other cell types.
 * @property {string} liveChartKind
 *   For `canvas` cells: OPTIONAL live-chart kind `'bar'|'line'` (default `'bar'` when
 *   omitted; mirrors the chart-cell `spec` `kind` half). PURE PARSE — the raw string is
 *   kept; the host validates it against `bar|line` (FAIL-LOUD). Empty → `''`; omitted on
 *   serialize when empty. Empty for all other cell types.
 * @property {string} realm
 *   For `view` cells (and OPTIONALLY any realm cell): the realm-registry pre-load to
 *   boot (`frqtl` | `chart` | a BYO name). `_realmNameForCell` ALREADY honors this:
 *   an explicit `cell.realm` wins, else the cell TYPE selects the blessed pre-load.
 *   PURE PARSE — empty → `''` (omitted on serialize; the host falls back to the
 *   type-default `frqtl`).
 * @property {string} module
 *   For `view` cells: the user render module declaration `'<module-name>#<exportName>'`,
 *   mirroring the canvas `setup` shape. `<module-name>` is a `type="module"` cell's
 *   `name`; `<exportName>` is optional ONLY when that module has exactly one render
 *   export (zero/multiple → FAIL-LOUD at the view-builder synthesis helper, never
 *   guess; C5 mirror). The shim runs the named export IN THE REALM with the view
 *   `ctx`. PURE PARSE — empty → `''` (omitted on serialize). Empty for non-`view`
 *   cell types.
 * @property {string} subscribe
 *   For `view` cells: OPTIONAL cross-cell — the cellId of ANOTHER canvas whose tick
 *   stream this view observes. PARSED + round-tripped now for format stability, but
 *   the cross-cell WIRING is DEFERRED (§3.4 of the design): the same-cell path is the
 *   primary 2b path. PURE PARSE — empty → `''` (omitted on serialize). Empty
 *   for non-`view` cell types.
 * @property {Object<string,number|string>} opts
 *   For `canvas` cells: driving-knob assignments parsed from `"key=value,…"`.
 *   PURE PARSE only — validation is `lib/shim/notebook/knob.js`'s authority. Empty → `{}`.
 * @property {boolean} collapsed
 *   When `true` the cell renders collapsed.
 *   Omitted on serialize when `false`.
 * @property {string} body
 *   Raw cell body (verbatim between the open and close tags).
 */

/**
 * A parsed notebook object (output of `parse`; input to `serialize`).
 *
 * @typedef {object} NotebookObject
 * @property {string} title   — human-readable notebook title.
 * @property {string} version — format version string (currently `'1'`).
 * @property {NotebookCell[]} cells — cells in document order.
 */

'use strict';

/* ── escaping ────────────────────────────────────────────────────────────
 *
 * The body is opaque text/markup placed verbatim between <cell …> and </cell>.
 * The ONLY sequence that could prematurely terminate a cell is a literal
 * `</cell>` inside the body. We escape it to a sentinel on serialize and
 * restore it on parse. Attribute VALUES are escaped for the five XML entities.
 */

const CLOSE_TAG = '</cell>';
const CLOSE_SENTINEL = '&lt;/cell&gt;';

function _escapeBody(body) {
    // Escape any literal close tag so it cannot terminate the cell early.
    return String(body).split(CLOSE_TAG).join(CLOSE_SENTINEL);
}

function _unescapeBody(body) {
    return String(body).split(CLOSE_SENTINEL).join(CLOSE_TAG);
}

function _escapeAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _unescapeAttr(value) {
    return String(value)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

/* ── attribute helpers ───────────────────────────────────────────────────── */

// Parse `name="value"` / `name='value'` pairs from a raw tag-attribute string.
// Returns an Object<name, decodedValue>.
function _parseAttrs(raw) {
    const attrs = Object.create(null);
    if (!raw) { return attrs; }
    const re = /([a-zA-Z_][\w-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
        const name = m[1];
        const value = (m[3] !== undefined) ? m[3] : (m[4] !== undefined ? m[4] : '');
        attrs[name] = _unescapeAttr(value);
    }
    return attrs;
}

// Split a comma-separated binding list into a clean array of names.
// Empty / whitespace-only → []. Names are trimmed; empty entries dropped.
function _splitNames(value) {
    if (!value) { return []; }
    return String(value)
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; });
}

function _joinNames(arr) {
    if (!arr || !arr.length) { return ''; }
    return arr.join(', ');
}

// Parse a canvas-cell `opts` attribute "<key>=<value>,…" into a {key:Number}
// map. PURE — no schema validation (that is knob.js's single authority). A value
// that is not a finite number is kept as the raw string so knob.js can FAIL-LOUD
// with a precise message rather than this pure parser swallowing it. Empty → {}.
function _parseOpts(value) {
    // Plain object (NOT Object.create(null)) so a hand-authored {} round-trips
    // deep-equal (deepStrictEqual is prototype-sensitive). Keys here are notebook
    // knob names, never __proto__/constructor in practice; knob.js validates them.
    var map = {};
    if (!value) { return map; }
    String(value).split(',').forEach(function (pair) {
        var s = pair.trim();
        if (!s) { return; }
        var eq = s.indexOf('=');
        if (eq === -1) { return; }
        var key = s.slice(0, eq).trim();
        var raw = s.slice(eq + 1).trim();
        if (!key) { return; }
        var num = Number(raw);
        map[key] = (raw !== '' && isFinite(num)) ? num : raw;
    });
    return map;
}

// Serialize an opts map back to "<key>=<value>,…" in key order. Empty → ''.
function _joinOpts(map) {
    if (!map) { return ''; }
    var keys = Object.keys(map);
    if (!keys.length) { return ''; }
    return keys.map(function (k) { return k + '=' + map[k]; }).join(',');
}

/* ── canonical attr schema ───────────────────────────────────────────────────
 *
 * THE SINGLE CANONICAL PER-CELL ATTRIBUTE SCHEMA.
 *
 * `parse()` routes its output through `normalizeCellAttrs()`. `serialize()` emits
 * in this order (see `_cellOpenTag` below). Every consumer
 * ferries the normalized bag instead of re-listing keys.
 *
 * Add a new cell attribute HERE AND NOWHERE ELSE.
 *
 * `body` is intentionally NOT here — the editable text is carried separately.
 *
 * Order MUST MATCH the emit order in `_cellOpenTag` exactly so `serialize`
 * stays byte-identical.
 */

export const CELL_ATTRS = [
    { key: 'type',         kind: 'string' },
    { key: 'lane',         kind: 'string' },
    { key: 'id',           kind: 'string' },
    { key: 'name',         kind: 'string' },
    { key: 'in',           kind: 'names'  },
    { key: 'out',          kind: 'names'  },
    { key: 'bind',         kind: 'string' },
    { key: 'spec',         kind: 'string' },
    { key: 'realm',        kind: 'string' },
    { key: 'module',       kind: 'string' },
    { key: 'subscribe',    kind: 'string' },
    { key: 'setup',        kind: 'string' },
    { key: 'shape',        kind: 'string' },
    { key: 'stage',        kind: 'string' },
    { key: 'seed',         kind: 'string' },
    { key: 'render3d',     kind: 'bool'   },
    { key: 'renderOptions',kind: 'opts'   },
    { key: 'cameraPreset', kind: 'string' },
    { key: 'produces',     kind: 'names'  },
    { key: 'produceVia',   kind: 'string' },
    { key: 'produceAfter', kind: 'string' },
    { key: 'liveChart',    kind: 'string' },
    { key: 'liveChartKind',kind: 'string' },
    { key: 'opts',         kind: 'opts'   },
    { key: 'collapsed',    kind: 'bool'   },
];

/**
 * Normalize a partial cell-attribute bag to the canonical shape defined by
 * `CELL_ATTRS`. Enforces correct types for every key; missing keys become the
 * zero value for their kind (empty string / [] / {} / false).
 *
 * Idempotent on a correctly-typed bag (normalize is a value no-op on well-formed
 * input — it only enforces the key set and coerces stray values).
 *
 * @param {object|null|undefined} partial — a partial bag (e.g. a parse()-built
 *   cell object before body attachment, or a fm read from cell.metadata.frqtl).
 * @returns {object} the full canonical bag (same key order as CELL_ATTRS).
 */
export function normalizeCellAttrs(partial) {
    const p = partial || {};
    const bag = {};
    for (const { key, kind } of CELL_ATTRS) {
        const v = p[key];
        if (kind === 'names') {
            bag[key] = Array.isArray(v) ? v.slice() : [];
        } else if (kind === 'opts') {
            bag[key] = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
        } else if (kind === 'bool') {
            bag[key] = !!v;
        } else {
            // 'string'
            bag[key] = (typeof v === 'string') ? v : (v == null ? '' : String(v));
        }
    }
    return bag;
}

/**
 * Fold a canvas's declared `produces` names into its `out` set (dedup, order-stable:
 * existing `out` first, then any `produces` not already present). This is the SINGLE
 * fold authority — `parse` applies it so `_findProducerCellId`/`runOrder` (which scan
 * `out`) see a producing canvas; any other consumer reuses it rather than
 * re-implementing the loop. Idempotent: folding an already-folded `out`
 * is a no-op.
 *
 * @param {string[]} out — the declared `out` names.
 * @param {string[]} produces — the declared `produces` names.
 * @returns {string[]} a new array: out ∪ produces, out-order-first.
 */
export function foldProducesIntoOut(out, produces) {
    const folded = (Array.isArray(out) ? out : []).slice();
    const prod = Array.isArray(produces) ? produces : [];
    for (let i = 0; i < prod.length; i++) {
        if (folded.indexOf(prod[i]) === -1) { folded.push(prod[i]); }
    }
    return folded;
}

/* ── parse ─────────────────────────────────────────────────────────────────
 *
 * FAIL-LOUD on a missing <frqtl-notebook> root, a root with zero cells, a cell
 * open tag with no `>` or no `</cell>` closer, and a cell type outside
 * CELL_TYPES. Cells are read in document order by a forward scan: each open tag
 * is closed by the FIRST `</cell>` after it (a body can never hold a literal
 * `</cell>` — serialize escapes it), so a body that mentions `<cell …>` in prose
 * is never mistaken for a sibling cell.
 */

// The notebook's name in an error: its title, else a marker that it has none.
function _notebookLabel(rootAttrs) {
    return rootAttrs.title ? 'notebook "' + rootAttrs.title + '"' : 'untitled notebook';
}

/**
 * Parse a FRQTL notebook HTML string into a notebook object.
 *
 * FAIL-LOUD: a malformed notebook throws instead of parsing to fewer cells.
 *
 * @param {string} html — raw notebook file contents (UTF-8 string).
 * @returns {NotebookObject}
 * @throws {Error} if the string has no `<frqtl-notebook>` root; if the root holds
 *   zero `<cell>` elements; if a `<cell` open tag has no `>` or no `</cell>` closer
 *   (naming the cell index); if a cell's `type` is not in {@link CELL_TYPES}
 *   (naming the type and the legal list).
 *
 * @example
 * import { parse } from 'lib/shim/notebook/format.js';
 * const nb = parse(fs.readFileSync('gallery-wave.frqnb', 'utf8'));
 * console.log(nb.title);       // 'Wave Interference'
 * console.log(nb.cells.length); // e.g. 5
 */
export function parse(html) {
    if (typeof html !== 'string') {
        throw new Error('[notebook/format] parse() requires an HTML string; got ' + typeof html);
    }

    const rootMatch = /<frqtl-notebook\b([^>]*)>([\s\S]*?)<\/frqtl-notebook>/i.exec(html);
    if (!rootMatch) {
        throw new Error(
            '[notebook/format] no <frqtl-notebook>…</frqtl-notebook> root found — ' +
            'not a FRQTL native notebook (FAIL-LOUD).'
        );
    }

    const rootAttrs = _parseAttrs(rootMatch[1]);
    const inner = rootMatch[2];

    const cells = [];
    const openRe = /<cell\b/gi;
    const closeRe = /<\/cell>/gi;
    let om;
    while ((om = openRe.exec(inner)) !== null) {
        const index = cells.length;
        const tagEnd = inner.indexOf('>', om.index);
        if (tagEnd === -1) {
            throw new Error(
                '[notebook/format] ' + _notebookLabel(rootAttrs) + ': cell #' + index +
                ' open tag `<cell` has no closing `>` (FAIL-LOUD).'
            );
        }
        const openTag = inner.slice(om.index, tagEnd + 1);
        closeRe.lastIndex = tagEnd + 1;
        const cl = closeRe.exec(inner);
        if (cl === null) {
            throw new Error(
                '[notebook/format] ' + _notebookLabel(rootAttrs) + ': cell #' + index + ' ' +
                openTag + ' has no </cell> closer — the rest of the notebook would be one ' +
                'cell body (FAIL-LOUD).'
            );
        }
        openRe.lastIndex = cl.index + cl[0].length;
        const a = _parseAttrs(inner.slice(om.index + om[0].length, tagEnd));
        const rawBody = inner.slice(tagEnd + 1, cl.index);
        if (CELL_TYPES.indexOf(a.type) === -1) {
            throw new Error(
                '[notebook/format] ' + _notebookLabel(rootAttrs) + ': cell #' + index + ' has ' +
                (a.type === undefined ? 'no type attribute' : 'unknown type="' + a.type + '"') +
                ' — legal types (CELL_TYPES): ' + CELL_TYPES.join(', ') + ' (FAIL-LOUD).'
            );
        }
        // A canvas's `produces` names are the
        // serializable bindings it COMMITS to the kernel after the realm-internal
        // runner mounts. They are FOLDED INTO `out` here (a produced binding IS an
        // output binding the cell commits) so producer-discovery + the topo run-order
        // stay ONE authority (`_findProducerCellId`/`runOrder` scan `out`). We keep the
        // raw `produces` array on the cell too: it is the declaration the host derives
        // from, and it lets `serialize` re-emit `produces` (and omit the folded `out`)
        // so the round-trip stays idempotent.
        const declaredProduces = _splitNames(a.produces);
        const foldedOut = foldProducesIntoOut(_splitNames(a.out), declaredProduces);
        // Build the pre-normalized bag with all special logic applied (fold, typed
        // values, etc.), then route through normalizeCellAttrs so the output is
        // structurally guaranteed to carry exactly the canonical CELL_ATTRS keys.
        // normalizeCellAttrs is a value no-op on correctly-typed input — it only
        // enforces the key set. `body` is attached after (not part of CELL_ATTRS).
        const built = {
            type: a.type,
            lane: a.lane || '',
            id: a.id || '',
            // B3: module-cell relative path (the in-memory module-set key). Only
            // meaningful for type="module"; empty for every other cell type so the
            // attribute is omitted on serialize (round-trip idempotent).
            name: a.name || '',
            in: _splitNames(a.in),
            out: foldedOut,
            bind: a.bind || '',
            spec: a.spec || '',
            // View-cell declaration (realm/module/subscribe).
            // PURE PARSE — kept verbatim; the host validates (FAIL-LOUD). View-only in
            // practice; empty for every other cell type so the attrs are omitted on
            // serialize (round-trip idempotent).
            realm: a.realm || '',
            module: a.module || '',
            subscribe: a.subscribe || '',
            // The canvas DECLARES its setup +
            // runner config; the shim synthesizes the builder from these. Only
            // meaningful for type="canvas"; empty for every other type so the
            // attribute is omitted on serialize (round-trip idempotent).
            setup: a.setup || '',
            // The setup-form discriminator ('factory' | 'recipe'). PURE PARSE
            // — kept verbatim; the setup-builder synthesis helper validates it (empty →
            // 'factory'; unknown → FAIL-LOUD). Canvas-only in practice; empty for every
            // other cell type so the attribute is omitted on serialize (idempotent).
            shape: a.shape || '',
            stage: a.stage || '',
            seed: a.seed || '',
            // Request the three.js 3D
            // renderer for this canvas (mirrors `collapsed`'s bool-attr parse —
            // only the literal "true" sets it; absent/anything else → false,
            // omitted on serialize, idempotent round-trip). Canvas-only in
            // practice.
            render3d: a.render3d === 'true',
            // gym-controls-as-sugar fix-loop #6 Finding B: render-INTENT knobs
            // (`runner.setRenderOption` key/value pairs) — reuses `_parseOpts`
            // (SAME kind:'opts' parser as `opts`, but a channel-separate key; see
            // the @property doc above). Canvas-only in practice.
            renderOptions: _parseOpts(a.renderOptions),
            // gym-controls-as-sugar fix-loop #6 Finding B: named camera-orbit
            // preset (`runner.cameraControl.setPreset` call) — PURE PARSE, kept
            // verbatim as a string (mirrors `seed`). Canvas-only in practice.
            cameraPreset: a.cameraPreset || '',
            // The serializable binding(s) this canvas
            // commits + the frozen-handle call that derives each. Canvas-only; empty for
            // every other cell type so the attrs are omitted on serialize (idempotent).
            produces: declaredProduces,
            produceVia: a.produceVia || '',
            // Integer-string warmup tick count. PURE PARSE —
            // kept verbatim as a string (mirrors `seed`); the host parses + clamps it
            // (numeric validation is the host's authority, not this pure parser). Empty
            // for every other cell type so the attr is omitted on serialize (idempotent).
            produceAfter: a.produceAfter || '',
            // The SAME-CELL live accumulation chart's
            // projector name + kind. PURE PARSE — kept verbatim as strings (mirrors
            // `produceVia`/`seed`); the host validates the projector against the blessed set
            // and the kind against `bar|line` (FAIL-LOUD). They commit NOTHING to the kernel
            // and do NOT enter `in`/`out` or the topo graph (unlike `produces`). Canvas-only;
            // empty for every other cell type so the attrs are omitted on serialize (idempotent).
            liveChart: a.liveChart || '',
            liveChartKind: a.liveChartKind || '',
            opts: _parseOpts(a.opts),
            // E2d: collapse state — a boolean cell attribute, host-neutral. Only the
            // literal "true" sets it; absent/anything else → false (omitted on
            // serialize), so round-trip is idempotent.
            collapsed: a.collapsed === 'true',
        };
        cells.push({ ...normalizeCellAttrs(built), body: _unescapeBody(rawBody) });
    }

    if (cells.length === 0) {
        throw new Error(
            '[notebook/format] ' + _notebookLabel(rootAttrs) + ' has zero <cell> elements — ' +
            'nothing to render, run or scan (FAIL-LOUD).'
        );
    }

    return {
        title: rootAttrs.title || '',
        version: rootAttrs.version || '1',
        cells: cells
    };
}

/* ── serialize ───────────────────────────────────────────────────────────── */

function _cellOpenTag(cell) {
    // Emit attributes in CELL_ATTRS order — the SINGLE schema authority drives the emit;
    // there is NO second hand-maintained key list here (a key added to CELL_ATTRS emits
    // automatically). Empty attributes are omitted so parse→serialize→parse is idempotent
    // on the cleaned arrays/strings.
    //
    // The ONLY per-key special case is the structural `out`/`produces` interaction:
    // a canvas's `produces` names were FOLDED INTO `out` on parse, so `out` re-emits ONLY
    // its non-produces names (the produces re-emit via the `produces` attr). A producing
    // canvas whose `out` == `produces` thus emits NO `out` attr — idempotent round-trip.
    const producesArr = Array.isArray(cell.produces) ? cell.produces : [];
    const outArr = Array.isArray(cell.out) ? cell.out : [];
    const outOnly = outArr.filter(function (n) { return producesArr.indexOf(n) === -1; });
    let tag = '<cell';
    for (let i = 0; i < CELL_ATTRS.length; i++) {
        const key = CELL_ATTRS[i].key;
        const kind = CELL_ATTRS[i].kind;
        if (kind === 'bool') {
            // Boolean attribute — emitted ONLY when true (so a false cell is byte-identical
            // to one with no attr). collapsed="true".
            if (cell[key]) { tag += ' ' + key + '="true"'; }
            continue;
        }
        let str;
        if (kind === 'names') {
            str = _joinNames(key === 'out' ? outOnly : key === 'produces' ? producesArr : cell[key]);
        } else if (kind === 'opts') {
            // Generalized to `cell[key]` (gym-controls-as-sugar fix-loop #6 Finding B):
            // a hardcoded `cell.opts` here was harmless while `opts` was the ONLY
            // kind:'opts' key, but would have silently serialized `opts`'s content
            // under a SECOND opts-kind key's tag (`renderOptions`) once one was added —
            // table-driven per-key access is the correct, general form CELL_ATTRS
            // already promises ("Add a new cell attribute HERE AND NOWHERE ELSE").
            str = _joinOpts(cell[key]);
        } else {
            str = (typeof cell[key] === 'string') ? cell[key] : '';
        }
        if (str) { tag += ' ' + key + '="' + _escapeAttr(str) + '"'; }
    }
    tag += '>';
    return tag;
}

/**
 * Serialize a notebook object to a FRQTL notebook HTML string.
 *
 * Attribute order in each `<cell>` tag is fixed for stable, diff-friendly output.
 * Empty attributes are omitted so the round-trip `parse(serialize(nb))` is idempotent.
 *
 * @param {NotebookObject} notebook
 * @returns {string} the serialized HTML string (UTF-8).
 * @throws {Error} if `notebook` is not an object or `notebook.cells` is not an array.
 *
 * @example
 * import { parse, serialize } from 'lib/shim/notebook/format.js';
 * const html = serialize(nb);
 * fs.writeFileSync('out.frqnb', html, 'utf8');
 */
export function serialize(notebook) {
    if (!notebook || typeof notebook !== 'object') {
        throw new Error('[notebook/format] serialize() requires a notebook object.');
    }
    if (!Array.isArray(notebook.cells)) {
        throw new Error('[notebook/format] notebook.cells must be an array.');
    }

    const version = notebook.version || '1';
    const title = notebook.title || '';

    const lines = [];
    lines.push(
        '<frqtl-notebook version="' + _escapeAttr(version) + '"' +
        (title ? ' title="' + _escapeAttr(title) + '"' : '') + '>'
    );
    lines.push('');

    for (let i = 0; i < notebook.cells.length; i++) {
        const cell = notebook.cells[i];
        const body = _escapeBody(cell.body == null ? '' : cell.body);
        lines.push(_cellOpenTag(cell) + body + CLOSE_TAG);
        lines.push('');
    }

    lines.push('</frqtl-notebook>');
    lines.push('');
    return lines.join('\n');
}

/* ── normalize ───────────────────────────────────────────────────────────── */

/**
 * Produce the canonical cleaned shape that `parse()` would yield from a hand-authored
 * notebook object. Used to compare two notebooks ignoring author-side attribute noise
 * (e.g. duplicate spaces in an `in` list).
 *
 * Idempotent: `normalize(normalize(nb))` deep-equals `normalize(nb)`.
 *
 * @param {NotebookObject} notebook
 * @returns {NotebookObject} the normalized notebook.
 *
 * @example
 * import { normalize } from 'lib/shim/notebook/format.js';
 * const a = normalize(nb1);
 * const b = normalize(nb2);
 * assert.deepStrictEqual(a, b); // compare ignoring whitespace noise
 */
export function normalize(notebook) {
    return parse(serialize(notebook));
}
