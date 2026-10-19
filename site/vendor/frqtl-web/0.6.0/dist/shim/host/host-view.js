/* Copyright 2023-2026 by Essam Abadir */

/**
 * host-view.js — the ONE declarer of the DeSciX host view for an app DOCUMENT.
 *
 * A DeSciX shell hosts the app beside its chat (SplitView, its default) unless the app asks for
 * another view. This module asks — once, through the app-side SDK (`DeSciXAppSDK.js`, vendored
 * by the publisher beside the page) — and RECORDS on `document.documentElement.dataset.descixView`
 * which host state it met. The mode is a parameter; the policy lives at the call site.
 *
 * Every host state is a row of HOST_VIEW_OUTCOMES. No row throws and no row writes to
 * console.error: the page's job is physics and layout is the host's, so a missing host is a
 * truthful record, never a crash and never a cry-wolf console line. Whether an absence is
 * LEGITIMATE is decided by a gate at the plane that knows (FRAQTL's static URL gate, egpt-frqtl's
 * refresh-site refusal), not here.
 *
 * Two SDK rules shape the order of operations:
 *   - The SDK's `view` getter console.errors on a standalone page AND on a shell that does not
 *     publish `view`. So `view` is read only after `ready()` resolved `mode:'shell'` AND its
 *     `members` list names `view`.
 *   - `view.set()` on a host that renders a bare iframe validates and returns the mode while
 *     nothing moves. `view.available()` is the only instrument that tells the two apart, so it
 *     is consulted here, before `set`, and nowhere else.
 *
 * A caller that names a declared second choice (`fallback`) is answered off the shell's PUBLISHED list,
 * `view.MODES`, read before any `set`: the asked mode when listed, else the fallback when listed (recorded as
 * the `fallback` row, the refusal and the mode set in the detail), else nothing (`unoffered`). A `set` is never
 * retried and never decided by its error: a shell that lists a mode and then refuses it is a contract violation.
 */

/**
 * The app-side SDK file this declarer consumes. It is PUBLISHER-provided: vendored beside the
 * page by the site that publishes the static bundle, never shipped in the bundle.
 */
export const HOST_SDK_SCRIPT = 'DeSciXAppSDK.js';

/**
 * The attribute that declares a file host-provided, on the element that consumes it, in the
 * bytes the browser executes. Both the bundle gate (the file must be ABSENT from the bundle) and
 * the publisher (the file must be PRESENT beside the page) read the set from this attribute.
 */
export const HOST_PROVIDED_ATTR = 'data-frqtl-host-provided';

/**
 * The publisher's front page, beside the IDE entry (router.js::STATIC_APP_PAGE). PUBLISHER-provided
 * like HOST_SDK_SCRIPT: the static build declares it once as `<link rel="home" href=HOST_FRONT_PAGE
 * HOST_PROVIDED_ATTR>` (apps/ide/vite.config.js), the bundle gate asserts the bundle does not ship
 * it, and lib/features/ide/home-link.js::homeHrefOf reads the declaration back.
 */
export const HOST_FRONT_PAGE = 'index.html';

/** The closed table of host states. `setCalls` is how many times `view.set` runs in that row. */
export const HOST_VIEW_OUTCOMES = Object.freeze([
    { id: 'pending', setCalls: 0,
      means: 'awaiting DeSciX.ready(); a ready() that never settles stays here' },
    { id: 'requested', setCalls: 1,
      means: 'shell listening: view.available() true and view.set(mode) returned mode; recorded as requested:<mode>' },
    { id: 'fallback', setCalls: 1,
      means: 'shell listening; view.MODES lacks the asked mode and offers the caller\'s declared fallback: view.set(fallback) returned it; recorded as fallback:<asked mode>, the refusal and the mode set in dataset.descixViewDetail' },
    { id: 'unoffered', setCalls: 0,
      means: 'shell listening; view.MODES offers neither the asked mode nor the declared fallback; recorded as unoffered:<asked mode>, the list in dataset.descixViewDetail' },
    { id: 'not-listening', setCalls: 0,
      means: 'shell publishes view but view.available() is false (bare-iframe host); the host owns the layout' },
    { id: 'view-unpublished', setCalls: 0,
      means: 'shell resolved, but its members do not include view' },
    { id: 'standalone', setCalls: 0,
      means: 'ready() resolved standalone: this page is the top window, no shell above it' },
    { id: 'embedded-no-bridge', setCalls: 0,
      means: 'this page is framed and no ancestor carries a readable bus (the SDK rejects ready() here today)' },
    { id: 'sdk-absent', setCalls: 0,
      means: 'window.DeSciX is undefined: the publisher-provided DeSciXAppSDK.js is not beside this page' },
    { id: 'contract-violated', setCalls: null,
      means: 'the SDK or host broke its published shape; the edge is named in dataset.descixViewDetail (CONTRACT_VIOLATIONS)' },
].map(Object.freeze));

/** The closed edges of `contract-violated`, each with its own `view.set` call count. */
export const CONTRACT_VIOLATIONS = Object.freeze({
    'no-ready':           Object.freeze({ setCalls: 0, means: 'window.DeSciX has no ready() function' }),
    'ready-rejected':     Object.freeze({ setCalls: 0, means: 'ready() rejected while the SDK reports a mode other than embedded-no-bridge' }),
    'ready-unknown-mode': Object.freeze({ setCalls: 0, means: 'ready() resolved a mode that is not shell, standalone or embedded-no-bridge' }),
    'ready-no-members':   Object.freeze({ setCalls: 0, means: 'ready() resolved shell without a members array' }),
    'view-listed-absent': Object.freeze({ setCalls: 0, means: 'members names view but the view getter returned nothing' }),
    'view-no-available':  Object.freeze({ setCalls: 0, means: 'view has no available() function' }),
    'view-no-set':        Object.freeze({ setCalls: 0, means: 'view has no set() function' }),
    'available-threw':    Object.freeze({ setCalls: 0, means: 'view.available() threw' }),
    'view-no-modes':      Object.freeze({ setCalls: 0, means: 'a fallback was given but view.MODES is not published' }),
    'set-threw':          Object.freeze({ setCalls: 1, means: 'view.set(mode) threw (or view.set(fallback), the mode view.MODES offered)' }),
    'set-returned-other': Object.freeze({ setCalls: 1, means: 'view.set(mode) returned something other than the mode it was asked for' }),
});

const ROW_IDS = new Set(HOST_VIEW_OUTCOMES.map((r) => r.id));

function messageOf(e) {
    return (e && e.message) ? String(e.message) : String(e);
}

/**
 * Write a row to the document record. Refuses (throws) a row or edge the tables do not list:
 * that is a defect in THIS module, never a host state.
 */
function record(root, row, { suffix = '', detail } = {}) {
    if (!ROW_IDS.has(row)) { throw new Error(`host-view: '${row}' is not a HOST_VIEW_OUTCOMES row`); }
    const value = row + suffix;
    if (root) {
        root.dataset.descixView = value;
        if (detail === undefined) { delete root.dataset.descixViewDetail; } else { root.dataset.descixViewDetail = detail; }
    }
    return detail === undefined ? { row, record: value } : { row, record: value, detail };
}

function violated(root, edge, specifics) {
    if (!Object.prototype.hasOwnProperty.call(CONTRACT_VIOLATIONS, edge)) {
        throw new Error(`host-view: '${edge}' is not a CONTRACT_VIOLATIONS edge`);
    }
    return record(root, 'contract-violated', { detail: `${edge}: ${specifics}` });
}

/** The SDK's own live mode, read without touching any member getter. */
function liveMode(sdk) {
    try { return sdk.mode; } catch (e) { return undefined; }
}

/**
 * Ask the host for `mode`, once, and record which host state was met.
 *
 * @param {object} args
 * @param {object|undefined} args.sdk  the app-side SDK object (`window.DeSciX`), or undefined
 * @param {string} args.mode           the view to ask for: a mode the shell's `view.MODES` offers
 * @param {string} [args.fallback]     the caller's declared second choice, asked only when `view.MODES` does not
 *                                     offer `mode` (a non-empty string other than `mode`)
 * @param {{dataset: object}} [args.root] where the record is written; defaults to
 *                                     `document.documentElement` when a document exists
 * @returns {Promise<{row: string, record: string, detail?: string}>}
 */
export async function declareHostView({ sdk, mode, fallback, root } = {}) {
    if (typeof mode !== 'string' || mode === '') {
        throw new TypeError(`host-view: declareHostView needs a view mode string (got ${JSON.stringify(mode)})`);
    }
    if (fallback !== undefined && (typeof fallback !== 'string' || fallback === '' || fallback === mode)) {
        throw new TypeError(`host-view: a fallback is a non-empty view mode string other than mode ${JSON.stringify(mode)} (got ${JSON.stringify(fallback)})`);
    }
    const target = root || (typeof document !== 'undefined' ? document.documentElement : null);

    if (sdk === undefined || sdk === null) { return record(target, 'sdk-absent'); }
    if (typeof sdk.ready !== 'function') {
        return violated(target, 'no-ready', `window.DeSciX is a ${typeof sdk} without ready()`);
    }

    record(target, 'pending');
    let ready;
    try {
        ready = await sdk.ready();
    } catch (e) {
        const now = liveMode(sdk);
        if (now === 'embedded-no-bridge') {
            return record(target, 'embedded-no-bridge', { detail: `ready() rejected: ${messageOf(e)}` });
        }
        return violated(target, 'ready-rejected', `SDK mode ${JSON.stringify(now)}; ${messageOf(e)}`);
    }

    const resolved = ready && ready.mode;
    if (resolved === 'standalone') { return record(target, 'standalone'); }
    if (resolved === 'embedded-no-bridge') { return record(target, 'embedded-no-bridge'); }
    if (resolved !== 'shell') {
        return violated(target, 'ready-unknown-mode', `ready() resolved mode ${JSON.stringify(resolved)}`);
    }
    if (!Array.isArray(ready.members)) {
        return violated(target, 'ready-no-members', 'ready() resolved shell without a members array');
    }
    if (!ready.members.includes('view')) {
        return record(target, 'view-unpublished', { detail: `members: ${ready.members.join(',')}` });
    }

    const view = sdk.view;
    if (!view) { return violated(target, 'view-listed-absent', 'members names view; the getter returned ' + String(view)); }
    if (typeof view.available !== 'function') { return violated(target, 'view-no-available', 'view.available is ' + typeof view.available); }
    if (typeof view.set !== 'function') { return violated(target, 'view-no-set', 'view.set is ' + typeof view.set); }

    let listening;
    try {
        listening = view.available();
    } catch (e) {
        return violated(target, 'available-threw', messageOf(e));
    }
    if (!listening) { return record(target, 'not-listening'); }

    // With a declared fallback the published list decides which ONE mode is asked; without one, the asked mode is.
    let ask = mode;
    if (fallback !== undefined) {
        const modes = view.MODES;
        if (!modes || typeof modes !== 'object') {
            return violated(target, 'view-no-modes', 'fallback given but view.MODES is not published (got ' + String(modes) + ')');
        }
        const offered = Object.values(modes);
        const list = '[' + offered.join(', ') + ']';
        if (!offered.includes(mode)) {
            if (!offered.includes(fallback)) {
                return record(target, 'unoffered', { suffix: ':' + mode,
                    detail: `view.MODES ${list} offers neither "${mode}" nor the fallback "${fallback}"` });
            }
            ask = fallback;
        }
        if (ask === fallback) {
            let gotFallback;
            try {
                gotFallback = view.set(fallback);
            } catch (e) {
                return violated(target, 'set-threw', messageOf(e));
            }
            if (gotFallback !== fallback) {
                return violated(target, 'set-returned-other', `asked ${fallback}, set returned ${JSON.stringify(gotFallback)}`);
            }
            return record(target, 'fallback', { suffix: ':' + mode,
                detail: `refused: "${mode}" is not in view.MODES ${list}; set: ${fallback}` });
        }
    }

    let got;
    try {
        got = view.set(ask);
    } catch (e) {
        return violated(target, 'set-threw', messageOf(e));
    }
    if (got !== ask) {
        return violated(target, 'set-returned-other', `asked ${ask}, set returned ${JSON.stringify(got)}`);
    }
    return record(target, 'requested', { suffix: ':' + ask });
}
