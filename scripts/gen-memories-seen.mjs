#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * gen-memories-seen.mjs — the ONE writer of a seen-memory DRAFT made by a MiniMaxi loop.
 *
 *   node scripts/gen-memories-seen.mjs <record.json> --looked-by <kind>:<role> --stills <N> --account "<words>"   (USAGE spells it out)
 *   (minimaxi/loop.mjs imports writeSeenDraft and calls it on a LOCAL Owl's approve, with that Owl's look)
 *
 * A draft is a new memory: kb/GodsWorld/memories/<id>-seen.md in the -seen format the memory gate
 * reads (scripts/test/memories.test.mjs: it says who recorded it — "RECORD, not Maxi's own sighting" —
 * and cites a clip that exists under site/), plus the clip and three stills copied to
 * site/memories/<id>/. Every sentence in it is quoted from the loop's own record (the outline, the
 * Designer's plan, the Builder's prediction and words on the clip, the Owl's words and verdict); nothing
 * is written that a role did not say. It is a DRAFT: it is not in roster.json, so INDEX.md (generated
 * from the roster) does not list it until the scene it records joins the roster.
 *
 * THE LOOK: a seen memory is never written unless a human, the local Owl or the seat's own local agent LOOKED
 * at its stills; the platform brain's word alone writes nothing. The look is one line per clip looked at, owned
 * here (lookedLine writes it, parseLooked reads it, lookedFaults is the gate scripts/test/memories.test.mjs
 * runs on every seen file); LOOKED_SHAPE spells the line out from LOOKERS. The looker is named by a ROLE
 * (ROLE_TOKEN: lab-owner, godsworld-seat-author, maxi-owl), never by a person's name.
 * The CLI needs the look; the loop (minimaxi/loop.mjs) passes it only from a local-brain Owl.
 *
 * The record (minimaxi/loop.mjs builds it):
 *   {id, date, brain, outline, plan:{scene, changes, hands, prediction}, designerWords, steps:[{hand, args}],
 *    clip:{path, frames:[png…], label, seconds}, prediction, builderWords, owl:{seen:{contact, after, passes}, verdict, reasons, words},
 *    threads:{designer, builder, owl}}
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEMORY_ID = /^mm-[a-z0-9-]+$/;
export const STILLS = Object.freeze(['early.png', 'mid.png', 'settled.png']);

/** THE id of a loop memory: mm-<scene>-<run without its mm prefix>, lowercase words. The loop calls this; nothing else builds one. */
export function memoryId(scene, run) {
    const id = 'mm-' + String(scene).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + String(run).replace(/^mm/, '');
    if (!MEMORY_ID.test(id)) { throw new Error('[gen-memories-seen] scene ' + JSON.stringify(scene) + ' and run ' + JSON.stringify(run) + ' make no memory id (got ' + id + ').'); }
    return id;
}

function need(rec, key) {
    const v = key.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, rec);
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
        throw new Error('[gen-memories-seen] the record lacks `' + key + '` — a draft says only what the loop recorded, so nothing was written.');
    }
    return v;
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

/** The three stills of a clip: its first, middle and last frame. */
export function stillsOf(frames) {
    if (!Array.isArray(frames) || frames.length < 3) { throw new Error('[gen-memories-seen] a draft needs at least 3 frames of its clip, got ' + JSON.stringify(frames && frames.length)); }
    return [frames[0], frames[Math.floor(frames.length / 2)], frames[frames.length - 1]];
}

function oneLine(s) { return String(s).replace(/\s+/g, ' ').trim(); }

/** The draft's text, from the record and the look of whoever looked at its stills (lookedLine refuses a missing one). */
export function renderSeenDraft(rec, look) {
    const id = need(rec, 'id');
    if (look && look.by === 'local-owl' && rec.brain !== 'local') { throw new Error('[gen-memories-seen] a local-owl look on a ' + JSON.stringify(rec.brain) + '-brain record: only a local-brain run has a local Owl — nothing was written.'); }
    const looked = lookedLine(look, id, 'clip.mp4');
    if (!MEMORY_ID.test(id)) { throw new Error('[gen-memories-seen] a loop memory id is mm-<lowercase-words>, got ' + JSON.stringify(id)); }
    const plan = need(rec, 'plan');
    const owl = need(rec, 'owl');
    if (owl.verdict !== 'approve') { throw new Error('[gen-memories-seen] only an approved clip becomes a memory; the Owl said ' + JSON.stringify(owl.verdict) + '.'); }
    const media = 'memories/' + id + '/';
    const changes = (plan.changes || []).map(function (c) { return c.object + '.' + c.param + ' = ' + JSON.stringify(c.value) + (c.why ? ' (' + oneLine(c.why) + ')' : ''); });
    return [
        '# Memory: ' + oneLine(need(rec, 'outline')) + ' — seen',
        '',
        'RECORD, not Maxi\'s own sighting: written ' + need(rec, 'date') + ' by the MiniMaxi loop (' + need(rec, 'brain') + ' brain) from the clip ' +
            media + 'clip.mp4 (' + oneLine(need(rec, 'clip.label')) + ', ' + need(rec, 'clip.seconds') + ' s), watched by the Builder on its own thread and judged by the Owl on its own; ' +
            'stills ' + STILLS.map(function (s) { return media + s; }).join(', ') + ' are its first, middle and last frames. A fresh Maxi thread has not watched it yet. DRAFT: not in the roster.',
        looked,
        '',
        'Outline (the person): ' + oneLine(rec.outline),
        '',
        'Plan (the Designer): start from scene `' + plan.scene + '`; ' + (changes.length ? 'change ' + changes.join('; ') : 'no parameter changed') +
            '; hands ' + plan.hands.join(', ') + '. Designer\'s prediction: ' + oneLine(plan.prediction),
        '',
        'Built (the Builder), hands in order: ' + need(rec, 'steps').map(function (s) { return s.hand; }).join(' → ') + '.',
        '',
        'Prediction stated before the clip was filmed (the Builder): ' + oneLine(need(rec, 'prediction')),
        '',
        'Seen, the Builder\'s words on the clip: ' + oneLine(need(rec, 'builderWords')),
        '',
        'Seen, the Owl\'s words: ' + oneLine(need(rec, 'owl.words')),
        '',
        'The Owl\'s account (from the pixels, before its verdict): contact — ' + oneLine(need(rec, 'owl.seen.contact')) +
            '; after — ' + oneLine(need(rec, 'owl.seen.after')) + '; passes — ' + oneLine(need(rec, 'owl.seen.passes')) + '.',
        '',
        'Verdict (the Owl): approve — ' + owl.reasons.map(oneLine).join(' · '),
        '',
        'Threads: designer ' + need(rec, 'threads.designer') + ' · builder ' + need(rec, 'threads.builder') + ' · owl ' + need(rec, 'threads.owl') + '.',
        ''
    ].join('\n');
}

/** Write the draft and its media, given the look {by, who, stills, account} of whoever looked at its stills.
 *  Refuses without a look that may vouch, and refuses to overwrite an existing memory. Returns the paths written. */
export function writeSeenDraft(rec, look, root) {
    root = root || REPO;
    const text = renderSeenDraft(rec, look);
    const md = path.join(root, 'kb', 'GodsWorld', 'memories', rec.id + '-seen.md');
    const dir = path.join(root, 'site', 'memories', rec.id);
    if (fs.existsSync(md) || fs.existsSync(dir)) { throw new Error('[gen-memories-seen] ' + rec.id + ' already exists (' + (fs.existsSync(md) ? md : dir) + ') — a memory is never overwritten.'); }
    if (!fs.existsSync(rec.clip.path)) { throw new Error('[gen-memories-seen] the clip ' + rec.clip.path + ' does not exist.'); }
    const stills = stillsOf(rec.clip.frames);
    stills.forEach(function (p) { if (!fs.existsSync(p)) { throw new Error('[gen-memories-seen] the frame ' + p + ' does not exist.'); } });
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(rec.clip.path, path.join(dir, 'clip.mp4'));
    stills.forEach(function (p, i) { fs.copyFileSync(p, path.join(dir, STILLS[i])); });
    fs.writeFileSync(md, text);
    return { memory: path.relative(root, md), media: path.relative(root, dir), stills: STILLS.slice() };
}

export const USAGE = 'usage: gen-memories-seen.mjs <record.json> --looked-by <kind>:<role> --stills <N> --account "<what the looker saw: contact, after, passes>" — writes the line `' + LOOKED_SHAPE +
    '`; <role> names the looker by role (lowercase kebab words, at least two, e.g. lab-owner, godsworld-seat-author), never by a person\'s name';

/** The CLI's arguments → {file, look}. Throws (naming USAGE) on anything missing: no look, no memory. */
export function parseCliArgs(argv) {
    const o = {};
    let file = null;
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--looked-by' || k === '--stills' || k === '--account') {
            if (argv[i + 1] === undefined) { throw new Error('[gen-memories-seen] ' + k + ' needs a value — ' + USAGE); }
            o[k.slice(2)] = argv[++i];
        } else if (!k.startsWith('--') && file === null) { file = k; }
        else { throw new Error('[gen-memories-seen] unknown argument ' + k + ' — ' + USAGE); }
    }
    if (!file) { throw new Error('[gen-memories-seen] no record.json — ' + USAGE); }
    if (!o['looked-by']) { throw new Error('[gen-memories-seen] --looked-by is required: a seen memory is written only after a human, the local Owl or the seat looked at its stills — nothing was written. ' + USAGE); }
    const at = o['looked-by'].indexOf(':');
    const look = { by: at === -1 ? o['looked-by'] : o['looked-by'].slice(0, at), who: at === -1 ? '' : o['looked-by'].slice(at + 1), stills: Number(o.stills), account: o.account };
    const bad = lookFaults(look);
    if (bad.length) { throw new Error('[gen-memories-seen] ' + bad.join('; ') + ' — nothing was written. ' + USAGE); }
    return { file: file, look: look };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let a;
    try { a = parseCliArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
    console.log(JSON.stringify(writeSeenDraft(JSON.parse(fs.readFileSync(a.file, 'utf8')), a.look)));
}
