# Memory: Blackbody — build

load: GYM scene id `blackbody` · 2D · source site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/blackbody.js
source sha256 32583c3458f10a45960eaab62cbd953b55a79a18cff1a085150e1b69bc579dbd · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.1/dist/frqtl/scenes/blackbody.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: a hot box with a slit. Hotter: TEMPERATURE 4000 (the thermostat's target count of quanta inside) → predict more and bigger red blobs and a thicker spill; the knob on the canvas does the same live. A wider slit: SLIT_HEIGHT 120 → predict more escapes and a thinner inside. A bigger oven: BOX_FRACTION 1/2. A second slit: slitWall 'left' is one option the OvenBox takes; two slits would be two ovens or a hand-built cavity of four Walls (destroy on the outside faces). The clip (memories/blackbody/clip.mp4, 0.5.1, ticks 27–927) showed red blobs (merged frames) lining the inside walls first, then filling the box with yellow specks, heaviest along the floor by 927 ticks, and a wide fan of specks with the odd blob spraying right from the slit toward the sink. Two objects are declared: the oven cannot be moved (no position authority); the sink can: drag it in and the spill ends at its new edge, measured [clip memories/blackbody/clip-drag-sink.mp4].

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Blackbody
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world, the
 * oven, its thermostat and the radiation sink are all constructed here; the sugar objects
 * (OvenBox, LargeObject), the renderer and the engine are imports. Registered by
 * lib/shim/registry/walkthrough.js (rung blackbody).
 *
 * Physics (zero new — composition of goldened behaviours): a cavity of absorbing walls holds a
 * population of leaves; the OvenBox thermostat keeps the cavity's quanta near the TEMPERATURE
 * target by emitting, and colliding leaves merge into parent frames (bench H2a–c,
 * collide → merge → promote; `withInterQuantumCollisions`). A parent's fullness IS its frequency
 * (wavelength = capacity/mass, bench M4), so what leaks out of the slit in the right wall is a
 * spectrum of frame sizes — the emergent Planck-like curve — with no energy quanta assumed.
 * Everything that escapes is absorbed by the sink at the right edge (the experiment boundary).
 *
 * Order matters (it seeds the run): the world, the brownian/collision flags, the quantum
 * layer, the thermostat SLOT (reserved before the oven so the oven's own tick-fns run after it),
 * the oven, the thermostat, the sink. Same calls, same order, same seed ⇒ the same RNG stream.
 */

import { CollisionActions, CollisionTypes, FrqtlControlOverlay, FrqtlControlsPanel, LargeObject, Rectangle } from '@descix/frqtl-web/parts';
import * as ControlRegistry from '@descix/frqtl-web/shim/controls/registry.js';

  // memo: The world's size.
const W = 600, H = 400;        // THE WORLD this scene states (its co-init call below)
  // memo: The absorbing strip at the right canvas edge, px: the experiment boundary where everything that escapes ends.
const SINK_DEPTH = 30;         // the absorbing strip at the right canvas edge (px)

export const parts = {
  // ── THE SINK — the experiment boundary on the slit side ─────────────────
  // memo: radiation_sink, DECLARED by name: a black absorbing strip [570, 0, 30, 400] at the right edge; what escapes the slit ends here. Rect-placed (authority rect), so a hand can drag it: dragTo radiation_sink to [480, 200] over 300 ticks put it at [465, 0, 30, 400], and the spill then stopped near x 460 instead of reaching the right edge, measured [clip memories/blackbody/clip-drag-sink.mp4, ticks 1732–2182: the drag and 150 settle ticks].
  radiation_sink: [LargeObject, {
    rect: { left: W - SINK_DEPTH, top: 0, w: SINK_DEPTH, h: H },
    collision_type: CollisionTypes.NONE, actions: [CollisionActions.ABSORB],
    reposition: 'closest', color: [0, 0, 0]
  }],
};

export default function buildExperiment(exp) {
  // memo: The thermostat's TARGET: how many quanta the cavity is kept holding. Not degrees; a count. The oven emits whenever the count is below it.
  var TEMPERATURE = 1500;      // target quanta inside the cavity (the knob below)
  // memo: The layer leaves promote into when they merge: layer 3 = an 8 px frame of capacity 64 in 2D. The red blobs are these parents; their fullness (mass/64) is their colour, i.e. the spectrum that leaks. [src] [card]
  var QUANTUM_DIM = 3;         // the layer leaves promote into: an 8 px box edge, 64 cells of capacity in 2D
  // memo: The outer box is a third of the canvas each way: 200 x 133 px.
  var BOX_FRACTION = 1 / 3;    // the cavity's outer box, as a fraction of the canvas
  // memo: Wall thickness, px.
  var WALL = 10;               // wall thickness (px)
  // memo: The opening in the right wall, px, centred on the wall's height.
  var SLIT_HEIGHT = 60;        // the radiation slit in the right wall (px)

  // ── WORLD — a 2D canvas + universe, fundamental layer 0 (1x1 leaves), λ multiplier 1 ──
  // memo: THE WORLD: 600 x 400, 2D; fundamental layer 0 (1 x 1 leaves), λ multiplier 1. Written directly here instead of through an emitter bag because the oven, not an emitter, is the source.
  exp.createCanvas(W, H, { dimension: 0, wavelengthScale: 1 });
  var u = exp.universe;
  // memo: Leaves jostle at random each tick: the gas.
  u.brownianMotion = true;
  // memo: Leaves that meet MERGE into parent frames (collide → merge → promote): this is where the blobs come from, and the whole Planck-like story.
  u.withInterQuantumCollisions = true;
  // memo: Opens layer 3 so merged frames have somewhere to live.
  u.addDimension(QUANTUM_DIM);

  // ── THE OVEN — the cavity, centred on the canvas ────────────────────────
  // memo: The outer box, centred on the canvas (the trailing true = construct from centre): ≈[200, 133, 200, 133].
  var outer = new Rectangle(Math.round(W / 2), Math.round(H / 2),
                            Math.round(W * BOX_FRACTION), Math.round(H * BOX_FRACTION), null, true);
  // The thermostat runs FIRST each tick: reserve its slot before the oven registers its own.
  // memo: Reserve a tick-function slot BEFORE the oven registers its own, so the thermostat runs first each tick (order seeds the run).
  var thermostatSlot = u.experimentTickFunctions.length;
  u.experimentTickFunctions.push(null);
  // memo: The cavity, DECLARED by name ('oven', kind OvenBox): absorbing walls with a slit, and a thermostat. inventory lists it, but it has no position authority, so no hand moves it: dragTo / moveObject on 'oven' come back with the SDK's refusal ""oven" (OvenBox) has no position authority — neither a centre (getCenter/setCenter) nor a rect (rect + setRect) — so it cannot be moved as a unit." [src dist/frqtl/objects/FrqtlApp.js noPositionAuthorityMessage, the SDK's refusal text in the vendored package]
  var oven = exp.addObject('OvenBox', {
    name: 'oven',
    // memo: The cavity's inside starts one wall thickness in: ≈(210,143).
    left: outer.left + WALL, top: outer.top + WALL,
    // memo: Inside size ≈180 x 113 px.
    width: outer.w - 2 * WALL, height: outer.h - 2 * WALL,
    // memo: Walls 10 px; the target count 1500.
    wallThickness: WALL, temperature: TEMPERATURE,
    // memo: A 60 px slit in the RIGHT wall (the OvenBox's own default side; the sketch names no side); the spill goes +x toward the sink. [src]
    slitHeight: SLIT_HEIGHT,          // the slit is in the RIGHT wall (OvenBox's own slit side)
    // memo: Grey walls.
    color: [120, 120, 120]
  });
  // memo: Fill the reserved slot with the thermostat: each tick it tops the cavity up toward TEMPERATURE.
  u.experimentTickFunctions[thermostatSlot] = oven.getTemperatureTickFunction();

  exp.declare(parts);   // the sink (parts.radiation_sink)

  // ── THE KNOB — temperature, live (the oven's own thermostat target) ─────
  // memo: Page-only: a 'temperature' slider (50..8000, step 50) wired to oven.setTemperature, drawn on the canvas; nothing in node.
  var registry = ControlRegistry.makeControlRegistry();
  registry.registerControls('blackbody', [
    { kind: 'scalar', id: 'temperature', label: 'temperature (quanta)', min: 50, max: 8000, step: 50,
      value: TEMPERATURE, fmt: function (v) { return String(v); },
      onChange: function (v) { oven.setTemperature(v); },
      place: { x: 0.02, y: 0.03 } }
  ]);
  // Chrome (a page only): expose the knobs to a host frame, and mount the overlay through the
  // runner's ONE door (runner.controlHost) — before a canvas is mounted (a notebook pane) there is
  // none, so the knobs stay in the exposed registry only.
  FrqtlControlsPanel.exposeRegistry(registry, { runner: exp.runner });
  if (exp.runner.controlHost) { FrqtlControlOverlay.mount(exp.runner, { registry: registry, name: 'blackbody' }); }
}
```
