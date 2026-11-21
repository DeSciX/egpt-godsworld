/* Copyright 2023-2026 by Essam Abadir */

/**
 * three-camera-contract.js — the three.js camera's DECLARATIVE contract: the
 * view PRESETS and the POSE AXES its `getCameraControl()` handle publishes.
 *
 * ## Why this is its own file
 *
 * It is the pure, declarative half of the camera authority: two functions of
 * `(width, height)` returning plain data, with no THREE, no WebGL, and no live
 * provider state. `three-provider.js` (the live half) resolves it and publishes
 * the results on the handle as `ctl.presets` / `ctl.poseFields`; every host —
 * STUDIO's camera strip, the GYM's camera row, an experiment page's own preset
 * buttons — FERRIES those and re-lists nothing. One declaration, N consumers.
 *
 * Keeping it separate also holds `three-provider.js` under the per-file size
 * ceiling that `sdk/_build/verify-publish-surface.mjs` enforces on
 * the copied-verbatim dist directories — that gate's own instruction is to
 * SPLIT at a natural seam rather than raise the ceiling, and "declarative
 * contract vs live renderer" is that seam.
 *
 * ## Node
 *
 * Named ES-module exports, imported by `three-provider.js`; both halves of the contract are testable
 * in plain Node with no THREE instance — see
 * `lib/frqtl/compat/renderer/providers/test/camera-handle-single-source.test.mjs`,
 * which drives every assertion off these two functions.
 */

import * as FieldDescriptorSchema from '../../../../shim/field-descriptor/index.js';




    /**
     * The ONE camera-preset table — the SINGLE SOURCE for both the preset NAMES
     * and the orbit pose each name resolves to. `getCameraControl()` publishes
     * `Object.keys()` of it as `ctl.presets` and resolves `setPreset(name)`
     * through it, so a preset name is written in exactly one place in the repo.
     *
     * Three pre-computed perspectives on the canonical world frame:
     * X = down the barrel (+X = downrange, out the muzzle) · Y = vertical (grip −Y) ·
     * Z = lateral. Azimuth is measured around the vertical so az=+90 puts the camera
     * downrange (+X) looking back INTO the muzzle; az=0 puts it on +Z (side).
     *   down-barrel — DEFAULT: straight down the barrel, the bullet staring at you
     *                 (zero-momentum air is invisible). Tight distance → big bullet.
     *   table-top   — down-barrel rotated 90°: eye-level SIDE view (barrel horizontal).
     *   rooftop     — looking down ~45° in both Y and Z: aerial 3/4.
     * `distance` is relative to the scene size, so a preset frames any scene.
     *
     * @param {number} width  scene width in engine pixels
     * @param {number} height scene height in engine pixels
     * @returns {Object<string,{azimuth:number,elevation:number,distance:number}>}
     */
    function cameraPresets(width, height) {
        var base = Math.max(width, height);
        return {
            'down-barrel': { azimuth: 90, elevation: 0,  distance: base * 0.95 },
            'table-top':   { azimuth: 0,  elevation: 0,  distance: base * 1.30 },
            'rooftop':     { azimuth: 45, elevation: 45, distance: base * 1.50 }
        };
    }

    /**
     * The ONE declaration of the camera's POSE AXES — the sliders a host builds.
     *
     * Each entry is a `lib/shim/field-descriptor` descriptor (REUSED, never
     * re-derived). `name` is the `getOrbit()` / `setOrbit()` key, so a host builds
     * one slider per entry and writes back through the key it was handed: it
     * enumerates no axis and invents no range, and a newly declared axis appears
     * in every host with zero host edits.
     *
     * Bounds live HERE because they are the PROVIDER's knowledge, not a host's:
     *   azimuth   [-180, 180]° — the full turn.
     *   elevation [-90, 90]°   — pole to pole. (The hosts' old ±85 was a pole
     *                            guard hand-copied into two files.)
     *   distance  SCENE-SCALED off `base = max(width,height)` — the same base the
     *             preset table frames with: [base/3, base*4], step base/30. A host
     *             cannot compute this (it does not know the scene size), which is
     *             why the old fixed 200–2400 was a guess that happened to be right
     *             only for a 600×400 scene, where this formula reproduces it exactly.
     *   roll      [-180, 180]° — the full turn. Roll has NO pole, so its bound is a
     *             WRAP point, not a clamp: `setOrbit` wraps a roll write mod 360.
     * `default` is the factory's own start pose (azimuth 0, elevation 0 —
     * straight-on-z; distance = base*1.6, what `_init` derives from canvas size;
     * roll 0 — the horizon level).
     *
     * @param {number} width  scene width in engine pixels
     * @param {number} height scene height in engine pixels
     * @returns {Array<object>} normalized field descriptors, one per pose axis.
     */
    function cameraPoseFields(width, height) {
        var normalizeFieldDescriptor = FieldDescriptorSchema.normalizeFieldDescriptor;
        var base = Math.max(width, height);
        return [
            normalizeFieldDescriptor({
                name: 'azimuth', label: 'az', type: 'number', unit: 'deg', default: 0,
                // `wrap: 360` DECLARES the value space is periodic with that period — the
                // axis is a circle, not a segment. Consumers that must interpolate (CameraPath)
                // FERRY this instead of hand-listing which axes are angular; a new wrapping
                // axis therefore gets shortest-arc interpolation with zero consumer edits.
                // It describes the VALUE SPACE, not a storage normalisation (setOrbit wraps
                // roll's stored value; azimuth is periodic without being renormalised).
                constraint: { min: -180, max: 180, integer: false, wrap: 360 },
                widgetConfig: { step: 1 },
                description: 'Orbit angle around the vertical axis, in degrees. az=0 looks straight ' +
                    'at the x/y plane from +z; az=+90 puts the camera on +x looking back along it.'
            }),
            normalizeFieldDescriptor({
                name: 'elevation', label: 'el', type: 'number', unit: 'deg', default: 0,
                constraint: { min: -90, max: 90, integer: false },
                widgetConfig: { step: 1 },
                description: 'Orbit angle above (+) / below (−) the horizontal, in degrees. ' +
                    '±90 is straight down / straight up the vertical axis.'
            }),
            normalizeFieldDescriptor({
                name: 'distance', label: 'dist', type: 'number', unit: 'px', default: base * 1.6,
                constraint: { min: Math.round(base / 3), max: base * 4, integer: false },
                widgetConfig: { step: Math.max(1, Math.round(base / 30)) },
                description: 'Camera distance from the orbit centre, in engine pixels. Bounds are ' +
                    'relative to the scene size (base = max(width,height)) so the slider frames any scene.'
            }),
            normalizeFieldDescriptor({
                name: 'roll', label: 'roll', type: 'number', unit: 'deg', default: 0,
                constraint: { min: -180, max: 180, integer: false, wrap: 360 },
                widgetConfig: { step: 1 },
                description: 'Rotation about the view axis — the horizon tilt, in degrees. It spins ' +
                    'the picture in the screen plane without moving the eye: roll=90 puts what was ' +
                    'screen-vertical onto the screen horizontal. Unlike elevation it has NO pole, so ' +
                    'the range is a WRAP point (mod 360), never a clamp.'
            })
,
            normalizeFieldDescriptor({
                name: 'target', label: 'centre', type: 'object', unit: 'px', default: null,
                // DECLARED (2026-07-30): `target` is a fully legal settable axis of this
                // camera — `setOrbit({target})` applies it, `getOrbit()` returns it, and
                // `setPreset` pans with it. Omitting it from this list made the DECLARATION
                // disagree with the SURFACE, and anything that validates a pose against the
                // declared axes (CameraPath) therefore rejected `target` waypoints: a 3D
                // camera path could orbit but never dolly/track, which kills any path that follows
                // a moving region.
                //
                // Deliberately carries NO numeric constraint: it is a {x,y,z} POINT, not a
                // scalar. The shared `poseSliderBounds` helper returns null for a descriptor
                // with no range and both slider hosts already skip it ("incomplete range ⇒
                // hide, never a 0–100 default"), so declaring it adds an axis to the CONTRACT
                // without inventing a slider that could not work. Same shape as the 2D
                // camera's own `target` descriptor — one vocabulary, both modes.
                description: 'The world point {x,y,z} the orbit revolves around; null = the ' +
                    'scene centre. Pan/track IS target — the same key the 2D camera uses.'
            })
        ];
    }

    // ── Export ──────────────────────────────────────────────────────────────

export {
    cameraPresets,
    cameraPoseFields
};
