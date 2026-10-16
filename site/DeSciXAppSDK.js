/**
 * DeSciXAppSDK.js — the APP side of the DeSciX bridge.
 *
 * !!! GENERATED FILE — DO NOT EDIT !!!
 * Source:    @descix/app-sdk templates/DeSciXAppSDK.template.js
 *            + src/util/bridgeResolver.js (inlined below)
 * Regenerate: node descix-app-sdk/scripts/generate-app-sdk-copies.js
 * Verify:     node descix-app-sdk/scripts/generate-app-sdk-copies.js --check
 * A hand-edit here is drift by construction and the --check gate will fail loud.
 *
 * ── What this file gives you ─────────────────────────────────────────────────
 * One object, `DeSciX`, that works the same whether your page is embedded in the
 * DeSciX App Shell, nested deeper inside it, or opened standalone:
 *
 *     await DeSciX.ready();                      // is the shell's bus there?
 *     DeSciX.view.set('CodeSite');               // ask for the whole frame
 *     if (DeSciX.chat.available()) { … }         // can chat take an attachment now?
 *     await DeSciX.chat.sendMedia({ … });        // hand the model something to look at
 *     await DeSciX.call('some_command', { … });  // call the platform through the shell
 *
 * You never write `window.parent.` or `window.top.` — that hop is DETECTED, not
 * declared. The shell publishes its bus on its own window, so the correct level
 * depends on how deeply your app happens to be embedded, which your code cannot
 * know and should not have to. `resolveBridge()` below answers it on every access.
 *
 * Standalone is a first-class case, not a failure: with no shell above you,
 * `DeSciX.ready()` resolves `{ mode: 'standalone' }` (it does not hang), and
 * `DeSciX.view` / `DeSciX.chat` report their absence by name instead of throwing.
 */

window.DeSciX = (() => {
    'use strict';

/* ── inlined from @descix/app-sdk src/util/bridgeResolver.js ─────────────── */
    /**
     * Hard ceiling on the frame-chain walk. A malformed or hostile frame graph must not
     * be able to spin the resolver; 32 is far beyond any real embedding depth.
     */
    const BRIDGE_RESOLUTION_MAX_HOPS = 32;

    /**
     * Does this window carry the shell's bus?
     *
     * @param {Window} w
     * @returns {object|null} the bus, or null when absent OR unreadable (cross-origin).
     */
    function busOn(w) {
      try {
        const bus = w && w.DeSciX;
        // The version marker, not merely a `DeSciX` property: an app-side proxy also
        // lives at `window.DeSciX`, and only the OWNER publishes `bridge.version`.
        if (bus && bus.bridge && bus.bridge.version) return bus;
      } catch (e) {
        // Cross-origin ancestor. Not the shell as far as we can ever know — and not an
        // error: the walk continues past it (see the docblock).
      }
      return null;
    }

    /**
     * Find the window carrying the DeSciX bus, walking up from `startWindow`.
     *
     * This is the ONE place the `self` / `parent` / `top` question is answered. Consumers
     * ask for the bus, never for a window level.
     *
     * @param {Window} [startWindow] - defaults to the ambient `window`.
     * @returns {{window: Window|null, bus: object|null, hops: number, mode: 'shell'|'standalone'|'embedded-no-bridge'}}
     *   `mode: 'shell'`              — `hops` = frames traversed (0 = this page owns the bus).
     *   `mode: 'standalone'`         — `bus: null`, `hops: -1`; this window is `top`, no shell exists.
     *   `mode: 'embedded-no-bridge'` — `bus: null`, `hops: -1`; this window IS framed but no
     *                                   ancestor carried a readable bus. A shell may be above and
     *                                   unreadable (cross-origin), or there may be no shell above.
     *                                   The resolver cannot distinguish those and does not claim to.
     */
    function resolveBridge(startWindow) {
      const start =
        startWindow || (typeof window === 'undefined' ? null : window);

      // No DOM at all (SSR / node): there is no frame chain, so this is standalone in the
      // strict sense the mode now carries. Never throws.
      if (!start) return { window: null, bus: null, hops: -1, mode: 'standalone' };

      let w = start;
      for (let hops = 0; hops <= BRIDGE_RESOLUTION_MAX_HOPS; hops++) {
        const bus = busOn(w);
        if (bus) return { window: w, bus, hops, mode: 'shell' };

        let next;
        try {
          next = w.parent;
        } catch (e) {
          // Even `.parent` can be refused in exotic sandboxes. Nothing above is
          // reachable, so the answer is standalone rather than a throw.
          break;
        }
        // `window.parent === window` at the top of the chain: that is the terminator.
        if (!next || next === w) break;
        w = next;
      }

      // No ancestor carried the bus. WHICH no-bus state this is turns on one question the
      // resolver can always answer, even across origins: is this window framed at all?
      return { window: start, bus: null, hops: -1, mode: noBusMode(start) };
    }

    /**
     * `standalone` when this window is the TOP of its chain; `embedded-no-bridge` when it is framed
     * but nothing above carried a readable bus.
     *
     * "Am I the top?" has TWO equivalent answers in a real browser — `top === self` and
     * `parent === self` — and this asks both, preferring `top`, because they are not equally
     * available. `window.top` is a direct reference and comparing it to `self` is an identity check,
     * not a property read, so it does not throw across origins: that is what makes the distinction
     * free. But `top` is not guaranteed to EXIST on every window-like object the resolver is handed
     * (measured 2026-08-27: this module's own test fixtures model a window as `{ parent: self }`
     * with no `top` at all, and an implementation that read only `top` called those genuine top
     * windows "framed"). `parent === self` is the same fact and is how the walk above already
     * terminates, so it is the honest fallback rather than a second derivation.
     *
     * A window so sandboxed that BOTH reads throw is reported `embedded-no-bridge`: a window that
     * cannot see its own top or parent is certainly not demonstrably the top, and claiming
     * `standalone` there would assert something never established.
     */
    function noBusMode(w) {
      try {
        if (w.top !== undefined && w.top !== null) return w.top === w ? 'standalone' : 'embedded-no-bridge';
      } catch (e) {
        return 'embedded-no-bridge';
      }
      try {
        const p = w.parent;
        return !p || p === w ? 'standalone' : 'embedded-no-bridge';
      } catch (e) {
        return 'embedded-no-bridge';
      }
    }
/* ── end inlined resolver ───────────────────────────────────────────────── */

    // ── Never clobber an owner ───────────────────────────────────────────────
    // If the bus resolves at hop 0, THIS page published it: the page is the shell
    // (or a host that already ran @descix/app-sdk), and `window.DeSciX` is already
    // the real thing. Overwriting it with an app-side proxy would delete the owner's
    // bus — every member, and the marker every embedded app resolves against. So we
    // hand back the very same object: the assignment below becomes an identity no-op.
    const owned = resolveBridge();
    if (owned.hops === 0) return owned.bus;

    // Otherwise resolution is LIVE — recomputed at each access, never captured at
    // load time. The shell renders this iframe, but script order is not a contract:
    // a snapshot taken while the shell was still mounting would pin this app to
    // "standalone" forever, which is precisely the stale-capture failure this file
    // exists to end. (A self-reference is harmless: the proxy carries no `bridge`
    // marker, so the resolver walks straight past it to the real owner.)

    /**
     * Readiness, without polling.
     *
     * Resolve immediately when the bus is already published; otherwise wait for the
     * shell's `descix:bridge-ready` announcement on the window that owns it. An app
     * with no shell above it resolves as standalone rather than waiting for a bridge
     * that is never coming — an app that hangs forever is indistinguishable from an
     * app that is broken, and it can no longer take the standalone path it may well
     * support.
     *
     * @returns {Promise<{mode: string, members: string[], version: number|null}>}
     */
    const ready = () => new Promise((resolve) => {
        const found = resolveBridge();

        if (found.mode === 'standalone') {
            resolve({ mode: 'standalone', members: [], version: null });
            return;
        }

        const snapshot = () => {
            const now = resolveBridge();
            if (now.mode === 'standalone') return { mode: 'standalone', members: [], version: null };
            return {
                mode: 'shell',
                version: now.bus.bridge ? now.bus.bridge.version : null,
                members: now.bus.bridge ? now.bus.bridge.members() : Object.keys(now.bus),
            };
        };

        if (found.bus.bridge && found.bus.bridge.ready) {
            resolve(snapshot());
            return;
        }

        const evtName = (found.bus.bridge && found.bus.bridge.EVENT) || 'descix:bridge-ready';
        const onReady = () => {
            found.window.removeEventListener(evtName, onReady);
            resolve(snapshot());
        };
        found.window.addEventListener(evtName, onReady);
    });

    /**
     * Read a member off the shell's bus, or explain its absence in plain language.
     *
     * Three distinct situations, three distinct messages — collapsing them into one
     * "undefined" is what sent app authors hunting through frame levels:
     *   - no shell at all (standalone / cross-origin): a capability you do not have here;
     *   - shell present, member absent: this host does not implement it;
     *   - shell present, member present: you get it.
     */
    const member = (name, why) => {
        const found = resolveBridge();

        if (found.mode === 'standalone') {
            console.error(
                `[DeSciX SDK] DeSciX.${name} is unavailable: no DeSciX App Shell was found ` +
                `above this page (running standalone, or the shell is cross-origin). ${why}`
            );
            return null;
        }

        const api = found.bus[name];
        if (!api) {
            console.error(
                `[DeSciX SDK] DeSciX.${name} is not published by this host. ${why} ` +
                `Await DeSciX.ready() before first use; if it is still absent afterwards, this host does not implement it.`
            );
            return null;
        }
        return api;
    };

    /** Read a plain (non-member) property off the bus, or null when there is no shell. */
    const busProp = (name) => {
        const found = resolveBridge();
        return found.mode === 'standalone' ? null : found.bus[name];
    };

    return {
        /** 'shell' when a DeSciX App Shell is hosting this page, else 'standalone'. Live. */
        get mode() { return resolveBridge().mode; },

        /**
         * How many frames up the bus was found: 0 = this page owns it, 1 = the parent
         * (the ordinary embedded case), 2+ = nested, -1 = standalone. Diagnostics only —
         * app code should never branch on it, which is the whole point of this file.
         */
        get bridgeLevel() { return resolveBridge().hops; },

        /** Resolves once the shell's bus is published. See ready() above. */
        ready,

        /** Global application data (Communities, Apps, User Profile). */
        get AppData() { return busProp('AppData'); },

        /** The PWA state machine and navigation. */
        get AppContext() { return busProp('AppContext'); },

        /**
         * Layout control — ask the shell for a view:
         *
         *     DeSciX.view.set('CodeSite');   // this app gets the whole frame
         *     DeSciX.view.set('SplitView');  // this app beside the chat panel (default)
         *     DeSciX.view.set('Chat');       // chat only
         *
         * `DeSciX.view.available()` reports whether a host is actually LISTENING.
         * Check it: on a host that renders a bare iframe, set() validates and returns
         * the mode you asked for while nothing on screen changes, and that success is
         * otherwise indistinguishable from a real one.
         */
        get view() {
            return member('view', 'View switching is a shell capability (this host renders the app frame without a view-aware container).');
        },

        /**
         * Chat contributions — hand the model something to LOOK AT:
         *
         *     await DeSciX.chat.sendMedia(
         *       { mime_type: 'image/png', data: base64Png, label: 'flyby' },
         *       { note: 'what do you see here?' }
         *     );
         *
         * Supply exactly one of `data` (raw base64, NOT a data: URL) or `asset_ref`
         * (a path in this app's own asset space). Resolves
         * `{ delivered, reason?, contribution? }` — `delivered:false` means the chat
         * pane is not mounted, not that the media was bad. Bad media throws, and
         * anything the server refuses is refused by name.
         *
         * `DeSciX.chat.available()` reports whether the ingress can take it right now.
         */
        get chat() {
            return member('chat', 'There is no chat pane here, so there is no conversation to contribute to.');
        },

        /**
         * The shell's Powch wallet bridge — login, logout, sign, send/receive,
         * isAuthenticated(), getAddress(). Published by the App Shell host
         * (postMessage protocol; no Powch internals cross this boundary):
         *
         *     await DeSciX.ready();
         *     if (DeSciX.powch) await DeSciX.powch.login();
         *
         * On successful login the SHELL routes the view (e.g. to the dashboard);
         * the app does not redirect. Null when standalone or when this host
         * publishes no wallet bridge — check before use.
         */
        get powch() {
            return member('powch', 'Wallet auth is a shell capability (this host publishes no Powch bridge).');
        },

        /**
         * Call a platform command through the shell's authenticated session.
         * Throws when there is no shell — a call that cannot possibly be delivered
         * must not resolve as though it were.
         */
        call: (command, params) => {
            const found = resolveBridge();
            if (found.mode === 'standalone') {
                throw new Error(
                    `[DeSciX SDK] DeSciX.call('${command}') requires the DeSciX App Shell: ` +
                    'no shell was found above this page (running standalone, or cross-origin).'
                );
            }
            return found.bus.call(command, params);
        },
    };
})();
