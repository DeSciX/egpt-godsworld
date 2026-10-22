/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-intro.js — the run-once walk-through over Maxi's Lab: what Maxi is (INTRO_TEXT), what each control
 * on screen does (EXPLAINERS, one row per control id, each pointed at on screen), the MOVE and LOOK pads 3D scenes
 * show (PADS, drawn in the walk-through itself), and one button at the end
 * whose label and act buttonLabelFor() decides from the shell's bridge (Powch login, or enter).
 *
 * The ONE owner of: the intro text, the control explainers, the pads' explainers, the run-once rule (introDecision) and the
 * entry button's rule. app.html loads it before maxi-lab.js; nothing here awaits at the top level, so
 * the lab keeps booting underneath while the overlay is open. scripts/test/intro.test.mjs gates it.
 *
 * Runs once: shown while localStorage holds no INTRO_SEEN_KEY (and when storage cannot be read at all);
 * `?intro=1` shows it again, `?intro=0` keeps it closed (a driver that clicks the stage), and the
 * "What is this?" button this module appends to the conversation head re-opens it. Esc, the × and the entry
 * button close it. While it is open the rest of the page is inert, so focus and keys stay in the walk-through.
 */

import { authStateOf, pageAuth } from './maxi-auth.js';

/** The intro text: two paragraphs, spelling corrected only; scripts/test/intro.test.mjs pins it by sha256. */
export const INTRO_TEXT = `Welcome to Godsworld, the training ground for Maxi. Maxi is a Cybernetic assistant but not artificial intelligence in the way large language models are. You might say that LLMs were built in the image of quants and coders where statistical sequences of words and symbolic equations are thought to be "intelligence." Maxi is built in the image of artists and real people - when you imagine yourself in the park flying a kite you don't sound out the words in your mind or work out the Navier-Stokes equations to adjust for the wind. You use your imagination first and then describe it in words later. That's what Maxi is learning to do in Godsworld - as you play with Maxi remember it is just barely a toddler.`
    + '\n\n'
    + `Maxi is the realization of Essam Abadir's childhood dream to build a JARVIS like assistant that could build the things humans imagine. Maxi's purpose is to enable anyone to become a modern day DaVinci and enable a modern day renaissance just as in the 1400s when the masters benefitted not only from the apprentices in the workshop but an explosion of the technologies like linear perspective, perfection of oil paints, and the printing press. Maxi is named after Maxwell's demon because the impossible computations he does can only be explained by strict thermodynamic accounting and the robotic AI stack using the Designer, Builder, and Owl was directly "inspired" by my daughter Jolie Abadir's work at jolieabadir/workshop (it would have been considered stealing if it weren't my daughter). The conceptual lineage of Maxi and FRQTL goes back to the Macy conferences on Cybernetics in the late 1950s. At a high level LLMs can be considered the outgrowth of Shannon's "The Redundancy of English" and what became what we now call artificial intelligence. At the time the pushback against Shannon's approach is that the machine would clearly be able to speak the words but have no understanding of what the words meant. Maxi is not "AI" in the sense of LLMs although it does use LLMs to describe what it thinks. Maxi is a competing path which was called "Cybernetics" at the time and was premised on physical control systems championed by Norbert Wiener and spatial brain like computing architectures championed by John von Neumann, Stanislaw Ulam, and Gian-Carlo Rota in "The Computer and The Brain", "Science, Computers, and People", and "The Barrier of Meaning."`;

/**
 * One row per control on the lab's header and conversation, keyed by the element id in app.html.
 * `name` is what the walk-through calls it; `says` is what it does for the person using the lab.
 * A control with a title attribute keeps its shortcut key named here (the drift gate checks it).
 * The walk-through numbers the rows in this table's order.
 */
export const EXPLAINERS = Object.freeze({
    'scene-picker': Object.freeze({ name: 'Scene', says: 'Chooses the scene the lab runs. Each scene is a small world built from the frqtl SDK; Maxi works in whichever one is open.' }),
    'btn-run': Object.freeze({ name: 'Pause', says: 'Stops the scene\'s clock so you can look closely; the same button then reads Resume and starts it again.' }),
    'btn-restart': Object.freeze({ name: 'Restart', says: 'Runs the scene again from its first tick.' }),
    'btn-hand': Object.freeze({ name: 'Hand (H)', says: 'Lets you pick up a part of the scene and move it. Press H to take the hand; Esc puts it down.' }),
    'btn-record': Object.freeze({ name: 'Record (R)', says: 'Films a demonstration for Maxi: a clip of the scene, and it keeps every change you make while it records. Press R (or the button, which reads Stop while filming) to start and to stop. When you stop, tell Maxi what you were teaching him and press Send to Maxi: he gets the clip, your changes and your words together.' }),
    'btn-code': Object.freeze({ name: 'Scene code', says: 'Shows the sketch: the code of the scene. It is the file Maxi reads and edits when he builds what you imagine.' }),
    'btn-info': Object.freeze({ name: 'Info', says: 'Shows the scene\'s card: what you are seeing, why it is impossible the usual way, how FRQTL gets it, read from the frqtl SDK\'s own scene registry. The same card is part of what Maxi has learned about the scene.' }),
    'btn-memories': Object.freeze({ name: 'Memories', says: 'Your memories: every Record you stop is kept in this browser, scene by scene, with the date; Send to Maxi adds your words and his answer, and closing its card (×) removes it. Reload opens the scene as you left it and plays the clip; Discuss asks Maxi your question about it; Delete removes it. They are kept in this browser only; Maxi sees one only when you Send or Discuss it.' }),
    'btn-fullscreen': Object.freeze({ name: 'Full screen', says: 'On a phone, gives the lab the whole screen; the same button then reads Exit. It shows only on a phone-sized screen where the browser allows full screen.' }),
    'talk-new': Object.freeze({ name: 'New conversation', says: 'Starts a new conversation with Maxi; the one on screen is cleared.' }),
    'imagine-text': Object.freeze({ name: 'Imagine', says: 'Where you tell Maxi what to build: give him an outline in your own words and press Send (or Enter). He builds it in the scene and looks at what happens; his answer appears in the conversation above.' }),
    'imagine-send': Object.freeze({ name: 'Send', says: 'Sends what you typed in Imagine to Maxi, the same as pressing Enter.' })
});

/**
 * The two round pads a 3D scene draws at the bottom corners of its own picture (the frqtl SDK's CameraControls part,
 * inside the scene's frame; a 2D scene draws none). They fly the camera, like an airplane's controls, and never move
 * a part. `side` and `cap` are the part's own (scripts/test/intro.test.mjs holds them, and the keys each row names,
 * to the vendored CameraControls.js). The walk-through draws them itself, since a 2D scene, or a scene still booting,
 * has none to point at.
 */
export const PADS_LEDE = 'On 3D scenes two round pads sit at the bottom corners of the picture. They fly the camera the way an airplane\'s controls fly the plane: LOOK is the stick, MOVE the throttle with a sidestep. They fly only the camera: a part moves with it only while you hold it with the Hand. The wheel or a pinch zooms.';
export const PADS = Object.freeze({
    move: Object.freeze({ side: 'left', cap: 'MOVE', keys: Object.freeze(['W', 'A', 'S', 'D']), name: 'MOVE (W A S D)', says: 'The throttle, and a sidestep. Push it up to fly forward into the picture, so things grow; pull it down to back away; push it left or right to slide sideways. You fly where the view points: flying forward while looking down takes you down. W and S, A and D do the same from the keyboard.' }),
    look: Object.freeze({ side: 'right', cap: 'LOOK', keys: Object.freeze(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']), name: 'LOOK (arrow keys)', says: 'The stick. Push it left or right to bank: the picture rolls and the horizon tilts. Push it up to dive: you swing down and under the scene and look up at it; pull it down to climb over the scene and look down on it. Unlike a free airplane, the camera turns around the point it is looking at and keeps its distance, so that point stays in the middle of the picture. The arrow keys do the same.' })
});

/** localStorage key that says this browser has seen the walk-through. */
export const INTRO_SEEN_KEY = 'egpt-godsworld:maxi-intro:seen';

/** The two labels of the one button at the end. */
export const ENTRY_LABELS = Object.freeze({ login: 'Login to enter Godsworld', enter: 'Enter Godsworld' });

/**
 * The entry button's rule, from the sign-in state (maxi-auth.js authStateOf, the one owner of reading it: what
 * DeSciX.ready() resolved and what powch.isAuthenticated() returned). The shell publishes powch and nobody is signed in →
 * login; signed in, standalone, or no powch → enter. A wrong answer is refused by authStateOf, never guessed.
 * @param {{mode: string, members?: string[], authenticated?: boolean|null}} bridge
 * @returns {{action: 'login'|'enter', label: string}}
 */
export function buttonLabelFor(bridge) {
    const auth = authStateOf(bridge, bridge ? bridge.authenticated : undefined);
    return auth.powch && !auth.authenticated ? { action: 'login', label: ENTRY_LABELS.login } : { action: 'enter', label: ENTRY_LABELS.enter };
}

/**
 * The run-once rule. `search` is location.search; `seen` is true/false from storage, or null when
 * storage could not be read (then it shows: a first visit cannot be ruled out).
 * @returns {'show'|'skip'}
 */
export function introDecision({ search, seen }) {
    const q = new URLSearchParams(search || '');
    if (q.get('intro') === '1') { return 'show'; }
    if (q.get('intro') === '0') { return 'skip'; }
    if (seen !== true && seen !== false && seen !== null) {
        throw new Error('[maxi-intro] introDecision: seen must be true, false or null (storage unreadable); got ' + JSON.stringify(seen));
    }
    return seen === true ? 'skip' : 'show';
}

/** The intro text as paragraphs (blank-line separated), for painting. */
export function introParagraphs(text) {
    return String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** What localStorage says about INTRO_SEEN_KEY: true, false, or null when storage throws. */
export function readSeen(storageOf) {
    try { return storageOf().getItem(INTRO_SEEN_KEY) === '1'; }
    catch (err) { console.error('[maxi-intro] localStorage could not be read; the walk-through shows:', err); return null; }
}

function writeSeen(storageOf) {
    try { storageOf().setItem(INTRO_SEEN_KEY, '1'); }
    catch (err) { console.error('[maxi-intro] localStorage could not be written; the walk-through will show again next visit:', err); }
}

/**
 * The entry button's act. 'login' awaits powch.login() (the shell routes the view after it). 'enter' asks the
 * lab for full screen when the lab says the layout is mobile (MaxiLab.mobile(), the one owner of that rule)
 * and full screen is available here (MaxiLab.fullscreenAvailable()): fullscreen(true) is called before any
 * await, so it stays inside the click. Resolves when the overlay may close; a thrown error is passed on
 * unchanged for the overlay to show by name.
 */
export async function enterAct({ action, powch, lab }) {
    if (action === 'login') {
        if (!powch || typeof powch.login !== 'function') { throw new Error('[maxi-intro] the login act needs DeSciX.powch.login(); the bridge gave ' + typeof powch); }
        await powch.login();
        return;
    }
    if (action !== 'enter') { throw new Error('[maxi-intro] enterAct: unknown action ' + JSON.stringify(action) + ' (login | enter)'); }
    if (!lab || typeof lab.mobile !== 'function' || typeof lab.fullscreenAvailable !== 'function' || typeof lab.fullscreen !== 'function') {
        throw new Error('[maxi-intro] window.MaxiLab lacks mobile() / fullscreenAvailable() / fullscreen(): maxi-lab.js did not publish its full-screen door');
    }
    if (lab.mobile() && lab.fullscreenAvailable().available) { await lab.fullscreen(true); }
}

function errorText(err) {
    return (err && err.name ? err.name : 'Error') + ': ' + (err && err.message ? err.message : String(err));
}

/**
 * Builds the overlay in `win`'s document and wires it. Returns {open, close, root, settled}. Called once by the
 * page (below); the test drives the pure functions above instead.
 */
export function installIntro(win) {
    const doc = win.document;
    const storageOf = () => win.localStorage;
    const make = (tag, attrs, text) => {
        const n = doc.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) { n.setAttribute(k, v); }
        if (text !== undefined) { n.textContent = text; }
        return n;
    };

    const root = make('div', { id: 'intro', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'intro-title', hidden: '' });
    const panel = make('div', { class: 'intro-panel', tabindex: '-1' });
    const close = make('button', { type: 'button', class: 'intro-close', 'aria-label': 'Close the walk-through' }, '×');
    const title = make('h1', { id: 'intro-title' }, 'Welcome to Godsworld');

    const stepOne = make('section', { class: 'intro-step', 'data-step': '1' });
    stepOne.appendChild(make('h2', {}, 'What Maxi is'));
    for (const p of introParagraphs(INTRO_TEXT)) { stepOne.appendChild(make('p', { class: 'intro-text' }, p)); }
    const next = make('button', { type: 'button', class: 'intro-next' }, 'Next: what you see');
    stepOne.appendChild(make('div', { class: 'intro-nav' })).appendChild(next);

    const stepTwo = make('section', { class: 'intro-step', 'data-step': '2', hidden: '' });
    stepTwo.appendChild(make('h2', {}, 'What you see'));
    stepTwo.appendChild(make('p', { class: 'intro-lede' }, 'Each control is marked on screen with its number; tap or click a row to see its control.'));
    const list = make('ol', { class: 'intro-explainers' });
    const rings = [];
    Object.entries(EXPLAINERS).forEach(([id, row], i) => {
        const li = make('li', { 'data-for': id, tabindex: '0' });
        li.appendChild(make('b', {}, row.name));
        li.appendChild(make('span', {}, ' ' + row.says));
        list.appendChild(li);
        const ring = make('div', { class: 'intro-ring', 'data-for': id, 'aria-hidden': 'true' });
        ring.appendChild(make('span', { class: 'intro-badge' }, String(i + 1)));
        rings.push(ring);
        const hot = (on) => () => ring.classList.toggle('intro-ring-hot', on);
        li.addEventListener('mouseenter', hot(true)); li.addEventListener('mouseleave', hot(false));
        li.addEventListener('focus', hot(true)); li.addEventListener('blur', hot(false));
        li.addEventListener('click', () => peek(ring));
    });
    stepTwo.appendChild(list);
    // The pads live in the scene's own frame and only on 3D scenes, so the walk-through draws them rather than ringing them.
    const pads = make('section', { class: 'intro-pads', 'aria-labelledby': 'intro-pads-title' });
    pads.appendChild(make('h2', { id: 'intro-pads-title' }, 'On 3D scenes: MOVE and LOOK'));
    pads.appendChild(make('p', { class: 'intro-lede' }, PADS_LEDE));
    const picture = make('div', { class: 'intro-pads-picture', 'aria-hidden': 'true' });
    for (const pad of Object.values(PADS)) {
        const disc = make('div', { class: 'intro-pad intro-pad-' + pad.side, 'data-pad': pad.cap });
        disc.appendChild(make('span', { class: 'intro-pad-cap' }, pad.cap));
        disc.appendChild(make('span', { class: 'intro-pad-knob' }));
        picture.appendChild(disc);
    }
    pads.appendChild(picture);
    const padRows = make('ul', { class: 'intro-explainers intro-pad-rows' });
    for (const pad of Object.values(PADS)) {
        const li = make('li', { 'data-pad': pad.cap });
        li.appendChild(make('b', {}, pad.name));
        li.appendChild(make('span', {}, ' ' + pad.says));
        padRows.appendChild(li);
    }
    pads.appendChild(padRows);
    stepTwo.appendChild(pads);
    const failure = make('p', { class: 'intro-error', role: 'alert', hidden: '' });
    const back = make('button', { type: 'button', class: 'intro-back' }, 'Back');
    const entry = make('button', { type: 'button', class: 'intro-entry', disabled: '' }, 'Waiting for DeSciX…');
    // The error rides in the sticky button bar, above the buttons, so it is in view however far the rows scroll.
    const nav = make('div', { class: 'intro-nav' });
    nav.appendChild(failure); nav.appendChild(back); nav.appendChild(entry);
    stepTwo.appendChild(nav);

    panel.appendChild(close); panel.appendChild(title); panel.appendChild(stepOne); panel.appendChild(stepTwo);
    root.appendChild(panel);
    // The dimmed backdrop carries the rings, so a ring shows bright over the dim and under the panel.
    const backdrop = make('div', { class: 'intro-backdrop', 'aria-hidden': 'true', hidden: '' });
    rings.forEach((r) => backdrop.appendChild(r));
    doc.body.appendChild(backdrop);
    doc.body.appendChild(root);

    const showFailure = (err) => {
        failure.textContent = errorText(err);
        failure.hidden = false;
        console.error('[maxi-intro]', err);
    };

    // Rings sit over each control's on-screen box; a control with no box (hidden, off-layout) gets none.
    let ringsOn = false;
    const placeRings = () => {
        for (const ring of rings) {
            if (!ringsOn) { ring.hidden = true; continue; }
            const el = doc.getElementById(ring.dataset.for);
            const r = el ? el.getBoundingClientRect() : null;
            if (!r || (r.width === 0 && r.height === 0)) { ring.hidden = true; continue; }
            ring.hidden = false;
            ring.style.left = (r.left - 3) + 'px'; ring.style.top = (r.top - 3) + 'px';
            ring.style.width = (r.width + 6) + 'px'; ring.style.height = (r.height + 6) + 'px';
        }
    };
    // A row clicked: the panel fades for a moment so the control it names shows, ringed, where it sits.
    let peekTimer = null;
    const peek = (ring) => {
        clearTimeout(peekTimer);
        root.classList.add('intro-peek');
        ring.classList.add('intro-ring-hot');
        peekTimer = setTimeout(() => { root.classList.remove('intro-peek'); ring.classList.remove('intro-ring-hot'); }, 1600);
    };
    const step = (n) => {
        stepOne.hidden = n !== 1; stepTwo.hidden = n !== 2;
        ringsOn = n === 2;
        placeRings();
        panel.scrollTop = 0;
    };

    // The entry button's act, decided once the bridge settles (DeSciX.ready() never blocks the lab), and decided again
    // whenever the sign-in state changes (maxi-auth.js re-reads it): a sign-in through the shell's SIGN IN shows here.
    let act = null;
    let settleError = null;   // a bridge that failed to settle stays shown on every re-open
    const auth = pageAuth(win);
    const decide = (state) => {
        const decided = buttonLabelFor(state);
        act = decided.action;
        entry.textContent = decided.label;
        return decided;
    };
    const settle = auth.settled.then(decide);
    auth.onChange((state) => { decide(state); });
    settle.then(() => {
        entry.disabled = false;
    }, (err) => {
        settleError = err;
        act = 'enter';
        entry.textContent = ENTRY_LABELS.enter;
        entry.disabled = false;
        showFailure(err);
    });

    let opener = null;
    const onKey = (ev) => {
        if (root.hidden) { return; }
        ev.stopPropagation();   // a key aimed at no control (focus on <body>) never reaches the lab's window listeners
        if (ev.key === 'Escape') { ev.preventDefault(); dismiss(); }
    };
    win.addEventListener('keydown', onKey, true);
    // Focus stays in the walk-through: a scene frame that takes focus by script (the 3D camera's canvas does, inert or
    // not) would carry keys straight into the lab, so focus that leaves #intro while it is open is taken back.
    const reclaim = () => {
        if (root.hidden) { return; }
        setTimeout(() => { if (!root.hidden && !root.contains(doc.activeElement)) { panel.focus(); } }, 0);
    };
    win.addEventListener('blur', reclaim);
    doc.addEventListener('focusin', reclaim, true);
    win.addEventListener('resize', () => { if (!root.hidden) { placeRings(); } });

    // While open, every other top-level element of the page is inert: no focus, no keys, no pointer reach the
    // lab behind the walk-through (its header, the stage and the scene frame, the conversation, #says, #error).
    let held = [];
    const holdPage = () => {
        held = Array.from(doc.body.children).filter((el) => el !== root && el !== backdrop && el.tagName !== 'SCRIPT' && !el.inert);
        held.forEach((el) => { el.inert = true; });
    };
    const releasePage = () => { held.forEach((el) => { el.inert = false; }); held = []; };

    function open() {
        if (!root.hidden) { return; }
        opener = doc.activeElement;
        holdPage();
        failure.hidden = true;
        if (settleError) { failure.textContent = errorText(settleError); failure.hidden = false; }
        root.hidden = false;
        backdrop.hidden = false;
        step(1);
        panel.focus();
    }
    function dismiss() {
        root.hidden = true;
        backdrop.hidden = true;
        releasePage();
        writeSeen(storageOf);
        if (opener && typeof opener.focus === 'function') { opener.focus(); }
    }

    close.addEventListener('click', dismiss);
    next.addEventListener('click', () => step(2));
    back.addEventListener('click', () => step(1));
    entry.addEventListener('click', () => {
        failure.hidden = true;
        entry.disabled = true;
        enterAct({ action: act, powch: act === 'login' ? win.DeSciX.powch : null, lab: win.MaxiLab })
            .then(dismiss, showFailure)
            .finally(() => { entry.disabled = false; });
    });

    // The way back in: a small button in the conversation head.
    const head = doc.querySelector('aside#talk .talk-head');
    if (!head) { throw new Error('[maxi-intro] app.html has no aside#talk .talk-head to carry the "What is this?" button'); }
    const again = make('button', { type: 'button', id: 'intro-open', title: 'What Maxi is, and what each control does' }, 'What is this?');
    again.addEventListener('click', open);
    head.appendChild(again);

    if (introDecision({ search: win.location.search, seen: readSeen(storageOf) }) === 'show') { open(); }
    return { open, close: dismiss, root, settled: settle };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.MaxiIntro = installIntro(window);
}
