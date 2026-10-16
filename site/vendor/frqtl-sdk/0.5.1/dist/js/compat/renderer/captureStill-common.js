/* Copyright 2023-2026 by Essam Abadir */

/**
 * captureStill-common.js — the SHARED pixel-readback + bag-assembly owner for every
 * `RendererProvider.captureStill()` implementation (the `composite`-stage tap executor,
 * docs/internal/engine/RENDERER_CONTRACT.md §1a.4).
 *
 * Peer of `renderCapabilities-common.js` in this directory, and it exists for the same
 * reason: without it, `p5-provider.js` and `three-provider.js` would each carry their own
 * row-order flip, their own bag-shape assembly, and their own "is this buffer actually
 * non-blank?" check — three chances for the two backends to disagree about what a still
 * IS. A capture that silently differs per backend is exactly the corrupted-corpus failure
 * the provenance contract exists to prevent, so the parts that are NOT backend-specific
 * live here once, and each provider contributes only its own irreducible readback call.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * Three pure, module-level free functions — no live WebGL/THREE/p5 instance is captured;
 * every backend handle arrives as an ARGUMENT, which is what keeps the readback logic
 * unit-testable in plain Node (a `Uint8Array` and a `{ readPixels }` object are enough).
 *
 * `flipRowsToTopLeft(src, width, height)` → `Uint8ClampedArray`
 *   Reverse the ROW order of an RGBA8 buffer. WebGL's `readPixels` origin is BOTTOM-LEFT;
 *   the contract's origin is TOP-LEFT (§1a.4), so a GL-based provider flips and a 2D-canvas
 *   provider (already top-left) does not. This is the one place the flip is written: an
 *   inverted still is invisible to every non-visual check and reads as "the physics is
 *   upside down", which is the worst kind of wrong answer — confidently mirrored data.
 *
 * `captureFrom2dCanvas(canvas, meta)` → the provider bag
 *   The 2D-canvas path (p5). `getImageData` is already RGBA, row-major, top-left, so no
 *   flip. Reads the canvas's BACKING-STORE size (`canvas.width/height`) — never its CSS
 *   size — because that is what `uResolution` means (§4).
 *
 * `captureFromGl(gl, width, height, meta)` → the provider bag
 *   The WebGL path (three). `readPixels` into a fresh `Uint8Array`, then ONE
 *   `flipRowsToTopLeft`. The CALLER must have re-rendered its retained scene in the SAME
 *   JS task immediately before calling this (see the readback guarantee below).
 *
 * `meta` (both capture fns) carries the fields only the PROVIDER is the authority for:
 *   `{ cssWidth, cssHeight, physicsW, physicsH, filtersApplied, renderBaseCanvas,
 *      filterTime, composited }`.
 *   `filtersApplied` MUST come from the provider's own ORDERED `_filters` list — never
 *   from the runner's unordered `_activeFilters` map, which is also blind to a direct BYO
 *   `prov.filter()` call and would therefore lie for exactly the BYO case.
 *   `filterTime` is the `uTime` the provider fed its filter passes (the contract's
 *   `filterTime` of the rendered tick): a number when `filtersApplied` is non-empty, null
 *   when it is empty.
 *   `composited` is the TickData the provider last drew (its own retained `_lastTickData`);
 *   its `universeData.tick` becomes the bag's `renderedTick` — the provider's REPORT of which
 *   tick these pixels are, which the tap mechanism compares against its stamp.
 *
 * The returned bag is the §1a.4 provider shape:
 *   `{ pixels, width, height, cssWidth, cssHeight, physicsW, physicsH,
 *      filtersApplied, renderBaseCanvas, filterTime, renderedTick }`
 * The RUNNER then normalizes it into the generic tap bag (`lib/shim/render/render-stages`
 * `normalizeStill`, where `pixels` becomes the stage-agnostic `data` payload and the
 * dispatcher adds `stage`/`tick`/`pose`/`composedOf`/`renderOptions`). Providers never
 * import the shim — a BYO renderer's whole capture burden stays ONE method.
 *
 * ── The readback-correctness guarantee (the hard sentence) ────────────────────
 *
 * A returned bag is the FULL composited canvas — all three layers (§8) plus every active
 * filter pass (§4) — as of the last completed `renderTick`/`repaint`. The WebGL trap:
 * `three-provider.js` constructs its `WebGLRenderer` WITHOUT `preserveDrawingBuffer`, so a
 * `readPixels` in a LATER task reads a CLEARED buffer and would return an all-black still.
 * The compliant GL path therefore re-renders its RETAINED scene (the scene graph and the
 * filter passes both persist between ticks) and reads back IN THE SAME JS TASK. Flipping
 * `preserveDrawingBuffer:true` globally is the WRONG fix: it taxes every frame to subsidise
 * occasional captures and leaves the guarantee implicit rather than enforced.
 * `assertNonBlank` below is the belt-and-braces check that this actually happened — a
 * uniformly-zero buffer THROWS rather than being handed back as evidence.
 *
 * ── FAIL-LOUD, never a null image ────────────────────────────────────────────
 *
 * Every function here throws on a bad input (absent canvas, no 2D context, no GL context,
 * a length mismatch, a uniformly-blank readback). A capability that is ABSENT hides an
 * affordance (the `move()` precedent — a host capability-checks and shows no button); a
 * capability that is PRESENT but cannot honor its guarantee THROWS. A black still from a
 * cleared framebuffer is a lie in the product surface, the same violation class as a
 * hardcoded backend label (dep-map rule 4).
 *
 * ── Module format: CLASSIC dual CommonJS/window (matches every peer under
 *    lib/frqtl/compat/renderer/ — RenderShape.js, FieldBuilder.js, Filters.js) ──
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This is the output boundary reading its own output: nothing here touches a
 * frame, a dimension or a tick, so no canonical-bench golden can move because of it.
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — the same wrapper every renderer
//    authority carries). Classic scripts share ONE global lexical environment, so an
//    unwrapped top-level helper here would silently overwrite a same-named helper in a
//    sibling script (last loaded wins) — invisible to `node --test`, which gives every
//    require()d file its own module scope. Everything below is PRIVATE; only the explicit
//    module.exports / window.CaptureStillCommon assignment reaches the shared scope.
//    Enforced by lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

function _fail(msg) {
    throw new Error('[captureStill] ' + msg + ' (FAIL-LOUD — never a null or blank still.)');
}

/**
 * Reverse the ROW order of an RGBA8 buffer (bottom-left origin → top-left origin).
 *
 * @param {Uint8Array|Uint8ClampedArray|Array<number>} src — RGBA8, `width*height*4` long
 * @param {number} width  — pixels per row
 * @param {number} height — number of rows
 * @returns {Uint8ClampedArray} a NEW buffer, rows reversed, channels untouched
 * @throws {Error} on a length that is not exactly width*height*4
 */
function flipRowsToTopLeft(src, width, height) {
    if (!src || typeof src.length !== 'number') { _fail('flipRowsToTopLeft: src is not an indexed buffer'); }
    var stride = width * 4;
    if (src.length !== stride * height) {
        _fail('flipRowsToTopLeft: buffer length ' + src.length + ' != width*height*4 (' +
              width + '*' + height + '*4 = ' + (stride * height) + ')');
    }
    var out = new Uint8ClampedArray(src.length);
    for (var row = 0; row < height; row++) {
        var from = (height - 1 - row) * stride;
        for (var i = 0; i < stride; i++) { out[row * stride + i] = src[from + i]; }
    }
    return out;
}

/**
 * Throw if a readback is uniformly one value across every byte.
 *
 * A composited scene with a background and at least one quantum is never uniform, so a
 * uniform buffer means the readback happened against a cleared/unbound framebuffer — the
 * black-still failure mode. This is checked HERE (not in the test) so a broken realm path
 * reports itself instead of quietly feeding a training corpus.
 *
 * @param {Uint8Array|Uint8ClampedArray} buf
 * @param {string} where — the provider/path name for the message
 */
function assertNonBlank(buf, where) {
    if (!buf.length) { _fail(where + ': readback returned an EMPTY buffer'); }
    var first = buf[0];
    for (var i = 1; i < buf.length; i++) {
        if (buf[i] !== first) { return; }
    }
    _fail(where + ': readback is UNIFORMLY ' + first + ' across every byte — the buffer was ' +
          'cleared or unbound. A GL provider must re-render its retained scene and read back ' +
          'in the SAME JS task (no preserveDrawingBuffer)');
}

/** Validate + copy the provider-authored provenance half of the bag. */
function _meta(meta, width, height) {
    meta = meta || {};
    if (!Array.isArray(meta.filtersApplied)) {
        _fail('meta.filtersApplied must be the provider\'s ORDERED filter-name array (its own ' +
              '_filters list is the one authority — never the runner\'s unordered _activeFilters map)');
    }
    // physicsW/H is the UNIVERSE-MAPPING half of provenance: it is what lets a consumer turn a
    // pixel back into a physics coordinate. Defaulting it to the buffer dims INVENTED a
    // universe size — silently correct only when the canvas happens to be 1:1 with the
    // universe, and a mislabeled corpus row otherwise. There is no honest fallback, so this
    // throws.
    if (!(typeof meta.physicsW === 'number' && meta.physicsW > 0) ||
        !(typeof meta.physicsH === 'number' && meta.physicsH > 0)) {
        _fail('meta.physicsW/physicsH must be the POSITIVE physics-canvas dimensions this ' +
              'buffer maps from — they are the universe-mapping half of provenance and cannot ' +
              'be guessed from the buffer size (that is only right at 1:1). Got ' +
              String(meta.physicsW) + 'x' + String(meta.physicsH));
    }
    // renderedTick is the TICK half of provenance, reported by the one party that knows which
    // TickData these pixels were drawn from. The tap stamps `tick` off the LOOP, and the loop
    // may have ticked past the last draw (a batched rAF frame renders only its last tick), so
    // without this report nothing could tell a still labelled t from pixels of t+k.
    var composited = meta.composited;
    var renderedTick = composited && composited.universeData && composited.universeData.tick;
    if (!(typeof renderedTick === 'number' && isFinite(renderedTick))) {
        _fail('meta.composited must be the TickData this provider last drew (its retained ' +
              '_lastTickData, carrying universeData.tick) — nothing has been composited, so ' +
              'there is no tick these pixels could be labelled with');
    }
    // filterTime is the CLOCK half of a filtered still's provenance: a filter that animates on
    // `uTime` draws different pixels at a different time, so a filtered still without the time
    // it drew with is not regenerable. A filter ran ⇔ a time was fed.
    var filterTime = (meta.filterTime === undefined) ? null : meta.filterTime;
    var filtered = meta.filtersApplied.length > 0;
    if (filtered ? !(typeof filterTime === 'number' && isFinite(filterTime)) : filterTime !== null) {
        _fail('meta.filterTime must be the finite uTime the filter passes drew with when ' +
              'filtersApplied is non-empty, and null when it is empty (filtersApplied ' +
              JSON.stringify(meta.filtersApplied) + ', filterTime ' + String(filterTime) + ')');
    }
    return {
        renderedTick: renderedTick,
        width:  width,
        height: height,
        // cssWidth/Height DO default to the buffer dims: that is the IDENTITY case (a canvas
        // with no CSS scaling), not an invented value — and a headless capture genuinely has
        // no CSS size to report.
        cssWidth:  (typeof meta.cssWidth  === 'number' && meta.cssWidth  > 0) ? meta.cssWidth  : width,
        cssHeight: (typeof meta.cssHeight === 'number' && meta.cssHeight > 0) ? meta.cssHeight : height,
        physicsW: meta.physicsW,
        physicsH: meta.physicsH,
        filtersApplied: meta.filtersApplied.slice(),
        renderBaseCanvas: (typeof meta.renderBaseCanvas === 'boolean') ? meta.renderBaseCanvas : null,
        filterTime: filterTime
    };
}

/**
 * Capture from a 2D canvas (the p5 path). `getImageData` is already RGBA, row-major,
 * TOP-LEFT — no flip.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} meta — see the module docstring
 * @returns {object} the §1a.4 provider bag
 */
function captureFrom2dCanvas(canvas, meta) {
    if (!canvas) {
        _fail('no canvas to read — captureStill() was called before init() created one');
    }
    var ctx = (typeof canvas.getContext === 'function') ? canvas.getContext('2d') : null;
    if (!ctx || typeof ctx.getImageData !== 'function') {
        _fail('the canvas has no readable 2D context (getImageData unavailable)');
    }
    var w = canvas.width, h = canvas.height;
    if (!(w > 0 && h > 0)) { _fail('canvas backing store is ' + w + 'x' + h); }
    var img = ctx.getImageData(0, 0, w, h);
    if (!img || !img.data || img.data.length !== w * h * 4) {
        _fail('getImageData returned ' + (img && img.data ? img.data.length : 'nothing') +
              ' bytes, expected ' + (w * h * 4));
    }
    assertNonBlank(img.data, '2d-canvas');
    var bag = _meta(meta, w, h);
    // Copy: the ImageData buffer is owned by the context and may be reused.
    bag.pixels = new Uint8ClampedArray(img.data);
    return bag;
}

/**
 * Capture from a WebGL context (the three path). The caller MUST have re-rendered its
 * retained scene in this SAME JS task immediately before calling this.
 *
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @param {number} width  — framebuffer width in backing-store pixels
 * @param {number} height — framebuffer height in backing-store pixels
 * @param {object} meta — see the module docstring
 * @returns {object} the §1a.4 provider bag (rows already flipped to top-left)
 */
function captureFromGl(gl, width, height, meta) {
    if (!gl || typeof gl.readPixels !== 'function') {
        _fail('no WebGL context to read — captureStill() was called before init(), or the ' +
              'context was lost');
    }
    if (!(width > 0 && height > 0)) { _fail('GL framebuffer is ' + width + 'x' + height); }
    var raw = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    assertNonBlank(raw, 'webgl');
    var bag = _meta(meta, width, height);
    bag.pixels = flipRowsToTopLeft(raw, width, height);
    return bag;
}

// ── Export ────────────────────────────────────────────────────────────────────

var CaptureStillCommon = {
    flipRowsToTopLeft:  flipRowsToTopLeft,
    assertNonBlank:     assertNonBlank,
    captureFrom2dCanvas: captureFrom2dCanvas,
    captureFromGl:      captureFromGl
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaptureStillCommon;
} else if (typeof window !== 'undefined') {
    window.CaptureStillCommon = CaptureStillCommon;
}

})();
