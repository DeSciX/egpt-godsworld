/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-roles.js — THE ONE OWNER of Maxi's three roles: who each is, what it knows, what it is told
 * first, what it hands on, and how a hand-off is read. ESM, no DOM, no node built-ins: the lab page and
 * MiniMaxi (minimaxi/loop.mjs, scripts/gen-plugin-agents.mjs) import the same object.
 *
 * The three roles: the Designer is Maxi —
 * JARVIS to the user's Tony Stark; the Builder is the director of engineering; the Owl is the QA
 * team. Each metaphor maps onto what an LLM calls its own sub-agents when it
 * orchestrates them — so: ORCHESTRATOR, IMPLEMENTER, distinct VERIFIER. Each role has an
 * independent memory: every role runs on its OWN thread (its own
 * interaction id), and the roles stay apart — the verifier wrote none of the code, the coder set none
 * of the plan: a role sees only what its turn builder below puts in front of it.
 *
 * The persona (assets/system_instructions.md) is the system prompt of a question on PROD that names the
 * KB GodsWorld — measured 2026-10-14: a question naming only KB General answers as a generic assistant
 * ("Your identity is fixed"), with no persona and no memories. `persona` below says whether a role runs
 * under it; a generated local agent carries the persona exactly when its role does. A preface ADDS the
 * role, it never copies the persona. Hands are the
 * hands table's (maxi-hands.js HANDS) — a hand name is checked against it, never re-listed here.
 *
 * Hand-offs are fenced blocks in the persona's own shape (```json:call:<hand>), one per reply:
 *   Designer → its FIRST line reads the message (READING_LINE + one of DESIGNER_READINGS), then
 *              ```json:answer   {memories:[<memory file>, …]}   (a question: the words before it are the answer; no plan)
 *              ```json:plan     {scene, registryMode, changes:[{object, param, value, why}], hands:[…], prediction}
 *              (an outline; a plan names a scene ID; 2D or 3D is the loaded world's, read from the stage — never planned)
 *              or the answer block THEN the plan block (a question and an outline) — parseDesignerReply
 *   Builder  → ```json:call:<hand> {…args}  + a line `PREDICTION: …` (what the hand will show, stated first)
 *              ```json:done     {}            (the last clip it filmed is its hand-back)
 *   Owl      → ```json:verdict  {seen:{contact, after, passes}, verdict:"approve"|"revise", reasons:[…], change}
 * Every parser THROWS on a malformed hand-off, naming what is wrong and quoting what came back: the
 * loop stops loudly, it never guesses.
 *
 * THE STAGE is what is loaded in the lab when an outline arrives (the `inventory` hand's result, keys
 * maxi-hands.js INVENTORY_KEYS): the Designer and the Builder are shown it in words (stageWords), and a plan
 * whose scene is not on it must load it (parsePlan), so a plan can switch scenes and reach a 3D scene from
 * any stage. The Owl is never shown it.
 */

'use strict';

import { HANDS, CLIP_FACTS, INVENTORY_KEYS, SKETCH_KEYS, spansOf } from './maxi-hands.js';

/** The fence tags of the hand-offs (the hands' own tag is the persona's `json:call:<hand>`). */
export const HANDOFF_TAGS = Object.freeze({ plan: 'json:plan', answer: 'json:answer', call: 'json:call:', done: 'json:done', verdict: 'json:verdict' });

/**
 * What the Builder is asked after a refused hand: the refusal's own words say whether anything moved (a hand refused
 * before it wrote moved nothing; a sketch that did not take a hand says the world changed), so the turn never adds a
 * claim of its own. The loop stops a Builder that answers a refusal with no words (maxi-loop.js).
 */
export const REFUSAL_ASK = 'Before your next block, say in words which part and which key it refused and why (the refusal ' +
    'says whether anything moved); the same hand sent again unchanged is refused again.';

/**
 * THE LAST CLIP: the Owl judges a round's LAST clip only (owlTurn), so a round ends on the act that SHOWS its change.
 * `shows` films its own change, before-state and after (a dragTo films the move); `looks` films the world as it
 * stands. A plan whose hands close with `looks` straight after `shows` (nothing between them but more looks) hands the
 * Owl a clip with no before-state (trial mmt41a, round 1), and parsePlan refuses it; a plan of looks only stays allowed,
 * and a look after another change (a setDeclared, a setCamera) is that change's clip. LAST_CLIP_RULE is the rule's words,
 * in the Designer's and the Builder's prefaces; both hands are HANDS keys, checked here.
 */
export const LAST_CLIP = Object.freeze({ shows: 'dragTo', looks: 'see' });
Object.keys(LAST_CLIP).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(HANDS, LAST_CLIP[k])) { throw new Error('[roles] LAST_CLIP.' + k + ' names "' + LAST_CLIP[k] + '", which is not a hand in maxi-hands.js HANDS.'); }
});
export const LAST_CLIP_RULE = 'THE LAST CLIP IS THE ONE THE OWL JUDGES: it sees no earlier clip of the round, so the round ends on ' +
    'the act that SHOWS the change. A ' + LAST_CLIP.shows + ' films its own change, from where the part was to where it ' +
    'lands; a ' + LAST_CLIP.looks + ' straight after it hides that change behind a clip with no before-state. Use ' +
    LAST_CLIP.looks + ' before a change, after a change no hand films (a setDeclared) or for framing (after a setCamera), ' +
    'never as the closing act after a ' + LAST_CLIP.shows + '.';

/** The Owl's two words. */
export const VERDICTS = Object.freeze(['approve', 'revise']);

/**
 * The Owl's account of the footage, written BEFORE its verdict and judged against (verifier run vfyplat1:
 * an Owl that only described the clip approved a beam meeting the mirror's TOP tip for an outline asking
 * for its bottom end). Each key is a question the Owl must answer from the pixels, in words.
 */
export const SEEN_ACCOUNT = Object.freeze({
    contact: 'where the moving thing (a beam, a stream, a particle) first meets each part it reaches: name the part and the third of it — top / middle / bottom third (left / middle / right for a flat part) — or "nowhere"',
    after: 'which way it goes after that contact: up, down, left, right, back toward its source, straight on',
    passes: 'whether any of it goes past or through a part instead of meeting it: "no", or where it goes'
});

/**
 * THE WORLD FRAME: what every role is told about the world — one paragraph, the one owner. The persona
 * (assets/system_instructions.md) carries it as a generated section between WORLD_FRAME_MARKERS
 * (scripts/gen-hands-section.mjs --write renders renderWorldFrameMarkdown()), so the Designer and the Builder,
 * who run under the persona, get it there and never in a turn; the Owl, who runs without the persona, gets
 * it once through its preface. The MiniMaxi skill's roles block shows it once (scripts/gen-plugin-agents.mjs).
 * Never retyped: scripts/test/roles.test.mjs fails on a second copy.
 */
export const WORLD_FRAME = 'THE WORLD, AS BLOCKS: think of the FRQTL universe the way a player thinks of Minecraft. Every frame is a ' +
    'block, and every frame is a container of frames: a block built of smaller blocks, layer inside layer, down to the ' +
    'fundamental dimension. Translate between this block world and the real one as a player does: pixels and ticks carry ' +
    'no units and no absolute scale, like a Minecraft block, so a pixel is whatever the scene takes it to be. FRQTL ' +
    'packages its own physics: what you see emerges from how frame primitives are arranged and from the universe\'s ' +
    'level-0 settings (the fundamental dimension it is created on), never from force equations.';

/** The persona's WORLD FRAME section markers: scripts/gen-hands-section.mjs writes only between them. */
export const WORLD_FRAME_MARKERS = Object.freeze({
    begin: '<!-- WORLD-FRAME:BEGIN generated by scripts/gen-hands-section.mjs from site/app-assets/maxi-roles.js WORLD_FRAME -->',
    end: '<!-- WORLD-FRAME:END -->'
});

/** The persona's WORLD FRAME section, markers included. */
export function renderWorldFrameMarkdown() {
    return [WORLD_FRAME_MARKERS.begin, WORLD_FRAME, WORLD_FRAME_MARKERS.end].join('\n') + '\n';
}

/**
 * The name of the persona's look-not-ask rule (assets/system_instructions.md, BUILDING FROM AN OUTLINE): an
 * ambiguous word in an outline is read by looking and the reading stated, never asked back. The rule's words
 * live in the persona only; the Designer's preface points at it by this name (roles.test.mjs checks both).
 */
export const LOOK_RULE = 'LOOK, NOT ASK';

/**
 * The name of the persona's section that says when a message asks Maxi to imagine (an outline: build it) and when it
 * asks him to talk (a question or a conversation: answer in words, from the memories, naming the file). The rule's
 * words live in the persona only; the Designer's preface points at it by this name (roles.test.mjs checks both).
 */
export const TALK_RULE = 'IMAGINING VERSUS TALKING';

/**
 * The Designer's FIRST line: READING_LINE and one of DESIGNER_READINGS, exactly — the message read in words before
 * anything is planned. The reading decides the blocks the reply carries (parseDesignerReply): an outline a json:plan,
 * a question a json:answer and no plan, both the answer first and then the plan.
 */
export const READING_LINE = 'THIS IS:';
export const DESIGNER_READINGS = Object.freeze({ outline: 'an outline', question: 'a question', both: 'a question and an outline' });

const DESIGNER_PREFACE = [
    'ROLE FOR THIS THREAD: you are Maxi in your DESIGNER role — the orchestrator. The person is Tony; you are',
    'JARVIS. Two sub-agents work for you on threads of their own: the Builder (your implementer — the director',
    'of engineering) builds what you plan, with the hands, and hands back a clip; the Owl (a distinct verifier —',
    'your QA team) watches that clip against Tony\'s outline and the Builder\'s prediction and approves or sends',
    'it back. You never use a hand on this thread and you never judge a clip: you plan, or you answer.',
    '',
    'FIRST, READ THE MESSAGE (' + TALK_RULE + ', in your persona). The FIRST line of your reply says what it is,',
    'exactly one of:'].concat(Object.keys(DESIGNER_READINGS).map(function (k) { return '  ' + READING_LINE + ' ' + DESIGNER_READINGS[k]; }), [
    '- ' + DESIGNER_READINGS.outline + ': plan it, as below, ending with the json:plan block;',
    '- ' + DESIGNER_READINGS.question + ' (or a conversation): answer Tony in words, from your memories, and name in your words',
    '  every memory file you drew on. END with ONE block listing exactly the files your words name (a file the words do',
    '  not name is refused), and nothing for the Builder: no plan, no hand, no clip.',
    '```' + HANDOFF_TAGS.answer,
    '{"memories": ["<a memory file you drew on, e.g. <id>-card.md>", "…"]}',
    '```',
    '- ' + DESIGNER_READINGS.both + ': the answer first, its json:answer block, then the plan\'s words and its json:plan block.',
    '',
    'Plan from your memories. Follow steps 1 and 2 of BUILDING FROM AN OUTLINE: list the parts, name the anchor,',
    'place every part relative to a rect you can read. Start from the scene in your memories closest to the',
    'outline and say which memory file you drew on ("in Experiment A we did this … we could combine that with Y',
    'from Experiment B"). A variant is a known sketch with one or two parameters changed: name them. Plan hands',
    'that can make each change. A scene is a SKETCH whose `export const parts = {…}` block is the one region a hand',
    'rewrites (THE SKETCH, your hands table):',
    '- a part\'s own parameter (an angle, a behaviour, a burst) is a setDeclared {name, patch}: one row in the',
    '  Record, and the scene runs again with the same seed;',
    '- a placement is a move: moveObject or resize, or dragTo to watch it happen; a move never turns or',
    '  reconfigures a part;',
    '- a whole-scene re-authoring (the author\'s own code, beyond what a part\'s entry says) is openSketch, which',
    '  closes the Record and opens a new one: plan it only when no setDeclared or move can say the change;',
    '- a part the scene declares in its code (the stage line marks it) cannot be touched by any hand;',
    '- a part is never renamed: a new name is a new key (addObject) or a fork (openSketch).',
    'Each `changes` item is one of these: `param` a field of the part\'s entry (the Builder\'s setDeclared patch',
    '{param: value}) or its place (`rect`, `center`: a move).',
    LAST_CLIP_RULE + ' Your `hands` end the same way: a plan whose hands close with ' + LAST_CLIP.looks + ' straight after ' +
    LAST_CLIP.shows + ' is refused.',
    'An ambiguous word in the outline is resolved by ' + LOOK_RULE + ' (BUILDING FROM AN OUTLINE): on this thread your',
    'looking is THE STAGE below and your memories (the -seen records and their clips); the plan builds that reading.',
    '',
    'THE STAGE, given with every outline, is what is loaded on Tony\'s screen now. Plan for that scene unless the',
    'outline names another: an outline that names a scene ("the 3D mirror", "in the double slit") plans THAT',
    'scene — `scene` is its id from your memories (roster.json lists every id; a 2D and a 3D scene are different',
    'ids) — and `hands` loads it (loadScene first). A plan for a scene that is not on the stage, with no loadScene',
    'or openSketch, is refused. 2D or 3D is a FACT OF THE LOADED SCENE (its world has depth or not), shown on the',
    'stage line; you never plan it. `registryMode` is null unless the scene\'s registry row declares modes (the',
    'stage line lists them when it does) — then it is one of those declared modes, by name.',
    'A 3D scene is a 3D world: a centre is [x, y, z]; dragTo with a 3D `to` moves a part in depth. A position you',
    'plan is a CENTRE: say "centre z 120", never a face ("front face at z 20") the Builder could take for one.',
    'The stage line gives every declared part\'s span ("spans z -80..80, centre z 0") — read a part\'s extent there,',
    'never from a sketch\'s numbers: a part is out of a band only when its WHOLE span is. In 3D the stage line says',
    'where the camera is and which z direction is TOWARD THE VIEWER (nearer on Tony\'s screen) and which is AWAY —',
    'read off the camera, never off an object\'s name: "toward the viewer" plans the centre along that axis.',
    '',
    'For an outline, tell Tony in a few plain sentences (no code) what you will build, then END with ONE block for the',
    'Builder, exactly:',
    '```json:plan',
    '{"scene": "<a scene id from your memories>",',
    ' "registryMode": null,',
    ' "changes": [{"object": "<a part of the scene\x27s parts block>", "param": "<a field of its entry, or rect/center>", "value": <new value>, "why": "<one line>"}],',
    ' "hands": ["<hand>", "…"],',
    ' "prediction": "<what the finished clip should show, in words, before anyone has seen it>"}',
    '```',
    'Strict JSON (double quotes, no comments). `changes` may be empty when the scene answers the outline as it',
    'is; `hands` names hands from your hands table, in the order you expect them used; `registryMode` is a',
    'declared mode string only when the stage (or the scene\'s memory) lists declared modes.'
]).join('\n');

const BUILDER_PREFACE = [
    'ROLE FOR THIS THREAD: you are Maxi\'s BUILDER — the implementer sub-agent (the director of engineering).',
    'Maxi, the Designer, wrote the plan below for Tony\'s outline. You build it in the lab with your hands — any',
    'hand, any API the SDK offers — and your acceptance criterion is a CLIP: the last clip you film is what you',
    'hand back, and a distinct verifier (the Owl) will judge it against the outline and your prediction. You',
    'do not talk to Tony and you do not judge your own work as approved.',
    '',
    'THE STAGE below names what is loaded now. When the plan\'s scene is not on it, your first hand is',
    'loadScene{id} of the plan\'s scene — with a `mode` ONLY when the plan names a registryMode (a scene whose',
    'registry row declares no modes refuses any mode). 2D or 3D is a fact of the LOADED scene: read it from the',
    'stage line or the `dimensions` of loadScene\'s and inventory\'s results, never pass it as a mode.',
    'In a 3D world every position is 3D: dragTo{to:[x, y, z]} (an [x, y] keeps the z), rects [left, top, z, w, h, d],',
    'the camera\'s orbit {azimuth, elevation, distance}. Every `to` is a CENTRE [x, y, z], never a face: a rect\'s',
    'z is its NEAR face and its centre is z + d/2 (a slab at rect z -80, depth 160 is centred at z 0). Before a',
    'hand that moves a part, your PREDICTION states the CENTRE it will drive to ("mirror centre [370, 200, 120]"),',
    'so a plan\'s "front face at z 20" is converted once, by you, and never mistaken for a centre.',
    'TOWARD THE VIEWER is the stage line\'s `toward` axis, read off the camera (never off a part\'s name, such as a',
    'wall called "Near" or "Far"): a `to` for "toward the viewer" moves the centre along it (toward +z: a larger z;',
    'toward -z: a smaller z), and "away" moves it the other way. A part clears a band only when its WHOLE span',
    '(centre ± d/2, the stage line gives it) lies outside the band.',
    '',
    'One hand per reply. Each reply ENDS with exactly one block:',
    '- a hand, in the shape your hands table teaches: ```json:call:<hand>``` with a strict-JSON body; and on its',
    '  own line before the block, `PREDICTION: <what this hand will show or return>` — stated before you act;',
    '- or, when your last clip shows the plan built, ```json:done``` with the body `{}`.',
    'The lab runs your hand and the next message brings its result (JSON) or its error (verbatim). A hand that',
    'films (see, dragTo, record) brings its clip as video on that next message: first say in words what the',
    'footage shows and whether it matched your prediction, then act. Check a hand\'s result before you describe',
    'its clip (from and to in a drag say whether anything moved), and never say the footage shows a change it',
    'does not: the Owl watches the same clip.',
    '',
    'CHANGING A PART (THE SKETCH, your hands table). A part\'s own parameter (an angle, a behaviour, a burst) changes',
    'with setDeclared{name, patch}, never by re-authoring the sketch: openSketch is for a change the author\'s code',
    'holds, which no part\'s entry can say. setDeclared runs the scene again from its tick 0, so a clip filmed',
    'before it shows a world that is gone. dragTo, moveObject and resize only move or size a part.',
    'FILM EVERY CHANGE: after each change that should show, film it (see, or dragTo for a move) before the next one',
    'or json:done. The Record refuses a change no clip shows, and the Owl needs a clip of each.',
    LAST_CLIP_RULE + ' When the ' + LAST_CLIP.shows + '\'s clip shows the plan built, your next block is json:done.',
    'A REFUSED HAND comes back verbatim. Before your next block, say in words which part and which key it refused',
    'and why; never send the same hand again unchanged. A part the scene declares in its code, or a rename, is',
    'refused by name: no hand can do it, so build what can be built and name that part and key in your json:done',
    'words.'
].join('\n');

const OWL_PREFACE = [
    'ROLE FOR THIS THREAD: you are the OWL — the verifier, distinct from the Designer who planned and the',
    'Builder who built. You are given three things only: the person\'s outline, the Builder\'s prediction, and',
    'the footage. You did not plan it and you did not build it. Judge the FOOTAGE against the OUTLINE, part by',
    'part — is each part there, where it was asked, at the angle and size asked, doing what was asked — and say',
    'whether what you see matches the prediction. Say only what the pixels show; what you remember about a',
    'scene is not what is in this clip, and a claim the footage does not show is a reason to revise.',
    '',
    WORLD_FRAME,
    '',
    'First write your ACCOUNT of the footage, from the pixels only, answering each question:'].concat(
    Object.keys(SEEN_ACCOUNT).map(function (k) { return '- ' + k + ': ' + SEEN_ACCOUNT[k]; }), [
    'Then judge the outline AND the prediction against your account, item by item: an item of your account that',
    'disagrees with the outline (the wrong third, the wrong direction, a beam passing a part the outline has it',
    'meet) is a revise. On screen, y grows DOWNWARD: "lower" is toward the bottom edge of the frame.',
    '',
    'END with exactly one block, the account first:',
    '```json:verdict',
    '{"seen": {"contact": "<…>", "after": "<…>", "passes": "<…>"}, "verdict": "approve" | "revise", "reasons": ["<the account items that decide it>", "…"], "change": "<the ONE change the Builder should make, or null when approved>"}',
    '```',
    'Approve only when every part of the outline is in the footage as asked.'
]).join('\n');

/**
 * THE THREE ROLES. `knowledgebase_names` is what the role's thread asks with (measured on PROD 2026-10-14):
 *   designer — Maxi's memories (KB GodsWorld, .descix/manifests/GodsWorld.json) — and so the persona;
 *   builder  — GodsWorld: the persona, whose HANDS section teaches the hands, rides only with it. The SDK's
 *              shipped docs (kb/GodsWorldSDK, .descix/manifests/GodsWorldSDK.json) join as a second KB once
 *              that KB is registered on PROD (today a question naming it is refused: KB_NOT_FOUND);
 *   owl      — General: no persona and no memories — a distinct verifier in a generic voice, judging only
 *              what its turn shows it (the preface gives the role; isolation is the KB's, measured). An EMPTY list does not isolate it — [] and an absent
 *              list both retrieved the memories (cl1a-mirror-seen.md quoted back to a memory-only question),
 *              while General retrieved nothing and answered "I have no source".
 * `localReads` is what the generated Claude Code agent reads (plugin/agents); its tools follow from its turn (scripts/gen-plugin-agents.mjs TOOL_NEEDS).
 */
export const ROLES = Object.freeze({
    designer: Object.freeze({
        id: 'designer', name: 'Maxi', title: 'the Designer', metaphor: 'orchestrator',
        description: 'Maxi in the Designer role — the orchestrator (JARVIS to the user\'s Tony): reads each message first — an outline becomes a plan for the Builder, a question an answer in words — from the memories.',
        knowledgebase_names: Object.freeze(['GodsWorld']),
        persona: true,
        preface: DESIGNER_PREFACE,
        handoff: 'plan',
        localReads: 'the knowledge base kb/GodsWorld: the memories in kb/GodsWorld/memories (INDEX.md first; <id>-card, <id>-build, <id>-seen) and the documents beside them'
    }),
    builder: Object.freeze({
        id: 'builder', name: 'the Builder', title: 'the Builder', metaphor: 'implementer',
        description: 'Maxi\'s Builder — the implementer sub-agent: builds the Designer\'s plan in the lab with the hands, hands back a clip and a prediction.',
        knowledgebase_names: Object.freeze(['GodsWorld']),
        persona: true,
        preface: BUILDER_PREFACE,
        handoff: 'build',
        localReads: 'the SDK\'s shipped docs (kb/GodsWorldSDK, the published package\'s own words) and the body CLI `node minimaxi/hand.mjs --bridge <url> <hand> \'<json>\'` for reading hands (inventory, sceneSource)'
    }),
    owl: Object.freeze({
        id: 'owl', name: 'the Owl', title: 'the Owl', metaphor: 'verifier',
        description: 'The Owl — the distinct verifier: sees only the outline, the Builder\'s prediction and the footage; approves or sends back with reasons.',
        knowledgebase_names: Object.freeze(['General']),
        persona: false,
        preface: OWL_PREFACE,
        handoff: 'verdict',
        localReads: 'ONLY the frame images named in the turn file — never the memories, the sketches or the plan'
    })
});

export const ROLE_ORDER = Object.freeze(['designer', 'builder', 'owl']);

export function roleOf(id) {
    const r = ROLES[id];
    if (!r) { throw new Error('[roles] no role "' + id + '" — the roles are ' + ROLE_ORDER.join(', ') + '.'); }
    return r;
}

// ── turn builders: what each role is shown, and nothing else ─────────────────────────────────

function text(v, what) {
    if (typeof v !== 'string' || !v.trim()) { throw new Error('[roles] ' + what + ' must be a non-empty string, got ' + JSON.stringify(v)); }
    return v.trim();
}

// ── the stage: what is loaded in the lab, read off the inventory hand ───────────────────────

/**
 * THE STAGE from the `inventory` hand's result: {label, id, mode, modes, renderer, dimensions, canvas, camera, viewer,
 * objects:[{name, kind, center|null, rect|null}]}. `viewer` (which z direction is toward the viewer, 3D) is the inventory's —
 * maxi-hands.js viewerOf owns it, off the live camera; nothing here re-derives it.
 * `dimensions` (2 | 3) is the inventory's — maxi-hands.js worldShape owns it; nothing here re-derives it.
 * THROWS naming every missing INVENTORY_KEYS key — a malformed inventory is a body bug, never guessed around.
 */
export function stageOf(inv) {
    if (!inv || typeof inv !== 'object' || Array.isArray(inv)) { throw new Error('[roles] stageOf takes the inventory hand\'s result (an object), got ' + JSON.stringify(inv)); }
    const missing = INVENTORY_KEYS.concat([SKETCH_KEYS.parts]).filter(function (k) { return !Object.prototype.hasOwnProperty.call(inv, k); });
    if (missing.length) { throw new Error('[roles] the stage is the inventory hand\'s result, and it lacks ' + missing.join(', ') + ' (maxi-hands.js INVENTORY_KEYS and SKETCH_KEYS.parts): ' + quote(JSON.stringify(inv))); }
    const block = inv[SKETCH_KEYS.parts];
    if (block !== null && (typeof block !== 'object' || Array.isArray(block))) { throw new Error('[roles] the inventory\'s ' + SKETCH_KEYS.parts + ' must be the sketch\'s parts block {name: [kind, props]} or null (declared in code), got ' + quote(JSON.stringify(block))); }
    if (inv.dimensions !== 2 && inv.dimensions !== 3) { throw new Error('[roles] the inventory\'s dimensions must be 2 or 3 (maxi-hands.js worldShape), got ' + JSON.stringify(inv.dimensions)); }
    if (!Array.isArray(inv.canvas) || inv.canvas.length !== inv.dimensions) { throw new Error('[roles] the inventory\'s canvas must have one size per dimension (' + inv.dimensions + '), got ' + JSON.stringify(inv.canvas)); }
    if (!Array.isArray(inv.modes) || !inv.modes.every(function (m) { return typeof m === 'string' && m; })) { throw new Error('[roles] the inventory\'s modes must be the declared registry modes ([] when none), got ' + JSON.stringify(inv.modes)); }
    if (!Array.isArray(inv.objects) || !inv.objects.every(function (o) { return o && typeof o.name === 'string' && typeof o.kind === 'string'; })) {
        throw new Error('[roles] the inventory\'s objects must be [{name, kind, …}], got ' + quote(JSON.stringify(inv.objects)));
    }
    if (inv.dimensions === 2 && inv.viewer !== null) { throw new Error('[roles] the inventory\'s viewer must be null in a 2D world (no depth), got ' + JSON.stringify(inv.viewer)); }
    if (inv.dimensions === 3) {
        const v = inv.viewer, c = inv.camera;
        const ok = v && typeof v === 'object' && ((v.toward === '+z' && v.away === '-z') || (v.toward === '-z' && v.away === '+z') || (v.toward === null && v.away === null));
        if (!ok) { throw new Error('[roles] the inventory\'s viewer must be {toward:"+z"|"-z", away: the other} or {toward:null, away:null} in 3D (maxi-hands.js viewerOf), got ' + JSON.stringify(v)); }
        if (!c || typeof c.azimuth !== 'number' || typeof c.elevation !== 'number') { throw new Error('[roles] the inventory\'s camera must be the 3D pose {azimuth, elevation, …}, got ' + JSON.stringify(c)); }
    }
    return {
        label: inv.scene, id: inv.id, mode: inv.mode, modes: inv.modes.slice(), renderer: inv.renderer, dimensions: inv.dimensions, canvas: inv.canvas.slice(),
        camera: inv.dimensions === 3 ? { azimuth: inv.camera.azimuth, elevation: inv.camera.elevation } : null,
        viewer: inv.dimensions === 3 ? { toward: inv.viewer.toward, away: inv.viewer.away } : null,
        objects: inv.objects.map(function (o) {
            if (Array.isArray(o.rect) && (spansOf(o.rect).z !== undefined) !== (inv.dimensions === 3)) {
                throw new Error('[roles] "' + o.name + '"\'s rect must be [left, top' + (inv.dimensions === 3 ? ', z, w, h, d' : ', w, h') + '] in a ' + inv.dimensions + 'D world, got ' + JSON.stringify(o.rect));
            }
            // a READ-ONLY copy of the inventory row for the words (center/rect: null when the object has none); inParts: a key
            // of the sketch's parts block (the block is the authority: a part outside it is declared in the scene's code)
            return { name: o.name, kind: o.kind, center: Array.isArray(o.center) ? o.center.slice() : null, rect: Array.isArray(o.rect) ? o.rect.slice() : null,
                inParts: block !== null && Object.prototype.hasOwnProperty.call(block, o.name) };
        })
    };
}

/** A number as the stage line writes it: integers bare, others to 2 decimals. */
function num(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }

/**
 * One declared object's full extent in words, from its inventory rect read by maxi-hands.js spansOf (the tuple's
 * owner) — "mirror (Wall): spans x 360..380, y 80..320, z -80..80; centre [370, 200, 0]".
 * A centre-placed object has no box: its centre only. No placement: the name and kind.
 */
export function extentWords(o, dimensions) {
    const head = o.name + ' (' + o.kind + (o.inParts === false ? '; declared in the scene\'s code: no hand can change it' : '') + ')';
    const centre = o.center ? 'centre [' + o.center.slice(0, dimensions).map(num).join(', ') + ']' : null;
    if (!o.rect) { return centre ? head + ': ' + centre : head; }
    const sp = spansOf(o.rect);
    const words = Object.keys(sp).map(function (a) { return a + ' ' + num(sp[a][0]) + '..' + num(sp[a][1]); }).join(', ');
    return head + ': spans ' + words + (centre ? '; ' + centre : '');
}

/** Where the camera is and which z direction is toward the viewer, in words (3D only; the inventory's viewer). */
export function viewerWords(stage) {
    const c = stage.camera, v = stage.viewer;
    const pose = 'the camera looks from azimuth ' + num(c.azimuth) + '°, elevation ' + num(c.elevation) + '°';
    if (v.toward === null) { return pose + ', across z: neither z direction is toward the viewer from this camera'; }
    return pose + '; toward the viewer is ' + v.toward + ', away is ' + v.away + ' (a part whose centre moves ' + v.toward + ' comes nearer on screen; read off the camera, not off any part\'s name)';
}

/** THE STAGE when nothing is loaded: the lab's own refusal, kept as words. */
export function emptyStage(reason) {
    return { none: text(String(reason || ''), 'emptyStage.reason') };
}

/**
 * True when the plan's scene is what is on the stage: the same scene id — and, only when the plan names a
 * registryMode, the same loaded registry mode. Dimensionality is never compared: it is the loaded scene's.
 */
export function planOnStage(plan, stage) {
    if (!stage || stage.none !== undefined) { return false; }
    return plan.scene === stage.id && (plan.registryMode === null || plan.registryMode === stage.mode);
}

/** THE STAGE in words, for the Designer's and the Builder's turns. */
export function stageWords(stage) {
    if (!stage || typeof stage !== 'object') { throw new Error('[roles] stageWords needs a stage (stageOf / emptyStage), got ' + JSON.stringify(stage)); }
    if (stage.none !== undefined) { return 'THE STAGE: no scene is loaded in the lab (the lab says: ' + stage.none + ').'; }
    const c = stage.canvas;
    const modes = stage.modes.length
        ? ', registry modes declared: ' + stage.modes.join(', ') + ' (loaded: ' + stage.mode + ')'
        : (stage.id ? ', no registry modes declared (loadScene takes its id only)' : '');
    return 'THE STAGE (loaded in the lab now, on Tony\'s screen): "' + stage.label + '" — ' +
        (stage.id ? 'scene id ' + stage.id : 'a sketch booted by openSketch (no scene id)') + modes +
        '; ' + (stage.dimensions === 3 ? '3D (x, y, z): a world ' + c[0] + ' x ' + c[1] + ' x ' + c[2] + ' with depth'
            : '2D (x, y): a world ' + c[0] + ' x ' + c[1]) + ' (renderer ' + stage.renderer + ')' +
        (stage.dimensions === 3 ? '; ' + viewerWords(stage) : '') +
        '; declared objects: ' + (stage.objects.length ? stage.objects.map(function (o) { return extentWords(o, stage.dimensions); }).join('; ') : 'none') + '.';
}

function requireStage(spec, where) {
    const st = spec && spec.stage;
    if (!st || typeof st !== 'object' || (st.none === undefined && (!Array.isArray(st.canvas) || !Array.isArray(st.modes) || (st.dimensions !== 2 && st.dimensions !== 3)))) {
        throw new Error('[roles] ' + where + ' needs the stage (stageOf(inventory) or emptyStage(reason)) — the role must know what is loaded.');
    }
    return st;
}

/**
 * The Designer's turn: the preface (first turn of its thread only), THE STAGE and Tony's message, labelled as a
 * message (never as an outline: reading it is the Designer's first move). `spec.outline` is the message's words.
 */
export function designerTurn(spec) {
    const outline = text(spec && spec.outline, 'designerTurn.outline');
    const stage = requireStage(spec, 'designerTurn');
    return (spec.first === false ? '' : DESIGNER_PREFACE + '\n\n') + stageWords(stage) + '\n\nTONY\'S MESSAGE: ' + outline;
}

/**
 * A hand result as a turn shows it: without `omit` (the caller's own keys — the node body's clip and still
 * paths, which ride as media) and without the clip's encoded length (maxi-hands CLIP_FACTS.base64Length).
 */
export function resultForTurn(result, omit) {
    if (!result || typeof result !== 'object') { return result; }
    const drop = [CLIP_FACTS.base64Length].concat(omit || []);
    const out = {};
    Object.keys(result).forEach(function (k) { if (drop.indexOf(k) === -1) { out[k] = result[k]; } });
    return out;
}

/**
 * The Builder's turns:
 *   {plan, stage}                       → the first turn: preface + the plan (none of the Designer's words to Tony)
 *                                          + THE STAGE, and the load the plan needs when its scene is not on it;
 *   {results: [{hand, ok, result|error}], footageAttached, omit?} → what the hands it asked for did, in order
 *                                          (`omit`: result keys the caller sends another way, e.g. file paths);
 *                                          footageAttached (boolean, required) says the caller put the clip a
 *                                          hand filmed on this same turn as media;
 *   {revise: verdict}                   → the Owl's reasons and its one change, after a revise;
 *   {doneRefused: words}                → the loop's refusal of a json:done (a change, or a new world, no clip shows), verbatim.
 */
export function builderTurn(spec) {
    if (!spec || typeof spec !== 'object') { throw new Error('[roles] builderTurn takes {plan, stage} | {results:[{hand, ok, result|error}], footageAttached} | {revise} | {doneRefused}.'); }
    if (spec.plan) {
        const stage = requireStage(spec, 'builderTurn.plan');
        const load = planOnStage(spec.plan, stage) ? '' : '\nThe plan\'s scene is not on the stage: your first hand loads it — loadScene ' +
            JSON.stringify(loadArgsOf(spec.plan)) + ' (or openSketch with its edited sketch).';
        return BUILDER_PREFACE + '\n\nTHE PLAN (from Maxi, the Designer):\n' + JSON.stringify(spec.plan, null, 2) +
            '\n\n' + stageWords(stage) + load +
            '\n\nBuild it. Your first reply ends with one hand block (and its PREDICTION line).';
    }
    if (spec.doneRefused !== undefined) {
        return 'YOUR json:done WAS REFUSED, verbatim:\n' + text(spec.doneRefused, 'builderTurn.doneRefused') +
            '\nFilm it (see, or dragTo for a move), say what the clip shows, and end with json:done when your last clip shows every change.';
    }
    if (spec.revise) {
        const v = spec.revise;
        if (!Array.isArray(v.reasons) || typeof v.change !== 'string') { throw new Error('[roles] builderTurn.revise takes the Owl\'s parsed verdict {reasons, change}.'); }
        return 'THE OWL SENT IT BACK (revise). Its reasons:\n' + v.reasons.map(function (r) { return '- ' + r; }).join('\n') +
            '\nThe one change it asks for: ' + v.change + '\n\nMake that change, film again, and end with json:done when the new clip shows it.';
    }
    const results = spec.results;
    if (!Array.isArray(results) || !results.length) { throw new Error('[roles] builderTurn.results must be a non-empty array of {hand, ok, result|error}.'); }
    if (typeof spec.footageAttached !== 'boolean') { throw new Error('[roles] builderTurn.results needs footageAttached (boolean): does the clip ride as media on this turn?'); }
    const parts = results.map(function (r, i) {
        const hand = text(r && r.hand, 'builderTurn.results[' + i + '].hand');
        if (r.ok === false) { return 'YOUR HAND `' + hand + '` WAS REFUSED, verbatim:\n' + text(String(r.error), 'builderTurn.results[' + i + '].error') + '\n' + REFUSAL_ASK; }
        if (r.ok !== true || !r.result || typeof r.result !== 'object') { throw new Error('[roles] builderTurn.results[' + i + '] must be {hand, ok:true, result:{…}} or {hand, ok:false, error}.'); }
        return 'RESULT OF `' + hand + '`:\n' + JSON.stringify(resultForTurn(r.result, spec.omit), null, 2);
    });
    return parts.join('\n\n') + '\n\n' +
        (spec.footageAttached ? 'Its clip is attached as video. Say first what the footage shows and whether it matched your PREDICTION, then end with your next block (or json:done).'
            : 'Your next block (or json:done).');
}

/** The Owl's one turn on a FRESH thread: preface, outline, prediction — the footage rides as media. Nothing else. */
export function owlTurn(spec) {
    const outline = text(spec && spec.outline, 'owlTurn.outline');
    const prediction = text(spec.prediction, 'owlTurn.prediction');
    return OWL_PREFACE + '\n\nTHE OUTLINE: ' + outline + '\n\nTHE BUILDER\'S PREDICTION: ' + prediction +
        '\n\nTHE FOOTAGE: attached as video' + (spec.framesNote ? ' (' + spec.framesNote + ')' : '') + '.';
}

// ── parsers: a malformed hand-off THROWS ─────────────────────────────────────────────────────

function quote(s) { s = String(s); return s.length > 400 ? s.slice(0, 400) + ' …[' + s.length + ' chars]' : s; }

/** Every fenced block of a reply: [{tag, body, start, end}]. */
export function fencedBlocks(reply) {
    const out = [];
    const re = /```([^\n`]*)\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(String(reply))) !== null) { out.push({ tag: m[1].trim(), body: m[2], start: m.index, end: re.lastIndex }); }
    return out;
}

function strictObject(body, where, reply) {
    let v;
    try { v = JSON.parse(body); } catch (e) {
        throw new Error(where + ': the block body is not strict JSON (' + e.message + '). The reply was: ' + quote(reply));
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { throw new Error(where + ': the block body must be ONE JSON object, got ' + quote(body)); }
    return v;
}

/** The one hand-off block of a reply, whose tag starts with one of `tags`. Zero or several THROW. */
function theBlock(reply, tags, where) {
    const all = fencedBlocks(reply);
    const ours = all.filter(function (b) { return tags.some(function (t) { return b.tag === t || (t.endsWith(':') && b.tag.indexOf(t) === 0); }); });
    if (ours.length !== 1) {
        throw new Error(where + ': expected exactly ONE ' + tags.map(function (t) { return t.endsWith(':') ? t + '<hand>' : t; }).join(' or ') +
            ' block, found ' + ours.length + (all.length ? ' (fence tags seen: ' + all.map(function (b) { return JSON.stringify(b.tag); }).join(', ') + ')' : '') +
            '. The reply was: ' + quote(reply));
    }
    return ours[0];
}

/** The words before the hand-off block (what the role said in plain language). */
function wordsOf(reply, block) { return String(reply).slice(0, block.start).trim(); }

/**
 * Keys a plan must NOT carry, each refused by name: 2D/3D is the loaded scene's, never planned, and the
 * registry's own mode rides as `registryMode` (a plan still saying `mode` was written to the old shape).
 */
export const PLAN_REFUSED_KEYS = Object.freeze({
    mode: '`mode` is not a plan field: a plan names a scene id, and 2D or 3D is a fact of the loaded scene (the stage line says which); a mode the scene\'s registry row DECLARES goes in `registryMode`, else null',
    dimensions: '`dimensions` is not a plan field: 2D or 3D is read from the stage after loading, never planned'
});

/** A plan's keys, in order: parsePlan's output carries exactly these, and an answer carrying any of them is refused. */
export const PLAN_KEYS = Object.freeze(['scene', 'registryMode', 'changes', 'hands', 'prediction']);

/** The loadScene args a plan's scene needs: its id, and a mode only when the plan names a registryMode. */
export function loadArgsOf(plan) {
    return plan.registryMode === null ? { id: plan.scene } : { id: plan.scene, mode: plan.registryMode };
}

/** The hands that put a scene on the stage: a plan for a scene that is not on it must name one. */
export const LOADING_HANDS = Object.freeze(['loadScene', 'openSketch']);

/**
 * Designer → {plan, words}. `stage` (required) is what is loaded: a plan whose scene is not on it must name
 * a loading hand (LOADING_HANDS), else it is refused naming both scenes.
 */
export function parsePlan(reply, stage) {
    const where = '[designer → plan]';
    if (!stage || typeof stage !== 'object') { throw new Error('[roles] parsePlan(reply, stage) needs the stage the plan was made for (stageOf / emptyStage).'); }
    const b = theBlock(reply, [HANDOFF_TAGS.plan], where);
    const p = strictObject(b.body, where, reply);
    const bad = [];
    if (typeof p.scene !== 'string' || !p.scene.trim()) { bad.push('`scene` (a scene id string)'); }
    const refused = Object.keys(PLAN_REFUSED_KEYS).filter(function (k) { return Object.prototype.hasOwnProperty.call(p, k); });
    if (refused.length) {
        throw new Error(where + ': the plan is refused — ' + refused.map(function (k) { return PLAN_REFUSED_KEYS[k] + ' (got ' + JSON.stringify(k) + ': ' + JSON.stringify(p[k]) + ')'; }).join('; ') +
            '. The block was: ' + quote(b.body));
    }
    if (p.registryMode !== undefined && p.registryMode !== null && (typeof p.registryMode !== 'string' || !p.registryMode.trim())) { bad.push('`registryMode` (null, or a declared registry mode string)'); }
    if (!Array.isArray(p.changes)) { bad.push('`changes` (an array)'); }
    else {
        p.changes.forEach(function (c, i) {
            if (!c || typeof c !== 'object' || typeof c.object !== 'string' || !c.object || typeof c.param !== 'string' || !c.param || !('value' in c)) {
                bad.push('`changes[' + i + ']` as {object, param, value, why}');
            }
        });
    }
    if (!Array.isArray(p.hands) || !p.hands.length) { bad.push('`hands` (a non-empty array of hand names)'); }
    else {
        const unknown = p.hands.filter(function (h) { return !Object.prototype.hasOwnProperty.call(HANDS, h); });
        if (unknown.length) { bad.push('`hands` names no such hand: ' + unknown.join(', ') + ' (the hands are ' + Object.keys(HANDS).join(', ') + ')'); }
    }
    if (typeof p.prediction !== 'string' || !p.prediction.trim()) { bad.push('`prediction` (words)'); }
    if (bad.length) { throw new Error(where + ': the plan lacks ' + bad.join('; ') + '. The block was: ' + quote(b.body)); }
    const plan = {};
    PLAN_KEYS.forEach(function (k) { plan[k] = p[k]; });
    if (plan.registryMode === undefined) { plan.registryMode = null; }
    if (stage.none === undefined && plan.scene === stage.id && plan.registryMode !== null && stage.modes.indexOf(plan.registryMode) === -1) {
        throw new Error(where + ': the plan names registryMode "' + plan.registryMode + '" for "' + plan.scene + '", which is on the stage and declares ' +
            (stage.modes.length ? 'only the registry modes ' + stage.modes.join(', ') : 'no registry modes (registryMode is null)') + '. The block was: ' + quote(b.body));
    }
    let last = plan.hands.length - 1;
    if (plan.hands[last] === LAST_CLIP.looks) {
        while (last >= 0 && plan.hands[last] === LAST_CLIP.looks) { last -= 1; }
        if (last >= 0 && plan.hands[last] === LAST_CLIP.shows) {
            throw new Error(where + ': the plan\'s hands [' + plan.hands.join(', ') + '] close with ' + LAST_CLIP.looks + ' straight after ' + LAST_CLIP.shows +
                ', so the Owl would judge a clip with no before-state — end on the ' + LAST_CLIP.shows + ' (' + LAST_CLIP_RULE + ') The block was: ' + quote(b.body));
        }
    }
    if (!planOnStage(plan, stage) && !plan.hands.some(function (h) { return LOADING_HANDS.indexOf(h) !== -1; })) {
        throw new Error(where + ': the plan is for "' + plan.scene + (plan.registryMode ? '" registryMode "' + plan.registryMode : '') + '", which is not on the stage (' +
            (stage.none !== undefined ? 'nothing is loaded' : '"' + stage.id + '"' + (stage.mode ? ' mode "' + stage.mode + '"' : '')) +
            '), and its hands [' + plan.hands.join(', ') + '] never load it — name ' + LOADING_HANDS.join(' or ') + '. The block was: ' + quote(b.body));
    }
    return { plan: plan, words: wordsOf(reply, b) };
}

/** The keys a json:answer block may carry: the memory files the answer drew on, nothing else. */
export const ANSWER_KEYS = Object.freeze(['memories']);

/** A memory file as an answer names it: a KB file name (or its kb-relative path) ending in .md. */
const MEMORY_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.md$/;

/**
 * The Designer's reading of the message: its reply's first line, READING_LINE + one of DESIGNER_READINGS. Returns the
 * reading's key (outline | question | both) and where the rest of the reply starts. THROWS on any other first line.
 */
export function readingOf(reply) {
    const where = '[designer → reading]';
    const s = String(reply);
    const lead = s.match(/^\s*/)[0].length;
    const nl = s.indexOf('\n', lead);
    const line = (nl === -1 ? s.slice(lead) : s.slice(lead, nl)).trim();
    const said = line.indexOf(READING_LINE) === 0 ? line.slice(READING_LINE.length).trim().replace(/\.$/, '').toLowerCase() : null;
    const key = said === null ? undefined : Object.keys(DESIGNER_READINGS).find(function (k) { return DESIGNER_READINGS[k] === said; });
    if (!key) {
        throw new Error(where + ': the reply\'s first line must read the message — one of ' + Object.keys(DESIGNER_READINGS).map(function (k) { return '"' + READING_LINE + ' ' + DESIGNER_READINGS[k] + '"'; }).join(', ') +
            ' — got ' + JSON.stringify(line) + '. The reply was: ' + quote(reply));
    }
    return { reading: key, rest: nl === -1 ? '' : s.slice(nl + 1) };
}

/**
 * Whether `words` name the memory file `file` as a whole token: its file name WITH its extension (dse-tunnel-rebuild-card.md),
 * not followed by a further name character and not preceded by one (a path before it, kb/GodsWorld/<file>, still names it).
 * "card" does not name card.md; "my-card.md" does not name card.md.
 */
export function namesFile(words, file) {
    const base = String(file).slice(String(file).lastIndexOf('/') + 1);
    const re = new RegExp('(^|[^A-Za-z0-9._-])' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_-])');
    return re.test(String(words));
}

/**
 * The json:answer block of `text` (the reply after its reading line) → {words, memories}. THROWS on a malformed answer.
 * This parser checks the FORMAT of each memory file (a KB file name, named in the words as a whole token); it cannot
 * list the knowledge base (DOM-free, no file system), so it never checks that a file EXISTS. The node driver
 * (minimaxi/loop.mjs) refuses an answer naming a file that is not under kb/GodsWorld; the page relies on this format check.
 */
function parseAnswer(text, block, reply) {
    const where = '[designer → answer]';
    const a = strictObject(block.body, where, reply);
    const planKeys = PLAN_KEYS.concat(Object.keys(PLAN_REFUSED_KEYS)).filter(function (k) { return Object.prototype.hasOwnProperty.call(a, k); });
    if (planKeys.length) {
        throw new Error(where + ': an answer carries no plan — `' + planKeys.join('`, `') + '` ' + (planKeys.length > 1 ? 'are plan fields' : 'is a plan field') +
            '; a message that also asks for a build is "' + READING_LINE + ' ' + DESIGNER_READINGS.both + '", its plan in its own json:plan block. The block was: ' + quote(block.body));
    }
    const extra = Object.keys(a).filter(function (k) { return ANSWER_KEYS.indexOf(k) === -1; });
    if (extra.length) { throw new Error(where + ': a json:answer block carries only ' + ANSWER_KEYS.join(', ') + ', got `' + extra.join('`, `') + '`. The block was: ' + quote(block.body)); }
    const m = a.memories;
    if (!Array.isArray(m) || !m.length) { throw new Error(where + ': an answer names the memory files it drew on — `memories` must be a non-empty array of file names, got ' + JSON.stringify(m) + '. The block was: ' + quote(block.body)); }
    const badNames = m.filter(function (f) { return typeof f !== 'string' || !MEMORY_FILE_RE.test(f); });
    if (badNames.length) { throw new Error(where + ': `memories` holds file names of the knowledge base (<name>.md), got ' + badNames.map(function (f) { return JSON.stringify(f); }).join(', ') + '. The block was: ' + quote(block.body)); }
    const words = text.slice(0, block.start).trim();
    if (!words) { throw new Error(where + ': the answer is the words before the json:answer block, and there are none. The reply was: ' + quote(reply)); }
    const unnamed = m.filter(function (f) { return !namesFile(words, f); });
    if (unnamed.length) { throw new Error(where + ': the answer\'s words never name ' + unnamed.join(', ') + ' — a memory an answer draws on is named in its words. The reply was: ' + quote(reply)); }
    return { words: words, memories: m.slice() };
}

/**
 * Designer → {reading, answer: {words, memories}|null, plan|null, words|null} — the one parser of the Designer's reply.
 * The first line reads the message (readingOf); the reading decides the blocks:
 *   outline  → exactly one json:plan and no json:answer (parsePlan: {plan, words});
 *   question → exactly one json:answer and no json:plan: an answer in words, no build;
 *   both     → one json:answer, then one json:plan after it: the answer first, then the plan (its words are those
 *              between the two blocks).
 * A reply whose blocks disagree with its reading THROWS naming both.
 */
export function parseDesignerReply(reply, stage) {
    const r = readingOf(reply);
    const all = fencedBlocks(r.rest);
    const answers = all.filter(function (b) { return b.tag === HANDOFF_TAGS.answer; });
    const plans = all.filter(function (b) { return b.tag === HANDOFF_TAGS.plan; });
    const want = { outline: [0, 1], question: [1, 0], both: [1, 1] }[r.reading];
    if (answers.length !== want[0] || plans.length !== want[1]) {
        throw new Error('[designer → ' + r.reading + ']: "' + READING_LINE + ' ' + DESIGNER_READINGS[r.reading] + '" ends with ' +
            (want[0] ? 'ONE ' + HANDOFF_TAGS.answer + ' block' : 'no ' + HANDOFF_TAGS.answer + ' block') + ' and ' + (want[1] ? 'ONE ' + HANDOFF_TAGS.plan + ' block' : 'no ' + HANDOFF_TAGS.plan + ' block') +
            ', found ' + answers.length + ' ' + HANDOFF_TAGS.answer + ' and ' + plans.length + ' ' + HANDOFF_TAGS.plan + '. The reply was: ' + quote(reply));
    }
    if (r.reading === 'both' && answers[0].end > plans[0].start) {
        throw new Error('[designer → both]: the answer comes first — the json:answer block before the json:plan block. The reply was: ' + quote(reply));
    }
    const answer = answers.length ? parseAnswer(r.rest, answers[0], reply) : null;
    if (!plans.length) { return { reading: r.reading, answer: answer, plan: null, words: null }; }
    const planned = parsePlan(answer ? r.rest.slice(answers[0].end) : r.rest, stage);
    return { reading: r.reading, answer: answer, plan: planned.plan, words: planned.words };
}

/**
 * Builder → {kind:'call', hand, args, prediction, words, said} | {kind:'done', words, said}. `said` is what the Builder
 * said in words before its PREDICTION line (a call) or before json:done: the loop reads it after a refusal.
 */
export function parseBuilderReply(reply) {
    const where = '[builder → hand-off]';
    const b = theBlock(reply, [HANDOFF_TAGS.call, HANDOFF_TAGS.done], where);
    const words = wordsOf(reply, b);
    if (b.tag === HANDOFF_TAGS.done) {
        const body = strictObject(b.body.trim() || '{}', where, reply);
        if (Object.keys(body).length) { throw new Error(where + ': json:done takes the body {} — the hand-back is the last clip filmed, got ' + quote(b.body)); }
        return { kind: 'done', words: words, said: words };
    }
    const hand = b.tag.slice(HANDOFF_TAGS.call.length);
    if (!Object.prototype.hasOwnProperty.call(HANDS, hand)) {
        throw new Error(where + ': json:call:' + hand + ' names no hand (the hands are ' + Object.keys(HANDS).join(', ') + '). The reply was: ' + quote(reply));
    }
    const args = strictObject(b.body, where + ' json:call:' + hand, reply);
    // the prediction is everything from `PREDICTION:` to the block — a list of lines is one prediction
    const pm = words.match(/^[ \t]*PREDICTION:[ \t]*([\s\S]*)$/m);
    if (!pm || !pm[1].trim()) { throw new Error(where + ': json:call:' + hand + ' without a `PREDICTION: …` line before it — the prediction is stated before acting. The reply was: ' + quote(reply)); }
    return { kind: 'call', hand: hand, args: args, prediction: pm[1].trim(), words: words, said: words.slice(0, pm.index).trim() };
}

/** Owl → {seen:{contact, after, passes}, verdict, reasons, change, words}. The account is required. */
export function parseVerdict(reply) {
    const where = '[owl → verdict]';
    const b = theBlock(reply, [HANDOFF_TAGS.verdict], where);
    const v = strictObject(b.body, where, reply);
    const bad = [];
    const seen = v.seen;
    if (!seen || typeof seen !== 'object' || Array.isArray(seen)) { bad.push('`seen` (the account of the footage: ' + Object.keys(SEEN_ACCOUNT).join(', ') + ')'); }
    else {
        const missing = Object.keys(SEEN_ACCOUNT).filter(function (k) { return typeof seen[k] !== 'string' || !seen[k].trim(); });
        if (missing.length) { bad.push('`seen.' + missing.join('`, `seen.') + '` (words from the pixels)'); }
    }
    if (VERDICTS.indexOf(v.verdict) === -1) { bad.push('`verdict` "approve" or "revise" (got ' + JSON.stringify(v.verdict) + ')'); }
    if (!Array.isArray(v.reasons) || !v.reasons.length || !v.reasons.every(function (r) { return typeof r === 'string' && r.trim(); })) { bad.push('`reasons` (non-empty strings)'); }
    if (v.verdict === 'revise' && (typeof v.change !== 'string' || !v.change.trim())) { bad.push('`change` (the one change, words) on a revise'); }
    if (bad.length) { throw new Error(where + ': the verdict lacks ' + bad.join('; ') + '. The block was: ' + quote(b.body)); }
    const account = {};
    Object.keys(SEEN_ACCOUNT).forEach(function (k) { account[k] = seen[k]; });
    return { seen: account, verdict: v.verdict, reasons: v.reasons, change: v.verdict === 'revise' ? v.change : null, words: wordsOf(reply, b) };
}

/** The parser of a role's hand-off, by role id. */
export const PARSERS = Object.freeze({ designer: parseDesignerReply, builder: parseBuilderReply, owl: parseVerdict });
