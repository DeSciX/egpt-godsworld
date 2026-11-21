/* Copyright 2023-2026 by Essam Abadir */

/**
 * renderer-provider-contract.js — the CODE OWNER of the `RendererProvider` method lists.
 *
 * `RendererProvider` is duck-typed: a BYO renderer is a plain object from a
 * `makeProvider()` factory, registered through the boot-fixed display slot. Nothing is
 * imported to implement it — which is exactly why the METHOD LISTS need one owner. Before
 * this module they existed only as prose in the renderer contract (§1)
 * and as scattered `typeof provider.X === 'function'` checks in the hosts; a BYO author
 * checking their own object had to hand-copy the list, which is the schema-mirror
 * anti-pattern with the doc as the mirror. THIS FILE is now the owner; the doc cites it.
 *
 * The two lists are transcribed from RENDERER_CONTRACT.md §1 / §1a. A method's SEMANTICS
 * stay in that document — this module owns only the NAMES and the required/optional split,
 * because that is the only part a program can check — plus the checkable rules the built-in
 * providers share: `requireProviderSize` (init/setSize take the runner's physics rect, REQUIRED),
 * `requireMountHost` (init's `parentEl` names the element the canvas mounts in, REQUIRED),
 * `requireSceneSurface` (init RETURNS its HTMLCanvasElement), `SCENE_SURFACE_ATTR` (the marker
 * the runner stamps on that canvas) and `filterTime` (the value of the standard `uTime` filter
 * uniform, derived from the tick being rendered).
 *
 * ── THE REQUIRED/OPTIONAL SPLIT IS LOAD-BEARING ─────────────────────────────
 *
 * An absent OPTIONAL capability is NEVER an error (RENDERER_CONTRACT §1a, "absent ⇒
 * hidden, never an error"): a provider that omits `getCameraControl` simply gets no camera
 * strip. Hosts capability-check per method — they never renderer-sniff. So
 * `validateRendererProvider` reports optionals as CAPABILITIES, never as failures, and its
 * `ok` is decided by the REQUIRED nine alone.
 *
 * ── IT IS A VALIDATOR, NOT A GATE ───────────────────────────────────────────
 *
 * `validateRendererProvider` NEVER THROWS — not even on a non-object. It returns a report;
 * the CALLER decides whether a missing method is fatal in its context (a host that boots a
 * provider fails loud; an authoring tool that lints one shows a list). A validator that
 * threw would force every caller to wrap it in try/catch to ask a question.
 *
 * @example
 *   import { validateRendererProvider } from '@descix/frqtl-web';   // or '@descix/frqtl-node'
 *   const report = validateRendererProvider(myProvider);
 *   if (!report.ok) throw new Error('BYO renderer missing: ' + report.missing.join(', '));
 *   // report.capabilities → e.g. ['renderCapabilities', 'captureStill']
 */


    /**
     * The nine REQUIRED methods. Every renderer — built-in or BYO — must implement
     * exactly these; nothing above the shim calls anything else on a renderer.
     * @type {string[]}
     */
    var RENDERER_PROVIDER_REQUIRED = [
        'init',          // create canvas/context (+ scene/buffers); RETURNS the HTMLCanvasElement
        'setSize',       // resize the drawing surface
        'start',         // may be a NO-OP (the RAF loop is FrqtlApp's)
        'stop',
        'destroy',       // tear down; release GL resources
        'renderTick',    // draw ONE frame from pure data
        'filter',        // queue/apply a post-process pass
        'removeFilter',  // remove a queued pass by name
        'raw'            // the underlying backend object (escape hatch)
    ];

    /**
     * The five OPTIONAL capabilities. Absent ⇒ the corresponding host UI is hidden.
     * NEVER an error.
     * @type {string[]}
     */
    var RENDERER_PROVIDER_OPTIONAL = [
        'renderCapabilities',  // FieldDescriptor[] — this provider's own render knobs
        'getCameraControl',    // the orbit/pose sugar handle
        'screenToWorld',       // unproject a canvas point to a world point
        'captureStill',        // the `composite` stage tap
        'projection'           // the scene's camera intrinsics (rides the SceneRecord)
    ];

    /**
     * Check a candidate against the frozen `RendererProvider` contract.
     *
     * @param {object} provider - the object a `makeProvider()` factory returned.
     * @returns {{ok: boolean, missing: string[], capabilities: string[]}}
     *   `ok`           — true iff EVERY required name is a function.
     *   `missing`      — the required names that are not functions (in contract order).
     *   `capabilities` — the optional names that ARE functions (in contract order).
     *   A non-object argument reports every required name missing and no capabilities —
     *   it does not throw.
     */
    function validateRendererProvider(provider) {
        var isObject = (provider !== null && (typeof provider === 'object' || typeof provider === 'function'));
        if (!isObject) {
            return { ok: false, missing: RENDERER_PROVIDER_REQUIRED.slice(), capabilities: [] };
        }
        var missing = RENDERER_PROVIDER_REQUIRED.filter(function (name) {
            return typeof provider[name] !== 'function';
        });
        var capabilities = RENDERER_PROVIDER_OPTIONAL.filter(function (name) {
            return typeof provider[name] === 'function';
        });
        return { ok: missing.length === 0, missing: missing, capabilities: capabilities };
    }

    function _isPositiveFinite(n) {
        return typeof n === 'number' && isFinite(n) && n > 0;
    }

    /**
     * The `init({width, height})` / `setSize(width, height)` size rule, owned here so both
     * built-in providers throw the SAME sentence. `width`/`height` are the runner's physics
     * rect (`runner.canvas_rect`), which `FrqtlApp.createCanvas` hands to
     * `provider.init({width, height})`; the scene writes that rect ONCE through
     * `exp.createCanvas(w, h, cfg)` / `exp.createScene(w, h, d, cfg)`. A provider holds no size of
     * its own. The display size is the host element's CSS box, never a provider argument.
     *
     * Unlike `validateRendererProvider`, this IS a gate: it THROWS on a missing or non-positive
     * dimension (a defaulted size would draw a confident picture of the wrong world).
     *
     * @param {string} who    - the calling site, e.g. `'p5Provider.init'`.
     * @param {*}      width
     * @param {*}      height
     * @throws {Error} unless both are positive finite numbers.
     */
    function requireProviderSize(who, width, height) {
        if (_isPositiveFinite(width) && _isPositiveFinite(height)) { return; }
        throw new Error(who + ': width and height must be positive finite numbers (got width=' +
            String(width) + ', height=' + String(height) + '). They are the runner\'s physics rect ' +
            '(runner.canvas_rect), handed over by FrqtlApp.createCanvas as provider.init({width, height}) ' +
            'and written once by the scene\'s exp.createCanvas(w, h, cfg) / exp.createScene(w, h, d, cfg). ' +
            'A provider has no default size; the display size is the host element\'s CSS box, never a ' +
            'provider argument.');
    }

    /**
     * The `init({parentEl})` mount rule, owned here so both DOM providers throw the SAME sentence.
     * `parentEl` is the runner's `canvasParentId` (`new FrqtlApp({ canvasParentId })` /
     * `new RecipeContext({ canvasParentId })`), handed over by `FrqtlApp.createCanvas` as
     * `provider.init({ parentEl })`. It must be a non-empty string naming an element in `document`;
     * the provider appends its canvas THERE. There is no default mount: a canvas appended to
     * `document.body` is a canvas the layout never placed.
     *
     * Only a provider that MOUNTS calls this — a DOM-free runner (node, the headless renderer)
     * legitimately has no `canvasParentId`, so the runner never demands one.
     *
     * @param {string} who      - the calling site, e.g. `'threeProvider.init'`.
     * @param {*}      parentEl - the element id from `init(opts).parentEl`.
     * @returns {HTMLElement} the element named by `parentEl`.
     * @throws {Error} unless `parentEl` names an element in the page.
     */
    function requireMountHost(who, parentEl) {
        var named = typeof parentEl === 'string' && parentEl.length > 0;
        var hasDoc = typeof document !== 'undefined' && document !== null &&
            typeof document.getElementById === 'function';
        var host = (named && hasDoc) ? document.getElementById(parentEl) : null;
        if (host) { return host; }
        var got = !named ? (typeof parentEl === 'string' ? '""' : String(parentEl))
            : !hasDoc ? JSON.stringify(parentEl) + ', and there is no document'
            : JSON.stringify(parentEl) + ', which names no element in the page';
        throw new Error(who + ': canvasParentId is required and must name an element in the page (got ' +
            got + '). The runner hands it as init({ parentEl }) from new FrqtlApp({ canvasParentId }) / ' +
            'new RecipeContext({ canvasParentId }). There is no default mount: a canvas appended to ' +
            'document.body is a canvas the layout never placed. (FAIL-LOUD.)');
    }

    /**
     * The attribute that marks a document's scene drawing surface — the ONE DOM-checkable fact
     * about a provider's surface. `FrqtlApp.createCanvas` (the one mount site) stamps it on the
     * canvas `provider.init` returned; anything that must find the scene's pixels (a paint
     * oracle, the eyes) reads `[SCENE_SURFACE_ATTR]` instead of guessing among a document's
     * canvases. Re-exported to consumers above the engine by `lib/shim/render/render-stages.js`.
     * @type {string}
     */
    var SCENE_SURFACE_ATTR = 'data-frqtl-scene-surface';

    /**
     * The `init` return rule: `provider.init(opts)` RETURNS its drawing surface as an
     * `HTMLCanvasElement` (RENDERER_CONTRACT §1). Duck-typed on the element's own shape (tag
     * CANVAS + `setAttribute` + `getContext`), never `instanceof`, so a canvas made in another
     * realm (an iframe, a notebook realm) is still a canvas.
     *
     * @param {string} who - the calling site, e.g. `'FrqtlApp.createCanvas'`.
     * @param {*}      el  - what `provider.init` returned.
     * @returns {HTMLCanvasElement} `el`, unchanged.
     * @throws {Error} unless `el` is a canvas element.
     */
    function requireSceneSurface(who, el) {
        var isCanvas = el !== null && typeof el === 'object' &&
            typeof el.tagName === 'string' && el.tagName.toUpperCase() === 'CANVAS' &&
            typeof el.setAttribute === 'function' && typeof el.getContext === 'function';
        if (isCanvas) { return el; }
        var got = (el === null || el === undefined) ? String(el)
            : (typeof el === 'object' && typeof el.tagName === 'string') ? '<' + el.tagName.toLowerCase() + '>'
            : (typeof el === 'object' && el.elt !== undefined) ? 'a p5.Element (return its .elt)'
            : typeof el;
        throw new Error(who + ': provider.init(opts) must RETURN its drawing surface as an HTMLCanvasElement ' +
            '(got ' + got + '). The runner stamps ' + SCENE_SURFACE_ATTR + ' on it so the scene surface ' +
            'is declared, never guessed among the document\'s canvases (RENDERER_CONTRACT §1, init row; ' +
            'owner: lib/frqtl/compat/renderer/renderer-provider-contract.js).');
    }

    /**
     * Ticks per second of filter time. The GYM runs a scene at a 60 TPS cap by default
     * (CompareView's TPS field), so there a filter animated by `uTime` keeps the pace it had
     * when it was fed wall-clock seconds; at any other rate it runs at that rate's pace.
     * @type {number}
     */
    var FILTER_TICKS_PER_SECOND = 60;

    /**
     * The `uTime` filter uniform: seconds of SIMULATION time at the tick being rendered,
     * `universeData.tick / FILTER_TICKS_PER_SECOND`. Every provider feeds every filter pass this
     * value, so a filter's animation is a function of the tick: a still of one scene at one
     * tick is reproducible, both providers agree, and paused water stops moving. Not wrapped:
     * a wrap would be a visible jump in the animation.
     *
     * @param {object} tickData - the TickData the provider is drawing (carries `universeData.tick`).
     * @returns {number} seconds of simulation time.
     * @throws {Error} when `tickData` carries no finite non-negative tick (nothing to time the
     *   filter by: a wall-clock fallback would make the still unreproducible again).
     */
    function filterTime(tickData) {
        var tick = tickData && tickData.universeData && tickData.universeData.tick;
        if (typeof tick === 'number' && isFinite(tick) && tick >= 0) {
            return tick / FILTER_TICKS_PER_SECOND;
        }
        throw new Error('filterTime: the TickData being rendered must carry universeData.tick (got ' +
            String(tick) + '). uTime is simulation time at the rendered tick, never the wall clock ' +
            '(owner: lib/frqtl/compat/renderer/renderer-provider-contract.js). (FAIL-LOUD.)');
    }

export {
    RENDERER_PROVIDER_REQUIRED,
    RENDERER_PROVIDER_OPTIONAL,
    SCENE_SURFACE_ATTR,
    validateRendererProvider,
    requireProviderSize,
    requireMountHost,
    requireSceneSurface,
    FILTER_TICKS_PER_SECOND,
    filterTime
};
