/* Copyright 2023-2026 by Essam Abadir */

/**
 * parts-module.js — THE mapping from a kind's defining module to the specifier a sketch imports it by.
 *
 *   moduleOfKind(from, urls) → '@descix/frqtl-web/parts' | '<project path>' | null
 *       from   the kind row's `from` (objects/kinds.js registerKind: the defining module's own URL)
 *       urls   the minted URL of every project file, by path ({ 'parts/MyEmitter.js': 'blob:…' }) — what
 *              the last linkProject returned (link.js), or null when no project is linked
 *     A part file of THIS copy of the package (packageRoot() + 'frqtl/parts/<File>.js') is a package part:
 *     the barrel's specifier. A project file's minted URL is that file's project path. Anything else (an
 *     internal kind under frqtl/objects/, a module outside the package) has no importable specifier: null.
 *
 *   importSpecifierOf(module, entry) → the specifier `entry` writes in an import line for `module`
 *       a package specifier as it is; a project path relative to the entry's own folder ('./parts/X.js').
 *
 * Consumers: the declared census (FrqtlApp: each runner.declared row's `module`) and the parts writer's
 * one added import line (parts-writer.js, through RecipeContext.toSketch). Nobody else maps a `from`.
 */

import { packageRoot } from '../../frqtl/compat/package-root.js';
import { FRQTL_WEB_SPECIFIERS } from './specifiers.js';

const _BARREL = FRQTL_WEB_SPECIFIERS.find(function (r) { return r.libPath === 'frqtl/parts/index.js'; });
if (!_BARREL) {
    throw new Error('[parts-module] FRQTL_WEB_SPECIFIERS has no row for the parts barrel (frqtl/parts/index.js). (FAIL-LOUD.)');
}
/** The specifier a package part is imported by: the parts barrel's row. */
export const PARTS_SPECIFIER = _BARREL.specifier;

const _PART_FILE = /^frqtl\/parts\/[A-Za-z_$][\w$]*\.js$/;

/**
 * @param {string} from — a kind row's `from` URL
 * @param {Object<string,string>|null} urls — project path → minted URL, from the last link
 * @returns {string|null}
 */
export function moduleOfKind(from, urls) {
    if (typeof from !== 'string' || !from) {
        throw new TypeError('[parts-module] moduleOfKind(from, urls): from is the kind row\'s module URL (got ' +
            JSON.stringify(from) + '). (FAIL-LOUD.)');
    }
    const root = packageRoot();
    if (from.startsWith(root) && _PART_FILE.test(from.slice(root.length))) { return PARTS_SPECIFIER; }
    if (urls) {
        for (const p of Object.keys(urls)) { if (urls[p] === from) { return p; } }
    }
    return null;
}

/**
 * @param {string} module — moduleOfKind's answer (never null here)
 * @param {string} entry — the importing file's project path (the sketch, 'sketch.js')
 * @returns {string}
 */
export function importSpecifierOf(module, entry) {
    if (typeof module !== 'string' || !module) {
        throw new TypeError('[parts-module] importSpecifierOf(module, entry): a module specifier or project path. (FAIL-LOUD.)');
    }
    if (module.startsWith('@')) { return module; }
    const from = entry.split('/');
    from.pop();
    const to = module.split('/');
    while (from.length && to.length > 1 && from[0] === to[0]) { from.shift(); to.shift(); }
    const up = from.map(function () { return '..'; });
    return (up.length ? up.join('/') + '/' : './') + to.join('/');
}
