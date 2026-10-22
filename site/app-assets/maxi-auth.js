/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-auth.js — THE one reader of the visitor's sign-in state in the lab, and THE one test of a platform refusal that
 * means "sign in first". The intro's entry button (maxi-intro.js buttonLabelFor) and the lab's status line and
 * conversation (maxi-lab.js) read the state from here; neither asks the shell itself.
 *
 * The shell's bridge (site/DeSciXAppSDK.js, the published app-sdk copy) publishes `DeSciX.powch.isAuthenticated()` and
 * NO sign-in event: no auth-changed event, no `on`, and the shell's POWCH_STATE_UPDATE is a message from the Powch frame
 * to the SHELL's window, which never reaches this page. So the state is RE-READ: when the bridge settles, every
 * AUTH_EVERY_MS while the page is open, and on demand (refresh(): the lab calls it at each Send). A sign-in made through
 * the shell's SIGN IN after boot shows within one read, without a reload.
 *
 * State: {mode, members, powch, authenticated} — `powch` whether the shell publishes the wallet bridge; `authenticated`
 * the boolean isAuthenticated() returned (awaited), or null where there is no powch (standalone, or a host without it).
 * A non-boolean answer from a published powch THROWS by name, never guessed.
 */

/** How often the sign-in state is re-read while the page is open (the bridge has no event to wait on). */
export const AUTH_EVERY_MS = 1000;

/** The marker of the lab's sign-in refusal (signInRefusal): the strip and the page recognise THIS, never the platform's words. */
export const SIGN_IN_MARK = 'the platform answers signed-in visitors only';

/** What a platform refusal says when the visitor is not signed in (measured on PROD 2026-10-22: "User not authenticated"). */
const PLATFORM_AUTH_RE = /\bnot authenticated\b/i;

/** The Lab's notice for a question the platform refused because nobody is signed in: no red, the question kept. */
export const SIGN_IN_NOTICE = 'Maxi answers signed-in visitors. Sign in with the shell\'s SIGN IN button, then press Send: your question is kept in the box.';

/** The Lab's notice when a sign-in is seen after the page loaded. */
export const SIGNED_IN_NOTICE = 'You are signed in: Maxi answers your questions now.';

/**
 * The command door's refusal, as the lab passes it on: the platform's own refusal when it is the sign-in one becomes
 * ONE error carrying SIGN_IN_MARK and the platform's words; any other refusal is returned unchanged (fail loud stays).
 */
export function signInRefusal(err) {
    const text = String((err && err.message) || err);
    if (!PLATFORM_AUTH_RE.test(text)) { return err; }
    return new Error(SIGN_IN_MARK + ' (the platform said: ' + text + ')');
}

/** Whether a refusal's words are the lab's sign-in refusal (signInRefusal). */
export function isSignInRefusal(text) {
    return typeof text === 'string' && text.indexOf(SIGN_IN_MARK) !== -1;
}

/**
 * The sign-in state from what DeSciX.ready() resolved and what isAuthenticated() answered (`authenticated` is read only
 * when the shell publishes powch). THROWS on a settle with no mode, a shell without members, or a non-boolean answer.
 */
export function authStateOf(settled, authenticated) {
    if (!settled || typeof settled.mode !== 'string') { throw new Error('[maxi-auth] the sign-in state needs what DeSciX.ready() resolved ({mode, members}); got ' + JSON.stringify(settled)); }
    const shell = settled.mode === 'shell';
    if (shell && !Array.isArray(settled.members)) { throw new Error('[maxi-auth] DeSciX.ready() resolved shell without a members array: ' + JSON.stringify(settled)); }
    const powch = shell && settled.members.includes('powch');
    if (powch && typeof authenticated !== 'boolean') {
        throw new Error('[maxi-auth] the shell publishes powch but isAuthenticated() gave ' + JSON.stringify(authenticated) + ', not a boolean');
    }
    return Object.freeze({ mode: settled.mode, members: shell ? settled.members.slice() : [], powch: powch, authenticated: powch ? authenticated : null });
}

/**
 * Watch the sign-in state of `win` (its DeSciX bridge). Returns
 *   settled   — a Promise of the first state (rejects when the bridge is missing or answers wrong);
 *   state     — the last state read, or null before the first;
 *   error     — the last read's error, or null;
 *   refresh() — re-read now: a Promise of the state (rejects on a wrong answer);
 *   onChange(fn) — fn(state, previous) after every read whose `authenticated` differs from the last one's.
 * `everyMs` (default AUTH_EVERY_MS) re-reads on a timer; 0 reads only on refresh().
 */
export function watchAuth(win, opts) {
    const everyMs = opts && opts.everyMs !== undefined ? opts.everyMs : AUTH_EVERY_MS;
    const st = { state: null, error: null, settledWith: null };
    const listeners = [];
    async function read() {
        if (!win.DeSciX || typeof win.DeSciX.ready !== 'function') {
            throw new Error('window.DeSciX is missing: DeSciXAppSDK.js is not beside this page.');
        }
        if (!st.settledWith) { st.settledWith = await win.DeSciX.ready(); }
        const s = st.settledWith;
        const powch = s && s.mode === 'shell' && Array.isArray(s.members) && s.members.includes('powch');
        return authStateOf(s, powch ? await win.DeSciX.powch.isAuthenticated() : undefined);
    }
    async function refresh() {
        let next;
        try { next = await read(); }
        catch (err) { st.error = err; throw err; }
        const prev = st.state;
        st.state = next; st.error = null;
        if (prev && prev.authenticated !== next.authenticated) { listeners.slice().forEach(function (fn) { fn(next, prev); }); }
        return next;
    }
    const settled = refresh();
    if (everyMs > 0) {
        settled.then(function () {
            const t = setInterval(function () { refresh().catch(function (err) { console.error('[maxi-auth] the sign-in state could not be re-read:', err); }); }, everyMs);
            if (t && typeof t.unref === 'function') { t.unref(); }   // node (a test's fake window): the timer never holds the process
        }, function () {});
    }
    return {
        settled: settled,
        get state() { return st.state; },
        get error() { return st.error; },
        refresh: refresh,
        onChange: function (fn) { if (typeof fn !== 'function') { throw new Error('[maxi-auth] onChange needs a function.'); } listeners.push(fn); }
    };
}

const shared = new WeakMap();
/** THE watcher of a page's window: the intro and the lab share one (one reader, one timer). */
export function pageAuth(win) {
    if (!shared.has(win)) { shared.set(win, watchAuth(win)); }
    return shared.get(win);
}
