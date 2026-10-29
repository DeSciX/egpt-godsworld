/* Copyright 2023-2026 by Essam Abadir */

/**
 * studio-landing.js — the ONE record of how STUDIO resolved the deep link it opened with, as host-view.js records
 * its view outcome: STUDIO's resolver (lib/features/ide/studio-landing-of.js::studioLandingOf) decides the row and
 * AuthorView.jsx writes it on `document.documentElement` under STUDIO_LANDING_ATTR, through recordStudioLanding,
 * and a gate that opens a link (a showcase tile, roster.js showcaseHref) reads that attribute instead of STUDIO's DOM or
 * its error copy.
 *
 *   STUDIO_LANDING_ATTR          the <html> attribute carrying the outcome id
 *   STUDIO_LANDING_OUTCOMES      the closed table: one row per branch of STUDIO's link resolution, `{ id, runs, means }`;
 *                                `runs` says whether the scene that landing opens starts on load (through STUDIO's Run
 *                                control's own path) — true only on `ok`, a deep link that named a scene; every other
 *                                landing opens its scene in Design, waiting for Run
 *   recordStudioLanding(root, id) writes `id` on `root` (an Element, or null to only validate); an id outside the
 *                                table THROWS — that is a defect in the writer, never a landing
 *
 * The rows are the branches the resolution already takes, no more: the link's keys are read by the one parser
 * (lib/features/ide/deep-link.js) and the refusal of a key STUDIO does not own is its deepLinkRefusalOf. `ok` says the
 * linked scene RESOLVED and was handed to STUDIO's selection path; whether that scene then boots is the boot record's
 * business (boot-phases.js), not this one's.
 *
 * Lives in the registry, published by `./registry`: the outcome is the landing of the link showcaseHref writes, so a
 * gate following a tile takes both from one module instance; the parser's own home (lib/features) has no package
 * door, and shim may not import features.
 *
 * Host-neutral ESM with no imports: it runs unchanged in node and in a page.
 */

/** The <html> attribute STUDIO records its deep-link landing on. */
export const STUDIO_LANDING_ATTR = 'data-frqtl-studio-landing';

/** The closed table of STUDIO deep-link landings, in the order the resolver tests them (lib/features/ide/test/studio-landing-of.test.mjs holds it). */
export const STUDIO_LANDING_OUTCOMES = Object.freeze([
    { id: 'refused-key', runs: false,
      means: 'the link carries a key STUDIO does not own, or a deleted key (deep-link.js deepLinkRefusalOf): the refusal is on the deep-link strip and the opening scene opens' },
    { id: 'conflict', runs: false,
      means: 'the link names more than one scene source (two of walkthrough, project and scene), or a renderer beside a walkthrough or a project, which carry their own: nothing opens' },
    { id: 'mode-without-walkthrough', runs: false,
      means: 'the link names a mode and no walkthrough: nothing opens' },
    { id: 'renderer-without-scene', runs: false,
      means: 'the link names a renderer and no scene; a renderer is chosen only for a scene link: nothing opens' },
    { id: 'unknown-walkthrough', runs: false,
      means: 'the linked walkthrough is not a scene of the loaded roster (walkthroughById(roster, id)): nothing opens' },
    { id: 'unknown-mode', runs: false,
      means: 'the linked mode is not one the linked scene declares (walkthroughModes): nothing opens' },
    { id: 'scene-refused-origin', runs: false,
      means: 'the linked scene URL is on neither the page\'s origin nor the roster\'s (roster-link.js sceneOriginRefusalOf): the strip names the rule and both origins; nothing opens' },
    { id: 'scene-unreadable', runs: false,
      means: 'the linked scene URL is allowed but its read failed (a non-200, an empty body, or not a .js sketch): nothing opens' },
    { id: 'project-unreadable', runs: false,
      means: 'the linked saved project is present but its folder is refused by the load: nothing opens' },
    { id: 'project-not-found', runs: false,
      means: 'no saved project of the linked name in this browser: nothing opens' },
    { id: 'ok', runs: true,
      means: 'the linked walkthrough (in the linked mode, else its default), saved project or scene resolved and was handed to STUDIO\'s selection path; the scene starts on load' },
    { id: 'first-contact', runs: false,
      means: 'no STUDIO deep link: the roster\'s first-contact scene (firstContactOf(roster)) opens' },
    { id: 'first-contact-empty', runs: false,
      means: 'no STUDIO deep link and the roster declares no first contact: the Empty Universe opens' },
].map(Object.freeze));

const IDS = new Set(STUDIO_LANDING_OUTCOMES.map((r) => r.id));

/**
 * @param {Element|null} root  the document element STUDIO runs in (null: validate only)
 * @param {string} id          a STUDIO_LANDING_OUTCOMES id
 * @returns {string} id
 * @throws {Error} an id the table does not list
 */
export function recordStudioLanding(root, id) {
    if (!IDS.has(id)) {
        throw new Error('[studio-landing] \'' + id + '\' is not a STUDIO_LANDING_OUTCOMES row — declared: [' +
            [...IDS].join(', ') + ']. (FAIL-LOUD.)');
    }
    if (root) { root.setAttribute(STUDIO_LANDING_ATTR, id); }
    return id;
}
