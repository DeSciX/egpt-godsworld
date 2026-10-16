/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module game-layer-manifest
 *
 * THE SINGLE SOURCE OF TRUTH for which game-layer object scripts load and in
 * what order. Every surface that needs to inject the FRQTL game layer MUST
 * derive its script list from this manifest — never maintain a hand-copied list.
 *
 * ## Consumers
 *
 * - `lib/frqtl/experiments/_shared/stack-boot.js` — injects scripts in the
 *   browser via a `_u(path)` literal built at page-load time. Because stack-boot
 *   is a classic injected script (not ESM) it cannot import this module directly.
 *   Instead its GAME array MUST be an exact literal copy. The parity test
 *   `lib/shim/engine/test/game-layer-manifest.test.mjs` enforces 1:1 order
 *   equality so that drift becomes a CI failure.
 *
 * - `lib/shim/engine/router.js` — imports GAME_LAYER_SCRIPTS and maps through
 *   its URL resolver in `gameScripts()`.
 *
 * - `lib/features/ide/AuthorView.jsx` — imports OBJECT_SCRIPTS (and
 *   RUNNER_SCRIPTS) and maps to the `'../../' + p` relative form it needs for
 *   the author iframe's `_ensureClasses` loader.
 *
 * ## Load-order constraints
 *
 * - Box.js MUST load before OvenBox.js — OvenBox reads `window.Box` at
 *   module-eval time (OvenBox.js line 43).
 * - All constants (CollisionTypes, CollisionActions, Charge) MUST load before
 *   any object that reads them (LargeObject, Box, etc.).
 * - Rectangle MUST load before any object that reads `window.Rectangle`
 *   (EgptFractal.js etc.).
 *
 * ## Updating this manifest
 *
 * 1. Add / remove entries here ONLY.
 * 2. Keep the parity test passing (`node --test`).
 * 3. The parity test will catch any divergence in stack-boot.js's GAME literal.
 */

'use strict';

/**
 * Ordered frqtl-relative paths for the game-layer object scripts.
 * Each consumer maps these paths through its own URL resolver.
 *
 * Box.js appears before OvenBox.js (eval-time window.Box dependency).
 * @type {string[]}
 */
export var OBJECT_SCRIPTS = [
    'objects/constants/CollisionTypes.js',
    'objects/constants/CollisionActions.js',
    // WallBehaviors: the ONE Collision LEXICON v2 authority (behavior/direction/hook
    // vocab + resolveWallSpec + the presets), ferried from the two constant sets above
    // — MUST load after them and before Wall.js.
    'objects/constants/WallBehaviors.js',
    'objects/constants/Charge.js',
    'objects/geometry/Rectangle.js',
    // SlabFace: the SOLE face/OBB/convention authority (rotated-wall reflection base +
    // swept-OBB narrow-phase region). MUST load before actionCompiler.js (which reads
    // window.SlabFace in _buildReflectOps) and Wall.js (which derives the engine region).
    'objects/geometry/SlabFace.js',
    // tagger: the MARK part — the ONE tag-op shape (`set 0.data.<key> = StrLit(value)`),
    // its host-lane get→merge→set twin, and the read. Depends on AstSchema +
    // FrameDataSchema (both loaded in the ENGINE phase). MUST load BEFORE
    // actionCompiler.js, whose MARK/DETECT + mark/recolor hooks ferry window.Tagger.
    'objects/objects/tagger.js',
    // actionCompiler: single sugar authority (CollisionActions[] → op-program).
    // Depends on: AstSchema (loaded in ENGINE phase before GAME layer), SlabFace (above),
    // Tagger (above). Must load BEFORE LargeObject.js (its ctor calls compileActions).
    'objects/objects/actionCompiler.js',
    // absorbRadiation: ABSORB v2 backing-frame attach + radiation host tick-fn (Track A).
    // Pure (no deps); loaded before Wall.js (which references window.AbsorbRadiation).
    'objects/objects/absorbRadiation.js',
    // emitterProgram: the engine-agnostic emitter handle-program (G-EMIT-2). Must load BEFORE
    // QuantumEmitter.js / PointSource.js (their constructors compose buildEmitterTickFn).
    'objects/objects/emitterProgram.js',
    'objects/objects/LargeObject.js',
    // Wall (W1): the first-class wall primitive — a facade over ONE LargeObject.
    // Depends on LargeObject.js + WallBehaviors.js (both above). MUST load before
    // DetectorWall.js/SlitScreen.js — they re-point their plain-wall
    // segments onto window.Wall.
    'objects/objects/Wall.js',
    // GraphingDetectorWall: the counting screen that paints its OWN registered hit
    // heatmap onto its faces (presentation pass Item 1). EXTENDS Wall (reads
    // window.Wall at construction) and resolves window.HeatColormap (the ENGINE-phase
    // lib/shim/render/heat-colormap.js) lazily — so it MUST load after Wall.js.
    'objects/objects/GraphingDetectorWall.js',
    'objects/objects/QuantumEmitter.js',
    'objects/objects/PointSource.js',
    'objects/objects/DetectorWall.js',
    // slitLinerScatter: the ONE authority for the DSE slit liner's composable
    // (behavior x resetLocalTime) collision op-program (DSE LAB, 2026-07-13).
    // Depends on actionCompiler.js (compileActions/buildEjectOps, loaded above)
    // and AstSchema (ENGINE phase, before GAME). Must load BEFORE SlitScreen.js
    // (its constructor delegates to window.SlitLinerScatter.applyLinerScatter).
    'objects/objects/slitLinerScatter.js',
    'objects/objects/SlitScreen.js',
    'objects/objects/SlitLightSource.js',
    'objects/objects/EgptFractal.js',
    'objects/objects/Box.js',
    // Tunnel (ws-experiments-walkthrough, CEO 2026-07-26 "two mirrors form a tunnel"):
    // TWO parallel Wall{bounce} mirrors + a bore — a waveguide. Depends on window.Wall
    // (loaded above); no other dep. Loaded here (after Box, before OvenBox) to mirror
    // stack-boot.js's own order.
    'objects/objects/Tunnel.js',
    // Trace (THE WIRE PART) — mirror Tunnel runs + directed Tunnel corners + a
    // Wall{destroy} ground. Depends on window.Tunnel + window.Wall, both resolved at
    // CALL time, so this position mirrors stack-boot.js rather than encoding a
    // load-order requirement.
    'objects/objects/Trace.js',
    // LogicGate (THE SWITCHING PART) — Wall{destroy,count} input ammeters + a mirror
    // Tunnel channel + a SphereEmitter supply rail + a Wall{destroy} shunt valve.
    // Every dep (Tunnel/Wall/Trace/SphereEmitter) resolves at CALL time, so this
    // position mirrors stack-boot.js rather than encoding a load-order requirement.
    'objects/objects/LogicGate.js',
    'objects/objects/OvenBox.js',
    'objects/objects/CircuitGate.js',
    'objects/objects/CircuitProbe.js',
    // Tube: the general-purpose bore "Layer class" DirectedTunnel composes from,
    // part of the shared game layer `ensureEngineStack()` boots so the notebook
    // realm installs it too (a canvas cell running a factory whose classic branch
    // reads window.Tube would otherwise throw "Tube is not a constructor" — the
    // notebook path never executes an experiment page's data-page-scripts).
    // Dependency order: Tube needs LargeObject/CollisionTypes/CollisionActions
    // (above) — satisfied by its position here.
    'objects/objects/Tube.js',
    // sustainedSource (ws-dse-3d, the ONE hand-placed-quantum source surface):
    // no dependencies beyond the generic universe primitives — depended on by
    // LightSource.js (below) and by setupTunnelLab.js/setupLightSourceLab.js.
    'objects/objects/sustainedSource.js',
    // DirectedTunnel/directedRedirectProgram (DIRECTED TUNNEL BUILD, 2026-07-13):
    // depend on Tube.js (above) + slitLinerScatter.js (already loaded earlier in
    // this array, line ~72) + CollisionTypes (above) — satisfied by position here.
    'objects/objects/directedRedirectProgram.js',
    'objects/objects/DirectedTunnel.js',
    // LightSource (T2, 2026-07-13): depends on DirectedTunnel.js + sustainedSource.js (above).
    'objects/objects/LightSource.js',
    // controlBind / makeControlsForObject / frqtl-control-slider / frqtl-controls-panel
    // (WS Studio Controls Realignment S3, design §2.4/§2.5.2): the SAME
    // "promoted from per-page data-page-scripts extras" move as the Tube
    // group above — these four were previously ONLY
    // loaded by the handful of pages that declared them in data-page-scripts
    // (collision-matrix, wave-interference). Studio's author iframe (AuthorView.jsx)
    // can load ANY canonical experiment page (or the empty universe) — it needs
    // makeControlsForObject/controlBind/the panel+slider widgets available
    // regardless of which page is currently loaded, so they belong in the
    // shared game layer, not a per-page opt-in. No eval-time window.* read
    // dependency among these four or on anything above (each resolves its
    // sibling contracts LAZILY, at call time, via a named FAIL-LOUD guard —
    // see each file's own docstring) — position here is for readability
    // (grouped with the other "sugar, not core objects" promotions), not a
    // load-order requirement.
    'objects/objects/controlBind.js',
    // controlAction: the objects-side executor for an `action` descriptor (the
    // sibling of controlBind — shim owns the NAME vocabulary, objects owns
    // execution). Resolves window.ControlsSchema lazily; no load-order constraint.
    'objects/objects/controlAction.js',
    'objects/objects/makeControlsForObject.js',
    // makeControlsForRenderSurface: the RENDER-side factory twin (WS Studio
    // Controls Realignment §7 r2, Bite S5a) — same "promoted into the shared
    // game layer" rationale as makeControlsForObject.js immediately above
    // (fx-experiment.js, a data-page-scripts entry, needs it regardless of
    // which fx-* page is loaded; Studio's author iframe will need it too, S5b).
    'objects/objects/makeControlsForRenderSurface.js',
    'objects/objects/frqtl-control-slider.js',
    // frqtl-control-widgets: THE widget table (slider DELEGATED to the file above,
    // plus toggle/checkbox/text/button). Every host — the panel below and the
    // canvas overlay — resolves its widget here, so there is exactly one authority.
    'objects/objects/frqtl-control-widgets.js',
    'objects/objects/frqtl-controls-panel.js',
    // frqtl-control-sync: the PULL reconciliation side (promoted from a per-page
    // data-page-scripts extra for the same reason as the widgets above — the canvas
    // overlay uses it on ANY page to keep a placed toggle honest about live state).
    'objects/objects/frqtl-control-sync.js',
    // frqtl-control-overlay: the ONE renderer-agnostic HTML overlay over the canvas.
    // Consumes the panel's exported `dispatch` (its fourth consumer), the widget
    // table and control-sync — all resolved lazily, so position is for readability.
    'objects/objects/frqtl-control-overlay.js',
    // frqtl-control-write-queue: the WRITE-side symmetric primitive to the pull-side
    // frqtl-control-sync.js (WS Studio Controls Realignment S4, design §2.3.4).
    // Promoted into the shared game layer for the SAME reason as the four scripts
    // immediately above — Studio's author iframe wraps its physics-write call sites
    // (MountedControlSlider onChange, PageControlsSection commit) through this queue
    // regardless of which experiment page is currently loaded.
    'objects/objects/frqtl-control-write-queue.js',
    // CameraControls (ws-emitter-wave Bite 3B): the REUSABLE first-person-style
    // camera-controls sugar (two on-screen joysticks + arrow/WASD keys) that ANY
    // 3D experiment drops in to drive runner.cameraControl. Promoted into the
    // shared game layer for the SAME reason as the control widgets immediately
    // above — it is reusable controls sugar, not a per-page one-off, and Studio's
    // author iframe / any 3D page should have window.CameraControls available
    // regardless of which page is loaded. Capability-checked (FAIL-SOFT no-op in
    // 2D), no eval-time window.* dependency (reaches runner.cameraControl LAZILY
    // at attach() time), so position here is for readability, not load order.
    'objects/objects/CameraControls.js',
    // FrqtlVision (the RENDER_STAGES tap contract + the normalized capture format,
    // CEO 2026-07-30): the reusable "video camera that takes stills" sugar — forwards
    // runner.sceneRecord() / runner.capture(stage) / runner.captureStill() and owns the
    // ONE derived pixels→PNG encoder. Promoted into the shared game layer for the SAME
    // reason as CameraControls immediately above: it is reusable sugar, not a per-page
    // one-off, and any page or harness taking goldens / guide captures / corpus rows
    // should have window.FrqtlVision available regardless of which page is loaded. It is
    // the DISJOINT peer of CameraControls (that one drives the VIEWPOINT; this one reads
    // the PICTURE). Resolves window.RenderStages LAZILY at attach()/toDataURL() time, so
    // position here is for readability, not load order.
    'objects/objects/FrqtlVision.js',
    // CameraPath (CEO 2026-07-30): the declarative, REPRODUCIBLE camera path — ONE object for
    // 2D (degenerate {distance,target} waypoints) and 3D (full orbit-bag waypoints), with no
    // mode branch anywhere: legal axes are read from the camera handle's own poseFields.
    // Promoted into the shared roster for the SAME reason as CameraControls / FrqtlVision
    // above: reusable sugar, not a per-page one-off, and any page taking pose-addressed
    // goldens or corpus rows should have window.CameraPath available. Resolves
    // runner.cameraControl LAZILY at attach() time, so position here is readability.
    'objects/objects/CameraPath.js',
    // The schema trio — owner before consumer: ObjectSchema.worldRect is the rect contract
    // _setupOptions.requireWorldRect and every objects/setup/ factory consume, so it loads
    // ahead of them. valueNormalizer.js is the declared-type WRITE GATE and engine-scopes.js
    // owns the Frame/Universe/Dimension descriptors; schema/index.js FAILS LOUD without
    // either, so both load immediately before it.
    'objects/schema/valueNormalizer.js',
    'objects/schema/engine-scopes.js',
    'objects/schema/index.js',
    // setupSphereEmitter3D (ws-experiments-walkthrough Bite 4b): PROMOTED from a
    // per-experiment setup script into the shared roster because its CLASS changed —
    // it now backs a first-class palette OBJECT (SphereEmitter, below / the
    // ObjectFactory 'SphereEmitter' builder), so `addObject('SphereEmitter')` must
    // resolve it without a per-rung scripts[] delta. Depends on sustainedSource.js
    // (above) for capacityAtDimension; MUST precede SphereEmitter.js (the facade
    // resolves it at addTo() time, but the ObjectFactory builder needs it loaded).
    // Only the reusable single-object logic is promoted — it self-inits the universe
    // as its OWN scene setup (the rungs rely on that, unchanged); no separate scene
    // scaffolding to split out.
    //
    // _setupOptions.js MUST precede every objects/setup/ script, here AND in the
    // per-page data-page-scripts that load after this roster: it defines
    // window.assertSetupOptions, the ONE unknown-option-key gate every setup factory
    // calls. The factories resolve it LAZILY (at call time, not eval time), so this
    // position is about the shared roster being loaded before any page script runs —
    // which is what lets a per-page setup factory get the gate without a scripts[] delta.
    'objects/setup/_setupOptions.js',
    // _worldInit.js — the ONE world-init contract (the world cfg vocabulary + its
    // universe.init mapping, window.FrqtlWorldInit). Same roster rule as _setupOptions.js:
    // a setup factory's world step resolves it at CALL time, so it must load ahead of every
    // objects/setup/ script; RecipeContext (below) consumes it too.
    'objects/setup/_worldInit.js',
    // _collisionMatrixLanes.js — the ONE collision-matrix lane table (densities, and the
    // capacity→mass resolution). Shared by the 2D and 3D matrices, whose capacities differ
    // (2^(2·level) vs 2^(3·level)) while their DENSITY sweep is identical. Same roster rule
    // as _setupOptions.js above: a shared setup helper must load before any page script.
    'objects/setup/_collisionMatrixLanes.js',
    'objects/setup/setupSphereEmitter3D.js',
    // SphereEmitter (ws-emitter-wave "Option B"): the p5/three-familiar OBJECT
    // FACADE over the setupSphereEmitter3D setup factory — `new SphereEmitter([x,y],
    // opts).addTo(universe)`. A PURE DELEGATION SHELL (zero physics, zero second
    // emit loop — it wears the factory's returned sphereEmitterControl as an object
    // face). Shared game-layer object so bootScene / any experiment page can use the
    // object idiom + the Bite-4b manipulable palette presence (captureProps getters +
    // applyProp write-router). Resolves setupSphereEmitter3D LAZILY at addTo() time.
    'objects/objects/SphereEmitter.js',
    // setupTunnelPointExit (D4): promoted for its `sceneSpec()` — the ONE authority for the
    // Laser Build-Up scene's emitter + tunnel configs. The Light Lab rung recipe consumes it
    // so the rung and the standalone experiment page cannot drift apart (two hand-carried
    // copies of the same ten numbers is the anti-pattern this promotion exists to prevent).
    // `sceneSpec` is a PURE function (no universe, no deps); the factory beside it resolves
    // Tunnel/setupSphereEmitter3D at CALL time, so this file's roster position is irrelevant.
    'objects/setup/setupTunnelPointExit.js',
    // setupTraceCircuit — SOURCE -> TRACE -> GROUND, the smallest complete circuit.
    // Resolves Trace/setupSphereEmitter3D at CALL time, so its roster position is
    // irrelevant; it sits last because it consumes both.
    'objects/setup/setupTraceCircuit.js'
];

/**
 * Ordered frqtl-relative paths for the runner scripts that follow
 * the object scripts.
 * @type {string[]}
 */
export var RUNNER_SCRIPTS = [
    'objects/ObjectFactory.js',
    // instruments/capture.js — the render-pipeline TAP MECHANISM (THE_MINIMAL_SIM §4).
    // An INSTRUMENT on the primitive surface, not an editor concern: FrqtlApp constructs
    // it and forwards capture/captureStill/sceneRecord/setSourceRef to it. Publishes
    // window.FrqtlCapture; FrqtlApp resolves it at CONSTRUCTION time (not module-eval), so
    // position here is for readability — but it precedes its consumer anyway.
    'objects/instruments/capture.js',
    'objects/FrqtlApp.js',
    // RecipeContext — the recipe facade (`exp`) a scene's buildExperiment(exp) runs against.
    'objects/RecipeContext.js'
];

/**
 * The complete ordered game-layer script list: objects then runner.
 * This is the canonical sequence every surface MUST agree on.
 * @type {string[]}
 */
export var GAME_LAYER_SCRIPTS = OBJECT_SCRIPTS.concat(RUNNER_SCRIPTS);
