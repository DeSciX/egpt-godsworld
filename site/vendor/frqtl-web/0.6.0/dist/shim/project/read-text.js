/* Copyright 2023-2026 by Essam Abadir */

/**
 * read-text.js — THE reader of a text file by URL, for every host: a `file:` URL is read through node's fs
 * (`process.getBuiltinModule`, Node 20.16+ / 22.3+); any other URL is fetched. The split is a CAPABILITY of the
 * resolved URL, never a host sniff.
 *
 *   readText(url[, { fetch }]) → Promise<string>   REJECTS naming the URL: a file it cannot read ("reading <url>
 *                                                   failed: …"), a non-200 ("GET <url> answered <status>"), no
 *                                                   fs for a file: URL, no fetch. `fetch` is injectable (tests).
 *
 * Callers prefix their own subject: lib/shim/registry/scene-source.js (a registry scene's sketch) and
 * RecipeContext.fork (a package part's exact bytes).
 */

/**
 * @param {string} url
 * @param {{fetch?: function}} [opts]
 * @returns {Promise<string>}
 */
export function readText(url, opts) {
    return Promise.resolve().then(function () {
        if (typeof url !== 'string' || !url) { throw new TypeError('readText(url): a URL string (got ' + JSON.stringify(url) + ')'); }
        if (url.indexOf('file:') === 0) {
            var getBuiltin = (typeof process !== 'undefined' && process.getBuiltinModule) ? process.getBuiltinModule : null;
            if (typeof getBuiltin !== 'function') {
                throw new Error(url + ' is a file: URL; reading one needs node\'s process.getBuiltinModule (Node 20.16+ / ' +
                    '22.3+). In a page, serve the package over http');
            }
            var fs = getBuiltin('node:fs');
            var fileURLToPath = getBuiltin('node:url').fileURLToPath;
            return fs.promises.readFile(fileURLToPath(url), 'utf8').catch(function (e) {
                throw new Error('reading ' + url + ' failed: ' + (e && e.message));
            });
        }
        var f = (opts && opts.fetch) || (typeof fetch === 'function' ? fetch : null);
        if (!f) { throw new Error('no fetch available to load ' + url); }
        return Promise.resolve(f(url)).then(function (res) {
            if (!res || !res.ok) { throw new Error('GET ' + url + ' answered ' + (res ? res.status : 'nothing')); }
            return res.text();
        });
    });
}
