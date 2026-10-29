/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-opening.test.mjs — the lab opens on the 3D double slit (CEO 2026-10-18: the default starting scene is the 3D DSE).
 *
 * The lab's roster (site/scenes/roster.json) says which scene the lab opens on, once: its firstContact. maxi-lab.js
 * openingScene(roster) is the one reader of it: the package's firstContactOf, in that scene's DECLARED default mode
 * (defaultWalkthroughModeId), never spelled. The test runs the page's own `openingScene` function (read from maxi-lab.js,
 * never re-typed) over the lab's roster, normalized by the vendored registry. Red when the opening is a 2D mode, when the
 * mode is spelled rather than derived, when the roster names no first contact, and when firstScene bypasses it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { registry, roster } from '../lab-roster.mjs';

const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'app-assets', 'maxi-lab.js');

/** The page's opening owner: its exported openingScene function (and the sceneIds line it names), evaluated over the package's readers. */
function pageOpeningScene(src) {
    const idsLine = src.match(/^const sceneIds = [^\n]*;$/m);
    assert.ok(idsLine, 'maxi-lab.js declares no `const sceneIds = …;`');
    const at = src.indexOf('\nexport function openingScene(');
    assert.ok(at !== -1, 'maxi-lab.js exports no function openingScene()');
    const fn = src.slice(at + 1, src.indexOf('\n}\n', at) + 2).replace(/^export /, '');
    const deps = { firstContactOf: registry.firstContactOf, defaultWalkthroughModeId: registry.defaultWalkthroughModeId };
    return new Function(...Object.keys(deps), idsLine[0] + '\n' + fn + '\nreturn openingScene;')(...Object.values(deps));
}

/** The lab's roster JSON with `patch` applied, normalized by the package at the lab roster's own href. */
function rosterWith(patch) {
    const json = JSON.parse(fs.readFileSync(new URL(roster.href), 'utf8'));
    return registry.normalizeRoster(Object.assign(json, patch), roster.href);
}

/** The page's own text of a module-level function, to its own closing brace at column 0. */
function fnText(src, head) {
    const at = src.indexOf('\n' + head + '(');
    assert.ok(at !== -1, 'maxi-lab.js has no ' + head + '()');
    return src.slice(at + 1, src.indexOf('\n}\n', at) + 2);
}

/** The deep-link line firstScene may carry, exactly; everything else in it is the no-deep-link path. */
const DEEP_LINK = "    if (q.get('scene')) { return { id: q.get('scene'), mode: q.get('mode') || undefined }; }";
const FIRST_SCENE_REST = ['function firstScene() {', '    const q = new URLSearchParams(window.location.search);', '    return openingScene(labRoster());', '}'];

/** What is wrong with the page's opening path: a spelled mode or id in openingScene (any quote), or a firstScene whose no-deep-link path is not exactly `return openingScene(labRoster());`. */
function openingFaults(src) {
    const faults = [];
    const opening = fnText(src, 'export function openingScene');
    if (!/mode: defaultWalkthroughModeId\(row\)/.test(opening)) { faults.push('openingScene does not take its mode from defaultWalkthroughModeId(row)'); }
    if (/['"`](?:2d|3d)['"`]/i.test(opening)) { faults.push('openingScene spells a mode: ' + opening.match(/['"`](?:2d|3d)['"`]/i)[0]); }
    if (!/const row = firstContactOf\(lr\);/.test(opening)) { faults.push('openingScene does not read the roster\'s first contact (firstContactOf(lr))'); }
    for (const r of roster.rows) { if (opening.includes(r.id)) { faults.push('openingScene spells the scene id ' + r.id); } }
    const first = fnText(src, 'function firstScene').split('\n');
    if (first.filter((l) => l === DEEP_LINK).length !== 1) { faults.push('firstScene does not carry exactly one deep-link line ' + JSON.stringify(DEEP_LINK.trim())); }
    const rest = first.filter((l) => l !== DEEP_LINK);
    if (JSON.stringify(rest) !== JSON.stringify(FIRST_SCENE_REST)) { faults.push('firstScene\'s no-deep-link path is not exactly `return openingScene(labRoster());`: ' + JSON.stringify(rest)); }
    return faults;
}

test('the lab opens on the 3D double slit: the roster\'s first contact, dse-tunnel-rebuild, in its declared default mode (red on a 2D opening, a spelled mode, or no first contact)', () => {
    const src = fs.readFileSync(LAB, 'utf8');
    const opening = pageOpeningScene(src)(roster);
    const row = registry.walkthroughById(roster, opening.id);
    assert.ok(row, 'the opening id is a scene of the lab\'s roster');
    assert.equal(roster.firstContact, opening.id, 'the opening is the roster\'s first contact');
    assert.equal(opening.id, 'dse-tunnel-rebuild', 'the opening is the double slit');
    assert.equal(opening.mode, '3d', 'the opening mode is 3D');
    assert.ok(registry.walkthroughIs3D(roster, opening.id, opening.mode), 'the opening mode loads the three (3D) renderer');
    assert.equal(opening.mode, registry.defaultWalkthroughModeId(row), 'the opening mode is the scene\'s declared default');
    assert.deepEqual(openingFaults(src), []);
});

test('negative controls: no first contact throws by name; a 2D first contact, a spelled mode or id, and a firstScene bypass are caught', () => {
    const src = fs.readFileSync(LAB, 'utf8');
    assert.throws(() => pageOpeningScene(src)(rosterWith({ firstContact: null })), /the lab's roster names no firstContact/);
    assert.throws(() => rosterWith({ firstContact: 'no-such-scene' }), /"no-such-scene" is not a declared scene id/, 'the package refuses a first contact the roster does not declare');
    const flat = pageOpeningScene(src)(rosterWith({ firstContact: 'r1-straight-walk' }));
    assert.ok(flat.mode !== '3d' && !registry.walkthroughIs3D(roster, flat.id, flat.mode), 'a 2D first contact opens 2D (the first test would go red)');
    const twoD = pageOpeningScene(src.replace('mode: defaultWalkthroughModeId(row)', "mode: '2d'"))(roster);
    assert.notEqual(twoD.mode, '3d', 'the planted 2D opening is not 3D (the first test would go red)');
    const plants = {
        'a spelled mode': src.replace('mode: defaultWalkthroughModeId(row) }', "mode: '3d' }"),
        'a template-literal mode': src.replace('mode: defaultWalkthroughModeId(row) }', 'mode: (defaultWalkthroughModeId(row), `3d`) }'),
        'a spelled id': src.replace('const row = firstContactOf(lr);', "const row = walkthroughById(lr, 'dse-tunnel-rebuild');"),
        'an early return in firstScene': src.replace('    return openingScene(labRoster());\n}', '    return { id: "dse-tunnel-rebuild", mode: "2d" };\n    return openingScene(labRoster());\n}'),
        'firstScene not through openingScene': src.replace('    return openingScene(labRoster());\n}', '    return { id: labRoster().firstContact };\n}')
    };
    for (const [what, planted] of Object.entries(plants)) {
        assert.notEqual(planted, src, 'the plant applied: ' + what);
        assert.ok(openingFaults(planted).length > 0, what + ' is caught');
    }
});
