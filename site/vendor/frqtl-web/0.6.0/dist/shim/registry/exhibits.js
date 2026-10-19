/* Copyright 2023-2026 by Essam Abadir */

/**
 * exhibits.js — the SHOWCASE ROSTER ("Impossible things, running"), the run-once card of every
 * roster scene the GYM plays, and the showcase copy around them (the intro card, the through-line
 * and the one invitation). It is the ONE owner of every word of that copy.
 *
 * EXHIBITS is the ONE source for the front-page tiles, their GYM deep links and the scene card:
 * nine rows in front-page order, each
 * `{ kind, id, mode, title, tile, what, why, how, controls, still }`.
 *   - `kind` is 'rung' (a walk-through rung, lib/shim/registry/walkthrough.js); `id` resolves there. A row of
 *     any other kind THROWS naming the rung form.
 *   - `mode` is a rung's declared mode (null for a single-mode rung).
 *   - `title` is the tile's and the card's title; `tile` is the published one-sentence tile line.
 *   - `what` (What you are seeing), `why` (Why it is impossible the usual way) and `how` (How FRQTL
 *     gets it) are the card's copy, CARD_PARTS, every one REQUIRED on every row.
 *   - `controls` (optional) is how to drive a scene's declared controls and what to read; only an
 *     interactive scene carries one.
 *   - `still` (optional) is the tile still: `{ tick, alt, pose? }` — the tick the tile-stills
 *     instrument (apps/ide/test/tile-stills-capture.spec.js) drives the scene to before capturing,
 *     the still's alt text (REQUIRED with a still; its one home), and on a 3D scene whose default
 *     camera hides its structure, the camera pose (a setOrbit patch).
 *
 *   exhibitFor({ kind, id, modeId? }) → the roster row, or null (declared: the scene has no card)
 *   sceneKey({ kind, id, modeId? })   → the scene's run-once seen-key (the one mode normalizer)
 *   showcaseCard(row)                 → { kind, id, modeId, seenKey, title, paragraphs, is3D }
 *
 * The card is the row's title, `what`, `why`, `how`, `controls` (when present), JOYSTICK_EXPLAINER
 * on a 3D scene (the pads themselves are CameraControls'), and SHOWCASE_INVITE last, by reference.
 * It never renders registry prose. The bag's { seenKey, title, paragraphs } is what
 * lib/components/run-once-card renders; SHOWCASE_INTRO is such a bag too (its own seen-key).
 *
 * Every word here is validated at load through lib/shim/registry/copy-gate.js (placeholder rules and
 * segment shape). A table paragraph is allowed only in SHOWCASE_INTRO. The invitation and the
 * intro's paragraphs appear ONCE: a row that pastes either is refused, as is an intro that pastes
 * the through-line.
 *
 * Consumers: the GYM (lib/features/ide/CompareView.jsx — the intro card, the scene card and the scene
 * select's leading rows); the roster tests (lib/shim/registry/test/exhibits.test.mjs,
 * lib/frqtl/scenes/test/scene-files.test.mjs) and the GYM specs under apps/ide/test that walk it;
 * the front-page generator and gates, which read this module as SERVED by a built bundle
 * (shim/registry/exhibits.js).
 *
 * WHAT IS NOT HERE: the IDE's first-contact default — a walkthrough rung declared once at
 * lib/shim/registry/walkthrough.js `FIRST_CONTACT_WALKTHROUGH_ID`.
 *
 * @module exhibits
 */

import {
    WALKTHROUGH, walkthroughById, walkthroughModes, defaultWalkthroughModeId, walkthroughIs3D, effectiveRenderState
} from './walkthrough.js';
import { assertCopyText, assertCopyParagraphs } from './copy-gate.js';

/** The scene kinds a roster row (and a player deep link) can name. */
export const EXHIBIT_KINDS = Object.freeze(['rung']);

/** The copy parts a run-once CARD shows, in order; every roster row carries all of them. */
export const CARD_PARTS = Object.freeze(['what', 'why', 'how']);

const segText = (para) => para.map((s) => (typeof s === 'string' ? s : s.text)).join('');

/**
 * A plain showcase paragraph: one segment array of STRINGS (no table, no link), through the copy gate.
 * @returns the paragraph
 */
export function assertPlainParagraph(para, where) {
    assertCopyParagraphs([para], where, { table: false });
    if (!para.every((s) => typeof s === 'string')) {
        throw new Error(where + ' is plain text: strings only (the page has no link renderer).');
    }
    return para;
}

/** The one invitation, shown as the LAST paragraph of every scene card (by reference, never pasted). */
export const SHOWCASE_INVITE = Object.freeze([
    "Every scene here is the same few objects at whatever scale you declare: open it, read its code, change anything, and decide for yourself.",
]);
assertPlainParagraph(SHOWCASE_INVITE, '[exhibits] SHOWCASE_INVITE');

/** The through-line under the front page's grid: one paragraph of plain text. */
export const SHOWCASE_THROUGH_LINE = Object.freeze([
    "FRQTL is fractal, as the name sounds. Everything in it is built from three primitives, ticks, pixels and occupancy, and none of them carries a unit. Its layers nest by powers of two, each twice the size of the one below. So the engine does not know or care what scale a scene is: the sun on this page is the same 3D sphere emitter, made of the same primitives, whether you read it as a star, a candle flame or an atom. Every scene is independent cellular automata following local rules, with no equations, and every scene is the same few objects, composed at whatever scale you declare.",
]);
assertPlainParagraph(SHOWCASE_THROUGH_LINE, '[exhibits] SHOWCASE_THROUGH_LINE');

/** The caption of the intro's estimate table. */
const SHOWCASE_ESTIMATE_CAPTION = "A back-of-the-envelope estimate.";

/**
 * assertShowcaseIntro — the intro card bag: seen-key, title and paragraphs through the copy gate
 * (a table paragraph allowed; its structure is the run-once card's contract), and never a paste of
 * the through-line. Exported so a test can show each refusal on a planted copy.
 * @returns the intro
 */
export function assertShowcaseIntro(intro) {
    if (!intro || typeof intro.seenKey !== 'string' || intro.seenKey === '') {
        throw new Error('[exhibits] SHOWCASE_INTRO needs a non-empty seenKey.');
    }
    assertCopyText(intro.title, '[exhibits] SHOWCASE_INTRO.title');
    assertCopyParagraphs(intro.paragraphs, '[exhibits] SHOWCASE_INTRO', { table: true });
    const through = segText(SHOWCASE_THROUGH_LINE);
    intro.paragraphs.forEach((para, i) => {
        if (Array.isArray(para) && segText(para).indexOf(through) !== -1) {
            throw new Error('[exhibits] SHOWCASE_INTRO paragraph ' + i + ' pastes SHOWCASE_THROUGH_LINE — the through-line has one place.');
        }
    });
    return intro;
}

/** The public EGPT repository (DeSciX/EGPT, main) the intro's closing paragraph cites, one document per link. */
const EGPT_EVIDENCE_BLOB = 'https://github.com/DeSciX/EGPT/blob/main/';

/** A link segment to one tracked document of the public EGPT repository. */
const egptDoc = (text, path) => Object.freeze({ text, href: EGPT_EVIDENCE_BLOB + path });

/** The run-once intro card, shown once before the first roster scene card a viewer meets. */
export const SHOWCASE_INTRO = Object.freeze({
    seenKey: 'showcase-intro',
    title: "Why these are considered \"impossible\"",
    paragraphs: Object.freeze([
        Object.freeze([
            "The industry-standard projection is that simulating just 100 electrons requires a classical computer with 2^100 bits, more atoms than there are in the universe (",
            Object.freeze({ text: "Microsoft's quantum computing overview", href: "https://learn.microsoft.com/en-us/azure/quantum/overview-understanding-quantum-computing" }),
            "). Google's framing is that 100 photons (or qubits) would require 725 trillion times the age of the universe to calculate using the world's most powerful supercomputers, like Frontier.",
        ]),
        Object.freeze(["You're about to see the FRQTL hyper-computer accurately simulate many thousands on your own mobile phone or laptop."]),
        Object.freeze(["FRQTL is a patent-pending P=NP hyper-computer based on a radically different architecture than current computer chips and hypothetical qubit-based quantum computers."]),
        Object.freeze(["FRQTL doesn't cheat, and it isn't like any \"traditional\" approach such as ray tracing, path tracing and photon mapping, which cannot produce interference or wave diffusion at any cost. They treat light as straight lines. Real-time engines fake shadows, reflections and indirect light as separate effects, with fixed bounce limits."]),
        Object.freeze(["Matching what you will see FRQTL do here means solving Maxwell's equations directly. The standard method is FDTD: a 3D grid of about 20 cells per wavelength, updated every time step. At real optical wavelengths that cost is out of reach."]),
        Object.freeze(["Assumptions: visible light at 500 nm; 20 cells per wavelength; about 24 bytes and 30 operations per cell per step; a time step at the standard stability limit for a 3D grid, so light advances at most 1/√3 of a cell per step and crossing the scene takes about 1.7 steps for every cell across it; a Frontier-class supercomputer (about 10^18 operations per second, about 10 PB of memory). \"One crossing\" means light travelling once across the scene."]),
        Object.freeze({ table: Object.freeze({
            caption: SHOWCASE_ESTIMATE_CAPTION,
            head: Object.freeze(["Scene","Grid cells","Memory needed","Compute for one crossing","Time on Frontier"]),
            rows: Object.freeze([
                Object.freeze(["10 cm tabletop","6 × 10^19","about 1.5 zettabytes, about 150,000× Frontier's memory","about 10^28 operations","about 400 years"]),
                Object.freeze(["5 m room","8 × 10^24","about 2 × 10^26 bytes, more than all the storage on Earth","about 10^35 operations","about 3 billion years"]),
            ]),
        }) }),
        Object.freeze(["Running indefinitely multiplies that by every further crossing. At physical wavelengths, \"impossible for supercomputers\" is literally true."]),
        Object.freeze(["The table is about light waves. The blackbody, the logic circuit, the Big Bang and the atom are impossible the usual way for a different reason: each needs a theory, equations and a program of its own, at a scale of its own. The glowing box needs energy quanta assumed, the circuit needs a search through its inputs, the cosmos needs gravity computed over 13.8 billion years, and the atom needs quantised energy levels."]),
        Object.freeze([
            "The EGPT proofs are machine-checked in Lean. Rota's Entropy Theorem (RET), the Lean theorem ",
            egptDoc("rota_all_entropy_scaled_shannon", "08_LEAN/EGPT/InformationTheory/EntropyNumber/RotaEntropy.lean"),
            ", is why P=NP is quantum computing: by Rota's proof, all the distributions of physics are scaled Shannon entropy (for the Bose-Einstein, Fermi-Dirac and Maxwell-Boltzmann distributions, the Lean theorems ",
            egptDoc("entropy_BE_eq_C_shannon, entropy_FD_eq_C_shannon and entropy_MB_eq_C_shannon", "08_LEAN/EGPT/InformationTheory/Physics/PhysicsDist.lean"),
            "), and all entropy, including von Neumann entropy, is scaled Shannon entropy. RET provides the framework for all three P=NP proofs, the Lean theorems ",
            egptDoc("P_eq_NP", "08_LEAN/EGPT/InformationTheory/Complexity/SetRFL.lean"),
            ", ",
            egptDoc("P_eq_NP_info", "08_LEAN/EGPT/InformationTheory/Complexity/PPNP.lean"),
            " and ",
            egptDoc("P_eq_NP_info_standard", "08_LEAN/EGPT/InformationTheory/Complexity/StandardComplexity.lean"),
            ". Together, RET and the distribution theorems are a formalisation of a Theory of Everything, as discussed under Question 1 of ",
            egptDoc("the Claude Singularity session", "12_SINGULARITY/Claude/Cowork_Session_10.01.2026.md"),
            ". The proof of P=NP was first outlined in the paper P Probably Equals NP (January 2025).",
        ]),
    ]),
});
assertShowcaseIntro(SHOWCASE_INTRO);

// The authored roster, front-page order. `title` and `tile` are the published front-page tile copy
// (the egpt-frqtl front page's #proof tiles: each tile's <b> and its sentence), verbatim;
// `what`, `why`, `how`, `controls` and each `still.alt` are the authored captions.
const ROSTER = [
    {
        kind: 'rung', id: "dse-tunnel-rebuild", mode: "3d",
        still: { tick: 7200, alt: "Three red blocks with blue slit walls between them inside a dark glass box; a cloud of yellow dots hangs above the slits, and below them a flat heat-map plate of blue squares glows yellow-green along a central band." },
        title: "Double slit",
        tile: "Two slits, one particle at a time. Feynman's “only mystery,” with no amplitudes to add.",
        what: "Particles go through two slits one at a time, and bright and dark bands build up on the detector plate below them, live in your browser tab: the pattern Feynman called quantum mechanics' \"only mystery\". EGPT conceptually holds computer science and physics are linked by P=NP and the principle of least action - that is, everything in reality is efficiently computable. The Lean RET, the derivation of EntropyReal from an IIDParticleSource, and the P=NP capstones are modern formalizations of proofs and ideas advanced by Gian-Carlo Rota circa the late 1970s. The EGPT Lean proofs transparently show the most rigorously advanced proofs ever offered for bridging not only quantum and classical mechanics but mathematics and all the other sciences. Watch it run, read its code, and judge for yourself whether this is true P=NP quantum computing.",
        why: "Feynman called it \"impossible, absolutely impossible, to explain in any classical way\". A ray tracer cannot draw it at all, and solving the light waves directly for a 10 cm tabletop would need about 150,000 times the memory of the Frontier supercomputer and about 400 years of its time.",
        how: "A sphere emitter, walls, two tunnels for the slits and a detector plate. Each particle is an independent cellular automaton following local rules: no wave equation, no amplitudes to add.",
    },
    {
        kind: 'rung', id: "r8-sun",
        still: { tick: 300, alt: "A white-hot sun with a golden halo and fine rays fanning out in every direction across a dim, grainy space." },
        title: "A sun",
        tile: "Put light in the scene and let light do what light does. No Standard Model; god-rays from particle density.",
        what: "Put light in the scene and let light do what light does: a blazing sun, its glow and god rays spreading in every direction through the space around it.",
        why: "Games paint glow and god rays onto the finished picture as a separate screen effect, aimed from where the sun is on the screen rather than from any light in the scene.",
        how: "One sphere emitter, shining in every direction. The god rays are rendered from the density of the particles themselves. No Standard Model, no equations, and the engine does not know whether you are looking at a star, a candle flame or an atom.",
    },
    {
        kind: 'rung', id: "cl1d-mirror-route", mode: "3d",
        still: { tick: 1200, alt: "Ten brightly coloured mirrors in a ring, seen from above; a dense band of gold, orange and green dots circles a dark, empty centre inside it, and faint gold and green rays fan out from that light between the mirrors into the dark space around." },
        title: "Infinite mirror",
        tile: "Ten mirrors in a ring. Light walks the loop. No Fresnel equations.",
        what: "Ten mirrors in a ring. Light goes round and round the loop, reflected and diffused from mirror to mirror, each mirror colouring the light it sends on.",
        why: "Conventional renderers cut every light path off after a set number of bounces and treat shadows, reflections and indirect light as separate effects. Solving the light directly in a 5 m room would take Frontier about 3 billion years.",
        how: "One emitter and ten walls set as mirrors. Light leaves in every direction; shadowing, reflection and obstruction are all live, with no limit on the objects in its path, and the diffusion is real. No Fresnel equations.",
    },
    {
        kind: 'rung', id: "r5-fountain-pool",
        still: { tick: 300, alt: "A dark teal surface scattered with white glints like light on water, with a faint ring around a dark dot at its centre." },
        title: "A pool",
        tile: "One source. Rings. Interference as the geometry of random walks, not a wave.",
        what: "One source, and rings of ripples spread out across the water, glinting like light on a pool.",
        why: "A ray is a straight line with no wave in it, so ray tracing cannot make interference rings at any cost, and solving the waves directly runs into the costs in the intro.",
        how: "One sphere emitter - classical mechanics that looks like water, from the same light object, the sphere emitter that made the sun in the previous scene. Every particle zig-zags as it travels, so its path is itself a wave; the rings are the geometry of those wavy random walks crossing. The water is the same light field shown through a different renderer. No equations.",
    },
    {
        kind: 'rung', id: "blackbody",
        still: { tick: 600, alt: "A grey box packed with glowing red blobs and tiny yellow dots, with dots and a few red blobs streaming out of an opening on its right side." },
        title: "Blackbody",
        tile: "Particles in a box. The Planck curve appears; no quanta assumed.",
        what: "A hot box of jostling particles glows red, and light spills out through a slit in its side. The Planck curve appears; no energy quanta are assumed.",
        why: "Classical physics, the Rayleigh–Jeans law, predicts infinite energy at high frequencies, the \"ultraviolet catastrophe\". There is no settled traditional way to compute the plasma physics behind Planck's 1900 law from first principles.",
        how: "A box, a thermostat that keeps it hot, and an absorbing wall that catches whatever escapes. Colliding particles merge into larger frames, and how full a frame is sets its colour. Independent cellular automata, no equations.",
    },
    {
        kind: 'rung', id: "circuit-sat",
        still: { tick: 300, alt: "A circuit of blue bars on black; two lit input lines on the left feed two gates, the top output line carries a long stream of orange beads to the right, and the bottom output holds only a short, stalled cluster." },
        title: "Circuit SAT",
        tile: "A half-adder settles on its own answer. No search algorithm runs.",
        what: "A half-adder settles on its own answer, you are watching electricity simulated in a circuit component live in your browser tab. Quanta (electrons or photons if you like) flow down the wires into two gates; with input A on, the SUM line fills with flowing quanta and nothing flows along CARRY. No search algorithm runs.",
        why: "Circuit satisfiability, the canonical P vs NP problem of computer science, is also a physical question about real circuits. Every modern circuit is built out of half-adders - put some constant number C of half-adders together and if simulating one is polynomial then C × polynomial is still polynomial. No polynomial-time algorithm is supposed to exist, so the usual way to find an input that satisfies a circuit is to search for one. The EGPT proofs, machine-checked in Lean, show that P=NP.",
        how: "Two logic gates, the wires between them and an emitter on each input - the half-adder electrical circuit simulation settles in your browser in polynomial time, effectively at once. A gate opens only when its inputs carry the pattern it stands for, so the circuit settles into its answer. Independent cellular automata, no equations. EGPT conceptually holds computer science and physics are linked by P=NP and the principle of least action - that is, everything in reality is efficiently computable. The Lean RET, the derivation of EntropyReal from an IIDParticleSource, and the P=NP capstones are modern formalizations of proofs and ideas advanced by Gian-Carlo Rota circa the late 1970s. The EGPT Lean proofs transparently show the most rigorously advanced proofs ever offered for bridging not only quantum and classical mechanics but mathematics and all the other sciences. Watch the answer emerge with no search, read the code, and judge for yourself whether this is true P=NP quantum computing.",
        controls: "It starts with input A on. Click the input A and input B toggles (bottom left) to switch each input on or off. Read the two outputs on the right: the top one is SUM (A xor B), the bottom one is CARRY (A and B). An output with quanta flowing along it reads 1; an empty one reads 0.",
    },
    {
        kind: 'rung', id: "big-bang",
        still: { tick: 200, alt: "A ragged red cloud of overlapping glowing discs laced with fine gold specks, clumped and broken at its edges, on black." },
        title: "Big Bang",
        tile: "A uniform field. Filaments and voids form. No gravity law, no constant.",
        what: "One burst fills the space, and structure emerges on its own. This is a fractal at its heart - it could be quantum emergence or large cosmic structures ... one set of rules from which attractive forces are a matter of your chosen unit of scale. This simulation is not meant as an assertion of what the correct scales are; it is an exploration of how emergence and scale are related.",
        why: "Large-scale cosmic structure requires gravitational attraction tuned over 13.8 billion years, and a simulation has to compute that gravity across the whole span.",
        how: "One point source, and a world that builds larger frames from the top down. No gravity law, no cosmological constant, no equations.",
    },
    {
        kind: 'rung', id: "atomic-model",
        still: { tick: 600, alt: "A large dark-red disc with a brighter red core; at the core's left edge a small violet ball sits in a tight cluster of pale beads, and one lone pale bead lies further out at lower right." },
        title: "Atomic model",
        tile: "Particles bind and stay bound. Stable orbits without quantum numbers.",
        what: "Quarks pack into a proton and stay bound, and an electron keeps its place in the atom around it. Stable orbits, without quantum numbers. Like the Big Bang, this simulation is not meant as an assertion of what the correct scales are; it is an exploration of how emergence and scale are related - the engine lets you set stable containment, or experiment with scale so that stability is emergent.",
        why: "Classical physics says an orbiting electron radiates its energy away and spirals into the nucleus in about 16 trillionths of a second. Textbook physics avoids that only by assuming quantised energy levels.",
        how: "Frames nested three layers deep: quarks in a proton, the proton and an electron in an atom. Each parent draws its children one step toward its centre every tick, and binding emerges from that. No force equation.",
    },
    {
        kind: 'rung', id: "collision-matrix-3d",
        still: { tick: 200, alt: "Pairs of shiny balls, red, orange, yellow, green and violet, meeting in mid-air against black.", pose: { azimuth: 45, elevation: -30 } },
        title: "3D Collisions Lab",
        tile: "Balls in a box. Contact, momentum, settling. The same engine that makes light makes mechanics; no second physics.",
        what: "Balls in a box, in seven lanes coloured red to violet by density. Each pair flies together and collides: the hard ones bounce cleanly, the soft ones press into each other before parting. Contact, momentum, settling. This is a \"Collisions Lab\" because it is up to you to find the capacity-and-fill relationships that produce the desired elastic vs inelastic collisions at your desired scale.",
        why: "In a game engine, collisions come from a separate physics engine, such as NVIDIA PhysX, solving rigid-body equations beside the renderer that draws the light. Two systems, two sets of rules.",
        how: "The same engine that makes the light in the other scenes makes these collisions: pairs of the same frames at seven densities. No second physics, no equations.",
    },
];

const ROW_KEYS = ['kind', 'id', 'mode', 'title', 'tile', 'what', 'why', 'how', 'controls', 'still'];

/**
 * A tile still: absent, or `{ tick: <positive integer>, alt: <text>, pose?: <orbit patch> }` (THROWS
 * otherwise). `alt` is the still's alt text, required whenever a still is declared. `pose` is a
 * non-empty object of finite numbers handed VERBATIM to the scene's camera handle
 * (`runner.cameraControl.setOrbit`), whose provider owns the orbit keys; the instrument asserts the
 * camera's read-back agrees with every key it names.
 */
function stillOf(v, where) {
    if (v === undefined || v === null) { return null; }
    const keys = (v && typeof v === 'object') ? Object.keys(v) : [];
    const shape = '{ tick: <positive integer>, alt: <text>, pose?: <non-empty setOrbit patch> } or absent';
    const unknown = keys.filter((k) => k !== 'tick' && k !== 'alt' && k !== 'pose');
    if (unknown.length || !Number.isInteger(v.tick) || v.tick < 1) {
        throw new Error('[exhibits] ' + where + ' must be ' + shape + ' (got ' + JSON.stringify(v) + ').');
    }
    const alt = assertCopyText(v.alt, '[exhibits] ' + where + '.alt');
    if (v.pose === undefined) { return Object.freeze({ tick: v.tick, alt }); }
    const pose = v.pose;
    if (!pose || typeof pose !== 'object' || Array.isArray(pose) || Object.keys(pose).length === 0) {
        throw new Error('[exhibits] ' + where + '.pose must be a non-empty setOrbit patch (got ' + JSON.stringify(pose) + ').');
    }
    Object.keys(pose).forEach((k) => {
        if (typeof pose[k] !== 'number' || !Number.isFinite(pose[k])) {
            throw new Error('[exhibits] ' + where + '.pose.' + k + ' must be a finite number (got ' + String(pose[k]) + ').');
        }
    });
    return Object.freeze({ tick: v.tick, alt, pose: Object.freeze(Object.assign({}, pose)) });
}

function rungOrThrow(id) {
    const rung = walkthroughById(id);
    if (!rung) {
        throw new Error('[exhibits] unknown walk-through rung "' + id + '" — declared rungs: [' +
            WALKTHROUGH.map((r) => r.id).join(', ') + '].');
    }
    return rung;
}

/** A rung's effective mode: the declared one (validated), or null for a single-mode rung. */
function rungMode(rung, modeId) {
    const eff = (modeId !== undefined && modeId !== null) ? modeId : defaultWalkthroughModeId(rung);
    effectiveRenderState(rung, eff);   // FAIL-LOUD on an undeclared mode (its contract)
    return walkthroughModes(rung).length > 1 ? eff : null;
}

/** Copy text through the copy gate: `required` refuses an absent value; an optional one is null when absent. */
function text(v, where, required) {
    if ((v === undefined || v === null) && !required) { return null; }
    return assertCopyText(v, '[exhibits] ' + where);
}

/** Refuse a row part that pastes the invitation or a whole intro paragraph (each has one place). */
function assertNotPasted(part, where) {
    if (part.indexOf(segText(SHOWCASE_INVITE)) !== -1) {
        throw new Error('[exhibits] ' + where + ' pastes SHOWCASE_INVITE — the card appends it by reference.');
    }
    SHOWCASE_INTRO.paragraphs.forEach((para, i) => {
        if (Array.isArray(para) && part.indexOf(segText(para)) !== -1) {
            throw new Error('[exhibits] ' + where + ' pastes SHOWCASE_INTRO paragraph ' + i + ' — the intro\'s text has one place.');
        }
    });
}

/**
 * assertRoster — the load-time validator: every row is a rung whose id resolves in the walk-through
 * registry, its mode is declared, no scene repeats, no unknown field, every
 * row has a title, a tile line and every CARD_PARTS part, `controls` is non-empty when present, all
 * copy passes the copy gate, and no part pastes the invitation or an intro paragraph. Exported so a
 * test can show each refusal on a planted roster. @returns the normalized, frozen rows (with `order`).
 */
export function assertRoster(rows) {
    const seen = new Set();
    return Object.freeze(rows.map((row, order) => {
        Object.keys(row).forEach((k) => {
            if (ROW_KEYS.indexOf(k) === -1) {
                throw new Error('[exhibits] row ' + order + ' has unknown field "' + k + '" — fields: ' + ROW_KEYS.join(', ') + '.');
            }
        });
        if (EXHIBIT_KINDS.indexOf(row.kind) === -1) {
            throw new Error('[exhibits] row ' + order + ' kind ' + JSON.stringify(row.kind) + ' — an exhibit is a walk-through rung: ' +
                '{ kind: \'rung\', id: <a lib/shim/registry/walkthrough.js id>, mode? } (EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + ').');
        }
        const mode = rungMode(rungOrThrow(row.id), row.mode);
        if (row.title === undefined || row.title === null) {
            throw new Error('[exhibits] row "' + row.id + '" has no title — every card is titled.');
        }
        const title = text(row.title, row.id + '.title', true);
        const key = row.kind + ':' + row.id + ':' + mode;
        if (seen.has(key)) { throw new Error('[exhibits] row ' + key + ' appears twice.'); }
        seen.add(key);
        const out = { kind: row.kind, id: row.id, mode, order, title };
        CARD_PARTS.forEach((p) => { out[p] = text(row[p], row.id + '.' + p, true); });
        out.controls = text(row.controls, row.id + '.controls', false);
        out.tile = text(row.tile, row.id + '.tile', true);
        CARD_PARTS.concat(['controls']).forEach((p) => { if (out[p] !== null) { assertNotPasted(out[p], row.id + '.' + p); } });
        out.still = stillOf(row.still, row.id + '.still');
        return Object.freeze(out);
    }));
}

/** The showcase roster, validated and normalized at load. */
export const EXHIBITS = assertRoster(ROSTER);

/** The roster rows of one kind, in roster order (throws on an unknown kind). */
export function exhibitsOfKind(kind) {
    if (EXHIBIT_KINDS.indexOf(kind) === -1) {
        throw new Error('[exhibits] exhibitsOfKind: unknown kind ' + JSON.stringify(kind) + ' — EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + '.');
    }
    return EXHIBITS.filter((e) => e.kind === kind);
}

/**
 * The roster row for a scene, or null when the scene is not on the roster. A null is a DECLARED
 * outcome the caller records (the player plays such a scene with no card: 'not-offered-no-roster-row').
 * The scene itself must exist: an unknown kind, id or mode throws.
 * @param {{kind: 'rung', id: string, modeId?: string|null}} scene
 */
export function exhibitFor(scene) {
    const kind = scene && scene.kind;
    if (EXHIBIT_KINDS.indexOf(kind) === -1) {
        throw new Error('[exhibits] unknown scene kind ' + JSON.stringify(kind) + ' — EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + '.');
    }
    const mode = rungMode(rungOrThrow(scene.id), scene.modeId);
    for (let i = 0; i < EXHIBITS.length; i++) {
        const e = EXHIBITS[i];
        if (e.kind === kind && e.id === scene.id && e.mode === mode) { return e; }
    }
    return null;
}

/**
 * How the MOVE/LOOK pads work, shown on every 3D roster scene's card. The claims are
 * CameraControls.js's contract and are exercised in apps/ide/test/gym-scene-player.spec.js
 * (MOVE pad and W/A/S/D translate, LOOK pad and the arrow keys rotate; mouse and touch both drive
 * the pads).
 */
export const JOYSTICK_EXPLAINER = Object.freeze([
    Object.freeze([
        'Move and Look: this scene is 3D. Drag the MOVE pad (bottom left) to walk the camera forward, back ' +
        'and sideways, and the LOOK pad (bottom right) to turn it. Both pads take a finger on a phone or ' +
        'the mouse on a desktop; on a keyboard, W/A/S/D move and the arrow keys look.',
    ]),
]);

/**
 * sceneKey — the run-once seen-key of a scene: kind, id and, for a multi-mode rung, its EFFECTIVE
 * mode (the one normalizer, rungMode); never a bare id, so it cannot collide with a tab key.
 * Throws for an unknown kind, id or mode.
 * @param {{kind: 'rung', id: string, modeId?: string|null}} scene
 */
export function sceneKey(scene) {
    const kind = scene && scene.kind;
    if (EXHIBIT_KINDS.indexOf(kind) === -1) {
        throw new Error('[exhibits] unknown scene kind ' + JSON.stringify(kind) + ' — EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + '.');
    }
    const mode = rungMode(rungOrThrow(scene.id), scene.modeId);
    return 'scene-' + kind + '-' + scene.id + (mode ? '-' + mode : '');
}

/**
 * The run-once card of a ROSTER row: title, then `what`, `why`, `how`, `controls` when present, the
 * JOYSTICK_EXPLAINER on a 3D scene (3D read from walkthroughIs3D), and
 * SHOWCASE_INVITE last, by reference. Composed from the row and the showcase constants only: no
 * registry prose ever. The bag's { seenKey, title, paragraphs } is what lib/components/run-once-card
 * renders.
 * @param {object} row  an element of EXHIBITS (exhibitFor's answer)
 * @throws {Error} a row that is not on the roster.
 */
export function showcaseCard(row) {
    if (EXHIBITS.indexOf(row) === -1) {
        throw new Error('[exhibits] showcaseCard takes a roster row (an EXHIBITS element, e.g. exhibitFor(scene)); got ' +
            JSON.stringify(row && { kind: row.kind, id: row.id }) + '.');
    }
    const is3D = walkthroughIs3D(row.id, row.mode);
    let paragraphs = CARD_PARTS.map((p) => Object.freeze([row[p]]));
    if (row.controls !== null) { paragraphs = paragraphs.concat([Object.freeze([row.controls])]); }
    if (is3D) { paragraphs = paragraphs.concat(JOYSTICK_EXPLAINER); }
    paragraphs = paragraphs.concat([SHOWCASE_INVITE]);
    return Object.freeze({
        kind: row.kind, id: row.id, modeId: row.mode,
        seenKey: sceneKey({ kind: row.kind, id: row.id, modeId: row.mode }),
        title: row.title,
        paragraphs: Object.freeze(paragraphs),
        is3D,
    });
}
