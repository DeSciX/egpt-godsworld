/* Copyright 2023-2026 by Essam Abadir */

/**
 * The Empty Universe — STUDIO's and the GYM's blank world, package content (not a showcase scene).
 *
 * A sketch like every other: it states its world in its first (and only) statement and constructs
 * nothing; the palette authors into it. Read as a project by
 * lib/shim/registry/scene-source.js::emptyProjectOf, through the router (a lib-identity path).
 */

export const parts = {};

export default function buildExperiment(exp) {
  // THE WORLD: a 600x400 2D canvas + universe on the dim-2 fundamental, λ multiplier 8.
  exp.createCanvas(600, 400, { dimension: 2, wavelengthScale: 8 });
  exp.declare(parts);
}
