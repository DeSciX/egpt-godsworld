/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot.js — THE page boot (an ES module): the game-layer modules ‖ engine ‖ renderer → the sketch.
 *
 *   bootRealm(opts) → Promise<{ engine, display, renderer }>      modules + engine latched per document
 *       Imports the parts barrel (every published kind registers in this realm), boots the WASM engine
 *       (compat/engine.js, browser loader) and the renderer in parallel, sets the display (the slot and
 *       <html data-frqtl-renderer>, ONE writer: setDisplay), and installs the page door
 *       (page-door.js installPageDoor: window.FrqtlPage, nothing else — the retired-global refusal is an
 *       in-tree page entry's own call, refuseRetiredGlobals). Resolves with the engine handle, the slot's display name and the selection.
 *       opts:
 *         renderer      the page's DEFAULT renderer ('p5' | 'three' | 'custom'); `?renderer=` wins; absent,
 *                       the session's current selection is kept (a document's first boot: p5)
 *         engine        the page's DEFAULT engine (only 'wasm' exists); `?engine=` wins
 *         provider      a BYO RendererProvider instance (renderer 'custom'), checked against the contract
 *         meshLoaders   true → the three GLTF/DRACO loaders load after three
 *         overlayHost   an element failure overlays paint into (else the full viewport)
 *   bootPage(opts) → { realm, ready, completeSketch(), failSketch(err) }   the experiment-page door
 *       bootRealm(opts), then the page's `setup` (opts.setup): through p5 (p5's load calls it, global
 *       mode) when `opts.p5 === 'always'` or the renderer is p5, else called directly.
 *       `opts.sketch === 'deferred'`: setup() does not complete the `sketch` phase — the page builds its
 *       scene later and calls completeSketch() / failSketch(err) (the empty page: a host applies a
 *       scene). `ready` settles once p5 has loaded (p5 path) or setup() ran (direct path), and rejects on
 *       any boot failure. A page's setup factories and helpers are its own module's static imports.
 *   selectRenderer(name, opts) → Promise<provider>   build a renderer's provider and set it as the display
 *   setDisplay(provider, name)                        THE one writer of the display fact: the slot AND <html data-frqtl-renderer>
 *   bootedRenderer() → string|null                    the renderer the display slot holds
 *   applyRenderState(runner, bag)                     a renderState bag onto a booted runner, against THIS
 *                                                     page's renderer registry (RenderState.apply's env)
 *   paintBootFailure(axis, msg)                       THE one boot-failure overlay painter (boot-failure.js)
 *   createBootRecord(doc, ids)                        THE one writer of <html data-egpt-boot-*> + the event
 *
 * The record is written in lib/shim/engine/boot-phases.js's phases (modules | engine-ready | renderer |
 * sketch) on <html data-egpt-boot-*> and as the `frqtl:boot-phase` event on the document and its frame
 * element. `modules` completes before `engine-ready`: the engine phase completes only once the parts
 * barrel imported. Nothing here reads or writes a page global: the page door is page-door.js's, the
 * vendor globals are compat/vendor.js's.
 */

import { bootEngine } from '../../compat/engine.js';
import { browserWasmLoader } from '../../compat/providers/wasm-load-browser.js';
import * as FrqtlDisplay from '../../compat/renderer/display-slot.js';
import { RENDERER_PROVIDERS } from '../../compat/renderer/providers/index.js';
import { knownRenderCapabilityNames } from '../../compat/renderer/renderCapabilities-common.js';
import { apply as applyRenderStateBag } from '../../../shim/render-state/apply.js';
import { validateRendererProvider } from '../../compat/renderer/renderer-provider-contract.js';
import { loadThree, runSketch } from '../../compat/vendor.js';
import { KEYS, HOST_TOKENS } from '../../../shim/page-params/index.js';
import { BOOT_PHASE_IDS, BOOT_PHASE_EVENT } from '../../../shim/engine/boot-phases.js';
import { paintBootFailure, setBootOverlayHost } from './boot-failure.js';
import { installPageDoor } from './page-door.js';

export { paintBootFailure };

// ── the boot record ─────────────────────────────────────────────────────────────

/**
 * The ONE writer of the boot record: <html data-egpt-boot-phase|-done|-total|-progress|-failed> and the
 * `frqtl:boot-phase` CustomEvent (detail = snapshot()) on `doc` and — same-origin framed — its
 * frameElement, which outlives the frame's navigations.
 *
 * @param {Document} doc
 * @param {string[]} phaseIds  BOOT_PHASE_IDS
 * @returns {{begin(id,total), step(id), complete(id), fail(id), snapshot()}}
 */
export function createBootRecord(doc, phaseIds) {
    if (!doc || !doc.documentElement || typeof doc.documentElement.setAttribute !== 'function') {
        throw new TypeError('[boot] createBootRecord(doc, ids): doc must be a Document');
    }
    if (typeof doc.dispatchEvent !== 'function') {
        throw new TypeError('[boot] createBootRecord: the document has no dispatchEvent — the ' +
            BOOT_PHASE_EVENT + ' event is half of the published boot record');
    }
    if (!Array.isArray(phaseIds) || phaseIds.length === 0) {
        throw new TypeError('[boot] createBootRecord: phaseIds must be a non-empty array (lib/shim/engine/boot-phases.js)');
    }
    const state = Object.create(null);
    phaseIds.forEach(function (id) {
        if (typeof id !== 'string' || !id || state[id]) {
            throw new TypeError('[boot] createBootRecord: phase ids must be unique non-empty strings (got ' + JSON.stringify(id) + ')');
        }
        state[id] = { done: 0, total: 0, complete: false };
    });
    let failed = null;

    function phase(id) {
        if (!state[id]) {
            throw new Error('[boot] boot record: "' + id + '" is not a boot phase — ' + phaseIds.join(', ') +
                ' (lib/shim/engine/boot-phases.js).');
        }
        return state[id];
    }
    function current() {
        for (let i = 0; i < phaseIds.length; i++) { if (!state[phaseIds[i]].complete) { return phaseIds[i]; } }
        return phaseIds[phaseIds.length - 1];
    }
    function snapshot() {
        const phases = {};
        phaseIds.forEach(function (id) {
            const p = state[id];
            phases[id] = { done: p.done, total: p.total, complete: p.complete };
        });
        const cur = current();
        return { phase: cur, done: state[cur].done, total: state[cur].total, phases: phases, failed: failed };
    }
    function dispatch(target, snap) {
        const view = target.ownerDocument ? target.ownerDocument.defaultView : (target.defaultView || null);
        const Ctor = (view && view.CustomEvent) || CustomEvent;
        target.dispatchEvent(new Ctor(BOOT_PHASE_EVENT, { detail: snap }));
    }
    function publish() {
        const snap = snapshot();
        const el = doc.documentElement;
        el.setAttribute('data-egpt-boot-phase', snap.phase);
        el.setAttribute('data-egpt-boot-done', String(snap.done));
        el.setAttribute('data-egpt-boot-total', String(snap.total));
        el.setAttribute('data-egpt-boot-progress', JSON.stringify(snap.phases));
        if (failed) { el.setAttribute('data-egpt-boot-failed', failed); }
        dispatch(doc, snap);
        let frame = null;
        try { frame = doc.defaultView ? doc.defaultView.frameElement : null; } catch (e) { frame = null; }
        if (frame && typeof frame.dispatchEvent === 'function') { dispatch(frame, snapshot()); }
        return snap;
    }
    return {
        begin: function (id, total) {
            const p = phase(id);
            if (typeof total !== 'number' || total < 0 || Math.floor(total) !== total) {
                throw new TypeError('[boot] boot record: begin("' + id + '", total) needs a non-negative integer');
            }
            p.total = total;
            return publish();
        },
        step: function (id) {
            const p = phase(id);
            if (p.done >= p.total) { throw new Error('[boot] boot record: "' + id + '" stepped past its total ' + p.total); }
            p.done++;
            return publish();
        },
        complete: function (id) {
            const p = phase(id);
            p.done = p.total;
            p.complete = true;
            return publish();
        },
        fail: function (id) {
            phase(id);
            if (!failed) { failed = id; }
            return publish();
        },
        snapshot: snapshot
    };
}

function _detail(err) { return String(err && err.message ? err.message : err); }

function _engineText(engineName, err) {
    return 'ENGINE BOOT FAILED — engine=' + engineName + '\n\nWASM module failed to load: ' + _detail(err) + '\n\n' +
        'This pane is intentionally blank. The requested engine is unavailable and the\n' +
        'page did NOT fall back to a different engine (that would make a JS↔WASM\n' +
        'comparison meaningless).\n\n' +
        'To build the canonical Rust/WASM engine:\n' +
        '  cd frqtl && wasm-pack build crates/egpt_wasm --target web --out-dir ../fat/pkg-web';
}

function _rendererText(renderer, err) {
    return 'RENDERER BOOT FAILED — renderer=' + renderer + '\n\n' + _detail(err) + '\n\n' +
        'This pane is intentionally blank. The requested renderer is unavailable\n' +
        'and the page did NOT fall back to a different renderer.\n\n' +
        'Available renderers: ' + Object.keys(RENDERER_PROVIDERS).join(' | ') + ' | custom';
}

function _stackText(phase, err) {
    return 'STACK BOOT FAILED — ' + phase + ' phase\n\n[boot] ' + _detail(err) + '\n\n' +
        (phase === 'modules'
            ? 'A game-layer module did not load (the browser console names the URL that failed). Remedy: make the host serve it — the ' +
              'file is missing from this tree, or a built host\'s build did not copy it.'
            : 'The boot sequence stopped here and nothing after it ran.');
}

// ── chrome ──────────────────────────────────────────────────────────────────────

const CHROME = HOST_TOKENS.filter(function (t) { return t.key === 'chrome'; })[0];

/** Apply the `?chrome=` host token: `data-chrome` on <html>, or a visible refusal of an unknown value. */
function applyChrome() {
    const value = new URLSearchParams(location.search).get(CHROME.key);
    if (!value) { return; }
    if (CHROME.acceptedValues.indexOf(value) !== -1) {
        document.documentElement.setAttribute('data-chrome', value);
        return;
    }
    const msg = '[boot] Unknown ?' + CHROME.key + '= value: "' + value + '". Accepted: ' +
        CHROME.acceptedValues.map(function (v) { return '"' + v + '"'; }).join(', ') + '. Remove the param to use full chrome.';
    if (console && console.error) { console.error(msg); }
    const b = document.createElement('div');
    b.id = 'egpt-chrome-error';
    b.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a0000;color:#ff6b6b;' +
        'font:13px/1.55 ui-monospace,monospace;padding:22px;white-space:pre-wrap;overflow:auto;border:2px solid #b6161c;';
    b.textContent = msg;
    (document.body || document.documentElement).appendChild(b);
}

// ── renderer selection ──────────────────────────────────────────────────────────

/**
 * Select the display renderer: build its provider and register it in the display slot under its name.
 *
 * @param {string} name — 'p5' | 'three' | 'custom'
 * @param {{ provider?: object, meshLoaders?: boolean }} [opts]
 * @returns {Promise<object>} the registered provider
 */
export function selectRenderer(name, opts) {
    return Promise.resolve().then(function () {
        if (name === 'custom') {
            const provider = opts && opts.provider;
            const report = validateRendererProvider(provider);
            if (!report.ok) {
                throw new Error('renderer=custom: the BYO provider is missing required method(s): ' + report.missing.join(', ') +
                    ' (lib/frqtl/compat/renderer/renderer-provider-contract.js RENDERER_PROVIDER_REQUIRED).');
            }
            return provider;
        }
        const entry = RENDERER_PROVIDERS[name];
        if (!entry) {
            throw new Error('unknown renderer "' + name + '" — the registry offers ' +
                Object.keys(RENDERER_PROVIDERS).join(' | ') + ' (or custom with a BYO provider).');
        }
        if (name === 'three') {
            return loadThree({ meshLoaders: !!(opts && opts.meshLoaders) }).then(function () { return entry.makeProvider(); });
        }
        return entry.makeProvider();
    }).then(function (provider) {
        setDisplay(provider, name);
        return provider;
    });
}

/**
 * THE one writer of the display fact: the provider goes into the display slot under its name, and
 * <html data-frqtl-renderer> is written FROM the slot — a same-origin host reads the attribute, a
 * module reads the slot, and the two cannot disagree.
 *
 * @param {object} provider
 * @param {string} name
 */
export function setDisplay(provider, name) {
    FrqtlDisplay.set(provider, name);
    document.documentElement.setAttribute(RENDERER_ATTR, FrqtlDisplay.name());
}

// ── the realm ───────────────────────────────────────────────────────────────────

/** The <html> attribute naming the renderer the display slot holds — the boot record's renderer fact, readable
 *  by a same-origin host (STUDIO, a spec) without a page global. */
export const RENDERER_ATTR = 'data-frqtl-renderer';

let _base = null;       // the latched engine + game-layer boot of this document
let _selection = null;  // { name, promise, failed } — the current display renderer selection
let _record = null;

/** @returns the page's boot record (created by the first boot). */
export function bootRecord() { return _record; }

/** @returns {string|null} the renderer the display slot holds (FrqtlDisplay.name()). */
export function bootedRenderer() { return FrqtlDisplay.name(); }

function _select(renderer, opts) {
    const sel = { name: renderer, failed: false, promise: null };
    sel.promise = selectRenderer(renderer, opts).then(function (provider) {
        _record.complete('renderer');
        return provider;
    }, function (err) {
        sel.failed = true;
        _record.fail('renderer');
        paintBootFailure('renderer', _rendererText(renderer, err));
        err.frqtlBootPainted = true;
        err.axis = 'renderer';
        throw err;
    });
    sel.promise.catch(function () {});
    return sel;
}

/**
 * @param {object} [opts] — see the file header
 * @returns {Promise<{engine: object, display: object, renderer: string}>}
 *
 * The engine and the game layer boot ONCE per document. The renderer is (re)selected when a later
 * call asks for a different one, or when the previous selection failed — a page session (the notebook,
 * with many canvas cells) is never pinned to a renderer one cell could not load.
 */
export function bootRealm(opts) {
    opts = opts || {};
    if (opts.pageScripts !== undefined) {
        throw new Error('[boot] bootRealm: `pageScripts` is retired — there are no classic scripts to load; a page ' +
            'imports its setup factory and helpers in its own module script (import { setupX } from ' +
            '"../../objects/setup/setupX.js"). (FAIL-LOUD.)');
    }
    setBootOverlayHost(opts.overlayHost || null);
    const params = new URLSearchParams(location.search);
    // A boot that names no renderer (the runtime's ensureEngine, a host that only needs the engine)
    // keeps the session's selection; only a document's first boot defaults to p5.
    const renderer = params.get(KEYS.RENDERER) || opts.renderer || (_selection ? _selection.name : 'p5');

    if (!_base) {
        applyChrome();
        const engineName = params.get(KEYS.ENGINE) || opts.engine || 'wasm';
        _record = createBootRecord(document, BOOT_PHASE_IDS);
        BOOT_PHASE_IDS.forEach(function (id) { _record.begin(id, 1); });
        installPageDoor();

        // The game-layer modules: the parts barrel (every published kind registers on import). A
        // module the host did not serve REJECTS here, on the `modules` axis, and paints.
        const modulesLive = import('../../parts/index.js').then(function () {
            _record.complete('modules');
        }, function (err) {
            _record.fail('modules');
            paintBootFailure('engine', _stackText('modules', err));
            err.frqtlBootPainted = true;
            err.axis = 'modules';
            throw err;
        });
        const wasmLive = bootEngine(browserWasmLoader, { engine: engineName });
        // engine-ready completes once the engine is live AND the modules imported (modules first).
        const engineLive = Promise.all([wasmLive, modulesLive]).then(function (all) {
            _record.complete('engine-ready');
            return all[0];
        }, function (err) {
            if (!err.frqtlBootPainted) {
                _record.fail('engine-ready');
                paintBootFailure('engine', _engineText(engineName, err));
                err.frqtlBootPainted = true;
                err.axis = 'engine';
            }
            throw err;
        });
        _base = engineLive;
        _base.catch(function () {});   // handled: every failure above painted its own overlay
    }
    if (!_selection || _selection.failed || _selection.name !== renderer) {
        _selection = _select(renderer, opts);
    }
    const sel = _selection;
    const realm = Promise.all([_base, sel.promise]).then(function (all) {
        return { engine: all[0], display: FrqtlDisplay.name(), renderer: sel.name };
    });
    realm.catch(function () {});
    return realm;
}

/**
 * Apply a renderState bag (raw or normalized) to a booted runner — the shim owner's procedure
 * (lib/shim/render-state/apply.js `apply`) with the one thing only the page has: its renderer
 * registry, as `env.knownNames`. The page door (FrqtlPage.applyRenderState) and the sdk boot door
 * both come through here.
 *
 * @returns {{applied:Object, retained:Array, camera:string|null, preset:string|null, backdrop:boolean|null}}
 */
export function applyRenderState(runner, bag) {
    return applyRenderStateBag(runner, bag, { knownNames: knownRenderCapabilityNames(RENDERER_PROVIDERS) });
}

/**
 * The experiment-page door: boot the realm, then run the page's sketch.
 *
 * @param {object} [opts] — bootRealm's, plus `setup` (the page's sketch setup function), `p5: 'always'`
 *   and `sketch: 'deferred'`
 * @returns {{ realm: Promise, completeSketch: function(), failSketch: function(*) }}
 */
export function bootPage(opts) {
    opts = opts || {};
    if (opts.sketch !== undefined && opts.sketch !== 'deferred') {
        throw new Error('[boot] bootPage: unknown sketch mode ' + JSON.stringify(opts.sketch) +
            " — the one mode is { sketch: 'deferred' }. (FAIL-LOUD.)");
    }
    if (opts.p5 !== undefined && opts.p5 !== 'always') {
        throw new Error('[boot] bootPage: unknown p5 mode ' + JSON.stringify(opts.p5) + " — the one mode is { p5: 'always' }. (FAIL-LOUD.)");
    }
    if (opts.setup !== undefined && typeof opts.setup !== 'function') {
        throw new TypeError('[boot] bootPage: `setup` is the page\'s setup function (got ' + typeof opts.setup + '). (FAIL-LOUD.)');
    }
    const deferred = opts.sketch === 'deferred';
    const realmOpts = Object.assign({}, opts);
    delete realmOpts.setup; delete realmOpts.p5; delete realmOpts.sketch;
    const realm = bootRealm(realmOpts);
    const ready = realm.then(function (r) {
        return runSketch({
            setup: opts.setup,
            p5: opts.p5 === 'always' || r.renderer === 'p5',
            onSetup: function () { if (!deferred) { _record.complete('sketch'); } }
        }).catch(function (err) {
            _record.fail('sketch');
            paintBootFailure(r.renderer === 'p5' || opts.p5 === 'always' ? 'renderer' : 'engine', _stackText('sketch', err));
            err.frqtlBootPainted = true;
            err.axis = 'renderer';
            throw err;
        });
    });
    ready.catch(function () { /* painted by its own axis */ });
    function requireDeferred(name) {
        if (!deferred) {
            throw new Error('[boot] ' + name + ': this page did not defer its sketch — only a page that boots with ' +
                "bootPage({ sketch: 'deferred' }) completes the sketch phase itself. (FAIL-LOUD.)");
        }
    }
    return {
        realm: realm,
        ready: ready,
        completeSketch: function () { requireDeferred('completeSketch'); _record.complete('sketch'); },
        failSketch: function (err) {
            requireDeferred('failSketch');
            if (typeof console !== 'undefined' && console.error) { console.error('[boot] the page\'s sketch failed:', err); }
            _record.fail('sketch');
        }
    };
}
