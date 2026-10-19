/* Copyright 2023-2026 by Essam Abadir */

/**
 * @typedef {'idle'|'running'|'ok'|'error'|'stale'} CellStatus
 */

/**
 * @typedef {object} CellState
 * @property {CellStatus} status — current execution status.
 * @property {Object<string,number>} lastRunInputVersions — binding versions at last run.
 * @property {Object<string,*>} outputs — the last committed output values.
 */

/**
 * @typedef {object} BindingEntry
 * @property {*} value — the binding value.
 * @property {number} version — increments on each new commit from any producer.
 * @property {string} producerCellId — id of the cell that last wrote this binding.
 */

/**
 * @typedef {object} RunAllResult
 * @property {number} total — total runnable cells.
 * @property {number} ran — cells that were attempted.
 * @property {boolean} ok — `true` if all ran successfully; `false` on first error.
 * @property {string|null} failedCellId — the first cell that failed, or `null`.
 * @property {string|null} error — error message of the first failure, or `null`.
 * @property {Array<{cellId:string, result:RunCellResult}>} results — per-cell results.
 */

/**
 * NotebookKernel — per-notebook execution controller (UNIFIED_NOTEBOOK_DESIGN §3).
 *
 * A PER-NOTEBOOK INSTANCE (NOT a module singleton). The pane owns the kernel's
 * lifetime and calls `dispose()` on notebook unload.
 *
 * Responsibilities:
 *  - Typed binding store keyed by name (`{ value, version, producerCellId }`).
 *  - Per-cell execution state (`idle | running | ok | error | stale`).
 *  - Dependency graph (declared `in`/`out`) used ONLY for staleness + run-order
 *    hints — it NEVER auto-runs (marks `stale` only).
 *
 * Execution discipline:
 *  - `runCell()` calls `Runtime.runCell()` DIRECTLY. The kernel registers ZERO
 *    `Bus.on` execution listeners. The ONLY Bus traffic it produces is ONE outbound
 *    `notebook:cellstate { cellId, status }` event per state transition.
 *
 * @example
 * import { parse } from 'lib/shim/notebook/format.js';
 * import { NotebookKernel } from 'lib/shim/notebook/kernel.js';
 *
 * const nb = parse(htmlSource);
 * const kernel = new NotebookKernel(nb);
 *
 * // Run a single cell (FAIL-LOUD if a declared input is not yet produced):
 * const result = await kernel.runCell('c-stat-01');
 *
 * // Run all cells in topological order:
 * const summary = await kernel.runAll();
 *
 * // Tear down when the notebook closes:
 * kernel.dispose();
 */

import { Bus as DefaultBus } from '../bus.js';
import { Runtime as DefaultRuntime } from '../runtime/index.js';

'use strict';

var STATUS = {
    IDLE:    'idle',
    RUNNING: 'running',
    OK:      'ok',
    ERROR:   'error',
    STALE:   'stale'
};

export class NotebookKernel {
    /**
     * @param {object} notebook — parsed notebook from `format.parse()`. Must have
     *   `cells: [{ id, type, lane, in, out, body }]`.
     * @param {object} [opts]
     * @param {object} [opts.runtime] — shim Runtime (injected for testability).
     * @param {object} [opts.bus]     — shim Bus (injected for testability).
     */
    constructor(notebook, opts) {
        opts = opts || {};
        if (!notebook || !Array.isArray(notebook.cells)) {
            throw new Error('[NotebookKernel] requires a notebook object with a cells[] array.');
        }
        this._runtime  = opts.runtime || DefaultRuntime;
        this._bus      = opts.bus     || DefaultBus;
        // The injected runtime's contract, asserted HERE — at the boundary, once.
        // `resetMathScope` is what bounds the arena (see resetScope() below); a
        // runtime without it would otherwise die with a bare TypeError from inside
        // resetScope(), mid-run, AFTER the binding store was already cleared. This
        // is an assertion, NOT a guard around the call: skipping the reset would
        // run the notebook on an unbounded arena and never say so.
        var missing = ['runCell', 'resetMathScope'].filter(function (m) {
            return typeof this._runtime[m] !== 'function';
        }, this);
        if (missing.length) {
            throw new Error(
                '[NotebookKernel] the injected runtime does not satisfy the kernel\'s contract — ' +
                'missing: ' + missing.join(', ') + '. Pass lib/shim/runtime/index.js\'s `Runtime` ' +
                '(Runtime.runCell, Runtime.resetMathScope), or a stub that implements both.'
            );
        }
        this._disposed = false;

        // notebook cells in document order; keep an id→cell index.
        this._cells   = notebook.cells.slice();
        this._cellById = new Map();
        for (var i = 0; i < this._cells.length; i++) {
            var c = this._cells[i];
            if (c.id) { this._cellById.set(c.id, c); }
        }

        // bindings: Map<name, { value, kind?, version, producerCellId }>
        this.bindings = new Map();

        // cellState: Map<cellId, { status, lastRunInputVersions, outputs }>
        this.cellState = new Map();
        for (var j = 0; j < this._cells.length; j++) {
            var cell = this._cells[j];
            if (!cell.id) { continue; }
            this.cellState.set(cell.id, {
                status: STATUS.IDLE,
                lastRunInputVersions: {},
                outputs: {}
            });
        }

        // dependency graph: producerName → Set<consumerCellId>. Derived from
        // declared in/out. Used ONLY for staleness propagation + run hints.
        this._consumersOfName = new Map();
        for (var k = 0; k < this._cells.length; k++) {
            var cc = this._cells[k];
            if (!cc.id || !Array.isArray(cc.in)) { continue; }
            for (var n = 0; n < cc.in.length; n++) {
                var name = cc.in[n];
                if (!this._consumersOfName.has(name)) {
                    this._consumersOfName.set(name, new Set());
                }
                this._consumersOfName.get(name).add(cc.id);
            }
        }
    }

    /* ── scope ──────────────────────────────────────────────────────────────
     * THE SCOPE RULE: a math value's scope IS this kernel's
     * binding scope. On the shipped WASM dist an EGPT value is an arena handle,
     * so if the arena is drained while a binding still names one, that binding is
     * a dead handle and the next cell dies with `arena:stale-handle`. The two
     * facts therefore move TOGETHER, here, in ONE method — they cannot drift.
     * A cell is not a run: `Runtime.runCell()` deliberately does not reset. */

    /**
     * Begin a fresh value scope: drop every binding AND end the math backend's
     * value scope (arena drain + epoch bump for `wasm-math`, a no-op for
     * `js-reference`).
     *
     * FAIL-LOUD is preserved, not softened: after this call a handle captured
     * before it — in a closure, a chart, a host-held output — is genuinely stale
     * and still throws `arena:stale-handle`. That is the point of bumping the
     * epoch rather than silently reusing slots.
     *
     * Called at the START of `runAll()` (every binding is about to be re-produced
     * by the run itself) and by `dispose()` (notebook unload). A single-cell run
     * does NOT call it — its output has to outlive the cell.
     *
     * WHAT BOUNDS THE ARENA, and the residual this costs. N consecutive Run Alls
     * cost ONE run's residency, not N — each begins a fresh scope (measured:
     * identical `arenaStats().len` across runs 1/2/3 for every shipped notebook;
     * worst case `egpt-test-suite`, 194,370 slots), and unload drains it to 0.
     * BUT repeated MANUAL single-cell runs ACCUMULATE until the next `runAll()` or
     * `dispose()`: the arena has no reclaim finer than the scope, so every
     * INTERMEDIATE of the re-run cell stays resident too, not just its output
     * (measured on a 1000-add cell: 1,002 slots per re-run — 999 dead accumulators
     * and the one live result; 20 re-runs → 21,042, then back to 1,002 at the next
     * Run All). This is NOT a REPL's heap property — a Jupyter kernel retains
     * bindings and collects unreferenced intermediates. Fixing it needs a two-level
     * scope in the arena (a per-cell frame whose intermediates die at cell end, with
     * the cell's declared outputs PROMOTED into the notebook scope) — a retain
     * contract that belongs in `arena.rs` + the facade, never faked on the JS side.
     *
     * @returns {void}
     */
    resetScope() {
        this.bindings.clear();
        this._runtime.resetMathScope();
    }

    /* ── module set (B2) ─────────────────────────────────────────────────────
     * { name → source } over the notebook's `type="module"` cells (the user-code
     * module SET the cell-as-module resolver builds its in-memory blob closure
     * from when a `js` builder cell imports a notebook-local module). The source is
     * read LIVE from cell.body each call so a just-edited module cell is current
     * (never a cached, stale copy). The pane syncs an open module-cell editor's
     * value back into cell.body before a run (mirroring the js-cell sync), so this
     * reflects author edits. */

    /**
     * Returns the notebook's in-memory user-code module set.
     *
     * Keys are the `name` attribute values of `type="module"` cells
     * (e.g. `'./setups/wave.js'`); values are the current cell body source.
     * Read LIVE so a just-edited module cell is always current.
     *
     * @returns {Object<string,string>} `{ name → source }` map.
     */
    moduleSet() {
        var set = {};
        for (var i = 0; i < this._cells.length; i++) {
            var c = this._cells[i];
            if (c.type === 'module' && c.name) {
                set[c.name] = (c.body == null) ? '' : String(c.body);
            }
        }
        return set;
    }

    /* ── state emit ─────────────────────────────────────────────────────── */

    // Set a cell's status and emit the single outbound badge event. NEVER
    // subscribes back. NEVER triggers a run.
    _setStatus(cellId, status) {
        if (this._disposed) { return; }
        var st = this.cellState.get(cellId);
        if (!st) { return; }
        st.status = status;
        this._bus.emit('notebook:cellstate', { cellId: cellId, status: status });
    }

    /* ── run one cell ───────────────────────────────────────────────────── */

    /**
     * Run a single cell by id.
     *
     * 1. Resolve declared inputs from the binding store. A missing input →
     *    FAIL-LOUD reject naming the producing cell (upstream is NOT auto-run).
     * 2. Call `Runtime.runCell()` DIRECTLY (a Promise — no Bus round-trip).
     * 3. On `ok`: commit each declared output into bindings (`++version`); mark
     *    every consumer of a just-updated name `stale` (NOT executed).
     * 4. Emit `notebook:cellstate { cellId, status }` once per state transition.
     *
     * @param {string} cellId
     * @param {object} [opts]
     * @param {Function} [opts.display]
     *   Structured-output sink. The pane passes a DOM-aware display so the cell's
     *   output renders in its own region rather than the shared console pane.
     * @returns {Promise<RunCellResult>}
     *
     * @example
     * // Run cell 'c-build-01', which produces a live runner handle:
     * const { ok, outputs } = await kernel.runCell('c-build-01');
     * if (ok) console.log(outputs.dsRun); // the live FrqtlApp
     */
    runCell(cellId, opts) {
        opts = opts || {};
        if (this._disposed) {
            return Promise.reject(new Error('[NotebookKernel] disposed; cannot run cell "' + cellId + '".'));
        }
        var cell = this._cellById.get(cellId);
        if (!cell) {
            return Promise.reject(new Error('[NotebookKernel] no cell with id "' + cellId + '".'));
        }
        var self = this;

        // 1. Resolve inputs — FAIL-LOUD on a missing binding, naming the producer.
        var inputs = {};
        var declaredIn = Array.isArray(cell.in) ? cell.in : [];
        var lastRunInputVersions = {};
        for (var i = 0; i < declaredIn.length; i++) {
            var name = declaredIn[i];
            if (!self.bindings.has(name)) {
                var producer = self._findProducerCellId(name);
                var hint = producer
                    ? 'run cell ' + producer + ' first.'
                    : 'no cell in this notebook declares it as an output.';
                var err = new Error(
                    '[NotebookKernel] cell "' + cellId + '" declares input "' + name +
                    '", not yet produced — ' + hint + ' (FAIL-LOUD; upstream is NOT auto-run.)'
                );
                self._setStatus(cellId, STATUS.ERROR);
                var st0 = self.cellState.get(cellId);
                if (st0) { st0.outputs = {}; }
                return Promise.reject(err);
            }
            var binding = self.bindings.get(name);
            inputs[name] = binding.value;
            lastRunInputVersions[name] = binding.version;
        }

        // 2. Execute via Runtime.runCell DIRECTLY (no Bus round-trip).
        self._setStatus(cellId, STATUS.RUNNING);
        return self._runtime.runCell({
            lane: cell.lane || 'math',
            code: cell.body || '',
            id: cellId,
            inputs: inputs,
            // B2: the notebook's user-code module set so a builder cell's
            // `import './setups/x.js'` resolves to the in-memory blob closure.
            modules: self.moduleSet(),
            declaredOutputs: Array.isArray(cell.out) ? cell.out : [],
            // Optional per-cell structured-output sink the pane passes (a DOM-aware
            // display that appends nodes/lines to the cell's output region). The
            // kernel stays display-agnostic — it only forwards the caller's fn.
            display: opts.display || null
        }).then(function (result) {
            if (self._disposed) { return result; }
            var st = self.cellState.get(cellId);
            if (result && result.ok) {
                // 3. Commit outputs (++version), mark consumers stale.
                var declaredOut = Array.isArray(cell.out) ? cell.out : [];
                for (var o = 0; o < declaredOut.length; o++) {
                    var outName = declaredOut[o];
                    var prev = self.bindings.get(outName);
                    var nextVersion = prev ? (prev.version + 1) : 1;
                    self.bindings.set(outName, {
                        value: result.outputs[outName],
                        version: nextVersion,
                        producerCellId: cellId
                    });
                    self._markConsumersStale(outName, cellId);
                }
                if (st) {
                    st.outputs = result.outputs || {};
                    st.lastRunInputVersions = lastRunInputVersions;
                }
                self._setStatus(cellId, STATUS.OK);
            } else {
                if (st) { st.outputs = {}; }
                self._setStatus(cellId, STATUS.ERROR);
            }
            return result;
        });
    }

    /**
     * Commit outputs for a view cell (canvas / chart) that does NOT execute through
     * `Runtime.runCell`. The pane calls this when the live runner handle is available
     * (e.g. after a canvas realm boots) so downstream `js` cells can consume it.
     *
     * Mirrors steps 3–4 of `runCell()` (commit `++version`, mark consumers `stale`,
     * set the producing cell `ok`) — one binding-commit authority (DRY).
     * Adds ZERO Bus listeners; never calls Runtime.
     *
     * @param {string} cellId
     * @param {Object<string,*>} outputsObj — `{ name: value, … }` the view cell produces.
     * @returns {void}
     */
    commitViewOutputs(cellId, outputsObj) {
        if (this._disposed) { return; }
        var st = this.cellState.get(cellId);
        var bag = (outputsObj && typeof outputsObj === 'object') ? outputsObj : {};
        var keys = Object.keys(bag);
        for (var i = 0; i < keys.length; i++) {
            var name = keys[i];
            var prev = this.bindings.get(name);
            var nextVersion = prev ? (prev.version + 1) : 1;
            this.bindings.set(name, {
                value: bag[name],
                version: nextVersion,
                producerCellId: cellId
            });
            this._markConsumersStale(name, cellId);
        }
        if (st) { st.outputs = bag; }
        this._setStatus(cellId, STATUS.OK);
    }

    /**
     * Returns the runnable cells (`js`/`canvas`/`chart`/`view`, not `markdown`)
     * in the order `runAll()` should execute them.
     *
     * A producer of a name runs BEFORE any consumer. Ties and un-declared cells
     * keep document order. A dependency cycle → FAIL-LOUD throw (no safe order).
     * NEVER auto-runs; NEVER mutates bindings.
     *
     * FRQTL-MAINT(runall-excludes-chart-cells) — FIXED. The RUNNABLE map used to be `{js, canvas}` only —
     * `runAll()` reported `total:N ran:N` while silently never running `chart`/
     * `view` cells (`double-slit-rosetta-qft.html`),
     * even though a manual per-cell Run on the same cell works (it routes through
     * the pane's realm-cell runner, `opts.runner`, not `runCell`). `chart`/`view`
     * cells DO declare `in`/`out` bindings today (`_resolveChartRecipe` FAIL-LOUD
     * -throws on an unproduced `in`; `commitViewOutputs` commits a view cell's
     * bound outputs) — so including them here is not just "run one more cell",
     * it lets the SAME topological sort correctly order a chart/view cell AFTER
     * whichever cell produces the binding it reads, exactly like a `js` consumer.
     * The pane's `opts.runner` (lib/components/notebook-pane/index.js `runAll()`)
     * already special-cased `chart` alongside `canvas` — it was only ever missing
     * `view`, fixed in the same change.
     *
     * @returns {Array<object>} ordered cell objects (each has `{ id, type, lane, body, in, out }`).
     * @throws {Error} if a cycle is detected in the declared `in`/`out` graph.
     */
    runOrder() {
        var RUNNABLE = { js: true, canvas: true, chart: true, view: true };
        // The runnable cells in document order; markdown (and unknown types that
        // never reach Runtime.runCell) are excluded — they are not "run".
        var ordered = [];
        for (var i = 0; i < this._cells.length; i++) {
            var c = this._cells[i];
            if (c.id && RUNNABLE[c.type]) { ordered.push(c); }
        }

        // Build edges producer→consumer over the runnable set, keyed by cell id.
        // docIndex gives a stable document-order tiebreak in the ready queue.
        var docIndex = new Map();
        var indegree = new Map();
        var edgesFrom = new Map();   // producerId → Set<consumerId>
        for (var d = 0; d < ordered.length; d++) {
            docIndex.set(ordered[d].id, d);
            indegree.set(ordered[d].id, 0);
            edgesFrom.set(ordered[d].id, new Set());
        }
        for (var e = 0; e < ordered.length; e++) {
            var consumer = ordered[e];
            var declaredIn = Array.isArray(consumer.in) ? consumer.in : [];
            for (var n = 0; n < declaredIn.length; n++) {
                var producerId = this._findProducerCellId(declaredIn[n]);
                // Only count an edge when the producer is itself a runnable cell in
                // THIS set and is not the consumer itself (a cell that declares the
                // same name in+out is a self-edge — ignore it, not a real dep).
                if (producerId && producerId !== consumer.id && indegree.has(producerId)) {
                    var fanout = edgesFrom.get(producerId);
                    if (!fanout.has(consumer.id)) {
                        fanout.add(consumer.id);
                        indegree.set(consumer.id, indegree.get(consumer.id) + 1);
                    }
                }
            }
        }

        // Kahn's algorithm, ready queue kept in document order (smallest docIndex
        // first) so the output is stable and == document order with no deps.
        var ready = [];
        for (var r = 0; r < ordered.length; r++) {
            if (indegree.get(ordered[r].id) === 0) { ready.push(ordered[r].id); }
        }
        var result = [];
        var byId = this._cellById;
        while (ready.length > 0) {
            ready.sort(function (a, b) { return docIndex.get(a) - docIndex.get(b); });
            var id = ready.shift();
            result.push(byId.get(id));
            edgesFrom.get(id).forEach(function (consumerId) {
                indegree.set(consumerId, indegree.get(consumerId) - 1);
                if (indegree.get(consumerId) === 0) { ready.push(consumerId); }
            });
        }

        if (result.length !== ordered.length) {
            throw new Error(
                '[NotebookKernel] runAll cannot order cells: a dependency CYCLE exists ' +
                'among declared in/out bindings. (FAIL-LOUD — no safe linear run order.)'
            );
        }
        return result;
    }

    /**
     * Run all runnable cells in topological order (sequential — one at a time).
     *
     * A pure SEQUENCER over `runCell()`. Registers ZERO Bus listeners, adds ZERO
     * executors. Emits one `notebook:runall { index, total, cellId, phase }` per step.
     *
     * FAIL-LOUD stop-on-error: the FIRST cell that fails STOPS the run;
     * `runAll` resolves (does not throw) with `{ ok: false, failedCellId }`.
     *
     * @param {object} [opts]
     * @param {Function} [opts.displayFor]
     *   `(cellId: string) → displayFn`. The pane supplies this so each cell's
     *   structured output routes to its own region.
     * @param {Function} [opts.onProgress]
     *   `({ index, total, cellId, phase }) → void`. Progress callback in addition
     *   to the Bus event.
     * @param {Function} [opts.runner]
     *   `(cell) → Promise<{ ok, error }> | null`. Pane-supplied runner for cell
     *   types the kernel cannot execute via `Runtime.runCell` (e.g. `canvas` cells,
     *   which the pane mounts as a live GraphicsPane). When it returns a thenable,
     *   that result is used INSTEAD of `runCell` for that cell.
     * @returns {Promise<RunAllResult>}
     *
     * @example
     * const summary = await kernel.runAll({
     *   displayFor: (id) => pane.displayFor(id),
     *   onProgress: ({ index, total, cellId }) =>
     *     console.log(`Running ${index}/${total}: ${cellId}`)
     * });
     * if (!summary.ok) {
     *   console.error('Failed at cell:', summary.failedCellId, summary.error);
     * }
     */
    runAll(opts) {
        opts = opts || {};
        if (this._disposed) {
            return Promise.reject(new Error('[NotebookKernel] disposed; cannot runAll.'));
        }
        var self = this;
        var order;
        try {
            order = self.runOrder();
        } catch (orderErr) {
            return Promise.reject(orderErr);
        }
        // A fresh value scope for the run (#67). Safe by construction: runAll
        // re-produces every binding a runnable cell declares, in an order that
        // puts each producer before its consumers — so nothing in the cleared
        // store is read before it is rewritten. A leftover from an earlier,
        // partial run is exactly what must NOT silently satisfy an input.
        self.resetScope();
        var total = order.length;
        var displayFor = (typeof opts.displayFor === 'function') ? opts.displayFor : null;
        var onProgress = (typeof opts.onProgress === 'function') ? opts.onProgress : null;
        var runner     = (typeof opts.runner === 'function') ? opts.runner : null;
        var results = [];

        function emitProgress(index, cellId, phase) {
            var payload = { index: index, total: total, cellId: cellId, phase: phase };
            if (!self._disposed) { self._bus.emit('notebook:runall', payload); }
            if (onProgress) { onProgress(payload); }
        }

        // Sequential reduce: await each runCell before the next (chain of .then).
        var chain = Promise.resolve();
        var stopped = { ok: true, failedCellId: null, error: null, ran: 0 };

        order.forEach(function (cell, idx) {
            chain = chain.then(function () {
                if (self._disposed || !stopped.ok) { return; }
                emitProgress(idx + 1, cell.id, 'running');
                // Pane-supplied runner for cell types the kernel cannot execute via
                // the Runtime runCell path (canvas). If it returns a thenable we use
                // it; otherwise fall through to runCell. NO executor added either way.
                var paneRun = runner ? runner(cell) : null;
                if (paneRun && typeof paneRun.then === 'function') {
                    return paneRun.then(function (result) {
                        results.push({ cellId: cell.id, result: result });
                        stopped.ran += 1;
                        if (!result || !result.ok) {
                            stopped.ok = false;
                            stopped.failedCellId = cell.id;
                            stopped.error = (result && result.error)
                                ? result.error
                                : 'cell "' + cell.id + '" did not complete ok.';
                            emitProgress(idx + 1, cell.id, 'error');
                        } else {
                            emitProgress(idx + 1, cell.id, 'ok');
                        }
                    }, function (err) {
                        results.push({ cellId: cell.id, result: { ok: false, error: (err && err.message) ? err.message : String(err) } });
                        stopped.ran += 1;
                        stopped.ok = false;
                        stopped.failedCellId = cell.id;
                        stopped.error = (err && err.message) ? err.message : String(err);
                        emitProgress(idx + 1, cell.id, 'error');
                    });
                }
                var runOpts = displayFor ? { display: displayFor(cell.id) } : {};
                return self.runCell(cell.id, runOpts).then(function (result) {
                    results.push({ cellId: cell.id, result: result });
                    stopped.ran += 1;
                    if (!result || !result.ok) {
                        // runCell resolved ok:false (e.g. a missing declared OUTPUT)
                        // — STOP here, FAIL-LOUD naming the cell.
                        stopped.ok = false;
                        stopped.failedCellId = cell.id;
                        stopped.error = (result && result.error)
                            ? result.error
                            : 'cell "' + cell.id + '" did not complete ok.';
                        emitProgress(idx + 1, cell.id, 'error');
                    } else {
                        emitProgress(idx + 1, cell.id, 'ok');
                    }
                }, function (err) {
                    // runCell REJECTED (e.g. a missing declared INPUT, or a thrown
                    // body error surfaced as a reject) — STOP here, FAIL-LOUD.
                    results.push({ cellId: cell.id, result: { ok: false, error: (err && err.message) ? err.message : String(err) } });
                    stopped.ran += 1;
                    stopped.ok = false;
                    stopped.failedCellId = cell.id;
                    stopped.error = (err && err.message) ? err.message : String(err);
                    emitProgress(idx + 1, cell.id, 'error');
                });
            });
        });

        return chain.then(function () {
            return {
                total: total,
                ran: stopped.ran,
                ok: stopped.ok,
                failedCellId: stopped.failedCellId,
                error: stopped.error,
                results: results
            };
        });
    }

    /* ── staleness (marks only — NEVER auto-runs) ───────────────────────── */

    // Mark every consumer of `name` stale, except the cell that just produced it.
    _markConsumersStale(name, producerCellId) {
        var consumers = this._consumersOfName.get(name);
        if (!consumers) { return; }
        var self = this;
        consumers.forEach(function (consumerId) {
            if (consumerId === producerCellId) { return; }
            var st = self.cellState.get(consumerId);
            if (!st) { return; }
            // Only a cell that has already run (ok/error) becomes stale; an idle
            // cell stays idle (nothing to invalidate yet).
            if (st.status === STATUS.OK || st.status === STATUS.ERROR) {
                self._setStatus(consumerId, STATUS.STALE);
            }
        });
    }

    // The first cell (document order) that declares `name` as an output.
    _findProducerCellId(name) {
        for (var i = 0; i < this._cells.length; i++) {
            var c = this._cells[i];
            if (c.id && Array.isArray(c.out) && c.out.indexOf(name) !== -1) {
                return c.id;
            }
        }
        return null;
    }

    /* ── read accessors ─────────────────────────────────────────────────── */

    /**
     * @param {string} cellId
     * @returns {CellState|null} current cell state, or `null` if not found.
     */
    getCellState(cellId) { return this.cellState.get(cellId) || null; }

    /**
     * @param {string} name — binding name.
     * @returns {BindingEntry|null} the binding entry, or `null` if not yet produced.
     */
    getBinding(name) { return this.bindings.get(name) || null; }

    /* ── dispose ────────────────────────────────────────────────────────── */

    /**
     * Tear down the kernel. The pane calls this on notebook unload.
     *
     * The kernel holds NO Bus listeners to remove (veto #1). `dispose()` marks
     * the instance dead (in-flight `runCell` resolutions become no-ops) and clears
     * all internal maps. Canvas/runner teardown is the pane's responsibility.
     *
     * It also ends the math value scope (`resetScope()`): the bindings that kept
     * those arena values alive are going away with the notebook, so this is what
     * bounds the arena across notebook loads.
     *
     * @returns {void}
     */
    dispose() {
        this._disposed = true;
        this.resetScope();
        this.cellState.clear();
        this._cellById.clear();
        this._consumersOfName.clear();
        this._cells = [];
    }
}

export { STATUS as NOTEBOOK_CELL_STATUS };
