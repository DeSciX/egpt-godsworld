/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Empty Universe
 *
 * STUDIO's blank world, a scene like every other: it states its world in its first (and only)
 * statement and constructs nothing — the palette authors into it. Named by
 * lib/shim/registry/scene-source.js::EMPTY_SCENE (not a walk-through rung).
 */

function buildExperiment(exp) {
  // THE WORLD: a 600x400 2D canvas + universe on the dim-2 fundamental, λ multiplier 8.
  exp.createCanvas(600, 400, { dimension: 2, wavelengthScale: 8 });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
