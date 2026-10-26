# Memory: Circuit SAT — build

load: GYM scene id `circuit-sat` · 2D · source site/vendor/frqtl-web/0.6.1-p3.2/dist/frqtl/scenes/circuit-sat.js
source sha256 058e00664b8506b2515a27d9f39ae70c8166400a0a895a6b9b21becda2fd7306 · every code line below is byte-identical to the registry source; lines beginning `// memo:` are added notes — strip them to diff against site/vendor/frqtl-web/0.6.1-p3.2/dist/frqtl/scenes/circuit-sat.js
how: load the id, read this sketch, rebuild it by calling buildExperiment(exp); the world is the one createCanvas/createScene call (the first statement, the one place the size is written), parts are the `export const parts` entries (name: [Part, {…}]) that exp.declare(parts) adds, or exp.addObject(kind, {name, …}) or constructors, behaviour is tick functions pushed.

How to extrapolate: a half-adder that settles. Inputs: STATE { a: true, b: false } is the starting word; flip b to true and SUM should empty while CARRY fills (A and B); both false → both dark. RAIL 12 = twice the quanta per tick on every rail (predict brighter beads, same answer). A full adder would be two of these plus an OR; a NOT or OR gate is LogicGate with logic 'NOT' / 'OR' if the sugar declares it (read the sketch, do not assume). The clip (memories/circuit-sat/clip.mp4, 0.5.1, ticks 34–834) showed cream beads in both A rails from the first frame with SUM's orange beads stopped at its valve, then by mid-clip an orange stream the whole length of SUM_out, unchanged to 834; CARRY_out dark, the B rails empty. The four input emitters are declared and can be dragged (pull inputA0 out of its rail and SUM_out goes dark, measured [clip memories/circuit-sat/clip-drag-inputa0.mp4]); the gates are declared but cannot be moved, and the traces are not declared.

```js
/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Circuit SAT (a half-adder)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world, the two
 * logic gates, the four rail traces with their input emitters, the two grounded readouts, the live
 * input knobs and the framing are all here; the sugar (LogicGate, Trace, SphereEmitter), the
 * renderer and the engine are imports. Registered by lib/shim/registry/walkthrough.js (rung
 * circuit-sat).
 *
 * Physics (zero new — bench LO1/LO6/LO7 + the Trace wiring): input A and input B are laser
 * emitters that drive quanta down rail traces into an XOR gate (SUM) and an AND gate (CARRY). A
 * gate's valve opens only when its two input ammeters read the logic it embodies, so the circuit
 * SETTLES onto the half-adder's answer: SUM = A xor B, CARRY = A and B, read as the current on each
 * grounded readout. No search algorithm runs.
 *
 * Order (it seeds the run): world → SUM gate → CARRY gate → per lane plan row,
 * the rail trace then its emitter (switched to its input) → the two readouts.
 */

import { FrqtlControlOverlay, FrqtlControlsPanel, LogicGate, SphereEmitter, Trace } from '@descix/frqtl-web/parts';
import * as ControlRegistry from '@descix/frqtl-web/shim/controls/registry.js';

// Code-declared on purpose: the emitter centres and rail traces derive from the gates' port geometry and RAIL (a knob rewrites it), and a Trace has no kind — a literal block would restate derived geometry by hand.
export const parts = {};

export default function buildExperiment(exp) {
  // memo: A 760 x 520 world; the camera (below) frames only the 72 x 54 px circuit, so everything looks large.
  var W = 760, H = 520;              // THE WORLD this scene states (its co-init call below)
  // memo: The circuit's top-left corner in world pixels.
  var LEFT = 60, TOP = 15;           // the circuit's top-left
  // memo: Rail voltage: quanta per tick each input emitter fires. The gates' supplyVoltage is set to the same number so their ammeters read in the same units.
  var RAIL = 6;                      // rail voltage: quanta per tick per input emitter
  // memo: Input rail length 24 px before each gate port; readout trace length 24 px after each outlet.
  var LEAD = 24, READOUT = 24;       // input-rail and readout trace lengths
  // memo: Each input emitter is parked 4 px inside its rail's mouth, so every quantum it fires is already in the bore.
  var INSET = 4;                     // each input emitter sits this far inside its rail's bore mouth
  // memo: The input word at start: A HIGH, B LOW → SUM = 1, CARRY = 0. The toggles on the canvas change it live.
  var STATE = { a: true, b: false };   // input A HIGH at start: SUM reads 1, CARRY reads 0

  // The input emitter: a narrow 2D laser on the fundamental layer, random ± charge.
  // memo: One recipe for every input emitter: a narrow 2D laser, 24 px wide, firing +x, on layer 0, RAIL quanta a tick, ± charges.
  function emitterBag(center) {
    var bag = { preset: 'laser', is2D: true, R: 24, orientationDeg: 0, emissionBoxSide: 0,
                fundamentalDimension: 0, burstSize: RAIL, emitEveryTicks: 1, chargeMode: 'random' };
    if (center) { bag.center = center; }
    return bag;
  }

  // ── WORLD — a 2D canvas + universe; the emitter's own world (its worldCfg) ──
  // memo: THE WORLD: 760 x 520, 2D, config derived from the emitter recipe.
  exp.createCanvas(W, H, SphereEmitter.worldCfg(emitterBag(null)));
  exp.declare(parts);
  var u = exp.universe;

  // memo: The smallest gate geometry the sugar declares: bore 3 px, wall 3 px, length 20 px.
  var MIN = LogicGate.MINIMAL;                                  // bore 3 / wall 3 / length 20
  // memo: The gate's footprint (w, h) for that geometry; CARRY is placed one cell below SUM.
  var cell = LogicGate.cellSize(MIN.bore, MIN.wallThickness, MIN.length);
  // memo: Shared gate options.
  var gateOpts = { bore: MIN.bore, wallThickness: MIN.wallThickness, length: MIN.length, supplyVoltage: RAIL };

  // ── THE GATES — SUM (XOR) above CARRY (AND) ─────────────────────────────
  // memo: The SUM gate, DECLARED by name ('SUM', kind LogicGate): XOR at (60,15), gold. Its valve opens only when exactly one input ammeter reads current. It has no position authority, so no hand moves it: dragTo 'SUM' comes back with the SDK's refusal ""SUM" (LogicGate) has no position authority — neither a centre (getCenter/setCenter) nor a rect (rect + setRect) — so it cannot be moved as a unit." [src dist/frqtl/objects/FrqtlApp.js noPositionAuthorityMessage, the SDK's refusal text in the vendored package]
  var sum = exp.addObject('LogicGate', Object.assign({ logic: 'XOR', left: LEFT, top: TOP, name: 'SUM', color: [200, 170, 70] }, gateOpts));
  // memo: The CARRY gate, DECLARED by name ('CARRY', kind LogicGate): AND, one cell below SUM, green. Opens only when both inputs read current. Like SUM it cannot be moved (the same refusal, naming CARRY) [src dist/frqtl/objects/FrqtlApp.js noPositionAuthorityMessage, the SDK's refusal text in the vendored package]
  var carry = exp.addObject('LogicGate', Object.assign({ logic: 'AND', left: LEFT, top: TOP + cell.h, name: 'CARRY', color: [170, 200, 90] }, gateOpts));
  var gates = { SUM: sum, CARRY: carry };

  // ── THE INPUT RAILS — the lane plan: B and A are SWAPPED on CARRY (AND commutes; the swap buys
  //    a lane pitch of separation between the two inputs) ──────────────────────────────────────
  // memo: The lane plan: which input feeds which port of which gate. B and A are swapped on CARRY (AND commutes) so the two inputs are a lane apart.
  var LANES = [
    { input: 'A', gate: 'SUM', port: 'inPortA' }, { input: 'B', gate: 'SUM', port: 'inPortB' },
    { input: 'B', gate: 'CARRY', port: 'inPortA' }, { input: 'A', gate: 'CARRY', port: 'inPortB' }
  ];
  var rails = { A: [], B: [] }, traces = [];
  // memo: Per lane: a rail Trace from LEAD px left of the port to the port, then an emitter parked INSET px inside its mouth, switched on or off by its input's state.
  LANES.forEach(function (row, i) {
    var port = gates[row.gate][row.port], y = port[1];
    // memo: The rail: a Trace is a wire (a bore between two walls) along a path of points.
    // memo: The rails are built with `new`, not declared: inventory does not list them and no hand moves them; read their rects from this sketch.
    var t = new Trace(u, { path: [[port[0] - LEAD, y], [port[0], y]], bore: MIN.bore,
                           wallThickness: MIN.wallThickness, name: 'rail' + row.input + i, color: [90, 120, 200] });
    // memo: The emitter, DECLARED by name 'input' + its input letter + its lane index: inputA0 and inputB1 feed SUM, inputB2 and inputA3 feed CARRY (LANES above) [src]; inventory gives each one's centre. The beads the clip shows are its quanta. Centre-placed, so a hand can drag it: dragTo inputA0 to (40, 8) over 300 ticks pulled it out of its rail mouth; its quanta then sprayed loose above the circuit, the top A rail emptied and SUM_out went dark, measured [clip memories/circuit-sat/clip-drag-inputa0.mp4, ticks 1013–1463: the drag and 150 settle ticks].
    var em = exp.addObject('SphereEmitter', Object.assign(emitterBag([t.inPort[0] + INSET, y]),
                                                          { name: 'input' + row.input + i }));   // parked inside the bore mouth
    // memo: An input that is LOW has its emitters switched off: no beads in that rail.
    em.setActive(row.input === 'A' ? STATE.a : STATE.b);
    rails[row.input].push(em);
    traces.push(t);
  });

  // ── THE READOUTS — grounded traces off each gate's outlet: their current IS the answer ──
  // memo: A grounded Trace off a gate's outlet: its current IS the gate's answer. 'ground' true = quanta end there.
  function readout(gate, name) {
    return new Trace(u, { path: [[gate.outPort[0], gate.outPort[1]], [gate.outPort[0] + READOUT, gate.outPort[1]]],
                          bore: MIN.bore, wallThickness: MIN.wallThickness, ground: true, name: name, color: [60, 160, 220] });
  }
  var readouts = { SUM: readout(sum, 'SUM_out'), CARRY: readout(carry, 'CARRY_out') };
  traces.push(readouts.SUM, readouts.CARRY);
  // memo: Every trace reads the tick stream (its ammeter counts per tick); the two declared gates were attached when exp.addObject declared them. [src]
  traces.forEach(function (p) { p.attachToRunner(exp.runner); });   // every trace reads the tick stream (a declared gate subscribed at addObject)

  // memo: The input switch: records the state and turns that input's emitters on or off.
  function setInput(which, on) {
    STATE[which] = !!on;
    rails[which === 'a' ? 'A' : 'B'].forEach(function (em) { em.setActive(STATE[which]); });
  }

  // ── THE CIRCUIT, PUBLISHED — the parts and the geometry a harness reads (the half-adder
  //    acceptance rig): each gate's own getState(), each readout's calibrated getDelivered(), the
  //    input switch, and the layout values its settle budget is computed from. ───────────────
  // memo: The circuit published for a harness: gates, readouts, rails, the switch and the layout numbers its settle budget is computed from.
  exp.circuit = {
    gates: gates, readouts: readouts,
    rails: rails, lanes: LANES, setInput: setInput,
    lead: LEAD, readout: READOUT, inset: INSET
  };

  // ── THE VIEW — frame the 72x54 px circuit (render only: the 2D camera's distance IS the visible
  //    physics-px height) ─────────────────────────────────────────────────────────────────────
  // memo: The framing rect: rails + both gates + readouts.
  var fp = [LEFT - LEAD, TOP, LEAD + cell.w + READOUT + 4, cell.h * 2];
  var cam = exp.runner.cameraControl;
  // memo: Render only: aim the 2D camera at the circuit's centre and zoom so it fills the view (distance = visible physics-px height).
  if (cam && typeof cam.setOrbit === 'function') {
    cam.setOrbit({ target: { x: fp[0] + fp[2] / 2, y: fp[1] + fp[3] / 2 },
                   distance: Math.max(fp[3] * 1.35, fp[2] * 1.35 * H / W) });
  }

  // ── THE KNOBS (on the canvas): the two inputs and the rail ──────────────
  // memo: Page-only knobs: input A and input B toggles (bottom left), and a 'rail' slider 1..16 that re-sets every emitter's burst and both gates' supply.
  var registry = ControlRegistry.makeControlRegistry();
  registry.registerControls('circuit-sat', [
    { kind: 'scalar', id: 'inputA', label: 'input A', min: 0, max: 1, step: 1, value: STATE.a ? 1 : 0, widget: 'toggle',
      fmt: function (v) { return v ? '1 (HIGH)' : '0 (LOW)'; }, onChange: function (v) { setInput('a', v); },
      place: { x: 0.02, y: 0.80 } },
    { kind: 'scalar', id: 'inputB', label: 'input B', min: 0, max: 1, step: 1, value: STATE.b ? 1 : 0, widget: 'toggle',
      fmt: function (v) { return v ? '1 (HIGH)' : '0 (LOW)'; }, onChange: function (v) { setInput('b', v); },
      place: { x: 0.02, y: 0.88 } },
    { kind: 'scalar', id: 'rail', label: 'rail (burst/tick)', min: 1, max: 16, step: 1, value: RAIL,
      fmt: function (v) { return String(v) + ' q/tick'; },
      onChange: function (v) {
        RAIL = Math.max(0, Math.round(v));
        sum.setSupplyVoltage(RAIL); carry.setSupplyVoltage(RAIL);
        rails.A.concat(rails.B).forEach(function (em) { em.setBurstSize(RAIL); });
      },
      place: { x: 0.30, y: 0.88 } }
  ]);
  // Chrome (a page only): expose the knobs to a host frame, and mount the overlay through the
  // runner's ONE door (runner.controlHost) — before a canvas is mounted (a notebook pane) there is
  // none, so the knobs stay in the exposed registry only.
  FrqtlControlsPanel.exposeRegistry(registry, { runner: exp.runner });
  if (exp.runner.controlHost) { FrqtlControlOverlay.mount(exp.runner, { registry: registry, name: 'circuit-sat' }); }
}
```
