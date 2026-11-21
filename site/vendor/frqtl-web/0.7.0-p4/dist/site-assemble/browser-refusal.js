/* Copyright 2023-2026 by Essam Abadir */

/**
 * site-assemble/browser-refusal.js — the non-node (`default`) condition of @descix/frqtl-web's `./site-assemble`.
 *
 * `./site-assemble` WRITES a static site to disk (lib/shim/engine/site-assemble.mjs::assembleSite). A page has no disk
 * to write to, so this module THROWS on load, naming the host that runs it — a refusal, not a missing feature. A page
 * that reads a served site's shape imports `@descix/frqtl-web/site-graph` (host-neutral) instead.
 */

throw new Error(
    '[frqtl-web/site-assemble] `@descix/frqtl-web/site-assemble` is a NODE surface and this is not node.\n' +
    '\n' +
    'assembleSite({ out, build, rosterHref, webDist, mathDist }) writes a static site to disk — run it in node\n' +
    '(a ship step, a build script):\n' +
    '    import { assembleSite } from \'@descix/frqtl-web/site-assemble\';\n' +
    '\n' +
    'A PAGE that reads a served site\'s shape (the build stamp, the entry set, the placements) imports the\n' +
    'host-neutral door instead:  import { siteBuildStampOf } from \'@descix/frqtl-web/site-graph\'.\n' +
    '\n' +
    '(FAIL-LOUD.)'
);
