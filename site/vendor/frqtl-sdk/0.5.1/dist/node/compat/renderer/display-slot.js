/* Copyright 2023-2026 by Essam Abadir */

/**
 * display-slot.js — THE DISPLAY SLOT: the ONE answer to "which provider owns the display".
 *
 * ── The ratified rule (RENDERER_CONTRACT §9 + §1a.5, CEO 2026-08-01) ─────────
 *
 *   The DISPLAY provider is boot-fixed; OBSERVERS are live.
 *
 * Exactly one `RendererProvider` — the display provider — owns the canvas, the camera and
 * `projection`; swapping it is a reload. N observers (non-interactive consumers of the frame
 * stream) are addable and removable at any time; an observer owns no canvas, no camera and no
 * projection. This module holds the DISPLAY half of that rule and nothing else: there is no
 * observer registry here, and adding one before its first real caller is the speculative
 * registry §10 bans.
 *
 * ── What this slot is, and what it is NOT ───────────────────────────────────
 *
 * It is KNOWLEDGE, not ownership. The provider still creates and owns its own canvas in its
 * own `init()` — the frozen §1 contract is untouched, and the literal canvas-element handoff
 * was VETOED (one canvas owns one rendering context; p5 cannot adopt a foreign element). The
 * slot records WHICH provider that is, so every consumer asks one place instead of reading a
 * bare global that anything could assign.
 *
 * It REPLACES `window._egptActiveRenderer`, which was a bare mutable global with no name for
 * its own contract. That global is DELETED, not fenced: a slot plus a global would be two
 * truths about the same fact, which is the second-authority failure this module exists to
 * close (architect finding d.1).
 *
 * ── Why it lives in the RENDERER layer and not on the capture instrument ────
 *
 * The boot order forces it. `render-boot.js` runs in the RENDERER phase, BEFORE the GAME
 * layer loads (`stack-boot.js`: `_seqPhase(RENDERER + render-boot.js) → _seqPhase(GAME)`), and the
 * three.js path registers ASYNC — later still. A slot that lived in a GAME-layer script
 * would not exist when its one writer needs it. The RENDERER layer is also where
 * `CANONICAL_STACK_DIAGRAM` already puts the renderer pluggable surface, so this is the
 * authority table's own home rather than a new one. The capture instrument READS the slot
 * (through its `providerGetter` binding); it does not own it — an instrument is per-runner
 * and the display is per-process.
 *
 * ── The name chain (truth in labeling) ──────────────────────────────────────
 *
 * `window._egptRenderer` (the boot authority, a NAME) is and stays the head of ONE chain:
 *   boot authority → `build.renderer` provenance
 *   boot authority → this slot's `name()`
 * The slot FERRIES the boot authority's name; it never re-derives one. A slot that could
 * answer differently from `build.renderer` is the truth-in-labeling failure (dep-map rule 4),
 * so `display-slot.test.mjs` gates `FrqtlDisplay.name() === window._egptRenderer` after a
 * real boot.
 *
 * ── Boot-fixed is a SEMANTIC, not a write-once lock ─────────────────────────
 *
 * `set()` deliberately does NOT throw on a second call. The notebook realm switches a cell
 * between p5 and three by re-invoking render-boot's `_egptSelectRenderer(name)` — that IS the
 * reload the rule describes (a new renderer session, a new scene identity), not a hot swap of
 * a live scene. Locking the slot would break the realm while proving nothing: what makes the
 * display boot-fixed is that `projection` and `build.renderer` are SCENE-record fields, so a
 * re-selection mints a new scene rather than silently re-parenting stills.
 */

(function () {
    'use strict';

    var _provider = null;   // the display RendererProvider instance, or null
    var _name     = null;   // the boot authority's name it was registered under

    /**
     * Register the booted display provider. Called by whichever boot ran the selection
     * (`render-boot.js`'s `_egptSelectRenderer`, the SDK's ESM boot, a test harness
     * declaring a renderer the way a page does).
     *
     * @param {object} provider — the `RendererProvider` instance. The slot validates only
     *   that there IS one: provider SHAPE has an authority already —
     *   `render-boot.js`'s `REQUIRED_RENDERER_METHODS` check on the BYO path — and a second
     *   shape check here would be a second authority that could disagree with it (and would
     *   silently tighten what the shipped providers are allowed to be).
     * @param {string} [name] — the boot authority's renderer name (`window._egptRenderer`),
     *   FERRIED. Never re-derived here.
     * @returns {object} the provider, so a caller can register and assign in one expression.
     */
    function set(provider, name) {
        if (!provider || typeof provider !== 'object') {
            throw new Error('[FrqtlDisplay.set] the display provider must be a ' +
                'RendererProvider instance. Got: ' + String(provider) + '. (FAIL-LOUD — never ' +
                'a display slot holding nothing while a page believes it has a renderer.)');
        }
        _provider = provider;
        _name     = (name === undefined || name === null) ? null : String(name);
        return provider;
    }

    /** @returns {object|null} the display provider, or null before boot completes. */
    function get() { return _provider; }

    /** @returns {string|null} the boot authority's name this provider was registered under. */
    function name() { return _name; }

    /**
     * Empty the slot. For teardown ONLY (a test restoring its host, a realm disposing a
     * session) — never a way to "unset" a display mid-scene.
     */
    function clear() { _provider = null; _name = null; }

    var FrqtlDisplay = { set: set, get: get, name: name, clear: clear };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = FrqtlDisplay;
    } else if (typeof window !== 'undefined') {
        window.FrqtlDisplay = FrqtlDisplay;
    }

})();
