/**
 * DeSciXAppSDK.js — the APP side of the DeSciX bridge.
 *
 * !!! GENERATED FILE — DO NOT EDIT !!!
 * Source:    @descix/app-sdk templates/DeSciXAppSDK.template.js
 *            + src/util/bridgeResolver.js, src/util/appView.js and src/util/chatContext.js
 *              (inlined below)
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
 *     DeSciX.requestView('NoChrome', { fallback: 'CodeSite' });  // …and learn what happened
 *     if (DeSciX.chat.available()) { … }         // can chat take an attachment now?
 *     await DeSciX.chat.sendMedia({ … });        // hand the model something to look at
 *     DeSciX.setChatContext({ sourceUrl: location.href, data, script });  // what this page has open
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

/* ── inlined from @descix/app-sdk src/util/appView.js ────────────────────── */
    /** The four views an app may ask for. The one list of views. */
    const VIEW_MODES = Object.freeze({
      CODESITE: 'CodeSite',
      SPLITVIEW: 'SplitView',
      CHAT: 'Chat',
      NOCHROME: 'NoChrome',
    });

    const VALID = Object.freeze(Object.values(VIEW_MODES));

    /** What each view gives the app, keyed by VIEW_MODES value; the not-a-view error prints it. */
    const VIEW_DESCRIPTIONS = Object.freeze({
      [VIEW_MODES.CODESITE]: 'your app gets the whole frame, inside the shell chrome',
      [VIEW_MODES.SPLITVIEW]: 'your app beside the chat panel (the default)',
      [VIEW_MODES.CHAT]: 'chat only',
      [VIEW_MODES.NOCHROME]: 'no shell chrome (no top bar, no padding, no chat); your app fills the viewport',
    });
    {
      const described = Object.keys(VIEW_DESCRIPTIONS);
      const missing = VALID.filter((m) => !described.includes(m));
      const extra = described.filter((m) => !VALID.includes(m));
      if (missing.length || extra.length) {
        throw new Error(`[DeSciX.view] VIEW_DESCRIPTIONS does not match VIEW_MODES (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}).`);
      }
    }
    const WIDTH = Math.max(...VALID.map((m) => m.length));

    /** The one "not a view" refusal, shared by setView and requestView. */
    function assertViewMode(mode) {
      if (!VALID.includes(mode)) {
        throw new Error(
          `[DeSciX.view] "${mode}" is not a view. Valid: ${VALID.join(', ')}.\n` +
          VALID.map((m) => `  ${m.padEnd(WIDTH)} = ${VIEW_DESCRIPTIONS[m]}`).join('\n')
        );
      }
    }

    /**
     * What a requestView() call did. The one list of outcomes.
     *   REQUESTED     — a listening shell set the asked mode.
     *   FALLBACK      — the shell's MODES lacks the asked mode; it set the caller's fallback.
     *   UNOFFERED     — nothing was set: no readable shell bus (standalone, or framed with no
     *                   readable bus), the shell publishes no view member, no host is listening,
     *                   or the shell's MODES offers neither the mode nor the fallback.
     *                   `bridge` and `reason` say which.
     *   VIEW_NO_MODES — a fallback was given but the shell publishes no view.MODES to choose by.
     *   SET_THREW     — the shell's view.set() threw; `reason` carries its message.
     */
    const VIEW_OUTCOMES = Object.freeze({
      REQUESTED: 'requested',
      FALLBACK: 'fallback',
      UNOFFERED: 'unoffered',
      VIEW_NO_MODES: 'view-no-modes',
      SET_THREW: 'set-threw',
    });

    function contractViolation(what) {
      const err = new Error(`[DeSciX.view] the shell broke the view contract: ${what}`);
      err.code = 'VIEW_CONTRACT_VIOLATED';
      return err;
    }

    /**
     * Ask whatever shell hosts this page for a view, and report what actually happened.
     *
     * Unlike setView (the shell's own store), this resolves the shell's bus (bridgeResolver.js), so
     * it works from an embedded app at any frame depth, and it never throws because of WHERE the
     * page runs: no shell, a cross-origin shell, or a shell that does not offer the mode are
     * outcomes, not errors.
     *
     * @param {string} mode - one of VIEW_MODES
     * @param {{ fallback?: string }} [opts] - a VIEW_MODES value other than mode, set when the
     *   shell's view.MODES lacks mode
     * @returns {{ outcome: string, mode: string|null, requested: string,
     *   bridge: 'shell'|'standalone'|'embedded-no-bridge', reason: string }}
     *   outcome is a VIEW_OUTCOMES value; mode is the view this call set, or null when it set none
     * @throws {Error} "not a view" for a mode or fallback outside VIEW_MODES, or a fallback equal to
     *   mode; code VIEW_CONTRACT_VIOLATED when the shell's view member lacks set()/available(),
     *   available() throws, or set() returns a mode other than the one it was asked for
     */
    function requestView(mode, { fallback } = {}) {
      assertViewMode(mode);
      if (fallback !== undefined) {
        assertViewMode(fallback);
        if (fallback === mode) throw new Error(`[DeSciX.view] the fallback "${fallback}" is the mode itself; a fallback is a different view.`);
      }
      const result = (outcome, set, bridge, reason) => ({ outcome, mode: set, requested: mode, bridge, reason });

      const { bus, mode: bridge } = resolveBridge();
      if (!bus) {
        return result(VIEW_OUTCOMES.UNOFFERED, null, bridge, bridge === 'standalone'
          ? 'no shell: this page is the top window'
          : 'no readable shell bus: this page is framed, but no ancestor carries a readable DeSciX bus');
      }
      const view = bus.view;
      if (!view) return result(VIEW_OUTCOMES.UNOFFERED, null, bridge, 'the shell publishes no view member');
      if (typeof view.available !== 'function') throw contractViolation(`view.available is ${typeof view.available}`);
      if (typeof view.set !== 'function') throw contractViolation(`view.set is ${typeof view.set}`);
      let listening;
      try {
        listening = view.available();
      } catch (e) {
        throw contractViolation(`view.available() threw: ${e && e.message}`);
      }
      if (!listening) return result(VIEW_OUTCOMES.UNOFFERED, null, bridge, 'the shell publishes view, but no host is listening (view.available() is false)');

      let target = mode;
      const modes = view.MODES && typeof view.MODES === 'object' ? Object.values(view.MODES) : null;
      if (fallback !== undefined && !modes) {
        return result(VIEW_OUTCOMES.VIEW_NO_MODES, null, bridge, `a fallback was given, but the shell publishes no view.MODES (got ${String(view.MODES)})`);
      }
      if (modes && !modes.includes(mode)) {
        if (fallback === undefined || !modes.includes(fallback)) {
          return result(VIEW_OUTCOMES.UNOFFERED, null, bridge,
            `view.MODES [${modes.join(', ')}] offers neither "${mode}"${fallback === undefined ? ' (no fallback given)' : ` nor the fallback "${fallback}"`}`);
        }
        target = fallback;
      }

      let returned;
      try {
        returned = view.set(target);
      } catch (e) {
        return result(VIEW_OUTCOMES.SET_THREW, null, bridge, `view.set("${target}") threw: ${e && e.message}`);
      }
      if (returned !== target) throw contractViolation(`view.set("${target}") returned ${JSON.stringify(returned)}`);
      return target === mode
        ? result(VIEW_OUTCOMES.REQUESTED, mode, bridge, `set "${mode}"`)
        : result(VIEW_OUTCOMES.FALLBACK, fallback, bridge, `"${mode}" is not in view.MODES [${modes.join(', ')}]; set the fallback "${fallback}"`);
    }
/* ── end inlined view region ────────────────────────────────────────────── */

/* ── inlined from @descix/app-sdk src/util/chatContext.js ────────────────── */
    /**
     * The setContext fields. `limit` is the maximum character count (for `data`, of its JSON text).
     */
    const CHAT_CONTEXT = Object.freeze([
      { name: 'sourceUrl', type: 'string', limit: 2048, required: true,
        description: "the page's own URL; names the page to the model and in script errors" },
      { name: 'data', type: 'json-object', limit: 32000, required: false,
        description: 'any JSON object; the keys in CHAT_CONTEXT_DATA are read by the platform, the rest is data for the model' },
      { name: 'script', type: 'string', limit: 64000, required: false,
        description: 'JavaScript the chat pane runs with (chat, data); see CHAT_SCRIPT_API' },
    ].map(Object.freeze));

    /**
     * The `data` keys the platform READS. Each is optional and checked when present; `wire` names
     * the ask_question_to_app parameter it travels in (null: the pane uses it, the model gets it as
     * data). Any other key is the app's own and is passed through untouched.
     */
    const CHAT_CONTEXT_DATA = Object.freeze([
      { name: 'title', type: 'string', limit: 200, itemLimit: null, wire: null,
        description: 'what the reader has open; the pane shows "Reading: <title>"' },
      { name: 'kbNames', type: 'string[]', limit: 8, itemLimit: 128, wire: 'knowledgebase_names',
        description: "which of the app's knowledge bases each turn searches; the first one's instructions shape the reply" },
      { name: 'docId', type: 'string', limit: 256, itemLimit: null, wire: 'doc_ids',
        description: "the open document's id in the first knowledge base; its whole text is added to each turn" },
    ].map(Object.freeze));

    /** The members of the `chat` object a context script receives. The one list. */
    const CHAT_SCRIPT_API = Object.freeze(['root', 'button', 'ask', 'report', 'sourceUrl', 'data']);

    /**
     * What a setChatContext() / clearChatContext() call did. The one list of outcomes.
     *   ATTACHED    — the shell stored the context; the pane shows it and the next turn carries it.
     *   CLEARED     — the shell dropped the context.
     *   UNAVAILABLE — nothing happened: no readable shell bus, no chat member, or a chat member
     *                 without page-context support. `bridge` and `reason` say which.
     *   REFUSED     — the shell's chat.setContext threw; `reason` carries its message.
     */
    const CHAT_CONTEXT_OUTCOMES = Object.freeze({
      ATTACHED: 'attached',
      CLEARED: 'cleared',
      UNAVAILABLE: 'unavailable',
      REFUSED: 'refused',
    });

    function chatContextError(what) {
      const err = new Error(`[DeSciX.chat] page context: ${what}`);
      err.code = 'CHAT_CONTEXT_INVALID';
      return err;
    }

    function describeValue(v) {
      if (v === null) return 'null';
      if (Array.isArray(v)) return 'an array';
      return `a ${typeof v}`;
    }

    function isPlainBag(v) {
      return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function boundedString(v, label, limit) {
      if (typeof v !== 'string') throw chatContextError(`${label} must be a string; got ${describeValue(v)}`);
      const s = v.trim();
      if (!s) throw chatContextError(`${label} is empty; omit it instead`);
      if (s.length > limit) throw chatContextError(`${label} is ${s.length} characters; the limit is ${limit}`);
      return s;
    }

    /** Refuse, by path, anything JSON would silently drop or mangle. */
    function assertJson(v, path) {
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw chatContextError(`${path} is ${v}; data must be JSON (finite numbers only)`);
        return;
      }
      if (Array.isArray(v)) { v.forEach((x, i) => assertJson(x, `${path}[${i}]`)); return; }
      if (typeof v === 'object') { for (const k of Object.keys(v)) assertJson(v[k], `${path}.${k}`); return; }
      throw chatContextError(`${path} is ${describeValue(v)}; data must be JSON (no functions, undefined or symbols)`);
    }

    function deepFreeze(v) {
      if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
      return v;
    }

    function normalizeData(v) {
      if (!isPlainBag(v)) throw chatContextError(`data must be a JSON object; got ${describeValue(v)}`);
      assertJson(v, 'data');
      const text = JSON.stringify(v);
      const limit = CHAT_CONTEXT.find((f) => f.name === 'data').limit;
      if (text.length > limit) throw chatContextError(`data is ${text.length} characters as JSON; the limit is ${limit}`);
      // A copy in THIS realm: the page's own objects die with its document.
      const out = JSON.parse(text);
      for (const f of CHAT_CONTEXT_DATA) {
        const x = out[f.name];
        if (x === undefined || x === null) { delete out[f.name]; continue; }
        if (f.type === 'string') { out[f.name] = boundedString(x, `data.${f.name}`, f.limit); continue; }
        if (!Array.isArray(x)) throw chatContextError(`data.${f.name} must be an array of strings; got ${describeValue(x)}`);
        if (x.length === 0) throw chatContextError(`data.${f.name} is empty; omit it instead`);
        if (x.length > f.limit) throw chatContextError(`data.${f.name} has ${x.length} entries; the limit is ${f.limit}`);
        out[f.name] = x.map((s, i) => boundedString(s, `data.${f.name}[${i}]`, f.itemLimit));
      }
      return deepFreeze(out);
    }

    /**
     * Validate a setContext argument and return the full bag.
     *
     * @param {{sourceUrl: string, data?: object, script?: string}} partial
     * @returns {Readonly<{sourceUrl: string, data: object|null, script: string|null}>}
     * @throws {Error} code CHAT_CONTEXT_INVALID, naming the field and the rule it broke
     */
    function normalizeChatContext(partial) {
      if (!isPlainBag(partial)) throw chatContextError(`expected { sourceUrl, data?, script? }; got ${describeValue(partial)}`);
      const names = CHAT_CONTEXT.map((f) => f.name);
      const unknown = Object.keys(partial).filter((k) => !names.includes(k));
      if (unknown.length) {
        throw chatContextError(`unknown field${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}; the fields are ${names.join(', ')} (put anything else inside data)`);
      }
      const bag = {};
      for (const f of CHAT_CONTEXT) {
        const v = partial[f.name];
        if (v === undefined || v === null) {
          if (f.required) throw chatContextError(`${f.name} is required`);
          bag[f.name] = null;
          continue;
        }
        if (f.type === 'json-object') { bag[f.name] = normalizeData(v); continue; }
        if (f.name === 'script') {
          if (typeof v !== 'string') throw chatContextError(`script must be a string of JavaScript; got ${describeValue(v)}`);
          if (!v.trim()) throw chatContextError('script is empty; omit it instead');
          if (v.length > f.limit) throw chatContextError(`script is ${v.length} characters; the limit is ${f.limit}`);
          bag[f.name] = v;
          continue;
        }
        bag[f.name] = boundedString(v, f.name, f.limit);
      }
      return Object.freeze(bag);
    }

    /**
     * Hand the shell's chat pane this page's context, and report what happened.
     *
     * Resolves the shell's bus (bridgeResolver.js), so it works at any frame depth. Where the page
     * runs is an outcome, never a throw. Last write wins: each call replaces the whole context.
     *
     * @param {{sourceUrl: string, data?: object, script?: string}} partial
     * @returns {{ outcome: string, revision: number|null,
     *   bridge: 'shell'|'standalone'|'embedded-no-bridge', reason: string }}
     * @throws {Error} code CHAT_CONTEXT_INVALID for a malformed argument (a caller bug)
     */
    function setChatContext(partial) {
      const bag = normalizeChatContext(partial);
      const result = (outcome, revision, bridge, reason) => ({ outcome, revision, bridge, reason });
      const { bus, mode: bridge } = resolveBridge();
      if (!bus) {
        return result(CHAT_CONTEXT_OUTCOMES.UNAVAILABLE, null, bridge, bridge === 'standalone'
          ? 'no shell: this page is the top window, so there is no chat pane'
          : 'no readable shell bus: this page is framed, but no ancestor carries a readable DeSciX bus');
      }
      const chat = bus.chat;
      if (!chat) return result(CHAT_CONTEXT_OUTCOMES.UNAVAILABLE, null, bridge, 'the shell publishes no chat member');
      if (typeof chat.setContext !== 'function') {
        return result(CHAT_CONTEXT_OUTCOMES.UNAVAILABLE, null, bridge, 'the shell\'s chat member has no setContext (a shell older than @descix/app-sdk 0.7.0)');
      }
      let stored;
      try {
        stored = chat.setContext(bag);
      } catch (e) {
        console.error(`[DeSciX.chat] the shell refused the page context: ${e && e.message}`);
        return result(CHAT_CONTEXT_OUTCOMES.REFUSED, null, bridge, `chat.setContext threw: ${e && e.message}`);
      }
      const open = typeof chat.available === 'function' && chat.available();
      return result(CHAT_CONTEXT_OUTCOMES.ATTACHED, stored.revision, bridge,
        open ? 'attached' : 'attached; the chat pane is closed, so the pane shows it (and runs the script) when it opens');
    }

    /**
     * Drop the page context from the shell's chat pane.
     *
     * @param {{ revision?: number }} [opts] - clear only if the shell still holds the context that
     *   revision stored (a page leaving clears its own context, never a newer one)
     * @returns {{ outcome: string, bridge: string, reason: string }}
     */
    function clearChatContext({ revision } = {}) {
      const result = (outcome, bridge, reason) => ({ outcome, bridge, reason });
      const { bus, mode: bridge } = resolveBridge();
      if (!bus) return result(CHAT_CONTEXT_OUTCOMES.UNAVAILABLE, bridge, 'no readable shell bus');
      const chat = bus.chat;
      if (!chat || typeof chat.clearContext !== 'function') {
        return result(CHAT_CONTEXT_OUTCOMES.UNAVAILABLE, bridge, 'the shell\'s chat member has no clearContext');
      }
      return chat.clearContext(revision)
        ? result(CHAT_CONTEXT_OUTCOMES.CLEARED, bridge, 'cleared')
        : result(CHAT_CONTEXT_OUTCOMES.UNAVAILABLE, bridge, `the shell holds a newer context than revision ${revision}; left in place`);
    }
/* ── end inlined chat-context region ────────────────────────────────────── */

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

        // The bus is the fact; the mode string is a second derivation of it. 'standalone' and
        // 'embedded-no-bridge' both carry bus: null — there is no readable window to wait on.
        if (!found.bus) {
            resolve({ mode: found.mode, members: [], version: null });
            return;
        }

        const snapshot = () => {
            const now = resolveBridge();
            if (!now.bus) return { mode: now.mode, members: [], version: null };
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

        if (!found.bus) {
            console.error(
                `[DeSciX SDK] DeSciX.${name} is unavailable: no readable DeSciX App Shell bus was found ` +
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

    /**
     * Read a plain (non-member) property off the bus, or null when there is no readable bus.
     * Keyed on the bus itself, never on the mode: 'embedded-no-bridge' is framed yet carries
     * bus: null, and a getter that throws poisons every `{...window.DeSciX}` spread.
     */
    const busProp = (name) => {
        const found = resolveBridge();
        return found.bus ? found.bus[name] : null;
    };

    // The revision this page's last setChatContext stored, cleared on pagehide (see below).
    let lastRevision = null;
    let clearOnLeaveArmed = false;

    return {
        /**
         * One of three modes, read live from the bridge resolver:
         *   'shell'              — a DeSciX App Shell's bus is readable at this page or above it.
         *   'standalone'         — no bus, and this window is the top of its frame chain.
         *   'embedded-no-bridge' — no bus, and this window IS framed: a shell may sit above
         *                          and be unreadable (cross-origin), or there may be none.
         */
        get mode() { return resolveBridge().mode; },

        /**
         * How many frames up the bus was found: 0 = this page owns it, 1 = the parent
         * (the ordinary embedded case), 2+ = nested, -1 = no bus ('standalone' or
         * 'embedded-no-bridge'). Diagnostics only — app code should never branch on it,
         * which is the whole point of this file.
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
         *     DeSciX.view.set('NoChrome');   // no shell chrome; this app fills the viewport
         *
         * `DeSciX.view.available()` reports whether a host is actually LISTENING.
         * Check it: on a host that renders a bare iframe, set() validates and returns
         * the mode you asked for while nothing on screen changes, and that success is
         * otherwise indistinguishable from a real one.
         */
        get view() {
            return member('view', 'View switching is a shell capability (this host renders the app frame without a view-aware container).');
        },

        /** The views an app may ask for (the one list, from appView.js). */
        VIEW_MODES,

        /** What a requestView() call did (the one list, from appView.js). */
        VIEW_OUTCOMES,

        /**
         * Ask whatever shell hosts this page for a view and learn what happened:
         *
         *     const { outcome } = DeSciX.requestView('NoChrome', { fallback: 'CodeSite' });
         *
         * Returns { outcome, mode, requested, bridge, reason }; outcome is a VIEW_OUTCOMES value.
         * Standalone, cross-origin or a shell that lacks the mode is an outcome (see
         * VIEW_OUTCOMES), never a throw. It throws for a mode that is not a view,
         * and (code VIEW_CONTRACT_VIOLATED) for a shell that breaks the view contract.
         */
        requestView,

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

        /** The page-context fields, the data keys the platform reads, the script's `chat`
         *  members and the outcomes (the one lists, from chatContext.js). */
        CHAT_CONTEXT,
        CHAT_CONTEXT_DATA,
        CHAT_SCRIPT_API,
        CHAT_CONTEXT_OUTCOMES,

        /**
         * Tell the chat pane what this page has open, and learn what happened:
         *
         *     const { outcome } = DeSciX.setChatContext({
         *       sourceUrl: location.href,
         *       data: { title: 'The EGPT paper', kbNames: ['Corpus', 'Sources'] },
         *       script: "chat.button('Explain this page', () => chat.ask('Explain this page.'));",
         *     });
         *
         * Returns { outcome, revision, bridge, reason }; outcome is a CHAT_CONTEXT_OUTCOMES value.
         * Standalone, or a shell without chat, is an outcome, never a throw; a malformed argument
         * throws (code CHAT_CONTEXT_INVALID). Last write wins. When this page goes away
         * (pagehide) the context it set is cleared, unless a newer one replaced it.
         */
        setChatContext: (partial) => {
            const r = setChatContext(partial);
            if (r.outcome === CHAT_CONTEXT_OUTCOMES.ATTACHED) {
                lastRevision = r.revision;
                if (!clearOnLeaveArmed) {
                    clearOnLeaveArmed = true;
                    window.addEventListener('pagehide', () => {
                        if (lastRevision !== null) clearChatContext({ revision: lastRevision });
                    });
                }
            }
            return r;
        },

        /** Drop this page's context from the chat pane. Returns { outcome, bridge, reason }. */
        clearChatContext: () => {
            lastRevision = null;
            return clearChatContext();
        },

        /**
         * The shell's Powch wallet bridge — login, logout, sign, send/receive,
         * isAuthenticated(), getAddress(), on('auth', cb) / off('auth', cb). Published
         * by the App Shell host (postMessage protocol; no Powch internals cross this
         * boundary):
         *
         *     await DeSciX.ready();
         *     if (DeSciX.powch) {
         *       const unsubscribe = DeSciX.powch.on('auth', ({ signedIn, address }) => {
         *         button.textContent = signedIn ? 'Logged In' : 'Log in with Powch';
         *       });
         *       addEventListener('pagehide', unsubscribe);
         *       button.onclick = () => DeSciX.powch.login();
         *     }
         *
         * on('auth', cb) calls cb once immediately with { signedIn, address }, then on
         * every change, and returns the unsubscribe. signedIn is whether the shell holds a
         * DeSciX session (any sign-in the shell sees, including one made inside the Powch
         * sidebar and a session restored on load); address is the wallet address Powch
         * released to the shell, or null. isAuthenticated() / getAddress() return the same.
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
            if (!found.bus) {
                throw new Error(
                    `[DeSciX SDK] DeSciX.call('${command}') requires the DeSciX App Shell: ` +
                    'no readable shell bus was found above this page (running standalone, or cross-origin).'
                );
            }
            return found.bus.call(command, params);
        },
    };
})();
