/* Copyright 2023-2026 by Essam Abadir */

/**
 * roster.js — THE roster contract: what a host's scene roster (a JSON file beside its scene files) may say, and
 * the functions that read a normalized roster. The package holds no scene rows of its own; a host declares them,
 * `normalizeRoster` validates and normalizes them, and every reader below takes the normalized bag.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 *   ROSTER_KEYS                  the typed key table, one frozen array per object kind (roster, scene, mode,
 *                                showcase, card, still, intro). A row is { key, type, required, default, child }:
 *                                `child` names the kind of a nested object (`many` when it is a list of them).
 *   normalizeRoster(json, href)  → the full, deep-frozen bag. THROWS naming the kind, the key and its table on an
 *                                unknown key, a missing required key, a wrong type, a retired field, or a broken
 *                                cross-reference. `href` (absolute) is a load fact, not a JSON key: it rides the bag
 *                                as `roster.href`, after the ferry.
 *   assertRosterBag(roster, signature)
 *                                the first statement of every roster-taking function: a non-bag THROWS naming the
 *                                function's signature, so an old call shape (`walkthroughById('x')`) names its
 *                                replacement.
 *   rosterHrefRefusalOf(href)    → null, or why `href` cannot be a roster URL (relative, another scheme, a query or
 *                                a hash). The one rule, read by normalizeRoster and by roster-link.js.
 *   sceneUrlOf(roster, row)      → the absolute URL of a scene row's file: `row.source` against the roster's href.
 *
 *   Scene rows:   walkthroughById(roster, id), walkthroughModes(row), defaultWalkthroughModeId(row),
 *                 effectiveRenderState(row, modeId), walkthroughIs3D(roster, id, modeId), firstContactOf(roster),
 *                 sceneGroups(roster)
 *   Showcase:     exhibitFor(roster, scene), sceneKey(roster, scene), showcaseCard(roster, card),
 *                 showcaseIntro(roster), showcaseHref(roster, card), showcaseUrl(roster, card)
 *   JOYSTICK_EXPLAINER           the paragraph a 3D scene's card carries: how CameraControls' pads work (package
 *                                behaviour, not showcase copy).
 *
 * A row or card passed to a reader must be an element of a bag `normalizeRoster` returned (checked by identity):
 * a copied or JSON-deserialized row is refused.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero physics — data shaping over a host's roster. A renderState selects the renderer, the seed and the camera.
 */

import { normalizeSavedRenderState } from '../render-state/index.js';
import { assertCopyText, assertCopyParagraphs } from './copy-gate.js';
import { STATIC_APP_PAGE } from '../engine/site-graph.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isBag = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const segText = (para) => para.map((s) => (typeof s === 'string' ? s : s.text)).join('');

function deepFreeze(v) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
        Object.freeze(v);
        Object.keys(v).forEach((k) => deepFreeze(v[k]));
    }
    return v;
}
const frozenCopy = (v) => deepFreeze(structuredClone(v));

// ── Value checks (one per type in ROSTER_KEYS) ──────────────────────────────

function fail(at, msg) { throw new Error('[roster] ' + at + ' ' + msg + ' (FAIL-LOUD.)'); }

function nonEmptyString(v, at) {
    if (typeof v !== 'string' || v.trim() === '') { fail(at, 'must be non-empty text (got ' + JSON.stringify(v) + ').'); }
    return v;
}
const nullOr = (check) => (v, at, ctx) => (v === null ? null : check(v, at, ctx));
const copyText = (v, at) => assertCopyText(v, '[roster] ' + at);

function plainParagraph(v, at) {
    assertCopyParagraphs([v], '[roster] ' + at, { table: false });
    if (!v.every((s) => typeof s === 'string')) { fail(at, 'is a plain paragraph: strings only (no links).'); }
    return frozenCopy(v);
}

/** A still's pose: a non-empty setOrbit patch of finite numbers (the stillOf rule, verbatim). */
function pose(v, at) {
    if (!isBag(v) || Object.keys(v).length === 0) { fail(at, 'must be a non-empty setOrbit patch (got ' + JSON.stringify(v) + ').'); }
    Object.keys(v).forEach((k) => {
        if (typeof v[k] !== 'number' || !Number.isFinite(v[k])) {
            fail(at + '.' + k, 'must be a finite number (got ' + String(v[k]) + ').');
        }
    });
    return frozenCopy(v);
}

function tick(v, at) {
    if (!Number.isInteger(v) || v < 1) { fail(at, 'must be an integer >= 1 (got ' + JSON.stringify(v) + ').'); }
    return v;
}

function renderStateBag(v, at) {
    if (!isBag(v)) { fail(at, 'must be a renderState bag (got ' + JSON.stringify(v) + ').'); }
    try { return deepFreeze(normalizeSavedRenderState(structuredClone(v))); }
    catch (e) { throw new Error('[roster] ' + at + ': ' + e.message); }
}

/** A mode's renderState is a DELTA over its row's: validated by the one renderState owner, stored as written. */
function renderStateDelta(v, at) {
    renderStateBag(v, at);
    return frozenCopy(v);
}

function siteOrigin(v, at) {
    nonEmptyString(v, at);
    let u = null;
    try { u = new URL(v); } catch (e) { fail(at, 'must be an absolute origin such as https://host (got ' + JSON.stringify(v) + ').'); }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.origin !== v) {
        fail(at, 'must be an absolute http(s) origin with no path and no trailing slash (got ' + JSON.stringify(v) +
            '; its origin is ' + JSON.stringify(u.origin) + ').');
    }
    return v;
}

function introParagraphs(v, at) {
    assertCopyParagraphs(v, '[roster] ' + at, { table: true });
    return frozenCopy(v);
}

/** Why `source` cannot be a scene file of the roster at `href`, or null. Every scene byte sits under the roster's
 *  directory and origin: no scheme, no leading slash, no `..` segment, ending `.js`, resolving inside the directory. */
function sourceRefusalOf(source, href) {
    if (typeof source !== 'string' || source === '') { return 'must be a relative URL ending .js (got ' + JSON.stringify(source) + ')'; }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(source)) {
        return JSON.stringify(source) + ' is absolute; a scene source is relative to the roster, so every scene sits under its directory';
    }
    if (source[0] === '/' || source[0] === '\\') {
        return JSON.stringify(source) + ' starts with a slash; a scene source is relative to the roster\'s directory';
    }
    if (source.split(/[/\\]/).indexOf('..') !== -1) {
        return JSON.stringify(source) + ' has a ".." segment; a scene source never leaves the roster\'s directory';
    }
    if (!/\.js$/.test(source)) { return JSON.stringify(source) + ' does not end .js; a scene is one sketch file'; }
    const dir = new URL('./', href).href;
    const resolved = new URL(source, href);
    if (resolved.href.indexOf(dir) !== 0 || resolved.search || resolved.hash) {
        return JSON.stringify(source) + ' resolves to ' + resolved.href + ', outside the roster\'s directory ' + dir;
    }
    return null;
}

function source(v, at, ctx) {
    const why = sourceRefusalOf(v, ctx.href);
    if (why) { fail(at, why + '.'); }
    return v;
}

// ── The key table ────────────────────────────────────────────────────────────

function req(key, type, check, extra) {
    return Object.freeze(Object.assign({ key, type, required: true, default: undefined, child: null, many: false, check }, extra));
}
function opt(key, type, dflt, check) {
    return Object.freeze({ key, type, required: false, default: deepFreeze(dflt), child: null, many: false, check });
}
function kids(key, kind, required, many, dflt) {
    return Object.freeze({ key, type: kind + (many ? '[]' : ' | null'), required, default: deepFreeze(dflt),
        child: kind, many, check: null });
}

/**
 * THE key table of a roster, one frozen array per object kind. `type` is the human description an error quotes;
 * an optional key's `default` is what the normalized bag holds when the key is absent.
 * @type {Readonly<Record<string, ReadonlyArray<{key: string, type: string, required: boolean, default: *,
 *   child: string|null, many: boolean, check: function|null}>>>}
 */
export const ROSTER_KEYS = Object.freeze({
    roster: Object.freeze([
        kids('rows', 'scene', true, true, undefined),
        opt('firstContact', 'scene id | null (null: the Empty Universe)', null, nullOr(nonEmptyString)),
        kids('showcase', 'showcase', false, false, null),
    ]),
    scene: Object.freeze([
        req('id', 'id (unique)', nonEmptyString),
        req('title', 'text', nonEmptyString),
        req('group', 'text', nonEmptyString, { missing: 'every scene names its group; the package owns no default group' }),
        req('source', 'relative URL ending .js (no scheme, no leading /, no ..)', source),
        opt('prose', 'text | null', null, nullOr(nonEmptyString)),
        opt('renderState', 'renderState bag', normalizeSavedRenderState({}), renderStateBag),
        kids('modes', 'mode', false, true, []),
    ]),
    mode: Object.freeze([
        req('id', 'id (unique in its scene)', nonEmptyString),
        req('label', 'text', nonEmptyString),
        opt('renderState', 'renderState delta | null', null, nullOr(renderStateDelta)),
    ]),
    showcase: Object.freeze([
        req('group', 'text', nonEmptyString),
        req('siteOrigin', 'absolute http(s) origin, no path', siteOrigin),
        kids('rows', 'card', true, true, undefined),
        kids('intro', 'intro', false, false, null),
        opt('invite', 'plain paragraph | null', null, nullOr(plainParagraph)),
        opt('throughLine', 'plain paragraph | null', null, nullOr(plainParagraph)),
    ]),
    card: Object.freeze([
        req('id', 'scene id', nonEmptyString),
        opt('mode', 'mode id | null (null: the scene\'s default mode)', null, nullOr(nonEmptyString)),
        req('title', 'copy text', copyText),
        req('tile', 'copy text', copyText),
        req('what', 'copy text', copyText),
        req('why', 'copy text', copyText),
        req('how', 'copy text', copyText),
        opt('controls', 'copy text | null', null, nullOr(copyText)),
        kids('still', 'still', false, false, null),
    ]),
    still: Object.freeze([
        req('tick', 'integer >= 1', tick),
        req('alt', 'copy text', copyText),
        opt('pose', 'setOrbit patch | null', null, nullOr(pose)),
    ]),
    intro: Object.freeze([
        req('seenKey', 'text', nonEmptyString),
        req('title', 'copy text', copyText),
        req('paragraphs', 'copy paragraphs (table paragraphs allowed)', introParagraphs),
    ]),
});

/** Fields that left the contract, each refused by name with what replaced it. */
const RETIRED = Object.freeze({
    roster: { href: 'href is a load fact: pass it as normalizeRoster(json, href), never in the JSON' },
    scene: {
        is3D: 'is3D is derived: walkthroughIs3D(roster, id, mode)',
        kind: 'a scene has no kind',
        order: 'the order is the array index',
    },
    card: {
        kind: 'a card names its scene row by id; it has no kind',
        order: 'the order is the array index',
        is3D: 'is3D is derived: walkthroughIs3D(roster, id, mode)',
    },
    showcase: { app: 'the app serving a site is the host\'s fact, not the roster\'s' },
});

// ── Normalization ────────────────────────────────────────────────────────────

const BAGS = new WeakSet();
const OWNER = new WeakMap();   // a normalized scene row → its bag

function ferry(kind, raw, at, ctx) {
    const table = ROSTER_KEYS[kind];
    const names = table.map((r) => r.key);
    if (!isBag(raw)) { fail(at, 'is a ' + kind + ': a JSON object (got ' + JSON.stringify(raw) + ').'); }
    Object.keys(raw).forEach((k) => {
        if (names.indexOf(k) !== -1) { return; }
        const retired = RETIRED[kind] && has(RETIRED[kind], k) ? RETIRED[kind][k] + '. ' : '';
        fail(at, 'has no key "' + k + '" — ' + retired + kind + ' keys (ROSTER_KEYS.' + kind + '): ' + names.join(', ') + '.');
    });
    const out = {};
    table.forEach((row) => {
        const where = at + '.' + row.key;
        if (!has(raw, row.key)) {
            if (row.required) {
                fail(at, 'is missing required key "' + row.key + '" (' + row.type + ')' + (row.missing ? ': ' + row.missing : '') +
                    ' — ' + kind + ' keys (ROSTER_KEYS.' + kind + '): ' + names.join(', ') + '.');
            }
            out[row.key] = row.default;
            return;
        }
        const v = raw[row.key];
        if (!row.child) { out[row.key] = row.check(v, where, ctx); return; }
        if (row.many) {
            if (!Array.isArray(v)) { fail(where, 'must be a list of ' + row.child + ' (got ' + JSON.stringify(v) + ').'); }
            out[row.key] = Object.freeze(v.map((item, i) => ferry(row.child, item, where + '[' + i + ']', ctx)));
        } else {
            out[row.key] = v === null ? null : ferry(row.child, v, where, ctx);
        }
    });
    return Object.freeze(out);
}

/** The effective mode of a card on its scene row: the one named (declared), else the row's default; null on a
 *  single-mode row. An undeclared mode throws. */
function effectiveCardMode(row, modeId, at) {
    const ids = row.modes.map((m) => m.id);
    const eff = (modeId !== null && modeId !== undefined) ? modeId : (ids.length > 0 ? ids[0] : null);
    if (eff !== null && ids.indexOf(eff) === -1) {
        fail(at, 'names mode "' + eff + '" of scene "' + row.id + '", which declares [' + ids.join(', ') + '].');
    }
    return ids.length > 1 ? eff : null;
}

/**
 * @param {*} json   the parsed roster JSON
 * @param {string} href  the absolute URL the roster was read from (its scene sources resolve against it)
 * @returns {object} the full, deep-frozen bag: every ROSTER_KEYS key, plus `href`
 * @throws {Error} naming the kind, the key and the table
 */
export function normalizeRoster(json, href) {
    const hrefWhy = rosterHrefRefusalOf(href);
    if (hrefWhy) { throw new Error('[roster] normalizeRoster(json, href): ' + hrefWhy + ' (FAIL-LOUD.)'); }
    const ferried = ferry('roster', json, 'roster', { href });

    const byId = new Map();
    ferried.rows.forEach((row, i) => {
        if (byId.has(row.id)) { fail('roster.rows[' + i + '].id', '"' + row.id + '" is declared twice; a scene id is unique.'); }
        byId.set(row.id, row);
        const modeIds = new Set();
        row.modes.forEach((m, j) => {
            if (modeIds.has(m.id)) { fail('roster.rows[' + i + '].modes[' + j + '].id', '"' + m.id + '" is declared twice in scene "' + row.id + '".'); }
            modeIds.add(m.id);
        });
    });
    if (ferried.firstContact !== null && !byId.has(ferried.firstContact)) {
        fail('roster.firstContact', '"' + ferried.firstContact + '" is not a declared scene id — declared: [' + [...byId.keys()].join(', ') + '].');
    }

    let showcase = ferried.showcase;
    if (showcase !== null) {
        const seen = new Set();
        const invite = showcase.invite === null ? null : segText(showcase.invite);
        const introParas = showcase.intro === null ? [] : showcase.intro.paragraphs;
        if (showcase.throughLine !== null) {
            const through = segText(showcase.throughLine);
            introParas.forEach((para, i) => {
                if (Array.isArray(para) && segText(para).indexOf(through) !== -1) {
                    fail('roster.showcase.intro.paragraphs[' + i + ']', 'pastes showcase.throughLine — the through-line has one place.');
                }
            });
        }
        const cards = showcase.rows.map((card, i) => {
            const at = 'roster.showcase.rows[' + i + ']';
            const row = byId.get(card.id);
            if (!row) { fail(at + '.id', '"' + card.id + '" is not a declared scene id — declared: [' + [...byId.keys()].join(', ') + '].'); }
            const mode = effectiveCardMode(row, card.mode, at + '.mode');
            const pair = card.id + ':' + mode;
            if (seen.has(pair)) { fail(at, 'repeats the card ' + pair + '; a scene and mode have one card.'); }
            seen.add(pair);
            ['what', 'why', 'how', 'controls'].forEach((p) => {
                const part = card[p];
                if (part === null) { return; }
                if (invite !== null && part.indexOf(invite) !== -1) {
                    fail(at + '.' + p, 'pastes showcase.invite — the card appends it by reference.');
                }
                introParas.forEach((para, j) => {
                    if (Array.isArray(para) && part.indexOf(segText(para)) !== -1) {
                        fail(at + '.' + p, 'pastes showcase.intro paragraph ' + j + ' — the intro\'s text has one place.');
                    }
                });
            });
            return Object.freeze(Object.assign({}, card, { mode }));
        });
        showcase = Object.freeze(Object.assign({}, showcase, { rows: Object.freeze(cards) }));
    }

    const bag = Object.freeze(Object.assign({}, ferried, { showcase, href }));
    BAGS.add(bag);
    bag.rows.forEach((row) => OWNER.set(row, bag));
    return bag;
}

// ── Bag and member checks ────────────────────────────────────────────────────

function describe(v) {
    if (v === undefined) { return 'undefined'; }
    if (typeof v === 'string') { return 'the string ' + JSON.stringify(v); }
    if (v === null || typeof v !== 'object') { return String(v); }
    return 'an object that normalizeRoster did not return';
}

/**
 * @param {*} roster
 * @param {string} signature  the calling function's signature, e.g. 'walkthroughById(roster, id)'
 * @returns {object} roster
 * @throws {Error} naming the signature when `roster` is not a bag normalizeRoster returned
 */
export function assertRosterBag(roster, signature) {
    if (!BAGS.has(roster)) {
        throw new Error('[roster] ' + signature + ' takes a roster bag first (normalizeRoster(json, href), or loadRoster ' +
            'from roster-link.js); got ' + describe(roster) + '. (FAIL-LOUD.)');
    }
    return roster;
}

function assertSceneRow(row, signature, roster) {
    const owner = OWNER.get(row);
    if (!owner || owner.rows.indexOf(row) === -1 || (roster && owner !== roster)) {
        throw new Error('[roster] ' + signature + ' takes a scene row of ' + (roster ? 'that' : 'a normalized') +
            ' roster bag (walkthroughById(roster, id)); got ' + describe(row) + '. (FAIL-LOUD.)');
    }
    return row;
}

function assertCard(roster, card, signature) {
    if (roster.showcase === null || roster.showcase.rows.indexOf(card) === -1) {
        throw new Error('[roster] ' + signature + ' takes a card of roster.showcase.rows from the same bag (exhibitFor(roster, scene)); got ' +
            JSON.stringify(card && { id: card.id, mode: card.mode }) + '. (FAIL-LOUD.)');
    }
    return card;
}

/**
 * @param {string} href
 * @returns {string|null} why `href` cannot be a roster URL, or null
 */
export function rosterHrefRefusalOf(href) {
    if (typeof href !== 'string' || href === '') { return 'a roster href is an absolute URL string (got ' + JSON.stringify(href) + ').'; }
    let u = null;
    try { u = new URL(href); } catch (e) { u = null; }
    if (u === null) {
        return 'roster href ' + JSON.stringify(href) + ' is relative; it must be absolute (https://…): inside the DeSciX ' +
            'store shell (descix.net) a relative or root-relative href such as /assets/… resolves against the daita app, ' +
            'not this app\'s media.';
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:' && u.protocol !== 'file:') {
        return 'roster href ' + JSON.stringify(href) + ' has scheme ' + u.protocol + '; a roster is read over http(s), or file: in node.';
    }
    if (href.indexOf('?') !== -1 || href.indexOf('#') !== -1) {
        return 'roster href ' + JSON.stringify(href) + ' carries a query or a hash; a roster URL is a plain file URL.';
    }
    return null;
}

/**
 * @param {object} roster
 * @param {object} row  a scene row of `roster`
 * @returns {string} the absolute URL of the row's scene file
 */
export function sceneUrlOf(roster, row) {
    assertRosterBag(roster, 'sceneUrlOf(roster, row)');
    assertSceneRow(row, 'sceneUrlOf(roster, row)', roster);   // its source passed sourceRefusalOf at normalize
    return new URL(row.source, roster.href).href;
}

// ── Scene rows ───────────────────────────────────────────────────────────────

/** @returns {object|null} the scene row with `id`, or null */
export function walkthroughById(roster, id) {
    assertRosterBag(roster, 'walkthroughById(roster, id)');
    for (let i = 0; i < roster.rows.length; i++) { if (roster.rows[i].id === id) { return roster.rows[i]; } }
    return null;
}

/** @returns {ReadonlyArray<object>} the row's declared modes; the first is its default ([] on a single-mode row) */
export function walkthroughModes(row) {
    return assertSceneRow(row, 'walkthroughModes(row)').modes;
}

/** @returns {string|null} the row's default mode id, or null when it declares none */
export function defaultWalkthroughModeId(row) {
    const modes = assertSceneRow(row, 'defaultWalkthroughModeId(row)').modes;
    return modes.length > 0 ? modes[0].id : null;
}

/**
 * THE derivation of the renderState a row loads in a mode: the mode's delta over the row's bag, normalized.
 * Scalar keys: the delta wins where it declares one. `render` rows: the row's, then the mode's (a later row wins
 * on replay). `modeId` null or undefined → the default mode.
 * @throws {Error} an undeclared mode, naming the row and its declared list
 */
export function effectiveRenderState(row, modeId) {
    const modes = assertSceneRow(row, 'effectiveRenderState(row, modeId)').modes;
    let entry = null;
    if (modeId === undefined || modeId === null) {
        entry = modes.length > 0 ? modes[0] : null;
    } else {
        entry = modes.find((m) => m.id === modeId) || null;
        if (!entry) {
            throw new Error('[roster] scene "' + row.id + '" has no mode "' + modeId + '" — declared modes: [' +
                modes.map((m) => m.id).join(', ') + ']. (FAIL-LOUD.)');
        }
    }
    const base = row.renderState;
    const delta = (entry && entry.renderState) || {};
    const merged = Object.assign({}, base, delta);
    merged.render = base.render.concat(Array.isArray(delta.render) ? delta.render : []);
    return normalizeSavedRenderState(merged);
}

/** @returns {boolean} whether the scene `id` loads the three (3D) renderer in `modeId`; false for an id the roster
 *  does not declare. An undeclared mode of a declared id throws. */
export function walkthroughIs3D(roster, id, modeId) {
    assertRosterBag(roster, 'walkthroughIs3D(roster, id, modeId)');
    const row = walkthroughById(roster, id);
    if (row === null) { return false; }
    return effectiveRenderState(row, modeId).renderer === 'three';
}

/** @returns {object|null} the scene row STUDIO opens with no deep link; null → the Empty Universe */
export function firstContactOf(roster) {
    assertRosterBag(roster, 'firstContactOf(roster)');
    return roster.firstContact === null ? null : walkthroughById(roster, roster.firstContact);
}

/**
 * THE scene list both views show: the showcase group first (its cards, in order, each by its card title) when the
 * roster has a showcase, then every scene row in order under its group (consecutive rows of one group share it).
 * @returns {Array<{label: string, rows: Array<{id: string, title: string}>}>} a new array on every call
 */
export function sceneGroups(roster) {
    assertRosterBag(roster, 'sceneGroups(roster)');
    const groups = [];
    if (roster.showcase !== null) {
        groups.push({ label: roster.showcase.group, rows: roster.showcase.rows.map((c) => ({ id: c.id, title: c.title })) });
    }
    const lead = groups.length;
    roster.rows.forEach((r) => {
        let last = groups[groups.length - 1];
        if (groups.length === lead || last.label !== r.group) { groups.push({ label: r.group, rows: [] }); last = groups[groups.length - 1]; }
        last.rows.push({ id: r.id, title: r.title });
    });
    return groups;
}

/**
 * How the MOVE/LOOK pads work, shown on every 3D showcase scene's card. The claims are CameraControls.js's
 * contract (MOVE pad and W/A/S/D translate, LOOK pad and the arrow keys rotate; mouse and touch both drive the pads).
 */
export const JOYSTICK_EXPLAINER = Object.freeze([
    Object.freeze([
        'Move and Look: this scene is 3D. Drag the MOVE pad (bottom left) to walk the camera forward, back ' +
        'and sideways, and the LOOK pad (bottom right) to turn it. Both pads take a finger on a phone or ' +
        'the mouse on a desktop; on a keyboard, W/A/S/D move and the arrow keys look.',
    ]),
]);

// ── Showcase ─────────────────────────────────────────────────────────────────

function sceneModeOf(roster, scene, signature) {
    assertRosterBag(roster, signature);
    if (!scene || typeof scene !== 'object') {
        throw new Error('[roster] ' + signature + ' takes a scene { id, modeId? }; got ' + describe(scene) + '. (FAIL-LOUD.)');
    }
    if (has(scene, 'kind')) {
        throw new Error('[roster] ' + signature + ': a scene has no kind — pass { id, modeId? }. (FAIL-LOUD.)');
    }
    const row = walkthroughById(roster, scene.id);
    if (!row) {
        throw new Error('[roster] ' + signature + ': "' + scene.id + '" is not a declared scene — declared: [' +
            roster.rows.map((r) => r.id).join(', ') + ']. (FAIL-LOUD.)');
    }
    return effectiveCardMode(row, scene.modeId, signature + ' modeId');
}

/** @returns {object|null} the card of `scene` ({ id, modeId? }) at its effective mode, or null when the showcase
 *  has none. An undeclared scene or mode throws. */
export function exhibitFor(roster, scene) {
    const mode = sceneModeOf(roster, scene, 'exhibitFor(roster, scene)');
    if (roster.showcase === null) { return null; }
    return roster.showcase.rows.find((c) => c.id === scene.id && c.mode === mode) || null;
}

/** @returns {string} the run-once seen-key of a scene: its id and, on a multi-mode row, its effective mode */
export function sceneKey(roster, scene) {
    const mode = sceneModeOf(roster, scene, 'sceneKey(roster, scene)');
    return 'scene-rung-' + scene.id + (mode ? '-' + mode : '');
}

/**
 * The run-once card of a showcase card: title, then what, why, how, controls when present, the JOYSTICK_EXPLAINER on
 * a 3D scene, and the showcase's invite last when it has one.
 * @returns {{id: string, modeId: string|null, seenKey: string, title: string, paragraphs: Array, is3D: boolean}}
 */
export function showcaseCard(roster, card) {
    assertRosterBag(roster, 'showcaseCard(roster, card)');
    assertCard(roster, card, 'showcaseCard(roster, card)');
    const is3D = walkthroughIs3D(roster, card.id, card.mode);
    let paragraphs = ['what', 'why', 'how'].map((p) => Object.freeze([card[p]]));
    if (card.controls !== null) { paragraphs = paragraphs.concat([Object.freeze([card.controls])]); }
    if (is3D) { paragraphs = paragraphs.concat(JOYSTICK_EXPLAINER); }
    if (roster.showcase.invite !== null) { paragraphs = paragraphs.concat([roster.showcase.invite]); }
    return Object.freeze({
        id: card.id, modeId: card.mode,
        seenKey: sceneKey(roster, { id: card.id, modeId: card.mode }),
        title: card.title,
        paragraphs: Object.freeze(paragraphs),
        is3D,
    });
}

/** @returns {object|null} the showcase's run-once intro { seenKey, title, paragraphs }, or null */
export function showcaseIntro(roster) {
    assertRosterBag(roster, 'showcaseIntro(roster)');
    return roster.showcase === null ? null : roster.showcase.intro;
}

/** The IDE surface a showcase tile opens: STUDIO (presets.js PRESETS.author). */
const SHOWCASE_SURFACE = 'author';

/** @returns {string} the card's link relative to the serving site's root: STUDIO at the card's scene and mode */
export function showcaseHref(roster, card) {
    assertRosterBag(roster, 'showcaseHref(roster, card)');
    assertCard(roster, card, 'showcaseHref(roster, card)');
    const params = new URLSearchParams();
    params.set('preset', SHOWCASE_SURFACE);
    params.set('walkthrough', card.id);
    if (card.mode !== null) { params.set('mode', card.mode); }
    return STATIC_APP_PAGE + '?' + params.toString();
}

/** @returns {string} the same link, absolute on roster.showcase.siteOrigin */
export function showcaseUrl(roster, card) {
    assertRosterBag(roster, 'showcaseUrl(roster, card)');
    const rel = showcaseHref(roster, card);
    return new URL(rel, roster.showcase.siteOrigin + '/').href;
}
