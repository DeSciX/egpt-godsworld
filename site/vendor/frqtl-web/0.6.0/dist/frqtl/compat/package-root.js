/* Copyright 2023-2026 by Essam Abadir */

/**
 * compat/package-root.js — THE package root: the URL of the lib-identity root of THIS copy of the
 * package (the directory that holds frqtl/, shim/ and fat/), ending in '/'.
 *
 *   packageRoot() → string
 *
 * One source, two builds:
 *   - as an ES module, the root is read off this module's own URL (it sits at frqtl/compat/);
 *   - in frqtl-web.min.js (the esbuild IIFE of frqtl/boot-entry.js) the build replaces every
 *     `import.meta.url` with the module's lib path resolved against packageRoot(), and replaces
 *     this module's own with the URL of the <script> that evaluated the bundle
 *     (document.currentScript), so the bundle sits at the root it serves from.
 * Every other module that locates a file of the package does it relative to its own URL, which
 * in the bundle is this root plus its lib path — one fact, read here.
 */

const _ROOT = new URL('../../', import.meta.url).href;

/** @returns {string} the lib-identity root URL of this copy of the package, ending in '/' */
export function packageRoot() {
    return _ROOT;
}
