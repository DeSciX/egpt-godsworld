# @descix/frqtl-sdk

A discrete cellular-automata physics engine (compiled Rust → WASM) for building
realtime, emergent simulations in the browser or in Node. Physics comes out of
local per-pixel rules — a frame that moves one pixel per tick, single occupancy,
momentum — rather than force equations or wave PDEs. What emerges from those rules:
double-slit interference fringes, wave-interference patterns, blackbody spectra,
and a circuit-SAT demo — each computed live from the automaton, not replayed from
recorded data.

## Install
  npm install @descix/frqtl-sdk

## See it run immediately
Open this URL, or embed it in a claude.ai artifact iframe (CSP-clean, self-contained):

  https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@0.5.1/dist/artifact/double-slit.html

Drag the source and the interference pattern recomputes live from the local rules.

Other experiment pages — prefix each with `https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@0.5.1`:

  /dist/experiments/wave-interference/index.html
  /dist/experiments/particle-walk/index.html

## What you can build with it
The engine is general; the experiments above are setups written on top of it. To
build your own — say, a draggable 2D dynamic light source rendered in p5.js or
three.js — the fastest way in is to read two files and copy the pattern (prefix
each with `https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@0.5.1`):

  /dist/js/game/setup/setupDoubleSlit.js
     How an experiment is assembled: the emitter (your light source), the geometry,
     and a detector wired onto the universe. Copy this to lay out your own scene.
  /dist/js/game/objects/DetectorWall.js
     How a detector is declared as a small object over the engine — a collision
     region that tallies the frames passing through it. The template for any
     measurement surface.
  /dist/esm/index.js
     The ESM entry: how a page boots the WASM engine and drives it each tick.

Rendering is a separate step from physics: `doTick()` returns pure frame data and
you draw it with whatever renderer you like (p5 and three.js are both included).

## Node (headless, no DOM)
  const { EGPTEngine, setupDoubleSlit,
          FrqtlCapture, FrqtlVision,            // headless EYES
          RenderStages, FieldBuilder            // the two contracts they resolve
        } = require('@descix/frqtl-sdk');

Same compiled Rust/WASM engine as the browser — bit-identical `.wasm`, only the JS
glue differs between the web and node wasm-pack targets.

**Eyes are not a browser privilege.** `FrqtlCapture` (the render-pipeline tap) and
`FrqtlVision` (its face) run here: the `tick` and `field` stages are backend-independent and
need no canvas and no DOM, so a node process that can run a world can LOOK at it.
`getStill('field')` returns an r8 heightfield bag — already an 8-bit grayscale raster, so
PGM is a header plus the bytes (worked example: `docs/internal/physics-lab/look.cjs`).
`RenderStages`/`FieldBuilder` are re-exported because they are the contracts the tap
resolves at call time — read the owner, never a copy. This barrel is the surface;
deep-requiring `lib/frqtl/...` is not a supported path.

`composite` in Node FAILS LOUD on the core barrel (stage known, not tappable — the message
names the missing `captureStill` capability AND the hosted path below) rather than returning a
blank still: a blank capture in a corpus is fabricated evidence.

## Hosted eyes — `composite` from Node, through the REAL renderer
  const { openHostedEyes } = require('@descix/frqtl-sdk/eyes');

`composite` is not a picture of the scene — it IS the render stack's output. A node raster
backend that re-drew it would show you a different picture than the real stack draws, and with a
shader in the stack that difference is the whole subject (god-rays turn a bunch of particles
into a sun). So the eyes look through the SAME stack: this entry boots the canonical empty
experiment page in a managed headless browser, regenerates your scene from its
`{sceneRecord, sceneSource}` pair, applies the `renderState` you declare (if any), drives the
clock to an EXACT tick, points the one camera,
and captures in-page through the same `FrqtlCapture` surface a browser user has. You get back
the SAME normalized still bag as everywhere else — provenance stamped by the page's own
dispatcher, and verified on this side by scene-hash equality per still.

  const eyes = await openHostedEyes({
      sceneRecord: { seed: 42, sourceRef: 'my-scene', physicsW: 600, physicsH: 400 },
      sceneSource: { kind: 'module', source: buildExperimentSource },   // REGENERATE-grade
      renderState,                                                      // optional: the declared look
      pageUrl: 'http://localhost:8080/experiments/empty/index.html'     // YOUR deployment
  });
  try {
      await eyes.driveToTick(300);
      await eyes.setPose({ azimuth: 35, elevation: -15, distance: 420 });
      const still = await eyes.vision.getStill('composite');
      // VIDEO: the recorder runs in the page; start it, then drive the clock.
      const rec = eyes.vision.record({ everyTicks: 10, stopAt: { ticks: 200 }, maxFrames: 40, fps: 10 });
      await eyes.driveToTick(501);
      eyes.saveVideo(await rec, 'out.mp4');   // track.frames[{i, tick, pose}], truncated
  } finally { await eyes.dispose(); }                                   // symmetric, idempotent

Four rules worth knowing before you call it:
  - **REGENERATE-grade or nothing.** A SceneRecord is identity + reproduction pins with no
    scene spec in it, and hosting RE-RUNS the scene — so the source (a `buildExperiment(exp)`
    module) is required, and an ad-hoc / live-edited / raster-only scene is refused by name.
  - **The picture is SOURCE + declared renderState, nothing else.** A walk-through rung's look
    (render rows, filters, camera) lives on its registry row, not in its sketch, so the sketch
    alone records the PLAIN render; pass `effectiveRenderState(rung, mode)` as `renderState` for
    the rung as the GYM shows it (`@descix/frqtl-sdk/registry` serves it, with `walkthroughById`
    and `loadSceneSource(id)` for the sketch text). A row no renderer declares, a row or camera preset the booted
    display cannot take, a `renderer` the source does not build, a `seed` that is not the
    record's and a non-wasm `engine` all THROW. A `setPose` after open overrides the bag's camera.
  - **The browser is a real, pinned dependency of this package** (`playwright`, exact
    version), reached ONLY by this entry — a consumer of `.` never loads it. It is
    not `optionalDependencies`: an optional browser is a surface that sometimes exists, and
    the picture is the product. Bring your own via `browserType` if you prefer.
  - **The raster path is recorded, not assumed.** The default launch selects hardware GL
    (measured: bit-reproducible run-to-run on a pinned machine/driver/build), but headless
    chromium can silently fall back to software — so every still's `build.gl` carries the
    browser's own `UNMASKED_RENDERER_WEBGL` answer, and rows from different raster paths
    refuse to mix by identity. Bit-exact within a path; tolerance across paths.

No CLI ships with this package. FRQTL scenes are fractal and non-linear, so a
static numeric check cannot tell you a scene is right before you have drawn it —
acceptance is visual: run a scene and look at it. Scoring your own detector
histograms in your own harness is a design aid, never the acceptance criterion.

## The physics model (enough to code against)
Three primitives: time = 1 tick, space = 1 pixel, mass = pixel occupancy.
Everything is a Frame (recursive); there is no separate "particle" class.

  - A frame moves at most 1 pixel/tick per axis relative to its parent; excess
    intended motion accumulates as momentum (this is the speed limit).
  - Single occupancy: two quanta can't share a pixel; a failed placement is a
    collision (bounce/merge), not a force.
  - Interference fringes are the statistics of many discrete walks through the
    slits — the pattern builds up from individual quanta, not a wave equation.
  - Fullness (mass/capacity) sets two decoupled things: how often a frame steps
    (its effective speed) and its oscillation wavelength
    (wavelength = floor(capacity/mass × constant), minimum 4).
  - `doTick()` runs a fixed pipeline (inject → structure → physics → collect) and
    returns pure data; rendering is downstream.

## What this is NOT
  - Not a general PDE / force-integration physics library.
  - Not a math library — that is the sibling package @descix/egpt-math-sdk.
  - The published build is WASM-only on the engine side (compiled surface).

## Curated notebooks
Index: `https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@0.5.1/dist/notebooks/notebooks.json`

## No account, credits, or tokens are needed for anything above.
