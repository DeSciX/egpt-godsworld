/* Copyright 2023-2026 by Essam Abadir */

/**
 * script-sequencer.js — THE one classic-script loader and THE one boot-phase record.
 *
 * Every manifest-owned script list (ENGINE / RENDERER / GAME / page scripts) is injected through
 * `injectInOrder`: all tags of a list are appended at once with `script.async = false`, so the
 * browser FETCHES them in parallel and EXECUTES them in document order (the HTML "list of scripts
 * that will execute in order as soon as possible"). Load order, and therefore every load-order
 * constraint the manifests document, is unchanged; only the fetch stops waiting for the previous
 * script's onload.
 *
 * Consumers (each bootstraps THIS file once, then calls the window owner):
 *   - lib/frqtl/experiments/_shared/stack-boot.js — experiment pages, the empty page, GraphicsPane,
 *     ensureEngineStack.
 *   - sdk/frqtl-sdk/src/esm/index.js — bootRecipe / bootScene.
 *   - sdk/frqtl-sdk/src/browser/parity-boot.js — the `.` browser parity core (through esm/index.js).
 *
 *   createScriptSequencer(doc) → { injectInOrder(list, opts?) → Promise<void>, scriptCount(list) }
 *     list:  Array<string | {src, attrs?}>; an empty src is the router's dist-omit signal and is
 *            skipped (never counted).
 *     opts.onLoaded(done, total, src) — once per loaded tag, `done` monotone 1..total.
 *     opts.label — the bracketed stem of the load-failure message (default 'script-sequencer').
 *     Resolves when every tag has loaded. Rejects ONCE, on the first failing tag, with an Error
 *     whose `src` names it. Idempotent per URL across calls; a tag already in the document
 *     (a page's own static <script src>) counts as loaded. Never throws synchronously.
 *
 *   createBootRecord(doc, phaseIds) → { begin(id,total), step(id), complete(id), fail(id,err),
 *                                       snapshot() }
 *     The ONE writer of the boot-phase record on <html>:
 *       data-egpt-boot-phase     the first phase not complete (the last phase once all are)
 *       data-egpt-boot-done/-total  that phase's counts
 *       data-egpt-boot-progress  JSON {id: {done,total,complete}} for every phase
 *       data-egpt-boot-failed    the phase that failed (absent until one does)
 *     and of the `frqtl:boot-phase` CustomEvent (detail = snapshot()), dispatched on `doc` and —
 *     when the document is same-origin framed — on its `frameElement`, so a host can watch the
 *     iframe element, which outlives the frame's navigations. Phases may FILL out of order (WASM
 *     instantiates on its own clock while later lists load); nothing moves except on a call from
 *     a loaded script or a settled promise. There is no timer in this file.
 *
 *   The phase VOCABULARY is owned by lib/shim/engine/boot-phases.js::BOOT_PHASES; this file takes
 *   the ids as an argument and refuses any other id.
 *
 * Dual-mode: window.FrqtlScriptSequencer in a page, module.exports under node.
 */
(function (root) {
    'use strict';

    function _entrySrc(it) {
        var src = (typeof it === 'string') ? it : (it && it.src);
        return (typeof src === 'string') ? src.trim() : '';
    }

    function createScriptSequencer(doc) {
        if (!doc || typeof doc.createElement !== 'function') {
            throw new TypeError('[script-sequencer] createScriptSequencer(doc): doc must be a Document');
        }
        var loads = Object.create(null);   // src → Promise<void>, the ONE per-URL map

        function _one(src, attrs, label) {
            if (loads[src]) { return loads[src]; }
            if (typeof doc.querySelector === 'function' && doc.querySelector('script[src="' + src + '"]')) {
                return (loads[src] = Promise.resolve());
            }
            loads[src] = new Promise(function (resolve, reject) {
                var s = doc.createElement('script');
                s.async = false;   // fetch in parallel, execute in document order
                s.src = src;
                if (attrs) { Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); }); }
                s.onload = function () { resolve(); };
                s.onerror = function () {
                    var err = new Error('[' + label + '] load failed: ' + src);
                    err.src = src;
                    reject(err);
                };
                (doc.head || doc.body).appendChild(s);
            });
            return loads[src];
        }

        function scriptCount(list) {
            if (!Array.isArray(list)) {
                throw new TypeError('[script-sequencer] a script list must be an array (got ' + typeof list + ')');
            }
            var n = 0;
            for (var i = 0; i < list.length; i++) { if (_entrySrc(list[i])) { n++; } }
            return n;
        }

        function _injectInOrder(list, opts) {
            opts = opts || {};
            var label = opts.label || 'script-sequencer';
            var onLoaded = opts.onLoaded;
            if (onLoaded !== undefined && typeof onLoaded !== 'function') {
                throw new TypeError('[script-sequencer] opts.onLoaded must be a function when given');
            }
            var total = scriptCount(list);
            var done = 0;
            var pending = [];
            // Append EVERY tag before awaiting any: this loop is the parallel fetch.
            for (var i = 0; i < list.length; i++) {
                var src = _entrySrc(list[i]);
                if (!src) { continue; }
                var attrs = (typeof list[i] === 'object' && list[i].attrs) ? list[i].attrs : null;
                pending.push(_one(src, attrs, label).then((function (s) {
                    return function () {
                        done++;
                        if (onLoaded) { onLoaded(done, total, s); }
                    };
                })(src)));
            }
            return Promise.all(pending).then(function () {});
        }

        return {
            injectInOrder: function (list, opts) {
                try { return _injectInOrder(list, opts); } catch (e) { return Promise.reject(e); }
            },
            scriptCount: scriptCount
        };
    }

    var BOOT_EVENT = 'frqtl:boot-phase';

    function createBootRecord(doc, phaseIds) {
        if (!doc || !doc.documentElement || typeof doc.documentElement.setAttribute !== 'function') {
            throw new TypeError('[script-sequencer] createBootRecord(doc, ids): doc must be a Document');
        }
        if (typeof doc.dispatchEvent !== 'function') {
            throw new TypeError('[script-sequencer] createBootRecord: the document has no dispatchEvent — ' +
                'the frqtl:boot-phase event is half of the published boot record');
        }
        if (!Array.isArray(phaseIds) || phaseIds.length === 0) {
            throw new TypeError('[script-sequencer] createBootRecord: phaseIds must be a non-empty array ' +
                '(lib/shim/engine/boot-phases.js::BOOT_PHASES)');
        }
        var state = Object.create(null);
        phaseIds.forEach(function (id) {
            if (typeof id !== 'string' || !id || state[id]) {
                throw new TypeError('[script-sequencer] createBootRecord: phase ids must be unique non-empty strings (got ' +
                    JSON.stringify(id) + ')');
            }
            state[id] = { done: 0, total: 0, complete: false };
        });
        var failed = null;

        function _phase(id) {
            if (!state[id]) {
                throw new Error('[script-sequencer] boot record: "' + id + '" is not a boot phase — ' +
                    phaseIds.join(', ') + ' (lib/shim/engine/boot-phases.js::BOOT_PHASES).');
            }
            return state[id];
        }

        function _current() {
            for (var i = 0; i < phaseIds.length; i++) { if (!state[phaseIds[i]].complete) { return phaseIds[i]; } }
            return phaseIds[phaseIds.length - 1];
        }

        function snapshot() {
            var phases = {};
            phaseIds.forEach(function (id) {
                var p = state[id];
                phases[id] = { done: p.done, total: p.total, complete: p.complete };
            });
            var cur = _current();
            return { phase: cur, done: state[cur].done, total: state[cur].total, phases: phases, failed: failed };
        }

        function _dispatch(target, snap) {
            var view = target.ownerDocument ? target.ownerDocument.defaultView : (target.defaultView || null);
            var Ctor = (view && view.CustomEvent) || root.CustomEvent;
            target.dispatchEvent(new Ctor(BOOT_EVENT, { detail: snap }));
        }

        function _publish() {
            var snap = snapshot();
            var el = doc.documentElement;
            el.setAttribute('data-egpt-boot-phase', snap.phase);
            el.setAttribute('data-egpt-boot-done', String(snap.done));
            el.setAttribute('data-egpt-boot-total', String(snap.total));
            el.setAttribute('data-egpt-boot-progress', JSON.stringify(snap.phases));
            if (failed) { el.setAttribute('data-egpt-boot-failed', failed); }
            _dispatch(doc, snap);
            var frame = null;
            try { frame = doc.defaultView ? doc.defaultView.frameElement : null; } catch (e) { frame = null; }
            if (frame && typeof frame.dispatchEvent === 'function') { _dispatch(frame, snapshot()); }
            return snap;
        }

        return {
            begin: function (id, total) {
                var p = _phase(id);
                if (typeof total !== 'number' || total < 0 || Math.floor(total) !== total) {
                    throw new TypeError('[script-sequencer] boot record: begin("' + id + '", total) needs a non-negative integer');
                }
                p.total = total;
                return _publish();
            },
            step: function (id) {
                var p = _phase(id);
                if (p.done >= p.total) {
                    throw new Error('[script-sequencer] boot record: "' + id + '" stepped past its total ' + p.total);
                }
                p.done++;
                return _publish();
            },
            complete: function (id) {
                var p = _phase(id);
                p.done = p.total;
                p.complete = true;
                return _publish();
            },
            fail: function (id) {
                _phase(id);
                if (!failed) { failed = id; }
                return _publish();
            },
            snapshot: snapshot
        };
    }

    var api = {
        createScriptSequencer: createScriptSequencer,
        createBootRecord: createBootRecord,
        BOOT_EVENT: BOOT_EVENT
    };

    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined' && window.document) {
        if (!window.FrqtlScriptSequencer) {
            window.FrqtlScriptSequencer = {
                BOOT_EVENT: BOOT_EVENT,
                createBootRecord: createBootRecord,
                createScriptSequencer: createScriptSequencer,
                // THE page instance: one per-URL map for every consumer in this document.
                page: createScriptSequencer(window.document)
            };
        }
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
