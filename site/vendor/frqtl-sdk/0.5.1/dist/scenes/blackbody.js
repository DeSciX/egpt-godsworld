/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Blackbody
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world, the
 * oven, its thermostat and the radiation sink are all constructed here; the sugar objects
 * (OvenBox, LargeObject), the renderer and the engine are includes. Registered by
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

function buildExperiment(exp) {
  var W = 600, H = 400;        // THE WORLD this scene states (its co-init call below)

  var TEMPERATURE = 1500;      // target quanta inside the cavity (the knob below)
  var QUANTUM_DIM = 3;         // the layer leaves promote into: an 8 px box edge, 64 cells of capacity in 2D
  var BOX_FRACTION = 1 / 3;    // the cavity's outer box, as a fraction of the canvas
  var WALL = 10;               // wall thickness (px)
  var SLIT_HEIGHT = 60;        // the radiation slit in the right wall (px)
  var SINK_DEPTH = 30;         // the absorbing strip at the right canvas edge (px)

  // ── WORLD — a 2D canvas + universe, fundamental layer 0 (1x1 leaves), λ multiplier 1 ──
  exp.createCanvas(W, H, { dimension: 0, wavelengthScale: 1 });
  var u = exp.universe;
  u.brownianMotion = true;
  u.withInterQuantumCollisions = true;
  u.addDimension(QUANTUM_DIM);

  // ── THE OVEN — the cavity, centred on the canvas ────────────────────────
  var outer = new Rectangle(Math.round(W / 2), Math.round(H / 2),
                            Math.round(W * BOX_FRACTION), Math.round(H * BOX_FRACTION), null, true);
  // The thermostat runs FIRST each tick: reserve its slot before the oven registers its own.
  var thermostatSlot = u.experimentTickFunctions.length;
  u.experimentTickFunctions.push(null);
  var oven = exp.addObject('OvenBox', {
    name: 'oven',
    left: outer.left + WALL, top: outer.top + WALL,
    width: outer.w - 2 * WALL, height: outer.h - 2 * WALL,
    wallThickness: WALL, temperature: TEMPERATURE,
    slitHeight: SLIT_HEIGHT,          // the slit is in the RIGHT wall (OvenBox's own slit side)
    color: [120, 120, 120]
  });
  u.experimentTickFunctions[thermostatSlot] = oven.getTemperatureTickFunction();

  // ── THE SINK — the experiment boundary on the slit side ─────────────────
  exp.addObject('LargeObject', {
    name: 'radiation_sink',
    rect: { left: W - SINK_DEPTH, top: 0, w: SINK_DEPTH, h: H },
    collision_type: CollisionTypes.NONE, actions: [CollisionActions.ABSORB],
    reposition: 'closest', color: [0, 0, 0]
  });

  // ── THE KNOB — temperature, live (the oven's own thermostat target) ─────
  if (typeof document !== 'undefined' && window.ControlRegistry && window.FrqtlControlsPanel &&
      window.FrqtlControlOverlay) {
    var registry = window.ControlRegistry.makeControlRegistry();
    registry.registerControls('blackbody', [
      { kind: 'scalar', id: 'temperature', label: 'temperature (quanta)', min: 50, max: 8000, step: 50,
        value: TEMPERATURE, fmt: function (v) { return String(v); },
        onChange: function (v) { oven.setTemperature(v); },
        place: { x: 0.02, y: 0.03 } }
    ]);
    window.FrqtlControlsPanel.exposeRegistry(registry, { runner: exp.runner });
    // The overlay mounts through the runner's ONE door (runner.controlHost); before a canvas is mounted
    // (a notebook pane) there is none, so the knobs stay in the exposed registry only.
    if (exp.runner.controlHost) { window.FrqtlControlOverlay.mount(exp.runner, { registry: registry, name: 'blackbody' }); }
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
