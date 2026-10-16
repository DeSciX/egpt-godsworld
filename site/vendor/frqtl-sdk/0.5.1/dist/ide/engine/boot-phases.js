/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot-phases.js — THE vocabulary of a FRQTL page boot, in order.
 *
 * The boot record (lib/shim/engine/script-sequencer.js::createBootRecord) is written in these
 * phases; a progress UI (lib/components/run-once-card, lib/features/ide/frame-boot-progress.js)
 * draws one segment per phase and captions it with `means`.
 *
 *   kind 'list'    — fills from real counts: one step per loaded script of the phase's list
 *   kind 'promise' — 0/1: completes when the named promise settles
 *
 * Consumers:
 *   - lib/frqtl/experiments/_shared/stack-boot.js — a classic injected script, so it carries a
 *     LITERAL copy of the ids; lib/shim/engine/test/boot-phases.test.mjs holds the two equal.
 *   - sdk/frqtl-sdk/src/esm/index.js — imports BOOT_PHASE_IDS.
 *   - lib/features/ide/frame-boot-progress.js — the host-side watcher; hands BOOT_PHASES to the card.
 */

export const BOOT_PHASES = Object.freeze([
    { id: 'engine-scripts', kind: 'list',
      means: 'Loading the engine scripts' },
    { id: 'engine-ready', kind: 'promise',
      means: 'Starting the WASM engine' },
    { id: 'renderer', kind: 'list',
      means: 'Loading the renderer' },
    { id: 'game', kind: 'list',
      means: 'Loading the scene objects' },
    { id: 'page', kind: 'list',
      means: 'Loading the scene\'s own scripts' },
    { id: 'sketch', kind: 'promise',
      means: 'Building the scene' },
].map(Object.freeze));

/** The ids, in order — what the boot record is created with. */
export const BOOT_PHASE_IDS = Object.freeze(BOOT_PHASES.map((p) => p.id));

/** The event the boot record dispatches (the record's own constant, restated as the contract name). */
export const BOOT_PHASE_EVENT = 'frqtl:boot-phase';

/**
 * The phase row for `id`, or a thrown error naming every legal id.
 * @param {string} id
 */
export function bootPhase(id) {
    const row = BOOT_PHASES.find((p) => p.id === id);
    if (!row) {
        throw new Error(`boot-phases: "${id}" is not a boot phase — ${BOOT_PHASE_IDS.join(', ')}.`);
    }
    return row;
}
