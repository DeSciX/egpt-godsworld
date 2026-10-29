/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot-entry.js — the `.` of @descix/frqtl-web, and the source of frqtl-web.min.js (its esbuild IIFE,
 * global `FRQTL`): the parts barrel, the two scene doors and the shared package core.
 *
 *   import { bootScene, bootProject, Wall, SphereEmitter, FrqtlVision } from '@descix/frqtl-web';
 *   <script src=".../dist/frqtl-web.min.js"></script>  →  FRQTL.bootScene(…), FRQTL.Wall, …
 *
 * compat/package-root.js is imported FIRST: in the min.js it is the module that reads the evaluating
 * <script>'s URL, so it must evaluate while that script runs.
 */

import './compat/package-root.js';

export * from './parts/index.js';
export * from './package-core.js';
export { bootScene, bootProject, bootRecipe } from './experiments/_shared/doors.js';
