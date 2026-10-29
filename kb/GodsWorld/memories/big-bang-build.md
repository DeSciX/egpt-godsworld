# Memory: Big Bang — build

load: GYM scene id `big-bang` · 2D · source site/scenes/e0807d81/big-bang.js
source sha256 1004fe4dc4b815f5ac50408b1b38f4aa41e0e4bf6ea87ccb7ddc6f78f1e0e958 · every code line below is byte-identical to the scene source; lines beginning `// memo:` are added notes — strip them to diff against site/scenes/e0807d81/big-bang.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: one burst, then structure on its own. The sketch has no stop of its own; the SDK caps live leaf quanta at 300,000 by default (dist/sdk.html, universe options, liveQuantaCap): past it new leaves are skipped and the console warns once, and the run goes on. The run does not stop: the clip runs from tick 12 to 542 with no stop [clip memories/big-bang/clip.mp4]. When this run reaches the cap is not in a published clip. Variations: a smaller burst, SOURCE_DIAMETER 32 → predict fewer quanta a tick and the cap reached later; coarser rays, ANGLE_STEP 15 (24 rays) → predict visible spokes early and the cap reached later [predict]. The parent-generation interval (iframeIntervalSeconds) is what builds structure top-down; this sketch sets 1/60, so parents are generated every tick (at the default 1 s it would be every 60 ticks) [src]. The clip (memories/big-bang/clip.mp4, 0.5.1, ticks 12–542) showed a small red ball at the centre, a red cloud of overlapping translucent discs filling most of the frame by mid-clip, and by 542 the field reaching the frame edges, a dense mass left of centre, a bright core, separate large discs and dark gaps between them; the card promises filaments and voids, and this clip does not show clear filaments by tick 542.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Big Bang
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world and the
 * point source are built here; the sugar (PointSource — deprecated V1 sugar, byte-identical), the
 * renderer and the engine are imports. Registered by lib/shim/registry/walkthrough.js (rung big-bang).
 *
 * Physics (zero new — bench M1, H1, H2a-c): one radial burst at the canvas centre — 72 rays (5°) at
 * radii 32 → 2 — of leaves with NO initial momentum (emergentPhysics). The world generates parent
 * frames top-down (by how many frames an area can parent, brownian on), so a uniform field clumps into
 * filaments and voids with no gravity law and no cosmological constant. The source shuts off after
 * 20 s of ticks (1200).
 *
 * Order (it seeds the run): world (with its parent-generation interval) → source → the shut-off tick-fn.
 */

import { PointSource } from '@descix/frqtl-web/parts';

export const parts = {};

export default function buildExperiment(exp) {
  // memo: A square 600 x 600 world (most rungs are 600 x 400).
  var W = 600, H = 600;          // THE WORLD this scene states (its co-init call below)

  // memo: The burst is laid down at radii 32 → 2 px around the centre, step 2.
  var SOURCE_DIAMETER = 64;     // emission radii 32 → 2 (step 2)
  // memo: Degrees between rays: 72 rays round the circle.
  var ANGLE_STEP = 5;           // degrees between rays → 72 rays
  // memo: The source fires for 1200 ticks (20 s at 60 ticks/s), then the field evolves alone. [src] The run does not stop itself: no tick function here stops the runner [src], and the clip runs on to tick 542 [clip memories/big-bang/clip.mp4].
  var EMIT_TICKS = 20 * 60;     // the source fires for 1200 ticks

  // ── WORLD — a 2D canvas + universe: fundamental layer 0, λ multiplier 1, parents top-down ──
  // iframeIntervalSeconds 1/60: parents are generated EVERY tick (the engine freezes the interval at
  // init, so it rides the world cfg — at the default 1 s, Phase B ran every 60 ticks).
  // memo: THE WORLD: 600 x 600, 2D; layer 0 leaves; frames: true = the world GENERATES parent frames top-down (by how many an area can parent); iframeIntervalSeconds 1/60 = it does so EVERY tick. This is the only scene whose clumping comes from the world config rather than from a part.
  // memo: The world names no liveQuantaCap, so the SDK's default preview cap of 300,000 live leaf quanta applies (dist/sdk.html, universe options: "once this many are alive, makeLeafFrame returns null (the leaf is skipped) and the console warns once. false = uncapped; above the default throws") [sdk.html universe options]. The warning it prints: "[EGPTUniverse] liveQuantaCap: 300,000 leaf quanta are alive — further leaf frames are skipped until the count falls below it. This version of the engine is a limited preview release capped at 300,000 live quanta." [src dist/frqtl/compat/providers/wasm-engine.js console.warn, the vendored package]
  exp.createCanvas(W, H, { dimension: 0, wavelengthScale: 1, frames: true, iframeIntervalSeconds: 1 / 60 });
  exp.declare(parts);
  var u = exp.universe;

  // ── THE SOURCE — at the centre, no initial momentum, random charge ──────
  // memo: The source at the centre (300,300): a V1 sugar object (positional arguments: x, y, diameter, …); emergentPhysics true = the leaves start with NO momentum, minRadius 2 = the innermost ring. [src]
  var source = new PointSource(u, Math.floor(W / 2), Math.floor(H / 2), SOURCE_DIAMETER,
                               0, null, true, Infinity, 0, ANGLE_STEP,
                               { emergentPhysics: true, minRadius: 2 });

  // ── SHUT-OFF — the bang is one burst era, then the field evolves on its own ──
  var t = 0;
  // memo: The shut-off: a tick function (exp.addTickFunction) counting ticks and switching the source off at EMIT_TICKS. The pattern for any timed change in a scene.
  exp.addTickFunction(function () {
    t++;
    if (t >= EMIT_TICKS) { source.setActive(false); }
    return [];
  });
}
```
