/* Copyright 2023-2026 by Essam Abadir */

/**
 * kinds-entry.js — the published door to the kind registry: `@descix/frqtl-web/kinds` and
 * `@descix/frqtl-node/kinds`. Exactly the four names below, re-exported from THE registry (kinds.js — the
 * same module instance every part registers in); the rest of kinds.js stays internal.
 *
 *   KINDS_EXPORTS   the published names (the parity gate holds both packages' ./kinds to this table)
 */

/** The names `./kinds` publishes. */
export const KINDS_EXPORTS = Object.freeze(['registerKind', 'kindNamed', 'kindOf', 'registeredKinds']);

export { registerKind, kindNamed, kindOf, registeredKinds } from './kinds.js';
