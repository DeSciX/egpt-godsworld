/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot/node-refusal.js — the NODE condition of `exports["./boot"]`.
 *
 * `./boot` is the BROWSER-HOST surface: `bootScene` / `bootRecipe`
 * (`src/esm/index.js`) need a DOM mount and inject classic `<script>` tags. They can never
 * appear on the node condition of `.` without breaking the parity core's symbol contract,
 * and putting them on the browser condition ONLY would be exactly the silent condition
 * divergence the parity gate exists to kill. So a genuinely host-bound surface lives on a
 * subpath NAMED for its host — and the WRONG host gets a THROWN error naming the RIGHT door.
 *
 * This module IS that throw. It runs on load, before any export exists: a consumer who
 * reaches `./boot` from node finds out immediately, with the answer in the message, rather
 * than getting a handle that fails later at the first `document` reference.
 *
 * Its mirror image is the browser refusal at the head of `src/eyes/index.js` — one pattern,
 * two instances, deliberately the same voice.
 */

'use strict';

throw new Error(
    '[frqtl-sdk/boot] `@descix/frqtl-sdk/boot` is a BROWSER-HOST surface and this is node.\n' +
    '\n' +
    'bootScene / bootRecipe mount into a DOM element and inject classic\n' +
    '<script> tags — there is no page here to boot.\n' +
    '\n' +
    'THE RIGHT DOOR IN NODE is the parity core:  require(\'@descix/frqtl-sdk\')\n' +
    '  — the SAME symbol set the browser condition of that specifier exports:\n' +
    '    EGPTEngine (create the universe), the parts (LargeObject, Wall, SphereEmitter, ...),\n' +
    '    the setup factories (setupDoubleSlit, ...), and the headless eyes\n' +
    '    (FrqtlCapture / FrqtlVision — the tick and field stages need no canvas).\n' +
    'For a `composite` still through the REAL renderer, drive a real browser FROM node:\n' +
    '    require(\'@descix/frqtl-sdk/eyes\')  →  openHostedEyes({...})\n' +
    '\n' +
    '(FAIL-LOUD. This is a refusal, not a missing feature — there is no node boot to fall\n' +
    'back to, and a silent no-op here would hand you a page that never renders.)'
);
