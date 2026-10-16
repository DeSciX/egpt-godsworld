/* Copyright 2023-2026 by Essam Abadir */

/**
 * replay-door.mjs — a REPLAY DOUBLE of the App Shell's command door, for tests and the served LOOK only.
 * It is never in site/: a node test calls `replayDoor` directly, and the LOOK harness injects
 * `installReplayDoor` into the page before it loads (Playwright addInitScript). The page itself has no
 * flag that turns it on.
 *
 * It answers `ask_question_to_app` from a fixture of answers in the measured body shape
 * {status, response, interaction_id, usage}, wrapped as the CLI wraps it ({status, auth_status, message}).
 * Each role is answered from its own queue, in order, told apart by its THREAD — never by its knowledge
 * bases (two roles may share one): a continuing turn carries the role's own previous interaction id
 * (the fixture's ids are `replay.<role>.<n>`); a thread's first turn opens with that role's preface
 * (maxi-roles.js ROLES[role].preface, passed in). Every params bag is recorded. An exhausted queue, a
 * question no role owns, or another command THROWS.
 *
 * `installReplayDoor` is self-contained (no closure over this module) so its source can be injected.
 */

/** The double for a node test: {call, sent} — the same door installReplayDoor puts on a page, with no delay. */
export function replayDoor(fixture, prefaceOfRole) {
    const win = {};
    win.top = win;
    installReplayDoor(win, fixture, prefaceOfRole, 0);
    return { call: win.DeSciX.call, sent: win.__replaySent };
}

/** Installs the double as window.DeSciX in the TOP window (a shell bus: call + view, no chat). Self-contained. */
export function installReplayDoor(win, fixture, prefaceOfRole, delayMs) {
    if (win.top !== win) { return; }
    const next = { designer: 0, builder: 0, owl: 0 };
    const roleOf = function (params) {
        const prev = params.previous_interaction_id;
        if (prev) {
            const m = /^replay\.(designer|builder|owl)\./.exec(prev);
            if (!m) { throw new Error('[replay] previous_interaction_id ' + JSON.stringify(prev) + ' is no thread this double answered'); }
            return m[1];
        }
        const r = Object.keys(prefaceOfRole).filter(function (k) { return params.user_input.indexOf(prefaceOfRole[k]) === 0; });
        if (r.length !== 1) { throw new Error('[replay] a first turn that opens with ' + (r.length ? 'several' : 'no') + ' role preface: ' + JSON.stringify(params.user_input.slice(0, 80))); }
        return r[0];
    };
    win.__replaySent = [];
    win.DeSciX = {
        bridge: { version: 'replay-double', ready: true, EVENT: 'descix:bridge-ready', members: function () { return ['call', 'view']; } },
        ready: async function () { return { mode: 'shell', members: ['call', 'view'], version: 'replay-double' }; },
        call: async function (command, params) {
            if (command !== 'ask_question_to_app') { throw new Error('[replay] the double answers ask_question_to_app only, got ' + command); }
            const role = roleOf(params);
            const q = fixture[role];
            if (next[role] >= q.length) { throw new Error('[replay] the ' + role + ' queue is exhausted after ' + q.length + ' answers'); }
            const body = q[next[role]++];
            win.__replaySent.push({ role: role, params: params });
            if (delayMs) { await new Promise(function (r) { setTimeout(r, delayMs); }); }   // a visible "thinking" beat in the LOOK
            return { status: 'OK', auth_status: 'CONNECTED', message: body };
        },
        view: { available: function () { return false; }, set: function (m) { return m; } }
    };
}
