/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Double slit (the SDK's artifact page)
 *
 * A sketch file: the WHOLE scene as one ES module, `export default function buildExperiment(exp)`. The world (its
 * co-init call, `exp.createCanvas` — the one place its size is written), the parts and their order
 * are all here; the sugar (SlitScreen, SlitLightSource, DetectorWall, LargeObject), the renderer
 * and the engine are imports. Shipped as `dist/artifact/double-slit.html`: the generator
 * (lib/shim/engine/artifact-shell.js, ARTIFACT_SCENE) embeds THIS file's text verbatim.
 *
 * The parts are setupDoubleSlit's at its defaults (slit screen at 1.5 λ, an absorbing start wall,
 * the slit light source at a 10° step, the detector 3 λ past the screen), so the seeded run is
 * that factory's, tick for tick (lib/shim/engine/test/artifact-shell-sketch.test.mjs holds it on
 * the WASM engine). Zero new physics.
 */

import { CollisionTypes, DetectorWall, LargeObject, SlitLightSource, SlitScreen } from '@descix/frqtl-web/parts';

export const parts = {};

export default function buildExperiment(exp) {
  var S = 480, WAVELENGTH = 64;   // THE WORLD this scene states (its co-init call below) and its one geometry knob

  exp.createCanvas(S, S, { dimension: 2, wavelengthScale: Math.floor(WAVELENGTH / 16) });   // a 2D canvas + universe, S x S
  exp.declare(parts);
  var u = exp.universe;

  var slits = new SlitScreen(u, WAVELENGTH * 1.5, WAVELENGTH, S, WAVELENGTH, true, 1);
  new LargeObject(u, [0, 0, 10, S], CollisionTypes.ABSORB, [], 'start_wall', 'closest', null, 1, [120, 120, 120]);
  var light = new SlitLightSource(u, slits, 10);
  new DetectorWall(u, u.universe_rect, slits.wall1.rect.left + slits.wall1.rect.w + 3 * WAVELENGTH);
  u.experimentTickFunctions.push(light.getTickFunction());
}
