# Memory: 4B · Laser Build-Up — build

load: GYM scene id `r4b-laser-buildup` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/laser-buildup.js
source sha256 bce09f932573722eef238d071ae22f3f2e60b65a6de45b4a0fe90ea236a615db · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-sdk/0.5.1/dist/scenes/laser-buildup.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: a gain source in a bore with an output coupler. The experiment the rung names: exitPhaseReset true (coherence on) — predict bands appearing in the fan at the mouth; wavelengthScale 32 (λ 512 px) makes the mouth nearly in phase on its own, so bands may appear even with phase reset off; tunnelLength 120 is a shorter bore (predict the fan starts nearer the source). exitRecenter false leaves the mouth an extended aperture instead of a point. The clip (memories/r4b-laser-buildup/clip.mp4) showed the bore (x≈48–288, y≈175–225) packed red by ≈400 ticks, a bright knot at the mouth x≈290, and a red scatter fanning over the right half with no visible banding (phase reset was off).

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 4B · Laser Build-Up
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung r4b-laser-buildup).
 */

// LASER BUILD-UP (D4, CEO 2026-07-29: "It will be the build up of a Laser") — the three
// components of a laser assembled one at a time on top of the earlier Light Lab rungs:
//   1. a GAIN SOURCE   — the hemisphere emitter (rung 3's omni source, restricted forward)
//   2. a RESONANT BORE — the directed corridor, which re-aims every wall hit forward
//   3. an OUTPUT COUPLER — the exit gate, optionally collapsing the mouth to a point and
//      optionally re-phase-locking what leaves it
// The two exit flags are INDEPENDENT and both live, which is what lets the rung separate
// "does the point source matter?" from "does coherence matter?".
//
// SINGLE AUTHORITY: the emitter + tunnel configs come from `setupTunnelPointExit.sceneSpec()`
// — the SAME pure function the standalone `tunnel-point-exit` page's factory consumes. The
// rung is the addObject form (so STUDIO can select and edit the objects); the page is the
// slider-driven form. They share the numbers rather than each hand-carrying a copy.

function buildExperiment(exp) {
  // Laser Build-Up — gain source + resonant bore + output coupler.
  // Geometry and per-leaf creation conditions come from the ONE scene-spec authority,
  // setupTunnelPointExit.sceneSpec(), so this rung and the standalone page cannot drift.
  // memo: The world's size, passed to the spec below so the bore is placed on the stage.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: A FAIL-LOUD guard: this sketch leans on a helper (setupTunnelPointExit.sceneSpec) that turns five numbers into the two bags below; if the helper is not loaded the scene refuses rather than building half of itself.
  if (typeof setupTunnelPointExit === 'undefined' || !setupTunnelPointExit.sceneSpec) {
    throw new Error('[laser-buildup] setupTunnelPointExit.js is not loaded (game-layer roster). (FAIL-LOUD.)');
  }
  // memo: The helper computes spec.emitter (a hemisphere-style gain source parked at the bore's left end) and spec.tunnel (the bore's two walls and its exit gate). Read the resulting rects from inventory; they are what addObject receives.
  var spec = setupTunnelPointExit.sceneSpec({
    // memo: The stage the helper centres the bore on.
    canvasW: W, canvasH: H,
    // memo: The bore is 240 px long: the clip showed its walls from x≈48 to 288 at y≈175 and ≈225 (about 40 px between them).
    tunnelLength: 240,        // REBUILD-class: corridor geometry, re-authored not dragged
    // memo: λ scale 16 → with the helper's wavelength the effective λ is 256 px, the self-interference regime (r4).
    wavelengthScale: 16,      // eff lambda 256px — the self-interference golden's own regime
    // memo: The output coupler COLLAPSES every leaving quantum onto the bore's mid-line: the mouth becomes a point source (the bright knot at x≈290). false = an extended mouth.
    exitRecenter: true,       // output coupler collapses the mouth to a point
    // memo: Coherence OFF: quanta leave with whatever phase they had. Turning this on re-locks the ensemble's oscillation at the mouth: that is the experiment.
    exitPhaseReset: false     // coherence OFF by default — turning it ON is the experiment
  });
  // 1. THE GAIN SOURCE — a hemisphere emitter just inside the input mouth, so the whole
  //    burst is aimed down the bore instead of half of it escaping backwards.
  // memo: THE WORLD: 600 x 400, 2D, derived from the emitter bag the helper made.
  exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(spec.emitter));   // THE WORLD: a 2D canvas + universe — first, then parts
  // memo: The gain source.
  exp.addObject('SphereEmitter', spec.emitter);
  // 2+3. THE BORE AND THE OUTPUT COUPLER — one directed Tunnel carrying the exit gate.
  //    mode 'directed': every wall hit re-emits forward within 180 degrees of the axis.
  //    exitRecenter / exitPhaseReset are the two coupler flags, both live in the Inspector.
  // memo: The bore: a Tunnel is two parallel walls plus an exit gate; its walls re-aim every hit forward instead of reflecting it.
  exp.addObject('Tunnel', spec.tunnel);
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```
