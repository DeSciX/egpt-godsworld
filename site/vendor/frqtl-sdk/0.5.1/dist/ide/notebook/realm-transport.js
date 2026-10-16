/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module realm-transport
 * @description
 * Transport abstraction a realm pre-load's `boot(hostEl, transport)` receives.
 *
 * ONE transport, **in-app**: same-origin direct scripting. The descriptor may ignore
 * `post`/`subscribe` and script the realm env directly. The transport is a
 * `kind:'in-app'` marker + an in-memory pub/sub channel.
 *
 * The transport object shape a descriptor's `boot()` receives:
 * ```js
 * {
 *   kind: 'in-app',
 *   post(message): void,           // send a control/data message
 *   subscribe(handler): unsubFn,   // receive messages from the realm
 *   isInApp(): boolean             // convenience check
 * }
 * ```
 *
 * Cell code NEVER branches on transport — it sees only the frozen `ViewHandle`.
 */

/**
 * @typedef {object} RealmTransport
 * @property {'in-app'} kind — transport mode.
 * @property {(message: object) => void} post — send a message across the seam.
 * @property {(handler: Function) => Function} subscribe
 *   Register a message handler; returns an unsubscribe function.
 * @property {() => boolean} isInApp — returns `true` for in-app transports.
 */

'use strict';

/**
 * Create the in-app (same-origin) transport.
 *
 * `post`/`subscribe` are a trivial in-memory pub/sub channel so a descriptor
 * written transport-agnostically still works. A descriptor that scripts its
 * env directly may call `isInApp()` and skip them.
 *
 * @returns {RealmTransport}
 *
 * @example
 * import { inAppTransport } from 'lib/shim/notebook/realm-transport.js';
 * const transport = inAppTransport();
 * const { handle } = myDescriptor.boot(hostEl, transport);
 */
export function inAppTransport() {
    var handlers = [];
    return {
        kind: 'in-app',
        isInApp: function () { return true; },
        post: function (message) {
            // Direct dispatch — same window, synchronous. (A descriptor that scripts
            // its env directly need not use this.)
            for (var i = 0; i < handlers.length; i++) {
                try { handlers[i](message); } catch (e) { /* observer error is not the sender's */ }
            }
        },
        subscribe: function (handler) {
            if (typeof handler !== 'function') {
                throw new Error('[realm-transport:in-app] subscribe requires a function.');
            }
            handlers.push(handler);
            return function () {
                var idx = handlers.indexOf(handler);
                if (idx !== -1) { handlers.splice(idx, 1); }
            };
        }
    };
}
