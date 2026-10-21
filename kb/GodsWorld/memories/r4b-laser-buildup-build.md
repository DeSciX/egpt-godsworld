# Memory: 4B · Laser Build-Up — build

load: GYM scene id `r4b-laser-buildup` · 2D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/laser-buildup.js
source sha256 508d6fe7fc2756f0511caf8d7be7c7a75d2665e7892ceafe7540c1f692b1778f · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/laser-buildup.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: a gain source in a bore with an output coupler. The experiment the rung names: exitPhaseReset true (coherence on) — predict bands appearing in the fan at the mouth; wavelengthScale 32 (λ 512 px) makes the mouth nearly in phase on its own, so bands may appear even with phase reset off; tunnelLength 120 is a shorter bore (predict the fan starts nearer the source). exitRecenter false leaves the mouth an extended aperture instead of a point. The clip (memories/r4b-laser-buildup/clip.mp4) showed the bore (x≈48–288, y≈175–225) packed red by ≈400 ticks, a bright knot at the mouth x≈290, and a red scatter fanning over the right half with no visible banding (phase reset was off).

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 4B · Laser Build-Up
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`export const parts` + `exp.declare`, or `exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are imports. Registered by lib/shim/registry/walkthrough.js
 * (rung r4b-laser-buildup).
 */

// LASER BUILD-UP (D4) — the three
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

import { SphereEmitter, Tunnel } from '@descix/frqtl-web/parts';

// Laser Build-Up — gain source + resonant bore + output coupler.
// Geometry and per-leaf creation conditions come from the ONE scene-spec authority,
// Tunnel.pointExitSpec() (setupTunnelPointExit.sceneSpec), so this rung and the standalone page cannot drift.
  // memo: The world's size, passed to the spec below so the bore is placed on the stage.
const W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  // memo: Tunnel.pointExitSpec is a static on the Tunnel part (imported above): it turns the world size, two numbers and two flags into the part bags below. It refuses a key it does not declare, naming the nearest legal one ('tunelLength' → "did you mean 'tunnelLength'?") and listing every legal option, and it refuses a call without canvasW/canvasH ("There is no default world size."); both are the SDK's own messages.
  // memo: It returns { emitter, tunnel, geom }: SPEC.emitter is a SphereEmitter bag (preset 'hemisphere', centred just inside the bore's left mouth) and SPEC.tunnel a Tunnel bag (mode 'directed': the bore's two walls and its exit gate). Read the resulting rects from inventory; they are what the parts entries emitter and point_exit_tunnel carry to exp.declare.
const SPEC = Tunnel.pointExitSpec({
    // memo: The stage pointExitSpec centres the bore on.
  canvasW: W, canvasH: H,
    // memo: The bore is 240 px long: the clip showed its walls from x≈48 to 288 at y≈175 and ≈225 (about 40 px between them).
  tunnelLength: 240,        // REBUILD-class: corridor geometry, re-authored not dragged
    // memo: λ scale 16 → with pointExitSpec's wavelength the effective λ is 256 px, the self-interference regime (r4).
  wavelengthScale: 16,      // eff lambda 256px — the self-interference golden's own regime
    // memo: The output coupler COLLAPSES every leaving quantum onto the bore's mid-line: the mouth becomes a point source (the bright knot at x≈290). false = an extended mouth.
  exitRecenter: true,       // output coupler collapses the mouth to a point
    // memo: Coherence OFF: quanta leave with whatever phase they had. Turning this on re-locks the ensemble's oscillation at the mouth: that is the experiment.
  exitPhaseReset: false     // coherence OFF by default — turning it ON is the experiment
});
// The spec names its tunnel; in `parts` the key is the name.
const { name: _tunnelName, ...TUNNEL } = SPEC.tunnel;

export const parts = {
  // 1. THE GAIN SOURCE — a hemisphere emitter just inside the input mouth, so the whole
  //    burst is aimed down the bore instead of half of it escaping backwards.
  // memo: The gain source.
  emitter: [SphereEmitter, { ...SPEC.emitter }],
  // 2+3. THE BORE AND THE OUTPUT COUPLER — one directed Tunnel carrying the exit gate.
  //    mode 'directed': every wall hit re-emits forward within 180 degrees of the axis.
  //    exitRecenter / exitPhaseReset are the two coupler flags, both live in the Inspector.
  // memo: The bore: a Tunnel is two parallel walls plus an exit gate; its walls re-aim every hit forward instead of reflecting it.
  point_exit_tunnel: [Tunnel, { ...TUNNEL }],
};

export default function buildExperiment(exp) {
  // memo: THE WORLD: 600 x 400, 2D, derived from the emitter bag pointExitSpec made.
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.emitter[1]));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.declare(parts);
}
```
