/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-opening.test.mjs — the lab opens on the 3D double slit (CEO 2026-10-18: the default starting scene is the 3D DSE).
 *
 * maxi-lab.js openingScene() is the one owner of the opening: the registry's dse-tunnel-rebuild rung in its DECLARED
 * default mode, read off the registry's own defaultWalkthroughModeId (vendored @descix/frqtl-web), never spelled. The test
 * runs the page's own `OPENING_SCENE_ID` line and `openingScene` function (read from maxi-lab.js, never re-typed) over the
 * vendored registry, resolved through the site's own import map. Red when the opening is a 2D mode, when the mode is
 * spelled rather than derived, and when the id is not a registry rung.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './site-import-map.mjs';
const registry = await import('@descix/frqtl-web/registry');

const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'app-assets', 'maxi-lab.js');

/** The page's opening owner: its OPENING_SCENE_ID declaration and its exported openingScene function, evaluated over the registry. */
function pageOpeningScene(src) {
    const idLine = src.match(/^const OPENING_SCENE_ID = [^\n]*;$/m);
    assert.ok(idLine, 'maxi-lab.js declares no `const OPENING_SCENE_ID = …;`');
    const at = src.indexOf('\nexport function openingScene(');
    assert.ok(at !== -1, 'maxi-lab.js exports no function openingScene()');
    const fn = src.slice(at + 1, src.indexOf('\n}\n', at) + 2).replace(/^export /, '');
    const deps = { WALKTHROUGH: registry.WALKTHROUGH, walkthroughById: registry.walkthroughById, defaultWalkthroughModeId: registry.defaultWalkthroughModeId };
    return new Function(...Object.keys(deps), idLine[0] + '\n' + fn + '\nreturn openingScene;')(...Object.values(deps));
}

/** The page's own text of a module-level function, to its own closing brace at column 0. */
function fnText(src, head) {
    const at = src.indexOf('\n' + head + '(');
    assert.ok(at !== -1, 'maxi-lab.js has no ' + head + '()');
    return src.slice(at + 1, src.indexOf('\n}\n', at) + 2);
}

/** The deep-link line firstScene may carry, exactly; everything else in it is the no-deep-link path. */
const DEEP_LINK = "    if (q.get('scene')) { return { id: q.get('scene'), mode: q.get('mode') || undefined }; }";
const FIRST_SCENE_REST = ['function firstScene() {', '    const q = new URLSearchParams(window.location.search);', '    return openingScene();', '}'];

/** What is wrong with the page's opening path: a spelled mode in openingScene (any quote), or a firstScene whose no-deep-link path is not exactly `return openingScene();`. */
function openingFaults(src) {
    const faults = [];
    const opening = fnText(src, 'export function openingScene');
    if (!/mode: defaultWalkthroughModeId\(row\)/.test(opening)) { faults.push('openingScene does not take its mode from defaultWalkthroughModeId(row)'); }
    if (/['"`](?:2d|3d)['"`]/i.test(opening)) { faults.push('openingScene spells a mode: ' + opening.match(/['"`](?:2d|3d)['"`]/i)[0]); }
    const first = fnText(src, 'function firstScene').split('\n');
    if (first.filter((l) => l === DEEP_LINK).length !== 1) { faults.push('firstScene does not carry exactly one deep-link line ' + JSON.stringify(DEEP_LINK.trim())); }
    const rest = first.filter((l) => l !== DEEP_LINK);
    if (JSON.stringify(rest) !== JSON.stringify(FIRST_SCENE_REST)) { faults.push('firstScene\'s no-deep-link path is not exactly `return openingScene();`: ' + JSON.stringify(rest)); }
    return faults;
}

test('the lab opens on the 3D double slit: the dse-tunnel-rebuild rung in its declared default mode, read off the registry (red on a 2D opening, a spelled mode, or a non-rung id)', () => {
    const src = fs.readFileSync(LAB, 'utf8');
    const opening = pageOpeningScene(src)();
    const row = registry.walkthroughById(opening.id);
    assert.ok(row, 'the opening id is a registry rung');
    assert.equal(opening.id, 'dse-tunnel-rebuild', 'the opening is the double slit');
    assert.equal(opening.mode, '3d', 'the opening mode is 3D');
    assert.equal(opening.mode, registry.defaultWalkthroughModeId(row), 'the opening mode is the rung\'s declared default');
    assert.ok(registry.walkthroughModes(row).some((m) => m.id === opening.mode), 'the opening mode is one the rung declares');
    assert.deepEqual(openingFaults(src), []);
});

test('negative controls: a non-rung id throws by name; a 2D opening, a template-literal mode and a firstScene bypass are caught', () => {
    const src = fs.readFileSync(LAB, 'utf8');
    const bad = src.replace(/^const OPENING_SCENE_ID = [^\n]*;$/m, "const OPENING_SCENE_ID = 'no-such-rung';");
    assert.throws(() => pageOpeningScene(bad)(), /the opening scene "no-such-rung" is not a registry rung/);
    const twoD = pageOpeningScene(src.replace('mode: defaultWalkthroughModeId(row)', "mode: '2d'"))();
    assert.notEqual(twoD.mode, '3d', 'the planted 2D opening is not 3D (the first test would go red)');
    const plants = {
        'a template-literal mode': src.replace('mode: defaultWalkthroughModeId(row) }', 'mode: (defaultWalkthroughModeId(row), `3d`) }'),
        'an early return in firstScene': src.replace('    return openingScene();\n}', '    return { id: OPENING_SCENE_ID, mode: "2d" };\n    return openingScene();\n}'),
        'firstScene not through openingScene': src.replace('    return openingScene();\n}', '    return { id: OPENING_SCENE_ID };\n}')
    };
    for (const [what, planted] of Object.entries(plants)) {
        assert.notEqual(planted, src, 'the plant applied: ' + what);
        assert.ok(openingFaults(planted).length > 0, what + ' is caught');
    }
});
