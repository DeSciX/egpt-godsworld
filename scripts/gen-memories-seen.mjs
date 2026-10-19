#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * gen-memories-seen.mjs — the ONE writer of a seen memory, from a run's Record folder (the sketch-projects design §6).
 *
 *   node scripts/gen-memories-seen.mjs <minimaxi/out/<run>/record> --looked-by <kind>:<role> --stills <N> --account "<words>" [--clip <clip>.mp4] [--looked-by … for another look] [--owl-look <N> [--answered-by <role>]] [--draft]
 *   (minimaxi/loop.mjs imports writeSeenMemory and calls it on a LOCAL Owl's approve, with that Owl's look; USAGE spells the CLI out)
 *
 * The input is the run's Record folder: record-01/, record-02/, … (site/app-assets/maxi-record-folder.js owns the layout,
 * the chain and the completeness gate; minimaxi/record-folder.mjs reads it from disk). The memory is written from the
 * HAND-BACK Record its lab.json names (`handBack.record`): its clips, its change rows (record.json `changes`, one memo
 * line per row in the §6 vocabulary, printed by the owner's changeText), its parts.before/after.json (one line per
 * entry that differs), its tickRange and its scene, the loop round's own fields quoted from lab.json, and the human's
 * teaching words when lab.json carries them (the owner's TEACHING_KEY: teachingLines, verbatim, each line quoted). Every sentence
 * is quoted from the Record; nothing is written that a role did not say or the Record does not hold.
 *
 * PUBLISHING: only a COMPLETE Record (recordFolderFaults → []) in a chain that holds (recordChainFaults → []) is
 * published: the whole hand-back folder is copied to site/memories/<id>/ with the roles' answers under turns/ (turnFilesOf),
 * so every provenance path the memory cites resolves (the clips, the stills, record.json, lab.json,
 * parts.*.json, project/) and the text to kb/GodsWorld/memories/<id>-seen.md. An incomplete Record is REFUSED by name,
 * every missing field listed; `--draft` (draft: true) writes the text only under the run's own folder,
 * minimaxi/out/<run>/memory/<id>-seen.md — never into kb/ or site/. A memory is a DRAFT until its id joins the roster.
 *
 * THE LOOK: a seen memory is never written unless a human, the local Owl or the seat's own local agent LOOKED
 * at its stills; the platform brain's word alone writes nothing. The look is one line per clip looked at, owned
 * here (lookedLine writes it, parseLooked reads it, lookedFaults is the gate scripts/test/memories.test.mjs
 * runs on every seen file); LOOKED_SHAPE spells the line out from LOOKERS. The looker is named by a ROLE
 * (ROLE_TOKEN: lab-owner, godsworld-seat-author, maxi-owl), never by a person's name.
 * The CLI needs the look; the loop (minimaxi/loop.mjs) passes it only from a local-brain Owl.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, STILLS, LOOP_LAB_KEYS, RECORD_DIR, SHAPE_OWNER, UNAVAILABLE, TEACHING_KEY, CARRIED_KEY, recordFolderFaults, recordChainFaults, recordPlanFaults, planOf, changeText, sceneFacts, projectEntryOf } from '../site/app-assets/maxi-record-folder.js';
import { SEEN_ACCOUNT, ROLE_ORDER } from '../site/app-assets/maxi-roles.js';
import { readRecordFolder, writeRecordFolder } from '../minimaxi/record-folder.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** A memory id: `mm-` then lowercase words joined by single dashes (no empty word, no double or trailing dash). */
export const MEMORY_ID = /^mm(?:-[a-z0-9]+)+$/;

/** One word-run of an id: lowercase, every other character run → one dash, no dash at either end. */
function idWords(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

/** THE id of a loop memory: mm-<scene>-<run without its leading `mm-` or `mm`>, each as lowercase words (mm-r11a and
 *  mmr11a both give mm-<scene>-r11a). A scene or a run that leaves no word is refused by name. The loop calls this; nothing else builds one. */
export function memoryId(scene, run) {
    const s = idWords(scene), r = idWords(String(run == null ? '' : run).replace(/^mm-?/i, ''));
    if (!s || !r) { throw new Error('[gen-memories-seen] scene ' + JSON.stringify(scene) + ' and run ' + JSON.stringify(run) + ' make no memory id: ' + (!s ? 'the scene' : 'the run without its leading mm- or mm') + ' leaves no word.'); }
    const id = 'mm-' + s + '-' + r;
    if (!MEMORY_ID.test(id)) { throw new Error('[gen-memories-seen] scene ' + JSON.stringify(scene) + ' and run ' + JSON.stringify(run) + ' make no memory id (got ' + id + ').'); }
    return id;
}

// ── the look: one owner of the looked line ───────────────────────────────────────────────────
/** Who may vouch for a seen memory's pictures: a person, the local Owl (a Claude Code agent reading the
 *  turn file's frames), or the seat's own local agent. The platform brain is never one of them. */
export const LOOKERS = Object.freeze(['human', 'local-owl', 'seat']);
/** The platform brain, by any of its names: a kind, a who, or a platform interaction id (dsx1.…). */
export const PLATFORM_BRAIN = /^(?:platform|owl-platform)$|gemini|^dsx1\./i;
const LOOKED = /^looked: (\S+) (\S+) on (\d+) stills? of (memories\/([A-Za-z0-9._-]+)\/[A-Za-z0-9._-]+\.mp4) — (.*)$/;
export const LOOKED_PREFIX = 'looked: ';
/** How a looker is named: a role, as lowercase kebab words, at least two (lab-owner, godsworld-seat-author, maxi-owl) — never a person's name. */
export const ROLE_TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
/** THE shape of the looked line, in words, built from LOOKERS: every message and the usage quote this, never a hand copy. */
export const LOOKED_SHAPE = LOOKED_PREFIX + '<' + LOOKERS.join('|') + '> <role> on <N> stills of memories/<id>/<clip>.mp4 — <account>';

/** THE placeholder predicate: a seen file that says no recording was watched yet has no stills to look at.
 *  The one named exception to the looked rule; every reader of a seen file asks this, never its own regex. */
export function isPlaceholder(text) { return /^No recording watched yet\b/m.test(String(text)); }

/** What is wrong with a look {by, who, stills, account}: [] when it may vouch. */
function lookFaults(look) {
    const bad = [];
    if (PLATFORM_BRAIN.test(String(look.by)) || PLATFORM_BRAIN.test(String(look.who))) {
        bad.push('the looker ' + JSON.stringify(look.by + ' ' + look.who) + ' is the platform brain, whose word alone keeps no seen memory — a human, the local Owl or the seat must look at the stills');
    } else if (!LOOKERS.includes(look.by)) {
        bad.push('the looker kind ' + JSON.stringify(look.by) + ' is not one of ' + LOOKERS.join('|'));
    }
    if (!ROLE_TOKEN.test(String(look.who || ''))) { bad.push('the looker is named by a role (lowercase kebab words, at least two, e.g. lab-owner, godsworld-seat-author, maxi-owl), never a person\'s name; got ' + JSON.stringify(look.who)); }
    if (!Number.isInteger(look.stills) || look.stills < 1) { bad.push('the look names how many stills were looked at (a whole number ≥ 1), got ' + JSON.stringify(look.stills)); }
    if (!String(look.account || '').trim()) { bad.push('the look carries no account in the looker\'s words'); }
    return bad;
}

/** THE looked line of memory <id>, citing its clip <clip> (a file name under site/memories/<id>/). Throws on a look that may not vouch. */
export function lookedLine(look, id, clip) {
    if (!look) { throw new Error('[gen-memories-seen] no look: a seen memory is written only after a human, the local Owl or the seat looked at its stills (the platform brain\'s approve alone writes nothing) — nothing was written.'); }
    const bad = lookFaults(look);
    if (bad.length) { throw new Error('[gen-memories-seen] ' + bad.join('; ') + ' — nothing was written.'); }
    return LOOKED_PREFIX + look.by + ' ' + look.who + ' on ' + look.stills + ' still' + (look.stills === 1 ? '' : 's') + ' of memories/' + id + '/' + (clip || 'clip.mp4') + ' — ' + oneLine(look.account);
}

/** Every looked line of a text, parsed: [{line, by, who, stills, clip, id, account}] (a malformed one has {line, malformed:true}). */
export function parseLooked(text) {
    return String(text).split('\n').filter(function (l) { return /^looked:/i.test(l); }).map(function (l) {
        const m = l.match(LOOKED);
        return m ? { line: l, by: m[1], who: m[2], stills: Number(m[3]), clip: m[4], id: m[5], account: m[6] } : { line: l, malformed: true };
    });
}

/** The gate on one seen memory <id>: [] when it carries at least one looked line, each by a looker who may vouch,
 *  each citing a clip published under site/memories/<id>/. A placeholder (isPlaceholder) is the named exception: no stills, so no looked line. */
export function lookedFaults(text, id, siteDir) {
    const looks = parseLooked(text);
    if (isPlaceholder(text)) { return looks.length ? [id + '-seen.md is a placeholder (no recording watched yet) yet carries a looked line: there are no stills to have looked at'] : []; }
    if (!looks.length) { return [id + '-seen.md has no `' + LOOKED_SHAPE + '` line: nobody who may vouch is on record as having looked at its stills']; }
    const bad = [];
    looks.forEach(function (k) {
        if (k.malformed) { bad.push(id + '-seen.md: a looked line not in the shape `' + LOOKED_SHAPE + '`: ' + k.line.slice(0, 200)); return; }
        lookFaults({ by: k.by, who: k.who, stills: k.stills, account: k.account }).forEach(function (f) { bad.push(id + '-seen.md: ' + f); });
        if (k.id !== id) { bad.push(id + '-seen.md: its look cites ' + k.clip + ', another memory\'s clip, not one under site/memories/' + id + '/'); }
        else if (!fs.existsSync(path.join(siteDir, k.clip))) { bad.push(id + '-seen.md: its look cites ' + k.clip + ', which is not published under site/'); }
    });
    return bad;
}

/** The three stills of a clip: its first, middle and last frame (named by the Record owner's STILLS). */
export function stillsOf(frames) {
    if (!Array.isArray(frames) || frames.length < STILLS.length) { throw new Error('[gen-memories-seen] the stills need at least ' + STILLS.length + ' frames of the clip, got ' + JSON.stringify(frames && frames.length)); }
    return [frames[0], frames[Math.floor(frames.length / 2)], frames[frames.length - 1]];
}

function oneLine(s) { return String(s).replace(/\s+/g, ' ').trim(); }

// ── a run's Records → the hand-back Record ──────────────────────────────────────────────────────
/** One JSON file of a folder tree, or undefined when absent or unparsable (the completeness gate names which). */
function jsonOf(files, f) {
    if (!(f in files)) { return undefined; }
    try { return JSON.parse(typeof files[f] === 'string' ? files[f] : new TextDecoder('utf-8').decode(files[f])); } catch (e) { return undefined; }
}

/**
 * A run's Record folder (<run>/record/, holding record-NN/) → {recordDir, runDir, folders, handBack, files, record, lab,
 * partsBefore, partsAfter, id, faults, complete}. THROWS when it is not a run's Record folder, when its chain does not hold
 * (a broken chain cannot name its hand-back), and when the hand-back Record is not a loop Record. `faults` are the
 * hand-back Record's completeness faults (recordFolderFaults, the owner's gate) and then its plan faults (`planFaults`:
 * recordPlanFaults of the hand-back's plan against the chain, run only after recordChainFaults holds, so the chain's order
 * is the folders' own): [] when it may be published. A published memory whose Record does not state its plan cannot be
 * repaired after publishing, so a plan fault drafts it like any other.
 */
export function readRun(recordDir) {
    const at = path.resolve(recordDir);
    if (fs.existsSync(at) && fs.statSync(at).isFile()) {
        throw new Error('[gen-memories-seen] ' + recordDir + ' is a file: a seen memory is written from a run\'s Record folder (minimaxi/out/<run>/record/, ' + SHAPE_OWNER + '), never from a loop record.json — writeSeenDraft and its <run>.record.json are deleted; pass the run\'s Record folder.');
    }
    if (!fs.existsSync(at) || !fs.statSync(at).isDirectory()) { throw new Error('[gen-memories-seen] no Record folder at ' + recordDir + ' — pass minimaxi/out/<run>/record/.'); }
    if (path.basename(at) !== 'record') { throw new Error('[gen-memories-seen] ' + recordDir + ' is not a run\'s Record folder: it is <run>/record/, holding record-01/, record-02/, …'); }
    const names = fs.readdirSync(at).filter(function (n) { return RECORD_DIR.test(n) && fs.statSync(path.join(at, n)).isDirectory(); }).sort();
    if (!names.length) { throw new Error('[gen-memories-seen] ' + recordDir + ' holds no record-NN/ folder.'); }
    const folders = names.map(function (n) { return { name: n, files: readRecordFolder(path.join(at, n)) }; });
    const chain = recordChainFaults(folders);
    if (chain.length) {
        const each = folders.map(function (f) { return recordFolderFaults(f.files).map(function (x) { return f.name + ': ' + x; }); }).reduce(function (a, b) { return a.concat(b); }, []);
        throw new Error('[gen-memories-seen] the Records under ' + recordDir + ' do not chain, so no hand-back Record can be named — nothing was written:\n- ' + chain.join('\n- ') +
            (each.length ? '\nand each Record\'s own faults (the completeness gate):\n- ' + each.join('\n- ') : ''));
    }
    const lab0 = jsonOf(folders[0].files, FILES.lab);
    const hb = folders.find(function (f) { return f.name === lab0.handBack.record; });
    const files = hb.files;
    const lab = jsonOf(files, FILES.lab);
    if (lab.producer !== 'loop') { throw new Error('[gen-memories-seen] the hand-back Record is a ' + JSON.stringify(lab.producer) + ' Record: only a loop Record is written into a memory (its id is mm-<plan scene>-<run> and its look is the round\'s); nothing was written.'); }
    const planFaults = recordPlanFaults(planOf(files), folders.map(function (f) { return f.files; }));
    const faults = recordFolderFaults(files).concat(planFaults);
    return {
        recordDir: at, given: recordDir, runDir: path.dirname(at), folders: folders, handBack: lab.handBack, files: files,
        record: jsonOf(files, FILES.record), lab: lab, partsBefore: jsonOf(files, FILES.partsBefore), partsAfter: jsonOf(files, FILES.partsAfter),
        id: memoryId(lab.plan && lab.plan.scene, lab.run), faults: faults, planFaults: planFaults, complete: faults.length === 0
    };
}

// ── the Record's lines: the memo lines and the parts diff ───────────────────────────────────────
export const CHANGE_PREFIX = 'change: ';
export const PART_PREFIX = 'part ';
const NO_CHANGE = CHANGE_PREFIX + '(none: no act changed a declared part in this Record)';
const NO_PART_DIFF = PART_PREFIX + '(none): parts.after.json equals parts.before.json';

function partsSide(v, file) {
    if (v === undefined) { return { missing: file + ' is not in the folder' }; }
    if (v && v[UNAVAILABLE]) { return { missing: file + ' is unavailable' }; }
    return { parts: v };
}
/** How a change: line marks a row the Record CARRIED from before the producer began (lab.json CARRIED_KEY): the row is
 *  record.json's, so it stays a change: line, and the mark says on the line itself that it is not the round's act, so a
 *  reader who retrieves only the Changes section still knows (the carried heading sits above, under the header). */
export const CARRIED_MARK = 'carried (before this round, not its act) · ';
/** How many of record.json's leading rows a lab.json carried (CARRIED_KEY changes; carriedFaults holds them to be the leading rows): 0 when none. */
function carriedRowCount(lab) {
    const c = lab && lab[CARRIED_KEY];
    return c && Array.isArray(c.changes) ? c.changes.length : 0;
}
/**
 * THE lines a seen memory states from its Record, in order: one memo line per record.json change row (the owner's
 * changeText: `op` in the §6 vocabulary, a move's from/to in the shape its entry declares, setDeclared/add/remove/fork
 * as written; a carried row opens with CARRIED_MARK), then one line per parts entry that differs between parts.before.json
 * and parts.after.json. The memories gate re-renders these from the published folder (site/memories/<id>/) and compares,
 * so a hand edit of either is red.
 */
export function recordLines(files) {
    const record = jsonOf(files, FILES.record);
    const rows = record && Array.isArray(record.changes) ? record.changes : [];
    const carried = carriedRowCount(jsonOf(files, FILES.lab));
    const lines = rows.length ? rows.map(function (c, i) { return CHANGE_PREFIX + (i < carried ? CARRIED_MARK : '') + changeText(c); }) : [NO_CHANGE];
    const before = partsSide(jsonOf(files, FILES.partsBefore), FILES.partsBefore);
    const after = partsSide(jsonOf(files, FILES.partsAfter), FILES.partsAfter);
    if (before.missing || after.missing) {
        lines.push(PART_PREFIX + '(not stated): ' + [before.missing, after.missing].filter(Boolean).join('; ') + ' — the parts diff waits on it');
        return lines;
    }
    const names = Object.keys(before.parts).concat(Object.keys(after.parts).filter(function (n) { return !(n in before.parts); }));
    const diff = names.filter(function (n) { return JSON.stringify(before.parts[n]) !== JSON.stringify(after.parts[n]); }).map(function (n) {
        const side = function (v) { return v === undefined ? '(absent)' : JSON.stringify(v); };
        return PART_PREFIX + n + ': ' + side(before.parts[n]) + ' → ' + side(after.parts[n]);
    });
    return lines.concat(diff.length ? diff : [NO_PART_DIFF]);
}
/** The Record's lines as they stand in a memory text (every line opening with CHANGE_PREFIX or PART_PREFIX), in order. */
export function recordLinesOf(text) {
    return String(text).split('\n').filter(function (l) { return l.startsWith(CHANGE_PREFIX) || l.startsWith(PART_PREFIX); });
}

/** How a memory opens the human's teaching note (lab.json TEACHING_KEY, the owner's key). */
export const TEACHING_HEADING = 'Teaching note (the human\'s own words with the demonstration, verbatim, from lab.json ' + TEACHING_KEY + '):';
/** Each line of the human's words is quoted under the heading, so no line of theirs can read as a looked:, change: or part line. */
export const TEACHING_QUOTE = '> ';
/** THE teaching note of a hand-back lab.json: [] when it carries none, else the heading and every line of the words, verbatim, quoted. */
export function teachingLines(lab) {
    const t = lab && lab[TEACHING_KEY];
    if (typeof t !== 'string') { return []; }
    return ['', TEACHING_HEADING].concat(t.split('\n').map(function (l) { return TEACHING_QUOTE + l; }));
}
/** The human's words as a memory text states them (teachingLines read back), or null when it states none. */
export function teachingOfText(text) {
    const a = String(text).split('\n');
    const i = a.indexOf(TEACHING_HEADING);
    if (i === -1) { return null; }
    const out = [];
    for (let k = i + 1; k < a.length && a[k].startsWith(TEACHING_QUOTE); k++) { out.push(a[k].slice(TEACHING_QUOTE.length)); }
    return out.join('\n');
}

/** How a memory opens what its Record carried from before the producer began (lab.json CARRIED_KEY, the Record owner's key). */
export const CARRIED_HEADING = 'Before this round (lab.json ' + CARRIED_KEY + ': what the world\'s Record already held when the loop took the outline — set aside, not the round\'s acts or its plan\'s):';
/** Each carried row or clip is a listed line under the heading, so none reads as a change:, part: or looked: line. */
export const CARRIED_PREFIX = '- earlier ';
/**
 * THE carried lines of a lab.json: [] when it carries none, else the heading, one line per carried row (changeText) and per
 * carried clip. Read off the HAND-BACK Record's lab.json, which is the one the memory serves and re-renders from: carried rides
 * in a chain's first Record, so it is rendered when that Record is the hand-back (a one-world round). A carried in an earlier
 * Record of a longer chain is left out ON PURPOSE: that Record is not served under site/memories/<id>/, so the published rule
 * could not re-render it, and its rows are neither the round's acts nor its plan's (recordPlanFaults skips them).
 */
export function carriedLines(lab, media) {
    const c = lab && lab[CARRIED_KEY];
    if (!c) { return []; }
    return ['', CARRIED_HEADING].concat(c.changes.map(function (r) { return CARRIED_PREFIX + 'act: ' + changeText(r); }),
        c.clips.map(function (k) { return CARRIED_PREFIX + 'clip: ' + (media || '') + k.clip + ' (' + k.hand + ', ticks ' + k.firstTick + '–' + k.lastTick + ')'; }));
}

/** How a memory opens what an approving round after the first means for its Record (lab.json `rounds`, a LOOP_LAB_KEYS key):
 *  maxi-loop.js makes Records of the approving round's worlds only, and re-reads the stage before each later round, so that
 *  round opens on the world the round before it left. */
export const ROUNDS_PREFIX = 'Rounds (lab.json rounds): ';
/** Each of the Builder's hands is a listed line under the rounds paragraph, so none reads as a change:, part: or looked: line. */
export const HAND_NOTE_PREFIX = '- hand ';
/**
 * THE rounds lines of a lab.json: [] for a round-1 approve; else what a reader of a later round's Record must not miss —
 * the Record holds the approving round only, opened on the world the round before it left (so parts.before.json is that world,
 * with the earlier rounds' acts in it, and its change: rows are only the acts made from there); lab.json steps hold
 * every round's hands — then the Builder's own note on each hand, verbatim (steps[].args.note), which says which act was what.
 */
export function roundsLines(lab) {
    const n = lab && lab.rounds;
    if (!(Number.isInteger(n) && n > 1)) { return []; }
    return ['', ROUNDS_PREFIX + n + '. The Owl approved round ' + n + ', and this Record is that round only: maxi-loop.js makes Records of the approving round\'s worlds, and round ' + n +
        ' opened on the world round ' + (n - 1) + ' left, with round ' + (n - 1) + '\'s acts already in it. So parts.before.json is that world, not the scene as the plan found it; the change: rows below are round ' + n + '\'s acts only, made from that world (the Builder\'s notes below say what each act was for), and the Built line lists the hands of every round.',
        'The Builder\'s note on each hand, in order (lab.json steps, every round\'s, verbatim):'].concat(lab.steps.map(function (s, i) {
        const note = s && s.args && typeof s.args.note === 'string' && s.args.note.trim() ? oneLine(s.args.note) : '(no note)';
        return HAND_NOTE_PREFIX + (i + 1) + ' ' + s.hand + ': ' + note;
    }));
}

/** How a memory cites the clip a line's words were said about: the [clip memories/<id>/<clip>.mp4] marker the memories gate's
 *  measured rule reads, so a role's verbatim "measured" names the served clip it was read off. */
export function clipCite(clipPath) { return '[clip ' + clipPath + ']'; }

/** The words that open a memory generated from a Record: a text carrying them is a Record memory, whatever is served. */
export const RECORD_HEADER = 'generated by scripts/gen-memories-seen.mjs from the Record folder';
/** Whether a memory text claims to come from a Record: the generator's header, or any change:/part: line. */
export function claimsRecord(text) { return String(text).includes(RECORD_HEADER) || recordLinesOf(text).length > 0; }

/**
 * The gate on a published seen memory: [] when it neither claims a Record (claimsRecord) nor has one served; else its
 * served folder site/memories/<id>/ must hold a complete Record and its Record lines must be exactly recordLines of that
 * folder. It triggers on the TEXT as well as the folder, so a deleted record.json or a hand-written change: line is red.
 */
export function publishedRecordFaults(text, id, siteDir) {
    const dir = path.join(siteDir, 'memories', id);
    const served = fs.existsSync(path.join(dir, FILES.record));
    if (!served) {
        return claimsRecord(text) ? [id + '-seen.md claims a Record (the generator\'s header or a change:/part: line) but site/memories/' + id + '/' + FILES.record + ' is not served — a Record memory is generated from its served, complete Record by scripts/gen-memories-seen.mjs, never written by hand'] : [];
    }
    const files = readRecordFolder(dir);
    const bad = recordFolderFaults(files).map(function (f) { return id + ': site/memories/' + id + '/ is not a complete Record — ' + f; });
    const want = recordLines(files);
    const got = recordLinesOf(text);
    if (JSON.stringify(want) !== JSON.stringify(got)) {
        bad.push(id + '-seen.md: its Record lines are not the ones its served Record states (regenerate with scripts/gen-memories-seen.mjs; never edit them by hand):\n  want ' + want.join('\n       ') + '\n  got  ' + got.join('\n       '));
    }
    if (!String(text).includes(RECORD_HEADER)) { bad.push(id + '-seen.md: a Record is served for it, but its text does not open with the generator\'s header (`' + RECORD_HEADER + '`)'); }
    if (String(text).includes(DRAFT_CLAUSE) || !String(text).includes(PUBLISHED_CLAUSE)) { bad.push(id + '-seen.md: a published Record memory says `' + PUBLISHED_CLAUSE + '` and never `' + DRAFT_CLAUSE + '` (that is a draft\'s, under minimaxi/out/<run>/memory/)'); }
    citedUnder(text, id).filter(function (rel) { return !(rel in files); }).forEach(function (rel) { bad.push(id + '-seen.md cites memories/' + id + '/' + rel + ', which its served Record folder does not hold'); });
    if (!bad.length) { bad.push.apply(bad, rerenderFaults(text, id, files)); }
    return bad;
}

/**
 * The whole text, held: re-render the memory from its served Record folder and the looks its own looked lines carry, and
 * require byte equality. The served folder holds every input except the looks. Of a look, only its kind, role, still count,
 * clip and the account of a human or seat look are carried by its line (the looker's own words, owned by no file).
 * A local-owl account must be owlLook's exactly, checked by renderSeenMemory. So a hand edit of any other line is red:
 * the Record lines, the Owl's or the Builder's words, the header, the Threads line, the Owl's looked line.
 */
function rerenderFaults(text, id, files) {
    const lab = jsonOf(files, FILES.lab) || {};
    const looks = parseLooked(text).filter(function (k) { return !k.malformed; }).map(function (k) {
        return { by: k.by, who: k.who, stills: k.stills, account: k.account, clip: k.clip.slice(('memories/' + id + '/').length) };
    });
    let want;
    try {
        want = renderSeenMemory({ lab: lab, id: id, record: jsonOf(files, FILES.record), files: files, handBack: lab.handBack || {}, complete: true, faults: [] }, looks, { draft: false });
    } catch (e) { return [id + '-seen.md cannot be re-rendered from its served Record and its looked lines: ' + e.message]; }
    if (want === String(text)) { return []; }
    const a = String(text).split('\n'), b = want.split('\n');
    let i = 0; while (i < a.length && a[i] === b[i]) { i++; }
    return [id + '-seen.md is not the text the generator renders from its served Record and its looked lines (regenerate with scripts/gen-memories-seen.mjs; never edit it by hand); first difference at line ' + (i + 1) + ':\n  want ' + String(b[i]).slice(0, 200) + '\n  got  ' + String(a[i]).slice(0, 200)];
}

/** Every path a text cites under memories/<id>/ (relative to that folder; a sentence's closing dot is not part of a path). */
export function citedUnder(text, id) {
    const re = new RegExp('\\bmemories/' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([A-Za-z0-9._/-]*[A-Za-z0-9_/-])', 'g');
    return Array.from(new Set(Array.from(String(text).matchAll(re)).map(function (m) { return m[1]; }).filter(function (r) { return !r.endsWith('/'); })));
}

// ── the INDEX's Record memories: one owner, written by gen-memories-build.mjs, gated by memories.test ─────────
export const RECORD_INDEX_HEADING = '## Record memories';
/** The INDEX section listing every published Record memory under `memDir` (its media under `siteDir`/memories/<id>/), by id. */
export function recordIndexSection(memDir, siteDir) {
    const ids = fs.readdirSync(memDir).filter(function (f) { return f.endsWith('-seen.md') && claimsRecord(fs.readFileSync(path.join(memDir, f), 'utf8')); })
        .map(function (f) { return f.slice(0, -'-seen.md'.length); }).sort();
    const cell = function (v) { return oneLine(v).replace(/\|/g, '\\|'); };
    const rows = ids.map(function (id) {
        const lab = jsonOf(readRecordFolder(path.join(siteDir, 'memories', id)), FILES.lab) || {};
        return '| ' + id + ' | ' + cell(lab.plan && lab.plan.scene) + ' | ' + cell(lab.outline) + ' | ' + id + '-seen.md | memories/' + id + '/' + (lab.handBack && lab.handBack.clip) + ' |';
    });
    return [RECORD_INDEX_HEADING, '',
        'A Record memory is what a loop run built from a person\'s outline and published from its complete Record; it is outside the scene roster. Its Record (clips, stills, record.json, lab.json, parts, project/) and the roles\' answers (turns/) are served under site/memories/<id>/. Generated by scripts/gen-memories-build.mjs through recordIndexSection (scripts/gen-memories-seen.mjs).', '',
        '| id | scene | outline | seen | hand-back clip |', '|---|---|---|---|---|'].concat(rows.length ? rows : ['| (none yet) | | | | |']).join('\n') + '\n';
}

// ── the roles' turn files: provenance that resolves ────────────────────────────────────────────
/** How the loop names a local-brain thread in lab.json `threads`: `local <turn file>, <turn file>, …` (paths relative to
 *  the root the loop ran in; minimaxi/loop.mjs writes it). A platform thread is an interaction id and names no file. */
export const LOCAL_THREAD = 'local ';
/** The turn files one lab.json thread names, in order ([] for a platform thread). */
export function threadTurnFiles(thread) {
    const t = String(thread == null ? '' : thread);
    return t.startsWith(LOCAL_THREAD) ? t.slice(LOCAL_THREAD.length).split(', ').filter(Boolean) : [];
}
/** Where a published memory serves the roles' answers: site/memories/<id>/turns/. */
export const TURNS_DIR = 'turns/';
/** A role's answer to a turn sits beside the turn file: <n>-<role>.md → <n>-<role>.answer.md (minimaxi/loop.mjs writes it). */
export const ANSWER_SUFFIX = '.answer.md';
function answerOf(turn) { return turn.replace(/\.md$/, '') + ANSWER_SUFFIX; }
/** How the memory cites a role's words for one turn: the served answer once published; the run's own turn file in a draft. */
function turnRef(id, turn, draft) { return draft ? turn : 'memories/' + id + '/' + TURNS_DIR + path.basename(answerOf(turn)); }

/**
 * The roles' words to serve beside the Record: the answer to every turn its local threads name, as a tree
 * {turns/<n>-<role>.answer.md: text}. Only the answers are served. The turn files themselves are the loop's prompts: they
 * hold local frame paths and the persona's generated world frame, which are not the roles' words. THROWS by name when a
 * named turn's answer is missing. A run on the platform brain names no file: {}.
 */
export function turnFilesOf(run, root) {
    const named = ROLE_ORDER.map(function (r) { return threadTurnFiles(run.lab.threads && run.lab.threads[r]); }).reduce(function (a, b) { return a.concat(b); }, []).map(answerOf);
    if (!named.length) { return {}; }
    const missing = named.filter(function (f) { return !fs.existsSync(path.resolve(root, f)); });
    if (missing.length) { throw new Error('[gen-memories-seen] the Record\'s threads name turns whose answers are not there (' + missing.join(', ') + ', from ' + root + ') — a published memory serves the roles\' words its threads cite, so nothing was written.'); }
    const tree = {};
    named.forEach(function (f) {
        const key = TURNS_DIR + path.basename(f);
        if (key in tree) { throw new Error('[gen-memories-seen] two of the Record\'s threads name an answer called ' + path.basename(f) + ' — nothing was written.'); }
        tree[key] = fs.readFileSync(path.resolve(root, f), 'utf8');
    });
    return tree;
}

/**
 * THE local Owl's look at the hand-back clip, from the Record's own words: {by: 'local-owl', who: 'maxi-owl', stills, account},
 * the account being `answer memories/<id>/turns/<n>-owl.answer.md; contact: …; after: …; passes: …` (SEEN_ACCOUNT order,
 * quoted from lab.json). A draft (`opts.draft`) cites `turn file <the run's own turn path>` instead.
 * `opts.answeredBy` (a ROLE_TOKEN) names the agent that answered as the Owl. The loop and the CLI build the Owl's look
 * only here; renderSeenMemory refuses a local-owl look whose account is not this one.
 */
export function owlLook(run, stills, opts) {
    opts = opts || {};
    const lab = run.lab;
    if (lab.brain !== 'local') { throw new Error('[gen-memories-seen] owlLook: the Record is a ' + JSON.stringify(lab.brain) + '-brain run; only a local-brain run has a local Owl.'); }
    if (opts.answeredBy !== undefined && !ROLE_TOKEN.test(String(opts.answeredBy))) { throw new Error('[gen-memories-seen] owlLook: the agent that answered as the Owl is named by a role (lowercase kebab words, at least two), got ' + JSON.stringify(opts.answeredBy)); }
    return { by: 'local-owl', who: 'maxi-owl', stills: stills, account: (opts.answeredBy ? 'answered by the ' + opts.answeredBy + ' agent; ' : '') + owlAccount(run, opts.draft) };
}
const ANSWERED_BY = /^answered by the (\S+) agent; /;
/** Whether `account` is exactly owlLook's: the Record's own account, or that account after `answered by the <role> agent; `
 *  with <role> a ROLE_TOKEN. Nothing else, so no word typed before or after it passes. */
function isOwlAccount(account, run, draft) {
    const a = String(account), core = owlAccount(run, draft), m = a.match(ANSWERED_BY);
    return a === core || (!!m && ROLE_TOKEN.test(m[1]) && a === 'answered by the ' + m[1] + ' agent; ' + core);
}
function owlAccount(run, draft) {
    const turns = threadTurnFiles(quoted(run.lab, 'threads.owl'));
    if (!turns.length) { throw new Error('[gen-memories-seen] owlLook: lab.json threads.owl names no local turn file (' + JSON.stringify(run.lab.threads.owl) + ').'); }
    return (draft ? 'turn file ' : 'answer ') + turnRef(run.id, turns[turns.length - 1], draft) + '; ' + Object.keys(SEEN_ACCOUNT).map(function (k) { return k + ': ' + oneLine(quoted(run.lab, 'owl.seen.' + k)); }).join('; ');
}

/** What a draft says of itself, and what a published Record memory says instead (one of the two, never both). */
export const DRAFT_CLAUSE = 'DRAFT: not in the roster.';
export const PUBLISHED_CLAUSE = 'A Record memory, outside the scene roster (roster.json lists scenes); INDEX.md lists it under "Record memories".';

// ── the text ────────────────────────────────────────────────────────────────────────────────
function quoted(lab, key) {
    const v = key.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, lab);
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
        throw new Error('[gen-memories-seen] the hand-back Record\'s lab.json lacks `' + key + '` — a memory says only what the Record holds, so nothing was written.');
    }
    return v;
}

/** The memory's text, from a run (readRun) and the look(s) of whoever looked at its clips' stills: one look {by, who, stills,
 *  account[, clip]} or a list of them, one looked line each, in the order given. A look's `clip` (a clip of the Record's
 *  record.json `clips`) defaults to the hand-back clip; lookedLine refuses a missing look. */
export function renderSeenMemory(run, look, opts) {
    const draft = !!(opts && opts.draft);
    const lab = run.lab, id = run.id;
    const rec = run.record || {};   // a draft's Record may lack a §6 field; the INCOMPLETE line names it
    const record = { tickRange: Array.isArray(rec.tickRange) ? rec.tickRange : ['?', '?'], clips: Array.isArray(rec.clips) ? rec.clips : [], changes: Array.isArray(rec.changes) ? rec.changes : [] };
    const looks = Array.isArray(look) ? look : [look];
    if (!looks.length) { lookedLine(undefined, id); }
    const looked = looks.map(function (k) {
        if (k && k.by === 'local-owl' && lab.brain !== 'local') { throw new Error('[gen-memories-seen] a local-owl look on a ' + JSON.stringify(lab.brain) + '-brain Record: only a local-brain run has a local Owl — nothing was written.'); }
        if (k && k.by === 'local-owl' && !isOwlAccount(k.account, run, draft)) { throw new Error('[gen-memories-seen] a local-owl look whose account is not owlLook(run, stills)\'s: the local Owl\'s look is built only by owlLook from the Record\'s own words (the CLI: --owl-look <N>) — nothing was written.'); }
        const clip = (k && k.clip) || run.handBack.clip;
        if (record.clips.indexOf(clip) === -1) { throw new Error('[gen-memories-seen] a look at ' + JSON.stringify(clip) + ', which is not one of the Record\'s clips (' + record.clips.join(', ') + ') — nothing was written.'); }
        return lookedLine(k, id, clip);
    });
    LOOP_LAB_KEYS.forEach(function (k) { quoted(lab, k); });
    const owl = lab.owl, plan = lab.plan;
    if (owl.verdict !== 'approve') { throw new Error('[gen-memories-seen] only an approved round becomes a memory; the Owl said ' + JSON.stringify(owl.verdict) + '.'); }
    const media = 'memories/' + id + '/';
    const hbCite = clipCite(media + run.handBack.clip);   // the Builder's prediction and words and the Owl's words are all on the hand-back clip
    const filmed = Array.isArray(lab.filmed) ? lab.filmed : [];
    const clipWords = record.clips.map(function (c) {
        const f = filmed.find(function (x) { return x && x.clip === c; });
        return media + c + (f ? ' (' + f.hand + ', ticks ' + f.firstTick + '–' + f.lastTick + ')' : '');
    });
    const bys = Array.from(new Set(record.changes.map(function (c) { return c.by; })));
    const projectEntry = projectEntryOf(run.files);   // the Record owner's one reader of the entry
    const scene = sceneFacts(lab.scene || {});
    const sceneKeys = Object.keys(scene);
    const stated = sceneKeys.filter(function (k) { return scene[k] !== null && scene[k] !== undefined && scene[k] !== ''; });
    const absent = sceneKeys.filter(function (k) { return stated.indexOf(k) === -1; });
    const sceneWords = (stated.length ? stated.map(function (k) { return k + ' ' + oneLine(scene[k]); }).join(', ') : 'nothing stated') + (absent.length ? '; lab.json names no ' + absent.join(' and no ') : '');
    const head = [
        '# Memory: ' + oneLine(quoted(lab, 'outline')) + ' — seen',
        '',
        'RECORD, not Maxi\'s own sighting: ' + RECORD_HEADER + ' ' + media + ' (' + SHAPE_OWNER + '), Record ' +
            run.handBack.record + ' of run ' + lab.run + ' (chain ' + lab.chain.records.join(', ') + '), producer ' + lab.producer + ' on the ' + lab.brain + ' brain; ' +
            (bys.length ? 'its acts are by ' + bys.join(' and ') : 'no act in it changed a declared part') + '. Scene: ' + sceneWords + '; ticks ' +
            record.tickRange[0] + '–' + record.tickRange[1] + '. Clips, in the order filmed: ' + clipWords.join('; ') + '; the hand-back clip is ' + media + run.handBack.clip +
            ', and stills ' + STILLS.map(function (s) { return media + s; }).join(', ') + ' are its first, middle and last frames. ' +
            (projectEntry.entry ? 'The project at stop: ' + media + FILES.project + projectEntry.entry + '. ' : '') +
            'A fresh Maxi thread has not watched it yet. ' + (draft ? DRAFT_CLAUSE : PUBLISHED_CLAUSE)
    ];
    Array.prototype.push.apply(head, carriedLines(lab, media));   // what preceded the round, under its own heading
    if (!run.complete) {
        head.push('INCOMPLETE Record, so not published (only a complete Record is published into kb/GodsWorld/memories and site/memories; the paths above name where it would be served): ' + run.faults.map(oneLine).join(' · '));
    }
    const seen = Object.keys(SEEN_ACCOUNT).map(function (k) { return k + ' — ' + oneLine(quoted(lab, 'owl.seen.' + k)); }).join('; ');
    return head.concat(looked, roundsLines(lab), [
        '',
        'Changes (record.json, one row per act, in order) and the parts diff (parts.before.json → parts.after.json):'
    ], recordLines(run.files), teachingLines(lab), [
        '',
        'Outline (the person): ' + oneLine(lab.outline),
        '',
        'Plan (the Designer): start from scene `' + plan.scene + '`; changes ' + (plan.changes.length ? plan.changes.map(function (c) { return JSON.stringify(c); }).join('; ') : '(none)') +
            '; hands ' + plan.hands.join(', ') + '. Designer\'s prediction: ' + oneLine(plan.prediction),
        '',
        'Built (the Builder), hands in order: ' + lab.steps.map(function (s) { return s.hand; }).join(' → ') + '.',
        '',
        'Prediction stated before the hand-back clip ' + hbCite + ' was filmed (the Builder): ' + oneLine(lab.prediction),
        '',
        'Seen, the Builder\'s words on the hand-back clip ' + hbCite + ': ' + oneLine(lab.builderWords),
        '',
        'Seen, the Owl\'s words on the hand-back clip ' + hbCite + ': ' + oneLine(quoted(lab, 'owl.words')),
        '',
        'The Owl\'s account (from the pixels, before its verdict): ' + seen + '.',
        '',
        'Verdict (the Owl): approve — ' + owl.reasons.map(oneLine).join(' · '),
        '',
        'Threads: ' + ROLE_ORDER.map(function (r) {
            const t = quoted(lab, 'threads.' + r), files = threadTurnFiles(t);
            return r + ' ' + (files.length ? LOCAL_THREAD + files.map(function (f) { return turnRef(id, f, draft); }).join(', ') : t);
        }).join(' · ') + '.',
        ''
    ]).join('\n');
}

function inside(p, dir) { const r = path.relative(dir, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); }
/** A path as a reader names it: relative to the root when inside it, else absolute. */
function shown(p, root) { return inside(p, root) ? path.relative(root, p) : p; }

/**
 * Write the memory of a run's hand-back Record, given the look {by, who, stills, account[, clip]} of whoever looked at its
 * stills, or a list of such looks (renderSeenMemory).
 * `opts.draft` false (the default): PUBLISH — refused, every fault named, unless the Record is complete; copies the whole
 * hand-back folder to <root>/site/memories/<id>/ and writes <root>/kb/GodsWorld/memories/<id>-seen.md.
 * `opts.draft` true: writes the text only to <run>/memory/<id>-seen.md, never under <root>/kb or <root>/site.
 * Refuses to overwrite. Returns {id, complete, faults, memory, media} (draft: {id, complete, faults, draft}).
 */
export function writeSeenMemory(recordDir, look, opts) {
    opts = opts || {};
    const root = path.resolve(opts.root || REPO);
    const run = readRun(recordDir);
    if (!opts.draft && !run.complete) {
        throw new Error('[gen-memories-seen] the hand-back Record ' + shown(path.join(run.recordDir, run.handBack.record), root) + ' is not a complete Record (' + SHAPE_OWNER +
            '), so it is not published into kb/GodsWorld/memories or site/memories — nothing was written:\n- ' + run.faults.join('\n- ') +
            '\n(--draft writes the memory under ' + shown(path.join(run.runDir, 'memory'), root) + '/ only.)');
    }
    const text = renderSeenMemory(run, look, { draft: !!opts.draft });
    const kb = path.join(root, 'kb'), site = path.join(root, 'site');
    if (opts.draft) {
        const md = path.join(run.runDir, 'memory', run.id + '-seen.md');
        if (inside(md, kb) || inside(md, site)) { throw new Error('[gen-memories-seen] a draft is written only under the run\'s own folder, never into kb/ or site/ (it would land at ' + md + ') — nothing was written.'); }
        if (fs.existsSync(md)) { throw new Error('[gen-memories-seen] ' + md + ' already exists — a memory is never overwritten.'); }
        fs.mkdirSync(path.dirname(md), { recursive: true });
        fs.writeFileSync(md, text);
        return { id: run.id, complete: run.complete, faults: run.faults, draft: shown(md, root) };
    }
    const md = path.join(kb, 'GodsWorld', 'memories', run.id + '-seen.md');
    const dir = path.join(site, 'memories', run.id);
    if (fs.existsSync(md) || fs.existsSync(dir)) { throw new Error('[gen-memories-seen] ' + run.id + ' already exists (' + (fs.existsSync(md) ? md : dir) + ') — a memory is never overwritten.'); }
    const turns = turnFilesOf(run, root);
    const clash = Object.keys(run.files).filter(function (f) { return f.startsWith(TURNS_DIR); });
    if (clash.length) { throw new Error('[gen-memories-seen] the Record folder already holds ' + clash.join(', ') + ', where the run\'s turn files are served — nothing was written.'); }
    writeRecordFolder({ files: Object.assign({}, run.files, turns) }, dir);
    fs.writeFileSync(md, text);
    return { id: run.id, complete: true, faults: [], memory: path.relative(root, md), media: path.relative(root, dir) };
}

export const USAGE = 'usage: gen-memories-seen.mjs <minimaxi/out/<run>/record> --looked-by <kind>:<role> --stills <N> --account "<what the looker saw: contact, after, passes>" [--clip <clip>.mp4] [--looked-by … again for another look] [--owl-look <N> [--answered-by <role>]] [--draft] — writes one line `' + LOOKED_SHAPE +
    '` per look, in the order given; each --looked-by opens a look and its --stills, --account and --clip (default: the hand-back clip) follow it; --owl-look <N> is the local Owl\'s look on N stills, its account built from the Record by owlLook (a local-owl look is never typed); <role> names the looker by role (lowercase kebab words, at least two, e.g. lab-owner, godsworld-seat-author), never by a person\'s name; only a complete Record is published, and --draft writes under <run>/memory/ only';

const LOOK_ARGS = ['--stills', '--account', '--clip', '--answered-by'];
/** The CLI's arguments → {dir, looks, draft}. Throws (naming USAGE) on anything missing: no look, no memory. */
export function parseCliArgs(argv) {
    const looks = [];
    let dir = null, draft = false;
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--looked-by' || k === '--owl-look' || LOOK_ARGS.includes(k)) {
            if (argv[i + 1] === undefined) { throw new Error('[gen-memories-seen] ' + k + ' needs a value — ' + USAGE); }
            const v = argv[++i];
            if (k === '--looked-by') { looks.push({ 'looked-by': v }); continue; }
            if (k === '--owl-look') { looks.push({ owl: true, stills: v }); continue; }
            const cur = looks[looks.length - 1];
            if (!cur) { throw new Error('[gen-memories-seen] ' + k + ' before any --looked-by or --owl-look: each look opens with one — ' + USAGE); }
            if (cur.owl ? k !== '--answered-by' : k === '--answered-by') { throw new Error('[gen-memories-seen] ' + k + (cur.owl ? ' does not belong to an --owl-look (its account and clip are the Record\'s own; it takes only --answered-by)' : ' belongs only to an --owl-look') + ' — ' + USAGE); }
            if (k.slice(2) in cur) { throw new Error('[gen-memories-seen] ' + k + ' twice in one look (' + cur['looked-by'] + '); open another look with --looked-by — ' + USAGE); }
            cur[k.slice(2)] = v;
        } else if (k === '--draft') { draft = true; }
        else if (!k.startsWith('--') && dir === null) { dir = k; }
        else { throw new Error('[gen-memories-seen] unknown argument ' + k + ' — ' + USAGE); }
    }
    if (!dir) { throw new Error('[gen-memories-seen] no Record folder — ' + USAGE); }
    if (!looks.length) { throw new Error('[gen-memories-seen] --looked-by is required: a seen memory is written only after a human, the local Owl or the seat looked at its stills — nothing was written. ' + USAGE); }
    return {
        dir: dir, draft: draft, looks: looks.map(function (o) {
            if (o.owl) {
                const n = Number(o.stills);
                if (!Number.isInteger(n) || n < 1) { throw new Error('[gen-memories-seen] --owl-look takes how many stills the Owl looked at (a whole number ≥ 1), got ' + JSON.stringify(o.stills) + ' — ' + USAGE); }
                return o['answered-by'] === undefined ? { owl: true, stills: n } : { owl: true, stills: n, answeredBy: o['answered-by'] };
            }
            const at = o['looked-by'].indexOf(':');
            const look = { by: at === -1 ? o['looked-by'] : o['looked-by'].slice(0, at), who: at === -1 ? '' : o['looked-by'].slice(at + 1), stills: Number(o.stills), account: o.account };
            if (o.clip !== undefined) { look.clip = o.clip; }
            const bad = lookFaults(look);
            if (bad.length) { throw new Error('[gen-memories-seen] ' + bad.join('; ') + ' — nothing was written. ' + USAGE); }
            return look;
        })
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let a;
    try { a = parseCliArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
    try {
        const run = a.looks.some(function (k) { return k.owl; }) ? readRun(a.dir) : null;
        const looks = a.looks.map(function (k) { return k.owl ? owlLook(run, k.stills, { draft: a.draft, answeredBy: k.answeredBy }) : k; });
        console.log(JSON.stringify(writeSeenMemory(a.dir, looks, { draft: a.draft })));
    } catch (e) { console.error(e.message); process.exit(1); }
}
