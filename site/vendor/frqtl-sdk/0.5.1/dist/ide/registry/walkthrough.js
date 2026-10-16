/* Copyright 2023-2026 by Essam Abadir */

/**
 * WALKTHROUGH — the ordered "Walk-through" rung registry
 * (ws-experiments-walkthrough Bite 3a; CEO ruling Q-CEO-2 + architect ruling A/B/C;
 * re-authored to addObject form in Bite 4b — architect ruling 3).
 *
 * An ORDERED array of rung recipes surfaced as a "Walk-through" group in STUDIO's
 * experiment dropdown. Each rung loads via the blank-page load-by-eval path exactly
 * like a saved project — the SAME array is the SINGLE authority for BOTH the
 * dropdown group AND the `walkthrough:<id>` lookup (no parallel id→source map, no
 * switch statement — architect condition B).
 *
 * A rung row carries the PATH of its scene, never its text: each scene is ONE sketch
 * file, `lib/frqtl/scenes/<file>.js` — a dual-mode `buildExperiment(exp)` module that
 * holds the whole scene. Its text is read through `loadSceneSource(id | rung, opts)`
 * (./scene-source.js: a fetch in a page, a file read in node; FAIL-LOUD on an unknown id,
 * a non-200 or an empty body). Rungs that share one physics name the SAME file.
 *
 * ── Rung descriptor ──────────────────────────────────────────────────────────
 *   id      : stable dropdown id (the `walkthrough:<id>` selection value)
 *   title   : ordered display label
 *   prose   : one-line declarative description (what it shows, not a journey)
 *   source  : the frqtl-relative path of the scene file, `'scenes/<file>.js'`
 *             (resolved through the router's `scenes/` profile key).
 *   renderState : OPTIONAL opaque bag (normalizeSavedRenderState shape). The
 *             walkthrough load path ferries it into the SAME `_egptPendingRenderState`
 *             seam the `project:` path uses (E2a shim-owned contract) — renderer/
 *             seed thread as URL overrides (load-time); render options +
 *             camera replay after start. NO new mechanism. Absent → 2D/p5 default.
 *   modes   : OPTIONAL ordered list of named mode entries — `[{ id, label,
 *             renderState? }, …]`. The FIRST entry is the rung's DEFAULT mode.
 *             Absent (or length 1) → a single-mode rung: zero UI, byte-identical
 *             behavior. A mode entry's `renderState` is a DELTA merged over the
 *             rung's base `renderState` by the ONE derivation point,
 *             `effectiveRenderState(rung, modeId)` (below) — never merged by hand
 *             at a call site. The dropdown SELECTION VALUE stays `walkthrough:<id>`
 *             in every mode (a mode is never a second experiment id); STUDIO tracks
 *             the active mode in `project.walkthroughMode` and re-runs the ordinary
 *             walkthrough load path with the effective bag (a reload — the same
 *             pattern as `?engine=`).
 *
 * ── The mode-aware recipe form (S3/W2, CEO-ratified 2026-07-26) ───────────────
 * A multi-mode rung has exactly ONE `source`. A mode selects the RENDERER the host boots
 * (`renderState.renderer`); the scene reads the booted display once, before its world, and
 * makes the matching world (`three` ⇒ exp.createScene, else exp.createCanvas) — its
 * dimensional deltas branch on that. PER-MODE SCENE FILES ARE REJECTED: a second source
 * is the config-mirror anti-pattern this contract exists to kill. Every mode delta
 * must be expressible as DECLARED descriptor fields (emitter `is2D`, Wall/Tunnel
 * `z`/`depth`, ordinary Walls for the z-collimators, camera on the renderState) so
 * a built scene codegens to concrete, mode-PINNED state and survives Restart.
 *
 * ── The recipe form (Bite 4b — addObject, codegen-round-trippable) ────────────
 * Rungs are OBJECT recipes: each body states the WORLD first, in its co-init call
 * (`exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC))`) and then calls
 * `exp.addObject('SphereEmitter', SRC)` with the SAME bag — a PART never inits the
 * world, the sketch does, once, before any part. Because the emitter is now a real
 * authored object (a NONE-collision visual marker + the host emit tick-fn), a loaded
 * rung is DRAGGABLE / INSPECTABLE and CODEGEN-ROUND-TRIPPABLE: a STUDIO grab/drag →
 * Save re-emits the SAME addObject recipe (setupSphereEmitter3D lives in the shared
 * game-layer roster, so no per-rung script injection is needed).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * Zero new physics (canonical-bench SU1) — every rung composes already-goldened
 * engine behaviors via the shared sphere-emitter sugar. Each rung un-degenerates ONE
 * already-present input of the previous (theorist Q-THEO-1: strictly compositional).
 * The addObject builder forwards the opts VERBATIM to setupSphereEmitter3D, so the
 * physics/visual is BYTE-IDENTICAL to the pre-Bite-4b factory-call rungs.
 */

'use strict';

// The ONE shim-level renderState normalizer (E2a) — `effectiveRenderState` merges
// through it so a mode bag can never drift from the saved-project bag shape.
import { normalizeSavedRenderState, renderRowsFromBag } from '../render-state/index.js';
// The sun's look — the ONE owner of its render values (a classic shim contract: a side-effect
// import, then the global it publishes; never a binding import).
import '../render/sun-look.js';

function _requireSunLook() {
    if (globalThis.SunLook) { return globalThis.SunLook; }
    throw new Error('[walkthrough] SunLook is not available on globalThis. lib/shim/render/sun-look.js ' +
        "publishes it — keep the side-effect `import '../render/sun-look.js'` above. (FAIL-LOUD.)");
}
var SunLook = _requireSunLook();

// ── Shared render-variant renderState deltas ─────────────────────────────────
// All ride the SAME filter.<name>->setFilterActive / setRenderOption ControlBind
// dispatch a saved project's renderState uses (E2a/S6 seam; p5 supplies the filters).

// Fountain-pool: hide particles + water shader (Rung 5, Rung 6B).
var WATER_RENDER_STATE = {
    render: [
        { key: 'renderBaseCanvas', value: false },
        { key: 'filter.water', value: true }
    ]
};
// Plasma fusion: particles ON + water + additive bloom on the live field (Rung 6C).
var PLASMA_RENDER_STATE = {
    render: [
        { key: 'renderBaseCanvas', value: true },
        { key: 'filter.water', value: true },
        { key: 'filter.bloom', value: true }
    ]
};
// 3D: the three renderer (the scene's exp.createScene makes the 3D world + perspective camera).
var THREE_RENDER_STATE = {
    renderer: 'three',
    camera: { orbit: null, preset: 'rooftop' }
};
// Sun: 3D + the sun's look. The render VALUES are owned by lib/shim/render/sun-look.js (the CEO's
// exported FX bag); the camera is this row's own view, verbatim from his exported renderState.
var SUN_RENDER_STATE = {
    renderer: 'three',
    camera: { orbit: { azimuth: 32.978, elevation: 45, distance: 2873.68 }, preset: null },
    render: renderRowsFromBag(SunLook.SUN_RENDER)
};

/** @type {Array<{id:string, title:string, prose:string, source:string, renderState?:object}>} — `source` is a 'scenes/<file>.js' path */
export var WALKTHROUGH = [
    {
        id:    'r1-straight-walk',
        title: '1 · Straight Walk',
        prose: 'A collimated line of quanta drifts steadily along +X, each carrying a small ' +
               'always-armed transverse ripple (λ=16) — the walk in its simplest form.',
        source: 'scenes/straight-walk.js'
    },
    {
        id:    'r2-wave',
        title: '2 · Wave',
        prose: 'The same straight walk, but the transverse coin is given leverage — the ripple ' +
               'grows into a visible snake as each leaf oscillates with a longer wavelength.',
        source: 'scenes/wave.js'
    },
    {
        id:    'r3-omni-source',
        title: '3 · Omni Source',
        prose: 'Release the walk in every direction at once — a single point source spraying an ' +
               'even disk of quanta (the sun). Mixed-axis momentum un-degenerates the direction sampler.',
        source: 'scenes/omni-source.js'
    },
    {
        id:    'r4-self-interference',
        title: '4 · Self-Interference',
        prose: 'A single omni source of oppositely-charged quanta launched from a ring — the ' +
               'overlapping charged walks braid into radial bands of light and dark, an interference ' +
               'pattern with no wave equation.',
        source: 'scenes/self-interference.js'
    },
    {
        // POSITION IS THE CEO'S CALL (flagged, not decided silently). Placed here because
        // Self-Interference is its closest physics sibling — the same banded fan, reached by
        // building an apparatus instead of by launching an omni source. Using the letter-suffix
        // idiom the 6A/6B/6C rungs already establish, so NO existing rung is renumbered.
        // Moving it (e.g. to the end, after Sun) is a one-line array move.
        id:    'r4b-laser-buildup',
        title: '4B · Laser Build-Up',
        prose: 'A laser, assembled from parts you have already met. A GAIN SOURCE — rung 3\'s omni ' +
               'emitter, restricted to a forward half-fan — fires into a RESONANT BORE whose walls ' +
               're-aim every hit forward instead of reflecting it, and the beam leaves through an ' +
               'OUTPUT COUPLER at the far mouth. The coupler has two independent switches: RECENTER ' +
               'collapses every exiting quantum onto the bore\'s mid-line, making the mouth a single ' +
               'point source; PHASE RESET re-locks the ensemble\'s oscillation so equal-radius quanta ' +
               'share a phase again. Recentering alone gives you the geometry of rung 4; adding phase ' +
               'gives you its coherence. Sweep the two switches against the wavelength and the bore ' +
               'length: at long wavelengths the mouth is already nearly in phase and the bands appear ' +
               'on their own, while at short ones the fan reads smooth until you switch phase on. ' +
               'Nothing here is a wave equation — it is the same charged walk, aimed and re-timed.',
        source: 'scenes/laser-buildup.js'
    },
    {
        id:    'r5-fountain-pool',
        title: '5 · Fountain Pool',
        prose: 'The SAME self-interference field, worn as water — particles hidden and the water ' +
               'shader on. The light field and the water field are the same emergent wave, a ' +
               'different lens (the fractal aha).',
        // SAME physics as Rung 4 (the same scene file) — render delta only.
        source: 'scenes/self-interference.js',
        renderState: WATER_RENDER_STATE
    },
    {
        id:    'r6a-two-source',
        title: '6A · Two Sources',
        prose: 'Two independent self-interference sources, ±32px apart — their overlapping charged ' +
               'walks form an interference lattice between them: pure density superposition of two ' +
               'IID populations, interference without a wave equation.',
        source: 'scenes/two-source.js'
    },
    {
        id:    'r6b-two-fountains',
        title: '6B · Two Fountains',
        prose: 'The two-source lattice worn as water — two fountains whose ripple fields overlap ' +
               'into the same interference web, painted by the water shader with the particles hidden.',
        // SAME physics as Rung 6A (the same scene file) — render delta only.
        source: 'scenes/two-source.js',
        renderState: WATER_RENDER_STATE
    },
    {
        id:    'r6c-plasma-fusion',
        title: '6C · Plasma Fusion',
        prose: 'The two-source field lit as plasma — particles ON, water surface, and an additive ' +
               'bloom, so the two colliding charged streams read as a fusing plasma core.',
        // SAME physics as Rung 6A (the same scene file) — render delta only.
        source: 'scenes/two-source.js',
        renderState: PLASMA_RENDER_STATE
    },
    {
        id:    'r7-3d',
        title: '7 · 3D',
        prose: 'The omni source released into all three dimensions — a true 3D ball of quanta ' +
               'rendered with three.js, orbit-able with the mouse or the on-screen camera joysticks.',
        source: 'scenes/omni-3d.js',
        renderState: THREE_RENDER_STATE
    },
    {
        id:    'r8-sun',
        title: '8 · Sun',
        prose: 'The finale — the 3D omni point source dressed as a star: a dense (mass-16, fullness-1) ' +
               'warm-cool glowing core with volumetric god-rays and a shimmer of heat. The same walk ' +
               'that drew the pool, now the sun.',
        source: 'scenes/sun.js',
        renderState: SUN_RENDER_STATE
    },
    // ── Collision Lab (CEO 2026-07-23, W1 drive) — the wall-collision primitives,
    //    built on the first-class v2 Wall. Scaffolds for interactive tuning (drag /
    //    rotate / select / save): the CEO drives them to confirm the base object +
    //    control behaviors work bug-free. SU1 — the Walls add zero physics.
    {
        id:    'cl1a-mirror',
        title: '1A · Mirror',
        group: 'Collision Lab',
        prose: 'The first true routing demo: a LASER — a genuinely collimated +x beam (the ' +
               'tightest emission the emitter supports: pure +x momentum, a single charge, no ' +
               'wavelength-scale spreading) — fires into a rotatable mirror. The mirror compiles ' +
               'the real reflection law: a surface tilted to θ deflects the beam by 2θ (standard ' +
               'optics), so at 45° the thin beam exits straight up. ROTATE the mirror (the ' +
               'orientation slider, or LOOK-x in 3D) and the thin reflected beam steers live.',
        source: 'scenes/mirror.js'
    },
    {
        id:    'cl1b-absorbing-wall',
        title: '1B · Absorbing Wall',
        group: 'Collision Lab',
        prose: 'A wall that ABSORBS the quanta into its OWN real mass — it fills as it soaks up ' +
               'arrivals, stops at capacity, and slowly radiates the stored mass back out as ' +
               'lower-dimension leaves. Mass is exactly conserved (the blackbody absorb/re-emit).',
        source: 'scenes/absorbing-wall.js'
    },
    {
        id:    'cl1c-counting-wall',
        title: '1C · Counting Wall',
        group: 'Collision Lab',
        prose: 'A detector screen — the Detector Screen preset (destroy + count) tallies every ' +
               'arrival by position. A LIVE in-scene chart (a first-class LiveChart object placed ' +
               'beside the detector) plots the running y→count histogram as the sim runs — the ' +
               'chart reads wall.getCollisionHistogram between ticks and accumulates on-screen. ' +
               'This is the basis for the double-slit fringe readout. The chart panel is a plain ' +
               'render-only object: drag it, resize it, or point it at any counting wall.',
        source: 'scenes/counting-wall.js'
    },
    {
        id:    'cl1d-mirror-route',
        title: '1D · Mirror Loop (10-mirror {10/3} star)',
        group: 'Collision Lab',
        prose: 'The explanatory centerpiece: a single 2-PARTICLE-WIDE laser threads a CLOSED ' +
               'TEN-MIRROR {10/3} STAR and LOOPS FOREVER — m1→m2→…→m10→m1→… with no exit. Ten ' +
               'tall/thin mirrors sit at the vertices of a regular decagon; each mirror\'s tilt is ' +
               'solved from its incoming/outgoing chords so the reflected centre-line hits the next ' +
               'mirror exactly, and by the star\'s symmetry the tenth leg feeds straight back into ' +
               'the first — the polygon closes on itself. Each mirror is a DIFFERENT colour and, on ' +
               'collision, TAGS the beam with its own colour (its drawn colour = its identity): so a ' +
               'particle\'s colour history IS its bounce sequence — red after m1, orange after m2, … ' +
               'magenta after m10, then red again as it re-enters the loop (a pkg-node colour-transition ' +
               'proof shows the dominant next-colour after m_k is m_{k+1} for all ten, closing the ring). ' +
               'Reflection off the DRAWN face is the standard-optics 2θ law (the swept-OBB face ' +
               'collision), ten times over, no wave equation. In 3D (the default mode) every mirror ' +
               'is a SLAB — a plate with real depth — standing at its decagon vertex with the same ' +
               'in-plane tilt, and the laser is volumetric: it braids in y AND z, each slab\'s tilted ' +
               'faces reflect it by the 2θ law (vz passes through) and its near/far z-faces bounce vz, ' +
               'so no mirror passes the beam; ORBIT the camera (LOOK/drag or the az/el sliders) to see ' +
               'the ring as plates in space, and z-strays exit between the slabs and die at the ' +
               'scene\'s z-boundary. Switch the MODE strip to 2D for the flat star — the same ring, ' +
               'tilts, colours and laser, minus the z-axis (2D≡3D). Because the loop has no sink, the ' +
               'beam never leaves — an INVISIBLE background Wall (nothing + count hook) spanning the ' +
               'whole canvas (and, in 3D, the whole volume) counts the live population every tick (its ' +
               'per-tick collided frames ARE the live quanta), and the emitter\'s DECLARED emission ' +
               'gate (emissionCap + gateCounter, the blackbody pattern compiled at construction) reads ' +
               'THAT counter to pause emission at the cap and resume below it, so the population ' +
               'plateaus and FPS stays healthy while the circuit runs indefinitely — and the gate ' +
               'survives Restart (it is captured descriptor DATA, not recipe code).',
        source: 'scenes/mirror-route.js',
        // 3D FIRST = the rung's DEFAULT mode (the first declared entry). It opens on the
        // 'table-top' camera preset (three-camera-contract.js cameraPresets) with god-rays on at
        // the sun's settings (SunLook.SUN_GODRAYS, owned by lib/shim/render/sun-look.js), computed
        // from the light particles only (godraySource 'leaf'), so the mirrors shadow the beam and
        // cast no rays.
        // The 2D mode stays one click away on the MODE strip.
        modes: [
            {
                id: '3d', label: '3D',
                renderState: {
                    renderer: 'three',
                    camera: { orbit: null, preset: 'table-top' },
                    render: renderRowsFromBag(Object.assign({}, SunLook.SUN_GODRAYS, { godraySource: 'leaf' }))
                }
            },
            { id: '2d', label: '2D' }
        ]
    },
    // ── Collision Lab · 3D (Z2, CEO UX-pass 2026-07-24) — 1A/1B/1C driven in a 3D scene:
    //    a VOLUMETRIC (is2D:false) emitter + a 3D WALL SLAB (depth → a real z-slab, rendered
    //    as a BoxGeometry) + the THREE renderer/perspective camera (renderState). The walls'
    //    z-slabs CONTAIN z=0 (near<0<far) so the beam/spray — emitted at z=0 — collides. The
    //    reflect/absorb/count physics is the SAME as the 2D rungs (SU1); only the render layer
    //    and the wall's z-extent change (2D≡3D). Drive with LOOK/orbit (the W0 3D camera).
    {
        id:    'cl1a-mirror-3d',
        title: '1A · Mirror (3D)',
        group: 'Collision Lab · 3D',
        prose: 'The mirror in a 3D scene, FACE-ON: a directional +x beam hits a mirror SLAB ' +
               '(a box you can orbit around) square on its drawn face and bounces STRAIGHT BACK ' +
               '— beam in, recolored beam out along the same line, nothing continuing past the ' +
               'plate, from every camera angle (an actual mirror). Orbit (LOOK/drag) to see the ' +
               'retro-reflection in three dimensions; ROTATE the mirror (the orientation slider) ' +
               'to steer the exit by the same 2θ law as the 2D mirror — identical physics, now a ' +
               'box in space (2D≡3D).',
        source: 'scenes/mirror-3d.js',
        renderState: THREE_RENDER_STATE
    },
    {
        id:    'cl1b-absorbing-wall-3d',
        title: '1B · Absorbing Wall (3D)',
        group: 'Collision Lab · 3D',
        prose: 'The absorbing wall as a 3D slab: a volumetric (spherical) source sprays quanta in ' +
               'three dimensions into a wall SLAB that absorbs them into its own real mass, fills ' +
               'to capacity, and radiates lower-dimension leaves back out — mass exactly conserved. ' +
               'Orbit the camera to watch the spray soak into the box from every angle (2D≡3D).',
        source: 'scenes/absorbing-wall-3d.js',
        renderState: THREE_RENDER_STATE
    },
    {
        id:    'cl1c-counting-wall-3d',
        title: '1C · Counting Wall (3D)',
        group: 'Collision Lab · 3D',
        prose: 'The detector screen as a 3D slab with a live in-scene chart: a volumetric source ' +
               'sprays into a Detector Screen SLAB (destroy + count); a first-class LiveChart panel ' +
               '— placed in the scene beside the detector — plots the running arrivals as the sim ' +
               'runs, textured into the 3D view. Orbit to see the detector box and its chart in ' +
               'space (the basis for a 3D fringe readout).',
        source: 'scenes/counting-wall-3d.js',
        renderState: THREE_RENDER_STATE
    },
    // ── DSE (CEO 2026-07-24, DSE-rebuild-before-republish; order + titles ruled
    //    2026-07-26) — THE double-slit (on the Tunnel object, the single canonical
    //    double-slit) then the photoelectric experiment, both on the full new
    //    component set. Letter prefixes are DROPPED: the group label carries the
    //    family, and the ids are the stable contract.
    {
        id:    'dse-tunnel-rebuild',
        title: 'Double Slit (Tunnel, symmetric)',
        group: 'DSE',
        prose: 'The double-slit REBUILT ON THE TUNNEL OBJECT at PHYSICAL DSE PROPORTIONS: the ' +
               'detector sits at the SYMMETRIC distance — emitter-to-front of the slit wall EQUALS ' +
               'back of the slit wall-to-detector. Each slit channel is a DIRECTED Tunnel: a hit on ' +
               'a channel wall ejects the quantum back into the bore and re-emits it in a uniformly ' +
               'random direction within 180 degrees of the corridor axis, so each slit acts as a ' +
               'semi-circular emitter — the classical picture of what a slit does to a wavefront — ' +
               'rather than a mirror that would only ever project the beam it was given. The exit ' +
               'angle is drawn with real trig, so the fan is flat, not diagonal-weighted; the ' +
               'barriers + screen are v2 Walls (destroy / detector ' +
               'preset) so the scene survives Restart. The source emits FORWARD over 180 degrees ' +
               '(the hemisphere preset) rather than all the way round, so the burst that used to fly ' +
               'backward into the catcher now lights the aperture — the same sampler, restricted to ' +
               'the forward half, aimed at the wall. In 2D a balanced, central-dominant three-lobe ' +
               'interference pattern builds up. Switch the MODE strip to 3D and the SAME experiment stands up in space — ' +
               'the barrier becomes a plate with two slots, each channel a real corridor, the source ' +
               'a volumetric forward half-ball — and the instrument follows: the detector plate paints its OWN hit ' +
               'map on its faces, exactly where each particle landed, so the fringes read as bands on ' +
               'the plate itself. Identical physics, one more axis (2D≡3D).',
        source: 'scenes/dse-tunnel-rebuild.js',
        // The spectrally correct ramp (LightColor 'roygbiv', no pink terminus) — the right
        // instrument for a LIGHT experiment, and the one on which this beam's fullness
        // (0.3125) reads as yellow. Declared on the BASE renderState so BOTH modes inherit
        // it (effectiveRenderState CONCATENATES base render rows with the mode's).
        renderState: {
            render: [{ key: 'colorScheme', value: 'roygbiv' }]
        },
        // 3D FIRST = the rung's DEFAULT mode (the first declared entry), because this
        // rung is FIRST CONTACT: STUDIO opens on it, and the thing a newcomer should
        // meet is the experiment standing up in space with a camera they can move.
        // The 2D mode stays one click away on the MODE strip.
        modes: [
            {
                id: '3d', label: '3D',
                // FIRST-CONTACT FRAMING (CEO 2026-07-26): "standing BEHIND the emitter,
                // facing the slit wall slightly rotated, so the interference builds up
                // partially visible and invites you to move the camera."
                //
                // DERIVED FROM THE SCENE, not tuned against a picture. The camera sits at
                //     target + d·(cos el·sin az, sin el, cos el·cos az)
                // looking back at `target` (three-provider `_applyOrbit`, world y-DOWN).
                //   target (138, 200, 0) — the midpoint of the WORKING LENGTH (emitter
                //                  x=20 → detector far face x=256) at the beam height
                //                  (H/2): (20 + 256)/2 = 138. It is DERIVED from the
                //                  geometry, so it moves whenever the detector does. The
                //                  default centre is the CANVAS centre x=300, which sits
                //                  PAST the detector: orbiting about it swings the
                //                  experiment around a point outside itself and pushes
                //                  the near objects into the lens. The experiment orbits
                //                  about the experiment.
                //   azimuth -60  → sin az = -0.866 ⇒ camera x = 138 - 0.82·d ≈ -257 at
                //                  d = 480: BEHIND the emitter, looking down +x through the
                //                  slit wall (x = 96..160) toward the detector (x = 236).
                //                  cos az = 0.5 swings it 30° off that axis in z — the
                //                  "slightly rotated" part: dead-on, the slit wall would
                //                  eclipse the detector completely; at 30° the detector's
                //                  own hit map shows PAST the barrier edge, partially, which
                //                  is exactly the invitation to orbit.
                //   elevation -18 → sin el < 0 ⇒ a smaller world y = ABOVE the beam plane
                //                  (y-down): a gentle look down onto it, so the slit plate
                //                  and the tunnels read as solids rather than edge-on lines.
                //   distance 480  → the full 256-px working length and the 400-px canvas
                //                  height inside the fixed 50° vertical FOV, with the
                //                  quanta streaming through the slits still legible. It
                //                  frames the working length, so it is re-derived with the
                //                  geometry — and by MEASUREMENT (project the scene's
                //                  bounding box through the camera basis and read the frame
                //                  fill: 480 gives max|ndc| 0.851), never by scaling the
                //                  span, which over-corrects because the working length runs
                //                  mostly ALONG the view direction and foreshortens.
                //   roll +90     → the SLIT-SEPARATION AXIS onto the screen HORIZONTAL.
                //                  Derived from the scene like the rest, and forced by a
                //                  constraint 2D imposes on 3D: 2D has only x and y, so with
                //                  the beam on x the ONLY transverse axis available is y —
                //                  the slits MUST split along y and the fringes MUST spread
                //                  along y. 3D reuses that one setup (2D≡3D is this rung's
                //                  headline), so it inherits a floor-to-ceiling wall with the
                //                  detector eclipsed behind it. No orbit parameter can fix
                //                  that: `elevation` moves the eye along ±y, which is the
                //                  slit-separation axis itself, so "getting above it" slides
                //                  the eye ALONG the pattern instead of over the wall. ROLL is
                //                  the missing degree of freedom — it turns the VIEWER about
                //                  the beam axis, leaving the world untouched, and lands world
                //                  y (fringe spread) on the screen horizontal and world z (the
                //                  corridor extrusion) on the vertical: a WIDE, low plate with
                //                  the two slots SIDE BY SIDE and the fringes reading as bands
                //                  left-to-right — the textbook DSE picture. The plate's
                //                  on-screen bounding box goes 182×648 (tall) → 648×182 (wide);
                //                  the framing is otherwise IDENTICAL, since a roll moves
                //                  neither the eye nor the radius.
                //                  THE SIGN is the visually approved one. Measured through
                //                  `_orbitCameraBasis` at this exact pose (detector plate
                //                  corners, 600×600): at roll +90 the low-y corner projects to
                //                  screen-x 20.9 px and the high-y corner to 633.0 px (+y →
                //                  RIGHT); at roll −90 they land at 579.1 px and −33.0 px
                //                  (+y → LEFT). Both are equally "wide".
                //   preset: null — deliberately NOT a named preset. `setPreset` is a FULL
                //                  framing reset: it forces `target: null` (and now `roll: 0`),
                //                  which is exactly what makes the preset buttons the reliable
                //                  way back — and exactly why they cannot express this pose,
                //                  whose whole point is the scene-derived `target` above.
                // NOT a compensator: the former azimuth:38 papered over a renderer defect
                // (a ferried canvas drawn with a y-up UV assumption in the y-down world,
                // on a single-sided plane), fixed at the root — orientation is derived in
                // world space and both broad faces carry the map, so every orbit is now
                // equally correct. This pose is a CHOICE about what to show first.
                renderState: {
                    renderer: 'three',
                    camera: {
                        orbit: { azimuth: -60, elevation: -18, distance: 546, roll: 90,
                                 target: { x: 177.5, y: 200, z: 0 } },
                        preset: null
                    }
                }
            },
            { id: '2d', label: '2D' }
        ]
    },
    {
        id:    'dse-photoelectric',
        title: 'Photoelectric',
        group: 'DSE',
        prose: 'The photoelectric effect as absorb/re-emit: an incoming light stream charges an ' +
               'ABSORBING wall — it fills to capacity (watch the stored bar plateau) and radiates ' +
               'lower-dimension quanta out its back, mass exactly conserved. A live chart shows the ' +
               'wall\'s charge ledger (stored / absorbed / radiated); a second Detector Screen behind ' +
               'the wall counts the radiated photoelectrons as they emerge past it. Incoming light ' +
               'charges the wall, radiated quanta appear beyond it and get counted — the current ' +
               'absorb/radiate drip (the emergent-probability threshold comes later).',
        source: 'scenes/dse-photoelectric.js'
    },
    // ── The canonical-leg pair (CEO 2026-08-03). The competence baseline: no
    //    barrier, no slits, the plate ON the leg the ring formula was written for,
    //    and the graph a DSE researcher actually looks at first. 2D only — one
    //    declared world each, no mode strip (a physics variant is a recipe
    //    declaration, never a mode).
    {
        id:    'dse-one-emitter',
        title: 'One Emitter at the Canonical Leg',
        group: 'DSE',
        prose: 'ONE point source, nothing between it and the plate, and the plate placed at the ' +
               'axial leg D = λ_eff/4 — the leg the published ring formula r_m = (λ/4)·√((2m+1)²+1) ' +
               'was written for, where the "+1" under the root IS the (λ/4)² axial term. At that leg ' +
               'the pattern crosses the wall at TWO points, one above and one below the source, each ' +
               'a quarter-wavelength out: the count-by-y chart standing behind the wall should show a ' +
               'band PAIR at y = 120 and y = 280 on the 600×400 stage, with a sharp minimum just ' +
               'inside each and a flat plateau between them. The plate COUNTS WITHOUT ABSORBING ' +
               '(preset transparent-probe), so the reading is the density at the plate plane rather ' +
               'than a first-arrival caustic, and the quanta fly on to a far-edge sink. λ = 320 px is ' +
               'chosen for resolution: the dip-to-peak structure is 0.025λ wide, so a shorter ' +
               'wavelength would smear it into a hump on this stage. The light is yellow because its ' +
               'fullness is 0.3125 — derived, never forced.',
        source: 'scenes/dse-one-emitter.js',
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    },
    {
        id:    'dse-two-emitters',
        title: 'Two Emitters at the Canonical Leg',
        group: 'DSE',
        prose: 'The SAME apparatus with a SECOND point source, separated from the first by exactly ' +
               'd = λ_eff/2 — the strongest-coupling case, since two sources reinforce when their ' +
               'separation is a multiple of λ/2 and the coupling falls as (λ/d)². The plate stays at ' +
               'the same leg D = λ_eff/4 from the emitter plane, with the same chart registered to it. ' +
               'Because each source lays its own band a quarter-wavelength above and below itself, and ' +
               'the two sources sit a half-wavelength apart, source 1\'s LOWER band and source 2\'s ' +
               'UPPER band land on the SAME line — the midline y = 200, equidistant from both ' +
               'emitters. So the chart should show a CENTRAL peak where the one-emitter rung has none, ' +
               'flanked by the two outer bands at y = 40 and y = 360. That contrast — no centre with ' +
               'one source, a doubly-reinforced centre with two — is the whole claim, and it is one ' +
               'glance at two graphs.',
        source: 'scenes/dse-two-emitters.js',
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    },
    {
        id:    'dse-two-slits',
        title: 'Two Slits at the Canonical Leg',
        group: 'DSE',
        prose: 'The SAME apparatus as "Two Emitters at the Canonical Leg", but the two point ' +
               'sources are SLIT EXITS in an opaque barrier rather than two free emitters. ONE ' +
               'emitter sits behind the barrier and lights BOTH slits; each slit is a directed ' +
               'Tunnel channel whose exit gate is COLLAPSED and PHASE-RESET, so the mouth stands ' +
               'in for a phase-locked point source at exactly the slit\'s own y — the same ' +
               '"configured emitter" composition dse-tunnel-rebuild uses. The slit centres sit at ' +
               'the identical y = 120 and y = 280 the two-emitter rung used, separated by the same ' +
               'd = λ_eff/2, and the plate sits at the identical leg D = λ_eff/4 — now measured from ' +
               'the slit exit plane, this apparatus\'s new source plane. If the slit is a faithful ' +
               'point source, the two rungs must draw the SAME picture: a central peak at y = 200 ' +
               '(source 1\'s lower band and source 2\'s upper band coincide there) flanked by outer ' +
               'bands at y = 40 and y = 360.',
        source: 'scenes/dse-two-slits.js',
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    },
    {
        id:    'dse-one-slit',
        title: 'One Slit at the Canonical Leg',
        group: 'DSE',
        prose: 'The companion arm to "Two Slits at the Canonical Leg": the IDENTICAL apparatus ' +
               '(same emitter, same barrier, same slit-1 aperture at y=120, same leg D, same ' +
               'plate, same chart) with the SECOND slit walled off — one aperture instead of two. ' +
               'A slit exit is a phase-locked point source at its own y, so with only slit 1 open ' +
               'the surviving population is governed by ONE source at y=120: its own ring ladder ' +
               'predicts bands at y=40, y=200, and y=360 (the same three y positions the two-slit ' +
               'rung shows), not a single broad structureless lobe centred on the open slit. This ' +
               'is the actual double-slit claim — presence and position of structure from purely ' +
               'stochastic, non-interacting particles — read as one glance between the two charts.',
        source: 'scenes/dse-one-slit.js',
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    },

    // ── Impossible things — the front-page scenes that were experiment pages (each a sketch
    //    file composing the SAME objects, params and seed as the page it replaced).
    {
        id:    'blackbody',
        title: 'Blackbody Radiation',
        group: 'Impossible things',
        prose: 'A cavity of absorbing walls held at a target number of quanta by its own thermostat. ' +
               'Leaves collide and merge into parent frames; a frame\'s fullness is its frequency, so ' +
               'what leaks out of the slit is a spectrum of frame sizes. The Planck-like curve emerges ' +
               'from collisions — no energy quanta assumed.',
        source: 'scenes/blackbody.js'
    },
    {
        id:    'circuit-sat',
        title: 'Circuit SAT: Half-Adder',
        group: 'Impossible things',
        prose: 'Two laser inputs drive rail traces into an XOR gate (SUM) and an AND gate (CARRY). A ' +
               'gate\'s valve opens only when its two input ammeters read its logic, so the circuit ' +
               'settles onto the half-adder\'s answer, read as the current on each grounded readout. ' +
               'No search algorithm runs.',
        source: 'scenes/circuit-sat.js'
    },
    {
        id:    'big-bang',
        title: 'Big Bang',
        group: 'Impossible things',
        prose: 'One radial burst of leaves with no initial momentum, in a world that generates parent ' +
               'frames top-down. The uniform field clumps into filaments and voids with no gravity law ' +
               'and no cosmological constant.',
        source: 'scenes/big-bang.js'
    },
    {
        id:    'atomic-model',
        title: 'Atomic Model',
        group: 'Impossible things',
        prose: 'Forty-eight quarks in a proton frame, the proton and one electron in a stationary atom ' +
               'frame. Each parent\'s compress pulls its children one pixel toward its centre each tick, ' +
               'so the structure binds and holds with no force law and no quantum numbers.',
        source: 'scenes/atomic-model.js'
    },
    {
        id:    'collision-matrix-3d',
        title: '3D Collisions Lab',
        group: 'Impossible things',
        prose: 'Seven head-on lanes of equal-mass voxel pairs at seven depths, from feather-light to ' +
               'rigid. Density sets how hard the bodies are; contact is identical on every axis. The ' +
               'same engine that makes light makes mechanics.',
        source: 'scenes/collision-matrix-3d.js',
        renderState: { renderer: 'three' }
    },
    {
        id:    'smoking-gun',
        title: 'Smoking Gun',
        group: 'Smoking Gun',
        prose: 'A gun fires and the smoke emerges. Your challenge: make the bullet self-propelled.',
        source: 'scenes/smoking-gun.js',
        // A side profile centred on the muzzle (az 180: barrel +X reads screen-right), and the
        // archived Full look halved, rays from the fundamental layer only.
        renderState: {
            renderer: 'three',
            camera: { orbit: { azimuth: 180, elevation: 8, distance: 480, target: { x: 300, y: 300, z: 0 } },
                      preset: null },
            render: renderRowsFromBag({ glowIntensity: 0.6, godrays: 0.5, godrayDensity: 0.8,
                                        godraySource: 'leaf', heat: 0.2, smoke: 0 })
        }
    }
];

// ── The mode contract (S3/W2, CEO-ratified 2026-07-26) ───────────────────────

/**
 * walkthroughModes(rung) — the rung's declared mode list, ALWAYS an array.
 * A rung without `modes` is single-mode: `[]` (the caller renders no UI and
 * loads the base renderState). This is the ONE reader of the raw field.
 * @param {object} rung
 * @returns {Array<{id:string,label:string,renderState?:object}>}
 */
export function walkthroughModes(rung) {
    return (rung && Array.isArray(rung.modes)) ? rung.modes : [];
}

/**
 * walkthroughGroup(rung) — the rung's LAB GROUP label, always a string.
 *
 * The ONE reader of the raw `group` field AND the ONE owner of the default label
 * a rung that declares none falls into. Every surface that renders the rungs in
 * groups (the STUDIO dropdown, the sdk showcase gallery) ferries THIS — spelling
 * `rung.group || 'Light Lab'` at a call site is the schema-mirror anti-pattern
 * (rename the default in one place and the other surface silently splits the
 * group in two).
 *
 * @param {object} rung — a WALKTHROUGH entry.
 * @returns {string}
 */
export function walkthroughGroup(rung) {
    return (rung && typeof rung.group === 'string' && rung.group.length > 0)
        ? rung.group : 'Light Lab';
}

/**
 * defaultWalkthroughModeId(rung) — the rung's DEFAULT mode id (the first declared
 * entry), or null for a single-mode rung.
 * @param {object} rung
 * @returns {string|null}
 */
export function defaultWalkthroughModeId(rung) {
    var modes = walkthroughModes(rung);
    return modes.length > 0 ? modes[0].id : null;
}

/**
 * effectiveRenderState(rung, modeId) — THE ONE derivation point for "what
 * renderState does this rung load in this mode".
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * Merges the selected mode entry's `renderState` DELTA over the rung's base
 * `renderState` and returns the NORMALIZED bag (`normalizeSavedRenderState`
 * shape) the walkthrough load path already ferries. Merge rules:
 *   - scalar/object keys (renderer, seed, camera, backdropVisible, …):
 *     the mode entry WINS when it declares the key;
 *   - `render` (the ordered setRenderOption rows): base rows THEN mode rows —
 *     a concat, so a mode row applied later naturally overrides a base row with
 *     the same key (the same last-write-wins the replay already has).
 *
 * `modeId` may be null/undefined → the rung's DEFAULT mode (first entry), or the
 * bare base bag for a single-mode rung.
 *
 * FAIL-LOUD: an undeclared `modeId` THROWS, naming the rung and its declared
 * list. There is deliberately NO silent default-to-first for an unknown id — a
 * stale mode id must surface, not quietly load the wrong scene.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * A renderState carries ZERO physics: it selects the renderer, the seed and the camera.
 * The SCENE's world (and so its dimensionality) is its own co-init call, not here.
 *
 * @param {object} rung — a WALKTHROUGH entry.
 * @param {string|null} [modeId] — a declared mode id, or null for the default.
 * @returns {object} the normalized renderState bag.
 */
export function effectiveRenderState(rung, modeId) {
    var modes = walkthroughModes(rung);
    var entry = null;
    if (modeId === undefined || modeId === null) {
        entry = modes.length > 0 ? modes[0] : null;
    } else {
        for (var i = 0; i < modes.length; i++) {
            if (modes[i].id === modeId) { entry = modes[i]; break; }
        }
        if (!entry) {
            throw new Error('[walkthrough] rung "' + (rung && rung.id) + '" has no mode "' +
                modeId + '" — declared modes: [' +
                modes.map(function (m) { return m.id; }).join(', ') +
                ']. (FAIL-LOUD.)');
        }
    }
    var base  = (rung && rung.renderState) || {};
    var delta = (entry && entry.renderState) || {};
    var merged = Object.assign({}, base, delta);
    // `render` is an ORDERED apply-list, not a scalar: concat rather than replace.
    var baseRender  = Array.isArray(base.render)  ? base.render  : [];
    var deltaRender = Array.isArray(delta.render) ? delta.render : [];
    if (baseRender.length || deltaRender.length) {
        merged.render = baseRender.concat(deltaRender);
    }
    return normalizeSavedRenderState(merged);
}

// ── First contact (CEO 2026-07-26) ───────────────────────────────────────────

/**
 * FIRST_CONTACT_WALKTHROUGH_ID — the rung STUDIO opens on with no deep link.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * The ONE authority for "what does a newcomer see when they open the IDE". It is
 * a `walkthrough:<id>` selection value, so `AuthorView` loads it through the SAME
 * dropdown path a user click takes — no second boot branch, no template id to keep
 * in sync. Validated at module load (below): a typo fails loud immediately rather
 * than silently landing on a blank canvas.
 *
 * ── Layer 2: what it shows ───────────────────────────────────────────────────
 * The double-slit rebuilt on the Tunnel object, in its DEFAULT (3D) mode: the
 * camera stands behind the emitter looking obliquely at the slit wall, and the
 * interference pattern builds on the detector plate while you watch. This is
 * PRODUCT INTENT — the first thing FRQTL shows is its signature experiment, framed
 * so the pattern is already forming and the camera is obviously yours to move.
 *
 * @type {string}
 */
export var FIRST_CONTACT_WALKTHROUGH_ID = 'dse-tunnel-rebuild';

/**
 * walkthroughById(id) — id → rung, or null. The ONE resolver every consumer of a
 * declared rung id (first contact, a deep link) ferries instead of
 * re-writing `WALKTHROUGH.find(...)` at each call site.
 * @param {string} id
 * @returns {object|null}
 */
export function walkthroughById(id) {
    for (var i = 0; i < WALKTHROUGH.length; i++) {
        if (WALKTHROUGH[i].id === id) { return WALKTHROUGH[i]; }
    }
    return null;
}

// FAIL-LOUD at module load for EVERY declared-id constant: a retirement that
// orphans one of these must break here, loudly, at import time — never silently
// downstream where a dead id turns into a blank stage or a self-embed.
[['FIRST_CONTACT_WALKTHROUGH_ID', FIRST_CONTACT_WALKTHROUGH_ID]
].forEach(function (pair) {
    if (!walkthroughById(pair[1])) {
        throw new Error('[walkthrough] ' + pair[0] + ' "' + pair[1] +
            '" is not a declared rung — declared ids: [' +
            WALKTHROUGH.map(function (r) { return r.id; }).join(', ') + ']. (FAIL-LOUD.)');
    }
});

// ── is3D normalization (E-W0a, CEO 2026-07-23; mode-aware S3/W2) ─────────────
// STUDIO must read ONE `is3D` field for a selection regardless of whether it came
// from the gallery registry (experiments.js `is3D`) or a walkthrough rung. A rung's
// 3D-ness is ALREADY declared by its (possibly mode-merged) `renderState.renderer` —
// three IS the 3D renderer, the ONE display fact the load path threads — so `is3D` here is
// DERIVED through `effectiveRenderState` for the rung's DEFAULT mode, never a
// hand-typed second source that could drift (schema-mirror kill). Stamped once at
// module load so every consumer sees the uniform field.
WALKTHROUGH.forEach(function (rung) {
    rung.is3D = effectiveRenderState(rung, null).renderer === 'three';
});

/**
 * walkthroughIs3D(id, modeId) — the ONE mount-time 3D predicate for a walkthrough
 * rung, the peer of experiments.js `experimentIs3D`. Derived through
 * `effectiveRenderState` (the single derivation point) for the given mode, or the
 * rung's default mode when `modeId` is omitted. Returns false for an unknown id;
 * THROWS (via effectiveRenderState) for a known id with an undeclared mode.
 * @param {string} id — a rung id (the `walkthrough:<id>` selection value).
 * @param {string|null} [modeId] — a declared mode id, or null for the default.
 * @returns {boolean}
 */
export function walkthroughIs3D(id, modeId) {
    for (var i = 0; i < WALKTHROUGH.length; i++) {
        if (WALKTHROUGH[i].id === id) {
            return effectiveRenderState(WALKTHROUGH[i], modeId).renderer === 'three';
        }
    }
    return false;
}
