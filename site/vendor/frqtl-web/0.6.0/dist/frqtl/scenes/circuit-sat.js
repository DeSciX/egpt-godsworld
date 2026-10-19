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
  var W = 760, H = 520;              // THE WORLD this scene states (its co-init call below)
  var LEFT = 60, TOP = 15;           // the circuit's top-left
  var RAIL = 6;                      // rail voltage: quanta per tick per input emitter
  var LEAD = 24, READOUT = 24;       // input-rail and readout trace lengths
  var INSET = 4;                     // each input emitter sits this far inside its rail's bore mouth
  var STATE = { a: true, b: false };   // input A HIGH at start: SUM reads 1, CARRY reads 0

  // The input emitter: a narrow 2D laser on the fundamental layer, random ± charge.
  function emitterBag(center) {
    var bag = { preset: 'laser', is2D: true, R: 24, orientationDeg: 0, emissionBoxSide: 0,
                fundamentalDimension: 0, burstSize: RAIL, emitEveryTicks: 1, chargeMode: 'random' };
    if (center) { bag.center = center; }
    return bag;
  }

  // ── WORLD — a 2D canvas + universe; the emitter's own world (its worldCfg) ──
  exp.createCanvas(W, H, SphereEmitter.worldCfg(emitterBag(null)));
  exp.declare(parts);
  var u = exp.universe;

  var MIN = LogicGate.MINIMAL;                                  // bore 3 / wall 3 / length 20
  var cell = LogicGate.cellSize(MIN.bore, MIN.wallThickness, MIN.length);
  var gateOpts = { bore: MIN.bore, wallThickness: MIN.wallThickness, length: MIN.length, supplyVoltage: RAIL };

  // ── THE GATES — SUM (XOR) above CARRY (AND) ─────────────────────────────
  var sum = exp.addObject('LogicGate', Object.assign({ logic: 'XOR', left: LEFT, top: TOP, name: 'SUM', color: [200, 170, 70] }, gateOpts));
  var carry = exp.addObject('LogicGate', Object.assign({ logic: 'AND', left: LEFT, top: TOP + cell.h, name: 'CARRY', color: [170, 200, 90] }, gateOpts));
  var gates = { SUM: sum, CARRY: carry };

  // ── THE INPUT RAILS — the lane plan: B and A are SWAPPED on CARRY (AND commutes; the swap buys
  //    a lane pitch of separation between the two inputs) ──────────────────────────────────────
  var LANES = [
    { input: 'A', gate: 'SUM', port: 'inPortA' }, { input: 'B', gate: 'SUM', port: 'inPortB' },
    { input: 'B', gate: 'CARRY', port: 'inPortA' }, { input: 'A', gate: 'CARRY', port: 'inPortB' }
  ];
  var rails = { A: [], B: [] }, traces = [];
  LANES.forEach(function (row, i) {
    var port = gates[row.gate][row.port], y = port[1];
    var t = new Trace(u, { path: [[port[0] - LEAD, y], [port[0], y]], bore: MIN.bore,
                           wallThickness: MIN.wallThickness, name: 'rail' + row.input + i, color: [90, 120, 200] });
    var em = exp.addObject('SphereEmitter', Object.assign(emitterBag([t.inPort[0] + INSET, y]),
                                                          { name: 'input' + row.input + i }));   // parked inside the bore mouth
    em.setActive(row.input === 'A' ? STATE.a : STATE.b);
    rails[row.input].push(em);
    traces.push(t);
  });

  // ── THE READOUTS — grounded traces off each gate's outlet: their current IS the answer ──
  function readout(gate, name) {
    return new Trace(u, { path: [[gate.outPort[0], gate.outPort[1]], [gate.outPort[0] + READOUT, gate.outPort[1]]],
                          bore: MIN.bore, wallThickness: MIN.wallThickness, ground: true, name: name, color: [60, 160, 220] });
  }
  var readouts = { SUM: readout(sum, 'SUM_out'), CARRY: readout(carry, 'CARRY_out') };
  traces.push(readouts.SUM, readouts.CARRY);
  traces.forEach(function (p) { p.attachToRunner(exp.runner); });   // every trace reads the tick stream (a declared gate subscribed at addObject)

  function setInput(which, on) {
    STATE[which] = !!on;
    rails[which === 'a' ? 'A' : 'B'].forEach(function (em) { em.setActive(STATE[which]); });
  }

  // ── THE CIRCUIT, PUBLISHED — the parts and the geometry a harness reads (the half-adder
  //    acceptance rig): each gate's own getState(), each readout's calibrated getDelivered(), the
  //    input switch, and the layout values its settle budget is computed from. ───────────────
  exp.circuit = {
    gates: gates, readouts: readouts,
    rails: rails, lanes: LANES, setInput: setInput,
    lead: LEAD, readout: READOUT, inset: INSET
  };

  // ── THE VIEW — frame the 72x54 px circuit (render only: the 2D camera's distance IS the visible
  //    physics-px height) ─────────────────────────────────────────────────────────────────────
  var fp = [LEFT - LEAD, TOP, LEAD + cell.w + READOUT + 4, cell.h * 2];
  var cam = exp.runner.cameraControl;
  if (cam && typeof cam.setOrbit === 'function') {
    cam.setOrbit({ target: { x: fp[0] + fp[2] / 2, y: fp[1] + fp[3] / 2 },
                   distance: Math.max(fp[3] * 1.35, fp[2] * 1.35 * H / W) });
  }

  // ── THE KNOBS (on the canvas): the two inputs and the rail ──────────────
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
