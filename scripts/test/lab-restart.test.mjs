/* Copyright 2023-2026 by Essam Abadir */

// Run: node --test "scripts/**/*.test.mjs"

/**
 * lab-restart.test.mjs — the lab's restart waits for the runner's own restart() before anything touches the new world.
 *
 * @descix/frqtl-web's runner.restart() returns a Promise: a sketch built from linked text is re-linked, then rebuilt, then
 * started, and a failed replay REJECTS. maxi-lab.js restartUnguarded must await it: otherwise the Hand is attached and the
 * human's Record resumes filming on the world being torn down (a hand racing the restart), and a failed replay is a rejection nothing
 * awaits, which the lab never shows. The test runs the page's own restartUnguarded source (read from maxi-lab.js, never re-typed) over
 * stand-ins whose runner rebuilds a beat later; its negative control is the same source with the await planted away.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'app-assets', 'maxi-lab.js');
const LAB_SRC = fs.readFileSync(LAB, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** The source of a top-level async function of maxi-lab.js (to its first closing brace at column 0). */
function asyncFnSource(src, name) {
    const at = src.indexOf('\nasync function ' + name + '(');
    assert.ok(at !== -1, 'maxi-lab.js has no async function ' + name + '()');
    return src.slice(at + 1, src.indexOf('\n}\n', at) + 2);
}

/** restartUnguarded from `src`, bound to stand-ins: a runner whose restart() rebuilds after a beat (or rejects). */
function harness(src, opts) {
    const log = [];
    let rebuilt = false;
    const observed = { n: 0 };
    const runner = {
        restart() {
            log.push('restart called');
            // a thenable, so an un-awaited one is SEEN (observed stays false) instead of an unhandled rejection that ends the run
            const settled = new Promise((resolve, reject) => setTimeout(() => {
                if (opts && opts.fail) { reject(new Error('the replayed sketch threw')); return; }
                rebuilt = true; log.push('rebuilt'); resolve({});
            }, 20));
            settled.catch(() => {});
            return { then(onOk, onErr) { observed.n += 1; return settled.then(onOk, onErr); } };
        },
        firstTick() { log.push('firstTick'); return Promise.resolve({}); }   // a tick is there at once: only the await orders the rebuild first
    };
    const sc = { runner, win: { MaxiScene: {} } };
    const deps = {
        requireScene: () => sc, showError: () => {}, stopFilming: async () => { log.push('stopFilming'); }, state: { grab: 'held' },
        attachHand: () => log.push('attachHand' + (rebuilt ? '' : ' (OLD WORLD)')),
        resumeRecorder: () => log.push('resumeRecorder' + (rebuilt ? '' : ' (OLD WORLD)')),
        renderCode: () => {}, renderStatus: () => {}, summary: () => ({ ok: true })
    };
    const body = asyncFnSource(src, 'restartUnguarded');
    const fn = new AsyncFunction(...Object.keys(deps), body + '\nreturn restartUnguarded();');
    return { run: () => fn(...Object.values(deps)), log, observed };
}

/** What is wrong with a restart's order, or with how a failed replay surfaced. */
async function restartFaults(src) {
    const faults = [];
    const ok = harness(src);
    await ok.run();
    if (ok.log.some((l) => l.endsWith('(OLD WORLD)'))) { faults.push('the hand or the Record met the old world: ' + ok.log.join(' → ')); }
    const bad = harness(src, { fail: true });
    let rejected = null;
    try { await bad.run(); } catch (e) { rejected = e; }
    if (bad.observed.n === 0) { faults.push('nothing awaited the promise runner.restart() returned, so a failed replay is lost'); }
    if (!rejected || !/replayed sketch threw/.test(rejected.message)) { faults.push('a failed replay did not reject restartUnguarded (got ' + (rejected ? rejected.message : 'a resolve') + ')'); }
    if (bad.log.includes('attachHand') || bad.log.includes('attachHand (OLD WORLD)')) { faults.push('the hand was attached after a failed replay: ' + bad.log.join(' → ')); }
    return faults;
}

test('restartUnguarded awaits runner.restart(): the hand and the Record\'s filming meet the rebuilt world, a failed replay rejects (negative control: the await planted away is red)', async () => {
    assert.deepEqual(await restartFaults(LAB_SRC), []);
    const planted = LAB_SRC.replace('await sc.runner.restart();', 'sc.runner.restart();');
    assert.notEqual(planted, LAB_SRC, 'the plant did not apply: maxi-lab.js no longer awaits sc.runner.restart() in that form');
    const faults = await restartFaults(planted);
    assert.ok(faults.some((f) => /old world/.test(f)), 'the planted lab raced the restart, but the gate did not see it: ' + JSON.stringify(faults));
    assert.ok(faults.some((f) => /did not reject|nothing awaited/.test(f)), 'the planted lab lost a failed replay, but the gate did not see it: ' + JSON.stringify(faults));
});
