/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-ask.js — THE QUESTION DOOR: the one owner of how the lab hands footage to Maxi.
 *
 * Every clip the lab films or replays (`see`, `dragTo`, `record`, `showMemory`, a human's Record
 * demonstration) goes to Maxi as `media[]` on ONE call of the platform's question command,
 * `ask_question_to_app`, made by the page itself through the shell's command door
 * `window.DeSciX.call(command, params)` (site/DeSciXAppSDK.js: it THROWS standalone). The chat
 * pane's attachment door is not used: measured 2026-10-14,
 * a clip staged there reaches the model as the text "[attached video/mp4 — …]", while the same clip
 * on the question's `media[]` was described with media_tokens 300.
 *
 * The contract below is the handbook's (`descix tell-me-how`, origin env: prod … https://descix.net,
 * 2026-10-14), never re-typed elsewhere:
 *   - `media[]` items {mime_type, data (raw base64, NO data: URL) | asset_ref, label?, truncated?, track?};
 *   - "up to 8 attachments/turn, 8 MiB each, 16 MiB per turn. Oversized media is REJECTED, not truncated";
 *   - "pass the interaction_id returned by the previous response as previous_interaction_id" — the
 *     thread is server-side; media already sent persists in it ("do NOT resend").
 *
 * The App Shell does not expose its chat pane's interaction id to an app (no SDK member, no handbook
 * line; the PWA keeps it in its own state), so the PAGE OWNS ONE THREAD: the first question starts it,
 * every later question continues it with previous_interaction_id. `reset()` starts a new one.
 *
 * Fail loud: a refused call (auth, size, mime, an expired thread) is thrown verbatim — no fallback to
 * text, no retry. The resolve shape of DeSciX.call inside the shell is undocumented; the measured body
 * of this command is {status, response, interaction_id, usage} (the CLI wraps it as {status, message:
 * body}); `readAnswer` reads exactly that body, wrapped or bare, and refuses anything else by its keys.
 */

'use strict';

export const ASK = Object.freeze({
    command: 'ask_question_to_app',
    app_id: 'egpt-godsworld',
    knowledgebase_names: Object.freeze(['GodsWorld'])
});

const MiB = 1024 * 1024;

/** The handbook's media limits (8 attachments/turn, 8 MiB each, 16 MiB per turn), counted on the decoded bytes. */
export const MEDIA_LIMITS = Object.freeze({ perTurn: 8, eachBytes: 8 * MiB, turnBytes: 16 * MiB });

/** The one mime the lab films and replays (FrqtlVision.record → mediabunny MP4; memories/<id>/clip.mp4). */
export const FOOTAGE_MIME = 'video/mp4';

/** What every footage question asks after the note. Words only: this turn is for looking. */
export const LOOK_QUESTION =
    'Describe exactly what you see in this footage: the colours, the objects and where they sit, what moves and ' +
    'where it goes, frame by frame if it changes. Say only what the pixels show — if your memories say something ' +
    'the footage does not show, say that it is not in the footage. Answer in words only, with no action block: ' +
    'this turn is for looking.';

/** How much of Maxi's answer (its plain words) rides back in a hand's result (the whole answer is on the lab's conversation strip). */
export const ANSWER_EXCERPT_CHARS = 600;

/** Decoded byte length of a raw base64 string (padding-aware); THROWS on a data: URL or a non-base64 string. */
export function base64Bytes(b64, where) {
    if (typeof b64 !== 'string' || !b64.length) { throw new Error(where + ': media `data` must be a non-empty raw base64 string.'); }
    if (/^data:/i.test(b64)) { throw new Error(where + ': media `data` is a data: URL — the question command takes RAW base64 (strip "data:…;base64,").'); }
    if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
        throw new Error(where + ': media `data` is not raw base64 (length ' + b64.length + ', or a character outside A-Z a-z 0-9 + / =).');
    }
    const pad = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
    return (b64.length / 4) * 3 - pad;
}

function mibText(n) { return (Math.round((n / MiB) * 100) / 100) + ' MiB'; }

/**
 * The knowledge bases a question searches: `ASK.knowledgebase_names` unless the caller names its own
 * (a node body runs one thread per role, each with its own KB list). An EMPTY list does not search
 * nothing: measured on PROD 2026-10-14, [] and an absent list both retrieved KB GodsWorld (the app's
 * default). A given list must be an array of non-empty strings, else THROWS.
 */
export function knowledgebaseNamesOf(names, op) {
    if (names === undefined || names === null) { return ASK.knowledgebase_names.slice(); }
    if (!Array.isArray(names) || !names.every(function (n) { return typeof n === 'string' && n.trim() !== ''; })) {
        throw new Error((op || 'ask') + ': knowledgebase_names must be an array of KB names, got ' + JSON.stringify(names) + '. Nothing was asked.');
    }
    return names.slice();
}

/**
 * The question's params, checked against the handbook's media contract BEFORE anything is sent.
 * `media` is a non-empty array of footage, or OMITTED for a words-only turn (then `params.media` is
 * absent); an explicit empty array is refused by name — it is a footage question that lost its clip.
 * `knowledgebaseNames` is optional (knowledgebaseNamesOf).
 */
export function buildAskParams(spec) {
    const op = (spec && spec.op) || 'ask';
    if (!spec || typeof spec.userInput !== 'string' || !spec.userInput.trim()) { throw new Error(op + ': a question needs user_input text.'); }
    const media = spec.media;
    const params = {
        app_id: ASK.app_id,
        knowledgebase_names: knowledgebaseNamesOf(spec.knowledgebaseNames, op),
        user_input: spec.userInput
    };
    if (spec.previousInteractionId) { params.previous_interaction_id = spec.previousInteractionId; }
    if (media === undefined || media === null) { return params; }   // a words-only turn
    if (!Array.isArray(media) || !media.length) {
        throw new Error(op + ': an empty or non-array media (' + JSON.stringify(media) + ') — a footage question carries media[] — none was given, so nothing was asked. Omit `media` for a words-only turn.');
    }
    if (media.length > MEDIA_LIMITS.perTurn) {
        throw new Error(op + ': ' + media.length + ' attachments in one turn; the question command takes at most ' + MEDIA_LIMITS.perTurn + ' per turn. Nothing was asked.');
    }
    let total = 0;
    const items = media.map(function (m, i) {
        const where = op + ' (attachment ' + (i + 1) + ')';
        if (!m || m.mime_type !== FOOTAGE_MIME) {
            throw new Error(where + ': mime_type ' + JSON.stringify(m && m.mime_type) + ' — the lab hands Maxi ' + FOOTAGE_MIME + ' footage only. Nothing was asked.');
        }
        const bytes = base64Bytes(m.data, where);
        if (bytes > MEDIA_LIMITS.eachBytes) {
            throw new Error(where + ': ' + mibText(bytes) + ' is over the question command\'s ' + mibText(MEDIA_LIMITS.eachBytes) + ' per attachment (oversized media is rejected, not truncated). Nothing was asked.');
        }
        total += bytes;
        const item = { mime_type: m.mime_type, data: m.data };
        if (typeof m.label === 'string' && m.label) { item.label = m.label; }
        if (m.truncated === true) { item.truncated = true; }
        return item;
    });
    if (total > MEDIA_LIMITS.turnBytes) {
        throw new Error(op + ': ' + mibText(total) + ' of footage in one turn is over the question command\'s ' + mibText(MEDIA_LIMITS.turnBytes) + ' per turn. Nothing was asked.');
    }
    params.media = items;
    return params;
}

/**
 * Maxi's answer out of what the command door resolved: {answer, interaction_id, usage, model}.
 * Reads the measured body {status:'OK', response, interaction_id, usage} — bare, or as the
 * envelope's `message`. Any other status, or a body without a string `response` and an
 * `interaction_id`, THROWS with what came back.
 */
export function readAnswer(result, op) {
    op = op || 'ask';
    if (!result || typeof result !== 'object') { throw new Error(op + ': the question command answered ' + JSON.stringify(result) + ' — no answer object.'); }
    if (result.status !== undefined && result.status !== 'OK') { throw new Error(op + ': the question command refused: ' + JSON.stringify(result)); }
    const body = (result.message && typeof result.message === 'object') ? result.message : result;
    if (body.status !== undefined && body.status !== 'OK') { throw new Error(op + ': the question command refused: ' + JSON.stringify(body)); }
    if (typeof body.response !== 'string' || typeof body.interaction_id !== 'string' || !body.interaction_id) {
        throw new Error(op + ': the question command answered without {response, interaction_id} — keys: [' + Object.keys(body).join(', ') +
            ']' + (body !== result ? ' (inside `message`; envelope keys: [' + Object.keys(result).join(', ') + '])' : '') + '.');
    }
    return {
        answer: body.response,
        interaction_id: body.interaction_id,
        usage: (body.usage && typeof body.usage === 'object') ? body.usage : null,
        model: body.model_used || (body.usage && body.usage.model_used) || null
    };
}

/** The first `n` characters of an answer, cut at a word when it is longer. */
export function excerpt(text, n) {
    n = n || ANSWER_EXCERPT_CHARS;
    if (text.length <= n) { return text; }
    const cut = text.slice(0, n);
    const sp = cut.lastIndexOf(' ');
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + ' …';
}

/** An answer as plain words for the strip: fenced blocks (code, action blocks) are left out and said to be. */
export function plainWords(text) {
    let fenced = 0;
    const words = String(text).replace(/```[\s\S]*?(```|$)/g, function () { fenced += 1; return ''; })
        .replace(/\n{3,}/g, '\n\n').trim();
    return { text: words, fenced: fenced };
}

/**
 * ONE thread with Maxi, owned by the page.
 *   call(command, params) → Promise — the shell's command door (window.DeSciX.call), injected;
 *   onTurn({phase:'asking'|'answered'|'refused', op, note, userInput, media, answer?, error?, interaction_id?}) — the strip;
 *   knowledgebaseNames — optional, the thread's KB list (knowledgebaseNamesOf);
 *   resume — optional {interaction_id, turns}: continue a thread a previous process kept (minimaxi's threads.json).
 * ask({op, userInput, media?, note?}) — media omitted = a words-only turn — resolves {asked:true, interaction_id, answer, answer_excerpt, usage, model}.
 */
export function createThread(spec) {
    if (!spec || typeof spec.call !== 'function') { throw new Error('[ask] createThread needs call(command, params) — the shell\'s command door.'); }
    const onTurn = typeof spec.onTurn === 'function' ? spec.onTurn : function () {};
    const kbs = knowledgebaseNamesOf(spec.knowledgebaseNames, 'createThread');
    const st = { id: null, turns: 0 };
    if (spec.resume !== undefined && spec.resume !== null) {
        const r = spec.resume;
        if (!r || typeof r.interaction_id !== 'string' || !r.interaction_id || !Number.isInteger(r.turns) || r.turns < 1) {
            throw new Error('[ask] createThread resume must be {interaction_id (string), turns (whole number ≥ 1)}, got ' + JSON.stringify(r) + '.');
        }
        st.id = r.interaction_id; st.turns = r.turns;
    }
    return {
        get id() { return st.id; },
        get turns() { return st.turns; },
        reset: function () { st.id = null; st.turns = 0; },
        ask: async function (q) {
            const op = q.op || 'ask';
            const params = buildAskParams({ op: op, userInput: q.userInput, media: q.media, previousInteractionId: st.id, knowledgebaseNames: kbs });
            const turn = { op: op, note: (typeof q.note === 'string' && q.note) ? q.note : q.userInput, userInput: q.userInput, media: (params.media || []).map(function (m) { return { mime_type: m.mime_type, label: m.label || null, bytes: base64Bytes(m.data, op) }; }) };
            onTurn(Object.assign({ phase: 'asking' }, turn));
            let got;
            try {
                got = readAnswer(await spec.call(ASK.command, params), op);
            } catch (err) {
                const e = new Error(op + (params.media ? ': Maxi was NOT shown the footage — ' : ': the question was NOT answered — ') + String((err && err.message) || err) +
                    (st.id ? ' (the lab\'s thread ' + st.id.slice(0, 16) + '… is kept; "New thread" starts a fresh one)' : ''));
                onTurn(Object.assign({ phase: 'refused', error: e.message }, turn));
                throw e;
            }
            st.id = got.interaction_id;
            st.turns += 1;
            onTurn(Object.assign({ phase: 'answered', answer: got.answer, interaction_id: got.interaction_id, usage: got.usage }, turn));
            return {
                asked: true, interaction_id: got.interaction_id, answer: got.answer, answer_excerpt: excerpt(plainWords(got.answer).text),
                usage: got.usage, model: got.model
            };
        }
    };
}

/** The user_input of a footage question: the note that rides with the clip, then the question. ONE composition. */
export function footageUserInput(note) {
    if (typeof note !== 'string' || !note.trim()) { throw new Error('[ask] a footage question needs the note that says what was filmed.'); }
    return note.trim() + '\n\n' + LOOK_QUESTION;
}
