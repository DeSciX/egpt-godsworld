/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/experiment-frame — THE fail-loud guard for a host that embeds a
 * canonical experiment page in an iframe.
 *
 * ── Why this module exists (the false-200 trap, observed 2026-07-28) ─────────
 * A dev/prod vite host answers an UNKNOWN path with its SPA fallback: HTTP 200,
 * `text/html`, the host app's OWN `index.html`. So when an experiment id stops
 * existing (a retirement), `GET /frqtl/experiments/<gone>/index.html` does not
 * 404 — it returns the SITE. The host's hero iframe then embeds the host inside
 * itself, recursively: the nav bar renders three times, the stage is blank, and
 * EVERY automated signal is clean (0 HTTP 4xx/5xx, 0 `requestfailed`, 0
 * `pageerror`). A missing experiment degraded SILENTLY into a self-embed.
 *
 * This module makes that impossible to miss. It does NOT trust the HTTP status
 * (which lies) — it inspects the DOCUMENT that actually loaded and asserts it is
 * a canonical experiment page, by two independent signals:
 *
 *   1. POSITIVE PROOF — the stack-boot boot markers. Every canonical experiment
 *      page loads `_shared/stack-boot.js`, whose IIFE synchronously installs
 *      `EXPERIMENT_PAGE_MARKERS` on its own window. No other document in this
 *      repo installs them. Their presence is what "an experiment page booted"
 *      MEANS; their absence at document-complete is a hard failure.
 *   2. POSITIVE IDENTIFICATION of the impostor — the host SPA shell root
 *      (`HOST_SHELL_ROOT_SELECTOR`, the `<div id="root">` in
 *      `apps/ide/index.html`). A document that
 *      has the shell root and none of the markers IS the SPA fallback, and the
 *      guard says so by name rather than reporting a generic timeout.
 *
 * A 200 cannot fool either signal: the check reads the loaded document, and the
 * SPA shell provably lacks every marker.
 *
 * ── Layer 1: API contract ───────────────────────────────────────────────────
 *   classifyFrameProbe(probe)  — PURE verdict function (no DOM). Unit-testable.
 *   probeExperimentFrame(el)   — DOM adapter: iframe element → probe bag.
 *   watchExperimentFrame(el,o) — poll + paint a visible overlay on failure.
 *
 * ── Layer 2: physics behavior ───────────────────────────────────────────────
 * None. This is host-side plumbing: it observes whether a document booted and
 * never touches the engine, a universe, or a tick.
 */

'use strict';

/**
 * The window globals `lib/frqtl/experiments/_shared/stack-boot.js` installs
 * SYNCHRONOUSLY inside its own IIFE (see that file: `_egptResolveFrqtl` and
 * `_egptInjectScript` at the path-authority block, `_egptWhenEngineReady` at the
 * ready-queue block). Every canonical experiment page loads stack-boot as a
 * classic script, so all three exist by the time the document reaches
 * `readyState === 'complete'` — regardless of whether the engine has finished
 * fetching WASM.
 *
 * This is the ONE list; a consumer asserts against it, never against a
 * hand-picked global of its own.
 *
 * @type {ReadonlyArray<string>}
 */
export var EXPERIMENT_PAGE_MARKERS = Object.freeze([
    '_egptResolveFrqtl',
    '_egptInjectScript',
    '_egptWhenEngineReady'
]);

/**
 * The mount point the host SPA shell renders React into (`apps/ide/index.html`).
 * Its presence inside an experiment iframe is the fingerprint of the vite SPA
 * fallback having answered the request with the host's own page.
 * @type {string}
 */
export var HOST_SHELL_ROOT_SELECTOR = '#root';

/**
 * The verdict vocabulary. `ok` and `pending` are non-failures; everything else
 * is a FAIL-LOUD outcome the host must surface visibly.
 * @type {Readonly<Record<string,string>>}
 */
export var FRAME_VERDICTS = Object.freeze({
    OK:             'ok',
    PENDING:        'pending',
    CROSS_ORIGIN:   'cross-origin',
    SPA_SHELL:      'spa-shell',
    NOT_EXPERIMENT: 'not-an-experiment-page'
});

/** Default grace period before a not-yet-complete document is called failed. */
export var DEFAULT_FRAME_TIMEOUT_MS = 10000;

/**
 * classifyFrameProbe(probe) — the PURE verdict function.
 *
 * @param {{
 *   src?: string,            // the URL the host ASKED for
 *   href?: string,           // the URL the frame's document actually has
 *   sameOrigin?: boolean,    // false when reading contentWindow threw
 *   readyState?: string,     // the frame document's readyState
 *   markers?: string[],      // which EXPERIMENT_PAGE_MARKERS were found
 *   hasHostShellRoot?: boolean,
 *   elapsedMs?: number,
 *   timeoutMs?: number
 * }} probe
 * @returns {{verdict:string, ok:boolean, done:boolean, message:string}}
 *   `done` is false only for `pending` (keep polling).
 */
export function classifyFrameProbe(probe) {
    var p        = probe || {};
    var src      = p.src || '(unknown src)';
    var href     = typeof p.href === 'string' ? p.href : '';
    var found    = Array.isArray(p.markers) ? p.markers : [];
    var timeout  = typeof p.timeoutMs === 'number' ? p.timeoutMs : DEFAULT_FRAME_TIMEOUT_MS;
    var elapsed  = typeof p.elapsedMs === 'number' ? p.elapsedMs : 0;

    // A cross-origin frame cannot be inspected at all — say so rather than
    // silently trusting it. The /frqtl mount is same-origin BY DESIGN (that is
    // the precondition every host-side runner grab already relies on), so this
    // verdict means the host built the wrong URL.
    if (p.sameOrigin === false) {
        return _verdict(FRAME_VERDICTS.CROSS_ORIGIN, false, true,
            'the experiment frame is CROSS-ORIGIN, so the host cannot verify what loaded.\n' +
            'requested: ' + src + '\n' +
            'Experiment pages must be served from the host\'s own origin (the /frqtl mount).');
    }

    // A frame that has not navigated to the requested document yet (about:blank
    // between src assignments) is PENDING, never a failure.
    if (href === '' || href === 'about:blank') {
        return _pendingOrTimeout(elapsed, timeout, src,
            'the frame is still on about:blank — it never navigated to the requested URL.');
    }

    // POSITIVE PROOF: every boot marker present ⇒ a canonical experiment page.
    var missing = EXPERIMENT_PAGE_MARKERS.filter(function (m) { return found.indexOf(m) === -1; });
    if (missing.length === 0) {
        return _verdict(FRAME_VERDICTS.OK, true, true, 'experiment page booted: ' + src);
    }

    // POSITIVE IDENTIFICATION of the impostor. The SPA shell verdict does NOT
    // wait for the timeout: a document carrying the host's own React root and
    // none of the boot markers is definitively not an experiment page, whatever
    // status code delivered it.
    if (p.hasHostShellRoot === true) {
        return _verdict(FRAME_VERDICTS.SPA_SHELL, false, true,
            'THE FALSE-200 TRAP: the request returned HTTP 200 text/html, but the document is the\n' +
            'HOST\'S OWN SPA SHELL (it has ' + HOST_SHELL_ROOT_SELECTOR + ' and none of the experiment-page\n' +
            'boot markers [' + EXPERIMENT_PAGE_MARKERS.join(', ') + ']).\n' +
            'requested: ' + src + '\n' +
            'loaded:    ' + href + '\n' +
            'The dev server answers an UNKNOWN path with its SPA fallback, so a MISSING experiment id\n' +
            'looks like a successful load and this host ends up embedding ITSELF, recursively.\n' +
            'Fix the id at its single declaration site — do not add a fallback id here.');
    }

    // Document finished loading and it is neither an experiment page nor the
    // recognised shell — still a hard failure, reported honestly.
    if (p.readyState === 'complete') {
        return _verdict(FRAME_VERDICTS.NOT_EXPERIMENT, false, true,
            'the frame finished loading but it is NOT a canonical experiment page.\n' +
            'requested: ' + src + '\n' +
            'loaded:    ' + href + '\n' +
            'missing boot markers: [' + missing.join(', ') + ']\n' +
            'A canonical experiment page loads _shared/stack-boot.js, which installs all of\n' +
            '[' + EXPERIMENT_PAGE_MARKERS.join(', ') + '] synchronously.');
    }

    return _pendingOrTimeout(elapsed, timeout, src,
        'missing boot markers: [' + missing.join(', ') + '] (document readyState=' +
        (p.readyState || 'unknown') + ').');
}

function _verdict(verdict, ok, done, message) {
    return { verdict: verdict, ok: ok, done: done, message: '[experiment-frame] ' + message };
}

function _pendingOrTimeout(elapsed, timeout, src, detail) {
    if (elapsed >= timeout) {
        return _verdict(FRAME_VERDICTS.NOT_EXPERIMENT, false, true,
            'the frame never became a canonical experiment page within ' + timeout + 'ms.\n' +
            'requested: ' + src + '\n' + detail);
    }
    return _verdict(FRAME_VERDICTS.PENDING, false, false, 'waiting for ' + src + ' — ' + detail);
}

/**
 * probeExperimentFrame(iframeEl, opts) — the DOM adapter. Reads the frame's own
 * document (same-origin) and returns the probe bag `classifyFrameProbe` consumes.
 *
 * @param {HTMLIFrameElement} iframeEl
 * @param {{elapsedMs?:number, timeoutMs?:number}} [opts]
 * @returns {object} the probe bag.
 */
export function probeExperimentFrame(iframeEl, opts) {
    var o = opts || {};
    var probe = {
        src:      iframeEl && iframeEl.src ? iframeEl.src : '',
        href:     '',
        sameOrigin: true,
        readyState: undefined,
        markers:  [],
        hasHostShellRoot: false,
        elapsedMs: o.elapsedMs,
        timeoutMs: o.timeoutMs
    };
    var cw = null;
    try {
        cw = iframeEl && iframeEl.contentWindow;
        if (!cw) { return probe; }              // not attached yet → PENDING
        probe.href = (cw.location && cw.location.href) || '';
        var doc = cw.document;
        probe.readyState = doc ? doc.readyState : undefined;
        probe.markers = EXPERIMENT_PAGE_MARKERS.filter(function (m) {
            return typeof cw[m] !== 'undefined';
        });
        probe.hasHostShellRoot = !!(doc && doc.querySelector &&
            doc.querySelector(HOST_SHELL_ROOT_SELECTOR));
    } catch (e) {
        // A same-origin read that throws means the document is cross-origin.
        probe.sameOrigin = false;
    }
    return probe;
}

/**
 * paintFrameGuardOverlay(hostEl, message) — the VISIBLE failure. Mirrors the
 * empty page's own `_egptPaintWalkthroughError` styling so a guard failure and a
 * recipe failure read as one family.
 *
 * @param {Element} hostEl — the element to overlay (the iframe's wrapper).
 * @param {string} message
 * @returns {Element} the overlay node.
 */
export function paintFrameGuardOverlay(hostEl, message) {
    var host = hostEl || (typeof document !== 'undefined' ? document.body : null);
    if (!host) { return null; }
    var existing = host.querySelector && host.querySelector('[data-role="experiment-frame-error"]');
    if (existing) { existing.parentNode.removeChild(existing); }
    var box = host.ownerDocument.createElement('div');
    box.setAttribute('data-role', 'experiment-frame-error');
    box.style.cssText =
        'position:absolute;inset:0;z-index:9999;padding:16px;overflow:auto;' +
        'white-space:pre-wrap;background:#1a0000;color:#ff6b6b;border:2px solid #b6161c;' +
        'font:12px/1.55 ui-monospace,Menlo,Consolas,monospace;';
    box.textContent = message;
    if (host.style && (!host.style.position || host.style.position === 'static')) {
        host.style.position = 'relative';
    }
    host.appendChild(box);
    return box;
}

/**
 * watchExperimentFrame(iframeEl, opts) — poll the frame until it is proven to be
 * a canonical experiment page, or FAIL LOUD (console.error + a visible overlay +
 * `onError`).
 *
 * @param {HTMLIFrameElement} iframeEl
 * @param {{
 *   overlayHost?: Element,      // defaults to iframeEl.parentNode
 *   timeoutMs?: number,
 *   pollMs?: number,
 *   onOk?: function(Window):void,
 *   onError?: function({verdict:string,message:string}):void
 * }} [opts]
 * @returns {function():void} stop() — cancels the watch (call from useEffect cleanup).
 */
export function watchExperimentFrame(iframeEl, opts) {
    var o        = opts || {};
    var timeout  = typeof o.timeoutMs === 'number' ? o.timeoutMs : DEFAULT_FRAME_TIMEOUT_MS;
    var pollMs   = typeof o.pollMs === 'number' ? o.pollMs : 150;
    var started  = Date.now();
    var stopped  = false;
    var timer    = setInterval(tick, pollMs);
    tick();

    function tick() {
        if (stopped) { return; }
        var probe  = probeExperimentFrame(iframeEl, { elapsedMs: Date.now() - started, timeoutMs: timeout });
        var result = classifyFrameProbe(probe);
        if (!result.done) { return; }
        stop();
        if (result.ok) {
            if (typeof o.onOk === 'function') { o.onOk(iframeEl.contentWindow); }
            return;
        }
        if (typeof console !== 'undefined' && console.error) { console.error(result.message); }
        paintFrameGuardOverlay(o.overlayHost || (iframeEl && iframeEl.parentNode), result.message);
        if (typeof o.onError === 'function') { o.onError(result); }
    }

    function stop() {
        if (stopped) { return; }
        stopped = true;
        clearInterval(timer);
    }
    return stop;
}
