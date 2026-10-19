/* Copyright 2023-2026 by Essam Abadir */

/**
 * frqtl-control-sync.js — TRIGGERED-PULL reconciliation across N widgets
 * driving the SAME declared-once control (gym-controls-as-sugar FULL
 * CONVERGENCE build, Stage ii item 4).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `makeControlSync(opts) → { register(id, widget)->unregisterFn, pull()->Promise,
 * notify(trigger), dispose() }`.
 *
 * The North Star (§5 design constraint) is STUDIO live drive-and-placement
 * — multiple users/widgets "batting a sun around" the SAME control. A single
 * widget mutating a value is NOT reconciliation; N widgets (a page slider, a
 * panel row, a standalone widget, a REMOTE panel over an iframe) must all
 * REFLECT the SAME canonical state after ANY of them writes. `ControlSync`
 * is the PULL side of that: it periodically (per its configured `trigger`)
 * re-reads every registered control's CURRENT value (via the existing
 * `listControls` verb — the RPC, reused unmodified: `frqtl-controls-panel.js`'s
 * `listControls` now refreshes bind-based descriptors from LIVE state before
 * serializing, see that file's own docstring) and calls `widget.setValue(value,
 * valueText)` on every OTHER registered widget for that control id — a
 * DISPLAY-ONLY write (`frqtl-control-slider.js`'s `setValue`, hard-tested to
 * never fire `onChange`/`onInput`) so reconciliation can never itself trigger
 * another write (no echo/feedback loop).
 *
 * `ControlSync` never pushes on every mutation — it is a TRIGGERED PULL,
 * never a push-per-write subscription (there is no such subscription
 * mechanism anywhere in this stack: `FrqtlApp.onTick` is a single
 * slot, not a multi-listener event bus). `SYNC_TRIGGERS` is the CLOSED set of
 * cadences a page may wire:
 *
 *   'manual' — the caller calls `sync.pull()` explicitly whenever it wants a
 *              reconciliation pass (e.g. after a Reset button, or any
 *              one-off event). No automatic wiring; no DEV-WARN.
 *   'tick'   — the page's OWN existing `onTick` callback gets ONE opt-in line:
 *              `sync.notify('tick')` — coalesced via `requestAnimationFrame`
 *              (or a `setTimeout` fallback in non-browser/test contexts) so a
 *              60Hz tick loop produces AT MOST one pull per animation frame,
 *              never one RPC round-trip per tick.
 *   'pause'  — the page wires ONE line into its pause/idle handler instead
 *              (`sync.notify('pause')`) — reconcile only when the sim is not
 *              actively running (the lower-chatter default for a multi-user
 *              "batting a sun around" session: continuous ticking rarely
 *              needs continuous cross-widget reconciliation, but a pause is
 *              exactly when a user expects to see everyone's current state).
 *
 * A configured `trigger:'tick'`/`'pause'` that never receives its matching
 * `notify()` call within `opts.devWarnMs` (default 3000ms) logs ONE
 * `console.warn` (DEV-WARN — the page forgot its one-line wiring;
 * this is a development aid, never a thrown error — a sync with a forgotten
 * trigger is inert, not broken).
 *
 * ── Two pull sources (in-app vs remote — the SAME `listControls` verb) ───────
 *
 * `opts.registry` (in-app, same-window): pulls via
 * `frqtl-controls-panel.js`'s exported `dispatch(registry, 'listControls',
 * [name])` — the SAME single dispatch point the panel's in-app path and RPC
 * responder already share (DRY: a THIRD consumer of one implementation, not
 * a re-derived listing).
 *
 * `opts.handle` (remote, over an iframe/postMessage — the EXISTING
 * RPC): pulls via `handle.call('listControls', [name])` — the identical RPC
 * primitive `frqtl-controls-panel.js`'s `mount({mode:'iframe'})` already
 * builds via `lib/shim/rpc`. `ControlSync` does not care which — both
 * resolve to a `Promise<Array<{id,label,min,max,step,value,valueText}>>`.
 *
 * Exactly one of `opts.registry` / `opts.handle` is required.
 *
 * ── Performance constraints (build requirements, not suggestions) ────────────
 *
 * - rAF-coalesced: `notify()` schedules AT MOST one pending pull per
 *   animation frame, however many times it is called within that frame.
 * - Skip-if-unchanged: a widget only receives `setValue()` when its value
 *   actually differs from the LAST value that widget was reconciled to (a
 *   per-(control id) last-value cache, not per-widget — every widget bound
 *   to the same id shares the comparison, so N widgets cost one comparison).
 * - Stateless widgets: `frqtl-control-slider.js` holds no reconciliation
 *   state of its own — `ControlSync` is the ONE place that decides "did this
 *   change" and "who needs to hear about it", designed for N concurrent
 *   writers from the outset (the pull always re-reads canonical state fresh;
 *   there is no per-writer diffing).
 * - Zero added engine reads: the pull rides `listControls`'s EXISTING
 *   `getFrameProperty`/`TickData` accessors — `ControlSync` itself performs
 *   no engine query of its own.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * Zero physics. Pure reconciliation plumbing over the EXISTING accessor/RPC
 * substrate — a synced widget reflects the IDENTICAL simulation state any
 * other consumer of the same control would read, just with a bounded
 * (rAF-coalesced) display latency.
 */

import { FrqtlControlsPanel as _ControlsPanelNode } from '../../parts/FrqtlControlsPanel.js';





/** The closed, exported vocabulary of pull cadences — FAIL-LOUD on any other value. */
var SYNC_TRIGGERS = Object.freeze(['manual', 'tick', 'pause']);

function _raf(fn) {
    if (typeof requestAnimationFrame === 'function') { return requestAnimationFrame(fn); }
    // Non-browser (Node test) / older-browser fallback — same ~1-frame cadence.
    return setTimeout(fn, 16);
}

/**
 * makeControlSync(opts) → sync handle.
 *
 * @param {object} opts
 * @param {string} opts.name — the registry instance name (matches
 *   `exposeRegistry`'s registry / `mount`'s `opts.name`).
 * @param {object} [opts.registry] — in-app pull source (a makeControlRegistry()
 *   instance already `exposeRegistry`'d). Exactly one of registry/handle required.
 * @param {{call:(fn:string,args:any[])=>Promise}} [opts.handle] — remote pull
 *   source (an RPC handle — `lib/shim/rpc`'s `makeChannelRpc`/`makeInAppRpc`
 *   shape, e.g. one already built by `frqtl-controls-panel.js`'s `mount()`).
 * @param {'manual'|'tick'|'pause'} [opts.trigger='manual'] — the ONE cadence
 *   this sync instance is wired for (per-instance, not per-call — a page
 *   with both a tick-driven and a pause-driven need makes TWO sync instances).
 * @param {number} [opts.devWarnMs=3000] — grace window before the DEV-WARN
 *   fires for `trigger:'tick'|'pause'` with no matching `notify()` call yet.
 * @returns {{
 *   register: (id:string, widget:{setValue:Function}) => (() => void),
 *   pull: () => Promise<void>,
 *   notify: (trigger:string) => void,
 *   dispose: () => void
 * }}
 * @throws {Error} FAIL-LOUD — missing `opts.name`, an unrecognized `opts.trigger`,
 *   or neither/both of `opts.registry`/`opts.handle` supplied.
 */
function makeControlSync(opts) {
    opts = opts || {};
    if (!opts.name) {
        throw new Error('[frqtl-control-sync] makeControlSync requires opts.name. (FAIL-LOUD.)');
    }
    var trigger = (opts.trigger !== undefined) ? opts.trigger : 'manual';
    if (SYNC_TRIGGERS.indexOf(trigger) === -1) {
        throw new Error('[frqtl-control-sync] opts.trigger must be one of [' + SYNC_TRIGGERS.join(', ') +
            ']; got ' + JSON.stringify(trigger) + '. (FAIL-LOUD.)');
    }
    var hasRegistry = !!opts.registry;
    var hasHandle = !!opts.handle;
    if (hasRegistry === hasHandle) {
        throw new Error('[frqtl-control-sync] makeControlSync requires EXACTLY ONE of opts.registry ' +
            '(in-app pull) or opts.handle (remote RPC pull); got ' +
            (hasRegistry ? 'both' : 'neither') + '. (FAIL-LOUD.)');
    }

    var name = opts.name;
    var widgetsById = Object.create(null);   // id -> [{setValue}]
    var lastValueById = Object.create(null); // id -> last value reconciled TO (skip-if-unchanged)
    var pendingRaf = null;                   // rAF-coalescing token (non-null while a pull is scheduled)
    var disposed = false;

    // ── Pull source (exactly one path is active, decided once at construction) ──
    function _rawPull() {
        if (hasRegistry) {
            return Promise.resolve(_ControlsPanelNode.dispatch(opts.registry, 'listControls', [name]));
        }
        return opts.handle.call('listControls', [name]);
    }

    /**
     * register(id, widget) — a widget joins this control id's reconciliation
     * set. `widget` must expose `setValue(value, valueText?)`
     * (`frqtl-control-slider.js`'s mount() return, or any object with the
     * same display-only method). Multiple widgets may register under the
     * SAME id (that IS the multi-widget reconciliation case).
     * @returns {() => void} unregister — removes only THIS widget.
     * @throws {Error} FAIL-LOUD on a missing id or a widget without setValue.
     */
    function register(id, widget) {
        if (!id || typeof id !== 'string') {
            throw new Error('[frqtl-control-sync] register requires a non-empty string id. (FAIL-LOUD.)');
        }
        if (!widget || typeof widget.setValue !== 'function') {
            throw new Error('[frqtl-control-sync] register("' + id + '") requires a widget exposing ' +
                'setValue(value, valueText?) (frqtl-control-slider.js\'s mount() return). (FAIL-LOUD.)');
        }
        (widgetsById[id] = widgetsById[id] || []).push(widget);
        return function unregister() {
            var arr = widgetsById[id];
            if (!arr) { return; }
            var i = arr.indexOf(widget);
            if (i !== -1) { arr.splice(i, 1); }
        };
    }

    /**
     * pull() — perform ONE reconciliation pass immediately (bypasses rAF
     * coalescing — this IS the manual trigger's entry point, and is also
     * called by `notify()` once per coalesced frame).
     * @returns {Promise<void>}
     */
    function pull() {
        return _rawPull().then(function (descs) {
            if (disposed) { return; }
            descs.forEach(function (d) {
                var arr = widgetsById[d.id];
                if (!arr || !arr.length) { return; } // no widget registered for this id — nothing to reconcile
                // Skip-if-unchanged: ONE comparison per control id, shared across
                // every widget registered under it (performance constraint).
                if (lastValueById[d.id] === d.value) { return; }
                lastValueById[d.id] = d.value;
                arr.forEach(function (w) { w.setValue(d.value, d.valueText); });
            });
        });
    }

    // ── DEV-WARN: a configured tick/pause trigger that
    // never receives its matching notify() within the grace window means the
    // page forgot its one-line wiring. Cleared the FIRST time notify() fires
    // for the configured trigger (even a single call proves it's wired).
    var devWarnMs = (typeof opts.devWarnMs === 'number') ? opts.devWarnMs : 3000;
    var devWarnTimer = null;
    if (trigger === 'tick' || trigger === 'pause') {
        devWarnTimer = setTimeout(function () {
            devWarnTimer = null;
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[frqtl-control-sync] trigger:"' + trigger + '" was declared for "' + name +
                    '" but notify("' + trigger + '") was never called within ' + devWarnMs + 'ms — did the ' +
                    'page forget its one-line `sync.notify(\'' + trigger + '\')` call (inside its own onTick ' +
                    'or pause handler)? (DEV-WARN — an un-notified sync is inert, not broken.)');
            }
        }, devWarnMs);
    }

    /**
     * notify(firedTrigger) — the page's ONE opt-in line
     * (`sync.notify('tick')` inside its existing onTick, or
     * `sync.notify('pause')` inside its pause handler). A call for a
     * DIFFERENT trigger than this instance is configured for is a silent
     * no-op (lets a page share one sync-notify call site across multiple
     * lifecycle hooks without each sync instance needing to filter itself
     * out — see file docstring: one instance = one cadence).
     * rAF-coalesced: any number of `notify()` calls within one animation
     * frame schedule AT MOST one `pull()`.
     */
    function notify(firedTrigger) {
        // 'manual' instances never auto-reconcile from notify() AT ALL — even a
        // notify('manual') call is a no-op; manual mode's entry point is
        // `sync.pull()` directly, called by the caller whenever it wants a pass.
        if (trigger === 'manual') { return; }
        if (firedTrigger !== trigger) { return; }
        if (devWarnTimer) { clearTimeout(devWarnTimer); devWarnTimer = null; }
        if (pendingRaf !== null) { return; } // already coalesced into a scheduled frame
        pendingRaf = _raf(function () {
            pendingRaf = null;
            if (disposed) { return; }
            pull();
        });
    }

    function dispose() {
        disposed = true;
        if (devWarnTimer) { clearTimeout(devWarnTimer); devWarnTimer = null; }
        widgetsById = Object.create(null);
    }

    return { register: register, pull: pull, notify: notify, dispose: dispose };
}

// ── Export ────────────────────────────────────────────────────────────────────

var FrqtlControlSync = { makeControlSync: makeControlSync, SYNC_TRIGGERS: SYNC_TRIGGERS };

export { FrqtlControlSync };

