/* Copyright 2023-2026 by Essam Abadir */

/**
 * host-auth.js — the ONE follower of the DeSciX shell's session for an app DOCUMENT.
 *
 * Behind the DeSciX App Shell, `DeSciX.powch.on('auth', cb)` calls `cb` once at once with the current state and then
 * on every change, with `{ signedIn: boolean, address: string|null }`; it returns the unsubscribe
 * (@descix/app-sdk 0.8.0 APP_SHELL_API.md §"DeSciX.powch — identity and wallet"). `DeSciX.powch.login()` opens Powch;
 * on success the SHELL routes itself, so the app never redirects. This module follows that session for a caller and
 * records which host state it met on `document.documentElement.dataset.descixAuth` (a HOST_AUTH_STATES row). The
 * control that shows it, and where, is the call site's policy (lib/features/ide/sign-in.js).
 *
 * Order of operations, from the published contract:
 *   - `powch` is read only after `ready()` resolved `mode:'shell'` AND its `members` names `powch` (the SDK's member
 *     getters console.error where the member is absent — the same rule lib/shim/host/host-view.js follows for `view`).
 *   - `powch` is read off the bus at the point of use (the bus object is replaced when the shell reaches READY), so
 *     `login` is looked up at the tap, never captured at load.
 *
 * A host with no session to follow is a STATE (no SDK, no shell, a shell without Powch), never an error. A host that
 * breaks the published shape is a defect: it THROWS a TypeError naming the contract, and the record says
 * `contract-violated`.
 *
 * Host-neutral ESM with no imports. It is NOT part of the stable host-view entry (that bundle carries host-view.js
 * and device.js only).
 */

/** Where the bridge calls this module relies on are published. */
export const HOST_AUTH_CONTRACT = '@descix/app-sdk 0.8.0 APP_SHELL_API.md §"DeSciX.powch — identity and wallet"';

/** The closed table of host session states. `session` is true where the shell holds a session the app can show. */
export const HOST_AUTH_STATES = Object.freeze([
    { id: 'pending', session: false, means: 'awaiting DeSciX.ready()' },
    { id: 'sdk-absent', session: false, means: 'window.DeSciX is undefined: no publisher-provided DeSciXAppSDK.js beside this page (dev, a plain static host)' },
    { id: 'unmanaged', session: false, means: 'ready() resolved standalone or embedded-no-bridge: no readable shell above this page, nothing to sign into' },
    { id: 'powch-unpublished', session: false, means: 'the shell resolved, but its members do not include powch' },
    { id: 'signed-out', session: true, means: 'powch.on(auth) reported signedIn false' },
    { id: 'signed-in', session: true, means: 'powch.on(auth) reported signedIn true' },
    { id: 'contract-violated', session: false, means: 'the SDK or shell broke the published shape; the edge is in dataset.descixAuthDetail and a TypeError was thrown' },
].map(Object.freeze));

const STATE_IDS = new Set(HOST_AUTH_STATES.map((r) => r.id));

function defaultRoot() {
    return typeof document !== 'undefined' ? document.documentElement : null;
}

function record(root, id, detail) {
    if (!STATE_IDS.has(id)) { throw new Error(`host-auth: '${id}' is not a HOST_AUTH_STATES row`); }
    if (root) {
        root.dataset.descixAuth = id;
        if (detail === undefined) { delete root.dataset.descixAuthDetail; } else { root.dataset.descixAuthDetail = detail; }
    }
    return id;
}

function violation(root, edge) {
    record(root, 'contract-violated', edge);
    return new TypeError(`host-auth: ${edge} — the published contract is ${HOST_AUTH_CONTRACT}. (FAIL-LOUD.)`);
}

function liveMode(sdk) {
    try { return sdk.mode; } catch (e) { return undefined; }
}

/** The auth payload, checked against the published shape. */
function sessionOf(s) {
    if (!s || typeof s !== 'object' || typeof s.signedIn !== 'boolean') {
        return { edge: 'powch.on(auth) delivered ' + JSON.stringify(s) + ', not { signedIn: boolean, address: string|null }' };
    }
    if (!(s.address === null || typeof s.address === 'string')) {
        return { edge: 'powch.on(auth) delivered address ' + JSON.stringify(s.address) + ', not a string or null' };
    }
    return { signedIn: s.signedIn, address: s.address };
}

/**
 * Follow the shell's session. `onState(id, session)` runs on every state change (`session` is
 * `{ signedIn, address }` for the two session rows, else null).
 *
 * @param {object} args
 * @param {object|undefined} args.sdk   the app-side SDK object (`window.DeSciX`), or undefined
 * @param {function(string, ?{signedIn: boolean, address: ?string}): void} args.onState
 * @param {{dataset: object}} [args.root] where the record is written; defaults to `document.documentElement`
 * @returns {{ stop: function(): void, settled: Promise<string> }}  `stop` unsubscribes (idempotent; safe before
 *   ready() settles); `settled` resolves once the subscription is made (with the state the shell's immediate callback
 *   reported, else 'pending', or the non-session row met), and REJECTS with the TypeError on a contract violation.
 */
export function followHostAuth({ sdk, onState, root } = {}) {
    if (typeof onState !== 'function') { throw new TypeError('host-auth: followHostAuth needs an onState(id, session) function'); }
    const target = root || defaultRoot();
    let stopped = false;
    let off = null;
    const emit = (id, session = null, detail) => { if (!stopped) { onState(record(target, id, detail), session); } };
    const stop = () => {
        if (stopped) { return; }
        stopped = true;
        if (off) { const f = off; off = null; f(); }
    };

    if (sdk === undefined || sdk === null) {
        emit('sdk-absent');
        return { stop, settled: Promise.resolve('sdk-absent') };
    }
    if (typeof sdk.ready !== 'function') {
        const err = violation(target, 'window.DeSciX is a ' + typeof sdk + ' without ready()');
        return { stop, settled: Promise.reject(err) };
    }

    emit('pending');
    const settled = (async () => {
        let ready;
        try {
            ready = await sdk.ready();
        } catch (e) {
            if (liveMode(sdk) === 'embedded-no-bridge') { emit('unmanaged', null, 'ready() rejected: ' + (e && e.message)); return 'unmanaged'; }
            throw violation(target, 'ready() rejected while the SDK reports mode ' + JSON.stringify(liveMode(sdk)) + ': ' + (e && e.message));
        }
        const mode = ready && ready.mode;
        if (mode === 'standalone' || mode === 'embedded-no-bridge') { emit('unmanaged', null, 'ready() resolved ' + mode); return 'unmanaged'; }
        if (mode !== 'shell') { throw violation(target, 'ready() resolved mode ' + JSON.stringify(mode)); }
        if (!Array.isArray(ready.members)) { throw violation(target, 'ready() resolved shell without a members array'); }
        if (!ready.members.includes('powch')) {
            emit('powch-unpublished', null, 'members: ' + ready.members.join(','));
            return 'powch-unpublished';
        }
        if (stopped) { return 'pending'; }
        const powch = sdk.powch;
        if (!powch) { throw violation(target, 'members names powch; the getter returned ' + String(powch)); }
        if (typeof powch.on !== 'function') { throw violation(target, 'powch.on is ' + typeof powch.on); }

        let fault = null;
        let first = null;
        const cb = (s) => {
            const got = sessionOf(s);
            if (got.edge) {
                // The shell logs a throwing subscriber and keeps the others running (the published contract).
                fault = violation(target, got.edge);
                if (off) { const f = off; off = null; f(); }
                if (!stopped) { onState('contract-violated', null); }
                throw fault;
            }
            const id = got.signedIn ? 'signed-in' : 'signed-out';
            if (first === null) { first = id; }
            emit(id, got);
        };
        let unsubscribe;
        try {
            unsubscribe = powch.on('auth', cb);
        } catch (e) {
            if (fault) { throw fault; }
            throw violation(target, 'powch.on(auth) threw: ' + (e && e.message));
        }
        if (typeof unsubscribe !== 'function') { throw violation(target, 'powch.on(auth) returned ' + typeof unsubscribe + ', not the unsubscribe function'); }
        off = unsubscribe;
        if (fault) { const f = off; off = null; f(); throw fault; }
        if (stopped) { const f = off; off = null; f(); }
        // The first state is whatever the shell's immediate callback reported; 'pending' until it arrives.
        return first || 'pending';
    })();
    return { stop, settled };
}

/**
 * Open Powch's sign-in through the shell. `powch` and its `login` are read HERE, at the tap.
 * @param {object} sdk  the app-side SDK object (`window.DeSciX`)
 * @returns {Promise<unknown>} what `powch.login()` returns
 * @throws {TypeError} a shell without a powch.login function (the control is only shown on a session row)
 */
export function hostSignIn(sdk) {
    const powch = sdk && sdk.powch;
    if (!powch || typeof powch.login !== 'function') {
        throw new TypeError('host-auth: hostSignIn found no DeSciX.powch.login function at the tap — the published ' +
            'contract is ' + HOST_AUTH_CONTRACT + '. (FAIL-LOUD.)');
    }
    return powch.login();
}
