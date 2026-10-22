/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * auth.test.mjs — the lab's one reader of the visitor's sign-in state (site/app-assets/maxi-auth.js) and the pages' use of it.
 *
 * Gates, each with its negative control:
 *   1. a sign-in made after the page settled is seen: on refresh() (the lab's Send) and on the watcher's own timer, with
 *      onChange fired once; a reader that keeps its first answer (the old intro's read-once) is red;
 *   2. the intro's entry button follows the state (buttonLabelFor over the watcher's state), and a wrong answer is refused;
 *   3. one reader: no published site module or page but maxi-auth.js names the word isAuthenticated in code (comments
 *      stripped; a page's inline scripts read too); the intro and the lab both read pageAuth (the old intro read planted
 *      back is red, and seven other spellings of a second read, planted in memory, are each red).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchAuth, pageAuth, authStateOf } from '../../site/app-assets/maxi-auth.js';
import { buttonLabelFor, ENTRY_LABELS } from '../../site/app-assets/maxi-intro.js';
import { publishedFiles } from '../publish-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTH_SRC = fs.readFileSync(path.join(REPO, 'site', 'app-assets', 'maxi-auth.js'), 'utf8');

/** A shell bus whose powch answers `signed.now` (sync, as measured unsigned at the gateway). */
function fakeShell(signed) {
    const members = ['call', 'view', 'powch'];
    return { DeSciX: { ready: async () => ({ mode: 'shell', members, version: 1 }), powch: { isAuthenticated: () => signed.now } } };
}

/** Whether `mod`'s watcher sees a sign-in after it settled: returns the faults. */
async function followsSignIn(mod) {
    const faults = [];
    const signed = { now: false };
    const w = mod.watchAuth(fakeShell(signed), { everyMs: 0 });
    const changes = [];
    w.onChange((now, prev) => changes.push([prev.authenticated, now.authenticated]));
    const first = await w.settled;
    if (first.authenticated !== false) { faults.push('settled as ' + first.authenticated); }
    signed.now = true;
    const again = await w.refresh();
    if (again.authenticated !== true) { faults.push('refresh after the sign-in reads ' + again.authenticated); }
    if (JSON.stringify(changes) !== '[[false,true]]') { faults.push('onChange fired ' + JSON.stringify(changes)); }
    await w.refresh();
    if (changes.length > 1) { faults.push('onChange fired on a read that changed nothing'); }
    return faults;
}

test('a sign-in after the page settled is seen on the next read, onChange fired once (negative control: a reader that keeps its first answer is red)', async () => {
    assert.deepEqual(await followsSignIn({ watchAuth }), []);
    const readOnce = AUTH_SRC.replace('return authStateOf(s, powch ? await win.DeSciX.powch.isAuthenticated() : undefined);',
        'if (st.first === undefined) { st.first = powch ? await win.DeSciX.powch.isAuthenticated() : undefined; } return authStateOf(s, st.first);');
    assert.notEqual(readOnce, AUTH_SRC, 'the plant applied');
    const planted = await import('data:text/javascript,' + encodeURIComponent(readOnce));
    assert.match((await followsSignIn(planted)).join(), /refresh after the sign-in reads false/);
});

test('the watcher\'s own timer sees a sign-in with no Send (negative control: everyMs 0 does not)', async () => {
    const signed = { now: false };
    const timed = watchAuth(fakeShell(signed), { everyMs: 15 });
    const still = watchAuth(fakeShell(signed), { everyMs: 0 });
    await Promise.all([timed.settled, still.settled]);
    signed.now = true;
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(timed.state.authenticated, true, 'the timer re-read the state');
    assert.equal(still.state.authenticated, false, 'negative control: with no timer and no refresh the state is stale');
});

test('the intro\'s entry button follows the watcher\'s state; a wrong answer is refused, never guessed', async () => {
    const signed = { now: false };
    const w = watchAuth(fakeShell(signed), { everyMs: 0 });
    assert.equal(buttonLabelFor(await w.settled).label, ENTRY_LABELS.login);
    signed.now = true;
    assert.equal(buttonLabelFor(await w.refresh()).label, ENTRY_LABELS.enter);
    signed.now = 'yes';
    await assert.rejects(w.refresh(), /isAuthenticated\(\) gave "yes", not a boolean/);
    assert.ok(w.error && /not a boolean/.test(w.error.message), 'the failed read is kept for the status line');
    assert.deepEqual(authStateOf({ mode: 'standalone', members: [] }), { mode: 'standalone', members: [], powch: false, authenticated: null });
    const bare = watchAuth({}, { everyMs: 0 });
    await assert.rejects(bare.settled, /window\.DeSciX is missing/);
    const win = fakeShell({ now: false });
    assert.equal(pageAuth(win), pageAuth(win), 'one watcher per page window');
});

const OWNER = 'site/app-assets/maxi-auth.js';
const SITE_FILES = publishedFiles(REPO).filter((f) => f.startsWith('site/') && /\.(m?js|html)$/.test(f) && f !== OWNER);
const stripJs = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
/** A page's text with its HTML comments dropped and the comments inside each inline <script> stripped. */
const pageCode = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, body, b) => a + stripJs(body) + b);

/**
 * Site files that name isAuthenticated (the bare word, in code: comments stripped) or that do not follow pageAuth.
 * read(rel) gives the text of a repo-relative path.
 */
// Known gap: a property name built by string concatenation (powch['isAuth' + 'enticated']) is not seen.
function readerFaults(read) {
    const faults = [];
    for (const f of SITE_FILES) {
        const src = read(f);
        const code = f.endsWith('.html') ? pageCode(src) : stripJs(src);
        if (/\bisAuthenticated\b/.test(code)) { faults.push(f + ' names isAuthenticated: only ' + OWNER + ' reads the sign-in state'); }
    }
    for (const f of ['site/app-assets/maxi-intro.js', 'site/app-assets/maxi-lab.js']) {
        if (!/import \{[^}]*\bpageAuth\b[^}]*\} from '\.\/maxi-auth\.js'/.test(read(f))) { faults.push(f + ' does not read pageAuth'); }
        if (!/pageAuth\((win|window)\)\.onChange\(|auth\.onChange\(/.test(read(f))) { faults.push(f + ' does not follow a change'); }
    }
    return faults;
}

const real = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

test('one reader: only maxi-auth.js names isAuthenticated; the intro and the lab both follow pageAuth (negative control: the old intro read planted back is red)', () => {
    assert.ok(SITE_FILES.includes('site/app.html') && SITE_FILES.includes('site/app-assets/maxi-lab.js'), 'the walk reaches the pages and the modules');
    assert.deepEqual(readerFaults(real), []);
    const INTRO = 'site/app-assets/maxi-intro.js';
    const intro = real(INTRO);
    const old = intro.replace('    auth.onChange((state) => { decide(state); });\n', '    const authenticated = await win.DeSciX.powch.isAuthenticated();\n');
    assert.notEqual(old, intro, 'the plant applied');
    assert.deepEqual(readerFaults((f) => f === INTRO ? old : real(f)),
        [INTRO + ' names isAuthenticated: only ' + OWNER + ' reads the sign-in state', INTRO + ' does not follow a change']);
});

/** Every spelling of a second read, planted in memory into a module or a page's inline script: each must be red. */
const LAB = 'site/app-assets/maxi-lab.js';
const APP = 'site/app.html';
const SPELLINGS = [
    [LAB, 'isAuthenticated ();'],
    [LAB, "powch['isAuthenticated']();"],
    [LAB, 'powch[`isAuthenticated`]();'],
    [LAB, 'DeSciX?.powch?.isAuthenticated?.();'],
    [LAB, 'powch.isAuthenticated.call(powch);'],
    [LAB, 'const { isAuthenticated: ia9 } = window.DeSciX.powch; ia9();'],
    [APP, '<script>window.DeSciX.powch.isAuthenticated();</script>'],
];
for (const [file, plant] of SPELLINGS) {
    test('one reader, planted: ' + plant + ' in ' + file + ' is red', (t) => {
        const src = real(file);
        const planted = file.endsWith('.html') ? src.replace('</body>', plant + '\n</body>') : src + '\n' + plant + '\n';
        assert.notEqual(planted, src, 'the plant applied');
        const faults = readerFaults((f) => f === file ? planted : real(f));
        t.diagnostic(faults.join(' | '));
        assert.deepEqual(faults, [file + ' names isAuthenticated: only ' + OWNER + ' reads the sign-in state']);
    });
}
