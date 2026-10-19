/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * host-view.test.mjs — ONE view declaration for the whole site, through the package's declarer.
 *
 * site/app-assets/maxi-host-view.js is the one call site of `declareHostView` (`@descix/frqtl-web/host-view`, through the
 * page's import map) and the one owner of the two rules built from BREAKPOINTS: MOBILE_QUERY (the LAYOUT rule, about the
 * frame; app.html's @media twin) and PHONE_QUERY (the CHROME rule the declarer asks, about the device). Gates:
 *   1. writerFaults: no site file but the call site calls `view.set(`, calls `declareHostView(`, or calls the call site's
 *      own `declareSiteHostView(` (the module's one top-level call is the page's one declaration);
 *   2. mobileQueryFaults: the thresholds are spelled once (BREAKPOINTS) and both queries are built from them; app.html's
 *      one mobile @media block carries MOBILE_QUERY equal; no other site file retypes a clause of either query or calls
 *      matchMedia with anything but MOBILE_QUERY;
 *   3. copyFaults: the copied egpt-frqtl build site/app-assets/host-view.js is gone, and no page or module loads it;
 *      index.html loads the bridge then the call site, app.html loads the bridge before the lab and the lab imports the
 *      call site;
 *   4. the declarer asks PHONE_QUERY (the device), never the frame: a narrow frame on a wide fine-pointer screen asks
 *      CodeSite, a coarse 390-wide screen asks NoChrome, an iPad asks CodeSite;
 *   5. the outcome rows, run over fake shells through the real declarer: desktop requested:CodeSite, phone
 *      requested:NoChrome, phone on a shell without NoChrome fallback:NoChrome (CodeSite set), unoffered, and the two
 *      contract breaks (view-no-modes, set-threw) are ONE console.error naming the shell; every other row ONE console.info,
 *      all under HOST_VIEW_LOG.
 * Each fault function runs over the tree (no faults) and over in-test plants (each named).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHostViewModule } from './host-view-module.mjs';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site');
const read = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');
const OWNER = 'app-assets/maxi-host-view.js';

/** Every text file the site serves outside the vendored package: {rel: text}. */
function siteTexts() {
    const out = {};
    const walk = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name);
            const rel = path.relative(SITE, full).split(path.sep).join('/');
            if (ent.isDirectory()) { if (rel !== 'vendor' && rel !== 'memories') { walk(full); } continue; }
            if (/\.(m?js|html|css)$/.test(ent.name)) { out[rel] = fs.readFileSync(full, 'utf8'); }
        }
    };
    walk(SITE);
    return out;
}

/** The module scripts' and classic scripts' src, in document order. */
const scriptSrcs = (html) => [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);

// The publisher's SDK file documents view.set in its own comments; it is the shell's bridge, not a writer of this site.
const NOT_A_WRITER = new Set(['DeSciXAppSDK.js']);

/** The declarer's specifier as a string literal (any quote): every way a module can import it names it so. */
const HOST_VIEW_SPEC_RX = /['"`]@descix\/frqtl-web\/host-view['"`]/;

export function writerFaults(files) {
    const faults = [];
    for (const [rel, text] of Object.entries(files)) {
        if (NOT_A_WRITER.has(rel)) { continue; }
        // `.` or `?.`, any spacing, dotted or bracketed, called plainly or as `set?.(`
        if (/\bview\s*\??\.\s*set\s*(\?\.\s*)?\(|\bview\s*(\?\.\s*)?\[\s*['"`]set['"`]\s*\]\s*(\?\.\s*)?\(/.test(text)) { faults.push(rel + ': calls view.set itself (' + OWNER + ' is the one declaration)'); }
        if (/\bDeSciX\s*(\??\.\s*view\b|(\?\.\s*)?\[\s*['"`]view['"`]\s*\])|\{[^{}]*\bview\b[^{}]*\}\s*=\s*(window\s*\??\.\s*)?DeSciX\b/.test(text)) { faults.push(rel + ': reads DeSciX.view (only the package\'s declarer touches the shell\'s view)'); }
        // the declarer by its SPECIFIER, whatever binding or namespace takes it (static, side-effect or dynamic import);
        // a page's generated import-map block names it as a map key and is not an import
        if (rel !== OWNER && HOST_VIEW_SPEC_RX.test(text.replace(/<!-- IMPORT-MAP:BEGIN[\s\S]*?<!-- IMPORT-MAP:END -->/g, ''))) {
            faults.push(rel + ': imports @descix/frqtl-web/host-view (only ' + OWNER + ' reaches the declarer)');
        }
        if (/\.\s*set\s*\(\s*['"](CodeSite|SplitView|Chat|NoChrome)['"]/.test(text)) { faults.push(rel + ': sets a view mode by name'); }
        const declares = (text.match(/\bdeclareHostView\s*\(/g) || []).length;
        if (rel === OWNER ? declares !== 1 : declares !== 0) { faults.push(rel + ': calls declareHostView ' + declares + ' time(s) (only ' + OWNER + ', once)'); }
        const site = (text.match(/\bdeclareSiteHostView\s*\(/g) || []).length;
        // the owner: its definition plus its one top-level call
        if (rel === OWNER ? site !== 2 : site !== 0) { faults.push(rel + ': names declareSiteHostView( ' + site + ' time(s) (the owner defines it and calls it once)'); }
    }
    if (!(OWNER in files)) { faults.push(OWNER + ' is missing'); }
    return faults;
}

/** `rules` = the owner's exported {BREAKPOINTS, MOBILE_QUERY, PHONE_QUERY} (the module, loaded through the import map). */
export function mobileQueryFaults(files, rules) {
    const faults = [];
    const owner = files[OWNER] || '';
    const { BREAKPOINTS, MOBILE_QUERY, PHONE_QUERY } = rules;
    const bp = owner.match(/^export const BREAKPOINTS = Object\.freeze\(\{ width: (\d+), height: (\d+) \}\);$/gm) || [];
    if (bp.length !== 1) { faults.push(OWNER + ': ' + bp.length + ' BREAKPOINTS declarations (exactly one)'); return faults; }
    for (const k of ['width', 'height']) {
        const n = String(BREAKPOINTS[k]);
        const spelled = (owner.match(new RegExp('(?<![\\d.])' + n + '(?!\\d)', 'g')) || []).length;
        if (spelled !== 1) { faults.push(OWNER + ': the ' + k + ' threshold ' + n + ' is spelled ' + spelled + ' times (once, in BREAKPOINTS; the queries are built from it)'); }
    }
    for (const name of ['MOBILE_QUERY', 'PHONE_QUERY']) {
        const decl = owner.match(new RegExp('^export const ' + name + ' = `([^`]*)`;$', 'gm')) || [];
        if (decl.length !== 1) { faults.push(OWNER + ': ' + decl.length + ' ' + name + ' declarations (exactly one, a template built from BREAKPOINTS)'); continue; }
        if (!/\$\{BREAKPOINTS\.width\}/.test(decl[0]) || !/\$\{BREAKPOINTS\.height\}/.test(decl[0])) { faults.push(OWNER + ': ' + name + ' is not built from BREAKPOINTS.width and BREAKPOINTS.height'); }
    }
    const clauses = [...MOBILE_QUERY.split(/\s*,\s*/), ...PHONE_QUERY.split(/\s*,\s*/)];
    const pieces = clauses.flatMap((c) => c.split(/\s+and\s+/)).filter((c) => !/^\(pointer: coarse\)$/.test(c));
    for (const [rel, text] of Object.entries(files)) {
        if (rel === OWNER) { continue; }
        let rest = text;
        if (rel === 'app.html') {
            const blocks = text.split('@media ' + MOBILE_QUERY + ' {').length - 1;
            if (blocks !== 1) { faults.push('app.html: ' + blocks + ' mobile @media blocks carry MOBILE_QUERY (exactly one, equal to the owner\'s)'); }
            rest = text.split('@media ' + MOBILE_QUERY + ' {').join('@media {');
        }
        for (const c of pieces) { if (rest.includes(c)) { faults.push(rel + ': retypes the clause "' + c + '" (import the rule from ' + OWNER + ')'); } }
        if (/\b(MOBILE_QUERY|PHONE_QUERY|BREAKPOINTS)\s*=/.test(text)) { faults.push(rel + ': declares its own MOBILE_QUERY, PHONE_QUERY or BREAKPOINTS'); }
        for (const m of text.matchAll(/\bmatchMedia\s*\(/g)) {
            const arg = text.slice(m.index + m[0].length);
            if (!/^\s*MOBILE_QUERY\s*\)/.test(arg)) { faults.push(rel + ': matchMedia(' + arg.slice(0, 40).split('\n')[0] + ' asks another rule (MOBILE_QUERY only; the chrome rule is the owner\'s)'); }
        }
    }
    return faults;
}

const COPY_RX = /(^|[^\w-])host-view\.js\b/;

export function copyFaults(files, copyExists) {
    const faults = [];
    if (copyExists) { faults.push('site/app-assets/host-view.js is back (the package\'s @descix/frqtl-web/host-view is the declarer)'); }
    for (const [rel, text] of Object.entries(files)) {
        if (COPY_RX.test(text)) { faults.push(rel + ': names host-view.js'); }
    }
    const index = scriptSrcs(files['index.html'] || '');
    const sdkI = index.indexOf('DeSciXAppSDK.js');
    const hv = index.indexOf(OWNER);
    if (sdkI === -1 || hv === -1 || hv < sdkI) { faults.push('index.html does not load DeSciXAppSDK.js and then ' + OWNER); }
    const app = scriptSrcs(files['app.html'] || '');
    const sdkA = app.indexOf('DeSciXAppSDK.js');
    const lab = app.indexOf('app-assets/maxi-lab.js');
    if (sdkA === -1 || lab === -1 || lab < sdkA) { faults.push('app.html does not load DeSciXAppSDK.js before app-assets/maxi-lab.js'); }
    if (!/^import \{[^}]*\bhostView\b[^}]*\} from '\.\/maxi-host-view\.js';$/m.test(files['app-assets/maxi-lab.js'] || '')) {
        faults.push('maxi-lab.js does not import hostView from ./maxi-host-view.js (the lab reads the one declaration)');
    }
    if (!/^import \{ declareHostView \} from '@descix\/frqtl-web\/host-view';$/m.test(files[OWNER] || '')) {
        faults.push(OWNER + ' does not import declareHostView from @descix/frqtl-web/host-view (the package\'s declarer, by specifier)');
    }
    return faults;
}

const copyNow = () => fs.existsSync(path.join(SITE, 'app-assets', 'host-view.js'));

test('one writer of the view: only maxi-host-view.js declares, once (plants are red)', () => {
    const files = siteTexts();
    assert.deepEqual(writerFaults(files), []);
    const lab = files['app-assets/maxi-lab.js'];
    const plant = (rel, text) => writerFaults(Object.assign({}, files, { [rel]: text }));
    assert.match(plant('app-assets/maxi-lab.js', lab + '\nwindow.DeSciX.view.set(\'SplitView\');\n').join(), /maxi-lab\.js: calls view\.set itself/);
    assert.match(plant('app-assets/maxi-lab.js', lab + '\nconst v = window.DeSciX.view; v . set (\'Chat\');\n').join(), /reads DeSciX\.view[\s\S]*sets a view mode by name/);
    assert.match(plant('app-assets/maxi-lab.js', lab + '\nconst { view: shellView } = window.DeSciX; shellView.set(m);\n').join(), /maxi-lab\.js: reads DeSciX\.view/);
    assert.match(plant('app-assets/maxi-lab.js', lab + '\nwindow.DeSciX.view["set"](\'Chat\');\n').join(), /calls view\.set itself/);
    assert.match(plant('app-assets/maxi-lab.js', lab + '\nwindow.DeSciX["view"].available();\n').join(), /reads DeSciX\.view/);
    assert.match(plant('app-assets/maxi-intro.js', files['app-assets/maxi-intro.js'] + '\ndeclareHostView({ sdk: window.DeSciX, mode: \'Chat\' });\n').join(), /maxi-intro\.js: calls declareHostView 1 time/);
    assert.match(plant('index.html', files['index.html'].replace('</body>', '<script>DeSciX.view.set("CodeSite")</script></body>')).join(), /index\.html: calls view\.set itself/);
    assert.match(plant(OWNER, files[OWNER] + '\nexport const again = declareSiteHostView(window, console);\n').join(), /names declareSiteHostView\( 3 time/);
    // the verifier's four (REVISE on c68687f): optional chaining, and the declarer taken under another binding or namespace
    const intro = files['app-assets/maxi-intro.js'];
    assert.match(plant('app-assets/maxi-intro.js', intro + '\nwindow.DeSciX?.view?.set(m);\n').join(), /maxi-intro\.js: calls view\.set itself[\s\S]*maxi-intro\.js: reads DeSciX\.view/);
    assert.match(plant('app-assets/maxi-intro.js', intro + '\nsdk.view?.set(m);\n').join(), /maxi-intro\.js: calls view\.set itself/);
    assert.match(plant('app-assets/maxi-intro.js', "import { declareHostView as dv } from '@descix/frqtl-web/host-view';\n" + intro + '\ndv({ sdk: window.DeSciX, mode: m });\n').join(), /maxi-intro\.js: imports @descix\/frqtl-web\/host-view/);
    assert.match(plant('app-assets/maxi-intro.js', "import * as HVNS from '@descix/frqtl-web/host-view';\n" + intro + "\nHVNS['declareHostView']({ sdk: window.DeSciX, mode: m });\n").join(), /maxi-intro\.js: imports @descix\/frqtl-web\/host-view/);
    // and the other spellings of the same: a dynamic import, a side-effect import, set?.(), a bracketed view
    assert.match(plant('app-assets/maxi-intro.js', intro + "\nimport(`@descix/frqtl-web/host-view`).then((h) => h.declareHostView({ sdk: window.DeSciX, mode: m }));\n").join(), /imports @descix\/frqtl-web\/host-view/);
    assert.match(plant('app-assets/maxi-intro.js', "import '@descix/frqtl-web/host-view';\n" + intro).join(), /imports @descix\/frqtl-web\/host-view/);
    assert.match(plant('app-assets/maxi-intro.js', intro + '\nshell.view.set?.(m);\n').join(), /calls view\.set itself/);
    assert.match(plant('app-assets/maxi-intro.js', intro + "\nwindow.DeSciX?.['view'].available();\n").join(), /reads DeSciX\.view/);
    assert.match(plant(OWNER, files[OWNER].replace('await declareHostView(', 'await Promise.all([declareHostView(').replace('hostViewAsk(phone)));', 'hostViewAsk(phone))), declareHostView({ sdk: win.DeSciX, mode: \'Chat\' })]).then((r) => r[0]);')).join(), /calls declareHostView 2 time/);
});

test('the thresholds are spelled once and both rules are built from them; app.html\'s @media is MOBILE_QUERY (plants are red)', async () => {
    const files = siteTexts();
    const rules = await loadHostViewModule();
    assert.deepEqual(mobileQueryFaults(files, rules), []);
    const plant = (rel, text) => mobileQueryFaults(Object.assign({}, files, { [rel]: text }), rules);
    const owner = files[OWNER];
    const lab = files['app-assets/maxi-lab.js'];
    assert.match(plant(OWNER, owner.replace('(max-width: ${BREAKPOINTS.width}px)', '(max-width: 720px)')).join(), /the width threshold 720 is spelled 2 times[\s\S]*MOBILE_QUERY is not built from BREAKPOINTS/);
    assert.match(plant(OWNER, owner.replace('(max-device-width: ${BREAKPOINTS.width}px)', '(max-device-width: 720px)')).join(), /the width threshold 720 is spelled 2 times[\s\S]*PHONE_QUERY is not built from BREAKPOINTS/);
    assert.match(plant(OWNER, owner.replace('(max-device-height: ${BREAKPOINTS.height}px)', '(max-device-height: 600px)')).join(), /the height threshold 600 is spelled 2 times/);
    assert.match(plant(OWNER, owner.replace('width: 720, height: 600', 'width: 720, height: 600, phone: 720')).join(), /0 BREAKPOINTS declarations/);
    assert.match(plant('app-assets/maxi-lab.js', lab + "\nconst phone = window.matchMedia('(max-width: 720px), (pointer: coarse) and (max-height: 600px)').matches;\n").join(),
        /maxi-lab\.js: retypes the clause "\(max-width: 720px\)"[\s\S]*matchMedia\('\(max-width/);
    assert.match(plant('app-assets/maxi-lab.js', lab + "\nconst tiny = matchMedia(PHONE_QUERY).matches;\n").join(), /maxi-lab\.js: matchMedia\(PHONE_QUERY\)[^\n]* asks another rule/);
    assert.match(plant('app-assets/maxi-lab.js', lab + "\nif (screen.width <= 720 && matchMedia('(max-device-width: 720px)').matches) {}\n").join(), /retypes the clause "\(max-device-width: 720px\)"/);
    assert.match(plant('app-assets/maxi-lab.js', lab + "\nconst MOBILE_QUERY = '(max-width: 700px)';\n").join(), /maxi-lab\.js: declares its own MOBILE_QUERY/);
    assert.match(plant('app.html', files['app.html'].replace('@media ' + rules.MOBILE_QUERY + ' {', '@media (max-width: 720px) {')).join(),
        /app\.html: 0 mobile @media blocks carry MOBILE_QUERY[\s\S]*retypes the clause "\(max-width: 720px\)"/);
    assert.match(plant('index.html', files['index.html'].replace('</style>', '@media (pointer: coarse) and (max-height: 600px) { body { margin: 0 } }\n</style>')).join(),
        /index\.html: retypes the clause "\(max-height: 600px\)"/);
});

test('the copied host-view.js build is gone and nothing loads it; the pages reach the one call site (plants are red)', () => {
    const files = siteTexts();
    assert.deepEqual(copyFaults(files, copyNow()), []);
    const plant = (rel, text, back = false) => copyFaults(Object.assign({}, files, { [rel]: text }), back);
    assert.match(copyFaults(files, true).join(), /site\/app-assets\/host-view\.js is back/);
    assert.match(plant('app.html', files['app.html'].replace('<script src="DeSciXAppSDK.js"></script>\n', '<script src="DeSciXAppSDK.js"></script>\n<script type="module" src="app-assets/host-view.js"></script>\n')).join(), /app\.html: names host-view\.js/);
    assert.match(plant('index.html', files['index.html'].replace('app-assets/maxi-host-view.js', 'app-assets/host-view.js')).join(), /index\.html: names host-view\.js[\s\S]*index\.html does not load DeSciXAppSDK\.js and then/);
    assert.match(plant('app-assets/maxi-lab.js', files['app-assets/maxi-lab.js'].replace("import { MOBILE_QUERY, hostView } from './maxi-host-view.js';\n", '')).join(), /maxi-lab\.js does not import hostView/);
    assert.match(plant(OWNER, files[OWNER].replace("from '@descix/frqtl-web/host-view'", "from '../vendor/frqtl-web/0.6.0/dist/shim/host/index.js'")).join(), /does not import declareHostView from @descix\/frqtl-web\/host-view/);
});

// ── 4. the outcome rows, through the real declarer over fake shells ─────────────────────────────────────────────────

const MODES_060 = Object.freeze({ CODESITE: 'CodeSite', SPLITVIEW: 'SplitView', CHAT: 'Chat', NOCHROME: 'NoChrome' });

/**
 * A media-query evaluator for the features this site's rules may use, over env: a comma list of clauses, each clause
 * features joined by `and`. (pointer: coarse), (max-width|max-height: Npx) over the FRAME, (max-device-width|
 * max-device-height: Npx) over the SCREEN. Any other feature or form throws, so a rule cannot pass by being unreadable.
 */
function evalMedia(q, env) {
    return q.split(/\s*,\s*/).some((clause) => clause.split(/\s+and\s+/).every((f) => {
        if (f === '(pointer: coarse)') { return env.coarse; }
        const m = /^\((max-width|max-height|max-device-width|max-device-height): (\d+)px\)$/.exec(f);
        if (!m) { throw new Error('evalMedia: unknown media feature ' + JSON.stringify(f) + ' in ' + q); }
        const n = Number(m[2]);
        return { 'max-width': env.frame[0], 'max-height': env.frame[1], 'max-device-width': env.screen[0], 'max-device-height': env.screen[1] }[m[1]] <= n;
    }));
}

/**
 * A fake shell window. `env` is the place the page runs: frame [w, h] (what the page's viewport is at boot: the shell's
 * SplitView frame), screen [w, h] (the device) and coarse (the pointer). Its matchMedia EVALUATES the query it is given
 * (evalMedia), so a rule that reads the wrong feature answers wrongly here too.
 */
function fakeWindow({ env, rules, modes = MODES_060, setThrows = false }) {
    const sets = [];
    const queries = [];
    const view = {
        available: () => true,
        set: (m) => { sets.push(m); if (setThrows || !Object.values(modes || {}).includes(m)) { throw new Error('[DeSciX.view] "' + m + '" is not a view.'); } return m; },
        get: () => 'SplitView', subscribe: () => () => {}, DEFAULT: 'SplitView'
    };
    if (modes !== null) { view.MODES = modes; }
    const sdk = { mode: 'shell', ready: async () => ({ mode: 'shell', version: 1, members: ['powch', 'config', 'view'] }), view };
    const answer = (q) => evalMedia(q, env);
    const win = { DeSciX: sdk, document: { documentElement: { dataset: {} } }, screen: { width: env.screen[0], height: env.screen[1] },
        matchMedia: (q) => { queries.push(q); return { matches: answer(q) }; } };
    return { win, sets, queries };
}

// the places measured at the gateway (frame = the shell's SplitView frame at boot)
const DESK_1280 = { frame: [924, 720], screen: [1280, 800], coarse: false };
const DESK_960 = { frame: [684, 691], screen: [960, 768], coarse: false };
const DESK_960_ON_1920 = { frame: [684, 691], screen: [1920, 1080], coarse: false };
const PHONE_390 = { frame: [257, 760], screen: [390, 844], coarse: true };
const PHONE_844 = { frame: [597, 351], screen: [844, 390], coarse: true };
const IPAD_768 = { frame: [540, 922], screen: [768, 1024], coarse: true };
const IPAD_1024 = { frame: [732, 691], screen: [1024, 768], coarse: true };
// a small screen with a fine pointer (a small laptop or a desktop emulator): the chrome rule is a PHONE's, coarse first
const SMALL_FINE = { frame: [500, 420], screen: [700, 500], coarse: false };

function fakeConsole() {
    const lines = { info: [], error: [] };
    return { out: { info: (s) => lines.info.push(s), error: (s) => lines.error.push(s) }, lines };
}

test('the declarer asks the DEVICE rule, never the frame: a narrow frame on a desktop screen asks CodeSite, a coarse phone NoChrome, an iPad CodeSite', async () => {
    const m = await loadHostViewModule();
    const ask = async (env) => {
        const f = fakeWindow({ env, rules: m });
        const c = fakeConsole();
        const outcome = await m.declareSiteHostView(f.win, c.out);
        return { record: outcome.record, queries: f.queries, frameIsMobile: (fakeWindow({ env, rules: m }).win.matchMedia(m.MOBILE_QUERY)).matches };
    };
    const d960 = await ask(DESK_960);
    assert.equal(d960.frameIsMobile, true, 'the fixture is the trap: the 960 desktop\'s boot frame matches the layout rule');
    assert.equal(d960.record, 'requested:CodeSite', 'a narrow frame on a wide fine-pointer screen keeps the chrome');
    assert.deepEqual(d960.queries, [m.PHONE_QUERY], 'the declarer asks PHONE_QUERY once, and never MOBILE_QUERY');
    assert.equal((await ask(DESK_960_ON_1920)).record, 'requested:CodeSite');
    assert.equal((await ask(DESK_1280)).record, 'requested:CodeSite');
    assert.equal((await ask(PHONE_390)).record, 'requested:NoChrome', 'a coarse 390-wide screen asks NoChrome');
    assert.equal((await ask(PHONE_844)).record, 'requested:NoChrome', 'a coarse phone in landscape asks NoChrome');
    assert.equal((await ask(IPAD_768)).record, 'requested:CodeSite', 'an iPad (coarse, 768 wide) is not a phone');
    assert.equal((await ask(IPAD_1024)).record, 'requested:CodeSite', 'an iPad in landscape is not a phone');
    assert.equal((await ask(SMALL_FINE)).record, 'requested:CodeSite', 'a small screen with a fine pointer is not a phone');
    // negative control: a declarer that asked the frame would strip the 960 desktop's chrome
    const f = fakeWindow({ env: DESK_960, rules: m });
    assert.equal(f.win.matchMedia(m.MOBILE_QUERY).matches ? 'NoChrome' : 'CodeSite', 'NoChrome', 'the frame rule on the same window is the bug the device rule avoids');
});

test('the outcome rows over fake shells: requested, fallback, unoffered, and a shell contract break is one console.error naming the shell', async () => {
    const m = await loadHostViewModule();
    const run = async ({ mobile, ...shape }) => {
        const f = fakeWindow(Object.assign({ env: mobile ? PHONE_390 : DESK_1280, rules: m }, shape));
        const c = fakeConsole();
        const outcome = await m.declareSiteHostView(f.win, c.out);
        return { outcome, sets: f.sets, queries: f.queries, lines: c.lines, dataset: f.win.document.documentElement.dataset };
    };

    const desk = await run({ mobile: false });
    assert.deepEqual(desk.queries, [m.PHONE_QUERY], 'the rule asked is PHONE_QUERY, once');
    assert.equal(desk.outcome.record, 'requested:CodeSite');
    assert.deepEqual(desk.sets, ['CodeSite']);
    assert.deepEqual(desk.lines, { info: [m.HOST_VIEW_LOG + ' requested:CodeSite'], error: [] });
    assert.equal(desk.dataset.descixView, 'requested:CodeSite', 'the declarer records the outcome on <html>');

    const phone = await run({ mobile: true });
    assert.equal(phone.outcome.record, 'requested:NoChrome');
    assert.deepEqual(phone.sets, ['NoChrome']);
    assert.deepEqual(phone.lines, { info: [m.HOST_VIEW_LOG + ' requested:NoChrome'], error: [] });

    const old = await run({ mobile: true, modes: Object.freeze({ CODESITE: 'CodeSite', SPLITVIEW: 'SplitView', CHAT: 'Chat' }) });
    assert.equal(old.outcome.record, 'fallback:NoChrome');
    assert.deepEqual(old.sets, ['CodeSite'], 'a shell without NoChrome gets the declared fallback, decided on view.MODES, never on set\'s throw');
    assert.equal(old.lines.info.length, 1);
    assert.match(old.lines.info[0], /^\[maxi-host-view\] fallback:NoChrome — refused: "NoChrome" is not in view\.MODES \[CodeSite, SplitView, Chat\]; set: CodeSite$/);

    const neither = await run({ mobile: true, modes: Object.freeze({ CHAT: 'Chat' }) });
    assert.equal(neither.outcome.record, 'unoffered:NoChrome');
    assert.deepEqual(neither.sets, []);
    assert.deepEqual([neither.lines.info.length, neither.lines.error.length], [1, 0]);

    const noModes = await run({ mobile: true, modes: null });
    assert.equal(noModes.outcome.row, 'contract-violated');
    assert.match(noModes.outcome.detail, /^view-no-modes: /);
    assert.deepEqual(noModes.sets, []);
    assert.deepEqual(noModes.lines.info, []);
    assert.equal(noModes.lines.error.length, 1);
    assert.match(noModes.lines.error[0], /^\[maxi-host-view\] contract-violated — view-no-modes: .* the DeSciX shell broke its view contract/);

    const threw = await run({ mobile: false, setThrows: true });
    assert.equal(threw.outcome.row, 'contract-violated');
    assert.match(threw.outcome.detail, /^set-threw: \[DeSciX\.view\] "CodeSite" is not a view\.$/);
    assert.deepEqual(threw.sets, ['CodeSite'], 'set ran once and was never retried');
    assert.equal(threw.lines.error.length, 1);
    assert.match(threw.lines.error[0], /^\[maxi-host-view\] contract-violated — set-threw: .* the DeSciX shell broke its view contract/);

    // the policy: the declarer refuses a fallback equal to its mode, so the desktop ask names none
    assert.deepEqual(m.hostViewAsk(false), { mode: 'CodeSite' });
    assert.deepEqual(m.hostViewAsk(true), { mode: 'NoChrome', fallback: 'CodeSite' });
});
