/* Copyright 2023-2025 by Essam Abadir */

/**
 * CollisionTypes — Canonical collision type enum for EGPT FRQTL VM.
 * Values are SCREAMING_SNAKE (the JS engine's native vocabulary).
 *
 * Canonical set — exactly what the JS reference engine's lo.collide() type switch has.
 * DO NOT add types not present in the JS reference collide() without first
 * adding them there and updating the conformance suite (§11.3).
 *
 * Wire-format translation (SNAKE→Pascal for WASM) is handled by the
 * wasm-engine provider. Objects emit raw SCREAMING_SNAKE; providers translate.
 */


    const CollisionTypes = {
        NONE: 'NONE',
        BOUNCE: 'BOUNCE',
        RANDOM_X: 'RANDOM_X',
        RANDOM_Y: 'RANDOM_Y',
        RANDOM_XY: 'RANDOM_XY',
        MOMENTUM_BASED: 'MOMENTUM_BASED',
        WALL: 'WALL'
        // BounceUp/Down/Left/Right were Rust-only divergences — deleted (§3.1).
        // Add new types to the JS reference collide() FIRST, then here + conformance.
    };

    // Export

export { CollisionTypes };
