/* Copyright 2023-2025 by Essam Abadir */

/**
 * CollisionActions — Canonical collision action enum for EGPT FRQTL VM.
 * Values are SCREAMING_SNAKE (the JS engine's native vocabulary).
 *
 * Canonical set — exactly what the JS reference engine's lo.collide() action dispatch has.
 * ACTIVE_ACTIONS = [ABSORB, COUNT, MARK, DETECT, LOG].
 * DO NOT add actions not present in the JS reference collide() without first
 * adding them there and updating the conformance suite (§11.3).
 *
 * Wire-format translation (SNAKE→Pascal for WASM) is handled by the
 * wasm-engine provider. Objects emit raw SCREAMING_SNAKE; providers translate.
 */


    const CollisionActions = {
        COUNT: 'COUNT',
        MARK: 'MARK',
        DETECT: 'DETECT',
        LOG: 'LOG',
        ABSORB: 'ABSORB',
        BOUNCE: 'BOUNCE',
        BLOCK: 'BLOCK',
        // RECOLOR deleted: I1 — the engine has no concept of color. Render color lives in
        // data.render.color (sugar stamps it; engine carries opaque; renderer reads it).
        // The feature returns later via the behavior model (P3 write-data-bubble primitive).
        // KILL/CONTAIN/CONTAIN_X/CONTAIN_Y/FORCE_RENDER were Rust-only divergences — deleted (§3.2).
        // Add new actions to the JS reference collide() FIRST, then here + conformance.
    };

    // Export

export { CollisionActions };
