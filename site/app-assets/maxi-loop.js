/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-loop.js — THE ONE OWNER OF THE TURN ORDER of Maxi's three roles. DOM-free ESM: the lab page runs it
 * (Tony's "Imagine…" box) and MiniMaxi's node driver runs it (minimaxi/loop.mjs); each supplies only a
 * BRAIN (how a role's thread is asked) and a BODY (how a hand runs and what its footage is). Every rule of
 * who speaks when, what each role is shown, and when the loop stops lives here and nowhere else.
 *
 * The loop runs with no human click, and the conversation carries words and clips, never code. The
 * roles stay apart (the verifier wrote none of the code, the coder set none of the plan), and every role
 * runs on its own interaction id, so each role has an
 * independent memory.
 *
 *   THE STAGE — before the Designer is asked, the loop reads what is loaded through the body's own `inventory`
 *     hand (maxi-roles.js stageOf; a refused inventory is emptyStage, its words kept). The Designer and the
 *     Builder's first turn are shown it; a plan for a scene not on it must load it (parsePlan).
 *   Designer (Maxi, the orchestrator) — Tony's message → its reading first (maxi-roles.js parseDesignerReply): an
 *     outline → words for Tony and a plan for the Builder; a question → an ANSWER in words and the memory files it
 *     drew on (emitted as designer:answer {words, memories, reading}; the words need not name the files),
 *     and the turn ENDS there: no Builder, no Owl, no
 *     hand beyond the stage's inventory, no Record (imagine resolves {answered, outline, reading, threads}); a question
 *     and an outline → the answer, then the plan as for an outline. ONE thread kept across messages (`reset()` starts
 *     a new one); its preface rides on that thread's first turn only.
 *   Builder (the implementer) — a fresh thread per outline. ONE hand call per reply (parseBuilderReply),
 *     run at once by the body; a clip the hand filmed rides on the Builder's NEXT turn with the hand's
 *     result. The reply after a filmed clip must first SAY what the clip shows (its words are kept with the
 *     clip). The last filmed clip and its call's prediction are the hand-back; `json:done` hands them to
 *     the Owl. `json:done` before any clip of this round stops the loop; `json:done` after a change (or a new
 *     world) no clip shows is REFUSED back to the Builder (emitted as builder:done-refused {round, words, refusal}), its words verbatim as the next turn (the Record's
 *     changes lie inside its footage), within the round's limits.builderTurns. The reply after a refused hand
 *     must first say in words what was refused (before its PREDICTION line), else the loop stops.
 *   Owl (the distinct verifier) — a fresh thread per verdict, shown the outline, the prediction and the
 *     clip ONLY; it accounts for the footage (`seen`) before it judges. approve → the closing turn, then the record is
 *     returned; revise → the Owl's reasons go to the Builder, who must film again.
 *   Maxi (the closing turn) — after an approve, the DESIGNER'S OWN thread is asked one words-only turn with the round's
 *     clip attached (maxi-roles.js toldTurn: the outline, the prediction, the Owl's account and reasons); his reply
 *     (parseTold) is what he tells Tony, emitted as maxi:told {round, words, clip} — the one event whose role is `maxi`,
 *     always after owl:approve and before the result, which carries it as `told: {words}`. Its ask emits designer:asking,
 *     like every Designer ask. A failed closing turn (an empty reply, one carrying a plan or a hand, or the ask throwing)
 *     never loses the build: the loop emits loop:stopped naming the closing turn and RETURNS the approved result with
 *     `told: null`, its Records and verdicts intact. After an approve, exactly one of maxi:told or loop:stopped follows.
 *
 * Stops LOUDLY (throws "Maxi stopped: …", and emits it) on: a refused question, a malformed hand-off, a
 * clip outside 5–10 s, a clip the Builder never described, a refusal the Builder answered with no words, `json:done` with no clip, more than
 * `limits.builderTurns` Builder replies in a round, `limits.rounds` revises, a hand output the body cannot
 * read (a body bug — never handed to the Builder as a refusal). Refuses to START while the human's Record
 * or Hand is on (no `tony` event: the outline was not taken); refuseWhileWorking() is the page's guard for Record and the Hand while it runs.
 *
 * The roles' prompts, knowledge bases and parsers are maxi-roles.js's; the hands are maxi-hands.js's; the
 * page's question door is maxi-ask.js's.
 *
 * BRAIN  thread(role, key) → { ask(userInput, clip|null) → Promise<reply text>, id, turns }
 *          key: 'designer' | 'builder' | 'owl-r<round>' — the brain names its thread from it.
 * BODY   run(hand, args) → Promise<{ok:true, result, clip:null|{seconds, label, firstTick, lastTick, …the body's own footage}, changes} |
 *                                  {ok:false, error, changes}>;   omit — result keys the body sends another way.
 *        `changes` — the §6 change rows the hand made, read off the world's Record (maxi-lab.js actRows), a refused hand's too.
 *        reauthors(hand) → boolean: whether the hand boots a new world (maxi-hands.js reauthors). A Record spans one
 *        world, so the approve carries the approving round's WORLDS in order, each with its changes, its clips and
 *        its inventory at open and close (maxi-record-folder.js assembleLoopRecords).
 */

'use strict';

import { buildAdapter, reauthors, CLIP_SECONDS, CLIP_FACTS } from './maxi-hands.js';
import { createThread, plainWords } from './maxi-ask.js';

export const LOOP_LIMITS = Object.freeze({
    rounds: 3,          // Owl verdicts per outline: a third "revise" stops the loop
    builderTurns: 12    // Builder replies per round before it must hand back
});

function sharesOne(a, b) { return a.some(function (x) { return b.indexOf(x) !== -1; }); }

/** THROWS unless the body's clip lasts 5–10 s (CLIP_SECONDS). */
function assertClip(hand, clip) {
    if (!clip || typeof clip.seconds !== 'number') { throw new Error(hand + ': the body handed the loop a clip with no length in seconds.'); }
    if (!(clip.seconds >= CLIP_SECONDS.min && clip.seconds <= CLIP_SECONDS.max)) {
        throw new Error(hand + ': the clip handed to the loop lasts ' + clip.seconds + ' s, outside the ' + CLIP_SECONDS.min + '–' + CLIP_SECONDS.max + ' s every clip must last.');
    }
}

/**
 * @param {object} spec
 *   roles   — the roles module (ROLES, designerTurn, builderTurn, owlTurn, toldTurn, parseDesignerReply, parseBuilderReply, parseVerdict, parseTold)
 *   brain   — see BRAIN above;  body — see BODY above
 *   onEvent — {role:'tony'|'designer'|'builder'|'owl'|'maxi'|'loop', kind, round?, …} (the conversation, the run report);
 *             the closing turn is exactly {role:'maxi', kind:'told', round, words, clip}
 *   limits  — optional {rounds, builderTurns} (defaults LOOP_LIMITS)
 *   recorder — optional, the human's Record (maxi-record.js attachRecorder): while it is recording the loop
 *              refuses to start (the page passes it; the node driver has none)
 *   hand     — optional, a live view of the human's Hand tool {enabled: boolean}: while it is on the loop
 *              refuses to start — a human drag must never land in the Builder's footage
 */
export function createLoop(spec) {
    const roles = spec && spec.roles;
    ['designerTurn', 'builderTurn', 'owlTurn', 'toldTurn', 'parseDesignerReply', 'parseBuilderReply', 'parseVerdict', 'parseTold', 'stageOf', 'emptyStage'].forEach(function (k) {
        if (!roles || typeof roles[k] !== 'function') { throw new Error('[loop] the roles module exports no ' + k + '() — maxi-roles.js and the loop disagree.'); }
    });
    if (!Array.isArray(roles.ROLE_ORDER)) { throw new Error('[loop] the roles module exports no ROLE_ORDER — maxi-roles.js owns the list of roles.'); }
    roles.ROLE_ORDER.forEach(function (k) {
        const r = roles.ROLES && roles.ROLES[k];
        if (!r || typeof r.name !== 'string' || !Array.isArray(r.knowledgebase_names)) {
            throw new Error('[loop] ROLES.' + k + ' must carry {name, knowledgebase_names[]} — maxi-roles.js and the loop disagree.');
        }
    });
    if (sharesOne(roles.ROLES.owl.knowledgebase_names, roles.ROLES.designer.knowledgebase_names)) {
        throw new Error('[loop] the Owl\'s knowledge bases [' + roles.ROLES.owl.knowledgebase_names.join(', ') + '] share one with the Designer\'s [' +
            roles.ROLES.designer.knowledgebase_names.join(', ') + '] — the Owl never receives the memories.');
    }
    if (!spec.brain || typeof spec.brain.thread !== 'function') { throw new Error('[loop] createLoop needs a brain {thread(role, key)}.'); }
    if (!spec.body || typeof spec.body.run !== 'function' || !Array.isArray(spec.body.omit) || typeof spec.body.reauthors !== 'function') { throw new Error('[loop] createLoop needs a body {run(hand, args), omit[], reauthors(hand)}.'); }
    if (typeof spec.onEvent !== 'function') { throw new Error('[loop] createLoop needs onEvent(event).'); }
    if (spec.recorder !== undefined && (!spec.recorder || typeof spec.recorder.recording !== 'boolean')) { throw new Error('[loop] createLoop\'s recorder must be the human\'s Record (attachRecorder: a boolean `recording`).'); }
    const recorder = spec.recorder || null;
    if (spec.hand !== undefined && (!spec.hand || typeof spec.hand.enabled !== 'boolean')) { throw new Error('[loop] createLoop\'s hand must be a live view of the human\'s Hand tool (a boolean `enabled`).'); }
    const hand = spec.hand || null;
    const limits = Object.assign({}, LOOP_LIMITS, spec.limits || {});
    const brain = spec.brain, body = spec.body, emit = spec.onEvent;
    const st = { designer: null, running: false, last: null };

    async function ask(role, th, text, clip) {
        emit({ role: role, kind: 'asking' });
        const reply = await th.ask(text, clip);
        if (typeof reply !== 'string') { throw new Error('the ' + role + '\'s brain answered ' + typeof reply + ', not the reply text.'); }
        return reply;
    }

    /** THE STAGE: what is loaded now, read through the body's own inventory hand (a refusal is an empty stage). */
    async function readStage() {
        const r = await body.run('inventory', {});
        if (!r || typeof r.ok !== 'boolean') { throw new Error('the body answered inventory without {ok}.'); }
        if (!r.ok) { return { stage: roles.emptyStage(r.error), inventory: null }; }
        try { return { stage: roles.stageOf(r.result), inventory: r.result }; }
        catch (err) { throw new Error('the body\'s inventory is not a stage (' + String((err && err.message) || err) + ') — a body bug, so the loop stopped.'); }
    }

    /**
     * Why a json:done cannot hand back yet, in words, or null: the last world has no clip (a loadScene/openSketch no clip
     * shows), or a world has changes after its last clip. A Record's changes lie inside its footage (the design §6).
     */
    function doneRefusal(worlds) {
        const now = worlds[worlds.length - 1];
        if (!now.clips.length) { return 'json:done after a loadScene/openSketch that no clip shows — your last clip shows a world that was replaced; film the new world.'; }
        for (let i = 0; i < worlds.length; i++) {
            const w = worlds[i];
            if (w.changes.length > w.changesAt) {
                return 'json:done after ' + (w.changes.length - w.changesAt) + ' change(s) your last clip does not show (the first: ' + w.changes[w.changesAt].op + ' of ' +
                    w.changes[w.changesAt].name + ') — a Record\'s changes lie inside its footage; film again after the last change.';
            }
        }
        return null;
    }

    function newWorld(before) { return { before: before, after: null, afterRefused: null, changes: [], clips: [], changesAt: 0 }; }

    /** The changes a hand made, as the body reports them: an array always, a refused hand's included. */
    function changesOf(hand, ran) {
        if (!Array.isArray(ran.changes)) { throw new Error('the body answered ' + hand + ' without `changes` (the writes it made) — a Record could not state them, so the loop stopped.'); }
        return ran.changes;
    }

    /** One round of Builder replies, ending in json:done after a described clip. */
    /** The inventory as the body reads it now: {inventory} | {inventory: null, refused}. */
    async function inventoryNow() {
        const r = await body.run('inventory', {});
        if (!r || typeof r.ok !== 'boolean') { throw new Error('the body answered inventory without {ok}.'); }
        return r.ok ? { inventory: r.result, refused: null } : { inventory: null, refused: r.error };
    }

    /**
     * One round of Builder replies, ending in json:done after a described clip. `worlds` holds the round's booted worlds
     * in order ({before, after, afterRefused, changes, clips:[{hand, clip}], changesAt}); a re-authoring hand (the
     * body's reauthors(hand)) closes the current world — its inventory read just before the hand — and opens the next.
     * A Record spans exactly one world (the design §6).
     */
    async function build(ctx, builder, round, steps, worlds) {
        let text = ctx.revise ? roles.builderTurn({ revise: ctx.revise }) : roles.builderTurn({ plan: ctx.plan, stage: ctx.stage });
        let clip = null;      // the clip that rides on the NEXT Builder turn
        let last = null;      // {clip, prediction, hand, words, awaitingWords}
        let refused = null;   // the hand refused on the last turn: the next reply must say in words what was refused
        for (let n = 1; n <= limits.builderTurns; n++) {
            const got = await ask('builder', builder, text, clip);
            let reply;
            try { reply = roles.parseBuilderReply(got); }
            catch (err) { throw new Error('the Builder\'s answer is malformed, so the loop stopped: ' + String((err && err.message) || err)); }
            if (last && last.awaitingWords) {
                if (!reply.words.trim()) { throw new Error('the Builder did not say what its clip shows before its next block — it must describe the footage it filmed, so the loop stopped.'); }
                last.words = reply.words; last.awaitingWords = false;
            }
            if (refused && !reply.said.trim()) {
                throw new Error('the Builder answered the refusal of its ' + refused + ' with no words before its next block — it must say which part and key were refused and why, never retry silently, so the loop stopped.');
            }
            refused = null;
            const words = plainWords(reply.words).text;
            if (reply.kind === 'done') {
                if (!last) { throw new Error('the Builder said json:done before filming any clip — its hand-back is a clip, so the loop stopped.'); }
                const unfilmed = doneRefusal(worlds);
                if (unfilmed) {   // the Builder can repair it: the refusal is its next turn, verbatim, and the conversation shows it (maxi-talk.js DONE_REFUSED)
                    emit({ role: 'builder', kind: 'done-refused', round: round, words: words, refusal: unfilmed });
                    text = roles.builderTurn({ doneRefused: unfilmed });
                    clip = null;
                    continue;
                }
                return { prediction: last.prediction, clip: last.clip, hand: last.hand, words: last.words, doneWords: words };
            }
            const reboots = body.reauthors(reply.hand) === true;
            const closing = reboots ? await inventoryNow() : null;   // the world as this hand finds it: the close of its Record
            const ran = await body.run(reply.hand, reply.args);
            if (!ran || typeof ran.ok !== 'boolean') { throw new Error('the body answered ' + reply.hand + ' without {ok}.'); }
            const world = worlds[worlds.length - 1];
            Array.prototype.push.apply(world.changes, changesOf(reply.hand, ran));
            clip = (ran.ok && ran.clip) ? ran.clip : null;
            if (clip) { assertClip(reply.hand, clip); world.clips.push({ hand: reply.hand, clip: clip }); world.changesAt = world.changes.length; last = { clip: clip, prediction: reply.prediction, hand: reply.hand, words: null, awaitingWords: true }; }
            if (reboots && ran.ok) {   // a new world: this Record closes, the next act opens a new one
                world.after = closing.inventory; world.afterRefused = closing.refused;
                const opened = await inventoryNow();
                worlds.push(newWorld(opened.inventory));
            }
            if (!ran.ok) { refused = reply.hand; }
            steps.push({ hand: reply.hand, args: reply.args });
            emit({ role: 'builder', kind: 'working', round: round, words: words, hand: reply.hand, args: reply.args, prediction: reply.prediction,
                ok: ran.ok, result: ran.ok ? ran.result : undefined, error: ran.ok ? undefined : ran.error, clip: clip });
            text = roles.builderTurn({
                results: [ran.ok ? { hand: reply.hand, ok: true, result: ran.result } : { hand: reply.hand, ok: false, error: ran.error }],
                footageAttached: !!clip, omit: body.omit
            });
        }
        throw new Error('the Builder did not hand back (json:done) within ' + limits.builderTurns + ' replies in round ' + round + ', so the loop stopped.');
    }

    async function imagine(outline) {
        if (typeof outline !== 'string' || !outline.trim()) { throw new Error('[loop] imagine needs an outline in words.'); }
        if (st.running) { throw new Error('[loop] Maxi is still working on the last outline — wait for it.'); }
        const busy = [];
        if (recorder && recorder.recording) { busy.push('Record is on (a segment is rolling) — press Stop (R) first; the loop films with the same recorder'); }
        if (hand && hand.enabled) { busy.push('the Hand is on — put it down (H or Esc) first; a human drag must never land in the Builder\'s footage'); }
        if (busy.length) {   // refused before Tony's words are taken: the page keeps the outline in its box
            const words = 'Maxi did not start on "' + outline.trim() + '": ' + busy.join('; and ') + '.';
            emit({ role: 'loop', kind: 'refused', words: words });
            throw new Error(words);
        }
        st.running = true;
        outline = outline.trim();
        emit({ role: 'tony', kind: 'said', words: outline });
        try {
            const read = await readStage();
            const stage = read.stage;
            if (!st.designer) { st.designer = brain.thread('designer', 'designer'); }
            const parsed = roles.parseDesignerReply(await ask('designer', st.designer, roles.designerTurn({ outline: outline, first: st.designer.turns === 0, stage: stage }), null), stage);
            const answered = parsed.answer ? { words: plainWords(parsed.answer.words).text, memories: parsed.answer.memories.slice() } : null;
            if (answered) {   // a question: the answer in words and the memory files it drew on (maxi-talk.js ANSWERED)
                emit({ role: 'designer', kind: 'answer', words: answered.words, memories: answered.memories.slice(), reading: parsed.reading });
            }
            if (!parsed.plan) {   // nothing to build: the turn ends with the answer — no Builder, no Owl, no Record
                return { answered: answered, outline: outline, reading: parsed.reading, threads: { designer: st.designer.id } };
            }
            emit({ role: 'designer', kind: 'plan', words: plainWords(parsed.words).text, plan: parsed.plan, prediction: parsed.plan.prediction, stage: stage });
            const builder = brain.thread('builder', 'builder');
            const ctx = { plan: parsed.plan, stage: stage, revise: null };
            const steps = [];
            let before = read.inventory;   // the round's first world's start: the stage for round 1, re-read for each later round
            const verdicts = [];
            let lastReasons = [];
            for (let round = 1; round <= limits.rounds; round++) {
                if (round > 1) { before = (await inventoryNow()).inventory; }
                const worlds = [newWorld(before)];   // the approving ROUND's worlds become its Records, one per world (the design §6)
                const built = await build(ctx, builder, round, steps, worlds);
                emit({ role: 'builder', kind: 'built', round: round, words: built.doneWords, prediction: built.prediction, clip: built.clip });
                const owl = brain.thread('owl', 'owl-r' + round);
                const owlText = roles.owlTurn({ outline: outline, prediction: built.prediction });   // outline + prediction ONLY: never the plan
                const v = roles.parseVerdict(await ask('owl', owl, owlText, built.clip));
                verdicts.push({ round: round, verdict: v.verdict, owl: owl.id, builder: builder.id });
                emit({ role: 'owl', kind: v.verdict, round: round, verdict: v, words: plainWords(v.words).text, seen: v.seen, reasons: v.reasons, change: v.change,
                    clip: built.clip, prediction: built.prediction });
                if (v.verdict === 'approve') {
                    const after = await inventoryNow();   // the last world's close; a refusal is kept in words (the Record assembly refuses it)
                    worlds[worlds.length - 1].after = after.inventory; worlds[worlds.length - 1].afterRefused = after.refused;
                    // THE CLOSING TURN: Maxi, on his own thread, tells Tony what the approved clip shows. A failure is emitted as
                    // loop:stopped naming the closing turn, and the approved result is still returned (told: null): the build stands.
                    const ticks = (Number.isInteger(built.clip.firstTick) && Number.isInteger(built.clip.lastTick)) ? { first: built.clip.firstTick, last: built.clip.lastTick } : null;
                    let told = null;
                    try {
                        told = roles.parseTold(await ask('designer', st.designer, roles.toldTurn({ outline: outline, prediction: built.prediction, owl: { seen: v.seen, reasons: v.reasons }, ticks: ticks }), built.clip));
                    } catch (err) {
                        emit({ role: 'loop', kind: 'stopped', words: 'Maxi stopped before telling you what the approved clip shows: the closing turn failed — ' + String((err && err.message) || err) + ' The build was approved and is kept.' });
                    }
                    if (told) { emit({ role: 'maxi', kind: 'told', round: round, words: told.words, clip: built.clip }); }
                    st.last = {
                        worlds: worlds.map(function (w) { return { before: w.before, after: w.after, afterRefused: w.afterRefused, changes: w.changes.slice(), clips: w.clips.slice() }; }),
                        outline: outline, verdict: 'approve', rounds: round, plan: parsed.plan, designerWords: parsed.words, steps: steps.slice(),
                        clip: built.clip, prediction: built.prediction, builderWords: built.words, owl: v, verdicts: verdicts,
                        threads: { designer: st.designer.id, builder: builder.id, owl: owl.id }, told: told ? { words: told.words } : null
                    };
                    return st.last;
                }
                ctx.revise = v;   // parseVerdict's output as-is (builderTurn reads {reasons, change}); the next round must film again
                lastReasons = v.reasons;
            }
            throw new Error('the Owl sent it back ' + limits.rounds + ' times (max rounds) — last reasons: ' + lastReasons.join(' · ') + '; the loop stopped.');
        } catch (err) {
            const e = new Error('Maxi stopped: ' + String((err && err.message) || err));
            emit({ role: 'loop', kind: 'stopped', words: e.message });
            throw e;
        } finally {
            st.running = false;
        }
    }

    return {
        imagine: imagine,
        get running() { return st.running; },
        get designerId() { return st.designer ? st.designer.id : null; },
        last: function () { return st.last; },
        reset: function () { if (st.running) { throw new Error('[loop] cannot start a new conversation while Maxi is working.'); } st.designer = null; }
    };
}

/**
 * THE guard for the human's tools while the loop runs: THROWS naming `tool` while Maxi is working (the
 * Builder's hands drive the stage and film with the same recorder). `loop` may be null (not made yet).
 */
export function refuseWhileWorking(loop, tool) {
    if (typeof tool !== 'string' || !tool) { throw new Error('[loop] refuseWhileWorking needs the tool\'s name.'); }
    if (loop && loop.running) { throw new Error(tool + ' is refused while Maxi is working — the Builder is driving the stage and filming; wait until he stops.'); }
}

// ── the lab page's brain and body ─────────────────────────────────────────────────────────────

/** The page's BRAIN: one maxi-ask thread per role thread, asked through the shell's command door; a clip rides as media[]. */
export function threadBrain(spec) {
    if (!spec || typeof spec.call !== 'function' || !spec.roles || !spec.roles.ROLES) { throw new Error('[loop] threadBrain needs {call, roles}.'); }
    return {
        thread: function (role) {
            const th = createThread({ call: spec.call, knowledgebaseNames: spec.roles.ROLES[role].knowledgebase_names.slice() });
            return {
                get id() { return th.id; },
                get turns() { return th.turns; },
                ask: function (userInput, clip) {
                    const q = { op: role, userInput: userInput };
                    if (clip) { q.media = [clip.media]; }
                    return th.ask(q).then(function (r) { return r.answer; });
                }
            };
        }
    };
}

/**
 * The page's BODY: a hand runs through the HANDS table's own adapter (the dispatch publishHands feeds),
 * over the lab with its `ask` replaced by a HOLD — a footage hand's clip is kept for the Builder's next
 * turn, never asked about. The clip is {media, seconds, label} (the hand result's CLIP_FACTS).
 */
export function labBody(spec) {
    if (!spec || !spec.hands || !spec.lab) { throw new Error('[loop] labBody needs {hands, lab}.'); }
    if (typeof spec.lab.actRows !== 'function') { throw new Error('[loop] labBody\'s lab publishes no actRows(act) — a hand\'s rows are read off the world\'s Record (maxi-lab.js).'); }
    return {
        omit: [],
        reauthors: function (hand) { return Object.prototype.hasOwnProperty.call(spec.hands, hand) && reauthors(spec.hands, hand); },
        run: async function (hand, args) {
            let held = null;
            const loopLab = Object.assign({}, spec.lab, {
                ask: async function (op, q) {
                    if (held || q.media.length !== 1) { throw new Error(op + ': one hand call films one clip for the loop (got ' + (held ? 'a second' : q.media.length) + ').'); }
                    held = q.media[0];
                    return { asked: false, interaction_id: null, answer_excerpt: null };
                }
            });
            const adapter = buildAdapter(spec.hands, loopLab);
            if (typeof adapter[hand] !== 'function') { return { ok: false, error: 'no hand "' + hand + '" — the hands are [' + Object.keys(spec.hands).join(', ') + '].', changes: [] }; }
            const ran = await spec.lab.actRows(function () { return adapter[hand](args); });   // the hand's rows, read off the world's Record (maxi-lab.js)
            if (!ran.ok) { return { ok: false, error: ran.error, changes: ran.changes }; }   // a hand's own refusal goes back to the Builder verbatim
            const raw = ran.value;
            let result;
            try { result = JSON.parse(raw); }
            catch (err) {   // a body bug, not the Builder's to fix: it stops the loop
                throw new Error('the body could not read the ' + hand + ' hand\'s output (' + String((err && err.message) || err) + ') — the hand returned ' +
                    (typeof raw === 'string' ? JSON.stringify(raw.slice(0, 200)) : String(raw)) + '; a body bug, so the loop stopped.');
            }
            return { ok: true, result: result, changes: ran.changes, clip: held ? { media: held, seconds: result[CLIP_FACTS.seconds], label: result[CLIP_FACTS.label],
                firstTick: result[CLIP_FACTS.firstTick], lastTick: result[CLIP_FACTS.lastTick] } : null };
        }
    };
}
