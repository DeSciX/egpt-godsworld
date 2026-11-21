/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot/node-refusal.js — the NODE condition of @descix/frqtl-web's `./boot`.
 *
 * `./boot` is the page's scene doors (bootScene / bootProject mount into a DOM element and boot a
 * renderer). In node there is no page to boot, so this module THROWS on load, naming the right door —
 * a refusal, not a missing feature: a silent no-op would hand a consumer a page that never renders.
 */

throw new Error(
    '[frqtl-web/boot] `@descix/frqtl-web/boot` is a BROWSER-HOST surface and this is node.\n' +
    '\n' +
    'bootScene / bootProject mount into a DOM element and boot a page\'s renderer —\n' +
    'there is no page here to boot.\n' +
    '\n' +
    'THE RIGHT PACKAGE IN NODE is @descix/frqtl-node:\n' +
    '    import { bootNode, Wall, SphereEmitter, FrqtlVision } from \'@descix/frqtl-node\';\n' +
    '  — bootNode() boots the WASM engine; the parts and the headless eyes (the tick and field\n' +
    '  stages need no canvas) are the same modules. For a `composite` still through the REAL\n' +
    '  renderer, drive a real browser FROM node:  import { openHostedEyes } from \'@descix/frqtl-node/eyes\'.\n' +
    '\n' +
    '(FAIL-LOUD.)'
);
