/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot-phases.js — THE vocabulary of a FRQTL page boot, in order.
 *
 * The boot record (lib/frqtl/experiments/_shared/boot.js `createBootRecord`) is written in these
 * phases; a progress UI (lib/components/run-once-card, lib/features/ide/frame-boot-progress.js)
 * draws one segment per phase and captions it with `means`. Every phase is 0/1: it completes when
 * its promise settles (the boot imports modules — there is no script list to count).
 *
 *   modules       the parts barrel imported (every published kind registered)
 *   engine-ready  the WASM engine booted (compat/engine.js bootEngine)
 *   renderer      the vendor renderer loaded and its provider registered in the display slot
 *   sketch        the page's scene built
 *
 * Consumers:
 *   - lib/frqtl/experiments/_shared/boot.js — creates the record with BOOT_PHASE_IDS.
 *   - lib/features/ide/frame-boot-progress.js — the host-side watcher; hands BOOT_PHASES to the card.
 */

export const BOOT_PHASES = Object.freeze([
    { id: 'modules', means: 'Loading the scene objects' },
    { id: 'engine-ready', means: 'Starting the WASM engine' },
    { id: 'renderer', means: 'Loading the renderer' },
    { id: 'sketch', means: 'Building the scene' },
].map(Object.freeze));

/** The ids, in order — what the boot record is created with. */
export const BOOT_PHASE_IDS = Object.freeze(BOOT_PHASES.map((p) => p.id));

/** The event the boot record dispatches on the document (and its frame element). */
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
