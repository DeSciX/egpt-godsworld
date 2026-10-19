/* Copyright 2023-2026 by Essam Abadir */

/**
 * site-import-map.mjs — node resolves a site module's `@descix/frqtl-web/...` imports through the SITE'S OWN import map
 * (scripts/gen-import-maps.mjs siteImportMap, the block app.html and scene.html carry), so a test importing a page
 * module loads the vendored files the page loads, by the same rows. Import this module before the page module.
 * A specifier the map does not carry is left to node, which refuses it by name.
 */

import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, DIST_REL } from '../frqtl-web-pin.mjs';
import { siteImportMap } from '../gen-import-maps.mjs';

const SITE = path.join(REPO, 'site');
const imports = siteImportMap().imports;
const DIST_URL = pathToFileURL(path.join(REPO, DIST_REL)).href + '/';

/** The map's own resolution: an exact row, else the longest prefix row (an import map's rule). */
export function resolveBySiteMap(spec) {
    if (Object.prototype.hasOwnProperty.call(imports, spec)) { return pathToFileURL(path.join(SITE, imports[spec])).href; }
    const prefix = Object.keys(imports).filter((k) => k.endsWith('/') && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    return prefix ? pathToFileURL(path.join(SITE, imports[prefix] + spec.slice(prefix.length))).href : null;
}

registerHooks({
    resolve(spec, context, next) {
        const url = resolveBySiteMap(spec);
        return url ? { url: url, shortCircuit: true } : next(spec, context);
    },
    load(url, context, next) {
        // the vendored dist ships ES modules without a package.json "type" above frqtl/; a page loads them as modules too
        if (url.startsWith(DIST_URL) && url.endsWith('.js')) { return next(url, Object.assign({}, context, { format: 'module' })); }
        return next(url, context);
    }
});
