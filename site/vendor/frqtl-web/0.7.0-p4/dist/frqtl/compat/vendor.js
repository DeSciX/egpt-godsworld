/* Copyright 2023-2026 by Essam Abadir */

/**
 * compat/vendor.js — THE one reader of the vendor UMD globals and THE one classic-script loader.
 *
 * The module graph imports everything FRQTL authors. Two vendored libraries are still UMD builds that
 * publish a global and are read through it: p5 (global mode — the sketch's `setup()` runs from p5's own
 * load) and three.js r128 (`THREE`, with the GLTF/DRACO loaders that extend it). This file is the only
 * place either global is read or written, and the only place a classic `<script>` is injected — the
 * no-globals gate (sdk/_build/no-globals.mjs) holds it as one table row.
 *
 *   vendorUrl(rel)            → absolute URL of a vendored file (assets/vendor/<rel>, beside this tree)
 *   loadClassicScripts(urls, { onLoaded }) → Promise: inject each URL once, fetched in parallel, executed
 *                               in list order (`onLoaded(url)` per script, in order); a failed load
 *                               REJECTS with `err.src` naming the URL; argument errors REJECT
 *   loadThree({ meshLoaders }) → Promise<THREE>: three.js evaluated with AMD `define`/`require` shadowed
 *                               (a page may carry Monaco's AMD loader), then the mesh loaders when asked
 *   three()                   → the THREE namespace; THROWS before loadThree resolved
 *   meshLoadersBase()         → the vendored three-loaders directory URL (no trailing slash)
 *   runSketch({ setup, p5, onSetup }) → Promise: runs the page's sketch `setup` — installed as p5's
 *                               global-mode `setup` hook and run by p5's own load when `p5` is true,
 *                               else called; `onSetup` fires once setup() has RUN
 *   suppressP5Draw()          p5's `draw` hook becomes a no-op (the runner owns the frame loop)
 *   resumeP5Loop()            p5's `loop()`, when p5 is loaded (its event handling needs a running sketch)
 *   p5FrameRate(fps)          p5's `frameRate(fps)`, when p5 is loaded
 *   P5_GLOBAL_MODE_HOOKS      the page globals p5 global mode reads (`setup`, `draw`) — written ONLY here
 *
 * three loads through the classic path because the vendored r128 is the UMD build only; moving it to
 * three.module.js + the jsm loaders is a change inside this file, owned by the p5 instance-mode / renderer
 * change (unscheduled).
 *
 * Zero physics: vendors draw; nothing here reads or writes a frame.
 */

const VENDOR_DIR = new URL('../assets/vendor/', import.meta.url);

/**
 * The page globals p5's GLOBAL MODE reads: its `setup` hook (called by p5's own load) and its `draw`
 * hook (called every frame). They are p5's contract, not FRQTL surfaces, so the page door's retired-
 * name refusal (experiments/_shared/page-door.js) installs no throwing accessor on them — it subtracts
 * this table from the census. This file is their one writer.
 * Deleter: the change that moves p5 to instance mode (not yet scheduled; not P0c).
 */
export const P5_GLOBAL_MODE_HOOKS = Object.freeze(['setup', 'draw']);

/** @param {string} rel — a path under assets/vendor/ @returns {string} its absolute URL */
export function vendorUrl(rel) {
    return new URL(rel, VENDOR_DIR).href;
}

const _loads = new Map();   // url → Promise<void>, the ONE per-URL record (a failed load leaves it)

function _one(url) {
    if (_loads.has(url)) { return _loads.get(url); }
    const p = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.async = false;   // fetched in parallel, executed in document order
        s.src = url;
        s.onload = function () { resolve(); };
        s.onerror = function () {
            // A failed load is not latched (loadThree's rule): the record and the dead tag go, so the
            // next request for this URL injects a fresh tag and tries again.
            _loads.delete(url);
            if (s.parentNode) { s.parentNode.removeChild(s); }
            const err = new Error('[vendor] classic script failed to load: ' + url);
            err.src = url;
            reject(err);
        };
        (document.head || document.body).appendChild(s);
    });
    _loads.set(url, p);
    return p;
}

/**
 * Inject classic scripts, each at most once per successful load: all tags appended together with
 * async=false, so they fetch in parallel and execute in list order. `onLoaded(url)` fires per script, in
 * order. A failed load rejects naming its URL and is forgotten, so a later call retries it.
 *
 * @param {string[]} urls
 * @param {{ onLoaded?: function(string) }} [opts]
 * @returns {Promise<void>}
 */
export function loadClassicScripts(urls, opts) {
    if (!Array.isArray(urls)) {
        return Promise.reject(new TypeError('[vendor] loadClassicScripts(urls): urls must be an array of URLs (got ' + typeof urls + ')'));
    }
    const onLoaded = opts && opts.onLoaded;
    if (onLoaded !== undefined && typeof onLoaded !== 'function') {
        return Promise.reject(new TypeError('[vendor] loadClassicScripts: opts.onLoaded must be a function when given'));
    }
    const all = urls.map(function (u) {
        return _one(u).then(function () { if (onLoaded) { onLoaded(u); } });
    });
    return Promise.all(all).then(function () {});
}

let _threePromise = null;

/** @returns {object} THE THREE namespace. THROWS until loadThree() resolved. */
export function three() {
    const T = globalThis.THREE;
    if (!T) {
        throw new Error('[vendor] three.js is not loaded — boot the three renderer (bootRealm({ renderer: \'three\' })) ' +
            'before constructing a three provider. (FAIL-LOUD.)');
    }
    return T;
}

/** @returns {string} the vendored three-loaders directory (GLTFLoader.js, DRACOLoader.js, draco/). */
export function meshLoadersBase() {
    return vendorUrl('three-loaders');
}

/**
 * Load three.js (and, when asked, its GLTF/DRACO mesh loaders). Idempotent per realm once it has
 * loaded; a failed load is forgotten, so the next call tries again.
 *
 * @param {{ meshLoaders?: boolean }} [opts]
 * @returns {Promise<object>} THREE
 */
export function loadThree(opts) {
    const wantLoaders = !!(opts && opts.meshLoaders);
    if (!_threePromise) {
        const url = vendorUrl('three.min.js');
        const p = fetch(url).then(function (resp) {
            if (!resp.ok) { throw new Error('[vendor] three.js failed to load: HTTP ' + resp.status + ' ' + url); }
            return resp.text();
        }).then(function (source) {
            // Shadow AMD/CommonJS so the UMD takes its global branch even beside Monaco's AMD loader.
            const evalThree = new Function('define', 'require', 'module', 'exports', source + '\n//# sourceURL=' + url);
            evalThree();
            return three();
        });
        // A failed load is not latched: the next request (a later notebook cell) loads three afresh.
        _threePromise = p;
        p.catch(function () { if (_threePromise === p) { _threePromise = null; } });
    }
    if (!wantLoaders) { return _threePromise; }
    return _threePromise.then(function (T) {
        const base = meshLoadersBase();
        return loadClassicScripts([base + '/GLTFLoader.js', base + '/DRACOLoader.js']).then(function () {
            if (typeof T.GLTFLoader === 'undefined' || typeof T.DRACOLoader === 'undefined') {
                throw new Error('[vendor] the mesh loaders loaded but THREE.GLTFLoader/DRACOLoader are undefined (' + base +
                    ') — run scripts/vendor-three-loaders.mjs to populate the vendored dir. (FAIL-LOUD.)');
            }
            return T;
        });
    });
}

/**
 * Run the page's sketch. The page hands its `setup` in; on the p5 path it becomes p5's global-mode
 * `setup` hook (a page global by p5's own convention, written only here) and p5's load calls it;
 * otherwise it is called here. `onSetup()` fires after `setup()` has RUN (a throw inside it records nothing).
 *
 * @param {{ setup?: function, p5: boolean, onSetup?: function }} opts
 * @returns {Promise<void>} settles once p5 loaded (p5 path) or setup() ran (direct path)
 */
export function runSketch(opts) {
    const useP5 = !!(opts && opts.p5);
    const onSetup = opts && opts.onSetup;
    const pageSetup = opts && opts.setup;
    if (pageSetup !== undefined && typeof pageSetup !== 'function') {
        return Promise.reject(new TypeError('[vendor] runSketch: opts.setup must be the page\'s setup function. (FAIL-LOUD.)'));
    }
    if (typeof pageSetup !== 'function' && !useP5) {
        return Promise.reject(new Error('[vendor] runSketch: the page passes no setup() to run on this renderer. (FAIL-LOUD.)'));
    }
    const hooked = function () {
        const out = pageSetup.apply(this, arguments);
        if (onSetup) { onSetup(); }
        return out;
    };
    if (useP5) {
        if (typeof pageSetup === 'function') { globalThis.setup = hooked; }   // p5 global mode calls it from its own load
        return loadClassicScripts([vendorUrl('p5.min.js')]);
    }
    hooked();
    return Promise.resolve();
}

/** p5's per-frame `draw` hook becomes a no-op: the runner's own frame loop draws. */
export function suppressP5Draw() {
    globalThis.draw = function () { /* the runner's frame loop draws; p5's draw is a no-op */ };
}

/** p5's `frameRate(fps)`, when p5 is loaded (a p5 global-mode call; a no-op without p5). */
export function p5FrameRate(fps) {
    if (typeof globalThis.frameRate === 'function') { globalThis.frameRate(fps); }
}

/** p5's `loop()`, when p5 is loaded — its mouse/key event handling needs a running sketch. */
export function resumeP5Loop() {
    if (typeof globalThis.loop === 'function') { globalThis.loop(); }
}
